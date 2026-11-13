// ═══════════════════════════════════════════════════════════════════════════
// (13/11, bloc C1) UNE ANNONCE ABSENTE DE DEUX RELEVÉS COMPLETS ET CONCORDANTS N'EST PLUS « EN LIGNE »
// ═══════════════════════════════════════════════════════════════════════════
// Cas (compte 7153db13, Premium) : une annonce Leboncoin plus vue par aucun relevé depuis le 05/11 ; le 09/11 à 17:54,
// constater_absences_releve (deux relevés probants distincts DU MÊME COMPTE, releve_preuve_absence : finis, complets,
// lus ≥ annoncés, jamais « incomplet ») a posé son constat sur le dépôt — platform_fields.absence_releves { premier,
// second, listing_id, le }, sale_signal « unavailable », unavailable_since — et ouvert la question « Annonce plus en
// ligne — Vendue ? » d'« À régler ». Le dépôt reste « published » (c'est voulu : la personne répond ; le juge
// « annonce publiée disparue » de handler-watch ne clôt que sur des lectures ratées à répétition). Mais la CARTE ne lisait
// que le statut du job : « En ligne », et « Republier » proposé puis refusé par le serveur (republication_annonce_partie,
// branche « constat » : annonce_introuvable:annonce_partie — 13/11 17:42, 17:49, 19:21).
//
// RÈGLE (toutes les plateformes où le serveur pose le constat : Leboncoin, eBay, Depop — Beebs jamais, sa modération
// l'interdit ; Vinted a sa règle, celle de l'ARTICLE : inventaire.disparu_le) :
//  · AFFICHAGE — une plateforme n'est plus « en ligne » quand TOUTES ses annonces publiées portent un constat CONCORDANT :
//    deux relevés distincts, sur CE numéro, l'alerte du constat toujours debout (unavailable_since : effacé dès qu'un
//    relevé la revoit — alerte_lever_revues_plateformes — ou que la veille relit la page en ligne — background.js), et
//    jamais revue depuis (revue_en_ligne_par_releve, vu_en_ligne_le). La plateforme reste OCCUPÉE (garde serveur
//    already_published : jamais un 2e dépôt ; un retrait après vente la vise toujours). L'app le dit avec le vocabulaire
//    qui existe : pastille « Hors ligne · date », « Plus vue en ligne … : vendue ou retirée ? », et la question.
//  · GESTE — « Remonter / Republier » n'est jamais proposé quand le serveur le refusera : la source de la republication
//    (dernier dépôt publié avec lien, spend_coins_and_republish) porte le constat de SON numéro, non démenti par un relevé
//    (le serveur lève la garde quand un relevé la revoit ; il ne lit pas la veille).
//  · Jamais sur un doute seul (sale_signal « unavailable » sans constat), un relevé seul, un autre numéro, une
//    publication ou une republication en vol, une annonce en vérification, une preuve de vente (son état à elle).
// Module de l'app seul (l'extension embarque publicationState.js : il ne bouge pas). Verrou :
// scripts/absente-releves-complets-selftest.mjs.
import { computeRemovalInfo, idAnnonceDe, plateformesReserveesParRepublication } from "./publicationState.js";

/** Écart toléré entre unavailable_since (finished_at du relevé, horloge du poste) et la date du constat (now() en base) :
 *  ≤ 61 s mesurés sur le parc le 13/11, aucun au-delà de 10 min. Au-delà, l'alerte a été reposée par autre chose. */
export const MARGE_HORLOGE_CONSTAT_MS = 10 * 60_000;

const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };
const txt = (v) => String(v ?? "").trim();
const ACTIONS = ["publish", "republish"];
const NOMS = { leboncoin: "Leboncoin", ebay: "eBay", depop: "Depop", beebs: "Beebs", opla: "Opla", vinted: "Vinted" };

/** Le constat des relevés porté par CE job, pour SON annonce, non démenti par un relevé ; sinon null. */
export function constatAbsenceReleves(job) {
  const pf = job?.platform_fields ?? {};
  const a = pf.absence_releves;
  if (!a || typeof a !== "object" || Array.isArray(a)) return null;
  const premier = txt(a.premier), second = txt(a.second);
  if (!premier || !second || premier === second) return null;
  const numero = txt(idAnnonceDe(job));
  if (!numero || txt(a.listing_id) !== numero) return null;
  const le = ms(a.le);
  if (!Number.isFinite(le)) return null;
  const revue = ms(pf.revue_en_ligne_par_releve?.at);
  if (Number.isFinite(revue) && revue >= le) return null;
  return { numero, premier, second, le: new Date(le).toISOString() };
}

