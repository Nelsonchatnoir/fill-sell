// selftest:creneau-remplace-les-sautes — (25/10, Jocabroc 53efea05, créneau 19:00-22:00) LE CRÉNEAU FAIT SES PRÉVUES EN
// REMPLAÇANT SES SAUTÉS, UNE ANNONCE INTROUVABLE NE RESTE PAS CANDIDATE, UNE RETENUE DIT TOUJOURS SON MOTIF — et l'app
// le montre (Chrome fermé « de … à … », le rythme « la suivante ne pouvait partir qu'à … »).
// Migration 20261025180000 APPLIQUÉE le 25/10 à 17:58:56 (feu vert nommé de Nico ; essai annulé rejoué juste avant :
// 14 comptes, 0 erreur ; md5 relus après = ceux du fichier). Rapport : docs/enquetes/import-publier-ailleurs-2510/CRENEAU-JOCABROC.md.
// La cadence reste INTOUCHÉE : rythme du COMPTE toutes plateformes (le rythme par plateforme attend la décision de Nico),
// un job par compte et par passage, intervalle = durée / prévues, plafonds, quotas.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const racine = path.join(ici, '..');
const lire = (p) => fs.readFileSync(path.join(racine, p), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };

const mig = lire('supabase/migrations/20261025180000_creneau_remplace_les_sautes.sql');
const inv = lire('supabase/rollbacks/20261025180000_creneau_remplace_les_sautes_INVERSE.sql');
const corps = (src, nom) => {
  const i = src.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  if (i < 0) return '';
  const a = src.indexOf('AS $function$', i);
  return src.slice(i, src.indexOf('$function$', a + 14) + 10);
};
const saute = corps(mig, 'republish_essai_saute');
const cand = corps(mig, 'republish_planifiee_candidats');
const sweep = corps(mig, 'republish_planifiee_sweep');
const etat = corps(mig, 'republish_planifiee_etat');

console.log('1. La migration (appliquée) : partie de la prod, inverse prêt');
ok(/md5\(pg_get_functiondef\('public\.republish_planifiee_sweep\(\)'::regprocedure\)\) <> '6f146a071cbcb51508b64d881d67ca99'/.test(mig)
  && /'77fd309ebdd99d40b89ad2faa1f64a09'/.test(mig) && /'fdb1ed209a2563020de423d55086113f'/.test(mig),
  'garde md5 des trois corps de prod (sweep, candidats, état) avant tout remplacement');
ok(saute && cand && sweep && etat, 'les quatre fonctions sont dans le fichier');
ok(corps(inv, 'republish_planifiee_sweep') && corps(inv, 'republish_planifiee_candidats') && corps(inv, 'republish_planifiee_etat')
  && /DROP FUNCTION IF EXISTS public\.republish_essai_saute\(text, ?jsonb, ?text\)/.test(inv),
  'inverse : les trois corps d\'avant puis DROP de republish_essai_saute');

console.log('2. Un essai SAUTÉ : rien retiré, rien redéposé, portée ARTICLE');
const { MARQUES_RETRAIT_OU_DEPOT } = await import(pathToFileURL(path.join(racine, 'supabase/functions/_shared/accident-avant-retrait.js')).href);
const marquesSql = [...saute.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
ok(MARQUES_RETRAIT_OU_DEPOT.every((k) => marquesSql.includes(k)), 'marques d\'un retrait engagé ou d\'un dépôt tenté = MARQUES_RETRAIT_OU_DEPOT, mot pour mot');
ok(/IN \('cancelled', 'failed', 'needs_user'\)/.test(saute) && /IN \('a_capturer', 'captured'\)/.test(saute)
  && /republish_echec_portee\(p_status, p_pf, p_error\), ''\) = 'article'/.test(saute),
  'clos ou en attente, avant tout retrait, et de portée ARTICLE (une panne du COMPTE n\'est jamais un sauté)');
ok(/REVOKE ALL ON FUNCTION public\.republish_essai_saute\(text, jsonb, text\) FROM PUBLIC, anon, authenticated/.test(mig)
  && /GRANT EXECUTE ON FUNCTION public\.republish_essai_saute\(text, jsonb, text\) TO service_role/.test(mig),
  'exécutable par le serveur seul');

