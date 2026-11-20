// BANC JETABLE (PGlite) de 20261120230000_cloud_essai_place_promise (20/11/2026 soir, bloc D de Nico) : les fonctions de
// PROD relues le 20/11 à 21:00 (empreintes md5 vérifiées : l'INVERSE les recrée mot pour mot, corps-prod-2011.sql.txt porte leurs
// dépendances), la migration, l'inverse — rien ne touche la prod.
//   node scripts/bancs/place-promise-2011/banc.mjs
// Bouchons (hors de la décision) : cloud_comptes_a_servir (les titulaires d'une IP attribuée), cloud_voie_attendue (Cloud
// actif : payé ou essai en cours), cloud_hacher, cloud_journal, cloud_ip_refus_prouve, cloud_ip_rang_operateur.
// Cas : IP libre (inchangé) · aucune IP + achat en route (promesse, jamais la liste d'attente) · aucune IP + rien qui puisse
// venir (comme avant) · capacité pleine (« complet », comme avant) · IP livrée au contrôle d'entrée · rachat automatique et
// solde · rotation · places à offrir · la garde · l'inverse.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const lire = (f) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const MIG = lire('supabase/migrations/20261120230000_cloud_essai_place_promise.sql');
const INV = lire('supabase/rollbacks/20261120230000_cloud_essai_place_promise_INVERSE.sql');
const SOCLE = lire('scripts/bancs/place-promise-2011/corps-prod-2011.sql.txt');
const PROD = {
  'public.cloud_essai_preparer_moi(text)': '51608897cd01a66ab79faaa4894b9c23',
  'public.cloud_essai_permis(uuid)': '36c9fd88af13f4f109a5a6a806b45ab3',
  'public.cloud_places_libres()': 'b172962fee75ef0ce0865aacc83cde01',
  'public.cloud_vente_etat(uuid)': '6af6915c41c3a72174a32c5f70a68974',
  'public.cloud_attente_places_a_offrir()': 'aa323d97786cc80872611a70d65c2383',
};
const SOCLE_MD5 = {
  'public.cloud_param(text, integer)': '24b4776b23ab49e3196b5f043e798439',
  'public.cloud_ts(text)': '3a8b3fa5b21e04f68838152ae3ebdc10',
  'public.cloud_ip_attribuable(cloud_ips, uuid, text)': 'ab249231ef33da15064e67cf60b0eabd',
  'public.cloud_ip_controlee_avant_attribution(cloud_ips)': '62391529f6914787f1d3075644346600',
  'public.cloud_plateformes_du_compte(uuid)': '8f5f3bbe8d02dab58fa0315d906a6bbd',
  'public.cloud_ip_reserver(uuid)': 'b4343939ed4e4ea6209533f4e234cfb0',
  'public.cloud_actifs_sans_ip(uuid)': '460e0a8736e0d310c45cfc84bdce3335',
};
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d ? ` — ${String(d).slice(0, 500)}` : ''}`); } };

const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT NULLIF(current_setting('banc.uid', true), '')::uuid $f$;
CREATE TABLE public.coin_config (key text PRIMARY KEY, value integer, updated_at timestamptz DEFAULT now());
CREATE TABLE public.profiles (id uuid PRIMARY KEY, created_at timestamptz DEFAULT now(), is_cloud boolean, cloud_essai_debut timestamptz,
  cloud_essai_fin timestamptz, cloud_essai_arrete boolean);
CREATE TABLE public.cloud_ips (id bigint PRIMARY KEY, etat text NOT NULL, user_id uuid, dernier_user_id uuid, liberee_le timestamptz,
  livree_le timestamptz NOT NULL DEFAULT now() - interval '1 day', reserve_pour uuid, reserve_jusqu_au timestamptz, refus jsonb NOT NULL DEFAULT '{}'::jsonb,
  sante jsonb, quarantaine jsonb, expire_le timestamptz NOT NULL, attributions integer NOT NULL DEFAULT 0, attribuee_le timestamptz,
  derniere_origine text, repos_fin timestamptz, purge_preuve jsonb, purge_prouvee_le timestamptz, maj_le timestamptz DEFAULT now());
CREATE TABLE public.cloud_ip_commandes (id bigserial PRIMARY KEY, nature text NOT NULL DEFAULT 'achat', statut text NOT NULL DEFAULT 'demandee',
  quantite integer NOT NULL, prix_usd numeric, commande text, demandee_le timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.cloud_attente (user_id uuid PRIMARY KEY, demande_le timestamptz NOT NULL DEFAULT now(), derniere_le timestamptz NOT NULL DEFAULT now(),
  essais integer NOT NULL DEFAULT 1, inscrit_le timestamptz, notifie_le timestamptz);
CREATE TABLE public.cloud_essai_demandes (user_id uuid PRIMARY KEY, appareil_h text, comptes_h jsonb NOT NULL DEFAULT '[]'::jsonb,
  essai_permis boolean NOT NULL, raison text, demande_le timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.cloud_essai_empreintes (nature text, empreinte text, user_id uuid);
CREATE TABLE public.cloud_serveurs (nom text PRIMARY KEY, capacite integer NOT NULL, etat text NOT NULL, vu_le timestamptz, details jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE public.vinted_sync_runs (user_id uuid, vinted_user_id bigint);
CREATE TABLE public.cloud_coffre (user_id uuid, plateforme text, connecte boolean);
CREATE TABLE public.annonces_plateforme (user_id uuid, platform text, disparu_le timestamptz);
CREATE TABLE public.journal (ip bigint, nature text, user_id uuid);
CREATE FUNCTION public.cloud_comptes_a_servir() RETURNS TABLE(user_id uuid) LANGUAGE sql STABLE AS
  $f$ SELECT i.user_id FROM public.cloud_ips i WHERE i.etat IN ('attribuee_essai', 'attribuee_client') $f$;
CREATE FUNCTION public.cloud_voie_attendue(p_user uuid) RETURNS boolean LANGUAGE sql STABLE AS
  $f$ SELECT COALESCE((SELECT p.is_cloud IS TRUE OR (p.cloud_essai_fin > now() AND p.cloud_essai_debut <= now() AND p.cloud_essai_arrete IS NOT TRUE)
                       FROM public.profiles p WHERE p.id = p_user), false) $f$;
CREATE FUNCTION public.cloud_hacher(p_espace text, p_valeur text) RETURNS text LANGUAGE sql STABLE AS
  $f$ SELECT md5(p_espace || ':' || p_valeur) || md5(p_valeur) $f$;
CREATE FUNCTION public.cloud_ip_refus_prouve(p jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $f$ SELECT false $f$;
CREATE FUNCTION public.cloud_ip_rang_operateur(p jsonb) RETURNS integer LANGUAGE sql IMMUTABLE AS $f$ SELECT 0 $f$;
CREATE FUNCTION public.cloud_journal(p_ip bigint, p_nature text, p_user uuid, p_d jsonb) RETURNS void LANGUAGE sql AS
  $f$ INSERT INTO public.journal VALUES (p_ip, p_nature, p_user) $f$;
`);
// En prod, les corps de cloud_param et cloud_ts sont en CRLF (créés depuis un fichier Windows) : rejoués en CRLF.
const CRLF_EN_PROD = ['cloud_param', 'cloud_ts'];
await db.exec(SOCLE.split(/\n(?=-- cloud_)/)
  .map((b) => (CRLF_EN_PROD.some((x) => b.startsWith(`-- ${x} :`)) ? b.replace(/\n/g, '\r\n') : b)).join('\n'));
