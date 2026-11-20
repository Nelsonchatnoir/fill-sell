// (20/11/2026, complément de Nico) UNE TÂCHE QUI ATTEND UN CRÉNEAU DE REPUBLICATION RÉGLÉ PAR LE CLIENT N'EST JAMAIS UNE
// « FILE ARRÊTÉE » ; l'alerte seulement si le créneau est passé sans départ. Cas : 8b7b607f (09:50, lot manuel de 30,
// créneau 15:02–18:00, parti 15:03).
import fs from 'node:fs';
import * as C from '../supabase/functions/_shared/creneau-client.js';
import { filesArretees } from '../supabase/functions/_shared/attente-extension-active.js';

let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d ? ` — ${d}` : ''}`); } };
const t = (iso) => Date.parse(iso);
const reglage = { a: '18:00', de: '15:02', actif: true, jours: [1, 2, 3, 4, 5, 6, 7], fuseau: 'Europe/Paris', creneau: 'perso', arrete_le: null };

console.log('1. La fenêtre (miroir de republish_planifiee_fenetre, heure de Paris)');
const f950 = C.fenetreCreneau(reglage, t('2026-11-20T08:50:00Z'));
ok(f950.valide && !f950.dans && f950.precedent?.debut === t('2026-11-19T14:02:00Z') && f950.precedent?.fin === t('2026-11-19T17:00:00Z'),
  '20/11 09:50 : hors créneau, le précédent = 19/11 15:02–18:00 (Paris)', JSON.stringify(f950));
const f1530 = C.fenetreCreneau(reglage, t('2026-11-20T14:30:00Z'));
ok(f1530.dans && f1530.courant?.debut === t('2026-11-20T14:02:00Z'), '20/11 15:30 : dans le créneau');
const lundi = C.fenetreCreneau({ ...reglage, jours: [1] }, t('2026-11-20T08:50:00Z'));
ok(lundi.precedent?.debut === t('2026-11-16T14:02:00Z'), 'jours ISO (1 = lundi) : le vendredi 20/11, le précédent est le lundi 16/11');
const ete = C.fenetreCreneau({ ...reglage, de: '10:00', a: '12:00' }, t('2026-07-01T09:00:00Z'));
ok(ete.dans && ete.courant?.debut === t('2026-07-01T08:00:00Z'), 'heure d\'été : 10:00 Paris = 08:00 UTC');
ok(!C.fenetreCreneau({ ...reglage, a: '10:00', de: '12:00' }).valide && !C.fenetreCreneau({ ...reglage, jours: [] }).valide, 'réglage invalide : jamais une fenêtre');

console.log('2. L\'attente du créneau du client');
const MSG = "Republication de ton lot (plus de 10 articles) en attente de ton créneau Vinted : elle partira dans ton créneau de republication, au rythme habituel — FillSell Cloud s'en charge, rien à faire de ton côté. Ton annonce est intacte, rien n'a été retiré.";
const job = { id: '8b7b607f', user_id: 'u', platform: 'vinted', action: 'republish', status: 'pending', error: MSG, created_at: '2026-11-19T13:37:00Z',
  platform_fields: { republish_source: 'manuel', republish_step: null } };
const profil = { platform_settings: { vinted: { republish_planifiee: reglage } } };
const depuis = t('2026-11-19T13:37:00Z');
ok(C.attenteCreneauClient(job, profil, { depuis, dernierDepart: t('2026-11-19T16:55:00Z'), maintenant: t('2026-11-20T08:50:00Z') }) === 'creneau_client_avance',
  'le cas du 20/11 09:50 : le lot a avancé dans le créneau d\'hier (17:55) → attente voulue');
ok(C.attenteCreneauClient(job, profil, { depuis, dernierDepart: t('2026-11-19T12:00:00Z'), maintenant: t('2026-11-20T08:50:00Z') }) === null,
  'créneau d\'hier passé SANS aucun départ depuis son ouverture → l\'alerte reste possible');
ok(C.attenteCreneauClient(job, profil, { depuis: t('2026-11-19T17:30:00Z'), dernierDepart: null, maintenant: t('2026-11-20T08:50:00Z') }) === 'creneau_client_a_venir',
  'en file après la fin du créneau d\'hier : le créneau n\'est pas encore venu');
ok(C.attenteCreneauClient(job, profil, { depuis, dernierDepart: null, maintenant: t('2026-11-20T14:30:00Z') }) === 'creneau_client_ouvert', 'créneau ouvert : pas encore « passé »');
ok(C.attenteCreneauClient({ ...job, error: 'autre chose' }, profil, { depuis, maintenant: t('2026-11-20T08:50:00Z') }) === null, 'manuelle NON retenue par le créneau (à l\'unité, petit lot) : jamais exemptée');
ok(C.attenteCreneauClient({ ...job, platform_fields: { republish_source: 'manuel', republish_step: 'deleted' } }, profil, { depuis, maintenant: t('2026-11-20T08:50:00Z') }) === null, 'étape « deleted » : elle va au bout, jamais exemptée');
ok(C.attenteCreneauClient(job, profil, { depuis, maintenant: t('2026-11-20T08:50:00Z'), retraitEngage: true }) === null, 'suppression partie : jamais exemptée');
ok(C.attenteCreneauClient(job, { platform_settings: { vinted: { republish_planifiee: { ...reglage, actif: false } } } }, { depuis, maintenant: t('2026-11-20T08:50:00Z') }) === null, 'créneau coupé : jamais exemptée');
ok(C.attenteCreneauClient({ ...job, platform: 'beebs' }, profil, { depuis, maintenant: t('2026-11-20T08:50:00Z') }) === null, 'le créneau d\'une AUTRE plateforme ne compte pas');

console.log('3. Le juge des files arrêtées (ops-digest)');
const maintenant = t('2026-11-20T08:50:00Z');
const profils = new Map([['u', { id: 'u', username: 'cliente', extension_last_seen_at: '2026-11-20T08:45:00Z', beta_flags: {}, platform_settings: { file_pause: null, vinted: { republish_planifiee: reglage } } }]]);
const avance = filesArretees({ jobs: [job], profils, derniersDeparts: new Map([['u|vinted', t('2026-11-19T16:55:00Z')]]), maintenant });
ok(avance.arretees.length === 0 && avance.attentesVoulues === 1, 'le cas 8b7b607f : jamais « file arrêtée »', JSON.stringify(avance));
const muet = filesArretees({ jobs: [job], profils, derniersDeparts: new Map([['u|vinted', t('2026-11-18T10:00:00Z')]]), maintenant });
ok(muet.arretees.length === 1, 'créneau passé sans départ, extension ouverte : alerte', JSON.stringify(muet));
const sansCreneau = new Map([['u', { ...profils.get('u'), platform_settings: { file_pause: null } }]]);
ok(filesArretees({ jobs: [job], profils: sansCreneau, derniersDeparts: new Map([['u|vinted', t('2026-11-19T16:55:00Z')]]), maintenant }).arretees.length === 1,
  'sans créneau du client : la règle d\'avant (file qui n\'avance plus depuis 6 h → alerte)');

console.log('4. ops-digest lit le créneau de chaque plateforme');
const od = fs.readFileSync('supabase/functions/ops-digest/index.ts', 'utf8');
ok(['vinted', 'leboncoin', 'beebs', 'depop'].every((p) => od.includes(`planif_${p}:platform_settings->${p}->republish_planifiee`)) && /republish_planifiee: planif_vinted \?\? null/.test(od),
  'les quatre réglages lus et remis dans platform_settings');
const aea = fs.readFileSync('supabase/functions/_shared/attente-extension-active.js', 'utf8');
ok(/import \{ attenteCreneauClient \} from "\.\/creneau-client\.js";/.test(aea) && /attenteCreneauClient\(j, profils\.get\(String\(j\.user_id\)\)/.test(aea), 'le juge applique la règle');

console.log(ko ? `✗ ${ko} échec(s) sur ${n}` : `✓ creneau-client : ${n}/${n}`);
process.exit(ko ? 1 : 0);
