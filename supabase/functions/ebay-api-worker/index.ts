// ═══════════════════════════════════════════════════════════════════════════
// ebay-api-worker — LOT 2a (06/09/2026) : publier sur eBay SANS Chrome.
//
// Exécute les jobs cross_post_jobs { platform: 'ebay', voie: 'api' } :
//   publish → createOrReplaceInventoryItem → createOffer → publishOffer
//   delete  → withdrawOffer
// Déclenché par pg_cron toutes les 2 min (x-cron-secret, même mécanique que
// handler-watch) ; { job_id } dans le corps pour traiter UN job précis (test
// 2a). Jamais appelé par l'app (verify_jwt = false).
//
// Ce qu'il NE fait PAS en 2a (volontairement, à valider d'abord) : republish,
// reprises espacées, choix de catégorie par suggestion, mise à jour du prix.
//
// GARDE-FOUS :
//   · ne touche qu'aux jobs voie='api' — get-pending-jobs ne distribue plus
//     que voie='extension', l'extension et le worker ne se croisent jamais ;
//   · le jeton vendeur vient de obtenirAccessToken() (refresh compris) ;
//     révoqué → needs_user « reconnecte ton compte eBay » ;
//   · une erreur eBay est écrite TELLE QUELLE dans error + last_diagnostic
//     {voie:'api', etape, http, errorId} — jamais un silence ;
//   · rien d'inventé : catégorie et champs viennent du job, conditions et
//     aspects d'eBay (Metadata/Taxonomy) ou du cache ebay_item_aspects.
// ═══════════════════════════════════════════════════════════════════════════
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { appelEbay, lireEnvEbay, obtenirAccessToken, type EbayEnv } from "../_shared/ebay-oauth.ts";
import { rapatrierPhotosPublication } from "../_shared/photos-rapatriement.ts";
import {
  aspectsCategorie, choisirCondition, conditionsCategorie, descriptionEbay, emplacementMarchand,
  lireErreurEbay, MARKETPLACE, remplirAspects, skuPour, suggererCategories, titreEbay, urlAnnonce, urlsPhotos, type PlatformFields,
} from "../_shared/ebay-publication.ts";

const HANDLER_BUILD = "ebay-api-worker 2a";
const LOT_MAX = 10;
const MSG_RETRAIT = "Annonce retirée par le vendeur (retrait ciblé depuis l'app) — pas une vente";

