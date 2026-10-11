// ═══════════════════════════════════════════════════════════════════════════
// REPUBLICATION AUTOMATIQUE : SEUL LE COMPTE COUPE LE COMPTE, ET UNE ANNONCE
// RETIRÉE QUI NE REVIENT PAS NE GÈLE PLUS LES AUTRES — `npm run selftest:disjoncteur-compte`
// ═══════════════════════════════════════════════════════════════════════════
// 12/10 (A4, A5).
//  A4 — republish_planifiee_sweep, étape 3bis (migration 20261012090000) :
//     un échec d'ARTICLE ne compte pas (et ne coupe pas la chaîne) ; un échec
//     du COMPTE (session, anti-robot, compte bloqué, restriction Vinted, accès,
//     boutique étrangère…) compte, même parqué en needs_user / pending.
//     Contrôle : la fonction SQL republish_echec_portee rejouée en JS sur les
//     mêmes cas (miroir lu dans le fichier de migration) + le corps de 3bis.
//  A5 — _shared/recreation-bloquee.js + handler-watch : une remise en ligne
//     ratée 2 fois et retirée depuis plus de 2 h sort de la file (needs_user
//     « recreation_bloquee », « Republier maintenant ») — l'invariant « une
//     annonce hors ligne à la fois » se lève partout ; SAUF cause du compte
//     (restriction Vinted, session) : elle reste, elle protège.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const R = await import(pathToFileURL(join(RACINE, 'supabase/functions/_shared/recreation-bloquee.js')).href);

let ko = 0, ok = 0;
const verifier = (c, quoi, detail = '') => { if (c) { ok++; console.log(`  ✓ ${quoi}`); } else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${detail}` : ''}`); } };

