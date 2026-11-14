// ═══════════════════════════════════════════════════════════════════════════
// eBay REFUSE LA RÈGLE DE LIVRAISON D'UNE ANNONCE (refus 25007) — LA RÈGLE (14/11/2026 soir, point 2 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Constat (compte 13e274de, lu en base et dans les journaux d'ebay-account) : la règle de livraison du COMPTE,
// 327113190011 (« Livraison FillSell », créée par l'app le 14/11 à 02:32, réécrite à 10:14:32 avec Shop2Shop, Lettre
// suivie, Mondial Relay et Colissimo), a publié 5 articles de 03:38 à 08:42 puis a été refusée par eBay sur TOUTES les
// mises en ligne qui l'ont portée après sa réécriture : 6 sur 6 de 10:55 à 19:12, cinq catégories, de 1,90 € à 14,90 €
// (« Les conditions de livraison que vous avez spécifiées ne sont pas valides », 25007). Les 82 publications réussies
// du jour portaient toutes une règle CHOISIE POUR L'ARTICLE (325352930011, 325351779011…) ; l'article refusé
// (« Bracelet jonc manchette… ») n'en avait pas et repartait sur celle du compte — ce n'était pas l'article.
// LA RÈGLE, pour tous les comptes :
//   · refus 25007 sur la règle DU COMPTE (aucune règle choisie pour l'article) : FillSell retient pour cet article UNE
//     autre règle du vendeur, PROUVÉE par une mise en ligne réussie de ce compte dans les 30 derniers jours et
//     TOUJOURS présente sur son compte eBay (liste relue) — d'abord la plus servie dans la même catégorie, puis la plus
//     servie, puis la plus récente. UNE fois par article (marque ebay_livraison_remplacee) : jamais de boucle ;
//   · aucune règle prouvée, liste illisible, ou règle choisie par la personne pour l'article : rien n'est choisi à sa
//     place — un message clair, sans code ni jargon, qui dit le geste (choisir une autre règle pour l'article, relancer).
//   · ⛔ Rien n'est jamais créé, modifié ni supprimé chez eBay : on choisit parmi SES règles, telles qu'elles sont.
// Pur : aucun réseau (le worker lit la liste et les preuves, puis appelle ces fonctions).

export const JOURS_PREUVE_LIVRAISON = 30;

/** Le refus porte-t-il sur la règle de livraison de l'annonce ? (25007, API_INVENTORY : « fulfillment policy invalid ») */
/** @param {{ errorId?: unknown } | null | undefined} e */
export function refusLivraisonInvalide(e) {
  return Number(e?.errorId) === 25007;
}

/**
 * La règle de remplacement (pure), ou null.
 *   refusee : l'id de la règle refusée ; existantes : [{ id, nom }] lues chez eBay (null = illisible → jamais de choix) ;
 *   preuves : [{ politique, categorie, publie_le }] — les mises en ligne RÉUSSIES de ce compte par l'API ;
 *   categorie : la catégorie eBay de l'article ; maintenant : ms.
 * Rend { id, nom, preuves, meme_categorie, derniere } ou null.
 * @param {{ refusee?: string | null, existantes?: Array<{ id: string, nom?: string | null }> | null, preuves?: Array<{ politique: string, categorie?: unknown, publie_le?: unknown }>, categorie?: unknown, maintenant?: number }} [args]
 * @returns {{ id: string, nom: string | null, preuves: number, meme_categorie: number, derniere: string } | null}
 */
export function choisirLivraisonDeRemplacement({ refusee = null, existantes = null, preuves = [], categorie = null, maintenant = Date.now() } = {}) {
  if (!Array.isArray(existantes) || !existantes.length) return null;
  const presentes = new Map(existantes.filter((p) => p && String(p.id ?? '').trim()).map((p) => [String(p.id).trim(), String(p.nom ?? '').trim() || null]));
  const limite = maintenant - JOURS_PREUVE_LIVRAISON * 24 * 3600 * 1000;
  /** @type {Map<string, { id: string, nom: string | null, preuves: number, meme_categorie: number, derniere: number }>} */
  const parPolitique = new Map();
  for (const p of Array.isArray(preuves) ? preuves : []) {
    const id = String(p?.politique ?? '').trim();
    const le = Date.parse(String(p?.publie_le ?? ''));
    if (!id || id === String(refusee ?? '').trim() || !presentes.has(id) || !Number.isFinite(le) || le < limite || le > maintenant + 60_000) continue;
    const s = parPolitique.get(id) ?? { id, nom: presentes.get(id), preuves: 0, meme_categorie: 0, derniere: 0 };
    s.preuves += 1;
    if (categorie != null && String(p?.categorie ?? '') === String(categorie)) s.meme_categorie += 1;
    s.derniere = Math.max(s.derniere, le);
    parPolitique.set(id, s);
  }
  const classees = [...parPolitique.values()].sort((a, b) => (b.meme_categorie - a.meme_categorie) || (b.preuves - a.preuves) || (b.derniere - a.derniere) || a.id.localeCompare(b.id));
  const c = classees[0];
  return c ? { ...c, derniere: new Date(c.derniere).toISOString() } : null;
}

/** Les preuves lues dans les tâches publiées (pure) : la règle choisie pour l'article, sinon celle notée à la mise en ligne. */
/**
 * @param {Array<{ platform_fields?: any, published_at?: string | null }>} [lignes]
 * @returns {Array<{ politique: string, categorie: unknown, publie_le: string }>}
 */
export function preuvesDepuisTaches(lignes = []) {
  /** @type {Array<{ politique: string, categorie: unknown, publie_le: string }>} */
  const out = [];
  for (const l of Array.isArray(lignes) ? lignes : []) {
    const pf = l?.platform_fields ?? {};
    const politique = String(pf.ebayFulfillmentPolicyId ?? '').trim() || String(pf.ebay_api?.fulfillment_policy_id ?? '').trim();
    if (!politique || !l?.published_at) continue;
    out.push({ politique, categorie: pf.ebayCategoryId ?? pf.last_diagnostic?.categorie?.id ?? null, publie_le: l.published_at });
  }
  return out;
}

/** Le message à la personne (pur) — sans code, sans jargon : ce qui se passe, et le geste. */
/** @param {{ nom?: string | null, choisieParArticle?: boolean, remplacementEssaye?: boolean }} [args] */
export function messageLivraisonRefusee({ nom = null, choisieParArticle = false, remplacementEssaye = false } = {}) {
  const regle = nom ? ` (« ${String(nom).slice(0, 60)} »)` : '';
  if (choisieParArticle) {
    return `eBay refuse la règle de livraison choisie pour cet article${regle}. Choisis-en une autre sur l'article (Livraison eBay › Changer), puis relance : la publication repart d'elle-même.`;
  }
  if (remplacementEssaye) {
    return `eBay refuse aussi la règle de livraison que FillSell avait reprise de tes annonces déjà en ligne${regle}. Choisis une règle de livraison pour cet article (Livraison eBay › Changer), puis relance : la publication repart d'elle-même.`;
  }
  return `eBay refuse la règle de livraison de ton compte${regle} pour cet article, et aucune autre de tes règles n'a encore servi à une annonce en ligne. Choisis une règle de livraison pour cet article (Livraison eBay › Changer), puis relance : la publication repart d'elle-même.`;
}
