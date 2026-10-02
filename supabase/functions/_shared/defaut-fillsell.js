// ═══════════════════════════════════════════════════════════════════════════
// UNE EXCEPTION DE NOTRE CODE EST UN DÉFAUT DE CHEZ NOUS (02/10 soir, point 3)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur : Jonathan Rabany, republication Beebs 6d1a1d3d (0.6.85). Le
// pré-vol du formulaire levait « Cannot access 'o' before initialization » —
// `warnings` (minifié en `o`) écrit par la catégorie AVANT sa déclaration dans
// content-scripts/beebs.js. Le background rangeait ce texte en verdict
// « illisible » (« la page n'est pas prouvée remplissable ») et reprenait toutes
// les 30 min : le même code, le même plantage, à vie, et rien ne disait que
// c'était nous.
// Règle de Nico : une exception JavaScript de NOTRE code n'est jamais classée
// « illisible » ni « plateforme ». Elle remonte comme un défaut de chez nous :
//   · le job porte `defaut_fillsell` {le, signature, build} ;
//   · il n'est plus servi au même build (il replanterait) : il attend un poste
//     plus récent (get-pending-jobs), annonce intacte — sauf à l'étape
//     'deleted', où l'annonce est déjà retirée : la recréation continue d'être
//     tentée (reprise espacée), marquée ;
//   · le message le dit, sans vocabulaire de développeur.
// Signatures : les messages des erreurs du moteur JavaScript (ReferenceError,
// TypeError, RangeError, SyntaxError) — jamais un message écrit par nos
// handlers, jamais un refus de plateforme. Pur (Deno + Node).

const SIGNATURES = [
  /Cannot access '[^']{1,40}' before initialization/,
  /\b[A-Za-z_$][\w$]{0,40} is not defined\b/,
  /\b[A-Za-z_$][\w$.\[\]()]{0,60} is not a function\b/,
  /Cannot read propert(?:y|ies) of (?:undefined|null)/,
  /Cannot set propert(?:y|ies) of (?:undefined|null)/,
  /\bis not iterable\b/,
  /Assignment to constant variable/,
  /Maximum call stack size exceeded/,
  /Cannot destructure property/,
  /\bis not a constructor\b/,
  /Unexpected token .{0,20} in JSON|Unexpected end of JSON input/,
  /^(?:ReferenceError|TypeError|RangeError|SyntaxError)\b/,
];

/** La signature d'une exception de notre code dans un texte, ou null. */
export function signatureException(texte) {
  const t = String(texte ?? "");
  if (!t) return null;
  for (const re of SIGNATURES) {
    const m = t.match(re);
    if (m) return m[0].slice(0, 160);
  }
  return null;
}

/**
 * Où chercher : l'erreur envoyée par le handler, et le détail du pré-vol de
 * formulaire (Beebs/Leboncoin) qu'un poste ≤ 0.6.87 range en « illisible ».
 * @param {{ erreur?: string|null, pf?: Record<string, any>|null }} [arg]
 * @returns {null | { signature: string, ou: string }}
 */
export function defautFillsell({ erreur = null, pf = null } = {}) {
  const s1 = signatureException(erreur);
  if (s1) return { signature: s1, ou: "erreur" };
  const pv = pf && typeof pf === "object" ? pf.republish_prevol_formulaire : null;
  if (pv && typeof pv === "object" && (pv.verdict === "illisible" || pv.verdict === "defaut_fillsell")) {
    const s2 = signatureException(pv.detail);
    if (s2) return { signature: s2, ou: "prevol_formulaire" };
  }
  return null;
}

const NOM = { vinted: "Vinted", leboncoin: "Leboncoin", ebay: "eBay", beebs: "Beebs", opla: "Opla" };
const ACTE = { republish: "la republication", delete: "le retrait", publish: "la publication" };

/**
 * Le message à la personne : c'est nous, pas la plateforme, et ce qui se passe ensuite.
 * @param {{ platform?: string, action?: string, etapeRetiree?: boolean }} [arg]
 */
export function messageDefautFillsell({ platform, action, etapeRetiree = false } = {}) {
  const nom = NOM[platform] ?? platform ?? "la plateforme";
  const acte = ACTE[action] ?? "l'envoi";
  if (etapeRetiree) {
    return `Un défaut de FillSell (de notre côté, pas de ${nom}) a interrompu la remise en ligne de ton annonce. ` +
      "On réessaie tout seuls ; nous sommes prévenus et le correctif part avec la prochaine mise à jour de l'extension.";
  }
  return `Un défaut de FillSell (de notre côté, pas de ${nom}) a interrompu ${acte} avant tout geste sur ${nom} : ` +
    "ton annonce est intacte. Nous sommes prévenus ; elle repartira toute seule avec la prochaine mise à jour de l'extension.";
}

/** Le build de l'appel (« 2026-10-02T09:28:31Z+6060632 · v0.6.85 ») réduit à son horodatage. */
export function buildMs(b) {
  const m = String(b ?? "").match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/);
  return m ? Date.parse(m[0]) : NaN;
}

/**
 * Ce poste peut-il reprendre ce job ? Seulement s'il est PLUS RÉCENT que le build qui a planté.
 * @param {Record<string, any>|null} pf
 * @param {string|null|undefined} buildDuPoste
 */
export function posteApresDefaut(pf, buildDuPoste) {
  const d = pf && typeof pf === "object" ? pf.defaut_fillsell : null;
  if (!d || typeof d !== "object" || d.reprise_libre === true) return true;
  const bd = buildMs(d.build);
  if (!Number.isFinite(bd)) return true;
  const bp = buildMs(buildDuPoste);
  return Number.isFinite(bp) && bp > bd;
}
