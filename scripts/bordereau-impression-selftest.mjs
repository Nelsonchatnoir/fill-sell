// ═══════════════════════════════════════════════════════════════════════════
// SELFTEST — BORDEREAUX : ÉTIQUETTE 10 × 15, TOUT IMPRIMER (bêta, 16/10/2026)
//   npm run selftest:bordereau-impression
// ═══════════════════════════════════════════════════════════════════════════
// Prouve, sur des pages SYNTHÉTIQUES (aucun vrai bordereau n'existait le 16/10) :
//   A. géométrie : page de sortie 283,46 × 425,2 pt ; boîte du contenu juste
//      pour /Rotate 0/90/180/270 et une MediaBox décalée ; placement centré,
//      dans la marge, tourné quand l'étiquette est couchée ;
//   B. segmentation sur matrices : l'étiquette trouvée dans une A4 (moitié
//      haute couchée, bloc bas sous des pointillés avec ciseaux, quart haut
//      gauche à côté d'un reçu, A4 paysage, étiquette sans cadre à blancs
//      intérieurs) ; une page sans code = confiance basse ;
//   C. chaîne complète (pdf-lib → pdf.js + @napi-rs/canvas → détection →
//      10 × 15) : la page produite mesure 100 × 150 mm, l'étiquette y est
//      tournée et remplit la page, les consignes n'y sont pas ; un recadrage
//      nommé choisi est suivi ; une page déjà 10 × 15 n'est que tournée ; une
//      image PNG (code) donne une page 10 × 15 ; /Rotate 90 juste ;
//   D. « Tout imprimer » : N bordereaux → N pages 10 × 15 ; format d'origine →
//      toutes les pages de chaque PDF + une page par image.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(RACINE, 'package.json'));
const G = await import(pathToFileURL(path.join(RACINE, 'src/messagerie/impression/geometrie.js')).href);
const SEG = await import(pathToFileURL(path.join(RACINE, 'src/messagerie/impression/segmentation.js')).href);

let ko = 0; let ok = 0;
const verifier = (cond, quoi, detail = '') => {
  if (cond) ok++; else ko++;
  console.log(`  ${cond ? 'ok  ' : '⚠ KO'} ${quoi}${!cond && detail ? `   ← ${detail}` : ''}`);
};
const proche = (a, b, tol) => Math.abs(a - b) <= tol;

// ── A. GÉOMÉTRIE ───────────────────────────────────────────────────────────
console.log('=== A. géométrie ===');
verifier(proche(G.PAGE_10X15.largeur, 283.46, 0.01) && proche(G.PAGE_10X15.hauteur, 425.2, 0.01), 'page de sortie 283,46 × 425,2 pt (100 × 150 mm)');
verifier(G.MARGE_10X15 <= 2 * G.PT_PAR_MM, 'marge ≤ 2 mm');
verifier(G.pageDejaEtiquette(283.46, 425.2) && G.pageDejaEtiquette(425.2, 283.46) && G.pageDejaEtiquette(288, 432), 'page déjà 10 × 15 (ou 4 × 6 in), dans les deux sens');
verifier(!G.pageDejaEtiquette(595.28, 841.89) && !G.pageDejaEtiquette(419.53, 595.28), 'A4 et A5 ne sont pas des étiquettes');
{
  const boite = { x: 10, y: 20, largeur: 600, hauteur: 800 };
  const r = { x: 30, y: 40, l: 100, h: 50 };
  const b0 = G.boiteContenu(r, boite, 0);
  verifier(b0.left === 40 && b0.right === 140 && b0.top === 20 + 800 - 40 && b0.bottom === 20 + 800 - 90, '/Rotate 0 : boîte du contenu (MediaBox décalée)', JSON.stringify(b0));
  const b90 = G.boiteContenu(r, boite, 90);
  verifier(b90.left === 10 + 40 && b90.right === 10 + 90 && b90.bottom === 20 + 30 && b90.top === 20 + 130, '/Rotate 90 : boîte du contenu', JSON.stringify(b90));
  const b180 = G.boiteContenu(r, boite, 180);
  verifier(b180.left === 10 + 600 - 130 && b180.right === 10 + 600 - 30 && b180.bottom === 20 + 40 && b180.top === 20 + 90, '/Rotate 180 : boîte du contenu', JSON.stringify(b180));
  const b270 = G.boiteContenu(r, boite, 270);
  verifier(b270.left === 10 + 600 - 90 && b270.right === 10 + 600 - 40 && b270.bottom === 20 + 800 - 130 && b270.top === 20 + 800 - 30, '/Rotate 270 : boîte du contenu', JSON.stringify(b270));
  const d = G.dimensionsAffichees(boite, 90);
  verifier(d.largeur === 800 && d.hauteur === 600, 'dimensions affichées après /Rotate 90');
}
for (const [cw, ch, t] of [[560, 370, 90], [300, 420, 0], [500, 300, 270], [300, 200, 180]]) {
  const pl = G.placement(cw, ch, t);
  const coins = [[0, 0], [cw, 0], [0, ch], [cw, ch]].map(([x, y]) => G.poser(x, y, pl));
  const xs = coins.map((c) => c.x); const ys = coins.map((c) => c.y);
  const m = G.MARGE_10X15 - 1e-6;
  const dedans = Math.min(...xs) >= m && Math.max(...xs) <= G.PAGE_10X15.largeur - m && Math.min(...ys) >= m && Math.max(...ys) <= G.PAGE_10X15.hauteur - m;
  const centre = proche((Math.min(...xs) + Math.max(...xs)) / 2, G.PAGE_10X15.largeur / 2, 0.01) && proche((Math.min(...ys) + Math.max(...ys)) / 2, G.PAGE_10X15.hauteur / 2, 0.01);
  const remplit = proche(Math.max(...xs) - Math.min(...xs), G.PAGE_10X15.largeur - 2 * G.MARGE_10X15, 0.01) || proche(Math.max(...ys) - Math.min(...ys), G.PAGE_10X15.hauteur - 2 * G.MARGE_10X15, 0.01);
  verifier(dedans && centre && remplit, `placement ${cw}×${ch} tourné de ${t}° : dans la marge, centré, au plus grand`, JSON.stringify({ xs, ys }));
}
verifier(G.tourPourPortrait(560, 370) === 90 && G.tourPourPortrait(300, 420) === 0, 'une étiquette couchée est tournée d’un quart de tour, une debout non');
verifier(G.nomFichier({ platform: 'vinted', commande_ref: '12 345/é', suffixe: '10x15' }) === 'bordereau-vinted-12-345-e-10x15.pdf', 'nom de fichier propre', G.nomFichier({ platform: 'vinted', commande_ref: '12 345/é', suffixe: '10x15' }));
verifier(G.genreFichier(new Uint8Array([0x25, 0x50, 0x44, 0x46])) === 'pdf' && G.genreFichier(new Uint8Array([0x89, 0x50, 0x4e, 0x47])) === 'png' && G.genreFichier(new Uint8Array([0xff, 0xd8, 0xff])) === 'jpeg' && G.genreFichier(new Uint8Array([1, 2])) === null, 'genre du fichier lu dans ses octets');