// Les 5 fonctions de prod = le corps de l'INVERSE (ses DROP … IF EXISTS ne trouvent rien : rejouable sur la prod d'avant).
await db.exec(INV);
await db.exec(`GRANT EXECUTE ON FUNCTION public.cloud_essai_preparer_moi(text) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.cloud_places_libres() TO authenticated;
  REVOKE ALL ON FUNCTION public.cloud_essai_permis(uuid), public.cloud_vente_etat(uuid), public.cloud_attente_places_a_offrir() FROM PUBLIC;`);
const md5 = async (sig) => (await db.query(`SELECT md5(pg_get_functiondef('${sig}'::regprocedure)) h`)).rows[0].h;
const empreintes = async (t) => { const r = {}; for (const s of Object.keys(t)) r[s] = await md5(s); return r; };
const egales = (a, b) => Object.keys(b).every((k) => a[k] === b[k]);

console.log('0. Le socle = la prod du 20/11 (empreintes md5)');
const socle = await empreintes(SOCLE_MD5);
ok(egales(socle, SOCLE_MD5), 'les 7 dépendances rejouées ont les empreintes de la prod', JSON.stringify(socle));
const avantMd5 = await empreintes(PROD);
ok(egales(avantMd5, PROD), 'les 5 fonctions rejouées par l’INVERSE ont les empreintes de la prod (la garde est éprouvée telle quelle)', JSON.stringify(avantMd5));

