// Écrit site/medias/video/video.json pour la version A ou B de la vidéo (09/10/2026).
//
//   node docs/seo/briefs/video-variante-site/video-json.mjs A   (republication automatique Depop active)
//   node docs/seo/briefs/video-variante-site/video-json.mjs B   (Depop retirée de la republication automatique)
//
// ⛔ LE GESTE UNIQUE pour la vidéo (décision 2 de Nico) : `… video-json.mjs B` fait servir au site
// les fichiers de site/medias/video/version-b/ et la transcription B ; `… A` remet la version A.
// Même règle que site/donnees/plateformes.yml (`republication_auto` de Depop) : les deux se
// basculent ENSEMBLE.
// Poids, durée et dimensions sont LUS sur les fichiers (ffprobe de Remotion, lecture seule).
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const WORKTREE = path.resolve(ICI, '..', '..', '..', '..');
const DOSSIER = path.join(WORKTREE, 'site', 'medias', 'video');
// sharp du worktree (lecture des affiches WebP : le ffprobe de Remotion n'a pas de décodeur WebP).
const sharp = createRequire(path.join(WORKTREE, 'package.json'))('sharp');
const FFPROBE = 'C:/Users/nicol/fillsell-video/node_modules/@remotion/compositor-win32-x64-msvc/ffprobe.exe';
const version = (process.argv[2] || '').toUpperCase();
if (!['A', 'B'].includes(version)) throw new Error('usage : node video-json.mjs A|B');

const FPS = 30;
const NB_IMAGES = 1605;
const DUREE = NB_IMAGES / FPS; // 53,5 s
// Début de chaque scène (images) — src/scenesB.tsx, SCENES.
const S = {hook: 0, brand: 90, lens: 165, publier: 375, remonter: 600, vendre: 780, mois: 1020, sync: 1290, fin: 1425};
const t = (scene, f = 0) => Math.round(((S[scene] + f) / FPS) * 10) / 10;

const REPUB = {
  A: {fr: 'Vinted, Leboncoin, Beebs et Depop', en: 'Vinted, Leboncoin, Beebs and Depop'},
  B: {fr: 'Vinted, Leboncoin et Beebs', en: 'Vinted, Leboncoin and Beebs'},
}[version];
const prefixe = version === 'A' ? '' : 'version-b/';

