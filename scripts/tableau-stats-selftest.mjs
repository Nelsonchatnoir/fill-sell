// `npm run selftest:tableau-stats` — la source unique des chiffres du Tableau,
// de l'en-tête et des Statistiques (28/10). Ventes fabriquées ici (aucune donnée
// réelle), un « aujourd'hui » fixe : le 28 octobre 2026.
//   1. les périodes sont nommées et bornées en jours de Paris (texte) ;
//   2. la comparaison se fait à jours égaux, et pas du tout sous 5 ventes ;
//   3. le délai de vente est un constat sur les articles créés dans FillSell ;
//   4. le prix affiché est celui publié sur la plateforme de la vente ;
//   5. profit, marge et encaissé suivent comptabilite.js / ventesStats.js ;
//   6. le stock est un état d'aujourd'hui.
import assert from 'node:assert/strict';
import {
  periode, ventesDe, ajouteMois, ajouteJours, ecartJours, jourParis, creerContexte, delaiVente, prixAffiche,
  indicateurs, blocPeriode, etatStock, evolutionMensuelle, comparable, ecart, marqueDe, categorieDe, nbSansDate,
  nbHeuresReelles, SEUIL_COMPARAISON, meilleuresVentes,
} from '../src/utils/tableauStats.js';

let n = 0;
const ok = (cond, quoi) => { assert.ok(cond, quoi); n += 1; };
const eq = (a, b, quoi) => { assert.deepStrictEqual(a, b, quoi); n += 1; };
const proche = (a, b, quoi) => { assert.ok(Math.abs(a - b) < 1e-9, `${quoi} : ${a} ≠ ${b}`); n += 1; };
const AUJ = '2026-10-28';

// ── 1. périodes ─────────────────────────────────────────────────────────────
eq(periode('mois', AUJ), { cle: 'mois', debut: '2026-10-01', fin: AUJ, precedente: { debut: '2026-09-01', fin: '2026-09-28' } }, 'mois : 1er → aujourd’hui, précédent à jours égaux');
eq(periode('mois', '2026-03-31').precedente, { debut: '2026-02-01', fin: '2026-02-28' }, 'mois : 31 mars → février borné au 28');
eq(periode('mois', '2026-01-15').precedente, { debut: '2025-12-01', fin: '2025-12-15' }, 'mois : janvier → décembre de l’année d’avant');
eq(periode('30j', AUJ), { cle: '30j', debut: '2026-09-29', fin: AUJ, precedente: { debut: '2026-08-30', fin: '2026-09-28' } }, '30 j : 30 jours, aujourd’hui compris');
eq(periode('12m', AUJ).debut, '2025-10-29', '12 mois glissants');
eq(periode('12m', AUJ).precedente, { debut: '2024-10-29', fin: '2025-10-28' }, '12 mois d’avant, contigus');
eq(periode('3m', AUJ).debut, '2026-07-29', '3 mois glissants');
eq(periode('tout', AUJ).precedente, null, 'depuis le début : aucune comparaison');
eq(ajouteMois('2026-03-31', -1), '2026-02-28', 'ajouteMois borne à la fin du mois');
eq(ajouteJours('2026-03-01', -1), '2026-02-28', 'ajouteJours');
eq(ecartJours('2026-10-01', '2026-10-28'), 27, 'écart en jours');
eq(jourParis(Date.parse('2026-10-27T23:30:00Z')), '2026-10-28', 'jour de Paris (UTC+1 en octobre après le 25)');
eq(jourParis('n’importe quoi'), null, 'instant illisible → null');

