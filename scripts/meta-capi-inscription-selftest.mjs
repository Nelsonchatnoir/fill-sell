// VERROU (15/11/2026 soir, ordre de Nico) : À CHAQUE INSCRIPTION WEB AVEC ACCORD, META REÇOIT « CompleteRegistration »
// PAR LE NAVIGATEUR ET PAR LE SERVEUR (API DE CONVERSIONS), VERS LES DEUX PIXELS, AVEC LE MÊME event_id.
//
// Ce qui manquait : seul le pixel du navigateur comptait les inscriptions — perdues derrière un bloqueur de pub ou une
// page fermée trop tôt — et sans event_id (aucune déduplication possible avec un envoi serveur).
// Décisions de Nico (15/11 soir) : seulement avec l'accord au bandeau, web seulement (apps natives : ni bandeau ni
// traceur Meta), politique de confidentialité réécrite le même jour.
// Ce verrou garde :
//   1. la règle pure (_shared/meta-capi.js) : ce qui part, et RIEN d'autre (e-mail et identifiant en SHA-256, jamais en
//      clair ; fbp/fbc s'ils existent ; IP, navigateur, adresse de notre page) ; un compte né il y a moins de 30 min,
//      relu par le serveur ; une demande non conforme ne part pas ;
//   2. le navigateur (src/utils/metaInscription.js) : accord seulement, jamais dans l'app native, une fois par compte ;
//      l'eventID du pixel = l'event_id envoyé au serveur ; aucune donnée personnelle dans la demande ; jamais une erreur ;
//   3. les sources : l'inscription par e-mail (compte NOUVEAU seulement) et Google/Apple sur le web l'appellent ; la
//      fonction répond avant d'envoyer, une fois par compte, jetons en secrets ; la politique dit ce qui part.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => { try { return readFileSync(path.join(racine, f), 'utf8'); } catch { return ''; } };
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const sha = (s) => createHash('sha256').update(s).digest('hex');

const U = '3f0c2a5e-8b1d-4c7a-9e21-5d4b6a7c8e90';
const E = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const MAINTENANT = Date.parse('2026-11-15T21:40:00Z');

console.log('1. La règle (_shared/meta-capi.js)');
let m;
try { m = await import('../supabase/functions/_shared/meta-capi.js'); } catch (e) { console.log(`  ✗ module absent (${e.message})`); console.log(`\n0/1 vérifications`); process.exit(1); }
ok(m.PIXELS_META.length === 2 && m.PIXELS_META.includes('921207750637065') && m.PIXELS_META.includes('1425992186075849'), 'les deux pixels');
ok(m.nomSecretJeton('921207750637065') === 'META_CAPI_TOKEN_921207750637065', 'un secret par pixel (jamais le jeton dans le code)');
const demande = m.lireDemande(JSON.stringify({ user_id: U.toUpperCase(), event_id: E, fbp: 'fb.1.1794778800000.1234567890', fbc: 'fb.1.1794778800000.IwAR2abc_DEF-123', source_url: 'https://fillsell.app/app' }));
ok(demande?.user_id === U && demande.event_id === E && demande.fbp && demande.fbc && demande.source_url === 'https://fillsell.app/app', 'demande conforme lue');
ok(m.lireDemande('{"user_id":"x","event_id":"y"}') === null && m.lireDemande('pas du json') === null, 'demande non conforme : rien');
ok(m.lireDemande(JSON.stringify({ user_id: U, event_id: E, fbp: 'fb.1.<script>', source_url: 'https://pirate.example/x?e=a@b.c' })).fbp === null
  && m.lireDemande(JSON.stringify({ user_id: U, event_id: E, source_url: 'https://pirate.example/x' })).source_url === 'https://fillsell.app/app', 'fbp douteux écarté ; adresse hors de notre site remplacée');
