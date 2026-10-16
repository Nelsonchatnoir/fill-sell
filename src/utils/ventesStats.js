// ═══════════════════════════════════════════════════════════════════════════
// VENTES ET STATISTIQUES — LES RÈGLES DE LECTURE, À UN SEUL ENDROIT (16/10)
// ═══════════════════════════════════════════════════════════════════════════
// Refonte des écrans Tableau, Ventes et Stats (maquettes validées par Nico le
// 16/10). Quatre erreurs vues sur son compte, corrigées ICI pour tous les
// comptes, jamais dans un écran :
//
//   a) « Ventes par plateforme » montrait Vinted DEUX fois (16 ventes, puis 1).
//      Cause : les écrans regroupaient sur `ventes.plateforme`, qui est un
//      LIBELLÉ d'écran (« Vinted », « vinted », « Vinted␣ », « eBay »…). Le
//      serveur écrit pourtant le CODE à côté (`ventes.plateforme_code`, posé
//      par enregistrer_vente_atomique depuis le 02/10 via plateforme_normalisee).
//      Règle : une vente se range par son CODE ; sans code, le libellé est
//      ramené au code par la même table que le serveur (plateforme_normalisee).
//   b) Un prix d'achat à 0 € comptait pour 100 % de marge (Casio, Aspirateur,
//      « Meilleure marge : eBay 100 % »). Règle (Nico, 16/10) : la marge EN %
//      ne s'affiche et n'entre dans une moyenne que si le prix d'achat est
//      STRICTEMENT positif. À 0 €, le bénéfice en euros reste vrai et compté
//      (gratuit assumé, cf. comptabilite.js), mais aucun pourcentage.
//      Vide ≠ zéro tient toujours : NULL = inconnu, 0 = gratuit.
//   c) La somme des plateformes (≈ 739 €) ne collait pas au revenu de la
//      période (3 385,65 €) : les ventes SANS plateforme (Stratocaster…)
//      n'étaient comptées nulle part. Règle : une ligne « Sans plateforme »,
//      et la somme des lignes = le revenu, au centime.
//   d) La liste des ventes suivait l'ordre d'ENREGISTREMENT (created_at), pas
//      la date de vente : une vente de 2024 saisie hier passait devant une
//      vente d'août. Règle : date de vente décroissante, partout ; à date
//      égale, la plus récemment enregistrée d'abord ; sans date, en dernier.
//
// Fonctions pures, testées par `npm run selftest:ventes-stats`.
import { prixAchatConnu, prixAchatNum } from './comptabilite.js';

// ── Les plateformes d'une vente ─────────────────────────────────────────────
export const CODES_PLATEFORME_VENTE = ['vinted', 'leboncoin', 'beebs', 'ebay', 'depop', 'opla'];
export const LIBELLE_PLATEFORME_VENTE = {
  vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', ebay: 'eBay', depop: 'Depop', opla: 'Opla',
};
// Couleurs de l'APP (pastilles .ic-* de utils/shared.js, tuile DepopIcon,
// icône Opla) — jamais celles de la maquette, qui ne faisait que les imiter.
export const COULEUR_PLATEFORME = {
  vinted: '#09B584', leboncoin: '#EA5B0C', beebs: '#FF6B35', ebay: '#0064D2', depop: '#FF2300', opla: '#FE9D17',
  ailleurs: '#8A8578', autre: '#A39D8E', sans: '#C9C3B8',
};
export const CLE_SANS_PLATEFORME = 'sans';

/**
 * Libellé libre → code. MIROIR de la fonction SQL public.plateforme_normalisee
 * (même ordre de tests) : le client et le serveur rangent une vente au même
 * endroit. Rend null pour un libellé vide, 'autre' pour un texte inconnu.
 */
export function codeDepuisLibelle(brut) {
  const p = String(brut ?? '').trim();
  if (!p) return null;
  const v = p.toLowerCase();
  if (v.includes('vinted')) return 'vinted';
  if (v.includes('leboncoin') || v === 'lbc' || v === 'le bon coin') return 'leboncoin';
  if (v.includes('beebs')) return 'beebs';
  if (v.includes('ebay')) return 'ebay';
  if (v.includes('opla')) return 'opla';
  if (v.includes('depop')) return 'depop';
  if (v.includes('ailleurs') || v.includes('main propre')) return 'ailleurs';
  return 'autre';
}

