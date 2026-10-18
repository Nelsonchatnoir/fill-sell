// ═══════════════════════════════════════════════════════════════════════════
// LES CORRESPONDANCES APPRISES SUR LES ANNONCES ACCEPTÉES (18/10, lot 2)
// ═══════════════════════════════════════════════════════════════════════════
// Ordre du moteur (règle de Nico) : texte du vendeur → CORRESPONDANCES APPRISES
// (coût IA zéro) → recopie → Lens → IA sur la vraie liste → photo → question.
// La base (migration 20261018120000) apprend chaque nuit, sur les annonces
// RÉELLEMENT acceptées en ligne du parc (jobs publiés/vendus, annonces Leboncoin
// relevées), ce qu'un champ vaut pour une catégorie — seule ou avec le
// catalogue Vinted de la fiche — quand c'est UNANIME (≥ 4 articles de ≥ 2
// comptes, ou ≥ 8 de ≥ 3 pour la catégorie seule). Jamais l'état, la marque, la
// couleur, la taille, la matière, le poids, les dimensions, un identifiant.
//
// Par (plateforme, champ), la bascule de la base dit :
//   · « fantome » : l'app NOTE ce qu'elle aurait posé (usage_logs
//     deduction_fantome), sans rien toucher — le serveur compare ensuite à la
//     valeur acceptée en ligne et allume seul le champ (≥ 48 h, ≥ 15 cas, 100 %) ;
//   · « actif »   : la valeur est POSÉE (dans la liste de la plateforme, jamais
//     une valeur inventée), avant l'IA et avant la question, et notée
//     (deduction_apprise_posee) — le serveur la coupe seul si elle se trompe.
// Un champ déjà décidé (fiche, texte, mémoire, la personne) n'est jamais touché.
// Pur, sauf chargerApprises / noterDeduction (lecture et journal, best-effort).

const norm = (s) => String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

export const PLATEFORMES_APPRISES = Object.freeze(["leboncoin", "beebs", "ebay"]);

/** La catégorie telle que la base la range : la feuille (dernier libellé) ; eBay : son numéro. */
export function categorieApprise(platform, cle) {
  const s = String(cle ?? "").trim();
  if (!s) return "";
  if (platform === "ebay") return s;
  const parts = s.split(">").map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

/** Le catalogue Vinted de la fiche (colonne, sinon attributs.categorie_vinted.v), ou "". */
export function catalogueVintedDeLaFiche(fiche) {
  const v = String(fiche?.vinted_catalog_id ?? fiche?.attributs?.categorie_vinted?.v ?? "").trim();
  return /^\d+$/.test(v) ? v : "";
}

/**
 * Ce que l'apprentissage propose pour UNE ligne encore à trancher, ou null.
 * `apprises` = { [champ]: { valeur, etat, n, comptes, source } } (réponse de la base).
 * La valeur doit être dans LA liste de la plateforme quand elle existe (écrite comme la liste l'écrit).
 */
export function propositionApprise(ligne, apprises) {
  if (!ligne || !apprises || typeof apprises !== "object") return null;
  const cle = ligne.key ?? ligne.name;
  const p = cle != null ? apprises[cle] : null;
  if (!p || !p.valeur || !["fantome", "actif"].includes(p.etat)) return null;
  const liste = Array.isArray(ligne.allowedValues) ? ligne.allowedValues : [];
  let valeur = String(p.valeur);
  if (liste.length) {
    const exacte = liste.find((x) => norm(x) === norm(valeur));
    if (!exacte) return null;
    valeur = String(exacte);
  }
  return { valeur, etat: p.etat, source: `apprise:${p.source ?? "?"}`, n: Number(p.n) || 0, comptes: Number(p.comptes) || 0 };
}

/** Une ligne encore à trancher (rien de décidé par la fiche, le texte, la mémoire ou la personne) ? */
export function ligneATrancher(ligne) {
  if (!ligne) return false;
  if (ligne.deduit?.valeur) return false;
  return ligne.state === "missing" || (ligne.state === "invalid" && !ligne.suggested);
}

// Lectures partagées : une question par (plateforme, catégorie, catalogue), gardée 10 min.
const lectures = new Map();
export async function chargerApprises(supabase, { platform, categorie, vintedCatalog = "" }) {
  const cat = categorieApprise(platform, categorie);
  if (!supabase || !PLATEFORMES_APPRISES.includes(platform) || !cat) return {};
  const cle = `${platform}|${cat}|${vintedCatalog}`;
  const deja = lectures.get(cle);
  if (deja && Date.now() - deja.le < 10 * 60_000) return deja.promesse;
  const promesse = (async () => {
    try {
      const { data, error } = await supabase.rpc("deduction_apprise_pour", {
        p_platform: platform, p_categorie: cat, p_vinted_catalog: vintedCatalog || null, p_champs: null,
      });
      if (error || !data || typeof data !== "object") return {};
      return data;
    } catch { return {}; }
  })();
  lectures.set(cle, { le: Date.now(), promesse });
  return promesse;
}

// Le journal : une ligne par (article, plateforme, champ, sorte) et par session.
const notes = new Set();
export function noterDeduction(supabase, userId, { sorte, platform, champ, valeur, categorie, inventaireId, source }) {
  if (!supabase || !userId || !inventaireId || !champ || !valeur) return false;
  const feature = sorte === "posee" ? "deduction_apprise_posee" : "deduction_fantome";
  const cle = `${feature}|${inventaireId}|${platform}|${champ}`;
  if (notes.has(cle)) return false;
  notes.add(cle);
  supabase.from("usage_logs").insert({
    user_id: userId, feature,
    metadata: { platform, champ, valeur: String(valeur).slice(0, 120), categorie: String(categorie ?? "").slice(0, 200), inventaire_id: inventaireId, source: source ?? null },
  }).then(({ error }) => { if (error) console.warn(`[moteur] ${feature} non journalisé :`, error.message); });
  return true;
}

/** (tests) Oublie les lectures et le journal de la session. */
export function _oublierApprises() { lectures.clear(); notes.clear(); }
