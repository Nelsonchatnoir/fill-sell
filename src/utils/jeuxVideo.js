// ═══════════════════════════════════════════════════════════════════════════
// JEU / CONSOLE / ACCESSOIRE — le domaine des jeux vidéo, séparé en trois
// (2026-09-20, demande XEWER, compte Pro)
// ═══════════════════════════════════════════════════════════════════════════
// LE DÉFAUT QU'ON RÉPARE, ET CE QU'IL COÛTAIT :
// « 🎮 » pointait sur CONSOLES sur les trois plateformes qui ont une table
// d'icônes (vintedCategories.js, ebayCategories.js, lbcCategories.js), avec un
// commentaire assumé : « console/jeu/manette partagent l'icône, console
// dominante ». Or les titres réels de jeux ne contiennent presque jamais le
// mot « jeu » : « NBA 2K25 – Xbox Series X », « EA Sports FC 25 – PS5 ». Ils
// partaient donc au rayon des machines.
//
// 🚨 CE N'EST PAS UN DÉFAUT D'AFFICHAGE : SUR VINTED LA CATÉGORIE CHOISIT LA
//    GRILLE DE COLIS. Mesuré le 20/09 sur les annonces VIVANTES du parc :
//      · catalogue 3026 « Jeux »    : 51 articles, 48 en « Petit » ;
//      · catalogue 3025 « Consoles » : 4 colis lus — « 20 kg », « 5 kg »,
//        « 5 kg », « Grand ». AUCUN « Petit ».
//    Les 15 catalogues du parc servis par la grille en KILOS sont les rayons
//    lourds (aspirateurs, perceuses, sièges auto…) et « Consoles ». Un jeu DS
//    rangé là hérite d'un plancher à 5 kg, et c'est l'ACHETEUR qui paie.
//    Même mécanique sur Leboncoin (le « Poids du colis » est un critère DE LA
//    CATÉGORIE) et sur Beebs (« Format du colis » requis, notre défaut est
//    déduit du chemin de catégorie). Rien sur eBay (politique de compte) ni
//    sur Opla (aucun champ colis).
//
// CE QUE FAIT CE MODULE, ET RIEN D'AUTRE :
//   1. il dit à quelle FAMILLE appartient l'objet — jeu, console, accessoire ;
//   2. il donne, pour chaque famille et chaque plateforme, la FEUILLE RELEVÉE
//      qui lui correspond (jamais une catégorie inventée : chaque chemin est
//      vérifié contre src/utils/arbres/*Feuilles.js par
//      scripts/jeux-video-selftest.mjs) ;
//   3. il nomme la MACHINE (PS4, Switch…) dans le vocabulaire EXACT de chaque
//      plateforme, relevé en base (platform_category_aspects.allowed_values).
//
// ⛔ IL NE S'APPLIQUE QUE QUAND L'ICÔNE RÉSOLUE EST « 🎮 ». C'est la garde qui
//    protège tout le reste : mesuré le 20/09, elle écarte d'elle-même les
//    « Tongs … manette jeu vidéo » (🩴), la « Carte Pokémon » (🃏), la
//    « Pochette pour Switch » (👜), la tablette Storio (📲). Aucune autre
//    correspondance d'objet n'est touchée.
// ⛔ EN CAS DE DOUTE, IL REND null — et tout se passe exactement comme avant.
//
// MESURE DU 20/09 (698 articles du parc dans le domaine, 85 comptes, emails de
// test exclus), confrontée à la catégorie que le VENDEUR a lui-même choisie sur
// la plateforme d'origine (annonces_plateforme.capture->>'categorie') ou au
// catalogue Vinted de son annonce vivante — 147 articles avec une vérité :
//     · 141 jeux        → 141 classés « jeu »        (100 %)
//     · 4 consoles      → 4 classées « console »     (100 %)
//     · 1 accessoire    → 1 classé « accessoire »    (100 %)
//     · 1 balance board rangé par son vendeur dans « Consoles » Leboncoin
//       (Leboncoin n'a pas de rayon accessoire) → classé « accessoire », et
//       sur Leboncoin il repart EXACTEMENT au même endroit : aucune bascule.
//   AUCUNE BASCULE À TORT. C'était la condition d'arrêt posée par Nico.
// ═══════════════════════════════════════════════════════════════════════════

/** Minuscules sans accents — même normalisation que texteComparable. */
const norm = (s) => String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

