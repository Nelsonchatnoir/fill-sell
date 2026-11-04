// Autotest du PRIX et du NOM de FillSell Cloud (04/11/2026, décisions de Nico du 03/11).
//
//     npm run selftest:cloud-prix-nom
//     (node --import ./scripts/loader-ext.mjs scripts/cloud-prix-nom-selftest.mjs)
//
// Décisions de Nico (03/11) : le Cloud coûte 24,99 € par mois PARTOUT (Stripe, Apple app.fillsell.cloud.sub,
// Google cloud-monthly) — jamais un prix affiché différent du prix facturé ; l'option s'appelle « FillSell Cloud »,
// « sans ordinateur » est sa PROMESSE, jamais son nom. Ce test prouve, sans réseau ni base :
//   1. CLOUD_PRIX_AFFICHE = '24,99 €' ; PRIX_AFFICHE de cloud-pool.js et de cloud-rappel-veille.js identiques ;
//      le calcul de marge (prixTtcEur) et le repli du MRR (PRIX_MENSUELS_TTC.cloud) suivent ce prix ;
//   2. aucun « 20 € » qui parle du Cloud dans src/, supabase/functions/ et site/ (code, textes ET commentaires) :
//      partout, un « 20 € » à moins de 3 lignes d'un mot du Cloud ; dans les fichiers du Cloud, tout « 20 € ».
//      Seul un COMMENTAIRE qui dit « ancien » peut citer l'ancien prix (l'histoire d'un libellé remplacé) ;
//   3. les conditions du Cloud (src/cloud/conditionsCloud.js) et les textes légaux (src/cloud/textesLegaux.js)
//      disent 24,99 € ;
//   4. la version des conditions est la même côté app (config/cloudOffer.js) et côté serveur
//      (supabase/functions/_shared/cloud-conditions.js), et date au plus tôt du texte à 24,99 € (04/11) ;
//   5. le nom « FillSell Cloud » dans les textes de l'option (écrans, « Me connecter », textes légaux, mail de la
//      veille, mur de l'extension), en fr et en en ; jamais « Sans ordinateur » / « No computer » comme nom.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0, n = 0;
const ok = (c, m, d = '') => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d ? `   ← ${String(d).slice(0, 500)}` : ''}`); } };
const titre = (t) => console.log(`\n${t}`);
const ESPACES = new RegExp(`[${String.fromCharCode(0xa0)}${String.fromCharCode(0x202f)}]`, 'g');
const net = (s) => String(s).replace(ESPACES, ' ');
// Toutes les phrases d'un objet de textes : chaînes, tableaux, objets, et fonctions appelées avec des valeurs types.
const ARGS = [['Premium', '10:00', 'Premium'], [null, '10:00', null], [5], ['demain', '10:00'], ['aujourdhui', '10:00'], ['17 octobre', 5], ['essai_deja_pris'], [['Vinted', 'Beebs']]];
const phrases = (v) => {
  if (typeof v === 'string') return [net(v)];
  if (Array.isArray(v)) return v.flatMap(phrases);
  if (typeof v === 'function') return ARGS.flatMap((a) => { try { return phrases(v(...a)); } catch { return []; } });
  if (v && typeof v === 'object') return Object.values(v).flatMap(phrases);
  return [];
};

const PAL = await charger('src/utils/palier.js');
const POOL = await charger('supabase/functions/_shared/cloud-pool.js');
const VEILLE = await charger('supabase/functions/_shared/cloud-rappel-veille.js');
const MRR = await charger('supabase/functions/_shared/mrr.js');
const CFG = await charger('src/config/cloudOffer.js');
const SRV = await charger('supabase/functions/_shared/cloud-conditions.js');
const COND = await charger('src/cloud/conditionsCloud.js');
const LEG = await charger('src/cloud/textesLegaux.js');
const TX = await charger('src/cloud/textes.js');
const CX = await charger('src/cloud/textesConnexion.js');

// ── 1. Le prix, une seule valeur ─────────────────────────────────────────────
titre('1. Le prix : 24,99 € partout (app, règles du pool, mail de la veille, marge, MRR)');
const PRIX = PAL.CLOUD_PRIX_AFFICHE;
const PRIX_NUM = Number(String(PRIX).replace(/[^\d,]/g, '').replace(',', '.'));
ok(PRIX === '24,99 €', `CLOUD_PRIX_AFFICHE = '24,99 €' (src/utils/palier.js)`, PRIX);
ok(POOL.PRIX_AFFICHE === PRIX, `PRIX_AFFICHE de cloud-pool.js = CLOUD_PRIX_AFFICHE`, POOL.PRIX_AFFICHE);
ok(VEILLE.PRIX_AFFICHE === PRIX, `PRIX_AFFICHE de cloud-rappel-veille.js = CLOUD_PRIX_AFFICHE`, VEILLE.PRIX_AFFICHE);
ok(PRIX_NUM === 24.99 && POOL.PARAMETRES.prixTtcEur === PRIX_NUM, `la marge se calcule sur le prix affiché (prixTtcEur = ${POOL.PARAMETRES.prixTtcEur})`);
ok(POOL.fraisPaiement({ canal: 'stripe' }).ttcEur === PRIX_NUM && POOL.fraisPaiement({ canal: 'apple' }).ttcEur === PRIX_NUM && POOL.fraisPaiement({ canal: 'google' }).ttcEur === PRIX_NUM,
  'frais de paiement : les trois canaux partent du même prix TTC');
ok(MRR.PRIX_MENSUELS_TTC.cloud === PRIX_NUM, `le repli du MRR (mrr.js, PRIX_MENSUELS_TTC.cloud) = ${MRR.PRIX_MENSUELS_TTC.cloud}`);
{
  const fr = VEILLE.texteRappel({ lang: 'fr', finIso: '2026-11-13T17:00:00Z' });
  const en = VEILLE.texteRappel({ lang: 'en', finIso: '2026-11-13T17:00:00Z' });
  ok(fr.paragraphes.some((p) => p.includes(`${PRIX} par mois`)) && en.paragraphes.some((p) => p.includes(`${PRIX} a month`)), 'le mail de la veille dit 24,99 € (fr et en)');
}

// ── 2. Aucun « 20 € » du Cloud ──────────────────────────────────────────────
titre('2. Aucun « 20 € » qui parle du Cloud (src/, supabase/functions/, site/)');
// « 20 € », « 20,00 € », « +20 €/mois », « €20 », « 20 euros » — jamais « 120 € », « 0,20 € » ni « €200 ».
const VINGT = /(?<![\d.,])20(?:[,.]00)?[\s  ]?€|€[\s  ]?20(?![\d]|[.,]\d)|(?<![\d.,])20 (?:euros?|EUR)\b/i;
const CLOUD = /cloud|sans ordinateur|no computer/i;
const FENETRE = 3;
const estCommentaire = (l) => /^\s*(\/\/|\*|\/\*|\{\/\*|#|<!--)/.test(l);
const toleree = (l) => estCommentaire(l) && /\bancien(ne)?s?\b/i.test(l);
// Les fichiers du Cloud : là, tout « 20 € » est le prix du Cloud.
const STRICTS = [/^src\/cloud\//, /^src\/entree\//, /^src\/config\/cloudOffer\.js$/, /^src\/utils\/palier\.js$/,
  /^supabase\/functions\/_shared\/cloud-[^/]+\.js$/, /^supabase\/functions\/_shared\/mrr\.js$/];
/** Les lignes fautives d'un texte (pur) : [{ ligne, texte }]. */
function fautesVingt(texte, strict) {
  const lignes = texte.split('\n');
  const out = [];
  lignes.forEach((l, i) => {
    if (!VINGT.test(l) || toleree(l)) return;
    const autour = lignes.slice(Math.max(0, i - FENETRE), i + FENETRE + 1).join('\n');
    if (strict || CLOUD.test(autour)) out.push({ ligne: i + 1, texte: l.trim().slice(0, 160) });
  });
  return out;
}
// Témoins : le contrôle attrape bien les anciennes formes, et laisse les « 20 € » qui parlent d'autre chose.
ok(fautesVingt("export const PRIX_AFFICHE = '20 €';    // = CLOUD_PRIX_AFFICHE", false).length === 1
  && fautesVingt('// Cloud = abonnement SÉPARÉ, 20,00 €/mois', false).length === 1
  && fautesVingt("libelleInterrupteur: 'Sans ordinateur · +20 €/mois',", false).length === 1
  && fautesVingt("'Price. €20 including VAT per month'", true).length === 1
  && fautesVingt('// L\'option Cloud :\n// une option à\n// 20 €/mois EN PLUS d\'un palier', false).length === 1,
'témoins : « 20 € », « 20,00 € », « +20 €/mois », « €20 » et un « 20 € » deux lignes sous « Cloud » sont attrapés');
ok(fautesVingt("frais : 0,10 € + 7 % jusqu'à 20 €, 4 % au-delà", false).length === 0 && fautesVingt('payé 120 €, revendu 1,20 €', true).length === 0
  && fautesVingt('// Ancien libellé, remplacé : « Sans ordinateur · +20 €/mois »', true).length === 0
  && fautesVingt("titre: 'Ancien prix : 20 €'", true).length === 1,
'témoins : les « 20 € » sans Cloud (frais eBay), « 120 € », « 1,20 € » et un COMMENTAIRE « ancien » passent ; une chaîne « ancien » non');
{
  const EXT = /\.(jsx?|mjs|cjs|tsx?|md|ya?ml|json|html|txt)$/;
  const lus = [];
  const fautes = [];
  for (const dossier of ['src', 'supabase/functions', 'site']) {
    for (const f of fs.readdirSync(join(ROOT, dossier), { recursive: true })) {
      const chemin = join(dossier, String(f)).replace(/\\/g, '/');
      if (/(^|\/)node_modules\//.test(chemin) || !EXT.test(chemin)) continue;
      const abs = join(ROOT, chemin);
      if (!fs.statSync(abs).isFile()) continue;
      lus.push(chemin);
      const strict = STRICTS.some((r) => r.test(chemin));
      for (const x of fautesVingt(fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n'), strict)) fautes.push(`${chemin}:${x.ligne} « ${x.texte} »`);
    }
  }
  ok(lus.length > 500 && lus.some((p) => p === 'src/cloud/textes.js') && lus.some((p) => p.startsWith('site/contenu/')),
    `src/, supabase/functions/ et site/ relus en entier (${lus.length} fichiers)`);
  ok(fautes.length === 0, 'aucun « 20 € » du Cloud, ni dans le code, ni dans les textes, ni dans les commentaires', fautes.join(' · '));
}

// ── 3. Les conditions et les textes légaux ───────────────────────────────────
titre('3. Les conditions du Cloud et les textes légaux disent 24,99 €');
{
  const c = net(JSON.stringify(COND.conditionsCloud()));
  ok(c.includes('Le Cloud coûte 24,99 € TTC par mois') && c.includes("l'abonnement commence : 24,99 € sont prélevés"), 'conditions (article 6) : 24,99 € TTC par mois, 24,99 € prélevés à la fin de l’essai');
  ok(!VINGT.test(c), 'conditions : aucun « 20 € »');
  const fr = net(phrases(LEG.textesLegauxCloud('fr')).join(' '));
  const en = net(phrases(LEG.textesLegauxCloud('en')).join(' '));
  ok(fr.includes('Prix. 24,99 € TTC par mois') && fr.includes('(24,99 € par mois)'), 'CGV article 7 (fr) : « Prix. 24,99 € TTC par mois » et « (24,99 € par mois) »');
  ok(en.includes('Price. €24.99 including VAT per month') && en.includes('(€24.99 per month)'), 'CGV article 7 (en) : « €24.99 including VAT per month » et « (€24.99 per month) »');
  ok(!VINGT.test(fr) && !VINGT.test(en), 'textes légaux : aucun « 20 € » (fr et en)');
}

// ── 4. La version des conditions ─────────────────────────────────────────────
titre('4. La version des conditions : une seule, app = serveur');
ok(/^\d{4}-\d{2}-\d{2}$/.test(CFG.CGU_CLOUD_VERSION) && CFG.CGU_CLOUD_VERSION === SRV.CGU_CLOUD_VERSION && COND.CGU_CLOUD_VERSION === CFG.CGU_CLOUD_VERSION,
  `config/cloudOffer.js = _shared/cloud-conditions.js = conditionsCloud.js (${CFG.CGU_CLOUD_VERSION} / ${SRV.CGU_CLOUD_VERSION})`);
ok(CFG.CGU_CLOUD_VERSION >= '2026-11-04', `le texte à 24,99 € a une version neuve (≥ 2026-11-04 : ${CFG.CGU_CLOUD_VERSION}) — une acceptation de l’ancien texte ne vaut plus`);
ok(COND.conditionsAcceptees({ cloud_cgu_version: CFG.CGU_CLOUD_VERSION }) && !COND.conditionsAcceptees({ cloud_cgu_version: '2026-10-30' })
  && SRV.conditionsCloudAcceptees({ cloud_cgu_version: SRV.CGU_CLOUD_VERSION }) && !SRV.conditionsCloudAcceptees({ cloud_cgu_version: '2026-10-30' }),
'l’acceptation du 30/10 (texte à l’ancien prix) est redemandée, côté app comme côté serveur');

// ── 5. Le nom ────────────────────────────────────────────────────────────────
titre('5. Le nom : « FillSell Cloud » ; « sans ordinateur » est la promesse');
{
  const FR = TX.textesCloud('fr'), EN = TX.textesCloud('en');
  ok(FR.nom === 'FillSell Cloud' && EN.nom === 'FillSell Cloud', 'le nom de l’option : « FillSell Cloud » (fr et en)', `${FR.nom} / ${EN.nom}`);
  ok(FR.groupe === 'FillSell Cloud' && EN.groupe === 'FillSell Cloud', 'Réglages › Abonnement : le groupe « FillSell Cloud »');
  ok(net(FR.libelleInterrupteur) === `FillSell Cloud · sans ordinateur · +${PRIX}/mois` && net(EN.libelleInterrupteur) === `FillSell Cloud · no computer · +${PRIX}/mo`,
    `l’interrupteur : « FillSell Cloud · sans ordinateur · +${PRIX}/mois »`, `${net(FR.libelleInterrupteur)} / ${net(EN.libelleInterrupteur)}`);
  ok(/insécable|NBSP/.test(lire('src/cloud/textes.js')) && FR.libelleInterrupteur.includes(`24,99${String.fromCharCode(0xa0)}€`), 'le prix de l’interrupteur ne se coupe pas (« 24,99 € » insécable)');
  const nommes = ['freeCloudTitre', 'freeCloudCtaEssai', 'voieTitreEssai', 'voieTitre', 'voieCtaEssai', 'arreterTitre', 'veilleKicker', 'finKicker', 'ctaSuffixe', 'prixOptionSous', 'dejaActif'];
  const sansNom = nommes.filter((k) => !phrases(FR[k]).every((p) => p.includes('FillSell Cloud')) || !phrases(EN[k]).every((p) => p.includes('FillSell Cloud')));
  ok(sansNom.length === 0, `les titres et boutons de l’option la nomment « FillSell Cloud » (${nommes.join(', ')})`, sansNom.join(', '));
  ok(net(FR.freeCloudQuota(5)).startsWith('Avec Free + FillSell Cloud,') && /Free \+ FillSell Cloud/.test(FR.resiliationCloud) && /Free \+ FillSell Cloud/.test(FR.mentionPremium(5)),
    '« Free + FillSell Cloud » partout où l’option se prend avec le plan Free');
  ok(/sans ordinateur/.test(FR.ebayDeja) && /même sans ordinateur/.test(FR.voieTexte) && /ordinateur éteint/.test(FR.titreModale), 'la promesse reste dite : « sans ordinateur », « même ordinateur éteint »');
  const NOM_FR = /Sans ordinateur/;            // le nom d'avant (majuscule) ; la promesse s'écrit « sans ordinateur »
  const NOM_EN = /No computer(?!\?)|[Nn]o computer add-on/; // « No computer? » reste une question (la promesse)
  const textes = {
    'textes.js': [phrases(FR), phrases(EN)],
    'textesConnexion.js': [phrases(CX.textesConnexion('fr')), phrases(CX.textesConnexion('en'))],
    'textesLegaux.js': [phrases(LEG.textesLegauxCloud('fr')), phrases(LEG.textesLegauxCloud('en'))],
    'conditionsCloud.js': [phrases(COND.conditionsCloud()), []],
    'mail de la veille': [phrases(VEILLE.texteRappel({ lang: 'fr', finIso: '2026-11-13T17:00:00Z' })), phrases(VEILLE.texteRappel({ lang: 'en', finIso: '2026-11-13T17:00:00Z', carteFin: '4242' }))],
  };
  for (const [quoi, [fr, en]] of Object.entries(textes)) {
    const f = [...fr.filter((p) => NOM_FR.test(p)), ...en.filter((p) => NOM_EN.test(p))];
    ok(fr.length > 0 && f.length === 0, `${quoi} : jamais « Sans ordinateur » / « No computer » comme nom de l’option`, f.join(' | '));
  }
  // « No computer? Try FillSell Cloud… » : la question de tête est une promesse, le nom suit.
  ok(EN.voieCompactEssai.startsWith('No computer? Try FillSell Cloud') && EN.voieCompact.startsWith('No computer? FillSell Cloud add-on'), 'en : « No computer? » (la promesse), puis le nom « FillSell Cloud »');
  const cx = CX.textesConnexion('fr');
  ok(cx.poolVide.includes('places FillSell Cloud') && cx.dejaClient.includes("L'option FillSell Cloud"), '« Me connecter » et l’achat : « places FillSell Cloud », « L’option FillSell Cloud est déjà active »');
  const L = LEG.textesLegauxCloud('fr'), LE = LEG.textesLegauxCloud('en');
  ok(L.cgvArticle7.t === 'Article 7 — Option FillSell Cloud' && LE.cgvArticle7.t === 'Article 7 — FillSell Cloud add-on'
    && L.confidentialite.titre === "4.8 L'option FillSell Cloud" && LE.confidentialite.titre === '4.8 The FillSell Cloud add-on',
  'textes légaux : l’article 7 et le 4.8 portent le nom « FillSell Cloud »');
  const v = VEILLE.texteRappel({ lang: 'fr', finIso: '2026-11-13T17:00:00Z' }), ve = VEILLE.texteRappel({ lang: 'en', finIso: '2026-11-13T17:00:00Z' });
  ok(v.sujet.startsWith('Ton essai FillSell Cloud se termine le') && ve.sujet.startsWith('Your FillSell Cloud trial ends on'), 'le mail de la veille : « Ton essai FillSell Cloud se termine le … »', `${v.sujet} / ${ve.sujet}`);
  const mur = lire('src/components/ExtensionPitchScreen.jsx');
  ok(mur.includes("par l'option FillSell Cloud.") && mur.includes('through the FillSell Cloud add-on.') && !/option Sans ordinateur\.|No computer add-on/.test(mur),
    'le mur « installe l’extension » : « … par l’option FillSell Cloud » (drapeau levé)');
  // La feuille des offres et l'onboarding lisent le prix, jamais en dur (structure inchangée).
  ok(/from ['"]\.\.\/utils\/palier['"]/.test(lire('src/entree/textes.js')) && /CLOUD_PRIX_AFFICHE\.replace/.test(lire('src/entree/textes.js'))
    && /CLOUD_PRIX_AFFICHE\.replace/.test(lire('src/cloud/textes.js')) && /import \{ textesCloud \} from '\.\.\/cloud\/textes'/.test(lire('src/components/ConversionModal.jsx')),
  'l’onboarding (entree/textes.js) et la feuille (ConversionModal, par cloud/textes.js) lisent CLOUD_PRIX_AFFICHE');
}

// ── 5 bis. « Cloud » partout, jamais « option » seul (04/11, décision de Nico) ─────────────────────────────────
titre('5 bis. « le Cloud » ou « l’option FillSell Cloud », jamais « option » seul (fr) ni « add-on » seul (en)');
{
  // « option » / « add-on » ne sont admis que suivis / précédés du nom : « l'option FillSell Cloud », « the FillSell Cloud add-on ».
  const OPTION_SEULE = /\b[Oo]ption\b(?! FillSell Cloud)/;
  const ADDON_SEUL = /(?<!FillSell Cloud )\b[Aa]dd-on\b/;
  const FR = TX.textesCloud('fr'), EN = TX.textesCloud('en');
  const lots = {
    'textes.js': [phrases(FR), phrases(EN)],
    'textesConnexion.js': [phrases(CX.textesConnexion('fr')), phrases(CX.textesConnexion('en'))],
    'textesLegaux.js': [phrases(LEG.textesLegauxCloud('fr')), phrases(LEG.textesLegauxCloud('en'))],
    'conditionsCloud.js': [phrases(COND.conditionsCloud()), []],
  };
  for (const [quoi, [fr, en]] of Object.entries(lots)) {
    const f = [...fr.filter((p) => OPTION_SEULE.test(p)), ...en.filter((p) => ADDON_SEUL.test(p))];
    ok(fr.length > 0 && f.length === 0, `${quoi} : jamais « option » seul (fr) ni « add-on » seul (en)`, f.join(' | '));
  }
  // Les chaînes écrites dans les écrans du Cloud, la feuille des offres, les Réglages et l'onboarding (hors commentaires).
  const sources = ['src/components/ConversionModal.jsx', 'src/components/ExtensionPitchScreen.jsx', 'src/cloud/BlocCloudReglages.jsx', 'src/cloud/InterrupteurCloud.jsx',
    'src/reglages/SousPageAbonnement.jsx', 'src/reglages/textes.js', 'src/entree/textes.js'];
  const fautes = [];
  for (const s of sources) {
    // Sans les commentaires (blocs /* … */, y compris ceux du JSX, et lignes //) : seules les chaînes écrites comptent.
    const code = lire(s).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    for (const m of code.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
      const lit = m[2];
      if (!/\s/.test(lit)) continue; // une clé, un identifiant : pas un texte
      if (OPTION_SEULE.test(lit) || ADDON_SEUL.test(lit)) fautes.push(`${s} : ${lit.slice(0, 90)}`);
    }
  }
  ok(fautes.length === 0, `écrans (feuille des offres, mur de l’extension, Réglages, onboarding) : aucun « option » / « add-on » seul écrit`, fautes.join(' | '));
  // Les mots de la décision, mot pour mot.
  ok(net(FR.prixOptionSousEssai) === '/mois · Cloud offert 7 jours' && net(EN.prixOptionSousEssai) === '/mo · Cloud free for 7 days', '« /mois · Cloud offert 7 jours »', net(FR.prixOptionSousEssai));
  ok(FR.arreter === 'Arrêter le Cloud' && FR.veilleArreter === 'Arrêter le Cloud' && FR.garderOption === 'Garder le Cloud' && FR.resiliationCloudLien === 'Arrêter aussi le Cloud'
    && EN.arreter === 'Stop the Cloud' && EN.garderOption === 'Keep the Cloud', '« Arrêter le Cloud », « Garder le Cloud », « Arrêter aussi le Cloud » (en : « Stop the Cloud »)');
  ok(net(FR.carteDemandee('10 novembre')) === "Carte demandée, rien n'est prélevé pour le Cloud avant le 10 novembre." && net(FR.frise('10 novembre')[0].quoi) === "Carte demandée, rien n'est prélevé pour le Cloud."
    && net(FR.frise('10 novembre')[1].quoi) === `Le Cloud passe à ${PRIX}/mois, sauf si tu l'arrêtes avant.`, '« rien n’est prélevé pour le Cloud », « Le Cloud passe à 24,99 €/mois » (masculin)');
  ok(FR.etatAucun === 'Pas activé' && FR.etatPaye === 'Actif' && /n'est plus actif, et rien n'a été facturé pour lui/.test(FR.termineTexte('7 octobre')), 'les accords : « le Cloud », masculin (« Pas activé », « Actif », « pour lui »)');
  ok(/« le Cloud »/.test(COND.conditionsCloud().articles[0].ps[0]) && /^L'option FillSell Cloud/.test(COND.conditionsCloud().articles[0].ps[0]), 'conditions, article 1 : « L’option FillSell Cloud (« le Cloud ») est un service de FillSell »');
  ok(CFG.CGU_CLOUD_VERSION === '2026-11-04' && SRV.CGU_CLOUD_VERSION === CFG.CGU_CLOUD_VERSION, 'la version des conditions reste 2026-11-04, la même des deux côtés (rien publié depuis)');
}

// ── 6. Rien d'autre ne bouge ─────────────────────────────────────────────────
titre('6. Rien d’autre ne bouge');
ok(CFG.CLOUD_OFFER_ENABLED === false && CFG.cloudOfferVisible('n-importe-qui') === false, 'CLOUD_OFFER_ENABLED reste à false : personne ne voit l’offre');
ok(PAL.CLOUD_ESSAI_JOURS === 7 && POOL.ESSAI_JOURS === 7, 'essai : 7 jours (inchangé)');

console.log(ko ? `\n✗ cloud-prix-nom : ${ko} rouge(s) sur ${n}` : `\n✓ cloud-prix-nom : ${n} contrôles verts, 0 rouges`);
process.exit(ko ? 1 : 0);
