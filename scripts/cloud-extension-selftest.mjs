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
import { patcherBackground, patcherManifeste, ID_EXTENSION_CLOUD, PLATEFORMES, SOURCE_CONNEXION_CLOUD } from './cloud/build-extension-cloud.mjs';

let ko = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bg = readFileSync(path.join(racine, 'chrome-extension', 'background.js'), 'utf8');
const man = JSON.parse(readFileSync(path.join(racine, 'chrome-extension', 'manifest.json'), 'utf8'));

console.log('\n1. Les patchs du background');
const { bg: bg2, appliques } = patcherBackground(bg);
ok(appliques.length === 12, `12 patchs appliqués, chacun sur une ancre UNIQUE (${appliques.length})`);
const tmp = mkdtempSync(path.join(tmpdir(), 'fs-cloud-'));
try {
  writeFileSync(path.join(tmp, 'bg.js'), bg2);
  execFileSync(process.execPath, ['--check', path.join(tmp, 'bg.js')], { stdio: 'pipe' });
  ok(true, 'background patché : JavaScript valide (node --check)');
} catch { ok(false, 'background patché : JavaScript valide (node --check)'); } finally { rmSync(tmp, { recursive: true, force: true }); }
ok(bg2.includes('caps.push("poste_cloud");'), 'le poste se déclare « poste_cloud »');
ok(bg2.includes('rep.connexion_commands = [];'), 'les demandes « Me connecter » de l\'extension sont ignorées (l\'écran Cloud s\'en charge)');
ok(bg2.includes('const RELEVE_PLATEFORMES = ["leboncoin", "beebs"];') && bg2.includes('const VENTES_PLATEFORMES = ["vinted", "leboncoin"];'), 'relevés : ni eBay ni Opla');
ok((bg2.match(/&platform=in\.\(vinted,leboncoin,beebs,depop\)/g) ?? []).length === 3, 'détection de vente, URL manquantes, reprise des orphelins : bornées aux plateformes du Cloud');
ok(!/FILLSELL_CLOUD/.test(bg), 'chrome-extension/background.js du dépôt : INTACT (aucune trace du Cloud)');

// (30/10, règle de Nico) Aucune visite automatique d'une plateforme non connectée : la sonde passe d'abord par
// connexionCloudPresente (cookies seulement) ; exécutée ici sur des cookies fabriqués.
ok(bg2.includes('connexionCloudPresente(pf).then((oui) => (oui ? probe(fn) : { etat: null, http: null })'),
  'sonde de session : la requête ne part que si le cookie de connexion est là (sinon « non mesurée », aucune requête)');
ok(!bg.includes('connexionCloudPresente'), 'la sonde de l’extension du parc (bureau) : INCHANGÉE');
{
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = (o) => `e30.${b64(o)}.sig`;
  const verifier = async (pf, cookies) => {
    const chrome = { cookies: { getAll: async ({ domain }) => cookies.filter((c) => c.domain === domain) } };
    const f = new Function('chrome', 'atob', `${SOURCE_CONNEXION_CLOUD}; return connexionCloudPresente;`)(chrome, (s) => Buffer.from(s, 'base64').toString('binary'));
    return f(pf);
  };
  ok(await verifier('leboncoin', []) === false, 'profil neuf, Leboncoin : non connectée → aucune visite');
  ok(await verifier('leboncoin', [{ domain: 'leboncoin.fr', name: 'datadome', value: 'x' }]) === false, 'Leboncoin avec le seul cookie DataDome (page déjà vue) : toujours non connectée');
  ok(await verifier('leboncoin', [{ domain: 'leboncoin.fr', name: '__Secure-Login', value: 'abc' }]) === true, 'Leboncoin avec __Secure-Login : connectée → la sonde part');
  ok(await verifier('beebs', [{ domain: 'beebs.app', name: 'access_token', value: jwt({ sub: 'g', role: 'guest' }) }]) === false, 'Beebs, jeton d’invité : non connectée');
  ok(await verifier('beebs', [{ domain: 'beebs.app', name: 'access_token', value: jwt({ sub: '42', role: 'user' }) }]) === true, 'Beebs, jeton d’utilisateur : connectée');
  ok(await verifier('vinted', [{ domain: 'vinted.fr', name: 'access_token_web', value: jwt({ sub: 7 }) }]) === false, 'Vinted sans refresh_token_web : non connectée');
  ok(await verifier('vinted', [{ domain: 'vinted.fr', name: 'access_token_web', value: jwt({ sub: 7 }) }, { domain: 'vinted.fr', name: 'refresh_token_web', value: 'r' }]) === true, 'Vinted jeton + refresh : connectée');
  ok(await verifier('depop', [{ domain: 'depop.com', name: 'access_token', value: 't' }]) === true && await verifier('depop', []) === false, 'Depop : access_token présent / absent');
  ok(await verifier('ebay', []) === false, 'plateforme hors Cloud : jamais « connectée »');
}

console.log('\n2. Le manifeste Cloud');
const m2 = patcherManifeste(man);
const hotes = m2.host_permissions.join(' ');
ok(!/ebay|opla/.test(hotes), 'ni eBay ni Opla dans les permissions d\'hôte');
ok(PLATEFORMES.every((p) => hotes.includes(p === 'beebs' ? 'beebs.app' : p === 'depop' ? 'www.depop.com' : `${p}.fr`)) && hotes.includes('fillsell.app') && /supabase\.co/.test(hotes), 'Vinted, Leboncoin, Beebs, Depop (30/10), fillsell.app, Supabase');
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
ok(/const PLATEFORMES_POSTE_CLOUD = \["vinted", "leboncoin", "beebs", "depop"\];/.test(gpj), 'Vinted, Leboncoin, Beebs, Depop — même liste que la copie Cloud');

console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
