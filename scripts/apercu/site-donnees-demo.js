// ═══════════════════════════════════════════════════════════════════════════
// APERÇU SITE — LE JEU DE DONNÉES DE DÉMONSTRATION, UNIQUE (refait le 09/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de captures pour le site vitrine (chantier SEO), jamais livré dans
// l'app. AUCUNE donnée réelle : un compte inventé (« Camille »), des
// identifiants inventés, des dates relatives à l'heure de la page, aucune
// adresse, aucun pseudo, aucun numéro d'annonce réel (les liens d'annonce ne
// sont jamais affichés et pointent vers des adresses de démonstration).
// AUCUN chiffre de Nico : tout est tiré d'un générateur à graine fixe.
//
// L'HISTOIRE — un mois de très bonne revendeuse, crédible :
//   · ~240 ventes sur six mois, en croissance (≈ 24 en mai → 62 en octobre),
//     prix de seconde main ordinaires (t-shirts 12-20 €, sweats 25-40 €,
//     baskets 45-70 €, vêtements enfant 8-25 €, quelques pièces à 85-145 €),
//     prix d'achat CONNUS (friperies, vide-greniers, lots), marges plausibles ;
//   · les ventes sont réparties sur Vinted, Leboncoin, eBay, Beebs ET Depop ;
//     Depop n'a de ventes que depuis son ouverture (les 19 derniers jours) ;
//   · plusieurs articles partent en moins de 48 h (les trois meilleures
//     marges sont restées 1 à 3 jours en stock) ;
//   · ~42 articles en stock : les photos libres (public/landing/*.webp,
//     public/pata2.jpg — photos produit sans donnée personnelle) portent les
//     articles qu'on voit à l'écran ; les autres sont des fiches plus récentes,
//     jamais visibles sur les captures (elles font des chiffres crédibles).
//
// ⛔ Aucune plateforme hors des cinq présentées : Vinted, Leboncoin, eBay,
// Beebs, Depop. Ni Opla, ni FillSell Cloud. Aucun quota, aucun plafond.
//
// L'HEURE : les captures sont prises à HORLOGE_DEMO (horloge du navigateur
// fixée par site-capture.mjs) — un vendredi de fin octobre : « ce mois » est
// un mois presque entier, et les captures sont identiques d'un passage à
// l'autre, quel que soit le jour où on les refait. Sans horloge fixée
// (harnais ouvert à la main), tout reste daté par rapport à « maintenant ».

export const UID_DEMO = '0d3e0000-5e0f-4a11-8000-00000000ca31';
export const EMAIL_DEMO = 'camille@exemple.test';
export const PRENOM_DEMO = 'Camille';
/** L'instant des captures (Paris, heure d'hiver). */
export const HORLOGE_DEMO = '2026-10-30T17:40:00+01:00';

// ── LES PLATEFORMES — des DONNÉES, une ligne chacune ────────────────────────
/** Les cinq plateformes présentées partout (ordre d'affichage du site). */
export const PLATEFORMES_DEMO = ['vinted', 'leboncoin', 'ebay', 'beebs', 'depop'];
/**
 * Les plateformes à REPUBLICATION AUTOMATIQUE — jamais eBay (inutile chez
 * eBay, on n'en parle pas). ⛔ UN SEUL GESTE pour retirer Depop : enlever
 * 'depop' de cette liste. Elle commande l'état servi au faux serveur
 * (republish_planifiee_etat_multi), les textes alternatifs des captures et le
 * contrôle « Depop présent » de site-capture.mjs.
 */
export const PLATEFORMES_REPUBLICATION_AUTO = ['vinted', 'leboncoin', 'beebs', 'depop'];
export const NOMS_PF = { vinted: 'Vinted', leboncoin: 'Leboncoin', ebay: 'eBay', beebs: 'Beebs', depop: 'Depop' };
/** Depop n'a de ventes et d'annonces que depuis son ouverture : les N derniers jours. */
const JOURS_DEPOP = 19;

const J = 86400000;
const H = 3600000;
const M = 60000;
const iso = (ms) => new Date(ms).toISOString();
/** La date du jour LOCALE (fuseau de la page : Europe/Paris sous Playwright). */
const jourLocal = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export const PHOTOS = {
  casquette: '/landing/casquette-volcom.webp',
  bottines: '/landing/chaussures-cyrillus.webp',
  short: '/landing/short-polo.webp',
  ohlins: '/landing/sweat-ohlins.webp',
  redbull: '/landing/sweat-redbull.webp',
  teeSurf: '/landing/tshirt-graphique.webp',
  teeOurs: '/landing/tshirt-ours.webp',
  patagonia: '/landing/tshirt-patagonia.webp',
  patagoniaDos: '/pata2.jpg',
};
const photos = (...urls) => urls.map((url) => ({ type: 'original', url }));
// Poids de chaque article (grammes), posés sur la fiche comme le fait l'app.
const POIDS = { casquette: 120, bottines: 450, short: 220, ohlins: 600, teeSurf: 180, teeOurs: 170, patagonia: 210, redbull: 550 };

