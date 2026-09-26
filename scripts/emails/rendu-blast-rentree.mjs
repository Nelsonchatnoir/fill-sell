// ============================================================================
// BLAST DE RENTRÉE (FILLSELL50) — RENDU DU MAIL EN IMAGES (2026-09-26)
// ============================================================================
// POURQUOI DES IMAGES. Gmail iOS en mode sombre INVERSE toutes les couleurs
// écrites dans le mail (fond clair → foncé, texte foncé → clair) et ignore
// color-scheme / supported-color-schemes. Il ne touche en revanche NI aux
// images NI aux background-image. La seule parade CSS connue (mix-blend-mode,
// hteumeuleu.com 2021) ne sauve que du texte BLANC : aucun moyen de garder un
// texte foncé sur fond clair. Test du 26/09 sur l'iPhone de Nico : titres
// vert pâle illisibles sur les dégradés, fond passé au noir, cadres noirs
// rectangulaires autour des pastilles et du code.
// Donc : le design validé (docs/emails/…design.html, texte réel) est rendu ICI
// en images, dans sa mise en page MOBILE (la cible : comptes sans extension,
// donc sur téléphone), et le mail envoyé n'est plus qu'une pile de tranches
// + le pied de page en texte réel (désinscription par personne).
//
//     node scripts/emails/rendu-blast-rentree.mjs
//
// Sorties : public/email/blast-rentree-2609-v2-*.{png,jpg} (NOMS NEUFS à
// chaque rendu : cache immutable d'un an sur fillsell.app/email),
// docs/emails/blast-rentree-fillsell50-2609.html (le mail à envoyer),
// screenshots-review/blast-rentree-apercu-*.png (aperçus).
// ============================================================================
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DESIGN = path.join(RACINE, 'docs/emails/blast-rentree-fillsell50-2609.design.html');
const SORTIE_MAIL = path.join(RACINE, 'docs/emails/blast-rentree-fillsell50-2609.html');
const DOSSIER_IMG = path.join(RACINE, 'public/email');
const APERCUS = path.join(RACINE, 'screenshots-review');
const VERSION = 'v2';
const URL_IMG = 'https://fillsell.app/email';

// Rendu dans la mise en page MOBILE du design (viewport 390, media query
// active). La carte y fait 412 px et non 366 : le bloc du code FILLSELL50
// (lettres espacées + « Ton code ») ne descend pas sous 308 px — c'est déjà
// le cas du design validé, que le client mail réduit pour le faire tenir.
// Échelle 2 : la résolution des photos sources (600 px) ; au-delà, du poids
// sans netteté en plus.
const VIEWPORT = 390;
const ECHELLE = 2;
// Largeur maximale d'affichage (ordinateur) : la mise en page mobile, un peu
// agrandie (×1,2), plutôt qu'étirée à 600.
const LARGEUR_MAX = 440;

const LIEN_EXTENSION = 'https://chromewebstore.google.com/detail/ooeagobimgoabciggfamljdfpkginhnm';
const LIEN_OFFRE = 'https://fillsell.app/login?offre=FILLSELL50';

// Tranches : lignes de la carte (tr de table.wrap), dans l'ordre. `coupe`
// isole le bouton « Installer l'extension » pour que seul lui soit un lien.
// Les textes alternatifs reprennent MOT POUR MOT le texte du design.
const TRANCHES = [
  { id: 'a', lignes: [0], format: 'jpg', alt: "FillSell a complètement changé. Tes articles en vente sur 5 plateformes à la fois, et tout se gère depuis ton téléphone. Vinted, Leboncoin, eBay, Beebs, Opla." },
  { id: 'b', lignes: [1, 2], format: 'jpg', alt: "Avant : des articles à dicter à la voix, dans une seule app. Maintenant : tous tes articles en ligne importés tout seuls depuis tes 5 plateformes, même si tu as plusieurs boutiques Vinted. FillSell lit tes annonces sur chaque plateforme et les range dans l'app, pendant que ton ordinateur travaille." },
  { id: 'c', lignes: [3], format: 'png', alt: "Pourquoi FillSell. Pas un outil Vinted de plus. Une seule app pour vendre partout, en France. Plus d'acheteurs voient tes articles : un même article sur Vinted, Leboncoin, eBay, Beebs et Opla, tu multiplies les chances de le vendre, et plus vite. Tout depuis ton téléphone : tu prends la photo, l'annonce se rédige, tu publies. Ton ordinateur s'occupe du reste pendant que tu vis ta vie. Plus jamais de double vente : un article vendu quelque part disparaît tout seul des autres plateformes. Tu vois enfin ce que tu gagnes : tes ventes, tes bénéfices et ta marge, suivis automatiquement dans ton tableau de bord." },
  { id: 'd', lignes: [4, 5], format: 'jpg', photo: true, alt: "Une photo, et c'est en ligne. Prends ton article en photo avec ton téléphone. Lens reconnaît la marque, le modèle et l'état, puis rédige le titre, la description et le prix. Tu valides depuis ton canapé : l'extension FillSell, sur ton ordinateur, publie sur toutes tes plateformes. Un vrai gain de temps. Remonte en tête, vends plus vite. Une annonce qui vieillit disparaît du fil des acheteurs. Republier la remet tout en haut, devant de nouveaux acheteurs : plus de vues, plus de chances de vendre. Un geste depuis l'app, sur toutes tes plateformes. Avec l'offre Pro, c'est automatique." },
  { id: 'e', lignes: [6, 7], jusquA: 'bouton', format: 'png', alt: "Et chaque soir, le récap de tes ventes dans ta boîte mail. Déjà plus de 2 600 vendeurs inscrits, près de 80 000 articles dans l'app et près de 5 000 annonces remises en avant le mois dernier. Pour commencer : 1. Installe l'extension FillSell dans Chrome, sur ton ordinateur. C'est elle qui dépose et met à jour tes annonces. 2. Ouvre l'app sur ton téléphone : tes articles arrivent, tu pilotes tout d'ici." },
  { id: 'f', depuis: 'bouton', lignes: [7], format: 'png', lien: LIEN_EXTENSION, alt: "Installer l'extension FillSell" },
  { id: 'g', lignes: [8], format: 'jpg', lien: LIEN_OFFRE, alt: "Offre de rentrée : -50 % sur ton premier mois. Le bouton applique la remise pour toi, jusqu'au 31 octobre. Ton code : FILLSELL50. Profiter de -50 %" },
  { id: 'h', lignes: [9], format: 'png', alt: "Une question ? Écris-nous, on te répond. Nico, pour l'équipe FillSell" },
];

