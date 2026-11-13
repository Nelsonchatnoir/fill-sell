// ═══════════════════════════════════════════════════════════════════════════
// UNE ACTION RÉUSSIE PROUVE LA CONNEXION (13/11, 2e réponse de Nico — lot du 13/11, DET)
// `npm run selftest:action-reussie-session-vue`
// ═══════════════════════════════════════════════════════════════════════════
// Nico : « une action réussie sur une plateforme (vente lue, publication, relevé) prouve la connexion et compte comme
// session vue ; jamais de « pas connecté » affiché à quelqu'un qui vient de réussir une action ; verrou qui casse si ce
// cas revient. » Et : « Les 52 comptes sans plateforme choisie : oui, les plateformes qu'ils utilisent comptent comme
// choisies. »
// Cas RÉELS (id8 de compte, faits lus en base le 13/11 en lecture seule — horodatages UTC tels quels) :
//   ed4531e2 — inscrit le 18/10 12:12:40, Vinted seul ; publications Vinted réussies 18/10 12:21:43 et 12:29:40 ; ventes
//              Vinted lues 18/10 12:42:52 (2) et 22/10 16:16:01 (2) ; sonde 403 (jamais `true`) ; 11/11 lecture 400.
//              AVANT : aucune première synchro ; « pas encore vue » dès le 21/10.
//   ff1f879f — Vinted jamais connecté (ventes 400 seulement) : la règle n'invente RIEN.
//   1f95f334 — Vinted 400 partout (rien d'inventé) ; Depop et Leboncoin : ventes lues (motif vide).
//   7d64bf87 — Vinted 400/403, Leboncoin « jeton_absent » : rien d'inventé.
//   7e436336 — SANS plateforme choisie ; Depop : relevé fait 11/11 22:04:03, vente lue 11/11 22:04:08, sonde « sans_jeton »
//              12/11 21:37:18, relevé tombé sur la connexion 12/11 22:04:33 (une ACTION ratée).
//   b0cb8def — SANS plateforme choisie ; Vinted utilisé (annonces, relevés) dont le dernier relevé est tombé sur le mur
//              « [pas_connecte] [cause403] session_absente » (06/11 09:31:46) ; eBay jamais utilisé (sonde false).
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => (existsSync(join(RACINE, p)) ? readFileSync(join(RACINE, p), 'utf8').replace(/\r\n/g, '\n') : '');
let verts = 0, rouges = 0;
const ok = (c, msg, d = '') => { if (c) { verts++; console.log(`  ok   ${msg}`); } else { rouges++; console.log(`  RATÉ ${msg}${d ? `  ← ${d}` : ''}`); } };
const importer = async (p) => { try { return await import(pathToFileURL(join(RACINE, p)).href); } catch (e) { console.log(`  (import ${p} : ${String(e?.message ?? e).slice(0, 140)})`); return null; } };
const fn = (m, n) => (m && typeof m[n] === 'function' ? m[n] : () => { throw new Error(`${n} absente`); });
const essai = (f) => { try { return f(); } catch (e) { return { erreur: String(e?.message ?? e) }; } };
const T = (s) => Date.parse(s);

const A = await importer('supabase/functions/_shared/preuve-action.js');
const P = await importer('supabase/functions/_shared/premiere-synchro.js');
const C = await importer('src/plateformes/connexionChoisie.js');
const S = await importer('src/utils/sessionsPlateformes.js');

