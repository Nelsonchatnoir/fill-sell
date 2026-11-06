// ═══════════════════════════════════════════════════════════════════════════
// VINTED : LE CHEMIN DE CATÉGORIE SELON L'ARBRE RÉEL DU COMPTE (06/11, décision de Nico, point 4)
// ═══════════════════════════════════════════════════════════════════════════
// Vinted bascule son arbre COMPTE PAR COMPTE (mesuré le 06/11 sur 48 h : 6 comptes republiaient encore avec l'ancien
// arbre, 7 avec le nouveau) : « Femmes / Hommes / Enfants > … > Accessoires » est devenu la racine « Accessoires de mode »
// (sans genre), sacs et chapeaux remontés d'un niveau. Un chemin de l'autre arbre échoue au formulaire (Jean-Luc
// LASSARAT : « Vinted ne propose pas « Accessoires » »).
// LA RÈGLE (get-pending-jobs, publication Vinted servie) : l'arbre du compte se LIT dans ce que Vinted lui a montré —
// les identifiants de catégorie lus par ses republications (formulaire d'édition, 30 jours) et ses refus « Vinted ne
// propose pas « Accessoires » / « Accessoires de mode » » ; le plus récent l'emporte. Arbre connu → le chemin est
// traduit vers SON arbre par la table ci-dessous (même identifiant pour les rayons déplacés ; même libellé pour les
// accessoires, renommages de Vinted compris) ; arbre inconnu, chemin sans équivalent ou genre inconnu → rien ne change
// (l'extension pose alors la question avec les vrais rayons du compte). Aucune régression pour un compte basculé.
// Table générée le 06/11 des deux relevés (docs/vinted-catalog-tree.txt du 09/09 et du 06/11). Pur (Deno + Node + Vite).

