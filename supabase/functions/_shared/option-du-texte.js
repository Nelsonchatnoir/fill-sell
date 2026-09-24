// ══════════════════════════════════════════════════════════════════════════
// L'OPTION QUE L'ANNONCE NOMME DÉJÀ — CHAMPS À LISTE FERMÉE (2026-09-24)
// ══════════════════════════════════════════════════════════════════════════
// CAS FONDATEUR — job fc5e4bff (Jocabroc, Premium), Leboncoin « Maison &
// Jardin › Arts de la table », Univers « Accessoire de table ». Le Produit de
// l'annonce valait « Plat apéritif » — une option d'un AUTRE univers
// (Vaisselle de table), absente de la liste de celui-ci : Beurrier, Corbeille,
// Dessous de plat, Huilier et vinaigrier, Plateau, Rond de serviette, Salière,
// poivrière et sucrier, Seau à glaçons, Set de table, Sous verre. La question
// est partie chez le vendeur alors que le TITRE disait « plateau de service »
// et que l'IA avait identifié « plateau de service ». Nico a posé « Plateau »
// à la main : publié en trois minutes.
//
// LA RÈGLE. Quand la valeur d'un champ à liste fermée n'est pas dans la liste
// (ou manque, ou n'est que le fourre-tout « Autre »), on cherche une option DE
// LA LISTE, dans cet ordre :
//   1. le titre de l'annonce ;
//   2. l'objet identifié par l'IA (categorie_objet_ia, puis
//      categorie_verification.objet) ;
//   3. la description.
// La première source qui nomme UNE option la donne. Si elle en nomme
// plusieurs, une source suivante qui n'en nomme qu'UNE d'entre elles tranche ;
// sinon c'est une question — avec ces options EN TÊTE de la liste.
//
// ⛔ MOTS ENTIERS, jamais une sous-chaîne : « plat » n'est pas dans
//    « plateau ». Formes proches admises : pluriel en -s / -x (plateau /
//    plateaux, verre / verres), -al / -aux (bocal / bocaux), accents et casse
//    ignorés, « à / de / pour » interchangeables au milieu d'un libellé
//    (« seau pour glaçons » = « Seau à glaçons »).
// ⛔ Un libellé composé (« Salière, poivrière et sucrier ») se lit morceau par
//    morceau ; un morceau de plusieurs mots (« Dessous de plat ») se lit d'un
//    bloc. Une correspondance CONTENUE dans une plus longue s'efface
//    (« Bleu » dans « bleu marine » quand « Bleu marine » existe).
// ⛔ JAMAIS « Autre » ni « Autres » : ce n'est pas une option qu'un texte
//    nomme, c'est l'absence de réponse.
// ⛔ JAMAIS au hasard : rien → rien ; plusieurs → une question.
// ⛔ Les tailles, âges, marques, modèles, l'état et le colis ne passent JAMAIS
//    par ici (champDeductibleDuTexte) : une taille se TRADUIT (_shared/
//    tailles.js), elle ne se lit pas dans un titre ; une marque se cherche
//    dans un référentiel ; « comme neuf » n'est pas « Neuf » ; un poids se
//    mesure.
//
// ES module SANS import : chargé tel quel par Vite (moteur de publication,
// modale « Compléter ») et par Deno (update-job-status).
// Selftest : scripts/option-du-texte-selftest.mjs.

// Petits mots de liaison : interchangeables DANS un libellé, jamais un indice.
const MOTS_VIDES = new Set([
  "a", "au", "aux", "de", "du", "des", "d", "la", "le", "les", "l", "en", "et", "ou",
  "pour", "avec", "sans", "un", "une", "sur", "par", "the", "of", "and", "for",
]);

// Le fourre-tout d'une liste : jamais une réponse lue dans un texte.
export const OPTION_FOURRE_TOUT = /^(autres?|other|others|divers|non specifie)$/;

