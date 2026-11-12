// (11/11/2026, offres Cloud) Génère scripts/fixtures/paiements-lignes-formules-1111.json : les lignes des fonctions de
// paiement changées par les formules avec Cloud (et la décision 1), relues une à une dans le rapport
// (scratchpad\enquetes\OFFRES-SERVEUR.md), au même format que paiements-lignes-cloud-0811.json (« +ligne » / « -ligne »,
// commentaires exclus) — hors des lignes déjà permises (Cloud du 08/11, C4 du 09/11). À relancer seulement si ces
// fonctions changent encore, puis relire le JSON.   node scripts/paiements-lignes-formules-genere.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const BASE = '914b1e5';
const git = (...a) => execFileSync('git', a, { cwd: RACINE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const lireJ = (p) => JSON.parse(readFileSync(path.join(RACINE, p), 'utf8'));
const CLOUD = lireJ('scripts/fixtures/paiements-lignes-cloud-0811.json');
const C4 = lireJ('scripts/fixtures/paiements-lignes-c4-0911.json');
const FICHIERS = [
  'supabase/functions/stripe-webhook/index.ts', 'supabase/functions/cancel-subscription/index.ts',
  'supabase/functions/apple-iap-webhook/index.ts', 'supabase/functions/google-play-webhook/index.ts',
  'supabase/functions/create-checkout-session/index.ts', 'supabase/functions/validate-apple-receipt/index.ts',
  'supabase/functions/validate-google-purchase/index.ts', 'supabase/functions/_shared/stripe-rang-vivant.ts',
];
const out = {};
for (const f of FICHIERS) {
  // validate-apple-receipt : son mode « cloud » du 07/11 est contrôlé par motifs (§ 4) — ses lignes de formule se lisent
  // depuis 1f91bc3 (le dernier commit avant les formules), seules les nôtres.
  const depuis = f.endsWith('validate-apple-receipt/index.ts') ? '1f91bc3' : BASE;
  const diff = git('diff', '--ignore-cr-at-eol', '-U0', depuis, '--', f);
  const changees = diff.split('\n').filter((l) => /^[+-](?![+-])/.test(l)).map((l) => l[0] + l.slice(1).trim()).filter((l) => l.length > 1 && !/^[+-]\/\//.test(l));
  const permises = [...(CLOUD[f] ?? []), ...(C4[f] ?? [])];
  out[f] = changees.filter((l) => { const i = permises.indexOf(l); if (i < 0) return true; permises.splice(i, 1); return false; });
}
writeFileSync(path.join(RACINE, 'scripts/fixtures/paiements-lignes-formules-1111.json'), JSON.stringify(out, null, 1));
console.log(Object.fromEntries(Object.entries(out).map(([k, v]) => [k.replace('supabase/functions/', ''), v.length])));
