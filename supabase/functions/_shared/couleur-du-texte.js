// ══════════════════════════════════════════════════════════════════════════
// LA COULEUR ÉCRITE DANS LE TITRE OU LE TEXTE GAGNE TOUJOURS (26/10, étape 5 — règle de Nico)
// ══════════════════════════════════════════════════════════════════════════
// CE QUI L'A PROVOQUÉ : Jocabroc, « Pot à sucre Sarreguemines bleu marine à pois blancs » (1792928353086005) — la
// couleur déclarée sur son annonce Vinted (« Blanc », lue sur la page publique par la 0.6.144) a remplacé le « Bleu »
// que Leboncoin avait pré-rempli d'après le titre ; « Grand plat à huîtres … vert d'eau » (Vinted « Menthe », hors de
// la liste Leboncoin) est parti sans couleur. 52 dépôts Leboncoin depuis le 20/10 posaient une couleur contre le
// pré-rempli, ~22 contre le titre (« bleu marine » → « Bleu / Ciel », « kaki » → « Vert », « Noir » → « Marine »).
// LA RÈGLE — on ne devine jamais :
//   · le TITRE d'abord, puis la première phrase du texte ; une expression composée avant un mot seul (« bleu
//     marine », « vert d'eau », « blanc cassé ») ;
//   · une couleur de DÉCOR n'est pas la couleur de l'article : « à pois blancs », « carreaux jaunes », « logo
//     rouge », « fleurs bleues », « doublure noire »… ;
//   · les mots à double sens (rose, orange, marine, or, argent, crème, bordeaux, prune…) ne comptent que dans une
//     expression ou après « couleur » (« couleur rose ») ;
//   · deux couleurs principales différentes (« noir et blanc ») → rien (la valeur d'avant reste).
// Ce module ne fait que LIRE ; la valeur servie est une option de la liste de la plateforme quand elle est connue
// (optionCouleurDansListe), sinon la couleur de base que toutes les listes portent. La fiche n'est jamais réécrite.
// ES module pur (Deno + Node + Vite), sans dépendance.