// ── jeux de données ─────────────────────────────────────────────────────────
const V = (id, date, sell, buy, plateforme, extra = {}) => ({ id, date, sell, prix_vente: sell, buy, margin: buy == null ? null : sell - buy, marginPct: buy == null || !(sell > 0) ? null : ((sell - buy) / sell) * 100, plateforme, plateforme_code: null, marque: '', type: '', title: `v${id}`, ...extra });
const ventes = [
  V(1, '2026-10-02', 10, 2, 'Vinted', { inventaire_id: 101, marque: 'Zara', type: 'Mode' }),
  V(2, '2026-10-02', 20, 0, 'vinted', { inventaire_id: 102, marque: 'zara ' }),        // gratuit : profit compté, pas de %
  V(3, '2026-10-10', 30, null, 'eBay', { inventaire_id: 103 }),                          // prix d'achat inconnu
  V(4, '2026-10-28', 15, 5, 'Leboncoin', { inventaire_id: 104, marque: 'Sans marque' }),
  V(5, '2026-10-29', 99, 1, 'Vinted'),                                                   // demain : hors période
  V(6, null, 7, 1, 'Vinted'),                                                            // sans date : « depuis le début » seulement
  ...Array.from({ length: 6 }, (_, i) => V(10 + i, `2026-09-0${i + 1}`, 5, 1, 'Vinted', { inventaire_id: 110 + i })),
  V(20, '2026-09-29', 8, 2, 'Beebs'),                                                    // 29 sept : hors comparaison « mois »
];
const items = [
  { id: 101, statut: 'vendu', origine: null, date_ajout: '2026-09-25T10:00:00Z' },
  { id: 102, statut: 'vendu', origine: 'vinted_sync', date_ajout: '2026-09-06T10:00:00Z' }, // importé → délai inconnu
  { id: 103, statut: 'vendu', origine: null, date_ajout: '2026-10-01T08:00:00Z', typeConnu: true, type: 'High-Tech' },
  { id: 104, statut: 'vendu', origine: null, date_ajout: '2026-08-01T08:00:00Z' },
  { id: 201, statut: 'stock', origine: null, date_ajout: '2026-10-20T08:00:00Z', buy: 3, quantite: 1, title: 'récent' },
  { id: 202, statut: 'stock', origine: null, date_ajout: '2026-07-01T08:00:00Z', buy: 10, quantite: 2, title: 'vieux' },
  { id: 203, statut: 'stock', origine: 'vinted_sync', date_ajout: '2026-09-06T08:00:00Z', buy: null, title: 'sans prix' },
  ...Array.from({ length: 6 }, (_, i) => ({ id: 110 + i, statut: 'vendu', origine: null, date_ajout: '2026-08-31T08:00:00Z' })),
];
const jobs = {
  101: [{ platform: 'vinted', published_at: '2026-09-27T09:00:00Z', price: 12 }, { platform: 'leboncoin', published_at: '2026-09-26T09:00:00Z', price: 11 }],
  103: [{ platform: 'ebay', published_at: '2026-10-03T09:00:00Z', price: 30 }],
  104: [{ platform: 'leboncoin', published_at: '2026-08-02T09:00:00Z', price: 20 }, { platform: 'leboncoin', published_at: '2026-10-29T09:00:00Z', price: 9 }],
};
const enLigne = new Map([[201, ['vinted', 'leboncoin']], [202, ['vinted']]]);
const ctx = creerContexte({ ventes, items, jobsParArticle: jobs, enLigneParArticle: enLigne, aujourdhui: AUJ });

// ── ventes d'une période ────────────────────────────────────────────────────
const pm = periode('mois', AUJ);
eq(ventesDe(ventes, pm).map((s) => s.id), [1, 2, 3, 4], 'octobre : du 1er au 28, ni demain ni sans date');
eq(ventesDe(ventes, periode('tout', AUJ)).length, ventes.length, 'depuis le début : tout, ventes sans date comprises');
eq(nbSansDate(ventes), 1, 'une vente sans date');

