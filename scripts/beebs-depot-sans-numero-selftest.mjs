// ═══════════════════════════════════════════════════════════════════════════
// UN DÉPÔT BEEBS SANS NUMÉRO NE RESTE JAMAIS « EN LIGNE » À VIE (05/11, point 6 a, règle de Nico)
// `node scripts/beebs-depot-sans-numero-selftest.mjs`  (_shared/beebs-depot-sans-numero.js + câblage handler-watch)
// ═══════════════════════════════════════════════════════════════════════════
// Constat du 05/11 : 108 dépôts Beebs « published » sans numéro ni lien (43 chez XEWER de63ca45), jamais vus en ligne,
// qu'aucun juge ne tranchait. Le juge : celui des retraits sans numéro (jugerRetraitIntrouvable), appliqué au dépôt —
// plus de 7 jours, deux derniers relevés complets commencés après ces 7 jours, aucune annonce qui puisse être lui ; et,
// le doute ne concluant rien, aucune candidate (beebs-lien), aucune annonce vivante de la même fiche, aucune annonce
// non reliée par son numéro au même titre ET au même prix. Effet : « failed », message vrai, publication rendue.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const imp = (f) => import(pathToFileURL(join(RACINE, f)).href);
const M = await imp('supabase/functions/_shared/beebs-depot-sans-numero.js');
const RI = await imp('supabase/functions/_shared/retrait-introuvable.js');
const { titreNorm } = await imp('src/utils/rapprochementJumeau.js');
let ko = 0, n = 0;
const ok = (c, quoi, detail = '') => { n++; if (c) console.log(`  ✓ ${quoi}`); else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${detail}` : ''}`); } };

const J = 86_400_000;
const W = M.BEEBS_ATTENTE_MAX_MS / J; // la fenêtre du juge, en jours (14 depuis le 05/11 soir)
const T0 = Date.parse('2026-10-20T08:00:00Z'); // le dépôt
const MAINTENANT = T0 + (W + 1) * J;
const iso = (t) => new Date(t).toISOString();
const releve = (t, { tot = 30, vus = tot, statut = 'done', page = tot, uid = null } = {}) => ({ status: statut, started_at: iso(t), finished_at: iso(t + 120_000),
  items_vus: vus, total_entries: tot, vinted_user_id: uid,
  erreur: `[défilement] page : ${page} annonce(s) affichée(s) (1 défilement(s), la page n'en affichait pas plus) | index public Beebs : ${tot} annonce(s) en ligne, ${tot} lue(s) au total` });
const DEUX = [releve(T0 + (W + 0.5) * J), releve(T0 + (W + 0.9) * J)];
const depot = (extra = {}) => ({ id: '11111111-aaaa-4bbb-8ccc-000000000001', user_id: 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e', platform: 'beebs', action: 'publish', status: 'published',
  title: 'Jeu PS4 Hitman', price: '12', inventaire_id: 1001, platform_listing_id: null, listing_url: null, vu_en_ligne_le: null,
  created_at: iso(T0 - 60_000), published_at: iso(T0), error: null, platform_fields: { lien_en_attente: { depuis: iso(T0) } }, ...extra });
// Le compte : des annonces en ligne, toutes reliées par leur NUMÉRO à d'autres dépôts et d'autres fiches.
const ligne = (num, extra = {}) => ({ listing_id: String(num), url: `https://www.beebs.app/fr/p/${num}`, titre: `Article ${num}`, prix: 9,
  job_id: `job-${num}`, inventaire_id: 2000 + (num % 1000), source_rapprochement: 'job', vu_le: iso(T0 + (W + 0.9) * J + 60_000),
  disparu_le: null, retiree_le: null, statut_plateforme: 'en_ligne', created_at: iso(T0 - 20 * J), ...extra });
const COMPTE = Array.from({ length: 30 }, (_, k) => ligne(34100000 + k));
const juger = (job, ctx = {}) => M.jugerDepotBeebsSansNumero(job, { releves: DEUX, annonces: COMPTE, maintenant: MAINTENANT, ...ctx });

