// ═══════════════════════════════════════════════════════════════════════════
// LA VILLE DE PUBLICATION ET SON VRAI CODE POSTAL, PAR SITE (13/11, lot du 13/11, N6b — décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « Une ville de publication ne porte jamais un code CEDEX (ni un code général comme 75000) ; quand elle en porte
// un, le repli retombe sur la commune et SON vrai code postal — celui de l'adresse du vendeur si c'est la même
// commune, sinon celui que la plateforme connaît pour cette commune (la règle « commune Leboncoin même code
// postal ») ; le doute (plusieurs codes) est une question, jamais une valeur inventée. »
//
// LE CAS (compte 98b72757) : Réglages › Adresse de remise › « Ville de tes annonces Leboncoin » enregistrée le
// 11/11 à 11:27:13 avec { code_postal: 49308, ville: Cholet } — le champ acceptait n'importe quels cinq chiffres
// (src/publication/villeLbc.js, villeValide) ; l'adresse, enregistrée 9 s avant et après, porte 49300 ; ses 26
// annonces Leboncoin sont à « Cholet 49300 ». 49308 n'est le code d'aucune commune : Leboncoin propose
// Saint-Maur-des-Fossés (94100)… ; 12 publications refusées puis bloquées.
//
// PAR SITE (principe international) : ce qui est « le code postal d'une commune » se lit dans la table du SITE
// (Leboncoin → la base officielle française, codes-postaux-fr.js) ; un site sans table n'a pas de règle (rien
// d'inventé). La zone (le département en France) borne les homonymes : Saint-Denis 93 n'est jamais Saint-Denis
// 974. Les mots qui ne font pas partie du nom de la commune (« CEDEX » en France) sont déclarés par site.
// Pur (Deno, Vite, Node) — lu par _shared/lbc-commune-meme-cp.js (serveur) et src/publication/villeLbc.js (app).
// Verrou : scripts/lbc-ville-cedex-repli-selftest.mjs.

import { codesPostauxFrancais } from "./lbc-adresse-france.js";
import { communeComparable } from "./lbc-voie-des-reglages.js";

const propre = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

function codesProchesFr(cp) {
  const c = String(cp ?? "");
  if (!/^\d{5}$/.test(c)) return "";
  const tous = [...codesPostauxFrancais()].sort();
  const p4 = tous.filter((x) => x.startsWith(c.slice(0, 4)) && x !== c);
  if (p4.length >= 1 && p4.length <= 3) return p4.join(", ");
  if (c.endsWith("000")) {
    const arr = tous.filter((x) => x.startsWith(c.slice(0, 3)) && Number(x.slice(3)) >= 1 && Number(x.slice(3)) <= 20);
    if (arr.length >= 2) return `${arr[0]} à ${arr[arr.length - 1]}`;
  }
  if (p4.length > 3) return `${p4[0]} à ${p4[p4.length - 1]}`;
  return "";
}

/**
 * LA TABLE PAR SITE. Un site absent : la règle ne s'applique pas.
 *   format         : forme d'un code postal du pays ;
 *   codeDeCommune  : ce code est-il celui d'une commune (base officielle du pays) ?
 *   zone           : la zone qui borne les homonymes (France : département, 3 chiffres outre-mer) ;
 *   horsNom        : mots qui ne font pas partie du nom d'une commune (France : CEDEX et son numéro) ;
 *   codesProches   : texte court des codes de commune qui commencent comme un code donné (pour la question).
 */
export const SITES_CODES_POSTAUX = Object.freeze({
  leboncoin: Object.freeze({
    pays: "FR",
    format: /^\d{5}$/,
    codeDeCommune: (cp) => /^\d{5}$/.test(String(cp ?? "")) && codesPostauxFrancais().has(String(cp)),
    zone: (cp) => (/^9[78]/.test(String(cp)) ? String(cp).slice(0, 3) : String(cp).slice(0, 2)),
    horsNom: /(^|\s)cedex(\s+\d{1,2})?(?=\s|$)/gi,
    codesProches: codesProchesFr,
  }),
});

const table = (site) => SITES_CODES_POSTAUX[String(site ?? "")] ?? null;

