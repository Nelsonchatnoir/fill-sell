// selftest:releve-verif-non-pris — (26/10, Johan Désiré) la relecture qui remet une annonce retirée en ligne n'attend
// jamais des heures : servie DEVANT, faite en tête de cycle par l'extension (≥ 0.6.148), relancée une fois si un poste
// qui polle ne la prend pas, puis dite à la personne — jamais un redépôt sans relecture.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  decisionReleveVerif, releveServiDevant, motifReleveNonPris, messageReleveNonPris,
  RELEVE_VERIF_DECLENCHEUR, RELEVE_NON_PRIS_MIN, RELEVE_NON_PRIS_SERVICES,
} from '../supabase/functions/_shared/releve-verif-non-pris.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const T0 = Date.parse('2026-10-26T16:08:07Z');
const min = (k) => T0 + k * 60_000;
const run = { id: '16031563-6983-4d1e-9fb7-9e9ece0d4c3d', status: 'queued', queued_at: new Date(T0).toISOString() };

// 1. Qui passe devant.
ok(RELEVE_VERIF_DECLENCHEUR === 'serveur:verif_redepot', 'déclencheur de la vérification');
ok(releveServiDevant('serveur:verif_redepot') && !releveServiDevant('bouton') && !releveServiDevant('cron') && !releveServiDevant(null), 'seule la vérification avant redépôt passe devant');

// 2. Le cas Johan, rejoué : servi à 16:24, 16:53, 17:10 (UTC) sans être pris.
let d = decisionReleveVerif({ run, servi: false, suivi: null, maintenant: T0 });
ok(d.action === 'attendre' && d.suivi?.run === run.id && d.suivi.services === 0, 'posé, pas encore servi : on attend (suivi ouvert)');
d = decisionReleveVerif({ run, servi: true, suivi: d.suivi, maintenant: min(16) });
ok(d.action === 'attendre' && d.suivi.services === 1, '1er service : on attend');
d = decisionReleveVerif({ run, servi: true, suivi: d.suivi, maintenant: min(45) });
ok(d.action === 'attendre' && d.suivi.services === 2, '2e service : on attend encore');
const avant3 = d.suivi;
d = decisionReleveVerif({ run, servi: true, suivi: d.suivi, maintenant: min(62) });
ok(d.action === 'relancer' && d.suivi.services === RELEVE_NON_PRIS_SERVICES, `3 services en ${RELEVE_NON_PRIS_MIN}+ min sans prise : RELANCÉ`);
ok(avant3.services === 2, 'le suivi précédent n’est jamais muté');

// 3. Pas de relance trop tôt : 3 services en moins de 20 min (poste éveillé qui enchaîne les polls).
let e = decisionReleveVerif({ run, servi: true, suivi: null, maintenant: T0 });
e = decisionReleveVerif({ run, servi: true, suivi: e.suivi, maintenant: min(2) });
e = decisionReleveVerif({ run, servi: true, suivi: e.suivi, maintenant: min(4) });
ok(e.action === 'attendre', '3 services en 4 min : on laisse le poste la prendre');

// 4. Un poste ABSENT n'avance rien : seuls les services comptent.
let f = decisionReleveVerif({ run, servi: false, suivi: null, maintenant: T0 });
for (let k = 1; k <= 10; k++) f = decisionReleveVerif({ run, servi: false, suivi: f.suivi, maintenant: min(30 * k) });
ok(f.action === 'attendre' && f.suivi.services === 0, 'jamais servie (Chrome fermé) : rien ne bouge, la borne de 6 h reste le filet');
const fSansChangement = decisionReleveVerif({ run, servi: false, suivi: f.suivi, maintenant: min(400) });
ok(fSansChangement.suivi === f.suivi, 'non servie : suivi identique (aucune réécriture)');

// 5. La relance non prise à son tour : la personne.
const suiviRelance = { run: 'neuf', premier_service: null, services: 0, relances: 1 };
const run2 = { id: 'neuf', status: 'queued' };
let g = decisionReleveVerif({ run: run2, servi: true, suivi: suiviRelance, maintenant: min(70) });
g = decisionReleveVerif({ run: run2, servi: true, suivi: g.suivi, maintenant: min(85) });
g = decisionReleveVerif({ run: run2, servi: true, suivi: g.suivi, maintenant: min(95) });
ok(g.action === 'personne' && g.suivi.relances === 1, 'la relance non prise non plus : dite à la personne (needs_user)');

// 6. Pris (running) ou disparu : on attend, jamais de relance ni de needs_user.
ok(decisionReleveVerif({ run: { ...run, status: 'running' }, servi: false, suivi: d.suivi, maintenant: min(300) }).action === 'attendre', 'relevé en cours : on attend sa fin');
ok(decisionReleveVerif({ run: null, servi: false, suivi: d.suivi, maintenant: min(300) }).action === 'attendre', 'sans relevé en file : la garde en repose un (chemin existant)');
const autreRun = decisionReleveVerif({ run: { id: 'autre', status: 'queued' }, servi: true, suivi: { run: run.id, services: 9, premier_service: new Date(T0).toISOString(), relances: 1 }, maintenant: min(300) });
ok(autreRun.suivi.run === 'autre' && autreRun.suivi.services === 1 && autreRun.suivi.relances === 1, 'un autre relevé : le compte repart, les relances restent');

