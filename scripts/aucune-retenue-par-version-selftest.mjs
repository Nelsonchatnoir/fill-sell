// ═══════════════════════════════════════════════════════════════════════════
// Selftest — AUCUNE TÂCHE N'EST REFUSÉE, RETENUE NI MISE EN PAUSE POUR LE BUILD DU POSTE (06/11, Nico)
//   npm run selftest:aucune-retenue-par-version
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico du 06/11 : la version minimum est ABANDONNÉE DÉFINITIVEMENT. EXTENSION_MIN_BUILD ne se pose
// jamais plus ; tout mécanisme qui bloque ou met en pause un job à cause d'une extension trop ancienne est supprimé
// (porte globale « sous le seuil », refus 409 au démarrage, filtre par job `build_min_requis`, retenues
// « extension_a_mettre_a_jour », pause `pauseAttente` / needs_user_source « build_min_requis »…). Garde-fou : une
// vieille extension continue de faire tout ce qu'elle savait déjà faire. Un bandeau qui INFORME reste permis.
// Ce selftest échoue si une retenue par build réapparaît :
//   · lecture du code des trois fonctions (porte, 409, filtre, retenues, pause) ;
//   · chaque comparaison du build du poll dans get-pending-jobs est sur une liste nommée (adaptations de capacité,
//     relances) — une comparaison NOUVELLE est rouge tant qu'elle n'est pas justifiée ici ;
//   · règles partagées rejouées sur un poste ancien (pause, recréation bloquée, ISBN, écran de l'app).
// Exception gardée, argumentée : posteApresDefaut (_shared/defaut-fillsell.js) — un job arrêté par une exception
// JavaScript de NOTRE code sur un build n'est pas rendu à CE build (il replanterait à l'identique toutes les 30 min,
// sans fin : update-job-status le remet en pending sans compteur) ; et les dépôts eBay d'un poste dont le build a
// prouvé ce défaut (retours non posés, même famille defaut_fillsell).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const ANCIEN = "2026-09-28T21:44:46Z+52b214b · v0.6.79";

console.log("\n1. get-pending-jobs : ni porte, ni filtre, ni retenue par build");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(!gpj.includes("posteExtensionCompatible(") && !gpj.includes("posteSousMinimum") && !gpj.includes("MESSAGE_MISE_A_JOUR_EXTENSION"),
  "plus de porte « poste sous le seuil » (file vide + « mets à jour »)");
ok(!gpj.includes("extension_update_required: true"), "jamais `extension_update_required` dans une réponse");
ok(!/build_min_requis \?\? ""\);\s*if \(!min\) return true;/.test(gpj) && !gpj.includes("buildMsDe(min)"),
  "plus de filtre par job `build_min_requis` (le champ n'est qu'une trace)");
ok(!gpj.includes("poserRetenueServeur((j.platform_fields ?? {}) as Record<string, unknown>, RETENUE_EXTENSION_A_JOUR")
  && !gpj.includes("poserRetenueServeur(pfJ, RETENUE_EXTENSION_A_JOUR") && !gpj.includes("poserRetenueServeur(pfJ, RETENUE_COLIS_ANCIEN_POSTE"),
  "plus aucune retenue « extension_a_mettre_a_jour » ni « colis, poste ancien » posée");
ok(!gpj.includes("BUILD_OPLA_REPUBLICATION_SUR_ANNONCE) || !buildDuPoll"), "plus de retenue Opla < 0.6.74");
ok(!gpj.includes("if (!preuvesRetraitsPoint1) {"), "plus de retenue « preuves du point 1 » (< 0.6.80) : seul le nettoyage du motif reste");
ok(!gpj.includes("buildMsDe(buildDuPoll) < buildMsDe(BUILD_COLIS_DANS_ENVOI)"), "plus de mise en attente « colis » d'un poste < 0.6.84");
ok(!gpj.includes("const posteAJourMarque") && !gpj.includes("const posteAJourColis") && !gpj.includes("const posteSansIaTaille") && !gpj.includes("const posteFormatExplicite"),
  "plus aucun drapeau « poste à jour » qui retient (marque, colis, taille Beebs, format Beebs)");
// Chaque comparaison du build du poll : une liste NOMMÉE. Une ligne nouvelle est rouge tant qu'elle n'est pas justifiée.
const AUTORISEES = [
  // relance d'un job arrêté quand un poste porte le correctif (une relance, jamais une retenue)
  "const correctifsPortes = CORRECTIFS_EXTENSION.filter((c) => buildMsDe(buildDuPoll) >= buildMsDe(c.buildMin));",
  "if (!c || !(buildMsDe(buildDuPoll) >= buildMsDe(c.buildMin))) continue;",
  // relance des livres gelés le 28/08 (cancelled) par un poste qui remet l'ISBN capturé : une relance
  "if (!includeProcessing && !includeNeedsUser && buildMsDe(buildDuPoll) >= buildMsDe(BUILD_ISBN_CAPTURE_TEL_QUEL)) {",
  // adaptations de capacité : ce qu'on SERT à un poste selon ce qu'il sait faire, jamais une retenue
  "const cap = aspectsDeLaCapture(natif, { repliModele: buildMsDe(buildDuPoll) >= buildMsDe(BUILD_VINTED_MODELE_REPLI) });",
  "const posteChaine = buildMsDe(buildDuPoll) >= buildMsDe(BUILD_VINTED_MARQUE_CHAINE);",
  "const posteMarqueParIdR = buildMsDe(buildDuPoll) >= buildMsDe(BUILD_VINTED_MARQUE_PAR_ID);",
  "const posteMarqueParId = buildMsDe(buildDuPoll) >= buildMsDe(BUILD_VINTED_MARQUE_PAR_ID);",
  // exception gardée (défaut de NOTRE code prouvé sur ce build — famille defaut_fillsell)
  "const bPoll = buildMsDe(buildDuPoll);",
];
const lignes = gpj.split("\n").map((l) => l.trim()).filter((l) => !l.startsWith("//") && /buildMsDe\(buildDuPoll\)/.test(l));
const inconnues = lignes.filter((l) => !AUTORISEES.includes(l));
ok(inconnues.length === 0, `chaque comparaison du build du poll est nommée (${lignes.length} lignes)`, inconnues.join("\n      "));
ok(gpj.includes("out = out.filter((j) => posteApresDefaut((j.platform_fields ?? {}) as Record<string, unknown>, buildDuPoll));"),
  "exception gardée : un défaut de NOTRE code n'est pas rendu au build qui a planté (sinon il replante toutes les 30 min)");

