// ═══════════════════════════════════════════════════════════════════════════
// LA PUBLICATION EN LOT — LES RÈGLES PURES (nuit du 02 au 03/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Le lot ne réécrit RIEN du moteur de publication : chaque article est préparé
// par le vrai moteur du stepper (ListingPreviewScreen en mode `pilote`), qui
// rédige, résout les rayons, lit les champs exigés, pose ses gardes et appelle
// la même RPC. Ce module ne contient que ce que le lot ajoute — choisir, compter,
// classer — en fonctions pures, testées par scripts/publication-lot-selftest.mjs.
// Aucune ne lit le réseau, aucune n'écrit.
import { computeRemovalInfo, plateformesReserveesParRepublication, estArretUtilisateur, vintedPresenceArticle } from "../../utils/publicationState.js";
import { attentesParPlateforme } from "../../utils/etatsPublication.js";
import { PALIERS as PALIERS_COMPTE, palierDesDrapeaux } from "../../utils/palier.js";

// Opla quitte FillSell le 10/10 : jamais dans un lot, ni avant ni après.
// Depop (09/10) : dans le lot pour le SEUL compte où elle est ouverte — le lot
// ne propose jamais que plateformesCompte (plateformesDuCompte, App.jsx). Le
// DÉFAUT, quand un appelant n'en donne pas, reste les quatre d'avant.
export const PLATEFORMES_LOT = Object.freeze(["vinted", "leboncoin", "ebay", "beebs", "depop"]);
export const PLATEFORMES_LOT_DEFAUT = Object.freeze(["vinted", "leboncoin", "ebay", "beebs"]);
// Un lot, c'est 20 articles au plus (décision à confirmer, cf. rapport) :
// l'extension dépose une annonce après l'autre, et aucun frein serveur n'existe
// encore pour les dépôts — au-delà, on prépare le lot suivant.
export const LOT_MAX_ARTICLES = 20;
// Préparations en même temps (une rédaction = un appel serveur et quelques
// lectures) : trois suffisent à ne jamais attendre, sans charger le serveur.
export const PREPARATIONS_SIMULTANEES = 3;
// Le moteur d'un article doit rester au repos ce temps-là avant qu'on lise ses
// questions : un effet tardif qui pose une valeur ne doit pas être pris de court.
export const REPOS_AVANT_LECTURE_MS = 1200;

// ── Ce qu'un article peut encore recevoir ──────────────────────────────────
// Les plateformes OCCUPÉES par l'article : en ligne (publiée, pas retirée), en
// file (pending/processing), en attente d'un geste (needs_user) ou réservées par
// une republication en vol. C'est exactement ce que refuse la RPC
// (already_published) — le lot ne propose jamais ce que le serveur refuserait.
export function plateformesOccupees(item, jobs = []) {
  const liste = Array.isArray(jobs) ? jobs : [];
  const info = computeRemovalInfo(liste);
  const occ = new Set([...info.publishedActive, ...info.queued, ...plateformesReserveesParRepublication(liste)]);
  for (const [p, a] of Object.entries(attentesParPlateforme(liste))) if (a?.bloque) occ.add(p);
  // Vinted : un article du dressing EST sur Vinted, même sans job FillSell
  // (règle du 11/09, vintedPresenceArticle). Disparu de Vinted : il est libre.
  if (item) {
    const v = vintedPresenceArticle(item, liste);
    if (v?.occupee) occ.add("vinted");
    if (item.disparu_le) occ.delete("vinted");
  }
  return occ;
}

/** Les plateformes du lot encore libres pour cet article, dans l'ordre du lot. */
export function plateformesLibres(item, jobs, plateformesCompte = PLATEFORMES_LOT_DEFAUT) {
  const occ = plateformesOccupees(item, jobs);
  return PLATEFORMES_LOT.filter((p) => plateformesCompte.includes(p) && !occ.has(p));
}