// ── Les lignes RÉELLES lues en base (usage_logs releve_ventes, cross_post_jobs, vinted_sync_runs) ──────────────────────
const vente = (created_at, plateforme, motif, lues) => ({ feature: 'releve_ventes', created_at, metadata: { plateforme, motif, lues } });
const ED_VENTES = [
  vente('2026-10-18T12:42:52.970Z', 'vinted', null, 2), vente('2026-10-18T12:43:00.738Z', 'leboncoin', 'jeton_absent', 0),
  vente('2026-10-22T16:16:01.575Z', 'vinted', null, 2), vente('2026-10-22T16:16:09.096Z', 'leboncoin', 'jeton_absent', 0),
  vente('2026-11-11T20:26:08.067Z', 'vinted', 'http_400', 0), vente('2026-11-11T20:26:34.148Z', 'leboncoin', 'jeton_absent', 0),
];
const ED_JOBS = [
  { platform: 'vinted', action: 'publish', status: 'published', published_at: '2026-10-18T12:21:43.592Z', handler_build: '2026-10-17T23:03:01Z+9d11d42 · v0.6.125' },
  { platform: 'vinted', action: 'publish', status: 'published', published_at: '2026-10-18T12:29:40.569Z', handler_build: '2026-10-17T23:03:01Z+9d11d42 · v0.6.125' },
];
const FF_VENTES = [vente('2026-11-13T01:08:16.299Z', 'vinted', 'http_400', 0), vente('2026-11-13T01:08:59.547Z', 'leboncoin', null, 28)];
const FF_JOBS = Array.from({ length: 3 }, () => ({ platform: 'leboncoin', action: 'publish', status: 'published', published_at: '2026-11-13T01:00:34.750Z', handler_build: 'releve-annonces' }));
const F1_VENTES = [
  vente('2026-11-12T15:54:27.662Z', 'vinted', 'http_400', 0), vente('2026-11-12T15:54:31.742Z', 'leboncoin', '', 0),
  vente('2026-11-12T15:54:37.923Z', 'depop', '', 1), vente('2026-11-10T18:42:43.093Z', 'depop', 'session_illisible_reseau', 0),
];
const D7_VENTES = [
  vente('2026-11-13T01:17:30.845Z', 'vinted', 'http_400', 0), vente('2026-11-13T01:18:51.936Z', 'leboncoin', 'jeton_absent', 0),
  vente('2026-11-10T19:57:49.559Z', 'vinted', 'http_403', 0),
];
const E7_VENTES = [vente('2026-11-11T22:04:08.521Z', 'depop', '', 1), vente('2026-11-12T22:04:36.556Z', 'vinted', '', 3)];
const E7_RUNS = [{ kind: 'annonces', platform: 'depop', status: 'done', items_vus: 11, finished_at: '2026-11-11T22:04:03.734Z' }];
const RETRAIT_DEJA_HORS_LIGNE = { platform: 'leboncoin', action: 'delete', status: 'deleted', created_at: '2026-11-13T08:04:34.788Z', platform_fields: { retrait_par: 'annonce_deja_hors_ligne', processing_since: '2026-11-13T08:06:14.293Z' } };
const RETRAIT_FAIT = { platform: 'vinted', action: 'delete', status: 'deleted', created_at: '2026-11-13T07:59:00.048Z', platform_fields: { retrait_par: 'fillsell', processing_since: '2026-11-13T08:01:14.008Z' } };

const preuves = (o) => essai(() => fn(A, 'preuvesActionReussie')(o));

console.log('1. Les preuves : une action RÉUSSIE, jamais un refus ni un import');
{
  const p = preuves({ ventes: ED_VENTES, jobs: ED_JOBS, maintenant: T('2026-10-22T16:30:00Z') });
  ok(p?.vinted?.source === 'vente' && p.vinted.le === T('2026-10-22T16:16:01.575Z'), 'ed4531e2 : la vente Vinted lue le 22/10 16:16 est la dernière preuve', JSON.stringify(p));
  ok(!p?.leboncoin, 'ed4531e2 : Leboncoin « jeton_absent » ne prouve rien', JSON.stringify(p?.leboncoin));
  const p18 = preuves({ ventes: [], jobs: ED_JOBS, maintenant: T('2026-10-18T12:30:00Z') });
  ok(p18?.vinted?.source === 'depot' && p18.vinted.le === T('2026-10-18T12:29:40.569Z'), 'ed4531e2 : la publication Vinted réussie du 18/10 12:29 est une preuve', JSON.stringify(p18));
  const ff = preuves({ ventes: FF_VENTES, jobs: FF_JOBS, maintenant: T('2026-11-13T01:10:00Z') });
  ok(!ff?.vinted && ff?.leboncoin?.source === 'vente', 'ff1f879f : Vinted (400 « user_login_required ») ne prouve rien ; Leboncoin (28 ventes lues) oui ; les imports d’un relevé ne sont pas des dépôts', JSON.stringify(ff));
  const f1 = preuves({ ventes: F1_VENTES, maintenant: T('2026-11-12T16:00:00Z') });
  ok(!f1?.vinted && f1?.depop?.le === T('2026-11-12T15:54:37.923Z') && f1?.leboncoin?.le === T('2026-11-12T15:54:31.742Z'), '1f95f334 : Vinted 400 rien ; Depop (1 vente) et Leboncoin (lecture sans motif, 0 vente) prouvent', JSON.stringify(f1));
  const d7 = preuves({ ventes: D7_VENTES, maintenant: T('2026-11-13T02:00:00Z') });
  ok(d7 && !d7.erreur && Object.keys(d7).length === 0, '7d64bf87 : 400, 403, « jeton_absent » : aucune preuve', JSON.stringify(d7));
  const r = preuves({ jobs: [RETRAIT_DEJA_HORS_LIGNE, RETRAIT_FAIT], maintenant: T('2026-11-13T09:00:00Z') });
  ok(r?.vinted?.source === 'retrait' && !r?.leboncoin, 'retrait fait PAR FillSell = preuve ; « annonce déjà hors ligne » = rien', JSON.stringify(r));
  const vieux = preuves({ ventes: ED_VENTES, jobs: ED_JOBS, maintenant: T('2026-11-25T00:00:00Z') });
  ok(vieux && !vieux.erreur && !vieux.vinted, 'au-delà de 30 jours : plus de preuve (la vérité d’avant reprend)', JSON.stringify(vieux));
}

