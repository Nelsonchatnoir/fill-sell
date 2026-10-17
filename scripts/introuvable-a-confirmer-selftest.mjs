// selftest:introuvable-a-confirmer — (15/10, point 14, DeadRoz) une lecture
// « plus en ligne » ne vaut jamais un verdict : pause, puis reprise ou clôture
// sur la preuve d'un relevé. Zéro régression sur une vraie disparition.
// (17/10) La preuve porte sur l'annonce EXACTE (jamais la fiche du job), et
// l'absence sur DEUX relevés complets, non vides, de sa boutique Vinted.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  decisionIntrouvable as d, marqueIntrouvable, messagePause, messageDisparueConfirmee, MAX_REPRISES_INTROUVABLE,
  identifiantAnnonceJob, releveComplet, RELEVES_POUR_DISPARITION,
} from '../supabase/functions/_shared/introuvable-a-confirmer.js';
import { classerEchec } from '../supabase/functions/_shared/pas-de-rouge.js';

let n = 0; const ok = (c, m, x) => { assert.ok(c, m + (x === undefined ? '' : ` — ${JSON.stringify(x)}`)); n++; };
const LU = '2026-10-15T11:52:09.821Z'; // 13:52 Paris, la première lecture 404 chez DeadRoz
const BOUTIQUE = '127239260';
const job = (platform = 'vinted', extra = {}, top = {}) => ({
  platform,
  ...(platform === 'vinted' ? { listing_url: 'https://www.vinted.fr/items/9593096526' } : { platform_listing_id: '3279404062' }),
  ...top,
  platform_fields: {
    ...(platform === 'vinted' ? { vinted_item_id: '9593096526', vinted_account_id: BOUTIQUE } : {}),
    ...marqueIntrouvable({}, { platform, lecture: 'item_upload_404', at: LU }),
    ...extra,
  },
});
// Un relevé du dressing COMPLET de la boutique (forme vinted_sync_runs).
const releve = (debut, extra = {}) => {
  const t0 = Date.parse(debut);
  return { platform: 'vinted', kind: 'dressing', status: 'done', started_at: new Date(t0).toISOString(),
    finished_at: new Date(t0 + 62_000).toISOString(), items_vus: 588, total_entries: 588,
    erreur: "[note] cadence cron : 1 sync 'cron' refusée(s) depuis ce run", vinted_user_id: BOUTIQUE, ...extra };
};
const R1610 = releve('2026-10-16T17:36:45Z');   // le relevé complet du 16/10 19:36 (588/588), sans les 60
const R1710 = releve('2026-10-17T18:00:00Z');   // un 2e relevé complet, sans elles
const VU_0737 = { vu_le: '2026-10-15T05:37:55.986Z', statut: 'active' }; // dernière trace : 15/10 07:37, AVANT la lecture

// 1. Identifiant exact et relevé complet.
ok(identifiantAnnonceJob(job()) === '9593096526', 'Vinted : l’identifiant est vinted_item_id');
ok(identifiantAnnonceJob({ platform: 'vinted', listing_url: 'https://www.vinted.fr/items/9362353208-robe', platform_fields: {} }) === '9362353208', 'Vinted : sinon le n° du lien /items/<n>');
ok(identifiantAnnonceJob({ platform: 'vinted', listing_url: null, platform_fields: {} }) === null, 'Vinted : sans numéro, aucun identifiant (jamais le titre)');
ok(identifiantAnnonceJob(job('leboncoin')) === '3279404062', 'Leboncoin : platform_listing_id');
ok(RELEVES_POUR_DISPARITION === 2, 'deux relevés complets, comme les retraits');
ok(releveComplet(R1610, { platform: 'vinted', boutique: BOUTIQUE }), 'le relevé du 16/10 (588/588, sa boutique) est complet');
ok(!releveComplet({ ...R1610, items_vus: 0, total_entries: 0 }, { platform: 'vinted', boutique: BOUTIQUE }), 'un relevé VIDE ne prouve rien');
ok(!releveComplet({ ...R1610, items_vus: 500 }, { platform: 'vinted', boutique: BOUTIQUE }), 'lus < annoncés : incomplet');
ok(!releveComplet({ ...R1610, total_entries: null }, { platform: 'vinted', boutique: BOUTIQUE }), 'total inconnu : incomplet');
ok(!releveComplet({ ...R1610, erreur: '[note] disparitions non marquées — run repris à la page 3' }, { platform: 'vinted', boutique: BOUTIQUE }), 'jugé inutilisable par l’extension : incomplet');
ok(!releveComplet({ ...R1610, status: 'failed' }, { platform: 'vinted', boutique: BOUTIQUE }), 'un relevé en échec ne compte pas');
ok(!releveComplet(R1610, { platform: 'vinted', boutique: '999' }), 'le relevé d’une AUTRE boutique ne prouve rien');
ok(!releveComplet(R1610, { platform: 'vinted', boutique: null }), 'sans boutique connue, aucun relevé Vinted ne prouve une absence');

