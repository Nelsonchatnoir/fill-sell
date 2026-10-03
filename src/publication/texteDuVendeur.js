// ═══════════════════════════════════════════════════════════════════════════
// LE TEXTE DU VENDEUR, REPRIS LÀ OÙ L'ARTICLE EST EN LIGNE (03/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico (03/10) : « Le texte du vendeur fait foi, QUELLE QUE SOIT LA
// PLATEFORME. Si FillSell n'a pas la description d'un article, on la reprend
// là où l'article est en ligne : Vinted, Beebs, Leboncoin ou eBay. »
//
// UN SEUL CHEMIN, pour le stepper à l'unité (StockTab.publierAvecDetail) et
// pour le lot (LotPublication) — avant que le moteur ne s'ouvre, jamais après.
// Rien de neuf n'est inventé : ce sont les sources qui existent déjà.
//   1. le RELEVÉ (annonces_plateforme.capture, depuis le 17/09 ; contenu relu
//      depuis le 21/09) : Leboncoin, Beebs, Opla — et eBay quand l'API l'a
//      déjà lue. Lecture en base, aucune plateforme touchée. La version EN
//      LIGNE la plus récente, comme le fait déjà le moteur (versionsTexte) ;
//   2. VINTED (article du dressing) : la capture de republication fraîche,
//      sinon le détail lu par l'extension — À L'UNITÉ, une lecture par
//      article (règle du chantier sync) ; le lot les espace au rythme des
//      dépôts (RYTHME_LECTURE_VINTED_MS) ;
//   3. eBAY : l'extension ne lit pas la description (aucune permission
//      ajoutée) ; l'API Browse la lit, côté serveur (ebay-account,
//      action lire_description), UNE annonce par appel.
// Rien de lisible → exactement le comportement d'avant (le moteur rédige,
// le lot fait relire).
//
// ⛔ ON COMPLÈTE, ON N'ÉCRASE JAMAIS : une fiche qui a déjà une description
//    n'est pas touchée (le moteur, lui, propose toujours la version en ligne
//    la plus récente quand la fiche n'a pas été retouchée — règle du 23/09).
// ⛔ La description reprise porte son marqueur (attributs.description_source =
//    releve_<plateforme> | vinted) : c'est lui qui la fait reconnaître comme
//    celle du vendeur, ici (texteDuVendeurFiche) comme au serveur
//    (generate-listing, « LE TEXTE DU VENDEUR FAIT FOI »).
import { attributsDepuisVinted } from "../utils/vintedAttributs";
import { demanderDetailArticleVinted, ecouterDetailArticleVinted } from "../utils/vintedSync";

/** L'écart entre deux lectures VINTED d'un même lot : celui des dépôts de
 *  l'extension (8 à 20 s), jamais une rafale. */
export const RYTHME_LECTURE_VINTED_MS = [8000, 20000];
/** L'écart entre deux lectures eBAY (API officielle, budget partagé). */
export const RYTHME_LECTURE_EBAY_MS = [1500, 3000];
/** Le délai d'une lecture de détail Vinted à l'unité (inchangé depuis le 03/08). */
export const DELAI_DETAIL_VINTED_MS = 12000;

const vide = (v) => !String(v ?? "").trim();

/** Faut-il passer par ici avant d'ouvrir le moteur ? (pur) */
export function aCompleter(item) {
  if (!item) return false;
  if (vide(item.description)) return true;
  return item.origine === "vinted_sync" && Boolean(item.vinted_item_id) && !item.vinted_catalog_id;
}

/**
 * La version EN LIGNE la plus récente d'une description relevée (pur).
 * Même ordre que le moteur (ListingPreviewScreen, versionsTexte) : en ligne
 * d'abord, la plus récente gagne ; une ligne sans texte ne compte pas.
 * @param {Array<{platform:string, capture?:object, capture_le?:string, vu_le?:string, statut_plateforme?:string}>} lignes
 * @returns {{platform:string, description:string}|null}
 */
export function choisirDescriptionEnLigne(lignes) {
  const avecTexte = (Array.isArray(lignes) ? lignes : [])
    .map((l) => ({ platform: String(l?.platform ?? ""), description: String(l?.capture?.description ?? "").trim(),
      date: String(l?.capture_le ?? l?.vu_le ?? ""), enLigne: l?.statut_plateforme === "en_ligne" }))
    .filter((l) => l.platform && l.description);
  if (!avecTexte.length) return null;
  avecTexte.sort((a, b) => (a.enLigne === b.enLigne ? b.date.localeCompare(a.date) : (a.enLigne ? -1 : 1)));
  return { platform: avecTexte[0].platform, description: avecTexte[0].description };
}

