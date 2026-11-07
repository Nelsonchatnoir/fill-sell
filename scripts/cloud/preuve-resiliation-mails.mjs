// PREUVE, SUR UN POSTGRES JETABLE, de la résiliation du Cloud et du registre des mails (08/11/2026, ordre de Nico) :
//   1. la migration 20261108090000_cloud_mails_registre s'applique (deux fois : idempotente), fermée aux clients ;
//   2. un arrêt PENDANT L'ESSAI (Apple, Google, Stripe) : le profil écrit par le VRAI code des webhooks / de
//      cancel-subscription (ecritureCloudStore, mêmes colonnes que cancel-subscription) → les VRAIS déclencheurs et
//      fonctions de PROD (scripts/cloud/fixtures/prod-0811-cloud-arret.sql, relus le 08/11) : IP au repos AUSSITÔT,
//      drapeau cloud_voie éteint, tâches rendues à l'extension, compte retiré de cloud_comptes_a_servir (l'orchestrateur
//      ferme son navigateur au tour suivant, toutes les 60 s) ;
//   3. la MÊME notification rejouée : aucune seconde écriture, aucune seconde libération d'IP, un seul mail (registre) ;
//      dix réservations simultanées de la même clé → une seule passe ;
//   4. un arrêt APRÈS l'essai : programmé, le Cloud tourne jusqu'à l'échéance (IP gardée), puis l'expiration le coupe ;
//      réabonnement avant l'échéance : arrêt levé, aucune double place ;
//   5. une référence close (Nicotest) ne rallume rien.
//
//   PREUVE_PG=embarque node scripts/cloud/preuve-resiliation-mails.mjs   (Postgres 17 jetable sur le PC ; jamais la prod)
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { ecritureCloudStore, lectureCloudApple, lectureCloudGoogle, PRODUIT_CLOUD_APPLE, PRODUIT_CLOUD_GOOGLE, OFFRE_ESSAI_CLOUD_GOOGLE } from '../../supabase/functions/_shared/cloud-option.js';
import { evenementsBoutique } from '../../supabase/functions/_shared/cloud-mails.js';

let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co|pooler\.supabase/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-resiliation-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55441, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier, rmSync };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:preuve@127.0.0.1:55441/postgres';
}
const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const DECOR = String.raw`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE TABLE public.coin_config (key text PRIMARY KEY, value integer, updated_at timestamptz DEFAULT now());
CREATE TABLE public.profiles (id uuid PRIMARY KEY, email text, lang text, platform_settings jsonb DEFAULT '{}'::jsonb,
  is_cloud boolean, cloud_canal text, cloud_ref text, cloud_essai_debut timestamptz, cloud_essai_fin timestamptz,
  cloud_essai_arrete boolean DEFAULT false, cloud_periode_fin timestamptz, cloud_arret_fin_periode boolean DEFAULT false,
  cloud_voie boolean NOT NULL DEFAULT false, is_premium boolean, is_pro boolean, is_business boolean, is_comped boolean);
CREATE TABLE public.cloud_ips (id bigserial PRIMARY KEY, fournisseur text DEFAULT 'iproyal', commande text, ip inet, port integer, pays text DEFAULT 'FR',
  ville text, asn text, secret_nom text, etat text DEFAULT 'achetee', user_id uuid UNIQUE, dernier_user_id uuid, derniere_origine text, reserve_pour uuid,
  reserve_jusqu_au timestamptz, attribuee_le timestamptz, liberee_le timestamptz, repos_fin timestamptz, purge_preuve jsonb, purge_prouvee_le timestamptz,
  expire_le timestamptz, livree_le timestamptz DEFAULT now(), attributions integer DEFAULT 0, rebut_critere text, rebut_le timestamptz,
  cree_le timestamptz DEFAULT now(), maj_le timestamptz DEFAULT now(), refus jsonb DEFAULT '{}'::jsonb, sante jsonb);
CREATE TABLE public.cloud_ip_evenements (id bigserial PRIMARY KEY, ip_id bigint, nature text, user_id uuid, details jsonb, le timestamptz DEFAULT now());
CREATE TABLE public.cloud_attente (user_id uuid PRIMARY KEY, demande_le timestamptz DEFAULT now());
CREATE TABLE public.cloud_coffre (user_id uuid, plateforme text, connecte boolean);
CREATE TABLE public.cloud_postes (user_id uuid PRIMARY KEY, serveur text, etat text DEFAULT 'eteint', session_fillsell_id uuid);
CREATE TABLE public.cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, platform text, status text, error text, platform_fields jsonb DEFAULT '{}'::jsonb);
CREATE TABLE public.cloud_refs_closes (ref text PRIMARY KEY, canal text, user_id uuid, raison text, close_le timestamptz DEFAULT now(), par text);
CREATE TABLE public.stores_notifications_journal (id bigserial PRIMARY KEY, recu_le timestamptz DEFAULT now(), canal text, type text, sous_type text, effet text,
  connu boolean, effet_applique text, produit text, user_id uuid, transaction_id text, transaction_originale text, detail jsonb, motif text);
CREATE OR REPLACE FUNCTION public.platform_settings_fusionner(p text[], a jsonb, r text[], u uuid) RETURNS jsonb LANGUAGE sql AS $f$ SELECT '{}'::jsonb $f$;
CREATE OR REPLACE FUNCTION public.cloud_ip_attribuer(p_user uuid, p_nature text) RETURNS bigint LANGUAGE sql AS $f$ SELECT NULL::bigint $f$;
CREATE OR REPLACE FUNCTION public.cloud_empreintes_engager(p_user uuid) RETURNS void LANGUAGE sql AS $f$ SELECT $f$;
SET check_function_bodies = off;
`;

