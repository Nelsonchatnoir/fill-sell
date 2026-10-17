// selftest:dressing-garde-commande-annulee — le dressing ne défait plus une commande
// Vinted annulée (17/10, point 12 ; migration 20261017141000).
//
//   npm run selftest:dressing-garde-commande-annulee   contrôles du dépôt (hors ligne)
//
//   1. la migration part du corps de prod lu le 17/10 14:05 (garde md5), n'AJOUTE que des
//      lignes et ne touche pas le déclencheur ;
//   2. la garde : sans job vivant, une vente de CETTE annonce retirée pour commande annulée,
//      annonce jamais revue en ligne depuis, aucune vente écrite → la fiche garde statut,
//      quantité et état d'annonce ; partout ailleurs, rien ne change ;
//   3. la règle du 11/10 reste entière (job vivant : signal d'abord, fiche en stock ;
//      vente écrite : le statut suit ; toute erreur : l'écriture d'origine passe ; jamais
//      le titre) ;
//   4. l'inverse rend le corps de prod à l'octet (md5) ;
//   5. l'essai à blanc rejoue le corps exact de la migration, sous le rôle authenticated,
//      sur le compte de Nico seulement, et finit par ROLLBACK ;
//   6. la règle, en clair (miroir pur de la décision SQL).
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const F_MIG = 'supabase/migrations/20261017141000_dressing_garde_commande_annulee.sql';
const F_INV = 'supabase/rollbacks/20261017141000_dressing_garde_commande_annulee.sql';
const F_ESS = 'scripts/essais/20261017141000_essai.sql';
const MD5_PROD = 'a63b6f1128757a0b767dd2852a094f57';
const NICO = 'f44b5917-bccc-4431-ba41-f40571a2ed18';