interface Job {
  id: string; user_id: string; inventaire_id: number | null; platform: string; action: string; status: string;
  title: string | null; description: string | null; price: number | string | null;
  photos: unknown; platform_fields: Record<string, unknown> | null;
  listing_url: string | null; platform_listing_id: string | null; created_at: string; voie: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function marquer(admin: SupabaseClient, job: Job, patch: Record<string, unknown>, diagnostic: Record<string, unknown>, ebayApi?: Record<string, unknown>) {
  const pf = { ...(job.platform_fields ?? {}) };
  pf.last_diagnostic = { voie: "api", at: new Date().toISOString(), ...diagnostic };
  if (ebayApi) pf.ebay_api = { ...((pf.ebay_api as Record<string, unknown>) ?? {}), ...ebayApi };
  const { error } = await admin.from("cross_post_jobs").update({ ...patch, platform_fields: pf, handler_build: HANDLER_BUILD }).eq("id", job.id);
  if (error) console.error(`[ebay-api-worker] job ${job.id} : écriture refusée — ${error.message}`);
}

// 4xx eBay = faute de contenu ou de compte → needs_user (le message dit quoi) ;
// 5xx / réseau = transitoire → pending, 3 tentatives puis failed.
function verdictHttp(http: number, tentatives: number): "needs_user" | "pending" | "failed" {
  if (http >= 500 || http === 0) return tentatives >= 3 ? "failed" : "pending";
  return "needs_user";
}

async function publier(admin: SupabaseClient, env: EbayEnv, token: string, job: Job): Promise<Record<string, unknown>> {
  const pf = (job.platform_fields ?? {}) as PlatformFields;
  const tentatives = Number(((pf.ebay_api as Record<string, unknown>) ?? {}).tentatives ?? 0) + 1;
  const photos = urlsPhotos(job.photos);
  const prix = Number(job.price);
  // Sans photo, rien ne part — arrêté ICI, avant tout appel eBay, cause nommée.
  if (!photos.length) { await marquer(admin, job, { status: "needs_user", error: "Cet article n'a aucune photo : eBay exige au moins une image. Ajoute une photo à l'article, puis relance la publication." }, { etape: "controle", quoi: "photos_absentes" }); return { job: job.id, issue: "needs_user", motif: "photos_absentes" }; }
  const categorie = await resoudreCategorie(env, token, job, pf);
  if ("choix" in categorie) {
    const liste = categorie.choix.map((c, i) => `${i + 1}. ${c.chemin} (${c.id})`).join(" · ");
    const mappee = String(pf.ebayCategoryId ?? "").trim();
    const msg = mappee
      ? `Catégorie eBay à confirmer : ${categorie.motif}. Relance la publication depuis la fiche pour garder la catégorie de l'app, ou change l'icône / le genre de l'article pour en choisir une autre. Suggestions eBay : ${liste}.`
      : `Catégorie eBay à choisir pour cet article : ${liste || "aucune suggestion eBay"}. Change l'icône / le genre de l'article depuis la fiche, puis relance.`;
    // ebayCategorieAttente : posé ICI, lu à la relance — relancer sans rien
    // changer vaut confirmation du mapping de l'app (jamais une boucle).
    job.platform_fields = { ...(job.platform_fields ?? {}), ebayCategorieAttente: { mapping: mappee || null, choix: categorie.choix, at: new Date().toISOString() } };
    await marquer(admin, job, { status: "needs_user", error: msg }, { etape: "categorie", quoi: mappee ? "categorie_a_confirmer" : "categorie_a_choisir", choix: categorie.choix, motif: categorie.motif });
    return { job: job.id, issue: "needs_user", motif: mappee ? "categorie_a_confirmer" : "categorie_a_choisir", choix: categorie.choix, detail: categorie.motif };
  }
  const categoryId = categorie.id;
  if (categorie.source !== "mapping" && categorie.source !== "mapping_confirme_par_relance") pf.ebayCategoryPath = categorie.chemin;

  if (!(prix > 0)) { await marquer(admin, job, { status: "needs_user", error: "Prix absent ou nul." }, { etape: "controle", quoi: "prix_absent" }); return { job: job.id, issue: "needs_user", motif: "prix_absent" }; }
  if (!job.inventaire_id) { await marquer(admin, job, { status: "failed", error: "Job sans inventaire_id : impossible de former le SKU." }, { etape: "controle", quoi: "inventaire_absent" }); return { job: job.id, issue: "failed", motif: "inventaire_absent" }; }
  // Filet photos (décision Nico 06/09) : toute URL hors de notre Storage est
  // copiée chez nous AVANT d'appeler eBay ; le job garde alors NOS URLs.
  const rap = await rapatrierPhotosPublication(admin, photos, job.user_id, job.inventaire_id);
  if (rap.rapatriees > 0) {
    const nouvellesPhotos = rap.urls.map((u, i) => ({ type: i === 0 ? "original" : `photo_${i}`, url: u }));
    await admin.from("cross_post_jobs").update({ photos: nouvellesPhotos }).eq("id", job.id);
    job.photos = nouvellesPhotos;
  }
  const photosPublication = rap.urls;

  // 1. Emplacement marchand (une fois par vendeur).
  const empl = await emplacementMarchand(admin, env, token, job.user_id);
  if ("manque" in empl) {
    const msg = empl.manque === "adresse"
      ? "eBay a besoin de ta ville et de ton code postal (emplacement de l'objet) : renseigne ton adresse de remise dans les Paramètres, puis relance."
      : `eBay a refusé la création de l'emplacement marchand : ${empl.detail}`;
    await marquer(admin, job, { status: "needs_user", error: msg }, { etape: "emplacement", quoi: empl.manque, detail: empl.detail });
    return { job: job.id, issue: "needs_user", motif: "emplacement", detail: empl.detail };
  }

  // 2. Condition — liste de la catégorie (Metadata), correspondance à confirmer par eBay.
  const conditions = await conditionsCategorie(env, token, categoryId);
  const condition = choisirCondition(pf.etat as string, conditions);
  if (!condition) {
    await marquer(admin, job, { status: "needs_user", error: `Aucun état eBay ne correspond à « ${pf.etat ?? ""} » pour la catégorie ${categoryId} (états eBay : ${(conditions ?? []).map((c) => c.libelle).join(", ") || "inconnus"}).` }, { etape: "condition", quoi: "etat_sans_correspondance" });
    return { job: job.id, issue: "needs_user", motif: "condition" };
  }

  // 3. Aspects — catalogue de la catégorie (cache ou Taxonomy), assemblage, recalage.
  const cat = await aspectsCategorie(admin, env, token, categoryId);
  if ("erreur" in cat) {
    await marquer(admin, job, { status: verdictHttp(502, tentatives), error: `Impossible de lire les caractéristiques de la catégorie ${categoryId} chez eBay : ${cat.erreur}` }, { etape: "aspects", quoi: "taxonomy_indisponible" }, { tentatives });
    return { job: job.id, issue: "aspects", detail: cat.erreur };
  }
  // Job/standard/défauts d'abord, puis l'IA sous contrainte de la liste eBay
  // pour ce qui manque, puis contrôle exact — needs_user seulement après.
  const rempli = await remplirAspects(pf, cat.aspects, contexteDuJob(job, pf), Deno.env.get("ANTHROPIC_API_KEY") ?? "");
  const { aspects, manquants, recalages } = rempli;
  if (manquants.length) {
    await marquer(admin, job, { status: "needs_user", error: `eBay exige encore : ${manquants.join(", ")}. Complète ces caractéristiques puis relance.` }, { etape: "aspects", quoi: "aspects_manquants", manquants, source_catalogue: cat.source, ia: rempli.ia, sources: rempli.sources });
    return { job: job.id, issue: "needs_user", motif: "aspects_manquants", manquants, ia: rempli.ia };
  }

  // 4. createOrReplaceInventoryItem (PUT, idempotent sur le SKU).
  const sku = skuPour(job.inventaire_id);
  const item = {
    condition: condition.enumValue,
    availability: { shipToLocationAvailability: { quantity: 1 } },
    product: {
      title: titreEbay(job.title ?? ""),
      description: descriptionEbay(job.description ?? "", job.title ?? ""),
      aspects,
      imageUrls: photosPublication,
      // PAS de product.brand : eBay exige alors product.mpn (refus 25002
      // « BrandMPN manquante ou invalide », constaté au 1er publish du 06/09).
      // La marque est portée par l'aspect « Marque », qui suffit.
    },
  };
  const rItem = await appelEbay(env, token, `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, { method: "PUT", body: item });
  if (rItem.http !== 200 && rItem.http !== 204 && rItem.http !== 201) {
    const e = lireErreurEbay(rItem.json, rItem.texte);
    await marquer(admin, job, { status: verdictHttp(rItem.http, tentatives), error: `eBay a refusé la fiche produit (${rItem.http}${e.errorId ? `, ${e.errorId}` : ""}) : ${e.message}${e.parametres ? ` [${e.parametres}]` : ""}` },
      { etape: "inventory_item", http: rItem.http, errorId: e.errorId, message: e.message, condition_envoyee: condition.enumValue, condition_id: condition.id }, { sku, tentatives });
    return { job: job.id, issue: "inventory_item", http: rItem.http, ebay: e, condition_envoyee: condition.enumValue };
  }

  // 5. Offre : réutilise l'offre non publiée du SKU si elle existe, sinon crée.
  const { data: compte } = await admin.from("ebay_accounts").select("fulfillment_policy_id, payment_policy_id, return_policy_id").eq("user_id", job.user_id).maybeSingle();
  if (!compte?.fulfillment_policy_id || !compte?.payment_policy_id || !compte?.return_policy_id) {
    await marquer(admin, job, { status: "needs_user", error: "Les trois politiques de vente eBay (livraison, paiement, retours) doivent être choisies dans les Paramètres avant de publier." }, { etape: "offre", quoi: "politiques_absentes" }, { sku });
    return { job: job.id, issue: "needs_user", motif: "politiques_absentes" };
  }
  const offre = {
    sku, marketplaceId: MARKETPLACE, format: "FIXED_PRICE", listingDuration: "GTC",
    availableQuantity: 1, categoryId, merchantLocationKey: empl.cle,
    pricingSummary: { price: { value: prix.toFixed(2), currency: "EUR" } },
    listingDescription: descriptionEbay(job.description ?? "", job.title ?? ""),
    listingPolicies: { fulfillmentPolicyId: compte.fulfillment_policy_id, paymentPolicyId: compte.payment_policy_id, returnPolicyId: compte.return_policy_id },
  };
  let offerId = "";
  const existantes = await appelEbay(env, token, `/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`);
  const offres = (existantes.json as { offers?: Array<{ offerId?: string; status?: string; listing?: { listingId?: string } }> } | null)?.offers ?? [];
  const publiee = offres.find((o) => o.status === "PUBLISHED");
  if (publiee) {
    const listingId = String(publiee.listing?.listingId ?? "");
    await marquer(admin, job, { status: "failed", error: `Cet article est déjà en ligne sur eBay par API (offre ${publiee.offerId}${listingId ? `, annonce ${listingId}` : ""}). Retire-le avant de republier.` }, { etape: "offre", quoi: "deja_publiee" }, { sku, offer_id: publiee.offerId, listing_id: listingId || null });
    return { job: job.id, issue: "failed", motif: "deja_publiee", offer_id: publiee.offerId, listing_id: listingId };
  }
  // Offre existante non publiée (jamais publiée, ou RETIRÉE par withdraw) :
  // on la met à jour et on la republie — c'est la republication par API.
  const brouillon = offres.find((o) => o.offerId);
  if (brouillon?.offerId) {
    const maj = await appelEbay(env, token, `/sell/inventory/v1/offer/${brouillon.offerId}`, { method: "PUT", body: offre });
    if (maj.http !== 200 && maj.http !== 204) {
      const e = lireErreurEbay(maj.json, maj.texte);
      await marquer(admin, job, { status: verdictHttp(maj.http, tentatives), error: `eBay a refusé la mise à jour de l'offre (${maj.http}) : ${e.message}` }, { etape: "offre_maj", http: maj.http, errorId: e.errorId, message: e.message }, { sku, offer_id: brouillon.offerId, tentatives });
      return { job: job.id, issue: "offre_maj", http: maj.http, ebay: e };
    }
    offerId = brouillon.offerId;
  } else {
    const cre = await appelEbay(env, token, "/sell/inventory/v1/offer", { method: "POST", body: offre });
    if (cre.http !== 201 && cre.http !== 200) {
      const e = lireErreurEbay(cre.json, cre.texte);
      await marquer(admin, job, { status: verdictHttp(cre.http, tentatives), error: `eBay a refusé la création de l'offre (${cre.http}${e.errorId ? `, ${e.errorId}` : ""}) : ${e.message}${e.parametres ? ` [${e.parametres}]` : ""}` }, { etape: "offre", http: cre.http, errorId: e.errorId, message: e.message }, { sku, tentatives });
      return { job: job.id, issue: "offre", http: cre.http, ebay: e };
    }
    offerId = String((cre.json as { offerId?: string } | null)?.offerId ?? "");
  }
  if (!offerId) {
    await marquer(admin, job, { status: "failed", error: "eBay a répondu sans offerId." }, { etape: "offre", quoi: "offer_id_absent" }, { sku });
    return { job: job.id, issue: "failed", motif: "offer_id_absent" };
  }

