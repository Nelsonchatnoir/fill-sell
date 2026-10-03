// ═══════════════════════════════════════════════════════════════════════════
// UN RETRAIT INTROUVABLE SE CONCLUT SUR DEUX RELEVÉS COMPLETS (02/10, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico (02/10) : « on conclut "déjà retiré" après 2 relevés
// COMPLETS consécutifs de la plateforme où l'annonce est absente, recherchée
// par son NUMÉRO (jamais par le titre). Le job se clôt avec un message vrai,
// et le quota est rendu. Si un relevé est incomplet ou en échec, il ne compte
// pas. Tant que les 2 relevés ne sont pas réunis : attente avec un message
// vrai, jamais une attente infinie sans motif. »
//
// Cas fondateurs : retraits Beebs « en attente d'un lien qui n'arrive jamais »
// (xxewwer ×2 dont un depuis le 25/09 — 3 908 observations —, ornellaracano
// ×2, seghirdeborah711 ×1) : le dépôt est « published » sans lien NI numéro, le
// retrait ne sait pas quoi retirer et attendait sans fin.
//
// LES RELEVÉS QUI COMPTENT : les deux derniers relevés de la plateforme qui ont
// TOURNÉ (une demande jamais réclamée ne compte pas), tous deux postérieurs à
// la création du retrait, tous deux COMPLETS : status 'done', total connu,
// lus ≥ annoncés, et sans la mention « [incomplet] ». Un seul raté parmi les
// deux derniers : on attend le suivant.
// L'ABSENCE, PAR NUMÉRO :
//   · le retrait porte un numéro → aucune ligne du relevé pour ce numéro vue
//     depuis le premier des deux relevés ;
//   · il n'en porte pas (dépôt jamais identifié) → chaque annonce que les deux
//     relevés ont vue sur le compte est reliée PAR SON NUMÉRO à un autre dépôt
//     ou à une autre fiche : aucune ne peut être la nôtre. Une seule annonce
//     non reliée suffit à ne rien conclure — elle est nommée (n°, lien).
// Plateformes : celles dont le relevé tient annonces_plateforme (Leboncoin,
// eBay, Beebs, Opla). Vinted a son propre circuit (404, dressing par boutique).
// Pur, sans import réseau (Deno + Node).

export const PLATEFORMES_RELEVE = new Set(["leboncoin", "ebay", "beebs", "opla"]);
const NOM = { leboncoin: "Leboncoin", ebay: "eBay", beebs: "Beebs", opla: "Opla" };
const ms = (v) => { if (typeof v === "number") return Number.isFinite(v) ? v : NaN; const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };
const STATUTS_JAMAIS_TOURNES = new Set(["queued", "expired", "cancelled", "running", "claimed"]);

/** Un relevé complet : il a tourné jusqu'au bout et a tout lu. */
export function releveComplet(r) {
  if (!r || r.status !== "done") return false;
  const tot = Number(r.total_entries);
  if (r.total_entries == null || !Number.isFinite(tot) || tot < 0) return false;
  if (!(Number(r.items_vus) >= tot)) return false;
  return !/\[incomplet\]/i.test(String(r.erreur ?? ""));
}

