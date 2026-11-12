// LE DÉCOR ET LES CAS de la migration 20261112100000_essai_formule_aucun_credit_hors_paiement (12/11/2026, question 9 des
// offres Cloud : pendant l'essai d'une formule avec Cloud, aucun crédit mensuel hors paiement) — partagés par le banc
// (scripts/essais/20261112100000_banc.mjs) et par le verrou (scripts/essai-formule-credit-selftest.mjs).
// ⛔ Base JETABLE seulement (embedded-postgres sur le poste) : rien ici ne parle à la prod.
//
// Le décor = la PROD du 12/11/2026 vers 09:45 (lecture seule, MCP) :
//   · fixtures/prod-1111-palier-essai-cloud/catalogue.json — 25 fonctions de la chaîne du palier et des crédits, 8 tables
//     aux colonnes de prod, lues le 11/11 ; md5 recomparés le 12/11 : inchangés, sauf les quatre de la décision 1, que le
//     décor rejoue comme la prod les a reçues (migration 20261111230000, appliquée le 11/11 à 23:19) ;
//   · fixtures/prod-1211-credit-essai-formule/catalogue.json — À L'OCTET : grant_monthly_coins, coins_awaiting_payment,
//     grant_monthly_coins_sweep ; la colonne profiles.cloud_formule et les contraintes Cloud de profiles, les contraintes,
//     index (dont coin_ledger_ref_unique) et clés étrangères de coin_ledger / coin_wallets, lens_identify_cache et
//     lens_scans (que le balayage purge), les droits EXECUTE de prod, les 53 valeurs de coin_config.
//   Sans commentaires (comportement identique, aucune donnée client versionnée) : upgrade_monthly_grant, cloud_etat,
//   bordereaux_ouverts_pour, quota_annonces_consommees, quota_republication_free_etat. Absente : refund_coins (le
//   balayage ne l'appelle que pour un scan Lens abandonné qui avait coûté des unités ; aucun dans le décor).
// Comptes d'essai : identifiants inventés (8 premiers caractères distincts), aucune adresse, aucun compte réel.
// Le balayage est joué comme le cron (postgres, SELECT public.grant_monthly_coins_sweep()), en UTC comme la prod.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export { demarrerBase, ouvrir } from './20261111140000_decor.mjs';

export const ICI = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const lireDe = (racine, p) => readFileSync(join(racine, p), 'utf8').replace(/\r\n/g, '\n');
export const existeDans = (racine, p) => existsSync(join(racine, p));
export const FX1 = 'scripts/essais/fixtures/prod-1111-palier-essai-cloud/catalogue.json';
export const FX2 = 'scripts/essais/fixtures/prod-1211-credit-essai-formule/catalogue.json';
export const DECISION1 = 'supabase/migrations/20261111230000_essai_cloud_seul_droits_pro.sql';
export const MIGRATION = 'supabase/migrations/20261112100000_essai_formule_aucun_credit_hors_paiement.sql';
export const INVERSE = 'supabase/rollbacks/20261112100000_essai_formule_aucun_credit_hors_paiement_INVERSE.sql';
export const PREUVE = 'scripts/reparations/20261112_essai_formule_aucun_credit_hors_paiement_PREUVE.sql';
export const SAUVEGARDE = 'scripts/reparations/20261112_essai_formule_aucun_credit_hors_paiement_SAUVEGARDE.sql';
export const TOUCHEES = ['coins_awaiting_payment()', 'grant_monthly_coins(p_user_id uuid, p_tier text, p_period_end timestamp with time zone, p_source text)'];
export const SANS_COMMENTAIRES = ['upgrade_monthly_grant', 'cloud_etat', 'bordereaux_ouverts_pour', 'quota_annonces_consommees', 'quota_republication_free_etat'];

const id = (s) => `"${String(s).replace(/"/g, '""')}"`;
const PRELUDE = String.raw`
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth; CREATE SCHEMA IF NOT EXISTS extensions;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, created_at timestamptz DEFAULT now());
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $f$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $f$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $f$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
`;