// ── Les données ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const U = (k) => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`;
const A = U(1), B = U(2), C = U(3), T1 = U(11), T2 = U(12);
const saine = `jsonb_build_object('verdict', 'saine', 'saine_le', now()::text)`;
/** cas : { cap, ips: [[id, etat, extra]], commandes: [[statut, quantite, prix]], params: {cle: val}, attente: [[user, inscrit, notifie]] } */
async function remplir({ cap = 4, ipsLibres = 0, ipsAchetees = 0, achetteGrillee = false, commandes = [], params = {}, attente = [] } = {}) {
  await db.exec(`DELETE FROM public.cloud_ips; DELETE FROM public.cloud_ip_commandes; DELETE FROM public.cloud_attente;
    DELETE FROM public.cloud_essai_demandes; DELETE FROM public.profiles; DELETE FROM public.coin_config; DELETE FROM public.cloud_serveurs;
    DELETE FROM public.journal;`);
  await db.exec(`INSERT INTO public.cloud_serveurs VALUES ('cloud-2', ${cap}, 'actif', now(), '{"service":{"apte":true}}');
    INSERT INTO public.profiles (id) VALUES ('${A}'), ('${B}'), ('${C}');
    INSERT INTO public.profiles (id, is_cloud) VALUES ('${T1}', true), ('${T2}', true);
    -- deux comptes servis (une IP chacun) : cap − 2 places serveur libres
    INSERT INTO public.cloud_ips (id, etat, user_id, dernier_user_id, sante, expire_le, attributions) VALUES
      (1, 'attribuee_client', '${T1}', '${T1}', ${saine}, now() + interval '20 days', 1),
      (2, 'attribuee_client', '${T2}', '${T2}', ${saine}, now() + interval '20 days', 1);`);
  for (let k = 0; k < ipsLibres; k++) {
    await db.exec(`INSERT INTO public.cloud_ips (id, etat, sante, expire_le) VALUES (${10 + k}, 'disponible', ${saine}, now() + interval '25 days')`);
  }
  for (let k = 0; k < ipsAchetees; k++) {
    await db.exec(`INSERT INTO public.cloud_ips (id, etat, sante, expire_le) VALUES (${20 + k}, 'achetee', ${achetteGrillee ? `'{"verdict":"grillee"}'::jsonb` : 'NULL'}, now() + interval '29 days')`);
  }
  for (const [statut, quantite, prix] of commandes) {
    await db.query(`INSERT INTO public.cloud_ip_commandes (statut, quantite, prix_usd) VALUES ($1, $2, $3)`, [statut, quantite, prix ?? null]);
  }
  for (const [k, v] of Object.entries(params)) await db.query(`INSERT INTO public.coin_config (key, value) VALUES ($1, $2)`, [`cloud_${k}`, v]);
  for (const [u, inscrit, notifie] of attente) {
    await db.query(`INSERT INTO public.cloud_attente (user_id, inscrit_le, notifie_le) VALUES ($1, $2, $3)`, [u, inscrit ? new Date(Date.now() - 3600_000).toISOString() : null, notifie ? new Date().toISOString() : null]);
  }
}
const vente = async (u) => (await db.query(`SELECT public.cloud_vente_etat($1::uuid) v`, [u])).rows[0].v;
const permis = async (u) => (await db.query(`SELECT public.cloud_essai_permis($1::uuid) p`, [u])).rows[0].p;
const libres = async () => Number((await db.query(`SELECT public.cloud_places_libres() n`)).rows[0].n);
const aOffrir = async () => Number((await db.query(`SELECT public.cloud_attente_places_a_offrir() n`)).rows[0].n);
const preparer = async (u) => { await db.query(`SELECT set_config('banc.uid', $1, false)`, [u]); return (await db.query(`SELECT public.cloud_essai_preparer_moi('appareil-${u.slice(-2)}') r`)).rows[0].r; };
const enAttente = async (u) => (await db.query(`SELECT count(*)::int n FROM public.cloud_attente WHERE user_id = $1`, [u])).rows[0].n === 1;
const reservee = async (u) => (await db.query(`SELECT id FROM public.cloud_ips WHERE reserve_pour = $1 AND reserve_jusqu_au > now()`, [u])).rows[0]?.id ?? null;
const promesse = async (u) => (await db.query(`SELECT place_promise_jusqu_au > now() p FROM public.cloud_essai_demandes WHERE user_id = $1`, [u])).rows[0]?.p ?? null;
const sansDates = (r) => { const x = { ...r }; delete x.place_jusqu_au; return x; };

