// ═══════════════════════════════════════════════════════════════════════════
// « TA CONNEXION VINTED EST BONNE » NE SE DIT PAS CONTRE LA CAPTURE — SELFTEST (02/11, stephanie.heline)
// ═══════════════════════════════════════════════════════════════════════════
// 17 republications Vinted affichaient « Ta connexion Vinted est bonne » alors que
// la capture avait PROUVÉ l'absence de session (403, cookie de connexion absent :
// capture_echec.cause403 = « session_absente ») et que l'extension avait envoyé
// needs_user « connecte-toi ». update-job-status requalifiait sur
// extension_sessions.vinted === true, valeur GARDÉE par une sonde muette (403) :
// un « true » de 09:09Z relu à 10:51Z.
// La règle : (1) la capture qui prouve l'absence garde son needs_user ; (2) sinon
// « connexion bonne » exige la preuve de _shared/session-prouvee.js (< 30 min, ce poste).
//
//   npm run selftest:session-bonne-capture
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sondeProuveSession } from '../supabase/functions/_shared/session-prouvee.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

const src = lire('supabase/functions/update-job-status/index.ts');
const iBloc = src.indexOf('(02/11, stephanie.heline — tout le parc)');
ok(iBloc > 0, 'update-job-status porte la règle du 02/11');
const bloc = src.slice(iBloc, src.indexOf('requalification session bonne :', iBloc));
const iAbsente = bloc.indexOf('=== "session_absente"');
const iSonde = bloc.indexOf('sondeProuveSession(');
const iBonne = bloc.indexOf('Ta connexion Vinted est bonne, " +');
ok(iAbsente > 0 && iSonde > iAbsente && iBonne > iSonde,
  'ordre : la capture « session_absente » d\'abord, puis la preuve sondeProuveSession, puis seulement le message « connexion bonne »');
ok(/if \(sondeSb\.bonne\) \{/.test(bloc), '« connexion bonne » dépend de sondeSb.bonne');
ok(!/s\["vinted"\] === true/.test(bloc), 'plus aucune lecture brute de extension_sessions.vinted === true dans ce bloc');
ok(/select\("extension_sessions, extension_postes"\)/.test(bloc), 'les postes sont lus (la preuve est celle de CE poste)');
// La branche session_absente ne touche ni au statut ni au message.
const brancheAbsente = bloc.slice(iAbsente, bloc.indexOf('} else if', iAbsente));
ok(!/statutEffectif\s*=|messageEffectif\s*=/.test(brancheAbsente), 'session_absente : statut needs_user et message de l\'extension gardés');

// Le cas réel (profiles.extension_sessions de stephanie.heline le 02/11, 10:51:52Z).
const sessions = {
  vinted: true, http: { vinted: 403 }, sondees: ['vinted'],
  checked_at: '2026-11-02T10:47:43.775Z',
  checked_at_par_plateforme: { vinted: '2026-11-02T09:09:37.706Z' },
  sonde_muette: { vinted: { le: '2026-11-02T10:47:43.775Z', http: 403 } },
  previous: { vinted: true, checked_at: '2026-11-02T10:37:43.243Z', checked_at_par_plateforme: { vinted: '2026-11-02T09:09:37.706Z' } },
};
const maintenant = Date.parse('2026-11-02T10:51:52.532Z');
ok(sondeProuveSession({ platform: 'vinted', sessionsCompte: sessions, poste: null, autresPostesVivants: 0, maintenant }).bonne === false,
  'cas réel : un « true » gardé depuis 09:09Z (sonde muette ensuite) ne prouve rien à 10:51Z');
const frais = { ...sessions, checked_at_par_plateforme: { vinted: '2026-11-02T10:40:00.000Z' } };
ok(sondeProuveSession({ platform: 'vinted', sessionsCompte: frais, poste: null, autresPostesVivants: 0, maintenant }).bonne === true,
  'une sonde « connecté » de moins de 30 min, poste unique : la reprise espacée « connexion bonne » reste possible');
ok(sondeProuveSession({ platform: 'vinted', sessionsCompte: frais, poste: null, autresPostesVivants: 1, maintenant }).bonne === false,
  'deux postes vivants : la sonde du compte ne prouve rien pour celui-ci');

// L'extension écrit bien la preuve que le serveur lit (même clé, même valeur).
const bg = lire('chrome-extension/background.js');
ok(/pf\.capture_echec\.cause403 = cause403;/.test(bg) && /cause403 === "session_absente"/.test(bg) && /pf\.needs_user_source = "session_vinted";/.test(bg),
  'l\'extension pose capture_echec.cause403 et needs_user_source session_vinted');

console.log(ko ? `\n✗ ${ko} échec(s)` : '\n✓ tout est vert');
process.exit(ko ? 1 : 0);
