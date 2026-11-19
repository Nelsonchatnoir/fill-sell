// ═══════════════════════════════════════════════════════════
// VERROU — L'ÉCRAN D'INSCRIPTION DE LA MAQUETTE 01 (19/11/2026, ordre de Nico)   npm run selftest:ecran-connexion
// ═══════════════════════════════════════════════════════════
// Nico, 19/11 : « l'écran d'inscription exactement comme la maquette » (écran 01 du lot T1 : l'orbite des cinq
// plateformes, « Publie une fois. Vends partout. », Apple / Google / « mon e-mail », « Déjà un compte ? Se connecter »,
// les mentions) — « la connexion et l'inscription doivent marcher exactement comme aujourd'hui (Apple, Google, e-mail,
// code à 6 chiffres, compte existant) ». Ce verrou fait tomber :
//   · un écran qui perd un des trois boutons, l'accroche, les cinq logos ou les mentions (liens /legal) ;
//   · « Continuer avec Apple » sur Android (aucune connexion Apple native là-bas), ou absent sur iPhone / le web ;
//   · un bouton qui n'appelle plus le geste d'avant (handleAppleSignIn natif, handleOAuthSignIn web et Google) ;
//   · le formulaire e-mail d'avant amputé (adresse, confirmation, mot de passe, oublié, « J'ai déjà reçu un code ») ;
//   · l'écran du code à 6 chiffres, signUp (emailRedirectTo), verifyOtp 'signup', signInWithPassword qui disparaissent ;
//   · « Me connecter » de la page de confirmation qui ne rouvre plus directement le formulaire de connexion.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 400)}` : ''}`); }
};
const ESP = new RegExp(`[${String.fromCharCode(0xa0)}${String.fromCharCode(0x202f)}]`, 'g');
const texte = (html) => String(html).replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(ESP, ' ').replace(/\s+/g, ' ').replace(/ ([,.?])/g, '$1').trim();

