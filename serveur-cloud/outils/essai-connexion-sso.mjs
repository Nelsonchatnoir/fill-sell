// UN « ME CONNECTER » RÉEL + UN TOUCHER SUR UN BOUTON DE CONNEXION SOCIALE (08/11/2026 soir, client jade60890 perdu) —
// preuve, sans aucun identifiant : la page de connexion s'ouvre par le même chemin que l'app (WebSocket /connexion/ws,
// format téléphone 390 × 844, dpr 2, zoom), on lit ses états et ses images ; puis, si un motif de bouton est donné
// (« Google », « Apple »…), on TOUCHE ce bouton exactement comme le doigt de la personne (message « toucher » au point
// du bouton, rapporté au canvas), et on lit ce qui s'ouvre (page du fournisseur, sa largeur, refus éventuels). Rien n'est
// saisi. Fermeture comme la personne (« client »).
//   docker exec -i deploiement-orchestrateur-1 node outils/essai-connexion-sso.mjs <user_id> <plateforme> <ip_navigateur> [motif_bouton] [secondes]
// Sortie : une ligne JSON ; captures : /tmp/sso-<plateforme>-page.jpg (page de connexion), /tmp/sso-<plateforme>-apres.jpg
// (ce qui s'est ouvert), dernière image diffusée : /tmp/sso-<plateforme>.img.
import { writeFileSync } from 'node:fs';
import WebSocket from 'ws';
import { signerTicket } from '../src/tickets.js';
import { connecterCdp } from '../src/cdp.js';

const [user, plateforme, ip, motif = '', secondes = '25'] = process.argv.slice(2);
if (!/^[0-9a-f-]{36}$/i.test(String(user)) || !plateforme || !ip) {
  console.error('usage : node outils/essai-connexion-sso.mjs <user_id> <plateforme> <ip_navigateur> [motif_bouton] [secondes]');
  process.exit(1);
}
const cle = process.env.TICKETS_CLE;
if (!cle) { console.error('TICKETS_CLE absent de l’environnement'); process.exit(1); }
const HOTES = { vinted: 'vinted.fr', leboncoin: 'leboncoin.fr', beebs: 'beebs.app', depop: 'depop.com' };
const CANVAS = { largeur: 390, hauteur: 844 };
const t0 = Date.now();
const evenements = [];
let images = 0;
let derniere = null;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

const ws = new WebSocket(`ws://127.0.0.1:${process.env.PORT || 8080}/connexion/ws`);
ws.on('open', () => {
  evenements.push({ ms: Date.now() - t0, quoi: 'ws_ouvert' });
  ws.send(JSON.stringify({ t: 'ouvrir', ticket: signerTicket({ user, minutes: 15 }, cle), plateforme, largeur: CANVAS.largeur, hauteur: CANVAS.hauteur, dpr: 2, lang: 'fr', zoom: true }));
});
ws.on('message', (d, binaire) => {
  if (binaire) { images += 1; derniere = d; try { ws.send(JSON.stringify({ t: 'ack' })); } catch { /* fermé */ } return; }
  let m = null;
  try { m = JSON.parse(String(d)); } catch { return; }
  evenements.push({ ms: Date.now() - t0, quoi: m.t, etape: m.etape ?? null, message: String(m.message ?? '').slice(0, 160) });
});
ws.on('close', (code) => evenements.push({ ms: Date.now() - t0, quoi: 'ws_ferme', code }));
ws.on('error', (e) => evenements.push({ ms: Date.now() - t0, quoi: 'ws_erreur', erreur: e.message }));