// ── LES ARTICLES PHOTOGRAPHIÉS (fiches du stock) ────────────────────────────
// [clé, titre, marque, type, prix de vente, prix d'achat, photos, âge de la
//  fiche (jours), { plateforme: âge de l'annonce (jours) }, description]
// Leurs fiches sont les plus RÉCENTES du stock (le Stock trie les cartes par
// « Plus récents ») et leurs annonces les plus ANCIENNES (« Remonter » trie
// de la plus ancienne à la plus récente, à partir de 7 jours) : ce sont donc
// elles qu'on voit sur les deux écrans.
// Depop : annonces déposées depuis son ouverture seulement (≤ 19 jours).
const ARTICLES = [
  ['teeOurs', 'T-shirt Picture gris « Climate Change »', 'Picture', 'Mode', 14, 4, [PHOTOS.teeOurs], 1, {},
    "T-shirt gris chiné Picture Organic Clothing, imprimé ours polaire « Climate Change — Be responsible ». Très bon état."],
  ['patagonia', 'T-shirt Patagonia noir logo, taille L', 'Patagonia', 'Mode', 24, 6, [PHOTOS.patagonia, PHOTOS.patagoniaDos], 20,
    { vinted: 20, leboncoin: 19.6, ebay: 19.2, beebs: 18, depop: 12 },
    "T-shirt noir Patagonia, petit logo sur la poitrine, grand logo P-6 dans le dos, coton épais. Très bon état, taille L."],
  ['teeSurf', 'T-shirt Picture noir imprimé surf, taille M', 'Picture', 'Mode', 16, 4, [PHOTOS.teeSurf], 35,
    { vinted: 35, leboncoin: 34, depop: 16 },
    "T-shirt noir Picture Organic Clothing, grand imprimé surf sur le devant. Très bon état, taille M."],
  ['casquette', 'Casquette Volcom beige brodée', 'Volcom', 'Mode', 15, 3, [PHOTOS.casquette], 31,
    { vinted: 31, leboncoin: 30 },
    "Casquette Volcom beige, logo pierre brodé sur le devant, réglable à l'arrière. Très bon état, portée quelques fois."],
  ['bottines', 'Bottines cuir Cyrillus enfant, pointure 24', 'Cyrillus', 'Mode', 29, 8, [PHOTOS.bottines], 27,
    { vinted: 27, beebs: 26, leboncoin: 26 },
    "Bottines à lacets en cuir marron Cyrillus, pointure 24. Neuves, jamais portées, avec leur étiquette."],
  ['short', 'Short de bain Polo Ralph Lauren blanc, taille M', 'Ralph Lauren', 'Mode', 35, 10, [PHOTOS.short], 22,
    { vinted: 22, leboncoin: 21, depop: 15 },
    "Short de bain blanc Polo Ralph Lauren, logo brodé, cordon de serrage. Neuf avec étiquette, taille M."],
  ['ohlins', 'Sweat à capuche Öhlins noir, taille L', 'Öhlins', 'Mode', 34, 9, [PHOTOS.ohlins], 15,
    { vinted: 15 },
    "Sweat à capuche noir Öhlins, grand logo jaune sur la poitrine, poche kangourou. Très bon état, taille L."],
];

// L'article VENDU sur Vinted (le sweat Red Bull Racing), avec sa photo : ses
// copies Leboncoin et Depop, déposées par FillSell (copies PROUVÉES), sont
// retirées ; une annonce eBay du même nom, importée (copie NON prouvée),
// attend la question « Déjà vendu ? ».
const VENDU = ['redbull', 'Sweat à capuche Red Bull Racing gris, taille M', 'Pepe Jeans', 'Mode', 38, 11, [PHOTOS.redbull], 26,
  { vinted: 26, leboncoin: 25, depop: 17 },
  "Sweat à capuche gris Red Bull Racing (collection Pepe Jeans), logos imprimés. Très bon état, taille M."];

