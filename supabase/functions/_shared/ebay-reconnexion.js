// ═══════════════════════════════════════════════════════════════════════════
// eBay — L'ACCÈS RETIRÉ PAR eBAY (invalid_grant) ET LA RECONNEXION (18/11/2026, point 7 du lot de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// eBay coupe le jeton de renouvellement d'un compte qui change son pseudo ou son mot de passe, qui retire l'accès depuis
// « Mon eBay », ou que son service client restreint (eBay KB 5218). 15 comptes à reconnecter au 18/11 ; le 16/11, un
// compte au Cloud relié à 13:08 sous le pseudo généré par eBay l'avait personnalisé avant 15:07 : premier
// renouvellement refusé à 15:06. Ce que FillSell faisait mal autour (rapport du 18/11, point 7) :
//   · la tâche du moment passait « … puis relance », sans source ré-armable : rien ne la relançait à la reconnexion ;
//   · la reconnexion du MÊME compte (même EIAS) sous son nouveau pseudo était prise pour un « AUTRE compte eBay » :
//     politiques, état vendeur et lieu d'expédition effacés, annonces notées sous l'ancien pseudo (retrait refusé) ;
//   · tout 400/401 révoquait, la révocation n'était ni journalisée ni gardée.
// Ce module porte la règle PURE (aucun import : lue par ebay-oauth.ts, ebay-oauth-callback, ebay-api-worker et le
// selftest) et un seul geste en base, borné, pour les annonces d'un compte renommé.
// Selftest : scripts/ebay-reconnexion-reprise-selftest.mjs (npm run selftest:ebay-reconnexion-reprise).

/** La source d'une tâche qui attend la (re)connexion du compte eBay : ré-armable (ebay-voie.ts SOURCES_EBAY_REARMABLES),
 *  même bouton « Connecte ton compte eBay » dans l'app. */
export const SOURCE_EBAY_ACCES_RETIRE = "ebay_connexion_requise";
/** La marque datée posée sur la tâche : { le, motif } — lue par le filet de reprise d'ebay-api-worker. */
export const CLE_ACCES_RETIRE = "ebay_acces_retire";
/** Les motifs d'obtenirAccessToken qui attendent un geste de la personne (se reconnecter / se relier). */
export const MOTIFS_ACCES_RETIRE = Object.freeze(["revoque", "non_connecte"]);

export const MESSAGE_EBAY_ACCES_RETIRE =
  "eBay a coupé l'accès de FillSell à ton compte eBay : cela arrive quand on change son pseudo ou son mot de passe eBay, " +
  "ou qu'on retire l'accès depuis « Mon eBay ». Reconnecte ton compte dans Réglages › Mes plateformes › eBay : " +
  "cette tâche repartira toute seule. Rien n'a été envoyé à eBay.";
export const MESSAGE_EBAY_NON_RELIE =
  "Ton compte eBay n'est pas relié à FillSell : relie-le dans Réglages › Mes plateformes › eBay, " +
  "et cette tâche repartira toute seule. Rien n'a été envoyé à eBay.";

const pseudoNorm = (p) => String(p ?? "").trim().toLowerCase();
const texteOuNull = (v) => { const s = String(v ?? "").trim(); return s ? s : null; };

/**
 * Le compte eBay qui revient est-il celui d'avant ? L'EIAS (identifiant IMMUABLE, GetUser <EIASToken>) décide quand il
 * est connu des deux côtés : même EIAS = même compte, même sous un autre pseudo (« renommé ») ; le pseudo ne décide que
 * si l'EIAS manque d'un côté ; rien de connu = rien de prouvé (null : rien n'est effacé).
 * @param {{ ebay_user_id?: string|null, ebay_eias_token?: string|null } | null} avant  la ligne ebay_accounts d'avant
 * @param {{ username?: string|null, eiasToken?: string|null } | null} identite          GetUser au retour du consentement
 * @returns {{ meme: boolean|null, renomme: boolean, preuve: 'eias'|'pseudo'|null, ancienPseudo: string|null, nouveauPseudo: string|null }}
 */
