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
 * (28/10 soir, Nico — Sébastien, recrutementgroupezk704, boncoin59300) Une SUPPRESSION ENVOYÉE jamais prouvée laisse
 * l'étape à 'captured' : l'annonce est (ou peut être) hors ligne, et l'alerte, qui ne regardait que l'étape 'deleted',
 * restait muette — 15 annonces de Sébastien hors ligne 2,5 jours sans un signal. Son heure (ms), ou NaN.
 */
export function suppressionEnvoyeeLe(pf) {
  const p = objet(pf) ?? {};
  if (String(p.republish_step ?? "") !== "captured") return NaN;
  return ms(objet(p.republish_suppression_envoyee)?.at);
}

// ── (29/10, point 5 — Nico, Johan Désiré) POSTE ÉTEINT = PAS D'ALERTE ; POSTE VIVANT QUI NE RECRÉE PAS = L'ALERTE ──
// Johan : 16 alertes en 5 jours, une par republication Leboncoin/Beebs/Depop (redépôt « au prochain passage », pris
// 30 à 60 min plus tard par un poste bien vivant mais occupé), plus celles d'un PC simplement éteint la nuit — la
// remise en ligne se fait au retour du poste, il n'y a rien à faire. La présence (battement_extension, poll) tranche :
//   · aucun signe du compte depuis 10 min → « poste_eteint », pas d'alerte (ré-examinée à chaque passage) ;
//   · un poste bat sur CE job → « recreation_en_cours » ;
//   · le poste vient de revenir (vivant_depuis < 30 min) → « poste_revenu » : il a la main, rang 0 de sa file ;
//   · un poste bat sur un AUTRE travail, retrait de moins de 2 h → « poste_occupe » ;
//   · sinon le motif d'origine : un poste vivant, revenu depuis 30 min, libre, et l'annonce toujours hors ligne.
// Sans présence fournie (appel d'avant), la règle d'avant, à l'identique.
export const PRESENCE_VIVANTE_MS = 10 * 60_000;          // même seuil que POSTE_VIVANT_MS (interruption-poste.js)
export const ALERTE_APRES_RETOUR_MS = 30 * 60_000;
export const ALERTE_POSTE_OCCUPE_MAX_MS = 2 * 3600_000;

/**
 * La présence d'un compte, lue sur profiles (extension_last_seen_at, extension_postes) :
 * le signe de vie le plus frais, le retour le plus ancien des postes vivants, les jobs sur lesquels un poste bat.
 */
export function presenceDuCompte({ postes = null, compteVuLe = null, maintenant = Date.now() } = {}) {
  let vu = ms(compteVuLe);
  let vivantDepuis = NaN;
  const travaux = [];
  for (const p of Object.values(objet(postes) ?? {})) {
    const le = ms(p?.le);
    if (!Number.isFinite(le)) continue;
    if (!Number.isFinite(vu) || le > vu) vu = le;
    if (maintenant - le > PRESENCE_VIVANTE_MS) continue;
    const depuis = ms(p?.vivant_depuis);
    if (Number.isFinite(depuis) && (!Number.isFinite(vivantDepuis) || depuis < vivantDepuis)) vivantDepuis = depuis;
    const t = objet(p?.travail);
    // Un flux sans job (relevé, sync du dressing) compte comme « occupé » : job vide.
    if (t && maintenant - ms(t.le) <= PRESENCE_VIVANTE_MS) travaux.push(String(t.job ?? ""));
  }
  return { vuLe: Number.isFinite(vu) ? new Date(vu).toISOString() : null, vivantDepuis: Number.isFinite(vivantDepuis) ? new Date(vivantDepuis).toISOString() : null, travaux };
}

/**
 * L'alerte « hors ligne sans recréation » est-elle due pour ce job (republication à l'étape 'deleted', ou à l'étape
 * 'captured' dont la suppression est partie sans preuve) ?
 * `presence` (29/10) : { vuLe, vivantDepuis, travaux, jobId } — cf. presenceDuCompte ; absente = règle d'avant.
 * @returns {{ due: boolean, motif: "sans_envoi"|"relu_sans_copie"|"envoi_non_verifie"|"envoi_parti"|"trop_tot"|"sans_retrait"|"suppression_envoyee"|"poste_eteint"|"recreation_en_cours"|"poste_revenu"|"poste_occupe" }}
 */
export function alerteOrphelineDue(pf, maintenant = Date.now(), presence = undefined) {
  const base = alerteOrphelineSansPresence(pf, maintenant);
  if (!base.due || presence == null) return base;
  const vu = ms(presence.vuLe);
  if (!Number.isFinite(vu) || maintenant - vu > PRESENCE_VIVANTE_MS) return { due: false, motif: "poste_eteint" };
  const travaux = Array.isArray(presence.travaux) ? presence.travaux.map(String) : [];
  if (presence.jobId && travaux.includes(String(presence.jobId))) return { due: false, motif: "recreation_en_cours" };
  const depuis = ms(presence.vivantDepuis);
  if (Number.isFinite(depuis) && maintenant - depuis < ALERTE_APRES_RETOUR_MS) return { due: false, motif: "poste_revenu" };
  const debut = Number.isFinite(retraitLe(pf)) ? retraitLe(pf) : suppressionEnvoyeeLe(pf);
  if (travaux.length && Number.isFinite(debut) && maintenant - debut < ALERTE_POSTE_OCCUPE_MAX_MS) return { due: false, motif: "poste_occupe" };
  return base;
}

function alerteOrphelineSansPresence(pf, maintenant) {
  const retrait = retraitLe(pf);
  if (!Number.isFinite(retrait)) {
    // Suppression partie, jamais prouvée : rien ne peut recréer tant que l'étape reste 'captured'.
    const envoyee = suppressionEnvoyeeLe(pf);
    if (!Number.isFinite(envoyee)) return { due: false, motif: "sans_retrait" };
    return maintenant - envoyee < ALERTE_APRES_RETRAIT_MS
      ? { due: false, motif: "trop_tot" }
      : { due: true, motif: "suppression_envoyee" };
  }
  if (maintenant - retrait < ALERTE_APRES_RETRAIT_MS) return { due: false, motif: "trop_tot" };
  const envoi = envoiDepuisLeRetrait(pf);
  if (!Number.isFinite(envoi)) return { due: true, motif: "sans_envoi" };
  const relu = relectureSansCopie(pf, envoi);
  if (Number.isFinite(relu) && maintenant - Math.max(relu, envoi) >= ALERTE_APRES_RELECTURE_MS) return { due: true, motif: "relu_sans_copie" };
  if (maintenant - envoi >= ALERTE_ENVOI_NON_VERIFIE_MS) return { due: true, motif: "envoi_non_verifie" };
  return { due: false, motif: "envoi_parti" };
}
