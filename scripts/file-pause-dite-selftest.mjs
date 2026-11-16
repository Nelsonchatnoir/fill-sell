// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU POINT 5 (a, b) DU LOT DU 16/11/2026 MIDI — UNE TÂCHE RETENUE PAR LA PAUSE LE DIT, PUBLICATION COMPRISE
//     npm run selftest:file-pause-dite
// ═══════════════════════════════════════════════════════════════════════════
// Constat (contact.grizstyle, Pro) : 88 tâches en attente depuis le 06/11 sans AUCUN message — 40 republications Vinted,
// 23 republications Leboncoin, 24 publications Leboncoin neuves, 1 publication Vinted. Cause : sa file est EN PAUSE à sa
// demande depuis le 05/11 22:25 ; get-pending-jobs n'écrivait le texte de la pause que sur une republication qui disait
// exactement « En file : … ». Les publications neuves n'attendaient PAS un créneau de republication : la pause seule.
// Parc le 16/11 : 4 comptes en pause, 158 tâches retenues, 120 sans aucun texte.
// Ce test prouve :
//   A. la règle pure (_shared/pause-dite.js) : publication et republication retenues reçoivent le texte de la pause quand
//      elles ne disent rien ou seulement une attente (En file, créneau, créneau d'un lot) ; un texte qui explique autre
//      chose est gardé ; un texte déjà juste n'est jamais réécrit ; la reprise rend « En file » ou rien ;
//   B. le rejeu des 88 tâches de contact.grizstyle (forme réelle : texte vide) : 88 textes écrits, 0 avant ;
//   C. get-pending-jobs l'applique à TOUTES les tâches retenues (plus le filtre « republish + En file » seul), et efface le
//      texte d'une publication à la reprise ;
//   D. l'écran de suivi d'une publication lit la pause (« En pause à ta demande », jamais « En file ») ;
//   E. l'app traduit le nouveau texte (messagesServeur).
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 500)}` : ''}`); }
};
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const importer = async (p) => { try { return await import(new URL(`../${p}`, import.meta.url).href); } catch (e) { console.log(`  (module ${p} : ${String(e?.message ?? e).slice(0, 140)})`); return null; } };

const PD = await importer('supabase/functions/_shared/pause-dite.js');
const FP = await importer('supabase/functions/_shared/file-pause.js');
const RH = await importer('supabase/functions/_shared/retenue-hors-ligne.js');
const RC = await importer('supabase/functions/_shared/retenue-creneau.js');

console.log('\nA. La règle pure');
const P = PD?.MESSAGE_PUBLICATION_EN_PAUSE, R = FP?.MESSAGE_REPUBLICATION_EN_PAUSE, F = RH?.MESSAGE_EN_FILE;
const t = (job) => PD?.texteSousPause?.(job);
ok(typeof P === 'string' && /^En pause à ta demande : ta publication partira quand tu reprendras ta file/.test(P), 'le texte d’une publication en pause existe', P);
ok(t({ action: 'publish', error: null }) === P, 'publication retenue, sans texte → « En pause à ta demande : ta publication partira… »');
ok(t({ action: 'republish', error: null }) === R, 'republication retenue, sans texte → le texte de la pause (avant : rien)');
ok(t({ action: 'republish', error: F }) === R, 'republication « En file » → le texte de la pause (inchangé)');
const creneau = RC?.messageRetenueCreneau?.('vinted');
ok(creneau && t({ action: 'republish', error: creneau }) === R, 'republication « en attente de ton créneau » → la pause passe devant (c’est elle qui retient)', creneau);
ok(t({ action: 'publish', error: 'Leboncoin a refusé cette annonce, et elle repartirait à l’identique…' }) === null, 'un texte qui explique autre chose (un refus) est gardé');
ok(t({ action: 'publish', error: P }) === null && t({ action: 'republish', error: R }) === null, 'un texte déjà juste n’est jamais réécrit');
ok(t({ action: 'delete', error: null }) === null, 'un retrait n’est jamais en pause');
ok(PD?.texteApresReprise?.({ error: R }) === F && PD?.texteApresReprise?.({ error: P }) === null && PD?.texteApresReprise?.({ error: 'autre' }) === undefined,
  'à la reprise : republication → « En file », publication → rien, autre texte → inchangé');

console.log('\nB. Rejeu de contact.grizstyle (88 tâches retenues, texte vide)');
{
  const jobs = [
    ...Array.from({ length: 40 }, (_, i) => ({ id: `rv${i}`, action: 'republish', platform: 'vinted', status: 'pending', error: null })),
    ...Array.from({ length: 23 }, (_, i) => ({ id: `rl${i}`, action: 'republish', platform: 'leboncoin', status: 'pending', error: null })),
    ...Array.from({ length: 24 }, (_, i) => ({ id: `pl${i}`, action: 'publish', platform: 'leboncoin', status: 'pending', error: null })),
    { id: 'pv0', action: 'publish', platform: 'vinted', status: 'pending', error: null },
  ];
  const retenus = jobs.filter((j) => FP?.jobRetenuParPause?.(j));
  const avant = retenus.filter((j) => j.action === 'republish' && j.error === F).length;
  const apres = retenus.filter((j) => t(j)).length;
  ok(retenus.length === 88 && avant === 0 && apres === 88, `les 88 sont retenues par la pause ; textes écrits : ${avant} avant, ${apres} après`);
}

console.log('\nC. get-pending-jobs');
{
  const g = lire('supabase/functions/get-pending-jobs/index.ts');
  ok(/import \{ texteSousPause, MESSAGE_PUBLICATION_EN_PAUSE \} from "\.\.\/_shared\/pause-dite\.js";/.test(g), 'importe la règle (_shared/pause-dite.js)');
  ok(/const apres = texteSousPause\(j\);/.test(g) && !/j\.action === "republish" && j\.error === MESSAGE_EN_FILE\)\.map/.test(g), 'toutes les tâches retenues (plus « republish + En file » seul)');
  ok(/\.update\(\{ error: null \}\)\s*\.eq\("user_id", user\.id\)\.eq\("status", "pending"\)\.eq\("error", MESSAGE_PUBLICATION_EN_PAUSE\)/.test(g), 'à la reprise, le texte d’une publication s’efface');
}

console.log('\nD. L’écran de suivi d’une publication');
{
  const e = lire('src/publication/EcranSuivi.jsx');
  ok(/useEtatFile\(/.test(e) && /filePause: etatFile\.pause === true/.test(e), 'EcranSuivi passe filePause à la barre (etatJob → « En pause à ta demande »)');
}

console.log('\nE. La traduction');
ok(lire('src/utils/messagesServeur.js').includes("ta publication partira quand tu reprendras ta file (bouton « Reprendre » du Stock). Rien n'a été envoyé."), 'messagesServeur : le nouveau texte a son anglais');

console.log(`\n${verts} verts, ${rouges} rouges`);
process.exit(rouges ? 1 : 0);
