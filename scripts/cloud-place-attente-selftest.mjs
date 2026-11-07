// Autotest des POINTS 3 ET 5 DE NICO (03/11/2026) côté app, fonction edge et migration — sans réseau ni base.
//
//     npm run selftest:cloud-place-attente
//
//   · la vente lue (cloud_disponibilite_moi) : « complet » remplace le bouton d'achat, jamais une lecture douteuse ;
//   · « Être prévenu(e) » : rendu, rang, échec dit ; le bandeau de la place libre ; l'écran « FillSell Cloud est
//     arrêté » (jamais « rien n'a été facturé ») ; le bon écran selon l'arrêt (essai récent / arrêté après paiement) ;
//   · le drapeau cloud_voie relu au premier plan, borné à une fois toutes les 2 min ;
//   · le texte du push (FR/EN, une notification de service, jamais un mail) ;
//   · la migration : une règle unique en base, droits fermés, deux réveils, aucune ligne inchangée réécrite.
// La logique SQL elle-même est prouvée sur un Postgres jetable : scripts/cloud/preuve-voie-place-attente.mjs.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let ko = 0, n = 0;
const ok = (c, m, d = '') => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d ? `   ← ${String(d).slice(0, 240)}` : ''}`); } };
const racine = fileURLToPath(new URL('..', import.meta.url));
const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

globalThis.document ??= { body: {} };
const vite = await createServer({
  root: racine, logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: [{ find: /^react-dom$/, replacement: `${racine}scripts/lib/portail-en-place.mjs` }] },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const D = await vite.ssrLoadModule('/src/cloud/useDisponibiliteCloud.js');
  const V = await vite.ssrLoadModule('/src/cloud/useCompteCloud.js');
  const R = await vite.ssrLoadModule('/src/cloud/regles.js');
  const IC = await vite.ssrLoadModule('/src/cloud/InterrupteurCloud.jsx');
  const FE = await vite.ssrLoadModule('/src/cloud/FinEssaiCloud.jsx');
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const h = React.createElement;
  const texte = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

  console.log('\n1. La vente lue (cloud_disponibilite_moi)');
  const complet = D.lireDisponibilite({ vente_possible: false, raison: 'complet', attente: { inscrit: true, rang: 3, place_pour_toi: false } });
  ok(complet && complet.vente === false && complet.raison === 'complet' && complet.inscrit && complet.rang === 3, 'complet, inscrit(e) n° 3 : lu tel quel');
  ok(D.venteFermee(complet) === true, 'complet : le bouton d\'achat est remplacé');
  ok(D.venteFermee(D.lireDisponibilite({ vente_possible: false, raison: 'pool_vide' })) === true, 'aucune IP : remplacé aussi');
  ok(D.venteFermee(D.lireDisponibilite({ vente_possible: true, raison: null })) === false, 'vente possible : le bouton reste');
  ok(D.venteFermee(D.lireDisponibilite({ vente_possible: false, raison: 'deja_client' })) === false, 'déjà client : rien de « complet »');
  ok(D.lireDisponibilite(null) === null && D.lireDisponibilite({ raison: 'x' }) === null && D.venteFermee(null) === false,
    'illisible : rien n\'est remplacé (la base refusera de toute façon)');
  ok(D.lireDisponibilite({ vente_possible: true, attente: { place_pour_toi: true, notifie_le: '2026-11-03T10:00:00Z' } }).placePourToi === true, 'la place gardée est lue');

  console.log('\n1 bis. (07/11, décision de Nico) Le compteur « 14 places restantes » : le nombre de la VENTE');
  const lu14 = D.lireDisponibilite({ vente_possible: true, raison: null, places: 14, ip: true });
  ok(lu14.places === 14 && D.placesRestantes(lu14) === 14, 'places de cloud_vente_etat lues telles quelles (14)');
  ok([undefined, null, -1, 2.5, 'x'].every((p) => D.lireDisponibilite({ vente_possible: true, places: p }).places === null),
    'absent ou illisible (−1, 2,5, texte) : inconnu, jamais un 0 inventé');
  ok(D.placesRestantes(D.lireDisponibilite({ vente_possible: false, raison: 'complet', places: 0 })) === 0
    && D.placesRestantes(D.lireDisponibilite({ vente_possible: false, raison: 'pool_vide', places: 6 })) === 0,
    'vente impossible (complet, ou aucune IP alors que le serveur a des places) : 0 — la liste d\'attente, jamais « 6 places »');
  ok(D.placesRestantes(D.lireDisponibilite({ vente_possible: false, raison: 'deja_client', places: 9 })) === null
    && D.placesRestantes(null) === null && D.placesRestantes(D.lireDisponibilite({ vente_possible: true })) === null,
    'déjà client, lecture absente ou nombre inconnu : aucun compteur');
  const c14 = texte(h(IC.CompteurPlacesCloud, { dispo: lu14, lang: 'fr' }));
  const c1 = texte(h(IC.CompteurPlacesCloud, { dispo: D.lireDisponibilite({ vente_possible: true, places: 1 }), lang: 'fr' }));
  const c14en = texte(h(IC.CompteurPlacesCloud, { dispo: lu14, lang: 'en' }));
  ok(c14 === '14 places restantes' && c1 === '1 place restante' && c14en === '14 spots left', 'rendu : « 14 places restantes », « 1 place restante », « 14 spots left »', `${c14} | ${c1} | ${c14en}`);
  ok(texte(h(IC.CompteurPlacesCloud, { dispo: D.lireDisponibilite({ vente_possible: false, raison: 'complet', places: 0 }), lang: 'fr' })) === ''
    && texte(h(IC.CompteurPlacesCloud, { dispo: null, lang: 'fr' })) === '', 'jamais « 0 place restante » (le bloc Complet prend la place), rien avant la lecture');
  const srcHook = lire('src/cloud/useDisponibiliteCloud.js');
  const srcIC = lire('src/cloud/InterrupteurCloud.jsx');
  ok(/demarrerRelecture\(lire, \{ intervalleMs: relireToutesLesMs/.test(srcHook) && !/setInterval/.test(srcHook.replace(/\/\/.*$/gm, '')) && D.RELECTURE_PLACES_MS === 60_000,
    'il se met à jour seul par la relecture BORNÉE (utils/relectureBornee : onglet visible, une à la fois, ralentie si la base peine), jamais setInterval, une fois par minute');
  ok((srcIC.match(/relireToutesLesMs: RELECTURE_PLACES_MS/g) ?? []).length === 3 && !/relireToutesLesMs/.test(lire('src/cloud/HoteCloud.jsx')),
    'relu seul sur les trois blocs d\'offre seulement ; l\'hôte toujours monté (HoteCloud) garde sa lecture unique');
  ok(/setLu\(\(avant\) => \(dispo \? \{ etat: 'ok', dispo \} : garder\(avant\)\)\)/.test(srcHook), 'une relecture ratée ne remplace jamais le dernier nombre sûr (le compteur ne clignote pas)');

  console.log('\n2. « Complet » et la liste d\'attente, rendus');
  const t1 = texte(h(IC.BlocCompletCloud, { dispo: { vente: false, inscrit: false }, onInscrire: async () => true, lang: 'fr' }));
  ok(/Complet pour le moment/.test(t1) && /M'inscrire sur la liste d'attente/.test(t1) && /sans rien payer/.test(t1) && /notification/.test(t1) && /24 h/.test(t1) && !/mail/i.test(t1),
    'pas inscrit(e) : « M\'inscrire sur la liste d\'attente », sans rien payer, une notification, gardée 24 h', t1);
  const t2 = texte(h(IC.BlocCompletCloud, { dispo: { vente: false, inscrit: true, rang: 2 }, onInscrire: async () => true, lang: 'fr' }));
  ok(/Tu es sur liste d'attente \(n° 2\)/.test(t2) && !/M'inscrire/.test(t2), 'inscrit(e) : « Tu es sur liste d\'attente (n° 2) », plus de bouton', t2);
  const t3 = texte(h(IC.BlocCompletCloud, { dispo: { vente: false, inscrit: false }, onInscrire: async () => true, lang: 'en' }));
  ok(/Full for now/.test(t3) && /Join the waiting list/.test(t3), 'en anglais', t3);
  const offre = { mode: 'interrupteur', essai: true };
  const t4 = texte(h(IC.SectionFreeCloud, { offre, quotaFree: 5, onCloudSeul() {}, lang: 'fr', maintenant: Date.parse('2026-10-10T06:00:00Z') }));
  ok(!/Complet pour le moment/.test(t4), 'avant la lecture (rendu serveur, lecture en cours) : l\'écran d\'avant, à l\'identique', t4);

  console.log('\n3. Le bandeau de la place libre et l\'écran « arrêté »');
  const b = texte(h(FE.BandeauPlaceLibre, { lang: 'fr', onDemarrer() {}, onFermer() {} }));
  ok(/Une place FillSell Cloud est libre/.test(b) && /24 h/.test(b) && /Démarrer FillSell Cloud/.test(b), 'bandeau : la place, gardée 24 h, un geste', b);
  const a = texte(h(FE.EcranCloudArrete, { lang: 'fr', actions: { ajouter() {}, extension() {} }, onFermer() {} }));
  ok(/FillSell Cloud est arrêté/.test(a) && /extension FillSell/.test(a) && /ordinateur/.test(a) && /Reprendre FillSell Cloud/.test(a) && /Installer ou ouvrir l'extension/.test(a),
    'arrêté : les tâches repassent par l\'extension ; reprendre, ou installer / ouvrir l\'extension', a);
  ok(!/factur|essai est terminé|la prend à son tour/i.test(a), 'arrêté : jamais « rien n\'a été facturé », « ton essai est terminé » ni « FillSell Cloud la prend »', a);
  const ae = texte(h(FE.EcranCloudArrete, { lang: 'en', actions: { ajouter() {}, extension() {} }, onFermer() {} }));
  ok(/FillSell Cloud is off/.test(ae) && /extension/.test(ae), 'en anglais', ae);

  console.log('\n4. Quel écran après le Cloud');
  const T0 = Date.parse('2026-11-03T12:00:00Z');
  const J = 86_400_000;
  const fin = (j) => new Date(T0 - j * J).toISOString();
  ok(R.ecranApresCloud({ etat: 'essai_termine', actif: false, essaiFin: fin(1) }, {}, T0) === 'essai_termine', 'essai fini hier, non pris : « Ton essai est terminé »');
  ok(R.ecranApresCloud({ etat: 'essai_termine', actif: false, essaiFin: fin(40) }, { cloud_canal: 'stripe' }, T0) === 'arrete', 'option payée puis arrêtée (essai d\'il y a 40 j) : « FillSell Cloud est arrêté »');
  ok(R.ecranApresCloud({ etat: 'aucun', actif: false, essaiFin: null }, { cloud_canal: 'apple' }, T0) === 'arrete', 'payée sans essai, puis arrêtée : « arrêté »');
  ok(R.ecranApresCloud({ etat: 'aucun', actif: false, essaiFin: null }, {}, T0) === null, 'jamais eu le Cloud : rien');
  ok(R.ecranApresCloud({ etat: 'essai_termine', actif: false, essaiArrete: true, essaiFin: fin(1) }, { cloud_canal: 'stripe' }, T0) === null, 'essai arrêté par la personne : rien de plus (décision du 04/10)');
  ok(R.ecranApresCloud({ etat: 'paye', actif: true }, { cloud_canal: 'stripe' }, T0) === null, 'actif : rien');

  console.log('\n5. Le drapeau relu au premier plan, borné');
  ok(V.RELECTURE_MIN_MS === 120_000, 'au plus une relecture toutes les 2 min');
  ok(V.aRelire({ lue: true, luLe: 0 }, 120_000) === true && V.aRelire({ lue: true, luLe: 1 }, 120_000) === false, 'relue seulement passé l\'intervalle');
  ok(V.aRelire({ lue: true, luLe: 0, promesse: {} }, 999_999) === false && V.aRelire({ lue: false, luLe: 0 }, 999_999) === false && V.aRelire(null) === false,
    'jamais pendant une lecture, jamais une lecture jamais faite (la porte du Cloud décide de la première)');
  const hook = lire('src/cloud/useCompteCloud.js');
  ok(/cloudConnexionVisible\(userId\)/.test(hook) && /if \(porte\) \{ lire\(userId\); installerRelecture\(\); \}/.test(hook), 'la relecture ne s\'installe que derrière la porte du Cloud (aucune requête pour un compte ordinaire)');

  console.log('\n6. Le texte du push');
  const M = await import('../supabase/functions/push-cloud-place/message.js');
  const mfr = M.messagePlaceLibre({ user_id: 'u1' }, 'fr');
  const men = M.messagePlaceLibre({ user_id: 'u1' }, 'en-GB');
  ok(/place FillSell Cloud est libre/.test(mfr.titre) && /24 heures/.test(mfr.corps) && /FillSell/.test(mfr.corps), 'français : la place, gardée 24 h, ouvrir FillSell', JSON.stringify(mfr));
  ok(/spot is free/.test(men.titre) && /24 hours/.test(men.corps), 'anglais (profil en-*)', JSON.stringify(men));
  ok(mfr.donnees.type === 'cloud_place' && Object.values(mfr.donnees).every((v) => typeof v === 'string'), 'données : type cloud_place, chaînes seulement (APNs / FCM)');
  ok(M.langueNotification(null) === 'fr' && M.langueNotification('EN') === 'en', 'langue : le français par défaut');
  const fn = lire('supabase/functions/push-cloud-place/index.ts');
  ok(/x-cron-secret/.test(fn) && /CRON_SECRET/.test(fn) && /status: s/.test(fn) && /Non autorisé/.test(fn), 'fonction : garde maison x-cron-secret (déployée --no-verify-jwt)');
  ok(!/envoyerEmail|mail(?!s?\b)/i.test(fn.replace(/AUCUN MAIL|jamais un mail/gi, '')), 'fonction : aucun mail');

  console.log('\n7. La migration');
  const mig = lire('supabase/migrations/20261103203000_cloud_voie_place_attente.sql');
  ok(/UPDATE public\.profiles SET cloud_voie = v_attendue WHERE id = p_user AND cloud_voie IS DISTINCT FROM v_attendue;/.test(mig), 'le drapeau ne s\'écrit que s\'il change (aucune ligne inchangée réécrite)');
  ok((mig.match(/SET cloud_voie\b/g) ?? []).length === 1, 'une seule écriture de cloud_voie : la règle');
  ok(/COALESCE\(\(public\.cloud_etat\(p_user\) ->> 'actif'\)::boolean, false\)/.test(mig), 'la règle : cloud_etat actif (essai en cours, payé, offert)');
  ok(/ALTER FUNCTION public\.cloud_compte_synchroniser\(uuid\) RENAME TO cloud_compte_synchroniser_pool/.test(mig) && /public\.cloud_compte_synchroniser_pool\(p_user\)/.test(mig),
    'cloud_compte_synchroniser : la version en place est renommée (jamais recopiée), la nouvelle l\'appelle');
  ok(/platform_settings_fusionner\(ARRAY\[v_pf\], NULL, ARRAY\['cloud_verification'\], p_user\)/.test(mig) && !/UPDATE public\.profiles SET platform_settings/.test(mig),
    'platform_settings : seulement par platform_settings_fusionner');
  ok(/j\.status = 'pending' AND j\.platform_fields \? 'attente_verification_cloud'/.test(mig), 'seules les tâches EN ATTENTE marquées par le Cloud sont rendues');
  ok(/cron\.schedule\('cloud-voies-5min', '\*\/5 \* \* \* \*'/.test(mig) && /cron\.schedule\('push-cloud-place-5min', '\*\/5 \* \* \* \*'/.test(mig)
    && /WHERE public\.cloud_attente_a_prevenir_existe\(\);/.test(mig), 'deux réveils de 5 min ; le push seulement s\'il y a quelqu\'un à prévenir');
  ok(/public\.cron_secret\(\)/.test(mig) && !/x-cron-secret', '[^']/.test(mig), 'le secret du cron n\'est jamais écrit (public.cron_secret())');
  const ouvertes = [...mig.matchAll(/GRANT EXECUTE ON FUNCTION public\.(\w+)\([^)]*\) TO authenticated/g)].map((x) => x[1]).sort();
  ok(JSON.stringify(ouvertes) === JSON.stringify(['cloud_attente_inscrire_moi', 'cloud_attente_quitter_moi', 'cloud_disponibilite_moi', 'cloud_essai_preparer_moi']),
    'l\'app n\'a que ses quatre fonctions « _moi »', ouvertes.join(','));
  const definer = [...mig.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)[\s\S]*?AS \$function\$/g)];
  ok(definer.length >= 12 && definer.every((x) => /SET search_path TO 'public', 'pg_temp'/.test(x[0])), 'chaque fonction fixe son search_path');
  ok(!/FUNCTION public\.(get_pending|reserver_jobs_extension|controler_job_extension|ecrire_statut_job_extension|prendre_job)/.test(mig),
    'rien de get-pending-jobs ni de la réservation des tâches n\'est réécrit');
  ok(/'complet'/.test(mig) && /v_vente ->> 'raison' = 'complet'/.test(mig) && mig.indexOf("'complet'") < mig.indexOf('cloud_ip_reserver(v_user)'),
    'la préparation refuse « complet » AVANT de réserver une IP');
  const inverse = lire('supabase/rollbacks/20261103203000_cloud_voie_place_attente_INVERSE.sql');
  ok(/RENAME TO cloud_compte_synchroniser;/.test(inverse) && /cron\.unschedule/.test(inverse) && /CREATE OR REPLACE FUNCTION public\.cloud_essai_preparer_moi/.test(inverse),
    'l\'inverse rend la version d\'avant (renommage, préparation de la prod, réveils retirés)');
} finally {
  await vite.close();
}
console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
