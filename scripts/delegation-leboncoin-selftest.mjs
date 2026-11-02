// selftest:delegation-leboncoin — DÉLÉGATION LEBONCOIN PAR COMPTE (01/11, décision de Nico — louis-seller → Amiral)
//
//   npm run selftest:delegation-leboncoin            contrôles du dépôt (hors ligne)
//   npm run selftest:delegation-leboncoin -- --prod  + la base, en LECTURE seule
//
//   A. la règle pure (_shared/delegation-leboncoin.js) : délégation SEULEMENT posée des deux côtés, l'un vers l'autre ;
//      ⛔ compte sans délégation (beta_flags vide, autres drapeaux, un seul côté, valeurs mal formées) = AUCUNE délégation ;
//      le compte de travail ne reçoit que Leboncoin, les postes du propriétaire tout sauf Leboncoin ; la pause la plus
//      prudente gagne ;
//   B. get-pending-jobs : sans délégation, chaque branche neuve est inerte (garde sur delegationLbc / proprietaireDelegue /
//      delegationsExecutees) ; poll délégué non prouvé → rien servi ; file, relevés, connexion filtrés ; la pause de
//      l'exécutant retient le compte de travail ; les postes du propriétaire ne reçoivent plus rien de Leboncoin ;
//   C. extension-session : une session d'un autre compte n'est fabriquée que pour une délégation valide (sinon 403) ;
//   D. extension 0.6.164 : le cycle délégué ne tourne que si le serveur le dit (rep.delegations) ; sa session est rangée
//      à part ; tout s'écrit avec SON jeton ; ⛔ le compte de l'extension inchangé (session, garde anti-bascule, pause) ;
//   E. app : la carte de synchro ne change que pour un compte qui délègue ;
//   F. --prod : délégation posée sur la paire louis-seller → Amiral et elle seule ; plus aucune exception « machine
//      virtuelle ».
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const D = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/delegation-leboncoin.js')).href);
const BS = await import(pathToFileURL(path.join(RACINE, 'src/stock/boutonSynchro.js')).href);
const GPJ = lire('supabase/functions/get-pending-jobs/index.ts');
const ES = lire('supabase/functions/extension-session/index.ts');
const BG = lire('chrome-extension/background.js');
const MAN = JSON.parse(lire('chrome-extension/manifest.json'));
const SP = lire('src/utils/syncPlateformes.js');
const BLOC = lire('src/stock/BlocSynchro.jsx');