const photosDe = (item) => {
  const p = item?.photos;
  if (!Array.isArray(p)) return [];
  return p.map((x) => (typeof x === "string" ? x : x?.url)).filter((u) => typeof u === "string" && u);
};

/**
 * Un article peut-il entrer dans un lot ? { ok, raison } — raison en mots
 * d'écran quand il ne peut pas. Jamais un article vendu, jamais sans photo
 * (aucune plateforme n'en veut), jamais un article déjà partout.
 */
export function articleSelectionnable(item, jobs, plateformesCompte = PLATEFORMES_LOT_DEFAUT, lang = "fr") {
  const en = lang === "en";
  if (!item) return { ok: false, raison: "" };
  if (String(item.statut ?? "") === "vendu" || item.sold === true) return { ok: false, raison: en ? "Sold" : "Vendu" };
  if (!photosDe(item).length) return { ok: false, raison: en ? "No photo" : "Sans photo" };
  if (!plateformesLibres(item, jobs, plateformesCompte).length) return { ok: false, raison: en ? "Already everywhere" : "Déjà partout" };
  return { ok: true, raison: "" };
}

// ── « Où les publier ? » — une ligne par plateforme pour tout le lot ───────
/**
 * Par plateforme : combien d'articles du lot pourraient y partir, combien y
 * sont déjà. `articles` = [{ item, jobs }].
 */
export function resumeParPlateforme(articles, plateformesCompte = PLATEFORMES_LOT_DEFAUT) {
  const out = {};
  for (const p of PLATEFORMES_LOT) {
    if (!plateformesCompte.includes(p)) continue;
    let possibles = 0, dejaLa = 0;
    for (const { item, jobs } of articles ?? []) {
      if (plateformesOccupees(item, jobs).has(p)) dejaLa++;
      else possibles++;
    }
    out[p] = { possibles, dejaLa };
  }
  return out;
}

/** Les plateformes cochées d'office : celles où au moins un article peut aller, hors pause et hors eBay inutilisable. */
export function choixInitial(resume, { memorise = null, enPause = [], ebayBloque = false } = {}) {
  const ouvertes = Object.entries(resume ?? {})
    .filter(([p, r]) => r.possibles > 0 && !enPause.includes(p) && !(p === "ebay" && ebayBloque))
    .map(([p]) => p);
  if (Array.isArray(memorise) && memorise.length) {
    const garde = ouvertes.filter((p) => memorise.includes(p));
    if (garde.length) return garde;
  }
  return ouvertes;
}

// ── Le quota du mois ───────────────────────────────────────────────────────
// Une préparation = une rédaction = une annonce du quota, comme à l'unité. Une
// fiche déjà rédigée pour TOUTES les plateformes visées ne repasse pas par la
// rédaction (le moteur la rouvre telle quelle) : elle ne coûte rien.
/** La fiche porte-t-elle une copie rédigée pour chaque plateforme visée ? */
export function ficheCouvre(fiche, plateformes) {
  const copies = fiche?.platformListings?.platforms;
  if (!copies || typeof copies !== "object") return false;
  return (plateformes ?? []).every((p) => Boolean(copies[p]));
}

/**
 * Partage les articles entre « maintenant » et « le mois prochain ».
 * `restantes` = annonces restantes du cycle (null = pas de plafond connu).
 * `consomme(article)` = true si l'article passera par une rédaction.
 * L'ordre des articles est celui de la sélection : le premier choisi part le
 * premier. Rend { maintenant: [...], plusTard: [...], aConsommer }.
 */
export function partagerQuota(articles, { restantes = null, consomme = () => true } = {}) {
  const maintenant = [], plusTard = [];
  let reste = Number.isFinite(restantes) ? Math.max(0, restantes) : Infinity;
  let aConsommer = 0;
  for (const a of articles ?? []) {
    if (!consomme(a)) { maintenant.push(a); continue; }
    if (reste > 0) { maintenant.push(a); reste--; aConsommer++; }
    else plusTard.push(a);
  }
  return { maintenant, plusTard, aConsommer };
}

