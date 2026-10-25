// selftest:introuvable-a-confirmer — (15/10, point 14, DeadRoz) une lecture
// « plus en ligne » ne vaut jamais un verdict : pause, puis reprise ou clôture
// sur la preuve d'un relevé. Zéro régression sur une vraie disparition.
// (17/10) La preuve porte sur l'annonce EXACTE (jamais la fiche du job), et
// l'absence sur DEUX relevés complets, non vides, de sa boutique Vinted.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  decisionIntrouvable as d, marqueIntrouvable, messagePause, messageDisparueConfirmee, MAX_REPRISES_INTROUVABLE,
  identifiantAnnonceJob, releveComplet, RELEVES_POUR_DISPARITION, messageVendueLue, FENETRE_TRACE_MS,
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

// (24/10 soir, condition de Nico au déploiement d'update-job-status / handler-watch) Une annonce HORS Vinted n'est
// déclarée disparue qu'après DEUX relevés complets qui concordent, jamais sur une seule lecture : `disparu_le` n'est
// posé que par constater_absences_releve (deux relevés probants distincts, releve_preuve_absence) ; un statut lu une
// fois, ou un seul relevé complet sans elle, n'est jamais une disparition.
{
  const LBC = job('leboncoin');
  const rl = (debut) => ({ ...releve(debut), platform: 'leboncoin', kind: 'annonces', vinted_user_id: null });
  const enLigne = { vu_le: '2026-10-15T09:00:00Z', statut_plateforme: 'en_ligne', disparu_le: null };
  ok(d({ job: LBC, annonce: enLigne }).decision === 'attendre', 'hors Vinted : la lecture ratée seule ne déclare rien');
  const unSeul = d({ job: LBC, annonce: enLigne, runs: [rl('2026-10-16T17:36:45Z')] });
  ok(unSeul.decision === 'attendre' && /on attend le suivant/.test(unSeul.raison), 'hors Vinted : absente d’UN relevé complet → on attend le second', unSeul);
  ok(d({ job: LBC, annonce: enLigne, runs: [rl('2026-10-16T17:36:45Z'), rl('2026-10-17T18:00:00Z')] }).decision === 'confirmer',
    'hors Vinted : absente de DEUX relevés complets → disparue');
  // `disparu_le` (posé par deux relevés) après une trace vue APRÈS la lecture : disparue ; vue de nouveau ensuite : pas disparue.
  const vueApres = { vu_le: '2026-10-16T09:00:00Z', statut_plateforme: 'en_ligne', disparu_le: '2026-10-17T18:01:00Z' };
  ok(d({ job: LBC, annonce: vueApres }).decision === 'confirmer', 'hors Vinted : disparu_le (deux relevés) → disparue');
  ok(d({ job: LBC, annonce: { ...vueApres, vu_le: '2026-10-18T09:00:00Z' } }).decision === 'reprendre', 'revue en ligne après disparu_le → jamais disparue');
  const fn = readFileSync(new URL('../supabase/migrations/20261022200000_file_synchro_boutique_partagee.sql', import.meta.url), 'utf8');
  const corps = fn.slice(fn.indexOf('CREATE OR REPLACE FUNCTION public.constater_absences_releve'));
  ok(/IF precedent\.id IS NULL THEN RETURN jsonb_build_object\('disparues',0,'motif','second_releve_attendu'\)/.test(corps)
    && /releve_preuve_absence\(s\.id\)/.test(corps) && /NOT releve_preuve_absence\(p_run\)/.test(corps),
    'disparu_le n’est posé qu’avec DEUX relevés probants (constater_absences_releve)');
}

