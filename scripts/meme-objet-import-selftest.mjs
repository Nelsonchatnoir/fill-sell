// ═══════════════════════════════════════════════════════════════════════════
// VERROU — UN IMPORT QUI RETROUVE LE MÊME OBJET LE RATTACHE (OU POSE LA QUESTION, HORS DU STOCK) ; AUCUNE PUBLICATION
// LÀ OÙ LE MÊME OBJET EST DÉJÀ EN LIGNE (13/11/2026, lot du 13/11, agent N6a)
//   npm run selftest:meme-objet-import
// ═══════════════════════════════════════════════════════════════════════════
// Le cas réel (compte bf85d176, relu en prod le 13/11, lecture seule) : le relevé du dressing Vinted du 12/11 à 15:33
// (run 16f51700) écrit la fiche 1794494010078017 (annonce Vinted 10478358207) pour un clavier Nor-Tec déjà au stock :
// la fiche 1790174130756 (import Leboncoin du 23/09) porte Leboncoin 3272015849 et eBay 407214160146, rattachées
// automatiquement. Les trois photos sont les mêmes (dHash identiques, pHash à 0 et 2 bits).
//   · La passe de 15:40:54 (journal de la fonction rapprochement) a TOUT vu : plan « fusionner » × 2 (portée
//     vinted_nouvelle, groupe F1794494010078017 + les deux annonces). La BASE (rapprochement_v3_appliquer) a refusé :
//     « fusionner_article_modifie » × 2 — l'import n'est pas « intact » parce qu'il porte DEUX annonces (Leboncoin et
//     eBay, toutes deux posées par le moteur, rien de la personne). Elle a posé la question 892d1bf0 (« Est-ce le même
//     article ? »)… et laissé la fiche Vinted AU STOCK : publiable, « Pas encore » sur Leboncoin et eBay.
//   · 15:53 : « Publier en lot » (44 fiches du dressing vers Leboncoin) emporte la fiche Vinted. spend_coins_and_publish
//     ne regarde que les tâches de CETTE fiche (règle du 09/10, Louis) : le dépôt part (3307984312), Leboncoin le refuse
//     comme semblable, relevés de 21:16 et 23:39 → « failed ». Le même objet est deux fois au stock (risque de vente double).
// Ce verrou prouve :
//   A. le moteur décide juste (le plan réel, recalculé sur les empreintes du cas) ;
//   B. en base (Postgres jetable, corps de PROD à l'octet) — AVANT : rien n'est rattaché, la fiche Vinted reste au stock,
//      la publication sur Leboncoin passe (ROUGES) ; APRÈS la migration 20261113180000 : l'import rejoint la fiche Vinted
//      (toutes ses annonces sont dans le groupe fort, rien de la personne) ; un doute → la question ET la fiche du dressing
//      hors du stock (circuit des articles à vérifier) ; la publication est retenue tant que la question « Est-ce le même
//      article ? » (photo identique) est ouverte et que l'autre fiche est en ligne sur la plateforme visée — jamais pour
//      deux exemplaires (deux annonces d'une même plateforme, quantité > 1, « Non » déjà répondu), jamais sur un titre ni
//      un doute « ambigu_plusieurs » (Louis, 09/10) ; INVERSE : la prod à l'octet ;
//   C. l'app dit pourquoi et où répondre (jamais une question introuvable).
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const existe = (p) => fs.existsSync(join(ROOT, p));
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 600)}`}`); } };

const F = JSON.parse(lire('scripts/fixtures/meme-objet-bf85d176-1311.json'));
const B = await import(pathToFileURL(join(ROOT, 'scripts/essais/20261113180000_banc.mjs')).href);

console.log('A. LE MOTEUR (cas réel bf85d176, empreintes relues le 13/11)');
const { passe } = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/rapprochement/passe.js')).href);
const empreintes = new Map(F.empreintes.map((e) => [e.url, e]));
const plan = passe(F.donnees, empreintes, { mode: 'normal' }).decisions;
const fus = plan.filter((d) => d.type === 'fusionner');
ok(fus.length === 2 && fus.every((d) => String(d.garde) === B.X && String(d.absorbe) === B.Y && d.portee === 'vinted_nouvelle')
  && fus.map((d) => d.annonce).sort().join() === [B.A_EBAY, B.A_LBC].sort().join(),
  'le plan de la passe de 15:40 : « fusionner » × 2 (Leboncoin et eBay de 1790174130756 vers la fiche du dressing 1794494010078017)', plan);
