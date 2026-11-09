// ESSAI, SUR UN POSTGRES JETABLE, de la migration 20261109020000_formule_prevue (C4, 09/11/2026 nuit) — jamais la prod.
//   PREUVE_PG=embarque node scripts/essais/20261109020000_banc.mjs
// Décor : une table profiles réduite avec les rôles anon / authenticated / service_role et le GRANT UPDATE PAR COLONNE
// de la prod (le client n'écrit que ses colonnes à lui), plus une ligne existante.
//   A. la migration passe, deux fois (idempotente), sans toucher aux lignes existantes (toutes NULL) ;
//   B. la règle : rien de prévu (3 NULL) ou les trois cohérentes ; une valeur hors liste, une date manquante → refus ;
//   C. le client (authenticated) ne peut ni écrire ni insérer ces colonnes ; il les LIT ; service_role les écrit ;
//   D. l'inverse retire tout (colonnes et règle) et la ligne existante est intacte.
import pg from 'pg';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  embarque = new EmbeddedPostgres({ databaseDir: mkdtempSync(join(tmpdir(), 'fillsell-banc-formule-prevue-')), user: 'postgres', password: 'banc',
    port: 55454, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} });
  await embarque.initialise();
  await embarque.start();
  PG_URL = 'postgres://postgres:banc@127.0.0.1:55454/postgres';
}
const UID = '00000000-0000-4000-8000-000000000001';
const DECOR = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, email text, is_premium boolean DEFAULT false, is_pro boolean DEFAULT false,
  vinted_sync_pin text);
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT INSERT ON public.profiles TO authenticated;            -- comme la prod (relu le 09/11) : INSERT de table,
GRANT UPDATE (email, vinted_sync_pin) ON public.profiles TO authenticated;  -- UPDATE PAR COLONNE seulement
INSERT INTO public.profiles (id, email, is_premium, is_pro) VALUES ('${UID}', 'banc@exemple.invalid', true, true);
`;
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };
const client = new pg.Client({ connectionString: PG_URL });
await client.connect();
const q = (s, v) => client.query(s, v);
const refuse = async (s, v, motif) => { try { await q(s, v); return false; } catch (e) { return motif.test(e.message) ? true : (console.log('    (erreur :', e.message, ')'), false); } };
const enRole = async (role, s, v) => { await q('BEGIN'); try { await q(`SET LOCAL ROLE ${role}`); const r = await q(s, v); await q('COMMIT'); return r; } catch (e) { await q('ROLLBACK'); throw e; } };
try {
  await q(DECOR);
  console.log('A. La migration');
  await q(lire('supabase/migrations/20261109020000_formule_prevue.sql'));
  await q(lire('supabase/migrations/20261109020000_formule_prevue.sql'));
  const cols = (await q("SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'profiles' AND column_name LIKE 'formule_prevue%' ORDER BY 1")).rows;
  ok(cols.length === 3 && cols.every((c) => c.is_nullable === 'YES'), 'trois colonnes NULL possibles, migration passée deux fois (idempotente)');
  const ligne = (await q('SELECT * FROM public.profiles WHERE id = $1', [UID])).rows[0];
  ok(ligne.formule_prevue === null && ligne.formule_prevue_le === null && ligne.formule_prevue_canal === null && ligne.is_pro === true, 'la ligne existante : rien de prévu, droits intacts');

  console.log('B. La règle');
  await q("UPDATE public.profiles SET formule_prevue = 'premium', formule_prevue_le = now() + interval '20 days', formule_prevue_canal = 'stripe' WHERE id = $1", [UID]);
  ok((await q('SELECT formule_prevue FROM public.profiles WHERE id = $1', [UID])).rows[0].formule_prevue === 'premium', 'les trois cohérentes → acceptées (premium, date, stripe)');
  ok(await refuse("UPDATE public.profiles SET formule_prevue = 'business' WHERE id = $1", [UID], /profiles_formule_prevue_valeurs/), 'business (on ne DESCEND jamais vers Business) → refusé');
  ok(await refuse("UPDATE public.profiles SET formule_prevue = 'free' WHERE id = $1", [UID], /profiles_formule_prevue_valeurs/), 'free (= résilier, autre chemin) → refusé');
  ok(await refuse('UPDATE public.profiles SET formule_prevue_le = NULL WHERE id = $1', [UID], /profiles_formule_prevue_valeurs/), 'une formule sans date → refusée');
  ok(await refuse("UPDATE public.profiles SET formule_prevue_canal = 'paypal' WHERE id = $1", [UID], /profiles_formule_prevue_valeurs/), 'un canal inconnu → refusé');
  await q('UPDATE public.profiles SET formule_prevue = NULL, formule_prevue_le = NULL, formule_prevue_canal = NULL WHERE id = $1', [UID]);
  ok((await q('SELECT formule_prevue FROM public.profiles WHERE id = $1', [UID])).rows[0].formule_prevue === null, 'annuler = trois NULL → accepté');

  console.log('C. Qui écrit');
  ok(await refuse("SET ROLE authenticated; UPDATE public.profiles SET formule_prevue = 'premium', formule_prevue_le = now(), formule_prevue_canal = 'stripe'", [], /permission denied/), 'le client (authenticated) ne peut PAS écrire la formule prévue');
  await q('RESET ROLE');
  // L'INSERT de table (création du profil) : la règle CHECK tient même là — une valeur hors liste est refusée.
  ok(await refuse("SET ROLE authenticated; INSERT INTO public.profiles (id, formule_prevue, formule_prevue_le, formule_prevue_canal) VALUES (gen_random_uuid(), 'business', now(), 'stripe')", [], /profiles_formule_prevue_valeurs/), 'à l’insertion, la règle tient (business refusé)');
  await q('RESET ROLE');
  const lu = await enRole('authenticated', 'SELECT formule_prevue, formule_prevue_le, formule_prevue_canal FROM public.profiles WHERE id = $1', [UID]);
  ok(lu.rows.length === 1, 'le client LIT les trois colonnes (l’écran dit le changement prévu)');
  await enRole('authenticated', "UPDATE public.profiles SET vinted_sync_pin = '1234' WHERE id = $1", [UID]);
  ok((await q('SELECT vinted_sync_pin FROM public.profiles WHERE id = $1', [UID])).rows[0].vinted_sync_pin === '1234', 'ses autres colonnes restent écrivables (rien d’autre ne change)');
  await enRole('service_role', "UPDATE public.profiles SET formule_prevue = 'pro', formule_prevue_le = now() + interval '3 days', formule_prevue_canal = 'apple' WHERE id = $1", [UID]);
  ok((await q('SELECT formule_prevue FROM public.profiles WHERE id = $1', [UID])).rows[0].formule_prevue === 'pro', 'service_role (les fonctions de paiement) l’écrit');

  console.log('D. L’inverse');
  await q(lire('supabase/rollbacks/20261109020000_formule_prevue_INVERSE.sql'));
  const reste = (await q("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'profiles' AND column_name LIKE 'formule_prevue%'")).rows[0].n;
  const regle = (await q("SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'profiles_formule_prevue_valeurs'")).rows[0].n;
  const apres = (await q('SELECT is_premium, is_pro, email FROM public.profiles WHERE id = $1', [UID])).rows[0];
  ok(reste === 0 && regle === 0 && apres.is_pro === true && apres.email === 'banc@exemple.invalid', 'inverse : colonnes et règle retirées, ligne intacte');
  console.log(`\n${n}/${n} — banc vert.`);
} finally {
  await client.end().catch(() => {});
  if (embarque) await embarque.stop().catch(() => {});
}
