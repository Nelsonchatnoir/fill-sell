// ═══════════════════════════════════════════════════════════════════════════
// (19/11/2026, décision de Nico — compte 8ac5bbda, lots du 18/11) eBay ET Beebs : LE TYPE ÉCRIT DANS LE TITRE FAIT FOI
// ═══════════════════════════════════════════════════════════════════════════
// Cas (publication en lot, lots 797d441b et 7ff638d8) :
//   · « Kaporal … Veste Kaki Militaire à Capuche » → eBay 155183 « Vêtements de sport › Sweats, vestes à capuches »
//     (l'IA a choisi parmi les candidates du mot « veste », attirée par « vestes à capuches ») ;
//   · « Tommy Hilfiger … Pull Bleu Col V » et « … Pull Bleu Col Châle » → Beebs « Pulls ras de cou (homme) » ;
//   · « Scotch & Soda … Blouson Veste Marron » → Beebs « Manteaux (homme) » (chemin de l'icône 🧥, source catalog_vinted).
// RÈGLE (tous les comptes, eBay et Beebs seulement) : quand le TITRE nomme le type du vêtement sans ambiguïté (veste,
// blouson, manteau, parka, doudoune, pull col V / col roulé / col châle / ras du cou, cardigan, sweat…), un rayon posé
// par la machine (IA parmi les candidates, icône, catalogue Vinted transposé) qui le CONTREDIT est remplacé par le rayon
// de ce type, dans le MÊME rayon de genre (Homme, Femme, Fille, Garçon, Bébé, Maternité ; eBay : Homme, Femme, Garçon,
// Fille, Enfant unisexe). Feuilles relevées : src/utils/arbres/{ebay,beebs}Feuilles.js (Beebs calque Vinted : « Sweats à
// col V (homme) » est la feuille des pulls col V, comme « Sweats et pulls › Sweats à col V » chez Vinted).
// Garde-fous (Nico) :
//   · jamais sur un mot ambigu : deux familles dans le titre (« veste sweat », « robe pull »), un autre vêtement
//     (robe, t-shirt, gilet, chemise, ensemble, lot…), une spécialité (sport, équitation, ski, costume…), un objet qui
//     n'est pas le vêtement (housse, cintre, poupée, chien…), deux cols contraires, « veste à capuche » / « veste
//     zippée » / « veste polaire » collés (sweat ou veste ?) : rien ne change ;
//   · le rayon choisi À LA MAIN gagne toujours : ce module ne le voit jamais (surcouche de rayonPublication.js posée
//     APRÈS la résolution) et refuse par principe un chemin `choix_humain` ;
//   · jamais une catégorie fausse : sans feuille SÛRE (une seule feuille du type dans le rayon de genre), la règle
//     d'avant ; un rayon déjà compatible avec le type (« Vestes de sport » pour une veste, « Pulls » pour un pull col V
//     chez les femmes) ne bouge pas ; hors des rayons de vêtements d'un genre, rien.
// Pur (Deno + Node + Vite), les feuilles de l'arbre sont injectées. Verrou : scripts/rayon-type-du-titre-selftest.mjs.

export const SOURCE_TYPE_DU_TITRE = "type_du_titre";
export const PLATEFORMES_TYPE_DU_TITRE = Object.freeze(["ebay", "beebs"]);

const plier = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

// Marques et noms propres qui contiennent un mot de type (« Pull & Bear » n'est pas un pull).
const MARQUES = [
  /\bpull (and )?bear\b/g, /\bpullandbear\b/g, /\bparka london\b/g, /\bpolo ralph lauren\b/g, /\bralph lauren polo\b/g,
  /\bu ?s polo( assn)?\b/g, /\bbeverly hills polo club\b/g, /\bjean paul gaultier\b/g, /\bjean paul\b/g,
];

