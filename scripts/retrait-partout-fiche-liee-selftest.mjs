// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// LE VERROU DE L1 (11/11/2026, règle de Nico) — UN RETRAIT DEMANDÉ « PARTOUT » RETIRE AUSSI LES COPIES DE LA BOUTIQUE
// PARTAGÉE AVEC UN COMPTE RELIÉ                                    `npm run selftest:retrait-partout-fiche-liee`
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Le 11/11, sur la seule paire de comptes reliés : deux fiches supprimées « en retirant leurs annonces » sur un compte,
// et la copie Leboncoin de chacune, suivie par la fiche jumelle de l'autre compte, restée en ligne. La liaison
// (comptes_lies + fiches_liees_comptes) n'était branchée que sur la vente. Rapport : docs/enquetes/retrait-comptes-relies-1111/.
//
// Ce verrou REJOUE le geste sur une base JETABLE (embedded-postgres sur le poste, jamais la prod) qui porte les
// définitions de PROD : 197 fonctions (corps sans commentaires : aucune donnée client versionnée), TOUS les déclencheurs de
// `inventaire`, `cross_post_jobs` et `inventaire_doublons`, la RLS des tables de la chaîne
// (scripts/essais/fixtures/prod-1111-retrait-fiche-liee/catalogue.json, relu en prod le 11/11).
// La suppression est jouée comme l'app : rôle `authenticated`, identité de la personne, sous RLS, délais de l'API (8 s).
//   · SANS la migration 20261111140000 : le défaut se reproduit (aucun retrait chez le compte relié) → ROUGE ;
//   · AVEC : la règle et les décisions de Nico du 11/11 15:15 (portée = boutiques partagées ; republications engagées
//     annulées et tâches laissées nommées ; fenêtre de 2 min ; marque de la jumelle ; la question pour une copie au titre
//     seul, et sa réponse ; toutes les échouées annulées), les corrections de la relecture (lock_timeout 5 s de la
//     migration et de l'inverse ; NOWAIT / SKIP LOCKED, budget de temps, jamais une tâche en cours verrouillée ; « erreurs »
//     au bilan ; jamais deux retraits du même numéro d'une boutique partagée ; tous les md5 de la fixture), la vente
//     inchangée, une erreur qui ne bloque jamais la suppression.
//   · il MORD : la règle retirée (l'inverse), le défaut revient.
// Les cas : scripts/essais/20261111140000_cas.mjs. Le banc avant / après / inverse : scripts/essais/20261111140000_banc.mjs.
import { demarrerBase, ouvrir, construireDecor, outils, lire, existe, FIXTURE, MIGRATION, INVERSE, INTACTES, NEUVES, TABLE_NEUVE } from './essais/20261111140000_decor.mjs';
import { jouerCas, CHEMIN, POSE_PAR, POSE_PAR_REPONSE } from './essais/20261111140000_cas.mjs';

let n = 0, ko = 0;
const ok = (cond, msg, detail) => {
  n++;
  if (cond) { console.log(`  ✓ ${msg}`); return; }
  ko++;
  const d = detail === undefined || detail === null ? '' : `\n      ← ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500)}`;
  console.log(`  ✗ ${msg}${d}`);
};
const sansCommentaires = (s) => s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const nomsNeufs = NEUVES.map((f) => f.replace(/^public\./, '').split('(')[0]).sort();
// Jamais réécrites (contrôle du TEXTE ; le contrôle à l'octet de TOUTES les fonctions de la fixture est au cas 12).
const VENTE_ET_FILET = ['armer_retraits_copies', 'armer_retrait_job', 'armer_retrait_job_pour', 'inventaire_vente_fiche_liee',
  'inventaire_vendu_retire_ses_copies', 'vente_prouvee_fiche_liee', 'inventaire_arme_retraits_avant_suppression', 'retrait_job_prouve',
  'rattachement_confirme', 'fiche_annonces_vivantes', 'comptes_sont_lies', 'inventaire_supprimer_sans_retrait', 'rapprochement_v3_fiche_de',
  'poser_questions_copies_non_prouvees', 'inventaire_doublon_decider', 'inventaire_doublon_decider_corps', 'inventaire_doublon_decider_pour',
  'boutique_partagee_compte_relie', 'armer_retrait_annonce_pour'];

