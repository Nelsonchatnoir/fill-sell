// ═══════════════════════════════════════════════════════════════════════════
// LES RETRAITS D'UNE SUPPRESSION GROUPÉE, PLATEFORME PAR PLATEFORME (16/11/2026 après-midi, point 5 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Marc (thecloset72000) a supprimé 753 articles du Stock entre 11:42 et 12:07 : environ 900 retraits partis dans la
// file, une annonce à la fois. À 13:57, rien ne lui disait où ils en étaient — Nico lisait « Beebs 0/138 » alors que
// 26 étaient retirées et 3 envoyées, en attente de leur preuve. Ce module dit, pour chaque suppression, par
// plateforme : retirées, en vérification (suppression envoyée, preuve attendue), en examen chez la plateforme
// (Beebs l'examine encore), en file, à toi de jouer. Jamais une durée ni une heure prévue (règle aucune-estimation).
//
// RÈGLES
//   · un doublon annulé (« un retrait est déjà en cours pour cette annonce ») n'est JAMAIS compté, ni un retrait
//     annulé sans objet : ils ne retirent rien et ne restent pas à faire ;
//   · « à toi » reprend les murs de « À régler » (utils/retraitsBloques.js : connexion, boutique Vinted, compte
//     Vinted bloqué), plus needs_user et failed ; « en examen chez la plateforme » : retraitBeebsEnVerification ;
//   · une suppression = les retraits marqués du même lot (platform_fields.lot_suppression, posé par la suppression
//     groupée — App.jsx executerSuppression) ; sans marque, ceux créés dans la fenêtre d'une suppression journalisée
//     (usage_logs « suppression_article » avec son lot) ; à défaut de tout lot, tous les retraits des 72 h ;
//   · deux lots à moins de 30 min l'un de l'autre = une seule suppression (Marc : 4 gestes en 25 min) ;
//   · un bloc se montre tant qu'il reste un retrait à faire ; une suppression finie, 2 h encore (le temps de
//     « Suivre les retraits ») ; le repli « 72 h », seulement s'il reste à faire.
// LECTURE : 72 h, colonnes minimales (quelques clés de platform_fields, jamais la ligne entière), pages de 1 000,
// 5 pages au plus ; le journal en panne ne prive jamais des retraits. Relue par utils/relectureBornee.js seulement.
// Pur (Node + navigateur) : scripts/retraits-lot-avancement-selftest.mjs.
import {
  NOMS_PLATEFORME_RETRAIT, retraitBloqueParBoutique, retraitBloqueParConnexion, retraitBloqueParCompteVinted,
  retraitBeebsEnVerification,
} from "./retraitsBloques.js";

export const FENETRE_RETRAITS_MS = 72 * 3600_000;
export const ECART_SUPPRESSIONS_MS = 30 * 60_000;
export const FIN_VISIBLE_MS = 2 * 3600_000;
export const TAILLE_PAGE = 1000;
export const PAGES_RETRAITS_MAX = 5;
export const PAGES_JOURNAL_MAX = 3;
// Fenêtre d'une suppression journalisée : le retrait d'un article est armé juste AVANT la ligne du journal de cet
// article (executerSuppression : retraits, suppression, puis journal) ; le filet serveur, au moment de la suppression.
const AVANT_JOURNAL_MS = 60_000;
const APRES_JOURNAL_MS = 30_000;

export const ETATS_RETRAIT = ["retirees", "verification", "plateforme", "en_file", "a_toi"];

