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

const [ipId, url, image = 'fillsell-chrome:essai'] = process.argv.slice(2);
if (!ipId || !/^https:\/\//.test(url ?? '')) { console.error('usage : essai-chrome.mjs <ip_id> <url https> [image]'); process.exit(2); }
const config = lireConfig();
const base = createClient(config.supabaseUrl, config.cleService, { auth: { persistSession: false } });
const { data: proxyUrl } = await base.rpc('cloud_proxy_identifiants', { p_ip: Number(ipId) });
if (!proxyUrl) { console.error('proxy illisible'); process.exit(1); }
const pu = new URL(proxyUrl);
const docker = creerDocker({ socket: config.socketDocker });
const nom = `fs-chrome-essai-${randomBytes(3).toString('hex')}`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let cdp = null;
try {
  await docker.creer(nom, {
    Image: image, Env: [`PROXY_SERVEUR=http://${pu.hostname}:${pu.port || 12323}`],
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
  // Le proxy demande ses identifiants : rendus par le protocole de pilotage (jamais journalisés).
  cdp.on((m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Fetch.authRequired') {
      cdp.send('Fetch.continueWithAuth', { requestId: m.params.requestId, authChallengeResponse: { response: 'ProvideCredentials',
        username: decodeURIComponent(pu.username), password: decodeURIComponent(pu.password) } }, sessionId).catch(() => {});
    } else if (m.method === 'Fetch.requestPaused') {
      cdp.send('Fetch.continueRequest', { requestId: m.params.requestId }, sessionId).catch(() => {});
    }
  });
  await cdp.send('Fetch.enable', { handleAuthRequests: true, patterns: [{ urlPattern: '*' }] }, sessionId);
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
  console.log(JSON.stringify({ ip_id: Number(ipId), sortie: pu.hostname, navigateur: version.Browser, ...lu, capture: fichier, empreinte }, null, 2));
} finally {
  try { cdp?.fermer(); } catch { /* rien */ }
  await docker.supprimer(nom).catch(() => {});
}
