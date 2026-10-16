// ═══════════════════════════════════════════════════════════════════════════
// BORDEREAUX — TROUVER L'ÉTIQUETTE DANS LA PAGE (bêta, 16/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Fonctions PURES sur une matrice de pixels (1 = encre), testées en Node
// (scripts/bordereau-impression-selftest.mjs). Le rendu de la page (pdf.js)
// vit dans moteur.js ; rien ici ne touche au DOM.
//
// Ce que l'on sait des bordereaux (recherche du 16/10, AUCUN vrai bordereau de
// Nico vu à cette date) : la page est une A4 (portrait, parfois paysage) où
// l'étiquette est UN bloc — moitié haute pleine largeur et couchée (Mondial
// Relay, Vinted Go), quart haut gauche debout (Colissimo, Relais Colis, UPS,
// DPD), moitié droite d'une A4 paysage (Chronopost), ou bloc bas encadré de
// pointillés « coup de ciseaux » — séparé des consignes par du blanc ou une
// ligne de découpe pointillée. D'où la méthode, sans rien supposer du
// transporteur :
//   1. les CODES (barres 1D, codes 2D) servent d'ancre : l'étiquette est le
//      bloc qui les porte ;
//   2. les lignes de découpe POINTILLÉES sont effacées et notées comme
//      séparateurs (une ciseaux posée dessus aussi) ;
//   3. découpe XY par bandes blanches : on descend vers le bloc de l'ancre
//      tant qu'il reste assez grand pour être une étiquette entière (60 ×
//      85 mm au moins) ; un cadre fermé n'est jamais coupé (ses bords
//      traversent toute bande blanche intérieure) ;
//   4. seuils de blanc décroissants (6, 4,5, 3 mm) : le plus grand qui isole
//      un bloc de 62 % de la page au plus l'emporte.
// Les recadrages nommés (moitiés, quarts) restent proposés : la personne
// corrige d'un geste, et le choix est retenu par transporteur (moteur.js).

const ETIQUETTE_MIN_MM = Object.freeze({ petit: 60, grand: 85 });
const PART_MAX_PAGE = 0.62;
const SEUILS_BLANC_MM = Object.freeze([6, 4.5, 3]);

/** La matrice d'encre d'une image RGBA (fond transparent = blanc). */
export function masqueDepuisRGBA(rgba, largeur, hauteur, seuil = 170) {
  const n = largeur * hauteur;
  const m = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = rgba[j + 3];
    const lum = a < 16 ? 255 : (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000;
    m[i] = lum < seuil ? 1 : 0;
  }
  return m;
}

/** La matrice transposée (les colonnes deviennent des lignes). */
export function transposer(m, W, H) {
  const t = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const r = y * W;
    for (let x = 0; x < W; x++) t[x * H + y] = m[r + x];
  }
  return t;
}

/** Image intégrale : somme(x0, y0, x1, y1) en O(1), bornes demi-ouvertes. */
export function integrale(m, W, H) {
  const S = new Int32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let ligne = 0;
    const o = (y + 1) * (W + 1); const p = y * (W + 1); const r = y * W;
    for (let x = 0; x < W; x++) { ligne += m[r + x]; S[o + x + 1] = S[p + x + 1] + ligne; }
  }
  return S;
}
export function somme(S, W, x0, y0, x1, y1) {
  const L = W + 1;
  return S[y1 * L + x1] - S[y0 * L + x1] - S[y1 * L + x0] + S[y0 * L + x0];
}

/** La boîte de l'encre dans une zone {x0, y0, x1, y1} (null si vide). */
export function boiteEncre(S, W, z) {
  let { x0, y0, x1, y1 } = z;
  if (x1 <= x0 || y1 <= y0 || somme(S, W, x0, y0, x1, y1) === 0) return null;
  while (y0 < y1 && somme(S, W, x0, y0, x1, y0 + 1) === 0) y0++;
  while (y1 > y0 && somme(S, W, x0, y1 - 1, x1, y1) === 0) y1--;
  while (x0 < x1 && somme(S, W, x0, y0, x0 + 1, y1) === 0) x0++;
  while (x1 > x0 && somme(S, W, x1 - 1, y0, x1, y1) === 0) x1--;
  return { x0, y0, x1, y1 };
}

