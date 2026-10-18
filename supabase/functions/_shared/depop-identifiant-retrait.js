// ═══════════════════════════════════════════════════════════════════════════
// DEPOP : UN RETRAIT RETROUVE SON IDENTIFIANT — JAMAIS PAR LE TITRE (18/10)
// ═══════════════════════════════════════════════════════════════════════════
// Retrait 81188384 (compte a3002ab6) : armé le 17/10 à 12:27 à la vente Vinted
// de l'article, 16 essais en 30 h, « Retrait Depop impossible : aucun
// identifiant d'annonce sur ce job » — l'annonce Depop toujours en ligne, soit
// le risque d'une DEUXIÈME VENTE. L'identifiant n'a jamais manqué :
//   · le lien du retrait (https://www.depop.com/products/thard_733-jean-…/)
//     porte le slug, mais la lecture du slug refusait le « _ » du pseudo
//     (/products/([A-Za-z0-9]+-…) — corrigée le 18/10 partout côté serveur ;
//   · son dépôt prouvé (arme_par.depot = 1661efb0) porte depop_product_id
//     = 958393360, le numéro rendu par Depop à NOTRE dépôt (201 {id, slug}).
// L'extension retire par le numéro (DELETE /products/<id>/) ; sans numéro,
// elle le relit par le slug (platform_listing_id, sinon le lien — avec SA
// lecture, corrigée seulement en 0.6.128). Poser les deux sur le retrait le
// rend exécutable par TOUT build.
//
// LA RÈGLE (get-pending-jobs, au service, retraits Depop en file SANS
// platform_listing_id — une passe : l'identifiant écrit, le retrait n'y revient plus) :
//   · le slug : platform_listing_id du retrait, sinon son PROPRE lien ;
//   · sinon, et pour le numéro : le DÉPÔT qui a armé ce retrait (arme_par.depot)
//     — même compte (filtré par l'appelant), même fiche, même plateforme, une
//     publication — et SEULEMENT s'il désigne la même annonce (même slug), ou si
//     le retrait n'en désigne aucune ;
//   · rien d'écrit si rien ne change ; jamais le titre, jamais une autre annonce.
// Pur (Deno + Node) : scripts/depop-slug-souligne-serveur-selftest.mjs.

/** Le slug d'un lien Depop — « _ » admis dans le pseudo (même motif qu'update-job-status). */
export const DEPOP_SLUG_RE = /\/products\/([A-Za-z0-9_]+-[A-Za-z0-9-]*[A-Za-z0-9])(?:[/?#]|$)/;

export function slugDepop(url) {
  const m = String(url ?? "").match(DEPOP_SLUG_RE);
  return m ? m[1] : null;
}

const pfDe = (j) => (j && j.platform_fields && typeof j.platform_fields === "object" ? j.platform_fields : {});
const txt = (v) => String(v ?? "").trim();
const numero = (v) => (/^[0-9]+$/.test(txt(v)) ? txt(v) : null);

/**
 * Un retrait Depop sans identifiant lisible par TOUT build : platform_listing_id
 * vide (un slug posé suffit — l'extension relit le numéro par le slug). Une
 * seule passe : l'identifiant écrit, le retrait ne repasse plus ici.
 */
export function retraitDepopSansIdentifiant(j) {
  if (!j || j.platform !== "depop" || j.action !== "delete") return false;
  return !txt(j.platform_listing_id);
}

/**
 * Ce qu'il faut poser sur le retrait, ou null (rien ne change, ou rien de sûr).
 * @param {object} retrait  le job delete (platform_listing_id, listing_url, inventaire_id, platform_fields)
 * @param {object|null} depot  le job de arme_par.depot, lu sur le même compte (ou null)
 * @returns {null | { platform_listing_id: string|null, depop_product_id: unknown, trace: object }}
 */
export function identifiantRetraitDepop(retrait, depot, maintenant = new Date().toISOString()) {
  if (!retraitDepopSansIdentifiant(retrait)) return null;
  const pf = pfDe(retrait);
  const propre = txt(retrait.platform_listing_id);
  const slugLien = slugDepop(retrait.listing_url);
  const slugRetrait = propre || slugLien || null;
  const depotOk = !!depot && depot.platform === "depop"
    && ["publish", "republish"].includes(String(depot.action ?? "publish"))
    && depot.inventaire_id != null && retrait.inventaire_id != null
    && String(depot.inventaire_id) === String(retrait.inventaire_id);
  const slugDepot = depotOk ? (txt(depot.platform_listing_id) || slugDepop(depot.listing_url)) : null;
  // Le dépôt ne parle de CETTE annonce que s'il porte le même slug — ou si le
  // retrait n'en désigne aucune (le dépôt prouvé est alors la seule source).
  const depotMemeAnnonce = depotOk && !!slugDepot && (!slugRetrait || slugDepot === slugRetrait);
  const slug = slugRetrait || (depotMemeAnnonce ? slugDepot : null);
  const pidPropre = numero(pf.depop_product_id);
  const pidDepotBrut = depotMemeAnnonce ? pfDe(depot).depop_product_id : null;
  const pid = pidPropre ? null : (numero(pidDepotBrut) ? pidDepotBrut : null);
  const nouveauSlug = !propre && slug ? slug : null;
  if (!nouveauSlug && pid == null) return null;
  return {
    platform_listing_id: nouveauSlug,
    depop_product_id: pid,
    trace: {
      le: maintenant,
      ...(nouveauSlug ? { slug: nouveauSlug, source_slug: slugLien && slugLien === nouveauSlug ? "lien_du_retrait" : "depot" } : {}),
      ...(pid != null ? { depop_product_id: pid, source_produit: "depot" } : {}),
      ...(depotMemeAnnonce ? { depot: depot.id ?? null } : {}),
      pose_par: "get-pending-jobs (identifiant Depop retrouvé, jamais par le titre)",
    },
  };
}
