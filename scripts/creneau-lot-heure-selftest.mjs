// VERROU — 18/11/2026, lot T2 point 2 (ordre de Nico) : « Un lot lancé hors de son créneau : l'app dit clairement à
// quelle heure il partira, et propose de changer le créneau ou de lancer maintenant. »
// Avant : la feuille Republier disait « ils partiront dans ton créneau de republication » sans heure, la file « En pause
// (créneau) : elle repart toute seule au prochain créneau », et rien ne permettait de lancer un lot de plus de 10 articles
// hors de son créneau (2f8b09d2 : 260 republications lancées le 17/11 à 23:41, parties le lendemain à 19:00).
// Ce verrou casse si :
//   1. l'heure de début du créneau (« ce soir à partir de 19:00 », « demain à partir de 08:00 »…) n'est plus dite, ou
//      se calcule hors du fuseau du réglage ;
//   2. la file d'un lot retenu ne dit plus quand il part ;
//   3. « Lancer maintenant » ne lève plus la retenue du lot (et elle seule : l'automatique, un autre lot, un choix
//      périmé restent retenus) ;
//   4. get-pending-jobs ne lit plus le choix avec la taille des lots, ou la feuille ne l'écrit plus avant la première
//      tâche (platform_settings_fusionner, la seule voie) ; 5. « Changer le créneau » disparaît de la feuille.
//   (node --import ./scripts/loader-ext.mjs scripts/creneau-lot-heure-selftest.mjs)
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8');
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log('  ✓', m); else { ko++; console.log('  ✗', m, d === undefined ? '' : String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 300)); } };
const essai = async (f) => { try { return await f(); } catch (e) { return { erreur: e.message }; } };

// Mardi 17/11/2026 23:41 à Paris (22:41 UTC) — le lot de 2f8b09d2 ; créneau Vinted 19:00–22:00.
const LANCE = Date.parse('2026-11-17T22:41:36Z');
const D = await essai(() => import('../src/utils/departCreneau.js'));

console.log('1. L\'heure de début du créneau, dans le fuseau du réglage');
{
  const q = D.quandPartLeCreneau;
  ok(typeof q === 'function', 'src/utils/departCreneau.js : quandPartLeCreneau', D.erreur);
  if (typeof q === 'function') {
    ok(q('2026-11-18T18:00:00Z', { maintenant: LANCE }) === 'demain à partir de 19:00', 'lancé à 23:41 → « demain à partir de 19:00 »', q('2026-11-18T18:00:00Z', { maintenant: LANCE }));
    ok(q('2026-11-18T18:00:00Z', { maintenant: Date.parse('2026-11-18T09:00:00Z') }) === 'ce soir à partir de 19:00', 'le matin même → « ce soir à partir de 19:00 »');
    ok(q('2026-11-18T07:00:00Z', { maintenant: Date.parse('2026-11-18T05:00:00Z') }) === 'ce matin à partir de 08:00', '06:00 → « ce matin à partir de 08:00 »');
    ok(q('2026-11-20T11:00:00Z', { maintenant: LANCE }) === 'vendredi à partir de 12:00', 'deux jours plus tard → le jour de la semaine');
    ok(q('2026-11-18T18:00:00Z', { maintenant: LANCE, lang: 'en' }) === 'tomorrow from 19:00', 'en anglais');
    ok(q(null, { maintenant: LANCE }) === null && q('pas une date', {}) === null, 'heure illisible → null (la phrase d\'avant, jamais une heure inventée)');
    const d = D.departDuLot({ actif: true, reglage: { fuseau: 'Europe/Paris' }, fenetre: { dans_creneau: false, prochain_debut: '2026-11-18T18:00:00Z' } }, { maintenant: LANCE });
    ok(d && d.dansCreneau === false && d.quand === 'demain à partir de 19:00', 'departDuLot : hors créneau, quand', d);
    const e = D.departDuLot({ actif: true, reglage: { fuseau: 'Europe/Paris' }, fenetre: { dans_creneau: true, courant_fin: '2026-11-18T21:00:00Z' } }, { maintenant: Date.parse('2026-11-18T19:00:00Z') });
    ok(e && e.dansCreneau === true && e.fin === '22:00', 'departDuLot : créneau ouvert, jusqu\'à quand', e);
    ok(D.departDuLot({ actif: false }) === null, 'module en pause : aucun départ annoncé');
  }
}

console.log('2. La file : un lot retenu dit quand il part');
{
  const F = await essai(() => import('../src/utils/fileDesJobs.js'));
  const job = { id: 'j1', platform: 'vinted', action: 'republish', status: 'pending', bulk_batch_id: 'lot-1', created_at: '2026-11-17T22:41:36Z', platform_fields: { republish_step: 'a_capturer' }, error: null };
  const ctx = { maintenant: LANCE, lang: 'fr', lotsCreneaux: ['lot-1'], creneaux: { vinted: { actif: true, dans_creneau: false, reprise: '2026-11-18T18:00:00Z' } } };
  const s = typeof F.situationJob === 'function' ? F.situationJob(job, ctx) : null;
  ok(s && s.motif === 'creneau' && /ton lot partira demain à partir de 19:00/.test(s.raison), 'situationJob : « ton lot partira demain à partir de 19:00 »', s?.raison ?? F.erreur);
  const auto = { ...job, id: 'j2', bulk_batch_id: null, platform_fields: { republish_source: 'auto' } };
  const sa = typeof F.situationJob === 'function' ? F.situationJob(auto, { ...ctx, lotsCreneaux: [] }) : null;
  ok(!sa || !/ton lot partira/.test(sa.raison ?? ''), 'une republication automatique ne se dit jamais « ton lot »', sa?.raison);
}

