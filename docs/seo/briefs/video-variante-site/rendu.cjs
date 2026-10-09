// Rendu de la variante « site » (09/10/2026, compte « Camille », cinq plateformes, muette).
// Lit node_modules du projet d'origine en LECTURE seule (aucun cache webpack, navigateur déjà
// téléchargé passé explicitement : rien n'est écrit dans C:\Users\nicol\fillsell-video).
//
//   node rendu.cjs <dossier> <A|B> stills <sortieDir> <frame> [<frame>...]   (images à 540×960)
//   node rendu.cjs <dossier> <A|B> video  <sortie.mp4> [crf]                 (1080×1920, sans son)
//   node rendu.cjs <dossier> <A|B> poster <sortie.png> <frame> <scale>
//
// Version A : republication automatique sur Vinted, Leboncoin, Beebs ET Depop (décision de Nico).
// Version B : la même vidéo, Depop retirée de la republication automatique (tant qu'elle n'est pas
// active). C'est le SEUL écart entre A et B (src/data.ts : REPUB_AUTO).
const path = require('node:path');
const fs = require('node:fs');
const NM = 'C:/Users/nicol/fillsell-video/node_modules';
const {bundle} = require(NM + '/@remotion/bundler');
const {renderMedia, renderStill, selectComposition} = require(NM + '/@remotion/renderer');
const BROWSER = NM + '/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';

const VERSIONS = {
  A: {repubAuto: ['vinted', 'leboncoin', 'beebs', 'depop']},
  B: {repubAuto: ['vinted', 'leboncoin', 'beebs']},
};

const [, , rootArg, version, mode, out, ...rest] = process.argv;
const root = path.resolve(rootArg);
const inputProps = VERSIONS[version];
if (!inputProps) throw new Error('version A ou B');

(async () => {
  const bundleDir = path.join(root, '..', 'bundle-' + path.basename(root));
  fs.rmSync(bundleDir, {recursive: true, force: true});
  const serveUrl = await bundle({
    entryPoint: path.join(root, 'src/index.ts'),
    publicDir: path.join(root, 'public'),
    rootDir: root,
    outDir: bundleDir,
    enableCaching: false,
    webpackOverride: (c) => ({
      ...c,
      resolve: {...c.resolve, modules: [NM, 'node_modules']},
      resolveLoader: {...(c.resolveLoader || {}), modules: [NM, 'node_modules']},
    }),
  });
  const id = 'FillSell';
  const composition = await selectComposition({serveUrl, id, browserExecutable: BROWSER, inputProps});
  console.log('composition', composition.id, composition.width, composition.height, composition.durationInFrames, composition.fps, 'version', version);
  if (mode === 'stills') {
    fs.mkdirSync(out, {recursive: true});
    for (const fr of rest.map(Number)) {
      const output = path.join(out, `f${String(fr).padStart(4, '0')}.png`);
      await renderStill({composition, serveUrl, output, frame: fr, browserExecutable: BROWSER, scale: 0.5, inputProps});
      console.log('ok', output);
    }
  } else if (mode === 'poster') {
    const [fr, scale] = rest.map(Number);
    await renderStill({composition, serveUrl, output: out, frame: fr, browserExecutable: BROWSER, scale, imageFormat: 'png', inputProps});
    console.log('ok', out);
  } else if (mode === 'video') {
    const crf = Number(rest[0] || 10);
    let last = -1;
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: out,
      browserExecutable: BROWSER,
      imageFormat: 'png',
      crf,
      pixelFormat: 'yuv420p',
      muted: true,
      inputProps,
      onProgress: ({progress}) => {
        const p = Math.floor(progress * 10);
        if (p !== last) {
          last = p;
          console.log('progress', p * 10, '%');
        }
      },
    });
    console.log('ok', out);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