/** Les cas joués AVANT (prod) puis APRÈS : la même photo, comparée. */
async function photo(cas, qui = A) {
  await remplir(cas);
  const v = await vente(qui);
  const r = await preparer(qui);
  return { v, r: sansDates(r), attente: await enAttente(qui), resa: await reservee(qui), permis: await permis(qui), libres: await libres(), offrir: await aOffrir() };
}
const CAS = {
  ipLibre: { ipsLibres: 1 },
  enRoute: { commandes: [['en_cours', 1, 4]] },
  rien: {},
  rienAchatsCoupes: { params: { ip_achats_auto: 0, ip_solde_cents: 7135 } },
  rachatSansSolde: { params: { ip_achats_auto: 1 } },
  rachatSoldeCourt: { params: { ip_achats_auto: 1, ip_solde_cents: 300 }, commandes: [['livree', 1, 4]] },
  rachatSolde: { params: { ip_achats_auto: 1, ip_solde_cents: 7135 }, commandes: [['livree', 1, 4]] },
  achetee: { ipsAchetees: 1 },
  acheteeGrillee: { ipsAchetees: 1, achetteGrillee: true },
  plein: { cap: 2, commandes: [['en_cours', 2, 8]] },
  rotation: { params: { ip_rotation: 1 } },
  attenteDevant: { commandes: [['en_cours', 1, 4]], attente: [[B, true, false]] },
};
console.log('1. AVANT (la prod du 20/11)');
const avant = {};
for (const [k, c] of Object.entries(CAS)) avant[k] = await photo(c);
ok(avant.ipLibre.r.ok === true && avant.ipLibre.resa != null, 'IP libre : la préparation réserve l’IP');
ok(avant.enRoute.v.raison === 'ip_en_preparation' && avant.enRoute.r.ok === false && avant.enRoute.attente === true && avant.enRoute.permis.fraiche === false,
  'LE DÉFAUT : aucune IP, achat en route → « ip_en_preparation », liste d’attente, paiement refusé (fraiche faux)', JSON.stringify(avant.enRoute));
