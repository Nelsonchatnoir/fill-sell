// ═══════════════════════════════════════════════════════════════════════════
// UNE PHOTO SUFFIT POUR PUBLIER, À L'UNITÉ COMME PAR LOT (11/11/2026, décisions de Nico — point T1)
//     npm run selftest:une-photo-suffit
// ═══════════════════════════════════════════════════════════════════════════
// Le cas : un compte de plusieurs milliers d'articles importés d'eBay, la plupart à une seule photo. À l'unité, le
// bouton de « Où publier ? » restait gris « Ajoute au moins 3 photos » (règle du 14/07, commit b1a6395 : 3 photos
// exigées à la source tant qu'aucun texte n'était rédigé), quelle que soit la plateforme cochée. Aucune plateforme
// n'exige 3 photos : Leboncoin, Beebs, eBay et Depop en acceptent une ; Vinted aussi, sauf certains articles haut de
// gamme — Vinted ne dit pas lesquels, l'extension complète donc toute annonce Vinted à 3 en recopiant la dernière
// photo. Le lot, lui, laissait déjà passer une seule photo.
// LA RÈGLE, la même à l'unité et dans le lot :
//   · une photo suffit ; seul « 0 photo » bloque, et il bloque TOUJOURS (texte déjà rédigé ou non) — pour les 5
//     plateformes, que l'article vienne d'un import ou d'une photo prise au téléphone ;
//   · les « vraies photos » d'un article = ses photos moins les images par défaut CONNUES d'une plateforme, dans leur
//     ordre. Aucune vraie photo = « 0 photo » = bloqué (unité : bouton gris et une phrase ; lot : « Sans photo »). Au
//     moins une vraie photo : l'article part avec ses vraies photos SEULEMENT — l'image par défaut n'est jamais
//     envoyée, qu'elle soit en 1re, 2e ou dernière position ;
//   · (choix b de Nico, 11/11 vers 14:50) seule une image de la LISTE FERMÉE (src/publication/lot/imagesParDefaut.js),
//     reconnue À L'IDENTIQUE (adresse exacte, ou octets exacts : taille puis SHA-256), est retirée — zéro faux
//     positif. L'estimation (≤ 256 px et ≤ 40 couleurs) ne retire plus rien : elle SIGNALE un cas douteux. Une petite
//     photo noir et blanc réelle reste dans l'annonce. Une image non lue, illisible ou lue trop tard est gardée ;
//   · un article SANS image par défaut connue part exactement comme avant (même liste, même ordre, mêmes adresses) ;
//   · les marques d'un retrait (photos_choisies, lbcPhotosCapped, photosRemplissageRetirees) ne valent que pour LA
//     tâche où il a eu lieu : jamais sur la carte, jamais dans la publication suivante.
// Ce qui est EXÉCUTÉ ou RENDU (code livré, jamais recopié) :
//   A. la règle pure et le compte des photos (src/utils/photos.js) ;
//   A bis. la liste fermée (imagesParDefaut.js, avec les VRAIS octets de l'image par défaut de Beebs :
//      scripts/fixtures/image-par-defaut-beebs.jpg) et la lecture (photoVide.js) avec un réseau, une image et un
//      canevas factices : la reconnaissance exacte, l'estimation qui signale, la borne, la file qui se libère, la
//      mémoire de la session, le délai dépassé, la relecture d'un « null », le CORPS de la lecture d'une liste
//      (suivreLectures : la cascade, le redessin) et la lecture au clic (reconnaitreAuClic) ;
//   B. le VRAI bouton de « Où publier ? » : la coque réelle (StepperNouveau, avec EcranOuPublier et GaleriePhotos)
//      rendue côté serveur (Vite SSR, comme cout-publication) — 1 photo : actif ; 2 : actif ; 0 : gris ;
//   C. les textes rendus (galerie, écran) ;
//   E. les garde-fous : la règle du lot, sa vignette rendue, l'attente de lecture de l'annonce d'origine après un
//      import (_shared/contenu-fiche.js), la recopie de la photo par l'extension pour Vinted ;
//   F. la liste des photos écrite dans la tâche (reconnaitreAuClic puis construireJobs — l'unité comme le lot) ;
//   G. les marques d'un retrait, d'une publication à la suivante (construireJobs, sansMarquesDuRetrait).
// Ce qui n'est que LU dans le source — le moteur (ListingPreviewScreen) n'est pas monté, la coque rendue reçoit un
// moteur factice à sa forme : ce que le moteur tend à la coque, ses gestes (handleNextNouveau, handleNext,
// handleUpload, handlePublish), l'ancienne peau du stepper (D) et le refus du serveur (source du dépôt).
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extraireFonctionJs } from './lib/extraire-fonction-js.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 600)}` : ''}`); }
};
const ESP = new RegExp(`[${String.fromCharCode(0xa0)}${String.fromCharCode(0x202f)}]`, 'g');
const texte = (html) => String(html).replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(ESP, ' ').replace(/\s+/g, ' ').replace(/ ([,.])/g, '$1').trim();
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const essai = (f) => { try { return f(); } catch (e) { return { erreur: String(e?.message ?? e) }; } };
const essaiAsync = async (f) => { try { return await f(); } catch (e) { return { erreur: String(e?.message ?? e) }; } };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
// Attendre une CONDITION, bornée (une machine chargée ne fait pas rougir le verrou) ; rend la condition à la fin. Un court
// délai fixe ne sert plus qu'aux assertions « rien ne doit arriver ».
const jusqua = async (condition, maxMs = 1000) => {
  const fin = Date.now() + maxMs;
  while (Date.now() < fin) { if (condition()) return true; await pause(5); }
  return Boolean(condition());
};

const CINQ = ['vinted', 'leboncoin', 'beebs', 'ebay', 'depop'];
const NOMS = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', ebay: 'eBay', depop: 'Depop' };
// Le seul libellé du bouton quand la photo manque — le même dans tous les cas.
const LIBELLE_PHOTO = { fr: 'Ajoute au moins 1 photo', en: 'Add at least 1 photo' };
// La seule phrase neuve : sur « Où publier ? », quand les seules photos sont des images par défaut connues.
const PHRASE_VRAIE_PHOTO = { fr: 'Ajoute une vraie photo de ton article pour le publier.', en: 'Add a real photo of your item to publish it.' };
// Un nombre de photos comparé à un chiffre, quel que soit l'opérateur : la règle ne s'écrit qu'en un endroit.
const COMPTE_COMPARE = /(?:photoCount|photos\.length|pickedFiles\.length|pickedPreviews\.length|displayPreviews\.length)\s*(?:<=?|>=?|={2,3}|!==?)\s*\d/;
const noop = () => {};

// ── Le réseau, les images et le canevas factices : ce qu'un navigateur lirait de chaque adresse ───────────────────
// L'image par défaut de Beebs, ses VRAIS octets (relevés le 11/11/2026 sur le CDN de Beebs et sur sa copie chez nous).
const OCTETS_DEFAUT = new Uint8Array(fs.readFileSync(join(ROOT, 'scripts/fixtures/image-par-defaut-beebs.jpg')));
const STO = (chemin) => `https://x.supabase.co/storage/v1/object/public/listing-photos/u/${chemin}`;
const BEEBS = 'https://cdn.beebs.app/7c49fc10-d3ac-40cc-8042-90523132ad74.jpg';   // l'adresse exacte, chez Beebs
const VIDE = STO('rapatrie-fiche/101/1700000000000_0.jpg');                     // sa copie chez nous (octets identiques)
const VIDE2 = STO('rehosted/102/1793509204000_morte_0.jpg');                      // une autre copie
const P_ = (nom) => STO(`rapatrie-fiche/103/${nom}.jpg`);
const A1 = P_('a'), B1 = P_('b'), C1 = P_('c'), D1 = P_('d');
// Une VRAIE petite photo noir et blanc (120 × 90, niveaux de gris : 12 couleurs) — et, pour forcer le hachage, de la
// MÊME taille en octets que l'image par défaut : l'estimation la juge douteuse, l'empreinte ne la reconnaît pas.
const PETITE_NB = P_('vraie-petite-noir-et-blanc');
const PETITE = P_('vraie-petite'), GRANDE = P_('vraie-grande'), ILLISIBLE = P_('illisible'), LENTE = P_('lente');
const INTERMITTENTE = P_('intermittente'), SANS_LONGUEUR = P_('sans-longueur'), ABSENTE = P_('absente');
// Une vraie photo de 5 000 octets : plus grande que l'image par défaut, mais sous le double de sa taille ; une de
// 2 000 octets : PLUS PETITE que l'image par défaut ; une réponse d'erreur (500) qui porte un corps.
const MOYENNE = P_('vraie-moyenne'), MINUSCULE = P_('vraie-minuscule'), ERREUR_500 = P_('erreur-500');
const autres = (n, graine) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + graine) & 255);
const GROSSE = { taille: 250_000 };
const SERVEUR = new Map([
  [VIDE, { octets: OCTETS_DEFAUT }], [VIDE2, { octets: OCTETS_DEFAUT }], [BEEBS, { cdnSansCors: true }],
  [PETITE_NB, { octets: autres(OCTETS_DEFAUT.length, 7) }], [PETITE, { octets: autres(9_000, 3) }], [MOYENNE, { octets: autres(5_000, 11) }],
  [GRANDE, GROSSE], [A1, GROSSE], [B1, GROSSE], [C1, GROSSE], [D1, GROSSE],
  [ILLISIBLE, { erreur: true }], [LENTE, { lente: true }], [INTERMITTENTE, { octets: OCTETS_DEFAUT, echecs: 1 }],
  [SANS_LONGUEUR, { octets: autres(50_000, 5), sansLongueur: true }], [ABSENTE, { statut: 404 }],
  [MINUSCULE, { octets: autres(2_000, 13) }], [ERREUR_500, { statut: 500, octets: autres(40_000, 17) }],
  ...Array.from({ length: 13 }, (_, i) => [P_(`file-${i}`), { taille: 90_000 }]),
]);
// `coupees` : les requêtes dont le signal a été levé (avant ou APRÈS la réponse : le corps n'est plus téléchargé).
const reseau = { appels: [], enVol: 0, maxEnVol: 0, octetsLus: new Map(), coupees: new Set() };
globalThis.fetch = (url, { signal } = {}) => {
  reseau.appels.push(url);
  reseau.enVol++; reseau.maxEnVol = Math.max(reseau.maxEnVol, reseau.enVol);
  let fini = false;
  const finir = () => { if (!fini) { fini = true; reseau.enVol--; } };
  return new Promise((resolve, reject) => {
    const d = SERVEUR.get(url);
    const abandon = () => { reseau.coupees.add(url); finir(); reject(new DOMException('abandon', 'AbortError')); };
    if (signal?.aborted) { abandon(); return; }
    signal?.addEventListener('abort', abandon, { once: true });
    setTimeout(() => {
      if (fini) return;
      if (!d || d.erreur || d.cdnSansCors || (d.echecs && d.echecs-- > 0)) { finir(); reject(new TypeError('Failed to fetch')); return; }
      if (d.lente) return;   // ne répond jamais : seul le signal l'arrête
      if (d.statut && !d.octets) { finir(); resolve(new Response(null, { status: d.statut })); return; }
      const n = d.octets ? d.octets.length : d.taille;
      let i = 0;
      reseau.octetsLus.set(url, 0);
      const flux = new ReadableStream({
        pull(c) {
          if (i >= n) { c.close(); return; }
          const m = d.octets ? d.octets.subarray(i, i + 1024) : new Uint8Array(Math.min(1024, n - i)).fill(9);
          i += m.length; reseau.octetsLus.set(url, i);
          c.enqueue(m);
        },
      }, { highWaterMark: 0 });
      finir();
      resolve(new Response(flux, { status: d.statut ?? 200, headers: d.sansLongueur ? {} : { 'content-length': String(n) } }));
    }, 3);
  });
};
// Les images (l'estimation) : `couleurs` = couleurs distinctes de la vignette 48 × 48.
const IMAGES = new Map([
  [VIDE, { l: 200, h: 200, couleurs: 30 }], [VIDE2, { l: 200, h: 200, couleurs: 30 }],
  [PETITE_NB, { l: 120, h: 90, couleurs: 12, gris: true }], [PETITE, { l: 140, h: 70, couleurs: 67 }], [GRANDE, { l: 1600, h: 1200, couleurs: 5 }],
  ...[A1, B1, C1, D1].map((u) => [u, { l: 1600, h: 1200, couleurs: 300 }]),
]);
// `arretees` : les images dont le chargement a été arrêté (src vidée) ; une image `lente` ne finit jamais de charger.
const image = { chargements: [], canevas: 0, arretees: [] };
class FausseImage {
  set src(u) {
    if (u === '') { image.arretees.push(this.adresseDemandee); return; }
    image.chargements.push(u);
    this.adresseDemandee = u;
    const d = IMAGES.get(u);
    if (d?.lente) return;
    setTimeout(() => {
      if (!d) { this.onerror?.(); return; }
      this.naturalWidth = d.l; this.naturalHeight = d.h; this.adresse = u;
      this.onload?.();
    }, 2);
  }
}
// `gris` : des niveaux de gris (rouge = vert = bleu), comme une photo noir et blanc.
const pixels = (n, gris = false) => {
  const d = new Uint8ClampedArray(48 * 48 * 4);
  for (let i = 0; i < 48 * 48; i++) {
    const c = n ? i % n : 0;
    if (gris) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = (c & 15) << 4; }
    else { d[i * 4] = (c & 15) << 4; d[i * 4 + 1] = ((c >> 4) & 15) << 4; d[i * 4 + 2] = ((c >> 8) & 15) << 4; }
    d[i * 4 + 3] = 255;
  }
  return d;
};
globalThis.Image = FausseImage;
globalThis.document ??= { body: {} };
globalThis.document.createElement = (balise) => {
  if (balise !== 'canvas') throw new Error(`élément inattendu : ${balise}`);
  image.canevas++;
  let dessinee = null;
  return { width: 0, height: 0, getContext: () => ({ drawImage: (img) => { dessinee = img.adresse; }, getImageData: () => ({ data: pixels(IMAGES.get(dessinee)?.couleurs ?? 0, IMAGES.get(dessinee)?.gris) }) }) };
};

// ── Un React MINIMAL, pour MONTER le crochet et la vignette du lot, effets compris (section H) ───────────────────
// react-dom/server ne lance aucun effet : sans ceci, un crochet qui ne lirait plus rien passerait inaperçu. Rendus,
// états, mémos, effets (avec leurs dépendances), nouveau rendu sur changement d'état, démontage (nettoyages).
const REACT_MINIMAL = `
let courant = null;
const memes = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
export const Fragment = Symbol.for('react-minimal.fragment');
export function jsx(type, props) { return { type, props: props ?? {} }; }
export const jsxs = jsx, jsxDEV = jsx;
export function createElement(type, props, ...enfants) { return { type, props: { ...(props ?? {}), children: enfants.length > 1 ? enfants : enfants[0] } }; }
export function useState(init) {
  const c = courant, i = c.curseur++;
  if (!(i in c.etats)) c.etats[i] = typeof init === 'function' ? init() : init;
  const fixer = (v) => { const n = typeof v === 'function' ? v(c.etats[i]) : v; if (Object.is(n, c.etats[i])) return; c.etats[i] = n; c.planifier(); };
  return [c.etats[i], fixer];
}
export function useMemo(f, deps) { const c = courant, i = c.curseur++, p = c.memos[i]; if (p && memes(p.deps, deps)) return p.v; const v = f(); c.memos[i] = { v, deps }; return v; }
export function useCallback(f, deps) { return useMemo(() => f, deps); }
export function useRef(v) { const c = courant, i = c.curseur++; if (!c.refs[i]) c.refs[i] = { current: v }; return c.refs[i]; }
export function useEffect(f, deps) { const c = courant, i = c.curseur++, p = c.effets[i]; if (!p || !deps || !memes(p.deps, deps)) c.aLancer.push({ i, f, deps }); }
export const useLayoutEffect = useEffect;
export function monter(Composant, props) {
  const c = { etats: {}, memos: {}, refs: {}, effets: {}, aLancer: [], curseur: 0, sortie: null, rendus: 0, demonte: false, prevu: false, props };
  const rendre = () => {
    c.curseur = 0; c.aLancer = []; courant = c;
    try { c.sortie = Composant(c.props); } finally { courant = null; }
    c.rendus++;
    for (const e of c.aLancer) { const p = c.effets[e.i]; if (p && p.nettoyer) p.nettoyer(); const n = e.f(); c.effets[e.i] = { deps: e.deps, nettoyer: typeof n === 'function' ? n : null }; }
  };
  c.planifier = () => { if (c.demonte || c.prevu) return; c.prevu = true; queueMicrotask(() => { c.prevu = false; if (!c.demonte) rendre(); }); };
  rendre();
  return { get sortie() { return c.sortie; }, get rendus() { return c.rendus; }, rerendre() { if (!c.demonte) rendre(); },
    demonter() { c.demonte = true; for (const e of Object.values(c.effets)) if (e.nettoyer) e.nettoyer(); } };
}
export default { createElement, Fragment, useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect };
`;
// Ce que montre un rendu du React minimal : le texte, et l'adresse de la première image.
const texteDu = (n) => (n == null || typeof n === 'boolean' ? '' : typeof n === 'string' || typeof n === 'number' ? String(n)
  : Array.isArray(n) ? n.map(texteDu).join('') : texteDu(n.props?.children));
