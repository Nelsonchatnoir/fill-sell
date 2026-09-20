// ═══════════════════════════════════════════════════════════════════════════
// « MES ANNONCES » LEBONCOIN NE REND QUE 30 LIGNES — ON DÉROULE (20/09)
// ═══════════════════════════════════════════════════════════════════════════
// LE CAS, en base, job d012a3b0 (Ornella, « Veste denim noir Fantazia
// capuche ») : armé le 12/09, cinq tentatives, `failed` le 20/09 à 11h43. Son
// diagnostic conservé dit tout :
//
//   « annonce introuvable dans Mes annonces (id=?, titre="Veste denim noir
//     Fantazia capuche") — 30 carte(s) rendue(s), titres relevés: [...] »
//
// TRENTE. C'est exactement le `limit` de dashboard/v1/search. Les vingt-cinq
// titres relevés sont tous d'autres annonces d'Ornella. L'annonce n'était pas
// absente : elle était au-delà du premier lot, et rien ne déroulait la suite.
// On a dit cinq fois « introuvable » à propos d'une annonce présente.
//
// ⛔ CE QUI NE DOIT PAS BOUGER : sans lien, la cible reste identifiée par la
//    MÊME garde qu'avant (annonceNommee), et DEUX cartes qui correspondent
//    font toujours abandonner. Dérouler la liste donne accès à plus de
//    candidates — donc la garde d'ambiguïté compte encore plus qu'avant.
//
//   node scripts/lbc-mes-annonces-defilement-selftest.mjs
import fs from 'node:fs';

let ko = 0;
const ok = (n, c, d) => { if (!c) ko++; console.log(`  ${c ? 'ok  ' : '❌  '} ${n}${c || d === undefined ? '' : `  → ${d}`}`); };
// ⚠️ Le dépôt est en CRLF sous Windows : on normalise, sinon chaque motif
// multiligne tombe pour une raison qui n'a rien à voir avec le code testé.
const src = fs.readFileSync('chrome-extension/content-scripts/leboncoin.js', 'utf8')
  .split('\r\n').join('\n');

console.log('1. LE DÉROULÉ EXISTE ET PART AVANT LA RECHERCHE');
ok('la fonction de déroulé est là', /async function deroulerMesAnnonces\(trouve, t\)/.test(src));
ok('elle est appelée AVANT de chercher l\'ancre',
  src.indexOf('await deroulerMesAnnonces(') > -1
  && src.indexOf('await deroulerMesAnnonces(') < src.indexOf('let anchor = null;'));
ok('le sélecteur de cartes est UNE constante, plus quatre copies',
  (src.match(/LBC_CARTES_SEL/g) || []).length >= 4
  && (src.match(/ad_item_container/g) || []).length === 1);

console.log('\n2. LES BORNES — une liste qu\'on ne finit pas de lire ne conclut rien');
ok('40 paliers (1 200 annonces, au-dessus du plus gros compte du parc)', /PALIERS_MAX = 40/.test(src));
ok('60 s de défilement au total', /DUREE_MAX_MS = 60_000/.test(src));
ok('on attend la CROISSANCE, pas une durée au hasard', /apres === vues/.test(src));

console.log('\n3. LA BOUCLE, EXÉCUTÉE — pas relue');
// On extrait la fonction du fichier et on l'exécute contre un faux DOM. Un
// contrôle qui relit le code ne prouve que l'orthographe du code : c'est
// exactement comme ça qu'un appel au mauvais champ est passé au vert sur le
// pré-vol Opla le même jour.
const corps = /const LBC_CARTES_SEL[\s\S]*?\nasync function deroulerMesAnnonces\(trouve, t\) \{[\s\S]*?\n\}\n/.exec(src);
if (!corps) { ok('la fonction est extractible pour être exécutée', false); }
else {
  const fabriquer = (lots) => {
    // Un faux « défilement infini » : chaque scrollTo livre le lot suivant.
    let servis = lots.length ? lots[0] : 0, i = 0;
    const doc = {
      documentElement: { scrollHeight: 10000 },
      querySelectorAll: () => ({ length: servis }),
    };
    const win = { scrollTo: () => { i = Math.min(i + 1, lots.length - 1); servis = lots[i]; } };
    return { doc, win, vus: () => servis, paliers: () => i };
  };
  const lancer = async (lots, trouveA) => {
    const { doc, win, vus, paliers } = fabriquer(lots);
    const trace = [];
    const f = new Function('document', 'window', 'setTimeout',
      `${corps[0]}; return deroulerMesAnnonces;`)(doc, win, (fn) => fn());
    const rendu = await f(() => trouveA !== null && vus() >= trouveA, (l) => trace.push(l));
    return { rendu, paliers: paliers(), trace };
  };

  const r1 = await lancer([30, 60, 90, 120], null);
  ok('liste de 120 : on déroule jusqu\'à la fin quand la cible n\'est jamais là',
    r1.rendu === 120 && /plus de croissance/.test(r1.trace.join(' ')), `${r1.rendu} cartes`);

  const r2 = await lancer([30, 60, 90, 120], 45);
  ok('on s\'ARRÊTE dès que la cible paraît (pas 1 200 lignes pour en retirer une)',
    r2.rendu === 60 && r2.paliers === 1, `${r2.rendu} cartes, ${r2.paliers} palier(s)`);

  const r3 = await lancer([30], 999);
  ok('liste de 30 qui ne pousse pas : un seul palier, aucune attente inutile',
    r3.rendu === 30 && /plus de croissance/.test(r3.trace.join(' ')), `${r3.rendu} cartes`);

  const r4 = await lancer([5], null);
  ok('petit compte (5 annonces) : on sort sans dérouler pour rien', r4.rendu === 5);

  const grande = Array.from({ length: 60 }, (_, i) => (i + 1) * 30);
  const r5 = await lancer(grande, null);
  // Le premier lot est déjà servi avant tout défilement : 30 + 40 × 30 = 1 230,
  // soit 40 paliers exactement. Au-dessus du plus gros compte du parc (1 065).
  ok('liste sans fin : le plafond de 40 paliers tient', r5.rendu === 30 + 40 * 30, `${r5.rendu} cartes`);
  ok('et ce plafond reste au-dessus du plus gros compte du parc (1 065)', 30 + 40 * 30 > 1065);
}

console.log('\n4. CE QUI NE DOIT PAS AVOIR BOUGÉ');
ok('deux cartes qui correspondent ⇒ toujours ABANDON, aucun clic',
  /nommees\.length > 1[\s\S]{0,400}?suppression abandonnée \(ambiguïté/.test(src));
ok('le diagnostic dit toujours combien de cartes ont été rendues',
  /\$\{cartesRendues\} carte\(s\) rendue\(s\)/.test(src));
ok('le chemin NOMINAL reste la page de l\'annonce, pas cette liste',
  /« Mes annonces » reste le\n\/\/ repli des jobs sans listing_url/.test(src));

console.log(`\n${ko === 0 ? '✅ Une annonce au-delà de la 30e est enfin atteignable.' : `❌ ${ko} échec(s).`}`);
process.exit(ko === 0 ? 0 : 1);