// ── 1. Les lignes de découpe pointillées ───────────────────────────────────
// Une RANGÉE de tirets (≥ 8 tirets de 0,4 à 8 mm, espacés de 0,4 à 6 mm, sur
// 35 mm au moins), épaisse de 1,2 mm au plus, avec du blanc juste au-dessus et
// juste au-dessous (15 % d'encre tolérés : les ciseaux, « découpez ici »).
// Une ligne de texte a aussi des « tirets » (les jambages), mais jamais de
// blanc au ras du dessus et du dessous : elle n'est pas prise.
function chainesDeTirets(m, W, y, pxParMm) {
  const r = y * W;
  const tMin = 0.4 * pxParMm; const tMax = 8 * pxParMm;
  const eMin = 0.4 * pxParMm; const eMax = 6 * pxParMm;
  const chaines = [];
  let ch = null; let x = 0;
  while (x < W) {
    if (!m[r + x]) { x++; continue; }
    let x1 = x; while (x1 < W && m[r + x1]) x1++;
    const long = x1 - x;
    if (long >= tMin && long <= tMax) {
      if (ch && x - ch.fin >= eMin && x - ch.fin <= eMax) { ch.fin = x1; ch.n++; }
      else { if (ch) chaines.push(ch); ch = { debut: x, fin: x1, n: 1 }; }
    } else { if (ch) chaines.push(ch); ch = null; }
    x = x1;
  }
  if (ch) chaines.push(ch);
  return chaines.filter((c) => c.n >= 8 && c.fin - c.debut >= 35 * pxParMm);
}

export function lignesPointilleesHorizontales(m, W, H, pxParMm) {
  const epMax = Math.max(2, Math.round(1.2 * pxParMm));
  const garde = Math.max(2, Math.round(0.8 * pxParMm));
  const ouvertes = []; const bandes = [];
  for (let y = 0; y < H; y++) {
    const ch = chainesDeTirets(m, W, y, pxParMm);
    for (const c of ch) {
      const b = ouvertes.find((o) => o.y1 === y && Math.min(o.x1, c.fin) - Math.max(o.x0, c.debut) >= 0.6 * Math.min(o.x1 - o.x0, c.fin - c.debut));
      if (b) { b.y1 = y + 1; b.x0 = Math.min(b.x0, c.debut); b.x1 = Math.max(b.x1, c.fin); }
      else ouvertes.push({ y0: y, y1: y + 1, x0: c.debut, x1: c.fin });
    }
    for (let i = ouvertes.length - 1; i >= 0; i--) if (ouvertes[i].y1 < y + 1) bandes.push(ouvertes.splice(i, 1)[0]);
  }
  bandes.push(...ouvertes);
  const encreRangee = (y, x0, x1) => { let s = 0; const r = y * W; for (let x = x0; x < x1; x++) s += m[r + x]; return s; };
  return bandes.filter((b) => {
    if (b.y1 - b.y0 > epMax) return false;
    const span = b.x1 - b.x0;
    for (let k = 1; k <= garde; k++) {
      if (b.y0 - k >= 0 && encreRangee(b.y0 - k, b.x0, b.x1) > 0.15 * span) return false;
      if (b.y1 - 1 + k < H && encreRangee(b.y1 - 1 + k, b.x0, b.x1) > 0.15 * span) return false;
    }
    return true;
  });
}

