// `node scripts/opla-couverture-selftest.mjs`
//
// LA COUVERTURE OPLA, BOUT EN BOUT, FAMILLE PAR FAMILLE (2026-09-20).
//
// Pourquoi ce fichier existe : les deux selftests Opla existants prouvent
// chacun UNE moitié. `opla-resolution-selftest.ts` prouve qu'on trouve le bon
// rayon ; `opla-prevol-selftest.mjs` prouve qu'on refuse une taille hors
// grille. Aucun ne prouve la CHAÎNE — et c'est la chaîne qui casse : un rayon
// juste avec une taille que sa grille ne connaît pas produit exactement le même
// job mort qu'un rayon faux.
//
// Ici, chaque cas fait le trajet complet, sur du code EXÉCUTÉ :
//   1. `resoudreCategorieOpla` (serveur, _shared/opla-resolution.ts) → le rayon ;
//   2. `normaliserTailleOpla` (serveur) → la taille traduite dans la grille de
//      CETTE feuille, jamais rapprochée ;
//   3. `oplaPrevol` (chrome-extension/content-scripts/opla-prevol.js, le
//      fichier que Chrome injecte) → le verdict qui décide du dépôt.
//
// ⛔ AUCUN CAS N'EST « ATTENDU EN ÉCHEC » PAR CONFORT. Une famille que le
//    catalogue Opla ne sait pas nommer (« cardigan » enfant, qu'Opla appelle
//    « Gilets ») est déclarée QUESTION, pas OK : la question doit être posable
//    — options non vides et toutes déposables — sinon c'est un job mort.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = (p) => pathToFileURL(path.join(ROOT, p)).href;

// Le serveur : TypeScript, chargé tel quel (Node 22+ le fait, et de toute façon
// ce test tourne aussi sous `deno run`).
const RES = await import(url('supabase/functions/_shared/opla-resolution.ts'));
const CAT = await import(url('supabase/functions/_shared/opla-catalogue.ts'));

// L'extension : même ordre d'injection que background.js (OPLA_SCRIPTS), sinon
// on testerait le repli du pré-vol et pas le chemin réel.
await import(url('chrome-extension/content-scripts/tailles-vocabulaire.js'));
await import(url('chrome-extension/content-scripts/opla-prevol.js'));
const { oplaPrevol } = globalThis;
if (typeof oplaPrevol !== 'function') { console.error('opla-prevol.js n a pas publié oplaPrevol'); process.exit(1); }

// ── Le référentiel du pré-vol, bâti sur l'arbre GÉNÉRÉ ──────────────────────
const feuilles = new Set();
const noeuds = new Set();
(function descend(code) {
  for (const n of CAT.oplaEnfants(code)) {
    noeuds.add(n.code);
    if (n.feuille) feuilles.add(n.code); else descend(n.code);
  }
})('');
const ref = {
  feuilles, noeuds,
  grillePour: (code) => { const g = CAT.oplaTaillesDe(code).map((t) => t.code); return g.length ? g : null; },
  cheminDe: (code) => CAT.oplaChemin(code),
  couleursPour: () => null,
  matieresPour: () => null,
};

let ko = 0;
const lignes = [];
const dit = (t) => console.log(t);

// Un job Opla nominal : tout est bon SAUF ce que le cas fait varier.
const job = (code, taille) => ({
  title: 'Article de test',
  description: 'Description assez longue pour passer le plancher Opla.',
  price: 20,
  photos: ['temp/x/a.jpg', 'temp/x/b.jpg'],
  platform_fields: { oplaCategoryCode: code, marque: 'Sans marque', etat: 'good', taille: taille ?? null },
});

/**
 * Le trajet complet d'un article. Rend une ligne de tableau + un verdict.
 *   'OK'       rayon posé, taille acceptée, pré-vol vert — rien à demander ;
 *   'QUESTION' on ne tranche pas, mais la question est POSABLE : options non
 *              vides, toutes déposables, et la bonne réponse dedans ;
 *   'LIMITE'   le catalogue Opla lui-même n'a pas de quoi répondre. Il FAUT
 *              alors une raison écrite dans le cas (`limite:`) — sinon c'est KO.
 *              Une limite n'est pas un succès : elle se compte à part et se
 *              lit dans le rapport ;
 *   'KO'       rayon faux, question impossible, ou refus sans issue.
 */
