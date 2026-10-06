// ════════════════════════════════════════════════════════════════════════════
// BINAIRES 2.9.62 — notifications de ventes : UNE commande, tout est vérifié
// ════════════════════════════════════════════════════════════════════════════
//   npm run binaires:2.9.62
//
// À lancer quand les fichiers des blocs A et B de docs/push/CLES-NICO.md sont
// dans C:\Users\nicol\Downloads :
//
//   1. google-services.json
//        (Firebase › app Android app.fillsell.app › « Télécharger
//        google-services.json ». Si le navigateur l'a renommé
//        « google-services (1).json », le plus récent est pris.)
//   2. <projet>-firebase-adminsdk-<xxxxx>-<code>.json
//        (Firebase › Paramètres du projet › Comptes de service › « Générer
//        une nouvelle clé privée ». Le plus récent est pris.)
//   3. AuthKey_<KEYID>.p8
//        (Apple Developer › Keys › clé « FillSell Push », APNs. Le plus
//        récent daté du 06/10/2026 ou après est pris ; les anciennes clés
//        AuthKey_DYF87JYZ89 / AuthKey_W7MZC3YK99 ne sont PAS des clés APNs.
//        Pour en imposer une : --cle-apns=C:\chemin\AuthKey_XXXXXXXXXX.p8)
//
// Ce que fait le script, et il s'ARRÊTE au premier défaut en disant lequel :
//   A. le dépôt : sur main, propre, poussé, versions 2.9.62 / vc33 alignées ;
//   B. les trois fichiers : lisibles, du BON projet (app.fillsell.app, même
//      projet Firebase pour les deux JSON), clés privées importables ;
//   C. les secrets Supabase : APNS_KEY_ID, APNS_PRIVATE_KEY, APNS_TEAM_ID,
//      APNS_TOPIC, FCM_SERVICE_ACCOUNT ;
//   D. la preuve chez Apple et chez Google : la fonction push-ventes essaie
//      les vraies clés sur un jeton factice (rien n'est envoyé à personne) —
//      Apple doit répondre « BadDeviceToken » et Google « jeton invalide »,
//      ce qu'ils ne font QUE si la clé est acceptée ;
//   E. l'AAB 2.9.62 (versionCode 33) : build web, cap sync, Gradle, puis
//      contrôle du paquet (Firebase embarqué, module de notifications,
//      permission, version, bundle web du commit, signature = même clé
//      d'envoi que les AAB précédents) ; un APK d'essai à côté ;
//   F. iOS : le build Codemagic (workflow capacitor-ios, branche main) est
//      lancé et suivi jusqu'à TestFlight si un jeton d'API Codemagic est
//      fourni (C:\Users\nicol\Downloads\codemagic-token.txt ou variable
//      CODEMAGIC_API_TOKEN) ; sinon le script écrit les 3 clics.
//
// Options : --sans-ios · --sans-android · --cle-apns=<chemin du .p8>
// Les fichiers de Téléchargements ne sont ni déplacés ni effacés.
// ════════════════════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process';
import { createPrivateKey } from 'node:crypto';
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TELECHARGEMENTS = 'C:\\Users\\nicol\\Downloads';
const VERSION = '2.9.62';
const VERSION_CODE = 33;
const PAQUET = 'app.fillsell.app';
const EQUIPE_APPLE = 'BQ379Y93X3';
const DEPUIS = new Date('2026-10-06T00:00:00+02:00').getTime();
const JAVA_HOME = process.env.JAVA_HOME || 'C:\\Program Files\\Android\\Android Studio\\jbr';
const DOSSIER_AAB = path.join(RACINE, 'build', `AAB-A-TELEVERSER-${VERSION}-vc${VERSION_CODE}`);
const DOSSIER_APK = path.join(RACINE, 'build', `APK-ESSAI-${VERSION}`);
const ARGS = process.argv.slice(2);
const opt = (nom) => ARGS.find((a) => a.startsWith(`--${nom}=`))?.split('=').slice(1).join('=');
const sansIos = ARGS.includes('--sans-ios');
const sansAndroid = ARGS.includes('--sans-android');