console.log("\n2. update-job-status : plus de refus 409 « Mets l'extension à jour »");
const ujs = lire("supabase/functions/update-job-status/index.ts");
ok(!ujs.includes("posteExtensionCompatible(") && !ujs.includes("extension_update_required"), "le démarrage n'est jamais refusé pour le build du poste");
ok(ujs.includes("next_action_after: new Date(Date.now() + 6 * 3_600_000).toISOString()"),
  "colis inconnu sur un poste qui ne sait pas poser la question : repris dans 6 h, jamais une boucle");

console.log("\n3. handler-watch et règles partagées : plus aucune pause « build_min_requis »");
const hw = lire("supabase/functions/handler-watch/index.ts");
ok(!hw.includes("champsPauseAttenteMaj(") && !hw.includes(".update(pauseMaj)"), "handler-watch ne pose plus de pause sous le build");
const R = await imp("supabase/functions/_shared/relance-apres-maj.js");
const pauses = R.RELANCES_APRES_MAJ.filter((r) => r.pauseAttente);
const tache = (r) => ({ id: "x", platform: r.platform, action: r.action, status: "needs_user", error: "x", platform_fields: { needs_user_source: r.source } });
ok(pauses.length > 0 && pauses.every((r) => R.champsPauseAttenteMaj(tache(r), r, { maintenant: "2026-11-06T09:00:00Z" }) === null),
  `champsPauseAttenteMaj rend null pour les ${pauses.length} règles « pauseAttente »`);
const B = await imp("supabase/functions/_shared/recreation-bloquee.js");
const bloquee = { id: "y", action: "republish", status: "needs_user", platform: "vinted", title: "t", error: "x",
  platform_fields: { needs_user_source: B.SOURCE_RECREATION_BLOQUEE, republish_step: "deleted",
    error_technique: { brut: "COULEUR INTROUVABLE : la couleur [\"Noir\"] existe bien chez Vinted mais n'a pas pu être posée" } } };
ok(B.causeLeveePourRelance(bloquee, ANCIEN)?.code === "vinted_menus_bloom", "une remise en ligne bloquée se relance sur un poste ancien (annonce hors ligne)");
const I = await imp("supabase/functions/_shared/isbn-capture-preuve.js");
ok(I.attenteIsbnCapture("0000000000", ANCIEN, new Set()) === null && I.attenteIsbnCapture("0000000000000", ANCIEN, new Set()) === null,
  "un ISBN capturé n'attend jamais « la mise à jour de l'extension »");

console.log("\n4. L'app : un bandeau qui informe, aucune tâche « en pause : mise à jour »");
const { extensionAMettreAJour } = await imp("src/utils/extensionAJour.js");
ok(extensionAMettreAJour({ build: ANCIEN, lastSeenAt: new Date().toISOString() }) === false, "extensionAMettreAJour : toujours false");
const app = lire("src/App.jsx");
ok(!app.includes("ta file reprendra toute seule après la mise à jour") && app.includes("ta file continue de tourner"), "le bandeau d'App informe sans dire que la file attend");

console.log("\n5. EXTENSION_MIN_BUILD ne se pose jamais ; la 0.6.175 est publiée");
const { EXTENSION_MIN_BUILD } = await imp("supabase/functions/_shared/version-min-extension.js");
ok(EXTENSION_MIN_BUILD === "2026-10-17T18:16:49Z", `EXTENSION_MIN_BUILD inchangé (${EXTENSION_MIN_BUILD})`);
const pkg = lire("scripts/package-extension.mjs");
// (08/11 nuit) 0.6.179 et 0.6.182 l'ont suivie dans la liste : elle n'est plus la dernière, elle y reste.
ok(/const ALREADY_PUBLISHED = \[[^\]]*'0\.6\.175'[,\]]/.test(pkg), "0.6.175 dans ALREADY_PUBLISHED");
ok(!pkg.includes("poser EXTENSION_MIN_BUILD =") && pkg.includes("EXTENSION_MIN_BUILD ne se pose JAMAIS"), "la consigne de fin ne dit plus de poser EXTENSION_MIN_BUILD");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ aucune tâche n'est refusée, retenue ni mise en pause pour le build du poste");
