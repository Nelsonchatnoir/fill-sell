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
//   · rien d'inventé : catégorie et champs viennent du job, PUIS de
//     inventaire.attributs (lot 1, 07/09 : sync liste, détail Vinted, capture,
//     Lens, saisie — fusionnés par priorité en base ; un champ non vide du job
//     gagne toujours, attributs comble les vides), PUIS de l'IA texte sous
//     contrainte ; conditions et aspects d'eBay (Metadata/Taxonomy) ou du
//     cache ebay_item_aspects ;
//   · lot 2 (07/09) : couleur / matière / taille encore vides après le job
//     et attributs → Lens en mode IDENTIFY (jamais full) sur les photos du
//     job, UNE fois par article à vie (marqueur attributs.lens_scan posé
//     AVANT l'appel), sans Pépite ni quota utilisateur ; un échec de Lens ne
//     fait jamais échouer la publication.
// ═══════════════════════════════════════════════════════════════════════════
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { appelEbay, lireEnvEbay, obtenirAccessToken, type EbayEnv } from "../_shared/ebay-oauth.ts";
import { rapatrierPhotosPublication } from "../_shared/photos-rapatriement.ts";
import { obtenirJetonApplicatif } from "../_shared/ebay-app-token.ts";
import { orchestrateSale } from "../_shared/sale-orchestration.ts";
import { hotes } from "../_shared/ebay-oauth.ts";
import { estSupportNonLivre } from "../_shared/support-non-livre.ts";
import { titrePourJob, titreVide, CLE_TITRE_SAISI } from "../_shared/titre-du-job.js";
import { cheminsRefusesParLApp, cleChemin, mappingRefuseParLApp, suggestionsSansRefus } from "../_shared/rayon-refuse-ebay.ts";
import { archiverErreur } from "../_shared/erreurs-archivees.js";
import { tailleDansGrille } from "../_shared/tailles.js";
import { compteEbayApiUsable, MESSAGE_EBAY_COMPTE_A_FINIR, SOURCE_EBAY_COMPTE_A_FINIR } from "../_shared/ebay-voie.ts";
import { messageSiteEtranger, siteDuCompteEbay, siteEbayEtranger, SOURCE_EBAY_SITE_ETRANGER } from "../_shared/ebay-site.ts";
import { idAnnonceEbay, preuveIntentionRetraitRepublicationEbayMemorisee, preuveRetraitRepublicationEbayMemorisee, verifierOffreRetraitEbay, verifierSourceRetraitEbay, type SourceRetraitEbay } from "../_shared/ebay-retrait-identite.ts";
// Module PUR (aucun import, aucune API navigateur) : le rétro-test doit
// appliquer EXACTEMENT la règle mot-objet de l'app, pas une approximation.
import { detectObjectIconKeyword } from "../../../src/utils/shared.js";
import { CLES_QUESTION_PLUS_EN_LIGNE, drapeauAvantLaFin, lireQuantiteEbay as lireQuantiteEbayPur, verdictAnnonceEbay } from "../_shared/ebay-etat-annonce.js";
import {
  aspectsCategorie, choisirCondition, conditionsCategorie, descripteursCondition, descriptionEbay, emplacementMarchand, enrichirDepuisAttributs, marquerAspectFerme,
  lireErreurEbay, lireRefus25129, motifReelEbay, MARKETPLACE, remplirAspects, skuPour, suggererCategories, titreEbay, urlAnnonce, urlsPhotos,
  type AttributsInventaire, type ErreurEbay, type PlatformFields,
} from "../_shared/ebay-publication.ts";

const HANDLER_BUILD = "ebay-api-worker 3-lens";
const LOT_MAX = 10;
// Budget d'une passe (lot 2) : un scan Lens identify = 7-9 s dans l'isolat
// (p50 7,1 s / p90 8,6 s mesurés sur 30 jours) ; au-delà de
// SCANS_MAX_PAR_PASSE scans ou de PASSE_MAX_MS, la passe rend la main et le
// tick suivant (2 min) reprend les jobs restés pending.
const SCANS_MAX_PAR_PASSE = 3;
const PASSE_MAX_MS = 100_000;
// Rayon refusé par l'app et IA en panne (25/09) : 5 ticks (≈ 10 min)
// d'attente, puis la question.
const ATTENTES_RAYON_REFUSE_MAX = 5;
const LENS_TIMEOUT_MS = 45_000;
interface Passe { scans: number; debut: number }
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

// ══ UNE PUBLICATION D'UN COMPTE RELIÉ PAR L'API REPART PAR L'API (2026-09-27) ══
// philippaa (reliée le 18/09 à 09:49, 2 jobs du 18/09 17:37) et pironneau
// (relié le 23/09, job du 25/09) : relié mais pas prêt → le trigger d'avant
// laissait 'extension', et l'extension butait sur le mur REAUTH eBay. Le
// trigger est corrigé pour les jobs neufs ; ICI, les publications déjà créées
// en voie extension pour un compte relié (ebay_voie_api + connexion non
// révoquée) passent en voie 'api' — pending si le compte est prêt (le worker
// les prend), sinon needs_user « compte à finir », ré-armé tout seul ensuite.
// ⛔ PENDING SEULEMENT, écriture conditionnée (status pending ET voie
//    extension) : un job en cours chez l'extension n'est jamais touché, et
//    get-pending-jobs v140 ne les sert plus à Chrome. Bornée, idempotente.
async function rerouterPublicationsVersApi(admin: SupabaseClient): Promise<Record<string, unknown>> {
  const { data: comptes } = await admin.from("ebay_accounts").select("user_id").is("revoked_at", null).limit(1000);
  const relies = ((comptes ?? []) as Array<{ user_id: string }>).map((c) => c.user_id);
  if (!relies.length) return { vues: 0 };
  const { data: drapeaux } = await admin.from("profiles").select("id").eq("ebay_voie_api", true).in("id", relies);
  const ids = ((drapeaux ?? []) as Array<{ id: string }>).map((p) => p.id);
  if (!ids.length) return { vues: 0 };
  const { data: jobs } = await admin.from("cross_post_jobs")
    .select("id, user_id, error, platform_fields")
    .eq("platform", "ebay").eq("action", "publish").eq("voie", "extension").eq("status", "pending")
    .in("user_id", ids).limit(50);
  let versApi = 0, parquees = 0;
  const pretParCompte = new Map<string, boolean>();
  for (const j of (jobs ?? []) as Array<{ id: string; user_id: string; error: string | null; platform_fields: Record<string, unknown> | null }>) {
    if (!pretParCompte.has(j.user_id)) pretParCompte.set(j.user_id, await compteEbayApiUsable(admin, j.user_id));
    const pret = pretParCompte.get(j.user_id) === true;
    const pf: Record<string, unknown> = { ...(j.platform_fields ?? {}) };
    for (const k of ["needs_user_source", "next_action_after", "needsUserAttempts", "needsUserBoucle", "needs_user_tick_le",
      "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur", "processing_since", "pas_de_rouge", "pas_de_rouge_reprises"]) delete pf[k];
    if (j.error) pf.erreurs_archivees = archiverErreur(pf.erreurs_archivees, j.error, "pending", "ebay-api-worker (voie extension → api, compte relié)");
    pf.voie_reroutee = { le: new Date().toISOString(), de: "extension", vers: "api", compte_pret: pret };
    if (!pret) pf.needs_user_source = SOURCE_EBAY_COMPTE_A_FINIR;
    const { data: maj } = await admin.from("cross_post_jobs")
      .update(pret
        ? { voie: "api", error: null, platform_fields: pf }
        : { voie: "api", status: "needs_user", error: MESSAGE_EBAY_COMPTE_A_FINIR, platform_fields: pf })
      .eq("id", j.id).eq("status", "pending").eq("voie", "extension").select("id");
    if (maj?.length) { if (pret) versApi++; else parquees++; }
  }
  if (versApi || parquees) console.log(`[ebay-api-worker] voie extension → api : ${versApi} publication(s) reprise(s) par l'API, ${parquees} parquée(s) « compte à finir »`);
  return { vues: (jobs ?? []).length, vers_api: versApi, parquees };
}

async function marquer(admin: SupabaseClient, job: Job, patch: Record<string, unknown>, diagnostic: Record<string, unknown>, ebayApi?: Record<string, unknown>) {
  const pf = { ...(job.platform_fields ?? {}) };
  if (patch.status && patch.status !== "processing") delete pf.processing_since;
  if (patch.status === "published") delete pf.needsUserField;
  pf.last_diagnostic = { voie: "api", at: new Date().toISOString(), ...diagnostic };
  if (ebayApi) pf.ebay_api = { ...((pf.ebay_api as Record<string, unknown>) ?? {}), ...ebayApi };
  const { error } = await admin.from("cross_post_jobs").update({ ...patch, platform_fields: pf, handler_build: HANDLER_BUILD }).eq("id", job.id);
  if (error) console.error(`[ebay-api-worker] job ${job.id} : écriture refusée — ${error.message}`);
}

// ── LE MESSAGE D'UN REFUS eBAY (2026-09-10, costume Hugo Boss de Victor) ────
// eBay sert un `longMessage` PARAPLUIE qui accuse l'utilisateur (« le titre ou
// la description contient des mots inappropriés ou le vendeur enfreint le
// règlement ») alors que le vrai motif est dans `parameters` — sur ce refus,
// KYC_DSAReq_EUB2C_SYI : la vérification d'identité vendeur, qui n'a RIEN à
// voir avec l'article. On ne relaie donc plus le parapluie dès qu'eBay joint
// un motif (cf. motifReelEbay, _shared/ebay-publication.ts).
// Le texte générique n'est pas perdu : il reste dans last_diagnostic.message,
// avec le code du motif — c'est la base qui garde la trace, pas l'utilisateur
// qui encaisse l'accusation.
function messageRefus(quoi: string, http: number, e: ErreurEbay) {
  const motif = motifReelEbay(e);
  if (motif) return { error: motif.message, motif };
  return {
    error: `eBay a refusé ${quoi} (${http}${e.errorId ? `, ${e.errorId}` : ""}) : ${e.message}${e.parametres ? ` [${e.parametres}]` : ""}`,
    motif: null,
  };
}
/** Ce que le refus ajoute au diagnostic : le motif nommé, le texte générique
 *  d'eBay qu'on a cessé d'afficher, et le CORPS BRUT de sa réponse.
 *  Le brut est là depuis le 10/09 parce qu'on a cherché en vain, sur le refus
 *  KYC de Victor, si eBay joignait un lien vers la page de vérification :
 *  `lireErreurEbay` ne gardait que `errors[0]`, tout le reste était jeté sans
 *  trace. À la prochaine occurrence, la question se tranchera en une requête.
 *  ⛔ Ce champ ne s'affiche JAMAIS : il vit dans last_diagnostic, pas à l'écran
 *  (règle du 02/09 — aucun diagnostic sous les yeux de l'utilisateur). */
function diagRefus(e: ErreurEbay, motif: ReturnType<typeof messageRefus>["motif"]) {
  return {
    ...(motif ? { motif_ebay: motif.code, motif_nomme: motif.nomme, message_ebay_generique: e.message } : {}),
    ...(e.brut ? { brut: e.brut } : {}),
  };
}

// 4xx eBay = faute de contenu ou de compte → needs_user (le message dit quoi) ;
// 5xx / réseau = transitoire → pending, 3 tentatives puis failed.
function verdictHttp(http: number, tentatives: number): "needs_user" | "pending" | "failed" {
  if (http >= 500 || http === 0) return tentatives >= 3 ? "failed" : "pending";
  return "needs_user";
}

