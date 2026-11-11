// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN : UNE REMISE EN VENTE N'EST DÉPOSÉE QU'UNE FOIS L'ANNONCE VENDUE HORS LIGNE (06/11, Nico, règle A)
// ═══════════════════════════════════════════════════════════════════════════
// Louis (compte Amiral), 06/11 : 7 ventes en série enregistrées à 07:15 (transaction Leboncoin « Achat en cours »), puis 7
// remises en vente déposées de 07:22 à 07:29 — alors que les 7 annonces vendues étaient toujours EN LIGNE sur Leboncoin
// (Leboncoin garde une annonce sous transaction « active » des jours durant). Leboncoin a refusé les nouvelles : « une
// annonce similaire déjà en ligne, vous ne pouvez pas déposer une annonce identique », refus par contrôle automatique.
// Aucune n'est jamais parue (410 relus à 12:20) ; chez nous, « published ».
// Cause : 20261105170000 (remises_en_vente_tick, a) ne compte plus une annonce Leboncoin sous transaction comme « encore
// en ligne » — voulu pour que la vente ne bloque pas la remise à vie —, et rien ne retenait le DÉPÔT tant qu'elle l'est.
// LA RÈGLE : sur Leboncoin, la tâche de remise en vente (platform_fields.remise_en_vente) n'est SERVIE à l'extension
// qu'une fois l'annonce vendue (remise_en_vente.annonce_vendue) réellement hors ligne — relevée disparue, retirée, ou
// plus du tout relevée en ligne. Tant qu'elle l'est, la tâche attend, pending, intacte, SANS message (rien à faire
// pour le vendeur), et part d'elle-même au premier poll qui suit le relevé qui la voit partir. La vente, elle, reste
// enregistrée tout de suite (« transaction Leboncoin pending = vente payée », décision de Nico, inchangée).
// Les autres plateformes : Vinted, Beebs, Depop marquent l'annonce vendue « vendue » (elle n'est plus en vente) et
// n'interdisent pas une annonce semblable ; eBay clôt l'annonce à la vente (une série y vit en quantité, pas en remise).
// Seul Leboncoin refuse un dépôt identique à une annonce encore active : la règle ne joue que là.
// Pur (Deno + Node).

export const PLATEFORMES_REMISE_APRES_DISPARITION = Object.freeze(["leboncoin"]);
const VIVANTE = new Set(["en_ligne", "en_verification"]);

/** Le numéro de l'annonce vendue que cette remise en vente remplace, ou null (pas une remise, ou numéro inconnu). */
export function annonceVendueDeLaRemise(job) {
  const r = job?.platform_fields?.remise_en_vente;
  if (!r || typeof r !== "object") return null;
  const n = String(r.annonce_vendue ?? "").trim();
  return /^\d{4,}$/.test(n) ? n : null;
}

/** Cette tâche est-elle une remise en vente qui doit attendre la disparition de l'annonce vendue (sa plateforme) ? */
export function remiseAAttendre(job) {
  return !!job && PLATEFORMES_REMISE_APRES_DISPARITION.includes(String(job.platform ?? ""))
    && String(job.action ?? "publish") === "publish" && annonceVendueDeLaRemise(job) != null;
}

/**
 * L'annonce vendue est-elle encore EN LIGNE d'après le relevé ? (la ligne annonces_plateforme de son numéro, même compte,
 * même plateforme). Aucune ligne : inconnue → on ne retient pas (rien ne prouve qu'elle est là).
 * @param {{ disparu_le?: string|null, retiree_le?: string|null, ignoree_le?: string|null, statut_plateforme?: string|null }|null} ligne
 */
export function annonceVendueEncoreEnLigne(ligne) {
  if (!ligne) return false;
  if (ligne.disparu_le || ligne.retiree_le || ligne.ignoree_le) return false;
  return VIVANTE.has(String(ligne.statut_plateforme ?? ""));
}

