// selftest:commande-annulee-jamais-vente — une commande échouée, annulée ou
// remboursée n'est JAMAIS une vente, quelle que soit sa date ; les copies retirées
// à cause d'une vente annulée reviennent par les jobs normaux (18/10, règle de
// Nico ; migration 20261018000000).
//
//   npm run selftest:commande-annulee-jamais-vente            contrôles du dépôt
//   npm run selftest:commande-annulee-jamais-vente -- --prod  + la base (définitions, droits, sauvegarde)
//
//   1. la migration part des trois corps de prod (gardes md5), les GARDE (sauvegarde)
//      et ne touche que la règle ;
//   2. vente_commande_annulee_vinted : plus de date-charnière, vente saisie seulement
//      signalée, copies retirées à cause de la vente → remises_en_vente (jamais un
//      dépôt direct), aucun mail ;
//   3. remises_en_vente_tick : accepte le dépôt `cancelled` marqué, toutes ses autres
//      gardes intactes ;
//   4. ventes_statut_classe : canceled/cancelled Vinted et refunded eBay annulées ;
//   5. l'inverse rejoue la sauvegarde et vérifie les md5 ;
//   6. l'essai à blanc = gabarit + corps EXACTS (migration, inverse), ROLLBACK ;
//   7. les réparations (3 ventes, note 2348) : gardes, sauvegardes, compteurs de mails,
//      inverse présent ;
//   8. les règles écrites (docs/regles/ventes-et-retraits.md).
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const MIG = lire('supabase/migrations/20261018000000_commande_annulee_jamais_une_vente.sql');
const INV = lire('supabase/rollbacks/20261018000000_commande_annulee_jamais_une_vente.sql');
const GAB = lire('scripts/essais/20261018000000_essai.template.sql');
const ESS = lire('scripts/essais/20261018000000_essai.sql');
const GEN = lire('scripts/essais/20261018000000_generer.mjs');
const REP = lire('scripts/reparations/20261018_ventes_commandes_failed.sql');
const REP_INV = lire('scripts/reparations/20261018_ventes_commandes_failed_INVERSE.sql');
const NOTE = lire('scripts/reparations/20261018_note_2348_louis_12_euros.sql');
const NOTE_INV = lire('scripts/reparations/20261018_note_2348_louis_12_euros_INVERSE.sql');
const DOC = lire('docs/regles/ventes-et-retraits.md');

let echecs = 0, total = 0;
const ok = (c, l) => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}`); };
const fonction = (txt, nom) => {
  const i = txt.search(new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${nom}\\(`));
  if (i < 0) return '';
  const j = txt.indexOf('$function$', txt.indexOf('$function$', i) + 10);
  return j < 0 ? '' : txt.slice(i, j + 10);
};
const corps = (txt, debut, fin) => { const d = txt.indexOf(debut), f = txt.indexOf(fin); return d < 0 || f < 0 ? '' : txt.slice(d, f + fin.length); };

// 1
ok(/IS DISTINCT FROM '611992961f9c880c3a7b2291de920e6b'/.test(MIG) && /IS DISTINCT FROM 'cfb649bcad9b6d3fa071958c221d80ba'/.test(MIG)
  && /IS DISTINCT FROM '04783ef73ab0e604e984fe70fd6b99a1'/.test(MIG) && MIG.indexOf('DO $garde$') < MIG.indexOf('CREATE OR REPLACE FUNCTION'),
  '1. gardes md5 des trois corps de prod (18/10), avant toute définition');
ok(/CREATE TABLE IF NOT EXISTS public\._backup_1810_fonctions_commande_annulee/.test(MIG)
  && /SELECT 1, 'vente_commande_annulee_vinted', d, md5\(d\) FROM pg_get_functiondef/.test(MIG)
  && /SELECT 2, 'remises_en_vente_tick', d, md5\(d\)/.test(MIG) && /SELECT 3, 'ventes_statut_classe', d, md5\(d\)/.test(MIG)
  && /REVOKE ALL ON public\._backup_1810_fonctions_commande_annulee FROM PUBLIC, anon, authenticated/.test(MIG),
  '1b. les trois définitions d\'avant sont gardées (ordre, nom, def, md5), fermées à l\'app');
ok(/^BEGIN;$/m.test(MIG) && /^COMMIT;$/m.test(MIG) && /SET LOCAL lock_timeout = '5s'/.test(MIG), '1c. une transaction, lock_timeout 5 s');