// Les seules clés de platform_fields que la règle lit (alias PostgREST → clé).
const CLES = {
  lot: "lot_suppression", doublon: "retrait_doublon_de", envoyee: "beebs_suppression_envoyee",
  moderation: "beebs_en_moderation", verif_longue: "retrait_en_attente_verification", retenue: "retenue_serveur",
  attente_boutique: "attente_boutique_retrait", verif_boutique: "verification_boutique_vinted",
  attente_session: "attente_session", attente_connexion: "attente_connexion", source: "needs_user_source",
  compte_bloque: "compte_vinted_bloque", boutique_etrangere: "boutique_etrangere",
};
// Objets lus en JSON (on y lit un champ) ; les autres en texte (on n'y lit que la présence).
const CLES_OBJET = new Set(["retenue", "attente_boutique", "verif_boutique", "boutique_etrangere"]);
export const COLONNES_RETRAITS = ["id", "platform", "status", "created_at", "error",
  ...Object.entries(CLES).map(([alias, cle]) => `${alias}:platform_fields${CLES_OBJET.has(alias) ? "->" : "->>"}${cle}`)].join(", ");

const ts = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : 0; };

/** Une ligne lue (alias) ou un job complet → { id, platform, status, created_at, error, platform_fields }. */
export function retraitDepuisLigne(l) {
  if (!l || typeof l !== "object") return null;
  if (l.platform_fields && typeof l.platform_fields === "object") return { ...l, action: "delete" };
  const pf = {};
  for (const [alias, cle] of Object.entries(CLES)) if (l[alias] != null && l[alias] !== "") pf[cle] = l[alias];
  return { id: l.id, platform: l.platform, status: l.status, created_at: l.created_at, error: l.error ?? null, action: "delete", platform_fields: pf };
}

/** retirees | verification | plateforme | en_file | a_toi | null (jamais compté). */
export function classerRetrait(ligne) {
  const r = retraitDepuisLigne(ligne);
  if (!r) return null;
  const s = String(r.status ?? "");
  if (s === "deleted") return "retirees";
  if (s === "needs_user" || s === "failed") return "a_toi";
  if (s !== "pending" && s !== "processing") return null; // cancelled (doublon, sans objet), dry_run… : jamais compté
  if (retraitBloqueParConnexion(r) || retraitBloqueParBoutique(r) || retraitBloqueParCompteVinted(r)) return "a_toi";
  if (retraitBeebsEnVerification(r)) return "plateforme";
  if (r.platform_fields.beebs_suppression_envoyee) return "verification";
  return "en_file";
}

const compteVide = () => ({ retirees: 0, verification: 0, plateforme: 0, en_file: 0, a_toi: 0, total: 0, ouverts: 0 });
function ajouter(c, etat) {
  c[etat]++;
  c.total++;
  if (etat !== "retirees") c.ouverts++;
}

/**
 * Les suppressions et l'avancement de leurs retraits — TOUTES (visibles ou non), la plus récente d'abord.
 * @param {{retraits: Array<object>, journal?: Array<{lot: string, created_at: string}>, maintenant?: number}} o
 */
