// ═══════════════════════════════════════════════════════════════════════════
// LES SIX FAIBLESSES DU MOTEUR COMMUN SIGNALÉES PAR LE RATTACHEMENT DEPOP
// (docs/plateformes/depop/RATTACHEMENT.md § 5) — corrigées à la racine le 09/10
//   node scripts/moteur-faiblesses-depop-selftest.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Ce test ÉCHOUE sur le code d'avant (vérifié dans un worktree de deb93e6) et
// passe après. Il ne dit rien des cinq autres plateformes : leurs sorties sont
// prouvées INCHANGÉES par scripts/moteur-depop-rejeu.mjs (valeurs réelles de
// la prod) et par les selftests existants.
//   1. « EUR 38 » ≡ « EU 38 » (pointures adultes Depop) ;
//   2. « Comme neuf » : UNE lecture (très bon état), dans tierEtat comme dans
//      etatAffirmeParLeTexte ;
//   3. catégorie Depop : par IDENTIFIANT seulement, jamais par libellé ;
//   4. une plateforme inconnue sans catégorie n'en a pas ;
//   5. (liste des plateformes : scripts/depop-partout-selftest.mjs) ;
//   6. la famille de chaque feuille Depop est déclarée.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let echecs = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) echecs += 1; };

const tailles = await import("../supabase/functions/_shared/tailles.js");
const etats = await import("../supabase/functions/_shared/etat-plateformes.js");
const parMot = await import("../src/utils/categorieParMot.js");
const resolution = await import("../src/utils/resolutionPublication.js");
const regles = await import("../src/publication/moteur/regles.js");
const famille = await import("../src/utils/familleCategorie.js");

console.log("\n[1] « EUR » = « EU » (traduction, jamais conversion)");
const GRILLE_DEPOP_48 = ["EUR 34", "EUR 35", "EUR 36", "EUR 37", "EUR 38", "EUR 39", "EUR 40", "EUR 41", "EUR 42", "EUR 43", "EUR 44", "EUR 45", "EUR 46", "Other"];
ok(tailles.tailleDansGrille("EU 38", GRILLE_DEPOP_48)?.valeur === "EUR 38", "« EU 38 » (convention de l'app) → « EUR 38 »");
ok(tailles.tailleDansGrille("EU 42", GRILLE_DEPOP_48)?.valeur === "EUR 42", "« EU 42 » → « EUR 42 »");
ok(tailles.tailleDansGrille("42", GRILLE_DEPOP_48)?.valeur === "EUR 42", "« 42 » nu → « EUR 42 » (dernier recours : la grille n'écrit que l'EU)");
ok(tailles.tailleDansGrille("38,5", GRILLE_DEPOP_48) === null, "« 38,5 » refusé : jamais arrondi");
ok(tailles.tailleDansGrille("EU 38.5", GRILLE_DEPOP_48) === null, "« EU 38.5 » refusé : jamais arrondi");
ok(tailles.tailleDansGrille("FR 42", GRILLE_DEPOP_48) === null, "« FR 42 » refusé : le pays se garde");
ok(tailles.tailleDansGrille("UK 8", GRILLE_DEPOP_48) === null, "« UK 8 » refusé : jamais converti");
ok(tailles.memeTaille("EUR 38", "EU 38") && tailles.memeTaille("38 EUR", "EU 38"), "« EUR 38 » ≡ « EU 38 » ≡ « 38 EUR »");
ok(!tailles.memeTaille("EUR 38", "38") && !tailles.memeTaille("EUR 38", "FR 38"), "« EUR 38 » ≢ « 38 », ≢ « FR 38 »");

console.log("\n[2] « Comme neuf » : une seule lecture, jamais embellie");
ok(etats.tierEtat("Comme neuf") === "tres_bon", "tierEtat(« Comme neuf ») = très bon état (et non « neuf sans étiquette »)");
ok(etats.tierEtat("Comme neuf: Objet semblant avoir été retiré de son film plastique récemment.") === "tres_bon", "libellé eBay complet « Comme neuf: … » = très bon état");
ok(etats.etatAffirmeParLeTexte("Article comme neuf") === "tres_bon", "le texte « comme neuf » = très bon état");
ok(etats.tierEtat("Comme neuf") === etats.etatAffirmeParLeTexte("comme neuf"), "les deux lectures disent la MÊME chose");
for (const p of ["vinted", "leboncoin", "ebay", "beebs", "opla"]) {
  const r = etats.etatPourPlateforme("Comme neuf", p);
  ok(r?.valeur === etats.ETAT_PAR_PLATEFORME.tres_bon[p] && r.meilleur === false, `${p} : « Comme neuf » → « ${r?.valeur} » (jamais au-dessus)`);
}
ok(etats.tierEtat("Neuf sans étiquette") === "neuf_sans" && etats.tierEtat("Neuf avec étiquette") === "neuf_etiquette"
  && etats.tierEtat("État neuf") === "neuf_sans" && etats.tierEtat("Très bon état") === "tres_bon", "les autres libellés : inchangés");
