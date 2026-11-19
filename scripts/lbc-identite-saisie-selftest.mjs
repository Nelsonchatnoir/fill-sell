// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN « NOM ET PRÉNOM » : LA RELANCE EST UN VRAI ESSAI, FILLSELL POSE LUI-MÊME — `npm run selftest:lbc-identite-saisie`
// ═══════════════════════════════════════════════════════════════════════════
// 18/11/2026, ordre de Nico (point 4 du lot). Cas fondateur : compte d5531b8e, 88 publications Leboncoin au mur
// « nom et prénom » (escrow_lastname / escrow_firstname vides sur l'aperçu : compte Leboncoin neuf). Relance depuis
// l'app le 17/11 à 20:11:06.740Z → retenue par get-pending-jobs à 20:11:10.201Z (« 1 tâche(s) retenue(s) avant
// essai », dernier mur 15:36:21.303Z), sans aucune visite de Leboncoin ; FillSell n'avait nulle part ces deux valeurs.
// Verrou : rouge sur 86a0297 (13 échecs sur 17), vert après le correctif.
//   1. une relance de l'app APRÈS le dernier mur part tout de suite (UN essai), une relance d'avant le mur reste retenue ;
//   2. get-pending-jobs lui pose la marque d'éclaireur (« relance_app ») que lit handler-watch ;
//   3. nom et prénom demandés une fois, jamais inventés (_shared/lbc-identite.js) ;
//   4. l'extension pose les cases VIDES, jamais un pré-rempli de Leboncoin (bloc ⟦identite-escrow⟧, exécuté) ;
//   5. le background les lit au dépôt, hors platform_fields ; 6. l'app les écrit par platform_settings_fusionner.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").split("\r\n").join("\n");
const sansCommentaires = (s) => s.replace(/\/\/.*$/gm, "");
let ko = 0, n = 0;
const ok = (c, quoi, d = "") => { n++; if (c) console.log(`  ✓ ${quoi}`); else { ko++; console.log(`  ✗ ${quoi}${d ? `\n      ${d}` : ""}`); } };
const bloc = (txt, debut, fin) => { const a = txt.indexOf(debut), b = txt.indexOf(fin); return a < 0 || b < 0 ? null : txt.slice(a, b + fin.length); };

const I = await import(pathToFileURL(path.join(RACINE, "supabase/functions/_shared/lbc-identite.js")).href);

console.log("\n1. UNE RELANCE DE L'APP APRÈS LE DERNIER MUR PART TOUT DE SUITE (UN vrai essai)");
const dernierMur = Date.parse("2026-11-17T15:36:21.303Z");
const pend = (id, pf = {}, action = "publish") => ({ id, platform: "leboncoin", action, status: "pending", created_at: "2026-11-17T14:00:30Z", platform_fields: pf });
const relancee = pend("d0bdebe8", { derniere_relance_manuelle: "2026-11-17T20:11:06.740Z", relances_manuelles: 2, needs_user_source: "lbc_identite" });
const neuve = pend("neuve");
const avantMur = pend("avant-mur", { derniere_relance_manuelle: "2026-11-17T14:08:11.932Z" });
const r1 = I.partagerCandidatsIdentite([neuve, relancee, avantMur], dernierMur);
ok(r1.servis.length === 1 && r1.servis[0].id === "d0bdebe8", "la relance de 20:11:06 (après le mur de 15:36) est servie (avant : retenue en 4 s)",
  `servis = ${JSON.stringify(r1.servis.map((j) => j.id))}`);
ok(r1.retenus.map((j) => j.id).sort().join() === "avant-mur,neuve", "une publication neuve et une relance ANTÉRIEURE au mur restent retenues (l'essai a buté depuis)");
const deux = I.partagerCandidatsIdentite([relancee, pend("autre", { derniere_relance_manuelle: "2026-11-17T20:11:07Z" })], dernierMur);
ok(deux.servis.length === 1, "deux relances au même passage : UN seul essai");
const ecl = pend("ecl", { identite_lbc: { eclaireur_le: "2026-11-18T09:03:00.958Z" } });
ok(I.partagerCandidatsIdentite([ecl, neuve], dernierMur).servis[0]?.id === "ecl", "l'éclaireur de la carte / de handler-watch : inchangé");
ok(I.partagerCandidatsIdentite([relancee], Date.parse("2026-11-17T21:00:00Z")).servis.length === 0, "un mur VU après la relance : retombe dans la retenue");
ok(typeof I.eclaireurMarqueApresMur === "function" && !I.eclaireurMarqueApresMur(relancee, dernierMur) && I.eclaireurMarqueApresMur(ecl, dernierMur),
  "la relance de l'app n'a pas encore la marque d'éclaireur ; celle de handler-watch l'a");
