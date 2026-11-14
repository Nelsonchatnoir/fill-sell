#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 20261114_formule_13e274de.mjs — PRÉPARÉ le 14/11/2026 (bloc F, audit en lecture seule), JAMAIS JOUÉ. Ne part que sur l'ORDRE de Nico.
// Remet le compte 13e274de sur une formule AVEC Cloud, en UNE seule requête Stripe sur SON abonnement
// (sub_1UbU3yQZRA77vrWJPqIj6aN9, en essai jusqu'au 21/11/2026 00:39:22 Paris), sans second abonnement.
//
//   (b) Pro + Cloud 49,99 €      node scripts/reparations/20261114_formule_13e274de.mjs --formule=pro_cloud --jouer
//   (a) Business + Cloud 79,99 € node scripts/reparations/20261114_formule_13e274de.mjs --formule=business_cloud --essai=garder --jouer
//                                node scripts/reparations/20261114_formule_13e274de.mjs --formule=business_cloud --essai=finir  --jouer
//   Inverse                      node scripts/reparations/20261114_formule_13e274de.mjs --inverse=scripts/reparations/20261114_formule_13e274de_SAUVEGARDE-….json --jouer
//
// SANS --jouer = SIMULATION : une seule lecture (GET) de l'abonnement, les gardes, la requête EXACTE qui partirait, et
// ce que le webhook écrira (calculé par le VRAI code du dépôt : _shared/cloud-option.js). Rien n'est écrit.
// --fixture=<json> : simulation hors ligne sur un abonnement enregistré (aucun appel réseau).
//
// Clé : STRIPE_LIVE_KEY=sk_live_… (ou rk_live_… avec écriture sur Subscriptions) ; sinon la Stripe CLI (« stripe … --live »,
// STRIPE_CLI=<chemin> si elle n'est pas dans le PATH). Une clé de test est refusée : l'abonnement n'existe qu'en réel.
// ⛔ Rien chez Stripe sans l'ordre explicite de Nico (CLAUDE.md). Aucun mail n'est envoyé par ce script.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, '..', '..');

// ── L'état audité le 14/11 (lu chez Stripe, MCP, livemode) ────────────────────────────────────────────────────────
const SUB = 'sub_1UbU3yQZRA77vrWJPqIj6aN9';
const CLIENT = 'cus_VcjVcZODmMio50';
const USER = '13e274de-7af1-4368-8c31-afe214252ca2';
const ITEM = 'si_VcjXQOS75h1g49';
const FIN_ESSAI = 1795217962; // 2026-11-21 00:39:22 Europe/Paris
// Prix LIVE (empreintes SHA-256 = secrets STRIPE_PRICE_BUSINESS / _PRO_CLOUD / _BUSINESS_CLOUD, relevées le 14/11)
const PRIX = Object.freeze({
  business: 'price_1U2Wh0QZRA77vrWJyWLOy6iB',       // 59,99 € — l'état actuel (bascule du 14/11 01:27:03)
  premium_cloud: 'price_1UahzRQZRA77vrWJUC2gXx06',  // 34,99 € (non utilisé ici)
  pro_cloud: 'price_1Uai1KQZRA77vrWJZxj33yC9',      // 49,99 € — son achat du 14/11 00:39
  business_cloud: 'price_1Uai2nQZRA77vrWJZgYHM3eu', // 79,99 €
});
const PLAN_TYPE = Object.freeze({ pro_cloud: 'pro', business_cloud: 'business' });
const TRACE = 'F-audit 14/11 : bascule Business sans confirmation reprise';

// ── Arguments ─────────────────────────────────────────────────────────────────────────────────────────────────────
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const jouer = args.jouer === true;
const sortir = (msg, code = 1) => { console.error(`\n⛔ ${msg}\nRien n'a été écrit chez Stripe.`); process.exit(code); };