// ── B. SEGMENTATION SUR MATRICES ───────────────────────────────────────────
console.log('=== B. segmentation (matrices dessinées, 150 ppp) ===');
const PX_MM = 150 / 25.4;
// Hasard reproductible (mulberry32).
function hasard(graine) {
  let a = graine >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function Feuille(lmm, hmm) {
  const W = Math.round(lmm * PX_MM); const H = Math.round(hmm * PX_MM);
  const m = new Uint8Array(W * H);
  const px = (v) => Math.round(v * PX_MM);
  const remplir = (v) => (x, y, l, h) => { const x0 = Math.max(0, px(x)); const y0 = Math.max(0, px(y)); const x1 = Math.min(W, px(x + l)); const y1 = Math.min(H, px(y + h)); for (let yy = y0; yy < y1; yy++) m.fill(v, yy * W + x0, yy * W + x1); };
  const plein = remplir(1); const vide = remplir(0);
  const f = {
    W, H, m, plein, vide,
    cadre: (x, y, l, h, e = 0.5) => { plein(x, y, l, e); plein(x, y + h - e, l, e); plein(x, y, e, h); plein(x + l - e, y, e, h); },
    // Une ligne de texte : des « lettres » de 1,6 × 2,4 mm (jambages < 5 mm).
    texte: (x, y, l, corps = 2.4) => { let cx = x; let n = 0; while (cx < x + l - 1.6) { plein(cx, y, 1.2, corps); cx += 1.8; n++; if (n % 6 === 0) cx += 1.6; } },
    paragraphe: (x, y, l, lignes, pas = 4) => { for (let i = 0; i < lignes; i++) f.texte(x, y + i * pas, l); },
    // Code-barres 1D : barres de 0,35 à 1,05 mm, espaces de 0,35 à 0,7 mm.
    barres: (x, y, l, h) => { let cx = x; let i = 0; while (cx < x + l) { const b = 0.35 * (1 + (i % 3)); plein(cx, y, b, h); cx += b + 0.35 * (1 + ((i * 7) % 2)); i++; } },
    barresCouchees: (x, y, l, h) => { let cy = y; let i = 0; while (cy < y + h) { const b = 0.35 * (1 + (i % 3)); plein(x, cy, l, b); cy += b + 0.35 * (1 + ((i * 7) % 2)); i++; } },
    // Code 2D : modules de 0,6 mm, motif pseudo-aléatoire + trois repères.
    qr: (x, y, cote) => { const mod = 0.6; const n = Math.floor(cote / mod); const alea = hasard(7); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { if (alea() < 0.5) plein(x + i * mod, y + j * mod, mod, mod); } for (const [a, b] of [[0, 0], [n - 7, 0], [0, n - 7]]) { f.plein(x + a * mod, y + b * mod, 7 * mod, 7 * mod); f.vide(x + (a + 1) * mod, y + (b + 1) * mod, 5 * mod, 5 * mod); f.plein(x + (a + 2) * mod, y + (b + 2) * mod, 3 * mod, 3 * mod); } },
    pointilles: (x, y, l, e = 0.35) => { for (let cx = x; cx < x + l; cx += 5) plein(cx, y, 3, e); },
    pointillesV: (x, y, h, e = 0.35) => { for (let cy = y; cy < y + h; cy += 5) plein(x, cy, e, 3); },
    ciseaux: (x, y) => { plein(x, y - 2, 2, 4); plein(x + 2.5, y - 1.5, 3, 3); },
    pictogramme: (x, y, c) => { f.cadre(x, y, c, c, 0.8); plein(x + c / 3, y + c / 3, c / 3, c / 3); },
  };
  return f;
}
const enMm = (r) => ({ x: r.x / PX_MM, y: r.y / PX_MM, l: r.l / PX_MM, h: r.h / PX_MM });
const dans = (r, x, y, l, h, tol = 4) => r.x >= x - tol && r.y >= y - tol && r.x + r.l <= x + l + tol && r.y + r.h <= y + h + tol;
const couvre = (r, x, y, l, h, tol = 3) => r.x <= x + tol && r.y <= y + tol && r.x + r.l >= x + l - tol && r.y + r.h >= y + h - tol;
const fmt = (r) => `x ${r.x.toFixed(1)} y ${r.y.toFixed(1)} l ${r.l.toFixed(1)} h ${r.h.toFixed(1)} mm`;

// B1. Mondial Relay « classique » : étiquette couchée, moitié haute pleine largeur, consignes dessous.
function pageMondialRelay(f) {
  f.cadre(4, 4, 202, 136, 0.6);
  f.plein(8, 8, 60, 10); // bandeau du transporteur
  f.paragraphe(10, 24, 80, 5); f.paragraphe(110, 24, 80, 6);
  f.barres(20, 70, 90, 22); f.qr(150, 70, 30);
  f.paragraphe(10, 110, 180, 5);
  f.paragraphe(10, 160, 190, 6); // consignes
  for (let i = 0; i < 4; i++) f.pictogramme(15 + i * 48, 200, 30);
  f.paragraphe(10, 245, 190, 8);
}
{
  const f = Feuille(210, 297); pageMondialRelay(f);
  const a = SEG.analyserPage({ masque: f.m, largeur: f.W, hauteur: f.H, pxParMm: PX_MM }, G.RECADRAGES);
  const r = enMm(a.auto);
  verifier(couvre(r, 4, 4, 202, 136) && dans(r, 4, 4, 202, 136), 'B1 Mondial Relay : la moitié haute (étiquette couchée), sans les consignes', fmt(r));
  verifier(a.confiance === 'haute' && a.raison === 'code_barres', 'B1 : confiance haute, ancrée sur le code-barres', `${a.confiance}/${a.raison}`);
  verifier(G.tourPourPortrait(a.auto.l, a.auto.h) === 90, 'B1 : couchée → un quart de tour');
  verifier(a.codes.some((c) => c.genre === 'barres') && a.codes.some((c) => c.genre === '2d'), 'B1 : code-barres et code 2D trouvés', JSON.stringify(a.codes.map((c) => c.genre)));
  const haut = enMm(a.recadrages.haut);
  verifier(couvre(haut, 4, 4, 202, 136) && haut.h < 140, 'B1 : le recadrage « moitié haute » se resserre sur l’étiquette', fmt(haut));
}
// B2. Bloc du bas sous une ligne pointillée « coup de ciseaux », consignes collées au-dessus (3 mm).
{
  const f = Feuille(210, 297);
  f.paragraphe(15, 20, 180, 12); for (let i = 0; i < 3; i++) f.pictogramme(20 + i * 60, 75, 35);
  f.paragraphe(15, 120, 180, 10, 4.5); // jusqu'à y ≈ 163
  f.pointilles(5, 166.5, 200); f.ciseaux(8, 166.6);
  f.cadre(28, 170, 154, 104, 0.6);
  f.paragraphe(34, 176, 70, 5); f.barres(40, 210, 80, 20); f.qr(135, 205, 28); f.paragraphe(34, 245, 140, 5);
  const a = SEG.analyserPage({ masque: f.m, largeur: f.W, hauteur: f.H, pxParMm: PX_MM }, G.RECADRAGES);
  const r = enMm(a.auto);
  verifier(couvre(r, 28, 170, 154, 104) && dans(r, 28, 170, 154, 104), 'B2 pointillés + ciseaux : le bloc du bas, sans les consignes ni la ligne', fmt(r));
  verifier(a.separateurs.horizontaux >= 1, 'B2 : la ligne pointillée est vue comme séparateur', JSON.stringify(a.separateurs));
}
// B3. Quart haut gauche debout (type Colissimo), un reçu à droite, des consignes dessous.
{
  const f = Feuille(210, 297);
  f.cadre(18, 30, 104, 124, 0.8);
  f.paragraphe(22, 36, 90, 6); f.barres(26, 70, 85, 25); f.paragraphe(22, 105, 90, 8);
  f.cadre(140, 30, 60, 70, 0.4); f.paragraphe(144, 36, 50, 12); // reçu (preuve de dépôt)
  f.paragraphe(15, 180, 180, 15);
  const a = SEG.analyserPage({ masque: f.m, largeur: f.W, hauteur: f.H, pxParMm: PX_MM }, G.RECADRAGES);
  const r = enMm(a.auto);
  verifier(couvre(r, 18, 30, 104, 124) && dans(r, 18, 30, 104, 124), 'B3 quart haut gauche : l’étiquette seule, sans le reçu ni les consignes', fmt(r));
  verifier(G.tourPourPortrait(a.auto.l, a.auto.h) === 0, 'B3 : debout → pas de rotation');
}
// B4. A4 paysage, étiquette debout à droite (type Chronopost), consignes à gauche.
{
  const f = Feuille(297, 210);
  f.paragraphe(12, 20, 150, 30);
  f.cadre(180, 31, 112, 147, 0.7);
  f.paragraphe(185, 36, 95, 6); f.barresCouchees(250, 70, 25, 80); f.paragraphe(185, 110, 55, 12);
  const a = SEG.analyserPage({ masque: f.m, largeur: f.W, hauteur: f.H, pxParMm: PX_MM }, G.RECADRAGES);
  const r = enMm(a.auto);
  verifier(couvre(r, 180, 31, 112, 147) && dans(r, 180, 31, 112, 147), 'B4 A4 paysage : l’étiquette de droite (code-barres couché trouvé)', fmt(r));
  verifier(a.codes.some((c) => c.couche), 'B4 : le code-barres couché est vu');
}
// B5. Étiquette SANS cadre, blancs intérieurs de 4 à 5 mm : jamais coupée en morceaux.
{
  const f = Feuille(210, 297);
  f.paragraphe(15, 15, 85, 6); f.paragraphe(110, 15, 85, 6);   // expéditeur | destinataire
  f.barres(30, 49, 110, 24);                                       // 4 mm sous les adresses
  f.paragraphe(15, 78, 180, 5);                                    // 5 mm sous le code
  f.paragraphe(15, 150, 180, 20);                                  // consignes, 50 mm plus bas
  const a = SEG.analyserPage({ masque: f.m, largeur: f.W, hauteur: f.H, pxParMm: PX_MM }, G.RECADRAGES);
  const r = enMm(a.auto);
  verifier(couvre(r, 15, 15, 180, 80) && r.y + r.h < 120, 'B5 sans cadre : toute l’étiquette (adresses + code + bas), sans les consignes', fmt(r));
}
// B6. Une page sans aucun code : la détection le dit (confiance basse).
{
  const f = Feuille(210, 297);
  f.paragraphe(15, 20, 180, 40);
  const a = SEG.analyserPage({ masque: f.m, largeur: f.W, hauteur: f.H, pxParMm: PX_MM }, G.RECADRAGES);
  verifier(a.confiance === 'basse', 'B6 page de texte : confiance basse (la personne vérifie l’aperçu)', `${a.confiance}/${a.raison}`);
}
// B7. Une page blanche ne casse rien.
{
  const f = Feuille(210, 297);
  const a = SEG.analyserPage({ masque: f.m, largeur: f.W, hauteur: f.H, pxParMm: PX_MM }, G.RECADRAGES);
  verifier(a.raison === 'vide' && a.auto.l === f.W, 'B7 page blanche : page entière, raison « vide »');
}
// B8. Le texte seul ne passe jamais pour un code-barres.
{
  const f = Feuille(210, 297);
  f.paragraphe(10, 10, 190, 60, 3.2);
  f.plein(20, 220, 120, 12); // un titre plein (aplat)
  const codes = SEG.detecterCodes(f.m, f.W, f.H, PX_MM);
  verifier(codes.filter((c) => c.genre === 'barres').length === 0, 'B8 : texte serré et aplat ≠ code-barres', JSON.stringify(codes.map((c) => c.genre)));
}

// B9. Les consignes portent un code 2D (publicité « télécharge l'appli ») : l'ancre reste le code-barres.
{
  const f = Feuille(210, 297);
  f.cadre(6, 160, 198, 128, 0.6); f.paragraphe(12, 166, 80, 5); f.barres(30, 205, 100, 22); f.paragraphe(12, 240, 180, 6);
  f.paragraphe(15, 15, 120, 20); f.qr(150, 20, 35); f.paragraphe(15, 100, 180, 10);
  const a = SEG.analyserPage({ masque: f.m, largeur: f.W, hauteur: f.H, pxParMm: PX_MM }, G.RECADRAGES);
  const r = enMm(a.auto);
  verifier(couvre(r, 6, 160, 198, 128) && dans(r, 6, 160, 198, 128), 'B9 code 2D dans les consignes : l’étiquette au code-barres', fmt(r));
}
// B10. Un filet plein (bouts libres) sépare l'étiquette des consignes, 2 mm de blanc de chaque côté.
{
  const f = Feuille(210, 297);
  f.cadre(15, 10, 180, 125, 0.6); f.paragraphe(20, 16, 80, 5); f.barres(40, 60, 110, 25); f.paragraphe(20, 100, 160, 6);
  f.plein(5, 137, 200, 0.4);                  // le filet (le cadre finit à 135, 2 mm au-dessus)
  f.paragraphe(15, 139.6, 180, 25, 4.2);      // les consignes commencent 2,2 mm dessous
  const a = SEG.analyserPage({ masque: f.m, largeur: f.W, hauteur: f.H, pxParMm: PX_MM }, G.RECADRAGES);
  const r = enMm(a.auto);
  verifier(couvre(r, 15, 10, 180, 125) && dans(r, 15, 10, 180, 125), 'B10 filet plein + 2 mm de blanc : l’étiquette seule', fmt(r));
}

if (process.argv.includes('--segmentation-seule')) {
  console.log(`\n${ko ? '⚠' : '✓'} ${ok} ok, ${ko} KO`);
  process.exit(ko ? 1 : 0);
}

// ── C. CHAÎNE COMPLÈTE : pdf-lib → pdf.js (+ @napi-rs/canvas) → 10 × 15 ────
console.log('=== C. chaîne complète (vrais PDF fabriqués, rendus par pdf.js) ===');
let canvasNode = null;
try { canvasNode = require('@napi-rs/canvas'); } catch { canvasNode = null; }
verifier(Boolean(canvasNode), '@napi-rs/canvas présent (dépendance facultative de pdfjs-dist, installée avec lui)');
if (!canvasNode) { console.log(`\n⚠ ${ok} ok, ${ko} KO`); process.exit(1); }
const { PDFDocument, rgb, degrees } = require('pdf-lib');
const M = await import(pathToFileURL(path.join(RACINE, 'src/messagerie/impression/moteur.js')).href);
const OPTIONS = {
  creerCanevas: (l, h) => canvasNode.createCanvas(l, h),
  pdfjs: { standardFontDataUrl: `${path.join(RACINE, 'node_modules', 'pdfjs-dist', 'standard_fonts').replace(/\\/g, '/')}/` },
};
const MM = 72 / 25.4;
// Une page dessinée en mm (origine en haut à gauche), comme les matrices du § B.
// `rotation` : /Rotate de la page ; le dessin est fait pour que la page AFFICHÉE
// soit celle décrite (le contenu est posé de biais dans l'espace du contenu).
function PagePdf(doc, lmm, hmm, rotation = 0) {
  const couche = rotation % 180 !== 0;
  const page = doc.addPage(couche ? [hmm * MM, lmm * MM] : [lmm * MM, hmm * MM]);
  if (rotation) page.setRotation(degrees(rotation));
  const W = page.getWidth(); const H = page.getHeight();
  const noir = rgb(0, 0, 0);
  const plein = (x, y, l, h) => {
    const u = x * MM; const v = y * MM; const lp = l * MM; const hp = h * MM;
    if (rotation === 90) page.drawRectangle({ x: v, y: u, width: hp, height: lp, color: noir });
    else if (rotation === 180) page.drawRectangle({ x: W - u - lp, y: v, width: lp, height: hp, color: noir });
    else if (rotation === 270) page.drawRectangle({ x: W - v - hp, y: H - u - lp, width: hp, height: lp, color: noir });
    else page.drawRectangle({ x: u, y: H - v - hp, width: lp, height: hp, color: noir });
  };
  const f = {
    plein,
    cadre: (x, y, l, h, e = 0.5) => { plein(x, y, l, e); plein(x, y + h - e, l, e); plein(x, y, e, h); plein(x + l - e, y, e, h); },
    texte: (x, y, l, corps = 2.4) => { let cx = x; let n = 0; while (cx < x + l - 1.6) { plein(cx, y, 1.2, corps); cx += 1.8; n++; if (n % 6 === 0) cx += 1.6; } },
    paragraphe: (x, y, l, lignes, pas = 4) => { for (let i = 0; i < lignes; i++) f.texte(x, y + i * pas, l); },
    barres: (x, y, l, h) => { let cx = x; let i = 0; while (cx < x + l) { const b = 0.35 * (1 + (i % 3)); plein(cx, y, b, h); cx += b + 0.35 * (1 + ((i * 7) % 2)); i++; } },
  };
  return f;
}
// Le bordereau type Mondial Relay : l'étiquette couchée en haut (avec un repère
// plein de 20 × 4 mm dans son coin haut gauche), les consignes dessous (avec
// un carré plein de 12 mm qui ne doit JAMAIS finir sur l'étiquette 10 × 15).
function dessinerMondialRelay(f) {
  f.cadre(4, 4, 202, 136, 0.6);
  f.plein(8, 8, 20, 4); // repère du coin haut gauche de l'étiquette
  f.paragraphe(10, 18, 80, 5); f.paragraphe(110, 18, 80, 6);
  f.barres(20, 70, 90, 22);
  f.paragraphe(10, 110, 180, 5);
  f.paragraphe(10, 160, 190, 6);
  f.plein(20, 200, 12, 12); // carré des consignes
  f.paragraphe(10, 230, 190, 8);
}
async function pdfMondialRelay(rotation = 0) {
  const doc = await PDFDocument.create();
  dessinerMondialRelay(PagePdf(doc, 210, 297, rotation));
  return doc.save();
}
// Rendu d'une page de sortie en matrice (100 ppp), et ses composantes pleines.
async function matriceDe(octets, numero = 1, dpi = 100) {
  const pdfjs = await M.chargerPdfjs();
  const d = await pdfjs.getDocument({ data: octets.slice(), isEvalSupported: false, ...OPTIONS.pdfjs }).promise;
  const p = await d.getPage(numero);
  const v = p.getViewport({ scale: dpi / 72 });
  const c = canvasNode.createCanvas(Math.ceil(v.width), Math.ceil(v.height));
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await p.render({ canvas: c, viewport: v }).promise;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const out = { W: c.width, H: c.height, m: SEG.masqueDepuisRGBA(img.data, c.width, c.height), pxParMm: dpi / 25.4, largeurPt: v.width / (dpi / 72), hauteurPt: v.height / (dpi / 72), pages: d.numPages };
  await M.fermer(d);
  return out;
}
function composantesPleines(r) {
  const { W, H, m, pxParMm } = r; const vus = new Uint8Array(W * H); const out = [];
  for (let i = 0; i < W * H; i++) {
    if (!m[i] || vus[i]) continue;
    const pile = [i]; vus[i] = 1; let n = 0; let x0 = W; let x1 = -1; let y0 = H; let y1 = -1;
    while (pile.length) {
      const k = pile.pop(); const kx = k % W; const ky = (k - kx) / W; n++;
      if (kx < x0) x0 = kx; if (kx > x1) x1 = kx; if (ky < y0) y0 = ky; if (ky > y1) y1 = ky;
      for (const j of [k + 1, k - 1, k + W, k - W]) {
        if (j < 0 || j >= W * H || vus[j] || !m[j]) continue;
        if ((j === k + 1 && j % W === 0) || (j === k - 1 && k % W === 0)) continue;
        vus[j] = 1; pile.push(j);
      }
    }
    const l = (x1 - x0 + 1); const h = (y1 - y0 + 1);
    if (n / (l * h) >= 0.85 && l * h >= 9) out.push({ x: x0 / W, y: y0 / H, lmm: l / pxParMm, hmm: h / pxParMm, remplissage: n / (l * h) });
  }
  return out;
}
const carre = (c, min) => c.lmm >= min && c.hmm >= min && c.lmm / c.hmm >= 0.8 && c.lmm / c.hmm <= 1.25;
const repereTourne = (c) => c.lmm >= 1.8 && c.lmm <= 4.5 && c.hmm >= 10 && c.hmm <= 18; // 20 × 4 mm × ≈ 0,7, debout
const repereDroit = (c) => c.hmm >= 1.8 && c.hmm <= 4.5 && c.lmm >= 10 && c.lmm <= 18;

// C1. Mondial Relay type : 10 × 15 automatique.
const octetsMR = await pdfMondialRelay(0);
const srcMR = await M.ouvrirSource(octetsMR, OPTIONS);
const c1 = await M.fabriquer10x15(srcMR, { recadrage: 'auto' }, OPTIONS);
{
  const doc = await PDFDocument.load(c1.octets);
  const pg = doc.getPage(0);
  verifier(doc.getPageCount() === 1 && proche(pg.getWidth(), 283.46, 0.02) && proche(pg.getHeight(), 425.2, 0.02), 'C1 : UNE page de 283,46 × 425,2 pt (100 × 150 mm)', `${doc.getPageCount()} p, ${pg.getWidth()} × ${pg.getHeight()}`);
  verifier(c1.vectoriel === true && c1.tour === 90 && c1.recadrage === 'auto' && c1.confiance === 'haute', 'C1 : découpe vectorielle, tournée d’un quart de tour, confiance haute', JSON.stringify({ v: c1.vectoriel, t: c1.tour, r: c1.recadrage, c: c1.confiance }));
  const r = await matriceDe(c1.octets);
  const pleines = composantesPleines(r);
  verifier(!pleines.some((c) => carre(c, 4)), 'C1 : le carré des consignes N’EST PAS sur l’étiquette', JSON.stringify(pleines.filter((c) => carre(c, 3))));
  const rep = pleines.find(repereTourne);
  verifier(Boolean(rep) && rep.x > 0.6 && rep.y < 0.3, 'C1 : le coin haut gauche de l’étiquette est en haut à droite (quart de tour horaire)', JSON.stringify(rep ?? pleines.slice(0, 5)));
  const S = SEG.integrale(r.m, r.W, r.H);
  const b = SEG.boiteEncre(S, r.W, { x0: 0, y0: 0, x1: r.W, y1: r.H });
  const remplitL = (b.x1 - b.x0) / r.pxParMm; const remplitH = (b.y1 - b.y0) / r.pxParMm;
  verifier(remplitL >= 90 && remplitH >= 135, 'C1 : l’étiquette remplit la page (≥ 90 × 135 mm d’encre sur 100 × 150)', `${remplitL.toFixed(1)} × ${remplitH.toFixed(1)} mm`);
  verifier(b.x0 / r.pxParMm >= 1 && b.y0 / r.pxParMm >= 1 && (r.W - b.x1) / r.pxParMm >= 1 && (r.H - b.y1) / r.pxParMm >= 1, 'C1 : une marge blanche tout autour (≈ 1,5 mm)');
}
// C2. Le même bordereau dans une page à /Rotate 90 : même résultat à l'écran.
{
  const o = await pdfMondialRelay(90);
  const s = await M.ouvrirSource(o, OPTIONS);
  const c2 = await M.fabriquer10x15(s, { recadrage: 'auto' }, OPTIONS);
  const r = await matriceDe(c2.octets);
  const pleines = composantesPleines(r);
  const rep = pleines.find(repereTourne);
  verifier(c2.vectoriel && !pleines.some((c) => carre(c, 4)) && Boolean(rep) && rep.x > 0.6 && rep.y < 0.3, 'C2 /Rotate 90 : même étiquette, même sens, sans les consignes', JSON.stringify({ rep, carres: pleines.filter((c) => carre(c, 4)) }));
}
// C3. Un recadrage NOMMÉ choisi est suivi (moitié basse : les consignes, pas l'étiquette).
{
  const c3 = await M.fabriquer10x15(srcMR, { recadrage: 'bas' }, OPTIONS);
  const r = await matriceDe(c3.octets);
  const pleines = composantesPleines(r);
  verifier(c3.recadrage === 'bas' && pleines.some((c) => carre(c, 6)) && !pleines.some((c) => repereTourne(c) || repereDroit(c)), 'C3 recadrage « moitié basse » : il est suivi (le carré des consignes y est, le repère de l’étiquette non)', JSON.stringify(pleines.slice(0, 6)));
}
// C4. Une page déjà 10 × 15 : rien découpé ; couchée, elle est tournée.
{
  const doc = await PDFDocument.create();
  const f = PagePdf(doc, 100, 150);
  f.cadre(3, 3, 94, 144, 0.6); f.plein(6, 6, 20, 4); f.barres(15, 60, 70, 25); f.paragraphe(8, 100, 80, 6);
  const o = await doc.save();
  const s = await M.ouvrirSource(o, OPTIONS);
  const c4 = await M.fabriquer10x15(s, {}, OPTIONS);
  const r = await matriceDe(c4.octets);
  const pleines = composantesPleines(r);
  const rep = pleines.find((c) => c.hmm >= 3 && c.hmm <= 4.6 && c.lmm >= 18 && c.lmm <= 21);
  verifier(c4.tour === 0 && proche(r.largeurPt, 283.46, 0.05) && Boolean(rep) && rep.x < 0.2 && rep.y < 0.1, 'C4 page déjà 10 × 15 debout : gardée telle quelle (repère toujours en haut à gauche, même taille)', JSON.stringify({ tour: c4.tour, rep }));
  const doc2 = await PDFDocument.create();
  const g = PagePdf(doc2, 150, 100);
  g.cadre(3, 3, 144, 94, 0.6); g.plein(6, 6, 20, 4); g.barres(30, 30, 70, 25);
  const s2 = await M.ouvrirSource(await doc2.save(), OPTIONS);
  const c4b = await M.fabriquer10x15(s2, {}, OPTIONS);
  const r2 = await matriceDe(c4b.octets);
  const rep2 = composantesPleines(r2).find((c) => c.lmm >= 3 && c.lmm <= 4.6 && c.hmm >= 18 && c.hmm <= 21);
  verifier(c4b.tour === 90 && proche(r2.hauteurPt, 425.2, 0.05) && Boolean(rep2) && rep2.x > 0.8 && rep2.y < 0.1, 'C4 page 15 × 10 couchée : tournée en portrait 100 × 150, sans réduction', JSON.stringify({ tour: c4b.tour, rep2 }));
}
// C5. Une image PNG (code de dépôt) → une page 10 × 15.
async function pngCode(l, h) {
  const c = canvasNode.createCanvas(l, h); const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, l, h); ctx.fillStyle = '#000';
  const alea = hasard(3);
  for (let y = 0; y < h; y += 8) for (let x = 0; x < l; x += 8) if (alea() < 0.5) ctx.fillRect(x, y, 8, 8);
  return new Uint8Array(await c.encode('png'));
}
const octetsPng = await pngCode(240, 240);
{
  const s = await M.ouvrirSource(octetsPng, OPTIONS);
  const c5 = await M.fabriquer10x15(s, {}, OPTIONS);
  const doc = await PDFDocument.load(c5.octets);
  const r = await matriceDe(c5.octets);
  const S = SEG.integrale(r.m, r.W, r.H);
  const b = SEG.boiteEncre(S, r.W, { x0: 0, y0: 0, x1: r.W, y1: r.H });
  verifier(s.genre === 'png' && doc.getPageCount() === 1 && proche(doc.getPage(0).getWidth(), 283.46, 0.02) && (b.x1 - b.x0) / r.pxParMm >= 90, 'C5 image PNG (code) : une page 10 × 15, le code en pleine largeur', JSON.stringify({ genre: s.genre, l: ((b.x1 - b.x0) / r.pxParMm).toFixed(1) }));
}
// C6. Repli en image (pdf-lib incapable de lire le fichier) : même page, même découpe.
{
  const c6 = await M.fabriquer10x15(srcMR, { recadrage: 'auto' }, { ...OPTIONS, forcerImage: true });
  const r = await matriceDe(c6.octets);
  const pleines = composantesPleines(r);
  const rep = pleines.find(repereTourne);
  verifier(c6.vectoriel === false && proche(r.largeurPt, 283.46, 0.05) && !pleines.some((c) => carre(c, 4)) && Boolean(rep) && rep.x > 0.6, 'C6 repli image (300 ppp) : même étiquette, même sens, sans les consignes', JSON.stringify({ v: c6.vectoriel, rep }));
}
// C7. Analyse : la bonne page d'un PDF de deux pages (consignes en 1, étiquette en 2).
{
  const doc = await PDFDocument.create();
  const p1 = PagePdf(doc, 210, 297); p1.paragraphe(15, 20, 180, 40);
  const p2 = PagePdf(doc, 210, 297); dessinerMondialRelay(p2);
  const s = await M.ouvrirSource(await doc.save(), OPTIONS);
  const n = await M.choisirPage(s, OPTIONS);
  verifier(s.nbPages === 2 && n === 2, 'C7 PDF de deux pages : l’étiquette est cherchée sur la page qui porte le code-barres', `${s.nbPages} pages, page ${n}`);
}

