// ═══════════════════════════════════════════════════════════════════════════
// LES LIENS « ME CONNECTER » OUVRENT LE SITE, JAMAIS UNE PAGE D'AUTHENTIFICATION NUE — `npm run selftest:liens-connexion`
// ═══════════════════════════════════════════════════════════════════════════
// 09/11 (Guillaume JEHLY, Brave, Business) : « Me reconnecter » ouvrait https://auth.leboncoin.fr/login, SANS paramètre.
// La page s'affiche (e-mail, mot de passe), mais son formulaire envoie client_id, redirect_uri et from_to LUS DANS
// L'ADRESSE, sans valeur par défaut (POST /api/authenticator/v2/users/login) : sans eux Leboncoin refuse, et un refus 401
// s'affiche « Votre mot de passe est incorrect » (clé login.unknown-account.error, relevée dans le code de la page le
// 09/11). Le même mot de passe passait dans un autre onglet (passé par leboncoin.fr → « Se connecter »), un autre
// navigateur, le téléphone. Déconnecté, « Mes annonces » mène à auth.leboncoin.fr/login?client_id=lbc-front-web&
// redirect_uri=…/api/authorizer/v2/authorize&from_to=… (relevé le 09/11 dans un Chrome neuf).
// LA RÈGLE : un lien de connexion ouvre une page du SITE de la plateforme qui exige la connexion (ou son accueil) ;
// c'est la plateforme qui construit sa page de connexion, avec son contexte. Jamais l'hôte d'authentification d'un
// échange OAuth (auth.leboncoin.fr) en lien direct.
//   1. PLATFORM_LOGIN_URLS (utils/shared.js) — la SEULE source des liens de l'app (bouton « Me connecter » sur le web,
//      carte d'une tâche échouée, étape de publication, Réglages) : aucun hôte d'authentification ;
//   2. Leboncoin : www.leboncoin.fr/compte/part/mes-annonces (la page que l'extension relit, et qui mène à la connexion) ;
//   3. aucun fichier de l'app n'écrit une adresse https://auth.leboncoin.fr en dur (les DÉTECTIONS par motif restent) ;
//   4. l'extension (file « connexion » du téléphone, popup) ouvre déjà www.leboncoin.fr — vérifié, inchangé ;
//   5. le bouton du web est bien un lien vers PLATFORM_LOGIN_URLS (lienWeb), rien d'autre.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');

let ko = 0, ok = 0;
const verifier = (cond, nom) => { if (cond) { ok++; console.log(`  ✓ ${nom}`); } else { ko++; console.error(`  ✗ ${nom}`); } };

// Hôtes d'authentification qui exigent le contexte d'un échange OAuth posé par le site : jamais en lien direct.
const HOTES_AUTH_INTERDITS = ['auth.leboncoin.fr'];

// 1-2. La table de l'app, lue dans le source (shared.js importe des modules de l'app : on lit l'objet tel qu'écrit).
const shared = lire('src/utils/shared.js');
const bloc = shared.match(/export const PLATFORM_LOGIN_URLS = \{([\s\S]*?)\n\};/);
verifier(Boolean(bloc), 'PLATFORM_LOGIN_URLS est lisible dans src/utils/shared.js');
const urls = Object.fromEntries([...(bloc?.[1] ?? '').matchAll(/^\s*(\w+):\s*'([^']+)'/gm)].map((m) => [m[1], m[2]]));
verifier(['vinted', 'leboncoin', 'ebay', 'beebs'].every((k) => urls[k]), 'les quatre plateformes ont leur adresse');
for (const [pf, u] of Object.entries(urls)) {
  let hote = '';
  try { hote = new URL(u).host; } catch { /* invalide */ }
  verifier(hote && !HOTES_AUTH_INTERDITS.includes(hote), `${pf} : ${u} n'est pas un hôte d'authentification nu`);
}
verifier(urls.leboncoin === 'https://www.leboncoin.fr/compte/part/mes-annonces',
  'Leboncoin : « Mes annonces » sur www.leboncoin.fr (Leboncoin construit la connexion avec client_id/redirect_uri/from_to)');
verifier(!/[?&](client_id|redirect_uri|code_challenge|state)=/.test(urls.leboncoin ?? ''),
  "Leboncoin : on ne fabrique aucun paramètre d'échange OAuth nous-mêmes");

// 3. Aucune adresse d'authentification Leboncoin écrite en dur dans l'app (une détection par motif n'est pas un lien).
const fichiers = [];
const parcourir = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) parcourir(p);
    else if (/\.(jsx?|mjs|ts|tsx)$/.test(n)) fichiers.push(p);
  }
};
parcourir(join(RACINE, 'src'));
const enDur = fichiers.filter((f) => /['"`]https:\/\/auth\.leboncoin\.fr/.test(readFileSync(f, 'utf8')))
  .map((f) => relative(RACINE, f).replace(/\\/g, '/'));
verifier(enDur.length === 0, `aucune adresse https://auth.leboncoin.fr en dur dans src/ (${enDur.join(', ') || 'aucune'})`);

// 4. L'extension ouvre l'accueil du site (file « connexion » du téléphone et popup) — inchangé.
const bg = lire('chrome-extension/background.js');
verifier(/const ADRESSES_CONNEXION = \{[\s\S]*?leboncoin: "https:\/\/www\.leboncoin\.fr\/"/.test(bg),
  "extension : ADRESSES_CONNEXION.leboncoin = https://www.leboncoin.fr/ (page du site)");
const popup = lire('chrome-extension/popup.js');
verifier(/key: "leboncoin"[^\n]*loginUrl: "https:\/\/www\.leboncoin\.fr\/"/.test(popup),
  'popup : loginUrl Leboncoin = https://www.leboncoin.fr/ (page du site)');
verifier(!/https:\/\/auth\.leboncoin\.fr\/login/.test(popup), "popup : aucun lien vers auth.leboncoin.fr/login");

// 5. Le bouton du web est un lien vers la table, et la carte d'une tâche échouée aussi.
const conn = lire('src/utils/connexionPlateformes.js');
verifier(/return PLATFORM_LOGIN_URLS\[platform\] \?\? null;/.test(conn), 'lienWeb lit PLATFORM_LOGIN_URLS (une seule table)');
const stock = lire('src/tabs/StockTab.jsx');
verifier(/url: PLATFORM_LOGIN_URLS\[job\.platform\]/.test(stock), 'la carte d\'une tâche échouée lit PLATFORM_LOGIN_URLS');

console.log(`\n${ok} vert(s), ${ko} rouge(s)`);
if (ko) process.exit(1);