async function publier(
  admin: SupabaseClient,
  env: EbayEnv,
  token: string,
  job: Job,
  passe?: Passe,
  { offerIdAttendu = "" }: { offerIdAttendu?: string } = {},
): Promise<Record<string, unknown>> {
  // pfJob = la photographie des choix de l'utilisateur (jamais réécrite par
  // l'enrichissement) ; pf = la copie de travail, comblée depuis
  // inventaire.attributs puis, au besoin, par le scan Lens.
  const pfJob = (job.platform_fields ?? {}) as PlatformFields;
  const tentatives = Number(((pfJob.ebay_api as Record<string, unknown>) ?? {}).tentatives ?? 0) + 1;
  const photos = urlsPhotos(job.photos);
  const prix = Number(job.price);
  // Sans photo, rien ne part — arrêté ICI, avant tout appel eBay, cause nommée.
  if (!photos.length) { await marquer(admin, job, { status: "needs_user", error: "Cet article n'a aucune photo : eBay exige au moins une image. Ajoute une photo à l'article, puis relance la publication." }, { etape: "controle", quoi: "photos_absentes" }); return { job: job.id, issue: "needs_user", motif: "photos_absentes" }; }
  if (!(prix > 0)) { await marquer(admin, job, { status: "needs_user", error: "Prix absent ou nul." }, { etape: "controle", quoi: "prix_absent" }); return { job: job.id, issue: "needs_user", motif: "prix_absent" }; }
  if (!job.inventaire_id) { await marquer(admin, job, { status: "failed", error: "Job sans inventaire_id : impossible de former le SKU." }, { etape: "controle", quoi: "inventaire_absent" }); return { job: job.id, issue: "failed", motif: "inventaire_absent" }; }

  // ── Lot 1 (07/09) : l'article en base — titre (catégorie) et attributs. ──
  const inv = await lireInventaire(admin, job.inventaire_id);

  // ── AUCUN DÉPÔT SANS TITRE (2026-09-25, patrick giry) ───────────────────
  // Même règle que get-pending-jobs (_shared/titre-du-job.js) : titre vide →
  // réponse à la question « Titre », sinon titre de la fiche, écrit sur le
  // job ; rien → la question, AVANT tout appel eBay. Un job titré ne passe
  // même pas le test.
  if (titreVide(job.title)) {
    const r = titrePourJob({ platform: "ebay", titreJob: job.title, titreSaisi: pfJob[CLE_TITRE_SAISI], titreFiche: inv.titre });
    if (!r) {
      job.platform_fields = {
        ...(job.platform_fields ?? {}),
        needsUserField: { field_key: "title", field_label: "Titre", target: { root: null, key: CLE_TITRE_SAISI }, platform: "ebay" },
      };
      await marquer(admin, job, { status: "needs_user", error: "Ton annonce eBay n'a pas de titre, et l'article n'en porte pas non plus. Écris-le ci-dessous (bouton « ✋ Compléter ») : la publication repart d'elle-même. Rien n'a été envoyé à eBay." }, { etape: "controle", quoi: "titre_absent" });
      return { job: job.id, issue: "needs_user", motif: "titre_absent" };
    }
    job.title = r.titre;
    const { error: tErr } = await admin.from("cross_post_jobs").update({ title: r.titre }).eq("id", job.id).or("title.is.null,title.eq.");
    console.log(`[ebay-api-worker] job ${job.id} : titre VIDE → « ${r.titre} » (${r.source === "saisi" ? "réponse à la question Titre" : "titre de la fiche"})${tErr ? ` — non écrit sur le job (${tErr.message})` : ""}`);
  }
  let attributs = inv.attributs;
  let enrichi = enrichirDepuisAttributs(pfJob, attributs);
  let pf = enrichi.pf;

  // Filet photos (décision Nico 06/09) : toute URL hors de notre Storage est
  // copiée chez nous AVANT d'appeler eBay (et avant Lens) ; le job garde
  // alors NOS URLs.
  const rap = await rapatrierPhotosPublication(admin, photos, job.user_id, job.inventaire_id);
  if (rap.rapatriees > 0) {
    const nouvellesPhotos = rap.urls.map((u, i) => ({ type: i === 0 ? "original" : `photo_${i}`, url: u }));
    await admin.from("cross_post_jobs").update({ photos: nouvellesPhotos }).eq("id", job.id);
    job.photos = nouvellesPhotos;
  }
  const photosPublication = rap.urls;

  // ── Lot 2 (07/09) : Lens identify côté serveur, UNE fois par article. ────
  const scan = await scannerLensSiNecessaire(admin, job, pf, attributs, photosPublication, inv.titre || job.title || "", passe);
  if (scan.attributs) { attributs = scan.attributs; enrichi = enrichirDepuisAttributs(pfJob, attributs); pf = enrichi.pf; }
  // ── « Un DVD n'est pas un livre » (07/09/2026, lot de 24 DVD d'Ornella,
  // miroir serveur du commit app 9958a8f) : la famille Lens `livres_medias`
  // porte AUSSI les DVD, CD, vinyles et jeux vidéo. Le SUPPORT se lit dans le
  // texte (estSupportNonLivre : supports seulement, jamais un sujet ; désarmé
  // par « livre / roman / manga / tome / BD »). Un média : la famille ne pèse
  // plus sur la catégorie, « Modèle » n'est plus défaulté comme un livre, et
  // l'aspect ISBN n'est jamais réclamé. Décidé ICI, une fois, avant toute
  // règle « livre » — famille effective = null sur un média.
  const supportNonLivre = estSupportNonLivre(inv.titre, job.title, job.description);
  pf.support_non_livre = supportNonLivre;
  const familleEffective = (String(pf.famille ?? "") === "livres_medias" && supportNonLivre) ? null : ((pf.famille as string | null) ?? null);
  const diagAttributs = {
    attributs: { utilises: enrichi.utilises, disponibles: enrichi.disponibles },
    lens: scan.resume,
    ...(String(pf.famille ?? "") === "livres_medias" ? { famille: { lens: "livres_medias", support_non_livre: supportNonLivre, effective: familleEffective } } : {}),
  };

  // L'utilisateur du job voyage avec pf pour que le coût IA de la résolution
  // de catégorie lui soit imputé (usage_logs) — sinon il n'apparaît nulle part.
  (pf as Record<string, unknown>).__userId = job.user_id;
  (pf as Record<string, unknown>).__admin = admin;
  const categorie = await resoudreCategorie(env, token, { title: inv.titre || job.title }, pf, familleEffective);
  delete (pf as Record<string, unknown>).__userId;
  delete (pf as Record<string, unknown>).__admin;
  // ── LE RAYON REFUSÉ, IA EN PANNE : ON ATTEND (2026-09-25) ─────────────────
  // Le rayon que l'app a refusé ne part pas, et une suggestion d'eBay ne se
  // prend pas à l'aveugle : le job repasse au tick suivant (2 min), sans rien
  // demander à personne. Borné : au-delà, la question est posée, avec les
  // suggestions d'eBay — jamais une boucle muette.
  if ("choix" in categorie && categorie.attente) {
    const pfA = { ...((job.platform_fields ?? {}) as Record<string, unknown>) };
    const n = (Number((pfA.rayon_refuse_attente as Record<string, unknown> | undefined)?.n) || 0) + 1;
    if (n <= ATTENTES_RAYON_REFUSE_MAX) {
      job.platform_fields = { ...pfA, rayon_refuse_attente: { n, at: new Date().toISOString() } };
      await marquer(admin, job, { status: "pending", error: null }, { etape: "categorie", quoi: "rayon_refuse_ia_indisponible", tentative: n, motif: categorie.motif, suggestions: categorie.suggestions, ...diagAttributs });
      return { job: job.id, issue: "pending", motif: "rayon_refuse_attente", tentative: n };
    }
  }
  if ("choix" in categorie) {
    const mappee = String(pf.ebayCategoryId ?? "").trim();
    const cheminMappe = Array.isArray(pf.ebayCategoryPath) ? (pf.ebayCategoryPath as string[]) : [];
    // ══ LE DERNIER SEGMENT NE DIT PAS OÙ ON RANGE (2026-09-22) ══════════════
    // Le message écrivait « l'app en "Livres" ». Le chemin complet était
    // « Jouets et jeux > Modélisme ferroviaire > Livres et guides > Livres » :
    // un rayon de livres de MODÉLISME FERROVIAIRE. Lu au dernier segment, le
    // choix de l'app paraissait irréprochable — personne ne pouvait voir
    // l'absurdité, et le Hawking d'ornellaracano est parti là (307191964555).
    // ⛔ LA RACINE NE TOMBE JAMAIS. On sert le chemin entier tant qu'on tient
    //    sous les 300 caractères (au-delà, humanizeJobError remplace tout le
    //    message par « un imprévu technique » et le choix n'est jamais vu) ;
    //    sinon on élide le MILIEU, jamais les deux bouts.
    const chemin = (c: string[]) => c.map((s) => String(s ?? "").trim()).filter(Boolean);
    const complet = (c: string[]) => chemin(c).join(" › ");
    const abrege = (c: string[]) => {
      const p = chemin(c);
      return p.length <= 2 ? p.join(" › ") : `${p[0]} › … › ${p[p.length - 1]}`;
    };
    // Dernier recours : la racine seule. Elle suffit encore à dire « ce n'est
    // pas le bon rayon » — c'est la seule chose qu'on refuse de perdre.
    const racine = (c: string[]) => {
      const p = chemin(c);
      return p.length <= 1 ? (p[0] ?? "") : `${p[0]} › …`;
    };
    // ⛔ PAS choix[0] : depuis le 18/09, NOTRE catégorie ouvre la liste. Les
    //    deux messages de tomcarter13700 du 23/09 disaient « eBay range cet
    //    article en « Jouets et jeux › … › Livres », l'app en « Jouets et
    //    jeux › … » » — le même chemin des deux côtés : on présentait notre
    //    propre mapping comme la proposition d'eBay. La proposition d'eBay,
    //    c'est la première entrée qui N'EST PAS notre mapping.
    const top = categorie.choix.find((c) => c.id !== mappee) ?? categorie.choix[0];
    const topChemin = top ? top.chemin.split(" > ") : [];
    // ≤ 300 caractères, sans identifiant ni marqueur technique : au-delà,
    // l'app remplace le message par « un imprévu technique » (humanizeJobError)
    // et le choix n'est jamais vu. Le détail complet est dans last_diagnostic.
    // ── LE MESSAGE (2026-09-10, décision Nico) : quand eBay contredit notre
    // catégorie, on ne défend plus la nôtre par défaut. Le message dit que
    // celle d'eBay est probablement la bonne, et relancer = la prendre
    // (resoudreCategorie, branche « relance après à confirmer »). Un mapping
    // refusé par le contrôle de famille de l'app (sansMapping) n'est jamais
    // présenté comme une option.
    const sansMapping = !mappee || Boolean((categorie as { sansMapping?: boolean }).sansMapping);
    // Chemins entiers d'abord ; on ne retombe sur la forme élidée que si le
    // message dépasse la borne — et la racine survit dans les deux formes.
    const aConfirmer = (ebay: string, app: string) =>
      `Catégorie eBay à confirmer : eBay range cet article en « ${ebay} », l'app en « ${app} », probablement à tort. ` +
      `Relance pour prendre celle d'eBay ; sinon change l'icône ou le genre avant de relancer.`;
    const sansSur = (app: string) =>
      `Aucune catégorie eBay sûre pour cet article : celle de l'app (« ${app} ») est hors du rayon de l'objet, ` +
      `et eBay n'en propose pas de meilleure. Change l'icône ou le genre de l'article, puis relance.`;
    // ⛔ LA CASCADE DESCEND PAR LE CÔTÉ eBAY D'ABORD. C'est le chemin de
    //    L'APP qui doit survivre entier le plus longtemps : c'est lui qui
    //    révèle l'anomalie (« Modélisme ferroviaire »), celui d'eBay n'est
    //    qu'une proposition. Et `premierQuiTient` garantit une sortie bornée
    //    même si les deux chemins sont démesurés.
    const premierQuiTient = (formes: string[]) =>
      formes.find((s) => s.length <= 300) ?? `${formes[formes.length - 1].slice(0, 297)}...`;
    // (25/09) Le rayon refusé, après l'attente bornée : ce n'est pas eBay qui
    // n'a « rien de meilleur », c'est l'IA qui n'a pas répondu.
    const msg = categorie.attente
      ? "Le rayon eBay envisagé pour cet article a été écarté, et on n'a pas pu en choisir un autre (service momentanément indisponible). Relance dans quelques minutes."
      : !sansMapping
      ? premierQuiTient([
          aConfirmer(complet(topChemin), complet(cheminMappe)),
          aConfirmer(abrege(topChemin), complet(cheminMappe)),
          aConfirmer(abrege(topChemin), abrege(cheminMappe)),
          aConfirmer(racine(topChemin), racine(cheminMappe)),
        ])
      : mappee
        ? premierQuiTient([sansSur(complet(cheminMappe)), sansSur(abrege(cheminMappe)), sansSur(racine(cheminMappe))])
        : `Aucune catégorie eBay n'a pu être posée pour cet article. Change l'icône / le genre de l'article depuis la fiche, puis relance.`;
    // ebayCategorieAttente : posé ICI, lu à la relance — relancer sans rien
    // changer = prendre la proposition d'eBay (jamais une boucle automatique).
    job.platform_fields = { ...(job.platform_fields ?? {}), ebayCategorieAttente: { mapping: mappee || null, choix: categorie.choix, at: new Date().toISOString() } };
    const quoi = !sansMapping ? "categorie_a_confirmer" : "categorie_a_choisir";
    await marquer(admin, job, { status: "needs_user", error: msg }, { etape: "categorie", quoi, choix: categorie.choix, motif: categorie.motif, suggestions: categorie.suggestions, ...diagAttributs });
    return { job: job.id, issue: "needs_user", motif: quoi, choix: categorie.choix, detail: categorie.motif };
  }
  const categoryId = categorie.id;
  // `mapping_confirme_par_attributs` (18/09) rejoint les deux autres sources
  // qui RENDENT le mapping de l'app : son chemin est déjà celui du job, le
  // réécrire ne ferait qu'ajouter une écriture sans effet.
  if (categorie.source !== "mapping" && categorie.source !== "mapping_confirme_par_relance"
      && categorie.source !== "mapping_confirme_par_attributs") {
    pf.ebayCategoryPath = categorie.chemin;
    // ⛔ L'IDENTIFIANT AUSSI (2026-09-22). Seul le CHEMIN était réécrit : quand
    //    la résolution retenait une autre catégorie que le mapping, le job
    //    gardait `ebayCategoryId` de l'ancienne. C'est `categorie.id` qui part
    //    dans l'offre (const categoryId ci-dessus, envoyé en `categoryId`), et
    //    le job racontait donc autre chose que ce qui est réellement en ligne
    //    — indétectable ensuite, et c'est par ce champ qu'on inventorie les
    //    annonces mal rangées.
    pf.ebayCategoryId = categorie.id;
    // pf est une copie de travail : le chemin retenu doit aussi atteindre le
    // job (marquer() écrit job.platform_fields).
    job.platform_fields = {
      ...(job.platform_fields ?? {}),
      ebayCategoryPath: categorie.chemin,
      ebayCategoryId: categorie.id,
    };
  }

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
    // Formulation (2026-09-11, audit des messages) : l'état de l'article est
    // bon, c'est la CATÉGORIE qui n'en veut pas (cas 21205, cosmétiques =
    // neuf seulement, pour des taies d'oreiller classées Beauté par nous).
    // Ni numéro de catégorie ni liste brute à l'écran — ils restent dans
    // last_diagnostic. Le geste : relancer, eBay propose sa catégorie
    // (branche « relance après à confirmer »).
    const neufSeulement = (conditions ?? []).length > 0 && (conditions ?? []).every((c) => /^(1000|1500|1750)$/.test(String(c.id ?? "")));
    // ══ ON NE DEMANDE PLUS UN CLIC QU'ON PEUT FAIRE SOI-MÊME (2026-09-22) ══
    // Le message disait : « Relance la publication, eBay proposera sa propre
    // catégorie. » C'est exactement un geste que la personne n'a aucune raison
    // de faire à notre place — la catégorie fautive est la NÔTRE, et la
    // mécanique qui prend celle d'eBay existe déjà (`ebayCategorieAttente`,
    // lu par resoudreCategorie à la relance). On la pose et on relance NOUS.
    // ⛔ UNE SEULE FOIS, et le marqueur le prouve : si la relance échoue à son
    //    tour sur la condition, on s'arrête et on le dit — jamais une boucle
    //    qui reviendrait deux fois par minute contre le même mur.
    const pfCond = (job.platform_fields ?? {}) as Record<string, unknown>;
    const dejaReprise = Boolean(pfCond.condition_relance_auto);
    if (!dejaReprise) {
      job.platform_fields = {
        ...pfCond,
        ebayCategorieAttente: { mapping: null, choix: [], at: new Date().toISOString(), pose_par: "condition_sans_correspondance" },
        condition_relance_auto: { at: new Date().toISOString(), categoryId },
      };
      await marquer(admin, job, {
        status: "pending",
        error: "La catégorie que nous avions choisie sur eBay ne correspond pas à l'état de ton article. " +
          "C'est de notre côté : on reprend la publication avec la catégorie qu'eBay propose lui-même. Rien à faire de ton côté.",
      }, { etape: "condition", quoi: "etat_sans_correspondance_reprise_auto", categoryId, etats_ebay: (conditions ?? []).map((c) => c.libelle) });
      return { job: job.id, issue: "pending", motif: "condition_reprise_auto" };
    }
    await marquer(admin, job, {
      status: "needs_user",
      error: neufSeulement
        ? `La catégorie eBay de cet article n'accepte que des objets neufs, et celle qu'eBay propose ne convient pas non plus. Change l'icône ou le genre de l'article depuis sa fiche, puis relance d'un clic.`
        : `eBay n'accepte pas l'état « ${pf.etat ?? ""} » dans le rayon de cet article, ni dans celui qu'il propose lui-même. Change l'icône ou le genre de l'article depuis sa fiche, puis relance d'un clic.`,
    }, { etape: "condition", quoi: "etat_sans_correspondance", categoryId, etats_ebay: (conditions ?? []).map((c) => c.libelle) });
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
    // needsUserField (Nico, 06/09 soir — bloquant pour un compte issu d'un
    // import Vinted) : EXACTEMENT la convention du parcours formulaire
    // (chrome-extension/content-scripts/ebay.js, background.js markNeedsUser)
    // pour que le mini-éditeur « Valider et relancer » de l'app s'ouvre :
    //   { platform, field_key, field_label, target { root:'ebayAspects', key },
    //     allowed_values?, input_type?, options_completes? }
    // Un champ à la fois (le premier manquant) ; l'app écrit la réponse dans
    // platform_fields.ebayAspects.<aspect> et needsUserResolved, efface
    // needsUserField, remet needsUserAttempts à 0 et repasse le job pending —
    // assemblerAspects relit ebayAspects en PREMIER, la valeur tranchée prime.
    // Liste fermée (SELECTION_ONLY) → allowed_values complètes + options_completes,
    // l'app impose le choix ; texte libre → les suggestions eBay en liste,
    // saisie libre possible. Le message reste ≤ 300 car. (humanizeJobError).
    const premier = manquants[0];
    const catAspect = cat.aspects.find((a) => a.name === premier);
    const ferme = catAspect?.mode === "SELECTION_ONLY";
    const valeurs = (catAspect?.allowedValues ?? []).filter(Boolean).map(String).slice(0, 200);
    const needsUserField: Record<string, unknown> = {
      platform: "ebay",
      field_key: premier,
      field_label: premier,
      target: { root: "ebayAspects", key: premier },
      ...(valeurs.length ? { allowed_values: valeurs } : {}),
      ...(ferme ? { input_type: "selection_only", options_completes: true } : {}),
      source: "ebay_api_worker",
    };
    job.platform_fields = { ...(job.platform_fields ?? {}), needsUserField, needsUserAttempts: (Number((job.platform_fields ?? {}).needsUserAttempts) || 0) + 1 };
    const msg = `eBay exige encore : ${manquants.join(", ")}. Renseigne « ${premier} » depuis la fiche de l'article (bouton « ✋ Compléter »), puis « Valider et relancer » : la publication repart d'elle-même.`;
    await marquer(admin, job, { status: "needs_user", error: msg }, { etape: "aspects", quoi: "aspects_manquants", manquants, champ_propose: premier, ferme, nb_valeurs: valeurs.length, source_catalogue: cat.source, ia: rempli.ia, sources: rempli.sources, ...diagAttributs });
    return { job: job.id, issue: "needs_user", motif: "aspects_manquants", manquants, champ_propose: premier, ferme, nb_valeurs: valeurs.length, ia: rempli.ia };
  }

  // 3 bis. Descripteurs de la condition (24/09, cartes non gradées) : déduits
  // de l'état de l'article sans jamais le flatter, ou demandés — même canal
  // que les aspects (needsUserField → ebayAspects.<nom>), une vraie question.
  const desc = descripteursCondition(pf.etat as string, condition, (pf.ebayAspects ?? {}) as Record<string, unknown>);
  if (desc.manquant) {
    const d = desc.manquant;
    const valeurs = d.valeurs.map((v) => v.nom).filter(Boolean);
    job.platform_fields = {
      ...(job.platform_fields ?? {}),
      needsUserField: {
        platform: "ebay", field_key: d.nom, field_label: d.nom, target: { root: "ebayAspects", key: d.nom },
        ...(valeurs.length ? { allowed_values: valeurs, input_type: "selection_only", options_completes: true } : {}),
        source: "ebay_api_worker",
      },
      needsUserAttempts: (Number((job.platform_fields ?? {}).needsUserAttempts) || 0) + 1,
    };
    const msg = `eBay demande « ${d.nom} » pour publier cet article. Choisis-le depuis la fiche de l'article (bouton « ✋ Compléter »), puis « Valider et relancer » : la publication repart d'elle-même.`;
    await marquer(admin, job, { status: "needs_user", error: msg }, { etape: "condition", quoi: "descripteur_manquant", condition_id: condition.id, descripteur: d.id, valeurs });
    return { job: job.id, issue: "needs_user", motif: "descripteur_condition", descripteur: d.id };
  }

  // 4. createOrReplaceInventoryItem (PUT, idempotent sur le SKU).
  const sku = skuPour(job.inventaire_id);
  const item = {
    condition: condition.enumValue,
    ...(desc.descripteurs.length ? { conditionDescriptors: desc.descripteurs } : {}),
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
    const refusItem = messageRefus("la fiche produit", rItem.http, e);
    await marquer(admin, job, { status: verdictHttp(rItem.http, tentatives), error: refusItem.error },
      { etape: "inventory_item", http: rItem.http, errorId: e.errorId, message: e.message, condition_envoyee: condition.enumValue, condition_id: condition.id, ...diagRefus(e, refusItem.motif) }, { sku, tentatives });
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
    // ── LA POLITIQUE DE LIVRAISON PEUT ÊTRE CHOISIE PAR ARTICLE (2026-09-20,
    //    demande de Louis, compte Business) ────────────────────────────────
    // « Il faudrait pouvoir choisir différents modèles de transport en
    //  fonction des articles et si l'on veut ou non envoyer à l'étranger. »
    // C'est exactement ce que sont les business policies d'eBay : un compte
    // peut en avoir plusieurs, et CHAQUE offre en porte une. On appliquait
    // celle du COMPTE à toutes les annonces ; l'app laisse désormais en
    // choisir une par article (platform_fields.ebayFulfillmentPolicyId,
    // alimenté par la liste réelle du vendeur — ebay-account).
    // ⛔ REPLI SUR LE COMPTE : sans choix, rien ne change pour personne.
    // ⛔ L'INTERNATIONAL EST UNE PROPRIÉTÉ DE LA POLITIQUE, pas de l'annonce :
    //    le vendeur crée (ou modifie chez eBay) une politique avec des
    //    services internationaux, et nous la conservons telle quelle —
    //    shipToLocations et les quatre booléens sont REPRIS à l'identique par
    //    ebay-account, on n'efface jamais sa configuration.
    listingPolicies: {
      fulfillmentPolicyId: String((job.platform_fields as Record<string, unknown> | null)?.ebayFulfillmentPolicyId ?? "").trim()
        || compte.fulfillment_policy_id,
      paymentPolicyId: compte.payment_policy_id,
      returnPolicyId: compte.return_policy_id,
    },
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
  const brouillon = offerIdAttendu
    ? offres.find((o) => String(o.offerId ?? "") === offerIdAttendu)
    : offres.find((o) => o.offerId);
  if (offerIdAttendu && !brouillon) {
    await marquer(admin, job, { status: "failed", error: `Republication eBay arrêtée : l'offre exacte ${offerIdAttendu} n'existe plus pour cet article. FillSell n'en a pas choisi une autre.` },
      { etape: "offre", quoi: "offre_attendue_absente", offer_id_attendu: offerIdAttendu },
      { sku, offer_id: offerIdAttendu });
    return { job: job.id, issue: "failed", motif: "offre_attendue_absente", offer_id: offerIdAttendu };
  }
  if (brouillon?.offerId) {
    const maj = await appelEbay(env, token, `/sell/inventory/v1/offer/${brouillon.offerId}`, { method: "PUT", body: offre });
    if (maj.http !== 200 && maj.http !== 204) {
      const e = lireErreurEbay(maj.json, maj.texte);
      // (2026-09-11) Même filtre que la publication : un motif nommé prime sur
      // le longMessage parapluie d'eBay, qui accuse l'utilisateur.
      await marquer(admin, job, { status: verdictHttp(maj.http, tentatives), error: messageRefus("la mise à jour de l'offre", maj.http, e).error }, { etape: "offre_maj", http: maj.http, errorId: e.errorId, message: e.message }, { sku, offer_id: brouillon.offerId, tentatives });
      return { job: job.id, issue: "offre_maj", http: maj.http, ebay: e };
    }
    offerId = brouillon.offerId;
  } else {
    const cre = await appelEbay(env, token, "/sell/inventory/v1/offer", { method: "POST", body: offre });
    if (cre.http !== 201 && cre.http !== 200) {
      const e = lireErreurEbay(cre.json, cre.texte);
      const refusOffre = messageRefus("la création de l'offre", cre.http, e);
      await marquer(admin, job, { status: verdictHttp(cre.http, tentatives), error: refusOffre.error }, { etape: "offre", http: cre.http, errorId: e.errorId, message: e.message, ...diagRefus(e, refusOffre.motif) }, { sku, tentatives });
      return { job: job.id, issue: "offre", http: cre.http, motif: refusOffre.motif?.code ?? null, ebay: e };
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
    // 25129 « The product aspects for this category no longer support custom
    // values for <aspect> » (06/09, Adidas : Taille « T-shirt ») : notre cache
    // d'aspects est PÉRIMÉ (texte libre → liste fermée chez eBay). On relit
    // Taxonomy, on remplace la ligne du cache, et on rejoue le job UNE fois :
    // l'aspect, désormais fermé, ne prendra plus la valeur libre → manquant →
    // needsUserField avec la liste exacte d'eBay. Une 2e fois → needs_user
    // avec le refus eBay tel quel (pas de boucle).
    // Relevé 06/09 (Adidas, 15687) : Taxonomy relu dit TOUJOURS FREE_TEXT pour
    // « Taille », eBay refuse quand même la valeur libre. Le rejeu seul ne
    // suffit donc pas : on lit l'aspect nommé par eBay (paramètre « 2 »), on
    // grave SELECTION_ONLY dans le cache, et on demande la valeur à
    // l'utilisateur dans la liste d'eBay (mini-éditeur, liste fermée). Sans
    // aspect identifiable : rejeu unique après rafraîchissement, puis
    // needs_user avec le refus tel quel.
    if (e.errorId === 25129) {
      const dejaRafraichi = Boolean(((pf.ebay_api as Record<string, unknown>) ?? {}).aspects_rafraichis);
      const frais = await aspectsCategorie(admin, env, token, categoryId, { rafraichir: true });
      // (30/09) Aspect et valeur lus par leur SENS, plus par leur position :
      // eBay a décalé ses paramètres (« 2 » = « 500 »), cf. lireRefus25129.
      const { nomAspect, valeurRefusee } = lireRefus25129(e, "erreur" in frais ? [] : frais.aspects.map((a) => a.name));
      const catAspect = !("erreur" in frais) && nomAspect ? frais.aspects.find((a) => a.name === nomAspect) : undefined;
      if (catAspect) {
        const ferme = await marquerAspectFerme(admin, categoryId, nomAspect);
        const valeurs = catAspect.allowedValues.filter(Boolean).map(String).slice(0, 200);
        const ebayAspectsJob = { ...((pf.ebayAspects as Record<string, unknown>) ?? {}) };
        if (valeurRefusee && String(ebayAspectsJob[nomAspect] ?? "") === valeurRefusee) delete ebayAspectsJob[nomAspect];
        const needsUserField: Record<string, unknown> = {
          platform: "ebay", field_key: nomAspect, field_label: nomAspect,
          target: { root: "ebayAspects", key: nomAspect },
          ...(valeurs.length ? { allowed_values: valeurs, input_type: "selection_only", options_completes: true } : {}),
          source: "ebay_api_worker_25129",
        };
        job.platform_fields = { ...(job.platform_fields ?? {}), ebayAspects: ebayAspectsJob, needsUserField, needsUserAttempts: (Number((job.platform_fields ?? {}).needsUserAttempts) || 0) + 1 };
        const msg = `eBay n'accepte que ses propres valeurs pour « ${nomAspect} »${valeurRefusee ? ` (« ${valeurRefusee} » refusée)` : ""}. Choisis-en une depuis la fiche de l'article (bouton « ✋ Compléter »), puis « Valider et relancer » : la publication repart d'elle-même.`;
        await marquer(admin, job, { status: "needs_user", error: msg }, { etape: "publish", quoi: "aspect_ferme_25129", http: pub.http, message: e.message, aspect: nomAspect, valeur_refusee: valeurRefusee || null, cache_ferme: ferme, nb_valeurs: valeurs.length }, { sku, offer_id: offerId, tentatives, aspects_rafraichis: true });
        return { job: job.id, issue: "needs_user", motif: "aspect_ferme_25129", aspect: nomAspect, valeur_refusee: valeurRefusee, nb_valeurs: valeurs.length, cache_ferme: ferme };
      }
      if (!dejaRafraichi) {
        await marquer(admin, job, { status: "pending", error: null }, { etape: "publish", quoi: "aspects_rafraichis_25129", http: pub.http, message: e.message, cache: "erreur" in frais ? `échec : ${frais.erreur}` : `${frais.aspects.length} aspects relus (Taxonomy)` }, { sku, offer_id: offerId, tentatives, aspects_rafraichis: true });
        return { job: job.id, issue: "aspects_rafraichis", http: pub.http, ebay: e };
      }
    }
    const refus = messageRefus("la publication", pub.http, e);
    await marquer(admin, job, { status: verdictHttp(pub.http, tentatives), error: refus.error }, { etape: "publish", http: pub.http, errorId: e.errorId, message: e.message, ...diagRefus(e, refus.motif) }, { sku, offer_id: offerId, tentatives });
    return { job: job.id, issue: "publish", http: pub.http, motif: refus.motif?.code ?? null, ebay: e };
  }
  const listingId = String((pub.json as { listingId?: string } | null)?.listingId ?? "");
  const avertissements = ((pub.json as { warnings?: Array<{ message?: string }> } | null)?.warnings ?? []).map((w) => String(w.message ?? "")).slice(0, 5);
  const publishedAt = new Date().toISOString();
  await marquer(admin, job,
    { status: "published", error: null, platform_listing_id: listingId, listing_url: urlAnnonce(listingId), published_at: publishedAt },
    { etape: "publie", http: 200, condition_envoyee: condition.enumValue, condition_id: condition.id, condition_libelle: condition.libelle, recalages, source_catalogue: cat.source, avertissements, sources: rempli.sources, ia: rempli.ia, categorie: { id: categoryId, source: categorie.source, detail: categorie.detail ?? null, chemin: categorie.chemin, suggestions: categorie.suggestions }, photos: { rapatriees: rap.rapatriees, deja_chez_nous: rap.deja_chez_nous, echecs: rap.echecs }, ...diagAttributs },
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
// ── LA FAMILLE DE L'ARTICLE DIT DANS QUELS RAYONS eBAY IL PEUT VIVRE (2026-09-23 soir)
// tomcarter13700, 23/09 : « Boîtes de rangement slaves », famille Lens
// maison_deco, mappé par le mot « boîte de rangement » en « Livres, BD, revues
// > … > Rangement : boîtes » (les boîtes à BD) ; eBay proposait « Maison >
// Solutions de rangement > Boîtes, bacs ». « Livre Shigeru Ban – Taschen »,
// famille livres_medias, mappé en « Jouets et jeux > Modélisme ferroviaire >
// Livres » ; eBay proposait six rayons « Livres, BD, revues ». Les deux sont
// partis en « catégorie à confirmer » alors que la famille tranchait seule.
// Table FERMÉE : famille Lens (lens-analysis FAMILLES) → racines eBay FR
// cohérentes. Une famille absente d'ici ne pèse rien (comportement d'avant).
const RAYONS_EBAY_PAR_FAMILLE: Record<string, RegExp> = {
  livres_medias: /^(Livres, BD, revues|DVD, cin[ée]ma|Films, DVD|Musique, CD, vinyles)/i,
  maison_deco: /^(Maison|Jardin, terrasse|Art, antiquit[ée]s|Luminaires|Bricolage)/i,
  mobilier: /^(Maison|Jardin, terrasse|Art, antiquit[ée]s)/i,
  jardin: /^(Jardin, terrasse|Maison|Bricolage)/i,
  bricolage: /^(Bricolage|Jardin, terrasse|Maison)/i,
  jouets: /^(Jouets et jeux|B[ée]b[ée], pu[ée]riculture)/i,
  puericulture: /^(B[ée]b[ée], pu[ée]riculture|V[êe]tements, accessoires|Jouets et jeux)/i,
  mode: /^(V[êe]tements, accessoires|Bijoux, montres|B[ée]b[ée], pu[ée]riculture)/i,
  chaussures: /^(V[êe]tements, accessoires|B[ée]b[ée], pu[ée]riculture)/i,
  sport: /^(Sports, vacances|V[êe]tements, accessoires)/i,
  beaute: /^(Beaut[ée], bien-[êe]tre, parfums)/i,
  high_tech: /^(Informatique, r[ée]seaux|T[ée]l[ée]phonie, mobilit[ée]|TV, son, hi-fi|Image, son|Photo, cam[ée]scopes|Jeux vid[ée]o, consoles)/i,
  electromenager: /^(Électrom[ée]nager|Electrom[ée]nager|Maison)/i,
  musique: /^(Instruments de musique|Musique, CD, vinyles)/i,
  collection: /^(Collections|Monnaies|Timbres|Art, antiquit[ée]s|Jouets et jeux)/i,
  auto_moto: /^(Auto, moto)/i,
};
function ordonnerParFamille<T extends { chemin: string[] }>(liste: T[], famille: string | null): T[] {
  const re = RAYONS_EBAY_PAR_FAMILLE[String(famille ?? "")];
  if (!re) return liste;
  const coherentes = liste.filter((x) => re.test(String(x.chemin[0] ?? "")));
  const autres = liste.filter((x) => !re.test(String(x.chemin[0] ?? "")));
  return [...coherentes, ...autres];
}
// ⛔ CONTRÔLE PAR SUGGESTION DÉSACTIVÉ (06/09 11:55) : sur « T-shirt Adidas
// Sergio Garcia vintage », la règle a REMPLACÉ le mapping 15687 (T-shirts
// homme) par la suggestion n°1 d'eBay 121889 (Livres > BD franco-belges) :
// « t-shirt » ne matchait pas « T-shirts » (pluriel) et la branche racine
// différait — un T-shirt publié en BD (annonce 820093913142, retirée). Le
// mapping icône de l'app gagne TOUJOURS tant que Nico n'a pas tranché une
// règle plus sûre (consensus des 5 suggestions ?) ; la suggestion ne sert
// qu'en l'absence de mapping.
const CONTROLE_CATEGORIE_PAR_SUGGESTION = true;
// Résumé des suggestions eBay, écrit dans le last_diagnostic à chaque
// résolution — « jamais en silence » : on doit pouvoir relire pourquoi la
// règle a gardé le mapping ou demandé un choix.
interface ResumeSuggestions { titre_interroge: string; n: number; racine_top: string | null; meme_racine_que_top: number; mapping_dans_liste: boolean; liste: string[] }
// `attente` (25/09) : seul « le rayon refusé ne part jamais » le pose, quand
// l'IA est en panne — le job repasse au tick suivant au lieu de demander.
type Categorie = { id: string; chemin: string[]; source: string; detail?: string; suggestions: ResumeSuggestions } | { choix: Array<{ id: string; chemin: string }>; motif: string; suggestions: ResumeSuggestions; sansMapping?: boolean; attente?: boolean };
// ⚠️ 06/09 : le titre du job est le titre eBay RACCOURCI (« La Méthode
// Delavier de Musculation pour la Femme ») ; interrogé tel quel, eBay
// répondait 3 Livres / 6 Sports et la règle gardait Haltères — publié deux
// fois en Haltères (820094103491, 820094121646, retirées). Avec le titre de
// l'inventaire (auteurs compris) : 6 Livres sur 8 → needs_user. On interroge
// donc le titre de l'inventaire, repli sur celui du job.
async function lireInventaire(admin: SupabaseClient, inventaireId: number | null): Promise<{ titre: string; attributs: AttributsInventaire | null }> {
  if (!inventaireId) return { titre: "", attributs: null };
  const { data } = await admin.from("inventaire").select("titre, attributs").eq("id", inventaireId).maybeSingle();
  const ligne = data as { titre?: string; attributs?: unknown } | null;
  const attributs = (ligne?.attributs && typeof ligne.attributs === "object" && !Array.isArray(ligne.attributs)) ? ligne.attributs as AttributsInventaire : null;
  return { titre: String(ligne?.titre ?? "").trim(), attributs };
}

// ── Lot 2 (07/09/2026) : Lens identify côté serveur, UNE fois par article ──
// Déclenché quand couleur, matière ou taille manquent encore APRÈS le job et
// inventaire.attributs, et qu'aucun scan n'a jamais été posé sur l'article.
// RÉSERVATION AVANT L'APPEL : le marqueur attributs.lens_scan est écrit par un
// UPDATE conditionnel (attributs->lens_scan IS NULL) — 0 ligne = quelqu'un
// d'autre l'a posé (job jumeau, relance concurrente, autre plateforme) et on
// ne scanne pas. Le marqueur survit donc aux retries, aux relances manuelles,
// aux jobs recréés et aux autres plateformes : UN scan par article à vie,
// échec compris (une tentative qui a atteint l'API a coûté ; elle n'est
// jamais rejouée en silence — pour réarmer, retirer la clé lens_scan à la
// main). Mode identify FORCÉ côté lens-analysis (jamais full, même en repli).
// Un échec de Lens ne fait JAMAIS échouer la publication : l'article part
// avec ses trous, le mini-éditeur prend le relais s'il manque un requis.
interface ResumeScan { statut: "non_necessaire" | "deja_scanne" | "reserve_ailleurs" | "sans_photo" | "ok" | "echec"; champs_manquants?: string[]; champs_lus?: string[]; detail?: string; duree_ms?: number; photos?: number; at?: string }
function texteOuNull(x: unknown): string | null {
  return (typeof x === "string" && x.trim() && x.trim().toLowerCase() !== "null") ? x.trim() : null;
}
async function scannerLensSiNecessaire(admin: SupabaseClient, job: Job, pf: PlatformFields, attributs: AttributsInventaire | null, photos: string[], titre: string, passe?: Passe): Promise<{ resume: ResumeScan; attributs: AttributsInventaire | null }> {
  const manque = ["couleur", "matiere", "taille"].filter((c) => {
    if (c === "couleur") return !texteOuNull(pf.couleur) && !(Array.isArray(pf.colors) && pf.colors.length > 0);
    return !texteOuNull(pf[c]);
  });
  if (!manque.length) return { resume: { statut: "non_necessaire" }, attributs: null };
  const deja = attributs?.lens_scan?.v;
  if (deja && typeof deja === "object") return { resume: { statut: "deja_scanne", champs_manquants: manque, detail: JSON.stringify(deja).slice(0, 240) }, attributs: null };
  if (!photos.length) return { resume: { statut: "sans_photo", champs_manquants: manque }, attributs: null };
  const at = new Date().toISOString();
  const marqueur = (v: Record<string, unknown>) => ({ lens_scan: { v, source: "lens", at } });
  // Réservation atomique — le trigger de fusion garde toutes les autres clés.
  const { data: reserve, error: errReserve } = await admin.from("inventaire")
    .update({ attributs: marqueur({ statut: "en_cours", mode: "identify", motif: "ebay_api", job: job.id, at, photos: photos.length }) })
    .eq("id", job.inventaire_id).eq("user_id", job.user_id).is("attributs->lens_scan", null).select("id");
  if (errReserve) return { resume: { statut: "echec", champs_manquants: manque, detail: `réservation refusée : ${errReserve.message}`.slice(0, 300) }, attributs: null };
  if (!reserve?.length) {
    const { data: relu } = await admin.from("inventaire").select("attributs").eq("id", job.inventaire_id).maybeSingle();
    const a = (relu as { attributs?: unknown } | null)?.attributs;
    return { resume: { statut: "reserve_ailleurs", champs_manquants: manque }, attributs: (a && typeof a === "object") ? a as AttributsInventaire : null };
  }
  if (passe) passe.scans += 1;
  const debut = Date.now();
  let resultat: Record<string, unknown> | null = null;
  let detailEchec = "";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), LENS_TIMEOUT_MS);
    const cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/lens-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cle}`, apikey: cle, "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "" },
      body: JSON.stringify({ origine: "ebay_api", user_id: job.user_id, mode: "identify", lang: "fr", urls: photos.slice(0, 8), ...(titre ? { description: `Titre de l'annonce : ${titre}` } : {}) }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const texte = await r.text();
    let json: Record<string, unknown> | null = null;
    try { json = JSON.parse(texte); } catch { json = null; }
    if (!r.ok || !json || json.error) detailEchec = `HTTP ${r.status} ${String(json?.error ?? texte.slice(0, 200))}`;
    else resultat = json;
  } catch (e) {
    detailEchec = (e as Error)?.name === "AbortError" ? `délai dépassé (${LENS_TIMEOUT_MS} ms)` : String((e as Error)?.message ?? e);
  }
  const duree = Date.now() - debut;
  if (!resultat) {
    const { error } = await admin.from("inventaire").update({ attributs: marqueur({ statut: "echec", mode: "identify", motif: "ebay_api", job: job.id, at, duree_ms: duree, photos: photos.length, detail: detailEchec.slice(0, 300) }) }).eq("id", job.inventaire_id);
    if (error) console.error(`[ebay-api-worker] lens_scan échec non gardé sur ${job.inventaire_id} : ${error.message}`);
    console.warn(`[ebay-api-worker] Lens identify KO pour l'article ${job.inventaire_id} (job ${job.id}) : ${detailEchec.slice(0, 200)}`);
    return { resume: { statut: "echec", champs_manquants: manque, detail: detailEchec.slice(0, 300), duree_ms: duree, photos: photos.length, at }, attributs: null };
  }
  // Ce que Lens a LU → attributs source lens. La base ne laisse jamais une
  // lecture IA écraser une valeur Vinted ou une saisie (trigger de fusion) ;
  // ici on ne pose que ce qui est non vide.
  const av = (resultat.attributs_visibles && typeof resultat.attributs_visibles === "object" && !Array.isArray(resultat.attributs_visibles)) ? resultat.attributs_visibles as Record<string, unknown> : null;
  const lus: Record<string, unknown> = {
    couleur: texteOuNull(resultat.couleur), matiere: texteOuNull(resultat.matiere), taille: texteOuNull(resultat.taille_estimee),
    marque: texteOuNull(resultat.marque), etat: texteOuNull(resultat.etat_estime), modele: texteOuNull(resultat.modele),
    famille: texteOuNull(resultat.famille), objet: texteOuNull(resultat.objet), isbn: texteOuNull(av?.isbn_ean),
    attributs_visibles: av && Object.keys(av).length ? av : null,
  };
  const nouveaux: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(lus)) if (v != null) nouveaux[k] = { v, source: "lens", at };
  const champsLus = Object.keys(nouveaux);
  nouveaux.lens_scan = { v: { statut: "ok", mode: "identify", motif: "ebay_api", job: job.id, at, duree_ms: duree, photos: photos.length, champs_lus: champsLus, confiance: texteOuNull(resultat.confiance) }, source: "lens", at };
  const { data: apres, error: errEcriture } = await admin.from("inventaire").update({ attributs: nouveaux }).eq("id", job.inventaire_id).select("attributs").maybeSingle();
  if (errEcriture) console.error(`[ebay-api-worker] attributs Lens non gardés sur ${job.inventaire_id} : ${errEcriture.message}`);
  const a = (apres as { attributs?: unknown } | null)?.attributs;
  // Repli mémoire si la relecture manque : l'existant (toute source ≥ lens) prime, les lectures comblent.
  const fusionLocale: AttributsInventaire = { ...(nouveaux as AttributsInventaire), ...(attributs ?? {}) };
  console.log(`[ebay-api-worker] Lens identify OK pour l'article ${job.inventaire_id} (job ${job.id}) : ${champsLus.join(", ") || "rien de lisible"} en ${duree} ms`);
  return { resume: { statut: "ok", champs_manquants: manque, champs_lus: champsLus, duree_ms: duree, photos: photos.length, at }, attributs: (a && typeof a === "object") ? a as AttributsInventaire : fusionLocale };
}
// `famille` (lot 1, 07/09) : la famille lue par Lens (pf.famille, comblée
// depuis inventaire.attributs). Seule règle qui s'en sert : un article en
// « livres_medias » ne part jamais en silence hors du rayon Livres — c'est la
// règle « famille souveraine pour les LIVRES seulement » de l'app
// (resolveArticleIcon, cas Delavier), portée au serveur.
const LIVRES_RE = /^livres/i;
async function resoudreCategorie(env: EbayEnv, token: string, job: Pick<Job, "title">, pf: PlatformFields, famille: string | null = null): Promise<Categorie> {
  const mappee = String(pf.ebayCategoryId ?? "").trim();
  const cheminMappe = Array.isArray(pf.ebayCategoryPath) ? (pf.ebayCategoryPath as string[]) : [];
  const titre = String(job.title ?? "").trim();
  const suggestions = await suggererCategories(env, token, titre);
  const top = suggestions[0];
  const racineTop0 = top ? String(top.chemin[0] ?? "") : null;
  const resume: ResumeSuggestions = {
    titre_interroge: titre,
    n: suggestions.length,
    racine_top: racineTop0,
    meme_racine_que_top: racineTop0 === null ? 0 : suggestions.filter((x) => (x.chemin[0] ?? "") === racineTop0).length,
    mapping_dans_liste: Boolean(mappee) && suggestions.some((x) => x.id === mappee),
    liste: suggestions.map((x) => `${x.id} ${x.chemin.join(" > ")}`),
  };
  if (mappee) {
    // ── LE RAYON REFUSÉ NE PART JAMAIS (2026-09-25) ─────────────────────────
    // L'app a REFUSÉ ce rayon (sa vérification IA : « incoherent »,
    // « refuse_hors_famille ») et, par la voie API, le laisse sur le job pour
    // qu'on tranche ICI avec le catalogue d'eBay — plus complet que notre
    // arbre relevé (un routeur 4G n'y trouve aucun rayon). La règle n°2
    // ci-dessous le faisait presque toujours (3 refus sur 3 corrigés depuis le
    // 10/09) sans le garantir : le mapping refusé repartait dès que la n°1
    // d'eBay était lui, ou que l'IA ne tranchait pas (repli « mapping »).
    // Désormais : il sort de la liste ; l'IA choisit le plus PROCHE parmi les
    // suggestions qui restent ; rien de sûr → la question, avec ces
    // suggestions (jamais le rayon refusé, jamais une n°1 prise à l'aveugle) ;
    // IA en panne → attente, le job repasse au tick suivant.
    // ⛔ Tout autre job — aucun refus, ou un mapping qui n'est pas le rayon
    //    refusé (choix du vendeur, rayon repris par l'app) — ne voit pas ce
    //    bloc : son chemin est celui d'avant, au caractère près.
    const refuses = mappingRefuseParLApp(pf as Record<string, unknown>, cheminMappe);
    if (refuses) {
      const restantes = suggestionsSansRefus(suggestions, refuses, mappee);
      const refusTexte = refuses.map((c) => c.join(" > ")).join(" | ");
      const verdictApp = String(((pf as Record<string, unknown>).categorie_verification as Record<string, unknown> | undefined)?.verdict ?? "");
      const issue: IssueApresRefus = restantes.length
        ? await choisirApresRefus(restantes, {
          titre, genre: pf.genre as string | null, taille: pf.taille as string | null,
          marque: pf.marque as string | null, userId: (pf as Record<string, unknown>).__userId as string | null,
          rejeu: (pf as Record<string, unknown>).__rejeu === true,
        })
        : { issue: "aucune" };
      if (issue.issue === "choisi") {
        return {
          id: issue.retenu.id, chemin: issue.retenu.chemin, source: "suggestion_apres_refus",
          detail: `rayon de l'app « ${refusTexte} » refusé par sa vérification (${verdictApp}) ; retenu « ${issue.retenu.chemin.join(" > ")} » ` +
            `(${issue.retenu.id}) par l'IA parmi ${restantes.length} suggestion(s) eBay, rayon refusé exclu`,
          suggestions: resume,
        };
      }
      return {
        choix: ordonnerParFamille(restantes, famille).slice(0, 5).map((x) => ({ id: x.id, chemin: x.chemin.join(" > ") })),
        motif: `rayon de l'app « ${refusTexte} » refusé par sa vérification (${verdictApp}) ; ` + (
          issue.issue === "panne" ? `IA indisponible pour choisir parmi les ${restantes.length} suggestion(s) eBay`
            : restantes.length ? `aucune des ${restantes.length} suggestion(s) eBay retenue par l'IA`
              : `eBay ne propose aucun autre rayon (${suggestions.length} suggestion(s) reçue(s))`),
        suggestions: resume,
        sansMapping: true,
        ...(issue.issue === "panne" ? { attente: true } : {}),
      };
    }
    // ── RÈGLE N°2 : eBAY BAT UNE ICÔNE DEVINÉE (2026-09-07 soir) ───────────
    // L'app pose `categorie_incertaine` quand NOTRE catégorie n'est qu'une
    // supposition : aucun mot-objet dans le titre, aucun catalog_id Vinted,
    // aucun garde-fou pour trancher — il ne reste que l'emoji rendu par l'IA.
    // Cas fondateur, 07/09 17h36 : « Chapka Obaibi bébé 18-23 mois » classée
    // par une icône 🎹 en « Claviers arrangeurs, synthés » (38088) — pendant
    // qu'eBay, lui, proposait « Pyjamas ». On LISAIT déjà sa suggestion, et
    // on lui désobéissait : le job partait en needs_user pour faire trancher
    // une vendeuse sur une question à laquelle eBay avait déjà répondu.
    //
    // Désormais : quand notre source est incertaine, la suggestion d'eBay
    // GAGNE, SILENCIEUSEMENT. Aucun écran, aucune question, l'annonce part.
    //
    // ⛔ JAMAIS quand notre source est certaine (mot-objet, catalog_id Vinted,
    //    famille Lens) : l'app ne pose alors pas le drapeau, et l'arbitrage
    //    v2 ci-dessous reprend la main à l'identique.
    // ⛔ JAMAIS sans suggestion : sans réponse d'eBay, notre mapping reste —
    //    une catégorie approchée vaut mieux qu'aucune catégorie.
    // ⛔ La garde famille LIVRES plus bas n'est pas court-circuitée : un livre
    //    a une source certaine (famille_livres), donc pas de drapeau.
    if (pf.categorie_incertaine === true && top && top.id !== mappee) {
      // ⚠️ PAS « la première de la liste » : eBay en propose jusqu'à cinq, et
      // la bonne n'est pas toujours en tête (chapka : 3e sur 5). L'IA tranche
      // DANS la liste, sa réponse vérifiée par resolve-categorie.
      const retenu = await choisirParmiSuggestions(suggestions, {
        titre, genre: pf.genre as string | null, taille: pf.taille as string | null,
        marque: pf.marque as string | null, userId: (pf as Record<string, unknown>).__userId as string | null,
      }, (pf as Record<string, unknown>).__admin as SupabaseClient | undefined);
      if (retenu) {
        return {
          id: retenu.id,
          chemin: retenu.chemin,
          source: retenu.id === top.id ? "suggestion_categorie_incertaine" : "suggestion_choisie_par_ia",
          detail:
            `notre catégorie « ${cheminMappe.join(" > ") || mappee} » ne venait que de l'icône de l'IA ` +
            `(categorie_source=${String(pf.categorie_source ?? "ia")}) ; retenu « ${retenu.chemin.join(" > ")} » ` +
            `(${retenu.id}) parmi les ${suggestions.length} suggestions eBay`,
          suggestions: resume,
        };
      }
    }
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
    // Règle v2 STRICTE (arbitrage Nico, 06/09 soir — « un clic coûte moins
    // cher qu'une annonce en BD ») :
    //   · n = suggestions rendues ; on ne conclut qu'avec n ≥ 3 ;
    //   · le mapping figure dans la liste → gardé ;
    //   · sinon, si la racine de la n°1 ≠ celle du mapping → changement de
    //     RACINE, SANS condition de proportion → JAMAIS en silence :
    //     needs_user avec les chemins, l'utilisateur tranche. (La version
    //     « ≥ 2/3 » laissait passer 3 Livres / 6 Sports sur le titre
    //     raccourci du Delavier.)
    //     Relancer le job SANS rien changer = garder le mapping de l'app
    //     (marque ebayCategorieAttente) ; changer l'icône/le genre = nouveau
    //     mapping.
    //   Relevé : Adidas (mapping 3e des 10) → gardé ; Delavier (6/9 Livres,
    //   mapping Haltères absent) → needs_user ; sweat (1 seule) → gardé.
    // ── HORS FAMILLE (2026-09-10, cas dddc7f2a « Salopette » → Vêtements
    // mécanicien) : le contrôle de plausibilité de l'app a REFUSÉ notre
    // mapping (famille du chemin ≠ famille certaine de l'objet) et l'a flagué
    // incertain — la règle n°2 ci-dessus vient donc de tenter la suggestion
    // d'eBay. Aucune retenue : on ne publie JAMAIS dans une famille fausse, on
    // demande. Relancer sans rien changer redemande — c'est un geste, pas une
    // boucle automatique.
    const plausibilite = (pf as Record<string, unknown>).categorie_plausibilite as Record<string, unknown> | undefined;
    const horsFamille = Boolean(plausibilite && typeof plausibilite === "object" && plausibilite.verdict === "hors_famille");
    if (horsFamille) {
      return {
        choix: suggestions.slice(0, 5).map((x) => ({ id: x.id, chemin: x.chemin.join(" > ") })),
        motif: `classé par l'app en « ${cheminMappe.join(" > ")} » (${mappee}) — hors de la famille de l'objet (${String(plausibilite?.famille_objet ?? "?")}, source ${String(plausibilite?.source_famille ?? "?")}) ; aucune suggestion eBay retenue (${suggestions.length} reçues)`,
        suggestions: resume,
        sansMapping: true,
      };
    }
    if (CONTROLE_CATEGORIE_PAR_SUGGESTION && top && top.id !== mappee) {
      const n = suggestions.length;
      const mappeeDansLaListe = suggestions.some((x) => x.id === mappee);
      const racineMappee = String(cheminMappe[0] ?? "");
      const racineTop = String(top.chemin[0] ?? "");
      const memeRacineQueTop = suggestions.filter((x) => (x.chemin[0] ?? "") === racineTop).length;
      const dejaTranche = Boolean((pf as Record<string, unknown>).ebayCategorieAttente);
      // ── NOS PROPRES ATTRIBUTS CONFIRMENT-ILS NOTRE CATÉGORIE ? ────────────
      // (2026-09-18, T-shirt Jean-Jacques Goldman d'Ornella parti au rayon DVD)
      //
      // La règle v2 ne pesait QUE le consensus d'eBay : mapping absent de ses
      // suggestions + racine différente ⇒ on écartait notre catégorie et on ne
      // proposait QUE les siennes. Sur « T-shirt Jean-Jacques Goldman », eBay a
      // lu le nom de l'artiste et proposé huit rayons Musique/DVD ; notre
      // 15687 « … > T-shirts » était juste, et devenait impossible à garder :
      // relancer publiait en DVD, et le message conseillait de changer une
      // icône DÉJÀ bonne (👕) et un genre DÉJÀ bon (Homme). Une impasse.
      //
      // ⛔ ON NE RETIRE PAS LA GARDE — elle attrape de VRAIS cas. Mesuré sur 30
      // jours, elle s'est déclenchée DEUX fois, et les deux sont opposées :
      //   · T-shirt Goldman : `ebayAspects` = {Type:"T-shirt", Département:
      //     "Homme"} → nos attributs CONFIRMENT notre catégorie. eBay a tort.
      //   · « Livre sur Kisling » (carhoa, 14/09), mappé « Jouets et jeux >
      //     Modélisme ferroviaire > Livres » : `ebayAspects` = null → RIEN ne
      //     confirme notre catégorie, et eBay dit « Livres, BD, revues ».
      //     eBay a raison, et il faut continuer à demander.
      // Le discriminant n'est donc pas « qui parle le plus fort », c'est
      // « avons-nous une preuve à nous ? » — la règle de Nico mot pour mot :
      // une suggestion eBay ne remplace jamais une catégorie que l'app a
      // déterminée ET QUE SES PROPRES ATTRIBUTS CONFIRMENT.
      //
      // ⚠️ Les valeurs NEUTRES ne confirment rien : « Ne s'applique pas » est
      // posé en aveugle par l'app (défaut MPN, Modèle sans marque) — le compter
      // ferait passer pour une preuve ce qui n'est qu'un remplissage.
      const aspectsJob = (pf.ebayAspects && typeof pf.ebayAspects === "object")
        ? (pf.ebayAspects as Record<string, unknown>) : {};
      const aspectsPortants = Object.entries(aspectsJob)
        .map(([k, v]) => [k, String(v ?? "").trim()] as [string, string])
        .filter(([, v]) => v && v.toLowerCase() !== "ne s'applique pas");
      const attributsConfirment = aspectsPortants.length > 0;
      const racineContestee = n >= 3 && !mappeeDansLaListe && Boolean(racineTop) && racineTop !== racineMappee;
      if (racineContestee && attributsConfirment) {
        // Nos attributs tiennent : la contradiction d'eBay est un signal contre
        // SA suggestion, pas contre la nôtre. On publie, sans question.
        console.log(
          `[ebay-api-worker] catégorie : eBay conteste « ${racineMappee} » (il propose « ${racineTop} »), ` +
          `mais nos attributs confirment notre catégorie — mapping CONSERVÉ (` +
          `${aspectsPortants.map(([k, v]) => `${k}=${v}`).join(", ")})`,
        );
        return {
          id: mappee,
          chemin: cheminMappe,
          source: "mapping_confirme_par_attributs",
          detail:
            `eBay proposait « ${racineTop} » (${memeRacineQueTop}/${n} suggestions) et notre mapping n'y figure pas, ` +
            `mais les attributs de l'article confirment « ${cheminMappe.join(" > ")} » (${mappee}) : ` +
            `${aspectsPortants.map(([k, v]) => `${k}=${v}`).join(", ")}. Suggestion eBay écartée.`,
          suggestions: resume,
        };
      }
      // ── LA FAMILLE ARBITRE, AVANT DE DEMANDER (2026-09-23 soir) ────────────
      // eBay conteste notre rayon, rien chez nous ne le confirme : jusqu'ici on
      // demandait, avec la liste brute d'eBay. Or on SAIT ce qu'est l'article
      // (famille Lens / catalogue Vinted). Si notre rayon est hors famille et
      // qu'eBay en propose un dedans, l'IA choisit PARMI les cohérents et on
      // publie, sans question. Si notre rayon est dans la famille et qu'aucune
      // suggestion n'y est, on garde le nôtre, sans question. Dans les autres
      // cas on demande, et la liste met les rayons cohérents en tête —
      // jamais la suggestion brute en première place.
      const rayonsFamille = RAYONS_EBAY_PAR_FAMILLE[String(famille ?? "")] ?? null;
      if (racineContestee && !attributsConfirment && rayonsFamille) {
        const mappingCoherent = rayonsFamille.test(racineMappee);
        const suggestionsCoherentes = suggestions.filter((x) => rayonsFamille.test(String(x.chemin[0] ?? "")));
        if (!mappingCoherent && suggestionsCoherentes.length) {
          const retenu = (await choisirParmiSuggestions(suggestionsCoherentes, {
            titre, genre: pf.genre as string | null, taille: pf.taille as string | null,
            marque: pf.marque as string | null, userId: (pf as Record<string, unknown>).__userId as string | null,
          }, (pf as Record<string, unknown>).__admin as SupabaseClient | undefined)) ?? suggestionsCoherentes[0];
          console.log(`[ebay-api-worker] catégorie : notre rayon « ${racineMappee} » est hors de la famille ${famille} — retenu « ${retenu.chemin.join(" > ")} » (${retenu.id}) parmi ${suggestionsCoherentes.length} suggestion(s) cohérente(s)`);
          return {
            id: retenu.id, chemin: retenu.chemin, source: "suggestion_coherente_famille",
            detail: `notre rayon « ${cheminMappe.join(" > ")} » (${mappee}) est hors de la famille de l'article (${famille}) ; ` +
              `eBay propose ${suggestionsCoherentes.length} rayon(s) dans cette famille, retenu « ${retenu.chemin.join(" > ")} » (${retenu.id})`,
            suggestions: resume,
          };
        }
        if (mappingCoherent && !suggestionsCoherentes.length) {
          console.log(`[ebay-api-worker] catégorie : eBay conteste « ${racineMappee} » mais aucune de ses suggestions n'est dans la famille ${famille} — mapping CONSERVÉ`);
          return {
            id: mappee, chemin: cheminMappe, source: "mapping_confirme_par_famille",
            detail: `eBay proposait « ${racineTop} » (${memeRacineQueTop}/${n}) mais aucun de ses rayons n'est dans la famille de l'article (${famille}) ; notre rayon « ${cheminMappe.join(" > ")} » (${mappee}) l'est`,
            suggestions: resume,
          };
        }
      }
      if (racineContestee && !dejaTranche) {
        return {
          // NOTRE CATÉGORIE EST TOUJOURS DANS LA LISTE, ET EN TÊTE (règle Nico
          // du 18/09). Avant, `choix` ne portait QUE les suggestions d'eBay :
          // la personne n'avait littéralement aucun moyen de garder la nôtre.
          // ⚠️ Elle n'est PAS le défaut dans CETTE branche : on n'y arrive que
          // lorsque rien de chez nous ne la confirme (cas « Livre sur
          // Kisling »), et une relance à l'aveugle publierait un livre au rayon
          // Jouets. Elle est offerte, pas imposée.
          choix: [
            ...(mappee ? [{ id: mappee, chemin: cheminMappe.join(" > ") }] : []),
            ...ordonnerParFamille(suggestions, famille).slice(0, 5).map((x) => ({ id: x.id, chemin: x.chemin.join(" > ") })),
          ],
          motif: `classé par l'app en « ${cheminMappe.join(" > ")} » (${mappee}) ; eBay le voit plutôt en « ${racineTop} » (${memeRacineQueTop} suggestions sur ${n}, la 1re : ${top.chemin.join(" > ")}) ; AUCUN attribut de l'article ne confirme notre catégorie (ebayAspects vide) — c'est ce qui distingue ce cas du T-shirt Goldman`,
          suggestions: resume,
        };
      }
      // ── RELANCE APRÈS « à confirmer » (2026-09-10, décision Nico) : on ne
      // défend plus notre catégorie par défaut. eBay a contredit la racine,
      // l'utilisateur a relancé sans rien changer = il prend la proposition
      // d'eBay, choisie DANS ses suggestions par l'IA (jamais la n°1 aveugle :
      // fausse 4 fois sur 8, mesuré). Rien de retenu → ancien comportement
      // (mapping confirmé par la relance), tracé comme tel.
      if (racineContestee && dejaTranche) {
        const retenu = await choisirParmiSuggestions(suggestions, {
          titre, genre: pf.genre as string | null, taille: pf.taille as string | null,
          marque: pf.marque as string | null, userId: (pf as Record<string, unknown>).__userId as string | null,
        }, (pf as Record<string, unknown>).__admin as SupabaseClient | undefined);
        if (retenu) {
          return {
            id: retenu.id, chemin: retenu.chemin, source: "suggestion_apres_confirmation",
            detail: `racine contestée par eBay ; relance sans changement = proposition d'eBay retenue « ${retenu.chemin.join(" > ")} » (${retenu.id}) à la place de « ${cheminMappe.join(" > ")} » (${mappee})`,
            suggestions: resume,
          };
        }
      }
    }
    // Garde famille livres (lot 1) : la fiche Lens dit « livres_medias » et le
    // mapping de l'app n'est pas dans Livres → needs_user à choix, comme le
    // conflit v2. Les suggestions du rayon Livres passent en tête de la liste.
    if (famille === "livres_medias" && !LIVRES_RE.test(String(cheminMappe[0] ?? ""))) {
      const livres = suggestions.filter((x) => LIVRES_RE.test(String(x.chemin[0] ?? "")));
      const autres = suggestions.filter((x) => !LIVRES_RE.test(String(x.chemin[0] ?? "")));
      if (!(pf as Record<string, unknown>).ebayCategorieAttente) {
        return {
          choix: [...livres, ...autres].slice(0, 5).map((x) => ({ id: x.id, chemin: x.chemin.join(" > ") })),
          motif: `l'analyse photo classe cet article en Livres et médias ; l'app l'a classé en « ${cheminMappe.join(" > ")} » (${mappee})`,
          suggestions: resume,
        };
      }
      // ══ LA RELANCE NE PEUT PAS REMETTRE LE LIVRE HORS DU RAYON LIVRES ════
      // (2026-09-22 — jobs 41f00503 « Livre Stephen Hawking » et 7c22f64b
      //  « Twilight Fascination », ornellaracano)
      //
      // 🚨 CE QUI S'EST PASSÉ. Cette garde ne portait que sur la PREMIÈRE
      //    passe (`&& !ebayCategorieAttente`). À la relance, elle était donc
      //    sautée, `racineContestee` était faux pour le Hawking (UNE seule
      //    suggestion, et la règle exige n ≥ 3), et on tombait sur le
      //    `return` de repli : le mapping de l'app, tel quel. Le mapping,
      //    c'était 9049 « Jouets et jeux > Modélisme ferroviaire > Livres et
      //    guides > Livres ». Le livre est PARTI comme ça le 22/09 à 08:08
      //    (annonce 307191964555) — fil d'Ariane vérifié chez eBay.
      // ⛔ ET LE MESSAGE DISAIT L'INVERSE : « Relance pour publier dans la
      //    catégorie d'eBay ». Sur cette branche, relancer gardait la nôtre.
      //    Le texte et le code ne disaient pas la même chose ; c'est le texte
      //    qui avait raison sur ce qu'il fallait faire.
      // LA RÈGLE : quand la fiche dit « livre » et qu'eBay propose un rayon
      // Livres, la relance PREND ce rayon. On ne repose pas la question (pas
      // de boucle : `ebayCategorieAttente` est déjà là), et on ne réinstalle
      // pas un rayon dont on sait qu'il contredit l'objet.
      if (livres.length) {
        const retenu = await choisirParmiSuggestions(livres, {
          titre, genre: pf.genre as string | null, taille: pf.taille as string | null,
          marque: pf.marque as string | null, userId: (pf as Record<string, unknown>).__userId as string | null,
        }, (pf as Record<string, unknown>).__admin as SupabaseClient | undefined) ?? livres[0];
        return {
          id: retenu.id, chemin: retenu.chemin, source: "suggestion_livres_apres_confirmation",
          detail: `fiche « livres_medias » et mapping de l'app hors rayon Livres (« ${cheminMappe.join(" > ")} », ${mappee}) ; ` +
            `relance = rayon Livres d'eBay retenu « ${retenu.chemin.join(" > ")} » (${retenu.id})`,
          suggestions: resume,
        };
      }
      // Aucun rayon Livres proposé par eBay : on ne publie pas un livre dans
      // le rayon qu'on sait faux, et on ne boucle pas non plus. On redemande
      // UNE fois en le disant, avec le chemin complet.
      return {
        choix: autres.slice(0, 5).map((x) => ({ id: x.id, chemin: x.chemin.join(" > ") })),
        motif: `l'analyse photo classe cet article en Livres et médias, l'app l'a classé en « ${cheminMappe.join(" > ")} » (${mappee}), ` +
          `et eBay ne propose AUCUN rayon Livres pour ce titre — aucune catégorie sûre`,
        suggestions: resume,
        sansMapping: true,
      };
    }
    return { id: mappee, chemin: cheminMappe, source: dejaTrancheSource(pf), suggestions: resume };
  }
  if (top) {
    // Sans mapping, famille livres : la première suggestion du rayon Livres,
    // sinon needs_user — jamais un livre publié dans un autre rayon.
    if (famille === "livres_medias" && !LIVRES_RE.test(String(top.chemin[0] ?? ""))) {
      const livre = suggestions.find((x) => LIVRES_RE.test(String(x.chemin[0] ?? "")));
      if (livre) return { id: livre.id, chemin: livre.chemin, source: "suggestion_livres", detail: "famille Lens livres_medias : suggestion eBay du rayon Livres retenue", suggestions: resume };
      return { choix: suggestions.slice(0, 5).map((s) => ({ id: s.id, chemin: s.chemin.join(" > ") })), motif: "l'analyse photo classe cet article en Livres et médias, aucune suggestion eBay dans ce rayon", suggestions: resume };
    }
    const genre = String(pf.genre ?? "").trim();
    const re = GENRE_DANS_CHEMIN[genre];
    const cheminTexte = top.chemin.join(" > ");
    if (!genre || !re || re.test(cheminTexte)) return { id: top.id, chemin: top.chemin, source: "suggestion", suggestions: resume };
  }
  return { choix: suggestions.slice(0, 5).map((s) => ({ id: s.id, chemin: s.chemin.join(" > ") })), motif: "aucune catégorie eBay sur ce job et aucune suggestion eBay compatible avec le rayon", suggestions: resume };
}

