// ═══════════════════════════════════════════════════════════════════════════
// NON-RÉGRESSION — jeu / console / accessoire (src/utils/jeuxVideo.js)
//   node scripts/jeux-video-selftest.mjs
//
// DEUX VÉRIFICATIONS, toutes deux bloquantes :
//   1. CHAQUE FEUILLE VISÉE EXISTE dans l'arbre relevé de sa plateforme
//      (src/utils/arbres/*Feuilles.js). Si un relevé change et qu'une feuille
//      disparaît, ce test tombe — au lieu de publier dans le vide.
//   2. LE CORPUS : 62 titres RÉELS du parc (relevés le 2026-09-20, emails de
//      test exclus), avec la famille attendue. Les cas « null » sont ceux qui
//      ne doivent RIEN changer : cadres déco, lampes, vêtements, goodies.
//
// Le corpus contient tous les cas qui ont fait échouer une version
// intermédiaire des règles — ils sont là pour qu'ils ne reviennent pas.
// ═══════════════════════════════════════════════════════════════════════════
import { familleJeuVideo, cheminJeuVideo, machineDuTexte, classementAgeEcrit, classementPourPlateforme, ageBeebsDuClassement, ageBeebsJeuVideoLu, BEEBS_AGES } from "../src/utils/jeuxVideo.js";
import { FEUILLES as VINTED } from "../src/utils/arbres/vintedFeuilles.js";
import { FEUILLES as LBC } from "../src/utils/arbres/leboncoinFeuilles.js";
import { FEUILLES as BEEBS } from "../src/utils/arbres/beebsFeuilles.js";
import { FEUILLES as EBAY } from "../src/utils/arbres/ebayFeuilles.js";
import { FEUILLES as OPLA } from "../src/utils/arbres/oplaFeuilles.js";

const ARBRES = { vinted: VINTED, leboncoin: LBC, beebs: BEEBS, ebay: EBAY, opla: OPLA };
const norm = (s) => String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

let echecs = 0;
const ko = (m) => { console.error("  ✗", m); echecs++; };

// ── 1. Les feuilles visées existent-elles vraiment ? ──────────────────────
console.log("1. Feuilles visées présentes dans les arbres relevés");
const CAS_FEUILLES = [
  ["jeu", { famille: "jeu", sousType: null, machine: machineDuTexte("ps4") }],
  ["console", { famille: "console", sousType: null, machine: machineDuTexte("ps4") }],
  ["accessoire", { famille: "accessoire", sousType: null, machine: machineDuTexte("ps4") }],
  ["accessoire manette", { famille: "accessoire", sousType: "manette", machine: machineDuTexte("ps4") }],
  ["accessoire etui", { famille: "accessoire", sousType: "etui", machine: machineDuTexte("ps4") }],
  ["jeu nintendo (opla)", { famille: "jeu", sousType: null, machine: machineDuTexte("switch") }],
  ["jeu xbox (opla)", { famille: "jeu", sousType: null, machine: machineDuTexte("xbox 360") }],
  ["jeu retro (opla)", { famille: "jeu", sousType: null, machine: machineDuTexte("megadrive") }],
  ["console portable (opla)", { famille: "console", sousType: null, machine: machineDuTexte("psp") }],
  ["console salon (opla)", { famille: "console", sousType: null, machine: machineDuTexte("ps4") }],
];
for (const [nom, detail] of CAS_FEUILLES) {
  for (const plateforme of Object.keys(ARBRES)) {
    const f = cheminJeuVideo(plateforme, detail);
    if (!f) continue; // « on ne pose rien » est une réponse légitime
    const cle = f.chemin.map(norm).join(" > ");
    const trouvee = ARBRES[plateforme].find((x) => x.chemin.map(norm).join(" > ") === cle);
    if (!trouvee) ko(`${plateforme} / ${nom} : « ${f.chemin.join(" > ")} » ABSENT de l'arbre relevé`);
    else if (f.id != null && String(trouvee.id ?? "") !== String(f.id)) {
      ko(`${plateforme} / ${nom} : id ${f.id} ≠ id relevé ${trouvee.id}`);
    }
  }
}

