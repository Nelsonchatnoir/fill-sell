// ═══════════════════════════════════════════════════════════════════════════
// LE CHEMIN D'UNE ICÔNE SE VÉRIFIE PARMI LES SŒURS DE SON RAYON (20/11/2026 soir, bloc E de Nico)
//     npm run selftest:categorie-icone-soeurs
//     (node --import ./scripts/loader-ext.mjs scripts/categorie-icone-soeurs-selftest.mjs)
// ═══════════════════════════════════════════════════════════════════════════
// Le cas : tâche Vinted de5864cf (compte de Nico, TEST du 20/11 13:40), fiche 1795171900202 « Mug céramique blanc »
// publiée en « Maison › Arts de la table › Vaisselle › Assiettes » (categorie_verification { objet: 'mug', verdict:
// 'confirme' }). Trois causes : 🍽️ mène par défaut à Assiettes (DÉFAUT ASSUMÉ) ; « mug » ne partage aucun mot avec
// « Tasses et tasses à café » (2006), donc le ratissage n'avait aucune candidate ; la vérification n'envoyait à l'IA
// que [Assiettes], qu'elle a « confirmée ».
// La règle, pour toutes les icônes et les quatre plateformes vérifiées (Vinted, eBay, Beebs, Leboncoin) :
//   1. la liste soumise contient TOUJOURS les feuilles sœurs du rayon de la feuille de l'icône (l'ancêtre le plus
//      large qui tient dans 80 feuilles — la borne des livres du 20/09) ; au-delà de 20, la longueur est demandée
//      au serveur (max_candidats), sinon il coupe ;
//   2. une liste réduite au SEUL chemin de l'icône dont la feuille ne partage aucun mot avec l'objet ne vaut jamais
//      « confirmé » : verdict « incertain », categorie_incertaine posé.
// Ce que le selftest prouve : (A) les sœurs, sur l'arbre réel ; (B) la résolution entière (resoudrePublication) avec
// une IA SIMULÉE qui choisit dans la liste reçue, coupée comme le serveur la coupe — mug → Tasses, gobelet → Tasses
// ou Verres, bol → Bols, soupière → vaisselle de service, assiette → Assiettes ; un livre garde sa règle (la maison
// des livres en tête du ratissage) ; (C) la ligne seule sans mot commun → « incertain », jamais « confirme ».
// L'IA simulée ne dit rien du vrai modèle : elle prouve que la BONNE réponse est dans la liste et que le choix fait
// dans la liste est appliqué. Pas de dictionnaire mug → tasse dans le code : les synonymes dirigés
// (SYNONYMES_DIRIGES, 13/09) restent réservés aux décisions explicites de Nico.
import { readFileSync } from 'node:fs';
import { soeursDuRayon, feuillePartageUnMot, RAYON_LISIBLE_MAX } from '../src/utils/categorieParMot.js';
import { resoudrePublication } from '../src/utils/resolutionPublication.js';
import { _viderQuestionsCategorie } from '../src/utils/questionCategorie.js';
import { getVintedCategoryPath } from '../src/utils/vintedCategories.js';
import { getEbayCategoryPath } from '../src/utils/ebayCategories.js';

let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 600)}` : ''}`); }
};
const lire = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const feuille = (c) => (Array.isArray(c) ? c[c.length - 1] : null);
const j = (c) => (Array.isArray(c) ? c.join(' > ') : String(c));

// ── A. Les sœurs, sur l'arbre réel ──────────────────────────────────────────
console.log('A. Les sœurs du rayon de l’icône (arbres relevés)');
const ASSIETTES_V = getVintedCategoryPath('🍽️', '', 'Mug céramique blanc');
const ASSIETTES_E = getEbayCategoryPath('🍽️', '');
ok(j(ASSIETTES_V) === 'Maison > Arts de la table > Vaisselle > Assiettes', 'le cas : 🍽️ → Vinted « … › Vaisselle › Assiettes » (défaut assumé, inchangé)', j(ASSIETTES_V));
const sv = await soeursDuRayon('vinted', ASSIETTES_V);
const noms = (l) => l.map((c) => feuille(c.chemin));
ok(sv.length >= 15 && sv.length < RAYON_LISIBLE_MAX && sv.every((c) => c.chemin[0] === 'Maison' && c.chemin[1] === 'Arts de la table'),
  `Vinted : le rayon « Maison › Arts de la table » (${sv.length} sœurs)`, noms(sv).join(' ; '));
