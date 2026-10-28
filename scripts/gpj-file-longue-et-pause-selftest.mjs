// selftest:gpj-file-longue-et-pause — get-pending-jobs tient une longue file et
// respecte la pause de la republication automatique (15/10, P3 linda, P2 Louis).
//
//   npm run selftest:gpj-file-longue-et-pause
//
//   1. lireParLots (_shared/par-lots.ts) : lots de 400 au plus, sans doublon,
//      toutes les lignes rendues, une erreur de lot = une erreur (jamais une
//      liste partielle prise pour la vérité) — rejoué sur la file de linda
//      (781 republications Vinted + 4 Leboncoin) contre un faux PostgREST qui
//      tombe au-delà de 700 identifiants ;
//   2. la garde de boutique ne regarde QUE Vinted et lit ses fiches par lots :
//      la Table noire Leboncoin de linda n'est plus jamais retenue par elle ;
//   3. aucune lecture de masse de la file ne reste en un seul `.in()` ;
//   4. un module de republication automatique EN PAUSE retient ses jobs auto
//      (jamais annulés, étape « deleted » et retrait engagé exemptés) et le dit.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const GPJ = lire('supabase/functions/get-pending-jobs/index.ts');
const { lireParLots, decouperEnLots, TAILLE_LOT_IN } = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/par-lots.ts')).href);
const { messageRetenuePause, messageRetenueCreneau } = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/retenue-creneau.js')).href);

