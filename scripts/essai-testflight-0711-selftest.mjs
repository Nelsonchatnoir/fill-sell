// Autotest de l'ESSAI TESTFLIGHT DE NICO (2.9.164, 07/11 soir, compte neuf, Cloud pris seul par Apple) — points c, d, e.
//
//     npm run selftest:essai-testflight-0711
//
// (Le point a — l'arrêt du Cloud par le canal qui le facture — est prouvé par selftest:cloud-achat, section 7, et
// selftest:cloud-ecrans, section 7c ter.)
//
//   c. La carte « Synchronisation » du Stock ne dit jamais « Ton ordinateur travaille pendant ce temps. » à un client
//      FillSell Cloud : elle dit que c'est le Cloud qui travaille (ordinateur éteint possible). « Client Cloud » =
//      useCompteCloud (profiles.cloud_voie), la même règle que le reste de l'app.
//   d. « 0 plateforme sur 2 » au-dessus d'une liste de 3 lignes : le compte vient de la MÊME liste que celle affichée
//      (relevés du serveur), sinon de la vague (comme avant).
//   e. Le bandeau « Mettre à jour l'extension » ne se montre JAMAIS à un client Cloud (même règle qu'en c).
import { readFileSync } from 'node:fs';

let ko = 0, n = 0;
const ok = (c, m, detail = '') => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${detail ? `   ← ${String(detail).slice(0, 300)}` : ''}`); } };
const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const { compteSynchroEnCours, releveAvancementFini, lireVague } = await import('../src/annonces/etatReleve.js');
const { textesAnnonces } = await import('../src/annonces/textes.js');
const { bandeauMajExtensionVisible } = await import('../src/cloud/voieCloud.js');

console.log('\nd. Le compte de la carte en cours = la liste affichée');
// Le cas de Nico : 3 plateformes cochées à l'entrée, aucune connectée. Beebs en file, Leboncoin en cours, Vinted à
// reconnecter (son relevé n'a pas démarré : la vague de l'app ne la compte pas).
const runs = { beebs: { status: 'queued', queued_at: '2026-11-07T18:00:00Z' }, leboncoin: { status: 'running', queued_at: '2026-11-07T18:00:01Z', started_at: '2026-11-07T18:00:05Z' } };
const vague = lireVague({ plateformes: ['vinted', 'leboncoin', 'beebs'], runs, runVinted: null, etatVinted: { enCours: false } });
ok(vague.active === true && vague.total === 2, 'la vague de l’app : 2 membres (Vinted à reconnecter n’en est pas) — d’où « 0 plateforme sur 2 »', JSON.stringify(vague));
const releves = [
  { platform: 'beebs', status: 'queued' },
  { platform: 'leboncoin', status: 'running', lues: 0 },
  { platform: 'vinted', status: 'absente' },
];
const c = compteSynchroEnCours({ vague, releves });
ok(c.total === releves.length && c.total === 3 && c.faites === 0, 'avec la liste du serveur : « 0 plateforme sur 3 », comme les 3 lignes affichées', JSON.stringify(c));
const T = textesAnnonces('fr');
ok(T.sousEnCours(c.faites, c.total) === '0 plateforme sur 3', 'le texte : « 0 plateforme sur 3 »', T.sousEnCours(c.faites, c.total));
const fins = compteSynchroEnCours({ vague, releves: [{ status: 'done' }, { status: 'incomplete' }, { status: 'failed' }, { status: 'expired' }, { status: 'running' }] });
ok(fins.faites === 2 && fins.total === 5, 'faites = relevés finis (done, incomplete), comme la coche de la ligne ; « à reconnecter » n’est pas fait', JSON.stringify(fins));
ok(releveAvancementFini({ status: 'done' }) && releveAvancementFini({ status: 'incomplete' }) && !releveAvancementFini({ status: 'failed' }) && !releveAvancementFini(null), 'la règle « fini » de la ligne et du compte : la même');
const sans = compteSynchroEnCours({ vague, releves: null });
ok(sans.total === vague.total && sans.faites === vague.faites.length, 'sans liste du serveur : la vague, comme avant (aucune régression)', JSON.stringify(sans));
ok(compteSynchroEnCours({ vague, releves: [] }).total === 2 && compteSynchroEnCours({ vague: null, releves: undefined }).total === 0, 'liste vide : la vague ; rien du tout : 0, jamais une exception');
const bloc = lire('src/stock/BlocSynchro.jsx');
ok(/const compteEnCours = compteSynchroEnCours\(\{ vague, releves: av\?\.releves \}\);/.test(bloc) && /T\.sousEnCours\(compteEnCours\.faites, compteEnCours\.total\)/.test(bloc) && !/T\.sousEnCours\(vague\.faites\.length, vague\.total\)/.test(bloc),
  'BlocSynchro : « N plateformes sur M » lit compteSynchroEnCours, sur av.releves — la liste qu’il affiche');
ok(/\.\.\.\(av\.releves \?\? \[\]\)\.map\(\(x\) => \{\n\s*const fini = releveAvancementFini\(x\);/.test(bloc), 'BlocSynchro : la coche des lignes et le compte partagent releveAvancementFini');

console.log('\nc. La carte en cours, pour un client FillSell Cloud');
for (const lang of ['fr', 'en']) {
  const L = textesAnnonces(lang);
  // (09/11, point C1 de Nico) « plus besoin d'ordinateur » : jamais « ordinateur éteint » (qui suppose un ordinateur).
  ok(/FillSell Cloud/.test(L.enCoursSousCloud) && (lang === 'fr' ? /sans ordinateur/.test(L.enCoursSousCloud) : /no computer needed/.test(L.enCoursSousCloud))
    && !/éteint|computer off/.test(L.enCoursSousCloud),
    `${lang} : « FillSell Cloud travaille… sans ordinateur »`, L.enCoursSousCloud);
  ok(!/^Ton ordinateur|^Your computer/.test(L.enCoursSousCloud) && /FillSell Cloud/.test(L.enCoursAttenteCloud) && !/ordinateur|computer/.test(L.enCoursAttenteCloud),
    `${lang} : jamais « ton ordinateur travaille », ni « en attente de ton ordinateur »`, L.enCoursAttenteCloud);
}
ok(T.enCoursSous === 'Ton ordinateur travaille pendant ce temps.', 'compte ordinaire : le texte imposé, mot pour mot (aucune régression)');
ok(/import \{ useCompteCloud \} from '\.\.\/cloud\/useCompteCloud';/.test(bloc) && /const compteCloud = useCompteCloud\(user\?\.id \?\? null\);/.test(bloc),
  'BlocSynchro : « client Cloud » = useCompteCloud (profiles.cloud_voie), la règle du Stock, de la file et du suivi');
ok(/compteCloud \? T\.enCoursSousCloud : T\.enCoursSous/.test(bloc) && /compteCloud \? T\.enCoursAttenteCloud : T\.enCoursAttente/.test(bloc), 'BlocSynchro : les deux phrases de la carte en cours suivent le compte Cloud');
const iHook = bloc.indexOf('const compteCloud = useCompteCloud(');
const iRetour = bloc.indexOf('if (!ouvert || !r.userId) return');
ok(iHook > 0 && iRetour > iHook, 'BlocSynchro : le hook est appelé AVANT le retour anticipé (ordre des hooks stable)');

console.log('\ne. Le bandeau « Mettre à jour l’extension »');
const lu = (cloud) => ({ lu: true, cloud });
ok(bandeauMajExtensionVisible({ extensionPerimee: true, cloud: lu(true) }) === false, 'client Cloud, extension « périmée » (vieux build d’ordinateur, vue par le poste Cloud) : JAMAIS');
ok(bandeauMajExtensionVisible({ extensionPerimee: true, cloud: { lu: false, cloud: false } }) === false, 'état Cloud pas encore lu : rien (jamais un éclair du bandeau)');
ok(bandeauMajExtensionVisible({ extensionPerimee: true, cloud: lu(false) }) === true, 'compte ordinaire, extension périmée : le bandeau, comme avant');
ok(bandeauMajExtensionVisible({ extensionPerimee: false, cloud: lu(false) }) === false && bandeauMajExtensionVisible({ extensionPerimee: true, cloud: null }) === false,
  'extension à jour : rien ; état illisible (null) : rien');
const app = lire('src/App.jsx');
ok(/const etatCompteCloud=useEtatCompteCloud\(user\?\.id\?\?null\);\n\s*const extBannerVisible=bandeauMajExtensionVisible\(\{extensionPerimee:extensionOutdated,cloud:etatCompteCloud\}\);/.test(app),
  'App : extBannerVisible (source unique du rendu ET de la relecture toutes les 10 s) passe par la règle Cloud');
ok(/\{extBannerVisible&&\(/.test(app) && /if\(!extBannerVisible\|\|!user\?\.id\) return;/.test(app), 'App : le bandeau et sa relecture lisent toujours la même source (extBannerVisible)');
const hook = lire('src/cloud/useCompteCloud.js');
ok(/export function useEtatCompteCloud\(userId\) \{\n\s*const cloud = useCompteCloud\(userId\);/.test(hook) && /lu: !porte \|\|/.test(hook),
  'useEtatCompteCloud : le MÊME drapeau que useCompteCloud ; hors de la porte du Cloud, lu tout de suite (le parc ne change pas)');
ok(/if \(porte\) \{ lire\(userId\); installerRelecture\(\); \}/.test(hook), 'useCompteCloud : la lecture reste derrière la porte du Cloud (aucune requête pour un compte ordinaire)');

console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
