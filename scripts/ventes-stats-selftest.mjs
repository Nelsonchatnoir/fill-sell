// `npm run selftest:ventes-stats` — les règles de lecture des ventes (16/10).
// Les quatre corrections vues sur le compte de Nico, prouvées sur des ventes
// fabriquées ici (aucune donnée réelle) :
//   a) une plateforme = UNE ligne, quelle que soit la casse du libellé ;
//   b) prix d'achat 0 € : bénéfice compté, AUCUN pourcentage, hors moyenne ;
//   c) « Sans plateforme » existe et la somme des lignes = le revenu ;
//   d) tri par date de vente décroissante, sans date en dernier.
// Plus : la courbe monotone ne dépasse jamais ses points.
import assert from 'node:assert/strict';
import {
  plateformeVente, codeDepuisLibelle, ventesParPlateforme, totalEncaisse, trierVentes, grouperParMois,
  margePctVente, margeMoyenne, prixAchatPositif, prixAchatZero, beneficeVente, margeDePeriode,
  libelleJours, joursPourVendre, indexAjouts, cheminMonotone, venteDeLaPlateforme, CLE_SANS_PLATEFORME,
} from '../src/utils/ventesStats.js';

let n = 0;
const ok = (cond, quoi) => { assert.ok(cond, quoi); n += 1; };
const eq = (a, b, quoi) => { assert.deepStrictEqual(a, b, quoi); n += 1; };

// ── a) plateformes ──────────────────────────────────────────────────────────
eq(plateformeVente({ plateforme: 'vinted' })?.cle, 'vinted', 'vinted');
eq(plateformeVente({ plateforme: 'Vinted' })?.cle, 'vinted', 'Vinted (libellé serveur)');
eq(plateformeVente({ plateforme: 'Vinted ' })?.cle, 'vinted', 'Vinted + espace');
eq(plateformeVente({ plateforme: 'vintee', plateforme_code: 'vinted' })?.cle, 'vinted', 'faute de frappe, code serveur');
eq(plateformeVente({ plateforme: 'eBay', plateforme_code: 'ebay' })?.libelle, 'eBay', 'libellé eBay');
eq(plateformeVente({ plateforme: 'Leboncoin ' })?.cle, 'leboncoin', 'Leboncoin + espace');
eq(plateformeVente({ plateforme: 'lbc' })?.cle, 'leboncoin', 'lbc');
eq(plateformeVente({ plateforme: 'Depop' })?.cle, 'depop', 'Depop nommée');
eq(plateformeVente({ plateforme: 'Ailleurs', plateforme_code: 'ailleurs' })?.cle, 'ailleurs', 'Ailleurs');
eq(plateformeVente({ plateforme: 'autre', plateforme_code: 'ailleurs' })?.cle, 'ailleurs', '« autre » + code ailleurs');
eq(plateformeVente({ plateforme: null, plateforme_code: null }), null, 'aucune plateforme');
eq(plateformeVente({ plateforme: '   ' }), null, 'libellé blanc');
eq(plateformeVente({ plateforme: null, plateforme_code: 'vinted' })?.cle, 'vinted', 'code seul');
// La personne corrige le libellé dans « Modifier » : le libellé gagne (le code n'est pas recalculé).
eq(plateformeVente({ plateforme: 'Leboncoin', plateforme_code: 'vinted' })?.cle, 'leboncoin', 'libellé corrigé prime');
const libre1 = plateformeVente({ plateforme: 'Vestiaire collectif ' });
const libre2 = plateformeVente({ plateforme: 'vestiaire  Collectif' });
eq(libre1.cle, libre2.cle, 'texte libre : casse et espaces ignorés');
eq(libre1.libelle, 'Vestiaire collectif', 'texte libre : libellé gardé');
ok(!['vinted', 'leboncoin', 'beebs', 'ebay', 'depop', 'opla'].includes(libre1.cle), 'texte libre jamais mêlé à une plateforme');
eq(codeDepuisLibelle('Le bon coin'), 'leboncoin', 'miroir plateforme_normalisee : le bon coin');
eq(codeDepuisLibelle('brocante'), 'autre', 'miroir plateforme_normalisee : autre');
eq(codeDepuisLibelle(''), null, 'miroir plateforme_normalisee : vide');

