import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { hotes, lireEnvEbay, type EbayEnv } from "../_shared/ebay-oauth.ts";
import { obtenirJetonApplicatif } from "../_shared/ebay-app-token.ts";

// ═══════════════════════════════════════════════════════════════════════════
// releve-completer — CE QUE L'ANNONCE AFFICHE, LU SANS OUVRIR SA PAGE (04/10)
// ═══════════════════════════════════════════════════════════════════════════
// Louis (Business) : 8 fiches Beebs sur 15 importées sans description ni
// marque, catégorie jamais reprise. Le relevé de l'extension ouvre au plus 30
// pages d'annonce par passage (anti-robot) : sur un compte de 100 annonces, une
// annonce neuve attend des jours son détail. Or ce détail existe SANS page :
//   · Beebs : l'index public du site (Algolia prod_MARKETPLACE_mobile, la clé
//     de RECHERCHE publique du bundle — même appel que beebs.js et que
//     _shared/beebs-index.ts) rend, pour tout le dressing d'un vendeur en une
//     requête : description, marque, état, âge, couleur, taille, rayon, prix,
//     date de modification ;
//   · eBay : l'API Browse (jeton APPLICATIF, lecture publique) rend description,
//     caractéristiques, rayon, état, photos — pour tout compte, relié ou non.
// On l'écrit dans annonces_plateforme.donnees_index ; la base reporte sur les
// SEULS champs vides des fiches rattachées (fiche_completer_depuis_annonce) et
// suit les changements de prix et de poids (annonce_vers_fiche).
// ⛔ Lecture seule. ⛔ L'index ne juge jamais une disparition (une annonce en
//    modération ou vendue en est absente comme une annonce qui n'a jamais
//    existé) : une absence ne touche à rien.
// ⛔ Le vendeur Beebs n'est jamais deviné : il est relu, par identifiant
//    d'annonce, sur des annonces que le relevé du compte a lui-même rendues ;
//    plusieurs vendeurs différents → on s'abstient.
// Appelée par pg_cron (x-cron-secret) ; verify_jwt = false.
// ── BORNÉE (04/10, incident CPU 99 % — cron 28 mis en pause) ───────────────
// · comptes ACTIFS seulement (comptes_actifs(7) : extension ou app vues dans
//   les 7 jours), 3 comptes Beebs par passage ;
// · une annonce INCHANGÉE n'est plus jamais réécrite : chaque écriture
//   d'annonce rattachée déclenche annonce_vers_fiche. Le passage se note PAR
//   COMPTE (releve_index_passages), plus par annonce ;
// · 200 écritures au plus par compte et par passage ; au-delà, le compte
//   reste « à relire » et la suite part au passage suivant.
// Migration 20261004191000.

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const BEEBS_COMPTES_PAR_PASSAGE = 3;
const ECRITURES_PAR_COMPTE = 200;
const EBAY_ANNONCES_PAR_PASSAGE = 25;
const BUDGET_MS = 90_000;

const ALGOLIA_APP = "1KX9QI8HAR";
const ALGOLIA_CLE = "6ef32e91f3a1843e72a7c7ca93cc6dd6";
const ALGOLIA_INDEX = "prod_MARKETPLACE_mobile";

