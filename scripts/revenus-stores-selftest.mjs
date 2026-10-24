// ═══════════════════════════════════════════════════════════════════════════
// REVENUS (25/10, point 4) : L'ÉCHÉANCE DES ABONNÉS APPLE, CHAQUE APPEL GOOGLE JOURNALISÉ
// `npm run selftest:revenus-stores` (PROPOSÉ : scripts/revenus-stores-selftest.mjs)
// ═══════════════════════════════════════════════════════════════════════════
//   1. finPeriodeAEcrire : jamais en arrière, une date passée ou illisible (Stripe « jj/mm/aaaa ») se remplace ;
//   2. l'enveloppe Pub/Sub, l'empreinte du jeton (sha256), l'issue d'un appel lue sur la réponse ;
//   3. ligneJournal : connu NULL sans décision, compléments rangés dans leurs colonnes, compte = uuid ou rien ;
//   4. google-play-webhook : une ligne AVANT tout décodage (illisible compris), l'issue à la sortie, le jeton OIDC
//      vérifié (observer / exiger), aucun jeton d'achat en clair dans les journaux de la fonction ;
//   5. apple-iap-webhook / validate-apple-receipt : l'échéance écrite à chaque « on » et à chaque validation ;
//   6. la migration porte toutes les colonnes que le code écrit, et ferme la table aux clients.
// RACINE_REVENUS=<dossier> : relire une copie de travail au lieu du dépôt (fonctions sous <dossier>/functions,
// migration sous <dossier>/migration).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEPOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COPIE = process.env.RACINE_REVENUS ?? null;
const fonctions = COPIE ? join(COPIE, 'functions') : join(DEPOT, 'supabase/functions');
const dossierMig = COPIE ? join(COPIE, 'migration') : join(DEPOT, 'supabase/migrations');
const lire = (f) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const S = await import(pathToFileURL(join(fonctions, '_shared/notifications-stores.js')).href);

let ok = 0, ko = 0;
const verifier = (c, quoi, detail = '') => { if (c) { ok++; console.log(`  ✓ ${quoi}`); } else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${detail}` : ''}`); } };

console.log('1. finPeriodeAEcrire — jamais en arrière');
const T0 = Date.parse('2026-10-25T00:00:00Z');
const ms = Date.parse('2026-11-14T16:52:57Z');
verifier(S.finPeriodeAEcrire(ms, null, T0) === '2026-11-14T16:52:57.000Z', 'aucune date en base → expiresDate (ms) écrite en ISO');
verifier(S.finPeriodeAEcrire(ms, '2026-10-14T16:52:57.000Z', T0) === '2026-11-14T16:52:57.000Z', 'renouvellement : plus tardive → écrite');
verifier(S.finPeriodeAEcrire(Date.parse('2026-11-10T00:00:00Z'), '2026-11-24T15:50:41.000Z', T0) === null, 'notification rejouée en retard (plus ancienne, base à venir) → rien');
verifier(S.finPeriodeAEcrire(Date.parse('2026-10-20T00:00:00Z'), '2026-10-10T00:00:00.000Z', T0) === '2026-10-20T00:00:00.000Z', 'date en base déjà passée → remplacée');
verifier(S.finPeriodeAEcrire(ms, '30/09/2026', T0) === '2026-11-14T16:52:57.000Z', 'format Stripe « jj/mm/aaaa » (illisible) → remplacé');
verifier(S.finPeriodeAEcrire('2026-11-02T01:15:30.111Z', null, T0) === '2026-11-02T01:15:30.111Z', 'expiryTime Google (ISO) → tel quel');
verifier(S.finPeriodeAEcrire(undefined, null, T0) === null && S.finPeriodeAEcrire('n’importe quoi', null, T0) === null, 'échéance illisible → rien');