// Le cas de Nico : 16 « vinted » + 1 « Vinted » = UNE ligne de 17.
const ventesNico = [
  ...Array.from({ length: 16 }, (_, i) => ({ id: i + 1, plateforme: 'vinted', sell: 20, date: '2026-08-01' })),
  { id: 17, plateforme: 'Vinted', plateforme_code: 'vinted', sell: 18, date: '2026-10-02' },
  { id: 18, plateforme: 'Ailleurs', plateforme_code: 'ailleurs', sell: 14.99, date: '2026-10-04' },
  { id: 19, plateforme: null, sell: 2468, buy: 200, margin: 2268, date: '2026-07-21' },
  { id: 20, plateforme: 'leboncoin', sell: 110, date: '2025-03-01' },
  { id: 21, plateforme: 'ebay', sell: 30, buy: 0, margin: 30, marginPct: 100, date: '2026-07-31' },
];
const lignes = ventesParPlateforme(ventesNico);
eq(lignes.filter((l) => l.libelle === 'Vinted').length, 1, 'a) Vinted une seule fois');
eq(lignes.find((l) => l.cle === 'vinted').nb, 17, 'a) Vinted : 17 ventes');
// ── c) sans plateforme + somme ──────────────────────────────────────────────
eq(lignes[lignes.length - 1].cle, CLE_SANS_PLATEFORME, 'c) « Sans plateforme » en dernier');
eq(lignes[lignes.length - 1].libelle, 'Sans plateforme', 'c) libellé');
eq(Math.round(lignes.reduce((a, l) => a + l.ca, 0) * 100), Math.round(totalEncaisse(ventesNico) * 100), 'c) Σ lignes = revenu au centime');
eq(lignes.reduce((a, l) => a + l.nb, 0), ventesNico.length, 'c) Σ ventes = nombre de ventes');
ok(venteDeLaPlateforme(ventesNico[16], 'vinted'), 'filtre : « Vinted » dans le filtre vinted');
ok(venteDeLaPlateforme(ventesNico[18], CLE_SANS_PLATEFORME), 'filtre : sans plateforme');
ok(venteDeLaPlateforme(ventesNico[0], 'toutes'), 'filtre : toutes');

// ── b) prix d'achat 0 € ─────────────────────────────────────────────────────
const gratuit = { sell: 120, buy: 0, margin: 120, marginPct: 100 };
const inconnu = { sell: 50, buy: null, margin: null, marginPct: null };
const paye = { sell: 2468, buy: 200, margin: 2268, marginPct: 2268 / 2468 * 100 };
eq(margePctVente(gratuit), null, 'b) 0 € : aucun pourcentage');
eq(beneficeVente(gratuit), 120, 'b) 0 € : le bénéfice en euros reste');
ok(prixAchatZero(gratuit) && !prixAchatPositif(gratuit), 'b) 0 € reconnu comme saisi, pas positif');
eq(margePctVente(inconnu), null, 'b) inconnu : aucun pourcentage');
ok(!prixAchatZero(inconnu), 'b) NULL ≠ 0 €');
eq(beneficeVente(inconnu), null, 'b) inconnu : aucun bénéfice');
ok(Math.abs(margePctVente(paye) - 91.896) < 0.01, 'b) prix > 0 : pourcentage');
eq(margePctVente({ sell: 10, buy: '0', margin: 10 }), null, 'b) « 0 » en texte : aucun pourcentage');
eq(margePctVente({ sell: 10, buy: 4, prix_achat_inconnu: true, margin: 6 }), null, 'b) « je ne sais plus » : aucun pourcentage');
const moy = margeMoyenne([gratuit, inconnu, paye], { mode: 'simple' });
eq(moy.retenues, 1, 'b) moyenne : seule la vente au prix > 0 compte');
eq(moy.aZero, 1, 'b) moyenne : 0 € compté à part');
eq(moy.sansPrix, 1, 'b) moyenne : inconnu compté à part');
ok(Math.abs(moy.pct - 91.896) < 0.01, 'b) la moyenne ne monte pas à 100 % avec le gratuit');
eq(margeMoyenne([gratuit, inconnu]).pct, null, 'b) aucune vente au prix > 0 : pas de moyenne (et pas 0,0 %)');
const pond = margeMoyenne([paye, { sell: 100, buy: 50, margin: 50, marginPct: 50 }]);
ok(Math.abs(pond.pct - (2318 / 2568) * 100) < 1e-9, 'moyenne pondérée = Σ bénéfices / Σ ventes');
// Meilleure marge par plateforme : eBay (que des ventes à 0 €) n'a pas de %.
eq(margeMoyenne(ventesNico.filter((s) => s.plateforme === 'ebay')).pct, null, 'b) « Meilleure marge : eBay 100 % » impossible');

