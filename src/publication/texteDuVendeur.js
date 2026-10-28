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
import {
  demanderDetailArticleVinted, ecouterDetailArticleVinted, sonderPontExtension, signalerPontMort, versionAuMoins,
  PUBLIC_VERSION_MIN, demanderAnnoncePubliqueVinted, ecouterAnnoncePubliqueVinted,
} from "../utils/vintedSync";

/** L'écart entre deux lectures VINTED d'un même lot : celui des dépôts de
 *  l'extension (8 à 20 s), jamais une rafale. */
export const RYTHME_LECTURE_VINTED_MS = [8000, 20000];
/** L'écart entre deux lectures eBAY (API officielle, budget partagé). */
export const RYTHME_LECTURE_EBAY_MS = [1500, 3000];
/** Le délai d'une lecture de détail Vinted à l'unité (inchangé depuis le 03/08). */
export const DELAI_DETAIL_VINTED_MS = 12000;

// ── (28/10, Cédric GRIZSTYLE — « vinted_echec » au clic « Publier ») JAMAIS UNE RAFALE DE PAGES VINTED ──────────────
// Depuis le 26/10 (89b29f7) le lot lançait toutes ses pages publiques Vinted d'un coup ; l'extension les lisait l'une
// derrière l'autre (~1,1 s chacune). Mesuré en base (usage_logs « lecture_fond », origine « page ») : Cédric, 15 pages
// en 17 s le 27/10 à 22:33 puis 429 de Vinted sur les 9 suivantes ; axel terver, 8 pages en 43 s puis 429 (27/10
// 01:05). Un refus coupe TOUTE lecture Vinted du poste 6 h : son clic « Publier » de 23:42 n'a rien pu lire. Les rythmes
// qui n'ont jamais eu un refus : les lectures demandées (8 à 20 s, des centaines) et les rafales de 5 pages au plus.
// Règle, pour TOUTE page publique demandée par l'app (stepper, lot, Stock) : 3 départs d'affilée au plus, puis un
// départ toutes les 8 à 20 s (RYTHME_LECTURE_VINTED_MS) ; la rafale se recharge après 60 s sans lecture.
export const RAFALE_LECTURE_VINTED = 3;
export const REPOS_RAFALE_VINTED_MS = 60_000;

/**
 * Quand la prochaine page publique Vinted peut-elle partir ? (pur, testé : vitesse-publication-selftest)
 * @param {{dernier: number|null, enRafale: number}} etat  le créneau partagé (le dernier départ réservé)
 * @returns {{ attenteMs: number, etat: {dernier: number, enRafale: number} }}
 */
export function prochainDepartLectureVinted(etat, maintenant = Date.now(), {
  rafale = RAFALE_LECTURE_VINTED, ecart = RYTHME_LECTURE_VINTED_MS, repos = REPOS_RAFALE_VINTED_MS, alea = Math.random,
} = {}) {
  const dernier = Number.isFinite(etat?.dernier) ? etat.dernier : null;
  const enRafale = dernier == null || maintenant - dernier >= repos ? 0 : Math.max(0, Number(etat?.enRafale) || 0);
  if (enRafale < rafale) {
    const depart = Math.max(maintenant, dernier ?? maintenant);
    return { attenteMs: depart - maintenant, etat: { dernier: depart, enRafale: enRafale + 1 } };
  }
  const [min, max] = ecart;
  const depart = Math.max(maintenant, dernier + min + alea() * (max - min));
  return { attenteMs: depart - maintenant, etat: { dernier: depart, enRafale: enRafale + 1 } };
}
// Le créneau de CETTE page (un seul pour l'app : le stepper, le lot et le Stock partagent la même extension).
let creneauVinted = { dernier: null, enRafale: 0 };
async function attendreCreneauLectureVinted() {
  const r = prochainDepartLectureVinted(creneauVinted);
  creneauVinted = r.etat;
  if (r.attenteMs > 0) await new Promise((ok) => setTimeout(ok, r.attenteMs));
}

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

/** Le détail d'UN article Vinted, lu par l'extension par le formulaire d'édition (pont de la page). */
function lireDetailEditionParExtension(vintedItemId, delaiMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { stop(); resolve(null); }, delaiMs);
    const stop = ecouterDetailArticleVinted((d) => {
      if (String(d.vintedItemId) !== String(vintedItemId)) return;
      clearTimeout(timer); stop(); resolve(d);
    });
    demanderDetailArticleVinted(vintedItemId);
  });
}