// ── LE DOMAINE ────────────────────────────────────────────────────────────
// Même vocabulaire que la règle « 🎮 » de shared.js (OBJECT_ICON_RULES), plus
// les machines qu'elle ne nomme pas (PSP, Vita, GameCube, Dreamcast, Famicom,
// Steam Deck) — ici il ne sert qu'à CONFIRMER le domaine, jamais à l'ouvrir :
// l'appelant a déjà l'icône 🎮 en main.
// ⚠️ BORNES DE MOT OBLIGATOIRES : sans elles, « sega » matche à l'intérieur de
//    « Bra-sega-li » (carte Pokémon du parc, relevé du 20/09) et « nes » dans
//    « Destinées ».
const DOMAINE = /\b(consoles?|playstation|ps\s?[1-5]|psp|ps\s?vita|psvita|xbox|nintendo|wii|wii\s?u|[23]ds|nds|ds|game\s?boy|gameboy|gamecube|game\s?cube|gba|mega\s?drive|megadrive|dreamcast|saturn|snes|nes|n64|super\s?famicom|famicom|sega|atari|neo\s?geo|neogeo|jeux?\s?video|switch|steam\s?deck|amiibo)\b/;

// ── CE QUI N'EST PAS UN ARTICLE DE JEU VIDÉO ──────────────────────────────
// Des objets qui PARLENT de jeu vidéo sans en être : cadres déco, lampes,
// vêtements, goodies, cartes à collectionner. Relevés un par un dans le parc
// le 20/09 (un vendeur en fait commerce : 9 « Cadre Trophée Platine PS5 »).
// Ils gardent le comportement d'aujourd'hui — on ne les améliore pas ici, on
// se contente de ne pas les déplacer.
const HORS_OBJET_PARTOUT = /\bcadre\s+(trophee|deco|manette|nintendo|playstation|switch|gameboy)\b|\btrophee\s+platine\b|\bamiibos?\b|\bboite\s+vide\b|\bboitier\s+vide\b/;
const TETE = "^\\s*(?:lot\\s+(?:de\\s+)?\\d+\\s+|set\\s+de\\s+\\d+\\s+|lot\\s+|\\d+\\s+)?";
const HORS_OBJET_TETE = new RegExp(`${TETE}(cadres?|magnets?|aimants?|breloques?|bijoux?|pendentifs?|porte.?cles?|badges?|pin'?s|epingles?|broches?|stickers?|autocollants?|tee.?shirts?|t.?shirts?|maillots?|sweats?|mugs?|tasses?|posters?|affiches?|figurines?|funko|peluches?|lampes?|veilleuses?|coussins?|plaids?|puzzles?|deguisements?|costumes?|magazines?|blu.?ray|bluray|dvd|vinyles?|carte\\s+a\\s+collectionner|cartes?\\s+pokemon)\\b`);

// ── LES TROIS FAMILLES, PAR LEUR TÊTE DE TITRE ────────────────────────────
// Un vendeur nomme l'objet EN TÊTE : « Coque nintendo ds lite », « Jeu PS4
// Rage 2 ». C'est le signal le plus fiable du parc, et il tranche les cas où
// deux vocabulaires se croisent (« Coque … ds lite » : accessoire, pas console).
const JEU_TETE = new RegExp(`${TETE}jeux?\\b`);
const ACCESSOIRE_TETE = new RegExp(`${TETE}(housses?|etuis?|coques?|sacoches?|pochettes?|covers?|supports?|protections?|films?\\s+protecteurs?|chargeurs?|cables?|adaptat(?:eur|er)s?|cartes?\\s+(?:micro\\s?sd|sd|memoire)|memory\\s?cards?|cartes?\\s+mere|lecteurs?|docks?|stations?|grips?|sangles?|dragonnes?|batteries?|cameras?|webcams?|micros?|casques?|refroidissement|ventilateurs?|manettes?|joy.?cons?|dualshock|dual\\s?sense|nunchuks?|wii\\s?mote|wiimote|volants?|telecommandes?|stylets?)\\b`);

// Accessoires reconnaissables OÙ QU'ILS SOIENT dans le titre : ce sont des
// objets qui ne s'appellent jamais autrement (une manette est une manette).
// ⛔ « kinect » n'y est PAS : « Fighters Uncaged Xbox 360 Kinect PAL FR » est
//    un JEU Kinect, pas le capteur (relevé du 20/09, il basculait à tort).
// ⛔ « pochette » non plus : « Wii Sports … pochette cartonnée » est un jeu.
//    Ces deux mots ne valent qu'en TÊTE de titre.
const ACCESSOIRE_PARTOUT = /\b(manettes?|joy.?cons?|dualshock|dual\s?sense|nunchuks?|wii\s?mote|wiimote|telecommandes?|balance\s?board|wii\s?board|zapper|tapis\s+de\s+danse|dance\s?pad|memory\s?cards?|cartes?\s+memoire|motion\s+plus|stylets?|adaptat(?:eur|er)s?)\b/;

