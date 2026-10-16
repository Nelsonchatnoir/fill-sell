// ═══════════════════════════════════════════════════════════════════════════
// BORDEREAUX — GÉOMÉTRIE DE L'ÉTIQUETTE 10 × 15 (bêta, 16/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Fonctions PURES (testées en Node : scripts/bordereau-impression-selftest.mjs).
// Trois repères, jamais mélangés :
//   · la page AFFICHÉE (ce que pdf.js dessine, /Rotate appliqué) : origine en
//     haut à gauche, en points (1 pt = 1/72 in) — c'est là que vivent les
//     recadrages et la détection ;
//   · l'espace du CONTENU de la page PDF (origine en bas à gauche, /Rotate NON
//     appliqué) : c'est ce que pdf-lib découpe (embedPage) ;
//   · la page de SORTIE 10 × 15 cm, portrait.
// L'étiquette est découpée en VECTORIEL (embedPage + boîte) : le code-barres
// reste net à toute taille ; seul un PDF que pdf-lib ne sait pas lire passe
// par une image (moteur.js).

export const PT_PAR_MM = 72 / 25.4;
/** La page de sortie : 100 × 150 mm, portrait (283,46 × 425,2 pt). */
export const PAGE_10X15 = Object.freeze({ largeur: 100 * PT_PAR_MM, hauteur: 150 * PT_PAR_MM });
/** Marge blanche autour de l'étiquette sur la page 10 × 15 (2 mm au plus). */
export const MARGE_10X15 = 1.5 * PT_PAR_MM;

/** Un angle ramené à 0, 90, 180 ou 270. */
export function quart(angle) {
  const a = Math.round(Number(angle) / 90) * 90;
  return ((a % 360) + 360) % 360;
}

/**
 * Une page qui EST déjà une étiquette : ≈ 10 × 15 cm ou 4 × 6 in, dans un sens
 * ou dans l'autre (tolérance 12 %). Elle n'est pas découpée, seulement tournée.
 */
export function pageDejaEtiquette(largeurPt, hauteurPt) {
  const petit = Math.min(largeurPt, hauteurPt) / PT_PAR_MM;
  const grand = Math.max(largeurPt, hauteurPt) / PT_PAR_MM;
  const proche = (v, cible) => Math.abs(v - cible) / cible <= 0.12;
  return (proche(petit, 100) && proche(grand, 150)) || (proche(petit, 101.6) && proche(grand, 152.4));
}

// Les recadrages NOMMÉS, en fractions de la page affichée (origine en haut à
// gauche). Ce sont les secours de « Ajuster le recadrage » : chacun est ensuite
// resserré sur l'encre qu'il contient (segmentation.js).
export const RECADRAGES = Object.freeze({
  page: Object.freeze({ x: 0, y: 0, l: 1, h: 1 }),
  haut: Object.freeze({ x: 0, y: 0, l: 1, h: 0.5 }),
  bas: Object.freeze({ x: 0, y: 0.5, l: 1, h: 0.5 }),
  gauche: Object.freeze({ x: 0, y: 0, l: 0.5, h: 1 }),
  droite: Object.freeze({ x: 0.5, y: 0, l: 0.5, h: 1 }),
  'haut-gauche': Object.freeze({ x: 0, y: 0, l: 0.5, h: 0.5 }),
  'haut-droite': Object.freeze({ x: 0.5, y: 0, l: 0.5, h: 0.5 }),
  'bas-gauche': Object.freeze({ x: 0, y: 0.5, l: 0.5, h: 0.5 }),
  'bas-droite': Object.freeze({ x: 0.5, y: 0.5, l: 0.5, h: 0.5 }),
});
/** L'ordre proposé à l'écran (« auto » = la détection). */
export const ORDRE_RECADRAGES = Object.freeze(['auto', 'page', 'haut', 'bas', 'haut-gauche', 'haut-droite', 'bas-gauche', 'bas-droite', 'gauche', 'droite']);

export function libelleRecadrage(nom, lang = 'fr') {
  const fr = lang !== 'en';
  const L = {
    auto: ['Automatique', 'Automatic'],
    page: ['Page entière', 'Whole page'],
    haut: ['Moitié haute', 'Top half'],
    bas: ['Moitié basse', 'Bottom half'],
    gauche: ['Moitié gauche', 'Left half'],
    droite: ['Moitié droite', 'Right half'],
    'haut-gauche': ['Quart haut gauche', 'Top-left quarter'],
    'haut-droite': ['Quart haut droit', 'Top-right quarter'],
    'bas-gauche': ['Quart bas gauche', 'Bottom-left quarter'],
    'bas-droite': ['Quart bas droit', 'Bottom-right quarter'],
  }[nom];
  return L ? (fr ? L[0] : L[1]) : String(nom ?? '');
}

/**
 * Un rectangle de la page AFFICHÉE (points, origine en haut à gauche :
 * {x, y, l, h}) → la boîte correspondante dans l'espace du CONTENU
 * ({left, bottom, right, top}, pour embedPage de pdf-lib).
 * `boite` = la boîte de la page dans l'espace du contenu (CropBox, sinon
 * MediaBox) : {x, y, largeur, hauteur} ; `rotation` = /Rotate (sens horaire).
 */
