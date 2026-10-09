// selftest:commande-ebay-annulee — une commande eBay remboursée ou annulée ne compte jamais
// comme vente (migrations 20261009210000 / 211000, règle de Nico du 09/10 soir).
//   npm run selftest:commande-ebay-annulee            contrôles du dépôt
//   npm run selftest:commande-ebay-annulee -- --prod  + preuve en prod (transaction annulée) :
//        commande remboursée → rien écrit ; remboursée après coup → vente retirée, fiche en
//        stock, rien remis en ligne ; vente saisie → jamais retirée.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(path.join(RACINE, p), 'utf8').replace(/\r/g, '');
const MIG = lire('supabase/migrations/20261009210000_commande_ebay_annulee.sql');
const GO = lire('supabase/migrations/20261009211000_commande_ebay_annulee_attente_go.sql');
const SYNC = lire('supabase/functions/ebay-ventes-sync/index.ts');
let echecs = 0, total = 0;
const ok = (c, l) => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}`); };
ok(/etatAnnulation === "CANCELED" \? "cancelled" : "annulation_en_cours"/.test(SYNC), '1. eBay : seule CANCELED est une annulation ; demandée ou inconnue = en cours');
ok(/WHEN 'annulation_en_cours' THEN 'en_cours'/.test(MIG), '2. annulation en cours : ni vente, ni retrait');
ok(/IF coalesce\(v\.source, ''\) <> 'releve' THEN[\s\S]{0,1200}RETURN jsonb_build_object\('action', 'signalee'\)/.test(MIG), '3. une vente saisie par la personne n\'est JAMAIS retirée (signalée)');
ok(/INSERT INTO ventes_supprimees[\s\S]{0,300}'releve_' \|\| coalesce\(v\.plateforme_code, ''\), 'commande_'/.test(MIG) && /'vente_retiree'/.test(MIG), '4. retrait tracé (ventes_supprimees source/motif + ligne entière)');
ok(/IF v_dec = 'vendue' AND v\.inventaire_id IS NOT NULL THEN/.test(MIG) && /UPDATE remises_en_vente SET statut = 'abandonnee'/.test(MIG)
  && !/status = 'pending'|INSERT INTO cross_post_jobs/.test(MIG.slice(MIG.indexOf('FUNCTION public.vente_commande_annulee'), MIG.indexOf('-- ── 4.'))),
  '5. la fiche ne revient en stock que si CETTE commande l\'avait vendue ; rien remis en ligne');
ok(/IF p_platform = 'ebay' THEN\s+SELECT v\.id INTO v_vente_id FROM ventes v/.test(MIG), '6. le relevé eBay retire après coup (commande déjà écrite)');
ok(/'ventes_annulees_retrait_pause'/.test(GO) && /ventes_annulees_attente_go g WHERE g\.vente_id = v\.id AND g\.decision IS NULL/.test(GO), '7. le stock d\'avant la règle attend le GO (pause, liste)');
if (process.argv.includes('--prod')) {
  const r = spawnSync('node', ['scripts/commande-ebay-annulee-preuve.mjs'], { cwd: RACINE, encoding: 'utf8', shell: true });
  process.stdout.write(r.stdout ?? '');
  ok(r.status === 0, 'PROD. preuve dans une transaction annulée');
}
console.log(echecs ? `\n✗ ${echecs} échec(s) sur ${total}` : `\n✓ ${total} vérifications vertes`);
process.exit(echecs ? 1 : 0);
