// ============================================================================
// EXPORT DES VENTES D'UN COMPTE EN PDF (2026-09-26)
// ============================================================================
// Première demande : Joséphine (26/09), qui voulait « l'export des ventes
// réalisées » pour vérifier elle-même ce qui a été vendu. Outil de support,
// jamais livré dans l'app : il lit la base EN PROD (lecture seule) et écrit un
// PDF dans build/exports/ (ignoré par git — un export porte des données
// personnelles, il ne va JAMAIS dans le dépôt).
//
//     node scripts/emails/export-ventes-pdf.mjs --user <uuid> [--sortie <fichier.pdf>]
//
// CE QUE LE PDF MONTRE, ET RIEN D'AUTRE : date, article, plateforme, prix.
// Aucun identifiant interne (ni id de vente, ni id de fiche, ni référence de
// commande). La date est celle que l'app affiche : `date`, à défaut le jour de
// saisie (`created_at`, heure de Paris) — même règle que mapSale (App.jsx).
// ============================================================================
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function arg(nom) {
  const i = process.argv.indexOf(`--${nom}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const userId = arg('user') ?? '';
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
  console.error('usage : node scripts/emails/export-ventes-pdf.mjs --user <uuid> [--sortie <fichier.pdf>]');
  process.exit(1);
}
const aujourdhui = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
const sortie = path.resolve(arg('sortie') ?? path.join(RACINE, 'build', 'exports', `ventes-${aujourdhui}.pdf`));

// ── Lecture (Management API, lecture seule) ───────────────────────────────────
// L'uuid est validé ci-dessus : il ne peut rien porter d'autre qu'un uuid.
const sql = `
  select to_char(coalesce(v.date, (v.created_at at time zone 'Europe/Paris')::date), 'YYYY-MM-DD') as jour,
         v.titre, v.plateforme, v.prix_vente, v.devise
    from public.ventes v
   where v.user_id = '${userId}'
   order by coalesce(v.date, (v.created_at at time zone 'Europe/Paris')::date) desc,
            v.created_at desc, v.id desc`;
// Le SQL passe par l'entrée standard : en argument, le shell Windows le coupe
// aux guillemets.
const brut = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '--output-format', 'json'], {
  cwd: RACINE, shell: true, encoding: 'utf8', input: sql, stdio: ['pipe', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024,
});
const ventes = JSON.parse(brut.slice(brut.indexOf('{'))).rows;
if (!ventes.length) {
  console.error('aucune vente pour ce compte — rien à exporter');
  process.exit(1);
}

// ── Mise en forme ─────────────────────────────────────────────────────────────
const PLATEFORMES = {
  vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', ebay: 'eBay', opla: 'Opla',
  ailleurs: 'Ailleurs', autre: 'Ailleurs',
};
const plateforme = (p) => {
  const k = String(p ?? '').trim().toLowerCase();
  if (!k) return '—';
  return PLATEFORMES[k] ?? (k.charAt(0).toUpperCase() + k.slice(1));
};
const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const prix = (v) => (v == null || v === '' ? '—' : euros.format(Number(v)));
const dateFr = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const echapper = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const devises = new Set(ventes.map((v) => (v.devise ?? 'EUR').toUpperCase()));
if (devises.size > 1 || !devises.has('EUR')) {
  // Un total en euros sur des montants en livres serait faux : on s'arrête.
  console.error(`devises mêlées (${[...devises].join(', ')}) — export à reprendre à la main`);
  process.exit(1);
}

const parAnnee = new Map();
for (const v of ventes) {
  const an = (v.jour ?? '').slice(0, 4) || '—';
  if (!parAnnee.has(an)) parAnnee.set(an, []);
  parAnnee.get(an).push(v);
}
const total = ventes.reduce((s, v) => s + (v.prix_vente == null ? 0 : Number(v.prix_vente)), 0);
const premier = ventes[ventes.length - 1].jour;
const dernier = ventes[0].jour;

const logo = (await sharp(path.join(RACINE, 'public', 'logo.png')).resize(112, 112).png().toBuffer()).toString('base64');
const police = (f) => pathToFileURL(path.join(RACINE, 'scripts', 'emails', 'fonts', f)).href;

const lignes = [...parAnnee.entries()].map(([an, liste]) => `
    <tr class="annee"><td colspan="4">${echapper(an)}</td></tr>
    ${liste.map((v) => `
    <tr>
      <td class="date">${dateFr(v.jour)}</td>
      <td class="article">${echapper(v.titre || 'Article sans titre')}</td>
      <td class="plateforme">${echapper(plateforme(v.plateforme))}</td>
      <td class="prix">${prix(v.prix_vente)}</td>
    </tr>`).join('')}`).join('');

const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Historique des ventes — FillSell</title>
<style>
  @font-face { font-family: 'Heros'; src: url('${police('texgyreheros-regular.otf')}'); font-weight: 400; }
  @font-face { font-family: 'Heros'; src: url('${police('texgyreheros-bold.otf')}'); font-weight: 700; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Heros', Arial, sans-serif; color: #0D0D0D; font-size: 10.5pt; }
  header { display: flex; align-items: center; gap: 14px; padding-bottom: 14px; border-bottom: 2px solid #1D9E75; }
  header img { width: 44px; height: 44px; border-radius: 10px; }
  .marque { font-weight: 700; font-size: 18pt; letter-spacing: -0.2px; }
  .marque span { color: #1D9E75; }
  h1 { font-size: 15pt; margin: 18px 0 4px; }
  .sous-titre { color: #6B7280; font-size: 10pt; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.6px;
             color: #6B7280; font-weight: 700; padding: 6px 8px; border-bottom: 1px solid #EAE7E1; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  td { padding: 6px 8px; border-bottom: 1px solid #EFEDE8; vertical-align: top; }
  tr.annee td { background: #F4F9F7; color: #17835F; font-weight: 700; font-size: 10pt;
                padding-top: 8px; padding-bottom: 6px; border-bottom: 1px solid #EAE7E1; }
  td.date { white-space: nowrap; color: #3A3A38; width: 84px; }
  td.plateforme { white-space: nowrap; width: 96px; color: #3A3A38; }
  th.prix, td.prix { text-align: right; white-space: nowrap; width: 80px; }
  td.prix { font-weight: 700; }
  .total { margin-top: 14px; display: flex; justify-content: flex-end; gap: 24px; font-size: 11pt;
           padding: 10px 8px; border-top: 2px solid #1D9E75; }
  .total b { font-weight: 700; }
</style></head>
<body>
  <header>
    <img src="data:image/png;base64,${logo}" alt="">
    <div class="marque">Fill<span>Sell</span></div>
  </header>
  <h1>Historique des ventes</h1>
  <p class="sous-titre">Du ${dateFr(premier)} au ${dateFr(dernier)} · édité le ${dateFr(aujourdhui)}</p>
  <table>
    <thead><tr><th>Date</th><th>Article</th><th>Plateforme</th><th class="prix">Prix</th></tr></thead>
    <tbody>${lignes}
    </tbody>
  </table>
  <div class="total"><span>${ventes.length} ventes</span><span>Total <b>${prix(total)}</b></span></div>
</body></html>`;

fs.mkdirSync(path.dirname(sortie), { recursive: true });
// Le Chrome installé, comme les autres rendus du dépôt (les binaires de
// Playwright ne suivent pas toujours sa version).
const navigateur = await chromium.launch({ channel: 'chrome' });
try {
  const page = await navigateur.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.pdf({
    path: sortie,
    format: 'A4',
    printBackground: true,
    margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' },
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="width:100%;font-size:7.5pt;color:#9A9A94;padding:0 14mm;display:flex;justify-content:space-between;font-family:Arial,sans-serif">
      <span>FillSell · fillsell.app</span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  });
} finally {
  await navigateur.close();
}
console.log(JSON.stringify({ sortie, ventes: ventes.length, du: premier, au: dernier, octets: fs.statSync(sortie).size }));