/** [chemin de l'ancien arbre, chemin du nouvel arbre] — accessoires (même libellé) et rayons déplacés (même id). */
export const PAIRES_ARBRES_VINTED = Object.freeze([
  ["Femmes > Accessoires > Bandanas et foulards pour cheveux", "Accessoires de mode > Bandanas et foulards"],
  ["Femmes > Accessoires > Ceintures", "Accessoires de mode > Ceintures"],
  ["Femmes > Accessoires > Gants", "Accessoires de mode > Gants"],
  ["Femmes > Accessoires > Accessoires pour cheveux", "Accessoires de mode > Accessoires pour cheveux"],
  ["Femmes > Accessoires > Mouchoirs de poche", "Accessoires de mode > Mouchoirs"],
  ["Femmes > Accessoires > Chapeaux & casquettes > Cagoules", "Femmes > Chapeaux et casquettes > Cagoules"],
  ["Femmes > Accessoires > Chapeaux & casquettes > Bonnets", "Femmes > Chapeaux et casquettes > Bonnets"],
  ["Femmes > Accessoires > Chapeaux & casquettes > Casquettes", "Femmes > Chapeaux et casquettes > Casquettes"],
  ["Femmes > Accessoires > Chapeaux & casquettes > Cache-oreilles", "Femmes > Chapeaux et casquettes > Cache-oreilles"],
  ["Femmes > Accessoires > Chapeaux & casquettes > Fascinators", "Femmes > Chapeaux et casquettes > Fascinators"],
  ["Femmes > Accessoires > Chapeaux & casquettes > Chapeaux", "Femmes > Chapeaux et casquettes > Chapeaux"],
  ["Femmes > Accessoires > Chapeaux & casquettes > Bandeaux", "Femmes > Chapeaux et casquettes > Bandeaux"],
  ["Femmes > Accessoires > Bijoux > Bracelets de cheville", "Accessoires de mode > Bijoux > Bracelets de cheville"],
  ["Femmes > Accessoires > Bijoux > Bijoux de corps", "Accessoires de mode > Bijoux > Bijoux de corps"],
  ["Femmes > Accessoires > Bijoux > Bracelets", "Accessoires de mode > Bijoux > Bracelets"],
  ["Femmes > Accessoires > Bijoux > Broches", "Accessoires de mode > Bijoux > Broches"],
  ["Femmes > Accessoires > Bijoux > Breloques et pendentifs", "Accessoires de mode > Bijoux > Charms et pendentifs"],
  ["Femmes > Accessoires > Bijoux > Boucles d'oreilles", "Accessoires de mode > Bijoux > Boucles d'oreilles"],
  ["Femmes > Accessoires > Bijoux > Ensembles de bijoux", "Accessoires de mode > Bijoux > Ensembles de bijoux"],
  ["Femmes > Accessoires > Bijoux > Colliers", "Accessoires de mode > Bijoux > Colliers"],
  ["Femmes > Accessoires > Bijoux > Bagues", "Accessoires de mode > Bijoux > Bagues"],
  ["Femmes > Accessoires > Porte-clés", "Accessoires de mode > Porte-clés"],
  ["Femmes > Accessoires > Écharpes et châles", "Accessoires de mode > Écharpes et châles"],
  ["Femmes > Accessoires > Lunettes de soleil", "Accessoires de mode > Lunettes de soleil"],
  ["Femmes > Accessoires > Parapluies", "Accessoires de mode > Parapluies"],
  ["Femmes > Accessoires > Montres", "Accessoires de mode > Montres"],
  ["Hommes > Accessoires > Sacs et sacoches > Sacs à dos", "Hommes > Sacs et sacoches > Sacs à dos"],
  ["Hommes > Accessoires > Sacs et sacoches > Mallettes", "Hommes > Sacs et sacoches > Mallettes"],
  ["Hommes > Accessoires > Sacs et sacoches > Sacs banane", "Hommes > Sacs et sacoches > Sacs banane"],
  ["Hommes > Accessoires > Sacs et sacoches > Housses pour vêtements", "Hommes > Sacs et sacoches > Housses pour vêtements"],
  ["Hommes > Accessoires > Sacs et sacoches > Sacs de sport", "Hommes > Sacs et sacoches > Sacs de sport"],
  ["Hommes > Accessoires > Sacs et sacoches > Fourre-tout et sacs marins", "Hommes > Sacs et sacoches > Fourre-tout et sacs marins"],
  ["Hommes > Accessoires > Sacs et sacoches > Bagages et valises", "Hommes > Sacs et sacoches > Bagages et valises"],
  ["Hommes > Accessoires > Sacs et sacoches > Cartables et sacoches", "Hommes > Sacs et sacoches > Cartables et sacoches"],
  ["Hommes > Accessoires > Sacs et sacoches > Sacs à bandoulière", "Hommes > Sacs et sacoches > Sacs à bandoulière"],
  ["Hommes > Accessoires > Sacs et sacoches > Porte-monnaie", "Hommes > Sacs et sacoches > Porte-monnaie"],
  ["Hommes > Accessoires > Bandanas et foulards pour cheveux", "Accessoires de mode > Bandanas et foulards"],
  ["Hommes > Accessoires > Ceintures", "Accessoires de mode > Ceintures"],
  ["Hommes > Accessoires > Bretelles", "Accessoires de mode > Bretelles"],
  ["Hommes > Accessoires > Gants", "Accessoires de mode > Gants"],
  ["Hommes > Accessoires > Mouchoirs de poche", "Accessoires de mode > Mouchoirs"],
  ["Hommes > Accessoires > Chapeaux et casquettes > Cagoules", "Hommes > Chapeaux et casquettes > Cagoules"],
  ["Hommes > Accessoires > Chapeaux et casquettes > Bonnets", "Hommes > Chapeaux et casquettes > Bonnets"],
  ["Hommes > Accessoires > Chapeaux et casquettes > Casquettes", "Hommes > Chapeaux et casquettes > Casquettes"],
  ["Hommes > Accessoires > Chapeaux et casquettes > Chapeaux", "Hommes > Chapeaux et casquettes > Chapeaux"],
  ["Hommes > Accessoires > Bijoux > Bracelets", "Accessoires de mode > Bijoux > Bracelets"],
  ["Hommes > Accessoires > Bijoux > Breloques et pendentifs", "Accessoires de mode > Bijoux > Charms et pendentifs"],
  ["Hommes > Accessoires > Bijoux > Boutons de manchette", "Accessoires de mode > Bijoux > Boutons de manchette"],
  ["Hommes > Accessoires > Bijoux > Boucles d'oreilles", "Accessoires de mode > Bijoux > Boucles d'oreilles"],
  ["Hommes > Accessoires > Bijoux > Colliers", "Accessoires de mode > Bijoux > Colliers"],
  ["Hommes > Accessoires > Bijoux > Bagues", "Accessoires de mode > Bijoux > Bagues"],
  ["Hommes > Accessoires > Pochettes de costume", "Accessoires de mode > Pochettes de costume"],
  ["Hommes > Accessoires > Écharpes et châles", "Accessoires de mode > Écharpes et châles"],
  ["Hommes > Accessoires > Lunettes de soleil", "Accessoires de mode > Lunettes de soleil"],
  ["Hommes > Accessoires > Cravates et nœuds papillons", "Accessoires de mode > Cravates et nœuds papillon"],
  ["Hommes > Accessoires > Montres", "Accessoires de mode > Montres"],
  ["Enfants > Vêtements pour filles > Accessoires > Casquettes et chapeaux", "Enfants > Vêtements pour filles > Chapeaux et casquettes"],
  ["Enfants > Vêtements pour filles > Accessoires > Gants", "Accessoires de mode > Gants"],
  ["Enfants > Vêtements pour filles > Accessoires > Écharpes et châles", "Accessoires de mode > Écharpes et châles"],
  ["Enfants > Vêtements pour filles > Accessoires > Ceintures", "Accessoires de mode > Ceintures"],
  ["Enfants > Vêtements pour filles > Accessoires > Bandeaux et barrettes cheveux", "Accessoires de mode > Accessoires pour cheveux"],
  ["Enfants > Vêtements pour filles > Accessoires > Porte-monnaie", "Enfants > Vêtements pour filles > Porte-monnaie"],
  ["Enfants > Vêtements pour garçons > Accessoires > Casquettes et chapeaux", "Enfants > Vêtements pour garçons > Chapeaux et casquettes"],
  ["Enfants > Vêtements pour garçons > Accessoires > Gants", "Accessoires de mode > Gants"],
  ["Enfants > Vêtements pour garçons > Accessoires > Écharpes et châles", "Accessoires de mode > Écharpes et châles"],
  ["Enfants > Vêtements pour garçons > Accessoires > Ceintures", "Accessoires de mode > Ceintures"],
  ["Enfants > Vêtements pour garçons > Accessoires > Porte-monnaie", "Enfants > Vêtements pour garçons > Porte-monnaie"],
  ["Enfants > Vêtements pour garçons > Accessoires > Nœuds papillon et cravattes", "Accessoires de mode > Cravates et nœuds papillon"],
  ["Loisirs et collections > Loisirs créatifs > Couture, tricot et travaux d'aiguille > Aiguilles et crochets > Embroidery needles", "Loisirs et collections > Loisirs créatifs > Couture, tricot et travaux d'aiguille > Aiguilles et crochets > Aiguilles à broder"],
]);