// ── LES TYPES QUE LE TITRE PEUT NOMMER ──────────────────────────────────────────────────────────────────────────────
// groupe : deux groupes différents dans un titre = ambigu. `cle` : la ligne des tables de rayons ci-dessous.
const TYPES = [
  { cle: "veste", groupe: "dessus", re: /\bvestes?\b/ },
  { cle: "blouson", groupe: "dessus", re: /\bblousons?\b/ },
  { cle: "manteau", groupe: "dessus", re: /\b(manteaux?|pardessus|cabans?|trench( ?coats?)?|duffle( ?coats?)?)\b/ },
  { cle: "parka", groupe: "dessus", re: /\bparkas?\b/ },
  { cle: "doudoune", groupe: "dessus", re: /\bdoudounes?\b/ },
  { cle: "pull", groupe: "maille", re: /\b(pulls?|pull ?overs?)\b/ },
  { cle: "cardigan", groupe: "maille", re: /\bcardigans?\b/ },
  { cle: "sweat", groupe: "maille", re: /\b(sweats?|sweat ?shirts?|hoodies?)\b/ },
];
// Les cols d'un pull (ou d'un sweat) : le type fin. Deux cols contraires = ambigu.
const COLS = [
  { cle: "col_v", re: /\b(col (en )?v|encolure (en )?v|v ?neck)\b/ },
  { cle: "col_roule", re: /\b(cols? roules?|turtle ?neck)\b/ },
  { cle: "col_chale", re: /\bcols? chales?\b/ },
  { cle: "ras_de_cou", re: /\b(ras (du|de) cou|col rond)\b/ },
];
// Un autre vêtement (ou un mot qui en change la nature) dans le titre : on ne tranche pas.
const AUTRE_VETEMENT = /\b(robes?|jupes?|pantalons?|shorts?|bermudas?|leggings?|t ?shirts?|tee ?shirts?|tops?|debardeurs?|polos?|bodys?|bodies|combinaisons?|combis?|salopettes?|chemises?|surchemises?|chemisiers?|blouses?|tuniques?|kimonos?|ponchos?|capes?|costumes?|tailleurs?|blazers?|smokings?|gilets?|bonnets?|echarpes?|gants|chaussures?|baskets?|bottes?|bottines?|sacs?|ceintures?|pyjamas?|maillots?|lots?|ensembles?|survetements?|joggings?|combinaison|brassieres?|soutiens? gorge|lingerie|jeans?)\b/;
// « jean » qui dit la MATIÈRE (« veste en jean ») n'est pas un autre vêtement.
const JEAN_MATIERE = /\b(en|de) (jeans?|denim)\b/g;
const SPECIALITE = /\b(sports?|sportswear|running|training|fitness|yoga|ski|snowboard|moto|motard|biker|equitation|equestre|cavaliere?|concours|cyclisme|velo|vtt|golf|football|foot|rugby|tennis|basketball|randonnee|trail|chasse|peche|plongee|surf|natation|boxe|judo|karate|danse|travail|uniformes?|cosplay|deguisements?|militaria|softshell)\b/;
const PAS_LE_VETEMENT = /\b(housses?|cintres?|porte (manteaux?|vestes?|habits?)|patrons?|poupees?|barbie|playmobil|lego|figurines?|peluches?|chiens?|chats?|animaux|animal|reborn|miniatures?|kits?|tissus?|livres?|magazines?|dvd|jeux?|puzzles?|cartes?)\b/;
// Une veste collée à « capuche », « zip », « sweat » : sweat ou veste ? on ne tranche pas (« Veste kaki militaire à
// capuche » reste une veste : la capuche n'y qualifie pas le type). Un pull à capuche ou zippé, n'importe où dans le
// titre, est peut-être un sweat. La polaire (veste, pull ou sweat) : vêtement de dessus ou maille, on ne tranche pas.
const VESTE_AMBIGUE = /\bvestes? (a |avec |en )?(capuches?|zip|zippees?|sweats?|molletons?|molletonnees?)\b/;
const PULL_AMBIGU = /\b(capuches?|zip|zippes?|zippees?|camionneur)\b/;
const POLAIRE = /\b(polaires?|fleece)\b/;
const SANS_MANCHES = /\bsans manches?\b/;
// Une marque de sport dans un rayon de SPORT (« Veste Nike Tiempo … » en « Vêtements de sport ») : le rayon de sport
// peut être le bon, on ne tranche pas. Hors d'un rayon de sport, la marque ne change rien.
const MARQUE_DE_SPORT = /\b(nike|adidas|puma|reebok|under armour|asics|kappa|umbro|le coq sportif|lotto|fila|ellesse|sergio tacchini|hummel|joma|errea|macron|castore|new balance|jordan|kalenji|kipsta|champion|psg)\b/;
const RAYON_DE_SPORT = /\bde sport\b/;

/**
 * Le type que le titre nomme : { types: string[], groupe, col, sansManches } ou { ambigu: motif } ou null (rien).
 * @param {string} titre
 */
