// ═══════════════════════════════════════════════════════════════════════════
// EXTENSION 0.6.104 — BEEBS : LA PREUVE RELUE, AUCUN ESSAI SANS PREUVE, LE
// FLUX QUAND « MES ANNONCES » EST PEINTE VIDE (08/10/2026, Louis)
// ═══════════════════════════════════════════════════════════════════════════
// Le 06/10, les republications Beebs de Louis prenaient ~20 min chacune : Beebs
// garde l'annonce visible quelques minutes après sa suppression, le content
// script relisait 2 min, puis le job attendait 5 min, consommait un essai et
// repassait par tout le retrait. Et « Mes annonces » peinte vide (fenêtre
// minimisée) laissait le relevé incomplet. Ce test échoue si :
//   · la relecture de la preuve devient un GESTE (clic, navigation) ou cesse
//     d'être bornée (~6 min après l'envoi, service worker éveillé) ;
//   · un seul message au content script doit durer plus de 300 s ;
//   · une reprise après une suppression envoyée consomme de nouveau un essai,
//     ou redit « rien n'a été touché » ;
//   · le relevé déclare la liste « rendue » par le flux sans que les trois
//     concordent (onglets lus, compteur de Beebs = index, identifiants connus) ;
//   · le manifeste n'est plus en 0.6.104 ou le BUILD du content script l'oublie.
//
//   npm run selftest:beebs-preuve-relue
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8').split('\r\n').join('\n');
let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };
const b = lire('chrome-extension/background.js');
const s = lire('chrome-extension/content-scripts/beebs.js');
const corps = (src, debut, fin) => { const i = src.indexOf(debut); const j = src.indexOf(fin, i + debut.length); return i < 0 || j < 0 ? '' : src.slice(i, j); };