// Mesure SANS publication (même esprit que mesure_aspects) : pour des articles
// en stock, le mapping icône du dernier job eBay + les suggestions eBay sur
// le titre → ce que la règle v2 déciderait. Aucune écriture.
async function mesurerCategories(admin: SupabaseClient, env: EbayEnv, body: { ebay_user_id?: string; limit?: number; inventaire_ids?: number[] }): Promise<Record<string, unknown>> {
  const { data: compte } = await admin.from("ebay_accounts").select("user_id").eq("ebay_user_id", String(body.ebay_user_id ?? "")).maybeSingle();
  if (!compte) return { error: "compte eBay inconnu" };
  const jeton = await obtenirAccessToken(admin, compte.user_id);
  if (!jeton.ok) return { error: `jeton : ${jeton.motif}` };
  let q = admin.from("inventaire").select("id, titre").eq("user_id", compte.user_id).eq("statut", "stock").order("created_at", { ascending: false });
  if (Array.isArray(body.inventaire_ids) && body.inventaire_ids.length) q = q.in("id", body.inventaire_ids);
  const { data: articles } = await q.limit(Math.min(30, Number(body.limit) || 10));
  const lignes: Record<string, unknown>[] = [];
  for (const a of (articles ?? []) as Array<{ id: number; titre: string }>) {
    const { data: job } = await admin.from("cross_post_jobs").select("platform_fields").eq("inventaire_id", a.id).eq("platform", "ebay").not("platform_fields->>ebayCategoryId", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const pfJob = (job?.platform_fields ?? {}) as PlatformFields;
    const pf: PlatformFields = { ebayCategoryId: pfJob.ebayCategoryId, ebayCategoryPath: pfJob.ebayCategoryPath as string[] | undefined, genre: pfJob.genre };
    const r = await resoudreCategorie(env, jeton.token, { title: a.titre }, pf);
    const mapping = pf.ebayCategoryId ? `${pf.ebayCategoryId} ${(pf.ebayCategoryPath ?? []).join(" > ")}` : null;
    if ("choix" in r) lignes.push({ id: a.id, titre: a.titre, mapping, verdict: mapping ? "needs_user (racine contestée)" : "needs_user (sans mapping)", motif: r.motif, suggestions: r.suggestions });
    else lignes.push({ id: a.id, titre: a.titre, mapping, verdict: r.source, categorie: `${r.id} ${r.chemin.join(" > ")}`, suggestions: r.suggestions });
  }
  return { articles: lignes.length, needs_user: lignes.filter((l) => String(l.verdict).startsWith("needs_user")).length, lignes };
}
// ── ÉTAPE 3 : L'IA CHOISIT PARMI LES SUGGESTIONS D'eBAY ────────────────────
// eBay ne rend pas UNE suggestion, il en rend jusqu'à cinq. Prendre la
// première, c'est remplacer une erreur grossière par une erreur discrète — et
// une erreur discrète ne se voit plus passer. Cas mesuré, chapka Obaibi
// (07/09) : eBay proposait dans l'ordre Pyjamas (260026), Déguisements (312),
// « Bébé : accessoires > Casquettes, chapeaux » (163224 — LA BONNE),
// Hauts/T-shirts (260031), « Garçon : accessoires > Chapeaux » (57884 — juste
// aussi). La bonne réponse était TROISIÈME.
//
// On délègue donc le choix à resolve-categorie, qui vérifie côté serveur que
// la réponse est bien l'une des candidates ENVOYÉES et rend la candidate
// D'ORIGINE — chemin et identifiant indissociables, jamais du texte régénéré.
// « Aucune » est une réponse légitime : on retombe alors sur le comportement
// d'avant (la n°1), qui reste meilleur que rien.
async function choisirParmiSuggestions(
  suggestions: Array<{ id: string; chemin: string[] }>,
  contexte: { titre: string; genre?: string | null; taille?: string | null; marque?: string | null; userId?: string | null },
  admin?: SupabaseClient,
): Promise<{ id: string; chemin: string[] } | null> {
  // Journal des REPLIS (point 2, instrumentation pure). Le repli est le point
  // noir : la n°1 d'eBay est fausse 4 fois sur 8 (mesuré), donc chaque repli
  // est une catégorie probablement fausse. On veut pouvoir les compter.
  const journaliser = async (motif: string) => {
    if (!admin) return;
    try {
      await admin.from("categorie_journal").insert({
        user_id: contexte.userId ?? null, plateforme: "ebay", etape: "repli",
        issue: "premiere_suggestion", motif, n_candidats: suggestions.length,
        choisi_id: suggestions[0]?.id ?? null,
        choisi_chemin: suggestions[0]?.chemin.join(" > ").slice(0, 300) ?? null,
        titre: String(contexte.titre ?? "").slice(0, 200),
      });
    } catch (e) { console.error("[ebay-api-worker] journal repli:", (e as Error)?.message); }
  };
  if (suggestions.length < 2) {
    if (suggestions.length === 1) await journaliser("suggestion_unique");
    return suggestions[0] ?? null;
  }
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/resolve-categorie`;
  const secret = Deno.env.get("CRON_SECRET") ?? "";
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": secret },
      body: JSON.stringify({
        titre: contexte.titre,
        user_id: contexte.userId ?? null,
        attributs: { genre: contexte.genre, taille: contexte.taille, marque: contexte.marque },
        candidats: {
          ebay: suggestions.slice(0, 10).map((s) => ({ chemin: s.chemin, id: s.id, source: "eBay" })),
        },
      }),
    });
    if (!r.ok) {
      console.warn(`[ebay-api-worker] resolve-categorie HTTP ${r.status}`);
      await journaliser("erreur"); return suggestions[0];
    }
    const data = await r.json() as { choix?: { ebay?: { chemin: string[]; id: string | null } } };
    const choisi = data.choix?.ebay;
    if (choisi?.id) return { id: String(choisi.id), chemin: choisi.chemin };
    // « aucune » : on garde la n°1 d'eBay — c'est le comportement d'avant, et
    // il vaut toujours mieux que pas de catégorie du tout.
    await journaliser("aucune");
    return suggestions[0];
  } catch (e) {
    console.warn("[ebay-api-worker] resolve-categorie injoignable :", e);
    await journaliser("ia_indisponible");
    return suggestions[0];
  }
}

// ── LE CHOIX APRÈS UN REFUS (2026-09-25) ────────────────────────────────────
// Même appel que choisirParmiSuggestions, avec la consigne « plus proche » de
// resolve-categorie (le rayon exact n'existe pas toujours : on prend le plus
// proche qui existe, jamais un rayon d'un autre type d'objet) — et SANS ses
// replis sur la n°1 d'eBay : après un refus, « aucune » veut dire « rien de
// sûr », et c'est la question qui suit. Une panne n'est pas une réponse :
// après une nouvelle tentative, c'est l'attente.
type IssueApresRefus = { issue: "choisi"; retenu: { id: string; chemin: string[] } } | { issue: "aucune" } | { issue: "panne" };
async function choisirApresRefus(
  suggestions: Array<{ id: string; chemin: string[] }>,
  contexte: { titre: string; genre?: string | null; taille?: string | null; marque?: string | null; userId?: string | null; rejeu?: boolean },
): Promise<IssueApresRefus> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/resolve-categorie`;
  const secret = Deno.env.get("CRON_SECRET") ?? "";
  for (let essai = 0; essai < 2; essai++) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": secret },
        body: JSON.stringify({
          titre: contexte.titre,
          user_id: contexte.userId ?? null,
          attributs: { genre: contexte.genre, taille: contexte.taille, marque: contexte.marque },
          candidats: { ebay: suggestions.slice(0, 10).map((s) => ({ chemin: s.chemin, id: s.id, source: "eBay" })) },
          consigne: "plus_proche",
          ...(contexte.rejeu ? { rejeu: true } : {}),
        }),
      });
      if (r.ok) {
        const data = await r.json() as { motif?: string; choix?: { ebay?: { id?: string | null } } };
        if (data?.motif !== "ia_indisponible") {
          // La candidate D'ORIGINE, retrouvée par son identifiant : jamais un
          // chemin recopié, et jamais autre chose que ce qu'on a envoyé.
          const id = data?.choix?.ebay?.id;
          const retenu = id ? suggestions.find((s) => String(s.id) === String(id)) : null;
          return retenu ? { issue: "choisi", retenu: { id: retenu.id, chemin: retenu.chemin } } : { issue: "aucune" };
        }
      } else {
        console.warn(`[ebay-api-worker] rayon après refus : resolve-categorie HTTP ${r.status}`);
      }
    } catch (e) {
      console.warn("[ebay-api-worker] rayon après refus : resolve-categorie injoignable :", (e as Error)?.message ?? e);
    }
    if (essai === 0) await new Promise((ok) => setTimeout(ok, 1500));
  }
  return { issue: "panne" };
}

