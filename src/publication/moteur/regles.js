// ═══════════════════════════════════════════════════════════════════════════
// LE MOTEUR DE PUBLICATION — LES RÈGLES, SANS ÉCRAN
// (refonte du stepper, 24/09/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Tout ce qui, dans components/ListingPreviewScreen.jsx, DÉCIDAIT (qui part,
// qui est exclu, ce qui bloque, comment se construit un job, ce que la garde
// eBay refuse) vivait dans des closures de composant. Ces règles sont ici,
// en fonctions PURES : pas de React, pas de Supabase, pas d'état. Elles se
// lisent à l'unité (un article) et en boucle (la publication en masse).
//
// ⛔ CE FICHIER NE CHANGE PAS LE COMPORTEMENT DE L'ANCIEN STEPPER. Chaque
//    fonction est la transcription MOT POUR MOT du code qu'elle remplace ; les
//    commentaires d'origine qui expliquent une décision sont repris. La preuve
//    est scripts/publication-moteur-selftest.mjs, qui rejoue les cas connus.
// Les dépendances qui ne sont pas pures (normalisation des titres, quota photo
// Leboncoin, forme des photos, rapprochement d'aspects) sont PASSÉES en
// paramètre (`outils`) : le moteur n'importe rien qui ne soit pas une règle.

import { natureAttente } from "../../utils/etatsPublication.js";

// ── Un aspect BLOQUE-t-il la publication ? ───────────────────────────────────
// Règle unique (2026-07-29) partagée par la garde du CTA, la liste des motifs
// du bouton gris et l'encart des questions : "missing" bloque toujours
// (absence de valeur), "invalid" ne bloque que contre une liste qui FAIT FOI
// (a.blocking === true). « missing » non bloquant (2026-09-02) : un champ
// FERMÉ dont la liste n'a jamais été relevée porte blocking:false — on ne
// demande RIEN à l'utilisateur.
export const aspectBloquant = (a) =>
  (a.state === "missing" && a.blocking !== false) || (a.state === "invalid" && a.blocking === true);

// ── Les plateformes qui PEUVENT partir (2026-08-11) ─────────────────────────
// Une seule liste, lue par toutes les gardes : sélectionnée ET générée, moins
// l'adresse de remise absente, moins le produit interdit. « Ce qui ne part pas
// ne bloque pas, et ne se facture pas. »
export function plateformesPubliables({ selected, platformListings, lbcAdresseManquante, platformSupport }) {
  return new Set(
    [...(selected ?? [])]
      .filter(p => platformListings?.platforms?.[p])
      .filter(p => !(lbcAdresseManquante?.plateformes ?? []).includes(p))
      .filter(p => platformSupport?.[p] !== "prohibited")
  );
}

// ── Les champs obligatoires BLOQUANTS, par plateforme ────────────────────────
// (handlePublish, refonte du 03/09 soir) : { leboncoin: ["Produit"], … }.
export function champsBloquantsParPlateforme(genericRequiredStatus) {
  const out = {};
  for (const [gp, list] of Object.entries(genericRequiredStatus ?? {})) {
    const bloquants = (list ?? []).filter(aspectBloquant).map(a => a.label ?? a.key);
    if (bloquants.length) out[gp] = bloquants;
  }
  return out;
}

// Règle 2 (03/09 soir) : une plateforme au champ obligatoire BLOQUANT ne part
// pas à ce clic — elle sort AUSSI du compte et du total du CTA.
export function plateformesBloqueesChamps(publiables, genericRequiredStatus) {
  return [...(publiables ?? [])].filter(p => (genericRequiredStatus?.[p] ?? []).some(aspectBloquant));
}

// ── GARDE « DESCRIPTION VINTED VIDE » (2026-09-12, dossier Anaïs) ────────────
// Vinted refuse toute création d'annonce sans description ; on le sait AVANT
// le clic. BORNÉE à la COPIE Vinted qui part dans le job.
// `liste` : l'ancien stepper passe `selected` (comportement historique) ; le
// nouveau passe `plateformesPubliables` — une copie Vinted qui ne partira pas
// (pas de copie générée, produit interdit) n'a rien à exiger.
export function descriptionVintedVide(liste, edited) {
  const vinted = liste instanceof Set ? liste.has("vinted") : (liste ?? []).includes("vinted");
  return vinted && !String(edited?.vinted?.description ?? "").trim();
}