ok(fus.every((d) => JSON.stringify(d.preuve?.groupe) === JSON.stringify(F.question.groupe)),
  'le groupe fort est celui que porte la question 892d1bf0 (F1794494010078017 + les deux annonces)', fus.map((d) => d.preuve?.groupe));
ok(plan.every((d) => d.type !== 'creer' && d.type !== 'a_verifier'), 'aucune création, aucun doute : le moteur ne voit QU\'UN objet');

const MIG_OK = existe(B.MIGRATION);
ok(existe(B.INVERSE), 'l\'inverse existe (les corps de prod à l\'octet)');
ok(MIG_OK, 'la migration 20261113180000 existe');

const { c, arreter } = await B.demarrer(57000 + Math.floor(Math.random() * 1500));
const remettre = async (extra = '') => { await c.query(B.DONNEES); if (extra) await c.query(extra); };
const garde = (r) => r?.meme_objet ?? null;

/** Le rattachement : le plan réel appliqué ; rend l'état. */
async function tourRattachement(extra = '') {
  await remettre(extra);
  const r = await B.appliquer(c, fus);
  return { r, e: await B.etat(c) };
}

async function tourComplet(prefixe, attendu) {
  // 1. le cas réel : l'import rejoint la fiche du dressing
  const t1 = await tourRattachement();
  const rattache = t1.e.fiches[B.Y].fusionne_dans === B.X && t1.e.annonces[B.A_LBC] === B.X && t1.e.annonces[B.A_EBAY] === B.X;
  ok(rattache === attendu, `${prefixe} : cas réel — l'import 1790174130756 (Leboncoin + eBay, posés par le moteur) rejoint la fiche du dressing`, { faits: t1.r?.faits, sautes: t1.r?.sautes, Y: t1.e.fiches[B.Y] });
  ok(!attendu || t1.e.questions.length === 0, `${prefixe} : rattaché → aucune question à poser`, t1.e.questions);
  // 2. un import TOUCHÉ par la personne (prix d'achat) : la question, et la fiche du dressing hors du stock
  const t2 = await tourRattachement(`UPDATE public.inventaire SET prix_achat = 4 WHERE id = ${B.Y};`);
  const q2 = t2.e.questions.find((q) => q.garde === B.X && q.absorbe === B.Y && q.statut === 'proposee');
  ok(!!q2 && !t2.e.fiches[B.Y].fusionne_dans, `${prefixe} : import touché (prix d'achat) → jamais fusionné, la question « Est-ce le même article ? » est posée`, t2.e);
  const horsStock = !!t2.e.fiches[B.X].a_verifier && t2.e.fiches[B.X].a_verifier.candidat == B.Y;
  ok(horsStock === attendu, `${prefixe} : … et la fiche du dressing sort du stock le temps de la réponse (à vérifier, candidat 1790174130756) — jamais un nouvel article silencieux`, t2.e.fiches[B.X]);
  ok(!t2.e.fiches[B.Y].a_verifier, `${prefixe} : la fiche de la personne ne sort JAMAIS du stock`, t2.e.fiches[B.Y]);
  // 3. la publication : la question ouverte, l'autre fiche en ligne sur Leboncoin et eBay
  await remettre(B.QUESTION_REELLE());
  const p1 = await B.publier(c, B.X, ['leboncoin']);
  const retenue = p1?.allowed === false && p1.reason === 'already_published' && !!garde(p1)?.leboncoin;
  ok(retenue === attendu, `${prefixe} : cas réel — la fiche du dressing vers Leboncoin, où 1790174130756 est en ligne (3272015849) : retenue avant tout débit`, p1);
  return { t1, t2, p1 };
}

