// L'ESSAI « Me connecter » Leboncoin + Beebs sur un VRAI PC Windows (30/10, ordre de Nico) — le parcours de
// essai-me-connecter.mjs (serveur, 30/10 14:55 : bloqué), avec la vraie carte graphique du PC. Depuis le PC (Git Bash) :
//   node serveur-cloud/outils/essai-me-connecter-pc.mjs <dossier_de_sortie> --verifier      Chrome + extension + carte
//                                    graphique relus SANS AUCUN RÉSEAU (proxy mort), aucune page ouverte, puis fermé
//   node serveur-cloud/outils/essai-me-connecter-pc.mjs <dossier_de_sortie> < proxy          L'ESSAI (URL du proxy sur
//                                    l'entrée standard : jamais en argument, jamais affichée)
//
// Ce qui est celui de la production : Google Chrome officiel, profil NEUF, la copie Cloud de l'extension
// (build/extension-cloud), le relais de proxy du conteneur (navigateur-chrome/relais.mjs : les identifiants ne vont
// jamais à Chrome), les drapeaux de navigateur-chrome/demarrer.sh, et « Me connecter » de src/connexion.js piloté par
// CDP (format téléphone, images, un accusé par image comme l'app). Une seule ouverture par plateforme.
// Ce qui diffère, et pourquoi :
//   · la carte graphique : celle du PC (aucun --use-angle=swiftshader) — c'est l'objet de l'essai ;
//   · --no-sandbox et --password-store=basic : propres au conteneur Linux, sans objet sous Windows ;
//   · l'extension installée au démarrage par Extensions.loadUnpacked (canal --remote-debugging-pipe, drapeau
//     --enable-unsafe-extension-debugging) : la stratégie d'entreprise ne vaut que pour un Windows géré et toucherait le
//     Chrome de tous les jours (tous ses profils) ; Chrome 156 officiel ignore --load-extension (relu le 30/10) ;
//   · la session FillSell n'est pas posée (comme l'essai serveur) : aucune sonde, aucun relevé, aucun job ;
//   · la base n'est pas lue : le compte servi et le journal des connexions sont simulés (sans effet sur le navigateur).
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as journal from '../src/journal.js';
import { connecterCdp } from '../src/cdp.js';
import { creerConnexions } from '../src/connexion.js';
import { signerTicket } from '../src/tickets.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION = path.resolve(ICI, '..', '..', 'build', 'extension-cloud');
const RELAIS = path.resolve(ICI, '..', 'navigateur-chrome', 'relais.mjs');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ID_EXTENSION = 'dnankhhfellobiobloopcjgkdioblpjd';
const NICO = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
const PILOTAGE = 9333;
const OBSERVATION_MS = 25_000;
const INSTANTS_MS = [5_000, 12_000, 25_000];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const sortie = process.argv[2];
const verifier = process.argv.includes('--verifier');
// --a-blanc : tout le parcours, proxy MORT (rien ne sort du PC : aucune plateforme jointe) — pour éprouver l'outil.
const aBlanc = process.argv.includes('--a-blanc');
// --seulement=beebs : les seules plateformes à ouvrir ; --reprendre : le profil de l'essai déjà commencé (une plateforme
// restée sans ouverture : 30/10, Beebs, outil arrêté avant la page — aucune visite).
const seulement = process.argv.find((a) => a.startsWith('--seulement='))?.slice(12).split(',') ?? ['leboncoin', 'beebs'];
const reprendre = process.argv.includes('--reprendre');
if (!sortie) { console.error('usage : node outils/essai-me-connecter-pc.mjs <dossier_de_sortie> [--verifier] < proxy'); process.exit(1); }
if (!existsSync(path.join(EXTENSION, 'manifest.json'))) { console.error('build/extension-cloud absent : node scripts/cloud/build-extension-cloud.mjs'); process.exit(1); }
const lireEntree = () => new Promise((ok) => { let s = ''; process.stdin.on('data', (d) => { s += d; }).on('end', () => ok(s.trim())); });
const proxyUrl = verifier || aBlanc ? null : await lireEntree();
if (!verifier && !aBlanc && !/^http:\/\/[^@\s]+@\d+\.\d+\.\d+\.\d+:\d+$/.test(proxyUrl)) { console.error('proxy illisible sur l\'entrée standard'); process.exit(1); }

