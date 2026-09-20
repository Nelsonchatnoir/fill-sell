// ═══════════════════════════════════════════════════════════════════════════
// LA PREUVE DU DÉPLACEMENT — src/utils/resolutionPublication.js (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// La résolution de catégorie et de champs plateforme vivait dans
// handlePublish (ListingPreviewScreen.jsx). Elle en est sortie pour tourner
// dès la génération. Le lot n'avait le droit de RIEN changer : pas une
// condition, pas un seuil, pas un mapping, pas un ordre.
//
// Ce script le REPROUVE, à la demande, sans faire confiance à une relecture :
// il relit le fichier tel qu'il était au commit d'AVANT le déplacement, en
// réextrait les mêmes tranches de lignes, et compare le résultat au module
// d'aujourd'hui, caractère par caractère.
//
// Il vérifie AUSSI l'autre moitié : les lignes qui devaient RESTER au clic y
// sont bien, mot pour mot. Un déplacement se prouve des deux côtés — sinon
// « rien n'a changé » veut seulement dire « rien n'a changé là où j'ai
// regardé ».
//
//   node scripts/verifier-deplacement-resolution.mjs
//
// Sortie 0 = le déplacement est fidèle. Sortie 1 = quelque chose a bougé, et
// le script dit quoi.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

// Le commit d'avant le déplacement. Il ne bouge plus : c'est la référence.
const COMMIT_AVANT = process.env.COMMIT_AVANT || '0914108';
const FICHIER = 'src/components/ListingPreviewScreen.jsx';
const MODULE = 'src/utils/resolutionPublication.js';

// Les tranches PARTIES dans le module, telles que le script de déplacement
// les a découpées. Désindentées de 4 (le corps passait d'un `try` imbriqué à
// un corps de fonction) — c'est la seule retouche, et elle ne touche que des
// espaces de début de ligne.
const PARTIES = [
  [7076, 7229], // genre auto-résolu, garde-fou d'insert, sanitizeJobFields
  [7294, 7362], // étape 2 : la catégorie par le mot
  [7369, 7502], // étape 3 : candidates + arbitrage IA
  [7507, 7507], // la copie des champs de la plateforme
  [7522, 7651], // garde-fou de catégorie, jeu vidéo, bloc Leboncoin (1/2)
  [7653, 7735], // bloc Leboncoin (2/2)
  [7761, 7914], // blocs Vinted, eBay, Beebs (1/2)
  [7916, 7973], // Beebs (2/2), Opla, tailles enfant
  [7992, 8164], // vérification du chemin, plausibilité de famille
];

// Les tranches RESTÉES dans handlePublish, mot pour mot.
const RESTEES = [
  [7231, 7293], // quelles plateformes partent (décision de publication)
  [7336, 7348], // les deux sources du classement par âge (relues au clic)
  [7503, 7505], // le commentaire du `let rows`
  [7508, 7521], // photos du job + refus eBay sans photo
  [7736, 7760], // plafond de photos gratuites Leboncoin
  [7974, 7990], // la forme du job
];

// Les lignes VOLONTAIREMENT abandonnées des deux côtés, avec leur raison.
const ABANDONNEES = new Map([
  [7363, "le refus « objet non reconnu » : throw au clic → valeur rendue (texte inchangé)"],
  [7364, "idem"], [7365, 'idem'], [7366, 'idem'], [7367, 'idem'], [7368, 'idem'],
  [7506, 'la boucle : .map(platform => ({…job})) → for…of qui ne produit que les champs'],
  [7652, "l'adresse de remise Leboncoin : relue fraîche au clic"],
  [7915, "l'adresse de remise Beebs : idem"],
  [7991, 'la fermeture du .map'],
  [7230, '(ligne vide)'],
]);

const lire = (commit, chemin) =>
  execFileSync('git', ['show', `${commit}:${chemin}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .replace(/\r\n/g, '\n').split('\n');

const avant = lire(COMMIT_AVANT, FICHIER);
const moduleAuj = fs.readFileSync(MODULE, 'utf8').replace(/\r\n/g, '\n');
const clicAuj = fs.readFileSync(FICHIER, 'utf8').replace(/\r\n/g, '\n');

let echecs = 0;
const dit = (ok, texte) => { if (!ok) echecs++; console.log(`${ok ? '  ok  ' : ' ÉCHEC'}  ${texte}`); };

console.log(`Référence : ${FICHIER} au commit ${COMMIT_AVANT}\n`);

// ── 1. Tout ce qui est parti se retrouve dans le module, à l'identique ─────
console.log('1. Les lignes DÉPLACÉES sont dans le module, mot pour mot');
let lignesDeplacees = 0;
for (const [a, b] of PARTIES) {
  const bloc = avant.slice(a - 1, b).map(l => (l.startsWith('    ') ? l.slice(4) : l)).join('\n');
  lignesDeplacees += b - a + 1;
  dit(moduleAuj.includes(bloc), `lignes ${a}–${b} (${b - a + 1})`);
}

// ── 2. Tout ce qui devait rester est resté, à l'identique ─────────────────
console.log('\n2. Les lignes RESTÉES au clic y sont, mot pour mot');
let lignesRestees = 0;
for (const [a, b] of RESTEES) {
  const bloc = avant.slice(a - 1, b).join('\n');
  lignesRestees += b - a + 1;
  dit(clicAuj.includes(bloc), `lignes ${a}–${b} (${b - a + 1})`);
}

// ── 3. Le compte est bon : aucune ligne perdue en route ───────────────────
console.log('\n3. Le compte des lignes d\'origine');
const couvertes = new Set();
for (const [a, b] of [...PARTIES, ...RESTEES]) for (let i = a; i <= b; i++) couvertes.add(i);
const orphelines = [];
for (let i = 7076; i <= 8164; i++) if (!couvertes.has(i) && !ABANDONNEES.has(i)) orphelines.push(i);
dit(orphelines.length === 0, `lignes ni déplacées, ni restées, ni déclarées abandonnées : ${orphelines.length}${orphelines.length ? ' → ' + orphelines.join(', ') : ''}`);
console.log(`        ${lignesDeplacees} déplacées · ${lignesRestees} restées · ${ABANDONNEES.size} adaptées ou vides · total ${8164 - 7076 + 1}`);

// ── 4. Les messages montrés à l'utilisateur n'ont pas bougé ───────────────
// Un déplacement qui change un mot de message change ce que la personne lit.
console.log('\n4. Les messages destinés à l\'utilisateur, au caractère près');
const MESSAGES = [
  "We couldn't recognise what this item is from",
  "On n'a pas reconnu l'objet dans",
  'Nomme l\'objet dans le titre (« combinaison », « dessous de plat », « veste »…) ou régénère l\'annonce, puis republie. Rien n\'a été débité.',
];
for (const m of MESSAGES) {
  const dansAvant = avant.join('\n').includes(m);
  const dansApres = moduleAuj.includes(m) || clicAuj.includes(m);
  dit(dansAvant && dansApres, `« ${m.slice(0, 58)}… »`);
}

console.log(`\n${echecs === 0 ? '✅ Déplacement fidèle : rien n\'a changé.' : `❌ ${echecs} écart(s).`}`);
process.exit(echecs === 0 ? 0 : 1);
