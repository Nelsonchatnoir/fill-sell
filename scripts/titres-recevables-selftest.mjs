// selftest:titres-recevables — (24/10, lot « zéro blocage », B4 / A7) Le titre passe les règles de chaque plateforme
// et de chaque pays AVANT l'envoi : jamais un titre vide, générique ou égal au nom d'une plateforme (le titre de la
// fiche le remplace) ; un refus « symboles » se reconnaît dans toutes les langues de Vinted ; les mots écrits sans
// aucune lettre latine (han, kana…) partent quand 3 mots latins restent — serveur ET extension, même règle.
//   npm run selftest:titres-recevables
// Cas réels : mele.marta, 24/10 (« Vinted » tapé à la question Titre ; « … Giapponese ときた洸一 千葉智宏 » refusé deux
// fois « troppi simboli consecutivi » ; « … PS2 機動戦士ガンダムSeed … » accepté).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const imp = (p) => import(pathToFileURL(path.join(RACINE, p)).href);
const TJ = await imp("supabase/functions/_shared/titre-du-job.js");
const TS = await imp("supabase/functions/_shared/titre-symboles-vinted.js");
let n = 0;
const cas = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
console.log("titres-recevables-selftest");

const KADOKAWA = "Kadokawa Gundam EXA VS Set Manga Volumi 1-5 Giapponese ときた洸一 千葉智宏";

cas("1. jamais un titre vide, fait de symboles, générique ou égal au nom d'une plateforme", () => {
  for (const t of ["", "   ", "…", "Vinted", "vinted ", "LE BON COIN", "Leboncoin", "eBay", "Beebs", "Depop", "FillSell", "Titre", "Annonce", "Sans titre", "Titolo"]) {
    assert.equal(TJ.titreRecevable(t), false, t);
  }
  for (const t of ["Robe", "T shirt", "Robe Vinted rose", "Jean Levi's 501", "Pull Zara", "KADOKAWA Gundam", "Test FillSell 999 €"]) {
    assert.equal(TJ.titreRecevable(t), true, t);
  }
});

cas("2. « Vinted » (job ou réponse) → le titre de la FICHE ; un vrai titre part tel quel", () => {
  assert.deepEqual(TJ.titrePourJob({ platform: "vinted", titreJob: "Vinted", titreSaisi: "Vinted", titreFiche: "KADOKAWA Gundam EXA" }), { titre: "KADOKAWA Gundam EXA", source: "fiche" });
  assert.deepEqual(TJ.titrePourJob({ platform: "vinted", titreJob: "Robe", titreFiche: "x" }), { titre: "Robe", source: "job" });
  assert.equal(TJ.titrePourJob({ platform: "vinted", titreJob: "Vinted", titreSaisi: "", titreFiche: "Depop" }), null, "rien de recevable → la question");
});

cas("3. le refus « symboles » se reconnaît en italien, espagnol, anglais, allemand, néerlandais, français", () => {
  for (const m of ["Il titolo contiene troppi simboli consecutivi", "El título contiene demasiados símbolos", "Title contains too many symbols",
    "Der Titel enthält zu viele Symbole", "De titel bevat te veel symbolen", "Le titre contient trop de symboles d'affilée"]) {
    assert.ok(TS.MOTIF_SYMBOLES_RE.test(m), m);
  }
  assert.ok(!TS.MOTIF_SYMBOLES_RE.test("Le titre contient trop de lettres majuscules"));
});

cas("4. R5 : les mots sans lettre latine partent si 3 mots latins restent ; un mot mêlé au latin reste ; cyrillique intact", () => {
  assert.equal(TS.assagirSymbolesVinted(KADOKAWA), "Kadokawa Gundam EXA VS Set Manga Volumi 1-5 Giapponese");
  assert.equal(TS.assagirSymbolesVinted("Gioco PS2 機動戦士ガンダムSeed Giapponese"), "Gioco PS2 機動戦士ガンダムSeed Giapponese");
  assert.equal(TS.assagirSymbolesVinted("ときた洸一 manga"), "ときた洸一 manga", "moins de 3 mots latins : le titre garde son sens");
  assert.equal(TS.assagirSymbolesVinted("Pull СТИЛЬ noir taille M"), "Pull СТИЛЬ noir taille M");
  assert.equal(TS.titreStrictUtile(KADOKAWA, null), "Kadokawa Gundam EXA VS Set Manga Volumi 1-5 Giapponese", "la reprise après refus porte le titre nettoyé");
});

cas("5. l'extension applique la MÊME règle R5 (copie de background.js)", () => {
  const bg = lire("chrome-extension/background.js");
  const debut = bg.indexOf("function retirerMotsNonLatinsVinted(");
  const fin = bg.indexOf("function sanitizeJob(");
  assert.ok(debut > 0 && fin > debut, "copie de l'extension trouvée");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`const VINTED_TITRE_GARDES = new Set(['"', "'", "«", "»", "“", "”", "‘", "’", "„", "‹", "›", "(", ")", "[", "]", "{", "}"]);\n${bg.slice(debut, fin)}\nthis.f = assagirSymbolesVinted;`, ctx);
  for (const t of [KADOKAWA, "Gioco PS2 機動戦士ガンダムSeed Giapponese", "ときた洸一 manga", "Pull СТИЛЬ noir taille M", "Hoodie Streetwear \"Gangs / Security\" – Motif"]) {
    assert.equal(ctx.f(t), TS.assagirSymbolesVinted(TS.retirerEmojiVinted(t)), `serveur = extension : ${t}`);
  }
});

cas("6. get-pending-jobs : un titre générique est traité comme un titre vide (fiche), et la réponse générique ignorée", () => {
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  assert.ok(/\.filter\(\(j\) => \(j\.action === "publish" \|\| j\.action === "republish"\) && !titreRecevable\(j\.title\)\)/.test(gpj));
  assert.ok(/if \(j\.action === "republish"\) pfG\[CLE_TITRE_SAISI\] = r\.titre;/.test(gpj), "republication : titre_saisi porte le titre de la fiche (recréation)");
});

console.log(`titres-recevables-selftest : ${n} cas verts`);