export function suppressionsDesRetraits({ retraits = [], journal = [], maintenant = Date.now() } = {}) {
  // 1. Les lots journalisés : leur fenêtre (figée) et leurs articles.
  const lots = new Map();
  for (const j of Array.isArray(journal) ? journal : []) {
    const t = ts(j?.created_at);
    if (!j?.lot || !t) continue;
    const l = lots.get(String(j.lot)) ?? { cle: String(j.lot), jDebut: t, jFin: t, debut: t, fin: t, articles: 0, retraits: [] };
    l.jDebut = Math.min(l.jDebut, t); l.jFin = Math.max(l.jFin, t);
    l.debut = Math.min(l.debut, t); l.fin = Math.max(l.fin, t);
    l.articles++;
    lots.set(l.cle, l);
  }
  const fenetres = [...lots.values()];
  // 2. Chaque retrait à son lot : la marque d'abord, sinon la fenêtre d'une suppression journalisée.
  const restants = [];
  for (const ligne of Array.isArray(retraits) ? retraits : []) {
    const r = retraitDepuisLigne(ligne);
    if (!r) continue;
    const t = ts(r.created_at);
    const marque = r.platform_fields.lot_suppression != null ? String(r.platform_fields.lot_suppression) : null;
    let l = null;
    if (marque) {
      l = lots.get(marque) ?? null;
      if (!l) { l = { cle: marque, jDebut: null, jFin: null, debut: t, fin: t, articles: 0, retraits: [] }; lots.set(marque, l); }
    } else if (t) {
      l = fenetres.find((f) => t >= f.jDebut - AVANT_JOURNAL_MS && t <= f.jFin + APRES_JOURNAL_MS) ?? null;
    }
    if (!l) { restants.push(r); continue; }
    l.retraits.push(r);
    if (t) { l.debut = Math.min(l.debut || t, t); l.fin = Math.max(l.fin || t, t); }
  }
  // 3. Deux lots à moins de 30 min = une seule suppression (un lot sans retrait peut relier deux gestes).
  const tries = [...lots.values()].filter((l) => l.debut).sort((a, b) => a.debut - b.debut);
  const fusion = [];
  for (const l of tries) {
    const prec = fusion[fusion.length - 1];
    if (prec && l.debut - prec.fin <= ECART_SUPPRESSIONS_MS) {
      prec.fin = Math.max(prec.fin, l.fin);
      prec.articles += l.articles;
      prec.retraits.push(...l.retraits);
      continue;
    }
    fusion.push({ type: "lot", cle: l.cle, debut: l.debut, fin: l.fin, articles: l.articles, retraits: [...l.retraits] });
  }
  let groupes = fusion.filter((g) => g.retraits.length > 0);
  // 4. À défaut de tout lot : tous les retraits des 72 h, un seul bloc.
  if (!groupes.length && restants.length) {
    const temps = restants.map((r) => ts(r.created_at)).filter(Boolean);
    groupes = [{ type: "72h", cle: "72h", debut: temps.length ? Math.min(...temps) : maintenant, fin: temps.length ? Math.max(...temps) : maintenant, articles: 0, retraits: restants }];
  }
  // 5. Les comptes, par plateforme.
  return groupes.map((g) => {
    const parPf = {};
    const total = compteVide();
    for (const r of g.retraits) {
      const etat = classerRetrait(r);
      if (!etat) continue;
      const pf = String(r.platform ?? "");
      parPf[pf] = parPf[pf] ?? compteVide();
      ajouter(parPf[pf], etat);
      ajouter(total, etat);
    }
    const plateformes = Object.entries(parPf).sort((a, b) => b[1].ouverts - a[1].ouverts || b[1].total - a[1].total || a[0].localeCompare(b[0]));
    const visible = total.total > 0 && (total.ouverts > 0 || (g.type === "lot" && maintenant - g.fin <= FIN_VISIBLE_MS));
    return { type: g.type, cle: g.cle, debut: g.debut, fin: g.fin, articles: g.articles, plateformes, total, ouverts: total.ouverts, visible };
  }).sort((a, b) => b.debut - a.debut);
}

/** Les suppressions à montrer (« Retraits en cours »), la plus récente d'abord. */
export function avancementRetraits(o = {}) {
  return suppressionsDesRetraits(o).filter((g) => g.visible);
}

const nomDe = (p) => NOMS_PLATEFORME_RETRAIT[p] ?? String(p ?? "");

/** « Beebs : 26 retirées · 3 en vérification · 1 en examen chez Beebs · 108 en file » */
export function ligneAvancementPlateforme(platform, c, lang = "fr") {
  const fr = lang !== "en";
  const nom = nomDe(platform);
  const n = (k) => Number(c?.[k] ?? 0) || 0;
  const parts = [fr ? `${n("retirees")} retirée${n("retirees") > 1 ? "s" : ""}` : `${n("retirees")} removed`];
  if (n("verification")) parts.push(fr ? `${n("verification")} en vérification` : `${n("verification")} being checked`);
  if (n("plateforme")) parts.push(fr ? `${n("plateforme")} en examen chez ${nom}` : `${n("plateforme")} under review at ${nom}`);
  if (n("en_file")) parts.push(fr ? `${n("en_file")} en file` : `${n("en_file")} queued`);
  if (n("a_toi")) parts.push(fr ? `${n("a_toi")} à toi de jouer` : `${n("a_toi")} need you`);
  return `${nom}${fr ? " : " : ": "}${parts.join(" · ")}`;
}

