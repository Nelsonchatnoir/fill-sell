// (30/10, lot D) FillSell Cloud : l'état de l'exécutant et des connexions (les mots de l'écran), les conditions
// d'utilisation (version, case obligatoire, acceptation enregistrée AVANT toute carte, garde du paiement), le
// drapeau par compte côté serveur. Pur + lecture du code ; (11/11, C1) § 3 ter : la modale exécutée (Vite, sans réseau).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { phraseExecutant, etatConnexion, quandParis, plateformesAReconnecter, verificationsCloud, connectesIsoles } from '../src/cloud/executant.js';

let echecs = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('  ✓', m); else { echecs++; console.error('  ✗', m); } };
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const t = Date.parse('2026-10-30T10:00:00Z');   // 11:00 à Paris

console.log('1. Les connexions');
ok(etatConnexion({ connecte: true }) === 'connecte' && etatConnexion({ connecte: false }) === 'a_reconnecter' && etatConnexion(undefined) === 'a_connecter', 'connecté / à reconnecter (une connexion faite qui a lâché) / à connecter');

console.log('2. L’exécutant');
ok(quandParis('2026-10-30T09:42:00Z', t) === 'à 10:42' && quandParis('2026-10-29T17:05:00Z', t) === 'hier à 18:05', 'heure de Paris (aujourd’hui, hier)');
const marche = phraseExecutant({ poste: { etat: 'actif', demarre_le: '2026-10-30T08:15:00Z' }, derniere_action: { action: 'republish', plateforme: 'vinted', statut: 'published', le: '2026-10-30T09:42:00Z' }, dernier_releve: { plateforme: 'leboncoin', le: '2026-10-30T09:30:00Z' } }, { maintenant: t });
ok(marche.etat === 'en_marche' && marche.titre === 'En marche depuis 09:15.', 'en marche, depuis quand');
ok(marche.detail[0] === 'Dernière action : republication Vinted — faite, à 10:42.' && /Dernier relevé de tes annonces : Leboncoin à 10:30\./.test(marche.detail[1]), 'dernière action et dernier relevé, en mots');
ok(phraseExecutant({ poste: { etat: 'eteint' } }, { maintenant: t }).etat === 'en_pause' && phraseExecutant({ poste: { etat: 'erreur' } }, { maintenant: t }).etat === 'erreur' && phraseExecutant({}, { maintenant: t }).etat === 'jamais', 'en pause / erreur / pas encore démarré');
ok(!/\d+ ?(min|h|jours?)\b/.test(JSON.stringify(phraseExecutant({ poste: { etat: 'eteint' } }, { maintenant: t }))), 'aucune durée promise');

