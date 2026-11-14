// VERROU (14/11/2026, cliente 13e274de) — « Me connecter » DIT « CACHÉ » ALORS QU'IL NE L'ÉTAIT PAS, ET LA PAGE DE
// CONNEXION EN « VERSION ORDINATEUR » D'UN TÉLÉPHONE.
//
// Les deux seules lignes « cloud_me_connecter_cache » de toute la base (00:58:18 et 00:59:30) disent
// « html|notranslate (couche : html|notranslate) ». Ce n'est PAS une couche de traduction : c'est l'élément <html> de
// FillSell lui-même (classe « notranslate » posée par index.html) — au point testé (le centre de la FENÊTRE),
// elementFromPoint ne trouvait AUCUN élément de la page. Les deux lignes viennent de Firefox Android passé en « version
// ordinateur » (journaux de la passerelle : session f870b212, « Android 16; Mobile; rv:159.0 » jusqu'à 00:57:44, puis
// « X11; Linux x86_64; rv:159.0 » dès 00:57:51) ; la page n'était pas traduite (Google pose « translated-ltr » sur <html>,
// absent). Et 3,5 s après chacune, elle a bien touché Vinted : l'écran était devant, c'est le test qui visait à côté
// (en version ordinateur, la page est dessinée à 980 px puis réduite : la fenêtre ne coïncide plus avec la couche fixe).
//
// Règle (pour tous) :
//   1. le contrôle vise le centre de la PARTIE VISIBLE de l'écran (sa boîte ∩ la fenêtre), jamais un point hors de lui ;
//      il nomme « html » comme « aucun élément » et joint ce qui explique : page traduite, fenêtre, couche, échelle ;
//   2. un téléphone en « version ordinateur » est reconnu (modeOrdinateur) : « Me connecter » le dit et dit comment
//      revenir à la version mobile (la page de connexion y est minuscule) ; la ligne « ordinateur » part dans la trace ;
//   3. la traduction ne touche jamais aux écrans de connexion : translate="no" + notranslate sur chacun d'eux, en plus
//      de <html> (index.html, connexion.html).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => { try { return readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };

// traceCloud importe le client Supabase de l'app : on relit la fonction pure seule (dernière du fichier, autonome).
const srcTrace = lire('src/cloud/traceCloud.js');
const auPremierPlan = new Function(`${srcTrace.slice(srcTrace.indexOf('export function auPremierPlan')).replace('export function', 'function')}; return auPremierPlan;`)();