// ── LE CATALOGUE DES VENTES ET DU STOCK SANS PHOTO ──────────────────────────
// [titre, variantes, marque, type, [prix de vente min, max], [prix d'achat
//  min, max], plateformes possibles]. Écarts tenus : aucune vente tirée ici ne
// dépasse ~55 € de marge (les trois plus belles sont écrites à la main, plus
// bas). Prix de seconde main ordinaires (ordre de grandeur, pas une étude).
const V = 'Vinted', L = 'Leboncoin', E = 'eBay', B = 'Beebs', D = 'Depop';
const CATALOGUE = [
  // ── Mode adulte (Vinted d'abord ; Depop pour le vintage et le streetwear)
  ['Sweat Carhartt WIP', ['gris chiné, taille L', 'noir, taille M', 'bordeaux, taille S', 'vert, taille XL'], 'Carhartt', 'Mode', [24, 34], [6, 10], [V, D, L], 2],
  ["Jean Levi's 501", ['brut, W32', 'bleu clair, W30', 'noir délavé, W34', 'vintage, W31'], "Levi's", 'Mode', [24, 38], [5, 10], [V, E, D], 2],
  ["Veste en jean Levi's Trucker", ['bleue, taille M', 'délavée, taille L'], "Levi's", 'Mode', [30, 42], [8, 14], [V, L, D]],
  ['Sweat Nike vintage', ['gris, taille L', 'bleu marine, taille M', 'brodé, taille XL'], 'Nike', 'Mode', [20, 30], [4, 8], [V, D], 2],
  ['T-shirt Nike vintage', ['blanc, taille M', 'noir, taille L', 'gris, taille S'], 'Nike', 'Mode', [12, 18], [2, 4], [V, D], 3],
  ["T-shirt Levi's logo", ['blanc, taille S', 'rouge, taille M', 'gris, taille L'], "Levi's", 'Mode', [10, 15], [2, 4], [V], 2],
  ['Baskets New Balance 574', ['grises, 41', 'bleues, 43', 'beiges, 39'], 'New Balance', 'Mode', [38, 52], [12, 20], [V, L, E]],
  ['Baskets Nike Air Force 1', ['blanches, 42', 'blanches, 40', 'noires, 44'], 'Nike', 'Mode', [35, 50], [10, 18], [V, L]],
  ['Baskets Adidas Samba', ['noires, 41', 'blanches, 38'], 'Adidas', 'Mode', [42, 55], [14, 22], [V, D]],
  ['Pull Ralph Lauren torsadé', ['marine, taille M', 'crème, taille L', 'vert, taille S'], 'Ralph Lauren', 'Mode', [28, 42], [7, 12], [V, L, E]],
  ['Chemise Ralph Lauren Oxford', ['bleu ciel, taille M', 'blanche, taille L', 'rayée, taille XL'], 'Ralph Lauren', 'Mode', [18, 26], [4, 8], [V, E], 2],
  ['Robe Sézane', ['fleurie, taille 38', 'noire, taille 36', 'portefeuille, taille 40'], 'Sézane', 'Mode', [35, 52], [12, 20], [V, L]],
  ['Jupe midi Sézane', ['plissée, taille 38', 'en lin, taille 36'], 'Sézane', 'Mode', [28, 40], [9, 14], [V]],
  ['Trench Comptoir des Cotonniers', ['beige, taille 38', 'kaki, taille 40'], 'Comptoir des Cotonniers', 'Mode', [45, 62], [15, 22], [V, L]],
  ['Pull marin Saint James', ['marine et écru, taille M', 'rouge, taille L'], 'Saint James', 'Mode', [32, 45], [10, 15], [V, L]],
  ['Polo Lacoste', ['marine, taille 4', 'blanc, taille 5', 'vert, taille 3'], 'Lacoste', 'Mode', [20, 28], [5, 9], [V, L, E], 2],
  ['Sweat Champion Reverse Weave', ['gris, taille M', 'bleu, taille L'], 'Champion', 'Mode', [20, 30], [5, 9], [V, D]],
  ['T-shirt Harley-Davidson vintage', ['noir, taille L', 'délavé, taille XL'], 'Harley-Davidson', 'Mode', [22, 34], [4, 8], [D, V, E]],
  ['Bob Stüssy', ['noir', 'beige'], 'Stüssy', 'Mode', [20, 28], [5, 8], [D, V]],
  ['Veste en cuir vintage', ['marron, taille M', 'noire, taille L'], '', 'Mode', [45, 65], [12, 22], [D, L, V]],
  ['Dr. Martens 1460', ['noires, 39', 'bordeaux, 38'], 'Dr. Martens', 'Mode', [48, 62], [16, 24], [V, D, L]],
  ['Converse Chuck 70', ['noires, 40', 'écrues, 42'], 'Converse', 'Mode', [28, 38], [8, 13], [V, D]],
  ['Sac Longchamp Le Pliage', ['noir, taille M', 'marine, taille L'], 'Longchamp', 'Mode', [32, 45], [10, 15], [V, L]],
  ['Lunettes de soleil Ray-Ban Wayfarer', ['noires', 'écaille'], 'Ray-Ban', 'Mode', [38, 52], [10, 16], [E, L, V]],
  ['Maillot de football vintage', ['Adidas, années 90', 'Umbro, taille L'], 'Adidas', 'Mode', [32, 48], [8, 14], [E, D, V]],
  ['Survêtement Adidas Originals', ['bleu, taille M', 'noir, taille S'], 'Adidas', 'Mode', [32, 45], [8, 14], [D, V]],
  ['Doudoune légère Uniqlo', ['noire, taille M', 'kaki, taille L'], 'Uniqlo', 'Mode', [20, 28], [6, 10], [V, L]],
  ['Blazer Zara', ['noir, taille 38', 'beige, taille 36'], 'Zara', 'Mode', [16, 24], [4, 7], [V], 2],
  ['Jean mom Zara', ['bleu clair, taille 36', 'noir, taille 38'], 'Zara', 'Mode', [12, 16], [3, 5], [V], 2],
  ['Top Mango', ['blanc, taille S', 'à fleurs, taille M'], 'Mango', 'Mode', [8, 12], [2, 3], [V], 2],
  ['Pull en maille H&M', ['beige, taille M', 'gris, taille S'], 'H&M', 'Mode', [9, 14], [2, 4], [V], 2],
  ['Chemise en jean vintage', ['bleue, taille M', 'délavée, taille L'], '', 'Mode', [16, 24], [3, 6], [D, V]],
  ['Foulard en soie vintage', ['motif cachemire', 'imprimé fleuri'], '', 'Mode', [14, 22], [2, 5], [D, V], 2],
  ['Ceinture en cuir vintage', ['marron', 'noire'], '', 'Mode', [12, 18], [2, 4], [D, V]],
  ['Casquette New Era', ['noire', 'bleue'], 'New Era', 'Mode', [12, 18], [3, 5], [V, D], 2],
  // ── Enfant (Beebs d'abord)
  ['Lot de 5 bodies Petit Bateau', ['6 mois', '12 mois', '18 mois'], 'Petit Bateau', 'Mode', [12, 18], [3, 5], [B, V], 2],
  ['Pyjama Petit Bateau', ['4 ans', '6 ans', '3 ans'], 'Petit Bateau', 'Mode', [8, 12], [2, 3], [B, V], 2],
  ['Lot de 3 t-shirts Petit Bateau', ['2 ans', '4 ans'], 'Petit Bateau', 'Mode', [10, 14], [2, 4], [B, V], 2],
  ['Manteau Jacadi', ['4 ans', '6 ans'], 'Jacadi', 'Mode', [22, 32], [6, 10], [B, V, L]],
  ['Robe Cyrillus fille', ['6 ans', '8 ans', '4 ans'], 'Cyrillus', 'Mode', [12, 18], [3, 5], [B, V], 2],
  ['Combinaison de ski enfant', ['4 ans', '6 ans'], 'Decathlon', 'Mode', [16, 24], [4, 7], [L, B, V]],
  ['Baskets Kickers enfant', ['pointure 26', 'pointure 28'], 'Kickers', 'Mode', [14, 20], [4, 6], [B, V]],
  ['Gilet Bonpoint', ['3 ans', '2 ans'], 'Bonpoint', 'Mode', [16, 26], [5, 8], [B, V]],
  // ── Jouets, livres, maison, high-tech
  ['Lego Friends', ['la maison de la plage', 'le café'], 'Lego', 'Jouets', [16, 26], [5, 9], [L, B, V]],
  ['Playmobil', ['la ferme', 'le bateau pirate'], 'Playmobil', 'Jouets', [14, 24], [4, 8], [L, B]],
  ['Jeu Cluedo complet', ['édition classique'], 'Hasbro', 'Jouets', [10, 14], [2, 4], [B, L, V]],
  ['Puzzle Ravensburger 1000 pièces', ['paysage', 'carte du monde'], 'Ravensburger', 'Jouets', [9, 14], [2, 4], [L, B, V]],
  ['Kapla 100 planchettes', ['boîte en bois'], 'Kapla', 'Jouets', [16, 22], [5, 8], [B, L]],
  ['Lot de 3 mangas One Piece', ['tomes 1 à 3', 'tomes 4 à 6'], '', 'Livres', [9, 13], [2, 3], [V, L], 2],
  ['Lot de romans Harry Potter en poche', ['tomes 1 à 3', 'tomes 4 à 6'], '', 'Livres', [10, 14], [2, 4], [V, L]],
  ['Lot de 4 BD Astérix', ['éditions cartonnées'], '', 'Livres', [12, 18], [3, 5], [L, V]],
  ['Lampe de bureau vintage en laiton', ['abat-jour vert'], '', 'Maison', [22, 32], [5, 9], [L, D]],
  ['Vase en verre soufflé vintage', ['ambre', 'vert'], '', 'Maison', [14, 24], [3, 6], [L, D, V]],
  ['Lot de 6 tasses vintage', ['porcelaine fleurie'], '', 'Maison', [12, 18], [3, 5], [L, D]],
  ['Game Boy Color', ['violette', 'jaune'], 'Nintendo', 'High-Tech', [40, 55], [15, 22], [E, L]],
  ['Casque Bose QuietComfort 35', ['noir'], 'Bose', 'High-Tech', [70, 85], [35, 42], [L, E]],
];
// Tirage pondéré : le poids (8e champ, 1 par défaut) fait la part des petites
// ventes (t-shirts, vêtements enfant, livres), comme chez une vraie revendeuse.
const poidsDe = (c) => (c[7] ?? 1) * (c[4][1] <= 18 ? 1.7 : 1);

