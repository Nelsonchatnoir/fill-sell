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
//                                (17/10) LA règle partagée avec l'app,
//                                etatCompteEbay (_shared/ebay-etat-compte.js) :
//                                connexion, 3 politiques RETENUES, étapes vertes,
//                                plafond de vente eBay non nul ;
//   · `rearmerJobsEbayConnexionSiUtilisable` : quand le compte devient
//     utilisable, les publications parquées repartent en voie='api', pending.
//
// ⛔ ON NE DÉPLACE JAMAIS LE MUR. Le ré-armement n'a lieu que si le compte est
//    réellement UTILISABLE : sinon la publication repartirait en API pour
//    buter aussitôt sur « politiques absentes ». Tant que ce n'est pas prêt,
//    le job attend en needs_user, avec son bouton « Connecte ton compte eBay ».
//
// deno-lint-ignore-file no-explicit-any
import { etatCompteEbay } from "./ebay-etat-compte.js";

/** Le marqueur porté par un job parqué : nommé, donc mesurable et filtrable. */
export const SOURCE_EBAY_CONNEXION_REQUISE = "ebay_connexion_requise";

/**
 * (2026-09-27) Compte RELIÉ par l'API mais pas encore prêt à vendre (politiques
 * non retenues, statut vendeur bloqué). Depuis ce jour, une publication d'un
 * compte relié part TOUJOURS en voie 'api' (trigger cross_post_jobs_voie_ebay) ;
 * ebay-api-worker la parque ici au lieu de l'envoyer buter chez eBay, et le
 * ré-armement ci-dessous la relance dès que le compte est prêt — même bouton,
 * même parcours eBay que « Connecte ton compte eBay ».
 */
export const SOURCE_EBAY_COMPTE_A_FINIR = "ebay_compte_a_finir";

/** Les sources qu'un compte devenu utilisable ré-arme vers la voie API. */
export const SOURCES_EBAY_REARMABLES = [SOURCE_EBAY_CONNEXION_REQUISE, SOURCE_EBAY_COMPTE_A_FINIR];

/** Le message montré sur une publication parquée « compte à finir ». Rien n'est parti chez eBay. */
export const MESSAGE_EBAY_COMPTE_A_FINIR =
  "Ton compte eBay est bien relié à FillSell, mais eBay ne le laisse pas encore vendre : " +
  "il reste à finir sa configuration (paiement, retours, livraison). Rien n'a été envoyé à eBay — " +
  "l'annonce partira toute seule dès que ton compte sera prêt.";

/**
 * (17/10, Fluxen) eBay refuse « Pas de retour » pour CE compte (refus 25002,
 * paramètre ReturnsAcceptedOption : vendeur professionnel, retours obligatoires).
 * Rien n'est en ligne ; la politique de retours n'est plus retenue — c'est la
 * personne qui en choisit une autre, jamais FillSell à sa place.
 */
export const MESSAGE_EBAY_RETOURS_OBLIGATOIRES =
  "eBay refuse « Pas de retour » sur ton compte : il exige que tu acceptes les retours " +
  "(c'est la règle pour les vendeurs professionnels). Dans Réglages › Compte eBay, choisis les retours acceptés : " +
  "rien n'a été mis en ligne, et l'annonce partira toute seule.";

// ── (12/10, Nico) LE LIEN DIRECT VERS CE QUI RESTE À FINIR CHEZ eBAY ─────────
// « ajoute au message le lien direct vers la page eBay où finir la
// configuration du compte vendeur ». Liens VÉRIFIÉS seulement (garde-fou Nico,
// src/utils/ebayParcours.js LIENS_EBAY, relevés le 05/09 et le 22/09) :
//   · statut vendeur bloqué par eBay (vérification d'identité, inscription) :
//     le Seller Hub, seule porte vivante (src/utils/shared.js EBAY_SELLER_HUB_URL) ;
//   · conditions de vente (paiement, retours, livraison) absentes :
//     la page des conditions de vente.
export const LIEN_EBAY_VENDEUR = "https://www.ebay.fr/sh/ovw";
export const LIEN_EBAY_CONDITIONS = "https://www.ebay.fr/bp/manage";

/**
 * Ce qui reste à finir pour une ligne ebay_accounts, et son lien — ou null (compte prêt / absent).
 * (17/10) Lu sur LA règle partagée (etatCompteEbay) :
 *   · plafond   — eBay plafonne le compte à zéro : c'est eBay, sur le compte vendeur (Seller Hub) ;
 *   · vendeur   — inscription vendeur pas finie, ou rien de relevé : Seller Hub ;
 *   · retours   — seule la politique de retours manque : à choisir dans FillSell (aucun lien eBay) ;
 *   · parcours  — le reste se règle dans FillSell (conditions qui EXISTENT chez eBay à choisir,
 *                 lieu d'expédition, activation) : aucun lien eBay ;
 *   · conditions — des conditions de vente n'existent nulle part : la page eBay (12/10, Nico).
 */
