// Le scénario des maquettes de l'étape 2 du lot (25/10/2026, nuit) — voir
// src/pages/MaquettesLot.jsx. Aucun titre, prix, texte ni photo d'un compte
// ici : seulement des identifiants de fiches et des états SIMULÉS ; le reste
// est lu avec la session de Nico (ou posé par l'outil d'aperçu).
import { urlPhoto } from "../utils/photos";

export const TAILLES_BEEBS_ENFANT = ["Prématuré (- de 45 cm)", "Naissance - 0 mois (45-50 cm)", "1 mois (50-54 cm)", "3 mois (54-60 cm)", "6 mois (60-66 cm)", "9 mois (67-74 cm)", "12 mois (74-80 cm)", "18 mois (80-86 cm)", "24 mois (86-94 cm)", "3 ans (94-102 cm)", "4 ans (102-108 cm)", "5 ans (108-116 cm)", "6 ans (116-123 cm)", "7 ans (123-128 cm)", "8 ans (123-128 cm)", "9 ans (128-132 cm)", "10 ans (128-140 cm)", "12 ans (140-152 cm)", "14 ans (152-164 cm)", "16 ans (164-176 cm)"];
export const AGES_BEEBS = ["0-6 mois", "6-12 mois", "12-24 mois", "2 ans - 3 ans", "3 ans - 4 ans", "4 ans - 6 ans", "6 ans - 8 ans", "8 ans - 12 ans", "12 ans - 16 ans", "16 ans et +"];
export const PRODUITS_LBC_COLLECTION = ["Affiches de cinéma", "Autographe", "Cartes postales", "Drapeau", "Figurines", "Image et sticker", "Jeux de cartes", "Kinder surprise", "Miniatures / Véhicules", "Objet publicitaire", "Pichet et verres", "Pièce et billet", "Pins", "Porcelaine", "Poupée et accessoires de poupée", "Timbre", "Autre"];
// La liste Vinted des modèles, TOUTES marques (la maquette en montre un extrait).
export const MODELES_VINTED = [
  ["Samsung", "Galaxy S20"], ["Samsung", "Galaxy S20 FE"], ["Samsung", "Galaxy S21"], ["Samsung", "Galaxy S21 FE"], ["Samsung", "Galaxy S22"],
  ["Samsung", "Galaxy A12"], ["Samsung", "Galaxy A32"], ["Samsung", "Galaxy A52"], ["Samsung", "Galaxy A53 5G"], ["Samsung", "Galaxy Note 10"],
  ["Apple", "iPhone 11"], ["Apple", "iPhone 12"], ["Apple", "iPhone 13"], ["Apple", "iPhone 14"], ["Xiaomi", "Redmi Note 10"], ["Google", "Pixel 6"],
];

