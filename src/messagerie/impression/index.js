// BORDEREAUX — partage et impression (bêta, 16/10/2026). Entrée LÉGÈRE : les
// écrans et le partage. Le moteur (pdf.js, pdf-lib) ne se charge qu'à
// l'ouverture d'un aperçu ou de « Tout imprimer » (import dynamique).
export { default as ApercuBordereau } from './ApercuBordereau.jsx';
export { default as ToutImprimer, BoutonToutImprimer } from './ToutImprimer.jsx';
export { default as CodeDepot } from './CodeDepot.jsx';
export { partager, imprimer, telechargerFichier, voies, environnement } from './partage.js';
export { chargerCopieBordereau, recadrageRetenu, retenirRecadrage } from './copies.js';
export { nomFichier, genreFichier, PAGE_10X15 } from './geometrie.js';
