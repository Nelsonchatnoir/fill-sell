// selftest:ventes-relevees-identifiant-seul — les commandes relevées s'écrivent même
// sur un gros compte (09/10, Jocabroc : 174 commandes eBay, 0 en base, 8 s dépassées).
//   1. la migration 20261009170000 = la définition d'avant (copie dans l'inverse) au
//      SEUL bloc près : rapprocher_classer reçoit un titre vide ;
//   2. rapprocher_classer rend « job » / « job_clos » AVANT de lire le titre (sinon le
//      titre vide changerait un résultat) ;
//   3. ebay-ventes-sync : écriture par lots bornés, de la plus ancienne à la plus
//      récente, arrêt au premier refus ; curseur sur les seules ventes relevées.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(path.join(RACINE, p), 'utf8').replace(/\r/g, '');
const MIG = lire('supabase/migrations/20261009170000_ventes_relevees_identifiant_seul.sql');
const INV = lire('scripts/reparations/20261009_inverse_ventes_relevees_identifiant_seul.sql');
const FN = lire('supabase/functions/ebay-ventes-sync/index.ts');
let echecs = 0, total = 0;
const ok = (c, l) => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}`); };
const corps = (s) => s.slice(s.indexOf('CREATE OR REPLACE FUNCTION public.enregistrer_ventes_relevees'));

const sansCommentaires = (s) => s.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
const avant = sansCommentaires(corps(INV)), apres = sansCommentaires(corps(MIG));
ok(avant.replace(`coalesce(v_url,''), v_titre, v_prix`, `coalesce(v_url,''), '', v_prix`) === apres,
  '1. migration = définition d\'avant, au seul titre vide près');
ok(/IF v_bande IN \('job','job_clos'\) THEN/.test(apres) && (apres.match(/v_bande/g) ?? []).length === 6,
  '1b. seules « job » / « job_clos » sont retenues, v_bande n\'est lu nulle part ailleurs');

// 2. rapprocher_classer : le bloc identifiant rend avant toute lecture du titre.
const rc = readdirSync(path.join(RACINE, 'supabase/migrations')).filter((f) => f.endsWith('.sql'))
  .map((f) => lire(`supabase/migrations/${f}`)).filter((s) => s.includes('FUNCTION public.rapprocher_classer(')).pop() ?? '';
const fRc = rc.slice(rc.indexOf('FUNCTION public.rapprocher_classer('));
const iJob = fRc.indexOf("'bande', 'job_clos'"), iTitre = fRc.indexOf("IF v_t = '' THEN RETURN");
ok(iJob > 0 && iTitre > iJob, '2. rapprocher_classer : « job » / « job_clos » rendues avant le titre (titre vide → « aucune »)');

// 3. La fonction eBay.
ok(/const LOT_RPC = \d+;/.test(FN) && /lignes\.slice\(i, i \+ LOT_RPC\)/.test(FN), '3a. écriture par lots bornés');
ok(/lignes\.sort\(\(a, b\) => \(Date\.parse\(a\.vendu_le/.test(FN), '3b. de la plus ancienne à la plus récente');
ok(/if \(error\) \{ refus = error\.message; break; \}/.test(FN), '3c. arrêt au premier lot refusé (le curseur ne dépasse jamais l\'écrit)');
ok(/\.not\("commande_ref", "is", null\)/.test(FN), '3d. curseur : seules les ventes relevées (une commande) comptent');
ok(/mode === "lignes"/.test(FN) && !/admin\.rpc\([^)]*\)[\s\S]{0,40}mode === "lignes"/.test(FN), '3e. mode lignes : lecture seule');

console.log(echecs ? `\n✗ ${echecs} échec(s) sur ${total}` : `\n✓ ${total} vérifications vertes`);
process.exit(echecs ? 1 : 0);
