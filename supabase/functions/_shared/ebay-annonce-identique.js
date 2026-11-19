// ═══════════════════════════════════════════════════════════════════════════
// eBay REFUSE UNE ANNONCE IDENTIQUE À UNE AUTRE DU MÊME COMPTE (25002) — 19/11/2026, point 7 du lot de Nico
// ═══════════════════════════════════════════════════════════════════════════
// Le cas (18/11, compte au Cloud) : cinq bouilloires identiques, cinq articles distincts du stock. eBay accepte les
// quatre premières et refuse la cinquième à la mise en ligne (publishOffer, HTTP 400, errorId 25002 : « Cette annonce
// semble concerner un objet que vous avez déjà mis en vente sur eBay : <titre> (<n°>). Les annonces d'objets identiques
// d'un même vendeur ne peuvent pas être affichées en même temps sur eBay. Pour mettre en vente plusieurs exemplaires d'un
// même objet, créez une annonce à quantité multiple au format Prix fixe. », paramètres 0 = titre, 1 = n° de l'annonce
// identique, 2 = …/help/policies/listing-multi.html). La tâche affichait le brut d'eBay (« Une erreur utilisateur est
// survenue… [0=…, 1=…, 2=http…] ») et le trigger cross_post_jobs_needs_user_motif lui posait « relancer » : une relance
// retombe sur le même mur.
// LA RÈGLE (tous les comptes) :
//   · le refus est reconnu (25002 + « objets identiques » / listing-multi), jamais confondu avec les autres 25002
//     (EAN, retours, plafond de vente — chacun a sa règle) ;
//   · la tâche attend sous sa source (SOURCE_EBAY_ANNONCE_IDENTIQUE), avec la vraie raison et l'annonce identique
//     nommée ; aucune relance proposée (relanceSansObjetEbay, lue par l'écran) : relancer tel quel serait refusé de même ;
//   · elle repart SEULE (ebay-api-worker, annoncesIdentiquesEntretien) dès que l'annonce identique n'est plus en ligne
//     (vendue, retirée — lu dans les tâches de FillSell, aucun appel à eBay) ; inconnue de FillSell : un essai par jour,
//     eBay tranche ;
//   · les tâches déjà posées (« relancer », diagnostic 25002 « objets identiques ») sont reclassées par le même passage.
// ⛔ Le regroupement en une annonce à quantité n'est PAS fait ici (proposition au rapport du 19/11, décision de Nico).
// Module PUR (aucun import) : lu par ebay-api-worker, l'app (utils/messagesServeur.js) et le selftest.
// Selftest : scripts/ebay-doublon-25002-selftest.mjs (npm run selftest:ebay-doublon-25002).

export const SOURCE_EBAY_ANNONCE_IDENTIQUE = "ebay_annonce_identique";
/** La marque datée : { depuis, dernier_essai_le, annonce, titre, essais, repris_le?, motif_reprise? }. */
export const CLE_ANNONCE_IDENTIQUE = "ebay_annonce_identique";
/** Annonce identique inconnue de FillSell : un essai par jour au plus (eBay tranche). */
export const DELAI_ESSAI_ANNONCE_IDENTIQUE_MS = 24 * 3600_000;

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const PHRASE_IDENTIQUE_RE = /objets? identiques|déjà mis en vente sur eBay|identical items|already have on eBay/i;
const NUMERO_RE = /^\d{9,15}$/;

/**
 * Le refus d'eBay est-il « une annonce identique à une autre du même vendeur » ?
 * @param {{ errorId?: number|string|null, message?: string|null, params?: Array<{ name?: string, value?: string }> } | null | undefined} e
 * @returns {boolean}
 */
export function refusAnnonceIdentique(e) {
  if (!e || typeof e !== "object") return false;
  const code = Number(e.errorId);
  if (code !== 25002 && code !== 21919067) return false;
  const params = Array.isArray(e.params) ? e.params.map((p) => String(p?.value ?? "")) : [];
  if (params.some((v) => /listing-multi/i.test(v))) return true;
  return PHRASE_IDENTIQUE_RE.test(String(e.message ?? ""));
}

