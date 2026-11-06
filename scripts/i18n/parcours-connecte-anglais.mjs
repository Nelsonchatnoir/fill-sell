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
import { webkit, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DOSSIER = process.argv[2] ?? 'build/captures-anglais-connecte';
const EMAIL = process.env.FS_EMAIL;
const MDP = process.env.FS_MDP;
if (!EMAIL || !MDP) {
  console.error('FS_EMAIL et FS_MDP sont requis (voir l’en-tête du script) — le mot de passe n’est jamais écrit nulle part.');
  process.exit(2);
}
mkdirSync(DOSSIER, { recursive: true });
// Des mots SEULEMENT français : un seul suffit à signaler la phrase. Les noms de plateformes et de marques n'y sont pas.
const MOTS_FR = /\b(le|la|les|des|une|avec|pour|est|sont|ton|ta|tes|votre|vos|connexion|mot de passe|annonce|annonces|vendu|vente|ventes|abonnement|réglages|bienvenue|merci|tout|aucun|plateforme|plateformes|publier|republier|ajouter|retirer|enregistrer|fermer|annuler|valider)\b/i;
// Un bouton qui AGIT n'est jamais cliqué (publication, retrait, achat, suppression, déconnexion…).
const INTERDIT = /publish|post|repost|bump|remove|withdraw|delete|buy|subscribe|pay|start|try|sign out|log out|disconnect|sync|confirm|save|send|import|export|scan|lens/i;

const navigateur = await webkit.launch();
const contexte = await navigateur.newContext({ ...devices['iPhone 15'], locale: 'en-US', timezoneId: 'Europe/Paris' });
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
  await page.goto('https://fillsell.app/login', { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
  const refuser = page.getByRole('button', { name: /refuser|reject|decline/i }).first();
  if (await refuser.isVisible().catch(() => false)) await refuser.click().catch(() => {});
  await capturer('connexion');
  await page.locator('input[type=email]').first().fill(EMAIL);
  await page.locator('input[type=password]').first().fill(MDP);
  await page.locator('input[type=password]').first().press('Enter');
  await page.waitForURL(/\/app/, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await capturer('accueil');
  // Les onglets de la barre du bas, un par un (on lit, on n'agit pas).
  const onglets = await page.locator('nav button, nav a, [role=tablist] [role=tab]').all();
  for (let i = 0; i < onglets.length && i < 8; i++) {
    const libelle = ((await onglets[i].innerText().catch(() => '')) || (await onglets[i].getAttribute('aria-label').catch(() => '')) || `onglet-${i}`).trim();
    if (!libelle || INTERDIT.test(libelle)) continue;
    await onglets[i].click({ timeout: 5000 }).catch(() => {});
    await capturer(`onglet-${libelle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24) || i}`);
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
}
writeFileSync(join(DOSSIER, 'bilan.json'), JSON.stringify({ le: new Date().toISOString(), compte: EMAIL, bilan }, null, 2));
console.log(`Captures : ${DOSSIER} — envoie le dossier à Claude (il relit chaque mot).`);
