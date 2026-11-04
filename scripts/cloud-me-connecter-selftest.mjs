// Autotest du bouton « Connecter mes plateformes » (01/11/2026, iPhone de Nico : le bouton ne faisait RIEN, sans trace).
// Cause : l'écran « Me connecter » était rendu dans `.app-root`, sous la page Réglages (portail sur document.body,
// z-index 400) ; sous iOS, WKWebView peint les couches fixes de `.app-root` dans sa couche, z-index ou pas.
//   1. Les couches Cloud qu'on ouvre depuis Réglages vivent sur document.body (portail), comme les réglages eux-mêmes ;
//   2. « Me connecter » ne s'ouvre QUE par ouvrirMeConnecter (App) : le clic est tracé, un écran non monté aussi ;
//   3. l'écran trace son ouverture, s'il est vraiment devant, ses erreurs et la fin de chaque connexion (usage_logs) ;
//   4. auPremierPlan (traceCloud.js) reconnaît un écran caché par une autre couche.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };

console.log('1. Les couches Cloud ouvertes depuis Réglages : un portail sur document.body');
const reglages = lire('src/reglages/ReglagesUI.jsx');
ok(/return createPortal\(/.test(reglages) && /zIndex: 400/.test(reglages), 'la page Réglages est un portail sur body, au plan 400 (la cause)');
for (const f of ['src/cloud/MeConnecterCloud.jsx', 'src/cloud/ConditionsCloudModale.jsx', 'src/cloud/FinEssaiCloud.jsx']) {
  const t = lire(f);
  const portail = (/return createPortal\(/.test(t) && /\n\s*document\.body,?\n\s*\);/.test(t))
    || /return typeof document === 'undefined' \? couche : createPortal\(couche, document\.body\);/.test(t);
  ok(/import \{ createPortal \} from 'react-dom';/.test(t) && portail, `${f} : rendu par createPortal(…, document.body)`);
}

console.log('\n2. « Me connecter » ne s\'ouvre que par ouvrirMeConnecter, qui trace le clic');
const app = lire('src/App.jsx');
ok((app.match(/setMeConnecterOuvert\(true\)/g) ?? []).length === 1, 'un seul setMeConnecterOuvert(true) dans App : celui de ouvrirMeConnecter');
const fn = app.slice(app.indexOf('function ouvrirMeConnecter(origine){'), app.indexOf('function ouvrirMeConnecter(origine){') + 400);
ok(/logTunnel\('cloud_me_connecter_clic',\{origine\}\);\s*setMeConnecterOuvert\(true\);/.test(fn), 'le clic est tracé AVANT l\'ouverture (usage_logs « cloud_me_connecter_clic »)');
ok(/document\.querySelector\('\[data-cloud-me-connecter\]'\)\)logTunnel\('cloud_me_connecter_muet'/.test(fn), 'écran non monté 1,5 s après : « cloud_me_connecter_muet »');
ok(/meConnecter:\(\)=>ouvrirMeConnecter\('reglages'\)/.test(app) && /onReconnecter=\{\(\)=>ouvrirMeConnecter\('bandeau'\)\}/.test(app) && /ouvrirMeConnecter\('achat'\)/.test(app),
  'Réglages, bandeau et achat passent tous par ouvrirMeConnecter (avec leur origine)');

console.log('\n3. L\'écran trace son ouverture, sa visibilité, ses erreurs, la fin de chaque connexion');
const me = lire('src/cloud/MeConnecterCloud.jsx');
ok(/data-cloud-me-connecter=""/.test(me), 'l\'écran se reconnaît (data-cloud-me-connecter)');
for (const trace of ['cloud_me_connecter_ouvert', 'cloud_me_connecter_cache', 'cloud_me_connecter_erreur', 'cloud_connexion_ouverte', 'cloud_connexion_fin']) {
  ok(me.includes(`'${trace}'`), `trace « ${trace} »`);
}

console.log('\n4. auPremierPlan : un écran caché par une autre couche est reconnu');
const { auPremierPlan } = await import('../src/cloud/traceCloud.js').catch(async () => {
  // traceCloud importe le client Supabase de l'app : on relit la fonction pure seule.
  const src = lire('src/cloud/traceCloud.js');
  const corps = src.slice(src.indexOf('export function auPremierPlan'));
  return { auPremierPlan: new Function(`${corps.replace('export function', 'function')}; return auPremierPlan;`)() };
});
const noeud = (tag, parent = null, attrs = {}) => {
  const e = { tagName: tag.toUpperCase(), parentElement: parent, className: attrs.className ?? '', getAttribute: (k) => attrs[k] ?? null, enfants: [] };
  e.contains = (x) => { for (let y = x; y; y = y.parentElement) if (y === e) return true; return false; };
  return e;
};
const body = noeud('body');
const ecran = noeud('div', body, { role: 'dialog', 'aria-label': 'Me connecter' });
const bouton = noeud('button', ecran);
const reglagesCouche = noeud('div', body, { role: 'dialog', className: 'rg-ecran', 'aria-label': 'Abonnement' });
const carte = noeud('div', reglagesCouche);
const docAvec = (el) => ({ body, defaultView: { innerWidth: 390, innerHeight: 844 }, elementFromPoint: () => el });
ok(auPremierPlan(ecran, docAvec(bouton)).visible === true, 'au centre, un élément de l\'écran : visible');
const cache = auPremierPlan(ecran, docAvec(carte));
ok(cache.visible === false && /rg-ecran/.test(cache.devant), `au centre, la page Réglages : caché, et ce qui est devant est dit (${cache.devant})`);
ok(auPremierPlan(null, docAvec(bouton)).visible === false, 'écran absent : jamais « visible »');

// ── (01/11, essai de Nico du soir) ────────────────────────────────────────────────────────────────────────────────
console.log('\n5. Le clavier : le champ caché n\'est JAMAIS vide (iPhone : effacer dans un champ vide n\'émet rien)');
const client = await import('../src/cloud/connexion/clientConnexion.js');
const cli = lire('src/cloud/connexion/clientConnexion.js');
ok(client.REMPLISSAGE.length >= 4, `un remplissage fixe (${client.REMPLISSAGE.length} caractères)`);
ok(/const remettre = \(\) => \{\s*champ\.value = REMPLISSAGE;/.test(cli) && /\n  remettre\(\);\n/.test(cli) && /addEventListener\('focus', remettre\)/.test(cli)
  && /ecrire\(\) \{ champ\.focus\(\{ preventScroll: true \}\); remettre\(\); \}/.test(cli), 'rempli à la création, au focus et à « Écrire » (curseur à la fin)');
const e = (t, d = null) => client.messageSaisie(t, d);
ok(JSON.stringify(e('deleteContentBackward').message) === '{"t":"touche","cle":"Backspace"}' && e('deleteContentBackward').annuler, 'effacer → Retour arrière (annulé dans le champ)');
ok(e('deleteWordBackward').message.cle === 'MotPrecedent' && e('deleteContentForward').message.cle === 'Delete' && e('deleteSoftLineBackward').message.cle === 'LignePrecedente', 'effacer un mot, à droite, jusqu\'au début de la ligne');
ok(e('insertText', 'é').message.s === 'é' && e('insertFromPaste', null).message === null && client.messageSaisie('insertFromPaste', null, 'collé').message.s === 'collé', 'texte, accent, collage');
ok(e('insertLineBreak').message.cle === 'Enter' && e('insertCompositionText', 'x').annuler === false, 'Entrée ; une composition n\'est pas annulée (lue à sa fin)');
const R = client.REMPLISSAGE;
ok(JSON.stringify(client.ecartRemplissage(R.slice(0, -1))) === '{"effacer":1,"texte":""}' && JSON.stringify(client.ecartRemplissage(R.slice(0, -3))) === '{"effacer":3,"texte":""}', 'ce qui a été effacé malgré tout se lit (1, 3 caractères)');
ok(JSON.stringify(client.ecartRemplissage(`${R}日本`)) === '{"effacer":0,"texte":"日本"}' && JSON.stringify(client.ecartRemplissage('')) === `{"effacer":${R.length},"texte":""}`, 'une composition finie se lit ; un champ vidé = tout effacé');
ok(/addEventListener\('input', \(e\) => \{ if \(!compose && !e\.isComposing\) rattraper\(\); \}\)/.test(cli), 'une saisie non annulée est rattrapée, puis le champ revient');

console.log('\n6. La page survit à l\'app quittée (lire un SMS, un courriel) et reprend au retour');
ok(!/ETAPES_FINALES = \[[^\]]*'ferme'/.test(me), '« ferme » n\'est plus une fin');
ok(/if \(etape === 'ferme'\) \{ if \(!finale && !mort\) reprendre\(\); return; \}/.test(me) && /visibilitychange/.test(me) && /REPRISES_MAX/.test(me), 'connexion coupée sans « Fermer » : reprise quand l\'app revient devant, bornée');
for (const trace of ['cloud_connexion_reprise', 'cloud_connexion_verifiee']) ok(me.includes(`'${trace}'`), `trace « ${trace} »`);
ok(/etape === 'verifie'/.test(me) && /onFermer\(verifieeRef\.current\)/.test(me), '« vérifié » : la page reste ; « Fermer » relit la liste quand le compte a été vérifié');

console.log('\n7. eBay : relié par l\'API, jamais une connexion dans le navigateur Cloud');
ok(/lireEtatEbay\(\)\.then\(\(r\) => setEbayRelie\(ebayVoieApiDuCompte\(r\?\.etat \?\? null\) === true\)/.test(me), 'l\'état eBay est lu dans `etat` (l\'enveloppe { etat } disait « à relier » à tout le monde)');
ok(/sansBouton=\{ebay\.relie\}/.test(me) && /demarrerConnexionEbay\(\)/.test(me) && !/CLOUD_PLATEFORMES_CONNEXION[^\n]*ebay/i.test(me), 'relié : aucun bouton ; pas relié : la connexion officielle (API), jamais le navigateur');
const offre = lire('src/config/cloudOffer.js');
ok(!/id:\s*'ebay'/.test(offre.slice(offre.indexOf('CLOUD_PLATEFORMES_CONNEXION'))), 'eBay n\'est pas une plateforme du navigateur Cloud');

// ── (02/11, demande de Nico) « Résoudre la vérification » ────────────────────────────────────────────────────────
console.log('\n8. Une vérification du navigateur Cloud : « Résoudre la vérification », la même vue que « Me connecter »');
ok(/export function Vue\(\{ userId, plateforme, nom, lang, onFermer, mode = null \}\)/.test(me) && /lang, mode,/.test(me), 'la vue prend le mode « resoudre » et le passe au serveur');
for (const f of ['resolu', 'revenue', 'restreint', 'session_fermee', 'rien']) ok(new RegExp(`ETAPES_FINALES = \\[[^\\]]*'${f}'`).test(me), `fin « ${f} »`);
ok(/etape === 'connecte' \|\| etape === 'resolu'/.test(me), 'résolue : la vue se ferme et la liste se relit');
ok(/\{!resoudre && <button type="button" onClick=\{\(\) => session\.current\?\.ecrire\(\)\}/.test(me), 'résoudre : pas de clavier, on fait glisser');
ok(/sansBouton=\{verif !== 'a_resoudre'\}/.test(me) && /verif === 'a_resoudre' \? \{ \.\.\.p, mode: 'resoudre' \}/.test(me), 'la ligne : bouton seulement pour une vérification à résoudre');
ok(/mode === 'resoudre' \? \{ mode \} : \{\}/.test(cli), 'le client envoie le mode à l\'ouverture (rien pour « Me connecter »)');
const bandeauR = lire('src/cloud/BandeauCloudReconnexion.jsx');
ok(/import \{ Vue \} from '\.\/MeConnecterCloud'/.test(bandeauR) && /mode="resoudre"/.test(bandeauR) && /createPortal\(vue, document\.body\)/.test(bandeauR), 'le bandeau ouvre la page de vérification lui-même (sur body)');
ok(/etat === 'a_resoudre' && \(/.test(bandeauR) && /setResolution\(concernees\[0\]\)/.test(bandeauR), 'bouton seulement pour une vérification à résoudre ; restreinte ou revenue : aucun bouton');
ok(/fermees: \[\.\.\.fermees, \.\.\.v\.map\(\(x\) => x\.id\)\]/.test(bandeauR), 'une plateforme en vérification n\'est jamais dite « déconnectée » en plus');
const tx2 = lire('src/cloud/textesConnexion.js');
ok(!/dans ton navigateur|ouvre leboncoin/i.test(tx2.replace(/^\s*\/\/.*$/gm, '')), 'jamais « ouvre … dans ton navigateur » (c\'est le navigateur du Cloud)');
ok(tx2.split("\n  resoudre: '").length === 3 && tx2.split('bandeauVerifTexte: (noms, etat) =>').length === 3, 'fr et en : le bouton et le texte de chaque état');

console.log('\n9. La feuille « Republier » dit qu\'eBay reste en ligne (02/11, décision de Nico)');
const stock = lire('src/tabs/StockTab.jsx');
ok(/surEbay: computeRemovalInfo\(jobsByInventaire\[it\.id\] \|\| \[\]\)\.publishedActive\.includes\('ebay'\)/.test(stock), 'l\'article en ligne sur eBay est repéré à l\'ouverture de la feuille');
ok(stock.includes("'eBay : ton annonce reste en ligne telle quelle.'") && /items\.some\(\(i\) => i\.surEbay\)/.test(stock), 'la ligne « eBay : ton annonce reste en ligne telle quelle. », seulement quand eBay porte l\'annonce');

console.log('\n10. Une plateforme connectée : aucun bouton principal (02/11, Nico : « ça fait croire à un problème »)');
ok(/\{!sansBouton && connecte && <button[^>]*data-cloud-bouton="changer"/.test(me) && /\{libelle\?\.refaire \?\? T\.changerCompte\}/.test(me), 'connectée : un lien discret « Changer de compte »');
ok(/\{!sansBouton && !connecte && <button/.test(me) && /libelle\?\.faire \?\? \(aReconnecter \? T\.reconnecter : T\.meConnecter\)/.test(me), '« Me reconnecter » seulement déconnectée ; « Me connecter » jamais connectée');
ok(!/connecte \? \(libelle\?\.refaire \?\? T\.reconnecter\)/.test(me), 'plus jamais « Me reconnecter » à côté de « Connecté »');
ok(tx2.split("changerCompte: '").length === 3 || lire('src/cloud/textesConnexion.js').split("changerCompte: '").length === 3, 'fr et en : « Changer de compte »');

console.log('\n11. Essai Beebs de Nico (02/11 14:37) : la connexion isolée se voit, le bandeau de cookies se ferme');
ok(/import \{[^}]*connectesIsoles[^}]*\} from '\.\/executant'/.test(me) && /setIsoles\(connectesIsoles\(data\?\.platform_settings \?\? null\)\)/.test(me), 'l\'écran lit les plateformes connectées dans leur navigateur réservé');
ok(/connecte=\{etatConnexion\(etats\?\.\[p\.id\]\) === 'connecte' \|\| isole\}/.test(me) && /texte=\{isole && !verif \? T\.isoleTexte : null\}/.test(me), 'Beebs connectée dans son navigateur réservé : « Connecté », avec ce que ça veut dire');
ok(/if \(etape === 'cookies'\) \{ setCookies\(m === true\); return; \}/.test(me) && /session\.current\?\.refuserCookies\(\)/.test(me), 'le bandeau de cookies : un bouton « Refuser les cookies »');
ok(/else if \(m\.t === 'cookies'\) surEtat\('cookies', m\.present === true\);/.test(cli) && /refuserCookies\(\) \{ envoyer\(\{ t: 'cookies', choix: 'refuser' \}\); \}/.test(cli), 'le client relaie le bandeau et son refus');
const tx3 = lire('src/cloud/textesConnexion.js');
ok(tx3.split("refuserCookies: '").length === 3 && tx3.split("isoleTexte: '").length === 3, 'fr et en : le bouton et la ligne');

// (04/11, Beebs) Le zoom sur la glissière : l'app découpe l'image reçue (le serveur ne zoome que pour une app qui l'annonce).
console.log('\n6. Le zoom sur la glissière Beebs (04/11)');
const sz = client.sourceZoom({ x: 70, y: 0, l: 360, h: 538 }, { l: 500, h: 747 }, { width: 500, height: 747 });
ok(JSON.stringify(sz) === '{"sx":70,"sy":0,"sl":360,"sh":538}', 'image à la taille de la page : la zone telle quelle');
const sz2 = client.sourceZoom({ x: 70, y: 0, l: 360, h: 538 }, { l: 500, h: 747 }, { width: 1000, height: 1494 });
ok(sz2.sx === 140 && sz2.sl === 720 && sz2.sh === 1076, 'image deux fois plus grande : la zone à son échelle');
ok(client.sourceZoom(null, { l: 500, h: 747 }, { width: 500, height: 747 }) === null && client.sourceZoom({ x: 0, y: 0, l: 1, h: 1 }, null, { width: 1, height: 1 }) === null, 'sans zone (ou sans page) : l\'image entière');
ok(/zoom: true, \.\.\.\(mode === 'resoudre'/.test(cli), 'l\'app annonce qu\'elle sait zoomer (sinon le serveur ne zoome jamais)');
ok(/else if \(m\.t === 'zoom'\) \{ zoom = m\.zone \? \{ zone: m\.zone, page: m\.page \} : null; dessiner\(\); \}/.test(cli), 'un changement de zoom redessine aussitôt la dernière image');
const srvCx = lire('serveur-cloud/src/connexion.js');
ok(/zoomClient: m\.zoom === true/.test(srvCx) && /if \(!bureau \|\| !zoomClient/.test(srvCx), 'serveur : zoom seulement pour une app qui l\'annonce, et pour Beebs (vue bureau)');
ok(!/send\('Page\.captureScreenshot'/.test(srvCx) && /mettreFenetreBureau/.test(srvCx) && !/mobile: false/.test(srvCx),'serveur : jamais de capture découpée pendant « Me connecter » (elle décale la souris, banc du 04/11)');

console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
