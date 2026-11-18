// VERROU — 18/11/2026, lot T2 point 2 (ordre de Nico) : « À l'heure du créneau, quand un lot attend : une notification
// push soignée (« C'est l'heure de ton créneau : tes annonces repartent »), une seule par créneau, jamais en rafale. »
// Avant : rien. 2f8b09d2 (260 republications) et a962a59e (195) attendaient leur créneau du soir sans signe.
// Ce verrou casse si : une note part sans lot en attente (automatique, lot de 10 articles ou moins, lot lancé
// « maintenant »), hors de l'ouverture (plus de 15 min après), deux fois pour le même créneau, dans l'heure d'une autre,
// deux fois au même passage ; si deux plateformes ouvertes à la même heure font deux notes ; si le texte d'un compte Cloud
// parle de Chrome ou d'ordinateur ; si republish-auto-sweep envoie avant d'écrire la trace, ou laisse une panne de la
// note casser le balayage.
//   (node scripts/push-creneau-lot-selftest.mjs)
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8');
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log('  ✓', m); else { ko++; console.log('  ✗', m, d === undefined ? '' : JSON.stringify(d).slice(0, 300)); } };

let P = {};
try { P = await import('../supabase/functions/_shared/push-creneau.js'); } catch (e) { ok(false, '_shared/push-creneau.js existe', e.message); }
const notes = P.notesCreneau ?? (() => []);

// Mercredi 18/11/2026, le créneau Vinted de 19:00 (18:00 UTC) s'ouvre ; la note part au passage de 19:03.
const OUVERT = '2026-11-18T18:00:00Z';
const T = Date.parse('2026-11-18T18:03:00Z');
const U = 'u-2f8b09d2', V = 'u-a962a59e';
const lotJobs = (u, lot, pf, k, depuis = 0) => Array.from({ length: k }, (_, i) => ({ user_id: u, platform: pf, bulk_batch_id: lot, inventaire_id: depuis + i, source: null }));
const lotLignes = (lot, k) => Array.from({ length: k }, (_, i) => ({ bulk_batch_id: lot, inventaire_id: i, created_at: '2026-11-17T22:41:36Z' }));
const base = {
  creneaux: [{ user_id: U, platform: 'vinted', jour: '2026-11-18', de: '19:00:00', debut: OUVERT }],
  jobs: lotJobs(U, 'lot-t', 'vinted', 260),
  lignesLots: lotLignes('lot-t', 291),
  deja: [], maintenant: T,
};

console.log('1. Une note quand un lot attend, à l\'ouverture du créneau');
{
  const r = notes(base);
  ok(r.length === 1 && r[0].user_id === U && r[0].cle === '2026-11-18:19:00' && r[0].n === 260 && r[0].plateformes.join() === 'vinted', 'le lot de 260 → UNE note, clé du créneau, 260 en attente', r);
  ok(notes({ ...base, maintenant: Date.parse('2026-11-18T18:20:00Z') }).length === 0, 'plus de 15 min après l\'ouverture : rien (jamais une note en retard)');
  ok(notes({ ...base, maintenant: Date.parse('2026-11-18T17:59:00Z') }).length === 0, 'avant l\'ouverture : rien');
}

console.log('2. Jamais sans lot qui attend');
{
  ok(notes({ ...base, jobs: base.jobs.map((j) => ({ ...j, source: 'auto' })) }).length === 0, 'republications automatiques : aucune note');
  ok(notes({ ...base, jobs: lotJobs(U, 'lot-p', 'vinted', 8), lignesLots: lotLignes('lot-p', 8) }).length === 0, 'un lot de 10 articles ou moins (parti tout de suite) : aucune note');
  ok(notes({ ...base, lotsMaintenant: new Map([[U, new Set(['lot-t'])]]) }).length === 0, 'un lot lancé « maintenant » : aucune note');
  ok(notes({ ...base, creneaux: [{ ...base.creneaux[0], platform: 'leboncoin' }] }).length === 0, 'le créneau d\'une AUTRE plateforme : aucune note');
}

