// ═══════════════════════════════════════════════════════════════════════════
// LES 3 JAUGES À L'ÉCRAN — src/utils/jauges.js (04/11/2026, maquettes validées par Nico le 03/11)
//     npm run selftest:jauges-affichage
// ═══════════════════════════════════════════════════════════════════════════
// La règle d'affichage unique : interrupteur (vu de quotas_etat et de coin_config), grille lue dans coin_config,
// coût avant publication (« Cette publication utilisera… », « Il te restera… »), partage du lot, pastille de
// l'en-tête, palier qui débloque, refus du serveur → jauge pleine.
import {
  grilleActive, grilleActiveConfig, grilleDuPalier, nombre, motJauge, jaugesDuCompte, coutPublication,
  partageDuLot, jaugeLaPlusProche, palierQuiDebloque, jaugeDuRefus,
} from '../src/utils/jauges.js';

let verts = 0, rouges = 0;
const ok = (c, m, d = '') => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ''}`); } };
const egal = (a, b, m) => ok(a === b, m, `${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

// quotas_etat tel que le serveur le rend, grille active.
const etat = (a, p, r, { aInf = false, pInf = false, rInf = false, lens = null } = {}) => ({
  grille: 'trois_jauges', palier: 'x',
  annonces: { plafond: aInf ? null : a[1], consommes: a[0], restantes: aInf ? null : a[1] - a[0] },
  annonces_mode: aInf ? 'illimite' : 'mensuel',
  publications: pInf ? { mode: 'illimite', plafond: null, consommes: p[0] } : { mode: 'mensuel', plafond: p[1], consommes: p[0], restantes: p[1] - p[0] },
  republication: rInf ? { mode: 'illimite' } : { mode: 'mensuel', plafond: r[1], faites: r[0], restantes: r[1] - r[0] },
  lens,
});

console.log('1. L’interrupteur');
ok(!grilleActive(null) && !grilleActive({ annonces: { plafond: 5 } }) && !grilleActive({ error: 'x', grille: 'trois_jauges' }), 'quotas_etat sans « grille » (interrupteur à 0) : rien ne change');
ok(grilleActive({ grille: 'trois_jauges' }), 'quotas_etat avec « grille » : la grille');
ok(!grilleActiveConfig({}) && !grilleActiveConfig({ grille_trois_jauges: 0 }) && grilleActiveConfig({ grille_trois_jauges: 1 }), 'coin_config : 1 seulement');
ok(jaugesDuCompte({ annonces: { plafond: 5, consommes: 1 } }) === null, 'pas de grille : pas de jauges (l’écran garde son affichage d’avant)');

console.log('2. La grille, lue dans coin_config (0 = illimité)');
const K = { jauge_annonces_free: 5, jauge_publications_free: 50, jauge_remontees_free: 30, jauge_annonces_business: 0, jauge_publications_business: 0,
  jauge_remontees_business: 0, jauge_lens_business: 600, jauge_remontees_pro: 0, quota_retouche_premium: 5 };
const gf = grilleDuPalier(K, 'gratuit');
ok(gf.annonces === 5 && gf.publications === 50 && gf.remontees === 30, 'Free : 5 / 50 / 30 (« gratuit » côté app = « free »)');
const gb = grilleDuPalier(K, 'business');
ok(gb.annonces === Infinity && gb.publications === Infinity && gb.remontees === Infinity && gb.lens === 600 && gb.retouches === 50, 'Business : tout illimité, sauf Lens 600 et retouches 50');
ok(grilleDuPalier(K, 'pro').remontees === Infinity && grilleDuPalier({}, 'premium').publications === 400, 'Pro : remontées illimitées ; clé absente : le repli (Premium 400)');
egal(nombre(Infinity), 'illimité', '« illimité » avec le mot');
egal(nombre(1500), (1500).toLocaleString('fr-FR'), 'les milliers à la française');
ok(motJauge('annonces', 0) === 'annonce' && motJauge('annonces', 1) === 'annonce' && motJauge('annonces', 2) === 'annonces' && motJauge('remontees', 3) === 'remontées', 'accords : 0 annonce, 1 annonce, 2 annonces, 3 remontées');

console.log('3. Le coût avant publication');
const free = jaugesDuCompte(etat([0, 5], [3, 50], [0, 30]));
let c = coutPublication({ annonces: 1, publications: 3 }, free);
egal(c.utilise, 'Cette publication utilisera 1 annonce et 3 publications.', 'unité : « Cette publication utilisera 1 annonce et 3 publications. »');
egal(c.reste, 'Il te restera 4 annonces et 44 publications ce mois-ci.', '… « Il te restera 4 annonces et 44 publications ce mois-ci. »');
c = coutPublication({ annonces: 0, publications: 3 }, free);
egal(c.utilise, 'Cette publication utilisera 3 publications.', 'texte déjà rédigé : aucune annonce dans la phrase');
egal(c.reste, 'Il te restera 44 publications ce mois-ci.', '… et le reste ne parle que des publications');
const biz = jaugesDuCompte(etat([250, 0], [900, 0], [0, 0], { aInf: true, pInf: true, rInf: true, lens: { plafond: 600, consommes: 12, restantes: 588 } }));
c = coutPublication({ annonces: 1, publications: 3 }, biz);
ok(c.utilise === 'Cette publication utilisera 1 annonce et 3 publications.' && c.reste === 'Il te restera : illimité.', 'Business : « Il te restera : illimité. »', JSON.stringify(c));
ok(biz.lens.restantes === 588, 'Business : Lens 588 restants');
const prem = jaugesDuCompte(etat([0, 40], [0, 400], [0, 1500]));
c = coutPublication({ annonces: 12, publications: 30 }, prem, { lot: true });
egal(c.utilise, 'Ce lot utilisera 12 annonces et 30 publications.', 'lot : « Ce lot utilisera 12 annonces et 30 publications. »');
egal(c.reste, 'Il te restera 28 annonces et 370 publications ce mois-ci.', '… « Il te restera 28 annonces et 370 publications ce mois-ci. »');
const plein = jaugesDuCompte(etat([5, 5], [10, 50], [0, 30]));
c = coutPublication({ annonces: 1, publications: 2 }, plein);
ok(c.suffit === false && c.bloque === 'annonces', 'annonces épuisées : la jauge qui bloque est nommée');
c = coutPublication({ annonces: 0, publications: 2 }, plein);
ok(c.suffit === true && c.reste === 'Il te restera 38 publications ce mois-ci.', 'annonces épuisées, texte déjà rédigé : il passe', JSON.stringify(c));
c = coutPublication({ annonces: 1, publications: 2 }, jaugesDuCompte(etat([4, 5], [10, 50], [0, 30])));
egal(c.reste, 'Il te restera 0 annonce et 38 publications ce mois-ci.', 'la dernière annonce : « 0 annonce »');
ok(coutPublication({ annonces: 1, publications: 1 }, null).reste === null, 'sans grille : aucune phrase de reste');

console.log('4. Le mur du lot');
const lot12 = Array.from({ length: 12 }, () => ({ redaction: true, plateformes: 2 }));
let pa = partageDuLot(lot12, jaugesDuCompte(etat([0, 5], [9, 50], [0, 30])));
ok(pa.maintenant === 5 && pa.plusTard === 7 && pa.bloque === 'annonces', 'Free, 5 annonces : 5 articles maintenant, 7 plus tard, bloqués par les annonces', JSON.stringify(pa));
pa = partageDuLot(lot12, jaugesDuCompte(etat([0, 40], [386, 400], [0, 1500])));
ok(pa.maintenant === 7 && pa.bloque === 'publications', 'Premium, 14 publications : 7 articles sur 2 plateformes, bloqués par les publications', JSON.stringify(pa));
pa = partageDuLot(lot12, biz);
ok(pa.maintenant === 12 && pa.plusTard === 0 && pa.bloque === null, 'Business : tout le lot');

console.log('5. La pastille, le palier qui débloque, les refus');
const pastille = jaugeLaPlusProche(jaugesDuCompte(etat([3, 5], [31, 50], [30, 30])));
ok(pastille && pastille.cle === 'remontees' && pastille.restantes === 0 && pastille.basse, 'la jauge la plus proche de la fin (remontées 0 / 30), en ambre', JSON.stringify(pastille));
ok(jaugeLaPlusProche(biz) === null, 'Business : pas de pastille');
ok(jaugeLaPlusProche(jaugesDuCompte(etat([64, 120], [1162, 1200], [0, 0], { rInf: true }))).cle === 'publications', 'Pro : publications basses → « publications »');
egal(palierQuiDebloque('annonces', 'free', K), 'premium', 'annonces pleines en Free → Premium');
egal(palierQuiDebloque('remontees', 'premium', K), 'pro', 'remontées pleines en Premium → Pro (illimitées)');
egal(palierQuiDebloque('publications', 'pro', K), 'business', 'publications pleines en Pro → Business');
ok(palierQuiDebloque('remontees', 'pro', K) === null && palierQuiDebloque('lens', 'business', K) === null, 'rien au-dessus : aucune offre (Pro remontées, Lens du Business)');
ok(jaugeDuRefus({ reason: 'quota_publications_atteint' }).cle === 'publications' && jaugeDuRefus({ reason: 'plafond_republication_mensuel' }).cle === 'remontees', 'refus → jauge (publications, remontées)');
ok(jaugeDuRefus({ error: 'quota_scan_atteint', jauge: 'lens' }).cle === 'lens' && jaugeDuRefus({ reason: 'pro_daily_cap_reached', garde_fou: true, jauge: 'annonces' }).gardeFou === true, 'Lens du Business, garde-fou : reconnus');
ok(jaugeDuRefus({ reason: 'insufficient_coins' }) === null, 'un autre refus : rien');

console.log(`\n${rouges === 0 ? '✓' : '✗'} jauges-affichage : ${verts} contrôles verts, ${rouges} rouges`);
process.exit(rouges === 0 ? 0 : 1);