export function typeDuTitre(titre) {
  let t = ` ${plier(titre)} `;
  for (const re of MARQUES) t = t.replace(re, " ");
  t = t.replace(JEAN_MATIERE, " ").replace(/\s+/g, " ");
  const trouves = TYPES.filter((x) => x.re.test(t));
  if (!trouves.length) return null;
  const groupes = [...new Set(trouves.map((x) => x.groupe))];
  if (groupes.length > 1) return { ambigu: `deux familles de vêtement dans le titre (${trouves.map((x) => x.cle).join(", ")})` };
  if (AUTRE_VETEMENT.test(t)) return { ambigu: `un autre vêtement dans le titre (« ${t.match(AUTRE_VETEMENT)[0]} »)` };
  if (SPECIALITE.test(t)) return { ambigu: `une spécialité dans le titre (« ${t.match(SPECIALITE)[0]} »)` };
  if (PAS_LE_VETEMENT.test(t)) return { ambigu: `le titre ne parle peut-être pas du vêtement (« ${t.match(PAS_LE_VETEMENT)[0]} »)` };
  if (POLAIRE.test(t)) return { ambigu: "« polaire » : vêtement de dessus ou maille" };
  if (VESTE_AMBIGUE.test(t)) return { ambigu: `« ${t.match(VESTE_AMBIGUE)[0]} » : sweat ou veste` };
  const types = trouves.map((x) => x.cle);
  if (types.includes("pull") && PULL_AMBIGU.test(t)) return { ambigu: `pull et « ${t.match(PULL_AMBIGU)[0]} » : pull ou sweat` };
  const cols = COLS.filter((c) => c.re.test(t)).map((c) => c.cle);
  if (cols.length > 1) return { ambigu: `deux cols dans le titre (${cols.join(", ")})` };
  return {
    types, groupe: groupes[0],
    col: groupes[0] === "maille" && (types.includes("pull") || types.includes("sweat")) && !types.includes("cardigan") ? (cols[0] ?? null) : null,
    sansManches: SANS_MANCHES.test(t), marqueDeSport: MARQUE_DE_SPORT.test(t),
  };
}

// ── LES RAYONS DE CHAQUE TYPE, PAR PLATEFORME ───────────────────────────────────────────────────────────────────────
// `cible` : expressions essayées dans l'ordre sur le libellé de feuille (Beebs : sans « (homme) ») DANS le rayon de genre ;
// la première qui désigne UNE seule feuille l'emporte. `compatibles` : les feuilles qui ne contredisent pas le type.
const BEEBS_DESSUS_VESTE = [/^vestes$/, /^vestes sans manches?$/, /^vestes de sport$/, /^vestes et blazers$/, /^manteaux et blousons$/,
  /^manteaux et combipilotes$/, /^manteaux et vestes$/, /^vetements d exterieur$/];
const BEEBS_DESSUS_MANTEAU = [/^manteaux$/, /^manteaux et blousons$/, /^manteaux et combipilotes$/, /^manteaux et vestes$/,
  /^vetements d exterieur$/, /^capes et ponchos$/];