let echecs = 0, total = 0;
const ok = (c, l, d = '') => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}${!c && d ? `   ← ${d}` : ''}`); };

// 1. lireParLots sur la file de linda
{
  const fiches = Array.from({ length: 782 }, (_, k) => ({ id: 1791700000000 + k, vinted_account_id: k === 781 ? null : '657403' }));
  const ids = [...fiches.map((f) => f.id), ...fiches.slice(0, 50).map((f) => f.id), null, ''];
  let appels = 0;
  const fauxPostgrest = (lot) => { appels++; return Promise.resolve(lot.length > 700
    ? { data: null, error: { message: 'header too large' } }
    : { data: fiches.filter((f) => lot.includes(f.id)), error: null }); };
  const direct = await fauxPostgrest([...new Set(ids)]);
  ok(direct.error && direct.data === null, '1a. AVANT : un seul `.in()` de 782 identifiants tombe (faux PostgREST)');
  appels = 0;
  const r = await lireParLots(fauxPostgrest, ids);
  ok(!r.error && r.data.length === 782 && appels === 2, '1b. APRÈS : 2 lots de 400 au plus, 782 fiches, aucun doublon', `${r.data?.length} / ${appels} appels`);
  ok(decouperEnLots(ids).every((l) => l.length <= TAILLE_LOT_IN) && TAILLE_LOT_IN === 400, '1c. lots de 400 au plus');
  let n = 0;
  const unLotTombe = (lot) => Promise.resolve(++n === 2 ? { data: null, error: { message: 'x' } } : { data: lot.map((id) => ({ id })), error: null });
  const r2 = await lireParLots(unLotTombe, ids);
  ok(r2.data === null && r2.error, '1d. un lot en erreur = une erreur, jamais une liste partielle');
  const r3 = await lireParLots(() => { throw new Error('jamais appelé'); }, []);
  ok(!r3.error && Array.isArray(r3.data) && r3.data.length === 0, '1e. liste vide : aucune requête');
}

// 2. La garde de boutique
{
  const i = GPJ.indexOf("let heldBoutiqueEtrangere = 0;");
  const garde = GPJ.slice(i, GPJ.indexOf("heldBoutiqueEtrangere = retenus.size;", i));
  ok(i > 0 && /const operations = out\.filter\(j => j\.platform === "vinted" && \["publish", "delete", "republish"\]\.includes\(j\.action\)\);/.test(garde),
    '2a. la garde de boutique ne regarde que Vinted (Leboncoin, Beebs, eBay, Depop jamais retenus par elle)');
  ok(/await lireParLots\(\(lot\) => userClient\.from\("inventaire"\)\.select\("id,vinted_account_id"\)\.in\("id", lot\), ids\)/.test(garde),
    '2b. ses fiches se lisent par lots');
  ok(/if \(!fiable\) \{ heldBoutiqueLecture\+\+; continue; \}/.test(garde) && /faute d'avoir pu lire les fiches/.test(GPJ),
    '2c. une lecture impossible se compte et se dit (« faute d\'avoir pu lire les fiches »), jamais « boutique non prouvée »');
}

// 3. Plus aucune lecture de masse en un seul `.in()` (fiches, captures, annonces de la file)
{
  const restes = [];
  const lignes = GPJ.split('\n');
  lignes.forEach((l, k) => {
    if (/\.in\("(id|inventaire_id|vinted_item_id|listing_id)", (ids|idsVinted|capIds|invIds|items|nonVendus|\[\.\.\.new Set\()/.test(l)
      // bornées en dur (`ids.slice(0, 60)`, `idsCandidats.slice(0, 5)`) : jamais de masse
      && !/\.slice\(0, (60|5)\)\)/.test(l)
      && !/lireParLots/.test(lignes.slice(Math.max(0, k - 4), k + 1).join('\n'))) restes.push(`${k + 1}: ${l.trim().slice(0, 90)}`);
  });
  ok(restes.length === 0, '3a. aucune lecture de la file en un seul `.in()`', restes.join(' | '));
  ok((GPJ.match(/lireParLots\(/g) ?? []).length >= 28, '3b. les lectures de masse passent par lireParLots', String((GPJ.match(/lireParLots\(/g) ?? []).length));
  ok(/import \{ lireParLots \} from "\.\.\/_shared\/par-lots\.ts";/.test(GPJ), '3c. import épinglé local (aucune dépendance distante)');
}

// 4. La pause de la republication automatique
{
  ok(/if \(f\.actif !== true\) \{ out\[pf\] = \{ actif: false, dans_creneau: false, reprise: null, fin: null \}; return; \}/.test(GPJ),
    '4a. un module arrêté est noté (plus jamais ignoré)');
  ok(/if \(!f \|\| \(f\.actif && f\.dans_creneau\)\) return true;/.test(GPJ), '4b. module en pause : le job auto est retenu (hors module lu : servi, comme avant)');
  const auto = GPJ.slice(GPJ.indexOf('const autoHorsDeleted ='), GPJ.indexOf('const autoHorsDeleted =') + 400);
  ok(/pf\["republish_step"\] !== "deleted"/.test(auto) && /!retraitEngage\(j\)/.test(auto) && /pf\["republish_source"\] === "auto"/.test(auto),
    '4c. seuls les jobs AUTO non engagés (étape deleted et retrait parti exemptés, manuel jamais retenu)');
  const m = messageRetenuePause('leboncoin');
  ok(m === "Republication automatique Leboncoin en pause : elle repartira quand tu relanceras la republication automatique (Réglages). Ton annonce est intacte, rien n'a été retiré.",
    '4d. le job le dit, en clair', m);
  ok(/fenetres\[plat\]\?\.actif === false \? messageRetenuePause\(plat\) : messageRetenueCreneau\(plat, reprise\)/.test(GPJ), '4e. message de pause ≠ message de créneau');
  ok(/en attente de ton créneau/.test(messageRetenueCreneau('vinted', '2026-10-16T06:00:00Z')), '4f. le message de créneau est inchangé');
}

// 4 bis. L'app le dit aussi (file des jobs) : « en pause », jamais « en attente de ton créneau »
{
  const { situationJob } = await import(pathToFileURL(path.join(RACINE, 'src/utils/fileDesJobs.js')).href);
  const job = { id: 'x', platform: 'leboncoin', action: 'republish', status: 'pending', created_at: '2026-10-14T13:57:00Z',
    platform_fields: { republish_source: 'auto', republish_step: 'a_capturer' } };
  const enPause = situationJob(job, { creneaux: { leboncoin: { actif: false, dans_creneau: false, reprise: null } }, extension: { etat: 'ok', vu: Date.now() } });
  ok(enPause.groupe === 'en_pause' && enPause.motif === 'auto_en_pause' && /en pause : elle repartira quand tu la relanceras/.test(enPause.raison),
    '4g. app : « Republication automatique en pause » sur la carte du job', JSON.stringify(enPause));
  const horsCreneau = situationJob(job, { creneaux: { leboncoin: { actif: true, dans_creneau: false, reprise: '2026-10-16T06:00:00Z' } } });
  ok(horsCreneau.motif === 'creneau', '4h. app : hors créneau, inchangé');
}

// 5. Une republication recréée est finie (Ornella 9a7b9499)
{
  // La règle vit dans _shared/republication-finie.js (partagée avec handler-watch).
  const i = GPJ.indexOf('const finies = out.filter((j) => j.status === "pending" && republicationFinie(j));');
  const { republicationFinie } = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/republication-finie.js')).href);
  const finie = (j) => j.status === 'pending' && republicationFinie(j);
  const ornella = { action: 'republish', status: 'pending', platform_listing_id: '10352378300',
    platform_fields: { republish_step: 'recreated', recreated_at: '2026-10-12T17:39:58.638Z', old_vinted_item_id: '10070657616', new_vinted_item_id: '10352378300' } };
  ok(i > 0 && finie(ornella) === true, '5a. Ornella : recréée (10352378300 ≠ 10070657616) → close « published », jamais resservie');
  ok(finie({ ...ornella, platform_listing_id: '10070657616' }) === false, '5b. numéro encore celui de l\'ancienne annonce : servie comme avant (aucune conclusion)');
  ok(finie({ ...ornella, platform_listing_id: null }) === false, '5c. sans numéro : servie comme avant');
  ok(finie({ ...ornella, platform_fields: { ...ornella.platform_fields, republish_step: 'deleted' } }) === false, '5d. étape deleted : jamais touchée (la recréation reste à faire)');
  ok(finie({ ...ornella, platform_fields: { ...ornella.platform_fields, new_vinted_item_id: '999' } }) === false, '5e. nouvelle annonce nommée ≠ numéro du job : aucune conclusion');
  ok(/\.update\(\{ status: "published", error: null, platform_fields: pf \}\)\s*\n\s*\.eq\("id", j\.id\)\.eq\("status", "pending"\)/.test(GPJ), '5f. écriture bornée au statut pending, tracée (republication_finie)');
}

// 6. (28/10, doriane-henri — « Lot 15 DVD ») Un Leboncoin resté « en cours » retient les suivants jusqu'à sa reprise
{
  const i = GPJ.indexOf('let heldLbc = 0;');
  const bloc = i > 0 ? GPJ.slice(i, i + 4500) : '';
  ok(bloc.length > 0, '6a. la garde « un seul dépôt Leboncoin à la fois » est là');
  const m = /const LBC_ZOMBIE_MS = (\d+) \* 60_000;/.exec(bloc);
  ok(m && Number(m[1]) >= 25, '6b. un « processing » Leboncoin n\'est zombie qu\'au-delà de la reprise de l\'extension (15 min + 20 min d\'onglet au plus, vu 24 min)', m?.[1]);
  ok(/const limite = Date\.now\(\) - LBC_ZOMBIE_MS;/.test(bloc) && /if \(depuis > limite\) occupeDepots = true;/.test(bloc), '6c. les dépôts attendent la reprise (30 min)');
  ok(/const limiteTout = Date\.now\(\) - 10 \* 60_000;/.test(bloc) && /if \(depuis > limiteTout\) occupeTout = true;/.test(bloc)
    && /j\.platform !== "leboncoin" \|\| \(!occupeTout && String\(j\.action \?\? "publish"\) === "delete"\)/.test(bloc), '6c bis. un RETRAIT (vente) n\'attend jamais plus de 10 min, comme avant');
  ok(/if \(!Number\.isFinite\(depuis\)\) \{ occupeTout = true; continue; \}/.test(bloc) && !/\.update\(/.test(bloc.slice(0, bloc.indexOf('heldLbc = avant - out.length;'))), '6d. rien n\'est écrit ni refusé : les Leboncoin restent en file (horodatage illisible = vivant)');
  // Rejoué sur la soirée du 28/10 (heures UTC) : DVD repris 19:16:44 → Pyjama servi 19:28:12 (12 min) avant ; plus maintenant.
  const zombie = (depuisIso, maintenantIso, limiteMs) => Date.parse(depuisIso) <= Date.parse(maintenantIso) - limiteMs;
  ok(zombie('2026-10-28T19:16:44Z', '2026-10-28T19:28:12Z', 10 * 60_000) === true, '6e. AVANT (10 min) : à 19:28:12 le DVD passait pour zombie, Pyjama Minnie passait devant');
  ok(zombie('2026-10-28T19:16:44Z', '2026-10-28T19:28:12Z', Number(m?.[1] ?? 0) * 60_000) === false, '6f. APRÈS : à 19:28:12 le DVD tient la file ; repris à 19:41 il part le premier');
  ok(zombie('2026-10-28T19:16:44Z', '2026-10-28T19:47:00Z', Number(m?.[1] ?? 0) * 60_000) === true, '6g. 30 min sans reprise : Leboncoin repart comme avant (jamais gelé)');
}

console.log(`\n${total - echecs}/${total} contrôles verts`);
process.exit(echecs ? 1 : 0);