// ── Transcription : tout le texte à l'écran, dans l'ordre (FR), et sa traduction (EN) ────────
const L = (debut, fin, fr, en) => ({debut_s: debut, fin_s: fin, fr, en});
const lignes = [
  L(0, t('brand'), 'Une photo.', 'One photo.'),
  L(t('hook', 14), t('brand'), 'Cinq plateformes. (logos : Vinted, Leboncoin, eBay, Beebs, Depop)', 'Five marketplaces. (logos: Vinted, Leboncoin, eBay, Beebs, Depop)'),
  L(t('hook', 40), t('brand'), 'Ctrl + C · Ctrl + V (barrés)', 'Ctrl + C · Ctrl + V (crossed out)'),
  L(t('hook', 52), t('brand'), 'Sans un copier-coller.', 'Without a single copy-paste.'),
  L(t('brand', 10), t('lens'), 'FillSell — Vinted · Leboncoin · eBay · Beebs · Depop — Une seule app.', 'FillSell — Vinted · Leboncoin · eBay · Beebs · Depop — One app.'),
  L(t('lens'), t('publier'), 'Étape 1/5 · Photo', 'Step 1/5 · Photo'),
  L(t('lens'), t('lens', 64), 'Écran Lens : « Scanne. On gère le reste. »', 'Lens screen: “Scan. We handle the rest.”'),
  L(t('lens', 4), t('lens', 58), 'Prends une photo. Lens regarde l’article.', 'Take a photo. Lens looks at the item.'),
  L(t('lens', 60), t('publier'), 'Résultat du scan — Sweat à capuche Red Bull Racing gris, taille M — Pepe Jeans — Sweat à capuche gris Red Bull Racing, collection Pepe Jeans : logos imprimés sur la poitrine, poche kangourou, capuche à cordon. Très bon état, taille M. — Très bon état · Gris · Coton · Mode — Lu sur l’objet : Marque : Pepe Jeans (logo imprimé) ; Taille : M (étiquette du col) — 38,00 € prix de vente conseillé — Excellent, marge +27,00 € (+71 %) — basé sur 6 annonces (32,00 € – 45,00 €) — Créer l’annonce', 'Scan result — Grey Red Bull Racing hoodie, size M — Pepe Jeans — Grey Red Bull Racing hoodie, Pepe Jeans collection: logos printed on the chest, kangaroo pocket, drawstring hood. Very good condition, size M. — Very good condition · Grey · Cotton · Fashion — Read on the item: Brand: Pepe Jeans (printed logo); Size: M (collar label) — €38.00 suggested selling price — Excellent, margin +€27.00 (+71%) — based on 6 listings (€32.00 – €45.00) — Create the listing'),
  L(t('lens', 60), t('lens', 126), 'Lens écrit l’annonce : titre, description, marque lue sur l’article, état proposé.', 'Lens writes the listing: title, description, brand read on the item, suggested condition.'),
  L(t('lens', 128), t('publier'), 'Et propose le prix. Tu relis, tu publies.', 'And suggests the price. You check, you publish.'),
  L(t('publier'), t('remonter'), 'Étape 2/5 · Publier', 'Step 2/5 · Publish'),
  L(t('publier'), t('publier', 82), 'Étape 1 sur 3 — Où publier ? — Sweat à capuche Red Bull Racing gris, taille M, 38 € — Plateformes : Vinted, Leboncoin, Beebs, eBay, Depop (Connectée), toutes cochées — Publier sur 5 plateformes', 'Step 1 of 3 — Where to publish? — Grey Red Bull Racing hoodie, size M, €38 — Marketplaces: Vinted, Leboncoin, Beebs, eBay, Depop (Connected), all ticked — Publish on 5 marketplaces'),
  L(t('publier', 4), t('publier', 66), 'Coche tes plateformes. Vinted · Leboncoin · eBay · Beebs · Depop', 'Tick your marketplaces. Vinted · Leboncoin · eBay · Beebs · Depop'),
  L(t('publier', 72), t('remonter'), 'Publication lancée — Vinted, Leboncoin, Beebs, eBay, Depop, l’une après l’autre : En file… / Dépôt en cours… / En ligne — Publié · 5 en ligne', 'Publishing started — Vinted, Leboncoin, Beebs, eBay, Depop, one after the other: Queued… / Listing… / Live — Published · 5 live'),
  L(t('publier', 70), t('remonter'), 'En ligne sur les cinq : une annonce après l’autre, sans un copier-coller.', 'Live on all five: one listing after the other, without a single copy-paste.'),
  L(t('remonter'), t('vendre'), 'Étape 3/5 · Remonter', 'Step 3/5 · Bump'),
  L(t('remonter'), t('vendre'), `Republication automatique — Active sur ${REPUB.fr} (interrupteur allumé)`, `Automatic reposting — On for ${REPUB.en} (switch on)`),
  L(t('remonter', 2), t('vendre'), 'Annonces : Sweat à capuche Öhlins noir, taille L, 34 €, en ligne depuis 15 j · Short de bain Polo Ralph Lauren blanc, taille M, 35 €, depuis 22 j · Bottines cuir Cyrillus enfant, pointure 24, 29 €, depuis 27 j · Casquette Volcom beige brodée, 15 €, depuis 31 j · T-shirt Picture noir imprimé surf, taille M, 16 €, depuis 35 j → De retour en tête ✓', 'Listings: Black Öhlins hoodie, size L, €34, live for 15 days · White Polo Ralph Lauren swim shorts, size M, €35, 22 days · Cyrillus leather kids’ boots, size 24, €29, 27 days · Beige embroidered Volcom cap, €15, 31 days · Black Picture surf print T-shirt, size M, €16, 35 days → Back on top ✓'),
  L(t('remonter', 4), t('remonter', 60), 'Une annonce prend de l’âge… elle descend dans la liste.', 'A listing gets older… it slides down the list.'),
  L(t('remonter', 62), t('vendre'), 'Elle remonte toute seule : les jours et au créneau que tu choisis, ordinateur allumé.', 'It bumps itself back up: on the days and in the time slot you choose, with your computer on.'),
  L(t('vendre'), t('mois'), 'Étape 4/5 · Vendre — Le sweat Red Bull Racing, 38 € sur Vinted, Leboncoin, eBay, Beebs et Depop', 'Step 4/5 · Sell — The Red Bull Racing hoodie, €38 on Vinted, Leboncoin, eBay, Beebs and Depop'),
  L(t('vendre', 4), t('vendre', 52), 'Vendu sur Vinted ! La vente s’enregistre toute seule. (VENDU ! · +27,00 €)', 'Sold on Vinted! The sale records itself. (SOLD! · +€27.00)'),
  L(t('vendre', 54), t('vendre', 152), 'Vendu ici, retiré là-bas. Leboncoin, eBay, Beebs, Depop : FillSell retire les copies dès la vente enregistrée. (Leboncoin, eBay, Beebs, Depop : RETIRÉE ✓)', 'Sold here, removed there. Leboncoin, eBay, Beebs, Depop: FillSell removes the copies as soon as the sale is recorded. (Leboncoin, eBay, Beebs, Depop: REMOVED ✓)'),
  L(t('vendre', 154), t('mois'), 'Un doute ? Il te demande, avant de toucher à une annonce. — Déjà vendu ? — Oui, la retirer — Non', 'Any doubt? It asks you before touching a listing. — Already sold? — Yes, remove it — No'),
  L(t('mois'), t('sync'), 'Étape 5/5 · Suivre — Le mois de Camille — Compte de démonstration · chiffres fictifs', 'Step 5/5 · Track — Camille’s month — Demo account · illustrative figures'),
  L(t('mois', 4), t('mois', 96), '+1 268 € de profit ce mois · 62 ventes — Ce mois 1268,00 €, 62 ventes · Marge moy. 68.5% depuis le début', '+€1,268 profit this month · 62 sales — This month €1,268.00, 62 sales · Avg. margin 68.5% since the start'),
  L(t('mois', 6), t('mois', 90), 'Sa marge, calculée toute seule : ventes, profit, stock, l’app fait les comptes.', 'Her margin, worked out on its own: sales, profit, stock — the app does the maths.'),
  L(t('mois', 92), t('mois', 186), 'Ventes par plateforme : Vinted 870,00 € (31 ventes) · eBay 329,00 € (6 ventes) · Depop 322,00 € (8 ventes) · Leboncoin 281,00 € (10 ventes) · Beebs 99,00 € (7 ventes) — Meilleure marge : Depop 74.0%', 'Sales by marketplace: Vinted €870.00 (31 sales) · eBay €329.00 (6 sales) · Depop €322.00 (8 sales) · Leboncoin €281.00 (10 sales) · Beebs €99.00 (7 sales) — Best margin: Depop 74.0%'),
  L(t('mois', 94), t('mois', 182), 'Vendu sur cinq plateformes, Depop compris.', 'Sold on five marketplaces, Depop included.'),
  L(t('mois', 182), t('sync'), 'Meilleurs vendeurs : Doudoune The North Face Nuptse, 80,00 € (55,00 € → 135,00 €), 2j en stock · Veste Carhartt Detroit vintage, 63,00 € (22,00 € → 85,00 €), 1j en stock · Appareil photo argentique Olympus, 57,00 € (22,00 € → 79,00 €), 3j en stock', 'Best sellers: The North Face Nuptse puffer, €80.00 (€55.00 → €135.00), 2 days in stock · Vintage Carhartt Detroit jacket, €63.00 (€22.00 → €85.00), 1 day in stock · Olympus film camera, €57.00 (€22.00 → €79.00), 3 days in stock'),
  L(t('mois', 186), t('sync'), 'Ses meilleures pièces : parties en 1 à 3 jours, sur Vinted, Depop et eBay.', 'Her best pieces: gone in 1 to 3 days, on Vinted, Depop and eBay.'),
  L(t('sync'), t('fin'), 'Synchroniser — Vinted 41 annonces · Leboncoin 24 · eBay 5 · Beebs 10 · Depop 10 — Synchronisé · 90 annonces', 'Sync — Vinted 41 listings · Leboncoin 24 · eBay 5 · Beebs 10 · Depop 10 — Synced · 90 listings'),
  L(t('sync', 2), t('sync', 52), 'Déjà des annonces en ligne ? Un appui sur « Synchroniser ».', 'Already have listings live? One tap on “Sync”.'),
  L(t('sync', 54), t('fin'), 'Tout ton stock arrive, rangé. Gratuit et sans limite.', 'Your whole stock comes in, neatly filed. Free and unlimited.'),
  L(t('fin'), DUREE, 'FillSell — Une annonce. Cinq plateformes. — Vinted · Leboncoin · eBay · Beebs · Depop — iPhone · Android · Chrome — Commencer gratuitement — fillsell.app', 'FillSell — One listing. Five marketplaces. — Vinted · Leboncoin · eBay · Beebs · Depop — iPhone · Android · Chrome — Start for free — fillsell.app'),
  L(t('fin', 40), DUREE, 'Données de démonstration. Vinted, Leboncoin, eBay, Beebs et Depop sont des marques de leurs propriétaires respectifs. FillSell n’est affilié à aucune de ces plateformes, ni approuvé ni sponsorisé par elles.', 'Demo data. Vinted, Leboncoin, eBay, Beebs and Depop are trademarks of their respective owners. FillSell is not affiliated with, endorsed or sponsored by any of these marketplaces.'),
];
lignes.sort((a, b) => a.debut_s - b.debut_s || a.fin_s - b.fin_s);