console.log('\n2. La première synchro : une action réussie de moins de 24 h compte comme session vue');
{
  const ps = (o) => essai(() => fn(P, 'premiereSynchroAPoser')(o));
  const pv = (ventes, jobs, maintenant) => essai(() => fn(A, 'preuvesActionReussie')({ ventes, jobs, maintenant }));
  const ed = { inscritLe: '2026-10-18T12:12:40.034Z', platformSettings: { plateformes_vendeur: ['vinted'], plateformes_ecartees: ['ebay', 'leboncoin', 'beebs'] }, sessions: { vinted: null, http: { vinted: 403 } }, runs: [] };
  const m1 = T('2026-10-18T12:30:00Z');
  const r1 = ps({ ...ed, maintenant: m1, preuves: pv([], ED_JOBS, m1) });
  ok(Array.isArray(r1) && r1.join() === 'vinted', 'ed4531e2, 18/10 12:30 (publication réussie 12:29, sonde 403) : sa première synchro Vinted part', JSON.stringify(r1));
  const m2 = T('2026-10-18T12:45:00Z');
  const r2 = ps({ ...ed, maintenant: m2, preuves: pv(ED_VENTES, ED_JOBS, m2) });
  ok(Array.isArray(r2) && r2.join() === 'vinted', 'ed4531e2, 18/10 12:45 (vente lue 12:42) : idem', JSON.stringify(r2));
  const m3 = T('2026-10-20T12:30:00Z');
  const r3 = ps({ ...ed, maintenant: m3, preuves: pv(ED_VENTES, ED_JOBS, m3) });
  ok(Array.isArray(r3) && r3.length === 0, 'ed4531e2, 20/10 (dernière action il y a plus de 24 h) : rien — la preuve est périmée pour la première synchro', JSON.stringify(r3));
  const m4 = T('2026-10-22T16:20:00Z');
  const r4 = ps({ ...ed, maintenant: m4, preuves: pv(ED_VENTES, ED_JOBS, m4) });
  ok(Array.isArray(r4) && r4.join() === 'vinted', 'ed4531e2, 22/10 16:20 (vente lue 16:16) : la première synchro Vinted part (encore dans les 15 jours)', JSON.stringify(r4));
  const r5 = ps({ ...ed, maintenant: m4, preuves: pv(ED_VENTES, ED_JOBS, m4), dejaPosees: ['vinted'] });
  ok(Array.isArray(r5) && r5.length === 0, '… une fois : déjà posée → rien', JSON.stringify(r5));
  const page = ps({ ...ed, maintenant: m4, preuves: pv(ED_VENTES, ED_JOBS, m4), sessions: { vinted: false, http: { vinted: 'login_redirect_observee' }, checked_at_par_plateforme: { vinted: '2026-10-22T16:18:00Z' } } });
  ok(Array.isArray(page) && page.length === 0, '… mais jamais contre une page de connexion vue APRÈS l’action (tâche tombée sur la connexion)', JSON.stringify(page));
  const mff = T('2026-11-13T01:10:00Z');
  const ff = ps({ inscritLe: '2026-11-13T00:50:17.794Z', platformSettings: { plateformes_vendeur: ['vinted', 'leboncoin', 'ebay'], plateformes_ecartees: ['beebs', 'depop'] }, sessions: { vinted: null, leboncoin: true, ebay: true },
    runs: [{ kind: 'annonces', platform: 'leboncoin', status: 'done' }, { kind: 'annonces', platform: 'ebay', status: 'done' }], dejaPosees: ['leboncoin'], maintenant: mff, preuves: pv(FF_VENTES, FF_JOBS, mff) });
  ok(Array.isArray(ff) && ff.length === 0, 'ff1f879f : Vinted jamais connecté (400) → aucune première synchro inventée', JSON.stringify(ff));
  const md7 = T('2026-11-13T02:00:00Z');
  const d7 = ps({ inscritLe: '2026-10-29T01:10:05.448Z', platformSettings: { plateformes_vendeur: ['vinted', 'beebs'], plateformes_ecartees: [] }, sessions: { vinted: null, beebs: null, leboncoin: true }, runs: [], maintenant: md7, preuves: pv(D7_VENTES, [], md7) });
  ok(Array.isArray(d7) && d7.length === 0, '7d64bf87 : rien (aucune action réussie, Leboncoin pas choisi)', JSON.stringify(d7));
  const mf1 = T('2026-11-12T16:00:00Z');
  const f1 = ps({ inscritLe: '2026-11-02T11:08:01.942Z', platformSettings: { plateformes_vendeur: ['vinted', 'depop', 'ebay', 'leboncoin', 'beebs'] }, sessions: { vinted: null, depop: true, leboncoin: true, ebay: false, beebs: null },
    runs: [{ kind: 'annonces', platform: 'leboncoin', status: 'done' }], dejaPosees: ['leboncoin'], maintenant: mf1, preuves: pv(F1_VENTES, [], mf1) });
  ok(Array.isArray(f1) && f1.join() === 'depop', '1f95f334 : Depop (vu, jamais relevé) part ; Vinted (400) jamais', JSON.stringify(f1));
}