async function algolia(corps: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch(`https://${ALGOLIA_APP.toLowerCase()}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`, {
    method: "POST",
    headers: { "X-Algolia-Application-Id": ALGOLIA_APP, "X-Algolia-API-Key": ALGOLIA_CLE, "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  if (!r.ok) throw new Error(`index Beebs HTTP ${r.status}`);
  return await r.json() as Record<string, unknown>;
}

/** Le vendeur Beebs, relu sur des annonces du relevé du compte ; null au moindre doute. */
async function vendeurBeebs(graines: string[]): Promise<string | null> {
  const vus = new Set<string>();
  for (const g of graines.filter((x) => /^\d+$/.test(x)).slice(0, 4)) {
    const r = await algolia({ filters: `objectID:${g}`, hitsPerPage: 1, attributesToRetrieve: ["user_id"] });
    const v = ((r.hits as Array<Record<string, unknown>> | undefined)?.[0]?.user_id ?? null) as string | null;
    if (v) vus.add(String(v));
  }
  return vus.size === 1 ? [...vus][0] : null;
}

function normaliserBeebs(h: Record<string, unknown>): Record<string, unknown> {
  const a = (h.attributes && typeof h.attributes === "object" ? h.attributes : {}) as Record<string, unknown>;
  const taille = Object.entries(a).find(([k]) => /size|taille|pointure/i.test(k))?.[1] ?? null;
  const upd = Number(h.update_date);
  const d: Record<string, unknown> = {
    source: "beebs_index",
    lu_le: new Date().toISOString(),
    titre: h.title ?? null,
    description: typeof h.description === "string" ? h.description : null,
    marque: a.brand ?? null,
    etat: a.condition ?? null,
    age: a.age ?? null,
    couleur: a.color ?? null,
    matiere: a.material ?? null,
    taille,
    categorie: h.category_search_terms ?? null,
    categorie_id: h.category_id ?? null,
    prix: Number.isFinite(Number(h.price)) ? Number(h.price) : null,
    modifie_le: Number.isFinite(upd) && upd > 0 ? new Date(upd).toISOString() : null,
    attributs: a,
  };
  for (const k of Object.keys(d)) if (d[k] == null || d[k] === "") delete d[k];
  return d;
}

/** Même contenu (hors date de lecture) ? Évite une écriture qui ne dirait rien. */
function memeContenu(x: unknown, y: Record<string, unknown>): boolean {
  if (!x || typeof x !== "object") return false;
  const a = { ...(x as Record<string, unknown>) }; const b = { ...y };
  delete a.lu_le; delete b.lu_le;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Le passage du relevé serveur pour CE compte — jamais une écriture par annonce. */
async function noterPassage(admin: SupabaseClient, userId: string, platform: string, bilan: Record<string, unknown>) {
  const { error } = await admin.from("releve_index_passages")
    .upsert({ user_id: userId, platform, lu_le: new Date().toISOString(), bilan }, { onConflict: "user_id,platform" });
  if (error) console.warn(`[releve-completer] passage ${platform} ${userId.slice(0, 8)} non noté : ${error.message}`);
}

async function completerBeebs(admin: SupabaseClient, debut: number) {
  const bilan = { comptes: 0, ecrites: 0, inchangees: 0, absentes: 0, abstentions: 0, reportees: 0 };
  const { data: comptes, error } = await admin.rpc("releve_index_comptes_a_lire", { p_platform: "beebs", p_limite: BEEBS_COMPTES_PAR_PASSAGE });
  if (error) throw new Error(`comptes Beebs : ${error.message}`);
  for (const c of (comptes ?? []) as Array<{ user_id: string; listing_ids: string[] }>) {
    if (Date.now() - debut > BUDGET_MS) break;
    bilan.comptes++;
    const ids = (c.listing_ids ?? []).map(String);
    let uid: string | null = null;
    try { uid = await vendeurBeebs(ids); } catch { uid = null; }
    const maintenant = new Date().toISOString();
    if (!uid) {
      bilan.abstentions++;
      // Rien n'est conclu ; on note la tentative (pour CE compte, une ligne)
      // pour ne pas repasser à chaque tour.
      await noterPassage(admin, c.user_id, "beebs", { abstention: "vendeur introuvable ou ambigu" });
      continue;
    }
    const hits: Array<Record<string, unknown>> = [];
    for (let page = 0; page < 6; page++) {
      const r = await algolia({ facetFilters: [[`user_id:${uid}`]], hitsPerPage: 1000, page,
        attributesToRetrieve: ["objectID", "title", "description", "attributes", "category_search_terms", "category_id", "price", "update_date"],
        attributesToHighlight: [] });
      const h = (r.hits ?? []) as Array<Record<string, unknown>>;
      hits.push(...h);
      if (h.length < 1000) break;
    }
    const parId = new Map(hits.map((h) => [String(h.objectID), h]));
    const { data: lignes } = await admin.from("annonces_plateforme")
      .select("id, listing_id, donnees_index")
      .eq("user_id", c.user_id).eq("platform", "beebs").in("listing_id", ids.slice(0, 1000));
    let ecritesCompte = 0, reportees = 0;
    for (const l of (lignes ?? []) as Array<{ id: string; listing_id: string; donnees_index: unknown }>) {
      const h = parId.get(String(l.listing_id));
      // Absente de l'index : rien n'est conclu, et rien n'est écrit.
      if (!h) { bilan.absentes++; continue; }
      const d = normaliserBeebs(h);
      // Inchangée : AUCUNE écriture (chaque écriture déclenche annonce_vers_fiche).
      if (memeContenu(l.donnees_index, d)) { bilan.inchangees++; continue; }
      if (ecritesCompte >= ECRITURES_PAR_COMPTE || Date.now() - debut > BUDGET_MS) { reportees++; continue; }
      const { error: e2 } = await admin.from("annonces_plateforme").update({ donnees_index: d, donnees_index_le: maintenant }).eq("id", l.id);
      if (!e2) { bilan.ecrites++; ecritesCompte++; }
    }
    bilan.reportees += reportees;
    // Un compte dont une partie attend encore n'est PAS noté lu : il revient
    // au passage suivant, et ce qui a été écrit ne se réécrit pas (inchangé).
    if (!reportees) await noterPassage(admin, c.user_id, "beebs", { lues: (lignes ?? []).length, ecrites: ecritesCompte });
  }
  return bilan;
}

function texteDeHtml(html: string): string {
  return String(html ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const SANS_MARQUE_RE = /^[\s\-–—]*(sans\s*marque(\s*\/\s*g[ée]n[ée]rique)?|g[ée]n[ée]rique|unbranded(\s*\/\s*generic)?|generic|does\s*not\s*apply|ne\s*s['’]applique\s*pas|non\s*applicable|sans\s*objet|n\/?a|non\s*sp[ée]cifi[ée]e?|unspecified)[\s\-–—]*$/i;

function normaliserBrowse(b: Record<string, any>): Record<string, unknown> {
  const aspects = Array.isArray(b.localizedAspects) ? b.localizedAspects as Array<{ name?: string; value?: string }> : [];
  const asp = (...noms: string[]) => {
    for (const n of noms) {
      const t = aspects.find((a) => String(a?.name ?? "").toLowerCase() === n.toLowerCase());
      if (t?.value) return String(t.value);
    }
    return null;
  };
  let marque = asp("Marque", "Brand") ?? (b.brand ? String(b.brand) : null);
  if (marque && SANS_MARQUE_RE.test(marque)) marque = null;
  const photos = [b.image?.imageUrl, ...((b.additionalImages ?? []) as Array<{ imageUrl?: string }>).map((i) => i?.imageUrl)]
    .filter((u) => typeof u === "string" && /^https?:/.test(u));
  const prix = Number(b.price?.value);
  const d: Record<string, unknown> = {
    source: "ebay_browse",
    lu_le: new Date().toISOString(),
    titre: b.title ?? null,
    description: b.description ? texteDeHtml(String(b.description)).slice(0, 10000) || null : (b.shortDescription ?? null),
    marque,
    taille: asp("Taille", "Size", "Pointure"),
    couleur: asp("Couleur", "Color"),
    matiere: asp("Matière", "Matériau", "Material"),
    etat: b.condition ?? null,
    categorie: b.categoryPath ? String(b.categoryPath).split("|").map((s) => s.trim()).filter(Boolean).join(" > ") : null,
    categorie_id: b.categoryId ?? null,
    photos,
    prix: Number.isFinite(prix) && prix > 0 ? prix : null,
    vendeur: b.seller?.username ?? null,
  };
  for (const k of Object.keys(d)) if (d[k] == null || d[k] === "" || (Array.isArray(d[k]) && !(d[k] as unknown[]).length)) delete d[k];
  return d;
}

async function completerEbay(admin: SupabaseClient, env: EbayEnv, debut: number) {
  const bilan = { lues: 0, ecrites: 0, introuvables: 0, arret: null as string | null };
  // Les annonces eBay rattachées en ligne qu'aucune lecture n'a encore servies
  // (ou il y a plus de 7 jours) — les plus récentes d'abord.
  // (04/10) Comptes ACTIFS seulement (releve_ebay_details_a_lire).
  const { data: file, error } = await admin.rpc("releve_ebay_details_a_lire", { p_limite: EBAY_ANNONCES_PAR_PASSAGE });
  if (error) throw new Error(`file eBay : ${error.message}`);
  if (!(file ?? []).length) return bilan;
  const token = await obtenirJetonApplicatif(env);
  for (const l of (file ?? []) as Array<{ id: string; listing_id: string; donnees_index: unknown }>) {
    if (Date.now() - debut > BUDGET_MS) break;
    if (!/^\d{9,}$/.test(String(l.listing_id))) continue;
    const r = await fetch(`${hotes(env).api}/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${encodeURIComponent(l.listing_id)}`, {
      headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_FR", "Accept-Language": "fr-FR", Accept: "application/json" },
    });
    bilan.lues++;
    const maintenant = new Date().toISOString();
    if (r.status === 429 || r.status >= 500) { bilan.arret = `HTTP ${r.status}`; break; }
    if (r.status !== 200) {
      bilan.introuvables++;
      await admin.from("annonces_plateforme").update({ donnees_index_le: maintenant }).eq("id", l.id);
      continue;
    }
    const b = await r.json().catch(() => null) as Record<string, any> | null;
    if (!b) continue;
    const d = normaliserBrowse(b);
    if (memeContenu(l.donnees_index, d)) {
      await admin.from("annonces_plateforme").update({ donnees_index_le: maintenant }).eq("id", l.id);
      continue;
    }
    const { error: e2 } = await admin.from("annonces_plateforme").update({ donnees_index: d, donnees_index_le: maintenant }).eq("id", l.id);
    if (!e2) bilan.ecrites++;
  }
  return bilan;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  const attendu = Deno.env.get("CRON_SECRET");
  if (!attendu || req.headers.get("x-cron-secret") !== attendu) return json({ error: "Non autorisé" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const debut = Date.now();
  const out: Record<string, unknown> = {};
  try { out.beebs = await completerBeebs(admin, debut); } catch (e) { out.beebs = { erreur: String((e as Error)?.message ?? e).slice(0, 200) }; }
  try { out.ebay = await completerEbay(admin, lireEnvEbay(), debut); } catch (e) { out.ebay = { erreur: String((e as Error)?.message ?? e).slice(0, 200) }; }
  console.log(`[releve-completer] ${JSON.stringify(out)} en ${Date.now() - debut} ms`);
  return json({ ok: true, ...out, ms: Date.now() - debut });
});