/** Le marqueur d'une description reprise d'un relevé (pur). */
export function marqueurReleve(platform, at = new Date().toISOString()) {
  const source = `releve_${platform}`;
  return { description_source: { v: source, source, at } };
}

async function lireReleves(supabase, inventaireId) {
  const { data, error } = await supabase
    .from("annonces_plateforme")
    .select("platform, capture, capture_le, vu_le, statut_plateforme")
    .eq("inventaire_id", inventaireId)
    .is("disparu_le", null)
    .order("vu_le", { ascending: false })
    .limit(8);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// Compléter la fiche SI elle est encore vide en base (filtre .or) : deux
// écrans ouverts, une seule écriture gagne, et jamais sur un texte existant.
async function completerFiche(supabase, userId, id, patch) {
  await supabase.from("inventaire").update(patch)
    .eq("id", id).eq("user_id", userId).or("description.is.null,description.eq.")
    .then(() => {}, () => {});
}

/** Le détail d'UN article Vinted, lu par l'extension (pont de la page). */
export function lireDetailVintedParExtension(vintedItemId, delaiMs = DELAI_DETAIL_VINTED_MS) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { stop(); resolve(null); }, delaiMs);
    const stop = ecouterDetailArticleVinted((d) => {
      if (String(d.vintedItemId) !== String(vintedItemId)) return;
      clearTimeout(timer); stop(); resolve(d);
    });
    demanderDetailArticleVinted(vintedItemId);
  });
}

/**
 * Complète la fiche d'un article avec le texte du vendeur, là où il est en ligne.
 *
 * @param item  la ligne du Stock (mapItem : id, description, origine, vinted_item_id, vinted_catalog_id, title, sell, marque)
 * @param opts.supabase
 * @param opts.userId
 * @param opts.extensionVinted   l'extension de CET appareil sait lire un détail Vinted
 * @param opts.lireEbay          (inventaireId) => Promise<{description}|null> — null pour ne pas lire eBay
 * @param opts.delaiDetailMs     délai d'une lecture Vinted
 * @param opts.avantLecture      (plateforme) => void|Promise — juste avant une lecture qui touche une plateforme
 * @param opts.lireDetailVinted  (vintedItemId, delaiMs) => Promise<detail|null> — l'extension par défaut (injectable pour le selftest)
 * @returns {Promise<{item, source: string|null, lectures: string[], note: null|'vinted_sans_extension'|'vinted_echec'}>}
 *   `item` = l'article complété (description, vinted_catalog_id) ; `source` = d'où vient la description reprise.
 */