// ── La vérité serveur telle que plateformes_verite (prod, md5 ab921e54…) la rend sur ces faits, à l'heure dite ─────────
const pvx = (etat, extra = {}) => ({ etat, ...extra });
const verite = (plateformes, extension_vue_le) => ({ ok: true, calcule_le: extension_vue_le, extension_vue_le, plateformes });
// ed4531e2 le 22/10 16:30 : dépôt du 18/10 > 72 h (plus aucun fait), aucun relevé, sonde null (403) → « inconnue ».
const ED_22 = verite({
  vinted: pvx('inconnue', { motif: 'pas_encore_verifiee', declaree: true, ecartee: false, http: '403', faits: [] }),
  leboncoin: pvx('ecartee', { declaree: false, ecartee: true }), ebay: pvx('ecartee', { declaree: false, ecartee: true }),
  beebs: pvx('ecartee', { declaree: false, ecartee: true }), opla: pvx('inconnue', { declaree: false }),
}, '2026-10-22T16:29:00Z');
const ED_13 = { ...ED_22, extension_vue_le: '2026-11-11T20:26:34.513Z' };
const FF = verite({
  vinted: pvx('inconnue', { motif: 'pas_encore_verifiee', declaree: true, http: '403', faits: [] }),
  leboncoin: pvx('connectee', { source: 'releve', motif: 'releve_reussi', declaree: true, depuis: '2026-11-13T00:28:32.767Z' }),
  ebay: pvx('connectee', { source: 'api', declaree: true }), beebs: pvx('ecartee', { ecartee: true, declaree: false }), depop: pvx('ecartee', { ecartee: true, declaree: false }),
}, '2026-11-13T04:30:22.167Z');
const D7 = verite({
  vinted: pvx('inconnue', { declaree: true, http: '403', faits: [] }), beebs: pvx('inconnue', { declaree: true, http: '403', faits: [] }),
  leboncoin: pvx('connectee', { source: 'sonde', declaree: false, depuis: '2026-11-12T08:29:29.387Z' }), ebay: pvx('a_connecter', { source: 'sonde', declaree: false, action: 'relier_ebay' }),
}, '2026-11-13T09:35:30.056Z');
// 7e436336 (aucun choix) : Depop — à 12/11 21:45, le fait le plus récent est la sonde « sans_jeton » de 21:37:18 ; à 22:10,
// le relevé tombé sur la connexion de 22:04:33.
const E7 = (depop, quand) => verite({
  vinted: pvx('connectee', { source: 'sonde', declaree: false, depuis: '2026-11-12T22:07:18.686Z', faits: [{ src: 'releve', etat: 'connectee', at: '2026-11-12T21:48:23.897Z' }] }),
  leboncoin: pvx('connectee', { source: 'releve', declaree: false, depuis: '2026-11-12T22:03:19.802Z', faits: [{ src: 'releve', etat: 'connectee', at: '2026-11-12T22:03:19.802Z' }] }),
  ebay: pvx('connectee', { source: 'releve', declaree: false, depuis: '2026-11-12T22:04:29.604Z', faits: [{ src: 'releve', etat: 'connectee', at: '2026-11-12T22:04:29.604Z' }] }),
  beebs: pvx('inconnue', { declaree: false, http: '403', faits: [] }),
  depop, opla: pvx('inconnue', { declaree: false }),
}, quand);
const E7_2145 = E7(pvx('a_connecter', { source: 'sonde', motif: 'sonde_deconnectee', action: 'connexion', declaree: false, depuis: '2026-11-12T21:37:18.797Z', sonde: 'false', http: 'sans_jeton',
  faits: [{ src: 'releve', etat: 'connectee', at: '2026-11-11T22:04:03.734Z' }, { src: 'depot', etat: 'connectee', at: '2026-11-09T23:08:49.003Z' }, { src: 'sonde', etat: 'a_connecter', at: '2026-11-12T21:37:18.797Z' }] }), '2026-11-12T21:44:00Z');