console.log('1. LES DÉFINITIONS DE PROD (fixture) ET LA BASE JETABLE');
const fixture = JSON.parse(lire(FIXTURE));
ok(fixture.fonctions.length >= 190 && fixture.tables.some((t) => t.nom === 'cross_post_jobs' && t.trig.length >= 41)
  && fixture.tables.some((t) => t.nom === 'inventaire' && t.trig.length >= 20) && fixture.tables.some((t) => t.nom === 'inventaire_doublons' && t.trig.length >= 3)
  && fixture.droits.politiques.length >= 10,
`fixture : ${fixture.fonctions.length} fonctions de prod, tous les déclencheurs de inventaire, cross_post_jobs et inventaire_doublons, la RLS (lue le ${String(fixture.lu_le).slice(0, 10)}, recomparée le ${String(fixture.verifie_le).slice(0, 10)})`);
ok(Object.keys(fixture.md5).length === fixture.fonctions.length && Object.keys(fixture.md5_prod ?? {}).length === fixture.fonctions.length
  && Object.values(fixture.md5_prod).every((m) => /^[0-9a-f]{32}$/.test(m)) && INTACTES.every((f) => /^[0-9a-f]{32}$/.test(fixture.md5[f] ?? '')),
'chaque fonction a ses deux empreintes : md5_prod (prod, telle que lue) et md5 (le corps installé), la vente, ses preuves, la question et le filet compris');
const decor = lire('scripts/essais/20261111140000_decor.mjs');
ok(/supabase\\\.\(co\|com\)\|pooler/.test(decor) && /embedded-postgres/.test(decor), 'le décor refuse toute base Supabase : une base jetable seulement');
// (Relecture M8) Aucune donnée client versionnée : ni adresse, ni lien d'annonce réel, ni commentaire de prod (cas réels).
const versionnes = [FIXTURE, 'scripts/essais/20261111140000_banc.mjs', 'scripts/essais/20261111140000_cas.mjs', 'scripts/essais/20261111140000_decor.mjs'];
const fuites = versionnes.flatMap((f) => {
  const t = lire(f);
  return [...t.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z.]{2,}/g)].map((m) => `${f} : adresse ${m[0]}`)
    .concat([...t.matchAll(/leboncoin\.fr\/ad\/(?!vetements\/\$\{)[a-z_]+\/\d+/gi)].map((m) => `${f} : lien ${m[0]}`));
}).filter((x) => !/@exemple\.invalid/i.test(x));
ok(fuites.length === 0, 'aucune adresse ni lien d\'annonce réel dans la fixture, le décor, les cas et le banc (valeurs d\'essai inventées)', fuites.slice(0, 5));
ok(fixture.fonctions.every((f) => !/^\s*--/m.test(f.def.slice(f.def.search(/^AS \$/m)))), 'la fixture ne porte aucun commentaire de prod (ils citaient des cas réels) : le code seul', fixture.fonctions.filter((f) => /^\s*--/m.test(f.def.slice(f.def.search(/^AS \$/m)))).map((f) => f.nom).slice(0, 5));

