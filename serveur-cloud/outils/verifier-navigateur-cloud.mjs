// (01/11) LA VÉRIFICATION D'UN NAVIGATEUR CLOUD OUVERT — sans visiter AUCUNE plateforme. Dans le conteneur orchestrateur :
//
//   docker compose exec -T orchestrateur node outils/verifier-navigateur-cloud.mjs <user_id>
//
// Un second client DevTools sur le navigateur du compte (celui de l'orchestrateur n'est pas touché) lit :
//   · le navigateur (Chromium de l'essai du 01/11 ?), la 3D (SwiftShader comme l'essai ?), l'écran, la langue, le fuseau,
//     webdriver — sur une page about:blank (aucun réseau) ;
//   · LE SECOND VERROU DES PLATEFORMES, celui de la copie Cloud de l'extension : posé (fetch, onglets, fenêtres), et pour
//     chaque plateforme « ouverte » (connectée dans ce navigateur) ou « fermée » — lu sans aucune requête. (Le premier,
//     l'interception de l'orchestrateur, se lit dans le journal du conteneur : ERR_BLOCKED_BY_CLIENT ; un second client
//     DevTools ne peut pas l'essayer, son interception à lui n'arrête rien — essai du 01/11.)
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

  // (01/11) LE VERROU DES PLATEFORMES, dans la copie Cloud de l'extension : son état et ses décisions, lus dans le
  // service worker SANS AUCUNE requête (la décision ne lit que les cookies de connexion de ce navigateur).
  const { targetInfos } = await cdp.send('Target.getTargets');
  const sw = targetInfos.find((t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'));
  if (sw) {
    const { sessionId: s2 } = await cdp.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true });
    bilan.verrou = await evaluer(`(async () => { const v = globalThis.__fillsellVerrouCloud; if (!v) return null;
      const d = {}; for (const [pf, u] of [['vinted', 'https://www.vinted.fr/'], ['leboncoin', 'https://www.leboncoin.fr/'], ['beebs', 'https://www.beebs.app/fr'], ['depop', 'https://www.depop.com/']])
        d[pf] = (await v.refuse(u)) ? 'fermee' : 'ouverte';
      return { ...v.etat(), decisions: d }; })()`, s2);
    await cdp.send('Target.detachFromTarget', { sessionId: s2 }).catch(() => {});
  } else bilan.verrou = "service worker de l'extension introuvable";
  bilan.verrou_ok = Boolean(bilan.verrou?.fetch && bilan.verrou?.onglets);
  bilan.cibles = targetInfos.map((t) => `${t.type}:${t.url.replace(/\?.*$/, '').slice(0, 80)}`);
  await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
} finally { cdp.fermer(); }
console.log(JSON.stringify(bilan, null, 1));