const E7_2210 = E7(pvx('a_connecter', { source: 'releve', motif: 'releve_mur_connexion', action: 'connexion', declaree: false, depuis: '2026-11-12T22:04:33.961Z', sonde: 'false', http: 'sans_jeton',
  faits: [{ src: 'releve', etat: 'a_connecter', at: '2026-11-12T22:04:33.961Z' }, { src: 'depot', etat: 'connectee', at: '2026-11-09T23:08:49.003Z' }, { src: 'sonde', etat: 'a_connecter', at: '2026-11-12T21:37:18.797Z' }] }), '2026-11-12T22:07:19.189Z');
// b0cb8def (aucun choix) le 07/11 06:00 : Vinted — dernier relevé tombé sur le mur (06/11 09:31:46) ; Leboncoin relevé fait le
// 05/11 14:38 ; Beebs relevé fait + sonde true ; eBay sonde false, jamais utilisé ; Depop jamais vu.
const B0 = verite({
  vinted: pvx('a_connecter', { source: 'releve', motif: 'releve_mur_connexion', action: 'connexion', declaree: false, depuis: '2026-11-06T09:31:46.356Z', http: '403', faits: [{ src: 'releve', etat: 'a_connecter', at: '2026-11-06T09:31:46.356Z' }] }),
  leboncoin: pvx('connectee', { source: 'releve', motif: 'releve_reussi', declaree: false, depuis: '2026-11-05T14:38:18.014Z', faits: [{ src: 'releve', etat: 'connectee', at: '2026-11-05T14:38:18.014Z' }] }),
  beebs: pvx('connectee', { source: 'sonde', declaree: false, depuis: '2026-11-05T14:41:20.513Z', faits: [{ src: 'releve', etat: 'connectee', at: '2026-11-05T14:38:54.073Z' }, { src: 'sonde', etat: 'connectee', at: '2026-11-05T14:41:20.513Z' }] }),
  ebay: pvx('a_connecter', { source: 'sonde', motif: 'sonde_deconnectee', action: 'relier_ebay', declaree: false, depuis: '2026-11-06T09:20:42.008Z', faits: [{ src: 'sonde', etat: 'a_connecter', at: '2026-11-06T09:20:42.008Z' }] }),
  opla: pvx('inconnue', { declaree: false }),
}, '2026-11-07T05:26:06.639Z');

const NON_CLOUD = { compteLu: true, clientCloud: false };
const completer = (v, o) => essai(() => fn(A, 'completerVerite')(v, o));
const cc = (o) => essai(() => fn(C, 'connexionsChoisies')(o));
const etats = (r) => (r?.lignes ?? []).map((l) => `${l.p}:${l.etat}`).join(',');
const textes = (r) => (r?.lignes ?? []).map((l) => `${l.titre} ${l.texte}`).join(' | ');
// Le chemin de l'app et du popup : la vérité lue, complétée par les preuves, puis la règle des plateformes choisies.
const afficher = (v, { ventes = [], jobs = [], runs = [], annonces = [], maintenant, sondeMotif = null, utilisees = null }) => {
  const p = preuves({ ventes, jobs, runs, maintenant });
  const u = utilisees ?? essai(() => fn(A, 'plateformesUtilisees')({ verite: v, preuves: p, runs, annonces }));
  const w = completer(v, { preuves: p, utilisees: Array.isArray(u) ? u : null, maintenant });
  return { w, r: cc({ verite: w, cloud: NON_CLOUD, sondeMotif }) };
};

