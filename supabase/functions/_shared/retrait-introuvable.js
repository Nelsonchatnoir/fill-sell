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
const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };
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

/**
 * @param {any} retrait  le job action='delete' (created_at, listing_url, platform_listing_id, platform, platform_fields)
 * @param {{ releves?: Array<any>, annonces?: Array<any>, depotId?: string|null, maintenant?: number }} [ctx]
 *   releves : relevés de la plateforme (vinted_sync_runs : status, started_at,
 *   items_vus, total_entries, erreur), tout ordre ; annonces : lignes
 *   annonces_plateforme du compte et de la plateforme (listing_id, url,
 *   job_id, inventaire_id, vu_le, disparu_le, retiree_le).
 * @returns {null | { verdict: 'deja_retire'|'attente'|'non_reliee', numero: string|null, releves: string[], message: string, nonReliees?: string[] }}
 */
export function jugerRetraitIntrouvable(retrait, { releves = [], annonces = [], depotId = null, maintenant = Date.now() } = {}) {
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
  const libres = vues.filter((a) => !a.job_id && a.inventaire_id == null);
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
    message: `Rien à retirer sur ${nom} : ton compte n'y affiche aucune annonce qui pourrait être celle-ci ` +
      `(relevés complets du ${datesValides[1]} et du ${datesValides[0]} — chaque annonce en ligne y est reliée par son numéro ` +
      "à un autre article). Elle n'a jamais été mise en ligne, ou elle est déjà retirée. Cette publication ne compte pas dans tes limites.",
  };
}