/** Feuilles RETIRÉES par la bascule (ancien arbre seulement) et feuilles NOUVELLES (nouvel arbre seulement). */
export const IDS_ANCIEN_ARBRE = Object.freeze(new Set([20,22,26,87,89,90,91,96,97,98,99,162,163,164,165,166,167,241,242,243,244,553,1123,1140,1578,1580,1581,1582,1586,1740,1741,1743,1746,1748,1785,1800,1851,1852,1881,2931,2932,2937,2938,2956,2957,2958,2959,2960,2966,2967]));
export const IDS_NOUVEL_ARBRE = Object.freeze(new Set([5496,5498,5541,5542,5546,5547,5548,5549,5552,5553,5554,5555,5556,5557,5559,5560,5561,5562,5563,5564,5565,5567,5568,5569,5570]));

const VERS_NOUVEAU = new Map(PAIRES_ARBRES_VINTED.map(([a, n]) => [a, n]));
const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };
const joindre = (p) => (Array.isArray(p) ? p.map((s) => String(s ?? "").trim()).join(" > ") : "");

/** La racine de l'ancien arbre pour un genre de fiche : « Femmes », « Hommes », ou le rayon enfant ; null sinon. */
export function prefixeAncienDuGenre(genre) {
  const g = String(genre ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (/^(femme|femmes|woman|women)$/.test(g)) return "Femmes > ";
  if (/^(homme|hommes|man|men)$/.test(g)) return "Hommes > ";
  if (/^(fille|filles|girl|girls)$/.test(g)) return "Enfants > Vêtements pour filles > ";
  if (/^(garcon|garcons|boy|boys)$/.test(g)) return "Enfants > Vêtements pour garçons > ";
  return null;
}

/**
 * L'arbre du compte d'après ce que Vinted lui a montré : "nouveau", "ancien" ou null (inconnu).
 * @param {Array<{ catalog_id?: number|string|null, erreur?: string|null, le?: string|null }>} indices
 * @returns {{ arbre: 'nouveau'|'ancien'|null, le?: string, source?: string }}
 */
export function arbreVintedDuCompte(indices) {
  let meilleur = { arbre: null };
  let t0 = -Infinity;
  for (const x of Array.isArray(indices) ? indices : []) {
    const t = ms(x?.le);
    let arbre = null; let source = null;
    const id = Number(x?.catalog_id);
    if (IDS_NOUVEL_ARBRE.has(id)) { arbre = "nouveau"; source = `catalog_id ${id}`; }
    else if (IDS_ANCIEN_ARBRE.has(id)) { arbre = "ancien"; source = `catalog_id ${id}`; }
    else if (/Vinted ne propose pas « Accessoires de mode »/.test(String(x?.erreur ?? ""))) { arbre = "ancien"; source = "refus « Accessoires de mode »"; }
    else if (/Vinted ne propose pas « Accessoires » à cet endroit/.test(String(x?.erreur ?? ""))) { arbre = "nouveau"; source = "refus « Accessoires »"; }
    if (arbre && Number.isFinite(t) && t > t0) { t0 = t; meilleur = { arbre, le: x.le, source }; }
  }
  return meilleur;
}

/**
 * Le chemin à servir pour l'arbre du compte, ou null (rien à changer).
 * @param {string[]} chemin  categoryPath du job
 * @param {'nouveau'|'ancien'|null} arbre
 * @param {string|null} genre  genre de la fiche (pour retrouver la racine de l'ancien arbre)
 */
export function cheminVintedPourArbre(chemin, arbre, genre = null) {
  const c = joindre(chemin);
  if (!c || !arbre) return null;
  if (arbre === "nouveau") {
    const n = VERS_NOUVEAU.get(c);
    return n ? n.split(" > ") : null;
  }
  // Ancien arbre : un rayon déplacé se retrouve par son chemin exact ; un accessoire de la nouvelle racine (sans genre)
  // par le genre de la fiche — jamais deviné : genre inconnu ou aucun équivalent → null.
  const exact = PAIRES_ARBRES_VINTED.filter(([, n]) => n === c).map(([a]) => a);
  if (!exact.length) return null;
  if (exact.length === 1 && !c.startsWith("Accessoires de mode")) return exact[0].split(" > ");
  const prefixe = prefixeAncienDuGenre(genre);
  if (!prefixe) return null;
  const a = exact.filter((x) => x.startsWith(prefixe));
  return a.length === 1 ? a[0].split(" > ") : null;
}

/** Ce chemin appartient-il à la zone qui a changé (l'un ou l'autre arbre) ? Sinon, aucune lecture n'est faite. */
export function cheminVintedTouche(chemin) {
  const c = joindre(chemin);
  return !!c && (VERS_NOUVEAU.has(c) || PAIRES_ARBRES_VINTED.some(([, n]) => n === c));
}