console.log('3. Les conditions d’utilisation');
const cfg = lire('src/config/cloudOffer.js'), srv = lire('supabase/functions/_shared/cloud-conditions.js');
// (11/11, C1) La version, la minimale et la règle vivent dans _shared/cloud-conditions.js SEUL ; l'app les ré-exporte.
const CFG = await import('../src/config/cloudOffer.js').catch(() => ({}));
const SRV = await import('../supabase/functions/_shared/cloud-conditions.js').catch(() => ({}));
ok(/^\d{4}-\d{2}-\d{2}$/.test(SRV.CGU_CLOUD_VERSION ?? '') && CFG.CGU_CLOUD_VERSION === SRV.CGU_CLOUD_VERSION, `une seule version, app = serveur (${SRV.CGU_CLOUD_VERSION})`);
const { conditionsCloud } = await import('../src/cloud/conditionsCloud.js').catch(() => ({}));
const T = conditionsCloud?.();
const texte = JSON.stringify(T ?? {});
for (const [mot, quoi] of [['AES-256-GCM', 'chiffrement'], ['restriction', 'risque de restriction'], ['ne garantit ni', 'aucune garantie de vente'], ['7 premiers jours', 'essai 7 jours'], ['moyen de paiement est demandé', 'carte demandée'], ['24,99 € TTC par mois', 'prix'], ['résiliez', 'résiliation'], ['HMAC-SHA256', 'données'], ['page de connexion', 'connexion seule'], ['ne va jamais plus vite', 'jamais plus vite que l’extension']]) {
  ok(texte.includes(mot), `le texte dit : ${quoi}`);
}
ok(T?.articles?.length === 9 && /accepte/.test(T?.case ?? ''), '9 articles et une case à cocher');
const modale = lire('src/cloud/ConditionsCloudModale.jsx');
ok(/(?<!-)disabled=\{!coche \|\| etat === 'envoi'\}/.test(modale) && /rpc\('cloud_cgu_accepter_moi', \{ p_version: version \}\)/.test(modale) && /const version = versionConditionsMontree\(formules === true\);/.test(modale) && /if \(error \|\| data\?\.ok !== true\) \{ setEtat\('echec'\); return; \}/.test(modale), 'modale : bouton grisé sans la case, acceptation ENREGISTRÉE avant de continuer, échec dit');
const achat = lire('src/cloud/achatCloud.js');
ok(/if \(typeof demanderConditions !== 'function' \|\| !\(await demanderConditions\(\)\)\) return \{ etat: 'annule' \};\s*notifier\?\.\(T\.preparation\);/.test(achat), 'achat : les conditions AVANT la place et avant toute carte');
const app = lire('src/App.jsx');
ok(/demanderConditions:\(\)=>new Promise\(\(resolve\)=>setConditionsCloudOuvertes\(\{resolve\}\)\)/.test(app) && /demanderConditions:\(\)=>new Promise\(\(resolve\)=>setConditionsCloudOuvertes\(\{resolve,formules:true\}\)\)/.test(app) && /<ConditionsCloudModale formules=\{conditionsCloudOuvertes\.formules===true\} onFini=/.test(app), 'App : la modale est branchée sur l’achat');
ok(/chargerTemoinCloud\(supabase,user\.id\)/.test(app), 'App : le drapeau par compte est lu à la connexion');
const cc = lire('supabase/functions/create-checkout-session/index.ts');
const iGarde = cc.indexOf('error: "offre_fermee"'), iCgu = cc.indexOf('error: "conditions_a_accepter"'), iSession = cc.indexOf('const clientCloud = await resoudreClient(');
ok(iGarde > 0 && iCgu > iGarde && iSession > iCgu, 'paiement Cloud : offre fermée hors témoins, puis conditions exigées, AVANT tout appel à Stripe');
ok(/\(profilGarde\?\.beta_flags as Record<string, unknown> \| null\)\?\.cloud === true/.test(cc) && /key", "cloud_offre_ouverte"/.test(cc), 'témoin = drapeau par compte ; ouverture = coin_config.cloud_offre_ouverte');
const mig = lire('supabase/migrations/20261030130000_cloud_conditions_executant_rotation.sql');
ok(mig.includes('REVOKE UPDATE (cloud_cgu_version, cloud_cgu_acceptee_le) ON public.profiles FROM anon, authenticated;')
  && mig.includes(String.raw`IF COALESCE(p_version, '') !~ '^\d{4}-\d{2}-\d{2}$' THEN`), 'base : colonnes fermées à l’écriture directe, version datée seulement');
ok(/GRANT EXECUTE ON FUNCTION public\.cloud_executant_moi\(\) TO authenticated;/.test(mig) && /WHERE auth\.uid\(\) IS NOT NULL/.test(mig), 'base : l’état de l’exécutant se lit pour SOI seulement');

// ── 3 bis. (11/11/2026, point C1 du méga lot de Nico) LE VERROU DE LA CASE ───────────────────────────────────────
// Demande de Nico : la case ne mentionne plus le risque ; le paragraphe des plateformes reste dans les conditions SANS
// RIEN RETIRER SUR LE FOND ; version incrémentée sans bloquer qui a déjà accepté ; l'étape mesurée (vues, cochée, annulé,
// continué) ; l'acceptation reste OBLIGATOIRE et ENREGISTRÉE (date + version). Rouge dès que l'un de ces points recule.
// (11/11, relecture de C1) Règle d'acceptation : date AAAA-MM-JJ réelle ET ≥ la version MINIMALE, une seule source
// (_shared/cloud-conditions.js) ; la date de la version neuve n'est écrite qu'à un endroit ; la modale est EXÉCUTÉE (§ 3 ter).
console.log('3 bis. La case des conditions (C1, 11/11) : sans le risque, le fond gardé, l’ancien acceptant jamais bloqué');
// ⛔ LE JOUR DU PUSH WEB : la date RÉELLE de la livraison (heure de Paris), ici ET dans _shared/cloud-conditions.js
// (CGU_CLOUD_HISTORIQUE[0].version) — seuls endroits où elle s'écrit.
// (12/11/2026, offres Cloud — changement VOLONTAIRE, nommé dans le rapport OFFRES-SERVEUR) l'article 6 des formules avec
// Cloud : version 2026-11-12 (validée par Nico) ; la minimale ne bouge pas.
const VERSION_LIVREE = '2026-11-12';
// (12/11/2026, offres Cloud) La version MONTRÉE à tous (case du Cloud seul, page publique fermée) reste celle du Cloud
// seul : la dernière qui n'est pas celle des formules. Celle des formules (VERSION_LIVREE, en tête) ne se montre que dans
// l'achat d'une formule (src/cloud/conditionsCloud.js, versionConditionsMontree).
const VERSION_CLOUD_SEUL = '2026-11-11';
const jma = (v) => v.split('-').reverse().join('/');
const COND =await import('../src/cloud/conditionsCloud.js').catch(() => ({}));
{
  const EN = conditionsCloud?.('en');
  // 1. La case : les mots validés par Nico (11/11), sans le risque.
  ok(T?.case === "J'ai lu et j'accepte les conditions d'utilisation de FillSell Cloud." && EN?.case === 'I have read and accept the FillSell Cloud terms of use.',
    'la case, mot pour mot : « J’ai lu et j’accepte les conditions d’utilisation de FillSell Cloud. » (en : « I have read and accept the FillSell Cloud terms of use. »)');
  ok(Boolean(T?.case && EN?.case) && !/risque|restriction|plateforme|compte/i.test(T.case) && !/risk|restrict|marketplace|account/i.test(EN.case), 'la case ne mentionne plus le risque (fr et en)');
  // 2. Le fond de l'article 4 : chaque morceau de l'ancien texte, en fr et en en (rapport C1 § 3.5).
  const a4 = T?.articles?.[3], a4en = EN?.articles?.[3];
  const fr4 = (a4?.ps ?? []).join(' '), en4 = (a4en?.ps ?? []).join(' ');
  ok(a4?.t === '4. Le Cloud et les règles des plateformes' && a4en?.t === "4. The Cloud and the marketplaces' rules" && a4?.ps?.length === 3 && a4en?.ps?.length === 3 && EN?.articles?.length === 9,
    'article 4 : « Le Cloud et les règles des plateformes », trois paragraphes (fr et en), 9 articles');
  const FOND = [
    ['chaque plateforme fixe ses règles', 'chaque plateforme reste maître de ses règles', 'each marketplace remains in charge of its own rules'],
    ['automatisation et connexions depuis des serveurs', "notamment sur l'automatisation et les connexions depuis des serveurs", 'in particular on automation and on connections from servers'],
    ['des règles qui changent', 'peut les changer à tout moment', 'may change them at any time'],
    ['le risque (vérification, limitation, suspension, fermeture)', 'demander une vérification, limiter, suspendre ou fermer un compte', 'ask for a verification, limit, suspend or close an account'],
    ['y compris à cause du Cloud', "y compris parce qu'un service comme le Cloud est utilisé", 'including because a service such as the Cloud is used'],
    ['aucune garantie : le risque réduit, jamais écarté', "réduisent ce risque sans pouvoir l'écarter", 'reduce this risk but cannot rule it out'],
    ['le risque accepté en activant le Cloud', "en activant le Cloud, vous l'acceptez", 'by activating the Cloud, you accept it'],
    ['FillSell ne répond pas des décisions d’une plateforme', "FillSell ne répond pas des décisions d'une plateforme", "FillSell is not liable for a marketplace's decisions"],
    ['aucune affiliation', "n'est affilié à aucune d'elles", 'is not affiliated with any marketplace'],
    ['auteur et seul responsable de ses annonces, prix et ventes', "Vous restez l'auteur et le seul responsable de vos annonces, de leur contenu, de leurs prix et des ventes que vous concluez", 'You remain the author of, and solely responsible for, your listings, their content, their prices and the sales you make'],
    ['respect des conditions de chaque plateforme', "vous vous engagez à respecter les conditions d'utilisation de chaque plateforme que vous connectez au Cloud", 'you undertake to comply with the terms of use of each marketplace you connect to the Cloud'],
  ];
  const manquent = FOND.filter(([, fr, en]) => !fr4.includes(fr) || !en4.includes(en)).map(([quoi]) => quoi);
  ok(manquent.length === 0, `article 4 : le fond reste écrit, en fr et en en (${FOND.length} points)${manquent.length ? ` — MANQUE : ${manquent.join(' ; ')}` : ''}`);
  ok(fr4.length > 0 && !/(?<!\p{L})(tu|ton|ta|tes|toi)(?!\p{L})/iu.test(fr4), 'article 4 au « vous », comme les huit autres (décision de Nico, version B)');
  ok(fr4.includes('par une adresse IP française') && (T?.articles?.[2]?.ps ?? []).join(' ').includes('adresses IP françaises')
    && en4.includes('through a French IP address') && (EN?.articles?.[2]?.ps ?? []).join(' ').includes('French IP addresses'), 'article 4 « adresse IP française » = article 3 « adresses IP françaises » (fr et en)');
  // (relecture D5) EN : le sujet nommé, même formule qu'à l'article 2 (« it stops » laissait « it » = la plateforme).
  const ARRET_EN = 'If a marketplace asks for a verification or reports a restriction, the Cloud stops on that marketplace and tells you in the app.';
  ok((EN?.articles?.[1]?.ps ?? []).some((p) => p.includes(ARRET_EN)) && String(a4en?.ps?.[0] ?? '').endsWith(ARRET_EN),
    'article 4 (en) : « the Cloud stops on that marketplace and tells you in the app », mot pour mot comme à l’article 2');
  // (11/11, D4 — décision de Nico « Le préciser ») Article 9 : une simple reformulation ne demande pas de nouvelle acceptation.
  ok(T?.articles?.[8]?.t === '9. Acceptation et modifications' && T.articles[8].ps.length === 1
    && T.articles[8].ps[0] === "L'activation du Cloud exige d'accepter les présentes conditions. FillSell enregistre la date et la version acceptées. Une nouvelle version vous est présentée et doit être acceptée pour continuer à utiliser le Cloud, sauf une simple reformulation, qui ne demande pas de nouvelle acceptation. Les CGU et les CGV de FillSell s'appliquent pour tout ce que ces conditions ne prévoient pas."
    && EN?.articles?.[8]?.ps?.length === 1
    && EN.articles[8].ps[0] === "Activating the Cloud requires accepting these terms. FillSell records the date and the version accepted. A new version is shown to you and must be accepted to keep using the Cloud, except a simple rewording, which does not require a new acceptance. FillSell's Terms and Conditions and Terms of Sale apply to everything these terms do not cover.",
  'article 9, mot pour mot : « … doit être acceptée pour continuer à utiliser le Cloud, sauf une simple reformulation, qui ne demande pas de nouvelle acceptation. » (fr et en)');
  // 3. L'acceptation reste OBLIGATOIRE avant toute préparation de paiement (Stripe ET boutique) — et ENREGISTRÉE (date + version).
  const debut = achat.indexOf('async function acheter('), corps = achat.slice(debut, achat.indexOf('\n  }\n', debut));
  const iCond = corps.indexOf('await demanderConditions()'), iPrep = corps.indexOf('await preparer()');
  ok(debut > 0 && iCond > 0 && iPrep > iCond && corps.indexOf('await stripe(origine)') > iPrep && corps.indexOf('await boutique(essai') > iPrep,
    'achat : la case AVANT la préparation, avant Stripe (web) et avant la boutique (Apple / Google)');
  ok((achat.match(/(?<!function )\bstripe\(/g) ?? []).length === 1 && (achat.match(/(?<!function )\bboutique\(/g) ?? []).length === 1, 'achat : Stripe et la boutique ne s’ouvrent que depuis acheter (aucune autre porte)');
  // (le contrôle du bouton grisé, l. 36, lisait aussi `aria-disabled=…` : il ne voyait pas un `disabled` retiré — resserré)
  ok(/(?<!-)disabled=\{!coche \|\| etat === 'envoi'\}/.test(modale) && /async function accepter\(\) \{\s*if \(!coche \|\| etat === 'envoi'\) return;/.test(modale),
    'modale : sans la case cochée, le bouton est grisé ET l’acceptation ne part pas');
  ok(mig.includes('UPDATE public.profiles SET cloud_cgu_version = p_version, cloud_cgu_acceptee_le = now()'), 'base : l’acceptation écrit la version montrée et l’heure du serveur (rpc cloud_cgu_accepter_moi, inchangée)');
  // 4. La version : UNE source (_shared/cloud-conditions.js), ré-exportée par l'app, jamais redéfinie ; datée, après la
  //    minimale ; sa date n'est écrite qu'à UN endroit du code (relecture D1, D3).
  ok(SRV.CGU_CLOUD_VERSION === VERSION_LIVREE && CFG.CGU_CLOUD_VERSION === VERSION_LIVREE && COND.CGU_CLOUD_VERSION === VERSION_LIVREE,
    `la version en vigueur = la date de livraison (${VERSION_LIVREE}), la même pour l’app, le texte et le serveur`);
  ok(SRV.CGU_CLOUD_VERSION_MINIMALE === '2026-11-04' && SRV.CGU_CLOUD_VERSION > SRV.CGU_CLOUD_VERSION_MINIMALE && CFG.CGU_CLOUD_VERSION_MINIMALE === SRV.CGU_CLOUD_VERSION_MINIMALE,
    'la version minimale reste 2026-11-04 (le dernier changement de fond : le prix) ; la version en vigueur la suit');
  ok(typeof SRV.versionCguValable === 'function' && CFG.versionCguValable === SRV.versionCguValable && COND.versionCguValable === SRV.versionCguValable
    && /export \{[^}]*\bversionCguValable\b[^}]*\} from '\.\.\/\.\.\/supabase\/functions\/_shared\/cloud-conditions\.js';/.test(cfg)
    && !/(const|let|var|function)\s+(CGU_CLOUD_VERSION|CGU_CLOUD_VERSION_MINIMALE|versionCguValable)\b/.test(cfg),
  'une seule source : l’app ré-exporte la version, la minimale et la règle de _shared/cloud-conditions.js (même fonction, jamais redéfinie)');
  {
    const litteral = new RegExp(`['"\`]${SRV.CGU_CLOUD_VERSION}['"\`]`);
    const ecrite = [];
    for (const dossier of ['src', 'supabase/functions']) {
      for (const f of fs.readdirSync(new URL(`../${dossier}`, import.meta.url), { recursive: true })) {
        const chemin = `${dossier}/${String(f).replace(/\\/g, '/')}`;
        if (/(^|\/)node_modules\//.test(chemin) || !/\.(jsx?|mjs|cjs|tsx?)$/.test(chemin)) continue;
        const u = new URL(`../${chemin}`, import.meta.url);
        if (!fs.statSync(u).isFile()) continue;
        const contenu = fs.readFileSync(u, 'utf8');
        if (!/cgu/i.test(contenu)) continue;   // une date d'un autre sujet (billet, relevé) n'est pas la version des conditions
        const n = contenu.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l) && litteral.test(l)).length;
        for (let i = 0; i < n; i++) ecrite.push(chemin);
      }
    }
    ok(ecrite.length === 1 && ecrite[0] === 'supabase/functions/_shared/cloud-conditions.js', `la date de la version en vigueur s’écrit à UN endroit du code (${ecrite.join(', ') || 'nulle part'})`);
  }
  ok(T?.version ===`Version du ${jma(VERSION_CLOUD_SEUL)} — elle reformule les articles 4 et 9 sans rien changer sur le fond : une acceptation de la version du 04/11/2026 reste valable.`
    && EN?.version === `Version of ${jma(VERSION_CLOUD_SEUL)} — it rewords articles 4 and 9 without changing their substance: an acceptance of the version of 04/11/2026 remains valid. English translation for information only; the French version prevails.`,
  'la ligne de version, mot pour mot : l’acceptation du 04/11/2026 reste valable (fr et en)');
  // (relecture D8) La phrase vient de la table « ce que change la version » : une autre version n'en hérite jamais.
  ok(typeof COND.ligneDeVersion === 'function' && COND.ligneDeVersion('fr', { version: '2026-12-01', changement: 'autre' }) === 'Version du 01/12/2026'
    && COND.ligneDeVersion('en', { version: '2026-12-01', changement: 'autre' }) === 'Version of 01/12/2026 — English translation for information only; the French version prevails.'
    && COND.ligneDeVersion('fr', SRV.CGU_CLOUD_HISTORIQUE?.find((e) => e.changement !== 'formules_cloud_article_6')) === T?.version && SRV.CGU_CLOUD_HISTORIQUE?.[0]?.version === SRV.CGU_CLOUD_VERSION
    && COND.conditionsCloud?.('fr', { formules: true })?.version === COND.ligneDeVersion('fr', SRV.CGU_CLOUD_HISTORIQUE?.[0])
    && COND.versionConditionsMontree?.(false) === VERSION_CLOUD_SEUL && COND.versionConditionsMontree?.(true) === VERSION_LIVREE,
  'la phrase de la ligne de version est choisie par la version (table), jamais écrite pour toutes : une version sans phrase n’affiche que sa date');
  // 5. Un ancien acceptant n'est jamais bloqué ; une app plus récente que le serveur non plus ; l'ancien prix (2026-10-30)
  //    et tout format faux toujours refusés (relecture D1). Même règle exécutée côté app et côté serveur.
  for (const [nom, f] of [['app (conditionsAcceptees)', COND.conditionsAcceptees], ['serveur (conditionsCloudAcceptees)', SRV.conditionsCloudAcceptees]]) {
    const vaut = (v) => typeof f === 'function' && f({ cloud_cgu_version: v }) === true;
    const VALENT = [SRV.CGU_CLOUD_VERSION, '2026-11-04', '2026-11-12', '2026-11-13', '2027-01-31'];
    const REFUSEES = ['2026-10-30', '2026-11-03', null, undefined, '', '2026-11-4', '2026-1-04', '20261104', '2026-02-30', '2026-13-01', ' 2026-11-12', '2026-11-12T00:00', 'aaaa-mm-jj', 20261112];
    const faux = [...VALENT.filter((v) => !vaut(v)).map((v) => `refusée ${v}`), ...REFUSEES.filter((v) => vaut(v)).map((v) => `acceptée ${JSON.stringify(v)}`)];
    ok(faux.length === 0 && f?.(null) === false && f?.(undefined) === false,
      `${nom} : la version en vigueur, 2026-11-04 (ancienne app) et une date plus récente que le serveur (2026-11-13) valent ; 2026-10-30, < minimale, vide ou format faux, jamais${faux.length ? ` — ${faux.join(' ; ')}` : ''}`);
  }
  // (relecture D6) create-checkout-session : la règle IMPORTÉE de _shared, jamais redéfinie, aucune comparaison locale.
  {
    const ccCode = cc.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    // (11/11/2026, offres Cloud — changement VOLONTAIRE, nommé dans le rapport OFFRES-SERVEUR) la liste de colonnes lue pour
    // une formule avec Cloud (COLONNES_FORMULE) contient aussi cloud_cgu_version : la garde des formules est
    // conditionsFormulesAcceptees (_shared/formules-serveur.js), au même endroit — le paiement — et nulle part ailleurs.
    const sansSelect = ccCode.replace('.select("beta_flags, cloud_cgu_version")', '').replace(/const COLONNES_FORMULE = "beta_flags, cloud_cgu_version, /, '');
    ok(/^import \{[^}]*\bconditionsCloudAcceptees\b[^}]*\} from "\.\.\/_shared\/cloud-conditions\.js";$/m.test(cc) && /if \(!conditionsCloudAcceptees\(profilGarde\)\) \{/.test(cc)
      && !/(const|let|var|function)\s+conditionsCloudAcceptees\b/.test(ccCode) && !/cloud_cgu_version/.test(sansSelect)
      && !/(===|!==|==|!=|<=|>=|<|>)\s*CGU_CLOUD_VERSION\b|\bCGU_CLOUD_VERSION\s*(===|!==|==|!=|<=|>=|<|>)/.test(ccCode),
    'create-checkout-session : la garde = conditionsCloudAcceptees importée de _shared (jamais redéfinie), aucune comparaison locale de cloud_cgu_version');
  }
  // (11/11, offres Cloud — nommé dans le rapport) + _shared/formules-serveur.js : conditionsFormulesAcceptees, appelée SEULEMENT par
  // create-checkout-session (vérifié juste après) — le Cloud en service n'est toujours jamais coupé pour une version.
  const PERMIS = new Set(['src/config/cloudOffer.js', 'src/cloud/conditionsCloud.js', 'src/cloud/ConditionsCloudModale.jsx', 'supabase/functions/_shared/cloud-conditions.js', 'supabase/functions/_shared/formules-serveur.js',
    'supabase/functions/create-checkout-session/index.ts', 'supabase/migrations/20261030130000_cloud_conditions_executant_rotation.sql']);
  const LECTURE = /cloud_cgu|CGU_CLOUD_VERSION|CGU_CLOUD_HISTORIQUE|versionCguValable|conditionsCloudAcceptees|conditionsAcceptees/;
  const lecteurs = [];
  for (const dossier of ['src', 'supabase/functions', 'supabase/migrations', 'serveur-cloud/src', 'chrome-extension']) {
    for (const f of fs.readdirSync(new URL(`../${dossier}`, import.meta.url), { recursive: true })) {
      const chemin = `${dossier}/${String(f).replace(/\\/g, '/')}`;
      if (/(^|\/)node_modules\//.test(chemin) || !/\.(jsx?|mjs|cjs|tsx?|sql)$/.test(chemin) || PERMIS.has(chemin)) continue;
      const u = new URL(`../${chemin}`, import.meta.url);
      if (fs.statSync(u).isFile() && LECTURE.test(fs.readFileSync(u, 'utf8'))) lecteurs.push(chemin);
    }
  }
  ok(lecteurs.length === 0, `aucune autre lecture de la version (app, fonctions, migrations, serveur Cloud, extension) : le Cloud en service n’est jamais coupé pour une version${lecteurs.length ? ` — LUE PAR : ${lecteurs.join(', ')}` : ''}`);
  // (11/11, offres Cloud) conditionsFormulesAcceptees (_shared/formules-serveur.js) n'est appelée QUE par create-checkout-session.
  {
    const appelants = [];
    for (const f of fs.readdirSync(new URL('../supabase/functions', import.meta.url), { recursive: true })) {
      const chemin = `supabase/functions/${String(f).replace(/\\/g, '/')}`;
      if (!/\.(jsx?|mjs|tsx?)$/.test(chemin) || chemin.endsWith('_shared/formules-serveur.js')) continue;
      const u = new URL(`../${chemin}`, import.meta.url);
      if (fs.statSync(u).isFile() && /conditionsFormulesAcceptees\(/.test(fs.readFileSync(u, 'utf8'))) appelants.push(chemin);
    }
    ok(appelants.length === 1 && appelants[0] === 'supabase/functions/create-checkout-session/index.ts',
      `(11/11) la garde des formules (conditionsFormulesAcceptees) ne vit qu'au paiement : ${appelants.join(', ') || 'aucun appelant'}`);
  }
  // 6. L'étape est mesurée (usage_logs, par la porte tracerCloud), sans jamais attendre une trace.
  const EVENEMENTS = ['cloud_conditions_vues', 'cloud_conditions_cochees', 'cloud_conditions_annulees', 'cloud_conditions_acceptees', 'cloud_conditions_echec'];
  ok(EVENEMENTS.every((e) => modale.includes(`'${e}'`)) && /import \{ tracerCloud \} from '\.\/traceCloud';/.test(modale), `l’étape est mesurée par tracerCloud : ${EVENEMENTS.join(', ')}`);
  const iEffet = modale.indexOf('useEffect(() => {'), iVues = modale.indexOf("'cloud_conditions_vues'");
  ok(iEffet > 0 && iVues > iEffet && iVues < modale.indexOf('}, [', iEffet) && /if \(vues\.current\) return;/.test(modale), '« vues » : au montage (useEffect), une fois par ouverture');
  ok(/if \(v && !cochees\.current\) \{ cochees\.current = true; tracerEtape\('cloud_conditions_cochees', lang, \{\}, version\); \}/.test(modale), '« cochée » : au premier passage de la case à cochée, une fois par ouverture');
  const iEnreg = modale.indexOf("if (error || data?.ok !== true) { setEtat('echec'); return; }"), iAcc = modale.indexOf("'cloud_conditions_acceptees'");
  ok(iEnreg > 0 && iAcc > iEnreg && modale.indexOf('onFini(true)') > iAcc, '« acceptées » (= continué) : APRÈS l’enregistrement réussi, juste avant de rendre la main');
  ok(/tracerEtape\('cloud_conditions_annulees', lang, \{ coche \}, version\);\s*onFini\(false\);/.test(modale) && (modale.match(/onFini\(false\)/g) ?? []).length === 1, '« annulées » : avant de fermer, avec « cochée ou non » (la seule sortie sans accepter)');
  ok(/function tracerEtape\(feature, lang, extra = \{\}, version = versionConditionsMontree\(false\)\) \{\s*const metadata = \{ version, lang, plateforme: plateformeApp\(\), \.\.\.extra \};/.test(modale), 'chaque trace porte la version, la langue et la plateforme (web / ios / android)');
  ok(!/await\s+(tracerCloud|tracerEtape)\b/.test(modale) && !/return\s+(tracerCloud|Promise)/.test(modale.slice(modale.indexOf('function tracerEtape'), modale.indexOf('export default')))
    && /\.catch\(\(\) => \{/.test(modale.slice(modale.indexOf('function tracerEtape'), modale.indexOf('export default'))),
  'jamais d’attente sur une trace (ni rendue, ni attendue, erreur avalée) : l’écran n’est ni ralenti ni bloqué');
  ok(/\}, \[lang\]\);/.test(modale) && !/sans réseau/.test(modale), '« vues » : dépendances exactes [lang] ; (relecture D7) plus de « sans réseau » (getSession peut rafraîchir le jeton)');
  // 7. (relecture D2, D7) La règle écrite sans contradiction : minimale, deux temps, plus de liste ; comptage sur les seuls comptes qui tracent.
  const regle = lire('docs/regles/mails-paiements-comptabilite.md').replace(/\r\n/g, '\n');
  const sec = regle.slice(regle.indexOf('## ⛔ (11/11/2026, point C1'));
  ok(/version MINIMALE/.test(sec) && /DEUX TEMPS/.test(sec) && ![cfg, srv, lire('src/cloud/conditionsCloud.js'), sec].some((x) => /CGU_CLOUD_VERSIONS_VALABLES/.test(x))
    && /EN DEUX TEMPS/.test(srv) && /≥ la version minimale|≥ CGU_CLOUD_VERSION_MINIMALE/.test(srv) && /_shared\/cloud-conditions\.js/.test(cfg),
  'la règle (docs/regles, _shared, cloudOffer) : date ≥ minimale, changement de fond en deux temps, aucune liste exacte restée');
  {
    const q1 = sec.slice(sec.indexOf('-- 1.'), sec.indexOf('-- 2.')), q2 = sec.slice(sec.indexOf('-- 2.'), sec.indexOf('-- 3.'));
    ok(/with traces as \(select distinct user_id from usage_logs\s+where feature like 'cloud\\_conditions\\_%'/.test(q1) && /and user_id in \(select user_id from traces\)/.test(q1)
      && /feature = 'cloud_cta_click'/.test(q1) && /bool_or\(feature = 'cloud_conditions_vues'\) as vu/.test(q2) && /count\(\*\) filter \(where vu\) as vues/.test(q2),
    'comptage à 48 h : seuls les comptes qui ont une trace cloud_conditions_* dans la fenêtre (un ancien paquet ne trace rien) ; « vues » comptées pour elles-mêmes');
  }
}

// ── 3 ter. (relecture D6) LA MODALE EXÉCUTÉE ──────────────────────────────────────────────────────────────────────
// Rendu serveur réel (React) : case NON cochée, bouton grisé, texte de la case, ligne de version. Puis la modale jouée
// avec des crochets React simulés (sans DOM) : « vues » une fois par ouverture même après des clics, « cochée » une fois,
// « Annuler » ferme tout de suite, l'acceptation part seulement case cochée, et rend la main MÊME si la trace ne répond
// jamais. Le client Supabase est un faux (aucun réseau) ; seul ConditionsCloudModale.jsx reçoit les faux crochets.
console.log('3 ter. La modale des conditions, exécutée (rendu serveur + crochets simulés)');
{
  const { createServer } = await import('vite');
  const racine = fileURLToPath(new URL('..', import.meta.url));
  const faux = { name: 'c1-faux', enforce: 'pre',
    resolveId(id) {
      if (/(^|\/)lib\/supabase(\.js)?$/.test(id)) return '\0c1-supabase';
      if (id === 'virtual:c1-react') return '\0c1-react';
      return null;
    },
    transform(code, id) { return /ConditionsCloudModale\.jsx$/.test(id) ? code.replace("from 'react';", "from 'virtual:c1-react';") : null; },
    load(id) {
      if (id === '\0c1-supabase') return 'export const supabase = new Proxy({}, { get: (_, k) => globalThis.__C1_SUPABASE__?.[k] });';
      if (id === '\0c1-react') return "import * as Vrai from 'react'; const h = () => globalThis.__C1_CROCHETS__ ?? Vrai.default ?? Vrai;"
        + ' export const useState = (...a) => h().useState(...a); export const useRef = (...a) => h().useRef(...a); export const useEffect = (...a) => h().useEffect(...a);';
      return null;
    } };
  const vite = await createServer({ root: racine, configFile: false, logLevel: 'silent', appType: 'custom', plugins: [faux],
    server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const traces = [], rpcs = [];
    let session = async () => ({ data: { session: { user: { id: 'u-test' } } } });
    let reponseRpc = { data: { ok: true } };
    globalThis.__C1_SUPABASE__ = {
      auth: { getSession: () => session() },
      from: () => ({ insert: async (l) => { traces.push(l); return {}; } }),
      rpc: async (nom, args) => { rpcs.push({ nom, args }); return reponseRpc; },
    };
    const Modale = (await vite.ssrLoadModule('/src/cloud/ConditionsCloudModale.jsx')).default;
    // a. Rendu serveur réel.
    const React = (await import('react')).default;
    const { renderToStaticMarkup } = await import('react-dom/server');
    const html = renderToStaticMarkup(React.createElement(Modale, { onFini() {} }));
    const caseHtml = html.match(/<input type="checkbox"[^>]*>/)?.[0] ?? '';
    const boutonHtml = html.match(/<button type="button"[^>]*>(?:(?!<\/button>).)*J(?:&#x27;|')accepte et je continue<\/button>/)?.[0] ?? '';
    ok(caseHtml && !/checked/.test(caseHtml) && /\sdisabled=""/.test(boutonHtml), 'rendu : la case n’est PAS cochée au départ, « J’accepte et je continue » grisé');
    ok(html.includes('j&#x27;accepte les conditions d&#x27;utilisation de FillSell Cloud.</span>') && html.includes(`Version du ${jma(VERSION_CLOUD_SEUL)} — elle reformule`),
      'rendu : le texte de la case et la ligne de version');
    // b. Joué avec des crochets simulés.
    const C = { slots: [], i: 0, effets: [] };
    globalThis.__C1_CROCHETS__ = {
      useState(init) { const k = C.i++; if (!(k in C.slots)) C.slots[k] = { v: init }; const s = C.slots[k]; return [s.v, (nv) => { s.v = typeof nv === 'function' ? nv(s.v) : nv; }]; },
      useRef(init) { const k = C.i++; if (!(k in C.slots)) C.slots[k] = { current: init }; return C.slots[k]; },
      useEffect(fn, deps) {
        const k = C.i++, p = C.slots[k];
        const change = !p || !deps || deps.length !== p.deps?.length || deps.some((d, j) => !Object.is(d, p.deps[j]));
        C.slots[k] = { deps }; if (change) C.effets.push(fn);
      },
    };
    const rendre = (props) => { C.i = 0; C.effets = []; const el = Modale(props); C.effets.forEach((f) => f()); return el; };
    const monter = (props) => { C.slots = []; return rendre(props); };
    const trouver = (el, pred) => {
      if (!el || typeof el !== 'object') return null;
      if (Array.isArray(el)) { for (const x of el) { const r = trouver(x, pred); if (r) return r; } return null; }
      if (el.props && pred(el)) return el;
      return trouver(el.props?.children, pred);
    };
    const laCase = (el) => trouver(el, (e) => e.type === 'input' && e.props.type === 'checkbox');
    const bouton = (el, mots) => trouver(el, (e) => e.type === 'button' && mots.includes(e.props.children));
    const compter = (f) => traces.filter((t) => t.feature === f).length;
    const vide = async () => { await attendre(30); };
    const fins = [];
    const props = { onFini: (x) => fins.push(x) };
    // b1. Ouvrir, cocher, décocher, recocher : « vues » 1, « cochée » 1 ; Annuler ferme tout de suite, avec coche.
    let el = monter(props);
    ok(laCase(el)?.props.checked === false && bouton(el, ["J'accepte et je continue"])?.props.disabled === true, 'joué : case non cochée, bouton grisé à l’ouverture');
    await bouton(el, ["J'accepte et je continue"])?.props.onClick?.();
    ok(rpcs.length === 0, 'joué : un clic sur le bouton grisé n’envoie rien (aucune acceptation sans la case)');
    for (const v of [true, false, true]) { laCase(el).props.onChange({ target: { checked: v } }); el = rendre(props); }
    await vide();
    ok(compter('cloud_conditions_vues') === 1 && compter('cloud_conditions_cochees') === 1, `joué : « vues » une fois, « cochée » une fois, malgré trois clics (${compter('cloud_conditions_vues')} / ${compter('cloud_conditions_cochees')})`);
    bouton(el, ['Annuler']).props.onClick();
    const fermeTot = fins.length === 1 && fins[0] === false;
    await vide();
    const ann = traces.find((t) => t.feature === 'cloud_conditions_annulees');
    ok(fermeTot && ann?.metadata?.coche === true && ann?.user_id === 'u-test', '« Annuler » : la modale se ferme aussitôt, la trace dit « cochée »');
    ok(['cloud_conditions_vues', 'cloud_conditions_cochees', 'cloud_conditions_annulees'].every((f) => {
      const m = traces.find((t) => t.feature === f)?.metadata ?? {};
      return m.version === VERSION_CLOUD_SEUL && m.lang === 'fr' && m.plateforme === 'web';
    }), 'chaque trace porte la version montrée, la langue et la plateforme');
    // b2. Une nouvelle ouverture = une nouvelle « vues ».
    traces.length = 0; fins.length = 0;
    el = monter(props); await vide();
    ok(compter('cloud_conditions_vues') === 1, 'joué : chaque ouverture compte une « vues »');
    // b3. Accepter quand la trace ne répond JAMAIS : la main est rendue quand même, la version enregistrée est celle montrée.
    session = () => new Promise(() => {});
    laCase(el).props.onChange({ target: { checked: true } }); el = rendre(props);
    const clic = bouton(el, ["J'accepte et je continue"]).props.onClick();
    await Promise.race([clic, attendre(400)]);
    ok(fins.length === 1 && fins[0] === true && rpcs.at(-1)?.nom === 'cloud_cgu_accepter_moi' && rpcs.at(-1)?.args?.p_version === VERSION_CLOUD_SEUL,
      'joué : l’acceptation ENREGISTRÉE (version montrée) rend la main même si la trace ne répond jamais (aucune trace attendue)');
    // b4. Accepté : la trace « acceptées » ; échec de l'enregistrement : la trace « echec » (raison), la modale reste ouverte.
    session = async () => ({ data: { session: { user: { id: 'u-test' } } } });
    traces.length = 0; fins.length = 0;
    el = monter(props); laCase(el).props.onChange({ target: { checked: true } }); el = rendre(props);
    await bouton(el, ["J'accepte et je continue"]).props.onClick(); await vide();
    ok(fins.join() === 'true' && compter('cloud_conditions_acceptees') === 1 && compter('cloud_conditions_echec') === 0, 'joué : accepté → « acceptées » (= continué), puis la main rendue');
    reponseRpc = { data: { ok: false, raison: 'compte_inconnu' } };
    traces.length = 0; fins.length = 0;
    el = monter(props); laCase(el).props.onChange({ target: { checked: true } }); el = rendre(props);
    await bouton(el, ["J'accepte et je continue"]).props.onClick(); await vide(); el = rendre(props);
    ok(fins.length === 0 && traces.find((t) => t.feature === 'cloud_conditions_echec')?.metadata?.raison === 'compte_inconnu' && compter('cloud_conditions_acceptees') === 0
      && trouver(el, (e) => e.props.role === 'alert'), 'joué : enregistrement refusé → « echec » (raison), rien ne s’ouvre, l’échec est dit');
  } finally {
    delete globalThis.__C1_CROCHETS__; delete globalThis.__C1_SUPABASE__;
    await vite.close();
  }
}

console.log('4. Une plateforme du Cloud = une ligne du coffre possible');
const { PLATEFORMES_CLOUD } = await import('../serveur-cloud/src/plateformes.js');
const contrainte = mig.match(/cloud_coffre_plateforme_check\s+CHECK \(plateforme = ANY \(ARRAY\[([^\]]+)\]\)\)/)?.[1] ?? '';
ok(PLATEFORMES_CLOUD.every((p) => contrainte.includes(`'${p}'::text`)) && contrainte.includes("'fillsell'::text"), `la contrainte du coffre accepte ${PLATEFORMES_CLOUD.join(', ')} et fillsell`);

// (01/11) Le bandeau « reconnecte-toi » : seulement quand le Cloud exécute les tâches du compte (cloud_voie).
{
  const etats = { vinted: { connecte: true }, leboncoin: { connecte: false }, beebs: { connecte: false }, fillsell: { connecte: true } };
  const ids = (l) => l.map((p) => p.id).join(',');
  ok(ids(plateformesAReconnecter({ cloudVoie: true, etats })) === 'leboncoin,beebs', "bandeau : les connexions tombées, dans l'ordre de l'écran (jamais une jamais faite, jamais « fillsell »)");
  ok(plateformesAReconnecter({ cloudVoie: false, etats }).length === 0, "bandeau : rien quand le drapeau Cloud est baissé (l'ordinateur fait les tâches)");
  ok(plateformesAReconnecter({ cloudVoie: true, etats: null }).length === 0 && plateformesAReconnecter({ cloudVoie: true, etats: 'echec' }).length === 0, "bandeau : état illisible = rien d'affiché");
  ok(ids(plateformesAReconnecter({ cloudVoie: true, etats, fermees: ['leboncoin'] })) === 'beebs', "bandeau : une plateforme fermée au compte n'est jamais demandée");
  ok(plateformesAReconnecter({ cloudVoie: true, etats })[0].nom === 'Leboncoin', 'bandeau : la plateforme nommée');
}

// (01/11, 23:10, demande de Nico) L'exécutant arrêté SANS QUE L'APP LE SACHE (22:57 → 23:05) se dit.
{
  const { executantArrete, MUET_MS } = await import('../src/cloud/executant.js');
  const T0 = Date.parse('2026-11-01T22:10:00Z');
  const ex = (poste) => ({ poste });
  ok(executantArrete({ cloudVoie: false, executant: ex({ etat: 'eteint' }), maintenant: T0 }) === null, 'sans le drapeau Cloud : jamais un bandeau');
  ok(executantArrete({ cloudVoie: true, executant: ex({ etat: 'actif', derniere_activite: new Date(T0 - 60_000).toISOString() }), maintenant: T0 }) === null, 'en marche, signe de vie récent : rien');
  const muet = executantArrete({ cloudVoie: true, executant: ex({ etat: 'actif', derniere_activite: new Date(T0 - MUET_MS - 1000).toISOString() }), maintenant: T0 });
  ok(muet?.cause === 'muet', 'en marche mais muet depuis plus de 25 min : arrêté (orchestrateur planté)');
  const essai = executantArrete({ cloudVoie: true, executant: ex({ etat: 'eteint', arrete_le: '2026-11-01T21:57:24Z', derniere_erreur: 'arret_essai:glissiere' }), maintenant: T0 });
  ok(essai?.cause === 'arret_essai' && essai.depuis === '2026-11-01T21:57:24.000Z', 'arrêt de l’essai : la cause et l’heure');
  ok(executantArrete({ cloudVoie: true, executant: ex({ etat: 'eteint', arrete_le: new Date(T0 - 60_000).toISOString() }), maintenant: T0 }) === null, 'éteint depuis 1 min (redémarrage, changement d’IP) : rien');
  ok(executantArrete({ cloudVoie: true, executant: ex({ etat: 'eteint', arrete_le: new Date(T0 - 10 * 60_000).toISOString() }), maintenant: T0 })?.cause === 'eteint', 'éteint depuis 10 min : arrêté');
  ok(executantArrete({ cloudVoie: true, executant: {}, maintenant: T0 })?.cause === 'demarrage', '(05/11 soir, point 5) poste pas encore créé (juste après le paiement) : « démarre », jamais « arrêté »');
  // Les mots (textesConnexion importe le palier sans extension : relus en texte, comme le reste de ce fichier).
  const tx = lire('src/cloud/textesConnexion.js');
  ok(tx.split('executantArreteTitre: (depuis) =>').length === 3 && tx.split('executantArreteTexte: (cause) =>').length === 3, 'fr et en : titre avec l’heure, texte de la cause');
  ok(/Tes tâches du Cloud attendent : rien n'est publié ni retiré tant qu'il ne repart pas./.test(tx), 'fr : les tâches attendent, rien n’est publié ni retiré');
  ok(/résous la vérification demandée/.test(tx), 'le bandeau des plateformes couvre aussi une vérification à résoudre');
  const bandeau = lire('src/cloud/BandeauCloudReconnexion.jsx');
  ok(/supabase\.rpc\('cloud_executant_moi'\)/.test(bandeau) && /executantArrete\(/.test(bandeau) && !/setInterval/.test(bandeau), 'le bandeau lit l’exécutant (à l’ouverture et au retour sur l’app, jamais en boucle)');
}

// (02/11, demande de Nico) Une vérification du navigateur Cloud : à résoudre (bouton), restreinte ou revenue (attente).
{
  const ps = { leboncoin: { cloud_verification: { etat: 'a_resoudre', depuis: '2026-11-02T03:57:37Z' } },
    beebs: { cloud_verification: { etat: 'restreint', depuis: 'x', essai_apres: 'y' } }, depop: { cloud_verification: { etat: 'bizarre' } } };
  const v = verificationsCloud({ cloudVoie: true, platformSettings: ps });
  ok(v.map((x) => `${x.id}:${x.etat}`).join(',') === 'leboncoin:a_resoudre,beebs:restreint', 'à résoudre et restreinte lues, dans l’ordre de l’écran ; un état inconnu n’est jamais deviné');
  ok(verificationsCloud({ cloudVoie: false, platformSettings: ps }).length === 0, 'compte hors Cloud : rien');
  ok(verificationsCloud({ cloudVoie: true, platformSettings: ps, fermees: ['leboncoin'] }).map((x) => x.id).join() === 'beebs', 'une plateforme fermée au compte : rien');
  ok(verificationsCloud({ cloudVoie: true, platformSettings: null }).length === 0, 'illisible : rien');
}

// (02/11) La connexion d'une plateforme dans son navigateur réservé (platform_settings.<pf>.cloud_isole), jamais au coffre.
ok(connectesIsoles({ beebs: { cloud_isole: { connecte: true } }, vinted: { cloud_isole: { connecte: false } } }).join() === 'beebs', 'Beebs connectée dans son navigateur réservé : lue');
ok(connectesIsoles(null).length === 0 && connectesIsoles({ beebs: {} }).length === 0, 'rien : rien');

if (echecs) { console.error(`\n✗ ${echecs} échec(s) — ${n} contrôles`); process.exit(1); }
console.log(`\n✓ tout est vert — ${n} contrôles`);