export function boiteContenu(rect, boite, rotation = 0) {
  const R = quart(rotation);
  const { x: bx, y: by, largeur: W, hauteur: H } = boite;
  const u0 = rect.x; const u1 = rect.x + rect.l;
  const v0 = rect.y; const v1 = rect.y + rect.h;
  switch (R) {
    case 90: return { left: bx + v0, right: bx + v1, bottom: by + u0, top: by + u1 };
    case 180: return { left: bx + W - u1, right: bx + W - u0, bottom: by + v0, top: by + v1 };
    case 270: return { left: bx + W - v1, right: bx + W - v0, bottom: by + H - u1, top: by + H - u0 };
    default: return { left: bx + u0, right: bx + u1, bottom: by + H - v1, top: by + H - v0 };
  }
}

/** Les dimensions de la page affichée (après /Rotate). */
export function dimensionsAffichees(boite, rotation = 0) {
  return quart(rotation) % 180 === 0
    ? { largeur: boite.largeur, hauteur: boite.hauteur }
    : { largeur: boite.hauteur, hauteur: boite.largeur };
}

/**
 * Le quart de tour à ajouter pour qu'un rectangle AFFICHÉ (l × h) tienne en
 * portrait : 90 (sens horaire) s'il est en paysage, 0 sinon.
 */
export function tourPourPortrait(l, h) {
  return l > h * 1.02 ? 90 : 0;
}

/**
 * Où poser une boîte du contenu (cw × ch, en points) sur la page de sortie,
 * tournée de `horaire` degrés (sens horaire, multiple de 90), centrée, la plus
 * grande possible dans la marge. Rend les paramètres de drawPage / drawImage
 * de pdf-lib : {x, y, echelle, rotationAntihoraire} — pdf-lib tourne dans le
 * sens antihoraire autour du point (x, y), coin bas gauche de l'objet.
 */
export function placement(cw, ch, horaire = 0, page = PAGE_10X15, marge = MARGE_10X15) {
  const t = quart(horaire);
  const couche = t % 180 !== 0;
  const lw = couche ? ch : cw; // emprise une fois tournée
  const lh = couche ? cw : ch;
  const dispoL = page.largeur - 2 * marge;
  const dispoH = page.hauteur - 2 * marge;
  const echelle = Math.min(dispoL / lw, dispoH / lh);
  const ws = cw * echelle; const hs = ch * echelle;
  const tx = (page.largeur - lw * echelle) / 2; // coin bas gauche de l'emprise tournée
  const ty = (page.hauteur - lh * echelle) / 2;
  let x = tx; let y = ty;
  if (t === 90) { y = ty + ws; }
  else if (t === 180) { x = tx + ws; y = ty + hs; }
  else if (t === 270) { x = tx + hs; }
  return { x, y, echelle, rotationAntihoraire: (360 - t) % 360, emprise: { x: tx, y: ty, l: lw * echelle, h: lh * echelle } };
}

/**
 * Le point (px, py) de l'objet (repère de l'objet, avant échelle) une fois posé
 * par `placement` — pour les tests : vérifier que les coins tombent dans la page.
 */
export function poser(px, py, pl) {
  const a = (pl.rotationAntihoraire * Math.PI) / 180;
  const sx = px * pl.echelle; const sy = py * pl.echelle;
  return { x: pl.x + sx * Math.cos(a) - sy * Math.sin(a), y: pl.y + sx * Math.sin(a) + sy * Math.cos(a) };
}

/** Un rectangle en pixels de rendu → en points de la page affichée. */
export function pixelsVersPoints(rect, pxParPt) {
  return { x: rect.x / pxParPt, y: rect.y / pxParPt, l: rect.l / pxParPt, h: rect.h / pxParPt };
}

/** Borne un rectangle (points) à la page affichée. */
export function borner(rect, largeur, hauteur) {
  const x = Math.max(0, Math.min(largeur, rect.x));
  const y = Math.max(0, Math.min(hauteur, rect.y));
  return { x, y, l: Math.max(0, Math.min(largeur, rect.x + rect.l) - x), h: Math.max(0, Math.min(hauteur, rect.y + rect.h) - y) };
}

/** Le nom du fichier, sans caractère gênant : « bordereau-vinted-12345-10x15.pdf ». */
export function nomFichier({ platform, commande_ref: ref, suffixe = '', extension = 'pdf' } = {}) {
  const propre = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const morceaux = ['bordereau', propre(platform), propre(ref), propre(suffixe)].filter(Boolean);
  return `${morceaux.join('-')}.${extension}`;
}

/** Le genre d'un fichier, lu dans ses premiers octets (jamais dans son nom). */
export function genreFichier(octets) {
  const o = octets instanceof Uint8Array ? octets : new Uint8Array(octets ?? []);
  if (o[0] === 0x25 && o[1] === 0x50 && o[2] === 0x44 && o[3] === 0x46) return 'pdf';
  if (o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47) return 'png';
  if (o[0] === 0xff && o[1] === 0xd8) return 'jpeg';
  return null;
}