function trajet({ famille, mots, genre = null, titre = null, taille = null, rayonAttendu = null, questionOk = false, limite = null }) {
  const r = RES.resoudreCategorieOpla({ mots, titre, genre });
  const exemple = titre || mots[0];
  const pousser = (rayon, verdict, detail) => {
    if (verdict === 'KO') ko++;
    lignes.push([famille, exemple, rayon, verdict, detail]);
  };

  if (!r.code) {
    const opts = RES.optionsFeuilles(r.candidats);
    const posable = opts.length > 1 && opts.every((o) => feuilles.has(o.code));
    const bonneReponseDedans = !rayonAttendu || opts.some((o) => o.code === rayonAttendu);
    if (limite) return pousser(opts.length ? `question ${opts.length}` : 'RIEN', 'LIMITE', limite);
    const bon = questionOk && posable && bonneReponseDedans;
    return pousser(opts.length ? `question ${opts.length}` : 'RIEN', bon ? 'QUESTION' : 'KO',
      opts.length === 0 ? 'aucune option : job mort'
        : !posable ? 'question impossible'
        : !bonneReponseDedans ? `${rayonAttendu} absent des options`
        : 'la personne tranche');
  }

  const chemin = CAT.oplaChemin(r.code).join(' › ');
  if (rayonAttendu && r.code !== rayonAttendu) return pousser(chemin, 'KO', `rayon attendu ${rayonAttendu}`);

  // La taille : traduite contre la grille de CETTE feuille, puis soumise au pré-vol.
  const norm = taille ? RES.normaliserTailleOpla(r.code, taille) : null;
  const v = oplaPrevol(job(r.code, norm ?? taille), ref);
  if (v.ok) return pousser(chemin, 'OK', taille ? `taille « ${taille} » → « ${norm ?? taille} »` : 'sans taille');

  // ⛔ UN REFUS DE TAILLE N'EST PAS LA MÊME CHOSE QU'UN JOB MORT. Le pré-vol
  //    rend la grille COMPLÈTE de la feuille : la personne choisit dans une
  //    liste fermée, en un geste. C'est une question légitime (champ
  //    obligatoire, valeur inconnue) — à condition qu'elle soit posable.
  const options = Array.isArray(v.options) ? v.options : [];
  const posable = v.champ === 'size' && options.length > 1;
  if (posable && limite) return pousser(chemin, 'LIMITE', `${limite} — question de taille, ${options.length} valeurs`);
  return pousser(chemin, posable ? 'QUESTION' : 'KO',
    posable ? `taille « ${taille} » hors grille → question, ${options.length} valeurs`
      : `pré-vol : ${v.motif}${taille ? ` (« ${taille} » → ${norm ?? '—'})` : ''}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// LES CAS — un par famille et par forme de taille
// ═══════════════════════════════════════════════════════════════════════════
const CAS = [
  // ── VÊTEMENTS FEMME — lettres puis chiffres ──────────────────────────────
  { famille: 'Femme · robe', mots: ['robe'], genre: 'Femme', taille: 'M', rayonAttendu: 'WOM_DRE_OTHER' },
  { famille: 'Femme · robe', mots: ['robe'], genre: 'Femme', taille: '38', rayonAttendu: 'WOM_DRE_OTHER' },
  { famille: 'Femme · robe', mots: ['robe d\'été', 'robe'], genre: 'Femme', taille: 'XS', rayonAttendu: 'SUMMER_DRESSES' },
  { famille: 'Femme · jean', mots: ['jean skinny', 'jean'], genre: 'Femme', taille: '40', rayonAttendu: 'W_SKINNY_JEANS' },
  { famille: 'Femme · jean', mots: ['jean'], genre: 'Femme', taille: 'L', rayonAttendu: 'JEANS_OTHER' },   // coupe non dite → « Autre », le fourre-tout DU rayon jean
  { famille: 'Femme · pull', mots: ['pull'], genre: 'Femme', taille: 'XXL', rayonAttendu: 'PULLS_SWEATERS_VESTS' },
  { famille: 'Femme · pull', mots: ['pull'], genre: 'Femme', taille: '46', rayonAttendu: 'PULLS_SWEATERS_VESTS',
    limite: "la table nombre→lettre relevée chez Vinted s'arrête à 44" },
  { famille: 'Femme · manteau', mots: ['manteau'], genre: 'Femme', taille: 'L', rayonAttendu: 'W_COATS' },
  { famille: 'Femme · jupe', mots: ['jupe'], genre: 'Femme', taille: '34', questionOk: true, rayonAttendu: 'MINI_SKIRTS' },
  { famille: 'Femme · jupe', mots: ['minijupe', 'jupe'], genre: 'Femme', taille: '36', rayonAttendu: 'MINI_SKIRTS' },
  { famille: 'Femme · chemisier', mots: ['chemisier', 'blouse'], genre: 'Femme', taille: 'S', rayonAttendu: 'BLOUSES' },
  { famille: 'Femme · chemise', mots: ['chemise'], genre: 'Femme', taille: 'L / 40 / 12', rayonAttendu: 'SHIRTS' },

  // ── VÊTEMENTS HOMME ─────────────────────────────────────────────────────
  { famille: 'Homme · jean', mots: ['jean'], genre: 'Homme', taille: 'L', questionOk: true, rayonAttendu: 'MEN_STRAIGHTFIT_JEANS' },
  { famille: 'Homme · jean', mots: ['jean slim', 'jean'], genre: 'Homme', taille: 'M', rayonAttendu: 'MEN_SLIMFIT_JEANS' },
  { famille: 'Homme · pull', mots: ['pull'], genre: 'Homme', taille: 'XL', questionOk: true, rayonAttendu: 'MEN_PUL_HOODIES_PULLOVERS' },
  { famille: 'Homme · chemise', mots: ['chemise'], genre: 'Homme', taille: 'M', rayonAttendu: 'MEN_TOP_SHIRTS' },
  { famille: 'Homme · veste', mots: ['veste'], genre: 'Homme', taille: 'L', rayonAttendu: 'MEN_JACKETS' },
  { famille: 'Homme · t-shirt', mots: ['t-shirt'], genre: 'Homme', taille: 'S', rayonAttendu: 'MEN_TOP_T_SHIRTS' },

  // ── ENFANT ET BÉBÉ — mois, années, centimètres ──────────────────────────
  { famille: 'Bébé · body (mois)', mots: ['body bébé', 'body'], genre: 'Fille', taille: '3 mois', rayonAttendu: 'GIRLS_BODIES_NEW' },
  { famille: 'Enfant · pull (mois)', mots: ['pull enfant', 'pull'], genre: 'Garçon', taille: '24 mois', rayonAttendu: 'SWEATERS_BOYS_NEW' },
  { famille: 'Enfant · pull (mois)', mots: ['pull enfant', 'pull'], genre: 'Fille', taille: '0M', rayonAttendu: 'SWEATERS_GIRLS_NEW' },
  { famille: 'Enfant · pull (mois)', mots: ['pull enfant', 'pull'], genre: 'Fille', taille: '36M', rayonAttendu: 'SWEATERS_GIRLS_NEW' },
  { famille: 'Enfant · legging (ans)', mots: ['legging enfant', 'legging'], genre: 'Fille', taille: '2 ans', rayonAttendu: 'LEGGINGS_GIRLS_NEW' },
  { famille: 'Enfant · jogging (ans)', mots: ['pantalon jogging enfant', 'pantalon'], genre: 'Fille', taille: '12 ans', rayonAttendu: 'JOGGINGS_GIRLS_NEW' },
  { famille: 'Enfant · t-shirt (ans)', mots: ['t-shirt', 'tee-shirt'], genre: 'Fille', taille: '14 ans', rayonAttendu: 'TOPS_GIRLS_NEW' },
  { famille: 'Enfant · robe (ans)', mots: ['robe enfant', 'robe'], genre: 'Fille', taille: '6 ans', questionOk: true, rayonAttendu: 'SHORTDRESSES_GIRLS_NEW' },
  { famille: 'Enfant · veste (cm)', mots: ['veste enfant', 'veste'], genre: 'Fille', taille: '104 cm', rayonAttendu: 'JACKETS_GIRLS_NEW',
    limite: "Opla n'a pas de grille en centimètres pour les enfants (âges seulement) ; traduire 104 cm en 4 ans serait CONVERTIR" },

  // ── CHAUSSURES, demi-pointure comprise ──────────────────────────────────
  { famille: 'Chaussures femme', mots: ['basket'], genre: 'Femme', taille: '38', rayonAttendu: 'WOMEN_TRAINERS' },
  { famille: 'Chaussures femme', mots: ['sandale'], genre: 'Femme', taille: '41', rayonAttendu: 'WOMEN_SANDALS' },
  { famille: 'Chaussures homme', mots: ['basket', 'baskets'], genre: 'Homme', taille: '44', rayonAttendu: 'MEN_SNEAKERS' },
  { famille: 'Chaussures homme', mots: ['sandale'], genre: 'Homme', taille: '42', rayonAttendu: 'MEN_SANDALS_NEW' },
  { famille: 'Chaussures ½ pointure', mots: ['basket'], genre: 'Femme', taille: '40.5', rayonAttendu: 'WOMEN_TRAINERS',
    limite: "Opla ne publie aucune demi-pointure (relevé du 16/09)" },
  { famille: 'Chaussures enfant', mots: ['basket enfant', 'basket'], genre: 'Fille', taille: '28', questionOk: true },

  // ── HORS VÊTEMENT ───────────────────────────────────────────────────────
  { famille: 'Jouets · figurine', mots: ['figurine'], rayonAttendu: 'TOY_FIGURES' },
  { famille: 'Jouets · peluche', mots: ['peluche'], rayonAttendu: 'STUFFED_ANIMALS_NEW' },
  { famille: 'Jouets · poupée', mots: ['poupée'], questionOk: true, rayonAttendu: 'DOLLS' },
  { famille: 'Jouets · jeu de société', mots: ['jeu de société'], rayonAttendu: 'BOARD_GAMES' },
  { famille: 'Jouets · puzzle', mots: ['puzzle'], rayonAttendu: 'PUZZLES' },
  { famille: 'Livres', mots: ['livre'], questionOk: true, rayonAttendu: 'ROMANS_POUR_ADULTES' },
  { famille: 'Livres · manga', mots: ['manga'], rayonAttendu: 'MANGAS' },
  { famille: 'Livres · BD', mots: ['bande dessinée'], rayonAttendu: 'BANDES_DESSINEES' },
  { famille: 'Jeux vidéo', mots: ['jeu vidéo', 'jeu'], titre: 'Jeu PlayStation 4 FIFA 23', questionOk: true, rayonAttendu: 'JEUX_VIDEO_PLAYSTATION' },
  { famille: 'Jeux vidéo · console', mots: ['console de salon', 'console'], rayonAttendu: 'CONSOLES_DE_SALON' },
  { famille: 'Puériculture · poussette', mots: ['poussette'],
    limite: "Opla n'a AUCUNE feuille poussette : seulement chancelières et pièces détachées" },
  { famille: 'Puériculture · chaise haute', mots: ['chaise haute'],
    limite: "Opla n'a AUCUNE feuille chaise haute dans tout le rayon Enfants" },
  { famille: 'Puériculture · biberon', mots: ['biberon'], rayonAttendu: 'BABY_BOTTLE' },
  { famille: 'Bébé · grenouillère', mots: ['grenouillère'], genre: 'Fille', taille: '6 mois', rayonAttendu: 'ROMPERS_GIRLS_NEW' },
  { famille: 'Maison · décoration', mots: ['décoration murale'], questionOk: true, rayonAttendu: 'MAISON_DECO_WALL_ART' },
  { famille: 'Maison · vase', mots: ['vase'], rayonAttendu: 'MAISON_DECO_VASES' },
  { famille: 'Électronique · casque', mots: ['casque audio', 'casque'], questionOk: true, rayonAttendu: 'HIGHTECH_AUDIO_CASQUES' },
  { famille: 'Électronique · coque', mots: ['coque de téléphone', 'coque'], rayonAttendu: 'HIGHTECH_COQUES_TELEPHONE' },
  { famille: 'Collection · carte', mots: ['carte à collectionner', 'carte'], questionOk: true },
  { famille: 'Collection · pièce', mots: ['pièce de monnaie'], questionOk: true, rayonAttendu: 'HC_NUMISMATICS_COINS' },
  { famille: 'Accessoires · montre', mots: ['montre'], genre: 'Homme', taille: 'Taille unique', rayonAttendu: 'MEN_ACC_WATCHES' },
  { famille: 'Accessoires · sac', mots: ['sac à main', 'sac'], genre: 'Femme', questionOk: true },
];

for (const c of CAS) trajet(c);

// ── Le tableau ──────────────────────────────────────────────────────────────
const larg = [0, 1, 2, 3, 4].map((i) => Math.max(...lignes.map((l) => String(l[i]).length)));
dit('');
dit('FAMILLE'.padEnd(larg[0]) + ' │ ' + 'EXEMPLE'.padEnd(larg[1]) + ' │ ' + 'RAYON OBTENU'.padEnd(larg[2]) + ' │ VERDICT   │ DÉTAIL');
dit('─'.repeat(larg[0]) + '─┼─' + '─'.repeat(larg[1]) + '─┼─' + '─'.repeat(larg[2]) + '─┼───────────┼' + '─'.repeat(larg[4] + 1));
for (const l of lignes) {
  dit(String(l[0]).padEnd(larg[0]) + ' │ ' + String(l[1]).padEnd(larg[1]) + ' │ ' + String(l[2]).padEnd(larg[2]) + ' │ ' + String(l[3]).padEnd(9) + ' │ ' + l[4]);
}
const ok = lignes.filter((l) => l[3] === 'OK').length;
const q = lignes.filter((l) => l[3] === 'QUESTION').length;
const lim = lignes.filter((l) => l[3] === 'LIMITE');
dit('');
dit(`${lignes.length} familles · ${ok} rayon posé et taille acceptée · ${q} question légitime et posable · ${lim.length} limite(s) du catalogue Opla · ${ko} en échec`);
if (lim.length) {
  dit('');
  dit('LES LIMITES — ce n\'est pas notre code, c\'est le catalogue Opla. À relever, pas à contourner :');
  for (const l of lim) dit(`  · ${l[0]} — ${l[4]}`);
}
if (ko) { dit(`\n⚠ ${ko} CAS EN ECHEC`); process.exit(1); }
dit('\n✓ COUVERTURE COMPLÈTE');
