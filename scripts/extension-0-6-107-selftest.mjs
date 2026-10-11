// ═══════════════════════════════════════════════════════════════════════════
// EXTENSION 0.6.107 — PLUS RIEN EN SILENCE, PLUS RIEN SUR OPLA (11/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Ce test échoue si :
//   A3  · l'invariant « une seule annonce hors ligne » (Vinted ET Leboncoin /
//         Beebs / Depop) redevient un « skipped » MUET : il doit écrire le job
//         pending, retenue_hors_ligne {job, titre, depuis}, une attente de
//         30 min et une phrase vraie — et get-pending-jobs ne doit pas mettre
//         de côté une tâche ainsi retenue (tacheAMettreDeCote) ;
//       · /selling-restriction retombe dans le générique « rien à faire » :
//         motif dédié (sellingRestriction), pending, recul long, jamais
//         needs_user ni « Republier maintenant », texte selon que l'annonce
//         est encore en ligne ou déjà retirée ; /listing-restriction inchangé ;
//       · la sonde de capture Vinted n'est plus bornée (90 s, worker éveillé),
//         ou un dépassement n'est plus écrit (2 reprises espacées, puis arrêt
//         dit) ; une capture qui répond doit sortir à l'identique ;
//   A2  · après la sortie d'Opla, ce poste relève, sonde, relit ou traite
//         encore Opla (alarme, veilleur, bouton, ventes, sessions, veilleur de
//         ventes, jobs, ré-armement à l'octroi) ; ou le popup montre encore la
//         ligne « Autoriser Opla » ; ou une autre plateforme est touchée ;
//       · le manifeste n'est pas en 0.6.107.
//
//   npm run selftest:extension-0-6-107
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8').split('\r\n').join('\n');
let ko = 0;
const ok = (c, quoi, detail = '') => { if (!c) { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${detail}` : ''}`); } else console.log(`  ✓ ${quoi}`); };
const b = lire('chrome-extension/background.js');
const v = lire('chrome-extension/content-scripts/vinted.js');
const p = lire('chrome-extension/popup.js');

// Corps d'une fonction (accolades équilibrées), pour l'exécuter à part.
function fonction(src, nom) {
  const m = src.match(new RegExp(`(?:async )?function ${nom}\\(`));
  if (!m) return '';
  let i = src.indexOf('{', m.index + m[0].length - 1);
  // saute la liste de paramètres (déstructuration éventuelle)
  let prof = 0; let j = m.index + m[0].length - 1;
  for (; j < src.length; j++) { if (src[j] === '(') prof++; else if (src[j] === ')') { prof--; if (!prof) break; } }
  i = src.indexOf('{', j);
  prof = 0;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (!prof) return src.slice(m.index, k + 1); }
  }
  return '';
}
const entre = (src, debut, fin) => { const i = src.indexOf(debut); const j = src.indexOf(fin, i + debut.length); return i < 0 || j < 0 ? '' : src.slice(i, j); };