console.log('\n2. Enveloppe Pub/Sub, empreinte, issue');
const env = S.lireEnveloppePubSub({ message: { data: 'eyJ9', messageId: '1234567890', publishTime: '2026-10-25T10:00:00.123Z', attributes: { a: '1' } }, subscription: 'projects/p/subscriptions/s' });
verifier(env.dataB64 === 'eyJ9' && env.messageId === '1234567890' && env.publieLe === '2026-10-25T10:00:00.123Z' && env.abonnement === 'projects/p/subscriptions/s' && env.attributs?.a === '1', 'messageId, publishTime, abonnement, attributs lus');
verifier(S.lireEnveloppePubSub({ message: { data: 'x', message_id: '9', publish_time: '2026-10-25T10:00:00Z' } }).messageId === '9', 'variante message_id / publish_time');
verifier(S.lireEnveloppePubSub(null).dataB64 === null && S.lireEnveloppePubSub({}).dataB64 === null && S.lireEnveloppePubSub({ message: { data: '' } }).dataB64 === null, 'corps sans message.data → dataB64 null (la ligne s’écrit quand même)');
verifier(await S.empreinteJeton('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'empreinte = sha256 hex (vecteur connu « abc »)');
verifier(await S.empreinteJeton(null) === null && await S.empreinteJeton('') === null, 'pas de jeton → pas d’empreinte');
verifier(S.isoOuNull('1791163571064') === new Date(1791163571064).toISOString(), 'eventTimeMillis (texte, ms) → ISO');
const i1 = S.issueDeLaReponse(200, '{"ok":true}'), i2 = S.issueDeLaReponse(200, '{"ok":true,"skipped":"no message data"}');
const i3 = S.issueDeLaReponse(401, '{"error":"unauthorized"}'), i4 = S.issueDeLaReponse(500, '{"error":"Publisher API failed"}');
verifier(i1.motif === 'traite' && i1.http_status === 200 && !!i1.termine_le, '200 → traite');
verifier(i2.motif === 'ignore:no message data' && i3.motif === 'rejet:unauthorized' && i4.motif === 'erreur:Publisher API failed', 'ignore / rejet / erreur, avec la raison rendue au store');

console.log('\n3. La ligne du journal');
const l0 = S.ligneJournal({ canal: 'google', type: 'illisible', decision: null, complements: { appel_id: 'a', verification: 'oidc_absent' } });
verifier(l0.connu === null && l0.appel_id === 'a' && l0.verification === 'oidc_absent', 'sans décision → connu NULL ; compléments dans leurs colonnes');
const l1 = S.ligneJournal({ canal: 'apple', type: 'DID_RENEW', decision: { effet: 'on', connu: true }, userId: 'pas-un-uuid' });
verifier(l1.connu === true && l1.effet === 'on' && l1.user_id === null, 'décision lue → connu true ; un compte qui n’est pas un uuid → null');
verifier(S.ligneJournal({ canal: 'apple', type: 'X', decision: { effet: null, connu: false } }).connu === false, 'inconnue → connu false (comme avant)');

console.log('\n4. google-play-webhook');
const gw = lire(join(fonctions, 'google-play-webhook/index.ts'));
const iServe = gw.indexOf('serve(async (req)');
const corpsServe = gw.slice(iServe, gw.indexOf('async function traiter('));
verifier(/const ctx: Contexte = \{ appelId: crypto\.randomUUID\(\)/.test(corpsServe) && /await completerJournalStore\(supabaseAdmin, ctx\.appelId, \{ \.\.\.ctx\.maj, \.\.\.issueDeLaReponse\(res\.status, texte\) \}\)/.test(corpsServe), 'chaque appel : un appel_id, l’issue complétée à la sortie (code HTTP, motif)');
const iIllisible = gw.indexOf('type: "illisible"');
verifier(iIllisible > 0 && iIllisible < gw.indexOf('const { packageName, subscriptionNotification } = notification;'), 'un appel illisible / sans message.data / refusé laisse sa ligne AVANT tout traitement');
verifier(/return json\(200, \{ ok: true, skipped: "no message data" \}\)/.test(gw) && /return json\(500, \{ error: illisible \}\)/.test(gw), 'comportements d’avant gardés : sans données → 200, illisible → 500');
verifier(/verifierJetonPubSub\(req\.headers\.get\("authorization"\)/.test(gw) && /MODE_AUTH === "exiger" && !verif\.ok\) return json\(401/.test(gw), 'jeton OIDC vérifié ; refusé seulement en mode « exiger »');
verifier(gw.indexOf('MODE_AUTH === "exiger" && !verif.ok) return json(401', gw.indexOf('ligneJournal({\n        canal: "google", type: typeJ')) > 0
  && gw.indexOf('MODE_AUTH === "exiger" && !verif.ok) return json(401', gw.indexOf('ligneJournal({\n        canal: "google", type: typeJ')) < gw.indexOf('if (!decisionJ.connu) {'), 'un jeton refusé : ligne écrite, puis 401 AVANT toute alerte « inconnue »');
verifier(/ctx\.maj\.fin_periode = isoOuNull\(ligneJ\?\.expiryTime\)/.test(gw) && /ctx\.maj\.etat_store/.test(gw) && /ctx\.maj\.user_id = uuidOuNull\(userId\)/.test(gw), 'expiryTime, état et compte lus chez Google → au journal de l’appel');
verifier(!/JSON\.stringify\((otp|notification|purchase|\{ notificationType, subscriptionId, purchase \})\)/.test(gw), 'aucun objet porteur de purchaseToken loggé en clair (sansJeton)');
verifier(/if \(!decisionJ\.connu\) \{\s*\n\s*await signalerNotificationStoreInconnue/.test(gw) && /journaliserNotificationStore\(supabaseAdmin, ligneJournal\(/.test(gw), 'selftest achats-store-issue : formes relues inchangées');

console.log('\n5. Apple : l’échéance à chaque « on » et à chaque validation');
const wh = lire(join(fonctions, 'apple-iap-webhook/index.ts'));
const blocOn = wh.slice(wh.indexOf('const update: Record<string, unknown> = { is_premium: isPremium };'), wh.indexOf('const { error } = await supabaseAdmin\n      .from("profiles")'));
verifier(/finPeriodeAEcrire\(tx\.expiresDate, profFin\?\.subscription_period_end \?\? null\)/.test(blocOn) && /update\.subscription_period_end = fin/.test(blocOn), 'ON : expiresDate VÉRIFIÉ → subscription_period_end (jamais en arrière)');
verifier(/renouv\.autoRenewStatus === 0\) update\.subscription_cancel_at_period_end = true/.test(blocOn), 'ON : renouvellement auto coupé (signedRenewalInfo vérifié) → reste résilié');
verifier(/fin_periode: isoOuNull\(signedTransactionInfo \? txJ\.expiresDate : null\) \?\? isoOuNull\(renJ\.renewalDate\)/.test(wh) && /renouvellement_auto: renJ\.autoRenewStatus === 1/.test(wh), 'journal : échéance et renouvellement auto à CHAQUE notification');
verifier(/verification: "jws_refuse"/.test(wh) && /verification: "jws_absent"/.test(wh), 'signature refusée / signedPayload absent : la ligne est écrite (403 / 400 inchangés)');
const var_ = lire(join(fonctions, 'validate-apple-receipt/index.ts'));
verifier(/update\.subscription_period_end = fin/.test(var_) && /pending_renewal_info/.test(var_), 'validate-apple-receipt : échéance + renouvellement auto du reçu');

console.log('\n6. La migration');
const migs = readdirSync(dossierMig).filter((f) => /journal_stores_appels_et_echeances\.sql$/.test(f));
verifier(migs.length === 1, 'migration journal_stores_appels_et_echeances présente', migs.join(','));
if (migs.length === 1) {
  const m = lire(join(dossierMig, migs[0]));
  const ecrites = new Set([...gw.matchAll(/\b(appel_id|message_id|publie_le|evenement_le|abonnement_pubsub|package_name|type_store|jeton_empreinte|test|verification|motif|http_status|termine_le|fin_periode|renouvellement_auto|etat_store|environnement):/g)].map((x) => x[1]));
  for (const c of ['http_status', 'motif', 'termine_le']) ecrites.add(c);
  const manquantes = [...ecrites].filter((c) => !new RegExp(`ADD COLUMN IF NOT EXISTS ${c}\\b`).test(m));
  verifier(manquantes.length === 0, `toutes les colonnes écrites existent (${ecrites.size})`, manquantes.join(','));
  verifier(/ALTER COLUMN connu DROP NOT NULL/.test(m), 'connu NULLABLE (appel sans décision)');
  verifier(/REVOKE ALL ON TABLE public\.stores_notifications_journal FROM anon, authenticated;/.test(m) && /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.stores_notifications_journal TO service_role;/.test(m), 'droits : serveur seulement (régime du 30/10)');
}
const oidc = lire(join(fonctions, '_shared/pubsub-oidc.ts'));
verifier(!/from\s+["']https?:/.test(oidc) && /compte_non_configure/.test(oidc), 'pubsub-oidc : aucun import distant ; sans compte de service attendu, jamais « ok »');

console.log(`\n${ko ? `✗ ${ko} échec(s)` : '✓ tout est vert'} — ${ok} contrôles`);
process.exit(ko ? 1 : 0);