// Laisser la page s'ouvrir (DataDome compris).
await attendre(14_000);
// `auto` : l'adresse du navigateur du compte, lue au moteur Docker (socket monté dans l'orchestrateur), lecture seule.
const ipNav = ip !== 'auto' ? ip : await new Promise((ok) => {
  import('node:http').then(({ request }) => {
    const r = request({ socketPath: '/var/run/docker.sock', path: `/containers/fs-nav-${user}/json` }, (res) => {
      let s = ''; res.on('data', (d) => { s += d; }); res.on('end', () => {
        try { const n = JSON.parse(s).NetworkSettings?.Networks ?? {}; ok(Object.values(n).map((x) => x.IPAddress).find(Boolean) ?? null); } catch { ok(null); }
      });
    });
    r.on('error', () => ok(null)); r.end();
  });
});
if (!ipNav) { console.log(JSON.stringify({ plateforme, erreur: 'navigateur_introuvable', evenements })); process.exit(1); }
const version = await (await fetch(`http://${ipNav}:9223/json/version`, { signal: AbortSignal.timeout(3000) })).json();
const cdp = await connecterCdp(String(version.webSocketDebuggerUrl).replace(/^ws:\/\/[^/]+/, `ws://${ipNav}:9223`), { delaiAppelMs: 20_000 });
const lirePage = async (cibleT, fichier) => {
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: cibleT.targetId, flatten: true });
  const r = await cdp.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => ({ url: location.host + location.pathname, titre: document.title, largeur: innerWidth, hauteur: innerHeight,
      texte: (document.body?.innerText || '').replace(/\\s+/g, ' ').slice(0, 300),
      champs: [...document.querySelectorAll('input')].filter((i) => i.offsetParent).map((i) => i.type + ':' + (i.name || i.id || i.autocomplete || '')).slice(0, 6) }))()`,
  }, sessionId);
  const cap = fichier ? await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 55 }, sessionId).catch(() => null) : null;
  if (cap?.data) writeFileSync(fichier, Buffer.from(cap.data, 'base64'));
  await cdp.send('Target.detachFromTarget', { sessionId }).catch(() => {});
  return r?.result?.value ?? null;
};
const pages = async () => (await cdp.send('Target.getTargets')).targetInfos.filter((t) => t.type === 'page');
const sortie = { plateforme, motif: motif || null };
const pageConnexion = (await pages()).find((p) => p.url.includes(HOTES[plateforme]));
sortie.page = pageConnexion ? await lirePage(pageConnexion, `/tmp/sso-${plateforme}-page.jpg`) : null;

if (motif && pageConnexion) {
  // Comme la personne : le bandeau de cookies de la plateforme se refuse d'abord (bouton de l'écran FillSell → { t:'cookies' }).
  ws.send(JSON.stringify({ t: 'cookies' }));
  await attendre(2500);
  sortie.pagesAvant = (await pages()).map((p) => p.url.replace(/\?.*$/, '').slice(0, 120));
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: pageConnexion.targetId, flatten: true });
  const r = await cdp.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => { const re = new RegExp(${JSON.stringify(motif)}, 'i');
      const el = [...document.querySelectorAll('button, a, [role=button], div[tabindex]')].filter((e) => e.offsetParent && re.test(e.innerText || e.getAttribute('aria-label') || ''))
        .sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0];
      if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect();
      return { texte: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 60), x: b.left + b.width / 2, y: b.top + b.height / 2, largeurPage: innerWidth }; })()`,
  }, sessionId);
  await cdp.send('Target.detachFromTarget', { sessionId }).catch(() => {});
  const bouton = r?.result?.value ?? null;
  sortie.bouton = bouton;
  if (bouton) {
    await attendre(600);
    const k = CANVAS.largeur / (bouton.largeurPage || CANVAS.largeur);   // page de bureau (Beebs) : rapportée au canvas
    const x = Math.round(bouton.x * k), y = Math.round(bouton.y * k);
    ws.send(JSON.stringify({ t: 'toucher', type: 'debut', x, y }));
    await attendre(80);
    ws.send(JSON.stringify({ t: 'toucher', type: 'fin', x, y }));
    sortie.toucher = { x, y, k: Number(k.toFixed(3)) };
    await attendre(9_000);
    const apres = await pages();
    sortie.pagesApres = apres.map((p) => p.url.replace(/\?.*$/, '').slice(0, 120));
    const fournisseur = apres.find((p) => /accounts\.google|appleid\.apple|facebook\.com|kiabi/.test(p.url));
    sortie.fournisseur = fournisseur ? await lirePage(fournisseur, `/tmp/sso-${plateforme}-apres.jpg`) : null;
  }
}
await attendre(Math.max(0, Number(secondes) * 1000 - (Date.now() - t0)));
if (derniere) writeFileSync(`/tmp/sso-${plateforme}.img`, derniere);
try { ws.send(JSON.stringify({ t: 'fermer' })); } catch { /* fermé */ }
await attendre(1200);
try { ws.close(1000); } catch { /* déjà fermé */ }
sortie.images = images;
sortie.evenements = evenements;
console.log(JSON.stringify(sortie));
try { cdp.fermer?.(); } catch { /* rien */ }
process.exit(0);
