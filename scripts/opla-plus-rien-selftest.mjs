// selftest:opla-plus-rien — après la sortie d'Opla (10/10 00:00 Paris), plus
// AUCUNE action Opla n'est créée ni servie, pour personne (11/10, Nico — A2).
//
//   npm run selftest:opla-plus-rien             contrôles du dépôt (hors ligne)
//   npm run selftest:opla-plus-rien -- --prod   + preuve en prod, transaction ANNULÉE
//        (scripts/preuves/preuve-opla-plus-rien.mjs : jobs, relevés, questions,
//         interrupteur, rattrapage rejoué sur le vrai parc puis annulé)
//
// Contrôles :
//   1. la règle unique (_shared/opla-sortie.js) : publication, republication ET
//      retrait clos ; la phrase de Nico pour un retrait ; Opla plus suivie ;
//   2. la base (migration 20261011130000) : l'interrupteur unique, les messages
//      mot pour mot, aucun job Opla vivant, aucun relevé Opla, « Synchroniser »
//      refuse Opla, aucune question sur une copie Opla, opla_ouvert alignée ;
//   3. get-pending-jobs et handler-watch : rien servi, rien relancé, rien
//      demandé ; retraits compris ;
//   4. l'app : Opla disparaît (relevé, réglages, vente, carte, retrait), rien
//      pour les autres plateformes ; opla_ouvert n'est plus lue ;
//   5. une seule source : opla_sortie_le.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
let echecs = 0;
const ok = (cond, quoi, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`);
  if (!cond) echecs += 1;
};

const M = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/opla-sortie.js')).href);
const MIG = lire('supabase/migrations/20261011130000_opla_sortie_plus_aucune_action.sql');
const GPJ = lire('supabase/functions/get-pending-jobs/index.ts');
const HW = lire('supabase/functions/handler-watch/index.ts');
const APP = lire('src/App.jsx');
const STOCK = lire('src/tabs/StockTab.jsx');
const FILTRES = lire('src/utils/stockFiltres.js');
const HOOK = lire('src/hooks/useSortieOpla.js');
const BASCULE = lire('src/utils/basculeOplaDepop.js');
const RATT = lire('scripts/reparations/20261011_opla_sortie_rattrapage.sql');

console.log('1. La règle unique');
for (const action of ['publish', 'republish', 'delete', null]) {
  for (const status of ['pending', 'needs_user']) {
    ok(M.oplaACloreJob({ platform: 'opla', action, status }), `job Opla ${action ?? 'publish'} ${status} → clos`);
  }
}
for (const status of ['published', 'sold', 'deleted', 'cancelled', 'failed']) {
  ok(!M.oplaACloreJob({ platform: 'opla', action: 'delete', status }), `job Opla ${status} : jamais touché`);
}
for (const pf of ['vinted', 'leboncoin', 'ebay', 'beebs', 'depop']) {
  ok(!M.oplaACloreJob({ platform: pf, action: 'delete', status: 'pending' }), `${pf} : jamais touché`);
}
ok(M.messageClotureOpla('delete') === "Opla n'est plus pris en charge par FillSell : cette annonce vendue est peut-être encore en ligne sur Opla, retire-la toi-même sur Opla.", 'retrait clos : la phrase de Nico');
ok(!M.oplaSuivie({ sortie: true }) && M.oplaSuivie({ sortie: false }), 'Opla suivie avant la sortie seulement, relié ou non');

console.log('\n2. La base (20261011130000)');
ok(/CREATE OR REPLACE FUNCTION public\.opla_sortie_passee\(\)[\s\S]*key = 'opla_sortie_le'[\s\S]*to_timestamp\(1791583200\)/.test(MIG), 'opla_sortie_passee() lit opla_sortie_le (0 = désactivée, absente = 10/10 00:00)');
for (const action of ['delete', 'republish', 'publish']) {
  const js = M.messageClotureOpla(action).replace(/'/g, "''");
  ok(MIG.includes(js), `message « ${action} » mot pour mot identique au module`);
}
ok(/CREATE TRIGGER garde_opla_sortie_jobs\s+BEFORE INSERT OR UPDATE OF status ON public\.cross_post_jobs[\s\S]*WHEN \(NEW\.platform = 'opla' AND NEW\.status IN \('pending', 'processing', 'needs_user'\)\)/.test(MIG), 'tout job Opla qui naît ou redevient vivant est clos (toutes origines)');
ok(/NEW\.status := 'cancelled';/.test(MIG) && /erreurs_archivees/.test(MIG), '… en « cancelled », l\'erreur d\'avant archivée');
ok(/CREATE TRIGGER garde_opla_sortie_releves\s+BEFORE INSERT ON public\.vinted_sync_runs[\s\S]*WHEN \(NEW\.platform = 'opla'\)/.test(MIG) && /RETURN NULL;/.test(MIG), 'aucun relevé Opla créé (app, cron, veilleur)');
ok(/IF v_pf = 'opla' AND public\.opla_sortie_passee\(\) THEN\s+RETURN jsonb_build_object\('ok', false, 'reason', 'invalid_platform'\);/.test(MIG), '« Synchroniser » refuse Opla');
ok(/AND NOT \(j\.platform = 'opla' AND public\.opla_sortie_passee\(\)\)/.test(MIG), 'aucune question « Déjà vendu ? » sur une copie Opla');
ok(/UPDATE public\.coin_config SET value = 0[\s\S]*key = 'opla_ouvert'[\s\S]*coin_config_journal/.test(MIG), 'opla_ouvert alignée à 0, journalisée');
ok(/SECURITY DEFINER/.test(MIG.slice(MIG.indexOf('garde_opla_sortie_jobs()'), MIG.indexOf('garde_opla_sortie_jobs()') + 200)), 'déclencheurs en SECURITY DEFINER (classe du 09/10)');
ok(/UPDATE public\.cross_post_jobs SET status = status\s+WHERE platform = 'opla' AND status IN \('pending', 'processing', 'needs_user'\)/.test(RATT), 'rattrapage par la règle (le déclencheur clôt), sauvegarde avant');

console.log('\n3. Le serveur');
ok(/\/\/ handler-watch, et la base : garde_opla_sortie_jobs\)\.\n  if \(sortieOpla\) return 0;/.test(GPJ), 'get-pending-jobs : plus aucun job Opla parqué relancé');
ok(/if \(sortieOpla\) \{\n      const aClore = out\.filter\(\(j\) => oplaACloreJob\(j\)\);\n      out = out\.filter\(\(j\) => j\.platform !== "opla"\);/.test(GPJ), 'get-pending-jobs : aucun job Opla servi, retraits compris');
ok(/if \(sortieOpla && relevesOplaDemandes\.length\) \{\n      const admin[^\n]*\n      syncCommandsAnnonces = syncCommandsAnnonces\.filter\(\(c\) => c\.platform !== "opla"\);/.test(GPJ), 'get-pending-jobs : aucun relevé Opla, relié ou non');
ok(!/\.or\("action\.is\.null,action\.in\.\(publish,republish\)"\)/.test(HW), 'handler-watch : la clôture vise aussi les retraits');
ok(/\/\/ \(11\/10, Nico\) Après la sortie, aucun job Opla parqué ne repart\.\n  if \(!sortieOpla\) try \{/.test(HW), 'handler-watch : aucune reprise « Autoriser Opla »');
ok(/\/\/ \(11\/10, Nico\) Après la sortie, on ne demande plus « Autoriser Opla »\.\n  if \(!sortieOpla\) try \{/.test(HW), 'handler-watch : aucune demande « Autoriser Opla »');

console.log('\n4. L\'app');
ok(/const relieSuivi = oplaSuivie\(\{ sortie: active \}\) \? relie : false;/.test(HOOK) && /relie: relieSuivi/.test(HOOK), 'useSortieOpla : après la sortie, « relié » = false (relevé, réglages, vente)');
ok(/oplaSuivie: oplaSuivie\(\{ sortie \}\),/.test(BASCULE), 'etatBascule : Opla plus suivie après la sortie');
ok(/if \(j\.platform === 'opla' && !plateformesOuvertes\.includes\('opla'\)\) continue;/.test(FILTRES), 'retrait : Opla plus proposée après la sortie');
ok(/const jobsAll=\(jobsByInventaire\[item\.id\]\|\|\[\]\)\.filter\(j=>j\.platform!=='opla'\|\|plateformesOuvertes\.includes\('opla'\)\);/.test(STOCK), 'carte : Opla disparaît (ni logo, ni attente, ni retrait)');
ok(!/'opla_ouvert'/.test(APP), 'opla_ouvert n\'est plus lue par l\'app');
ok(/oplaVisible=\{!oplaFermee\|\|sortieOpla\.relie===true\}/.test(APP), 'vente : « Opla » ne s\'offre plus (relie = false après la sortie)');
ok(/plateformesDeReleve\(plateformesOuvertes,oplaRelie\)/.test(STOCK), 'relevé : la tuile Opla suit oplaRelie (false après la sortie)');

if (process.argv.includes('--prod')) {
  console.log('\n5. La preuve en prod (transaction annulée)');
  const r = spawnSync('node', ['scripts/preuves/preuve-opla-plus-rien.mjs'], { cwd: RACINE, encoding: 'utf8', shell: true });
  const sortie = `${r.stdout}\n${r.stderr}`;
  console.log(sortie.split('\n').filter((l) => /[✓✗]/.test(l)).map((l) => `    ${l.trim()}`).join('\n'));
  ok(r.status === 0, 'preuve-opla-plus-rien : toutes vertes');
}

console.log(echecs ? `\n✗ ${echecs} échec(s)` : '\nTOUT PASSE');
process.exit(echecs ? 1 : 0);
