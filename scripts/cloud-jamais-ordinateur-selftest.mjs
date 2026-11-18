// VERROU — 18/11/2026, lot T2 point 1 (ordre de Nico) : « Un compte sur le Cloud (cloud_voie = true) ne doit plus jamais
// lire un message qui parle d'extension, de Chrome ou d'ordinateur. Corrige la RÈGLE (un seul endroit qui choisit le
// texte selon la voie). Rattrape les messages déjà posés sur les jobs en attente des comptes Cloud. »
// Cas : 2f8b09d2 (260 republications de lot) et a962a59e (195) lisaient « elle partira dans ton créneau… si Chrome
// est ouvert sur ton ordinateur à ce moment-là » : get-pending-jobs écrivait le texte de l'extension pour tout le monde, la
// fenêtre de la tâche (jobErrorSansFaussePromesse) montrait ce texte BRUT, et le filtre de l'app (texteTacheCloud) retirait
// la phrase entière avec la condition (« Ton annonce est intacte, rien n'a été retiré. » restait seul).
// Ce verrou casse si :
//   1. un seul texte du poste des corpus réels du parc (scripts/corpus/*.json) ressort, pour un compte Cloud, avec
//      « Chrome / ordinateur / extension / navigateur », vide, ou s'il change pour un compte sans Cloud ;
//   2. les retenues de créneau, de lot et de pause perdent leur sens au Cloud (« créneau », « intacte ») ;
//   3. la fenêtre de la tâche ou humanizeJobError montre « Chrome » à un compte Cloud (le chemin du 18/11) ;
//   4. get-pending-jobs n'écrit plus ses retenues par la règle (selonVoie), ou compare au texte de l'extension (pas de
//      rattrapage des textes déjà posés) ; 5. l'écran des créneaux ne passe plus sa sortie par la règle.
//   (node --import ./scripts/loader-ext.mjs scripts/cloud-jamais-ordinateur-selftest.mjs)
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8');
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log('  ✓', m); else { ko++; console.log('  ✗', m, d === undefined ? '' : String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 400)); } };
const DU_POSTE = /\b(chrome|ordinateur|extension|navigateur|computer|browser)\b/i;

let V = null;
try { V = await import('../supabase/functions/_shared/texte-voie.js'); } catch (e) { ok(false, 'la règle unique supabase/functions/_shared/texte-voie.js existe', e.message); }
const texteSelonVoie = V?.texteSelonVoie ?? ((t) => t);

console.log('1. Les corpus réels du parc : aucun texte du poste au Cloud, rien ne change sans Cloud');
{
  const vus = new Set();
  let total = 0, rates = [], changes = [];
  for (const f of ['scripts/corpus/messages-serveur-2026-11-06.json', 'scripts/corpus/messages-montres-2026-10-03.json', 'scripts/corpus/messages-parc-2026-09-21.json']) {
    for (const m of JSON.parse(lire(f))) {
      const t = m?.t;
      if (!t || vus.has(t)) continue;
      vus.add(t);
      if (texteSelonVoie(t, { cloud: false, nom: 'Vinted' }) !== t) changes.push(t);
      if (!DU_POSTE.test(t)) continue;
      total++;
      const s = texteSelonVoie(t, { cloud: true, nom: 'Vinted' });
      if (!s || !s.trim() || DU_POSTE.test(s)) rates.push(`${t.slice(0, 120)} → ${String(s).slice(0, 120)}`);
    }
  }
  ok(total >= 40, `les corpus portent des textes du poste (${total})`);
  ok(rates.length === 0, `aucun ne ressort avec « Chrome / ordinateur / extension » ni vide au Cloud (${rates.length} sur ${total})`, rates.slice(0, 3));
  ok(changes.length === 0, 'sans Cloud : chaque texte ressort tel quel, à l\'octet', changes.slice(0, 2));
}

console.log('2. Les retenues de créneau, de lot et de pause gardent leur sens au Cloud');
{
  const { messageRetenueLotCreneau } = await import('../supabase/functions/_shared/lot-manuel-creneau.js');
  const { messageRetenueCreneau, messageRetenuePause } = await import('../supabase/functions/_shared/retenue-creneau.js');
  const lot = texteSelonVoie(messageRetenueLotCreneau('vinted'), { cloud: true, nom: 'Vinted' });
  ok(/elle partira dans ton créneau de republication, au rythme habituel/.test(lot) && /FillSell Cloud s'en charge/.test(lot) && /intacte/.test(lot) && !DU_POSTE.test(lot),
    'le lot (2f8b09d2, a962a59e) : « elle partira dans ton créneau… — FillSell Cloud s\'en charge », annonce intacte', lot);
  const auto = texteSelonVoie(messageRetenueCreneau('leboncoin', null), { cloud: true, nom: 'Leboncoin' });
  ok(/à l'ouverture de ton prochain créneau/.test(auto) && /FillSell Cloud s'en charge/.test(auto) && !DU_POSTE.test(auto), 'l\'automatique : « à l\'ouverture de ton prochain créneau » reste', auto);
  const pause = messageRetenuePause('beebs');
  ok(texteSelonVoie(pause, { cloud: true, nom: 'Beebs' }) === pause, 'la pause (aucun mot du poste) : inchangée');
  ok(texteSelonVoie(messageRetenueLotCreneau('vinted'), { cloud: false }) === messageRetenueLotCreneau('vinted'), 'sans Cloud : le texte de l\'extension, inchangé');
  const ebay = texteSelonVoie('Ton compte eBay n\'est pas encore prêt pour vendre. Connecte-toi à eBay sur ton ordinateur et termine ton inscription vendeur, puis relance la publication.', { cloud: true, nom: 'eBay', executant: 'serveurs' });
  ok(/termine ton inscription vendeur/.test(ebay) && /depuis ton téléphone/.test(ebay) && !DU_POSTE.test(ebay) && !/Cloud/.test(ebay), 'eBay par l\'API : le geste de compte reste, « depuis ton téléphone », jamais « FillSell Cloud »', ebay);
  ok(texteSelonVoie('si Chrome est ouvert', { cloud: true }) === 'avec FillSell Cloud', 'l\'étiquette courte de l\'écran des créneaux : « avec FillSell Cloud »');
}