let echecs = 0, total = 0;
const ok = (c, l, detail = '') => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}${c || !detail ? '' : `   ← ${detail}`}`); };
for (const f of [F_MIG, F_INV, F_ESS]) {
  if (!existsSync(path.join(RACINE, f))) { console.log(`✗ fichier absent : ${f}`); process.exit(1); }
}
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const MIG = lire(F_MIG), INV = lire(F_INV), ESS = lire(F_ESS);
const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');
const SIG = 'CREATE OR REPLACE FUNCTION public.inventaire_vendu_vinted_par_la_vente()';
const corps = (t) => {
  const i = t.indexOf(SIG); if (i < 0) return '';
  const a = t.indexOf('AS $function$', i); const b = t.indexOf('$function$\n', a + 13);
  return a < 0 || b < 0 ? '' : t.slice(i, b + 11);
};
const NEUF = corps(MIG), PROD = corps(INV);
const sansCommentaires = (s) => s.replace(/--.*$/gm, '');
const bloc = (t) => {
  const d = t.indexOf('-- ═══ CORPS DE LA MIGRATION'); const f = t.indexOf('-- ═══ FIN DU CORPS DE LA MIGRATION');
  return d < 0 || f < 0 ? '' : t.slice(d, t.indexOf('\n', f));
};

console.log('1. La migration part du corps de prod, n\'ajoute que des lignes');
ok(MIG.includes(`IS DISTINCT FROM '${MD5_PROD}'`) && MIG.includes("md5(pg_get_functiondef('public.inventaire_vendu_vinted_par_la_vente()'::regprocedure))"),
  'garde md5 du corps de prod lu le 17/10 14:05 : la migration s\'arrête s\'il a bougé');
ok(/^BEGIN;$/m.test(MIG) && /^COMMIT;$/m.test(MIG) && MIG.indexOf('DO $garde$') < MIG.indexOf(SIG), 'une transaction ; la garde passe avant la définition');
ok(!/CREATE TRIGGER|DROP TRIGGER|ALTER TRIGGER/i.test(sansCommentaires(MIG)), 'le déclencheur (événement, WHEN) n\'est pas touché');
const compte = (lignes) => lignes.reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map());
const cP = compte(PROD.split('\n')), cN = compte(NEUF.split('\n'));
const retirees = [...cP].filter(([l, n]) => (cN.get(l) ?? 0) < n).map(([l]) => l);
ok(retirees.length === 0, 'aucune ligne du corps de prod n\'est retirée ni changée : des lignes sont seulement AJOUTÉES', retirees.join(' | '));
ok(!/like 'commande/i.test(NEUF) && !/\\_/.test(NEUF) && /left\(s\.motif, 9\) = 'commande_'/.test(NEUF), 'motif lu par left() : aucun antislash à perdre (piège du heredoc)');

console.log('\n2. La garde des commandes annulées');
const iFor = NEUF.indexOf('for update;'), iGarde = NEUF.indexOf('if v_job is null\n       and exists (select 1 from public.ventes_supprimees s');
const iImport = NEUF.indexOf('if v_job is null then return new; end if;');
ok(iFor > 0 && iGarde > iFor && iImport > iGarde, 'placée APRÈS la recherche du job vivant et AVANT « import pur » : sans job vivant seulement');
const garde = NEUF.slice(iGarde, iImport);
ok(/s\.plateforme_code = 'vinted' and s\.annonce_id = v_id/.test(garde) && /s\.source = 'releve_vinted'/.test(garde),
  'une vente de CETTE annonce, retirée par la règle des commandes Vinted (jamais le titre)');
ok(/x\.status in \('active', 'reserved', 'hidden'\)\s+and x\.captured_at > s\.supprimee_le/.test(garde), 'annonce jamais revue en ligne (active, réservée, masquée) depuis l\'annulation');
ok(/and not exists \(select 1 from public\.ventes v\s+where v\.user_id = new\.user_id and \(v\.inventaire_id = new\.id or v\.annonce_id = v_id\)\)/.test(garde),
  'aucune vente écrite pour la fiche ou pour l\'annonce');
ok(/new\.statut := old\.statut;\s+new\.quantite := old\.quantite;\s+new\.vinted_status := coalesce\(old\.vinted_status, 'closed'\);/.test(garde) && /return new;/.test(garde),
  'la fiche garde statut, quantité et état d\'annonce — et la garde s\'arrête là');
ok(/raise log 'inventaire_vendu_vinted_par_la_vente : fiche % \(annonce %\) gardée en stock — commande Vinted annulée, annonce jamais revue en ligne'/.test(garde),
  'chaque retenue laisse une ligne dans les journaux Postgres');
ok(!/update |insert |delete /i.test(sansCommentaires(garde)), 'la garde n\'écrit rien ailleurs : ni job, ni retrait, ni note, ni republication');

console.log('\n3. La règle du 11/10 reste entière');
const apres = NEUF.slice(iImport);
ok(/if v_job is null then return new; end if;/.test(apres), 'sans job vivant et sans annulation : « vendu » direct (import pur, 03/08)');
ok(/exists \(select 1 from public\.ventes v/.test(apres) && /public\.ventes_operations o/.test(apres), 'vente déjà écrite (ligne ou reçu) : le statut suit');
ok(apres.indexOf('update public.cross_post_jobs') > 0 && apres.indexOf('update public.cross_post_jobs') < apres.indexOf('new.statut := old.statut'),
  'job vivant : le signal est posé AVANT de garder la fiche en stock');
ok(/exception when others then[\s\S]*return new;/.test(NEUF) && NEUF.indexOf('exception when others then') > iImport, 'toute erreur (garde comprise) : l\'écriture d\'origine passe, jamais une synchro cassée');
ok(!/titre/.test(sansCommentaires(NEUF)), 'jamais le titre : l\'annonce est reconnue à son numéro');
ok(/ SECURITY DEFINER\n/.test(NEUF) && /SET search_path TO 'public', 'pg_temp'/.test(NEUF), 'SECURITY DEFINER, search_path figé (règle du 11/10)');

console.log('\n4. L\'inverse');
ok(md5(PROD) === MD5_PROD, `l'inverse rend le corps de prod à l'octet (md5 ${MD5_PROD})`, md5(PROD));
ok(INV.includes("position('annonce jamais revue en ligne' IN pg_get_functiondef('public.inventaire_vendu_vinted_par_la_vente()'::regprocedure)) = 0"),
  'l\'inverse ne part que si la prod porte la version de la migration');

console.log('\n5. L\'essai à blanc');
const B = bloc(MIG);
ok(B.length > 1000 && ESS.includes(B), 'il rejoue le corps EXACT de la migration (garde md5 + définition)');
ok(/^BEGIN;$/m.test(ESS) && /^ROLLBACK;$/m.test(ESS) && !/^COMMIT;$/m.test(ESS), 'BEGIN … ROLLBACK, jamais de COMMIT');
const uuids = [...new Set(ESS.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [])];
ok(uuids.length === 1 && uuids[0] === NICO, 'données d\'essai sur le compte de Nico SEULEMENT', uuids.join(', '));
ok(/EXECUTE 'SET LOCAL ROLE authenticated';/.test(ESS) && /EXECUTE 'RESET ROLE';/.test(ESS) && /set_config\('request\.jwt\.claims'/.test(ESS),
  'les écritures « client » passent sous le rôle authenticated, avec les claims de Nico — comme la synchro du dressing');
ok(['A1 avant', 'A2 avant', 'A3 avant', 'A4 avant', 'C1 après', 'C2 après', 'C3 après', 'C4 après', 'C5 après', 'C6 après', 'C7 après', 'C8 après', 'C9 après']
  .every((c) => ESS.includes(`'${c}`)), 'contrôles A1-A4 (avant, défaut rejoué) et C1-C9 (après)');