const chapitres = [
  {debut_s: 0, fin_s: t('lens'), fr: 'Une photo, cinq plateformes', en: 'One photo, five marketplaces'},
  {debut_s: t('lens'), fin_s: t('publier'), fr: 'Étape 1 — Photo : Lens écrit l’annonce et propose le prix', en: 'Step 1 — Photo: Lens writes the listing and suggests the price'},
  {debut_s: t('publier'), fin_s: t('remonter'), fr: 'Étape 2 — Publier sur Vinted, Leboncoin, eBay, Beebs et Depop', en: 'Step 2 — Publish on Vinted, Leboncoin, eBay, Beebs and Depop'},
  {debut_s: t('remonter'), fin_s: t('vendre'), fr: `Étape 3 — Remonter : republication automatique sur ${REPUB.fr}`, en: `Step 3 — Bump: automatic reposting on ${REPUB.en}`},
  {debut_s: t('vendre'), fin_s: t('mois'), fr: 'Étape 4 — Vendre : vendu ici, retiré là-bas', en: 'Step 4 — Sell: sold here, removed there'},
  {debut_s: t('mois'), fin_s: t('sync'), fr: 'Étape 5 — Suivre : le mois de Camille (compte de démonstration)', en: 'Step 5 — Track: Camille’s month (demo account)'},
  {debut_s: t('sync'), fin_s: t('fin'), fr: 'Synchroniser le stock déjà en ligne', en: 'Sync the stock already live'},
  {debut_s: t('fin'), fin_s: DUREE, fr: 'Commencer gratuitement — fillsell.app', en: 'Start for free — fillsell.app'},
];

