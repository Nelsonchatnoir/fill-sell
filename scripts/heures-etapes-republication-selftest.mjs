// selftest:heures-etapes-republication — (05/11 soir, lot « Ouverture du Cloud », point 10) l'heure de chaque étape
// d'une republication : notée par la base (journal_etapes, migration 20261105230000), lue et dite dans la file, PASSÉE
// et jamais promise ; une republication d'avant le journal retombe sur les horodatages déjà écrits.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { heuresEtapes, phraseHeuresEtapes } from '../src/utils/barresJobs.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
// 05/11/2026 : heure de Paris = UTC + 1.
const M = Date.parse('2026-11-05T20:30:00.000Z');   // 21:30 à Paris
const e = (etape, statut, hhmmUtc) => ({ etape, statut, le: `2026-11-05T${hhmmUtc}:00.000Z` });
const cles = (h) => h.map((x) => x.cle).join(',');
const heures = (h) => h.map((x) => x.heure).join(',');

// 1. Hors republication : rien.
ok(heuresEtapes({ action: 'publish', status: 'processing', platform_fields: { journal_etapes: [e('a_capturer', 'pending', '19:00')] } }, { maintenant: M }).length === 0, 'publication : aucune heure d’étape');
ok(heuresEtapes({ action: 'delete' }, { maintenant: M }).length === 0, 'retrait : aucune heure d’étape');

// 2. Avec le journal : chaque étape à son heure (Paris), la prise comprise.
const complet = {
  action: 'republish', status: 'published', created_at: '2026-11-05T19:58:00.000Z',
  platform_fields: { republish_step: 'recreated', journal_etapes: [
    e('a_capturer', 'pending', '19:58'), e('a_capturer', 'processing', '20:01'), e('captured', 'processing', '20:02'),
    e('captured', 'pending', '20:03'), e('captured', 'processing', '20:04'), e('deleted', 'processing', '20:05'),
    e('deleted', 'pending', '20:06'), e('deleted', 'processing', '20:09'), e('recreated', 'published', '20:11'),
  ] },
};
const h = heuresEtapes(complet, { maintenant: M });
ok(cles(h) === 'file,prise,captured,deleted,recreated', `les cinq étapes, dans l’ordre (${cles(h)})`);
ok(heures(h) === '20:58,21:01,21:02,21:05,21:11', `heures de Paris, au PREMIER passage dans chaque étape (${heures(h)})`);
ok(phraseHeuresEtapes(complet, { maintenant: M }) === 'En file 20:58 · Prise 21:01 · Copie faite 21:02 · Ancienne retirée 21:05 · De retour en ligne 21:11', 'la phrase de la file');
ok(phraseHeuresEtapes(complet, { maintenant: M, lang: 'en' }).startsWith('Queued 20:58 · Started 21:01 · Copy saved 21:02'), 'en anglais aussi');

// 3. Un nouvel essai depuis le début (retour à a_capturer) recommence l'histoire.
const reprise = {
  action: 'republish', status: 'processing', created_at: '2026-11-05T19:00:00.000Z',
  platform_fields: { republish_step: 'a_capturer', journal_etapes: [
    e('a_capturer', 'pending', '19:00'), e('a_capturer', 'processing', '19:01'), e('captured', 'processing', '19:02'),
    e('a_capturer', 'pending', '20:10'), e('a_capturer', 'processing', '20:12'),
  ] },
};
const hr = heuresEtapes(reprise, { maintenant: M });
ok(cles(hr) === 'file,prise' && heures(hr) === '21:10,21:12', `retour au début : « En file 21:10 · Prise 21:12 », plus de copie d’avant (${cles(hr)} ${heures(hr)})`);

// 4. Sans journal (republication d'avant le déclencheur) : les horodatages déjà écrits, sans « Prise ».
const ancienne = {
  action: 'republish', status: 'pending', created_at: '2026-11-05T18:00:00.000Z',
  platform_fields: { republish_step: 'deleted', republish_snapshot: { captured_at: '2026-11-05T18:05:00.000Z' }, deleted_at: '2026-11-05T18:07:00.000Z', processing_since: '2026-11-05T18:20:00.000Z' },
};
const ha = heuresEtapes(ancienne, { maintenant: M });
ok(cles(ha) === 'file,captured,deleted' && heures(ha) === '19:00,19:05,19:07', `sans journal : file, copie, retrait (${cles(ha)} ${heures(ha)})`);
const finie = { action: 'republish', status: 'published', created_at: '2026-11-05T18:00:00.000Z', published_at: '2026-11-05T18:15:00.000Z', platform_fields: { republish_step: 'recreated', deleted_at: '2026-11-05T18:07:00.000Z' } };
ok(heuresEtapes(finie, { maintenant: M }).at(-1)?.heure === '19:15', 'sans recreated_at : la remise en ligne lue sur published_at');
ok(cles(heuresEtapes({ ...ancienne, platform_fields: { ...ancienne.platform_fields, republish_step: 'captured' } }, { maintenant: M })) === 'file,captured', 'une étape pas encore atteinte n’a jamais d’heure (deleted_at d’un essai précédent ignoré)');