// ══ RAYON AVEUGLE : LE SERVEUR RE-CHOISIT LE RAYON eBAY (2026-09-26) ═══════
// Jocabroc (Pro), job f89eb720, « mallette de toilette vintage ancienne avec
// nécessaire et miroir » : rayon 106315 « Kits de rasage et de toilette »,
// où eBay exige un « Type » à choisir parmi Bol à savon de rasage, Brosse à
// raser, Kit de coiffure… — aucune valeur ne décrit une mallette. On
// demandait à une cliente Pro de changer elle-même la catégorie : c'était
// notre travail (règle Nico : un Type qu'aucune valeur de la liste ne décrit
// clairement ne se DEVINE pas — on change de rayon).
// update-job-status marque ces jobs `needs_user_source = ebay_rayon_aveugle`
// (rayon posé par NOUS seulement : un choix humain ne se recalcule jamais) ;
// ici, au tick, on lit les suggestions d'eBay pour le titre de la FICHE, on
// retire les rayons déjà écartés, l'IA prend le plus PROCHE (consigne
// plus_proche de resolve-categorie, jamais un rayon d'un autre type
// d'objet), et le job repart en attente avec le nouveau rayon et SES aspects
// obligatoires. Si ce rayon bute encore, update-job-status l'écarte à son
// tour (2 essais) ; au-delà, ou sans rayon sûr, on pose la question, avec les
// suggestions d'eBay.
// Écriture gardée sur needs_user ; erreurs_archivees et republish_step
// conservés ; `dry_run` : rien n'est écrit, on rend ce qui serait fait.
async function recategoriserRayonsAveugles(admin: SupabaseClient, env: EbayEnv, opts: { job_id?: string; dry_run?: boolean } = {}): Promise<Record<string, unknown>> {
  let q = admin.from("cross_post_jobs")
    .select("id, user_id, inventaire_id, title, status, voie, error, platform_fields")
    .eq("platform", "ebay").eq("status", "needs_user");
  q = opts.job_id ? q.eq("id", opts.job_id)
    : q.eq("platform_fields->>needs_user_source", "ebay_rayon_aveugle").order("created_at", { ascending: true }).limit(5);
  const { data: jobs, error } = await q;
  if (error) return { erreur: error.message };
  if (!jobs?.length) return { traites: 0 };
  let token: string;
  try { token = await obtenirJetonApplicatif(env); }
  catch (e) { return { erreur: `jeton applicatif : ${String((e as Error)?.message ?? e)}` }; }
  const lignes: Record<string, unknown>[] = [];
  for (const j of jobs as Array<{ id: string; user_id: string; inventaire_id: number | null; title: string | null; status: string; voie: string; error: string | null; platform_fields: Record<string, unknown> | null }>) {
    const pf = { ...(j.platform_fields ?? {}) } as Record<string, unknown>;
    if (String(pf.categorie_source ?? "") === "choix_humain") { lignes.push({ job: j.id, issue: "ignore", motif: "rayon choisi à la main" }); continue; }
    const suivi = (pf.ebay_rayon_aveugle && typeof pf.ebay_rayon_aveugle === "object") ? pf.ebay_rayon_aveugle as Record<string, unknown> : {};
    const idActuel = String(pf.ebayCategoryId ?? "").trim();
    const exclus = [...new Set([...(Array.isArray(suivi.exclus) ? (suivi.exclus as unknown[]).map(String) : []), idActuel].filter(Boolean))];
    const inv = await lireInventaire(admin, j.inventaire_id);
    const titre = String(inv.titre || j.title || "").trim();
    const suggestions = await suggererCategories(env, token, titre);
    const cleActuelle = cleChemin(pf.ebayCategoryPath);
    const restantes = suggestions.filter((s) => !exclus.includes(String(s.id)) && cleChemin(s.chemin) !== cleActuelle);
    const issue: IssueApresRefus = restantes.length
      ? await choisirApresRefus(restantes, {
        titre, genre: pf.genre as string | null, taille: pf.taille as string | null,
        marque: pf.marque as string | null, userId: j.user_id, rejeu: opts.dry_run === true,
      })
      : { issue: "aucune" };
    const de = { id: idActuel || null, chemin: Array.isArray(pf.ebayCategoryPath) ? pf.ebayCategoryPath : null };
    if (issue.issue === "panne") { lignes.push({ job: j.id, issue: "attente", motif: "IA indisponible — repris au tick suivant" }); continue; }
    if (issue.issue === "choisi") {
      const asp = await aspectsCategorie(admin, env, token, issue.retenu.id);
      if ("erreur" in asp) { lignes.push({ job: j.id, issue: "attente", motif: `aspects du rayon ${issue.retenu.id} illisibles : ${asp.erreur}` }); continue; }
      const requis = asp.aspects.filter((a) => a.required).map((a) => a.name);
      const vers = { id: issue.retenu.id, chemin: issue.retenu.chemin };
      if (opts.dry_run) { lignes.push({ job: j.id, issue: "choisi", titre, de, vers, requis, suggestions: suggestions.map((s) => `${s.id} ${s.chemin.join(" > ")}`), exclus }); continue; }
      const pfN: Record<string, unknown> = { ...pf };
      for (const k of ["needsUserField", "needsUserFields", "needsUserBoucle", "needsUserAttempts", "needsUserResolved", "needs_user_source",
        "champs_a_completer", "categorie_preuve_aspects", "next_action_after", "error_technique", "processing_since",
        "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur"]) delete pfN[k];
      pfN.ebayCategoryId = vers.id;
      pfN.ebayCategoryPath = vers.chemin;
      pfN.ebayRequiredAspects = requis;
      pfN.categorie_source = "rayon_aveugle_serveur";
      pfN.ebay_rayon_aveugle = { ...suivi, exclus, dernier: { le: new Date().toISOString(), de, vers, requis, n_suggestions: suggestions.length, pose_par: "ebay-api-worker (rayon aveugle : suggestions eBay, IA plus_proche)" } };
      if (j.error) pfN.erreurs_archivees = archiverErreur(pfN.erreurs_archivees, j.error, "needs_user", "ebay-api-worker (rayon eBay re-choisi : aspects obligatoires aveugles)");
      const { data: maj, error: wErr } = await admin.from("cross_post_jobs")
        .update({ status: "pending", error: null, platform_fields: pfN })
        .eq("id", j.id).eq("status", "needs_user").select("id");
      lignes.push({ job: j.id, issue: (maj ?? []).length ? "rayon_change" : "non_ecrit", de, vers, requis, ...(wErr ? { erreur: wErr.message } : {}) });
      console.log(`[ebay-api-worker] rayon aveugle ${j.id.slice(0, 8)} : ${de.id} → ${vers.id} ${vers.chemin.join(" > ")} (requis : ${requis.join(", ") || "aucun"})${wErr ? ` — écriture refusée : ${wErr.message}` : ""}`);
      continue;
    }
    // Aucun rayon sûr : on pose la question, avec les vraies options d'eBay.
    const options = restantes.slice(0, 5).map((s) => s.chemin.join(" › "));
    if (opts.dry_run) { lignes.push({ job: j.id, issue: "question", titre, de, options, exclus }); continue; }
    const pfQ: Record<string, unknown> = { ...pf, needs_user_source: "ebay_rayon_a_choisir",
      ebay_rayon_aveugle: { ...suivi, exclus, epuise_le: new Date().toISOString(), options } };
    const message = `eBay ne propose pas de rayon sûr pour « ${titre} » : le rayon actuel exige des informations qui ne décrivent pas cet objet. ` +
      (options.length ? `Rayons possibles : ${options.join(" ; ")}. ` : "") +
      "Choisis la catégorie eBay depuis la fiche de l'article, puis relance : rien n'a été envoyé, rien n'a été décompté.";
    if (j.error && j.error !== message) pfQ.erreurs_archivees = archiverErreur(pfQ.erreurs_archivees, j.error, "needs_user", "ebay-api-worker (rayon aveugle : aucun rayon sûr)");
    await admin.from("cross_post_jobs").update({ error: message, platform_fields: pfQ }).eq("id", j.id).eq("status", "needs_user");
    lignes.push({ job: j.id, issue: "question", options });
  }
  return { traites: lignes.length, lignes };
}

// ── REJEU À BLANC DU RAYON REFUSÉ (2026-09-25) ──────────────────────────────
// Lecture seule. Pour des jobs eBay donnés : ce que resoudreCategorie décide
// AUJOURD'HUI d'un job qui partirait avec le rayon que l'app avait refusé —
// suggestions d'eBay lues avec le jeton APPLICATIF, IA appelée en `rejeu`
// (rien dans categorie_journal). Aucun job, aucune annonce, aucune écriture.
// Le mapping rejoué est le rayon refusé, tel que l'app l'avait laissé : le
// worker a pu réécrire le chemin du job depuis (c'est même ce qu'on mesure).
async function rejeuRayonRefuse(admin: SupabaseClient, env: EbayEnv, body: { ids?: string[] }): Promise<Record<string, unknown>> {
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).slice(0, 20);
  if (!ids.length) return { error: "ids requis" };
  const { data: jobs, error } = await admin.from("cross_post_jobs")
    .select("id, title, inventaire_id, status, voie, platform_fields").eq("platform", "ebay").in("id", ids);
  if (error) return { error: error.message };
  const token = await obtenirJetonApplicatif(env);
  const lignes: Record<string, unknown>[] = [];
  for (const j of (jobs ?? []) as Array<{ id: string; title: string; inventaire_id: number | null; status: string; voie: string | null; platform_fields: PlatformFields | null }>) {
    const pf0 = { ...(j.platform_fields ?? {}) } as Record<string, unknown>;
    const refuses = cheminsRefusesParLApp(pf0);
    if (!refuses.length) { lignes.push({ job: j.id, erreur: "aucun rayon refusé sur ce job" }); continue; }
    // L'identifiant du rayon refusé : celui du job s'il n'a pas été réécrit,
    // sinon celui que la preuve par les aspects a noté au départ de l'app.
    const memeChemin = cleChemin(pf0.ebayCategoryPath) === cleChemin(refuses[0]);
    const preuve = (pf0.categorie_preuve_aspects ?? null) as Record<string, unknown> | null;
    const idRefuse = memeChemin ? String(pf0.ebayCategoryId ?? "") : String(preuve?.categorie_id ?? "");
    const inv = await lireInventaire(admin, j.inventaire_id);
    const fam = (inv.attributs as Record<string, { v?: unknown }> | null)?.famille;
    const famille = fam && typeof fam === "object" ? String(fam.v ?? "") || null : null;
    const pf = { ...pf0, ebayCategoryPath: refuses[0], ebayCategoryId: idRefuse || "0", __rejeu: true } as PlatformFields;
    const r = await resoudreCategorie(env, token, { title: inv.titre || j.title }, pf, famille);
    lignes.push({
      job: j.id, statut: j.status, voie: j.voie, titre: inv.titre || j.title,
      rayon_refuse: refuses.map((c) => c.join(" > ")), id_refuse: idRefuse || null,
      rayon_du_job_aujourdhui: Array.isArray(pf0.ebayCategoryPath) ? (pf0.ebayCategoryPath as string[]).join(" > ") : null,
      decision: "choix" in r
        ? { issue: r.attente ? "attente" : "question", choix: r.choix, motif: r.motif }
        : { issue: "rayon", id: r.id, chemin: r.chemin.join(" > "), source: r.source, detail: r.detail ?? null },
      suggestions: r.suggestions.liste,
    });
  }
  return { n: lignes.length, lignes };
}

// ── RÉTRO-TEST SUR LE VRAI PÉRIMÈTRE (consigne Nico, 07/09 soir) ───────────
// Le premier rétro-test ne prouvait presque rien : 7 des 8 articles avaient un
// mot-objet dans leur titre, donc une source CERTAINE — le mécanisme ne les
// touche jamais en production, il avait fallu forcer l'arbitrage pour les
// voir. Ici on ne force RIEN : l'échantillon est construit avec la MÊME règle
// que la production.
//
// Entrent dans l'échantillon les articles pour lesquels, exactement :
//   · detectObjectIconKeyword ne trouve AUCUN mot-objet dans la source FR
//     (titre + description + marque de la FICHE — jamais le titre eBay, qui
//     est traduit en anglais) ;
//   · la famille Lens ne tranche pas (un `livres_medias` non-média a une
//     source certaine, cf. la règle « famille souveraine pour les livres »).
// C'est-à-dire : les articles qui, en production, partent sur l'icône de l'IA
// seule — les seuls que l'arbitrage traite.
//
// Les suggestions eBay sont lues avec le jeton APPLICATIF : elles ne dépendent
// d'aucun compte vendeur, ce qui permet de mesurer sur tout le parc et non sur
// les 18 jobs des 2 vendeurs ayant connecté eBay.
// Lecture seule : aucun job, aucune annonce, aucune écriture.
async function backtestCategorie(admin: SupabaseClient, env: EbayEnv, body: { limit?: number; scan?: number }): Promise<Record<string, unknown>> {
  const vise = Math.min(60, Number(body.limit) || 30);
  const aScanner = Math.min(600, Number(body.scan) || 400);
  const { data: jobs } = await admin.from("cross_post_jobs")
    .select("id, user_id, inventaire_id, title, status, platform_fields, created_at")
    .eq("platform", "ebay").eq("action", "publish")
    .not("platform_fields->>ebayCategoryId", "is", null)
    .order("created_at", { ascending: false }).limit(aScanner);

  const ids = [...new Set((jobs ?? []).map((j) => (j as { inventaire_id: number | null }).inventaire_id).filter((x): x is number => x != null))];
  const fiches = new Map<number, { titre: string; description: string | null; marque: string | null; famille: string | null }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from("inventaire")
      .select("id, titre, description, marque, attributs")
      .in("id", ids.slice(i, i + 200));
    for (const a of (data ?? []) as Array<{ id: number; titre: string; description: string | null; marque: string | null; attributs: AttributsInventaire | null }>) {
      const fam = (a.attributs as Record<string, { v?: unknown }> | null)?.famille;
      fiches.set(a.id, {
        titre: a.titre, description: a.description, marque: a.marque,
        famille: fam && typeof fam === "object" ? String((fam as { v?: unknown }).v ?? "") : null,
      });
    }
  }

  const token = await obtenirJetonApplicatif(env);
  const lignes: Record<string, unknown>[] = [];
  let ecartesMotObjet = 0, ecartesFamille = 0, sansFiche = 0, sansSuggestion = 0;
  let mieux = 0, identique = 0, moinsBien = 0;

  for (const brut of (jobs ?? []) as Array<{ id: string; user_id: string; inventaire_id: number | null; title: string; status: string; platform_fields: PlatformFields }>) {
    if (lignes.length >= vise) break;
    const fiche = brut.inventaire_id != null ? fiches.get(brut.inventaire_id) : null;
    if (!fiche) { sansFiche++; continue; }
    // MÊME règle que resolveArticleIconDetail, dans le même ordre.
    if (fiche.famille === "livres_medias" && !estSupportNonLivre(fiche.titre, fiche.description ?? "")) { ecartesFamille++; continue; }
    const motObjet = detectObjectIconKeyword(fiche.titre ?? "", `${fiche.description ?? ""} ${fiche.marque ?? ""}`);
    if (motObjet) { ecartesMotObjet++; continue; }

    const pf = brut.platform_fields ?? {};
    const partie = String(pf.ebayCategoryId ?? "");
    const cheminParti = Array.isArray(pf.ebayCategoryPath) ? (pf.ebayCategoryPath as string[]).join(" > ") : "";
    const sugg = await suggererCategories(env, token, brut.title ?? "");
    if (!sugg.length) {
      sansSuggestion++;
      lignes.push({ titre_fr: fiche.titre, titre_ebay: brut.title, partie: `${partie} ${cheminParti}`, suggestions: 0, verdict: "aucune suggestion eBay" });
      continue;
    }
    const retenu = await choisirParmiSuggestions(sugg, {
      titre: brut.title ?? "", genre: pf.genre as string | null,
      taille: pf.taille as string | null, marque: pf.marque as string | null, userId: brut.user_id,
    });
    const change = retenu?.id !== partie;
    if (!change) identique++;
    lignes.push({
      job: brut.id, statut: brut.status,
      titre_fr: fiche.titre, titre_ebay: brut.title,
      partie: `${partie} ${cheminParti}`,
      n1_ebay: `${sugg[0].id} ${sugg[0].chemin.join(" > ")}`,
      choix: retenu ? `${retenu.id} ${retenu.chemin.join(" > ")}` : null,
      suit_n1: retenu?.id === sugg[0].id,
      n_suggestions: sugg.length,
      change,
    });
  }
  return {
    echantillon: lignes.length,
    jobs_scannes: (jobs ?? []).length,
    ecartes_mot_objet: ecartesMotObjet,
    ecartes_famille_lens: ecartesFamille,
    sans_fiche: sansFiche,
    sans_suggestion_ebay: sansSuggestion,
    identiques: identique,
    changes: lignes.filter((l) => l.change === true).length,
    // « mieux / moins bien » ne se déduit pas d'un identifiant : c'est un
    // jugement, il est rendu à la lecture des lignes. On ne l'invente pas ici.
    mieux, moins_bien: moinsBien,
    lignes,
  };
}