// ── D. « TOUT IMPRIMER » ───────────────────────────────────────────────────
console.log('=== D. tout imprimer ===');
{
  const s1 = await M.ouvrirSource(octetsMR, OPTIONS);
  const doc = await PDFDocument.create();
  const f = PagePdf(doc, 100, 150); f.cadre(3, 3, 94, 144); f.barres(15, 60, 70, 25);
  const s2 = await M.ouvrirSource(await doc.save(), OPTIONS);
  const s3 = await M.ouvrirSource(octetsPng, OPTIONS);
  const casse = { genre: 'pdf', octets: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3]), pages: [{ numero: 1, largeurPt: 595, hauteurPt: 842 }], analyses: {} };
  const t = await M.fusionner([s1, s2, s3], { format: '10x15', choix: [{ recadrage: 'auto' }, {}, {}] }, OPTIONS);
  const d = await PDFDocument.load(t.octets);
  const tailles = d.getPages().map((p) => [p.getWidth(), p.getHeight()]);
  verifier(t.pages === 3 && tailles.every(([l, h]) => proche(l, 283.46, 0.02) && proche(h, 425.2, 0.02)), 'D1 3 bordereaux (PDF A4, PDF 10 × 15, code PNG) → 3 pages 10 × 15', JSON.stringify(tailles));
  const o = await M.fusionner([s1, s2, s3], { format: 'origine' }, OPTIONS);
  const d2 = await PDFDocument.load(o.octets);
  const t2 = d2.getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]);
  verifier(o.pages === 3 && t2[0][0] === 595 && t2[0][1] === 842 && t2[1][0] === 283 && t2[2][0] === Math.round(240 * 72 / 150), 'D2 format d’origine : chaque page telle quelle (A4, 10 × 15, code à 150 ppp)', JSON.stringify(t2));
  const avecCasse = await M.fusionner([s1, casse, s3], { format: '10x15' }, OPTIONS);
  verifier(avecCasse.pages === 2 && avecCasse.sautes.length === 1 && avecCasse.sautes[0].index === 1, 'D3 un bordereau illisible est sauté ET compté (jamais en silence)', JSON.stringify({ pages: avecCasse.pages, sautes: avecCasse.sautes }));
}

console.log(`\n${ko ? '⚠' : '✓'} ${ok} ok, ${ko} KO`);
process.exit(ko ? 1 : 0);