// Un FILET plein qui sépare l'étiquette des consignes : un trait fin (≤ 1 mm)
// sur 60 % de la largeur de la page au moins, du blanc juste au-dessus et
// au-dessous, et des bouts LIBRES — le bord d'un cadre, lui, tient à ses
// montants (rien n'est pris dans un cadre).
export function filetsHorizontaux(m, W, H, pxParMm) {
  const epMax = Math.max(2, Math.round(1 * pxParMm));
  const garde = Math.max(2, Math.round(0.8 * pxParMm));
  const bout = Math.round(2 * pxParMm);
  const bandes = []; let ouverte = null;
  for (let y = 0; y < H; y++) {
    const r = y * W; let meilleur = null; let x = 0;
    while (x < W) {
      if (!m[r + x]) { x++; continue; }
      let x1 = x; while (x1 < W && m[r + x1]) x1++;
      if (!meilleur || x1 - x > meilleur.x1 - meilleur.x0) meilleur = { x0: x, x1 };
      x = x1;
    }
    const long = meilleur && meilleur.x1 - meilleur.x0 >= 0.6 * W;
    if (long && ouverte && Math.abs(meilleur.x0 - ouverte.x0) <= garde && Math.abs(meilleur.x1 - ouverte.x1) <= garde) { ouverte.y1 = y + 1; continue; }
    if (ouverte) { bandes.push(ouverte); ouverte = null; }
    if (long) ouverte = { y0: y, y1: y + 1, x0: meilleur.x0, x1: meilleur.x1 };
  }
  if (ouverte) bandes.push(ouverte);
  const encre = (x0, y0, x1, y1) => { let s = 0; for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) s += m[y * W + x]; return s; };
  return bandes.filter((b) => {
    if (b.y1 - b.y0 > epMax) return false;
    const span = b.x1 - b.x0;
    if (encre(b.x0, b.y0 - garde, b.x1, b.y0) > 0.02 * span * garde) return false;
    if (encre(b.x0, b.y1, b.x1, b.y1 + garde) > 0.02 * span * garde) return false;
    // Bouts libres : aucun montant au-dessus ni au-dessous des extrémités.
    for (const bx of [b.x0, b.x1 - 1]) {
      if (encre(bx - garde, b.y0 - bout, bx + garde + 1, b.y0) > 0) return false;
      if (encre(bx - garde, b.y1, bx + garde + 1, b.y1 + bout) > 0) return false;
    }
    return true;
  });
}

/** Efface les bandes pointillées et les petits objets posés dessus (ciseaux). */
function effacerBandes(m, W, H, bandes, pxParMm) {
  if (!bandes.length) return;
  const tailleMax = 12 * pxParMm;
  const marge = Math.round(2 * pxParMm);
  // 1 = vu dans une composante TROP GRANDE (jamais effacée, jamais refouillée).
  const grand = new Uint8Array(W * H);
  const marque = new Uint8Array(W * H);
  const voisins = [1, -1, W, -W];
  for (const b of bandes) {
    for (let y = b.y0; y < b.y1; y++) m.fill(0, y * W + b.x0, y * W + b.x1);
    const zx0 = Math.max(0, b.x0 - marge); const zx1 = Math.min(W, b.x1 + marge);
    const zy0 = Math.max(0, b.y0 - marge); const zy1 = Math.min(H, b.y1 + marge);
    for (let y = zy0; y < zy1; y++) {
      for (let x = zx0; x < zx1; x++) {
        const depart = y * W + x;
        if (!m[depart] || grand[depart]) continue;
        // Composante connexe bornée : effacée seulement si elle est petite.
        const pile = [depart]; const vus = [depart]; marque[depart] = 1;
        let bx0 = x; let bx1 = x; let by0 = y; let by1 = y; let trop = false;
        while (pile.length && !trop) {
          const i = pile.pop(); const px = i % W;
          for (const d of voisins) {
            const j = i + d;
            if (j < 0 || j >= W * H) continue;
            const jx = j % W;
            if ((d === 1 && jx === 0) || (d === -1 && px === 0)) continue; // pas de saut de ligne
            if (!m[j] || marque[j]) continue;
            if (grand[j]) { trop = true; break; } // touche une grande composante déjà vue
            marque[j] = 1; vus.push(j); pile.push(j);
            const jy = (j - jx) / W;
            if (jx < bx0) bx0 = jx; if (jx > bx1) bx1 = jx; if (jy < by0) by0 = jy; if (jy > by1) by1 = jy;
            if (bx1 - bx0 > tailleMax || by1 - by0 > tailleMax) { trop = true; break; }
          }
        }
        if (trop) { for (const j of vus) { grand[j] = 1; marque[j] = 0; } }
        else { for (const j of vus) { m[j] = 0; marque[j] = 0; } }
      }
    }
  }
}