await mkdir(sortie, { recursive: true });
const profil = path.resolve(sortie, verifier ? 'profil-verification' : aBlanc ? 'profil-a-blanc' : 'profil-neuf');
if (existsSync(profil) && !reprendre) { console.error(`profil déjà là (${profil}) : un essai = un profil NEUF`); process.exit(1); }
const bilan = { mode: verifier ? 'verification' : aBlanc ? 'a_blanc' : 'essai', debut: new Date().toISOString(), plateformes: {} };
const enfants = [];
let cdp = null;

async function portOuvert(port) {
  return new Promise((ok) => { const s = net.connect(port, '127.0.0.1', () => { s.destroy(); ok(true); }); s.on('error', () => ok(false)); });
}

try {
  // 1. Le relais (le même fichier que dans le conteneur) — pas en vérification : le proxy y est un port mort.
  if (!verifier && !aBlanc) {
    enfants.push(spawn(process.execPath, [RELAIS], { env: { ...process.env, PROXY_AMONT: proxyUrl }, stdio: 'ignore' }));
    for (let i = 0; i < 50 && !(await portOuvert(3128)); i++) await pause(100);
    if (!(await portOuvert(3128))) throw new Error('relais muet sur 127.0.0.1:3128');
  }
  // 2. Google Chrome : les drapeaux de demarrer.sh, la vraie carte graphique.
  const chrome = spawn(CHROME, ['--no-first-run', '--no-default-browser-check', '--lang=fr-FR', '--accept-lang=fr-FR,fr',
    `--user-data-dir=${profil}`, `--remote-debugging-port=${PILOTAGE}`, '--remote-allow-origins=*',
    `--proxy-server=http://127.0.0.1:${verifier || aBlanc ? 9 : 3128}`,
    // Le canal par tuyau ne sert QU'À installer l'extension (ci-dessous) ; le pilotage passe par le port, comme en
    // production. CalculateNativeWinOcclusion coupé : la fenêtre garde ses images si elle est recouverte sur le bureau
    // (le conteneur n'a pas ce cas). Rien de tout cela ne se voit d'une page.
    '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', '--disable-features=CalculateNativeWinOcclusion',
    '--window-size=1366,768', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  enfants.push(chrome);
  // L'extension Cloud, par le tuyau (messages JSON terminés par \0).
  const installee = await new Promise((ok, ko) => {
    let tampon = '';
    const minuteur = setTimeout(() => ko(new Error('Extensions.loadUnpacked : pas de réponse')), 30_000);
    chrome.stdio[4].on('data', (d) => {
      tampon += d.toString('utf8');
      let i;
      while ((i = tampon.indexOf('\0')) >= 0) {
        const m = JSON.parse(tampon.slice(0, i)); tampon = tampon.slice(i + 1);
        if (m.id === 1) { clearTimeout(minuteur); m.error ? ko(new Error(`Extensions.loadUnpacked : ${m.error.message}`)) : ok(m.result?.id); }
      }
    });
    chrome.stdio[3].write(`${JSON.stringify({ id: 1, method: 'Extensions.loadUnpacked', params: { path: EXTENSION } })}\0`);
  });
  if (installee !== ID_EXTENSION) throw new Error(`extension installée sous un autre identifiant (${installee})`);
  let version = null;
  for (let i = 0; i < 60 && !version; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${PILOTAGE}/json/version`, { signal: AbortSignal.timeout(2000) })).json(); }
    catch { await pause(1000); }
  }
  if (!version?.webSocketDebuggerUrl) throw new Error('Chrome muet (port de pilotage)');
  cdp = await connecterCdp(version.webSocketDebuggerUrl, { delaiAppelMs: 90_000 });
  bilan.navigateur = version.Browser;
  // 3. L'extension Cloud doit être là AVANT toute page (sinon : arrêt, aucune plateforme ouverte).
  let ext = null;
  for (let i = 0; i < 20 && !ext; i++) {
    const { targetInfos } = await cdp.send('Target.getTargets');
    ext = targetInfos.find((t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${ID_EXTENSION}/`));
    if (!ext) await pause(1000);
  }
  bilan.extension = ext ? ext.url : null;
  if (!ext) throw new Error('extension Cloud absente : aucune plateforme ouverte');
  // 4. La carte graphique vue par Chrome (niveau navigateur : aucune page, aucun script).
  const info = await cdp.send('SystemInfo.getInfo').catch(() => null);
  const g = info?.gpu;
  bilan.carte_graphique = g ? { appareils: (g.devices ?? []).map((d) => `${d.vendorString} ${d.deviceString} ${d.driverVersion}`.trim()),
    rendu: g.auxAttributes?.glRenderer ?? null, webgl: g.featureStatus?.webgl ?? null, gpu_compositing: g.featureStatus?.gpu_compositing ?? null } : null;
  console.log(JSON.stringify({ navigateur: bilan.navigateur, extension: bilan.extension, carte_graphique: bilan.carte_graphique }));
  if (!verifier) {
    const h = { cdp, ip: '127.0.0.1', conteneur: 'pc', profilId: 'pc', ouvertLe: Date.now(), moteur: 'chrome', navigateur: version.Browser };
    const navigateurs = { ouvrir: async () => h, ouvert: () => h, ouverts: () => [NICO], fermer: async () => {} };
    const postes = { ouvrir: async () => h, extensionId: async () => ID_EXTENSION };
    const coffre = { sauvegarderCookies: async () => ({ refuse: 'essai' }) };
    const base = {
      rpc: async (nom) => ({ data: nom === 'cloud_comptes_a_servir' ? [{ user_id: NICO, etat_cloud: 'actif' }] : null, error: null }),
      from: () => ({ insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null }) }) }), update: () => ({ eq: async () => ({}) }) }),
    };
    const config = { comptesAutorises: [NICO], cleTickets: randomBytes(32).toString('base64'), supabaseUrl: '', cleAnon: '' };
    const connexions = creerConnexions({ config, base, postes, navigateurs, coffre, journal });

    /** L'app, telle que clientConnexion.js : ouvrir (ticket), un accusé par image, fermer. */
    const essayer = async (plateforme) => {
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
      connexions.brancher(ws, 'essai-pc');
      const t0 = Date.now();
      const ticket = signerTicket({ user: NICO, minutes: 10 }, config.cleTickets);
      await surMessage(Buffer.from(JSON.stringify({ t: 'ouvrir', ticket, plateforme, largeur: 390, hauteur: 844, dpr: 3, lang: 'fr' })), false);
      const t1 = Date.now();
      const releves = [];
      for (const instant of INSTANTS_MS) {
        await pause(Math.max(0, t1 + instant - Date.now()));
        const { targetInfos: cibles } = await cdp.send('Target.getTargets').catch(() => ({ targetInfos: [] }));
        const fichier = `${plateforme}-${instant / 1000}s.jpg`;
        if (image) await writeFile(path.join(sortie, fichier), image);
        releves.push({ a_s: instant / 1000, images, fichier: image ? fichier : null,
          cibles: cibles.filter((c) => c.type === 'page' || c.type === 'iframe').map((c) => ({ type: c.type, url: String(c.url).slice(0, 160), titre: String(c.title).slice(0, 120) })) });
      }
      await surMessage(Buffer.from(JSON.stringify({ t: 'fermer' })), false);
      bilan.plateformes[plateforme] = { ouverture_s: Math.round((t1 - t0) / 100) / 10, observation_s: OBSERVATION_MS / 1000, etats, releves };
    };
    if (seulement.includes('leboncoin')) await essayer('leboncoin');
    // Sous Windows, Chrome refuse un onglet neuf juste après la fermeture d'une fenêtre (« Failed to open a new
    // tab », 70 ms après, relu à blanc le 30/10) ; dans l'app, deux « Me connecter » ne s'enchaînent jamais si vite.
    bilan.entre_deux = (await cdp.send('Target.getTargets').catch((e) => ({ targetInfos: [{ type: 'erreur', url: e.message }] }))).targetInfos.map((c) => `${c.type} ${String(c.url).slice(0, 80)}`);
    if (seulement.includes('leboncoin') && seulement.includes('beebs')) await pause(5000);
    if (seulement.includes('beebs')) await essayer('beebs');
  }
} catch (e) {
  bilan.erreur = String(e?.message ?? e).slice(0, 300);
} finally {
  await cdp?.send('Browser.close').catch(() => {});
  try { cdp?.fermer(); } catch { /* déjà parti */ }
  await pause(1500);
  for (const p of enfants) { try { p.kill(); } catch { /* déjà parti */ } }
  if (verifier || aBlanc) await rm(profil, { recursive: true, force: true }).catch(() => {});
  bilan.fin = new Date().toISOString();
  await writeFile(path.join(sortie, reprendre ? `bilan-${seulement.join('-')}.json` : 'bilan.json'), `${JSON.stringify(bilan, null, 2)}\n`);
  console.log(JSON.stringify({ fin: bilan.fin, erreur: bilan.erreur ?? null }));
  process.exit(0);
}