// ── LES EXCLUSIONS AU CLIC PUBLIER (handlePublish, 2026-08-10 → 03/09) ──────
// Quatre filtres, dans cet ordre, et rien d'autre :
//   · sans adresse de remise (Leboncoin, Beebs) — lue FRAÎCHE au clic ;
//   · produit INTERDIT par la plateforme (recalculé sur platformSupport) ;
//   · SANS ANNONCE générée (une copie vide partirait en job vide) ;
//   · un champ obligatoire BLOQUANT (règle 2 : la plateforme attend, les
//     autres partent).
// Rend aussi la liste NOMMÉE des exclues : c'est ce que l'ancien stepper ne
// disait jamais (« exclusions silencieuses », audit du 23/09, section 4.4).
export function calculerExclusions({ selected, platformSupport, platformListings, plateformesSansAdresse = [], champsManquantsParPf = {} }) {
  const sel = [...(selected ?? [])];
  const sansAdresse = [...(plateformesSansAdresse ?? [])];
  const interdites = sel.filter(p => platformSupport?.[p] === "prohibited");
  const sansAnnonce = sel.filter(p => !platformListings?.platforms?.[p]);
  const champManquant = Object.keys(champsManquantsParPf ?? {});
  const aPublier = sel.filter(
    p => !sansAdresse.includes(p)
      && !interdites.includes(p)
      && !sansAnnonce.includes(p)
      && !champManquant.includes(p)
  );
  const exclues = [];
  for (const p of sel) {
    if (aPublier.includes(p)) continue;
    const motif = sansAdresse.includes(p) ? "sans_adresse"
      : interdites.includes(p) ? "interdite"
      : sansAnnonce.includes(p) ? "sans_annonce"
      : "champ_manquant";
    exclues.push(motif === "champ_manquant"
      ? { platform: p, motif, champs: champsManquantsParPf[p] ?? [] }
      : { platform: p, motif });
  }
  return { aPublier, interdites, sansAnnonce, sansAdresse, champManquant, exclues };
}

// Quand plus RIEN ne reste : le motif à dire, dans l'ordre exact de l'ancien
// code (interdites → champ manquant → sans annonce → sans adresse).
export function motifAucunePlateforme(exclusions) {
  if (exclusions.aPublier.length) return null;
  if (exclusions.interdites.length) return "interdites";
  if (exclusions.champManquant.length) return "champ_manquant";
  if (exclusions.sansAnnonce.length && !exclusions.sansAdresse.length) return "sans_annonce";
  return "sans_adresse";
}

// ── LA CLÉ DES REQUIS D'UNE CATÉGORIE (n°7 Louis, ISBN selon le RAYON) ──────
// L'ancien stepper lisait les requis génériques sous la clé de l'ICÔNE
// (📚 → « Livres et médias > Livres > Fiction »), quel que soit le rayon
// réellement publié. Un livre de coloriage (rayon 5427, sans ISBN chez Vinted)
// se voyait donc exiger un ISBN. Le nouveau stepper passe le chemin RÉSOLU
// (pré-calcul de la génération, ou choix de la personne) ; l'ancien passe
// null et garde sa clé d'icône, à l'identique.
// MÊME clé que categoryKeyOf de l'extension : chemin joint par " > ".
export function cleCategorieRequis({ cheminResolu = null, cheminIcone = null }) {
  const chemin = Array.isArray(cheminResolu) && cheminResolu.length ? cheminResolu : cheminIcone;
  if (!Array.isArray(chemin) || !chemin.length) return null;
  return chemin.join(" > ");
}