// 2
const V = fonction(MIG, 'vente_commande_annulee_vinted');
ok(V.length > 2000 && !/2026-10-13/.test(V) && !/annulation_anterieure_a_la_regle/.test(V) && !/p_commande_le, v\.created_at\) </.test(V),
  '2. plus aucune date-charnière : la commande annulée est retirée quelle que soit sa date');
ok(/IF NOT \(coalesce\(v\.source, ''\) = 'releve' OR j\.id IS NOT NULL\) THEN/.test(V) && /'motif', 'vente_saisie_jamais_retiree'/.test(V)
  && /RETURN jsonb_build_object\('action', 'signalee'\)/.test(V), '2b. une vente saisie à la main est seulement signalée');
const boucle = V.slice(V.indexOf("v_rendue := 'fiche';"), V.indexOf("ELSIF i.statut = 'stock' THEN"));
ok(/d\.action = 'delete' AND d\.status = 'deleted'/.test(boucle) && /d\.platform <> 'vinted'/.test(boucle)
  && /'\{arme_par,chemin\}' = 'vente_article_serveur'/.test(boucle) && /<= 120/.test(boucle)
  && /p\.status = 'cancelled'/.test(boucle) && /p\.platform = d\.platform/.test(boucle),
  '2c. copies = retraits ABOUTIS d\'une autre plateforme, armés par la vente (± 2 min), dépôt annulé — jamais le titre');
ok(/jsonb_build_object\('vente_annulee_remise', jsonb_build_object\('vente', v\.id, 'commande', p_commande, 'statut', p_statut, 'le', now\(\)\)\)/.test(boucle)
  && /INSERT INTO remises_en_vente \(user_id, inventaire_id, platform, job_vendu, prochain_essai\)/.test(boucle)
  && /ON CONFLICT \(job_vendu\) DO UPDATE/.test(boucle) && /WHERE remises_en_vente\.statut <> 'faite'/.test(boucle)
  && !/INSERT INTO cross_post_jobs/.test(V), '2d. une ligne de file par copie (dépôt marqué), jamais un dépôt direct depuis la règle');
ok(!/push_ventes|envoyer|email|net\.http/.test(V) && /'copies_remises', v_copies/.test(V)
  && /REVOKE ALL ON FUNCTION public\.vente_commande_annulee_vinted\(bigint, text, text, timestamptz\) FROM PUBLIC, anon, authenticated;/.test(MIG),
  '2e. aucun mail, le résultat compte les copies remises, règle fermée à l\'app');
ok(/'ventes_annulees_retrait_pause'/.test(V) && /ventes_annulees_attente_go/.test(V) && /INSERT INTO ventes_supprimees/.test(V)
  && /'recus', v_recus/.test(V) && /L''annonce Vinted reste fermée : remets-le en vente quand tu veux\./.test(V),
  '2f. interrupteur, liste d\'attente, trace, reçus, job clos : inchangés');

// 3
const T = fonction(MIG, 'remises_en_vente_tick');
ok(/v_annul := \(j\.id IS NOT NULL AND j\.status = 'cancelled' AND \(COALESCE\(j\.platform_fields, '\{\}'::jsonb\) \? 'vente_annulee_remise'\)\);/.test(T)
  && /IF j\.id IS NULL OR \(j\.status <> 'sold' AND NOT v_annul\) THEN/.test(T)
  && /ELSIF NOT v_annul AND \(v_op IS NULL OR \(v_op->>'ok'\) IS DISTINCT FROM 'true'\) THEN/.test(T)
  && /v_restant := CASE WHEN v_annul THEN COALESCE\(i\.quantite, 1\) ELSE NULLIF\(v_op->>'restant', ''\)::integer END;/.test(T),
  '3. le tick accepte le dépôt annulé marqué ; sans reçu, le restant est la quantité de la fiche');
ok(/v_motif := 'fiche_absente'/.test(T) && /'plateforme_non_geree'/.test(T) && /'annonce_importee_a_quantite'/.test(T) && /'publication_payante'/.test(T)
  && /'annonce_vendue_encore_en_ligne'/.test(T) && /'deja_en_vente'/.test(T) && /'plateforme_en_pause'/.test(T) && /'poste_absent'/.test(T)
  && /remise_en_vente_place\(r\.user_id\)/.test(T) && /WHEN unique_violation THEN v_motif := 'deja_en_vente'/.test(T),
  '3b. toutes les autres gardes du tick sont là (fiche, plateforme, import, prix, en ligne, doublon, pause, poste, palier, index unique)');
