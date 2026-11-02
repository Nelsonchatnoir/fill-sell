// (02/11 soir, décision de Nico : « récupère la session Beebs du navigateur isolé dans le principal si c'est faisable
// proprement ») LA SESSION BEEBS DE NICO, DU PROFIL ISOLÉ AU COFFRE DU PRINCIPAL — aucune visite de Beebs.
// À lancer SUR le serveur, ORCHESTRATEUR ARRÊTÉ (sinon sa sauvegarde des 10 min réécrirait la ligne), avec l'image
// d'orchestrateur ENCORE EN PLACE (elle a le navigateur isolé, retiré par le déploiement qui suit) :
//   docker compose run --rm -T --no-deps orchestrateur sh -c 'cat > /tmp/r.mjs && node /tmp/r.mjs' < ce-fichier
// 1. le navigateur isolé (son IP 176.103.182.215, son profil, aucune extension) est ouvert SANS page ni navigation ; ses
//    cookies Beebs sont lus (Storage.getCookies), il est refermé ;
// 2. la connexion doit être une vraie (estConnectee : jeton non anonyme), sinon RIEN n'est écrit (Nico refera « Me
//    connecter ») ;
// 3. la ligne Beebs du coffre du principal est écrite : connectée, preuve = la connexion vérifiée de Nico (02/11 14:38:29,
//    compte lu 200, journal connexion_verifiee) — SANS le cookie `datadome` : c'est l'appareil du navigateur isolé (écran,
//    cœurs différents), pas la session ; le principal se présente à DataDome comme lui-même. Le cookie d'appareil du
//    principal (refusé le 02/11 13:02) est effacé avant, par outils/effacer-plateforme.mjs.
// La session Firebase de la page (IndexedDB de www.beebs.app) est copiée à part, navigateurs arrêtés (cp -a du dossier
// https_www.beebs.app_0.indexeddb.leveldb, sauvegarde des deux profils avant).
// Inverse : supprimer la ligne Beebs du coffre (DELETE FROM cloud_coffre WHERE user_id = '<Nico>' AND plateforme = 'beebs')
// et le dossier IndexedDB copié ; le profil isolé est gardé en archive (/srv/fillsell-cloud/archives/0211-soir/).
import { createClient } from '@supabase/supabase-js';
import { lireConfig } from '/app/src/config.js';
import * as journal from '/app/src/journal.js';
import { creerDocker } from '/app/src/docker.js';
import { creerNavigateurs, profilIsole } from '/app/src/navigateur.js';
import { creerCoffre } from '/app/src/coffre.js';
import { cookiesDe, estConnectee } from '/app/src/plateformes.js';

const USER = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
const IP_ISOLEE = 39;
const PREUVE = { le: '2026-11-02T13:38:29.316Z', http: 200, repris_du_navigateur_isole: new Date().toISOString() };

const config = lireConfig();
const base = createClient(config.supabaseUrl, config.cleService, { auth: { persistSession: false } });
const docker = creerDocker({ socket: config.socketDocker });
const navigateurs = creerNavigateurs({ config, docker, journal });
const coffre = creerCoffre({ base, cle: config.cleCoffre, cleVersion: config.cleCoffreVersion, anciennes: config.clesCoffreAnciennes });

const principal = await docker.inspecter(`fs-nav-${USER}`);
if (principal?.State?.Running) { console.error('REFUS : le navigateur principal tourne encore — rien n\'est lu ni écrit.'); process.exit(1); }
const avant = await coffre.lire(USER);
if (avant?.beebs?.connecte === true) { console.error('REFUS : Beebs est déjà connectée au coffre — rien n\'est écrit.'); process.exit(1); }

const { data: proxyUrl, error } = await base.rpc('cloud_proxy_identifiants', { p_ip: IP_ISOLEE });
if (error || !proxyUrl) { console.error(`REFUS : proxy de l'IP ${IP_ISOLEE} illisible`); process.exit(1); }
let beebs = [];
const h = await navigateurs.ouvrirIsole(USER, 'beebs', { proxyUrl, profilId: profilIsole(USER, 'beebs') });
try {
  const { targetInfos } = await h.cdp.send('Target.getTargets');
  const pages = targetInfos.filter((t) => t.type === 'page').map((t) => t.url);
  const { cookies } = await h.cdp.send('Storage.getCookies');
  beebs = cookiesDe(cookies, 'beebs');
  console.log(JSON.stringify({ pages, cookies_beebs: beebs.map((c) => `${c.domain}:${c.name}`) }));
} finally {
  await navigateurs.fermerIsole(USER, 'beebs', 'reprise_principal');
}

if (!estConnectee(beebs, 'beebs')) { console.error('REFUS : aucune session Beebs connectée dans le profil isolé — rien n\'est écrit.'); process.exit(1); }
const session = beebs.filter((c) => String(c.name ?? '').toLowerCase() !== 'datadome');
await coffre.ecrire(USER, 'beebs', { le: new Date().toISOString(), cookies: session, verifie: PREUVE, reprise: 'navigateur_isole' }, true);
const apres = await coffre.lire(USER);
console.log(JSON.stringify({ ecrit: true, cookies: session.length, sans_datadome: beebs.length - session.length,
  coffre: Object.fromEntries(Object.entries(apres).map(([p, s]) => [p, s?.connecte === true ? 'connecte' : (s?.illisible ? 'illisible' : 'non')])) }));
process.exit(0);