console.log('\n3. Jamais « pas connecté » (ni « pas encore vue ») à qui vient de réussir une action');
{
  const avant = cc({ verite: ED_22, cloud: NON_CLOUD });
  ok(etats(avant) === 'vinted:pas_vue', '(rappel : la vérité seule dit « pas encore vue » à ed4531e2 le 22/10 16:30)', etats(avant));
  const { w, r } = afficher(ED_22, { ventes: ED_VENTES, jobs: ED_JOBS, maintenant: T('2026-10-22T16:30:00Z') });
  ok(etats(r) === '' && w?.plateformes?.vinted?.etat === 'connectee', 'ed4531e2, 22/10 16:30 (vente lue 14 min avant) : Vinted CONNECTÉE, aucune ligne', `${etats(r)} ${JSON.stringify(w?.plateformes?.vinted ?? w)}`);
  const m = afficher(ED_22, { ventes: ED_VENTES, jobs: ED_JOBS, maintenant: T('2026-10-22T16:30:00Z'), sondeMotif: { vinted: 'pas_connecte' } });
  ok(etats(m.r) === '' && m.r?.lu === true && m.w?.plateformes?.vinted?.etat === 'connectee', '… même quand la sonde 0.6.187 classe son 403 « pas connecté » : silence', etats(m.r));
  const ap = afficher(ED_13, { ventes: ED_VENTES, jobs: ED_JOBS, maintenant: T('2026-11-13T09:00:00Z') });
  ok(etats(ap.r) === '' && ap.w?.plateformes?.vinted?.etat === 'a_verifier', 'ed4531e2, 13/11 (dernière vente lue le 22/10) : « à vérifier » (silence), jamais « pas encore vue » — la 400 du 11/11 ne prouve rien', `${etats(ap.r)} ${ap.w?.plateformes?.vinted?.etat}`);
  // Popup (0.6.187) : « Pas encore connecté à FillSell » = état « inconnue » ET déclarée — la vérité complétée ne l'est plus.
  ok(Boolean(ap.w?.plateformes?.vinted?.etat) && Boolean(w?.plateformes?.vinted?.etat) && ap.w.plateformes.vinted.etat !== 'inconnue' && w.plateformes.vinted.etat !== 'inconnue', 'ed4531e2 : le popup (vérité servie par get-pending-jobs, complétée) ne dit plus « Pas encore connecté à FillSell »');
  // Balayage : chaque instant des 24 h qui suivent chaque action réussie, sonde muette ou classée « pas connecté ».
  let fautes = [];
  for (const a of [...ED_JOBS.map((j) => T(j.published_at)), T('2026-10-18T12:42:52.970Z'), T('2026-10-22T16:16:01.575Z')]) {
    for (let h = 0; h < 24; h += 0.5) {
      const maintenant = a + h * 3600_000;
      for (const sm of [null, { vinted: 'pas_connecte' }, { vinted: 'anti_robot' }]) {
        const x = afficher(ED_22, { ventes: ED_VENTES.filter((v) => T(v.created_at) <= maintenant), jobs: ED_JOBS.filter((j) => T(j.published_at) <= maintenant), maintenant, sondeMotif: sm });
        if (x.r?.lu !== true || !x.w?.preuves_action || /vinted:(pas_vue|deconnectee)/.test(etats(x.r))) fautes.push(new Date(maintenant).toISOString());
      }
    }
  }
  ok(fautes.length === 0, 'ed4531e2 : balayage des 24 h après chacune de ses 4 actions réussies (144 instants × 3 sondes) : jamais « pas connecté » ni « pas encore vue »', fautes.slice(0, 3).join(', '));
}
{
  const g = afficher(E7_2145, { ventes: E7_VENTES, runs: E7_RUNS, maintenant: T('2026-11-12T21:45:00Z') });
  ok(!/depop:(deconnectee|pas_vue)/.test(etats(g.r)) && g.w?.plateformes?.depop?.etat === 'connectee', '7e436336, 12/11 21:45 : la sonde Depop « sans_jeton » (21:37) arrive 23 h 33 après la vente lue → la GARDE de 24 h : connectée, pas de « pas connecté »', `${etats(g.r)} ${g.w?.plateformes?.depop?.etat}`);
  const r = afficher(E7_2210, { ventes: E7_VENTES, runs: E7_RUNS, maintenant: T('2026-11-12T22:10:00Z') });
  ok(etats(r.r) === 'depop:deconnectee', '7e436336, 12/11 22:10 : le RELEVÉ est tombé sur la connexion (22:04, une action ratée plus récente) → « pas connecté », son vrai message', etats(r.r));
  const tard = afficher(E7_2145, { ventes: E7_VENTES, runs: E7_RUNS, maintenant: T('2026-11-12T22:05:00Z') });
  ok(tard.w?.plateformes?.depop?.etat === 'a_connecter', '… et au-delà de 24 h après la dernière action réussie, la sonde retrouve sa voix (22:05 : 24 h 01 après la vente)', tard.w?.plateformes?.depop?.etat);
  const pageVue = { ...E7_2145, plateformes: { ...E7_2145.plateformes, depop: { ...E7_2145.plateformes.depop, http: 'login_redirect_observee' } } };
  const pv = afficher(pageVue, { ventes: E7_VENTES, runs: E7_RUNS, maintenant: T('2026-11-12T21:45:00Z') });
  ok(pv.w?.plateformes?.depop?.etat === 'a_connecter', 'une PAGE de connexion vue pendant une tâche (après l’action) n’est pas une sonde : elle garde « à connecter »', pv.w?.plateformes?.depop?.etat);
}
{
  const ff = afficher(FF, { ventes: FF_VENTES, jobs: FF_JOBS, maintenant: T('2026-11-13T06:00:00Z') });
  ok(etats(ff.r) === 'vinted:pas_vue', 'ff1f879f : Vinted jamais connecté (400) → « pas encore vue » reste (rien d’inventé)', etats(ff.r));
  const d7 = afficher(D7, { ventes: D7_VENTES, maintenant: T('2026-11-13T09:40:00Z') });
  ok(etats(d7.r) === 'vinted:pas_vue,beebs:pas_vue', '7d64bf87 : Vinted et Beebs restent « pas encore vues »', etats(d7.r));
}

