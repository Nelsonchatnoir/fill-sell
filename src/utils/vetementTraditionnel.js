// ═══════════════════════════════════════════════════════════════════════════
// UN VÊTEMENT TRADITIONNEL VA AU RAYON eBay DES VÊTEMENTS TRADITIONNELS (24/10, point 7)
// ═══════════════════════════════════════════════════════════════════════════
// Sébastien (Pro), 19/10 : « Djellaba traditionnelle marocaine homme / unisexe - Marron brodée » publiée sur eBay
// en « Homme : vêtements › Costumes » (3001 : le catalogue Vinted transposé) — un costume trois pièces, pas une
// djellaba ; aucune taille unique dans la grille de ce rayon, la question « Taille » était posée pour rien. eBay
// propose lui-même « Vêtements traditionnels, du monde » (relevé sur ebay.fr le 23/10, branche « Déguisements,
// occasions spéciales » 260033 › 155240) et ses feuilles par région :
//   155253 Asie du Sud-Ouest/Moyen-Orient · 155241 Afrique · 155242 Asie orientale · 155246 Asie du Sud, centrale ·
//   155252 Amérique latine · 163145 Europe: autres vêtements traditionnels · 155254 Autres.
// Le rayon de la djellaba est celui qu'eBay suggère pour « djellaba » (155253, mesuré le 19/10 et le 23/10).
//
// LA RÈGLE : un VÊTEMENT (icône de vêtement) que son titre ou sa description nomme d'un mot qui ne désigne qu'un
// vêtement traditionnel — djellaba, gandoura, qamis, takchita, abaya, jilbab, thobe, burnous, boubou, dashiki,
// agbada, sari, salwar kameez, lehenga, sherwani, dhoti, hanbok, qipao, hanfu, yukata, hakama, dirndl, lederhosen,
// huipil — va dans la feuille de sa région. Les mots que la mode emprunte (caftan, kaftan, kimono, kurta, poncho,
// kilt, pagne) ne suffisent pas seuls : il faut leur origine (« marocain », « japonais », « indien », « africain »,
// « mexicain », « écossais », « traditionnel »…).
// ⛔ Jamais un kimono d'art martial (judo, karaté, jiu-jitsu, aïkido, taekwondo, kendo) : c'est un équipement de
//    sport. Jamais un objet qui n'est pas un vêtement (poupée, figurine, tissu au mètre, livre, cintre, déco) : la
//    garde est l'icône de l'article, la même que pour les jeux vidéo et les œuvres.
// ⛔ Deux régions nommées (« caftan marocain style japonais ») : doute, rien ne change.
// ═══════════════════════════════════════════════════════════════════════════
const B = "(?<![\\p{L}\\p{N}])";
const E = "(?![\\p{L}\\p{N}])";
const re = (s) => new RegExp(`${B}(?:${s})${E}`, "iu");

const CHEMIN = ["Vêtements, accessoires", "Déguisements, occasions spéciales", "Vêtements traditionnels, du monde"];
/** Les feuilles eBay.fr (relevé du 23/10, docs/ebay-categories-raw.txt). */
export const FEUILLES_EBAY_TRADITIONNELLES = Object.freeze({
  moyen_orient: { id: "155253", chemin: [...CHEMIN, "Asie du Sud-Ouest/Moyen-Orient"] },
  afrique: { id: "155241", chemin: [...CHEMIN, "Afrique"] },
  asie_orientale: { id: "155242", chemin: [...CHEMIN, "Asie orientale"] },
  asie_sud: { id: "155246", chemin: [...CHEMIN, "Asie du Sud, centrale"] },
  amerique_latine: { id: "155252", chemin: [...CHEMIN, "Amérique latine"] },
  europe: { id: "163145", chemin: [...CHEMIN, "Europe: autres vêtements traditionnels"] },
});