// ── marge par période ───────────────────────────────────────────────────────
eq(margeDePeriode([]).etat, 'vide', 'mois sans vente : aucun point');
eq(margeDePeriode([inconnu, gratuit]).etat, 'sans_achat', 'mois sans prix d\'achat > 0 : hachures, pas 0 %');
eq(margeDePeriode([paye]).etat, 'ok', 'mois avec prix');

// ── d) tri par date de vente ────────────────────────────────────────────────
const melange = [
  { id: 1, date: '2024-02-13', cree_le: '2026-10-10T10:00:00Z' },
  { id: 2, date: '2026-10-04', cree_le: '2026-10-04T10:00:00Z' },
  { id: 3, date: null, cree_le: '2026-10-15T10:00:00Z' },
  { id: 4, date: '2025-03-01', cree_le: '2026-10-10T10:00:01Z' },
  { id: 5, date: '2026-10-04', cree_le: '2026-10-04T12:00:00Z' },
  { id: 6, date: '2024-11-20', cree_le: '2026-10-10T10:00:02Z' },
];
eq(trierVentes(melange).map((s) => s.id), [5, 2, 4, 6, 1, 3], 'd) date décroissante, enregistrement à date égale, sans date en dernier');
eq(melange[0].id, 1, 'd) trierVentes ne modifie pas la liste reçue');
const groupes = grouperParMois(trierVentes(melange));
eq(groupes.map((g) => g.cle), ['2026-10', '2025-03', '2024-11', '2024-02', 'sans-date'], 'd) mois dans l\'ordre décroissant');
eq(groupes[0].lignes.length, 2, 'd) deux ventes en octobre 2026');
eq(groupes[0].mois, 9, 'd) mois 0-11');

// ── délai ───────────────────────────────────────────────────────────────────
eq(libelleJours(0), '< 1 j', '« < 1 j » au lieu de « 0j »');
eq(libelleJours(0.4), '< 1 j', 'moins d\'un jour');
eq(libelleJours(5), '5 j', '5 j');
eq(libelleJours(null), '—', 'inconnu');
const idx = indexAjouts([{ id: 9, title: 'Veste', date_ajout: '2026-10-01T08:00:00Z' }, { id: 10, title: 'Veste', date_ajout: '2026-09-01T08:00:00Z' }]);
eq(joursPourVendre({ inventaire_id: 9, title: 'Veste', date: '2026-10-06' }, idx), 5, 'délai par la fiche liée (inventaire_id)');
eq(joursPourVendre({ inventaire_id: 999, title: 'inconnu', date: '2026-10-06' }, idx), null, 'délai inconnu');
eq(joursPourVendre({ title: 'Veste', date: null }, idx), null, 'sans date de vente : pas de délai');

// ── courbe monotone ─────────────────────────────────────────────────────────
// Le point du milieu est à 0 % (y = 130, la ligne du bas) : une spline
// classique creuse SOUS la ligne entre deux mois ; la monotone ne le fait pas.
const pts = [{ x: 0, y: 20 }, { x: 50, y: 130 }, { x: 100, y: 125 }, { x: 150, y: 10 }];
const d = cheminMonotone(pts);
const nombres = (d.match(/-?\d+(\.\d+)?/g) || []).map(Number);
const ys = nombres.filter((_, i) => i % 2 === 1);
ok(Math.max(...ys) <= 130 + 1e-9, 'monotone : jamais sous le point le plus bas (0 %)');
ok(Math.min(...ys) >= 10 - 1e-9, 'monotone : jamais au-dessus du point le plus haut');
ok(d.startsWith('M0,20') && d.endsWith('150,10'), 'monotone : passe par le premier et le dernier point');
eq(cheminMonotone([]), '', 'aucun point : aucun chemin');
eq(cheminMonotone([{ x: 3, y: 4 }]), 'M3,4', 'un point');

console.log(`ventes-stats : ${n} assertions OK`);