  // 6. publishOffer → listingId.
  const pub = await appelEbay(env, token, `/sell/inventory/v1/offer/${offerId}/publish`, { method: "POST" });
  if (pub.http !== 200) {
    const e = lireErreurEbay(pub.json, pub.texte);
    await marquer(admin, job, { status: verdictHttp(pub.http, tentatives), error: `eBay a refusé la publication (${pub.http}${e.errorId ? `, ${e.errorId}` : ""}) : ${e.message}${e.parametres ? ` [${e.parametres}]` : ""}` }, { etape: "publish", http: pub.http, errorId: e.errorId, message: e.message }, { sku, offer_id: offerId, tentatives });
    return { job: job.id, issue: "publish", http: pub.http, ebay: e };
  }
  const listingId = String((pub.json as { listingId?: string } | null)?.listingId ?? "");
  const avertissements = ((pub.json as { warnings?: Array<{ message?: string }> } | null)?.warnings ?? []).map((w) => String(w.message ?? "")).slice(0, 5);
  const publishedAt = new Date().toISOString();
  await marquer(admin, job,
    { status: "published", error: null, platform_listing_id: listingId, listing_url: urlAnnonce(listingId), published_at: publishedAt },
    { etape: "publie", http: 200, condition_envoyee: condition.enumValue, condition_id: condition.id, condition_libelle: condition.libelle, recalages, source_catalogue: cat.source, avertissements, sources: rempli.sources, ia: rempli.ia, categorie: { id: categoryId, source: categorie.source, detail: categorie.detail ?? null, chemin: categorie.chemin }, photos: { rapatriees: rap.rapatriees, deja_chez_nous: rap.deja_chez_nous, echecs: rap.echecs } },
    { sku, offer_id: offerId, listing_id: listingId, published_at: publishedAt, location_key: empl.cle, location_creee: empl.cree, tentatives });
  return { job: job.id, issue: "published", sku, offer_id: offerId, listing_id: listingId, url: urlAnnonce(listingId), condition: condition, categorie: { id: categoryId, source: categorie.source, detail: categorie.detail ?? null }, photos: { rapatriees: rap.rapatriees, deja_chez_nous: rap.deja_chez_nous, echecs: rap.echecs }, aspects, sources: rempli.sources, ia: rempli.ia, recalages, avertissements, emplacement: empl };
}

