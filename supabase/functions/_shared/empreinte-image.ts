// ═══════════════════════════════════════════════════════════════════════════
// EMPREINTE D'IMAGE — « ces deux photos sont-elles la même ? » (2026-09-23)
// ═══════════════════════════════════════════════════════════════════════════
// POURQUOI. Les photos ne sont PAS partagées entre plateformes (Beebs =
// cdn.beebs.app, Vinted = images1.vinted.net, Leboncoin = img.leboncoin.fr) :
// comparer des URL ne dit rien. Et les titres collent sur la couleur
// (« Rangement Blanc… » ↔ « Rangement Bleu… » = 0,89 de recouvrement au
// faisceau → faux jumeau, Louis, 23/09). Il fallait une preuve qui regarde
// l'IMAGE elle-même.
//
// CE QUE C'EST. Trois empreintes, calculées sur les pixels décodés :
//   · dHash 64 bits — gris 9×8 par moyenne de zones, un bit par voisinage
//     horizontal (« plus clair que le suivant »). Robuste à la recompression,
//     au redimensionnement, au léger recadrage ;
//   · pHash 64 bits — gris 32×32, DCT, 8×8 basses fréquences, seuil médiane.
//     Robuste aux mêmes choses, plus sensible aux structures ;
//   · signature couleur — 4×4 zones, teinte dominante par zone (12 bins) ou
//     « g » (gris/peu saturé). C'est elle qui sépare deux photos identiques
//     à la couleur près.
// Le décodage n'est PAS ici (imagescript côté serveur, sharp dans les
// scripts) : ce module ne voit que des pixels RGBA. C'est ce qui le rend
// testable en Node ET exécutable dans une fonction edge, à l'identique.
//
// SEUILS, mesurés le 23/09 sur le stock de Louis (dumps, sharp) :
//   · même photo re-hébergée (LBC ↔ Vinted, 16 paires) : dHash 0-1, pHash 0-2 ;
//   · paires aléatoires (60) : dHash ≥ 16, pHash ≥ 18 ;
//   · même objet, AUTRE prise de vue : 6-16 — pas une preuve, un indice.
// ⛔ Les kits de Louis de couleurs différentes partagent la MÊME photo
//    (dHash 0) : l'empreinte ne remplace jamais l'exclusion par la couleur
//    du titre (variantesTitre), elle vient APRÈS.

export type Rgba = { data: Uint8ClampedArray | Uint8Array; width: number; height: number };
export type Empreinte = { dhash: string; phash: string; couleur: string };

/** Seuils de décision, partagés serveur ↔ app. */
export const SEUILS_EMPREINTE = Object.freeze({
  identique: Object.freeze({ dhash: 5, phash: 8 }),   // preuve : même photo
  proche: Object.freeze({ dhash: 10 }),               // indice : même objet, autre prise ?
});

/** Luminance d'un pixel, pondération BT.601. */
const luma = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Gris réduit à cw × ch par MOYENNE DE ZONE (box filter) : chaque cellule vaut
 * la luminance moyenne de tous les pixels qu'elle couvre. Pas d'interpolation,
 * pas de bibliothèque : le même résultat partout où les pixels sont les mêmes.
 */
export function grisReduit(img: Rgba, cw: number, ch: number): Float64Array {
  const { data, width: w, height: h } = img;
  const out = new Float64Array(cw * ch);
  for (let cy = 0; cy < ch; cy++) {
    const y0 = Math.floor((cy * h) / ch);
    const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * h) / ch));
    for (let cx = 0; cx < cw; cx++) {
      const x0 = Math.floor((cx * w) / cw);
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * w) / cw));
      let somme = 0, n = 0;
      for (let y = y0; y < y1 && y < h; y++) {
        let i = (y * w + x0) * 4;
        for (let x = x0; x < x1 && x < w; x++, i += 4) { somme += luma(data[i], data[i + 1], data[i + 2]); n++; }
      }
      out[cy * cw + cx] = n ? somme / n : 0;
    }
  }
  return out;
}

/** dHash : gris 9×8, un bit par paire horizontale (gauche < droite). */
export function dhashDepuisGris(g9x8: Float64Array): string {
  let bits = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += g9x8[y * 9 + x] < g9x8[y * 9 + x + 1] ? "1" : "0";
  return bits;
}

