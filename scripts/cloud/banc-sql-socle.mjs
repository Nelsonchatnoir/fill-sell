// BANC SQL du socle FillSell Cloud — la migration JOUÉE dans un vrai Postgres
// (PGlite, en mémoire), sans toucher la prod.
//
//   npm i --no-save @electric-sql/pglite@0.3.16     (une fois ; rien n'entre dans package.json)
//   node scripts/cloud/banc-sql-socle.mjs
//
// Ce qu'il prouve :
//   · 20261004233000 (paiements) puis 20261005120000 (socle) s'appliquent, DEUX
//     fois de suite (idempotence), puis l'INVERSE écrit en tête retire tout, puis
//     elles se rejouent ;
//   · l'IP DÉDIÉE : réservée avant le paiement, attribuée au début de l'essai,
//     convertie au paiement, jamais deux comptes sur une IP, jamais deux IP pour
//     un compte ; pool vide → refus + attente ; repos de 7 jours, purge prouvée,
//     contrôle de sortie, retour au pool ; le même compte reprend la sienne ;
//     signalement → rebut + une autre IP pour le titulaire ;
//   · l'essai unique : appareil, compte de plateforme (Vinted relevé), carte —
//     engagés au début RÉEL de l'essai seulement ;
//   · le coffre : une sauvegarde « déconnectée » n'écrase jamais une connexion ;
//   · les droits : tables fermées au client, trois fonctions « _moi » ouvertes ;
//   · le mail de la veille entre dans l'index one-shot (idempotent).
// Bouchons : auth (users, uid()), vault (secrets), profiles / coin_config /
// vinted_sync_runs / email_logs réduits aux colonnes lues, index one-shot de prod
// (14 types relus le 04/10).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let PGlite, pgcrypto;
try {
  ({ PGlite } = await import('@electric-sql/pglite'));
  ({ pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto'));
} catch {
  console.error('PGlite absent : npm i --no-save @electric-sql/pglite@0.3.16');
  process.exit(2);
}

const lire = (rel) => readFileSync(fileURLToPath(new URL(`../../supabase/migrations/${rel}`, import.meta.url)), 'utf8');
const PAIEMENTS = lire('20261004233000_option_cloud_paiements.sql');
const SOCLE = lire('20261005120000_cloud_socle_ip_dediee.sql');

let ko = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const titre = (t) => console.log(`\n${t}`);

const db = new PGlite({ extensions: { pgcrypto } });
const q = async (sql, params) => (await db.query(sql, params)).rows;
const un = async (sql, params) => (await q(sql, params))[0];
const val = async (sql, params) => Object.values((await un(sql, params)) ?? {})[0];
const echoue = async (sql, params) => { try { await db.query(sql, params); return null; } catch (e) { return String(e.message); } };

// ── Bouchons ──────────────────────────────────────────────────────────────────
await db.exec(`
  CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users (id));
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  CREATE SCHEMA vault;
  CREATE TABLE vault.secrets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE, secret text, description text);
  CREATE VIEW vault.decrypted_secrets AS SELECT id, name, secret AS decrypted_secret, description FROM vault.secrets;
  CREATE FUNCTION vault.create_secret(new_secret text, new_name text DEFAULT NULL, new_description text DEFAULT '')
    RETURNS uuid LANGUAGE sql AS $$ INSERT INTO vault.secrets (name, secret, description) VALUES (new_name, new_secret, new_description) RETURNING id $$;
  CREATE FUNCTION vault.update_secret(secret_id uuid, new_secret text DEFAULT NULL, new_name text DEFAULT NULL, new_description text DEFAULT NULL)
    RETURNS void LANGUAGE sql AS $$ UPDATE vault.secrets SET secret = COALESCE(new_secret, secret) WHERE id = secret_id $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    is_premium boolean, is_pro boolean, is_business boolean, is_comped boolean, lang text);
  GRANT SELECT ON public.profiles TO authenticated, service_role;
  CREATE TABLE public.coin_config (key text PRIMARY KEY, value integer, updated_at timestamptz DEFAULT now());
  CREATE TABLE public.vinted_sync_runs (id bigserial PRIMARY KEY, user_id uuid, vinted_user_id bigint);
  CREATE TABLE public.email_logs (id bigserial PRIMARY KEY, user_id uuid, email_type text);
  CREATE UNIQUE INDEX email_logs_one_shot_unique ON public.email_logs USING btree (user_id, email_type)
    WHERE (email_type = ANY (ARRAY['welcome'::text, 'how_it_works'::text, 'blast_relaunch_aout'::text, 'blast_founder'::text,
      'founder_plan'::text, 'voice_conversion'::text, 'blast_sync_dressing'::text, 'reactiv_1409_a'::text, 'reactiv_1409_b'::text,
      'reactiv_1409_c'::text, 'reactiv_1409_d'::text, 'extension_link_rattrapage'::text, 'stock_pret_2309'::text,
      'blast_rentree_fillsell50_2609'::text]));
`);
const U = {};
for (const nom of ['A', 'B', 'C', 'D', 'E', 'F']) {
  U[nom] = await val('SELECT gen_random_uuid()');
  await db.query('INSERT INTO auth.users VALUES ($1)', [U[nom]]);
  await db.query('INSERT INTO public.profiles (id) VALUES ($1)', [U[nom]]);
}

// ─────────────────────────────────────────────────────────────────────────────
titre('0. Application, idempotence, inverse');
await db.exec(PAIEMENTS);
await db.exec(SOCLE);
ok(true, 'paiements (20261004233000) puis socle (20261005120000) : appliquées');
await db.exec(PAIEMENTS);
await db.exec(SOCLE);
ok(true, 'rejouées une 2e fois sans erreur (idempotentes)');
const inverse = SOCLE.slice(SOCLE.indexOf('-- ── INVERSE'), SOCLE.indexOf('-- ═══', SOCLE.indexOf('-- ── INVERSE')))
  .split('\n').filter((l) => /^--   (?!--)/.test(l)).map((l) => l.slice(5)).join('\n');
await db.exec(inverse);
ok(Number(await val("SELECT count(*) FROM pg_tables WHERE tablename LIKE 'cloud\\_%'")) === 0, 'INVERSE : plus aucune table cloud_*');
ok(Number(await val("SELECT count(*) FROM pg_proc WHERE proname LIKE 'cloud\\_%' AND proname NOT IN ('cloud_etat','cloud_etat_moi')")) === 0,
  'INVERSE : plus aucune fonction cloud_* du socle (cloud_etat reste : elle est aux paiements)');
await db.exec(SOCLE);
ok(true, 'socle rejoué après l\'inverse');
ok(/cloud_essai_veille/.test(await val("SELECT indexdef FROM pg_indexes WHERE indexname = 'email_logs_one_shot_unique'")),
  'index one-shot : cloud_essai_veille ajouté');
ok((await val("SELECT indexdef FROM pg_indexes WHERE indexname = 'email_logs_one_shot_unique'")).match(/::text/g).length === 15,
  'index one-shot : 14 types de prod gardés + 1 (rejoué 3 fois, jamais dupliqué)');
ok(Number(await val("SELECT count(*) FROM pg_extension WHERE extname = 'btree_gist'")) === 0, 'btree_gist N\'EST PAS installée (inutile avec une IP dédiée)');

// ─────────────────────────────────────────────────────────────────────────────
titre('1. Le pool : livraison, contrôle d\'entrée');
await db.exec(`SELECT vault.create_secret('${'s'.repeat(64)}', 'cloud_empreinte_sel', 'sel')`);
const controle = (ip) => JSON.stringify({ fait_le: new Date().toISOString(), ip_sortie: ip, pays: 'FR', listes_noires: [], plateformes: { vinted: 'ok', leboncoin: 'ok' } });
const IP = {};
for (const [k, adr] of [['p1', '10.0.0.1'], ['p2', '10.0.0.2'], ['p3', '10.0.0.3']]) {
  IP[k] = Number(await val(`SELECT public.cloud_ip_ajouter($1, $2::inet, 12323, 'Paris', 'AS3215', 'http://u:p@${adr}:12323', now() + interval '30 days')`, [`c-${k}`, adr]));
}
ok(Number(await val("SELECT count(*) FROM vault.secrets WHERE name LIKE 'cloud_proxy_%'")) === 3, 'les URL des proxys vont au vault (3 secrets), jamais dans la table');
ok(!(await q('SELECT * FROM public.cloud_ips LIMIT 1')).some((r) => Object.values(r).some((v) => String(v).includes('u:p@'))), 'aucune colonne de cloud_ips ne contient d\'identifiant');
const mauvais = await un('SELECT public.cloud_ip_controle_entree($1, $2::jsonb) r', [IP.p3, JSON.stringify({ fait_le: new Date().toISOString(), ip_sortie: '9.9.9.9', pays: 'DE', listes_noires: [], plateformes: { vinted: 'ok' } })]);
ok(mauvais.r.ok === false && mauvais.r.demander_remplacement === true && mauvais.r.manques.includes('ip_sortie'), 'contrôle d\'entrée raté → rebut + remplacement à demander');
ok(await val('SELECT etat FROM public.cloud_ips WHERE id = $1', [IP.p3]) === 'rebut', '…l\'IP est au rebut');
for (const k of ['p1', 'p2']) await db.query('SELECT public.cloud_ip_controle_entree($1, $2::jsonb)', [IP[k], controle(k === 'p1' ? '10.0.0.1' : '10.0.0.2')]);
ok(Number(await val("SELECT count(*) FROM public.cloud_ips WHERE etat = 'disponible'")) === 2, 'contrôle bon → disponible (2 IP)');
const reAjout = await echoue(`SELECT public.cloud_ip_ajouter('c-x', '10.0.0.1'::inet, 1, null, null, 'http://x', now() + interval '30 days')`);
ok(reAjout != null, 'une IP vivante n\'existe qu\'une fois');

// ─────────────────────────────────────────────────────────────────────────────
titre('2. Préparer l\'essai (l\'app, AVANT le paiement) — place réservée');
const commeUser = async (u, sql, params) => {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${u}', false);`);
  try { return await un(sql, params); } finally { await db.exec('RESET ROLE'); }
};
await db.query('INSERT INTO public.vinted_sync_runs (user_id, vinted_user_id) VALUES ($1, 250623918)', [U.A]);
const pA = (await commeUser(U.A, "SELECT public.cloud_essai_preparer_moi('appareil-A') r")).r;
ok(pA.ok === true && pA.essai === true, 'A : préparation acceptée, essai permis');
ok(await val('SELECT count(*) FROM public.cloud_ips WHERE reserve_pour = $1', [U.A]) == 1, 'A : UNE IP réservée pour lui');
ok(Number(await val('SELECT count(*) FROM public.cloud_essai_empreintes')) === 0, 'aucune empreinte engagée avant le début réel de l\'essai (un abandon ne coûte rien)');
const pB = (await commeUser(U.B, "SELECT public.cloud_essai_preparer_moi('appareil-B') r")).r;
ok(pB.ok === true, 'B : préparation acceptée (2e IP réservée)');
const pC = (await commeUser(U.C, "SELECT public.cloud_essai_preparer_moi('appareil-C') r")).r;
ok(pC.ok === false && pC.raison === 'pool_vide', 'C : pool vide → refus « pool_vide », RIEN ne démarre');
ok(Number(await val('SELECT count(*) FROM public.cloud_attente WHERE user_id = $1', [U.C])) === 1, 'C : inscrit dans l\'attente');
const pA2 = (await commeUser(U.A, "SELECT public.cloud_essai_preparer_moi('appareil-A') r")).r;
ok(pA2.ok === true && Number(await val('SELECT count(*) FROM public.cloud_ips WHERE reserve_pour = $1', [U.A])) === 1, 'A prépare deux fois : toujours UNE seule réservation');
ok((await val('SELECT public.cloud_essai_permis($1)', [U.A])).permis === true, 'cloud_essai_permis(A) = permis (lu par le paiement)');
ok((await val('SELECT public.cloud_essai_permis($1)', [U.F])).raison === 'non_prepare', 'sans préparation → non permis (non_prepare)');

// ─────────────────────────────────────────────────────────────────────────────
titre('3. Le paiement démarre l\'essai → l\'IP réservée devient la sienne');
const ipReserveeA = await val('SELECT id FROM public.cloud_ips WHERE reserve_pour = $1', [U.A]);
await db.query("UPDATE public.profiles SET cloud_essai_debut = now(), cloud_essai_fin = now() + interval '7 days', cloud_canal = 'stripe' WHERE id = $1", [U.A]);
const ipA = await un('SELECT id, etat, user_id FROM public.cloud_ips WHERE user_id = $1', [U.A]);
ok(ipA && Number(ipA.id) === Number(ipReserveeA) && ipA.etat === 'attribuee_essai', 'A : SON IP réservée est attribuée (attribuee_essai) par le déclencheur');
ok(Number(await val("SELECT count(*) FROM public.cloud_essai_empreintes WHERE user_id = $1", [U.A])) === 2, 'A : empreintes engagées (appareil + compte Vinted relevé)');
ok(Number(await val('SELECT count(*) FROM public.cloud_essai_demandes WHERE user_id = $1', [U.A])) === 0, 'A : la préparation est consommée');
const viol = await echoue('UPDATE public.cloud_ips SET etat = \'attribuee_essai\', user_id = $1 WHERE id <> $2 AND etat = \'disponible\'', [U.A, ipA.id]);
ok(viol != null, 'un compte n\'a JAMAIS deux IP (index unique)');
const servir = await q('SELECT * FROM public.cloud_comptes_a_servir()');
ok(servir.length === 1 && servir[0].user_id === U.A && servir[0].etat_cloud === 'essai' && servir[0].ip === '10.0.0.1', 'cloud_comptes_a_servir : A, en essai, sur son IP');
ok(servir[0].delai_sessions_min === null, 'délai entre sessions : non tranché (null = navigateur en continu)');
await db.query("INSERT INTO public.coin_config (key, value) VALUES ('cloud_delai_sessions_min', 30)");
ok(Number((await q('SELECT * FROM public.cloud_comptes_a_servir()'))[0].delai_sessions_min) === 30, '…réglable par coin_config, sans migration');
await db.query("DELETE FROM public.coin_config WHERE key = 'cloud_delai_sessions_min'");

// ─────────────────────────────────────────────────────────────────────────────
titre('4. L\'essai unique — appareil, compte de plateforme, carte');
await db.query('INSERT INTO public.vinted_sync_runs (user_id, vinted_user_id) VALUES ($1, 250623918)', [U.D]);
await db.query("UPDATE public.cloud_ips SET reserve_pour = NULL, reserve_jusqu_au = NULL WHERE reserve_pour = $1", [U.B]);  // B abandonne
const pD = (await commeUser(U.D, "SELECT public.cloud_essai_preparer_moi('appareil-D') r")).r;
ok(pD.ok === true && pD.essai === false && pD.raison === 'compte_plateforme_deja_vu', 'D (même compte Vinted que A) : option possible, SANS essai (compte_plateforme_deja_vu)');
await db.query("UPDATE public.cloud_ips SET reserve_pour = NULL, reserve_jusqu_au = NULL WHERE reserve_pour = $1", [U.D]);
const pE = (await commeUser(U.E, "SELECT public.cloud_essai_preparer_moi('appareil-A') r")).r;
ok(pE.ok === true && pE.essai === false && pE.raison === 'appareil_deja_vu', 'E (même appareil que A) : SANS essai (appareil_deja_vu)');
ok((await val('SELECT public.cloud_essai_noter_carte($1, $2)', [U.A, 'fp_carte_1'])).ok === true, 'carte de A notée');
ok((await val('SELECT public.cloud_essai_noter_carte($1, $2)', [U.A, 'fp_carte_1'])).deja_note === true, 'rejeu : même compte, même carte → accepté');
ok((await val('SELECT public.cloud_essai_noter_carte($1, $2)', [U.E, 'FP_CARTE_1 '])).raison === 'carte_deja_vue', 'E, même carte (casse et espaces normalisés) → carte_deja_vue');
ok(!(await q('SELECT empreinte FROM public.cloud_essai_empreintes')).some((r) => /fp_carte|appareil-|250623918/i.test(r.empreinte)), 'aucune valeur brute en base (HMAC seulement)');

// ─────────────────────────────────────────────────────────────────────────────
titre('5. Compte de plateforme vu à la PREMIÈRE connexion Cloud');
await db.query("UPDATE public.cloud_ips SET reserve_pour = NULL, reserve_jusqu_au = NULL WHERE reserve_pour = $1", [U.E]);
const pB2 = (await commeUser(U.B, "SELECT public.cloud_essai_preparer_moi('appareil-B') r")).r;
ok(pB2.ok && pB2.essai, 'B prépare de nouveau (une place)');
await db.query("UPDATE public.profiles SET cloud_essai_debut = now(), cloud_essai_fin = now() + interval '7 days', cloud_canal = 'stripe' WHERE id = $1", [U.B]);
const ipB = await val('SELECT id FROM public.cloud_ips WHERE user_id = $1', [U.B]);
ok(ipB != null, 'B en essai, sur son IP');
ok((await val("SELECT public.cloud_essai_noter_compte_plateforme($1, 'leboncoin', 'lbc-77')", [U.A])).ok === true, 'A se connecte à Leboncoin (lbc-77) : noté');
const refusB = await val("SELECT public.cloud_essai_noter_compte_plateforme($1, 'leboncoin', 'lbc-77')", [U.B]);
ok(refusB.ok === false && refusB.raison === 'compte_plateforme_deja_vu' && refusB.annuler_abonnement_essai === true, 'B se connecte au MÊME Leboncoin → essai refusé, abonnement d\'essai à annuler');
ok((await val('SELECT public.cloud_etat($1)', [U.B])).etat === 'essai_termine', 'B : essai arrêté tout de suite (cloud_etat)');
ok(await val('SELECT etat FROM public.cloud_ips WHERE id = $1', [ipB]) === 'repos', 'B : son IP part au repos AUSSITÔT (arrêté = pas de grâce)');

// ─────────────────────────────────────────────────────────────────────────────
titre('6. Conversion, arrêt, fin d\'essai, grâce');
await db.query("UPDATE public.profiles SET is_cloud = true, cloud_periode_fin = now() + interval '30 days' WHERE id = $1", [U.A]);
ok(await val('SELECT etat FROM public.cloud_ips WHERE user_id = $1', [U.A]) === 'attribuee_client', 'A paie : l\'IP de l\'essai devient la sienne (attribuee_client), même IP');
// C revient : une place s'est libérée ? (B au repos : pas pour C) — le pool reste vide pour C
const pC2 = (await commeUser(U.C, "SELECT public.cloud_essai_preparer_moi('appareil-C') r")).r;
ok(pC2.ok === false && pC2.raison === 'pool_vide', 'C : une IP au repos n\'est JAMAIS donnée à un autre compte → toujours pool_vide');
// une nouvelle IP arrive
IP.p4 = Number(await val(`SELECT public.cloud_ip_ajouter('c-p4', '10.0.0.4'::inet, 12323, 'Paris', 'AS3215', 'http://u:p@10.0.0.4:12323', now() + interval '30 days')`));
await db.query('SELECT public.cloud_ip_controle_entree($1, $2::jsonb)', [IP.p4, controle('10.0.0.4')]);
const pC3 = (await commeUser(U.C, "SELECT public.cloud_essai_preparer_moi('appareil-C') r")).r;
ok(pC3.ok === true && Number(await val('SELECT count(*) FROM public.cloud_attente WHERE user_id = $1', [U.C])) === 0, 'nouvelle IP → C passe, et sort de l\'attente');
await db.query("UPDATE public.profiles SET cloud_essai_debut = now(), cloud_essai_fin = now() + interval '7 days', cloud_canal = 'apple' WHERE id = $1", [U.C]);
ok(await val('SELECT etat FROM public.cloud_ips WHERE user_id = $1', [U.C]) === 'attribuee_essai', "C : essai par l'App Store, IP attribuée");
await db.query("UPDATE public.profiles SET cloud_essai_debut = now() - interval '8 days', cloud_essai_fin = now() - interval '1 day' WHERE id = $1", [U.C]);
// C : essai fini hier, pas payé : grâce (2 j) → il garde son IP
const ipC = await val('SELECT id FROM public.cloud_ips WHERE user_id = $1', [U.C]);
ok(ipC != null, 'essai fini depuis 1 j, non payé : l\'IP reste pendant la grâce (le 1er paiement peut passer)');
const e1 = await val('SELECT public.cloud_pool_entretien()');
ok(await val('SELECT user_id FROM public.cloud_ips WHERE id = $1', [ipC]) === U.C, 'entretien : grâce respectée');
await db.query("UPDATE public.profiles SET cloud_essai_fin = now() - interval '3 days' WHERE id = $1", [U.C]);
ok(await val('SELECT etat FROM public.cloud_ips WHERE id = $1', [ipC]) === 'repos', 'grâce écoulée (fin il y a 3 j) : repos');
ok(e1 && typeof e1 === 'object', 'cloud_pool_entretien rend son bilan');

// ─────────────────────────────────────────────────────────────────────────────
titre('7. Repos, purge prouvée, retour au pool, retour du même compte');
const r1 = await un('SELECT liberee_le, repos_fin FROM public.cloud_ips WHERE id = $1', [ipC]);
ok(Math.round((new Date(r1.repos_fin) - new Date(r1.liberee_le)) / 86_400_000) === 7, 'repos de 7 jours (réglage repos_jours)');
const bloque = await val('SELECT public.cloud_ip_remettre_en_pool($1, $2::jsonb)', [ipC, controle('10.0.0.4')]);
ok(bloque.ok === false && bloque.manques.includes('repos_en_cours') && bloque.manques.includes('purge_non_prouvee'), 'avant la fin du repos et sans preuve : refus (repos_en_cours, purge_non_prouvee)');
const preuve = (le) => JSON.stringify({ version: 1, faite_le: le, profil: { ancien: 'p-old', nouveau: 'p-new', ancien_detruit: true, nouveau_cree_le: le },
  cookies_restants: 0, stockages_restants: 0, coffre_restants: 0, session_fillsell_revoquee: true,
  empreinte: { ancienne: 'e1', nouvelle: 'e2' }, identifiants_proxy_renouveles: true });
const pr = await val('SELECT public.cloud_ip_noter_purge($1, $2::jsonb)', [ipC, preuve(new Date(Date.now() + 1000).toISOString())]);
ok(pr.ok === true, 'preuve de purge complète : acceptée');
const prMauvaise = await val('SELECT public.cloud_ip_noter_purge($1, $2::jsonb)', [ipC, JSON.stringify({ version: 1 })]);
ok(prMauvaise.ok === false && prMauvaise.manques.length === 10 && !prMauvaise.manques.includes('version'), 'preuve vide (version seule) : les 10 autres manques nommés');
await db.query("UPDATE public.cloud_ips SET repos_fin = now() - interval '1 minute' WHERE id = $1", [ipC]);
// le même compte revient AVANT la sortie : il reprend la sienne
await db.query("UPDATE public.profiles SET is_cloud = true, cloud_canal = 'apple' WHERE id = $1", [U.C]);
ok(Number(await val('SELECT id FROM public.cloud_ips WHERE user_id = $1', [U.C])) === Number(ipC), 'C revient payer pendant le repos : il reprend SA propre IP');
ok(await val("SELECT nature FROM public.cloud_ip_evenements WHERE ip_id = $1 ORDER BY id DESC LIMIT 1", [ipC]) === 'retour_meme_compte', '…journalisé « retour_meme_compte »');
await db.query("UPDATE public.profiles SET is_cloud = false, cloud_essai_arrete = true WHERE id = $1", [U.C]);
ok(await val('SELECT etat FROM public.cloud_ips WHERE id = $1', [ipC]) === 'repos', 'C arrête l\'option : repos de nouveau (ancien CLIENT : l\'IP retournera AU POOL, décision du 05/10)');
await db.query('SELECT public.cloud_ip_noter_purge($1, $2::jsonb)', [ipC, preuve(new Date(Date.now() + 1000).toISOString())]);
await db.query("UPDATE public.cloud_ips SET repos_fin = now() - interval '1 minute' WHERE id = $1", [ipC]);
const sortie = await val('SELECT public.cloud_ip_remettre_en_pool($1, $2::jsonb)', [ipC, controle('10.0.0.4')]);
ok(sortie.ok === true && await val('SELECT etat FROM public.cloud_ips WHERE id = $1', [ipC]) === 'disponible', 'repos fini + purge prouvée + contrôle frais → disponible (ancien client compris)');

// ─────────────────────────────────────────────────────────────────────────────
titre('8. Signalement : rebut, et une autre IP pour le titulaire');
const ipAavant = await val('SELECT id FROM public.cloud_ips WHERE user_id = $1', [U.A]);
const sig = await val("SELECT public.cloud_ip_signaler($1, 'compte_restreint', '{}'::jsonb)", [ipAavant]);
ok(sig.rebut === true && sig.titulaire === U.A && sig.nouvelle_ip != null, 'IP de A signalée : rebut, et A reçoit une autre IP');
ok(await val('SELECT etat FROM public.cloud_ips WHERE id = $1', [ipAavant]) === 'rebut', 'l\'IP signalée ne sert plus jamais');
const badCrit = await echoue("SELECT public.cloud_ip_signaler($1, 'parce_que', '{}'::jsonb)", [ipAavant]);
ok(badCrit != null, 'critère inconnu : refusé');

// ─────────────────────────────────────────────────────────────────────────────
titre('9. Le coffre');
await db.query("SELECT public.cloud_coffre_ecrire($1, 'vinted', $2, 'AAAAAAAAAAAAAAAAAAAAAA==', 1, true)", [U.A, 'x'.repeat(40)]);
await db.query("SELECT public.cloud_coffre_ecrire($1, 'vinted', $2, 'BBBBBBBBBBBBBBBBBBBBBB==', 1, false)", [U.A, 'y'.repeat(40)]);
ok(await val("SELECT iv FROM public.cloud_coffre WHERE user_id = $1 AND plateforme = 'vinted'", [U.A]) === 'AAAAAAAAAAAAAAAAAAAAAA==', 'une sauvegarde « déconnectée » n\'écrase JAMAIS une connexion connue (leçon du 26/09)');
await db.query("SELECT public.cloud_coffre_ecrire($1, 'vinted', $2, 'CCCCCCCCCCCCCCCCCCCCCC==', 1, true)", [U.A, 'z'.repeat(40)]);
ok(await val("SELECT iv FROM public.cloud_coffre WHERE user_id = $1 AND plateforme = 'vinted'", [U.A]) === 'CCCCCCCCCCCCCCCCCCCCCC==', 'une connexion plus récente remplace la précédente');
const etatCoffre = (await commeUser(U.A, 'SELECT public.cloud_coffre_etat_moi() r')).r;
ok(etatCoffre.vinted?.connecte === true && !JSON.stringify(etatCoffre).includes('zzz'), 'cloud_coffre_etat_moi : « connecté », jamais le chiffré');
ok(Number(await val('SELECT public.cloud_coffre_vider($1)', [U.A])) === 1, 'cloud_coffre_vider : effacé');
const sCloud = await val('SELECT gen_random_uuid()'), sTel = await val('SELECT gen_random_uuid()');
await db.query('INSERT INTO auth.sessions VALUES ($1, $3), ($2, $3)', [sCloud, sTel, U.A]);
ok(Number(await val('SELECT public.cloud_session_revoquer($1, $2)', [U.F, sCloud])) === 0, "révocation : jamais la session d'un AUTRE compte");
ok(Number(await val('SELECT public.cloud_session_revoquer($1, $2)', [U.A, sCloud])) === 1
  && Number(await val('SELECT count(*) FROM auth.sessions WHERE id = $1', [sTel])) === 1, 'révocation : la session du navigateur Cloud, ELLE SEULE (celle du téléphone reste)');

// ─────────────────────────────────────────────────────────────────────────────
titre('10. Les droits');
const lecture = await (async () => { await db.exec(`SET ROLE authenticated`); try { await db.query('SELECT * FROM public.cloud_ips'); return null; } catch (e) { return e.message; } finally { await db.exec('RESET ROLE'); } })();
ok(/permission denied/.test(lecture ?? ''), 'authenticated ne lit PAS cloud_ips');
for (const f of ["public.cloud_ip_attribuer('" + U.F + "', 'essai')", "public.cloud_comptes_a_servir()", "public.cloud_coffre_lire('" + U.A + "')", "public.cloud_proxy_identifiants(1)", "public.cloud_essai_permis('" + U.A + "')"]) {
  const e = await (async () => { await db.exec('SET ROLE authenticated'); try { await db.query(`SELECT ${f}`); return null; } catch (x) { return x.message; } finally { await db.exec('RESET ROLE'); } })();
  ok(/permission denied/.test(e ?? ''), `authenticated n'appelle PAS ${f.split('(')[0]}`);
}
const sel = await (async () => { await db.exec('SET ROLE service_role'); try { await db.query('SELECT public.cloud_sel()'); return null; } catch (x) { return x.message; } finally { await db.exec('RESET ROLE'); } })();
ok(/permission denied/.test(sel ?? ''), 'le sel ne sort JAMAIS, même pour la clé de service');
const etatPool = await val('SELECT public.cloud_pool_etat()');
ok(etatPool && 'attribuables_essai' in etatPool && 'comptes_sans_place' in etatPool, 'cloud_pool_etat lisible (ops-digest)');

console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