const titrePropre = (t) => {
  const s = String(t ?? "").replace(/[«»"“”]/g, "").replace(/\s+/g, " ").trim();
  return s && !/^https?:/i.test(s) && !NUMERO_RE.test(s) ? s.slice(0, 80) : null;
};

/**
 * L'annonce identique nommée par eBay : son numéro (paramètre « 1 ») et son titre (paramètre « 0 ») ; sans paramètres,
 * lus dans la phrase (« … sur eBay : <titre> (<n°>) »).
 * @param {{ message?: string|null, params?: Array<{ name?: string, value?: string }> } | null | undefined} e
 * @returns {{ annonce: string|null, titre: string|null }}
 */
export function annonceIdentiqueDe(e) {
  const params = Array.isArray(e?.params) ? e.params : [];
  const par = (nom) => String(params.find((p) => String(p?.name ?? "") === nom)?.value ?? "").trim();
  let annonce = NUMERO_RE.test(par("1")) ? par("1") : null;
  let titre = titrePropre(par("0"));
  if (!annonce || !titre) {
    const m = String(e?.message ?? "").match(/(?:sur eBay|on eBay)\s*:\s*(.+?)\s*\((\d{9,15})\)/i);
    if (m) {
      annonce = annonce ?? m[2];
      titre = titre ?? titrePropre(m[1]);
    }
  }
  return { annonce, titre };
}

/**
 * Le message de la tâche : la vraie raison, l'annonce identique nommée, la reprise automatique — jamais « relance »,
 * jamais d'adresse, jamais le code ni les paramètres bruts.
 * @param {{ titre?: string|null, annonce?: string|null } | null | undefined} id
 * @param {string} [lang]
 * @returns {string}
 */
export function messageAnnonceIdentique(id, lang = "fr") {
  const t = titrePropre(id?.titre);
  if (lang === "en") {
    return "eBay doesn't allow two identical listings at the same time on one account: this item is the same as "
      + (t ? `your listing “${t}”` : "one of your listings")
      + " already live on eBay. Nothing was published, and another attempt would be refused the same way while it is live."
      + " FillSell will list it on its own as soon as that listing is sold or removed.";
  }
  return "eBay n'accepte pas deux annonces identiques en même temps sur un même compte : cet article est le même que "
    + (t ? `ton annonce « ${t} »` : "une de tes annonces")
    + " déjà en ligne sur eBay. Rien n'a été publié, et un nouvel essai serait refusé de même tant qu'elle est en ligne."
    + " FillSell le mettra en vente tout seul dès qu'elle sera vendue ou retirée.";
}

const MESSAGE_FR_RE = /^eBay n'accepte pas deux annonces identiques en même temps sur un même compte : cet article est le même que (?:ton annonce « (.+) »|une de tes annonces) déjà en ligne sur eBay\. Rien n'a été publié, et un nouvel essai serait refusé de même tant qu'elle est en ligne\. FillSell le mettra en vente tout seul dès qu'elle sera vendue ou retirée\.$/;
/**
 * La phrase française (écrite en base par ebay-api-worker) en anglais — utils/messagesServeur.js ; null sinon.
 * @param {unknown} texte
 * @returns {string|null}
 */
export function traduireTexteAnnonceIdentique(texte) {
  const m = String(texte ?? "").trim().match(MESSAGE_FR_RE);
  return m ? messageAnnonceIdentique({ titre: m[1] ?? null }, "en") : null;
}

const CLES_ATTENTE = ["processing_since", "next_action_after", "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le",
  "needs_user_vu_erreur", "needs_user_sans_motif"];

/**
 * L'écriture d'une tâche refusée « annonce identique » (pure : la tâche d'entrée n'est pas modifiée). Refusée de
 * nouveau après une reprise : même attente, essais comptés, la dernière annonce identique nommée retenue.
 * @param {{ platform_fields?: unknown } | null | undefined} job
 * @param {{ errorId?: number|string|null, message?: string|null, params?: Array<{ name?: string, value?: string }> } | null | undefined} refus
 * @param {{ maintenant?: string }} [options]
 * @returns {{ status: 'needs_user', error: string, platform_fields: Record<string, unknown> }}
 */
export function ecritureAnnonceIdentique(job, refus, { maintenant = new Date().toISOString() } = {}) {
  const pf = { ...(objet(job?.platform_fields) ?? {}) };
  for (const k of CLES_ATTENTE) delete pf[k];
  const avant = objet(pf[CLE_ANNONCE_IDENTIQUE]);
  const { annonce, titre } = annonceIdentiqueDe(refus);
  pf.needs_user_source = SOURCE_EBAY_ANNONCE_IDENTIQUE;
  pf[CLE_ANNONCE_IDENTIQUE] = {
    depuis: avant?.depuis ?? maintenant,
    dernier_essai_le: maintenant,
    annonce: annonce ?? avant?.annonce ?? null,
    titre: titre ?? avant?.titre ?? null,
    essais: (Number(avant?.essais) || 0) + 1,
  };
  return { status: "needs_user", error: messageAnnonceIdentique({ titre: titre ?? avant?.titre ?? null }, "fr"), platform_fields: pf };
}

/**
 * L'écran : aucune relance proposée tant que la tâche attend l'annonce identique (relancer tel quel serait refusé de
 * même, elle repart seule). À lire par la relance manuelle de l'app (StockTab relanceManuelleInfoDuJob).
 * @param {{ status?: string, platform?: string, platform_fields?: unknown } | null | undefined} job
 * @returns {boolean}
 */
export function relanceSansObjetEbay(job) {
  return job?.status === "needs_user" && job?.platform === "ebay"
    && objet(job?.platform_fields)?.needs_user_source === SOURCE_EBAY_ANNONCE_IDENTIQUE;
}

/**
 * L'annonce identique est-elle encore en ligne ? Lu dans les tâches eBay de FillSell qui portent son numéro (aucun
 * appel à eBay) : publiée (publish / republish « published ») et ni vendue ni retirée APRÈS ; inconnue → rien conclu.
 * @param {Array<{ platform_listing_id?: unknown, action?: string, status?: string, created_at?: string }> | null | undefined} lignes
 * @param {string} annonce
 * @returns {{ connue: boolean, en_ligne: boolean|null }}
 */
export function jumelleDepuisTaches(lignes, annonce) {
  const n = String(annonce ?? "").trim();
  const siennes = (Array.isArray(lignes) ? lignes : []).filter((l) => String(l?.platform_listing_id ?? "").trim() === n);
  if (!n || !siennes.length) return { connue: false, en_ligne: null };
  const quand = (l) => { const x = Date.parse(String(l?.created_at ?? "")); return Number.isFinite(x) ? x : 0; };
  const mises = siennes.filter((l) => ["publish", "republish"].includes(String(l?.action ?? "publish")));
  if (mises.some((l) => l?.status === "sold")) return { connue: true, en_ligne: false };
  const enLigne = mises.filter((l) => l?.status === "published");
  if (!enLigne.length) return { connue: true, en_ligne: false };
  const derniereMise = Math.max(...enLigne.map(quand));
  const retireeApres = siennes.some((l) => l?.action === "delete" && l?.status === "deleted" && quand(l) > derniereMise);
  return { connue: true, en_ligne: !retireeApres };
}

/**
 * La reprise est-elle due ? Annonce identique connue et plus en ligne → tout de suite ; connue et en ligne → jamais ;
 * inconnue de FillSell → un essai par jour (eBay tranche). Une tâche qui n'attend pas l'annonce identique : jamais.
 * @param {{ status?: string, platform_fields?: unknown } | null | undefined} job
 * @param {{ connue?: boolean, en_ligne?: boolean|null } | null | undefined} jumelle
 * @param {{ maintenant?: number }} [options]
 * @returns {{ due: boolean, motif: 'annonce_identique_terminee'|'essai_quotidien'|null }}
 */
export function repriseAnnonceIdentiqueDue(job, jumelle, { maintenant = Date.now() } = {}) {
  const non = { due: false, motif: null };
  if (!job || job.status !== "needs_user") return non;
  const pf = objet(job.platform_fields) ?? {};
  if (pf.needs_user_source !== SOURCE_EBAY_ANNONCE_IDENTIQUE) return non;
  const m = objet(pf[CLE_ANNONCE_IDENTIQUE]);
  if (!m) return non;
  if (jumelle?.connue === true) return jumelle.en_ligne === false ? { due: true, motif: "annonce_identique_terminee" } : non;
  const dernier = Date.parse(String(m.dernier_essai_le ?? m.depuis ?? ""));
  if (!Number.isFinite(dernier) || maintenant - dernier >= DELAI_ESSAI_ANNONCE_IDENTIQUE_MS) return { due: true, motif: "essai_quotidien" };
  return non;
}

/**
 * L'écriture de la reprise (pure) : en file, message effacé (archivé), source levée, marque gardée avec la reprise
 * datée et motivée. `archiver` = _shared/erreurs-archivees.js archiverErreur.
 * @param {{ status?: string, error?: string|null, platform_fields?: unknown } | null | undefined} job
 * @param {{ motif?: string|null, maintenant?: string, archiver?: Function }} [options]
 * @returns {{ status: 'pending', error: null, platform_fields: Record<string, unknown> }}
 */
export function ecritureRepriseAnnonceIdentique(job, { motif = null, maintenant = new Date().toISOString(), archiver = null } = {}) {
  const pf = { ...(objet(job?.platform_fields) ?? {}) };
  if (job?.error && typeof archiver === "function") {
    pf.erreurs_archivees = archiver(pf.erreurs_archivees, String(job.error), job?.status ?? "needs_user", `ebay-api-worker (annonce identique : ${motif ?? "reprise"})`);
  }
  delete pf.needs_user_source;
  for (const k of CLES_ATTENTE) delete pf[k];
  pf[CLE_ANNONCE_IDENTIQUE] = { ...(objet(pf[CLE_ANNONCE_IDENTIQUE]) ?? {}), repris_le: maintenant, motif_reprise: motif };
  return { status: "pending", error: null, platform_fields: pf };
}

/**
 * Le refus d'eBay relu dans le diagnostic gardé d'une tâche (last_diagnostic : errorId, message, brut d'eBay) —
 * pour reclasser une tâche posée avant la règle, sans appel à eBay.
 * @param {unknown} diag
 * @returns {{ errorId: number|null, message: string, params: Array<{ name: string, value: string }> } | null}
 */
export function refusDepuisDiagnostic(diag) {
  const d = objet(diag);
  if (!d) return null;
  let params = [];
  try {
    const brut = typeof d.brut === "string" ? JSON.parse(d.brut) : objet(d.brut);
    const premier = Array.isArray(brut?.errors) ? brut.errors[0] : null;
    if (Array.isArray(premier?.parameters)) params = premier.parameters.map((p) => ({ name: String(p?.name ?? ""), value: String(p?.value ?? "") }));
  } catch { params = []; }
  const code = Number(d.errorId);
  return { errorId: Number.isFinite(code) ? code : null, message: String(d.message ?? ""), params };
}

/**
 * Une tâche posée AVANT la règle (needs_user eBay, source « relancer » ou aucune, diagnostic « objets identiques ») ?
 * @param {{ status?: string, platform?: string, platform_fields?: unknown } | null | undefined} job
 * @returns {boolean}
 */
export function aReclasserAnnonceIdentique(job) {
  if (!job || job.status !== "needs_user" || job.platform !== "ebay") return false;
  const pf = objet(job.platform_fields) ?? {};
  const src = String(pf.needs_user_source ?? "");
  if (src && src !== "relancer") return false;
  return refusAnnonceIdentique(refusDepuisDiagnostic(pf.last_diagnostic));
}
