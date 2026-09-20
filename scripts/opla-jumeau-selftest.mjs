// `node scripts/opla-jumeau-selftest.mjs`
//
// LE SERVEUR ET L'EXTENSION DOIVENT TRANCHER PAREIL (2026-09-20).
//
// `_shared/opla-resolution.ts` et `content-scripts/opla.js` portent la MÊME
// règle en deux exemplaires — c'est écrit en toutes lettres en tête des deux
// fichiers. Jusqu'ici, rien ne le vérifiait : les deux copies ont divergé une
// première fois (le serveur n'avait pas `feuillesDuNoeudNomme`, ajouté dans
// l'extension le 20/09 au matin), et personne ne l'a vu. Deux vérités, c'est
// le pire des cas : personne ne sait laquelle regarder.
//
// Ce test EXÉCUTE les deux. Pas de relecture, pas de comparaison de texte : on
// charge le content script tel que Chrome l'injecte, on lui sert l'arbre Opla
// (le catalogue généré, mis à la forme de /public/config/articles), et on
// compare feuille à feuille ce que chaque copie rend sur les mêmes mots.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = (p) => pathToFileURL(path.join(ROOT, p)).href;

const RES = await import(url('supabase/functions/_shared/opla-resolution.ts'));
const CAT = await import(url('supabase/functions/_shared/opla-catalogue.ts'));

// ── L'arbre, à la forme que l'API Opla rend ────────────────────────────────
const noeudApi = (n) => {
  const enfants = CAT.oplaEnfants(n.code);
  return enfants.length
    ? { code: n.code, title: n.titre, categories: enfants.map(noeudApi) }
    : { code: n.code, title: n.titre };
};
const ARBRE = { categories: CAT.oplaEnfants('').map(noeudApi) };

// ── Le content script, chargé tel quel ─────────────────────────────────────
// ⛔ PAS UNE COPIE : on lit le fichier que `npm run build:extension` empaquette
//    et que Chrome injecte, et on l'exécute. `chrome` vaut undefined, donc le
//    bloc d'écoute des messages ne s'enregistre pas — c'est le seul endroit du
//    fichier qui touche à l'environnement de l'extension au chargement.
const source = fs.readFileSync(path.join(ROOT, 'chrome-extension/content-scripts/opla.js'), 'utf8');
const faireModule = new Function('fetch', 'chrome', 'window', 'document', `${source}\n;return { oplaChargerReferentiel };`);
const faux = async (chemin) => ({
  ok: /config\/articles/.test(chemin),
  status: 200,
  text: async () => JSON.stringify(/config\/articles/.test(chemin) ? ARBRE : {}),
});
const { oplaChargerReferentiel } = faireModule(faux, undefined, undefined, undefined);
const EXT = await oplaChargerReferentiel();

let ko = 0;
const ok = (nom, cond, detail = '') => { console.log(`${cond ? '  ok  ' : '  ⚠ KO'} ${nom}${detail ? ' — ' + detail : ''}`); if (!cond) ko++; };

console.log("=== L'ARBRE EST LE MÊME DES DEUX CÔTÉS ===");
ok('886 feuilles côté extension', EXT.feuilles.size === 886, String(EXT.feuilles.size));
ok('1014 nœuds côté extension', EXT.noeuds.size === 1014, String(EXT.noeuds.size));

// ── La comparaison : même entrée, même sortie ──────────────────────────────
// Le serveur DÉPARTAGE en plus (trancherCandidats) ; l'extension, non — c'est
// voulu, et c'est écrit dans les deux fichiers. On compare donc ce qui doit
// être identique : l'ENSEMBLE DES CANDIDATES trouvées par les mots.
console.log('\n=== MÊMES CANDIDATES SUR LES MOTS QUI NOUS ONT PIÉGÉS ===');
const CAS = [
  [['jean'], ''],
  [['jean'], 'Homme'],
  [['jean'], 'Femme'],
  [['jean skinny noir femme', 'jean'], 'Femme'],
  [['robe enfant', 'robe'], 'Fille'],
  [['pull enfant', 'pull'], 'Garçon'],
  [['pull'], 'Femme'],
  [['livre'], ''],
  [['jupe'], 'Femme'],
  [['maillot de football', 'maillot'], 'Homme'],
  [['pantalon velours enfant', 'pantalon'], 'Garçon'],
  [['t-shirt'], 'Homme'],
  [['poupée'], ''],
  [['body bébé', 'body'], 'Fille'],
  [['sandale'], 'Femme'],
  [['figurine'], ''],
];
for (const [mots, genre] of CAS) {
  const e = EXT.descendre('', mots, genre);
  const cotesExt = new Set(e.candidats.length ? e.candidats.map((c) => c.code) : (e.code ? [e.code] : []));

  const s = RES.resoudreCategorieOpla({ mots, genre: genre || null });
  // Côté serveur, un départage réussi réduit l'ensemble à une feuille : on
  // reprend donc les candidates AVANT départage pour comparer le même objet.
  const brut = RES.resoudreCategorieOpla({ mots, genre: genre || null });
  const cotesSrv = new Set(brut.candidats.length ? brut.candidats.map((f) => f.code) : (brut.code ? [brut.code] : []));

  // L'extension ne départage pas : quand le serveur tranche, sa feuille doit
  // être DANS les candidates de l'extension (ou être la même feuille unique).
  const memeEnsemble = cotesExt.size === cotesSrv.size && [...cotesSrv].every((c) => cotesExt.has(c));
  const trancheDedans = !!s.code && cotesExt.has(s.code);
  ok(`${JSON.stringify(mots[0])}${genre ? ' ' + genre : ''}`, memeEnsemble || trancheDedans,
    memeEnsemble ? `${cotesSrv.size} candidates identiques`
      : trancheDedans ? `serveur tranche ${s.code}, présent dans les ${cotesExt.size} de l'extension`
      : `serveur [${[...cotesSrv].join(',')}] ≠ extension [${[...cotesExt].join(',')}]`);
}

// ── Les deux défauts nommés, vérifiés SUR L'EXTENSION ──────────────────────
console.log("\n=== LES DEUX DÉFAUTS, CÔTÉ EXTENSION ===");
const jeanH = EXT.descendre('', ['jean'], 'Homme');
ok('« jean » Homme : aucune feuille enfant proposée',
  jeanH.candidats.length > 0 && jeanH.candidats.every((c) => c.chemin[0] === 'Hommes'),
  jeanH.candidats.map((c) => c.title).join(', '));
const robeF = EXT.descendre('', ['robe enfant', 'robe'], 'Fille');
ok('robe de bébé, genre Fille : aucune robe femme',
  (robeF.candidats.length > 0 && robeF.candidats.every((c) => c.chemin[0] === 'Enfants')) || /Enfants/.test(EXT.cheminDe(robeF.code).join(' ')),
  robeF.candidats.map((c) => c.chemin.join(' › ')).join(' | ') || EXT.cheminDe(robeF.code).join(' › '));
const jupeF = EXT.descendre('', ['jupe'], 'Femme');
const jupeCodes = jupeF.candidats.length ? jupeF.candidats.map((c) => c.code) : [jupeF.code];
ok('« jupe » Femme : le rayon Jupes est dans la course, pas seulement le sport',
  jupeCodes.some((c) => EXT.cheminDe(c).join(' › ').includes('Vêtements › Jupes')),
  jupeCodes.map((c) => EXT.cheminDe(c).join(' › ')).join(' | '));

console.log(ko ? `\n⚠ ${ko} CAS EN ECHEC` : '\n✓ LES DEUX COPIES TRANCHENT PAREIL');
if (ko) process.exit(1);
