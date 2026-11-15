// VERROU (15/11/2026 soir, ordre de Nico — cliente af37fa49, « Me connecter » Beebs/Kiabi sur son ORDINATEUR à 20:15) :
// SUR UN ORDINATEUR, APRÈS UN CLIC DANS L'IMAGE, CE QU'ON TAPE AU CLAVIER PART DANS LE CHAMP.
//
// Ce qui se passait (enregistrement cloud-2 beebs-2026-11-15T19-15-21-021Z, journal de l'orchestrateur, usage_logs) : à la
// page du code Kiabi, 7 clics dans l'image (20:16:58 → 20:17:05), une seule frappe reçue 11 s plus tard, aucune vérification
// partie chez Kiabi, puis « Fermer ». Cause, dans clientConnexion.js : le clavier du téléphone passe par un champ caché ;
// sur un ordinateur, un clic de souris dans l'image (un canvas, qui ne prend pas le focus) RETIRAIT le focus de ce champ
// (mousedown sans preventDefault) : tout ce qui était tapé ensuite au clavier n'allait nulle part, sans un mot, tant
// qu'on ne recliquait pas sur « Écrire ». Au doigt, rien de tel (touchstart annulé : le focus ne bouge pas).
//
// Rejoué dans un VRAI Chrome (Playwright), avec le vrai clientConnexion.js et un faux serveur qui note ce qu'il reçoit :
//   ordinateur — clic dans l'image puis frappe ; « Écrire », frappe, clic dans l'image, frappe ; Entrée, effacer, collage ;
//                le clic lui-même part toujours ; la page ne défile pas ;
//   téléphone  — RIEN ne change : un toucher dans l'image n'ouvre jamais le clavier ; « Écrire » l'ouvre et un toucher
//                dans l'image le garde ; la frappe part.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

let chromium;
try { ({ chromium } = await import('playwright')); }
catch (e) { console.error(`  ✗ playwright introuvable (${e?.message ?? e})`); process.exit(1); }

// ── Le faux serveur : la page, le vrai client, une WebSocket qui note chaque message reçu ────────────────────────────
const CLIENT = readFileSync(path.join(racine, 'src/cloud/connexion/clientConnexion.js'), 'utf8');
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;font:15px sans-serif} #ecran{width:360px;height:560px;position:relative;overflow:hidden;background:#fff}
#ecrire{margin:12px;padding:10px 16px}</style></head><body>
<div id="ecran"></div><button id="ecrire">Écrire</button><button id="fermer">Fermer</button>
<script type="module">
  import { ouvrirConnexion } from '/client.js';
  const s = ouvrirConnexion({ url: 'ws://' + location.host + '/ws', ticket: 't', plateforme: 'leboncoin', conteneur: document.getElementById('ecran'), lang: 'fr', surEtat: () => {} });
  document.getElementById('ecrire').addEventListener('click', () => s.ecrire());
  window.__champ = () => document.querySelector('#ecran input');
  window.__pret = true;
</script></body></html>`;
const http = createServer((req, res) => {
  if (req.url === '/client.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); return res.end(CLIENT); }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGE);
});
let recus = [];
const wss = new WebSocketServer({ server: http, path: '/ws' });
wss.on('connection', (ws) => {
  ws.on('message', (d) => {
    let m; try { m = JSON.parse(String(d)); } catch { return; }
    recus.push(m);
    if (m.t === 'ouvrir') ws.send(JSON.stringify({ t: 'etat', etape: 'pret', message: 'Prêt' }));
  });
});
await new Promise((r) => http.listen(0, '127.0.0.1', r));
const ADRESSE = `http://127.0.0.1:${http.address().port}/`;

const textes = () => recus.filter((m) => m.t === 'texte').map((m) => m.s).join('');
const touches = () => recus.filter((m) => m.t === 'touche').map((m) => m.cle);
const vider = () => { recus = []; };

let nav;
try { nav = await chromium.launch({ channel: 'chrome', headless: true }); }
catch { nav = await chromium.launch({ headless: true }); }

