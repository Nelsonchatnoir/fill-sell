// Verrou du complément de Nico à l'étape 1 (12/11/2026, lot « zéro problème ») : UN CLIENT CLOUD NE LIT JAMAIS « TON
// ORDINATEUR », ET SES DEMANDES DE RELEVÉ ONT UN EXÉCUTANT SERVEUR OU UN GESTE CLAIR.
//
//     npm run selftest:cloud-releves-sans-ordinateur
//
// Le cas réel (compte b695d990, essai du Cloud par Stripe jusqu'au 17/11) : deux relevés eBay demandés depuis l'app
// (12/11 09:35 et 15:36) ont expiré après 6 h avec « ton ordinateur n'avait pas Chrome ouvert avec l'extension
// FillSell », alors que son relevé Vinted était fait par le Cloud. Causes prouvées : la copie Cloud de l'extension ne porte
// que Vinted, Leboncoin, Beebs et Depop — eBay d'un client Cloud passe par l'API d'eBay, et SON eBay n'était pas relié à
// FillSell (aucune ligne ebay_accounts, ebay_voie_api faux) : la demande attendait un ordinateur ; puis le poll du POSTE
// CLOUD l'a redemandée (« app:redemande ») alors qu'il ne sait pas la faire → seconde expiration ; le texte d'expiration
// de handler-watch ne regardait pas le compte. (is_cloud faux pendant l'essai : voulu — is_cloud = Cloud PAYÉ ; l'essai
// vit dans cloud_essai_debut / cloud_essai_fin, l'exécutant dans cloud_voie.)
// Ce test prouve, sans réseau ni base :
//   1. demandeExecutablePar : le poste Cloud ne prend (ni ne redemande) jamais eBay ni une « connexion » ; l'ordinateur
//      d'un compte au Cloud actif ne prend jamais une demande laissée au Cloud ; rien ne change pour les autres comptes ;
//   2. texteDemandeExpireeCloud : pour TOUTES les plateformes et situations, jamais « ordinateur », « Chrome » ni
//      « extension » ; eBay non relié → le geste « relie ton compte eBay » ; les lignes du cas réel rejouées ;
//   3. le câblage serveur : handler-watch écrit le texte du Cloud pour un compte au Cloud actif et garde le texte d'avant,
//      mot pour mot, pour les autres ; get-pending-jobs ne redemande que ce que le poste qui poll sait faire ;
//   4. l'app : « Synchroniser » eBay d'un client Cloud dont l'eBay n'est pas relié ne part pas (geste « relier »), sans
//      ouvrir l'écran de connexion du Cloud ; drapeau pas encore lu → rien n'est refusé ; chaque phrase de fin d'un
//      relevé du Cloud ne parle jamais de l'ordinateur.
import { readFileSync } from 'node:fs';

const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let echecs = 0, passes = 0;
const ok = (c, m, d) => { if (c) passes++; else { echecs++; console.error(`✗ ${m}${d !== undefined ? ` — ${typeof d === 'string' ? d : JSON.stringify(d)}` : ''}`); } };
const ORDI = /ordinateur|chrome|extension|computer/i;

let V = null;
try { V = await import('../supabase/functions/_shared/cloud-voie.js'); } catch (e) { ok(false, 'cloud-voie.js se charge', String(e?.message ?? e)); }
const aV = V && typeof V.demandeExecutablePar === 'function' && typeof V.texteDemandeExpireeCloud === 'function';
ok(aV, 'les règles demandeExecutablePar et texteDemandeExpireeCloud existent');

// ── 1. Qui exécute ──────────────────────────────────────────────────────────────────────────────────────────────────
if (aV) {
  const ex = (c, o) => V.demandeExecutablePar(c, o);
  ok(ex({ kind: 'annonces', platform: 'ebay' }, { posteCloud: true, cloudVoie: true }) === false, 'poste Cloud : jamais eBay (la copie Cloud n’a pas eBay) — le cas réel');
  ok(ex({ kind: 'connexion', platform: 'vinted' }, { posteCloud: true, cloudVoie: true }) === false, 'poste Cloud : jamais une demande « connexion »');
  ok(['vinted', 'leboncoin', 'beebs', 'depop'].every((p) => ex({ kind: 'annonces', platform: p }, { posteCloud: true, cloudVoie: true })) && ex({ kind: 'dressing' }, { posteCloud: true, cloudVoie: true }),
    'poste Cloud : ses quatre plateformes et le dressing Vinted');
  ok(ex({ kind: 'annonces', platform: 'leboncoin' }, { posteCloud: false, cloudVoie: true }) === false && ex({ kind: 'dressing' }, { posteCloud: false, cloudVoie: true }) === false,
    'ordinateur d’un compte au Cloud actif : jamais une demande laissée au Cloud');
  ok(ex({ kind: 'annonces', platform: 'ebay' }, { posteCloud: false, cloudVoie: true }) === true, 'ordinateur d’un compte au Cloud actif : eBay reste à lui (s’il revient)');
  ok(['vinted', 'leboncoin', 'beebs', 'depop', 'ebay'].every((p) => ex({ kind: 'annonces', platform: p }, { posteCloud: false, cloudVoie: false }) && ex({ kind: 'annonces', platform: p }, { posteCloud: false, cloudVoie: null })),
    'compte sans Cloud (ou drapeau illisible) : rien ne change');
}

