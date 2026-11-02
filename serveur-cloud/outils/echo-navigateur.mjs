// (02/11 soir, demande de Nico : « écho (IP, langues, empreinte) » avant et après la bascule) CE QUE VOIT UN SITE DU
// NAVIGATEUR CLOUD OUVERT D'UN COMPTE — sans visiter AUCUNE plateforme. Un second client DevTools (celui de l'orchestrateur
// n'est pas touché) lit :
//   · sur une page about:blank (aucun réseau) : langues, Intl, fuseau, écran, cœurs, webdriver, marques, WebGL ;
//   · dans un onglet de fond fermé aussitôt, deux échos publics (jamais une plateforme : le verrou les laisse passer, le
//     pare-feu les fait sortir par le proxy du compte) : httpbin.org (IP de sortie, en-têtes) et tls.browserleaks.com
//     (JA4, HTTP/2, Accept-Language tel qu'il part) ;
//   · l'empreinte FIGÉE notée dans le profil (.empreinte-navigateur).
//   docker compose exec -T orchestrateur node outils/echo-navigateur.mjs <user_id>
// Rend un JSON ; rien n'est écrit nulle part.
import { readFile } from 'node:fs/promises';
import { connecterCdp } from '../src/cdp.js';
import { creerDocker } from '../src/docker.js';
import { nomConteneur } from '../src/navigateur.js';

const user = process.argv[2];
if (!/^[0-9a-f-]{36}$/.test(user ?? '')) { console.error('usage : echo-navigateur.mjs <user_id>'); process.exit(1); }
const docker = creerDocker({ socket: process.env.SOCKET_DOCKER || '/var/run/docker.sock' });
const ins = await docker.inspecter(nomConteneur(user));
const ip = ins?.NetworkSettings?.Networks?.[process.env.RESEAU_DOCKER || 'fillsell-cloud']?.IPAddress;
if (!ins?.State?.Running || !ip) { console.log(JSON.stringify({ ok: false, raison: 'navigateur_ferme' })); process.exit(1); }
const profil = ins.Config?.Labels?.['fillsell.profil'];
const dossier = process.env.DOSSIER_PROFILS || '/srv/fillsell-cloud/profils';

const bilan = { le: new Date().toISOString(), conteneur: ins.Name?.replace(/^\//, ''), lancement: ins.Config?.Labels?.['fillsell.lancement'],
  empreinte_notee: profil ? (await readFile(`${dossier}/${profil}/.empreinte-navigateur`, 'utf8').catch(() => '')).trim() : null };
const cdp = await connecterCdp(`ws://${ip}:3000/`, { delaiAppelMs: 30_000 });
const evaluer = async (expression, sessionId) => (await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId))?.result?.value;
const cibles = [];
try {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', background: true });
  cibles.push(targetId);
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  bilan.page = await evaluer(`(async () => { const c = document.createElement('canvas'); const g = c.getContext('webgl');
    const e = g && g.getExtension('WEBGL_debug_renderer_info');
    const ua = navigator.userAgentData ? await navigator.userAgentData.getHighEntropyValues(['fullVersionList']).catch(() => null) : null;
    return { langues: navigator.languages, langue: navigator.language, intl: Intl.DateTimeFormat().resolvedOptions().locale,
      fuseau: Intl.DateTimeFormat().resolvedOptions().timeZone, date: new Date(Date.UTC(2026, 10, 2, 10)).toLocaleString(),
      ecran: screen.width + 'x' + screen.height + 'x' + screen.colorDepth, coeurs: navigator.hardwareConcurrency,
      webdriver: navigator.webdriver, ua: navigator.userAgent,
      marques: (ua?.fullVersionList ?? navigator.userAgentData?.brands ?? []).map((b) => b.brand),
      webgl: g ? (e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'sans nom') : null }; })()`, sessionId);

  // Les échos publics, dans un onglet de fond : le texte de la page, rien d'autre.
  const lire = async (url) => {
    const { targetId: t } = await cdp.send('Target.createTarget', { url: 'about:blank', background: true });
    cibles.push(t);
    const { sessionId: s } = await cdp.send('Target.attachToTarget', { targetId: t, flatten: true });
    await cdp.send('Page.enable', {}, s);
    await cdp.send('Page.navigate', { url }, s);
    for (let i = 0; i < 40; i++) {
      await new Promise((ok) => setTimeout(ok, 500));
      const txt = await evaluer('document.readyState === "complete" ? (document.body ? document.body.innerText : "") : null', s).catch(() => null);
      if (txt) { try { return JSON.parse(txt); } catch { return { texte: txt.slice(0, 400) }; } }
    }
    return { erreur: 'muet' };
  };
  const h = await lire('https://httpbin.org/headers');
  const e = h?.headers ?? {};
  bilan.httpbin = { 'Accept-Language': e['Accept-Language'], 'User-Agent': e['User-Agent'], 'Sec-Ch-Ua': e['Sec-Ch-Ua'] };
  bilan.ip_sortie = (await lire('https://httpbin.org/ip'))?.origin ?? null;
  const t = await lire('https://tls.browserleaks.com/json');
  bilan.tls = { ja4: t?.ja4, ja3n: t?.ja3n_hash, akamai: t?.akamai_text, accept_language: t?.http_headers?.['Accept-Language'] ?? t?.accept_language ?? null };
} finally {
  for (const c of cibles) await cdp.send('Target.closeTarget', { targetId: c }).catch(() => {});
  cdp.fermer();
}
console.log(JSON.stringify(bilan, null, 1));
process.exit(0);