export function memeCompteEbay(avant, identite) {
  const ancienPseudo = texteOuNull(avant?.ebay_user_id);
  const nouveauPseudo = texteOuNull(identite?.username);
  const eiasAvant = texteOuNull(avant?.ebay_eias_token);
  const eiasApres = texteOuNull(identite?.eiasToken);
  const pseudoChange = Boolean(ancienPseudo && nouveauPseudo && pseudoNorm(ancienPseudo) !== pseudoNorm(nouveauPseudo));
  if (eiasAvant && eiasApres) {
    const meme = eiasAvant === eiasApres;
    return { meme, renomme: meme && pseudoChange, preuve: "eias", ancienPseudo, nouveauPseudo };
  }
  if (ancienPseudo && nouveauPseudo) return { meme: !pseudoChange, renomme: false, preuve: "pseudo", ancienPseudo, nouveauPseudo };
  return { meme: null, renomme: false, preuve: null, ancienPseudo, nouveauPseudo };
}

/**
 * Le verdict d'une réponse de l'endpoint token au renouvellement (pure). SEUL invalid_grant est une révocation (jeton
 * retiré ou expiré côté eBay : état normal, « à reconnecter ») ; un autre 400/401 (invalid_client, invalid_scope,
 * invalid_request) refuse NOTRE requête — jamais une révocation du compte ; le reste (5xx, réseau, 2xx sans jeton) est
 * transitoire.
 * @param {{ http?: number, error?: string | null, access_token?: string | null } | null | undefined} r
 * @returns {'ok'|'revoque'|'refuse'|'transitoire'}
 */
export function verdictRenouvellement(r) {
  const http = Number(r?.http ?? 0);
  if (http >= 200 && http < 300 && r?.access_token) return "ok";
  if (String(r?.error ?? "") === "invalid_grant") return "revoque";
  if (http === 400 || http === 401) return "refuse";
  return "transitoire";
}

const JETON_MASQUE = "[jeton masqué]";
/**
 * Le texte d'eBay (error_description), gardé pour le log et la trace — sans aucun morceau de jeton : un jeton OAuth eBay
 * (« v^1.1#… »), un jeton Auth'n'Auth (« AgAAAA**… ») ou toute longue suite opaque est masqué ; 160 caractères au plus.
 * @param {unknown} texte
 * @returns {string}
 */