fs.mkdirSync(APERCUS, { recursive: true });

// ── 1. Page de rendu : le design, avec la police et les emoji figés ─────────
// Helvetica Neue n'existe pas sur ce poste : TeX Gyre Heros (clone libre
// d'Helvetica, licence GUST) la remplace. Emoji : Noto Color Emoji.
const polices = pathToFileURL(path.join(RACINE, 'scripts/emails/fonts')).href;
const cssRendu = `
<link href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=block" rel="stylesheet">
<style>
@font-face{font-family:'Heros';src:url('${polices}/texgyreheros-regular.otf');font-weight:400;}
@font-face{font-family:'Heros';src:url('${polices}/texgyreheros-bold.otf');font-weight:700;}
*{font-family:'Heros','Noto Color Emoji',sans-serif !important;}
body{-webkit-font-smoothing:antialiased;}
</style>`;
const design = fs.readFileSync(DESIGN, 'utf8')
  .split(`${URL_IMG}/`).join(`${pathToFileURL(DOSSIER_IMG).href}/`)
  .replace('</head>', `${cssRendu}</head>`);
const fichierRendu = path.join(APERCUS, 'blast-rentree-rendu.html');
fs.writeFileSync(fichierRendu, design);

const navigateur = await chromium.launch({ channel: 'chrome' });
try {
  const page = await navigateur.newPage({ viewport: { width: VIEWPORT, height: 900 }, deviceScaleFactor: ECHELLE });
  await page.goto(pathToFileURL(fichierRendu).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);

  const mesures = await page.evaluate((lienExt) => {
    const carte = document.querySelector('table.wrap');
    const c = carte.getBoundingClientRect();
    const lignes = [...carte.querySelector('tbody').children].map((tr) => {
      const r = tr.getBoundingClientRect();
      return { haut: r.top - c.top, bas: r.bottom - c.top };
    });
    const bouton = document.querySelector(`a[href="${lienExt}"]`).closest('table').getBoundingClientRect();
    return { largeur: c.width, hauteur: c.height, lignes, bouton: { haut: bouton.top - c.top, bas: bouton.bottom - c.top } };
  }, LIEN_EXTENSION);
  console.log('carte', mesures.largeur, '×', mesures.hauteur, '—', mesures.lignes.length, 'lignes');
  if (mesures.lignes.length !== 11) throw new Error(`11 lignes attendues, ${mesures.lignes.length} trouvées`);

  const carteBuf = await page.locator('table.wrap').screenshot({ type: 'png' });
  const meta = await sharp(carteBuf).metadata();
  const px = (y) => Math.round(y * ECHELLE);

  // Coupe du bouton : à mi-chemin de l'espace de 22 px qui le précède.
  const coupeBouton = px(mesures.bouton.haut - 11);

  // ── 2. Découpe et encodage ─────────────────────────────────────────────
  const sorties = [];
  for (const t of TRANCHES) {
    const premiere = mesures.lignes[t.lignes[0]];
    const derniere = mesures.lignes[t.lignes[t.lignes.length - 1]];
    const haut = t.depuis === 'bouton' ? coupeBouton : px(premiere.haut);
    const bas = t.jusquA === 'bouton' ? coupeBouton : px(derniere.bas);
    const extrait = sharp(carteBuf).extract({ left: 0, top: haut, width: meta.width, height: bas - haut });
    const buf = t.format === 'jpg'
      ? await extrait.flatten({ background: '#FFFFFF' }).jpeg({ quality: t.photo ? 80 : 84, mozjpeg: true, chromaSubsampling: t.photo ? '4:2:0' : '4:4:4' }).toBuffer()
      : await extrait.png({ palette: true, colours: 256, quality: 92, effort: 10, dither: 0.6 }).toBuffer();
    const nom = `blast-rentree-2609-${VERSION}-${t.id}.${t.format}`;
    fs.writeFileSync(path.join(DOSSIER_IMG, nom), buf);
    sorties.push({ ...t, nom, largeur: meta.width, hauteur: bas - haut, octets: buf.length });
  }
  // Contiguïté : aucune tranche ne doit laisser un trou ni chevaucher.
  let attendu = 0;
  for (const s of sorties) {
    const t = TRANCHES.find((x) => x.id === s.id);
    const haut = t.depuis === 'bouton' ? coupeBouton : px(mesures.lignes[t.lignes[0]].haut);
    if (haut !== attendu && attendu !== 0) throw new Error(`tranche ${s.id} : début ${haut}, attendu ${attendu}`);
    attendu = haut + s.hauteur;
  }
  for (const s of sorties) console.log(`${s.nom}  ${s.largeur}×${s.hauteur}  ${(s.octets / 1024).toFixed(0)} Ko`);
  console.log('total', (sorties.reduce((a, s) => a + s.octets, 0) / 1024).toFixed(0), 'Ko');

  // ── 3. Le mail ─────────────────────────────────────────────────────────
  // Fonds en background-image (Gmail iOS ne les inverse pas) doublés de
  // bgcolor (Outlook). Pied de page en texte réel, couleur moyenne (#8FA39F),
  // lisible que Gmail l'inverse ou non. Aucune bordure nulle part.
  const fond = (c) => `background-color:${c};background-image:linear-gradient(${c},${c});`;
  const hauteurAffichee = (s) => Math.round((s.hauteur / s.largeur) * LARGEUR_MAX);
  const img = (s) => `<img src="${URL_IMG}/${s.nom}" width="${LARGEUR_MAX}" height="${hauteurAffichee(s)}" alt="${s.alt.replace(/"/g, '&quot;')}" style="display:block;width:100%;max-width:${LARGEUR_MAX}px;height:auto;border:0;outline:none;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#16302B;">`;
  const lignes = sorties.map((s) => `<tr><td style="padding:0;font-size:0;line-height:0;">${s.lien ? `<a href="${s.lien}" target="_blank" style="display:block;text-decoration:none;">${img(s)}</a>` : img(s)}</td></tr>`).join('\n');

  const mail = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<title>FillSell a complètement changé</title>
<style>
:root{color-scheme:light only;supported-color-schemes:light;}
body{margin:0;padding:0;}
table{border-collapse:collapse;} img{border:0;display:block;}
</style></head>
<body class="body" style="margin:0;padding:0;${fond('#F6F4EF')}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Tes articles sur 5 plateformes, gérés depuis ton téléphone. Et -50 % sur ton premier mois.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F6F4EF" style="width:100%;${fond('#F6F4EF')}"><tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="${LARGEUR_MAX}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:100%;max-width:${LARGEUR_MAX}px;${fond('#FFFFFF')}">
${lignes}
<tr><td bgcolor="#F6F4EF" style="${fond('#F6F4EF')}padding:18px 22px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#8FA39F;">
Tu reçois ce mail parce que tu as un compte sur <a href="https://fillsell.app" target="_blank" style="color:#8FA39F;text-decoration:none;">fillsell.app</a>. <a href="{{LIEN_DESINSCRIPTION}}" target="_blank" style="color:#8FA39F;text-decoration:underline;">Se désinscrire</a></td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>
`;
  fs.writeFileSync(SORTIE_MAIL, mail);
  console.log('mail', SORTIE_MAIL, (Buffer.byteLength(mail) / 1024).toFixed(1), 'Ko');

  // ── 4. Aperçus du mail FINAL (images locales) : iPhone 390 et ordinateur ─
  const local = mail.split(`${URL_IMG}/`).join(`${pathToFileURL(DOSSIER_IMG).href}/`)
    .split('{{LIEN_DESINSCRIPTION}}').join('https://fillsell.app/desinscription?t=apercu');
  const fichierApercu = path.join(APERCUS, 'blast-rentree-apercu.html');
  fs.writeFileSync(fichierApercu, local);
  for (const [nom, largeur] of [['iphone', 390], ['ordinateur', 900]]) {
    const p = await navigateur.newPage({ viewport: { width: largeur, height: 900 }, deviceScaleFactor: 2 });
    await p.goto(pathToFileURL(fichierApercu).href, { waitUntil: 'networkidle' });
    await p.screenshot({ path: path.join(APERCUS, `blast-rentree-apercu-${nom}.png`), fullPage: true });
    await p.close();
  }
  console.log('aperçus', path.join(APERCUS, 'blast-rentree-apercu-iphone.png'));
} finally {
  await navigateur.close();
}