const marquee = I.champsEclaireur(relancee.platform_fields, "relance_app", "2026-11-17T20:11:10.000Z");
ok(marquee.identite_lbc?.par === "relance_app" && marquee.identite_lbc?.eclaireur_le === "2026-11-17T20:11:10.000Z" && !marquee.needs_user_source,
  "marque posée (date, « relance_app ») et marque de mur levée");

console.log("\n2. LE SERVEUR MARQUE CETTE RELANCE COMME ÉCLAIREUR (handler-watch la reconnaît : 12 h, reprise du compte)");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(/champsEclaireurIdentite\(\(j\.platform_fields \?\? \{\}\) as Record<string, unknown>, "relance_app", maintenantIso\)/.test(gpj), "get-pending-jobs : champsEclaireur(…, \"relance_app\", …) sur l'éclaireur servi par une relance de l'app");
ok(/if \(eclaireurMarqueApresMur\(j as never, dernierMur\)\) continue;/.test(gpj) && /\.update\(\{ platform_fields: pfP \}\)\.eq\("id", String\(j\.id\)\)\.eq\("status", "pending"\)/.test(gpj),
  "écrite une fois, compare-and-swap sur pending, jamais par-dessus une marque déjà posée");
ok(/delete pfP\["compte_pro"\];/.test(gpj), "la marque « compte pro » (réponse seulement) n'est jamais écrite");
const hw = lire("supabase/functions/handler-watch/index.ts");
ok(/\.not\("platform_fields->identite_lbc->>eclaireur_le", "is", null\)/.test(hw), "handler-watch lit toujours identite_lbc.eclaireur_le (inchangé)");

console.log("\n3. LE NOM ET LE PRÉNOM : DEMANDÉS UNE FOIS, JAMAIS INVENTÉS (_shared/lbc-identite.js)");
ok(typeof I.identiteVendeurValide === "function", "identiteVendeurValide exportée");
if (typeof I.identiteVendeurValide === "function") {
  const v = I.identiteVendeurValide;
  ok(JSON.stringify(v({ nom: "  Dupont-Martin ", prenom: "Anne  Marie" })) === JSON.stringify({ nom: "Dupont-Martin", prenom: "Anne Marie" }), "espaces nettoyés, trait d'union gardé");
  ok(v({ nom: "N'Diaye", prenom: "Éloïse" }) !== null && v({ nom: "N’Diaye", prenom: "Zoé" }) !== null, "apostrophes et accents acceptés");
  ok(v({ nom: "", prenom: "Anne" }) === null && v({ nom: "Dupont", prenom: "   " }) === null && v(null) === null, "vide = inconnu (la question), jamais une valeur inventée");
  ok(v({ nom: "Dupont2", prenom: "Anne" }) === null && v({ nom: "x".repeat(51), prenom: "Anne" }) === null, "chiffres ou plus de 50 caractères : refusés");
  ok(I.identiteVendeurDuProfil({ leboncoin: { identite_vendeur: { nom: "Dupont", prenom: "Anne" } } })?.nom === "Dupont" && I.identiteVendeurDuProfil({ leboncoin: {} }) === null,
    "lue dans platform_settings.leboncoin.identite_vendeur, rien sinon");
}
ok(I.CLE_IDENTITE_VENDEUR === "identite_vendeur", "rangés dans platform_settings.leboncoin.identite_vendeur");
ok(/nom et ton prénom sur ton compte vendeur/.test(I.MSG_LBC_ESCROW_IDENTITE ?? "") && /nom et ton prénom sur ton compte vendeur/.test(I.MSG_LBC_ESCROW_IDENTITE_REFUSEE ?? "")
  && /nom et ton prénom sur ton compte vendeur/.test(I.MSG_LBC_IDENTITE_RETENUE) && /dans FillSell/.test(I.MSG_LBC_IDENTITE_RETENUE)
  && ![I.MSG_LBC_ESCROW_IDENTITE, I.MSG_LBC_ESCROW_IDENTITE_REFUSEE, I.MSG_LBC_IDENTITE_RETENUE].some((m) => /ordinateur|onglet|Chrome/i.test(String(m))),
  "les textes gardent la tournure reconnue par l'app, disent le geste dans FillSell, valent pour le Cloud");
