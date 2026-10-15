// selftest:signal-vente-jamais-en-boucle — une carte « Vendue » n'est jamais une
// boucle (15/10, P1-0 de la reprise ; Louis « 12 adaptateurs Vert », Kit bûche,
// Swatch de Tech-t ; migration 20261015000000).
//
//   npm run selftest:signal-vente-jamais-en-boucle            contrôles du dépôt
//   npm run selftest:signal-vente-jamais-en-boucle -- --prod  + l'état de la base
//        (fonctions, déclencheur, droits, passage du cron, cartes encore bloquées)
//
// Contrôles hors ligne :
//   1. un « vendu » que la synchro EN COURS voit en ligne est refusé à l'écriture
//      (numéro de l'annonce, jamais le titre), tracé, sans jamais bloquer l'écriture ;
//   2. le refus « toujours en ligne » lève le faux signal (tracé) et rend un code ;
//   3. la plateforme prouve la vente d'une fiche déjà vendue par UNE vente saisie :
//      même cession, aucune seconde vente, aucun mail (vente déclarée), un reçu ;
//   4. les deux sorties de la carte (signal_vente_trancher) : seules ouvertes à
//      l'app, sous auth.uid(), jamais un appui qui efface une preuve « sold » ;
//   5. la réconciliation est bornée (lot, budget, ordre tournant), isolée dans le
//      passage des ventes prouvées, et n'arme aucun retrait ni n'envoie de mail ;
//   6. l'inverse rend les définitions d'avant et retire le neuf.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const MIG = lire('supabase/migrations/20261015000000_signal_vente_jamais_en_boucle.sql');
const INV = lire('supabase/rollbacks/20261015000000_signal_vente_jamais_en_boucle_INVERSE.sql');

let echecs = 0, total = 0;
const ok = (c, l) => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}`); };
const fonction = (txt, nom) => {
  const i = txt.search(new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${nom}\\(`));
  if (i < 0) return '';
  const j = txt.indexOf('$function$', txt.indexOf('$function$', i) + 10);
  return j < 0 ? '' : txt.slice(i, j + 10);
};

// 1. Le déclencheur
const trig = fonction(MIG, 'cross_post_jobs_signal_vente_vu_en_ligne');
ok(/BEFORE UPDATE OF platform_fields ON public\.cross_post_jobs[\s\S]*WHEN \(NEW\.platform = 'vinted' AND \(NEW\.platform_fields ->> 'sale_signal'\) = 'sold'\)/.test(MIG),
  '1a. déclencheur sur la seule écriture d\'un « sold » Vinted');
ok(/s\.vinted_item_id = v_lid/.test(trig) && !/title|titre/i.test(trig.replace(/--[^\n]*/g, '')),
  '1b. l\'annonce est reconnue par son numéro, jamais par un titre');
ok(/r\.status = 'running'/.test(trig) && /r\.started_at <= v_snap\.captured_at/.test(trig),
  '1c. seul le relevé de la synchro EN COURS démentit (un vrai « sold » d\'une synchro suivante passe)');
ok(/'signal_refuse_annonce_en_ligne'/.test(trig), '1d. le refus est tracé sur le job');
ok(/EXCEPTION WHEN OTHERS THEN[\s\S]*écriture d''origine conservée/.test(trig), '1e. une erreur du contrôle ne bloque jamais l\'écriture');
ok(/OLD\.platform_fields ->> 'sale_signal', ''\) = 'sold' THEN RETURN NEW/.test(trig), '1f. un signal déjà posé n\'est pas rejugé à chaque écriture');

