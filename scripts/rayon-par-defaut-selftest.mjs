// ═══════════════════════════════════════════════════════════════════════════
// LE RAYON PAR DÉFAUT NE PART PAS — SELFTEST (2026-09-24, Louis)
// ═══════════════════════════════════════════════════════════════════════════
// Deux rangements de yaourtière publiés à la même minute : 6a0f57a4 trouve
// « Maison & Jardin > Électroménager » par la descente d'arbre ; 8147f963
// part dans « Divers > Autres » — l'IA avait CONFIRMÉ le fourre-tout qu'on
// lui proposait —, avec 3 photos au lieu de 5. Et le stepper annonçait
// « Ton article est rangé en « Divers > Autres » » au-dessus d'un Type
// « Cuisine et cuisson » et d'un Produit « Yaourtière ».
//
// Ce qu'il garantit :
//   1. « Divers > Autres » est reconnu comme le fourre-tout Leboncoin ;
//   2. la vérification ne PROPOSE jamais le chemin par défaut à l'IA, et ne
//      le CONFIRME jamais — il descend l'arbre ;
//   3. sans mot-objet, la descente part quand même, sur le titre ;
//   4. une panne passagère se retente, puis le rayon par défaut ATTEND
//      (chemin retiré → la plateforme sort du lot avant le débit), le clic
//      suivant recalcule — jamais le fourre-tout ;
//   5. le bandeau « N photos gratuites » lit le rayon RÉSOLU, jamais le
//      chemin de l'icône, et se tait sur le rayon par défaut.
//
//   node --import ./scripts/loader-ext.mjs scripts/rayon-par-defaut-selftest.mjs
import { readFileSync } from "node:fs";
import { cheminFourreToutLbc, resolutionARetenter } from "../src/utils/resolutionPublication.js";
import { plateformesSansChemin } from "../src/publication/moteur/regles.js";

let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const resolution = src("src/utils/resolutionPublication.js");
const lps = src("src/components/ListingPreviewScreen.jsx");

console.log("1. Le fourre-tout Leboncoin");
ok(cheminFourreToutLbc(["Divers", "Autres"]), "« Divers > Autres » est le fourre-tout");
ok(!cheminFourreToutLbc(["Maison & Jardin", "Électroménager"]), "« Maison & Jardin > Électroménager » ne l'est pas");
ok(!cheminFourreToutLbc(["Divers"]) && !cheminFourreToutLbc(null), "un chemin partiel ou absent ne l'est pas");

console.log("2. La vérification ne propose ni ne confirme le rayon par défaut");
ok(/parDefaut: pf\.categorie_source === "defaut" \|\| cheminFourreToutLbc\(lbcPath\)/.test(resolution), "le chemin de l'icône par défaut est marqué parDefaut");
ok(/const liste = pose\.parDefaut\s*\?\s*voisines\.slice\(0, 20\)/.test(resolution), "candidates : les voisines seules, jamais le fourre-tout");
ok(/memeChemin\(cheminChoisi, pose\.chemin\) && !pose\.parDefaut\)/.test(resolution), "un « confirme » sur le rayon par défaut est refusé");
ok(/verdict: "incoherent",\s*\n\s*motif: verificationInjoignable \? "verification_injoignable"/.test(resolution), "rayon par défaut non remplacé → incohérent → descente d'arbre");

console.log("3. Sans mot-objet, la descente part sur le titre");
ok(/const objetDescente = motCategorie \|\| \(aSauver\.some\(\(r\) => posesParDefaut\.has\(r\.platform\)\) \? titreDescente : ""\)/.test(resolution), "objet de la descente = mot, sinon titre (rayon par défaut)");
ok(/if \(objetDescente && aSauver\.length\)/.test(resolution), "la descente ne dépend plus du seul mot-objet");

console.log("4. Une panne se retente, puis le rayon par défaut attend");
ok(/for \(let essai = 0; essai < 2; essai\+\+\)/.test(resolution), "resolve-categorie retenté une fois");
ok(/retenirRayonParDefaut\(r, pf, "resolution_injoignable", journal\)/.test(resolution) && /retenirRayonParDefaut\(r, pf, "confirmation_injoignable", journal\)/.test(resolution), "panne de descente ou de confirmation → retenu");
{
  const pf = { rayon_a_reessayer: { motif: "resolution_injoignable" } };
  ok(resolutionARetenter({ pfParPlateforme: { leboncoin: pf } }), "resolutionARetenter repère la panne");
  ok(plateformesSansChemin([{ platform: "leboncoin", platform_fields: pf }]).includes("leboncoin"), "chemin retiré → Leboncoin sort du lot avant le débit");
}
ok(/&& !resolutionARetenter\(prevol\.resolution\)/.test(lps), "le clic ne reprend jamais un pré-calcul en panne : il retente");
ok(/\?\s*"rayon_a_reessayer"\s*:\s*"sans_rayon"/.test(lps), "l'écran de suivi nomme l'attente (rayon_a_reessayer)");

console.log("5. Le bandeau photos lit le rayon résolu");
{
  const bloc = lps.slice(lps.indexOf("const lbcPhotoCap = useMemo"), lps.indexOf("const lbcPhotoCap = useMemo") + 900);
  ok(!/getLbcCategoryPath\(articleIcon\)/.test(bloc), "plus de chemin tiré de l'icône");
  ok(/rayonsParPf\?\.leboncoin/.test(bloc), "le rayon retenu pour CE dépôt");
  ok(/categorie_source === "defaut" \|\| cheminFourreToutLbc\(path\)\)\) return null/.test(bloc), "rayon par défaut → pas de bandeau (jamais une limite fausse)");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ rayon par défaut : tout passe");
process.exit(ko ? 1 : 0);
