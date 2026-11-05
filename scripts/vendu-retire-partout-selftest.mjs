// selftest:vendu-retire-partout — (05/11 soir, règle de Nico « VENDU QUELQUE PART = RETIRÉ PARTOUT », toutes plateformes ;
// séries et plusieurs exemplaires jamais concernés) contrôle STATIQUE de la migration 20261105240000_vendu_retire_partout
// et de son INVERSE (aucune base) :
//   1. l'INVERSE porte les définitions de PROD mot pour mot (md5 de pg_get_functiondef lus le 05/11 soir) ;
//   2. la migration réécrit DEUX fonctions (poser_questions_copies_non_prouvees, inventaire_doublon_decider) en ne faisant
//      qu'AJOUTER à la prod (une seule ligne changée : l'ordre de l'annonce montrée), en crée UNE (armer_retrait_annonce_pour),
//      un index, et rien d'autre (aucune donnée écrite, aucune autre fonction, aucun déclencheur) ;
//   3. la règle : chaque annonce vivante d'une pièce unique vendue devient la question « Déjà vendu ? » — jamais un retrait
//      d'office hors des dépôts prouvés (inchangés) ; les exclusions (série, plusieurs exemplaires, Opla, transaction
//      Leboncoin, mise en ligne après la vente, déclarée retirée, « À régler », plateforme de la vente) ;
//   4. le « Oui » retire L'ANNONCE MONTRÉE par son numéro (armer_retrait_annonce_pour, seulement sur le geste) ;
//   5. le Doudou de nicolas.menar nommé (cause prouvée), la preuve sur Postgres jetable présente.
// La preuve de bout en bout (Postgres jetable, AVANT / APRÈS / INVERSE) : scripts/preuve-vendu-retire-partout.mjs.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (cond, msg, detail = '') => { n++; if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}${detail ? `   ← ${String(detail).slice(0, 300)}` : ''}`); } };

const MIG = lire('supabase/migrations/20261105240000_vendu_retire_partout.sql');
const INV = lire('supabase/rollbacks/20261105240000_vendu_retire_partout_INVERSE.sql');
const PREUVE = lire('scripts/preuve-vendu-retire-partout.mjs');
const PROD = {
  poser_questions_copies_non_prouvees: 'c045dd68dcf39340dfb65249ca0b969f',
  inventaire_doublon_decider: '5ada387c781c2767cc0019c9845811c3',
};
const fonction = (sql, nom) => {
  const i = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  if (i < 0) return null;
  const j = sql.indexOf('AS $function$', i);
  const k = sql.indexOf('$function$', j + 'AS $function$'.length);
  return j < 0 || k < 0 ? null : sql.slice(i, k + '$function$'.length);
};
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const sansCommentaires = (s) => s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
// Les lignes de `a` (prod) se retrouvent toutes, dans l'ordre, dans `b` (neuve), sauf celles de `sauf`.
const ajoutsSeulement = (a, b, sauf = []) => {
  const la = a.split('\n').filter((l) => !sauf.includes(l)), lb = b.split('\n');
  let k = 0;
  for (const l of lb) if (k < la.length && l === la[k]) k++;
  return k === la.length ? null : la[k];
};

console.log('1. L\'INVERSE porte les définitions de PROD mot pour mot (md5 de pg_get_functiondef, lus le 05/11 soir)');
for (const [nom, m] of Object.entries(PROD)) {
  const f = fonction(INV, nom);
  ok(!!f && md5(f + '\n') === m, `${nom} : md5 ${m}`, f ? md5(f + '\n') : 'absente');
  ok(MIG.includes(m) && INV.includes(m), `${nom} : md5 de départ écrit dans la migration (garde) et dans l'inverse (vérification)`);
}
ok(/DROP FUNCTION IF EXISTS public\.armer_retrait_annonce_pour\(uuid, text, interval, boolean\);/.test(INV), 'l\'inverse retire la fonction neuve');
ok(/DROP INDEX IF EXISTS public\.inventaire_doublons_copie_annonce;/.test(INV), 'l\'inverse retire l\'index neuf');
ok(/^BEGIN;$/m.test(MIG) && /^COMMIT;$/m.test(MIG) && /^BEGIN;$/m.test(INV) && /^COMMIT;$/m.test(INV), 'migration et inverse : une seule transaction');
ok(/RAISE EXCEPTION 'poser_questions_copies_non_prouvees a changé en prod/.test(MIG) && /RAISE EXCEPTION 'inventaire_doublon_decider a changé en prod/.test(MIG),
  'la migration refuse de s\'appliquer si la prod a bougé depuis la lecture (md5)');