const BEEBS_PULLS_GENERIQUES = [/^pulls$/, /^pulls et sweats$/, /^pulls, gilets et sweats$/, /^pulls et gilets$/];
const RAYONS = {
  beebs: {
    veste: { cible: [/^vestes$/, /^manteaux et combipilotes$/, /^manteaux et vestes$/], compatibles: BEEBS_DESSUS_VESTE },
    blouson: { cible: [/^manteaux et blousons$/, /^vestes$/, /^manteaux et combipilotes$/, /^manteaux et vestes$/], compatibles: BEEBS_DESSUS_VESTE },
    manteau: { cible: [/^manteaux$/, /^manteaux et blousons$/, /^manteaux et combipilotes$/, /^manteaux et vestes$/], compatibles: BEEBS_DESSUS_MANTEAU },
    parka: { cible: [/^manteaux$/, /^manteaux et blousons$/, /^manteaux et combipilotes$/, /^manteaux et vestes$/], compatibles: BEEBS_DESSUS_MANTEAU },
    // Une doudoune est manteau OU veste (Vinted la range sous « Vestes ») : seuls les rayons d'enfant ont une feuille sûre.
    doudoune: { cible: [/^manteaux et blousons$/, /^manteaux et combipilotes$/, /^manteaux et vestes$/],
      compatibles: [...BEEBS_DESSUS_VESTE, /^manteaux$/] },
    // Pull sans col dit : la feuille unique des pulls (Femme, enfants) ; chez les hommes, aucune feuille sûre.
    pull: { cible: BEEBS_PULLS_GENERIQUES, compatibles: [...BEEBS_PULLS_GENERIQUES, /^pulls ras de cou$/, /^pulls col roule$/,
      /^sweats a col v$/, /^autres pulls et sweats$/, /^cardigans et gilets$/, /^pulls et sweats de sport$/, /^sweats longs$/, /^autres sweats$/] },
    pull_col_v: { cible: [/^sweats a col v$/, ...BEEBS_PULLS_GENERIQUES], compatibles: [/^sweats a col v$/, ...BEEBS_PULLS_GENERIQUES, /^autres pulls et sweats$/] },
    pull_col_roule: { cible: [/^pulls col roule$/, ...BEEBS_PULLS_GENERIQUES], compatibles: [/^pulls col roule$/, ...BEEBS_PULLS_GENERIQUES, /^autres pulls et sweats$/] },
    // Le col châle : ni « ras de cou » ni « col V » ; Beebs n'a pas de feuille « col châle » ni « autres pulls » chez les
    // hommes — le col haut replié le plus proche est « Pulls col roulé » (décision à confirmer par Nico, rapport du 19/11).
    pull_col_chale: { cible: [/^pulls col roule$/, ...BEEBS_PULLS_GENERIQUES],
      compatibles: [/^pulls col roule$/, /^cardigans et gilets$/, /^autres sweats$/, ...BEEBS_PULLS_GENERIQUES, /^autres pulls et sweats$/] },
    pull_ras_de_cou: { cible: [/^pulls ras de cou$/, ...BEEBS_PULLS_GENERIQUES], compatibles: [/^pulls ras de cou$/, ...BEEBS_PULLS_GENERIQUES, /^autres pulls et sweats$/] },
    cardigan: { cible: [/^cardigans et gilets$/, /^gilets et cardigans$/, /^gilets$/, ...BEEBS_PULLS_GENERIQUES],
      compatibles: [/^cardigans et gilets$/, /^gilets et cardigans$/, /^gilets$/, ...BEEBS_PULLS_GENERIQUES, /^autres pulls et sweats$/] },
    sweat: { cible: [/^sweats$/, /^pulls et sweats$/, /^pulls, gilets et sweats$/],
      compatibles: [/^sweats$/, /^sweats longs$/, /^autres sweats$/, /^sweats a col v$/, /^sweats de sport$/, /^pulls et sweats de sport$/,
        /^autres pulls et sweats$/, /^pulls et sweats$/, /^pulls, gilets et sweats$/, /^pulls ras de cou$/] },
  },
  ebay: {
    veste: { cible: [/^manteaux(,| et) vestes/], compatibles: [/^manteaux(,| et) vestes/, /^vestes de sport$/, /^costumes/] },
    blouson: { cible: [/^manteaux(,| et) vestes/], compatibles: [/^manteaux(,| et) vestes/, /^vestes de sport$/] },
    manteau: { cible: [/^manteaux(,| et) vestes/], compatibles: [/^manteaux(,| et) vestes/] },
    parka: { cible: [/^manteaux(,| et) vestes/], compatibles: [/^manteaux(,| et) vestes/, /^vestes de sport$/] },
    doudoune: { cible: [/^manteaux(,| et) vestes/], compatibles: [/^manteaux(,| et) vestes/, /^vestes de sport$/] },
    pull: { cible: [/^pulls, cardigans$/], compatibles: [/^pulls, cardigans$/] },
    cardigan: { cible: [/^pulls, cardigans$/], compatibles: [/^pulls, cardigans$/] },
    sweat: { cible: [/^sweats, vestes a capuches$/], compatibles: [/^sweats, vestes a capuches$/, /^pulls, cardigans$/, /^hauts de sport$/] },
  },
};
// eBay n'a pas de feuille par col : un pull reste un pull.
for (const c of ["pull_col_v", "pull_col_roule", "pull_col_chale", "pull_ras_de_cou"]) RAYONS.ebay[c] = RAYONS.ebay.pull;