// ── La durée annoncée ──────────────────────────────────────────────────────
// Médianes mesurées en prod (audit 23/09, relevés du 01/10) : un dépôt Vinted,
// Leboncoin ou Beebs ≈ 1 min à 1 min 40, eBay par l'extension ≈ 4 min, eBay par
// nos serveurs ≈ 1 min (sans l'ordinateur). Plus 14 s de pause entre deux.
const DUREE_DEPOT_S = { vinted: 60, leboncoin: 98, beebs: 60, ebay: 225, depop: 20 };
const PAUSE_ENTRE_DEUX_S = 14;
/** Minutes avec l'ordinateur allumé pour déposer `parPlateforme` = { pf: n }. */
export function dureeEstimeeMin(parPlateforme, { ebayParServeur = false } = {}) {
  let s = 0;
  for (const [p, n] of Object.entries(parPlateforme ?? {})) {
    if (!n) continue;
    if (p === "ebay" && ebayParServeur) continue; // ne demande pas l'ordinateur
    s += n * ((DUREE_DEPOT_S[p] ?? 90) + PAUSE_ENTRE_DEUX_S);
  }
  return Math.ceil(s / 60);
}
/** « ≈ 40 min », « ≈ 1 h 20 » — jamais une fausse précision. */
export function libelleDuree(min, lang = "fr") {
  if (!Number.isFinite(min) || min <= 0) return "";
  if (min < 60) return `≈ ${Math.max(5, Math.round(min / 5) * 5)} min`;
  const h = Math.floor(min / 60);
  const r = Math.round((min % 60) / 10) * 10;
  return r ? `≈ ${h} h ${String(r).padStart(2, "0")}` : (lang === "en" ? `≈ ${h} h` : `≈ ${h} h`);
}

/**
 * Les annonces qui ressemblent (m.jumeaux) et retiennent encore l'article :
 * sur une plateforme visée, pas encore tranchées — et JAMAIS pour une fiche à
 * plus d'un exemplaire (09/10 soir, Louis : la ressemblance ne bloque pas un
 * article dont on a plusieurs exemplaires).
 */
export function jumeauxQuiRetiennent(m, plateformes, tranches = new Set()) {
  if (Number(m?.quantiteFiche) > 1) return [];
  return (m?.jumeaux ?? []).filter((j) => plateformes.includes(j.platform) && !tranches.has(j.platform));
}

// ── Lire l'état d'un article préparé (le moteur, en lecture seule) ─────────
/**
 * Ce qui reste à faire pour CET article avant l'envoi, à partir de son moteur.
 * `decisions` = ce que la personne a déjà tranché dans le lot :
 *   { texteValide: bool, jumeauxTranches: Set<pf> }.
 * Rend { pret, motifs: [{ cle, libelle }], plateformes } — motifs dans les mots
 * de l'écran. `pret` ne vaut que si le moteur est au repos.
 */