/** CE dépôt publié est absent de deux relevés complets et concordants : { numero, le, depuis } ; sinon null. */
export function annonceAbsenteDesReleves(job) {
  if (!job || job.status !== "published" || !ACTIONS.includes(job.action)) return null;
  if (job.platform === "vinted") return null;
  const pf = job.platform_fields ?? {};
  if (pf.sale_signal === "sold" || pf.pas_encore_visible) return null;
  const c = constatAbsenceReleves(job);
  if (!c) return null;
  const le = ms(c.le);
  const depuis = ms(pf.unavailable_since);
  if (!Number.isFinite(depuis) || depuis > le + MARGE_HORLOGE_CONSTAT_MS) return null;
  const vu = ms(job.vu_en_ligne_le);
  if (Number.isFinite(vu) && vu >= le) return null;
  return { ...c, depuis: pf.unavailable_since };
}

/**
 * Les plateformes d'un article dont TOUTES les annonces publiées sont absentes (concordant), jamais pendant une
 * publication ou une republication en vol. Rend { [plateforme]: { job, depuis, numero } } — la plus récente.
 */
export function plateformesAbsentesDesReleves(jobsAll) {
  const tous = Array.isArray(jobsAll) ? jobsAll : [];
  const jobs = tous.filter((j) => j && j.action !== "delete");
  const { publishedActive } = computeRemovalInfo(tous);
  const reservees = new Set(plateformesReserveesParRepublication(tous));
  const out = {};
  for (const p of publishedActive) {
    if (p === "vinted" || reservees.has(p)) continue;
    if (jobs.some((j) => j.platform === p && (j.status === "pending" || j.status === "processing"))) continue;
    const pubs = jobs.filter((j) => j.platform === p && j.status === "published");
    if (!pubs.length) continue;
    const verdicts = pubs.map((j) => ({ j, a: annonceAbsenteDesReleves(j) }));
    if (verdicts.some((v) => !v.a)) continue;
    const dernier = verdicts.reduce((x, y) => (ms(y.j.published_at ?? y.j.created_at) > ms(x.j.published_at ?? x.j.created_at) ? y : x));
    out[p] = { job: dernier.j, depuis: dernier.a.depuis, numero: dernier.a.numero };
  }
  return out;
}

/**
 * Le refus du serveur reflété (republication_annonce_partie, branche « constat », lue en prod le 13/11) : la source de la
 * republication — le dernier dépôt publié AVEC LIEN de la plateforme (spend_coins_and_republish) — a un constat de deux
 * relevés sur SON numéro, posé sur un dépôt de la fiche, qu'aucun relevé n'a démenti depuis. Vinted : jamais (son chemin
 * serveur ne lit pas cette fonction).
 */
export function republicationRefuseeParLesReleves(jobsAll, platform) {
  if (!platform || platform === "vinted") return false;
  const tous = (Array.isArray(jobsAll) ? jobsAll : []).filter((j) => j && j.platform === platform && ACTIONS.includes(j.action));
  const source = tous
    .filter((j) => j.status === "published" && txt(j.listing_url))
    .reduce((x, y) => (!x || ms(y.published_at ?? y.created_at) > ms(x.published_at ?? x.created_at) ? y : x), null);
  if (!source) return false;
  const numero = txt(idAnnonceDe(source));
  if (!numero) return false;
  // Un relevé l'a revue (marque d'alerte_lever_revues_plateformes) sur n'importe quel dépôt de ce numéro : démenti.
  const revues = tous.filter((j) => txt(idAnnonceDe(j)) === numero).map((j) => ms(j.platform_fields?.revue_en_ligne_par_releve?.at)).filter(Number.isFinite);
  return tous.some((j) => {
    const a = j.platform_fields?.absence_releves;
    if (!a || typeof a !== "object" || txt(a.listing_id) !== numero || !txt(a.premier) || !txt(a.second)) return false;
    const le = ms(a.le);
    return Number.isFinite(le) && !revues.some((r) => r >= le);
  });
}

/** La phrase, avec les mots qui existent déjà (« Plus vue en ligne… : vendue ou retirée ? », publicationState). */
export function phraseAbsenteDesReleves(platform, depuis, lang = "fr") {
  const en = lang === "en";
  const nom = NOMS[platform] ?? platform;
  const t = ms(depuis);
  const date = Number.isFinite(t)
    ? new Date(t).toLocaleDateString(en ? "en-GB" : "fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" })
    : null;
  return en
    ? `No longer seen online on ${nom}${date ? ` since ${date}` : ""} (missing from two complete syncs): sold or removed?`
    : `Plus vue en ligne sur ${nom}${date ? ` depuis le ${date}` : ""} (absente de deux relevés complets) : vendue ou retirée ?`;
}
