// selftest:delegation-leboncoin-releves — DÉLÉGATION LEBONCOIN : LES DEUX COMPTES LISENT LA MÊME BOUTIQUE, CHAQUE ANNONCE
// RESTE SUR SON COMPTE (01/11, Louis : louis-seller 114 / Amiral 313 annonces Leboncoin rattachées, une boutique « Clayton »)
//
//   npm run selftest:delegation-leboncoin-releves            contrôles du dépôt (hors ligne)
//   npm run selftest:delegation-leboncoin-releves -- --prod  + la base, en LECTURE seule
//
// Le relevé de louis-seller est fait par le compte de travail d'Amiral, sur la session Leboncoin d'Amiral : il lit donc
// toute la boutique (~410 annonces), comme le faisait la machine virtuelle. Ce qui garde chaque annonce sur SON compte
// ne change pas, à condition que TOUT s'écrive avec le jeton du compte qui relève :
//   A. extension : le relevé délégué crée/claim son run, écrit ses lignes (user_id = sujet du JETON) et appelle le moteur
//      (rapprocher_releve) avec le jeton du compte délégué — jamais celui de l'extension ; l'upsert reste sur la clé
//      (user_id, platform, listing_id) ;
//   B. serveur : le poll délégué ne sert que les relevés Leboncoin du propriétaire (lus sous SON jeton, RLS) ; les postes
//      du propriétaire n'en reçoivent plus ;
//   C. base (migrations du dépôt) : la garde « une annonce, un compte » (annonces_plateforme_un_compte) et le moteur
//      (rapprocher_releve : auth.uid() = run.user_id) sont ceux d'avant — aucune migration de ce lot ne les touche ;
//   D. --prod : aucune annonce Leboncoin vivante sur les deux comptes à la fois ; aucune annonce sauvegardée au moment de
//      la délégation (_backup_0111_delegation_lbc_annonces) n'est passée sur l'autre compte ; aucun doublon par compte.
import { readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const BG = lire('chrome-extension/background.js');
const GPJ = lire('supabase/functions/get-pending-jobs/index.ts');

let echecs = 0, total = 0;
const ok = (c, l) => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}`); };
const corps = (src, debut) => { const i = src.indexOf(debut); return i < 0 ? '' : src.slice(i, src.indexOf('\n}\n', i)); };

// ── A. extension ─────────────────────────────────────────────────────────────
const rel = corps(BG, 'async function lancerRelevePlateforme(');
ok(/const session = sessionFournie \?\? await getValidSession\(\);\n\s+if \(!session\?\.access_token\) return \{ ok: false, reason: "session" \};\n\s+const token = session\.access_token;\n\s+const userId = decodeJwtSub\(token\);/.test(rel),
  'A1. le relevé prend le jeton du compte qui relève (session fournie = compte délégué) et son identité DANS ce jeton');
ok(!/getValidSession\(\)/.test(rel.replace('sessionFournie ?? await getValidSession()', '')),
  'A2. aucune autre session lue pendant le relevé (aucun retour silencieux au compte de l\'extension)');
ok(/user_id: userId, platform, listing_id: String\(a\.listing_id\)/.test(rel) && /annonces_plateforme\?on_conflict=user_id,platform,listing_id", token/.test(rel),
  'A3. chaque ligne relevée porte le compte du JETON ; upsert sur (user_id, platform, listing_id) avec ce jeton');
ok(/rpc\/rapprocher_releve/.test(rel) && /Authorization: `Bearer \$\{token\}`/.test(rel),
  'A4. le moteur (rapprocher_releve) est appelé avec le même jeton : il ne juge que les annonces de ce compte');
ok(/vinted_sync_runs\?id=eq\.\$\{runId\}&status=eq\.queued`, token/.test(rel) && /body: JSON\.stringify\(\{ user_id: userId, kind: "annonces", platform, status: "running", declencheur/.test(rel),
  'A5. le run servi est réclamé, ou le run du relevé quotidien créé, au nom du compte du jeton');
const cyc = corps(BG, 'async function cycleDelegueUnCompte(');
ok((cyc.match(/lancerRelevePlateforme\(\{ platform: "leboncoin", declencheur: "[a-z_]+", (?:runId: cmd\.id, )?session: sD \}\)/g) ?? []).length === 3,
  'A6. les trois relevés délégués (servi, veille, quotidien) passent la session du compte délégué');
const qsd = corps(BG, 'async function releverQuotidien(');
ok(/lancerRelevePlateforme\(\{ platform, declencheur: "cron" \}\)/.test(qsd), 'A7. le relevé quotidien du compte de l\'extension : inchangé (sa propre session)');

// ── B. serveur ───────────────────────────────────────────────────────────────
// (02/11, facture Supabase) Les demandes en file se lisent en une fois sous le jeton du poll (lireCommandesEnFile,
// userClient), puis se filtrent en mémoire : même règle.
const lectureUnique = /const \{ data, error \} = await userClient\.from\("vinted_sync_runs"\)\.select\("id, kind, platform, queued_at, declencheur"\)/.test(GPJ);
const filtreDelegue = GPJ.includes('&& (delegationLbc ? c.platform === PLATEFORME_DELEGUEE : proprietaireDelegue ? c.platform !== PLATEFORME_DELEGUEE : true)).slice(0, 4);');
ok((/let qCmds = userClient\n\s+\.from\("vinted_sync_runs"\)/.test(GPJ) && /if \(delegationLbc\) qCmds = qCmds\.eq\("platform", PLATEFORME_DELEGUEE\);/.test(GPJ))
  || (lectureUnique && filtreDelegue),
  'B1. le poll délégué lit les relevés sous le jeton du propriétaire (RLS : les siens seulement), Leboncoin seulement');
ok(/else if \(proprietaireDelegue\) qCmds = qCmds\.neq\("platform", PLATEFORME_DELEGUEE\);/.test(GPJ) || filtreDelegue,
  'B2. les postes du propriétaire ne reçoivent plus aucun relevé Leboncoin (la machine virtuelle ne lit plus la boutique)');

// ── C. base ──────────────────────────────────────────────────────────────────
const migs = readdirSync(path.join(RACINE, 'supabase/migrations')).filter((f) => f.startsWith('202611011'));
const touche = migs.filter((f) => /annonces_plateforme_un_compte|rapprocher_releve|annonce_publiee_par_compte/.test(lire(`supabase/migrations/${f}`)));
ok(touche.length === 0, `C1. aucune migration du 01/11 après-midi ne touche la garde « une annonce, un compte » ni le moteur (${migs.length} lue(s))`);

// ── D. --prod (LECTURE seule) ────────────────────────────────────────────────
if (process.argv.includes('--prod')) {
  const A = 'faf5021a-479a-4bb3-b3ec-c296770739b7';
  const B = '447d920c-976a-4d8f-aff4-a2998050358c';
  const sql = `with a as (select user_id, listing_id, inventaire_id, disparu_le from public.annonces_plateforme
                where platform = 'leboncoin' and user_id in ('${A}', '${B}'))
  select jsonb_build_object(
    'par_compte', (select jsonb_object_agg(case user_id when '${A}' then 'compte-faf5021a' else 'seller' end, x) from (select user_id,
        jsonb_build_object('vivantes', count(*) filter (where disparu_le is null), 'rattachees', count(*) filter (where disparu_le is null and inventaire_id is not null)) x
        from a group by user_id) t),
    'vivantes_aux_deux', (select count(*) from a x join a y on x.listing_id = y.listing_id and x.user_id < y.user_id where x.disparu_le is null and y.disparu_le is null),
    'doublons_par_compte', (select count(*) from (select user_id, listing_id from a group by 1, 2 having count(*) > 1) d),
    'passees_a_l_autre', (case when to_regclass('public._backup_0111_delegation_lbc_annonces') is null then null else
        (select count(*) from public._backup_0111_delegation_lbc_annonces s join a on a.listing_id = s.listing_id and a.user_id <> s.user_id
          and a.disparu_le is null and a.inventaire_id is not null) end),
    'sauvegarde', (case when to_regclass('public._backup_0111_delegation_lbc_annonces') is null then null else
        (select jsonb_object_agg(case user_id when '${A}' then 'compte-faf5021a' else 'seller' end, n) from (select user_id, count(*) n from public._backup_0111_delegation_lbc_annonces group by 1) s) end)
  ) as r;`;
  const fichier = path.join(os.tmpdir(), `delegation-lbc-releves-prod-${process.pid}.sql`);
  writeFileSync(fichier, sql, 'utf8');
  const res = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', `"${fichier}"`], { cwd: RACINE, encoding: 'utf8', shell: true });
  try { unlinkSync(fichier); } catch { /* fichier temporaire */ }
  const txt = String(res.stdout ?? '');
  let r = null;
  try { r = JSON.parse(txt.slice(txt.indexOf('{'))).rows?.[0]?.r; } catch { r = null; }
  ok(r && r.vivantes_aux_deux === 0, `PROD1. aucune annonce Leboncoin vivante sur les deux comptes à la fois (${JSON.stringify(r?.par_compte)})`);
  ok(r && r.doublons_par_compte === 0, 'PROD2. aucun doublon d\'annonce dans un même compte');
  ok(r && (r.passees_a_l_autre === 0), `PROD3. aucune annonce sauvegardée à la délégation n'est passée (rattachée) sur l'autre compte (sauvegarde ${JSON.stringify(r?.sauvegarde)})`);
}

console.log(echecs ? `\n✗ ${echecs} échec(s) sur ${total}` : `\n✓ ${total} vérifications vertes`);
process.exit(echecs ? 1 : 0);