const CONSOLE_MOT = /\bconsoles?\b/;
const MACHINE_MOT = /\b(nintendo|playstation|xbox|wii|switch|game\s?boy|gameboy|ps\s?[1-5]|psp|ps\s?vita|[23]ds|ds|gamecube|mega\s?drive|dreamcast|atari|sega|snes|nes|n64|famicom|steam\s?deck)\b/;
const PACK_MACHINE = new RegExp(`^\\s*pack\\s+.{0,30}?${MACHINE_MOT.source}`);
// ⛔ « advance » N'EST PAS une variante : c'est le NOM d'une machine (Game Boy
//    Advance). Il y était le temps d'un self-test, et il envoyait « Le Seigneur
//    des Anneaux – Game Boy Advance – cartouche seule » au rayon des machines
//    (2 jeux d'un compte client, relevé du 20/09). « Gameboy advanced 2001 »,
//    la console qui l'avait fait ajouter, est de toute façon prise par la règle
//    de la machine nue plus bas.
const VARIANTE_MACHINE = new RegExp(`${MACHINE_MOT.source}.{0,14}?\\b(oled|slim|lite|xl|fat|phat)\\b`);
// ⚠️ PAS de \b devant le marqueur : « + » et « & » sont des caractères NON-WORD
//    — entourés d'espaces (« Xbox One + 5 jeux »), un \b devant eux ne matche
//    JAMAIS. Même piège que les marqueurs d'inclusion de shared.js (fix du
//    2026-07-17), retrouvé ici au self-test du 20/09.
const AVEC_N_JEUX = /(?:\+|&|\bavec\b|\bet\b)\s*\d+\s*(jeux?|games?|manettes?)\b/;
const MANETTE_INCLUSE = /\bmanettes?\s+(?:incluses?|fournies?)\b/;

// ── LA MACHINE NUE = LA MACHINE ELLE-MÊME ─────────────────────────────────
// « PlayStation 3 noire », « Wii », « Gameboy advanced 2001 », « Sony
// playstation 2 jap scph 30000 en boite » : quand il ne reste RIEN d'autre que
// le nom de la machine, sa couleur, son état et son millésime, l'objet EST la
// machine. Sans cette règle, ces quatre titres du parc partaient au rayon des
// jeux — la bascule à tort qu'on s'interdit.
const BRUIT_MACHINE = /\b(sony|microsoft|nintendo|sega|officielle?|officiel|original|originale|neuve?|neuf|occasion|complete?|complet|fonctionnelle?|testee?|teste|bon|tres|etat|comme|jap|jp|japonaise?|fr|fra|france|pal|ntsc|eur|euro|europe|version|boite|boitier|en|avec|sans|de|du|la|le|les|et|scph|agb|hac|dol|ntr|usg|twl|ctr|spr|edition|limitee|collector|couleur|noire?|blanche?|grise?|bleue?|rouge|verte?|jaune|violette?|rose|corail|turquoise|orange|argent|argentee?|doree?|transparente?|\d{1,6})\b/g;

/**
 * La famille d'un article du domaine des jeux vidéo.
 *
 * @param {string} titre        le titre de l'annonce (source du vendeur)
 * @param {string} [description] le texte long (filet, jamais prioritaire)
 * @returns {{famille:"jeu"|"console"|"accessoire", sousType:string|null,
 *            machine:string|null, regle:string}|null}
 *          null = on ne sait pas, ou ce n'est pas du jeu vidéo → rien ne change.
 */
export function familleJeuVideo(titre, description = "") {
  const t = norm(titre).replace(/\s+/g, " ").trim();
  if (!t) return null;
  const texte = `${t} ${norm(description).replace(/\s+/g, " ")}`.trim();
  if (!DOMAINE.test(texte)) return null;
  if (HORS_OBJET_TETE.test(t) || HORS_OBJET_PARTOUT.test(t)) return null;

  const machine = machineDuTexte(texte);
  const rendre = (famille, regle, sousType = null) => ({ famille, sousType, machine, regle });

  // 1. La tête du titre nomme l'objet.
  if (JEU_TETE.test(t)) return rendre("jeu", "tete_jeu");
  if (ACCESSOIRE_TETE.test(t)) return rendre("accessoire", "tete_accessoire", sousTypeAccessoire(t));

  // 2. La machine, dite explicitement ou vendue en lot avec ses jeux.
  if (CONSOLE_MOT.test(t)) return rendre("console", "mot_console");
  if (PACK_MACHINE.test(t)) return rendre("console", "pack_machine");
  if (VARIANTE_MACHINE.test(t)) return rendre("console", "variante_machine");
  if (AVEC_N_JEUX.test(t)) return rendre("console", "machine_avec_lot");
  if (MANETTE_INCLUSE.test(t)) return rendre("console", "machine_manette_incluse");

  // 3. Un accessoire qui ne s'appelle jamais autrement.
  if (ACCESSOIRE_PARTOUT.test(t)) return rendre("accessoire", "mot_accessoire", sousTypeAccessoire(t));

  // 4. Le nom de la machine, et rien d'autre.
  if (machineNue(t)) return rendre("console", "machine_nue");

  // 5. Le reste du domaine, c'est un jeu. Mesuré : 141 des 147 articles du
  //    parc dont on connaît la catégorie choisie par leur vendeur.
  return rendre("jeu", "defaut_domaine");
}