// ── 3. délai constaté ───────────────────────────────────────────────────────
eq(delaiVente(ctx, ventes[0]), 6, 'délai depuis la PREMIÈRE mise en ligne (26/09, Leboncoin) jusqu’au 2/10');
eq(delaiVente(ctx, ventes[1]), null, 'article importé d’un dressing : délai inconnu, écarté');
eq(delaiVente(ctx, ventes[2]), 7, 'première mise en ligne (3/10) plutôt que l’ajout (1/10) : 7 j');
eq(delaiVente(ctx, { ...ventes[0], inventaire_id: null }), null, 'vente sans article : aucun délai (jamais par le titre)');
eq(delaiVente(ctx, { ...ventes[0], date: null }), null, 'vente sans date : aucun délai');
eq(delaiVente(creerContexte({ ventes, items, aujourdhui: AUJ }), ventes[0]), null, 'jobs pas encore lus : aucun délai deviné depuis l’ajout');

// ── 4. prix affiché ─────────────────────────────────────────────────────────
eq(prixAffiche(ctx, ventes[0]), 12, 'prix publié sur la plateforme DE LA VENTE (Vinted 12 €, pas Leboncoin 11 €)');
eq(prixAffiche(ctx, ventes[3]), 20, 'dernier prix publié AVANT la vente (pas celui du 29/10)');
eq(prixAffiche(ctx, ventes[1]), null, 'aucun job publié : inconnu');

// ── 5. indicateurs ──────────────────────────────────────────────────────────
const io = indicateurs(ctx, ventesDe(ventes, pm));
eq(io.nb, 4, 'nb');
proche(io.encaisse, 75, 'encaissé = toutes les ventes');
proche(io.profit, 8 + 20 + 10, 'profit : prix d’achat connus seulement (gratuit compris)');
eq([io.profitRetenues, io.profitExclus], [3, 1], 'profit : 3 comptées, 1 sans prix d’achat');
proche(io.marge, ((8 + 20 + 10) / (10 + 20 + 15)) * 100, 'marge pondérée sur les prix d’achat connus, gratuit compris (29/10)');
eq([io.margeRetenues, io.margeAZero, io.margeSansPrix], [3, 1, 1], 'marge : 3 ventes (dont 1 gratuite), 1 sans prix d’achat');
proche(io.panier, 75 / 4, 'panier');
eq([io.delaiN, io.delaiMediane], [3, 7], 'délai : 3 ventes mesurées (6, 7 et 87 j)');
proche(io.delai, (6 + 7 + 87) / 3, 'délai moyen');
const vide = indicateurs(ctx, []);
eq([vide.nb, vide.encaisse, vide.marge, vide.panier, vide.delai], [0, 0, null, null, null], 'aucune vente : rien d’inventé');

// ── 2. comparaison ──────────────────────────────────────────────────────────
const b = blocPeriode(ctx, 'mois');
eq(b.prev.nb, 6, 'précédent = 1–28 sept. (le 29 n’y est pas)');
ok(comparable(b), `comparable à partir de ${SEUIL_COMPARAISON} ventes`);
ok(!comparable({ prev: { nb: 4 } }), 'pas de comparaison sous 5 ventes');
ok(!comparable(blocPeriode(ctx, 'tout')), 'pas de comparaison depuis le début');
eq(ecart(75, 30).sens, 1, 'écart positif');
proche(ecart(75, 30).valeur, 150, 'écart en %');
eq(ecart(5, 0), null, 'écart sur zéro : rien');
eq(ecart(72, 80, 'pts'), { valeur: -8, sens: -1, kind: 'pts' }, 'écart de marge en points');