try {
  console.log('\nB. EN BASE (Postgres jetable, corps de PROD chargés par l\'inverse)');
  const m0 = await B.md5s(c);
  ok(JSON.stringify(m0) === JSON.stringify(B.MD5_PROD), 'décor : les deux corps de prod à l\'octet (md5 du 13/11)', m0);

  console.log('B1. AVANT — la prod (le défaut reproduit, tel que le 12/11 à 15:40 et 15:53)');
  {
    const t1 = await tourRattachement();
    ok(!t1.e.fiches[B.Y].fusionne_dans && t1.e.questions.length === 1 && !t1.e.fiches[B.X].a_verifier,
      'AVANT : rien n\'est rattaché, la question est posée, la fiche du dressing reste AU STOCK (publiable)', { faits: t1.r?.faits, sautes: t1.r?.sautes, fiches: t1.e.fiches });
    ok(t1.r?.sautes?.fusionner_article_modifie === 2 && t1.r?.sautes?.fusionner_question_posee === 1,
      'AVANT : « fusionner_article_modifie » × 2, « fusionner_question_posee » × 1 — le journal du 12/11 15:40:54, à l\'identique', t1.r);
    await remettre(B.QUESTION_REELLE());
    const p0 = await B.publier(c, B.X, ['leboncoin']);
    ok(p0?.allowed === true, 'AVANT : la publication de la fiche du dressing sur Leboncoin passe (le lot de 15:53, dépôt 3307984312)', p0);
  }

  console.log(MIG_OK ? '\nB2. APRÈS LA MIGRATION' : '\nB2. SANS LA MIGRATION (la prod) — ROUGE attendu');
  if (MIG_OK) await c.query(B.lire(B.MIGRATION));
  await tourComplet('APRÈS', true);

  {
    console.log('\nB3. LES LIMITES (jamais un rattachement de trop, jamais deux exemplaires retenus)');
    // une annonce de l'import HORS du groupe fort : pas de fusion, la question, la fiche du dressing hors du stock
    {
      const autre = 'aaaaaaaa-0000-4000-8000-0000000000b1';
      const t = await tourRattachement(`INSERT INTO public.annonces_plateforme (id, user_id, platform, listing_id, inventaire_id, source_rapprochement) VALUES ('${autre}', '${B.U}', 'beebs', '999', ${B.Y}, 'automatique');`);
      ok(!t.e.fiches[B.Y].fusionne_dans && !!t.e.fiches[B.X].a_verifier, 'une annonce de l\'import hors du groupe fort (Beebs) → pas de fusion ; question + fiche du dressing à vérifier', t.e.fiches);
    }
    // une annonce rattachée PAR LA PERSONNE : sa décision ne se rejoue jamais automatiquement
    {
      const t = await tourRattachement(`INSERT INTO public.rapprochements (user_id, annonce_id, inventaire_id, decision, par, score) VALUES ('${B.U}', '${B.A_EBAY}', ${B.Y}, 'attache', 'utilisateur', 1);`);
      ok(!t.e.fiches[B.Y].fusionne_dans, 'une annonce de l\'import rattachée par la personne → jamais de fusion automatique', t.e.fiches[B.Y]);
    }
    // deux exemplaires (quantité 2) : jamais de fusion
    {
      const t = await tourRattachement(`UPDATE public.inventaire SET quantite = 2 WHERE id = ${B.Y};`);
      ok(!t.e.fiches[B.Y].fusionne_dans, 'import à 2 exemplaires → jamais de fusion', t.e.fiches[B.Y]);
    }
    // une SEULE annonce sur l'import : la règle d'avant (fusion), inchangée
    {
      const t = await tourRattachement(`DELETE FROM public.annonces_plateforme WHERE id = '${B.A_EBAY}'; DELETE FROM public.cross_post_jobs WHERE id = '${B.J_EBAY}';`);
      ok(t.e.fiches[B.Y].fusionne_dans === B.X, 'import à une seule annonce : fusion, comme avant', t.e.fiches[B.Y]);
    }
    // la fiche du dressing déjà touchée (un dépôt FillSell vers Leboncoin) : la question, mais elle reste au stock
    {
      const t = await tourRattachement(`UPDATE public.inventaire SET prix_achat = 4 WHERE id = ${B.Y};
        INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, status, action) VALUES ('${B.U}', ${B.X}, 'leboncoin', 'pending', 'publish');`);
      ok(!t.e.fiches[B.X].a_verifier && t.e.questions.some((q) => q.statut === 'proposee'), 'fiche du dressing avec un dépôt en cours : la question, la fiche reste visible (jamais un article en cours caché)', t.e);
    }
    // « fiche créée à la main face à une fiche Vinted » : le doute fait sortir la fiche du dressing NOUVELLE du stock
    {
      await remettre(`UPDATE public.inventaire SET origine = 'manuel' WHERE id = ${B.Y};`);
      const r = await B.appliquer(c, [{ type: 'fiche_a_verifier', garde: B.Y, absorbe: B.X, motif: 'photo_identique', preuves: { regle: 'rapprochement_v3' } }]);
      const e = await B.etat(c);
      ok(!!e.fiches[B.X].a_verifier && !e.fiches[B.Y].a_verifier && e.questions.length === 1,
        'fiche à la main face à une fiche du dressing NOUVELLE : la question, la fiche Vinted hors du stock (règle du 08/10, morte depuis que le dressing pose sa tâche Vinted)', { r, e: e.fiches });
    }

    console.log('\nB4. LA GARDE DE PUBLICATION');
    await remettre(B.QUESTION_REELLE());
    const pE = await B.publier(c, B.X, ['ebay']);
    ok(pE?.allowed === false && garde(pE)?.ebay?.fiche === B.Y && garde(pE)?.ebay?.question === B.Q_REELLE, 'vers eBay (407214160146 en ligne sur l\'autre fiche) : retenue, la question et l\'autre fiche nommées', pE);
    const pV = await B.publier(c, B.Y, ['vinted']);
    ok(pV?.allowed === false && !!garde(pV)?.vinted, 'l\'autre sens : 1790174130756 vers Vinted, où la fiche du dressing est en ligne : retenue', pV);
    const pB = await B.publier(c, B.X, ['beebs']);
    ok(pB?.allowed === true, 'vers Beebs (aucune des deux n\'y est) : publiée', pB);
    const pLB = await B.publier(c, B.X, ['leboncoin', 'beebs']);
    ok(pLB?.allowed === false && JSON.stringify(pLB.platforms) === '["leboncoin"]' && typeof pLB.message === 'string' && /Est-ce le même article/.test(pLB.message),
      'Leboncoin + Beebs : SEULE Leboncoin est refusée (l\'app republie les autres d\'un trait), le message nomme la question', pLB);
    const essai = async (nom, extra, attendu, fiche = B.X, pf = 'leboncoin') => {
      await remettre(extra);
      const r = await B.publier(c, fiche, [pf]);
      ok((r?.allowed === true) === attendu, nom, r);
    };
    await essai('« Non, deux exemplaires » déjà répondu (question refusée) : publiée', B.QUESTION_REELLE('refusee'), true);
    await essai('question « ambigu_plusieurs » (Louis, 09/10 : la ressemblance ne retient jamais) : publiée', B.QUESTION_REELLE('proposee', 'ambigu_plusieurs'), true);
    await essai('question « titre_sans_photo » (jamais sur un titre) : publiée', B.QUESTION_REELLE('proposee', 'titre_sans_photo'), true);
    await essai('aucune question (l\'annonce d\'une AUTRE fiche n\'est jamais un « déjà en ligne » à elle seule) : publiée', '', true);
    await essai('l\'autre fiche à 2 exemplaires : publiée', B.QUESTION_REELLE() + `UPDATE public.inventaire SET quantite = 2 WHERE id = ${B.Y};`, true);
    await essai('cette fiche à 2 exemplaires : publiée', B.QUESTION_REELLE() + `UPDATE public.inventaire SET quantite = 2 WHERE id = ${B.X};`, true);
    await essai('deux annonces d\'une même plateforme (les deux fiches sur eBay) = deux exemplaires : publiée sur Leboncoin', B.QUESTION_REELLE()
      + `INSERT INTO public.annonces_plateforme (user_id, platform, listing_id, inventaire_id, source_rapprochement) VALUES ('${B.U}', 'ebay', '407000000001', ${B.X}, 'job');`, true);
    await essai('l\'annonce Leboncoin de l\'autre fiche a disparu (et sa tâche est close) : publiée', B.QUESTION_REELLE()
      + `UPDATE public.annonces_plateforme SET disparu_le = now() WHERE id = '${B.A_LBC}'; UPDATE public.cross_post_jobs SET status = 'cancelled' WHERE id = '${B.J_LBC}';`, true);
    await essai('l\'autre fiche seulement EN FILE sur Leboncoin (dépôt pending) : retenue', B.QUESTION_REELLE()
      + `DELETE FROM public.annonces_plateforme WHERE id = '${B.A_LBC}'; UPDATE public.cross_post_jobs SET status = 'pending' WHERE id = '${B.J_LBC}';`, false);
    await essai('un autre compte ne voit jamais la question d\'un autre : rien de lu hors du compte', B.QUESTION_REELLE() + `UPDATE public.inventaire_doublons SET user_id = 'bf85d176-0000-4000-8000-0000000000ff';`, true);
    const n0 = (await c.query('SELECT count(*)::int n FROM public.cross_post_jobs')).rows[0].n;
    await remettre(B.QUESTION_REELLE());
    const n1 = (await c.query('SELECT count(*)::int n FROM public.cross_post_jobs')).rows[0].n;
    const pR = await B.publier(c, B.X, ['leboncoin']);
    const n2 = (await c.query('SELECT count(*)::int n FROM public.cross_post_jobs')).rows[0].n;
    ok(pR?.allowed === false && n1 === n2 && n0 >= 0, 'retenue = aucune tâche créée, rien de décompté', { n1, n2 });
    const droits = (await c.query(`SELECT p.proname, p.prosecdef s, array_to_string(p.proacl, ',') a FROM pg_proc p WHERE p.proname IN ('publication_meme_objet_en_ligne','publication_fiche_en_ligne','rapprochement_v3_import_rattachable','rapprochement_v3_vinted_nouvelle_intacte','rapprochement_v3_vinted_a_verifier') ORDER BY 1`)).rows;
    ok(droits.length === 5 && droits.every((d) => d.s === true && !/authenticated=X|anon=X|(^|,)=X/.test(d.a ?? '')), 'fonctions nouvelles : SECURITY DEFINER, fermées à anon, authenticated et PUBLIC', droits);
  }

  if (MIG_OK) {
    console.log('\nB5. INVERSE — la prod à l\'octet, puis la migration rejouée');
    await c.query(B.lire(B.INVERSE));
    const m1 = await B.md5s(c);
    ok(JSON.stringify(m1) === JSON.stringify(B.MD5_PROD), 'INVERSE : les deux corps de prod à l\'octet', m1);
    const resteFn = (await c.query(`SELECT count(*)::int n FROM pg_proc WHERE proname IN ('publication_meme_objet_en_ligne','publication_fiche_en_ligne','rapprochement_v3_import_rattachable','rapprochement_v3_vinted_nouvelle_intacte','rapprochement_v3_vinted_a_verifier')`)).rows[0].n;
    ok(resteFn === 0, 'INVERSE : les fonctions nouvelles retirées', resteFn);
    const tInv = await tourRattachement();
    ok(!tInv.e.fiches[B.Y].fusionne_dans, 'INVERSE : le comportement de prod revient (pas de fusion)', tInv.e.fiches[B.Y]);
    await c.query(B.lire(B.MIGRATION));
    const tRe = await tourRattachement();
    ok(tRe.e.fiches[B.Y].fusionne_dans === B.X, 'MIGRATION rejouée : idempotente, la règle revient', tRe.e.fiches[B.Y]);

    console.log('\nB6. LE RATTRAPAGE PRÉPARÉ (scripts/reparations/20261113_meme_objet_import_groupe*.sql) — à blanc, puis son inverse');
    {
      // l'état de prod d'aujourd'hui : la question 892d1bf0 ouverte, les deux fiches au stock
      await remettre(B.QUESTION_REELLE());
      await c.query(B.lire(B.RATTRAPAGE));
      const e1 = await B.etat(c);
      const trace = (await c.query(`SELECT count(*)::int n FROM public.rapprochements WHERE detail ->> 'rattrapage' = '20261113_meme_objet_import_groupe'`)).rows[0].n;
      const fus = (await c.query(`SELECT par FROM public.inventaire_fusions WHERE absorbe = ${B.Y} AND defait_le IS NULL`)).rows;
      ok(e1.fiches[B.Y].fusionne_dans === B.X && e1.annonces[B.A_LBC] === B.X && e1.annonces[B.A_EBAY] === B.X
        && e1.questions.find((q) => q.id === B.Q_REELLE)?.statut === 'fusionnee' && trace === 2 && fus.length === 1 && fus[0].par === 'auto:photo_rapprochement_v3 (photo_identique)',
        'bf85d176 : 1790174130756 rejoint 1794494010078017 (Leboncoin et eBay suivent), question 892d1bf0 « fusionnee », 2 traces, signée comme la règle', { e1, trace, fus });
      await c.query(B.lire(B.RATTRAPAGE_INVERSE));
      const e2 = await B.etat(c);
      const trace2 = (await c.query(`SELECT count(*)::int n FROM public.rapprochements WHERE detail ->> 'rattrapage' = '20261113_meme_objet_import_groupe'`)).rows[0].n;
      ok(!e2.fiches[B.Y].fusionne_dans && e2.annonces[B.A_LBC] === B.Y && e2.annonces[B.A_EBAY] === B.Y
        && e2.questions.find((q) => q.id === B.Q_REELLE)?.statut === 'proposee' && trace2 === 0,
        'INVERSE du rattrapage : la fusion défaite par le circuit, la question rendue « proposee », les traces retirées', { e2, trace2 });
      await c.query(B.SANS_SAUVEGARDES);
      // une question déjà répondue « Non », ou un import touché depuis : le rattrapage n'y touche pas
      await remettre(B.QUESTION_REELLE('refusee'));
      await c.query(B.lire(B.RATTRAPAGE));
      const e3 = await B.etat(c);
      await c.query(B.SANS_SAUVEGARDES);
      await remettre(B.QUESTION_REELLE() + `UPDATE public.inventaire SET prix_achat = 4 WHERE id = ${B.Y};`);
      await c.query(B.lire(B.RATTRAPAGE));
      const e4 = await B.etat(c);
      await c.query(B.SANS_SAUVEGARDES);
      ok(!e3.fiches[B.Y].fusionne_dans && !e4.fiches[B.Y].fusionne_dans, '« Non » déjà répondu, ou import touché (prix d\'achat) : rien n\'est réuni', { e3: e3.fiches[B.Y], e4: e4.fiches[B.Y] });
      // sans la migration : le rattrapage s'arrête, rien n'est fait
      await c.query(B.lire(B.INVERSE));
      await remettre(B.QUESTION_REELLE());
      let arret = null;
      try { await c.query(B.lire(B.RATTRAPAGE)); } catch (e) { arret = e.message; await c.query('ROLLBACK').catch(() => {}); }
      const e5 = await B.etat(c);
      ok(/la migration 20261113180000 d'abord/.test(arret ?? '') && !e5.fiches[B.Y].fusionne_dans, 'sans la migration : le rattrapage refuse, rien n\'est fait', arret);
      await c.query(B.lire(B.MIGRATION));
    }
    // la garde md5 : une définition qui n'est plus celle de prod → la migration refuse, rien n'est réécrit
    await c.query(B.lire(B.INVERSE));
    await c.query(`CREATE OR REPLACE FUNCTION public.spend_coins_and_publish(p_photo_option text, p_jobs jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$ SELECT '{}'::jsonb $f$`);
    let refus = null;
    try { await c.query(B.lire(B.MIGRATION)); } catch (e) { refus = e.message; await c.query('ROLLBACK').catch(() => {}); }
    ok(/a changé en prod depuis sa lecture du 13\/11/.test(refus ?? ''), 'garde : la migration refuse un corps qui n\'est pas celui relu en prod le 13/11', refus);
  }
} finally { await arreter(); }