/** DCT-II séparable d'une matrice n×n (lignes puis colonnes). */
function dct2(m: Float64Array, n: number): Float64Array {
  const cos = new Float64Array(n * n);
  for (let u = 0; u < n; u++) for (let x = 0; x < n; x++) cos[u * n + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * n));
  const c = (k: number) => (k === 0 ? Math.SQRT1_2 : 1);
  const tmp = new Float64Array(n * n);
  for (let y = 0; y < n; y++) for (let u = 0; u < n; u++) {
    let s = 0;
    for (let x = 0; x < n; x++) s += m[y * n + x] * cos[u * n + x];
    tmp[y * n + u] = s * c(u);
  }
  const out = new Float64Array(n * n);
  for (let u = 0; u < n; u++) for (let v = 0; v < n; v++) {
    let s = 0;
    for (let y = 0; y < n; y++) s += tmp[y * n + u] * cos[v * n + y];
    out[v * n + u] = (s * c(v)) / 4;
  }
  return out;
}

/** pHash : gris 32×32 → DCT → 8×8 basses fréquences → bit = au-dessus de la médiane. */
export function phashDepuisGris(g32: Float64Array): string {
  const n = 32;
  const d = dct2(g32, n);
  const bas: number[] = [];
  for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) bas.push(d[v * n + u]);
  const tries = [...bas].sort((a, b) => a - b);
  const mediane = (tries[31] + tries[32]) / 2;
  return bas.map((x) => (x > mediane ? "1" : "0")).join("");
}

/** Signature couleur : 4×4 zones, teinte dominante (0-11) ou « g » si peu saturée. */
export function signatureCouleur(img: Rgba, n = 4): string {
  const { data, width: w, height: h } = img;
  const cellules: string[] = [];
  for (let cy = 0; cy < n; cy++) {
    const y0 = Math.floor((cy * h) / n), y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * h) / n));
    for (let cx = 0; cx < n; cx++) {
      const x0 = Math.floor((cx * w) / n), x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * w) / n));
      let R = 0, G = 0, B = 0, k = 0;
      for (let y = y0; y < y1 && y < h; y++) {
        let i = (y * w + x0) * 4;
        for (let x = x0; x < x1 && x < w; x++, i += 4) { R += data[i]; G += data[i + 1]; B += data[i + 2]; k++; }
      }
      if (!k) { cellules.push("g"); continue; }
      const r = R / k / 255, g = G / k / 255, b = B / k / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = mx ? (mx - mn) / mx : 0;
      if (sat < 0.18) { cellules.push("g"); continue; }
      let hue = 0;
      if (mx === r) hue = ((g - b) / (mx - mn)) % 6;
      else if (mx === g) hue = (b - r) / (mx - mn) + 2;
      else hue = (r - g) / (mx - mn) + 4;
      hue = (hue * 60 + 360) % 360;
      // UN caractère par cellule (0-9, a, b) : la distance de Hamming compare
      // des chaînes de même longueur, jamais « 10 » contre « 1 ».
      cellules.push("0123456789ab"[Math.min(11, Math.floor(hue / 30))]);
    }
  }
  return cellules.join("");
}

/** Les trois empreintes d'une image décodée. */
export function empreinteDepuisRgba(img: Rgba): Empreinte {
  return {
    dhash: dhashDepuisGris(grisReduit(img, 9, 8)),
    phash: phashDepuisGris(grisReduit(img, 32, 32)),
    couleur: signatureCouleur(img, 4),
  };
}

/** Distance de Hamming entre deux chaînes de même longueur (bits ou cellules). */
export function hamming(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return Number.POSITIVE_INFINITY;
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}

export type Verdict = "identique" | "proche" | "differente";

/** Compare deux empreintes : « identique » = preuve, « proche » = indice, sinon rien. */
export function comparerEmpreintes(a: Empreinte | null | undefined, b: Empreinte | null | undefined): { dhash: number; phash: number; couleur: number; verdict: Verdict } {
  if (!a || !b) return { dhash: Infinity, phash: Infinity, couleur: Infinity, verdict: "differente" };
  const dh = hamming(a.dhash, b.dhash);
  const ph = hamming(a.phash, b.phash);
  const co = hamming(a.couleur, b.couleur);
  const verdict: Verdict = dh <= SEUILS_EMPREINTE.identique.dhash && ph <= SEUILS_EMPREINTE.identique.phash
    ? "identique"
    : dh <= SEUILS_EMPREINTE.proche.dhash ? "proche" : "differente";
  return { dhash: dh, phash: ph, couleur: co, verdict };
}

