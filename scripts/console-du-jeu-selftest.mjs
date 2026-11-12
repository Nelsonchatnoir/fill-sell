// ═══════════════════════════════════════════════════════════════════════════
// VERROU — LA MACHINE D'UN JEU VIDÉO, CONNUE, NE SE REDEMANDE PAS (12/11, lot « zéro problème », 1e — Nico)
// ═══════════════════════════════════════════════════════════════════════════
//     npm run selftest:console-du-jeu
//
// Mesure 14 j (champ_requis_bloquant) : Beebs « Jeux vidéo » × « Console » demandé sur 93 fiches de 3 comptes
// (229c7b07 : 91) alors que la machine était dans le titre (« PS1 PAL », N64, Megadrive, Dreamcast, GameCube) ; Vinted
// « Jeux » × `video_game_platform` demandé sur 12 fiches — posé seulement au clic, jamais à l'écran. L'écran ne lisait
// la machine nulle part (genericKnownSource, champRequisAuto) ; le clic ne posait « Console » Beebs que pour une
// CONSOLE, alors que le champ est requis sur les trois feuilles (Jeux vidéo, Consoles de jeux, Accessoires pour
// consoles — relevé en lecture seule le 12/11).
// LA RÈGLE (une pour l'écran et le clic, src/utils/jeuxVideo.js) : la machine que NOMME l'article (titre d'abord, la
// description seulement si aucun titre n'en nomme), écrite EXACTEMENT comme la liste de la plateforme ; une machine
// rétro → « Retrogaming » (Beebs) ; une machine absente de la liste et non rétro (Steam Deck, Switch 2) → la question ;
// deux titres, deux machines → la question. Âge Beebs (livres, DVD) et PEGI inconnus : la question, jamais inventés.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = async (p) => { try { return await import(pathToFileURL(join(ROOT, p)).href); } catch (e) { console.log(`  (import de ${p} impossible : ${e.message.split("\n")[0]})`); return {}; } };
let ko = 0, okN = 0;
const ok = (c, m) => { if (c) { okN++; console.log(`  ✓ ${m}`); } else { ko++; console.log(`  ✗ ${m}`); } };

const J = await charger("src/utils/jeuxVideo.js");
const C = await charger("supabase/functions/_shared/champs-requis-auto.js");
// Les listes RELEVÉES (platform_category_aspects, lecture seule du 12/11 ; Vinted : relevé du 20/09).
const BEEBS_CONSOLE = ["PS5", "PS4", "PS3", "PS2", "PS Vita", "PSP", "Xbox Series", "Xbox One", "Xbox 360", "Nintendo GameCube", "Nintendo Switch", "Nintendo Wii U", "Nintendo Wii", "Nintendo 3DS", "Nintendo DS", "Retrogaming", "PC", "Mac"];
const VINTED_PLATEFORMES = ["Atari", "Nintendo 2DS", "Nintendo 3DS", "Nintendo 64", "Nintendo DS", "Nintendo Entertainment System", "Nintendo Game Boy", "Nintendo Game Boy Advance", "Nintendo GameCube", "Nintendo Switch", "Nintendo Switch 2", "Nintendo Wii", "Nintendo Wii U", "PC et Mac", "PlayStation 1", "PlayStation 2", "PlayStation 3", "PlayStation 4", "PlayStation 5", "PlayStation 5 Pro", "PlayStation Portable", "PlayStation Vita", "Sega Dreamcast", "Sega Mega Drive", "Sega Saturn", "Steam Deck", "Super Nintendo", "Xbox (originale)", "Xbox 360", "Xbox One", "Xbox Series S et X"];
const pour = (plateforme, titre, allowedValues, description = "") => (typeof J.plateformeDuJeuPourLaListe === "function"
  ? J.plateformeDuJeuPourLaListe({ plateforme, cle: plateforme === "beebs" ? "Console" : "video_game_platform", titres: [titre], descriptions: [description], allowedValues })?.valeur ?? null
  : undefined);

console.log("A. Les titres réels du compte 229c7b07 : la machine du titre, sans question");
for (const [titre, beebs, vinted] of [
  ["Namco Time Crisis PS1 PAL 1996", "Retrogaming", "PlayStation 1"],
  ["Sega Sonic Megadrive PAL", "Retrogaming", "Sega Mega Drive"],
  ["Mario Kart 64 N64 PAL", "Retrogaming", "Nintendo 64"],
  ["Sega Dreamcast Crazy Taxi PAL", "Retrogaming", "Sega Dreamcast"],
  ["Bandai One Piece Nintendo GameCube NTSC-J", "Nintendo GameCube", "Nintendo GameCube"],
  ["Gran Turismo 4 PS2 Platinum", "PS2", "PlayStation 2"],
]) {
  ok(pour("beebs", titre, BEEBS_CONSOLE) === beebs, `« ${titre} » → Beebs Console « ${beebs} » (obtenu « ${pour("beebs", titre, BEEBS_CONSOLE)} »)`);
  ok(pour("vinted", titre, VINTED_PLATEFORMES) === vinted, `« ${titre} » → Vinted video_game_platform « ${vinted} » (obtenu « ${pour("vinted", titre, VINTED_PLATEFORMES)} »)`);
}