// ── 2. Les codes (ancres) ──────────────────────────────────────────────────
// Code-barres 1D : des barres verticales hautes (≥ 5 mm) et serrées — au
// moins 10 barres fines (≤ 2 mm) espacées de 2,2 mm au plus, sur 8 mm au
// moins. Le texte (jambages < 5 mm) et un titre en gros caractères (fûts
// espacés) n'y passent pas. Cherché aussi couché (matrice transposée).
function codesBarres1D(m, W, H, pxParMm) {
  const Lmin = Math.round(5 * pxParMm);
  const V = new Uint8Array(W * H);
  for (let x = 0; x < W; x++) {
    let y = 0;
    while (y < H) {
      if (!m[y * W + x]) { y++; continue; }
      let y1 = y; while (y1 < H && m[y1 * W + x]) y1++;
      if (y1 - y >= Lmin) for (let k = y; k < y1; k++) V[k * W + x] = 1;
      y = y1;
    }
  }
  const dMax = 2.2 * pxParMm; const largMax = 2 * pxParMm; const largMin = 8 * pxParMm;
  const boites = []; const ouvertes = [];
  for (let y = 0; y < H; y++) {
    const r = y * W; const segs = [];
    let seg = null; let x = 0;
    while (x < W) {
      if (!V[r + x]) { x++; continue; }
      let x1 = x; while (x1 < W && V[r + x1]) x1++;
      if (x1 - x <= largMax) {
        if (seg && x - seg.fin <= dMax) { seg.fin = x1; seg.n++; }
        else { if (seg) segs.push(seg); seg = { debut: x, fin: x1, n: 1 }; }
      } else { if (seg) segs.push(seg); seg = null; }
      x = x1;
    }
    if (seg) segs.push(seg);
    for (const s of segs) {
      if (s.n < 10 || s.fin - s.debut < largMin) continue;
      const o = ouvertes.find((b) => b.y1 >= y - 1 && Math.min(b.x1, s.fin) > Math.max(b.x0, s.debut));
      if (o) { o.y1 = y + 1; o.x0 = Math.min(o.x0, s.debut); o.x1 = Math.max(o.x1, s.fin); o.barres = Math.max(o.barres, s.n); }
      else ouvertes.push({ x0: s.debut, x1: s.fin, y0: y, y1: y + 1, barres: s.n });
    }
    for (let i = ouvertes.length - 1; i >= 0; i--) if (ouvertes[i].y1 < y - 1) boites.push(ouvertes.splice(i, 1)[0]);
  }
  boites.push(...ouvertes);
  return boites.filter((b) => b.y1 - b.y0 >= Lmin * 0.9).map((b) => ({ ...b, genre: 'barres', force: b.barres * (b.x1 - b.x0) * (b.y1 - b.y0) }));
}

