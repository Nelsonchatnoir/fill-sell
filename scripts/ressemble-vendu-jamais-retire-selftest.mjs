// selftest:ressemble-vendu-jamais-retire — (03/11 soir, Nico ; JEAN-LUC LASSARAT, Dylan Fontaine) une annonce EN LIGNE
// qui RESSEMBLE à un article déjà vendu n'est jamais retirée depuis l'écran des fiches à vérifier : « Oui, c'est le
// même — retirer l'annonce » a retiré 8 annonces le 03/11 (16:19-16:28). Elle entre dans le stock comme un article à
// part (réponse « non » au serveur : jamais une fusion, jamais un retrait). Seule la COPIE interrogée à la vente du
// jour (motif copie_non_prouvee) garde « Oui, la retirer ».
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };
const E = lire('src/annonces/EcranDoublons.jsx');

ok(E.includes('const ressembleVendu = dejaVendu && !copie;'), 'ressemble à un article vendu = toute paire « vendu » qui n\'est pas la copie de la vente du jour');
ok(E.includes('const aRetirer = copie ? annonceARetirer(paire) : null;'), 'une annonce à retirer n\'est montrée (ni envoyée) que pour la copie');
ok(!E.includes("Oui, c'est le même — retirer l'annonce") && !E.includes('on retire cette annonce, pour ne pas le vendre deux fois'),
  'plus aucun bouton ni texte qui retire une annonce sur une ressemblance');
ok(E.includes("{orphelin || ressembleVendu ? (") && E.includes("onClick={orphelin ? ranger : () => repondre('non')}"),
  'un seul geste, « La mettre dans mon stock » : « non » au serveur (deux articles)');
ok(E.includes("FillSell ne la retire pas, une ressemblance ne dit pas que c'est le même objet (tu en as peut-être plusieurs)")
  && E.includes('Si c\'est bien l\'objet vendu, retire-la toi-même depuis sa fiche.'), 'la carte dit pourquoi, et comment la retirer soi-même');
ok(E.includes("? (fr ? 'Noté : elle est dans ton stock, son annonce reste en ligne.'"), 'le « noté » dit que l\'annonce reste en ligne');
const iTitre = E.indexOf("{ressembleVendu ? (fr ? 'Annonce à vérifier' : 'Listing to check')");
ok(iTitre > 0 && E.indexOf("dejaVendu ? (fr ? 'Déjà vendu ?'", iTitre) > iTitre, 'titre « Annonce à vérifier » ; « Déjà vendu ? » reste pour la copie');
ok(E.includes("? (fr ? 'Oui, la retirer' : 'Yes, remove it')"), 'la copie de la vente du jour garde « Oui, la retirer »');
// Le geste « oui » n'est plus jamais envoyé sur une paire « vendu » qui n'est pas la copie : seul le bloc à deux boutons
// envoie « oui », et il n'est rendu que hors orphelin et hors ressemblance.
const iBloc2 = E.indexOf("onClick={() => repondre('oui')}");
const iBloc1 = E.indexOf('{orphelin || ressembleVendu ? (');
ok(iBloc1 > 0 && iBloc2 > iBloc1 && E.slice(iBloc1, iBloc2).includes(') : ('), '« oui » ne part que du second bloc, jamais d\'une paire qui ressemble à un vendu');

console.log(`\n✓ ressemble-vendu-jamais-retire : ${n} contrôles verts`);
