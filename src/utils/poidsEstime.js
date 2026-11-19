// ═══════════════════════════════════════════════════════════════════════════
// LE POIDS ESTIMÉ SELON LE TYPE D'ARTICLE (19/11/2026, décision de Nico — Louis)
// ═══════════════════════════════════════════════════════════════════════════
// « Ne laisse PAS le poids à l'estimation de Leboncoin par défaut : c'est ce qui a gêné Louis (ses acheteurs lui
// demandaient de corriger un poids faux). Nous estimons le poids selon le type d'article (tiré du titre, du rayon et
// des photos), marqué « estimé », modifiable d'un geste, et le format du colis en découle. Seulement si l'article est
// impossible à identifier, on laisse Leboncoin estimer, sans barre de question. Même logique pour Vinted (taille du
// colis) et Beebs (poids). »
// LA RÈGLE : le poids EMBALLÉ typique de l'objet reconnu (table ci-dessous, mesurée à la louche sur des envois réels,
// prudente : jamais en dessous du vrai), lu dans le titre, puis le rayon, puis l'objet nommé par l'IA (photos). Le
// premier motif qui nomme l'objet décide (les objets précis avant les familles). Rien de reconnu : null — la
// plateforme estime, comme avant.
// ⛔ Un poids de la fiche ou choisi par la personne passe TOUJOURS devant : l'estimation ne comble que le vide.
// ⛔ Jamais écrit sur la fiche comme un poids connu : il part sur la copie, marqué `poids_estime`.
// Pur (Node + Vite) : scripts/poids-estime-selftest.mjs.