ok(typeof I.ancienMessageIdentite === "function" && I.ancienMessageIdentite("Leboncoin demande ton nom et ton prénom sur ton compte vendeur (obligatoires pour la Transaction sécurisée) : sans eux, la publication ne peut pas être validée. Complète-les sur leboncoin.fr — …")
  && !I.ancienMessageIdentite(I.MSG_LBC_ESCROW_IDENTITE), "l'ancien texte (« complète-les sur leboncoin.fr ») est reconnu, jamais le nouveau");
const ujs = lire("supabase/functions/update-job-status/index.ts");
// (19/11 soir, ordre de Nico — Lizzaa) Le texte posé suit le build qui écrit : la promesse « FillSell les posera » seulement
// s'il sait la tenir (selftest:lbc-identite-pose-1911).
ok(/dI\["quoi"\] === MOTIF_LBC_IDENTITE && ancienMessageIdentite\(patch\.error\)/.test(ujs)
  && ujs.includes("const msgI = messageIdentitePourBuild(body.handler_build, MSG_LBC_ESCROW_IDENTITE);") && ujs.includes("patch.error = `${msgI}${annexe}`;"),
  "update-job-status remplace l'ancien texte pour toutes les versions (motif exact, annexe gardée), selon le build qui écrit");

console.log("\n4. L'EXTENSION POSE LES CASES VIDES, JAMAIS UNE CASE REMPLIE PAR LEBONCOIN (bloc ⟦identite-escrow⟧)");
const LBC = lire("chrome-extension/content-scripts/leboncoin.js");
const b = bloc(LBC, "// ⟦identite-escrow:début⟧", "// ⟦identite-escrow:fin⟧");
ok(!!b, "bloc ⟦identite-escrow⟧ présent dans leboncoin.js");
if (b) {
  const ctx = vm.createContext({ String, Array, Object, RegExp, Number });
  vm.runInContext(`${b}\n;globalThis.__t = { decisionIdentiteEscrowLbc, identiteEscrowDuJob };`, ctx);
  const T = ctx.__t;
  const id = T.identiteEscrowDuJob({ identite_vendeur_lbc: { nom: "Dupont", prenom: "Anne" } });
  const d1 = T.decisionIdentiteEscrowLbc([{ cle: "escrow_lastname", vide: true }, { cle: "escrow_firstname", vide: true }], id);
  ok(!d1.manque && d1.poser.map((p) => `${p.cle}=${p.valeur}`).join() === "escrow_lastname=Dupont,escrow_firstname=Anne", "deux cases vides → nom et prénom de la personne");
  const d2 = T.decisionIdentiteEscrowLbc([{ cle: "escrow_lastname", vide: false }, { cle: "escrow_firstname", vide: false }], id);
  ok(!d2.manque && d2.poser.length === 0, "pré-rempli par Leboncoin : rien n'est touché");
  const d3 = T.decisionIdentiteEscrowLbc([{ cle: "escrow_lastname", vide: false }, { cle: "escrow_firstname", vide: true }], id);
  ok(d3.poser.length === 1 && d3.poser[0].cle === "escrow_firstname", "une seule case vide : seule celle-là");
  const d4 = T.decisionIdentiteEscrowLbc([{ cle: "escrow_lastname", vide: true }, { cle: "escrow_firstname", vide: true }], T.identiteEscrowDuJob({}));
  ok(d4.manque && d4.poser.length === 0, "sans nom connu : la question (lbc_escrow_identite), rien d'inventé");
  ok(T.identiteEscrowDuJob({ identite_vendeur_lbc: { nom: "Dupont2", prenom: "Anne" } }) === null, "une valeur invalide n'est jamais posée (même règle que le serveur)");
  const d5 = T.decisionIdentiteEscrowLbc([{ cle: "escrow_inconnue", vide: true }], id);
  ok(d5.poser.length === 0 && !d5.manque, "une case escrow_ inconnue n'est jamais remplie");
  const memeRegle = ["Dupont-Martin", "N'Diaye", "Éloïse", "Dupont2", "", "x".repeat(51), "Anne Marie"].every((x) =>
    (T.identiteEscrowDuJob({ identite_vendeur_lbc: { nom: x, prenom: "Anne" } }) === null) === (I.identiteVendeurValide({ nom: x, prenom: "Anne" }) === null));
  ok(memeRegle, "extension et serveur : la même règle de validité");
}
const msgExt = (nom) => { const m = new RegExp(`const ${nom} =\\n((?:\\s+"[^"]*"(?: \\+)?\\n?)+);`).exec(LBC); return m ? m[1].split("\n").map((l) => (/"([^"]*)"/.exec(l) ?? [])[1] ?? "").join("") : null; };
ok(msgExt("MSG_LBC_ESCROW_IDENTITE") === I.MSG_LBC_ESCROW_IDENTITE && msgExt("MSG_LBC_ESCROW_IDENTITE_REFUSEE") === I.MSG_LBC_ESCROW_IDENTITE_REFUSEE,
  "les textes de l'extension sont la copie EXACTE de _shared/lbc-identite.js");
ok(!/on ne SAISIT jamais un email\/téléphone\/nom\/prénom/.test(LBC) && !/personnelle : jamais saisie par nous/.test(LBC), "l'ancienne politique « jamais saisi par nous » est remplacée (décision de Nico du 18/11)");
const corps = sansCommentaires(LBC.replace(b ?? "", ""));
const iAvant = corps.indexOf("const r = await poserIdentiteEscrowLbc(job);"), iClic = corps.indexOf("realClick(finalContinue);");
ok(iAvant > 0 && iClic > iAvant, "les cases sont posées AVANT le Continuer final");
ok(/if \(r\.manque\) \{[\s\S]{0,400}attenteMotif: "lbc_escrow_identite"/.test(corps), "sans valeur connue : l'attente, sans cliquer");
ok(/identiteEscrowPosee \? MSG_LBC_ESCROW_IDENTITE_REFUSEE : MSG_LBC_ESCROW_IDENTITE/.test(corps), "posés et refusés : la personne vérifie ce qu'elle a donné (même motif, même carte)");
ok(/!identiteEscrowTentee && estEncoreApercu\(\) && champsEscrowVides\(\)\.length && !\(await depotRequeteVue\(\)\)\.seen/.test(corps),
  "repli : cases montrées après le clic → posées une fois, un re-clic seulement si rien n'est parti");
const poseur = bloc(LBC, "async function poserIdentiteEscrowLbc(job) {", "return { manque: false, posees, ok };") ?? "";
ok(!!poseur && !/console\.|warnings\.push/.test(poseur), "le poseur ne journalise aucune valeur");

console.log("\n5. LE BACKGROUND LIT L'IDENTITÉ AU DÉPÔT, HORS platform_fields (jamais copiée dans les tâches)");
const BG = lire("chrome-extension/background.js");
ok(/platform_settings\?\.leboncoin\?\.identite_vendeur/.test(BG), "lue dans profiles.platform_settings.leboncoin.identite_vendeur (RLS : sa ligne)");
ok(/job\.identite_vendeur_lbc\s*=/.test(BG) && !/platform_fields[^;\n]*identite_vendeur/.test(sansCommentaires(BG)), "posée sur job.identite_vendeur_lbc, jamais dans platform_fields");
ok(/pf\.last_diagnostic\.identite = \{/.test(BG) && !/identite_vendeur_lbc[^;\n]*last_diagnostic/.test(BG), "le diagnostic dit posé / connu / quelles cases, jamais les valeurs");

console.log("\n6. L'APP DEMANDE UNE FOIS (carte « Leboncoin : ton nom et ton prénom »)");
const EC = lire("src/stock/EcranIdentiteLbc.jsx");
ok(/fusionnerReglages\(\s*\[\s*'leboncoin'\s*,\s*'identite_vendeur'\s*\]/.test(EC), "écrit par platform_settings_fusionner (fusionnerReglages), la seule voie");
ok(!/\.update\(\{\s*platform_settings/.test(EC), "jamais un .update de platform_settings");
ok(/identiteVendeurValide\(\{ nom, prenom \}\)/.test(EC) && /champsEclaireur\(eclaireur\.platform_fields, 'geste'/.test(EC), "contrôlés par la règle du serveur, puis UN éclaireur (« Enregistrer et essayer »)");
const ST = lire("src/tabs/StockTab.jsx");
const murs = (() => { const a = ST.indexOf("const MURS_LEVES_A_LA_RELANCE = ["); return a < 0 ? "" : ST.slice(a, ST.indexOf("\n];", a)); })();
ok(/'lbc_identite'/.test(sansCommentaires(murs)), "« Relancer » lève la marque lbc_identite (le mur est reposé s'il tient)");
const MS = lire("src/utils/messagesServeur.js");
ok([I.MSG_LBC_ESCROW_IDENTITE, I.MSG_LBC_ESCROW_IDENTITE_REFUSEE, I.MSG_LBC_IDENTITE_RETENUE].every((m) => MS.includes(m)), "les trois textes ont leur anglais");

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n} vérifications : la relance part, le nom et le prénom sont posés par FillSell`);
process.exit(ko ? 1 : 0);