// Le lot simulé : 32 articles du stock de Nico, avec les 11 questions que son
// lot du 25/10 a affichées à 20:59 (usage_logs, champ_requis_bloquant) et le
// rayon Beebs du robot. `questions` = ce qui reste à répondre, en un geste ;
// `poses` = ce que FillSell a répondu seul parce qu'une source fiable existe
// (ou qu'une seule réponse est possible) — dit dans la feuille, jamais demandé.
export const SCENARIO = [
  // Q1 + Q2 — téléphone : Modèle (toute la liste Vinted, cherchée) et Espace de stockage.
  { id: "1789543962463007", pfs: ["vinted", "leboncoin", "ebay"], texteFillSell: true, questions: [
    { cle: "modele", pfs: ["vinted"], label: "Modèle", type: "recherche", marque: "Samsung" },
    { cle: "stockage", pfs: ["vinted"], label: "Espace de stockage", type: "puces", valeurs: ["32 Go", "64 Go", "128 Go", "256 Go", "512 Go"] },
  ] },
  // Q5 — gants de ski enfant : Taille Beebs (rayon Bonnets, écharpes et gants garçon), aucune taille écrite.
  { id: "1791722670101", pfs: ["vinted", "beebs", "leboncoin"], questions: [
    { cle: "taille", pfs: ["beebs"], label: "Taille", type: "puces", valeurs: ["3 ans", "4 ans", "5 ans", "6 ans", "8 ans", "10 ans", "12 ans"], tout: TAILLES_BEEBS_ENFANT },
  ] },
  // Q6 + Q7 — « Scotch » (Scotch & Soda, taille L) : UNE question pour Vinted et Beebs, une fois rangé en mode.
  { id: "1791529881411", pfs: ["vinted", "beebs", "depop"], questions: [
    { cle: "genre", pfs: ["vinted", "beebs"], label: "Pour qui", type: "puces", valeurs: ["Homme", "Femme"], note: "Une réponse pour Vinted et Beebs." },
  ] },
  // Q9 — bobines Super 8 : Produit Leboncoin (Collection).
  { id: "1790285965307", pfs: ["leboncoin", "ebay", "vinted"], questions: [
    { cle: "produit", pfs: ["leboncoin"], label: "Produit", type: "puces", valeurs: ["Autre", "Objet publicitaire", "Affiches de cinéma"], tout: PRODUITS_LBC_COLLECTION },
  ] },
  // Q10 — Pentax K1000 : Produit Leboncoin (Photo, audio & vidéo).
  { id: "1792077671052", pfs: ["vinted", "leboncoin", "ebay"], questions: [
    { cle: "produit", pfs: ["leboncoin"], label: "Produit", type: "puces", valeurs: ["Appareil photo", "Objectif", "Accessoire photo", "Autres"] },
  ] },
  // Q11 — Le Meilleur des mondes : Âge Beebs (Livres › Autres livres).
  { id: "1789406567181004", pfs: ["vinted", "beebs", "leboncoin"], questions: [
    { cle: "age", pfs: ["beebs"], label: "Âge", type: "puces", valeurs: ["16 ans et +", "12 ans - 16 ans", "8 ans - 12 ans"], tout: AGES_BEEBS },
  ] },
  // Le rayon Beebs du robot : jamais un champ vide.
  { id: "1790420994622", pfs: ["vinted", "leboncoin", "beebs", "ebay"], questions: [
    { cle: "rayon", pfs: ["beebs"], label: "Rayon", type: "rayon", note: "Beebs n'a aucun rayon pour un aspirateur.", valeurs: [], conseilPas: true },
  ] },
  // Textes écrits par FillSell (rien d'autre à faire)
  { id: "1785575885276", pfs: ["vinted", "ebay", "leboncoin", "depop"], texteFillSell: true, questions: [] },
  { id: "1785444834689", pfs: ["vinted", "ebay", "leboncoin"], texteFillSell: true, questions: [] },
  { id: "1791800000003", pfs: ["vinted", "ebay", "depop"], texteFillSell: true, questions: [] },
  // Prêts — dont Q3, Q4 et Q8, posées seules.
  { id: "1788197043601", pfs: ["vinted", "leboncoin", "ebay"], questions: [], poses: [{ pf: "vinted", label: "ISBN", valeur: "Ce livre n'a pas d'ISBN", pourquoi: "la seule réponse que Vinted accepte ici" }] },
  { id: "1790885795579", pfs: ["vinted", "beebs", "ebay", "leboncoin"], questions: [], poses: [{ pf: "beebs", label: "Taille", valeur: "Taille unique", pourquoi: "aucune taille de boîtier n'est écrite" }] },
  { id: "1791730353942", pfs: ["vinted", "leboncoin", "ebay"], questions: [], poses: [{ pf: "leboncoin", label: "Rayon", valeur: "Électronique › Jeux vidéo", pourquoi: "ta description dit « jeu vidéo pour PlayStation 4 » : plus de « Produit » à choisir" }] },
  { id: "1785871917724000", pfs: ["vinted", "ebay", "depop"], questions: [] },
  { id: "1785871917724001", pfs: ["vinted", "ebay", "depop"], questions: [] },
  { id: "1785871917724004", pfs: ["vinted", "ebay", "leboncoin", "depop"], questions: [] },
  { id: "1785871917724003", pfs: ["vinted", "ebay", "depop"], questions: [] },
  { id: "1785871917724005", pfs: ["vinted", "ebay", "depop"], questions: [] },
  { id: "1789676224963", pfs: ["vinted", "leboncoin", "beebs"], questions: [] },
  { id: "1791021432548", pfs: ["vinted", "beebs", "ebay"], questions: [] },
  { id: "1789676272841", pfs: ["vinted", "beebs", "ebay"], questions: [] },
  { id: "1790963950815", pfs: ["vinted", "leboncoin", "ebay", "beebs"], questions: [] },
  { id: "1790963919791", pfs: ["vinted", "leboncoin", "ebay"], questions: [] },
  { id: "1791722586985", pfs: ["vinted", "leboncoin", "ebay"], questions: [] },
  { id: "1788371248523", pfs: ["vinted", "leboncoin", "ebay"], questions: [] },
  { id: "1789543962463008", pfs: ["vinted", "leboncoin"], questions: [] },
  { id: "1789543962463009", pfs: ["vinted", "leboncoin"], questions: [] },
  { id: "1789543962463010", pfs: ["vinted", "leboncoin"], questions: [] },
  { id: "1789543962463006", pfs: ["vinted", "ebay", "leboncoin", "depop"], questions: [] },
  { id: "1789543962463011", pfs: ["vinted", "beebs", "ebay", "depop"], questions: [] },
  { id: "1792935319552000", pfs: ["vinted", "leboncoin"], questions: [] },
  { id: "1792257905547", pfs: ["vinted", "ebay"], questions: [] },
];
export const IDS_MAQUETTE = SCENARIO.map((s) => s.id);

// Les articles réels (lus avec la session de Nico) mariés au scénario.
export function marierScenario(lignes) {
  const parId = new Map((lignes ?? []).map((l) => [String(l.id), l]));
  return SCENARIO.filter((s) => parId.has(s.id)).map((s) => {
    const l = parId.get(s.id);
    const photos = Array.isArray(l.photos) ? l.photos : [];
    return { ...s, titre: l.titre || "Article sans titre", prix: l.prix_vente != null ? Number(l.prix_vente) : null, description: l.description ?? "", photo: photos.length ? urlPhoto(photos[0]) : null };
  });
}