const srcEtat = readFileSync(join(ROOT, "supabase/functions/_shared/etat-plateformes.js"), "utf8");
ok((srcEtat.match(/comme\\s\+neuf/g) ?? []).length === 1 && /COMME_NEUF\.test\(s\)/.test(srcEtat) && /re: COMME_NEUF/.test(srcEtat),
  "la règle « comme neuf » est écrite UNE fois (COMME_NEUF), lue par tierEtat ET par le texte");

console.log("\n[3] Catégorie Depop : par identifiant seulement");
ok((await parMot.feuillesDe("depop")).length === 0, "aucun arbre de libellés Depop");
const r3 = await parMot.resoudreParMot("robe habillée", "depop", { genre: "Femme" });
ok(r3.chemin === null && r3.id === null && r3.certitude === null, "« robe habillée » ne résout RIEN chez Depop (jamais « Déguisement » par le libellé)");
ok((await parMot.candidatsParMot("t-shirt", "depop", { genre: "Homme" })).length === 0, "aucun candidat par le mot");
ok((await parMot.feuilleDepuisOrigine("depop", "Vestes")) === null, "aucune feuille d'origine par libellé (le relevé passe par l'identifiant)");

console.log("\n[4] Plateforme inconnue = sans catégorie");
ok(resolution.sansRayon("depop", {}) === true, "Depop sans chemin : sans rayon");
ok(resolution.sansRayon("depop", { depopCategoryPath: ["menswear", "tops"] }) === true, "Depop à deux identifiants sur trois : sans rayon");
ok(resolution.sansRayon("depop", { depopCategoryPath: ["menswear", "tops", "tshirts"] }) === false, "Depop aux trois identifiants : a un rayon");
ok(resolution.sansRayon("vestiaire", {}) === true && resolution.sansRayon("inconnue", { categoryPath: ["x"] }) === true, "une plateforme inconnue n'a PAS de rayon (plus de repli « opla »)");
ok(resolution.sansRayon("opla", {}) === false, "Opla : rayon posé par le serveur (exception nommée, inchangée)");
const rows = [
  { platform: "depop", platform_fields: {} },
  { platform: "inconnue", platform_fields: {} },
  { platform: "opla", platform_fields: {} },
  { platform: "depop", platform_fields: { depopCategoryPath: ["womenswear", "dresses", "dresses"] } },
];
ok(JSON.stringify(regles.plateformesSansChemin(rows)) === JSON.stringify(["depop", "inconnue"]), "plateformesSansChemin : Depop sans chemin et l'inconnue écartées ; Opla et Depop complète restent");

console.log("\n[6] Famille déclarée pour chaque feuille Depop");
const arbre = JSON.parse(readFileSync(join(ROOT, "docs/plateformes/depop/arbre.json"), "utf8"));
const { DEPOP_TYPE_VERS_INTERNE } = await import("../src/utils/depopCategories.js");
const parId = new Map(arbre.noeuds.map((n) => [n.id, n]));
const feuilles = arbre.noeuds.filter((n) => n.feuille && n.proposee_par_formulaire);
let sansFamille = 0, desaccord = 0;
for (const f of feuilles) {
  const groupe = parId.get(f.parent);
  const dep = groupe ? parId.get(groupe.parent) : null;
  const idSimple = (n) => String(n?.id ?? "").split("/").pop();
  const chemin = [idSimple(dep), idSimple(groupe), idSimple(f)];
  const fam = famille.familleDeChemin("depop", chemin);
  if (!fam) { sansFamille += 1; continue; }
  const attendu = DEPOP_TYPE_VERS_INTERNE[`${chemin[1]}/${chemin[2]}`]?.famille ?? null;
  if (attendu && attendu !== fam) desaccord += 1;
}
ok(feuilles.length === 322, `322 feuilles proposées par le formulaire (${feuilles.length})`);
ok(sansFamille === 0, `aucune feuille Depop sans famille (${sansFamille})`);
ok(desaccord === 0, `la famille du chemin = celle du rattachement (DEPOP_TYPE_VERS_INTERNE) partout (${desaccord} écart)`);
ok(famille.familleDeChemin("depop", ["everything-else", "art", "collectibles"]) === "loisirs"
  && famille.familleDeChemin("depop", ["everything-else", "art", "paintings"]) === "maison", "« art » lu au type");
ok(!famille.plausibiliteDuChemin("depop", ["everything-else", "tech-accessories", "phone-cases"], "mode").ok, "le garde-fou mord : une coque de téléphone n'est pas plausible pour un objet de mode");
ok(famille.familleDeChemin("depop", []) === null && famille.familleDeChemin("depop", ["menswear", "inconnu", "x"]) === null, "chemin vide ou groupe inconnu : null (jamais un défaut)");

console.log(echecs ? `\n❌ ${echecs} échec(s)` : "\n✅ faiblesses du moteur : corrigées");
process.exit(echecs ? 1 : 0);