ok(m.lireDemande(JSON.stringify({ user_id: U, event_id: E, source_url: 'https://fillsell.app/app?email=a@b.c' })).source_url === 'https://fillsell.app/app', 'aucun paramètre d\'adresse ne part');
ok(m.ipDuClient(new Map([['x-forwarded-for', '81.2.3.4, 10.0.0.1']])) === '81.2.3.4' && m.ipDuClient({ 'cf-connecting-ip': '2a01:e0a::1' }) === '2a01:e0a::1' && m.ipDuClient({}) === null, 'IP de la personne (première du relais)');
const compte = { id: U, email: '  Personne.Test@Exemple.Invalid ', created_at: '2026-11-15T21:35:00Z' };
const r = await m.evenementInscription({ compte, demande, ip: '81.2.3.4', ua: 'Mozilla/5.0 Essai', maintenant: MAINTENANT });
const ev = r.evenement;
ok(ev?.event_name === 'CompleteRegistration' && ev.event_id === E && ev.action_source === 'website' && ev.event_source_url === 'https://fillsell.app/app', 'CompleteRegistration, event_id du navigateur, site web');
ok(ev?.event_time === Math.floor(Date.parse(compte.created_at) / 1000), 'à l\'heure où le compte est né en base');
ok(ev?.user_data.em[0] === sha('personne.test@exemple.invalid') && ev.user_data.external_id[0] === sha(U), 'e-mail (minuscules, sans espaces) et identifiant en SHA-256');
ok(JSON.stringify(Object.keys(ev?.user_data ?? {}).sort()) === JSON.stringify(['client_ip_address', 'client_user_agent', 'em', 'external_id', 'fbc', 'fbp']), 'user_data : ces clés et RIEN d\'autre');
ok(JSON.stringify(Object.keys(ev ?? {}).sort()) === JSON.stringify(['action_source', 'event_id', 'event_name', 'event_source_url', 'event_time', 'user_data']), 'l\'événement : rien d\'autre (aucun montant, aucune donnée)');
ok(!/exemple|personne/i.test(JSON.stringify(ev)), 'jamais l\'e-mail en clair');
const sansFb = await m.evenementInscription({ compte, demande: { ...demande, fbp: null, fbc: null }, ip: '81.2.3.4', ua: 'UA', maintenant: MAINTENANT });
ok(!('fbp' in sansFb.evenement.user_data) && !('fbc' in sansFb.evenement.user_data), 'sans fbp/fbc : absents (jamais vides)');
ok((await m.evenementInscription({ compte: { ...compte, created_at: '2026-11-15T20:00:00Z' }, demande, ip: '1.2.3.4', ua: 'UA', maintenant: MAINTENANT })).refus === 'compte_pas_recent', 'un compte vieux de plus de 30 min : rien (jamais un ancien compte)');
ok((await m.evenementInscription({ compte: { ...compte, id: E }, demande, ip: '1.2.3.4', ua: 'UA', maintenant: MAINTENANT })).refus === 'compte_inconnu', 'le compte relu doit être celui de la demande');
ok((await m.evenementInscription({ compte, demande, ip: null, ua: 'UA', maintenant: MAINTENANT })).refus === 'ip_ou_navigateur_absent', 'sans IP ou navigateur : rien');
ok(m.urlEnvoi('921207750637065') === `https://graph.facebook.com/${m.VERSION_GRAPH}/921207750637065/events`, 'adresse d\'envoi de l\'API de conversions');

console.log('2. Le navigateur (src/utils/metaInscription.js)');
function navigateur({ consentement = 'accepte', natif = false, beacon = true } = {}) {
  const stock = new Map(consentement ? [['fs_consent_pub_v2', consentement]] : []);
  const balises = [], fetchs = [];
  globalThis.localStorage = { getItem: (k) => (stock.has(k) ? stock.get(k) : null), setItem: (k, v) => stock.set(k, String(v)), removeItem: (k) => stock.delete(k) };
  globalThis.window = globalThis;
  delete globalThis.fbq; delete globalThis._fbq;
  globalThis.Capacitor = natif ? { isNativePlatform: () => true } : undefined;
  const premier = { parentNode: { insertBefore: () => {} } };
  globalThis.document = { createElement: () => ({}), getElementsByTagName: () => [premier], cookie: '_ga=GA1.1; _fbp=fb.1.1794778800000.1234567890; autre=1' };
  globalThis.location = { origin: 'https://fillsell.app', pathname: '/app', href: 'https://fillsell.app/app?email=x@y.z' };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { sendBeacon: beacon ? (url, b) => { balises.push({ url, b }); return true; } : undefined } });
  globalThis.fetch = async (url, o) => { fetchs.push({ url, o }); return { ok: true }; };
  return { balises, fetchs };
}
let tour = 0;
const charger = () => import(`../src/utils/metaInscription.js?cas=${++tour}`);
{
  const nav = navigateur();
  const mi = await charger();
  const id = mi.mesurerInscription(U);
  const cr = (globalThis.fbq?.queue ?? []).find((a) => a[1] === 'CompleteRegistration');
  ok(Boolean(id) && cr?.[0] === 'track' && cr?.[3]?.eventID === id, 'le pixel envoie CompleteRegistration avec l\'eventID (vers les deux pixels)');
  ok(nav.balises.length === 1 && nav.balises[0].url === mi.URL_META_INSCRIPTION && /\/functions\/v1\/meta-inscription$/.test(nav.balises[0].url), 'une demande au serveur (sendBeacon) vers meta-inscription');
  const corps = nav.balises[0] ? JSON.parse(await nav.balises[0].b.text()) : {};
  ok(corps.event_id === id && corps.user_id === U && corps.fbp === 'fb.1.1794778800000.1234567890' && corps.fbc === null, 'le serveur reçoit le MÊME event_id, et fbp lu dans son cookie');
  ok(corps.source_url === 'https://fillsell.app/app' && JSON.stringify(Object.keys(corps).sort()) === JSON.stringify(['event_id', 'fbc', 'fbp', 'source_url', 'user_id']), 'aucune donnée personnelle dans la demande (ni e-mail, ni paramètre d\'adresse)');
  ok(nav.balises[0]?.b.type.startsWith('text/plain'), 'texte brut : aucune requête préalable, part même si la page se ferme');
  ok(mi.mesurerInscription(U) === null && nav.balises.length === 1, 'jamais deux fois pour un compte sur cet appareil');
}
for (const [nom, o] of [['consentement refusé', { consentement: 'refuse' }], ['sans réponse au bandeau', { consentement: null }], ['app native', { natif: true }]]) {
  const nav = navigateur(o);
  const mi = await charger();
  ok(mi.mesurerInscription(U) === null && nav.balises.length === 0 && nav.fetchs.length === 0 && !globalThis.fbq, `${nom} : rien ne part (ni pixel, ni serveur)`);
}
{
  const nav = navigateur({ beacon: false });
  const mi = await charger();
  ok(Boolean(mi.mesurerInscription(U)) && nav.fetchs.length === 1 && nav.fetchs[0].o.keepalive === true, 'sans sendBeacon : fetch keepalive');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { get sendBeacon() { throw new Error('boum'); } } });
  globalThis.fetch = () => { throw new Error('réseau'); };
  let leve = false;
  try { mi.mesurerInscription('7b1e0c2a-1111-4222-8333-944455556666'); } catch { leve = true; }
  ok(!leve, 'une erreur ne remonte jamais (l\'inscription ne dépend pas de Meta)');
}

