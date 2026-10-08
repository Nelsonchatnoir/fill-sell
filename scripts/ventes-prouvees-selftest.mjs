// ═══════════════════════════════════════════════════════════════════════════
// selftest:ventes-prouvees — LES VENTES PROUVÉES S'ENREGISTRENT SEULES (08/10)
// ═══════════════════════════════════════════════════════════════════════════
// Le comportement (idempotence, « unavailable » seul, passage borné, deux
// passages simultanés, refus mémorisé, rattrapage puis inverse) est prouvé sur
// un VRAI Postgres jetable par scripts/ventes-prouvees-banc.mjs (57 contrôles,
// hors package.json comme les autres bancs : il exige embedded-postgres).
// Ce selftest, lui, tourne partout et garde les RÈGLES écrites :
//   1. la migration : preuve « sold » seulement, jamais « unavailable » ; la vente
//      passe par enregistrer_vente_atomique (aucun second chemin vers ventes ni
//      vers les retraits) ; verrou, bornes de nombre et de temps ; cron SQL pur
//      posé une fois ; armement daté (l'arriéré n'est jamais traité par le cron) ;
//   2. l'index partiel couvre exactement le filtre de la sélection ;
//   3. l'inverse retire tout ce que la migration pose ;
//   4. la veille (module partagé) : coupé, silence, erreur, retard, une alerte par heure ;
//   5. veille-cpu et l'ops-digest la lisent (et disent quand elle manque) ;
//   6. le rattrapage est À BLANC par défaut, lit la MÊME sélection, et n'écrit
//      qu'avec --appliquer --feu-vert-nico, sauvegarde d'abord, inverse prêt ;
//   7. le banc couvre les quatre cas exigés ;
//   8. le test mord : chaque mutation de la migration est détectée.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');
const MIG = lire('supabase/migrations/20261008233100_ventes_prouvees_automatiques.sql');
const IDX = lire('supabase/migrations/20261008233000_ventes_prouvees_index.sql');
const INV = lire('supabase/rollbacks/20261008233100_ventes_prouvees_automatiques_INVERSE.sql');
const VEILLE_CPU = lire('supabase/functions/veille-cpu/index.ts');
const DIGEST = lire('supabase/functions/ops-digest/index.ts');
const RATTRAPAGE = lire('scripts/reparations/20261008_rattrapage_ventes_prouvees.mjs');
const RATTRAPAGE_INV = lire('scripts/reparations/20261008_rattrapage_ventes_prouvees_INVERSE.sql');
const BANC = lire('scripts/ventes-prouvees-banc.mjs');
const { anomaliesVentesProuvees, deciderAlerteVentesProuvees, lignesVentesProuvees, VENTES_PROUVEES } =
  await import('../supabase/functions/_shared/ventes-prouvees.js');
const { corpsSelection, requeteSelection } = await import('./lib/ventes-prouvees-selection.mjs');

let ko = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { ko++; console.log(`✗ ${msg}`); } else console.log(`✓ ${msg}`); };
const sansCommentaires = (s) => s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

