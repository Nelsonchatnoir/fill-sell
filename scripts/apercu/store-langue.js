// Module d'aperçu (visuels des stores, 06/11/2026), jamais livré.
// ═══════════════════════════════════════════════════════════════════════════
// LA LANGUE DES VISUELS DES STORES — ?lang=fr (défaut) | ?lang=en
// ═══════════════════════════════════════════════════════════════════════════
// Les harnais store-*.jsx montent les VRAIS composants avec le compte de
// démonstration « Camille » (site-donnees-demo.js, aucune donnée réelle).
// En anglais, deux adaptations des DONNÉES (jamais du code de l'app) :
//   · les titres des articles de démonstration en anglais (l'app affiche le
//     titre tel que le vendeur l'a écrit : un vendeur anglophone écrit en anglais) ;
//   · Leboncoin et Beebs (France seulement) n'apparaissent pas : la fiche anglaise
//     ne les met jamais en avant. Leurs ventes passent sur eBay / Vinted, leurs
//     annonces sur eBay (ou disparaissent si l'article y est déjà).
export const LANG = typeof location !== 'undefined' && new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'fr';
export const EN = LANG === 'en';
export const PF_MASQUEES_EN = ['leboncoin', 'beebs'];

// Titres écrits à la main (les articles photographiés, les ventes vedettes et récentes).
const TITRES = {
  'T-shirt Picture gris « Climate Change »': 'Picture grey tee “Climate Change”',
  'T-shirt Picture gris imprimé ours « Climate Change »': 'Picture grey polar bear tee “Climate Change”',
  'T-shirt Patagonia noir logo, taille L': 'Patagonia black logo tee, size L',
  'T-shirt Picture noir imprimé surf, taille M': 'Picture black surf print tee, size M',
  'Casquette Volcom beige brodée': 'Volcom beige embroidered cap',
  'Bottines cuir Cyrillus enfant, pointure 24': 'Cyrillus kids leather boots, EU 24',
  'Short de bain Polo Ralph Lauren blanc, taille M': 'Polo Ralph Lauren white swim shorts, M',
  'Sweat à capuche Öhlins noir, taille L': 'Öhlins black hoodie, size L',
  'Sweat à capuche Red Bull Racing gris, taille M': 'Red Bull Racing grey hoodie, size M',
  'Doudoune The North Face Nuptse 700 noire, taille M': 'The North Face Nuptse 700 puffer, black, M',
  'Veste Carhartt Detroit vintage marron, taille L': 'Carhartt Detroit vintage jacket, brown, L',
  'Appareil photo argentique Olympus OM-1': 'Olympus OM-1 film camera',
  'Survêtement Adidas Originals vintage bleu marine, taille M': 'Adidas Originals vintage tracksuit, navy, M',
  'Lot de 5 bodies Petit Bateau, 12 mois': 'Petit Bateau set of 5 bodysuits, 12 months',
  'Casque Sony WH-1000XM3 noir': 'Sony WH-1000XM3 headphones, black',
  'Sweat Carhartt WIP gris chiné, taille L': 'Carhartt WIP grey marl sweatshirt, L',
  "Jean Levi's 501 vintage bleu clair, W32": "Levi's 501 vintage light blue jeans, W32",
  'Baskets New Balance 550 blanches, 42': 'New Balance 550 white trainers, EU 42',
};