console.log('\n4. Comptes SANS plateforme choisie : les plateformes UTILISÉES comptent comme choisies');
{
  const avant = cc({ verite: E7_2210, cloud: NON_CLOUD });
  ok(etats(avant) === '' && (avant?.choisies ?? []).length === 0, '(rappel : sans choix, la règle ne voyait AUCUNE plateforme)', `${etats(avant)} ${JSON.stringify(avant?.choisies)}`);
  const e7 = afficher(E7_2210, { ventes: E7_VENTES, runs: E7_RUNS, maintenant: T('2026-11-12T22:10:00Z') });
  ok(etats(e7.r) === 'depop:deconnectee', '7e436336 : Depop UTILISÉ (relevés, ventes) et tombé sur la connexion → sa ligne ; Beebs jamais utilisée → rien', etats(e7.r));
  ok(['vinted', 'leboncoin', 'ebay', 'depop'].every((p) => e7.r?.choisies?.includes(p)) && !e7.r?.choisies?.includes('beebs'), '7e436336 : choisies = Vinted, Leboncoin, eBay, Depop (utilisées) ; jamais Beebs', JSON.stringify(e7.r?.choisies));
  ok(e7.w?.plateformes?.depop?.choisie_par === 'utilisation', '… marquées « choisie par l’utilisation » (platform_settings jamais écrit)', JSON.stringify(e7.w?.plateformes?.depop?.choisie_par));
  // Lu en base : b0cb8def a des annonces Vinted publiées (dernier dépôt le 17/09) — c'est ce qui en fait une plateforme utilisée.
  const b0 = afficher(B0, { maintenant: T('2026-11-07T06:00:00Z'), annonces: [{ platform: 'vinted', status: 'published' }] });
  ok(etats(b0.r) === 'vinted:deconnectee', 'b0cb8def : Vinted utilisé, dernier relevé sur le mur → « pas connecté » ; eBay (sonde false, jamais utilisé) → rien ; Leboncoin et Beebs connectés → rien', etats(b0.r));
}