// ── (28/10, jocabroc8) PENDANT UN DÉPÔT, LA LECTURE ATTEND SON TOUR : UNE SEULE DEMANDE PAR ANNONCE ────────────────
// L'extension lit la page publique SOUS le verrou des onglets de travail (background.js, FETCH_VINTED_PUBLIC →
// withJobFlowLock) : pendant un dépôt (Leboncoin : 1 à 7 min) ou un poll, sa réponse n'arrive qu'à la fin. La page,
// elle, n'attendait que 12 s, puis redemandait par le formulaire d'édition (derrière le même verrou), et l'écran
// d'attente recommençait toutes les 6 s : autant de lectures empilées, faites d'affilée dès le verrou rendu — mesuré
// le 28/10 à 17:25:54, 17:26:04, 17:26:10, 17:26:14 : quatre pages Vinted de la même annonce en 20 s. Désormais une
// demande reste EN VOL jusqu'à sa réponse (DEMANDE_PUBLIQUE_MAX_MS au plus) : un nouvel appel pour la même annonce
// s'y rattache, sans nouvelle commande ni nouveau créneau ; sans réponse dans son délai, l'appelant apprend
// « sans_reponse » (l'extension est occupée — elle lira, et pose le texte sur la fiche, que l'écran relit en base),
// jamais une seconde demande par le formulaire d'édition.
export const DEMANDE_PUBLIQUE_MAX_MS = 8 * 60_000;
const demandesPubliquesEnVol = new Map();   // vintedItemId → { promesse, jusqua }
/** Une lecture de la page publique de cette annonce est-elle déjà demandée à l'extension ? */
export function lecturePubliqueEnVol(vintedItemId, maintenant = Date.now()) {
  const d = demandesPubliquesEnVol.get(String(vintedItemId));
  return Boolean(d && maintenant < d.jusqua);
}
const auPlus = (promesse, ms) => new Promise((resolve) => {
  const t = setTimeout(() => resolve(null), ms);
  promesse.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(null); });
});

/** La PAGE PUBLIQUE d'UN article Vinted, lue par l'extension ≥ 0.6.144 (pont de la page). */
function lireAnnoncePubliqueParExtension(vintedItemId, delaiMs) {
  const cle = String(vintedItemId);
  if (lecturePubliqueEnVol(cle)) return auPlus(demandesPubliquesEnVol.get(cle).promesse, delaiMs);
  let resoudre = () => {};
  const promesse = new Promise((ok) => { resoudre = ok; });
  const stop = ecouterAnnoncePubliqueVinted((d) => {
    if (String(d.vintedItemId) !== cle) return;
    stop();
    if (demandesPubliquesEnVol.get(cle)?.promesse === promesse) demandesPubliquesEnVol.delete(cle);
    resoudre(d);
  });
  demandesPubliquesEnVol.set(cle, { promesse, jusqua: Date.now() + DEMANDE_PUBLIQUE_MAX_MS });
  setTimeout(() => {
    if (demandesPubliquesEnVol.get(cle)?.promesse !== promesse) return;
    stop(); demandesPubliquesEnVol.delete(cle); resoudre(null);
  }, DEMANDE_PUBLIQUE_MAX_MS);
  demanderAnnoncePubliqueVinted(cle);
  return auPlus(promesse, delaiMs);
}

/**
 * Le détail d'UN article Vinted, lu par l'extension de CET ordinateur.
 * (25/10 — Louis) D'abord : le pont est-il vivant ? Un onglet resté ouvert pendant une mise à jour de l'extension
 * a un pont MORT — on le sait en 1,5 s au lieu d'attendre 12 ou 25 s sans réponse ({ pontMort: true }). Puis, avec
 * une extension ≥ 0.6.144, la PAGE PUBLIQUE de l'annonce (texte, couleur, rayon : une page vue, jamais le formulaire
 * d'édition, lisible quel que soit le compte Vinted ouvert) ; le formulaire d'édition n'est plus qu'un repli.
 */