console.log('\nD. LA MIGRATION N\'AJOUTE QUE SES BLOCS (chaque ligne de prod conservée, dans l\'ordre)');
if (MIG_OK) {
  const mig = lire(B.MIGRATION), inv = lire(B.INVERSE);
  // le corps tel que pg_get_functiondef le rend : de « CREATE OR REPLACE » à la dernière ligne « $function$ »
  const corps = (src, nom) => { const i = src.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`); const j = i < 0 ? -1 : src.indexOf('\n$function$\n', i); return i < 0 || j < 0 ? null : src.slice(i, j + 12); };
  const sansBlocs = (s) => s.replace(/^[ \t]*-- ⟦13\/11 N6a[\s\S]*?^[ \t]*-- 13\/11 N6a⟧\n/gm, '');
  for (const nom of ['rapprochement_v3_appliquer', 'spend_coins_and_publish']) {
    const m = corps(mig, nom), p = corps(inv, nom);
    const blocs = (m?.match(/-- ⟦13\/11 N6a/g) ?? []).length;
    ok(!!m && !!p && sansBlocs(m) === p && blocs >= 2, `${nom} : le corps de prod à l'octet une fois les ${blocs} blocs ⟦13/11 N6a⟧ retirés`, { blocs });
  }
}

console.log('\nC. L\'APP DIT POURQUOI, ET OÙ RÉPONDRE');
const EP = await import(pathToFileURL(join(ROOT, 'src/utils/etatsPublication.js')).href);
const memeObjet = { leboncoin: { question: B.Q_REELLE, fiche: B.Y, titre: 'Clavier Bluetooth Universel Nor-Tec - Neuf', platform: 'leboncoin', motif: 'photo_identique', a_verifier: false } };
const fr = EP.messageRefusPublication(['leboncoin'], { memeObjet });
const en = EP.messageRefusPublication(['leboncoin'], { memeObjet, lang: 'en' });
ok(/Clavier Bluetooth Universel Nor-Tec - Neuf/.test(fr) && /Est-ce le même article \?/.test(fr) && /Stock › Synchroniser/.test(fr) && /deux exemplaires/.test(fr) && !/déjà en ligne ou en file/.test(fr),
  'FR : l\'autre fiche nommée, la question et l\'endroit où elle est (les deux fiches au stock : la carte de Stock › Synchroniser), le geste « deux exemplaires »', fr);
