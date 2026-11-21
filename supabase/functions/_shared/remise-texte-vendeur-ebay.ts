// ═══════════════════════════════════════════════════════════════════════════
// LE TEXTE DU VENDEUR REMIS SUR UNE ANNONCE eBAY EN LIGNE, SUR PLACE — le cœur (21/11/2026, ordres de Nico, points 3 et 4)
// ═══════════════════════════════════════════════════════════════════════════
// Une annonce eBay publiée par l'API avec une description RÉDIGÉE PAR L'IA parce que le texte du vendeur n'avait pas été
// lu reçoit, UNE FOIS le vrai texte lu sur la fiche, ce texte : même numéro, vues et favoris gardés, ni retrait, ni
// republication, ni quota, ni mail. Règles (même modèle que remise-ordre-photos-ebay, 06/11) :
//   · rien tant que la fiche n'a pas un VRAI texte lu APRÈS la copie (marqueur daté, jamais « à relire », jamais une
//     référence « $17b », deux mots au moins) — « texte_pas_encore_lu » (lecture de la base seule, aucun appel à eBay) ;
//   · l'annonce relue en ligne : elle reprend déjà ce texte → « deja_bon » ; elle n'est plus la copie de notre dépôt
//     (changée par la personne depuis FillSell) → on n'y touche JAMAIS (« different_du_depot ») ;
//   · seule la DESCRIPTION change (article et offre), rien d'autre.
// Appelants : la fonction remise-texte-vendeur-ebay (clé de service, une annonce, simulation par défaut) et, depuis le
// 21/11 midi (point 4 de Nico : « la correction doit partir TOUTE SEULE dès que ses fiches sont relues »), l'entretien
// borné d'ebay-api-worker sur les tâches marquées `platform_fields.texte_vendeur_a_remettre` (scripts de réparation).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { lireEnvEbay, obtenirAccessToken } from "./ebay-oauth.ts";
import { lireAnnonceEbay, modifierAnnonceEbay } from "./ebay-modifier-annonce.ts";
import { copieReprendLeTexte, texteVendeurLuApres } from "./contenu-fiche.js";
import { REMISE_TEXTE_PAR_PASSE, REMISE_TEXTE_LUES_PAR_PASSE, suiteRemiseTexte } from "./remise-texte-suite.js";
export { REMISE_TEXTE_PAR_PASSE, REMISE_TEXTE_LUES_PAR_PASSE, REMISE_TEXTE_ESSAIS_MAX, REMISE_TEXTE_EXPIRE_MS, suiteRemiseTexte } from "./remise-texte-suite.js";

export type RemiseTexte = { ok: boolean; verdict?: string; motif?: string; message?: string; simulation?: boolean;
  changements?: string[]; listing_id?: string; en_ligne?: string; texte?: string; detail?: string };

export async function remettreTexteVendeurEbay(admin: SupabaseClient, jobId: string, { executer = false, par = "FillSell (texte du vendeur remis, 21/11)" }: { executer?: boolean; par?: string } = {}): Promise<RemiseTexte> {
  const { data: j } = await admin.from("cross_post_jobs")
    .select("id, user_id, inventaire_id, platform, voie, status, description, created_at, platform_fields").eq("id", jobId).maybeSingle();
  const pf = { ...((j?.platform_fields as Record<string, unknown> | null) ?? {}) };
  const api = (pf.ebay_api ?? {}) as Record<string, unknown>;
  const ids = { sku: String(api.sku ?? ""), offerId: String(api.offer_id ?? ""), listingId: String(api.listing_id ?? "") };
  if (!j || j.platform !== "ebay" || j.voie !== "api" || j.status !== "published" || !ids.sku || !ids.offerId || j.inventaire_id == null) {
    return { ok: false, motif: "pas_une_annonce_api_publiee" };
  }
  const { data: fiche } = await admin.from("inventaire").select("description, attributs").eq("id", j.inventaire_id).eq("user_id", j.user_id).maybeSingle();
  const texte = texteVendeurLuApres(fiche as Record<string, unknown> | null, String(j.created_at)) as string | null;
  if (!texte) return { ok: true, verdict: "texte_pas_encore_lu", detail: "le vrai texte du vendeur n'est pas encore lu sur la fiche : rien n'est touché" };

  const jeton = await obtenirAccessToken(admin, String(j.user_id));
  if (!jeton.ok) return { ok: false, motif: `jeton_${jeton.motif}` };
  const env = lireEnvEbay();
  const lu = await lireAnnonceEbay(env, jeton.token as string, ids);
  if (!lu.ok) return { ok: false, motif: lu.motif, message: lu.message };
  const enLigne = String(lu.annonce.description ?? "");
  const verdict = copieReprendLeTexte(enLigne, texte) ? "deja_bon"
    : copieReprendLeTexte(enLigne, String(j.description ?? "")) ? "texte_a_remettre"
    : "different_du_depot";
  const trace = { le: new Date().toISOString(), verdict, executer };
  console.log(`[remise-texte-vendeur-ebay] job=${jobId.slice(0, 8)} annonce=${ids.listingId} → ${verdict}${executer ? "" : " (simulation)"}`);
  if (verdict !== "texte_a_remettre" || !executer) return { ok: true, verdict, simulation: !executer, en_ligne: enLigne.slice(0, 300), texte: texte.slice(0, 300) };

  const r = await modifierAnnonceEbay(env, jeton.token as string, ids, { description: texte });
  console.log(`[remise-texte-vendeur-ebay] job=${jobId.slice(0, 8)} annonce=${ids.listingId} → modifier : ${r.ok ? `ok (${r.changements.join(", ")})` : r.motif}`);
  if (!r.ok) return r as RemiseTexte;
  const modifs = Array.isArray(pf.modifications_ebay) ? (pf.modifications_ebay as unknown[]).slice(-9) : [];
  const { texte_vendeur_a_remettre: _marque, ...reste } = pf;
  const { error } = await admin.from("cross_post_jobs").update({
    description: texte,
    platform_fields: { ...reste, texte_vendeur_remis: trace,
      modifications_ebay: [...modifs, { le: trace.le, champs: r.changements, par }] },
  }).eq("id", jobId).eq("status", "published");
  if (error) console.warn(`[remise-texte-vendeur-ebay] texte remis chez eBay, tâche non mise à jour — ${error.message}`);
  return { ok: true, verdict, changements: r.changements, listing_id: r.listing_id };
}