/**
 * La plateforme RÉELLE d'une vente : { cle, code, libelle } ou null (aucune).
 *   · le libellé (`ventes.plateforme`) est ramené à son code par la MÊME table
 *     que le serveur (codeDepuisLibelle ↔ plateforme_normalisee) : « Vinted »,
 *     « vinted », « Vinted␣ » sont UNE plateforme ;
 *   · le libellé passe avant `plateforme_code` : c'est lui que la personne voit
 *     et corrige (la fenêtre « Modifier » n'écrit que lui, et aucun déclencheur
 *     ne recalcule le code) ;
 *   · `plateforme_code` (écrit par enregistrer_vente_atomique) sert quand le
 *     libellé est vide ou ne désigne aucune plateforme (« autre » → Ailleurs) ;
 *   · un texte libre inconnu (« Vestiaire collectif ») garde son libellé et se
 *     range sous une clé à lui (casse et espaces ignorés) — jamais mêlé à une
 *     de nos plateformes, jamais perdu.
 * Accepte une ligne brute de `ventes` comme une vente mappée (mapSale).
 */
export function plateformeVente(v) {
  if (!v) return null;
  const brut = String(v.plateforme ?? '').trim();
  const depuisLibelle = codeDepuisLibelle(brut);
  let code = depuisLibelle;
  if (!code || code === 'autre') {
    const serveur = String(v.plateforme_code ?? '').trim().toLowerCase();
    if (CODES_PLATEFORME_VENTE.includes(serveur) || serveur === 'ailleurs') code = serveur;
    else if (!code && serveur === 'autre') code = 'ailleurs';
  }
  if (!code) return null;
  if (CODES_PLATEFORME_VENTE.includes(code)) return { cle: code, code, libelle: LIBELLE_PLATEFORME_VENTE[code] };
  if (code === 'ailleurs') return { cle: 'ailleurs', code: 'ailleurs', libelle: 'Ailleurs' };
  const libre = brut.replace(/\s+/g, ' ');
  return { cle: `autre:${libre.toLowerCase()}`, code: 'autre', libelle: libre.charAt(0).toUpperCase() + libre.slice(1) };
}

// ── Les dates d'une vente ───────────────────────────────────────────────────
const jourValide = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s));
/** Le JOUR de la vente (« AAAA-MM-JJ »), ou null si la vente n'a pas de date. */
export function jourDeVente(s) {
  const j = String(s?.date ?? '').slice(0, 10);
  return jourValide(j) ? j : null;
}
const instant = (v) => { const t = Date.parse(String(v ?? '')); return Number.isFinite(t) ? t : 0; };
const enregistreeLe = (s) => instant(s?.cree_le ?? s?.created_at);

/**
 * Comparateur « date de vente décroissante » (règle d) : jour de vente, puis
 * instant d'enregistrement, puis identifiant — un ordre TOTAL et stable, le
 * même à chaque rechargement. Une vente sans date ferme la liste.
 */
export function comparerVentesRecentesDabord(a, b) {
  const ja = jourDeVente(a), jb = jourDeVente(b);
  if (ja && !jb) return -1;
  if (!ja && jb) return 1;
  if (ja && jb && ja !== jb) return ja < jb ? 1 : -1;
  const ca = enregistreeLe(a), cb = enregistreeLe(b);
  if (ca !== cb) return cb - ca;
  const ia = Number(a?.id), ib = Number(b?.id);
  if (Number.isFinite(ia) && Number.isFinite(ib) && ia !== ib) return ib - ia;
  return String(b?.id ?? '').localeCompare(String(a?.id ?? ''));
}

/** Copie triée par date de vente décroissante (règle d). */
export function trierVentes(ventes) {
  return [...(Array.isArray(ventes) ? ventes : [])].sort(comparerVentesRecentesDabord);
}

/**
 * Regroupe une liste DÉJÀ TRIÉE par mois de vente. Rend
 * [{ cle:'2026-10'|'sans-date', annee, mois (0-11)|null, lignes }] dans l'ordre
 * de la liste. Les ventes sans date forment un seul groupe, en dernier.
 */
export function grouperParMois(lignes) {
  const groupes = [];
  const index = new Map();
  for (const s of lignes ?? []) {
    const j = jourDeVente(s);
    const cle = j ? j.slice(0, 7) : 'sans-date';
    let g = index.get(cle);
    if (!g) {
      g = { cle, annee: j ? Number(j.slice(0, 4)) : null, mois: j ? Number(j.slice(5, 7)) - 1 : null, lignes: [] };
      index.set(cle, g);
      groupes.push(g);
    }
    g.lignes.push(s);
  }
  return groupes;
}

// ── L'argent d'une vente ────────────────────────────────────────────────────
const nombre = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
export const prixVente = (s) => nombre(s?.sell ?? s?.prix_vente) ?? 0;