ok(/'restant', v_restant, 'apres_annulation', v_annul, 'le', now\(\)/.test(T) && /'restant', v_restant, 'apres_annulation', v_annul\)\);/.test(T),
  '3c. la publication neuve et la trace disent « après annulation »');

// 4
const C = fonction(MIG, 'ventes_statut_classe');
ok(/WHEN 'canceled' THEN 'annulee' WHEN 'cancelled' THEN 'annulee' ELSE 'inconnu' END/.test(C) && /WHEN 'refunded' THEN 'annulee'/.test(C)
  && /WHEN 'completed' THEN 'vente' WHEN 'failed' THEN 'annulee'/.test(C) && /WHEN 'partially_refunded' THEN 'vente'/.test(C)
  && /WHEN 'annulation_en_cours' THEN 'en_cours'/.test(C) && /WHEN 'status_purchased' THEN 'vente' ELSE 'inconnu' END/.test(C),
  '4. classes : canceled / cancelled Vinted et refunded eBay annulées ; les autres inchangées');

// 5
ok(/position\('vente_annulee_remise' IN pg_get_functiondef\('public\.vente_commande_annulee_vinted/.test(INV)
  && /FOR r IN SELECT \* FROM public\._backup_1810_fonctions_commande_annulee ORDER BY ordre LOOP\s+EXECUTE r\.def;/.test(INV)
  && /IF v_md5 IS DISTINCT FROM r\.md5 THEN/.test(INV) && /REVOKE ALL ON FUNCTION public\.vente_commande_annulee_vinted/.test(INV)
  && /^BEGIN;$/m.test(INV) && /^COMMIT;$/m.test(INV),
  '5. l\'inverse rejoue la sauvegarde (garde de version, md5 relus, règle fermée à l\'app)');

// 6
const B = corps(MIG, '-- ═══ CORPS DE LA MIGRATION', '-- ═══ FIN DU CORPS DE LA MIGRATION ═══════════════════════════════════════════');
const C6 = corps(INV, "-- ═══ CORPS DE L'INVERSE", "-- ═══ FIN DU CORPS DE L'INVERSE ══════════════════════════════════════════════");
ok(B.length > 5000 && C6.length > 500 && ESS === GAB.replace('-- @@CORPS_MIGRATION@@', B).replace('-- @@CORPS_INVERSE@@', C6),
  '6. l\'essai = gabarit + corps EXACTS de la migration et de l\'inverse (généré, octet pour octet)');
ok(/^ROLLBACK;$/m.test(ESS) && !/^COMMIT;$/m.test(ESS) && /f44b5917-bccc-4431-ba41-f40571a2ed18/.test(ESS) && /90181018/.test(ESS)
  && /SET LOCAL fillsell\.push_relance = '1'/.test(ESS) && /C9 après : email_logs et push_ventes du compte inchangés/.test(ESS),
  '6b. l\'essai finit en ROLLBACK, compte de Nico seulement, annonces fictives, aucun mail');
ok(/20261018000000_essai\.template\.sql/.test(GEN) && /@@CORPS_MIGRATION@@/.test(GEN) && /@@CORPS_INVERSE@@/.test(GEN), '6c. le générateur lit le gabarit et les deux corps');

// 7
ok(/position\('vente_annulee_remise' IN pg_get_functiondef/.test(REP) && /RAISE EXCEPTION 'migration 20261018000000 absente/.test(REP)
  && /to_regclass\('public\._backup_1810_ventes_failed_ventes'\) IS NOT NULL/.test(REP),
  '7. réparation des 3 ventes : migration exigée, jamais rejouée deux fois');
ok(/_backup_1810_ventes_failed_ventes/.test(REP) && /_backup_1810_ventes_failed_fiches/.test(REP) && /_backup_1810_ventes_failed_jobs/.test(REP)
  && /_backup_1810_ventes_failed_recus/.test(REP) && /_backup_1810_ventes_failed_remises/.test(REP)
  && /\(108583, '23005108550'\), \(125191, '23050946301'\), \(167304, '22927441285'\)/.test(REP)
  && /vente_commande_annulee_vinted\(x\.vente, 'failed', x\.commande, NULL\)/.test(REP),
  '7b. sauvegardes entières (ventes, fiches, jobs, reçus, remises) ; la RÈGLE appelée une fois par vente avec son numéro de commande');
ok(/SET LOCAL fillsell\.push_relance = '1'/.test(REP) && /un mail ou une note serait parti/.test(REP) && /statut = 'a_envoyer'/.test(REP)
  && /RAISE EXCEPTION 'vente % : la règle rend %/.test(REP) && /les 3 copies de 125191 ne sont pas en file/.test(REP) && /^COMMIT;$/m.test(REP),
  '7c. 0 mail (compteurs dans la transaction), tout ou rien, 125191 ses 3 copies en file');
ok(/DELETE FROM public\.ventes_supprimees WHERE vente_id IN \(108583, 125191, 167304\)/.test(REP_INV)
  && /INSERT INTO public\.ventes SELECT \(jsonb_populate_record\(NULL::public\.ventes, ligne\)\)\.\*/.test(REP_INV)
  && /apres_annulation\}'\) = 'true'/.test(REP_INV) && /status = 'cancelled'/.test(REP_INV) && !/DELETE FROM public\.cross_post_jobs/.test(REP_INV)
  && /to_jsonb\(v\) = b\.ligne\) <> 3/.test(REP_INV), '7d. l\'inverse remet les lignes entières, retire les traces bloquantes, clôt (sans effacer) les publications nées');
ok(/UPDATE public\.ventes SET prix_vente = 12 WHERE id = 181210 AND prix_vente = 14/.test(NOTE) && /UPDATE public\.push_ventes SET prix = 12 WHERE id = 2348 AND prix IS NULL/.test(NOTE)
  && /_backup_1810_note_2348/.test(NOTE) && /mail_statut = 'envoye'/.test(NOTE) && /un mail ou une note serait parti/.test(NOTE)
  && /_backup_1810_note_2348/.test(NOTE_INV) && /jsonb_populate_record\(NULL::public\.push_ventes, ligne\)/.test(NOTE_INV),
  '7e. note 2348 : 12 € sur la vente et la note, sauvegarde, 0 mail, inverse');

// 8
ok(/## 18\/10 — une commande échouée, annulée ou remboursée n'est JAMAIS une vente/.test(DOC) && /vente_annulee_remise/.test(DOC)
  && /20261018000000/.test(DOC) && /20261018_ventes_commandes_failed\.sql/.test(DOC) && /2348/.test(DOC),
  '8. la règle est écrite (docs/regles/ventes-et-retraits.md : règle, migration, réparations, note 2348)');

if (process.argv.includes('--prod')) {
  const sql = `select jsonb_build_object(
    'vinted_neuve', position('vente_annulee_remise' in pg_get_functiondef('public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)'::regprocedure)) > 0,
    'tick_neuf', position('vente_annulee_remise' in pg_get_functiondef('public.remises_en_vente_tick(integer,uuid)'::regprocedure)) > 0,
    'classe', public.ventes_statut_classe('vinted', 'cancelled') = 'annulee' and public.ventes_statut_classe('ebay', 'refunded') = 'annulee',
    'fermee', not has_function_privilege('authenticated','public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)','execute'),
    'sauvegarde', (select count(*) from public._backup_1810_fonctions_commande_annulee) = 3,
    'signalees_anciennes', (select count(*) from public.usage_logs u where u.feature = 'vente_vinted_commande_annulee_signalee'
                              and u.metadata ->> 'motif' = 'annulation_anterieure_a_la_regle'
                              and exists (select 1 from public.ventes v where v.id = (u.metadata ->> 'vente')::bigint))
  ) as etat`;
  const dossier = mkdtempSync(path.join(os.tmpdir(), 'commande-annulee-'));
  const fichier = path.join(dossier, 'etat.sql');
  writeFileSync(fichier, sql, 'utf8');
  const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', `"${fichier}"`, '--output', 'json'],
    { cwd: RACINE, encoding: 'utf8', shell: true, maxBuffer: 16 * 1024 * 1024 });
  rmSync(dossier, { recursive: true, force: true });
  let etat = null;
  try { const s = r.stdout || ''; etat = JSON.parse(s.slice(s.indexOf('{'))).rows[0].etat; } catch { /* lu plus bas */ }
  ok(!!etat && etat.vinted_neuve && etat.tick_neuf && etat.classe && etat.fermee && etat.sauvegarde,
    'P. en prod : les trois définitions neuves, règle fermée à l\'app, sauvegarde de 3');
  ok(!!etat && etat.signalees_anciennes === 0, 'P2. en prod : plus aucune vente « signalée, antérieure à la règle » encore présente');
}

console.log(`\n${total - echecs}/${total} contrôles verts`);
process.exit(echecs ? 1 : 0);