// 5. Jamais d'heure future, jamais d'heure illisible ; la veille se dit « hier ».
const futur = { action: 'republish', status: 'processing', created_at: '2026-11-05T20:00:00.000Z', platform_fields: { republish_step: 'captured', journal_etapes: [e('a_capturer', 'pending', '20:00'), e('captured', 'processing', '23:50'), { etape: 'deleted', le: 'pas une date' }] } };
const hf = heuresEtapes(futur, { maintenant: M });
ok(hf.every((x) => x.le <= M) && !hf.some((x) => x.cle === 'deleted'), 'horloge en avance ramenée à maintenant ; entrée illisible ignorée');
const hier = { action: 'republish', status: 'pending', created_at: '2026-11-04T22:58:00.000Z', platform_fields: { republish_step: 'captured', journal_etapes: [{ etape: 'a_capturer', statut: 'pending', le: '2026-11-04T22:58:00.000Z' }, e('captured', 'pending', '06:00')] } };
ok(phraseHeuresEtapes(hier, { maintenant: M }) === 'En file hier 23:58 · Copie faite 07:00', `la veille : « hier 23:58 » (${phraseHeuresEtapes(hier, { maintenant: M })})`);
ok(phraseHeuresEtapes({ action: 'republish', status: 'pending', created_at: '2026-11-05T20:00:00.000Z', platform_fields: { republish_step: 'a_capturer' } }, { maintenant: M }) === '', 'une seule étape (en file) : rien de dit (la file le dit déjà)');

// 6. Câblage : la file (en cours et lignes en attente) dit les heures ; aucune heure promise.
const file = lire('src/components/FileDesJobs.jsx');
ok(/import \{ pisteJob, articleDeJob, phraseHeuresEtapes \} from "\.\.\/utils\/barresJobs";/.test(file), 'FileDesJobs importe la règle');
ok((file.match(/<HeuresEtapes job=\{job\}/g) ?? []).length === 2, 'les heures sous la barre « En cours » ET sur chaque ligne de la file');
ok(/maintenant=\{ctx\.maintenant\}/.test(file), 'même horloge que la file (rafraîchie toutes les 30 s)');
const barres = lire('src/utils/barresJobs.js');
ok(/export function heuresEtapes\(job, opts = \{\}\)/.test(barres) && /depuisQuand\(t\[e\.cle\], maintenant, lang\)/.test(barres), 'heures dites par depuisQuand (passé, heure de Paris)');

// 7. La migration : déclencheur nommé pour passer en DERNIER, republications seulement, journal borné et tenu par la base.
const mig = lire('supabase/migrations/20261105230000_journal_etapes_republication.sql');
ok(/CREATE TRIGGER zz_journal_etapes_republication\s+BEFORE INSERT OR UPDATE OF status, platform_fields ON public\.cross_post_jobs/.test(mig), 'déclencheur BEFORE zz_… sur status et platform_fields');
ok(/WHEN \(NEW\.action = 'republish'\)/.test(mig), 'republications seulement');
ok(/IF v_n > 30 THEN/.test(mig) && /v_journal := OLD\.platform_fields->'journal_etapes'/.test(mig), '30 entrées au plus ; journal repris de la LIGNE, jamais de la copie du client');
ok(/PRÉPARÉE, NON APPLIQUÉE/.test(mig), 'la migration dit qu’elle attend le feu vert nommé de Nico');
const inv = lire('supabase/rollbacks/20261105230000_journal_etapes_republication_INVERSE.sql');
ok(/DROP TRIGGER IF EXISTS zz_journal_etapes_republication/.test(inv) && /DROP FUNCTION IF EXISTS public\.journal_etapes_republication\(\)/.test(inv), 'l’inverse existe');

console.log(`✓ selftest:heures-etapes-republication — ${n} assertions`);