/** Le numéro d'annonce d'un lien (même forme que _shared/annonce-lien.ts). */
export function numeroDepuisLien(platform, url) {
  const u = String(url ?? "");
  const re = { leboncoin: /\/(\d{6,})(?:[/?#]|$)/, beebs: /\/p\/(\d+)(?:[-/?#]|$)/, ebay: /\/itm\/(?:[^/?#]*\/)?(\d{9,})/, opla: /(art_[A-Za-z0-9_-]+)/ }[platform];
  const m = re ? u.match(re) : null;
  return m ? m[1] : null;
}

/** Le numéro d'une ligne de relevé (listing_id, parfois une URL entière). */
function numeroLigne(platform, a) {
  const brut = String(a?.listing_id ?? "").trim();
  if (/^https?:/i.test(brut)) return numeroDepuisLien(platform, brut);
  return brut || numeroDepuisLien(platform, a?.url);
}

const dateFr = (t) => {
  try { return new Date(t).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" }) + " à " +
    new Date(t).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }); }
  catch { return new Date(t).toISOString(); }
};

// ── UNE ANNONCE APPARUE APRÈS DEUX RELEVÉS COMPLETS SANS ELLE N'EST PAS LE DÉPÔT ──
// (02/10 soir, point 1 — Ornella : ses deux retraits Beebs, « Robe noire
// plissée PROMOD » et « Mango - Robe midi à pois », attendaient depuis le 30/09
// et le 01/10 une annonce « non reliée », n° 34084113. Or les deux robes ont été
// déposées le 20/09 ; 34084113 n'est apparue sur son compte que le 01/10 à
// 19:33, après une dizaine de relevés complets qui ne la montraient pas : c'est
// le pull Zara déposé le 30/09, jamais une robe.)
// Fait relevé en base le 02/10 sur les 35 dépôts Beebs dont le numéro a été lu
// au dépôt : AUCUN relevé complet n'a tourné entre le dépôt et la première
// apparition de l'annonce dans « Mes annonces » — un dépôt, même en
// vérification, y figure dès le relevé suivant. Donc une annonce que DEUX
// relevés complets, commencés après le dépôt, ne montraient pas, puis qui
// apparaît, est née après eux : elle ne peut pas être ce dépôt. Preuve par les
// relevés complets et le numéro (jamais par le titre) — elle n'identifie rien,
// elle EXCLUT. Faute de deux relevés complets dans l'intervalle : pas exclue.
const MARGE_DEPOT_MS = 10 * 60_000;
export function neeApresLeDepot(a, { releves = [], depotLe = null } = {}) {
  const tDepot = ms(depotLe);
  const vueLe = ms(a?.premiere_vue_le ?? a?.created_at);
  if (!Number.isFinite(tDepot) || !Number.isFinite(vueLe) || vueLe <= tDepot) return false;
  const sansElle = (Array.isArray(releves) ? releves : []).filter((r) => releveComplet(r)
    && ms(r.started_at) > tDepot + MARGE_DEPOT_MS && ms(r.started_at) < vueLe - 60_000);
  return sansElle.length >= 2;
}

/** La première apparition de chaque numéro (plusieurs lignes possibles pour un même numéro). */
function premieresVues(platform, lignes) {
  const m = new Map();
  for (const a of lignes) {
    const n = numeroLigne(platform, a);
    const t = ms(a?.created_at);
    if (!n || !Number.isFinite(t)) continue;
    if (!m.has(n) || t < m.get(n)) m.set(n, t);
  }
  return m;
}

/**
 * @param {any} retrait  le job action='delete' (created_at, listing_url, platform_listing_id, platform, platform_fields)
 * @param {{ releves?: Array<any>, annonces?: Array<any>, depotId?: string|null, depotLe?: string|null, maintenant?: number }} [ctx]
 *   depotLe : heure de confirmation du dépôt (published_at, sinon created_at) —
 *   sert à écarter les annonces nées après lui (neeApresLeDepot).
 *   releves : relevés de la plateforme (vinted_sync_runs : status, started_at,
 *   items_vus, total_entries, erreur), tout ordre ; annonces : lignes
 *   annonces_plateforme du compte et de la plateforme (listing_id, url,
 *   job_id, inventaire_id, vu_le, disparu_le, retiree_le).
 * @returns {null | { verdict: 'deja_retire'|'attente'|'non_reliee', numero: string|null, releves: string[], message: string, nonReliees?: string[], neesApresDepot?: string[] }}
 */
export function jugerRetraitIntrouvable(retrait, { releves = [], annonces = [], depotId = null, depotLe = null, maintenant = Date.now() } = {}) {
  if (!retrait || retrait.action !== "delete" || !PLATEFORMES_RELEVE.has(retrait.platform)) return null;
  const P = retrait.platform;
  const nom = NOM[P] ?? P;
  const cree = ms(retrait.created_at);
  const numero = String(retrait.platform_listing_id ?? "").trim() || numeroDepuisLien(P, retrait.listing_url);
  const tournes = (Array.isArray(releves) ? releves : [])
    .filter((r) => r && !STATUTS_JAMAIS_TOURNES.has(String(r.status ?? "")) && Number.isFinite(ms(r.started_at)))
    .sort((a, b) => ms(b.started_at) - ms(a.started_at));
  const deux = tournes.slice(0, 2);
  const valides = deux.filter((r) => releveComplet(r) && (!Number.isFinite(cree) || ms(r.started_at) > cree));
  const datesValides = valides.map((r) => dateFr(ms(r.started_at)));
  if (valides.length < 2) {
    // Combien de relevés complets consécutifs depuis la création, à ce jour ?
    let k = 0;
    for (const r of tournes) { if (releveComplet(r) && (!Number.isFinite(cree) || ms(r.started_at) > cree)) k++; else break; }
    k = Math.min(k, 1);
    return {
      verdict: "attente", numero, releves: datesValides,
      message: `Retrait ${nom} en attente : ${numero ? `l'annonce n° ${numero} n'a pas pu être retirée` : `nous n'avons pas le numéro de cette annonce (${nom} ne l'a jamais rendu)`}, ` +
        "et on ne la cherche jamais par son titre. On conclura tout seuls dès que deux relevés complets de ton compte " +
        `${nom} auront été faits sans elle (${k}/2 à ce jour) — il suffit que Chrome soit ouvert. ` +
        `Si tu la vois encore sur ${nom}, tu peux la retirer toi-même : rien ne sera fait en double.`,
    };
  }
  const depuis = ms(valides[1].started_at); // le plus ancien des deux
  const lignes = (Array.isArray(annonces) ? annonces : []);
  if (numero) {
    // Vue EN VENTE depuis le premier des deux relevés. Une annonce que le relevé
    // montre vendue ou retirée n'est plus achetable : elle ne retient rien.
    const vue = lignes.some((a) => numeroLigne(P, a) === numero && ms(a.vu_le) >= depuis - 60_000
      && !a.retiree_le && !a.disparu_le && !/^(vendue|retiree|retirée)$/i.test(String(a.statut_plateforme ?? "")));
    if (vue) return null; // elle est là : ce n'est pas un retrait introuvable
    return {
      verdict: "deja_retire", numero, releves: datesValides,
      message: `Rien à retirer : l'annonce n° ${numero} n'apparaît plus sur ton compte ${nom} ` +
        `(relevés complets du ${datesValides[1]} et du ${datesValides[0]}). Elle est déjà retirée.`,
    };
  }
  // Sans numéro : aucune annonce vue par les deux relevés ne doit être libre.
  const vues = lignes.filter((a) => ms(a.vu_le) >= depuis - 60_000 && !a.disparu_le && !a.retiree_le
    && !/^(vendue|retiree|retirée)$/i.test(String(a.statut_plateforme ?? "")));
  const aCeDepot = depotId ? vues.filter((a) => String(a.job_id ?? "") === String(depotId)) : [];
  if (aCeDepot.length) return null; // le dépôt EST en ligne, par son numéro : le lien viendra (beebs-lien)
  const vuesLe = premieresVues(P, lignes);
  const sansLien = vues.filter((a) => !a.job_id && a.inventaire_id == null);
  const neesApres = sansLien.filter((a) => neeApresLeDepot({ premiere_vue_le: vuesLe.get(numeroLigne(P, a)) ?? ms(a.created_at) },
    { releves, depotLe }));
  const libres = sansLien.filter((a) => !neesApres.includes(a));
  const exclues = [...new Set(neesApres.map((a) => numeroLigne(P, a)).filter(Boolean))];
  if (libres.length) {
    const ids = [...new Set(libres.map((a) => numeroLigne(P, a)).filter(Boolean))].slice(0, 3);
    return {
      verdict: "non_reliee", numero: null, releves: datesValides, nonReliees: ids,
      message: `Retrait ${nom} en attente : nous n'avons pas le numéro de cette annonce, et ton compte ${nom} porte ` +
        `${ids.length > 1 ? "des annonces que nous ne savons relier" : "une annonce que nous ne savons relier"} à aucun article ` +
        `(n° ${ids.join(", n° ")}). Si c'est elle, retire-la toi-même sur ${nom} : le retrait se conclura tout seul au relevé suivant. ` +
        "On ne retire jamais une annonce sur son seul titre.",
    };
  }
  return {
    verdict: "deja_retire", numero: null, releves: datesValides,
    ...(exclues.length ? { neesApresDepot: exclues } : {}),
    message: `Rien à retirer sur ${nom} : ton compte n'y affiche aucune annonce qui pourrait être celle-ci ` +
      `(relevés complets du ${datesValides[1]} et du ${datesValides[0]} — chaque annonce en ligne y est reliée par son numéro ` +
      "à un autre article" +
      (exclues.length ? `, ou n'y est apparue que bien après ce dépôt (n° ${exclues.join(", n° ")})` : "") +
      "). Elle n'a jamais été mise en ligne, ou elle est déjà retirée. Cette publication ne compte pas dans tes limites.",
  };
}

