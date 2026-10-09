// =====================================================================
// VARIANTE SITE (09/10/2026) — DONNÉES DE DÉMONSTRATION, compte « Camille »
// AUCUNE donnée réelle : ni compte de Nico, ni client, ni pseudo, ni numéro
// d'annonce. Mêmes chiffres et mêmes photos que les captures du site
// (fill-and-sell-seo : scripts/apercu/site-donnees-demo.js, site/medias/captures/,
// docs/seo/briefs/captures.md § 1). Photos : photos produit libres
// (public/landing/*.webp du dépôt), copiées dans public/articles/.
// Écrans : découpes des captures « Camille » (site/medias/captures/*.png),
// copiées dans public/ecrans/ par docs/seo/briefs/video-variante-site/preparer.mjs.
// Jamais présenté comme le résultat d'un client ni comme une promesse de gains :
// la vidéo porte « Compte de démonstration · chiffres fictifs » et « Données de
// démonstration ».
// =====================================================================
import {getInputProps} from 'remotion';

export type PlatKey = 'vinted' | 'leboncoin' | 'ebay' | 'beebs' | 'depop';

// Les cinq plateformes présentées partout (ordre du site : {PUB}).
export const PLATEFORMES: PlatKey[] = ['vinted', 'leboncoin', 'ebay', 'beebs', 'depop'];

// ⛔ REPUBLICATION AUTOMATIQUE — UN SEUL GESTE (décision 2 de Nico, 09/10).
// Version A : Vinted, Leboncoin, Beebs et Depop. Version B (republication automatique
// Depop pas encore active) : retirer 'depop' de cette ligne — ou rendre avec
// `--props='{"repubAuto":["vinted","leboncoin","beebs"]}'` (rendu.cjs ... B).
// eBay n'y entre JAMAIS (pas de republication chez eBay : on n'en parle pas).
const REPUB_AUTO_DEFAUT: PlatKey[] = ['vinted', 'leboncoin', 'beebs', 'depop'];
const props = getInputProps() as {repubAuto?: PlatKey[]};
export const REPUB_AUTO: PlatKey[] = (props.repubAuto ?? REPUB_AUTO_DEFAUT).filter((k) => k !== 'ebay');

export const NOMS: Record<PlatKey, string> = {vinted: 'Vinted', leboncoin: 'Leboncoin', ebay: 'eBay', beebs: 'Beebs', depop: 'Depop'};
// « Vinted, Leboncoin, Beebs et Depop » — la liste dite en toutes lettres.
export const listeNoms = (ks: PlatKey[]) => {
  const n = ks.map((k) => NOMS[k]);
  return n.length < 2 ? n.join('') : `${n.slice(0, -1).join(', ')} et ${n[n.length - 1]}`;
};

// L'article de l'histoire : le sweat Red Bull Racing — l'article VENDU sur Vinted dans
// les captures du site (site-donnees-demo.js : VENDU, 38 €, prix d'achat 11 €).
export const VEDETTE = {
  photo: 'articles/sweat-redbull.webp',
  titre: 'Sweat à capuche Red Bull Racing gris, taille M',
  marque: 'Pepe Jeans',
  description:
    'Sweat à capuche gris Red Bull Racing, collection Pepe Jeans : logos imprimés sur la poitrine, poche kangourou, capuche à cordon. Très bon état, taille M.',
  etat: 'Très bon état',
  couleur: 'Gris',
  matiere: 'Coton',
  categorie: 'Mode',
  taille: 'M (étiquette du col)',
  prix: 38,
  prixAchat: 11,
  // « basé sur N annonces (min – max) » : comme l'écran Lens de l'app.
  comparables: {n: 6, min: 32, max: 45},
};

// SCÈNE « REMONTER » — annonces de Camille (site-donnees-demo.js : ARTICLES), de la plus
// récente (en haut) à la plus ancienne (en bas). `pf` = où l'annonce est en ligne ; la scène
// n'affiche que les plateformes de REPUB_AUTO (jamais eBay ; sans Depop en version B).
export const REPUB_ROWS: {photo: string; titre: string; prix: number; jours: number; pf: PlatKey[]}[] = [
  {photo: 'articles/sweat-ohlins.webp', titre: 'Sweat à capuche Öhlins noir, taille L', prix: 34, jours: 15, pf: ['vinted']},
  {photo: 'articles/short-polo.webp', titre: 'Short de bain Polo Ralph Lauren blanc, taille M', prix: 35, jours: 22, pf: ['depop', 'leboncoin', 'vinted']},
  {photo: 'articles/chaussures-cyrillus.webp', titre: 'Bottines cuir Cyrillus enfant, pointure 24', prix: 29, jours: 27, pf: ['leboncoin', 'beebs', 'vinted']},
  {photo: 'articles/casquette-volcom.webp', titre: 'Casquette Volcom beige brodée', prix: 15, jours: 31, pf: ['leboncoin', 'vinted']},
  {photo: 'articles/tshirt-graphique.webp', titre: 'T-shirt Picture noir imprimé surf, taille M', prix: 16, jours: 35, pf: ['depop', 'leboncoin', 'vinted']},
];

// SCÈNE « SYNCHRONISER » — le stock de Camille (captures du site : « Synchronisé · 90
// annonces » ; Vinted 41, Leboncoin 24, eBay 5, Beebs 10, Depop 10).
export const SYNCHRO: {k: PlatKey; n: number}[] = [
  {k: 'vinted', n: 41},
  {k: 'leboncoin', n: 24},
  {k: 'ebay', n: 5},
  {k: 'beebs', n: 10},
  {k: 'depop', n: 10},
];

// SCÈNE « LE MOIS DE CAMILLE » — chiffres lus sur les captures (captures.json :
// chiffres_du_compte) : 62 ventes, 1 268 € de profit ce mois ; Vinted 31, Leboncoin 10,
// Depop 8, Beebs 7, eBay 6 ; meilleures ventes parties en 1 à 3 jours.
export const MOIS = {profit: 1268, ventes: 62};

export const euro = (n: number) => (Number.isInteger(n) ? `${n} €` : `${n.toFixed(2).replace('.', ',')} €`);
// « 1 268 » avec l'espace insécable des milliers (comme l'app).
export const milliers = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