// ── (21/11/2026 midi, point 4 de Nico) L'ENTRETIEN AUTOMATIQUE (ebay-api-worker) ────────────────────────────────────────────
// Une passe sur cinq (minute % 10 < 2), 3 tâches marquées au plus, la plus ancienne demande d'abord. Le texte pas encore lu :
// AUCUNE écriture (la ligne n'est pas réécrite), la demande attend. Remis / déjà bon / changé par la personne : la marque part,
// le verdict reste noté. Une panne (jeton, lecture, modification) : un essai de plus, la marque reste ; au 6e, « abandon ».
// Une demande de plus de 30 jours sans texte lu : « expiree ». Jamais bloquant pour la file des publications.
export async function remettreTextesVendeurEbay(admin: SupabaseClient, maintenant = Date.now()): Promise<Record<string, unknown>> {
  if (new Date(maintenant).getUTCMinutes() % 10 >= 2) return { lues: 0 };
  const { data, error } = await admin.from("cross_post_jobs")
    .select("id, platform_fields")
    .eq("platform", "ebay").eq("voie", "api").eq("status", "published")
    .not("platform_fields->texte_vendeur_a_remettre", "is", null)
    .order("created_at", { ascending: true }).limit(REMISE_TEXTE_LUES_PAR_PASSE);
  if (error) return { erreur: error.message };
  const lot = (data ?? []) as Array<{ id: string; platform_fields: Record<string, unknown> | null }>;
  if (!lot.length) return { lues: 0 };
  const issues: Record<string, number> = {};
  // (21/11/2026 13:20) Les fiches pas encore lues ne coûtent que deux lectures de la base : elles ne comptent pas dans les 3
  // passages chez eBay — sinon les 3 plus anciennes, encore à relire, masqueraient la 4e pour toujours (vu au 1er passage).
  let chezEbay = 0;
  for (const j of lot) {
    if (chezEbay >= REMISE_TEXTE_PAR_PASSE) break;
    const marque = (j.platform_fields?.texte_vendeur_a_remettre ?? null) as Record<string, unknown> | null;
    let r: RemiseTexte;
    try { r = await remettreTexteVendeurEbay(admin, j.id, { executer: true, par: "FillSell (texte du vendeur remis tout seul)" }); }
    catch (e) { r = { ok: false, motif: `exception: ${String((e as Error)?.message ?? e).slice(0, 120)}` }; }
    const cle = r.verdict ?? r.motif ?? "?";
    issues[cle] = (issues[cle] ?? 0) + 1;
    if (r.verdict !== "texte_pas_encore_lu") chezEbay += 1;
    const s = suiteRemiseTexte(marque, r, maintenant);
    if (!s) continue;
    // Relue : la remise réussie a déjà retiré la marque (et noté texte_vendeur_remis) — on ne réécrit que ce qui change.
    const { data: lu } = await admin.from("cross_post_jobs").select("platform_fields").eq("id", j.id).maybeSingle();
    const pf = { ...((lu?.platform_fields as Record<string, unknown> | null) ?? {}) };
    if (!("texte_vendeur_a_remettre" in pf) && !s.garder) continue;
    const { texte_vendeur_a_remettre: _m, ...reste } = pf;
    const patch = s.garder ? { ...reste, texte_vendeur_a_remettre: s.marque } : { ...reste, texte_vendeur_verdict: s.verdict };
    await admin.from("cross_post_jobs").update({ platform_fields: patch }).eq("id", j.id).eq("status", "published");
  }
  return { lues: lot.length, issues };
}