console.log('1. Content script : la preuve se relit sans aucun geste');
{
  const h = corps(s, 'if (msg?.type === "BEEBS_PREUVE_RETRAIT") {', 'if (msg?.type === "DELETE_LISTING")');
  ok(h.length > 0, 'commande BEEBS_PREUVE_RETRAIT présente');
  ok(/preuveAbsenceMesAnnonces\(idCible, t\)/.test(h) && !/realClick|\.click\(|location\.(href|assign)|history\./.test(h), 'elle ne fait que lire (preuveAbsenceMesAnnonces), aucun clic ni navigation');
  ok(/if \(!\/\^\\d\{6,\}\$\/\.test\(idCible\)\)/.test(h), 'un numéro d\'annonce exact obligatoire');
  ok(/p\.verdict === "absente" \? preuveRetraitDepuis\(p\.lecture, idCible, "apres_confirmation_relue"\) : null/.test(h), 'une preuve n\'est rendue que sur le verdict « absente »');
  const c = corps(s, 'async function confirmerRetraitParMesAnnonces(idCible, t) {', '\n}\n');
  ok(/const suppressionEnvoyeeLe = new Date\(\)\.toISOString\(\);/.test(c) && /suppressionEnvoyee: true, suppressionEnvoyeeLe,/.test(c), 'l\'heure d\'envoi de la suppression remonte au background');
  ok(/for \(const attente of \[0, 10_000, 20_000, 40_000, 60_000\]\)/.test(c), 'le content script relit toujours ~2 min, pas plus (un message borné à 300 s)');
  ok(/^const BEEBS_BUILD = "2026-10-08-preuve-relue \(0\.6\.104/m.test(s), 'empreinte de version du content script à jour');
}

console.log('2. Background : relecture bornée à ~6 min après l\'envoi, service worker éveillé');
{
  const r = corps(b, 'async function relirePreuveRetraitBeebs(tabId, idCible, envoyeeLe) {', '\n}\n');
  ok(/const BEEBS_PREUVE_FENETRE_MS = 6 \* 60_000;/.test(b) && /const BEEBS_PREUVE_INTERVALLE_MS = 45_000;/.test(b), 'fenêtre de 6 min, une lecture toutes les 45 s');
  ok(/\+ BEEBS_PREUVE_FENETRE_MS/.test(r) && /while \(Date\.now\(\) \+ 5_000 < fin\)/.test(r), 'la boucle s\'arrête à la fin de la fenêtre');
  ok(/setInterval\(\(\) => chrome\.runtime\.getPlatformInfo\(\)\.catch\(\(\) => \{\}\), 20_000\)/.test(r) && /finally \{\s*clearInterval\(reveil\);/.test(r), 'service worker éveillé pendant l\'attente, réveil toujours arrêté');
  ok(/sendMessageToTab\(tabId, \{ type: "BEEBS_PREUVE_RETRAIT", idCible \}, 60_000\)/.test(r), 'chaque lecture est un appel court (60 s au plus)');
  ok(/if \(dernier\?\.verdict === "absente" && dernier\.preuveRetrait\) break;/.test(r), 'sortie dès la preuve');
  const p = corps(b, 'async function processRepublishJobPlateforme(job, accessToken) {', '// ── Étape 2 : REDÉPÔT');
  ok(/\(\{ result, tabId: tabRetrait \} = await executerRetraitViaHandler\(job, accessToken\)\);/.test(p), 'l\'onglet du retrait est gardé pour la relecture');
  ok(/result\.suppressionEnvoyee && job\.platform === "beebs" && tabRetrait != null\)[\s\S]{0,400}relirePreuveRetraitBeebs\(tabRetrait, idCible, result\.suppressionEnvoyeeLe\)/.test(p), 'Beebs : la relecture part après une suppression envoyée non prouvée');
  ok(/if \(relue\.verdict === "absente" && relue\.preuveRetrait\) \{\s*result = \{ \.\.\.result, success: true,[^}]*preuveRetrait: relue\.preuveRetrait/.test(p), 'retirée seulement AVEC la preuve relue');
  ok(/let retire = result\?\.success === true;[\s\S]*pfApres\.republish_step = "deleted";/.test(p) && /if \(result\?\.preuveRetrait\) pfApres\.preuve_retrait = result\.preuveRetrait;/.test(p), 'la preuve relue est écrite sur le job avant le redépôt');
}

console.log('3. Aucune reprise ne consomme d\'essai tant que la suppression n\'est pas prouvée');
{
  const p = corps(b, 'async function processRepublishJobPlateforme(job, accessToken) {', '// ── Étape 2 : REDÉPÔT');
  const retrait = corps(p, 'let result = null;', '// ── RETIRÉE : étape actée');
  ok(/const rearmRetrait = \(msg\) => \(suppressionDejaEnvoyee\(job, job\.platform_fields\)\s*\? rearmerSuppressionNonProuvee\(accessToken, job, msg\)\s*: rearmBounded\(accessToken, job, msg\)\);/.test(retrait),
    'une suppression déjà envoyée → reprise sans essai ; sinon les essais comme avant');
  ok(!/await rearmBounded\(/.test(retrait), 'plus aucun rearmBounded direct dans l\'étape du retrait');
  ok(/await rearmerSuppressionNonProuvee\(accessToken, job, msgEnvoyee\);/.test(retrait), 'suppression envoyée à ce passage : reprise sans essai');
  ok(/suppressionDejaEnvoyee\(job, job\.platform_fields\)\s*\? `Suppression déjà envoyée à \$\{label\}, pas encore confirmée/.test(retrait), 'jamais « rien n\'a été touché » après notre suppression');
  const f = corps(b, 'async function rearmerSuppressionNonProuvee(accessToken, job, errorMsg) {', '\n}\n');
  ok(f.length > 0 && !/needsUserAttempts/.test(f), 'needsUserAttempts n\'est jamais touché');
  ok(/if \(actuel && actuel !== "processing" && actuel !== "pending"\)/.test(f), 'jamais par-dessus une annulation');
  ok(/const SUPPRESSION_NON_PROUVEE_DELAIS_MIN = \[5, 10, 20, 30, 60\];/.test(b) && /next_action_after = new Date\(Date\.now\(\) \+ delaiMin \* 60000\)/.test(f), 'reprises espacées (5, 10, 20, 30, puis 60 min)');
  ok(/updateJobStatus\(accessToken, job\.id, "pending"/.test(f) && !/"failed"|"needs_user"/.test(f), 'le job reste en file : jamais « failed » sur une suppression non prouvée');
}

console.log('4. Relevé : le flux ne tranche que si tout concorde');
{
  const r = corps(b, '« MES ANNONCES » PEINTE VIDE : LE FLUX DE LA PAGE TRANCHE', 'if (concordent) beebsPageMuette = null;');
  ok(r.length > 0, 'branche présente');
  ok(/if \(beebsPageMuette != null && idx\?\.ok && idx\.exhaustif && Number\.isFinite\(idx\.total\)\)/.test(r), 'seulement page peinte vide ET index au total exact');
  ok(/sendMessageToTab\(dernierTabId, \{ type: "BEEBS_IDS_MES_ANNONCES" \}, 60_000\)/.test(r), 'le flux lu par la commande existante (lecture pure)');
  ok(/flux\?\.ok === true && pEnLigne\?\.ok === true && pVerif\?\.ok === true/.test(r), 'les deux onglets lus');
  ok(/Number\(pEnLigne\.annoncees\) === Number\(idx\.total\)/.test(r), 'le compteur « en ligne » de Beebs = le total de l\'index');
  ok(/\(pEnLigne\.ids \?\? \[\]\)\.every\(\(id\) => idsIndex\.has\(String\(id\)\)\)/.test(r) && /\(pVerif\.ids \?\? \[\]\)\.every\(\(id\) => annonces\.has\(String\(id\)\)\)/.test(r),
    'chaque identifiant du flux est connu (index en ligne, relevé en vérification)');
  ok(/beebsPageMuette = Number\(idx\.total\)/.test(b) && /listeRendue: beebsPageMuette == null/.test(b), 'sinon la page reste muette : rien n\'est conclu (comme avant)');
}

console.log('5. Version');
{
  ok(/"version": "0\.6\.104"/.test(lire('chrome-extension/manifest.json')), 'manifeste en 0.6.104');
}

console.log(ko ? `\n${ko} contrôle(s) en échec.` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