// ── A4 : le disjoncteur ─────────────────────────────────────────────────────
console.log('A4. Le disjoncteur ne coupe que pour le compte');
const MIG = lire('supabase/migrations/20261012090000_disjoncteur_republication_compte_seul.sql');
// Miroir de republish_echec_portee (mêmes listes, lues dans la migration).
const sources = [...MIG.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
const blocSources = MIG.slice(MIG.indexOf("ANY (ARRAY["), MIG.indexOf("THEN 'compte'"));
const SOURCES_COMPTE = [...blocSources.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
const blocCles = MIG.slice(MIG.indexOf("?| ARRAY["), MIG.indexOf("OR COALESCE(p_pf -> 'verification_boutique_vinted'"));
const CLES_COMPTE = [...blocCles.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
const reTexte = new RegExp(MIG.match(/~\* '\(([^']+)\)'/)[1], 'i');
const portee = (status, pf = {}, error = '') => {
  if (!status || status === 'published') return null;
  if (status === 'needs_user' && SOURCES_COMPTE.includes(pf.needs_user_source ?? '')) return 'compte';
  if (CLES_COMPTE.some((k) => k in pf) || pf.verification_boutique_vinted?.motif === 'session_inconnue') return 'compte';
  if (status === 'failed' && reTexte.test(error ?? '')) return 'compte';
  if (['failed', 'needs_user', 'cancelled'].includes(status)) return 'article';
  return null;
};
verifier(sources.length > 10 && SOURCES_COMPTE.includes('session_vinted') && SOURCES_COMPTE.includes('verification_antirobot') && SOURCES_COMPTE.includes('compte_vinted_bloque'), 'les motifs du COMPTE nommés dans la fonction SQL');
verifier(!SOURCES_COMPTE.includes('champ_a_choisir') && !SOURCES_COMPTE.includes('prevol_negatif') && !SOURCES_COMPTE.includes('relancer'), 'aucun motif d’ARTICLE dans la liste du compte');
verifier(CLES_COMPTE.includes('selling_restriction') && CLES_COMPTE.includes('attente_session'), 'restriction Vinted et session absente = compte, même en pending');
// La règle de 3bis, rejouée.
const consecutifs = (jobs) => {
  let n = 0;
  for (const j of jobs) {
    if (j.status === 'published') break;
    const p = portee(j.status, j.pf, j.error);
    if (p === 'compte') n++; else if (p === 'article') continue; else break;
  }
  return n;
};
const art = (s = 'needs_user', src = 'champ_a_choisir') => ({ status: s, pf: { needs_user_source: src } });
const cpt = (src = 'session_vinted') => ({ status: 'needs_user', pf: { needs_user_source: src } });
verifier(consecutifs([art(), art('failed'), art(), art('failed')]) === 0, 'quatre articles en échec : 0 (avant : deux failed coupaient la plateforme pour la journée)');
verifier(consecutifs([cpt(), cpt('verification_antirobot')]) === 2, 'deux échecs du compte : 2 → disjoncteur (seuil 2)');
verifier(consecutifs([cpt(), art(), cpt()]) === 2, 'un article intercalé ne remet pas le compteur à zéro (il ne prouve pas que le compte va bien)');
verifier(consecutifs([cpt(), { status: 'published', pf: {} }, cpt()]) === 1, 'une réussite intercalée remet le compteur à zéro');
verifier(consecutifs([{ status: 'pending', pf: {} }, cpt(), cpt()]) === 0, 'un job en cours arrête le comptage (comme avant)');
verifier(consecutifs([{ status: 'pending', pf: { selling_restriction: { n: 1 } } }, { status: 'pending', pf: { attente_session: true } }]) === 2, 'deux jobs parqués pour le compte (restriction, session) : 2');
verifier(consecutifs([{ status: 'failed', pf: {}, error: 'Vinted bloque (anti-robot)' }, { status: 'failed', pf: {}, error: 'Connecte-toi à Vinted' }]) === 2, 'un failed dont le texte dit le compte : compté');
verifier(/v_portee := republish_echec_portee\(v_j\.status, v_j\.pf, v_j\.error\);/.test(MIG) && /ELSIF v_portee = 'article' THEN CONTINUE;/.test(MIG) && /'echecs_compte_consecutifs'/.test(MIG), 'republish_planifiee_sweep : étape 3bis sur republish_echec_portee');
verifier(/2ter\. \(11\/10, Louis/.test(MIG) && /6ter\. \(08\/10, Louis\)/.test(MIG), 'le corps vient de la PROD du 12/10 (étapes 2ter et 6ter présentes)');

// ── A5 : la file n'est plus gelée ───────────────────────────────────────────
console.log('\nA5. Une annonce retirée qui ne revient pas ne gèle plus les autres');
const T = Date.parse('2026-10-12T10:00:00Z');
const job = (pf, extra = {}) => ({ action: 'republish', status: 'pending', title: 'Cendrier', platform: 'vinted', created_at: '2026-10-07T20:33:33Z', ...extra, platform_fields: { republish_step: 'deleted', ...pf } });
const cendrier = job({ deleted_at_serveur: '2026-10-07T22:15:35Z', recreation_reprises: 28, recreation_reprise: { n: 28 } });
verifier(R.decisionRecreationBloquee(cendrier, T) === 'signaler', 'Cendrier (28 échecs, retiré depuis 4 j) → sort de la file');
verifier(R.decisionRecreationBloquee(job({ deleted_at_serveur: '2026-10-12T09:30:00Z', recreation_reprises: 5 }), T) === null, 'retiré depuis 30 min : on laisse la remise en ligne se faire');
verifier(R.decisionRecreationBloquee(job({ deleted_at_serveur: '2026-10-11T09:30:00Z', recreation_reprises: 1 }), T) === null, 'un seul échec : on laisse réessayer');
verifier(R.decisionRecreationBloquee(job({ deleted_at_serveur: '2026-10-07T22:15:35Z', recreation_reprises: 28, selling_restriction: { n: 3 } }), T) === 'proteger', 'restriction Vinted (cause du COMPTE) → elle reste et protège');
verifier(R.decisionRecreationBloquee(job({ deleted_at_serveur: '2026-10-07T22:15:35Z', recreation_reprises: 4, attente_session: true }), T) === 'proteger', 'session fermée → elle reste et protège');
verifier(R.decisionRecreationBloquee(job({ deleted_at_serveur: '2026-10-07T22:15:35Z', recreation_reprises: 4, error_technique: { brut: 'redirigé vers /selling-restriction' } }), T) === 'proteger', 'restriction lue dans le texte de l’échec → protège');
verifier(R.decisionRecreationBloquee(job({ republish_step: 'captured', recreation_reprises: 9 }), T) === null, 'pas à l’étape « deleted » : pas son cas');
verifier(R.decisionRecreationBloquee(job({ deleted_at_serveur: '2026-10-07T22:15:35Z', recreation_reprises: 4, processing_since: '2026-10-12T09:55:00Z' }, { status: 'processing' }), T) === null, 'en cours d’exécution depuis 5 min : jamais arraché à son poste');
const msg = R.messageRecreationBloquee(cendrier);
verifier(/Cendrier/.test(msg) && /Republier maintenant/.test(msg) && /Rien n'est perdu/.test(msg) && /autres republications, elles, continuent/.test(msg) && /\b08\/10\b/.test(msg), 'le message : l’annonce, la date (heure de Paris : 07/10 22:15 UTC = 08/10), rien de perdu, le geste, les autres continuent');
const hw = lire('supabase/functions/handler-watch/index.ts');
const blocHw = hw.slice(hw.indexOf('UNE ANNONCE RETIRÉE QUI NE REVIENT PAS NE GÈLE PLUS LES AUTRES (12/10, A5)'));
verifier(/decisionRecreationBloquee\(j\)/.test(blocHw) && /status: "needs_user", error: message/.test(blocHw) && /SOURCE_RECREATION_BLOQUEE/.test(blocHw), 'handler-watch : la remise en ligne bloquée sort de la file (needs_user, motif nommé)');
verifier(/\.limit\(50\)/.test(blocHw.slice(0, 2500)) && /jobs_reservations_extension/.test(blocHw.slice(0, 4000)), 'handler-watch : borné (50), réservation rendue');
// L'invariant de l'extension et de get-pending-jobs ne lit que pending/processing à 'deleted' : needs_user le lève, toutes versions.
const bg = lire('chrome-extension/background.js');
verifier(/status=in\.\(pending,processing\)` \+\s*`&platform_fields->>republish_step=eq\.deleted/.test(bg), 'extension : l’invariant ne lit que pending/processing — la sortie en needs_user le lève (toutes versions)');
// La republication bloquée n'est jamais soldée par le ménage des 72 h.
verifier(/if \(j\.action === "republish" && j\.platform_fields\?\.republish_step === "deleted"\) return false;/.test(hw), 'une republication retirée n’est jamais soldée par le ménage des 72 h');

console.log(`\n${ko ? `✗ ${ko} échec(s)` : '✓ tout est vert'} — ${ok} contrôles`);
process.exit(ko ? 1 : 0);