// ── 2. Le corpus des titres réels ─────────────────────────────────────────
// famille attendue : "jeu" | "console" | "accessoire" | null (ne rien changer)
const CORPUS = [
  // — Les cas qui ont motivé le lot (jobs réels du 18-19/09) —
  ["🎮 EA Sports FC 25 – PS5 – Neuf sous blister", "jeu"],
  ["🎮 NBA 2K25 – Xbox Series X / Xbox One – Neuf sous blister", "jeu"],
  ["Gears of War 3 Xbox 360 PAL Version Française sans notice", "jeu"],
  ["Tom Clancy's Ghost Recon Advanced Warfighter PSP complet", "jeu"],
  ["Bravely Default II Nintendo Switch - Neuf sous blister", "jeu"],
  ["Fifa11 ps3 excellent état", "jeu"],
  ["Horizon Zero Dawn - PS4 (comme neuf)", "jeu"],
  ["Lot 3 jeux Wii : LEGO, L'Âge de Glace, Lapins Crétins", "jeu"],
  ["Lot de  10 jeu sony playstation 1 jap loose", "jeu"],
  ["LEGO Jurassic World Xbox One - Avec livret - Très bon état", "jeu"],
  ["LEGO Dimensions Xbox One – jeu et livret, sans portail ni figurines", "jeu"],
  ["UEFA Euro 2004 Portugal Xbox PAL FR + stickers Panini sans notice", "jeu"],
  ["Jeu non inclus - LEGO Indiana Jones La Trilogie Originale PSP - boîte + notice", "jeu"],
  ["Wii Sports Nintendo Wii PAL – pochette cartonnée", "jeu"],
  ["Fighters Uncaged Xbox 360 Kinect PAL FR - sans notice", "jeu"],
  ["Splatoon Nintendo Wii U jap #1 manque notice", "jeu"],
  ["Jeu PS4 Rage 2", "jeu"],
  ["Jeu chibi-robo! 3ds", "jeu"],
  ["Jeu Nintendo DS World Snooker Championship Season 2007", "jeu"],
  ["Jeux ps3", "jeu"],
  ["Jeu de wii", "jeu"],
  ["Mario tennis Aces nintendo switch fr", "jeu"],
  ["Monster Jam Crush It Nintendo Switch", "jeu"],
  ["Street fighter 5 ps4 fr", "jeu"],
  ["Final Fantasy IX  PlayStation 1 (PS1)  Complet  Version Japonaise", "jeu"],
  ["Dragon quest 7 sony playstation 1 jap loose", "jeu"],
  ["Super smash bros melee nintendo wii jap", "jeu"],
  ["Predator: Hunting Grounds  PS4  Complet  Version EUR", "jeu"],
  ["Vampire The Masquerade: Swansong - Xbox Series X - Neuf", "jeu"],
  ["Minna no Curling DS Nintendo DS", "jeu"],
  ["Les Sims 3 pour PlayStation 3 (PS3) - Bon état", "jeu"],
  ["Switch - Jeu animal crossing New Horizon", "jeu"],

  // — Les machines : elles ne doivent JAMAIS basculer au rayon des jeux —
  ["Console atari 2600 +", "console"],
  ["Console de jeu portable 2 pouces TFT écran couleur", "console"],
  ["Console Nintendo Switch Lite corail avec accessoires et jeux", "console"],
  ["Console portable Nintendo 3DS XL Bleu Nuit", "console"],
  ["Console rétro AtGames Legends Flashback 100 jeux neuve scellée", "console"],
  ["Console Steam Deck OLED 512 Go – État Comme Neuf + Sacoche", "console"],
  ["Pack Nintendo Wii Complet", "console"],
  ["Xbox One + 5 jeux", "console"],
  ["PS4 + 3 manettes et 3jeux", "console"],
  ["Nintendo Wii complète + 4 manettes officielles + 2 Nunchuks", "console"],
  ["PlayStation Vita noire avec 3 jeux et accessoires", "console"],
  ["Nintendo Switch OLED 64 Go + 2 volants + housse", "console"],
  ["Switch Lite Turquoise - Fonctionnelle", "console"],
  ["Nintendo DS Lite", "console"],
  ["Nintendo Ds fat grise", "console"],
  ["Nintendo DS xl jaune", "console"],
  ["Gameboy advanced 2001", "console"],
  ["PlayStation 3 noire", "console"],
  ["Sony playstation 2 jap scph 30000 en boite", "console"],
  ["Wii", "console"],
  ["PS4 ", "console"],

  // — Les accessoires —
  ["Manette Xbox Séries", "accessoire"],
  ["Manette Nintendo Gamecube wavebird avec recepteur", "accessoire"],
  ["Joy-Con Pair Switch violet et menthe", "accessoire"],
  ["Lot de manette nintendo wii", "accessoire"],
  ["Lot de 2 manettes ascii pour ps1 et ps2 peche", "accessoire"],
  ["Coque nintendo ds lite blanche officielle", "accessoire"],
  ["Housse etui rangement manette playstation 5", "accessoire"],
  ["2 pochettes PSP et 1 nintendo DS", "accessoire"],
  ["Sacoche Nintendo 3DS Pokémon Soleil & Lune", "accessoire"],
  ["Carte mémoire PS1/PS2", "accessoire"],
  ["Carte mere nintendo super famicom", "accessoire"],
  ["Lecteur optique sony playstation one", "accessoire"],
  ["Camera sony playstation 4", "accessoire"],
  ["Refroidissement ps4", "accessoire"],
  ["Nintendo Wii lan adaptater", "accessoire"],
  ["Lot de 4 nintendo Wii motion plus", "accessoire"],
  ["Nintendo Wifi balance board", "accessoire"],
  ["Télécommande ps2 sony playstation 2", "accessoire"],
  ["Cover dock nintendo switch edition Gamecube", "accessoire"],

  // — Ce qui n'est PAS un article de jeu vidéo : on ne touche à rien —
  ["Cadre manette playstation 5", null],
  ["Cadre Trophée Platine PS5 – MADiSON", null],
  ["Resident Evil Requiem – Cadre Trophée Platine PS5 Personnalisé", null],
  ["Magnet manette ps5", null],
  ["Lampe de bureau console Nintendo Famicom", null],
  ["Lampe PlayStation PSone Déco Gaming Rétro", null],
  ["Tee-shirt playstation", null],
  ["Maillot t-shirt manches longues PlayStation STWD", null],
  ["Épingles Mario Kart 8 Deluxe Switch - Set de 3 pins", null],
  ["Lot de 7 breloques Gaming – Manettes & jeux vidéo", null],
  ["Lot de 4 Nintendo Amiibo animal crossing", null],
  ["Boite vide Nintendo super famicom avec notice", null],
  ["Bluray casino royal pack ps3", null],
  ["Braségali Holo 042/182 - Rivalités Destinées EV10 - DRI FR", null],
  ["Robe fleurie taille M", null],
];

