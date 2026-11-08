// ══════════════════════════════════════════════════════════════════════════
// LA TAILLE eBAY QUE LA RÈGLE COMMUNE NE LISAIT PAS (07/11, constat de Nico)
// ══════════════════════════════════════════════════════════════════════════
// CE QUI L'A PROVOQUÉ (lu en base le 07/11) :
//   · Rosa Metra, « Monsoon Veste Denim Bleu Col Volant 11-12 ans » (job ba0c4d73, eBay voie extension, rayon 155201) :
//     la copie porte « 11-12 yrs » (lu sur l'étiquette), la liste eBay porte « 11-12 ans » — la MÊME taille, en anglais.
//     tailles.js lit « years », « yr », « y », pas « yrs » (ni « months », « mths », « Age 11-12 ») : l'extension
//     n'a trouvé aucune option, publication non tentée, question.
//   · PMF Vito, « Jogging Lacoste Sport … taille FR 3 » (job 0119b570, voie API, rayon 260956) : « FR 3 » envoyé en
//     texte libre (Taxonomy disait FREE_TEXT), refus 25129, liste fermée, question. « FR 3 » n'est PAS une taille
//     française : c'est la numérotation Lacoste (3 = S ; chez Sandro ou Maje, 3 = L). Aucune liste eBay ne l'écrit,
//     aucune règle ne la traduit sans deviner : elle RESTE une question (règle de Nico : jamais une valeur devinée).
//
// LA RÈGLE — un COMPLÉMENT, appelé SEULEMENT quand la règle d'aujourd'hui (liste exacte, préfixe EU/FR du 01/10,
// tailles.js, taille-de-service.js) n'a rien trouvé : une taille qu'elle traduit garde EXACTEMENT sa valeur.
//   E1 L'ÂGE ÉCRIT EN ANGLAIS → SON ÉCRITURE FRANÇAISE, MÊME UNITÉ, MÊMES NOMBRES, puis tailles.js sur la liste
//      eBay (l'entrée telle qu'eBay l'écrit) : « 11-12 yrs » → « 11-12 ans », « 3-4 years old » → « 3-4 ans »,
//      « Age 11-12 » → « 11-12 ans », « 18 months » → « 18 mois », « 12-18 mths » → « 12-18 mois »,
//      « Newborn » → « Naissance » ; aussi dans une étiquette composite (« 11-12 yrs / 146-152 cm »).
//      ⛔ Jamais mois ↔ ans (« 24 months » n'est pas « 2 ans ») ; jamais une tranche vers une de ses bornes
//      (« 12-18 mois » n'est pas « 18 mois ») ; « 11/12 yrs » est UNE tranche, jamais « 12 ans ».
//   E2 LE PRÉFIXE DE PAYS QUE LA LISTE N'ÉCRIT PAS — liste FERMÉE seulement (en texte libre, « EU 39 » part tel
//      quel : règle du 01/10, inchangée) : « EU 36,5 », « 38 EU », « EUR 38 », « Taille FR 38 » → le nombre NU de
//      la liste (virgule ≡ point) ; « EU S », « FR M », « INT XL » → la lettre (tailles.js : XXL ≡ 2XL) ; sur
//      « Pointure UK / US / AU », le préfixe de CE pays (« UK 6 » → « 6 »).
//      ⛔ UK, US, IT ne se retirent que sur l'aspect de leur pays, et EU/FR jamais sur un aspect UK/US/AU ;
//      aucune conversion entre pays (« UK 10 » n'est jamais « 38 »).
//   E3 (08/11, point 3 de Nico) L'ÉTIQUETTE ENFANT DANS L'AUTRE ÉCRITURE QUE LA LISTE eBay PORTE — voir plus bas :
//      « 24 mois » → « 2 ans » (rayon 2-16 ans), « 2 ans » → « 24 mois » (rayon bébé), « 18 mois » → « 86 », « 3 ans »
//      → « 98 », « 86 cm » → « 86 », « 18-24 mois » → « 86-92 », « 24-36 mois » → « 2-3 ans » ; jamais une borne.
//   Sinon : null — la question part, avec la liste (« FR 3 », « EU 2 » de The Kooples, « 0-3 months » face à une
//   liste qui n'a que « 3 mois »…).
// ⛔ La fiche n'est jamais réécrite : seule la valeur servie à eBay.
// ⛔ Module PROPRE À eBay : tailles.js (copié à l'octet dans l'extension, Depop, Opla) n'est pas touché ; les autres
//    plateformes gardent leur règle.
//
// ES module pur (Deno + Node + Vite), un seul import relatif lui-même sans import. Pas de lookbehind (WebView iOS).
import { tailleDansGrille, AGE_PAR_STATURE_ENFANT } from "./tailles.js";

