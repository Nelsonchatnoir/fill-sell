// (01/11) LA VÉRIFICATION D'UN NAVIGATEUR CLOUD OUVERT — sans visiter AUCUNE plateforme. Dans le conteneur orchestrateur :
//
//   docker compose exec -T orchestrateur node outils/verifier-navigateur-cloud.mjs <user_id>
//
// Un second client DevTools sur le navigateur du compte (celui de l'orchestrateur n'est pas touché) lit :
//   · le navigateur (Chromium de l'essai du 01/11 ?), la 3D (SwiftShader comme l'essai ?), l'écran, la langue, le fuseau,
//     webdriver — sur une page about:blank (aucun réseau) ;
//   · LE VERROU DES PLATEFORMES, par son mécanisme : une interception au niveau du navigateur sur ipinfo.io (jamais une
//     plateforme) doit arrêter une requête d'un onglet ET une requête du service worker de l'extension.
// Rend un JSON ; rien n'est écrit nulle part.
import { connecterCdp } from '../src/cdp.js';
import { creerDocker } from '../src/docker.js';
import { nomConteneur } from '../src/navigateur.js';

const user = process.argv[2];
if (!/^[0-9a-f-]{36}$/.test(user ?? '')) { console.error('usage : verifier-navigateur-cloud.mjs <user_id>'); process.exit(1); }
const docker = creerDocker({ socket: process.env.SOCKET_DOCKER || '/var/run/docker.sock' });
const ins = await docker.inspecter(nomConteneur(user));
const ip = ins?.NetworkSettings?.Networks?.[process.env.RESEAU_DOCKER || 'fillsell-cloud']?.IPAddress;
if (!ins?.State?.Running || !ip) { console.log(JSON.stringify({ ok: false, raison: 'navigateur_ferme' })); process.exit(1); }

const bilan = { conteneur: ins.Name?.replace(/^\//, ''), image: ins.Config?.Image };
const cdp = await connecterCdp(`ws://${ip}:3000/`, { delaiAppelMs: 30_000 });
const evaluer = async (expression, sessionId) => (await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId))?.result?.value;
try {
  const v = await cdp.send('Browser.getVersion');
  bilan.navigateur = { produit: v.product, ua: v.userAgent };
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  bilan.page = await evaluer(`(() => { const c = document.createElement('canvas'); const g = c.getContext('webgl');
    const e = g && g.getExtension('WEBGL_debug_renderer_info');
    return { webgl: g ? (e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'sans nom') : null, ecran: screen.width + 'x' + screen.height,
      langues: navigator.languages, fuseau: Intl.DateTimeFormat().resolvedOptions().timeZone, coeurs: navigator.hardwareConcurrency,
      webdriver: navigator.webdriver, extensions: typeof chrome !== 'undefined' }; })()`, sessionId);

  // Le mécanisme du verrou, sur ipinfo.io (jamais une plateforme) : arrêté au niveau du navigateur.
  let arretees = 0;
  const finEcoute = cdp.on((m) => {
    if (m.method === 'Fetch.requestPaused' && !m.sessionId && /ipinfo\.io/.test(m.params?.request?.url ?? '')) {
      arretees++;
      cdp.send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
    }
  });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*://ipinfo.io/*', requestStage: 'Request' }] });
  const essai = 'fetch("https://ipinfo.io/json", { cache: "no-store" }).then((r) => "passee:" + r.status, (e) => "bloquee:" + e.message)';
  bilan.verrou_onglet = await evaluer(essai, sessionId);
  const { targetInfos } = await cdp.send('Target.getTargets');
  const sw = targetInfos.find((t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'));
  if (sw) {
    const { sessionId: s2 } = await cdp.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true });
    bilan.verrou_extension = await evaluer(essai, s2);
    await cdp.send('Target.detachFromTarget', { sessionId: s2 }).catch(() => {});
  } else bilan.verrou_extension = 'service worker de l\'extension introuvable';
  await cdp.send('Fetch.disable').catch(() => {});
  finEcoute();
  bilan.verrou_arretees = arretees;
  bilan.verrou_ok = /^bloquee/.test(bilan.verrou_onglet ?? '') && /^bloquee/.test(bilan.verrou_extension ?? '') && arretees >= 2;
  bilan.cibles = targetInfos.map((t) => `${t.type}:${t.url.replace(/\?.*$/, '').slice(0, 80)}`);
  await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
} finally { cdp.fermer(); }
console.log(JSON.stringify(bilan, null, 1));
