// BANC « OUVERTURE DE LA FICHE » (31/10) — 4. l'enregistrement de la fiche, de bout en bout, sur le code construit.
// node scripts/banc-fiche/enregistrer.mjs <dist> <motif du titre>
// Toucher une carte → la fiche s'ouvre (bloc « En ligne depuis » compris) → modifier le nom et l'emplacement → « Enregistrer »
// → ce que l'app ENVOIE (le faux client note chaque écriture, rien n'atteint la base) et ce que la carte montre ensuite.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const DEPOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { chromium, devices } = await import(pathToFileURL(path.join(DEPOT, 'node_modules/playwright/index.mjs')).href);
const [dist, motif = 'Veste'] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const serveur = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(dist, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const port = serveur.address().port;
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'fr-FR', timezoneId: 'Europe/Paris' });
await ctx.route('**/*', (r) => (r.request().url().startsWith(`http://127.0.0.1:${port}`) || ['image', 'font'].includes(r.request().resourceType()) ? r.continue() : r.abort()));
const p = await ctx.newPage();
p.setDefaultTimeout(60000);
const erreurs = [];
p.on('pageerror', (e) => erreurs.push(String(e.message).slice(0, 160)));
await p.goto(`http://127.0.0.1:${port}/app?n=0`);
await p.waitForTimeout(6000);
const refuser = p.getByRole('button', { name: 'Refuser' });
if (await refuser.count()) await refuser.first().click();
await p.getByText(/^Stock/).last().click();
await p.waitForSelector('button[aria-label^="Modifier "]');
const recherche = p.getByPlaceholder('Rechercher un article');
if (await recherche.count()) { await recherche.first().fill(motif); await p.waitForTimeout(1500); }
const carte = p.locator(`button[aria-label^="Modifier "][aria-label*="${motif}"]`).first();
const titreAvant = (await carte.getAttribute('aria-label')).replace(/^Modifier /, '');
await carte.tap();
await p.waitForTimeout(800);
const bloc = await p.evaluate(() => document.body.innerText.includes('EN LIGNE DEPUIS') || document.body.innerText.includes('En ligne depuis'));
const nom = p.locator('textarea').first();
const nouveauNom = `${titreAvant} (banc)`;
await nom.fill(nouveauNom);
const emplacement = p.getByPlaceholder(/Étagère|Ex: Étagère|Carton|emplacement/i).first();
let emplacementOk = false;
if (await emplacement.count()) { await emplacement.fill('Banc A1'); emplacementOk = true; }
await p.evaluate(() => { window.__ecritures = []; });
await p.getByRole('button', { name: 'Enregistrer' }).first().click();
await p.waitForTimeout(1500);
const ecritures = await p.evaluate(() => window.__ecritures ?? []);
const maj = ecritures.find((e) => e.table === 'inventaire' && e.op === 'update');
const ficheFermee = await p.evaluate(() => !document.evaluate("//*[text()=\"Modifier l'article\"]", document, null, 9, null).singleNodeValue);
const carteApres = await p.locator(`button[aria-label^="Modifier "][aria-label*="(banc)"]`).count();
console.log(JSON.stringify({
  fiche_ouverte_avec_bloc_en_ligne: bloc,
  envoye: maj ? { titre: maj.valeur?.titre, emplacement: maj.valeur?.emplacement, champs: Object.keys(maj.valeur ?? {}).length } : null,
  nom_attendu: nouveauNom, emplacement_saisi: emplacementOk, fiche_fermee: ficheFermee, carte_a_jour: carteApres > 0,
  dates_jamais_envoyees: !JSON.stringify(ecritures).includes('_datesEnLigne'), erreurs,
}, null, 1));
await b.close();
serveur.close();
