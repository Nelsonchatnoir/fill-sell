// selftest:parcours-apres-synchro — (15/10, P17) Le parcours juste après une
// synchro : un geste GRATUIT d'abord, les murs payants plus tard, des textes de
// quota vrais, plus de boucle « pas connecté », et la fermeture de l'offre
// Premium mesurée (où, après quoi, comment, combien de temps).
// Cas fondateurs (entonnoir 01/10 → 15/10, 242 inscrits) : Orlanne (mur du lot
// 12 s après sa 1re synchro : 20 cochés pour 5 gratuits), Chiara (50
// republications en un lot, modale à la 51e), Marie Vincent (Leboncoin « pas
// connecté » 7 fois de suite en 26 min). AUCUN prix, AUCUN quota ne change.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };

const g = await import(pathToFileURL(join(ROOT, 'src/utils/dernierGeste.js')).href);
const a = await import(pathToFileURL(join(ROOT, 'src/annonces/absencesDeSuite.js')).href);

console.log('1. Après quoi : le dernier geste, en mémoire seulement');
g._oublierGeste();
ok(JSON.stringify(g.lireDernierGeste()) === JSON.stringify({ apres: 'aucun', apres_s: null }), 'aucun geste noté → « aucun »');
g.noterGeste('synchro_finie', 1_000);
ok(JSON.stringify(g.lireDernierGeste(13_500)) === JSON.stringify({ apres: 'synchro_finie', apres_s: 13 }), 'synchro finie il y a 13 s');
g.noterGeste('texte libre', 20_000);
ok(g.lireDernierGeste(21_000).apres === 'synchro_finie', 'liste FERMÉE : un geste inconnu n\'est jamais noté');
ok(g.canalDeLApp({ natif: true, plateforme: 'ios' }) === 'ios' && g.canalDeLApp({ natif: true, plateforme: 'android' }) === 'android'
  && g.canalDeLApp({ largeur: 375 }) === 'web_mobile' && g.canalDeLApp({ largeur: 1280 }) === 'web_ordinateur', 'canal : ios, android, web mobile, web ordinateur');
ok(!/supabase|localStorage/.test(lire('src/utils/dernierGeste.js').replace(/\/\/.*$/gm, '')), 'aucune lecture ni écriture (ni base, ni stockage)');

