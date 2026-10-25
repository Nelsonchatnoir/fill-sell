// ═══════════════════════════════════════════════════════════════════════════
// « HORS LIGNE SANS RECRÉATION » SEULEMENT QUAND RIEN N'EST PARTI, OU QUE LA RELECTURE N'A RIEN TROUVÉ (26/10 nuit, point 2b)
// ═══════════════════════════════════════════════════════════════════════════
// Cas : nerema75, job 259e97c8 (Vinted, « Le roman des filles T1 »). La une-passe a retiré ET renvoyé l'annonce à
// 19:44 ; le worker de l'extension a disparu avant la confirmation ; handler-watch a écrit à 20:15 « hors ligne sans
// recréation » (mail au support) — l'annonce était déjà en ligne (relue à 20:27, sans doublon). L'alerte ne regardait
// que l'âge du retrait (> 30 min). Sur 14 jours, 11 alertes sur 15 (Vinted) tombaient sur une copie déjà en ligne.
// RÈGLE (le mail au support, et la phrase « Reprise après interruption » à la personne) :
//   · rien n'est parti depuis le retrait → l'alerte, comme avant (une vraie orpheline : Sébastien, Beebs) ;
//   · un envoi est parti → pas d'alerte tant qu'aucune relecture POSTÉRIEURE à cet envoi n'a dit « pas de copie » ;
//     relu sans copie et rien renvoyé depuis 30 min → l'alerte ;
//   · borne : envoi parti, jamais relu depuis 6 h → l'alerte « remise en ligne non vérifiée » (jamais une attente
//     sans fin).
// Pur (Deno + Node). Testé par scripts/alerte-orpheline-selftest.mjs.
import { retraitLe, dernierEssai } from "./recreation-vinted-verifiee.js";

export const ALERTE_APRES_RETRAIT_MS = 30 * 60_000;
export const ALERTE_APRES_RELECTURE_MS = 30 * 60_000;
export const ALERTE_ENVOI_NON_VERIFIE_MS = 6 * 3600_000;

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };

/** Un envoi de la nouvelle annonce est-il parti depuis le retrait ? → son heure (ms), ou NaN. */
export function envoiDepuisLeRetrait(pf) {
  const retrait = retraitLe(pf);
  const essai = dernierEssai(pf);
  if (!Number.isFinite(essai)) return NaN;
  // La une-passe retire et renvoie dans le même geste : son essai porte l'heure du retrait (2 s de jeu d'horloge).
  if (Number.isFinite(retrait) && essai < retrait - 2_000) return NaN;
  return essai;
}

/** Une relecture POSTÉRIEURE à l'envoi a-t-elle dit « aucune copie » ? → son heure (ms), ou NaN. */
export function relectureSansCopie(pf, envoi) {
  const p = objet(pf) ?? {};
  const pr = objet(objet(p.gardes)?.prevol_recreation);
  const tPr = pr && pr.verdict === "a_recreer" ? ms(pr.at) : NaN;
  const rv = objet(p.recreation_verifiee);
  const tRv = rv && /^aucune/.test(String(rv.verdict ?? "")) ? ms(rv.le ?? rv.apres) : NaN;
  const t = [tPr, tRv].filter((x) => Number.isFinite(x) && x > envoi);
  return t.length ? Math.max(...t) : NaN;
}

/**
 * L'alerte « hors ligne sans recréation » est-elle due pour ce job (republication à l'étape 'deleted') ?
 * @returns {{ due: boolean, motif: "sans_envoi"|"relu_sans_copie"|"envoi_non_verifie"|"envoi_parti"|"trop_tot"|"sans_retrait" }}
 */
export function alerteOrphelineDue(pf, maintenant = Date.now()) {
  const retrait = retraitLe(pf);
  if (!Number.isFinite(retrait)) return { due: false, motif: "sans_retrait" };
  if (maintenant - retrait < ALERTE_APRES_RETRAIT_MS) return { due: false, motif: "trop_tot" };
  const envoi = envoiDepuisLeRetrait(pf);
  if (!Number.isFinite(envoi)) return { due: true, motif: "sans_envoi" };
  const relu = relectureSansCopie(pf, envoi);
  if (Number.isFinite(relu) && maintenant - Math.max(relu, envoi) >= ALERTE_APRES_RELECTURE_MS) return { due: true, motif: "relu_sans_copie" };
  if (maintenant - envoi >= ALERTE_ENVOI_NON_VERIFIE_MS) return { due: true, motif: "envoi_non_verifie" };
  return { due: false, motif: "envoi_parti" };
}
