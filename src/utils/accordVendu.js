// Accord du participe « Vendu(e) » : noms féminins courants détectés dans le
// titre (même pattern mots-clés que detectObjectIcon). Masculin par défaut.
// Sorti de VentesTab le 16/10 : le Tableau (« Activité récente ») dit aussi
// « Vendue · Vinted » pour une bouilloire.
const FEM_RE = /\b(robe|jupe|veste|chemise|blouse|doudoune|parka|combinaison|salopette|tunique|écharpe|casquette|ceinture|montre|bague|chaussures?|baskets?|bottes?|bottines?|sandales?|espadrilles?|ballerines?|chaussettes?|pochette|sacoche|valise|poupée|peluche|figurine|guitare|trompette|flûte|batterie|enceinte|tablette|imprimante|souris|console|télé|télévision|lampe|table|chaise|armoire|commode|étagère|bibliothèque|cafetière|bouilloire|machine|friteuse|perceuse|visseuse|scie|ponceuse|meuleuse|tondeuse|trottinette|raquette|tente|planche|palette|crème|poussette|cartes?|pièces?|assiettes?|tasses?|casserole|poêle|couette|parure|lunettes?|paire)\b/i;

export const motVendu = (title, lang) => (lang === 'en' ? 'Sold' : (FEM_RE.test(title || '') ? 'Vendue' : 'Vendu'));

// « 15 oct. », « 2 févr. 2024 » (l'année seulement si ce n'est pas l'année en cours).
const MOIS_COURTS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_COURTS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MOIS_LONGS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
export const MOIS_LONGS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function jourCourt(valeur, lang = 'fr', maintenant = new Date()) {
  const brut = String(valeur ?? '');
  const d = /^\d{4}-\d{2}-\d{2}$/.test(brut) ? new Date(`${brut}T12:00:00`) : new Date(brut);
  if (!Number.isFinite(d.getTime())) return null;
  const mois = (lang === 'en' ? MOIS_COURTS_EN : MOIS_COURTS_FR)[d.getMonth()];
  const annee = d.getFullYear() === maintenant.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return lang === 'en' ? `${mois} ${d.getDate()}${annee}` : `${d.getDate()} ${mois}${annee}`;
}
