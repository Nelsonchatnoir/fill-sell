// ═══════════════════════════════════════════════════════════════════════════
// BORDEREAUX — LE MOTEUR : LIRE, DÉCOUPER, TOURNER, RÉUNIR (bêta, 16/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ CHARGÉ À LA DEMANDE SEULEMENT : `await import('./moteur.js')`, à
//    l'ouverture de l'aperçu ou de « Tout imprimer » — jamais importé de façon
//    statique (pdf.js et pdf-lib pèsent ≈ 2 Mo : rien n'est ajouté au
//    chargement de l'app ; le chunk d'entrée est vérifié par le selftest du
//    build).
// pdf.js (build LEGACY, polyfills des vieux WKWebView) tourne dans le fil
// principal : son « worker » est chargé comme un module ordinaire et posé dans
// globalThis.pdfjsWorker (mécanisme prévu par pdf.js) — aucun Worker à créer,
// donc rien qui dépende du schéma capacitor:// ou https://localhost. Une
// étiquette fait une ou deux pages : le fil principal suffit.
// pdf-lib découpe en VECTORIEL (embedPage + boîte) ; si pdf-lib ne sait pas
// lire le fichier (chiffré, flux inconnu), l'étiquette passe par une image à
// 300 ppp rendue par pdf.js (repli, dit dans le résultat : `vectoriel: false`).
// Testé en Node (scripts/bordereau-impression-selftest.mjs) avec
// @napi-rs/canvas comme canevas (option `creerCanevas`).
import { PAGE_10X15, RECADRAGES, boiteContenu, dimensionsAffichees, genreFichier, placement, quart, tourPourPortrait } from './geometrie.js';
import { analyserPage, masqueDepuisRGBA } from './segmentation.js';

const DPI_ANALYSE = 150;
const DPI_IMAGE = 300;

let pdfjsPromesse = null;
let pdfLibPromesse = null;

/** pdf.js (legacy), son « worker » dans le fil principal. Mémorisé. */
export function chargerPdfjs() {
  if (!pdfjsPromesse) {
    pdfjsPromesse = (async () => {
      const [pdfjs, travailleur] = await Promise.all([
        import('pdfjs-dist/legacy/build/pdf.mjs'),
        import('pdfjs-dist/legacy/build/pdf.worker.mjs'),
      ]);
      globalThis.pdfjsWorker = travailleur;
      return pdfjs;
    })().catch((e) => { pdfjsPromesse = null; throw e; });
  }
  return pdfjsPromesse;
}

/** pdf-lib. Mémorisé. */
export function chargerPdfLib() {
  if (!pdfLibPromesse) {
    pdfLibPromesse = import('pdf-lib').then((m) => (m.PDFDocument ? m : m.default))
      .catch((e) => { pdfLibPromesse = null; throw e; });
  }
  return pdfLibPromesse;
}

function creerCanevasNavigateur(l, h) {
  const c = document.createElement('canvas');
  c.width = l; c.height = h;
  return c;
}

/** Ferme un document pdf.js (v6 : par sa tâche de chargement). */
export async function fermer(doc) {
  try {
    if (doc?.loadingTask?.destroy) await doc.loadingTask.destroy();
    else if (doc?.destroy) await doc.destroy();
  } catch { /* déjà fermé */ }
}

/** Une copie des octets (pdf.js détache le tampon qu'on lui donne). */
const copie = (o) => (o instanceof Uint8Array ? o.slice() : new Uint8Array(o));

async function ouvrirPdfjs(octets, options = {}) {
  const pdfjs = await chargerPdfjs();
  return pdfjs.getDocument({
    data: copie(octets), isEvalSupported: false, useSystemFonts: true, verbosity: 0,
    ...(options.pdfjs ?? {}),
  }).promise;
}

/** Rend une page (ou une zone de la page) en pixels RGBA. */
async function rendre(doc, numero, dpi, options = {}, zonePt = null) {
  const page = await doc.getPage(numero);
  const echelle = dpi / 72;
  const base = page.getViewport({ scale: echelle });
  const vue = zonePt
    ? page.getViewport({ scale: echelle, offsetX: -zonePt.x * echelle, offsetY: -zonePt.y * echelle })
    : base;
  const l = Math.max(1, Math.ceil(zonePt ? zonePt.l * echelle : base.width));
  const h = Math.max(1, Math.ceil(zonePt ? zonePt.h * echelle : base.height));
  const canevas = (options.creerCanevas ?? creerCanevasNavigateur)(l, h);
  const ctx = canevas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, l, h);
  await page.render({ canvas: canevas, canvasContext: ctx, viewport: vue, background: 'rgb(255,255,255)' }).promise;
  const largeurPt = base.width / echelle; const hauteurPt = base.height / echelle;
  page.cleanup?.();
  return { canevas, ctx, l, h, largeurPt, hauteurPt, rotation: page.rotate ?? 0 };
}

