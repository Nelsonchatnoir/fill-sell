// ═══════════════════════════════════════════════════════════════════════════
// L'INDEX PUBLIC BEEBS, CÔTÉ SERVEUR (2026-09-21)
// ═══════════════════════════════════════════════════════════════════════════
// POURQUOI ICI ET PAS DANS L'EXTENSION. beebs.js sait déjà lire ce même index
// (beebsDressingParIndex, 19/09) — mais il ne peut le faire QUE depuis une page
// beebs.app ouverte, parce que le service worker n'a pas la permission d'hôte
// sur algolia.net. Conséquence mesurée le 21/09 : 21 dépôts Beebs du parc sont
// 'published' SANS listing_url, dont 2 sur des articles VENDUS dont le retrait
// attend un lien qui ne viendra jamais tout seul — et il ne viendra pas tant
// que la personne n'ouvre pas Beebs. Un serveur, lui, n'attend personne.
//
// CE QUE C'EST. L'appel que le site de Beebs émet lui-même pour sa recherche :
// index `prod_MARKETPLACE_mobile`, App ID et clé de RECHERCHE PUBLIQUE lus dans
// leur bundle. Aucune clé d'administration, aucun index privé. Lecture seule.
//
// 🚨 CE QUE CET INDEX NE FERA JAMAIS : JUGER UNE DISPARITION. Il ne porte aucun
// champ de statut — une annonce vendue, retirée ou EN MODÉRATION en est absente
// exactement comme une annonce qui n'a jamais existé. Une absence ne prouve
// rien. Il sert à NOMMER une annonce, jamais à en déclarer une morte.
// (Vérifié le 21/09 sur le dépôt 3b657a62 : dépôt confirmé par Beebs à 20:19,
// vu trois fois dans l'onglet « En cours de vérification », et ABSENT de
// l'index 13 h plus tard. L'index ne voit que ce qui est en ligne.)

const APP = "1KX9QI8HAR";
// Clé de RECHERCHE publique (search-only), celle du bundle du site.
const CLE = "6ef32e91f3a1843e72a7c7ca93cc6dd6";
const INDEX = "prod_MARKETPLACE_mobile";
const PAGE = 1000;      // un dressing entier en une requête
const PAGES_MAX = 6;    // 6 000 annonces : borne dure, jamais infinie

export type AnnonceIndex = {
  listing_id: string;
  titre: string | null;
  prix: number | null;
  photo_url: string | null;
  /** epoch ms, rendu par Beebs — c'est LUI qui permet l'appariement. */
  creation_ms: number | null;
};

async function requete(corps: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch(`https://${APP.toLowerCase()}-dsn.algolia.net/1/indexes/${INDEX}/query`, {
    method: "POST",
    headers: {
      "X-Algolia-Application-Id": APP,
      "X-Algolia-API-Key": CLE,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corps),
  });
  if (!r.ok) throw new Error(`index Beebs HTTP ${r.status}`);
  return await r.json() as Record<string, unknown>;
}

/**
 * L'identifiant VENDEUR Beebs, retrouvé depuis une annonce dont on est SÛR
 * qu'elle est à nous (une annonce déjà rattachée à un de nos jobs).
 * ⛔ Jamais deviné : sans graine, on rend null et l'appelant s'arrête. Se
 * tromper de vendeur, c'est poser le lien de l'annonce d'un inconnu sur un job
 * — et la faire supprimer au retrait suivant.
 */
export async function uidVendeur(grainesListingIds: string[]): Promise<string | null> {
  const graines = (grainesListingIds ?? [])
    .map((x) => String(x ?? "").trim())
    .filter((x) => /^\d+$/.test(x))
    .slice(0, 5);
  for (const g of graines) {
    try {
      const r = await requete({ filters: `objectID:${g}`, hitsPerPage: 1, attributesToRetrieve: ["user_id"] });
      const hits = Array.isArray(r?.hits) ? r.hits as Array<Record<string, unknown>> : [];
      const v = hits[0]?.user_id;
      if (v != null && String(v).trim()) return String(v).trim();
    } catch {
      // Index injoignable : on ne conclut RIEN (ni absence, ni identité).
      return null;
    }
  }
  return null;
}

/**
 * Le dressing EN LIGNE d'un vendeur, avec la date de création à la seconde.
 * Rend null si l'index est muet — un index muet n'est pas un dressing vide.
 */
