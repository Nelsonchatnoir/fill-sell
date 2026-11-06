// ═══════════════════════════════════════════════════════════════════════════
// VISUELS DES STORES — les vidéos d'aperçu (06/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Outil, jamais livré. Copie les écrans bruts (store-capture.mjs) dans le projet
// Remotion (C:\Users\nicol\fillsell-video\public\store), rend les six vidéos
// (FR/EN × iPhone 886×1920, iPad 1200×1600, YouTube 1080×1920 ; composition
// src/Store.tsx), l'affiche de chacune (PNG), puis relit chaque fichier avec
// ffprobe (durée, taille, codec, audio).
//
//     node scripts/apercu/store-video.mjs            (tout)
//     node scripts/apercu/store-video.mjs fr iphone  (filtres)
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VIDEO = process.env.FILLSELL_VIDEO || 'C:/Users/nicol/fillsell-video';
const ECRANS = path.join(RACINE, 'build', 'visuels-stores', 'ecrans');
const SORTIE = path.join(RACINE, 'build', 'visuels-stores', 'videos');
const FILTRES = process.argv.slice(2);
// L'affiche : l'image où la promesse se lit d'un coup d'œil (« publiée partout », les cases cochées).
const AFFICHE_IMAGE = 300;

fs.mkdirSync(SORTIE, { recursive: true });
for (const lang of ['fr', 'en']) {
  for (const app of ['telephone', 'tablette']) {
    const de = path.join(ECRANS, lang, app);
    const vers = path.join(VIDEO, 'public', 'store', lang, app);
    fs.mkdirSync(vers, { recursive: true });
    for (const f of fs.readdirSync(de).filter((x) => x.endsWith('.png'))) fs.copyFileSync(path.join(de, f), path.join(vers, f));
  }
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const lancer = (args) => execFileSync(npx, args, { cwd: VIDEO, stdio: ['ignore', 'pipe', 'pipe'], shell: true, maxBuffer: 64 * 1024 * 1024 }).toString();
const bilan = [];
for (const lang of ['fr', 'en']) {
  if (FILTRES.some((f) => ['fr', 'en'].includes(f)) && !FILTRES.includes(lang)) continue;
  for (const format of ['iphone', 'ipad', 'youtube']) {
    if (FILTRES.some((f) => ['iphone', 'ipad', 'youtube'].includes(f)) && !FILTRES.includes(format)) continue;
    const id = `Store-${lang}-${format}`;
    const mp4 = path.join(SORTIE, `${lang}-${format}.mp4`);
    const png = path.join(SORTIE, `${lang}-${format}-affiche.png`);
    console.log(`→ ${id}`);
    lancer(['remotion', 'render', 'src/store-index.ts', id, `"${mp4}"`, '--codec=h264', '--audio-codec=aac', '--pixel-format=yuv420p', '--video-bitrate=10M', '--audio-bitrate=256k', '--log=error']);
    lancer(['remotion', 'still', 'src/store-index.ts', id, `"${png}"`, `--frame=${AFFICHE_IMAGE}`, '--log=error']);
    // Remotion sort du yuvj420p (pleine plage) : réencodé en yuv420p plage TV, H.264 High 4.0, 30 i/s (format d'Apple).
    const tmp = mp4.replace(/\.mp4$/, '.tmp.mp4');
    lancer(['remotion', 'ffmpeg', '-v', 'error', '-y', '-i', `"${mp4}"`, '-vf', '"scale=in_range=pc:out_range=tv,format=yuv420p"', '-c:v', 'libx264', '-profile:v', 'high', '-level:v', '4.0',
      '-b:v', '10M', '-maxrate', '12M', '-bufsize', '20M', '-r', '30', '-movflags', '+faststart', '-c:a', 'copy', `"${tmp}"`]);
    fs.renameSync(tmp, mp4);
    const sonde = JSON.parse(lancer(['remotion', 'ffprobe', '-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', `"${mp4}"`]));
    const v = sonde.streams.find((s) => s.codec_type === 'video');
    const a = sonde.streams.find((s) => s.codec_type === 'audio');
    const ligne = {
      fichier: path.relative(RACINE, mp4), affiche: path.relative(RACINE, png),
      duree_s: Number(sonde.format.duration), octets: Number(sonde.format.size),
      video: `${v?.codec_name} ${v?.width}×${v?.height} ${v?.r_frame_rate} ${v?.pix_fmt}`,
      audio: a ? `${a.codec_name} ${a.channels} canaux ${a.sample_rate} Hz` : 'aucun',
    };
    bilan.push(ligne);
    console.log(`  ${ligne.video} · ${ligne.audio} · ${ligne.duree_s.toFixed(2)} s · ${(ligne.octets / 1e6).toFixed(1)} Mo`);
  }
}
fs.writeFileSync(path.join(SORTIE, 'bilan.json'), JSON.stringify(bilan, null, 2));