console.log('3. L\'app : la fenêtre de la tâche et humanizeJobError, pour un compte Cloud');
{
  const { noterCompteCourantCloud } = await import('../src/cloud/voieCloud.js');
  const S = await import('../src/utils/shared.js');
  const { messageRetenueLotCreneau } = await import('../supabase/functions/_shared/lot-manuel-creneau.js');
  const job = { id: 'j1', platform: 'vinted', action: 'republish', status: 'pending', error: messageRetenueLotCreneau('vinted'), platform_fields: { republish_step: 'a_capturer' } };
  noterCompteCourantCloud(true);
  const brut = S.jobErrorSansFaussePromesse(job, 'fr');
  ok(!DU_POSTE.test(brut) && /créneau/.test(brut), 'jobErrorSansFaussePromesse (la fenêtre de la tâche, le chemin du 18/11) : jamais « Chrome » au Cloud', brut);
  const humain = S.humanizeJobError(job, 'fr');
  ok(!DU_POSTE.test(humain) && /créneau/.test(humain), 'humanizeJobError : la même règle, le sens gardé', humain);
  ok(typeof S.texteTacheSelonVoie === 'function', 'la porte commune texteTacheSelonVoie existe (utils/shared.js)');
  const ebayJob = { id: 'j2', platform: 'ebay', voie: 'api', action: 'publish', status: 'needs_user', error: 'Ton compte eBay n\'est pas encore prêt pour vendre. Connecte-toi à eBay sur ton ordinateur et termine ton inscription vendeur, puis relance la publication.' };
  ok(!DU_POSTE.test(S.jobErrorSansFaussePromesse(ebayJob, 'fr')), 'une tâche eBay d\'un compte Cloud : jamais « ordinateur » non plus', S.jobErrorSansFaussePromesse(ebayJob, 'fr'));
  noterCompteCourantCloud(false);
  ok(S.jobErrorSansFaussePromesse(job, 'fr') === job.error, 'compte sans Cloud : le texte brut d\'avant, à l\'octet');
}

console.log('4. Le serveur écrit ses retenues par la règle, et rattrape les textes déjà posés');
{
  const g = lire('supabase/functions/get-pending-jobs/index.ts');
  ok(/import \{ texteSelonVoie \} from "\.\.\/_shared\/texte-voie\.js";/.test(g), 'get-pending-jobs importe la règle');
  ok(/const voieCloudDuCompte = posteCloud \|\| cloudVoie === true;/.test(g), 'la voie : le poste Cloud qui relève, ou le drapeau cloud_voie du compte');
  ok(/!== msgLotCreneau\(plat\)\)/.test(g) && /update\(\{ error: msgLotCreneau\(plat\) \}\)/.test(g) && !/update\(\{ error: messageRetenueLotCreneau\(plat\) \}\)/.test(g),
    'lot : comparé ET écrit avec le texte de la voie (un texte de l\'extension déjà posé est réécrit au passage suivant)');
  ok(/const msg = selonVoie\(fenetres\[plat\]\?\.actif === false \? messageRetenuePause\(plat\) : messageRetenueCreneau\(plat, reprise\), plat\);/.test(g), 'créneau et pause de l\'automatique : par la règle');
  const vc = lire('src/cloud/voieCloud.js');
  ok(/texteSelonVoie\(String\(texte \?\? ''\), \{ cloud: true, nom, lang \}\)/.test(vc) && !/const VERS_SON_NAVIGATEUR/.test(vc), 'voieCloud.texteTacheCloud ne décide plus rien : il appelle la règle (une seule copie)');
}

console.log('5. L\'écran des créneaux passe sa sortie par la règle');
{
  const r = lire('src/components/RepublicationPlanifiee.jsx');
  ok(/etatLigne = pourLaVoie\(etatLigne, fr\);/.test(r) && /titre: pourLaVoie\(avis\.titre, fr\), corps: pourLaVoie\(avis\.corps, fr\)/.test(r), 'synthese : ligne d\'état et avis selon la voie');
  ok(/pourLaVoie\(fr \? 'si Chrome est ouvert' : 'if Chrome is open', fr\)/.test(r) && /pourLaVoie\(s\.dans/.test(r), 'les phrases du nombre attendu selon la voie');
}

console.log(ko ? `\n${ko} échec(s) sur ${n}` : `\nOK ${n}/${n}`);
process.exit(ko ? 1 : 0);