// ── UNE ATTENTE BORNÉE : AU-DELÀ, C'EST À LA PERSONNE (02/10 soir, point 1) ──
// Règle de Nico : « un retrait ne doit jamais attendre un lien en silence
// indéfiniment. Après un délai borné, soit le lien est établi par une preuve,
// soit le job passe en needs_user avec un message clair. » Les verdicts
// « attente » et « non_reliee » échappaient au plafond de 7 jours (ils
// sortaient de la boucle avant lui) : Ornella attendait depuis le 30/09, 627
// observations. 48 h depuis l'armement du retrait : deux relevés quotidiens
// au moins, et un relevé redemandé toutes les 6 h entre-temps.
// Le job en needs_user reste jugé à chaque passage : deux relevés complets
// sans elle le closent seuls, un lien retrouvé le remet en file.
export const RETRAIT_SANS_NUMERO_GESTE_MS = 48 * 3600_000;
export const RETRAIT_SANS_NUMERO_RELEVE_MS = 6 * 3600_000;

/** Le message du needs_user : ce qu'on n'a pas, ce qu'on n'a pas fait, le geste. */
export function messageRetraitSansNumeroAToi(retrait, verdict) {
  const P = retrait?.platform;
  const nom = NOM[P] ?? P;
  const titre = String(retrait?.title ?? "").trim();
  const quoi = titre ? `l'annonce ${nom} « ${titre.slice(0, 80)} »` : `cette annonce ${nom}`;
  const libres = Array.isArray(verdict?.nonReliees) ? verdict.nonReliees : [];
  return `Retrait ${nom} à vérifier : nous n'avons jamais eu le numéro de ${quoi}, et on ne retire jamais une annonce ` +
    "sur son seul titre. " +
    (libres.length
      ? `Ton compte ${nom} porte ${libres.length > 1 ? "des annonces" : "une annonce"} que nous ne savons relier à aucun article (n° ${libres.join(", n° ")}) : ` +
        `si c'est elle, retire-la toi-même sur ${nom}. `
      : `Tes annonces ${nom} n'ont pas pu être relues en entier depuis : regarde-les, et si elle y est encore, retire-la toi-même sur ${nom}. `) +
    "Le retrait se conclura tout seul au relevé suivant — rien ne sera fait en double.";
}