/** Le nom de la commune sans les mots qui n'en font pas partie (par site) — la casse de la personne est gardée. */
export function nomDeCommune(site, ville) {
  const t = table(site);
  const v = propre(ville);
  return t ? propre(v.replace(t.horsNom, " ")) : v;
}

/** Ce code est-il celui d'une commune, pour ce site ? null : site sans table. */
export function codeDeCommuneDuSite(site, cp) {
  const t = table(site);
  return t ? t.codeDeCommune(propre(cp)) : null;
}

/** Les codes de commune qui commencent comme `cp` (texte court), pour ce site. */
export function codesProchesDuSite(site, cp) {
  const t = table(site);
  return t ? t.codesProches(propre(cp)) : "";
}

// Les codes d'une source pour CETTE commune : même nom (comparable), code de commune du site, même zone.
function codesDeLaSource(t, cle, zone, liste) {
  const parCode = new Map();
  for (const x of Array.isArray(liste) ? liste : []) {
    if (!x || typeof x !== "object") continue;
    const cp = propre(x.code_postal ?? x.cp);
    if (!t.codeDeCommune(cp) || t.zone(cp) !== zone) continue;
    if (communeComparable(propre(String(x.ville ?? "").replace(t.horsNom, " "))) !== cle) continue;
    if (!parCode.has(cp)) parCode.set(cp, propre(x.source) || null);
  }
  return parCode;
}

/**
 * LE VRAI CODE POSTAL DE LA COMMUNE d'une ville de publication. Pur.
 * @param {{ site: string, ville: string, code_postal: string,
 *   adresses?: Array<{ ville: string, code_postal: string }>,
 *   communesSite?: Array<{ ville: string, code_postal: string, source?: string }> }} arg
 *   adresses     : l'adresse du vendeur (champs structurés, et/ou lue dans l'adresse en une ligne) — prioritaire ;
 *   communesSite : les communes que la PLATEFORME connaît avec leur code (localisation de ses annonces, propositions
 *                  de son autocomplétion, localisation d'origine d'une republication).
 * @returns {{ verdict: "site_sans_table" } | { verdict: "deja_commune" }
 *   | { verdict: "repli", ville: string, code_postal: string, source: string, source_detail: string|null }
 *   | { verdict: "question", motif: "inconnu" | "plusieurs_codes" | "ville_vide", codes?: string[], source?: string, codes_proches: string }}
 */
export function vraiCodePostalDeLaCommune({ site, ville, code_postal, adresses = [], communesSite = [] }) {
  const t = table(site);
  if (!t) return { verdict: "site_sans_table" };
  const cp = propre(code_postal);
  if (t.codeDeCommune(cp)) return { verdict: "deja_commune" };
  const codes_proches = t.format.test(cp) ? t.codesProches(cp) : "";
  const nom = nomDeCommune(site, ville);
  const cle = communeComparable(nom);
  if (!cle || !t.format.test(cp)) return { verdict: "question", motif: "ville_vide", codes_proches };
  const zone = t.zone(cp);
  // 1. L'adresse du vendeur, si c'est la même commune.
  const parAdresse = codesDeLaSource(t, cle, zone, adresses);
  if (parAdresse.size === 1) {
    const [code] = [...parAdresse.keys()];
    return { verdict: "repli", ville: nom, code_postal: code, source: "adresse", source_detail: parAdresse.get(code) };
  }
  if (parAdresse.size > 1) return { verdict: "question", motif: "plusieurs_codes", codes: [...parAdresse.keys()].sort(), source: "adresse", codes_proches };
  // 2. Sinon la commune que la plateforme connaît, avec son code.
  const parSite = codesDeLaSource(t, cle, zone, communesSite);
  if (parSite.size === 1) {
    const [code] = [...parSite.keys()];
    return { verdict: "repli", ville: nom, code_postal: code, source: parSite.get(code) || "plateforme", source_detail: null };
  }
  if (parSite.size > 1) return { verdict: "question", motif: "plusieurs_codes", codes: [...parSite.keys()].sort(), source: "plateforme", codes_proches };
  // 3. Rien de sûr : la question.
  return { verdict: "question", motif: "inconnu", codes_proches };
}