// ── Fichiers : lus sur le disque ────────────────────────────────────────────────────────────
const sonde = (f) => JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', f], {encoding: 'utf8'}));
const VIDEOS = [
  {chemin: 'fillsell-presentation-av1.webm', type: 'video/webm; codecs="av01.0.05M.08"', codec: 'AV1 profil 0 (Main), niveau 3.1, 8 bits, yuv420p, libaom-av1 CRF 34 cpu-used 5, image clé toutes les 5 s'},
  {chemin: 'fillsell-presentation.webm', type: 'video/webm; codecs="vp9"', codec: 'VP9 profil 0, yuv420p, libvpx-vp9 deux passes CRF 33, image clé toutes les 5 s'},
  {chemin: 'fillsell-presentation.mp4', type: 'video/mp4; codecs="avc1.64001F"', codec: 'H.264 High, niveau 3.1, yuv420p, x264 veryslow tune animation, image clé toutes les 5 s, moov en tête (faststart)'},
];
const fichiers = [];
for (const v of VIDEOS) {
  const f = path.join(DOSSIER, prefixe + v.chemin);
  const p = sonde(f);
  const st = p.streams.find((s) => s.codec_type === 'video');
  if (p.streams.some((s) => s.codec_type === 'audio')) throw new Error(`${f} : piste audio présente`);
  const duree = Math.round(Number(p.format.duration) * 1000) / 1000;
  const octets = fs.statSync(f).size;
  fichiers.push({role: 'video', chemin: prefixe + v.chemin, type: v.type, codec: v.codec, largeur: st.width, hauteur: st.height, duree_s: duree, poids_octets: octets, debit_moyen_kbps: Math.round((octets * 8) / duree / 1000)});
}
for (const [chemin, source] of [
  ['fillsell-presentation-poster.webp', `image ${S.brand + 60} (${t('brand', 60)} s) : icône FillSell, « FillSell », les cinq plateformes (logos de l’app et noms), « Une seule app. »`],
  ['fillsell-presentation-poster-360.webp', 'même image, rendue à 360×640'],
]) {
  const f = path.join(DOSSIER, prefixe + chemin);
  const st = await sharp(f).metadata();
  if (st.format !== 'webp') throw new Error(f + ' : pas un WebP');
  fichiers.push({role: 'affiche', chemin: prefixe + chemin, type: 'image/webp', largeur: st.width, hauteur: st.height, poids_octets: fs.statSync(f).size, image_source: source});
}
const mp4 = fichiers.find((x) => x.chemin.endsWith('.mp4'));

