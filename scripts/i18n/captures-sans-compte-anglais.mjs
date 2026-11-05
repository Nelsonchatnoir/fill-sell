// (05/11 soir, lot « Ouverture du Cloud », phase 3 point 1) CE QUE CLAUDE PEUT PROUVER SANS COMPTE : les écrans publics de
// fillsell.app dans un navigateur ISOLÉ (WebKit, format iPhone, réglé en anglais, profil jetable, aucune connexion, aucun
// mot de passe) — page de connexion / inscription, page de retour du paiement, paiement annulé, conditions, mot de passe
// oublié. Chaque page : une capture et la liste des mots français repérés dans le texte affiché.
//   node scripts/i18n/captures-sans-compte-anglais.mjs [dossier]     (défaut : build/captures-anglais)
import { webkit, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DOSSIER = process.argv[2] ?? 'build/captures-anglais';
mkdirSync(DOSSIER, { recursive: true });
const PAGES = [
  ['connexion', 'https://fillsell.app/login'],
  ['retour-paiement-cloud-essai', 'https://fillsell.app/success?produit=cloud&essai=1'],
  ['retour-paiement-premium', 'https://fillsell.app/success?produit=standard'],
  ['paiement-annule', 'https://fillsell.app/cancel'],
  ['mot-de-passe', 'https://fillsell.app/reset-password'],
  ['legal', 'https://fillsell.app/legal'],
];
// Des mots SEULEMENT français (jamais anglais) : un seul suffit à signaler la page.
const MOTS_FR = /\b(le|la|les|des|une|avec|pour|est|sont|ton|ta|tes|votre|vos|connexion|mot de passe|inscription|réessaie|paiement|abonnement|annulé|bienvenue|merci|accéder|retour|tout|aucun)\b/i;

const navigateur = await webkit.launch();
const contexte = await navigateur.newContext({ ...devices['iPhone 15'], locale: 'en-US', timezoneId: 'America/New_York' });
const bilan = [];
try {
  for (const [nom, url] of PAGES) {
    const page = await contexte.newPage();
    // Le bandeau des traceurs : refusé (jamais accepté pour une preuve).
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const refuser = page.getByRole('button', { name: /refuser|reject|decline/i }).first();
    if (await refuser.isVisible().catch(() => false)) await refuser.click().catch(() => {});
    const texte = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
    const phrases = texte.split(/(?<=[.!?…])\s+|\n/).map((s) => s.trim()).filter((s) => s && MOTS_FR.test(s)).slice(0, 12);
    await page.screenshot({ path: join(DOSSIER, `${nom}.png`), fullPage: false });
    bilan.push({ nom, url, francais: phrases });
    console.log(`${phrases.length ? '✗' : '✓'} ${nom}${phrases.length ? ` — ${phrases.length} phrase(s) en français : ${phrases.slice(0, 3).join(' | ').slice(0, 220)}` : ' — aucun mot de français repéré'}`);
    await page.close();
  }
} finally {
  await contexte.close();
  await navigateur.close();
}
writeFileSync(join(DOSSIER, 'bilan.json'), JSON.stringify({ le: new Date().toISOString(), bilan }, null, 2));
console.log(`Captures : ${DOSSIER}`);