// ═══════════════════════════════════════════════════════════════════════════
// VINTED : LE DRESSING DE LA BOUTIQUE FAIT FOI (03/10, ornellaracano fb9cd238)
// ═══════════════════════════════════════════════════════════════════════════
// Le retrait du « Service à café vintage » (Vinted 9921076011, fiche supprimée,
// aucune boutique sur le job) bouclait depuis le 30/09 sur « nous n'arrivons
// pas à prouver que l'annonce appartient à la boutique ouverte » : la garde
// d'identité de l'extension lit le vendeur sur la page de l'annonce — et
// l'annonce N'EXISTE PLUS. Les relevés complets du dressing d'ornella-vend
// (une ligne par article, vendus, masqués et brouillons compris) l'ont vue pour
// la dernière fois le 23/09 et plus jamais depuis (29/09, 30/09, 02/10).
// LA RÈGLE (même décision que les autres plateformes : deux relevés COMPLETS,
// par NUMÉRO, jamais par le titre) :
//   · la boutique de l'annonce = celle du relevé complet qui l'a vue en dernier
//     (instantané vinted_listing_snapshots pris pendant ce relevé) ;
//   · les deux derniers relevés complets de CETTE boutique, tous deux commencés
//     après la création du retrait, et commencés après la dernière vue de
//     l'annonce → elle n'est plus sur la boutique : « Rien à retirer ».
//   · jamais vue, boutique inconnue, ou moins de deux relevés : on ne conclut
//     rien (attente). Une annonce vue par l'un des deux relevés retient tout.
// Et quand la boutique est prouvée par le relevé alors que le job n'en porte
// pas, elle est rendue au job (vinted_account_id) : la garde de l'extension
// a alors l'origine exacte pour une annonce qui existe encore.