const titre = {
  fr: 'FillSell en moins d’une minute : une photo, une annonce, cinq plateformes',
  en: 'FillSell in under a minute: one photo, one listing, five marketplaces',
};
const description = {
  fr: `Une photo, et Lens écrit l’annonce et propose le prix ; elle part sur Vinted, Leboncoin, eBay, Beebs et Depop, une annonce après l’autre, sans un copier-coller ; la republication automatique la fait remonter sur ${REPUB.fr}, les jours et au créneau choisis, ordinateur allumé ; vendue sur Vinted, la vente s’enregistre seule et FillSell retire les copies des autres plateformes — au moindre doute, il demande « Déjà vendu ? » ; puis le mois de Camille (profit, ventes sur cinq plateformes dont Depop, meilleures pièces parties en 1 à 3 jours) et la synchronisation du stock déjà en ligne. Compte de démonstration, chiffres fictifs : ni le résultat d’un client, ni une promesse de gains. Texte à l’écran en français, sans son.`,
  en: `One photo, and Lens writes the listing and suggests the price; it goes live on Vinted, Leboncoin, eBay, Beebs and Depop, one listing after the other, without a single copy-paste; automatic reposting bumps it back up on ${REPUB.en}, on the days and in the time slot you choose, with your computer on; once it sells on Vinted, the sale records itself and FillSell removes the copies from the other marketplaces — if in doubt, it asks “Already sold?”; then Camille’s month (profit, sales on five marketplaces including Depop, best pieces gone in 1 to 3 days) and syncing the stock already live. Demo account, illustrative figures: not a customer’s results and no promise of earnings. On-screen text in French, no sound.`,
};

