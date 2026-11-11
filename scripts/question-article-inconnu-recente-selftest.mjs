// selftest:question-article-inconnu-recente — UNE VENTE ANCIENNE D'UN ARTICLE INCONNU N'EST JAMAIS UNE QUESTION
// « RETIRE-LE AILLEURS » (01/11 ; migration 20261101073000, réparation scripts/reparations/20261101_…).
//
//   npm run selftest:question-article-inconnu-recente            contrôles du dépôt (hors ligne)
//   npm run selftest:question-article-inconnu-recente -- --prod  + la base, en LECTURE seule (après application)
//
//   A. la migration réécrit vente_vinted_lot_eclater DEPUIS la prod (garde md5) ; seul le bloc (D6) change ;
//      l'inverse rend la prod à l'octet et retire la règle ;
//   B. la règle : date connue et moins de 48 h à la lecture ; ancienne ou sans date = aucune question ;
//      rien d'autre ne change (vente écrite, décision, jamais un retrait, mail < 24 h) ;
//   C. la réparation : périmètre par la règle (123 / 125, les 2 récentes gardées), sauvegarde, aucune vente
//      touchée, aucun mail ; l'inverse rend chaque ligne ;
//   D. l'essai à blanc embarque la migration, la réparation et les deux inverses, et s'annule.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const MIG = lire('supabase/migrations/20261101073000_question_article_inconnu_vente_recente.sql');
const INV = lire('supabase/rollbacks/20261101073000_question_article_inconnu_vente_recente_INVERSE.sql');
const REP = lire('scripts/reparations/20261101_questions_article_inconnu_anciennes.sql');
const REP_INV = lire('scripts/reparations/20261101_questions_article_inconnu_anciennes_INVERSE.sql');
const ESSAI = lire('scripts/essais/20261101073000_essai.sql');