// Manette ou housse : deux rayons dédiés existent chez Vinted et eBay.
// La TÊTE du titre tranche d'abord — « Housse etui rangement manette
// playstation 5 » est une housse, pas une manette.
const ETUI_MOTS = /\b(housses?|etuis?|coques?|sacoches?|pochettes?|covers?)\b/;
const MANETTE_MOTS = /\b(manettes?|joy.?cons?|dualshock|dual\s?sense|nunchuks?|wii\s?mote|wiimote|volants?)\b/;
function sousTypeAccessoire(t) {
  if (new RegExp(`${TETE}(housses?|etuis?|coques?|sacoches?|pochettes?|covers?)\\b`).test(t)) return "etui";
  if (MANETTE_MOTS.test(t)) return "manette";
  if (ETUI_MOTS.test(t)) return "etui";
  return null;
}

/** Vrai quand il ne reste aucun mot signifiant une fois la machine retirée. */
function machineNue(t) {
  const reste = t
    .replace(new RegExp(MACHINE_MOT.source, "g"), " ")
    .replace(/\b(one|series|x|s|u|color|colour|advance|advanced|pocket|mini|classic|psone|super)\b/g, " ")
    .replace(BRUIT_MACHINE, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return reste.split(/\s+/).filter((m) => m.length > 2).length === 0;
}

// ── LA MACHINE, DANS LE VOCABULAIRE DE CHAQUE PLATEFORME ──────────────────
// Ordre STRICT : le plus précis d'abord (« Xbox Series X » avant « Xbox »,
// « PS5 Pro » avant « PS5 »). Les libellés de la colonne `vinted` sont les
// valeurs EXACTES de la liste relevée (platform_category_aspects,
// video_game_platform, 48 valeurs) ; celles de `beebs` viennent de sa liste
// « Console » (18 valeurs) ; `lbc` est la marque (console_brand, 10 valeurs) ;
// `opla` est le code de la feuille « Jeux <marque> ».
const MACHINES = [
  [/\bxbox\s?(series|serie)\b/,            { cle: "xbox_series", vinted: "Xbox Series S et X", beebs: "Xbox Series", lbc: "Microsoft", opla: "xbox", salon: true }],
  [/\bxbox\s?360\b/,                       { cle: "xbox360",     vinted: "Xbox 360",           beebs: "Xbox 360",    lbc: "Microsoft", opla: "xbox", salon: true }],
  [/\bxbox\s?one\b/,                       { cle: "xboxone",     vinted: "Xbox One",           beebs: "Xbox One",    lbc: "Microsoft", opla: "xbox", salon: true }],
  [/\bxbox\b/,                             { cle: "xbox",        vinted: "Xbox (originale)",   beebs: "Xbox Series", lbc: "Microsoft", opla: "xbox", salon: true }],
  [/\bps\s?5\s?pro\b/,                     { cle: "ps5pro",      vinted: "PlayStation 5 Pro",  beebs: "PS5",         lbc: "Sony",      opla: "playstation", salon: true }],
  [/\bps\s?vita\b|\bpsvita\b/,             { cle: "psvita",      vinted: "PlayStation Vita",   beebs: "PS Vita",     lbc: "Sony",      opla: "playstation", portable: true }],
  [/\bpsp\b/,                              { cle: "psp",         vinted: "PlayStation Portable", beebs: "PSP",       lbc: "Sony",      opla: "playstation", portable: true }],
  [/\bps\s?one\b|\bpsone\b|\bps\s?1\b/,    { cle: "ps1",         vinted: "PlayStation 1",      beebs: "Retrogaming", lbc: "Sony",      opla: "playstation", salon: true }],
  [/\bps\s?2\b/,                           { cle: "ps2",         vinted: "PlayStation 2",      beebs: "PS2",         lbc: "Sony",      opla: "playstation", salon: true }],
  [/\bps\s?3\b/,                           { cle: "ps3",         vinted: "PlayStation 3",      beebs: "PS3",         lbc: "Sony",      opla: "playstation", salon: true }],
  [/\bps\s?4\b/,                           { cle: "ps4",         vinted: "PlayStation 4",      beebs: "PS4",         lbc: "Sony",      opla: "playstation", salon: true }],
  [/\bps\s?5\b/,                           { cle: "ps5",         vinted: "PlayStation 5",      beebs: "PS5",         lbc: "Sony",      opla: "playstation", salon: true }],
  [/\bplaystation\b/,                      { cle: "playstation", vinted: "PlayStation 1",      beebs: "Retrogaming", lbc: "Sony",      opla: "playstation", salon: true }],
  [/\bswitch\s?2\b/,                       { cle: "switch2",     vinted: "Nintendo Switch 2",  beebs: "Nintendo Switch", lbc: "Nintendo", opla: "nintendo" }],
  [/\bswitch\b/,                           { cle: "switch",      vinted: "Nintendo Switch",    beebs: "Nintendo Switch", lbc: "Nintendo", opla: "nintendo" }],
  [/\bwii\s?u\b/,                          { cle: "wiiu",        vinted: "Nintendo Wii U",     beebs: "Nintendo Wii U", lbc: "Nintendo", opla: "nintendo", salon: true }],
  [/\bwii\b/,                              { cle: "wii",         vinted: "Nintendo Wii",       beebs: "Nintendo Wii", lbc: "Nintendo", opla: "nintendo", salon: true }],
  [/\b3\s?ds\b/,                           { cle: "3ds",         vinted: "Nintendo 3DS",       beebs: "Nintendo 3DS", lbc: "Nintendo", opla: "nintendo", portable: true }],
  [/\b2\s?ds\b/,                           { cle: "2ds",         vinted: "Nintendo 2DS",       beebs: "Nintendo 3DS", lbc: "Nintendo", opla: "nintendo", portable: true }],
  [/\bgame\s?boy\s?advance\b|\bgba\b/,     { cle: "gba",         vinted: "Nintendo Game Boy Advance", beebs: "Retrogaming", lbc: "Nintendo", opla: "nintendo", portable: true }],
  [/\bgame\s?boy\b|\bgameboy\b/,           { cle: "gameboy",     vinted: "Nintendo Game Boy",  beebs: "Retrogaming", lbc: "Nintendo", opla: "nintendo", portable: true }],
  [/\bgame\s?cube\b|\bgamecube\b/,         { cle: "gamecube",    vinted: "Nintendo GameCube",  beebs: "Nintendo GameCube", lbc: "Nintendo", opla: "nintendo", salon: true }],
  [/\bn64\b|\bnintendo\s?64\b/,            { cle: "n64",         vinted: "Nintendo 64",        beebs: "Retrogaming", lbc: "Nintendo", opla: "nintendo", salon: true }],
  [/\bsuper\s?famicom\b|\bsnes\b|\bsuper\s?nintendo\b/, { cle: "snes", vinted: "Super Nintendo", beebs: "Retrogaming", lbc: "Nintendo", opla: "retro", salon: true }],
  [/\bfamicom\b|\bnes\b/,                  { cle: "nes",         vinted: "Nintendo Entertainment System", beebs: "Retrogaming", lbc: "Nintendo", opla: "retro", salon: true }],
  [/\bnds\b|\bds\b/,                       { cle: "ds",          vinted: "Nintendo DS",        beebs: "Nintendo DS", lbc: "Nintendo", opla: "nintendo", portable: true }],
  [/\bdreamcast\b/,                        { cle: "dreamcast",   vinted: "Sega Dreamcast",     beebs: "Retrogaming", lbc: "Sega",     opla: "retro", salon: true }],
  [/\bmega\s?drive\b|\bmegadrive\b/,       { cle: "megadrive",   vinted: "Sega Mega Drive",    beebs: "Retrogaming", lbc: "Sega",     opla: "retro", salon: true }],
  [/\bsaturn\b/,                           { cle: "saturn",      vinted: "Sega Saturn",        beebs: "Retrogaming", lbc: "Sega",     opla: "retro", salon: true }],
  [/\bsteam\s?deck\b/,                     { cle: "steamdeck",   vinted: "Steam Deck",         beebs: "PC",          lbc: "Autre",    opla: "pc", portable: true }],
  [/\batari\b/,                            { cle: "atari",       vinted: "Atari",              beebs: "Retrogaming", lbc: "Atari",    opla: "retro", salon: true }],
  [/\bnintendo\b/,                         { cle: "nintendo",    vinted: null,                 beebs: null,          lbc: "Nintendo", opla: "nintendo" }],
  [/\bsega\b/,                             { cle: "sega",        vinted: null,                 beebs: "Retrogaming", lbc: "Sega",     opla: "retro" }],
];

/** La machine nommée dans le texte, ou null. Le plus précis gagne. */
export function machineDuTexte(texte) {
  const t = norm(texte);
  for (const [re, m] of MACHINES) if (re.test(t)) return m;
  return null;
}

// ── LES FEUILLES, PAR PLATEFORME ET PAR FAMILLE ───────────────────────────
// Chemins RELEVÉS (src/utils/arbres/*Feuilles.js), vérifiés un par un par
// scripts/jeux-video-selftest.mjs : une feuille qui disparaîtrait d'un relevé
// fait échouer le self-test au lieu de publier dans le vide.
// ⛔ Leboncoin n'a PAS de rayon « accessoires de console » : son arbre s'arrête
//    à « Consoles » et « Jeux vidéo ». Un accessoire y reste donc en
//    « Consoles » — c'est déjà là que ses vendeurs les rangent (la Balance
//    Board du parc) et c'est exactement le comportement d'aujourd'hui.
// ⛔ Opla n'a pas non plus de rayon accessoire de console, et ses feuilles de
//    jeux sont séparées PAR MARQUE : sans marque reconnue on ne pose RIEN,
//    comme le veut sa doctrine (le pré-vol pose alors la question).
const FEUILLES = {
  vinted: {
    jeu:        { chemin: ["Électronique", "Jeux vidéo et consoles", "Jeux"], id: "3026" },
    console:    { chemin: ["Électronique", "Jeux vidéo et consoles", "Consoles"], id: "3025" },
    accessoire: { chemin: ["Électronique", "Jeux vidéo et consoles", "Accessoires", "Autres accessoires"], id: "3030" },
    accessoire_manette: { chemin: ["Électronique", "Jeux vidéo et consoles", "Manettes"], id: "3570" },
    accessoire_etui:    { chemin: ["Électronique", "Jeux vidéo et consoles", "Accessoires", "Étuis"], id: "3027" },
  },
  leboncoin: {
    jeu:        { chemin: ["Électronique", "Jeux vidéo"], id: null },
    console:    { chemin: ["Électronique", "Consoles"], id: null },
    accessoire: { chemin: ["Électronique", "Consoles"], id: null },
  },
  beebs: {
    jeu:        { chemin: ["Jeux, jouets et loisirs", "Multimédia", "Jeux vidéo"], id: null },
    console:    { chemin: ["Jeux, jouets et loisirs", "Multimédia", "Consoles de jeux"], id: null },
    accessoire: { chemin: ["Jeux, jouets et loisirs", "Multimédia", "Accessoires pour consoles"], id: null },
  },
  ebay: {
    jeu:        { chemin: ["Jeux vidéo, consoles", "Jeux"], id: "139973" },
    console:    { chemin: ["Jeux vidéo, consoles", "Consoles"], id: "139971" },
    accessoire: { chemin: ["Jeux vidéo, consoles", "Accessoires", "Autres"], id: "49230" },
    accessoire_manette: { chemin: ["Jeux vidéo, consoles", "Accessoires", "Manettes, périphériques de jeu"], id: "117042" },
    accessoire_etui:    { chemin: ["Jeux vidéo, consoles", "Accessoires", "Etuis, housses, sacs"], id: "171831" },
  },
  opla: {
    jeu_playstation: { chemin: ["Culture et Loisirs", "Jeux vidéo", "Jeux PlayStation"], id: "JEUX_VIDEO_PLAYSTATION" },
    jeu_xbox:        { chemin: ["Culture et Loisirs", "Jeux vidéo", "Jeux Xbox"], id: "JEUX_VIDEO_XBOX" },
    jeu_nintendo:    { chemin: ["Culture et Loisirs", "Jeux vidéo", "Jeux Nintendo"], id: "JEUX_VIDEO_NINTENDO" },
    jeu_pc:          { chemin: ["Culture et Loisirs", "Jeux vidéo", "Jeux PC"], id: "JEUX_VIDEO_PC" },
    jeu_retro:       { chemin: ["Culture et Loisirs", "Jeux vidéo", "Jeux rétro"], id: "JEUX_VIDEO_RETRO" },
    console_portable: { chemin: ["Culture et Loisirs", "Consoles", "Consoles portables"], id: "CONSOLES_PORTABLES" },
    console_salon:    { chemin: ["Culture et Loisirs", "Consoles", "Consoles de salon"], id: "CONSOLES_DE_SALON" },
  },
};

/**
 * La feuille d'une plateforme pour un article du domaine.
 * @param {string} plateforme "vinted"|"leboncoin"|"beebs"|"ebay"|"opla"
 * @param {object} detail     ce que rend familleJeuVideo
 * @returns {{chemin:string[], id:string|null}|null} null = on ne pose rien.
 */
export function cheminJeuVideo(plateforme, detail) {
  if (!detail || !FEUILLES[plateforme]) return null;
  const { famille, sousType, machine } = detail;
  if (plateforme === "opla") {
    if (famille === "jeu") return FEUILLES.opla[`jeu_${machine?.opla ?? ""}`] ?? null;
    if (famille === "console") {
      if (machine?.portable) return FEUILLES.opla.console_portable;
      if (machine?.salon) return FEUILLES.opla.console_salon;
      return null; // hybride ou machine inconnue : on ne devine pas.
    }
    return null; // aucun rayon d'accessoire de console chez Opla.
  }
  const table = FEUILLES[plateforme];
  if (famille === "accessoire" && sousType && table[`accessoire_${sousType}`]) {
    return table[`accessoire_${sousType}`];
  }
  return table[famille] ?? null;
}

// ── LE CLASSEMENT PAR ÂGE (PEGI) — LU, JAMAIS DEVINÉ ──────────────────────
// Décision Nico du 20/09 : l'IA a le droit de le PROPOSER, jamais de
// l'inventer — un PEGI faux fait retirer l'annonce. Ici on ne fait donc que
// LIRE ce qui est écrit noir sur blanc dans le titre ou la description
// (« PEGI 12 », « PEGI18 », « USK 16 »). Rien d'écrit → rien de posé, et le
// stepper pose la question avec la liste relevée (17 valeurs, « Non précisé »
// comprise — c'est une vraie option de Vinted, pas un contournement).
// Valeurs rendues : celles de la liste Vinted, au caractère près.
const PEGI_LU = /\bpegi\s?-?\s?(3|7|12|16|18)\b/;
const USK_LU = /\busk\s?-?\s?(0|6|12|16|18)\b/;

/** Le classement par âge, seulement s'il est ÉCRIT. Sinon null. */
export function classementAgeEcrit(titre, description = "") {
  const t = norm(`${titre} ${description}`);
  const p = t.match(PEGI_LU);
  if (p) return `PEGI ${p[1]}`;
  const u = t.match(USK_LU);
  if (u) return `USK ${u[1]}`;
  return null;
}

// Les codes de champs relevés sur le formulaire Vinted (catalogue
// platform_category_aspects, feuilles « Jeux » et « Consoles »).
// ⚠️ `video_game_ratings` est au PLURIEL. Vérifié le 20/09 : le job 8256bf6d
//    (« Bravely Default II ») est PUBLIÉ avec vintedAspects.video_game_ratings
//    = « PEGI 12 » ; aucune trace du singulier nulle part en base.
export const VINTED_CHAMP_PLATEFORME = "video_game_platform";
export const VINTED_CHAMP_CLASSEMENT = "video_game_ratings";

// ── LE CLASSEMENT D'ÂGE, D'UNE PLATEFORME À L'AUTRE ───────────────────────
// RELEVÉ LE 20/09, plateforme par plateforme, et le résultat est court :
//   · Vinted « Jeux »  : `video_game_ratings`, 17 valeurs, REQUIS ;
//   · eBay   « Jeux »  : aspect « Classification », 5 valeurs, FACULTATIF ;
//   · Leboncoin        : AUCUN champ de classification sur « Jeux vidéo » ni
//     sur « Consoles » (relevé complet des deux feuilles) ;
//   · Beebs            : un champ « Âge » existe sur Figurines/LEGO/DVD…, mais
//     PAS au relevé de « Multimédia > Jeux vidéo » — et c'est l'âge RECOMMANDÉ
//     d'un jouet (« 8 ans - 12 ans »), pas un classement PEGI. On ne fabrique
//     pas une équivalence entre deux échelles qui ne mesurent pas la même
//     chose ; (25/09 : le relevé l'a DEPUIS — « Âge » est REQUIS sur
//     « Multimédia > Jeux vidéo ». Ce qu'on en fait, lu et jamais deviné :
//     ageBeebsDuClassement, en bas de ce fichier.)
//   · Opla             : aucun champ d'aspect sur ses feuilles de jeux.
// Les 5 valeurs PEGI d'eBay sont ÉCRITES EXACTEMENT comme celles de Vinted
// (« PEGI 12 ») : la correspondance est l'identité, vérifiée valeur par valeur
// par scripts/jeux-video-selftest.mjs. Les 12 autres valeurs de Vinted (USK,
// ESRB, « RP », « Non précisé ») n'existent PAS chez eBay → on ne pose RIEN
// pour celles-là. Hors liste = rien, jamais un à-peu-près.
export const EBAY_ASPECT_CLASSEMENT = "Classification";

/** Les 17 valeurs de Vinted, relevées. Rien d'autre ne part chez Vinted. */
export const VINTED_CLASSEMENTS = [
  "AO – Réservé aux adultes", "E – Tous publics", "E10+ – 10 ans et plus",
  "M – 17 ans et plus", "Non précisé", "PEGI 12", "PEGI 16", "PEGI 18",
  "PEGI 3", "PEGI 7", "RP – En attente de classement", "T – 13 ans et plus",
  "USK 0", "USK 12", "USK 16", "USK 18", "USK 6",
];

/** Les 5 valeurs d'eBay, relevées. Rien d'autre ne part chez eBay. */
export const EBAY_CLASSEMENTS = ["PEGI 3", "PEGI 7", "PEGI 12", "PEGI 16", "PEGI 18"];

/** La valeur acceptée par une plateforme, ou null si elle n'y existe pas. */
export function classementPourPlateforme(plateforme, valeur) {
  const v = String(valeur ?? "").trim();
  if (!v) return null;
  if (plateforme === "vinted") return VINTED_CLASSEMENTS.includes(v) ? v : null;
  if (plateforme === "ebay") return EBAY_CLASSEMENTS.includes(v) ? v : null;
  return null; // Leboncoin, Beebs, Opla : aucun champ relevé.
}

// ── L'ÂGE BEEBS D'UN JEU VIDÉO — LU SUR SON CLASSEMENT, JAMAIS DEVINÉ ──────
// (2026-09-25, point 3.) L'IA de rédaction Beebs déduisait l'âge d'un jeu de
// son TITRE : « 2 ans - 3 ans » sur un jeu Xbox 360, « 0-6 mois » sur deux
// autres (XEWER, 66 annonces en ligne sur 70, une seule avec un PEGI écrit).
// Beebs EXIGE « Âge » sur « Multimédia > Jeux vidéo », en tranches d'âge
// d'ENFANT ; un PEGI est un âge MINIMUM. Décision du 25/09 : l'âge d'un jeu
// vidéo est LU — sur la fiche ou dans l'annonce (PEGI) —, sinon DEMANDÉ.
// La lecture : la tranche qui S'OUVRE à l'âge minimum écrit, sinon celle qui
// le CONTIENT.
//   · PEGI 3 → « 3 ans - 4 ans » ; PEGI 12 → « 12 ans - 16 ans » ;
//   · PEGI 7 → « 6 ans - 8 ans » (aucune tranche ne s'ouvre à 7, celle-ci le
//     contient) ;
//   · PEGI 16 et PEGI 18 → « 16 ans et + » (la seule tranche qui les contient) ;
//   · même lecture pour l'USK (6 → « 6 ans - 8 ans », 12, 16, 18) ;
//   · USK 0, ESRB (« E – Tous publics »…), « Non précisé » : aucun âge
//     minimum, aucune tranche (« 0-6 mois » n'est pas un public de jeu) → la
//     question part.
// MESURÉ le 25/09 sur les 17 jeux XEWER dont la fiche porte le PEGI répondu
// par la vendeuse : 15 annonces portaient DÉJÀ exactement cette tranche ; la
// vendeuse elle-même, interrogée, a répondu « 3 ans - 4 ans » pour des jeux
// PEGI 3.
// ⛔ Jamais un titre, jamais « le jeu est connu pour être PEGI 12 » : ce que
//    l'IA « sait » d'un jeu, c'est exactement la déduction interdite.
export const BEEBS_AGES = [
  "0-6 mois", "6-12 mois", "12-24 mois", "2 ans - 3 ans", "3 ans - 4 ans",
  "4 ans - 6 ans", "6 ans - 8 ans", "8 ans - 12 ans", "12 ans - 16 ans", "16 ans et +",
];
export const BEEBS_AGE_PAR_CLASSEMENT = {
  "PEGI 3": "3 ans - 4 ans",
  "PEGI 7": "6 ans - 8 ans",
  "PEGI 12": "12 ans - 16 ans",
  "PEGI 16": "16 ans et +",
  "PEGI 18": "16 ans et +",
  "USK 6": "6 ans - 8 ans",
  "USK 12": "12 ans - 16 ans",
  "USK 16": "16 ans et +",
  "USK 18": "16 ans et +",
};

/** La tranche Beebs qu'ouvre un classement (« PEGI 12 »), ou null. */
export function ageBeebsDuClassement(classement) {
  return BEEBS_AGE_PAR_CLASSEMENT[String(classement ?? "").trim()] ?? null;
}

/**
 * L'âge Beebs d'un jeu vidéo, LU dans le titre ou la description (PEGI/USK
 * écrit), ou null — jamais une déduction.
 * @returns {{valeur:string, classement:string}|null}
 */
export function ageBeebsJeuVideoLu(titre, description = "") {
  const classement = classementAgeEcrit(titre, description);
  const valeur = ageBeebsDuClassement(classement);
  return valeur ? { valeur, classement } : null;
}
