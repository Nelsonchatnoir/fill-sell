// Autotest du RÉFÉRENTIEL DES FORMATS DE COLIS Vinted (06/10, patrick giry) —
// `npm run selftest:vinted-colis-referentiel`
//
// Cas réel : 06/10 entre 18:29 et 18:44, quatre jobs Vinted du poste de
// patrick giry (0.6.100) SANS section « Format du colis » (colis_bilan.grille
// vide) sur des rayons ordinaires (1810, 1820, 4666) — publication partie sans
// format (400 `package_size`) et trois républications en pause avant retrait.
// Relevé dans le code du formulaire (session de Nico) : la grille vient d'UN
// appel, GET api.vinted.fr/shipping-estimation/external/catalogs/{id}/package_sizes,
// jamais refait si sa réponse est une erreur.
//
// Ce que ce test garantit, sur le code LIVRÉ :
//   · la lecture du référentiel (forme réelle relevée le 06/10) et le verdict
//     « formulaire raté » / « rayon sans section » / « inconnu » ;
//   · une-passe : section absente → JAMAIS de retrait (référentiel ou non),
//     l'envoi direct n'est retenu que si le format FIGURE au référentiel ;
//   · publication : section absente + formats au référentiel → rien soumis,
//     essai rapproché, question au 3e constat (jamais un format deviné) ;
//   · le background replanifie (3 min, 10 min) sans tentative consommée ;
//   · le serveur ne promet plus « la nouvelle version » à un poste qui l'a ;
//   · les chemins à grille présente sont intacts (aucune lecture ajoutée).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classerEchec } from "../supabase/functions/_shared/pas-de-rouge.js";
import { BUILD_COLIS_DANS_ENVOI, posteAvecEnvoiColis } from "../supabase/functions/_shared/vinted-colis.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const vt = lire("chrome-extension/content-scripts/vinted.js");
const bg = lire("chrome-extension/background.js");

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

// Extrait une fonction de premier niveau du content script (jusqu'à la ligne « } »).
function fonction(nom) {
  const d = vt.indexOf(`function ${nom}(`);
  if (d < 0) throw new Error(`fonction ${nom} introuvable`);
  const f = vt.indexOf("\n}\n", d);
  return vt.slice(d, f + 2);
}
const pures = new Function(`${fonction("grilleDuReferentielColis")}\n${fonction("verdictSectionColisAbsente")}\n${fonction("resumeReferentielColis")}\n` +
  "return { grilleDuReferentielColis, verdictSectionColisAbsente, resumeReferentielColis };")();

console.log("\n1. LE RÉFÉRENTIEL (réponse réelle du 06/10, rayon 1810)");
const REPONSE_1810 = {
  package_sizes: [
    { id: 1, code: "SMALL", title: "Petit", standard: true, custom: false, type: "standard" },
    { id: 2, code: "MEDIUM", title: "Moyen", standard: true, custom: false, type: "standard" },
    { id: 3, code: "LARGE", title: "Grand", standard: true, custom: false, type: "standard" },
    { id: 8, code: "HEAVY_SMALL", title: "Volumineux et lourd", standard: true, custom: false, type: "heavy" },
  ],
  parcel_measurements: null,
  heavy_small_package_size_experiment_eligible: false,
};
const g = pures.grilleDuReferentielColis(REPONSE_1810);
ok(g.length === 4 && g[0].id === 1 && g[0].libelle === "Petit" && g[3].id === 8 && g[3].libelle === "Volumineux et lourd", "grille lue : id + libellé affiché (title)");
ok(pures.grilleDuReferentielColis(null).length === 0 && pures.grilleDuReferentielColis({ package_sizes: [{ id: "x" }, { id: 4 }] }).length === 0, "réponse vide ou malformée → grille vide");
ok(pures.verdictSectionColisAbsente({ http: 200, grille: g }) === "formulaire_rate", "formats au référentiel → formulaire raté");
ok(pures.verdictSectionColisAbsente({ http: 200, grille: [] }) === "rayon_sans_section", "référentiel sans format → rayon sans section");
ok(["inconnu"].includes(pures.verdictSectionColisAbsente({ http: 403, grille: [] })) && pures.verdictSectionColisAbsente({ http: null, grille: [] }) === "inconnu" && pures.verdictSectionColisAbsente(null) === "inconnu", "403 / réseau / rien → inconnu (chemin d'avant)");
const r = pures.resumeReferentielColis({ http: 200, grille: g, jeton_renouvele: true, catalogue: 1810 });
ok(r.http === 200 && r.catalogue === 1810 && r.grille.join(",") === "1|Petit,2|Moyen,3|Grand,8|Volumineux et lourd" && r.jeton_renouvele === true, "résumé pour colis_bilan.referentiel");