const sansAccents = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// [motif, grammes, nom] — l'ordre compte : le plus précis d'abord.
const TABLE = [
  // Gros objets et électroménager
  [/robots? aspirateurs?|aspirateurs? robots?/, 4500, "robot aspirateur"],
  [/aspirateur/, 6000, "aspirateur"],
  [/micro[- ]?ondes/, 14000, "micro-ondes"],
  [/poussette/, 10000, "poussette"],
  [/\bvelo\b|trottinette/, 12000, "vélo ou trottinette"],
  [/machine a cafe|cafetiere|expresso/, 3000, "cafetière"],
  [/bouilloire/, 1300, "bouilloire"],
  [/grille[- ]pain/, 1800, "grille-pain"],
  [/\blampe\b|lampadaire/, 1500, "lampe"],
  [/maisons? de poupees?/, 3000, "maison de poupée"],
  // High-tech
  [/ordinateur portable|pc portable|laptop|macbook/, 2500, "ordinateur portable"],
  // Une console se nomme « console » (ou « PS4 slim / pro », « 500 Go ») ; « Call of Duty … PS4 » est un jeu.
  [/\bconsole\b|\bps[2345] (?:slim|pro|fat)\b|\b(?:500|825) ?go\b|\b1 ?to\b/, 2500, "console"],
  [/tablette|ipad/, 900, "tablette"],
  [/smartphone|telephone|iphone|samsung galaxy/, 450, "téléphone"],
  [/appareil photo|camera|objectif/, 1000, "appareil photo"],
  [/enceinte/, 900, "enceinte"],
  [/casque audio|casque bluetooth|ecouteurs?|airpods/, 400, "casque ou écouteurs"],
  [/manette/, 400, "manette"],
  [/jeux? video|\bps[2345]\b|\bxbox\b|\bwii\b|\bnintendo\b|\bdvd\b|blu[- ]?ray|\bcd\b/, 200, "jeu, DVD ou CD"],
  // Chaussures
  [/\bbottes?\b|bottines?|boots/, 1500, "bottes"],
  [/baskets?|sneakers?|chaussures?|escarpins?|mocassins?|derbies|richelieu/, 1100, "chaussures"],
  [/sandales?|tongs?|claquettes?|espadrilles?/, 600, "sandales"],
  // Manteaux et vestes (avant « veste » seule)
  [/manteau|doudoune|parka|trench|caban|anorak/, 1300, "manteau"],
  [/blouson|veste en cuir|perfecto/, 1200, "blouson"],
  [/\bveste\b|polaire|gilet|cardigan|blazer|veston/, 800, "veste"],
  [/costume|tailleur|combinaison de ski/, 1300, "costume"],
  // Hauts, bas, robes
  [/\bpulls?\b|sweat|hoodie|\bsweats?\b/, 600, "pull ou sweat"],
  [/\bjeans?\b|pantalon|jogging|salopette/, 650, "pantalon"],
  [/\brobes?\b|combinaison|combi[- ]short/, 450, "robe"],
  [/\bjupes?\b|\bshorts?\b|bermuda/, 350, "jupe ou short"],
  [/chemise|blouse|chemisier|tunique/, 300, "chemise"],
  [/t[- ]?shirts?|tee[- ]?shirts?|\btops?\b|debardeur|polo|body|brassiere|crop/, 250, "t-shirt ou haut"],
  [/legging|collant|chaussettes?/, 200, "legging"],
  [/maillot de bain|bikini|soutien[- ]gorge|culotte|lingerie|boxer|calecon/, 150, "maillot ou lingerie"],
  [/pyjama|nuisette|peignoir/, 450, "pyjama"],
  // Sacs et accessoires
  [/valise/, 4000, "valise"],
  [/sac a dos|cartable/, 900, "sac à dos"],
  [/\bsacs?\b|sacoche|cabas|pochette|besace/, 800, "sac"],
  [/portefeuille|porte[- ]monnaie|porte[- ]cartes/, 200, "portefeuille"],
  [/ceinture/, 300, "ceinture"],
  [/echarpe|foulard|\bchale\b|snood/, 250, "écharpe"],
  [/casquette|chapeau|bonnet|beret/, 250, "chapeau"],
  [/lunettes/, 200, "lunettes"],
  [/\bmontres?\b/, 250, "montre"],
  [/boutons de manchette|bague|collier|bracelet|boucles? d.oreilles?|bijou|pendentif|broche/, 100, "bijou"],
  // Beauté
  [/parfum|eau de toilette|eau de parfum/, 450, "parfum"],
  [/\bserums?\b|\bcremes?\b|\bsoins?\b|maquillage|rouge a levres|mascara/, 200, "produit de beauté"],
  // Livres, jeux, loisirs
  [/bande dessinee|\bbd\b|manga/, 450, "bande dessinée"],
  [/\blivres?\b|roman|encyclopedie|guide/, 500, "livre"],
  [/jeu de societe|jeux de societe|puzzle/, 1000, "jeu de société"],
  [/peluche|doudou/, 300, "peluche"],
  [/figurine|funko/, 300, "figurine"],
  [/lego|playmobil|jouet/, 800, "jouet"],
  [/\btableaux?\b|\btoiles?\b|\bcadres?\b|\baffiches?\b|\bposters?\b/, 1500, "tableau ou cadre"],
  [/vase|vaisselle|assiettes?|verres?|tasses?|mugs?/, 1200, "vaisselle"],
  [/cartes? (?:pokemon|a collectionner)|carte pokemon|timbres?/, 60, "carte ou timbre"],
  [/scotch|ruban adhesif/, 200, "ruban adhésif"],
];

/**
 * Le poids estimé d'un article, ou null quand rien ne dit ce qu'il est.
 * @param {{ titre?: string, chemin?: string[]|string|null, objet?: string|null }} a
 *        titre de l'article, rayon (une plateforme), objet nommé par l'IA (photos, categorie_objet_ia)
 * @returns {null | { g: number, objet: string, source: "titre" | "rayon" | "objet" }}
 */