let echecs = 0, total = 0;
const ok = (c, l) => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}`); };
const A = 'faf5021a-479a-4bb3-b3ec-c296770739b7';   // Amiral (exécutant)
const B = '447d920c-976a-4d8f-aff4-a2998050358c';   // louis-seller (propriétaire)
const X = '11111111-2222-4333-8444-555555555555';
const FB = { [D.CLE_DELEGATION_LBC]: { executant: A, nom: 'Amiral' } };
const FA = { [D.CLE_EXECUTE_LBC_POUR]: [B] };

// ── A. La règle ──────────────────────────────────────────────────────────────
ok(D.delegationLbcValide({ proprietaire: B, flagsProprietaire: FB, executant: A, flagsExecutant: FA }), 'A1. posée des deux côtés, l\'un vers l\'autre → délégation');
ok([{}, null, undefined, { messages_bordereaux: true }, { lbc_machine_virtuelle_autorisee: true }].every((f) =>
  !D.delegationLbcValide({ proprietaire: B, flagsProprietaire: f, executant: A, flagsExecutant: f })
  && !D.delegueLbc(f) && D.comptesExecutesLbc(f).length === 0 && D.executantLbcDeclare(f) === null),
  'A2. ⛔ compte sans délégation (vide, absent, autres drapeaux) : aucune délégation, aucun exécutant, aucun compte servi');
ok(!D.delegationLbcValide({ proprietaire: B, flagsProprietaire: FB, executant: A, flagsExecutant: {} })
  && !D.delegationLbcValide({ proprietaire: B, flagsProprietaire: {}, executant: A, flagsExecutant: FA }),
  'A3. un seul côté posé (propriétaire OU exécutant) : aucune délégation');
ok(!D.delegationLbcValide({ proprietaire: B, flagsProprietaire: FB, executant: X, flagsExecutant: { [D.CLE_EXECUTE_LBC_POUR]: [B] } })
  && !D.delegationLbcValide({ proprietaire: X, flagsProprietaire: { [D.CLE_DELEGATION_LBC]: { executant: A } }, executant: A, flagsExecutant: FA })
  && !D.delegationLbcValide({ proprietaire: B, flagsProprietaire: { [D.CLE_DELEGATION_LBC]: { executant: B } }, executant: B, flagsExecutant: { [D.CLE_EXECUTE_LBC_POUR]: [B] } }),
  'A4. un tiers ne passe ni comme exécutant ni comme propriétaire ; jamais soi-même');
ok([{ [D.CLE_DELEGATION_LBC]: 'faf5021a' }, { [D.CLE_DELEGATION_LBC]: { executant: 'Amiral' } }, { [D.CLE_DELEGATION_LBC]: [A] }].every((f) => D.executantLbcDeclare(f) === null)
  && D.comptesExecutesLbc({ [D.CLE_EXECUTE_LBC_POUR]: B }).length === 0 && JSON.stringify(D.comptesExecutesLbc({ [D.CLE_EXECUTE_LBC_POUR]: [B, B, 'x', 3] })) === JSON.stringify([B]),
  'A5. valeurs mal formées ignorées (texte, nom au lieu d\'identifiant, liste) ; doublons et intrus retirés');
const file = [{ id: 1, platform: 'vinted' }, { id: 2, platform: 'leboncoin' }, { id: 3, platform: 'beebs' }, { id: 4, platform: 'leboncoin' }];
ok(JSON.stringify(D.tachesDuDelegue(file).map((j) => j.id)) === '[2,4]' && JSON.stringify(D.tachesSansLbc(file).map((j) => j.id)) === '[1,3]',
  'A6. le compte de travail : Leboncoin seulement ; les postes du propriétaire : tout sauf Leboncoin');
ok(D.etatLePlusPrudent('libre', 'bloque') === 'bloque' && D.etatLePlusPrudent('essai', 'reprise') === 'essai' && D.etatLePlusPrudent('libre', 'libre') === 'libre',
  'A7. la pause la plus prudente gagne (exécutant ou propriétaire)');
ok(/Leboncoin passe par ton compte Amiral/.test(D.messageDelegationLbc('Amiral')) && /Rien n'a été touché/.test(D.messageTacheDelegueeEnAttente('Amiral'))
  && !/\d+\s*(min|h)\b/.test(D.messageDelegationLbc('Amiral') + D.messageTacheDelegueeEnAttente('Amiral')),
  'A8. les phrases nomment le compte, sans aucune estimation de temps');

// ── B. get-pending-jobs ──────────────────────────────────────────────────────
const iDeb = GPJ.indexOf('DÉLÉGATION LEBONCOIN PAR COMPTE (_shared/delegation-leboncoin.js)');
const bloc0 = GPJ.slice(iDeb, GPJ.indexOf('── LES CRÉNEAUX, PAR PLATEFORME', iDeb));
ok(iDeb > 0 && /if \(jetonExecutant\) \{/.test(bloc0) && /delegationLbcValide\(\{ proprietaire: user\.id, flagsProprietaire: flagsP, executant: ex\.id, flagsExecutant: flagsE \}\)/.test(bloc0),
  'B1. poll délégué : le jeton de l\'exécutant est VÉRIFIÉ (auth.getUser) et la délégation validée des deux côtés');
ok(/if \(!valide\) \{[\s\S]*?return json\(\{ jobs: \[\], sync_commands: \[\], sync_commands_annonces: \[\], connexion_commands: \[\], delegation_refusee: true \}\);/.test(bloc0),
  'B2. ⛔ poll qui se dit délégué sans le prouver : rien n\'est servi (jamais un repli sur la file entière), avant toute écriture');
ok(/if \(executant && delegationLbcValide\(\{ proprietaire: user\.id, flagsProprietaire: flagsP, executant, flagsExecutant: await flagsDe\(executant\) \}\)\)/.test(bloc0)
  && /for \(const compte of comptesExecutesLbc\(flagsP\)\)/.test(bloc0),
  'B3. propriétaire et exécutant reconnus seulement sur une délégation valide (sinon null / liste vide → comme avant)');
const nDelegue = (GPJ.match(/delegationLbc/g) ?? []).length;
ok(GPJ.includes('if (!delegationLbc) await admin.from("profiles").update(patch).eq("id", user.id);')
  && GPJ.includes('if (posteAvecOpla && !delegationLbc) {') && GPJ.includes('if (posteAvecDepop && !delegationLbc) {')
  && GPJ.includes('if (delegationLbc) (patchPoste as Record<string, unknown>).delegation = {'),
  'B4. compte de travail : poste marqué, ni présence/build du propriétaire, ni relance Opla/Depop');
ok(GPJ.includes('if (delegationLbc) q = q.eq("platform", PLATEFORME_DELEGUEE);') && (GPJ.match(/if \(delegationLbc\) q = q\.eq\("platform", PLATEFORME_DELEGUEE\);/g) ?? []).length === 2,
  'B5. compte de travail : la file lue est la file LEBONCOIN du propriétaire (lecture de fond et popup)');
// (02/11, facture Supabase) Les demandes en file se lisent en une fois (lireCommandesEnFile) : même filtre, en mémoire.
ok(/if \(delegationLbc\) qCmds = qCmds\.eq\("platform", PLATEFORME_DELEGUEE\);\n\s+else if \(proprietaireDelegue\) qCmds = qCmds\.neq\("platform", PLATEFORME_DELEGUEE\);/.test(GPJ)
  || GPJ.includes('&& (delegationLbc ? c.platform === PLATEFORME_DELEGUEE : proprietaireDelegue ? c.platform !== PLATEFORME_DELEGUEE : true)).slice(0, 4);'),
  'B6. relevés : le compte de travail ne lit que Leboncoin, les postes du propriétaire jamais Leboncoin (sinon : la lecture d\'avant)');
ok(GPJ.includes('.filter((c) => delegationLbc ? c.platform === PLATEFORME_DELEGUEE : !(proprietaireDelegue && c.platform === PLATEFORME_DELEGUEE));'),
  'B7. « Me connecter » : Leboncoin chez l\'exécutant ; sans délégation, filtre neutre (tout passe)');
ok(GPJ.includes('versionAuMoins(version, SYNC_VERSION_MIN) && !includeProcessing && !includeNeedsUser && !delegationLbc')
  && GPJ.includes('versionAuMoins(version, SYNC_VERSION_MIN) && !includeProcessing && !delegationLbc')
  && (GPJ.match(/versionAuMoins\(version, "0\.6\.42"\) && !includeProcessing && !includeNeedsUser && !delegationLbc/g) ?? []).length === 2,
  'B8. compte de travail : jamais la première synchro, le dressing Vinted, les redemandes ni les reprises de relevés du compte');
const iLu = GPJ.indexOf('DÉLÉGATION LEBONCOIN : CHAQUE POSTE NE VOIT QUE SA PART, DÈS LA LECTURE');
const blocLu = GPJ.slice(iLu, iLu + 1400);
ok(iLu > 0 && /if \(delegationLbc\) \{\n\s+out = out\.filter\(\(j\) => String\(j\.platform\) === PLATEFORME_DELEGUEE\);\n\s+\} else if \(proprietaireDelegue\) \{/.test(blocLu),
  'B9. dès la lecture : compte de travail = Leboncoin ; postes du propriétaire = tout sauf Leboncoin ; sinon rien');
ok(GPJ.includes('if (!includeProcessing && !includeNeedsUser && !proprietaireDelegue) {\n      try {\n        const { data: profB } = await userClient.from("profiles").select("platform_settings, beta_flags")'),
  'B10. la pause du propriétaire (et son essai) ne se joue plus sur ses propres postes, seulement chez le compte de travail');
const iPA = GPJ.indexOf('DÉLÉGATION LEBONCOIN : LA PAUSE SUIT LA SESSION QUI TRAVAILLE');
const blocPA = GPJ.slice(iPA, GPJ.indexOf('LES POSTES DU PROPRIÉTAIRE NE TOUCHENT PLUS JAMAIS LEBONCOIN', iPA));
ok(iPA > 0 && /if \(!includeProcessing && !includeNeedsUser && delegationLbc\) \{/.test(blocPA)
  && /\.select\("platform_settings"\)\.eq\("id", delegationLbc\.executant\)/.test(blocPA)
  && /out = out\.filter\(\(j\) => !idsA\.has\(String\(j\.id\)\)\)/.test(blocPA)
  && /catch \(e\) \{\n\s+out = out\.filter\(\(j\) => j\.platform !== PLATEFORME_DELEGUEE\);/.test(blocPA),
  'B11. la pause de l\'EXÉCUTANT retient le compte de travail ; lecture impossible → prudence (rien de Leboncoin)');
ok(!/blocagePose|blocageLeve\(|blocageEssaiRefuse/.test(blocPA) && /p_user: delegationLbc\.executant/.test(blocPA),
  'B12. la règle de pause ne change pas : rien n\'est posé ni levé ici, la reprise prudente compte sur l\'exécutant');
const iPr = GPJ.indexOf('LES POSTES DU PROPRIÉTAIRE NE TOUCHENT PLUS JAMAIS LEBONCOIN');
const blocPr = GPJ.slice(iPr, GPJ.indexOf('UNE MACHINE VIRTUELLE NE FAIT JAMAIS LEBONCOIN (_shared/poste-virtuel.js)', iPr));
ok(/if \(!includeProcessing && !includeNeedsUser && proprietaireDelegue\) \{\n\s+blocageLbcReponse = \{ etat: "delegue"/.test(blocPr)
  && /\.eq\("id", String\(j\.id\)\)\.eq\("status", "pending"\)/.test(blocPr) && /ecritsP >= 40/.test(blocPr) && !/status: "(?:cancelled|failed|needs_user)"/.test(blocPr),
  'B13. postes du propriétaire : « blocages » = delegue ; message seulement sur ses tâches en attente, borné, aucun statut changé');
ok(GPJ.includes('...(delegationsExecutees.length ? { delegations: delegationsExecutees } : {}),')
  && GPJ.includes('versionAuMoins(version, LECTURE_FOND_VERSION_MIN) && !delegationLbc) {') && GPJ.includes('&& !syncCommandsAnnonces.some((c) => c.devant) && !delegationLbc) {'),
  'B14. réponse : « delegations » seulement chez l\'exécutant ; lectures de fond jamais au compte de travail');
ok(GPJ.includes('if (pf === PLATEFORME_DELEGUEE && delegationLbc) continue;'), 'B15. le mur d\'un poste ne laisse jamais Leboncoin du compte de travail à un autre poste');
ok(nDelegue >= 20, `B16. toutes les branches neuves sont gardées par la délégation (${nDelegue} occurrences)`);

// ── C. extension-session ────────────────────────────────────────────────────
ok(ES.includes('import { delegationLbcValide } from "../_shared/delegation-leboncoin.js";')
  && /if \(delegationPour\) \{[\s\S]*?if \(!valide\) \{[\s\S]*?return json\(\{ error: "Délégation non autorisée" \}, 403\);/.test(ES)
  && /executant: user\.id, flagsExecutant: await flags\(user\.id\)/.test(ES),
  'C1. session d\'un autre compte : seulement pour une délégation valide VERS l\'appelant, sinon 403 sans rien générer');
ok(/let emailCible = user\.email \?\? null;/.test(ES) && /body: JSON\.stringify\(\{ type: "magiclink", email: emailCible \}\)/.test(ES)
  && /if \(delegationPour\) return json\(\{ hashed_token: hashedToken, email: emailCible, compte: delegationPour, delegation: \["leboncoin"\] \}\);/.test(ES),
  'C2. sans delegation_pour : le bootstrap d\'avant, à l\'identique (son propre email)');

// ── D. extension ─────────────────────────────────────────────────────────────
const [ma, mi, pa] = String(MAN.version).split('.').map(Number);
ok(ma > 0 || mi > 6 || (mi === 6 && pa >= 164), `D1. version d'extension neuve (${MAN.version} ≥ 0.6.164)`);
ok(BG.includes('noterDelegationsServies(rep.delegations);') && /function lancerCycleDelegue\(\) \{\n\s+if \(!delegationsServies\.length\) return;/.test(BG)
  && /async function cycleDelegueLbc\(\) \{\n\s+if \(!delegationsServies\.length\) return;/.test(BG),
  'D2. ⛔ le cycle délégué ne tourne que si le serveur le dit (rep.delegations absent = rien)');
ok(/const SESSION_DELEGUEE_KEY = \(compte\) => `fillsell_session_delegue_\$\{compte\}`;/.test(BG)
  && /callEdgeFunction\("extension-session", tokenOwn, \{ delegation_pour: compte \}\)/.test(BG)
  && /if \(decodeJwtSub\(data\.access_token\) !== compte\) throw new Error\("session d'un autre compte"\);/.test(BG),
  'D3. session déléguée rangée à part, vérifiée (elle est bien celle du compte délégué)');
const iSD = BG.indexOf('async function sessionDeleguee(');
const sd = BG.slice(iSD, BG.indexOf('\n}\n', iSD));
ok(!/SESSION_OWN|poserLastUser|PENDING_SWITCH|STORAGE_KEYS\.SESSION\b/.test(sd), 'D4. ⛔ la session de l\'extension, son identité et la garde anti-bascule ne sont jamais touchées');
const iC = BG.indexOf('async function cycleDelegueUnCompte(');
const cyc = BG.slice(iC, BG.indexOf('\n}\n', iC));
ok(/filter\(\(j\) => j\?\.platform === "leboncoin"\)/.test(cyc) && /processJob\(job, tokenD\)/.test(cyc) && /restRequest\("rpc\/file_etat_poste", tokenD/.test(cyc) && !/etatFileEntreDeuxTaches/.test(cyc)
  && /filter\(\(c\) => c\?\.platform === "leboncoin" && c\?\.id\)/.test(cyc) && (cyc.match(/session: sD/g) ?? []).length === 4,
  'D5. cycle délégué : Leboncoin seulement, tâches et relevés avec le JETON du compte délégué');
ok(!/noterBlocageLbcServeur|fillsell_blocage_lbc/.test(cyc) && /executant_jeton: own\.access_token/.test(cyc),
  'D6. la pause du compte de travail n\'est jamais rangée dans l\'état de l\'extension ; la preuve de l\'exécutant part au poll délégué');
ok(BG.includes('async function cycleDelegueLbc() {') && /if \(await leboncoinEnPause\(\)\) \{\n\s+console\.log\("\[delegation\] Leboncoin en pause sur ce navigateur/.test(BG),
  'D7. la session Leboncoin de ce navigateur en pause : rien ne part pour le compte délégué');
ok(/async function leboncoinDelegueAilleurs\(\) \{[\s\S]{0,300}b\.etat === "delegue"/.test(BG)
  && BG.includes('if (platform === "leboncoin" && !sessionFournie && await leboncoinDelegueAilleurs()) return { ok: false, reason: "leboncoin_delegue" };')
  && BG.includes('if (plateformes.includes("leboncoin") && await leboncoinDelegueAilleurs()) plateformes = plateformes.filter((pf) => pf !== "leboncoin");'),
  'D8. un poste dont le compte délègue ne touche plus Leboncoin (sonde, relevé lancé de lui-même) — seul l\'état « delegue » le fait');
ok(BG.includes('const session = sessionFournie ?? await getValidSession();') && (BG.match(/sessionFournie \?\? await getValidSession\(\)/g) ?? []).length === 2,
  'D9. relevé de stock et relevé des ventes : sans session fournie, la session de l\'extension (comme avant)');
ok(BG.includes('const cleEtat = sessionFournie ? `${platform}@${userId}` : platform;') && !/etat\[platform\] = \{ \.\.\.\(etat\[platform\]/.test(BG.slice(BG.indexOf('async function lancerReleveVentes('), BG.indexOf('async function releverVentesQuotidien('))),
  'D10. relevé des ventes : la cadence du compte délégué est la sienne ; sans délégation, la même clé qu\'avant');
ok(/if \(subAncien && delegationsServies\.some\(\(d\) => d\.compte === subAncien\)\) \{/.test(BG),
  'D11. un jeton délégué expiré se rafraîchit dans SA clé, jamais dans celle de l\'extension');
ok(BG.includes('const filtreDelegation = plateforme ? `&platform=eq.${encodeURIComponent(plateforme)}`')
  && BG.includes(': ((await leboncoinDelegueAilleurs()) ? "&platform=neq.leboncoin" : "");')
  && /checkPublishedListings\(sD, \{ plateforme: "leboncoin" \}\)/.test(cyc) && /await checkPublishedListings\(session\)\.catch/.test(BG),
  'D12. détection de vente par annonce : le compte délégué ne relit que ses annonces Leboncoin ; un poste qui délègue n\'ouvre plus aucune page Leboncoin ; sinon inchangée');

// ── E. app ───────────────────────────────────────────────────────────────────
ok(BS.texteDelegationLbc(null) === null && BS.pastilleLbcDeleguee({ delegation: null, phase: 'jamais' }) === false,
  'E1. ⛔ compte sans délégation : ni ligne, ni pastille changée');
const t0 = Date.parse('2026-11-01T15:00:00Z');
const dl = { nom: 'Amiral', posteVuLe: '2026-11-01T14:58:00Z', sessionLbc: true, sessionLe: '2026-11-01T14:55:00Z', dernierReleve: { status: 'done', items_vus: 120, finished_at: '2026-11-01T14:50:00Z' } };
ok(BS.texteDelegationLbc(dl, t0, true).texte === 'Leboncoin passe par ton compte Amiral.' && BS.texteDelegationLbc(dl, t0, true).ok === true,
  'E2. délégation qui fonctionne : « Leboncoin passe par ton compte Amiral. »');
ok(/En attente de son ordinateur/.test(BS.texteDelegationLbc({ ...dl, posteVuLe: '2026-11-01T10:00:00Z' }, t0, true).texte)
  && /n'est pas connecté sur son ordinateur/.test(BS.texteDelegationLbc({ ...dl, sessionLbc: false }, t0, true).texte),
  'E3. état réel : ordinateur d\'Amiral muet depuis 2 h, ou Leboncoin déconnecté chez lui → dit');
ok(['jamais', 'echec', 'expire', 'absente'].every((ph) => BS.pastilleLbcDeleguee({ delegation: dl, phase: ph }))
  && !BS.pastilleLbcDeleguee({ delegation: dl, phase: 'fait' }) && !BS.pastilleLbcDeleguee({ delegation: dl, phase: 'en_cours' })
  && !BS.pastilleLbcDeleguee({ delegation: { ...dl, dernierReleve: null }, phase: 'jamais' }),
  'E4. pastille : plus de « — » tant qu\'un relevé réussi existe ; un état plus parlant (fait, en cours) garde la main');
ok(/export async function lireDelegationLbc\(userId\)/.test(SP) && /if \(!d \|\| typeof d !== 'object' \|\| typeof d\.executant !== 'string'\) return null;/.test(SP)
  && /p === 'leboncoin' && pastilleLbcDeleguee\(\{ delegation: delegationLbc, phase: e\.phase \}\)/.test(BLOC) && /texteDelegationLbc\(delegationLbc, Date\.now\(\), fr\)/.test(BLOC),
  'E5. la carte lit la délégation une fois à l\'ouverture (null sans délégation) et ne change que la pastille Leboncoin et sa ligne');

// ── F. --prod (LECTURE seule) ────────────────────────────────────────────────
if (process.argv.includes('--prod')) {
  const sql = `select jsonb_build_object(
    'delegants', (select jsonb_agg(jsonb_build_object('email', u.email, 'executant', p.beta_flags->'delegation_leboncoin'->>'executant')) from public.profiles p join auth.users u on u.id = p.id where p.beta_flags ? 'delegation_leboncoin'),
    'executants', (select jsonb_agg(jsonb_build_object('email', u.email, 'pour', p.beta_flags->'execute_leboncoin_pour')) from public.profiles p join auth.users u on u.id = p.id where p.beta_flags ? 'execute_leboncoin_pour'),
    'exception_vm', (select count(*) from public.profiles where beta_flags ? 'lbc_machine_virtuelle_autorisee')) as r;`;
  const fichier = path.join(os.tmpdir(), `delegation-lbc-prod-${process.pid}.sql`);
  writeFileSync(fichier, sql, 'utf8');
  const res = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', `"${fichier}"`], { cwd: RACINE, encoding: 'utf8', shell: true });
  try { unlinkSync(fichier); } catch { /* fichier temporaire */ }
  const txt = String(res.stdout ?? '');
  let r = null;
  try { r = JSON.parse(txt.slice(txt.indexOf('{'))).rows?.[0]?.r; } catch { r = null; }
  ok(r && JSON.stringify(r.delegants) === JSON.stringify([{ email: 'louis-seller@ttfamily.fr', executant: A }])
    && JSON.stringify(r.executants) === JSON.stringify([{ email: 'louis@ttfamily.fr', pour: [B] }]) && r.exception_vm === 0,
    `PROD. délégation sur la paire louis-seller → Amiral seule, plus d'exception machine virtuelle : ${JSON.stringify(r)}`);
}

console.log(echecs ? `\n✗ ${echecs} échec(s) sur ${total}` : `\n✓ ${total} vérifications vertes`);
process.exit(echecs ? 1 : 0);
