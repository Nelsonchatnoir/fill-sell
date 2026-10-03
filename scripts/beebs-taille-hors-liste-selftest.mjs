// Autotest — ceinture Beebs de nivake03 (03/10, point 11) —
// `npm run selftest:beebs-taille-hors-liste`
//   · le message dit la vérité : « L » n'est pas dans la grille Beebs (mm) ;
//   · il dit que l'annonce est déjà retirée quand c'est le cas ;
//   · la regex de l'extension qui devait le corriger s'applique enfin ;
//   · aucun retrait Beebs n'est servi à un poste qui devinerait la taille (< 0.6.83).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const { humanizeJobError, texteBeebsValeurHorsListe } = await import(pathToFileURL(join(ROOT, "src/utils/shared.js")).href);
const { phraseRetenueServeur, RETENUE_EXTENSION_A_JOUR } = await import(pathToFileURL(join(ROOT, "src/utils/retenueServeur.js")).href);
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

// Forme RELEVÉE en base le 03/10 (job 8d487ebb, needs_user, étape 'deleted').
const ERREUR = "Beebs exige des champs encore vides pour cette catégorie : Taille. « Taille » : la fiche porte « L » mais la valeur n'a pas pu être posée sur la page — panne de remplissage, PAS une donnée manquante (relancer, ou attendre le correctif). Compléter ces champs dans l'app (copie Beebs), puis relancer la publication. Observabilité: catégorie via FIBER (feuille \"Ceintures (homme)\") ; clé du champ à trancher: Taille.";
const GRILLE = ["70 mm", "75 mm", "80 mm", "85 mm", "90 mm", "95 mm", "100 mm", "105 mm", "110 mm", "115 mm", "120 mm", "125 mm", "Ajustable"];
const job = { platform: "beebs", action: "republish", status: "needs_user", error: ERREUR,
  platform_fields: { republish_step: "deleted", needsUserField: { field_key: "Taille", field_label: "Taille", allowed_values: GRILLE, input_type: "dropdown" } } };

console.log("\n1. LE MESSAGE VRAI (tous postes, même les anciens)");
const m = humanizeJobError(job, "fr");
ok(/Beebs ne propose pas « L » pour « Taille »/.test(m), "« L » n'est pas proposé par Beebs : dit tel quel", m);
ok(!/panne|relancer|correctif|Observabilit/i.test(m), "plus de « panne de remplissage », ni « relancer », ni annexe technique");
ok(/retirée pour être republiée/.test(m) && /dès ton choix/.test(m), "l'annonce déjà retirée est dite, et ce qui la remet en ligne");
ok(/✋ Compléter/.test(m), "le geste est nommé");
const pub = texteBeebsValeurHorsListe(ERREUR, { ...job, action: "publish", platform_fields: { needsUserField: job.platform_fields.needsUserField } }, false);
ok(/la publication repart dès ton choix/.test(pub) && !/retirée/.test(pub), "publication : pas de « retirée » inventé");
ok(texteBeebsValeurHorsListe(ERREUR.replace("« L »", "« Ajustable »"), job, false) === null, "valeur VRAIMENT dans la liste : c'est bien une panne, l'ancien circuit garde la main");

console.log("\n2. LA REGEX DE L'EXTENSION S'APPLIQUE ENFIN (parenthèses échappées)");
const bj = lire("chrome-extension/content-scripts/beebs.js");
const i = bj.indexOf("const detailVidesFinal = horsListe");
const bloc = bj.slice(i, i + 2000);
// La PREMIÈRE ligne-regex du bloc est celle de horsListe (la seconde, celle des
// demi-pointures, était déjà échappée).
const ligneRegex = bloc.split("\n").map((l) => l.trim()).find((l) => l.startsWith("/« [^»]+ » : la fiche porte"));
const re = new RegExp(ligneRegex.slice(1, ligneRegex.lastIndexOf("/,")));
const detailReel = "« Taille » : la fiche porte « L » mais la valeur n'a pas pu être posée sur la page — panne de remplissage, PAS une donnée manquante (relancer, ou attendre le correctif)";
ok(re.test(detailReel), "la regex de horsListe trouve le texte réel (elle ne le trouvait jamais)");

console.log("\n3. AUCUN RETRAIT BEEBS PAR UN POSTE QUI DEVINE UNE TAILLE");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(/const posteSansIaTaille = buildMsDe\(buildDuPoll\) >= buildMsDe\(BUILD_BEEBS_ADRESSE_STRICTE\);/.test(gpj)
  && /poserRetenueServeur\(\(j\.platform_fields \?\? \{\}\) as Record<string, unknown>, RETENUE_EXTENSION_A_JOUR/.test(gpj)
  && /leverRetenueServeur\(pfJ, maintenantIso, `poste \$\{buildDuPoll\.slice\(0, 40\)\}`\)/.test(gpj),
  "republication Beebs avant retrait : retenue (nommée) pour un poste < 0.6.83, levée dès un poste à jour");
const ph = phraseRetenueServeur(true, { plateforme: "Beebs", motif: RETENUE_EXTENSION_A_JOUR });
ok(/mise à jour de l'extension/.test(ph.titre) && /intacte sur Beebs/.test(ph.detail) && /ferme Chrome complètement puis rouvre-le/.test(ph.detail), "la carte dit l'attente, la plateforme, le geste");
ok(/intacte sur Beebs/.test(phraseRetenueServeur(true, { plateforme: "Beebs" }).detail), "les autres retenues nomment aussi la bonne plateforme (plus « Vinted » partout)");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ ceinture Beebs : message vrai, et plus de retrait par un poste qui devine");