export function descriptionEbaySure(texte) {
  if (texte == null) return "";
  return String(texte)
    .replace(/v\^1\.1#\S*/g, JETON_MASQUE)
    .replace(/AgAAAA\*\*\S*/g, JETON_MASQUE)
    .replace(/[A-Za-z0-9+/=_.-]{24,}/g, JETON_MASQUE)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

const CLES_ATTENTE = ["processing_since", "next_action_after", "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur"];

/**
 * L'écriture d'une tâche eBay dont le jeton n'a pas pu être obtenu (pure : la tâche d'entrée n'est pas modifiée).
 *   · revoque / non_connecte → needs_user sous la source ré-armable (SOURCE_EBAY_ACCES_RETIRE), marque datée
 *     (CLE_ACCES_RETIRE), message qui dit la cause probable et que la tâche repartira seule — plus jamais « puis relance » ;
 *   · refresh_echoue (eBay muet) → pending, comme avant ;
 *   · autre (refresh_refuse, config_incomplete, base) → needs_user « Jeton eBay indisponible (…) », sans source
 *     ré-armable : pas de boucle d'appels, jamais présenté comme une reconnexion.
 * @param {{ platform_fields?: unknown } | null | undefined} job
 * @param {{ motif?: string | null, detail?: string | null, maintenant?: string }} [options]
 * @returns {{ status: 'needs_user'|'pending', error: string, platform_fields: Record<string, unknown> }}
 */
export function ecritureJetonRefuse(job, { motif = null, detail = null, maintenant = new Date().toISOString() } = {}) {
  const pf = { ...(job?.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {}) };
  delete pf.processing_since;
  const m = String(motif ?? "");
  if (MOTIFS_ACCES_RETIRE.includes(m)) {
    for (const k of CLES_ATTENTE) delete pf[k];
    pf.needs_user_source = SOURCE_EBAY_ACCES_RETIRE;
    const d = detail ? descriptionEbaySure(detail) : "";
    pf[CLE_ACCES_RETIRE] = { le: maintenant, motif: m, ...(d ? { detail: d } : {}) };
    return { status: "needs_user", error: m === "revoque" ? MESSAGE_EBAY_ACCES_RETIRE : MESSAGE_EBAY_NON_RELIE, platform_fields: pf };
  }
  // Plus d'attente de reconnexion : une marque d'un arrêt précédent ne doit pas faire ré-armer une tâche dont le jeton
  // est refusé pour une autre raison (elle repartirait buter sur le même refus).
  if (pf.needs_user_source === SOURCE_EBAY_ACCES_RETIRE) delete pf.needs_user_source;
  delete pf[CLE_ACCES_RETIRE];
  const d = detail ? descriptionEbaySure(detail) : "";
  return {
    status: m === "refresh_echoue" ? "pending" : "needs_user",
    error: `Jeton eBay indisponible (${m || "inconnu"}${d ? ` : ${d}` : ""}).`,
    platform_fields: pf,
  };
}

/**
 * Le filet d'ebay-api-worker : une tâche arrêtée sur l'accès retiré est-elle à relancer ? Oui quand elle attend encore
 * (needs_user, source et marque de ce module) et que le compte a été reconnecté APRÈS l'arrêt (connected_at > marque),
 * non révoqué. La relance elle-même passe par rearmerJobsEbayConnexionSiUtilisable (compte prêt exigé). Pure.
 * @param {{ status?: string, platform_fields?: unknown } | null | undefined} job
 * @param {Record<string, unknown> | null | undefined} compte  { revoked_at, connected_at } de ebay_accounts
 * @returns {boolean}
 */
export function repriseApresReconnexionDue(job, compte) {
  if (!job || job.status !== "needs_user") return false;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  if (pf.needs_user_source !== SOURCE_EBAY_ACCES_RETIRE) return false;
  const le = Date.parse(String(pf[CLE_ACCES_RETIRE]?.le ?? ""));
  if (!Number.isFinite(le)) return false;
  if (!compte || compte.revoked_at != null) return false;
  const connecte = Date.parse(String(compte.connected_at ?? ""));
  return Number.isFinite(connecte) && connecte > le;
}

/**
 * Un compte RENOMMÉ (même EIAS, autre pseudo) : ses annonces notées sous l'ancien pseudo (ebay_vendeurs_annonces) le
 * suivent, sinon un retrait les croirait « sur un autre compte » (ebay-api-worker annonceDUnAutreCompte) et ne les
 * retirerait pas. Seules les annonces eBay de CE compte FillSell (tâches et relevés), seules les lignes qui portent
 * l'ancien pseudo (casse ignorée) ; aucune ligne inchangée réécrite. Lectures par pages de 1 000 (5 pages au plus),
 * .in() par lots de 100. Jamais une exception qui remonte. (service_role)
 * @returns {Promise<{ annonces: number, renommees: number, erreur?: string }>}
 */
export async function renommerVendeurAnnoncesEbay(admin, userId, ancien, nouveau, { pagesMax = 5 } = {}) {
  const a = String(ancien ?? "").trim();
  const b = String(nouveau ?? "").trim();
  if (!admin || !userId || !a || !b || a.toLowerCase() === b.toLowerCase()) return { annonces: 0, renommees: 0 };
  try {
    const ids = new Set();
    const lirePages = async (table, colonne, filtrer) => {
      for (let p = 0; p < pagesMax; p++) {
        const { data, error } = await filtrer(admin.from(table).select(colonne)).order(colonne, { ascending: true }).range(p * 1000, p * 1000 + 999);
        if (error) return;
        for (const r of data ?? []) { const id = String(r?.[colonne] ?? "").trim(); if (/^\d{9,15}$/.test(id)) ids.add(id); }
        if (!data || data.length < 1000) return;
      }
    };
    await lirePages("cross_post_jobs", "platform_listing_id", (q) => q.eq("user_id", userId).eq("platform", "ebay").not("platform_listing_id", "is", null));
    await lirePages("annonces_plateforme", "listing_id", (q) => q.eq("user_id", userId).eq("platform", "ebay"));
    const liste = [...ids];
    let renommees = 0;
    for (let i = 0; i < liste.length; i += 100) {
      const lot = liste.slice(i, i + 100);
      const { data: lignes } = await admin.from("ebay_vendeurs_annonces").select("listing_id, vendeur").in("listing_id", lot);
      const parValeur = new Map();
      for (const l of lignes ?? []) {
        const v = String(l?.vendeur ?? "");
        if (v.trim().toLowerCase() !== a.toLowerCase()) continue;
        parValeur.set(v, [...(parValeur.get(v) ?? []), String(l.listing_id)]);
      }
      for (const [v, idsV] of parValeur) {
        const { data: maj } = await admin.from("ebay_vendeurs_annonces").update({ vendeur: b })
          .in("listing_id", idsV).eq("vendeur", v).select("listing_id");
        renommees += maj?.length ?? 0;
      }
    }
    return { annonces: liste.length, renommees };
  } catch (e) {
    return { annonces: 0, renommees: 0, erreur: String(e?.message ?? e).slice(0, 200) };
  }
}
