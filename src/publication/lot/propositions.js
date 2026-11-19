// ═══════════════════════════════════════════════════════════════════════════
// UNE PROPOSITION PAR ARTICLE, POUR CHAQUE QUESTION QUI RESTE (19/11/2026 soir — exigence de Nico : 200 articles)
// ═══════════════════════════════════════════════════════════════════════════
// « Tout ce qui se devine est rempli, ARTICLE PAR ARTICLE : une doudoune et un jean n'ont pas la même matière. Chaque
// article a sa propre valeur proposée, tirée de son titre, de sa description, de ses photos et de son rayon. Les
// questions qui restent sont regroupées PAR CHAMP […] une ligne par article avec SA proposition […] un seul « Tout
// valider » pour le groupe. JAMAIS une même valeur imposée à tous. »
// LA RÈGLE : pour une question qui reste (le moteur n'a rien trouvé), la valeur la plus probable DE LA LISTE de la
// plateforme pour CET article : une valeur de la liste écrite dans son titre, sa description, son rayon ou l'objet
// nommé par l'IA (la plus longue d'abord) ; sinon, pour la matière seulement, la matière typique de l'objet (une
// doudoune : polyester ; un jean : coton) — toujours une valeur de la liste, jamais une valeur inventée hors liste ;
// pour « Pour qui », le genre écrit (femme, homme, fille…) ou celui de l'objet (des boutons de manchette : homme).
// Rien de probable : null — la ligne dit « à choisir », jamais une valeur au hasard.
// ⛔ Une proposition n'est qu'une proposition : rien ne part sans le geste « Tout valider » (ou la ligne touchée).
// Pur (Node + Vite) : scripts/questions-par-champ-1911-selftest.mjs.

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Une valeur de la liste écrite dans le texte (mot entier ; la plus longue d'abord), ou null. */
export function valeurDansLeTexte(valeurs, texte) {
  const t = ` ${norm(texte)} `;
  if (!t.trim()) return null;
  const tri = [...new Set((valeurs ?? []).map(String).filter(Boolean))].sort((a, b) => norm(b).length - norm(a).length);
  for (const v of tri) {
    const n = norm(v);
    if (n.length >= 3 && t.includes(` ${n} `)) return v;
    // un pluriel simple (« vestes » pour « Veste »)
    if (n.length >= 4 && t.includes(` ${n}s `)) return v;
  }
  return null;
}

// La matière typique d'un objet (premier motif qui nomme l'objet), en mots à chercher dans la liste de la plateforme.
const MATIERE_DE_L_OBJET = [
  [/doudoune|parka|anorak|polaire|coupe[- ]vent|k[- ]?way|softshell/, ["Polyester", "Nylon", "Synthétique"]],
  [/\bjeans?\b|denim/, ["Coton", "Denim", "Jean"]],
  [/t[- ]?shirt|tee[- ]?shirt|debardeur|polo|chemise|sweat|hoodie|jogging/, ["Coton"]],
  [/\bpulls?\b|gilet|cardigan|bonnet|echarpe|mohair|cachemire/, ["Laine", "Acrylique"]],
  [/legging|maillot de bain|brassiere|sport/, ["Élasthanne", "Polyester"]],
  [/perfecto|blouson cuir|veste en cuir|ceinture|portefeuille/, ["Cuir"]],
  [/\brobes?\b|\bjupes?\b|blouse|chemisier|\btops?\b/, ["Polyester", "Viscose", "Coton"]],
];
const GENRE_DE_L_OBJET = [
  [/boutons de manchette|cravate|noeud papillon|rasoir|costume homme/, "homme"],
  [/soutien[- ]gorge|nuisette|escarpins|robe/, "femme"],
];
const MOTS_GENRE = { femme: /\b(femmes?|woman|women|dame|fille adulte)\b/, homme: /\b(hommes?|man|men|monsieur|garcon adulte)\b/, fille: /\b(filles?|girl)\b/, garcon: /\b(garcons?|boy)\b/, bebe: /\b(bebes?|naissance|baby)\b/ };
const ALIAS_GENRE = { femme: ["Femme", "Femmes", "Femmes adultes"], homme: ["Homme", "Hommes", "Hommes adultes"], fille: ["Fille", "Filles"], garcon: ["Garçon", "Garçons"], bebe: ["Bébé", "Bébés"] };

/** La valeur de la liste qui dit ce genre (« Femmes », « Homme »…), ou null. */
function genreDansLaListe(genre, valeurs) {
  for (const a of ALIAS_GENRE[genre] ?? []) {
    const v = (valeurs ?? []).find((x) => norm(x) === norm(a));
    if (v) return v;
  }
  return null;
}
const estChampGenre = (libelle) => /pour qui|departement|department|univers|genre|gender/i.test(norm(libelle));
const estChampMatiere = (libelle) => /matiere|material/i.test(norm(libelle));
const estChampTaille = (libelle) => /taille|pointure|size/i.test(norm(libelle));

/** La taille écrite dans le titre (« taille M », « T38 », « W32 », « 40 FR »), ou null. */
export function tailleDuTitre(titre, valeurs = []) {
  const t = norm(titre);
  const m = t.match(/\b(?:taille|t|size)\s*(xxs|xs|s|m|l|xl|xxl|xxxl|\d{2})\b/) ?? t.match(/\b(w\d{2})\b/);
  if (!m) return null;
  const brut = m[1].toUpperCase();
  if (!valeurs?.length) return brut;
  return valeurs.find((v) => norm(v) === norm(brut)) ?? valeurs.find((v) => norm(v).split(" ").includes(norm(brut))) ?? null;
}

// (19/11 soir, banc à 200) L'ÉTAT ÉCRIT PAR LA PERSONNE dans son titre ou sa description — jamais deviné de rien
// (13/11 : jamais « Très bon état » en silence ; ici c'est une proposition, validée d'un geste). Le plus précis d'abord.
// (19/11 soir, Nico : « neuf avec étiquette », « jamais porté », « porté quelques fois », traces d'usure…) D'abord le
// palier NOMMÉ (le plus précis d'abord), puis l'usage DÉCRIT ; une négation (« pas neuf ») n'est jamais lue.
const ETATS_ECRITS = [
  [/\bneufs? avec (?:l |son |ses |leurs? )?etiquettes?\b|\bavec (?:l |son |ses )?etiquettes?\b|\betiquettes? (?:encore )?(?:attachees?|presentes?|d origine)\b|\bnwt\b/, ["Neuf avec étiquette"]],
  [/\bneufs? sans etiquettes?\b|\bjamais (?:ete )?(?:portee?s?|servie?s?|utilisee?s?|mise?s?|lavee?s?)\b|\betat neuf\b|(?<!comme )\bneufs?\b|(?<!comme )\bneuves?\b/, ["Neuf sans étiquette"]],
  [/\btres bon etat\b|\btbe\b|\bexcellent etat\b|\bparfait etat\b|\bcomme neufs?\b|\bcomme neuves?\b|\b(?:tres )?peu (?:portee?s?|servie?s?|utilisee?s?)\b|\bportee?s? (?:une|1|deux|2|trois|3|quelques) (?:fois|soirees?)\b/, ["Très bon état"]],
  [/\bbon etat\b|\bbe\b|\bportee?s? plusieurs fois\b|\blegeres? traces?\b/, ["Bon état"]],
  [/\betat (?:satisfaisant|correct|moyen|d usage)\b|\btraces? d usure\b|\busure (?:visible|normale)\b|\busee?s?\b|\bdefauts?\b|\btaches?\b|\bbouloches?\b/, ["Satisfaisant"]],
];
const NEGATION_ETAT = /\b(?:pas|plus|non|jamais) (?:tres |vraiment |tout a fait |encore )?(?:neuf|neuve|neufs|neuves|en bon etat|en tres bon etat)\b/;

/** L'état écrit dans le texte de l'article (titre, description), parmi les valeurs de la liste ; sinon null. */
export function etatEcrit(texte, valeurs = []) {
  const t0 = norm(texte);
  if (!t0) return null;
  // Une négation retire sa phrase (« pas neuf », « plus en bon état ») : jamais lue comme un palier.
  const t = t0.replace(new RegExp(NEGATION_ETAT.source, "g"), " ");
  for (const [re, noms] of ETATS_ECRITS) {
    if (!re.test(t)) continue;
    for (const nom of noms) { const v = (valeurs ?? []).find((x) => norm(x) === norm(nom)); if (v) return v; }
    return null;
  }
  return null;
}

// ═══ (19/11 soir, exigence de Nico — « une question, c'est un échec de notre déduction ») LA DÉDUCTION ═══════════════
// DÉDUIRE = LIRE l'article : ce qui est ÉCRIT (titre, description), le RAYON de ses copies, le genre déjà porté par une
// autre de ses copies, l'objet nommé par l'IA (photos). Une déduction se POSE d'office (marquée « déduit », modifiable,
// jamais réécrite après un changement de la personne) ; une PROPOSITION (le probable : la matière typique d'une
// doudoune, un rayon candidat, « Mixte ») reste une question, avec sa valeur proposée. Toujours une valeur de LA LISTE.
const ALIAS_PUBLIC = {
  femme: ["Femme", "Femmes", "Women", "Woman", "Femmes adultes"],
  homme: ["Homme", "Hommes", "Men", "Man", "Hommes adultes"],
  fille: ["Fille", "Filles", "Girls", "Girl"],
  garcon: ["Garçon", "Garçons", "Boys", "Boy"],
  enfant: ["Enfant", "Enfants", "Kids", "Children"],
  bebe: ["Bébé", "Bébés", "Baby", "Babies"],
  maternite: ["Maternité", "Maternity"],
  mixte: ["Mixte", "Unisexe", "Unisex"],
};
// Un public absent de la liste se dit autrement (Leboncoin : « Bébé » n'existe pas dans Univers → Enfant).
const PUBLIC_DE_REPLI = { bebe: ["enfant"], fille: ["enfant"], garcon: ["enfant"] };
const PUBLIC_ECRIT = [
  ["maternite", /\b(maternite|grossesse|allaitement|femme enceinte)\b/],
  ["bebe", /\b(bebes?|naissance|nourrisson|layette)\b/],
  ["fille", /\b(filles?|fillette)\b/],
  ["garcon", /\b(garcons?)\b/],
  ["enfant", /\b(enfants?|kids?)\b/],
  ["femme", /\b(femmes?|dame)\b/],
  ["homme", /\b(hommes?|monsieur)\b/],
  ["mixte", /\b(mixte|unisexe|unisex)\b/],
];
// Un âge ne se lit que dans le TITRE (« Robe 6 ans », « Body 3 mois ») : dans une description, « 2 ans » dit souvent
// « acheté il y a 2 ans ».
const AGES_DU_TITRE = [["bebe", /\b\d{1,2} mois\b/], ["enfant", /\b\d{1,2} ans\b/]];
// (banc à 40 : « Bijoux pour hommes » chez eBay, « Mode › Homme › Accessoires (homme) » chez Beebs, et la question
// « Pour qui ? » posée sur Vinted) Le public se lit dans N'IMPORTE QUEL niveau du rayon de N'IMPORTE QUELLE copie, en mot
// entier ; deux copies qui se contredisent (femme / homme) : rien de sûr.
const PUBLIC_DU_CHEMIN = [
  ["maternite", /\b(maternite|grossesse)\b/], ["bebe", /\b(bebes?|layette|puericulture)\b/],
  ["fille", /\b(filles?)\b/], ["garcon", /\b(garcons?)\b/], ["enfant", /\b(enfants?|kids?)\b/],
  ["femme", /\b(femmes?|women)\b/], ["homme", /\b(hommes?|men)\b/],
];
const PUBLIC_DE_L_OBJET = [
  [/\b(body|bodies|grenouillere|bavoir|turbulette|gigoteuse|pyjama bebe|chaussons bebe)\b/, "bebe"],
  [/\b(soutien gorge|brassiere de grossesse|nuisette|escarpins|culotte)\b/, "femme"],
  [/\b(boutons de manchette|cravate|noeud papillon|caban homme)\b/, "homme"],
];

/** Le public LU sur l'article (« femme », « bebe »…), avec sa source, ou null (rien de lisible, ou contradictoire). */
export function publicLu({ titre = "", description = "", chemins = [], genres = [], objet = null } = {}) {
  const dansTexte = (t, ages = false) => { const n = norm(t); return [...PUBLIC_ECRIT, ...(ages ? AGES_DU_TITRE : [])].filter(([, re]) => re.test(n)).map(([g]) => g); };
  const unique = (vus) => {
    const adultes = vus.filter((g) => g === "femme" || g === "homme");
    if (adultes.length > 1) return vus.includes("mixte") ? "mixte" : null; // « homme et femme » : rien de sûr
    // Le plus précis d'abord (maternité, bébé, fille, garçon, enfant), puis l'adulte nommé.
    return vus.find((g) => !["femme", "homme", "mixte"].includes(g)) ?? adultes[0] ?? (vus.includes("mixte") ? "mixte" : null);
  };
  const t = unique(dansTexte(titre, true)) ?? unique(dansTexte(description));
  if (t) return { public: t, source: "texte" };
  const vusChemins = [];
  for (const ch of chemins ?? []) {
    for (const seg of Array.isArray(ch) ? ch : String(ch ?? "").split(" > ")) {
      const n = norm(seg);
      const dans = PUBLIC_DU_CHEMIN.filter(([, re]) => re.test(n)).map(([g]) => g);
      if (dans.includes("femme") && dans.includes("homme")) continue; // « Homme & Femme » : ce niveau ne dit rien
      vusChemins.push(...dans);
    }
  }
  const c = unique([...new Set(vusChemins)]);
  if (c && c !== "mixte") return { public: c, source: "rayon" };
  for (const gv of genres ?? []) {
    const n = norm(gv);
    const g = Object.entries(ALIAS_PUBLIC).find(([, al]) => al.some((a) => norm(a) === n))?.[0];
    if (g && g !== "mixte") return { public: g, source: "copie" };
  }
  const o = norm(`${titre} ${objet ?? ""}`);
  const go = PUBLIC_DE_L_OBJET.find(([re]) => re.test(o))?.[1];
  return go ? { public: go, source: "objet" } : null;
}

/** La valeur de LA LISTE qui dit ce public (avec son repli : bébé → enfant), ou null. */
export function publicDansLaListe(pub, valeurs = []) {
  for (const g of [pub, ...(PUBLIC_DE_REPLI[pub] ?? [])]) {
    for (const a of ALIAS_PUBLIC[g] ?? []) {
      const v = (valeurs ?? []).find((x) => norm(x) === norm(a));
      if (v) return v;
    }
  }
  return null;
}

const VALEURS_JAMAIS_LUES = new Set(["autre", "autres", "aucun", "aucune", "non", "oui", "divers", "other", "none", "yes", "no", "standard", "classique", "normal"]);
export const estChampPublic = (libelle) => /pour qui|univers|departement|department|genre|gender|sexe|public/.test(norm(libelle));

/**
 * La DÉDUCTION d'une question pour un article — seulement ce qui se LIT ; null sinon (la question reste, avec sa
 * proposition s'il y en a une). Jamais la taille (elle se propage d'une grille à l'autre, le moteur la porte).
 * @param {{ libelle: string, valeurs?: string[], genre?: boolean, etat?: boolean }} q
 * @param {{ titre?, description?, chemins?, genres?, objet? }} a
 * @returns {null | { valeur: string, source: "texte" | "rayon" | "copie" | "objet" }}
 */
export function deduction(q, a = {}) {
  const valeurs = Array.isArray(q?.valeurs) ? q.valeurs.map(String).filter(Boolean) : [];
  if (estChampTaille(q?.libelle)) return null;
  if (!valeurs.length) return typeLuPourTexteLibre(q, a);
  if (q?.etat) {
    // (19/11 soir, décision de Nico : aucune hausse du coût IA) L'état se lit dans le TEXTE seul (la rédaction du stock
    // ne voit aucune photo).
    const v = etatEcrit(`${a.titre ?? ""} ${a.description ?? ""}`, valeurs);
    return v ? { valeur: v, source: "texte" } : null;
  }
  if (q?.genre || estChampPublic(q?.libelle)) {
    const lu = publicLu(a);
    const v = lu ? publicDansLaListe(lu.public, valeurs) : null;
    return v ? { valeur: v, source: lu.source } : null;
  }
  const lisibles = valeurs.filter((v) => !VALEURS_JAMAIS_LUES.has(norm(v)));
  const texte = `${a.titre ?? ""} ${a.description ?? ""} ${a.objet ?? ""}`;
  const v = valeurDansLeTexte(lisibles, texte);
  if (v) return { valeur: v, source: a.objet && !valeurDansLeTexte(lisibles, `${a.titre ?? ""} ${a.description ?? ""}`) ? "objet" : "texte" };
  // (19/11 soir, mesure à 200 : le « Type · eBay » de la fiche Kiabi — « T-shirt », écrit dans son rayon eBay
  // « T-shirts » — restait une question) Une valeur de la liste ÉCRITE dans le rayon d'une de ses copies se lit aussi.
  const r = valeurDansLeTexte(lisibles, (a.chemins ?? []).map((c) => (Array.isArray(c) ? c.join(" ") : String(c ?? ""))).join(" "));
  if (r) return { valeur: r, source: "rayon" };
  return typeLuPourTexteLibre(q, a);
}

// (19/11 soir, décision de Nico — « Style » eBay des leggings : obligatoire, en TEXTE LIBRE, la liste n'étant qu'une
// suggestion sans « Legging ») Pour un champ eBay en TEXTE LIBRE seulement (jamais une liste fermée), Style ou Type :
// quand le TITRE nomme le type de l'objet ET que ce mot est celui du rayon eBay de l'article (son dernier niveau :
// « legging » dans le rayon « Leggings »), ce mot est la valeur (« Legging »). Sinon rien : jamais un mot du titre au hasard.
const MOTS_JAMAIS_TYPE = new Set(["femme", "femmes", "homme", "hommes", "enfant", "enfants", "fille", "filles", "garcon", "garcons", "bebe", "bebes", "mixte", "autre", "autres", "divers", "test", "lot"]);
function typeLuPourTexteLibre(q, a) {
  if (!q?.texteLibre || !/^(style|type)\b/i.test(norm(q?.libelle))) return null;
  const chemin = Array.isArray(a.cheminEbay) ? a.cheminEbay : String(a.cheminEbay ?? "").split(" > ").filter(Boolean);
  const feuille = norm(chemin[chemin.length - 1] ?? "");
  if (!feuille) return null;
  const motsFeuille = new Set(feuille.split(" ").filter((w) => w.length >= 4));
  const mots = String(a.titre ?? "").split(/[^\p{L}-]+/u).map(norm).filter(Boolean);
  for (let i = 0; i < mots.length; i++) {
    const w = mots[i];
    if (w.length < 4 || MOTS_JAMAIS_TYPE.has(w)) continue;
    // « Rangement pour yaourtière » (exemple de Nico) : un mot suivi de « pour / de / à… » dit un accessoire ou un
    // complément, pas clairement le type de l'objet — rien.
    if (["pour", "de", "du", "des", "a", "au", "aux", "d"].includes(mots[i + 1] ?? "")) continue;
    const singulier = w.endsWith("s") ? w.slice(0, -1) : w;
    if (motsFeuille.has(w) || motsFeuille.has(`${singulier}s`) || motsFeuille.has(singulier)) {
      return { valeur: singulier.charAt(0).toUpperCase() + singulier.slice(1), source: "texte" };
    }
  }
  return null;
}

/**
 * La proposition pour UNE question d'UN article, ou null.
 * @param {{ libelle: string, valeurs?: string[], genre?: boolean }} q  le champ (son libellé, la liste de la plateforme)
 * @param {{ titre?: string, description?: string, rayon?: string[]|string|null, objet?: string|null }} a  l'article
 * @returns {null | { valeur: string, source: "texte" | "objet" | "titre" }}
 */
export function proposition(q, { titre = "", description = "", rayon = null, objet = null } = {}) {
  const valeurs = Array.isArray(q?.valeurs) ? q.valeurs : [];
  const rayonTxt = Array.isArray(rayon) ? rayon.join(" ") : String(rayon ?? "");
  const tout = `${titre} ${description} ${rayonTxt} ${objet ?? ""}`;
  if (estChampTaille(q?.libelle)) {
    const v = tailleDuTitre(titre, valeurs);
    return v ? { valeur: v, source: "titre" } : null;
  }
  if (q?.genre || estChampGenre(q?.libelle)) {
    const t = norm(`${titre} ${description} ${rayonTxt}`);
    for (const [g, re] of Object.entries(MOTS_GENRE)) if (re.test(t)) { const v = valeurs.length ? genreDansLaListe(g, valeurs) : g; if (v) return { valeur: v, source: "texte" }; }
    const o = norm(`${titre} ${objet ?? ""}`);
    for (const [re, g] of GENRE_DE_L_OBJET) if (re.test(o)) { const v = valeurs.length ? genreDansLaListe(g, valeurs) : g; if (v) return { valeur: v, source: "objet" }; }
    return null;
  }
  if (!valeurs.length) return null;
  const ecrite = valeurDansLeTexte(valeurs, tout);
  if (ecrite) return { valeur: ecrite, source: "texte" };
  if (estChampMatiere(q?.libelle)) {
    const o = norm(`${titre} ${objet ?? ""} ${rayonTxt}`);
    for (const [re, mots] of MATIERE_DE_L_OBJET) {
      if (!re.test(o)) continue;
      for (const mot of mots) { const v = valeurs.find((x) => norm(x) === norm(mot)) ?? valeurs.find((x) => norm(x).startsWith(norm(mot))); if (v) return { valeur: v, source: "objet" }; }
    }
  }
  return null;
}