// ── Catégorie (règle validée par Nico, phase 0 (b)) ─────────────────────────
//   · mapping icône de l'app (pf.ebayCategoryId) = source première ;
//   · CONTRÔLE : suggestion eBay n°1 à la place du mapping SI le titre ne porte
//     aucun mot du chemin mappé ET que la suggestion est dans une autre
//     branche racine ;
//   · pas de mapping : suggestion n°1 si son chemin porte le Département
//     attendu par `genre` (ou article hors mode : genre vide), sinon
//     needs_user avec les 5 chemins — jamais une publication dans « Autres ».
const GENRE_DANS_CHEMIN: Record<string, RegExp> = {
  Femme: /\bfemme\b/i, Homme: /\bhomme\b/i, Fille: /\bfille\b/i, "Garçon": /gar[cç]on/i, "Bébé": /b[ée]b[ée]/i, Enfant: /enfant/i,
};
// ⛔ CONTRÔLE PAR SUGGESTION DÉSACTIVÉ (06/09 11:55) : sur « T-shirt Adidas
// Sergio Garcia vintage », la règle a REMPLACÉ le mapping 15687 (T-shirts
// homme) par la suggestion n°1 d'eBay 121889 (Livres > BD franco-belges) :
// « t-shirt » ne matchait pas « T-shirts » (pluriel) et la branche racine
// différait — un T-shirt publié en BD (annonce 820093913142, retirée). Le
// mapping icône de l'app gagne TOUJOURS tant que Nico n'a pas tranché une
// règle plus sûre (consensus des 5 suggestions ?) ; la suggestion ne sert
// qu'en l'absence de mapping.
const CONTROLE_CATEGORIE_PAR_SUGGESTION = true;
async function resoudreCategorie(env: EbayEnv, token: string, job: Job, pf: PlatformFields): Promise<{ id: string; chemin: string[]; source: string; detail?: string } | { choix: Array<{ id: string; chemin: string }>; motif: string }> {
  const mappee = String(pf.ebayCategoryId ?? "").trim();
  const cheminMappe = Array.isArray(pf.ebayCategoryPath) ? (pf.ebayCategoryPath as string[]) : [];
  const suggestions = await suggererCategories(env, token, job.title ?? "");
  const top = suggestions[0];
  if (mappee) {
    // Règle v2 PROPOSÉE (désactivée tant que Nico n'a pas tranché) — relevé du
    // 06/09 sur les 5 suggestions eBay :
    //   · « T-shirt Adidas Sergio Garcia vintage » : Sports/Collections, BD,
    //     T-shirts (le mapping, 3e), Polos, Cartes → pas de consensus, le
    //     mapping est DANS la liste → on le garde ;
    //   · « La Méthode Delavier de Musculation… » (mappé 137865 Haltères) :
    //     4 × Livres + 1 CD, le mapping ABSENT → consensus Livres → remplacer
    //     par la n°1 (171243 Non-fiction).
    // Donc : remplacer UNIQUEMENT si le mapping n'apparaît dans AUCUNE des 5
    // suggestions ET qu'au moins 4 des 5 partagent une racine différente de
    // celle du mapping. La règle v1 (mots du titre + autre racine) a publié
    // un T-shirt en BD ; elle est retirée.
    // Règle v2 EN PROPORTION (arbitrage Nico, 06/09 après-midi) :
    //   · n = suggestions rendues ; on ne conclut qu'avec n ≥ 3 ;
    //   · le mapping figure dans la liste → gardé ;
    //   · sinon, si ≥ 2/3 des n suggestions partagent la racine de la n°1 et
    //     que cette racine ≠ celle du mapping → changement de RACINE → JAMAIS
    //     en silence : needs_user avec les chemins, l'utilisateur tranche.
    //     Relancer le job SANS rien changer = garder le mapping de l'app
    //     (marque ebayCategorieAttente) ; changer l'icône/le genre = nouveau
    //     mapping.
    //   Relevé : Adidas (mapping 3e des 10) → gardé ; Delavier (6/9 Livres,
    //   mapping Haltères absent) → needs_user ; sweat (1 seule) → gardé.
    if (CONTROLE_CATEGORIE_PAR_SUGGESTION && top && top.id !== mappee) {
      const n = suggestions.length;
      const mappeeDansLaListe = suggestions.some((x) => x.id === mappee);
      const racineMappee = String(cheminMappe[0] ?? "");
      const racineTop = String(top.chemin[0] ?? "");
      const memeRacineQueTop = suggestions.filter((x) => (x.chemin[0] ?? "") === racineTop).length;
      const dejaTranche = Boolean((pf as Record<string, unknown>).ebayCategorieAttente);
      if (!dejaTranche && n >= 3 && !mappeeDansLaListe && racineTop && racineTop !== racineMappee && memeRacineQueTop * 3 >= n * 2) {
        return {
          choix: suggestions.slice(0, 5).map((x) => ({ id: x.id, chemin: x.chemin.join(" > ") })),
          motif: `classé par l'app en « ${cheminMappe.join(" > ")} » (${mappee}) ; eBay le voit plutôt en « ${racineTop} » (${memeRacineQueTop} suggestions sur ${n}, la 1re : ${top.chemin.join(" > ")})`,
        };
      }
    }
    return { id: mappee, chemin: cheminMappe, source: dejaTrancheSource(pf) };
  }
  if (top) {
    const genre = String(pf.genre ?? "").trim();
    const re = GENRE_DANS_CHEMIN[genre];
    const cheminTexte = top.chemin.join(" > ");
    if (!genre || !re || re.test(cheminTexte)) return { id: top.id, chemin: top.chemin, source: "suggestion" };
  }
  return { choix: suggestions.slice(0, 5).map((s) => ({ id: s.id, chemin: s.chemin.join(" > ") })), motif: "aucune catégorie eBay sur ce job et aucune suggestion eBay compatible avec le rayon" };
}
function dejaTrancheSource(pf: PlatformFields): string {
  return (pf as Record<string, unknown>).ebayCategorieAttente ? "mapping_confirme_par_relance" : "mapping";
}

