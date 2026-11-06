// ═══════════════════════════════════════════════════════════════════════════
// LES TEXTES DE L'EXPORT EXCEL, DANS LA LANGUE DE L'APP (06/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// (Lot « Ouverture du Cloud », phase 3 — décision de Nico) L'export Excel (App.jsx, handleExport) écrivait ses
// en-têtes, ses noms de feuilles et ses mois en français pour tout le monde. En anglais : en-têtes de colonnes,
// feuilles (mois, récapitulatif, inventaire), format des dates et titre du partage en anglais. Les DONNÉES de la
// personne (titre, marque, catégorie, description, emplacement) ne se traduisent jamais. En français, chaque texte
// est mot pour mot celui d'avant (scripts/export-et-canal-anglais-selftest.mjs le compare aux textes du 05/11).
const TEXTES = {
  fr: Object.freeze({
    mois: Object.freeze(['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']),
    colonnesVentes: Object.freeze(['Nom', 'Marque', 'Catégorie', 'Description', 'Quantité', 'Prix achat', 'Frais', 'Prix vente', 'Bénéfice', 'Marge %', 'Emplacement', 'Date vente']),
    colonnesRecap: Object.freeze(['Mois', 'Nb ventes', 'CA total (€)', 'Bénéfice total (€)', 'Marge moyenne (%)']),
    feuilleRecap: 'Récapitulatif',
    colonnesInventaire: Object.freeze(['Nom', 'Marque', 'Catégorie', 'Description', 'Quantité', 'Prix achat unit.', 'Total investi', 'Emplacement', 'Date ajout']),
    feuilleInventaire: 'Inventaire',
    locale: 'fr-FR',
    titrePartage: 'Export FillSell',
  }),
  en: Object.freeze({
    mois: Object.freeze(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']),
    colonnesVentes: Object.freeze(['Name', 'Brand', 'Category', 'Description', 'Quantity', 'Purchase price', 'Fees', 'Sale price', 'Profit', 'Margin %', 'Location', 'Sale date']),
    colonnesRecap: Object.freeze(['Month', 'Sales', 'Total revenue (€)', 'Total profit (€)', 'Average margin (%)']),
    feuilleRecap: 'Summary',
    colonnesInventaire: Object.freeze(['Name', 'Brand', 'Category', 'Description', 'Quantity', 'Unit purchase price', 'Total invested', 'Location', 'Date added']),
    feuilleInventaire: 'Inventory',
    locale: 'en-GB',
    titrePartage: 'FillSell export',
  }),
};

/** Les textes de l'export pour `lang` ('en' → anglais ; toute autre valeur → le français d'avant). */
export function textesExport(lang = 'fr') {
  return TEXTES[lang === 'en' ? 'en' : 'fr'];
}