console.log('1. Les cas de la règle');
const v8 = juger(depot());
ok(v8?.verdict === 'jamais_en_ligne' && v8.releves.length === 2, 'fenêtre + 1 jour, 2 relevés complets après la fenêtre, tout est relié ailleurs → jugé « jamais en ligne »', JSON.stringify(v8));
ok(v8.releves[0].started_at < v8.releves[1].started_at && v8.depot_le === iso(T0), 'les deux relevés datés (plus ancien d’abord), la date du dépôt');
const v6 = M.jugerDepotBeebsSansNumero(depot(), { releves: DEUX, annonces: COMPTE, maintenant: T0 + (W - 1) * J });
ok(v6?.verdict === 'attente' && v6.motif === 'moderation_beebs', 'fenêtre − 1 jour → attendre (Beebs peut garder une annonce invisible ~9,4 jours)', JSON.stringify(v6));
const v1 = juger(depot(), { releves: [releve(T0 + (W + 0.9) * J)] });
ok(v1?.verdict === 'attente' && v1.motif === 'releves_insuffisants', '1 seul relevé complet → attendre', JSON.stringify(v1));
const vMod = juger(depot(), { releves: [releve(T0 + 2 * J), releve(T0 + 3 * J)] });
ok(vMod?.verdict === 'attente' && vMod.motif === 'releves_insuffisants', 'deux relevés complets faits PENDANT la modération → ils ne prouvent rien, attendre', JSON.stringify(vMod));
const vRate = juger(depot(), { releves: [...DEUX, { status: 'failed', started_at: iso(T0 + (W + 0.95) * J), items_vus: 3, total_entries: 30, erreur: '[incomplet]' }] });
ok(vRate?.verdict === 'attente' && vRate.motif === 'releves_insuffisants', 'le dernier relevé a raté : les deux derniers ne sont plus complets → attendre');
const vIncomplet = juger(depot(), { releves: [releve(T0 + (W + 0.5) * J), releve(T0 + (W + 0.9) * J, { vus: 12 })] });
ok(vIncomplet?.verdict === 'attente', 'un relevé 12/30 n’est pas complet → attendre');
// Libre, mais NUMÉROTÉE AVANT le dépôt (34099990 < 34100029, vue 20 jours avant) : jugerRetraitIntrouvable l'exclut — le titre et le prix font douter.
const libreMeme = ligne(34099990, { titre: 'jeu ps4 HITMAN !', prix: '12.00', job_id: null, inventaire_id: null, source_rapprochement: null, created_at: iso(T0 - 30 * J) });
const vTP = juger(depot(), { annonces: [...COMPTE, libreMeme] });
ok(vTP?.verdict === 'attente' && vTP.motif === 'meme_titre_meme_prix' && vTP.annonces[0] === '34099990',
  'annonce libre au même titre normalisé et au même prix (même numérotée avant le dépôt) → attendre, doute = rien', JSON.stringify(vTP));
const vPrixAutre = juger(depot(), { annonces: [...COMPTE, { ...libreMeme, prix: 15 }] });
ok(vPrixAutre?.verdict === 'jamais_en_ligne', 'même titre, autre prix, numérotée avant le dépôt → ne retient rien', JSON.stringify(vPrixAutre));
const libreVueAvant = ligne(34200500, { job_id: null, inventaire_id: null, source_rapprochement: null, created_at: iso(T0 - 30 * J) });
ok(juger(depot(), { annonces: [...COMPTE, libreVueAvant] })?.motif === 'annonce_non_reliee', 'une libre vue avant le dépôt mais de numéro plus grand que tout ce qui l’entourait → non exclue par le numéro : attendre (règle du juge des retraits)');
const avecNumero = depot({ platform_listing_id: '34229929' });
ok(juger(avecNumero) === null, 'avec numéro → jamais ce juge');
ok(juger(depot({ listing_url: 'https://www.beebs.app/fr/p/34229929' })) === null, 'avec lien → jamais ce juge');
ok(juger(depot({ platform: 'leboncoin' })) === null && juger(depot({ status: 'failed' })) === null && juger(depot({ action: 'delete' })) === null,
  'autre plateforme, autre statut, retrait → jamais ce juge');
ok(juger(depot({ vu_en_ligne_le: iso(T0 + J) })) === null, 'vu en ligne un jour par la veille → jamais ce juge');