/**
 * Lit une copie de bordereau (PDF, PNG ou JPEG). Rend {genre, octets, pages:
 * [{numero, largeurPt, hauteurPt}], analyses} — `analyses` est rempli page par
 * page par `analyser`.
 */
export async function ouvrirSource(octets, options = {}) {
  const o = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  const genre = genreFichier(o);
  if (!genre) throw new Error('fichier_inconnu');
  if (genre !== 'pdf') return { genre, octets: o, pages: [{ numero: 1 }], analyses: {} };
  const doc = await ouvrirPdfjs(o, options);
  const pages = [];
  for (let n = 1; n <= Math.min(doc.numPages, 6); n++) {
    const p = await doc.getPage(n);
    const v = p.getViewport({ scale: 1 });
    pages.push({ numero: n, largeurPt: v.width, hauteurPt: v.height });
  }
  await fermer(doc);
  return { genre, octets: o, pages, analyses: {}, nbPages: pages.length };
}

/**
 * Analyse une page : où est l'étiquette (fractions de la page affichée,
 * origine en haut à gauche), avec quelle confiance, et les recadrages nommés.
 */
export async function analyser(source, numero = 1, options = {}) {
  if (source.analyses[numero]) return source.analyses[numero];
  if (source.genre !== 'pdf') {
    const a = { auto: { x: 0, y: 0, l: 1, h: 1 }, confiance: 'haute', raison: 'image', recadrages: { page: { x: 0, y: 0, l: 1, h: 1 } }, codes: [], dejaEtiquette: true };
    source.analyses[numero] = a;
    return a;
  }
  const page = source.pages.find((p) => p.numero === numero) ?? source.pages[0];
  if (page.largeurPt && pageDejaEtiquetteSure(page)) {
    const plein = { x: 0, y: 0, l: 1, h: 1 };
    const a = { auto: plein, confiance: 'haute', raison: 'deja_10x15', recadrages: Object.fromEntries(Object.keys(RECADRAGES).map((k) => [k, RECADRAGES[k]])), codes: [], dejaEtiquette: true };
    source.analyses[numero] = a;
    return a;
  }
  const doc = await ouvrirPdfjs(source.octets, options);
  try {
    const r = await rendre(doc, numero, options.dpiAnalyse ?? DPI_ANALYSE, options);
    const img = r.ctx.getImageData(0, 0, r.l, r.h);
    const masque = masqueDepuisRGBA(img.data, r.l, r.h);
    const pxParMm = (options.dpiAnalyse ?? DPI_ANALYSE) / 25.4;
    const brut = analyserPage({ masque, largeur: r.l, hauteur: r.h, pxParMm }, RECADRAGES);
    const frac = (z) => ({ x: z.x / r.l, y: z.y / r.h, l: z.l / r.l, h: z.h / r.h });
    const a = {
      auto: frac(brut.auto), confiance: brut.confiance, raison: brut.raison,
      recadrages: Object.fromEntries(Object.entries(brut.recadrages).map(([k, z]) => [k, frac(z)])),
      codes: brut.codes.map((c) => ({ genre: c.genre, x: c.x0 / r.l, y: c.y0 / r.h, l: (c.x1 - c.x0) / r.l, h: (c.y1 - c.y0) / r.h })),
      separateurs: brut.separateurs, dejaEtiquette: false,
    };
    source.analyses[numero] = a;
    return a;
  } finally {
    await fermer(doc);
  }
}

function pageDejaEtiquetteSure(page) {
  const mm = 72 / 25.4;
  const petit = Math.min(page.largeurPt, page.hauteurPt) / mm;
  const grand = Math.max(page.largeurPt, page.hauteurPt) / mm;
  const proche = (v, c) => Math.abs(v - c) / c <= 0.12;
  return (proche(petit, 100) && proche(grand, 150)) || (proche(petit, 101.6) && proche(grand, 152.4));
}

