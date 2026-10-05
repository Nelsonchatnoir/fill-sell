// Déploie les fonctions edge de FillSell Cloud SANS JAMAIS CHANGER leur
// verify_jwt (règle CLAUDE.md : « c'est l'appelant qui décide », un déploiement
// sans --no-verify-jwt remet true et le webhook tombe en 401 en silence).
//
//   node scripts/cloud/deployer-fonctions-cloud.mjs            plan seulement (lecture)
//   node scripts/cloud/deployer-fonctions-cloud.mjs --go       déploie, une par une
//
// Pour chaque fonction : lit l'état RÉEL (version, verify_jwt) par
// `supabase functions list`, déploie avec le MÊME verify_jwt, relit, et
// S'ARRÊTE à la première différence (verify_jwt changé, version qui ne monte pas).
// À lancer depuis le dossier PRINCIPAL, sur main à jour (jamais un worktree).
import { execFileSync } from 'node:child_process';

const PROJET = 'tojihnuawsoohlolangc';
// L'ordre compte : les fonctions qui ÉCRIVENT les colonnes Cloud d'abord, celles
// qui les proposent ensuite. Le verify_jwt attendu (relu le 05/10) est un garde-fou
// de plus : un écart avec la prod arrête tout AVANT le premier déploiement.
export const FONCTIONS = [
  ['stripe-webhook', false],
  ['apple-iap-webhook', false],
  ['google-play-webhook', false],
  ['validate-apple-receipt', true],
  ['validate-google-purchase', true],
  ['cancel-subscription', true],
  ['create-checkout-session', true],
  ['get-pending-jobs', true],
  ['email-tunnel', false],
];

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const lister = () => {
  const brut = execFileSync(npx, ['supabase', 'functions', 'list', '--project-ref', PROJET, '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  return new Map(JSON.parse(brut).map((f) => [f.slug, { version: f.version, verify_jwt: f.verify_jwt }]));
};

const go = process.argv.includes('--go');
const avant = lister();
let ecart = false;
console.log('Fonction                     version  verify_jwt (prod)  attendu');
for (const [nom, attendu] of FONCTIONS) {
  const f = avant.get(nom);
  const ok = f && f.verify_jwt === attendu;
  if (!ok) ecart = true;
  console.log(`${nom.padEnd(28)} ${String(f?.version ?? '—').padStart(7)}  ${String(f?.verify_jwt ?? '—').padEnd(17)}  ${attendu}${ok ? '' : '   ⛔ ÉCART'}`);
}
if (ecart) { console.error('\n⛔ verify_jwt de la prod ≠ attendu : rien n\'est déployé. Relire l\'appelant de la fonction.'); process.exit(1); }
if (!go) { console.log('\n(plan) Rien n\'est déployé. --go pour déployer, une par une.'); process.exit(0); }

for (const [nom] of FONCTIONS) {
  const f = lister().get(nom);
  const args = ['supabase', 'functions', 'deploy', nom, '--project-ref', PROJET];
  if (f.verify_jwt === false) args.push('--no-verify-jwt');
  console.log(`\n→ ${nom} (v${f.version}, verify_jwt ${f.verify_jwt})`);
  execFileSync(npx, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  const apres = lister().get(nom);
  if (apres.verify_jwt !== f.verify_jwt || !(apres.version > f.version)) {
    console.error(`⛔ ${nom} : après déploiement v${apres.version}, verify_jwt ${apres.verify_jwt} (avant v${f.version}, ${f.verify_jwt}) — ARRÊT.`);
    process.exit(1);
  }
  console.log(`✓ ${nom} : v${f.version} → v${apres.version}, verify_jwt ${apres.verify_jwt} (inchangé)`);
}
console.log('\nToutes les fonctions Cloud sont déployées, verify_jwt inchangés.');
