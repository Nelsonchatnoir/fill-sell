// ══════════════════════════════════════════════════════════════════════════
// OPLA EST-IL AUTORISÉ SUR CE COMPTE ? — UNE SEULE RÈGLE (2026-09-24)
// ══════════════════════════════════════════════════════════════════════════
// CAS FONDATEUR — Louis (Amiral, Business), 24/09 au soir. Étape 1 du stepper
// « Où publier ? » : Opla « À autoriser dans l'extension » + le bouton
// « Autoriser Opla ». Au même instant, Réglages : Opla « Connectée · annonces
// relevées il y a 12 min ». En base : ses DEUX postes portent
// extension_postes[*].opla_acces = true, l'un avec la preuve « relevé Opla
// abouti », et sa publication Opla de 18:34 était partie sans blocage.
//
// POURQUOI. Le stepper jugeait seul, sur `profiles.extension_sessions` — la
// sonde du DERNIER poste qui écrit. Depuis la 0.6.65, un 401 de sonde rend
// `null` (il ne prouve rien, cf. mémoire du 24/09) : plus aucune trace d'Opla
// dans ce relevé, et le stepper lisait ce silence comme un refus. L'écran de
// suivi et les Réglages, eux, lisaient autre chose. Trois écrans, trois avis.
//
// LA RÈGLE (Nico, 24/09) : Opla est autorisé si AU MOINS UN POSTE du compte a
// `opla_acces = true`, et si AUCUN REFUS PLUS RÉCENT (relevé « accès Opla non
// accordé », parcage « Autoriser Opla ») ne le contredit.
//
// Ce module est la règle, et la SEULE : l'app (stepper, écran de suivi,
// Réglages, relevé, republication, cartes du Stock) la lit par un seul hook
// (src/utils/oplaAcces.js), sur les faits que le SERVEUR connaît — postes de
// l'extension, relevés, dépôts, parcages. Jamais sur ce que l'extension
// déclare ou ne déclare pas dans sa sonde.
//
// LES PREUVES D'ACCÈS (l'extension a lu ou écrit sur opla.co, ou a vu la
// permission accordée) — même liste que _shared/preuve-opla.ts, plus les
// faits d'onglet qui supposent la permission :
//   · un poste vivant (≤ 48 h) avec opla_acces = true — daté du moment où cet
//     accès a été ÉTABLI (opla_acces_le : déclaré par la 0.6.64+ à chaque
//     poll, appris par update-job-status ou prouvé par get-pending-jobs pour
//     les plus anciennes), à défaut de sa dernière apparition ;
//   · un relevé Opla abouti (kind ≠ 'connexion' : une « connexion » Opla
//     `done` veut dire « le popup s'est ouvert », pas « autorisé ») ;
//   · une publication Opla aboutie par l'extension ;
//   · la relance posée PAR L'EXTENSION à l'octroi (opla_acces_accorde_le sans
//     accorde_par serveur) ;
//   · un relevé refusé « session Opla refusée (HTTP 401) » DANS L'ONGLET, et
//     la page de connexion VUE par l'onglet : l'onglet s'est ouvert sur
//     opla.co, la permission était là — c'est la session qui manquait ;
//   · une sonde `true` (réponse 200 portant l'identifiant du compte).
// LES REFUS :
//   · un relevé « accès Opla non accordé » (chrome.permissions.contains =
//     false, dit par l'extension elle-même) ;
//   · un parcage « Autoriser Opla » EN COURS (needs_user, source opla_acces) ;
//   · un poste vivant SANS accès — seulement quand AUCUN poste vivant ne l'a :
//     un profil Chrome sans permission ne retire rien au compte dont un autre
//     profil publie (get-pending-jobs ne lui sert plus aucun job Opla).
// ⛔ JAMAIS une preuve, dans un sens comme dans l'autre : un 401 de sonde de
//    service worker (cf. 0.6.65), une valeur absente de la sonde.
//
// TROIS VERDICTS :
//   'autorise'     une preuve, plus récente que tout refus ;
//   'a_autoriser'  un refus, plus récent que toute preuve (ou sans preuve) ;
//   'inconnu'      ni l'un ni l'autre.
// ⛔ GARDE-FOU (Nico) : sans AUCUNE preuve, le bouton « Autoriser Opla » RESTE
//    affiché — on ne le masque jamais par défaut. Seul 'autorise' le retire.
//    'inconnu' et 'a_autoriser' ne diffèrent que par la phrase et par la
//    modale au clic (posée sur un refus connu seulement).
// ⛔ Indépendant de la version d'extension (0.6.53 → 0.6.66) : les postes
//    existent pour toutes (get-pending-jobs les écrit à chaque poll), et les
//    autres faits sont des lignes de base.
//
// ES module SANS import : chargé tel quel par Vite (app) et par Deno.
// Selftest : scripts/acces-opla-selftest.mjs.

/** Un poste compte tant qu'il a pollé depuis moins de 48 h (postesVivants). */
export const POSTE_VIVANT_MS = 48 * 3600 * 1000;