export function bilanArticle(m, decisions = {}, lang = "fr") {
  const en = lang === "en";
  const motifs = [];
  if (!m) return { pret: false, motifs, plateformes: [] };
  const plateformes = [...(m.plateformesPubliables ?? [])];
  // Les questions du moteur (champs exigés, taille, genre, description Vinted,
  // rayon à choisir) — comptées comme le stepper les compte.
  if ((m.nbQuestions ?? 0) > 0) {
    motifs.push({ cle: "questions", libelle: m.nbQuestions > 1 ? (en ? `${m.nbQuestions} answers` : `${m.nbQuestions} réponses`) : (en ? "1 answer" : "1 réponse") });
  }
  // Le prix : le stepper refuse sous 1 € (minimum Vinted, le plus strict).
  const prix = Number(m.price);
  if (m.price == null || String(m.price).trim() === "" || !Number.isFinite(prix) || prix < 1) {
    motifs.push({ cle: "prix", libelle: en ? "Price" : "Prix" });
  }
  // Le texte : en lot personne ne relit une carte — un texte qui n'est pas
  // celui du vendeur (titre OU description) se montre et se valide.
  if (texteARelire(m) && !decisions.texteValide) {
    motifs.push({ cle: "texte", libelle: en ? "Text to check" : "Texte à relire" });
  }
  // Un article qui ressemble, en ligne sur une plateforme visée : la question
  // « est-ce le même article ? » (jamais une fusion, jamais un refus muet).
  // (09/10 soir, Louis) Une fiche à PLUSIEURS exemplaires n'est jamais
  // retenue par une ressemblance (m.quantiteFiche, posée par le lot).
  const tranches = decisions.jumeauxTranches ?? new Set();
  const jumeauxOuverts = jumeauxQuiRetiennent(m, plateformes, tranches);
  if (jumeauxOuverts.length) {
    motifs.push({ cle: "jumeau", libelle: en ? "Same item?" : "Même article ?" });
  }
  // LE POIDS n'est JAMAIS une question du lot (10/10, Nico : « le lot doit se
  // comporter exactement comme l'unité »). À l'unité, sans poids, Leboncoin
  // garde l'estimation qu'il pré-coche d'après le rayon (format et palier) et
  // Beebs son pré-remplissage, ou le palier du rayon (extension) — rien n'est
  // demandé. Le lot faisait de l'absence de poids un « À compléter » (04/10) :
  // c'était le seul écart. Le poids connu (lot, copie Leboncoin, fiche) part
  // et choisit le palier exact ; le format deviné par la rédaction reste
  // écarté au service du job (_shared/livraison-poids.js). Un champ « Poids
  // du colis » qu'une plateforme EXIGE (compte pro Leboncoin) reste une
  // question du moteur, comptée ci-dessus, comme au stepper.
  // (09/10 soir) DEPOP : les frais de port que paie l'acheteur — le prix par
  // défaut des Réglages, ou celui dit UNE fois pour le lot (LivraisonDuLot).
  // Sans eux, l'article est À COMPLÉTER, jamais une question après l'envoi.
  if (plateformes.includes("depop") && m.portDepop?.manquant) {
    motifs.push({ cle: "port_depop", libelle: en ? "Depop shipping" : "Port Depop" });
  }
  // Plus aucune plateforme où partir (toutes exclues) : rien ne partira.
  if (!plateformes.length) {
    motifs.push({ cle: "aucune", libelle: en ? "Nowhere to publish" : "Aucune plateforme" });
  }
  // Le bouton du moteur est gris pour une raison que rien ci-dessus ne nomme :
  // on reprend SES mots (motifsCtaGris), jamais un « prêt » qu'il refuserait.
  if (!motifs.length && m.ctaDisabled && m.preparationAuRepos) {
    motifs.push({ cle: "cta", libelle: String(m.motifsCtaGris?.[0] ?? (en ? "To check" : "À vérifier")) });
  }
  const pret = Boolean(m.preparationAuRepos) && !motifs.length && !m.ctaDisabled;
  return { pret, motifs, plateformes, jumeauxOuverts };
}

// ── LE POIDS ET LE COLIS, PAR PLATEFORME (04/10, relevé live) ─────────────
// Ce que chaque plateforme demande VRAIMENT, et ce que le lot en fait :
//   · Leboncoin : un format (une TAILLE : Petit / Moyen / Volumineux) et un
//     palier de POIDS → le poids connu choisit le palier, sinon l'estimation
//     de Leboncoin reste (10/10, comme à l'unité) ; format s'il est choisi ;
//   · Beebs : « Format du colis » = un palier de POIDS → le poids connu, sinon
//     le pré-remplissage de Beebs ou le palier du rayon (extension) ;
//   · Vinted : une TAILLE de colis, jamais un poids → pas de poids exigé ;
//     (05/10) la taille choisie (carte du stepper, bloc Livraison du lot)
//     part, sinon celle de la fiche, sinon celle retenue pour le rayon,
//     sinon celle que Vinted recommande (utils/vintedColis.js) ;
//   · eBay (API) : ni poids ni format dans notre publication — les frais
//     viennent de la politique d'expédition du compte.
export const PLATEFORMES_AU_POIDS = Object.freeze(["leboncoin", "beebs"]);
export const plateformesAuPoids = (plateformes) => [...(plateformes ?? [])].filter((p) => PLATEFORMES_AU_POIDS.includes(p));

