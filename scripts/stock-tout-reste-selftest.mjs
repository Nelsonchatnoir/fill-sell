// ═══════════════════════════════════════════════════════════════════════════
// VERROU — LE STOCK GARDE TOUT (18/11/2026, lot T1, retouche n° 1 de Nico)        npm run selftest:stock-tout-reste
// ═══════════════════════════════════════════════════════════════════════════
// « Le Stock garde TOUT ce qui existe aujourd'hui : publier, "à régler", les filtres, les sections, les compteurs, les
// cartes d'articles, tous les gestes actuels. "Republie ton stock en 1 clic" s'AJOUTE en tête du Stock, il ne remplace
// rien. Aucune fonction ni aucun accès ne doit disparaître ou être caché derrière un écran de plus. » (Nico, 18/11)
// La liste de contrôle (inventaire du 18/11, 49 éléments) : chaque élément est encore MONTÉ dans le Stock, au même
// endroit, avec le même appel. Ce verrou fait tomber : un élément du Stock retiré, déplacé derrière un écran de plus,
// ou une carte neuve qui en remplace une.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 400)}` : ''}`); }
};
const stock = lire('src/tabs/StockTab.jsx');
const haut = lire('src/stock/Haut.jsx');
const bloc = lire('src/stock/BlocSynchro.jsx');
const vide = lire('src/ecrans/vides/StockVide.jsx');
const tout = `${stock}\n${haut}\n${bloc}`;

