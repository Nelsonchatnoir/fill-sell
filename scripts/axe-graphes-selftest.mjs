// `npm run selftest:axe-graphes` — la RÈGLE des libellés de l'axe horizontal (29/10, bug
// « janvfévmarsavr… » vu sur iPhone dans la feuille Vinted · depuis le début) : pour tous
// les graphes, à toutes les largeurs et toutes les périodes, jamais deux libellés qui se
// touchent, jamais un libellé coupé au bord. Géométrie des vrais graphes (Graphes.jsx) :
// colonnes centrées dans leur bande, courbes de bord à bord ; texte mesuré large.
import assert from 'node:assert/strict';
import { axeMois, axeJours, axeSimple, grillesSemaines, placerAxe, largeurApprochee, ECART_LIBELLES } from '../src/ecrans/bureau/axe.js';

let n = 0;
const ok = (cond, quoi) => { assert.ok(cond, quoi); n += 1; };
const eq = (a, b, quoi) => { assert.deepStrictEqual(a, b, quoi); n += 1; };
const mesures = [largeurApprochee(11.5), (t, g) => t.length * 11.5 * (g ? 0.72 : 0.68)];
const mesurer = mesures[0];

// Géométrie de Colonnes (padL 48 avec axe Y, 6 sans ; padR 8) et de Courbes (padL / padR).
const colonnes = (n, w, padL = 48) => { const bande = Math.max(10, w - padL - 8) / Math.max(1, n); return (i) => padL + bande * i + bande / 2; };
const courbes = (n, w, padL = 56, padR = 86) => { const iw = Math.max(10, w - padL - padR); return (i) => padL + (n <= 1 ? 0 : (i * iw) / (n - 1)); };

/** Vérifie la règle sur un résultat de placerAxe. */
function verifie(res, largeur, mes, quoi) {
  for (const k of res) {
    const w = mes(k.l, Boolean(k.gras || k.annee));
    ok(k.x - w / 2 >= -1e-9 && k.x + w / 2 <= largeur + 1e-9, `${quoi} : « ${k.l} » sort du graphe`);
  }
  for (let j = 1; j < res.length; j += 1) {
    const a = res[j - 1], b = res[j];
    const ga = mes(a.l, Boolean(a.gras || a.annee)) / 2, gb = mes(b.l, Boolean(b.gras || b.annee)) / 2;
    ok(b.x - gb - (a.x + ga) >= ECART_LIBELLES - 1e-9, `${quoi} : « ${a.l} » et « ${b.l} » se touchent`);
  }
}
const cles = (debut, nb) => Array.from({ length: nb }, (_, k) => {
  const a = Number(debut.slice(0, 4)), m = Number(debut.slice(5, 7)) - 1 + k;
  return `${a + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`;
});

// ── 1. Le cas vu sur iPhone : 22 mois (janv. 2025 → oct. 2026) dans la feuille, 390 px ─────
{
  const c = cles('2025-01', 22);
  const largeur = 390 - 2 * 14; // feuille : 14 px de marge de chaque côté
  const res = placerAxe(axeMois(c, 'fr'), { x: colonnes(22, largeur), largeur, mesurer });
  verifie(res, largeur, mesurer, 'iPhone, Vinted depuis le début');
  ok(res.length >= 2, 'iPhone : au moins deux repères');
  ok(res.length < 22, 'iPhone : un libellé par mois ne tient pas, on en saute');
  ok(res.some((k) => k.l === '2025') && res.some((k) => k.l === '2026'), 'iPhone : les changements d’année sont nommés (« 2025 », « 2026 »)');
  ok(!res.some((k) => k.l === 'janv.'), 'série sur deux années : janvier s’écrit avec l’année');
}

// ── 2. Les jeux de mois ───────────────────────────────────────────────────────────────
{
  const douze = cles('2025-11', 12);
  const res = placerAxe(axeMois(douze, 'fr', { gras: (i) => i === 11 }), { x: colonnes(12, 1100), largeur: 1100, mesurer });
  eq(res.length, 12, '12 mois sur un grand écran : tous les mois');
  eq(res[2].l, '2026', '12 mois à cheval sur deux années : janvier = « 2026 »');
  ok(res[11].gras, 'le mois en cours reste mis en avant');
  const une = cles('2026-03', 8);
  eq(placerAxe(axeMois(une, 'fr'), { x: colonnes(8, 900), largeur: 900, mesurer }).map((k) => k.l), ['mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.'], 'une seule année : les noms de mois');
  eq(placerAxe(axeMois(cles('2026-01', 10), 'en'), { x: colonnes(10, 900), largeur: 900, mesurer })[0].l, 'Jan', 'anglais, une seule année : « Jan »');
  // Trimestres alignés sur le calendrier (janv. avr. juil. oct.), jamais « un mois sur trois » au hasard.
  const jeux = axeMois(cles('2024-05', 30), 'fr');
  eq(jeux[2].map((k) => k.l), ['juil.', 'oct.', '2025', 'avr.', 'juil.', 'oct.', '2026', 'avr.', 'juil.', 'oct.'], 'pas de 3 mois : trimestres du calendrier');
  eq(jeux[4].map((k) => k.l), ['2024', '2025', '2026'], 'pas de 12 mois : l’année de départ (facultative) puis chaque changement d’année');
  eq(axeMois([], 'fr'), [[]], 'série vide');
}