console.log('\n2. Le doute attend');
const libreApres = ligne(34300001, { job_id: null, inventaire_id: null, source_rapprochement: null, created_at: iso(T0 + 3 * J) });
const vLibre = juger(depot(), { annonces: [...COMPTE, libreApres] });
ok(vLibre?.verdict === 'attente' && ['annonce_non_reliee', 'annonce_candidate'].includes(vLibre.motif), 'une annonce reliée à rien, apparue après le dépôt → attendre (jugerRetraitIntrouvable : non reliée)', JSON.stringify(vLibre));
const aLui = ligne(34300002, { job_id: depot().id, inventaire_id: 1001 });
const vLui = juger(depot(), { annonces: [...COMPTE, aLui] });
ok(vLui?.verdict === 'attente' && vLui.motif === 'en_ligne_par_releve', 'une annonce reliée à CE dépôt par le relevé → il est en ligne, beebs-lien posera son lien', JSON.stringify(vLui));
const memeFiche = ligne(34300003, { job_id: 'job-import', inventaire_id: 1001, source_rapprochement: 'automatique', created_at: iso(T0 + 40 * 60_000) });
const vFiche = juger(depot(), { annonces: [...COMPTE, memeFiche] });
ok(vFiche?.verdict === 'attente' && vFiche.motif === 'article_en_ligne_sur_beebs' && vFiche.annonces[0] === '34300003',
  'louis-seller (26/10) : une annonce de la MÊME fiche apparue 40 min après, rattachée par le moteur → attendre (le dépôt est peut-être elle)', JSON.stringify(vFiche));
const memeFicheParNumero = ligne(34300004, { job_id: 'job-republication', inventaire_id: 1001, source_rapprochement: 'job' });
ok(juger(depot(), { annonces: [...COMPTE, memeFicheParNumero] })?.motif === 'article_en_ligne_sur_beebs', 'même fiche, en ligne sous une republication à numéro → attendre aussi (rien n’est dit à faux)');
const memeFicheVieille = ligne(34000004, { job_id: 'job-ancien', inventaire_id: 1001, vu_le: iso(T0 - 2 * J) });
ok(juger(depot(), { annonces: [...COMPTE, memeFicheVieille] })?.verdict === 'jamais_en_ligne', 'une ligne de la même fiche que les deux relevés n’ont PAS vue (dernière vue avant) ne retient rien');
const moteurAutreFiche = ligne(34300005, { titre: 'Jeu PS4 Hitman', prix: 12, job_id: 'job-x', inventaire_id: 4242, source_rapprochement: 'automatique' });
ok(juger(depot(), { annonces: [...COMPTE, moteurAutreFiche] })?.motif === 'meme_titre_meme_prix', 'même titre et même prix, rattachée par le MOTEUR à une autre fiche → attendre');
const numeroAutreFiche = ligne(34300006, { titre: 'Jeu PS4 Hitman', prix: 12, job_id: 'job-y', inventaire_id: 4243, source_rapprochement: 'job' });
ok(juger(depot(), { annonces: [...COMPTE, numeroAutreFiche] })?.verdict === 'jamais_en_ligne', 'même titre et même prix, mais reliée par son NUMÉRO à un autre dépôt (deux exemplaires) → ne retient rien');
// 7373c96c (05/11) : 285 annonces en ligne le 30/10, puis deux relevés « index public Beebs : 0 », « disparues 0 ».
const effondre = Array.from({ length: 40 }, (_, k) => ligne(34050000 + k, { vu_le: iso(T0 + (W - 1) * J) }));
const vEff = juger(depot(), { annonces: [...effondre, ligne(34100001)] });
ok(vEff?.verdict === 'attente' && vEff.motif === 'releves_partiels' && vEff.non_revues === 40, 'relevés qui n’ont pas revu le compte (40 lignes vivantes non revues, 1 revue) → aucune absence ne se conclut', JSON.stringify(vEff));
const quelques = Array.from({ length: 5 }, (_, k) => ligne(34050000 + k, { vu_le: iso(T0 + (W - 1) * J) }));
ok(juger(depot(), { annonces: [...COMPTE, ...quelques] })?.verdict === 'jamais_en_ligne', '5 lignes vivantes non revues sur 35 (l’ordinaire : XEWER 6/34) → ne retient rien');
ok(juger(depot(), { retraitActif: true })?.motif === 'retrait_en_cours', 'un retrait Beebs du dépôt en file → son juge (get-pending-jobs) tranche, ici on attend');
const vComptes = juger(depot(), { releves: [releve(T0 + (W + 0.5) * J, { uid: 'A' }), releve(T0 + (W + 0.9) * J, { uid: 'B' })] });
ok(vComptes?.verdict === 'attente' && vComptes.motif === 'deux_comptes_beebs', 'deux relevés de deux comptes Beebs différents → attendre');
const rep = depot({ action: 'republish', platform_fields: { old_platform_listing_id: '34100003', old_listing_url: 'https://www.beebs.app/fr/p/34100003', deleted_at: iso(T0) } });
const ancienneVue = juger(rep, { annonces: COMPTE.map((a) => (a.listing_id === '34100003' ? { ...a, job_id: 'job-source', inventaire_id: 9999 } : a)) });
ok(ancienneVue?.motif === 'ancienne_annonce_en_ligne', 'republication dont l’ancienne annonce est encore vue en vente → attendre', JSON.stringify(ancienneVue));
const repJugee = juger(rep, { annonces: COMPTE.filter((a) => a.listing_id !== '34100003') });
ok(repJugee?.verdict === 'jamais_en_ligne', 'republication, ancienne annonce absente des relevés → jugée');

