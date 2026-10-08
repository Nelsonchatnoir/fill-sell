// ═══════════════════════════════════════════════════════════════════════════
// « SYNCHRONISER » : REPLI SUR LA FILE, PLATEFORMES CHOISIES, CONNEXION (06/10)
// ═══════════════════════════════════════════════════════════════════════════
// Cas Laura (canal direct muet → « échec », aucun relevé Vinted ; trois
// plateformes non choisies relevées) et cas julien (aucune session, 19
// republications en pause muette, « occupée par les republications »).
// Un bloc par point, sans réseau (src/annonces/synchroniser.js + gardes de
// texte sur StockTab, useReleveAnnonces, update-job-status).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SYNC_REPLI_FILE_MS, decisionDemarrage, ciblesReleve, texteConnecteToi,
  jobAttendConnexion, attentesDeConnexion,
} from '../src/annonces/synchroniser.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let echecs = 0;
const ok = (nom, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${nom}`);
  else { echecs += 1; console.log(`  ✗ ${nom}${detail ? ` — ${detail}` : ''}`); }
};
const lire = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\r\n').join('\n');
const stock = lire('src/tabs/StockTab.jsx');
const maintenant = new Date().toISOString();

console.log('\n1. Canal direct muet : repli sur la file, jamais « échec »');
ok('repli en 10 s au plus', SYNC_REPLI_FILE_MS <= 10_000);
ok('avant le délai : on attend', decisionDemarrage({ depuisClicMs: 3_000 }) === 'attendre');
ok('après le délai : file serveur', decisionDemarrage({ depuisClicMs: SYNC_REPLI_FILE_MS + 1 }) === 'repli_file');
ok('relevé vu : on suit', decisionDemarrage({ depuisClicMs: 60_000, runVu: true }) === 'suivre');
ok('question de boutique : on la remontre', decisionDemarrage({ depuisClicMs: 60_000, questionBoutique: true }) === 'question');
ok('StockTab n\'écrit plus « extension_muette_30s »', !stock.includes("raison: 'extension_muette_30s'"));
ok('StockTab ne dit plus « n\'a pas démarré la synchronisation »', !stock.includes("L'extension n'a pas démarré la synchronisation"));
const repli = stock.slice(stock.indexOf('const replierSurLaFile = async'), stock.indexOf('function texteRefusFile'));
ok('le repli passe par demander_sync_dressing (même geste)', repli.includes('demanderSyncDressingServeur()'));
ok('le repli est journalisé à part', repli.includes("'repli_file'"));
ok('le suivi appelle le repli', /decisionDemarrage\(\{ depuisClicMs: Date\.now\(\) - attenduDepuis/.test(stock) && stock.includes('replierSurLaFile();'));
const mig = lire('supabase/migrations/20261005200000_releves_sur_geste.sql');
ok('bouton_distant reste un geste (releve_est_geste)', mig.includes("'^(bouton|bouton_distant|app)(:redemande)?$'"));

console.log('\n2. Un clic ne relève que les plateformes choisies, connectées ou déjà relevées');
const TOUTES = ['vinted', 'leboncoin', 'beebs', 'ebay'];
const sessionsLaura = { vinted: true, ebay: false, leboncoin: null, beebs: null, checked_at: maintenant,
  checked_at_par_plateforme: { vinted: maintenant, ebay: maintenant, leboncoin: maintenant, beebs: maintenant } };
ok('Laura (Vinted seul) : Vinted seul', JSON.stringify(ciblesReleve({ plateformes: TOUTES, choisies: ['vinted'], sessions: sessionsLaura })) === '["vinted"]');
ok('la choisie passe en premier', JSON.stringify(ciblesReleve({ plateformes: TOUTES, choisies: ['leboncoin'], sessions: sessionsLaura })) === '["leboncoin","vinted"]');
ok('déjà relevée : gardée', ciblesReleve({ plateformes: TOUTES, choisies: ['vinted'], dejaRelevees: ['beebs'] }).includes('beebs'));
ok('ordre du choix respecté', JSON.stringify(ciblesReleve({ plateformes: TOUTES, choisies: ['ebay', 'vinted'] })) === '["ebay","vinted"]');
ok('rien de connu : tout, comme avant', JSON.stringify(ciblesReleve({ plateformes: TOUTES })) === JSON.stringify(TOUTES));
ok('session périmée ne compte pas', ciblesReleve({ plateformes: TOUTES, choisies: ['vinted'], sessions: { ebay: true, checked_at: '2020-01-01T00:00:00Z' } }).length === 1);
const hook = lire('src/annonces/useReleveAnnonces.js');
ok('« Tout relever » passe par ciblesReleve', hook.includes('ciblesReleve({') && hook.includes('for (const p of cibles)'));

console.log('\n3. Pas de session : « Connecte-toi à X sur ton ordinateur », synchro comme republication');
ok('même tournure pour chaque plateforme', TOUTES.every((p) => texteConnecteToi(p) === `Connecte-toi à ${{ vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', ebay: 'eBay' }[p]} sur ton ordinateur.`));
ok('job marqué attente_connexion : vu', jobAttendConnexion({ status: 'pending', platform_fields: { attente_connexion: { platform: 'vinted' } } }) === 'vinted');
ok('retrait sans session (motif extension) : vu', jobAttendConnexion({ status: 'pending', platform_fields: { verification_boutique_vinted: { motif: 'session_inconnue' } } }) === 'vinted');
ok('job parti (processing) : plus rien', jobAttendConnexion({ status: 'processing', platform_fields: { attente_connexion: { platform: 'vinted' } } }) === null);
ok('autre boutique : pas une connexion', jobAttendConnexion({ status: 'pending', platform_fields: { verification_boutique_vinted: { motif: 'origine_inconnue' } } }) === null);
const jobsJulien = Array.from({ length: 19 }, () => ({ status: 'pending', platform_fields: { attente_connexion: { platform: 'vinted' } } }));
ok('julien : 19 en attente de Vinted', attentesDeConnexion(jobsJulien).vinted === 19);
ok('relevé Vinted sans session : la phrase', (stock.match(/texteConnecteToi\('vinted', lang\)/g) ?? []).length >= 2);
ok('republication : pastille et bandeau', stock.includes('jobAttendConnexion(job)') && stock.includes('attentesDeConnexion(Object.values(jobsByInventaire).flat())'));
const ujs = lire('supabase/functions/update-job-status/index.ts');
ok('serveur : message et marqueur', ujs.includes('"Connecte-toi à Vinted sur ton ordinateur. Rien n\'a été touché : "') && ujs.includes('pfV.attente_connexion = { platform: "vinted"'));
ok('serveur : marqueur retiré à toute autre écriture', ujs.includes('delete (body.platform_fields as Record<string, unknown>).attente_connexion;'));
ok('serveur : capture sans session reconnue', ujs.includes('v.motif === "preuve_absente_ou_incomplete"') && ujs.includes('vinted_republish_captures'));

console.log('\n4. Des republications en file ne bloquent pas la synchro');
ok('la décision ne regarde pas les republications', decisionDemarrage({ depuisClicMs: 60_000, repubEnVol: 19 }) === 'repli_file');
ok('« occupée » seulement APRÈS la mise en file', (stock.match(/setAttenteOccupee\(true\)/g) ?? []).length === 1 && repli.includes('setAttenteOccupee(true)'));
ok('une demande en file ne lève pas l\'attente', stock.includes("r.status !== 'queued' && (r.status === 'running'"));
ok('le serveur sert la synchro avant les jobs', lire('supabase/functions/get-pending-jobs/index.ts').includes('LA SYNC PASSE DEVANT LA FILE'));

console.log('\n5. En passant : 0.6.100 publiée, seuil inchangé');
const pkg = lire('scripts/package-extension.mjs');
// (08/10) 0.6.100 n'est plus la dernière publiée (0.6.102 l'est) : elle doit être DANS la liste, pas en fin.
ok('0.6.100 dans ALREADY_PUBLISHED', /const ALREADY_PUBLISHED = \[[^\]]*'0\.6\.100'[,\]]/.test(pkg));
ok('EXTENSION_MIN_BUILD non touché', lire('supabase/functions/_shared/version-min-extension.js').includes("EXTENSION_MIN_BUILD = '2026-09-30T20:16:41Z'"));

console.log(echecs ? `\n✗ ${echecs} échec(s)` : '\n✓ tout est vert');
process.exit(echecs ? 1 : 0);
