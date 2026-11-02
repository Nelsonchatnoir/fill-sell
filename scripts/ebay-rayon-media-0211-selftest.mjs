// ═══════════════════════════════════════════════════════════════════════════
// (02/11, sebastien64310) « LIVRES ET MÉDIAS » : UN RAYON MÉDIA D'eBAY EST DANS LA FAMILLE — CONTRÔLE
// ═══════════════════════════════════════════════════════════════════════════
// Rejoue la garde famille livres de supabase/functions/ebay-api-worker/index.ts (code LIVRÉ, extrait du fichier) sur
// le cas réel : « cassette vhs léon (1994) - jean reno / natalie portman / gary oldman / gaumont », famille Lens
// livres_medias, support non-livre désarmé par « roman noir » (critique de presse de la description), app en
// « DVD, cinéma > Cassettes vidéo » (309), eBay sans aucun rayon Livres → « aucune catégorie sûre ».
//
//   node scripts/ebay-rayon-media-0211-selftest.mjs

import fs from "node:fs";
import { SUPPORT_NON_LIVRE_RE, estSupportNonLivre } from "../supabase/functions/_shared/support-non-livre.ts";

let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

const SRC = fs.readFileSync("supabase/functions/ebay-api-worker/index.ts", "utf8").replace(/\r\n/g, "\n");
const livres = SRC.match(/^const LIVRES_RE = (\/.*\/i);$/m)?.[1];
const medias = SRC.match(/^const MEDIAS_RE = (\/.*\/i);$/m)?.[1];
const corps = SRC.match(/function rayonLivresOuMedia\(racine: string, titre: string\): boolean \{\n([\s\S]*?)\n\}/)?.[1];
ok(Boolean(livres && medias && corps), "la garde est lue dans le code livré");
const rayonLivresOuMedia = new Function("SUPPORT_NON_LIVRE_RE", `const LIVRES_RE = ${livres}; const MEDIAS_RE = ${medias};
  return (racine, titre) => { ${corps} };`)(SUPPORT_NON_LIVRE_RE);

const titre = "cassette vhs léon (1994) - jean reno / natalie portman / gary oldman / gaumont";
const description = "\"...le film, concert d'images éblouissant, alterne roman noir et romance...\" (première)";

console.log("1. Le cas réel");
ok(estSupportNonLivre(titre, description) === false, "témoin : « roman noir » désarme le support (la famille reste livres_medias)");
ok(rayonLivresOuMedia("DVD, cinéma", titre) === true, "« DVD, cinéma > Cassettes vidéo » est dans la famille : la cassette part dans le rayon de l'app");

console.log("2. Les autres médias, et ce qui reste gardé");
ok(rayonLivresOuMedia("Musique, CD, vinyles", "Vinyle 33 tours Pink Floyd The Wall") === true, "un vinyle en « Musique, CD, vinyles »");
ok(rayonLivresOuMedia("Films, DVD", "Coffret DVD Harry Potter") === true, "un DVD en « Films, DVD »");
ok(rayonLivresOuMedia("Livres, BD, revues", "Le cinéma de Luc Besson") === true, "un livre reste au rayon Livres");
ok(rayonLivresOuMedia("DVD, cinéma", "Le cinéma de Luc Besson") === false, "un livre SANS support nommé au titre n'entre pas en « DVD, cinéma » (gardé comme avant)");
ok(rayonLivresOuMedia("Jouets et jeux", "Livre Shigeru Ban Taschen") === false, "le Shigeru Ban en « Jouets et jeux » reste refusé (cas du 23/09)");
ok(rayonLivresOuMedia("Jouets et jeux", "cassette vhs léon") === false, "une cassette hors des rayons médias reste refusée");

console.log("3. Branchée aux deux gardes (mapping de l'app, et suggestion n°1 sans mapping)");
ok((SRC.match(/famille === "livres_medias" && !rayonLivresOuMedia\(/g) ?? []).length === 2, "les deux gardes passent par rayonLivresOuMedia");
ok(!/famille === "livres_medias" && !LIVRES_RE\.test\(/.test(SRC), "plus aucune garde « Livres seulement »");

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ tout passe");
process.exit(ko ? 1 : 0);