// Les trois plus belles marges du semestre, écrites à la main : des pièces
// recherchées, parties en 1 à 3 jours (écran « Meilleurs vendeurs »).
// [jours, titre, marque, type, plateforme, prix de vente, prix d'achat, jours en stock]
const VEDETTES = [
  [3.1, 'Doudoune The North Face Nuptse 700 noire, taille M', 'The North Face', 'Mode', V, 135, 55, 2],
  [8.2, 'Veste Carhartt Detroit vintage marron, taille L', 'Carhartt', 'Mode', D, 85, 22, 1],
  [16.3, 'Appareil photo argentique Olympus OM-1', 'Olympus', 'High-Tech', E, 79, 22, 3],
];
// Les ventes des derniers jours, écrites à la main : la tête de l'onglet Ventes
// montre les cinq plateformes. [jours, titre, marque, type, plateforme, pv, pa, jours en stock]
const RECENTES = [
  [0.15, 'Survêtement Adidas Originals vintage bleu marine, taille M', 'Adidas', 'Mode', D, 45, 12, 2],
  [0.35, 'Lot de 5 bodies Petit Bateau, 12 mois', 'Petit Bateau', 'Mode', B, 16, 4, 1],
  [1.05, 'Casque Sony WH-1000XM3 noir', 'Sony', 'High-Tech', L, 75, 38, 6],
  [1.3, 'Sweat Carhartt WIP gris chiné, taille L', 'Carhartt', 'Mode', V, 34, 9, 4],
  [2.25, "Jean Levi's 501 vintage bleu clair, W32", "Levi's", 'Mode', E, 38, 10, 9],
  [3.6, 'Baskets New Balance 550 blanches, 42', 'New Balance', 'Mode', V, 62, 24, 5],
];

// Ventes par mois (le mois courant d'abord) et répartition par plateforme.
// Mois courant : 62 ventes, Depop seulement depuis son ouverture.
const VENTES_PAR_MOIS = [62, 56, 47, 40, 34, 27];
const MIX_MOIS_COURANT = { [V]: 31, [L]: 10, [E]: 6, [B]: 7, [D]: 8 };
const MIX_AVANT = { [V]: 0.58, [L]: 0.2, [E]: 0.12, [B]: 0.1 };

const URL_DEMO = {
  vinted: (k) => `https://www.vinted.fr/items/demo-${k}`,
  leboncoin: (k) => `https://www.leboncoin.fr/ad/vetements/demo-${k}`,
  ebay: (k) => `https://www.ebay.fr/itm/demo-${k}`,
  beebs: (k) => `https://www.beebs.app/fr/annonce/demo-${k}`,
  depop: (k) => `https://www.depop.com/products/demo-${k}`,
};

