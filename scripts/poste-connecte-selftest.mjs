// ═══════════════════════════════════════════════════════════════════════════
// UN RELEVÉ VA AU POSTE CONNECTÉ ; UN RELEVÉ RATÉ PAR UN AUTRE POSTE NE DIT PAS « ME RECONNECTER » — `npm run selftest:poste-connecte`
// ═══════════════════════════════════════════════════════════════════════════
// 09/11 soir, décision de Nico (Guillaume JEHLY, 3 postes : Chrome et Brave sur un PC, Brave sur un autre ; Leboncoin
// connecté dans Chrome seulement). Les tâches évitaient le poste emmuré, pas les relevés : un Brave sans session
// concluait « page de connexion » et l'app disait « Me reconnecter » pendant que Chrome publiait.
//   1. posteConnecte : vivant (< 15 min) ET dernière preuve positive (ok_<pf> < 7 j, ou sonde vraie < 15 min) plus
//      récente que son mur et que sa sonde « déconnectée » ;
//   2. releveRateParUnAutrePoste : seulement si le poste du relevé est CONNU (releve_<pf>) et qu'un AUTRE poste est
//      connecté ; sinon on dit ce qu'on a lu, comme avant ;
//   3. mursDesRelevesDuPoste : un relevé de CE poste fini sur la page de connexion lui pose son mur (jamais reculé) ;
//   4. l'app (lireDerniersRunsReleve) tait ces relevés-là, jamais Vinted, et rien quand le profil est illisible ;
//   5. get-pending-jobs : note le relevé servi, pose le mur, et ne sert pas un relevé à un poste emmuré quand un autre
//      poste vivant sans mur peut le prendre (la même règle que les tâches).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const P = await import(pathToFileURL(join(RACINE, 'supabase/functions/_shared/poste-connecte.js')).href);

let ko = 0, ok = 0;
const verifier = (cond, nom) => { if (cond) { ok++; console.log(`  ✓ ${nom}`); } else { ko++; console.error(`  ✗ ${nom}`); } };

// Les postes de Guillaume le 09/11 (formes réelles de profiles.extension_postes, heures UTC), vus à 17:30Z.
const T = Date.parse('2026-11-09T17:30:00Z');
const iso = (h) => `2026-11-09T${h}Z`;
const postes = {
  chromeQ: { le: iso('17:27:52.783'), ok_leboncoin: iso('17:11:03.370'), mur_leboncoin: iso('13:20:00.521'), sessions: { leboncoin: null, lu_le: iso('17:08:49.281') } },
  braveQ: { le: iso('17:28:13.648'), ok_leboncoin: iso('11:03:33.315'), mur_leboncoin: iso('16:28:33.620'), sessions: { leboncoin: null, lu_le: iso('17:20:18.607') } },
  braveI: { le: iso('17:28:11.023'), mur_leboncoin: iso('17:22:28.289'), sessions: { leboncoin: null, lu_le: iso('17:26:27.086') },
    releve_leboncoin: { run: 'run-1818', le: iso('17:18:49.287') } },
  mort: { le: iso('10:08:06.476'), ok_leboncoin: iso('10:00:00.000') },
};

// 1.
verifier(P.posteConnecte(postes.chromeQ, 'leboncoin', T) === true, 'Chrome (PC Qualcomm) : réussite 17:11 après son mur de 13:20 → connecté');
verifier(P.posteConnecte(postes.braveQ, 'leboncoin', T) === false, 'Brave (PC Qualcomm) : mur 16:28 après sa réussite de 11:03 → pas connecté');
verifier(P.posteConnecte(postes.braveI, 'leboncoin', T) === false, 'Brave (PC Intel) : aucune réussite → pas connecté');
verifier(P.posteConnecte(postes.mort, 'leboncoin', T) === false, 'un poste muet depuis plus de 15 min → pas connecté');
verifier(P.posteConnecte({ le: iso('17:29:00'), sessions: { leboncoin: true, lu_le: iso('17:25:00') } }, 'leboncoin', T) === true, 'sonde « connecté » fraîche → connecté');
verifier(P.posteConnecte({ le: iso('17:29:00'), ok_leboncoin: iso('17:00:00'), sessions: { leboncoin: false, lu_le: iso('17:25:00') } }, 'leboncoin', T) === false,
  'sonde « déconnecté » plus récente que la réussite → pas connecté');
verifier(P.posteConnecte({ le: iso('17:29:00'), ok_leboncoin: '2026-11-01T10:00:00Z' }, 'leboncoin', T) === false, 'une réussite de plus de 7 jours ne prouve plus rien');
verifier(P.posteConnecte(postes.chromeQ, 'beebs', T) === false, 'connecté à Leboncoin ne dit rien de Beebs');
verifier(JSON.stringify(P.postesConnectes(postes, 'leboncoin', { maintenant: T })) === '["chromeQ"]', 'un seul poste connecté à Leboncoin : Chrome');

// 2.
const run1818 = { id: 'run-1818', platform: 'leboncoin', status: 'absente',
  erreur: "[incomplet] session leboncoin : page de connexion (« Mes annonces » s'ouvre sur la connexion de Leboncoin [auth.leboncoin.fr/login/])",
  finished_at: iso('17:19:30') };
