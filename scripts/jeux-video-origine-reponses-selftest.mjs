// ═══════════════════════════════════════════════════════════════════════════
// JEUX VIDÉO : LE CLASSEMENT CONNU N'EST PLUS REDEMANDÉ, UN JEU N'EST PLUS UNE CONSOLE, UNE RÉPONSE EST RETENUE
// — SELFTEST « VERROU » (16/11/2026, lot du matin, point 2 — gjehly)
// ═══════════════════════════════════════════════════════════════════════════
// Le 15/11 vers 22:46, pour des jeux importés de son eBay, l'app a demandé à gjehly l'« Âge » Beebs, la « Plateforme »
// Vinted et le « Modèle » eBay. Mesuré :
//   · « WB Games Mortal Kombat PS3 » : son annonce eBay porte « Classification : M (Mature 17+) »
//     (annonces_plateforme.donnees_index.caracteristiques) — jamais lu : Vinted a reçu « Non précisé » (valeur
//     probable), rangé ensuite sur la fiche comme une réponse « manuel », et l'« Âge » Beebs a été demandé ;
//   · « D PlayStation PS1 » (« Je vends le jeu D pour PlayStation 1 … Type de produit : Jeu vidéo ») : un titre « nu »
//     → famille CONSOLE → eBay 139971 « Consoles », « Modèle » demandé ;
//   · « SEGA Super Battletank Sega Game Gear » : Game Gear absente de la liste Vinted (la question reste, à raison).
// Et une réponse donnée au lot (« Âge », « Plateforme »…) n'était retenue que sur la tâche, jamais sur l'article.
// Rouge sur le code d'avant, vert après.
import { readFileSync } from "node:fs";
import * as jv from "../src/utils/jeuxVideo.js";
import { resoudrePublication } from "../src/utils/resolutionPublication.js";

