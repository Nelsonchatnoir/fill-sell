// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// VERROU — « REMPLACER MON COMPTE DE PLATEFORME » (16/11/2026, point 4 puis point 7 de Nico — le compte cfdfda6f)
//     npm run selftest:comptes-plateforme-remplacer
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Sans base (rapide, dans la suite complète). La preuve sur Postgres jetable, avec le schéma de prod et ses déclencheurs,
// est le banc : node scripts/essais/20261116200000_banc.mjs.
// Rouge avant (fichiers absents, ou corps de prod sans la règle), vert après. Ce test prouve, en lisant les fichiers :
//   A. la migration : gardes md5 des QUATRE corps de prod (fixtures), chaque ligne de prod gardée dans l'ordre ; le
//      registre (un seul compte suivi, RLS en lecture, aucune écriture client) ; la colonne compte_quitte_le ; les droits
//      (authenticated : les deux RPC de l'app seulement) ; le geste n'écrit jamais retiree_le, une vente, un retrait, une
//      fiche ; la simulation rend AVANT toute écriture ; les questions « Vendue ? » closes avec leur tâche (« ancien
//      compte quitté, ce n'est pas une vente ») ; la porte cross_post_jobs_alerte_tenue n'ouvre plus « Vendue ? » sur un
//      compte quitté (après les gardes de republication) ;
//   B. l'inverse : les quatre corps de prod remis (CR compris), fonctions, colonne et tables retirées ;
//   C. l'écran : les textes (FR + EN, sans émoji ni durée), le refus d'import traduit, les deux RPC appelées (simulation
//      puis geste), la relecture bornée, la ligne branchée dans « À régler » ;
//   D. le script du compte cfdfda6f : simulation en lecture seule, sauvegarde, garde, appel interne « script » (jamais une session
//      simulée), inverse.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 400)}` : ''}`); }
};
const lireBrut = (p) => { try { return fs.readFileSync(join(ROOT, p), 'utf8'); } catch { return ''; } };
const lire = (p) => lireBrut(p).replace(/\r\n/g, '\n');
const VERSION = '20261116200000';
const MIG = lire(`supabase/migrations/${VERSION}_comptes_plateforme_remplacer.sql`);
const INV = lire(`supabase/rollbacks/${VERSION}_comptes_plateforme_remplacer_INVERSE.sql`);
const FIX = 'scripts/essais/fixtures/prod-1611-compte-plateforme';
const MD5 = (() => { try { return JSON.parse(lire(`${FIX}/md5.json`)).fonctions; } catch { return {}; } })();
// (16/11) Les corps de PROD citent des clients dans leurs commentaires : ils restent HORS du dépôt (selftest:donnees-clients),
// dans C:/Users/nicol/Documents/FillSell-bancs/prod-1611-compte-plateforme/snap_fonctions.json. Absents : ces contrôles ratent.
const PROD = (() => {
  for (const p of [`${FIX}/snap_fonctions.json`, 'C:/Users/nicol/Documents/FillSell-bancs/prod-1611-compte-plateforme/snap_fonctions.json']) {
    try { return JSON.parse(fs.readFileSync(p.includes(':') ? p : join(ROOT, p), 'utf8')); } catch { /* suivant */ }
  }
  return [];
})();
const SIGS = ['annonce_non_prouvee_vivante(uuid,boolean)', 'constater_absences_releve(uuid)',
  'veille_recentes_ouvrir(text,text[],text,text)', 'cross_post_jobs_alerte_tenue()'];

// Le corps d'une fonction dans un fichier SQL (de « CREATE OR REPLACE FUNCTION public.<nom>( » à « $function$; »).
function corps(sql, nom) {
  const i = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  if (i < 0) return '';
  const j = sql.indexOf('$function$;', i);
  return j < 0 ? '' : sql.slice(i, j + 11);
}

