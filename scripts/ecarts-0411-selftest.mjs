// ═══════════════════════════════════════════════════════════════════════════
// LES ÉCARTS RELEVÉS SUR LES VRAIS ÉCRANS (04/11/2026, décisions de Nico) — `npm run selftest:ecarts-0411`
//     (node --import ./scripts/loader-ext.mjs scripts/ecarts-0411-selftest.mjs)
// ═══════════════════════════════════════════════════════════════════════════
// Grille à 3 jauges (interrupteur coin_config.grille_trois_jauges) : ce que ce test garde, sans réseau ni base.
//   1. la pastille de l'en-tête : le MOT de la jauge ne cède jamais, c'est « restante(s) » qui part ; la roue reste
//      à l'écran (la droite ne cède rien). Mesuré de 320 à 1920 px au navigateur (preuve ponctuelle, rapport) ;
//   2. la date des murs (« Attendre le JJ/MM ») : quotas_etat d'abord, puis le refus, puis coin_wallets ; à 0, rien ;
//   5. le toast passe à la ligne au lieu de sortir de l'écran (largeur max : l'écran moins deux gouttières de 16 px) ;
//   6. la remontée en lot sans assez de remontées : les PLUS ANCIENNES d'abord, dans la limite exacte, jamais un
//      article à moitié (stock/remonteesDuLot.js, pur), et la cadence intouchée.
// Les murs (2, 3, 4) sont aussi rendus par offres-trois-jauges ; la feuille de remontée (6) par cout-publication ;
// les mots du Cloud (7) par cloud-prix-nom et cloud-ecrans.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 600)}` : ''}`); }
};