ok(ESS.includes(`'${MD5_PROD}'`) && /pg_get_triggerdef/.test(ESS), 'md5 de prod vérifié AVANT ; déclencheur comparé avant / après');

console.log('\n6. La règle, en clair');
// Miroir pur : ce que devient une écriture stock → vendu sur une annonce « sold ».
const decision = ({ client, jobVivant, annulee, revueEnLigneDepuis, venteEcrite }) => {
  if (!client) return 'passe';                       // le déclencheur ne vise que authenticated
  if (!jobVivant && annulee && !revueEnLigneDepuis && !venteEcrite) return 'retenue';
  if (!jobVivant) return 'passe';                    // import pur (03/08)
  if (venteEcrite) return 'passe';                   // le statut suit la vente
  return 'signal_sur_le_job';                        // règle du 11/10
};
ok(decision({ client: true, jobVivant: false, annulee: true, revueEnLigneDepuis: false, venteEcrite: false }) === 'retenue', 'annulée, jamais revue en ligne → gardée en stock');
ok(decision({ client: true, jobVivant: false, annulee: true, revueEnLigneDepuis: true, venteEcrite: false }) === 'passe', 'revue en ligne après l\'annulation → « vendu » permis');
ok(decision({ client: true, jobVivant: true, annulee: true, revueEnLigneDepuis: false, venteEcrite: false }) === 'signal_sur_le_job', 'job vivant → règle du 11/10, inchangée');
ok(decision({ client: true, jobVivant: false, annulee: false, revueEnLigneDepuis: false, venteEcrite: false }) === 'passe', 'sans annulation → import pur, inchangé');
ok(decision({ client: true, jobVivant: false, annulee: true, revueEnLigneDepuis: false, venteEcrite: true }) === 'passe', 'vente écrite → le statut suit');
ok(decision({ client: false, jobVivant: false, annulee: true, revueEnLigneDepuis: false, venteEcrite: false }) === 'passe', 'écriture du serveur → jamais retenue');

console.log(`\n${total - echecs}/${total} contrôles verts`);
process.exit(echecs ? 1 : 0);