// ── MOTS FRÉQUENTS DES ARTICLES SANS MOT-OBJET (point 3, Nico 07/09 soir) ──
// Chaque mot ajouté au dictionnaire = une source CERTAINE de plus = un
// arbitrage IA en moins. Pour savoir lesquels ajouter, il faut regarder les
// titres RÉELS des articles que le dictionnaire rate aujourd'hui.
// Même règle exacte que la production : on ne garde que les articles dont
// detectObjectIconKeyword ne trouve rien dans la source FR.
// Lecture seule, aucune écriture.
async function motsSansMotObjet(admin: SupabaseClient, body: { scan?: number }): Promise<Record<string, unknown>> {
  const aScanner = Math.min(20000, Number(body.scan) || 8000);
  const compte = new Map<string, { n: number; exemples: string[] }>();
  let articles = 0, avecMotObjet = 0, sansMotObjet = 0;
  const page = 1000;
  for (let d = 0; d < aScanner; d += page) {
    const { data } = await admin.from("inventaire")
      .select("titre, description, marque")
      .not("titre", "is", null)
      .order("created_at", { ascending: false })
      .range(d, d + page - 1);
    const lot = (data ?? []) as Array<{ titre: string; description: string | null; marque: string | null }>;
    if (!lot.length) break;
    for (const a of lot) {
      articles++;
      if (detectObjectIconKeyword(a.titre ?? "", `${a.description ?? ""} ${a.marque ?? ""}`)) { avecMotObjet++; continue; }
      sansMotObjet++;
      // Les mots du TITRE seulement : c'est lui qui nomme l'objet.
      const mots = String(a.titre ?? "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().replace(/[^a-z\s'-]/g, " ").split(/[\s'-]+/)
        .filter((m) => m.length >= 4 && !MOTS_VIDES_FR.has(m));
      for (const m of new Set(mots)) {
        const e = compte.get(m) ?? { n: 0, exemples: [] };
        e.n++;
        if (e.exemples.length < 3) e.exemples.push(String(a.titre).slice(0, 70));
        compte.set(m, e);
      }
    }
  }
  const tri = [...compte.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 120);
  return {
    articles_lus: articles, avec_mot_objet: avecMotObjet, sans_mot_objet: sansMotObjet,
    taux_sans_mot_objet: articles ? Math.round((sansMotObjet / articles) * 1000) / 10 : 0,
    mots: tri.map(([m, e]) => ({ mot: m, n: e.n, exemples: e.exemples })),
  };
}

// Mots de structure et qualificatifs : ils ne nomment jamais un objet.
const MOTS_VIDES_FR = new Set([
  "avec", "sans", "pour", "dans", "chez", "tres", "plus", "moins", "neuf", "neuve",
  "bon", "bonne", "etat", "taille", "pointure", "noir", "noire", "blanc", "blanche",
  "bleu", "bleue", "rouge", "vert", "verte", "gris", "grise", "rose", "jaune", "beige",
  "marron", "violet", "orange", "kaki", "creme", "ecru", "marine", "clair", "fonce",
  "grand", "grande", "petit", "petite", "long", "longue", "court", "courte",
  "vintage", "ancien", "ancienne", "retro", "occasion", "jamais", "porte", "portee",
  "femme", "homme", "fille", "garcon", "bebe", "enfant", "mixte", "unisexe",
  "coton", "laine", "cuir", "soie", "lin", "polyester", "acrylique", "velours",
  "motif", "motifs", "raye", "rayee", "fleuri", "fleurie", "imprime", "imprimee",
  "manche", "manches", "courtes", "longues", "capuche", "zippe", "zippee",
  "modele", "reference", "collection", "edition", "serie", "made", "france",
  "lot", "ensemble", "paire", "set", "pack", "double", "triple",
  "mois", "ans", "annee", "annees", "cm", "mm", "kit", "boite", "boites",
  "etiquette", "etiquettes", "originale", "original", "complet", "complete",
  "sublime", "magnifique", "superbe", "jolie", "beau", "belle", "chic", "style",
  "haute", "haut", "basse", "bas", "medium", "large", "small",
]);

function dejaTrancheSource(pf: PlatformFields): string {
  return (pf as Record<string, unknown>).ebayCategorieAttente ? "mapping_confirme_par_relance" : "mapping";
}

function contexteDuJob(job: Job, pf: PlatformFields) {
  return {
    titre: job.title, description: job.description, marque: pf.marque as string | null, modele: pf.modele as string | null,
    matiere: pf.matiere as string | null, couleur: (Array.isArray(pf.colors) && pf.colors[0]) ? String(pf.colors[0]) : (pf.couleur as string | null),
    taille: pf.taille as string | null, genre: pf.genre as string | null, type: (pf.objet as string | null) ?? null,
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
async function mesurerAspects(admin: SupabaseClient, env: EbayEnv, body: { ebay_user_id?: string; limit?: number; inventaire_ids?: number[]; ignorer_aspects_job?: boolean; ignorer_champs_job?: boolean; categorie_id?: string; chemin?: unknown[] }): Promise<Record<string, unknown>> {
  const ignorerAspects = body.ignorer_aspects_job !== false;
  const ignorerChamps = body.ignorer_champs_job === true;
  const { data: compte } = await admin.from("ebay_accounts").select("user_id").eq("ebay_user_id", String(body.ebay_user_id ?? "")).maybeSingle();
  if (!compte) return { error: "compte eBay inconnu" };
  const jeton = await obtenirAccessToken(admin, compte.user_id);
  if (!jeton.ok) return { error: `jeton : ${jeton.motif}` };
  const token = jeton.token;
  let q = admin.from("inventaire").select("id, titre, description, marque, type, statut, prix_vente, photos, attributs").eq("user_id", compte.user_id).eq("statut", "stock").order("created_at", { ascending: false });
  if (Array.isArray(body.inventaire_ids) && body.inventaire_ids.length) q = q.in("id", body.inventaire_ids);
  const { data: articles } = await q.limit(Math.min(30, Number(body.limit) || 10));
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const lignes: Record<string, unknown>[] = [];
  for (const a of (articles ?? []) as Array<{ id: number; titre: string; description: string | null; marque: string | null; type: string | null; prix_vente: number | null; photos: unknown; attributs: AttributsInventaire | null }>) {
    const photos = urlsPhotos(a.photos).length;
    // Catégorie : celle d'un job eBay existant (mapping icône de l'app), sinon suggestion eBay n°1.
    const { data: job } = await admin.from("cross_post_jobs").select("platform_fields").eq("inventaire_id", a.id).eq("platform", "ebay").not("platform_fields->>ebayCategoryId", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const pfJob = (job?.platform_fields ?? {}) as PlatformFields;
    let categorie = String(pfJob.ebayCategoryId ?? "");
    let categorieSource = categorie ? "job (mapping icône)" : "";
    let chemin: string[] = Array.isArray(pfJob.ebayCategoryPath) ? pfJob.ebayCategoryPath as string[] : [];
    // (03/10, point A) Mesure à blanc dans un AUTRE rayon (retrait +
    // republication d'un livre rangé hors des livres) : rien n'est écrit.
    if (/^\d+$/.test(String(body.categorie_id ?? ""))) {
      categorie = String(body.categorie_id);
      chemin = Array.isArray(body.chemin) ? body.chemin.map(String) : [];
      categorieSource = "demandée (mesure à blanc)";
    }
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
    // Lot 1 : la mesure lit inventaire.attributs comme le vrai chemin (sans
    // scan Lens — la mesure ne coûte rien et n'écrit rien).
    const enr = enrichirDepuisAttributs(pf, a.attributs);
    const pfE = enr.pf;
    // Même ceinture que publier() : un média n'est jamais traité en livre.
    pfE.support_non_livre = estSupportNonLivre(a.titre, a.description);
    ligne.attributs_utilises = enr.utilises;
    if (pfE.support_non_livre) ligne.support_non_livre = true;
    const rempli = await remplirAspects(pfE, cat.aspects, { titre: a.titre, description: a.description, marque: pfE.marque as string | null, modele: pfE.modele as string | null, matiere: pfE.matiere as string | null, type: (pfE.objet as string | null) ?? a.type, genre: pfE.genre as string | null, taille: pfE.taille as string | null, couleur: pfE.couleur as string | null, attributs: (pfE.attributs_visibles as Record<string, unknown> | null) ?? null }, apiKey);
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

// ── LE RETRAIT EST ADRESSÉ PAR L'ANNONCE, PAS PAR L'ARTICLE (2026-09-16) ────
// AVANT : `if (!job.inventaire_id) → failed « inventaire_absent »`, puis l'offre
// cherchée par le SKU fs-<inventaire_id>. Or le retrait armé par la suppression
// d'un article perd son inventaire_id à l'instant même où l'article disparaît :
// l'app insère le retrait PUIS supprime la ligne, et la FK
// cross_post_jobs_inventaire_id_fkey est en ON DELETE SET NULL. Bouilloire
// 820095628882, job 744b9553 : mort au contrôle deux minutes après, annonce
// restée en ligne. Le postulat « l'extension ne lit que platform +
// listing_url » ne valait pas pour la voie API.
// Ce qui SURVIT au SET NULL : l'identifiant de l'annonce (listing_url du
// retrait, platform_listing_id du job de publication) et
// platform_fields.ebay_api {listing_id, offer_id, sku} du job de publication.
// Les trois doivent former UNE preuve cohérente sur le même job API FillSell :
// aucun repli par article, dernier dépôt ou SKU n'est autorisé.
type JobPublicationApi = SourceRetraitEbay & {
  id: string;
  inventaire_id: number | null;
  platform_fields: Record<string, unknown> | null;
};

async function publicationApiExacte(
  admin: SupabaseClient,
  userId: string,
  listingId: string,
): Promise<JobPublicationApi | null> {
  if (!/^\d{9,}$/.test(listingId)) return null;
  const { data } = await admin.from("cross_post_jobs")
    .select("id, inventaire_id, action, status, voie, handler_build, listing_url, platform_listing_id, platform_fields")
    .eq("user_id", userId).eq("platform", "ebay").eq("voie", "api")
    .in("action", ["publish", "republish"]).in("status", ["published", "cancelled"])
    .eq("platform_listing_id", listingId)
    .order("created_at", { ascending: false }).limit(10);
  // Une fiche supprimée peut avoir passé son dépôt en `cancelled` tout en
  // laissant expressément l'annonce en ligne. Le statut ne choisit donc pas
  // la source : seule la preuve interne listing/offer/SKU cohérente le fait.
  // Deux sources cohérentes différentes restent ambiguës, donc abstention.
  const coherentes = ((data ?? []) as JobPublicationApi[]).filter((source) =>
    verifierSourceRetraitEbay(listingId, source, { statutsAutorises: ["published", "cancelled"] }).ok
  );
  return coherentes.length === 1 ? coherentes[0] : null;
}

async function publicationApiParId(
  admin: SupabaseClient,
  userId: string,
  jobId: string,
): Promise<JobPublicationApi | null> {
  if (!jobId) return null;
  const { data } = await admin.from("cross_post_jobs")
    .select("id, inventaire_id, action, status, voie, handler_build, listing_url, platform_listing_id, platform_fields")
    .eq("id", jobId).eq("user_id", userId).eq("platform", "ebay").eq("voie", "api")
    .in("action", ["publish", "republish"]).maybeSingle();
  return (data as JobPublicationApi | null) ?? null;
}

async function relireOffreExacte(
  env: EbayEnv,
  token: string,
  preuve: Extract<ReturnType<typeof verifierSourceRetraitEbay>, { ok: true }>,
  { accepterDejaRetiree = false }: { accepterDejaRetiree?: boolean } = {},
) {
  const lecture = await appelEbay(env, token, `/sell/inventory/v1/offer/${encodeURIComponent(preuve.offer_id)}`);
  if (lecture.http !== 200) return { ok: false as const, motif: "offre_api_illisible", lecture };
  const verdict = verifierOffreRetraitEbay(
    preuve,
    lecture.json as Parameters<typeof verifierOffreRetraitEbay>[1],
    { accepterDejaRetiree },
  );
  return verdict.ok
    ? { ok: true as const, lecture, verdict }
    : { ok: false as const, motif: verdict.motif, detail: verdict.detail, lecture };
}

async function annulerSourceEbayRetiree(
  admin: SupabaseClient,
  source: JobPublicationApi | null,
  withdrawnAt: string,
) {
  if (!source?.id) throw new Error("publication eBay source absente après retrait");
  if (String(source.status ?? "") === "cancelled") return;
  if (String(source.status ?? "") !== "published") {
    throw new Error(`publication eBay source dans un état inattendu (${String(source.status ?? "absent")})`);
  }
  const pfSource = { ...((source.platform_fields as Record<string, unknown>) ?? {}) };
  pfSource.ebay_api = {
    ...((pfSource.ebay_api as Record<string, unknown>) ?? {}),
    withdrawn_at: withdrawnAt,
  };
  const { data, error } = await admin.from("cross_post_jobs")
    .update({ status: "cancelled", error: MSG_RETRAIT, platform_fields: pfSource })
    .eq("id", source.id).eq("status", "published").select("id");
  if (error || !data?.length) {
    throw new Error(`publication eBay source non annulée${error?.message ? ` : ${error.message}` : ""}`);
  }
}

async function memoriserIntentionRetraitAvantRepublication(
  admin: SupabaseClient,
  job: Job,
  preuve: Extract<ReturnType<typeof verifierSourceRetraitEbay>, { ok: true }>,
  requestedAt: string,
) {
  const pf = {
    ...(job.platform_fields ?? {}),
    republish_step: "withdrawing",
    ebay_republish_withdrawal_intent: {
      source_job_id: preuve.source_job_id,
      listing_id: preuve.cible,
      offer_id: preuve.offer_id,
      sku: preuve.sku,
      requested_at: requestedAt,
    },
  };
  job.platform_fields = pf;
  const { data, error } = await admin.from("cross_post_jobs").update({ platform_fields: pf })
    .eq("id", job.id).eq("status", "processing").select("id");
  if (error || !data?.length) {
    throw new Error(`intention du retrait eBay non persistée${error?.message ? ` : ${error.message}` : ""}`);
  }
}

async function memoriserRetraitAvantRepublication(
  admin: SupabaseClient,
  job: Job,
  preuve: Extract<ReturnType<typeof verifierSourceRetraitEbay>, { ok: true }>,
  completedAt: string,
  methode: "withdraw_response" | "offer_unpublished_browse_no_sale",
) {
  const pf = {
    ...(job.platform_fields ?? {}),
    republish_step: "deleted",
    ebay_republish_withdrawal: {
      source_job_id: preuve.source_job_id,
      listing_id: preuve.cible,
      offer_id: preuve.offer_id,
      sku: preuve.sku,
      completed_at: completedAt,
      methode,
    },
  };
  job.platform_fields = pf;
  const { data, error } = await admin.from("cross_post_jobs").update({ platform_fields: pf })
    .eq("id", job.id).eq("status", "processing").select("id");
  if (error || !data?.length) {
    throw new Error(`preuve du retrait eBay non persistée${error?.message ? ` : ${error.message}` : ""}`);
  }
}

async function lireEtatHorsLigneAvantSuite(env: EbayEnv, listingId: string): Promise<EtatAnnonce> {
  try {
    const token = await obtenirJetonApplicatif(env);
    return await lireEtatAnnonceEbay(env, token, listingId);
  } catch (e) {
    return { verdict: "indetermine", motif: `jeton_applicatif:${String((e as Error)?.message ?? e).slice(0, 80)}`, limite: false };
  }
}

async function retirer(admin: SupabaseClient, env: EbayEnv, token: string, job: Job): Promise<Record<string, unknown>> {
  const idAnnonce = idAnnonceEbay(job);
  const precedent = idAnnonce ? await publicationApiExacte(admin, job.user_id, idAnnonce) : null;

  // ⛔ L'article et son SKU ne prouvent pas une annonce. Le job 8ce613d3
  // ciblait 377506248476, mais sa source a5d466df portait en interne
  // 377512032291 : l'ancien repli par source/SKU a retiré cette AUTRE offre.
  // Un import de relevé (89afc218) n'est pas davantage un dépôt API FillSell.
  const preuve = verifierSourceRetraitEbay(idAnnonce, precedent, { statutsAutorises: ["published", "cancelled"] });
  if (!preuve.ok) {
    const message = idAnnonce
      ? `Retrait eBay arrêté par FillSell avant tout appel : aucune publication API cohérente ne prouve exactement l'annonce ${idAnnonce}. L'annonce n'a pas été touchée.`
      : "Retrait eBay arrêté par FillSell avant tout appel : l'identifiant exact de l'annonce manque. Aucune annonce n'a été touchée.";
    await marquer(admin, job, { status: "failed", error: message }, {
      etape: "controle_identite", quoi: preuve.motif, annonce: idAnnonce || null,
      source_job_id: precedent?.id ?? null, detail: preuve.detail ?? null,
    });
    return { job: job.id, issue: "failed", motif: preuve.motif, annonce: idAnnonce || null };
  }

  // ── UNE ANNONCE D'UN AUTRE COMPTE eBay (03/10, point 21) ─────────────────
  // Le compte relié a changé depuis la publication (« Changer de compte
  // eBay ») : le jeton d'aujourd'hui ne peut pas retirer une annonce de
  // l'ancien compte — l'appel finissait en « identité de l'offre illisible »,
  // reporté en boucle, et l'annonce restait en vente sans que personne le
  // sache. On le dit, avec le geste qui marche (retirer depuis l'ancien
  // compte), sans appeler eBay.
  const autreCompte = await annonceDUnAutreCompte(admin, job.user_id, preuve.cible);
  if (autreCompte) {
    job.platform_fields = { ...(job.platform_fields ?? {}), needs_user_source: "ebay_annonce_autre_compte" };
    await marquer(admin, job, {
      status: "needs_user",
      error: `Cette annonce eBay est sur ton compte @${autreCompte.vendeur}, qui n'est plus celui relié à FillSell (@${autreCompte.relie}). ` +
        `Retire-la toi-même sur ebay.fr, connecté avec @${autreCompte.vendeur} : FillSell ne peut pas y toucher avec ton nouveau compte.`,
    }, { etape: "controle_compte", quoi: "annonce_autre_compte_ebay", annonce: preuve.cible, vendeur: autreCompte.vendeur, relie: autreCompte.relie });
    return { job: job.id, issue: "needs_user", motif: "annonce_autre_compte_ebay", annonce: preuve.cible };
  }

  // L'Inventory API expose `listing.listingId` sur GET /offer/{offerId}.
  // C'est la dernière preuve, relue immédiatement avant le geste destructif :
  // offre, SKU et listing doivent tous désigner la même publication.
  const controleOffre = await relireOffreExacte(env, token, preuve, { accepterDejaRetiree: true });
  if (!controleOffre.ok && controleOffre.motif === "offre_api_illisible") {
    const e = lireErreurEbay(controleOffre.lecture.json, controleOffre.lecture.texte);
    const status = verdictHttp(controleOffre.lecture.http, Number((job.platform_fields ?? {}).attempt_count ?? 0));
    await marquer(admin, job, { status, error: `Retrait eBay reporté : l'identité de l'offre n'a pas pu être relue (${controleOffre.lecture.http || "réseau"}). Aucune annonce n'a été touchée.` },
      { etape: "controle_offre", quoi: "offre_api_illisible", http: controleOffre.lecture.http, errorId: e.errorId, message: e.message },
      { offer_id: preuve.offer_id, sku: preuve.sku });
    return { job: job.id, issue: status, motif: "offre_api_illisible", http: controleOffre.lecture.http };
  }
  if (!controleOffre.ok) {
    const message = `Retrait eBay arrêté par FillSell : l'offre ${preuve.offer_id} ne désigne pas exactement l'annonce ${preuve.cible}. Aucune annonce n'a été touchée.`;
    await marquer(admin, job, { status: "failed", error: message }, {
      etape: "controle_offre", quoi: controleOffre.motif, annonce: preuve.cible,
      source_job_id: preuve.source_job_id, detail: controleOffre.detail ?? null,
    }, { offer_id: preuve.offer_id, sku: preuve.sku, listing_id: preuve.cible });
    return { job: job.id, issue: "failed", motif: controleOffre.motif, annonce: preuve.cible };
  }

  if (controleOffre.verdict.deja_retiree) {
    const etat = await lireEtatHorsLigneAvantSuite(env, preuve.cible);
    if (etat.verdict === "vendue") {
      await marquer(admin, job, { status: "cancelled", error: "Retrait eBay annulé : eBay confirme que cette annonce a été vendue. Aucune autre annonce n'a été touchée." },
        { etape: "controle_offre", quoi: "annonce_deja_vendue", source_job_id: preuve.source_job_id, fin: etat.fin, vendus: etat.vendus },
        { offer_id: preuve.offer_id, sku: preuve.sku, listing_id: preuve.cible });
      return { job: job.id, issue: "cancelled", motif: "annonce_deja_vendue", listing_id: preuve.cible };
    }
    if (etat.verdict !== "terminee_sans_vente" && etat.verdict !== "enchere_sans_acheteur") {
      await marquer(admin, job, { status: "pending", error: "Retrait eBay reporté : l'offre est hors ligne, mais FillSell ne peut pas encore prouver qu'elle n'a pas été vendue. Aucun autre geste n'est lancé." },
        { etape: "controle_offre", quoi: "offre_hors_ligne_indeterminee", source_job_id: preuve.source_job_id, etat },
        { offer_id: preuve.offer_id, sku: preuve.sku, listing_id: preuve.cible });
      return { job: job.id, issue: "pending", motif: "offre_hors_ligne_indeterminee", listing_id: preuve.cible };
    }
    const withdrawnAt = new Date().toISOString();
    await marquer(admin, job, { status: "deleted", error: null, platform_listing_id: preuve.cible },
      { etape: "retire", quoi: "offre_deja_hors_ligne_sans_vente", source_job_id: preuve.source_job_id, fin: etat.fin },
      { sku: preuve.sku, offer_id: preuve.offer_id, listing_id: preuve.cible, withdrawn_at: withdrawnAt });
    await annulerSourceEbayRetiree(admin, precedent, withdrawnAt);
    return { job: job.id, issue: "deleted", sku: preuve.sku, offer_id: preuve.offer_id, listing_id: preuve.cible, source: "offre_exacte_deja_hors_ligne_sans_vente" };
  }

  const offerId = preuve.offer_id;
  const sku = preuve.sku;
  const source = "annonce_exacte_et_offre_relue";
  const w = await appelEbay(env, token, `/sell/inventory/v1/offer/${offerId}/withdraw`, { method: "POST" });
  if (w.http !== 200) {
    const e = lireErreurEbay(w.json, w.texte);
    await marquer(admin, job, { status: "failed", error: messageRefus("le retrait", w.http, e).error }, { etape: "withdraw", http: w.http, errorId: e.errorId, message: e.message, source }, { sku, offer_id: offerId });
    return { job: job.id, issue: "withdraw", http: w.http, ebay: e };
  }
  const listingId = String((w.json as { listingId?: string } | null)?.listingId ?? "");
  if (listingId && listingId !== preuve.cible) {
    await marquer(admin, job, { status: "failed", error: `eBay a retiré une offre mais a renvoyé un identifiant inattendu (${listingId} au lieu de ${preuve.cible}). FillSell a arrêté la suite.` },
      { etape: "withdraw", quoi: "reponse_listing_contradictoire", attendu: preuve.cible, recu: listingId, source },
      { sku, offer_id: offerId, listing_id: listingId });
    return { job: job.id, issue: "failed", motif: "reponse_listing_contradictoire", listing_id: listingId };
  }
  const withdrawnAt = new Date().toISOString();
  await marquer(admin, job, { status: "deleted", error: null, platform_listing_id: preuve.cible }, { etape: "retire", http: 200, source, source_job_id: preuve.source_job_id }, { sku, offer_id: offerId, listing_id: preuve.cible, withdrawn_at: withdrawnAt });
  await annulerSourceEbayRetiree(admin, precedent, withdrawnAt);
  return { job: job.id, issue: "deleted", sku, offer_id: offerId, listing_id: preuve.cible, source };
}

// Republication par API = retrait de l'annonce en ligne (si elle l'est encore)
// puis nouvelle publication de la même offre → nouveau listingId. Le job porte
// republish_step comme la voie formulaire ('deleted' puis 'recreated') pour
// que la frise de l'app reste lisible.
async function republier(admin: SupabaseClient, env: EbayEnv, token: string, job: Job, passe?: Passe): Promise<Record<string, unknown>> {
  if (!job.inventaire_id) { await marquer(admin, job, { status: "failed", error: "Job de republication sans inventaire_id." }, { etape: "controle", quoi: "inventaire_absent" }); return { job: job.id, issue: "failed" }; }

  // Une fiche vendue/supprimée pendant une reprise ne doit jamais être remise
  // en ligne par un ancien job dont le retrait avait déjà abouti.
  const { data: article, error: articleErreur } = await admin.from("inventaire")
    .select("statut").eq("id", job.inventaire_id).eq("user_id", job.user_id).maybeSingle();
  if (articleErreur || !article) {
    await marquer(admin, job, { status: "failed", error: "Republication eBay arrêtée : la fiche source n'existe plus. Aucune annonce n'a été recréée." },
      { etape: "controle", quoi: "inventaire_absent_avant_recreation", detail: articleErreur?.message ?? null });
    return { job: job.id, issue: "failed", motif: "inventaire_absent_avant_recreation" };
  }
  if (String((article as { statut?: unknown }).statut ?? "").toLowerCase() !== "stock") {
    await marquer(admin, job, { status: "cancelled", error: "Republication eBay annulée : l'article n'est plus en stock. Aucune annonce n'a été recréée." },
      { etape: "controle", quoi: "article_plus_en_stock", statut: (article as { statut?: unknown }).statut ?? null });
    return { job: job.id, issue: "cancelled", motif: "article_plus_en_stock" };
  }

  const retraitMemorise = preuveRetraitRepublicationEbayMemorisee(job);
  if (retraitMemorise) {
    const sourceMemorisee = await publicationApiParId(admin, job.user_id, retraitMemorise.source_job_id);
    const sourceVerifiee = verifierSourceRetraitEbay(retraitMemorise.cible, sourceMemorisee, { statutsAutorises: ["published", "cancelled"] });
    const sourceConforme = sourceVerifiee.ok
      && sourceVerifiee.source_job_id === retraitMemorise.source_job_id
      && sourceVerifiee.offer_id === retraitMemorise.offer_id
      && sourceVerifiee.sku === retraitMemorise.sku;
    if (!sourceConforme) {
      await marquer(admin, job, { status: "failed", error: "Republication eBay arrêtée : la preuve mémorisée ne correspond plus exactement à sa publication source. Aucune annonce n'a été recréée." },
        { etape: "controle_preuve_retrait", quoi: "source_memorisee_contradictoire", source_job_id: retraitMemorise.source_job_id });
      return { job: job.id, issue: "failed", motif: "source_memorisee_contradictoire" };
    }
    try {
      await annulerSourceEbayRetiree(admin, sourceMemorisee, retraitMemorise.completed_at);
    } catch (e) {
      await marquer(admin, job, { status: "pending", error: "Le retrait eBay est acquis ; FillSell termine sa synchronisation avant de recréer l'annonce." },
        { etape: "synchronisation_source", quoi: "source_non_annulee", detail: String((e as Error)?.message ?? e).slice(0, 180) });
      return { job: job.id, issue: "pending", motif: "source_non_annulee" };
    }
    const res = await publier(admin, env, token, job, passe, { offerIdAttendu: retraitMemorise.offer_id });
    if (res.issue === "published") {
      const { data: apres } = await admin.from("cross_post_jobs").select("platform_fields").eq("id", job.id).maybeSingle();
      const pf = { ...((apres?.platform_fields as Record<string, unknown>) ?? {}), republish_step: "recreated" };
      await admin.from("cross_post_jobs").update({ platform_fields: pf }).eq("id", job.id);
    }
    return { ...res, republication: true, retiree_avant: true, reprise_apres_retrait: true };
  }
  // Une republication commence elle aussi par un geste destructif : elle passe
  // exactement la même preuve annonce → publication API → offerId/SKU relus.
  // Le SKU calculé depuis l'article ne choisit plus jamais l'offre à retirer.
  const intentionMemorisee = preuveIntentionRetraitRepublicationEbayMemorisee(job);
  const idAnnonce = idAnnonceEbay(job);
  const precedent = intentionMemorisee
    ? await publicationApiParId(admin, job.user_id, intentionMemorisee.source_job_id)
    : (idAnnonce ? await publicationApiExacte(admin, job.user_id, idAnnonce) : null);
  const preuve = verifierSourceRetraitEbay(idAnnonce, precedent, { statutsAutorises: ["published", "cancelled"] });
  const intentionConforme = !intentionMemorisee || (preuve.ok
    && intentionMemorisee.cible === preuve.cible
    && intentionMemorisee.source_job_id === preuve.source_job_id
    && intentionMemorisee.offer_id === preuve.offer_id
    && intentionMemorisee.sku === preuve.sku);
  if (!preuve.ok || !intentionConforme) {
    await marquer(admin, job, {
      status: "failed",
      error: idAnnonce
        ? `Republication eBay arrêtée avant retrait : aucune publication API cohérente ne prouve exactement l'annonce ${idAnnonce}. L'annonce est intacte.`
        : "Republication eBay arrêtée avant retrait : l'identifiant exact de l'annonce manque. L'annonce est intacte.",
    }, { etape: "controle_identite_avant_republication", quoi: preuve.ok ? "intention_memorisee_contradictoire" : preuve.motif, annonce: idAnnonce || null, source_job_id: precedent?.id ?? null, detail: preuve.ok ? null : (preuve.detail ?? null) });
    return { job: job.id, issue: "failed", motif: preuve.ok ? "intention_memorisee_contradictoire" : preuve.motif, annonce: idAnnonce || null };
  }
  const controleOffre = await relireOffreExacte(env, token, preuve, { accepterDejaRetiree: true });
  if (!controleOffre.ok) {
    const http = controleOffre.lecture.http;
    const e = lireErreurEbay(controleOffre.lecture.json, controleOffre.lecture.texte);
    const transitoire = controleOffre.motif === "offre_api_illisible";
    const status = transitoire ? verdictHttp(http, Number((job.platform_fields ?? {}).attempt_count ?? 0)) : "failed";
    await marquer(admin, job, { status, error: transitoire
      ? `Republication eBay reportée : l'identité de l'offre n'a pas pu être relue (${http || "réseau"}). L'annonce est intacte.`
      : `Republication eBay arrêtée : l'offre ${preuve.offer_id} ne désigne pas exactement l'annonce ${preuve.cible}. L'annonce est intacte.` },
    { etape: "controle_offre_avant_republication", quoi: controleOffre.motif, http, errorId: e.errorId, message: e.message, detail: controleOffre.detail ?? null },
    { offer_id: preuve.offer_id, sku: preuve.sku, listing_id: preuve.cible });
    return { job: job.id, issue: status, motif: controleOffre.motif, http };
  }
  const sku = preuve.sku;
  const offerId = preuve.offer_id;
  let completedAt = new Date().toISOString();
  let methode: "withdraw_response" | "offer_unpublished_browse_no_sale";
  if (controleOffre.verdict.deja_retiree) {
    const etat = await lireEtatHorsLigneAvantSuite(env, preuve.cible);
    if (etat.verdict === "vendue") {
      await marquer(admin, job, { status: "cancelled", error: "Republication eBay annulée : eBay confirme que l'annonce précédente a été vendue. Aucune annonce n'a été recréée." },
        { etape: "controle_vente_avant_recreation", quoi: "annonce_deja_vendue", fin: etat.fin, vendus: etat.vendus },
        { sku, offer_id: offerId, listing_id: preuve.cible });
      return { job: job.id, issue: "cancelled", motif: "annonce_deja_vendue", listing_id: preuve.cible };
    }
    if (etat.verdict !== "terminee_sans_vente" && etat.verdict !== "enchere_sans_acheteur") {
      await marquer(admin, job, { status: "pending", error: "Republication eBay reportée : l'offre est hors ligne, mais FillSell ne peut pas encore prouver qu'elle n'a pas été vendue. Aucune annonce n'est recréée." },
        { etape: "controle_vente_avant_recreation", quoi: "offre_hors_ligne_indeterminee", etat },
        { sku, offer_id: offerId, listing_id: preuve.cible });
      return { job: job.id, issue: "pending", motif: "offre_hors_ligne_indeterminee", listing_id: preuve.cible };
    }
    completedAt = new Date().toISOString();
    methode = "offer_unpublished_browse_no_sale";
  } else {
    if (!intentionMemorisee) {
      await memoriserIntentionRetraitAvantRepublication(admin, job, preuve, new Date().toISOString());
    }
    const w = await appelEbay(env, token, `/sell/inventory/v1/offer/${offerId}/withdraw`, { method: "POST" });
    if (w.http !== 200) {
      const e = lireErreurEbay(w.json, w.texte);
      await marquer(admin, job, { status: "failed", error: messageRefus("le retrait avant republication", w.http, e).error }, { etape: "withdraw", http: w.http, errorId: e.errorId }, { sku, offer_id: offerId, listing_id: preuve.cible });
      return { job: job.id, issue: "withdraw", http: w.http, ebay: e };
    }
    const listingId = String((w.json as { listingId?: string } | null)?.listingId ?? "");
    if (listingId && listingId !== preuve.cible) {
      await marquer(admin, job, { status: "failed", error: `eBay a retiré une offre mais a renvoyé un identifiant inattendu (${listingId} au lieu de ${preuve.cible}). FillSell n'a pas recréé l'annonce.` },
        { etape: "withdraw", quoi: "reponse_listing_contradictoire", attendu: preuve.cible, recu: listingId },
        { sku, offer_id: offerId, listing_id: listingId });
      return { job: job.id, issue: "failed", motif: "reponse_listing_contradictoire", listing_id: listingId };
    }
    completedAt = new Date().toISOString();
    methode = "withdraw_response";
  }
  await memoriserRetraitAvantRepublication(admin, job, preuve, completedAt, methode);
  try {
    await annulerSourceEbayRetiree(admin, precedent, completedAt);
  } catch (e) {
    await marquer(admin, job, { status: "pending", error: "Le retrait eBay est acquis ; FillSell termine sa synchronisation avant de recréer l'annonce." },
      { etape: "synchronisation_source", quoi: "source_non_annulee", detail: String((e as Error)?.message ?? e).slice(0, 180) });
    return { job: job.id, issue: "pending", motif: "source_non_annulee" };
  }
  const res = await publier(admin, env, token, job, passe, { offerIdAttendu: offerId });
  if (res.issue === "published") {
    const { data: apres } = await admin.from("cross_post_jobs").select("platform_fields").eq("id", job.id).maybeSingle();
    const pf = { ...((apres?.platform_fields as Record<string, unknown>) ?? {}), republish_step: "recreated" };
    await admin.from("cross_post_jobs").update({ platform_fields: pf }).eq("id", job.id);
  }
  return { ...res, republication: true, retiree_avant: true };
}

// ── Mesure SANS écriture (Nico, 06/09 soir, avant tout chantier « détection
// des ventes ») : pour une liste d'identifiants d'annonces eBay, l'état réel
// côté eBay via l'API Browse (jeton applicatif, aucun jeton vendeur, aucune
// écriture). 200 = annonce vivante (itemEndDate, disponibilité) ; erreur
// 11001 = introuvable = terminée (vendue, retirée ou expirée). Browse ne dit
// pas POURQUOI ni QUAND une annonce a pris fin.
async function mesurerAnnonces(env: EbayEnv, body: { ids?: string[] }): Promise<Record<string, unknown>> {
  const ids = (Array.isArray(body.ids) ? body.ids : []).map((x) => String(x).trim()).filter((x) => /^\d{9,15}$/.test(x)).slice(0, 200);
  let token: string;
  try { token = await obtenirJetonApplicatif(env); } catch (e) { return { error: String((e as Error)?.message ?? e) }; }
  const lignes: Record<string, unknown>[] = [];
  for (const id of ids) {
    try {
      const r = await fetch(`${hotes(env).api}/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${id}`, {
        headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE, Accept: "application/json" },
      });
      const j = await r.json().catch(() => ({})) as Record<string, unknown>;
      if (r.status === 200) {
        const dispo = (j.estimatedAvailabilities as Array<Record<string, unknown>> | undefined)?.[0] ?? {};
        // (03/10, point A) Ce qu'il faut savoir AVANT de retirer une annonce :
        // format (enchère ?), offres possibles (BEST_OFFER), enchères en cours,
        // rayon et état — lus chez eBay, jamais supposés.
        lignes.push({ id, http: 200, etat: "vivante", item_id: j.itemId ?? null, fin: j.itemEndDate ?? null, disponibilite: dispo.estimatedAvailabilityStatus ?? null, quantite_restante: dispo.estimatedAvailableQuantity ?? null, vendus: dispo.estimatedSoldQuantity ?? null, prix: (j.price as Record<string, unknown> | undefined)?.value ?? null, titre: String(j.title ?? "").slice(0, 80), vendeur: (j.seller as Record<string, unknown> | undefined)?.username ?? null,
          formats: Array.isArray(j.buyingOptions) ? j.buyingOptions : null, encheres: j.bidCount ?? null, categorie: j.categoryId ?? null, chemin: j.categoryPath ?? null, etat_article: j.condition ?? null });
      } else {
        const err = (j.errors as Array<Record<string, unknown>> | undefined)?.[0] ?? {};
        lignes.push({ id, http: r.status, etat: r.status === 404 ? "terminee" : "indeterminee", errorId: err.errorId ?? null, message: String(err.message ?? "").slice(0, 160) });
      }
    } catch (e) {
      lignes.push({ id, http: 0, etat: "indeterminee", message: String((e as Error)?.message ?? e).slice(0, 160) });
    }
  }
  return { demandees: ids.length, vivantes: lignes.filter((l) => l.etat === "vivante").length, terminees: lignes.filter((l) => l.etat === "terminee").length, indeterminees: lignes.filter((l) => l.etat === "indeterminee").length, lignes };
}

// ═══════════════════════════════════════════════════════════════════════════
// VEILLEUR DE VENTE eBAY (2026-09-19, GO Nico) — LA PREUVE, JAMAIS L'ABSENCE
// ═══════════════════════════════════════════════════════════════════════════
// CE QUI MANQUAIT. La détection de vente eBay ne reposait que sur la
// DISPARITION d'une annonce de « Annonces actives », relevée par l'extension
// — donc sur un PC allumé, à la cadence du relevé (20 h). Et une disparition
// n'écrit RIEN d'exploitable : `sale_signal` n'était posé que par la sync du
// dressing Vinted. Mesuré sur 7 jours : 157 annonces eBay suivies, UNE seule
// disparition détectée… et l'API eBay dit qu'elle n'était PAS vendue
// (vendus 0, terminée). Nombre de ventes eBay détectées : ZÉRO.
//
// CE QUE ÇA COÛTE. Le « Lot de 24 DVD » d'ornellaracano (307173381042) est
// vendu sur eBay le 18/09 à 17:36:26Z. Il est resté en vente sur Vinted,
// Leboncoin, Beebs et Opla jusqu'au lendemain matin. C'est une double vente,
// un acheteur déçu, et la réputation du vendeur.
//
// LA PREUVE POSITIVE EXISTE ET NE COÛTE AUCUN CONSENTEMENT. L'API Browse rend
// pour chaque annonce `itemEndDate`, `estimatedSoldQuantity` et
// `estimatedAvailabilityStatus`, avec le jeton APPLICATIF (aucun jeton
// vendeur). Relevé en direct le 19/09 sur cinq annonces réelles :
//   307173381042  fin 18/09 17:36Z · vendus 1 · OUT_OF_STOCK  → VENDUE
//   307166104821  fin 18/09 15:53Z · vendus 0 · IN_STOCK      → terminée SANS vente
//   377487844090  fin 18/09 18:05Z · vendus 0 · IN_STOCK      → terminée SANS vente
//   307186101770  pas de fin       · vendus 0 · IN_STOCK      → vivante
//   307166306512  pas de fin       · vendus 0 · IN_STOCK      → vivante
// Les trois états se distinguent sans ambiguïté. C'est cette table-là qui
// décide, et elle seule.
//
// ⛔ RÈGLES, AUCUNE NÉGOCIABLE :
//  · JAMAIS une vente sur une absence. Un 404, un 11001, un 429, une panne
//    réseau, une réponse illisible → INDÉTERMINÉ, on n'écrit rien. C'est la
//    leçon payée sur Leboncoin le 18/09 (annonces vivantes déclarées
//    disparues parce qu'elles sortaient des 30 premières).
//  · ON POSE UN DRAPEAU, ON N'ACTE RIEN. Exactement ce que la sync Vinted
//    écrit depuis la 0.5.4 : `unavailable_since` + `sale_signal='sold'` +
//    `detected_price`. Le bandeau de l'app, le clic, puis
//    check-listing-status → orchestrateSale font le reste (vente, marge,
//    frères annulés, pending_removal). ⚠️ On n'écrit VOLONTAIREMENT pas
//    `sold_at` : il n'est écrit nulle part ailleurs qu'avec `status='sold'`
//    (_shared/sale-orchestration.ts) — le poser seul créerait un demi-état
//    que personne ne lit, et le poser avec le statut court-circuiterait la
//    confirmation de la vendeuse et le calcul de marge. La date réelle de fin
//    rendue par eBay n'est pas perdue pour autant : elle est gardée dans
//    `vente_ebay`.
//  · IDEMPOTENCE, trois verrous : (1) un job qui porte déjà `sale_signal` est
//    sauté — le signal de l'extension n'est jamais doublé ni réécrit ; (2) un
//    job qui porte déjà `unavailable_since` est sauté — son horodatage
//    d'origine est conservé, même règle que la sync Vinted ; (3) un article
//    déjà `statut='vendu'` en base est sauté — aucune chaîne de retrait n'est
//    rejouée après coup.
//  · UN VEILLEUR COUPÉ SE TAIT. Au premier 429 (ou 5xx) d'eBay, la passe
//    s'arrête net : les jobs restants ne sont même pas horodatés, ils
//    repasseront au tick suivant.
//
// BUDGET D'APPELS, chiffré au volume RÉEL du 19/09 : 210 annonces eBay
// publiées avec identifiant sur 29 comptes, dont 19 déjà signalées → ~191
// sous veille. À une visite toutes les 2 h, cela fait 191 × 12 ≈ 2 300 appels
// Browse par jour, et au plus 25 par passe du cron (toutes les 2 min).
// ⚠️ LE CHIFFRE À SURVEILLER : le total quotidien croît LINÉAIREMENT avec le
// parc (N × 12). Au-delà d'environ 400 annonces sous veille, allonger
// VEILLE_CADENCE_MS avant d'ajouter des comptes — pas après.
// ⚠️ 01/10 (lot point 1) : 1 594 annonces sous veille. La lecture était bornée à
// 500 lignes SANS ORDRE : toujours à peu près les mêmes, visitées par paquets
// de 25 lectures à la suite (passes de 12 à 20 s, 17 % des passes > 5 s
// mesurées sur 350 passes du 30/09–01/10), et 457 annonces JAMAIS visitées.
// Désormais : les annonces « Plus en ligne ? » d'abord, puis jamais visitées,
// puis les plus anciennes ; lectures en parallèle (6), BUDGET DE TEMPS (1 s)
// et écritures en parallèle : une passe ne dépend plus du nombre d'annonces.
const VEILLE_CADENCE_MS = 6 * 3600_000;  // une visite par annonce toutes les 6 h
const VEILLE_LOT_MAX = 12;               // annonces préparées par passe
const VEILLE_CANDIDATS_MAX = 500;        // borne de lecture, les plus anciennes d'abord
const VEILLE_PARALLELE = 6;
const VEILLE_BUDGET_MS = 1_000;
// Ventes enregistrées par la voie normale (orchestrateSale) au plus par passe.
const VENTES_AUTO_PAR_PASSE = 3;

type JobVeille = {
  id: string; user_id: string; inventaire_id: number | null;
  platform_listing_id: string | null; price: number | null;
  platform_fields: Record<string, unknown> | null;
};

/** L'état d'une annonce chez eBay. `indetermine` n'écrit JAMAIS rien.
 *  (09/10, Marta) Le verdict vient de `verdictAnnonceEbay` (_shared/ebay-etat-annonce.js) :
 *  une date de fin FUTURE est une annonce vivante (enchère en cours), une enchère
 *  terminée sans acheteur n'est jamais une vente ni une question « Vendue ? ». */
type FormatEbay = "AUCTION" | "FIXED_PRICE" | null;
type EtatAnnonce =
  | { verdict: "vendue"; fin: string | null; vendus: number; prix: number | null; sans_fin?: boolean; format?: FormatEbay; encheres?: number | null }
  | { verdict: "terminee_sans_vente"; fin: string; format?: FormatEbay }
  | { verdict: "enchere_sans_acheteur"; fin: string; format: FormatEbay; encheres: number | null }
  | { verdict: "vivante"; quantite: QuantiteEbay; format?: FormatEbay; fin?: string | null; encheres?: number | null }
  | { verdict: "indetermine"; motif: string; limite: boolean; format?: FormatEbay };

/** La quantité affichée par eBay. `exacte` = un nombre, pas un seuil « plus de N ». */
type QuantiteEbay = { disponible: number | null; vendus: number | null; exacte: boolean };

function lireQuantiteEbay(dispo: Record<string, unknown>): QuantiteEbay {
  return lireQuantiteEbayPur(dispo) as QuantiteEbay;
}

async function lireEtatAnnonceEbay(env: EbayEnv, token: string, id: string): Promise<EtatAnnonce> {
  let r: Response;
  try {
    r = await fetch(`${hotes(env).api}/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE, Accept: "application/json" },
    });
  } catch (e) {
    return { verdict: "indetermine", motif: `reseau:${String((e as Error)?.message ?? e).slice(0, 80)}`, limite: false };
  }
  // 429 = quota, 5xx = eBay en peine : on ne conclut pas, ET on arrête la passe.
  if (r.status === 429 || r.status >= 500) return { verdict: "indetermine", motif: `http_${r.status}`, limite: true };
  const j = await r.json().catch(() => null) as Record<string, unknown> | null;
  if (r.status !== 200 || !j) {
    // 404 / 11001 = annonce introuvable. eBay ne dit ni pourquoi ni quand :
    // vendue, retirée ou expirée sont indiscernables ici. On n'écrit rien.
    return { verdict: "indetermine", motif: `http_${r.status}`, limite: false };
  }
  // ── 0 DISPONIBLE + AU MOINS 1 VENDU = VENDU (01/10, décision Nico) ──────
  // Avec ou sans date de fin : une annonce « à durée illimitée » épuisée reste
  // en ligne à 0 disponible, sans fin. Les deux conditions, toujours réunies :
  //   · au moins un exemplaire VENDU sur eBay (estimatedSoldQuantity ≥ 1) ;
  //   · plus RIEN de disponible (OUT_OF_STOCK, ou quantité exacte 0).
  // ⛔ 0 disponible SANS aucune vente n'est pas une vente (rupture posée par la
  //    personne) ; une annonce multi-quantité dont il reste des pièces n'est
  //    pas vendue en entier.
  // ⛔ (09/10, Marta) Une date de fin n'est PAS une fin : elle est comparée à
  //    maintenant. Une enchère en cours (fin future) est VIVANTE ; une enchère
  //    terminée sans acheteur n'est ni une vente ni une question.
  return verdictAnnonceEbay(j, Date.now()) as EtatAnnonce;
}

// ═══════════════════════════════════════════════════════════════════════════
// LA QUANTITÉ D'UNE FICHE IMPORTÉE VIENT D'eBAY (01/10, lot point 7)
// ═══════════════════════════════════════════════════════════════════════════
// xxewwer : « Bravely Default II » importé d'eBay le 19/09 à 1 exemplaire — le
// relevé du Hub ne lit pas la quantité, l'import écrit 1 par défaut — alors
// qu'eBay affiche « 2 disponibles ». Vendu une fois sur Vinted, la fiche tombe
// à 0 et un retrait eBay est armé sur l'exemplaire qui lui reste (refusé par
// la garde, à raison).
// LA RÈGLE : une fiche NÉE d'un import eBay (rattachement.import, origine
// releve_ebay, créée avec le job, depuis la mise en service, moins de 7 j),
// toujours en stock à 1, sans vente, prend la quantité EXACTE affichée par eBay
// (Browse : estimatedAvailableQuantity sans seuil « plus de N ») si elle est
// ≥ 2. Jamais un seuil, jamais une estimation. Les fiches existantes ne sont
// pas touchées ici (liste et correction sur décision).
// ⛔ LATENCE (01/10) : deux essais de veille élargie ont porté la passe du cron
//    de ~1 s à 4-19 s ; retirés. Ici : seulement les imports NEUFS, 2 lectures
//    au plus par passe, en parallèle, abandonnées à 1,5 s. Sans import neuf :
//    une seule lecture de base, aucun appel eBay.
const QUANTITE_IMPORT_DEPUIS = "2026-10-01T09:00:00Z";
const QUANTITE_IMPORT_PAR_PASSE = 2;
const QUANTITE_IMPORT_DELAI_MS = 1_500;

async function quantitesImportsEbay(admin: SupabaseClient, env: EbayEnv): Promise<Record<string, unknown>> {
  const depuis = new Date(Math.max(Date.parse(QUANTITE_IMPORT_DEPUIS), Date.now() - 7 * 24 * 3600_000)).toISOString();
  const { data: jobs, error } = await admin.from("cross_post_jobs")
    .select("id, inventaire_id, platform_listing_id, platform_fields, created_at")
    .eq("platform", "ebay").eq("status", "published").eq("action", "publish")
    .eq("platform_fields->rattachement->>import", "true")
    .is("platform_fields->quantite_ebay", null)
    .gte("created_at", depuis)
    .not("platform_listing_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(QUANTITE_IMPORT_PAR_PASSE);
  if (error) return { erreur: error.message };
  const lot = ((jobs ?? []) as Array<{ id: string; inventaire_id: number | null; platform_listing_id: string; platform_fields: Record<string, unknown> | null; created_at: string }>)
    .filter((j) => /^\d{9,15}$/.test(String(j.platform_listing_id)) && j.inventaire_id != null);
  if (!lot.length) return { lues: 0 };
  const token = await obtenirJetonApplicatif(env);
  const lire = async (id: string): Promise<{ disponible: number | null; vendus: number | null; exacte: boolean; terminee?: boolean } | null> => {
    const ctl = new AbortController();
    const minuteur = setTimeout(() => ctl.abort(), QUANTITE_IMPORT_DELAI_MS);
    try {
      const r = await fetch(`${hotes(env).api}/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE, Accept: "application/json" },
        signal: ctl.signal,
      });
      if (r.status !== 200) return null;
      const j = await r.json().catch(() => null) as Record<string, unknown> | null;
      if (!j) return null;
      // (09/10) Une date de fin FUTURE (enchère en cours, annonce à durée fixe)
      // est une annonce vivante : sa quantité se lit. Une annonce TERMINÉE est
      // notée lue (`terminee`) — avant, elle restait vide et reprise à chaque
      // passe : deux enchères importées le 04/10 tenaient les deux places de la
      // file, plus aucune quantité n'était lue pour personne.
      const fin = typeof j.itemEndDate === "string" && j.itemEndDate ? Date.parse(j.itemEndDate) : null;
      const dispo = (j.estimatedAvailabilities as Array<Record<string, unknown>> | undefined)?.[0] ?? {};
      const q = lireQuantiteEbay(dispo);
      if (fin != null && !Number.isFinite(fin)) return null;   // fin illisible : on repassera
      if (fin != null && fin <= Date.now()) return { disponible: null, vendus: q.vendus, exacte: false, terminee: true };
      return q;
    } catch { return null; } finally { clearTimeout(minuteur); }
  };
  const lus = await Promise.all(lot.map((j) => lire(String(j.platform_listing_id))));
  const { data: fiches } = await admin.from("inventaire")
    .select("id, statut, quantite, origine, created_at, fusionne_dans").in("id", lot.map((j) => j.inventaire_id as number));
  const ficheDe = new Map(((fiches ?? []) as Array<{ id: number; statut: string; quantite: number; origine: string | null; created_at: string; fusionne_dans: number | null }>).map((f) => [f.id, f]));
  const { data: vts } = await admin.from("ventes").select("inventaire_id").in("inventaire_id", lot.map((j) => j.inventaire_id as number));
  const vendues = new Set(((vts ?? []) as Array<{ inventaire_id: number }>).map((v) => v.inventaire_id));
  let posees = 0;
  await Promise.all(lot.map(async (job, k) => {
    const q = lus[k];
    if (!q) return;   // illisible ou délai : on repassera (quantite_ebay toujours vide)
    const pf: Record<string, unknown> = { ...(job.platform_fields ?? {}), quantite_ebay: { ...q, vu_le: new Date().toISOString() } };
    const f = ficheDe.get(job.inventaire_id as number);
    const nee = Date.parse(String(f?.created_at ?? ""));
    if (f && q.exacte && q.disponible != null && q.disponible >= 2 && f.origine === "releve_ebay" && f.statut === "stock"
        && Number(f.quantite) === 1 && f.fusionne_dans == null && !vendues.has(f.id)
        && Number.isFinite(nee) && Math.abs(nee - Date.parse(job.created_at)) <= 10 * 60_000) {
      const { data: maj } = await admin.from("inventaire")
        .update({ quantite: q.disponible }).eq("id", f.id).eq("quantite", 1).eq("statut", "stock").select("id");
      if (maj?.length) {
        posees++;
        pf.quantite_ebay = { ...(pf.quantite_ebay as Record<string, unknown>), posee_sur_fiche: f.id };
        console.log(`[ebay-api-worker] import ${job.platform_listing_id} : eBay affiche ${q.disponible} disponibles → fiche ${f.id} à ${q.disponible} (au lieu de 1 par défaut)`);
      }
    }
    await admin.from("cross_post_jobs").update({ platform_fields: pf }).eq("id", job.id).eq("status", "published");
  }));
  return { lues: lus.filter(Boolean).length, posees };
}

async function veillerVentesEbay(admin: SupabaseClient, env: EbayEnv): Promise<Record<string, unknown>> {
  const sel = "id, user_id, inventaire_id, platform_listing_id, price, platform_fields";
  const base = () => admin.from("cross_post_jobs").select(sel)
    .eq("platform", "ebay").eq("status", "published")
    .in("action", ["publish", "republish"])
    .not("platform_listing_id", "is", null);
  // (01/10) D'abord les annonces que l'extension a vues partir (« Plus en
  // ligne ? ») ou déjà dites vendues par eBay mais pas encore enregistrées :
  // c'est là qu'une vente attend. Puis jamais visitées, puis les plus anciennes.
  // (09/10, Marta) Puis, AVANT tout le reste, les « Plus en ligne — Vendue ? »
  // que ce veilleur a posés lui-même sur une annonce dont la date de fin était
  // encore à venir (enchère en cours) : ils sont relus tout de suite, et levés.
  const [{ data: avantFin }, { data: signalees }, { data: bruts, error }] = await Promise.all([
    base().not("platform_fields->fin_ebay", "is", null).not("platform_fields->>unavailable_since", "is", null).limit(100),
    base().in("platform_fields->>sale_signal", ["unavailable", "sold"]).limit(100),
    base().order("platform_fields->>veille_ebay_le", { ascending: true, nullsFirst: true }).limit(VEILLE_CANDIDATS_MAX),
  ]);
  if (error) return { erreur: error.message };
  const vus = new Set<string>();
  const premieres = ((avantFin ?? []) as JobVeille[]).filter((j) => drapeauAvantLaFin(j.platform_fields ?? {}));
  const candidats = ([...premieres, ...(signalees ?? []), ...(bruts ?? [])] as JobVeille[]).filter((j) => {
    if (vus.has(j.id)) return false;
    vus.add(j.id);
    return true;
  });
  const maintenant = Date.now();
  // Les verrous d'idempotence, AVANT le moindre appel réseau.
  // ⚠️ 19/09 : `sale_signal="unavailable"` est une QUESTION, pas une vente —
  //    on a le droit de la faire passer à une certitude.
  // (01/10) Un job déjà « sold » par eBay mais dont la vente n'est pas
  //    enregistrée (le drapeau seul ne faisait qu'un bandeau : jocabroc8 depuis
  //    le 29/09, annonces Leboncoin et Vinted encore en ligne) est revisité :
  //    eBay est RELU juste avant d'enregistrer. Un refus d'enregistrement est
  //    noté (vente_auto) et n'est pas retenté avant 24 h.
  const eligibles = candidats.filter((j) => {
    const pf = j.platform_fields ?? {};
    const refus = Date.parse(String((pf.vente_auto as Record<string, unknown> | undefined)?.refus_le ?? ""));
    if (Number.isFinite(refus) && maintenant - refus < 24 * 3600_000) return false;
    if (pf.sale_signal === "sold") return true;
    const vu = Date.parse(String(pf.veille_ebay_le ?? ""));
    // Un drapeau posé avant la fin (09/10) se relit sans attendre les 6 h —
    // au plus une fois toutes les 10 min s'il reste illisible.
    if (pf.unavailable_since && drapeauAvantLaFin(pf)) return !Number.isFinite(vu) || maintenant - vu >= 10 * 60_000;
    return !Number.isFinite(vu) || maintenant - vu >= VEILLE_CADENCE_MS;
  });
  const lot = eligibles.slice(0, VEILLE_LOT_MAX);
  if (!lot.length) return { candidats: candidats.length, visites: 0, ventes: 0, orphelines: 0 };

  // 3e verrou : l'article est-il DÉJÀ vendu en base ? Une vente actée ne
  // relance jamais de chaîne de retrait (même garde anti-rétroactivité que la
  // sync Vinted).
  const invIds = [...new Set(lot.map((j) => j.inventaire_id).filter((x): x is number => x != null))];
  const vendus = new Set<number>();
  if (invIds.length) {
    const { data: arts } = await admin.from("inventaire").select("id, statut").in("id", invIds);
    for (const a of (arts ?? []) as Array<{ id: number; statut: string | null }>) {
      if (String(a.statut ?? "").toLowerCase() === "vendu") vendus.add(a.id);
    }
  }

  let token: string;
  try { token = await obtenirJetonApplicatif(env); }
  catch (e) { return { erreur: `jeton_applicatif:${String((e as Error)?.message ?? e).slice(0, 120)}` }; }

  // Les lectures, par tranches parallèles, sous le budget de temps. Une
  // annonce non lue n'est pas horodatée : elle passe au tour suivant.
  const debutVeille = Date.now();
  const aLire = lot.filter((j) => !(j.inventaire_id != null && vendus.has(j.inventaire_id)));
  const etats = new Map<string, EtatAnnonce>();
  let coupe = false;
  for (let i = 0; i < aLire.length && !coupe; i += VEILLE_PARALLELE) {
    if (Date.now() - debutVeille > VEILLE_BUDGET_MS) break;
    const tranche = aLire.slice(i, i + VEILLE_PARALLELE);
    const lus = await Promise.all(tranche.map((j) => lireEtatAnnonceEbay(env, token, String(j.platform_listing_id))));
    tranche.forEach((j, k) => etats.set(j.id, lus[k]));
    if (lus.some((e) => e.verdict === "indetermine" && e.limite)) {
      // eBay nous coupe : on se TAIT. Les jobs restants ne sont même pas
      // horodatés — ils repasseront au tick suivant, intacts.
      console.warn(`[ebay-api-worker] veille interrompue (eBay limite) — rien conclu sur le reste`);
      coupe = true;
    }
  }

  let visites = 0, ventes = 0, terminees = 0, indeterminees = 0, dementis = 0, encheresSansAcheteur = 0;
  const ecritures: PromiseLike<unknown>[] = [];
  // Un drapeau « sold » sur une fiche DÉJÀ vendue : rien à enregistrer, et il
  // ne doit pas occuper la file à chaque passe (24 h de repos, tracé).
  for (const job of lot) {
    if (job.inventaire_id == null || !vendus.has(job.inventaire_id) || (job.platform_fields ?? {}).sale_signal !== "sold") continue;
    const pf = { ...(job.platform_fields ?? {}), vente_auto: { refus_le: new Date().toISOString(), raison: "fiche_deja_vendue" } };
    ecritures.push(admin.from("cross_post_jobs").update({ platform_fields: pf }).eq("id", job.id).eq("status", "published"));
  }
  const aEnregistrer: Array<{ job: JobVeille; prix: number | null }> = [];
  for (const job of aLire) {
    const etat = etats.get(job.id);
    if (!etat || (etat.verdict === "indetermine" && etat.limite)) continue;
    visites++;
    const pf: Record<string, unknown> = { ...(job.platform_fields ?? {}), veille_ebay_le: new Date().toISOString() };
    // Un ancien drapeau « sold » qu'eBay ne confirme plus (annonce remise en
    // vente) : on n'enregistre rien, et on ne relit pas avant 24 h.
    if ((job.platform_fields ?? {}).sale_signal === "sold" && etat.verdict !== "vendue") {
      pf.vente_auto = { refus_le: new Date().toISOString(), raison: "ebay_ne_dit_plus_vendu" };
    }
    if (etat.verdict === "vendue") {
      // On n'écrase JAMAIS un horodatage déjà posé : si le job était déjà « en
      // question », la date d'origine est la bonne — on ne fait que remplacer
      // la question par la réponse.
      if (!pf.unavailable_since) pf.unavailable_since = new Date().toISOString();
      pf.sale_signal = "sold";
      if (etat.prix != null) pf.detected_price = etat.prix;
      // La date RÉELLE de fin rendue par eBay, gardée telle quelle (nulle pour
      // une annonce à durée illimitée épuisée).
      pf.vente_ebay = { fin: etat.fin, vendus: etat.vendus, prix: etat.prix, sans_fin: etat.sans_fin === true, vu_le: new Date().toISOString() };
      // (01/10) La preuve EXACTE, lue à l'instant, par l'identifiant : c'est
      // elle que l'enregistrement automatique des ventes sûres exige.
      pf.sale_evidence = {
        platform: "ebay", listing_id: String(job.platform_listing_id), state: "sold", exact: true,
        source: "browse_api", vendus: etat.vendus, fin: etat.fin, lu_le: new Date().toISOString(),
      };
      ventes++;
      if (aEnregistrer.length < VENTES_AUTO_PAR_PASSE && job.inventaire_id != null) {
        aEnregistrer.push({ job: { ...job, platform_fields: pf }, prix: etat.prix ?? (Number(job.price) || null) });
      }
      console.log(`[ebay-api-worker] VENTE eBay sur ${job.platform_listing_id} (fin ${etat.fin ?? "aucune"}, ${etat.vendus} vendu(s), plus rien de disponible) → job ${job.id}`);
    } else if (etat.verdict === "terminee_sans_vente") {
      // Bandeau INTERROGATIF, jamais affirmatif : l'annonce À PRIX FIXE est
      // terminée (date de fin PASSÉE), on ne sait pas pourquoi, et eBay dit
      // explicitement 0 vendu. Le vendeur qui arrête son annonce a souvent vendu
      // ailleurs : c'est à lui de trancher.
      if (!pf.unavailable_since) pf.unavailable_since = new Date().toISOString();
      pf.fin_ebay = { fin: etat.fin, vendus: 0, format: etat.format ?? null, vu_le: new Date().toISOString() };
      terminees++;
    } else if (etat.verdict === "enchere_sans_acheteur") {
      // (09/10) ENCHÈRE terminée sans acheteur : ce n'est PAS une vente, et ce
      // n'est pas une question. L'annonce n'existe plus chez eBay ; l'article
      // reste en stock, intact (aucune vente, aucun retrait, aucune quantité
      // touchée). Le job est clos comme le ferait « Non, je l'ai retirée ».
      if (pf.sale_signal !== "sold") {
        for (const k of CLES_QUESTION_PLUS_EN_LIGNE) delete pf[k];
        if (pf.sale_signal === "unavailable") delete pf.sale_signal;
        pf.fin_ebay = { fin: etat.fin, vendus: 0, format: "AUCTION", sans_acheteur: true, encheres: etat.encheres ?? null, vu_le: new Date().toISOString() };
        encheresSansAcheteur++;
        const jour = new Date(etat.fin).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" });
        ecritures.push(
          admin.from("cross_post_jobs")
            .update({ status: "cancelled", platform_fields: pf,
              error: `Enchère eBay terminée le ${jour} sans acheteur : rien n'a été vendu, l'article reste dans ton stock.` })
            .eq("id", job.id).eq("status", "published")
            .then(({ error: uErr }: { error: { message: string } | null }) => {
              if (uErr) console.warn(`[ebay-api-worker] veille : clôture de l'enchère ${job.platform_listing_id} refusée — ${uErr.message}`);
            }),
        );
        console.log(`[ebay-api-worker] enchère ${job.platform_listing_id} terminée le ${etat.fin} SANS ACHETEUR → job ${job.id} clos, aucune vente`);
        continue;
      }
    } else if (etat.verdict === "indetermine") {
      indeterminees++;
      pf.veille_ebay_indetermine = etat.motif;
    } else {
      delete pf.veille_ebay_indetermine;
      pf.quantite_ebay = { ...etat.quantite, vu_le: new Date().toISOString() };
      pf.format_ebay = { format: etat.format ?? null, fin: etat.fin ?? null, encheres: etat.encheres ?? null, vu_le: new Date().toISOString() };
      // (09/10, Marta) eBay DÉMENT la question « Plus en ligne — Vendue ? » :
      // l'annonce est en vente (pas de fin, ou une fin à venir — enchère en
      // cours). La question est levée, quelle que soit sa source (ce veilleur
      // avant la fin, ou un relevé qui ne l'a pas vue) ; une preuve « sold »
      // n'est jamais levée ici.
      if (pf.unavailable_since && pf.sale_signal !== "sold") {
        const ancien = { unavailable_since: pf.unavailable_since, sale_signal: pf.sale_signal ?? null, fin_ebay: pf.fin_ebay ?? null };
        for (const k of CLES_QUESTION_PLUS_EN_LIGNE) delete pf[k];
        if (pf.sale_signal === "unavailable") delete pf.sale_signal;
        pf.revue_en_ligne_par_ebay = { at: new Date().toISOString(), format: etat.format ?? null, fin: etat.fin ?? null, ancien };
        dementis++;
        console.log(`[ebay-api-worker] ${job.platform_listing_id} EN VENTE chez eBay (${etat.format ?? "?"}, fin ${etat.fin ?? "aucune"}) → question « Plus en ligne » levée sur le job ${job.id}`);
      } else if (pf.fin_ebay && !pf.unavailable_since) {
        delete pf.fin_ebay;   // reste d'une ancienne lecture, démentie
      }
    }
    // Compare-and-swap sur le statut : un job qui a changé d'état entre la
    // lecture et l'écriture n'est jamais écrasé. Écritures en parallèle.
    ecritures.push(
      admin.from("cross_post_jobs")
        .update({ platform_fields: pf }).eq("id", job.id).eq("status", "published")
        .then(({ error: uErr }: { error: { message: string } | null }) => {
          if (uErr) console.warn(`[ebay-api-worker] veille : écriture refusée sur ${job.id} — ${uErr.message}`);
        }),
    );
  }
  await Promise.all(ecritures);

  // ── LA VENTE S'ENREGISTRE PAR LA VOIE NORMALE (01/10, décision Nico) ────
  // Une vente lue sur l'identifiant exact est une vente sûre (consigne du
  // 28/09) : orchestrateSale → enregistrer_vente_atomique, le même chemin que
  // le bouton « Vendue » de l'app. Stock, ligne de vente et retraits des
  // copies PROUVÉES des autres plateformes dans la même transaction ; la
  // fonction refuse d'elle-même un article déjà vendu ou une vente déjà liée
  // (jamais de seconde vente). Les retraits partent ensuite par l'extension.
  // ⛔ Jamais de retrait sur une annonce IMPORTÉE sans numéro exact : si une
  //    copie vivante de la fiche est un import sans identifiant ni lien, la
  //    vente n'est pas enregistrée ici — le bandeau « Vendue » reste, la
  //    personne tranche.
  let enregistrees = 0;
  for (const { job, prix } of aEnregistrer) {
    try {
      const { data: copies } = await admin.from("cross_post_jobs")
        .select("id, platform, platform_listing_id, listing_url, handler_build")
        .eq("inventaire_id", job.inventaire_id as number).neq("id", job.id).neq("platform", "ebay")
        .in("action", ["publish", "republish"]).in("status", ["published", "pending", "processing", "needs_user"]);
      const importSansNumero = ((copies ?? []) as Array<{ platform_listing_id: string | null; listing_url: string | null; handler_build: string | null }>)
        .some((c) => !String(c.platform_listing_id ?? "").trim() && !String(c.listing_url ?? "").trim()
          && String(c.handler_build ?? "").includes("releve-annonces"));
      const pf = { ...(job.platform_fields ?? {}) };
      if (importSansNumero) {
        pf.vente_auto = { refus_le: new Date().toISOString(), raison: "copie_importee_sans_numero" };
      } else {
        const r = await orchestrateSale(admin, job.user_id, job.id, { priceOverride: prix ?? undefined });
        if (r.ok) {
          enregistrees++;
          console.log(`[ebay-api-worker] vente eBay ${job.platform_listing_id} ENREGISTRÉE (job ${job.id}) : ${r.retraitsArmes} retrait(s) armé(s), ${r.siblingsCancelled} publication(s) arrêtée(s)`);
          continue;   // le job est maintenant « sold » : plus rien à écrire dessus
        }
        pf.vente_auto = { refus_le: new Date().toISOString(), raison: String(r.reason ?? "refus").slice(0, 200) };
      }
      await admin.from("cross_post_jobs").update({ platform_fields: pf }).eq("id", job.id).eq("status", "published");
    } catch (e) {
      console.warn(`[ebay-api-worker] vente eBay ${job.platform_listing_id} non enregistrée : ${(e as Error)?.message ?? e}`);
    }
  }

  // ── LES ANNONCES IMPORTÉES SONT VEILLÉES AUSSI (2026-09-19) ──────────────
  // Annonces relevées sans job : même preuve, même règle, écrite sur la LIGNE
  // D'ANNONCE (jamais sur un job, jamais `disparu_le`). Même budget de temps.
  let orphelines = 0;
  const resteLot = VEILLE_LOT_MAX - visites;
  if (!coupe && resteLot > 0 && Date.now() - debutVeille < VEILLE_BUDGET_MS) {
    try {
      const { data: sansJob } = await admin.from("annonces_plateforme")
        .select("id, listing_id, capture")
        .eq("platform", "ebay").is("job_id", null).is("disparu_le", null)
        .is("inventaire_id", null)
        .limit(VEILLE_CANDIDATS_MAX);
      const aVoir = ((sansJob ?? []) as Array<{ id: string; listing_id: string; capture: Record<string, unknown> | null }>)
        .filter((a) => /^\d{9,15}$/.test(String(a.listing_id ?? "")))
        .filter((a) => {
          const cap = a.capture ?? {};
          if (cap.vendue_le) return false; // déjà conclu vendu : on n'y revient pas
          const vu = Date.parse(String(cap.veille_ebay_le ?? ""));
          return !Number.isFinite(vu) || Date.now() - vu >= VEILLE_CADENCE_MS;
        })
        .slice(0, Math.min(resteLot, VEILLE_PARALLELE));
      const lus = await Promise.all(aVoir.map((a) => lireEtatAnnonceEbay(env, token, String(a.listing_id))));
      await Promise.all(aVoir.map((a, k) => {
        const etat = lus[k];
        if (etat.verdict === "indetermine" && etat.limite) return null;
        orphelines++;
        const cap: Record<string, unknown> = { ...(a.capture ?? {}), veille_ebay_le: new Date().toISOString() };
        if (etat.verdict === "vendue") {
          cap.vendue_le = etat.fin ?? new Date().toISOString();
          cap.vente_ebay = { fin: etat.fin, vendus: etat.vendus, prix: etat.prix, sans_fin: etat.sans_fin === true, vu_le: new Date().toISOString() };
          console.log(`[ebay-api-worker] VENTE eBay sur l'annonce importée ${a.listing_id} (fin ${etat.fin ?? "aucune"}) — aucun job, trace posée sur la ligne d'annonce`);
        } else if (etat.verdict === "terminee_sans_vente") {
          cap.fin_ebay = { fin: etat.fin, vendus: 0, format: etat.format ?? null, vu_le: new Date().toISOString() };
        } else if (etat.verdict === "enchere_sans_acheteur") {
          // (09/10) Enchère terminée sans acheteur : jamais une vente.
          cap.fin_ebay = { fin: etat.fin, vendus: 0, format: "AUCTION", sans_acheteur: true, encheres: etat.encheres ?? null, vu_le: new Date().toISOString() };
        } else if (etat.verdict === "vivante") {
          cap.quantite_ebay = { ...etat.quantite, vu_le: new Date().toISOString() };
          cap.format_ebay = { format: etat.format ?? null, fin: etat.fin ?? null, encheres: etat.encheres ?? null };
          delete cap.fin_ebay;
        }
        return admin.from("annonces_plateforme")
          .update({ capture: cap, updated_at: new Date().toISOString() })
          .eq("id", a.id).is("disparu_le", null);
      }));
    } catch (e) {
      console.warn("[ebay-api-worker] veille des annonces importées :", (e as Error)?.message ?? e);
    }
  }
  return { candidats: candidats.length, eligibles: eligibles.length, visites, ventes, enregistrees, terminees, indeterminees, dementis, encheres_sans_acheteur: encheresSansAcheteur, orphelines, coupe, duree_ms: Date.now() - debutVeille };
}

// ═══════════════════════════════════════════════════════════════════════════
// BAISSER LA QUANTITÉ D'UNE ANNONCE eBAY, SUR DÉCISION (01/10, lot point 4)
// ═══════════════════════════════════════════════════════════════════════════
// Appelée à la main (x-cron-secret), jamais par le cron. xxewwer : l'annonce
// 377462623400 affiche « 2 disponibles » alors qu'un exemplaire est parti sur
// Vinted — décision de Nico : la baisser à 1, sans rien retirer.
// Gardes, toutes avant d'écrire : le compte eBay relié est bien le vendeur de
// l'annonce (Browse), l'annonce est en vente, eBay affiche EXACTEMENT la
// quantité attendue et 0 vendu (sinon la quantité totale à écrire serait
// ambiguë) ; la nouvelle quantité est plus petite et ≥ 1. Relu après.
async function reviserQuantiteAnnonce(admin: SupabaseClient, env: EbayEnv, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const userId = String(body.user_id ?? "");
  const id = String(body.listing_id ?? "");
  const cible = Number(body.quantite);
  const attendu = Number(body.attendu_disponible);
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !/^\d{9,15}$/.test(id) || !Number.isInteger(cible) || cible < 1
      || !Number.isInteger(attendu) || cible >= attendu) return { ok: false, motif: "parametres" };
  const { data: compte } = await admin.from("ebay_accounts").select("ebay_user_id").eq("user_id", userId).maybeSingle();
  const pseudo = String((compte as { ebay_user_id?: string } | null)?.ebay_user_id ?? "");
  if (!pseudo) return { ok: false, motif: "compte_ebay_non_relie" };
  const appToken = await obtenirJetonApplicatif(env);
  const lire = async () => {
    const r = await fetch(`${hotes(env).api}/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${id}`, {
      headers: { Authorization: `Bearer ${appToken}`, "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE, Accept: "application/json" },
    });
    const j = await r.json().catch(() => ({})) as Record<string, unknown>;
    const d = (j.estimatedAvailabilities as Array<Record<string, unknown>> | undefined)?.[0] ?? {};
    return { http: r.status, vendeur: String((j.seller as Record<string, unknown> | undefined)?.username ?? ""),
      fin: j.itemEndDate ?? null, q: lireQuantiteEbay(d) };
  };
  const avant = await lire();
  if (avant.http !== 200) return { ok: false, motif: `browse_http_${avant.http}` };
  if (avant.vendeur.toLowerCase() !== pseudo.toLowerCase()) return { ok: false, motif: "vendeur_different", vendeur: avant.vendeur };
  if (avant.fin) return { ok: false, motif: "annonce_terminee" };
  if (!avant.q.exacte || avant.q.disponible !== attendu || avant.q.vendus !== 0) return { ok: false, motif: "etat_inattendu", avant: avant.q };
  const jeton = await obtenirAccessToken(admin, userId);
  if (!jeton.ok) return { ok: false, motif: `jeton_${jeton.motif}` };
  const r = await fetch(`${hotes(env).api}/ws/api.dll`, {
    method: "POST",
    headers: {
      "X-EBAY-API-IAF-TOKEN": jeton.token as string,
      "X-EBAY-API-CALL-NAME": "ReviseInventoryStatus",
      "X-EBAY-API-SITEID": "71",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1193",
      "Content-Type": "text/xml",
    },
    body: `<?xml version="1.0" encoding="utf-8"?><ReviseInventoryStatusRequest xmlns="urn:ebay:apis:eBLBaseComponents"><InventoryStatus><ItemID>${id}</ItemID><Quantity>${cible}</Quantity></InventoryStatus></ReviseInventoryStatusRequest>`,
  });
  const xml = await r.text();
  const ack = xml.match(/<Ack>([^<]+)<[/]Ack>/)?.[1] ?? null;
  const erreur = xml.match(/<LongMessage>([^<]{1,300})<[/]LongMessage>/)?.[1] ?? null;
  const apres = await lire();
  return { ok: ack === "Success" || ack === "Warning", ack, erreur, avant: avant.q, apres: apres.q };
}

// ═══════════════════════════════════════════════════════════════════════════
// RÉVISER UNE ANNONCE EN LIGNE QU'UNE RÈGLE CORRIGÉE AURAIT FAITE AUTREMENT
// (03/10, points 12 et 5)
// ═══════════════════════════════════════════════════════════════════════════
// Patrick (patrick.giry07, job b26c3d40, eBay 237102208161) : jean publié en
// « 34 » — le 34 de la LONGUEUR de « 35/34 » lu comme un 34 français — alors
// que la fiche dit « W34 | FR 44 ». La règle est corrigée depuis f514b52
// (02/10 soir), mais rien ne remettait l'annonce d'accord : une republication
// recopie le job source, et le worker ne savait que publier, retirer et
// baisser une quantité. Décision de Nico : l'annonce en ligne doit porter 44.
// Livres (point 5) : une annonce rangée en « Modélisme ferroviaire > Livres »
// change de rayon pour la maison des livres.
// LA RÈGLE DE PRUDENCE (mesurée le 03/10) : sur les 101 annonces API publiées
// avec une taille, 16 diffèrent de ce que la règle d'aujourd'hui tirerait de
// leur fiche, et 15 de ces écarts sont des écritures équivalentes ou des choix
// de la personne (« S / 36 / 8 » publié « 36 »…). On ne révise donc JAMAIS
// en masse ni en automatique : une annonce désignée, la valeur actuelle
// attendue (sinon rien), la nouvelle valeur calculée par la règle du dépôt
// (tailleDansGrille sur la grille eBay du rayon ; maison des livres + choix
// parmi les suggestions d'eBay), un essai à blanc possible, puis relecture
// de l'article ET de l'annonce publique. Même numéro d'annonce, rien n'est
// republié ni décompté.
async function reviserAnnonce(admin: SupabaseClient, env: EbayEnv, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const jobId = String(body.job_id ?? "");
  const dryRun = body.dry_run === true;
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return { ok: false, motif: "parametres" };
  const { data: j } = await admin.from("cross_post_jobs")
    .select("id, user_id, inventaire_id, platform, action, status, voie, title, platform_fields").eq("id", jobId).maybeSingle();
  const job = j as (Job & { voie?: string }) | null;
  const pf = { ...((job?.platform_fields ?? {}) as Record<string, unknown>) };
  const api = (pf.ebay_api ?? {}) as Record<string, unknown>;
  const sku = String(api.sku ?? ""), offerId = String(api.offer_id ?? ""), listingId = String(api.listing_id ?? "");
  if (!job || job.platform !== "ebay" || job.voie !== "api" || job.status !== "published" || !sku || !offerId || !/^\d{9,15}$/.test(listingId)) {
    return { ok: false, motif: "pas_une_annonce_api_publiee" };
  }
  const jeton = await obtenirAccessToken(admin, job.user_id);
  if (!jeton.ok) return { ok: false, motif: `jeton_${jeton.motif}` };
  const token = jeton.token as string;
  const changements: Array<Record<string, unknown>> = [];

  // ── La taille : la fiche passée par la règle du dépôt, sur la grille du rayon.
  if (body.taille === true) {
    const attendu = String(body.taille_actuelle ?? "");
    const inv = await lireInventaire(admin, job.inventaire_id);
    const tailleFiche = String(((inv.attributs ?? {}) as Record<string, any>)?.taille?.v ?? "").trim();
    const cat = await aspectsCategorie(admin, env, token, String(pf.ebayCategoryId ?? ""));
    if ("erreur" in cat) return { ok: false, motif: "aspects_illisibles", detail: cat.erreur };
    const grille = cat.aspects.find((a) => a.name === "Taille")?.allowedValues ?? [];
    const t = tailleFiche && grille.length ? tailleDansGrille(tailleFiche, grille) : null;
    if (String(pf.taille ?? "") !== attendu) return { ok: false, motif: "taille_actuelle_differente", sur_le_job: pf.taille ?? null, attendu };
    if (!t) return { ok: false, motif: "taille_non_traduisible", fiche: tailleFiche };
    // `essai_sans_changement` : la même taille est réécrite et relue — une
    // révision sans effet, pour prouver l'aller-retour sur une vraie annonce.
    if (t.valeur === attendu && body.essai_sans_changement !== true) return { ok: true, motif: "deja_juste", taille: t.valeur };
    changements.push({ quoi: "Taille", de: attendu, vers: t.valeur, fiche: tailleFiche, regle: t.motif, ...(t.valeur === attendu ? { essai_sans_changement: true } : {}) });
  }
  // ── Le rayon d'un livre : la maison des livres, parmi les suggestions d'eBay.
  if (body.rayon_livre === true) {
    const actuel = String(pf.ebayCategoryId ?? "");
    if (actuel !== String(body.rayon_actuel ?? "")) return { ok: false, motif: "rayon_actuel_different", sur_le_job: actuel };
    const inv = await lireInventaire(admin, job.inventaire_id);
    const titre = (inv.titre || job.title || "").trim();
    const appToken = await obtenirJetonApplicatif(env);
    const suggestions = (await suggererCategories(env, appToken, titre)).filter((s) => s.chemin[0] === "Livres, BD, revues");
    const choisi = suggestions.length ? await choisirParmiSuggestions(suggestions, { titre, userId: job.user_id }, admin) : null;
    if (!choisi) return { ok: false, motif: "aucun_rayon_livre_sur", suggestions: suggestions.map((s) => `${s.id} ${s.chemin.join(" > ")}`) };
    changements.push({ quoi: "rayon", de: actuel, vers: choisi.id, chemin: choisi.chemin });
  }
  if (!changements.length) return { ok: false, motif: "rien_demande" };
  if (dryRun) return { ok: true, dry_run: true, job: job.id, annonce: listingId, changements };

  const avant = { taille: pf.taille ?? null, ebayCategoryId: pf.ebayCategoryId ?? null, ebayCategoryPath: pf.ebayCategoryPath ?? null };
  for (const c of changements) {
    if (c.quoi === "Taille") {
      const g = await appelEbay(env, token, `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`);
      if (g.http !== 200 || !g.json) return { ok: false, motif: `lecture_article_${g.http}` };
      const item = g.json as Record<string, any>;
      const corps: Record<string, unknown> = {
        availability: item.availability, condition: item.condition,
        ...(item.conditionDescription ? { conditionDescription: item.conditionDescription } : {}),
        ...(Array.isArray(item.conditionDescriptors) && item.conditionDescriptors.length ? { conditionDescriptors: item.conditionDescriptors } : {}),
        ...(item.packageWeightAndSize ? { packageWeightAndSize: item.packageWeightAndSize } : {}),
        product: { ...item.product, aspects: { ...(item.product?.aspects ?? {}), Taille: [String(c.vers)] } },
      };
      const p = await appelEbay(env, token, `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, { method: "PUT", body: corps });
      if (![200, 201, 204].includes(p.http)) {
        const e = lireErreurEbay(p.json, p.texte);
        return { ok: false, motif: `refus_article_${p.http}`, ebay: e.message, errorId: e.errorId };
      }
      pf.taille = String(c.vers);
    }
    if (c.quoi === "rayon") {
      // L'ÉTAT, DANS LE VOCABULAIRE DU NOUVEAU RAYON (03/10, refus 25021 sur le
      // Hawking d'Ornella : « le code d'état n'est pas valide pour la catégorie »).
      // Le même état de la fiche, traduit par la même règle que le dépôt
      // (choisirCondition) — jamais un autre état. L'article est mis à jour
      // AVANT l'offre ; si l'offre est refusée, l'article retrouve son état.
      const conds = await conditionsCategorie(env, token, String(c.vers));
      const condNouveau = choisirCondition(pf.etat as string, conds);
      if (!condNouveau) return { ok: false, motif: "etat_sans_correspondance_dans_le_nouveau_rayon", etat: pf.etat ?? null };
      const gi = await appelEbay(env, token, `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`);
      if (gi.http !== 200 || !gi.json) return { ok: false, motif: `lecture_article_${gi.http}` };
      const article = gi.json as Record<string, any>;
      const corpsArticle = (condition: string) => ({
        availability: article.availability, condition,
        ...(article.conditionDescription ? { conditionDescription: article.conditionDescription } : {}),
        ...(article.packageWeightAndSize ? { packageWeightAndSize: article.packageWeightAndSize } : {}),
        product: article.product,
      });
      const conditionAvant = String(article.condition ?? "");
      if (condNouveau.enumValue !== conditionAvant) {
        const pc = await appelEbay(env, token, `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, { method: "PUT", body: corpsArticle(condNouveau.enumValue) });
        if (![200, 201, 204].includes(pc.http)) {
          const e = lireErreurEbay(pc.json, pc.texte);
          return { ok: false, motif: `refus_etat_${pc.http}`, ebay: e.message, errorId: e.errorId, etat: condNouveau.libelle };
        }
        c.etat = { de: conditionAvant, vers: condNouveau.enumValue, libelle: condNouveau.libelle };
      }
      const o = await appelEbay(env, token, `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`);
      if (o.http !== 200 || !o.json) return { ok: false, motif: `lecture_offre_${o.http}` };
      const offre = o.json as Record<string, any>;
      const corpsOffre: Record<string, unknown> = {};
      for (const k of ["availableQuantity", "categoryId", "charity", "extendedProducerResponsibility", "format", "hideBuyerDetails", "includeCatalogProductDetails",
        "listingDescription", "listingDuration", "listingPolicies", "listingStartDate", "lotSize", "merchantLocationKey", "pricingSummary",
        "quantityLimitPerBuyer", "regulatory", "secondaryCategoryId", "storeCategoryNames", "tax"]) if (offre[k] !== undefined) corpsOffre[k] = offre[k];
      corpsOffre.categoryId = String(c.vers);
      const u = await appelEbay(env, token, `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`, { method: "PUT", body: corpsOffre });
      if (![200, 204].includes(u.http)) {
        const e = lireErreurEbay(u.json, u.texte);
        // L'offre refuse : l'article retrouve son état d'avant (annonce inchangée).
        if (c.etat) await appelEbay(env, token, `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, { method: "PUT", body: corpsArticle(conditionAvant) }).catch(() => null);
        return { ok: false, motif: `refus_offre_${u.http}`, ebay: e.message, errorId: e.errorId, etat_remis: Boolean(c.etat) };
      }
      pf.ebayCategoryId = String(c.vers);
      pf.ebayCategoryPath = c.chemin;
    }
  }
  // Relecture de l'annonce publique (jeton applicatif) : ce que voient les acheteurs.
  let relu: Record<string, unknown> = {};
  try {
    const appToken = await obtenirJetonApplicatif(env);
    const r = await fetch(`${hotes(env).api}/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${listingId}`, {
      headers: { Authorization: `Bearer ${appToken}`, "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE, Accept: "application/json" },
    });
    const b = await r.json().catch(() => ({})) as Record<string, any>;
    relu = { http: r.status, categoryId: b.categoryId ?? null,
      taille: ((b.localizedAspects ?? []) as Array<{ name?: string; value?: string }>).find((a) => a.name === "Taille")?.value ?? null };
  } catch (e) { relu = { erreur: String((e as Error)?.message ?? e).slice(0, 120) }; }
  pf.revision_annonce = { le: new Date().toISOString(), par: "ebay-api-worker (révision : règle corrigée)", avant, changements, relu };
  await admin.from("cross_post_jobs").update({ platform_fields: pf }).eq("id", job.id).eq("status", "published");
  console.log(`[ebay-api-worker] annonce ${listingId} révisée : ${changements.map((c) => `${c.quoi} ${c.de} → ${c.vers}`).join(", ")} — relu ${JSON.stringify(relu)}`);
  return { ok: true, job: job.id, annonce: listingId, changements, relu };
}

// ═══════════════════════════════════════════════════════════════════════════
// LE VENDEUR DES ANNONCES LUES AU HUB (2026-09-26, relevé eBay aligné sur l'API)
// ═══════════════════════════════════════════════════════════════════════════
// Un compte relié par l'API ne voit plus son relevé eBay traité que si le Hub
// lu par Chrome est bien celui du compte relié (migration
// 20260926110000_releve_ebay_compte_api). La preuve : le vendeur d'une annonce
// lue, tel qu'eBay le rend (Browse, seller.username, jeton APPLICATIF — aucun
// jeton vendeur, aucun consentement). La base met en file les annonces dont
// elle ne connaît pas le vendeur ; on les vérifie ici, par lots bornés.
// ⛔ Même budget que la veille : on s'arrête net sur un 429 / 5xx, rien n'est
//    conclu sur le reste. Une annonce introuvable (404) n'a PAS de vendeur :
//    elle reste en file, retentée plus tard, puis abandonnée — jamais devinée.
const VENDEURS_LOT_MAX = 30;
const VENDEURS_TENTATIVES_MAX = 6;
const VENDEURS_ATTENTE_MS = 15 * 60_000;   // × tentatives

async function verifierVendeursAnnonces(admin: SupabaseClient, env: EbayEnv): Promise<Record<string, unknown>> {
  const { data: file, error } = await admin.from("ebay_annonces_a_verifier")
    .select("listing_id, user_id, tentatives, derniere_tentative")
    .lt("tentatives", VENDEURS_TENTATIVES_MAX)
    .order("demande_le", { ascending: true })
    .limit(1000);
  if (error) return { erreur: error.message };
  const maintenant = Date.now();
  const eligibles = ((file ?? []) as Array<{ listing_id: string; user_id: string; tentatives: number; derniere_tentative: string | null }>)
    .filter((l) => /^\d{9,15}$/.test(String(l.listing_id)))
    .filter((l) => {
      const t = Date.parse(String(l.derniere_tentative ?? ""));
      return !Number.isFinite(t) || maintenant - t >= VENDEURS_ATTENTE_MS * Math.max(1, l.tentatives);
    });
  // UNE annonce prouvée suffit à établir l'identité d'un relevé (le Hub ne
  // montre que le compte connecté) : on sert d'abord UNE annonce par personne,
  // pour qu'un gros dressing (373 annonces) n'affame pas les autres comptes.
  const premieres: typeof eligibles = [];
  const reste: typeof eligibles = [];
  const vus = new Set<string>();
  for (const l of eligibles) {
    if (vus.has(l.user_id)) reste.push(l);
    else { vus.add(l.user_id); premieres.push(l); }
  }
  const aVoir = [...premieres, ...reste].slice(0, VENDEURS_LOT_MAX);
  if (!aVoir.length) return { en_file: (file ?? []).length, verifiees: 0 };

  let token: string;
  try { token = await obtenirJetonApplicatif(env); }
  catch (e) { return { erreur: `jeton_applicatif:${String((e as Error)?.message ?? e).slice(0, 120)}` }; }

  let verifiees = 0, sansVendeur = 0, coupe = false;
  for (const l of aVoir) {
    let r: Response;
    try {
      r = await fetch(`${hotes(env).api}/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${encodeURIComponent(l.listing_id)}`, {
        headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE, Accept: "application/json" },
      });
    } catch (e) {
      await admin.from("ebay_annonces_a_verifier")
        .update({ tentatives: l.tentatives + 1, derniere_tentative: new Date().toISOString(), dernier_motif: `reseau:${String((e as Error)?.message ?? e).slice(0, 80)}` })
        .eq("listing_id", l.listing_id);
      continue;
    }
    if (r.status === 429 || r.status >= 500) { coupe = true; break; }
    const j = await r.json().catch(() => null) as Record<string, unknown> | null;
    const vendeur = (j?.seller as Record<string, unknown> | undefined) ?? {};
    const username = typeof vendeur.username === "string" ? vendeur.username.trim() : "";
    if (r.status === 200 && username) {
      await admin.from("ebay_vendeurs_annonces").upsert({
        listing_id: l.listing_id, vendeur: username,
        vendeur_id: typeof vendeur.userId === "string" ? vendeur.userId : null,
        source: "browse", vu_le: new Date().toISOString(),
      }, { onConflict: "listing_id" });
      await admin.from("ebay_annonces_a_verifier").delete().eq("listing_id", l.listing_id);
      verifiees++;
    } else {
      await admin.from("ebay_annonces_a_verifier")
        .update({ tentatives: l.tentatives + 1, derniere_tentative: new Date().toISOString(), dernier_motif: r.status === 200 ? "vendeur_absent" : `http_${r.status}` })
        .eq("listing_id", l.listing_id);
      sansVendeur++;
    }
  }
  if (coupe) console.warn(`[ebay-api-worker] vérification des vendeurs interrompue (quota / eBay) après ${verifiees} annonce(s)`);
  return { en_file: (file ?? []).length, verifiees, sans_vendeur: sansVendeur, coupe };
}

// Ce que le worker vient de publier avec le jeton du compte relié appartient,
// par construction, à ce compte : son vendeur est connu sans rien demander.
async function noterVendeurPublication(admin: SupabaseClient, userId: string, listingId: unknown): Promise<void> {
  const id = String(listingId ?? "");
  if (!/^\d{9,15}$/.test(id)) return;
  const { data: compte } = await admin.from("ebay_accounts").select("ebay_user_id").eq("user_id", userId).is("revoked_at", null).maybeSingle();
  const vendeur = String((compte as { ebay_user_id?: string | null } | null)?.ebay_user_id ?? "").trim();
  if (!vendeur) return;
  await admin.from("ebay_vendeurs_annonces").upsert(
    { listing_id: id, vendeur, source: "publication_api", vu_le: new Date().toISOString() },
    { onConflict: "listing_id", ignoreDuplicates: true },
  );
}

// (03/10, point 21) Le vendeur CONNU d'une annonce (ebay_vendeurs_annonces,
// posé à la publication API ou relevé) est-il un autre compte que celui relié
// aujourd'hui ? Inconnu d'un côté = rien de prouvé = null (comportement d'avant).
async function annonceDUnAutreCompte(admin: SupabaseClient, userId: string, listingId: unknown): Promise<{ vendeur: string; relie: string } | null> {
  const id = String(listingId ?? "");
  if (!/^\d{9,15}$/.test(id)) return null;
  try {
    const [{ data: v }, { data: c }] = await Promise.all([
      admin.from("ebay_vendeurs_annonces").select("vendeur").eq("listing_id", id).maybeSingle(),
      admin.from("ebay_accounts").select("ebay_user_id").eq("user_id", userId).maybeSingle(),
    ]);
    const vendeur = String((v as { vendeur?: string | null } | null)?.vendeur ?? "").trim();
    const relie = String((c as { ebay_user_id?: string | null } | null)?.ebay_user_id ?? "").trim();
    if (!vendeur || !relie || vendeur.toLowerCase() === relie.toLowerCase()) return null;
    return { vendeur, relie };
  } catch {
    return null;
  }
}

const PROCESSING_MAX_MS = 10 * 60_000;
const PROCESSING_REPRISES_MAX = 3;
async function reprendreProcessingMorts(admin: SupabaseClient): Promise<Record<string, unknown>> {
  const { data: enCours } = await admin.from("cross_post_jobs")
    .select("id, action, created_at, platform_fields")
    .eq("platform", "ebay").eq("voie", "api").eq("status", "processing");
  const now = Date.now();
  let rearmes = 0, abandonnes = 0;
  const ids: string[] = [];
  for (const j of (enCours ?? []) as Array<{ id: string; action: string; created_at: string; platform_fields: Record<string, unknown> | null }>) {
    const pf = { ...(j.platform_fields ?? {}) };
    // Sans processing_since (pris par une version antérieure à v16) : la prise
    // date au plus tard de la création — on la traite comme périmée.
    const since = Date.parse(String(pf.processing_since ?? j.created_at ?? ""));
    if (Number.isFinite(since) && now - since < PROCESSING_MAX_MS) continue;
    const n = (Number(pf.reprises_processing) || 0) + 1;
    delete pf.processing_since;
    pf.reprises_processing = n;
    pf.derniere_reprise_processing = new Date(now).toISOString();
    const minutes = Number.isFinite(since) ? Math.round((now - since) / 60_000) : null;
    const epuise = n > PROCESSING_REPRISES_MAX;
    pf.last_diagnostic = { voie: "api", at: new Date(now).toISOString(), etape: "chien_de_garde", quoi: epuise ? "processing_abandonne" : "processing_repris", minutes_en_processing: minutes, reprise_n: n };
    const patch = epuise
      ? { status: "failed", error: `Le traitement eBay s'est interrompu ${PROCESSING_REPRISES_MAX} fois de suite sans conclure. Relance depuis la fiche de l'article ; si l'annonce est déjà en ligne sur eBay, retire-la d'abord.`, platform_fields: pf, handler_build: HANDLER_BUILD }
      : { status: "pending", error: null, platform_fields: pf, handler_build: HANDLER_BUILD };
    const { data } = await admin.from("cross_post_jobs").update(patch).eq("id", j.id).eq("status", "processing").select("id");
    if (!data?.length) continue;
    if (epuise) abandonnes++; else rearmes++;
    ids.push(j.id);
    console.log(`[ebay-api-worker] chien de garde : job ${j.id} (${j.action}) processing depuis ${minutes ?? "?"} min → ${epuise ? "failed" : "pending"} (reprise ${n})`);
  }
  return { rearmes, abandonnes, ids };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Méthode non autorisée", { status: 405 });
  const attendu = Deno.env.get("CRON_SECRET");
  if (!attendu || req.headers.get("x-cron-secret") !== attendu) return json({ error: "Non autorisé" }, 401);

  const body = await req.json().catch(() => ({})) as { job_id?: string; trigger?: string; action?: string; ebay_user_id?: string; limit?: number; inventaire_ids?: number[]; ignorer_aspects_job?: boolean; ignorer_champs_job?: boolean; ids?: string[]; scan?: number; categorie_id?: string; chemin?: unknown[] };
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const env = lireEnvEbay();
  if (body.action === "mesure_aspects") return json(await mesurerAspects(admin, env, body));
  if (body.action === "mesure_categories") return json(await mesurerCategories(admin, env, body));
  if (body.action === "mots_sans_mot_objet") return json(await motsSansMotObjet(admin, body));
  if (body.action === "backtest_categorie") return json(await backtestCategorie(admin, env, body));
  if (body.action === "mesure_annonces") return json(await mesurerAnnonces(env, body as { ids?: string[] }));
  if (body.action === "reviser_quantite_annonce") return json(await reviserQuantiteAnnonce(admin, env, body as Record<string, unknown>));
  if (body.action === "reviser_annonce") return json(await reviserAnnonce(admin, env, body as Record<string, unknown>));
  if (body.action === "rejeu_rayon_refuse") return json(await rejeuRayonRefuse(admin, env, body as { ids?: string[] }));
  if (body.action === "rayon_aveugle") {
    return json(await recategoriserRayonsAveugles(admin, env, { job_id: body.job_id, dry_run: (body as { dry_run?: boolean }).dry_run === true }));
  }

  // ── Chien de garde (Nico, 06/09 soir) : un job pris (processing) depuis
  // plus de PROCESSING_MAX_MS sans conclusion = l'isolat est mort en route
  // (photos lentes, IA, eBay). handler-watch ne le reprend qu'après 24 h et
  // seulement si l'extension de l'utilisateur est muette : un job API mort
  // restait processing pour toujours. Ici : → pending, compteur de reprises,
  // et au 3e coup → failed, cause nommée. Rejouer publier() est sûr : la
  // fiche produit est idempotente par SKU, l'offre non publiée est réutilisée,
  // et une offre DÉJÀ publiée fait échouer le job avec l'annonce nommée
  // (jamais de doublon).
  const reprises = await reprendreProcessingMorts(admin);

  // ── Veilleur de vente : AVANT la sortie anticipée « aucun job pending »,
  // sinon il ne tournerait que les jours de publication. Best-effort intégral :
  // une panne de la veille ne doit jamais empêcher un job de partir.
  let veille: Record<string, unknown> = {};
  try { veille = await veillerVentesEbay(admin, env); }
  catch (e) { veille = { erreur: String((e as Error)?.message ?? e).slice(0, 200) }; }

  // ── Vendeurs des annonces lues au Hub (relevé eBay aligné sur l'API) :
  // même règle que la veille — avant la sortie anticipée, jamais bloquant.
  // ── Quantité des imports eBay neufs (01/10) : bornée, jamais bloquante.
  let quantites: Record<string, unknown> = {};
  try { quantites = await quantitesImportsEbay(admin, env); }
  catch (e) { quantites = { erreur: String((e as Error)?.message ?? e).slice(0, 200) }; }

  let vendeurs: Record<string, unknown> = {};
  try { vendeurs = await verifierVendeursAnnonces(admin, env); }
  catch (e) { vendeurs = { erreur: String((e as Error)?.message ?? e).slice(0, 200) }; }

  // ── Rayon aveugle (26/09) : toutes voies, avant la sortie anticipée — un
  // job formulaire (voie extension) n'est jamais dans la file 'api' ci-dessous.
  let aveugles: Record<string, unknown> = {};
  try { aveugles = await recategoriserRayonsAveugles(admin, env); }
  catch (e) { aveugles = { erreur: String((e as Error)?.message ?? e).slice(0, 200) }; }

  // ── Publications d'un compte relié restées en voie extension (27/09) ──────
  // Avant le 27/09, le trigger laissait 'extension' à un compte relié mais pas
  // prêt (philippaa, pironneau). Elles repartent ICI par l'API — jamais servies
  // à Chrome depuis get-pending-jobs v140. Avant tout geste chez eBay.
  let reroutees: Record<string, unknown> = {};
  try { reroutees = await rerouterPublicationsVersApi(admin); }
  catch (e) { reroutees = { erreur: String((e as Error)?.message ?? e).slice(0, 200) }; }

  let cible = admin.from("cross_post_jobs")
    .select("id, user_id, inventaire_id, platform, action, status, title, description, price, photos, platform_fields, listing_url, platform_listing_id, created_at, voie")
    .eq("platform", "ebay").eq("voie", "api").eq("status", "pending")
    .order("created_at", { ascending: true }).limit(LOT_MAX);
  if (body.job_id) cible = cible.eq("id", body.job_id);
  const { data: jobs, error } = await cible;
  if (error) return json({ error: error.message }, 500);
  if (!jobs?.length) return json({ traites: 0, reprises, veille, quantites, vendeurs, aveugles, reroutees });

  const resultats: Record<string, unknown>[] = [];
  // Budget de la passe (lot 2) : au-delà de SCANS_MAX_PAR_PASSE scans Lens ou
  // de PASSE_MAX_MS, on rend la main — les jobs restés pending sont pris par
  // le tick suivant (2 min). Compteur PAR REQUÊTE, jamais au niveau module
  // (deux passes concurrentes partagent l'isolat).
  const passe: Passe = { scans: 0, debut: Date.now() };
  for (const brut of jobs as Job[]) {
    if (passe.scans >= SCANS_MAX_PAR_PASSE || Date.now() - passe.debut > PASSE_MAX_MS) {
      console.log(`[ebay-api-worker] passe bornée : ${passe.scans} scan(s) Lens, ${Math.round((Date.now() - passe.debut) / 1000)} s — le reste attend le tick suivant`);
      break;
    }
    // Claim atomique : seul celui qui fait passer pending → processing traite.
    // processing_since posé À LA PRISE (même clé que handler-watch) : c'est
    // lui que lit le chien de garde. Effacé par marquer() à la conclusion.
    const pfPrise = { ...(brut.platform_fields ?? {}), processing_since: new Date().toISOString() };
    // .eq("voie", "api") (27/09) : la prise elle-même exige la voie — un job
    // ne peut pas être pris par le worker s'il appartient à l'extension.
    const { data: pris } = await admin.from("cross_post_jobs").update({ status: "processing", handler_build: HANDLER_BUILD, platform_fields: pfPrise })
      .eq("id", brut.id).eq("status", "pending").eq("voie", "api").select("id");
    if (!pris?.length) continue;
    const job: Job = { ...brut, platform_fields: pfPrise };
    try {
      // ── COMPTE PAS PRÊT : ON PARQUE, ON N'ENVOIE RIEN (27/09) ──────────────
      // Un compte relié mais pas prêt (politiques non retenues, statut vendeur
      // bloqué) : rien ne partirait — hier l'échec tombait APRÈS le PUT de
      // l'article (étape politiques). needs_user nommé, aucune tentative
      // consommée ; ré-armé tout seul quand le compte devient prêt
      // (rearmerJobsEbayConnexionSiUtilisable). Les retraits ne sont pas
      // concernés : ils ne dépendent pas des politiques.
      // (09/10, Marta) UN COMPTE eBAY ÉTRANGER N'EST JAMAIS PUBLIÉ SUR ebay.fr
      // (règle de Nico) : FillSell ne publie que sur EBAY_FR ; un compte inscrit
      // sur un autre site (GetUser <Site>) est retenu AVANT tout appel, même
      // inachevé — lui dire « finis ta configuration » l'enverrait la faire sur
      // ebay.fr. Site illisible : rien n'est décidé ici (comme avant).
      if (job.action === "publish" || job.action === "republish") {
        const s = await siteDuCompteEbay(admin, env, job.user_id);
        if (s.site && siteEbayEtranger(s.site)) {
          job.platform_fields = { ...(job.platform_fields ?? {}), needs_user_source: SOURCE_EBAY_SITE_ETRANGER };
          await marquer(admin, job, { status: "needs_user", error: messageSiteEtranger(s.site, s.pseudo) }, { etape: "compte", quoi: "site_ebay_etranger", site: s.site });
          resultats.push({ job: job.id, issue: "needs_user", motif: "site_ebay_etranger" });
          continue;
        }
      }
      if ((job.action === "publish" || job.action === "republish") && !(await compteEbayApiUsable(admin, job.user_id))) {
        job.platform_fields = { ...(job.platform_fields ?? {}), needs_user_source: SOURCE_EBAY_COMPTE_A_FINIR };
        await marquer(admin, job, { status: "needs_user", error: MESSAGE_EBAY_COMPTE_A_FINIR }, { etape: "compte", quoi: "compte_pas_pret" });
        resultats.push({ job: job.id, issue: "needs_user", motif: "compte_pas_pret" });
        continue;
      }
      const jeton = await obtenirAccessToken(admin, job.user_id);
      if (!jeton.ok) {
        const msg = jeton.motif === "non_connecte" ? "Ton compte eBay n'est pas relié à FillSell : connecte-le dans les Paramètres, puis relance."
          : jeton.motif === "revoque" ? "eBay a retiré l'accès de FillSell à ton compte : reconnecte-le dans les Paramètres, puis relance."
          : `Jeton eBay indisponible (${jeton.motif}${jeton.detail ? ` : ${jeton.detail}` : ""}).`;
        await marquer(admin, job, { status: jeton.motif === "refresh_echoue" ? "pending" : "needs_user", error: msg }, { etape: "jeton", quoi: jeton.motif, detail: jeton.detail ?? null });
        resultats.push({ job: job.id, issue: "jeton", motif: jeton.motif });
        continue;
      }
      if (job.action === "publish" || job.action === "republish") {
        const res = job.action === "publish"
          ? await publier(admin, env, jeton.token, job, passe)
          : await republier(admin, env, jeton.token, job, passe);
        resultats.push(res);
        if (res.issue === "published") await noterVendeurPublication(admin, job.user_id, res.listing_id).catch(() => {});
      } else if (job.action === "delete") resultats.push(await retirer(admin, env, jeton.token, job));
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
  return json({ traites: resultats.length, scans_lens: passe.scans, veille, quantites, vendeurs, aveugles, reroutees, resultats });
});