export async function completerTexteDuVendeur(item, {
  supabase, userId, extensionVinted = false, lireEbay = null, delaiDetailMs = DELAI_DETAIL_VINTED_MS, avantLecture = null,
  lireDetailVinted = lireDetailVintedParExtension,
} = {}) {
  let it = { ...item };
  const res = { item: it, source: null, lectures: [], note: null };
  if (!aCompleter(it) || !supabase || !userId) return res;

  // ── 1. LE RELEVÉ — la version en ligne, déjà en base ───────────────────
  if (vide(it.description)) {
    try {
      const choisie = choisirDescriptionEnLigne(await lireReleves(supabase, it.id));
      if (choisie) {
        await completerFiche(supabase, userId, it.id, { description: choisie.description, attributs: marqueurReleve(choisie.platform) });
        it = { ...it, description: choisie.description };
        res.source = `releve_${choisie.platform}`;
      }
    } catch { /* le relevé est un raccourci : son échec ne bloque jamais */ }
  }

  // ── 2. VINTED — capture fraîche, sinon le détail par l'extension ───────
  // Le chemin du 03/08 (publierAvecDetail), à l'identique : la description
  // OU la catégorie manquante déclenche la lecture, la capture fraîche passe
  // avant le réseau.
  const vinted = it.origine === "vinted_sync" && it.vinted_item_id && (vide(it.description) || !it.vinted_catalog_id);
  if (vinted) {
    // LE CACHE AVANT LE RÉSEAU (07/09) : capture de republication valide, de
    // moins de 30 jours, et article inchangé depuis (titre ET prix).
    let parCapture = false;
    try {
      const ilYA30j = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data: caps } = await supabase
        .from("vinted_republish_captures")
        .select("captured_at, libelles, payload")
        .eq("inventaire_id", it.id)
        .eq("verdict", "valide")
        .gte("captured_at", ilYA30j)
        .order("captured_at", { ascending: false })
        .limit(1);
      const cap = caps?.[0] ?? null;
      const natif = cap?.payload?.natif ?? null;
      const titreCapture = String(cap?.payload?.titre ?? natif?.title ?? "").trim();
      const prixCapture = natif?.price?.amount != null ? parseFloat(String(natif.price.amount)) : null;
      const memeArticle = cap
        && titreCapture === String(it.title ?? it.titre ?? "").trim()
        && (prixCapture == null || it.sell == null || Math.abs(prixCapture - Number(it.sell)) < 0.005);
      if (memeArticle) {
        const t = attributsDepuisVinted(cap.libelles, natif, "capture", { marqueDejaConnue: Boolean(String(it.marque ?? "").trim()) });
        const maj = {};
        if (Object.keys(t.attributs).length) maj.attributs = t.attributs;
        if (t.catalogId && !it.vinted_catalog_id) maj.vinted_catalog_id = t.catalogId;
        if (t.description && vide(it.description)) maj.description = t.description;
        if (Object.keys(maj).length) {
          await supabase.from("inventaire").update(maj).eq("id", it.id).eq("user_id", userId).then(() => {}, () => {});
        }
        if (maj.description) { it = { ...it, description: maj.description }; res.source = "capture"; }
        if (maj.vinted_catalog_id) it = { ...it, vinted_catalog_id: maj.vinted_catalog_id };
        parCapture = true;
      }
    } catch { /* le cache est un raccourci : son échec ne bloque jamais */ }

    if (!parCapture) {
      if (!extensionVinted) {
        if (vide(it.description)) res.note = "vinted_sans_extension";
      } else {
        await avantLecture?.("vinted");
        res.lectures.push("vinted");
        const detail = await lireDetailVinted(it.vinted_item_id, delaiDetailMs);
        const catalogId = Number(detail?.natif?.catalog_id);
        const catalogAEcrire = Number.isFinite(catalogId) && catalogId > 0 && !it.vinted_catalog_id ? catalogId : null;
        // Ce que le détail porte AUSSI (taille, état, marque, couleurs, colis) :
        // écrit dans attributs, source vinted_detail — la base arbitre.
        if (detail?.success && detail.libelles) {
          try {
            const t = attributsDepuisVinted(detail.libelles, detail.natif, "vinted_detail", { marqueDejaConnue: Boolean(String(it.marque ?? "").trim()) });
            if (Object.keys(t.attributs).length) {
              await supabase.from("inventaire").update({ attributs: t.attributs }).eq("id", it.id).eq("user_id", userId).then(() => {}, () => {});
            }
          } catch { /* enrichissement best-effort */ }
        }
        if (detail?.success && detail.description && vide(it.description)) {
          await supabase.from("inventaire")
            .update({ description: detail.description, ...(catalogAEcrire ? { vinted_catalog_id: catalogAEcrire } : {}) })
            .eq("id", it.id).eq("user_id", userId).then(() => {}, () => {});
          it = { ...it, description: detail.description, ...(catalogAEcrire ? { vinted_catalog_id: catalogAEcrire } : {}) };
          res.source = "vinted_detail";
        } else {
          if (catalogAEcrire) {
            await supabase.from("inventaire").update({ vinted_catalog_id: catalogAEcrire })
              .eq("id", it.id).eq("user_id", userId).then(() => {}, () => {});
            it = { ...it, vinted_catalog_id: catalogAEcrire };
          }
          if (vide(it.description)) res.note = "vinted_echec";
        }
      }
    }
  }

  // ── 3. eBAY — la voie API, quand une annonce eBay de l'article est relevée
  if (vide(it.description) && lireEbay) {
    let aEbay = false;
    try {
      const { data } = await supabase.from("annonces_plateforme").select("listing_id")
        .eq("inventaire_id", it.id).eq("platform", "ebay").is("disparu_le", null).limit(1);
      aEbay = Array.isArray(data) && data.length > 0;
    } catch { aEbay = false; }
    if (aEbay) {
      await avantLecture?.("ebay");
      res.lectures.push("ebay");
      try {
        const r = await lireEbay(it.id);
        const t = String(r?.description ?? "").trim();
        if (t) {
          it = { ...it, description: t };
          res.source = "releve_ebay";
          if (res.note) res.note = null;
        }
      } catch { /* lecture impossible : comportement d'avant */ }
    }
  }

  if (!vide(it.description) && res.note) res.note = null;
  res.item = it;
  return res;
}
