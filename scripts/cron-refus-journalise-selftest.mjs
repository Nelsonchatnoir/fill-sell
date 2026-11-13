// ═══════════════════════════════════════════════════════════════════════════
// VERROU — LES REFUS DE CADENCE DU RELEVÉ VINTED AUTOMATIQUE, JOURNALISÉS ET COMPTÉS (13/11/2026, étape 5, bloc 6 P3)
//   npm run selftest:cron-refus-journalise
// ═══════════════════════════════════════════════════════════════════════════
// Feu vert de Nico (bloc 6, P3) : « journaliser les refus : usage_logs + ops-digest ». Le défaut (audit du 12/11, bloc 6 i) :
// l'extension refuse le relevé automatique (alarme « cron ») quand le dernier relevé réussi a moins de 20 h
// (background.js, SYNC_CRON_COOLDOWN_MS) — ≈ 491 refus en 7 jours sur 127 comptes — et n'en écrit qu'une NOTE écrasée sur
// le relevé porteur (« [note] cadence cron : N sync 'cron' refusée(s) depuis ce run (fenêtre de 20 h), dernière le … ») :
// aucune ligne usage_logs, rien dans ops-digest, invisible. Cas réel : 447d920c, relevé de geste du 11/11 20:29 (Paris),
// cron refusé le 12/11 à 10:34 → aucun relevé Vinted automatique pendant ~38 h.
// La règle (côté SERVEUR, pour que TOUTES les versions de l'extension comptent) : un déclencheur sur la note
// (migration 20261113154000, base jetable : node scripts/essais/20261113154000_banc.mjs) écrit une ligne usage_logs
// « cron_refuse » par refus ; ops-digest les compte (24 h, comptes, délai depuis le dernier relevé), et lit les notes des
// relevés porteurs tant que la migration n'est pas appliquée. Ni la cadence ni la règle des 20 h ne changent.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => { try { return fs.readFileSync(path.join(RACINE, p), 'utf8'); } catch { return ''; } };
let R = {};
try { R = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/cron-refus.js')).href); } catch { R = {}; }

let ko = 0, n = 0;
const ok = (c, nom, d = '') => { n++; if (c) console.log(`  ✓ ${nom}`); else { ko++; console.log(`  ✗ ${nom}${d ? `\n      ← ${d}` : ''}`); } };
const fn = (nom) => (typeof R[nom] === 'function' ? R[nom] : null);

console.log('\nA. LA NOTE DU RELEVÉ PORTEUR (ce que TOUTES les versions de l\'extension écrivent déjà)');
const NOTE_REELLE = "[note] cadence cron : 1 sync 'cron' refusée(s) depuis ce run (fenêtre de 20 h), dernière le 2026-11-12T09:34:13.830Z";
const lu = fn('lireNoteCadenceCron') ? R.lireNoteCadenceCron(NOTE_REELLE) : null;
ok(lu && lu.compteur === 1 && lu.derniere === '2026-11-12T09:34:13.830Z', '447d920c (relevé du 11/11 20:29) : compteur 1, dernier refus le 12/11 09:34 UTC', JSON.stringify(lu));
const autre = `[note] reprise auto | [note] cadence cron : 7 sync 'cron' refusée(s) depuis ce run (fenêtre de 20 h), dernière le 2026-11-13T05:00:00.000Z`;
ok(fn('lireNoteCadenceCron') && R.lireNoteCadenceCron(autre)?.compteur === 7, 'segment au milieu d\'autres notes : compteur 7');
ok(fn('lireNoteCadenceCron') && R.lireNoteCadenceCron('[note] rien à voir') === null && R.lireNoteCadenceCron(null) === null, 'sans segment : null (jamais un refus inventé)');

console.log('\nB. LE COMPTE (24 h) — usage_logs « cron_refuse »');
const MAINT = Date.parse('2026-11-13T12:00:00Z');
const ligne = (u, age, nouveaux = 1) => ({ user_id: u, feature: 'cron_refuse', metadata: { age_min: age, nouveaux }, created_at: new Date(MAINT - 3600e3).toISOString() });
const lignes = [ligne('447d920c-0000-4000-8000-000000000001', 845), ligne('447d920c-0000-4000-8000-000000000001', 30), ligne('faf5021a-0000-0000-0000-000000000000', 300), ligne('aaaaaaaa-0000-0000-0000-000000000000', 1100, 2)];
const res = fn('resumerRefusCron') ? R.resumerRefusCron(lignes) : null;
ok(res && res.total === 5 && res.comptes === 3, '5 refus (une ligne peut en porter 2) sur 3 comptes', JSON.stringify(res));
ok(res && res.parTranche.moins_1h === 1 && res.parTranche['1_12h'] === 1 && res.parTranche['12_20h'] === 3, 'tranches : < 1 h (inoffensifs) 1, 1-12 h 1, 12-20 h (ceux qui coûtent un jour) 3', JSON.stringify(res?.parTranche));
const txt = fn('texteRefusCron') ? R.texteRefusCron(res, { source: 'journal' }) : '';
ok(/5 refus/.test(txt) && /3 comptes/.test(txt) && /12-20 h : 3/.test(txt), 'la ligne du digest dit le nombre, les comptes et les refus qui coûtent un jour', txt);

console.log('\nC. REPLI AVANT LA MIGRATION — les notes des relevés porteurs (borne haute)');
const runs = [
  { user_id: '447d920c-0000-4000-8000-000000000001', erreur: NOTE_REELLE, finished_at: '2026-11-11T19:29:00Z' },
  { user_id: 'bbbbbbbb-0000-0000-0000-000000000000', erreur: "[note] cadence cron : 3 sync 'cron' refusée(s) depuis ce run (fenêtre de 20 h), dernière le 2026-11-11T02:00:00Z", finished_at: '2026-11-10T20:00:00Z' },
  { user_id: 'cccccccc-0000-0000-0000-000000000000', erreur: "[note] cadence cron : 2 sync 'cron' refusée(s) depuis ce run (fenêtre de 20 h), dernière le 2026-11-13T06:00:00Z", finished_at: '2026-11-12T22:00:00Z' },
];
const rp = fn('resumerNotesPorteurs') ? R.resumerNotesPorteurs(runs, '2026-11-12T09:00:00Z') : null;
ok(rp && rp.porteurs === 2 && rp.comptes === 2 && rp.total === 3, 'notes : 2 porteurs avec un refus dans les 24 h (le 3e, dernier refus le 11/11, écarté), 3 refus au plus', JSON.stringify(rp));

console.log('\nD. OPS-DIGEST');
const od = lire('supabase/functions/ops-digest/index.ts');
ok(/from "\.\.\/_shared\/cron-refus\.js"/.test(od), 'ops-digest importe la règle partagée (_shared/cron-refus.js)');
ok(/lirePagesUsage\(\["cron_refuse"\], iso24h\)/.test(od), 'ops-digest lit usage_logs « cron_refuse » des 24 h (par pages)');
ok(/\.like\("erreur", "%cadence cron :%"\)/.test(od), 'repli : les notes des relevés porteurs (avant la migration)');
ok(/Refus de cadence du relevé Vinted automatique/.test(od) && /cron_refus_24h/.test(od), 'section du digest + compteur dans la réponse');
// (13/11, décision de Nico — question I5 : « rouge au-delà d'un seuil ») Sous le seuil, la section reste informative : le
// NOMBRE de refus n'entre jamais dans les anomalies ; seul le seuil franchi y compte, pour une (selftest:cron-refus-seuil).
{
  const counts = od.slice(od.indexOf('const counts = {'), od.indexOf('const total = Object.values(counts)'));
  const lignesCron = counts.match(/cron_refus[a-z_]*:[^\n]*/g) ?? [];
  ok(od.includes('cron_refus_24h') && lignesCron.length === 1 && /^cron_refus_au_dela_du_seuil:\s*cronRefusRouge \? 1 : 0/.test(lignesCron[0]),
    'informatif sous le seuil : le nombre de refus n\'entre PAS dans les anomalies (seul le seuil franchi compte, pour une)', lignesCron.join(' | '));
}

console.log('\nE. LA MIGRATION (préparée, NON appliquée), SON INVERSE, SON BANC');
const mig = lire('supabase/migrations/20261113154000_cron_refus_journalise.sql');
ok(/CREATE TRIGGER cron_refus_journalise AFTER UPDATE OF erreur ON public\.vinted_sync_runs/.test(mig), 'déclencheur AFTER UPDATE OF erreur sur vinted_sync_runs (la note, jamais la cadence)');
ok(/WHEN \(\(?NEW\.kind = 'dressing'/.test(mig) && /NEW\.erreur IS DISTINCT FROM OLD\.erreur/.test(mig) && /LIKE '%cadence cron :%'/.test(mig), 'filtré dans WHEN : relevés du dressing, note changée, segment de cadence présent');
ok(fn('lireNoteCadenceCron') && mig.includes(R.RE_COMPTEUR_SQL) && mig.includes(R.RE_DERNIERE_SQL), 'la base lit la note avec LES MÊMES motifs que _shared/cron-refus.js', `${R.RE_COMPTEUR_SQL} | ${R.RE_DERNIERE_SQL}`);
ok(/INSERT INTO usage_logs \(user_id, feature, metadata\)/.test(mig) && /'cron_refuse'/.test(mig), 'une ligne usage_logs « cron_refuse » par hausse du compteur');
ok(/EXCEPTION WHEN others THEN/.test(mig), 'un journal ne bloque JAMAIS l\'écriture de la note');
ok(mig.length > 0 && !/garde_cadence_sync_runs/.test(mig.replace(/^--.*$/gm, '')),'la garde des 20 h (garde_cadence_sync_runs) n\'est pas touchée');
const inv = lire('supabase/rollbacks/20261113154000_cron_refus_journalise_INVERSE.sql');
ok(/DROP TRIGGER IF EXISTS cron_refus_journalise ON public\.vinted_sync_runs/.test(inv) && /DROP FUNCTION IF EXISTS public\.cron_refus_journaliser\(\)/.test(inv), 'inverse : déclencheur et fonction retirés');
ok(lire('scripts/essais/20261113154000_banc.mjs').includes('cron_refus_journaliser'), 'banc sur base jetable présent');
ok(/SYNC_CRON_COOLDOWN_MS = 20 \* 60 \* 60 \* 1000;/.test(lire('chrome-extension/background.js')),'cadence de l\'extension inchangée (20 h)');

console.log(ko ? `\n${ko} ÉCHEC(S) sur ${n}` : `\nTOUT VERT (${n})`);
process.exit(ko ? 1 : 0);