export async function dressing(uid: string): Promise<AnnonceIndex[] | null> {
  const out: AnnonceIndex[] = [];
  const vus = new Set<string>();
  for (let page = 0; page < PAGES_MAX; page++) {
    let r: Record<string, unknown>;
    try {
      r = await requete({
        facetFilters: [[`user_id:${uid}`]],
        hitsPerPage: PAGE,
        page,
        // creation_date : le champ qui fait tout le travail d'identité ici.
        attributesToRetrieve: ["objectID", "title", "price", "image", "creation_date"],
        attributesToHighlight: [],
      });
    } catch {
      return null;
    }
    const hits = Array.isArray(r?.hits) ? r.hits as Array<Record<string, unknown>> : [];
    for (const h of hits) {
      const id = String(h?.objectID ?? "").trim();
      if (!/^\d+$/.test(id) || vus.has(id)) continue;
      vus.add(id);
      const prix = Number(h?.price);
      const creation = Number(h?.creation_date);
      out.push({
        listing_id: id,
        titre: String(h?.title ?? "").trim() || null,
        prix: Number.isFinite(prix) && prix > 0 ? prix : null,
        photo_url: typeof h?.image === "string" && h.image ? h.image : null,
        creation_ms: Number.isFinite(creation) && creation > 0 ? creation : null,
      });
    }
    if (hits.length < PAGE) break;
  }
  return out;
}

// ── LA RÈGLE D'APPARIEMENT, CALIBRÉE SUR DU RÉEL ────────────────────────────
// 11/09 : sur 180 dépôts VRAIS de Joséphine, l'annonce naît à ≤ 6 s de notre
// published_at. 21/09, re-mesuré sur les 4 dépôts du lot MeMiniandMove du
// 20/09 au soir (les 4 dont le lien a été retrouvé par la page, donc vérifiés
// indépendamment) : creation_date PRÉCÈDE published_at de 7 à 8 s, toujours —
// normal, on estampille après avoir lu la confirmation. La fenêtre est donc
// ASYMÉTRIQUE dans les faits ; on la garde symétrique et large (±30 s), et
// c'est l'unicité qui tranche, pas la finesse du seuil.
//
// TROIS VERROUS, TOUS OBLIGATOIRES — un seul critère n'identifie rien :
//   1. UN SEUL candidat dans la fenêtre (deux dépôts du même compte sont
//      espacés de 2-3 min : deux candidats = anomalie, on s'abstient) ;
//   2. appariement MUTUEL (l'annonce la plus proche de ce dépôt doit aussi
//      avoir ce dépôt pour plus proche) — c'est ce qui empêche une rafale de
//      clics vides de s'approprier l'annonce du voisin (piège du 11/09) ;
//   3. le PRIX doit coïncider quand les deux sont connus.
// Et l'annonce ne doit être portée par AUCUN autre job (garde anti-croisement,
// même principe qu'ebayIdAlreadyKnown).
export const FENETRE_MS = 30_000;

export type DepotACaler = { id: string; repere_ms: number; prix: number | null };

export function apparier(
  depots: DepotACaler[],
  annonces: AnnonceIndex[],
  idsDejaPris: Set<string>,
): Map<string, { annonce: AnnonceIndex; ecart_ms: number }> {
  const libres = annonces.filter((a) => a.creation_ms != null && !idsDejaPris.has(a.listing_id));
  const resultat = new Map<string, { annonce: AnnonceIndex; ecart_ms: number }>();

  for (const d of depots) {
    if (!Number.isFinite(d.repere_ms)) continue;
    const candidats = libres
      .map((a) => ({ a, ecart: Math.abs((a.creation_ms as number) - d.repere_ms) }))
      .filter((c) => c.ecart <= FENETRE_MS);
    if (candidats.length !== 1) continue;            // verrou 1
    const { a, ecart } = candidats[0];

    // verrou 2 : de SON côté, cette annonce n'a-t-elle pas un dépôt plus proche ?
    let meilleur = d.id;
    let meilleurEcart = ecart;
    for (const autre of depots) {
      if (autre.id === d.id || !Number.isFinite(autre.repere_ms)) continue;
      const e = Math.abs((a.creation_ms as number) - autre.repere_ms);
      if (e < meilleurEcart) { meilleur = autre.id; meilleurEcart = e; }
    }
    if (meilleur !== d.id) continue;

    // verrou 3 : le prix, quand les deux sont connus.
    if (d.prix != null && a.prix != null && Math.abs(d.prix - a.prix) > 0.01) continue;

    resultat.set(d.id, { annonce: a, ecart_ms: ecart });
  }
  return resultat;
}