/** Le prix d'achat est-il connu ET strictement positif ? (règle b) */
export function prixAchatPositif(x) {
  if (!prixAchatConnu(x)) return false;
  const pa = prixAchatNum(x);
  return Number.isFinite(pa) && pa > 0;
}

/** Prix d'achat SAISI à 0 € (gratuit assumé) — à dire, sans pourcentage. */
export function prixAchatZero(x) {
  return prixAchatConnu(x) && prixAchatNum(x) === 0;
}

/** Le bénéfice en euros (null si le prix d'achat est inconnu). */
export function beneficeVente(s) {
  if (!prixAchatConnu(s)) return null;
  return nombre(s?.margin ?? s?.benefice);
}

/**
 * La marge EN % d'une vente, ou null. Règle b : seulement si le prix d'achat
 * est > 0 (à 0 €, le « 100 % » ne dit rien de vrai). Dénominateur : le prix de
 * vente (convention de comptabilite.margeUnitaire).
 */
export function margePctVente(s) {
  if (!prixAchatPositif(s)) return null;
  const pct = nombre(s?.marginPct);
  if (pct !== null) return pct;
  const m = beneficeVente(s);
  const pv = prixVente(s);
  return m !== null && pv > 0 ? (m / pv) * 100 : null;
}

/**
 * Marge moyenne en % d'une liste de ventes (règle b : prix d'achat > 0 seulement).
 *   mode 'ponderee' : Σ bénéfices / Σ prix de vente (Tableau, Ventes) ;
 *   mode 'simple'   : moyenne des % de chaque vente (Stats, comme avant).
 * Rend { pct|null, retenues, sansPrix, aZero, total } — de quoi DIRE sur quoi
 * la moyenne porte.
 */
export function margeMoyenne(ventes, { mode = 'ponderee' } = {}) {
  const liste = Array.isArray(ventes) ? ventes : [];
  let somme = 0, ca = 0, sommePct = 0, retenues = 0, sansPrix = 0, aZero = 0;
  for (const s of liste) {
    if (!prixAchatConnu(s)) { sansPrix += 1; continue; }
    if (!prixAchatPositif(s)) { aZero += 1; continue; }
    const m = beneficeVente(s);
    const pct = margePctVente(s);
    const pv = prixVente(s);
    if (m === null || pct === null || !(pv > 0)) { sansPrix += 1; continue; }
    somme += m; ca += pv; sommePct += pct; retenues += 1;
  }
  const pct = retenues === 0 ? null : (mode === 'simple' ? sommePct / retenues : (ca > 0 ? (somme / ca) * 100 : null));
  return { pct, retenues, sansPrix, aZero, total: liste.length };
}

/** Somme des prix de vente (revenu, encaissé) — aucune exclusion. */
export function totalEncaisse(ventes) {
  return (Array.isArray(ventes) ? ventes : []).reduce((a, s) => a + prixVente(s), 0);
}

// ── Les ventes par plateforme (règles a et c) ───────────────────────────────
/**
 * [{ cle, libelle, code, couleur, nb, ca }] trié par montant décroissant, la
 * ligne « Sans plateforme » TOUJOURS en dernier. Σ ca = totalEncaisse(ventes).
 */
export function ventesParPlateforme(ventes) {
  const acc = new Map();
  for (const s of Array.isArray(ventes) ? ventes : []) {
    const p = plateformeVente(s);
    const cle = p ? p.cle : CLE_SANS_PLATEFORME;
    let l = acc.get(cle);
    if (!l) {
      l = p
        ? { cle, code: p.code, libelle: p.libelle, couleur: COULEUR_PLATEFORME[p.code] ?? COULEUR_PLATEFORME.autre, nb: 0, ca: 0 }
        : { cle, code: CLE_SANS_PLATEFORME, libelle: 'Sans plateforme', couleur: COULEUR_PLATEFORME.sans, nb: 0, ca: 0 };
      acc.set(cle, l);
    }
    l.nb += 1;
    l.ca += prixVente(s);
  }
  const lignes = [...acc.values()];
  lignes.sort((a, b) => {
    if (a.cle === CLE_SANS_PLATEFORME) return 1;
    if (b.cle === CLE_SANS_PLATEFORME) return -1;
    return (b.ca - a.ca) || (b.nb - a.nb) || a.libelle.localeCompare(b.libelle);
  });
  return lignes;
}

/** Les plateformes présentes dans une liste de ventes (filtres de l'écran Ventes). */
export function plateformesPresentes(ventes) {
  return ventesParPlateforme(ventes).map(({ cle, code, libelle, nb }) => ({ cle, code, libelle, nb }));
}

