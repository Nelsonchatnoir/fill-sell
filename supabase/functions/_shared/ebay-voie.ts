// ═══════════════════════════════════════════════════════════════════════════
// eBay — CONNECTÉ ? UTILISABLE ? ET LE RÉ-ARMEMENT VERS LA VOIE API (2026-09-23)
// ═══════════════════════════════════════════════════════════════════════════
// Un nouvel inscrit qui publie sur eBay part par l'extension, bute sur le mur
// « REAUTH VENTE » du flux de vente, et brûle ses tentatives : il n'a jamais
// relié de compte eBay par l'API, et rien ne l'y menait. La correction amène
// ces comptes vers la voie API (34 comptes y publient, la voie fonctionne).
//
// Ce module répond à deux questions, sans jamais appeler eBay (SELECT seul), et
// porte le ré-armement automatique — même principe qu'« Autoriser Opla » :
//   · `compteEbayApiConnecte`  : y a-t-il une connexion OAuth NON révoquée ?
//   · `compteEbayApiUsable`    : le compte est-il PRÊT à publier par API —
//                                MIROIR EXACT du trigger cross_post_jobs_voie_ebay
//                                (connexion + 3 politiques + checklist verte) ;
//   · `rearmerJobsEbayConnexionSiUtilisable` : quand le compte devient
//     utilisable, les publications parquées repartent en voie='api', pending.
//
// ⛔ ON NE DÉPLACE JAMAIS LE MUR. Le ré-armement n'a lieu que si le compte est
//    réellement UTILISABLE : sinon la publication repartirait en API pour
//    buter aussitôt sur « politiques absentes ». Tant que ce n'est pas prêt,
//    le job attend en needs_user, avec son bouton « Connecte ton compte eBay ».
//
// deno-lint-ignore-file no-explicit-any

/** Le marqueur porté par un job parqué : nommé, donc mesurable et filtrable. */
export const SOURCE_EBAY_CONNEXION_REQUISE = "ebay_connexion_requise";

/** Y a-t-il une connexion API eBay NON révoquée pour ce compte ? (service_role) */
export async function compteEbayApiConnecte(admin: any, userId: string): Promise<boolean> {
  try {
    const { data } = await admin
      .from("ebay_accounts").select("revoked_at").eq("user_id", userId).maybeSingle();
    return !!data && data.revoked_at == null;
  } catch {
    // Lecture impossible : on ne conclut RIEN de « connecté ». Le doute penche
    // vers « pas de connexion » ici, mais l'appelant ne requalifie que sur une
    // signature de mur AVÉRÉE — jamais sur cette seule valeur.
    return false;
  }
}

/**
 * Le compte est-il PRÊT à publier par l'API ? Miroir mot pour mot du trigger
 * cross_post_jobs_voie_ebay (migration 20260906150000) :
 *   revoked_at IS NULL
 *   AND fulfillment_policy_id / payment_policy_id / return_policy_id NON NULL
 *   AND seller_state->>'bloque_par_etat_ebay' = 'false'
 */
export function compteEbayApiUsableDepuisLigne(a: any): boolean {
  if (!a || a.revoked_at != null) return false;
  if (!a.fulfillment_policy_id || !a.payment_policy_id || !a.return_policy_id) return false;
  const ss = a.seller_state;
  return !!ss && ss.bloque_par_etat_ebay === false;
}

export async function compteEbayApiUsable(admin: any, userId: string): Promise<boolean> {
  try {
    const { data } = await admin
      .from("ebay_accounts")
      .select("revoked_at, fulfillment_policy_id, payment_policy_id, return_policy_id, seller_state")
      .eq("user_id", userId).maybeSingle();
    return compteEbayApiUsableDepuisLigne(data);
  } catch {
    return false;
  }
}

/**
 * Ré-arme les publications eBay PARQUÉES (« Connecte ton compte eBay ») vers la
 * voie API, MAIS seulement si le compte est désormais utilisable. Rend le
 * nombre de jobs relancés. Best-effort intégral : jamais bloquant, jamais une
 * exception qui remonte. Idempotent : un compte non utilisable ne touche rien,
 * un job déjà reparti (sorti de needs_user) n'est plus candidat.
 *
 * ⛔ Garde `.eq('status','needs_user')` sur l'UPDATE : on ne réécrit jamais
 *    par-dessus un job qui aurait bougé entre-temps.
 */
export async function rearmerJobsEbayConnexionSiUtilisable(admin: any, userId: string): Promise<number> {
  try {
    if (!(await compteEbayApiUsable(admin, userId))) return 0;
    const { data: jobs } = await admin
      .from("cross_post_jobs")
      .select("id, platform_fields")
      .eq("user_id", userId)
      .eq("platform", "ebay")
      .eq("status", "needs_user")
      .limit(200);
    let n = 0;
    for (const j of (jobs ?? [])) {
      const pf0 = (j.platform_fields ?? {}) as Record<string, unknown>;
      if (String(pf0["needs_user_source"] ?? "") !== SOURCE_EBAY_CONNEXION_REQUISE) continue;
      const pf = { ...pf0 };
      delete pf["needs_user_source"]; delete pf["next_action_after"];
      delete pf["needsUserAttempts"]; delete pf["needsUserBoucle"];
      delete pf["needs_user_tick_le"]; delete pf["needs_user_actif_ms"];
      delete pf["needs_user_vu_le"]; delete pf["needs_user_vu_erreur"];
      delete pf["processing_since"];
      pf["ebay_connexion_resolue_le"] = new Date().toISOString();
      const { data: maj } = await admin
        .from("cross_post_jobs")
        .update({ status: "pending", voie: "api", error: null, platform_fields: pf })
        .eq("id", j.id).eq("status", "needs_user").select("id");
      if (maj?.length) n++;
    }
    if (n) console.log(`[ebay-voie] ${n} publication(s) eBay ré-armée(s) en voie API pour ${userId} (compte devenu utilisable)`);
    return n;
  } catch (e) {
    console.warn("[ebay-voie] ré-armement eBay non abouti :", (e as Error)?.message ?? e);
    return 0;
  }
}