/** Les mots d'un texte : accents, casse et ponctuation retirés. */
export function motsDe(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

const libelleComparable = (s) => motsDe(s).join(" ");

/** Une option « Autre » / « Autres » (le fourre-tout de la liste) ? */
export function estFourreTout(option) {
  return OPTION_FOURRE_TOUT.test(libelleComparable(option));
}

// Formes proches d'un mot : singulier / pluriel, et rien d'autre.
function formes(mot) {
  const f = new Set([mot]);
  if (mot.length > 3) {
    if (/eaux$/.test(mot)) f.add(mot.slice(0, -1));                                      // plateaux → plateau
    if (/aux$/.test(mot)) { f.add(`${mot.slice(0, -3)}al`); f.add(mot.slice(0, -1)); }   // bocaux → bocal, tuyaux → tuyau
    if (/[sx]$/.test(mot)) f.add(mot.slice(0, -1));                                       // verres → verre
  }
  return f;
}

function memeMot(a, b) {
  if (a === b) return true;
  if (MOTS_VIDES.has(a) && MOTS_VIDES.has(b)) return true;
  const fa = formes(a);
  for (const x of formes(b)) if (fa.has(x)) return true;
  return false;
}

// Les morceaux d'un libellé, chacun en mots : « Salière, poivrière et
// sucrier » → [[saliere], [poivriere], [sucrier]]. Un morceau n'est gardé que
// s'il porte au moins un vrai mot (3 lettres ou plus, pas un mot de liaison).
function morceaux(option) {
  const brut = String(option ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return brut
    .split(/[,/;()|+]+|\s+et\s+|\s+&\s+/)
    .map(motsDe)
    .map((ws) => {
      // Les mots de liaison en bordure ne portent rien (« à thé » → « thé »).
      let a = 0, b = ws.length;
      while (a < b && MOTS_VIDES.has(ws[a])) a++;
      while (b > a && MOTS_VIDES.has(ws[b - 1])) b--;
      return ws.slice(a, b);
    })
    .filter((ws) => ws.some((w) => w.length >= 3 && !MOTS_VIDES.has(w)));
}

// Toutes les positions où un morceau apparaît, d'un bloc, dans le texte.
function positions(mots, morceau) {
  const out = [];
  for (let i = 0; i + morceau.length <= mots.length; i++) {
    let ok = true;
    for (let k = 0; k < morceau.length; k++) {
      if (!memeMot(morceau[k], mots[i + k])) { ok = false; break; }
    }
    if (ok) out.push(i);
  }
  return out;
}

/**
 * Les options d'une liste qu'un texte NOMME, correspondances contenues dans
 * une plus longue effacées. Rend [{ option, portees: [{debut, fin}] }].
 */
export function optionsNommees(texte, options) {
  const mots = motsDe(texte);
  if (!mots.length) return [];
  const trouvees = [];
  for (const option of options ?? []) {
    if (!String(option ?? "").trim() || estFourreTout(option)) continue;
    const portees = [];
    for (const m of morceaux(option)) {
      for (const i of positions(mots, m)) portees.push({ debut: i, fin: i + m.length });
    }
    if (portees.length) trouvees.push({ option: String(option), portees });
  }
  // Une option dont CHAQUE correspondance tient dans celle, plus longue, d'une
  // autre option s'efface : « plat de service » nomme « Plat de service »,
  // pas « Plat ».
  const contenue = (p, autre) => autre.portees.some(
    (q) => q.fin - q.debut > p.fin - p.debut && q.debut <= p.debut && q.fin >= p.fin);
  return trouvees.filter((a) => !a.portees.every((p) => trouvees.some((b) => b !== a && contenue(p, b))));
}

/**
 * LA DÉDUCTION.
 * @param {object} d
 * @param {string[]} d.options  la liste fermée du champ (telle que la plateforme l'écrit)
 * @param {{source: string, texte: string}[]} d.textes  dans l'ordre : titre, objet IA, objet vérifié, description
 * @returns {{ valeur: string|null, source: string|null, candidats: string[] }}
 *   valeur    l'option à poser (écrite comme dans la liste), ou null ;
 *   candidats les options nommées quand elles sont plusieurs — à mettre en
 *             tête de la question.
 */
export function optionDepuisTextes({ options, textes }) {
  const liste = [...new Set((Array.isArray(options) ? options : []).map((o) => String(o ?? "").trim()).filter(Boolean))];
  if (!liste.length) return { valeur: null, source: null, candidats: [] };
  let candidats = null;
  let sourceAmbigue = null;
  for (const { source, texte } of textes ?? []) {
    if (!String(texte ?? "").trim()) continue;
    const noms = [...new Set(optionsNommees(texte, liste).map((x) => x.option))];
    if (!noms.length) continue;
    if (!candidats) {
      if (noms.length === 1) return { valeur: noms[0], source, candidats: noms };
      candidats = noms;
      sourceAmbigue = source;
      continue;
    }
    // Une source suivante qui n'en nomme qu'UNE des candidates tranche.
    const departage = noms.filter((o) => candidats.includes(o));
    if (departage.length === 1) return { valeur: departage[0], source: `${sourceAmbigue}+${source}`, candidats };
  }
  return { valeur: null, source: sourceAmbigue, candidats: candidats ?? [] };
}

/**
 * Le champ peut-il se déduire d'un texte ? Non pour ce qui se TRADUIT (taille,
 * pointure, âge), se CHERCHE (marque, modèle), se CONSTATE (état) ou se MESURE
 * (colis, poids, format d'envoi). Tout autre champ à liste fermée : oui.
 * @param {string} key    clé du champ (code Vinted, for= Leboncoin, libellé Beebs, nom d'aspect eBay)
 * @param {string} label  libellé affiché, quand il existe
 */
export function champDeductibleDuTexte(key, label = "") {
  const k = libelleComparable(key).replace(/ /g, "_");
  const l = ` ${libelleComparable(label)} `;
  const kl = ` ${libelleComparable(String(key ?? "").replace(/_/g, " "))} `;
  const interdit = (re) => re.test(l) || re.test(kl);
  if (/(^|_)(size|sizes|taille|pointure|age|clothing_st)$/.test(k) || interdit(/ (taille|tailles|pointure|size|age|ages) /)) return false;
  if (/(^|_)(brand|marque|model|modele)$/.test(k) || interdit(/ (marque|brand|modele|model) /)) return false;
  if (/(^|_)(condition|etat)$/.test(k) || interdit(/ (etat|condition) /)) return false;
  if (interdit(/ (colis|parcel|poids|weight|package|format|envoi|livraison|shipping) /)) return false;
  if (/isbn|ean|gtin|mpn/.test(k)) return false;
  return true;
}

/**
 * Les sources, dans l'ordre de la règle, à partir d'un job ou d'une copie :
 * titre, objet IA, objet vérifié, description.
 */
export function textesDeLAnnonce({ titre, description, platformFields } = {}) {
  const pf = platformFields && typeof platformFields === "object" ? platformFields : {};
  const verif = pf.categorie_verification && typeof pf.categorie_verification === "object" ? pf.categorie_verification : {};
  return [
    { source: "titre", texte: String(titre ?? "") },
    { source: "objet_ia", texte: String(pf.categorie_objet_ia ?? "") },
    { source: "objet_verifie", texte: String(verif.objet ?? "") },
    { source: "description", texte: String(description ?? "") },
  ];
}

/** La liste avec les candidates EN TÊTE (question ambiguë), sans doublon. */
export function listeCandidatsDabord(options, candidats) {
  const liste = Array.isArray(options) ? options : [];
  const tete = (candidats ?? []).filter((c) => liste.includes(c));
  return [...tete, ...liste.filter((o) => !tete.includes(o))];
}