async function ouvrirPage(contexteOptions) {
  const ctx = await nav.newContext(contexteOptions);
  const page = await ctx.newPage();
  await page.goto(ADRESSE);
  await page.waitForFunction(() => window.__pret === true && document.querySelector('#ecran canvas'));
  for (let i = 0; i < 50 && !recus.some((m) => m.t === 'ouvrir'); i++) await attendre(20);
  const boite = await page.locator('#ecran canvas').boundingBox();
  const centre = { x: boite.x + boite.width / 2, y: boite.y + boite.height / 3 };
  const champActif = () => page.evaluate(() => document.activeElement === window.__champ());
  return { ctx, page, centre, champActif };
}

try {
  console.log('1. Ordinateur (souris + clavier)');
  {
    vider();
    const { ctx, page, centre, champActif } = await ouvrirPage({ viewport: { width: 1280, height: 800 } });
    const scrollAvant = await page.evaluate(() => window.scrollY);

    // a) Le geste de Doriane : un clic dans le champ de l'image, puis le clavier — sans « Écrire ».
    vider();
    await page.mouse.click(centre.x, centre.y);
    await page.keyboard.type('ab1');
    await attendre(150);
    ok(recus.some((m) => m.t === 'toucher' && m.type === 'debut') && recus.some((m) => m.t === 'toucher' && m.type === 'fin'), 'le clic part toujours (début puis fin)');
    ok(textes() === 'ab1', `clic dans l'image puis frappe : le texte part (« ${textes()} » reçu, « ab1 » attendu)`);
    ok(await champActif(), 'après le clic, le champ caché a le clavier');

    // b) « Écrire », une lettre, un clic dans l'image (un autre champ), la suite : rien n'est perdu.
    vider();
    await page.click('#ecrire');
    await page.keyboard.type('x');
    await page.mouse.click(centre.x, centre.y + 60);
    await page.keyboard.type('yz');
    await attendre(150);
    ok(textes() === 'xyz', `« Écrire », frappe, clic dans l'image, frappe : tout part (« ${textes()} » reçu, « xyz » attendu)`);

    // c) Entrée et effacer après un clic (valider un code, corriger une faute).
    vider();
    await page.mouse.click(centre.x, centre.y);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    await attendre(150);
    ok(touches().includes('Backspace') && touches().includes('Enter'), `effacer et Entrée partent après un clic (${touches().join(', ') || 'rien'})`);

    // d) Un code collé (Ctrl+V depuis la boîte mail) après un clic : il part entier.
    vider();
    await page.mouse.click(centre.x, centre.y);
    await page.keyboard.insertText('123456');
    await attendre(150);
    ok(textes() === '123456', `code collé après un clic : il part entier (« ${textes()} »)`);

    ok(await page.evaluate(() => window.scrollY) === scrollAvant, 'la page ne défile pas au clic');
    // e) « Fermer » reste un bouton ordinaire : le clic le prend (le clavier n'est pas retenu de force).
    await page.click('#fermer');
    ok(await page.evaluate(() => document.activeElement?.id === 'fermer'), 'un clic sur un bouton de l\'écran lui donne le focus, comme avant');
    await ctx.close();
  }

  console.log('2. Téléphone (doigt) : rien ne change');
  {
    vider();
    const { ctx, page, centre, champActif } = await ouvrirPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    vider();
    await page.touchscreen.tap(centre.x, centre.y);
    await attendre(150);
    ok(recus.some((m) => m.t === 'toucher' && m.type === 'debut') && recus.some((m) => m.t === 'toucher' && m.type === 'fin'), 'le toucher part (début puis fin)');
    ok(!(await champActif()), 'un toucher dans l\'image n\'ouvre JAMAIS le clavier du téléphone');
    await page.locator('#ecrire').tap();
    ok(await champActif(), '« Écrire » ouvre le clavier');
    await page.touchscreen.tap(centre.x, centre.y + 40);
    await attendre(100);
    ok(await champActif(), 'un toucher dans l\'image garde le clavier ouvert (comme avant)');
    vider();
    await page.keyboard.type('k9');
    await attendre(150);
    ok(textes() === 'k9', `la frappe au téléphone part (« ${textes()} »)`);
    await ctx.close();
  }
} finally {
  await nav.close().catch(() => {});
  wss.close(); http.close();
}

console.log(`\n${n - ko}/${n} vérifications`);
process.exit(ko ? 1 : 0);