// Code 2D (QR, DataMatrix, Aztec) : un carré de 10 mm au moins, à moitié
// encré, où la couleur change souvent dans les deux sens. Le texte est trop
// clair (≈ 15 % d'encre) ; un aplat noir ne change jamais de couleur.
function codes2D(m, W, H, pxParMm) {
  const c = Math.max(4, Math.round(1.5 * pxParMm));
  const nx = Math.floor(W / c); const ny = Math.floor(H / c);
  if (!nx || !ny) return [];
  const tau = 0.3 / pxParMm; // ≥ 0,3 changement par mm
  const cellule = new Uint8Array(nx * ny);
  for (let cy = 0; cy < ny; cy++) {
    for (let cx = 0; cx < nx; cx++) {
      let encre = 0; let th = 0; let tv = 0;
      for (let y = cy * c; y < cy * c + c; y++) {
        const r = y * W;
        for (let x = cx * c; x < cx * c + c; x++) {
          const v = m[r + x];
          encre += v;
          if (x > cx * c && v !== m[r + x - 1]) th++;
          if (y > cy * c && v !== m[r - W + x]) tv++;
        }
      }
      const s = c * c;
      const d = encre / s;
      if (d >= 0.25 && d <= 0.75 && th / s >= tau && tv / s >= tau) cellule[cy * nx + cx] = 1;
    }
  }
  // Grappes de cellules voisines (8-connexité).
  const vus = new Uint8Array(nx * ny); const out = [];
  for (let i = 0; i < nx * ny; i++) {
    if (!cellule[i] || vus[i]) continue;
    const pile = [i]; vus[i] = 1;
    let gx0 = nx; let gx1 = -1; let gy0 = ny; let gy1 = -1; let n = 0;
    while (pile.length) {
      const k = pile.pop(); const kx = k % nx; const ky = (k - kx) / nx; n++;
      if (kx < gx0) gx0 = kx; if (kx > gx1) gx1 = kx; if (ky < gy0) gy0 = ky; if (ky > gy1) gy1 = ky;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const ax = kx + dx; const ay = ky + dy;
        if (ax < 0 || ay < 0 || ax >= nx || ay >= ny) continue;
        const j = ay * nx + ax;
        if (cellule[j] && !vus[j]) { vus[j] = 1; pile.push(j); }
      }
    }
    const l = (gx1 - gx0 + 1) * c; const h = (gy1 - gy0 + 1) * c;
    const remplissage = n / ((gx1 - gx0 + 1) * (gy1 - gy0 + 1));
    const rapport = l / h;
    if (l >= 10 * pxParMm && h >= 10 * pxParMm && rapport >= 0.6 && rapport <= 1.65 && remplissage >= 0.55) {
      out.push({ x0: gx0 * c, y0: gy0 * c, x1: (gx1 + 1) * c, y1: (gy1 + 1) * c, genre: '2d', force: n * c * c * 0.5 });
    }
  }
  return out;
}

/** Tous les codes de la page, les plus forts d'abord (les barres 1D avant les 2D). */
export function detecterCodes(m, W, H, pxParMm, mT = null) {
  const debout = codesBarres1D(m, W, H, pxParMm);
  const t = mT ?? transposer(m, W, H);
  const couches = codesBarres1D(t, H, W, pxParMm).map((b) => ({ x0: b.y0, y0: b.x0, x1: b.y1, y1: b.x1, genre: 'barres', couche: true, force: b.force, barres: b.barres }));
  const d2 = codes2D(m, W, H, pxParMm);
  // Un même code vu debout ET couché (rare) n'est gardé qu'une fois.
  const tous = [...debout, ...couches].filter((b, i, arr) => !arr.slice(0, i).some((a) => recouvrement(a, b) > 0.6));
  return [...tous.sort((a, b) => b.force - a.force), ...d2.sort((a, b) => b.force - a.force)];
}

function recouvrement(a, b) {
  const l = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (l <= 0 || h <= 0) return 0;
  const aire = (z) => (z.x1 - z.x0) * (z.y1 - z.y0);
  return (l * h) / Math.min(aire(a), aire(b));
}

// ── 3. La découpe XY ───────────────────────────────────────────────────────
function plagesBlanches(profil, deb, fin) {
  const out = []; let i = deb;
  while (i < fin) {
    if (profil(i) !== 0) { i++; continue; }
    let j = i; while (j < fin && profil(j) === 0) j++;
    out.push([i, j]); i = j;
  }
  return out;
}

/**
 * Les façons de couper un bloc en DEUX le long d'une bande blanche, la plus
 * large d'abord (une ligne de découpe pointillée passe avant tout blanc).
 * Couper au plus large d'abord garde ensemble les morceaux d'une étiquette
 * sans cadre (blancs intérieurs étroits) et la sépare des consignes (blanc
 * large) ; descendre() essaie la suivante si la première coupe l'étiquette.
 */