console.log('\nA. La migration');
ok(MIG.length > 0, `supabase/migrations/${VERSION}_comptes_plateforme_remplacer.sql existe`);
for (const sig of SIGS) {
  ok(MD5[sig] && MIG.includes(`('public.${sig}', '${MD5[sig]}'`), `garde md5 : ${sig} = corps de prod ${MD5[sig] ?? '?'}`);
  // (la fin « $function$ » devient « $function$; » dans un fichier : comparée sans elle)
  const fin = (t) => t.replace(/\r/g, '').replace(/\s*\$function\$;?\s*$/, '');
  const prod = fin(PROD.find((f) => f.sig === sig)?.def ?? '');
  const neuf = fin(corps(MIG, sig.slice(0, sig.indexOf('('))));
  const lp = prod.split('\n'), ln = neuf.split('\n');
  let k = 0; for (const l of ln) if (k < lp.length && l === lp[k]) k++;
  ok(prod && neuf && k === lp.length && /⟦16\/11 compte suivi/.test(neuf), `${sig} : réécrit depuis le corps de prod, ses ${lp.length} lignes gardées dans l'ordre, ajouts marqués ⟦16/11⟧`, `${k}/${lp.length}`);
}
ok(/DO \$verif_apres\$[\s\S]*cross_post_jobs_alerte_tenue\(\)', '[0-9a-f]{32}'/.test(MIG) && /md5\(replace\(pg_get_functiondef/.test(MIG),
  'garde « après » des quatre corps (sans retour chariot : un fichier extrait en CRLF ne change rien)');
