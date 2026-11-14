// VERROU (14/11/2026, cliente 13e274de — Vinted connecté en 40 min, essai Pro + Cloud, Edge sur Android) :
// LA MÊME PERSONNE NE SE COUPE JAMAIS ELLE-MÊME — une page de connexion remplacée pendant qu'on ne la regardait pas.
//
// Ce qui s'est passé (usage_logs + journaux de la passerelle Supabase, heure de Paris) : 00:42:55 page Vinted ouverte
// dans un onglet Edge (A) ; elle quitte Edge (code Vinted à lire) ; 00:44:58 une DEUXIÈME page FillSell se charge dans le
// même Edge (B : démarrage de l'app, carte du Tableau à 00:45:01 alors que A a encore sa page de connexion ouverte —
// la carte n'existe pas tant que « Me connecter » est ouvert, App.jsx) ; 00:44:59 A se reprend (reprise n° 1) ;
// 00:45:17.4 B touche Vinted (cloud_serveur_moi relu : nouvelle page, MeConnecterCloud.jsx domaineLu) ; le serveur
// reprend la page Vinted pour B et dit « remplacee » à A ; 00:45:17.8 A, en arrière-plan, s'ARRÊTE pour de bon
// (cloud_connexion_fin « remplacee ») : « Une autre page… celle-ci s'arrête… ferme puis rouvre la plateforme ».
//
// Règle (pour tous) : une page remplacée PENDANT QU'ON NE LA REGARDAIT PAS (onglet ou appli en arrière-plan, ou revenue
// au premier plan depuis moins de VUE_STABLE_MS) n'est pas une fin : elle se met en PAUSE (« Ta connexion continue sur ton
// autre écran FillSell ») avec « Continuer ici », qui la reprend LÀ OÙ ELLE EN ÉTAIT (le serveur garde la page). Jamais
// de reprise toute seule (règle du 09/11, cliente d813639b : seul un toucher remplace une page). Une page remplacée sous
// les yeux de la personne (deux écrans allumés) finit comme avant.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => { try { return readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };

const suiviMod = await import('../src/cloud/connexion/suiviVue.js').catch((e) => ({ erreur: e }));
console.log('1. L\'automate de la page de connexion (pur, partagé par les trois écrans qui montrent la page)');
ok(!suiviMod.erreur && typeof suiviMod.creerSuiviVue === 'function', 'src/cloud/connexion/suiviVue.js : creerSuiviVue existe');