console.log('3. Le balayage : la place d\'un sauté est rendue, toute retenue écrit son motif');
ok(/v_remplace := v_sautes_cr <= COALESCE\(v_row\.prevues, 0\)/.test(sweep), 'au plus `prevues` sautés rendus par créneau');
ok(/v_faits_cr := v_reels_cr \+ CASE WHEN v_remplace THEN 0 ELSE v_sautes_cr END/.test(sweep), '6bis : un sauté ne prend pas une place des prévues (au-delà : compté comme avant)');
ok(/AND \(NOT v_remplace OR NOT republish_essai_saute\(j\.status, j\.platform_fields, j\.error\)\)/.test(sweep), '6 : un sauté ne fixe pas le rythme');
const i6 = sweep.indexOf('-- 6. Espacement déterministe.');
const iRef = sweep.indexOf('SELECT j.created_at, j.platform INTO v_dernier, v_dernier_pf', i6);
const reference = iRef > i6 ? sweep.slice(iRef, sweep.indexOf('LIMIT 1;', iRef)) : '';
ok(/WHERE j\.user_id = v_compte\.id AND j\.action = 'republish'\s+AND j\.platform_fields ->> 'republish_source' = 'auto'/.test(reference)
  && !/j\.platform\s*=\s*v_pf/.test(reference),
  'CADENCE INTOUCHÉE : le rythme reste celui du COMPTE, toutes plateformes (le rythme par plateforme attend Nico)');