console.log('3. « Lancer maintenant » lève la retenue de CE lot seulement');
{
  const L = await import('../supabase/functions/_shared/lot-manuel-creneau.js');
  const fenetre = { actif: true, dans_creneau: false };
  const job = { id: 'j1', action: 'republish', bulk_batch_id: 'lot-1', created_at: '2026-11-17T22:41:36Z', platform_fields: {} };
  const maintenant = LANCE + 10 * 60_000;
  ok(L.retenueLotManuel(job, { fenetre, lot: { articles: 260, dernier_cree: LANCE }, maintenant }).retenir === true, 'sans choix : le lot de 260 articles attend son créneau (inchangé)');
  ok(typeof L.lotsLancesMaintenant === 'function' && L.CLE_LOTS_MAINTENANT === 'lots_maintenant', 'lotsLancesMaintenant et la clé platform_settings.lots_maintenant');
  if (typeof L.lotsLancesMaintenant === 'function') {
    const choix = L.lotsLancesMaintenant({ 'lot-1': '2026-11-17T22:41:30Z', 'lot-vieux': '2026-11-01T10:00:00Z', 'lot-faux': 'demain' }, maintenant);
    ok(choix.has('lot-1') && !choix.has('lot-vieux') && !choix.has('lot-faux'), 'un choix de plus de 7 jours ou illisible ne vaut rien', [...choix]);
    const d = L.retenueLotManuel(job, { fenetre, lot: { articles: 260, dernier_cree: LANCE, maintenant: true }, maintenant: LANCE + 5_000 });
    ok(d.retenir === false && d.motif === 'lance_maintenant', 'lancé maintenant : servi tout de suite, création comprise', d);
    ok(L.lotDansLesCreneaux({ articles: 260, maintenant: true }) === false && L.lotDansLesCreneaux({ articles: 260 }) === true, 'la file ne le montre plus « en pause (créneau) »');
    const auto = { ...job, platform_fields: { republish_source: 'auto' } };
    ok(L.retenueLotManuel(auto, { fenetre, lot: { articles: 260, maintenant: true }, maintenant }).motif === 'pas_manuelle', 'l\'automatique n\'est jamais concernée (sa retenue de créneau, inchangée)');
  }
}

console.log('4. Le serveur lit le choix avec la taille des lots ; la feuille l\'écrit avant la première tâche');
{
  const g = lire('supabase/functions/get-pending-jobs/index.ts');
  ok(/select\("lots_maintenant:platform_settings->lots_maintenant"\)/.test(g) && /lotsLus\.set\(id, maintenantChoisis\.has\(id\) \? \{ \.\.\.lot, maintenant: true \} : lot\)/.test(g),
    'get-pending-jobs : lots_maintenant lu une fois, posé sur la taille du lot (retenue ET affichage)');
  const st = lire('src/tabs/StockTab.jsx');
  const i = st.indexOf('async function lancerRepublicationLot(');
  const bloc = i >= 0 ? st.slice(i, i + 9000) : '';
  const iEcrit = bloc.indexOf("supabase.rpc('platform_settings_fusionner', { p_chemin: [CLE_LOTS_MAINTENANT]");
  const iBoucle = bloc.indexOf('for (let i = 0; i < cibles.length; i++)');
  ok(iEcrit > 0 && iBoucle > iEcrit, 'lancerRepublicationLot : le choix est écrit (platform_settings_fusionner) AVANT la première tâche');
  ok(/lancerRepublicationLot\(cibles,\{maintenant:options\?\.maintenant===true\}\)/.test(st), 'la feuille transmet le choix');
}

console.log('5. La feuille : l\'heure, « Lancer maintenant », « Changer le créneau »');
{
  const st = lire('src/tabs/StockTab.jsx');
  ok(/data-depart-creneau=\{p\}/.test(st) && /partira \$\{d\.quand\}/.test(st), 'l\'heure de départ par plateforme');
  ok(/data-lot-maintenant/.test(st) && /'Lancer maintenant'/.test(st), '« Lancer maintenant »');
  ok(/data-changer-creneau/.test(st) && /'Changer le créneau'/.test(st) && /onChangerCreneau=\{ouvrirReglagesRepublication\?/.test(st), '« Changer le créneau » mène aux réglages de la republication');
  ok(/etatsCreneaux=\{planifiee\.parPlateforme\}/.test(st), 'la feuille reçoit la fenêtre de chaque plateforme (lue au serveur)');
}

console.log(ko ? `\n${ko} échec(s) sur ${n}` : `\nOK ${n}/${n}`);
process.exit(ko ? 1 : 0);