// Le rayon de vêtements d'un genre : l'indice du segment qui l'ouvre dans le chemin, ou -1.
const RAYON_DE_GENRE = {
  ebay: /^((homme|femme) : vetements|vetements (garcon|fille|enfant unisexe) \(2-16 ans\))$/,
  beebs: /^vetements \((homme|femme|fille|garcon|bebe|maternite)\)$/,
};
const plierLibelle = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[’']/g, " ").replace(/\s+/g, " ").trim();
const libelleFeuille = (plateforme, chemin) => {
  const l = plierLibelle(chemin[chemin.length - 1]);
  return plateforme === "beebs" ? l.replace(/\s*\([^)]*\)\s*$/, "").trim() : l;
};
function indiceRayonDeGenre(plateforme, chemin) {
  const re = RAYON_DE_GENRE[plateforme];
  for (let i = 0; i < chemin.length - 1; i++) if (re.test(plierLibelle(chemin[i]))) return i;
  return -1;
}
const memePrefixe = (a, b, n) => { for (let i = 0; i <= n; i++) if (plierLibelle(a[i]) !== plierLibelle(b[i])) return false; return true; };

/**
 * Le rayon que le TYPE écrit dans le titre impose, quand le rayon posé le contredit — sinon null (rien ne change).
 * @param {{ plateforme: string, titre: string, chemin: string[] | null, feuilles: Array<{chemin: string[], id?: string|null}>,
 *           source?: string | null }} p
 * @returns {null | { chemin: string[], id: string | null, type: string, avant: string[], motif: string }}
 */
export function rayonDuTypeDuTitre({ plateforme, titre, chemin, feuilles, source = null } = {}) {
  if (!PLATEFORMES_TYPE_DU_TITRE.includes(plateforme)) return null;
  if (source === "choix_humain") return null;
  if (!Array.isArray(chemin) || chemin.length < 2 || !Array.isArray(feuilles) || !feuilles.length) return null;
  const lu = typeDuTitre(titre);
  if (!lu || lu.ambigu) return null;
  const i = indiceRayonDeGenre(plateforme, chemin);
  if (i < 0) return null;
  if (lu.marqueDeSport && chemin.some((s) => RAYON_DE_SPORT.test(plierLibelle(s)))) return null;
  const table = RAYONS[plateforme];
  // Le col fin vaut pour un pull ; pour un sweat, seul le col V a sa feuille (Beebs « Sweats à col V »).
  const cles = lu.types.map((ty) => (ty === "pull" && lu.col ? `pull_${lu.col}` : ty === "sweat" && lu.col === "col_v" ? "pull_col_v" : ty));
  const uniques = [...new Set(cles)];
  const regles = uniques.map((c) => table[c]).filter(Boolean);
  if (!regles.length) return null;
  const actuelle = libelleFeuille(plateforme, chemin);
  if (regles.some((r) => r.compatibles.some((re) => re.test(actuelle)))) return null;
  // Sans manches : un « gilet » (sans manches) n'est pas contredit — c'est aussi le nom de la pièce.
  if (lu.sansManches && lu.groupe === "dessus" && /^(gilets?|gilets et cardigans|cardigans et gilets|vestes sans manches?)$/.test(actuelle)) return null;
  const duRayon = feuilles.filter((f) => Array.isArray(f?.chemin) && f.chemin.length > i + 1 && memePrefixe(f.chemin, chemin, i));
  const cibles = new Map();
  for (const r of regles) {
    // Sans manches (une veste, une doudoune) : la feuille « Vestes sans manche(s) » d'abord, si le rayon en a une.
    const essais = lu.sansManches && lu.groupe === "dessus" && plateforme === "beebs" ? [/^vestes sans manches?$/, ...r.cible] : r.cible;
    for (const re of essais) {
      const v = duRayon.filter((f) => re.test(libelleFeuille(plateforme, f.chemin)));
      if (!v.length) continue;
      // Plusieurs feuilles du même libellé (eBay enfant : « Sweats, vestes à capuches » au rayon ET sous « sport ») : la
      // plus courte, si elle est seule à sa longueur ; sinon, aucune feuille sûre.
      const court = Math.min(...v.map((f) => f.chemin.length));
      const plusCourtes = v.filter((f) => f.chemin.length === court);
      if (plusCourtes.length === 1) cibles.set(plusCourtes[0].chemin.join(" > "), plusCourtes[0]);
      break;
    }
  }
  if (cibles.size !== 1) return null;
  const [f] = cibles.values();
  if (plateforme === "ebay" && !f.id) return null;
  return {
    chemin: [...f.chemin], id: f.id != null ? String(f.id) : null, type: uniques.join("+"), avant: [...chemin],
    motif: `le titre dit « ${uniques.join(" + ").replace(/_/g, " ")} » : « ${chemin[chemin.length - 1]} » le contredit`,
  };
}