function coupures(ctx, z, gMinPx) {
  const { S, W, sepH, sepV, pxParMm } = ctx;
  const sepMin = 1 * pxParMm;
  const lignes = plagesBlanches((y) => somme(S, W, z.x0, y, z.x1, y + 1), z.y0, z.y1);
  const colonnes = plagesBlanches((x) => somme(S, W, x, z.y0, x + 1, z.y1), z.x0, z.x1);
  const separeH = ([a, b]) => sepH.some((s) => s.y0 >= a - 1 && s.y1 <= b + 1 && Math.min(s.x1, z.x1) - Math.max(s.x0, z.x0) >= 0.7 * (z.x1 - z.x0));
  const separeV = ([a, b]) => sepV.some((s) => s.x0 >= a - 1 && s.x1 <= b + 1 && Math.min(s.y1, z.y1) - Math.max(s.y0, z.y0) >= 0.7 * (z.y1 - z.y0));
  const candidates = [];
  const examiner = (plages, separe, parLignes) => {
    for (const p of plages) {
      const large = p[1] - p[0];
      const sep = separe(p);
      if (large < gMinPx && !(sep && large >= sepMin)) continue;
      candidates.push({ p, poids: large + (sep ? 1e6 : 0), parLignes });
    }
  };
  examiner(lignes, separeH, true);
  examiner(colonnes, separeV, false);
  candidates.sort((u, v) => v.poids - u.poids);
  const out = [];
  for (const c of candidates) {
    const [a, b] = c.p;
    const morceaux = c.parLignes
      ? [{ x0: z.x0, x1: z.x1, y0: z.y0, y1: a }, { x0: z.x0, x1: z.x1, y0: b, y1: z.y1 }]
      : [{ x0: z.x0, x1: a, y0: z.y0, y1: z.y1 }, { x0: b, x1: z.x1, y0: z.y0, y1: z.y1 }];
    const enfants = morceaux.map((mz) => boiteEncre(S, W, mz)).filter(Boolean);
    if (enfants.length === 2) out.push(enfants);
  }
  return out;
}

const aireZ = (z) => Math.max(0, z.x1 - z.x0) * Math.max(0, z.y1 - z.y0);
function partDe(z, a) {
  const l = Math.min(z.x1, a.x1) - Math.max(z.x0, a.x0);
  const h = Math.min(z.y1, a.y1) - Math.max(z.y0, a.y0);
  return l > 0 && h > 0 ? (l * h) / aireZ(a) : 0;
}

function assezGrand(z, pxParMm) {
  const l = (z.x1 - z.x0) / pxParMm; const h = (z.y1 - z.y0) / pxParMm;
  return Math.min(l, h) >= ETIQUETTE_MIN_MM.petit && Math.max(l, h) >= ETIQUETTE_MIN_MM.grand;
}

function descendre(ctx, racine, ancres, gMinPx) {
  let n = racine; const chemin = [n];
  // Le bloc qui porte le plus de surface de codes (l'ancre principale d'abord) ;
  // sans code, le plus encré.
  const score = ancres.length
    ? (e) => ancres.reduce((s, a, i) => s + partDe(e, a) * aireZ(a) * (i === 0 ? 4 : 1), 0)
    : (e) => somme(ctx.S, ctx.W, e.x0, e.y0, e.x1, e.y1);
  for (let tour = 0; tour < 16; tour++) {
    let suivant = null;
    for (const enfants of coupures(ctx, n, gMinPx)) {
      const [a, b] = enfants;
      const sa = score(a); const sb = score(b);
      if (sa === sb) continue; // rien ne départage : cette coupe ne dit rien
      const choisi = sa > sb ? a : b;
      if (assezGrand(choisi, ctx.pxParMm)) { suivant = choisi; break; }
    }
    if (!suivant) break;
    n = suivant; chemin.push(n);
  }
  return { noeud: n, chemin };
}

// ── 4. L'analyse d'une page ────────────────────────────────────────────────
/**
 * Analyse une page rendue. `masque` : 1 = encre (masqueDepuisRGBA). Rend, en
 * PIXELS (origine en haut à gauche) :
 *   auto        : {x, y, l, h} — l'étiquette trouvée (marge de 1 mm comprise) ;
 *   confiance   : 'haute' | 'moyenne' | 'basse' ;
 *   raison      : 'code_barres' | 'code_2d' | 'bloc' | 'page' | 'vide' ;
 *   codes       : les ancres trouvées ;
 *   recadrages  : {page, haut, bas, …} — chaque recadrage nommé, resserré sur
 *                 son encre (marge de 1 mm).
 */