ok(/CREATE TABLE IF NOT EXISTS public\.comptes_plateforme_suivi[\s\S]*etat text NOT NULL CHECK \(etat IN \('suivi', 'quitte'\)\)/.test(MIG)
  && /CREATE UNIQUE INDEX IF NOT EXISTS comptes_plateforme_suivi_un_seul ON public\.comptes_plateforme_suivi \(user_id, platform\)\s+WHERE etat = 'suivi'/.test(MIG),
'registre : comptes_plateforme_suivi, états suivi | quitte, UN seul compte suivi par plateforme');
ok(/ALTER TABLE public\.comptes_plateforme_suivi ENABLE ROW LEVEL SECURITY/.test(MIG)
  && /FOR SELECT TO authenticated USING \(user_id = \(SELECT auth\.uid\(\)\)\)/.test(MIG)
  && /GRANT SELECT ON public\.comptes_plateforme_suivi TO authenticated;/.test(MIG)
  && !/GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*comptes_plateforme_suivi TO authenticated/.test(MIG),
'registre : RLS, la personne lit SA ligne, aucune écriture client');
ok(/ADD COLUMN IF NOT EXISTS compte_quitte_le timestamptz/.test(MIG), 'annonces_plateforme.compte_quitte_le (NULL partout à l\'application)');
ok(/HAVING count\(DISTINCT s\.compte_plateforme\) = 1/.test(MIG) && /ON CONFLICT DO NOTHING;/.test(MIG), 'amorce : un seul compte vu → suivi ; plusieurs → rien (la question)');
ok(/GRANT EXECUTE ON FUNCTION public\.remplacer_compte_plateforme\(text, text, boolean\) TO authenticated, service_role;/.test(MIG)
  && /GRANT EXECUTE ON FUNCTION public\.compte_plateforme_a_confirmer\(\) TO authenticated, service_role;/.test(MIG)
  && /REVOKE ALL ON FUNCTION public\.remplacer_compte_plateforme_pour\(uuid, text, text, boolean, text\) FROM PUBLIC, anon, authenticated;/.test(MIG)
  && !/GRANT EXECUTE ON FUNCTION public\.remplacer_compte_plateforme_pour[^;]*authenticated/.test(MIG),
'droits : authenticated n\'appelle que remplacer_compte_plateforme et compte_plateforme_a_confirmer (son compte) ; la fonction interne : serveur seulement');
const pour = corps(MIG, 'remplacer_compte_plateforme_pour');
ok(/remplacer_compte_plateforme_pour\(p_user uuid, p_platform text, p_compte text,\s+p_simuler boolean DEFAULT true/.test(pour)
  && /CREATE OR REPLACE FUNCTION public\.remplacer_compte_plateforme\(p_platform text, p_compte text, p_simuler boolean DEFAULT true\)/.test(MIG),
'signature : remplacer_compte_plateforme(p_platform, p_compte, p_simuler DEFAULT true)');
ok(/IF auth\.role\(\) IS NOT NULL AND auth\.role\(\) <> 'service_role' AND p_user IS DISTINCT FROM auth\.uid\(\) THEN/.test(pour),
  'identité vérifiée DANS la fonction (règle du 20/10)');
ok(/d\.compte IS DISTINCT FROM v_compte[\s\S]*'pas_le_dernier_releve'/.test(pour) && /'releve_incomplet'/.test(pour) && /'tache_en_cours'/.test(pour) && /'releve_en_cours'/.test(pour),
  'refus en clair : le compte doit être celui du DERNIER relevé complet ; relevé incomplet, en cours, tâche en cours');
const iSim = pour.indexOf('IF p_simuler THEN'), iEcrit = pour.search(/\b(UPDATE|INSERT INTO)\b/);
ok(iSim > 0 && iSim < iEcrit, 'la simulation rend son bilan AVANT toute écriture');
ok(!/retiree_le\s*=/.test(pour) && !/INSERT INTO\s+(public\.)?cross_post_jobs/.test(pour) && !/status\s*=\s*'sold'/.test(pour)
  && !/UPDATE\s+(public\.)?inventaire\b/.test(pour) && !/INSERT INTO\s+(public\.)?ventes/.test(pour) && !/'sale_signal',\s*'sold'/.test(pour),
'jamais : retiree_le, un retrait créé, une vente, une tâche vendue, une fiche modifiée');
ok(/\(j\.platform_fields ->> 'sale_signal'\) IS DISTINCT FROM 'sold'/.test(pour) && /republication_retrait_engage/.test(pour) && /'fusion_deja_vendu'/.test(pour),
  'laissés : tâche au signal de vente, republication engagée (décision 7a), retrait lié à une fusion « déjà vendu »');
ok(/v_msg_tache := 'Ancien compte Leboncoin quitté le ' \|\| v_jour\s*\|\| ', ce n''est pas une vente/.test(pour)
  && /- ARRAY\['unavailable_since', 'sale_signal', 'unavailable_pending_since', 'detected_price'\]/.test(pour) && /'signal_avant'/.test(pour)
  && /'questions_vendue'/.test(pour),
'les questions « Vendue ? » des annonces de l\'ancien compte sont closes avec leur tâche (« ancien compte quitté, ce n\'est pas une vente »), signal gardé');
const alerte = corps(MIG, 'cross_post_jobs_alerte_tenue');
const i1b = alerte.indexOf('-- (1b) Remplacé par sa propre republication.'), iQ = alerte.indexOf("c.etat = 'quitte'"), i1bis = alerte.indexOf('-- (1 bis)');
ok(iQ > 0 && i1bis > 0 && i1bis < iQ && iQ < i1b && /new\.status := 'cancelled';\s+new\.error := 'Ancien compte ' \|\| v_nom \|\| ' quitté'/.test(alerte)
  && /ce n''est pas une vente/.test(alerte),
'la veille n\'ouvre plus « Vendue ? » sur une annonce d\'un compte QUITTÉ (cross_post_jobs_alerte_tenue, après les gardes de republication)');
ok(!/'sold'/.test(alerte.slice(iQ, i1b)), '… sans jamais écrire un signal de vente');

console.log('\nB. L\'inverse');
ok(INV.length > 0, `supabase/rollbacks/${VERSION}_comptes_plateforme_remplacer_INVERSE.sql existe`);
const INVb = lireBrut(`supabase/rollbacks/${VERSION}_comptes_plateforme_remplacer_INVERSE.sql`).replace(/\r/g, '').replace(/⟦CR⟧/g, '\r');
for (const sig of SIGS) {
  const prod = PROD.find((f) => f.sig === sig)?.def ?? '';
  ok(prod && INVb.includes(prod.replace(/\s*$/, '')), `${sig} : corps de prod remis à l'octet (retours chariot de prod compris)`);
  ok(new RegExp(`'public\\.${sig.replace(/[()[\]]/g, '\\$&')}', '${MD5[sig]}'\\)`).test(INV), `${sig} : garde de sortie = md5 de prod`);
}
ok(['compte_plateforme_a_confirmer()', 'compte_plateforme_a_confirmer_pour(uuid)', 'remplacer_compte_plateforme(text, text, boolean)',
  'remplacer_compte_plateforme_pour(uuid, text, text, boolean, text)', 'compte_plateforme_dernier_releve(uuid, text)', 'compte_plateforme_juger(uuid, text, text)']
  .every((f) => INV.includes(`DROP FUNCTION IF EXISTS public.${f};`))
  && /DROP COLUMN IF EXISTS compte_quitte_le/.test(INV) && /DROP TABLE IF EXISTS public\.comptes_plateforme_suivi;/.test(INV)
  && /DROP TABLE IF EXISTS public\.comptes_plateforme_remplacements;/.test(INV),
'fonctions neuves, colonne et tables retirées');
ok(/SET LOCAL session_replication_role = replica;/.test(INV) && /r\.avant -> 'taches'/.test(INV) && /pepite_remboursee/.test(INV),
  'état des annonces et des tâches remis depuis la trace, sans déclencheur ; jamais une republication remboursée remise en file');

console.log('\nC. L\'écran');
let C = null;
try { C = await import(pathToFileURL(join(ROOT, 'src/utils/changementCompte.js')).href); } catch (e) { ok(false, 'src/utils/changementCompte.js se charge', e?.message); }
if (C) {
  const qCompte = {
    platform: 'leboncoin', cas: 'quel_compte', compte_lu: '23b59b14-5cde-4fff-8bcb-7c6464608a33', releve_le: '2026-11-16T13:16:00Z',
    annonces_lues: 67, compte_suivi: null,
    simulation: { ok: true, simulation: true, anciens: ['bf460991-06f6-4460-a36f-b60393964407'], annonces: 108, fiches_liberees: 91,
      questions_vendue: 30, premieres_lectures_hors_ligne: 60, republications: 0, retraits: [], annonces_republication_engagee_laissees: [],
      objets_vendus_encore_en_ligne: [{ titre: 'Costume garçon 7 ans', numero: '3303478608' }, { titre: 'Dashcam rétroviseur', numero: '3308401684' },
        { titre: 'Lampe horticole LED', numero: '3308403369' }] },
  };
  const fr = C.questionChangementCompte(qCompte, 'fr'), en = C.questionChangementCompte(qCompte, 'en');
  ok(fr.texte === 'Ton ordinateur est connecté à un autre compte Leboncoin : n° 23b59b14. Ton ancien compte n° bf460991 : 108 annonces.', `question (FR) : « ${fr.texte} »`);
  ok(en.texte === 'Your computer is signed in to another Leboncoin account: n° 23b59b14. Your old account n° bf460991: 108 listings.', `question (EN) : « ${en.texte} »`);
  ok(fr.voir === 'Voir ce qui change' && fr.oui === 'Oui, suivre ce compte' && fr.non === 'Non, garder l’ancien' && en.oui === 'Yes, follow this account',
    'les trois gestes : « Voir ce qui change », « Oui, suivre ce compte », « Non, garder l’ancien » (et en anglais)');
  ok(/16\/11 à 14:16/.test(fr.detail) && /67 annonces/.test(fr.detail), `le relevé (heure de Paris) : « ${fr.detail} »`);
  const bfr = C.bilanChangementCompte(qCompte.simulation, 'fr'), ben = C.bilanChangementCompte(qCompte.simulation, 'en');
  ok(/ne suivra plus les 108 annonces/.test(bfr[0]) && /Ce n’est pas une vente : rien n’est retiré/.test(bfr[0]), `bilan : « ${bfr[0]} »`);
  ok(bfr.some((p) => /90 questions « Vendue \? » sur ces annonces seront closes : ce ne sont pas des ventes/.test(p)), 'bilan : les questions « Vendue ? » closes, « ce ne sont pas des ventes »');
  ok(bfr.some((p) => /« Costume garçon 7 ans », « Dashcam rétroviseur » et « Lampe horticole LED »\. Si ce compte est encore ouvert, retire-les toi-même/.test(p)),
    'bilan : les objets vendus encore en ligne, nommés, « retire-les toi-même »');
  ok(bfr.some((p) => /91 articles pourront de nouveau être publiés sur Leboncoin/.test(p)) && ben.length === bfr.length, 'bilan : les fiches libérées ; même bilan en anglais');
  const tous = [fr.titre, fr.texte, fr.detail, en.titre, en.texte, en.detail, ...bfr, ...ben,
    ...['session', 'plateforme', 'compte_invalide', 'aucun_releve', 'pas_le_dernier_releve', 'releve_incomplet', 'releve_en_cours', 'tache_en_cours', 'autre']
      .flatMap((m) => [C.messageRefusChangement({ motif: m }, 'fr'), C.messageRefusChangement({ motif: m }, 'en')]),
    C.messageChangementFait({ annonces_closes: 108 }, 'fr'), C.messageChangementFait({ annonces_closes: 108 }, 'en'),
    C.messageGarderAncien('fr'), C.messageGarderAncien('en')];
  ok(tous.every((t) => typeof t === 'string' && t.length > 0 && !/\p{Extended_Pictographic}/u.test(t)), 'aucun émoji, aucun texte vide');
  ok(tous.every((t) => !/\b(minutes?|secondes?|heures?|bientôt|instant|soon|moment|hours?|seconds?)\b/i.test(t)), 'aucune durée ni heure prévue (règle du 16/10)');
  ok(tous.every((t) => !/\b(RPC|job|run|user_id|compte_plateforme|null|undefined)\b/.test(t)), 'aucun mot technique');
  ok(C.messageRefusChangement({ motif: 'pas_le_dernier_releve' }, 'fr').startsWith('Ton ordinateur a lu un autre compte depuis'), 'refus traduit (jamais le texte brut du serveur)');
  for (const m of ['autre_compte', 'compte_quitte', 'compte_a_confirmer']) {
    ok(C.texteImportRefuse({ ok: false, reason: 'annonce_non_prouvee_vivante', motif: m }, 'fr') && C.texteImportRefuse({ ok: false, reason: 'annonce_non_prouvee_vivante', motif: m }, 'en'),
      `import refusé « ${m} » : phrase vraie (FR + EN) — « ${C.texteImportRefuse({ reason: 'annonce_non_prouvee_vivante', motif: m }, 'fr')} »`);
  }
  ok(C.texteImportRefuse({ reason: 'annonce_non_prouvee_vivante', motif: 'disparue' }, 'fr') === null && C.texteImportRefuse({ reason: 'autre' }, 'fr') === null,
    'tout autre refus garde le message du serveur');
  const l = C.ligneChangementCompte([qCompte], 'fr');
  ok(l?.cle === 'compte_change' && l.n === 1 && l.titre === 'Leboncoin : un autre compte est connecté' && C.ligneChangementCompte([], 'fr') === null,
    'la ligne « À régler » : « Leboncoin : un autre compte est connecté » (rien sans question)');
}
const JSX = lire('src/stock/ChangementCompte.jsx');
ok(/supabase\.rpc\('compte_plateforme_a_confirmer'\)/.test(JSX) && /supabase\.rpc\('remplacer_compte_plateforme', \{\s*p_platform: q\.platform, p_compte: q\.compte_lu, p_simuler: simuler,/.test(JSX)
  && /appelerRemplacement\(question, true\)/.test(JSX) && /appelerRemplacement\(question, false\)/.test(JSX),
'écran : la question lue par compte_plateforme_a_confirmer ; « Voir ce qui change » = simulation, « Oui » = le geste ; le compte vient du relevé');
ok(/demarrerRelecture\(lire, \{ intervalleMs: 10 \* 60_000 \}\)/.test(JSX) && !/setInterval\s*\(/.test(JSX), 'écran : relecture bornée (10 min), jamais de setInterval');
const ARG = lire('src/stock/EcranARegler.jsx');
ok(/import \{ LigneChangementCompte \} from '\.\/ChangementCompte';/.test(ARG) && /<LigneChangementCompte lang=\{lang\} onNombre=\{setNCompte\} \/>/.test(ARG)
  && /\+ \(lireCompte \? nCompte : 0\)/.test(ARG),
'« À régler » : la ligne y est branchée et comptée dans l\'en-tête');

console.log('\nD. Le script d\'cfdfda6f');
const REP = lire('scripts/reparations/20261116_ayadi_remplacer_compte_lbc.sql');
const REPI = lire('scripts/reparations/20261116_ayadi_remplacer_compte_lbc_INVERSE.sql');
ok(/BEGIN TRANSACTION READ ONLY;\s+SELECT jsonb_pretty\(public\.remplacer_compte_plateforme_pour\([\s\S]*?, true, 'script'\)\) AS simulation;\s+COMMIT;/.test(REP),
  '§ 1 : simulation dans une transaction en lecture seule');
const iSauv = REP.indexOf('CREATE TABLE public._backup_1611_ayadi_lbc_annonces'), iGarde = REP.indexOf('DO $garde$'), iGeste = REP.indexOf(", false, 'script')) AS bilan;");
ok(iSauv > 0 && iSauv < iGarde && iGarde < iGeste, '§ 2 : sauvegarde, garde (la simulation doit dire ce que l\'ordre a vu), puis le geste — une seule transaction');
ok(!/^\s*SELECT set_config\('request\.jwt/m.test(REP) && /remplacer_compte_plateforme_pour/.test(REP), 'appel interne « script » (jamais une session simulée)');
ok(/comptes_plateforme_remplacements[\s\S]*par = 'script'/.test(REPI) && /session_replication_role = replica/.test(REPI), 'inverse du script : depuis la trace, sans déclencheur');

console.log(`\n${verts} ok, ${rouges} raté(s)`);
process.exit(rouges ? 1 : 0);