/** Le poids connu de l'article (grammes), ou null : réglé dans le lot, sur la copie Leboncoin, ou sur la fiche. */
export function poidsConnu(m, decisions = {}) {
  for (const v of [decisions?.poids, m?.edited?.leboncoin?.platform_fields?.lbcPoidsGrammes, m?.initialListing?.poids_g]) {
    const g = Number(v);
    if (v != null && v !== "" && Number.isFinite(g) && g > 0) return Math.round(g);
  }
  return null;
}

/** Une saisie de poids (« 650 », « 1,2 kg », « 300 g ») en grammes, ou null. */
export function lirePoidsSaisi(brut) {
  const t = String(brut ?? "").trim().toLowerCase().replace(",", ".");
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(kg|g)?$/);
  if (!m) return null;
  const g = m[2] === "kg" ? Number(m[1]) * 1000 : Number(m[1]);
  return Number.isFinite(g) && g >= 1 && g <= 150000 ? Math.round(g) : null;
}

/** Le texte qui part n'est-il PAS celui du vendeur ? (titre ou description) */
export function texteARelire(m) {
  const tv = m?.texteVendeur ?? {};
  return !String(tv.titre ?? "").trim() || !String(tv.description ?? "").trim();
}

// ── Le suivi d'un lot, depuis les jobs en base ─────────────────────────────
const FINIS_EN_LIGNE = new Set(["published", "sold", "dry_run_completed"]);
/**
 * Classe les jobs d'un lot en groupes, pour l'écran de suivi :
 *   geste (needs_user) · en_cours (processing) · file (pending) ·
 *   en_ligne (published/sold) · pas_parties (failed/cancelled hors arrêt) ·
 *   arretees (arrêt demandé par la personne — dit, jamais compté en échec).
 * Par ARTICLE (une ligne par article, ses plateformes en pastilles), dans
 * l'ordre : ce qui demande un geste d'abord.
 */
export function suiviDuLot(jobs = []) {
  const parArticle = new Map();
  for (const j of jobs ?? []) {
    if (!j || String(j.action ?? "publish") !== "publish") continue;
    const k = String(j.inventaire_id ?? "");
    if (!parArticle.has(k)) parArticle.set(k, []);
    parArticle.get(k).push(j);
  }
  const lignes = [];
  const compte = { geste: 0, en_cours: 0, file: 0, en_ligne: 0, pas_parties: 0, retirees: 0, arretees: 0 };
  let annonces = 0, annoncesEnLigne = 0, annoncesRetirees = 0;
  for (const [inventaireId, liste] of parArticle) {
    // Une plateforme = son job le plus récent dans le lot.
    const parPf = new Map();
    for (const j of liste) {
      const cur = parPf.get(j.platform);
      if (!cur || String(j.created_at ?? "") > String(cur.created_at ?? "")) parPf.set(j.platform, j);
    }
    const pastilles = [...parPf.values()].map((j) => ({ platform: j.platform, etat: etatJobLot(j), job: j }));
    for (const p of pastilles) {
      annonces++;
      if (p.etat === "en_ligne") annoncesEnLigne++;
      if (p.etat === "retiree") annoncesRetirees++;
    }
    const groupe = groupeArticle(pastilles.map((p) => p.etat));
    compte[groupe]++;
    lignes.push({ inventaireId, groupe, pastilles });
  }
  const ordre = ["geste", "en_cours", "file", "pas_parties", "en_ligne", "retirees", "arretees"];
  lignes.sort((a, b) => ordre.indexOf(a.groupe) - ordre.indexOf(b.groupe));
  const enVol = compte.en_cours + compte.file;
  return { lignes, compte, articles: lignes.length, annonces, annoncesEnLigne, annoncesRetirees, fini: enVol === 0 };
}