console.log('\n2. La migration ne fait qu\'AJOUTER à la prod : deux fonctions réécrites, une créée, un index, rien d\'autre');
const creees = [...MIG.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_0-9]+)\(/g)].map((x) => x[1]).sort();
ok(JSON.stringify(creees) === JSON.stringify(['armer_retrait_annonce_pour', 'inventaire_doublon_decider', 'poser_questions_copies_non_prouvees']), `fonctions : ${creees.join(', ')}`);
const pqA = fonction(INV, 'poser_questions_copies_non_prouvees'), pqB = fonction(MIG, 'poser_questions_copies_non_prouvees');
const ddA = fonction(INV, 'inventaire_doublon_decider'), ddB = fonction(MIG, 'inventaire_doublon_decider');
const LIGNE_ORDRE = '       ORDER BY a.vu_le DESC NULLS LAST LIMIT 1) ap ON true';
ok(!!pqB && ajoutsSeulement(pqA, pqB, [LIGNE_ORDRE]) === null, 'poser_questions_copies_non_prouvees : toutes les lignes de prod gardées, dans l\'ordre (sauf l\'ordre de l\'annonce montrée)',
  ajoutsSeulement(pqA, pqB ?? '', [LIGNE_ORDRE]));
ok(pqB?.includes("ORDER BY (a.listing_id = btrim(COALESCE(j.platform_listing_id, ''))) DESC, a.vu_le DESC NULLS LAST LIMIT 1) ap ON true"),
  'la question d\'un dépôt montre l\'annonce qui porte SON numéro (celle que son « Oui » retire)');
ok(!!ddB && ajoutsSeulement(ddA, ddB) === null, 'inventaire_doublon_decider : toutes les lignes de prod gardées, dans l\'ordre (ajout seulement)', ajoutsSeulement(ddA, ddB ?? ''));
const horsCorps = MIG.replace(/AS \$function\$[\s\S]*?\$function\$/g, '').replace(/DO \$garde\$[\s\S]*?\$garde\$;/g, '');
ok(!/\b(INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|TRUNCATE|ALTER\s+TABLE|DROP\s+)/i.test(sansCommentaires(horsCorps)), 'aucune donnée écrite, aucune table modifiée, rien de retiré par la migration');
ok(!/CREATE\s+(OR\s+REPLACE\s+)?TRIGGER/i.test(MIG) && !/cron\./i.test(sansCommentaires(MIG)), 'aucun déclencheur, aucune tâche planifiée (la règle joue à la vente, une fois)');
ok(/CREATE UNIQUE INDEX IF NOT EXISTS inventaire_doublons_copie_annonce ON public\.inventaire_doublons\s+USING btree \(user_id, \(\(preuves ->> 'annonce_id'\)\)\)\s+WHERE motif = 'copie_non_prouvee' AND NOT \(preuves \? 'job'\);/.test(MIG),
  'une question par annonce (index unique partiel, questions portées par l\'annonce seulement)');
ok(/REVOKE ALL ON FUNCTION public\.armer_retrait_annonce_pour\(uuid, text, interval, boolean\) FROM PUBLIC, anon, authenticated;/.test(MIG)
  && /GRANT EXECUTE ON FUNCTION public\.armer_retrait_annonce_pour\(uuid, text, interval, boolean\) TO service_role;/.test(MIG), 'armer_retrait_annonce_pour : serveur seulement');
for (const nom of ['armer_retraits_copies', 'armer_retrait_job_pour', 'retrait_job_prouve', 'rattachement_confirme', 'armer_retrait_job', 'enregistrer_vente_atomique']) {
  ok(!MIG.includes(`FUNCTION public.${nom}(`), `${nom} : non réécrite (règles du 05/11 et retrait d'office des dépôts prouvés inchangés)`);
}