// ── bloc d'une période ──────────────────────────────────────────────────────
eq(b.serie.pas, 'jour', 'mois : série jour par jour');
eq(b.serie.points.length, 28, 'mois : 28 points jusqu’à aujourd’hui');
eq(b.serie.prev.length, 28, 'mois : 28 points le mois d’avant');
eq(b.serie.finMois, '2026-10-31', 'mois : l’axe va jusqu’au 31');
proche(b.serie.points.at(-1).cumulCa, io.encaisse, 'le cumul du dernier jour = l’encaissé de la tuile');
proche(b.plateformes.reduce((a, l) => a + l.encaisse, 0), io.encaisse, 'Σ plateformes = encaissé, au centime');
eq(b.plateformes[0].cle, 'vinted', 'Vinted d’abord (le plus d’encaissé)');
eq(b.plateformes[0].nb, 2, '« Vinted » et « vinted » : une seule ligne');
eq(b.marques.find((m) => m.cle === 'zara')?.nb, 2, '« Zara » et « zara  » : une seule marque');
eq(marqueDe({ marque: 'Sans marque' }).cle, '∅', '« Sans marque » saisi = pas de marque');
eq(categorieDe(ctx, ventes[2]).cle, 'High-Tech', 'catégorie de l’article quand la vente n’en a pas');
eq(categorieDe(ctx, ventes[3]).cle, '∅', 'ni la vente ni l’article : non classé');
eq(b.joursSemaine.n, 4, 'jours de la semaine : ventes datées de la période');
eq(b.joursSemaine.jours[4].nb, 2, 'le 2 octobre 2026 est un vendredi');
eq(b.ecoulement, { vendus: 4, stock: 3, taux: 4 / 7 }, 'écoulement = vendus ÷ (vendus + stock)');
eq(blocPeriode(ctx, 'tout').ecoulement, null, 'écoulement sans objet depuis le début');
eq(b.prixAffiche.n, 3, 'prix affiché connu pour 3 ventes');
proche(b.prixAffiche.ratio, (10 + 30 + 15) / (12 + 30 + 20), 'ratio pondéré encaissé / affiché');
eq(b.prixAffiche.tranches.auPrix, 1, 'une vente au prix affiché');
const b12 = blocPeriode(ctx, '12m');
eq(b12.serie.pas, 'mois', '12 mois : mois par mois');
eq(b12.serie.points[0].mois, '2026-09', 'série depuis le premier mois avec une vente datée');

// ── 6. stock ────────────────────────────────────────────────────────────────
const st = etatStock(ctx);
eq([st.total, st.enLigne, st.pasEncore], [3, 2, 1], 'en ligne : la règle des pastilles (Map fournie)');
eq(st.parPlateforme, { vinted: 2, leboncoin: 1 }, 'par plateforme');
proche(st.immobilise, 3 + 10 * 2, 'immobilisé = prix d’achat × quantité, prix connus seulement');
eq([st.avecPrix, st.sansPrix], [2, 1], 'sans prix d’achat : non compté, dit');
eq(st.ages.map((a) => a.nb), [1, 1, 0, 1], 'ancienneté : 8 j, 52 j, 119 j');
eq(st.plusAnciens[0].titre, 'vieux', 'le plus ancien d’abord');
eq(st.enLigneListe('vinted').length, 2, 'articles en ligne sur une plateforme');
eq(etatStock(creerContexte({ items, aujourdhui: AUJ })).lu, false, 'jobs pas encore lus : l’écran le sait');

// ── évolution, heures ───────────────────────────────────────────────────────
eq(evolutionMensuelle(ctx).map((m) => [m.mois, m.nb]), [['2026-09', 7], ['2026-10', 4]], 'mois par mois depuis le premier mois daté');
eq(nbHeuresReelles([{ vendu_le: '2026-10-02T10:00:00Z' }, { vendu_le: '2026-10-02T11:00:00Z', source: 'manuel' }, { vendu_le: '2026-10-02T09:00:00Z', source: 'releve' }]), 1,
  'heure réelle : ni midi de remplissage, ni heure de relevé');

// ── meilleures ventes (téléphone) ──────────────────────────────────────────
const mv = meilleuresVentes(ctx, 'mois', 3);
eq(mv.map((v) => v.id), [2, 4, 1], 'meilleures ventes : bénéfice en euros (gratuit compris), prix d’achat connu seulement');
eq([mv[0].gratuit, mv[0].pct], [true, 100], 'gratuit : bénéfice et son % (prix connu, 29/10)');
eq(mv[2].achat, 2, 'prix d’achat rendu');

console.log(`tableau-stats : ${n} assertions OK`);
