// ═══════════════════════════════════════════════════════════════════════════
// LE POSTE CLOUD N'EST PAS UNE EXTENSION — SELFTEST (08/11/2026 nuit, URGENT jade60890)
// ═══════════════════════════════════════════════════════════════════════════
// Le poste Cloud signait profiles.extension_last_seen_at comme une extension installée ; Jade (Cloud arrêté) a été
// envoyée vers la voie extension, ses relevés en attente d'une extension qui n'existe pas. Garantit :
//   1. get-pending-jobs : l'appel d'un poste Cloud ne signe que pour un compte au Cloud ACTIF (.eq cloud_voie) ; il
//      n'écrit jamais le build ni la vraie extension (extension_ordinateur_vu_le) ; une vraie extension écrit les deux ;
//   2. la migration 20261108230000 : colonne de la vraie extension, comptes au Cloud arrêté remis d'aplomb par la règle,
//      déclencheur à l'arrêt du Cloud ; son banc sur base jetable et son inverse existent ;
//   3. l'app décide « extension absente » sur extension_last_seen_at (vraie extension, ou Cloud actif) et ne montre
//      jamais l'extension à un client Cloud (clientCloud) — inchangé.
//   node scripts/poste-cloud-pas-extension-selftest.mjs
import { readFileSync, existsSync } from 'node:fs';

let n = 0;
let ko = 0;
const ok = (c, m) => { n++; if (!c) { ko++; console.log(`  ✗ ${m}`); } else console.log(`  ✓ ${m}`); };
const lire = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
console.log('1. get-pending-jobs');
ok(/const posteCloud = capacites\.includes\("poste_cloud"\);/.test(gpj), 'le poste Cloud se reconnaît à sa capacité déclarée « poste_cloud »');
ok(/if \(posteCloud\) \{\s*await admin\.from\("profiles"\)\.update\(patch\)\.eq\("id", user\.id\)\.eq\("cloud_voie", true\);/.test(gpj), 'poste Cloud : signe seulement pour un Cloud ACTIF (cloud_voie)');
ok(/\} else \{\s*patch\.extension_ordinateur_vu_le = patch\.extension_last_seen_at;\s*await admin\.from\("profiles"\)\.update\(patch\)\.eq\("id", user\.id\);/.test(gpj), 'vraie extension : signe de vie ET extension_ordinateur_vu_le');
ok(/if \(build && !posteCloud\) patch\.extension_build = build;/.test(gpj), 'le poste Cloud n’écrit jamais extension_build');
ok((gpj.match(/extension_ordinateur_vu_le/g) || []).length >= 1 && !/posteCloud[^;\n]*extension_ordinateur_vu_le/.test(gpj), 'extension_ordinateur_vu_le n’est jamais écrit sur un appel du poste Cloud');

console.log('2. migration');
const mig = lire('supabase/migrations/20261108230000_extension_ordinateur_vu_le.sql');
ok(/ADD COLUMN IF NOT EXISTS extension_ordinateur_vu_le timestamptz/.test(mig), 'colonne de la vraie extension');
ok(/_backup_20261108230000_extension_vu/.test(mig), 'sauvegarde avant écriture');
ok(/WHERE p\.cloud_voie IS NOT TRUE[\s\S]*-cloud"%'\)[\s\S]*extension_last_seen_at IS DISTINCT FROM p\.extension_ordinateur_vu_le/.test(mig), 'comptes au Cloud arrêté remis d’aplomb par la règle (aucun compte nommé)');
ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(mig), 'aucun identifiant de compte dans la migration');
ok(/BEFORE UPDATE OF cloud_voie ON public\.profiles/.test(mig) && /OLD\.cloud_voie IS TRUE AND NEW\.cloud_voie IS NOT TRUE/.test(mig), 'déclencheur : à l’arrêt du Cloud, ses signes de vie cessent de compter');
ok(!/^\s*BEGIN\s*;/m.test(mig), 'aucune transaction dans la migration (leçon du 03/11)');
ok(existsSync(new URL('../scripts/essais/20261108230000_banc.mjs', import.meta.url)) && existsSync(new URL('../supabase/rollbacks/20261108230000_extension_ordinateur_vu_le_INVERSE.sql', import.meta.url)), 'banc jetable et inverse présents');

console.log('3. app');
const app = lire('src/App.jsx');
ok(/const extensionNeverSeenEcran=clientCloud\?false:\(etatCompteCloud\.lu\?extensionNeverSeen:null\);/.test(app), 'un client Cloud actif ne voit jamais « installer l’extension » ; sinon la vraie absence fait foi');

console.log(`\n${n - ko}/${n} contrôles verts`);
if (ko) { console.log(`${ko} ROUGE(S)`); process.exit(1); }