/** Le numéro Vinted d'un retrait : identifiant, numéro gardé, ou lien /items/<n>. */
export function numeroRetraitVinted(retrait) {
  const pf = retrait?.platform_fields ?? {};
  const brut = String(retrait?.platform_listing_id ?? "").trim() || String(pf.vinted_item_id ?? "").trim();
  if (/^\d{6,}$/.test(brut)) return brut;
  const m = String(retrait?.listing_url ?? "").match(/vinted\.[a-z.]+\/items\/(\d{6,})(?:[-/?#]|$)/i);
  return m ? m[1] : null;
}

/**
 * @param {any} retrait  job Vinted action='delete' (created_at, listing_url, platform_listing_id, platform_fields)
 * @param {{ releves?: Array<any>, derniereVue?: string|number|null }} [ctx]
 *   releves : relevés du DRESSING du compte (vinted_sync_runs kind='dressing' :
 *   status, started_at, finished_at, updated_at, items_vus, total_entries,
 *   erreur, vinted_user_id, vinted_login), tout ordre ;
 *   derniereVue : captured_at le plus récent de l'annonce dans
 *   vinted_listing_snapshots (null si jamais vue).
 * @returns {null | { verdict: 'deja_retire'|'attente', numero: string, boutique: string|null, login: string|null, boutiques: string[], releves: string[], message?: string, raison?: string }}
 */
export function jugerRetraitVintedIntrouvable(retrait, { releves = [], derniereVue = null } = {}) {
  if (!retrait || retrait.action !== "delete" || retrait.platform !== "vinted") return null;
  const numero = numeroRetraitVinted(retrait);
  if (!numero) return null;
  const tVue = ms(derniereVue);
  const complets = (Array.isArray(releves) ? releves : [])
    .filter((r) => r && (r.kind == null || r.kind === "dressing") && releveComplet(r) && Number.isFinite(ms(r.started_at)) && String(r.vinted_user_id ?? "").trim())
    .sort((a, b) => ms(b.started_at) - ms(a.started_at));
  const finDe = (r) => { const f = ms(r.finished_at); return Number.isFinite(f) ? f : ms(r.updated_at); };
  // La boutique de l'annonce : celle du relevé complet qui l'a vue en dernier ;
  // sinon celle du job ; sinon (jamais vue, job sans boutique) TOUTES les
  // boutiques relevées du compte — elle ne doit être sur aucune.
  const releveDeLaVue = Number.isFinite(tVue)
    ? complets.find((r) => ms(r.started_at) - 60_000 <= tVue && Number.isFinite(finDe(r)) && tVue <= finDe(r) + 60_000)
    : null;
  const boutiqueJob = String(retrait?.platform_fields?.vinted_account_id ?? "").trim();
  const boutiques = releveDeLaVue ? [String(releveDeLaVue.vinted_user_id)]
    : boutiqueJob ? [boutiqueJob]
    : [...new Set(complets.map((r) => String(r.vinted_user_id)))];
  const loginDe = (b) => complets.find((r) => String(r.vinted_user_id) === b && r.vinted_login)?.vinted_login ?? null;
  const boutique = boutiques.length === 1 ? boutiques[0] : null;
  const login = boutique ? loginDe(boutique) : null;
  if (!boutiques.length) return { verdict: "attente", numero, boutique: null, login: null, boutiques: [], releves: [], raison: "boutique_inconnue" };
  const cree = ms(retrait.created_at);
  let dates = [];
  for (const b of boutiques) {
    const deux = complets.filter((r) => String(r.vinted_user_id) === b).slice(0, 2);
    dates = dates.concat(deux.map((r) => dateFr(ms(r.started_at))));
    // Deux relevés complets de la boutique, tous deux commencés après la
    // création du retrait (l'absence vaut MAINTENANT, pas avant la demande).
    if (deux.length < 2 || deux.some((r) => Number.isFinite(cree) && !(ms(r.started_at) > cree))) {
      return { verdict: "attente", numero, boutique, login, boutiques, releves: dates, raison: "moins_de_deux_releves" };
    }
    // Vue pendant, ou après le début de, l'un des deux relevés : elle est là.
    if (Number.isFinite(tVue) && !(tVue < ms(deux[1].started_at) - 60_000)) return null;
  }
  const noms = boutiques.map((b) => loginDe(b) ? `@${loginDe(b)}` : `n° ${b}`);
  const ou = boutiques.length === 1 ? `ta boutique Vinted ${noms[0]}` : `aucune de tes boutiques Vinted (${noms.join(", ")})`;
  return {
    verdict: "deja_retire", numero, boutique, login, boutiques, releves: dates,
    message: boutiques.length === 1
      ? `Rien à retirer : l'annonce Vinted n° ${numero} n'est plus sur ${ou} (relevés complets du ${dates[1]} et du ${dates[0]}). Elle est déjà retirée.`
      : `Rien à retirer : l'annonce Vinted n° ${numero} n'est sur ${ou} (deux relevés complets de chacune depuis ta demande). Elle est déjà retirée.`,
  };
}