// ── LES LIGNES DE JOBS (handlePublish, `rows`) ──────────────────────────────
// Une ligne par plateforme, dans l'ordre reçu. Photos du JOB, par plateforme :
// identiques partout SAUF plafonnement Leboncoin (quota gratuit par feuille).
// Forme du JOB garantie ICI : des objets { type, url }, jamais une chaîne.
// `outils` : entreesPhotos (utils/photos), getLbcFreePhotoQuota
// (utils/lbcCategories), normalizeVintedTitle (utils/vintedTitle).
// Rend { rows, erreur, journal } ; erreur "ebay_sans_photo" reproduit le throw
// de l'ancien code (eBay par API exige au moins une image).
export function construireJobs({
  plateformes, champsResolus, processedPhotos, lbcAddress = null,
  userId, inventaireId = null, photoOption, edited, price, ebayVoieApiReelle = false, outils,
}) {
  const { entreesPhotos, getLbcFreePhotoQuota, normalizeVintedTitle } = outils;
  const rows = [];
  const journal = [];
  for (const platform of plateformes) {
    const pf = champsResolus[platform];
    const photosJob = entreesPhotos(processedPhotos);
    let rowPhotos = photosJob;
    if (platform === "ebay" && ebayVoieApiReelle && !photosJob.length) {
      return { rows: null, erreur: "ebay_sans_photo", journal };
    }
    // L'adresse de remise reste au clic (déplacement du 20/09) : mêmes deux
    // affectations qu'avant, au même moment qu'avant.
    if (lbcAddress && (platform === "leboncoin" || platform === "beebs")) pf.adresse = lbcAddress;
    if (platform === "leboncoin") {
      // Quota de photos GRATUITES (2026-08-10) : en Divers > Autres, Leboncoin
      // n'offre que 3 photos ; dès la 4e, le dépôt devient payant et son écran
      // /options perd le chemin gratuit. On envoie les N premières, pour CETTE
      // feuille seulement.
      const quotaPhotosLbc = getLbcFreePhotoQuota(pf.lbcCategoryPath);
      if (quotaPhotosLbc != null && photosJob.length > quotaPhotosLbc) {
        pf.lbcPhotosOriginales = photosJob.length;
        pf.lbcPhotosCapped = true;
        rowPhotos = photosJob.slice(0, quotaPhotosLbc);
        journal.push(
          `[publish] Leboncoin ${pf.lbcCategoryPath.join(" > ")} : ` +
          `${photosJob.length} photos → ${quotaPhotosLbc} (quota gratuit de la catégorie)`
        );
      }
    }
    rows.push({
      user_id:         userId,
      inventaire_id:   inventaireId,
      platform,
      status:          "pending",
      photo_option:    photoOption,
      // Vinted refuse un titre trop capitalisé (400 serveur, 2026-08-15) :
      // normalisation à l'ENVOI. Les autres plateformes partent telles quelles.
      title:           platform === "vinted"
        ? normalizeVintedTitle(edited[platform]?.title ?? "")
        : (edited[platform]?.title ?? ""),
      description:     edited[platform]?.description ?? "",
      price:           edited[platform]?.price ?? price,
      photos:          rowPhotos,
      platform_fields: pf,
    });
  }
  return { rows, erreur: null, journal };
}

// ── AUCUN JOB SANS CATÉGORIE (2026-09-19) ────────────────────────────────────
// Une plateforme dont aucun chemin de catégorie n'a abouti est écartée AVANT
// le débit. Beebs avec `categorie_a_choisir` n'est PAS écartée (son content
// script pose la question) ; Opla n'est pas concernée (catégorie posée côté
// serveur).
const CHEMIN_DU_JOB = {
  vinted:    pf => pf.categoryPath,
  leboncoin: pf => pf.lbcCategoryPath,
  beebs:     pf => pf.beebsCategoryPath ?? pf.categorie_a_choisir,
  ebay:      pf => pf.ebayCategoryId,
};
export function plateformesSansChemin(rows) {
  return (rows ?? []).filter(r => {
    const lire = CHEMIN_DU_JOB[r.platform];
    if (!lire) return false; // opla et tout futur handler serveur
    const v = lire(r.platform_fields ?? {});
    return Array.isArray(v) ? v.length === 0 : !v;
  }).map(r => r.platform);
}