const noeud = (tag, parent = null, attrs = {}, rect = null) => {
  const e = { tagName: tag.toUpperCase(), parentElement: parent, className: attrs.className ?? '', getAttribute: (k) => attrs[k] ?? null, rect };
  e.contains = (x) => { for (let y = x; y; y = y.parentElement) if (y === e) return true; return false; };
  e.getBoundingClientRect = () => rect ?? { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  return e;
};
const boite = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const dedans = (r, x, y) => r && x >= r.left && x < r.right && y >= r.top && y < r.bottom;

console.log('1. Le cas du 14/11 (Firefox Android, version ordinateur) : l\'écran est devant, là où il est');
{
  const html = noeud('html', null, { className: 'notranslate' });
  const body = noeud('body', html);
  // Fenêtre 980 × 2100 (page d'ordinateur réduite) ; la couche fixe « Me connecter » ne couvre que 980 × 915.
  const ecran = noeud('div', body, { role: 'dialog', 'aria-label': 'Me connecter' }, boite(0, 0, 980, 915));
  const ligne = noeud('button', ecran, {}, boite(16, 300, 948, 60));
  const doc = {
    body, documentElement: html,
    defaultView: { innerWidth: 980, innerHeight: 2100, visualViewport: { width: 980, height: 2100, scale: 0.42 } },
    elementFromPoint: (x, y) => (dedans(ligne.rect, x, y) ? ligne : dedans(ecran.rect, x, y) ? ecran : html),
  };
  const vu = auPremierPlan(ecran, doc);
  ok(vu.visible === true, 'visible : le contrôle vise la partie visible de l\'écran, pas le centre d\'une fenêtre plus grande que lui');
  ok(vu.contexte?.fenetre === '980x2100' && vu.contexte?.couche === '980x915', 'la trace dit la fenêtre et la boîte de l\'écran (980x2100, 980x915)');
  ok(vu.contexte?.couvre === false, 'la trace dit que l\'écran ne couvre pas toute la fenêtre');
  ok(vu.contexte?.echelle === 0.42, 'la trace dit l\'échelle de la page (0,42 : page réduite)');
}

console.log('\n2. « html » au point testé = AUCUN élément (jamais lu comme une couche de traduction)');
{
  const html = noeud('html', null, { className: 'notranslate' });
  const body = noeud('body', html);
  const ecran = noeud('div', body, { role: 'dialog' }, boite(0, 0, 390, 844));
  const doc = { body, documentElement: html, defaultView: { innerWidth: 390, innerHeight: 844 }, elementFromPoint: () => html };
  const vu = auPremierPlan(ecran, doc);
  ok(vu.visible === false, 'rien à l\'endroit de l\'écran : pas visible');
  ok(/^aucun élément/.test(vu.devant ?? '') && !/couche : html\|notranslate/.test(vu.devant ?? ''), `« devant » le dit en clair (${vu.devant})`);
  ok(vu.contexte?.traduite === false, 'page non traduite : « traduite » faux (pas de translated-ltr sur <html>)');
  const htmlTraduit = noeud('html', null, { className: 'notranslate translated-ltr' });
  const vu2 = auPremierPlan(ecran, { ...doc, documentElement: htmlTraduit, elementFromPoint: () => htmlTraduit });
  ok(vu2.contexte?.traduite === true, 'page traduite par le navigateur : « traduite » vrai');
}

console.log('\n3. Une autre couche PAR-DESSUS est toujours reconnue (le bouton muet du 01/11)');
{
  const html = noeud('html', null, { className: 'notranslate' });
  const body = noeud('body', html);
  const ecran = noeud('div', body, { role: 'dialog', 'aria-label': 'Me connecter' }, boite(0, 0, 390, 844));
  const reglages = noeud('div', body, { role: 'dialog', className: 'rg-ecran', 'aria-label': 'Abonnement' }, boite(0, 0, 390, 844));
  const carte = noeud('div', reglages, {}, boite(0, 0, 390, 844));
  const doc = { body, documentElement: html, defaultView: { innerWidth: 390, innerHeight: 844 }, elementFromPoint: () => carte };
  const vu = auPremierPlan(ecran, doc);
  ok(vu.visible === false && /rg-ecran/.test(vu.devant ?? ''), `caché par Réglages : reconnu (${vu.devant})`);
  ok(auPremierPlan(null, doc).visible === false, 'écran absent : jamais « visible »');
  const loin = noeud('div', body, { role: 'dialog' }, boite(0, 5000, 390, 844));
  ok(auPremierPlan(loin, doc).visible === false && /hors de la fenêtre/.test(auPremierPlan(loin, doc).devant ?? ''), 'écran hors de la fenêtre : dit tel quel');
}

console.log('\n4. modeOrdinateur : un TÉLÉPHONE qui demande la version ordinateur');
const modeMod = await import('../src/cloud/connexion/modeOrdinateur.js').catch((e) => ({ erreur: e }));
ok(!modeMod.erreur && typeof modeMod.modeOrdinateur === 'function', 'src/cloud/connexion/modeOrdinateur.js : modeOrdinateur existe');
if (!modeMod.erreur) {
  const { modeOrdinateur } = modeMod;
  const tel = { toucher: 5, grossier: true, ecranMin: 412 };
  const cas = [
    ['Mozilla/5.0 (X11; Linux x86_64; rv:159.0) Gecko/20100101 Firefox/159.0', tel, true, 'Firefox Android en version ordinateur (son UA du 14/11)'],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36', tel, true, 'Chrome / Edge Android en version ordinateur'],
    ['Mozilla/5.0 (Android 16; Mobile; rv:159.0) Gecko/159.0 Firefox/159.0', tel, false, 'Firefox Android normal'],
    ['Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36 EdgA/157.0.0.0', tel, false, 'Edge Android normal'],
    ['Mozilla/5.0 (Linux; Android 16; SM-G556B Build/BP4A.251205.006; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/157.0.8103.50 Mobile Safari/537.36', tel, false, 'app Android (WebView)'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', { toucher: 5, grossier: true, ecranMin: 820 }, false, 'iPad (version ordinateur par défaut) : jamais signalé'],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36', { toucher: 0, grossier: false, ecranMin: 1080 }, false, 'vrai ordinateur Linux (et le Chrome du serveur Cloud)'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36', { toucher: 10, grossier: false, ecranMin: 1080 }, false, 'PC Windows tactile'],
  ];
  for (const [ua, m, attendu, nom] of cas) ok(modeOrdinateur({ ua, ...m }) === attendu, `${nom} : ${attendu}`);
  ok(modeOrdinateur({}) === false && modeOrdinateur() === false, 'rien de lisible : jamais signalé');
}

console.log('\n5. « Me connecter » dit la version ordinateur et la trace la porte');
const me = lire('src/cloud/MeConnecterCloud.jsx');
ok(/import \{ modeOrdinateur \} from '\.\/connexion\/modeOrdinateur'/.test(me), 'MeConnecterCloud lit modeOrdinateur');
ok(/data-cloud-mode-ordinateur=""/.test(me) && /T\.modeOrdinateur/.test(me), 'un encart « version ordinateur » s\'affiche quand c\'est le cas');
ok(/'cloud_me_connecter_mode_ordinateur'/.test(me), 'trace « cloud_me_connecter_mode_ordinateur »');
ok(/tracerCloud\(userId, 'cloud_me_connecter_cache', \{ devant: vu\.devant, \.\.\.vu\.contexte/.test(me), '« cloud_me_connecter_cache » porte le contexte (traduite, fenêtre, couche, échelle)');
ok(/ordinateur: true/.test(me), 'la ligne « ouvert » dit « ordinateur » quand la page est en version ordinateur');
const textes = await import('../src/cloud/textesConnexion.js').catch(() => null);
for (const l of ['fr', 'en']) {
  const T = textes?.textesConnexion?.(l) ?? {};
  ok(typeof T.modeOrdinateur === 'string' && /(version|desktop)/i.test(T.modeOrdinateur), `texte « version ordinateur » (${l})`);
}

console.log('\n6. La traduction ne touche jamais aux écrans de connexion');
const sansTraduction = (src, re) => re.test(src);
ok(sansTraduction(me, /data-cloud-me-connecter="" translate="no" className="notranslate"/), 'MeConnecterCloud : la couche « Me connecter »');
ok(sansTraduction(me, /role="dialog" aria-modal="true" aria-label=\{`\$\{T\.titre\} — \$\{nom\}`\} translate="no" className="notranslate"/), 'MeConnecterCloud : la page de connexion (Vue)');
ok(sansTraduction(lire('src/cloud/CarteConnexionCloud.jsx'), /<section data-cloud-connexion-carte=\{ou\} translate="no" className="notranslate"/), 'la carte « Connecte tes comptes » (Tableau, Stock)');
ok(/function Rangee\([^)]*\) \{[\s\S]{0,200}<div translate="no" className="notranslate"/.test(lire('src/entree/EtapeCloudConnexion.jsx')), 'l\'étape des connexions du parcours d\'entrée (chaque ligne et son bouton ; la page elle-même est la Vue)');
ok((lire('src/cloud/BandeauCloudReconnexion.jsx').match(/translate="no" className="notranslate"/g) ?? []).length >= 4, 'le bandeau de reconnexion (ses quatre formes)');
ok(/<html lang="fr" translate="no" class="notranslate">/.test(lire('index.html')) && /<meta name="google" content="notranslate" \/>/.test(lire('index.html')), 'index.html : <html translate="no" class="notranslate"> + meta google notranslate (inchangés)');
ok(/<html lang="fr" translate="no" class="notranslate">/.test(lire('serveur-cloud/public/connexion.html')), 'page autonome du serveur : inchangée');
ok(/"TranslateEnabled": false/.test(lire('serveur-cloud/navigateur-chrome/politique.json')), 'le Chrome du serveur ne traduit jamais la page de la plateforme');
const pkg = lire('package.json');
ok(/"selftest:cloud-connexion-affichage": "node scripts\/cloud-connexion-affichage-selftest\.mjs"/.test(pkg), 'verrou inscrit dans package.json');

console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
