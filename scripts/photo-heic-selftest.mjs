// selftest:photo-heic — (04/11, point 7, romain.guerin85) UNE PHOTO HEIC N'ENTRE JAMAIS DANS UNE FICHE.
// Le 03/11, heic2any 0.0.4 (embarqué dans l'app) a refusé un HEIC (« ERR_LIBHEIF format not supported ») : la photo et
// les suivantes n'ont pas été ajoutées, sans un mot (promesse rejetée attrapée nulle part). Ce test verrouille :
//   1. le format se lit dans les OCTETS (_shared/format-photo.js) : JPEG, PNG, WebP, HEIC (marques ftyp), AVIF ;
//   2. la conversion passe d'abord par le SERVEUR (photo-heic-jpeg), dont la sortie est relue dans les octets ;
//   3. le câblage : l'ajout de photos dit l'échec au lieu de le taire, le viseur Lens ne pose jamais un HEIC dans
//      lens-temp, la fonction lit le format en entrée ET en sortie et efface l'original quoi qu'il arrive.
//
//   npm run selftest:photo-heic
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d !== undefined ? ` — ${String(d).slice(0, 300)}` : ''}`); } };

const F = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/format-photo.js')).href);
const D = await import(pathToFileURL(join(ROOT, 'src/utils/imageDecode.js')).href);

// Une boîte ftyp : taille, « ftyp », marque majeure, version, marques compatibles.
const ftyp = (majeure, ...compat) => {
  const marques = [majeure, '\0\0\0\0', ...compat].join('');
  const taille = 8 + marques.length;
  return new Uint8Array([(taille >>> 24) & 255, (taille >>> 16) & 255, (taille >>> 8) & 255, taille & 255,
    ...Buffer.from('ftyp' + marques, 'latin1'), 0, 0, 0, 0, 0, 0, 0, 0]);
};

console.log('1. Le format lu dans les octets');
ok(F.formatPhoto(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1])) === 'jpeg', 'JPEG (FF D8 FF)');
ok(F.formatPhoto(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13])) === 'png', 'PNG');
ok(F.formatPhoto(Buffer.from('RIFF\x10\0\0\0WEBPVP8 ', 'latin1')) === 'webp', 'WebP');
ok(F.formatPhoto(ftyp('heic', 'mif1', 'heic')) === 'heic', 'HEIC d\'iPhone (heic / mif1, heic)');
ok(F.formatPhoto(ftyp('mif1', 'mif1', 'heic', 'hevc')) === 'heic', 'HEIF à marque majeure mif1, compatible heic');
ok(F.formatPhoto(ftyp('heix', 'mif1')) === 'heic' && F.formatPhoto(ftyp('hevc', 'msf1')) === 'heic', 'variantes heix, hevc (séquence)');
ok(F.formatPhoto(ftyp('avif', 'avif', 'mif1', 'miaf')) === 'avif', 'AVIF (jamais confondu avec un HEIC)');
ok(F.formatPhoto(ftyp('isom', 'isom', 'mp41')) === 'inconnu' && F.formatPhoto(new Uint8Array(4)) === 'inconnu', 'une vidéo ou un fichier tronqué : inconnu');
ok(JSON.stringify(F.FORMATS_UNIVERSELS) === '["jpeg","png","webp"]', 'les formats que tout le monde décode : JPEG, PNG, WebP');

console.log('2. La conversion serveur, relue dans les octets');
{
  const heic = new Blob([ftyp('heic', 'mif1', 'heic')], { type: '' });
  const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1])], { type: 'application/octet-stream' });
  ok(await D.formatDuFichier(heic) === 'heic', 'un HEIC sans type ni nom est reconnu');
  const sortie = await D.convertirHeicParLeServeur(heic, { invoquer: async () => jpeg });
  ok(sortie instanceof Blob && sortie.type === 'image/jpeg' && sortie.size === jpeg.size, 'la réponse du serveur (octet-stream) devient un JPEG typé');
  let err = null;
  try { await D.convertirHeicParLeServeur(heic, { invoquer: async () => heic }); } catch (e) { err = e.message; }
  ok(err === 'conversion_serveur_heic', 'un serveur qui rendrait encore du HEIC : refusé', err);
  err = null;
  try { await D.convertirHeicParLeServeur(heic, { invoquer: async () => 'texte' }); } catch (e) { err = e.message; }
  ok(err === 'conversion_serveur_vide', 'une réponse qui n\'est pas une image : refusée', err);
  const r = await D.versFormatUniversel(jpeg, 'image/jpeg');
  ok(r.blob === jpeg && r.converti === false && r.mime === 'image/jpeg', 'un JPEG passe inchangé (aucun appel)');
  const im = lire('src/utils/imageDecode.js');
  const iServeur = im.indexOf('return await convertirHeicParLeServeur(file);');
  const iLocal = im.indexOf('const { default: heic2any } = await import("heic2any");');
  ok(iServeur > 0 && iLocal > iServeur, 'le serveur d\'abord, heic2any en secours seulement');
  ok(/if \(!estProbablementHeic\(file\) && \(await formatDuFichier\(file\)\) !== "heic"\) throw e;/.test(im), 'un HEIC sans nom ni type passe aussi par la conversion');
}

console.log('3. Le câblage');
{
  const lps = lire('src/components/ListingPreviewScreen.jsx');
  const h = lps.slice(lps.indexOf('async function handleAddMorePhotos(files) {'), lps.indexOf('function handleRemovePhoto(idx) {'));
  ok(/surErreur: "ignorer"/.test(h) && /setUploadError\(/.test(h) && /catch \(e\) \{\s*setUploadError/.test(h), 'ajout de photos : une photo illisible est sautée ET dite, jamais une promesse perdue');
  const app = lire('src/App.jsx');
  const iConv = app.indexOf('const{blob,mime}=await versFormatUniversel(blobLu,mimeLu);');
  const iUp = app.indexOf("await supabase.storage.from('lens-temp').upload(path,blob,{contentType:mime});");
  ok(iConv > 0 && iUp > iConv && iUp - iConv < 600, 'viseur Lens : rien n\'entre dans lens-temp sans passer par versFormatUniversel');
  const fn = lire('supabase/functions/photo-heic-jpeg/index.ts');
  ok(/const entree = formatPhoto\(octets\.subarray\(0, 512\)\);\s*if \(entree !== "heic"\) return json\(\{ error: "pas_heic"/.test(fn), 'fonction : n\'accepte qu\'un HEIC (lu dans les octets)');
  ok(/!FORMATS_UNIVERSELS\.includes\(format\)/.test(fn) && /\/storage\/v1\/render\/image\/authenticated\//.test(fn), 'fonction : la sortie de la transformation est relue dans les octets');
  ok(/finally \{\s*await admin\.storage\.from\(BUCKET_TEMPORAIRE\)\.remove\(\[chemin\]\)/.test(fn), 'fonction : l\'original est effacé quoi qu\'il arrive');
  ok(/auth\.getUser\(\)/.test(fn) && /\[functions\.photo-heic-jpeg\]\nverify_jwt = true/.test(lire('supabase/config.toml')), 'fonction : appelant connecté seulement (verify_jwt true + session lue)');
  ok(/https:\/\/esm\.sh\/@supabase\/supabase-js@2\.\d+\.\d+/.test(fn), 'import distant épinglé');
}

console.log(ko ? `\n✗ photo-heic : ${ko} rouge(s) sur ${n}` : `\n✓ photo-heic : ${n} contrôles verts`);
process.exit(ko ? 1 : 0);