// ── GARDE PRÉ-PUBLICATION eBAY (2026-07-11 → 2026-07-29) ────────────────────
// Un aspect OBLIGATOIRE de la catégorie qui correspond à un de nos champs
// connus et qui est vide → refus AVANT le débit ; une valeur hors d'une liste
// qui FAIT FOI (SELECTION_ONLY) → refus ; hors d'une liste FREE_TEXT → part
// telle quelle (la liste n'est qu'une suggestion) ; rapprochement automatique
// quand la liste porte une valeur voisine (« Unique » → « Taille unique »), et
// la valeur du JOB est corrigée — c'est elle que l'extension posera.
// MUTE `pfE` exactement comme l'ancien code (set des champs dédiés, ou
// ebayAspects). `outils` : nearestAllowedValue, listeFaitFoi (module écran).
export function gardeAspectsEbay({ pfE, ebayRequiredFull, outils }) {
  const { nearestAllowedValue, listeFaitFoi } = outils;
  // Valeurs telles que l'EXTENSION les enverra (strip "EU " sur la taille,
  // colors[0] prioritaire). Alias Mode : monture/extérieure/doublure = nos
  // couleur/matière — mêmes listes que ebay.js.
  const knownAspects = [
    { labels: ["Marque"], value: () => pfE.marque, set: v => { pfE.marque = v; } },
    { labels: ["Taille", "Pointure EU", "Pointure"], value: () => String(pfE.taille ?? "").replace(/^EU\s*/i, ""), set: v => { pfE.taille = v; } },
    { labels: ["Couleur", "Couleur de la monture", "Couleur extérieure"], value: () => pfE.colors?.[0] || pfE.couleur,
      // Gates et handlers lisent colors[0] AVANT couleur : écrire les deux.
      set: v => { pfE.couleur = v; if (Array.isArray(pfE.colors) && pfE.colors.length) pfE.colors = [v, ...pfE.colors.slice(1)]; } },
    { labels: ["Matière", "Matériau", "Matériaux", "Matière de la couche extérieure", "Matière doublure externe", "Matière extérieure"], value: () => pfE.matiere, set: v => { pfE.matiere = v; } },
  ];
  // Même normalisation que normalizeFuzzy de ebay.js.
  const normFuzzy = s => String(s).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const missingEmpty = [];
  const invalides = [];
  const rapproches = [];
  const horsListe = [];
  for (const aspect of ebayRequiredFull ?? []) {
    const known = knownAspects.find(k => k.labels.includes(aspect.name));
    // Canal générique : pf.ebayAspects porte les obligatoires sans champ dédié.
    const genericVal = String(pfE.ebayAspects?.[aspect.name] ?? "").trim();
    if (!known && !genericVal) continue; // pas de source → canal unfilledRequired de l'extension
    const val = known ? String(known.value() ?? "").trim() || genericVal : genericVal;
    if (!val) { missingEmpty.push(aspect.name); continue; }
    const allowed = Array.isArray(aspect.allowedValues) ? aspect.allowedValues : [];
    if (!allowed.length) continue;
    if (allowed.some(v => normFuzzy(v) === normFuzzy(val))) continue;
    const faitFoi = listeFaitFoi("ebay", aspect.mode);
    const nearest = nearestAllowedValue(val, allowed);
    if (nearest) {
      if (known?.set) known.set(nearest);
      else pfE.ebayAspects = { ...(pfE.ebayAspects ?? {}), [aspect.name]: nearest };
      rapproches.push({ name: aspect.name, val, nearest });
      continue;
    }
    if (!faitFoi) {
      horsListe.push({ name: aspect.name, val, count: allowed.length, mode: aspect.mode ?? "?" });
      continue;
    }
    const ageLike = /\b(mois|ans)\b/i.test(val);
    const preferred = allowed.filter(v => /\b(mois|ans)\b/i.test(v));
    invalides.push({
      name: aspect.name, val, count: allowed.length, ageLike,
      sample: (preferred.length ? preferred : allowed).slice(0, 4).join(", "),
    });
  }
  return { missingEmpty, invalides, rapproches, horsListe };
}

