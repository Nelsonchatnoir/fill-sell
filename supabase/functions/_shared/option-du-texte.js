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

// ── L'ACCESSOIRE D'UN OBJET N'EST JAMAIS L'OBJET (18/10 soir, Nico) ─────────
// « House de couette 140x190 » (eBay, Type) : la règle lisait « couette » et
// posait « Couette » — l'annonce vend une HOUSSE. RÈGLE, pour toute plateforme
// et tout objet, sur un champ qui dit CE QU'EST l'article (Type, Sous-type,
// Produit, Catégorie, Univers) : « housse de… », « taie de… » (et la faute
// « house de… ») suivis d'un objet désignent l'accessoire. L'option qui nomme
// cet objet (Couette, Coussin, Canapé, Oreiller…) ne vaut jamais ; quand le texte
// en nommait une, seule une option qui nomme l'ACCESSOIRE (Housse, Housse de
// coussin, Taie d'oreiller, Étui…) peut répondre — sinon c'est la question,
// jamais une autre option lue à côté (« Lot », un personnage…).
// L'objet = le premier vrai mot après « de / d' / du / des / pour » ; un mot qui
// est lui-même l'accessoire (« de protection », « de transport », « étui ») se
// saute jusqu'à l'objet et reste lisible. Ce qui suit l'objet (« en coton »,
// « 140x190 ») se lit comme avant. Sans « de » (« Housse coussin velours »), le
// mot qui suit est l'objet quand le texte COMMENCE par l'accessoire (après une
// quantité : « Lot de 2 ») ; « drap(s) housse(s) » EST l'article ; un objet nommé
// AVANT l'accessoire (« Couvre-lit… avec taies d'oreiller ») reste l'article.
// ⛔ Les autres champs (Thème, Couleur, Matière, « Adapté à »…) ne changent pas :
//    pour un accessoire, l'objet y est souvent la bonne réponse (« Housse pour
//    iPad » → Adapté à : iPad ; « Housses de Noël pour coussins » → Thème : Noël).
export const TETES_ACCESSOIRE = new Set(["housse", "housses", "taie", "taies"]);
const FAUTES_ACCESSOIRE = { house: "housse", houses: "housses" };
const LIAISONS_ACCESSOIRE = new Set(["de", "d", "du", "des", "pour"]);
const MOTS_ACCESSOIRE = new Set(["protection", "rangement", "transport", "voyage", "rechange", "remplacement",
  "etui", "etuis", "coque", "coques", "pochette", "pochettes", "sac", "sacs", "sacoche", "sacoches"]);

/** Les mots, la faute « house de… » lue « housse de… ». */
function motsAccessoire(mots) {
  return mots.map((w, i) => (FAUTES_ACCESSOIRE[w] && LIAISONS_ACCESSOIRE.has(mots[i + 1]) ? FAUTES_ACCESSOIRE[w] : w));
}

// Où commence vraiment le texte, après « Lot de 2 », « Set de 3 », « 2 » (une quantité n'est pas un objet).
function debutApresQuantite(mots) {
  let k = 0;
  if (["lot", "lots", "set"].includes(mots[k])) k++;
  if (mots[k] === "de") k++;
  if (/^[0-9]+$/.test(mots[k] ?? "")) k++;
  return k;
}
// Le texte COMMENCE-t-il par l'accessoire (« Housse coussin… », « Lot de 2 housses… », « 2 taies… ») ?
const teteEnTete = (mots, i) => i === debutApresQuantite(mots);

/**
 * Les objets d'un accessoire : [{ tete, objets, accessoires }] — `objets` = les positions des mots de l'objet
 * (à ne jamais lire comme l'article : le premier, et celui qu'un « pour » nomme juste après — « housse étui
 * portefeuille pour smartphone »), `accessoires` = les positions des mots qui nomment l'accessoire.
 * Sans « de » (« Housse coussin velours »), seulement quand le texte commence par l'accessoire ; « drap(s)
 * housse(s) » EST l'article.
 */
