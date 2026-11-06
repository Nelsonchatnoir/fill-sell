// (06/11/2026, lot « Prêt à soumettre », point 1) LA PREUVE DU PARCOURS CONNECTÉ EN ANGLAIS — à lancer par NICO, qui
// tape lui-même le mot de passe du compte de démonstration (Claude n'en saisit jamais) : navigateur ISOLÉ (WebKit au
// format iPhone, réglé en anglais, profil jetable — jamais le Chrome de Nico : sa session et son extension ne sont pas
// touchées), LECTURE SEULE (on ouvre des onglets et des feuilles, on ne clique jamais un bouton qui agit).
// Chaque écran : une capture et les phrases où un mot français est repéré. Bilan : <dossier>/bilan.json.
//
//   PowerShell (fenêtre de Nico) :
//     $env:FS_EMAIL = "test@fillsell.app"; $env:FS_MDP = Read-Host "Mot de passe"
//     node scripts/i18n/parcours-connecte-anglais.mjs
//   Sortie : build/captures-anglais-connecte/ (ignoré par git).
//
// (06/11, ordre de Nico « par un lien à usage unique généré côté serveur, sans mot de passe ») SANS mot de passe :
//     node scripts/i18n/parcours-connecte-anglais.mjs --lien-demo
//   La session du SEUL compte de démo test@fillsell.app (d6a9e726-…, relecture Apple) : lien de connexion à usage unique
//   généré par l'API d'administration (clés lues par la CLI Supabase, jamais affichées ni écrites), vérifié aussitôt,
//   posé dans le stockage du navigateur ISOLÉ seulement, puis révoqué à la fin. Garde-fou : adresse ET identifiant
//   figés ici — tout autre compte est refusé. Aucun mail n'est envoyé (le lien n'est pas posté, il est consommé ici).
import { webkit, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const LIEN_DEMO = process.argv.includes('--lien-demo');
const DOSSIER = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'build/captures-anglais-connecte';
const REF = 'tojihnuawsoohlolangc';
const URL_BASE = `https://${REF}.supabase.co`;
const DEMO = { email: 'test@fillsell.app', id: 'd6a9e726-b6f1-4b7f-a927-2487668d6d96' };
const EMAIL = LIEN_DEMO ? DEMO.email : process.env.FS_EMAIL;
const MDP = process.env.FS_MDP;
if (!LIEN_DEMO && (!EMAIL || !MDP)) {
  console.error('FS_EMAIL et FS_MDP sont requis (voir l’en-tête du script) — le mot de passe n’est jamais écrit nulle part.');
  process.exit(2);
}

/** La session du compte de démo, sans mot de passe ; rien n'est affiché ni écrit. Refus sur tout autre compte. */
async function sessionDemo() {
  const r = spawnSync('npx', ['supabase', 'projects', 'api-keys', '--project-ref', REF, '-o', 'json'], { encoding: 'utf8', shell: process.platform === 'win32' });
  let cles = [];
  try { cles = JSON.parse(r.stdout); } catch { /* rien */ }
  const service = cles.find((k) => k.name === 'service_role')?.api_key;
  const anon = cles.find((k) => k.name === 'anon')?.api_key;
  if (!service || !anon) throw new Error('clés Supabase illisibles par la CLI (npx supabase login ?)');
  const g = await fetch(`${URL_BASE}/auth/v1/admin/generate_link`, {
    method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email: DEMO.email }),
  });
  const lien = await g.json().catch(() => ({}));
  const idLien = lien.id ?? lien.user?.id;
  if (!g.ok || idLien !== DEMO.id || (lien.email ?? lien.user?.email) !== DEMO.email || !lien.hashed_token) {
    throw new Error(`lien refusé (HTTP ${g.status}) : ce n'est pas le compte de démo — ARRÊT`);
  }
  const v = await fetch(`${URL_BASE}/auth/v1/verify`, {
    method: 'POST', headers: { apikey: anon, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: lien.hashed_token }),
  });
  const session = await v.json().catch(() => ({}));
  if (!v.ok || session.user?.id !== DEMO.id || !session.access_token || !session.refresh_token) {
    throw new Error(`vérification du lien refusée (HTTP ${v.status}) — ARRÊT`);
  }
  session.expires_at ??= Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600);
  return { session, anon };
}
const demo = LIEN_DEMO ? await sessionDemo() : null;
if (demo) console.log(`session du compte de démo ${DEMO.email} (${DEMO.id.slice(0, 8)}…) obtenue sans mot de passe — jamais affichée`);
mkdirSync(DOSSIER, { recursive: true });
// Des mots SEULEMENT français : un seul suffit à signaler la phrase. Les noms de plateformes et de marques n'y sont pas.
const MOTS_FR = /\b(le|la|les|des|une|avec|pour|est|sont|ton|ta|tes|votre|vos|connexion|mot de passe|annonce|annonces|vendu|vente|ventes|abonnement|réglages|bienvenue|merci|tout|aucun|plateforme|plateformes|publier|republier|ajouter|retirer|enregistrer|fermer|annuler|valider)\b/i;
// Un bouton qui AGIT n'est jamais cliqué (publication, retrait, achat, suppression, déconnexion…).
const INTERDIT = /publish|post|repost|bump|remove|withdraw|delete|buy|subscribe|pay|start|try|sign out|log out|disconnect|sync|confirm|save|send|import|export|scan|lens/i;

