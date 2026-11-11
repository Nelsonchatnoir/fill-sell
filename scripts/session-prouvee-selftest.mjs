// selftest:session-prouvee — « TA CONNEXION EST BONNE » SE PROUVE SUR CE POSTE, MAINTENANT (01/11, Louis — tout le parc)
//
//   npm run selftest:session-prouvee
//
// Le cas : retrait Leboncoin « Maison Gabby » de louis-seller, 01/11 de 10:16 à 10:40 — quatre « Leboncoin a refusé
// l'accès à la page à l'instant, mais ta connexion Leboncoin est bonne » sur une session MORTE (vue acheteur, identifiants
// refusés). La règle (_shared/session-prouvee.js), branchée dans update-job-status (refus passager ET pas-de-rouge) :
//   A. jamais devant une vue acheteur ;
//   B. une sonde de CE poste, ou du compte s'il n'a qu'un poste vivant, de moins de 30 min, POSTÉRIEURE au dernier mur
//      vu par ce job ; plusieurs postes : seule celle de ce poste compte ;
//   C. les cas qui disaient vrai le disent toujours (sonde fraîche d'un poste seul, refus vraiment passager) ;
//   D. le cas du 01/11 rejoué : plus aucun « ta connexion est bonne » ; le message dit l'attente de la connexion ;
//   E. câblage dans update-job-status.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const S = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/session-prouvee.js')).href);
const PDR = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/pas-de-rouge.js')).href);
const UJS = lire('supabase/functions/update-job-status/index.ts');

