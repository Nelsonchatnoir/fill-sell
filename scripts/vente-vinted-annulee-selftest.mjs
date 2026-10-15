// selftest:vente-vinted-annulee — une commande Vinted annulée rend l'article au
// stock (15/10, P1 — Louis ; migration 20261015010000).
//
//   npm run selftest:vente-vinted-annulee            contrôles du dépôt
//   npm run selftest:vente-vinted-annulee -- --prod  + la base (fonction, branche, droits)
//
//   1. la commande se reconnaît par son numéro, ou par les numéros d'annonce
//      qu'elle porte (lot : item_ids) — jamais par un titre ;
//   2. seule une vente née d'une PREUVE est retirée (relevé, annonce close
//      « vendue » sur son numéro) ; une vente saisie est signalée ; une
//      annulation d'avant le 13/10 aussi ;
//   3. la fiche revient au stock (pièce unique → stock ; plusieurs exemplaires
//      → +1, copie « vendue » de la même vente effacée), le reçu tombe ;
//   4. l'annonce : revue en ligne → « publiée » ; sinon close et dite — jamais
//      une remise en ligne en silence, aucun mail ;
//   5. même interrupteur et même liste d'attente que la règle eBay ;
//   6. l'extension transmet les item_ids d'un lot ;
//   7. l'inverse rend la définition d'avant.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const MIG = lire('supabase/migrations/20261015010000_vente_vinted_annulee.sql');
const INV = lire('supabase/rollbacks/20261015010000_vente_vinted_annulee_INVERSE.sql');
const EXT = lire('chrome-extension/background.js');

let echecs = 0, total = 0;
const ok = (c, l) => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}`); };
const fonction = (txt, nom) => {
  const i = txt.search(new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${nom}\\(`));
  if (i < 0) return '';
  const j = txt.indexOf('$function$', txt.indexOf('$function$', i) + 10);
  return j < 0 ? '' : txt.slice(i, j + 10);
};
const regle = fonction(MIG, 'vente_commande_annulee_vinted');
const releve = fonction(MIG, 'enregistrer_ventes_relevees');

// 1
ok(/IF p_platform = 'vinted' THEN\s*\n\s*FOR v_vente_id IN/.test(releve)
  && /v\.commande_ref = v_ref/.test(releve) && /v_row -> 'item_ids'/.test(releve) && /jsonb_build_array\(v_listing\)/.test(releve)
  && !/titre/.test(releve.slice(releve.indexOf("IF p_platform = 'vinted' THEN\n        FOR v_vente_id"), releve.indexOf("IF v_classe = 'en_cours'"))),
  '1. numéro de commande ou numéros d\'annonce (item_ids d\'un lot), jamais le titre');
// 2
ok(/coalesce\(v\.source, ''\) = 'releve' OR j\.id IS NOT NULL/.test(regle) && /'vente_saisie_jamais_retiree'/.test(regle)
  && /timestamptz '2026-10-13 00:00:00\+02'/.test(regle) && /'annulation_anterieure_a_la_regle'/.test(regle),
  '2. retirée seulement sur preuve, et pour une commande du 13/10 ou après ; sinon signalée');
// 3
ok(/UPDATE inventaire SET statut = 'stock', quantite = v_q WHERE id = i\.id AND statut = 'vendu'/.test(regle)
  && /UPDATE inventaire SET quantite = coalesce\(quantite, 0\) \+ v_q WHERE id = i\.id/.test(regle)
  && /h\.id BETWEEN v_ms - 2000 AND v_ms \+ 20000/.test(regle)
  && /DELETE FROM ventes_operations o WHERE o\.user_id = v\.user_id AND o\.cle = 'annonce:vinted:' \|\| v\.annonce_id/.test(regle),
  '3. fiche au stock (unique ou +1 exemplaire, copie vendue effacée), reçu retiré');
ok(/INSERT INTO ventes_supprimees/.test(regle) && /coalesce\(v\.commande_ref, p_commande\)/.test(regle),
  '3b. trace ventes_supprimees sur la COMMANDE (jamais l\'annonce seule : une vraie vente future passe)');
// 4
ok(/v_snap\.status = 'active' AND v_snap\.captured_at > coalesce\(j\.sold_at, v\.created_at\)/.test(regle)
  && /L''annonce Vinted reste fermée : remets-le en vente quand tu veux\./.test(regle)
  && !/push_ventes|envoyer|email/.test(regle), '4. annonce revue en ligne → publiée ; sinon close et dite ; aucun envoi');
// 5
ok(/'ventes_annulees_retrait_pause'/.test(regle) && /ventes_annulees_attente_go/.test(regle), '5. même interrupteur et liste d\'attente que l\'eBay');
ok(/REVOKE ALL ON FUNCTION public\.vente_commande_annulee_vinted\(bigint, text, text, timestamptz\) FROM PUBLIC, anon, authenticated/.test(MIG),
  '5b. la règle n\'est pas appelable par l\'app');
// 6
ok(/item_ids: lot \? ids\.map\(\(x\) => String\(x\)\) : null/.test(EXT), '6. l\'extension transmet les item_ids d\'un lot');
// 7
ok(!/vente_commande_annulee_vinted\(v_vente_id/.test(fonction(INV, 'enregistrer_ventes_relevees'))
  && /DROP FUNCTION IF EXISTS public\.vente_commande_annulee_vinted/.test(INV), '7. l\'inverse rend la définition d\'avant');

if (process.argv.includes('--prod')) {
  const sql = `select jsonb_build_object(
    'branche', position('vente_commande_annulee_vinted' in pg_get_functiondef('public.enregistrer_ventes_relevees(text,jsonb,uuid)'::regprocedure)) > 0,
    'fermee', not has_function_privilege('authenticated','public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)','execute')
  ) as etat`;
  const dossier = mkdtempSync(path.join(os.tmpdir(), 'vente-annulee-'));
  const fichier = path.join(dossier, 'etat.sql');
  writeFileSync(fichier, sql, 'utf8');
  const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', `"${fichier}"`, '--output', 'json'],
    { cwd: RACINE, encoding: 'utf8', shell: true, maxBuffer: 16 * 1024 * 1024 });
  rmSync(dossier, { recursive: true, force: true });
  let etat = null;
  try { const s = r.stdout || ''; etat = JSON.parse(s.slice(s.indexOf('{'))).rows[0].etat; } catch { /* lu plus bas */ }
  ok(!!etat && etat.branche === true && etat.fermee === true, 'P. en prod : branche Vinted en place, règle fermée à l\'app');
}

console.log(`\n${total - echecs}/${total} contrôles verts`);
process.exit(echecs ? 1 : 0);