/** Les aspects de taille eBay (nom EXACT, comme estAspectDeTaille d'ebay-aspects-ia.ts). */
const ASPECT_TAILLE_RE = /^(?:Taille|Pointure(?: EU| UK| US| AU)?)$/;

const plier = (v) => String(v ?? "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase()
  .replace(/[‐-―−]/g, "-")
  .replace(/\s+/g, " ")
  .trim();

const options = (liste) => (Array.isArray(liste) ? liste : [])
  .map((o) => String(typeof o === "string" ? o : (o?.code ?? o?.title ?? "")).trim())
  .filter(Boolean);

// ── E1 — L'ÂGE EN ANGLAIS ───────────────────────────────────────────────────
const UNITE_MOIS = "(?:months?|mths?|mos?)";
const UNITE_ANS = "(?:years?\\s*old|yrs?\\s*old|y\\.?\\s*o\\.?|yrs?|years?|y)";
const MOIS_RE = new RegExp(`^${UNITE_MOIS}$`);
// [1] « age(s) » ; [2] première borne ; [3] seconde borne ; [4] unité.
const AGE_RE = new RegExp(
  `^(ages?\\s*:?\\s*)?(\\d{1,2})(?:\\s*(?:-|\\/|to|a)\\s*(\\d{1,2}))?\\s*(${UNITE_ANS}|${UNITE_MOIS}|ans?|mois)?\\.?$`,
);

/**
 * L'écriture FRANÇAISE d'un âge écrit en anglais (« 11-12 yrs » → « 11-12 ans », « 18 months » → « 18 mois »,
 * « Age 11-12 » → « 11-12 ans », « Newborn » → « Naissance »), ou null. Jamais une conversion d'unité.
 * @param {unknown} brut
 * @returns {string|null}
 */
export function ageEnFrancais(brut) {
  const s = plier(brut);
  if (/^(?:new ?born|nouveau ?-?nes?)$/.test(s)) return "Naissance";
  const m = AGE_RE.exec(s);
  if (!m) return null;
  const prefixeAge = Boolean(m[1]);
  const unite = m[4] ?? "";
  // Sans unité, seul « Age 11-12 » (l'âge des étiquettes anglaises, toujours en années) est un âge.
  if (!unite && !prefixeAge) return null;
  const enMois = MOIS_RE.test(unite) || unite === "mois";
  const de = Number(m[2]);
  const a = m[3] === undefined ? null : Number(m[3]);
  if (a !== null && a <= de) return null;
  const max = enMois ? 36 : 18;
  if (de > max || (a ?? de) > max) return null;
  const borne = a !== null ? `${de}-${a}` : String(de);
  return `${borne} ${enMois ? "mois" : ((a ?? de) > 1 ? "ans" : "an")}`;
}

// Les morceaux d'une écriture, dans l'ordre : elle-même, le dehors puis le dedans de ses parenthèses, puis ses
// jetons (« / », « | », « · », tiret ENTOURÉ d'espaces). Une barre entre deux chiffres est une TRANCHE
// (« 11/12 yrs ») : jamais coupée — sinon « 12 yrs » deviendrait « 12 ans », une autre taille.
function morceaux(valeur) {
  const out = [valeur];
  const par = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(valeur);
  if (par) out.push(par[1].trim(), par[2].trim());
  for (const gros of valeur.split(/\s*[|·•]\s*|\s+[-–—]\s+/)) {
    let cur = "";
    const jet = [];
    for (let i = 0; i < gros.length; i++) {
      const c = gros[i];
      if (c === "/" && !(/\d\s*$/.test(cur) && /^\s*\d/.test(gros.slice(i + 1)))) { jet.push(cur); cur = ""; continue; }
      cur += c;
    }
    jet.push(cur);
    for (const j of jet) out.push(j.trim());
  }
  return [...new Set(out.filter(Boolean))];
}

function ageAnglais(valeur, opt) {
  for (const m of morceaux(valeur)) {
    const fr = ageEnFrancais(m);
    if (!fr) continue;
    const r = tailleDansGrille(fr, opt);
    if (r) return { valeur: r.valeur, motif: `« ${m} » = « ${fr} » (le même âge, écrit en français ; ${r.motif})`, regle: "E1" };
  }
  return null;
}

// ── E2 — LE PRÉFIXE DE PAYS QUE LA LISTE N'ÉCRIT PAS (liste fermée) ─────────
const NOMBRE = "(\\d{1,3}(?:[.,]\\d{1,2})?)";
const nombreNu = (o) => {
  const m = /^(\d{1,3}(?:[.,]\d{1,2})?)$/.exec(String(o ?? "").trim());
  return m ? Number(m[1].replace(",", ".")) : null;
};
// Le pays que l'aspect écrit sans préfixe : « Pointure UK » → uk ; « Taille », « Pointure », « Pointure EU » → EU/FR.
function paysDeLAspect(nomAspect) {
  const m = /^Pointure (UK|US|AU)$/.exec(String(nomAspect ?? ""));
  return m ? [m[1].toLowerCase()] : ["eur", "eu", "fr"];
}
const LETTRE_RE = /^(?:[2-8]?x{0,5}[sl]|m)$/;

function prefixePays(nomAspect, valeur, opt) {
  const s = plier(valeur).replace(/^(?:taille|t)\s*[:.]?\s*/, "");
  const pays = paysDeLAspect(nomAspect).join("|");
  const m = new RegExp(`^(?:${pays})\\s*[:.]?\\s*${NOMBRE}$`).exec(s) || new RegExp(`^${NOMBRE}\\s*(?:${pays})$`).exec(s);
  if (m) {
    const n = Number(m[1].replace(",", "."));
    const egales = opt.filter((o) => nombreNu(o) === n);
    if (egales.length === 1) {
      return { valeur: egales[0], motif: `« ${valeur} » : le préfixe de pays que la liste eBay n'écrit pas (« ${egales[0]} »)`, regle: "E2" };
    }
    return null;
  }
  if (String(nomAspect) !== "Taille") return null;
  const l = /^(?:eur|eu|fr|int)\s*[:.]?\s*([a-z0-9]{1,6})$/.exec(s);
  if (l && LETTRE_RE.test(l[1])) {
    const r = tailleDansGrille(l[1].toUpperCase(), opt);
    if (r) return { valeur: r.valeur, motif: `« ${valeur} » : une taille en lettres, le préfixe retiré (${r.motif})`, regle: "E2" };
  }
  return null;
}

// ── E3 — L'ÉTIQUETTE ENFANT DANS L'AUTRE ÉCRITURE QUE LA LISTE eBay PORTE (08/11, point 3 de Nico) ──────────
// CE QUI L'A PROVOQUÉ (lu en base le 08/11) : chaouidz (sos.cuisine.valenciennes), job ccffd8ef (voie extension,
// rayon 51973 « Vêtements garçon (2-16 ans) › Sous-vêtements ») : copie « 24 mois » (fiche « 18-24 mois / 86 cm »),
// liste eBay = lettres, 74…176, « 2 ans » … « 16 ans », AUCUNE entrée en mois. Aucune règle ne répondait (liste
// exacte, tailles.js, taille-de-service.js, E1, E2) : publication non tentée, question « Taille ». Les listes eBay
// enfant n'écrivent pas un âge de la même façon selon le rayon : le rayon bébé en mois (« Naissance », « 1 mois » …
// « 24 mois ») et en statures (56…98) ; le rayon 2-16 ans en années (« 2 ans » … « 16 ans ») et en statures (62…176) ;
// quelques rayons en tranches (« 74-80 », « 86-92 », « 2-3 ans »).
// LA TABLE : celle des étiquettes enfant de tailles.js (AGE_PAR_STATURE_ENFANT, 27/09), SEULE source — une ligne = UNE
// taille et ses écritures (92 cm = 24 mois = 2 ans ; 98 cm = 3 ans = 36 mois ; 50 cm = 0 mois, que les listes eBay
// écrivent « Naissance » ou « Nouveau né »). Dans l'ordre, une seule entrée de la liste eBay :
//   a. la MÊME taille dans une autre écriture d'âge de sa ligne (« 24 mois » → « 2 ans », « 2 ans » → « 24 mois »,
//      « 0 mois » → « Naissance ») ;
//   b. sa stature, sur une liste de statures enfant (« 18 mois » → « 86 », « 3 ans » → « 98 ») ;
//   c. une stature écrite en cm (le morceau « 86 cm » de l'étiquette Vinted « 18-24 mois / 86 cm ») → « 86 » ;
//   d. une TRANCHE (« 18-24 mois », « 6/9 mois ») : la tranche ENTIÈRE dans l'autre écriture (« 24-36 mois » →
//      « 2-3 ans ») ou en statures (« 18-24 mois » → « 86-92 ») ;
//   e. « Prématuré » ≡ « Bébé prématuré » ≡ « Enfant prématuré » (le mot de la liste).
// Écritures lues : « 24 mois », « 24mois », « 24 m », « 24M », « 2 ans », « 2 an », « 2A », « 10A », « Naissance »,
// « nouveau-né », et l'anglais d'E1 (« 24 months » est d'abord « 24 mois »).
// ⛔ Jamais un âge voisin (« 18 mois » n'est jamais « 2 ans ») ; un âge absent de la table (« 1 an », « 15 mois »)
//    ne se traduit pas ; une tranche n'est JAMAIS une de ses bornes (« 12-18 mois » n'est ni « 12 mois » ni « 86 »).
// ⛔ Une « liste de statures enfant » porte au moins 3 statures CONSÉCUTIVES de la table (74, 80, 86) et AUCUN autre
//    nombre entier entre la plus petite et la plus grande : une liste adulte 32…62, des tours de tête 40…76, une liste
//    75/80/85/90 n'en sont pas — un « 56 » n'y est jamais lu comme une stature.
// ⛔ La liste eBay de CE rayon fait foi : une écriture qu'elle porte déjà a répondu avant (exacte, tailles.js) ; E3
//    n'est lu qu'en dernier, et ne rend qu'une entrée de la liste.
const SERIE_STATURES = Object.keys(AGE_PAR_STATURE_ENFANT).map(Number).sort((a, b) => a - b);
const ECRITURES_EN_PLUS = Object.freeze({ "50": ["Naissance", "Nouveau né"] });
const PREMATURES = ["bebe premature", "enfant premature", "premature"];

// Un âge d'étiquette enfant : { u: 'M'|'Y', de, a } (de === a pour un âge seul), { premature: true }, ou null.
function lireAgeEnfant(texte) {
  const s = plier(texte).replace(/\s*-\s*/g, "-");
  if (/^(?:bebe |enfant )?prema(?:ture)?s?$/.test(s)) return { premature: true };
  if (/^(?:naissance|nouveau ?-?nes?|new ?born)$/.test(s)) return { u: "M", de: 0, a: 0 };
  const r = /^(\d{1,2})(?:\s*(?:-|\/|a)\s*(\d{1,2}))?\s*(mois|m|ans?|a)$/.exec(s);
  if (!r) return null;
  const u = r[3] === "mois" || r[3] === "m" ? "M" : "Y";
  const de = Number(r[1]);
  const a = r[2] === undefined ? de : Number(r[2]);
  if (a < de || (u === "M" ? a > 36 : a > 18)) return null;
  return { u, de, a };
}

// L'index de la table : « M24 » → 92, « Y2 » → 92, « M0 » → 50… (âges seuls).
const STATURE_DE_L_AGE = (() => {
  const index = new Map();
  for (const s of SERIE_STATURES) {
    for (const ecriture of AGE_PAR_STATURE_ENFANT[String(s)]) {
      const g = lireAgeEnfant(ecriture);
      if (g && !g.premature && g.de === g.a && !index.has(`${g.u}${g.de}`)) index.set(`${g.u}${g.de}`, s);
    }
  }
  return index;
})();
const ecrituresDeLaLigne = (s) => [...AGE_PAR_STATURE_ENFANT[String(s)], ...(ECRITURES_EN_PLUS[String(s)] ?? [])];

// « 86 » ou « 86 cm » → 86 ; sinon null.
function statureEcrite(o) {
  const m = /^(\d{2,3})(?:\s*cm)?$/.exec(plier(o));
  return m ? Number(m[1]) : null;
}

function estListeDeStatures(opt) {
  const entiers = new Set(opt.map(statureEcrite).filter((n) => n !== null));
  let suite = 0, meilleure = 0;
  for (const s of SERIE_STATURES) {
    suite = entiers.has(s) ? suite + 1 : 0;
    meilleure = Math.max(meilleure, suite);
  }
  if (meilleure < 3) return false;
  const presentes = SERIE_STATURES.filter((s) => entiers.has(s));
  const bas = presentes[0], haut = presentes[presentes.length - 1];
  return ![...entiers].some((n) => n > bas && n < haut && !SERIE_STATURES.includes(n));
}

function etiquetteEnfantDansLaListe(texte, opt) {
  const age = lireAgeEnfant(texte) ?? (() => { const fr = ageEnFrancais(texte); return fr ? lireAgeEnfant(fr) : null; })();
  const statures = () => estListeDeStatures(opt);
  // e. Prématuré : le mot de la liste.
  if (age?.premature) {
    const o = opt.find((x) => PREMATURES.includes(plier(x)));
    return o ? { valeur: o, motif: `« ${texte} » : la même taille, le mot de la liste eBay` } : null;
  }
  // c. Une stature écrite en cm.
  if (!age) {
    const cm = /^(\d{2,3})\s*cm$/.exec(plier(texte));
    const n = cm ? Number(cm[1]) : null;
    if (n === null || !SERIE_STATURES.includes(n) || !statures()) return null;
    const o = opt.find((x) => statureEcrite(x) === n);
    return o ? { valeur: o, motif: `« ${texte} » : la stature de l'étiquette, telle que la liste eBay l'écrit` } : null;
  }
  // a + b. Un âge seul.
  if (age.de === age.a) {
    const s = STATURE_DE_L_AGE.get(`${age.u}${age.de}`);
    if (s === undefined) return null;
    for (const ecriture of ecrituresDeLaLigne(s)) {
      const r = tailleDansGrille(ecriture, opt);
      if (r) return { valeur: r.valeur, motif: `« ${texte} » = « ${ecriture} » (la même taille d'étiquette enfant, ${s} cm ; ${r.motif})` };
    }
    if (!statures()) return null;
    const o = opt.find((x) => statureEcrite(x) === s);
    return o ? { valeur: o, motif: `« ${texte} » : l'étiquette enfant de ${s} cm (table des étiquettes de tailles.js)` } : null;
  }
  // d. Une tranche : entière, jamais une borne.
  const sDe = STATURE_DE_L_AGE.get(`${age.u}${age.de}`), sA = STATURE_DE_L_AGE.get(`${age.u}${age.a}`);
  if (sDe === undefined || sA === undefined || sDe >= sA) return null;
  const autre = age.u === "M" ? "Y" : "M";
  const borneAutre = (s) => ecrituresDeLaLigne(s).map(lireAgeEnfant).find((g) => g && !g.premature && g.u === autre && g.de === g.a);
  const bDe = borneAutre(sDe), bA = borneAutre(sA);
  if (bDe && bA) {
    const ecriture = `${bDe.de}-${bA.de} ${autre === "M" ? "mois" : "ans"}`;
    const r = tailleDansGrille(ecriture, opt);
    if (r) return { valeur: r.valeur, motif: `« ${texte} » = « ${ecriture} » (la même tranche, ${sDe}-${sA} cm ; ${r.motif})` };
  }
  const o = opt.find((x) => {
    const m = /^(\d{2,3})\s*(?:-|\/)\s*(\d{2,3})(?:\s*cm)?$/.exec(plier(x));
    return !!m && Number(m[1]) === sDe && Number(m[2]) === sA;
  });
  return o ? { valeur: o, motif: `« ${texte} » : la tranche de statures ${sDe}-${sA} cm de la liste eBay` } : null;
}

function etiquetteEnfant(valeur, opt) {
  for (const m of morceaux(valeur)) {
    const r = etiquetteEnfantDansLaListe(m, opt);
    if (r) return { ...r, regle: "E3" };
  }
  return null;
}

/**
 * LE complément eBay : la valeur à servir pour `brut` dans la liste eBay de l'aspect, quand la règle
 * d'aujourd'hui n'a rien trouvé — ou null (la question). À n'appeler QU'APRÈS elle.
 * @param {string} nomAspect « Taille », « Pointure », « Pointure EU/UK/US/AU » (sinon null)
 * @param {unknown} brut
 * @param {unknown[]} liste les valeurs eBay de l'aspect pour ce rayon
 * @param {{ferme?: boolean}} [opts] ferme : la liste fait foi (SELECTION_ONLY, fermée par 25129, ou une question)
 * @returns {{valeur:string, motif:string, regle:'E1'|'E2'|'E3'}|null}
 */
export function tailleEbayComplement(nomAspect, brut, liste, opts = {}) {
  if (!ASPECT_TAILLE_RE.test(String(nomAspect ?? ""))) return null;
  const valeur = String(brut ?? "").trim();
  const opt = options(liste);
  if (!valeur || !opt.length) return null;
  // E3 (08/11) en DERNIER, quel que soit le mode (comme E1) : il ne rend qu'une entrée de la liste.
  return ageAnglais(valeur, opt) ?? (opts?.ferme ? prefixePays(nomAspect, valeur, opt) : null) ?? etiquetteEnfant(valeur, opt);
}
