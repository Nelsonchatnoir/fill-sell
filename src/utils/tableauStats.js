// ═══════════════════════════════════════════════════════════════════════════
// TABLEAU ET STATISTIQUES — UNE SEULE SOURCE POUR LES CHIFFRES (28/10)
// ═══════════════════════════════════════════════════════════════════════════
// Refonte desktop du Tableau et des Statistiques (maquettes validées par Nico le
// 28/10). Avant, l'en-tête disait « 508,80 € profit · 99 ventes ce mois » (mois
// calendaire) et les Stats « 612,80 € · 124 ventes · dernier mois » (un mois
// glissant) : deux périodes, deux libellés trop proches. Règles posées ici, pour
// tous les comptes et tous les écrans (en-tête, Tableau, Statistiques) :
//
//   1. UNE PÉRIODE EST TOUJOURS NOMMÉE. 'mois' = du 1er du mois à aujourd'hui ;
//      '30j' = les 30 derniers jours (aujourd'hui compris) ; '3m', '6m', '12m' =
//      les N derniers mois glissants ; 'tout' = depuis le début (les ventes SANS
//      date n'entrent que là). Jours de PARIS, comparés en texte (AAAA-MM-JJ) :
//      jamais un `new Date('2026-10-01').getMonth()` qui change de mois selon le
//      fuseau du navigateur.
//   2. LA COMPARAISON SE FAIT À JOURS ÉGAUX : octobre (1–28) contre 1–28
//      septembre, 30 jours contre les 30 d'avant. Sous 5 ventes dans la période
//      d'avant, l'écran n'affiche AUCUN écart (comparable() = false).
//   3. LE DÉLAI DE VENTE EST UN CONSTAT, JAMAIS UNE ESTIMATION : jours entre la
//      première mise en ligne connue (plus ancien published_at des jobs de
//      l'article, sinon son ajout) et la vente, pour les seuls articles CRÉÉS
//      dans FillSell. Un article importé d'un dressing (origine renseignée) a une
//      vraie date de mise en ligne inconnue : il est écarté, pas deviné.
//   4. LE PRIX AFFICHÉ est le prix que FillSell a publié sur la plateforme de la
//      vente (cross_post_jobs.price du dernier job publié avant la vente).
//   5. L'ARGENT suit utils/comptabilite.js et utils/ventesStats.js : profit sur
//      les ventes au prix d'achat CONNU, marge en % pondérée sur les ventes au
//      prix d'achat > 0, encaissé sur toutes les ventes.
//   6. LE STOCK est un état d'AUJOURD'HUI (en ligne, immobilisé, ancienneté) :
//      aucune comparaison avec un passé qu'on n'a pas photographié.
//
// Tout se calcule sur ce que l'app a DÉJÀ chargé (ventes, inventaire, jobs lus
// par useStockEnLigne) : aucune requête de plus à l'ouverture.
// Fonctions pures, testées par `npm run selftest:tableau-stats`.
import {
  plateformeVente, ventesParPlateforme, margeMoyenne, totalEncaisse, jourDeVente,
  beneficeVente, margePctVente, prixAchatZero, comparerVentesRecentesDabord, CLE_SANS_PLATEFORME,
} from './ventesStats.js';
import { totalMarge, totalInvesti, prixAchatConnu, prixAchatNum } from './comptabilite.js';