ok(['Tasses et tasses à café', 'Bols', 'Verres à eau', 'Plats de service', 'Services de table'].every((n) => noms(sv).includes(n)),
  'Vinted : Tasses et tasses à café, Bols, Verres à eau, Plats de service, Services de table y sont');
ok(!noms(sv).includes('Assiettes') && sv.every((c) => c.id != null), 'Vinted : la feuille de l’icône n’y est pas (l’appelant la met en tête) ; chaque sœur porte son id');
const se = await soeursDuRayon('ebay', ASSIETTES_E);
ok(se.length >= 10 && se.length < RAYON_LISIBLE_MAX && ['Mugs', 'Tasses, soucoupes', 'Bols, saladiers', 'Assiettes/plats de service'].every((n) => noms(se).includes(n)),
  `eBay : le rayon « … › Arts de la table » (${se.length} sœurs : Mugs, Tasses, Bols, plats de service)`, noms(se).join(' ; '));
ok(se.every((c) => /^\d+$/.test(String(c.id))), 'eBay : chaque sœur porte son identifiant (eBay navigue par id)');
const sb = await soeursDuRayon('beebs', ['Maison', 'Cuisine', 'Vaisselle et art de la table']);
ok(sb.length > 0 && sb.length < RAYON_LISIBLE_MAX && sb.every((c) => c.chemin[0] === 'Maison'), `Beebs : le rayon « Maison » (${sb.length} sœurs, dans la borne)`);
const sl = await soeursDuRayon('leboncoin', ['Maison & Jardin', 'Arts de la table']);
ok(sl.length > 0 && sl.every((c) => c.chemin[0] === 'Maison & Jardin') && !noms(sl).includes('Arts de la table'), `Leboncoin : « Maison & Jardin » (${sl.length} sœurs)`);
{
  const robe = getVintedCategoryPath('👗', 'Femme', 'Robe');
  const s = Array.isArray(robe) ? await soeursDuRayon('vinted', robe) : [];
  ok(Array.isArray(robe) && s.length > 0 && s.every((c) => !/^Hommes$|^Enfants$/.test(c.chemin[0])), `genre : une feuille Femmes n’amène jamais les Hommes ni les Enfants (${j(robe)}, ${s.length} sœurs)`);
}
ok((await soeursDuRayon('depop', ['Maison', 'X'])).length === 0 && (await soeursDuRayon('vinted', ['Maison'])).length === 0,
  'sans arbre (Depop) ou chemin d’un seul niveau : aucune sœur (la liste reste celle d’avant)');
ok(!feuillePartageUnMot('mug', ASSIETTES_V) && feuillePartageUnMot('assiette', ASSIETTES_V) && feuillePartageUnMot('assiettes plates', ASSIETTES_V)
  && feuillePartageUnMot('verre', ['Maison', 'Cuisine, arts de la table', 'Verrerie']) && !feuillePartageUnMot('', ASSIETTES_V),
  'mot commun : mug/Assiettes non ; assiette(s)/Assiettes oui ; verre/Verrerie oui (même famille, comme au ratissage)');

// ── B. La résolution entière, IA simulée ────────────────────────────────────
console.log('B. resoudrePublication, IA simulée (elle choisit dans la liste reçue, coupée comme le serveur)');
let appels = [];
let preferences = [];
const FOURRE_TOUT_SERVEUR = /^(autres?|divers|other|others|miscellaneous)$/i; // resolve-categorie, estFourreTout
const fauxSupabase = {
  functions: {
    invoke: async (nom, opts = {}) => {
      if (nom !== 'resolve-categorie') return { data: null, error: { message: 'hors ligne (selftest)' } };
      const body = opts.body ?? {};
      appels.push(body);
      const plafond = Math.min(Math.max(Number(body.max_candidats) || 20, 20), 600); // PLAFOND_DEFAUT / PLAFOND_MAX
      const choix = {};
      for (const [pf, liste] of Object.entries(body.candidats ?? {})) {
        const brutes = (liste ?? []).filter((c) => Array.isArray(c?.chemin) && c.chemin.length);
        const vraies = brutes.filter((c) => !FOURRE_TOUT_SERVEUR.test(String(feuille(c.chemin)).trim()));
        const vues = (vraies.length ? vraies : brutes).slice(0, plafond);
        let retenu = null;
        for (const re of preferences) { retenu = vues.find((c) => re.test(j(c.chemin))); if (retenu) break; }
        if (retenu) choix[pf] = { chemin: retenu.chemin, id: retenu.id ?? null };
      }
      return { data: { choix }, error: null };
    },
  },
  from: () => { const q = { select: () => q, eq: () => q, in: () => q, limit: () => q, order: () => q, maybeSingle: async () => ({ data: null }), then: (r) => r({ data: [] }) }; return q; },
};
const outilsPour = (icone) => ({ platformFieldsConfig: {}, isConditionKey: () => false, defaultConditionFor: () => null, GENERIC_ASPECTS_PF_KEY: {},
  normAspectVal: (s) => s, resolveArticleIcon: () => icone, resolveArticleIconDetail: () => ({ icon: icone, source: 'mot_cle' }), OPLA_ETAT_PAR_LIBELLE: {} });