// Les mots qui ne désignent QU'UN vêtement traditionnel (pluriels compris).
const SURS = [
  ["moyen_orient", re("dj?ellabas?|jellabas?|gandouras?|gandoras?|qamis|kamis|takchitas?|abayas?|jilbabs?|thobes?|thawbs?|dishdashas?|burnous|jabadors?")],
  ["afrique", re("boubous?|dashikis?|agbadas?")],
  ["asie_orientale", re("hanboks?|qipaos?|cheongsams?|hanfus?|yukatas?|hakamas?")],
  ["asie_sud", re("saris?|sarees?|salwars?|shalwars?|kameez|lehengas?|sherwanis?|dhotis?|churidars?")],
  ["amerique_latine", re("huipils?")],
  ["europe", re("dirndls?|lederhosen")],
];
// Les mots que la mode emprunte (« robe caftan bohème », « gilet kimono », « pull poncho ») : il faut leur
// origine COLLÉE au mot (« caftan marocain », « kimono japonais traditionnel », au plus deux mots entre), jamais
// une origine lue ailleurs dans la description (« style oriental » d'une robe bohème, rejeu du 24/10), et jamais
// après « style », « façon », « type », « look », « esprit », « inspiration », « manches », « col ».
const EMPRUNTES = [
  ["moyen_orient", "kh?aftans?|caftans?|qaftans?", "marocaine?s?|maghr[ée]bine?s?|alg[ée]rienne?s?|tunisienne?s?|traditionnel(?:le)?s?"],
  ["asie_orientale", "kimonos?", "japonaise?s?|traditionnel(?:le)?s?"],
  ["asie_sud", "kurtas?|kurtis?", "indienne?s?|pakistanaise?s?|traditionnel(?:le)?s?"],
  ["amerique_latine", "ponchos?", "mexicaine?s?|p[ée]ruvienne?s?|andine?s?|bolivienne?s?|traditionnel(?:le)?s?"],
  ["europe", "kilts?", "[ée]cossaise?s?|traditionnel(?:le)?s?"],
  ["afrique", "pagnes?|kente|bogolan", "africaine?s?|traditionnel(?:le)?s?|s[ée]n[ée]galaise?s?|ivoirienne?s?|ghan[ée]enne?s?|malienne?s?"],
].map(([region, mot, origine]) => [region,
  new RegExp(`${B}(?<!(?:style|fa[çc]on|type|look|esprit|inspiration|inspir[ée]e?|manches?|col)\\s+)(?:${mot})(?:\\s+[\\p{L}'’-]+){0,2}?\\s+(?:${origine})${E}`, "iu")]);
// Une forme de vêtement devant « kimono » en fait un vêtement de mode (« gilet kimono », « body kimono »).
const KIMONO_DE_MODE = re("(?:gilets?|vestes?|blouses?|bodys?|tuniques?|peignoirs?|tops?|robes?|chemises?|cardigans?|manteaux?)\\s+(?:\\p{L}+\\s+)?kimonos?");
const ART_MARTIAL = re("judo|judogi|karat[ée]|karat[ée]gi|jjb|jiu[\\s-]?jitsu|ju[\\s-]?jitsu|a[iï]kido|taekwondo|kendo|arts?\\s+martiaux|ceinture\\s+(?:blanche|jaune|orange|verte|bleue|marron|noire)");
const PAS_UN_VETEMENT = re("poup[ée]es?|figurines?|barbie|tissus?\\s+au\\s+m[èe]tre|coupons?\\s+de\\s+tissu|livres?|cintres?|patrons?\\s+de\\s+couture|stickers?|magnets?|tableaux?|affiches?|cartes?\\s+postales?");
// Les icônes d'un VÊTEMENT (la garde, comme jeuVideoDeLArticle et oeuvreDArt).
// (La djellaba de Sébastien portait 🤵 : l'icône « costume » qui l'envoyait en Costumes.)
const ICONES_VETEMENT = new Set(["👕", "👗", "👖", "🧥", "👘", "🥻", "👚", "🩳", "👔", "🥼", "🦺", "🧣", "👙", "🩱", "🤵", "👰", "🎽", "🩲"]);

/**
 * Le vêtement traditionnel et sa feuille eBay, ou null.
 * @param {string|null} icone — l'icône de l'article (garde : un vêtement)
 * @param {...unknown} textes — titre, description, objet lu par le Lens
 * @returns {{ region: string, mot: string, id: string, chemin: string[] } | null}
 */
export function vetementTraditionnel(icone, ...textes) {
  if (icone && !ICONES_VETEMENT.has(icone)) return null;
  const t = textes.map((x) => String(x ?? "").normalize("NFC")).join(" \n ");
  if (!t.trim()) return null;
  if (PAS_UN_VETEMENT.test(t)) return null;
  const regions = new Map();
  for (const [region, mot] of SURS) {
    const m = t.match(mot);
    if (m) regions.set(region, m[0]);
  }
  for (const [region, motAvecOrigine] of EMPRUNTES) {
    const m = t.match(motAvecOrigine);
    if (!m) continue;
    if (region === "asie_orientale" && (ART_MARTIAL.test(t) || KIMONO_DE_MODE.test(t))) continue;
    if (!regions.has(region)) regions.set(region, m[0].split(/\s+/)[0]);
  }
  if (regions.size !== 1) return null;
  const [[region, mot]] = [...regions];
  return { region, mot, ...FEUILLES_EBAY_TRADITIONNELLES[region] };
}