// (25/10, point 1b de Nico) « ON ATTEND LE PROCHAIN RELEVÉ » TRANCHE — les pauses du 24/10, rejouées
// (fixtures relevées en prod le 25/10 vers 00:10 ; rejeu exact de handler-watch : toutes « attendre » avant).
{
  const jobLbc = (premiere, depuis, extra = {}, n = 1) => ({ platform: 'leboncoin', platform_listing_id: '3292104989',
    platform_fields: { introuvable_a_confirmer: { depuis, premiere, n, reprises: n - 1, plateforme: 'leboncoin', lecture: 'etat_unavailable' }, ...extra } });
  // nino b4bef8cf : 3292104989 disparue le 21/10 (deux relevés complets, absence_releves), relue « unavailable » le 24/10 à 11:28.
  const nino = jobLbc('2026-10-24T09:28:01.648Z', '2026-10-24T09:28:01.648Z');
  const annNino = { vu_le: '2026-10-20T17:41:25Z', statut_plateforme: 'en_ligne', disparu_le: '2026-10-21T09:04:37Z' };
  const rl = (debut) => ({ platform: 'leboncoin', kind: 'annonces', status: 'done', started_at: debut,
    finished_at: new Date(Date.parse(debut) + 6_000).toISOString(), items_vus: 31, total_entries: 28, erreur: '[défilement] [adresse] 1 page(s), 28 en ligne lues sur 28 annoncées', vinted_user_id: null });
  const avantNino = [rl('2026-10-21T08:50:00Z'), rl('2026-10-21T09:04:30Z'), rl('2026-10-24T09:01:40Z'), rl('2026-10-24T09:01:46Z')];
  const sansApres = d({ job: nino, annonce: annNino, runs: avantNino });
  ok(sansApres.decision === 'attendre' && sansApres.releve_attendu === true,
    'disparu_le et relevés d’AVANT la lecture seulement : le prochain relevé tranche (mémoire « annonce morte » < 0.6.134 : jamais clos sans lui)', sansApres);
  const dn = d({ job: nino, annonce: annNino, runs: [...avantNino, rl('2026-10-24T11:02:30Z')] });
  ok(dn.decision === 'confirmer', 'nino b4bef8cf : absente depuis le 21/10, et du relevé de 13:02 fait après la lecture → close', dn);
  ok(d({ job: nino, annonce: { ...annNino, vu_le: '2026-10-24T11:02:30Z' }, runs: [...avantNino, rl('2026-10-24T11:02:30Z')] }).decision === 'reprendre',
    'revue en ligne après disparu_le et après la lecture → reprise (jamais disparue)');
  // louis b56582b6 : la page lue « Article vendu » à la lecture (17:04), pause posée avant le déploiement d'A4 (18:46).
  const louis = jobLbc('2026-10-24T14:24:16.375Z', '2026-10-24T15:04:13.459Z', { republish_etat_reel: { at: '2026-10-24T15:04:11.645Z', state: 'sold' } }, 2);
  const dl = d({ job: louis, annonce: { vu_le: '2026-10-24T15:00:37Z', statut_plateforme: 'en_ligne', transaction_plateforme: 'sold', transaction_lue_le: '2026-10-24T10:10:55Z' } });
  ok(dl.decision === 'confirmer' && dl.vendue === true, 'louis b56582b6 : page lue « vendue » à la lecture de cette pause → close « vendue »', dl);
  ok(d({ job: jobLbc('2026-10-24T14:24:16Z', '2026-10-24T15:04:13Z', { republish_etat_reel: { at: '2026-10-20T08:00:00Z', state: 'sold' } }) }).decision === 'attendre',
    'une lecture « vendue » d’AVANT cette pause ne tranche pas');
  ok(/est vendue \(la page affiche « Article vendu »\)/.test(messageVendueLue('leboncoin')), 'message « vendue » : celui de pas-de-rouge (A4)');
  // Marta 133c921a (Vinted) : vue à 12:40, absente de 4 relevés complets de SA boutique avant la lecture (14:49), puis d'un après.
  const B = '158898598';
  const marta = { platform: 'vinted', listing_url: 'https://www.vinted.fr/items/10505625698', platform_fields: { vinted_item_id: '10505625698', vinted_account_id: B,
    introuvable_a_confirmer: { depuis: '2026-10-24T12:49:39.075Z', premiere: '2026-10-24T12:49:39.075Z', n: 1, reprises: 0, plateforme: 'vinted', lecture: 'item_upload_404' } } };
  const rM = (debut) => releve(debut, { vinted_user_id: B, items_vus: 41, total_entries: 41 });
  const avant = [rM('2026-10-24T11:34:00Z'), rM('2026-10-24T11:49:36Z'), rM('2026-10-24T12:09:40Z'), rM('2026-10-24T12:33:40Z')];
  const vuM = { vu_le: '2026-10-24T10:40:06.918Z', statut: 'active' };
  const seuls = d({ job: marta, vu: vuM, runs: avant });
  ok(seuls.decision === 'attendre' && seuls.releve_attendu === true && /le prochain relevé tranche/.test(seuls.raison),
    'absente de relevés faits AVANT la lecture seulement → le prochain relevé tranche (jamais clos sans lui)', seuls);
  ok(d({ job: marta, vu: vuM, runs: [...avant, rM('2026-10-24T12:59:33Z')] }).decision === 'confirmer',
    'Marta 133c921a : + un relevé de sa boutique après la lecture, toujours sans elle → close');
  ok(d({ job: marta, vu: { vu_le: '2026-10-24T12:59:40Z', statut: 'active' }, runs: [...avant, rM('2026-10-24T12:59:33Z')] }).decision === 'reprendre',
    'le relevé d’après la lecture la voit → reprise');
  ok(d({ job: marta, vu: { vu_le: '2026-10-24T12:33:45Z', statut: 'active' }, runs: [...avant, rM('2026-10-24T12:59:33Z')] }).decision === 'attendre',
    'DeadRoz : vue par le DERNIER relevé avant la lecture → un seul relevé sans elle, on attend le suivant');
  ok(d({ job: marta, vu: vuM, runs: [avant[0], { ...rM('2026-10-24T12:59:33Z'), vinted_user_id: '999' }] }).decision === 'attendre',
    'le relevé d’une autre boutique ne fait jamais le relevé d’après la lecture');
  ok(d({ job: marta, vu: null, runs: [...avant, rM('2026-10-24T12:59:33Z')] }).decision === 'attendre',
    'sans trace connue : deux relevés après la lecture, comme avant');
  ok(d({ job: marta, vu: vuM, runs: [...avant, rM('2026-10-24T12:59:33Z')].map((r) => ({ ...r, items_vus: 30 })) }).decision === 'attendre',
    'des relevés incomplets (lus < annoncés) ne comptent jamais');
  // Câblage du volet A (handler-watch).
  ok(FENETRE_TRACE_MS >= 7 * 86_400_000, 'la fenêtre couvre la dernière vue (au moins 7 jours)');
  ok(/\)\) - FENETRE_TRACE_MS;/.test(zone), 'handler-watch : relevés ET traces lus depuis FENETRE_TRACE_MS avant la première lecture (même borne)');
  ok(/\.order\("captured_at", \{ ascending: false \}\)\.limit\(2000\)/.test(zone), 'handler-watch : traces Vinted les plus récentes d’abord (la dernière vue jamais coupée)');
  ok(/vendue \? messageVendueLue\(j\.platform\) : messageDisparueConfirmee\(j\.platform\)/.test(zone), 'handler-watch : « vendue » lue → le message de pas-de-rouge');
}

