// VERROU « LIRE UNE OPTION D'ASPECT DANS LE TEXTE NE COÛTE PAS DES SECONDES DE CPU » (19/11/2026, régression de 8f68590)
// `npm run selftest:aspect-du-texte-cpu` — sans base, sans réseau.
// Cas : compte 8fd44622, job c1d8a3eb (baskets, rayon eBay 155202 : « Modèle » 4 205 valeurs, « Gamme de produits » 1 602).
// optionEcriteDuTexte construisait une RegExp à lookbehind (≈30 parties du vêtement) PAR VALEUR de la liste : ≈3,4 s de
// CPU (93 ms avant 8f68590) → ebay-api-worker v138 « CPU Time exceeded » (limite 2 s), l'isolat tué avec toute sa passe,
// 5 fois en une heure, puis « le traitement s'est interrompu 3 fois sans conclure ».
// La règle : une valeur absente LITTÉRALEMENT du texte n'est jamais testée par RegExp (la RegExp l'exige) — même résultat.
// Ce verrou CASSE si : une liste de 5 000 valeurs sur un texte ordinaire coûte plus de 250 ms, ou si le résultat change
// sur les cas de la règle du 19/11 (couleurs, « Défauts : », partie du vêtement).
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = process.env.RACINE_VERROU || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, ko = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d !== undefined ? `\n      ${JSON.stringify(d).slice(0, 300)}` : ''}`); } };
const { optionEcriteDuTexte } = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/aspect-du-texte.js')).href);

// Un catalogue synthétique de 5 000 « modèles » (noms plausibles, aucun présent dans le texte) + 3 valeurs présentes.
const syll = ['ka', 'zo', 'ri', 'tan', 'vel', 'mo', 'dex', 'lu', 'pra', 'sin', 'gor', 'bal', 'nef', 'qui', 'tor'];
const modeles = [];
for (let i = 0; modeles.length < 5000; i++) {
  const a = syll[i % syll.length], b = syll[Math.floor(i / syll.length) % syll.length], c = syll[Math.floor(i / 225) % syll.length];
  modeles.push(`${a}${b}${c} ${100 + (i % 900)}`);
}
const texte = [
  'Baskets Puma Suede Classic blanches pointure 42, très bon état, portées quelques fois.',
  'Semelle en caoutchouc, col en velours, doublure en toile. Lacets d\'origine.',
  'Défauts : petite tache sur le talon, à peine visible.',
  'Envoi rapide et soigné, en boîte. Couleur : blanc et noir. Modèle : Suede Classic.',
].join('\n').repeat(3);

console.log('1. Le coût : 5 000 valeurs absentes du texte');
{
  const allowed = [...modeles, 'Suede Classic', 'Velours', 'Petite'];
  const t0 = process.cpuUsage();
  const r = optionEcriteDuTexte({ allowedValues: allowed, textes: [texte], name: 'Modèle' });
  const cpu = process.cpuUsage(t0);
  const ms = (cpu.user + cpu.system) / 1000;
  ok(ms < 250, `5 003 valeurs lues en ${Math.round(ms)} ms de CPU (borne 250 ms ; ≈3 400 ms avant le correctif)`, ms);
  ok(r?.valeur === 'Suede Classic', 'le résultat ne change pas : « Suede Classic » (écrit), jamais « Velours » (col en velours) ni « Petite » (Défauts)', r);
}

console.log('2. Les règles du 19/11 inchangées');
{
  const lire = (allowedValues, t, name = null) => optionEcriteDuTexte({ allowedValues, textes: [t], name });
  ok(lire(['Bleu', 'Batman'], 'T-Shirt Bleu Turquoise taille M', 'Personnage') === null, 'une couleur sans double sens ne prouve pas « Personnage »');
  ok(lire(['Petite', 'Grande taille'], 'Robe\nDéfauts : Petite tache', 'Type de taille') === null, '« Défauts : Petite tache » ne prouve pas « Type de taille »');
  ok(lire(['Velours', 'Coton'], 'Veste, col en velours noir', 'Textile') === null, '« col en velours » ne prouve pas « Textile »');
  ok(lire(['Polyester', 'Coton'], 'Doublure en polyester', 'Matière de la doublure')?.valeur === 'Polyester', 'l\'aspect de la partie (« Matière de la doublure ») lit « doublure en polyester »');
  ok(lire(['Chaise', 'Chaise de bureau'], 'Chaise de bureau ergonomique')?.valeur === 'Chaise de bureau', 'la plus précise des options écrites');
  ok(lire(['Rétro'], 'Lampe rétro des années 70')?.valeur === 'Rétro', 'une option écrite avec accent (mot entier, accents près)');
  ok(lire(['Retro'], 'Lampe rétroéclairée') === null, 'jamais un morceau de mot');
}

console.log(ko ? `\n✗ aspect-du-texte-cpu : ${ko} échec(s) sur ${n}` : `\n✓ aspect-du-texte-cpu : ${n}/${n}`);
process.exit(ko ? 1 : 0);
