// ═══════════════════════════════════════════════════════════════════════════
// VINTED : LE FORMAT DU COLIS DÉDUIT DU RAYON QUAND VINTED LE DEMANDE (01/11 soir, décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « L'app doit le déduire seule de la catégorie quand la plateforme le demande (ex. magazines → petit colis), sur
// tout le parc, sans rien demander à l'utilisateur quand la catégorie suffit. »
// Le cas : gjehly 64d51931 (« Livres et médias › Magazines », catalog_id 5424). Vinted affiche Petit / Moyen / Grand
// et n'en coche aucun : la publication s'arrêtait sur la question « Format du colis » (needs_user champ_a_choisir,
// vinted.js questionFormatColis) — et ses 78 autres magazines l'auraient posée aussi.
// LA CATÉGORIE SUFFIT quand les vraies annonces Vinted de CE rayon (même catalog_id), dans tout le parc, portent
// presque toutes le même format : le format de l'annonce en ligne relevé à la republication
// (republish_snapshot.package_size_id, choisi par le vendeur chez Vinted) ou celui coché au dépôt (colis_bilan.id).
// Seuils (SEUILS_COLIS_RAYON) : au moins 5 articles, au moins 2 comptes, 90 % ou plus sur le même format — une
// observation par article (une annonce republiée trois fois compte une fois), les lots écartés (titreDeLot : leur
// taille ne se déduit pas du rayon, et un lot n'est jamais tranché). Toutes les tâches Vinted de 90 jours qui portent
// un format réel : annonce relevée à la republication, format coché au dépôt, format choisi par la personne.
// Magazines (relevé du 01/11) : 6 articles hors lots, 100 % « Petit » (« 9 classeurs », seul « Grand », est un lot).
// Remplace, pour CE cas seulement (Vinted ne coche rien, la personne n'a rien choisi), la règle du 05/10 « jamais
// choisi à ta place » : un format choisi par la personne et absent de la grille reste une question ; un rayon dont
// les annonces ne s'accordent pas, ou trop peu vu, aussi (le doute devient une question).
// ⛔ Jamais un format hors de la grille affichée par le formulaire (last_diagnostic « offerts : id|libellé ») ni hors
//    de la liste fermée de la question ; observé mais non offert → le plus petit offert qui suffit (même règle que
//    la republication, _shared/vinted-colis-tranche.js).
// ⛔ Une seule passe par job (colis_tranche_par_categorie) ; compare-and-swap sur needs_user chez l'appelant
//    (_shared/questions-tranchees.ts, règle 10, handler-watch).
// Pur (Deno + Node).
import { archiverErreur } from "./erreurs-archivees.js";
import { formatColisParCapacite, CODE_COLIS_VINTED, CLE_REPONSE_COLIS } from "./vinted-colis-tranche.js";

export const SEUILS_COLIS_RAYON = Object.freeze({ annonces: 5, comptes: 2, part: 0.9 });
// Un rayon sans accord n'est relu qu'une fois par jour par job (repère colis_rayon_sans_accord) : jamais deux lectures
// du parc toutes les 3 min pour une question qui restera posée.
export const RELECTURE_SANS_ACCORD_MS = 24 * 3600_000;
const TICKS = ["needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur"];
const comparable = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
// Les libellés de la grille Petit / Moyen / Grand, stables (référentiel de Vinted, 05/08 → 01/11) : repli quand la
// grille du diagnostic est illisible. Les grilles au poids changent de nom selon la famille : jamais devinées.
const PMG = Object.freeze({ petit: 1, moyen: 2, grand: 3 });