// Le reste (titres tirés du catalogue) : mot à mot, le plus long d'abord.
const MOTS = [
  ['Sweat à capuche', 'Hoodie'], ['Short de bain', 'Swim shorts'], ['Lunettes de soleil', 'Sunglasses'], ['Maillot de football', 'Football shirt'],
  ['Appareil photo argentique', 'Film camera'], ['Combinaison de ski', 'Ski suit'], ['Lampe de bureau', 'Desk lamp'], ['Vase en verre soufflé', 'Blown glass vase'],
  ['Foulard en soie', 'Silk scarf'], ['Pull en maille', 'Knit jumper'], ['Pull marin', 'Breton jumper'], ['Jupe midi', 'Midi skirt'], ['Jean mom', 'Mom jeans'],
  ['Veste en jean', 'Denim jacket'], ['Veste en cuir', 'Leather jacket'], ['Chemise en jean', 'Denim shirt'], ['Ceinture en cuir', 'Leather belt'],
  ['Doudoune légère', 'Light puffer'], ['Doudoune', 'Puffer'], ['Lot de romans', 'Set of novels'], ['Lot de', 'Set of'], ['en poche', 'paperbacks'],
  ['éditions cartonnées', 'hardback editions'], ['tomes', 'volumes'], [' à ', '–'], ['Jeu Cluedo complet', 'Cluedo game, complete'], ['pièces', 'pieces'],
  ['planchettes', 'planks'], ['boîte en bois', 'wooden box'], ['la maison de la plage', 'beach house'], ['le café', 'café'], ['la ferme', 'farm'],
  ['le bateau pirate', 'pirate ship'], ['abat-jour vert', 'green shade'], ['en laiton', 'brass'], ['porcelaine fleurie', 'floral porcelain'],
  ['tasses', 'cups'], ['motif cachemire', 'paisley'], ['imprimé fleuri', 'floral print'], ['années 90', '90s'], ['marine et écru', 'navy and ecru'],
  ['gris chiné', 'grey marl'], ['bleu clair', 'light blue'], ['bleu marine', 'navy'], ['noir délavé', 'washed black'], ['taille', 'size'], ['pointure', 'EU'],
  ['Sweat', 'Sweatshirt'], ['Jean', 'Jeans'], ['Baskets', 'Trainers'], ['Pull', 'Jumper'], ['Chemise', 'Shirt'], ['Robe', 'Dress'], ['Jupe', 'Skirt'],
  ['Trench', 'Trench coat'], ['Manteau', 'Coat'], ['Pyjama', 'Pyjamas'], ['bodies', 'bodysuits'], ['Gilet', 'Cardigan'], ['Casquette', 'Cap'],
  ['Casque', 'Headphones'], ['Survêtement', 'Tracksuit'], ['Bob', 'Bucket hat'], ['Sac', 'Bag'], ['Bottines', 'Boots'], ['Polo', 'Polo'],
  ['mangas', 'manga'], ['BD', 'comics'], ['enfant', 'kids'], ['fille', 'girl'], ['ans', 'yrs'], ['mois', 'months'], ['torsadé', 'cable-knit'],
  ['fleurie', 'floral'], ['portefeuille', 'wrap'], ['plissée', 'pleated'], ['en lin', 'linen'], ['brut', 'raw'], ['brodé', 'embroidered'],
  ['rayée', 'striped'], ['délavée', 'faded'], ['vintage', 'vintage'], ['noires', 'black'], ['noire', 'black'], ['noir', 'black'],
  ['grises', 'grey'], ['grise', 'grey'], ['gris', 'grey'], ['blanches', 'white'], ['blanche', 'white'], ['blanc', 'white'], ['bleues', 'blue'],
  ['bleue', 'blue'], ['bleu', 'blue'], ['beiges', 'beige'], ['marron', 'brown'], ['rouge', 'red'], ['verte', 'green'], ['vert', 'green'],
  ['crème', 'cream'], ['écrues', 'ecru'], ['bordeaux', 'burgundy'], ['kaki', 'khaki'], ['violette', 'purple'], ['jaune', 'yellow'],
  ['ambre', 'amber'], ['écaille', 'tortoiseshell'], ['marine', 'navy'], ['complet', 'complete'], ['imprimé', 'print'], ['cuir', 'leather'],
];
const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RE_MOTS = MOTS.map(([fr, en]) => [new RegExp(fr.startsWith(' ') ? echapper(fr) : `(?<![\\p{L}])${echapper(fr)}(?![\\p{L}])`, 'gu'), en]);
export function titreEn(t) {
  if (typeof t !== 'string' || !t) return t;
  if (TITRES[t]) return TITRES[t];
  let s = t;
  for (const [re, en] of RE_MOTS) s = s.replace(re, en);
  return s;
}