/** La page qui porte l'étiquette : celle au code-barres le plus fort (la 1re sinon). */
export async function choisirPage(source, options = {}) {
  if (source.genre !== 'pdf' || source.pages.length <= 1) return source.pages[0]?.numero ?? 1;
  let meilleure = source.pages[0].numero; let score = -1;
  for (const p of source.pages.slice(0, 4)) {
    const a = await analyser(source, p.numero, options);
    const s = a.codes.filter((c) => c.genre === 'barres').reduce((t, c) => t + c.l * c.h, 0) * 10 + a.codes.length;
    if (s > score) { score = s; meilleure = p.numero; }
  }
  return meilleure;
}

/** Le rectangle (fractions) d'un recadrage : 'auto' = la détection. */
export function rectangleDe(analyse, recadrage = 'auto') {
  if (recadrage && recadrage !== 'auto' && analyse.recadrages?.[recadrage]) return { rect: analyse.recadrages[recadrage], recadrage };
  return { rect: analyse.auto, recadrage: 'auto' };
}

async function canevasVersPng(canevas) {
  if (typeof canevas.encode === 'function') return new Uint8Array(await canevas.encode('png')); // @napi-rs/canvas (tests)
  if (typeof canevas.convertToBlob === 'function') return new Uint8Array(await (await canevas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  const blob = await new Promise((ok, ko) => canevas.toBlob((b) => (b ? ok(b) : ko(new Error('png'))), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

/** Pose une image (PNG/JPEG) sur une page 10 × 15, tournée si elle est couchée. */
async function poserImage(lib, out, octets, genre, largeurPx, hauteurPx) {
  const img = genre === 'png' ? await out.embedPng(octets) : await out.embedJpg(octets);
  const l = largeurPx ?? img.width; const h = hauteurPx ?? img.height;
  const tour = tourPourPortrait(l, h);
  const pl = placement(img.width, img.height, tour);
  const p = out.addPage([PAGE_10X15.largeur, PAGE_10X15.hauteur]);
  p.drawImage(img, { x: pl.x, y: pl.y, width: img.width * pl.echelle, height: img.height * pl.echelle, rotate: lib.degrees(pl.rotationAntihoraire) });
  return { tour };
}

/**
 * Ajoute à `out` la page 10 × 15 d'une source. Rend {vectoriel, tour,
 * recadrage, rect, page, confiance, raison}.
 */
async function ajouter10x15(lib, out, source, choix = {}, options = {}) {
  if (source.genre !== 'pdf') {
    const r = await poserImage(lib, out, source.octets, source.genre);
    return { vectoriel: false, tour: r.tour, recadrage: 'page', rect: { x: 0, y: 0, l: 1, h: 1 }, page: 1, confiance: 'haute', raison: 'image' };
  }
  const numero = choix.page ?? await choisirPage(source, options);
  const analyse = await analyser(source, numero, options);
  const { rect, recadrage } = rectangleDe(analyse, choix.recadrage);
  try {
    if (options.forcerImage) throw new Error('repli_image_force'); // selftest seulement
    const doc = await lib.PDFDocument.load(source.octets, { ignoreEncryption: false, updateMetadata: false });
    const pageSrc = doc.getPage(numero - 1);
    const boite = pageSrc.getCropBox();
    const rotation = quart(pageSrc.getRotation().angle);
    const aff = dimensionsAffichees({ x: boite.x, y: boite.y, largeur: boite.width, hauteur: boite.height }, rotation);
    const rectPt = { x: rect.x * aff.largeur, y: rect.y * aff.hauteur, l: rect.l * aff.largeur, h: rect.h * aff.hauteur };
    const bb = boiteContenu(rectPt, { x: boite.x, y: boite.y, largeur: boite.width, hauteur: boite.height }, rotation);
    const emb = await out.embedPage(pageSrc, bb);
    const tour = tourPourPortrait(rectPt.l, rectPt.h);
    const pl = placement(emb.width, emb.height, rotation + tour);
    const p = out.addPage([PAGE_10X15.largeur, PAGE_10X15.hauteur]);
    p.drawPage(emb, { x: pl.x, y: pl.y, xScale: pl.echelle, yScale: pl.echelle, rotate: lib.degrees(pl.rotationAntihoraire) });
    return { vectoriel: true, tour, recadrage, rect, page: numero, confiance: recadrage === 'auto' ? analyse.confiance : 'choisi', raison: analyse.raison };
  } catch {
    // Repli : l'étiquette en image (300 ppp), rendue par pdf.js.
    const doc = await ouvrirPdfjs(source.octets, options);
    try {
      const pg = source.pages.find((x) => x.numero === numero) ?? source.pages[0];
      const zone = { x: rect.x * pg.largeurPt, y: rect.y * pg.hauteurPt, l: rect.l * pg.largeurPt, h: rect.h * pg.hauteurPt };
      const r = await rendre(doc, numero, options.dpiImage ?? DPI_IMAGE, options, zone);
      const png = await canevasVersPng(r.canevas);
      const res = await poserImage(lib, out, png, 'png', r.l, r.h);
      return { vectoriel: false, tour: res.tour, recadrage, rect, page: numero, confiance: recadrage === 'auto' ? analyse.confiance : 'choisi', raison: analyse.raison };
    } finally {
      await fermer(doc);
    }
  }
}

function metadonnees(out, titre) {
  try { out.setTitle(titre); out.setCreator('FillSell'); out.setProducer('FillSell'); } catch { /* sans conséquence */ }
}

/**
 * LE 10 × 15 d'une copie : un PDF d'une page de 100 × 150 mm, portrait,
 * l'étiquette découpée, tournée si elle est couchée, au plus grand dans une
 * marge de 1,5 mm. `choix` : {recadrage: 'auto' | nom, page}.
 */
export async function fabriquer10x15(source, choix = {}, options = {}) {
  const lib = await chargerPdfLib();
  const out = await lib.PDFDocument.create();
  metadonnees(out, 'Bordereau 10 x 15');
  const detail = await ajouter10x15(lib, out, source, choix, options);
  return { octets: await out.save(), ...detail };
}

/**
 * « Tout imprimer » : les bordereaux prêts réunis en UN PDF.
 *   format '10x15'   : une étiquette par page, 100 × 150 mm (le recadrage de
 *                      chacun : `choix[i]`, sinon la détection) ;
 *   format 'origine' : toutes les pages de chaque PDF telles quelles, une page
 *                      à la taille de l'image pour un code.
 * Une source illisible est sautée et COMPTÉE (jamais d'échec silencieux).
 */
export async function fusionner(sources, { format = '10x15', choix = [] } = {}, options = {}) {
  const lib = await chargerPdfLib();
  const out = await lib.PDFDocument.create();
  metadonnees(out, format === '10x15' ? 'Bordereaux 10 x 15' : 'Bordereaux');
  const details = []; const sautes = [];
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    try {
      if (format === '10x15') {
        details.push(await ajouter10x15(lib, out, s, choix[i] ?? {}, options));
      } else if (s.genre === 'pdf') {
        const doc = await lib.PDFDocument.load(s.octets, { updateMetadata: false });
        const pages = await out.copyPages(doc, doc.getPageIndices());
        for (const p of pages) out.addPage(p);
        details.push({ pages: pages.length });
      } else {
        const img = s.genre === 'png' ? await out.embedPng(s.octets) : await out.embedJpg(s.octets);
        const l = img.width * 72 / 150; const h = img.height * 72 / 150; // 150 ppp
        const p = out.addPage([l, h]);
        p.drawImage(img, { x: 0, y: 0, width: l, height: h });
        details.push({ pages: 1 });
      }
    } catch (e) {
      sautes.push({ index: i, motif: String(e?.message ?? e).slice(0, 80) });
    }
  }
  return { octets: await out.save(), pages: out.getPageCount(), details, sautes };
}

/**
 * Une image d'aperçu de la page `numero` d'un PDF (ou de l'image elle-même) :
 * une URL d'image (data:) à `largeurPx` de large.
 */
export async function apercu(octets, { numero = 1, largeurPx = 720 } = {}, options = {}) {
  const o = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  const genre = genreFichier(o);
  if (genre !== 'pdf') {
    const blob = new Blob([o], { type: genre === 'png' ? 'image/png' : 'image/jpeg' });
    return { url: URL.createObjectURL(blob), revoquer: true };
  }
  const doc = await ouvrirPdfjs(o, options);
  try {
    const page = await doc.getPage(numero);
    const v = page.getViewport({ scale: 1 });
    const dpi = Math.max(36, Math.min(220, (largeurPx / v.width) * 72));
    const r = await rendre(doc, numero, dpi, options);
    const url = typeof r.canevas.toDataURL === 'function' ? r.canevas.toDataURL('image/png') : null;
    return { url, largeur: r.l, hauteur: r.h, revoquer: false };
  } finally {
    await fermer(doc);
  }
}