// ── 1. La pastille de l'en-tête ────────────────────────────────────────────
console.log('1. La pastille : le mot de la jauge ne cède jamais, « restante(s) » oui ; la roue reste à l’écran');
{
  const css = lire('src/App.css');
  const app = lire('src/App.jsx');
  const pastille = app.slice(app.indexOf('{grilleEntete&&pastilleGrille&&('), app.indexOf('{!grilleEntete&&quotas?.annonces?.plafond!=null&&('));
  ok(/<span className="tb-quota-jauge">\{motJauge\(pastilleGrille\.cle,pastilleGrille\.restantes,'fr'\)\}<\/span><span className="tb-quota-restante">\{` restante\$\{pastilleGrille\.restantes>1\?"s":""\}`\}<\/span>/.test(pastille)
    && /<span className="tb-quota-jauge">\{motJauge\(pastilleGrille\.cle,pastilleGrille\.restantes,'en'\)\}<\/span><span className="tb-quota-restante"> left<\/span>/.test(pastille),
    'App.jsx : le mot dans .tb-quota-jauge, « restante(s) » / « left » à part dans .tb-quota-restante');
  ok(!/tb-quota-mot/.test(pastille), 'la pastille de la grille ne porte plus .tb-quota-mot (la classe qui fait céder le mot)');
  ok(/@media \(max-width: 420px\) \{\s*\n\s*\.tb-quota-mot \{ display: none; \}\s*\n\s*\.tb-quota-restante \{ display: none; \}\s*\n\}/.test(css),
    '≤ 420 px : « restante(s) » cède (et le mot du compteur d’avant, sans la grille, comme le 12/10)');
  ok(!/\.tb-quota-jauge[^{]*\{[^}]*(display:\s*none|overflow|ellipsis)/.test(css), 'aucune règle ne cache ni ne coupe le mot de la jauge');
  ok(/@media \(max-width: 768px\) \{\s*\n\s*\.tb-quota-libelle--jauge \{ overflow: visible; text-overflow: clip; \}/.test(css), '≤ 768 px : le libellé de la jauge n’est jamais coupé en points de suspension');
  ok(/@media \(max-width: 340px\) \{\s*\n\s*\.tb-quota-chip--jauge \{ padding: 6px 7px !important; gap: 3px !important; font-size: 11\.5px !important; \}\s*\n\s*\.tb-left:has\(\.tb-quota-chip--jauge\) \{ gap: 4px; \}\s*\n\s*\.topbar:has\(\.tb-quota-chip--jauge\) \{ padding-left: 10px; padding-right: 10px; \}/.test(css),
    '≤ 340 px : la place vient de la pastille (marges, corps) et des espacements — jamais de la droite');
  const bloc768 = css.slice(css.indexOf('LA ROUE DES RÉGLAGES RESTE TOUJOURS À L'), css.indexOf('LA ROUE DES RÉGLAGES RESTE TOUJOURS À L') + 1400);
  ok(/\.tb-right \{ flex: 0 0 auto; \}/.test(bloc768) && !/\.tb-right[^{]*\{[^}]*(flex-shrink:\s*1|min-width:\s*0)/.test(css.replace(bloc768, '')), 'A7 : la droite (palier, roue) ne cède toujours aucune place');
  ok(/className=\{quotas\?\.annonces\?\.plafond!=null\?"topbar topbar--solde":"topbar"\}/.test(app) && /\{!grilleEntete&&quotas\?\.annonces\?\.plafond!=null&&\(/.test(app),
    'sans la grille : l’en-tête et le compteur d’avant, inchangés');
}

// ── 2. La date des murs ────────────────────────────────────────────────────
console.log('2. La date des murs : quotas_etat, puis le refus, puis coin_wallets — jamais inventée');
{
  const RM = await charger('src/reglages/refusEtMurs.js');
  const JR = await charger('src/utils/jourRemise.js');
  const Q = '2026-12-16T09:00:00.000Z', R = '2026-12-17T09:00:00.000Z', W = '2026-12-18T09:00:00.000Z';
  const grille = (extra = {}) => ({
    grille: 'trois_jauges', palier: 'premium', annonces_mode: 'mensuel',
    annonces: { plafond: 40, consommes: 40, restantes: 0 }, publications: { mode: 'mensuel', plafond: 400, consommes: 10, restantes: 390 },
    republication: { mode: 'mensuel', plafond: 1500, faites: 1500, restantes: 0 }, ...extra,
  });
  const refus = { allowed: false, reason: 'plafond_republication_mensuel', plafond: 1500, faites: 1500 };
  ok(RM.remiseDuCompte(grille({ remise_le: Q })) === Q && RM.remiseDuCompte({ republication: { remise_le: R } }) === R && RM.remiseDuCompte(grille()) === null,
    'remiseDuCompte : quotas_etat.remise_le (tous paliers, avec la grille), sinon republication.remise_le (Free), sinon rien');
  ok(RM.suiteDuRefus({ ...refus, remise_le: R }, grille({ remise_le: Q }), { remise: W }).mur.remise_le === Q, 'refus Premium à 1 500 : la date de quotas_etat d’abord');
  ok(RM.suiteDuRefus({ ...refus, remise_le: R }, grille(), { remise: W }).mur.remise_le === R, 'sinon celle du refus (migration 20261104140000)');
  ok(RM.suiteDuRefus(refus, grille(), { remise: W }).mur.remise_le === W, 'sinon la lecture de l’hôte (coin_wallets.next_grant_at)');
  ok(RM.suiteDuRefus(refus, grille(), {}).mur.remise_le === null, 'aucune : null (le mur garde « Non merci »)');
  ok(RM.murDeLaJauge('remontees', grille({ remise_le: Q }), { remise: W }).remise_le === Q && RM.murDeLaJauge('remontees', grille(), { remise: W }).remise_le === W,
    'murDeLaJauge (pastille, Réglages, viseur Lens) : quotas_etat, puis la lecture de l’hôte');
  const zero = { palier: 'premium', annonces: { plafond: 40, consommes: 40, restantes: 0 }, republication: { mode: 'mensuel', plafond: 1500, faites: 1500, restantes: 0 }, remise_le: Q };
  ok(RM.suiteDuRefus(refus, zero, { remise: W }) === null && RM.murDeLaJauge('remontees', zero, { remise: W }) === null, 'interrupteur à 0 (quotas_etat sans « grille ») : rien, le chemin d’avant');
  const futur = new Date(Date.now() + 9 * 86_400_000).toISOString();
  ok(/^\d{2}\/\d{2}$/.test(JR.jourRemiseCourt(futur, 'fr')) && JR.jourRemiseCourt(new Date(Date.now() - 1000).toISOString()) === null && JR.jourRemise(futur, 'fr') !== JR.jourRemiseCourt(futur, 'fr'),
    'jourRemiseCourt : JJ/MM ; jourRemise (« 16 novembre ») reste pour les écrans sans la grille');
  ok(JR.jourRemiseCourt('2026-11-15T23:30:00.000Z', 'fr') === '16/11' || Date.parse('2026-11-15T23:30:00.000Z') <= Date.now(), 'JJ/MM au jour de Paris (23:30 UTC le 15 = le 16 à Paris)');
  const app = lire('src/App.jsx');
  ok(/const \[remiseLueApp,setRemiseLueApp\]=useState\(null\);/.test(app) && /if\(!remiseALire\|\|remiseLueApp\)return undefined;/.test(app) && !/setInterval\([^)]*lireProchaineRemiseAZero/.test(app),
    'App : coin_wallets lu UNE fois, avec la grille seulement, jamais en boucle');
  const st = lire('src/tabs/StockTab.jsx');
  ok(/const remiseStockALire = Boolean\(repubSheet\) && grilleActive\(quotas\) && remiseDuCompte\(quotas\) == null && Boolean\(user\?\.id\);/.test(st),
    'Stock : la feuille de remontée lit coin_wallets à son ouverture, avec la grille et sans date de quotas_etat seulement');
  const lot = lire('src/publication/lot/LotPublication.jsx');
  ok(/dateRemise: dateJJMM\(quotas\?\.remise_le \?\? remise, en\)/.test(lot) && /const dateSous = jaugesLot \? dateJJMM\(quotas\?\.remise_le \?\? remise, en\) : dateCourte\(remise, en\);/.test(lot),
    'le lot : JJ/MM avec la grille (« dès le 16/11 », « (le 16/11) »), « 16 novembre » sans');
}

// ── 5. Le toast ────────────────────────────────────────────────────────────
console.log('5. Le toast : un message long passe à la ligne, jamais hors de l’écran');
{
  const t = lire('src/components/Toast.jsx');
  ok(/width:"max-content",\s*\n\s*maxWidth:"calc\(100vw - 32px\)",\s*\n\s*whiteSpace:"normal",\s*\n\s*overflowWrap:"break-word",\s*\n\s*textAlign:"center",/.test(t) && !/nowrap/.test(t.replace(/\/\/.*$/gm, '')),
    'largeur du texte (max-content, comme le nowrap d’avant), plafonnée à l’écran moins 2 × 16 px, puis retour à la ligne centré');
  ok(/position:"fixed",\s*\n\s*bottom:"var\(--nav-float-bottom\)",\s*\n\s*left:"50%",\s*\n\s*transform:`translateX\(-50%\) translateY\(\$\{visible\?0:16\}px\)`,/.test(t)
    && /background:"#1B6E62",/.test(t) && /padding:"12px 20px",/.test(t) && /fontSize:14,/.test(t) && /zIndex:500,/.test(t), 'le reste du toast ne bouge pas (place, couleur, marges, corps, z-index)');
}

// ── 6. La remontée en lot sans assez de remontées ──────────────────────────
console.log('6. Les plus anciennes d’abord, dans la limite exacte, jamais un article à moitié');
{
  const { plusAnciennesDuLot, listeDesNoms } = await charger('src/stock/remonteesDuLot.js');
  const it = (pfs, d = {}) => ({ plateformes: pfs, datesPf: d });
  const V = ['vinted', 'leboncoin'];
  const items = [it(V, { vinted: 300, leboncoin: 310 }), it(['vinted'], { vinted: 100 }), it(V, { vinted: 250, leboncoin: 120 }), it(V, {}), it(['leboncoin'], { leboncoin: 200 })];
  const r5 = plusAnciennesDuLot(items, V, 5);
  ok(JSON.stringify(r5.choisis) === '[1,2,4]' && r5.cout === 4 && r5.total === 8 && r5.nbArticles === 5 && JSON.stringify(r5.plateformes) === '["vinted","leboncoin"]',
    '5 restantes : 100 (1), puis min(250, 120) (2), puis 200 (1) = 4 ; la suivante (2) dépasserait : on s’arrête', JSON.stringify(r5));
  ok(JSON.stringify(plusAnciennesDuLot(items, V, 3).choisis) === '[1,2]' && plusAnciennesDuLot(items, V, 3).cout === 3, '3 restantes : la limite exacte (1 + 2)');
  ok(plusAnciennesDuLot(items, V, 8).choisis.length === 5 && plusAnciennesDuLot(items, V, 8).cout === 8, 'assez pour tout : tout part (le cas où la feuille garde son bouton d’avant)');
  const deux = [it(V, { vinted: 1 }), it(V, { vinted: 2 })];
  ok(plusAnciennesDuLot(deux, V, 1).choisis.length === 0 && plusAnciennesDuLot(deux, V, 3).choisis.length === 1 && plusAnciennesDuLot(deux, V, 3).cout === 2,
    'jamais un article à moitié : 1 restante pour un article sur 2 plateformes → aucun ; 3 → un seul (2), pas 3');
  const egaux = plusAnciennesDuLot([it(['vinted'], { vinted: 5 }), it(['vinted'], { vinted: 5 }), it(['vinted'])], ['vinted'], 2);
  ok(JSON.stringify(egaux.choisis) === '[0,1]', 'date égale : l’ordre de la sélection ; date inconnue : à la fin');
  const seuleV = plusAnciennesDuLot(items, ['vinted'], 2);
  ok(JSON.stringify(seuleV.choisis) === '[1,2]' && seuleV.nbArticles === 4 && JSON.stringify(seuleV.plateformes) === '["vinted"]',
    'Vinted seule cochée : sa date à elle (250 pour l’article 3, pas 120 de Leboncoin), l’article Leboncoin seul hors jeu');
  ok(plusAnciennesDuLot(items, V, 0).choisis.length === 0 && plusAnciennesDuLot([], V, 9).choisis.length === 0 && plusAnciennesDuLot(items, [], 9).nbArticles === 0, 'rien à envoyer : rien');
  ok(listeDesNoms(['Vinted']) === 'Vinted' && listeDesNoms(['Vinted', 'Leboncoin']) === 'Vinted et Leboncoin' && listeDesNoms(['Vinted', 'Leboncoin', 'Beebs']) === 'Vinted, Leboncoin et Beebs'
    && listeDesNoms(['Vinted', 'Depop'], 'en') === 'Vinted and Depop', '« Vinted et Leboncoin », « Vinted, Leboncoin et Beebs »');
  const st = lire('src/tabs/StockTab.jsx');
  const lancer = st.slice(st.indexOf('async function lancerRepublicationLot('), st.indexOf('async function relancerRepublication('));
  ok(lancer.length > 1000 && !/plusAnciennes|datesPf|remonteesDuLot/.test(lancer), 'la CADENCE est intouchée : lancerRepublicationLot ne sait rien du choix');
  ok(/if\(cibles\.length===1\)lancerRepublication\(cibles\[0\]\.item,cibles\[0\]\.prix,cibles\[0\]\.plateformes\);\s*else lancerRepublicationLot\(cibles\);/.test(st),
    'l’envoi : le même onConfirm qu’aujourd’hui (un article → lancerRepublication, plusieurs → lancerRepublicationLot)');
  ok(/const lotCourt = Boolean\(jaugeRemontees\) && !solo && nbEnvois > 0 && nbEnvois > restantesRemontees;/.test(st),
    'le choix ne s’applique qu’avec la grille (jaugeRemontees), en lot, quand il n’en reste pas assez');
}

console.log(`\n${rouges === 0 ? '✓' : '✗'} ecarts-0411 : ${verts} contrôles verts, ${rouges} rouges`);
process.exit(rouges === 0 ? 0 : 1);