const logs = console.log, warns = console.warn;
const silence = async (fn) => { console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = logs; console.warn = warns; } };
const PFS = ['vinted', 'ebay', 'beebs', 'leboncoin'];
const resoudre = async ({ titre, objet, icone = '🍽️', prefs, pfs = PFS }) => {
  _viderQuestionsCategorie();
  appels = []; preferences = prefs;
  const edited = Object.fromEntries(pfs.map((p) => [p, { title: titre, description: `${titre}. Très bon état.`, platform_fields: { etat: 'Très bon état' } }]));
  const r = await silence(() => resoudrePublication({
    plateformes: pfs, selected: new Set(pfs), edited, initialListing: { titre, description: `${titre}. Très bon état.` },
    sharedFields: {}, sharedOverrides: {}, activeAiIcon: icone, activeAiObjet: objet, origineCat: null,
    lang: 'fr', supabase: fauxSupabase, ebayVoieApi: false, outils: outilsPour(icone),
  }));
  return { r, pf: r?.pfParPlateforme ?? {}, appels: [...appels] };
};
const cheminDe = (p, pf) => (p === 'vinted' ? pf?.categoryPath : p === 'ebay' ? pf?.ebayCategoryPath : p === 'beebs' ? pf?.beebsCategoryPath : pf?.lbcCategoryPath);
const verifDe = (appelsFaits, p) => appelsFaits.filter((b) => Array.isArray(b?.candidats?.[p]) && b.candidats[p].some((c) => j(c.chemin) === j(p === 'vinted' ? ASSIETTES_V : ASSIETTES_E))).at(-1);