let echecs = 0;
const ok = (cond, quoi, detail = "") => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${quoi}${cond || !detail ? "" : `   ← ${detail}`}`);
  if (!cond) echecs++;
};
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

console.log("\n1. Le classement écrit sur l'annonce d'origine (valeurs réelles du parc, eBay « Classification »)");
const co = jv.classementDeLAnnonceDOrigine ?? (() => null);
ok(co({ Classification: "M (Mature 17+)" }) === "M – 17 ans et plus", "« M (Mature 17+) » → « M – 17 ans et plus »", String(co({ Classification: "M (Mature 17+)" })));
ok(co({ Classification: "ESRB E (Everyone)" }) === "E – Tous publics", "« ESRB E (Everyone) » → « E – Tous publics »");
ok(co({ Classification: "PEGI 12" }) === "PEGI 12" && co({ Classification: "PEGI18" }) === "PEGI 18", "PEGI écrit → la valeur exacte");
ok(co({ Classification: "USK 6" }) === "USK 6", "USK écrit → la valeur exacte");
ok(co({ Classification: "T (Teen)" }) === "T – 13 ans et plus", "« T (Teen) » → « T – 13 ans et plus »");
for (const v of ["CERO A", "Tous publics", "Pour tous publics", "Interdit aux moins de 12 ans", "ELSPA 3-10", "Non applicable", "M"]) {
  ok(co({ Classification: v }) === null, `« ${v} » : rien (aucun système nommé au caractère près)`);
}
ok(co(null) === null && co({}) === null, "sans caractéristiques : rien");

console.log("\n2. Une valeur neutre ne cache plus un classement connu");
const ci = jv.classementInformatif ?? ((...a) => a.find(Boolean) ?? null);
ok(ci("Non précisé", "Non précisé", null, "M – 17 ans et plus") === "M – 17 ans et plus", "« Non précisé » (copie, fiche) puis M de l'origine → M");
ok(ci("PEGI 12", "M – 17 ans et plus") === "PEGI 12", "la réponse de la personne passe toujours devant");
ok(ci("Non précisé", null) === "Non précisé", "rien d'autre : « Non précisé » reste (comportement d'avant)");
ok(jv.ageBeebsDuClassement(ci("Non précisé", "", "Non précisé", co({ Classification: "M (Mature 17+)" }))) === "16 ans et +",
  "Mortal Kombat : l'« Âge » Beebs se déduit (« 16 ans et + »), plus de question");
ok(jv.ageBeebsDuClassement(ci("Non précisé", co({ Classification: "ESRB E (Everyone)" }))) === null,
  "« E – Tous publics » : la question reste (règle D1 du 26/10, aucun âge minimum)");
ok(typeof jv.classementNeutre === "function" && jv.classementNeutre("Non précisé") && !jv.classementNeutre("PEGI 3"), "classementNeutre : « Non précisé » oui, « PEGI 3 » non");

console.log("\n3. La résolution pose le classement connu sur Vinted, par-dessus « Non précisé » (jamais par-dessus une vraie valeur)");
{
  const fauxSupabase = {
    functions: { invoke: async () => ({ data: null, error: { message: "hors ligne (selftest)" } }) },
    from: () => { const q = { select: () => q, eq: () => q, in: () => q, limit: () => q, order: () => q, maybeSingle: async () => ({ data: null }), then: (r) => r({ data: [] }) }; return q; },
  };
  const outils = {
    platformFieldsConfig: {}, isConditionKey: () => false, defaultConditionFor: () => null, GENERIC_ASPECTS_PF_KEY: { vinted: "vintedAspects" },
    normAspectVal: (s) => s, resolveArticleIcon: () => "🎮", resolveArticleIconDetail: () => ({ icon: "🎮" }), OPLA_ETAT_PAR_LIBELLE: {},
  };
  const TITRE = "WB Games Mortal Kombat PS3 NTSC-U/C 2011 Combat Manuel inclus BLUS 30522";
  const resoudre = (classementCopie, carac) => resoudrePublication({
    plateformes: ["vinted"], selected: new Set(["vinted"]),
    edited: { vinted: { title: TITRE, description: TITRE, platform_fields: { vintedAspects: classementCopie ? { video_game_ratings: classementCopie } : {} } } },
    initialListing: { titre: TITRE, description: TITRE, attributs: { classement_age: { v: "Non précisé", source: "manuel" } } },
    sharedFields: {}, sharedOverrides: {}, activeAiIcon: "🎮", activeAiObjet: "jeu vidéo", origineCat: null,
    lang: "fr", supabase: fauxSupabase, ebayVoieApi: false, outils, origineCaracteristiques: carac,
  });
  const logs = console.log, warns = console.warn;
  console.log = () => {}; console.warn = () => {};
  let r1, r2, r3;
  try {
    r1 = await resoudre("Non précisé", { Classification: "M (Mature 17+)" });
    r2 = await resoudre("PEGI 18", { Classification: "M (Mature 17+)" });
    r3 = await resoudre("Non précisé", null);
  } finally { console.log = logs; console.warn = warns; }
  const cl = (r) => r?.pfParPlateforme?.vinted?.vintedAspects?.video_game_ratings ?? null;
  ok(cl(r1) === "M – 17 ans et plus", "copie « Non précisé », fiche « Non précisé », origine M → Vinted « M – 17 ans et plus »", String(cl(r1)));
  ok(cl(r2) === "PEGI 18", "une vraie valeur sur la copie n'est jamais remplacée", String(cl(r2)));
  ok(cl(r3) === "Non précisé", "rien de connu : « Non précisé » reste", String(cl(r3)));
}

console.log("\n4. Un jeu que sa description déclare n'est plus une console (« D PlayStation PS1 »)");
{
  const DESC = "Je vends le jeu D pour PlayStation 1, qui plaira aux amateurs de jeux d'aventure et de mystère. - Titre : D - Type de produit : Jeu vidéo - Plateforme : PlayStation 1 (PS1) - Marque : Sony";
  const f = jv.familleJeuVideo("D PlayStation PS1", DESC);
  ok(f?.famille === "jeu", "famille « jeu » (eBay 139973 « Jeux », plus de « Modèle » de console)", JSON.stringify(f));
  ok(f?.machine?.ebay === "Sony PlayStation 1" && f?.machine?.vinted === "PlayStation 1", "machine PS1 : Plateforme posée sur eBay et Vinted");
  ok(jv.familleJeuVideo("PlayStation 3 noire", "Je vends ma console PS3, livrée avec le jeu Fifa.")?.famille === "console", "« je vends ma console » : console (machine nue d'avant)");
  ok(jv.familleJeuVideo("Wii", "")?.famille === "console", "« Wii » sans description : console (inchangé)");
  ok(jv.familleJeuVideo("Sony playstation 2 jap scph 30000 en boite", "Console en très bon état")?.famille === "console", "« … scph 30000 en boite » : console (inchangé)");
}

console.log("\n5. Game Gear et Master System : eBay les a, Vinted non (la question reste chez Vinted)");
{
  const m = jv.machineDuTexte("SEGA Super Battletank Sega Game Gear NTSC-U/C 1992");
  ok(m?.ebay === "Sega Game Gear" && m?.vinted === null && m?.beebs === "Retrogaming", "Game Gear : eBay « Sega Game Gear », Vinted rien, Beebs Retrogaming", JSON.stringify(m));
  ok(jv.machineDuTexte("Alex Kidd Sega Master System")?.ebay === "Sega Master System", "Master System : eBay « Sega Master System »");
  ok(jv.machineDuTexte("Sonic Sega Mega Drive")?.cle === "megadrive", "Mega Drive : inchangé");
}

console.log("\n6. Une réponse donnée une fois est retenue sur l'article");
let ra = null;
try { ra = await import("../src/publication/moteur/reponsesArticle.js"); }
catch (e) { ok(false, "le module publication/moteur/reponsesArticle.js existe", String(e?.message ?? e).slice(0, 120)); }
if (ra) {
  const AGES = ["0-6 mois", "8 ans - 12 ans", "12 ans - 16 ans", "16 ans et +"];
  const reponses = {
    "beebs|Âge": { plateforme: "beebs", champ: "Âge", valeur: "16 ans et +", liste: AGES },
    "vinted|video_game_platform": { plateforme: "vinted", champ: "video_game_platform", valeur: "PlayStation 3", liste: ["PlayStation 3", "Xbox 360"] },
    "ebay|Modèle": { plateforme: "ebay", champ: "Modèle", valeur: "Sony PlayStation 1", liste: ["Sony PlayStation 1"] },
    "vinted|brand": { plateforme: "vinted", champ: "brand", valeur: "Sony", liste: ["Sony"] },
    "beebs|Console": { plateforme: "beebs", champ: "Console", valeur: "PS3", liste: ["PS3"] },
  };
  const finales = { "beebs|Âge": "16 ans et +", "vinted|video_game_platform": "PlayStation 3", "ebay|Modèle": "Sony PlayStation 1", "vinted|brand": "Sony", "beebs|Console": "PS4" };
  const ecrit = ra.reponsesArticleAEcrire({ attributs: {}, reponses, envoyees: ["beebs", "vinted"], valeurFinale: (p, c) => finales[`${p}|${c}`] });
  ok(ecrit?.["beebs|Âge"] === "16 ans et +" && ecrit?.["vinted|video_game_platform"] === "PlayStation 3", "Âge Beebs et Plateforme Vinted rangés sur la fiche", JSON.stringify(ecrit));
  ok(!("ebay|Modèle" in (ecrit ?? {})), "plateforme non envoyée : rien de rangé");
  ok(!("vinted|brand" in (ecrit ?? {})), "la marque a SA place sur la fiche : jamais ici");
  ok(!("beebs|Console" in (ecrit ?? {})), "une réponse qui n'est pas partie telle quelle : jamais rangée");
  ok(ra.reponsesArticleAEcrire({ attributs: { reponses_plateformes: { v: ecrit, source: "manuel" } }, reponses, envoyees: ["beebs", "vinted"], valeurFinale: (p, c) => finales[`${p}|${c}`] }) === null,
    "déjà rangées à l'identique : aucune écriture (jamais une ligne inchangée réécrite)");
  const attrs = { reponses_plateformes: { v: ecrit, source: "manuel" } };
  ok(ra.reponseDeLArticle(attrs, "beebs", "Âge", AGES) === "16 ans et +", "la fois suivante : l'Âge Beebs est repris, sans question");
  ok(ra.reponseDeLArticle(attrs, "beebs", "Âge", ["0-6 mois", "6-12 mois"]) === null, "sortie de la liste du rayon : la question revient");
  ok(ra.reponseDeLArticle({}, "beebs", "Âge", AGES) === null, "rien de répondu : rien");
}

console.log("\n7. Le câblage (lecture du code)");
{
  const lps = src("src/components/ListingPreviewScreen.jsx");
  const res = src("src/utils/resolutionPublication.js");
  ok(/classementDeLAnnonceDOrigine\(origineCaracteristiques\)/.test(res), "la résolution lit le classement de l'annonce d'origine");
  ok(/classementNeutre\(surLaCopie\) && !classementNeutre\(classement\)/.test(res), "et remplace un « Non précisé » de la copie par un classement connu");
  ok((lps.match(/origineCaracteristiques: caracteristiquesOrigine,/g) ?? []).length === 2, "l'écran donne les caractéristiques d'origine au pré-calcul ET au clic");
  ok(/donnees_index\?\.caracteristiques/.test(lps), "l'écran lit les caractéristiques de l'annonce d'origine");
  ok(/classementFiche: String\(classementInformatif\(/.test(lps), "l'Âge Beebs (règle D1) lit le premier classement qui dit quelque chose");
  ok(/!classementNeutre\(classementUtilisateur\) && classementUtilisateur !== classementFiche/.test(lps), "« Non précisé » n'est plus rangé sur la fiche comme une réponse");
  ok(/reponsesArticleRef\.current\[k\] = \{/.test(lps), "chaque réponse de la personne est notée");
  ok((lps.match(/reponseDeLArticle\(attributsBase \?\? initialListing\?\.attributs \?\? null/g) ?? []).length === 2, "la réponse de l'article est relue pour eBay ET pour Vinted / Leboncoin / Beebs");
  ok(/\[CLE_REPONSES_ARTICLE\]: \{ v: aRanger, source: "manuel"/.test(lps), "elle est rangée sur la fiche au clic Publier");
}

console.log(echecs ? `\n✗ ${echecs} échec(s)` : "\n✓ tout est vert");
if (echecs) process.exit(1);
