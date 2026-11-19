// selftest:ebay-rayon-maison-deco — (19/11, ordre de Nico) CE QU'EST L'ARTICLE DÉCIDE DE SON RAYON eBAY, LÀ OÙ LA
// PUBLICATION S'ARRÊTAIT (pause « à notre charge » après un refus de l'app, « Catégorie eBay à confirmer »).
//
//   npm run selftest:ebay-rayon-maison-deco
//
// Rejoue les six tâches réelles du 18/11 (voie API, un compte Business + Cloud ; données lues en base, compte anonymisé) :
//   · en pause : « Statue décorative J-Line homme ethnique tribal résine beige 21 cm » (fiche titrée « J-Line »),
//     « 4 poule J-Line », « Lot de 4 coffrets », « Bowling story » (un livre) ;
//   · à confirmer : « Anneaux lumineux orientable », « Poisson paulownia bois ».
// Plus des témoins qui marchent déjà (non-régression) et le branchement dans ebay-api-worker.
// RACINE_SELFTEST=<dossier> : rejoue sur une autre copie de l'arbre (preuve « rouge avant » sur les fichiers de HEAD).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = process.env.RACINE_SELFTEST
  ? path.resolve(process.env.RACINE_SELFTEST) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => { try { return readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
let echecs = 0, total = 0;
const ok = (c, l, d = '') => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}${!c && d ? `\n    ${d}` : ''}`); };
const charger = async (f) => { try { return await import(pathToFileURL(path.join(RACINE, f)).href); } catch (e) { return { __absent: String(e?.message ?? e).slice(0, 160) }; } };

const A = await charger('supabase/functions/_shared/ebay-rayon-de-l-article.js');
const VB = await charger('supabase/functions/_shared/vinted-branche.ts');
const RC = await charger('supabase/functions/_shared/ebay-rayon-a-notre-charge.js');
const { FEUILLES = [] } = await charger('src/utils/arbres/ebayFeuilles.js');
ok(!A.__absent, 'le module _shared/ebay-rayon-de-l-article.js existe', A.__absent);
const f = (n, ...a) => { try { return typeof A[n] === 'function' ? A[n](...a) : undefined; } catch (e) { return { __erreur: e.message }; } };
const S = (liste) => liste.map((s) => { const i = s.indexOf(' '); return { id: s.slice(0, i), chemin: s.slice(i + 1).split(' > ') }; });
const etagere = (id) => f('etagereDeLArticle', { categorieVinted: { v: id, source: 'vinted_detail' }, colonne: id }, VB.etagereVinted);
const identite = (x) => f('identiteDeLArticle', { ...x, etagere: x.etagereId ? etagere(x.etagereId) : null });
const CADRES = ['Maison', "Décoration d'intérieur", 'Cadres'];

// ── Les six tâches, telles qu'en base (champs utiles) ────────────────────────────────────────────────────────────
const STATUE = { titreFiche: 'J-Line', titreAnnonce: 'Statue décorative J-Line homme ethnique tribal résine beige 21 cm',
  objetLens: 'statuette', objetIa: 'statue', etagereId: 3822, famille: 'maison_deco', refuse: CADRES, idRefuse: '79654',
  suggestions: S(['148373 Bébé, puériculture > Peluches, doudous', "20563 Maison > Décoration d'intérieur > Coussins, galettes de sièges",
    "36025 Maison > Décoration d'intérieur > Scultures, figurines", "16102 Maison > Décoration d'intérieur > Bougeoirs, photophores",
    '36024 Maison > Solutions de rangement > Crochets muraux, de porte', "121392 Collections > Images, statues d'animaux > Autres",
    '259702 Maison > Fêtes, occasions spéciales > Décorations de Noël, sapins > Bougeoirs',
    '14769 Auto, moto - pièces, accessoires > Automobile : pièces et accessoires > Extérieur : pièces et accessoires > Autres',
    "125072 Maison > Décoration d'intérieur > Paniers", '89511 Collections > Serrures, cadenas, clés']) };
const POULE = { titreFiche: '4 poule J-Line', objetLens: 'figurines poules', objetIa: 'statuette', etagereId: 2922, famille: 'maison_deco',
  refuse: CADRES, idRefuse: '79654' };
const COFFRETS = { titreFiche: 'Lot de 4 coffrets', objetLens: 'coffret créatif bijoux', objetIa: 'coffret créatif', etagereId: 3319, famille: 'jouets',
  refuse: ['Jouets et jeux', 'Jeux de construction', 'LEGO', 'Kits complets et packs'], idRefuse: '19006' };
const BOWLING = { titreFiche: 'Bowling story', objetLens: 'livre', objetIa: 'boule de bowling', etagereId: 2320, famille: 'livres_medias',
  isbn: '9782753802728', refuse: ['Jouets et jeux', 'Jeux de café'], idRefuse: '92101' };
const ANNEAU = { titreFiche: 'Anneaux lumineux orientable', objetLens: 'anneau lumineux', objetIa: 'anneau lumineux', etagereId: 3065, famille: 'autre',
  mappee: '159091', cheminMappe: ['Sports, vacances', 'Camping, randonnée', 'Eclairage, lampes, lanternes', 'Bâtons lumineux'],
  suggestions: S(["19591 Photo, caméscopes > Eclairage, studio > Eclairage continu > Kits d'éclairage continu", '32643 Collections > Autres',
    '43440 Photo, caméscopes > Accessoires: photo, caméscope, drones > Caméscope, vidéo: lampes',
    '178022 Auto, moto - pièces, accessoires > Moto : pièces détachées > Phares, clignotants > Feux avant',
    '33513 Équipements professionnels > Diffusion vidéo, enregistrement > Éclairage pour production vidéo',
    '180313 Jouets et jeux > Modélisme ferroviaire > Échelles rares > Autres', '92149 Jouets et jeux > Peluches, doudous > Produits dérivés',
    '116022 Maison > Éclairage intérieur > Guirlandes', '20705 Maison > Éclairage intérieur > Pièces pour éclairage',
    '179977 Sports, vacances > Pêche > Montages de pêche > Autres']) };
const POISSON = { titreFiche: 'Poisson paulownia bois', objetLens: 'poisson décoratif suspendu', objetIa: 'poisson décoratif', etagereId: 3829, famille: 'maison_deco',
  mappee: '36018', cheminMappe: ['Maison', "Décoration d'intérieur", 'Fruits décoratifs'],
  suggestions: S(['20150 Art, antiquités > Art du XXe, contemporain > Sculptures, statues', '79032 Art, antiquités > Objets du XXe, récents',
    '60630 Art, antiquités > Art du XIXe et avant > Estampes, gravures, lithos', '119151 Art, antiquités > Art du XIXe et avant > Sculptures, statues',
    '142476 Collections > Coquillages, minéraux > Minéraux', '32643 Collections > Autres', "36025 Maison > Décoration d'intérieur > Scultures, figurines",
    '45505 Maison > Cuisine, arts de la table > Arts de la table > Plateaux', '4174 Art, antiquités > Art du XXe, contemporain > Autres',
    '566 Collections > Bistrot > Tire-bouchons, décapsuleurs']) };

console.log("1. Les quatre pauses « à notre charge » : ce qu'est l'article tranche");
ok(VB.etagereVinted?.(3822)?.chemin.join(' › ') === 'Maison › Décoration › Sculptures et figurines', 'étagère 3822 = « Maison › Décoration › Sculptures et figurines » (arbre relevé)');
const eStatue = etagere(3822);
ok(eStatue?.id === 3822 && eStatue.chemin === 'Maison › Décoration › Sculptures et figurines', `l'étagère de la fiche, chemin lu par l'identifiant (${JSON.stringify(eStatue)})`);
ok(f('etagereDeLArticle', { categorieVinted: { v: 3822, source: 'ia' }, colonne: null }, VB.etagereVinted) === null, "un attribut qui ne vient pas d'un relevé ne compte pas");
ok(f('etagereDeLArticle', { categorieVinted: null, colonne: 3822 }, VB.etagereVinted)?.id === 3822, 'sinon la colonne vinted_catalog_id');
const iStatue = identite(STATUE);
const cStatue = f('rayonCorrobore', iStatue, { refuses: [STATUE.refuse], idRefuse: STATUE.idRefuse });
ok(cStatue?.id === '36025' && cStatue.chemin.join(' > ') === "Maison > Décoration d'intérieur > Scultures, figurines",
  `statue (objet « statuette » + étagère « Sculptures et figurines ») → 36025, sans IA (${JSON.stringify(cStatue)})`);
const cPoule = f('rayonCorrobore', identite(POULE), { refuses: [POULE.refuse], idRefuse: POULE.idRefuse });
ok(cPoule?.id === '36025' && /famille maison_deco/.test(cPoule?.preuve ?? ''), `poules (objet « figurines poules » + famille maison_deco ; étagère « Décorations saisonnières ») → 36025 (${cPoule?.preuve})`);
const cCoffrets = f('rayonCorrobore', identite(COFFRETS), { refuses: [COFFRETS.refuse], idRefuse: COFFRETS.idRefuse });
ok(cCoffrets?.id === '28145' && cCoffrets.chemin.join(' > ') === 'Loisirs créatifs > Loisirs créatifs pour enfant',
  `coffrets créatifs (objet + étagère « Enfants › Jeux et jouets › Loisirs créatifs › Kits créatifs ») → 28145 (${JSON.stringify(cCoffrets)})`);
const iBowling = identite(BOWLING);
ok(f('rayonCorrobore', iBowling, { refuses: [BOWLING.refuse], idRefuse: BOWLING.idRefuse }) === null,
  "un livre ne se corrobore jamais (Fiction / Non-fiction de l'étagère pas sûr) : l'IA tranche");
const tBowling = f('rayonsDeLaTable', iBowling, { refuses: [BOWLING.refuse], idRefuse: BOWLING.idRefuse }) ?? [];
const candBowling = f('candidatesDeLArticle', { table: tBowling, avant: S(['142544 Collections > Objets publicitaires > Produits alimentaires', '617 DVD, cinéma > DVD, Blu-ray']),
  refuses: [BOWLING.refuse], idRefuse: BOWLING.idRefuse }) ?? [];
ok(candBowling[0]?.id === '171243' && candBowling.some((c) => c.id === '171228') && candBowling.every((c) => c.id !== '92101'),
  `livre : « Livres, BD, revues > Non-fiction » (étagère) en tête du second tour, « Fiction » aussi, jamais « Jeux de café » (${candBowling.map((c) => c.id).join(', ')})`);
const aBowling = f('attributsDeLArticle', iBowling, { genre: null, isbn: BOWLING.isbn, cheminRayon: BOWLING.refuse }) ?? {};
ok(aBowling.objet === 'livre' && aBowling.rayon_vinted_du_vendeur === 'Livres et médias › Livres › Non-fiction' && aBowling.isbn === BOWLING.isbn,
  `l'IA lit l'objet VU (« livre », pas « boule de bowling »), l'étagère du vendeur et l'isbn (${JSON.stringify(aBowling)})`);
const corps = f('corpsChoixDeLArticle', { titre: BOWLING.titreFiche, attributs: aBowling, candidates: candBowling, plusProche: true }) ?? {};
ok(corps.consigne === 'plus_proche' && corps.candidats?.ebay?.[0]?.id === '171243' && corps.attributs?.objet === 'livre', 'second tour : consigne « plus proche », la table en tête, l\'objet dans les attributs');
const aStatue = f('attributsDeLArticle', iStatue, { genre: 'Homme', cheminRayon: STATUE.refuse }) ?? {};
ok(!('genre' in aStatue) && aStatue.objet === 'statuette', `« homme » d'une statue n'est pas un genre : jamais dit à l'IA hors rayon de mode (${JSON.stringify(aStatue)})`);
ok(f('attributsDeLArticle', iStatue, { genre: 'Homme', cheminRayon: ['Vêtements, accessoires', 'Homme : vêtements, accessoires'] })?.genre === 'Homme', 'rayon de mode : le genre est dit');

console.log("\n2. Les deux « à confirmer » : l'objet et l'étagère du vendeur tranchent, la question reste quand le doute est vrai");
const iAnneau = identite(ANNEAU);
const cAnneau = f('rayonCorrobore', iAnneau);
ok(cAnneau?.id === '19591' && cAnneau.id === ANNEAU.suggestions[0].id && cAnneau.id !== ANNEAU.mappee,
  `anneau lumineux (objet + étagère « Électronique › Appareils photo ») → 19591, la 1re suggestion d'eBay, pas « Bâtons lumineux » (${cAnneau?.preuve})`);
const iPoisson = identite(POISSON);
ok(f('rayonCorrobore', iPoisson) === null, 'poisson décoratif : aucun rayon corroboré (aucune entrée de la table ne le nomme)');
const arb = f('arbitrageParLEtagere', iPoisson, { mappee: POISSON.mappee, cheminMappe: POISSON.cheminMappe, suggestions: POISSON.suggestions });
const ids = (arb?.candidates ?? []).map((c) => c.id);
ok(arb?.mappingCoherent === true && ids.includes('36025') && ids.includes('20150') && ids[ids.length - 1] === '36018' && !ids.includes('142476') && !ids.includes('566'),
  `étagère « Maison › Décoration › … › Bibelots » : l'IA tranche parmi Maison / Art / Céramiques, notre rayon EN DERNIER, jamais « Collections » (${ids.join(', ')})`);
const aPoisson = f('attributsDeLArticle', iPoisson, { cheminRayon: POISSON.cheminMappe }) ?? {};
const corpsP = f('corpsChoixDeLArticle', { titre: POISSON.titreFiche, attributs: aPoisson, candidates: arb?.candidates ?? [] }) ?? {};
ok(!('consigne' in corpsP) && corpsP.attributs?.objet === 'poisson décoratif suspendu' && corpsP.attributs?.rayon_vinted_du_vendeur === 'Maison › Décoration › Accessoires décoratifs › Bibelots',
  "« à confirmer » : consigne STRICTE (null reste une réponse), avec l'objet vu et l'étagère");

console.log('\n3. Témoins (ce qui marche déjà ne bouge pas) et garde-fous');
ok(f('rayonCorrobore', identite({ objetLens: 'vase', objetIa: 'vase', etagereId: 3822, famille: 'maison_deco' })) === null,
  "« Lot 2 vase J-Line » (étagère « Sculptures et figurines ») : l'étagère seule ne corrobore jamais — l'objet doit nommer le rayon");
ok(f('rayonCorrobore', identite({ objetLens: 'figurine Pokémon', famille: 'jouets' })) === null, 'une figurine de jouet (famille jouets, sans étagère) : rien');
ok(f('rayonCorrobore', identite({ objetLens: 'statuette', etagereId: 3065, famille: 'maison_deco', objetIa: 'ring light' })) === null,
  'deux rayons corroborés différents (statuette + ring light) : doute, rien');
ok(f('rayonCorrobore', identite(STATUE), { refuses: [["Maison", "Décoration d'intérieur", 'Scultures, figurines']], idRefuse: '36025' }) === null, 'jamais un rayon refusé');
ok(f('rayonCorrobore', identite({ objetLens: null, objetIa: null, etagereId: null, famille: null })) === null
  && f('arbitrageParLEtagere', identite({}), { mappee: '1', cheminMappe: ['Maison'], suggestions: [] }) === null, 'sans objet ni étagère : rien ne change');
// Témoins réels du 60 jours (« à confirmer » relancées) : l'étagère du vendeur aurait gardé le bon rayon.
const cd = f('arbitrageParLEtagere', identite({ objetLens: 'CD audio', etagereId: 3039, famille: 'livres_medias' }), { mappee: '176984', cheminMappe: ['Musique, CD, vinyles', 'CD'],
  suggestions: S(['46931 Art, antiquités > Art du XXe, contemporain > Estampes, gravures', '268 Livres, BD, revues > Autres', '171228 Livres, BD, revues > Fiction']) });
ok(cd?.mappingCoherent === true && (cd?.candidates ?? []).map((c) => c.id).join(',') === '176984',
  "« CD … dans le répertoire » (étagère « Livres et médias › Musique › CD ») : seul notre rayon « CD » est dans l'étagère, l'IA doit le CONFIRMER — la relance d'avant l'a publié en « Estampes »");
const mag = f('arbitrageParLEtagere', identite({ objetLens: 'magazine', etagereId: 5424, famille: 'livres_medias' }), { mappee: '47180', cheminMappe: ['Jouets et jeux', 'Maisons de poupées miniatures', 'Livres, magazines, journaux'],
  suggestions: S(['2243 Livres, BD, revues > Revues > Informatique et internet', '139973 Jeux vidéo, consoles > Jeux', '1140 Livres, BD, revues > Revues > Loisirs et activités']) });
ok(mag?.mappingCoherent === false && (mag?.candidates ?? []).map((c) => c.id).join(',') === '2243,1140',
  `magazine de jeux vidéo (étagère « Livres et médias › Magazines ») rangé en « Maisons de poupées » : seules les revues d'eBay dans l'étagère (${(mag?.candidates ?? []).map((c) => c.id).join(',')})`);
ok(VB.etagereVinted?.(1764)?.chemin.join(' › ') === 'Enfants › Jeux et jouets › Peluches'
  && f('arbitrageParLEtagere', identite({ objetLens: 'peluche', etagereId: 1764 }), { mappee: '148373', cheminMappe: ['Bébé, puériculture', 'Peluches, doudous'], suggestions: S(['617 DVD, cinéma > DVD, Blu-ray']) }) === null,
  'étagère hors table (« Enfants › Jeux et jouets › Peluches ») : la question, comme avant');
// La table : chaque feuille est celle d'eBay.fr, au caractère près (arbre relevé, ou suggestion d'eBay en base).
const HORS_ARBRE = new Set(['28145', '19591']); // vues dans les suggestions d'eBay en base, branches non relevées dans l'arbre
for (const e of A.RAYONS_DE_L_ARTICLE ?? []) {
  const feuille = FEUILLES.find((x) => x.id === e.id);
  ok(HORS_ARBRE.has(e.id) ? !feuille && /suggestion d'eBay en base/.test(e.preuve) : feuille?.chemin.join(' > ') === e.chemin.join(' > '),
    `table : ${e.id} « ${e.chemin.join(' > ')} » ${HORS_ARBRE.has(e.id) ? "(suggestion d'eBay en base)" : "(arbre relevé)"}`);
}

console.log('\n4. La reprise seule : les six tâches repartent sans geste');
ok(String(RC.REGLE_RAYON_VERSION) === '2026-11-19', `REGLE_RAYON_VERSION relevée (${RC.REGLE_RAYON_VERSION}) : les pauses rejouées le 18/11 repartent une fois`);
const pause = (x = {}) => ({ status: 'needs_user', platform: 'ebay', action: 'publish', platform_fields: { needs_user_source: 'ebay_rayon_a_notre_charge',
  last_diagnostic: { etape: 'categorie', quoi: 'categorie_a_choisir' }, rayon_rejoue: { version: '2026-11-18', le: '2026-11-18T21:46:07.260Z' }, ebayCategorieAttente: { choix: [] }, ...x } });
ok(RC.aRejouer?.(pause()) === true, 'les 4 pauses (rejouées sous 2026-11-18) : rejouées une fois');
const conf = { status: 'needs_user', platform: 'ebay', action: 'publish', platform_fields: { needs_user_source: 'relancer',
  last_diagnostic: { etape: 'categorie', quoi: 'categorie_a_confirmer' }, ebayCategorieAttente: { mapping: '159091', choix: [] } } };
ok(RC.aRejouer?.(conf) === true, 'les 2 « à confirmer » (posées avant ces règles) : rejouées une fois');
const pfR = RC.champsRejoues?.(conf.platform_fields, '2026-11-19T08:00:00Z') ?? {};
ok(!('ebayCategorieAttente' in pfR) && !('needs_user_source' in pfR) && pfR.rayon_rejoue?.version === RC.REGLE_RAYON_VERSION,
  'rejouée SANS la marque de la relance (sinon la proposition d\'eBay serait prise à l\'aveugle)');
ok(RC.aRejouer?.({ ...conf, platform_fields: { ...conf.platform_fields, rayon_rejoue: { version: RC.REGLE_RAYON_VERSION, pose: true } } }) === false,
  '« à confirmer » posée sous ces règles : jamais rejouée (pas de question qui disparaît puis revient)');

console.log('\n5. ebay-api-worker : branché au bon endroit, seulement là où la publication s\'arrêtait');
const W = lire('supabase/functions/ebay-api-worker/index.ts');
ok(/from "\.\.\/_shared\/ebay-rayon-de-l-article\.js"/.test(W), 'le worker importe la règle');
ok((W.match(/__etagereArticle = etagereDeLArticle\(/g) ?? []).length === 2, "l'étagère (toutes branches) voyage jusqu'à resoudreCategorie, en production ET au rejeu à blanc");
ok(/delete \(pf as Record<string, unknown>\)\.__etagereArticle;/.test(W) && /delete \(pf as Record<string, unknown>\)\.__titreAnnonce;/.test(W), 'les champs de passage ne sont jamais écrits sur la tâche');
const iChoisi = W.indexOf('source: "suggestion_apres_refus"');
const iAucune = W.indexOf('if (issue.issue === "aucune") {\n        const article = await rayonDeLArticleApresRefus(');
const iPause = W.indexOf("aucune des ${restantes.length} suggestion(s) eBay retenue par l'IA");
ok(iChoisi > 0 && iAucune > iChoisi && iPause > iAucune, 'après un refus : le premier tour à l\'identique, le second seulement sur « aucune », avant la pause');
ok(/noteGenre \+ noteArticle,/.test(W), 'la pause dit ce que le second tour a vu');
const iFamille = W.indexOf('source: "mapping_confirme_par_famille"');
const iConf = W.indexOf('if (racineContestee && !attributsConfirment && !dejaTranche) {\n        const article = await rayonDeLArticleAConfirmer(');
const iQuestion = W.indexOf('if (racineContestee && !dejaTranche) {\n        return {');
ok(iFamille > 0 && iConf > iFamille && iQuestion > iConf, "« à confirmer » : après l'arbitrage par la famille, avant la question ; jamais à la relance (dejaTranche)");
ok(/quoi === "categorie_a_confirmer" && !categorie\.attente\) \{\n\s+job\.platform_fields = \{ \.\.\.\(job\.platform_fields \?\? \{\}\), rayon_rejoue: \{ version: REGLE_RAYON_VERSION, le: new Date\(\)\.toISOString\(\), pose: true \} \};/.test(W),
  'une question « à confirmer » posée porte la version des règles');
ok(/const corps = corpsChoixDeLArticle\(/.test(W) && /plusProche: true/.test(W) && /plusProche: false/.test(W), 'resolve-categorie reçoit le corps de la règle (plus proche après refus, strict pour « à confirmer »)');
ok(/rayonCorrobore\(identite, \{ refuses: x\.refuses, idRefuse: x\.idRefuse \}\)/.test(W), 'après un refus, jamais le rayon refusé');

console.log(`\n${echecs ? '✗' : '✓'} selftest:ebay-rayon-maison-deco — ${total - echecs}/${total}`);
process.exit(echecs ? 1 : 0);