const imageDu = (n) => {
  if (!n || typeof n !== 'object') return null;
  if (Array.isArray(n)) { for (const x of n) { const s = imageDu(x); if (s) return s; } return null; }
  return n.type === 'img' ? n.props?.src ?? null : imageDu(n.props?.children);
};

const { createServer } = await import('vite');
const vite = await createServer({
  root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: [{ find: /^react-dom$/, replacement: join(ROOT, 'scripts/lib/portail-en-place.mjs') }] },
  ssr: { noExternal: [] },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const h = React.createElement;
  const charger = async (p) => { try { return await vite.ssrLoadModule(p); } catch (e) { console.log(`  (module ${p} illisible : ${String(e?.message ?? e).split('\n')[0]})`); return {}; } };
  const P = await vite.ssrLoadModule('/src/utils/photos.js');
  const PL = await vite.ssrLoadModule('/src/publication/plateformes.js');
  const SN = await vite.ssrLoadModule('/src/publication/StepperNouveau.jsx');
  const GP = await vite.ssrLoadModule('/src/components/GaleriePhotos.jsx');
  const R = await vite.ssrLoadModule('/src/publication/lot/regles.js');
  const F = await vite.ssrLoadModule('/src/publication/lot/ficheLue.js');
  const PV = await charger('/src/publication/lot/photoVide.js');
  const IPD = await charger('/src/publication/lot/imagesParDefaut.js');
  const LOT = await vite.ssrLoadModule('/src/publication/lot/LotPublication.jsx');
  const MR = await vite.ssrLoadModule('/src/publication/moteur/regles.js');
  const LBC = await vite.ssrLoadModule('/src/utils/lbcCategories.js');
  const CF = await vite.ssrLoadModule('/supabase/functions/_shared/contenu-fiche.js');
  const I18N = await vite.ssrLoadModule('/src/i18n/translations.js');
  const src = {
    regle: lire('src/utils/photos.js'),
    coque: lire('src/publication/StepperNouveau.jsx'),
    ecran: lire('src/publication/EcranOuPublier.jsx'),
    verifier: lire('src/publication/EcranVerifier.jsx'),
    moteur: lire('src/components/ListingPreviewScreen.jsx'),
    galerie: lire('src/components/GaleriePhotos.jsx'),
    stock: lire('src/tabs/StockTab.jsx'),
    app: lire('src/App.jsx'),
    lot: lire('src/publication/lot/regles.js'),
    ecranLot: lire('src/publication/lot/LotPublication.jsx'),
    vignette: essai(() => lire('src/publication/lot/VignetteLot.jsx')),
    ficheArticle: lire('src/publication/lot/FicheArticle.jsx'),
    lecture: lire('src/publication/lot/photoVide.js'),
    serveur: lire('supabase/functions/generate-listing/index.ts'),
    vinted: lire('chrome-extension/content-scripts/vinted.js'),
  };
  const regle = typeof P.photosManquentPourPublier === 'function' ? P.photosManquentPourPublier : null;
  const compte = typeof P.photosDuStepper === 'function' ? P.photosDuStepper : null;
  const vraies = typeof P.vraiesPhotos === 'function' ? P.vraiesPhotos : null;
  const fn = (o, nom) => (typeof o?.[nom] === 'function' ? o[nom] : null);
  const reconnaitre = fn(PV, 'reconnaitrePhoto'), estimer = fn(PV, 'estimerPhoto'), auClic = fn(PV, 'reconnaitreAuClic');
  const suivre = fn(PV, 'suivreLectures'), reconnue = fn(PV, 'imageParDefautReconnue'), uneFois = fn(PV, 'signalerUneFois');
  // La lecture au clic, telle que le moteur l'appelle (rien de reconnu quand elle manque).
  const lireAuClic = async (urls) => (auClic ? auClic(urls) : []);

  // ── A. La règle pure ────────────────────────────────────────────────────────────────────────────────────────
  console.log('A. La règle et le compte des photos (src/utils/photos.js), exécutés');
  {
    ok(Boolean(regle) && Boolean(compte) && Boolean(vraies), 'la règle (photosManquentPourPublier), le compte (photosDuStepper) et les vraies photos (vraiesPhotos) sont des fonctions pures');
    ok(P.MIN_PHOTOS === 1, 'MIN_PHOTOS = 1 : une photo suffit pour publier', `MIN_PHOTOS = ${P.MIN_PHOTOS}`);
    ok(Boolean(regle) && regle(1) === false && regle(2) === false, '1 ou 2 photos : rien ne manque');
    ok(Boolean(regle) && regle(0) === true, '0 photo : la photo manque');
    ok(Boolean(regle) && [3, 5, 20].every((n) => regle(n) === false), '3 photos et plus : rien ne manque (comme avant)');
    ok(Boolean(regle) && [undefined, null, NaN, '', -1].every((n) => regle(n) === true), 'un compte illisible vaut 0 photo : jamais un bouton actif sur un doute');
    ok(Boolean(regle) && regle(0, { texteRedige: true }) === true && regle(1, { premiereDeRemplissage: true }) === false && !/texteRedige|premiereDeRemplissage/.test(src.regle),
      'la règle ne compte que des vraies photos : aucune option (ni « texte déjà rédigé », ni « première de remplissage »)');
    const apercus = ['blob:https://fillsell.app/apercu-1'];
    const fiche = ['https://x/1.jpg', 'https://x/2.jpg'];
    ok(Boolean(compte) && compte(apercus, fiche) === apercus && compte([], fiche) === fiche && compte([], []).length === 0 && compte(null, undefined).length === 0,
      'le compte : les aperçus choisis au téléphone s’il y en a, sinon les photos de la fiche (la liste elle-même, jamais une copie)');
    // Les vraies photos : les photos moins les images par défaut reconnues, dans leur ordre.
    const v = (...a) => (vraies ? vraies(...a) : null);
    const liste = [A1, B1, C1];
    const objets = liste.map((url, i) => ({ type: i ? `photo_${i}` : 'original', url }));
    ok(v(liste) === liste && v(liste, []) === liste && v(liste, [VIDE]) === liste && v(liste, new Set()) === liste && v(objets, [VIDE]) === objets && v(liste, null) === liste,
      'aucune image par défaut reconnue : la MÊME liste (le même tableau), en adresses comme en objets');
    ok(egal(v([VIDE, A1, B1], [VIDE]), [A1, B1]) && egal(v([A1, VIDE, B1], [VIDE]), [A1, B1]) && egal(v([A1, B1, VIDE], [VIDE]), [A1, B1]),
      'image par défaut reconnue en 1re, 2e ou dernière position : retirée, l’ordre des vraies photos gardé');
    ok(egal(v([{ type: 'original', url: VIDE }, { type: 'photo_1', url: A1 }], new Set([VIDE])), [{ url: A1 }]),
      'en objets { type, url } aussi (la forme des tâches) : retirée, et le type POSITIONNEL des photos gardées tombe (les rangs ont bougé)');
    const avecRetouche = [{ type: 'photo_1', url: A1, enhanced: false }, { type: 'enhanced_2', url: 'https://x/enhanced/2.png' }, { type: 'original', url: VIDE }];
    ok(egal(v(avecRetouche, [VIDE]), [{ url: A1, enhanced: false }, { type: 'enhanced_2', url: 'https://x/enhanced/2.png' }]) && v(avecRetouche, []) === avecRetouche,
      '… seuls « original » et « photo_<i> » tombent : un type de retouche (« enhanced_<i> ») et les autres champs restent ; rien de retiré : rien ne change');
    ok(egal(v([VIDE], [VIDE]), []) && egal(v([VIDE, VIDE2], [VIDE, VIDE2]), []) && Boolean(regle) && regle(v([VIDE, VIDE2], [VIDE, VIDE2])?.length) === true,
      'une ou deux images par défaut et rien d’autre : aucune vraie photo = « 0 photo », la photo manque');
    ok(Boolean(regle) && regle(v([VIDE, A1], [VIDE])?.length) === false && regle(v([A1, VIDE], [VIDE])?.length) === false, 'une image par défaut et une vraie photo : rien ne manque');
    ok(v([ILLISIBLE, A1], [VIDE])?.length === 2 && v([VIDE], [])?.length === 1 && v([VIDE], undefined)?.length === 1,
      'une image non reconnue (pas lue, illisible, douteuse) n’est dans aucune liste : elle compte pour une vraie photo');
    const retouchees = [{ type: 'original', url: 'https://x/enhanced/1_0.png' }, { type: 'photo_1', url: A1 }];
    ok(egal(v(retouchees, [VIDE], [VIDE, A1]), [{ url: A1 }]) && v(retouchees, [VIDE], [VIDE]) === retouchees && v(retouchees, [VIDE]) === retouchees,
      'la retouche d’une image par défaut reconnue est retirée aussi (listes alignées rang par rang) ; listes non alignées : rien n’est retiré');
    ok(v([A1, B1], [VIDE], [VIDE, A1]).length === 2 && egal(v([A1, A1], [VIDE], [VIDE, A1]), [A1, A1]),
      'une photo d’ORIGINE n’est jugée que sur elle-même : même alignée sur une image par défaut, elle reste (jamais retirée par son rang)');
    // La règle du rang ne vaut que pour la retouche de CE rang (<uid>/enhanced/<ts>_<rang>.png, generate-listing).
    const retoucheRang1 = STO('enhanced/1700000000000_1.png'), retoucheRang0 = STO('enhanced/1700000000000_0.png');
    const copieAutre = STO('rehosted/101/1700000000000_0.jpg');
    ok(v([retoucheRang1, A1], [VIDE], [VIDE, A1]).length === 2 && v([copieAutre, A1], [VIDE], [VIDE, A1]).length === 2
      && egal(v([retoucheRang0, A1], [VIDE], [VIDE, A1]), [A1]),
      'listes DÉCALÉES de même longueur (une retouche d’un autre rang, ou une autre adresse, face à l’image par défaut) : RIEN n’est retiré ; la retouche de son rang, si');
    ok(v(null)?.length === 0 && v(undefined, [VIDE])?.length === 0 && v('x')?.length === 0, 'une liste absente ou illisible : aucune photo');
  }

  // ── A bis. La liste fermée et la lecture ──────────────────────────────────────────────────────────────────────
  console.log('A bis. La liste fermée (imagesParDefaut.js) et la lecture (photoVide.js), exécutées (réseau, image et canevas factices)');
  {
    const L = Array.isArray(IPD.IMAGES_PAR_DEFAUT) ? IPD.IMAGES_PAR_DEFAUT : [];
    const sha = createHash('sha256').update(OCTETS_DEFAUT).digest('hex');
    ok(L.length === 1 && Object.isFrozen(L) && Object.isFrozen(L[0]) && L[0].plateforme === 'beebs' && L[0].octets === OCTETS_DEFAUT.length && L[0].sha256 === sha
      && egal([...L[0].adresses], [BEEBS]) && L[0].largeur === 200 && L[0].hauteur === 200,
      'la liste fermée : UNE image, celle de Beebs (200 × 200, 3 066 octets, son SHA-256 et son adresse exacte), figée', JSON.stringify(L));
    ok(Boolean(reconnaitre) && Boolean(estimer) && Boolean(auClic) && Boolean(suivre) && Boolean(reconnue) && Boolean(uneFois) && typeof PV.useImagesParDefaut === 'function',
      'la lecture : reconnaitrePhoto, estimerPhoto, reconnaitreAuClic, suivreLectures (le corps), useImagesParDefaut (le crochet), imageParDefautReconnue, signalerUneFois');
    const raw = STO('raw/1793979784984_0.jpg'), retouche = STO('enhanced/1793979784984_0.png');
    const peut = fn(PV, 'peutEtreDeRemplissage'), octets = fn(PV, 'octetsLisibles');
    ok(Boolean(peut) && Boolean(octets) && [VIDE, BEEBS, VIDE2, STO('rapatrie-job/101/ab_0_1.jpg')].every((u) => peut(u) === true)
      && ['blob:https://fillsell.app/apercu-1', 'data:image/png;base64,AAAA', raw, retouche, '', null, undefined].every((u) => peut(u) === false)
      && octets(VIDE) && octets(VIDE2) && !octets(BEEBS) && !octets('https://images1.vinted.net/t/01_abc/f800/1.jpeg') && !octets(raw),
      'seule une photo venue d’une plateforme peut être une image par défaut ; seuls les octets de sa copie CHEZ NOUS se lisent (une adresse de plateforme se reconnaît à elle seule)');

    // La reconnaissance exacte.
    let n0 = reseau.appels.length;
    const parAdresse = reconnaitre ? await reconnaitre(BEEBS) : undefined;
    ok(parAdresse === true && reseau.appels.length === n0 && reconnue?.(BEEBS)?.plateforme === 'beebs',
      'l’image par défaut de Beebs à son ADRESSE exacte : reconnue sans rien télécharger (cdn.beebs.app ne sert aucun CORS)', `${parAdresse}, ${reseau.appels.length - n0} appel(s)`);
    const parOctets = reconnaitre ? await reconnaitre(VIDE) : undefined;
    ok(parOctets === true && reconnue?.(VIDE)?.plateforme === 'beebs' && reseau.appels.slice(n0).filter((u) => u === VIDE).length === 1,
      'sa COPIE chez nous (rapatrie-fiche/, mêmes octets) : reconnue à l’identique (taille puis SHA-256)', String(parOctets));
    n0 = reseau.appels.length;
    const autresAdresses = reconnaitre ? await Promise.all(['blob:https://fillsell.app/apercu-1', raw, retouche,
      'https://cdn.beebs.app/00000000-0000-0000-0000-000000000000.jpg', 'https://images1.vinted.net/t/01_abc/f800/1.jpeg'].map((u) => reconnaitre(u))) : [];
    ok(autresAdresses.length === 5 && autresAdresses.every((r) => r === false) && reseau.appels.length === n0,
      'une photo prise ou ajoutée dans FillSell, sa retouche, une autre adresse de plateforme : pas une image par défaut connue, sans rien télécharger', JSON.stringify(autresAdresses));
    const petiteNb = reconnaitre ? await reconnaitre(PETITE_NB) : undefined;
    ok(petiteNb === false && !reconnue?.(PETITE_NB) && reseau.octetsLus.get(PETITE_NB) === OCTETS_DEFAUT.length,
      'une VRAIE petite photo noir et blanc de la même taille en octets : hachée, PAS reconnue (une empreinte différente)', `${petiteNb}, ${reseau.octetsLus.get(PETITE_NB)} octets lus`);
    const grande = reconnaitre ? await reconnaitre(GRANDE) : undefined;
    ok(grande === false && reseau.octetsLus.get(GRANDE) === 0, 'une photo de 250 000 octets annoncés : pas une image par défaut connue, sans lire un octet de son contenu', `${grande}, ${reseau.octetsLus.get(GRANDE)} octets lus`);
    const sansLongueur = reconnaitre ? await reconnaitre(SANS_LONGUEUR) : undefined;
    ok(sansLongueur === false && reseau.octetsLus.get(SANS_LONGUEUR) <= (IPD.OCTETS_MAX ?? 0) + 1024 && reseau.octetsLus.get(SANS_LONGUEUR) > 0,
      'sans taille annoncée : la lecture s’arrête dès qu’elle dépasse la plus grande image connue (quelques Ko lus sur 50 000)', `${sansLongueur}, ${reseau.octetsLus.get(SANS_LONGUEUR)} octets lus`);
    const petite = reconnaitre ? await reconnaitre(PETITE) : undefined;
    ok(petite === false && reseau.octetsLus.get(PETITE) === 0, 'une photo de 9 000 octets : pas une image par défaut connue, rien lu de son contenu', String(petite));
    const moyenne = reconnaitre ? await reconnaitre(MOYENNE) : undefined;
    ok(moyenne === false && reseau.octetsLus.get(MOYENNE) === 0,
      'une photo de 5 000 octets annoncés (la taille d’AUCUNE image de la liste) : coupée sur les en-têtes, pas un octet de son contenu lu', `${moyenne}, ${reseau.octetsLus.get(MOYENNE)} octets lus`);
    // Le SHA-256 sans WebCrypto (la vue web de l'app iOS, capacitor://localhost, peut ne pas l'avoir).
    const shaJs = fn(IPD, 'sha256HexJs');
    const tailles = [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000, 3066];
    ok(Boolean(shaJs) && shaJs(OCTETS_DEFAUT) === sha && tailles.every((n) => { const b = autres(n, n); return shaJs(b) === createHash('sha256').update(b).digest('hex'); }),
      'le SHA-256 en JavaScript pur (repli) : la même empreinte que WebCrypto, sur la vraie image de Beebs et sur 11 tailles (0 à 3 066 octets)');
    SERVEUR.set(STO('rapatrie-fiche/104/sans-webcrypto.jpg'), { octets: OCTETS_DEFAUT });
    const cryptoAvant = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    const sansWebCrypto = reconnaitre ? await reconnaitre(STO('rapatrie-fiche/104/sans-webcrypto.jpg')) : undefined;
    Object.defineProperty(globalThis, 'crypto', cryptoAvant);
    ok(sansWebCrypto === true && typeof globalThis.crypto?.subtle?.digest === 'function',
      'SANS WebCrypto (crypto absent de la page) : la copie de l’image par défaut est quand même reconnue, par le repli', String(sansWebCrypto));

    // Rien de conclu : jamais retirée.
    const illisible = reconnaitre ? await reconnaitre(ILLISIBLE) : undefined;
    const absente = reconnaitre ? await reconnaitre(ABSENTE) : undefined;
    ok(illisible === null && absente === null && !reconnue?.(ILLISIBLE) && !reconnue?.(ABSENTE),
      'une image illisible (réseau, CORS) ou absente (404) : rien n’est conclu (null) — elle n’est jamais retirée', `${illisible}, ${absente}`);
    const avantDelai = PV.DELAIS?.lectureMs;
    if (PV.DELAIS) PV.DELAIS.lectureMs = 40;
    const t0 = Date.now();
    const lente = reconnaitre ? await reconnaitre(LENTE) : undefined;
    const duree = Date.now() - t0;
    if (PV.DELAIS) PV.DELAIS.lectureMs = avantDelai;
    ok(lente === null && duree < 1000 && !reconnue?.(LENTE) && reseau.enVol === 0,
      'DÉLAI DÉPASSÉ : une lecture qui ne répond pas est abandonnée (null, rien n’est conclu, la requête est coupée)', `${lente} en ${duree} ms, en vol ${reseau.enVol}`);
    const premiere = reconnaitre ? await reconnaitre(INTERMITTENTE) : undefined;
    const deuxieme = reconnaitre ? await reconnaitre(INTERMITTENTE) : undefined;
    ok(premiere === null && deuxieme === true && reseau.appels.filter((u) => u === INTERMITTENTE).length === 2,
      'RELECTURE d’un « null » : une lecture ratée n’est pas gardée — la suivante relit, et reconnaît', `${premiere} puis ${deuxieme}`);
    n0 = reseau.appels.length;
    const encore = reconnaitre ? await Promise.all([reconnaitre(VIDE), reconnaitre(PETITE_NB), reconnaitre(GRANDE)]) : [];
    ok(egal(encore, [true, false, false]) && reseau.appels.length === n0, 'la mémoire de la session : une photo lue n’est jamais relue', `${JSON.stringify(encore)}, ${reseau.appels.length - n0} appel(s)`);

    // La borne et la priorité.
    reseau.maxEnVol = 0;
    const debut = reseau.appels.length;
    const enFile = reconnaitre ? Array.from({ length: 12 }, (_, i) => reconnaitre(P_(`file-${i}`))) : [];
    const devant = reconnaitre ? reconnaitre(P_('file-12'), { prioritaire: true }) : null;
    const lus = await Promise.all([...enFile, devant]);
    ok(lus.length === 13 && lus.every((r) => r === false) && PV.LECTURES_SIMULTANEES === 4 && reseau.maxEnVol <= 4 && reseau.maxEnVol >= 2,
      'la borne : 13 lectures demandées d’un coup, jamais plus de 4 à la fois', `max ${reseau.maxEnVol}, borne ${PV.LECTURES_SIMULTANEES}`);
    ok(reseau.appels.slice(debut).indexOf(P_('file-12')) === 4, 'une lecture prioritaire (la première photo d’un article, le clic) passe devant celles qui attendent',
      `rang ${reseau.appels.slice(debut).indexOf(P_('file-12'))}`);
    // La file se libère quand l'écran se ferme : ce qui attend encore n'est jamais lancé.
    if (PV.DELAIS) PV.DELAIS.lectureMs = 60;
    const occupe = reconnaitre ? Array.from({ length: 4 }, (_, i) => reconnaitre(P_(`occupe-${i}`) + '?lente')) : [];
    for (let i = 0; i < 4; i++) SERVEUR.set(P_(`occupe-${i}`) + '?lente', { lente: true });
    const ecran = new AbortController();
    const enAttente = reconnaitre ? Array.from({ length: 5 }, (_, i) => reconnaitre(P_(`attend-${i}`), { signal: ecran.signal })) : [];
    for (let i = 0; i < 5; i++) SERVEUR.set(P_(`attend-${i}`), { octets: OCTETS_DEFAUT });
    ecran.abort();
    const abandonnees = await Promise.all(enAttente);
    await Promise.all(occupe);
    if (PV.DELAIS) PV.DELAIS.lectureMs = avantDelai;
    ok(abandonnees.length === 5 && abandonnees.every((r) => r === null) && !reseau.appels.some((u) => /attend-\d/.test(u)),
      'LA FILE SE LIBÈRE : l’écran qui attendait 5 lectures se ferme — aucune n’est lancée, rien n’est conclu', JSON.stringify(abandonnees));
    const apres = reconnaitre ? await reconnaitre(P_('attend-0')) : undefined;
    ok(apres === true, '… et une lecture abandonnée se refait plus tard (elle n’a rien laissé en mémoire)', String(apres));

    // L'estimation : elle juge, elle ne retire rien.
    const canevasAvant = image.canevas;
    const estGrande = estimer ? await estimer(GRANDE) : undefined;
    ok(estGrande === false && image.canevas === canevasAvant, 'estimation : une image de plus de 256 px n’est pas douteuse, jugée sur sa taille seule (aucun canevas)', String(estGrande));
    const estNb = estimer ? await estimer(PETITE_NB) : undefined;
    const estDefaut = estimer ? await estimer(VIDE) : undefined;
    const estPetite = estimer ? await estimer(PETITE) : undefined;
    const estIllisible = estimer ? await estimer(ILLISIBLE) : undefined;
    ok(estNb === true && estDefaut === true && estPetite === false && estIllisible === null,
      'estimation : la petite photo noir et blanc (120 × 90, 12 couleurs) et l’image par défaut sont DOUTEUSES ; une petite photo en couleurs non ; illisible : null',
      JSON.stringify({ estNb, estDefaut, estPetite, estIllisible }));
    ok(estNb === true && petiteNb === false && Boolean(vraies) && vraies([PETITE_NB], reconnue && reconnue(PETITE_NB) ? [PETITE_NB] : []).length === 1,
      'douteuse ≠ reconnue : la petite photo noir et blanc reste une VRAIE photo (on ne retire jamais une photo sur un doute)');

    // Le signalement : une fois par photo et par session.
    const envois = [];
    const s1 = uneFois ? uneFois(PETITE_NB, (u) => envois.push(u)) : null;
    const s2 = uneFois ? uneFois(PETITE_NB, (u) => envois.push(u)) : null;
    const s3 = uneFois ? uneFois(PETITE, (u) => envois.push(u)) : null;
    ok(s1 === true && s2 === false && s3 === true && egal(envois, [PETITE_NB, PETITE]), 'signalerUneFois : une photo n’est signalée qu’une fois par session', JSON.stringify(envois));

    // LE CORPS DE LA LECTURE D'UNE LISTE (suivreLectures), exécuté avec des lectures factices pilotées.
    const pilote = (verdicts) => {
      const demandes = [];
      return { demandes, lire: (u, o) => { demandes.push({ u, prioritaire: Boolean(o?.prioritaire) }); return Promise.resolve(verdicts[u]); } };
    };
    const suivi = async (liste, verdicts, { douteuses = {} } = {}) => {
      const p = pilote(verdicts);
      const redessins = [], signales = [], estimees = [];
      let conclusions = 0;
      const arreter = suivre ? suivre(liste, { reconnaitre: p.lire, estimer: (u) => { estimees.push(u); return Promise.resolve(douteuses[u] ?? false); }, quandReconnue: (u) => redessins.push(u), quandDouteuse: (u) => signales.push(u), quandConclue: () => { conclusions++; } }) : noop;
      await pause(10);
      return { lues: p.demandes.map((d) => d.u), prio: p.demandes.map((d) => d.prioritaire), redessins, signales, estimees, conclusions, arreter };
    };
    const cascade = await suivi([VIDE, A1, B1], { [VIDE]: true, [A1]: false, [B1]: false });
    ok(egal(cascade.lues, [VIDE, A1]) && egal(cascade.redessins, [VIDE]) && cascade.prio[0] === true,
      'CASCADE : la 1re photo (prioritaire), puis la suivante seulement parce que la 1re est reconnue ; arrêt à la première vraie photo', JSON.stringify(cascade));
    const normale = await suivi([A1, B1, C1], { [A1]: false, [B1]: false, [C1]: false });
    ok(egal(normale.lues, [A1]) && normale.redessins.length === 0 && egal(normale.estimees, [A1]) && normale.signales.length === 0,
      'des photos normales : UNE lecture (la 1re), une estimation, aucun REDESSIN, rien de signalé', JSON.stringify(normale));
    const deuxDefauts = await suivi([VIDE, VIDE2], { [VIDE]: true, [VIDE2]: true });
    ok(egal(deuxDefauts.lues, [VIDE, VIDE2]) && egal(deuxDefauts.redessins, [VIDE, VIDE2]) && deuxDefauts.estimees.length === 0,
      'deux images par défaut et rien d’autre : les deux lues (le bouton saura qu’il ne reste aucune vraie photo), un redessin pour chacune');
    const delai = await suivi([LENTE, A1], { [LENTE]: null, [A1]: false });
    ok(egal(delai.lues, [LENTE]) && delai.redessins.length === 0, 'DÉLAI DÉPASSÉ (null) : la cascade s’arrête, rien n’est reconnu — la photo compte pour une vraie', JSON.stringify(delai));
    const douteuse = await suivi([PETITE_NB, A1], { [PETITE_NB]: false, [A1]: false }, { douteuses: { [PETITE_NB]: true } });
    ok(egal(douteuse.signales, [PETITE_NB]) && douteuse.redessins.length === 0 && egal(douteuse.lues, [PETITE_NB]),
      'une photo DOUTEUSE (estimation) et non reconnue : SIGNALÉE, jamais retirée (aucun redessin, rien de reconnu)', JSON.stringify(douteuse));
    const vide0 = await suivi([], {});
    ok(cascade.conclusions === 1 && normale.conclusions === 1 && deuxDefauts.conclusions === 1 && delai.conclusions === 0 && vide0.conclusions === 1,
      'la cascade CONCLUT (une fois) sur une photo lue qui n’est pas une image par défaut, ou quand toutes sont reconnues, ou sans photo — JAMAIS sur une lecture ratée (comme avant le 11/11)',
      JSON.stringify([cascade.conclusions, normale.conclusions, deuxDefauts.conclusions, delai.conclusions, vide0.conclusions]));
    const sansSignal = { lues: [] };
    if (suivre) { const p = pilote({ [PETITE_NB]: false }); let estimees = 0; suivre([PETITE_NB], { reconnaitre: p.lire, estimer: () => { estimees++; return Promise.resolve(true); } }); await pause(5); sansSignal.lues = p.demandes; sansSignal.estimees = estimees; }
    ok(sansSignal.estimees === 0, 'sans destinataire du signalement (la vignette du lot) : aucune estimation n’est lancée');
    // Arrêtée (écran fermé) : plus rien n'arrive à l'écran.
    if (suivre) {
      let lacher = null;
      const tardive = new Promise((r) => { lacher = r; });
      const redessins = [];
      const arreter = suivre([VIDE, A1], { reconnaitre: () => tardive, quandReconnue: (u) => redessins.push(u) });
      arreter(); lacher(true); await pause(5);
      ok(redessins.length === 0, 'une liste arrêtée (écran fermé) ne redessine plus rien, même si sa lecture finit après');
    } else ok(false, 'une liste arrêtée (écran fermé) ne redessine plus rien');
    // Relecture d'un « null » d'une liste à l'autre, avec la VRAIE lecture.
    SERVEUR.set(P_('relue'), { octets: OCTETS_DEFAUT, echecs: 1 });
    const relue = P_('relue');
    const vrai = async (liste, fini) => {
      const redessins = [], verdicts = new Map();
      const arreter = suivre ? suivre(liste, { reconnaitre: (u, o) => reconnaitre(u, o).then((v) => { verdicts.set(u, v); return v; }), quandReconnue: (u) => redessins.push(u) }) : noop;
      await jusqua(() => fini(verdicts));
      await pause(5);   // ce qui suivrait ce verdict (rien ne doit arriver de plus)
      arreter();
      return redessins;
    };
    const l1 = await vrai([relue, A1], (v) => v.has(relue));
    const l2 = await vrai([relue, A1], (v) => v.get(relue) === true && v.has(A1));
    ok(l1.length === 0 && egal(l2, [relue]) && reseau.appels.filter((u) => u === relue).length === 2,
      'RELECTURE d’un « null » : la liste qui l’a reçu ne le redemande pas ; la liste suivante le relit, et le reconnaît', `${JSON.stringify(l1)} puis ${JSON.stringify(l2)}`);

    // La lecture AU CLIC : toutes les photos, attente bornée.
    SERVEUR.set(P_('clic-lente'), { lente: true });
    if (PV.DELAIS) PV.DELAIS.lectureMs = 200;
    const t1 = Date.now();
    const auClicReconnues = auClic ? await auClic([A1, VIDE2, PETITE_NB, P_('clic-lente'), ILLISIBLE, BEEBS, VIDE2], { delaiMs: 80 }) : [];
    const dureeClic = Date.now() - t1;
    if (PV.DELAIS) PV.DELAIS.lectureMs = avantDelai;
    ok(egal([...auClicReconnues].sort(), [BEEBS, VIDE2].sort()) && dureeClic < 1500,
      'AU CLIC : toutes les photos reconnues à l’identique (adresse, octets), et elles seules ; ce qui ne répond pas à temps n’attend pas plus que la borne — et part',
      `${JSON.stringify(auClicReconnues)} en ${dureeClic} ms`);
    ok(PV.DELAIS?.auClicMs > 0 && PV.DELAIS.auClicMs <= 10_000 && /reconnaitreAuClic\(\[\s*\.\.\.urlsPhotos\(processedPhotos\)\s*,\s*\.\.\.urlsPhotos\(photos\)\s*\]\s*\)/.test(src.moteur),
      `l’attente au clic est bornée à quelques secondes (${PV.DELAIS?.auClicMs} ms) et le moteur l’appelle sur toutes les photos qui peuvent partir`);
    // La PRÉ-LECTURE du lot (pendant la préparation) : au clic, plus rien à lire, aucune attente.
    const prelire = fn(PV, 'prelireImagesParDefaut');
    const lotUrls = Array.from({ length: 6 }, (_, i) => STO(`rapatrie-fiche/200/${i}.jpg`));
    lotUrls.forEach((u, i) => SERVEUR.set(u, i === 3 ? { octets: OCTETS_DEFAUT } : { taille: 120_000 }));
    const demandees = prelire ? prelire([...lotUrls, lotUrls[0]]) : 0;
    // La pré-lecture a fini quand chaque photo a répondu (en-têtes) et que l'image par défaut est reconnue.
    await jusqua(() => lotUrls.every((u) => reseau.octetsLus.has(u)) && Boolean(reconnue?.(lotUrls[3])));
    await pause(5);
    const n1 = reseau.appels.length;
    const t2 = Date.now();
    const apresPrelecture = auClic ? await auClic(lotUrls, { delaiMs: 2000 }) : [];
    const dureeApres = Date.now() - t2;
    ok(demandees === 6 && egal(apresPrelecture, [lotUrls[3]]) && reseau.appels.length === n1 && dureeApres < 500,
      'PRÉ-LECTURE (le lot, pendant la préparation) : au clic, tout est déjà lu — aucun appel, aucune attente, la même réponse',
      `${demandees} demandées, ${reseau.appels.length - n1} appel(s) au clic, ${dureeApres} ms`);
    ok(/const clePrelecture = !done \? \[\.\.\.new Set\(\[\.\.\.urlsPhotos\(processedPhotos\), \.\.\.urlsPhotos\(photos\)\]\)\]\.join\("\\n"\) : "";/.test(src.moteur)
      && /prelireImagesParDefaut\(clePrelecture\.split\("\\n"\), \{ signal: ctl\.signal \}\)/.test(src.moteur)
      && /return \(\) => ctl\.abort\(\);\s*\}, \[clePrelecture\]\);/.test(src.moteur),
      'le moteur pré-lit toutes les photos qui peuvent partir tant que l’article n’est pas parti — dans le lot pendant la préparation, à l’unité dès « Où publier ? » ; l’écran fermé, la pré-lecture s’arrête');

    // Les garde-fous de la file et de la lecture (relecture du 11/11 soir).
    const minuscule = reconnaitre ? await reconnaitre(MINUSCULE) : undefined;
    ok(minuscule === false && reseau.octetsLus.get(MINUSCULE) === 0,
      'une photo de 2 000 octets annoncés (PLUS PETITE que l’image par défaut, la taille d’aucune image connue) : coupée sur les en-têtes, 0 octet lu', `${minuscule}, ${reseau.octetsLus.get(MINUSCULE)} octets lus`);
    const erreur500 = reconnaitre ? await reconnaitre(ERREUR_500) : undefined;
    ok(erreur500 === null && reseau.coupees.has(ERREUR_500) && reseau.octetsLus.get(ERREUR_500) === 0,
      'une réponse d’erreur (500) : rien de conclu, et son corps n’est pas téléchargé (la requête est coupée)', `${erreur500}, coupée ${reseau.coupees.has(ERREUR_500)}`);
    // Abandonnée puis redemandée aussitôt (l'écran se referme et se rouvre) : la nouvelle demande va au bout.
    const reouverte = STO('rapatrie-fiche/105/reouverte.jpg');
    SERVEUR.set(reouverte, { octets: OCTETS_DEFAUT });
    const fermee = new AbortController();
    const avantFermeture = reconnaitre ? reconnaitre(reouverte, { signal: fermee.signal }) : null;
    fermee.abort();
    const apresReouverture = reconnaitre ? reconnaitre(reouverte) : null;
    const [verdictFerme, verdictRouvert] = await Promise.all([avantFermeture, apresReouverture]);
    ok(verdictFerme === null && verdictRouvert === true,
      'une lecture abandonnée puis REDEMANDÉE aussitôt : la nouvelle demande ne s’accroche pas à l’abandonnée, elle lit et reconnaît', `${verdictFerme} puis ${verdictRouvert}`);
    // Le clic passe devant : 4 lectures lentes occupent la file, 3 lectures ordinaires attendent, puis le clic.
    if (PV.DELAIS) PV.DELAIS.lectureMs = 150;
    const lentes = Array.from({ length: 4 }, (_, i) => STO(`rapatrie-fiche/106/lente-${i}.jpg`));
    const ordinaires = Array.from({ length: 3 }, (_, i) => STO(`rapatrie-fiche/106/ordinaire-${i}.jpg`));
    const auClicUrl = STO('rapatrie-fiche/106/au-clic.jpg');
    lentes.forEach((u) => SERVEUR.set(u, { lente: true }));
    [...ordinaires, auClicUrl].forEach((u) => SERVEUR.set(u, { taille: 80_000 }));
    const occupees = reconnaitre ? lentes.map((u) => reconnaitre(u)) : [];
    const enAttenteOrd = reconnaitre ? ordinaires.map((u) => reconnaitre(u)) : [];
    const clic = auClic ? auClic([auClicUrl], { delaiMs: 3000 }) : Promise.resolve([]);
    await Promise.all([...occupees, ...enAttenteOrd, clic]);
    if (PV.DELAIS) PV.DELAIS.lectureMs = avantDelai;
    const rang = (u) => reseau.appels.lastIndexOf(u);
    ok(rang(auClicUrl) > -1 && ordinaires.every((u) => rang(auClicUrl) < rang(u)),
      'AU CLIC, la lecture passe DEVANT celles qui attendent (prioritaire) : demandée après elles, lancée avant', JSON.stringify([rang(auClicUrl), ...ordinaires.map(rang)]));
    // L'estimation abandonnée (écran fermé) : le téléchargement de l'image s'arrête.
    const imageLente = STO('rapatrie-fiche/107/image-lente.jpg');
    IMAGES.set(imageLente, { lente: true });
    const ferme2 = new AbortController();
    const estimation = estimer ? estimer(imageLente, { signal: ferme2.signal }) : Promise.resolve(undefined);
    await jusqua(() => image.chargements.includes(imageLente));
    ferme2.abort();
    const verdictEstimation = await estimation;
    ok(verdictEstimation === null && image.arretees.includes(imageLente),
      'une estimation abandonnée (écran fermé) : rien de conclu, et le chargement de l’image est ARRÊTÉ (src vidée)', `${verdictEstimation}, arrêtées ${JSON.stringify(image.arretees)}`);
  }

  // ── B. Le vrai bouton de « Où publier ? » ───────────────────────────────────────────────────────────────────
  // Le moteur FACTICE, à la forme de celui que ListingPreviewScreen tend à la coque (bloc « LE MOTEUR TENDU AU NOUVEAU
  // STEPPER »). Un import : les photos de la fiche, déjà en ligne (m.photos). Une photo prise au téléphone : un aperçu
  // local choisi, pas encore monté (m.pickedPreviews). Le compte passe par la fonction du moteur (photosDuStepper).
  // `remplissage` : les rangs des photos reconnues comme images par défaut (m.photosDeRemplissage, la lecture du moteur).
  const moteur = ({ origine = 'import', n = 1, cochees = ['vinted'], fiche = false, lang = 'fr', remplissage = [], ...surcharge } = {}) => {
    const urls = Array.from({ length: n }, (_, i) => (origine === 'telephone'
      ? `blob:https://fillsell.app/apercu-${i + 1}` : `https://x.supabase.co/storage/v1/object/public/listing-photos/u/rapatrie-fiche/7/photo${i + 1}.webp`));
    const photos = origine === 'telephone' ? [] : urls;
    const pickedPreviews = origine === 'telephone' ? urls : [];
    const displayPreviews = compte(pickedPreviews, photos);
    return {
      lang, t: (cle) => I18N.translations[lang]?.[cle] ?? cle, done: false, step: photos.length ? 1 : 0, supabase: null, modales: null, userId: null,
      isLocked: false, quitterArme: false, onVoirAnalyse: null, suivant: noop, retour: noop, quitter: noop, voirOffres: noop,
      publishedStateLoaded: true, uploading: false, copieManquante: false, retoucheARefaire: false, texteHorsQuota: origine === 'import',
      photos, pickedPreviews, displayPreviews, photoCount: displayPreviews.length, photosDeRemplissage: remplissage.map((i) => displayPreviews[i]),
      MIN_PHOTOS: P.MIN_PHOTOS, MAX_PHOTOS: P.MAX_PHOTOS, MAX_RETOUCHED: 5,
      platformListings: fiche ? { platforms: Object.fromEntries(CINQ.map((p) => [p, {}])) } : null,
      reuseRetouched: false, retoucheLivree: false, optionRedaction: fiche ? 'original' : null, remiseAZero: null,
      retoucheNewCount: 0, photoOption: 'original', setPhotoOption: noop,
      titreArticle: 'Carte postale ancienne, Lyon 1908', etatArticle: 'Bon état', price: 12, setLightboxUrl: noop,
      uploadError: null, identifyFailed: false, modeleAConfirmer: false,
      plateformesAffichees: CINQ, platformSupport: {}, publishedSet: new Set(), queuedSet: new Set(), attentes: {}, oplaAccesDetail: null,
      ebayBloque: false, pausedPlatforms: [], plateformesAVenir: [], plateformesOuvertes: [], categorieFermee: PL.categorieFermee,
      selected: new Set(cochees), platformSessions: Object.fromEntries(CINQ.map((p) => [p, true])),
      ebayVoieApiReelle: false, ebayVoieApi: false, motifAVenir: () => '', motifsVerrouillage: {}, onCompleter: null,
      motifEbay: '', boutonEbay: '', ouvrirPanneauEbay: null, motifPause: () => '', oplaVerdict: null, phraseEtat: () => '',
      motifSupport: () => '', basculer: noop, addFiles: noop, removeFile: noop, handleReorderPreviews: noop,
      handleAddMorePhotos: noop, handleRemovePhoto: noop, handleReorderPhotos: noop, analysisHidden: true, notes: '', setNotes: noop,
      micDisponible: false, micActive: false, micEtat: 'repos', micMessage: null, toggleMic: noop,
      ...surcharge,
    };
  };
  // Le bouton principal du pied de page, tel que la coque le rend : { gris, libelle }, et le texte de l'écran.
  const bouton = (o) => {
    let html = '';
    try { html = renderToStaticMarkup(h(SN.default, { m: moteur(o) })); } catch (e) { return { erreur: String(e?.message ?? e), html, ecran: '' }; }
    const pied = html.slice(Math.max(0, html.indexOf('class="fsn-foot"')));
    const b = /<button\b([^>]*\bfsn-btn--primary\b[^>]*)>([\s\S]*?)<\/button>/.exec(pied);
    return b ? { gris: /\bdisabled\b/.test(b[1]), libelle: texte(b[2]), html, ecran: texte(html) } : { erreur: 'bouton du pied introuvable', html, ecran: texte(html) };
  };
  const dit = (...rs) => rs.map((r) => JSON.stringify({ gris: r?.gris, libelle: r?.libelle, erreur: r?.erreur })).join(' ');
  const rendu = (r) => Boolean(r) && !r.erreur;
  const estLibellePhoto = (r) => Object.values(LIBELLE_PHOTO).includes(r?.libelle);
  const ditLaPhrase = (r) => Object.values(PHRASE_VRAIE_PHOTO).some((p) => r?.ecran?.includes(p));
  // Actif : le bouton n'est pas gris, il ne réclame pas de photo, et l'écran ne demande pas de vraie photo.
  const actif = (r) => rendu(r) && r.gris === false && !estLibellePhoto(r) && !ditLaPhrase(r);
  // Retenu faute de photo : gris, avec LE libellé — le même partout — et sans la phrase (il n'y a aucune photo).
  const sansPhoto = (r, lang = 'fr') => rendu(r) && r.gris === true && r.libelle === LIBELLE_PHOTO[lang] && !ditLaPhrase(r);
  // Retenu parce que les seules photos sont des images par défaut connues : gris, le même libellé, ET la phrase.
  const sansVraiePhoto = (r, lang = 'fr') => rendu(r) && r.gris === true && r.libelle === LIBELLE_PHOTO[lang] && r.ecran.includes(PHRASE_VRAIE_PHOTO[lang])
    && !r.ecran.includes(PHRASE_VRAIE_PHOTO[lang === 'fr' ? 'en' : 'fr']);
  // Retenu pour une autre raison que la photo.
  const retenuAutrement = (r) => rendu(r) && r.gris === true && !estLibellePhoto(r);

  console.log('B. Le bouton de « Où publier ? » (la coque réelle, rendue)');
  {
    const importUne = bouton({ origine: 'import', n: 1 });
    ok(actif(importUne), 'import à UNE photo, aucun texte rédigé : bouton ACTIF', dit(importUne));
    ok(rendu(importUne) && importUne.libelle === 'Rédiger l\'annonce · 1 plateforme', 'son libellé : « Rédiger l’annonce · 1 plateforme » (le seul contrôle sur les mots d’un bouton actif)', dit(importUne));
    const telUne = bouton({ origine: 'telephone', n: 1 });
    ok(actif(telUne), 'UNE photo prise au téléphone (pas encore montée) : bouton ACTIF', dit(telUne));
    const importDeux = bouton({ origine: 'import', n: 2 });
    const telDeux = bouton({ origine: 'telephone', n: 2 });
    ok(actif(importDeux) && actif(telDeux), 'DEUX photos (import, téléphone) : bouton ACTIF', dit(importDeux, telDeux));
    const importZero = bouton({ origine: 'import', n: 0 });
    const telZero = bouton({ origine: 'telephone', n: 0 });
    ok(sansPhoto(importZero) && sansPhoto(telZero), 'ZÉRO photo (import sans photo, rien de pris au téléphone) : bouton GRIS « Ajoute au moins 1 photo »', dit(importZero, telZero));
    for (const p of CINQ) {
      const une = bouton({ n: 1, cochees: [p] });
      const zero = bouton({ n: 0, cochees: [p] });
      ok(actif(une) && sansPhoto(zero), `${NOMS[p]} cochée seule : 1 photo → actif ; 0 photo → gris`, dit(une, zero));
    }
    const toutes = bouton({ n: 1, cochees: CINQ });
    ok(actif(toutes), 'les 5 plateformes cochées, 1 photo : bouton ACTIF', dit(toutes));
    const trois = bouton({ n: 3 });
    ok(actif(trois), '3 photos : actif, comme avant', dit(trois));
    const enUne = bouton({ n: 1, lang: 'en' });
    const enZero = bouton({ n: 0, lang: 'en' });
    ok(actif(enUne) && sansPhoto(enZero, 'en'), 'en anglais : 1 photo → actif ; 0 photo → gris « Add at least 1 photo »', dit(enUne, enZero));
    const cle = bouton({ n: 0, t: (k) => (k === 'ctaAddAtLeastOnePhoto' ? '«clé lue»' : I18N.translations.fr?.[k] ?? k) });
    ok(rendu(cle) && cle.gris === true && cle.libelle === '«clé lue»', 'le libellé vient de la clé de traduction (ctaAddAtLeastOnePhoto, celle de l’ancienne peau) — aucun « 1 » écrit en dur', dit(cle));

    // (décision de Nico du 11/11) 0 photo bloque TOUJOURS, texte déjà rédigé compris.
    const redigeZero = bouton({ n: 0, fiche: true });
    const redigeZeroEn = bouton({ n: 0, fiche: true, lang: 'en' });
    const redigeZeroTel = bouton({ origine: 'telephone', n: 0, fiche: true });
    ok(sansPhoto(redigeZero) && sansPhoto(redigeZeroEn, 'en') && sansPhoto(redigeZeroTel),
      'texte DÉJÀ rédigé et 0 photo : bouton GRIS « Ajoute au moins 1 photo » (plus d’exception)', dit(redigeZero, redigeZeroEn, redigeZeroTel));
    const redigeCopie = bouton({ n: 0, fiche: true, copieManquante: true });
    const redigeRetouche = bouton({ n: 0, fiche: true, retoucheARefaire: true });
    ok(sansPhoto(redigeCopie) && sansPhoto(redigeRetouche), 'texte déjà rédigé, 0 photo, rédaction à relancer (copie manquante, retouche) : gris aussi', dit(redigeCopie, redigeRetouche));
    const redigeUne = bouton({ n: 1, fiche: true });
    const redigeDeux = bouton({ n: 2, fiche: true });
    ok(actif(redigeUne) && actif(redigeDeux), 'texte déjà rédigé, 1 ou 2 photos : bouton ACTIF, comme avant', dit(redigeUne, redigeDeux));

    // (décisions de Nico du 11/11) L'image par défaut connue n'est pas une photo, quelle que soit sa place.
    const seule = bouton({ n: 1, remplissage: [0] });
    const seuleEn = bouton({ n: 1, remplissage: [0], lang: 'en' });
    ok(sansVraiePhoto(seule) && sansVraiePhoto(seuleEn, 'en'),
      'la SEULE photo est une image par défaut reconnue : bouton GRIS, le même libellé, et la phrase « Ajoute une vraie photo de ton article pour le publier. » (en anglais : « Add a real photo of your item to publish it. »)',
      `${dit(seule, seuleEn)} phrase fr ${seule.ecran?.includes(PHRASE_VRAIE_PHOTO.fr)}, en ${seuleEn.ecran?.includes(PHRASE_VRAIE_PHOTO.en)}`);
    const seuleRedigee = bouton({ n: 1, fiche: true, remplissage: [0] });
    const deuxVides = bouton({ n: 2, remplissage: [0, 1] });
    ok(sansVraiePhoto(seuleRedigee) && sansVraiePhoto(deuxVides), 'pareil avec un texte déjà rédigé, et avec DEUX images par défaut et rien d’autre : gris, la phrase', dit(seuleRedigee, deuxVides));
    const premiere = bouton({ n: 2, remplissage: [0] });
    const deuxieme = bouton({ n: 2, remplissage: [1] });
    const derniere = bouton({ n: 4, remplissage: [3] });
    ok(actif(premiere) && actif(deuxieme) && actif(derniere), 'image par défaut en 1re, 2e ou dernière position ET une vraie photo : bouton ACTIF, sans la phrase', dit(premiere, deuxieme, derniere));
    const pasLue = bouton({ n: 1, remplissage: [] });
    const sansLecture = bouton({ n: 1, photosDeRemplissage: undefined });
    ok(actif(pasLue) && actif(sansLecture), 'image non reconnue (pas lue, illisible, douteuse — dans aucune liste) : comptée comme une vraie photo, bouton ACTIF', dit(pasLue, sansLecture));
    ok(!ditLaPhrase(importZero) && !ditLaPhrase(redigeZero) && !ditLaPhrase(importUne), 'la phrase ne se dit que là : jamais à 0 photo, jamais quand une vraie photo est là');

    // Les autres retenues du bouton ne bougent pas.
    const aucune = bouton({ n: 1, cochees: [] });
    const envoi = bouton({ origine: 'telephone', n: 1, uploading: true });
    const lectureEnCours = bouton({ n: 1, publishedStateLoaded: false });
    ok(retenuAutrement(aucune) && retenuAutrement(envoi) && retenuAutrement(lectureEnCours),
      'les autres retenues restent, sans parler de photo : aucune plateforme cochée, envoi des photos, relecture des annonces en ligne', dit(aucune, envoi, lectureEnCours));
  }

  // Ce qui nourrit le bouton et ce qui suit le clic : le moteur n'est pas monté ici, son source est lu.
  console.log('B bis. Le moteur (ListingPreviewScreen), lu dans le source');
  {
    ok(/photosManquentPourPublier\(\s*vraiesPhotos\(\s*m\.displayPreviews\s*,\s*m\.photosDeRemplissage\s*\)\.length\s*\)/.test(src.coque)
      && !/photoCount\s*(?:<=?|>=?|={2,3}|!==?)/.test(src.coque) && !/MIN_PHOTOS/.test(src.coque) && /m\.t\("ctaAddAtLeastOnePhoto"\)/.test(src.coque) && !/at least 1 photo|au moins 1 photo/i.test(src.coque),
      'la coque appelle la règle pure sur les vraies photos et lit le libellé dans les traductions ; elle ne compare elle-même aucun nombre de photos');
    ok(/const displayPreviews\s*=\s*photosDuStepper\(\s*pickedPreviews\s*,\s*photos\s*\)\s*;/.test(src.moteur) && /const photoCount\s*=\s*displayPreviews\.length\s*;/.test(src.moteur),
      'le moteur compte par la fonction pure (photosDuStepper) — celle que le moteur factice appelle');
    const objet = src.moteur.slice(src.moteur.indexOf('const moteur = {'), src.moteur.indexOf('pilote?.surMoteur?.('));
    const fois = (mot) => objet.split(mot).length - 1;
    ok(objet.length > 2000 && fois('photoCount') === 1 && /[,{\s]photoCount\s*,/.test(objet) && fois('displayPreviews') === 1 && /[,{\s]displayPreviews\s*,/.test(objet),
      'le moteur tend à la coque photoCount et displayPreviews tels quels, une seule fois (jamais une valeur recalculée)', `photoCount × ${fois('photoCount')}, displayPreviews × ${fois('displayPreviews')}`);
    ok(fois('photosDeRemplissage') === 1 && /[,{\s]photosDeRemplissage\s*,/.test(objet) && fois('MIN_PHOTOS') === 1 && !/premierePhotoVide/.test(src.moteur),
      'il tend aussi photosDeRemplissage (tel quel, une fois) et MIN_PHOTOS (le texte de « Où publier ? » le lit)', `photosDeRemplissage × ${fois('photosDeRemplissage')}`);
    ok(/import \{ useImagesParDefaut, reconnaitreAuClic, signalerUneFois, prelireImagesParDefaut \} from "\.\.\/publication\/lot\/photoVide";/.test(src.moteur)
      && /const photosDeRemplissage\s*=\s*useImagesParDefaut\(\s*urlsPhotos\(displayPreviews\)\s*,\s*\{\s*quandDouteuse:\s*signalerPhotoDouteuse\s*\}\s*\)\s*;/.test(src.moteur)
      && !/useImagesParDefaut\([^)]*processedPhotos/.test(src.moteur) && !/usePhotosVides|lirePhotoVide/.test(src.moteur + src.ecranLot + src.verifier),
      'EN ARRIÈRE-PLAN, seulement ce que le bouton demande : les photos montrées, en cascade (useImagesParDefaut) — plus de lecture complète de toutes les photos');
    const signal = src.moteur.slice(src.moteur.indexOf('const signalerPhotoDouteuse = useCallback('), src.moteur.indexOf('const photosDeRemplissage = useImagesParDefaut('));
    ok(signal.length > 100 && /signalerUneFois\(url,/.test(signal) && /from\("usage_logs"\)/.test(signal)
      && /\.insert\(\{ user_id: userId, feature: "photo_par_defaut_douteuse", metadata: \{ inventaire_id: invId \?\? null, photo: url \} \}\)/.test(signal),
      'le SIGNALEMENT d’une photo douteuse : usage_logs « photo_par_defaut_douteuse », le compte, la fiche et l’adresse de la photo — rien de plus, une fois par photo et par session');
    const appel = src.moteur.slice(src.moteur.indexOf('const imagesParDefautReconnues = await reconnaitreAuClic('), src.moteur.indexOf('for (const ligne of construction.journal)'));
    ok(appel.length > 200 && /const construction = construireJobs\(\{/.test(appel) && /photosDeRemplissage:\s*imagesParDefautReconnues\b/.test(appel) && /photosDOrigine:\s*photos\b/.test(appel)
      && /const refusConstruction = refusDeConstruction\(construction, \{ lang, t, nomPlateforme: \(p\) => PLATFORM_LABELS\[p\] \?\? p \}\);\s*if \(refusConstruction\) throw new Error\(refusConstruction\);/.test(appel)
      && !/construction\.erreur/.test(appel),
      'AU CLIC Publier (unité et lot) : la reconnaissance de toutes les photos, la tâche construite avec les images reconnues, puis TOUT refus de la construction arrête le clic (refusDeConstruction, exécutée plus bas)');
    // Le refus d'une construction, EXÉCUTÉ (moteur/regles.js, refusDeConstruction) : ce qui arrête le clic, mot pour mot.
    const refus = fn(MR, 'refusDeConstruction');
    const tFr = (k) => I18N.translations.fr?.[k] ?? k, tEn = (k) => I18N.translations.en?.[k] ?? k;
    const nom = (p) => NOMS[p] ?? p;
    ok(Boolean(refus) && refus({ rows: null, erreur: 'sans_vraie_photo' }, { lang: 'fr', t: tFr, nomPlateforme: nom }) === PHRASE_VRAIE_PHOTO.fr
      && refus({ rows: null, erreur: 'sans_vraie_photo' }, { lang: 'en', t: tEn, nomPlateforme: nom }) === PHRASE_VRAIE_PHOTO.en,
      'PLUS AUCUNE VRAIE PHOTO (sans_vraie_photo) : le clic s’ARRÊTE sur la phrase de « Où publier ? » (français, anglais) — rien ne part, rien n’est décompté');
    ok(Boolean(refus) && refus({ rows: null, erreur: 'ebay_sans_photo' }, { lang: 'fr', t: tFr, nomPlateforme: nom }) === 'eBay : cet article n\'a aucune photo. eBay exige au moins une image — ajoute une photo avant de publier.'
      && refus({ rows: null, erreur: 'ebay_sans_photo' }, { lang: 'en', t: tEn, nomPlateforme: nom }) === 'eBay: this item has no photo. eBay requires at least one image — add a photo before publishing.'
      && refus({ rows: null, erreur: 'sans_titre', plateforme: 'ebay' }, { lang: 'fr', t: tFr, nomPlateforme: nom }) === 'eBay : cette annonce n\'a pas de titre. Écris-le dans le champ « Titre », puis publie à nouveau. Rien n\'a été décompté.'
      && refus({ rows: null, erreur: 'sans_titre', plateforme: 'depop' }, { lang: 'en', t: tEn, nomPlateforme: nom }) === 'Depop: this listing has no title. Write one in the “Title” field, then publish again. Nothing was charged.',
      'eBay sans photo, annonce sans titre : les mêmes messages qu’avant, mot pour mot');
    ok(Boolean(refus) && refus({ rows: [], erreur: null }, { t: tFr }) === null && refus(null) === null && refus({ rows: [] }) === null,
      'une construction sans refus : rien n’arrête le clic');
    ok(/platform_fields: \{ \.\.\.\(suivant\[row\.platform\]\.platform_fields \?\? \{\}\), \.\.\.\(sansMarquesDuRetrait\(row\.platform_fields\) \?\? \{\}\) \}/.test(src.moteur),
      'la fusion de la catégorie résolue dans la carte ne recopie jamais les marques d’un retrait (sansMarquesDuRetrait)');
    let gestes = null;
    try { gestes = ['handleNextNouveau', 'handleNext', 'handleUpload'].map((nom) => ({ nom, corps: extraireFonctionJs(src.moteur, nom) })); } catch (e) { gestes = String(e?.message ?? e); }
    ok(Array.isArray(gestes) && gestes.every((g) => g.corps.length > 100 && !COMPTE_COMPARE.test(g.corps) && !/MIN_PHOTOS/.test(g.corps)),
      'les gestes du bouton (handleNextNouveau, handleNext, handleUpload) ne comparent aucun nombre de photos à un chiffre',
      Array.isArray(gestes) ? gestes.filter((g) => COMPTE_COMPARE.test(g.corps) || /MIN_PHOTOS/.test(g.corps)).map((g) => g.nom).join(', ') : gestes);
    ok(/vraiesPhotos\(/.test(src.verifier) && /m\.photosDeRemplissage/.test(src.verifier) && !/usePhotoVide\(|useImagesParDefaut\(/.test(src.verifier),
      '« Ce qui va partir » ne dit « Aucune vraie photo » que par la même règle (plus de lecture à part de la première photo)');
    const tous = [src.moteur, src.ecranLot, typeof src.vignette === 'string' ? src.vignette : '', src.verifier, src.ecran, src.coque, src.ficheArticle].join('\n');
    const utilisations = tous.split(/use(?:Lecture)?ImagesParDefaut\(/).length - 1;
    ok(utilisations === 3 && /useImagesParDefaut\(urlsPhotos\(displayPreviews\)/.test(src.moteur) && /useLectureImagesParDefaut\(urls\)/.test(String(src.vignette))
      && /useLectureImagesParDefaut\(originesAlignees\)/.test(String(src.vignette))
      && /return lireEnArrierePlan\(cle\.split\("\\n"\), \{/.test(src.lecture) && /lecturesALancer\(liste, verdict, \{ enCascade: true \}\)/.test(src.lecture),
      'la lecture en arrière-plan n’existe qu’en deux endroits (le moteur ; la vignette du lot, ses photos et leurs origines), toujours en cascade (son corps, lireEnArrierePlan, est exécuté en H)', `${utilisations} appel(s)`);
  }

  // ── C. Les textes ───────────────────────────────────────────────────────────────────────────────────────────
  console.log('C. Les textes');
  {
    const galerie = (n, lang) => {
      try {
        return texte(renderToStaticMarkup(h(GP.default, { previews: Array.from({ length: n }, (_, i) => `https://x/p${i + 1}.jpg`), onAdd: noop, onRemove: noop, onReorder: noop, lang })));
      } catch (e) { return `ERREUR ${e?.message ?? e}`; }
    };
    const g1 = [galerie(1, 'fr'), galerie(1, 'en')];
    const g2 = [galerie(2, 'fr'), galerie(2, 'en')];
    ok(g1.every((t) => t === ''), 'galerie à 1 photo : aucun texte sous la grille (plus de rappel « Ajoute au moins 3 photos pour continuer (1/3) »)', g1.join(' | '));
    ok(g2.every((t) => t.length > 0 && !/ERREUR/.test(t) && !/[2-9]/.test(t)), 'galerie à 2 photos : aucun chiffre de 2 à 9 (ni seuil, ni « (2/3) »)', g2.join(' | '));
    ok(!/MIN_PHOTOS|rappelMinimum/.test(src.galerie), 'la galerie ne porte plus ni MIN_PHOTOS ni le rappel du minimum');
    ok([src.ecran, src.stock, src.app, src.moteur].every((s) => !/rappelMinimum/.test(s)), 'aucun appelant ne passe plus « rappelMinimum »');
    const zeroFr = bouton({ n: 0 }).ecran;
    const zeroEn = bouton({ n: 0, lang: 'en' }).ecran;
    ok(/Jusqu'à 20 photos\. Au moins 1 pour rédiger l'annonce\./.test(zeroFr) && /Up to 20 photos\. At least 1 to write the listing\./.test(zeroEn),
      '« Où publier ? » sans photo : « Jusqu’à 20 photos. Au moins 1 pour rédiger l’annonce. » (et en anglais)', `${zeroFr.slice(0, 300)} | ${zeroEn.slice(0, 300)}`);
    const ecrans = [bouton({ n: 0 }), bouton({ n: 1 }), bouton({ n: 2 }), bouton({ origine: 'telephone', n: 1 }), bouton({ n: 1, lang: 'en' }), bouton({ n: 0, fiche: true })].map((r) => r.ecran);
    ok(ecrans.every((t) => t.length > 200 && !/\b[3-9] photos\b|au moins [2-9]|at least [2-9]/i.test(t)), '« Où publier ? » à 0, 1 ou 2 photos : l’écran ne demande nulle part plus d’une photo');
    ok(!/Il en faudra|You'll need/.test(src.stock) && !/\bMIN_PHOTOS\b/.test(src.stock),
      'ajout manuel au Stock : plus de « Il en faudra 3 pour le publier sur Vinted »');
    ok([src.coque, src.ecran, src.moteur, src.galerie, src.stock, src.app].every((s) => !/(au moins|at least) \$\{(m\.)?MIN_PHOTOS\} photos/i.test(s)),
      'aucune source de l’app n’écrit plus « au moins ${MIN_PHOTOS} photos »');
    ok(I18N.translations?.fr?.ouPublierVraiePhoto === PHRASE_VRAIE_PHOTO.fr && I18N.translations?.en?.ouPublierVraiePhoto === PHRASE_VRAIE_PHOTO.en
      && /m\.t\("ouPublierVraiePhoto"\)/.test(src.ecran) && !Object.values(PHRASE_VRAIE_PHOTO).some((p) => [src.ecran, src.coque, src.moteur].some((s) => s.includes(p))),
      'la phrase neuve vit dans les traductions de l’app (clé ouPublierVraiePhoto, français et anglais) ; l’écran la lit, il ne l’écrit pas');
    // « L'image vient de Beebs » : seulement pour l'image par défaut de Beebs reconnue à l'identique.
    const de = fn(PV, 'imageParDefautDe');
    ok(Boolean(de) && de('beebs', [A1, VIDE]) === true && de('beebs', [BEEBS]) === true && de('beebs', [PETITE_NB]) === false && de('beebs', [A1, ILLISIBLE]) === false && de('vinted', [VIDE]) === false,
      'imageParDefautDe : vrai pour l’image par défaut de Beebs reconnue (adresse ou octets), faux pour une photo douteuse, illisible, ou une autre plateforme');
    const phraseFiche = src.ficheArticle.slice(src.ficheArticle.indexOf('{photoVide && ('), src.ficheArticle.indexOf('<div className="fsf-photos"'));
    const noteLot = src.ecranLot.slice(src.ecranLot.indexOf('{!pret && d.photoVide && ('), src.ecranLot.indexOf('{!pret && qs.slice(0, 3)'));
    ok(/imageParDefautDe\("beebs", \[/.test(phraseFiche) && phraseFiche.indexOf('imageParDefautDe("beebs"') < phraseFiche.indexOf('L\'image est celle que Beebs affiche')
      && /imageParDefautDe\("beebs", \[/.test(noteLot) && noteLot.indexOf('imageParDefautDe("beebs"') < noteLot.indexOf('l\'image vient de Beebs'),
      'la fiche de l’article (« L’image est celle que Beebs affiche… ») et la ligne du lot (« l’image vient de Beebs ») ne nomment Beebs que pour son image reconnue à l’identique');
  }

  // ── D. L'ancienne peau du stepper ───────────────────────────────────────────────────────────────────────────
  console.log('D. L’ancienne peau (ListingPreviewScreen), lue dans le source : la même règle');
  {
    const gris = src.moteur.slice(src.moteur.indexOf('const ctaDisabled ='), src.moteur.indexOf('function handleNext()'));
    ok(gris.length > 100 && /step === 0[^\n]*photosManquent\w*\(/.test(gris) && /step === 1[^\n]*photosManquent\w*\(/.test(gris) && !COMPTE_COMPARE.test(gris) && !/MIN_PHOTOS/.test(gris),
      'bouton gris aux étapes 0 et 1 : par la règle, sans aucun nombre de photos comparé à un chiffre', gris.slice(0, 300));
    const mots = src.moteur.slice(src.moteur.indexOf('function ctaLabel()'), src.moteur.indexOf('if (step === 2)', src.moteur.indexOf('function ctaLabel()')));
    ok(mots.length > 100 && mots.split(/photosManquent\w*\(/).length - 1 === 2 && mots.split('t("ctaAddAtLeastOnePhoto")').length - 1 === 2
      && !COMPTE_COMPARE.test(mots) && !/MIN_PHOTOS/.test(mots) && !/minPhotosLabel/.test(src.moteur),
      'libellé aux étapes 0 et 1 : la clé d’avant le 14/07 (ctaAddAtLeastOnePhoto), par la règle ; « minPhotosLabel » a disparu', mots.slice(0, 300));
    ok(/photosManquentPourPublier\(\s*vraiesPhotos\(\s*liste\s*,\s*photosDeRemplissage\s*\)\.length\s*\)/.test(src.moteur),
      'la règle de l’ancienne peau est la règle pure, sur les vraies photos — comme la nouvelle');
    ok(I18N.translations?.fr?.ctaAddAtLeastOnePhoto === LIBELLE_PHOTO.fr && I18N.translations?.en?.ctaAddAtLeastOnePhoto === LIBELLE_PHOTO.en,
      'ctaAddAtLeastOnePhoto : « Ajoute au moins 1 photo » / « Add at least 1 photo » — le libellé de la nouvelle peau, mot pour mot');
  }

  // ── E. Les garde-fous de la décision ────────────────────────────────────────────────────────────────────────
  console.log('E. Garde-fous : le lot, le serveur, la lecture d’origine, la recopie de l’extension');
  {
    const article = (photos) => ({ id: 1, title: 'Carte postale ancienne', statut: 'stock', photos });
    const une = R.articleSelectionnable(article(['https://x/1.jpg']), [], CINQ);
    const deux = R.articleSelectionnable(article([{ url: 'https://x/1.jpg' }, { url: 'https://x/2.jpg' }]), [], CINQ);
    const zero = R.articleSelectionnable(article([]), [], CINQ);
    const zeroEn = R.articleSelectionnable(article(null), [], CINQ, 'en');
    ok(une.ok === true && deux.ok === true && zero.ok === false && zero.raison === 'Sans photo' && zeroEn.ok === false && zeroEn.raison === 'No photo',
      'le lot (articleSelectionnable, exécutée) : 1 ou 2 photos → sélectionnable ; 0 → « Sans photo » — inchangé', JSON.stringify({ une, deux, zero, zeroEn }));
    ok(/if \(!photosDe\(item\)\.length\) return \{ ok: false, raison: en \? "No photo" : "Sans photo" \};/.test(src.lot) && !/MIN_PHOTOS/.test(src.lot),
      'le lot ne lit pas MIN_PHOTOS : sa règle de sélection est la sienne, intouchée');
    ok(F.estPhotoDeRemplissage({ largeur: 200, hauteur: 200, couleurs: 30 }) === true && F.estPhotoDeRemplissage({ largeur: 140, hauteur: 70, couleurs: 67 }) === false
      && F.estPhotoDeRemplissage({ largeur: 1200, hauteur: 1200, couleurs: 20 }) === false && F.estPhotoDeRemplissage({}) === false,
      'l’estimation est celle du lot, inchangée (estPhotoDeRemplissage : petite ET presque sans couleurs) — elle ne sert plus qu’à SIGNALER');
    ok(!/estPhotoDeRemplissage/.test(src.moteur + src.ecranLot + src.regle + lire('src/publication/moteur/regles.js'))
      && /finir\(estPhotoDeRemplissage\(/.test(src.lecture) && /export function estimerPhoto\(/.test(src.lecture),
      'l’estimation ne nourrit que estimerPhoto (le signalement) : ni le moteur, ni le lot, ni la règle, ni la tâche ne la lisent');
    // Le lot : un article SANS vraie photo attend (motif « Photo ») ; avec une vraie photo, il est prêt.
    const prepare = { preparationAuRepos: true, nbQuestions: 0, price: 12, ctaDisabled: false, texteVendeur: { titre: 'Carte postale ancienne', description: 'Carte de Lyon, 1908' },
      plateformesPubliables: new Set(['vinted', 'ebay']), jumeaux: [], initialListing: { poids_g: 20 } };
    const sansVraie = essai(() => R.bilanArticle(prepare, { photoVide: true }));
    const avecVraie = essai(() => R.bilanArticle(prepare, { photoVide: false }));
    ok(sansVraie.pret === false && sansVraie.motifs?.some((x) => x.cle === 'photo') && avecVraie.pret === true && avecVraie.motifs?.length === 0,
      'le lot (bilanArticle, exécutée) : aucune vraie photo → l’article attend (motif « Photo ») ; une vraie photo → prêt', JSON.stringify({ sansVraie, avecVraie }));
    // Sa vignette : MONTÉE en H (effets compris, la mémoire de la session remise à zéro avant) ; ici, ce qui la relie au lot.
    const vignetteSrc = typeof src.vignette === 'string' ? src.vignette : '';
    ok(vignetteSrc.length > 100 && /useLectureImagesParDefaut\(urls\)/.test(vignetteSrc) && /vraiesPhotos\(urls, reconnues, originesAlignees\.length \? originesAlignees : null\)/.test(vignetteSrc)
      && /origines=\{m\?\.photos \?\? null\}/.test(src.ecranLot)
      && /import VignetteLot from "\.\/VignetteLot";/.test(src.ecranLot) && !/function VignetteLot\(/.test(src.ecranLot) && !/usePhotoVide\(|usePhotosVides\(|useImagesParDefaut\(/.test(src.ecranLot),
      'la vignette du lot (un module à elle, MONTÉE en H) décide par la même règle (vraiesPhotos), en lisant en cascade ; le lot envoie par le même moteur (construireJobs, F)');
    ok(/const vide = !url;/.test(vignetteSrc) && /if \(onVide && conclue\) onVide\(vide\);/.test(vignetteSrc) && /signalerVide\(id, v\)/.test(src.ecranLot) && /decider\(id, \{ photoVide: Boolean\(vide\) \}\)/.test(src.ecranLot),
      'ce que la vignette CONCLUT (aucune vraie photo) est ce que le lot retient pour l’article (decisions.photoVide → motif « Photo ») ; une vraie photo l’en sort');
    ok(/if \(decisions\.photoVide === true\) \{\s*motifs\.push\(\{ cle: "photo"/.test(src.lot), 'la règle du lot (bilanArticle) n’a pas bougé : seul ce qui la nourrit compte désormais les vraies photos');
    ok(/!Array\.isArray\(photos\) \|\| photos\.length === 0 \|\|/.test(src.serveur) && !/photos?\w*(?:\.length)?\s*(?:<=?|>=?|={2,3}|!==?)\s*[1-9]/i.test(src.serveur),
      'le serveur (generate-listing, source du dépôt) ne refuse que 0 photo : aucun nombre de photos comparé à un chiffre de 1 à 9');

    // L'attente de lecture de l'annonce d'origine après un import (_shared/contenu-fiche.js, la règle de l'app et
    // du serveur) : intacte. Elle porte sa propre condition de photos (1 ou moins), qui n'est pas celle du bouton.
    const maintenant = Date.parse('2026-11-11T12:00:00Z');
    const importEbay = { id: 101, origine: 'releve_ebay', description: 'Carte postale ancienne de Lyon, 1908', photos: ['https://i.ebayimg.com/images/g/photo1/s-l140.jpg'], attributs: { etat: { v: 'Bon état' } } };
    const jamaisLue = CF.lectureOrigineEnAttente(importEbay, [{ platform: 'ebay', capture_le: null, detail_le: null, photos_origine: null, disparu_le: null }], { maintenant });
    const lueUnePhoto = CF.lectureOrigineEnAttente(importEbay, [{ platform: 'ebay', detail_le: '2026-11-10T08:00:00Z', photos_origine: 1 }], { maintenant });
    const lueTroisPhotos = CF.lectureOrigineEnAttente(importEbay, [{ platform: 'ebay', detail_le: '2026-11-11T11:00:00Z', photos_origine: 3 }], { maintenant });
    ok(jamaisLue?.plateforme === 'ebay' && jamaisLue.manque.join() === 'photos',
      'import eBay à 1 photo dont l’annonce d’origine n’est pas encore lue : on ATTEND sa lecture (photos), comme avant', JSON.stringify(jamaisLue));
    ok(lueUnePhoto === null, 'annonce d’origine lue, elle n’a qu’une photo : plus rien à attendre — l’article se publie à l’unité avec sa photo', JSON.stringify(lueUnePhoto));
    ok(lueTroisPhotos?.plateforme === 'ebay' && lueTroisPhotos.manque.join() === 'photos',
      'annonce d’origine lue depuis moins de 24 h, elle porte 3 photos que la fiche n’a pas encore : on ATTEND les photos, comme avant', JSON.stringify(lueTroisPhotos));

    // La recopie de la photo pour Vinted (articles haut de gamme) : uploadPhotos de l'extension, exécutée jusqu'au
    // téléversement (les fichiers demandés), arrêtée au premier accès à la page.
    let recopie = null;
    try {
      const min = Number(/const VINTED_MIN_PHOTOS = (\d+);/.exec(src.vinted)?.[1]);
      const corps = extraireFonctionJs(src.vinted, 'uploadPhotos');
      const demandees = async (photos) => {
        const vues = [];
        const f = new Function('VINTED_MIN_PHOTOS', 'urlToFile', 'waitForKey', 'console', `${corps}\nreturn uploadPhotos;`)(
          min, async (url) => { vues.push(url); return {}; }, async () => { throw new Error('arrêt du selftest'); }, { warn: noop, log: noop, error: noop });
        try { await f(photos); } catch { /* arrêt voulu : la page n'existe pas ici */ }
        return vues.join(',');
      };
      recopie = { min, une: await demandees([{ url: 'a' }]), deux: await demandees([{ url: 'a' }, { url: 'b' }]), trois: await demandees([{ url: 'a' }, { url: 'b' }, { url: 'c' }]), zero: await demandees([]) };
    } catch (e) { recopie = { erreur: String(e?.message ?? e) }; }
    ok(recopie.min === 3 && recopie.une === 'a,a,a' && recopie.deux === 'a,b,b' && recopie.trois === 'a,b,c' && recopie.zero === '',
      'l’extension recopie toujours la dernière photo jusqu’à 3 pour Vinted (1 → a,a,a ; 2 → a,b,b ; 3 → inchangé)', JSON.stringify(recopie));
  }

  // ── F. La liste des photos écrite dans la tâche ─────────────────────────────────────────────────────────────
  // reconnaitreAuClic puis construireJobs (moteur/regles.js) : ce que le moteur fait au clic « Publier », à l'unité
  // comme dans le lot. `vides` : les adresses reconnues (ce que le moteur passe), lues ici par la vraie lecture au clic.
  console.log('F. La tâche (reconnaitreAuClic puis construireJobs, exécutées) : l’image par défaut connue n’est jamais envoyée');
  const delaisDuMoteur = PV.DELAIS ? { ...PV.DELAIS } : null;
  if (PV.DELAIS) { PV.DELAIS.auClicMs = 150; PV.DELAIS.lectureMs = 300; }
  const construire = ({ processedPhotos, vides, origines, edited = {}, lbcCategoryPath = ['Mode', 'Vêtements'], plateformes = CINQ, champs = null }) => essai(() => {
    const champsResolus = champs ?? Object.fromEntries(plateformes.map((p) => [p, p === 'leboncoin' ? { lbcCategoryPath } : {}]));
    const ed = Object.fromEntries(plateformes.map((p) => [p, { title: 'Carte postale ancienne', description: 'Carte de Lyon.', price: 12, ...(edited[p] ?? {}) }]));
    return MR.construireJobs({
      plateformes, champsResolus, processedPhotos, userId: 'u', inventaireId: 101, photoOption: 'original', edited: ed, price: 12,
      outils: { entreesPhotos: P.entreesPhotos, getLbcFreePhotoQuota: LBC.getLbcFreePhotoQuota, normalizeVintedTitle: (t) => t },
      ...(vides !== undefined ? { photosDeRemplissage: vides } : {}), ...(origines !== undefined ? { photosDOrigine: origines } : {}),
    });
  });
  // Le clic, de bout en bout : la lecture au clic de TOUTES les photos, puis la tâche.
  const auClicPuisTache = async (photos, o = {}) => {
    const vides = await lireAuClic(P.urlsPhotos(photos));
    return { vides, ...construire({ processedPhotos: photos, vides, ...o }) };
  };
  const adresses = (r) => (r?.photos ?? []).map((p) => p?.url);
  // Marquée par un retrait : photos_choisies et le compte — JAMAIS lbcPhotosCapped (décision de Nico du 11/11 : la fiche
  // prend les photos envoyées). Ces cas sont hors de tout plafond Leboncoin (Mode > Vêtements).
  const marquee = (r, n) => r?.platform_fields?.photos_choisies === true && !('lbcPhotosCapped' in r.platform_fields) && r.platform_fields.photosRemplissageRetirees === n;
  const nonMarquee = (r) => Boolean(r) && !('photos_choisies' in r.platform_fields) && !('lbcPhotosCapped' in r.platform_fields) && !('photosRemplissageRetirees' in r.platform_fields);
  {
    // Un article SANS image par défaut connue : exactement la liste d'aujourd'hui.
    const trois = [A1, B1, C1];
    const attendu = [{ type: 'original', url: A1 }, { type: 'photo_1', url: B1 }, { type: 'photo_2', url: C1 }];
    const sans = construire({ processedPhotos: trois });
    const sansVide = construire({ processedPhotos: trois, vides: [] });
    const sansAutre = construire({ processedPhotos: trois, vides: [VIDE, VIDE2], origines: trois });
    const sansClic = await auClicPuisTache(trois);
    ok(sans.rows?.length === 5 && sans.rows.every((r) => egal(r.photos, attendu) && nonMarquee(r)), 'aucune image par défaut : chaque tâche porte les 3 photos, dans l’ordre, mêmes adresses, rien de marqué', JSON.stringify(sans.rows?.[0]?.photos ?? sans));
    ok(egal(sansVide, sans) && egal(sansAutre, sans) && sansClic.vides?.length === 0 && egal(sansClic.rows, sans.rows),
      '… et la lecture au clic (rien de reconnu), une liste vide ou les images d’un autre article n’y changent rien : les tâches sont identiques, champ pour champ');
    const objets = trois.map((url, i) => ({ type: i ? `photo_${i}` : 'original', url }));
    const sansObjets = construire({ processedPhotos: objets, vides: [VIDE] });
    ok(egal(sansObjets, construire({ processedPhotos: objets })) && sansObjets.rows?.every((r) => egal(r.photos, objets)), 'pareil quand la rédaction a rendu des objets { type, url }');
    const plafonneSans = construire({ processedPhotos: [A1, B1, C1, D1], lbcCategoryPath: ['Divers', 'Autres'], vides: [VIDE] });
    const choisieSans = construire({ processedPhotos: trois, edited: { beebs: { photos: [C1, A1] } }, vides: [VIDE] });
    ok(egal(plafonneSans, construire({ processedPhotos: [A1, B1, C1, D1], lbcCategoryPath: ['Divers', 'Autres'] })) && egal(adresses(plafonneSans.rows?.find((r) => r.platform === 'leboncoin')), [A1, B1, C1])
      && egal(choisieSans, construire({ processedPhotos: trois, edited: { beebs: { photos: [C1, A1] } } })) && egal(adresses(choisieSans.rows?.find((r) => r.platform === 'beebs')), [C1, A1]),
      'pareil pour un dépôt Leboncoin plafonné (3 photos gratuites) et pour des photos choisies sur une carte : rien ne bouge');

    // (choix b) La petite photo noir et blanc RÉELLE reste dans la tâche — elle est signalée (A bis), jamais retirée.
    const nb = await auClicPuisTache([PETITE_NB, A1]);
    const nbSeule = await auClicPuisTache([PETITE_NB]);
    ok(nb.vides?.length === 0 && nb.rows?.every((r) => egal(adresses(r), [PETITE_NB, A1]) && nonMarquee(r)) && nbSeule.rows?.every((r) => egal(adresses(r), [PETITE_NB])),
      'une PETITE PHOTO NOIR ET BLANC réelle (≤ 256 px, niveaux de gris, douteuse pour l’estimation) : elle RESTE dans la tâche, seule ou non, rien de marqué', JSON.stringify([nb.vides, adresses(nb.rows?.[0]), adresses(nbSeule.rows?.[0])]));

    // L'image par défaut connue n'est jamais envoyée, quelle que soit sa place.
    const premiere = await auClicPuisTache([VIDE, A1]);
    ok(premiere.rows?.length === 5 && premiere.rows.every((r) => egal(r.photos, [{ type: 'original', url: A1 }]) && marquee(r, 1)),
      'image par défaut reconnue en 1re position + une vraie photo : chaque tâche ne porte QUE la vraie photo (elle devient la couverture)', JSON.stringify(premiere.rows?.[0] ?? premiere).slice(0, 400));
    const deuxieme = await auClicPuisTache([A1, VIDE, B1]);
    const derniere = await auClicPuisTache([A1, B1, BEEBS]);
    ok(deuxieme.rows?.every((r) => egal(adresses(r), [A1, B1]) && marquee(r, 1)) && derniere.rows?.every((r) => egal(adresses(r), [A1, B1]) && marquee(r, 1)),
      'en 2e position (sa copie chez nous) ou en dernière (son adresse chez Beebs) : retirée de chaque tâche, l’ordre des vraies photos gardé', JSON.stringify([adresses(deuxieme.rows?.[0]), adresses(derniere.rows?.[0])]));
    const plusieurs = await auClicPuisTache([VIDE, A1, VIDE2, B1]);
    ok(plusieurs.rows?.every((r) => egal(adresses(r), [A1, B1]) && marquee(r, 2)), 'deux images par défaut parmi de vraies photos : les deux retirées', JSON.stringify(adresses(plusieurs.rows?.[0])));
    ok(premiere.rows?.every((r) => r.platform_fields.photos_choisies === true && !('lbcPhotosCapped' in r.platform_fields)),
      'la tâche porte photos_choisies (le serveur ne la complète jamais avec les photos de la fiche) et PAS lbcPhotosCapped : la fiche prendra les photos envoyées (G bis)');
    const objetsVide = await auClicPuisTache([{ type: 'original', url: VIDE }, { type: 'photo_1', url: A1 }]);
    const typesEtAdresses = (r) => (r?.photos ?? []).map((p) => `${p?.type} ${p?.url}`);
    ok(objetsVide.rows?.every((r) => egal(typesEtAdresses(r), [`original ${A1}`])),
      'pareil quand la rédaction a rendu des objets { type, url } — et la nouvelle couverture est « original », plus « photo_1 » (types recalculés)', JSON.stringify(objetsVide.rows?.[0]?.photos));
    const troisObjets = await auClicPuisTache([{ type: 'original', url: A1 }, { type: 'photo_1', url: VIDE }, { type: 'photo_2', url: B1 }]);
    ok(troisObjets.rows?.every((r) => egal(typesEtAdresses(r), [`original ${A1}`, `photo_1 ${B1}`])),
      'image par défaut au milieu : les photos d’après reprennent leur rang (photo_2 → photo_1)', JSON.stringify(troisObjets.rows?.[0]?.photos));
    const retouchee = construire({ processedPhotos: [{ type: 'original', url: 'https://x/enhanced/9_0.png' }, { type: 'photo_1', url: A1 }], vides: await lireAuClic([VIDE, A1]), origines: [VIDE, A1] });
    ok(retouchee.rows?.every((r) => egal(adresses(r), [A1])), 'la version retouchée d’une image par défaut reconnue n’est pas envoyée non plus', JSON.stringify(retouchee.rows?.[0]?.photos));
    const choisie = await auClicPuisTache([VIDE, A1, B1], { edited: { beebs: { photos: [VIDE, B1] } } });
    ok(egal(adresses(choisie.rows?.find((r) => r.platform === 'beebs')), [B1]) && choisie.rows?.filter((r) => r.platform !== 'beebs').every((r) => egal(adresses(r), [A1, B1])),
      'même choisie à la main sur la carte d’une plateforme, elle ne part pas', JSON.stringify(adresses(choisie.rows?.find((r) => r.platform === 'beebs'))));
    const plafonne = await auClicPuisTache([VIDE, A1, B1, C1, D1], { lbcCategoryPath: ['Divers', 'Autres'] });
    ok(egal(adresses(plafonne.rows?.find((r) => r.platform === 'leboncoin')), [A1, B1, C1]), 'Leboncoin plafonné : ses 3 photos gratuites sont les 3 premières VRAIES photos', JSON.stringify(adresses(plafonne.rows?.find((r) => r.platform === 'leboncoin'))));

    // Plus aucune vraie photo : rien ne part.
    const seule = await auClicPuisTache([VIDE]);
    const deuxVides = await auClicPuisTache([VIDE, BEEBS]);
    ok(seule.rows === null && seule.erreur === 'sans_vraie_photo' && deuxVides.rows === null && deuxVides.erreur === 'sans_vraie_photo',
      'une ou deux images par défaut et rien d’autre : AUCUNE tâche (erreur « sans_vraie_photo », la phrase de « Où publier ? ») — jamais une annonce sans photo, jamais l’image par défaut', JSON.stringify({ seule, deuxVides }).slice(0, 300));
    // Jamais retirée sur un doute.
    const pasLue = construire({ processedPhotos: [VIDE, A1], vides: [] });
    const illisible = await auClicPuisTache([ILLISIBLE, A1]);
    SERVEUR.set(P_('trop-lente'), { lente: true });
    const lente = await auClicPuisTache([P_('trop-lente'), A1]);
    ok(pasLue.rows?.every((r) => egal(adresses(r), [VIDE, A1]) && nonMarquee(r)) && illisible.rows?.every((r) => egal(adresses(r), [ILLISIBLE, A1]) && nonMarquee(r))
      && lente.rows?.every((r) => egal(adresses(r), [P_('trop-lente'), A1]) && nonMarquee(r)),
      'image NON LUE (lecture pas faite, ou trop lente pour l’attente du clic) ou ILLISIBLE : elle part (jamais retirée sur un doute)',
      JSON.stringify([adresses(pasLue.rows?.[0]), adresses(illisible.rows?.[0]), adresses(lente.rows?.[0])]));
  }

  // ── G. Les marques d'un retrait, d'une publication à la suivante ────────────────────────────────────────────
  console.log('G. Les marques d’un retrait ne restent ni sur la carte ni dans la publication suivante');
  {
    const fusionner = (ed, rows, filtre) => {
      const suivant = { ...ed };
      for (const row of rows ?? []) {
        if (!suivant[row.platform]) continue;
        suivant[row.platform] = { ...suivant[row.platform], platform_fields: { ...(suivant[row.platform].platform_fields ?? {}), ...((filtre ? filtre(row.platform_fields) : row.platform_fields) ?? {}) } };
      }
      return suivant;
    };
    const sans = typeof MR.sansMarquesDuRetrait === 'function' ? MR.sansMarquesDuRetrait : null;
    const PF = ['vinted', 'leboncoin', 'beebs'];
    let ed = Object.fromEntries(PF.map((p) => [p, { title: 'Carte postale ancienne', description: 'Carte de Lyon.', price: 12, platform_fields: p === 'leboncoin' ? { lbcCategoryPath: ['Mode', 'Vêtements'] } : { categoryPath: ['A', 'B'] } }]));
    const champsDe = (e) => Object.fromEntries(PF.map((p) => [p, { ...e[p].platform_fields }]));
    // La lecture est vérifiée plus haut (A bis, F) : ici, l'image reconnue est donnée telle quelle à la tâche.
    const un = construire({ processedPhotos: [VIDE, A1, B1], vides: [VIDE], plateformes: PF, edited: ed, champs: champsDe(ed) });
    ok(un.rows?.every((r) => marquee(r, 1)), '1re publication (image par défaut retirée) : chaque tâche est marquée');
    // a) la fusion de l'app (sansMarquesDuRetrait) : la carte ne garde aucune marque.
    const carte = sans ? fusionner(ed, un.rows, sans) : fusionner(ed, un.rows);
    ok(Boolean(sans) && PF.every((p) => !['photos_choisies', 'lbcPhotosCapped', 'photosRemplissageRetirees'].some((k) => k in carte[p].platform_fields)),
      'la carte (edited, puis le brouillon fiches_annonce) ne garde AUCUNE des trois marques après la fusion', JSON.stringify(PF.map((p) => carte[p].platform_fields)));
    // b) une carte qui les porterait quand même (fusion brute, brouillon) : la publication suivante n'en garde aucune.
    const brute = fusionner(ed, un.rows);
    const deux = construire({ processedPhotos: [A1, B1], vides: [], plateformes: PF, edited: brute, champs: champsDe(brute) });
    const deuxPropre = construire({ processedPhotos: [A1, B1], vides: [], plateformes: PF, edited: carte, champs: champsDe(carte) });
    ok(deux.rows?.every((r) => nonMarquee(r) && egal(adresses(r), [A1, B1])) && deuxPropre.rows?.every((r) => nonMarquee(r)),
      '2e PUBLICATION du même article, l’image par défaut ôtée de la fiche : AUCUNE marque (ni photos_choisies, ni lbcPhotosCapped, ni photosRemplissageRetirees)',
      JSON.stringify(deux.rows?.map((r) => r.platform_fields)).slice(0, 400));
    // c) les marques d'AVANT (photos choisies sur la carte, plafond Leboncoin) ne sont pas touchées.
    const avecChoix = { ...brute, beebs: { ...brute.beebs, photos: [B1, A1] } };
    const trois = construire({ processedPhotos: [A1, B1], vides: [], plateformes: PF, edited: avecChoix, champs: champsDe(avecChoix) });
    const beebs = trois.rows?.find((r) => r.platform === 'beebs');
    ok(beebs?.platform_fields.photos_choisies === true && beebs.platform_fields.lbcPhotosCapped === true && !('photosRemplissageRetirees' in beebs.platform_fields) && egal(adresses(beebs), [B1, A1]),
      '… et des photos CHOISIES sur la carte gardent leurs marques (posées par leur règle, celle du 30/10)', JSON.stringify(beebs?.platform_fields));
    const lotE = { vinted: { title: 'T', description: 'D', price: 12, platform_fields: { categoryPath: ['A'], photos_choisies: true, lbcPhotosCapped: true } } };
    const avantT1 = construire({ processedPhotos: [A1, B1], vides: [], plateformes: ['vinted'], edited: lotE, champs: { vinted: { ...lotE.vinted.platform_fields } } });
    ok(avantT1.rows?.[0]?.platform_fields.photos_choisies === true && avantT1.rows[0].platform_fields.lbcPhotosCapped === true,
      'une carte d’AVANT le 11/11 (marques sans photosRemplissageRetirees) n’est pas touchée : ses marques passent comme avant');
    ok(Boolean(sans) && egal(sans({ a: 1, photos_choisies: true }), { a: 1, photos_choisies: true }) && egal(sans({ a: 1, photos_choisies: true, photosRemplissageRetirees: 2 }), { a: 1 })
      && egal(sans({ a: 1, photos_choisies: true, lbcPhotosCapped: true, photosRemplissageRetirees: 2 }), { a: 1, lbcPhotosCapped: true }),
      'sansMarquesDuRetrait : ôte les marques d’un retrait (photos_choisies, photosRemplissageRetirees — signées par ce dernier), jamais le lbcPhotosCapped d’un vrai plafond');
  }

  // ── G bis. La fiche après la publication (décision de Nico du 11/11 : « vraie photo seule ») ───────────────────
  // La règle du serveur (spend_coins_and_publish, migration 20261104000000 — la dernière qui le réécrit dans le dépôt) :
  // la fiche reçoit les photos de la tâche la plus LONGUE parmi celles qui ne sont pas plafonnées (lbcPhotosCapped).
  // Le SQL n'est pas exécuté ici : sa règle est lue dans la migration (contrôle ci-dessous) et rejouée telle quelle.
  console.log('G bis. La fiche après la publication : elle prend les photos ENVOYÉES (les vraies seulement)');
  {
    const migration = essai(() => lire('supabase/migrations/20261104000000_trois_jauges_interrupteur.sql'));
    ok(typeof migration === 'string' && /COALESCE\(j->'platform_fields'->'lbcPhotosCapped' = 'true'::jsonb, false\) AS plafonne/.test(migration)
      && /AND NOT plafonne/.test(migration) && /ORDER BY inv_id, jsonb_array_length\(photos\) DESC/.test(migration),
      'la règle du serveur, lue dans sa migration : une tâche plafonnée (lbcPhotosCapped) ne réécrit jamais la fiche ; sinon la liste la plus longue l’emporte');
    const ficheApres = (rows, ficheAvant) => {
      const candidates = (rows ?? []).filter((r) => Array.isArray(r.photos) && r.photos.length && r.platform_fields?.lbcPhotosCapped !== true);
      if (!candidates.length) return ficheAvant;
      return [...candidates].sort((a, b) => b.photos.length - a.photos.length)[0].photos.map((p) => p.url);
    };
    const R_ = P_('r-ajoutee');
    SERVEUR.set(R_, GROSSE);
    // Fiche [D] (la copie de l'image par défaut), la personne AJOUTE R dans le stepper : photos = [D, R].
    const ajout = await auClicPuisTache([VIDE, R_]);
    ok(ajout.rows?.every((r) => egal(adresses(r), [R_])) && egal(ficheApres(ajout.rows, [VIDE]), [R_]),
      'fiche [D] + une vraie photo R ajoutée : les tâches partent avec [R] ET la fiche devient [R] (l’image par défaut quitte la fiche, R y arrive)',
      JSON.stringify({ taches: adresses(ajout.rows?.[0]), fiche: ficheApres(ajout.rows, [VIDE]) }));
    const deja = await auClicPuisTache([VIDE, A1, B1]);
    ok(deja.rows?.every((r) => egal(adresses(r), [A1, B1])) && egal(ficheApres(deja.rows, [VIDE, A1, B1]), [A1, B1]),
      'fiche [D, vraies photos] : les tâches partent avec les vraies, et la fiche devient les vraies seulement', JSON.stringify(ficheApres(deja.rows, [VIDE, A1, B1])));
    const normales = await auClicPuisTache([A1, B1, C1]);
    ok(egal(ficheApres(normales.rows, [A1, B1, C1]), [A1, B1, C1]) && normales.rows?.every((r) => !('lbcPhotosCapped' in r.platform_fields)),
      'fiche aux photos normales : la fiche inchangée (le serveur la réécrit avec la même liste, comme avant)');
    // Les deux causes ensemble : un VRAI plafond Leboncoin (Divers > Autres, 3 photos gratuites) et un retrait.
    const lbcEtVinted = await auClicPuisTache([VIDE, A1, B1, C1, D1], { lbcCategoryPath: ['Divers', 'Autres'], plateformes: ['vinted', 'leboncoin'] });
    const lbc = lbcEtVinted.rows?.find((r) => r.platform === 'leboncoin'), vinted = lbcEtVinted.rows?.find((r) => r.platform === 'vinted');
    ok(lbc?.platform_fields.lbcPhotosCapped === true && lbc.platform_fields.photos_choisies === true && lbc.platform_fields.photosRemplissageRetirees === 1 && egal(adresses(lbc), [A1, B1, C1])
      && !('lbcPhotosCapped' in vinted.platform_fields) && egal(ficheApres(lbcEtVinted.rows, [VIDE, A1, B1, C1, D1]), [A1, B1, C1, D1]),
      'retrait ET vrai plafond Leboncoin : la tâche Leboncoin garde SON lbcPhotosCapped (un extrait ne réécrit jamais la fiche) ; la tâche Vinted, entière, réécrit la fiche = les 4 vraies photos',
      JSON.stringify({ lbc: lbc?.platform_fields, fiche: ficheApres(lbcEtVinted.rows, [VIDE, A1, B1, C1, D1]) }));
    const lbcSeul = await auClicPuisTache([VIDE, A1, B1, C1, D1], { lbcCategoryPath: ['Divers', 'Autres'], plateformes: ['leboncoin'] });
    ok(egal(adresses(lbcSeul.rows?.[0]), [A1, B1, C1]) && egal(ficheApres(lbcSeul.rows, [VIDE, A1, B1, C1, D1]), [VIDE, A1, B1, C1, D1]),
      'Leboncoin plafonné SEUL : la tâche part sans l’image par défaut, mais la fiche n’est pas réécrite (un extrait de 3 photos ne remplace jamais la fiche, règle du 27/09) — l’image par défaut y reste, reconnue et retirée à chaque publication');
    // La republication de cette tâche (la règle de l'ordre, _shared/ordre-photos.js — jumeau de photos_ordre_article) :
    // photos_choisies → elle garde SES photos, jamais l'image par défaut, même si la fiche la portait encore.
    const OP = await charger('/supabase/functions/_shared/ordre-photos.js');
    const tache = ajout.rows?.find((r) => r.platform === 'vinted');
    const republiee = typeof OP.photosDansLOrdreDeLArticle === 'function' ? OP.photosDansLOrdreDeLArticle(tache?.photos, [VIDE, R_], tache?.platform_fields) : null;
    ok(Array.isArray(republiee) && egal(republiee.map((p) => p.url), [R_]),
      'sa republication (ordre de l’article) garde les photos de la tâche — les vraies, jamais l’image par défaut', JSON.stringify(republiee));
  }
  if (PV.DELAIS && delaisDuMoteur) Object.assign(PV.DELAIS, delaisDuMoteur);

  // ── H. Le crochet et la vignette du lot, MONTÉS ─────────────────────────────────────────────────────────────
  // Un second serveur Vite sert le React minimal (plus haut) à photoVide.js et à VignetteLot.jsx : rendus, états,
  // effets et démontage tournent POUR DE VRAI. Sa lecture a sa propre mémoire de session, remise à zéro
  // (oublierLaSession) avant chaque montage : ce que l'écran montre vient de SA lecture, jamais d'une lecture d'avant.
  console.log('H. Le crochet et la vignette du lot MONTÉS (un React minimal : rendus, états, effets, démontage)');
  const viteM = await createServer({
    root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
    plugins: [{ name: 'react-minimal', enforce: 'pre', resolveId: (s) => (s === 'virtual:react-minimal' ? '\0react-minimal' : null), load: (id) => (id === '\0react-minimal' ? REACT_MINIMAL : null) }],
    resolve: { alias: [{ find: /^react(\/jsx-(dev-)?runtime)?$/, replacement: 'virtual:react-minimal' }] },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const RM = await viteM.ssrLoadModule('virtual:react-minimal');
    const chargerM = async (p) => { try { return await viteM.ssrLoadModule(p); } catch (e) { console.log(`  (module ${p} illisible : ${String(e?.message ?? e).split('\n')[0]})`); return {}; } };
    const PVm = await chargerM('/src/publication/lot/photoVide.js');
    const VLm = await chargerM('/src/publication/lot/VignetteLot.jsx');
    const oublier = fn(PVm, 'oublierLaSession'), effet = fn(PVm, 'lireEnArrierePlan'), crochet = fn(PVm, 'useLectureImagesParDefaut');
    ok(Boolean(oublier) && Boolean(effet) && Boolean(crochet) && typeof VLm.default === 'function' && typeof RM.monter === 'function',
      'à monter : le crochet (useLectureImagesParDefaut), le corps de son effet (lireEnArrierePlan), la remise à zéro de la mémoire (oublierLaSession), la vignette (VignetteLot.jsx)');
    const appelsDe = (u) => reseau.appels.filter((x) => x === u).length;

    // Le CORPS DE L'EFFET, exécuté tel quel, avec la vraie lecture.
    oublier?.();
    const ev = [];
    const vAvant = appelsDe(VIDE), bAvant = appelsDe(B1);
    const stop = effet ? effet([VIDE, A1, B1], { quandReconnue: (u) => ev.push(`reconnue ${u === VIDE ? 'VIDE' : u}`), quandConclue: () => ev.push('conclue') }) : noop;
    await jusqua(() => ev.includes('conclue'));
    await pause(5);   // rien de plus ne doit être lu (B1)
    stop();
    ok(egal(ev, ['reconnue VIDE', 'conclue']) && appelsDe(VIDE) === vAvant + 1 && appelsDe(B1) === bAvant && Boolean(PVm.imageParDefautReconnue?.(VIDE)),
      'le corps de l’effet (lireEnArrierePlan), mémoire remise à zéro : il LIT (l’image par défaut, puis la vraie photo suivante, pas au-delà), reconnaît, conclut', JSON.stringify(ev));

    // LE CROCHET, monté.
    const Sonde = (p) => crochet(p.urls, p.options);
    const monterSonde = async (urls, options) => {
      oublier?.();
      const m = RM.monter(Sonde, { urls, options });
      const avant = m.sortie;
      await jusqua(() => m.sortie?.conclue === true);
      await pause(5);   // rien de plus ne doit arriver (ni lecture, ni rendu)
      const apres = m.sortie, rendus = m.rendus;
      m.demonter();
      return { avant, apres, rendus };
    };
    if (crochet && RM.monter) {
      const h1 = await monterSonde([VIDE, A1]);
      ok(h1.avant.reconnues.length === 0 && h1.avant.conclue === false && egal(h1.apres.reconnues, [VIDE]) && h1.apres.conclue === true && h1.rendus >= 2,
        'LE CROCHET MONTÉ lit en arrière-plan : au montage rien de reconnu, rien de conclu ; puis l’image par défaut reconnue, la lecture conclue, l’écran redessiné',
        JSON.stringify({ avant: h1.avant, apres: h1.apres, rendus: h1.rendus }));
      const aAvant = appelsDe(A1), b1Avant = appelsDe(B1);
      const h2 = await monterSonde([A1, B1]);
      ok(h2.apres.reconnues.length === 0 && h2.apres.conclue === true && h2.rendus === 2 && appelsDe(A1) === aAvant + 1 && appelsDe(B1) === b1Avant,
        'des photos normales : UNE lecture (la 1re), aucune reconnue, un seul nouveau rendu (la conclusion)', JSON.stringify({ apres: h2.apres, rendus: h2.rendus }));
      const signales = [];
      oublier?.();
      const m3 = RM.monter(Sonde, { urls: [PETITE_NB], options: { quandDouteuse: (u) => signales.push(u) } });
      await jusqua(() => signales.length > 0);
      await pause(5);
      m3.rerendre();   // l'écran se redessine pour une autre raison (le moteur le fait sans cesse)
      const h3 = { apres: m3.sortie };
      m3.demonter();
      ok(h3.apres.reconnues.length === 0 && egal(signales, [PETITE_NB]),
        'monté avec le signalement (le moteur) : la petite photo noir et blanc est SIGNALÉE, et reste non reconnue même au rendu suivant', JSON.stringify({ signales, apres: h3.apres }));
      // Démonté avant la fin : sa lecture s'arrête (la file se libère).
      const hLente = P_('h-lente');
      SERVEUR.set(hLente, { lente: true });
      oublier?.();
      const mL = RM.monter(Sonde, { urls: [hLente] });
      const lancee = await jusqua(() => reseau.appels.includes(hLente));
      const pasEncoreCoupee = !reseau.coupees.has(hLente);
      mL.demonter();
      const coupee = await jusqua(() => reseau.coupees.has(hLente));
      ok(lancee && pasEncoreCoupee && coupee, 'démonté pendant une lecture : la lecture est coupée (la file se libère quand l’écran se ferme)', JSON.stringify({ lancee, pasEncoreCoupee, coupee }));
    } else ok(false, 'LE CROCHET MONTÉ lit en arrière-plan');

    // LA VIGNETTE DU LOT, montée : ce qu'elle montre, et ce qu'elle dit au lot (onVide) — seulement une fois conclue.
    // `attendre` : ce qui dit que la lecture est faite (par défaut : le lot a appris quelque chose) ; quand RIEN ne doit
    // être dit au lot (lecture ratée), on attend que la lecture ait été tentée, puis un court délai.
    const vignetteMontee = async (photos, { en = false, origines = null, attendre = null } = {}) => {
      oublier?.();
      const dits = [];
      const m = RM.monter(VLm.default, { item: { id: 101, photos }, ...(origines ? { photos, origines } : {}), onVide: (v) => dits.push(v), en });
      const avant = { texte: texteDu(m.sortie), image: imageDu(m.sortie), dits: [...dits] };
      if (attendre) { await jusqua(attendre); await pause(15); } else await jusqua(() => dits.length > 0);
      await pause(5);
      const apres = { texte: texteDu(m.sortie), image: imageDu(m.sortie), dits: [...dits] };
      m.demonter();
      return { avant, apres };
    };
    if (typeof VLm.default === 'function' && RM.monter) {
      const vSeule = await vignetteMontee([VIDE]);
      ok(vSeule.avant.image === VIDE && !/Sans photo/.test(vSeule.avant.texte) && vSeule.avant.dits.length === 0
        && vSeule.apres.image === null && /Sans photo/.test(vSeule.apres.texte) && egal(vSeule.apres.dits, [true]),
        'vignette montée, la seule photo est la copie de l’image par défaut : au montage RIEN n’est dit au lot (pas encore lu) ; lue : « Sans photo », 📦, et le lot l’apprend (une fois)',
        JSON.stringify(vSeule));
      const vDeux = await vignetteMontee([VIDE, VIDE2]), vEn = await vignetteMontee([VIDE], { en: true }), vAdresse = await vignetteMontee([BEEBS]);
      ok(/Sans photo/.test(vDeux.apres.texte) && egal(vDeux.apres.dits, [true]) && /No photo/.test(vEn.apres.texte)
        && /Sans photo/.test(vAdresse.avant.texte) && egal(vAdresse.avant.dits, [true]),
        'deux images par défaut et rien d’autre : « Sans photo » ; en anglais « No photo » ; son ADRESSE chez Beebs : reconnue au montage, sans rien lire', JSON.stringify([vDeux.apres, vAdresse.avant]));
      const vPremiere = await vignetteMontee([VIDE, A1, B1]), vObjets = await vignetteMontee([{ url: VIDE }, { url: A1 }]), vDerniere = await vignetteMontee([A1, B1, VIDE]);
      ok(vPremiere.apres.image === A1 && !/Sans photo/.test(vPremiere.apres.texte) && egal(vPremiere.apres.dits, [false]) && vObjets.apres.image === A1
        && vDerniere.apres.image === A1 && !/Sans photo/.test(vDerniere.apres.texte) && egal(vDerniere.apres.dits, [false]),
        'image par défaut en 1re position + une vraie photo : la vignette montre la première VRAIE photo ; ailleurs : la vignette d’avant ; le lot apprend « une vraie photo »', JSON.stringify([vPremiere.apres, vDerniere.apres]));
      const tentee = (u) => { const avant = reseau.appels.filter((x) => x === u).length; return () => reseau.appels.filter((x) => x === u).length > avant; };
      const vDouteuse = await vignetteMontee([PETITE_NB]);
      const vIllisible = await vignetteMontee([ILLISIBLE], { attendre: tentee(ILLISIBLE) });
      const vPasLue = await vignetteMontee([P_('jamais-lue')], { attendre: tentee(P_('jamais-lue')) });
      ok(vDouteuse.apres.image === PETITE_NB && !/Sans photo/.test(vDouteuse.apres.texte) && egal(vDouteuse.apres.dits, [false])
        && vIllisible.apres.image === ILLISIBLE && vIllisible.apres.dits.length === 0 && vPasLue.apres.image === P_('jamais-lue') && vPasLue.apres.dits.length === 0,
        'petite photo noir et blanc (douteuse) : MONTRÉE ; image illisible : montrée, et RIEN n’est dit au lot (rien de conclu, comme avant le 11/11)', JSON.stringify([vDouteuse.apres, vIllisible.apres, vPasLue.apres]));
      const vRien = await vignetteMontee([]);
      ok(/Sans photo/.test(vRien.avant.texte) && egal(vRien.avant.dits, [true]), 'aucune photo : « Sans photo », dit tout de suite (rien à lire)', JSON.stringify(vRien.avant));
      // La ligne du lot montre les photos RÉDIGÉES (une retouche peut remplacer l'image par défaut) : ses origines, les
      // photos de la fiche, sont lues aussi — la retouche de l'image par défaut ne compte pas pour une vraie photo.
      const retoucheDeD = STO('enhanced/1700000000000_0.png');
      const vRetoucheSeule = await vignetteMontee([retoucheDeD], { origines: [VIDE] });
      const vRetoucheEtVraie = await vignetteMontee([retoucheDeD, A1], { origines: [VIDE, A1] });
      ok(/Sans photo/.test(vRetoucheSeule.apres.texte) && egal(vRetoucheSeule.apres.dits, [true]) && vRetoucheSeule.avant.dits.length === 0
        && vRetoucheEtVraie.apres.image === A1 && egal(vRetoucheEtVraie.apres.dits, [false]),
        'la RETOUCHE de l’image par défaut (photos rédigées, ses origines lues aussi) : « Sans photo » quand elle est seule ; sinon la vignette montre la vraie photo',
        JSON.stringify([vRetoucheSeule, vRetoucheEtVraie.apres]));
    } else ok(false, 'vignette montée : « Sans photo » seulement une fois lue et conclue');
  } finally {
    await viteM.close();
  }
} finally {
  await vite.close();
}

console.log(`\n${rouges === 0 ? '✓' : '✗'} une-photo-suffit : ${verts} contrôles verts, ${rouges} rouges`);
process.exit(rouges === 0 ? 0 : 1);
