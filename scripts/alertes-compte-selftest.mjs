// selftest:alertes-compte — session perdue ou compte restreint : l'utilisateur
// est prévenu tout seul, discrètement (18/10, lot 4.2, Nico).
//   1. la règle (utils/alertesCompte.js) : 'ko' seulement (jamais null), masque par
//      plateforme, masque qui tombe au retour, restriction Vinted jusqu'à sa date,
//      réglage global ;
//   2. la ligne : titre et détail regroupés ;
//   3. le câblage : StockTab (lecture bornée, UNE ligne dans « À régler », l'écran),
//      EcranARegler (icône, phrase), Réglages › Préférences (interrupteur, fusionner).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
let echecs = 0, total = 0;
const ok = (c, l) => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}`); };
const A = await import(pathToFileURL(path.join(RACINE, 'src/utils/alertesCompte.js')).href);

const jobRestreint = (jusquau = '25/10/2026', status = 'pending') => ({ platform: 'vinted', status, platform_fields: { last_diagnostic: { titre: `Compte restreint jusqu'au ${jusquau}`, corps: '' } } });
const t0 = Date.parse('2026-10-18T10:00:00+02:00');

// 1
ok(A.alertesCompte({ etats: { vinted: 'ko', leboncoin: 'ok', beebs: null, ebay: 'ko' }, jobs: [], reglage: null, maintenant: t0 }).map((a) => a.platform + ':' + a.kind).join(',') === 'vinted:connexion,ebay:connexion',
  '1. une session perdue = \'ko\' seulement ; null (jamais vérifié) ne déclenche rien');
ok(A.alertesCompte({ etats: { vinted: 'ko', ebay: 'ko' }, jobs: [], reglage: { masquees: { vinted: true } }, maintenant: t0 }).map((a) => a.platform).join(',') === 'ebay',
  '1b. masque par plateforme');
ok(A.alertesCompte({ etats: { vinted: 'ko' }, jobs: [], reglage: { desactivees: true }, maintenant: t0 }).length === 0, '1c. réglage global : plus aucune alerte');
ok(A.masquesARetirer({ masquees: { vinted: true, ebay: true } }, { vinted: 'ok', ebay: 'ko' }).join(',') === 'vinted' && A.masquesARetirer(null, { vinted: 'ok' }).length === 0,
  '1d. le masque tombe quand la session revient (\'ok\'), pas avant');
const r = A.alertesCompte({ etats: {}, jobs: [jobRestreint()], reglage: null, maintenant: t0 });
ok(r.length === 1 && r[0].kind === 'restriction' && r[0].platform === 'vinted' && r[0].jusquau === '25/10' && r[0].fin > t0, '1e. compte Vinted restreint (date à venir) : une alerte');
ok(A.alertesCompte({ etats: {}, jobs: [jobRestreint('01/10/2026')], reglage: null, maintenant: t0 }).length === 0, '1f. une restriction passée ne dit rien');
ok(A.alertesCompte({ etats: {}, jobs: [jobRestreint('25/10/2026', 'published')], reglage: null, maintenant: t0 }).length === 0, '1g. seuls les jobs vivants portent la restriction');
ok(A.alertesCompte({ etats: {}, jobs: [jobRestreint()], reglage: { masquees: { vinted_restriction: '2026-10-25T23:59:59+02:00' } }, maintenant: t0 }).length === 0
  && A.alertesCompte({ etats: {}, jobs: [jobRestreint()], reglage: { masquees: { vinted_restriction: '2026-10-20T00:00:00+02:00' } }, maintenant: t0 }).length === 1,
  '1h. une restriction masquée jusqu\'à sa date de fin ; un masque plus court ne vaut pas');