// ── Stripe : clé live, sinon la CLI --live ; jamais le mode test ──────────────────────────────────────────────────
const CLE = String(process.env.STRIPE_LIVE_KEY ?? '').trim();
if (CLE && !/^(sk|rk)_live_/.test(CLE)) sortir('STRIPE_LIVE_KEY doit être une clé du mode RÉEL (sk_live_ / rk_live_).');
const CLI = process.env.STRIPE_CLI || 'stripe';

function aplatir(obj, prefixe = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const cle = prefixe ? `${prefixe}[${k}]` : k;
    if (v != null && typeof v === 'object') aplatir(v, cle, out);
    else out.push([cle, String(v ?? '')]);
  }
  return out;
}
async function stripe(methode, chemin, corps = null, idempotence = null) {
  if (args.fixture) {
    if (methode !== 'GET') sortir('--fixture : simulation seulement.');
    return JSON.parse(readFileSync(resolve(String(args.fixture)), 'utf8'));
  }
  const paires = corps ? aplatir(corps) : [];
  if (CLE) {
    const qs = new URLSearchParams(paires).toString();
    const url = `https://api.stripe.com/v1/${chemin}${methode === 'GET' && qs ? `?${qs}` : ''}`;
    const r = await fetch(url, {
      method: methode,
      headers: { Authorization: `Bearer ${CLE}`, 'Content-Type': 'application/x-www-form-urlencoded',
        ...(idempotence ? { 'Idempotency-Key': idempotence } : {}) },
      body: methode === 'GET' ? undefined : qs,
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`Stripe ${r.status} ${j?.error?.code ?? ''} : ${j?.error?.message ?? JSON.stringify(j).slice(0, 300)}`);
    return j;
  }
  const cli = [methode === 'GET' ? 'get' : 'post', `/v1/${chemin}`, '--live'];
  for (const [k, v] of paires) cli.push('-d', `${k}=${v}`);
  if (idempotence) cli.push('--idempotency', idempotence);
  const r = spawnSync(CLI, cli, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) sortir(`Stripe CLI introuvable (${r.error.message}) : pose STRIPE_LIVE_KEY ou STRIPE_CLI.`);
  let j;
  try { j = JSON.parse(r.stdout); } catch { throw new Error(`stripe ${cli.slice(0, 2).join(' ')} → ${String(r.stderr || r.stdout).slice(0, 300)}`); }
  if (j?.error) throw new Error(`Stripe ${j.error.code ?? ''} : ${j.error.message}`);
  return j;
}

// ── Ce que le webhook écrira : le VRAI code du dépôt (pur, sans réseau) ───────────────────────────────────────────
async function droitsCalcules(sub, libelle) {
  const co = await import(pathToFileURL(resolve(RACINE, 'supabase/functions/_shared/cloud-option.js')).href);
  const prix = { standard: '', pro: '', founder: '', cloud: '', ...PRIX };
  const d = co.drapeauxDepuisStripe([sub], prix);
  const maj = co.miseAJourProfilDepuisStripe(d, 'stripe');
  // stripe-webhook/index.ts:217-219 : cloud_formule remis à NULL quand plus aucune formule ne porte le Cloud.
  if (!('cloud_formule' in maj)) maj.cloud_formule = null;
  console.log(`\n— ${libelle} : colonnes que recomputeStripeFlags écrira (stripe-webhook/index.ts:199-221)`);
  console.log(JSON.stringify(maj, null, 2));
  return maj;
}

const iso = (s) => new Date(s * 1000).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
const resume = (s) => ({ id: s.id, status: s.status, trial_end: s.trial_end ? iso(s.trial_end) : null,
  prix: s.items?.data?.map((i) => `${i.id} ${i.price?.id} ${(i.price?.unit_amount ?? 0) / 100} €`),
  metadata: s.metadata, pending_update: s.pending_update ?? null, schedule: s.schedule ?? null,
  cancel_at_period_end: s.cancel_at_period_end, latest_invoice: typeof s.latest_invoice === 'object' && s.latest_invoice
    ? { id: s.latest_invoice.id, status: s.latest_invoice.status, total: s.latest_invoice.total, amount_paid: s.latest_invoice.amount_paid,
      hosted_invoice_url: s.latest_invoice.hosted_invoice_url } : s.latest_invoice });

// ── Gardes communes : l'abonnement est celui de 13e274de, intact depuis l'audit ───────────────────────────────────
function gardes(s, prixAttendu) {
  const fautes = [];
  if (s.id !== SUB) fautes.push(`abonnement ${s.id} ≠ ${SUB}`);
  if ((typeof s.customer === 'string' ? s.customer : s.customer?.id) !== CLIENT) fautes.push(`client ≠ ${CLIENT}`);
  if (s.metadata?.fillsell_user_id !== USER) fautes.push('fillsell_user_id ≠ 13e274de');
  if (s.pending_update) fautes.push('une mise à jour est EN ATTENTE (pending_update)');
  if (s.schedule) fautes.push('un schedule est posé');
  if (s.cancel_at_period_end || s.cancel_at) fautes.push('une résiliation est programmée');
  if ((s.items?.data ?? []).length !== 1 || s.items.data[0].id !== ITEM) fautes.push(`articles ≠ [${ITEM}]`);
  else if (s.items.data[0].price?.id !== prixAttendu) fautes.push(`prix actuel ${s.items.data[0].price?.id} ≠ attendu ${prixAttendu}`);
  return fautes;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
async function principal() {
  const horodatage = new Date().toISOString().replace(/[:.]/g, '-');

  // ── L'INVERSE ───────────────────────────────────────────────────────────────────────────────────────────────────
  if (args.inverse) {
    const sauvegarde = JSON.parse(readFileSync(resolve(String(args.inverse)), 'utf8'));
    const avant = sauvegarde.avant;
    if (sauvegarde.essai === 'finir') {
      sortir("L'essai a été terminé et 79,99 € prélevés : AUCUN inverse sans remboursement (décision de Nico, rien chez Stripe sans son ordre).");
    }
    const s = await stripe('GET', `subscriptions/${SUB}`, { expand: ['latest_invoice'] });
    const fautes = gardes(s, PRIX[sauvegarde.formule]);
    if (s.status !== 'trialing' || s.trial_end !== avant.trial_end) fautes.push(`statut ${s.status} / fin d'essai ${s.trial_end} ≠ essai jusqu'au ${avant.trial_end}`);
    if (fautes.length) sortir(`Inverse refusé — l'état a changé :\n  · ${fautes.join('\n  · ')}`);
    const corps = {
      items: [{ id: ITEM, price: avant.items.data[0].price.id }],
      proration_behavior: 'none',
      metadata: { ...avant.metadata, fillsell_correction: '' },
      expand: ['latest_invoice'],
    };
    console.log('Requête INVERSE :', `POST /v1/subscriptions/${SUB}`, JSON.stringify(corps, null, 2));
    await droitsCalcules({ ...s, items: { data: [{ id: ITEM, price: { id: corps.items[0].price } }] }, metadata: corps.metadata }, 'après l\'inverse');
    if (!jouer) { console.log('\nSIMULATION : rien écrit. Ajoute --jouer pour envoyer.'); return; }
    const r = await stripe('POST', `subscriptions/${SUB}`, corps, `f-audit-13e274de-inverse-${sauvegarde.idempotence}`);
    console.log('\nFAIT (inverse) :', JSON.stringify(resume(r), null, 2));
    return;
  }

  // ── L'ACTION ────────────────────────────────────────────────────────────────────────────────────────────────────
  const formule = String(args.formule ?? '');
  if (!PLAN_TYPE[formule]) sortir('--formule=pro_cloud ou --formule=business_cloud.');
  const essai = String(args.essai ?? (formule === 'pro_cloud' ? 'garder' : ''));
  if (!['garder', 'finir'].includes(essai)) sortir("Business + Cloud : dis --essai=garder (essai jusqu'au 21/11, exception à la règle « jamais d'essai ») ou --essai=finir (79,99 € prélevés maintenant).");
  if (formule === 'pro_cloud' && essai !== 'garder') sortir("Pro + Cloud : l'essai acheté est gardé (--essai=garder).");

  const s = await stripe('GET', `subscriptions/${SUB}`, { expand: ['latest_invoice'] });
  const fautes = gardes(s, PRIX.business);
  if (s.status !== 'trialing') fautes.push(`statut ${s.status} (attendu : trialing)`);
  if (s.trial_end !== FIN_ESSAI) fautes.push(`fin d'essai ${s.trial_end} ≠ ${FIN_ESSAI}`);
  if (essai === 'garder' && Date.now() > (FIN_ESSAI - 3600) * 1000) fautes.push("moins d'une heure avant la fin d'essai : trop tard pour garder l'essai");
  if (fautes.length) sortir(`L'abonnement n'est plus dans l'état audité :\n  · ${fautes.join('\n  · ')}`);
  console.log('Abonnement lu (avant) :', JSON.stringify(resume(s), null, 2));

  const corps = {
    items: [{ id: ITEM, price: PRIX[formule] }],
    proration_behavior: 'none',
    metadata: { plan_type: PLAN_TYPE[formule], formule, essai_cloud: '1', fillsell_user_id: USER, fillsell_correction: TRACE },
    // finir : l'essai s'arrête maintenant, 79,99 € facturés tout de suite ; error_if_incomplete = TOUT OU RIEN (Klarna qui
    // demanderait une validation → la requête échoue, l'abonnement ne bouge pas, 0 € prélevé).
    ...(essai === 'finir' ? { trial_end: 'now', payment_behavior: 'error_if_incomplete' } : {}),
    expand: ['latest_invoice'],
  };
  const idempotence = `${formule}-${essai}-${new Date().toISOString().slice(0, 10)}`;
  console.log(`\nRequête qui part (UNE) : POST /v1/subscriptions/${SUB}   Idempotency-Key: f-audit-13e274de-${idempotence}`);
  console.log(JSON.stringify(corps, null, 2));

  // Ce que le webhook écrira ensuite (le vrai code), sur l'abonnement tel qu'il sera.
  const maintenant = Math.floor(Date.now() / 1000);
  const apres = essai === 'finir'
    ? { ...s, status: 'active', trial_end: maintenant, current_period_end: maintenant + 30 * 86400, metadata: corps.metadata,
      items: { data: [{ id: ITEM, price: { id: PRIX[formule] } }] } }
    : { ...s, metadata: corps.metadata, items: { data: [{ id: ITEM, price: { id: PRIX[formule] } }] } };
  await droitsCalcules(apres, `après ${formule} (essai ${essai})`);

  if (!jouer) { console.log('\nSIMULATION : rien écrit chez Stripe. Ajoute --jouer pour envoyer (ordre explicite de Nico).'); return; }

  const fichier = resolve(ICI, `20261114_formule_13e274de_SAUVEGARDE-${horodatage}.json`);
  writeFileSync(fichier, JSON.stringify({ formule, essai, idempotence, avant: s, corps }, null, 2));
  console.log(`\nSauvegarde : ${fichier}`);
  let r;
  try {
    r = await stripe('POST', `subscriptions/${SUB}`, corps, `f-audit-13e274de-${idempotence}`);
  } catch (e) {
    sortir(`Stripe a refusé : ${e.message}\n(essai=finir : paiement Klarna non abouti → rien n'a changé ; repli possible = payment_behavior pending_if_incomplete + page de facture, sur décision de Nico)`);
  }
  console.log('\nFAIT :', JSON.stringify(resume(r), null, 2));
  console.log('\nVérifier la base APRÈS le webhook (≈ 5 s) : scripts/reparations/20261114_formule_13e274de_VERIFIER.sql (SELECT seulement).');
  console.log(`Inverse : node scripts/reparations/20261114_formule_13e274de.mjs --inverse=${fichier.replace(RACINE + '\\', '').replace(/\\/g, '/')} --jouer`);
}

principal().catch((e) => sortir(e?.message ?? String(e)));