export function analyserPage({ masque, largeur: W, hauteur: H, pxParMm }, recadragesNommes = null) {
  // Copie de travail : les lignes de découpe (pointillés, filets libres) y sont
  // effacées et notées comme séparateurs ; la matrice d'origine n'est pas touchée.
  const m = new Uint8Array(masque);
  const effacerFilets = (mat, larg, bandes) => { for (const b of bandes) for (let y = b.y0; y < b.y1; y++) mat.fill(0, y * larg + b.x0, y * larg + b.x1); };
  const pointH = lignesPointilleesHorizontales(m, W, H, pxParMm);
  effacerBandes(m, W, H, pointH, pxParMm);
  let mT = transposer(m, W, H);
  const pointVT = lignesPointilleesHorizontales(mT, H, W, pxParMm);
  effacerBandes(mT, H, W, pointVT, pxParMm);
  if (pointVT.length) m.set(transposer(mT, H, W));
  const filH = filetsHorizontaux(m, W, H, pxParMm);
  effacerFilets(m, W, filH);
  mT = transposer(m, W, H);
  const filVT = filetsHorizontaux(mT, H, W, pxParMm);
  effacerFilets(mT, H, filVT);
  if (filVT.length) m.set(transposer(mT, H, W));
  const sepH = [...pointH, ...filH];
  const sepV = [...pointVT, ...filVT].map((b) => ({ x0: b.y0, x1: b.y1, y0: b.x0, y1: b.x1 }));
  const S = integrale(m, W, H);
  const ctx = { S, W, H, sepH, sepV, pxParMm };
  const marge = Math.round(1 * pxParMm);
  const elargir = (z) => ({ x: Math.max(0, z.x0 - marge), y: Math.max(0, z.y0 - marge), l: Math.min(W, z.x1 + marge) - Math.max(0, z.x0 - marge), h: Math.min(H, z.y1 + marge) - Math.max(0, z.y0 - marge) });

  const recadrages = {};
  for (const [nom, f] of Object.entries(recadragesNommes ?? {})) {
    const zone = { x0: Math.round(f.x * W), y0: Math.round(f.y * H), x1: Math.round((f.x + f.l) * W), y1: Math.round((f.y + f.h) * H) };
    const t = boiteEncre(S, W, zone);
    recadrages[nom] = t ? elargir(t) : { x: zone.x0, y: zone.y0, l: zone.x1 - zone.x0, h: zone.y1 - zone.y0 };
  }

  const racine = boiteEncre(S, W, { x0: 0, y0: 0, x1: W, y1: H });
  const pagePx = { x: 0, y: 0, l: W, h: H };
  if (!racine) return { auto: pagePx, confiance: 'basse', raison: 'vide', codes: [], recadrages, separateurs: { horizontaux: sepH.length, verticaux: sepV.length } };

  const codes = detecterCodes(m, W, H, pxParMm, mT);
  const barres = codes.filter((c) => c.genre === 'barres');
  const ancres = barres.length ? barres : codes;
  const aireRacine = W * H;
  let retenu = null;
  for (const mm of SEUILS_BLANC_MM) {
    const r = descendre(ctx, racine, ancres, mm * pxParMm);
    if (!retenu) retenu = r; // repli : le seuil le plus large (le moins fragmenté)
    if (aireZ(r.noeud) <= PART_MAX_PAGE * aireRacine) { retenu = r; break; }
  }
  const z = retenu.noeud;
  const entier = aireZ(z) >= 0.9 * aireZ(racine);
  const l = (z.x1 - z.x0) / pxParMm; const h = (z.y1 - z.y0) / pxParMm;
  const rapport = Math.min(l, h) / Math.max(l, h);
  const raison = entier ? 'page' : (barres.length ? 'code_barres' : codes.length ? 'code_2d' : 'bloc');
  let confiance = 'basse';
  if (!entier && barres.length && rapport >= 0.45 && rapport <= 0.95) confiance = 'haute';
  else if (!entier && (barres.length || codes.length)) confiance = 'moyenne';
  return { auto: elargir(z), confiance, raison, codes, recadrages, separateurs: { horizontaux: sepH.length, verticaux: sepV.length } };
}
