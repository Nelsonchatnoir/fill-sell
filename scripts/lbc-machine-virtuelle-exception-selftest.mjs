// selftest:lbc-machine-virtuelle-exception — « LEBONCOIN AUTORISÉ SUR MACHINE VIRTUELLE » : UNE EXCEPTION PAR COMPTE
// (01/11, décision de Nico — louis-seller@ttfamily.fr), la garde machine virtuelle inchangée pour tous les autres.
//
//   npm run selftest:lbc-machine-virtuelle-exception            contrôles du dépôt (hors ligne)
//   npm run selftest:lbc-machine-virtuelle-exception -- --prod  + la base, en LECTURE seule
//
//   A. la règle pure (_shared/poste-virtuel.js) : poste virtuel + compte SANS exception → toujours bloqué ; avec
//      l'exception (booléen strict true) → servi ; poste réel → jamais bloqué ; détection du poste inchangée ;
//   B. get-pending-jobs : les DEUX points de la garde (tâches/retraits/relevés/réponse « blocages », et l'essai de levée
//      de pause) passent par gardeVirtuelleLbc ; plus aucun test nu du poste ; l'exception lue avec le réglage, absente
//      si la lecture échoue ; le message « machine virtuelle » effacé des tâches du compte avec l'exception seulement ;
//      la pause sur refus de Leboncoin (blocage_acces) n'est pas touchée ;
//   C. --prod : (01/11 après-midi) l'exception retirée de louis-seller — plus aucun compte ne la porte.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const PV = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/poste-virtuel.js')).href);
const { renduDuPoll, posteVirtuel, gardeVirtuelleLbc, lbcVirtuelAutorise, CLE_LBC_VIRTUEL_AUTORISE } = PV;
const GPJ = lire('supabase/functions/get-pending-jobs/index.ts');