/** Le catalog_id Vinted d'un job (identifiants du rayon posés au service, sinon la capture). null si inconnu. */
export function catalogueDuJob(pf) {
  const id = Number(pf?.vinted_ids?.catalog_id ?? pf?.republish_snapshot?.catalog_id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Un LOT (« Lot de 5 magazines », « 9 classeurs », « x10 ») : sa taille ne se déduit pas du rayon — jamais compté
 * dans les observations, jamais tranché (sa question reste). Un titre qui commence par un nombre compte comme un lot
 * (« 1936 Le Soir… » aussi : le doute garde la question).
 */
export function titreDeLot(titre) {
  const t = String(titre ?? "");
  return /(^|[^\p{L}])lots?([^\p{L}]|$)/iu.test(t) || /^\s*\d+\s+\D/.test(t) || /(^|\s)[x×]\s?\d+\b/i.test(t) || /\b\d+\s?[x×](\s|$)/i.test(t);
}

/**
 * Le format que les annonces d'un rayon portent presque toutes, ou null (trop peu vu, ou pas d'accord).
 * Une observation par ARTICLE (une annonce republiée trois fois compte une fois), les lots écartés.
 * @param {Array<{ id?: unknown, user_id?: unknown, article?: unknown, titre?: unknown }>} annonces  format id, compte,
 *   article (inventaire_id, sinon l'id du job), titre
 * @returns {{ id: number, annonces: number, comptes: number, part: number } | null}
 */
export function formatDominantDuRayon(annonces, seuils = SEUILS_COLIS_RAYON) {
  const parFormat = new Map();
  const articlesVus = new Set();
  let total = 0;
  for (const a of Array.isArray(annonces) ? annonces : []) {
    const id = Number(a?.id);
    if (!Number.isInteger(id) || id <= 0 || !CODE_COLIS_VINTED[id]) continue;
    if (titreDeLot(a?.titre)) continue;
    const article = a?.article != null ? String(a.article) : null;
    if (article) {
      if (articlesVus.has(article)) continue;
      articlesVus.add(article);
    }
    total++;
    const f = parFormat.get(id) ?? { n: 0, comptes: new Set() };
    f.n++;
    if (a?.user_id != null) f.comptes.add(String(a.user_id));
    parFormat.set(id, f);
  }
  if (total < seuils.annonces) return null;
  const [id, f] = [...parFormat.entries()].sort((a, b) => b[1].n - a[1].n)[0] ?? [];
  if (!f) return null;
  const part = f.n / total;
  if (part < seuils.part || f.comptes.size < seuils.comptes) return null;
  return { id, annonces: total, comptes: f.comptes.size, part: Math.round(part * 1000) / 1000 };
}

/** La grille affichée par le formulaire, lue dans le diagnostic de la question (« offerts : 1|Petit · 2|Moyen »). */
export function grilleDuDiagnosticColis(diagnostic) {
  const m = String(diagnostic ?? "").match(/offerts\s*:\s*([^;]*)/);
  if (!m) return [];
  const vus = new Set();
  return m[1].split("·")
    .map((s) => { const x = s.trim().match(/^(\d+)\|([^|]+)/); return x ? { id: Number(x[1]), libelle: x[2].trim() } : null; })
    .filter((g) => g && g.id > 0 && g.libelle && !vus.has(g.id) && vus.add(g.id));
}

/** Une question « Format du colis » d'une PUBLICATION Vinted que la catégorie peut trancher (avant toute lecture). */
export function estQuestionColisPublication(job, maintenantMs = Date.now()) {
  if (!job || job.platform !== "vinted" || (job.action ?? "publish") !== "publish" || job.status !== "needs_user") return false;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : null;
  if (!pf || pf.needs_user_source !== "champ_a_choisir" || pf.colis_tranche_par_categorie) return false;
  const vu = Date.parse(String(pf.colis_rayon_sans_accord?.le ?? ""));
  if (Number.isFinite(vu) && maintenantMs - vu < RELECTURE_SANS_ACCORD_MS) return false;
  const nuf = pf.needsUserField;
  if (!nuf || nuf.field_key !== "colis" || nuf.target?.root !== "colis_choisi" || nuf.target?.key !== "libelle") return false;
  // La personne avait choisi un format (copie, fiche, retenu du rayon) : Vinted ne le propose pas — sa question reste.
  if (String(pf.colis_choisi?.libelle ?? "").trim() || pf.packageSizeId != null || String(pf.packageSize ?? "").trim()) return false;
  if (titreDeLot(job.title)) return false; // un lot : sa taille ne se déduit pas du rayon
  return catalogueDuJob(pf) != null;
}

/**
 * La règle 10 pour UN job : null (pas son cas, rayon sans accord) ou ce qui s'écrit.
 * @param {object} job
 * @param {{ id: number, annonces: number, comptes: number, part: number } | null} observe  formatDominantDuRayon(…)
 * @returns {{ platform_fields: Record<string, unknown>, choix: { id: number, libelle: string, regle: string } } | null}
 */
export function colisPublicationATrancher(job, observe, maintenant = new Date().toISOString()) {
  if (!estQuestionColisPublication(job, Date.parse(maintenant)) || !observe) return null;
  const pf = job.platform_fields;
  const nuf = pf.needsUserField;
  const liste = Array.isArray(nuf.allowed_values) ? nuf.allowed_values.map(String) : [];
  if (!liste.length) return null;
  let grille = grilleDuDiagnosticColis(pf.last_diagnostic);
  if (!grille.length) {
    // Repli : la liste de la question, seulement si elle n'est faite que de Petit / Moyen / Grand.
    const ids = liste.map((l) => PMG[comparable(l)]);
    if (ids.some((x) => !x)) return null;
    grille = liste.map((l, i) => ({ id: ids[i], libelle: l }));
  }
  const offert = grille.find((g) => g.id === observe.id);
  const choixBrut = offert ? { id: offert.id, libelle: offert.libelle, regle: "format_du_rayon" } : formatColisParCapacite(observe.id, grille);
  if (!choixBrut) return null;
  const libelle = liste.find((x) => comparable(x) === comparable(choixBrut.libelle));
  if (!libelle) return null; // hors de la liste fermée de la question : jamais posé
  const np = { ...pf };
  for (const k of ["needs_user_source", "needsUserField", "needsUserFields", "champs_a_completer", ...TICKS, "next_action_after", "processing_since"]) delete np[k];
  np.needsUserAttempts = 0;
  np.colis_choisi = { ...(pf.colis_choisi && typeof pf.colis_choisi === "object" ? pf.colis_choisi : {}), libelle };
  np.needsUserResolved = { ...(pf.needsUserResolved ?? {}), [CLE_REPONSE_COLIS]: libelle };
  np.colis_tranche_par_categorie = {
    le: maintenant,
    catalog_id: catalogueDuJob(pf),
    rayon: Array.isArray(pf.categoryPath) ? pf.categoryPath : null,
    observe: { id: observe.id, code: CODE_COLIS_VINTED[observe.id] ?? null, annonces: observe.annonces, comptes: observe.comptes, part: observe.part },
    grille: grille.map((g) => `${g.id}|${g.libelle}`),
    choix: { id: choixBrut.id, libelle, code: CODE_COLIS_VINTED[choixBrut.id] ?? null },
    regle: choixBrut.regle,
    par: "handler-watch (questions tranchées, règle 10)",
  };
  np.erreurs_archivees = archiverErreur(pf.erreurs_archivees, job.error ?? null, "needs_user", "handler-watch (format du colis déduit du rayon)");
  delete np.colis_rayon_sans_accord;
  return { platform_fields: np, choix: { id: choixBrut.id, libelle, regle: choixBrut.regle } };
}

/** Le repère d'un rayon sans accord (la question reste) : platform_fields à écrire, statut inchangé. */
export function repereSansAccord(job, observe, maintenant = new Date().toISOString()) {
  const pf = job?.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  return { ...pf, colis_rayon_sans_accord: { le: maintenant, catalog_id: catalogueDuJob(pf), observe: observe ?? null } };
}