console.log('3. Une seule par créneau, jamais en rafale');
{
  ok(notes({ ...base, deja: [{ user_id: U, created_at: '2026-11-18T18:00:30Z', cle: '2026-11-18:19:00' }] }).length === 0, 'déjà envoyée pour ce créneau : rien');
  ok(notes({ ...base, deja: [{ user_id: U, created_at: '2026-11-18T17:30:00Z', cle: '2026-11-18:18:00' }] }).length === 0, 'une autre note il y a moins d\'une heure : rien (jamais en rafale)');
  ok(notes({ ...base, deja: [{ user_id: U, created_at: '2026-11-18T09:00:00Z', cle: '2026-11-18:08:00' }] }).length === 1, 'la note du matin (10 h plus tôt) n\'empêche pas celle du soir');
  const deux = notes({ ...base,
    creneaux: [...base.creneaux, { user_id: U, platform: 'beebs', jour: '2026-11-18', de: '19:00:00', debut: OUVERT }],
    jobs: [...base.jobs, ...lotJobs(U, 'lot-t', 'beebs', 35, 1000)] });
  ok(deux.length === 1 && deux[0].plateformes.join() === 'vinted,beebs' && deux[0].n === 295, 'Vinted et Beebs ouvrent à 19:00 : UNE note qui les nomme', deux);
  const autre = notes({ ...base,
    creneaux: [...base.creneaux, { user_id: U, platform: 'leboncoin', jour: '2026-11-18', de: '18:00:00', debut: '2026-11-18T17:55:00Z' }],
    jobs: [...base.jobs, ...lotJobs(U, 'lot-t', 'leboncoin', 20, 2000)] });
  ok(autre.length === 1, 'deux ouvertures dans le même passage : au plus une note par compte', autre);
  const deuxComptes = notes({ ...base,
    creneaux: [...base.creneaux, { user_id: V, platform: 'vinted', jour: '2026-11-18', de: '19:00:00', debut: OUVERT }],
    jobs: [...base.jobs, ...lotJobs(V, 'lot-v', 'vinted', 195)], lignesLots: [...base.lignesLots, ...lotLignes('lot-v', 256)] });
  ok(deuxComptes.length === 2, 'deux comptes : une note chacun', deuxComptes.map((x) => x.user_id));
}

console.log('4. Le texte : soigné, dans la voie du compte');
{
  const m = P.messageCreneau ? P.messageCreneau({ cle: 'c', plateformes: ['vinted', 'beebs'], n: 295 }, { lang: 'fr', cloud: true }) : {};
  ok(m.titre === "C'est l'heure de ton créneau", 'titre : « C\'est l\'heure de ton créneau »', m);
  ok(/^Tes annonces repartent : 295 republications sur Vinted et Beebs, au rythme habituel/.test(m.corps ?? '') && !/chrome|ordinateur|extension/i.test(m.corps ?? ''), 'Cloud : « Tes annonces repartent… », jamais Chrome', m.corps);
  const pc = P.messageCreneau ? P.messageCreneau({ cle: 'c', plateformes: ['vinted'], n: 1 }, { lang: 'fr', cloud: false }) : {};
  ok(/1 republication sur Vinted/.test(pc.corps ?? '') && /si Chrome est ouvert/.test(pc.corps ?? ''), 'extension : la condition dite (Chrome ouvert)', pc.corps);
  const en = P.messageCreneau ? P.messageCreneau({ cle: 'c', plateformes: ['vinted'], n: 3 }, { lang: 'en', cloud: true }) : {};
  ok(/^It's time for your time slot$/.test(en.titre ?? '') && !/chrome|computer/i.test(en.corps ?? ''), 'en anglais, Cloud', en);
  ok(m.donnees?.type === 'creneau', 'donnees.type = « creneau » (l\'appui ouvre l\'app)');
}

console.log('5. republish-auto-sweep : trace AVANT l\'envoi, jamais un point de panne');
{
  const s = lire('supabase/functions/republish-auto-sweep/index.ts');
  const iTrace = s.indexOf('admin.from("usage_logs").insert({ user_id: n.user_id, feature: FEATURE_PUSH_CRENEAU');
  const iEnvoi = s.indexOf('await envoyerNote(fetch, cfgApns, cfgFcm, { id: `creneau-${n.cle}`');
  ok(iTrace > 0 && iEnvoi > iTrace, 'la trace usage_logs est posée avant l\'envoi (un passage qui recommence ne renvoie jamais)');
  ok(/try \{\s*noteCreneau = await pousserCreneaux\(supabase\);[\s\S]{0,300}\} catch \(e\) \{/.test(s), 'pousserCreneaux dans un try/catch : le balayage n\'en dépend jamais');
  ok(/\.limit\(500\)/.test(s) && /slice\(0, 200\)/.test(s) && /i < 250; i \+= 50/.test(s), 'lectures bornées (500 créneaux, 200 comptes, tranches de 50)');
}

console.log(ko ? `\n${ko} échec(s) sur ${n}` : `\nOK ${n}/${n}`);
process.exit(ko ? 1 : 0);
