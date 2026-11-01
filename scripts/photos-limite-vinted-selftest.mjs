// selftest:photos-limite-vinted — VINTED REÇOIT LES 20 PREMIÈRES PHOTOS, LES AUTRES PLATEFORMES GARDENT TOUT (01/11,
// Jocabroc : 24 photos → « 20/24 confirmée(s) après 97 s », publication annulée avant le dépôt).
//
//   npm run selftest:photos-limite-vinted
//
//   A. la règle pure (_shared/photos-limite-plateforme.js) : Vinted coupé à 20 dans l'ordre du job ; 20 ou moins,
//      autre plateforme, liste absente : le même objet, intact ;
//   B. get-pending-jobs : chaque job servi passe par la règle juste avant la réponse, la photo de la fiche posée sur
//      une capture de recréation Vinted aussi ; le job en base n'est pas réécrit ;
//   C. la limite est la même que celle que l'app affiche (photosParPlateforme.js) et que republish-capture-photos.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const { PHOTOS_MAX_VINTED, photosDansLaLimite, jobDansLaLimitePhotos } =
  await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/photos-limite-plateforme.js')).href);
const { PHOTOS_MAX_PLATEFORME } = await import(pathToFileURL(path.join(RACINE, 'src/publication/photosParPlateforme.js')).href);
const GPJ = lire('supabase/functions/get-pending-jobs/index.ts');
const CAPTURE = lire('supabase/functions/republish-capture-photos/index.ts');

let echecs = 0, total = 0;
const ok = (c, l) => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}`); };
const photos = (n) => Array.from({ length: n }, (_, i) => ({ url: `https://x/p${i + 1}.jpg`, type: i ? `photo_${i}` : 'original' }));

// ── A. La règle ──────────────────────────────────────────────────────────────
ok(PHOTOS_MAX_VINTED === 20, 'A1. Vinted : 20 photos au plus');
const p24 = photos(24);
const v = photosDansLaLimite('vinted', p24);
ok(v.length === 20 && v.every((p, i) => p === p24[i]) && p24.length === 24, 'A2. 24 photos → les 20 premières, dans l\'ordre, la liste d\'origine intacte');
const p20 = photos(20);
ok(photosDansLaLimite('vinted', p20) === p20 && photosDansLaLimite('vinted', photos(3)).length === 3, 'A3. 20 photos ou moins : inchangé (même objet)');
ok(['leboncoin', 'beebs', 'ebay', 'depop', 'opla'].every((pf) => photosDansLaLimite(pf, p24) === p24),
  'A4. Leboncoin, Beebs, eBay, Depop, Opla : toutes les photos gardées (24 → 24)');
ok(photosDansLaLimite('vinted', null) === null && photosDansLaLimite('vinted', undefined) === undefined
  && photosDansLaLimite('vinted', 'x') === 'x', 'A5. liste absente ou illisible : rendue telle quelle');
const job = { id: 'j1', platform: 'vinted', action: 'publish', photos: p24, platform_fields: { a: 1 } };
const servi = jobDansLaLimitePhotos(job);
ok(servi !== job && servi.photos.length === 20 && job.photos.length === 24 && servi.platform_fields === job.platform_fields
  && servi.id === 'j1', 'A6. job Vinted servi : copie à 20 photos, le job d\'origine garde ses 24, le reste identique');
const jobLbc = { id: 'j2', platform: 'leboncoin', photos: p24 };
ok(jobDansLaLimitePhotos(jobLbc) === jobLbc && jobDansLaLimitePhotos({ id: 'j3', platform: 'vinted', action: 'delete' }).photos === undefined,
  'A7. job d\'une autre plateforme ou sans photos (retrait) : le même objet');

// ── B. get-pending-jobs ──────────────────────────────────────────────────────
ok(GPJ.includes('import { PHOTOS_MAX_VINTED, jobDansLaLimitePhotos } from "../_shared/photos-limite-plateforme.js";'), 'B1. la règle est importée');
const iMap = GPJ.indexOf('out = out.map((j) => jobDansLaLimitePhotos(j) as typeof j);');
const iRet = GPJ.indexOf('return json({\n      jobs: out,');
const entre = iMap > 0 ? GPJ.slice(GPJ.indexOf('\n', iMap), iRet) : '';
ok(iMap > 0 && iRet > iMap && !entre.includes('out = ') && !entre.includes('out.push'),
  'B2. chaque job servi passe par la règle juste avant la réponse (plus rien ne réécrit la liste après)');
ok(GPJ.split('jobDansLaLimitePhotos(').length === 2, 'B3. un seul point d\'application dans la file');
ok(GPJ.includes('if (photosFiche) majCap.photos_urls = photosFiche.slice(0, PHOTOS_MAX_VINTED);')
  && !GPJ.includes('if (photosFiche) majCap.photos_urls = photosFiche;'), 'B4. recréation Vinted : la capture reçoit les 20 premières photos de la fiche');
ok(!/majJ\.photos = [^;]*slice/.test(GPJ) && !/update\(\{ *photos: [^}]*slice/.test(GPJ), 'B5. le job en base n\'est jamais réécrit à 20 (la fiche et ses autres plateformes gardent tout)');

// ── C. Une seule limite ──────────────────────────────────────────────────────
ok(PHOTOS_MAX_PLATEFORME.vinted === PHOTOS_MAX_VINTED, 'C1. même limite que l\'app (« Vinted : 20 photos au plus »)');
ok(/MAX_PHOTOS\s*=\s*20\b/.test(CAPTURE), 'C2. même limite que republish-capture-photos (MAX_PHOTOS = 20)');

console.log(echecs ? `\n✗ ${echecs} échec(s) sur ${total}` : `\n✓ ${total} vérifications vertes`);
process.exit(echecs ? 1 : 0);