const bilan = [];
const ok = (t) => { bilan.push(`✓ ${t}`); console.log(`  ✓ ${t}`); };
function stop(t, conseil) {
  console.log(`\n  ✗ ${t}`);
  if (conseil) console.log(`    → ${conseil}`);
  console.log('\nArrêt : rien d\'autre n\'a été fait après ce point.');
  process.exit(1);
}
const etape = (t) => console.log(`\n${t}`);
function lancer(cmd, args, { cwd = RACINE, env, muet = false, entree } = {}) {
  const r = spawnSync(cmd, args, {
    cwd, encoding: 'utf8', shell: true, env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024, input: entree,
  });
  if (!muet && r.status !== 0) console.log(String(r.stdout ?? '').slice(-3000), String(r.stderr ?? '').slice(-3000));
  return { code: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}
const git = (...a) => lancer('git', a, { muet: true }).sortie.trim();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const lireJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const plusRecent = (fichiers) => fichiers.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const dans = (re) => readdirSync(TELECHARGEMENTS).filter((n) => re.test(n)).map((n) => path.join(TELECHARGEMENTS, n));

/** Une requête SQL sur la prod (CLI liée), lignes JSON. */
function sql(requete) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'binaires-sql-'));
  const f = path.join(dossier, 'q.sql');
  writeFileSync(f, requete);
  const r = lancer('npx', ['supabase', 'db', 'query', '--linked', '-f', `"${f}"`, '-o', 'json'], { muet: true });
  rmSync(dossier, { recursive: true, force: true });
  const i = r.sortie.indexOf('{');
  try { return JSON.parse(r.sortie.slice(i)).rows ?? []; } catch { return null; }
}

console.log(`Binaires ${VERSION} (versionCode ${VERSION_CODE}) — notifications de ventes`);

// ── A. Le dépôt ─────────────────────────────────────────────────────────────
etape('A. Le dépôt');
if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') stop('la branche courante n\'est pas main.', 'git checkout main');
if (git('status', '--porcelain')) stop(`des fichiers modifiés traînent :\n${git('status', '--short')}`, 'le binaire doit sortir d\'un arbre propre (le build web refuse sinon).');
lancer('git', ['fetch', 'origin', 'main'], { muet: true });
const tete = git('rev-parse', 'HEAD');
if (tete !== git('rev-parse', 'origin/main')) stop('main n\'est pas identique à origin/main (commit non poussé, ou retard).', 'git pull --ff-only (ou pousser les commits) puis relancer.');
const court = tete.slice(0, 7);
ok(`main propre et poussé (${court})`);
const pkg = lireJson(path.join(RACINE, 'package.json'));
const gradle = readFileSync(path.join(RACINE, 'android/app/build.gradle'), 'utf8');
const codemagic = readFileSync(path.join(RACINE, 'codemagic.yaml'), 'utf8');
if (pkg?.version !== VERSION) stop(`package.json est en ${pkg?.version}, pas ${VERSION}.`);
if (!new RegExp(`versionCode ${VERSION_CODE}\\b`).test(gradle) || !gradle.includes(`versionName "${VERSION}"`)) stop(`android/app/build.gradle n'est pas en ${VERSION} / versionCode ${VERSION_CODE}.`);
if (!codemagic.includes(`agvtool new-marketing-version ${VERSION}`)) stop(`codemagic.yaml ne fige pas la version iOS ${VERSION}.`);
if (!codemagic.includes('<key>aps-environment</key>')) stop('codemagic.yaml ne pose pas aps-environment (pas de jeton iOS sans lui).');
ok(`versions alignées : package.json ${VERSION}, Android ${VERSION}/vc${VERSION_CODE}, iOS ${VERSION} (aps-environment posé)`);

// ── B. Les trois fichiers ───────────────────────────────────────────────────
etape(`B. Les fichiers dans ${TELECHARGEMENTS}`);
if (!existsSync(TELECHARGEMENTS)) stop(`dossier introuvable : ${TELECHARGEMENTS}`);

const fGs = plusRecent(dans(/^google-services( \(\d+\))?\.json$/i));
if (!fGs) stop(`google-services.json absent de ${TELECHARGEMENTS}.`, 'docs/push/CLES-NICO.md, bloc A, étape 3 (« Télécharger google-services.json »).');
const gs = lireJson(fGs);
const clientAndroid = gs?.client?.find((c) => c?.client_info?.android_client_info?.package_name === PAQUET);
const projetFirebase = gs?.project_info?.project_id;
if (!gs || !projetFirebase) stop(`${path.basename(fGs)} n'est pas un google-services.json lisible.`);
if (!clientAndroid) stop(`${path.basename(fGs)} ne déclare pas l'app Android ${PAQUET}.`, `dans Firebase, l'app Android doit avoir exactement le nom de package ${PAQUET}.`);
if (!clientAndroid?.client_info?.mobilesdk_app_id || !clientAndroid?.api_key?.[0]?.current_key) stop(`${path.basename(fGs)} est incomplet (identifiant d'app ou clé d'API manquants).`);
ok(`${path.basename(fGs)} : projet « ${projetFirebase} », app ${PAQUET} (${clientAndroid.client_info.mobilesdk_app_id})`);

