// selftest:extension-0-6-112 — (15/10) Les trois changements de l'extension
// 0.6.112 (qui contient la 0.6.111) :
//   H (Louis, 4 ventes Vinted annulées du 13/10) : une commande ANNULÉE déjà
//     détaillée par une version d'avant la règle d'annulation est relue UNE
//     fois pour transmettre ses annonces — jamais en boucle ;
//   C (carhoa) : une lecture d'annonce refusée (403) SANS session Vinted dans
//     le navigateur (cookie de connexion absent) = « Connexion Vinted
//     requise », jamais « anti-robot » ;
//   G (Louis, 325 annonces Leboncoin) : la vérification de ROUTINE tire une
//     fois quand elle prouve « en ligne » (3 tirs avant : ≈ 7 500 lectures par
//     jour), s'arrête au premier anti-robot et met les lectures de fond de la
//     plateforme en pause (1 h → 6 h) ; les trois tirs restent hors routine
//     (avant / après un retrait, une republication).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const bg = lire('chrome-extension/background.js');
const manifest = JSON.parse(lire('chrome-extension/manifest.json'));
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };

console.log('0. Version');
// (15/10 soir) La 0.6.113 contient la 0.6.112 (téléversée, en examen) : 0.6.112 OU PLUS.
ok((() => { const v = String(manifest.version).split('.').map(Number); return v[0] === 0 && v[1] === 6 && v[2] >= 112; })(), 'manifest 0.6.112 ou plus (contient la 0.6.111, jamais téléversée)');

console.log('H. Commande Vinted annulée relue une fois');
ok(/const annuleesFaites = new Set\(etat\.vinted\?\.annulees_v1 \?\? \[\]\);/.test(bg), 'mémoire à part des commandes annulées relues (annulees_v1)');
// (17/10, R2 — point 12) « annulée » = le prédicat de la veille (failed, canceled, cancelled).
ok(/\(!deja\.has\(r\.ref\)\s*\|\| \(commandeAnnulee\("vinted", r\.statut\) && !annuleesFaites\.has\(r\.ref\)\)/.test(bg), 'une commande annulée (failed / canceled / cancelled) déjà détaillée est relue si elle ne l\'a pas été pour l\'annulation');
ok(/annulees_v1: annulees\.slice\(-VINTED_DETAIL_MEMOIRE\)/.test(bg) && /faitsOk\.filter\(\(r\) => refsAnnulees\.has\(r\)\)/.test(bg), 'notée relue SEULEMENT après la réponse du serveur : une seule relecture, jamais en boucle');
// (17/10, point 11) forme nouvelle : les numéros de TOUTE commande ; une commande à un
// article sans item_id prend le seul numéro de order.item_ids.
ok(/item_ids: ids\.length \? ids : \(tr\?\.item_id != null \? \[String\(tr\.item_id\)\] : null\)/.test(bg)
  && /listing_id: lot \? null : \(tr\?\.item_id != null \? String\(tr\.item_id\) : \(ids\.length === 1 \? ids\[0\] : null\)\)/.test(bg),
  'le détail transmet l\'annonce et les annonces de toute commande (lot compris) : la règle serveur retrouve la vente');

console.log('C. Lecture 403 sans connexion');
const iC = bg.indexOf('UN 403 SANS CONNEXION N\'EST PAS UN ANTI-ROBOT');
const iAR = bg.indexOf('if (/protection anti-robot|CHALLENGE|anti-?robot/i.test(String(cap.error ?? ""))) {', iC);
ok(iC > 0 && iAR > iC, 'la preuve par le cookie passe AVANT l\'étiquette anti-robot');
const blocC = bg.slice(iC, iAR);
ok(/await classifierCause403\(\)/.test(blocC) && /cause403 === "session_absente"/.test(blocC), 'cookie de connexion lu (classifierCause403, la même preuve que le relevé)');
ok(/pf\.needs_user_source = "session_vinted";/.test(blocC) && /Connexion Vinted requise : connecte-toi sur/.test(blocC), '« Connexion Vinted requise », relancée seule à la reconnexion (session_vinted)');
ok(/delete pf\.blocage_antirobot; delete pf\.attente_antirobot_compte;/.test(blocC) && !/anti-?robot/i.test(blocC.slice(blocC.indexOf('const msgCo'), blocC.indexOf('await updateJobStatus'))), 'aucun mot « anti-robot » dans le message, marqueurs anti-robot retirés');

console.log('G. Vérifications de routine Leboncoin');
ok(/async function checkListingState\(url, platform, \{ routine = false \} = \{\}\)/.test(bg), 'checkListingState sait s\'il est appelé en routine');
ok(/if \(routine && res\.state === "active"\) break;/.test(bg) && /if \(routine && String\(res\.raison \?\? ""\)\.startsWith\("bot_shield"\)\) break;/.test(bg), 'routine : un « en ligne » prouvé suffit ; au premier anti-robot, on n\'insiste pas');
const appelsRoutine = (bg.match(/checkListingState\([^)]*\{ routine: true \}\)/g) ?? []).length;
const appelsTotal = (bg.match(/await checkListingState\(/g) ?? []).length;
ok(appelsRoutine === 1 && appelsTotal >= 8, `UN seul appel en routine (boucle de détection) ; les ${appelsTotal - 1} autres (retraits, republications) gardent les trois tirs`);
ok(/const dueOuverts = due\.filter\(\(j\) => !\(disjoncteurs\[j\.platform\]\?\.jusqua > Date\.now\(\)\)\);/.test(bg) && /await armerDisjoncteurLecture\(job\.platform\);/.test(bg),
  'disjoncteur : au premier anti-robot, les autres vérifications de la plateforme s\'arrêtent, pause 1 h → 6 h');
ok(/Math\.min\(6, 2 \*\* \(n - 1\)\) \* 60 \* 60 \* 1000/.test(bg) && /await leverDisjoncteurLecture\(job\.platform\)/.test(bg), 'pause doublée si le blocage dure (6 h au plus), levée à la première annonce revue en ligne');
ok(!/i < due\.length - 1/.test(bg.slice(bg.indexOf('async function checkPublishedListings'), bg.indexOf('async function checkPublishedListings') + 40000)), 'la boucle ne compte plus que les vérifications ouvertes');

console.log(`\n✓ extension-0-6-112 : ${n} contrôles verts`);