let n = 0, ko = 0;
const ok = (c, m, d) => { n++; console.log(`  ${c ? '✓' : '✗'} ${m}${!c && d !== undefined ? `\n      ${JSON.stringify(d).slice(0, 600)}` : ''}`); if (!c) ko++; };
const client = new pg.Client({ connectionString: PG_URL });
await client.connect();
const q = (sql, v) => client.query(sql, v);
const un = async (sql, v) => (await q(sql, v)).rows[0];

/** Écrit sur le profil ce que la fonction edge écrirait (supabase-js .update(update).eq('id', …)). */
async function ecrire(userId, update) {
  if (!update) return;
  const cles = Object.keys(update);
  await q(`UPDATE public.profiles SET ${cles.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [userId, ...cles.map((k) => update[k])]);
}
const profil = (id) => un('SELECT * FROM public.profiles WHERE id = $1', [id]);
const servis = async () => (await q('SELECT user_id FROM public.cloud_comptes_a_servir()')).rows.map((r) => r.user_id);
const liberations = async (id) => Number((await un("SELECT count(*) FROM public.cloud_ip_evenements WHERE user_id = $1 AND nature = 'liberation'", [id])).count);

try {
  await q(DECOR);
  await q(lire('./fixtures/prod-0811-cloud-arret.sql'));
  await q('SET check_function_bodies = on');

  // ── 1. La migration ──
  console.log('1. La migration 20261108090000_cloud_mails_registre');
  const migration = lire('../../supabase/migrations/20261108090000_cloud_mails_registre.sql');
  await q(migration);
  await q(migration);
  ok(true, 'appliquée deux fois de suite (idempotente)');
  const droits = await un("SELECT has_table_privilege('anon', 'public.cloud_mails', 'SELECT') AS anon, has_table_privilege('authenticated', 'public.cloud_mails', 'INSERT') AS auth, has_table_privilege('service_role', 'public.cloud_mails', 'INSERT') AS srv, (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.cloud_mails'::regclass) AS rls");
  ok(droits.anon === false && droits.auth === false && droits.srv === true && droits.rls === true, 'fermée aux clients (anon, authenticated), RLS activée, service_role seul', droits);

  const T = Date.now();
  const iso = (t) => new Date(t).toISOString();
  const J = 86_400_000;
  // ── 2. Arrêt pendant l'essai, trois canaux ──
  console.log('\n2. Arrêt PENDANT l\'essai : place et IP rendues tout de suite');
  const comptes = {
    apple: '00000000-0000-4000-8000-0000000000a1',
    google: '00000000-0000-4000-8000-0000000000b1',
    stripe: '00000000-0000-4000-8000-0000000000c1',
  };
  for (const [canal, id] of Object.entries(comptes)) {
    const ref = `${canal}-ref-1`;
    await q(`INSERT INTO public.profiles (id, email, lang, is_cloud, cloud_canal, cloud_ref, cloud_essai_debut, cloud_essai_fin, cloud_periode_fin, cloud_voie)
             VALUES ($1, $2, 'fr', false, $3, $4, $5, $6, $6, true)`, [id, `${canal}@exemple.invalid`, canal, ref, iso(T - 2 * J), iso(T + 5 * J)]);
    await q("INSERT INTO public.cloud_ips (ip, port, etat, user_id, attribuee_le) VALUES ($1, 12345, 'attribuee_essai', $2, now())", [`10.0.0.${Object.keys(comptes).indexOf(canal) + 1}`, id]);
    await q("INSERT INTO public.cross_post_jobs (user_id, platform, status, error, platform_fields) VALUES ($1, 'vinted', 'pending', 'attente', '{\"attente_verification_cloud\": {\"message\": \"attente\"}}')", [id]);
  }
  ok((await servis()).length === 3, 'avant : les 3 comptes en essai sont servis par le serveur Cloud');
  for (const [canal, id] of Object.entries(comptes)) {
    const ref = `${canal}-ref-1`;
    const avant = await profil(id);
    const t0 = Date.now();
    let update; let evs = [];
    if (canal === 'apple') {
      const lecture = lectureCloudApple({ productId: PRODUIT_CLOUD_APPLE, offerType: 1, offerDiscountType: 'FREE_TRIAL', purchaseDate: T - 2 * J, expiresDate: T + 5 * J, originalTransactionId: ref, transactionId: 't1', price: 0, currency: 'EUR' }, { autoRenewStatus: 0 });
      ({ update } = ecritureCloudStore({ canal, lecture, sens: 'annulation', ref, profil: avant }));
      evs = evenementsBoutique({ canal, nature: 'annulation', avant, update, lecture, ref });
    } else if (canal === 'google') {
      const lecture = lectureCloudGoogle(PRODUIT_CLOUD_GOOGLE, { startTime: iso(T - 2 * J), subscriptionState: 'SUBSCRIPTION_STATE_CANCELED', lineItems: [{ productId: PRODUIT_CLOUD_GOOGLE, expiryTime: iso(T + 5 * J), offerDetails: { offerId: OFFRE_ESSAI_CLOUD_GOOGLE }, autoRenewingPlan: { autoRenewEnabled: false } }] }, 3);
      ({ update } = ecritureCloudStore({ canal, lecture, sens: 'annulation', ref, profil: avant }));
      evs = evenementsBoutique({ canal, nature: 'annulation', avant, update, lecture, ref });
    } else {
      // cancel-subscription, essai : exactement ces colonnes (supabase/functions/cancel-subscription/index.ts).
      update = { is_cloud: false, cloud_essai_arrete: true, cloud_essai_fin: iso(Date.now()), cloud_arret_fin_periode: false };
      evs = [{ evenement: 'arret_essai', cle: ref }];
    }
    await ecrire(id, update);
    const ms = Date.now() - t0;
    const ip = await un('SELECT etat, user_id, liberee_le, repos_fin FROM public.cloud_ips WHERE dernier_user_id = $1 OR user_id = $1 OR id IN (SELECT ip_id FROM public.cloud_ip_evenements WHERE user_id = $1) LIMIT 1', [id]);
    const p = await profil(id);
    const job = await un('SELECT error, platform_fields FROM public.cross_post_jobs WHERE user_id = $1', [id]);
    ok(ip?.etat === 'repos' && ip?.user_id === null && ip?.liberee_le != null && p.cloud_voie === false && !(await servis()).includes(id)
      && job.error === null && !('attente_verification_cloud' in job.platform_fields),
      `${canal} : arrêt écrit → IP au repos (rendue), drapeau Cloud éteint, tâche rendue à l'extension, compte retiré des comptes servis — en ${ms} ms (le navigateur se ferme au tour suivant de l'orchestrateur, ≤ 60 s)`, { ip, cloud_voie: p.cloud_voie, job });
    ok(evs.length === 1 && evs[0].evenement === 'arret_essai', `${canal} : un événement de mail « arrêt pendant l'essai »`, evs);
    // Le registre : la clé réservée une fois.
    const r1 = await q('INSERT INTO public.cloud_mails (user_id, evenement, cle, canal) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING 1', [id, 'arret_essai', evs[0].cle, canal]);
    ok(r1.rowCount === 1, `${canal} : clé du mail réservée`);
    // ── 3. La même notification rejouée ──
    if (canal !== 'stripe') {
      const rejeu = ecritureCloudStore({ canal, lecture: { renouvellementAuto: false, phaseEssai: true }, sens: 'annulation', ref, profil: await profil(id) });
      await ecrire(id, rejeu.update);
      ok(rejeu.update === null && await liberations(id) === 1, `${canal} : notification rejouée → rien d'écrit, UNE seule libération d'IP`, rejeu);
    } else {
      await ecrire(id, update);   // cancel-subscription rappelé : mêmes valeurs (fin d'essai à la même instant)
      ok(await liberations(id) === 1, 'stripe : écriture identique rejouée → le déclencheur ne repart pas, UNE seule libération d\'IP');
    }
    let erreur = null;
    try { await q('INSERT INTO public.cloud_mails (user_id, evenement, cle, canal) VALUES ($1, $2, $3, $4)', [id, 'arret_essai', evs[0].cle, canal]); } catch (e) { erreur = e.code; }
    ok(erreur === '23505', `${canal} : la même clé une 2e fois → 23505 (aucun second mail)`, erreur);
  }
  // Dix réservations SIMULTANÉES, dix connexions.
  const clients = await Promise.all(Array.from({ length: 10 }, async () => { const c = new pg.Client({ connectionString: PG_URL }); await c.connect(); return c; }));
  const res = await Promise.allSettled(clients.map((c) => c.query("INSERT INTO public.cloud_mails (user_id, evenement, cle, canal) VALUES ($1, 'paiement', 'apple-ref-1:t9', 'apple')", [comptes.apple])));
  await Promise.all(clients.map((c) => c.end()));
  ok(res.filter((r) => r.status === 'fulfilled').length === 1 && res.filter((r) => r.status === 'rejected' && r.reason?.code === '23505').length === 9, 'dix réservations simultanées de la même clé : une seule passe, neuf refusées (23505)');

  // ── 4. Arrêt après l'essai, puis réabonnement / expiration ──
  console.log('\n4. Arrêt APRÈS l\'essai : programmé, coupure à l\'échéance ; réabonnement avant l\'échéance');
  const V = '00000000-0000-4000-8000-0000000000d1';
  await q(`INSERT INTO public.profiles (id, email, is_cloud, cloud_canal, cloud_ref, cloud_essai_debut, cloud_essai_fin, cloud_periode_fin, cloud_voie)
           VALUES ($1, 'v@exemple.invalid', true, 'apple', 'apple-ref-v', $2, $3, $4, true)`, [V, iso(T - 30 * J), iso(T - 23 * J), iso(T + 7 * J)]);
  await q("INSERT INTO public.cloud_ips (ip, port, etat, user_id) VALUES ('10.0.0.9', 1, 'attribuee_client', $1)", [V]);
  const txPaye = { productId: PRODUIT_CLOUD_APPLE, purchaseDate: T - 23 * J, expiresDate: T + 7 * J, originalTransactionId: 'apple-ref-v', transactionId: 't2', price: 24990, currency: 'EUR' };
  const a = ecritureCloudStore({ canal: 'apple', lecture: lectureCloudApple(txPaye, { autoRenewStatus: 0 }), sens: 'annulation', ref: 'apple-ref-v', profil: await profil(V) });
  await ecrire(V, a.update);
  let pv = await profil(V);
  ok(pv.cloud_arret_fin_periode === true && pv.is_cloud === true && (await servis()).includes(V) && (await un('SELECT etat FROM public.cloud_ips WHERE user_id = $1', [V]))?.etat === 'attribuee_client',
    'coupure en période payée : arrêt programmé, le Cloud tourne jusqu\'à l\'échéance (IP et place gardées)');
  const r = ecritureCloudStore({ canal: 'apple', lecture: { renouvellementAuto: true }, sens: 'reprise', ref: 'apple-ref-v', profil: pv });
  await ecrire(V, r.update);
  pv = await profil(V);
  ok(pv.cloud_arret_fin_periode === false && Number((await un('SELECT count(*) FROM public.cloud_ips WHERE user_id = $1', [V])).count) === 1 && await liberations(V) === 0,
    'réabonnement avant l\'échéance : arrêt levé, rien coupé, toujours UNE seule IP (aucune double place)');
  await ecrire(V, a.update);   // recoupé
  const fin = ecritureCloudStore({ canal: 'apple', lecture: lectureCloudApple({ ...txPaye, expiresDate: T - 1000 }, { autoRenewStatus: 0 }), sens: 'off', ref: 'apple-ref-v', profil: await profil(V) });
  await ecrire(V, fin.update);
  pv = await profil(V);
  ok(pv.is_cloud === false && pv.cloud_voie === false && !(await servis()).includes(V) && (await un("SELECT etat FROM public.cloud_ips WHERE dernier_user_id = $1 OR id = (SELECT ip_id FROM public.cloud_ip_evenements WHERE user_id = $1 AND nature = 'liberation' LIMIT 1)", [V]))?.etat === 'repos',
    'à l\'échéance (EXPIRED) : coupure réelle, IP rendue, compte retiré des comptes servis');

  // ── 5. Référence close ──
  console.log('\n5. Référence close (Nicotest)');
  const N = '00000000-0000-4000-8000-0000000000e1';
  await q("INSERT INTO public.profiles (id, email, is_cloud, cloud_canal, cloud_ref, cloud_essai_debut, cloud_essai_fin, cloud_essai_arrete) VALUES ($1, 'n@exemple.invalid', false, 'apple', 'ref-close', $2, $2, true)", [N, iso(T - 3 * J)]);
  await q("INSERT INTO public.cloud_refs_closes (ref, canal, user_id, raison) VALUES ('ref-close', 'apple', $1, 'bac à sable')", [N]);
  const on = ecritureCloudStore({ canal: 'apple', lecture: lectureCloudApple({ ...txPaye, originalTransactionId: 'ref-close', expiresDate: T + 30 * J }, { autoRenewStatus: 1 }), sens: 'on', ref: 'ref-close', profil: await profil(N) });
  await ecrire(N, on.update);
  const pn = await profil(N);
  ok(pn.is_cloud === false && pn.cloud_voie === false && !(await servis()).includes(N), 'un renouvellement de la référence close ne rallume rien (aucune place, aucune IP)');

  // ── Le compte supprimé emporte ses lignes ──
  await q('DELETE FROM public.profiles WHERE id = $1', [comptes.google]);
  ok(Number((await un('SELECT count(*) FROM public.cloud_mails WHERE user_id = $1', [comptes.google])).count) === 0, 'compte supprimé : ses lignes du registre partent avec lui');
} catch (e) {
  ko++; console.error('ERREUR', e.message, e.where ?? '');
} finally {
  await client.end().catch(() => {});
  if (embarque) { await embarque.pg.stop().catch(() => {}); try { embarque.rmSync(embarque.dossier, { recursive: true, force: true }); } catch { /* */ } }
}
console.log(`\n${ko === 0 ? 'PREUVE VERTE' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
