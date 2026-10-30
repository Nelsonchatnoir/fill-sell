// (30/10, lot D — Beebs) L'ESSAI DU NAVIGATEUR « CHROME » DU CLOUD (serveur-cloud/navigateur-chrome) : Google Chrome
// officiel, avec écran, fr-FR, Europe/Paris, sorti par une IP du pool ; la page de connexion en ACCÈS DIRECT (première
// navigation), puis l'empreinte. Navigateur neuf, aucun compte, rien n'est saisi, aucune vérification forcée.
//   docker compose exec -T orchestrateur node outils/essai-chrome.mjs <ip_id> <url> [image]
import { writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { lireConfig } from '../src/config.js';
import { creerDocker } from '../src/docker.js';
import { connecterCdp, attacher } from '../src/cdp.js';
import { EXPRESSION_EMPREINTE } from '../src/empreinte.js';

// <source> : l'id d'une IP du pool, ou « residentiel » (identifiants IPROYAL_RESI_* du .env, session collante neuve).
const [source, url, image = 'fillsell-chrome:essai', ...envEssai] = process.argv.slice(2);
if (!source || !/^https:\/\//.test(url ?? '')) { console.error('usage : essai-chrome.mjs <ip_id|residentiel> <url https> [image]'); process.exit(2); }
const config = { ...lireConfig() };
let proxyUrl = null;
if (source === 'residentiel' && !config.iproyalResiUtilisateur) {
  // Conteneur lancé avant la pose des identifiants : relus dans le .env monté (jamais affichés).
  const { readFileSync } = await import('node:fs');
  const env = Object.fromEntries(readFileSync('/srv/fillsell-cloud/.env', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
  config.iproyalResiUtilisateur = env.IPROYAL_RESI_UTILISATEUR; config.iproyalResiMotDePasse = env.IPROYAL_RESI_MOT_DE_PASSE;
}
if (source === 'residentiel') {
  const { lookup } = await import('node:dns/promises');
  const { address } = await lookup('geo.iproyal.com', { family: 4 });
  const session = randomBytes(4).toString('hex');
  proxyUrl = `http://${encodeURIComponent(config.iproyalResiUtilisateur)}:${encodeURIComponent(`${config.iproyalResiMotDePasse}_country-fr_session-${session}_lifetime-1h`)}@${address}:12321`;
} else {
  const base = createClient(config.supabaseUrl, config.cleService, { auth: { persistSession: false } });
  ({ data: proxyUrl } = await base.rpc('cloud_proxy_identifiants', { p_ip: Number(source) }));
}
if (!proxyUrl) { console.error('proxy illisible'); process.exit(1); }
const docker = creerDocker({ socket: config.socketDocker });
const nom = `fs-chrome-essai-${randomBytes(3).toString('hex')}`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let cdp = null;
try {
  await docker.creer(nom, {
    Image: image, Env: [`PROXY_AMONT=${proxyUrl}`, ...envEssai.filter((e) => /^(CHROME_ARGS_GL|ECRAN)=/.test(e))],
    Labels: { 'fillsell.cloud': '1', 'fillsell.essai': 'chrome' },
    HostConfig: { Memory: 1536 * 1024 ** 2, ShmSize: 512 * 1024 ** 2, NetworkMode: config.reseauDocker, AutoRemove: false },
  });
  await docker.demarrer(nom);
  const adr = (await docker.inspecter(nom))?.NetworkSettings?.Networks?.[config.reseauDocker]?.IPAddress;
  let cibles = null;
  for (let i = 0; i < 40 && !cibles; i++) {
    try { cibles = await (await fetch(`http://${adr}:9223/json`, { signal: AbortSignal.timeout(3000) })).json(); } catch { await pause(1500); }
  }
  if (!cibles) throw new Error('Chrome ne répond pas');
  const version = await (await fetch(`http://${adr}:9223/json/version`)).json();
  cdp = await connecterCdp(String(version.webSocketDebuggerUrl).replace(/^ws:\/\/[^/]+/, `ws://${adr}:9223`));
  const page = cibles.find((t) => t.type === 'page');
  const sessionId = await attacher(cdp, page.id);
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Page.navigate', { url }, sessionId);
  await pause(15_000);
  const ev = async (expression, awaitPromise = false) => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }, sessionId))?.result?.value;
  const lu = JSON.parse(await ev(`JSON.stringify({ titre: document.title, url: location.href,
    bloque: /temporairement restreint|temporarily restricted|captcha-delivery/i.test(document.documentElement.outerHTML),
    formulaire: !!document.querySelector('input[type=email], input[type=password]'), extrait: (document.body?.innerText || '').slice(0, 300) })`));
  const { data: capture } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
  let dossier = '/srv/fillsell-cloud/essais';
  try { mkdirSync(dossier, { recursive: true }); } catch { dossier = '/tmp'; }
  const fichier = `${dossier}/chrome-${new URL(url).hostname}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  writeFileSync(fichier, Buffer.from(capture, 'base64'));
  let empreinte = null; try { empreinte = JSON.parse(await ev(EXPRESSION_EMPREINTE, true)); } catch { /* illisible */ }
  console.log(JSON.stringify({ source, sortie: source === 'residentiel' ? 'résidentielle FR' : new URL(proxyUrl).hostname, navigateur: version.Browser, ...lu, capture: fichier, empreinte }, null, 2));
} finally {
  try { cdp?.fermer(); } catch { /* rien */ }
  await docker.supprimer(nom).catch(() => {});
}