const sortie = {
  id: 'fillsell-presentation',
  statut: `variante « site » refaite le 2026-10-09 (compte de démonstration « Camille », cinq plateformes) — version ${version} ${version === 'A' ? '(republication automatique sur Vinted, Leboncoin, Beebs ET Depop)' : '(republication automatique sur Vinted, Leboncoin et Beebs — Depop retirée)'} — À VALIDER PAR NICO avant toute mise en ligne (docs/seo/briefs/video.md § 5)`,
  version_republication_depop: version,
  basculer: 'node docs/seo/briefs/video-variante-site/video-json.mjs A|B (B = Depop retirée de la republication automatique ; à basculer EN MÊME TEMPS que `republication_auto` de Depop dans site/donnees/plateformes.yml)',
  source: {
    projet: 'C:\\Users\\nicol\\fillsell-video (Remotion 4.0.534, composition FillSell) — lu, jamais modifié ; rendu fait sur une copie (docs/seo/briefs/video-variante-site/)',
    donnees_affichees: 'compte de démonstration « Camille » (mêmes chiffres et mêmes photos que les captures du site : scripts/apercu/site-donnees-demo.js, site/medias/captures/captures.json) — aucune donnée réelle, aucun chiffre de Nico, aucun client',
    mention_fr: 'Compte de démonstration, chiffres fictifs. Ce n’est ni le résultat d’un client ni une promesse de gains.',
    mention_en: 'Demo account, illustrative figures. Not a customer’s results and no promise of earnings.',
  },
  duree_s: DUREE,
  duree_iso8601: `PT${DUREE}S`,
  images_par_seconde: FPS,
  nombre_images: NB_IMAGES,
  largeur: mp4.largeur,
  hauteur: mp4.hauteur,
  format: 'vertical 9:16',
  son: false,
  son_note: 'Vidéo muette : aucune piste audio, tout le texte est incrusté à l’image. Lecture au clic.',
  sous_titres: 'incrustés en français ; pas de fichier de sous-titres ; la transcription ci-dessous sert d’alternative textuelle',
  fichiers,
  titre,
  description,
  accessibilite: {
    aria_label_fr: `Vidéo de présentation de FillSell, ${String(DUREE).replace('.', ',')} secondes, sans son, texte à l’écran en français. Transcription sous la vidéo.`,
    aria_label_en: `FillSell presentation video, ${DUREE} seconds, no sound, on-screen text in French. Transcript below the video.`,
    lecture: 'au clic seulement (pas de lecture automatique) ; respecter prefers-reduced-motion',
  },
  json_ld_videoobject: {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: titre.fr,
    description: `Créer une annonce à partir d’une photo avec Lens, la publier sur Vinted, Leboncoin, eBay, Beebs et Depop, la faire remonter automatiquement sur ${REPUB.fr}, retirer les copies quand elle se vend, suivre son profit et synchroniser son stock. Compte de démonstration, chiffres fictifs.`,
    thumbnailUrl: [`A_REMPLIR_URL_ABSOLUE/${prefixe}fillsell-presentation-poster.webp`],
    contentUrl: `A_REMPLIR_URL_ABSOLUE/${prefixe}fillsell-presentation.mp4`,
    uploadDate: 'A_REMPLIR_DATE_DE_MISE_EN_LIGNE',
    duration: `PT${DUREE}S`,
    inLanguage: 'fr',
    width: mp4.largeur,
    height: mp4.hauteur,
  },
  chapitres: chapitres.map((c) => ({debut_s: c.debut_s, fin_s: c.fin_s, titre: c.fr, titre_en: c.en})),
  transcription_fr: lignes.map((l) => ({debut_s: l.debut_s, fin_s: l.fin_s, texte: l.fr})),
  transcription_en_traduction: lignes.map((l) => ({debut_s: l.debut_s, fin_s: l.fin_s, texte: l.en})),
  integration: {
    balise: '<video controls playsinline muted preload="none" poster="…poster.webp" width="720" height="1280">, sources dans l’ordre AV1, VP9, MP4 (le navigateur prend la première qu’il sait lire)',
    lecture: 'au clic (PLAN.md § 5) ; transcription en texte sous la vidéo',
    conditions_mise_en_ligne: [
      'D1 : Depop ouverte à tous (depop_ouvert), extension avec Depop servie par le Chrome Web Store, OTA ≥ 2.9.68',
      version === 'A' ? 'D2 : republication automatique Depop ACTIVE (non codée au 09/10) — sinon : node docs/seo/briefs/video-variante-site/video-json.mjs B' : 'D2 non remplie : version B servie (Depop absente de la republication automatique)',
    ],
  },
};
fs.writeFileSync(path.join(DOSSIER, 'video.json'), JSON.stringify(sortie, null, 2) + '\n');
console.log(`video.json écrit — version ${version}, ${fichiers.length} fichiers, ${lignes.length} lignes de transcription`);