export function zonesObjetAccessoire(mots) {
  const zones = [];
  for (let i = 0; i < mots.length; i++) {
    if (!TETES_ACCESSOIRE.has(mots[i]) || mots[i - 1] === "drap" || mots[i - 1] === "draps") continue;
    const suivant = mots[i + 1];
    const avecLiaison = LIAISONS_ACCESSOIRE.has(suivant);
    if (!avecLiaison && !(teteEnTete(mots, i) && suivant && !MOTS_VIDES.has(suivant) && !/^[0-9]/.test(suivant))) continue;
    const accessoires = [i];
    let j = i + 1;
    let objet = -1;
    for (let pas = 0; pas < 3 && j < mots.length; pas++) {
      while (j < mots.length && (LIAISONS_ACCESSOIRE.has(mots[j]) || MOTS_VIDES.has(mots[j]))) j++;
      if (j >= mots.length) break;
      if (!MOTS_ACCESSOIRE.has(mots[j])) { objet = j; break; }
      accessoires.push(j);
      j++;
    }
    if (objet <= i) continue;
    const objets = [objet];
    for (let k = objet + 1; k <= objet + 2 && k < mots.length - 1; k++) {
      if (mots[k] === "pour") {
        let o = k + 1;
        while (o < mots.length && MOTS_VIDES.has(mots[o])) o++;
        if (o < mots.length) objets.push(o);
        break;
      }
    }
    zones.push({ tete: i, objets, accessoires });
  }
  return zones;
}

// Une option qui nomme l'accessoire se lit aussi sans ses petits mots : « Housse de coussin » dans
// « housse coussin velours ».
function accessoireSansLiaison(mots, option, zones) {
  const ws = motsDe(option).filter((w) => !MOTS_VIDES.has(w));
  if (ws.length < 2 || !TETES_ACCESSOIRE.has(ws[0]) && !TETES_ACCESSOIRE.has(`${ws[0]}s`)) return null;
  for (const z of zones) {
    const suite = mots.slice(z.tete).filter((w) => !MOTS_VIDES.has(w)).slice(0, ws.length);
    if (suite.length === ws.length && ws.every((w, k) => memeMot(w, suite[k]))) {
      return { debut: z.tete, fin: z.tete + ws.length };
    }
  }
  return null;
}

/**
 * Les options nommées par un texte, et ce que l'accessoire y change (champ d'identité seulement).
 * → { trouvees, ecartee, accessoires } : `ecartee` = une option nommait l'OBJET d'un accessoire qui ouvre le
 *   texte (écartée) ; `accessoires` = les options qui nomment l'accessoire lui-même. Un objet nommé AVANT
 *   l'accessoire (« Couvre-lit … avec taies d'oreiller ») reste l'article : rien n'est restreint.
 */
function lireOptions(texte, options, identite) {
  const mots = identite ? motsAccessoire(motsDe(texte)) : motsDe(texte);
  const vide = { trouvees: [], ecartee: false, accessoires: new Set() };
  if (!mots.length) return vide;
  const zones = identite ? zonesObjetAccessoire(mots) : [];
  const surLObjet = (i) => zones.some((z) => z.objets.includes(i));
  const surLAccessoire = (i) => zones.some((z) => z.accessoires.includes(i));
  const premiereTete = zones.length ? Math.min(...zones.map((z) => z.tete)) : Infinity;
  const debut = debutApresQuantite(mots);
  let ecartee = false;
  let objetAvant = false;
  const accessoires = new Set();
  const trouvees = [];
  for (const option of options ?? []) {
    if (!String(option ?? "").trim() || estFourreTout(option)) continue;
    const portees = [];
    for (const m of morceaux(option)) {
      for (const i of positions(mots, m)) {
        if (surLObjet(i)) { ecartee = true; continue; }
        if (surLAccessoire(i)) accessoires.add(String(option));
        else if (i >= debut && i < premiereTete) objetAvant = true;
        portees.push({ debut: i, fin: i + m.length });
      }
    }
    if (zones.length && !accessoires.has(String(option))) {
      const p = accessoireSansLiaison(mots, option, zones);
      if (p) { accessoires.add(String(option)); portees.push(p); }
    }
    if (portees.length) trouvees.push({ option: String(option), portees });
  }
  // Une option dont CHAQUE correspondance tient dans celle, plus longue, d'une
  // autre option s'efface : « plat de service » nomme « Plat de service »,
  // pas « Plat ».
  const contenue = (p, autre) => autre.portees.some(
    (q) => q.fin - q.debut > p.fin - p.debut && q.debut <= p.debut && q.fin >= p.fin);
  return { trouvees: trouvees.filter((a) => !a.portees.every((p) => trouvees.some((b) => b !== a && contenue(p, b)))),
    ecartee: ecartee && !objetAvant, accessoires };
}

