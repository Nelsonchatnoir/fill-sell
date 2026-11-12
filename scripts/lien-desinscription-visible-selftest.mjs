// VERROU « UN MAIL MARKETING PORTE TOUJOURS UN LIEN DE DÉSINSCRIPTION VISIBLE » (12/11/2026, décision de Nico)
// Cas : mail d'annonce des formules avec Cloud — envoi-ponctuel posait l'en-tête List-Unsubscribe mais aucun lien dans le
// corps, et /desinscription exige le jeton de la personne (?t=). Vérifie :
//   A. le module pur _shared/lien-desinscription-visible.js : {{lien_desinscription}} remplacé par le lien PERSONNEL ;
//      gabarit sans la variable → pied « Se désinscrire » visible, avant </body> ou à la fin ; jamais deux fois ; rien
//      d'autre ne change ; lien vide refusé ;
//   B. envoi-ponctuel : branché pour 'marketing' SEULEMENT, lien calculé par lienDesinscription (jeton), lien
//      incalculable → personne non servie, simulation sans jeton ; 'support' inchangé.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(path.join(RACINE, p), 'utf8').replace(/\r\n/g, '\n');
let n = 0, echecs = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { echecs++; console.log(`  ✗ ${m}`); } };

let M = {};
try { M = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/lien-desinscription-visible.js')).href); }
catch (e) { ok(false, `module _shared/lien-desinscription-visible.js absent (${e.code ?? e.message})`); }

console.log('A. module pur');
const L = 'https://fillsell.app/desinscription?t=abc123';
if (typeof M.avecLienDesinscription === 'function') {
  const g1 = '<html><body><p>Bonjour</p><p><a href="{{lien_desinscription}}">Se désinscrire</a></p></body></html>';
  const r1 = M.avecLienDesinscription(g1, L);
  ok(r1 === g1.replace('{{lien_desinscription}}', L), 'la variable est remplacée par le lien personnel, rien d\'autre ne change');
  ok((r1.match(/desinscription\?t=/g) ?? []).length === 1, 'gabarit avec la variable : aucun pied ajouté (jamais deux liens)');
  const g2 = '<html><body><p>Bonjour</p></body></html>';
  const r2 = M.avecLienDesinscription(g2, L);
  ok(r2.includes(`href="${L}"`) && r2.includes('Se désinscrire') && r2.indexOf('Se désinscrire') < r2.indexOf('</body>'),
    'gabarit sans la variable : pied « Se désinscrire » visible, AVANT </body>');
  ok(r2.startsWith('<html><body><p>Bonjour</p>') && r2.endsWith('</body></html>'), 'le reste du gabarit est intact');
  const r3 = M.avecLienDesinscription('<p>Sans body</p>', L);
  ok(r3.startsWith('<p>Sans body</p>') && r3.includes(`href="${L}"`), 'sans </body> : pied ajouté à la fin');
  const g4 = '<p>A</p>{{lien_desinscription}}<p>{{lien_desinscription}}</p>';
  ok(!M.avecLienDesinscription(g4, L).includes('{{lien_desinscription}}'), 'toutes les occurrences de la variable sont remplacées');
  let refuse = false; try { M.avecLienDesinscription(g2, ''); } catch { refuse = true; }
  ok(refuse, 'lien vide : refusé (jamais un pied sans lien)');
  ok(typeof M.LIEN_SIMULATION === 'string' && /desinscription\?t=SIMULATION/.test(M.LIEN_SIMULATION), 'simulation : lien d\'exemple, sans jeton');
} else {
  ok(false, 'avecLienDesinscription absente');
}

console.log('B. envoi-ponctuel');
const src = lire('supabase/functions/envoi-ponctuel/index.ts');
ok(/import \{[^}]*\blienDesinscription\b[^}]*\} from "\.\.\/_shared\/desinscription\.ts";/.test(src), 'lienDesinscription (jeton personnel) importée de la porte _shared/desinscription.ts');
ok(/import \{[^}]*\bavecLienDesinscription\b[^}]*\} from "\.\.\/_shared\/lien-desinscription-visible\.js";/.test(src), 'le module pur est importé');
const i = src.indexOf('if (categorie === "marketing") {\n      if (simulation)');
const bloc = i >= 0 ? src.slice(i, src.indexOf('const r = await envoyerEmail', i)) : '';
ok(bloc.length > 0, 'branché pour la catégorie marketing SEULEMENT');
ok(/if \(simulation\) \{\s*htmlFinal = avecLienDesinscription\(htmlFinal, LIEN_SIMULATION\);/.test(bloc) && !/lienDesinscription\(email/.test(bloc.split('} else {')[0] ?? ''),
  'simulation : aucun jeton créé');
ok(/lien = await lienDesinscription\(email, d\.user_id \?\? null\)/.test(bloc), 'envoi réel : lien calculé par la porte, pour CETTE personne');
ok(/if \(!lien\) \{[\s\S]*?motif: "lien_desinscription_impossible"[\s\S]*?continue;/.test(bloc), 'lien incalculable : personne non servie');
ok(/htmlFinal = avecLienDesinscription\(htmlFinal, lien\);/.test(bloc), 'le HTML envoyé porte le lien');
const iEnvoi = src.indexOf('const r = await envoyerEmail');
ok(iEnvoi > i && /html: htmlFinal,/.test(src.slice(iEnvoi, iEnvoi + 200)) && /text: htmlVersTexte\(htmlFinal\)/.test(src.slice(iEnvoi, iEnvoi + 250)),
  'le HTML et le texte envoyés sont ceux qui portent le lien');

console.log(echecs ? `\n✗ ${echecs} échec(s) sur ${n}` : `\n✓ ${n}/${n} — un mail marketing porte toujours un lien de désinscription visible`);
process.exit(echecs ? 1 : 0);