console.log(`2. Corpus : ${CORPUS.length} titres réels`);
for (const [titre, attendu] of CORPUS) {
  const r = familleJeuVideo(titre, "");
  const obtenu = r?.famille ?? null;
  if (obtenu !== attendu) ko(`« ${titre} » → ${obtenu ?? "null"} (attendu ${attendu ?? "null"})`);
}

// ── 3. La machine, dans le vocabulaire de chaque plateforme ───────────────
console.log("3. Machines");
const MACHINES_ATTENDUES = [
  ["NBA 2K25 – Xbox Series X / Xbox One", "Xbox Series S et X", "Xbox Series", "Microsoft"],
  ["EA Sports FC 25 – PS5", "PlayStation 5", "PS5", "Sony"],
  ["Ghost Recon PSP complet", "PlayStation Portable", "PSP", "Sony"],
  ["Bravely Default II Nintendo Switch", "Nintendo Switch", "Nintendo Switch", "Nintendo"],
  ["Gears of War 3 Xbox 360", "Xbox 360", "Xbox 360", "Microsoft"],
  ["Jeu Nintendo DS World Snooker", "Nintendo DS", "Nintendo DS", "Nintendo"],
  ["Dragon quest 7 sony playstation 1 jap", "PlayStation 1", "Retrogaming", "Sony"],
  ["Super smash bros melee nintendo wii jap", "Nintendo Wii", "Nintendo Wii", "Nintendo"],
  ["Splatoon Nintendo Wii U jap", "Nintendo Wii U", "Nintendo Wii U", "Nintendo"],
  ["Koro Koro Kirby Nintendo Gameboy color jap", "Nintendo Game Boy", "Retrogaming", "Nintendo"],
  ["Dream Passport 2 Sega Dreamcast jap", "Sega Dreamcast", "Retrogaming", "Sega"],
];
for (const [titre, vinted, beebs, lbc] of MACHINES_ATTENDUES) {
  const m = machineDuTexte(titre);
  if (!m) { ko(`machine introuvable dans « ${titre} »`); continue; }
  if (m.vinted !== vinted) ko(`« ${titre} » → Vinted « ${m.vinted} » (attendu « ${vinted} »)`);
  if (m.beebs !== beebs) ko(`« ${titre} » → Beebs « ${m.beebs} » (attendu « ${beebs} »)`);
  if (m.lbc !== lbc) ko(`« ${titre} » → Leboncoin « ${m.lbc} » (attendu « ${lbc} »)`);
}
// Les valeurs Vinted doivent exister dans la liste RELEVÉE (48 valeurs,
// platform_category_aspects / video_game_platform, relevé du 2026-09-20).
const VINTED_PLATEFORMES = new Set(["Acer Nitro Blaze 11","Acer Nitro Blaze 7","Acer Nitro Blaze 8","Asus ROG Ally","Asus ROG Ally X","Asus ROG Xbox Ally","Atari","Ayaneo","Commodore","Lenovo Legion Go","MSI Claw 7 AI+","MSI Claw 8 AI+","MSI Claw A1M","MSI Claw A8","Nintendo 2DS","Nintendo 3DS","Nintendo 64","Nintendo DS","Nintendo Entertainment System","Nintendo Game Boy","Nintendo Game Boy Advance","Nintendo GameCube","Nintendo Switch","Nintendo Switch 2","Nintendo Wii","Nintendo Wii U","PC et Mac","PlayStation 1","PlayStation 2","PlayStation 3","PlayStation 4","PlayStation 5","PlayStation 5 Pro","PlayStation Portable","PlayStation Portal","PlayStation Vita","Sega Dreamcast","Sega Mega Drive","Sega Saturn","Steam Deck","Steam Machine","Super Nintendo","Xbox (originale)","Xbox 360","Xbox Ally X","Xbox One","Xbox Series S et X","Zotac Gaming Zone"]);
const BEEBS_CONSOLES = new Set(["PS5","PS4","PS3","PS2","PS Vita","PSP","Xbox Series","Xbox One","Xbox 360","Nintendo GameCube","Nintendo Switch","Nintendo Wii U","Nintendo Wii","Nintendo 3DS","Nintendo DS","Retrogaming","PC","Mac"]);
const LBC_MARQUES = new Set(["Sony","Nintendo","Microsoft","Sega","Neo-Geo AES","Amiga","Atari","Amstrad","Autre constructeur retrogaming","Autre"]);
for (const [, m] of [["", machineDuTexte("ps4")]].concat(
  ["xbox series","xbox 360","xbox one","xbox","ps5 pro","ps vita","psp","ps1","ps2","ps3","ps4","ps5","playstation",
   "switch 2","switch","wii u","wii","3ds","2ds","game boy advance","game boy","gamecube","n64","snes","nes","ds",
   "dreamcast","megadrive","saturn","steam deck","atari","nintendo","sega"].map((s) => [s, machineDuTexte(s)]))) {
  if (!m) continue;
  if (m.vinted && !VINTED_PLATEFORMES.has(m.vinted)) ko(`« ${m.vinted} » absent de la liste Vinted relevée`);
  if (m.beebs && !BEEBS_CONSOLES.has(m.beebs)) ko(`« ${m.beebs} » absent de la liste Beebs relevée`);
  if (m.lbc && !LBC_MARQUES.has(m.lbc)) ko(`« ${m.lbc} » absent de la liste Leboncoin relevée`);
}

