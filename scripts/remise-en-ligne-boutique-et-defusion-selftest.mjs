// selftest:remise-en-ligne-boutique-et-defusion — (24/10, feu vert 1 de Nico, après le rattrapage)
//   1. 20261024180000 : la remise en ligne ne juge que la boutique DU COMPTE — une boutique inscrite à un autre compte
//      (registre du 18/10) → « boutiques_differentes » (déjà sauté par rapprochement_v3_appliquer) : ni fusion, ni
//      question ; le corps en prod repris ligne à ligne, une seule ligne ajoutée ;
//   2. 20261024190000 : défaire une fusion avec ÉCHANGE Vinted marche de nouveau — la fiche gardée lâche son annonce
//      avant que chacune reprenne la sienne (la garde du 08/10 « une fiche ne recule jamais sur une annonce plus
//      ancienne » bloquait l'échange) ; le corps en prod repris ligne à ligne ;
//   3. l'inverse du rattrapage est complet (fusions défaites, jobs rouverts, questions closes rouvertes) ; la question
//      posée sur la boutique d'un autre compte est close par un script sauvegardé, avec son inverse.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const ok = (cond, msg, detail = '') => { assert.ok(cond, `${msg}${detail ? ` — ${detail}` : ''}`); n++; console.log(`  ✓ ${msg}`); };
const corps = (sql, nom) => { const d = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`); return d < 0 ? '' : sql.slice(d, sql.indexOf('$function$;', d)); };
const lignesDe = (c) => c.split('\n');

console.log('1. La boutique du compte (20261024180000)');
const M1 = lire('supabase/migrations/20261024180000_remise_en_ligne_boutique_du_compte.sql');
const I1 = lire('supabase/rollbacks/20261024180000_remise_en_ligne_boutique_du_compte_INVERSE.sql');
const E1 = lire('scripts/essais/20261024180000_essai.sql');
const p1 = lignesDe(corps(I1, 'rapprochement_v3_remise_possible'));
const n1 = lignesDe(corps(M1, 'rapprochement_v3_remise_possible'));
const neuf1 = new Set(n1);
ok(p1.length > 60 && p1.every((l) => neuf1.has(l)), `les ${p1.length} lignes du corps en prod sont toutes là`);
ok(n1.length === p1.length + 4, 'une seule ligne de code ajoutée (et trois de commentaire)');
const garde = "  IF public.boutique_vinted_autre_compte(p_user, m.vinted_account_id) THEN RETURN 'boutiques_differentes'; END IF;";
const iDiff = n1.findIndex((l) => l.includes("THEN RETURN 'boutiques_differentes'; END IF;") && l.includes('COALESCE(m.vinted_account_id'));
ok(n1.indexOf(garde) > iDiff && iDiff > 0 && n1.indexOf(garde) < n1.findIndex((l) => l.includes("RETURN 'ancienne_vendue'")),
  'la garde suit « même boutique » et précède tout le reste');
ok(lire('supabase/migrations/20261018200000_une_boutique_un_compte_comptes_lies.sql').includes('boutique_vinted_autre_compte'),
  'même fonction que le registre du 18/10 (une boutique = un compte)');
ok(/IF v_motif IN \('introuvable', 'paire_tranchee', 'pas_vinted', 'boutiques_differentes',/.test(
  corps(lire('supabase/migrations/20261024170000_remise_en_ligne_vinted_reconstruite.sql'), 'rapprochement_v3_appliquer')),
  '« boutiques_differentes » est sauté par appliquer : ni fusion, ni question');
ok(M1.includes("<> '4dd0fb28adcdad06c94c0649757ff7ac' THEN") && M1.includes('REVOKE ALL ON FUNCTION public.rapprochement_v3_remise_possible(uuid, bigint, bigint) FROM PUBLIC, anon, authenticated;'),
  'garde md5 du corps prod, fonction fermée aux clients');
ok(E1.trim().endsWith('ROLLBACK;') && !/^COMMIT;$/m.test(E1) && E1.includes("'rattrapage 0a24c951'"), 'essai annulé, sur les paires du rattrapage et tout le parc');

console.log('2. Défaire un échange Vinted (20261024190000)');
const M2 = lire('supabase/migrations/20261024190000_defusion_echange_vinted.sql');
const I2 = lire('supabase/rollbacks/20261024190000_defusion_echange_vinted_INVERSE.sql');
const E2 = lire('scripts/essais/20261024190000_essai.sql');
const p2 = lignesDe(corps(I2, 'inventaire_defusionner_pour'));
const n2 = lignesDe(corps(M2, 'inventaire_defusionner_pour'));
const neuf2 = new Set(n2);
ok(p2.length > 100 && p2.every((l) => neuf2.has(l)), `les ${p2.length} lignes du corps en prod sont toutes là`);
ok(n2.length === p2.length + 4, 'une seule ligne de code ajoutée (et trois de commentaire)');
const libereA = n2.indexOf('      UPDATE inventaire SET vinted_item_id = NULL, vinted_status = NULL, vinted_account_id = NULL WHERE id = f.absorbe;');
const libereG = n2.indexOf('      UPDATE inventaire SET vinted_item_id = NULL, vinted_status = NULL, vinted_account_id = NULL WHERE id = f.garde;');
const rendG = n2.findIndex((l, i) => i > libereG && l.includes("vinted_item_id = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_item_id'"));
const brancheEchange = n2.findIndex((l) => l.includes("v_cle = 'vinted_identite' AND COALESCE((f.champs_repris -> 'vinted_identite' ->> 'echange')::boolean, false)"));
ok(brancheEchange > 0 && libereA > brancheEchange && libereG === libereA + 4 && rendG > libereG,
  'branche « échange » : les deux fiches lâchent leur annonce, puis chacune reprend la sienne');
ok(n2.filter((l) => /SET vinted_item_id = NULL\b/.test(l)).length === 2 && p2.filter((l) => /SET vinted_item_id = NULL\b/.test(l)).length === 1,
  'la branche sans échange est inchangée (une seule libération ajoutée, dans l\'échange)');
ok(M2.includes("<> 'd311f449d31b8740c13ce5810fbea968' THEN") && !/GRANT|REVOKE/.test(M2.split('\n').filter((l) => !l.startsWith('--')).join('\n')),
  'garde md5 du corps prod, droits inchangés');
ok(E2.trim().endsWith('ROLLBACK;') && !/^COMMIT;$/m.test(E2) && E2.includes("inventaire_defusionner_pour(f.user_id, f.id, 'utilisateur:essai_20261024190000')"),
  'essai annulé : l\'inverse du rattrapage ET la voie du bouton de l\'app');

console.log('3. Inverse du rattrapage, question close');
const INV = lire('scripts/reparations/20261008_remises_en_ligne_vinted_INVERSE.sql');
const iDefus = INV.indexOf('inventaire_defusionner_pour(');
const iJobs = INV.indexOf("platform_fields - 'remplacee_par'");
const iQuest = INV.indexOf('FROM public._backup_0810_remise_doublons s');
ok(iDefus > 0 && iJobs > iDefus && iQuest > iJobs && INV.trim().endsWith('COMMIT;'), 'fusions défaites, puis jobs rouverts, puis questions rouvertes');
ok(/AND f\.absorbe IN \(d\.garde, d\.absorbe\)\);/.test(INV) && INV.includes("b.statut = 'proposee'") && INV.includes("d.decide_par = 'rapprochement_v3'"),
  'seules les questions ouvertes que ces fusions ont closes « caduque » se rouvrent');
const R170 = lire('supabase/rollbacks/20261024170000_remise_en_ligne_vinted_reconstruite_INVERSE.sql');
const nomme = (R170.match(/scripts\/reparations\/[\w.-]+\.sql/g) ?? []);
ok(nomme.length > 0 && nomme.every((f) => fs.existsSync(join(ROOT, f))), 'l\'inverse de 20261024170000 nomme un script qui existe');
const Q = lire('scripts/reparations/20261024_question_boutique_autre_compte.sql');
const QI = lire('scripts/reparations/20261024_question_boutique_autre_compte_INVERSE.sql');
ok(Q.includes('ENABLE ROW LEVEL SECURITY') && Q.includes('FROM PUBLIC, anon, authenticated') && Q.includes("IS DISTINCT FROM 'boutiques_differentes'")
  && Q.includes("IF n <> 1 THEN RAISE EXCEPTION"), 'question close : sauvegarde fermée aux clients, la règle relue avant, une seule ligne');
ok(QI.includes('FROM public._backup_2410_question_boutique_autre_compte b') && QI.includes("q.statut = 'caduque'"), 'son inverse relit la sauvegarde');

console.log(`\n✓ remise-en-ligne-boutique-et-defusion : ${n} contrôles verts`);
