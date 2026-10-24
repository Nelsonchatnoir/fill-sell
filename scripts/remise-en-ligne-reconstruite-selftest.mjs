// selftest:remise-en-ligne-reconstruite — (24/10, feu vert 1 de Nico) La remise en ligne Vinted reportée sur la prod
// du 24/10 (migration 20261024170000), sans jamais rejouer le fichier du 08/10 :
//   1. aucune des trois fonctions centrales ne recule : chaque ligne de leur corps EN PROD (l'inverse) est dans la
//      migration, sauf les deux lignes connues, reprises complétées ; garde md5 des corps prod ;
//   2. les gardes : même compte, même boutique, et « vente_en_cours » (commande, preuve de vente, achat en cours
//      Leboncoin) → rien n'est fait ;
//   3. interrupteurs nés à 0, fonctions nouvelles fermées aux rôles clients, inverse complet, essai annulé.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const ok = (cond, msg, detail = '') => { assert.ok(cond, `${msg}${detail ? ` — ${detail}` : ''}`); n++; console.log(`  ✓ ${msg}`); };
const M = lire('supabase/migrations/20261024170000_remise_en_ligne_vinted_reconstruite.sql');
const I = lire('supabase/rollbacks/20261024170000_remise_en_ligne_vinted_reconstruite_INVERSE.sql');
const E = lire('scripts/essais/20261024170000_essai.sql');
const M08 = lire('supabase/migrations/20261008160000_remise_en_ligne_vinted.sql');
const corps = (sql, nom) => { const d = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`); return d < 0 ? '' : sql.slice(d, sql.indexOf('$function$;', d)); };

console.log('1. Aucune fonction centrale ne recule');
const MODIFIEES = new Map([
  ["      'created_at', i.created_at, 'quantite', COALESCE(i.quantite, 1), 'vinted_item_id', i.vinted_item_id",
   "      'created_at', i.created_at, 'quantite', COALESCE(i.quantite, 1), 'vinted_item_id', i.vinted_item_id,"],
  [' v_snap record;', ' v_snap record; v_succ record;'],
]);
for (const nom of ['rapprochement_v3_lire', 'rapprochement_v3_appliquer', 'enregistrer_vente_atomique']) {
  const prod = corps(I, nom).split('\n');
  const neuf = new Set(corps(M, nom).split('\n'));
  const manquantes = prod.filter((l) => !neuf.has(l) && !(MODIFIEES.has(l) && neuf.has(MODIFIEES.get(l))));
  ok(prod.length > 50 && manquantes.length === 0, `${nom} : les ${prod.length} lignes du corps en prod sont toutes là`, manquantes.slice(0, 3).join(' | '));
}
for (const [f, m] of [['rapprochement_v3_lire(uuid)', '140fb15945baff0d8ecfc80448ea8638'],
  ['rapprochement_v3_appliquer(uuid,jsonb,text,boolean)', '418b60c4303bd4153bd86751b34531f4'],
  ['enregistrer_vente_atomique(uuid,text,bigint,uuid,numeric,numeric,integer,integer,text)', '40cbf2cec036609b70851e344ee5554c'],
  ['vinted_remise_en_ligne(bigint,bigint)', 'e6c4cc857e465bd3c4880c1be4f86170']]) {
  ok(M.includes(`('public.${f}', '${m}')`), `garde md5 du corps prod : ${f.split('(')[0]}`);
}
ok(!M.includes('3d45f23b56f23ccdb9efeed97d798019') && !M.includes('94925e0e98f8811f2e122f37fe43f9c8'), 'jamais les empreintes du 08/10 : le fichier du 08/10 n\'est pas rejoué');
ok(M08.includes('20261008160000') && !/20261008160000_remise_en_ligne_vinted\.sql/.test(M.split('\n').filter((l) => !l.startsWith('--')).join('\n')), 'la migration ne charge pas le fichier du 08/10');

console.log('2. Les gardes');
const possible = corps(M, 'rapprochement_v3_remise_possible');
const maillon = corps(M, 'rapprochement_v3_remise_maillon');
for (const [nom, c, ids] of [['remise_possible', possible, 'm.id, n.id'], ['remise_maillon', maillon, 'g.id, m.id']]) {
  ok(c.includes(`FROM plateforme_commandes pc WHERE pc.inventaire_id IN (${ids})`) && c.includes("j.platform_fields ->> 'sale_signal' = 'sold'")
    && c.includes("leboncoin_transaction_lue(a.transaction_plateforme, a.capture) IN ('pending', 'sold')") && c.includes("RETURN 'vente_en_cours';"),
  `${nom} : commande, preuve de vente, achat en cours Leboncoin → « vente_en_cours »`);
}
ok(possible.includes("RETURN 'boutiques_differentes'") && possible.includes('WHERE id = p_ancienne AND user_id = p_user') && possible.includes('WHERE id = p_nouvelle AND user_id = p_user'),
  'même compte, même boutique');
ok(/IF v_motif IN \('introuvable', 'paire_tranchee', 'pas_vinted', 'boutiques_differentes', 'ancienne_vendue', 'vente_en_cours'\)/.test(corps(M, 'rapprochement_v3_appliquer')),
  'appliquer : une vente en cours est sautée (ni fusion, ni question)');
ok(corps(M, 'enregistrer_vente_atomique').includes("COALESCE((SELECT c.value FROM coin_config c WHERE c.key='vente_garde_remise_en_ligne'),1)<>0")
  && corps(M, 'enregistrer_vente_atomique').includes('IF NOT coalesce(v_proof,false) AND j.platform=\'vinted\''), 'la garde de vente : seulement une vente Vinted SANS preuve');

console.log('3. Interrupteurs, droits, inverse, essai');
ok(/VALUES \('rapprochement_remise_en_ligne', 0, now\(\)\), \('vente_garde_remise_en_ligne', 0, now\(\)\)\n  ON CONFLICT \(key\) DO NOTHING/.test(M), 'les deux interrupteurs naissent à 0');
for (const f of ['vinted_absente_dun_releve_complet(bigint)', 'rapprochement_v3_remise_possible(uuid, bigint, bigint)', 'rapprochement_v3_remise_maillon(uuid, bigint, bigint)']) {
  ok(M.includes(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon, authenticated;`), `fermée aux clients : ${f.split('(')[0]}`);
}
ok((I.match(/CREATE OR REPLACE FUNCTION public\./g) ?? []).length === 4 && I.includes('DROP FUNCTION IF EXISTS public.rapprochement_v3_remise_possible')
  && I.includes("DELETE FROM public.coin_config WHERE key IN ('rapprochement_remise_en_ligne', 'vente_garde_remise_en_ligne')"), 'l\'inverse rend les quatre corps, retire les fonctions et les interrupteurs');
ok(E.trim().endsWith('ROLLBACK;') && !/^COMMIT;$/m.test(E), 'l\'essai est une transaction annulée');

console.log(`\n✓ remise-en-ligne-reconstruite : ${n} contrôles verts`);