// ── 4. Le classement par âge : lu, jamais deviné ──────────────────────────
console.log("4. Classement par âge");
const AGES = [
  ["Rage 2 PS4 PEGI 18 complet", "PEGI 18"],
  ["Mario Kart 8 Switch pegi3", "PEGI 3"],
  ["Doom Eternal USK 18", "USK 18"],
  ["FIFA 23 PS5 neuf sous blister", null],
  ["Zelda Breath of the Wild Switch", null],
];
for (const [titre, attendu] of AGES) {
  const v = classementAgeEcrit(titre, "");
  if (v !== attendu) ko(`« ${titre} » → ${v ?? "null"} (attendu ${attendu ?? "null"})`);
}

// ── 5. Le classement d'âge, d'une plateforme à l'autre ───────────────────
// Listes RELEVÉES le 2026-09-20 : Vinted 17 valeurs (REQUIS sur « Jeux »),
// eBay 5 valeurs (aspect « Classification », FACULTATIF). Leboncoin, Beebs et
// Opla n'ont AUCUN champ de classification sur leurs rayons de jeux.
console.log("5. Classement d'âge");
for (const v of ["PEGI 3", "PEGI 7", "PEGI 12", "PEGI 16", "PEGI 18"]) {
  if (classementPourPlateforme("vinted", v) !== v) ko(`Vinted refuse « ${v} » (il est dans sa liste relevée)`);
  if (classementPourPlateforme("ebay", v) !== v) ko(`eBay refuse « ${v} » (il est dans sa liste relevée)`);
}
for (const v of ["USK 16", "Non précisé", "T – 13 ans et plus", "E – Tous publics"]) {
  if (classementPourPlateforme("vinted", v) !== v) ko(`Vinted refuse « ${v} » (il est dans sa liste relevée)`);
  if (classementPourPlateforme("ebay", v) !== null) ko(`eBay accepte « ${v} » — ABSENT de sa liste relevée, rien ne doit partir`);
}
for (const p of ["leboncoin", "beebs", "opla"]) {
  if (classementPourPlateforme(p, "PEGI 12") !== null) ko(`${p} : aucun champ de classement relevé, rien ne doit partir`);
}
if (classementPourPlateforme("vinted", "PEGI 15") !== null) ko("« PEGI 15 » n'existe pas : rien ne doit partir");