ok(avant.plein.v.raison === 'complet' && avant.plein.attente === true, 'capacité pleine : « complet », liste d’attente');

console.log('2. La garde');
let refus = null;
try { await db.exec(MIG.replace("IS DISTINCT FROM '6af6915c41c3a72174a32c5f70a68974'", "IS DISTINCT FROM '00000000000000000000000000000000'")); } catch (e) { refus = e.message; }
const colonne = async () => (await db.query(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name = 'cloud_essai_demandes' AND column_name = 'place_promise_jusqu_au'`)).rows[0].n === 1;
ok(/a changé depuis sa relecture/.test(refus ?? '') && egales(await empreintes(PROD), PROD) && !(await colonne()),
  'une fonction différente : migration arrêtée, rien changé (ni fonction, ni colonne)', refus);

console.log('3. APRÈS la migration');
await db.exec(MIG);
ok(await colonne(), 'la colonne cloud_essai_demandes.place_promise_jusqu_au existe');
const apres = {};
for (const [k, c] of Object.entries(CAS)) apres[k] = await photo(c);
const meme = (k) => JSON.stringify(apres[k]) === JSON.stringify(avant[k]);
ok(meme('ipLibre'), 'IP libre : INCHANGÉ (vente, préparation, réservation, permis, places)', JSON.stringify({ avant: avant.ipLibre, apres: apres.ipLibre }));
const e = apres.enRoute;
ok(e.v.vente_possible === true && e.v.place === 'en_preparation' && e.v.raison === null && e.v.places === 1,
  'aucune IP + achat en route : la vente reste OUVERTE (place « en_preparation », 1 place)', JSON.stringify(e.v));
ok(e.r.ok === true && e.r.place === 'en_preparation' && e.attente === false && e.resa == null,
  '… la préparation PROMET la place (ok, « en_preparation ») — jamais la liste d’attente', JSON.stringify(e));
ok(e.permis.fraiche === true && e.permis.prepare === true, '… le paiement l’accepte (cloud_essai_permis.fraiche)', JSON.stringify(e.permis));
ok(e.libres === avant.enRoute.libres - 1, `… la promesse compte comme une réservation : places libres ${avant.enRoute.libres} → ${e.libres}`);
for (const k of ['rien', 'rienAchatsCoupes', 'rachatSansSolde', 'rachatSoldeCourt', 'acheteeGrillee']) {
  ok(meme(k) && apres[k].v.raison === 'ip_en_preparation' && apres[k].attente === true,
    `rien qui puisse venir (${k}) : COMME AVANT (« ip_en_preparation », liste d’attente)`, JSON.stringify({ avant: avant[k], apres: apres[k] }));
}
ok(apres.achetee.r.ok === true && apres.achetee.r.place === 'en_preparation' && apres.achetee.attente === false,
  'une IP livrée au contrôle d’entrée (« achetee ») : promesse', JSON.stringify(apres.achetee));
ok(apres.rachatSolde.r.ok === true && apres.rachatSolde.r.place === 'en_preparation' && apres.rachatSolde.attente === false,
  'rachat automatique allumé, solde noté qui paie une IP (71,35 $ ≥ 4 $) : promesse', JSON.stringify(apres.rachatSolde));
ok(meme('plein') && apres.plein.v.raison === 'complet', 'capacité pleine (achat en route quand même) : INCHANGÉ — « complet », liste d’attente',
  JSON.stringify({ avant: avant.plein, apres: apres.plein }));
ok(meme('rotation'), 'rotation : INCHANGÉ', JSON.stringify({ avant: avant.rotation, apres: apres.rotation }));
ok(apres.attenteDevant.r.ok === false && apres.attenteDevant.v.raison === 'ip_en_preparation',
  'un inscrit pas encore prévenu passe devant : la seule IP en route est pour lui (comme avant pour le suivant)', JSON.stringify(apres.attenteDevant));

console.log('4. Le parcours : une IP en route = une promesse, puis l’IP arrive');
await remplir(CAS.enRoute);
const pA = await preparer(A);
const vB = await vente(B), pB = await preparer(B);
ok(pA.place === 'en_preparation' && vB.raison === 'ip_en_preparation' && pB.ok === false && await enAttente(B),
  'A reçoit la promesse ; B, ensuite, voit la vente fermée (la seule IP en route est promise à A) — la règle d’avant pour lui', JSON.stringify({ pA, vB, pB }));
{
  await remplir({ cap: 5, commandes: [['en_cours', 2, 8]] });
  const [p1, p2, p3] = [await preparer(A), await preparer(B), await preparer(C)];
  ok(p1.place === 'en_preparation' && p2.place === 'en_preparation' && p3.ok === false && p3.raison === 'ip_en_preparation' && await enAttente(C),
    'deux IP en route : deux promesses (A, B) ; C, le 3e : la règle d’avant', JSON.stringify([p1, p2, p3]));
  await remplir(CAS.enRoute);
  await preparer(A);
}
await db.exec(`INSERT INTO public.cloud_ips (id, etat, sante, expire_le) VALUES (30, 'disponible', ${saine}, now() + interval '29 days');
  UPDATE public.cloud_ip_commandes SET statut = 'livree'`);
ok((await vente(C)).vente_possible === false && await aOffrir() === 0, 'l’IP arrive : elle va d’abord à la promesse de A (ni la vente de C, ni une place à offrir à la liste)');
const pA2 = await preparer(A);
ok(pA2.ok === true && pA2.place === undefined && Number(await reservee(A)) === 30 && await promesse(A) === null,
  'A refait sa préparation (paiement après 30 min) : l’IP lui est RÉSERVÉE, la promesse effacée', JSON.stringify(pA2));
await remplir(CAS.enRoute);
await preparer(A);
await db.exec(`UPDATE public.profiles SET cloud_essai_debut = now(), cloud_essai_fin = now() + interval '7 days' WHERE id = '${A}'`);
const actifs = Number((await db.query(`SELECT public.cloud_actifs_sans_ip(NULL) n`)).rows[0].n);
const promises = Number((await db.query(`SELECT public.cloud_promesses_en_cours(NULL) n`)).rows[0].n);
ok(actifs === 1 && promises === 0 && (await vente(B)).vente_possible === false,
  'A a payé (essai démarré) : compté « actif sans IP » (la suite existante), plus comme promesse — jamais deux fois', JSON.stringify({ actifs, promises }));

console.log('5. Droits');
const droit = async (sig) => (await db.query(`SELECT has_function_privilege('authenticated', '${sig}', 'EXECUTE') d`)).rows[0].d;
ok(await droit('public.cloud_essai_preparer_moi(text)') && await droit('public.cloud_places_libres()')
  && !(await droit('public.cloud_ip_a_venir()')) && !(await droit('public.cloud_promesses_en_cours(uuid)')),
  'l’app garde ses deux fonctions ; les deux nouvelles restent au serveur');

console.log('6. L’INVERSE');
await db.exec(INV);
ok(egales(await empreintes(PROD), PROD) && !(await colonne())
  && (await db.query(`SELECT to_regprocedure('public.cloud_ip_a_venir()') IS NULL AND to_regprocedure('public.cloud_promesses_en_cours(uuid)') IS NULL x`)).rows[0].x,
  'les 5 fonctions de prod reviennent (md5), les deux nouvelles et la colonne partent');
const retour = await photo(CAS.enRoute);
ok(JSON.stringify(retour) === JSON.stringify(avant.enRoute), 'la règle d’avant revient (achat en route : liste d’attente)');
await db.exec(INV);
ok(egales(await empreintes(PROD), PROD), 'l’inverse est rejouable');

console.log(ko ? `✗ ${ko} échec(s) sur ${n}` : `✓ banc place-promise : ${n}/${n}`);
await db.close();
process.exitCode = ko ? 1 : 0;