verifier(P.releveRateParUnAutrePoste(run1818, 'leboncoin', postes, T) === true, 'le relevé de 18:18 (Brave PC Intel) se tait : Chrome est connecté');
verifier(P.releveRateParUnAutrePoste({ ...run1818, id: 'inconnu' }, 'leboncoin', postes, T) === false, 'poste du relevé inconnu → on dit ce qu\'on a lu');
verifier(P.releveRateParUnAutrePoste(run1818, 'leboncoin', { ...postes, chromeQ: { ...postes.chromeQ, le: iso('16:00:00') } }, T) === false,
  'aucun autre poste vivant connecté → « Me reconnecter » reste');
verifier(P.releveRateParUnAutrePoste({ ...run1818, erreur: '[défilement] 322 en ligne lues sur 322', status: 'done' }, 'leboncoin', postes, T) === false,
  'un relevé réussi ne se tait jamais');
const seulConnecte = { chromeQ: { ...postes.chromeQ, releve_leboncoin: { run: 'run-x' } } };
verifier(P.releveRateParUnAutrePoste({ ...run1818, id: 'run-x' }, 'leboncoin', seulConnecte, T) === false, 'le poste connecté qui rate lui-même → on le dit (aucun AUTRE poste)');

// 3.
const patch = P.mursDesRelevesDuPoste(postes.braveI, [run1818]);
verifier(patch.mur_leboncoin === undefined, 'mur déjà plus récent (17:22) que la fin du relevé (17:19) → jamais reculé');
const patch2 = P.mursDesRelevesDuPoste({ ...postes.braveI, mur_leboncoin: undefined }, [run1818]);
verifier(patch2.mur_leboncoin === new Date(Date.parse(iso('17:19:30'))).toISOString(), 'relevé de CE poste fini sur la page de connexion → mur_leboncoin = sa fin');
verifier(Object.keys(P.mursDesRelevesDuPoste({ ...postes.braveI, mur_leboncoin: undefined }, [{ ...run1818, id: 'autre' }])).length === 0, 'le relevé d\'un autre poste ne pose rien ici');
verifier(Object.keys(P.mursDesRelevesDuPoste({ ...postes.braveI, mur_leboncoin: undefined }, [{ ...run1818, erreur: 'onglet_indisponible' }])).length === 0, 'un autre échec n\'est pas un mur de connexion');

// 4. L'app.
const SP = lire('src/utils/syncPlateformes.js');
const corps = SP.slice(SP.indexOf('export async function lireDerniersRunsReleve('), SP.indexOf('export async function lireRelevesRecents('));
verifier(/from '\.\.\/\.\.\/supabase\/functions\/_shared\/poste-connecte\.js'/.test(SP), "l'app lit la même règle (_shared/poste-connecte.js)");
verifier(/select\('extension_postes'\)/.test(corps) && /r\.platform !== 'vinted' && releveRateParUnAutrePoste\(r, r\.platform, postes, maintenant\)/.test(corps),
  'lireDerniersRunsReleve tait le relevé raté par un autre poste, jamais Vinted');
verifier(/catch \{ postes = null; \}/.test(corps) && /!!postes &&/.test(corps), 'profil illisible → rien n\'est tu (comme avant)');
verifier(/if \(!tu\(r\)\) \(listes\[r\.platform\] \?\?= \[\]\)\.push\(r\)/.test(corps), 'la série « pas connecté » (absences_de_suite) ne compte pas ces relevés');

// 5. get-pending-jobs.
const GPJ = lire('supabase/functions/get-pending-jobs/index.ts');
verifier(/from "\.\.\/_shared\/poste-connecte\.js"/.test(GPJ), 'get-pending-jobs importe _shared/poste-connecte.js');
verifier(/RELEVÉS AU POSTE CONNECTÉ/.test(GPJ) && /murDuPosteTient\(\{ moi: [^}]*pf[^}]*\}\) \|\| posteSeDitDeconnecte\(/.test(GPJ.slice(GPJ.indexOf('RELEVÉS AU POSTE CONNECTÉ'))),
  'les relevés suivent le mur du poste comme les tâches (murDuPosteTient || posteSeDitDeconnecte)');
verifier(/patchReleves\[`releve_\$\{c\.platform\}`\] = \{ run: c\.id, le: maintenantR \}/.test(GPJ)
  && /rpc\("noter_poste_extension", \{ p_user: user\.id, p_session: sessionId, p_patch: patchReleves \}\)/.test(GPJ),
  'le relevé servi est noté sur le poste (releve_<pf> = { run, le }, noter_poste_extension)');
verifier(/if \(sessionId && !posteCloud && cloudVoie !== true && Object\.keys\(postesDuCompte\)\.length > 1\) \{\n\s*const moiR/.test(GPJ),
  'jamais pour un compte Cloud ni un poste seul');
verifier(/mursDesRelevesDuPoste\(/.test(GPJ), 'un relevé de ce poste fini sur la page de connexion lui pose son mur');

console.log(`\n${ok} vert(s), ${ko} rouge(s)`);
if (ko) process.exit(1);