console.log('2. La fermeture de l\'offre, mesurée');
const m = lire('src/components/ConversionModal.jsx');
ok(/const fermerParLeFond = \(\) => fermer\('fond'\);/.test(m) && /const fermerNonMerci = \(\) => fermer\('non_merci'\);/.test(m) && /fermer\('echap'\)/.test(m), 'sorties : fond, non_merci, echap');
ok((m.match(/<Sheet onClose=\{fermerParLeFond\}>/g) || []).length === 4 && !/<Sheet onClose=\{fermer\}>/.test(m), 'les 4 feuilles : le tap hors de la feuille est « fond »');
ok((m.match(/<Dismiss onClose=\{fermerNonMerci\} /g) || []).length === 4, 'les 4 liens du bas : « non_merci »');
ok(/noterFermetureRef\.current\('quitte'\)/.test(m) && /'pagehide'/.test(m) && /noterFermetureRef\.current\('fermee_par_app'\)/.test(m), 'page quittée (« quitte ») et fermée par l\'app (retour Android, navigation)');
ok(/if \(o\.notee \|\| palierCliqueRef\.current\) return;/.test(m), 'UNE fermeture notée par ouverture, jamais après un choix de formule');
ok(/ouverture: o\.id, sortie, duree_ms:/.test(m) && /ecran: contexte\?\.ecran \?\? null, \.\.\.lireDernierGeste\(\), canal/.test(m), 'chaque fermeture : identifiant d\'ouverture, sortie, durée, écran, après quoi, canal');
ok(/logModale\('offers_modal_open', \{ origine: origine \?\? 'non_precisee', trigger, ouverture:/.test(m), 'l\'ouverture porte le même identifiant et le même contexte');
const app = lire('src/App.jsx');
ok(/openUpgradeModal\(null,'entete_quota'\)/.test(app) && (app.match(/openUpgradeModal\(null,'entete_offres'\)/g) || []).length === 2 && !/openUpgradeModal\(null,'entete'\)/.test(app), 'en-tête : la pastille « N annonces restantes » et « Voir les offres » ne se confondent plus');
ok(/contexte=\{\{ecran:showSettings\?'reglages':\(\['tableau','stock','lens','ventes','stats'\]\[tab\]\?\?'autre'\)\}\}/.test(app), 'l\'écran d\'où s\'ouvre l\'offre');
const lps = lire('src/components/ListingPreviewScreen.jsx');
ok(/origine="stepper_quota"/.test(lps) && /contexte=\{\{ ecran: "stepper" \}\}/.test(lps), 'stepper : « stepper_quota » au lieu de « non_precisee »');

console.log('3. Le geste gratuit, tout de suite');
const s = lire('src/tabs/StockTab.jsx');
ok(/if \(quotas\?\.palier !== 'free'\) return \{ annonces: null, repub: null, remise: null \};/.test(s), 'seulement pour un compte gratuit, sur les compteurs déjà chargés');
ok(/Gratuit : encore \$\{nombreFr\(n, lang\)\} republication/.test(s) && /Gratuit : encore \$\{nombreFr\(n, lang\)\} article\$\{n > 1 \? 's' : ''\} ce mois-ci, sur toutes tes plateformes/.test(s), '« Gratuit : encore N … ce mois-ci » sur Publier et Remonter');
ok(/ordre=\{ordreAFaire\}/.test(s) && /\? \['remonter', 'publier', 'aRegler'\] : null;/.test(s), '« À faire maintenant » : Remonter en tête quand il y a de quoi');
ok(/initiale=\{coupePub\?new Set\(articles\.slice\(0,offertsPub\)\.map\(a=>a\.id\)\):null\}/.test(s) && /initiale=\{coupeRep\?new Set\(articles\.slice\(0,offertsRep\)\.map\(a=>a\.id\)\):null\}/.test(s), 'la sélection ne coche pas plus que le mois n\'offre (Orlanne : 5, pas 20)');
ok(/repubMois=\{offertGratuit\.repub!=null\?\{restantes:offertGratuit\.repub,remise:offertGratuit\.remise\}:null\}/.test(s) && /Ton mois gratuit en couvre encore/.test(s), 'la feuille de republication dit le MOIS avant le clic (Chiara)');
const h = lire('src/stock/Haut.jsx');
ok(/const offert = \(g, style, court = false\) =>/.test(h) && (h.match(/\{offert\(g/g) || []).length === 3, 'la mention s\'affiche en lignes, boutons et tuiles (forme courte sur les tuiles)');
ok(/offertCourt: aPublierTout\.length \? texteOffertCourt\(offertGratuit\.annonces\)/.test(s) && /Gratuit : encore \$\{nombreFr\(n, lang\)\} ce mois-ci/.test(s), 'tuiles : « Gratuit : encore N ce mois-ci »');

console.log('4. La fenêtre de quota du lot : des textes vrais');
const l = lire('src/publication/lot/LotPublication.jsx');
ok(!/CLE_PLUS_TARD|fs_lot_plus_tard/.test(l), 'plus de liste « plus tard » écrite et jamais relue');
ok(!/attendront ton nouveau mois|attendra"\} ton nouveau mois|attendent` : "L'autre attend"|Tout attend ton nouveau mois|Mois prochain|Attend ton nouveau mois|wait for your new month/.test(l), 'plus jamais « attendront ton nouveau mois » : rien n\'attend (les jobs en attente de connexion, eux, attendent vraiment)');
ok(/restent` : "l'autre reste"\} dans ton stock, à publier dès ton nouveau mois/.test(l) && /quota: "Reste au stock"/.test(l), 'les articles au-delà du quota « restent dans ton stock »');
ok(/articles par mois, sur toutes tes plateformes/.test(l) && !/annonces par mois/.test(l), '« Passer à Premium — 40 articles par mois, sur toutes tes plateformes »');
ok(/un article publié sur plusieurs plateformes compte pour un/.test(l), 'le compte du quota se dit en articles');

console.log('5. « Pas connecté » deux fois de suite : plus de boucle');
const absent = (r) => r.status === 'absente';
ok(a.absencesDeSuite([{ status: 'absente' }, { status: 'absente' }, { status: 'done' }, { status: 'absente' }], absent) === 2, 'la série s\'arrête au premier relevé abouti');
ok(a.absencesDeSuite([{ status: 'running' }, { status: 'absente' }, { status: 'absente' }], absent) === 2, 'un relevé en cours ne casse pas la série');
ok(a.relancerAvecTout({ absences: 1 }) === true && a.relancerAvecTout({ absences: 2 }) === false && a.relancerAvecTout({ absences: 7, sessionOk: true }) === true, 'relancé jusqu\'à 1 ; plus à 2 (Marie : 7) ; de nouveau dès que la connexion est revue');
const u = lire('src/annonces/useReleveAnnonces.js');
ok(/if \(!relancerAvecTout\(\{ absences: Number\(run\?\.absences_de_suite\) \|\| 0, sessionOk: etatSession\(choix\?\.sessions \?\? null, p\) === 'ok' \}\)\) \{/.test(u) && /pasRelanceSansConnexion/.test(u), '« Synchroniser » saute la plateforme et le dit');
const sp = lire('src/utils/syncPlateformes.js');
ok(/absences_de_suite: absencesDeSuite\(liste, absenceDePlateforme\)/.test(sp), 'la série se lit sur les MÊMES lignes (aucune requête de plus)');
const b = lire('src/stock/BlocSynchro.jsx');
ok(/enSerie\(m\.platform\) \? T\.murRepriseDeSuite\(m\.nom, absencesDe\(m\.platform\)\) : T\.murReprise/.test(b) && /bouton=\{m\.platform !== 'vinted' && enSerie\(m\.platform\) \? synchroDe/.test(b), 'la carte dit où se connecter et garde « Synchroniser <plateforme> »');
const t = lire('src/annonces/textes.js');
ok(/murRepriseDeSuite: \(nom, n\) => `Toujours pas connecté à \$\{nom\} après \$\{n\} synchronisations/.test(t) && /plusieurs ordinateurs ou profils Chrome/.test(t), 'le texte nomme le cas des deux Chrome');

console.log('6. Aucun prix, aucun quota');
const blocGratuit = s.slice(s.indexOf('const offertGratuit = (() => {'), s.indexOf('const ordreAFaire'));
ok(blocGratuit.length > 500 && !/coin_config|\.update\(|\.insert\(|\.rpc\(|=\s*\d{2,}/.test(blocGratuit), 'le geste gratuit LIT les compteurs, n\'écrit rien et ne fixe aucun chiffre');
ok(!/coin_config|quota_/.test(lire('src/utils/dernierGeste.js') + lire('src/annonces/absencesDeSuite.js')), 'les modules neufs ignorent prix et quotas');

console.log(`\n✓ parcours-apres-synchro : ${n} contrôles verts`);
