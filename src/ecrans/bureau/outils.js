// Outils du Tableau et des Statistiques sur ordinateur (28/10) : formats, libellés de
// période, largeur mesurée des graphes. Aucun composant ici (fast refresh).
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatCurrency, typeLabel } from '../../utils/shared';
import { largeurApprochee } from './axe';

// ── Formats ─────────────────────────────────────────────────────────────────
export function formats(lang, currency = 'EUR') {
  const loc = lang === 'en' ? 'en-GB' : 'fr-FR';
  const num = (n, d = 0) => (n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString(loc, { minimumFractionDigits: d, maximumFractionDigits: d }));
  const nbsp = String.fromCharCode(160);
  return {
    lang,
    L: (fr, en) => (lang === 'en' ? en : fr),
    eur: (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : formatCurrency(n, currency)),
    eur0: (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : formatCurrency(Math.round(n), currency, 0)),
    num,
    pct: (x, d = 1) => (x == null || !Number.isFinite(Number(x)) ? '—' : `${num(x, d)}${nbsp}%`),
    jours: (n) => {
      if (n == null || !Number.isFinite(Number(n))) return '—';
      if (n < 1) return lang === 'en' ? `< 1${nbsp}d` : `< 1${nbsp}j`;
      const d = n >= 10 || Number.isInteger(n) ? 0 : 1;
      return `${num(n, d)}${nbsp}${lang === 'en' ? 'd' : 'j'}`;
    },
    cat: (c) => (c == null ? (lang === 'en' ? 'Uncategorised' : 'Non classé') : typeLabel(c, lang)),
    marque: (m) => (m == null ? (lang === 'en' ? 'No brand' : 'Sans marque') : m),
  };
}

const at = (j) => new Date(`${j}T12:00:00Z`);
const fmtJ = (lang, o) => new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', { timeZone: 'UTC', ...o });
/** « 2 oct. » / « 2 Oct » */
export const jourCourt = (j, lang) => (j ? fmtJ(lang, { day: 'numeric', month: 'short' }).format(at(j)) : '');
/** « ven. 2 oct. » */
export const jourMoyen = (j, lang) => (j ? fmtJ(lang, { weekday: 'short', day: 'numeric', month: 'short' }).format(at(j)) : '');
/** « mercredi 28 octobre » */
export const jourLong = (j, lang) => (j ? fmtJ(lang, { weekday: 'long', day: 'numeric', month: 'long' }).format(at(j)) : '');
/** « octobre » / « October » ; court : « oct. » */
export const nomMois = (cleMois, lang, court = false) => fmtJ(lang, { month: court ? 'short' : 'long' }).format(at(`${cleMois}-15`));
export const moisAnnee = (cleMois, lang) => fmtJ(lang, { month: 'long', year: 'numeric' }).format(at(`${cleMois}-15`));
const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Les libellés d'une période (bloc.periode) : bouton, nom dans une phrase, période d'avant. */
export function libellesPeriode(p, lang) {
  const en = lang === 'en';
  if (p.cle === 'mois') {
    const m = nomMois(p.debut.slice(0, 7), lang);
    const pd = p.precedente;
    const jf = Number(pd.fin.slice(8, 10));
    const mp = nomMois(pd.debut.slice(0, 7), lang, true);
    return { bouton: capital(m), nom: en ? capital(m) : m, avant: en ? `${mp} 1–${jf}` : `1–${jf} ${mp}` };
  }
  if (p.cle === '30j') return { bouton: en ? 'Last 30 days' : '30 derniers jours', nom: en ? 'last 30 days' : '30 derniers jours', avant: en ? 'previous 30 days' : '30 jours d’avant' };
  if (p.cle === '12m') return { bouton: en ? 'Last 12 months' : '12 derniers mois', nom: en ? 'last 12 months' : '12 derniers mois', avant: en ? 'previous 12 months' : '12 mois d’avant' };
  return { bouton: en ? 'All time' : 'Depuis le début', nom: en ? 'all time' : 'depuis le début', avant: '' };
}

/** Largeur mesurée d'un élément (graphes dessinés à la taille réelle : texte jamais étiré). */
export function useTaille() {
  const ref = useRef(null);
  const [taille, setTaille] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width), h = Math.round(e.contentRect.height);
      setTaille((t) => (t.w === w && t.h === h ? t : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, taille];
}

/**
 * Largeur réelle d'un libellé d'axe (11,5 px, police calculée du graphe), mesurée au canvas ;
 * remesurée une fois les polices de la page chargées (avant : police de repli).
 */
const TAILLE_AXE = 11.5;
const approchee = largeurApprochee(TAILLE_AXE);
let toile = null;
const largeurs = new Map();
export function useMesureTexte(ref) {
  const [polices, setPolices] = useState(() => typeof document === 'undefined' || !document.fonts || document.fonts.status === 'loaded');
  useEffect(() => {
    if (polices) return undefined;
    let vivant = true;
    document.fonts.ready.then(() => { if (vivant) setPolices(true); });
    return () => { vivant = false; };
  }, [polices]);
  return useCallback((texte, gras) => {
    const el = ref.current;
    if (!el) return approchee(texte, gras);
    const famille = getComputedStyle(el).fontFamily;
    const cle = `${polices ? 1 : 0}|${gras ? 1 : 0}|${famille}|${texte}`;
    if (largeurs.has(cle)) return largeurs.get(cle);
    toile = toile || document.createElement('canvas').getContext('2d');
    if (!toile) return approchee(texte, gras);
    toile.font = `${gras ? 600 : 400} ${TAILLE_AXE}px ${famille}`;
    const l = Math.ceil(toile.measureText(texte).width) + 1;
    largeurs.set(cle, l);
    return l;
  }, [ref, polices]);
}

const NOMS = { vinted: 'Vinted', leboncoin: 'Leboncoin', ebay: 'eBay', beebs: 'Beebs', depop: 'Depop', opla: 'Opla', ailleurs: 'Ailleurs' };
/** Nom affiché d'une plateforme de vente (« Sans plateforme », « Ailleurs », texte libre). */
export const nomPlateforme = (code, f, libelle = null) => (code === 'sans' ? f.L('Sans plateforme', 'No platform') : code === 'ailleurs' ? f.L('Ailleurs', 'Elsewhere') : (libelle ?? NOMS[code] ?? code));