const LISTE = [
  // En-tête
  ['01 Titre « Mon stock » + boutique Vinted (FeuilleBoutique)', /<TitreStock lang=\{lang\} boutiques=\{boutiquesVinted\}/],
  ['02 Bandeaux « plateforme en pause »', /pausedPlatforms\.map/],
  ['03 Carte d’activité (file des tâches)', /setFileOuverte\(true\)/],
  ['04 File des tâches (FileDesJobs)', /<FileDesJobs/],
  // Synchronisation et gestes
  ['05 BlocSynchro (« Synchroniser tout »)', /<BlocSynchro/],
  ['06 Pastilles par plateforme (synchro d’une plateforme)', /r\.lancer\(/],
  ['07 « Publier ton stock sur X » (PlateformesVides)', /onPublierStockSur/],
  ['08 PremiereAnnonce (créer la 1re annonce)', /PremiereAnnonce/],
  ['09 Synchro en cours (ConstellationReleve)', /ConstellationReleve/],
  ['10 « N points à régler » (LignePoints)', /LignePoints/],
  ['11 Résumé « Ton stock est prêt »', /resumeSynchro/],
  ['12 EcranRattachement / EcranDoublons', /EcranRattachement[\s\S]*EcranDoublons|EcranDoublons[\s\S]*EcranRattachement/],
  ['13 Carte VintedDressingSync (repli)', /<VintedDressingSync/],
  ['14 Alertes du compte (alertesCompte)', /alertesCompte/],
  ['15 Tuile « Publier » → EcranSelection → LotPublication', /gesteOuvert ?=== ?'publier'[\s\S]*<LotPublication/],
  ['16 Tuile « Republier » → ChoixPlateformeRemonter → RepublishSheet', /gesteOuvert ?=== ?'remonter'[\s\S]*<ChoixPlateformeRemonter[\s\S]*<RepublishSheet/],
  ['17 Tuile « À régler » → EcranARegler', /<EcranARegler/],
  ['18 Ligne de republication automatique', /<LigneRepublicationAuto/],
  ['19 « Ajouter un article » (EntreeAjouter → FeuilleAjouter)', /<EntreeAjouter[\s\S]*<FeuilleAjouter/],
  ['20 Carte d’ajout (écrire, parler, à la main, lot)', /ajoutDeplie/],
  // Liste : recherche, filtres, modes
  ['21 Attente boutique / attente connexion', /attenteBoutique[\s\S]*attenteConnexion/],
  ['22 Recherche (BarreRecherche)', /<BarreRecherche/],
  ['23 Filtres rapides', /<FiltresRapides/],
  ['24 « Choisir des articles à publier » (mode lot)', /entrerModeLot/],
  ['25 « Modifier le prix ou la quantité… » (BarreModifierLot)', /<BarreModifierLot/],
  ['26 Filtres actifs + « Tout effacer »', /<FiltresActifs/],
  ['27 « Les brouillons portent ce texte »', /BrouillonsListe|brouillons/],
  ['28 AppelFiltrePublier', /<AppelFiltrePublier/],
  ['29 Lot en cours (LigneLotEnCours → SuiviLot)', /<LigneLotEnCours/],
  ['30 Panneau des filtres', /<PanneauFiltres/],
  ['31 Listes marque / catégorie (FeuilleListe)', /<FeuilleListe/],
  ['32 En-tête de liste (compte, tri, vue)', /<EnTeteListe/],
  ['33 Brouillons (BrouillonsListe)', /<BrouillonsListe/],
  ['34 Prix d’achat (mode et barre)', /prixAchat|prix d'achat|purchase/i],
  ['35 Republication en masse (modeRepublish)', /modeRepublish/],
  ['36 Stock vide : bandeau + « Ce que FillSell fait »', /<BandeauStockVide[\s\S]*<CeQueFillSellFait|<CeQueFillSellFait[\s\S]*<BandeauStockVide/],
  ['37 Ligne « republications d’affilée » (pause serveur)', /d'affilée|d’affilée/],
  ['38 « Afficher tout le stock » (repubFiltre)', /repubFiltre/],
  ['39 Section « À vérifier »', /<SectionAVerifier/],
  ['40 Puce « Prêts à publier »', /Prêts à publier|pretsAPublier|prets/],
  ['41 VideAvecSortie (« Rien ne correspond »)', /<VideAvecSortie/],
  ['42 « Voir les N autres articles »', /showAllStock/],
  ['43 RepublishAutoBlock (pied)', /<RepublishAutoBlock/],
  // Cartes d'articles
  ['44 Cartes d’articles (grille / ligne)', /rendreArticle/],
  ['45 Geste principal : Publier / Régler / Remonter / Vendu', /publierArticle[\s\S]*remonterArticle/],
  ['46 Mur de connexion dans la carte (BoutonMeConnecter)', /BoutonMeConnecter/],
  ['47 Menu « … » de l’article (MenuArticle)', /<MenuArticle/],
  ['48 Infos : tâche échouée, dates, état (failJobModal, DatesEnLigne, RemovePlatformsModal)', /failJobModal[\s\S]*RemovePlatformsModal/],
  ['49 Questions et attentes (NeedsUserJob, AttenteLectureOrigine)', /NeedsUserJob[\s\S]*AttenteLectureOrigine|AttenteLectureOrigine[\s\S]*NeedsUserJob/],
];
console.log('1. La liste de contrôle du Stock : chaque élément est encore là');
for (const [nom, motif] of LISTE) ok(motif.test(tout) || (nom.startsWith('36') && motif.test(`${stock}\n${vide}`)), nom);

console.log('\n2. « Republie ton stock en 1 clic » S’AJOUTE, sous le titre, et ouvre le geste existant');
ok(/attenteBoutique=\{attenteBoutique\}\/>\n[\s\S]{0,400}\{!modeRepublish&&<CarteRepublierStock userId=\{user\?\.id\?\?null\} lang=\{lang\} geste=\{gesteRemonter\}\/>\}/.test(stock),
  'la carte est montée juste sous le titre, avec le geste « Remonter mes annonces » du Stock');
const carte = lire('src/stock/CarteRepublierStock.jsx');
ok(/geste\.onOuvrir\?\.\(\)/.test(carte) && !/lancerRepublication|republish_|cross_post_jobs/.test(carte), 'son bouton ouvre le geste existant (choix des annonces, coût affiché avant de valider) — aucun geste neuf');
ok(/from\('vinted_sync_runs'\)\.select\('id'\)\.eq\('user_id', userId\)\.eq\('status', 'done'\)/.test(carte), 'visible seulement après une synchro réussie (une lecture, jamais en boucle)');
ok(/carte: 'republier', evenement/.test(carte), 'journal : stock_carte { carte: republier, evenement: vue | clic | fermee }');
const app = lire('src/App.jsx');
ok(/<CarteCloudStock /.test(app) && !/<CarteCloudStock /.test(stock), 'la carte Cloud vit AU-DESSUS du Stock (App) : rien du Stock n’est touché');

console.log(`\n${rouges ? `✗ stock-tout-reste : ${rouges} rouge(s), ${verts} vert(s)` : `✓ stock-tout-reste : ${verts} vert(s), 0 rouge`}`);
process.exit(rouges ? 1 : 0);