// ── 2. Les textes d'expiration du Cloud ─────────────────────────────────────────────────────────────────────────────
if (aV) {
  const textes = [];
  for (const kind of ['annonces', 'dressing', 'connexion']) for (const platform of ['vinted', 'leboncoin', 'beebs', 'depop', 'ebay', 'opla', null])
    for (const ebayRelie of [true, false, null]) for (const connecteCloud of [true, false, null]) textes.push(V.texteDemandeExpireeCloud({ kind, platform, ebayRelie, connecteCloud }));
  const fautifs = [...new Set(textes.filter((t) => ORDI.test(t)))];
  ok(fautifs.length === 0, `aucun des ${textes.length} textes d’un client Cloud ne parle d’ordinateur, de Chrome ni d’extension`, fautifs.join(' | '));
  ok(textes.every((t) => /^\[cloud:(relier_ebay|ebay_api|connecter|pas_pris)\] /.test(t)), 'chaque texte porte son marqueur du Cloud (lu par l’app)');
  // Les deux lignes réelles du compte b695d990 (eBay non relié, coffre : Vinted seul).
  const reel = V.texteDemandeExpireeCloud({ kind: 'annonces', platform: 'ebay', ebayRelie: false, connecteCloud: false });
  ok(/^\[cloud:relier_ebay\] /.test(reel) && /relie ton compte eBay à FillSell/.test(reel), 'le cas réel (relevé eBay, eBay non relié) : « relie ton compte eBay à FillSell »', reel);
  ok(/^\[cloud:connecter\] Leboncoin n'est pas connecté à FillSell Cloud/.test(V.texteDemandeExpireeCloud({ kind: 'annonces', platform: 'leboncoin', nom: 'Leboncoin', connecteCloud: false })), 'plateforme du Cloud pas connectée : « connecte-le »');
  ok(/^\[cloud:pas_pris\] /.test(V.texteDemandeExpireeCloud({ kind: 'dressing', connecteCloud: true })), 'Vinted connecté mais pas pris à temps : « Synchroniser » la relance');
}

// ── 3. Le câblage serveur ───────────────────────────────────────────────────────────────────────────────────────────
const hw = lire('supabase/functions/handler-watch/index.ts');
ok(/import \{ texteDemandeExpireeCloud \} from "\.\.\/_shared\/cloud-voie\.js";/.test(hw), 'handler-watch importe la règle du Cloud');
ok(/\.select\("id, ebay_voie_api"\)\.in\("id", comptes\.slice\(i, i \+ 100\)\)\.eq\("cloud_voie", true\)/.test(hw), 'handler-watch lit, par lots, les comptes au Cloud actif des demandes à expirer');
ok(/const texte = c\n\s*\? texteDemandeExpireeCloud\(/.test(hw), 'handler-watch : compte au Cloud actif → texte du Cloud');
ok(hw.includes("const TEXTE_ORDI_RELEVE = `demande jamais réclamée en ${SYNC_QUEUE_TTL_H} h — ton ordinateur n'avait pas Chrome ouvert avec ` +\n      \"l'extension FillSell. Elle repartira toute seule dès que Chrome se rouvrira avec l'extension : rien à faire.\";"),
  'handler-watch : les autres comptes gardent le texte d’avant, mot pour mot');
ok(/\.in\("id", ids\)\n\s*\.eq\("status", "queued"\)/.test(hw), 'handler-watch : chaque écriture ne touche qu’une ligne encore en file (compare-and-swap)');
const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
const iEx = gpj.indexOf('if (!demandeExecutablePar({ kind, platform: pf }, { cloudVoie, posteCloud })) continue;');
const iIns = gpj.indexOf('declencheur: `${origine}:redemande`');
ok(iEx > 0 && iIns > iEx, 'get-pending-jobs : une demande expirée n’est redemandée que si CE poste sait la faire (avant l’insertion)');
ok(/import \{[^}]*\bdemandeExecutablePar\b[^}]*\} from "\.\.\/_shared\/cloud-voie\.js";/.test(gpj), 'get-pending-jobs importe la règle');