let echecs = 0, total = 0;
const ok = (c, l) => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}`); };
const rv = (renderer, vendor = '') => renduDuPoll({ rendu_graphique: { webgl: true, renderer, vendor } });
const VM_LOUIS = rv('ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Google Inc. (Microsoft)');
const VMWARE = rv('ANGLE (VMware, Inc., VMware SVGA 3D Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Google Inc. (VMware, Inc.)');
const REEL = rv('ANGLE (Intel, Intel(R) UHD Graphics 630 (0x00003E92) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Google Inc. (Intel)');
const EXC = { [CLE_LBC_VIRTUEL_AUTORISE]: true };

// ── A. La règle ──────────────────────────────────────────────────────────────
ok(CLE_LBC_VIRTUEL_AUTORISE === 'lbc_machine_virtuelle_autorisee', 'A1. la clé : beta_flags.lbc_machine_virtuelle_autorisee');
ok(posteVirtuel(VM_LOUIS) && posteVirtuel(VMWARE) && !posteVirtuel(REEL), 'A2. détection du poste inchangée (pilote de machine virtuelle nommé)');
ok([{}, null, undefined, { messages_bordereaux: true }, { keepalive: true }].every((b) => gardeVirtuelleLbc(VM_LOUIS, b) === true && gardeVirtuelleLbc(VMWARE, b) === true),
  'A3. ⛔ compte SANS exception + poste virtuel → toujours bloqué (beta_flags vide, absent, autres drapeaux)');
ok([{ [CLE_LBC_VIRTUEL_AUTORISE]: 'true' }, { [CLE_LBC_VIRTUEL_AUTORISE]: 1 }, { [CLE_LBC_VIRTUEL_AUTORISE]: false },
  { [CLE_LBC_VIRTUEL_AUTORISE]: null }, { lbc_machine_virtuelle: true }, 'lbc_machine_virtuelle_autorisee'].every((b) => gardeVirtuelleLbc(VM_LOUIS, b) === true),
  'A4. seule la valeur booléenne true ouvre l\'exception (« true » en texte, 1, false, null, autre clé : bloqué)');
ok(gardeVirtuelleLbc(VM_LOUIS, EXC) === false && gardeVirtuelleLbc(VMWARE, EXC) === false && lbcVirtuelAutorise(EXC),
  'A5. compte AVEC l\'exception + poste virtuel → servi');
ok(gardeVirtuelleLbc(REEL, {}) === false && gardeVirtuelleLbc(REEL, EXC) === false && gardeVirtuelleLbc(null, {}) === false,
  'A6. poste réel ou rendu inconnu : jamais bloqué (comme avant), avec ou sans exception');

// ── B. get-pending-jobs ──────────────────────────────────────────────────────
ok(GPJ.split('posteVirtuel(renduDuPoll(body))').length === 2 && GPJ.includes('posteVirtuel(renduDuPoll(body)) && lbcVirtuelAutorise(betaFlagsLbc)'),
  'B1. plus aucun test nu du poste qui bloque (le seul restant ouvre la branche de l\'exception)');
ok(GPJ.includes('const essaiPossible = posteCloud || !gardeVirtuelleLbc(renduDuPoll(body), betaFlagsLbc);'),
  'B2. essai de levée de pause : possible sur la machine virtuelle du compte avec l\'exception, jamais sans');
ok(GPJ.includes('if (!includeProcessing && !includeNeedsUser && !posteCloud && gardeVirtuelleLbc(renduDuPoll(body), betaFlagsLbc)) {'),
  'B3. garde des tâches, retraits, relevés et de la réponse « blocages » : par gardeVirtuelleLbc');
const iGarde = GPJ.indexOf('gardeVirtuelleLbc(renduDuPoll(body), betaFlagsLbc)) {');
const garde = GPJ.slice(iGarde, GPJ.indexOf('// Point C : seule la file d\'exécution réserve.', iGarde));
ok(/out = out\.filter\(\(j\) => !idsV\.has/.test(garde) && /syncCommandsAnnonces = syncCommandsAnnonces\.filter\(\(c\) => c\.platform !== "leboncoin"\)/.test(garde)
  && /etat: "poste_virtuel"/.test(garde), 'B4. le corps de la garde est intact (tâches retenues, relevés retirés, pause de l\'extension)');
ok(GPJ.includes('.select("platform_settings, beta_flags").eq("id", user.id)') && GPJ.includes('let betaFlagsLbc: Record<string, unknown> | null = null;'),
  'B5. l\'exception est lue avec le réglage ; lecture impossible → null → garde appliquée');
const iExc = GPJ.indexOf('posteVirtuel(renduDuPoll(body)) && lbcVirtuelAutorise(betaFlagsLbc)) {');
const exc = GPJ.slice(iExc, GPJ.indexOf('// Point C : seule la file d\'exécution réserve.', iExc));
ok(iExc > iGarde && /\.eq\("user_id", user\.id\)\.eq\("platform", "leboncoin"\)\.eq\("status", "pending"\)\.eq\("error", msgX\)/.test(exc)
  && /\.eq\("status", "pending"\)\.eq\("error", msgX\);/.test(exc) && /archiverErreur/.test(exc),
  'B6. avec l\'exception : seul le message « machine virtuelle » des tâches Leboncoin en attente du compte s\'efface (archivé)');
ok(!/blocage_acces|platform_settings_fusionner|status: "pending"|status: "cancelled"/.test(exc),
  'B7. la branche de l\'exception ne touche ni la pause sur refus (blocage_acces), ni le statut d\'aucune tâche');
ok(GPJ.includes('import { renduDuPoll, posteVirtuel, messagePosteVirtuelLbc, gardeVirtuelleLbc, lbcVirtuelAutorise } from "../_shared/poste-virtuel.js";'),
  'B8. la règle vient du module partagé');

// ── C. --prod (LECTURE seule) ────────────────────────────────────────────────
if (process.argv.includes('--prod')) {
  const sql = `select jsonb_build_object(
    'comptes', (select jsonb_agg(u.email order by u.email) from public.profiles p join auth.users u on u.id = p.id
                 where p.beta_flags -> '${CLE_LBC_VIRTUEL_AUTORISE}' = 'true'::jsonb),
    'autres_valeurs', (select count(*) from public.profiles p where p.beta_flags ? '${CLE_LBC_VIRTUEL_AUTORISE}'
                 and p.beta_flags -> '${CLE_LBC_VIRTUEL_AUTORISE}' <> 'true'::jsonb)) as r;`;
  const fichier = path.join(os.tmpdir(), `lbc-vm-exception-prod-${process.pid}.sql`);
  writeFileSync(fichier, sql, 'utf8');
  const res = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', `"${fichier}"`], { cwd: RACINE, encoding: 'utf8', shell: true });
  try { unlinkSync(fichier); } catch { /* fichier temporaire */ }
  const txt = String(res.stdout ?? '');
  let r = null;
  try { r = JSON.parse(txt.slice(txt.indexOf('{'))).rows?.[0]?.r; } catch { r = null; }
  // (01/11 après-midi, décision de Nico) L'exception est RETIRÉE de louis-seller : son Leboncoin passe par Amiral
  // (délégation, selftest:delegation-leboncoin). La règle reste (garde par compte), plus aucun compte ne la porte.
  ok(r && r.comptes == null && r.autres_valeurs === 0,
    `PROD. plus aucun compte avec l'exception (retirée de louis-seller le 01/11, délégation à Amiral) : ${JSON.stringify(r)}`);
}

console.log(echecs ? `\n✗ ${echecs} échec(s) sur ${total}` : `\n✓ ${total} vérifications vertes`);
process.exit(echecs ? 1 : 0);