// 2. Le refus lève le faux signal
const eva = fonction(MIG, 'enregistrer_vente_atomique');
ok(/PERFORM public\.signal_vente_lever\(j\.id, 'signal_dementi_a_la_confirmation'/.test(eva)
  && /'code','annonce_en_ligne','signal_leve',true/.test(eva), '2a. « toujours en ligne » : signal levé, code annonce_en_ligne');
ok(/'code','vente_deja_liee'/.test(eva) && /'code','deja_vendue'/.test(eva), '2b. les refus portent un code lisible par l\'app');

// 3. Même cession
const meme = fonction(MIG, 'vente_saisie_meme_cession');
ok(/v_n <> 1 THEN RETURN NULL/.test(meme) && /v\.commande_ref IS NULL/.test(meme)
  && /v\.plateforme_code IS NULL OR v\.plateforme_code IN \('ailleurs', j\.platform\)/.test(meme),
  '3a. une seule vente saisie, sans commande, sur cette plateforme ou « ailleurs »');
ok(/ventes_operations o WHERE o\.user_id = j\.user_id AND o\.cle = v_cle\) THEN RETURN NULL/.test(meme), '3b. une annonce déjà reçue n\'est jamais reclassée');
const clore = fonction(MIG, 'signal_vente_clore_meme_cession');
ok(/set_config\('fillsell\.vente_declaree', '1', true\)/.test(clore) && /'emailSent', false/.test(clore)
  && !/INSERT INTO public\.ventes \(/.test(clore), '3c. aucune ligne de vente, aucun mail (note « declaree »)');
ok(/ON CONFLICT \(user_id, cle\) DO NOTHING/.test(clore), '3d. un reçu rend tout rejeu identique');
ok(/IF p_job IS NOT NULL AND coalesce\(v_proof,false\) AND \(i\.statut='vendu'/.test(eva),
  '3e. la même cession ne se conclut que sur PREUVE de la plateforme (jamais un simple signal)');
ok(/v_restant:=CASE WHEN v_sans_stock THEN 0/.test(eva), '3f. fiche vendue sans vente : la vente s\'enregistre sans recompter le stock');

// 4. Les sorties de la carte
const tr = fonction(MIG, 'signal_vente_trancher');
ok(/auth\.uid\(\) IS NULL THEN RAISE EXCEPTION/.test(tr) && /user_id = auth\.uid\(\) FOR UPDATE/.test(tr), '4a. sous le compte de la personne seulement');
ok(/'vendue_selon_plateforme'/.test(tr), '4b. « Ce n\'est pas vendu » refusé quand le relevé dit « sold »');
ok(/'signal_conteste'/.test(tr) && /last_checked_at = NULL/.test(tr), '4c. sinon : relecture au prochain passage, contestation tracée');
ok(/GRANT EXECUTE ON FUNCTION public\.signal_vente_trancher\(uuid, text\) TO authenticated/.test(MIG)
  && /REVOKE ALL ON FUNCTION public\.signaux_vente_reconcilier\(integer\) FROM PUBLIC, anon, authenticated/.test(MIG)
  && /REVOKE ALL ON FUNCTION public\.signal_vente_lever\(uuid, text, jsonb\) FROM PUBLIC, anon, authenticated/.test(MIG),
  '4d. seules les sorties de la carte sont ouvertes à l\'app');

// 5. Réconciliation bornée
const reco = fonction(MIG, 'signaux_vente_reconcilier');
ok(/least\(coalesce\(p_max, 40\), 200\)/.test(reco) && /interval '1500 milliseconds'/.test(reco), '5a. lot et budget bornés');
ok(/hashtextextended\(j\.id::text, floor\(extract\(epoch FROM now\(\)\) \/ 120\)::bigint\)/.test(reco), '5b. ordre tournant : aucune carte affamée');
ok(!/armer_retrait|INSERT INTO public\.cross_post_jobs|envoyer/.test(reco), '5c. aucun retrait armé, aucun envoi');
const tick = fonction(MIG, 'ventes_prouvees_tick');
ok(/BEGIN\n    v_reco := public\.signaux_vente_reconcilier\(40\);\n  EXCEPTION WHEN OTHERS THEN/.test(tick), '5d. isolée dans le passage des ventes prouvées');

// 6. Inverse
ok(/DROP TRIGGER IF EXISTS cross_post_jobs_signal_vente_vu_en_ligne/.test(INV)
  && /DROP FUNCTION IF EXISTS public\.signal_vente_trancher\(uuid, text\)/.test(INV)
  && !/signal_vente_lever\(j\.id/.test(fonction(INV, 'enregistrer_vente_atomique'))
  && !/signaux_vente_reconcilier\(40\)/.test(fonction(INV, 'ventes_prouvees_tick')),
  '6. l\'inverse rend les définitions d\'avant et retire le neuf');

// 7. L'app : les deux sorties de la carte et le stepper qui ne ment plus
{
  const APP = lire('src/App.jsx');
  const QPL = lire('src/components/QuestionsPlusEnLigne.jsx');
  ok(/supabase\.rpc\('signal_vente_trancher',\{p_job:job\.id,p_reponse:reponse\}\)/.test(APP)
    && /onPasVendue=\{\(job\)=>trancherSignalVente\(job,'pas_vendue'\)\}/.test(APP)
    && /onDejaEnregistree=\{\(job\)=>trancherSignalVente\(job,'meme_vente'\)\}/.test(APP), '7a. App : « Ce n\'est pas vendu » / « Déjà enregistrée » passent par la base');
  ok(/vendu && onPasVendue && \(/.test(QPL) && /vendu && onDejaEnregistree && art\?\.statut === 'vendu' && \(/.test(QPL),
    '7b. carte : « Ce n\'est pas vendu » sous un « vendu » ; « Déjà enregistrée » seulement si l\'article est déjà vendu');
  ok(/pf\.sale_signal==='sold'&&pf\.signal_conteste\?\.le\s*&&Date\.now\(\)-Date\.parse\(pf\.signal_conteste\.le\)<24\*3600_000\)return null;/.test(APP),
    '7c. une carte contestée se tait 24 h (relue entre-temps)');
}
{
  // Le stepper (Rangement gris de Louis, jobs réels du 14/10) : « déjà en ligne » faux.
  const { plateformesEnDoute, phraseDouteEnLigne } = await import(new URL('../src/utils/publicationState.js', import.meta.url).href);
  const pf = (o) => ({ ...o });
  const jobs = [
    { id: '07bc4850', platform: 'vinted', status: 'published', action: 'publish', published_at: '2026-10-06T15:14:00Z', created_at: '2026-10-06T15:10:00Z',
      platform_fields: pf({ sale_signal: 'unavailable', unavailable_since: '2026-10-07T07:16:51.813Z', reporte_n: '1' }) },
    { id: 'c5a19bcb', platform: 'vinted', status: 'sold', action: 'publish', published_at: '2026-10-04T20:11:00Z', created_at: '2026-10-04T20:00:00Z', platform_fields: pf({ sale_signal: 'sold' }) },
    { id: '092597a3', platform: 'beebs', status: 'published', action: 'republish', published_at: '2026-10-12T08:36:04Z', created_at: '2026-10-12T08:30:00Z', platform_fields: {} },
    { id: 'c8b3855b', platform: 'leboncoin', status: 'published', action: 'publish', published_at: '2026-09-29T17:47:05Z', created_at: '2026-09-29T17:40:00Z', platform_fields: {} },
  ];
  const d = plateformesEnDoute(jobs);
  ok(Object.keys(d).join(',') === 'vinted' && d.vinted.job.id === '07bc4850' && d.vinted.vendue === false,
    '7d. Rangement gris : Vinted « en doute » (07bc4850), Beebs et Leboncoin restent « en ligne »');
  ok(phraseDouteEnLigne(d.vinted, 'fr') === 'Plus vue en ligne depuis le 07/10 : vendue ou retirée ? Ta réponse libère la case',
    '7e. la phrase dit depuis quand (heure de Paris) et le geste, jamais « déjà en ligne »');
  const avecRepublication = [...jobs, { id: 'r', platform: 'vinted', status: 'pending', action: 'republish', created_at: '2026-10-15T08:00:00Z', platform_fields: { republish_step: 'a_capturer' } }];
  ok(!plateformesEnDoute(avecRepublication).vinted, '7f. jamais « en doute » pendant une republication en vol');
  const uneEnLigne = [...jobs, { id: 'n', platform: 'vinted', status: 'published', action: 'publish', published_at: '2026-10-14T08:00:00Z', created_at: '2026-10-14T08:00:00Z', platform_fields: {} }];
  ok(!plateformesEnDoute(uneEnLigne).vinted, '7g. une autre annonce de la plateforme vue en ligne : « déjà en ligne » reste vrai');
  const LPS = lire('src/components/ListingPreviewScreen.jsx');
  const OUP = lire('src/publication/EcranOuPublier.jsx');
  const CONF = lire('src/publication/EcranConfirmer.jsx');
  const ST = lire('src/tabs/StockTab.jsx');
  const APP = lire('src/App.jsx');
  ok(/m\[p\] = fetchedDoute\[p\]\s*\? phraseDouteEnLigne\(fetchedDoute\[p\], lang\)/.test(LPS)
    && /douteEnLigne=\{fetchedDoute\}/.test(LPS) && /douteEnLigne: fetchedDoute, onRepondreDisparue,/.test(LPS),
    '7h. stepper : la phrase et le geste dans les deux variantes');
  ok(/m\.onRepondreDisparue\(m\.douteEnLigne\[p\]\.job\)/.test(OUP) && /m\.onRepondreDisparue\(m\.douteEnLigne\[p\]\.job\)/.test(CONF),
    '7i. nouveau stepper : « Répondre » sur « Où publier » et « Confirmer »');
  ok(/onRepondreDisparue=\{plusEnLigne\?\.ouvrirQuestion\?/.test(ST) && /ouvrirQuestion:\(id\)=>setQuestionForcee\(id\)/.test(APP)
    && /if\(!forcee&&\(estAVerifier\(job\)\|\|estReporte\(job\)\)\)return null;/.test(APP),
    '7j. « Répondre » ouvre la question de CETTE annonce, même reportée');
}

// 8. L'extension (0.6.111) : la cause à la racine — la vente d'une ANCIENNE annonce
//    n'est plus collée au job vivant d'une autre annonce de la même fiche.
{
  const bg = lire('chrome-extension/background.js');
  const i = bg.indexOf('const jobParIdVinted = new Map();');
  const j = bg.indexOf('if (!job) continue;', i);
  ok(i > 0 && j > i, '8a. le choix du job par la synchro du dressing est trouvé');
  const bloc = bg.slice(i, j)
    .replace('for (const a of soldFrais) {', 'const choix = []; for (const a of soldFrais) {')
    + 'choix.push([a.vinted_item_id, job ? job.id : null]); } return choix;';
  // eslint-disable-next-line no-new-func
  const choisir = new Function('jobsVifs', 'soldFrais', 'parVintedId', 'parJob', 'extractListingId', bloc);
  const extractListingId = (u) => (String(u ?? '').match(/\/items\/(\d+)/)?.[1] ?? null);
  // Louis, 14/10 : fiche 1789898202878 (stock 9 996) ; job vivant d7b3b535 = annonce
  // 10289157745 EN LIGNE ; l'ancienne annonce 10269317193 de la même fiche est vendue.
  const jobsVifs = [{ id: 'd7b3b535', inventaire_id: 1789898202878, platform_listing_id: '10289157745', listing_url: 'https://www.vinted.fr/items/10289157745' }];
  const soldFrais = [{ vinted_item_id: '10269317193' }];
  const parVintedId = new Map([['10269317193', { id: 1789898202878, statut: 'stock' }]]);
  const r = choisir(jobsVifs, soldFrais, parVintedId, new Map(), extractListingId);
  ok(r.length === 1 && r[0][1] === null, '8b. Louis : la vente de 10269317193 ne touche PLUS le job de 10289157745 (en ligne)', JSON.stringify(r));
  const sansNumero = [{ id: 'vieux', inventaire_id: 1789898202878, platform_listing_id: null, listing_url: null }];
  const r2 = choisir(sansNumero, soldFrais, parVintedId, new Map(), extractListingId);
  ok(r2[0][1] === 'vieux', '8c. un job SANS numéro d\'annonce garde le repli par fiche (comportement d\'avant)');
  const r3 = choisir(jobsVifs, [{ vinted_item_id: '10289157745' }], parVintedId, new Map(), extractListingId);
  ok(r3[0][1] === 'd7b3b535', '8d. la vente de SA propre annonce atteint toujours son job (par numéro)');
}

if (process.argv.includes('--prod')) {
  const sql = `select jsonb_build_object(
    'trig', (select count(*) from pg_trigger where tgname='cross_post_jobs_signal_vente_vu_en_ligne' and not tgisinternal),
    'tick', position('signaux_vente_reconcilier' in pg_get_functiondef('public.ventes_prouvees_tick(integer,integer)'::regprocedure)) > 0,
    'eva', (select position('signal_dementi_a_la_confirmation' in pg_get_functiondef(p.oid)) > 0 from pg_proc p
             where p.proname='enregistrer_vente_atomique' and p.pronamespace='public'::regnamespace limit 1),
    'auth', has_function_privilege('authenticated','public.signal_vente_trancher(uuid,text)','execute'),
    'ferme', not has_function_privilege('authenticated','public.signaux_vente_reconcilier(integer)','execute')
             and not has_function_privilege('anon','public.signal_vente_trancher(uuid,text)','execute'),
    'erreur_reco', (select count(*) from ventes_prouvees_passages p, jsonb_array_elements(coalesce(p.detail,'[]')) e
                     where p.debut > now() - interval '1 day' and e ? 'reconciliation' and e->'reconciliation' ? 'erreur')
  ) as etat`;
  const dossier = mkdtempSync(path.join(os.tmpdir(), 'signal-vente-'));
  const fichier = path.join(dossier, 'etat.sql');
  writeFileSync(fichier, sql, 'utf8');
  const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', `"${fichier}"`, '--output', 'json'],
    { cwd: RACINE, encoding: 'utf8', shell: true, maxBuffer: 16 * 1024 * 1024 });
  rmSync(dossier, { recursive: true, force: true });
  const s = r.stdout || '';
  let etat = null;
  try { etat = JSON.parse(s.slice(s.indexOf('{'))).rows[0].etat; } catch { /* lu plus bas */ }
  ok(!!etat, 'P0. base lue');
  if (etat) {
    ok(etat.trig === 1, 'P1. déclencheur en place');
    ok(etat.tick === true && etat.eva === true, 'P2. passage des ventes prouvées et vente atomique à jour');
    ok(etat.auth === true && etat.ferme === true, 'P3. droits : trancher ouvert à l\'app seul');
    ok(Number(etat.erreur_reco) === 0, 'P4. aucune réconciliation en erreur sur 24 h');
  }
}

console.log(`\n${total - echecs}/${total} contrôles verts`);
process.exit(echecs ? 1 : 0);
