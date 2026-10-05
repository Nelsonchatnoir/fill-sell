// LES MAILS FRANÇAIS DU PARC, RENDUS AVANT / APRÈS (05/10/2026, mail « paiement échoué »).
//
//     node scripts/cloud/mails-fr-identiques.mjs --avant <ref git> [--apres <ref git> | --apres-dossier <dossier _shared>]
//
// --avant b38d842 : les modules _shared tels qu'ils tournent en prod avant le lot
//   (email-tunnel v69, relu par `functions download` : identique à b38d842) ;
// --apres <ref> (HEAD par défaut) ou --apres-dossier : le dossier `_shared` d'un
//   `npx supabase functions download email-tunnel --use-api` (le code DÉPLOYÉ).
//
// Rend 14 mails FRANÇAIS que le parc reçoit (bienvenue, comment ça marche, lien
// de l'extension, relances 1 et 2, résiliation, ventes, gabarit nu — avec et
// sans lien de désinscription) par les deux versions, et exige l'identité
// OCTET POUR OCTET. Le mail « paiement échoué » est hors de cette liste : c'est
// lui qui change. En anglais, seul le pied doit changer (dit, pas exigé).
// Sans réseau ni base : les modules sont copiés dans build/ (ignoré par git).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
const MODULES = ['email-template.ts', 'emails-fillsell.ts', 'plateformes.ts', 'paiement-echoue.js'];

const BASE = join(ROOT, 'build', 'mails-fr-identiques');
function depuisGit(ref, nom) {
  const dir = join(BASE, nom);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const m of MODULES) {
    try { fs.writeFileSync(join(dir, m), git('show', `${ref}:supabase/functions/_shared/${m}`)); } catch { /* absent à cette version */ }
  }
  return dir;
}
function depuisDossier(src, nom) {
  const dir = join(BASE, nom);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const m of MODULES) if (fs.existsSync(join(src, m))) fs.copyFileSync(join(src, m), join(dir, m));
  return dir;
}

const avantRef = arg('--avant');
if (!avantRef) { console.log('Usage : --avant <ref> [--apres <ref> | --apres-dossier <dossier _shared>]'); process.exit(2); }
const dAvant = depuisGit(avantRef, 'avant');
const dApres = arg('--apres-dossier') ? depuisDossier(arg('--apres-dossier'), 'apres') : depuisGit(arg('--apres') ?? 'HEAD', 'apres');

const charger = async (dir) => ({
  E: await import(pathToFileURL(join(dir, 'emails-fillsell.ts')).href),
  T: await import(pathToFileURL(join(dir, 'email-template.ts')).href),
});
const A = await charger(dAvant);
const B = await charger(dApres);

const DESINSCRIPTION = 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/email-desinscription?t=apercu';
const RELANCE = { titres: ['Veste en jean Levi’s', 'Lot de 3 livres', 'Lampe', 'Robe'], plateformes: ['vinted', 'leboncoin'], depuis: '2026-10-03T08:12:00Z' };
const scenes = (lang) => [
  ['bienvenue', ({ E }) => E.mailBienvenue(lang)],
  ['bienvenue + désinscription', ({ E }) => E.mailBienvenue(lang, DESINSCRIPTION)],
  ['comment ça marche', ({ E }) => E.mailCommentCaMarche(lang)],
  ['comment ça marche + désinscription', ({ E }) => E.mailCommentCaMarche(lang, DESINSCRIPTION)],
  ['lien de l’extension', ({ E }) => E.mailLienExtension(lang)],
  ['relance 1', ({ E }) => E.mailRelanceJobs(1, RELANCE, lang)],
  ['relance 2', ({ E }) => E.mailRelanceJobs(2, { ...RELANCE, extensionVueLe: '2026-09-28T19:40:00Z' }, lang)],
  ['relance 1, sans titre', ({ E }) => E.mailRelanceJobs(1, { titres: [], plateformes: ['beebs'], depuis: '2026-10-04T21:00:00Z' }, lang)],
  ['résiliation Premium', ({ E }) => E.mailResiliation({ formule: 'Premium', demandeLe: '2026-10-05T09:30:00Z', finAcces: '2026-10-31T22:59:00Z' }, lang)],
  ['résiliation Business, fin inconnue', ({ E }) => E.mailResiliation({ formule: 'Business', demandeLe: '2026-10-05T09:30:00Z', finAcces: null }, lang)],
  ['ventes (1, bénéfice)', ({ E }) => E.mailVentes({ ventes: [{ titre: 'Veste', plateforme: 'vinted', prixVente: 35, benefice: 22 }], retraitsACliquer: 2, retraitsBeebsAuto: 1 }, lang)],
  ['ventes (3, prix d’achat inconnu)', ({ E }) => E.mailVentes({ ventes: [
    { titre: 'Lampe', plateforme: 'leboncoin', prixVente: 20, benefice: null },
    { titre: null, plateforme: 'ebay', prixVente: 12, benefice: 4 },
    { titre: 'Robe', plateforme: 'beebs', prixVente: 9, benefice: null }], retraitsACliquer: 0, retraitsBeebsAuto: 0 }, lang)],
  ['gabarit nu', ({ T }) => ({ sujet: '', html: T.renderEmail({ titre: 'Bonjour', corps: [T.paragraphe('Un texte.')], langue: lang }) })],
  ['gabarit + désinscription + raison', ({ T }) => ({ sujet: '', html: T.renderEmail({ titre: 'Bonjour', surtitre: 'FillSell', preheader: 'Aperçu', corps: [T.paragraphe('Un texte.'), T.boutonPrincipal('Ouvrir', 'https://fillsell.app')], raisonEnvoi: 'Tu reçois ce mail parce que…', lienDesinscription: DESINSCRIPTION, langue: lang }) })],
];

let ko = 0;
console.log(`Avant : ${avantRef} · Après : ${arg('--apres-dossier') ?? arg('--apres') ?? 'HEAD'}\n\nFrançais (identité exigée) :`);
for (const [nom, f] of scenes('fr')) {
  const a = f(A), b = f(B);
  const same = a.sujet === b.sujet && a.html === b.html;
  if (!same) ko++;
  console.log(`  ${same ? '✓' : '✗'} ${nom}${same ? '' : ` (sujet ${a.sujet === b.sujet ? '=' : '≠'}, html ${a.html.length} → ${b.html.length} car.)`}`);
}
console.log('\nAnglais (pour information : seul le pied doit changer) :');
for (const [nom, f] of scenes('en')) {
  const a = f(A), b = f(B);
  const same = a.sujet === b.sujet && a.html === b.html;
  console.log(`  ${same ? '=' : '≠'} ${nom}${same ? '' : ` (sujet ${a.sujet === b.sujet ? '=' : '≠'}, pied français avant : ${/Mentions légales|Confidentialité/.test(a.html) ? 'oui' : 'non'}, après : ${/Mentions légales|Confidentialité/.test(b.html) ? 'oui' : 'non'})`}`);
}
console.log(ko ? `\n${ko} MAIL(S) FRANÇAIS DIFFÉRENT(S)` : '\n14 mails français identiques octet pour octet.');
process.exit(ko ? 1 : 0);