console.log('\n5. Les lecteurs : app, popup, première synchro — tous passent par la règle');
{
  const vp = lire('src/utils/veritePlateformes.js');
  ok(/completerVeriteLue/.test(vp) && /preuve-action\.js/.test(vp), 'app : lireVeritePlateformes complète la vérité (Tableau, Stock, Réglages, stepper, lot)', 'completerVeriteLue absent de src/utils/veritePlateformes.js');
  const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
  const iCtx = gpj.indexOf('await userClient.rpc("plateformes_verite")');
  ok(iCtx > 0 && /completerVeriteLue\(userClient, /.test(gpj.slice(iCtx, iCtx + 1500)), 'popup : la vérité servie par get-pending-jobs est complétée');
  const iPs = gpj.indexOf('LA PREMIÈRE SYNCHRO PART SEULE');
  const bloc = gpj.slice(iPs, iPs + 9000);
  ok(/lirePreuvesAction\(/.test(bloc) && /preuves/.test(bloc) && /GARDE_ACTION_MS/.test(bloc), 'première synchro : get-pending-jobs lit les actions réussies (24 h) des plateformes sans session vue');
  // La lecture elle-même (client de la personne, RLS) : un faux client qui rend les lignes réelles d'ed4531e2.
  if (A && typeof A.lirePreuvesAction === 'function') {
    const tables = {
      usage_logs: ED_VENTES.map((v) => ({ user_id: 'ed4531e2', ...v })),
      cross_post_jobs: ED_JOBS.map((j) => ({ user_id: 'ed4531e2', ...j, created_at: j.published_at })),
      vinted_sync_runs: [],
    };
    const lus = { n: 0 };
    const res = await A.lirePreuvesAction(fauxClient(tables, lus), { userId: 'ed4531e2', plateformes: ['vinted'], maintenant: T('2026-10-22T16:30:00Z') });
    ok(res?.preuves?.vinted?.source === 'vente' && lus.n <= 3, `lecture des preuves : la vente du 22/10 trouvée en ${lus.n} requête(s) bornée(s)`, JSON.stringify(res?.preuves));
    const v = await A.completerVeriteLue(fauxClient(tables, lus), ED_22, { userId: 'ed4531e2', maintenant: T('2026-10-22T16:30:00Z') });
    ok(v?.plateformes?.vinted?.etat === 'connectee', 'completerVeriteLue (ce que l’app et le popup appellent) : ed4531e2 connectée', JSON.stringify(v?.plateformes?.vinted));
    const n0 = lus.n;
    await A.completerVeriteLue(fauxClient(tables, lus), { ...ED_22, preuves_action: true }, { userId: 'ed4531e2' });
    ok(lus.n === n0, 'une vérité serveur qui applique déjà la règle (migration) : AUCUNE lecture de plus');
  } else ok(false, 'lirePreuvesAction absente');
}

console.log('\n6. « Session » des écrans du Stock (utils/sessionsPlateformes) : la même garde');
{
  const es = (s, pf, pub, now) => { const vrai = Date.now; Date.now = () => now; try { return fn(S, 'etatSession')(s, pf, pub); } catch (e) { return String(e.message); } finally { Date.now = vrai; } };
  const s = { depop: false, http: { depop: 'sans_jeton' }, checked_at_par_plateforme: { depop: '2026-11-12T21:37:18.797Z' } };
  ok(es(s, 'depop', T('2026-11-11T22:04:08.521Z'), T('2026-11-12T21:45:00Z')) === 'ok', '7e436336 : une sonde « false » (sans_jeton) 23 h 33 après une action réussie ne dit pas « pas connecté »', es(s, 'depop', T('2026-11-11T22:04:08.521Z'), T('2026-11-12T21:45:00Z')));
  ok(es(s, 'depop', T('2026-11-09T23:08:49.003Z'), T('2026-11-12T21:45:00Z')) === 'ko', '… mais la même sonde après une publication de 70 h : « ko » (inchangé)');
  const page = { ...s, http: { depop: 'login_redirect_observee' } };
  ok(es(page, 'depop', T('2026-11-11T22:04:08.521Z'), T('2026-11-12T21:45:00Z')) === 'ko', '… et une page de connexion vue pendant une tâche reste « ko »');
}

console.log('\n7. La vérité serveur elle-même : migration PRÉPARÉE (jamais appliquée ici)');
{
  const mig = readdirSync(join(RACINE, 'supabase/migrations')).find((f) => /_plateformes_verite_action_reussie\.sql$/.test(f));
  const sql = mig ? lire(`supabase/migrations/${mig}`) : '';
  ok(Boolean(mig), 'migration plateformes_verite « action réussie = session vue » présente', 'absente');
  ok(/ab921e5456a2f763c77b5b3ff4921506/.test(sql), '… gardée par le md5 de la définition de prod lue le 13/11');
  ok(/releve_ventes/.test(sql) && /retrait_par/.test(sql) && /login_redirect_observee/.test(sql) && /'preuves_action', true/.test(sql) && /interval '24 hours'/.test(sql), '… vente lue, retrait fait, garde de 24 h, page de connexion, marque `preuves_action`');
  ok(mig && existsSync(join(RACINE, `supabase/rollbacks/${mig.replace(/\.sql$/, '_INVERSE.sql')}`)), '… son inverse');
  ok(mig && existsSync(join(RACINE, `scripts/essais/${mig.split('_')[0]}_banc.mjs`)), '… son banc sur une base jetable');
}

function fauxClient(tables, compteur) {
  const dig = (o, path) => path.split('->>').reduce((x, k, i) => (x == null ? x : i === 0 ? x[k] : (typeof x === 'object' ? x[k] : undefined)), o);
  return {
    from(t) {
      let rows = (tables[t] ?? []).slice();
      let cols = null; let lim = Infinity;
      const q = {
        select(s) { cols = s.split(',').map((c) => c.trim()).map((c) => { const i = c.indexOf(':'); return i > 0 && !c.slice(0, i).includes('-') ? [c.slice(0, i), c.slice(i + 1)] : [c, c]; }); return q; },
        eq(c, v) { rows = rows.filter((r) => String(dig(r, c)) === String(v)); return q; },
        in(c, vs) { rows = rows.filter((r) => vs.map(String).includes(String(dig(r, c)))); return q; },
        gte(c, v) { rows = rows.filter((r) => Date.parse(dig(r, c)) >= Date.parse(v)); return q; },
        or(s) { const conds = s.split(',').map((x) => x.split('.')); rows = rows.filter((r) => conds.some(([c, op, ...v]) => (op === 'is' ? dig(r, c) == null : op === 'neq' ? dig(r, c) !== v.join('.') : false))); return q; },
        order(c, { ascending } = {}) { rows.sort((a, b) => (Date.parse(dig(a, c)) - Date.parse(dig(b, c))) * (ascending ? 1 : -1)); return q; },
        limit(n) { lim = n; return q; },
        then(res, rej) {
          compteur.n++;
          const data = rows.slice(0, lim).map((r) => (cols ? Object.fromEntries(cols.map(([a, p]) => [a, p.includes('->>') ? dig(r, p.replace(/^(\w+)->>/, '$1->>')) : r[p]])) : r));
          return Promise.resolve({ data, error: null }).then(res, rej);
        },
      };
      return q;
    },
  };
}

console.log(`\n${rouges ? `✗ ${rouges} RATÉ(S)` : '✓ tout est vert'} — ${verts} vérifications`);
process.exit(rouges ? 1 : 0);