const { createServer } = await import('vite');
const vite = await createServer({
  root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  ssr: { noExternal: [] },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const h = React.createElement;
  let EC = {};
  try { EC = await vite.ssrLoadModule('/src/auth/EcranConnexion.jsx'); } catch (e) { EC = { __erreur: e?.message ?? String(e) }; }
  ok(typeof EC.ChoixConnexion === 'function' && typeof EC.CoqueConnexion === 'function',
    'src/auth/EcranConnexion.jsx : ChoixConnexion et CoqueConnexion existent', EC.__erreur ?? '');

  console.log('\n— A. L\'écran 01, tel que la maquette');
  const rendre = (apple, lang = 'fr') => (typeof EC.ChoixConnexion === 'function'
    ? renderToStaticMarkup(h(EC.CoqueConnexion, { lang, onAccueil: () => {} }, h(EC.ChoixConnexion, { lang, apple, onApple() {}, onGoogle() {}, onEmail() {}, onSeConnecter() {} })))
    : '');
  const iphone = rendre('natif'), android = rendre(null), web = rendre('web'), en = rendre('web', 'en');
  const t = texte(iphone);
  ok(/Publie une fois\. Vends partout\./.test(t), '« Publie une fois. Vends partout. »', t.slice(0, 160));
  ok(/Vinted, Leboncoin, Beebs, Depop et eBay, depuis une seule app\./.test(t), 'les cinq plateformes dans la phrase, « depuis une seule app. »', t.slice(0, 300));
  for (const nom of ['Vinted', 'Leboncoin', 'Beebs', 'Depop', 'eBay']) {
    ok((iphone.match(new RegExp(`data-logo-plateforme="${nom}"`, 'g')) ?? []).length >= 1, `l'orbite porte le logo ${nom}`);
  }
  ok(/class="cnx-icone" src="\/icon_180x180\.png"/.test(iphone), 'l\'icône FillSell au centre de l\'orbite');
  ok(/Continuer avec Google/.test(t) && /Continuer avec mon e-mail/.test(t), '« Continuer avec Google » et « Continuer avec mon e-mail »');
  ok(/Déjà un compte ?\? Se connecter/.test(t),'« Déjà un compte ? Se connecter »', t);
  ok(/href="\/legal#cgu"[^>]*>Conditions</.test(iphone) && /href="\/legal#confidentialite"[^>]*>Politique de confidentialité</.test(iphone),
    'les mentions : Conditions (/legal#cgu) et Politique de confidentialité (/legal#confidentialite)');
  ok(/En continuant, tu acceptes les Conditions et la Politique de confidentialité\./.test(t), 'la phrase des mentions, mot pour mot');
  const ordre = ['data-connexion="apple"', 'data-connexion="google"', 'data-connexion="email"', 'data-connexion="se-connecter"'].map((m) => iphone.indexOf(m));
  ok(ordre.every((i) => i > 0) && ordre.every((i, k) => k === 0 || i > ordre[k - 1]), 'l\'ordre : Apple, Google, e-mail, puis « Se connecter »', ordre.join(','));

  console.log('\n— B. Apple : iPhone et web, jamais Android');
  ok(/Continuer avec Apple/.test(iphone), 'iPhone : « Continuer avec Apple »');
  ok(/Continuer avec Apple/.test(web), 'web : « Continuer avec Apple »');
  ok(!/Continuer avec Apple/.test(android) && !/data-connexion="apple"/.test(android), 'Android : aucun bouton Apple');
  ok(/data-connexion="google"/.test(android) && /data-connexion="email"/.test(android), 'Android : Google et e-mail présents');
  ok(/Post once\./.test(texte(en)) && /Continue with Google/.test(texte(en)) && /Sign in/.test(texte(en)), 'anglais : même écran, traduit');
  ok(/class="cnx-d"/.test(web) && /Tes annonces sur cinq plateformes, ton stock et tes ventes au même endroit\./.test(texte(web)),
    'web large : le panneau de droite (orbite + légende de la maquette)');
  ok(/@media \(min-width:900px\)/.test(iphone) && /\.cnx-d\{display:none\}/.test(iphone), 'téléphone : une colonne (panneau de droite caché sous 900 px)');
  ok(/prefers-reduced-motion:reduce/.test(iphone), 'animations coupées si le téléphone le demande');

  console.log('\n— C. Les gestes d\'avant, inchangés (App.jsx)');
  const app = lire('src/App.jsx');
  const debut = app.indexOf('if(!authLoading&&(!user||loginOnly))return(');
  const bloc = debut >= 0 ? app.slice(debut, app.indexOf('const vaActions={', debut)) : '';
  ok(/<CoqueConnexion /.test(bloc) && /<ChoixConnexion /.test(bloc), 'l\'écran de connexion passe par la coque et l\'écran 01');
  ok(/apple=\{isNative\?\(platform==='ios'\?'natif':null\):'web'\}/.test(bloc), 'Apple : natif sur iPhone, rien sur Android, OAuth sur le web');
  ok(/onApple=\{isNative\?handleAppleSignIn:\(\)=>handleOAuthSignIn\('apple'\)\}/.test(bloc), 'Apple appelle handleAppleSignIn (iPhone) / handleOAuthSignIn(\'apple\') (web)');
  ok(/onGoogle=\{\(\)=>handleOAuthSignIn\('google'\)\}/.test(bloc), 'Google appelle handleOAuthSignIn(\'google\'), partout');
  ok(/onEmail=\{\(\)=>\{setAuthMode\('signup'\);[^}]*setEtapeConnexion\('email'\);\}\}/.test(bloc), '« mon e-mail » ouvre le formulaire d\'inscription');
  ok(/onSeConnecter=\{\(\)=>\{setAuthMode\('login'\);[^}]*setEtapeConnexion\('email'\);\}\}/.test(bloc), '« Se connecter » ouvre le formulaire de connexion');
  ok(/data-connexion="retour"[^>]*onClick=\{\(\)=>\{setEtapeConnexion\('choix'\)/.test(bloc), 'le formulaire e-mail a un retour vers l\'écran 01');
  ok(/<input type="email" placeholder="Email" ref=\{emailRef\}/.test(bloc), 'formulaire : l\'adresse (emailRef)');
  ok(/!forgotMode&&authMode==='signup'&&\(\s*<input type="email" placeholder=\{loginTexts\.confirmEmail\} value=\{emailConfirm\}/.test(bloc), 'formulaire : la confirmation de l\'adresse (inscription)');
  ok(/ref=\{passwordRef\}/.test(bloc) && /setShowPassword\(s=>!s\)/.test(bloc), 'formulaire : le mot de passe et son œil');
  ok(/<PrimaryButton onClick=\{authMode==='login'\?handleLogin:handleSignup\}/.test(bloc), 'formulaire : le bouton appelle handleLogin / handleSignup');
  ok(/setForgotMode\(true\)/.test(bloc) && /<PrimaryButton onClick=\{handleForgot\}/.test(bloc), 'formulaire : « Mot de passe oublié » et son envoi');
  ok(/\{isNative&&\([\s\S]{0,400}motif:'code'[\s\S]{0,400}loginTexts\.dejaCode/.test(bloc), 'formulaire : « J\'ai déjà reçu un code » sur téléphone');
  ok(/\{loginError&&<div/.test(bloc) && /erreur=\{loginError\|\|null\}/.test(bloc), 'les refus restent dits (formulaire et écran 01)');
  ok(/const \[etapeConnexion, setEtapeConnexion\] = useState\(\(\) => \(searchParams\.get\('mode'\) === 'login' \? 'email' : 'choix'\)\);/.test(app),
    'l\'écran 01 d\'abord ; ?mode=login ouvre directement la connexion');
  ok(/searchParams\.get\('mode'\) === 'signup' \? 'signup' : 'login'/.test(app), '?mode=signup (le site) garde l\'inscription');

  console.log('\n— D. Inscription, code à 6 chiffres, compte existant : les appels d\'avant');
  ok(/async function handleSignup\(\)\{[\s\S]{0,900}supabase\.auth\.signUp\(\{[\s\S]{0,500}options:\{emailRedirectTo:URL_CONFIRMATION\}/.test(app), 'inscription : signUp avec emailRedirectTo');
  ok(/emailVal\.trim\(\)!==emailConfirm\.trim\(\)/.test(app), 'inscription : les deux adresses doivent correspondre');
  ok(/setAttenteConfirmation\(\{email:adresse,depuis:new Date\(\)\.toISOString\(\),motif:'inscription'\}\)/.test(app), 'inscription sans session : l\'écran du code s\'ouvre');
  ok(/supabase\.auth\.verifyOtp\(\{email:emailAttenteEffectif,token,type:'signup'\}\)/.test(app), 'code à 6 chiffres : verifyOtp type signup');
  ok(/onClick=\{validerCodeConfirmation\} disabled=\{otpEnCours\|\|codeOtp\.length!==6\}/.test(app), 'code à 6 chiffres : le bouton exige 6 chiffres');
  ok(/signInWithPassword/.test(app), 'compte existant : signInWithPassword');
  ok(/setAuthMode\('login'\);setEtapeConnexion\('email'\);\}\}/.test(app), '« Revenir à la connexion » (écran du code) rouvre le formulaire de connexion');
  ok(/signInWithIdToken/.test(app) && /async function handleOAuthSignIn|const handleOAuthSignIn/.test(app), 'Apple natif (signInWithIdToken) et OAuth toujours là');

  console.log('\n— E. Les pages qui renvoient vers la connexion');
  const conf = lire('src/pages/AuthConfirm.jsx');
  ok((conf.match(/navigate\("\/login\?mode=login", \{ replace: true \}\)/g) ?? []).length === 2,
    '« Me connecter » (compte confirmé, lien expiré) ouvre directement le formulaire de connexion');
  const routeur = lire('src/router/AppRouter.jsx');
  ok(/path="\/login" element=\{<RedirectIfLoggedIn><App loginOnly \/><\/RedirectIfLoggedIn>\}/.test(routeur), 'la route /login inchangée');
} finally {
  await vite.close();
}
console.log(`\n${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
