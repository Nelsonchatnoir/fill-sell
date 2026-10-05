// Autotest de la COPIE CLOUD de l'extension (scripts/cloud/build-extension-cloud.mjs)
// et de la capacité « poste_cloud » de get-pending-jobs.
//
//     npm run selftest:cloud-extension
//
// Prouve, sur le chrome-extension/ ACTUEL du dépôt (sans rien écrire) :
//   · chaque patch trouve son ancre UNE fois (sinon la copie Cloud ne se construit pas) ;
//   · le background patché reste du JavaScript valide ;
//   · le manifeste Cloud : Vinted, Leboncoin, Beebs, fillsell.app, Supabase — ni eBay
//     ni Opla ; une clé fixe (identifiant dnankhhfellobiobloopcjgkdioblpjd) ;
//   · chrome-extension/ lui-même n'est PAS touché (le parc reste identique) ;
//   · get-pending-jobs : sans « poste_cloud », rien ne change ; avec, ni eBay ni
//     Opla servis, ni extension_build écrasé.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { patcherBackground, patcherManifeste, ID_EXTENSION_CLOUD, PLATEFORMES } from './cloud/build-extension-cloud.mjs';

let ko = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bg = readFileSync(path.join(racine, 'chrome-extension', 'background.js'), 'utf8');
const man = JSON.parse(readFileSync(path.join(racine, 'chrome-extension', 'manifest.json'), 'utf8'));

console.log('\n1. Les patchs du background');
const { bg: bg2, appliques } = patcherBackground(bg);
ok(appliques.length === 11, `11 patchs appliqués, chacun sur une ancre UNIQUE (${appliques.length})`);
const tmp = mkdtempSync(path.join(tmpdir(), 'fs-cloud-'));
try {
  writeFileSync(path.join(tmp, 'bg.js'), bg2);
  execFileSync(process.execPath, ['--check', path.join(tmp, 'bg.js')], { stdio: 'pipe' });
  ok(true, 'background patché : JavaScript valide (node --check)');
} catch { ok(false, 'background patché : JavaScript valide (node --check)'); } finally { rmSync(tmp, { recursive: true, force: true }); }
ok(bg2.includes('caps.push("poste_cloud");'), 'le poste se déclare « poste_cloud »');
ok(bg2.includes('rep.connexion_commands = [];'), 'les demandes « Me connecter » de l\'extension sont ignorées (l\'écran Cloud s\'en charge)');
ok(bg2.includes('const RELEVE_PLATEFORMES = ["leboncoin", "beebs"];') && bg2.includes('const VENTES_PLATEFORMES = ["vinted", "leboncoin"];'), 'relevés : ni eBay ni Opla');
ok((bg2.match(/&platform=in\.\(vinted,leboncoin,beebs\)/g) ?? []).length === 3, 'détection de vente, URL manquantes, reprise des orphelins : bornées aux plateformes du Cloud');
ok(!/FILLSELL_CLOUD/.test(bg), 'chrome-extension/background.js du dépôt : INTACT (aucune trace du Cloud)');

console.log('\n2. Le manifeste Cloud');
const m2 = patcherManifeste(man);
const hotes = m2.host_permissions.join(' ');
ok(!/ebay|opla/.test(hotes), 'ni eBay ni Opla dans les permissions d\'hôte');
ok(PLATEFORMES.every((p) => hotes.includes(p === 'beebs' ? 'beebs.app' : `${p}.fr`)) && hotes.includes('fillsell.app') && /supabase\.co/.test(hotes), 'Vinted, Leboncoin, Beebs, fillsell.app, Supabase');
ok(!('optional_host_permissions' in m2), 'aucune permission optionnelle (Opla) : le poste dit « sans_opla »');
ok(m2.content_scripts.length === 4 && !JSON.stringify(m2.content_scripts).includes('ebay'), 'content scripts : fillsell.app + les 3 plateformes');
const der = Buffer.from(m2.key, 'base64');
const id = [...createHash('sha256').update(der).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
ok(id === ID_EXTENSION_CLOUD, `identifiant fixe : ${id}`);
ok(m2.version === man.version && m2.version_name === `${man.version}-cloud`, `même version que le parc (${man.version}), nom « -cloud »`);
ok(!('key' in man), 'le manifeste du parc n\'a pas de clé (identifiant du Chrome Web Store intact)');

console.log('\n3. get-pending-jobs — la capacité « poste_cloud »');
const gpj = readFileSync(path.join(racine, 'supabase', 'functions', 'get-pending-jobs', 'index.ts'), 'utf8');
ok(/const posteCloud = capacites\.includes\("poste_cloud"\);/.test(gpj), 'lue dans les capacités déclarées (absente pour tout le parc)');
ok(/if \(build && !posteCloud\) patch\.extension_build = build;/.test(gpj), 'un poste Cloud n\'écrase pas profiles.extension_build');
ok(/if \(majAttente !== null && !posteCloud\)/.test(gpj), 'ni la mise à jour en attente de l\'ordinateur');
const iFiltre = gpj.indexOf('if (posteCloud && out.some(');
const iReserve = gpj.indexOf('admin.rpc("reserver_jobs_extension"');
ok(iFiltre > 0 && iFiltre < iReserve, 'le filtre des plateformes passe AVANT la réservation (jamais réservé ce qu\'il ne fera pas)');
ok(/const PLATEFORMES_POSTE_CLOUD = \["vinted", "leboncoin", "beebs"\];/.test(gpj), 'Vinted, Leboncoin, Beebs — même liste que la copie Cloud');

console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