// L'« IA » range un mug avec les tasses (ou les mugs), sinon nulle part.
{
  const { pf, appels: a } = await resoudre({ titre: 'Mug céramique blanc', objet: 'mug',
    prefs: [/Arts de la table > (Verres > )?(Tasses|Mugs)/, /Vaisselle et art de la table$/, /^Maison & Jardin > Arts de la table$/] });
  const v = pf.vinted ?? {};
  ok(feuille(v.categoryPath) === 'Tasses et tasses à café' && v.categorie_verification?.verdict === 'remplace',
    `mug, Vinted : « Tasses et tasses à café » (verdict « remplace »), plus jamais Assiettes`, `${j(v.categoryPath)} · ${JSON.stringify(v.categorie_verification)}`);
  const corps = verifDe(a, 'vinted');
  const liste = corps?.candidats?.vinted ?? [];
  ok(liste.length > 1 && j(liste[0].chemin) === j(ASSIETTES_V) && liste.some((c) => feuille(c.chemin) === 'Tasses et tasses à café'),
    `mug, Vinted : la liste soumise = le chemin de l’icône EN TÊTE, puis ses sœurs (${liste.length} lignes, Tasses dedans)`);
  ok(liste.length <= 20 ? corps?.max_candidats === undefined : corps?.max_candidats >= liste.length,
    'au-delà de 20 lignes, max_candidats est demandé ; jusqu’à 20, le corps ne change pas de forme', `lignes ${liste.length}, max_candidats ${corps?.max_candidats}`);
  ok(feuille(pf.ebay?.ebayCategoryPath) === 'Mugs', `mug, eBay : « Mugs » (le mot tombe exact chez eBay : le cas n’existait que sur Vinted)`, j(pf.ebay?.ebayCategoryPath));
  ok(feuille(pf.beebs?.beebsCategoryPath) === 'Vaisselle et art de la table' && pf.beebs?.categorie_verification?.verdict === 'confirme',
    'mug, Beebs : « Vaisselle et art de la table », confirmée PARMI ses sœurs (plus seule)', JSON.stringify(pf.beebs?.categorie_verification));
  ok(j(pf.leboncoin?.lbcCategoryPath) === 'Maison & Jardin > Arts de la table', 'mug, Leboncoin : « Arts de la table »', j(pf.leboncoin?.lbcCategoryPath));
}
{
  const { pf } = await resoudre({ titre: 'Gobelet en grès', objet: 'gobelet',
    prefs: [/Arts de la table > (Verres > )?(Tasses|Verres|Mugs)/, /Arts de la table > (Mugs|Tasses)/] });
  ok(/^(Tasses et tasses à café|Verres à eau|Verres à pied|Sets de verres)$/.test(feuille(pf.vinted?.categoryPath) ?? ''),
    `gobelet, Vinted : Tasses ou Verres (${feuille(pf.vinted?.categoryPath)})`);
  ok(/^(Mugs|Tasses, soucoupes)$/.test(feuille(pf.ebay?.ebayCategoryPath) ?? '') && /^\d+$/.test(String(pf.ebay?.ebayCategoryId ?? '')),
    `gobelet, eBay : Mugs ou Tasses, avec l’identifiant de la feuille (${j(pf.ebay?.ebayCategoryPath)} · ${pf.ebay?.ebayCategoryId})`);
}
{
  const { pf } = await resoudre({ titre: 'Bol en porcelaine', objet: 'bol', prefs: [/Arts de la table > (Vaisselle > )?Bols/] });
  ok(feuille(pf.vinted?.categoryPath) === 'Bols', `bol, Vinted : Bols (${j(pf.vinted?.categoryPath)})`);
  ok(feuille(pf.ebay?.ebayCategoryPath) === 'Bols, saladiers', `bol, eBay : Bols, saladiers (${j(pf.ebay?.ebayCategoryPath)})`);
}
{
  const { pf } = await resoudre({ titre: 'Soupière ancienne en faïence', objet: 'soupière',
    prefs: [/Vaisselle de service > Plats de service|Assiettes\/plats de service/, /Sets de service|Services de table/] });
  ok(/Vaisselle de service|Services de table/.test(j(pf.vinted?.categoryPath)), `soupière, Vinted : la vaisselle de service (${j(pf.vinted?.categoryPath)})`);
  ok(/plats de service|Services de table/i.test(feuille(pf.ebay?.ebayCategoryPath) ?? ''), `soupière, eBay : plats de service (${j(pf.ebay?.ebayCategoryPath)})`);
}
{
  const { pf } = await resoudre({ titre: 'Assiette plate Gien', objet: 'assiette', prefs: [/Arts de la table > (Vaisselle > )?Assiettes$/] });
  ok(feuille(pf.vinted?.categoryPath) === 'Assiettes' && feuille(pf.ebay?.ebayCategoryPath) === 'Assiettes', 'assiette : Assiettes sur Vinted et eBay (pas de régression)',
    `${j(pf.vinted?.categoryPath)} · ${j(pf.ebay?.ebayCategoryPath)}`);
  const r2 = await resoudre({ titre: 'Lot de 6 assiettes plates', objet: 'assiettes plates', prefs: [/Arts de la table > (Vaisselle > )?Assiettes$/] });
  ok(feuille(r2.pf.vinted?.categoryPath) === 'Assiettes', `« assiettes plates », Vinted : Assiettes (${j(r2.pf.vinted?.categoryPath)} · ${r2.pf.vinted?.categorie_verification?.verdict ?? r2.pf.vinted?.categorie_source})`);
}
{
  // Un livre : la maison des livres reste en tête du ratissage (20/09), rien de la règle des sœurs n'y touche.
  const { pf, appels: a } = await resoudre({ titre: 'Livre Le Petit Prince Saint-Exupéry', objet: 'livre', icone: '📚', pfs: ['vinted'],
    prefs: [/^Livres et médias > Livres > /] });
  const premier = a.find((b) => Array.isArray(b?.candidats?.vinted));
  ok(premier && premier.candidats.vinted.length >= 8 && premier.candidats.vinted.slice(0, 8).every((c) => j(c.chemin).startsWith('Livres et médias > Livres')),
    `livre, Vinted : le ratissage commence par les feuilles de la maison des livres (${premier?.candidats?.vinted?.length} lignes)`);
  ok(j(pf.vinted?.categoryPath).startsWith('Livres et médias > Livres'), `livre, Vinted : rangé dans la maison des livres (${j(pf.vinted?.categoryPath)})`);
}

