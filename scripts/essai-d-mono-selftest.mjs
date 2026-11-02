// ═══════════════════════════════════════════════════════════════════════════
// ESSAI D, UN SEUL THREAD — SELFTEST (02/11)
// ═══════════════════════════════════════════════════════════════════════════
// libvips 8.18.7 compilé SANS threads (docs/enquetes/facture-supabase-0211/essai-empreintes-D/mono-thread/),
// déployé dans la fonction de TEST essai-empreintes-d-test, appelée par personne en prod. Ce test fige :
//   1. rien de basculé : le calcul d'empreinte de la prod (transformation Supabase) est inchangé ;
//   2. la fonction de test : garde par SHA-256 du jeton (aucun secret lu), verify_jwt false, 8 photos au plus,
//      bucket listing-photos seulement, rien d'écrit en base ;
//   3. le module : ni Web Worker ni SharedArrayBuffer, mémoire ordinaire (non partagée) de 16 Mo au départ ;
//   4. les mêmes octets que wasm-vips 0.0.19 à threads (l'oracle prouvé identique à Supabase, 200/200) sur des
//      images SYNTHÉTIQUES : réduction ×4 au décodage, réduction ×2 + lanczos ; transparence → hors périmètre.
//
//   npm run selftest:essai-d-mono
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n');
const git = (ref, f) => execFileSync('git', ['show', `${ref}:${f}`], { cwd: racine, encoding: 'utf8' }).replace(/\r\n/g, '\n');
let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

// ── 1. Rien de basculé ─────────────────────────────────────────────────────
console.log('1. La prod garde la transformation Supabase');
for (const f of [
  'supabase/functions/_shared/empreinte-telechargement.ts',
  'supabase/functions/_shared/empreinte-image.ts',
  'supabase/functions/empreintes-urls/index.ts',
  'supabase/functions/photo-empreinte/index.ts',
  'supabase/functions/doublons-balayage/index.ts',
]) {
  ok(lire(f) === git('041baba', f), `${f} : identique à 041baba (avant l'essai mono-thread)`);
}
ok(/urlTransformee\(url, supabaseUrl\)/.test(lire('supabase/functions/_shared/empreinte-telechargement.ts')),
  'empreinterUrl passe toujours par render/image pour notre bucket');
