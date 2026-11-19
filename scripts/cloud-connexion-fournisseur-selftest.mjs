// VERROU (19/11/2026, client Cloud 8fd44622 — décision de Nico) : « SE CONNECTER AVEC GOOGLE » SUR LA PAGE DE CONNEXION
// CLOUD — L'APP DIT CLAIREMENT QUE C'EST LE MOT DE PASSE GOOGLE, ET OFFRE UNE SORTIE VERS L'E-MAIL DE LA PLATEFORME.
//
// Ce qui s'est passé : sur Vinted, Leboncoin et Beebs, il a choisi « Se connecter avec Google » ; la page Google
// « Saisissez votre mot de passe » a répondu « Mot de passe incorrect » à chaque essai (il tapait sans doute le mot de
// passe de la plateforme ou de sa boîte mail). Le serveur voyait le passage chez Google (connexion_redirection_fournisseur)
// et l'écran n'en disait rien.
// Règle, pour tous les comptes et toutes les plateformes (web, iPhone, Android : le même écran, MeConnecterCloud.jsx › Vue) :
//   1. le serveur dit { t:'fournisseur', nom:'google', plateforme } quand la page AFFICHÉE (la page ou sa fenêtre) est
//      chez Google, et { nom: null } quand elle en sort (retour sur la plateforme, fenêtre fermée, connectée, fermée) ;
//      une app d'avant l'ignore (aucune branche pour ce message) ;
//   2. l'écran montre « C'est le mot de passe de ton compte Google qu'il faut taper, pas celui de <Plateforme> » (fr/en)
//      et « Me connecter avec mon e-mail <Plateforme> » ;
//   3. ce bouton envoie { t:'revenir_plateforme' } : le serveur ferme la fenêtre Google et renvoie la page à son adresse
//      de connexion de départ — rien de tapé, cliqué ni lu dans la page de Google ; un serveur d'avant l'ignore ;
//   4. rien d'autre ne change : code, captcha, connectée, remplacée, expirée, clavier, gestes ; « payer » et « résoudre ».
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => { try { return readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
let n = 0, ko = 0;
const ok = (c, m, detail = '') => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${detail ? `\n      ${String(detail).slice(0, 400)}` : ''}`); } };
const importer = (f) => import(pathToFileURL(path.join(racine, f)).href).catch((e) => ({ erreur: e }));

console.log('1. Le serveur et le client, bout à bout (node --test serveur-cloud/tests/fournisseur-connexion.test.mjs)');
{
  const r = spawnSync(process.execPath, ['--test', 'serveur-cloud/tests/fournisseur-connexion.test.mjs'], { cwd: racine, encoding: 'utf8', timeout: 240_000 });
  const sortie = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const passe = Number(sortie.match(/ℹ pass (\d+)/)?.[1] ?? 0), echoue = Number(sortie.match(/ℹ fail (\d+)/)?.[1] ?? 1);
  ok(r.status === 0 && passe >= 6 && echoue === 0, `${passe} verts, ${echoue} rouges (pures, Vinted dans la page, Beebs en fenêtre, fins, Résoudre, bout à bout)`);
  if (r.status !== 0) console.log(sortie.split('\n').filter((l) => /^✖|✖ |AssertionError|Error:|actual|expected|\+ |- /.test(l)).slice(0, 30).join('\n'));
}

// Un document et une WebSocket simulés : ce que le client fait d'un message du serveur.
function banc(ouvrirConnexion) {
  const envoyes = [], etats = [];
  let ws = null;
  globalThis.WebSocket = class {
    constructor(url) { this.url = url; this.readyState = 1; this.ecouteurs = {}; ws = this; }
    addEventListener(t, f) { (this.ecouteurs[t] ??= []).push(f); }
    send(d) { envoyes.push(JSON.parse(d)); }
    close() { this.readyState = 3; }
    recevoir(o) { for (const f of this.ecouteurs.message ?? []) f({ data: JSON.stringify(o) }); }
  };
  const element = (tag) => ({ tagName: tag, style: {}, value: '', setAttribute() {}, removeAttribute() {}, addEventListener() {}, getContext: () => ({ drawImage() {} }), focus() {}, setSelectionRange() {} });
  const doc = { defaultView: { devicePixelRatio: 2 }, createElement: element, addEventListener() {} };
  const conteneur = { ownerDocument: doc, clientWidth: 390, clientHeight: 780, style: {}, appendChild() {}, set innerHTML(_) {} };
  let erreur = null;
  let session = null;
  try { session = ouvrirConnexion({ url: 'wss://cloud.exemple/connexion/ws', ticket: 't', plateforme: 'vinted', conteneur, lang: 'fr', surEtat: (e, m) => etats.push([e, m]) }); }
  catch (e) { erreur = e; }
  return { envoyes, etats, session, erreur, recevoir: (o) => { try { ws.recevoir(o); } catch (e) { erreur = e; } }, erreurDe: () => erreur };
}

console.log('2. Une app d\'AVANT (clientConnexion.js du commit 8f68590) ignore le message, sans casse');
{
  const r = spawnSync('git', ['show', '8f68590:src/cloud/connexion/clientConnexion.js'], { cwd: racine, encoding: 'utf8' });
  const ancien = r.status === 0 ? await import(`data:text/javascript;base64,${Buffer.from(r.stdout).toString('base64')}`).catch((e) => ({ erreur: e })) : { erreur: new Error(r.stderr) };
  ok(!ancien.erreur && typeof ancien.ouvrirConnexion === 'function', 'le client d\'avant se charge', ancien.erreur?.message);
  if (!ancien.erreur) {
    const b = banc(ancien.ouvrirConnexion);
    b.recevoir({ t: 'etat', etape: 'pret', message: 'Connecte-toi comme d\'habitude.' });
    b.recevoir({ t: 'fournisseur', nom: 'google', plateforme: 'vinted' });
    b.recevoir({ t: 'fournisseur', nom: null, plateforme: 'vinted' });
    b.recevoir({ t: 'clavier', ouvert: true });
    ok(!b.erreurDe(), 'aucune exception', b.erreurDe()?.message);
    ok(JSON.stringify(b.etats) === JSON.stringify([['pret', 'Connecte-toi comme d\'habitude.'], ['clavier', true]]), 'rien ne parvient à son écran : ses états d\'avant, seuls', JSON.stringify(b.etats));
  }
}

console.log('3. Le client de l\'app (clientConnexion.js)');
const client = await importer('src/cloud/connexion/clientConnexion.js');
{
  const b = banc(client.ouvrirConnexion);
  b.recevoir({ t: 'fournisseur', nom: 'google', plateforme: 'vinted' });
  b.recevoir({ t: 'fournisseur', nom: null, plateforme: 'vinted' });
  b.recevoir({ t: 'etat', etape: 'info', message: 'x' });
  b.recevoir({ t: 'code', attendu: true, canal: 'sms', qui: 'Google', chiffres: true, titre: 't', texte: 'u' });
  ok(!b.erreurDe(), 'aucune exception', b.erreurDe()?.message);
  ok(JSON.stringify(b.etats.slice(0, 2)) === JSON.stringify([['fournisseur', { nom: 'google', plateforme: 'vinted' }], ['fournisseur', null]]), 'l\'état passe à l\'écran (Google, puis plus rien)', JSON.stringify(b.etats));
  ok(b.etats[2]?.[0] === 'info' && b.etats[3]?.[0] === 'code' && b.etats[3]?.[1]?.qui === 'Google', 'les autres messages comme avant (état, code)');
  ok(typeof b.session?.revenirPlateforme === 'function', 'le geste « revenir à la page de la plateforme » existe');
  b.session?.revenirPlateforme?.();
  ok(JSON.stringify(b.envoyes.at(-1)) === JSON.stringify({ t: 'revenir_plateforme' }), 'il envoie { t:\'revenir_plateforme\' }, rien d\'autre', JSON.stringify(b.envoyes.at(-1)));
  const src = lire('src/cloud/connexion/clientConnexion.js');
  ok(/champ\.autocomplete = 'off';/.test(src) && /envoyer\(\{ t: 'toucher', type: 'debut', \.\.\.p \}\)/.test(src), 'le champ caché et les gestes, inchangés');
}

console.log('4. L\'automate de l\'écran (suiviVue.js)');
{
  const { creerSuiviVue } = await importer('src/cloud/connexion/suiviVue.js');
  const faits = [];
  const agir = {};
  for (const k of ['clavier', 'cookies', 'code', 'message', 'verifiee', 'fin', 'pause', 'reprendre', 'fermerApres', 'fournisseur']) agir[k] = (...a) => faits.push([k, ...a]);
  const s = creerSuiviVue({ finales: ['connecte'], agir });
  s.etape('fournisseur', { nom: 'google', plateforme: 'vinted' });
  s.etape('fournisseur', null);
  s.etape('clavier', true); s.etape('info', 'Bonjour'); s.etape('connecte', 'Fait');
  ok(JSON.stringify(faits.filter(([k]) => k === 'fournisseur')) === JSON.stringify([['fournisseur', { nom: 'google', plateforme: 'vinted' }], ['fournisseur', null]]), 'l\'état va au bandeau (agir.fournisseur), puis null');
  ok(!faits.some(([k, m]) => k === 'message' && typeof m !== 'string'), 'jamais dans la ligne d\'état');
  ok(JSON.stringify(faits.filter(([k]) => k !== 'fournisseur').map(([k]) => k)) === JSON.stringify(['clavier', 'message', 'message', 'fin', 'fermerApres']), 'les autres étapes comme avant', JSON.stringify(faits));
}

console.log('5. Le texte de l\'écran (textesConnexion.js), en français et en anglais');
const TX = await importer('src/cloud/textesConnexion.js');
{
  const fr = TX.bandeauFournisseur?.('fr', 'google', 'Vinted');
  const en = TX.bandeauFournisseur?.('en', 'google', 'Leboncoin');
  ok(fr?.texte === "C'est le mot de passe de ton compte Google qu'il faut taper, pas celui de Vinted.", `fr : « ${fr?.texte} »`);
  ok(fr?.revenir === 'Me connecter avec mon e-mail Vinted' && fr?.titre === 'Connexion avec Google', `fr : « ${fr?.titre} » · bouton « ${fr?.revenir} »`);
  ok(en?.texte === "It's your Google account password you need to type, not your Leboncoin one.", `en : « ${en?.texte} »`);
  ok(en?.revenir === 'Sign in with my Leboncoin email' && en?.titre === 'Signing in with Google', `en : « ${en?.titre} » · bouton « ${en?.revenir} »`);
  ok(TX.bandeauFournisseur?.('fr', 'kiabi', 'Beebs') === null && TX.bandeauFournisseur?.('fr', 'constructor', 'Beebs') === null && TX.bandeauFournisseur?.('fr', 'google', '') === null,
    'un fournisseur inconnu (ou sans plateforme) : aucun bandeau');
}

console.log('6. L\'écran (MeConnecterCloud.jsx › BandeauFournisseur, rendu)');
globalThis.document ??= { body: {} };
const { createServer } = await import('vite');
const vite = await createServer({ root: racine, configFile: false, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: [{ find: /^react-dom$/, replacement: path.join(racine, 'scripts/lib/portail-en-place.mjs') }] }, ssr: { noExternal: [] }, optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const net = (h) => h.replace(/&#x27;|&#39;/g, '\'').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  const M = await vite.ssrLoadModule('/src/cloud/MeConnecterCloud.jsx').catch((e) => ({ erreur: e }));
  ok(typeof M.BandeauFournisseur === 'function', 'BandeauFournisseur est exporté', M.erreur?.message);
  if (typeof M.BandeauFournisseur === 'function') {
    const rendu = (p) => net(renderToStaticMarkup(React.createElement(M.BandeauFournisseur, { onReplier() {}, onVoir() {}, onRevenir() {}, ...p })));
    const fr = rendu({ fournisseur: 'google', nomPlateforme: 'Vinted', lang: 'fr', replie: false });
    ok(fr.includes("C'est le mot de passe de ton compte Google qu'il faut taper, pas celui de Vinted."), 'fr : la phrase, avec le nom de la plateforme', fr.slice(0, 300));
    ok(/data-cloud-bouton="revenir-plateforme"[^>]*>Me connecter avec mon e-mail Vinted</.test(fr), 'fr : le bouton « Me connecter avec mon e-mail Vinted »');
    ok(/role="alert"/.test(fr) && /data-cloud-fournisseur="google"/.test(fr) && /data-cloud-bouton="fournisseur-compris"[^>]*>Compris</.test(fr), 'fr : un bandeau d\'alerte, repliable (« Compris »)');
    const en = rendu({ fournisseur: 'google', nomPlateforme: 'Beebs', lang: 'en', replie: false });
    ok(en.includes("It's your Google account password you need to type, not your Beebs one.") && />Sign in with my Beebs email</.test(en), 'en : la phrase et le bouton', en.slice(0, 300));
    const replie = rendu({ fournisseur: 'google', nomPlateforme: 'Vinted', lang: 'fr', replie: true });
    ok(/data-cloud-bouton="fournisseur-voir"/.test(replie) && replie.includes('Mot de passe Google · Voir') && !replie.includes('revenir-plateforme'), 'replié : « Mot de passe Google · Voir »');
    ok(rendu({ fournisseur: null, nomPlateforme: 'Vinted', lang: 'fr' }) === '' && rendu({ fournisseur: 'kiabi', nomPlateforme: 'Beebs', lang: 'fr' }) === '', 'sans fournisseur connu : rien');
  }
} finally { await vite.close(); }

console.log('7. L\'écran branché (MeConnecterCloud.jsx › Vue, aussi celle du parcours d\'entrée et du bandeau de reconnexion)');
{
  const me = lire('src/cloud/MeConnecterCloud.jsx');
  const vue = me.slice(me.indexOf('export function Vue('), me.indexOf('function EtatExecutant('));
  ok(/fournisseur: \(f\) => \{/.test(vue) && /setFournisseur\(f\)/.test(vue), 'l\'automate pose l\'état du bandeau (agir.fournisseur)');
  ok(/onRevenir=\{revenirPlateforme\}/.test(vue) && /session\.current\?\.revenirPlateforme\(\)/.test(vue), 'le bouton envoie le geste par la connexion en cours');
  ok(/\{!finie && !ailleurs && !code && !resoudre && mode !== 'payer' && fournisseur && \(/.test(vue), 'jamais par-dessus le bandeau du code, ni en « Résoudre » / « Payer », ni après une fin ou en pause');
  ok((vue.match(/setFournisseur\(null\)/g) ?? []).length >= 3, 'retiré à la fin, en pause et à chaque nouvelle connexion');
  ok(/'cloud_connexion_fournisseur_vu'/.test(vue) && /'cloud_connexion_revenir_plateforme'/.test(vue), 'tracé : bandeau vu (une fois par passage), bouton touché');
  ok(/\{!finie && !ailleurs && code && message === code\.texte \? '' : message\}/.test(vue), 'la ligne d\'état : inchangée');
  ok(/surEtat: \(etape, m, info\) => \{ if \(!mort && session\.current === cette\) suivi\.etape\(etape, m, info\); \}/.test(vue), 'seule la connexion en cours parle (inchangé)');
  const page = lire('serveur-cloud/public/connexion.html');
  ok(/if \(typeof message === 'string' && message\) \$\('etat'\)\.textContent = message;/.test(page), 'la page autonome du serveur n\'écrit jamais un objet dans sa ligne d\'état');
}

console.log('8. Le serveur ne lit, n\'écrit, ne tape ni ne clique rien dans la page de Google');
{
  const cnx = lire('serveur-cloud/src/connexion.js');
  const f = cnx.slice(cnx.indexOf('async function revenirPlateforme('), cnx.indexOf('\n    }\n', cnx.indexOf('async function revenirPlateforme(')));
  ok(f.length > 50 && !/Input\.|Runtime\.evaluate|insertText|password|value/i.test(f), 'revenirPlateforme : fermer la fenêtre, renvoyer la page — rien d\'autre', f.slice(0, 200));
  ok(/if \(resoudre \|\| connectee \|\| !fournisseur \|\| !cible\) return;/.test(f), 'seulement pendant la connexion par un fournisseur (jamais en « Résoudre », jamais connectée)');
  ok(/Page\.navigate', \{ url: pageDepart \}/.test(f) && /Target\.closeTarget/.test(f), 'la page de départ de la plateforme, la fenêtre Google fermée');
  const pur = lire('serveur-cloud/src/fournisseurConnexion.js');
  ok(pur.length > 0 && !/password|\.value|Runtime|cdp/i.test(pur), 'fournisseurConnexion.js : pur (l\'adresse seule, jamais un champ)');
  ok(/if \(m\.t === 'revenir_plateforme'\) return revenirPlateforme\(\);/.test(cnx), 'le message du client mène au geste, et à lui seul');
  ok(/'connexion_fournisseur'/.test(cnx) && /'connexion_retour_plateforme'/.test(cnx), 'journalisé par l\'orchestrateur (entrée, sortie, retour)');
}

console.log(`\n${n - ko}/${n} vérifications ${ko ? `— ${ko} ROUGE(S)` : 'vertes'}`);
process.exit(ko ? 1 : 0);