const fSa = plusRecent(dans(/firebase-adminsdk.*\.json$/i));
if (!fSa) stop(`clé de compte de service Firebase (…-firebase-adminsdk-….json) absente de ${TELECHARGEMENTS}.`, 'docs/push/CLES-NICO.md, bloc A, étape 4 (« Générer une nouvelle clé privée »).');
const sa = lireJson(fSa);
if (sa?.type !== 'service_account' || !sa?.client_email || !sa?.private_key) stop(`${path.basename(fSa)} n'est pas une clé de compte de service.`);
if (sa.project_id !== projetFirebase) stop(`${path.basename(fSa)} appartient au projet « ${sa.project_id} », google-services.json au projet « ${projetFirebase} ».`, 'les deux fichiers doivent venir du MÊME projet Firebase.');
try {
  const k = createPrivateKey(sa.private_key);
  if (k.asymmetricKeyType !== 'rsa') throw new Error(k.asymmetricKeyType);
} catch (e) { stop(`la clé privée de ${path.basename(fSa)} est illisible (${e.message}).`, 'régénérer une clé privée dans Firebase.'); }
ok(`${path.basename(fSa)} : compte de service ${sa.client_email}, même projet, clé RSA lisible`);

let fP8 = opt('cle-apns');
if (fP8 && !existsSync(fP8)) stop(`--cle-apns : fichier introuvable : ${fP8}`);
if (!fP8) {
  const recents = dans(/^AuthKey_[A-Z0-9]{10}( \(\d+\))?\.p8$/).filter((f) => statSync(f).mtimeMs >= DEPUIS);
  if (!recents.length) {
    const tous = dans(/^AuthKey_.*\.p8$/).map((f) => `${path.basename(f)} (${new Date(statSync(f).mtimeMs).toLocaleDateString('fr-FR')})`);
    stop(`aucune clé AuthKey_XXXXXXXXXX.p8 téléchargée depuis le 06/10 dans ${TELECHARGEMENTS}${tous.length ? ` (présentes, plus anciennes : ${tous.join(', ')})` : ''}.`,
      'docs/push/CLES-NICO.md, bloc B, étape 3 ; pour réutiliser une clé APNs plus ancienne : --cle-apns=<chemin>.');
  }
  if (recents.length > 1) stop(`plusieurs clés AuthKey récentes : ${recents.map((f) => path.basename(f)).join(', ')}.`, 'indiquer la bonne : --cle-apns=<chemin>.');
  fP8 = recents[0];
}
const keyId = path.basename(fP8).match(/^AuthKey_([A-Z0-9]{10})/)?.[1];
if (!keyId) stop(`${path.basename(fP8)} : le Key ID (10 caractères) ne se lit pas dans le nom du fichier.`, 'garder le nom donné par Apple : AuthKey_XXXXXXXXXX.p8.');
const p8 = readFileSync(fP8, 'utf8').trim();
try {
  const k = createPrivateKey(p8);
  if (k.asymmetricKeyType !== 'ec' || k.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error(`${k.asymmetricKeyType} ${k.asymmetricKeyDetails?.namedCurve ?? ''}`);
} catch (e) { stop(`${path.basename(fP8)} n'est pas une clé Apple .p8 lisible (${e.message}).`); }
ok(`${path.basename(fP8)} : clé Apple P-256 lisible, Key ID ${keyId}, équipe ${EQUIPE_APPLE}`);

// ── C. Les secrets ──────────────────────────────────────────────────────────
etape('C. Les secrets Supabase');
{
  const dossier = mkdtempSync(path.join(tmpdir(), 'binaires-secrets-'));
  const f = path.join(dossier, 'push.env');
  // Valeurs entre apostrophes : lues telles quelles (aucun échappement). Les
  // sauts de ligne de la clé .p8 deviennent « \n », que push-ventes relit.
  writeFileSync(f, [
    `APNS_KEY_ID='${keyId}'`,
    `APNS_TEAM_ID='${EQUIPE_APPLE}'`,
    `APNS_TOPIC='${PAQUET}'`,
    `APNS_PRIVATE_KEY='${p8.replace(/\r?\n/g, '\\n')}'`,
    `FCM_SERVICE_ACCOUNT='${JSON.stringify(sa)}'`,
  ].join('\n') + '\n');
  const r = lancer('npx', ['supabase', 'secrets', 'set', '--env-file', `"${f}"`], { muet: true });
  rmSync(dossier, { recursive: true, force: true });
  if (r.code !== 0) stop(`supabase secrets set a échoué :\n${r.sortie.slice(-800)}`);
  const liste = lancer('npx', ['supabase', 'secrets', 'list'], { muet: true }).sortie;
  const manquants = ['APNS_KEY_ID', 'APNS_PRIVATE_KEY', 'APNS_TEAM_ID', 'APNS_TOPIC', 'FCM_SERVICE_ACCOUNT'].filter((n) => !liste.includes(n));
  if (manquants.length) stop(`secrets absents après pose : ${manquants.join(', ')}`);
  ok('APNS_KEY_ID, APNS_PRIVATE_KEY, APNS_TEAM_ID, APNS_TOPIC, FCM_SERVICE_ACCOUNT posés');
}

// ── D. La preuve chez Apple et chez Google ──────────────────────────────────
etape('D. Les clés éprouvées chez Apple et chez Google (jeton factice, rien n\'est envoyé)');
{
  let diag = null;
  for (let essai = 1; essai <= 4 && !diag?.apns?.cle_acceptee; essai++) {
    await dormir(essai === 1 ? 6000 : 10000); // le temps que les fonctions relisent les secrets
    const id = sql(`select net.http_post(url := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/push-ventes',
      headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
      body := '{"diagnostic":"cles"}'::jsonb, timeout_milliseconds := 40000) as id;`)?.[0]?.id;
    if (!id) continue;
    for (let i = 0; i < 12; i++) {
      await dormir(2500);
      const rep = sql(`select status_code, content from net._http_response where id = ${Number(id)};`)?.[0];
      if (rep?.status_code) { try { diag = JSON.parse(rep.content); } catch { diag = { brut: rep.content }; } break; }
    }
    if (diag && !diag.apns?.cle_acceptee && diag.apns?.motif !== 'apns_non_configure') break;
  }
  if (!diag?.apns) stop(`la fonction push-ventes n'a pas répondu au diagnostic (${JSON.stringify(diag)?.slice(0, 300)}).`);
  if (!diag.apns.cle_acceptee) {
    stop(`Apple REFUSE la clé ${keyId} : ${diag.apns.motif ?? diag.apns.etat}.`,
      /InvalidProviderToken|Forbidden/i.test(diag.apns.motif ?? '')
        ? 'la clé n\'a pas le service « Apple Push Notifications service (APNs) », ou le Key ID ne correspond pas : refaire le bloc B, étape 3.'
        : 'relancer dans une minute ; si ça persiste, refaire le bloc B, étape 3.');
  }
  ok(`Apple accepte la clé ${keyId} (réponse sur jeton factice : ${diag.apns.motif})`);
  if (!diag.fcm?.cle_acceptee) {
    stop(`Google REFUSE l'envoi pour le projet « ${diag.fcm?.projet} » : ${diag.fcm?.motif ?? diag.fcm?.etat}.`,
      /SERVICE_DISABLED|has not been used|PERMISSION_DENIED|403/i.test(diag.fcm?.motif ?? '')
        ? 'Firebase › Paramètres du projet › Cloud Messaging : activer « API Firebase Cloud Messaging (V1) », puis relancer.'
        : 'vérifier la clé du compte de service (bloc A, étape 4), puis relancer.');
  }
  ok(`Google accepte le compte de service du projet « ${diag.fcm.projet} » (réponse sur jeton factice : ${diag.fcm.motif})`);
}

// ── E. L'AAB ────────────────────────────────────────────────────────────────
let aabFinal = null;
let apkFinal = null;
if (!sansAndroid) {
  etape(`E. L'AAB Android ${VERSION} (versionCode ${VERSION_CODE})`);
  const cible = path.join(RACINE, 'android/app/google-services.json');
  copyFileSync(fGs, cible);
  if (lancer('git', ['check-ignore', '-q', 'android/app/google-services.json'], { muet: true }).code !== 0) stop('android/app/google-services.json n\'est pas ignoré par git.');
  ok('google-services.json posé dans android/app/ (ignoré par git)');

  if (lancer('npm', ['run', 'build']).code !== 0) stop('le build web a échoué (voir ci-dessus).');
  const empreinte = lireJson(path.join(RACINE, 'dist/build.json'))?.build ?? '';
  if (!empreinte.endsWith(`+${court}`)) stop(`le bundle web ne porte pas le commit ${court} (empreinte « ${empreinte} »).`);
  ok(`bundle web ${empreinte}`);
  if (lancer('npx', ['cap', 'sync', 'android']).code !== 0) stop('npx cap sync android a échoué.');
  if (git('status', '--porcelain')) stop(`cap sync a modifié des fichiers suivis :\n${git('status', '--short')}`, 'les commiter (et pousser) puis relancer.');
  ok('cap sync android : projet natif à jour, arbre toujours propre');

  const env = { JAVA_HOME };
  if (lancer('gradlew.bat', ['clean', 'bundleRelease', 'assembleRelease', '--console=plain'], { cwd: path.join(RACINE, 'android'), env }).code !== 0) stop('Gradle a échoué (voir ci-dessus).');
  const aab = path.join(RACINE, 'android/app/build/outputs/bundle/release/app-release.aab');
  const apk = path.join(RACINE, 'android/app/build/outputs/apk/release/app-release.apk');
  if (!existsSync(aab)) stop(`AAB introuvable : ${aab}`);
  ok(`Gradle : ${(statSync(aab).size / 1e6).toFixed(1)} Mo`);

  // Contrôle du paquet, entrée par entrée.
  const jar = path.join(JAVA_HOME, 'bin', 'jar.exe');
  const entrees = lancer(`"${jar}"`, ['tf', `"${aab}"`], { muet: true }).sortie;
  const tmp = mkdtempSync(path.join(tmpdir(), 'binaires-aab-'));
  lancer(`"${jar}"`, ['xf', `"${aab}"`, 'base/resources.pb', 'base/assets/public/build.json', 'base/manifest/AndroidManifest.xml'], { cwd: tmp, muet: true });
  const resources = existsSync(path.join(tmp, 'base/resources.pb')) ? readFileSync(path.join(tmp, 'base/resources.pb')).toString('latin1') : '';
  const manifesteAab = existsSync(path.join(tmp, 'base/manifest/AndroidManifest.xml')) ? readFileSync(path.join(tmp, 'base/manifest/AndroidManifest.xml')).toString('latin1') : '';
  const embarque = lireJson(path.join(tmp, 'base/assets/public/build.json'))?.build ?? '';
  const dexs = entrees.split(/\r?\n/).filter((e) => /^base\/dex\/classes\d*\.dex$/.test(e));
  lancer(`"${jar}"`, ['xf', `"${aab}"`, ...dexs], { cwd: tmp, muet: true });
  const dexTexte = dexs.map((d) => existsSync(path.join(tmp, d)) ? readFileSync(path.join(tmp, d)).toString('latin1') : '').join('');
  rmSync(tmp, { recursive: true, force: true });
  if (!resources.includes('google_app_id') || !resources.includes(clientAndroid.client_info.mobilesdk_app_id)) stop('l\'AAB n\'embarque PAS la configuration Firebase (google_app_id).', 'google-services.json n\'a pas été appliqué par Gradle.');
  ok(`Firebase embarqué (google_app_id = ${clientAndroid.client_info.mobilesdk_app_id})`);
  if (!dexTexte.includes('com/capacitorjs/plugins/pushnotifications/PushNotificationsPlugin')) stop('le module de notifications n\'est pas dans l\'AAB.');
  ok('module @capacitor/push-notifications présent (PushNotificationsPlugin, MessagingService)');
  if (!manifesteAab.includes('android.permission.POST_NOTIFICATIONS') || !manifesteAab.includes('com.capacitorjs.plugins.pushnotifications.MessagingService')) stop('le manifeste de l\'AAB n\'a pas la permission ou le service de notifications.');
  if (!manifesteAab.includes('ic_stat_fillsell') && !resources.includes('ic_stat_fillsell')) stop('l\'icône de notification ic_stat_fillsell manque.');
  ok('manifeste : POST_NOTIFICATIONS, service FCM, icône de notification');
  const fusionne = path.join(RACINE, 'android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml');
  const fusionneAlt = path.join(RACINE, 'android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml');
  const texteManifeste = [fusionne, fusionneAlt].filter(existsSync).map((f) => readFileSync(f, 'utf8')).join('');
  if (texteManifeste && (!texteManifeste.includes(`android:versionCode="${VERSION_CODE}"`) || !texteManifeste.includes(`android:versionName="${VERSION}"`))) stop(`le manifeste fusionné n'est pas en ${VERSION} / ${VERSION_CODE}.`);
  ok(`version ${VERSION} / versionCode ${VERSION_CODE}`);
  if (embarque !== empreinte) stop(`le bundle web DANS l'AAB (« ${embarque} ») n'est pas celui du build (« ${empreinte} »).`);
  ok(`bundle web embarqué = ${embarque}`);

  // Signature : la même clé d'envoi que le dernier AAB livré.
  const keytool = path.join(JAVA_HOME, 'bin', 'keytool.exe');
  // -J-Duser.language=en : sans lui, un Windows français écrit « SHA 256: ».
  const empreinteCert = (f) => lancer(`"${keytool}"`, ['-J-Duser.language=en', '-printcert', '-jarfile', `"${f}"`], { muet: true })
    .sortie.match(/SHA\s?256:\s*([0-9A-F:]+)/)?.[1] ?? null;
  const certNeuf = empreinteCert(aab);
  if (!certNeuf) stop('l\'AAB n\'est pas signé.', 'android/local.properties doit porter le mot de passe du keystore.');
  const precedents = [path.join(RACINE, 'build/AAB-A-TELEVERSER-2.9.38-vc32'), path.join(RACINE, 'build/AAB-PERIMES')]
    .filter(existsSync).flatMap((d) => readdirSync(d, { recursive: true }).map((n) => path.join(d, String(n))))
    .filter((f) => f.endsWith('.aab') && /2\.9\.38/.test(f));
  const certAncien = precedents.length ? empreinteCert(precedents[0]) : null;
  if (certAncien && certAncien !== certNeuf) stop(`signature DIFFÉRENTE du dernier AAB 2.9.38 (${certAncien.slice(0, 23)}… ≠ ${certNeuf.slice(0, 23)}…).`, 'Play refuserait le paquet : mauvais keystore.');
  ok(`signé par la clé d'envoi habituelle (SHA-256 ${certNeuf.slice(0, 23)}…)${certAncien ? ', identique au 2.9.38' : ''}`);

  // Livraison : un seul fichier dans son dossier ; l'ancien dossier passe aux périmés.
  const ancien = path.join(RACINE, 'build/AAB-A-TELEVERSER-2.9.38-vc32');
  if (existsSync(ancien)) {
    mkdirSync(path.join(RACINE, 'build/AAB-PERIMES'), { recursive: true });
    const dest = path.join(RACINE, `build/AAB-PERIMES/AAB-2.9.38-vc32-remplace-par-${VERSION}-vc${VERSION_CODE}`);
    if (!existsSync(dest)) renameSync(ancien, dest);
    ok('l\'ancien dossier AAB-A-TELEVERSER-2.9.38-vc32 est rangé dans build/AAB-PERIMES (remplacé par celui-ci)');
  }
  if (existsSync(DOSSIER_AAB)) rmSync(DOSSIER_AAB, { recursive: true, force: true });
  mkdirSync(DOSSIER_AAB, { recursive: true });
  aabFinal = path.join(DOSSIER_AAB, `fillsell-android-${VERSION}-versionCode${VERSION_CODE}-${court}.aab`);
  copyFileSync(aab, aabFinal);
  if (readdirSync(DOSSIER_AAB).length !== 1) stop(`${DOSSIER_AAB} contient autre chose que l'AAB.`);
  ok(`AAB livré : ${aabFinal}`);
  if (existsSync(apk)) {
    if (existsSync(DOSSIER_APK)) rmSync(DOSSIER_APK, { recursive: true, force: true });
    mkdirSync(DOSSIER_APK, { recursive: true });
    apkFinal = path.join(DOSSIER_APK, `fillsell-${VERSION}-ESSAI-telephone-Android-PAS-pour-Play.apk`);
    copyFileSync(apk, apkFinal);
    ok(`APK d'essai (à installer à la main sur un Android, jamais sur Play) : ${apkFinal}`);
  }
}

// ── F. iOS ──────────────────────────────────────────────────────────────────
let ios = 'non lancé (--sans-ios)';
if (!sansIos) {
  etape(`F. iOS ${VERSION} (Codemagic → TestFlight)`);
  const fJeton = path.join(TELECHARGEMENTS, 'codemagic-token.txt');
  const jeton = process.env.CODEMAGIC_API_TOKEN || (existsSync(fJeton) ? readFileSync(fJeton, 'utf8').trim() : '');
  const clics = [
    'Pré-requis (bloc B, étapes 1 et 2) : Push Notifications coché sur app.fillsell.app, profil « FillSell AppStore » régénéré.',
    'Codemagic → app FillSell → Start new build → workflow « Capacitor iOS Build », branche main → Start (~25 min → TestFlight).',
    `App Store Connect → FillSell → + Version ${VERSION} → choisir le build → Ajouter pour examen → Envoyer pour examen.`,
  ];
  if (!jeton) {
    ios = 'à lancer dans Codemagic (3 clics ci-dessous)';
    console.log(`  · Pas de jeton d'API Codemagic (${fJeton}) : le build iOS se lance à la main.`);
    clics.forEach((c, i) => console.log(`    ${i + 1}. ${c}`));
  } else {
    const api = async (chemin, init = {}) => {
      const r = await fetch(`https://api.codemagic.io${chemin}`, { ...init, headers: { 'x-auth-token': jeton, 'content-type': 'application/json', ...(init.headers ?? {}) } });
      const t = await r.text();
      let j = null; try { j = JSON.parse(t); } catch { /* texte */ }
      return { ok: r.ok, statut: r.status, j, t };
    };
    const apps = await api('/apps');
    if (!apps.ok) stop(`Codemagic refuse le jeton (HTTP ${apps.statut}).`, `recopier le jeton (Codemagic › Teams › Personal Account › Integrations › Codemagic API) dans ${fJeton}.`);
    const app = (apps.j?.applications ?? []).find((a) => /fill-?and-?sell|fillsell/i.test(`${a.appName} ${a.repository?.htmlUrl ?? ''}`));
    if (!app) stop('aucune app FillSell dans Codemagic avec ce jeton.');
    const b = await api('/builds', { method: 'POST', body: JSON.stringify({ appId: app._id, workflowId: 'capacitor-ios', branch: 'main' }) });
    if (!b.ok || !b.j?.buildId) stop(`Codemagic n'a pas lancé le build (HTTP ${b.statut}) : ${b.t.slice(0, 300)}`);
    const url = `https://codemagic.io/app/${app._id}/build/${b.j.buildId}`;
    ok(`build iOS lancé : ${url}`);
    console.log('  · Suivi jusqu\'à la fin (≈ 25 min, une lecture par minute)…');
    let statut = 'queued';
    for (let i = 0; i < 60 && !['finished', 'failed', 'canceled', 'timeout', 'skipped'].includes(statut); i++) {
      await dormir(60_000);
      const s = await api(`/builds/${b.j.buildId}`);
      statut = s.j?.build?.status ?? statut;
      process.stdout.write(`    ${new Date().toLocaleTimeString('fr-FR')} ${statut}\n`);
    }
    if (statut !== 'finished') {
      stop(`build iOS « ${statut} » : ${url}`,
        'cause la plus probable : Push Notifications pas coché sur app.fillsell.app, ou profil « FillSell AppStore » pas régénéré (bloc B, étapes 1-2). Corriger puis relancer : npm run binaires:2.9.62 -- --sans-android');
    }
    ios = `build Codemagic fini et envoyé à TestFlight (${url}) — reste : App Store Connect › + Version ${VERSION} › build › Envoyer pour examen`;
    ok(ios);
  }
}

// ── Bilan ───────────────────────────────────────────────────────────────────
console.log('\n════════ BILAN ════════');
console.log(`Commit                : ${court} (main, poussé)`);
console.log('Clés                  : posées en secrets ET acceptées par Apple et Google');
if (aabFinal) console.log(`Android à téléverser  : ${aabFinal}\n                        (Play Console › Production › Créer une release)`);
if (apkFinal) console.log(`APK d'essai           : ${apkFinal}`);
console.log(`iOS                   : ${ios}`);
console.log('Test de ce soir       : docs/push/CLES-NICO.md, bloc D (npm run push:essai une fois le téléphone enregistré)');
