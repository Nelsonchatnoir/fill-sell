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
  && /import \{ alertesCompte, masquesARetirer, ligneAlertes, CLE_REGLAGE_ALERTES \} from '\.\.\/utils\/alertesCompte';/.test(ST), '3. StockTab : une seule règle (modules partagés)');
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

console.log(`\n${total - echecs}/${total} contrôles verts`);
process.exit(echecs ? 1 : 0);