// (25/10, point 1b, volet B) Le relevé attendu est DEMANDÉ — borné, et jamais avalé en silence par la garde.
{
  ok(/declencheur: "serveur:introuvable_a_confirmer"/.test(zone) && /6 \* 3600_000/.test(zone) && /posteVuMs < 10 \* 60_000/.test(zone),
    'handler-watch : le relevé attendu est demandé (une fois par 6 h, poste en ligne : vu depuis moins de 10 min)');
  ok(/boutiqueOuverte !== boutiqueAttendue/.test(zone), 'handler-watch : Vinted — seulement si la boutique ouverte est celle de l’annonce');
  ok(/\}\)\.select\("id"\);/.test(zone) && /pose\?\.length/.test(zone), 'handler-watch : la pose est vérifiée (garde_releve_sans_geste avale sans erreur)');
  const mig = readFileSync(new URL('../supabase/migrations/20261025030000_releve_introuvable_a_confirmer.sql', import.meta.url), 'utf8');
  ok(/'serveur:introuvable_a_confirmer'/.test(mig) && /FUNCTION public\.releve_est_veille/.test(mig), 'migration : le déclencheur entre dans releve_est_veille()');
  const app = readFileSync(new URL('../src/utils/declencheursReleve.js', import.meta.url), 'utf8');
  ok(/'serveur:introuvable_a_confirmer'/.test(app), 'app : le relevé du serveur n’est jamais montré comme une synchronisation de la personne');
}

