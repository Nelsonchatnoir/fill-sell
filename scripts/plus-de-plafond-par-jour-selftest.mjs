// selftest:plus-de-plafond-par-jour — (24/10, décision de Nico) Les plafonds de republication PAR JOUR sont
// supprimés, pour tous les paliers ; reste seulement la pause de 2 h après 50 republications. Remplace
// selftest:republication-plafond-message (la limite du jour dite au clic, 05/10 → 17/10), qui n'a plus d'objet.
// Ce qu'il garantit :
//   1. la base : republish_plafond_palier SUPPRIMÉE ; plus aucune fonction de la migration ne lit
//      republish_plafond_jour* ; les huit corps repris de la prod (garde md5) ; un nombre par jour CHOISI absent
//      (NULL) ne borne rien — jamais GREATEST(0, NULL) = 0 ; quotas du mois, espacement, disjoncteur et pause
//      (republish_planifiee_capacite) intacts ; inverse complet, essai annulé ;
//   2. get-pending-jobs : la retenue ne lit plus que les deux clés de la pause ; un seul motif, « pause » ; reprise
//      null hors pause ; une trace « plafond » se lève ; la levée des traces périmées garde sa forme ;
//   3. l'app : plus aucune phrase de limite du jour (Stock, « Ta file », feuille Republier, module planifié, CGV) ;
//      les phrases de la pause restent ; le nombre par jour du module est un choix facultatif, sans maximum de palier.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const existe = (p) => fs.existsSync(join(ROOT, p));
let n = 0;
const ok = (cond, msg, detail = '') => { assert.ok(cond, `${msg}${detail ? ` — ${detail}` : ''}`); n++; console.log(`  ✓ ${msg}`); };
const corps = (sql, nom) => { const d = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`); return d < 0 ? '' : sql.slice(d, sql.indexOf('$function$;', d)); };
const sansCommentaires = (t) => t.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

console.log('1. La base (20261024200000)');
const M = lire('supabase/migrations/20261024200000_plus_de_plafond_par_jour.sql');
const I = lire('supabase/rollbacks/20261024200000_plus_de_plafond_par_jour_INVERSE.sql');
const E = lire('scripts/essais/20261024200000_essai.sql');
const HUIT = ['remise_en_vente_place', 'spend_coins_and_republish', 'republish_planifiee_reglage', 'republish_planifiee_regler',
  'republish_planifiee_etat_multi', 'republish_planifiee_etat', 'republish_planifiee_sweep'];
ok(/DROP FUNCTION public\.republish_plafond_palier\(text\);/.test(M) && /encore lu par : %/.test(M), 'republish_plafond_palier supprimée, après la vérification qu’aucune fonction ne la lit plus');
for (const f of HUIT) {
  const c = sansCommentaires(corps(M, f));
  ok(c.length > 500 && !/republish_plafond_palier|republish_plafond_jour|plafond_compte|restants_compte|v_plafond_palier|v_plafond_cpt/.test(c), `${f} : plus aucune trace du plafond du palier`);
}
ok((M.match(/\('public\.[a-z_]+\([^)]*\)', '[0-9a-f]{32}'\)/g) ?? []).length === 8, 'garde md5 des huit corps lus en prod');
ok(!/CREATE OR REPLACE FUNCTION public\.republish_planifiee_capacite\(/.test(M), 'la pause (republish_planifiee_capacite) n’est pas touchée');
const sweep = corps(M, 'republish_planifiee_sweep');
ok((sweep.match(/v_prevues := LEAST\(CASE WHEN v_plafond IS NULL THEN NULL ELSE GREATEST\(0, v_plafond - v_faits\) END,\n\s+v_elig, v_capacite\);/g) ?? []).length === 2,
  'balayage : un nombre choisi absent ne borne rien (jamais GREATEST(0, NULL) = 0), création et réalignement');
ok(/IF v_plafond IS NOT NULL AND v_faits >= v_plafond THEN/.test(sweep) && /republish_disjoncteur_echecs/.test(sweep) && /republish_planifiee_capacite\(/.test(sweep),
  'balayage : le nombre choisi s’il y en a un ; disjoncteur et capacité (pause) intacts');
const spend = corps(M, 'spend_coins_and_republish');
ok(/IF v_plafond IS NOT NULL AND v_faits >= v_plafond THEN/.test(spend) && /IF v_plafond_b IS NOT NULL AND v_faits_b >= v_plafond_b THEN/.test(spend)
  && /'plafond_republication_mensuel'/.test(spend) && /quota_republication_/.test(spend), 'spend : nombres choisis seulement s’ils existent ; quotas du mois intacts');
ok(!/LEAST\(50, GREATEST\(1/.test(spend), 'spend : plus de borne de 50 par jour sur l’ancienne voie Vinted');
for (const f of ['republish_planifiee_reglage', 'republish_planifiee_regler']) {
  ok(/v_plafond := CASE WHEN v_plafond IS NULL THEN NULL ELSE GREATEST\(1, v_plafond\) END;/.test(corps(M, f)), `${f} : nombre choisi ≥ 1, sans maximum, absent = aucun`);
}
const etat = corps(M, 'republish_planifiee_etat');
ok(/v_restants := CASE WHEN \(v_regl ->> 'plafond_jour'\) IS NULL THEN NULL/.test(etat) && /v_restants_b := CASE WHEN v_plafond_b IS NULL THEN NULL/.test(etat),
  'état : restants NULL sans nombre choisi (LEAST l’ignore)');
const place = corps(M, 'remise_en_vente_place');
ok(!/plafond_du_jour/.test(sansCommentaires(place)) && /'quota_du_mois'/.test(place), 'remise en vente : plus de « plafond_du_jour », la limite du mois reste');
ok((I.match(/CREATE OR REPLACE FUNCTION public\./g) ?? []).length === 8 && /republish_plafond_palier\(p_palier text\)/.test(I), 'inverse : la fonction du palier et les sept corps d’avant');
ok(E.trim().endsWith('ROLLBACK;') && !/^COMMIT;$/m.test(E), 'essai : transaction annulée');

console.log('2. get-pending-jobs');
const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
const iEtat = gpj.indexOf('const etatRetenueRepublish = async () => {');
const blocEtat = iEtat > 0 ? gpj.slice(iEtat, gpj.indexOf('\n    };', iEtat)) : '';
ok(blocEtat && /"republish_pause_apres",\n\s+"republish_pause_duree_min",\n\s+\]\);/.test(blocEtat) && !/"republish_plafond_jour/.test(gpj),
  'la retenue ne lit que les deux clés de la pause ; plus aucune clé de plafond dans le fichier');
ok(/retenue: retenuePause,/.test(blocEtat) && /motif: retenuePause \? "pause" : null,/.test(blocEtat)
  && /reprise: retenuePause \? new Date\(finPause as number\)\.toISOString\(\) : null,/.test(blocEtat) && /limite: null as number \| null/.test(blocEtat),
  'un seul motif (pause), reprise null hors pause, `limite` toujours null pour les versions installées');
ok(/if \(sequence >= pauseApres && Date\.now\(\) - horodatages\[0\] < pauseDureeMs\) \{/.test(blocEtat), 'la pause après N d’affilée garde sa règle');
const iLevee = gpj.indexOf('UNE TRACE DE RETENUE PÉRIMÉE SE LÈVE');
const levee = iLevee > 0 ? gpj.slice(iLevee, iLevee + 2800) : '';
ok(/retenueRepublish\?\.retenue !== true/.test(levee) && /if \(r\.motif === "plafond"\) return true;/.test(levee) && /reprise <= maintenantMs/.test(levee)
  && /\.slice\(0, 40\)/.test(levee) && /delete pf\["retenue_republication"\]/.test(levee) && /\.eq\("id", j\.id\)\.eq\("status", "pending"\)/.test(levee)
  && /\.platform_fields = pf/.test(levee), 'les traces « plafond » et périmées se lèvent : bornées, sur pending, copie servie nettoyée');

console.log('3. L’app');
ok(!existe('src/utils/plafondRepublication.js'), 'utils/plafondRepublication.js (phrases de la limite du jour) supprimé');
const stock = lire('src/tabs/StockTab.jsx');
const fdj = lire('src/components/FileDesJobs.jsx');
const fjs = lire('src/utils/fileDesJobs.js');
const rp = lire('src/components/RepublicationPlanifiee.jsx');
const legal = lire('src/pages/Legal.jsx');
const servi = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n');
const LIMITE = /limite du jour|plafond du jour|daily cap|daily limit|repart à minuit|à partir de minuit|dès minuit|resumes at midnight|republications par jour, toutes|reposts a day across|maximum du palier|plan maximum|maximum quotidien|daily maximum|étale tes republications sur plusieurs jours/i;
for (const [nom, t] of [['StockTab', stock], ['FileDesJobs', fdj], ['fileDesJobs.js', fjs], ['RepublicationPlanifiee', rp], ['Legal', legal]]) {
  const m = servi(t).match(LIMITE);
  ok(!m, `${nom} : aucune phrase de limite par jour`, m?.[0]);
}
ok(!/plafondRepublication|partageRepublicationsDuJour|phraseLimiteAtteinte|ecoulementFile/.test(stock + fdj), 'plus aucun import des phrases de la limite du jour');
ok(/republications d'affilée — les \$\{restantes\} suivantes reprennent \$\{r\.quand\}\. FillSell laisse souffler ton compte Vinted entre deux séries/.test(stock)
  && /Tes annonces viennent d'enchaîner une longue série\. FillSell laisse souffler ton compte Vinted avant de reprendre/.test(stock)
  && /rythme: "En pause \(rythme de republication\) : elle repart toute seule"/.test(fjs), 'les phrases de la pause restent, telles quelles');
ok(/const NOMBRE_JOUR_MAX = 1000;/.test(rp) && /plafond_jour: r \? nombreChoisi\(r\.plafond_jour\) : nombreChoisi\(legacy\?\.plafond_jour\),/.test(rp)
  && /appliquer\(\{ plafond_jour: null \}\)/.test(rp) && !/plafond_palier|restants_compte|PLAFOND_ILLIMITE/.test(rp),
  'module planifié : nombre par jour facultatif (« Sans limite »), aucun maximum de palier');
ok(/Dernière mise à jour : 24 octobre 2026/.test(legal) && /Last updated: October 24, 2026/.test(legal), 'CGV : la date suit la clause retirée');

console.log(`\n✓ plus-de-plafond-par-jour : ${n} contrôles verts`);