let echecs = 0, total = 0;
const ok = (c, l) => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}`); };
const T = (iso) => Date.parse(iso);
const maintenant = T('2026-11-01T10:40:48Z');

// ── A. vue acheteur ──────────────────────────────────────────────────────────
const diag = "vue acheteur sur la page de l'annonce 3291865529 — actions relevées: [\"Clayton\",\"Acheter\",\"Faire une offre\"] ; vendeur private";
ok(S.verdictVueAcheteur(null, diag) && S.verdictVueAcheteur({ last_diagnostic: diag }) && !S.verdictVueAcheteur('Connexion Leboncoin requise', null),
  'A1. une annonce montrée « vue acheteur » à son vendeur est reconnue (texte ou objet)');
const sessionsFraiches = { leboncoin: true, checked_at_par_plateforme: { leboncoin: '2026-11-01T10:35:00Z' } };
ok(S.sessionsPourArbitrage({ platform: 'leboncoin', sessionsCompte: sessionsFraiches, poste: null, maintenant, verdict: ['', diag] }).leboncoin === null,
  'A2. pas-de-rouge : une sonde « connecté » même fraîche ne vaut rien devant une vue acheteur (devient inconnu, jamais déconnecté)');

// ── B. la preuve ─────────────────────────────────────────────────────────────
const vieille = { leboncoin: true, http: { leboncoin: 403 }, checked_at_par_plateforme: { leboncoin: '2026-11-01T09:44:32Z' } };
ok(!S.sondeProuveSession({ platform: 'leboncoin', sessionsCompte: vieille, maintenant }).bonne,
  'B1. une valeur gardée par une sonde muette (403) et vieille de 56 min ne prouve rien');
ok(S.sessionsPourArbitrage({ platform: 'leboncoin', sessionsCompte: vieille, maintenant }).leboncoin === null,
  'B2. pas-de-rouge : ce « true » périmé n\'est plus lu comme « connecté »');
ok(!S.sondeProuveSession({ platform: 'leboncoin', sessionsCompte: sessionsFraiches, poste: null, autresPostesVivants: 1, maintenant }).bonne,
  'B3. plusieurs postes vivants : la sonde rangée au compte (peut-être celle d\'un autre) ne prouve rien pour celui-ci');
const posteMort = { sessions: { lu_le: '2026-11-01T10:38:00Z', leboncoin: false } };
ok(!S.sondeProuveSession({ platform: 'leboncoin', sessionsCompte: sessionsFraiches, poste: posteMort, maintenant }).bonne,
  'B4. ce que le poste dit de lui (frais) fait foi : « déconnecté » chez lui l\'emporte sur le compte');
const posteBon = { sessions: { lu_le: '2026-11-01T10:38:00Z', leboncoin: true } };
ok(S.sondeProuveSession({ platform: 'leboncoin', sessionsCompte: null, poste: posteBon, autresPostesVivants: 2, maintenant }).bonne,
  'B5. plusieurs postes : la sonde fraîche de CE poste prouve sa session');
ok(!S.sondeProuveSession({ platform: 'leboncoin', sessionsCompte: sessionsFraiches, maintenant, apres: T('2026-11-01T10:36:00Z') }).bonne
  && S.sondeProuveSession({ platform: 'leboncoin', sessionsCompte: sessionsFraiches, maintenant, apres: T('2026-11-01T10:30:00Z') }).bonne,
  'B6. la preuve doit être POSTÉRIEURE au dernier mur vu par ce job');
ok(Number.isNaN(S.dernierMurDuJob({})) && S.dernierMurDuJob({ refus_passager: { derniere: '2026-11-01T10:28:47Z' }, attente_session: { derniere: '2026-11-01T10:20:00Z' } }) === T('2026-11-01T10:28:47Z'),
  'B7. le dernier mur du job : le plus récent du refus passager et de l\'attente de session');

// ── C. ce qui disait vrai ────────────────────────────────────────────────────
ok(S.sondeProuveSession({ platform: 'vinted', sessionsCompte: { vinted: true, checked_at_par_plateforme: { vinted: '2026-11-01T10:39:00Z' } }, maintenant }).bonne,
  'C1. un seul poste, sonde fraîche « connecté », premier mur : preuve gardée (le refus passager vrai reste un refus passager)');
ok(S.sondeProuveSession({ platform: 'vinted', sessionsCompte: { vinted: null, previous: { vinted: true, checked_at: '2026-11-01T10:30:00Z' } }, maintenant }).bonne,
  'C2. la sonde « connecté » juste écrasée par le mur (previous) compte encore pour un poste seul');
const fraisV = { vinted: true, checked_at_par_plateforme: { vinted: '2026-11-01T10:39:00Z' } };
ok(S.sessionsPourArbitrage({ platform: 'vinted', sessionsCompte: fraisV, maintenant }) === fraisV,
  'C3. pas-de-rouge : une sonde fraîche d\'un poste seul passe telle quelle (client-9148e867, 23/09)');
const sortieV = PDR.classerEchec({ platform: 'vinted', action: 'republish', brut: 'Connexion Vinted requise', essais: 0, pf: {},
  sessions: S.sessionsPourArbitrage({ platform: 'vinted', sessionsCompte: fraisV, maintenant }) });
ok(sortieV.motif === 'refus_session_bonne', `C4. classerEchec, sonde prouvée : « connexion bonne », comme avant (${sortieV.motif})`);

// ── D. le cas du 01/11 rejoué ────────────────────────────────────────────────
const sortieL = PDR.classerEchec({ platform: 'leboncoin', action: 'delete', brut: 'Connexion Leboncoin requise', essais: 0, pf: { last_diagnostic: diag },
  sessions: S.sessionsPourArbitrage({ platform: 'leboncoin', sessionsCompte: vieille, maintenant, verdict: ['Connexion Leboncoin requise', diag] }) });
ok(sortieL.motif !== 'refus_session_bonne' && !/est bonne/.test(String(sortieL.message ?? '')),
  `D1. Maison Gabby (sonde de 09:44, vue acheteur) : plus jamais « ta connexion est bonne » (${sortieL.motif})`);

// ── E. câblage ───────────────────────────────────────────────────────────────
ok(UJS.includes('import { sondeProuveSession, sessionsPourArbitrage, verdictVueAcheteur, dernierMurDuJob } from "../_shared/session-prouvee.js";'),
  'E1. update-job-status lit la règle du module partagé');
const iR = UJS.indexOf('LA PREUVE EST CELLE DE CE POSTE, POSTÉRIEURE AU MUR');
const blocR = UJS.slice(iR, UJS.indexOf('const passagerPrec =', iR));
ok(iR > 0 && /if \(jrow\.platform !== "ebay" && !vueAcheteurS\) \{/.test(blocR) && /sondeProuveSession\(\{/.test(blocR)
  && /apres: apresMurS/.test(blocR) && /if \(!preuveBonne && autresVivants === 0\) \{/.test(blocR)
  && /\.gte\("finished_at", new Date\(depuisRel\)\.toISOString\(\)\)/.test(blocR),
  'E2. refus passager : jamais devant une vue acheteur ; sonde de ce poste ; relevé seulement poste seul ET après le dernier mur');
ok(!/fraisSonde|"relevé réussi \(moins de 2 h\)"/.test(UJS), 'E3. l\'ancienne preuve (sonde du compte, relevé d\'avant le mur) a disparu');
ok(/sessionsSondees = sessionsPourArbitrage\(\{/.test(UJS) && /select\(ebayRefusNommeAPoser \? "extension_sessions, extension_postes, platform_settings" : "extension_sessions, extension_postes"\)/.test(UJS),
  'E4. pas-de-rouge reçoit des sessions prouvées pour CE poste');

console.log(echecs ? `\n✗ ${echecs} échec(s) sur ${total}` : `\n✓ ${total} vérifications vertes`);
process.exit(echecs ? 1 : 0);