console.log("B. Jamais deviné");
ok(pour("beebs", "Console Steam Deck OLED 512 Go", BEEBS_CONSOLE) === null, "Steam Deck : absente de la liste Beebs et non rétro → la question (jamais « PC »)");
ok(pour("vinted", "Console Steam Deck OLED 512 Go", VINTED_PLATEFORMES) === "Steam Deck", "… mais Vinted la liste : « Steam Deck »");
ok(pour("beebs", "Mario Kart World Nintendo Switch 2", BEEBS_CONSOLE) === null, "Switch 2 : absente de la liste Beebs → la question (jamais « Nintendo Switch »)");
ok(pour("vinted", "Mario Kart World Nintendo Switch 2", VINTED_PLATEFORMES) === "Nintendo Switch 2", "… Vinted : « Nintendo Switch 2 »");
ok(pour("beebs", "Namco Time Crisis PS1 PAL 1996", BEEBS_CONSOLE.filter((v) => v !== "Retrogaming")) === null, "une valeur absente de LA liste du rayon → rien");
ok(pour("beebs", "Zelda Breath of the Wild", BEEBS_CONSOLE, "") === null, "aucune machine nommée → la question");
ok(pour("beebs", "Zelda Breath of the Wild", BEEBS_CONSOLE, "Jeu en très bon état pour Nintendo Wii U, notice incluse") === "Nintendo Wii U", "aucune machine au titre : celle de la description");
ok(typeof J.plateformeDuJeuPourLaListe === "function" && J.plateformeDuJeuPourLaListe({ plateforme: "beebs", cle: "Console", titres: ["Jeu PS4 Rage 2", "Rage 2 Xbox One"], descriptions: [""], allowedValues: BEEBS_CONSOLE }) === null,
  "deux titres, deux machines → la question");
ok(typeof J.plateformeDuJeuPourLaListe === "function" && J.plateformeDuJeuPourLaListe({ plateforme: "beebs", cle: "Marque", titres: ["Jeu PS4"], allowedValues: BEEBS_CONSOLE }) === null,
  "un autre champ n'est jamais touché");
ok(typeof J.plateformeDuJeuPourLaListe === "function" && J.plateformeDuJeuPourLaListe({ plateforme: "leboncoin", cle: "console_brand", titres: ["Jeu PS4"], allowedValues: ["Sony"] }) === null,
  "Leboncoin (marque de console) : hors de ce verrou, inchangé");

console.log("C. L'écran pose la machine connue (champRequisAuto), le clic aussi — une seule règle");
{
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  const auto = lps.slice(lps.indexOf("function champRequisAuto("), lps.indexOf("export default function ListingPreviewScreen("));
  ok(/plateformeDuJeuPourLaListe\(/.test(auto), "champRequisAuto (écran) lit la machine du jeu (Beebs Console, Vinted video_game_platform)");
  ok(/titresJeu|titres:/.test(auto), "… titre d'abord (titres de la fiche et de la copie), la description en dernier");
  const res = lire("src/utils/resolutionPublication.js");
  ok(!/jeuVideo\?\.famille === "console" && jeuVideo\.machine\?\.beebs/.test(res), "le clic ne réserve plus « Console » Beebs aux seules consoles");
  ok(/aspectsBeebs\["Console"\]/.test(res) && /jeuVideo\?\.machine\?\.beebs/.test(res), "le clic pose « Console » Beebs pour les trois feuilles (jeu, console, accessoire)");
  ok(typeof J.machineDuTexte === "function" && J.machineDuTexte("steam deck")?.beebs == null && J.machineDuTexte("switch 2")?.beebs == null,
    "la table : Steam Deck et Switch 2 n'ont pas de valeur Beebs (jamais une voisine)");
}

console.log("D. Âge Beebs et PEGI inconnus : la question, jamais inventés");
{
  const AGES = ["0-6 mois", "6-12 mois", "12-24 mois", "2 ans - 3 ans", "3 ans - 4 ans", "4 ans - 6 ans", "6 ans - 8 ans", "8 ans - 12 ans", "12 ans - 16 ans", "16 ans et +"];
  const livre = typeof C.ageBeebsAuto === "function" ? C.ageBeebsAuto({ chemin: ["Jeux, jouets et loisirs", "Livres", "Livres enfants"], textes: ["Le Petit Prince", "Bon état"], allowedValues: AGES }) : "?";
  ok(!livre?.valeur, `livre sans âge écrit → rien (obtenu ${JSON.stringify(livre)})`);
  const dvd = typeof C.ageBeebsAuto === "function" ? C.ageBeebsAuto({ chemin: ["Jeux, jouets et loisirs", "Multimédia", "DVD"], textes: ["Le Roi Lion DVD", ""], allowedValues: AGES }) : "?";
  ok(!dvd?.valeur, `DVD sans âge écrit → rien (obtenu ${JSON.stringify(dvd)})`);
  const jeu = typeof C.ageBeebsAuto === "function" ? C.ageBeebsAuto({ chemin: ["Jeux, jouets et loisirs", "Multimédia", "Jeux vidéo"], textes: ["Namco Time Crisis PS1 PAL 1996", ""], allowedValues: AGES }) : "?";
  ok(!jeu?.valeur, `jeu sans PEGI écrit → rien (obtenu ${JSON.stringify(jeu)})`);
  ok(typeof J.classementAgeEcrit === "function" && J.classementAgeEcrit("Namco Time Crisis PS1 PAL 1996", "") === null, "PEGI non écrit → aucun classement Vinted posé");
}

console.log(`\n${ko ? `✗ ${ko} rouge(s)` : "✓ tout vert"} — ${okN} vert(s)`);
process.exit(ko ? 1 : 0);