/** La vente appartient-elle à ce filtre de plateforme ? ('toutes' | cle) */
export function venteDeLaPlateforme(s, cle) {
  if (!cle || cle === 'toutes') return true;
  const p = plateformeVente(s);
  return (p ? p.cle : CLE_SANS_PLATEFORME) === cle;
}

// ── La marge par période (graphe « Marge par mois ») ────────────────────────
/**
 * Pour chaque période : { nb, pct|null, etat }.
 *   etat 'vide'       : aucune vente → aucun point (pas un faux 0 %) ;
 *   etat 'sans_achat' : des ventes, mais aucune au prix d'achat > 0 → hachures ;
 *   etat 'ok'         : pct = marge pondérée des ventes au prix d'achat > 0.
 */
export function margeDePeriode(ventes) {
  const liste = Array.isArray(ventes) ? ventes : [];
  if (!liste.length) return { nb: 0, pct: null, etat: 'vide' };
  const m = margeMoyenne(liste, { mode: 'ponderee' });
  return { nb: liste.length, pct: m.pct, etat: m.pct === null ? 'sans_achat' : 'ok' };
}

// ── Délai entre l'ajout au stock et la vente ────────────────────────────────
/**
 * Jours entre l'ajout de la fiche et la vente, ou null. La fiche est trouvée
 * par `inventaire_id` d'abord ; pour une vente sans lien, par son titre exact
 * (le calcul d'avant, gardé pour ne pas vider l'écran des ventes anciennes —
 * une statistique, jamais un rapprochement qui écrit).
 */
export function indexAjouts(items) {
  const parId = new Map();
  const parTitre = new Map();
  for (const i of Array.isArray(items) ? items : []) {
    const d = i?.date_ajout || i?.created_at;
    if (!d) continue;
    if (i.id != null) parId.set(String(i.id), d);
    const t = String(i.title ?? i.titre ?? '').toLowerCase().trim();
    if (t) parTitre.set(t, d);
  }
  return { parId, parTitre };
}
export function joursPourVendre(s, index) {
  const jour = jourDeVente(s);
  if (!jour || !index) return null;
  const ajout = (s?.inventaire_id != null ? index.parId.get(String(s.inventaire_id)) : null)
    ?? index.parTitre.get(String(s?.title ?? s?.titre ?? '').toLowerCase().trim());
  if (!ajout) return null;
  const debut = Date.parse(String(ajout).slice(0, 10));
  const fin = Date.parse(jour);
  if (!Number.isFinite(debut) || !Number.isFinite(fin)) return null;
  return Math.max(0, Math.round((fin - debut) / 86400000));
}
/** « < 1 j » plutôt que « 0j » ; « 5 j » sinon. */
export function libelleJours(n, lang = 'fr') {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const v = Math.round(Number(n));
  if (v < 1) return lang === 'en' ? '< 1 d' : '< 1 j';
  return lang === 'en' ? `${v} d` : `${v} j`;
}

// ── Courbe sans dépassement (interpolation monotone, Fritsch–Carlson) ───────
/**
 * Chemin SVG lissé qui passe par chaque point SANS jamais sortir de l'écart
 * entre deux voisins : une suite qui ne descend pas sous 0 % ne dessine
 * jamais de creux sous 0 %, ni de bosse au-dessus du plus haut point.
 * points : [{x,y}] (y en pixels, x croissants). Rend '' sans point.
 */
export function cheminMonotone(points) {
  const p = (points ?? []).filter((q) => Number.isFinite(q?.x) && Number.isFinite(q?.y));
  const f = (n) => (Math.round(n * 10) / 10).toString();
  if (!p.length) return '';
  if (p.length === 1) return `M${f(p[0].x)},${f(p[0].y)}`;
  const n = p.length;
  const dx = [], pente = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx[i] = p[i + 1].x - p[i].x;
    pente[i] = dx[i] === 0 ? 0 : (p[i + 1].y - p[i].y) / dx[i];
  }
  const t = new Array(n);
  t[0] = pente[0];
  t[n - 1] = pente[n - 2];
  for (let i = 1; i < n - 1; i += 1) {
    if (pente[i - 1] * pente[i] <= 0) t[i] = 0;
    else {
      const w1 = 2 * dx[i] + dx[i - 1], w2 = dx[i] + 2 * dx[i - 1];
      t[i] = (w1 + w2) / (w1 / pente[i - 1] + w2 / pente[i]);
    }
  }
  let d = `M${f(p[0].x)},${f(p[0].y)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const h = dx[i] / 3;
    d += ` C${f(p[i].x + h)},${f(p[i].y + t[i] * h)} ${f(p[i + 1].x - h)},${f(p[i + 1].y - t[i + 1] * h)} ${f(p[i + 1].x)},${f(p[i + 1].y)}`;
  }
  return d;
}