function contexteDuJob(job: Job, pf: PlatformFields) {
  return {
    titre: job.title, description: job.description, marque: pf.marque as string | null, modele: pf.modele as string | null,
    matiere: pf.matiere as string | null, couleur: (Array.isArray(pf.colors) && pf.colors[0]) ? String(pf.colors[0]) : (pf.couleur as string | null),
    taille: pf.taille as string | null, genre: pf.genre as string | null, type: null,
    attributs: (pf.attributs_visibles && typeof pf.attributs_visibles === "object") ? pf.attributs_visibles as Record<string, unknown> : null,
  };
}

// ── MESURE (consigne Nico, 06/09) : sur N articles réels du stock d'un
// vendeur, combien passeraient SANS needs_user — catégorie, état, photos,
// aspects (job/standard/défauts + IA sous contrainte). Aucune publication,
// aucune écriture de job ; seul dépôt possible : le cache d'aspects.
// Options : ignorer_aspects_job (défaut true — on mesure l'IA, pas ce qu'un
// job antérieur ou une main a déjà posé) ; ignorer_champs_job (défaut false —
// true = contexte inventaire seul, sans marque/taille/couleur/genre du job).
async function mesurerAspects(admin: SupabaseClient, env: EbayEnv, body: { ebay_user_id?: string; limit?: number; inventaire_ids?: number[]; ignorer_aspects_job?: boolean; ignorer_champs_job?: boolean }): Promise<Record<string, unknown>> {
  const ignorerAspects = body.ignorer_aspects_job !== false;
  const ignorerChamps = body.ignorer_champs_job === true;
  const { data: compte } = await admin.from("ebay_accounts").select("user_id").eq("ebay_user_id", String(body.ebay_user_id ?? "")).maybeSingle();
  if (!compte) return { error: "compte eBay inconnu" };
  const jeton = await obtenirAccessToken(admin, compte.user_id);
  if (!jeton.ok) return { error: `jeton : ${jeton.motif}` };
  const token = jeton.token;
  let q = admin.from("inventaire").select("id, titre, description, marque, type, statut, prix_vente, photos").eq("user_id", compte.user_id).eq("statut", "stock").order("created_at", { ascending: false });
  if (Array.isArray(body.inventaire_ids) && body.inventaire_ids.length) q = q.in("id", body.inventaire_ids);
  const { data: articles } = await q.limit(Math.min(30, Number(body.limit) || 10));
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const lignes: Record<string, unknown>[] = [];
  for (const a of (articles ?? []) as Array<{ id: number; titre: string; description: string | null; marque: string | null; type: string | null; prix_vente: number | null; photos: unknown }>) {
    const photos = urlsPhotos(a.photos).length;
    // Catégorie : celle d'un job eBay existant (mapping icône de l'app), sinon suggestion eBay n°1.
    const { data: job } = await admin.from("cross_post_jobs").select("platform_fields").eq("inventaire_id", a.id).eq("platform", "ebay").not("platform_fields->>ebayCategoryId", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const pfJob = (job?.platform_fields ?? {}) as PlatformFields;
    let categorie = String(pfJob.ebayCategoryId ?? "");
    let categorieSource = categorie ? "job (mapping icône)" : "";
    let chemin: string[] = Array.isArray(pfJob.ebayCategoryPath) ? pfJob.ebayCategoryPath as string[] : [];
    if (!categorie) {
      const sugg = await suggererCategories(env, token, a.titre);
      if (sugg[0]) { categorie = sugg[0].id; chemin = sugg[0].chemin; categorieSource = "suggestion eBay n°1"; }
    }
    const base: PlatformFields = ignorerChamps
      ? { ebayCategoryId: pfJob.ebayCategoryId, ebayCategoryPath: pfJob.ebayCategoryPath as string[] | undefined }
      : { ...pfJob };
    if (ignorerAspects) { delete base.ebayAspects; delete base.ebayAspectsSources; }
    const pf: PlatformFields = { ...base, marque: (ignorerChamps ? null : pfJob.marque) ?? a.marque ?? null, etat: (ignorerChamps ? null : pfJob.etat) ?? "Très bon état", ebayCategoryPath: chemin };
    const ligne: Record<string, unknown> = { id: a.id, titre: a.titre, photos, categorie: categorie || null, categorie_source: categorieSource || "aucune", chemin: chemin.join(" > ") };
    if (!categorie) { lignes.push({ ...ligne, passe: false, bloque_par: "catégorie" }); continue; }
    const conditions = await conditionsCategorie(env, token, categorie);
    const condition = choisirCondition(pf.etat as string, conditions);
    ligne.condition = condition ? `${condition.enumValue} (${condition.id} ${condition.libelle})` : null;
    const cat = await aspectsCategorie(admin, env, token, categorie);
    if ("erreur" in cat) { lignes.push({ ...ligne, passe: false, bloque_par: `aspects : ${cat.erreur}` }); continue; }
    const rempli = await remplirAspects(pf, cat.aspects, { titre: a.titre, description: a.description, marque: pf.marque as string | null, type: a.type, genre: pf.genre as string | null, taille: pf.taille as string | null, couleur: pf.couleur as string | null }, apiKey);
    const requis = cat.aspects.filter((x) => x.required).map((x) => x.name);
    ligne.requis = requis;
    ligne.remplis = Object.fromEntries(Object.entries(rempli.aspects).map(([k, v]) => [k, `${v[0]} ← ${rempli.sources[k] ?? "?"}`]));
    ligne.ia = rempli.ia ? { demandes: rempli.ia.demandes, refuses: rempli.ia.refuses } : null;
    ligne.manquants = rempli.manquants;
    const bloque: string[] = [];
    if (!photos) bloque.push("photos");
    if (!condition) bloque.push("état");
    if (rempli.manquants.length) bloque.push(`aspects : ${rempli.manquants.join(", ")}`);
    lignes.push({ ...ligne, passe: bloque.length === 0, bloque_par: bloque.join(" ; ") || null });
  }
  const passes = lignes.filter((l) => l.passe).length;
  return { mode: { ignorer_aspects_job: ignorerAspects, ignorer_champs_job: ignorerChamps }, articles: lignes.length, passent_sans_needs_user: passes, lignes };
}

async function retirer(admin: SupabaseClient, env: EbayEnv, token: string, job: Job): Promise<Record<string, unknown>> {
  if (!job.inventaire_id) { await marquer(admin, job, { status: "failed", error: "Job de retrait sans inventaire_id." }, { etape: "controle", quoi: "inventaire_absent" }); return { job: job.id, issue: "failed" }; }
  const sku = skuPour(job.inventaire_id);
  // L'offre : celle du dernier job API publié pour cet article, sinon celle du SKU chez eBay.
  const { data: precedent } = await admin.from("cross_post_jobs").select("id, platform_fields").eq("inventaire_id", job.inventaire_id).eq("platform", "ebay").eq("voie", "api").eq("status", "published").order("created_at", { ascending: false }).limit(1).maybeSingle();
  let offerId = String(((precedent?.platform_fields as Record<string, unknown> | null)?.ebay_api as Record<string, unknown> | undefined)?.offer_id ?? "");
  if (!offerId) {
    const r = await appelEbay(env, token, `/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`);
    const offres = (r.json as { offers?: Array<{ offerId?: string; status?: string }> } | null)?.offers ?? [];
    offerId = String(offres.find((o) => o.status === "PUBLISHED")?.offerId ?? offres[0]?.offerId ?? "");
  }
  if (!offerId) {
    await marquer(admin, job, { status: "deleted", error: null }, { etape: "retrait", quoi: "aucune_offre", note: "rien à retirer chez eBay (aucune offre pour ce SKU)" }, { sku });
    return { job: job.id, issue: "deleted", note: "aucune offre" };
  }
  const w = await appelEbay(env, token, `/sell/inventory/v1/offer/${offerId}/withdraw`, { method: "POST" });
  if (w.http !== 200) {
    const e = lireErreurEbay(w.json, w.texte);
    await marquer(admin, job, { status: "failed", error: `eBay a refusé le retrait (${w.http}${e.errorId ? `, ${e.errorId}` : ""}) : ${e.message}` }, { etape: "withdraw", http: w.http, errorId: e.errorId, message: e.message }, { sku, offer_id: offerId });
    return { job: job.id, issue: "withdraw", http: w.http, ebay: e };
  }
  const listingId = String((w.json as { listingId?: string } | null)?.listingId ?? "");
  const withdrawnAt = new Date().toISOString();
  await marquer(admin, job, { status: "deleted", error: null, platform_listing_id: listingId || job.platform_listing_id }, { etape: "retire", http: 200 }, { sku, offer_id: offerId, listing_id: listingId || null, withdrawn_at: withdrawnAt });
  if (precedent?.id) {
    const pfPrec = { ...((precedent.platform_fields as Record<string, unknown>) ?? {}) };
    pfPrec.ebay_api = { ...((pfPrec.ebay_api as Record<string, unknown>) ?? {}), withdrawn_at: withdrawnAt };
    await admin.from("cross_post_jobs").update({ status: "cancelled", error: MSG_RETRAIT, platform_fields: pfPrec }).eq("id", precedent.id);
  }
  return { job: job.id, issue: "deleted", sku, offer_id: offerId, listing_id: listingId };
}

// Republication par API = retrait de l'annonce en ligne (si elle l'est encore)
// puis nouvelle publication de la même offre → nouveau listingId. Le job porte
// republish_step comme la voie formulaire ('deleted' puis 'recreated') pour
// que la frise de l'app reste lisible.
async function republier(admin: SupabaseClient, env: EbayEnv, token: string, job: Job): Promise<Record<string, unknown>> {
  if (!job.inventaire_id) { await marquer(admin, job, { status: "failed", error: "Job de republication sans inventaire_id." }, { etape: "controle", quoi: "inventaire_absent" }); return { job: job.id, issue: "failed" }; }
  const sku = skuPour(job.inventaire_id);
  const r = await appelEbay(env, token, `/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`);
  const offres = (r.json as { offers?: Array<{ offerId?: string; status?: string }> } | null)?.offers ?? [];
  const publiee = offres.find((o) => o.status === "PUBLISHED");
  if (publiee?.offerId) {
    const w = await appelEbay(env, token, `/sell/inventory/v1/offer/${publiee.offerId}/withdraw`, { method: "POST" });
    if (w.http !== 200) {
      const e = lireErreurEbay(w.json, w.texte);
      await marquer(admin, job, { status: "failed", error: `eBay a refusé le retrait avant republication (${w.http}) : ${e.message}` }, { etape: "withdraw", http: w.http, errorId: e.errorId }, { sku, offer_id: publiee.offerId });
      return { job: job.id, issue: "withdraw", http: w.http, ebay: e };
    }
    job.platform_fields = { ...(job.platform_fields ?? {}), republish_step: "deleted" };
  }
  const res = await publier(admin, env, token, job);
  if (res.issue === "published") {
    const { data: apres } = await admin.from("cross_post_jobs").select("platform_fields").eq("id", job.id).maybeSingle();
    const pf = { ...((apres?.platform_fields as Record<string, unknown>) ?? {}), republish_step: "recreated" };
    await admin.from("cross_post_jobs").update({ platform_fields: pf }).eq("id", job.id);
  }
  return { ...res, republication: true, retiree_avant: Boolean(publiee?.offerId) };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Méthode non autorisée", { status: 405 });
  const attendu = Deno.env.get("CRON_SECRET");
  if (!attendu || req.headers.get("x-cron-secret") !== attendu) return json({ error: "Non autorisé" }, 401);

  const body = await req.json().catch(() => ({})) as { job_id?: string; trigger?: string; action?: string; ebay_user_id?: string; limit?: number; inventaire_ids?: number[]; ignorer_aspects_job?: boolean; ignorer_champs_job?: boolean };
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const env = lireEnvEbay();
  if (body.action === "mesure_aspects") return json(await mesurerAspects(admin, env, body));

  let cible = admin.from("cross_post_jobs")
    .select("id, user_id, inventaire_id, platform, action, status, title, description, price, photos, platform_fields, listing_url, platform_listing_id, created_at, voie")
    .eq("platform", "ebay").eq("voie", "api").eq("status", "pending")
    .order("created_at", { ascending: true }).limit(LOT_MAX);
  if (body.job_id) cible = cible.eq("id", body.job_id);
  const { data: jobs, error } = await cible;
  if (error) return json({ error: error.message }, 500);
  if (!jobs?.length) return json({ traites: 0 });

  const resultats: Record<string, unknown>[] = [];
  for (const brut of jobs as Job[]) {
    // Claim atomique : seul celui qui fait passer pending → processing traite.
    const { data: pris } = await admin.from("cross_post_jobs").update({ status: "processing", handler_build: HANDLER_BUILD })
      .eq("id", brut.id).eq("status", "pending").select("id");
    if (!pris?.length) continue;
    const job = brut;
    try {
      const jeton = await obtenirAccessToken(admin, job.user_id);
      if (!jeton.ok) {
        const msg = jeton.motif === "non_connecte" ? "Ton compte eBay n'est pas relié à FillSell : connecte-le dans les Paramètres, puis relance."
          : jeton.motif === "revoque" ? "eBay a retiré l'accès de FillSell à ton compte : reconnecte-le dans les Paramètres, puis relance."
          : `Jeton eBay indisponible (${jeton.motif}${jeton.detail ? ` : ${jeton.detail}` : ""}).`;
        await marquer(admin, job, { status: jeton.motif === "refresh_echoue" ? "pending" : "needs_user", error: msg }, { etape: "jeton", quoi: jeton.motif, detail: jeton.detail ?? null });
        resultats.push({ job: job.id, issue: "jeton", motif: jeton.motif });
        continue;
      }
      if (job.action === "publish") resultats.push(await publier(admin, env, jeton.token, job));
      else if (job.action === "delete") resultats.push(await retirer(admin, env, jeton.token, job));
      else if (job.action === "republish") resultats.push(await republier(admin, env, jeton.token, job));
      else {
        await marquer(admin, job, { status: "failed", error: `Action « ${job.action} » non prise en charge par la voie API en 2a.` }, { etape: "controle", quoi: "action_non_geree" });
        resultats.push({ job: job.id, issue: "failed", motif: "action_non_geree" });
      }
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      console.error(`[ebay-api-worker] job ${job.id} : ${msg}`);
      await marquer(admin, job, { status: "failed", error: `Erreur interne du worker : ${msg.slice(0, 300)}` }, { etape: "interne", message: msg.slice(0, 300) });
      resultats.push({ job: job.id, issue: "interne", message: msg.slice(0, 300) });
    }
  }
  console.log(`[ebay-api-worker] ${resultats.length} job(s) : ${resultats.map((r) => `${String(r.job).slice(0, 8)}=${r.issue}`).join(", ")}`);
  return json({ traites: resultats.length, resultats });
});