console.log('\n3. La règle : aucune annonce vivante d\'une pièce unique vendue en silence — la question, jamais un retrait d\'office');
const bloc = pqB ? pqB.slice(pqB.indexOf('IF v_unique THEN'), pqB.indexOf('RETURN n;')) : '';
const blocCode = sansCommentaires(bloc);
ok(bloc.length > 0 && /INSERT INTO inventaire_doublons/.test(bloc) && /'copie_non_prouvee'/.test(bloc), 'chaque annonce vivante devient la question « Déjà vendu ? » (copie_non_prouvee)');
ok(!/armer_retrait|INSERT INTO cross_post_jobs|'delete'/.test(blocCode.replace(/d\.action = 'delete'/g, '')), 'jamais un retrait d\'office dans la règle de l\'annonce');
const exigences = [
  [/a\.disparu_le IS NULL AND a\.retiree_le IS NULL AND a\.ignoree_le IS NULL/, 'annonce vivante (ni disparue, ni retirée, ni écartée)'],
  [/a\.statut_plateforme IN \('en_ligne', 'en_verification'\)/, 'vue en ligne par le relevé'],
  [/v_vendu_sur <> lower\(a\.platform\)/, 'jamais la plateforme de la vente'],
  [/count\(\*\) <= 1 INTO v_vente, v_unique/, 'pièce unique : une vente au plus (plusieurs exemplaires jamais concernés)'],
  [/NOT public\.titre_en_serie\(v_inv\.user_id, c\.titre\)/, 'jamais un titre en série (titre_en_serie)'],
  [/COALESCE\(a\.quantite, 1\) <= 1/, 'jamais une annonce en quantité'],
  [/opla_sortie_passee\(\)/, 'jamais Opla (quittée le 10/10)'],
  [/transaction_plateforme, ''\) NOT IN \('pending', 'sold'\)/, 'jamais une annonce Leboncoin sous transaction (elle-même vendue)'],
  [/LEAST\(COALESCE\(a\.publiee_le, a\.created_at\), a\.created_at\) <= v_vente/, 'jamais une annonce mise en ligne après la vente (règle du 03/11)'],
  [/je l''ai retirée moi-même/, 'jamais une annonce que la personne a dit avoir retirée'],
  [/pending_removal', ''\) = 'true'/, 'jamais en double d\'une ligne « Vendu, encore en ligne — Retirer » de « À régler »'],
  [/q\.preuves ->> 'annonce_id' = a\.id::text/, 'jamais deux questions pour une annonce (un « Non » n\'est jamais reposé)'],
  [/d\.status IN \('pending', 'processing', 'needs_user'\)/, 'jamais une annonce dont le retrait est en cours'],
  [/public\.listing_designe\(a\.listing_id, j\.listing_url, j\.platform_listing_id\)/, 'une annonce portée par un dépôt publié sous SON numéro reste à la question du dépôt'],
  [/'portee_par', 'annonce'/, 'la question dit qu\'elle est portée par l\'annonce (aucun « job » : le « Oui » retire l\'annonce)'],
];
for (const [re, quoi] of exigences) ok(re.test(bloc) || (/v_unique/.test(re.source) && re.test(pqB ?? '') && /IF v_unique THEN/.test(bloc)), quoi);
ok(!/'job',/.test(bloc.slice(bloc.indexOf('jsonb_build_object('))), 'la question portée par l\'annonce n\'a pas de clé « job » (index par dépôt intact)');
ok(!/titre\s*=|ILIKE|similarity\(/i.test(blocCode.replace(/'titre', COALESCE/g, '')), 'jamais un rapprochement sur un titre (le titre n\'est que montré)');

console.log('\n4. Le « Oui » retire L\'ANNONCE MONTRÉE par son numéro — seulement sur le geste de la personne');
const ara = fonction(MIG, 'armer_retrait_annonce_pour') ?? '';
ok(/IF NOT COALESCE\(p_preuve_geste, false\) THEN\s+RETURN NULL;/.test(ara), 'sans le geste de la personne : rien');
ok(/i\.statut IS DISTINCT FROM 'vendu'/.test(ara) && /i\.fusionne_dans IS NOT NULL/.test(ara), 'seulement une fiche VENDUE, non fusionnée');
ok(/lower\(COALESCE\(NULLIF\(v\.plateforme_code, ''\), NULLIF\(v\.plateforme, ''\), ''\)\) = lower\(a\.platform\)/.test(ara), 'jamais la plateforme de la vente');
ok(/VALUES\s+\(a\.user_id, a\.inventaire_id, a\.platform, 'delete', 'pending', 'original',\s+COALESCE\(NULLIF\(btrim\(COALESCE\(a\.titre, ''\)\), ''\), i\.titre\), v_url, btrim\(a\.listing_id\), v_pf\)/.test(ara),
  'le retrait porte le NUMÉRO et le LIEN de l\'annonce (la ligne du relevé), jamais ceux d\'un dépôt');
ok(/'preuve', 'geste_deja_vendu'/.test(ara) && /'retrait_annonces'/.test(ara), 'preuve = le geste ; trace usage_logs « retrait_annonces »');
ok(/length\(btrim\(COALESCE\(a\.listing_id, ''\)\)\) < 4/.test(ara), 'un numéro de moins de 4 signes ne désigne rien');
const branche = ddB ? ddB.slice(ddB.indexOf('VENDU QUELQUE PART'), ddB.indexOf('    IF v_job IS NULL\n       OR NOT EXISTS')) : '';
ok(/v_del := armer_retrait_annonce_pour\(p_annonce_montree, 'copie_confirmee_vendue', interval '0', true\);/.test(branche),
  'inventaire_doublon_decider : le « Oui » appelle armer_retrait_annonce_pour sur L\'ANNONCE MONTRÉE');
ok(/IF v_job IS NULL OR EXISTS \(/.test(branche) && /AND NOT listing_designe\(a\.listing_id, j\.listing_url, j\.platform_listing_id\)\) THEN/.test(branche),
  '… quand la question est portée par l\'annonce, ou quand le numéro du dépôt désigne une AUTRE annonce');
ok(ddB.indexOf("RETURN jsonb_build_object('ok', false, 'reason', 'annonce_non_montree');") < ddB.indexOf('armer_retrait_annonce_pour'),
  'la garde « annonce montrée » passe AVANT (jamais un retrait sur une annonce que l\'écran n\'a pas montrée)');
ok((sansCommentaires(ddB).match(/armer_retrait_annonce_pour/g) ?? []).length === 1, 'un seul appel, dans la branche « Déjà vendu ? » (copie_non_prouvee)');

console.log('\n5. Le cas réel nommé, la preuve présente');
ok(/1790106697754007/.test(MIG) && /13627ae2/.test(MIG) && /3267000921/.test(MIG) && /3274924341/.test(MIG) && /d23190b7/.test(MIG),
  'le Doudou de nicolas.menar (fiche, dépôts, numéros) et sa cause sont écrits en tête de la migration');
ok(/Le numéro vide n'est PAS la cause/.test(MIG), 'la piste « Beebs sans numéro » vérifiée et écrite (pas la cause)');
ok(/APPLIQUÉE le 05\/11 à 22:21:06/.test(MIG), 'la migration se dit appliquée (05/11 22:21:06, feu vert nommé de Nico)');
ok(/PREUVE_PG/.test(PREUVE) && /supabase\\\.\(co\|com\)\|pooler/.test(PREUVE), 'la preuve refuse toute base qui n\'est pas jetable');
ok(/20261105240000_vendu_retire_partout\.sql/.test(PREUVE) && /20261105240000_vendu_retire_partout_INVERSE\.sql/.test(PREUVE), 'la preuve joue la migration et son inverse');
for (const k of ['casDoudou', 'casSerie', 'casNonProuve', 'casRattrapage', 'casExclusions']) ok(PREUVE.includes(`async function ${k}(`), `la preuve couvre ${k}`);

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n}`);
process.exit(ko ? 1 : 0);