const plier = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[’'`]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();

/** Expressions composées : [motif plié, couleur, base, préférences de liste (de la plus précise à la plus large)]. */
const COMPOSEES = [
  ["bleu marine", "Bleu marine", "Bleu", ["marine", "bleu"]],
  ["bleu nuit", "Bleu marine", "Bleu", ["marine", "bleu"]],
  ["bleu ciel", "Bleu ciel", "Bleu", ["ciel", "bleu"]],
  ["bleu clair", "Bleu", "Bleu", ["bleu", "ciel"]],
  ["bleu fonce", "Bleu", "Bleu", ["bleu", "marine"]],
  ["bleu roi", "Bleu", "Bleu", ["bleu"]],
  ["bleu canard", "Bleu", "Bleu", ["bleu", "turquoise"]],
  // (19/11, compte 8ac5bbda) « T-Shirt Bleu Turquoise » se lisait « bleu » : parti « Bleu / Ciel » chez Leboncoin.
  ["bleu turquoise", "Turquoise", "Bleu", ["turquoise", "bleu"]],
  ["vert d'eau", "Vert d'eau", "Vert", ["vert"]],
  ["vert deau", "Vert d'eau", "Vert", ["vert"]],
  ["vert kaki", "Kaki", "Kaki", ["kaki", "vert"]],
  ["vert olive", "Vert", "Vert", ["vert", "kaki"]],
  ["vert sapin", "Vert", "Vert", ["vert"]],
  ["vert pomme", "Vert", "Vert", ["vert"]],
  ["vert menthe", "Vert", "Vert", ["vert"]],
  ["gris chine", "Gris", "Gris", ["gris"]],
  ["gris anthracite", "Gris", "Gris", ["anthracite", "gris"]],
  ["gris clair", "Gris", "Gris", ["gris"]],
  ["gris fonce", "Gris", "Gris", ["gris", "anthracite"]],
  ["blanc casse", "Blanc cassé", "Blanc", ["blanc casse", "ecru", "creme", "blanc"]],
  ["blanc creme", "Blanc cassé", "Blanc", ["blanc casse", "creme", "blanc"]],
  ["rose poudre", "Rose", "Rose", ["rose"]],
  ["rose pale", "Rose", "Rose", ["rose"]],
  ["rose fuchsia", "Rose", "Rose", ["fuchsia", "rose"]],
  ["rouge bordeaux", "Bordeaux", "Rouge", ["bordeaux", "rouge"]],
  ["jaune moutarde", "Jaune", "Jaune", ["moutarde", "jaune"]],
  ["or rose", "Or rose", "Rose", ["or rose", "rose"]],
];
/** Mots seuls sans ambiguïté (formes pliées, accords compris) → [couleur, base, préférences]. */
const SIMPLES = new Map();
const poserSimple = (formes, couleur, base = couleur, prefs = [plier(couleur)]) => { for (const f of formes) SIMPLES.set(f, [couleur, base, prefs]); };
poserSimple(["blanc", "blanche", "blancs", "blanches"], "Blanc");
poserSimple(["noir", "noire", "noirs", "noires"], "Noir");
poserSimple(["gris", "grise", "grises"], "Gris");
poserSimple(["bleu", "bleue", "bleus", "bleues"], "Bleu");
poserSimple(["rouge", "rouges"], "Rouge");
poserSimple(["vert", "verte", "verts", "vertes"], "Vert");
poserSimple(["jaune", "jaunes"], "Jaune");
poserSimple(["violet", "violette", "violets", "violettes"], "Violet");
poserSimple(["marron", "marrons"], "Marron");
poserSimple(["beige", "beiges"], "Beige");
poserSimple(["kaki", "kakis"], "Kaki", "Kaki", ["kaki", "vert"]);
poserSimple(["turquoise", "turquoises"], "Turquoise", "Bleu", ["turquoise", "bleu"]);
poserSimple(["dore", "doree", "dores", "dorees"], "Doré", "Doré", ["dore", "or"]);
poserSimple(["argente", "argentee", "argentes", "argentees"], "Argenté", "Argenté", ["argente", "argent"]);
poserSimple(["multicolore", "multicolores"], "Multicolore");
poserSimple(["ecru", "ecrue", "ecrus", "ecrues"], "Écru", "Beige", ["ecru", "creme", "beige"]);
poserSimple(["camel"], "Camel", "Beige", ["camel", "beige"]);
/** Mots à double sens : seulement après « couleur ». */
const AMBIGUS = new Map([
  ["rose", ["Rose", "Rose", ["rose"]]], ["orange", ["Orange", "Orange", ["orange"]]], ["marine", ["Bleu marine", "Bleu", ["marine", "bleu"]]],
  ["or", ["Doré", "Doré", ["dore", "or"]]], ["argent", ["Argenté", "Argenté", ["argente", "argent"]]], ["creme", ["Crème", "Beige", ["creme", "ecru", "beige"]]],
  ["bordeaux", ["Bordeaux", "Rouge", ["bordeaux", "rouge"]]], ["prune", ["Violet", "Violet", ["violet", "prune"]]], ["corail", ["Orange", "Orange", ["corail", "orange"]]],
  ["moutarde", ["Jaune", "Jaune", ["moutarde", "jaune"]]], ["fuchsia", ["Rose", "Rose", ["fuchsia", "rose"]]], ["mauve", ["Violet", "Violet", ["mauve", "violet"]]],
]);
/** Un mot de décor juste avant la couleur (jusqu'à 3 mots) : ce n'est pas la couleur de l'article. */
const DECOR = new Set(["pois", "carreaux", "carreau", "rayures", "rayure", "raye", "rayee", "motif", "motifs", "decor", "decors", "fleur", "fleurs",
  "imprime", "imprimes", "lisere", "liseres", "doublure", "logo", "logos", "inscription", "inscriptions", "broderie", "broderies", "brode", "brodee",
  "detail", "details", "bande", "bandes", "points", "pastilles", "etoiles", "filet", "touche", "touches", "reflets", "nuances", "ecriture", "ecritures",
  "lettres", "liseret", "passepoil", "surpiqures", "boutons", "fermeture", "lacets", "semelle", "interieur", "dessin", "dessins", "illustration"]);

/** Les couleurs principales d'un texte, dans l'ordre (pur). */
function couleursPrincipales(texte) {
  const mots = plier(texte).split(" ").filter(Boolean);
  const trouvees = [];
  let finDecor = -9;   // l'index du dernier mot d'une couleur de décor : « à rayures bleues et blanches » → les deux
  for (let i = 0; i < mots.length; i++) {
    // Décor : le mot JUSTE avant (« pois blancs », « logo rouge »), ou la couleur suit une couleur de décor par
    // « et » / « ou » (« rayures bleues et blanches »). Jamais plus loin : « fleurs bleues fond blanc » → Blanc.
    const decor = DECOR.has(mots[i - 1]) || (["et", "ou"].includes(mots[i - 1]) && finDecor === i - 2);
    let prise = null;
    let long = 1;
    for (const [motif, couleur, base, prefs] of COMPOSEES) {
      const parts = motif.split(" ");
      if (parts.every((p, k) => mots[i + k] === p)) { prise = { couleur, base, prefs, mot: motif }; long = parts.length; break; }
    }
    if (!prise && SIMPLES.has(mots[i])) { const [couleur, base, prefs] = SIMPLES.get(mots[i]); prise = { couleur, base, prefs, mot: mots[i] }; }
    if (!prise && AMBIGUS.has(mots[i]) && mots[i - 1] === "couleur") { const [couleur, base, prefs] = AMBIGUS.get(mots[i]); prise = { couleur, base, prefs, mot: `couleur ${mots[i]}` }; }
    if (prise && !decor) trouvees.push(prise);
    if (prise && decor) finDecor = i + long - 1;
    i += long - 1;
  }
  return trouvees;
}

/**
 * La couleur ÉCRITE de l'article (pur) : le titre d'abord, puis la première phrase du texte.
 * @returns {{couleur:string, base:string, preferences:string[], mot:string, source:'titre'|'texte'}|null}
 */
export function couleurEcriteDansLeTexte(titre, description = "") {
  const premiere = String(description ?? "").split(/\n|(?<=[.!?])\s/)[0] ?? "";
  for (const [source, t] of [["titre", titre], ["texte", premiere]]) {
    const c = couleursPrincipales(t);
    if (!c.length) continue;
    const distinctes = [...new Set(c.map((x) => x.base))];
    if (distinctes.length > 1) return null;   // « noir et blanc » : deux couleurs, rien n'est choisi
    return { couleur: c[0].couleur, base: c[0].base, preferences: [...c[0].prefs], mot: c[0].mot, source };
  }
  return null;
}

/**
 * L'option EXACTE de la liste de la plateforme pour cette couleur (pur) : une option égale, ou une option composée
 * (« Marine / Turquoise », « Bleu / Ciel ») dont une composante est égale — dans l'ordre des préférences. null sinon.
 */
export function optionCouleurDansListe(trouvee, liste) {
  if (!trouvee || !Array.isArray(liste) || !liste.length) return null;
  const opts = liste.map((o) => ({ o: String(o), entiere: plier(o), composantes: String(o).split(/\s*\/\s*|\s+-\s+/).map((x) => plier(x)).filter(Boolean) }));
  for (const p of [plier(trouvee.couleur), ...trouvee.preferences.map(plier), plier(trouvee.base)]) {
    const exacte = opts.find((x) => x.entiere === p) ?? opts.find((x) => x.composantes.includes(p));
    if (exacte) return exacte.o;
  }
  return null;
}

// ══ (19/11/2026, compte 8ac5bbda — publications en série des 17 et 18/11) ══════════════════════════════════════════════
// Constat (relu sur Leboncoin après le dépôt) : un T-shirt « Bleu Turquoise » (fiche Vinted « Turquoise ») et un jean
// « Bleu Foncé » (fiche « Marine ») partis en « Bleu / Ciel », alors que Leboncoin avait pré-rempli « Marine / Turquoise » ;
// un pull « Bleu clair » parti SANS couleur chez Beebs (palette : « Bleu », « Bleu ciel », pas « Bleu clair »).
// RÈGLES (le titre gagne toujours quand il écrit une AUTRE couleur ou une nuance — 26/10, inchangé) :
//   · la NUANCE de la fiche (Turquoise, Marine, Bordeaux…) PRÉCISE le mot de BASE du titre (« bleu », « couleur rouge »)
//     ou une expression dont elle est une préférence (« bleu foncé » → marine) : c'est la même couleur, mieux dite ;
//   · une couleur de fiche s'écrit dans la palette d'une plateforme par le même vocabulaire (« Bleu clair » → « Bleu »,
//     « Marine » → « Bleu Marine ») ; rien d'écrit ni de connu → rien (jamais une couleur voisine inventée).

/** Une couleur SANS double sens (« Bleu », « Violet », « bleu marine » — jamais « Rose », « Orange », « Or ») (pur). */
export function estCouleurSansAmbiguite(valeur) {
  const p = plier(valeur);
  return Boolean(p) && (SIMPLES.has(p) || COMPOSEES.some(([motif]) => motif === p));
}

/** Une couleur écrite comme VALEUR d'un champ (fiche, copie, option) : { couleur, base, preferences, mot } ou null.
 *  Une valeur n'est pas un texte : « Marine », « Rose » y sont des couleurs, sans « couleur » devant. */
export function lireCouleurDeLaValeur(valeur) {
  const p = plier(valeur);
  if (!p) return null;
  const compose = COMPOSEES.find(([motif]) => motif === p);
  if (compose) return { couleur: compose[1], base: compose[2], preferences: [...compose[3]], mot: compose[0] };
  const simple = SIMPLES.get(p) ?? AMBIGUS.get(p);
  return simple ? { couleur: simple[0], base: simple[1], preferences: [...simple[2]], mot: p } : null;
}

/**
 * L'option de la liste que la couleur de la FICHE donne quand elle précise la couleur écrite (pur) ; null sinon — l'appelant
 * garde alors la couleur écrite (optionCouleurDansListe). Seulement : fiche = une nuance (couleur ≠ base) de la MÊME base ;
 * titre = la base seule (un mot, ou « couleur X »), ou une expression qui prévoit cette nuance (« bleu foncé » → marine) ;
 * et une option différente de celle du titre. « bleu marine » écrit + fiche Turquoise, « bleu clair » + Marine,
 * « vert » + Kaki : le titre.
 */
export function optionCouleurPrecisee(ecrite, couleurFiche, liste) {
  if (!ecrite || !Array.isArray(liste) || !liste.length) return null;
  const f = lireCouleurDeLaValeur(couleurFiche);
  if (!f || f.base !== ecrite.base || plier(f.couleur) === plier(f.base)) return null;
  // Une nuance dont le vocabulaire dit qu'elle est D'ABORD un <base> (marine, turquoise → bleu ; bordeaux → rouge) ;
  // jamais une couleur voisine rangée sous la même base (crème, écru ≠ beige : rejeu 30 j, 9 « beige » + fiche « Crème »).
  if (plier(f.preferences[1] ?? "") !== plier(f.base)) return null;
  if (plier(ecrite.couleur) !== plier(ecrite.base)) return null;
  const motSeul = !String(ecrite.mot ?? "").includes(" ") || String(ecrite.mot).startsWith("couleur ");
  if (!motSeul && !(ecrite.preferences ?? []).map(plier).includes(plier(f.preferences[0]))) return null;
  const deLaFiche = optionCouleurDansListe(f, liste);
  return deLaFiche && deLaFiche !== optionCouleurDansListe(ecrite, liste) ? deLaFiche : null;
}

/**
 * Une couleur (de la fiche, de la copie) écrite dans la PALETTE d'une plateforme (pur) : { valeur, de, motif } ou null —
 * null quand elle y est déjà (casse et accents près), qu'elle est vide, inconnue du vocabulaire, ou sans option.
 */
export function couleurDansLaPalette(valeur, liste) {
  const v = String(valeur ?? "").trim();
  const opts = (Array.isArray(liste) ? liste : []).map((o) => String(o ?? "").trim()).filter(Boolean);
  if (!v || !opts.length || opts.some((o) => plier(o) === plier(v))) return null;
  // Une FAMILLE d'une autre plateforme (« Rouge / Bordeaux », « Marine / Turquoise » de Leboncoin) : seulement la base que
  // toutes ses parties partagent (« Rouge », « Bleu ») — jamais l'une des deux choisie (rejeu 30 j : « Rouge / Bordeaux »).
  const parts = v.split(/\s*\/\s*/).filter(Boolean);
  if (parts.length > 1) {
    const lues = parts.map(lireCouleurDeLaValeur);
    const bases = [...new Set(lues.map((x) => x?.base ?? null))];
    if (lues.some((x) => !x) || bases.length !== 1) return null;
    const o = optionCouleurDansListe({ couleur: bases[0], base: bases[0], preferences: [] }, opts);
    return o ? { valeur: o, de: v, motif: `« ${v} » (une famille) écrite « ${o} », sa base, dans la palette` } : null;
  }
  const lue = lireCouleurDeLaValeur(v);
  const o = lue ? optionCouleurDansListe(lue, opts) : null;
  return o ? { valeur: o, de: v, motif: `« ${v} » écrite « ${o} » dans la palette (vocabulaire des couleurs)` } : null;
}