// « 16/11 à 11:42 » — l'heure de Paris, un fait passé (jamais une heure prévue).
function dateParis(t, fr) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return `${p.day}/${p.month} ${fr ? "à" : "at"} ${p.hour}:${p.minute}`;
  } catch {
    return "";
  }
}

/** « Retraits en cours · suppression du 16/11 à 11:42 · 753 articles » */
export function titreAvancementRetraits(g, lang = "fr") {
  const fr = lang !== "en";
  const tete = (g?.ouverts ?? 0) > 0 ? (fr ? "Retraits en cours" : "Removals in progress") : (fr ? "Retraits terminés" : "Removals done");
  if (g?.type === "72h") return `${tete} · ${fr ? "3 derniers jours" : "last 3 days"}`;
  const quand = g?.debut ? dateParis(g.debut, fr) : "";
  const n = Number(g?.articles ?? 0) || 0;
  const articles = n > 0 ? (fr ? ` · ${n} article${n > 1 ? "s" : ""}` : ` · ${n} item${n > 1 ? "s" : ""}`) : "";
  return `${tete} · ${fr ? "suppression du" : "deletion of"} ${quand}${articles}`;
}

/** Le pied du bloc : comment ça avance, sans rien promettre. */
export function piedAvancementRetraits(lang = "fr") {
  return lang !== "en"
    ? "Un retrait à la fois, dans l'ordre de ta file. Une suppression envoyée est vérifiée avant d'être comptée retirée."
    : "One removal at a time, in your queue order. A sent removal is checked before it counts as removed.";
}

/**
 * La lecture bornée : les retraits de la personne des 72 dernières heures (RLS : les siens seulement), et le journal
 * de ses suppressions. Retraits illisibles → throw (la relecture bornée double son attente) ; journal illisible → [].
 * @returns {Promise<{retraits: object[], journal: object[], partiel: boolean}>}
 */
export async function lireRetraitsRecents(supabase, userId, maintenant = Date.now()) {
  const depuis = new Date(maintenant - FENETRE_RETRAITS_MS).toISOString();
  const retraits = [];
  let partiel = false;
  for (let page = 0; page < PAGES_RETRAITS_MAX; page++) {
    const { data, error } = await supabase.from("cross_post_jobs").select(COLONNES_RETRAITS)
      .eq("user_id", userId).eq("action", "delete").gte("created_at", depuis)
      .order("created_at", { ascending: true }).order("id", { ascending: true })
      .range(page * TAILLE_PAGE, page * TAILLE_PAGE + TAILLE_PAGE - 1);
    if (error) throw new Error(error.message ?? "lecture des retraits impossible");
    const lignes = Array.isArray(data) ? data : [];
    retraits.push(...lignes);
    if (lignes.length < TAILLE_PAGE) break;
    if (page === PAGES_RETRAITS_MAX - 1) partiel = true;
  }
  const journal = [];
  try {
    for (let page = 0; page < PAGES_JOURNAL_MAX; page++) {
      const { data, error } = await supabase.from("usage_logs").select("created_at, lot:metadata->>lot")
        .eq("user_id", userId).eq("feature", "suppression_article").gte("created_at", depuis).not("metadata->>lot", "is", null)
        .order("created_at", { ascending: true }).order("id", { ascending: true })
        .range(page * TAILLE_PAGE, page * TAILLE_PAGE + TAILLE_PAGE - 1);
      if (error) throw new Error(error.message);
      const lignes = Array.isArray(data) ? data : [];
      journal.push(...lignes);
      if (lignes.length < TAILLE_PAGE) break;
    }
  } catch {
    journal.length = 0; // illisible : on regroupe sans lui (marque de lot, sinon 72 h)
  }
  return { retraits, journal, partiel };
}