// ── 6. L'âge Beebs d'un jeu vidéo : lu sur son classement, jamais deviné ──
// (2026-09-25) Liste Beebs RELEVÉE (catalogue, « Multimédia > Jeux vidéo »,
// REQUIS). La tranche qui s'ouvre à l'âge minimum écrit, sinon celle qui le
// contient ; sans âge minimum (USK 0, ESRB, « Non précisé ») → la question.
console.log("6. Âge Beebs d'un jeu vidéo");
for (const [classement, attendu] of [
  ["PEGI 3", "3 ans - 4 ans"], ["PEGI 7", "6 ans - 8 ans"], ["PEGI 12", "12 ans - 16 ans"],
  ["PEGI 16", "16 ans et +"], ["PEGI 18", "16 ans et +"],
  ["USK 0", null], ["USK 6", "6 ans - 8 ans"], ["USK 18", "16 ans et +"],
  ["Non précisé", null], ["E – Tous publics", null], ["", null], [null, null],
]) {
  const v = ageBeebsDuClassement(classement);
  if (v !== attendu) ko(`${classement ?? "null"} → ${v ?? "null"} (attendu ${attendu ?? "null"})`);
  if (v && !BEEBS_AGES.includes(v)) ko(`« ${v} » absent de la liste Beebs relevée`);
}
for (const [titre, description, attendu] of [
  ["Rage 2 PS4 PEGI 18 complet", "", "16 ans et +"],
  ["Halo 3 Xbox 360", "Jeu complet avec notice. PEGI 16.", "16 ans et +"],
  ["Mario Kart 8 Switch", "", null],                 // pas écrit : la question
  ["Crash Bandicoot Xbox 360", "tout public", null],  // « tout public » n'est pas un PEGI
  ["Disney Magical World Nintendo 3DS", "PEGI 7", "6 ans - 8 ans"], // la tranche qui contient 7
]) {
  const lu = ageBeebsJeuVideoLu(titre, description);
  if ((lu?.valeur ?? null) !== attendu) ko(`« ${titre} » → ${lu?.valeur ?? "null"} (attendu ${attendu ?? "null"})`);
}

if (echecs) { console.error(`\n❌ ${echecs} échec(s)`); process.exit(1); }
console.log("\n✅ tout passe");