// ── 4. L'app ────────────────────────────────────────────────────────────────────────────────────────────────────────
const CX = await import('../src/cloud/connexionsCloud.js');
const etat = (ebayApi) => ({ clientCloud: true, lu: true, etats: { vinted: { connecte: true } }, isoles: [], avancement: { total: 1, connectees: 1, aucune: false, toutes: true, aConnecter: [] }, ebayApi });
const r = CX.refusSyncCloud(etat(false), 'ebay', 'fr');
ok(r?.geste === 'relier_ebay' && /Relie ton compte eBay à FillSell/.test(r.texte) && !ORDI.test(r.texte), 'client Cloud, eBay non relié : « Synchroniser eBay » ne part pas, le geste est de le relier', r);
ok(CX.refusSyncCloud(etat(null), 'ebay', 'fr') === null, 'drapeau eBay pas encore lu : rien n’est refusé');
ok(CX.refusSyncCloud(etat(true), 'ebay', 'fr') === null, 'eBay relié (API) : la demande part comme avant');
ok(CX.refusSyncCloud({ ...etat(false), clientCloud: false }, 'ebay', 'fr') === null, 'compte sans Cloud : rien ne change pour eBay');
let ouvert = 0;
CX.poserOuvreurConnexionCloud(() => { ouvert++; });
CX.publierConnexionsCloud(etat(false));
const g = CX.gardeSyncCloud('ebay', 'fr');
ok(typeof g === 'string' && ouvert === 0, 'le geste eBay n’ouvre pas l’écran de connexion du Cloud (il ne relie pas eBay)');
CX.publierConnexionsCloud(null);
const ura = lire('src/annonces/useReleveAnnonces.js');
ok(/if \(refusCloud\.geste !== 'relier_ebay'\) aConnecterCloud = true;/.test(ura), '« Tout relever » saute eBay avec son texte, sans ouvrir l’écran du Cloud');
const app = lire('src/App.jsx');
ok(/ebayApi:ebayVoieApiLu\?ebayVoieApi:null/.test(app), 'l’app publie le drapeau eBay, null tant qu’il n’est pas lu');
const FR = await import('../src/annonces/finReleve.js');
const TA = (await import('../src/annonces/textes.js')).textesAnnonces;
const T = TA('fr'), TE = TA('en');
if (aV) {
  for (const [ligne, attendue] of [
    [V.texteDemandeExpireeCloud({ kind: 'annonces', platform: 'ebay', ebayRelie: false }), 'cloud_relier_ebay'],
    [V.texteDemandeExpireeCloud({ kind: 'annonces', platform: 'ebay', ebayRelie: true }), 'cloud_ebay_api'],
    [V.texteDemandeExpireeCloud({ kind: 'annonces', platform: 'beebs', connecteCloud: false }), 'cloud_connecter'],
    [V.texteDemandeExpireeCloud({ kind: 'dressing', connecteCloud: true }), 'cloud_pas_pris'],
  ]) {
    const s = FR.situationFinReleve({ erreur: ligne });
    const t = FR.texteSituation(s, 'Beebs', T), te = FR.texteSituation(s, 'Beebs', TE);
    ok(s === attendue && !ORDI.test(t) && !ORDI.test(te), `l’app lit « ${attendue} » et sa phrase ne parle jamais de l’ordinateur`, `${s} | ${t} | ${te}`);
  }
}
ok(FR.situationFinReleve({ erreur: "demande jamais réclamée en 6 h — ton ordinateur n'avait pas Chrome ouvert avec l'extension FillSell." }) === 'pas_prise', 'les lignes d’avant (sans marqueur) gardent leur lecture');
const bs = lire('src/stock/BlocSynchro.jsx');
ok(/\['cloud_relier_ebay', 'cloud_connecter', 'cloud_pas_pris'\]\.includes\(t\.e\.situation\)/.test(bs), 'le Stock montre un point à régler pour chaque demande du Cloud expirée, avec son geste');

console.log(`${echecs === 0 ? '✓' : '✗'} cloud-releves-sans-ordinateur : ${passes} vert(s), ${echecs} rouge(s)`);
process.exit(echecs === 0 ? 0 : 1);