// 7. Les textes.
ok(/\[non pris\] relevé de vérification servi 3 fois/.test(motifReleveNonPris({ services: 3, premier_service: new Date(Date.now() - 25 * 60_000).toISOString() }, 'relancé')), 'motif du relevé clos');
const msg = messageReleveNonPris('Leboncoin', 'Jean Lee Carol Western Gris Anthracite / Noir Délavé - Taille W24 L31');
ok(/« Jean Lee Carol Western/.test(msg) && /si elle y est, il n'y a rien à faire/.test(msg) && /relance la republication d'un clic/.test(msg), 'message à la personne : le titre, quoi regarder, quoi faire');
ok(!/doublon/i.test(msg) || /en double/.test(msg), 'message en mots simples');

// 8. Câblage — get-pending-jobs.
const gpj = readFileSync(new URL('../supabase/functions/get-pending-jobs/index.ts', import.meta.url), 'utf8');
ok(/from "\.\.\/_shared\/releve-verif-non-pris\.js"/.test(gpj), 'gpj importe la règle');
ok(/devant: releveServiDevant\(c\.declencheur\)/.test(gpj), 'les relevés servis portent `devant`');
ok(/declencheur: String\(c\.declencheur \?\? ""\)/.test(gpj), 'et leur déclencheur');
ok(/decisionReleveVerif\(\{/.test(gpj) && /syncCommandsAnnonces\.some\(\(c\) => c\.id === String\(verifEnFile\.id\)\)/.test(gpj), 'seuls les passages qui SERVENT la relecture comptent');
ok(/\.eq\("id", String\(verifEnFile\.id\)\)\.eq\("status", "queued"\)/.test(gpj), 'le relevé non pris est clos en compare-and-swap (queued seulement)');
ok(/needsUser\(messageReleveNonPris\(nomPf, j\.title\), \{ verdict: "releve_non_pris"/.test(gpj), 'needs_user avec le message dit');
ok(/personnePublie = out\.length > 0 \|\| syncCommandsAnnonces\.some\(\(c\) => c\.devant\)/.test(gpj), 'aucune lecture de fond Vinted devant une relecture');
ok(/LECTURE_FOND_BEEBS_VERSION_MIN\)\s*\n?\s*&& !syncCommandsAnnonces\.some\(\(c\) => c\.devant\)/.test(gpj.replace(/\r/g, '')), 'ni Beebs');
ok(/RELEVE_ATTENTE_MAX_H = 6/.test(gpj), 'la borne de 6 h reste le dernier filet (poste absent)');
// Jamais de redépôt sans relecture : la seule sortie « servi » reste le verdict « aucune » d'un relevé complet postérieur.
ok(/if \(juge\.verdict === "aucune"\)/.test(gpj) && /retirerDeLaFile\.add\(idJ\); \/\/ retenu par défaut/.test(gpj), 'retenu par défaut ; seul « aucune » d’un relevé complet rend le job à la file');

// 9. Câblage — extension (≥ 0.6.148).
const bg = readFileSync(new URL('../chrome-extension/background.js', import.meta.url), 'utf8');
const debutCycle = bg.indexOf('async function pollAndProcessJobsUnlocked()');
const iRelecture = bg.indexOf('const relecturesDevant = commandesAnnoncesEnAttente.filter((c) => c?.devant === true', debutCycle);
const iBoucle = bg.indexOf('for (let i = 0; i < jobs.length; i++)', debutCycle);
const iOrigine = bg.indexOf('let lectureOrigineDevant = false;', debutCycle);
ok(iRelecture > debutCycle && iRelecture < iOrigine && iOrigine < iBoucle, 'la relecture part en tête de cycle, avant la lecture d’origine et les tâches');
ok(/lancerRelevePlateforme\(\{ platform: cmd\.platform, declencheur: "serveur", runId: cmd\.id \}\)/.test(bg), 'par le chemin ordinaire (commande réclamée en base)');
ok(/commandesAnnoncesEnAttente = commandesAnnoncesEnAttente\.filter\(\(c\) => !relecturesDevant\.includes\(c\)\)/.test(bg), 'jamais deux fois (retirée de la fin de cycle)');
ok(/relecturesDevant\.length\) \{[\s\S]{0,900}repollApresCycle = true;/.test(bg), 'un poll repart après le cycle : le serveur juge tout de suite');
ok(/let pollEnAttenteDuVerrou = null;/.test(bg) && /if \(pollEnAttenteDuVerrou\) return pollEnAttenteDuVerrou;/.test(bg), 'un seul poll en attente du verrou (plus d’empilement par l’alarme)');
ok(/withJobFlowLock\("poll", \(\) => \{ pollEnAttenteDuVerrou = null; return pollAndProcessJobsUnlocked\(\); \}\)/.test(bg), 'le poll libère sa place en DÉMARRANT (le suivant peut se mettre en file pendant qu’il tourne)');
ok(/pollEnAttenteDuVerrou = suite;\s*\n\s*return suite;/.test(bg.replace(/\r/g, '')), 'la promesse rendue est celle de la fin de cycle (relevés, sync distante)');
const manifest = JSON.parse(readFileSync(new URL('../chrome-extension/manifest.json', import.meta.url), 'utf8'));
ok(manifest.version === '0.6.148' || manifest.version.localeCompare('0.6.148', undefined, { numeric: true }) > 0, 'extension ≥ 0.6.148');

console.log(`✓ selftest:releve-verif-non-pris — ${n} assertions`);