console.log('\n3. Le même juge que les retraits sans numéro');
const seul = RI.jugerRetraitIntrouvable({ action: 'delete', platform: 'beebs', created_at: iso(T0 + W * J), platform_listing_id: null, listing_url: null },
  { releves: DEUX, annonces: COMPTE, depotId: depot().id, depotLe: iso(T0), maintenant: MAINTENANT });
ok(seul?.verdict === 'deja_retire' && JSON.stringify(seul.releves) === JSON.stringify(v8.releves_fr), 'jugerRetraitIntrouvable, appelé tel quel, rend le même verdict et les mêmes relevés');
ok(M.BEEBS_ATTENTE_MAX_MS === 14 * 24 * 60 * 60 * 1000, 'la fenêtre : 14 jours (deux fois la modération Beebs ; 7b9d8a71 invisible ~9,4 jours)');
ok(/const ATTENTE_MAX_MS = 7 \* 24 \* 60 \* 60 \* 1000;/.test(lire('supabase/functions/get-pending-jobs/index.ts')), 'la même que ATTENTE_MAX_MS de get-pending-jobs');
const src = lire('supabase/functions/_shared/beebs-depot-sans-numero.js');
ok(/from "\.\/retrait-introuvable\.js"/.test(src) && /jugerRetraitIntrouvable\(/.test(src) && /candidatesDuDepot\(job, lignes/.test(src),
  'un seul juge : jugerRetraitIntrouvable et candidatesDuDepot (beebs-lien) réutilisés, rien de recopié');
for (const t of ['Jeu PS4 « Hitman » — édition Œuvre', 'Pull Zara 8 ans  bleu/gris', 'Écharpe à pois – 100% laine']) ok(M.titreNormBeebs(t) === titreNorm(t), `titre normalisé comme public.titre_norm : « ${t} »`);

console.log('\n4. L’effet : le patch et le message');
const p = M.patchDepotBeebsJamaisEnLigne(depot({ platform_fields: { lien_en_attente: { x: 1 }, pas_encore_visible: { depuis: 'x' }, sale_signal: 'unavailable' } }), v8, { maintenant: MAINTENANT });
ok(p.status === 'failed', 'statut « failed »');
ok(p.error.startsWith(M.MESSAGE_JAMAIS_EN_LIGNE_SANS_NUMERO) && M.MESSAGE_JAMAIS_EN_LIGNE_SANS_NUMERO === "Beebs n'a jamais mis cette annonce en ligne : FillSell ne la compte plus comme en ligne. Rien n'a été retiré.",
  'le message de Nico, en tête');
ok(/relevées en entier le \d\d\/\d\d à \d\dh\d\d puis le \d\d\/\d\d à \d\dh\d\d/.test(p.error) && !/limites/.test(p.error), 'les deux relevés datés (heure de Paris) ; « limites » seulement une fois la publication rendue', p.error);
ok(!/\b\d+ (jours?|heures?|min)\b/.test(p.error), 'aucune durée dans le message (règle du 16/10)');
ok(!/stock/.test(p.error), 'jamais « ton article reste dans ton stock » : la fiche peut être vendue ou supprimée (05/11 : 1 vendue, 3 supprimées)');
const jel = p.platform_fields.jamais_en_ligne;
ok(jel?.at === iso(MAINTENANT) && jel.releves.length === 2 && jel.pose_par === 'handler-watch (dépôt Beebs sans numéro)', 'marque jamais_en_ligne { at, releves, pose_par }', JSON.stringify(jel));
ok(p.platform_fields.listing_url_abandon?.motif === 'deux_releves_complets', 'listing_url_abandon : la trace du même verdict dans get-pending-jobs (l’app : « Voir mes annonces Beebs », pas de relance-doublon)');
ok(!('pas_encore_visible' in p.platform_fields) && !('sale_signal' in p.platform_fields) && p.platform_fields.lien_en_attente?.x === 1, 'marqueurs d’attente retirés, le reste gardé');
const pr = M.patchApresRemboursement(depot(), p, { rembourse: 1, purchased: 0, included: 1 });
ok(/Cette publication ne compte pas dans tes limites\.$/.test(pr.error) && pr.platform_fields.jamais_en_ligne.refund.rembourse === 1, 'publication rendue → dit, et le résultat noté');
const prSans = M.patchApresRemboursement(depot(), p, { rembourse: 0, raison: 'sans_reservation' });
ok(prSans.error === p.error && prSans.platform_fields.listing_url_abandon.refund.raison === 'sans_reservation', 'rien à rendre → rien de promis');
ok(M.patchApresRemboursement(depot(), p, null) === null, 'pas d’appel (republication) → aucune écriture de plus');
const pRep = M.patchDepotBeebsJamaisEnLigne(rep, repJugee, { maintenant: MAINTENANT });
ok(/L'ancienne annonce, elle, avait été retirée par cette republication/.test(pRep.error), 'republication : l’ancienne annonce retirée est dite');

console.log('\n5. Le câblage (handler-watch)');
const hw = lire('supabase/functions/handler-watch/index.ts');
ok(/\r?\nconst JUGER_BEEBS_SANS_NUMERO = true;\r?\n/.test(hw), 'interrupteur JUGER_BEEBS_SANS_NUMERO = true (ALLUMÉ le 05/11 au soir, feu vert explicite de Nico)');
ok(/\nconst JUGER_ANNONCES_PUBLIEES_DISPARUES = false;\n/.test(hw), 'la règle « annonce publiée disparue » reste coupée');
ok(hw.includes('if (JUGER_BEEBS_SANS_NUMERO && new Date().getUTCMinutes() >= 42 && new Date().getUTCMinutes() < 45) {'), 'une fois par heure, minutes 42 à 44');
const autresMinutes = [...hw.matchAll(/getUTCMinutes\(\) (>=|<) (\d+)/g)].map((m) => Number(m[2]));
ok(!hw.match(/getUTCMinutes\(\) >= 4[0-4]\b/g)?.some((s) => !s.includes('42')) && autresMinutes.filter((x) => x === 42).length === 1, 'minute 42 libre : aucun autre bloc ne la prend');
ok(/% 15 >= 9 && new Date\(\)\.getUTCMinutes\(\) % 15 < 12\)/.test(hw) && !/% 15 >= 12/.test(hw), 'les blocs au quart d’heure s’arrêtent à 11 : 42-44 (12-14 du quart) est libre');
const fn = hw.slice(hw.indexOf('async function jugerBeebsDepotsSansNumero('));
ok(fn.length > 100 && /BEEBS_SANS_NUMERO_PAGE = 200/.test(hw) && /\.range\(res\.page \* BEEBS_SANS_NUMERO_PAGE/.test(fn), 'lots bornés : 200 dépôts au plus par passage, page tournante');
ok(/BEEBS_SANS_NUMERO_FERMETURES_MAX = 50/.test(hw) && /res\.fermees >= BEEBS_SANS_NUMERO_FERMETURES_MAX/.test(fn), '50 fermetures au plus par passage');
ok(/\.update\(patch\)\s*\n?\s*\.eq\("id", j\.id\)\.eq\("status", "published"\)\.is\("listing_url", null\)\.is\("platform_listing_id", null\)\.is\("vu_en_ligne_le", null\)/.test(fn),
  'compare-and-set sur « published » sans lien ni numéro');
ok(/rpc\("refund_publish_unconfirmed", \{ p_job: j\.id \}\)/.test(fn) && /j\.action === "publish"/.test(fn), 'publication rendue par le chemin existant (refund_publish_unconfirmed), après la fermeture seulement');
ok(!/fetch\(|beebs\.app|vinted_sync_runs"\)\.insert|\.insert\(/.test(fn), 'aucune visite de plateforme, aucun relevé demandé, aucune insertion');
const ecritures = [...fn.matchAll(/\.update\(/g)].length;
ok(ecritures === 2 && /if \(v\.verdict === "attente"\) \{[^}]*continue; \}/.test(fn), 'seules les fermetures écrivent (2 updates : la fermeture, le remboursement noté) ; l’attente n’écrit rien');
ok(/lirePagesDisparues\(\(\) => supabase\.from\("annonces_plateforme"\)/.test(fn) && /annonces\.length >= 20000/.test(fn), 'annonces lues par pages ; une lecture coupée au plafond ne juge rien');
ok(/\.in\("user_id", lot\)/.test(fn) && /parLots\(users, 50\)/.test(fn), 'lectures groupées par lots de 50 comptes');
ok(/from "\.\.\/_shared\/beebs-depot-sans-numero\.js"/.test(hw), 'handler-watch importe le module');

console.log(`\n${ko ? `✗ ${ko} cas en échec sur ${n}` : `✓ ${n} cas, tous verts`}`);
process.exit(ko ? 1 : 0);
