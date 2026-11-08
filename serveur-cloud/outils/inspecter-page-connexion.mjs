// LIRE LA PAGE D'UN « ME CONNECTER » EN COURS (08/11/2026 soir, urgence Leboncoin) — sans rien y toucher : l'adresse,
// le titre, le texte visible, la présence d'un champ de connexion, et une capture. À lancer DANS le conteneur de
// l'orchestrateur, pendant qu'un « Me connecter » est ouvert pour ce compte de test :
//   docker exec -i deploiement-orchestrateur-1 node outils/inspecter-page-connexion.mjs <ip_du_navigateur> <motif_hote>
// Aucun clic, aucune saisie, aucune navigation : lecture seule (Runtime.evaluate d'expressions pures, capture d'écran).
import { writeFileSync } from 'node:fs';
import { connecterCdp } from '../src/cdp.js';

const [ip, motif = 'leboncoin'] = process.argv.slice(2);
if (!ip) { console.error('usage : node outils/inspecter-page-connexion.mjs <ip_du_navigateur> [motif_hote]'); process.exit(1); }
const version = await (await fetch(`http://${ip}:9223/json/version`, { signal: AbortSignal.timeout(3000) })).json();
const cdp = await connecterCdp(String(version.webSocketDebuggerUrl).replace(/^ws:\/\/[^/]+/, `ws://${ip}:9223`), { delaiAppelMs: 20_000 });
const { targetInfos } = await cdp.send('Target.getTargets');
const pages = targetInfos.filter((t) => t.type === 'page');
const sortie = { pages: pages.map((p) => p.url.slice(0, 160)) };
const cible = pages.find((p) => p.url.includes(motif)) ?? null;
if (cible) {
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: cible.targetId, flatten: true });
  const r = await cdp.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => ({ url: location.href, titre: document.title, etat: document.readyState,
      texte: (document.body?.innerText || '').replace(/\\s+/g, ' ').slice(0, 400),
      champs: [...document.querySelectorAll('input')].map((i) => i.type + ':' + (i.name || i.id || i.autocomplete || '')).slice(0, 8),
      boutons: [...document.querySelectorAll('button')].map((b) => (b.innerText || '').trim()).filter(Boolean).slice(0, 8),
      cadres: [...document.querySelectorAll('iframe')].map((f) => (f.src || '').slice(0, 100)).slice(0, 5) }))()`,
  }, sessionId);
  sortie.page = r?.result?.value ?? null;
  const cap = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 60 }, sessionId).catch(() => null);
  if (cap?.data) writeFileSync(`/tmp/inspection-${motif}.jpg`, Buffer.from(cap.data, 'base64'));
  await cdp.send('Target.detachFromTarget', { sessionId }).catch(() => {});
}
console.log(JSON.stringify(sortie));
try { cdp.fermer?.(); } catch { /* rien */ }
process.exit(0);