export type EtapeEbayAFinir = { etape: "plafond" | "vendeur" | "retours" | "parcours" | "conditions"; url: string | null };
// deno-lint-ignore no-explicit-any
export function etapeEbayAFinir(a: any): EtapeEbayAFinir | null {
  if (!a || a.revoked_at != null) return null;
  const e = etatCompteEbay(a);
  if (e.pret) return null;
  if (e.statut === "bloque_par_ebay") return { etape: "plafond", url: LIEN_EBAY_VENDEUR };
  if (e.statut === "inconnu" || e.etapes.inscription_vendeur === "manque") return { etape: "vendeur", url: LIEN_EBAY_VENDEUR };
  if (e.manquantes.length === 1 && e.manquantes[0] === "politique_retours") return { etape: "retours", url: null };
  const aCreerChezEbay = e.manquantes.some((c: string) => c.startsWith("politique_") && !e.aChoisir.includes(c));
  return aCreerChezEbay ? { etape: "conditions", url: LIEN_EBAY_CONDITIONS } : { etape: "parcours", url: null };
}

const QUOI_A_FINIR: Record<EtapeEbayAFinir["etape"], string> = {
  plafond: "eBay n'autorise pas encore ce compte à vendre : son plafond de vente est à zéro, et c'est eBay qui le relève, sur ton compte vendeur",
  vendeur: "eBay ne le laisse pas encore vendre : il reste à finir ton compte vendeur chez eBay (vérification ou inscription vendeur)",
  retours: "il reste à choisir, dans Réglages › Compte eBay, si tu acceptes les retours",
  parcours: "il reste à finir son réglage dans FillSell : ouvre Réglages › Compte eBay, l'étape qui reste y est indiquée",
  conditions: "eBay ne le laisse pas encore vendre : il reste à créer tes conditions de vente chez eBay (paiement, retours, livraison)",
};

/** Le message « compte à finir », avec l'étape nommée et, s'il y en a un, son lien direct. */
export function messageEbayCompteAFinir(etape: EtapeEbayAFinir | null): string {
  if (!etape) return MESSAGE_EBAY_COMPTE_A_FINIR;
  const quoi = QUOI_A_FINIR[etape.etape] ?? QUOI_A_FINIR.parcours;
  const suite = "n'a été envoyé à eBay, et l'annonce partira toute seule dès que ton compte sera prêt.";
  return etape.url
    ? `Ton compte eBay est bien relié à FillSell, mais ${quoi}. C'est ici : ${etape.url} — rien ${suite}`
    : `Ton compte eBay est bien relié à FillSell, mais ${quoi}. Rien ${suite}`;
}

/** L'état du compte en UNE lecture : utilisable, et sinon ce qui reste à finir. (service_role) */
// deno-lint-ignore no-explicit-any
export async function etatCompteEbayApi(admin: any, userId: string): Promise<{ usable: boolean; aFinir: EtapeEbayAFinir | null }> {
  try {
    const { data } = await admin
      .from("ebay_accounts")
      .select("revoked_at, fulfillment_policy_id, payment_policy_id, return_policy_id, seller_state")
      .eq("user_id", userId).maybeSingle();
    return { usable: compteEbayApiUsableDepuisLigne(data), aFinir: etapeEbayAFinir(data) };
  } catch {
    return { usable: false, aFinir: null };
  }
}

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
 * Le compte est-il PRÊT à publier par l'API ? (17/10) LA règle partagée avec
 * l'app (etatCompteEbay, _shared/ebay-etat-compte.js) : relié, 3 politiques
 * RETENUES, étapes vertes, et plafond de vente eBay non nul — zéro en quantité
 * OU en montant, eBay n'autorise pas ce compte à vendre : on parque AVANT tout
 * appel. Le trigger cross_post_jobs_voie_ebay ne décide plus de la préparation
 * depuis le 27/09 (relié = voie API, prêt ou non).
 */
export function compteEbayApiUsableDepuisLigne(a: any): boolean {
  if (!a || a.revoked_at != null) return false;
  return etatCompteEbay(a).pret;
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
      if (!SOURCES_EBAY_REARMABLES.includes(String(pf0["needs_user_source"] ?? ""))) continue;
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