const NOM_VERS = { Leboncoin: 'eBay', Beebs: 'Vinted' };
/** Les données de démonstration, vues par un vendeur anglophone (voir l'en-tête). Mutées sur place et rendues. */
export function adapterDemoEn(D) {
  if (!EN) return D;
  const T = D.tables;
  const titres = (o) => { if (o && typeof o === 'object') { if ('titre' in o) o.titre = titreEn(o.titre); if ('title' in o) o.title = titreEn(o.title); } };
  // Annonces : Leboncoin / Beebs → eBay si l'article n'y est pas déjà, sinon retirées.
  const jobs = [];
  const cle = (j, p) => `${j.inventaire_id}|${p}|${j.action}`;
  const pris = new Set(T.cross_post_jobs.filter((j) => !PF_MASQUEES_EN.includes(j.platform)).map((j) => cle(j, j.platform)));
  for (const j of T.cross_post_jobs) {
    if (PF_MASQUEES_EN.includes(j.platform)) {
      if (j.platform === 'beebs' || pris.has(cle(j, 'ebay'))) continue;
      pris.add(cle(j, 'ebay'));
      j.platform = 'ebay';
      if (j.listing_url) j.listing_url = j.listing_url.replace(/^https:\/\/www\.leboncoin\.fr\/ad\/vetements\//, 'https://www.ebay.com/itm/');
    }
    titres(j);
    jobs.push(j);
  }
  T.cross_post_jobs = jobs;
  T.vinted_sync_runs = T.vinted_sync_runs.filter((r) => !PF_MASQUEES_EN.includes(r.platform));
  for (const v of T.ventes) { titres(v); if (NOM_VERS[v.plateforme]) v.plateforme = NOM_VERS[v.plateforme]; }
  for (const i of T.inventaire) titres(i);
  for (const d of T.inventaire_doublons ?? []) if (d.preuves) d.preuves.titre = titreEn(d.preuves.titre);
  for (const p of T.profiles) if (p.platform_settings?.plateformes_vendeur) p.platform_settings.plateformes_vendeur = p.platform_settings.plateformes_vendeur.filter((x) => !PF_MASQUEES_EN.includes(x));
  const etat = D.rpc?.republish_planifiee_etat_multi;
  if (etat?.plateformes) { etat.plateformes = etat.plateformes.filter((p) => !PF_MASQUEES_EN.includes(p.platform)); etat.actives = etat.plateformes.length; }
  for (const i of D.items) titres(i);
  for (const s of D.sales) { titres(s); if (NOM_VERS[s.plateforme]) s.plateforme = NOM_VERS[s.plateforme]; }
  for (const k of Object.keys(D.parCle ?? {})) titres(D.parCle[k]);
  return D;
}

/** Le résultat Lens de démonstration, en anglais (même forme). */
export function lensEn(r) {
  if (!EN) return r;
  return {
    ...r,
    titre: 'Picture grey polar bear tee “Climate Change”',
    matiere: 'Cotton', couleur: 'Grey marl', etat_estime: 'Very good condition',
    description: 'Picture Organic Clothing tee in grey marl, crew neck and short sleeves, large polar bear print '
      + '“Climate Change — Be responsible” on the front. The print is sharp, no cracking; no stains or pilling. '
      + 'Small brand label at the bottom of the front. Size S, regular fit. Organic cotton, water-based inks. '
      + 'Carefully packed and shipped.',
    attributs_visibles: { motif: 'polar bear “Climate Change — Be responsible”', coupe: 'crew neck, short sleeves', taille: 'S (neck label)', composition: '100% organic', saison: 'All seasons' },
    annonces_marche: [
      { titre: 'Picture Organic grey printed tee', prix: 15, plateforme: 'Vinted' },
      { titre: 'Picture polar bear t-shirt', prix: 13, plateforme: 'Vinted' },
      { titre: 'Picture Organic Clothing tee size S', prix: 12, plateforme: 'Depop' },
      { titre: 'Picture Organic t-shirt grey', prix: 16, plateforme: 'eBay' },
      { titre: 'Picture bear print tee', prix: 14, plateforme: 'eBay' },
    ],
    vitesse_vente_explication: 'A sought-after surf and mountain brand with a committed print: tees in good condition sell fast.',
    plateformes: ['Vinted', 'eBay', 'Depop'],
    conseils: ['Photograph the size and composition label', 'Show the print up close: it is intact'],
    notes: 'Price based on comparable listings from the same brand.',
    annonce: { platforms: { vinted: {}, ebay: {}, depop: {} } },
  };
}