// 2. Vinted — le cas DeadRoz du 16/10, rejoué.
ok(d({ job: job(), vu: VU_0737 }).decision === 'attendre', 'DeadRoz : la trace de 07:37 est AVANT la lecture → elle ne prouve rien, on attend');
const un = d({ job: job(), vu: VU_0737, runs: [R1610] });
ok(un.decision === 'attendre' && /on attend le suivant/.test(un.raison), 'DeadRoz 16/10 : absente d’UN relevé complet → on attend le second (jamais clos sur un seul)', un);
ok(d({ job: job(), vu: VU_0737, runs: [R1610, R1710] }).decision === 'confirmer', 'absente de DEUX relevés complets de SA boutique → close (vraie disparition, zéro régression)');
ok(d({ job: job(), fiche: { statut: 'stock', last_synced_at: '2026-10-16T18:00:00Z', vinted_status: 'active' }, vu: VU_0737, runs: [R1610] }).decision === 'attendre',
  'la fiche « active » n’est jamais une preuve (garde É4 : figée pendant une republication)');
ok(d({ job: job(), vu: { vu_le: '2026-10-16T17:37:10Z', statut: 'active' }, runs: [R1610] }).decision === 'reprendre',
  'revue en ligne, même identifiant, après la lecture → reprise');
ok(d({ job: job(), vu: { vu_le: '2026-10-16T17:37:10Z', statut: 'sold' } }).decision === 'confirmer', 'revue vendue après la lecture → close (message d’avant)');
ok(d({ job: job(), fiche: { statut: 'vendu' } }).decision === 'confirmer', 'fiche vendue → close');
ok(d({ job: job(), vu: VU_0737, runs: [releve('2026-10-15T10:00:00Z'), releve('2026-10-15T11:00:00Z')] }).decision === 'attendre',
  'des relevés commencés AVANT la lecture ne prouvent rien');
ok(d({ job: job(), vu: VU_0737, runs: [R1610, { ...R1710, vinted_user_id: '999' }] }).decision === 'attendre',
  'un relevé d’une AUTRE boutique ne fait pas le second');
ok(d({ job: job(), vu: VU_0737, runs: [R1610, { ...R1710, items_vus: 0, total_entries: 0 }] }).decision === 'attendre',
  'un relevé vide ne fait pas le second');
ok(d({ job: job('vinted', { vinted_account_id: undefined }), vu: null, runs: [R1610, R1710] }).decision === 'attendre',
  'boutique inconnue (ni job, ni fiche, ni relevé qui l’a vue) : jamais de clôture');
// La boutique du relevé qui l'a vue en dernier, quand ni le job ni la fiche ne la portent.
const vueDansR0 = { vu_le: '2026-10-15T05:37:30Z', statut: 'active' };
const R0 = releve('2026-10-15T05:37:00Z');
ok(d({ job: job('vinted', { vinted_account_id: undefined }), vu: vueDansR0, runs: [R0, R1610, R1710] }).decision === 'confirmer',
  'boutique prise du relevé qui a vu l’annonce en dernier, puis deux relevés complets de cette boutique sans elle → close');
// cdf7007c / a6e773d4 : la FICHE porte une AUTRE annonce, vue après la lecture.
const jobAutre = job('vinted', { vinted_item_id: '9362353208', vinted_account_id: '30218511',
  ...marqueIntrouvable({}, { platform: 'vinted', lecture: 'reparation_20261015', at: '2026-09-29T08:49:45.256Z' }) },
  { listing_url: 'https://www.vinted.fr/items/9362353208' });
const r1310 = releve('2026-10-13T08:04:00Z', { vinted_user_id: '30218511', items_vus: 120, total_entries: 120 });
const cdf = d({ job: jobAutre, fiche: { statut: 'stock', last_synced_at: '2026-10-13T08:04:56Z', vinted_status: 'active', vinted_item_id: '10177470345' },
  vu: { vu_le: '2026-09-20T12:13:18Z', statut: 'active' }, runs: [r1310] });
