// selftest:ebay-commande-exemplaire — une commande eBay = la vente d'UN exemplaire,
// pas de la fiche (règle de Nico du 09/10 soir ; migration 20261009190000).
//
//   npm run selftest:ebay-commande-exemplaire            contrôles du dépôt (hors ligne)
//   npm run selftest:ebay-commande-exemplaire -- --prod  + preuve en prod, transaction ANNULÉE
//        (scripts/ebay-commande-exemplaire-preuve.mjs : 3 exemplaires / 1 vendu → rien
//        retiré ; dernier exemplaire → fiche vendue + copie prouvée retirée ; …)
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lectureQuantiteEbay } from '../supabase/functions/_shared/ebay-etat-annonce.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(path.join(RACINE, p), 'utf8').replace(/\r/g, '');
const MIG = lire('supabase/migrations/20261009190000_ebay_commande_un_exemplaire.sql');
const SYNC = lire('supabase/functions/ebay-ventes-sync/index.ts');
const RELEVE = lire('supabase/functions/ebay-releve-api/index.ts');
let echecs = 0, total = 0;
const ok = (c, l) => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}`); };
const T = Date.parse('2026-10-09T20:00:00Z');

// 1. La lecture eBay (pure).
const trois = lectureQuantiteEbay(200, { estimatedAvailabilities: [{ estimatedAvailableQuantity: 2, estimatedSoldQuantity: 1, estimatedAvailabilityStatus: 'IN_STOCK' }] }, T);
ok(trois.disponible === 2 && trois.exacte && !trois.epuisee && !trois.terminee, '1a. 3 exemplaires, 1 vendu → 2 disponibles, ni épuisée ni terminée');
const dernier = lectureQuantiteEbay(200, { estimatedAvailabilities: [{ estimatedAvailableQuantity: 0, estimatedSoldQuantity: 3 }] }, T);
ok(dernier.epuisee === true, '1b. dernier exemplaire vendu → épuisée');
ok(lectureQuantiteEbay(200, { estimatedAvailabilities: [{ estimatedAvailabilityStatus: 'OUT_OF_STOCK' }] }, T).epuisee === true, '1c. OUT_OF_STOCK → épuisée');
const seuil = lectureQuantiteEbay(200, { estimatedAvailabilities: [{ estimatedAvailableQuantity: 10, availabilityThresholdType: 'MORE_THAN' }] }, T);
ok(seuil.exacte === false && !seuil.epuisee, '1d. « plus de 10 » → non exacte, jamais épuisée');
ok(lectureQuantiteEbay(404, {}, T)?.http === 404, '1e. 404 → annonce introuvable');
ok(lectureQuantiteEbay(500, {}, T) === null && lectureQuantiteEbay(429, {}, T) === null, '1f. toute autre réponse → rien de conclu (relue plus tard)');

// 2. La règle en base.
ok(/q ->> 'etat' IN \('epuisee', 'terminee'\) AND v_autre THEN\s+v_dec := 'en_stock'/.test(MIG), '2a. épuisée/terminée mais autre annonce eBay vivante → en stock');
ok(/UPDATE inventaire SET statut = 'vendu', quantite = 0 WHERE id = i\.id AND statut = 'stock'/.test(MIG), '2b. épuisée/terminée → fiche vendue (son déclencheur retire les copies PROUVÉES)');
ok(/q ->> 'etat' = 'disponible' THEN[\s\S]{0,200}UPDATE inventaire SET quantite = v_cible WHERE id = i\.id AND statut = 'stock'/.test(MIG), '2c. disponible → quantité alignée, statut inchangé, aucun retrait');
ok(/v_dec := 'a_relire'/.test(MIG) && !/a_verifier/.test(MIG.replace(/^\s*--.*$/gm, '')), '2d. illisible → « à relire », jamais le drapeau a_verifier (il sort la fiche du stock)');
ok(/IF v_le > v_depuis/.test(MIG) && /v_depuis timestamptz := coalesce\(p_depuis/.test(MIG), '2e. seule une lecture POSTÉRIEURE à la commande compte');
ok(/interval '24 hours' AND cardinality\(v_jobs\) > 0 THEN\s+UPDATE push_ventes SET statut = 'ignoree'/.test(MIG), '2f. vente de plus de 24 h : note éteinte (0 mail, 0 notification)');
ok((MIG.match(/INSERT INTO inventaire_journal/g) ?? []).length >= 3, '2g. chaque changement de quantité ou de statut journalisé');
ok(/v_cible := coalesce\(i\.quantite, 1\) \+ \(new\.quantite - old\.quantite\)/.test(MIG) && /IF v_cible < 1 OR/.test(MIG),
  "2h. relevé : l'écart d'eBay seulement après la première lecture, jamais sous 1");
ok(/IF p_platform = 'ebay' AND v_inv IS NOT NULL AND NOT v_lot AND v_vente_id IS NOT NULL THEN\s+BEGIN\s+v_ex := ebay_commande_appliquer/.test(MIG), '2i. le relevé des ventes juge chaque commande eBay, sans jamais casser le relevé');

// 3. Les fonctions edge.
ok(/admin\.rpc\("ebay_commandes_a_relire"/.test(SYNC) && /admin\.rpc\("ebay_quantite_lue"/.test(SYNC) && /RELECTURES_MAX = \d+/.test(SYNC), '3a. ebay-ventes-sync relit (bornée) les commandes en attente');
ok(SYNC.includes('if (!/^\\d{9,15}$/.test(id)) continue;'), "3b. identifiant d'annonce vérifié avant la lecture");
ok(/quantite: a\.quantite, quantite_le: maintenant\(\)/.test(RELEVE), "3c. le relevé de l'API garde la quantité eBay de chaque annonce");

if (process.argv.includes('--prod')) {
  const r = spawnSync('node', ['scripts/ebay-commande-exemplaire-preuve.mjs'], { cwd: RACINE, encoding: 'utf8', shell: true });
  process.stdout.write(r.stdout ?? '');
  ok(r.status === 0, 'PROD. preuve dans une transaction annulée');
}
console.log(echecs ? `\n✗ ${echecs} échec(s) sur ${total}` : `\n✓ ${total} vérifications vertes`);
process.exit(echecs ? 1 : 0);