// ── 1. La migration ─────────────────────────────────────────────────────────
function reglesMigration(texte) {
  const r = [];
  const code = sansCommentaires(texte);
  let sel = '';
  try { sel = sansCommentaires(corpsSelection(texte)); } catch { r.push('sélection introuvable'); }
  if (!/^BEGIN;/m.test(texte) || !/^COMMIT;/m.test(texte)) r.push('transaction BEGIN/COMMIT');
  if (!/NON APPLIQUÉE/.test(texte)) r.push('en-tête « NON APPLIQUÉE »');
  // preuve « sold » seulement
  if (!/\(c\.platform_fields ->> 'sale_signal'\) = 'sold'/.test(sel)) r.push("filtre sale_signal = 'sold'");
  if (/'unavailable'/.test(sel)) r.push("« unavailable » accepté comme valeur");
  if (/sale_signal'\)?\s*(IN|<>|!=)/.test(sel)) r.push('sale_signal comparé autrement qu’à « sold »');
  if (!/s\.status = 'sold' AND s\.captured_at >= coalesce\(c\.published_at, c\.created_at\)/.test(sel)) r.push('preuve Vinted : dernier relevé « sold » après la mise en ligne');
  if (!/ORDER BY s\.captured_at DESC LIMIT 1/.test(sel)) r.push('preuve Vinted : le DERNIER relevé');
  if (!/'\{sale_evidence,state\}' = 'sold'/.test(sel) || !/'\{sale_evidence,exact\}' = 'true'/.test(sel) || !/'\{sale_evidence,listing_id\}' = btrim\(c\.platform_listing_id\)/.test(sel)) r.push('preuve page : état « sold », identifiant exact');
  if (!/AND p\.preuve_le >= p_depuis/.test(sel)) r.push('borne d’armement (p_depuis)');
  if (!/i\.statut = 'stock'/.test(sel) || !/i\.fusionne_dans IS NULL/.test(sel)) r.push('fiche en stock, non fondue');
  if (!/NOT EXISTS \(SELECT 1 FROM ventes_operations o/.test(sel)) r.push('reçu existant exclu');
  if (!/LIMIT greatest\(1, least\(coalesce\(p_limite, 25\), 1000\)\)/.test(sel)) r.push('sélection bornée');
  // la chaîne existante, et elle seule
  if (!/r := enregistrer_vente_atomique\(c\.user_id, NULL, p_job := c\.job_id, p_prix := c\.prix\);/.test(code)) r.push('vente par enregistrer_vente_atomique (chemin job)');
  if (/INSERT INTO (public\.)?ventes\b(?!_prouvees)/i.test(code)) r.push('INSERT direct dans ventes');
  if (/armer_retrait|armer_retraits_copies|poser_questions/i.test(code)) r.push('retrait armé hors de la chaîne existante');
  if (/UPDATE (public\.)?(inventaire|cross_post_jobs)\b/i.test(code)) r.push('UPDATE direct de inventaire / cross_post_jobs');
  if (/CREATE OR REPLACE FUNCTION public\.enregistrer_vente_atomique/.test(code)) r.push('enregistrer_vente_atomique réécrite');
  if (!/status = 'running'/.test(code)) r.push('relevé en cours : la vente attend');
  // le passage
  if (!/IF NOT pg_try_advisory_xact_lock\(hashtextextended\('ventes_prouvees_tick', 0\)\) THEN/.test(code)) r.push('verrou du passage');
  if (!/v_max\s+integer := greatest\(1, least\(coalesce\(p_max, 25\), 100\)\);/.test(code)) r.push('borne de nombre (≤ 100)');
  if (!/IF clock_timestamp\(\) - v_debut > v_budget THEN/.test(code)) r.push('budget de temps');
  if (!/SET statement_timeout TO '25s'/.test(code)) r.push('statement_timeout du passage');
  if (!/IF coalesce\(v_epoch, 0\) <= 0 THEN\s+RETURN jsonb_build_object\('issue', 'coupe'\)/.test(code)) r.push('coupé = rien');
  if (!/reessayer_apres > now\(\)/.test(code) || !/interval '6 hours'/.test(code)) r.push('refus mémorisé 6 h');
  if (!/EXCEPTION WHEN OTHERS THEN\s+-- Jamais un échec muet/.test(texte)) r.push('passage raté tracé');
  // le cron
  if (!/IF NOT EXISTS \(SELECT 1 FROM cron\.job WHERE jobname = 'ventes-prouvees-2min'\)/.test(code)) r.push('cron posé une seule fois');
  if (!/cron\.schedule\('ventes-prouvees-2min', '1-59\/2 \* \* \* \*', \$cmd\$SELECT public\.ventes_prouvees_tick\(\);\$cmd\$\)/.test(code)) r.push('cron SQL pur toutes les 2 min (minutes impaires)');
  if (/net\.http_post/.test(code)) r.push('pg_net dans la migration');
  // armement
  if (!/VALUES \('ventes_prouvees_auto_depuis', extract\(epoch FROM now\(\)\)::integer, now\(\)\)\s+ON CONFLICT \(key\) DO NOTHING/.test(code)) r.push('armement daté, jamais réécrit');
  if (!/INSERT INTO public\.coin_config_journal/.test(code)) r.push('armement journalisé');
  // droits
  for (const f of ['ventes_prouvees_a_enregistrer', 'enregistrer_vente_prouvee', 'ventes_prouvees_tick', 'ventes_prouvees_veille']) {
    if (!new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`).test(code)) r.push(`${f} fermée à anon/authenticated`);
  }
  for (const t of ['ventes_prouvees_passages', 'ventes_prouvees_refus', 'ventes_prouvees_alertes']) {
    if (!new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`).test(code) || !new RegExp(`REVOKE ALL ON public\\.${t} FROM anon, authenticated;`).test(code)) r.push(`${t} fermée`);
  }
  return r;
}
{
  const fautes = reglesMigration(MIG);
  ok(fautes.length === 0, `migration 20261008233100 : règles respectées${fautes.length ? ' — ' + fautes.join(' ; ') : ''}`);
}

// ── 2. L'index couvre le filtre ─────────────────────────────────────────────
ok(/CREATE INDEX CONCURRENTLY IF NOT EXISTS cross_post_jobs_signal_vendu_idx/.test(IDX) && !/BEGIN;/.test(IDX), 'index : CONCURRENTLY, hors transaction');
ok(/WHERE status = 'published' AND \(platform_fields ->> 'sale_signal'\) = 'sold';/.test(IDX)
  && /WHERE c\.status = 'published' AND \(c\.platform_fields ->> 'sale_signal'\) = 'sold'/.test(corpsSelection(MIG)), "index : son prédicat est celui de la sélection (l'index est utilisable)");

// ── 3. L'inverse ────────────────────────────────────────────────────────────
for (const [motif, texte] of [
  ["cron.unschedule('ventes-prouvees-2min')", 'retire le cron'],
  ['DROP FUNCTION IF EXISTS public.ventes_prouvees_tick(integer, integer);', 'retire le passage'],
  ['DROP FUNCTION IF EXISTS public.enregistrer_vente_prouvee(uuid);', "retire l'exécuteur"],
  ['DROP FUNCTION IF EXISTS public.ventes_prouvees_veille(integer);', 'retire la veille'],
  ['DROP FUNCTION IF EXISTS public.ventes_prouvees_a_enregistrer(timestamptz, integer, uuid, uuid, boolean);', 'retire la sélection'],
  ['DROP TABLE IF EXISTS public.ventes_prouvees_passages;', 'retire les tables'],
  ["DELETE FROM public.coin_config WHERE key = 'ventes_prouvees_auto_depuis'", "retire l'armement (journalisé)"],
  ['DROP INDEX CONCURRENTLY IF EXISTS public.cross_post_jobs_signal_vendu_idx;', "dit comment retirer l'index"],
]) ok(INV.includes(motif), `inverse : ${texte}`);

// ── 4. La veille (module partagé) ───────────────────────────────────────────
{
  const base = { arme: true, depuis: '2026-10-09T08:00:00Z', minutes_depuis_dernier_passage: 1, dernier_passage: { issue: 'fait', duree_ms: 4 },
    en_retard: 0, en_retard_comptes: 0, anterieures: 0, refus_actifs: 0, passages_24h: 700 };
  ok(anomaliesVentesProuvees(base).length === 0, 'veille : tout tourne → aucune anomalie');
  ok(anomaliesVentesProuvees({ ...base, arme: false, minutes_depuis_dernier_passage: 999 }).length === 0, 'veille : coupée volontairement → rien à surveiller');
  ok(anomaliesVentesProuvees({ ...base, minutes_depuis_dernier_passage: VENTES_PROUVEES.SILENCE_MAX_MIN + 1 }).some((a) => a.code === 'ne_tourne_plus'), 'veille : plus de 10 min sans passage → « ne tourne plus »');
  ok(!anomaliesVentesProuvees({ ...base, minutes_depuis_dernier_passage: VENTES_PROUVEES.SILENCE_MAX_MIN }).length, 'veille : 10 min pile → pas encore');
  ok(anomaliesVentesProuvees({ ...base, minutes_depuis_dernier_passage: null, dernier_passage: null }).some((a) => a.code === 'jamais_tourne'), 'veille : armée mais jamais tourné → anomalie');
  ok(anomaliesVentesProuvees({ ...base, dernier_passage: { issue: 'erreur' } }).some((a) => a.code === 'passage_en_erreur'), 'veille : dernier passage en erreur → anomalie');
  ok(anomaliesVentesProuvees({ ...base, en_retard: 2, en_retard_comptes: 1 }).some((a) => a.code === 'ventes_en_retard' && /2 ventes/.test(a.texte)), 'veille : preuves en retard → anomalie chiffrée');
  ok(anomaliesVentesProuvees({ ...base, anterieures: 90 }).length === 0, "veille : l'arriéré seul n'est pas une alerte directe (il est dans l'ops-digest)");
  ok(anomaliesVentesProuvees(null).some((a) => a.code === 'veille_illisible'), 'veille : illisible → anomalie');
  const t = Date.parse('2026-10-09T10:00:00Z');
  ok(deciderAlerteVentesProuvees({ veille: { ...base, en_retard: 1 }, maintenant: t }).action === 'alerte', 'alerte : anomalie grave → alerte');
  ok(deciderAlerteVentesProuvees({ veille: { ...base, en_retard: 1 }, derniereAlerte: new Date(t - 30 * 60_000).toISOString(), maintenant: t }).action === null, 'alerte : une par heure au plus');
  ok(deciderAlerteVentesProuvees({ veille: { ...base, en_retard: 1 }, derniereAlerte: new Date(t - 61 * 60_000).toISOString(), maintenant: t }).action === 'alerte', 'alerte : de nouveau après une heure');
  ok(deciderAlerteVentesProuvees({ veille: base, maintenant: t }).action === null, 'alerte : rien à dire → pas de mail');
  ok(lignesVentesProuvees({ ...base, arme: false }).some((l) => /COUPÉE/.test(l)) && lignesVentesProuvees(null).some((l) => /illisible/i.test(l)), "ops-digest : les lignes disent « coupée » et « illisible »");
}

// ── 5. veille-cpu et l'ops-digest la lisent ─────────────────────────────────
ok(/import \{ deciderAlerteVentesProuvees, VENTES_PROUVEES \} from "\.\.\/_shared\/ventes-prouvees\.js";/.test(VEILLE_CPU), 'veille-cpu importe la décision partagée');
ok(VEILLE_CPU.indexOf('const ventes = await veillerVentesProuvees(admin, maintenant);') > 0
  && VEILLE_CPU.indexOf('const ventes = await veillerVentesProuvees(admin, maintenant);') < VEILLE_CPU.indexOf('/customer/v1/privileged/metrics`'), 'veille-cpu lit les ventes AVANT les métriques (même si elles manquent)');
ok((VEILLE_CPU.match(/, ventes \}\);/g) ?? []).length >= 3 && /ventes \}\);\n\}\);\s*$/.test(VEILLE_CPU), 'veille-cpu rend le résultat des ventes dans chaque réponse');
ok(/rpc\("ventes_prouvees_veille"\)/.test(VEILLE_CPU) && /PGRST202/.test(VEILLE_CPU) && /from\("ventes_prouvees_alertes"\)\.insert/.test(VEILLE_CPU), 'veille-cpu : RPC, tolère la migration absente, note chaque alerte');
ok(/rpc\("ventes_prouvees_veille"\)/.test(DIGEST) && /ventes_prouvees: ventesAnomalies\.length/.test(DIGEST) && /code: "non_branchee"/.test(DIGEST), "ops-digest : la section compte comme anomalie, y compris « non branchée »");
ok(/🔴 Ventes prouvées : \$\{ventesAnomalies\.map/.test(DIGEST), "ops-digest : en tête de l'objet du mail");

// ── 6. Le rattrapage ────────────────────────────────────────────────────────
ok(/if \(APPLIQUER\) appliquer\(\); else aBlanc\(\);/.test(RATTRAPAGE), 'rattrapage : À BLANC par défaut');
ok(/set transaction read only;\nset local statement_timeout = '90s';/.test(RATTRAPAGE), 'rattrapage à blanc : lecture seule');
ok(/if \(!FEU_VERT\) \{ console\.error\('⛔ --appliquer exige --feu-vert-nico/.test(RATTRAPAGE) && /proname = 'enregistrer_vente_prouvee'/.test(RATTRAPAGE), 'rattrapage : écrire exige --feu-vert-nico et la migration appliquée');
ok(/requeteSelection\(\{ depuis: '-infinity'/.test(RATTRAPAGE) && /import \{ requeteSelection \} from '\.\.\/lib\/ventes-prouvees-selection\.mjs';/.test(RATTRAPAGE), 'rattrapage : la MÊME sélection, lue dans la migration');
ok(RATTRAPAGE.indexOf('requete(sqlSauvegarde(invs));') > 0 && RATTRAPAGE.indexOf('requete(sqlSauvegarde(invs));') < RATTRAPAGE.indexOf('const rows = requete(sqlLot(lot));'), 'rattrapage : sauvegarde AVANT les ventes');
{
  const codeRattrapage = RATTRAPAGE.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');   // sans les commentaires
  ok(/public\.enregistrer_vente_prouvee\(j\.id\)/.test(codeRattrapage) && !/armer_retrait|INSERT INTO public\.ventes\b/.test(codeRattrapage), 'rattrapage : la chaîne existante, aucun second chemin');
}
ok(/pg_advisory_xact_lock\(hashtextextended\('ventes_prouvees_tick', 0\)\)/.test(RATTRAPAGE), 'rattrapage : sous le verrou du cron');
ok(/cibles = lignes\.filter\(\(r\) => !r\.interne && douteDe\(r\)\.length === 0\)/.test(RATTRAPAGE), 'rattrapage : les douteux et les comptes internes ne sont jamais écrits');
for (const m of ['quantite_', 'annonce_non_prouvee', 'plusieurs_annonces_vivantes', 'vente_deja_liee', 'dressing_la_revoit_en_ligne', 'remise_en_ligne_possible', 'releve_en_cours', 'compte_interne']) {
  ok(RATTRAPAGE.includes(`'${m}`) || RATTRAPAGE.includes(`\`${m}`), `rattrapage : motif « à vérifier » ${m}`);
}
ok(/DELETE FROM public\.ventes WHERE id IN \(SELECT id FROM _v\);/.test(RATTRAPAGE_INV) && /_backup_0810_ventes_prouvees_inventaire/.test(RATTRAPAGE_INV) && /IRRÉVERSIBLE/.test(RATTRAPAGE_INV), "rattrapage : l'inverse défait depuis la sauvegarde et dit l'irréversible");
{
  const q = requeteSelection({ sansRefus: true });
  ok(!/\bp_(depuis|limite|user|job|ignorer_refus)\b/.test(q) && !/ventes_prouvees_refus/.test(q) && /AS sel\(job_id, user_id, inventaire_id, platform, listing_id, preuve, preuve_le, prix\)/.test(q), 'sélection extraite : paramètres remplacés, refus retirés avant la migration, colonnes nommées');
}

// ── 7. Le banc couvre les cas exigés ────────────────────────────────────────
for (const [code, quoi] of [['S1 ', 'idempotence'], ['S2 ', '« unavailable » seul'], ['S4 ', 'passage borné'], ['S5 ', 'deux passages simultanés'], ['S12 ', 'rattrapage puis inverse']]) {
  ok(BANC.includes(`ok(`) && BANC.includes(`'${code}`) || BANC.includes(`\`${code}`), `banc : ${quoi} (${code.trim()})`);
}
ok(/Promise\.all\(\[tick\(a\), tick\(b\)\]\)/.test(BANC) && /new pg\.Client/.test(BANC), 'banc : deux connexions réelles en même temps');
ok(/supabase\\\.\(co\|com\)/.test(BANC), 'banc : refuse la prod');

// ── 8. Le test mord ─────────────────────────────────────────────────────────
const mutations = [
  ['« unavailable » accepté', (s) => s.replace("(c.platform_fields ->> 'sale_signal') = 'sold'   -- l'index partiel", "(c.platform_fields ->> 'sale_signal') IN ('sold', 'unavailable')")],
  ['preuve Vinted : n’importe quel relevé', (s) => s.replace('ORDER BY s.captured_at DESC LIMIT 1)', 'LIMIT 1)')],
  ['sans borne d’armement', (s) => s.replace('AND p.preuve_le >= p_depuis', 'AND true')],
  ['sans verrou', (s) => s.replace("IF NOT pg_try_advisory_xact_lock(hashtextextended('ventes_prouvees_tick', 0)) THEN", 'IF false THEN')],
  ['sans borne de nombre', (s) => s.replace('least(coalesce(p_max, 25), 100)', 'coalesce(p_max, 25)')],
  ['sans budget', (s) => s.replace('IF clock_timestamp() - v_debut > v_budget THEN', 'IF false THEN')],
  ['second chemin vers ventes', (s) => s.replace('r := enregistrer_vente_atomique(', "INSERT INTO ventes (titre) VALUES ('x'); r := enregistrer_vente_atomique(")],
  ['retrait armé à côté', (s) => s.replace('DELETE FROM ventes_prouvees_refus WHERE job_id = c.job_id;', 'DELETE FROM ventes_prouvees_refus WHERE job_id = c.job_id; PERFORM armer_retraits_copies(c.inventaire_id, \'x\');')],
  ['cron par pg_net', (s) => s.replace('$cmd$SELECT public.ventes_prouvees_tick();$cmd$', "$cmd$SELECT net.http_post(url := 'x');$cmd$")],
  ['cron posé à chaque rejeu', (s) => s.replace("IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ventes-prouvees-2min') THEN", 'IF true THEN')],
  ['armement réécrit', (s) => s.replace('ON CONFLICT (key) DO NOTHING RETURNING key, value)', 'ON CONFLICT (key) DO UPDATE SET value = excluded.value RETURNING key, value)')],
  ['refus non mémorisé', (s) => s.replace("now() + interval '6 hours'", 'now()')],
  ['relevé en cours ignoré', (s) => s.replace("status = 'running' LIMIT 1) THEN", "status = 'jamais' LIMIT 1) THEN")],
  ['veille ouverte à tous', (s) => s.replace('REVOKE ALL ON FUNCTION public.ventes_prouvees_veille(integer) FROM PUBLIC, anon, authenticated;', '')],
];
let mordues = 0;
for (const [nom, f] of mutations) {
  const m = f(MIG);
  if (m === MIG) { console.log(`✗ mutation « ${nom} » : texte introuvable`); ko++; n++; continue; }
  if (reglesMigration(m).length > 0) mordues++; else console.log(`  mutation non détectée : ${nom}`);
}
ok(mordues === mutations.length, `le test mord : ${mordues}/${mutations.length} mutations de la migration détectées`);

console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ''}`);
process.exit(ko ? 1 : 0);