ok(cdf.decision === 'attendre', 'a6e773d4 : une AUTRE annonce de la fiche vue en ligne ne fait JAMAIS repartir le job', cdf);
// Démenti : l'absence se recompte depuis le dernier démenti.
const dementi = job('vinted', {});
dementi.platform_fields.introuvable_a_confirmer.dementi_le = '2026-10-17T12:00:00Z';
ok(d({ job: dementi, vu: VU_0737, runs: [R1610, R1710] }).decision === 'attendre', 'des relevés d’avant le dernier démenti ne comptent pas');
// La première lecture ratée compte : une 2e lecture (n=2) ne remet pas le compteur à zéro.
const relu = job('vinted', {});
relu.platform_fields = { ...relu.platform_fields, ...marqueIntrouvable(relu.platform_fields, { platform: 'vinted', lecture: 'item_upload_404', at: '2026-10-17T09:00:00Z' }) };
ok(relu.platform_fields.introuvable_a_confirmer.premiere === LU, 'la marque garde la première lecture');
ok(d({ job: relu, vu: VU_0737, runs: [R1610, R1710] }).decision === 'confirmer',
  'relue (404) le 17/10 : le relevé du 16/10, fait après la PREMIÈRE lecture, compte (2 relevés → close)');
const usé = job('vinted', {});
usé.platform_fields.introuvable_a_confirmer.reprises = MAX_REPRISES_INTROUVABLE;
ok(d({ job: usé, vu: { vu_le: '2026-10-16T17:37:10Z', statut: 'active' } }).decision === 'persistant',
  'après 3 reprises, la lecture toujours refusée : la personne décide, jamais une boucle');
ok(d({ job: { platform: 'vinted', listing_url: null, platform_fields: marqueIntrouvable({}, { platform: 'vinted', at: LU }) }, runs: [R1610, R1710] }).decision === 'attendre',
  'sans identifiant exact, jamais de clôture');

// 3. Leboncoin, Beebs… (trace annonces_plateforme, relevés « annonces »).
const lbc = (debut, extra = {}) => ({ platform: 'leboncoin', kind: 'annonces', status: 'done', started_at: debut,
  finished_at: new Date(Date.parse(debut) + 120_000).toISOString(), items_vus: 40, total_entries: 40, erreur: null, vinted_user_id: null, ...extra });
ok(d({ job: job('leboncoin'), annonce: { vu_le: '2026-10-15T17:00:00Z', statut_plateforme: 'en_ligne' } }).decision === 'reprendre', 'LBC revue en ligne → reprise (ancienne forme « annonce »)');
ok(d({ job: job('leboncoin'), vu: { vu_le: '2026-10-15T17:00:00Z', statut: 'en_ligne' } }).decision === 'reprendre', 'LBC revue en ligne → reprise');
ok(d({ job: job('beebs', {}, { platform_listing_id: '33917668' }), vu: { vu_le: '2026-10-15T17:00:00Z', statut: 'vendue' } }).decision === 'confirmer', 'Beebs relevée vendue → close');
ok(d({ job: job('leboncoin'), vu: { vu_le: '2026-10-11T17:20:22Z', statut: 'en_ligne' }, runs: [lbc('2026-10-15T15:00:00Z')] }).decision === 'attendre',
  'LBC absente d’UN relevé complet → on attend le second');
ok(d({ job: job('leboncoin'), vu: { vu_le: '2026-10-11T17:20:22Z', statut: 'en_ligne' }, runs: [lbc('2026-10-15T15:00:00Z'), lbc('2026-10-16T15:00:00Z')] }).decision === 'confirmer',
  'LBC absente de DEUX relevés complets → close');
// DeadRoz eb1e852c / 38ac687c : clos le 15/10 et le 16/10 sur « 0 en ligne lues sur 0 annoncées ».
const vides = [lbc('2026-10-16T06:14:21Z', { items_vus: 0, total_entries: 0 }), lbc('2026-10-16T06:18:22Z', { items_vus: 0, total_entries: 0 })];
ok(d({ job: job('leboncoin'), vu: { vu_le: '2026-10-11T17:20:22Z', statut: 'en_ligne' }, runs: vides }).decision === 'attendre',
  'DeadRoz : deux relevés Leboncoin VIDES ne closent jamais une republication');
ok(d({ job: job('leboncoin'), vu: { vu_le: '2026-10-11T17:20:22Z', statut: 'en_ligne' }, runs: [lbc('2026-10-15T15:00:00Z', { erreur: '[incomplet] 30 sur 111' }), lbc('2026-10-16T15:00:00Z')] }).decision === 'attendre',
  'un relevé « [incomplet] » ne compte pas');
ok(d({ job: job('leboncoin'), vu: { vu_le: '2026-10-11T17:20:22Z', statut: 'en_ligne', disparu_le: '2026-10-16T09:14:19Z' } }).decision === 'attendre',
  'une date « disparue » seule ne close plus (seuls deux relevés complets le font)');