const appelants = execFileSync('git', ['grep', '-l', 'essai-empreintes-d-test', '--', 'src', 'supabase', 'chrome-extension', 'serveur-cloud'],
  { cwd: racine, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
ok(appelants.every((f) => f === 'supabase/config.toml' || f.startsWith('supabase/functions/essai-empreintes-d-test/')),
  `personne n'appelle la fonction de test (${appelants.join(', ')})`);

// ── 2. La fonction de test ─────────────────────────────────────────────────
console.log('2. essai-empreintes-d-test : gardée, sans écriture');
const fn = lire('supabase/functions/essai-empreintes-d-test/index.ts');
const hash = (fn.match(/JETON_SHA256 = "([0-9a-f]{64})"/) || [])[1];
ok(!!hash, 'garde : SHA-256 du jeton écrit dans le code');
ok(!/Deno\.env\.get\("[A-Z_]*(JETON|SECRET|KEY)/.test(fn), 'aucun secret lu dans l\'environnement');
ok(crypto.createHash('sha256').update('').digest('hex') !== hash && crypto.createHash('sha256').update('x').digest('hex') !== hash,
  'un jeton vide ou banal ne passe pas');
ok(/return new Response\("interdit", \{ status: 403 \}\)/.test(fn), 'sans le bon jeton : 403');
ok(/const MAX_PHOTOS = 8;/.test(fn) && /urls\.length > MAX_PHOTOS/.test(fn), '8 photos au plus par appel');
ok(/storage\/v1\/object\/public\/listing-photos\//.test(fn) && /hors bucket listing-photos/.test(fn), 'bucket listing-photos seulement');
ok(!/supabase-js|createClient|\.from\("|\.rpc\(|\.insert\(|\.upsert\(/.test(fn), 'rien d\'écrit en base (aucun client Supabase, aucune table)');
ok(/\[functions\.essai-empreintes-d-test\]\nverify_jwt = false/.test(lire('supabase/config.toml')), 'config.toml : verify_jwt = false');

// ── 3. Le module : un seul thread ──────────────────────────────────────────
console.log('3. vips-mono.mjs : ni Web Worker ni SharedArrayBuffer');
const fichierModule = path.join(racine, 'supabase/functions/essai-empreintes-d-test/vips-mono.mjs');
const brut = fs.readFileSync(fichierModule, 'latin1');
ok(!/new Worker|SharedArrayBuffer/.test(brut), 'aucun Worker ni SharedArrayBuffer dans le JS');
const dossier = 'docs/enquetes/facture-supabase-0211/essai-empreintes-D/mono-thread/';
const construire = lire(dossier + 'construire.sh');
ok(/-sINITIAL_MEMORY=16MB -sALLOW_MEMORY_GROWTH -sMAXIMUM_MEMORY=160MB/.test(construire),
  'construction : 16 Mo au départ, croissance jusqu\'à 160 Mo');
ok(/grep -q -- "-pthread" _build\/build\.ninja; then echo "ÉCHEC/.test(construire) && !/-sPTHREAD|-sSHARED_MEMORY|-sUSE_PTHREADS/.test(construire),
  'construction : refusée si -pthread apparaît, aucune option de threads');
ok(/^export COMMON_FLAGS="-Os -fwasm-exceptions"$/m.test(lire(dossier + 'env.exemple.sh')), 'drapeaux de wasm-vips 0.0.19 moins -pthread');
const patch = lire('docs/enquetes/facture-supabase-0211/essai-empreintes-D/mono-thread/patch-mono.py');
ok((patch.match(/^remplacer\(/gm) || []).length === 4 && /__EMSCRIPTEN_PTHREADS__/.test(patch), 'correctif libvips : 4 remplacements, actifs sans pthreads seulement');
const g = globalThis;
const sauf = { Worker: g.Worker, SharedArrayBuffer: g.SharedArrayBuffer };
delete g.Worker;
delete g.SharedArrayBuffer;
const { default: VipsMono } = await import(pathToFileURL(fichierModule).href);
const m = await VipsMono();
Object.assign(g, sauf);
ok(m._essai_init() === 0, 'démarre sans Worker ni SharedArrayBuffer');
ok(m.HEAPU8.buffer.constructor.name === 'ArrayBuffer', 'mémoire ordinaire (non partagée)');
ok(m.HEAPU8.length === 16 * 2 ** 20, 'mémoire de départ : 16 Mo');

// ── 4. Les mêmes octets que l'oracle ───────────────────────────────────────
console.log('4. Mêmes octets que wasm-vips 0.0.19 à threads (images synthétiques)');
function reduire(o) {
  const p = m._malloc(o.length);
  m.HEAPU8.set(o, p);
  const pp = m._malloc(4), pl = m._malloc(4), pi = m._malloc(32);
  try {
    const code = m._essai_reduire(p, o.length, pp, pl, pi);
    const infos = Array.from(m.HEAP32.subarray(pi >> 2, (pi >> 2) + 8));
    if (code !== 0) return { code, infos };
    const q = m.HEAPU32[pp >> 2], n = m.HEAPU32[pl >> 2];
    const octets = m.HEAPU8.slice(q, q + n);
    m._essai_liberer(q);
    return { code, infos, octets };
  } finally { m._free(p); m._free(pp); m._free(pl); m._free(pi); }
}
const F = path.join(racine, 'scripts/fixtures/essai-d-mono');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const a = reduire(fs.readFileSync(path.join(F, 'a-1600x1200.jpg')));
ok(a.code === 0 && a.infos[5] === 4 && a.infos[6] === 0, 'A 1600×1200 : réduction ×4 au décodage, sans resize');
ok(a.octets && sha(a.octets) === '861d3d5825e32726cf18fa5db0c29097dec1858d70c98f2b6ac98e971eedb91f', 'A : octets identiques à l\'oracle');
const b = reduire(fs.readFileSync(path.join(F, 'b-1366x1024.jpg')));
ok(b.code === 0 && b.infos[5] === 2 && b.infos[6] === 1, 'B 1366×1024 : réduction ×2 au décodage + resize lanczos');
ok(b.octets && sha(b.octets) === 'e3c8c726e6dc1c4337c2d30e0d6605fd7ef09a92497c02a7838c37f7f1f4868c', 'B : octets identiques à l\'oracle');
const c = reduire(fs.readFileSync(path.join(F, 'c-120x90-alpha.png')));
ok(c.code === 1 && c.infos[2] === 4, 'C PNG à transparence : hors périmètre (reste à Supabase)');
ok(reduire(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])).code === -1, 'octets illisibles : erreur, jamais une empreinte');

console.log(ko ? `\n✗ ${ko} échec(s)` : '\n✓ essai D mono-thread : tout est vert');
process.exit(ko ? 1 : 0);