// ── 3. Toutes les largeurs × toutes les longueurs : la règle tient partout ───────────────
{
  let cas = 0;
  for (const mes of mesures) {
    for (let w = 220; w <= 1920; w += 23) {
      for (let nb = 1; nb <= 130; nb += (nb < 30 ? 1 : 7)) {
        for (const debut of ['2025-01', '2024-07', '2019-11']) {
          const c = cles(debut, nb);
          for (const [nom, x] of [['colonnes', colonnes(nb, w)], ['colonnes sans axe Y', colonnes(nb, w, 6)]]) {
            const res = placerAxe(axeMois(c, 'fr', { gras: (i) => i === nb - 1 }), { x, largeur: w, mesurer: mes });
            verifie(res, w, mes, `${nom} ${nb} mois depuis ${debut}, ${w} px`);
            ok(res.length >= 1, `${nom} ${nb} mois, ${w} px : au moins un repère`);
            cas += 1;
          }
        }
      }
      // Jours : Courbes du Tableau (ordinateur, téléphone) et colonnes jour par jour des détails.
      for (const nj of [1, 2, 7, 28, 29, 30, 31]) {
        for (const auj of [0, Math.floor(nj / 2), nj - 3, nj - 2, nj - 1].filter((a) => a >= 0)) {
          const lib = (i) => `${i + 1} oct.`;
          const bureau = axeJours({ n: nj, lib, grilles: [[0, 7, 14, 21], [0, 14], [0]], aujourdhui: auj, libAuj: 'auj.', fin: true });
          const r1 = placerAxe(bureau, { x: courbes(nj, w), largeur: w, mesurer: mes });
          verifie(r1, w, mes, `courbe ordinateur ${nj} j (auj. ${auj}), ${w} px`);
          ok(r1.some((k) => k.l === 'auj.'), `courbe ${nj} j, ${w} px : « auj. » toujours là`);
          const tel = axeJours({ n: nj, lib, grilles: [[0, Math.round((nj - 1) / 2)], [0]], aujourdhui: auj, libAuj: 'auj.', fin: true });
          verifie(placerAxe(tel, { x: courbes(nj, w, 46, 14), largeur: w, mesurer: mes }), w, mes, `courbe téléphone ${nj} j, ${w} px`);
          const det = axeJours({ n: nj, lib: (i) => String(i + 1), grilles: grillesSemaines(nj), fin: true });
          verifie(placerAxe(det, { x: colonnes(nj, w), largeur: w, mesurer: mes }), w, mes, `jour par jour ${nj} j, ${w} px`);
          cas += 3;
        }
      }
      const semaine = placerAxe(axeSimple(['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']), { x: colonnes(7, w, 6), largeur: w, mesurer: mes });
      verifie(semaine, w, mes, `jours de la semaine, ${w} px`);
      if (w >= 300) eq(semaine.length, 7, `jours de la semaine, ${w} px : les sept`);
      cas += 1;
    }
  }
  ok(cas > 20000, `${cas} cas de graphe vérifiés`);
}

// ── 4. « auj. » passe avant ses voisins ; la fin du mois seulement si elle a la place ───
{
  const lib = (i) => `${i + 1} oct.`;
  const jeux = axeJours({ n: 31, lib, grilles: [[0, 7, 14, 21], [0, 14], [0]], aujourdhui: 28, libAuj: 'auj.', fin: true });
  const large = placerAxe(jeux, { x: courbes(31, 1400), largeur: 1400, mesurer }).map((k) => k.l);
  eq(large, ['1 oct.', '8 oct.', '15 oct.', '22 oct.', 'auj.', '31 oct.'], 'ordinateur large : comme avant (1, 8, 15, 22, auj., 31)');
  const etroit = placerAxe(jeux, { x: courbes(31, 520), largeur: 520, mesurer }).map((k) => k.l);
  ok(etroit.includes('auj.') && !etroit.includes('31 oct.'), 'étroit : « 31 oct. » trop près de « auj. » s’efface');
  const j21 = placerAxe(axeJours({ n: 31, lib, grilles: [[0, 7, 14, 21]], aujourdhui: 22, libAuj: 'auj.' }), { x: courbes(31, 700), largeur: 700, mesurer }).map((k) => k.l);
  ok(j21.includes('auj.') && !j21.includes('22 oct.'), 'un repère qui touche « auj. » s’efface, la grille reste');
}

console.log(`axe-graphes : ${n} vérifications, toutes vertes`);