const uuid = (prefixe, n) => `${prefixe}-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Générateur à graine fixe (mulberry32) : les mêmes données à chaque passage.
function generateur(graine) {
  let a = graine >>> 0;
  const suivant = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const entre = (min, max) => Math.round(min + suivant() * (max - min));
  const choisir = (liste) => liste[Math.floor(suivant() * liste.length)];
  const choisirPondere = (liste, poids) => { const t = liste.reduce((a, x) => a + poids(x), 0); let r = suivant() * t; for (const x of liste) { r -= poids(x); if (r < 0) return x; } return liste[liste.length - 1]; };
  const melanger = (liste) => { const l = liste.slice(); for (let i = l.length - 1; i > 0; i -= 1) { const j = Math.floor(suivant() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l; };
  return { suivant, entre, choisir, choisirPondere, melanger };
}
// Jours passés en stock avant la vente : un quart part en 48 h.
function joursEnStock(g) {
  const x = g.suivant();
  if (x < 0.25) return g.entre(0, 2);
  if (x < 0.6) return g.entre(3, 8);
  if (x < 0.88) return g.entre(9, 20);
  return g.entre(21, 45);
}

/** mapItem d'App.jsx (non exporté), recopié (src/App.jsx, poids_g et a_verifier compris). */
export function mapItem(v) {
  return { id: v.id, title: v.titre, prix_achat: v.prix_achat, buy: v.prix_achat, prix_achat_inconnu: v.prix_achat_inconnu === true, sell: v.prix_vente, margin: v.margin, marginPct: v.margin_pct, statut: v.statut, date: v.date, date_ajout: v.created_at || v.date_achat || v.date, marque: v.marque || '', description: v.description || '', type: v.type || 'Autre', attributs: v.attributs ?? null,
    typeConnu: v.type != null && String(v.type).trim() !== '', purchaseCosts: v.purchase_costs || 0, sellingFees: v.selling_fees || 0, quantite: v.quantite || 1, emplacement: v.emplacement || null, plateforme: v.plateforme || null, origine: v.origine || null, photos: Array.isArray(v.photos) ? v.photos : null, vinted_item_id: v.vinted_item_id || null, vinted_catalog_id: v.vinted_catalog_id ?? null,
    vinted_account_id: v.vinted_account_id ?? null, fusionne_dans: v.fusionne_dans ?? null, disparu_le: v.disparu_le || null, vinted_status: v.vinted_status || null, last_synced_at: v.last_synced_at || null, vinted_view_count: v.vinted_view_count ?? null, vinted_favourite_count: v.vinted_favourite_count ?? null, listed_at_guess: v.listed_at_guess || null,
    poids_g: v.poids_g ?? null, a_verifier: v.a_verifier ?? null };
}

/** mapSale d'App.jsx (src/App.jsx:977), recopié. */
export function mapSale(v) {
  return { id: v.id, title: v.titre, prix_vente: v.prix_vente, buy: v.prix_achat, sell: v.prix_vente, inventaire_id: v.inventaire_id ?? null, ship: 0, margin: v.benefice, marginPct: (v.benefice == null || !(v.prix_vente > 0)) ? null : (v.benefice / v.prix_vente) * 100, date: v.date, date_vente: v.date || v.created_at, marque: v.marque || '', type: v.type || '', purchaseCosts: v.purchase_costs || 0, sellingFees: v.selling_fees || 0, description: v.description || null, emplacement: v.emplacement || null, plateforme: v.plateforme || null, quantite: v.quantite || null };
}

/**
 * Le compte de démonstration complet, daté par rapport à `maintenant`.
 * Forme : celle du harnais du Stock (stock-refonte.jsx) — `utilisateur`,
 * `tables` (servies par faux-supabase.js), `rpc` — plus des vues prêtes
 * (items, sales) et les objets des écrans hors base (Lens, popup).
 *
 * venteRecente : la vente Vinted du sweat Red Bull date de 14 minutes ; le
 * retrait de sa copie Depop est EN COURS (l'ordinateur y travaille), celui de
 * sa copie Leboncoin suit, et le sweat Öhlins attend son dépôt sur Depop et
 * Leboncoin (la file de l'ordinateur).
 */
export function donneesDemo(maintenant = Date.now(), { venteRecente = false } = {}) {
  const avant = (ms) => iso(maintenant - ms);
  const jour = (ms) => jourLocal(maintenant - ms);
  const g = generateur(20261030);
  const titresPris = new Set();
  // Deux titres qui ne diffèrent que par la ponctuation sont le MÊME titre (« Lot de 5 bodies, 12 mois »).
  const cleTitre = (t) => t.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, ' ').trim();
  const inventaire = [];
  const jobs = [];
  const ventes = [];
  let nJob = 0; let nFiche = 0; let nVente = 0;
  const job = (o) => {
    const j = {
      id: uuid('0d3e0b0b', ++nJob), user_id: UID_DEMO, status: 'published', error: null, published_at: null,
      platform_fields: {}, action: 'publish', listing_url: null, title: null, bulk_batch_id: null, voie: 'extension', price: null,
      ...o,
    };
    if (j.status === 'published' && !j.published_at) j.published_at = j.created_at;
    jobs.push(j);
    return j;
  };
  const fiche = (o) => {
    const l = {
      id: uuid('0d3e1a1a', ++nFiche), user_id: UID_DEMO, fusionne_dans: null, disparu_le: null, prix_achat_inconnu: false, purchase_costs: 0, selling_fees: 0,
      emplacement: null, plateforme: null, origine: null, attributs: null, vinted_catalog_id: null, vinted_account_id: null,
      vinted_view_count: null, vinted_favourite_count: null, margin: null, margin_pct: null, quantite: 1, photos: null, ...o,
    };
    if (l.prix_achat != null && l.prix_vente != null) {
      l.margin = l.prix_vente - l.prix_achat;
      l.margin_pct = l.prix_vente ? Math.round((l.margin / l.prix_vente) * 1000) / 10 : null;
    }
    titresPris.add(cleTitre(l.titre));
    inventaire.push(l);
    return l;
  };
  const vente = (o) => {
    const v = { id: uuid('0d3e5a1e', ++nVente), user_id: UID_DEMO, inventaire_id: null, quantite: 1, ...o };
    v.benefice = v.prix_vente - v.prix_achat;
    ventes.push(v);
    return v;
  };
  // Un titre libre (jamais deux fiches du même nom : l'onglet Stats rapproche
  // une vente de sa fiche PAR LE TITRE pour compter les jours en stock).
  const titreLibre = ([base, variantes, , type]) => {
    for (const v of g.melanger(variantes)) {
      const t = `${base} ${v}`;
      if (!titresPris.has(cleTitre(t))) return t;
    }
    const tailles = type === 'Mode' ? ['taille XS', 'taille S', 'taille M', 'taille L', 'taille XL', 'neuf avec étiquette'] : ['très bon état', 'comme neuf', 'complet', 'en boîte'];
    for (const v of variantes) {
      for (const tl of tailles) {
        const t = `${base} ${v.split(',')[0]}, ${tl}`;
        if (!titresPris.has(cleTitre(t))) return t;
      }
    }
    return `${base} ${variantes[0]} — lot ${g.entre(2, 9)}`;
  };

  [...VEDETTES, ...RECENTES].forEach(([, t]) => titresPris.add(cleTitre(t)));
  titresPris.add(cleTitre(VENDU[1]));

  // ── Le stock photographié ────────────────────────────────────────────────
  const parCle = {};
  ARTICLES.forEach(([cle, titre, marque, type, pv, pa, urls, age, pfs, description], k) => {
    const surVinted = pfs.vinted != null;
    const f = fiche({
      titre, marque, type, prix_vente: pv, prix_achat: pa, statut: 'stock', description, poids_g: POIDS[cle] ?? null,
      date: jour(age * J + 2 * H), created_at: avant(age * J + 2 * H), photos: photos(...urls),
      vinted_item_id: surVinted ? `demo-${cle}` : null, vinted_status: surVinted ? 'active' : null,
      listed_at_guess: surVinted ? avant(pfs.vinted * J) : null, last_synced_at: avant(2 * H),
      vinted_view_count: surVinted ? 46 + k * 23 : null, vinted_favourite_count: surVinted ? 4 + (k % 4) * 3 : null,
    });
    parCle[cle] = f;
    Object.entries(pfs).forEach(([p, ageP]) => job({
      inventaire_id: f.id, platform: p, created_at: avant(ageP * J), listing_url: URL_DEMO[p](cle), title: titre, price: pv,
      voie: p === 'ebay' ? 'api' : 'extension',
    }));
  });

  // ── Le stock sans photo : achetées il y a 23 à 37 jours (un lot de vide-
  // grenier), mises en ligne depuis, petit à petit (1 à 13 jours) : derrière
  // les articles photographiés sur les cartes comme dans « Remonter ». Toujours
  // sur Vinted, plus Leboncoin, eBay, Beebs ou Depop selon l'article.
  const NB_STOCK_SANS_PHOTO = 35;
  for (let k = 0; k < NB_STOCK_SANS_PHOTO; k += 1) {
    const modele = g.choisirPondere(CATALOGUE, poidsDe);
    const [, , marque, type, [pvMin, pvMax], [paMin, paMax], possibles] = modele;
    const titre = titreLibre(modele);
    const pv = g.entre(pvMin, pvMax); const pa = g.entre(paMin, paMax);
    const age = 1 + (k % 13) + g.suivant() * 0.8;
    const achat = (23 + (k % 14) + g.suivant()) * J;
    const f = fiche({
      titre, marque, type, prix_vente: pv, prix_achat: pa, statut: 'stock', description: '', poids_g: null,
      date: jour(achat), created_at: avant(achat),
      vinted_item_id: `demo-s${k}`, vinted_status: 'active', listed_at_guess: avant(age * J), last_synced_at: avant(2 * H),
      vinted_view_count: g.entre(8, 70), vinted_favourite_count: g.entre(0, 9),
    });
    const pfs = { vinted: age };
    if (possibles.includes(L) || g.suivant() < 0.35) pfs.leboncoin = Math.max(0.5, age - 0.4);
    if (possibles.includes(E) && g.suivant() < 0.6) pfs.ebay = Math.max(0.5, age - 0.6);
    if (possibles.includes(B)) pfs.beebs = Math.max(0.5, age - 0.5);
    if (possibles.includes(D) && g.suivant() < 0.8) pfs.depop = Math.max(0.4, age - 0.7);
    Object.entries(pfs).forEach(([p, ageP]) => job({
      inventaire_id: f.id, platform: p, created_at: avant(ageP * J), listing_url: URL_DEMO[p](`s${k}`), title: titre, price: pv,
      voie: p === 'ebay' ? 'api' : 'extension',
    }));
  }

  // ── Le vendu à la une : le sweat Red Bull Racing, vendu sur Vinted ────────
  {
    const [cle, titre, marque, type, pv, pa, urls, age, pfs, description] = VENDU;
    const vendu = venteRecente ? 14 * M : 2 * J;
    const f = fiche({
      titre, marque, type, prix_vente: pv, prix_achat: pa, statut: 'vendu', quantite: 0, description, poids_g: POIDS[cle] ?? null,
      date: jour(vendu), date_vente: avant(vendu), created_at: avant(age * J), photos: photos(...urls), plateforme: 'Vinted',
      vinted_item_id: `demo-${cle}`, vinted_status: 'sold', last_synced_at: avant(2 * H),
    });
    parCle[cle] = f;
    // Vinted : l'annonce vendue.
    job({ inventaire_id: f.id, platform: 'vinted', status: 'sold', created_at: avant(pfs.vinted * J), published_at: avant(pfs.vinted * J), listing_url: URL_DEMO.vinted(cle), title: titre, price: pv,
      platform_fields: { sale_signal: 'sold' } });
    // Leboncoin et Depop : déposées par FillSell (preuve) → retirées après la vente.
    for (const p of ['leboncoin', 'depop']) {
      job({ inventaire_id: f.id, platform: p, created_at: avant(pfs[p] * J), listing_url: URL_DEMO[p](cle), title: titre, price: pv });
    }
    if (venteRecente) {
      job({ inventaire_id: f.id, platform: 'depop', action: 'delete', status: 'processing', created_at: avant(vendu - 2 * M),
        updated_at: avant(30 * 1000), listing_url: URL_DEMO.depop(cle), title: titre });
      job({ inventaire_id: f.id, platform: 'leboncoin', action: 'delete', status: 'pending', created_at: avant(vendu - 2 * M - 5000),
        published_at: null, listing_url: URL_DEMO.leboncoin(cle), title: titre });
    } else {
      job({ inventaire_id: f.id, platform: 'depop', action: 'delete', status: 'deleted', created_at: avant(vendu - 40 * M),
        published_at: avant(vendu - 52 * M), updated_at: avant(vendu - 52 * M), listing_url: URL_DEMO.depop(cle), title: titre });
      job({ inventaire_id: f.id, platform: 'leboncoin', action: 'delete', status: 'deleted', created_at: avant(vendu - 40 * M),
        published_at: avant(vendu - 55 * M), updated_at: avant(vendu - 55 * M), listing_url: URL_DEMO.leboncoin(cle), title: titre });
    }
    vente({ titre, marque, type, prix_vente: pv, prix_achat: pa, date: jour(vendu), created_at: avant(vendu), plateforme: 'Vinted',
      inventaire_id: f.id, annonce_id: `demo-${cle}` });
  }

  // ── La file de l'ordinateur (venteRecente) : le sweat Öhlins part sur
  //    Depop et Leboncoin, une annonce après l'autre.
  if (venteRecente) {
    const o = parCle.ohlins;
    job({ inventaire_id: o.id, platform: 'leboncoin', status: 'pending', created_at: avant(9 * M), published_at: null, title: o.titre, price: o.prix_vente });
    job({ inventaire_id: o.id, platform: 'depop', status: 'pending', created_at: avant(9 * M), published_at: null, title: o.titre, price: o.prix_vente });
  }

  // ── Les ventes du semestre ────────────────────────────────────────────────
  // Chaque vente a sa fiche vendue (comme dans l'app : la fiche reste, statut
  // « vendu ») — c'est elle qui donne les jours passés en stock.
  const venteAvecFiche = (joursAvant, titre, marque, type, plateforme, pv, pa, enStock) => {
    const quand = joursAvant * J;
    const f = fiche({
      titre, marque, type, prix_vente: pv, prix_achat: pa, statut: 'vendu', quantite: 0, description: '',
      date: jour(quand), date_vente: avant(quand), created_at: avant(quand + enStock * J + 3 * H), plateforme,
    });
    vente({ titre, marque, type, prix_vente: pv, prix_achat: pa, date: jour(quand), created_at: avant(quand), plateforme, inventaire_id: f.id });
  };
  [...VEDETTES, ...RECENTES].forEach(([joursAvant, titre, marque, type, pf, pv, pa, enStock]) => venteAvecFiche(joursAvant, titre, marque, type, pf, pv, pa, enStock));

  // Le reste, tiré au sort mois par mois (heures de journée, jamais dans les
  // quatre derniers jours, écrits à la main ci-dessus).
  const ici = new Date(maintenant);
  const ecritesCeMois = [...VEDETTES, ...RECENTES].filter(([j]) => new Date(maintenant - j * J).getMonth() === ici.getMonth());
  VENTES_PAR_MOIS.forEach((nb, m) => {
    const debut = new Date(ici.getFullYear(), ici.getMonth() - m, 1, 0, 0, 0).getTime();
    const finMois = new Date(ici.getFullYear(), ici.getMonth() - m + 1, 1, 0, 0, 0).getTime();
    const fin = Math.min(finMois, maintenant - 4 * J);
    if (fin <= debut) return;
    let plateformes;
    if (m === 0) {
      const reste = { ...MIX_MOIS_COURANT };
      ecritesCeMois.forEach(([, , , , pf]) => { reste[pf] -= 1; });
      reste[V] -= 1; // le sweat Red Bull
      plateformes = g.melanger(Object.entries(reste).flatMap(([pf, n]) => Array(Math.max(0, n)).fill(pf)));
    } else {
      plateformes = Array.from({ length: nb }, () => { const x = g.suivant(); let c = 0; for (const [pf, p] of Object.entries(MIX_AVANT)) { c += p; if (x < c) return pf; } return V; });
    }
    for (const pfTire of plateformes) {
      let pf = pfTire;
      let quand = debut + g.suivant() * (fin - debut);
      // Depop : seulement depuis son ouverture.
      if (pf === D) quand = Math.max(debut, maintenant - JOURS_DEPOP * J + 6 * H) + g.suivant() * (fin - Math.max(debut, maintenant - JOURS_DEPOP * J + 6 * H));
      const d = new Date(quand); d.setHours(9 + Math.floor(g.suivant() * 12), Math.floor(g.suivant() * 60), 0, 0);
      quand = Math.min(d.getTime(), maintenant - 4 * J);
      if (pf === D && quand < maintenant - JOURS_DEPOP * J) pf = V;
      const pool = CATALOGUE.filter((c) => c[6].includes(pf));
      const modele = g.choisirPondere(pool.length ? pool : CATALOGUE, poidsDe);
      const [, , marque, type, [pvMin, pvMax], [paMin, paMax]] = modele;
      venteAvecFiche((maintenant - quand) / J, titreLibre(modele), marque, type, pf, g.entre(pvMin, pvMax), g.entre(paMin, paMax), joursEnStock(g));
    }
  });

  // ── La question « Déjà vendu ? » : l'annonce eBay du même nom, importée ───
  // (motif copie_non_prouvee : liée par le seul titre, jamais retirée sans
  // ta réponse — règle du 06/10). Aucun lien affiché (url nulle).
  const inventaire_doublons = [{
    id: uuid('0d3ed0b1', 1), user_id: UID_DEMO, garde: parCle.redbull.id, absorbe: parCle.redbull.id, niveau: 'probable',
    motif: 'copie_non_prouvee', statut: 'proposee', created_at: avant(venteRecente ? 12 * M : 2 * J - 30 * M),
    preuves: { platform: 'ebay', vendu_sur: 'vinted', titre: parCle.redbull.titre, annonce_id: uuid('0d3eaaaa', 1), url: null },
  }];

  // ── Les relevés déjà faits (la carte « Synchronisé il y a … ») ────────────
  const enStock = new Set(inventaire.filter((i) => i.statut === 'stock').map((i) => i.id));
  const enLigne = (p) => jobs.filter((j) => j.platform === p && j.action === 'publish' && j.status === 'published' && enStock.has(j.inventaire_id)).length;
  const run = (platform, kind, il, vus) => ({
    id: `run-demo-${platform}-${kind}`, user_id: UID_DEMO, platform, kind, status: 'done', declencheur: 'bouton',
    queued_at: avant(il + 60000), started_at: avant(il + 50000), finished_at: avant(il), updated_at: avant(il), progres_le: avant(il),
    erreur: null, items_vus: vus, items_crees: 0, items_maj: 0, total_entries: vus, total_pages: 1, page_suivante: null,
    vinted_login: null, vinted_user_id: null,
  });
  const vinted_sync_runs = [
    run('vinted', 'dressing', 2 * H, enLigne('vinted')),
    run('leboncoin', 'annonces', 2 * H + 3 * M, enLigne('leboncoin')),
    run('ebay', 'annonces', 2 * H + 4 * M, enLigne('ebay') + 1),
    run('beebs', 'annonces', 2 * H + 5 * M, enLigne('beebs')),
    run('depop', 'annonces', 2 * H + 6 * M, enLigne('depop')),
  ];

  const profil = {
    id: UID_DEMO, email: EMAIL_DEMO, is_premium: true, is_pro: true, is_business: false,
    extension_last_seen_at: avant(70 * 1000), extension_version: '0.6.105', extension_build: '0.6.105-8f88cdd',
    vinted_sync_pin: null, beta_flags: { depop: true }, extension_sessions: {},
    platform_settings: { plateformes_vendeur: [...PLATEFORMES_DEMO] },
  };

  const items = inventaire.filter((r) => r.fusionne_dans == null).map(mapItem);
  const sales = ventes.map(mapSale).sort((a, b) => Date.parse(b.date_vente) - Date.parse(a.date_vente));
  const photosParInventaire = Object.fromEntries(inventaire.filter((r) => r.photos).map((r) => [r.id, r.photos]));

  return {
    lu_le: iso(maintenant),
    origine: 'données de DÉMONSTRATION (scripts/apercu/site-donnees-demo.js) — aucune donnée réelle',
    utilisateur: { id: UID_DEMO, email: EMAIL_DEMO },
    prenom: PRENOM_DEMO,
    parCle,
    tables: {
      profiles: [profil],
      inventaire,
      cross_post_jobs: jobs,
      vinted_sync_runs,
      ventes,
      inventaire_doublons,
      annonces_plateforme: [],
      // Le Stock d'aujourd'hui : carte de synchro multiplateforme, republication
      // ouverte (eBay n'est jamais republié), republication automatique par
      // créneaux en service, Depop ouverte (la garde depop_autorise répond oui :
      // l'app la montre comme elle la montrera à tous).
      coin_config: [
        { key: 'sync_multi_ouverte', value: 1 }, { key: 'republication_multi_ouverte', value: 1 },
        { key: 'republish_planifiee_actif', value: 1 }, { key: 'depop_ouvert', value: 1 },
      ],
      fiches_annonce: [],
    },
    rpc: {
      // Aucun chiffre de quota à l'écran (règle du site : aucun quota, nulle part).
      quotas_etat: null,
      annonces_en_rangement: [],
      releves_vides_signales: [],
      depop_autorise: true,
      republish_planifiee_etat_multi: republicationAutoDemo(maintenant),
    },
    items,
    sales,
    photosParInventaire,
  };
}

/** Prochain instant où il sera hh:00 à Paris (pas d'arithmétique de fuseau à la main). */
function prochaineHeureParis(maintenant, heure) {
  const heureParis = (ms) => Number(new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }));
  let t = Math.ceil(maintenant / H) * H;
  for (let k = 0; k < 48 && heureParis(t) !== heure; k += 1) t += H;
  return t;
}

/**
 * La republication automatique par créneaux : la forme de
 * republish_planifiee_etat_multi. Soir 19 h – 22 h, tous les jours, annonces
 * en ligne depuis plus de 14 jours — sur PLATEFORMES_REPUBLICATION_AUTO
 * (jamais eBay). Aucun quota mensuel servi : aucun chiffre de quota à l'écran.
 * ⚠️ L'app du 09/10 ne lit que vinted / leboncoin / beebs / opla
 * (src/hooks/useRepublicationPlanifiee.js : PLATEFORMES_PLANIFIEES) : l'entrée
 * Depop est servie, l'écran ne la montre que le jour où l'app la lit.
 */
export function republicationAutoDemo(maintenant = Date.now()) {
  const debut = prochaineHeureParis(maintenant, 19);
  const reglage = { creneau: 'soir', de: '19:00', a: '22:00', jours: [1, 2, 3, 4, 5, 6, 7], plafond_jour: 10, age_jours: 14, ordre: 'anciennes', fuseau: 'Europe/Paris' };
  const attendus = { vinted: 4, leboncoin: 3, beebs: 2, depop: 2 };
  const pf = (platform) => ({
    platform, actif: true, autorise: true, ouverte: true, configure: true, palier: 'pro', reglage,
    fenetre: { dans_creneau: false, prochain_debut: iso(debut), prochain_fin: iso(debut + 3 * H) },
    attendu: attendus[platform] ?? 1, borne: 'eligibles', eligibles: { total: attendus[platform] ?? 1 }, dernier_creneau: null, moteur: 'planifie',
  });
  const plateformes = PLATEFORMES_REPUBLICATION_AUTO.filter((p) => p !== 'ebay').map(pf);
  return { autorise: true, palier: 'pro', actives: plateformes.length, enveloppe: null, plateformes };
}

/** Le résultat Lens du t-shirt Picture « Climate Change » (forme lens-analysis). */
export function resultatLensDemo() {
  return {
    objet: 't-shirt',
    objet_source: 'lu',
    titre: 'T-shirt Picture gris imprimé ours « Climate Change »',
    famille: 'mode',
    categorie: 'Mode',
    marque: 'Picture',
    modele: null,
    matiere: 'Coton',
    couleur: 'Gris chiné',
    etat_estime: 'Très bon état',
    description:
      "T-shirt Picture Organic Clothing gris chiné, col rond et manches courtes, grand imprimé ours polaire "
      + "« Climate Change — Be responsible » sur le devant. L'imprimé est net, sans craquelure ; le tissu ne présente "
      + "ni tache ni bouloche. Petite étiquette de la marque en bas du devant. Taille S, coupe droite, "
      + "se porte aussi bien seul que sous une chemise "
      + "ouverte. Marque engagée : coton biologique, encres à base d'eau. Envoi soigné, plié sous pochette.",
    // Ce que Lens a lu sur la photo et l'étiquette (forme du serveur, clés connues de LensIdentite).
    attributs_visibles: { motif: 'ours polaire « Climate Change — Be responsible »', coupe: 'col rond, manches courtes', taille: 'S (étiquette du col)', composition: '100 % biologique', saison: 'Toutes saisons' },
    prix_achat_suggere: 4,
    prix_vente_suggere: 14,
    fourchette_min: 11,
    fourchette_max: 18,
    fourchette_marche: { bas: 10, moyen: 14, haut: 19 },
    annonces_marche: [
      { titre: 'T-shirt Picture Organic gris imprimé', prix: 15, plateforme: 'Vinted' },
      { titre: 'Tee-shirt Picture ours polaire', prix: 13, plateforme: 'Vinted' },
      { titre: 'T-shirt Picture Organic Clothing taille S', prix: 12, plateforme: 'Vinted' },
      { titre: 'Picture Organic t-shirt gris', prix: 16, plateforme: 'eBay' },
      { titre: 'T-shirt Picture imprimé ours', prix: 14, plateforme: 'Leboncoin' },
    ],
    vitesse_vente: 'rapide',
    vitesse_vente_explication: 'Marque de surf et de montagne recherchée, imprimé engagé : les t-shirts en bon état partent vite.',
    plateformes: ['Vinted', 'Leboncoin', 'eBay', 'Depop'],
    conseils: [
      "Photographier l'étiquette de taille et de composition",
      "Montrer l'imprimé de près : il est intact",
    ],
    confiance: 'moyenne',
    notes: "Prix établi à partir d'annonces comparables de la même marque.",
    est_vendu: false,
    annonce: { platforms: { vinted: {}, leboncoin: {}, ebay: {}, beebs: {}, depop: {} } },
  };
}

/** Sommes de contrôle utiles aux assertions et aux textes des captures. */
export function chiffresDemo(d, maintenant = Date.now()) {
  const ici = new Date(maintenant);
  const ventes = d.tables.ventes;
  const duMois = ventes.filter((v) => { const x = new Date(`${v.date}T12:00:00`); return x.getMonth() === ici.getMonth() && x.getFullYear() === ici.getFullYear(); });
  const somme = (l, k) => l.reduce((a, v) => a + v[k], 0);
  const parPf = {};
  for (const v of duMois) { const p = (parPf[v.plateforme] ||= { n: 0, ca: 0, benefice: 0 }); p.n += 1; p.ca += v.prix_vente; p.benefice += v.benefice; }
  const stock = d.items.filter((i) => i.statut === 'stock');
  return {
    nbVentes: ventes.length, ca: somme(ventes, 'prix_vente'), benefice: somme(ventes, 'benefice'),
    mois: { n: duMois.length, ca: somme(duMois, 'prix_vente'), benefice: somme(duMois, 'benefice'), parPlateforme: parPf },
    nbStock: stock.length, investiStock: stock.reduce((a, i) => a + (i.prix_achat ?? 0), 0),
  };
}

/** « Vinted, Leboncoin, Beebs et Depop » / « Vinted, Leboncoin, Beebs and Depop ». */
export function listeNoms(codes, lang = 'fr') {
  const n = codes.map((c) => NOMS_PF[c] ?? c);
  if (n.length < 2) return n.join('');
  return `${n.slice(0, -1).join(', ')} ${lang === 'en' ? 'and' : 'et'} ${n[n.length - 1]}`;
}