export function poidsEstime({ titre = "", chemin = null, objet = null } = {}) {
  const rayon = Array.isArray(chemin) ? chemin.join(" ") : String(chemin ?? "");
  for (const [source, texte] of [["titre", titre], ["rayon", rayon], ["objet", objet]]) {
    const t = sansAccents(texte);
    if (!t.trim()) continue;
    for (const [re, g, nom] of TABLE) if (re.test(t)) return { g, objet: nom, source };
  }
  return null;
}

/**
 * La taille du colis Vinted qui découle d'un poids, dans la grille du rayon : la plus petite qui le porte.
 * Petit / Moyen / Grand (1, 2, 3 ; « Lourd » 8 au-delà de 2 kg quand la grille l'a), ou la grille au poids (5 à 30 kg).
 * @param {Array<{id:number, libelle:string}>|null} grille
 * @returns {null | { id: number, libelle: string }}
 */
export function colisVintedDuPoids(grille, g) {
  const n = Number(g);
  if (!Array.isArray(grille) || !grille.length || !Number.isFinite(n) || n <= 0) return null;
  const par = new Map(grille.map((x) => [Number(x.id), x]));
  const KG = { 8: 5000, 9: 10000, 10: 20000, 11: 5000, 12: 10000, 13: 20000, 14: 30000 };
  if (par.has(1) || par.has(2) || par.has(3)) {
    const id = n <= 1000 ? 1 : n <= 2000 ? 2 : (par.has(8) ? 8 : 3);
    return par.get(id) ?? par.get(3) ?? par.get(2) ?? null;
  }
  const ids = [...par.keys()].filter((id) => KG[id] != null).sort((a, b) => KG[a] - KG[b]);
  const id = ids.find((x) => KG[x] >= n) ?? ids[ids.length - 1];
  return id != null ? par.get(id) : null;
}

/** « ≈ 600 g · estimé (pull ou sweat) » */
export function texteEstime(est, lang = "fr") {
  if (!est) return "";
  const en = lang === "en";
  const p = est.g < 1000 ? `${est.g} g` : `${String(Math.round(est.g / 100) / 10).replace(".", en ? "." : ",")} kg`;
  return en ? `≈ ${p} · estimated (${est.objet})` : `≈ ${p} · estimé (${est.objet})`;
}

/**
 * (19/11) Au clic Publier, à l'unité comme en lot : les copies Leboncoin et Beebs sans poids (ni sur la copie, ni sur
 * la fiche, ni « Saisir le poids » choisi) reçoivent le poids estimé d'après l'article, marqué `poids_estime` — rien de
 * reconnu : la copie part comme avant (la plateforme estime). Rend un nouvel `edited` (l'ancien est intact). Pur.
 * @param {object} edited
 * @param {{ plateformes: string[], poidsFiche?: number|null, saisir?: boolean, titre?: string,
 *           chemins?: Record<string, unknown>, objet?: string|null }} o
 */
export function avecPoidsEstime(edited, { plateformes = [], poidsFiche = null, saisir = false, titre = "", chemins = {}, objet = null } = {}) {
  if (!edited || saisir || (Number(poidsFiche) > 0)) return edited;
  let suite = edited;
  for (const p of ["leboncoin", "beebs"]) {
    const c = suite?.[p];
    if (!c || !plateformes.includes(p)) continue;
    const pf = c.platform_fields ?? {};
    const g = Math.round(Number(pf.lbcPoidsGrammes));
    if (p === "leboncoin" && Number.isFinite(g) && g > 0) continue;
    if (pf.poids_estime?.g) continue;
    const est = poidsEstime({ titre, chemin: chemins?.[p] ?? null, objet });
    if (!est) continue;
    const marque = { g: est.g, objet: est.objet, source: est.source };
    suite = { ...suite, [p]: { ...c, platform_fields: { ...pf, ...(p === "leboncoin" ? { lbcPoidsGrammes: est.g } : {}), poids_estime: marque } } };
  }
  return suite;
}