// ── A3.1 — LA RETENUE EST ÉCRITE ───────────────────────────────────────────
console.log('A3.1 La republication retenue derrière une annonce hors ligne le dit');
const retenir = fonction(b, 'retenirDerriereAnnonceHorsLigne');
ok(retenir.length > 0, 'retenirDerriereAnnonceHorsLigne existe');
{
  const ecrits = [];
  const f = new Function('updateJobStatus', `${retenir}; return retenirDerriereAnnonceHorsLigne;`)(
    async (tok, id, statut, extra) => { ecrits.push({ id, statut, extra }); });
  const pf = { republish_step: 'captured', needs_user_source: 'x' };
  const avant = Date.now();
  const msg = await f('jeton', { id: 'J1' }, pf, { id: 'F1', title: 'Cendrier / Vide-poche Lourdes' });
  ok(ecrits.length === 1 && ecrits[0].statut === 'pending', 'UNE écriture, statut pending (jamais needs_user)', JSON.stringify(ecrits));
  const e = ecrits[0]?.extra ?? {};
  ok(e.platform_fields?.retenue_hors_ligne?.job === 'F1' && e.platform_fields.retenue_hors_ligne.titre === 'Cendrier / Vide-poche Lourdes'
    && !!e.platform_fields.retenue_hors_ligne.depuis, 'retenue_hors_ligne {job, titre, depuis}');
  const naa = Date.parse(e.platform_fields?.next_action_after ?? '');
  ok(naa - avant >= 29 * 60_000 && naa - avant <= 31 * 60_000, 'attente programmée de 30 min (next_action_after)');
  ok(!('needs_user_source' in (e.platform_fields ?? {})), 'aucune source needs_user laissée');
  ok(/^En attente : ton annonce « Cendrier \/ Vide-poche Lourdes » a été retirée et n'est pas encore revenue en ligne\. Les autres republications attendent sa remise en ligne, pour ne jamais laisser deux annonces hors ligne\. Rien n'a été retiré\.$/.test(e.error ?? ''),
    'phrase vraie, titre du frère', e.error);
  ok(msg === e.error, 'la phrase est aussi rendue au cycle');
  // Même frère au passage suivant : « depuis » gardé ; sans titre : « ton annonce retirée ».
  const depuis = e.platform_fields.retenue_hors_ligne.depuis;
  ecrits.length = 0;
  await f('jeton', { id: 'J1' }, { ...e.platform_fields }, { id: 'F1', title: 'Cendrier / Vide-poche Lourdes' });
  ok(ecrits[0]?.extra?.platform_fields?.retenue_hors_ligne?.depuis === depuis, 'même frère : « depuis » conservé');
  ecrits.length = 0;
  await f('jeton', { id: 'J2' }, {}, { id: 'F2' });
  ok(/ton annonce retirée a été retirée|^En attente : ton annonce retirée/.test(ecrits[0]?.extra?.error ?? ''), 'sans titre : « ton annonce retirée »');
}
const invVinted = entre(b, '&platform=eq.vinted&id=neq.${job.id}&status=in.(pending,processing)', 'invariant hors-ligne invérifiable (${e?.message ?? e}) — suppression reportée par prudence');
ok(/select=id,title&limit=1/.test(invVinted) && /await retenirDerriereAnnonceHorsLigne\(accessToken, job, pf, horsLigne\[0\]\)/.test(invVinted),
  'Vinted (étape captured) : le frère est lu avec son titre, la retenue est écrite');
