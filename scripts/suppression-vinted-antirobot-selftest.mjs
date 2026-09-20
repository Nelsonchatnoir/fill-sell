// ═══════════════════════════════════════════════════════════════════════════
// UN RETRAIT VINTED NE MEURT PLUS SUR UN REFUS ANTI-ROBOT (20/09, passe 4)
// ═══════════════════════════════════════════════════════════════════════════
// LES DEUX CAS, compte ornellaracano@icloud.com, articles VENDUS et annonces
// ENCORE EN LIGNE (vérifié : HTTP 200 sur les deux URL au moment du lot) :
//
//   job ed8bbd42 « Lot de 14 anges miniatures », 19/09 22:48 → FAILED
//     « Page inattendue pour une suppression Vinted : https://www.vinted.fr/ »
//     Le background avait navigué sur /items/10051385367-… ; on atterrit sur
//     la RACINE. Le même job porte `blocage_antirobot` : HTTP 403,
//     access_denied, vu à 13:25.
//
//   job 0df4e6a2 « Jouet VTech – Trompette », 19/09 23:16 → FAILED
//     « Suppression Vinted : l'API a répondu HTTP 400. »
//     Le même job porte `blocage_antirobot` avec DEUX observations (05:58 et
//     11:31), même motif 403 access_denied. Ses archives disent : reprise
//     gratuite → tentative 1/5 → tentative 2/5 → puis ce 400, qui l'a tué.
//     Le message promettait « Reprise automatique dans ~15 min » sur un job
//     passé en `failed` — un failed n'est jamais reservi.
//
// LES DEUX SORTIES SONT MAINTENANT PRÉFIXÉES `CHALLENGE ` : background.js les
// route vers marquerBlocageAntiRobot — reprise toutes les 20 min, bornée à 6 h
// par épisode, AUCUNE tentative consommée, RIEN n'est supprimé.
//
// MESURE G0, 30 jours de suppressions Vinted : 170 `deleted`, 24 `cancelled`,
// 4 `pending`, 2 `failed`. AUCUNE des 170 réussites ne porte un 4xx ni une
// « page inattendue » — le correctif ne peut toucher que les 2 cassées.
//
//   node scripts/suppression-vinted-antirobot-selftest.mjs
import fs from 'node:fs';

let ko = 0;
const ok = (n, c) => { console.log(`  ${c ? 'ok  ' : '❌  '}  ${n}`); if (!c) ko++; };
const v = fs.readFileSync('chrome-extension/content-scripts/vinted.js', 'utf8');
const bg = fs.readFileSync('chrome-extension/background.js', 'utf8');

console.log('1. L\'accueil Vinted au lieu de la page de l\'annonce');
ok('la racine (/ ou /fr) est reconnue', /const racineVinted = \/\^\\\/\(fr\\\/\?\)\?\$\/\.test\(location\.pathname\);/.test(v));
ok('elle sort en CHALLENGE, pas en « page inattendue »',
  /if \(racineVinted\) \{[\s\S]{0,600}?CHALLENGE Vinted n'a pas servi la page/.test(v));
ok('et elle ne demande RIEN à la personne (needsUser: false)',
  /if \(racineVinted\) \{[\s\S]{0,400}?needsUser: false/.test(v));
ok('une AUTRE page inattendue garde son chemin d\'avant',
  /return \{ success: false, error: `Page inattendue pour une suppression Vinted : \$\{location\.href\}`, trace \};/.test(v));

console.log('\n2. Un 4xx avec une session valide');
ok('le 4xx non-401/403 est rattrapé', /if \(resp\.status >= 400 && resp\.status < 500\) \{/.test(v));
ok('la session est RELUE sur place (elle est hors de portée ici)',
  /const sessionIci = await vintedSessionEtat\(t\);/.test(v));
ok('session valide ⇒ CHALLENGE', /if \(sessionIci !== "expiree"\) \{[\s\S]{0,500}?CHALLENGE Vinted a refusé la suppression \(HTTP/.test(v));
ok('session expirée ⇒ on ne dit PAS anti-robot (le chemin générique reste)',
  /verdict\.conclusion = "http_autre";/.test(v));

console.log('\n3. Ce qui ne doit pas avoir bougé');
ok('le 403 + session valide garde SA branche, avant la nouvelle',
  v.indexOf('resp.status === 403 && session !== "expiree"') < v.indexOf('resp.status >= 400 && resp.status < 500'));
ok('le 401/403 reste traité en premier',
  /if \(resp\.status === 401 \|\| resp\.status === 403\) \{/.test(v));
ok('background.js route toujours le préfixe CHALLENGE vers l\'anti-robot',
  /\/\^CHALLENGE \/i\.test\(String\(result\.error \?\? ""\)\)/.test(bg));
ok('la reprise anti-robot ne consomme toujours aucune tentative',
  /AUCUNE tentative consommée/.test(bg));
ok('aucune suppression n\'est jamais CONCLUE sur un refus',
  /Un REFUS n'est\s*\n\s*\/\/ pas une preuve de suppression/.test(v));

console.log(`\n${ko === 0 ? '✅ Un refus anti-robot fait attendre le retrait, il ne le tue plus.' : `❌ ${ko} échec(s).`}`);
process.exit(ko === 0 ? 0 : 1);