// ═══════════════════════════════════════════════════════════════════════════
// (07/11, décision de Nico — option A) UNE REMISE DÉPOSÉE PENDANT QUE L'ANNONCE VENDUE ÉTAIT AFFICHÉE REVIENT EN ATTENTE
// ═══════════════════════════════════════════════════════════════════════════
// Louis, 06-07/11 : 3 remises Leboncoin (3303702852, 3303792394, 3303867959) déposées quand la règle A était retirée,
// pendant que leur annonce vendue IDENTIQUE restait affichée (transaction en cours) : désactivées par Leboncoin (410),
// closes « cancelled » (garde jumeau, à tort) puis rejugées « failed ». Nico : elles ne finissent PAS en « failed » —
// elles repartent seules quand la vendue a disparu, et la série reprend. LA RÈGLE (handler-watch) : une remise Leboncoin
// close (cancelled / failed) depuis 14 jours au plus, dont le dépôt n'a JAMAIS été vu en ligne et dont l'annonce vendue
// est ENCORE affichée, revient « pending » : le dépôt refusé est archivé (numéro gardé), la tâche redevient une remise
// neuve, retenue par la règle A jusqu'à la disparition de la vendue. Jamais si une AUTRE annonce non vendue de la fiche
// est en ligne (doublon), jamais plus de 3 fois par tâche, jamais une tâche annulée par la personne (arret_utilisateur).

export const REARMEMENTS_MAX = 3;
export const FENETRE_REARMEMENT_MS = 14 * 86_400_000;
export const DELAI_PUBLIE_JAMAIS_VU_MS = 2 * 3600_000;

// ═══════════════════════════════════════════════════════════════════════════
// (11/11, L1 — chemin résiduel 2, décision de Nico) UNE REMISE DONT L'ARTICLE OU L'ANNONCE A ÉTÉ RETIRÉ NE SE RÉARME JAMAIS
// ═══════════════════════════════════════════════════════════════════════════
// « Aucun chemin ne remet en ligne un article retiré sans geste du client. » La règle A ne refusait qu'une remise arrêtée
// « à ta demande » : une remise close par l'extension après un retrait ciblé (removed_by_user), une remise « published »
// jamais vue dont le retrait est armé ou en file, une remise dont la fiche a été supprimée, une remise d'un article retiré
// « partout » depuis le compte relié (L1) repassaient « pending » — puis get-pending-jobs les servait à la disparition de
// la vendue : un dépôt neuf, en ligne. Désormais, jamais :
//   fiche_supprimee         la ligne n'a plus de fiche (inventaire_id NULL : suppression, avec ou sans retrait) ;
//   retrait_arme            un retrait a été armé sur elle (vente, traversée L1) : retrait_arme est un POINTEUR — la tâche
//                           pointée décide (annulée : ne compte pas ; introuvable : le doute garde la remise) ;
//   article_retire_partout  la traversée L1 l'a marquée, ou un bilan « retrait_partout_compte_relie » de SA fiche est né
//                           après elle ;
//   retrait_demande         un retrait né après elle vise un de SES DÉPÔTS, par son numéro (colonne, lien, adsubmit,
//   / annonce_retiree       sans_adsubmit, identifiants du dépôt jamais en ligne) — en file, en cours, fait ou échoué :
//                           c'est le geste qui compte (annonce_retiree quand l'extension l'a aussi close, removed_by_user).
//                           (Relecture du 11/11) Deux annonces = deux exemplaires : en série, le retrait de la vendue d'une
//                           AUTRE remise ou d'un autre exemplaire de la fiche ne touche jamais cette remise ; un numéro qui
//                           est la vendue d'une remise de la fiche ne compte jamais (c'est son retrait qui libère la remise).
//                           Un retrait annulé ne compte pas. removed_by_user SEUL ne décide rien : l'extension le pose aussi
//                           par son repli au TITRE (cancelPublishAfterDelete) — jamais une décision sur un titre seul ;
//   retraits_illisibles     une lecture a échoué : le doute ne remet rien en ligne.
// Les faits (retraitsDeLaFiche, bilansRetraitPartout, vendesDesRemises) sont LUS par handler-watch pour les seules remises
// qui allaient repartir : non fournis (undefined), seuls les signes de la ligne elle-même jouent (pré-tri).
export const FEATURE_RETRAIT_PARTOUT_COMPTE_RELIE = "retrait_partout_compte_relie";
export const STATUTS_RETRAIT_DEMANDE = Object.freeze(["pending", "processing", "needs_user", "deleted", "failed"]);
export const MOTIFS_REMISE_RETIREE = Object.freeze(["fiche_supprimee", "annonce_retiree", "retrait_arme", "article_retire_partout",
  "retrait_demande", "retraits_illisibles"]);