ok(!/return \{ status: "skipped", error: "une annonce est déjà hors ligne/.test(b), 'Vinted : plus de « skipped » muet');
const invPf = entre(b, '`&platform=eq.${job.platform}&id=neq.${job.id}&status=in.(pending,processing)`', 'pf.processing_since = new Date().toISOString();');
ok(/select=id,title&limit=1/.test(invPf) && /await retenirDerriereAnnonceHorsLigne\(accessToken, job, pf, horsLigne\[0\]\)/.test(invPf),
  'Leboncoin / Beebs / Depop : même retenue écrite');
ok(!/est déjà hors ligne — sa recréation passe d'abord` \};/.test(b), 'Leboncoin / Beebs / Depop : plus de « skipped » muet');
ok(/delete pf\.retenue_hors_ligne; \/\/ \(11\/10\) plus retenu/.test(invPf), 'plateformes : la marque part quand le frère est revenu');
ok((b.match(/delete pf\.retenue_hors_ligne; \/\/ \(11\/10\) plus retenu/g) ?? []).length === 2, 'Vinted aussi : la marque part quand le frère est revenu');
ok(/return \{ status: "skipped", error: "invariant hors-ligne invérifiable — suppression reportée" \};/.test(b)
  && /return \{ status: "skipped", error: "invariant hors-ligne invérifiable — retrait reporté" \};/.test(b),
  'lecture impossible : échec FERMÉ inchangé (rien retiré, rien écrit)');
{
  const { tacheAMettreDeCote } = await import(pathToFileURL(path.join(racine, 'supabase/functions/_shared/tache-sans-demarrage.js')).href);
  const job = { status: 'pending', action: 'republish', platform_fields: { republish_step: 'captured', next_action_after: new Date(Date.now() + 30 * 60_000).toISOString() } };
  const reservation = { servi_n: 61, premier_service: new Date(Date.now() - 3 * 86400_000).toISOString() };
  ok(tacheAMettreDeCote(job, reservation) === false, 'serveur : une tâche retenue (attente programmée) n\'est jamais mise de côté « sans démarrage »');
  ok(tacheAMettreDeCote({ ...job, platform_fields: { republish_step: 'captured' } }, reservation) === true, '… alors que la même, muette, l\'était (61 services) — preuve que l\'écriture change le sort');
}

// ── A3.2 — /selling-restriction ────────────────────────────────────────────
console.log('\nA3.2 /selling-restriction reconnu, dit, jamais « rien à faire »');
const blocRestr = entre(v, 'const restrictionVente = location.pathname.startsWith("/selling-restriction");', '// Session : le background vient de naviguer');
ok(/if \(location\.pathname\.startsWith\("\/listing-restriction"\) \|\| restrictionVente\)/.test(blocRestr), 'vinted.js : /selling-restriction entre dans la branche des restrictions (avant le générique)');
ok(/sellingRestriction: true/.test(blocRestr) && /signal: "selling_restriction"/.test(blocRestr) && /restrictionMessage: messageVinted \|\| null/.test(blocRestr),
  'motif dédié, relevé du message Vinted, diagnostic « selling_restriction »');
ok(/listingRestriction: true,\n\s+restrictionMessage: messageVinted \|\| null,\n\s+diagnostic: releve \? \{ signal: "listing_restriction"/.test(blocRestr)
  && /"RESTRICTION VINTED : Vinted limite temporairement les mises en vente sur ce compte " \+/.test(blocRestr),
  '/listing-restriction : retour inchangé');
ok(!/rien à faire/.test(entre(blocRestr, 'if (restrictionVente) {', 'return {\n      success: false,\n      needsUser: true,\n      listingRestriction')), 'vinted.js : jamais « rien à faire » pour /selling-restriction');
const venteFn = fonction(b, 'replanifierRestrictionVenteVinted');
ok(/const SELLING_RESTRICTION_DELAIS_MIN = \[60, 180, 360\];/.test(b), 'recul long : 1 h, 3 h, puis 6 h');
{
  const ecrits = [];
  const VO = { domaineVintedAffiche: () => 'vinted.fr', navigateurCourt: () => 'Chrome' };
  const f = new Function('updateJobStatus', 'jobStatusNow', 'VO', 'SELLING_RESTRICTION_DELAIS_MIN',
    `${venteFn}; return replanifierRestrictionVenteVinted;`)(
    async (tok, id, statut, extra) => { ecrits.push({ statut, extra }); }, async () => 'processing', VO, [60, 180, 360]);
  const res = { sellingRestriction: true, restrictionMessage: 'Ton compte est restreint', diagnostic: { signal: 'selling_restriction', url: 'https://www.vinted.fr/selling-restriction' } };
  const r1 = await f('jeton', { id: 'J', title: 'Cendrier / Vide-poche Lourdes' }, {}, res, true);
  const e1 = ecrits[0]?.extra ?? {};
  ok(ecrits[0]?.statut === 'pending' && r1.status === 'retry', 'étape deleted : pending (jamais needs_user)');
  ok(/^Vinted a restreint les mises en vente de ton compte : ouvre vinted\.fr dans Chrome pour voir ce que Vinted demande\. Ton annonce « Cendrier \/ Vide-poche Lourdes » a été retirée avant la restriction et attend sa remise en ligne : rien d'autre n'est retiré tant que la restriction n'est pas levée ; la remise en ligne repartira seule ensuite\./.test(e1.error ?? ''),
    'annonce retirée : la vérité, et le geste (aller voir sur Vinted)', e1.error);
  ok(/Message affiché par Vinted : « Ton compte est restreint »/.test(e1.error ?? ''), 'le message de Vinted est repris tel quel');
  ok(!/rien à faire|Republier maintenant/.test(e1.error ?? ''), 'ni « rien à faire » ni « Republier maintenant »');
  ok(e1.platform_fields?.last_diagnostic?.signal === 'selling_restriction', 'diagnostic gardé en OBJET (lisible par pas-de-rouge)');
  const d1 = Date.parse(e1.platform_fields?.next_action_after ?? '') - Date.now();
  ok(d1 > 55 * 60_000 && d1 < 65 * 60_000 && e1.platform_fields?.selling_restriction?.n === 1, '1er essai : dans 1 h');
  ecrits.length = 0;
  await f('jeton', { id: 'J', title: 'X' }, { ...e1.platform_fields }, res, true);
  await f('jeton', { id: 'J', title: 'X' }, { ...ecrits[0].extra.platform_fields }, res, true);
  await f('jeton', { id: 'J', title: 'X' }, { ...ecrits[1].extra.platform_fields }, res, true);
  const d4 = Date.parse(ecrits[2]?.extra?.platform_fields?.next_action_after ?? '') - Date.now();
  ok(ecrits.every((x) => x.statut === 'pending') && d4 > 355 * 60_000 && d4 < 365 * 60_000, 'ensuite 3 h, puis 6 h — toujours pending');
  ecrits.length = 0;
  await f('jeton', { id: 'J', title: 'Robe' }, {}, res, false);
  ok(/Ton annonce est toujours en ligne : rien n'est retiré tant que la restriction n'est pas levée ; la republication repartira seule ensuite\./.test(ecrits[0]?.extra?.error ?? ''),
    'étape captured : l\'annonce est dite toujours en ligne');
}
ok(/if \(result\?\.sellingRestriction\) \{\n\s+return await replanifierRestrictionVenteVinted\(accessToken, job, pf, result, false\);\n\s+\}\n\s+if \(result\?\.listingRestriction\) \{/.test(b),
  'étape captured (rien retiré) : /selling-restriction avant /listing-restriction');
ok(/async function replanifierOuArreterRecreation\(accessToken, job, pf, result\) \{[\s\S]{0,400}if \(result\?\.sellingRestriction\) \{\n\s+return await replanifierRestrictionVenteVinted\(accessToken, job, pf, result, true\);/.test(b),
  'recréation (annonce retirée) : aucune retentative consommée, aucune « Republier maintenant »');

// ── A3.3 — CAPTURE BORNÉE ──────────────────────────────────────────────────
console.log('\nA3.3 La capture qui ne répond pas ne fige plus la file');
ok(/const CAPTURE_VINTED_BORNE_MS = 90_000;/.test(b), 'borne de 90 s');
const capFn = fonction(b, 'captureVintedItemUnlocked');
ok(/sendMessageToTab\(tabId, \{ type: "VINTED_ITEM_CAPTURE", vintedItemId: id \}, CAPTURE_VINTED_BORNE_MS\)/.test(capFn), 'la sonde est appelée avec la borne');
ok(/setInterval\(\(\) => chrome\.runtime\.getPlatformInfo\(\)\.catch\(\(\) => \{\}\), 20_000\)/.test(capFn) && /\.finally\(\(\) => clearInterval\(reveilCapture\)\)/.test(capFn),
  'worker tenu éveillé pendant l\'attente, réveil toujours arrêté');
{
  const fab = (envoi) => new Function('getOrCreateWorkTab', 'sendMessageToTab', 'VO', 'CANAL_COUPE_RE', 'sleep', 'chrome', 'CAPTURE_VINTED_BORNE_MS', 'console',
    `${capFn}; return captureVintedItemUnlocked;`)(
    async () => 7, envoi, { origineVinted: () => 'https://www.vinted.fr' }, /channel closed|Receiving end/, async () => {},
    { runtime: { getPlatformInfo: () => Promise.resolve() } }, 90_000, { warn() {}, log() {} });
  let borne = null;
  const r1 = await fab(async (t, m, ms) => { borne = ms; throw new Error('Timeout: pas de réponse du content script'); })('123');
  ok(r1?.success === false && r1.delaiDepasse === true && /sans réponse en 90 s/.test(r1.error) && borne === 90_000, 'dépassement : rendu comme tel (delaiDepasse), une seule fois', JSON.stringify(r1));
  const rep = { success: true, verdict: 'valide', capture: 1 };
  const r2 = await fab(async () => rep)('123');
  ok(r2 === rep, 'une capture qui répond sort à l\'identique');
}
ok(/return \{ success: false, error: capture\?\.error \?\? "capture en échec", \.\.\.\(capture\?\.delaiDepasse \? \{ delaiDepasse: true \} : \{\}\) \};/.test(b), 'le dépassement voyage jusqu\'à la republication');
const blocD = entre(b, 'if (cap.delaiDepasse) {', '// ── ANTI-ROBOT : ON SE CALME');
ok(/if \(nD < 3\) \{/.test(blocD) && /new Date\(Date\.now\(\) \+ 30 \* 60_000\)/.test(blocD) && /updateJobStatus\(accessToken, job\.id, "pending", \{ platform_fields: pf, error: msgD \}\)/.test(blocD),
  'dépassement : écrit, pending, nouvel essai dans 30 min');
ok(/updateJobStatus\(accessToken, job\.id, "failed", \{ platform_fields: pf, error: msgF \}\)/.test(blocD) && /Ton annonce est intacte/.test(blocD), 'au 3e dépassement : arrêt DIT (failed), annonce intacte');
ok(/delete pf\.capture_sans_reponse;/.test(b), 'une capture réussie remet le compte à zéro');

// ── A2 — OPLA ──────────────────────────────────────────────────────────────
console.log('\nA2 Sortie d\'Opla : plus aucune action Opla de ce poste');
const sortieFn = fonction(b, 'oplaSortieActive');
ok(/const OPLA_SORTIE_REPLI_MS = Date\.parse\("2026-10-10T00:00:00\+02:00"\);/.test(b), 'date de repli : 10/10 00:00 Paris');
{
  const fab = (stocke) => new Function('chrome', 'CLE_OPLA_SORTIE', 'OPLA_SORTIE_REPLI_MS', `${sortieFn}; return oplaSortieActive;`)(
    { storage: { local: { get: async () => (stocke === undefined ? {} : { fillsell_opla_sortie: stocke }) } } }, 'fillsell_opla_sortie', Date.parse('2026-10-10T00:00:00+02:00'));
  ok(await fab({ active: false })() === false, 'serveur « pas sortie » (interrupteur à 0) : suivi');
  ok(await fab({ active: true })() === true, 'serveur « sortie » : suivi');
  ok(await fab(undefined)() === (Date.now() >= Date.parse('2026-10-10T00:00:00+02:00')), 'sans réponse du serveur : la date fait foi');
}
ok(/if \(platform === "opla" && await oplaSortieActive\(\)\) continue; \/\/ \(11\/10\) sortie d'Opla : plus relevée/.test(fonction(b, 'releverQuotidien')), 'alarme quotidienne : Opla sautée');
const lancer = fonction(b, 'lancerRelevePlateforme');
ok(/if \(platform === "opla" && await oplaSortieActive\(\)\) \{[\s\S]*?status: "cancelled"[\s\S]*?return \{ ok: false, reason: "opla_sortie" \};/.test(lancer), 'tout relevé Opla (bouton, app, veilleur, commande servie) refusé ; commande servie close');
ok(/if \(platform === "opla" && await oplaSortieActive\(\)\) return \{ ok: false, reason: "opla_sortie" \};/.test(fonction(b, 'lancerReleveVentes')), 'relevé des ventes Opla refusé');
ok(/if \(plateformes\.includes\("opla"\) && await oplaSortieActive\(\)\) plateformes = plateformes\.filter\(\(pf\) => pf !== "opla"\);/.test(fonction(b, 'reportPlatformSessions')), 'session Opla plus sondée');
ok(/if \(await oplaSortieActive\(\)\) return relances;/.test(fonction(b, 'rearmerJobsOplaEnAttente')), 'aucun job Opla remis en file à l\'octroi');
const veille = fonction(b, 'checkPublishedListings');
ok(/const sansOpla = await oplaSortieActive\(\);/.test(veille) && /\(sansOpla \? "&platform=neq\.opla" : ""\)/.test(veille), 'veilleur de ventes : les annonces Opla écartées DÈS la lecture (fenêtre des 60 libre)');
ok(/\.filter\(\(j\) => !\(sansOpla && j\?\.platform === "opla"\)\)/.test(veille), 'veilleur : vérifications prioritaires Opla écartées aussi');
ok(/if \(job\.platform === "opla"\) \{\n\s+\/\/ \(11\/10\) Opla sortie[\s\S]{0,200}if \(await oplaSortieActive\(\)\) \{[\s\S]{0,300}return \{ status: "skipped"/.test(b), 'job Opla servi malgré tout : sauté avant tout onglet');
// Rien d'autre n'est touché : chaque garde nomme Opla.
const gardes = b.match(/oplaSortieActive\(\)/g) ?? [];
ok(gardes.length === 8, `7 usages de la sortie (+ sa définition), tous sur Opla (vu ${gardes.length})`);
ok(/const RELEVE_PLATEFORMES = \["leboncoin", "beebs", "ebay", "opla"\];/.test(b) && /const VENTES_PLATEFORMES = \["vinted", "leboncoin", "opla"\];/.test(b),
  'listes de plateformes inchangées (la sortie se lit au passage, réversible par le serveur)');
ok(/if \(platform === "depop" && !\(await depopAccesAccorde\(\)\)\) continue;/.test(b), 'Depop : chemin inchangé');
// Popup
ok(/function oplaSortiePasse\(\) \{\n\s+if \(state\.oplaSortieConnue === true\) return state\.oplaSortieActive === true;\n\s+return Date\.now\(\) >= OPLA_SORTIE_REPLI_MS;\n\}/.test(p), 'popup : la sortie vient du serveur, sinon de la date');
ok(/chrome\.storage\.local\.set\(\{ fillsell_opla_sortie: \{ active: sortieServeur, le: new Date\(\)\.toISOString\(\) \} \}\)/.test(p), 'popup : la vérité du serveur est mémorisée pour le service worker');
ok(/if \(p\.optionnel && oplaSortiePasse\(\)\) continue;/.test(p) && /if \(p\.optionnel && \(state\.oplaRelie === false \|\| oplaSortiePasse\(\)\)\) \{ state\.etats\[p\.key\] = \{ etat: null, sous: null \}; continue; \}/.test(p),
  'popup : plus de ligne Opla ni d\'« Autoriser Opla » après la sortie');

// ── Manifeste ───────────────────────────────────────────────────────────────
console.log('\nManifeste');
const man = JSON.parse(lire('chrome-extension/manifest.json').replace(/^﻿/, ''));
// (11/10) La 0.6.108 embarque la 0.6.107 (jamais téléversée) : 0.6.107 OU PLUS.
ok(String(man.version).split('.').map(Number).reduce((a, n) => a * 1000 + n, 0) >= 6107, `version 0.6.107 ou plus (vu ${man.version})`);

console.log(ko ? `\n✗ ${ko} échec(s)` : '\nTOUT PASSE');
process.exit(ko ? 1 : 0);