let echecs = 0, total = 0;
const ok = (c, l) => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}`); };
const md5 = (t) => crypto.createHash('md5').update(t, 'utf8').digest('hex');
// Le corps tel que pg_get_functiondef le rend : de CREATE à la fin de $function$, saut de ligne compris.
const fonction = (txt, nom) => {
  const i = txt.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  if (i < 0) return '';
  const j = txt.indexOf('$function$', txt.indexOf('$function$', i) + 10);
  return j < 0 ? '' : txt.slice(i, j + 10) + '\n';
};
const MD5_ECLATER = '003835978f4e9578e222bc87f5913560';

// ── A. Depuis la prod, à l'octet ─────────────────────────────────────────────
const prod = fonction(INV, 'vente_vinted_lot_eclater');
const neuf = fonction(MIG, 'vente_vinted_lot_eclater');
ok(md5(prod) === MD5_ECLATER, 'A1. l\'inverse rend vente_vinted_lot_eclater telle que relue en prod le 01/11 (md5 00383597…)');
ok(MIG.includes(`'${MD5_ECLATER}'`) && /raise exception 'définition de vente_vinted_lot_eclater changée en prod/.test(MIG),
  'A2. garde md5 : la migration s\'arrête si la définition a bougé');
const D6_AVANT = '            -- (D6) inconnu de FillSell : vente sans fiche, la question, JAMAIS un retrait.\n';
const D6_APRES = /            -- \(D6\) inconnu de FillSell : vente sans fiche, JAMAIS un retrait ; la question « retire-le ailleurs »\n.*\n.*sans question\.\n/;
const ramene = neuf.replace(D6_APRES, D6_AVANT)
  .replace('IF public.question_article_inconnu_due(v_le) AND NOT EXISTS (SELECT 1 FROM usage_logs u', 'IF NOT EXISTS (SELECT 1 FROM usage_logs u');
ok(neuf && neuf !== prod && ramene === prod, 'A3. la migration = la prod + le seul bloc (D6) (commentaire et condition de la question)');
ok(/drop function if exists public\.question_article_inconnu_due\(timestamptz, timestamptz\);/.test(INV)
  && /^begin;$/m.test(INV) && /^commit;$/m.test(INV), 'A4. l\'inverse retire la règle, en une transaction');

// ── B. La règle ──────────────────────────────────────────────────────────────
const regle = MIG.slice(MIG.indexOf('create or replace function public.question_article_inconnu_due'), MIG.indexOf('revoke all on function public.question_article_inconnu_due'));
ok(/p_vendu_le is not null and p_vendu_le >= coalesce\(p_lu_le, now\(\)\) - interval '48 hours'/.test(regle),
  'B1. une vente récente = date connue et moins de 48 h quand la commande est lue');
ok(/p_lu_le timestamptz default now\(\)/.test(regle) && /\bstable\b/.test(regle) && !/security definer/.test(regle),
  'B2. lue maintenant par défaut, rejouable à une date donnée (réparation), sans droits élevés');
ok(/revoke all on function public\.question_article_inconnu_due\(timestamptz, timestamptz\) from public, anon, authenticated;/.test(MIG)
  && /grant execute on function public\.question_article_inconnu_due\(timestamptz, timestamptz\) to service_role;/.test(MIG),
  'B3. la règle n\'est ouverte ni à anon ni à authenticated');
const d6 = neuf.slice(neuf.indexOf('-- (D6)'), neuf.indexOf("v_dec := 'article_inconnu'"));
const iVente = d6.indexOf('INSERT INTO ventes (user_id, inventaire_id, titre, prix_vente');
const iRegle = d6.indexOf('IF public.question_article_inconnu_due(v_le) AND NOT EXISTS');
ok(iVente >= 0 && iVente < iRegle && iRegle < d6.indexOf("INSERT INTO usage_logs (user_id, feature, metadata) VALUES (p_user, 'vente_vinted_article_inconnu'"),
  'B4. la vente s\'écrit toujours (ancienne ou récente) ; seule la question dépend de la règle');
ok(!/armer_retrait/.test(d6) && neuf.split('question_article_inconnu_due(').length === 2,
  'B5. jamais un retrait ; la règle n\'est lue qu\'à un seul endroit');
ok(neuf.includes("v_le >= now() - interval '24 hours'") && neuf.includes('push_noter_commande_vinted(p_user, p_ref, v_premiere'),
  'B6. le mail par commande de moins de 24 h est inchangé');

// ── C. La réparation ─────────────────────────────────────────────────────────
ok(REP.includes("(v.vendu_le IS NOT NULL AND v.vendu_le >= u.created_at - interval '48 hours') AS due")
  && regle.includes("p_vendu_le is not null and p_vendu_le >= coalesce(p_lu_le, now()) - interval '48 hours'"),
  'C1. périmètre = la même règle (48 h), jugée à l\'instant où chaque question a été posée, sans dépendre de la migration');
ok(/n_tot <> 125 OR n_anc <> 123 OR n_due <> 2 OR n_sans <> 0/.test(REP) && /compte 8a2eba68 serait neutralisée/.test(REP),
  'C2. 125 questions, 123 anciennes, 2 récentes gardées : sinon rien n\'est écrit');
ok(/CREATE TABLE public\._backup_0111_questions_article_inconnu AS/.test(REP) && /ENABLE ROW LEVEL SECURITY/.test(REP),
  'C3. sauvegarde des lignes entières, fermée');
ok(!/\b(DELETE|UPDATE|INSERT INTO)\s+(public\.)?(ventes|vinted_commandes_articles|ventes_operations|push_ventes|email_logs)\b/i.test(REP + REP_INV)
  && !/envoyer_mail|net\.http_post/i.test(REP + REP_INV), 'C4. aucune vente, composition, note ni mail touchés');
ok(/SET feature = 'vente_vinted_article_inconnu_ancienne'/.test(REP) && /\(u\.metadata - 'question'\)/.test(REP)
  && /'neutralisee'/.test(REP), 'C5. neutraliser = feature changée, texte de question retiré, trace du script');
ok(/SET feature = b\.feature, metadata = b\.metadata/.test(REP_INV) && /<> 123/.test(REP_INV)
  && /DROP TABLE public\._backup_0111_questions_article_inconnu;/.test(REP_INV), 'C6. l\'inverse rend chaque ligne puis retire la sauvegarde');

// ── D. L'essai à blanc ───────────────────────────────────────────────────────
const sansTx = (t) => t.split('\n').filter((l) => !/^(BEGIN|COMMIT|begin|commit);$/.test(l)).join('\n');
ok(ESSAI.includes(sansTx(MIG)) && ESSAI.includes(sansTx(INV)) && ESSAI.includes(sansTx(REP)) && ESSAI.includes(sansTx(REP_INV)),
  'D1. l\'essai embarque la migration, la réparation et les deux inverses à l\'octet');
ok(/^begin;$/m.test(ESSAI) && ESSAI.trimEnd().endsWith('rollback;') && !/^commit;$/im.test(ESSAI),
  'D2. l\'essai est une seule transaction annulée');

// ── --prod : la règle en place (LECTURE seule, après application) ────────────
if (process.argv.includes('--prod')) {
  const sql = `select jsonb_build_object(
    'regle', to_regprocedure('public.question_article_inconnu_due(timestamptz,timestamptz)') is not null,
    'eclater_neuf', md5(pg_get_functiondef('public.vente_vinted_lot_eclater(uuid,text,text)'::regprocedure)) = '${md5(neuf)}',
    'regle_fermee', not has_function_privilege('authenticated', 'public.question_article_inconnu_due(timestamptz,timestamptz)', 'execute'),
    'sauvegarde', (select count(*) from public._backup_0111_questions_article_inconnu),
    'neutralisees', (select count(*) from public.usage_logs where feature = 'vente_vinted_article_inconnu_ancienne'),
    'questions_nuit_restantes', (select count(*) from public.usage_logs where feature = 'vente_vinted_article_inconnu'
       and created_at >= '2026-11-01 00:00:00 Europe/Paris'::timestamptz and created_at < '2026-11-01 03:00:00 Europe/Paris'::timestamptz
       and user_id in ('8ac5bbda-0947-4612-82fd-effdaa3ca84a', 'cae7a20d-56c8-46a6-868c-ae1f885faa70', '8a2eba68-7a2d-4fc1-aab0-aba23189c33b')),
    'questions_anciennes_depuis', (select count(*) from public.usage_logs u left join public.ventes v on v.id = (u.metadata ->> 'vente')::bigint
       where u.feature = 'vente_vinted_article_inconnu' and u.created_at >= '2026-11-01 09:26:46 Europe/Paris'::timestamptz
         and not public.question_article_inconnu_due(v.vendu_le, u.created_at))) as r;`;
  // La requête passe par un fichier : sous Windows, le shell de spawnSync coupe une requête de plusieurs lignes.
  const fichier = path.join(os.tmpdir(), `question-article-inconnu-prod-${process.pid}.sql`);
  writeFileSync(fichier, sql, 'utf8');
  const res = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', `"${fichier}"`], { cwd: RACINE, encoding: 'utf8', shell: true });
  try { unlinkSync(fichier); } catch { /* fichier temporaire */ }
  const txt = String(res.stdout ?? '');
  let r = null;
  try { r = JSON.parse(txt.slice(txt.indexOf('{'))).rows?.[0]?.r; } catch { r = null; }
  ok(r && r.regle && r.eclater_neuf && r.regle_fermee && r.sauvegarde === 123 && r.neutralisees === 123
    && r.questions_nuit_restantes === 2 && r.questions_anciennes_depuis === 0, `PROD. règle et réparation en place : ${JSON.stringify(r)}`);
}

console.log(echecs ? `\n✗ ${echecs} échec(s) sur ${total}` : `\n✓ ${total} vérifications vertes`);
process.exit(echecs ? 1 : 0);