// ── C. La ligne seule, sans mot commun : jamais « confirme » ────────────────
console.log('C. La ligne seule, sans mot commun avec l’objet : « incertain », jamais « confirme »');
{
  // eBay 🪟 « Maison › Rideaux et accessoires pour fenêtre » : absent du relevé, la racine « Maison » dépasse la
  // borne et n'a aucune feuille directe → aucune sœur ; « voilage » ne partage aucun mot avec la feuille et ne
  // ratisse rien. (« Image, son › Télévisions » a, lui, des sœurs directes : Lunettes connectées, Manuels, guides.)
  const fenetre = getEbayCategoryPath('🪟', '');
  ok((await soeursDuRayon('ebay', fenetre)).length === 0 && (await soeursDuRayon('ebay', getEbayCategoryPath('📺', ''))).length > 0,
    'eBay : 🪟 sans sœur ; 📺 « Télévisions » avec ses sœurs directes (le repli du parent)');
  const { pf, appels: a } = await resoudre({ titre: 'Voilage blanc 140 x 240', objet: 'voilage', icone: '🪟', pfs: ['ebay'], prefs: [/Rideaux et accessoires pour fenêtre/] });
  const e = pf.ebay ?? {};
  const liste = a.map((b) => b?.candidats?.ebay).filter(Boolean).at(-1) ?? [];
  ok(Array.isArray(fenetre) && liste.length === 1 && j(liste[0].chemin) === j(fenetre), `la liste ne porte que le chemin de l’icône (${j(fenetre)})`, JSON.stringify(liste));
  ok(e.categorie_verification?.verdict === 'incertain' && e.categorie_verification?.motif === 'seul_chemin_sans_mot_commun'
    && e.categorie_incertaine === true && e.categorie_source === 'icone_non_confirmee' && j(e.ebayCategoryPath) === j(fenetre),
  'l’IA l’a « confirmée » seule → verdict « incertain », categorie_incertaine, source icone_non_confirmee (chemin gardé, la suggestion d’eBay passe devant)',
  JSON.stringify(e.categorie_verification));
  const refus = await resoudre({ titre: 'Voilage blanc 140 x 240', objet: 'voilage', icone: '🪟', pfs: ['ebay'], prefs: [] });
  const vr = refus.pf.ebay?.categorie_verification ?? {};
  ok(vr.verdict === 'incoherent' || vr.verdict_avant === 'incoherent', 'refusée par l’IA : l’incohérence d’avant (puis la voie du refus), inchangée', JSON.stringify(vr));
  // Une ligne seule QUI partage un mot avec l'objet reste confirmable : la règle ne vise que le cas sans mot commun.
  ok(feuillePartageUnMot('rideaux', fenetre) && !feuillePartageUnMot('voilage', fenetre), 'rideaux/« Rideaux et accessoires… » : mot commun (confirmable) ; voilage : aucun');
}

// ── D. Le code ──────────────────────────────────────────────────────────────
console.log('D. Le code');
const rp = lire('src/utils/resolutionPublication.js');
ok(/soeursParPf\[pfKey\] = await soeursDuRayon\(pfKey, pose\.chemin\)/.test(rp) && /if \(pose\.parDefaut\) liste = voisines\.slice\(0, 20\);/.test(rp),
  'resolutionPublication : les sœurs pour tout chemin d’icône, jamais pour le chemin par défaut (24/09)');
ok(/\.\.\.\(plusLongue > 20 \? \{ max_candidats: plusLongue \} : \{\}\)/.test(rp), 'resolutionPublication : max_candidats demandé au-delà de 20');
ok(/verdict: "incertain", motif: "seul_chemin_sans_mot_commun"/.test(rp), 'resolutionPublication : le verdict « incertain » de la ligne seule');
ok(/const MAISON_LISIBLE_MAX = 80;/.test(rp) && /RAYON_LISIBLE_MAX = 80;/.test(lire('src/utils/categorieParMot.js')), 'la borne est celle des livres du 20/09 (80)');
ok((lire('src/utils/categorieParMot.js').match(/plateforme: "beebs", mot: "polo", genre: "homme"/g) ?? []).length === 1
  && !/mot: "mug"|mot: "gobelet"/.test(lire('src/utils/categorieParMot.js')), 'aucun synonyme ajouté : SYNONYMES_DIRIGES inchangé (décision de Nico seulement)');

console.log(`\n${rouges ? '✗' : '✓'} categorie-icone-soeurs : ${verts} verts, ${rouges} rouges`);
if (rouges) process.exit(1);
