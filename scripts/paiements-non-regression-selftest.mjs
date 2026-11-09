// (05/11 soir, décision f de Nico) NON-RÉGRESSION DES PAIEMENTS ACTUELS : Premium, Pro et Business, sur les trois canaux
// (Stripe, Apple, Google), doivent marcher EXACTEMENT comme avant le lot « Ouverture du Cloud ».
// La preuve, contre la base d'avant le lot (BASE = 914b1e5, dernier commit avant le lot) :
//   1. les fonctions de décision partagées (cloud-option.js, paiement-echoue.js) de la BASE et d'AUJOURD'HUI rendent des
//      sorties IDENTIQUES sur une grille de scénarios de paliers (tous statuts Stripe, fin de période, Founder, mélanges,
//      factures d'échec de palier) — seuls les scénarios Cloud peuvent différer ;
//   2. les fonctions de paiement des paliers sont restées OCTET POUR OCTET (stripe-webhook, cancel-subscription,
//      stripe-portal, apple-iap-webhook, validate-apple-receipt, google-play-webhook, validate-google-purchase,
//      validate-coin-purchase, _shared/stripe-rang-vivant.ts) ;
//   3. create-checkout-session n'a changé QUE sur la page de retour (success_url) et la garde du Cloud ;
//   3 bis. (09/11, C4 de Nico) les lignes de la descente de formule Stripe, relues une à une
//      (scripts/fixtures/paiements-lignes-c4-0911.json), n'agissent que sous un subscription schedule ;
//   4. (07/11, décision de Nico : « Restaurer les achats » retrouve un Cloud pris seul) validate-apple-receipt n'a changé
//      QUE par le mode `option: 'cloud'` : sans lui (tous les appels d'avant), le corps est celui de la base.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const BASE = '914b1e5';
const RACINE = fileURLToPath(new URL('../', import.meta.url));
let n = 0, ko = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d ? `\n      ${String(d).slice(0, 600)}` : ''}`); } };
const git = (...a) => execFileSync('git', a, { cwd: RACINE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// ── 1. Les décisions : BASE contre AUJOURD'HUI ──
const tmp = mkdtempSync(path.join(tmpdir(), 'fs-non-regression-'));
const ancien = {};
try {
  for (const f of ['cloud-option.js', 'paiement-echoue.js']) {
    writeFileSync(path.join(tmp, f), git('show', `${BASE}:supabase/functions/_shared/${f}`));
    ancien[f] = await import(pathToFileURL(path.join(tmp, f)).href);
  }
} finally { /* le dossier est effacé à la fin */ }
const nouveau = {
  'cloud-option.js': await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/cloud-option.js')).href),
  'paiement-echoue.js': await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/paiement-echoue.js')).href),
};
const PRIX = { standard: 'price_std', pro: 'price_pro', business: 'price_biz', founder: 'price_founder', cloud: 'price_cloud' };
const T0 = 1793900000;
const STATUTS = ['active', 'trialing', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused'];
const sub = (i, { palier, statut, finPeriode = false, meta = true }) => ({
  id: `sub_${i}`, status: statut, cancel_at_period_end: finPeriode, current_period_end: T0 + 30 * 86_400, current_period_start: T0,
  trial_start: statut === 'trialing' ? T0 : null, trial_end: statut === 'trialing' ? T0 + 7 * 86_400 : null,
  canceled_at: statut === 'canceled' ? T0 + 3600 : null,
  items: { data: [{ price: { id: PRIX[palier] }, current_period_end: T0 + 30 * 86_400 }] },
  metadata: meta && palier !== 'founder' ? { plan_type: palier } : {},
});
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let grille = 0, ecarts = [];
const PALIERS = ['standard', 'pro', 'business', 'founder'];
// Un abonnement seul : chaque palier, chaque statut, fin de période ou non, métadonnée ou prix seul.
for (const palier of PALIERS) for (const statut of STATUTS) for (const finPeriode of [false, true]) for (const meta of [true, false]) {
  const s = [sub(grille, { palier, statut, finPeriode, meta })];
  for (const fn of ['litAbonnementStripe']) {
    const a = ancien['cloud-option.js'][fn](s[0], PRIX), b = nouveau['cloud-option.js'][fn](s[0], PRIX);
    grille++; if (!egal(a, b)) ecarts.push([fn, palier, statut, finPeriode, meta]);
  }
  const da = ancien['cloud-option.js'].drapeauxDepuisStripe(s, PRIX), db = nouveau['cloud-option.js'].drapeauxDepuisStripe(s, PRIX);
  grille++; if (!egal(da, db)) ecarts.push(['drapeauxDepuisStripe', palier, statut, finPeriode, meta]);
  for (const canal of [null, 'stripe', 'apple', 'google']) {
    const ma = ancien['cloud-option.js'].miseAJourProfilDepuisStripe(da, canal), mb = nouveau['cloud-option.js'].miseAJourProfilDepuisStripe(db, canal);
    grille++; if (!egal(ma, mb)) ecarts.push(['miseAJourProfilDepuisStripe', palier, statut, canal]);
  }
}
// Deux abonnements de paliers mêlés (montée Premium → Pro, ancien Founder, un résilié et un actif…).
for (const p1 of PALIERS) for (const p2 of PALIERS) for (const s1 of STATUTS) for (const s2 of ['active', 'trialing', 'past_due', 'canceled']) {
  const s = [sub(1, { palier: p1, statut: s1 }), sub(2, { palier: p2, statut: s2 })];
  const da = ancien['cloud-option.js'].drapeauxDepuisStripe(s, PRIX), db = nouveau['cloud-option.js'].drapeauxDepuisStripe(s, PRIX);
  grille++; if (!egal(da, db)) ecarts.push(['drapeauxDepuisStripe (2)', p1, s1, p2, s2]);
  const ma = ancien['cloud-option.js'].miseAJourProfilDepuisStripe(da, 'stripe'), mb = nouveau['cloud-option.js'].miseAJourProfilDepuisStripe(db, 'stripe');
  grille++; if (!egal(ma, mb)) ecarts.push(['miseAJourProfilDepuisStripe (2)', p1, s1, p2, s2]);
}
// Les factures d'échec d'un PALIER (souscription, renouvellement, fin d'essai ; tous statuts) : mêmes faits, même mail.
const facture = (raison, debut) => ({ id: 'in_1', status: 'open', billing_reason: raison, hosted_invoice_url: 'https://invoice.stripe.com/i/x',
  next_payment_attempt: T0 + 3 * 86_400, lines: { data: [{ period: { start: debut } }] } });
for (const raison of ['subscription_create', 'subscription_cycle', 'subscription_update']) for (const statut of STATUTS) for (const palier of ['standard', 'pro', 'business']) {
  const ab = { ...sub(9, { palier, statut }), trial_end: T0 };
  for (const debut of [T0, T0 + 30 * 86_400]) {
    const fa = ancien['paiement-echoue.js'].faitsEchec({ facture: facture(raison, debut), abonnement: ab, estCloud: false });
    const fb = nouveau['paiement-echoue.js'].faitsEchec({ facture: facture(raison, debut), abonnement: ab, estCloud: false });
    grille++; if (!egal(fa, fb)) ecarts.push(['faitsEchec', raison, statut, palier, debut]);
    for (const evenement of ['invoice.payment_failed', 'invoice.payment_action_required']) {
      const a = ancien['paiement-echoue.js'].decisionMailEchec({ evenement, facture: facture(raison, debut), abonnement: ab });
      const b = nouveau['paiement-echoue.js'].decisionMailEchec({ evenement, facture: facture(raison, debut), abonnement: ab });
      grille++; if (!egal(a, b)) ecarts.push(['decisionMailEchec', evenement, raison, statut]);
    }
  }
}
// Les boutiques : une écriture Cloud ne touche jamais un palier (mêmes colonnes de palier, aucune).
for (const sens of ['on', 'off', 'annulation', 'reprise']) {
  const r = nouveau['cloud-option.js'].ecritureCloudStore({ canal: 'apple', lecture: { debut: null, fin: new Date((T0 + 30 * 86_400) * 1000).toISOString(), essai: false }, sens, ref: 'A1', profil: { cloud_canal: 'apple', cloud_ref: 'A1' }, maintenant: T0 * 1000 });
  grille++; if (r.update && ['is_premium', 'is_pro', 'is_business', 'subscription_cancel_at_period_end'].some((k) => k in r.update)) ecarts.push(['ecritureCloudStore touche un palier', sens]);
}
rmSync(tmp, { recursive: true, force: true });
ok(ecarts.length === 0, `décisions de paliers identiques à la base ${BASE} sur ${grille} scénarios (Stripe, mails d'échec, boutiques)`, JSON.stringify(ecarts.slice(0, 5)));

// ── 2. Les fonctions de paiement des paliers : octet pour octet ──
const INCHANGEES = ['supabase/functions/stripe-portal/index.ts',
  'supabase/functions/validate-google-purchase/index.ts', 'supabase/functions/validate-coin-purchase/index.ts', 'supabase/functions/_shared/stripe-rang-vivant.ts'];
for (const f of INCHANGEES) {
  let diff = '';
  try { diff = git('diff', '--ignore-cr-at-eol', BASE, '--', f); } catch (e) { diff = `erreur ${e.message}`; }
  ok(diff.trim() === '', `${f.replace('supabase/functions/', '')} : inchangée depuis ${BASE}`, diff.slice(0, 300));
}
// ── 2 bis. (08/11, résiliation et mails Cloud, ordre de Nico) Quatre fonctions changent SEULEMENT dans leurs branches
// Cloud : chaque ligne changée (hors commentaires) est l'une des lignes RELUES une à une le 08/11 et inscrites dans
// scripts/fixtures/paiements-lignes-cloud-0811.json (imports des mails Cloud, réservation et envoi d'un mail d'événement,
// lecture du renouvellement signé du produit Cloud, arrêt d'essai Stripe relu avec ses factures, RESTARTED Google =
// reprise). Toute AUTRE ligne changée — un chemin de palier — rend ce contrôle rouge.
const LIGNES_CLOUD = JSON.parse(readFileSync(path.join(RACINE, 'scripts/fixtures/paiements-lignes-cloud-0811.json'), 'utf8'));
// ── 2 ter. (09/11, C4 de Nico : descente de formule, abonnés Stripe seulement) Les lignes AJOUTÉES par C4 dans
// stripe-webhook, cancel-subscription et create-checkout-session, relues une à une et inscrites dans
// scripts/fixtures/paiements-lignes-c4-0911.json : chacune n'agit que sous un subscription schedule (descente
// programmée). Elles s'ajoutent aux lignes permises, ligne pour ligne ; rien d'autre ne passe.
const LIGNES_C4 = JSON.parse(readFileSync(path.join(RACINE, 'scripts/fixtures/paiements-lignes-c4-0911.json'), 'utf8'));
for (const [f, permisesCloud] of Object.entries(LIGNES_CLOUD)) {
  const permises = [...permisesCloud, ...(LIGNES_C4[f] ?? [])];
  let diff = '';
  try { diff = git('diff', '--ignore-cr-at-eol', '-U0', BASE, '--', f); } catch (e) { diff = `erreur ${e.message}`; }
  const changees = diff.split('\n').filter((l) => /^[+-](?![+-])/.test(l)).map((l) => l[0] + l.slice(1).trim()).filter((l) => l.length > 1 && !/^[+-]\/\//.test(l));
  const restant = [...permises];
  const horsCloud = changees.filter((l) => { const i = restant.indexOf(l); if (i < 0) return true; restant.splice(i, 1); return false; });
  ok(horsCloud.length === 0, `${f.replace('supabase/functions/', '')} : seules les ${permisesCloud.length} lignes Cloud relues le 08/11${LIGNES_C4[f] ? ` et les ${LIGNES_C4[f].length} lignes C4 relues le 09/11` : ''} changent depuis ${BASE} (aucun autre chemin de palier)`, horsCloud.slice(0, 4).join(' | '));
}

// ── 3. create-checkout-session : seulement la page de retour et la garde du Cloud ──
const d = git('diff', '--ignore-cr-at-eol', '-U0', BASE, '--', 'supabase/functions/create-checkout-session/index.ts');
const lignes = d.split('\n').filter((l) => /^[+-](?![+-])/.test(l)).map((l) => l.slice(1).trim()).filter(Boolean);
const permises = [/^\/\//, /success_url:/, /cloudVivantDuProfil/, /^\.from\("profiles"\)\.select\("stripe_customer_id, is_cloud, cloud_canal, cloud_essai_debut/,
  /^if \(profilCloud\?\.is_cloud === true && profilCloud\?\.cloud_canal && profilCloud\.cloud_canal !== "stripe"\) \{$/, /^import \{ estAbonnementCloud/];
const c4Checkout = (LIGNES_C4['supabase/functions/create-checkout-session/index.ts'] ?? []).map((l) => l.slice(1));
const restantC4 = [...c4Checkout];
const autres = lignes.filter((l) => !permises.some((r) => r.test(l))).filter((l) => { const i = restantC4.indexOf(l); if (i < 0) return true; restantC4.splice(i, 1); return false; });
ok(autres.length === 0, `create-checkout-session : ${lignes.length} lignes changées, toutes sur la page de retour, la garde du Cloud ou le refus C4 (montée pendant une descente programmée)`, autres.join(' | '));
ok(lignes.some((l) => /success_url: `https:\/\/fillsell\.app\/success\?produit=\$\{encodeURIComponent\(planType\)\}/.test(l)), 'palier : seule la page de retour change (elle dit le palier acheté)');

// ── 4. validate-apple-receipt : seulement le mode « cloud » (07/11) ──
const FA = 'supabase/functions/validate-apple-receipt/index.ts';
const dA = git('diff', '--ignore-cr-at-eol', '-U0', BASE, '--', FA);
const lignesA = dA.split('\n').filter((l) => /^[+-](?![+-])/.test(l));
const retirees = lignesA.filter((l) => l.startsWith('-')).map((l) => l.slice(1).trim()).filter(Boolean);
const ajoutees = lignesA.filter((l) => l.startsWith('+')).map((l) => l.slice(1).trim()).filter(Boolean);
const permisesA = [/^\/\//, /^const \{ receipt, userId, option \} = await req\.json\(\);$/, /^const seulementCloud = option === "cloud";$/,
  /^if \(seulementCloud\) \{$/, /^\}\)?;?$/, /^headers: \{ \.\.\.CORS, "Content-Type": "application\/json" \},$/,
  /^return new Response\(JSON\.stringify\(\{ success: false, error: "receipt_invalide", is_cloud: false \}\), \{$/,
  /^return new Response\(JSON\.stringify\(\{ success: true, is_cloud: majCloudLue\?\.is_cloud === true, cloud: txCloud \? \(majCloudLue \? "ecrite" : "ignoree"\) : "absente" \}\), \{$/,
  /^let majCloudLue: Record<string, unknown> \| null = null;$/, /^majCloudLue = majCloud \?\? null;$/,
  /^if \(majCloudLue\) await supabaseAdmin\.from\("profiles"\)\.update\(majCloudLue\)\.eq\("id", userId\);$/,
  /^console\.log\(`\[validate-apple-receipt\] option cloud seule userId=/];
const autresA = ajoutees.filter((l) => !permisesA.some((r) => r.test(l)));
ok(retirees.length === 1 && retirees[0] === 'const { receipt, userId } = await req.json();' && autresA.length === 0,
  `validate-apple-receipt : ${ajoutees.length} lignes ajoutées, toutes du mode « cloud » ; une seule retirée (la lecture du corps)`, [...retirees, '|', ...autresA].join(' | '));
// Le corps sans le mode « cloud » = celui de la base, au caractère près (paliers, Founder, échéance, option du reçu).
const sansModeCloud = (t) => t.replace(/\r\n/g, '\n')
  .replace(/const \{ receipt, userId(, option)? \} = await req\.json\(\);/, '')
  .replace(/\n[ \t]*\/\/[^\n]*/g, '')
  .replace(/\n[ \t]*const seulementCloud = option === "cloud";/, '')
  .replace(/\n[ \t]*let majCloudLue[^\n]*/, '')
  .replace(/\n[ \t]*majCloudLue = majCloud \?\? null;/, '')
  .replace(/\n([ \t]*)if \(seulementCloud\) \{[\s\S]*?\n\1\}(?=\n)/g, '');
const baseA = sansModeCloud(git('show', `${BASE}:${FA}`));
const aujA = sansModeCloud(readFileSync(path.join(RACINE, FA), 'utf8'));
ok(baseA === aujA, 'validate-apple-receipt : sans le mode « cloud », le corps est celui de la base (rien d\'autre ne change)',
  baseA === aujA ? '' : `écart vers ${[...baseA].findIndex((c, i) => c !== aujA[i])}`);

console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