ok(/Is it the same item\?/.test(en) && /Stock › Sync\)/.test(en) && /two copies/.test(en), 'EN : la même chose', en);
const frAV = EP.messageRefusPublication(['leboncoin'], { memeObjet: { leboncoin: { ...memeObjet.leboncoin, a_verifier: true } } });
ok(/À régler › Annonces à vérifier/.test(frAV), 'une des deux fiches « à vérifier » : la question est dans À régler › Annonces à vérifier', frAV);
// la phrase du serveur et celle de l'app disent la même chose (une app d'avant montre pubRes.message en filet générique)
if (MIG_OK) {
  const mig = lire(B.MIGRATION);
  ok(mig.includes("Réponds d''abord à « Est-ce le même article ? » (%s) : si c''est le même, rien n''est publié en double ; si ce sont deux exemplaires, publie ensuite celle-ci.")
    && fr.includes("Réponds d'abord à « Est-ce le même article ? » (Stock › Synchroniser) : si c'est le même, rien n'est publié en double ; si ce sont deux exemplaires, publie ensuite celle-ci."),
    'le message du serveur et celui de l\'app : la même phrase');
}
ok(EP.messageRefusPublication(['leboncoin'], {}) === 'Leboncoin : déjà en ligne ou en file. Ces plateformes sont laissées de côté ; les autres peuvent partir.', 'sans meme_objet : le texte d\'avant, mot pour mot');
const lps = lire('src/components/ListingPreviewScreen.jsx');
ok(/memeObjetServeur = \{ \.\.\.memeObjetServeur, \.\.\.pubRes\.meme_objet \}/.test(lps) && (lps.match(/memeObjet: memeObjetServeur/g) ?? []).length === 2,
  'le stepper (et le lot) gardent meme_objet du serveur et le passent aux deux messages (refus, écran de suivi)');
const stock = lire('src/tabs/StockTab.jsx');
ok(/pubRes\.meme_objet && typeof pubRes\.meme_objet === 'object'/.test(stock), 'la relance d\'une copie depuis le Stock dit la même chose');

console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ''}`);
process.exit(ko ? 1 : 0);