if (!suiviMod.erreur) {
  const { creerSuiviVue, VUE_STABLE_MS, estRemplacement } = suiviMod;
  const FINALES = ['connecte', 'refuse', 'inactif', 'non_autorise', 'expire', 'erreur', 'resolu', 'revenue', 'restreint', 'session_fermee', 'rien', 'remplacee'];
  const banc = ({ visible = true } = {}) => {
    let t = 1_000_000;
    const faits = [];
    const agir = {
      clavier: (v) => faits.push(['clavier', v]), cookies: (v) => faits.push(['cookies', v]), message: (m) => faits.push(['message', m]),
      verifiee: () => faits.push(['verifiee']), fin: (e, m) => faits.push(['fin', e, m]), pause: (p) => faits.push(['pause', p]),
      reprendre: () => faits.push(['reprendre']), fermerApres: () => faits.push(['fermerApres']),
    };
    const s = creerSuiviVue({ finales: FINALES, maintenant: () => t, agir, visible });
    return { s, faits, avancer: (ms) => { t += ms; }, a: (k) => faits.filter((f) => f[0] === k) };
  };

  console.log('\n2. Le cas du 14/11 : la page A, en arrière-plan, est remplacée par la page B du même téléphone');
  {
    const b = banc();
    b.s.etape('pret', 'La page est prête');
    b.avancer(120_000);
    b.s.visibilite(false);                       // elle quitte Edge (lire le code de Vinted)
    b.avancer(2_000);
    // Ce que le serveur envoie à la page remplacée (connexion.js, signifierRemplacee) : « remplacee », « expire », 4409.
    b.s.etape('remplacee', 'Une autre page de connexion FillSell Cloud s\'est ouverte…');
    b.s.etape('expire', 'Une autre page de connexion FillSell Cloud s\'est ouverte…');
    b.s.etape('ferme', '', { code: 4409 });
    ok(b.a('fin').length === 0, 'aucune fin (« cloud_connexion_fin remplacee ») pour une page qu\'on ne regardait pas');
    ok(b.a('pause').length === 1, 'une pause, une seule (« Ta connexion continue sur ton autre écran »)');
    ok(b.a('reprendre').length === 0, 'aucune reprise toute seule (règle du 09/11 : seul un toucher remplace)');
    ok(!b.faits.some((f) => f[0] === 'message' && /s'arrête|ferme puis rouvre/.test(f[1] ?? '')), 'le message d\'arrêt du serveur ne s\'affiche pas');
    b.s.visibilite(true);                        // elle revient sur l'onglet A
    b.avancer(5_000);
    ok(b.a('reprendre').length === 0 && b.a('fin').length === 0, 'au retour sur l\'onglet : toujours en pause, rien ne part seul');
    ok(b.s.continuerIci() === true, '« Continuer ici » (un toucher) relance la page');
    ok(b.s.continuerIci() === false, '« Continuer ici » ne relance qu\'une fois (pas de double ouverture)');
    b.s.etape('pret', 'Te revoilà : ta page de connexion est restée ouverte.');
    ok(b.a('message').some((f) => /Te revoilà/.test(f[1])), 'après « Continuer ici », la page suit de nouveau le serveur (« Te revoilà »)');
  }

  console.log('\n3. Page dégelée au retour : « remplacee » lue juste après le retour au premier plan = pause, pas fin');
  {
    const b = banc({ visible: false });
    b.s.visibilite(true);
    b.avancer(VUE_STABLE_MS - 200);
    b.s.etape('remplacee', 'x');
    ok(b.a('pause').length === 1 && b.a('fin').length === 0, `revenue depuis moins de ${VUE_STABLE_MS} ms : pause`);
  }

  console.log('\n4. Deux écrans allumés (ordinateur + téléphone, règle du 09/11) : la page remplacée SOUS LES YEUX finit, sans reprise');
  {
    const b = banc();
    b.avancer(VUE_STABLE_MS + 10_000);
    b.s.etape('remplacee', 'Une autre page…');
    b.s.etape('expire', 'Une autre page…');
    b.s.etape('ferme', '', { code: 4409 });
    ok(b.a('fin').length === 1 && b.a('fin')[0][1] === 'remplacee', 'fin « remplacee », une seule');
    ok(b.a('pause').length === 0 && b.a('reprendre').length === 0, 'ni pause ni reprise');
    ok(b.s.continuerIci() === false, '« Continuer ici » n\'existe pas après une fin');
  }

  console.log('\n5. Serveur d\'avant le 09/11 (1000 sans étape finale) et coupures : inchangés sauf la pause');
  {
    const b = banc();
    b.avancer(VUE_STABLE_MS + 1);
    b.s.etape('ferme', '', { code: 1000 });
    ok(b.a('fin').length === 1 && b.a('fin')[0][1] === 'remplacee', '1000 sous les yeux : fin « remplacee »');
    const c = banc();
    c.s.visibilite(false);
    c.s.etape('ferme', '', { code: 1000 });
    ok(c.a('pause').length === 1 && c.a('fin').length === 0, '1000 en arrière-plan : pause');
    for (const code of [1006, 1001, 1012]) {
      const d = banc();
      d.s.visibilite(false);
      d.s.etape('ferme', '', { code });
      ok(d.a('reprendre').length === 1 && d.a('pause').length === 0, `coupure ${code} : reprise (comme avant)`);
    }
    ok(estRemplacement('remplacee') && estRemplacement('ferme', 4409) && !estRemplacement('ferme', 1006) && !estRemplacement('expire'), 'estRemplacement : « remplacee », 1000 et 4409 seulement');
  }

  console.log('\n6. Le reste de la page ne change pas (vérifiée, connectée, clavier, cookies, finales)');
  {
    const b = banc();
    b.s.etape('clavier', true); b.s.etape('cookies', false); b.s.etape('verifie', 'Vérifié');
    b.s.etape('connecte', 'C\'est fait');
    ok(b.a('clavier')[0]?.[1] === true && b.a('cookies')[0]?.[1] === false && b.a('verifiee').length === 1, 'clavier, cookies, vérifiée transmis');
    ok(b.a('fin').length === 1 && b.a('fin')[0][1] === 'connecte' && b.a('fermerApres').length === 1, '« connecte » : une fin, puis l\'écran se ferme');
    b.s.etape('ferme', '', { code: 1000 });
    ok(b.a('fin').length === 1 && b.a('reprendre').length === 0 && b.a('pause').length === 0, 'la fermeture qui suit une fin ne fait rien');
  }
}

console.log('\n7. La page de connexion (MeConnecterCloud.jsx, Vue — aussi celle du parcours d\'entrée et du bandeau) suit l\'automate');
const me = lire('src/cloud/MeConnecterCloud.jsx');
ok(/import \{ creerSuiviVue[^}]*\} from '\.\/connexion\/suiviVue'/.test(me), 'Vue importe creerSuiviVue');
ok(/creerSuiviVue\(\{/.test(me) && /suivi\.etape\(/.test(me), 'chaque étape du serveur passe par l\'automate');
ok(/addEventListener\('visibilitychange', surVisibilite\)/.test(me) && /suivi\.visibilite\(/.test(me), 'la visibilité de la page est suivie (arrière-plan / premier plan)');
ok(/removeEventListener\('visibilitychange', surVisibilite\)/.test(me), 'l\'écoute de visibilité est retirée au démontage');
ok(/surEtat: \(etape, m, info\) => \{ if \(!mort && session\.current === cette\) suivi\.etape\(etape, m, info\); \}/.test(me), 'seule la connexion en cours parle (un message tardif d\'une connexion d\'avant ne touche plus l\'écran)');
ok(/'cloud_connexion_ailleurs'/.test(me) && /'cloud_connexion_continuer_ici'/.test(me), 'traces « cloud_connexion_ailleurs » (pause) et « cloud_connexion_continuer_ici » (toucher)');
ok(/data-cloud-bouton="continuer-ici"/.test(me) && /suivi\.continuerIci\(\)/.test(me), 'le bouton « Continuer ici » relance la page par un toucher');
ok(/reprises = 0;[^\n]*\n?[^\n]*ouvrir\(\)/.test(me) || /continuerIci\(\)\) return;\s*reprises = 0;/.test(me), '« Continuer ici » repart d\'un toucher (reprise: false : le serveur reprend la page pour cet écran)');
ok(!/if \(!repriseApresFermeture\(info\?\.code\)\) \{ finale = true; setFinie\(true\); setMessage\(T\.remplacee\); fin\('remplacee'/.test(me), 'plus de fin « remplacee » sans regarder si la personne voyait la page');
const textes = await import('../src/cloud/textesConnexion.js').catch(() => null);
for (const l of ['fr', 'en']) {
  const T = textes?.textesConnexion?.(l) ?? {};
  ok(typeof T.ailleurs === 'string' && T.ailleurs.length > 20 && typeof T.continuerIci === 'string', `textes « ailleurs » et « Continuer ici » (${l})`);
  ok(!/ordinateur|Chrome|computer/i.test(T.ailleurs ?? 'ordinateur'), `« ailleurs » ne parle ni d'ordinateur ni de Chrome (${l}, règle de Nico du 13/11)`);
}
const pkg = lire('package.json');
ok(/"selftest:cloud-connexion-meme-appareil": "node scripts\/cloud-connexion-meme-appareil-selftest\.mjs"/.test(pkg), 'verrou inscrit dans package.json');

console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