/** Les droits EXECUTE de prod, exacts (postgres garde les siens : propriétaire). */
async function poserDroits(c, nom, args, acl) {
  await c.query(`REVOKE ALL ON FUNCTION public.${id(nom)}(${args}) FROM PUBLIC, anon, authenticated, service_role`);
  for (const m of String(acl).replace(/^\{|\}$/g, '').split(',').filter(Boolean)) {
    const [role, reste] = m.split('=');
    if (['anon', 'authenticated', 'service_role'].includes(role) && reste.split('/')[0].includes('X')) {
      await c.query(`GRANT EXECUTE ON FUNCTION public.${id(nom)}(${args}) TO ${role}`);
    }
  }
}

/** La prod du 12/11 dans la base jetable. Rend { echecs, nf }. Le décor est TOUJOURS lu dans la copie qui porte ce module. */
export async function construireDecor(c) {
  const fx1 = JSON.parse(lireDe(ICI, FX1)), fx2 = JSON.parse(lireDe(ICI, FX2));
  const echecs = [];
  const essayer = async (sql, quoi) => { try { await c.query(sql); return true; } catch (e) { echecs.push(`${quoi} : ${e.message}`); return false; } };
  await c.query(PRELUDE);
  await c.query(`SET TIME ZONE 'UTC'`);
  for (const s of new Set(fx1.tables.flatMap((t) => t.cols.map((k) => /nextval\('([^']+)'/.exec(k.d ?? '')?.[1]).filter(Boolean)))) {
    await essayer(`CREATE SEQUENCE IF NOT EXISTS public.${id(s.replace(/^public\./, '').replace(/"/g, ''))}`, `séquence ${s}`);
  }
  for (const t of fx1.tables) {
    const cols = t.cols.filter((k) => !k.g).map((k) => `${id(k.n)} ${k.t}${k.nn ? ' NOT NULL' : ''}${k.id === 'a' ? ' GENERATED ALWAYS AS IDENTITY' : k.id === 'd' ? ' GENERATED BY DEFAULT AS IDENTITY' : ''}`);
    await essayer(`CREATE TABLE public.${id(t.nom)} (${cols.join(', ')})`, `table ${t.nom}`);
    for (const k of t.cols.filter((x) => x.d && !x.id && !x.g)) await essayer(`ALTER TABLE public.${id(t.nom)} ALTER COLUMN ${id(k.n)} SET DEFAULT ${k.d}`, `défaut ${t.nom}.${k.n}`);
    for (const k of t.cons) await essayer(`ALTER TABLE public.${id(t.nom)} ADD CONSTRAINT ${id(k.n)} ${k.def}`, `contrainte ${t.nom}.${k.n}`);
  }
  for (const k of fx2.profiles.colonnes_ajoutees) await essayer(`ALTER TABLE public.profiles ADD COLUMN ${id(k.n)} ${k.t}`, `colonne profiles.${k.n}`);
  for (const k of fx2.profiles.contraintes) await essayer(`ALTER TABLE public.profiles ADD CONSTRAINT ${id(k.n)} ${k.def}`, `contrainte profiles.${k.n}`);
  for (const k of fx2.contraintes) await essayer(`ALTER TABLE public.${id(k.table)} ADD CONSTRAINT ${id(k.n)} ${k.def}`, `contrainte ${k.table}.${k.n}`);
  for (const i of fx2.index) await essayer(i, `index ${i.slice(0, 60)}`);
  for (const t of fx2.tables) await essayer(`CREATE TABLE public.${id(t.nom)} (${t.cols}${t.cons.map((k) => `, ${k}`).join('')})`, `table ${t.nom}`);

  await c.query('SET check_function_bodies = off');
  let nf = 0;
  for (const f of fx1.fonctions) {
    if (!(await essayer(f.def, `fonction ${f.nom}`))) continue;
    nf++;
    await poserDroits(c, f.nom, f.args, f.acl);
  }
  // La décision 1 telle que la prod l'a reçue (11/11 23:19) : palier_de, quotas_etat, spend_coins_for_generate / _for_lens.
  await essayer(lireDe(ICI, DECISION1), 'migration 20261111230000');
  // À l'octet (12/11) : les deux que la migration réécrit et le balayage (neuf dans le décor : ses droits de prod).
  for (const f of fx2.fonctions) {
    const neuve = !fx1.fonctions.some((x) => x.nom === f.nom);
    if (!(await essayer(f.def, `fonction ${f.nom}`))) continue;
    if (neuve) nf++;
    await poserDroits(c, f.nom, f.args, f.acl);
  }
  await c.query('SET check_function_bodies = on');
  for (const l of fx2.config.coin_config) await c.query('INSERT INTO public.coin_config (key, value) VALUES ($1, $2)', [l.key, l.value]);
  return { echecs, nf, attendues: new Set([...fx1.fonctions, ...fx2.fonctions].map((f) => f.nom)).size, fx1, fx2 };
}

/** Les fonctions du schéma public : md5 de pg_get_functiondef, droits, SECURITY DEFINER, search_path, volatilité. */
export async function etatFonctions(c) {
  const { rows } = await c.query(`SELECT p.proname AS nom, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS k,
      md5(pg_get_functiondef(p.oid)) AS m, coalesce(p.proacl::text, '') AS acl, p.prosecdef AS sd, coalesce(p.proconfig::text, '') AS cfg, p.provolatile AS v
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace`);
  return Object.fromEntries(rows.map((r) => [r.k, { nom: r.nom, m: r.m, acl: r.acl, reste: `${r.acl}|${r.sd}|${r.cfg}|${r.v}` }]));
}
export const ecart = (a, b) => {
  const cles = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return { ajoutes: cles.filter((k) => !(k in a)), retires: cles.filter((k) => !(k in b)),
    changes: cles.filter((k) => k in a && k in b && a[k].m !== b[k].m).sort(), droits: cles.filter((k) => k in a && k in b && a[k].reste !== b[k].reste) };
};

// ═══ LES CAS ═════════════════════════════════════════════════════════════════════════════════════════════════════════
const H = 3600e3, J = 24 * H;
const uid = (g, n) => `${g}${String(n).padStart(7, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const id8 = (u) => u.slice(0, 8);
// Une formule avec Cloud en essai, telle que l'écrivent stripe-webhook / create-checkout-session (Stripe), apple-iap-webhook
// / validate-apple-receipt (Apple), google-play-webhook / validate-google-purchase (Google) : drapeaux du palier posés,
// cloud_formule, essai daté, is_cloud faux (pas encore payé), cloud_essai_arrete faux.
const essaiFormule = (formule, canal, n, { debut = -2 * J, fin = 5 * J } = {}) => ({
  ...(formule === 'business_cloud' ? { is_business: true, is_pro: true, is_premium: true } : formule === 'pro_cloud' ? { is_pro: true, is_premium: true } : { is_premium: true }),
  ...(canal === 'stripe' ? { stripe_customer_id: `cus_banc_${n}` } : canal === 'apple' ? { apple_original_transaction_id: `banc-apple-${n}` } : { google_purchase_token: `banc-google-${n}`, google_product_id: `app.fillsell.${formule}` }),
  cloud_formule: formule, cloud_canal: canal, cloud_ref: canal === 'stripe' ? `sub_banc_${n}` : canal === 'apple' ? `banc-apple-${n}` : `banc-google-${n}`,
  is_cloud: false, cloud_essai_arrete: false, cloud_arret_fin_periode: false, cloud_essai_debut: debut, cloud_essai_fin: fin, cloud_periode_fin: fin,
});
const essaiCloudSeul = (canal, n) => ({ ...(canal === 'stripe' ? { stripe_customer_id: `cus_banc_${n}` } : { apple_original_transaction_id: `banc-apple-${n}` }),
  cloud_canal: canal, cloud_ref: `banc-${canal}-${n}`, is_cloud: false, cloud_essai_arrete: false, cloud_essai_debut: -2 * J, cloud_essai_fin: 5 * J, cloud_periode_fin: 5 * J });

// due : décalage de l'échéance (coin_wallets.next_grant_at) par rapport à T ; null = aucune ligne coin_wallets.
// hist : palier du dernier crédit (le début du cycle en cours, 30 jours avant T) ; null = aucun.
// A / B : ce que fait le balayage AVANT (prod) et APRÈS la migration — 'credite' | 'attente' | 'saute' | 'non_visite'.
export const CAS_BALAYAGE = [
  // ── Une formule avec Cloud EN ESSAI : le défaut (crédité AVANT), corrigé (rien APRÈS) ──
  { u: uid('e', 1), nom: 'essai Pro + Cloud (Stripe, nouveau client), échéance tombée dans l\'essai', p: essaiFormule('pro_cloud', 'stripe', 1), due: -H, hist: 'free', A: 'credite', B: 'saute', exclu: true },
  { u: uid('e', 2), nom: 'essai Premium + Cloud (Stripe)', p: essaiFormule('premium_cloud', 'stripe', 2), due: -H, hist: 'free', A: 'credite', B: 'saute', exclu: true },
  { u: uid('e', 3), nom: 'essai Pro + Cloud (Apple, semaine gratuite de la boutique)', p: essaiFormule('pro_cloud', 'apple', 3), due: -H, hist: 'free', A: 'credite', B: 'saute', exclu: true },
  { u: uid('e', 4), nom: 'essai Premium + Cloud (Google)', p: essaiFormule('premium_cloud', 'google', 4), due: -H, hist: 'free', A: 'credite', B: 'saute', exclu: true },
  { u: uid('e', 5), nom: 'essai d\'ABONNÉ Stripe (Premium payé, essai Premium + Cloud, décision 6)', p: essaiFormule('premium_cloud', 'stripe', 5), due: -H, hist: 'premium', A: 'credite', B: 'saute', exclu: true },
  { u: uid('e', 6), nom: 'essai Pro + Cloud, aucune ligne coin_wallets', p: essaiFormule('pro_cloud', 'stripe', 6), due: null, hist: null, A: 'credite', B: 'saute', exclu: true },
  { u: uid('e', 7), nom: 'essai Pro + Cloud, échéance passée de 4 jours (dans l\'essai) : signalée à tort à l\'ops-digest AVANT', p: essaiFormule('pro_cloud', 'stripe', 7, { debut: -6 * J, fin: J }), due: -4 * J, hist: 'free', A: 'attente', B: 'saute', exclu: true },
  { u: uid('e', 8), nom: 'Business + Cloud marqué en essai (jamais vendu ainsi : aucune formule en essai n\'est créditée)', p: essaiFormule('business_cloud', 'stripe', 8), due: -H, hist: 'free', A: 'credite', B: 'saute', exclu: true },
  // ── Tous les autres : exactement comme avant ──
  { u: uid('a', 1), nom: 'payé Pro (Stripe), sans Cloud', p: { stripe_customer_id: 'cus_banc_a1', is_pro: true, is_premium: true }, due: -H, hist: 'pro', A: 'credite', B: 'credite' },
  { u: uid('a', 2), nom: 'payé Premium (Stripe), échéance passée de 4 jours (attente du paiement)', p: { stripe_customer_id: 'cus_banc_a2', is_premium: true }, due: -4 * J, hist: 'premium', A: 'attente', B: 'attente' },
  { u: uid('a', 3), nom: 'Cloud seul PAYÉ (Stripe), compte gratuit', p: { stripe_customer_id: 'cus_banc_a3', cloud_canal: 'stripe', cloud_ref: 'sub_banc_a3', is_cloud: true, cloud_essai_debut: -40 * J, cloud_essai_fin: -33 * J, cloud_periode_fin: 20 * J }, due: -H, hist: 'free', A: 'credite', B: 'credite' },
  { u: uid('a', 4), nom: 'essai du Cloud SEUL en cours (Stripe, décision 1 : droits Pro, crédit au palier payé)', p: essaiCloudSeul('stripe', 4), due: -H, hist: 'free', A: 'credite', B: 'credite' },
  { u: uid('a', 5), nom: 'essai du Cloud SEUL en cours (Apple)', p: essaiCloudSeul('apple', 5), due: -H, hist: 'free', A: 'credite', B: 'credite' },
  { u: uid('a', 6), nom: 'offert (is_comped), ancien identifiant Stripe, échéance passée de 4 jours', p: { stripe_customer_id: 'cus_banc_a6', is_comped: true }, due: -4 * J, hist: 'premium', A: 'credite', B: 'credite' },
  { u: uid('a', 7), nom: 'Founder (Apple)', p: { apple_original_transaction_id: 'banc-apple-a7', is_founder: true, is_premium: true }, due: -H, hist: 'premium', A: 'credite', B: 'credite' },
  { u: uid('a', 8), nom: 'Business (Google)', p: { google_purchase_token: 'banc-google-a8', is_business: true, is_pro: true, is_premium: true }, due: -H, hist: 'business', A: 'credite', B: 'credite' },
  { u: uid('a', 9), nom: 'gratuit sans moyen de paiement', p: {}, due: -H, hist: 'free', A: 'credite', B: 'credite' },
  { u: uid('a', 10), nom: 'gratuit, échéance passée de 10 jours', p: {}, due: -10 * J, hist: 'free', A: 'credite', B: 'credite' },
  { u: uid('a', 11), nom: 'essai de formule FINI (paiement pas encore reçu, drapeaux encore posés)', p: essaiFormule('pro_cloud', 'stripe', 11, { debut: -8 * J, fin: -H }), due: -H, hist: 'free', A: 'credite', B: 'credite' },
  { u: uid('a', 12), nom: 'essai de formule ARRÊTÉ (drapeaux pas encore retombés)', p: { ...essaiFormule('pro_cloud', 'stripe', 12, { debut: -3 * J, fin: -J }), cloud_essai_arrete: true }, due: -H, hist: 'free', A: 'credite', B: 'credite' },
  { u: uid('a', 13), nom: 'formule PAYÉE dans la semaine de l\'essai (vers Business + Cloud : essai arrêté, payé)', p: { ...essaiFormule('business_cloud', 'stripe', 13), is_cloud: true }, due: -H, hist: 'free', A: 'credite', B: 'credite' },
  { u: uid('a', 14), nom: 'essai de formule PAS ENCORE commencé', p: essaiFormule('pro_cloud', 'stripe', 14, { debut: J, fin: 8 * J }), due: -H, hist: 'free', A: 'credite', B: 'credite' },
  { u: uid('a', 15), nom: '7 jours de Cloud OFFERTS à un abonné Apple (cloud_canal offert)', p: { apple_original_transaction_id: 'banc-apple-a15', is_premium: true, cloud_canal: 'offert', cloud_ref: 'offert:apple:premium_cloud', is_cloud: false, cloud_essai_debut: -2 * J, cloud_essai_fin: 5 * J, cloud_periode_fin: 5 * J }, due: -H, hist: 'premium', A: 'credite', B: 'credite' },
  { u: uid('a', 16), nom: 'Cloud OFFERT avec une formule restée écrite (incohérent) : jamais la règle', p: { apple_original_transaction_id: 'banc-apple-a16', is_premium: true, cloud_canal: 'offert', cloud_ref: 'offert:apple:premium_cloud', cloud_formule: 'premium_cloud', is_cloud: false, cloud_essai_debut: -2 * J, cloud_essai_fin: 5 * J, cloud_periode_fin: 5 * J }, due: -H, hist: 'premium', A: 'credite', B: 'credite' },
  { u: uid('a', 17), nom: 'essai de formule, échéance APRÈS la fin de l\'essai (pas atteinte)', p: essaiFormule('pro_cloud', 'stripe', 17), due: 6 * J, hist: 'free', A: 'non_visite', B: 'non_visite' },
  { u: uid('a', 18), nom: 'gratuit au montant fixé à la main (monthly_grant_override 777)', p: { monthly_grant_override: 777 }, due: -H, hist: 'free', A: 'credite', B: 'credite' },
  { u: uid('a', 19), nom: 'déjà crédité pour cette échéance (même référence au grand livre)', p: {}, due: -H, hist: 'free', dejaCredite: true, A: 'saute', B: 'saute' },
];
// Le crédit PARESSEUX (prix > 0 posés pour le tour, remis à 0 après) : spend_coins_for_generate / _for_lens, et
// upgrade_monthly_grant(…, 'lazy') tel que l'appellent spend_coins_and_publish et spend_coins_and_republish (lu en prod).
export const CAS_PARESSEUX = [
  { u: uid('b', 1), nom: 'essai Pro + Cloud : spend_coins_for_generate (prix 1, solde 0)', p: essaiFormule('pro_cloud', 'stripe', 101), appel: 'generate', exclu: true },
  { u: uid('b', 2), nom: 'essai Pro + Cloud : spend_coins_for_lens (prix 1, solde 0)', p: essaiFormule('pro_cloud', 'stripe', 102), appel: 'lens', exclu: true },
  { u: uid('b', 3), nom: 'essai Pro + Cloud : upgrade_monthly_grant(…, \'lazy\') (= spend_coins_and_publish / _and_republish)', p: essaiFormule('pro_cloud', 'stripe', 103), appel: 'lazy_pro', exclu: true },
  { u: uid('b', 4), nom: 'payé Pro : spend_coins_for_generate', p: { stripe_customer_id: 'cus_banc_b4', is_pro: true, is_premium: true }, appel: 'generate' },
  { u: uid('b', 5), nom: 'essai du Cloud SEUL (décision 1) : spend_coins_for_generate', p: essaiCloudSeul('stripe', 105), appel: 'generate' },
  { u: uid('b', 6), nom: 'gratuit : spend_coins_for_lens', p: {}, appel: 'lens' },
].map((x) => ({ ...x, due: -H, hist: 'free', solde: 0 }));
// Les appels qui ne sont NI le balayage NI le crédit paresseux : exactement comme avant, pendant l'essai aussi.
export const CAS_AUTRES = [
  { u: uid('f', 1), nom: 'essai Pro + Cloud : paiement réel (upgrade_monthly_grant \'payment\', fin de période +30 j)', p: essaiFormule('pro_cloud', 'stripe', 201), appel: 'payment_pro', due: -H, hist: 'free' },
  { u: uid('f', 2), nom: 'essai d\'abonné : le paiement de son renouvellement (\'payment\')', p: essaiFormule('premium_cloud', 'stripe', 202), appel: 'payment_premium', due: -H, hist: 'premium' },
  { u: uid('f', 3), nom: 'inscription : grant_monthly_coins(…, \'free\') de handle_new_user', p: {}, appel: 'inscription', due: null, hist: null },
  { u: uid('f', 4), nom: 'essai Pro + Cloud : appel à la main grant_monthly_coins(…, \'pro\') (source auto)', p: essaiFormule('pro_cloud', 'stripe', 204), appel: 'main_pro', due: -H, hist: 'free' },
];
export const TOUS = [...CAS_BALAYAGE, ...CAS_PARESSEUX, ...CAS_AUTRES];

const iso = (T, ms) => new Date(T + ms).toISOString();
const jour = (T, ms) => new Date(T + ms).toISOString().slice(0, 10);
const COLS_TEMPS = new Set(['cloud_essai_debut', 'cloud_essai_fin', 'cloud_periode_fin']);

/** Pose les comptes d'un groupe (profil, portefeuille, dernier crédit) à des dates FIXES (relatives à T). */
export async function poser(c, T, cas) {
  const ancre = ((new Date(T).getUTCDate() + 14) % 28) + 1;   // loin d'aujourd'hui : grant_next_due stable d'un tour à l'autre
  for (const k of cas) {
    await c.query('INSERT INTO auth.users (id) VALUES ($1)', [k.u]);
    const p = { created_at: iso(T, -90 * J), ...Object.fromEntries(Object.entries(k.p).map(([n, v]) => [n, COLS_TEMPS.has(n) ? iso(T, v) : v])) };
    const noms = Object.keys(p);
    await c.query(`INSERT INTO public.profiles (id${noms.map((n) => `, ${id(n)}`).join('')}) VALUES ($1${noms.map((_, i) => `, $${i + 2}`).join('')})`, [k.u, ...Object.values(p)]);
    if (k.due !== null) {
      await c.query(`INSERT INTO public.coin_wallets (user_id, included_balance, purchased_balance, next_grant_at, grant_anchor_day, updated_at)
        VALUES ($1, $2, 0, $3, $4, $5)`, [k.u, k.solde ?? 37, iso(T, k.due), ancre, iso(T, -30 * J)]);
    }
    if (k.hist) {
      await c.query(`INSERT INTO public.coin_ledger (user_id, delta, included_after, purchased_after, kind, ref, metadata, created_at)
        VALUES ($1, 50, 50, 0, 'grant_monthly', $2, $3, $4)`, [k.u, `grant_monthly:${k.u}:${jour(T, -30 * J)}`, JSON.stringify({ tier: k.hist, source: 'sweep' }), iso(T, -30 * J)]);
    }
    if (k.dejaCredite) {
      await c.query(`INSERT INTO public.coin_ledger (user_id, delta, included_after, purchased_after, kind, ref, metadata, created_at)
        VALUES ($1, 0, 37, 0, 'admin', $2, '{}'::jsonb, $3)`, [k.u, `grant_monthly:${k.u}:${jour(T, k.due)}`, iso(T, -2 * H)]);
    }
  }
}
export async function effacer(c) {
  const ids = TOUS.map((k) => k.u);
  await c.query('DELETE FROM public.coin_ledger WHERE user_id = ANY($1::uuid[])', [ids]);
  await c.query('DELETE FROM public.coin_wallets WHERE user_id = ANY($1::uuid[])', [ids]);
  await c.query('DELETE FROM public.usage_logs WHERE user_id = ANY($1::uuid[])', [ids]);
  await c.query('DELETE FROM public.profiles WHERE id = ANY($1::uuid[])', [ids]);
  await c.query('DELETE FROM auth.users WHERE id = ANY($1::uuid[])', [ids]);
}

/** L'état des comptes : grand livre (lignes neuves du tour comprises), portefeuille, début du cycle, ops-digest. */
export async function photo(c, cas, depuis) {
  const ids = cas.map((k) => k.u);
  const lignes = (await c.query(`SELECT user_id::text AS u, kind, delta, included_after, purchased_after, ref, metadata, created_at >= $2 AS neuve
    FROM public.coin_ledger WHERE user_id = ANY($1::uuid[]) ORDER BY user_id, id`, [ids, depuis])).rows;
  const portefeuilles = (await c.query(`SELECT user_id::text AS u, included_balance, purchased_balance, reserved_balance, included_granted_month,
      to_char(next_grant_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS next_grant_at, grant_anchor_day, updated_at < $2 AS intact, xmin::text AS xmin
    FROM public.coin_wallets WHERE user_id = ANY($1::uuid[])`, [ids, depuis])).rows;
  const cycles = (await c.query(`SELECT id::text AS u, debut_cycle_quotas(id) >= $2 AS cycle_neuf FROM public.profiles WHERE id = ANY($1::uuid[])`, [ids, depuis])).rows;
  const attente = new Set((await c.query('SELECT user_id::text AS u FROM public.coins_awaiting_payment()')).rows.map((r) => r.u));
  return Object.fromEntries(cas.map((k) => {
    const w = portefeuilles.find((r) => r.u === k.u) ?? null;
    return [k.u, {
      lignes: lignes.filter((r) => r.u === k.u).map(({ u: _u, ...r }) => r),
      neuves: lignes.filter((r) => r.u === k.u && r.neuve).length,
      portefeuille: w ? (({ u: _u, xmin: _x, ...r }) => r)(w) : null,
      xmin: w?.xmin ?? null,
      cycle_neuf: cycles.find((r) => r.u === k.u)?.cycle_neuf ?? null,
      ops_digest: attente.has(k.u),
    }];
  }));
}
/** La même photo, sans ce qui dépend de l'instant du tour (xmin) : comparable d'un tour à l'autre. */
export const comparable = (ph) => Object.fromEntries(Object.entries(ph).map(([u, e]) => [u, { ...e, xmin: undefined }]));

/** La PREUVE (lecture seule) jouée telle quelle : { 'section|quoi': valeur }. */
export async function preuve(c, racine = ICI) {
  const { rows } = await c.query(lireDe(racine, PREUVE));
  return Object.fromEntries(rows.map((r) => [`${r.section}|${r.quoi}`, r.valeur]));
}

/** Un tour : efface, pose le groupe, photographie, joue, photographie. */
export async function tour(c, T, groupe, { racinePreuve = ICI } = {}) {
  await effacer(c);
  const cas = groupe === 'balayage' ? CAS_BALAYAGE : groupe === 'paresseux' ? CAS_PARESSEUX : CAS_AUTRES;
  await poser(c, T, cas);
  const depuis = (await c.query('SELECT now() AS t')).rows[0].t;
  const avant = await photo(c, cas, depuis);
  const r = { avant, appels: {} };
  if (groupe === 'balayage') {
    r.preuve = await preuve(c, racinePreuve);
    r.balayage = (await c.query('SELECT public.grant_monthly_coins_sweep() AS r')).rows[0].r;
  } else if (groupe === 'paresseux') {
    await c.query(`UPDATE public.coin_config SET value = 1 WHERE key IN ('price_generate', 'price_lens_overflow')`);
    try {
      for (const k of cas) {
        const sql = k.appel === 'generate' ? 'SELECT public.spend_coins_for_generate($1, NULL) AS r'
          : k.appel === 'lens' ? 'SELECT public.spend_coins_for_lens($1, false) AS r'
          : `SELECT public.upgrade_monthly_grant($1, 'pro', NULL, 'lazy') AS r`;
        r.appels[k.u] = (await c.query(sql, [k.u])).rows[0].r;
      }
    } finally {
      await c.query(`UPDATE public.coin_config SET value = 0 WHERE key IN ('price_generate', 'price_lens_overflow')`);
    }
  } else {
    const finPeriode = iso(T, 30 * J);   // fixe d'un tour à l'autre (comme la fin de période d'une facture)
    for (const k of cas) {
      const [sql, args] = k.appel === 'payment_pro' ? [`SELECT public.upgrade_monthly_grant($1, 'pro', $2::timestamptz, 'payment') AS r`, [k.u, finPeriode]]
        : k.appel === 'payment_premium' ? [`SELECT public.upgrade_monthly_grant($1, 'premium', $2::timestamptz, 'payment') AS r`, [k.u, finPeriode]]
        : k.appel === 'inscription' ? [`SELECT public.grant_monthly_coins($1, 'free') AS r`, [k.u]]
        : [`SELECT public.grant_monthly_coins($1, 'pro') AS r`, [k.u]];
      r.appels[k.u] = (await c.query(sql, args)).rows[0].r;
    }
  }
  r.apres = await photo(c, cas, depuis);
  r.cas = cas;
  return r;
}
/** Le résultat d'un appel sans ce qui dépend de l'instant (dates des échéances posées par now()). */
export const appelComparable = (x) => JSON.parse(JSON.stringify(x ?? null, (k, v) => (k === 'ran_at' ? undefined : v)));