export async function lireDetailVintedParExtension(vintedItemId, delaiMs = DELAI_DETAIL_VINTED_MS, {
  sonder = sonderPontExtension, attendreCreneau = attendreCreneauLectureVinted,
} = {}) {
  const pont = await sonder();
  if (!pont?.vivant) {
    signalerPontMort();
    return { success: false, pontMort: true, retardMs: pont?.retardMs ?? null };
  }
  if (versionAuMoins(pont.version, PUBLIC_VERSION_MIN)) {
    // (28/10) Jamais une rafale : au-delà de 3 d'affilée, une page toutes les 8 à 20 s (le délai court après le départ).
    // Une demande déjà en vol pour cette annonce ne consomme pas de créneau : aucune page de plus ne sera lue.
    if (!lecturePubliqueEnVol(vintedItemId)) await attendreCreneau();
    const p = await lireAnnoncePubliqueParExtension(vintedItemId, delaiMs);
    if (p?.success || p?.ok) {
      return {
        success: true, source: "page_publique", description: p.description ?? null,
        natif: { catalog_id: p.catalog_id ?? null }, libelles: null, publique: p,
      };
    }
    // Vinted a demandé une vérification, ou l'annonce n'existe plus : on ne relit pas par un autre chemin.
    if (["antirobot", "antirobot_pause", "introuvable"].includes(String(p?.motif ?? ""))) {
      return { success: false, motif: p.motif, publique: p };
    }
    // (28/10) Aucune réponse dans le délai : l'extension est occupée (dépôt ou poll sous le verrou des onglets de
    // travail). Sa lecture partira à la fin et posera le texte sur la fiche : on ne redemande pas par le formulaire
    // d'édition, qui attendrait derrière le même verrou puis relirait la même annonce une fois de plus.
    if (p == null) return { success: false, motif: "sans_reponse", occupee: true };
  }
  return lireDetailEditionParExtension(vintedItemId, delaiMs);
}

/** Les attributs que la page publique porte (couleur, rayon, marque), source vinted_detail — la base arbitre (pur). */
export function attributsDepuisPagePublique(p, at = new Date().toISOString()) {
  const out = {};
  const poser = (k, v) => { const s = typeof v === "string" ? v.trim() : v; if (s !== null && s !== undefined && s !== "") out[k] = { v: s, source: "vinted_detail", at }; };
  poser("couleur", p?.couleur ?? null);
  poser("couleur2", p?.couleur2 ?? null);
  poser("marque", p?.marque ?? null);
  const cat = Number(p?.catalog_id);
  if (Number.isFinite(cat) && cat > 0) poser("categorie_vinted", cat);
  if (Object.keys(out).length) out.page_publique_lue = { v: at, source: "vinted_detail", at, via: "page" };
  return out;
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
 * @returns {Promise<{item, source: string|null, lectures: string[], note: null|'vinted_sans_extension'|'vinted_echec'|'pont_mort'|'sans_description'}>}
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
        if (detail?.success) res.vintedLue = true;
        const catalogId = Number(detail?.natif?.catalog_id);
        const catalogAEcrire = Number.isFinite(catalogId) && catalogId > 0 && !it.vinted_catalog_id ? catalogId : null;
        // (25/10) La page publique : couleur, rayon, marque — source vinted_detail, la base arbitre.
        if (detail?.success && detail.source === "page_publique") {
          try {
            const a = attributsDepuisPagePublique(detail.publique);
            if (Object.keys(a).length) {
              await supabase.from("inventaire").update({ attributs: a }).eq("id", it.id).eq("user_id", userId).then(() => {}, () => {});
            }
          } catch { /* enrichissement best-effort */ }
        }
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
          // (25/10) Pont mort (onglet resté ouvert pendant une mise à jour de l'extension) : dit tel quel — la page
          // propose de se recharger, et la lecture passe par l'ordinateur en attendant.
          // (25/10, Nico) Lue, mais l'annonce n'a VRAIMENT aucun texte : « sans_description » — le seul cas où l'app
          // propose « Écrire ma description ». Une lecture ratée reste « vinted_echec ».
          if (vide(it.description)) res.note = detail?.pontMort ? "pont_mort" : (detail?.success ? "sans_description" : "vinted_echec");
          // (28/10) La trace dit pourquoi : le retard du minuteur d'un pont mort, ou une extension occupée (sous verrou).
          if (detail?.pontMort && detail.retardMs != null) res.pontRetardMs = detail.retardMs;
          if (detail?.occupee) res.extensionOccupee = true;
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
  // (25/10) Une lecture faite ICI (stepper, lot) ferme la demande de lecture d’origine : sans cela, elle restait
  // ouverte — comptée 7 jours dans le Stock, et la file du compte retenue jusqu’à 15 min pour une lecture déjà faite.
  if (it.origine === "vinted_sync" && (res.vintedLue || res.source)) {
    try { await supabase.rpc("lecture_origine_faite", { p_fiche: Number(it.id) }); } catch { /* best-effort */ }
  }
  res.item = it;
  return res;
}