const t = (v) => {
  const n = Date.parse(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
};

/** Le plus récent de faits { t, motif } (null ignorés). */
function plusRecent(faits) {
  let best = null;
  for (const f of faits) {
    if (!f || f.t == null) continue;
    if (!best || f.t > best.t) best = f;
  }
  return best;
}

/**
 * Les postes vivants avec / sans accès, datés du moment où l'accès a été établi.
 * @param {object|null} postes  profiles.extension_postes, tel quel
 */
export function postesOpla(postes, maintenant = Date.now()) {
  let avec = null, sans = null, nAvec = 0, nSans = 0;
  if (postes && typeof postes === "object" && !Array.isArray(postes)) {
    for (const p of Object.values(postes)) {
      if (!p || typeof p !== "object") continue;
      const vu = t(p.le);
      if (vu == null || maintenant - vu > POSTE_VIVANT_MS) continue;
      const etabli = t(p.opla_acces_le) ?? vu;
      if (p.opla_acces === true) { nAvec++; if (avec == null || etabli > avec) avec = etabli; }
      else if (p.opla_acces === false) { nSans++; if (sans == null || etabli > sans) sans = etabli; }
    }
  }
  return { avec, sans, nAvec, nSans };
}

/** Le moment d'un parcage « Autoriser Opla » (le plus tardif connu). */
export function tempsParcage(job) {
  const pf = job?.platform_fields ?? {};
  const ts = [t(pf.opla_acces_attendu_le), t(pf.opla_acces_reprise_le), t(job?.created_at)].filter((x) => x != null);
  return ts.length ? Math.max(...ts) : null;
}

/**
 * LE VERDICT. Toutes les dates sont des chaînes ISO (ou null).
 * @param {object} d
 * @param {object|null} d.postes                  profiles.extension_postes
 * @param {object|null} d.sessions                profiles.extension_sessions (sonde `true` et page vue seulement)
 * @param {string|null} d.releveReussiLe          dernier relevé Opla abouti (kind ≠ connexion)
 * @param {string|null} d.releveSessionRefuseeLe  dernier relevé « session Opla refusée (HTTP 401) »
 * @param {string|null} d.publieLe                dernière publication Opla aboutie par l'extension
 * @param {string|null} d.octroiLe                dernière relance posée par l'extension à l'octroi
 * @param {string|null} d.releveNonAccordeLe      dernier relevé « accès Opla non accordé »
 * @param {string|null} d.parcageLe               parcage « Autoriser Opla » en cours, le plus récent
 * @param {number}      [d.maintenant]
 * @returns {{ verdict: 'autorise'|'a_autoriser'|'inconnu', le: string|null, motif: string,
 *             preuve: {le: string, motif: string}|null, refus: {le: string, motif: string}|null,
 *             postes: {avec: number, sans: number} }}
 */
export function verdictAccesOpla(d = {}) {
  const maintenant = Number.isFinite(d.maintenant) ? d.maintenant : Date.now();
  const p = postesOpla(d.postes, maintenant);
  const s = d.sessions && typeof d.sessions === "object" ? d.sessions : null;
  const sondeLe = s ? t(s.checked_at_par_plateforme?.opla ?? s.checked_at) : null;

  const preuve = plusRecent([
    { t: p.avec, motif: "poste_avec_acces" },
    { t: t(d.releveReussiLe), motif: "releve_reussi" },
    { t: t(d.releveSessionRefuseeLe), motif: "releve_onglet_session_fermee" },
    { t: t(d.publieLe), motif: "publication_aboutie" },
    { t: t(d.octroiLe), motif: "octroi_dans_le_popup" },
    // La sonde ne prouve l'accès QUE sur un `true` (200 + identifiant du
    // compte) ; la page de connexion VUE par l'onglet le prouve aussi.
    { t: s && s.opla === true ? sondeLe : null, motif: "sonde_vivante" },
    { t: s && s.opla === false && s.http?.opla === "login_redirect_observee" ? sondeLe : null, motif: "page_connexion_vue" },
  ]);
  const refus = plusRecent([
    { t: t(d.releveNonAccordeLe), motif: "releve_acces_non_accorde" },
    { t: t(d.parcageLe), motif: "parcage_autoriser_opla" },
    // Un poste sans accès ne dit rien du compte tant qu'un autre l'a.
    { t: p.avec == null ? p.sans : null, motif: "poste_sans_acces" },
  ]);

  const iso = (x) => (x == null ? null : new Date(x).toISOString());
  const base = {
    preuve: preuve ? { le: iso(preuve.t), motif: preuve.motif } : null,
    refus: refus ? { le: iso(refus.t), motif: refus.motif } : null,
    postes: { avec: p.nAvec, sans: p.nSans },
  };
  // À égalité, le refus l'emporte (même règle que preuve-opla.ts).
  if (preuve && (!refus || preuve.t > refus.t)) return { verdict: "autorise", le: iso(preuve.t), motif: preuve.motif, ...base };
  if (refus) return { verdict: "a_autoriser", le: iso(refus.t), motif: refus.motif, ...base };
  return { verdict: "inconnu", le: null, motif: "aucune_preuve", ...base };
}

/**
 * Un job parqué « Autoriser Opla » alors que le compte est autorisé PAR UNE
 * PREUVE PLUS RÉCENTE que ce parcage : il repart tout seul (get-pending-jobs
 * relance les parcages dès qu'un poste avec accès polle). À l'écran : « repart
 * toute seule », jamais « Autoriser Opla ».
 */
export function parcageDepasse(job, v) {
  if (!v || v.verdict !== "autorise") return false;
  const tp = tempsParcage(job);
  const tv = t(v.le);
  return tv != null && (tp == null || tv > tp);
}