ok(/EXIT WHEN v_cree;/.test(sweep), 'un job par compte et par passage : inchangé');
ok(/'_extension_absente', jsonb_build_object\(\s*'motif', 'extension_absente'/.test(sweep)
  && /IF NOT \(v_row\.sautes \? '_extension_absente'\) OR \(v_row\.sautes -> '_extension_absente' \? 'leve_le'\) THEN/.test(sweep)
  && /'\{_extension_absente,leve_le\}'/.test(sweep),
  'Chrome absent : état daté posé à la transition, levé au retour (jamais réécrit à chaque passage)');
ok(/'_espacement', jsonb_build_object\(\s*'motif', 'espacement'/.test(sweep) && /'apres_fin', v_prochaine >= v_row\.fin/.test(sweep)
  && /IF \(v_row\.sautes -> '_espacement' ->> 'dernier'\) IS DISTINCT FROM/.test(sweep),
  'rythme : la republication de référence, sa plateforme, la prochaine heure, après la fin ? — une écriture par référence');
ok(/'_aucun_candidat'/.test(sweep) && /'_remplacements_epuises'/.test(sweep), 'aucun candidat / remplacements épuisés : notés une fois');

console.log('4. Les candidats Vinted : une annonce absente de deux relevés complets n\'est plus tirée');
ok(/annonce_introuvable/.test(cand) && /vinted_sync_runs|vinted_listing_snapshots/.test(cand), 'branche Vinted : preuve lue dans les relevés du dressing');

console.log('5. L\'app dit chaque motif que le serveur écrit (jamais « Arrêt du passage (…) »)');
const app = lire('src/components/RepublicationPlanifiee.jsx');
const extraire = (nom) => {
  const i = app.indexOf(`function ${nom}(`);
  assert.ok(i >= 0, `fonction ${nom} absente`);
  return app.slice(i, app.indexOf('\n}\n', i) + 2);
};
const NOMS_SRC = app.slice(app.indexOf('const NOMS = '), app.indexOf('\n', app.indexOf('const NOMS = ')));
const f = new Function(`${NOMS_SRC}
${extraire('fmtHHMM')}
${extraire('heureDans')}
${extraire('texteMotifCompte')}
${extraire('sousExtensionAbsente')}
${extraire('phraseExtensionAbsente')}
${extraire('sousEspacement')}
return { texteMotifCompte, sousExtensionAbsente, phraseExtensionAbsente, sousEspacement };`)();
const motifsServeur = [...new Set([...sweep.matchAll(/'motif', '([a-z_]+)'/g)].map((m) => m[1]))].filter((m) => m !== 'autre_boutique');
for (const m of motifsServeur) {
  ok(!/^(Arrêt du passage|Pass stopped)/.test(f.texteMotifCompte(m, true)) && !/^(Arrêt du passage|Pass stopped)/.test(f.texteMotifCompte(m, false)),
    `motif « ${m} » : ${f.texteMotifCompte(m, true)}`);
}
const P = 'Europe/Paris';
// 24/10 (heure d'été, UTC+2) : Chrome muet de 16:58 à 21:12, le créneau l'a vu dès 19:03.
const absent = { motif: 'extension_absente', depuis: '2026-10-24T17:03:00Z', leve_le: '2026-10-24T19:12:12Z', derniere_vue: '2026-10-24T14:58:42Z' };
ok(f.phraseExtensionAbsente(absent, P, true) === 'Chrome était fermé de 19h03 à 21h12 (dernier signe à 16h58).', `phrase : ${f.phraseExtensionAbsente(absent, P, true)}`);
ok(f.sousExtensionAbsente({ ...absent, leve_le: undefined }, P, true) === 'Depuis 19h03 · dernier signe de Chrome à 16h58', `détail en cours : ${f.sousExtensionAbsente({ ...absent, leve_le: undefined }, P, true)}`);
ok(f.phraseExtensionAbsente(absent, P, false) === 'Chrome was closed from 19:03 to 21:12 (last sign at 16:58).', 'anglais');
// 24/10 : Leboncoin derrière la republication Vinted de 21:15:01 (36 min) → 21:51:01 ; puis 21:48 → après la fin.
const esp = { motif: 'espacement', platform: 'leboncoin', dernier: '2026-10-24T19:15:01Z', dernier_platform: 'vinted', prochaine: '2026-10-24T19:51:01Z', apres_fin: false };
ok(f.sousEspacement(esp, 'leboncoin', P, true) === 'Après la republication Vinted de 21h15, la suivante ne pouvait partir qu’à 21h51.', `rythme : ${f.sousEspacement(esp, 'leboncoin', P, true)}`);
ok(f.sousEspacement({ ...esp, dernier: '2026-10-24T19:48:01Z', prochaine: '2026-10-24T20:24:01Z', apres_fin: true }, 'leboncoin', P, true)
  === 'Après la republication Vinted de 21h48, la suivante ne pouvait partir qu’après la fin du créneau.', 'rythme repoussé après la fin : dit tel quel');
ok(f.sousEspacement({ ...esp, dernier_platform: 'leboncoin' }, 'leboncoin', P, true) === 'Après la republication de 21h15, la suivante ne pouvait partir qu’à 21h51.',
  'même plateforme : pas de nom de plateforme');
// Créneau en cours : la prochaine heure est À VENIR → jamais écrite (aucune estimation devant la personne).
const maintenantEssai = Date.parse('2026-10-25T18:40:00Z');
ok(f.sousEspacement({ ...esp, dernier: '2026-10-25T18:30:01Z', prochaine: '2026-10-25T19:06:01Z' }, 'leboncoin', P, true, maintenantEssai)
  === 'Après la republication Vinted de 19h30, la suivante attend son tour.', 'créneau en cours : l\'heure à venir n\'est jamais écrite');

console.log('6. Pendant le créneau, ce qui retient MAINTENANT passe avant le créneau manqué d\'hier');
const synth = app.slice(app.indexOf('function synthese('), app.indexOf('const tonCouleur'));
const ligne = synth.slice(synth.indexOf('let etatLigne'), synth.indexOf('let avis = null'));
const iChrome = ligne.indexOf('} else if (dans && attenteChrome) {');
const iRythme = ligne.indexOf('} else if (dans && attenteRythme?.apres_fin === true) {');
const iManque = ligne.indexOf('} else if (manque) {');
ok(iChrome > 0 && iRythme > iChrome && iManque > iRythme, 'ligne d\'état : en vol → Chrome → plus rien dans ce créneau → créneau manqué');
ok(!/attenteRythme\.prochaine/.test(synth) && !/vers \$\{prochaine/.test(synth),
  'jamais l\'heure de la suivante en direct (aucune estimation devant la personne, Nico 15/10) : seulement des faits passés');
const avis = synth.slice(synth.indexOf('let avis = null'));
ok(avis.indexOf('} else if (actif && dans && attenteChrome) {') > 0
  && avis.indexOf('} else if (actif && dans && attenteRythme) {') > avis.indexOf('} else if (actif && dans && attenteChrome) {')
  && avis.indexOf('} else if (manque) {') > avis.indexOf('} else if (actif && dans && attenteRythme) {'),
  'avis : Chrome → rythme → créneau manqué');
ok(/etat\?\.creneau_courant\?\.sautes/.test(synth) && /!notesCourant\._extension_absente\.leve_le/.test(synth)
  && /Date\.parse\(notesCourant\._espacement\.prochaine \?\? ''\) > Date\.now\(\)/.test(synth),
  'lu dans le créneau COURANT rendu par republish_planifiee_etat (Chrome non revenu ; prochaine heure à venir ou après la fin)');
ok(/'creneau_courant', v_courant/.test(etat), 'republish_planifiee_etat rend bien la ligne du créneau courant (ses notes comprises)');
const histo = app.slice(app.indexOf('export function RepublicationPlanifieeHistorique'));
ok(/manque && c\.sautes\?\._extension_absente\) phrase =/.test(histo) && /k === '_extension_absente'/.test(histo) && /k === '_espacement'/.test(histo)
  && /!\(k === '_espacement' && c\.statut === 'termine'\)/.test(histo),
  'historique : Chrome fermé « de … à … », le rythme (sauf sur un créneau qui a tout fait)');

console.log(`\n✓ creneau-remplace-les-sautes : ${n} contrôles verts`);
