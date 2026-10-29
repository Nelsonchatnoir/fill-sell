// ⚠️ FICHIER GÉNÉRÉ — ne pas éditer à la main.
//   node scripts/gen-etat-job-extension.mjs
// Sources recopiées à l'octet près (seuls import/export changent) :
//   src/utils/publicationState.js
//   src/utils/retenueServeur.js
//   supabase/functions/_shared/attente-autre-boutique.js
//   supabase/functions/_shared/etat-job.js
// Le popup lit globalThis.FILLSELL_ETAT_JOB — un seul calcul d'état, le même que l'app.
(() => {
const __M = {};
// ── lien-vinted (extension) : l'origine unique, chrome-extension/vinted-origine.js ──
__M.lienVinted = (() => {
const origineVinted = () => globalThis.FILLSELL_VINTED?.origineVinted?.() ?? null;
const domaineVinted = () => { const o = origineVinted(); return o ? new URL(o).host.replace(/^www\./, "") : "Vinted"; };
const lienAnnonceVinted = (numero) => { const o = origineVinted(); return o ? `${o}/items/${numero}` : null; };
return { origineVinted, domaineVinted, lienAnnonceVinted };
})();

// ── src/utils/publicationState.js ──────────────────────────────────────────────────
__M.publicationState = (() => {
// ── Retrait ciblé (2026-07-19) : état de retrait par plateforme ──────────────
// Extrait de StockTab.jsx le 2026-07-25 (S7) : le stepper relit désormais
// lui-même l'état publié de l'article (le chemin Lens ne reçoit pas
// alreadyPublished du Stock) — importer StockTab depuis ListingPreviewScreen
// aurait créé un cycle, la fonction vit donc ici. Logique inchangée.
//
// Le job publish reste 'published' en base même après une suppression réussie
// (l'extension le passe ensuite en 'cancelled', mais pas instantanément) :
// c'est le delete LE PLUS RÉCENT de la plateforme qui dit la vérité — à
// condition d'être POSTÉRIEUR au dernier publish 'published' (une
// republication après retrait rallume le logo, l'ancien delete ne compte plus).
//   'removing' → delete pending/processing : retrait en cours, action désarmée ;
//   'removed'  → delete 'deleted' : la plateforme n'est plus active ;
//   failed/needs_user/dry_run_completed → rien : l'annonce est toujours en
//                ligne, le retrait reste proposable.
// ⚠️ dédoublonnage published (2026-07-13) : un article REPUBLIÉ crée un NOUVEAU
// job pour la même plateforme sans clore l'ancien — deux jobs "published"
// leboncoin coexistent en base pour la même annonce (même listing_url,
// vérifié). Sans le Set, la pastille s'affichait deux fois.
// Partagé carte Stock (logos) + RemovePlatformsModal + stepper (publishedSet) :
// un seul calcul, jamais deux vérités. La garde serveur de
// spend_coins_and_publish (already_published) réplique la même sémantique.
// ── Quelle suppression vise quelle publication (2026-09-06) ──────────────────
// Un job delete « couvre » une publication si :
//   · les deux portent un identifiant d'annonce ET c'est le MÊME
//     (platform_listing_id, ou l'id lu dans listing_url) — la preuve directe ;
//   · sinon (au moins un des deux sans identifiant), si la suppression est
//     POSTÉRIEURE À LA MISE EN LIGNE — published_at, pas created_at.
// Pourquoi published_at : un job publish peut vivre longtemps avant d'être
// publié (needs_user relancé, voie API, reprise) ; sa created_at est alors
// plus ancienne qu'un delete visant une AUTRE publication du même article.
// Cas réel du 06/09 (T-shirt Adidas, voie API) : publish créé 12:08, publié
// 12:24 ; un delete créé 12:18 visait l'annonce précédente (820094298354) et
// « effaçait » la nouvelle (820094306007) — aucune pastille eBay, article
// pourtant en ligne. La voie formulaire a le même trou dès qu'un publish est
// relancé après un retrait.
// (18/10 nuit, point 4) L'origine Vinted passe par _shared/lien-vinted.js : vinted.fr ici,
// le domaine du vendeur dans la copie de l'extension (scripts/gen-etat-job-extension.mjs).
const { lienAnnonceVinted } = __M.lienVinted;
function idAnnonceDe(job) {
  const direct = String(job?.platform_listing_id ?? "").trim();
  if (direct) return direct;
  const url = String(job?.listing_url ?? "");
  const m = url.match(/\/itm\/(\d+)|\/items\/(\d+)|\/(\d{6,})(?:[/?#]|$)/);
  return m ? (m[1] || m[2] || m[3]) : null;
}
// ── « PLUS EN LIGNE — VENDUE ? » JAMAIS POUR UNE ANNONCE REMPLACÉE (08/10, Louis) ──
// Une annonce Vinted dont la fiche vit sur une AUTRE annonce, en ligne au
// dernier relevé du dressing (vinted_status 'active', aucune disparition,
// synchro de moins de 48 h), n'est pas une vente : la question ne se pose pas.
// Louis, 06/10 : 14 « Oui » sur des copies remplacées, 4 annonces toujours en
// ligne, 14 remises en vente en double. La base refuse aussi cette vente
// (enregistrer_vente_atomique, migration 20261008110000). Une preuve positive
// (« 🎉 Vendue ») n'est jamais masquée.
function vintedRemplaceeParUneEnLigne(job, item, maintenant = Date.now()) {
  if (!job || job.platform !== "vinted" || !item) return false;
  if ((job.platform_fields ?? {}).sale_signal === "sold") return false;
  const idFiche = String(item.vinted_item_id ?? "").trim();
  const idJob = idAnnonceDe(job);
  if (!idFiche || !idJob || idFiche === String(idJob)) return false;
  if (item.vinted_status !== "active" || item.disparu_le) return false;
  const synchro = Date.parse(item.last_synced_at ?? "");
  return Number.isFinite(synchro) && maintenant - synchro < 48 * 3600_000;
}
function miseEnLigneDe(job) {
  return Date.parse(job?.published_at || job?.created_at || 0);
}
function suppressionCouvre(del, pub) {
  if (!del || !pub) return false;
  const idDel = idAnnonceDe(del), idPub = idAnnonceDe(pub);
  if (idDel && idPub) return idDel === idPub;
  return Date.parse(del.created_at || 0) > miseEnLigneDe(pub);
}

function computeRemovalInfo(jobsAll) {
  const jobs = jobsAll.filter(j => j.action !== "delete");
  const deleteJobs = jobsAll.filter(j => j.action === "delete");
  const published = [...new Set(jobs.filter(j => j.status === "published").map(j => j.platform))];
  const latestPubByPlatform = {};
  for (const j of jobs) {
    if (j.status !== "published") continue;
    const cur = latestPubByPlatform[j.platform];
    // Dernière MISE EN LIGNE (published_at), pas dernière création.
    if (!cur || miseEnLigneDe(j) > miseEnLigneDe(cur)) latestPubByPlatform[j.platform] = j;
  }
  const removalState = {};
  for (const p of published) {
    const pub = latestPubByPlatform[p];
    if (!pub) continue;
    // La suppression la plus récente QUI VISE cette publication.
    const del = deleteJobs
      .filter(j => j.platform === p && suppressionCouvre(j, pub))
      .sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))[0];
    if (!del) continue;
    if (del.status === "deleted") removalState[p] = "removed";
    else if (del.status === "pending" || del.status === "processing") removalState[p] = "removing";
  }
  const publishedActive = published.filter(p => removalState[p] !== "removed");
  // Jobs publish encore en file (pending/processing) : la plateforme est en
  // COURS de publication. La garde serveur already_published refuse déjà un
  // nouveau job dans cet état — ce champ permet au stepper de le dire AVANT le
  // tunnel. Champ séparé de publishedActive : les pastilles du Stock, elles,
  // ne montrent que le réellement en ligne.
  const queued = [...new Set(jobs.filter(j => j.status === "pending" || j.status === "processing").map(j => j.platform))];
  return { published, removalState, publishedActive, queued, latestPubByPlatform };
}

// ── Plateformes RÉSERVÉES par une republication en vol (2026-08-05) ──────────
// Trou ouvert par la bascule REPUBLISH_DRY_RUN=false, et invisible tant que le
// dry run ne supprimait rien : à la suppression, le job publish d'origine est
// passé 'cancelled' par cancelPublishAfterDelete. Or la carte ne lit pas les
// 'cancelled' — donc, entre la suppression et la recréation, plus AUCUN job
// vinted n'est 'published' et computeRemovalInfo rend publishedActive = []
// (vérifié sur les 5 phases). Vinted redevenait donc une plateforme « libre » :
// le stepper la proposait, et la garde serveur already_published ne pouvait pas
// rattraper (elle cherche un job 'published', il n'y en a plus). On publiait
// une 2e annonce que la recréation venait doubler quelques minutes plus tard.
//
// On ne « rallume » PAS l'affichage « En ligne » pour autant : pendant cette
// fenêtre l'annonce est réellement hors ligne, et le dire serait faux. C'est
// l'OFFRE de publication qu'on ferme, pas l'état qu'on maquille.
//
// Fenêtre retenue = tant qu'une (re)création reste à venir :
//   · pending / processing, quelle que soit l'étape ;
//   · needs_user à l'étape 'deleted' — l'annonce est retirée et la relance
//     repart à la recréation, donc publier maintenant ferait bien doublon.
// Un needs_user AVANT la suppression ne réserve rien : l'annonce est toujours
// en ligne, donc son job publish est toujours 'published' et la couvre déjà.
function plateformesReserveesParRepublication(jobsAll) {
  const reservees = new Set();
  for (const j of jobsAll ?? []) {
    if (j.action !== "republish") continue;
    const step = j.platform_fields?.republish_step ?? "a_capturer";
    const enVol = j.status === "pending" || j.status === "processing"
      || (j.status === "needs_user" && step === "deleted");
    if (enVol && j.platform) reservees.add(j.platform);
  }
  return [...reservees];
}

// ── « DÉJÀ EN LIGNE » D'UNE ANNONCE QUE PLUS PERSONNE NE VOIT (15/10, Louis) ──
// Rangement gris de Louis : son annonce Vinted n'est plus dans sa boutique
// depuis le 07/10 (unavailable_since), la question « Vendue ? » a été reportée,
// et le stepper disait encore « déjà en ligne pour cet article » — faux, et sans
// issue. Le verrou RESTE (la garde serveur already_published le tient : une
// fiche, une annonce par plateforme) ; ce qui change, c'est la phrase et le
// geste : depuis quand l'annonce n'est plus vue, et la question qui libère la
// case. Une plateforme n'est « en doute » que si TOUTES ses annonces publiées
// le sont, et jamais pendant une publication ou une republication en vol.
// Rend { [plateforme]: { job, depuis, vendue } }.
function plateformesEnDoute(jobsAll) {
  const tous = Array.isArray(jobsAll) ? jobsAll : [];
  const jobs = tous.filter(j => j.action !== "delete");
  const { publishedActive } = computeRemovalInfo(tous);
  const reservees = new Set(plateformesReserveesParRepublication(tous));
  const out = {};
  for (const p of publishedActive) {
    if (reservees.has(p)) continue;
    if (jobs.some(j => j.platform === p && (j.status === "pending" || j.status === "processing"))) continue;
    const pubs = jobs.filter(j => j.platform === p && j.status === "published");
    if (!pubs.length || !pubs.every(j => j.platform_fields?.unavailable_since)) continue;
    const dernier = pubs.reduce((a, b) => (miseEnLigneDe(b) > miseEnLigneDe(a) ? b : a));
    out[p] = {
      job: dernier,
      depuis: dernier.platform_fields.unavailable_since,
      vendue: dernier.platform_fields.sale_signal === "sold",
    };
  }
  return out;
}

/** La phrase du verrou « en doute » (stepper, deux variantes) — jamais « déjà en ligne ». */
function phraseDouteEnLigne(d, lang = "fr") {
  const en = lang === "en";
  const t = Date.parse(d?.depuis ?? "");
  const date = Number.isFinite(t)
    ? new Date(t).toLocaleDateString(en ? "en-GB" : "fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" })
    : null;
  if (d?.vendue) {
    return en
      ? `Sold according to the platform${date ? ` (${date})` : ""}: confirm the sale to free this box`
      : `Vendue d'après la plateforme${date ? ` (le ${date})` : ""} : confirme la vente pour libérer la case`;
  }
  return en
    ? `No longer seen online${date ? ` since ${date}` : ""}: sold or removed? Your answer frees this box`
    : `Plus vue en ligne${date ? ` depuis le ${date}` : ""} : vendue ou retirée ? Ta réponse libère la case`;
}

// ── « Encore en ligne » AVANT d'enregistrer une vente (2026-08-11) ───────────
// Enregistrer une vente ne retire RIEN : ni confirmSell (modale « Marquer comme
// vendu ») ni confirmSellDirect (intent vocal inventory_sell) n'arment de job
// delete — seul le flux serveur déclenché par la SONDE le fait
// (check-listing-status → orchestrateSale). L'annonce reste donc achetable
// après coup. Cette fonction dit où, pour un article donné ; le texte, lui, vit
// dans components/AvertissementAnnoncesEnLigne.jsx et nulle part ailleurs.
//
// Elle répond à « qu'est-ce qu'un acheteur voit encore ? », pas à « que
// peut-on retirer sans risque ? » — c'est pourquoi elle n'est PAS
// buildDeletePlan (App.jsx), qui écarte à raison les plateformes sans
// listing_url (aucun delete à l'aveugle) et celles dont le retrait est déjà
// armé. Ces deux-là restent visibles par un acheteur : les taire ici serait
// mentir. Le socle de calcul reste computeRemovalInfo, comme partout.
// Ordre d'affichage des plateformes d'un article. Opla en QUEUE (lot C) : la
// liste ne sert qu'à trier ce qui est DÉJÀ là, elle n'ajoute jamais une ligne.
// Un article sans annonce Opla est trié exactement comme avant.
const ORDRE_PLATEFORMES = ["vinted", "leboncoin", "beebs", "ebay", "opla", "depop"];
const rangPlateforme = (p) => {
  const i = ORDRE_PLATEFORMES.indexOf(p);
  return i === -1 ? ORDRE_PLATEFORMES.length : i;
};

// ── vinted_status PRIME sur les jobs (2026-08-28, complément Nico) ───────────
// 44 articles du parc portaient un job FillSell 'published' ET un
// vinted_status masqué/brouillon : la pastille verte (jobs seuls) les disait
// « En ligne » alors qu'aucun acheteur ne les voit. Règle : hidden/draft ⇒
// jamais présenté comme en ligne. GARDE-FOU DE FRAÎCHEUR : le statut date du
// dernier run de sync qui a VU l'article (998 des 1 457 hidden ont 7-14 j) —
// un job vinted 'published' POSTÉRIEUR à last_synced_at l'emporte, sinon une
// publication d'aujourd'hui serait masquée par un relevé vieux de dix jours.
// Comparaison d'horodatages, jamais le statut seul. disparu_le prime déjà
// partout (l'annonce n'existe plus : autre pastille, autre règle).
// SOURCE UNIQUE : pastille verte + logos (carte Stock), puce Masquée/
// Brouillon, repubEtat/repubEligible et annoncesEncoreEnLigne lisent tous ce
// helper — deux expressions divergentes referaient deux vérités.
function vintedMasqueeMalgreJobs(item, jobsAll) {
  if (item?.vinted_status !== "hidden" && item?.vinted_status !== "draft") return false;
  if (item?.disparu_le) return false;
  const releve = Date.parse(item?.last_synced_at ?? "");
  if (!Number.isFinite(releve)) return true; // relevé non daté : le statut fait foi
  return !(jobsAll ?? []).some((j) => j.platform === "vinted"
    && j.action !== "delete" && j.status === "published"
    && Date.parse(j.published_at ?? j.created_at ?? 0) > releve);
}

function annoncesEncoreEnLigne(item, jobsAll) {
  const { publishedActive, latestPubByPlatform } = computeRemovalInfo(jobsAll ?? []);
  const masquee = vintedMasqueeMalgreJobs(item, jobsAll);
  // Vendue, close ou disparue (05/10) : même règle que la carte.
  const vintedVisible = vintedPresenceArticle(item, jobsAll).visible;
  const enLigne = [];
  for (const p of publishedActive) {
    // Masquée/brouillon malgré un job 'published' (relevé plus récent que le
    // job) : invisible d'un acheteur, on ne la dit pas « encore en ligne ».
    if (p === "vinted" && (masquee || !vintedVisible)) continue;
    const pub = latestPubByPlatform[p];
    // La sonde a DÉJÀ constaté que l'annonce n'est plus atteignable
    // (platform_fields.unavailable_since) : ce cas appartient au bandeau
    // « Vendue ? », et dire « encore en ligne » ici serait faux.
    if (pub?.platform_fields?.unavailable_since) continue;
    // url absente = listing_url jamais capté par l'extension. La plateforme est
    // quand même nommée : le lien manque, pas l'annonce.
    enLigne.push({ platform: p, url: pub?.listing_url || null });
  }
  // Vinted importé du dressing : AUCUN job publish n'existe (l'annonce a été
  // créée sur Vinted, pas par nous) — computeRemovalInfo ne peut rien en dire.
  // La vérité est portée par l'article, avec la MÊME expression que le tri du
  // Stock et la carte : vinted_item_id posé, disparu_le vide.
  // SAUF masquée/brouillon (2026-08-28, décision Nico) : une annonce masquée
  // ou à l'état de brouillon sur Vinted n'est PAS visible d'un acheteur — la
  // dire « encore en ligne » serait faux. Même règle de fraîcheur que
  // partout : vintedMasqueeMalgreJobs (helper ci-dessus).
  if (item?.vinted_item_id && vintedVisible
    && !enLigne.some(a => a.platform === "vinted")) {
    enLigne.push({ platform: "vinted", url: lienAnnonceVinted(item.vinted_item_id) });
  }
  return enLigne.sort((a, b) => rangPlateforme(a.platform) - rangPlateforme(b.platform));
}

// ── Vinted lu sur l'ARTICLE — source unique filtre Diffusion + carte (2026-09-11)
// Signalement Joséphine (Pro, mail du 10/09) : le filtre « Pas encore sur
// Vinted » listait des articles dont la carte disait « En ligne ». Deux causes :
// les jobs tronqués à 1 000 par PostgREST (corrigé dans StockTab, lecture
// paginée) et DEUX expressions différentes — le filtre ne lisait que les jobs
// 'published', la carte y ajoutait Vinted quand une republication était en vol.
// Vinted est la seule plateforme où une annonce peut exister SANS job FillSell
// (import du dressing) : la vérité est portée par l'ARTICLE, même expression
// que annoncesEncoreEnLigne ci-dessus, les jobs ne font que la confirmer.
//   occupee : une annonce Vinted existe, visible ou non → « Publier sur
//             Vinted » ferait doublon ; l'article n'est PAS « pas encore ».
//   visible : un acheteur la voit → pastille verte, chip « En ligne sur Vinted ».
// Masquée/brouillon (vinted_status, garde de fraîcheur du helper) = occupée
// mais pas visible. disparu_le = ni l'une ni l'autre (l'annonce n'existe plus).
// Les trois autres plateformes ne changent pas : jobs 'published' seuls.
//
// ── UNE ANNONCE VENDUE N'EST PLUS « EN VENTE » (05/10, Louis) ───────────────
// « 12 adaptateurs Jaune » (quantité 9998) gardait le logo Vinted alors que
// son annonce 10238384500 était vendue (job 'sold') : la seule présence de
// vinted_item_id suffisait. Pour Louis, ce logo veut dire « en vente sur
// Vinted ». L'annonce PORTÉE PAR LA FICHE est morte quand : disparu_le, ou
// vinted_status 'sold'/'closed', ou un job Vinted 'sold' pour CE numéro.
// Un job 'published' ne la ressuscite que s'il vise une AUTRE annonce, ou s'il
// a été mis en ligne APRÈS le constat (relevé, disparition) — cas de « 12
// adaptateurs Rouge » : vendue le 04/10, republiée le 05/10 sous 10251765273
// alors que la fiche disait encore 'sold'. Un job 'sold' pour un numéro tue ce
// numéro, quelle que soit la date (une annonce vendue ne revient pas).
const VINTED_STATUTS_MORTS = new Set(["sold", "closed"]);
function vintedNumerosVendus(jobs) {
  const ids = new Set();
  for (const j of jobs) {
    if (j.platform !== "vinted" || j.action === "delete" || j.status !== "sold") continue;
    const id = idAnnonceDe(j);
    if (id) ids.add(id);
  }
  return ids;
}
function vintedPresenceArticle(item, jobsAll) {
  const jobs = jobsAll ?? [];
  const vendus = vintedNumerosVendus(jobs);
  const idFiche = item?.vinted_item_id != null ? String(item.vinted_item_id) : "";
  const constatStatut = VINTED_STATUTS_MORTS.has(item?.vinted_status) ? Date.parse(item?.last_synced_at ?? "") : NaN;
  const constatDisparu = item?.disparu_le ? Date.parse(item.disparu_le) : NaN;
  // Date du constat de mort de l'annonce de la fiche (Infinity = sans date :
  // le constat fait foi contre tout job de ce numéro).
  let mortLe = null;
  if (idFiche && vendus.has(idFiche)) mortLe = Infinity;
  else if (item?.disparu_le || VINTED_STATUTS_MORTS.has(item?.vinted_status)) {
    const dates = [constatStatut, constatDisparu].filter(Number.isFinite);
    mortLe = dates.length ? Math.max(...dates) : Infinity;
  }
  const ficheVivante = Boolean(idFiche) && mortLe == null;
  const { publishedActive, latestPubByPlatform } = computeRemovalInfo(jobs);
  let jobVivant = false;
  if (publishedActive.includes("vinted")) {
    const pub = latestPubByPlatform.vinted;
    const idPub = idAnnonceDe(pub);
    if (idPub && vendus.has(idPub)) jobVivant = false;
    else if (mortLe == null) jobVivant = true;
    else if (idPub && idFiche && idPub !== idFiche) jobVivant = true;
    else jobVivant = mortLe !== Infinity && miseEnLigneDe(pub) > mortLe;
  }
  const occupee = ficheVivante || jobVivant;
  const visible = occupee && !vintedMasqueeMalgreJobs(item, jobs);
  return { occupee, visible };
}

// ── ARRÊT D'UNE VAGUE DE REPUBLICATIONS — qui peut être annulé ? ────────────
// (07/09/2026, demande Ornella : une vague lancée ne pouvait plus s'arrêter.)
//
// LE DANGER, et la seule question qui compte : une republication SUPPRIME
// l'annonce puis la recrée. L'arrêter entre les deux, c'est perdre l'annonce
// pour de bon. On n'annule donc QUE ce qui n'a encore rien supprimé.
//
// La machine à étapes vit dans platform_fields.republish_step (background.js) :
//     'a_capturer' → 'captured' → 'deleted' → 'recreated'
// et depuis le 12/08 l'étape 'captured' fait le chemin critique EN UNE PASSE :
// relevé confirmé → formulaire rempli et vérifié → SUPPRESSION → 'deleted' →
// soumission. La suppression a donc lieu PENDANT 'captured', et le marqueur
// 'deleted' n'est écrit qu'APRÈS coup (marquerRepublishSupprime), écriture qui
// peut elle-même échouer (session absente, réseau). Autrement dit : un job à
// 'captured' PEUT déjà avoir supprimé l'annonce sans le dire.
//
// D'où la frontière, volontairement conservatrice :
//   · ANNULABLE       — republish_step absent ou 'a_capturer' : le relevé n'a
//                       même pas commencé, aucun formulaire n'a été rempli,
//                       aucune suppression n'a pu partir. Certitude, pas pari.
//   · JAMAIS ANNULÉ   — 'captured', 'deleted', 'recreated', et TOUT statut
//                       'processing' (une extension l'a en main à cet instant :
//                       l'annuler courserait la passe qui va supprimer).
//
// ⚠️ On lit la valeur BRUTE, jamais repubStepDe() qui normalise l'inconnu en
// 'a_capturer' : une étape non reconnue doit être traitée comme avancée, pas
// comme sûre. Une valeur inattendue n'est pas une preuve d'innocence.
function republishAnnulable(job) {
  if (!job || job.action !== "republish") return false;
  if (job.status !== "pending" && job.status !== "needs_user") return false;
  const step = job.platform_fields?.republish_step;
  return step == null || step === "a_capturer";
}

// Marqueur d'un arrêt DEMANDÉ par l'utilisateur : ce n'est pas un échec, et
// l'écran ne doit pas le raconter comme tel (ni pastille « Arrêtée », ni
// compteur d'arrêtées). L'annonce n'a jamais bougé — l'article repasse
// simplement « En ligne ». Même doctrine que gel_livres_le, qui a son propre
// rendu neutre plutôt que le « cancelled » générique.
const MARQUEUR_ARRET_UTILISATEUR = "arret_utilisateur";
// ── LE GEL LIVRES DU 28/08, LEVÉ PAR LE SERVEUR (2026-09-27) ────────────────
// get-pending-jobs pose gel_livres_leve_le quand le poste du compte porte le
// correctif de l'ISBN capturé (0.6.70) : la republication gelée n'est plus un
// état — l'article redevient « En ligne » et républiable, exactement comme
// après un arrêt demandé. Le marqueur d'origine reste, pour l'histoire.
const estArretUtilisateur = (job) => Boolean(job?.platform_fields?.[MARQUEUR_ARRET_UTILISATEUR])
  || Boolean(job?.platform_fields?.gel_livres_leve_le);
/** La republication est-elle ENCORE gelée (gel du 28/08 pas encore levé) ? */
const estGeleLivres = (job) => Boolean(job?.platform_fields?.gel_livres_le) && !job?.platform_fields?.gel_livres_leve_le;

return { idAnnonceDe, vintedRemplaceeParUneEnLigne, miseEnLigneDe, suppressionCouvre, computeRemovalInfo, plateformesReserveesParRepublication, plateformesEnDoute, phraseDouteEnLigne, vintedMasqueeMalgreJobs, annoncesEncoreEnLigne, vintedPresenceArticle, republishAnnulable, MARQUEUR_ARRET_UTILISATEUR, estArretUtilisateur, estGeleLivres };
})();

// ── src/utils/retenueServeur.js ──────────────────────────────────────────────────
__M.retenueServeur = (() => {
// ═══════════════════════════════════════════════════════════════════════════
// UNE REPUBLICATION RETENUE PAR LE SERVEUR SE VOIT (2026-10-01, carhoa)
// ═══════════════════════════════════════════════════════════════════════════
// Du 27/09 au 01/10, six livres de Carole sont restés « Relevée, en attente
// de republication » : get-pending-jobs ne les servait plus (ISBN capturé non
// standard, preuve attendue), écrivait un marqueur que rien ne lisait, et la
// carte promettait « cette annonce attend son tour ». Elle nous a écrit
// qu'elle ne comprenait pas pourquoi c'était bloqué.
//
// LE CONTRAT, UNIQUE (serveur et app lisent ce fichier) :
//   · le serveur qui RETIENT une republication encore en ligne (pending, hors
//     étape 'deleted') pose `platform_fields.retenue_serveur` =
//     { motif, depuis, ... } — daté une fois ;
//   · il la LÈVE (`retenue_levee`) dès qu'il la sert à nouveau ;
//   · l'app dit « En attente — ton annonce est intacte sur Vinted » ;
//   · l'ops-digest de 8h50 compte les jobs, les comptes et l'ancienneté.
// L'ancien marqueur de la garde ISBN (`retenue_isbn_capture`, 27/09) est lu
// comme une retenue du même motif et converti à la première écriture.
// ES module sans import (Deno + Vite).

// (18/10 nuit, point 4) Le domaine Vinted nommé dans les phrases passe par _shared/lien-vinted.js
// (vinted.fr ici, le domaine du vendeur dans la copie de l'extension).
const { domaineVinted } = __M.lienVinted;
const CLE_RETENUE = "retenue_serveur";
const RETENUE_ISBN_CAPTURE = "isbn_capture_non_standard";
// La boutique Vinted d'origine de l'article n'est connue nulle part (fiche,
// job, historique) : aucune opération ne part tant qu'elle n'est pas prouvée.
const RETENUE_BOUTIQUE_INCONNUE = "boutique_origine_inconnue";
// (03/10, point 11) Le poste n'a pas encore la version qui fait ce geste sans
// deviner (Beebs : avant la 0.6.83, le pré-vol demandait la taille à l'IA —
// ceinture « L » de nivake03 retirée, puis bloquée à la recréation).
const RETENUE_EXTENSION_A_JOUR = "extension_a_mettre_a_jour";
// (15/10 soir, Louis) L'annonce visée est portée par deux fiches : rien n'est
// retiré le temps que FillSell tranche seul (identifiants, photos, IA —
// _shared/annonce-partagee.js) ; la question ne vient qu'après.
const RETENUE_ANNONCE_PARTAGEE = "annonce_partagee_a_trancher";
const ANCIENNES_CLES = { retenue_isbn_capture: RETENUE_ISBN_CAPTURE };

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

/** { motif, depuis, boutiques? } de la retenue portée par ces platform_fields, ou null. */
function retenueServeurDe(pf) {
  const p = objet(pf) ?? {};
  const r = objet(p[CLE_RETENUE]);
  if (r && r.motif) {
    const boutiques = Array.isArray(r.boutiques) ? r.boutiques.map(String).filter(Boolean) : [];
    return { motif: String(r.motif), depuis: r.depuis ? String(r.depuis) : null, ...(boutiques.length ? { boutiques } : {}) };
  }
  for (const [cle, motif] of Object.entries(ANCIENNES_CLES)) {
    const a = objet(p[cle]);
    if (a) return { motif, depuis: a.depuis ? String(a.depuis) : null };
  }
  return null;
}

/** La retenue d'un job tant qu'elle a un sens : republication en attente, annonce encore en ligne. */
function retenueServeurDuJob(job) {
  if (!job || job.status !== "pending") return null;
  const pf = objet(job.platform_fields) ?? {};
  // (03/10, point G) Un RETRAIT dont la boutique n'est pas connue est retenu
  // lui aussi (« Alphalette » d'Ornella) — et le dit, boutiques nommées.
  if (job.action === "delete") {
    const r = retenueServeurDe(pf);
    return r && (r.motif === RETENUE_BOUTIQUE_INCONNUE || r.motif === RETENUE_ANNONCE_PARTAGEE) ? r : null;
  }
  if (job.action !== "republish") return null;
  if (String(pf.republish_step ?? "") === "deleted") return null;
  return retenueServeurDe(pf);
}

/**
 * Les platform_fields à écrire pour poser la retenue, ou null s'il n'y a rien
 * à écrire (déjà posée pour ce motif : datée une fois).
 */
function poserRetenueServeur(pf, motif, maintenant, detail = {}) {
  const p = { ...(objet(pf) ?? {}) };
  const actuelle = objet(p[CLE_RETENUE]);
  const ancienne = Object.keys(ANCIENNES_CLES).some((c) => c in p);
  if (actuelle && actuelle.motif === motif && !ancienne) return null;
  const depuis = retenueServeurDe(p)?.motif === motif ? (retenueServeurDe(p).depuis ?? maintenant) : maintenant;
  for (const c of Object.keys(ANCIENNES_CLES)) delete p[c];
  p[CLE_RETENUE] = { ...detail, motif, depuis };
  return p;
}

/**
 * Les platform_fields à écrire pour lever la retenue (trace `retenue_levee`),
 * ou null s'il n'y avait pas de retenue.
 */
function leverRetenueServeur(pf, maintenant, par) {
  const p = { ...(objet(pf) ?? {}) };
  const r = retenueServeurDe(p);
  if (!r) return null;
  delete p[CLE_RETENUE];
  for (const c of Object.keys(ANCIENNES_CLES)) delete p[c];
  p.retenue_levee = { motif: r.motif, depuis: r.depuis, le: maintenant, par: String(par ?? "") };
  return p;
}

/** Ce que la carte dit. Jamais de diagnostic : l'attente, et que rien n'est touché. */
function phraseRetenueServeur(fr = true, { plateforme = "Vinted", motif = null, boutiques = [], action = "republish" } = {}) {
  // (03/10, point G) Boutique d'origine inconnue : on dit laquelle ouvrir.
  if (motif === RETENUE_BOUTIQUE_INCONNUE) {
    const liste = (Array.isArray(boutiques) ? boutiques : []).map(String).filter(Boolean);
    const quoi = action === "delete"
      ? (fr ? "Ce retrait" : "This removal")
      : (fr ? "Cette republication" : "This repost");
    const ouvrir = liste.length
      ? (fr ? `Ouvre ${liste.join(" puis ")} sur ${domaineVinted()} dans Chrome` : `Open ${liste.join(" then ")} on ${domaineVinted()} in Chrome`)
      : (fr ? `Ouvre sur ${domaineVinted()}, dans Chrome, la boutique qui porte cette annonce` : `Open, on ${domaineVinted()} in Chrome, the shop that holds this listing`);
    return fr
      ? {
        court: "En attente",
        titre: "En attente de ta boutique — rien n'est touché à l'aveugle",
        detail: `${quoi} attend de savoir sur laquelle de tes boutiques Vinted est l'annonce : FillSell n'y touche pas sans le savoir. ${ouvrir} : FillSell y cherchera l'annonce par son numéro, et ça repartira tout seul.`,
      }
      : {
        court: "On hold",
        titre: "Waiting for your shop — nothing is touched blindly",
        detail: `${quoi} is waiting to know which of your Vinted shops holds the listing: FillSell won't touch it without knowing. ${ouvrir}: FillSell will look for the listing by its number, and it will resume on its own.`,
      };
  }
  // (03/10) La plateforme est nommée (la phrase disait « sur Vinted » pour toutes).
  if (motif === RETENUE_EXTENSION_A_JOUR) {
    return fr
      ? {
        court: "En attente",
        titre: "En attente de la mise à jour de l'extension — ton annonce est intacte",
        detail: `Cette republication attend la nouvelle version de l'extension FillSell sur ton ordinateur : ton annonce est intacte sur ${plateforme}, rien n'a été retiré. La mise à jour s'installe toute seule ; si rien ne bouge, ferme Chrome complètement puis rouvre-le.`,
      }
      : {
        court: "On hold",
        titre: "Waiting for the extension update — your listing is untouched",
        detail: `This repost is waiting for the new FillSell extension on your computer: your listing is untouched on ${plateforme}, nothing was removed. The update installs on its own; if nothing moves, fully close Chrome and open it again.`,
      };
  }
  return fr
    ? {
      court: "En attente",
      titre: "En attente — ton annonce est intacte",
      detail: `Cette republication attend chez nous avant de toucher à quoi que ce soit : ton annonce est intacte sur ${plateforme}, rien n'a été retiré. Elle repartira toute seule, tu n'as rien à faire.`,
    }
    : {
      court: "On hold",
      titre: "On hold — your listing is untouched",
      detail: `This repost is waiting on our side before touching anything: your listing is untouched on ${plateforme}, nothing was removed. It will resume on its own, nothing to do.`,
    };
}

return { CLE_RETENUE, RETENUE_ISBN_CAPTURE, RETENUE_BOUTIQUE_INCONNUE, RETENUE_EXTENSION_A_JOUR, RETENUE_ANNONCE_PARTAGEE, retenueServeurDe, retenueServeurDuJob, poserRetenueServeur, leverRetenueServeur, phraseRetenueServeur };
})();

// ── supabase/functions/_shared/attente-autre-boutique.js ──────────────────────────────────────────────────
__M.attenteAutreBoutique = (() => {
// ═══════════════════════════════════════════════════════════════════════════
// UN ARTICLE D'UNE AUTRE BOUTIQUE ATTEND EN SILENCE (03/10, point H)
// ═══════════════════════════════════════════════════════════════════════════
// ornellaracano (deux boutiques Vinted : @ornella-vend, @luciatrendyshop) :
// les chaussons bébé (job ef38f079) affichaient « Republication interrompue :
// nous n'avons pas pu vérifier l'état de ton annonce… Relance depuis l'app »
// (source « relancer ») alors que la vraie cause était prouvée : l'annonce vit
// sur @ornella-vend et Chrome était ouvert sur @luciatrendyshop. Un message
// d'alarme, et une relance qui rejoue le même mur.
//
// LA RÈGLE : une opération Vinted dont l'origine est PROUVÉE sur une autre
// boutique que celle ouverte attend, comme la garde « boutique_etrangere »
// (needs_user_source = 'boutique_etrangere') : get-pending-jobs la remet en
// file dès que la sonde voit CETTE boutique connectée — jamais avant, jamais
// sur une autre. La carte dit laquelle ouvrir ; rien à relancer.
// Posé par l'extension (0.6.91, une-passe) et, pour les jobs déjà arrêtés,
// par handler-watch (toutes versions).
// ES module sans import (Deno + Vite + node).

// (18/10 nuit, point 4) Le domaine Vinted nommé passe par ./lien-vinted.js (vinted.fr ici,
// le domaine du vendeur dans la copie de l'extension).
const { domaineVinted } = __M.lienVinted;
const POSE_PAR_ORIGINE_PROUVEE = "handler-watch (origine prouvée du job)";
const POSE_PAR_PAGE_EXACTE = "extension (propriétaire lu sur la page exacte)";
// (11/10) Une publication Vinted retenue sur la boutique de sa fiche (get-pending-jobs).
const POSE_PAR_PUBLICATION_BOUTIQUE = "get-pending-jobs (publication, boutique de la fiche)";
// (12/10, A6) La garde « identité prouvée » de get-pending-jobs (boutique de
// l'article lue en base ≠ boutique ouverte) : elle ne se levait JAMAIS — un
// retrait d'article vendu restait en attente même une fois la bonne boutique
// ouverte. Levée comme les autres : quand CETTE boutique est vue connectée.
const POSE_PAR_IDENTITE_PROUVEE = "get-pending-jobs (identité prouvée)";

/** Le marqueur posé peut-il être levé quand la sonde voit cette boutique ? */
function attenteBoutiqueLevable(garde) {
  if (!garde || typeof garde !== "object") return false;
  if (garde.motif !== "boutique_etrangere") return false;
  if (!String(garde.article ?? "").trim()) return false;
  return garde.pose_par === POSE_PAR_PAGE_EXACTE || garde.pose_par === POSE_PAR_ORIGINE_PROUVEE
    // (11/10, Louis) Une PUBLICATION retenue sur la boutique de sa fiche
    // (identite-boutique.js, verifierBoutiquePublicationVinted) repart seule,
    // elle aussi, dès que CETTE boutique est vue connectée.
    || garde.pose_par === POSE_PAR_PUBLICATION_BOUTIQUE
    || garde.pose_par === POSE_PAR_IDENTITE_PROUVEE;
}

/** Le texte de la carte : quelle boutique ouvrir, et que rien n'est touché. */
function messageAttenteBoutique(login, action = "republish") {
  const qui = login ? `ta boutique Vinted @${login}` : "ton autre boutique Vinted";
  // (11/10) Une publication : rien n'est encore en ligne, rien ne part ailleurs.
  if (action === "publish") return `En attente de ${qui} : cet article appartient à cette boutique, il ne se publie que sur elle. Ouvre-la sur ${domaineVinted()} dans Chrome, la publication repartira toute seule. Rien n'a été publié ailleurs.`;
  const suite = action === "delete" ? "le retrait repartira tout seul" : "la republication repartira toute seule";
  return `En attente de ${qui} : ouvre-la sur ${domaineVinted()} dans Chrome, ${suite}. Ton annonce est toujours en ligne, rien n'a été retiré.`;
}

/**
 * Un job arrêté dont la cause PROUVÉE est l'autre boutique, et qui ne porte
 * pas encore l'attente : ce qu'il faut écrire, ou null.
 * @param {any} job  cross_post_jobs (platform, action, status, error, platform_fields)
 * @param {Map<string, string|null>} logins  user_id Vinted → login (vinted_sync_pin)
 * @param {string} maintenant  ISO
 */
function reclasserAutreBoutique(job, logins, maintenant) {
  if (!job || job.platform !== "vinted" || job.status !== "needs_user") return null;
  if (!["republish", "delete"].includes(String(job.action))) return null;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  if (pf.needs_user_source === "boutique_etrangere") return null; // déjà dans la bonne file
  const verdict = pf.suppression_verdict && typeof pf.suppression_verdict === "object" ? pf.suppression_verdict : {};
  if (verdict.conclusion !== "boutique_etrangere") return null; // seule une preuve reclasse
  const article = String(pf.vinted_account_id ?? "").trim();
  if (!article) return null;
  const session = String(verdict.session ?? "").trim();
  if (session && session === article) return null; // contradiction : on ne touche pas
  const login = logins?.get?.(article) ?? null;
  const p = { ...pf };
  p.needs_user_source = "boutique_etrangere";
  p.boutique_etrangere = {
    motif: "boutique_etrangere", article, login_article: login,
    session: session || null, le: maintenant, pose_par: POSE_PAR_ORIGINE_PROUVEE,
  };
  return { platform_fields: p, error: messageAttenteBoutique(login, job.action) };
}

return { POSE_PAR_ORIGINE_PROUVEE, POSE_PAR_PAGE_EXACTE, POSE_PAR_PUBLICATION_BOUTIQUE, POSE_PAR_IDENTITE_PROUVEE, attenteBoutiqueLevable, messageAttenteBoutique, reclasserAutreBoutique };
})();

// ── supabase/functions/_shared/etat-job.js ──────────────────────────────────────────────────
__M.etatJob = (() => {
// ═══════════════════════════════════════════════════════════════════════════
// L'ÉTAT D'UN JOB, UNE SEULE FOIS, POUR TOUS LES ÉCRANS (16/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Avant : l'app (file, barres, pastilles, modales, suivi de publication, lot),
// l'extension (popup) et le serveur (messages) décidaient chacun, à leur façon,
// ce qu'un job « est » — cinq calculs de la nature d'un needs_user, cinq mots
// pour un pending (« En attente », « En file », « Dans la file… », « En
// attente de son tour », « En file d'attente »), et des heures promises qui ne
// se tenaient pas. Nico, 15/10 : « ça fait fuir ».
//
// DEPUIS : CE module tranche, et les écrans ne font qu'afficher. SIX mots,
// les mêmes partout (app, extension, mails) :
//   · En file         — ça partira tout seul, à son tour ;
//   · En cours        — l'ordinateur ou nos serveurs y travaillent maintenant
//                       (une annonce retirée et pas encore remise en ligne aussi) ;
//   · Fait            — publiée, republiée, retirée ;
//   · À toi de jouer  — une question, une connexion, une autorisation, ou une
//                       publication qui n'est pas partie et attend ta relance ;
//   · En pause        — retenu pour une raison dite en une ligne : limite du
//                       jour, créneau, boutique à ouvrir, relevé attendu, plateforme
//                       en pause chez nous, nouvel essai automatique, ordinateur
//                       éteint, mise à jour de l'extension… Ça repart seul ;
//   · Arrêtée         — annulée (à ta demande, vendue, doublon) : rien à faire.
// ⛔ AUCUNE HEURE, AUCUNE DURÉE, AUCUN COMPTE À REBOURS : ni ici, ni dans un
//    texte qu'un écran affiche. `sansEstimation` nettoie ce qui en porte encore.
// Chaque statut technique (status × needs_user_source × platform_fields) va
// vers UN seul état ; `motif` dit pourquoi, pour que l'écran choisisse sa phrase.
// L'extension embarque une copie BUNDLÉE de ce module
// (chrome-extension/etat-job.js, générée par scripts/gen-etat-job-extension.mjs,
// vérifiée par selftest:etat-job) : jamais une recopie à la main.
// Preuve : scripts/etat-job-selftest.mjs.
const { attenteBoutiqueLevable } = __M.attenteAutreBoutique;
const { retenueServeurDuJob, RETENUE_BOUTIQUE_INCONNUE } = __M.retenueServeur;
const { estArretUtilisateur, estGeleLivres } = __M.publicationState;
const ETATS = Object.freeze({
  EN_FILE: "en_file",
  EN_COURS: "en_cours",
  FAIT: "fait",
  A_TOI: "a_toi",
  EN_PAUSE: "en_pause",
  ARRETEE: "arretee",
});

// Les mots, et rien d'autre. Un écran qui a besoin d'un mot d'état le prend ICI.
const LIBELLES = Object.freeze({
  fr: Object.freeze({ en_file: "En file", en_cours: "En cours", fait: "Fait", a_toi: "À toi de jouer", en_pause: "En pause", arretee: "Arrêtée" }),
  en: Object.freeze({ en_file: "Queued", en_cours: "In progress", fait: "Done", a_toi: "Your move", en_pause: "Paused", arretee: "Stopped" }),
});
function libelleEtat(etat, lang = "fr") {
  const t = LIBELLES[lang === "en" ? "en" : "fr"];
  return t[etat] ?? t.en_file;
}

// Le ton d'un état (la règle des couleurs de l'app) : ok (teal) · regler (ambre)
// · echec (rouge, réservé à une publication qui n'est PAS partie) · neutre (gris).
function tonEtat(etat, motif = null) {
  if (etat === ETATS.FAIT) return "ok";
  if (etat === ETATS.A_TOI) return motif === "pas_partie" ? "echec" : "regler";
  return "neutre";
}

// Statuts qui ne bougeront plus.
const STATUTS_FINIS = Object.freeze(["published", "sold", "failed", "cancelled", "dry_run_completed", "deleted"]);

// Un needs_user n'est « à toi de jouer » que s'il attend la PERSONNE. Ces
// sources-là repartent seules (handler-watch, relevé, serveur) ou ne demandent
// rien : elles sont « en pause », avec leur raison.
const SOURCES_AUTOMATIQUES = Object.freeze({
  introuvable_a_confirmer: "releve",
  ebay_site_etranger: "ebay_etranger",
  plateforme_ecartee: "ecartee",
  build_min_requis: "mise_a_jour",
  // (26/10 nuit, point 5) Leboncoin a refusé le texte à la modération : FillSell adapte la copie Leboncoin.
  lbc_moderation: "lbc_moderation",
});

// Les motifs TECHNIQUES d'une republication mise en pause avant tout retrait :
// la reprise sur preuve de handler-watch les relance seule — même liste
// qu'au serveur (handler-watch, reprise sur preuve).
// (18/10, lot 3) LA SIGNATURE UNIQUE D'UNE COUPURE TECHNIQUE (canal, onglet,
// réseau) : rien n'a bougé chez la plateforme. Une seule source pour le serveur
// (pas-de-rouge.js la réexporte, handler-watch l'importe) et l'écran.
const CANAL_RE =
  /Could not establish connection|Receiving end does not exist|The message port closed|message channel closed|A listener indicated an asynchronous response|No tab with id|Onglet de travail ferm|onglet navigué\/rechargé|pas de réponse du content script|le content script ne répond pas|sonde injoignable|onglet de travail Vinted\s*:|Timeout\s*:|Failed to fetch|NetworkError|Load failed|ERR_[A-Z_]+|L'opération n'a pas pu aboutir sur ton ordinateur|mise en veille par Chrome/i;
const MOTIF_TECHNIQUE_RE = /protection anti-?robot|v[ée]rification anti-?robot|bot_shield|DataDome|Connexion (Vinted|Leboncoin|Beebs|eBay|Depop|Opla) requise|configuration non capt[ée]e|lecture de l'annonce (re|a [ée]t[ée] )?(fus[ée]e|bloqu[ée]e)|bloqu[ée] notre lecture/i;
/** (18/10, lot 3) Un texte (message affiché OU brut de l'extension) qui ne dit qu'une coupure ou un mur technique. */
function texteTechnique(texte) {
  const t = String(texte ?? "");
  if (!t) return false;
  const reste = t.replace(MOTIF_TECHNIQUE_RE, "").replace(CANAL_RE, "");
  return (MOTIF_TECHNIQUE_RE.test(t) || CANAL_RE.test(t)) && !MOTIF_PERSONNE_RE.test(reste);
}
/** Le brut technique d'un job (platform_fields.error_technique), s'il y en a un. */
const brutTechnique = (pf) => {
  const et = pf?.error_technique;
  return typeof et === "string" ? et : String(et?.brut ?? "");
};
const MOTIF_PERSONNE_RE = /champ|Marque|taille|rayon|cat[ée]gorie|interdit|payant|Boostez|option gratuite|nom et (ton )?pr[ée]nom|configuration de vendeur|exige|passe la v[ée]rification|connecte-toi/i;

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const pfDe = (j) => objet(j?.platform_fields);
const etapeRepublication = (j) => {
  const s = pfDe(j).republish_step;
  return ["a_capturer", "captured", "deleted", "recreated"].includes(s) ? s : "a_capturer";
};
const parNosServeurs = (j) => j?.voie === "api";

// « En attente de ta connexion à … » : le job bute sur une session fermée.
const attendConnexion = (j) => j?.status === "pending"
  && Boolean(pfDe(j).attente_session)
  && /^En attente de ta connexion à /i.test(String(j?.error ?? ""));

/** Une attente AUTOMATIQUE d'un needs_user (en pause), ou null (à toi de jouer). */
function attenteAutomatique(j) {
  if (j?.status !== "needs_user") return null;
  const pf = pfDe(j);
  const src = String(pf.needs_user_source ?? "");
  if (SOURCES_AUTOMATIQUES[src]) return SOURCES_AUTOMATIQUES[src];
  if (src === "boutique_etrangere" && attenteBoutiqueLevable(pf.boutique_etrangere)) return "boutique";
  if (j.action === "republish" && ["", "a_capturer", "captured"].includes(String(pf.republish_step ?? ""))
      && !pf.deleted_at && (src === "relancer" || src === "")) {
    if (pf.republish_etat_indetermine && typeof pf.republish_etat_indetermine === "object") return "technique";
    // (18/10, lot 3) Le message affiché OU le brut de l'extension : une coupure
    // (onglet qui ne répond pas, réseau) repart seule, comme un mur technique.
    if (texteTechnique(j.error) || texteTechnique(brutTechnique(pf))) return "technique";
  }
  return null;
}

// Inconnue ≠ absente : on ne dit « ordinateur éteint » que sur une absence CONSTATÉE.
const extensionFraiche = (ext) => !ext || !["eteinte", "inactive", "session_expiree"].includes(ext.etat);

// ── La boutique Vinted d'un job (multi-boutiques) ───────────────────────────
// ctx.boutiques = { connectee: {userId, login, fraiche}|null, liste: [{user_id, login}],
// origines: Map(inventaire_id → vinted_account_id) }.
const origineDe = (j, b) => {
  const o = b?.origines instanceof Map ? b.origines.get(String(j?.inventaire_id)) : b?.origines?.[String(j?.inventaire_id)];
  return o == null ? "" : String(o).trim();
};
const loginDe = (id, b) => {
  const x = (b?.liste ?? []).find((y) => String(y?.user_id ?? "") === String(id));
  return x?.login ? String(x.login) : null;
};
/** La boutique qu'attend un job retenu par la garde du serveur, sinon null. */
function boutiqueAttendue(j, b) {
  if (!b?.connectee?.userId || b.connectee.fraiche === false) return null;
  if (j?.platform !== "vinted" || !["republish", "delete"].includes(j?.action) || j?.inventaire_id == null) return null;
  const o = origineDe(j, b);
  if (!o || o === String(b.connectee.userId).trim()) return null;
  return { userId: o, login: loginDe(o, b) };
}
/** La boutique d'un job Vinted, pour l'étiquette « @login » — à partir de deux boutiques. */
function boutiqueDuJob(j, b) {
  if (j?.platform !== "vinted" || (b?.liste?.length ?? 0) < 2) return null;
  const o = origineDe(j, b) || String(pfDe(j).vinted_account_id ?? "").trim();
  const login = o ? loginDe(o, b) : null;
  return login ? { userId: o, login } : null;
}

/** Un job qui ne bougera plus (fini, arrêté). */
function jobFini(j) {
  if (!j) return true;
  if (STATUTS_FINIS.includes(j.status)) return true;
  if (j.action === "republish" && etapeRepublication(j) === "recreated") return true;
  if (estArretUtilisateur(j)) return true;
  return !["pending", "processing", "needs_user"].includes(j.status);
}

/**
 * L'état d'UN job, et son motif.
 * ctx (tout optionnel) = { maintenant, extension: {etat}|null, plateformesEnPause: Set,
 *   plafond: {retenue, motif}|null, creneaux: {pf: {actif, dans_creneau}}|null,
 *   oplaAAutoriser: bool, boutiques, extensionAMettreAJour: bool }
 * → { etat, motif, detail? }   detail : { login } (boutique), { boutiques } (à ouvrir), { champ }
 */
function etatJob(j, ctx = {}) {
  if (!j) return { etat: ETATS.ARRETEE, motif: "arretee" };
  const pf = pfDe(j);
  const etape = j.action === "republish" ? etapeRepublication(j) : null;
  const st = j.status;

  // ── Finis ──
  if (st === "cancelled" || estArretUtilisateur(j)) return { etat: ETATS.ARRETEE, motif: "arretee" };
  if (st === "failed") return { etat: ETATS.A_TOI, motif: "pas_partie" };
  if (j.action === "delete" && st === "deleted") return { etat: ETATS.FAIT, motif: "retiree" };
  if (st === "published" || st === "sold" || st === "dry_run_completed" || st === "deleted") return { etat: ETATS.FAIT, motif: st === "sold" ? "vendue" : "publiee" };
  if (j.action === "republish" && etape === "recreated") return { etat: ETATS.FAIT, motif: "republiee" };

  // ── needs_user : à toi de jouer, sauf attente automatique ──
  if (st === "needs_user") {
    const auto = attenteAutomatique(j);
    if (auto === "boutique") {
      const g = objet(pf.boutique_etrangere);
      return { etat: ETATS.EN_PAUSE, motif: "boutique", detail: { login: g.login_article ? String(g.login_article) : loginDe(g.article, ctx.boutiques) } };
    }
    if (auto) return { etat: ETATS.EN_PAUSE, motif: auto };
    const src = String(pf.needs_user_source ?? "");
    if (src === "opla_acces") return { etat: ETATS.A_TOI, motif: "opla" };
    if (src === "depop_acces") return { etat: ETATS.A_TOI, motif: "depop" };
    if (src === "connexion" || src === "session_vinted" || src === "ebay_connexion_requise" || src === "ebay_compte_chrome" || src === "verification_antirobot") return { etat: ETATS.A_TOI, motif: "connexion" };
    // (29/10, lot B 4.6) Refus Beebs prouvé relancé à l'identique (get-pending-jobs) : la personne change le texte, les
    // photos ou le rayon — à toi de jouer, jamais « en pause » ni un nouvel essai automatique.
    if (src === "refus_beebs_meme_contenu") return { etat: ETATS.A_TOI, motif: "geste" };
    return { etat: ETATS.A_TOI, motif: "geste" };
  }
  if (attendConnexion(j)) return { etat: ETATS.A_TOI, motif: "connexion" };
  if (st === "pending" && j.platform === "opla" && ctx.oplaAAutoriser) return { etat: ETATS.A_TOI, motif: "opla" };

  // (03/10, point 16) Retenu par la garde de boutique du SERVEUR, à toute
  // étape (une remise en ligne se fait sur la boutique d'origine) : c'est la
  // boutique qui manque — on dit laquelle ouvrir.
  if (st === "pending") {
    const attendue = boutiqueAttendue(j, ctx.boutiques);
    if (attendue) return { etat: ETATS.EN_PAUSE, motif: "boutique", detail: { login: attendue.login } };
  }

  // ── Hors ligne entre retrait et remise en ligne : en cours, toujours ──
  if (etape === "deleted") return { etat: ETATS.EN_COURS, motif: "remise_en_ligne" };
  if (st === "processing") return { etat: ETATS.EN_COURS, motif: parNosServeurs(j) ? "serveurs" : "ordinateur" };

  // ── pending : ce qui le RETIENT, sinon la file ──
  if (st === "pending") {
    // (22/10 soir, point 6) La file mise en pause par la personne : publications et republications pas encore
    // commencées attendent la reprise (un retrait n'est jamais en pause ; une republication retirée est plus haut).
    if (ctx.filePause && (j.action === "publish" || j.action === "republish")
        && !(pf.deleted_at || pf.republish_suppression_envoyee)) return { etat: ETATS.EN_PAUSE, motif: "file_en_pause" };
    // (26/10, D4) Une publication PROGRAMMÉE pas encore servie attend son créneau (réglage de la personne, « une à la
    // fois », plafond du jour) — jamais une heure. Réglage éteint (ctx.programmation faux) : elle part à son tour.
    if (j.action === "publish" && pf.programmee === true && !pf.programmee_servie_le && ctx.programmation) {
      return { etat: ETATS.EN_PAUSE, motif: "programmee" };
    }
    // (22/10 soir, point 8) Fiche importée : la publication attend la lecture de l'annonce d'origine (texte, photos,
    // état du vendeur) — elle avance, ce n'est jamais une erreur.
    if (pf.attente_lecture_origine && typeof pf.attente_lecture_origine === "object") {
      return { etat: ETATS.EN_FILE, motif: "lecture_origine", detail: { plateforme: String(pf.attente_lecture_origine.plateforme ?? "") } };
    }
    if (ctx.extensionAMettreAJour && !parNosServeurs(j)) return { etat: ETATS.EN_PAUSE, motif: "mise_a_jour" };
    if (estGeleLivres(j)) return { etat: ETATS.EN_PAUSE, motif: "gel" };
    const retenue = retenueServeurDuJob(j);
    if (retenue?.motif === RETENUE_BOUTIQUE_INCONNUE) return { etat: ETATS.EN_PAUSE, motif: "boutiques_a_ouvrir", detail: { boutiques: retenue.boutiques ?? [] } };
    if (retenue) return { etat: ETATS.EN_PAUSE, motif: "retenue_serveur" };
    // (17/10) Republication dont la marque de l'annonce ne partira que par son
    // identifiant, envoi direct pas encore prouvé (pause_marque_par_id, posé
    // par l'extension AVANT tout retrait) : annonce intacte, ça repart seul —
    // jamais « à toi de jouer », jamais une durée.
    if (j.action === "republish" && etape !== "deleted" && pf.pause_marque_par_id && typeof pf.pause_marque_par_id === "object") {
      return { etat: ETATS.EN_PAUSE, motif: "retenue_serveur" };
    }
    const boutique = objet(pf.attente_boutique);
    if (boutique.login || pf.attente_boutique === true) return { etat: ETATS.EN_PAUSE, motif: "boutique", detail: { login: boutique.login ?? null } };
    if (j.action === "republish") {
      const pl = ctx.plafond;
      if (pl?.retenue) return { etat: ETATS.EN_PAUSE, motif: pl.motif === "pause" ? "rythme" : "limite_jour" };
      const cr = pf.republish_source === "auto" ? ctx.creneaux?.[j.platform] : null;
      if (cr && cr.actif === false) return { etat: ETATS.EN_PAUSE, motif: "auto_en_pause" };
      if (cr && cr.dans_creneau === false) return { etat: ETATS.EN_PAUSE, motif: "creneau" };
    }
    if (ctx.plateformesEnPause?.has?.(j.platform)) return { etat: ETATS.EN_PAUSE, motif: "plateforme" };
    const naa = Date.parse(pf.next_action_after ?? "");
    const maintenant = ctx.maintenant ?? Date.now();
    if ((Number.isFinite(naa) && naa > maintenant) || (j.error && String(j.error).trim())) return { etat: ETATS.EN_PAUSE, motif: "essai" };
    if (parNosServeurs(j)) return { etat: ETATS.EN_FILE, motif: "serveurs" };
    if (!extensionFraiche(ctx.extension)) {
      return { etat: ETATS.EN_PAUSE, motif: ctx.extension?.etat === "session_expiree" ? "ordinateur_session" : "ordinateur" };
    }
    return { etat: ETATS.EN_FILE, motif: "tour" };
  }
  return { etat: ETATS.ARRETEE, motif: "arretee" };
}

// ── AUCUNE ESTIMATION DE TEMPS (15/10 soir, Nico) ─────────────────────────
// Les textes du serveur et de l'extension ont longtemps promis une heure ou
// une durée (« Reprise automatique dans ~6 min », « vers 17:36 », « toutes
// les heures », « 2 min au plus ») : la phrase qui en porte une est retirée
// avant tout affichage — l'état reste.
const ESTIMATION_RE = /\b(dans|d'ici|sous|en|avant|après) (environ |à peu près |moins d'|moins de |un |une |deux |trois |quelques |plusieurs |~\s*)?\d*\s*(-\s*\d+\s*)?(s|sec|secondes?|min|minutes?|h|heures?|quarts? d'heure|demi-heure|jours?)\b|~\s*\d|\bvers \d{1,2}\s*[:h]\s*\d{2}|\b(in|within|around|after) (about )?~?\d+\s*(s|sec|seconds?|min|minutes?|h|hours?|days?)\b|\bà \d{1,2}[:h]\d{2}\b|\bat \d{1,2}:\d{2}\b|\btoutes les (heures|\d+ (minutes|min|heures|h))\b|\bevery (hour|\d+ (minutes|min|hours))\b|\bprochain(e)? (essai|passage|tentative|recr[ée]ation) (vers|dans|à|le) \S+/i;
function sansEstimation(texte) {
  const t = String(texte ?? "").trim();
  if (!t || !ESTIMATION_RE.test(t)) return t;
  const phrases = t.split(/(?<=[.!?…])\s+/);
  const gardees = phrases.filter((p) => !ESTIMATION_RE.test(p));
  if (gardees.length) return gardees.join(" ");
  // Une seule phrase : on la coupe avant l'estimation — et avant le mot qui
  // l'annonçait (« dans », « vers »…), pour ne pas laisser une phrase en l'air.
  const m = t.match(ESTIMATION_RE);
  const avant = t.slice(0, m.index).replace(/[\s,:;(—–-]+$/, "").replace(/\s+(dans|d'ici|vers|sous|en|avant|après|depuis|in|within|at|after)$/i, "").trim();
  return avant ? avant + "." : "";
}
const porteUneEstimation = (texte) => ESTIMATION_RE.test(String(texte ?? ""));

return { ETATS, LIBELLES, libelleEtat, tonEtat, STATUTS_FINIS, SOURCES_AUTOMATIQUES, CANAL_RE, MOTIF_TECHNIQUE_RE, texteTechnique, brutTechnique, MOTIF_PERSONNE_RE, etapeRepublication, parNosServeurs, attendConnexion, attenteAutomatique, loginDe, boutiqueAttendue, boutiqueDuJob, jobFini, etatJob, sansEstimation, porteUneEstimation };
})();
globalThis.FILLSELL_ETAT_JOB = __M.etatJob;
})();