// 2
const l1 = A.ligneAlertes([{ platform: 'vinted', kind: 'connexion' }, { platform: 'leboncoin', kind: 'connexion' }], 'fr');
ok(l1.titre === 'Connecte-toi à Vinted et Leboncoin' && /Vinted et Leboncoin : connecte-toi sur ton ordinateur/.test(l1.detail), '2. une ligne regroupée pour plusieurs plateformes');
const l2 = A.ligneAlertes([{ platform: 'vinted', kind: 'restriction', jusquau: '25/10' }], 'fr');
ok(l2.titre === 'Vinted a restreint ton compte' && /jusqu'au 25\/10/.test(l2.detail), '2b. la restriction dit sa date');
const l3 = A.ligneAlertes([{ platform: 'ebay', kind: 'connexion' }, { platform: 'vinted', kind: 'restriction', jusquau: null }], 'en');
ok(l3.titre === 'Sign-in and restricted account' && /eBay: sign in on your computer/.test(l3.detail) && /Vinted restricted your account:/.test(l3.detail), '2c. les deux ensemble, en anglais aussi');
const TEXTES = [l1.titre, l1.detail, l2.detail, l3.detail];
ok(TEXTES.every((x) => !/\b\d+ ?(min|h|s)\b|dans \d+/i.test(x) && !/extension_sessions|platform_settings|needs_user/.test(x) && !/\p{Extended_Pictographic}/u.test(x)), '2d. ni durée, ni mot technique, ni émoji');

// 3
const ST = lire('src/tabs/StockTab.jsx');
ok(/import EcranAlertesCompte from '\.\.\/stock\/EcranAlertesCompte';/.test(ST) && /import \{ etatSession, PLATEFORMES_SESSION \} from '\.\.\/utils\/sessionsPlateformes';/.test(ST)
  && /import \{ alertesCompte as alertesDeCompte, masquesARetirer, ligneAlertes, CLE_REGLAGE_ALERTES \} from '\.\.\/utils\/alertesCompte';/.test(ST), '3. StockTab : une seule règle (modules partagés)');
// (18/10 20:18, écran blanc ced6cfd) StockTab possède DÉJÀ une constante locale
// `alertesCompte` (cartes d'extension) : l'import garde un autre nom, et le
// useMemo appelle bien l'import — jamais la constante locale (lue avant son
// initialisation : ReferenceError dans tout le parc).
ok(/^\s+const alertesCompte = \(\(\) => \{/m.test(ST) && /useMemo\(\n\s+\(\) => alertesDeCompte\(\{ etats: etatsCompte,/.test(ST) && !/\(\) => alertesCompte\(\{ etats:/.test(ST),
  '3a. l\'import ne porte pas le nom de la constante locale du composant (ombre = TDZ = écran blanc)');
ok(/const relecture = demarrerRelecture\(lire, \{ intervalleMs: 10 \* 60_000 \}\);/.test(ST) && /select\('extension_sessions, platform_settings'\)/.test(ST) && !/setInterval\(lire/.test(ST.slice(ST.indexOf('ALERTES DE COMPTE : SESSION PERDUE'), ST.indexOf('const attenteBoutique = useMemo'))),
  '3b. lecture BORNÉE (10 min, onglet visible), jamais un setInterval');
ok(/for \(const pf of PLATEFORMES_SESSION\) out\[pf\] = etatSession\(sessionsCompte, pf, publicationsOk\[pf\] \?\? null\);/.test(ST), '3c. le verdict de session est celui de utils/sessionsPlateformes, publications lues en mémoire');
ok(/const nbAlertesCompte = alertesDuCompte\.length \? 1 : 0;/.test(ST) && /\+ nbPlusEnLigne \+ nbAlertesCompte;/.test(ST) && /\{ cle: 'compte_plateforme', n: nbAlertesCompte,/.test(ST)
  && /\.\.\.\(alertesDuCompte\.length \? ligneAlertes\(alertesDuCompte, lang\) : \{ titre: '', detail: '' \}\),/.test(ST), '3d. UNE ligne dans « À régler », comptée une fois');
ok(/fusionnerReglages\(\[CLE_REGLAGE_ALERTES, 'masquees'\], null, revenues\)/.test(ST) && /\{gesteOuvert==='compte_plateforme'&&\(/.test(ST) && /<EcranAlertesCompte lang=\{lang\} alertes=\{alertesDuCompte\}/.test(ST),
  '3e. le masque tombe au retour de la session (fusionner, suppression seule) ; l\'écran est monté');
const EA = lire('src/stock/EcranARegler.jsx');
ok(/compte_plateforme: LogIn/.test(EA) && /present\('compte_plateforme'\) && \(fr \? 'une connexion ou un compte à regarder'/.test(EA), '3f. EcranARegler : icône et phrase');
const EC = lire('src/stock/EcranAlertesCompte.jsx');
ok(/fusionnerReglages\(\[CLE_REGLAGE_ALERTES, 'masquees'\], \{ \[cle\]: valeur \}\)/.test(EC) && /Réglages › Préférences › Alertes de compte/.test(EC) && !/supabase\.from\('cross_post_jobs'\)|\.update\(/.test(EC),
  '3g. l\'écran masque par la seule voie permise, n\'écrit ni job ni annonce');
const SP = lire('src/reglages/SousPagePreferences.jsx');
ok(/import \{ SegmentedPills, Toggle \} from '\.\.\/components\/ui';/.test(SP) && /fusionnerReglages\(\[CLE_REGLAGE_ALERTES\], \{ desactivees: !on \}\)/.test(SP) && /<Toggle checked=\{alertesActives\} onChange=\{basculerAlertes\} \/>/.test(SP)
  && /platform_settings\?\.\[CLE_REGLAGE_ALERTES\]\?\.desactivees !== true/.test(SP), '3h. Réglages › Préférences : interrupteur, actif par défaut, écrit par fusionner');
const TX = lire('src/reglages/textes.js');
ok((TX.match(/sAlertesCompte:/g) ?? []).length === 2 && (TX.match(/alertesCompteNote:/g) ?? []).length === 2, '3i. textes FR et EN');

// 4 (23/10, point 2 — Sébastien) « Connecte-toi à X » seulement si FillSell ne peut VRAIMENT plus y travailler
{
  const etats = { vinted: 'ok', ebay: 'ko' };
  const jobsEbay = [{ platform: 'ebay', status: 'published' }];
  const a1 = A.alertesCompte({ etats, jobs: jobsEbay, reglage: null, maintenant: t0, ebayApi: 'relie', utilisees: ['ebay', 'vinted'] });
  ok(a1.length === 0, '4a. eBay relié par l\'API et sain : la sonde ebay.fr de Chrome (false) ne déclenche AUCUNE alerte');
  ok(A.alertesCompte({ etats, jobs: jobsEbay, reglage: null, maintenant: t0, ebayApi: 'inconnu', utilisees: ['ebay'] }).length === 0,
    '4b. lien API pas encore lu : rien (jamais une alerte sur un doute)');
  const a3 = A.alertesCompte({ etats: { ebay: 'ok' }, jobs: jobsEbay, reglage: { masquees: { ebay: true } }, maintenant: t0, ebayApi: 'a_relier', utilisees: ['ebay'] });
  ok(a3.length === 1 && a3[0].kind === 'relier_api' && a3[0].platform === 'ebay', '4c. lien API à refaire : « Reconnecte ton compte eBay », même si l\'ancien masque eBay est posé (un risque ne se masque pas)');
  const l = A.ligneAlertes(a3, 'fr');
  ok(l.titre === 'Reconnecte ton compte eBay' && /lien officiel avec FillSell est à refaire/.test(l.detail) && !/ordinateur/.test(l.detail), `4d. sa ligne ne parle jamais de l'ordinateur (« ${l.titre} — ${l.detail} »)`);
  ok(A.libelleReconnexion(a3[0], 'fr') === 'Relier eBay', '4e. le geste : relier eBay (la voie officielle)');
  ok(A.alertesCompte({ etats, jobs: jobsEbay, reglage: null, maintenant: t0, ebayApi: null, utilisees: ['ebay'] }).map((a) => a.platform + ':' + a.kind).join(',') === 'ebay:connexion',
    '4f. eBay SANS lien API, vraiment utilisé : la sonde compte, comme avant');
  ok(A.alertesCompte({ etats, jobs: [], reglage: null, maintenant: t0, utilisees: ['vinted'] }).length === 0, '4g. eBay jamais utilisé avec FillSell (aucune tâche, aucune fiche) : rien à « ne plus voir »');
  ok(A.alertesCompte({ etats, jobs: jobsEbay, reglage: null, maintenant: t0, ecartees: ['ebay'], utilisees: ['ebay'] }).length === 0, '4h. « Je ne vends pas sur eBay » : jamais d\'alerte eBay');
  ok(A.masquesARetirer({ masquees: { ebay: true } }, { ebay: 'ko' }, 'relie').join(',') === 'ebay' && A.masquesARetirer({ masquees: { ebay: true } }, { ebay: 'ko' }, null).length === 0,
    '4i. le masque eBay tombe quand le lien API est sain (la prochaine perte du lien se dira)');
  ok(A.etatEbayApi({ voieApi: true, lu: true, etat: { connecte: true } }) === 'relie' && A.etatEbayApi({ voieApi: true, lu: true, etat: { a_reconnecter: true } }) === 'a_relier'
     && A.etatEbayApi({ voieApi: true, lu: false }) === 'inconnu' && A.etatEbayApi({ voieApi: false }) === null && A.etatEbayApi(null) === null, '4j. etatEbayApi : relié, à relier, inconnu, pas de voie API');
  const u = A.plateformesUtilisees([{ platform: 'beebs' }], [{ origine: 'vinted_sync' }, { origine: 'releve_ebay' }, { plateforme: 'Leboncoin' }]);
  ok(['beebs', 'vinted', 'ebay', 'leboncoin'].every((p) => u.includes(p)) && !u.includes('depop'), `4k. plateformes utilisées : tâches et fiches (${u.join(', ')})`);
  ok(/etatEbayApi\(ebayCompte\)/.test(ST) && /plateformesUtilisees\(Object\.values\(jobsByInventaire\)\.flat\(\), items\)/.test(ST)
     && /ebayApi: ebayApiCompte, ecartees: ecarteesCompte, utilisees: plateformesUtiliseesCompte/.test(ST) && /masquesARetirer\(reglageAlertes, etatsCompte, ebayApiCompte\)/.test(ST)
     && /plateformes_ecartees/.test(ST), '4l. StockTab : le lien API, les plateformes écartées et utilisées entrent dans la règle');
  ok(!/const plateformesDuCompte\s*=/.test(ST) && /plateformesDuCompte\(plateformesOuvertes\)/.test(ST),
    '4n. ⛔ aucune variable n\'ombre l\'import plateformesDuCompte (utils/stockFiltres) — l\'ombre = écran blanc');
  ok(/relierApi = a\.kind === 'relier_api'/.test(EC) && /!nonSurveillee && !relierApi && \(/.test(EC), '4m. l\'écran : sa carte, sans « Masquer »');
}

console.log(`\n${total - echecs}/${total} contrôles verts`);
process.exit(echecs ? 1 : 0);