/** L'état d'UNE annonce du lot, dans le vocabulaire du suivi. */
export function etatJobLot(j) {
  if (!j) return "file";
  if (estArretUtilisateur(j)) return "arretee";
  if (FINIS_EN_LIGNE.has(j.status)) return "en_ligne";
  if (j.status === "needs_user") return "geste";
  if (j.status === "processing") return "en_cours";
  if (j.status === "pending") return "file";
  // Publiée PUIS retirée (retrait demandé, vente ailleurs) : le dépôt a réussi,
  // ce n'est jamais un « pas partie ».
  if (j.published_at || String(j.listing_url ?? "").trim()) return "retiree";
  return "pas_partie"; // failed, cancelled (hors arrêt demandé)
}

/** Le groupe d'un article, à partir des états de ses annonces. */
export function groupeArticle(etats) {
  if (etats.includes("geste")) return "geste";
  if (etats.includes("en_cours")) return "en_cours";
  if (etats.includes("file")) return "file";
  if (etats.includes("pas_partie")) return "pas_parties";
  if (etats.includes("en_ligne")) return "en_ligne";
  if (etats.includes("retiree")) return "retirees";
  return "arretees";
}

// ── L'arrêt ────────────────────────────────────────────────────────────────
// Ce qu'on peut arrêter SANS RISQUE : un dépôt pas encore commencé (pending),
// ou qui attend un geste (needs_user) — rien n'est en ligne. Jamais un dépôt en
// cours (processing) : l'extension est peut-être déjà sur le formulaire, il va
// au bout et on le dit.
export function depotArretable(j) {
  return Boolean(j) && String(j.action ?? "publish") === "publish"
    && (j.status === "pending" || j.status === "needs_user")
    && !j.listing_url && !String(j.platform_listing_id ?? "").trim();
}
export const MESSAGE_ARRET_DEPOT = "Arrêtée à ta demande — rien n'a été publié.";

/** Le marqueur de lot posé dans platform_fields à la création (porté par la RPC). */
export function marqueLot(lotId, le = new Date().toISOString()) {
  return { lot_publication: { id: String(lotId), le } };
}
export const idLotDeJob = (j) => j?.platform_fields?.lot_publication?.id ?? j?.bulk_batch_id ?? null;

// ── Les réponses groupées : même liste fermée = une réponse pour tous ──────
/**
 * Regroupe, sur plusieurs articles, les questions de champ « à liste fermée »
 * identiques (même plateforme, même champ, mêmes valeurs) : une seule réponse
 * les remplit toutes. `entrees` = [{ id, gp, key, label, allowedValues }].
 * Rend [{ signature, gp, key, label, allowedValues, ids: [...] }] — seulement
 * les groupes d'au moins deux articles.
 */
export function groupesReponseCommune(entrees) {
  const groupes = new Map();
  for (const e of entrees ?? []) {
    const vals = Array.isArray(e.allowedValues) ? e.allowedValues.map((v) => String(v)) : [];
    if (!vals.length || vals.length > 60) continue;
    const signature = `${e.gp}|${e.key}|${vals.join("␟")}`;
    if (!groupes.has(signature)) groupes.set(signature, { signature, gp: e.gp, key: e.key, label: e.label, allowedValues: vals, ids: [] });
    const g = groupes.get(signature);
    if (!g.ids.includes(e.id)) g.ids.push(e.id);
  }
  return [...groupes.values()].filter((g) => g.ids.length >= 2);
}

