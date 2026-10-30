// L'ESSAI UNIQUE « Me connecter » Leboncoin + Beebs (30/10, ordre de Nico : machine neuve, IP neuve, conditions
// exactes de production). À lancer SUR le serveur, l'orchestrateur ARRÊTÉ, l'URL du proxy sur l'entrée standard
// (jamais en argument, jamais affichée) :
//   docker compose -f /srv/fillsell-cloud/deploiement/docker-compose.yml run --rm --no-deps -T orchestrateur \
//     node outils/essai-me-connecter.mjs <user_id> <dossier_de_sortie> < fichier_proxy
//
// C'est le code de la production, sans copie : le même Chrome (image épinglée, extension Cloud installée par la
// stratégie d'entreprise, relais de proxy du conteneur), le même parcours « Me connecter » (connexion.js : ticket,
// format téléphone, images, accusés comme l'app). UN écart, voulu : la session FillSell n'est PAS posée dans
// l'extension. Elle reste au repos (« Pas de session valide, poll ignoré ») : aucune sonde de session, aucun relevé,
// donc AUCUNE visite de plateforme avant (ni après) les deux pages de connexion — la consigne de Nico.
// Une seule ouverture par plateforme, Leboncoin puis Beebs ; le navigateur est fermé tout de suite après (le profil
// reste sur le disque). Rien n'est écrit au coffre.
import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { lireConfig } from '../src/config.js';
import * as journal from '../src/journal.js';
import { creerDocker } from '../src/docker.js';
import { creerNavigateurs } from '../src/navigateur.js';
import { creerConnexions } from '../src/connexion.js';
import { signerTicket } from '../src/tickets.js';

const [user, sortie] = process.argv.slice(2);
if (!/^[0-9a-f-]{36}$/i.test(String(user)) || !sortie) {
  console.error('usage : node outils/essai-me-connecter.mjs <user_id> <dossier_de_sortie> < proxy');
  process.exit(1);
}
const lireEntree = () => new Promise((ok) => { let s = ''; process.stdin.on('data', (d) => { s += d; }).on('end', () => ok(s.trim())); });
const proxyUrl = await lireEntree();
if (!/^http:\/\/[^@\s]+@\d+\.\d+\.\d+\.\d+:\d+$/.test(proxyUrl)) { console.error('proxy illisible sur l\'entrée standard'); process.exit(1); }

const OBSERVATION_MS = 25_000;
const INSTANTS_MS = [5_000, 12_000, 25_000];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const config = { ...lireConfig(), comptesAutorises: [user] };
const base = createClient(config.supabaseUrl, config.cleService, { auth: { persistSession: false, autoRefreshToken: false } });
const docker = creerDocker({ socket: config.socketDocker });
const navigateurs = creerNavigateurs({ config, docker, journal });
const { data: poste } = await base.from('cloud_postes').select('details').eq('user_id', user).maybeSingle();
const profilId = poste?.details?.profil;
if (!profilId) { console.error('aucun profil noté pour ce compte (cloud_postes)'); process.exit(1); }

// Le poste SANS session FillSell (l'écart voulu, ci-dessus) ; le coffre n'est jamais écrit.
const postes = { ouvrir: (u) => navigateurs.ouvrir(u, { proxyUrl, proxyBeebs: null, profilId }), extensionId: async () => null };
const coffre = { sauvegarderCookies: async () => ({ refuse: 'essai' }) };
const connexions = creerConnexions({ config, base, postes, navigateurs, coffre, journal });

await mkdir(sortie, { recursive: true });
const bilan = { user: user.slice(0, 8), profil: profilId, debut: new Date().toISOString(), plateformes: {} };

/** L'app, telle que clientConnexion.js : ouvrir (ticket), un accusé par image, fermer. */
async function essayer(plateforme) {
  const etats = [];
  let image = null, images = 0, surMessage = null;
  const ws = {
    readyState: 1, bufferedAmount: 0,
    send(donnee, o) {
      if (o?.binary) {
        images++; image = Buffer.from(donnee).subarray(4);
        setImmediate(() => surMessage?.(Buffer.from(JSON.stringify({ t: 'ack' })), false));
      } else etats.push({ le: new Date().toISOString(), ...JSON.parse(donnee) });
    },
    close() { ws.readyState = 3; },
    on(ev, f) { if (ev === 'message') surMessage = f; },
  };
  connexions.brancher(ws, 'essai');
  const t0 = Date.now();
  const ticket = signerTicket({ user, minutes: 10 }, config.cleTickets);
  await surMessage(Buffer.from(JSON.stringify({ t: 'ouvrir', ticket, plateforme, largeur: 390, hauteur: 844, dpr: 3, lang: 'fr' })), false);
  const t1 = Date.now();
  const releves = [];
  for (const instant of INSTANTS_MS) {
    await pause(Math.max(0, t1 + instant - Date.now()));
    const h = navigateurs.ouvert(user);
    // Lecture au niveau du NAVIGATEUR (aucun script dans la page) : URL des pages et des cadres.
    const cibles = h ? (await h.cdp.send('Target.getTargets').catch(() => ({ targetInfos: [] }))).targetInfos : [];
    const fichier = `${plateforme}-${instant / 1000}s.jpg`;
    if (image) await writeFile(`${sortie}/${fichier}`, image);
    releves.push({ a_s: instant / 1000, images, fichier: image ? fichier : null,
      cibles: cibles.filter((c) => c.type === 'page' || c.type === 'iframe').map((c) => ({ type: c.type, url: String(c.url).slice(0, 160), titre: String(c.title).slice(0, 120) })) });
  }
  await surMessage(Buffer.from(JSON.stringify({ t: 'fermer' })), false);
  bilan.plateformes[plateforme] = { ouverture_s: Math.round((t1 - t0) / 100) / 10, observation_s: OBSERVATION_MS / 1000, etats, releves };
}

try {
  await essayer('leboncoin');
  await essayer('beebs');
} catch (e) {
  bilan.erreur = String(e?.message ?? e).slice(0, 300);
} finally {
  await navigateurs.fermer(user, 'essai_fini').catch(() => {});
  bilan.fin = new Date().toISOString();
  await writeFile(`${sortie}/bilan.json`, `${JSON.stringify(bilan, null, 2)}\n`);
  console.log(JSON.stringify(bilan, null, 2));
  process.exit(0);
}