console.log('3. Les sources');
const app = lire('src/App.jsx');
const fn = lire('supabase/functions/meta-inscription/index.ts');
const legal = lire('src/pages/Legal.jsx');
ok(/if\(data\?\.user\?\.id&&\(data\.user\.identities\?\.length\?\?1\)>0\) mesurerInscription\(data\.user\.id\);/.test(app), 'inscription par e-mail : compte NOUVEAU seulement (une adresse déjà inscrite ne compte pas)');
ok(/event==='SIGNED_IN'&&u\.app_metadata\?\.provider&&u\.app_metadata\.provider!=='email'&&Date\.now\(\)-Date\.parse\(u\.created_at\)<10\*60_000\) mesurerInscription\(u\.id\)/.test(app), 'inscription par Google/Apple sur le web : mesurée à la première session');
ok(!/pixelInscription\(\)/.test(app), 'plus aucun CompleteRegistration sans event_id dans l\'app');
ok(/EdgeRuntime\.waitUntil\(travail\)/.test(fn) && /return new Response\(null, \{ status: 202/.test(fn), 'la fonction répond tout de suite, l\'envoi se fait ensuite');
// (17/11/2026) La fonction passe par _shared/meta-capi-envoi.js (envoi, trace, alerte ; verrou selftest:meta-capi-envoi) :
// même garde, même lecture des secrets.
ok(/getUserById\(demande\.user_id\)/.test(fn) && /eq\("feature", FEATURE_INSCRIPTION\)\.limit\(1\)/.test(fn), 'compte relu en base ; une seule fois par compte');
ok(/lireJeton\(nomSecretJeton\(pixel\)\)/.test(lire('supabase/functions/_shared/meta-capi-envoi.js'))
  && /lireJeton: \(nom: string\) => Deno\.env\.get\(nom\)/.test(lire('supabase/functions/_shared/meta-capi-deno.ts')) && /depsMeta\(base, envoyerEmail\)/.test(fn), 'jetons lus dans les secrets du serveur');
const jetonEnClair = /EA[A-Z][A-Za-z0-9]{40,}/; // (17/11) les jetons de jeu de données commencent aussi par « EAI »
ok(![fn, lire('supabase/functions/_shared/meta-capi.js'), lire('src/utils/metaInscription.js'), lire('src/utils/metaPixel.js'), app].some((t) => jetonEnClair.test(t)), 'aucun jeton Meta écrit dans le code');
ok(/\[functions\.meta-inscription\]\nverify_jwt = false/.test(lire('supabase/config.toml').replace(/\r\n/g, '\n')), 'config.toml : meta-inscription sans JWT (garde maison)');
ok(!/Aucune donnée personnelle \(email, identifiant de compte\) n\\'est transmise à Meta/.test(legal) && /empreinte SHA-256, jamais en clair/.test(legal) && /SHA-256 fingerprint, never in clear text/.test(legal), 'la politique de confidentialité dit ce qui part (FR et EN)');

console.log(`\n${n - ko}/${n} vérifications`);
process.exit(ko ? 1 : 0);