ok(d({ job: job('leboncoin') }).decision === 'attendre', 'LBC sans relevé → attend');

// 4. Marque et messages.
const m2 = marqueIntrouvable(job().platform_fields, { platform: 'vinted', at: '2026-10-15T18:00:00Z' }).introuvable_a_confirmer;
ok(m2.n === 2 && m2.premiere === LU, 'la marque compte les lectures et garde la première');
ok(/rien n'a été retiré/.test(messagePause('vinted')) && !/n'est plus en ligne/.test(messagePause('vinted')), 'la pause ne dit jamais « plus en ligne »');
ok(/^Cette annonce n'est plus en ligne sur Vinted/.test(messageDisparueConfirmee('vinted')), 'le message d’avant, sur preuve seulement');

// 5. pas-de-rouge (Leboncoin, Beebs, Depop) : plus jamais « cancelled » sur une lecture.
const s = classerEchec({ platform: 'leboncoin', action: 'republish', brut: "Republication impossible : cette annonce n'est plus en ligne sur Leboncoin (retirée, vendue ou désactivée depuis sa mise en ligne). FillSell n'a rien retiré.", essais: 1, pf: {} });
ok(s.statut === 'needs_user' && s.source === 'introuvable_a_confirmer' && s.pf?.introuvable_a_confirmer?.n === 1, 'pas-de-rouge : pause « introuvable à confirmer »', s);

// 6. Câblage.
const uj = readFileSync(new URL('../supabase/functions/update-job-status/index.ts', import.meta.url), 'utf8');
const hw = readFileSync(new URL('../supabase/functions/handler-watch/index.ts', import.meta.url), 'utf8').split('\r\n').join('\n');
ok(/statutEffectif = "needs_user";\s*messageEffectif = messagePause\("vinted"\);/.test(uj), 'update-job-status : le 404 Vinted met en pause');
ok(!/raisonRequalif = "annonce disparue \(404 confirmé avant toute suppression\) : cancelled neutre"/.test(uj), 'plus aucun « cancelled » sur le seul 404');
ok(/\.eq\("disparu_le", at404\)/.test(uj), 'la date « disparue » posée par cette seule lecture est retirée');
ok(/decisionIntrouvable\(\{ job: j,/.test(hw) && /REPRISES_PAR_COMPTE_ET_PASSAGE/.test(hw), 'handler-watch tranche sur preuve, 3 par compte et par passage');
const debutZone = hw.indexOf('« INTROUVABLE À CONFIRMER » : REPRISE OU CLÔTURE SUR PREUVE');
const zone = debutZone >= 0 ? hw.slice(debutZone, hw.indexOf('introuvable à confirmer :", (e as Error)', debutZone)) : '';
ok(zone.length > 0, 'handler-watch : la zone « introuvable à confirmer » existe');
ok(/\.in\("platform", plateformes\)/.test(zone) && /\.gt\("items_vus", 0\)/.test(zone) && /ascending: false/.test(zone),
  'handler-watch : relevés NON VIDES des seules plateformes en pause, du plus récent (DeadRoz : rang 89 jamais lu)');
ok(!/ascending: true \}\)\.limit\(50\)/.test(zone), 'handler-watch : plus jamais « les 50 plus anciens relevés »');
ok(/from\("vinted_listing_snapshots"\)/.test(zone) && /\.in\("vinted_item_id", itemsV\)/.test(zone) && /identifiantAnnonceJob\(j\)/.test(zone),
  'handler-watch : trace Vinted par identifiant exact (relevé du jour + fiche qui porte CE vinted_item_id)');
ok(!/select\("id, statut, last_synced_at, vinted_status, vinted_account_id"\)/.test(zone), 'handler-watch : la fiche du job n’est plus lue comme preuve');
ok(/if \(!tracesLisibles\)/.test(zone) && /if \(eA\) continue;/.test(zone), 'handler-watch : une lecture ratée n’est jamais une absence');
// (17/10, a6e773d4) Le « réveil par capture fraîche » ne réveille jamais une pause « introuvable » :
// une capture faite AVANT la lecture ratée ne prouve rien (le job, remis en pause à 13:15, était re-pendu à 13:18).
const iReveil = hw.indexOf('le gel n\'a plus d\'objet');
const zoneReveil = iReveil > 0 ? hw.slice(Math.max(0, iReveil - 6000), iReveil) : '';
ok(/if \(source === SOURCE_INTROUVABLE \|\| source === SOURCE_INTROUVABLE_PERSISTANT\) continue;/.test(zoneReveil),
  'handler-watch : le réveil par capture saute les pauses « introuvable » (leur règle seule décide)');

console.log(`✓ selftest:introuvable-a-confirmer — ${n} assertions`);