const numeroDuRetrait = (d) => String(d?.platform_listing_id ?? "").trim()
  || (String(d?.listing_url ?? "").match(/(\d{6,})(?:[/?#]|$)/)?.[1] ?? "");
const numeroLbc = (v) => { const s = String(v ?? "").trim(); return /^\d{6,}$/.test(s) ? s : null; };

/** Les numéros des DÉPÔTS de cette remise (les annonces qu'elle a elle-même déposées), sans sa vendue. (pur) */
export function depotsDeLaRemise(job) {
  const pf = job?.platform_fields ?? {};
  const lbc = pf.lbc_depot && typeof pf.lbc_depot === "object" ? pf.lbc_depot : {};
  const trace = pf.depot_jamais_en_ligne && typeof pf.depot_jamais_en_ligne === "object" ? pf.depot_jamais_en_ligne : {};
  const liste = [job?.platform_listing_id, String(job?.listing_url ?? "").match(/(\d{6,})(?:[/?#]|$)/)?.[1],
    lbc.adsubmit?.id, lbc.sans_adsubmit?.id, ...(Array.isArray(trace.identifiants) ? trace.identifiants : [])].map(numeroLbc).filter(Boolean);
  const vendue = annonceVendueDeLaRemise(job);
  return [...new Set(liste)].filter((n) => n !== vendue);
}

/**
 * L'article ou l'annonce de cette remise a-t-il été retiré ? Le motif, ou null. (pur)
 * @param {any} job  la remise (inventaire_id, created_at, platform_fields)
 * @param {{ retraitsDeLaFiche?: any[] | null, bilansRetraitPartout?: any[] | null, vendesDesRemises?: string[] | null }} [faits]
 *   retraitsDeLaFiche : les tâches « delete » Leboncoin de SA fiche (et celle que pointe retrait_arme) ;
 *   bilansRetraitPartout : les lignes usage_logs « retrait_partout_compte_relie » du compte ;
 *   vendesDesRemises : les numéros des annonces vendues des remises de SA fiche. null = lecture en panne ;
 *   undefined = pas encore lu (pré-tri).
 */
export function retraitDeLaRemise(job, { retraitsDeLaFiche, bilansRetraitPartout, vendesDesRemises } = {}) {
  const pf = job?.platform_fields ?? {};
  if (job && "inventaire_id" in job && job.inventaire_id == null) return "fiche_supprimee";
  if (pf.retrait_partout_compte_relie) return "article_retire_partout";
  if (retraitsDeLaFiche === undefined && bilansRetraitPartout === undefined && vendesDesRemises === undefined) return null;
  if (retraitsDeLaFiche === null || bilansRetraitPartout === null || vendesDesRemises === null) return "retraits_illisibles";
  const retraits = Array.isArray(retraitsDeLaFiche) ? retraitsDeLaFiche : [];
  // Le pointeur : la tâche que retrait_arme désigne décide (annulée → ne compte pas ; introuvable → doute).
  if (pf.retrait_arme) {
    const ptr = String(pf.retrait_arme?.job ?? "").trim();
    const pointe = ptr ? retraits.find((d) => String(d?.id ?? "") === ptr) : null;
    if (!pointe || String(pointe.status ?? "") !== "cancelled") return "retrait_arme";
  }
  const cree = Date.parse(String(job?.created_at ?? ""));
  const apres = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) && (!Number.isFinite(cree) || t >= cree); };
  const vendues = new Set([annonceVendueDeLaRemise(job), ...(Array.isArray(vendesDesRemises) ? vendesDesRemises : [])].map(numeroLbc).filter(Boolean));
  const depots = new Set(depotsDeLaRemise(job).filter((num) => !vendues.has(num)));
  const vise = depots.size > 0 && retraits.some((d) =>
    String(d?.action ?? "delete") === "delete" && STATUTS_RETRAIT_DEMANDE.includes(String(d?.status ?? "")) && apres(d?.created_at)
    && depots.has(numeroDuRetrait(d))
    && !/remise-en-vente-attente/.test(String(d?.platform_fields?.arme_par?.pose_par ?? "")));
  if (vise) return pf.removed_by_user ? "annonce_retiree" : "retrait_demande";
  const fiche = job?.inventaire_id != null ? String(job.inventaire_id) : null;
  const partout = fiche != null && (Array.isArray(bilansRetraitPartout) ? bilansRetraitPartout : []).some((b) =>
    String(b?.metadata?.article_id ?? "") === fiche && apres(b?.created_at));
  return partout ? "article_retire_partout" : null;
}

/**
 * Décision pour une remise close : la remettre en attente (règle A) ?
 * @param {any} job  la tâche (status, created_at, platform_fields, error, inventaire_id)
 * @param {{ vendueEncoreAffichee: boolean, depotVu: boolean, autreAnnonceVivante: boolean, maintenant?: number,
 *   retraitsDeLaFiche?: any[] | null, bilansRetraitPartout?: any[] | null, vendesDesRemises?: string[] | null }} faits
 *   (retraitDeLaRemise ; non fournis = pré-tri)
 * @returns {{ rearmer: boolean, motif: string }}
 */
export function decisionRearmementRemise(job, { vendueEncoreAffichee, depotVu, autreAnnonceVivante, maintenant = Date.now(),
  retraitsDeLaFiche, bilansRetraitPartout, vendesDesRemises }) {
  const pf = job?.platform_fields ?? {};
  if (!remiseAAttendre({ ...job, action: job?.action ?? "publish" })) return { rearmer: false, motif: "pas_une_remise_leboncoin" };
  // (07/11) Aussi un dépôt « published » JAMAIS vu depuis 2 h au moins, sa vendue identique encore affichée : Leboncoin
  // le refuse à la seconde du dépôt (essai réel du 30/10 ; rang 4 de Louis, 3304017454, 410 relu le 07/11) — inutile
  // d'attendre qu'il passe « failed ».
  const statut = String(job?.status ?? "");
  const publieDepuis = Date.parse(String(job?.published_at ?? ""));
  if (statut === "published" && !(Number.isFinite(publieDepuis) && maintenant - publieDepuis >= DELAI_PUBLIE_JAMAIS_VU_MS)) return { rearmer: false, motif: "publie_recent" };
  if (!["cancelled", "failed", "published"].includes(statut)) return { rearmer: false, motif: "pas_close" };
  if (pf.arret_utilisateur || /à ta demande/i.test(String(job?.error ?? ""))) return { rearmer: false, motif: "arretee_par_la_personne" };
  // (11/11, L1 — chemin résiduel 2) L'article ou l'annonce a été retiré : jamais réarmée.
  const retire = retraitDeLaRemise(job, { retraitsDeLaFiche, bilansRetraitPartout, vendesDesRemises });
  if (retire) return { rearmer: false, motif: retire };
  const cree = Date.parse(String(job?.created_at ?? ""));
  if (!Number.isFinite(cree) || maintenant - cree > FENETRE_REARMEMENT_MS) return { rearmer: false, motif: "trop_ancienne" };
  if ((Number(pf.remise_regle_a?.rearmements) || 0) >= REARMEMENTS_MAX) return { rearmer: false, motif: "plafond" };
  if (job?.vu_en_ligne_le || pf.vu_en_ligne_le || depotVu) return { rearmer: false, motif: "depot_vu_en_ligne" };
  if (!vendueEncoreAffichee) return { rearmer: false, motif: "vendue_partie" };
  if (autreAnnonceVivante) return { rearmer: false, motif: "autre_annonce_en_ligne" };
  return { rearmer: true, motif: "vendue_encore_affichee" };
}

/** Le platform_fields de la remise remise en attente (pur) : le dépôt refusé archivé, la tâche redevient neuve. */
export function champsRearmementRemise(pf0 = {}, job = {}, maintenant = new Date().toISOString()) {
  const pf = { ...pf0 };
  const numero = String(job?.platform_listing_id ?? pf?.lbc_depot?.adsubmit?.id ?? pf?.lbc_depot?.sans_adsubmit?.id ?? "").trim() || null;
  const archive = Array.isArray(pf.depots_desactives_regle_a) ? pf.depots_desactives_regle_a : [];
  pf.depots_desactives_regle_a = [...archive, {
    le: maintenant, numero, statut: job?.status ?? null, erreur: String(job?.error ?? "").slice(0, 400) || null,
    depot_le: pf?.lbc_depot?.at ?? null, issue: pf?.depot_jamais_en_ligne?.issue ?? null,
  }].slice(-10);
  for (const k of ["lbc_depot", "depot_jamais_en_ligne", "pas_encore_visible", "moderation_probe", "processing_since",
    "next_action_after", "needs_user_source", "sale_signal", "unavailable_since", "unavailable_pending_since",
    "lien_retrouve_par_identifiant", "work_window_state", "pas_de_rouge", "error_technique", CLE_ATTENTE_VENDUE]) delete pf[k];
  const avant = pf.remise_regle_a && typeof pf.remise_regle_a === "object" ? pf.remise_regle_a : {};
  pf.remise_regle_a = { ...avant, rearmee_le: maintenant, rearmements: (Number(avant.rearmements) || 0) + 1,
    annonce_vendue: annonceVendueDeLaRemise({ platform_fields: pf0 }), regle: "remise_apres_disparition_0711" };
  return pf;
}

// ═══════════════════════════════════════════════════════════════════════════
// (07/11 nuit, Louis — Amiral, point 2 de Nico) CE QUE L'ANNONCE VENDUE EST, ET CE QUE LA REMISE EN FAIT
// ═══════════════════════════════════════════════════════════════════════════
// Louis, 07/11 21:47 : « Je loupe des ventes, car mes annonces ne repartent pas sur LBC. » Lu ce soir-là :
//   - 9 remises Leboncoin attendaient en silence (pending, aucun message) ; leurs 9 annonces vendues étaient toujours
//     affichées — pages publiques lues à 22:19-22:21 : 4 « Article vendu » (transaction « sold »), 4 sans bouton
//     d'achat (transaction « pending »), aucune achetable (une annonce normale de Louis montre « Acheter ») ;
//   - Leboncoin garde une annonce vendue affichée : 111 annonces « sold » et 88 « pending » vues vivantes par un relevé
//     dans les 3 jours avant le 07/11, dont 48 « sold » publiées il y a plus de deux mois (la plus ancienne en 2022) —
//     l'attente de sa disparition peut durer des mois ;
//   - le 3e de sa liste (vendue 3297440551 supprimée par Louis, relevée disparue le 06/11 à 22:01) : servi le 07/11 à
//     22:20, déposé 3304491516, en ligne et achetable à 22:21 — alors que les 4 dépôts faits vendue affichée ont tous
//     été désactivés (410).
// LES ÉTATS (relevé « Mes annonces », ligne annonces_plateforme du numéro remise_en_vente.annonce_vendue) :
//   hors_ligne        relevée disparue, retirée, ignorée, ou plus en ligne → la remise part TOUT DE SUITE ;
//   inconnue          aucune ligne relevée → servie (rien ne prouve qu'elle est là, inchangé) ;
//   vente_en_cours    affichée, transaction « pending » (achat en cours) → retenue, raison dite ;
//   vendue_affichee   affichée, transaction « sold » (ou tout autre état de transaction) → retenue, raison dite ;
//   toujours_en_vente affichée SANS transaction, lu APRÈS la création de la remise : l'annonce est ACHETABLE (vente
//                     annulée, plusieurs exemplaires sur une annonce) → l'article est toujours en vente, la remise est
//                     close « cancelled » avec un message vrai, jamais déposée (jamais de doublon) ;
//   a_relire          affichée sans transaction, mais lu AVANT la remise → retenue, un relevé est demandé.
// La règle d'attente reste vraie pour une annonce vendue réellement affichée (jamais un dépôt identique).
export const CLE_ATTENTE_VENDUE = "attente_annonce_vendue"; // préfixe « attente_ » : jamais recopié par remise_en_vente_champs
export const ETAT_VENDUE = Object.freeze({
  HORS_LIGNE: "hors_ligne", INCONNUE: "inconnue", VENTE_EN_COURS: "vente_en_cours", VENDUE_AFFICHEE: "vendue_affichee",
  TOUJOURS_EN_VENTE: "toujours_en_vente", A_RELIRE: "a_relire",
});
export const ETATS_RETENUS = Object.freeze([ETAT_VENDUE.VENTE_EN_COURS, ETAT_VENDUE.VENDUE_AFFICHEE, ETAT_VENDUE.A_RELIRE]);
// Une remise retenue garde des relevés Leboncoin réguliers : un relevé « Mes annonces » (lecture seule) au plus toutes
// les RELEVE_ATTENTE_MIN minutes, jamais s'il y en a déjà un en file (sans lui, le relevé quotidien vient 20 h après le
// dernier : Louis, aucun relevé du 07/11 17:42 au lendemain).
export const RELEVE_ATTENTE_MIN = 60;
// La borne : une remise retenue depuis BORNE_ATTENTE_VENDUE_MS, vente CLOSE (« sold ») seulement — ⛔ jamais pendant un
// achat en cours (08/11, Nico) —, passe « À toi de jouer » (supprimer l'annonce vendue
// sur Leboncoin) — elle ne reste jamais en pause sans fin. La même valeur est recopiée dans etat-job.js (selftest).
export const BORNE_ATTENTE_VENDUE_MS = 48 * 3600_000;

const msDe = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : null; };

/**
 * L'état de l'annonce vendue d'une remise, d'après sa ligne de relevé (ou null).
 * @param {{ disparu_le?: string|null, retiree_le?: string|null, ignoree_le?: string|null, statut_plateforme?: string|null,
 *   transaction_plateforme?: string|null, transaction_lue_le?: string|null }|null} ligne
 * @param {{ created_at?: string|null }} job  la remise
 */
export function etatAnnonceVendue(ligne, job) {
  if (!ligne) return ETAT_VENDUE.INCONNUE;
  if (!annonceVendueEncoreEnLigne(ligne)) return ETAT_VENDUE.HORS_LIGNE;
  const tx = String(ligne.transaction_plateforme ?? "").trim().toLowerCase();
  if (tx === "pending") return ETAT_VENDUE.VENTE_EN_COURS;
  if (tx === "aucune" || tx === "") {
    const lu = msDe(ligne.transaction_lue_le);
    const cree = msDe(job?.created_at);
    return tx === "aucune" && lu != null && cree != null && lu > cree ? ETAT_VENDUE.TOUJOURS_EN_VENTE : ETAT_VENDUE.A_RELIRE;
  }
  return ETAT_VENDUE.VENDUE_AFFICHEE;
}

/**
 * Le marqueur d'attente à écrire sur la remise (platform_fields[CLE_ATTENTE_VENDUE]), ou null s'il n'y a rien à écrire
 * (même état, même transaction : aucune ligne inchangée réécrite). `depuis` = la première retenue, gardée.
 */
export function marqueAttenteVendue(pf, { etat, annonce, ligne = null, maintenant = new Date().toISOString() }) {
  const avant = pf && typeof pf === "object" ? pf[CLE_ATTENTE_VENDUE] : null;
  const tx = ligne?.transaction_plateforme != null ? String(ligne.transaction_plateforme) : null;
  if (avant && typeof avant === "object" && avant.etat === etat && String(avant.annonce_vendue ?? "") === String(annonce ?? "")
      && (avant.transaction ?? null) === tx) return null;
  return {
    annonce_vendue: annonce != null ? String(annonce) : null, etat, transaction: tx,
    depuis: avant && typeof avant === "object" && avant.depuis ? avant.depuis : maintenant,
    change_le: maintenant, lu_le: ligne?.transaction_lue_le ?? null,
  };
}

/**
 * Un relevé « Mes annonces » est-il à demander pour un compte dont des remises sont retenues ? (pur)
 * @param {{ dernierReleveMs?: number | null, releveEnFile?: boolean, maintenant?: number }} [o]
 *   dernierReleveMs : le plus récent instant (mise en file ou début) d'un relevé Leboncoin de ce compte.
 */
export function releveAttenteADemander({ dernierReleveMs = null, releveEnFile = false, maintenant = Date.now() } = {}) {
  if (releveEnFile) return false;
  return dernierReleveMs == null || maintenant - dernierReleveMs >= RELEVE_ATTENTE_MIN * 60_000;
}

/** Le message vrai d'une remise close parce que l'annonce d'origine est toujours achetable. */
export function messageToujoursEnVente(annonce) {
  return `Rien à remettre en vente : ton annonce Leboncoin n° ${annonce} est toujours en vente (aucun achat en cours `
    + "dessus d'après ton dernier relevé). L'article est déjà en ligne : aucune autre annonce n'a été déposée, jamais de doublon.";
}

// ═══════════════════════════════════════════════════════════════════════════
// (07/11 nuit, Nico) UNE FOIS LA VENTE CLOSE, FILLSELL RETIRE L'ANNONCE VENDUE, PUIS LA REMISE PART
// ═══════════════════════════════════════════════════════════════════════════
// Feu vert nommé de Nico pour Louis (4 annonces « Article vendu », retirées une par une le 07/11 au soir par
// scripts/reparations/20261107_louis_retraits_vendues_closes.mjs). LA RÈGLE, pour tous les comptes (handler-watch,
// interrupteur RETIRER_VENDUES_CLOSES — ALLUMÉ le 08/11, feu vert nommé de Nico) : une remise Leboncoin en attente dont
// l'annonce vendue est encore affichée avec une transaction CLOSE (« sold » : « Article vendu » sur la page) fait armer
// UNE tâche de retrait de CETTE annonce, par son numéro et son lien (chemin normal de l'extension). Le retrait fait
// (« deleted »), la base note l'annonce retirée, la règle A sert la remise au passage suivant.
// Preuve (centre d'aide officiel de Leboncoin, lu le 07/11) : pour un vendeur particulier, la transaction n'est annulée
// automatiquement que sur disponibilité non confirmée (3 jours) ou envoi non confirmé (72 h) ; le paiement est débloqué
// à la validation (confirmation de l'acheteur, ou d'office sous 30 jours) ; supprimer une annonce ne supprime que ses
// options ; Leboncoin supprime lui-même toute annonce au bout de deux mois.
// GARDES : jamais pendant un achat en cours (transaction « pending ») ni sur une transaction inconnue ; jamais sur une
// lecture de plus de 24 h ; jamais si un retrait est déjà ouvert sur cette annonce ; jamais une autre annonce que
// celle de la remise ; jamais si la remise n'est plus en attente.
export const RETRAIT_VENDUE_LECTURE_MAX_MS = 24 * 3600_000;

/**
 * Faut-il armer le retrait de l'annonce vendue d'une remise ? (pur)
 * @param {{ remise: any, ligne: any, retraitOuvert?: boolean, maintenant?: number }} o
 * @returns {{ armer: boolean, motif: string }}
 */
export function decisionRetraitVendueClose({ remise, ligne, retraitOuvert = false, maintenant = Date.now() }) {
  if (!remiseAAttendre(remise) || String(remise?.status ?? "") !== "pending") return { armer: false, motif: "pas_une_remise_en_attente" };
  if (!ligne) return { armer: false, motif: "annonce_inconnue" };
  if (String(ligne.listing_id ?? "").trim() !== annonceVendueDeLaRemise(remise)) return { armer: false, motif: "autre_annonce" };
  if (!annonceVendueEncoreEnLigne(ligne)) return { armer: false, motif: "deja_hors_ligne" };
  const tx = String(ligne.transaction_plateforme ?? "").trim().toLowerCase();
  if (tx === "pending") return { armer: false, motif: "achat_en_cours" };
  if (tx !== "sold") return { armer: false, motif: "vente_non_close" };
  const lu = msDe(ligne.transaction_lue_le);
  if (lu == null || maintenant - lu > RETRAIT_VENDUE_LECTURE_MAX_MS) return { armer: false, motif: "lecture_trop_ancienne" };
  if (retraitOuvert) return { armer: false, motif: "retrait_deja_ouvert" };
  return { armer: true, motif: "vente_close" };
}