const navigateur = await webkit.launch();
const contexte = await navigateur.newContext({ ...devices['iPhone 15'], locale: 'en-US', timezoneId: 'Europe/Paris' });
if (demo) {
  // La session va au stockage de l'origine fillsell.app du navigateur ISOLÉ (clé de supabase-js), une seule fois ;
  // l'app en anglais (fs_lang, comme le réglage de l'app).
  await contexte.addInitScript(({ cle, valeur }) => {
    if (location.origin !== 'https://fillsell.app') return;
    if (!localStorage.getItem(cle)) localStorage.setItem(cle, valeur);
    localStorage.setItem('fs_lang', 'en');
  }, { cle: `sb-${REF}-auth-token`, valeur: JSON.stringify(demo.session) });
}
const page = await contexte.newPage();
page.on('dialog', (d) => d.dismiss().catch(() => {}));
const bilan = [];
let n = 0;
async function capturer(nom) {
  await page.waitForTimeout(1800);
  const texte = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
  const phrases = texte.split(/(?<=[.!?…])\s+|\n/).map((s) => s.trim()).filter((s) => s && MOTS_FR.test(s)).slice(0, 15);
  const fichier = `${String(++n).padStart(2, '0')}-${nom}.png`;
  await page.screenshot({ path: join(DOSSIER, fichier), fullPage: true });
  bilan.push({ ecran: nom, fichier, francais: phrases });
  console.log(`${phrases.length ? '✗' : '✓'} ${fichier}${phrases.length ? ` — ${phrases.length} phrase(s) en français : ${phrases.slice(0, 3).join(' | ').slice(0, 240)}` : ''}`);
}
try {
  await page.goto(demo ? 'https://fillsell.app/app' : 'https://fillsell.app/login', { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
  const refuser = page.getByRole('button', { name: /refuser|reject|decline/i }).first();
  if (await refuser.isVisible().catch(() => false)) await refuser.click().catch(() => {});
  if (!demo) {
    await capturer('connexion');
    await page.locator('input[type=email]').first().fill(EMAIL);
    await page.locator('input[type=password]').first().fill(MDP);
    await page.locator('input[type=password]').first().press('Enter');
  }
  await page.waitForURL(/\/app/, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await capturer('accueil');
  // Les onglets de la barre du bas, un par un (on lit, on n'agit pas). (06/11) La barre n'est pas un <nav> : ses
  // libellés anglais, cliqués par leur texte exact ; Lens (l'appareil photo) n'est jamais ouvert.
  const onglets = await page.locator('nav button, nav a, [role=tablist] [role=tab]').all();
  for (let i = 0; i < onglets.length && i < 8; i++) {
    const libelle = ((await onglets[i].innerText().catch(() => '')) || (await onglets[i].getAttribute('aria-label').catch(() => '')) || `onglet-${i}`).trim();
    if (!libelle || INTERDIT.test(libelle)) continue;
    await onglets[i].click({ timeout: 5000 }).catch(() => {});
    await capturer(`onglet-${libelle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24) || i}`);
  }
  for (const libelle of ['AI Stock', 'Sales', 'Stats', 'Board']) {
    const o = page.getByText(libelle, { exact: true }).last();
    if (!(await o.isVisible().catch(() => false))) continue;
    await o.click({ timeout: 5000 }).catch(() => {});
    await capturer(`onglet-${libelle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
  }
  // Les réglages (la roue dentée), lus puis refermés.
  const roue = page.locator('button[aria-label*="etting" i], button[aria-label*="églages" i], button[title*="etting" i]').first();
  if (await roue.isVisible().catch(() => false)) {
    await roue.click().catch(() => {});
    await capturer('reglages');
    await page.keyboard.press('Escape').catch(() => {});
    await page.getByText('Board', { exact: true }).last().click({ timeout: 5000 }).catch(() => {});
  }
  // La feuille des formules (badge du forfait), puis on la referme.
  const badge = page.getByRole('button', { name: /premium|free|pro|business|plan/i }).first();
  if (await badge.isVisible().catch(() => false)) {
    await badge.click().catch(() => {});
    await capturer('feuille-des-formules');
    await page.keyboard.press('Escape').catch(() => {});
  }
} finally {
  await contexte.close();
  await navigateur.close();
  // La session du lien ne survit pas à l'essai : révoquée (celle-ci seulement, scope local).
  if (demo) {
    const r = await fetch(`${URL_BASE}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: demo.anon, Authorization: `Bearer ${demo.session.access_token}` } }).catch(() => null);
    console.log(`session du lien révoquée : ${r?.ok ? 'oui' : `NON (HTTP ${r?.status ?? '—'}) — elle expire seule`}`);
  }
}
writeFileSync(join(DOSSIER, 'bilan.json'), JSON.stringify({ le: new Date().toISOString(), compte: EMAIL, bilan }, null, 2));
console.log(`Captures : ${DOSSIER} — envoie le dossier à Claude (il relit chaque mot).`);
