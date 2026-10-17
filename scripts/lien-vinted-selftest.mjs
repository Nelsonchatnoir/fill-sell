// selftest:lien-vinted — point 4 de la nuit du 18/10 : l'origine Vinted des
// modules partagés (_shared/lien-vinted.js).
//   1. app et serveur : RIEN ne change — lien vinted.fr, textes au caractère près ;
//   2. extension (copie générée) : l'origine vient de vinted-origine.js — une
//      vendeuse italienne lit vinted.it, un vendeur français vinted.fr ;
//      module absent : aucun lien, « Vinted » dans la phrase, jamais une erreur ;
//   3. la copie générée ne porte aucun littéral vinted.fr de code (règle a. de
//      selftest:vinted-origine, inchangée).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let echecs = 0, total = 0;
const ok = (c, l) => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}`); };
const imp = (f) => import(pathToFileURL(path.join(RACINE, f)).href);
const L = await imp('supabase/functions/_shared/lien-vinted.js');
const A = await imp('supabase/functions/_shared/attente-autre-boutique.js');
const R = await imp('src/utils/retenueServeur.js');
const P = await imp('src/utils/publicationState.js');

console.log('1. App et serveur : rien ne change');
ok(L.lienAnnonceVinted('10416597607') === 'https://www.vinted.fr/items/10416597607' && L.domaineVinted() === 'vinted.fr', 'lien et domaine : vinted.fr');
ok(A.messageAttenteBoutique('louis', 'delete') === "En attente de ta boutique Vinted @louis : ouvre-la sur vinted.fr dans Chrome, le retrait repartira tout seul. Ton annonce est toujours en ligne, rien n'a été retiré.", 'attente de boutique (retrait) : texte au caractère près');
ok(A.messageAttenteBoutique(null, 'publish').includes('Ouvre-la sur vinted.fr dans Chrome, la publication repartira toute seule.'), 'attente de boutique (publication) : texte au caractère près');
const motif = R.RETENUE_BOUTIQUE_INCONNUE;
if (motif) {
  ok(R.phraseRetenueServeur(true, { motif, boutiques: ['@a'] }).detail.includes('Ouvre @a sur vinted.fr dans Chrome'), 'retenue serveur (boutique inconnue, nommée) : « Ouvre @a sur vinted.fr dans Chrome »');
  ok(R.phraseRetenueServeur(false, { motif }).detail.includes('Open, on vinted.fr in Chrome, the shop that holds this listing'), 'retenue serveur (anglais, sans nom) : inchangée');
}
const enLigne = P.annoncesEncoreEnLigne({ vinted_item_id: '42', vinted_status: 'active' }, []);
ok(enLigne.some((a) => a.platform === 'vinted' && a.url === 'https://www.vinted.fr/items/42'), 'annonce importée du dressing : le lien vinted.fr, comme avant');

console.log('2. Extension : l\'origine unique de vinted-origine.js');
const copie = readFileSync(path.join(RACINE, 'chrome-extension/etat-job.js'), 'utf8').replace(/\r\n/g, '\n');
const debut = copie.indexOf('__M.lienVinted = (() => {');
const fin = copie.indexOf('})();', debut) + 5;
ok(debut > 0 && fin > debut, 'la copie porte le module d\'origine de l\'extension (pas une recopie de lien-vinted.js)');
const charger = (g) => { const __M = {}; new Function('globalThis', '__M', copie.slice(debut, fin))(g, __M); return __M.lienVinted; };
const it = charger({ FILLSELL_VINTED: { origineVinted: () => 'https://www.vinted.it' } });
ok(it.lienAnnonceVinted('9') === 'https://www.vinted.it/items/9' && it.domaineVinted() === 'vinted.it', 'vendeuse italienne : vinted.it dans le lien et la phrase');
const fr = charger({ FILLSELL_VINTED: { origineVinted: () => 'https://www.vinted.fr' } });
ok(fr.domaineVinted() === 'vinted.fr' && fr.lienAnnonceVinted('9') === 'https://www.vinted.fr/items/9', 'vendeur français : vinted.fr, comme avant');
const sans = charger({});
ok(sans.lienAnnonceVinted('9') === null && sans.domaineVinted() === 'Vinted', 'module absent : aucun lien, « Vinted » dans la phrase, aucune erreur');

console.log('3. Aucun littéral vinted.fr de code dans la copie');
const fautes = copie.split('\n').filter((l) => /vinted\.fr/.test(l) && !/^\s*(\/\/|\*)/.test(l));
ok(fautes.length === 0, `aucun (${fautes.length})`);

console.log(`\n${total - echecs}/${total} ${echecs ? 'ÉCHECS' : 'OK'}`);
process.exit(echecs ? 1 : 0);