/**
 * Le meilleur appariement entre deux LISTES d'empreintes (les photos d'un
 * article contre celles d'une annonce) : la paire la plus proche décide.
 */
export function meilleurAppariement(a: Array<Empreinte | null | undefined>, b: Array<Empreinte | null | undefined>) {
  let meilleur: ReturnType<typeof comparerEmpreintes> | null = null;
  for (const x of a) for (const y of b) {
    const c = comparerEmpreintes(x, y);
    if (!meilleur || c.dhash + c.phash < meilleur.dhash + meilleur.phash) meilleur = c;
  }
  return meilleur ?? { dhash: Infinity, phash: Infinity, couleur: Infinity, verdict: "differente" as Verdict };
}

// ── LES VARIANTES (08/10/2026, multi-synchro) ───────────────────────────────
// Vinted recadre en 3:4, Leboncoin filigrane et sert une vignette, Beebs
// encadre : deux photos IDENTIQUES ressortaient à 11-31 bits sur l'image
// entière (mesuré le 07/10 sur Corinne), 0-4 sur un carré central. On garde
// donc, en plus de l'image entière, cinq lectures de son centre :
//   · c70 : le rectangle central (70 % de la largeur et de la hauteur) ;
//   · p85 : le carré centré, côté = 85 % du PETIT côté ;
//   · g45, g60, g35 : le carré centré, côté = 45/60/35 % du GRAND côté
//     (borné au petit côté) — un recadrage vertical ou horizontal d'une même
//     photo retombe sur l'une de ces fenêtres.
// Chaque lecture = dHash + pHash. Calculées sur l'image réduite à 256 px de
// côté au plus (box filter, même arithmétique que grisReduit) : le décodage
// coûte, les crops ne coûtent presque rien.
export type Variantes = Record<string, [string, string]>;
export const VARIANTES_CLES = ["c70", "p85", "g45", "g60", "g35"] as const;

/** Réduction par moyenne de zones à `max` px de côté au plus (jamais agrandie). */
export function reduireRgba(img: Rgba, max = 256): Rgba {
  const { data, width: w, height: h } = img;
  const s = Math.min(1, max / Math.max(w, h));
  if (s >= 1) return img;
  const cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let cy = 0; cy < ch; cy++) {
    const y0 = Math.floor((cy * h) / ch), y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * h) / ch));
    for (let cx = 0; cx < cw; cx++) {
      const x0 = Math.floor((cx * w) / cw), x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * w) / cw));
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y < y1 && y < h; y++) {
        let i = (y * w + x0) * 4;
        for (let x = x0; x < x1 && x < w; x++, i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
      }
      const o = (cy * cw + cx) * 4;
      out[o] = n ? r / n : 0; out[o + 1] = n ? g / n : 0; out[o + 2] = n ? b / n : 0; out[o + 3] = 255;
    }
  }
  return { data: out, width: cw, height: ch };
}

/** Le rectangle (x, y, w, h) d'une image RGBA, copié. */
export function recadrerRgba(img: Rgba, x: number, y: number, w: number, h: number): Rgba {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) {
    const src = ((y + j) * img.width + x) * 4;
    out.set(img.data.subarray(src, src + w * 4), j * w * 4);
  }
  return { data: out, width: w, height: h };
}

/** Les cinq lectures du centre : { c70: [dhash, phash], p85: [...], … }. */
export function variantesDepuisRgba(img: Rgba): Variantes {
  const r = reduireRgba(img, 256);
  const W = r.width, H = r.height, petit = Math.min(W, H), grand = Math.max(W, H);
  const centre = (cw: number, ch: number): Rgba => {
    const w = Math.max(8, Math.min(W, Math.round(cw))), h = Math.max(8, Math.min(H, Math.round(ch)));
    return recadrerRgba(r, Math.floor((W - w) / 2), Math.floor((H - h) / 2), w, h);
  };
  const carre = (cote: number): Rgba => { const c = Math.min(petit, cote); return centre(c, c); };
  const emp = (im: Rgba): [string, string] => [dhashDepuisGris(grisReduit(im, 9, 8)), phashDepuisGris(grisReduit(im, 32, 32))];
  return {
    c70: emp(centre(W * 0.7, H * 0.7)),
    p85: emp(carre(petit * 0.85)),
    g45: emp(carre(grand * 0.45)),
    g60: emp(carre(grand * 0.6)),
    g35: emp(carre(grand * 0.35)),
  };
}