console.log("\n2. LE CONTENT SCRIPT");
// (0.6.106) L'adresse suit le domaine de la PAGE (vinted.it chez un vendeur
// étranger) : les trois constantes sont rejouées telles qu'écrites, sur une
// page vinted.fr — l'adresse doit rester EXACTEMENT celle du formulaire.
{
  const bloc = ["VINTED_ORIGINE_PAGE", "VINTED_DOMAINE_PAGE", "REFERENTIEL_COLIS_VINTED"].map((n) => {
    const d = vt.indexOf(`const ${n} =`);
    if (d < 0) return "";
    return vt.slice(d, vt.indexOf(";\n", d) + 1);
  }).join("\n");
  const rejoue = (origine) => {
    const u = new URL(origine);
    return new Function("location", `${bloc}\nreturn REFERENTIEL_COLIS_VINTED;`)({ protocol: u.protocol, hostname: u.hostname, origin: u.origin });
  };
  let fr = null, it = null;
  try { fr = rejoue("https://www.vinted.fr"); it = rejoue("https://www.vinted.it"); } catch (e) { fr = String(e?.message ?? e); }
  ok(fr === "https://api.vinted.fr/shipping-estimation/external/catalogs/", "l'appel même du formulaire (api.vinted.fr/shipping-estimation) sur une page vinted.fr", String(fr));
  ok(it === "https://api.vinted.it/shipping-estimation/external/catalogs/", "le domaine de la page sur vinted.it (vendeur étranger)", String(it));
}
const lect = fonction("lireReferentielColisVinted");
ok(/r\.status === 401 && \(await renouvelerJetonVinted\(\)\)/.test(lect) && (lect.match(/await lire\(\)/g) ?? []).length === 2, "401 → jeton renouvelé comme la page, rejoué UNE fois");
ok(/catch \(e\)/.test(lect) && /return \{ http: null/.test(lect), "ne jette jamais");
ok(/const referentielAvantRayon = await jetonApiVintedFrais\(job\)\.catch\(\(\) => null\);\n  try \{\n    categorieSuggestionRetenue = null;/.test(vt), "jeton vérifié AVANT le choix du rayon, jamais bloquant");
// Une-passe, format connu, section absente.
const dUP = vt.indexOf("if (onePass?.item_id && colisVoulu && colisSectionAbsente) {");
const fUP = vt.indexOf("// ── UNE-PASSE : suppression de l'annonce d'origine JUSTE avant le clic", dUP);
const blocUP = vt.slice(dUP, fUP);
ok(dUP > 0 && fUP > dUP, "bloc une-passe trouvé");
ok(/if \(colisSectionAbsente\) \{/.test(blocUP) && /lireReferentielColisVinted\(await rayonColisDuJob\(job\)\)/.test(blocUP), "section absente → référentiel lu avant toute décision");
ok(/if \(!envoiDirectProuve \|\| \(verdictR !== "inconnu" && !formatAuReferentiel\)\) \{\s*return \{\s*success: false,\s*colisNonPropose: true,/.test(blocUP), "envoi non prouvé, ou format absent du référentiel → RIEN retiré (colisNonPropose)");
ok(/colisFormulaireRate: true/.test(blocUP), "formulaire raté nommé pour l'essai rapproché");
// Une-passe, format inconnu, aucun format offert.
const dQ = vt.indexOf("if (onePass?.item_id && (!colisVoulu || colisFormatNonOffert)) {");
const blocQ = vt.slice(dQ, vt.indexOf("if (onePass?.item_id && colisVoulu && colisSectionAbsente) {", dQ));
ok(/colisNonPropose: true,/.test(blocQ) && /verdictQ === "formulaire_rate" \? \{ colisFormulaireRate: true \}/.test(blocQ), "format inconnu + section absente → rien retiré, formulaire raté nommé");
// Publication neuve au dépôt.
const dP = vt.indexOf("} else if (publicationNeuve) {");
const blocP = vt.slice(dP, vt.indexOf("if (cocheDepot) armerColisPourPost(cocheDepot.id);", dP));
ok(dP > 0 && /if \(grilleDepot\.length\) \{[\s\S]*\} else if \(publicationNeuve\) \{/.test(vt.slice(dP - 6000, dP + 40)), "branche ajoutée SEULEMENT quand la grille du formulaire est vide");
ok(/if \(constats < 3\) \{\s*return \{\s*success: false,\s*colisFormulaireRate: true,/.test(blocP), "formulaire raté (constat 1-2) → rien soumis");
ok(/questionFormatColis\(refD\.grille, colisVoulu \? colisChoix : null, warnings\)/.test(blocP), "3e constat sans choix au référentiel → QUESTION sur les formats du référentiel");
ok(/choixAuReferentiel = idPourPostD != null && refD\.grille\.some\(\(g\) => g\.id === idPourPostD\)/.test(blocP), "un choix n'est envoyé directement que s'il figure au référentiel");
ok(!/selectPackageSize|simulateFullClick/.test(blocP), "le référentiel ne coche jamais rien dans le formulaire");

console.log("\n3. LE BACKGROUND");
const dB = bg.indexOf('if (job.platform === "vinted" && result?.colisFormulaireRate && !result?.success && !result?.needsUser) {');
const blocB = bg.slice(dB, bg.indexOf("if (result?.dryRun) {", dB));
ok(dB > 0 && /const delaiR = nR <= 1 \? 3 : 10;/.test(blocB) && /updateJobStatus\(accessToken, job\.id, "pending"/.test(blocB), "publication : pending, 3 min puis 10 min");
ok(!/rearmBounded|needsUserAttempts/.test(blocB), "aucune tentative consommée");
ok(!/package_size|Vinted exige le format du colis/.test(blocB), "texte hors de la reconnaissance serveur du refus 400");
const dRP = bg.indexOf("const rate = result?.colisFormulaireRate === true;");
ok(dRP > 0 && /\? \(nRate === 1 \? 3 : 10\)\s*: \(n <= 1 \? 60 : n === 2 \? 180 : 360\);/.test(bg.slice(dRP, dRP + 600)), "républication : 3 min, 10 min, puis le barème d'avant (1 h, 3 h, 6 h)");

console.log("\n4. LE SERVEUR (pas-de-rouge)");
const T_SHIRT = "Vinted a refusé la publication : Sélectionne le format de ton colis — l'annonce n'a PAS été créée. Vinted exige le format du colis, que son formulaire ne propose pas pour ce rayon. [sonde réseau : /api/v2/item_upload/items → HTTP 400 · prix ENVOYÉ = 75 · réponse : {\"code\":99,\"message\":\"Erreurs trouvées\",\"message_code\":\"validation_error\",\"errors\":[{\"field\":\"package_size\",\"value\":\"Sélectionne le format de ton colis\"}],\"payload\":{}}]";
const BUILD_PATRICK = "2026-10-06T06:11:17Z+2b883ef · v0.6.100";
const a = classerEchec({ platform: "vinted", action: "publish", brut: T_SHIRT, reecrit: T_SHIRT, essais: 0, pf: {}, build: BUILD_PATRICK });
ok(a.statut === "pending" && a.motif === "colis_non_affiche" && !a.pf?.build_min_requis, "poste 0.6.100 → reprise, motif vrai, aucun build exigé", JSON.stringify(a).slice(0, 240));
ok(!/nouvelle version|installée/i.test(a.message) && /n'a pas affiché les formats de colis/.test(a.message) && /rien à faire/.test(a.message), "message vrai : plus de « la nouvelle version l'envoie directement »");
const b = classerEchec({ platform: "vinted", action: "publish", brut: T_SHIRT, reecrit: T_SHIRT, essais: 0, pf: {}, build: "2026-09-28T10:00:00Z+abc · v0.6.80" });
ok(b.motif === "colis_non_propose" && b.pf?.build_min_requis === BUILD_COLIS_DANS_ENVOI && /nouvelle version/.test(b.message), "poste ANCIEN → inchangé (attend la mise à jour)");
const c = classerEchec({ platform: "vinted", action: "publish", brut: T_SHIRT, reecrit: T_SHIRT, essais: 0, pf: {} });
ok(c.motif === "colis_non_propose", "build inconnu (anciens appelants) → inchangé");
ok(posteAvecEnvoiColis(BUILD_COLIS_DANS_ENVOI) && !posteAvecEnvoiColis("") && !posteAvecEnvoiColis("v0.6.100"), "seul le préfixe horodaté fait foi");

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ référentiel des formats de colis Vinted : tout est vert");
process.exit(ko ? 1 : 0);
