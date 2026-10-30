// ═══════════════════════════════════════════════════════════════════════════
// LE GENRE QUE L'ARTICLE DIT LUI-MÊME (30/10/2026, lot E — thecloset72000)
// ═══════════════════════════════════════════════════════════════════════════
// CE QUI S'EST PASSÉ : « Lee Taille (14) FR 44 Femme Jean Bleu… » (fiche
// 1793359672203, 30/10) est sorti de la rédaction avec genre = « Homme » sur
// Vinted, eBay, Beebs et Depop : les consignes de rédaction demandent de
// « trancher TOUJOURS Femme ou Homme dès le moindre signal (rayon habituel de
// la marque) », et l'app reprenait ce genre DEVINÉ comme un choix. Résultat :
// Hommes > Jeans proposé partout (categorie_par_mot), la personne a dû corriger
// les quatre rayons à la main, et le genre « Homme » est resté sur les jobs
// (Département eBay, garde de rayon Depop désarmée : un genre « Homme » plus
// le mot « Femme » du titre = « les deux », plus aucune garde).
// RÈGLE : un genre ÉCRIT dans le texte de l'article (le titre d'abord, puis le
// titre et la description ensemble) prime sur tout genre deviné. Un seul genre
// adulte nommé, et aucun mot d'enfant : c'est lui. Les deux, aucun, ou un
// article d'enfant : on ne dit rien (la règle d'avant s'applique).
// Mêmes mots que le moteur de rayon Depop (_shared/depop-rayon.js), qui les
// importe d'ici : une seule liste.
// ═══════════════════════════════════════════════════════════════════════════

export const sansAccentsGenre = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const RE_HOMME = /\b(hommes?|masculin|men|mens|men's|man|male)\b/;
export const RE_FEMME = /\b(femmes?|feminin|women|womens|women's|woman|womans|ladies|lady|female)\b/;
const RE_ENFANT = /\b(enfants?|bebes?|fillettes?|garcons?|kids?|baby|babies|girls?|boys?|junior|toddlers?)\b/;

function genreDUnTexte(texte) {
  const t = sansAccentsGenre(texte);
  if (!t.trim() || RE_ENFANT.test(t)) return null;
  const h = RE_HOMME.test(t);
  const f = RE_FEMME.test(t);
  if (h && !f) return "Homme";
  if (f && !h) return "Femme";
  return null;
}

/**
 * « Femme » | « Homme » quand le texte de l'article le nomme sans ambiguïté, sinon null.
 * @param {{ titre?: string|null, description?: string|null }} t
 */
export function genreDuTexte({ titre = "", description = "" } = {}) {
  const duTitre = genreDUnTexte(titre);
  if (duTitre) return duTitre;
  // Un titre d'enfant, ou qui nomme les deux : la description ne tranche pas à sa place.
  const t = sansAccentsGenre(titre);
  if (RE_ENFANT.test(t) || (RE_HOMME.test(t) && RE_FEMME.test(t))) return null;
  return genreDUnTexte(`${titre ?? ""} ${description ?? ""}`);
}

/** Un genre deviné qui contredit le texte : remplacé. Rend { genre, corrige }. Enfant, Mixte ou vide : inchangé. */
export function genreAccordeAuTexte(genre, dit) {
  const g = String(genre ?? "").trim();
  if (!dit || !g || g === "Mixte") return { genre: g || null, corrige: false };
  if ((g === "Homme" || g === "Femme") && g !== dit) return { genre: dit, corrige: true };
  return { genre: g, corrige: false };
}