// ── Jours de Paris ──────────────────────────────────────────────────────────
const FMT_JOUR = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
/** Le jour de Paris (« AAAA-MM-JJ ») d'un instant, ou null s'il est illisible. */
export function jourParis(t = Date.now()) {
  const d = new Date(t);
  return Number.isFinite(d.getTime()) ? FMT_JOUR.format(d) : null;
}
const midi = (j) => Date.parse(`${j}T12:00:00Z`);
export function ajouteJours(j, n) { const x = new Date(midi(j)); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
export function ecartJours(a, b) { return Math.round((midi(b) - midi(a)) / 86400000); }
const finDeMois = (a, m0) => new Date(Date.UTC(a, m0 + 1, 0)).getUTCDate();
/** Le même jour N mois plus tôt (borné à la fin du mois : 31 mars − 1 mois = 28/29 février). */
export function ajouteMois(j, n) {
  const [a, m, d] = j.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1 + n, 1));
  const jj = Math.min(d, finDeMois(t.getUTCFullYear(), t.getUTCMonth()));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(jj).padStart(2, '0')}`;
}

// ── LES PÉRIODES ────────────────────────────────────────────────────────────
export const PERIODES_BUREAU = ['mois', '30j', '12m', 'tout'];
const GLISSANTS = { '3m': 3, '6m': 6, '12m': 12 };
/**
 * { cle, debut, fin, precedente: { debut, fin } | null }. debut = null : depuis
 * le début. Les libellés se fabriquent à l'écran (libellePeriode), en fr ou en.
 */
export function periode(cle, auj = jourParis()) {
  if (cle === 'mois') {
    const debut = `${auj.slice(0, 7)}-01`;
    const pd = ajouteMois(debut, -1);
    const jp = Math.min(Number(auj.slice(8, 10)), finDeMois(Number(pd.slice(0, 4)), Number(pd.slice(5, 7)) - 1));
    return { cle, debut, fin: auj, precedente: { debut: pd, fin: `${pd.slice(0, 8)}${String(jp).padStart(2, '0')}` } };
  }
  if (cle === '30j') {
    return { cle, debut: ajouteJours(auj, -29), fin: auj, precedente: { debut: ajouteJours(auj, -59), fin: ajouteJours(auj, -30) } };
  }
  if (GLISSANTS[cle]) {
    const n = GLISSANTS[cle];
    const debut = ajouteJours(ajouteMois(auj, -n), 1);
    const finPrev = ajouteJours(debut, -1);
    return { cle, debut, fin: auj, precedente: { debut: ajouteJours(ajouteMois(finPrev, -n), 1), fin: finPrev } };
  }
  return { cle: 'tout', debut: null, fin: auj, precedente: null };
}
/** Les ventes d'une période (bornes incluses). 'tout' garde aussi les ventes sans date. */
export function ventesDe(ventes, p) {
  const liste = Array.isArray(ventes) ? ventes : [];
  if (!p?.debut) return liste.slice();
  return liste.filter((s) => { const j = jourDeVente(s); return j != null && j >= p.debut && j <= p.fin; });
}
/** Une comparaison n'a de sens qu'avec au moins 5 ventes dans la période d'avant. */
export const SEUIL_COMPARAISON = 5;
export const comparable = (bloc) => Boolean(bloc?.prev && bloc.prev.nb >= SEUIL_COMPARAISON);

// ── LE CONTEXTE : index construits une fois ─────────────────────────────────
/**
 * ventes : ventes mappées (mapSale) ; items : inventaire mappé (mapItem) ;
 * jobsParArticle : { [inventaire_id]: jobs[] } (useStockEnLigne, avec `price`) ;
 * enLigneParArticle : Map(id → ['vinted', …]) — la règle des pastilles du Stock.
 */
export function creerContexte({ ventes = [], items = [], jobsParArticle = null, enLigneParArticle = null, aujourdhui = jourParis() } = {}) {
  const itemParId = new Map();
  for (const i of items ?? []) if (i?.id != null) itemParId.set(String(i.id), i);
  const stock = (items ?? []).filter((i) => i?.statut === 'stock');
  return { ventes: Array.isArray(ventes) ? ventes : [], items: items ?? [], stock, itemParId, jobsParArticle: jobsParArticle ?? {}, jobsConnus: jobsParArticle != null, enLigneParArticle: enLigneParArticle ?? new Map(), auj: aujourdhui };
}
const ajoutDe = (it) => it?.date_ajout ?? it?.created_at ?? null;

/** Jours entre la première mise en ligne connue et la vente (règle 3), ou null. */
export function delaiVente(ctx, s) {
  // Jobs pas encore lus : on ne sait pas encore quand l'article a été mis en ligne.
  if (!ctx.jobsConnus) return null;
  const jv = jourDeVente(s);
  if (!jv || s?.inventaire_id == null) return null;
  const it = ctx.itemParId.get(String(s.inventaire_id));
  if (!it || it.origine) return null;
  let premier = null;
  for (const j of ctx.jobsParArticle[it.id] ?? []) if (j?.published_at && (!premier || j.published_at < premier)) premier = j.published_at;
  const debut = jourParis(premier ?? ajoutDe(it));
  if (!debut) return null;
  const n = ecartJours(debut, jv);
  return n >= 0 ? n : null;
}

/** Le prix publié par FillSell sur la plateforme de la vente (règle 4), ou null. */
export function prixAffiche(ctx, s) {
  const p = plateformeVente(s);
  if (!p || s?.inventaire_id == null) return null;
  const jv = jourDeVente(s);
  let choisi = null, repli = null;
  for (const j of ctx.jobsParArticle[s.inventaire_id] ?? []) {
    if (j?.platform !== p.code || !j.published_at || !(Number(j.price) > 0)) continue;
    if (!repli || j.published_at > repli.published_at) repli = j;
    if (jv && jourParis(j.published_at) <= jv && (!choisi || j.published_at > choisi.published_at)) choisi = j;
  }
  const j = choisi ?? repli;
  return j ? Number(j.price) : null;
}

const moyenne = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const mediane = (xs) => { if (!xs.length) return null; const t = [...xs].sort((a, b) => a - b); const k = Math.floor(t.length / 2); return t.length % 2 ? t[k] : (t[k - 1] + t[k]) / 2; };

/** Les indicateurs d'une liste de ventes — LE calcul de l'en-tête, du Tableau et des Stats. */
export function indicateurs(ctx, vs) {
  const liste = Array.isArray(vs) ? vs : [];
  const tm = totalMarge(liste);
  const mm = margeMoyenne(liste, { mode: 'ponderee' });
  const delais = liste.map((s) => delaiVente(ctx, s)).filter((x) => x != null);
  const ca = totalEncaisse(liste);
  return {
    nb: liste.length, encaisse: ca,
    profit: tm.total, profitRetenues: tm.retenues, profitExclus: tm.exclus,
    marge: mm.pct, margeRetenues: mm.retenues, margeSansPrix: mm.sansPrix, margeAZero: mm.aZero,
    panier: liste.length ? ca / liste.length : null,
    delai: moyenne(delais), delaiMediane: mediane(delais), delaiN: delais.length,
  };
}

// ── Regroupements ───────────────────────────────────────────────────────────
const SANS_MARQUE = new Set(['sans marque', 'aucune', 'aucune marque', 'no brand', 'autre', 'inconnue', '-']);
/** Clé de marque : casse et espaces ignorés ; « Sans marque » et vide = '∅'. */
export function marqueDe(s) {
  const m = String(s?.marque ?? '').trim().replace(/\s+/g, ' ');
  return m && !SANS_MARQUE.has(m.toLowerCase()) ? { cle: m.toLowerCase(), libelle: m.charAt(0).toUpperCase() + m.slice(1) } : { cle: '∅', libelle: null };
}
/** Catégorie de la vente, sinon celle de son article ; « Autre » et vide = '∅' (non classé). */
export function categorieDe(ctx, s) {
  let t = String(s?.type ?? '').trim();
  if (!t && s?.inventaire_id != null) { const it = ctx.itemParId.get(String(s.inventaire_id)); if (it?.typeConnu) t = String(it.type ?? '').trim(); }
  return t && t !== 'Autre' ? { cle: t, libelle: t } : { cle: '∅', libelle: null };
}
function regrouper(ctx, vs, cleDe, n) {
  const acc = new Map();
  for (const s of vs) {
    const k = cleDe(s);
    let l = acc.get(k.cle);
    if (!l) { l = { cle: k.cle, libelle: k.libelle, ventes: [] }; acc.set(k.cle, l); }
    l.ventes.push(s);
  }
  return [...acc.values()].map((l) => ({ cle: l.cle, libelle: l.libelle, ...indicateurs(ctx, l.ventes) }))
    .sort((a, b) => (b.encaisse - a.encaisse) || (b.nb - a.nb)).slice(0, n);
}
function delaisPar(ctx, vs, cleDe, min = 1) {
  const acc = new Map();
  for (const s of vs) {
    const x = delaiVente(ctx, s); if (x == null) continue;
    const k = cleDe(s);
    let l = acc.get(k.cle);
    if (!l) { l = { cle: k.cle, libelle: k.libelle, xs: [] }; acc.set(k.cle, l); }
    l.xs.push(x);
  }
  return [...acc.values()].filter((l) => l.xs.length >= min)
    .map((l) => ({ cle: l.cle, libelle: l.libelle, n: l.xs.length, moyenne: moyenne(l.xs), mediane: mediane(l.xs) }))
    .sort((a, b) => b.n - a.n);
}
const cleplateforme = (s) => { const p = plateformeVente(s); return p ? { cle: p.cle, libelle: p.libelle, code: p.code } : { cle: CLE_SANS_PLATEFORME, libelle: null, code: CLE_SANS_PLATEFORME }; };

/** Prix encaissé / prix affiché : ratio pondéré (Σ encaissé / Σ affiché) et tranches. */
export function prixAfficheDe(ctx, vs) {
  const tranches = { auDessus: 0, auPrix: 0, moins10: 0, moins25: 0, plus25: 0 };
  let n = 0, sPa = 0, sPv = 0;
  for (const s of vs) {
    const pa = prixAffiche(ctx, s); if (pa == null) continue;
    const pv = Number(s?.sell ?? s?.prix_vente) || 0;
    n += 1; sPa += pa; sPv += pv;
    const r = pv / pa;
    if (r > 1.001) tranches.auDessus += 1; else if (r >= 0.999) tranches.auPrix += 1; else if (r >= 0.9) tranches.moins10 += 1; else if (r >= 0.75) tranches.moins25 += 1; else tranches.plus25 += 1;
  }
  return { n, ventes: vs.length, ratio: sPa > 0 ? sPv / sPa : null, ecart: sPv - sPa, tranches };
}

function serieJours(ctx, vs, debut, fin) {
  const parJour = new Map();
  for (const s of vs) { const j = jourDeVente(s); if (!j) continue; if (!parJour.has(j)) parJour.set(j, []); parJour.get(j).push(s); }
  const out = []; let c = 0, cp = 0, cn = 0;
  for (let j = debut; j <= fin; j = ajouteJours(j, 1)) {
    const x = parJour.get(j) ?? [];
    const ca = totalEncaisse(x), pr = totalMarge(x).total;
    c += ca; cp += pr; cn += x.length;
    out.push({ jour: j, ca, profit: pr, nb: x.length, cumulCa: c, cumulProfit: cp, cumulNb: cn });
  }
  return out;
}
function serieMois(ctx, vs, debutMois, finMois) {
  const parMois = new Map();
  for (const s of vs) { const j = jourDeVente(s); if (!j) continue; const k = j.slice(0, 7); if (!parMois.has(k)) parMois.set(k, []); parMois.get(k).push(s); }
  const out = [];
  for (let k = debutMois; k <= finMois; k = ajouteMois(`${k}-01`, 1).slice(0, 7)) out.push({ mois: k, ...indicateurs(ctx, parMois.get(k) ?? []) });
  return out;
}
const venteCourte = (ctx, s) => ({
  id: s.id, titre: s.title ?? s.titre ?? '', jour: jourDeVente(s), prix: Number(s.sell ?? s.prix_vente) || 0,
  benefice: beneficeVente(s), pct: margePctVente(s), gratuit: prixAchatZero(s), plateforme: plateformeVente(s)?.code ?? null,
  delai: delaiVente(ctx, s),
});

// ── LE BLOC D'UNE PÉRIODE : tout ce qu'un écran affiche pour elle ───────────
export function blocPeriode(ctx, cle) {
  const p = periode(cle, ctx.auj);
  const vs = ventesDe(ctx.ventes, p);
  const prevVs = p.precedente ? ventesDe(ctx.ventes, p.precedente) : null;
  const premier = vs.map(jourDeVente).filter(Boolean).sort()[0] ?? null;
  const total = totalEncaisse(vs);

  let serie;
  if (cle === 'mois' || cle === '30j') {
    serie = { pas: 'jour', points: serieJours(ctx, vs, p.debut, p.fin), prev: serieJours(ctx, prevVs, p.precedente.debut, p.precedente.fin),
      finMois: cle === 'mois' ? `${p.debut.slice(0, 8)}${String(finDeMois(Number(p.debut.slice(0, 4)), Number(p.debut.slice(5, 7)) - 1)).padStart(2, '0')}` : null };
  } else {
    // Mois par mois, à partir du premier mois qui a une vente datée (jamais 8 mois vides).
    const borne = p.debut ? p.debut.slice(0, 7) : null;
    const debutM = premier ? (borne && borne > premier.slice(0, 7) ? borne : premier.slice(0, 7)) : ctx.auj.slice(0, 7);
    serie = { pas: 'mois', points: serieMois(ctx, vs, debutM, ctx.auj.slice(0, 7)) };
  }

  const parPlat = new Map();
  for (const s of vs) { const k = cleplateforme(s).cle; if (!parPlat.has(k)) parPlat.set(k, []); parPlat.get(k).push(s); }
  const parPlatPrev = new Map();
  for (const s of prevVs ?? []) { const k = cleplateforme(s).cle; if (!parPlatPrev.has(k)) parPlatPrev.set(k, []); parPlatPrev.get(k).push(s); }
  const plateformes = ventesParPlateforme(vs).map((l) => {
    const sub = parPlat.get(l.cle) ?? [];
    return {
      cle: l.cle, code: l.code, libelle: l.cle === CLE_SANS_PLATEFORME ? null : l.libelle, couleur: l.couleur,
      ...indicateurs(ctx, sub),
      prev: prevVs ? indicateurs(ctx, parPlatPrev.get(l.cle) ?? []) : null,
      part: total > 0 ? l.ca / total : 0,
      marques: regrouper(ctx, sub, marqueDe, 6),
      categories: regrouper(ctx, sub, (s) => categorieDe(ctx, s), 5),
      prixAffiche: prixAfficheDe(ctx, sub),
      dernieres: [...sub].sort(comparerVentesRecentesDabord).slice(0, 6).map((s) => venteCourte(ctx, s)),
      serie: serie.pas === 'jour'
        ? serieJours(ctx, sub, p.debut, p.fin).map((x) => ({ jour: x.jour, nb: x.nb, ca: x.ca }))
        : serieMois(ctx, sub, serie.points[0]?.mois ?? ctx.auj.slice(0, 7), ctx.auj.slice(0, 7)).map((x) => ({ mois: x.mois, nb: x.nb, ca: x.encaisse })),
    };
  });

  const jours = Array.from({ length: 7 }, (_, i) => ({ jour: i, nb: 0, ca: 0 })); // 0 = lundi
  for (const s of vs) { const j = jourDeVente(s); if (!j) continue; const w = (new Date(midi(j)).getUTCDay() + 6) % 7; jours[w].nb += 1; jours[w].ca += Number(s.sell ?? s.prix_vente) || 0; }
  const tousDelais = vs.map((s) => delaiVente(ctx, s)).filter((x) => x != null);
  const distribution = [[0, 0], [1, 2], [3, 7], [8, 30], [31, Infinity]].map(([a, b]) => ({ de: a, a: b, n: tousDelais.filter((x) => x >= a && x <= b).length }));

  return {
    periode: p, ind: indicateurs(ctx, vs), prev: prevVs ? indicateurs(ctx, prevVs) : null, premier,
    serie, plateformes,
    marques: regrouper(ctx, vs, marqueDe, 10),
    categories: regrouper(ctx, vs, (s) => categorieDe(ctx, s), 8),
    delais: {
      plateforme: delaisPar(ctx, vs, cleplateforme), categorie: delaisPar(ctx, vs, (s) => categorieDe(ctx, s)), marque: delaisPar(ctx, vs, marqueDe, 3).slice(0, 8),
      distribution, n: tousDelais.length, moyenne: moyenne(tousDelais), mediane: mediane(tousDelais),
    },
    prixAffiche: prixAfficheDe(ctx, vs),
    joursSemaine: { n: jours.reduce((a, x) => a + x.nb, 0), jours },
    // Écoulement : vendus de la période ÷ (vendus + articles encore en stock aujourd'hui).
    ecoulement: cle === 'tout' ? null : { vendus: vs.length, stock: ctx.stock.length, taux: vs.length + ctx.stock.length > 0 ? vs.length / (vs.length + ctx.stock.length) : null },
    dernieres: [...vs].sort(comparerVentesRecentesDabord).slice(0, 8).map((s) => venteCourte(ctx, s)),
  };
}

// ── LE STOCK, AUJOURD'HUI ───────────────────────────────────────────────────
export const TRANCHES_AGE = [[0, 29], [30, 59], [60, 89], [90, Infinity]];
export function etatStock(ctx) {
  const ageDe = (it) => { const j = jourParis(ajoutDe(it)); return j ? ecartJours(j, ctx.auj) : null; };
  const enLigneDe = (it) => ctx.enLigneParArticle.get(it.id) ?? ctx.enLigneParArticle.get(String(it.id)) ?? [];
  const fiche = (it) => ({ id: it.id, titre: it.title ?? it.titre ?? '', age: ageDe(it), prixAchat: prixAchatNum(it), prixAffiche: Number(it.sell ?? it.prix_vente) || null, quantite: it.quantite || 1, plateformes: enLigneDe(it), importe: Boolean(it.origine) });
  const st = ctx.stock;
  const parPlateforme = {};
  let enLigne = 0;
  for (const it of st) { const e = enLigneDe(it); if (e.length) enLigne += 1; for (const p of e) parPlateforme[p] = (parPlateforme[p] ?? 0) + 1; }
  const parAge = st.filter((i) => ajoutDe(i)).sort((a, b) => (String(ajoutDe(a)) < String(ajoutDe(b)) ? -1 : 1));
  return {
    total: st.length, quantite: st.reduce((a, i) => a + (i.quantite || 1), 0), enLigne, pasEncore: st.length - enLigne, parPlateforme,
    lu: ctx.jobsConnus,
    immobilise: totalInvesti(st), avecPrix: st.filter((i) => prixAchatConnu(i)).length, sansPrix: st.filter((i) => !prixAchatConnu(i)).length,
    ages: TRANCHES_AGE.map(([a, b]) => { const xs = st.filter((i) => { const g = ageDe(i); return g != null && g >= a && g <= b; }); return { de: a, a: b, nb: xs.length, investi: totalInvesti(xs), enLigne: xs.filter((i) => enLigneDe(i).length).length }; }),
    plusAnciens: parAge.slice(0, 10).map(fiche),
    plusChers: st.filter((i) => prixAchatConnu(i) && prixAchatNum(i) > 0).sort((a, b) => prixAchatNum(b) * (b.quantite || 1) - prixAchatNum(a) * (a.quantite || 1)).slice(0, 8).map(fiche),
    pasEncoreListe: st.filter((i) => !enLigneDe(i).length).sort((a, b) => (String(ajoutDe(a)) < String(ajoutDe(b)) ? 1 : -1)).slice(0, 10).map(fiche),
    enLigneListe: (code) => parAge.filter((i) => enLigneDe(i).includes(code)).slice(0, 8).map(fiche),
  };
}

// ── MOIS PAR MOIS (12 derniers mois, depuis le premier mois avec une vente datée) ─
export function evolutionMensuelle(ctx) {
  const p = periode('12m', ctx.auj);
  const vs = ventesDe(ctx.ventes, p);
  const premier = vs.map(jourDeVente).filter(Boolean).sort()[0];
  if (!premier) return [];
  const borne = p.debut.slice(0, 7);
  return serieMois(ctx, vs, premier.slice(0, 7) > borne ? premier.slice(0, 7) : borne, ctx.auj.slice(0, 7));
}

/** Combien de ventes n'ont pas de date (elles n'entrent que dans « depuis le début »). */
export const nbSansDate = (ventes) => (Array.isArray(ventes) ? ventes : []).filter((s) => !jourDeVente(s)).length;

/**
 * Combien de ventes ont une HEURE réelle ? Les anciennes ventes portent midi (heure
 * de remplissage du 19/09) et un relevé date sa détection, pas la vente : ni l'un
 * ni l'autre ne dit l'heure. Sert à dire pourquoi l'écran n'affiche pas d'heures.
 */
const FMT_HEURE = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
export function nbHeuresReelles(ventes) {
  let n = 0;
  for (const s of Array.isArray(ventes) ? ventes : []) {
    if (!s?.vendu_le || s.source === 'releve') continue;
    const d = new Date(s.vendu_le);
    if (Number.isFinite(d.getTime()) && FMT_HEURE.format(d) !== '12:00:00') n += 1;
  }
  return n;
}

/** Écart avec la période d'avant : { valeur, sens: 1|-1|0, kind } ou null. */
export function ecart(cur, prev, kind = 'pct') {
  if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev)) return null;
  if (kind === 'pts' || kind === 'jours') { const d = cur - prev; return { valeur: d, sens: Math.abs(d) < 0.05 ? 0 : Math.sign(d), kind }; }
  if (prev === 0) return null;
  const r = ((cur - prev) / prev) * 100;
  return { valeur: r, sens: Math.abs(r) < 0.5 ? 0 : Math.sign(r), kind: 'pct' };
}