// ═══════════════════════════════════════════════════════════════════════════
// LE MUR DE CONVERSION DU LOT (03/10/2026, décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Quand le quota du mois ne couvre pas tout le lot, deux choix clairs :
//   · passer au palier au-dessus, par le parcours d'achat EXISTANT
//     (openUpgradeModal → App Store, Google Play ou Stripe) ;
//   · continuer avec ce que le quota permet — le reste attend le nouveau mois.
// Le gratuit ne dépasse JAMAIS son quota (partagerQuota ne prépare rien
// au-delà, et generate-listing refuse en 402 de son côté).
// ⛔ UN ABONNEMENT SE CHANGE LÀ OÙ IL A ÉTÉ PRIS : Apple → Apple, Google →
//    Google, carte → Stripe. Payé ailleurs que sur cet appareil : on le dit et
//    on montre où, on ne lance JAMAIS un second abonnement.

export const PALIERS = PALIERS_COMPTE;

/** Le palier d'un compte, avec l'expression canonique du premium (pur). */
export function palierCourant({ isPremium = false, isPro = false, isBusiness = false } = {}) {
  // Le calcul unique (utils/palier.js, 04/10) : Business ⇒ Pro ⇒ Premium.
  return palierDesDrapeaux({ isPremium, isPro, isBusiness });
}

/** Le palier juste au-dessus, ou null (Business, ou offre Business masquée). */
export function palierSuivant(palier, { businessVisible = false } = {}) {
  if (palier === "gratuit") return "premium";
  if (palier === "premium") return "pro";
  if (palier === "pro") return businessVisible ? "business" : null;
  return null;
}

/** Le canal de CET appareil : 'apple' (iOS), 'google' (Android), 'stripe' (web). */
export function canalAppareil(plateforme) {
  if (plateforme === "ios") return "apple";
  if (plateforme === "android") return "google";
  return "stripe";
}

/**
 * Où l'abonnement EN COURS a été pris (pur). null = aucun abonnement payant
 * connu (gratuit, ou premium offert) : rien à doublonner, l'achat se fait
 * sur cet appareil. Plusieurs marqueurs : on préfère celui de CET appareil
 * s'il en fait partie (c'est là que la montée se fera), sinon le premier.
 * ⛔ Les marqueurs Apple/Google survivent à la résiliation : ils ne disent
 *    JAMAIS qu'on est premium (règle du 25/07) — ici seulement OÙ un
 *    abonnement payant, déjà établi par le palier, a été pris.
 */
export function canalAbonnement({ payant = false, apple = null, google = null, stripe = null } = {}, canalIci = null) {
  if (!payant) return null;
  const canaux = [apple ? "apple" : null, google ? "google" : null, stripe ? "stripe" : null].filter(Boolean);
  if (!canaux.length) return null;
  if (canalIci && canaux.includes(canalIci)) return canalIci;
  return canaux[0];
}

/** Monter de palier ICI est-il possible sans doubler un abonnement ? (pur) */
export function monteePossibleIci(canalAbo, canalIci) {
  return canalAbo == null || canalAbo === canalIci;
}

// Un lot interrompu par un paiement (Stripe quitte la page) : retrouvé au
// retour, sur CET appareil seulement, pendant deux heures. Effacé dès que le
// lot part ou se ferme.
export const CLE_REPRISE_LOT = (uid) => `fs_lot_reprise_${uid}`;
export const REPRISE_LOT_MAX_MS = 2 * 3600 * 1000;
/** La reprise lue est-elle encore valable ? (pur) */
export function repriseValable(reprise, maintenant = Date.now()) {
  if (!reprise || !Array.isArray(reprise.ids) || !reprise.ids.length) return false;
  const t = Date.parse(reprise.le ?? "");
  return Number.isFinite(t) && maintenant - t >= 0 && maintenant - t <= REPRISE_LOT_MAX_MS;
}