/**
 * Les options d'une liste qu'un texte NOMME, correspondances contenues dans
 * une plus longue effacées. Rend [{ option, portees: [{debut, fin}] }].
 * `identite` : le champ dit ce qu'est l'article (la règle de l'accessoire s'applique).
 */
export function optionsNommees(texte, options, { identite = false } = {}) {
  return lireOptions(texte, options, identite).trouvees;
}

/**
 * LA DÉDUCTION.
 * @param {object} d
 * @param {string[]} d.options  la liste fermée du champ (telle que la plateforme l'écrit)
 * @param {{source: string, texte: string}[]} d.textes  dans l'ordre : titre, objet IA, objet vérifié, description
 * @param {string} [d.cle]       clé du champ (sert à reconnaître un champ d'identité)
 * @param {string} [d.label]     libellé affiché du champ
 * @param {boolean|null} [d.identite]  force la nature « identité » (sinon déduite de cle/label)
 * @returns {{ valeur: string|null, source: string|null, candidats: string[] }}
 *   valeur    l'option à poser (écrite comme dans la liste), ou null ;
 *   candidats les options nommées quand elles sont plusieurs — à mettre en
 *             tête de la question.
 */
export function optionDepuisTextes({ options, textes, cle = "", label = "", identite = null }) {
  const liste = [...new Set((Array.isArray(options) ? options : []).map((o) => String(o ?? "").trim()).filter(Boolean))];
  if (!liste.length) return { valeur: null, source: null, candidats: [] };
  // (03/10) Un champ qui dit CE QU'EST l'objet ne se décide jamais sur la seule
  // description : elle cite des accessoires, des usages, des points de
  // fixation (kit lumières Kodak de geronimo0550 : « à fixer sur le cadre ou
  // la selle » → Produit « Selle » sur Leboncoin, à la place d'« Éclairage »).
  // Elle ne fait que départager les options nommées par le titre ou l'objet.
  const champIdentite = identite ?? champDIdentite(cle, label);
  let candidats = null;
  let sourceAmbigue = null;
  for (const { source, texte } of textes ?? []) {
    if (!String(texte ?? "").trim()) continue;
    const lu = lireOptions(texte, liste, champIdentite);
    const noms = [...new Set(lu.trouvees.map((x) => x.option))];
    // (18/10 soir) Le texte nommait l'OBJET d'un accessoire : seule une option qui nomme l'accessoire répond ;
    // sinon la question (avec ce qui a été nommé à côté en tête), jamais une autre option lue à côté.
    if (lu.ecartee && !candidats) {
      const acc = noms.filter((o) => lu.accessoires.has(o));
      if (acc.length === 1) return { valeur: acc[0], source, candidats: acc };
      return { valeur: null, source, candidats: acc.length ? acc : noms };
    }
    if (!noms.length) continue;
    if (!candidats) {
      if (champIdentite && source === "description") return { valeur: null, source, candidats: noms };
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
 * Le champ dit-il CE QU'EST l'objet (Produit, Type, Univers, Catégorie) ? Ces
 * champs-là ne se décident jamais sur la seule description (03/10).
 * Leboncoin : *_product, *_type, *_category, *_univers(e), decoration_type…
 */
export function champDIdentite(key, label = "") {
  const k = libelleComparable(key).replace(/ /g, "_");
  const l = ` ${libelleComparable(label)} `;
  if (/(^|_)(product|produit|type|types|category|categorie|univers|universe)$/.test(k)) return true;
  return / (produit|product|type|univers|universe|categorie|category) /.test(l);
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
