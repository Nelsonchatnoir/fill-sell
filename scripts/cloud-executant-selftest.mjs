// (30/10, lot D) FillSell Cloud : l'état de l'exécutant et des connexions (les mots de l'écran), les conditions
// d'utilisation (version, case obligatoire, acceptation enregistrée AVANT toute carte, garde du paiement), le
// drapeau par compte côté serveur. Pur + lecture du code.
import fs from 'node:fs';
import { phraseExecutant, etatConnexion, quandParis } from '../src/cloud/executant.js';

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

if (echecs) { console.error(`\n✗ ${echecs} échec(s) — ${n} contrôles`); process.exit(1); }
console.log(`\n✓ tout est vert — ${n} contrôles`);
