// selftest:introuvable-a-confirmer — (15/10, point 14, DeadRoz) une lecture
// « plus en ligne » ne vaut jamais un verdict : pause, puis reprise ou clôture
// sur la preuve d'un relevé. Zéro régression sur une vraie disparition.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  decisionIntrouvable as d, marqueIntrouvable, messagePause, messageDisparueConfirmee, MAX_REPRISES_INTROUVABLE,
} from '../supabase/functions/_shared/introuvable-a-confirmer.js';
import { classerEchec } from '../supabase/functions/_shared/pas-de-rouge.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const LU = '2026-10-15T11:52:09.821Z'; // 13:52 Paris, la première lecture 404 chez DeadRoz
const job = (platform = 'vinted', extra = {}) => ({ platform, platform_fields: { ...marqueIntrouvable({}, { platform, lecture: 'item_upload_404', at: LU }), ...extra } });

// 1. Vinted.
ok(d({ job: job(), fiche: { statut: 'stock', last_synced_at: '2026-10-15T05:37:55Z', vinted_status: 'active' } }).decision === 'attendre',
  'DeadRoz : la synchro de 07:37 est AVANT la lecture → elle ne prouve rien, on attend');
ok(d({ job: job(), fiche: { statut: 'stock', last_synced_at: '2026-10-15T17:00:00Z', vinted_status: 'active' } }).decision === 'reprendre',
  'relevée en ligne après la lecture → reprise');
ok(d({ job: job(), fiche: { statut: 'stock', last_synced_at: '2026-10-15T17:00:00Z', vinted_status: 'sold' } }).decision === 'confirmer',
  'relevée vendue après la lecture → close (message d’avant)');
ok(d({ job: job(), fiche: { statut: 'vendu' } }).decision === 'confirmer', 'fiche vendue → close');
const runDone = [{ started_at: '2026-10-15T15:00:00Z', finished_at: '2026-10-15T15:04:00Z', vinted_user_id: 127239260 }];
ok(d({ job: job(), fiche: { statut: 'stock', last_synced_at: '2026-10-15T05:37:55Z', vinted_status: 'active', vinted_account_id: '127239260' }, runs: runDone }).decision === 'confirmer',
  'absente d’un relevé complet de SA boutique fait après la lecture → close (vraie disparition, zéro régression)');
ok(d({ job: job(), fiche: { statut: 'stock', last_synced_at: '2026-10-15T05:37:55Z', vinted_status: 'active', vinted_account_id: '999' }, runs: runDone }).decision === 'attendre',
  'le relevé d’une AUTRE boutique ne prouve rien');
ok(d({ job: job(), fiche: { statut: 'stock', last_synced_at: '2026-10-15T05:37:55Z', vinted_status: 'active' }, runs: [{ started_at: '2026-10-15T10:00:00Z', finished_at: '2026-10-15T10:05:00Z' }] }).decision === 'attendre',
  'un relevé commencé AVANT la lecture ne prouve rien');
const usé = job('vinted', {});
usé.platform_fields.introuvable_a_confirmer.reprises = MAX_REPRISES_INTROUVABLE;
ok(d({ job: usé, fiche: { statut: 'stock', last_synced_at: '2026-10-15T17:00:00Z', vinted_status: 'active' } }).decision === 'persistant',
  'après 3 reprises, la lecture toujours refusée : la personne décide, jamais une boucle');

// 2. Leboncoin, Beebs…
ok(d({ job: job('leboncoin'), annonce: { vu_le: '2026-10-15T17:00:00Z', statut_plateforme: 'en_ligne' } }).decision === 'reprendre', 'LBC revue en ligne → reprise');
ok(d({ job: job('beebs'), annonce: { vu_le: '2026-10-15T17:00:00Z', statut_plateforme: 'vendue' } }).decision === 'confirmer', 'Beebs relevée vendue → close');
ok(d({ job: job('leboncoin'), annonce: { vu_le: '2026-10-14T17:00:00Z', statut_plateforme: 'en_ligne' }, runs: [{ started_at: '2026-10-15T15:00:00Z', finished_at: '2026-10-15T15:10:00Z' }] }).decision === 'confirmer',
  'LBC absente d’un relevé complet après la lecture → close');
ok(d({ job: job('leboncoin'), annonce: { vu_le: '2026-10-14T17:00:00Z', statut_plateforme: 'en_ligne' } }).decision === 'attendre', 'LBC sans relevé → attend');

// 3. Marque et messages.
const m2 = marqueIntrouvable(job().platform_fields, { platform: 'vinted', at: '2026-10-15T18:00:00Z' }).introuvable_a_confirmer;
ok(m2.n === 2 && m2.premiere === LU, 'la marque compte les lectures et garde la première');
ok(/rien n'a été retiré/.test(messagePause('vinted')) && !/n'est plus en ligne/.test(messagePause('vinted')), 'la pause ne dit jamais « plus en ligne »');
ok(/^Cette annonce n'est plus en ligne sur Vinted/.test(messageDisparueConfirmee('vinted')), 'le message d’avant, sur preuve seulement');

// 4. pas-de-rouge (Leboncoin, Beebs, Depop) : plus jamais « cancelled » sur une lecture.
const s = classerEchec({ platform: 'leboncoin', action: 'republish', brut: "Republication impossible : cette annonce n'est plus en ligne sur Leboncoin (retirée, vendue ou désactivée depuis sa mise en ligne). FillSell n'a rien retiré.", essais: 1, pf: {} });
ok(s.statut === 'needs_user' && s.source === 'introuvable_a_confirmer' && s.pf?.introuvable_a_confirmer?.n === 1, 'pas-de-rouge : pause « introuvable à confirmer »', s);

// 5. Câblage.
const uj = readFileSync(new URL('../supabase/functions/update-job-status/index.ts', import.meta.url), 'utf8');
const hw = readFileSync(new URL('../supabase/functions/handler-watch/index.ts', import.meta.url), 'utf8');
ok(/statutEffectif = "needs_user";\s*messageEffectif = messagePause\("vinted"\);/.test(uj), 'update-job-status : le 404 Vinted met en pause');
ok(!/raisonRequalif = "annonce disparue \(404 confirmé avant toute suppression\) : cancelled neutre"/.test(uj), 'plus aucun « cancelled » sur le seul 404');
ok(/\.eq\("disparu_le", at404\)/.test(uj), 'la date « disparue » posée par cette seule lecture est retirée');
ok(/decisionIntrouvable\(\{ job: j,/.test(hw) && /REPRISES_PAR_COMPTE_ET_PASSAGE/.test(hw), 'handler-watch tranche sur preuve, 3 par compte et par passage');

console.log(`✓ selftest:introuvable-a-confirmer — ${n} assertions`);