// (26/10 nuit, point 8) Les notes de PÉRIMÈTRE ne retirent pas un relevé complet de SA boutique (Vinted) ; sans trace,
// la création par FillSell est la dernière vue (Vinted, Beebs) — jamais une pause sans issue.
{
  const WOOD = '258669486';
  const LECTURE_LOHAN = '2026-10-25T10:54:17Z'; // 11:54 Paris
  const lohan = { platform: 'vinted', listing_url: 'https://www.vinted.fr/items/10412430838',
    platform_fields: { vinted_item_id: '10412430838', vinted_account_id: WOOD, ...marqueIntrouvable({}, { platform: 'vinted', lecture: 'item_upload_404', at: LECTURE_LOHAN }) } };
  const rW = (debut, note) => releve(debut, { vinted_user_id: WOOD, items_vus: 30, total_entries: 30, erreur: note });
  const NOTE_CC = "[note] disparitions non marquées — changement de compte Vinted (@lo160 → @woodenbridge) : sync normale, aucune disparition marquée | [note] cadence cron : 1 sync 'cron' refusée(s) depuis ce run";
  ok(releveComplet(rW('2026-10-25T10:16:33Z', NOTE_CC), { platform: 'vinted', boutique: WOOD }), 'Lohan : un relevé complet noté « changement de compte » prouve (sa boutique)');
  ok(releveComplet(rW('2026-10-25T10:16:33Z', '[note] disparitions non marquées — aucun run terminé en référence (première sync) : rien à marquer ce run'), { platform: 'vinted', boutique: WOOD }), 'premier relevé (aucune référence) : complet');
  ok(!releveComplet(rW('2026-10-25T10:16:33Z', NOTE_CC), { platform: 'vinted', boutique: '999' }), 'noté « changement de compte » mais d’une AUTRE boutique : jamais');
  ok(!releveComplet(rW('2026-10-25T10:16:33Z', '[note] disparitions non marquées — effondrement suspect : 30 disparition(s) à marquer sur 31 connu(s), plafond 10 — aucun marquage'), { platform: 'vinted', boutique: WOOD }), 'effondrement suspect : toujours écarté');
  ok(!releveComplet(rW('2026-10-25T10:16:33Z', "[note] disparitions non marquées — dressing sans recoupement avec l'inventaire (31 connu(s), 0 vu(s)) — mauvais compte Vinted possible, aucun marquage"), { platform: 'vinted', boutique: WOOD }), 'sans recoupement (mauvais compte possible) : toujours écarté');
  ok(!releveComplet(rW('2026-10-25T10:16:33Z', NOTE_CC + ' | [note] disparitions non marquées — run repris à la page 2'), { platform: 'vinted', boutique: WOOD }), 'une note de périmètre ET une d’incomplétude : écarté');
  ok(!releveComplet(rW('2026-10-25T10:16:33Z', "[note] disparitions non marquées — vu 29 article(s) pour 30 annoncé(s) par Vinted : relevé incomplet"), { platform: 'vinted', boutique: WOOD }), 'relevé incomplet noté : écarté');
  ok(!releveComplet(lbc('2026-10-25T10:16:33Z', { erreur: '[note] disparitions non marquées — changement de compte' }), { platform: 'leboncoin' }), 'autres plateformes : toute note écarte, comme avant');
  // Sans trace : la création par FillSell (17/10 15:37 Paris) est la dernière vue.
  const CREE = '2026-10-17T13:37:11.600Z';
  const avant = [rW('2026-10-25T10:16:33Z', NOTE_CC)];
  ok(d({ job: lohan, runs: avant }).decision === 'attendre', 'Lohan sans la création : 11:16 (avant la lecture) ne compte pas');
  const unSeul = d({ job: lohan, runs: avant, creeLe: CREE });
  ok(unSeul.decision === 'attendre' && unSeul.releve_attendu === true && /le prochain relevé tranche/.test(unSeul.raison), 'Lohan avec la création : 11:16 compte, le prochain relevé de sa boutique tranche', unSeul);
  ok(d({ job: lohan, runs: [...avant, rW('2026-10-26T08:00:00Z', NOTE_CC)], creeLe: CREE }).decision === 'confirmer', '… et ce relevé, sans elle, la clôt (jamais une pause sans fin)');
  ok(d({ job: lohan, vu: { vu_le: '2026-10-26T07:59:00Z', statut: 'active' }, runs: [...avant, rW('2026-10-26T08:00:00Z', NOTE_CC)], creeLe: CREE }).decision === 'reprendre', 'revue en ligne après la lecture → reprise, création ou pas');
  // Sébastien, Beebs 34232713 : dépôt FillSell 13:47:39, relevé complet 16:38 sans elle, lecture 18:20:56, relevé 19:22.
  const seb = { platform: 'beebs', platform_listing_id: '34232713', platform_fields: marqueIntrouvable({}, { platform: 'beebs', lecture: 'page_unavailable', at: '2026-10-25T17:20:56Z' }) };
  const rB = (debut) => ({ platform: 'beebs', kind: 'annonces', status: 'done', started_at: debut, finished_at: new Date(Date.parse(debut) + 90_000).toISOString(), items_vus: 97, total_entries: 97, erreur: null, vinted_user_id: null });
  ok(d({ job: seb, runs: [rB('2026-10-25T15:38:00Z')] }).decision === 'attendre', 'Sébastien sans la création : rien ne compte avant la lecture');
  ok(d({ job: seb, runs: [rB('2026-10-25T15:38:00Z'), rB('2026-10-25T18:22:11Z')], creeLe: '2026-10-25T12:47:39.575Z' }).decision === 'confirmer', 'Sébastien avec la création : 16:38 + 19:22 sans elle → close, plus d’attente sans fin');
  ok(d({ job: seb, runs: [rB('2026-10-25T15:38:00Z')], creeLe: '2026-10-25T12:47:39.575Z' }).decision === 'attendre', '… mais jamais sur un seul relevé, ni sans relevé après la lecture');
  ok(d({ job: job('leboncoin'), runs: [lbc('2026-10-15T15:00:00Z'), lbc('2026-10-16T15:00:00Z')], creeLe: '2026-10-14T10:00:00Z' }).decision === 'confirmer'
    && d({ job: job('leboncoin'), runs: [lbc('2026-10-15T10:00:00Z')], creeLe: '2026-10-14T10:00:00Z' }).decision === 'attendre',
    'Leboncoin : la création ne sert pas de dernière vue (règle d’avant)');
  // Câblage (handler-watch).
  ok(/\.eq\("status", "published"\)\.in\("platform_listing_id", numerosI\)/.test(zone) && /decisionIntrouvable\(\{ job: j, fiche, vu, annonce, runs: runsPf, boutique, creeLe \}\)/.test(zone),
    'handler-watch : la création par FillSell (job publié, même numéro) est passée à la décision');
}

console.log(`✓ selftest:introuvable-a-confirmer — ${n} assertions`);
