// selftest:badge-vendu-avant-suivi-republication — (09/11, point 2 de Nico — Jess, jessica.alhiane)
// LE BADGE « ARTICLE VENDU » D'AVANT LE SUIVI N'ARRÊTE PLUS LA REPUBLICATION ; UNE VENTE LUE PENDANT LE SUIVI DEVIENT
// UNE VENTE DÉTECTÉE.
//
//   npm run selftest:badge-vendu-avant-suivi-republication
//
// Cas : Leboncoin 3178619102 (« Câble USB-C … (Unité ou Lot) ») et 3234168813 (« Boîte en métal vintage »), importées
// le 07/11 19:47, vendues les 20/07 et 17/07 (ventes anciennes 491407, 491408). 12 republications annulées « ton
// annonce Leboncoin est vendue » : l'extension relit la page avant le retrait (republish_etat_reel « sold ») et
// pas-de-rouge (A4) close. Le serveur (règle du 08/11 puis du 09/11) dit pourtant : badge d'avant le suivi = jamais une
// vente, la republication part.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
let echecs = 0, total = 0;
const ok = (c, l, d = '') => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}${!c && d ? `\n    ${d}` : ''}`); };

const B = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/badge-vendu-avant-suivi.js')).href);
const P = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/pas-de-rouge.js')).href);

console.log('1. Les tâches à juger (get-pending-jobs)');
const job = (x = {}) => ({ id: 'j1', platform: 'leboncoin', action: 'republish', platform_listing_id: '3178619102', platform_fields: {}, ...x });
ok(B.tachesBadgeAJuger([job()]).length === 1, 'republication Leboncoin, rien retiré (étape absente = a_capturer), numéro connu → jugée');
ok(B.tachesBadgeAJuger([job({ platform_fields: { republish_step: 'captured' } })]).length === 0
  && B.tachesBadgeAJuger([job({ platform_fields: { republish_step: 'deleted' } })]).length === 0, 'déjà capturée ou retirée → non jugée (la marque déjà écrite voyage avec la tâche)');
ok(B.tachesBadgeAJuger([job({ platform: 'vinted' }), job({ action: 'publish' }), job({ action: 'delete' }), job({ platform_listing_id: '' }), job({ platform_listing_id: 'abc' })]).length === 0,
  'Vinted, publication, retrait, sans numéro → jamais jugés');
ok(B.tachesBadgeAJuger(Array.from({ length: 30 }, (_, i) => job({ id: `j${i}` }))).length === B.BADGE_MAX_PAR_PASSAGE && B.BADGE_MAX_PAR_PASSAGE === 10, 'bornée : 10 par passage');

console.log('\n2. La règle (miroir de la CTE avant_suivi de republication_annonce_partie, migration 20261109010000)');
ok(B.badgeAvantSuivi({ venduAvantSuivi: true, enLigne: true, importee: false, deposeeParFillSell: true }) === true, 'vendue avant le suivi + relevée en ligne → badge d\'avant le suivi');
ok(B.badgeAvantSuivi({ venduAvantSuivi: true, enLigne: false, importee: true, deposeeParFillSell: false }) === true, 'vendue avant le suivi + née hors FillSell (import, aucun dépôt FillSell) → oui');
ok(B.badgeAvantSuivi({ venduAvantSuivi: true, enLigne: false, importee: true, deposeeParFillSell: true }) === false, 'disparue et déposée par FillSell → non');
ok(B.badgeAvantSuivi({ venduAvantSuivi: false, enLigne: true, importee: true, deposeeParFillSell: false }) === false, 'vente lue PENDANT le suivi → jamais (la vente reste une vente)');
ok(B.badgeAvantSuivi({ venduAvantSuivi: null, enLigne: true, importee: true, deposeeParFillSell: false }) === false, 'lecture ratée → non (la règle d\'avant)');
const MIG = lire('supabase/migrations/20261109010000_vendu_avant_suivi_jamais_une_vente.sql');
ok(/SELECT p_platform = 'leboncoin' AND public\.leboncoin_vendu_avant_suivi\(p_user, lid\.id\)/.test(MIG)
  && /a\.statut_plateforme = 'en_ligne' AND a\.disparu_le IS NULL\)/.test(MIG)
  && /x\.platform_fields ->> 'source' = 'releve'\s*OR x\.platform_fields #>> '\{rattachement,import\}' = 'true'/.test(MIG)
  && /AND COALESCE\(x\.platform_fields ->> 'source', ''\) <> 'releve'\s*AND COALESCE\(x\.platform_fields #>> '\{rattachement,import\}', ''\) <> 'true'/.test(MIG),
  'même définition que la base : en ligne non disparue OU (import ET aucun dépôt publish/republish hors relevé)');
// Le cas réel de Jess (lignes lues en prod le 09/11).
const faits = B.faitsDuNumero('3178619102',
  [{ listing_id: '3178619102', statut_plateforme: 'en_ligne', disparu_le: null }],
  [{ platform_listing_id: '3178619102', action: 'publish', platform_fields: { source: 'releve' } },
   { platform_listing_id: '3178619102', action: 'republish', platform_fields: { source: 'releve' } }]);
ok(faits.enLigne && faits.importee && !faits.deposeeParFillSell && B.badgeAvantSuivi({ venduAvantSuivi: true, ...faits }), 'Jess, 3178619102 : importée, en ligne → badge d\'avant le suivi');
const fDepot = B.faitsDuNumero('3300000000', [], [{ platform_listing_id: '3300000000', action: 'publish', platform_fields: {} }]);
ok(!fDepot.importee && fDepot.deposeeParFillSell && !fDepot.enLigne, 'dépôt de FillSell, jamais relevé → déposée par FillSell');
ok(B.faitsDuNumero('1', [{ listing_id: '1', statut_plateforme: 'en_ligne', disparu_le: '2026-11-01' }], []).enLigne === false, 'disparue → pas « en ligne »');

console.log('\n3. La marque sur la tâche servie');
const m = B.marquerTache(job({ platform_fields: { republish_step: 'a_capturer', x: 1 } }), true, '2026-11-09T08:00:00Z');
ok(m.platform_fields.badge_vendu_avant_suivi?.listing === '3178619102' && m.platform_fields.x === 1 && m.platform_fields.republish_step === 'a_capturer', 'marquée : le numéro et l\'heure, le reste intact');
ok(!('badge_vendu_avant_suivi' in B.marquerTache(m, false).platform_fields), 'ne tient plus → la marque d\'un passage précédent est retirée');
ok(B.marqueBadgeAvantSuivi(m.platform_fields, '3178619102') && !B.marqueBadgeAvantSuivi(m.platform_fields, '3234168813') && !B.marqueBadgeAvantSuivi({}, '3178619102'),
  'la marque ne vaut que pour SON numéro');

console.log('\n4. pas-de-rouge (A4) : badge d\'avant le suivi ≠ « vendue »');
const classer = (platform, pf) => P.classerEchec({ platform, action: 'republish', brut: "Republication impossible : cette annonce n'est plus en ligne sur Leboncoin", reecrit: '', essais: 1, pf, reprises: 0, build: '' });
const avant = classer('leboncoin', { republish_etat_reel: { state: 'sold' }, badge_vendu_avant_suivi: { listing: '3178619102' } });
ok(avant.motif === 'badge_vendu_avant_suivi' && avant.statut === 'cancelled' && !/est vendue/.test(avant.message) && /d'avant ton arrivée sur FillSell/.test(avant.message) && /Rien n'a été retiré/.test(avant.message),
  `ancienne extension arrêtée sur le badge : « ${avant.message.slice(0, 70)}… » (jamais « vendue »)`);
const pendant = classer('leboncoin', { republish_etat_reel: { state: 'sold' } });
ok(pendant.motif === 'annonce_vendue' && pendant.statut === 'cancelled' && /Republication annulée : ton annonce Leboncoin est vendue/.test(pendant.message), 'sans marque (vente pendant le suivi) : « annonce_vendue », message d\'avant');
const vinted = classer('vinted', { republish_etat_reel: { state: 'sold' }, badge_vendu_avant_suivi: { listing: '1' } });
ok(vinted.motif === 'annonce_vendue', 'la marque ne joue que sur Leboncoin');

console.log('\n5. Vente lue pendant le suivi → signal de la veille sur l\'annonce publiée');
const s = B.signalVenteLueALaRepublication({ a: 1 }, '2026-11-09T08:00:00Z');
ok(s.sale_signal === 'sold' && s.unavailable_since === '2026-11-09T08:00:00Z' && s.a === 1 && /republication/.test(s.sale_signal_par.par), 'sale_signal « sold » + unavailable_since, comme la veille ; le reste intact');
ok(B.signalVenteLueALaRepublication({ sale_signal: 'sold' }) === null, 'déjà signalée → rien');
ok(B.signalVenteLueALaRepublication({ unavailable_since: '2026-11-01T00:00:00Z' }).unavailable_since === '2026-11-01T00:00:00Z', 'une date d\'absence déjà posée est gardée');
const UJS = lire('supabase/functions/update-job-status/index.ts');
const bloc = UJS.slice(UJS.indexOf('if (sortie.motif === "annonce_vendue") {'), UJS.indexOf('/* le signal est un renfort'));
ok(bloc.length > 100 && /\.eq\("status", "published"\)\.neq\("id", jobId\)\.limit\(3\)/.test(bloc)
  && /\.eq\("id", p\.id\)\.eq\("status", "published"\)\.is\("platform_fields->>sale_signal", null\)/.test(bloc)
  && /\.in\("action", \["publish", "republish"\]\)/.test(bloc) && /\.eq\("platform_listing_id", numeroV\)/.test(bloc),
  'update-job-status : seulement sur « annonce_vendue », l\'annonce publiée du MÊME numéro, compare-and-set (publiée, sans signal)');
ok(/select\("platform, action, title, description, platform_fields"\)\.eq\("id", jobId\)\.maybeSingle\(\);/.test(UJS)
  && /\.select\("platform_listing_id"\)\.eq\("id", jobId\)\.eq\("user_id", user\.id\)\.maybeSingle\(\)/.test(bloc),
  'la lecture du classement reste celle d\'avant ; le numéro n\'est lu que sur « annonce_vendue » (du compte)');

console.log('\n6. get-pending-jobs : la marque voyage avec la tâche servie, rien écrit');
const GPJ = lire('supabase/functions/get-pending-jobs/index.ts');
const g = GPJ.slice(GPJ.indexOf('LE BADGE « ARTICLE VENDU » D\'AVANT LE SUIVI VOYAGE AVEC LA TÂCHE SERVIE'), GPJ.indexOf('out = out.map((j) => jobSansInvisibles(j) as typeof j);'));
ok(g.length > 200 && /if \(!includeProcessing && !includeNeedsUser\) \{/.test(g) && /tachesBadgeAJuger\(out\)/.test(g)
  && /adminBd\.rpc\("leboncoin_vendu_avant_suivi", \{ p_user: user\.id, p_listing: n \}\)/.test(g)
  && /venduAvantSuivi: eVas \? null : vas === true/.test(g) && !/\.(update|insert|upsert|delete)\(/.test(g),
  'file d\'exécution seulement ; la règle de la base (RPC) ; lecture ratée → sans marque ; aucune écriture');
ok(GPJ.indexOf('const servis = out.slice(0, 100);') < GPJ.indexOf('LE BADGE « ARTICLE VENDU » D\'AVANT LE SUIVI VOYAGE')
  && GPJ.indexOf('LE BADGE « ARTICLE VENDU » D\'AVANT LE SUIVI VOYAGE') < GPJ.indexOf('out = out.map((j) => jobSansInvisibles(j) as typeof j);'),
  'posée après la réservation (seules les tâches réservées partent), avant le nettoyage des invisibles et la limite des photos (dernières réécritures)');

console.log('\n7. L\'extension (0.6.184)');
const BG = lire('chrome-extension/background.js');
const corps = (nom) => { const i = BG.indexOf(`function ${nom}(`); const j = BG.indexOf('\n}\n', i); return i >= 0 && j > i ? BG.slice(i, j + 2) : ''; };
// eslint-disable-next-line no-new-func
const ext = new Function(`${corps('badgeAvantSuiviDuJob')}\n${corps('etatProuveAbsence')}\nreturn { badgeAvantSuiviDuJob, etatProuveAbsence };`)();
const pfM = { badge_vendu_avant_suivi: { listing: '3178619102' } };
ok([[pfM, '3178619102'], [pfM, '3234168813'], [{}, '3178619102'], [null, ''], [{ badge_vendu_avant_suivi: { listing: ' 3178619102 ' } }, '3178619102']]
  .every(([pf, n]) => ext.badgeAvantSuiviDuJob(pf, n) === B.marqueBadgeAvantSuivi(pf, n)), 'recopie fidèle de marqueBadgeAvantSuivi');
const jl = { platform: 'leboncoin', platform_listing_id: '3178619102', platform_fields: pfM };
ok(ext.etatProuveAbsence(jl, 'sold') === false && ext.etatProuveAbsence(jl, 'unavailable') === true && ext.etatProuveAbsence(jl, 'active') === false,
  'badge d\'avant le suivi : « sold » ne prouve JAMAIS un retrait ; une page morte, si');
ok(ext.etatProuveAbsence({ ...jl, platform_fields: {} }, 'sold') === true && ext.etatProuveAbsence({ platform: 'vinted', platform_fields: pfM, platform_listing_id: '3178619102' }, 'sold') === true,
  'sans marque, ou hors Leboncoin : comme avant (« sold » = absente)');
const etape0 = BG.slice(BG.indexOf('async function processRepublishJobPlateforme('), BG.indexOf('// ── Étape 1 : RETRAIT', BG.indexOf('async function processRepublishJobPlateforme(')));
ok(/const badgeAvantSuivi = job\.platform === "leboncoin" && etatLu === "sold" && badgeAvantSuiviDuJob\(pf, job\.platform_listing_id\);\s*const state = badgeAvantSuivi \? "active" : etatLu;/.test(etape0)
  && /state: String\(etatLu\)/.test(etape0) && /badge_avant_suivi: true/.test(etape0), 'relecture avant retrait : badge marqué → en ligne (l\'état lu reste écrit tel quel, avec la marque)');
const etape1 = BG.slice(BG.indexOf('// ── Étape 1 : RETRAIT', BG.indexOf('async function processRepublishJobPlateforme(')), BG.indexOf('if (step === "deleted")', BG.indexOf('async function processRepublishJobPlateforme(')));
ok((etape1.match(/etatProuveAbsence\(job, state, /g) ?? []).length === 2 && !/\(state === "unavailable" \|\| state === "sold"\) && job\.platform !== "beebs"/.test(etape1),
  'étape du retrait : les deux replis (canal coupé, retrait non abouti) passent par etatProuveAbsence');
// (09/11 soir, 0.6.185) Durable comme les autres selftests de version : 0.6.184 OU PLUS, et son entrée datée reste dans
// l'historique de FILLSELL_BUILD (la plus récente passe devant elle).
ok((() => { const v = (lire('chrome-extension/manifest.json').match(/"version": "(\d+)\.(\d+)\.(\d+)"/) || []).slice(1).map(Number); return v[0] === 0 && v[1] === 6 && v[2] >= 184; })()
  && /const FILLSELL_BUILD =\n[\s\S]*?\n {2}"2026-11-09-matin \(0\.6\.184 :/.test(BG), 'manifest 0.6.184 ou plus, FILLSELL_BUILD daté (entrée 0.6.184 gardée)');

console.log(`\n${echecs ? '✗' : '✓'} selftest:badge-vendu-avant-suivi-republication — ${total - echecs}/${total}`);
process.exit(echecs ? 1 : 0);