// ── LES QUESTIONS À POSER (l'encart rouge de StepPublish, 2026-08-28) ───────
// UN SEUL endroit de saisie pour TOUT champ bloquant, trois sources :
//   · champs partagés manquants (cumulatifs : un champ apparu y RESTE tant que
//     l'écran est monté — fix « une seule lettre » du 30/07, la personne y a
//     ÉCRIT, correctif du 07/09) ;
//   · aspects Vinted/LBC/Beebs bloquants (ou touchés) dont le champ partagé
//     n'est PAS déjà saisi ici — déduplication SEULEMENT si l'input partagé
//     atteint cette plateforme (SHARED_PROPAGATION), sinon l'aspect garde son
//     input (classe RoCotCot) ;
//   · aspects eBay bloquants (ou touchés), même règle.
// `stickyShared` : Set de clés ; `stickyGeneric` : { [gp]: Set } ;
// `stickyEbay` : Set de noms. `canGeneric` / `canEbay` : les setters existent.
export function questionsAPoser({
  missingSharedFields = [], sharedFieldCfg = {}, stickyShared = new Set(),
  genericRequiredStatus = null, stickyGeneric = {}, canGeneric = true,
  ebayRequiredStatus = null, stickyEbay = new Set(), canEbay = true,
  genericFieldToSharedKey, SHARED_PROPAGATION, peutDecocher = true,
}) {
  const sharedFieldsToRender = [...new Set([...stickyShared, ...missingSharedFields])]
    .filter(k => sharedFieldCfg[k]);
  const sharedRendered = new Set(sharedFieldsToRender);
  const ebayDansRouge = (a) => aspectBloquant(a) || stickyEbay.has(a.name);
  const genericDansRouge = (gp, a) => aspectBloquant(a) || Boolean(stickyGeneric[gp]?.has(a.key));
  const redEbayAspects = canEbay
    ? (ebayRequiredStatus ?? []).filter(a => ebayDansRouge(a) && !(a.sharedKey && sharedRendered.has(a.sharedKey)))
    : [];
  const redGenericAspects = canGeneric
    ? Object.entries(genericRequiredStatus ?? {}).flatMap(([gp, list]) =>
        (list ?? []).filter(a => {
          const sk = genericFieldToSharedKey(gp, a.key);
          if (sk && sharedRendered.has(sk) && (SHARED_PROPAGATION[sk] ?? []).includes(gp)) return false;
          return genericDansRouge(gp, a);
        }).map(a => ({ gp, a })))
    : [];
  const redTotal = sharedFieldsToRender.length + redGenericAspects.length + redEbayAspects.length;
  // Restants = ce qui BLOQUE encore (les champs déjà complétés restent affichés
  // par le sticky mais ne comptent plus).
  const redRestants = missingSharedFields.filter(k => sharedFieldCfg[k]).length
    + redGenericAspects.filter(({ a }) => aspectBloquant(a)).length
    + redEbayAspects.filter(aspectBloquant).length;
  // Valeur catalogue UNIQUE (2026-07-19, cas Medik8) : confirmation explicite,
  // pleine largeur ; « Non » décoche la plateforme.
  const genSeule = ({ a }) => aspectBloquant(a)
    && Array.isArray(a.allowedValues) && a.allowedValues.length === 1 && Boolean(peutDecocher);
  return { sharedFieldsToRender, redGenericAspects, redEbayAspects, redTotal, redRestants, genSeule };
}

// ── L'ÉTAT D'UNE FOURNÉE, LU DANS LA FILE (écran « C'est parti ») ───────────
// Pour chaque plateforme du lot, le job de publication le plus récent créé
// depuis le clic (`depuisIso`) — ou, s'il n'est pas encore relu, « en_file ».
// Mots de l'écran : en_file · en_cours · publiee (url) · attente_* (needs_user,
// via natureAttente) · refusee (error) · annulee.
export function etatsFournee(jobs, plateformes, depuisIso) {
  const depuis = Date.parse(depuisIso ?? "") || 0;
  const out = {};
  for (const p of plateformes ?? []) {
    const candidats = (jobs ?? [])
      .filter(j => j && j.platform === p && String(j.action ?? "publish") === "publish"
        && (Date.parse(j.created_at ?? "") || 0) >= depuis - 60_000)
      .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
    const job = candidats[0] ?? null;
    if (!job) { out[p] = { kind: "en_file", job: null }; continue; }
    switch (job.status) {
      case "pending":    out[p] = { kind: "en_file", job }; break;
      case "processing": out[p] = { kind: "en_cours", job }; break;
      case "published":
      case "dry_run_completed":
        out[p] = { kind: "publiee", job, url: job.listing_url ?? null }; break;
      case "needs_user": out[p] = { ...natureAttente(job), job }; break;
      case "failed":     out[p] = { kind: "refusee", job, erreur: job.error ?? null }; break;
      case "cancelled":  out[p] = { kind: "annulee", job }; break;
      default:           out[p] = { kind: "en_file", job };
    }
  }
  return out;
}

// L'ordre de passage annoncé (« 2e », « 3e ») : l'extension traite un job à la
// fois, dans l'ordre de la file — on le dit au lieu de le laisser deviner.
export function ordreDePassage(etats, plateformes) {
  let rang = 0;
  const out = {};
  for (const p of plateformes ?? []) {
    const e = etats?.[p];
    if (e?.kind === "en_file" || e?.kind === "en_cours") { rang += 1; out[p] = rang; }
  }
  return out;
}