console.log('\n2. LA MIGRATION ET SON INVERSE (contrôle du texte, insensible à la casse)');
const aMigration = existe(MIGRATION), aInverse = existe(INVERSE);
ok(aMigration, `${MIGRATION} existe`);
ok(aInverse, `${INVERSE} existe`);
const MIG = aMigration ? lire(MIGRATION) : '';
const INV = aInverse ? lire(INVERSE) : '';
if (aMigration) {
  const code = sansCommentaires(MIG);
  const instructions = code.split(';').map((s) => s.trim()).filter(Boolean);
  ok(/^SET\s+lock_timeout\s*=\s*'5s'$/i.test(instructions[0] ?? '') && /^RESET\s+lock_timeout$/i.test(instructions.at(-1) ?? ''),
    '(relecture B1) la migration commence par SET lock_timeout = \'5s\' (DDL sur inventaire) et le rend à la fin', [instructions[0], instructions.at(-1)]);
  const creees = [...MIG.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-z_0-9]+)\s*\(/gi)].map((x) => x[1].toLowerCase()).sort();
  ok(JSON.stringify(creees) === JSON.stringify(nomsNeufs), `en AJOUT : six fonctions neuves, rien d'autre (${creees.join(', ')})`);
  ok(VENTE_ET_FILET.every((f) => !new RegExp(`FUNCTION\\s+(public\\.)?${f}\\s*\\(`, 'i').test(code)), 'aucune fonction de la vente, de ses preuves, de la question, du filet ni du moteur de fusion n\'est réécrite');
  const declencheurs = [...code.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+([a-z_0-9]+)\s+(BEFORE|AFTER|INSTEAD\s+OF)\s+([A-Z ]+?)\s+ON\s+(?:public\.)?([a-z_]+)/gi)].map((x) => `${x[1]} ${x[2]} ${x[3]} ${x[4]}`.toLowerCase());
  ok(JSON.stringify(declencheurs) === JSON.stringify(['inventaire_arme_retraits_fiche_liee before delete inventaire']), 'un seul déclencheur neuf : BEFORE DELETE sur inventaire', declencheurs);
  const horsCorps = code.replace(/AS \$function\$[\s\S]*?\$function\$/g, '');
  const tables = [...horsCorps.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_0-9]+)/gi)].map((x) => x[1].toLowerCase());
  const alters = [...horsCorps.matchAll(/ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?([a-z_0-9]+)\s+([A-Z ]+)/gi)].map((x) => `${x[1]} ${x[2].trim()}`.toLowerCase());
  ok(JSON.stringify(tables) === JSON.stringify([TABLE_NEUVE]) && JSON.stringify(alters) === JSON.stringify([`${TABLE_NEUVE} enable row level security`]),
    `une seule table neuve (${TABLE_NEUVE}, la marque), née sous RLS ; aucune table existante altérée`, { tables, alters });
  ok(!/\b(INSERT\s+INTO|UPDATE\s+(public\.)?[a-z_]+\s+SET|DELETE\s+FROM|TRUNCATE|DROP\s+TABLE|DROP\s+FUNCTION|cron\.)/i.test(horsCorps),
    'la migration n\'écrit aucune donnée, ne retire rien, ne planifie rien');
  ok(!/^\s*(BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION)\s*;/im.test(MIG), 'aucune transaction dans la migration (leçon du 03/11)');
  for (const f of NEUVES.filter((x) => !/copie_retrait_partout_repondre/.test(x))) {
    const sig = f.replace(/^public\./, '').replace(/,/g, ', ');
    ok(new RegExp(`REVOKE ALL ON FUNCTION public\\.${sig.replace(/[()]/g, '\\$&')} FROM PUBLIC, anon, authenticated;`, 'i').test(MIG)
      && new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${sig.replace(/[()]/g, '\\$&')} TO service_role;`, 'i').test(MIG),
    `droits explicites : ${sig.split('(')[0]} — ni l'app ni un visiteur, le serveur seulement`);
  }
  ok(/REVOKE ALL ON FUNCTION public\.copie_retrait_partout_repondre\(uuid, text, uuid\) FROM PUBLIC, anon;/i.test(MIG)
    && /GRANT EXECUTE ON FUNCTION public\.copie_retrait_partout_repondre\(uuid, text, uuid\) TO authenticated, service_role;/i.test(MIG)
    && !/GRANT[^;]*TO[^;]*\banon\b/i.test(code), 'la réponse à la question : la personne (authenticated) et le serveur, jamais un visiteur ; aucun droit à anon');
  ok((MIG.match(/SECURITY DEFINER\n SET search_path TO 'public', 'pg_temp'/gi) ?? []).length === 6, 'les six fonctions : SECURITY DEFINER, search_path fixé');
  ok(code.includes(`v_pose     constant text := '${POSE_PAR}';`) && !/armer_retrait_job/i.test(POSE_PAR) && !/armer_retrait_job/i.test(POSE_PAR_REPONSE),
    `pose_par = « ${POSE_PAR} » / « ${POSE_PAR_REPONSE} » : jamais lu comme un retrait d'article vendu (/armer_retrait_job/)`);
  ok(code.includes(`p_chemin text DEFAULT '${CHEMIN}'::text`) && !/^vente_/i.test(CHEMIN) && /if v_chemin ~ '\^vente_' then\s+raise exception/i.test(code)
    && !/'vente_[a-z_]*'/i.test(code.replace(/if v_chemin ~ '\^vente_'/i, '')), `chemin = « ${CHEMIN} » ; un chemin « vente_… » est refusé, jamais écrit`);
  ok(/not public\.retrait_job_prouve\(j\.id\) or not public\.rattachement_confirme\(j\.id\)/i.test(code) && /public\.fiche_annonces_vivantes\(m\.fiche, j\.platform\) >= 2/i.test(code)
    && /public\.comptes_sont_lies\(p_user, x\.compte\)/i.test(code) && /public\.boutique_partagee_compte_relie\(p_user, /i.test(code),
  'les preuves de la vente, appelées telles quelles (rattachement certain, jamais deux annonces vivantes, comptes reliés), et la boutique partagée de prod');
  ok(!/derniere_propagation/i.test(code) && !/update\s+public\.inventaire\b|delete\s+from\s+public\.inventaire\b|insert\s+into\s+public\.inventaire\b/i.test(code),
    'jamais une écriture sur une fiche (ni la jumelle, ni la ligne en cours de suppression), ni sur derniere_propagation');
  const trg = code.slice(code.search(/FUNCTION public\.inventaire_arme_retraits_fiche_liee\(\)/i));
  ok(/fillsell\.sans_retrait[\s\S]{0,80}return old;[\s\S]{0,60}pg_trigger_depth\(\) > 1[\s\S]{0,400}v_role = 'service_role'/i.test(trg), 'le déclencheur garde les trois portes du filet (réinitialisation, cascade, service_role)');
  ok(/exception when others then\s+raise warning 'inventaire_arme_retraits_fiche_liee \(article %\) : % — suppression poursuivie'/i.test(trg) && /return old;\s*end;\s*\$function\$/i.test(trg),
    'une erreur de la traversée est tracée et laisse passer la suppression');
  ok(/'annonces_laissees_en_ligne'/i.test(trg) && /interval '2 minutes'/i.test(trg) && !/interval '15 minutes'/i.test(code),
    '« laisser les annonces en ligne » sort ; décision 3 : « partout » = un retrait de la fiche ouvert depuis moins de 2 MINUTES, ou un dépôt que le filet arme');
  ok((code.match(/set_config\('request\.jwt\.claims'/gi) ?? []).length === 2 && (code.match(/set_config\('request\.jwt\.claim\.sub'/gi) ?? []).length === 2,
    'l\'identité du compte relié est prise le temps de ses écritures, puis celle de la session est rendue');
  const armer = code.slice(code.search(/FUNCTION public\.armer_retraits_fiche_liee\(/i), code.search(/FUNCTION public\.inventaire_arme_retraits_fiche_liee\(\)/i));
  const iT = armer.search(/for t in/i);
  const lectureTaches = iT < 0 ? 'for update' : armer.slice(iT, armer.indexOf('loop', iT));
  ok(/SET lock_timeout TO '1s'/i.test(armer) && /interval '2 seconds'/i.test(armer) && /for update skip locked/i.test(armer) && /for update nowait/i.test(code)
    && !/for update(?! skip locked| nowait)/i.test(lectureTaches),
  '(relecture I1/M1) lock_timeout 1 s, budget de 2 s, SKIP LOCKED / NOWAIT ; les tâches sont lues SANS verrou (une tâche en cours n\'est jamais verrouillée)');
  ok(/'erreurs', v_err_j/i.test(armer) && /'taches_laissees', v_lais_j/i.test(armer), '(relecture I2) le bilan porte « erreurs » et « taches_laissees »');
}
if (aInverse) {
  const inv = sansCommentaires(INV);
  const instr = inv.split(';').map((s) => s.trim()).filter(Boolean);
  const attendues = ['SET lock_timeout = \'5s\'', 'DROP TRIGGER IF EXISTS inventaire_arme_retraits_fiche_liee ON public.inventaire',
    ...['inventaire_arme_retraits_fiche_liee()', 'armer_retraits_fiche_liee(uuid, bigint, text)', 'copie_retrait_partout_repondre(uuid, text, uuid)',
      'armer_retrait_copie_reliee(uuid, text, text, jsonb)', 'annonce_en_retrait_compte_relie(uuid)', 'copies_fiche_liee(uuid, bigint)'].map((f) => `DROP FUNCTION IF EXISTS public.${f}`),
    `DROP TABLE IF EXISTS public.${TABLE_NEUVE}`, 'RESET lock_timeout'];
  ok(JSON.stringify(instr.map((s) => s.toLowerCase())) === JSON.stringify(attendues.map((s) => s.toLowerCase())),
    '(relecture B1) l\'inverse : SET lock_timeout = \'5s\' d\'abord, puis le déclencheur, les six fonctions et la table — rien d\'autre', instr);
}

console.log('\n3. LE GESTE REJOUÉ SUR LA BASE JETABLE (définitions de prod' + (aMigration ? ' + la migration)' : ' SEULES : la migration est absente)'));
let base = null, c = null;
try {
  base = await demarrerBase({ port: 56000 + Math.floor(Math.random() * 2000) });
  c = await ouvrir(base.url);
} catch (e) {
  ok(false, 'base jetable indisponible (embedded-postgres et pg : npm i --no-save embedded-postgres@17.10.0-beta.17 pg@8.16.3)', e.message);
}
if (c) {
  try {
    const b = await construireDecor(c, fixture);
    ok(b.nf === b.nfTotal && b.nt === b.ntTotal && b.np === b.npTotal && b.echecs.length === 0,
      `décor : ${b.nf}/${b.nfTotal} fonctions, ${b.nt}/${b.ntTotal} déclencheurs, ${b.np}/${b.npTotal} politiques de prod`, b.echecs.slice(0, 3));
    const o = outils(c, { url: base.url, roles: fixture.droits.roles ?? [] });
    await o.comptes();
    const md5Base = await o.md5();
    const differentes = Object.keys(fixture.md5).filter((k) => md5Base[k] !== fixture.md5[k]);
    ok(differentes.length === 0, `avant la migration : les ${Object.keys(fixture.md5).length} fonctions de la base jetable sont celles de la fixture, à l'octet`, differentes.slice(0, 5));
    if (aMigration) {
      await c.query(MIG);
      await c.query(MIG);
      const neufs = await o.objetsNeufs();
      const md5Apres = await o.md5();
      const changees = Object.keys(fixture.md5).filter((k) => md5Apres[k] !== fixture.md5[k]);
      const ajoutees = Object.keys(md5Apres).filter((k) => !(k in fixture.md5)).map((k) => k.split('(')[0]).sort();
      ok(neufs.fonctions.length === 6 && neufs.declencheur && neufs.table && changees.length === 0 && JSON.stringify(ajoutees) === JSON.stringify(nomsNeufs),
        `migration appliquée deux fois sans erreur (idempotente) : six fonctions, une table, un déclencheur ; 0 changée sur ${Object.keys(fixture.md5).length} (TOUS les md5)`, { changees, ajoutees });
      const lt = await o.un(`SELECT current_setting('lock_timeout') AS v`);
      ok(lt.v === '0', 'après la migration, la session a retrouvé son lock_timeout (RESET)', lt);
    }
    await jouerCas(o, ok, { apres: true, migration: aMigration ? MIG : null, inverse: aInverse ? INV : null });

    if (aMigration && aInverse) {
      console.log('\n4. LE VERROU MORD : la règle retirée (inverse), le défaut revient');
      await c.query(INV);
      const partis = await o.objetsNeufs();
      ok(partis.fonctions.length === 0 && !partis.declencheur && !partis.table, 'inverse appliqué : plus aucune des six fonctions, plus de table, plus de déclencheur');
      let rouges = 0;
      const compter = (cond) => { if (!cond) rouges++; };
      const journal = console.log; console.log = () => {};
      try { await jouerCas(o, compter, { apres: true, seulement: ['1.', '2.', '10.', '11.'] }); } finally { console.log = journal; }
      ok(rouges >= 8, `sans la règle, les cas 1, 2, 10 et 11 rougissent (${rouges} contrôles en échec) : le verrou distingue`);
    }
  } catch (e) {
    ok(false, 'essai sur la base jetable interrompu', `${e.message}${e.where ? ` — ${String(e.where).slice(0, 200)}` : ''}`);
  } finally {
    await c.end().catch(() => {});
    await base.arreter();
  }
}

console.log('\n5. LA RÈGLE EST ÉCRITE, LE VERROU EST DANS LA SUITE');
const regles = lire('docs/regles/ventes-et-retraits.md');
ok(/retrait-partout-fiche-liee/.test(regles) && /compte relié/i.test(regles) && /20261111140000/.test(regles) && /boutique_partagee_compte_relie/.test(regles)
  && /jumelles_retirees_partout/.test(regles) && /copie_retrait_partout_repondre/.test(regles),
'docs/regles/ventes-et-retraits.md : la règle, la portée, la marque, la question et sa réponse, la migration, le nom du verrou');
ok(JSON.parse(lire('package.json')).scripts['selftest:retrait-partout-fiche-liee'] === 'node scripts/retrait-partout-fiche-liee-selftest.mjs', 'package.json : selftest:retrait-partout-fiche-liee');
ok(existe('scripts/essais/20261111140000_banc.mjs') && /AVANT/.test(lire('scripts/essais/20261111140000_banc.mjs')) && /INVERSE/.test(lire('scripts/essais/20261111140000_banc.mjs')),
  'le banc avant / après / inverse existe');

console.log(ko ? `\n✗ retrait-partout-fiche-liee : ${ko} contrôle(s) en échec sur ${n}` : `\n✓ retrait-partout-fiche-liee : ${n}/${n}`);
process.exit(ko ? 1 : 0);
