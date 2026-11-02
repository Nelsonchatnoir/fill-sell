// (30/10, lot D) FillSell Cloud : l'état de l'exécutant et des connexions (les mots de l'écran), les conditions
// d'utilisation (version, case obligatoire, acceptation enregistrée AVANT toute carte, garde du paiement), le
// drapeau par compte côté serveur. Pur + lecture du code.
import fs from 'node:fs';
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
const vApp = cfg.match(/export const CGU_CLOUD_VERSION = '(\d{4}-\d{2}-\d{2})';/)?.[1];
const vSrv = srv.match(/export const CGU_CLOUD_VERSION = "(\d{4}-\d{2}-\d{2})";/)?.[1];
ok(vApp && vApp === vSrv, `une seule version, app = serveur (${vApp})`);
const { conditionsCloud } = await import('../src/cloud/conditionsCloud.js').catch(() => ({}));
const T = conditionsCloud?.();
const texte = JSON.stringify(T ?? {});
for (const [mot, quoi] of [['AES-256-GCM', 'chiffrement'], ['restriction', 'risque de restriction'], ['ne garantit ni', 'aucune garantie de vente'], ['7 premiers jours', 'essai 7 jours'], ['moyen de paiement est demandé', 'carte demandée'], ['20 € TTC par mois', 'prix'], ['résiliez', 'résiliation'], ['HMAC-SHA256', 'données'], ['page de connexion', 'connexion seule'], ['ne va jamais plus vite', 'jamais plus vite que l’extension']]) {
  ok(texte.includes(mot), `le texte dit : ${quoi}`);
}
ok(T?.articles?.length === 9 && /accepte/.test(T?.case ?? ''), '9 articles et une case à cocher');
const modale = lire('src/cloud/ConditionsCloudModale.jsx');
ok(/disabled=\{!coche \|\| etat === 'envoi'\}/.test(modale) && /rpc\('cloud_cgu_accepter_moi', \{ p_version: CGU_CLOUD_VERSION \}\)/.test(modale) && /if \(error \|\| data\?\.ok !== true\) \{ setEtat\('echec'\); return; \}/.test(modale), 'modale : bouton grisé sans la case, acceptation ENREGISTRÉE avant de continuer, échec dit');
const achat = lire('src/cloud/achatCloud.js');
ok(/if \(typeof demanderConditions !== 'function' \|\| !\(await demanderConditions\(\)\)\) return \{ etat: 'annule' \};\s*notifier\?\.\(T\.preparation\);/.test(achat), 'achat : les conditions AVANT la place et avant toute carte');
const app = lire('src/App.jsx');
ok(/demanderConditions:\(\)=>new Promise\(\(resolve\)=>setConditionsCloudOuvertes\(\{resolve\}\)\)/.test(app) && /<ConditionsCloudModale onFini=/.test(app), 'App : la modale est branchée sur l’achat');
ok(/chargerTemoinCloud\(supabase,user\.id\)/.test(app), 'App : le drapeau par compte est lu à la connexion');
const cc = lire('supabase/functions/create-checkout-session/index.ts');
const iGarde = cc.indexOf('error: "offre_fermee"'), iCgu = cc.indexOf('error: "conditions_a_accepter"'), iSession = cc.indexOf('const clientCloud = await resoudreClient(');
ok(iGarde > 0 && iCgu > iGarde && iSession > iCgu, 'paiement Cloud : offre fermée hors témoins, puis conditions exigées, AVANT tout appel à Stripe');
ok(/\(profilGarde\?\.beta_flags as Record<string, unknown> \| null\)\?\.cloud === true/.test(cc) && /key", "cloud_offre_ouverte"/.test(cc), 'témoin = drapeau par compte ; ouverture = coin_config.cloud_offre_ouverte');
const mig = lire('supabase/migrations/20261030130000_cloud_conditions_executant_rotation.sql');
ok(mig.includes('REVOKE UPDATE (cloud_cgu_version, cloud_cgu_acceptee_le) ON public.profiles FROM anon, authenticated;')
  && mig.includes(String.raw`IF COALESCE(p_version, '') !~ '^\d{4}-\d{2}-\d{2}$' THEN`), 'base : colonnes fermées à l’écriture directe, version datée seulement');
ok(/GRANT EXECUTE ON FUNCTION public\.cloud_executant_moi\(\) TO authenticated;/.test(mig) && /WHERE auth\.uid\(\) IS NOT NULL/.test(mig), 'base : l’état de l’exécutant se lit pour SOI seulement');

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
  ok(executantArrete({ cloudVoie: true, executant: {}, maintenant: T0 })?.cause === 'jamais', 'jamais démarré : dit');
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
