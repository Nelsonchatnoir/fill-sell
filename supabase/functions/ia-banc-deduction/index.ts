// ═══════════════════════════════════════════════════════════════════════════
// BANC DE COMPARAISON — DÉDUCTION DES ASPECTS : ANCIEN / NOUVEAU (18/10 nuit, point 5)
// ═══════════════════════════════════════════════════════════════════════════
// LECTURE SEULE : aucune écriture en base, aucune publication, aucun cache
// (aucun client admin n'est passé aux fonctions comparées). Appel serveur
// seulement (en-tête x-cron-secret = secret de cron, jamais écrit ailleurs).
// Déployé avec --no-verify-jwt (appelant sans session : le script de banc).
// Pour chaque cas { id, demandes, contexte } :
//   · ancien  = completerAspectsIA (1re passe + un appel par aspect resté vide), lancé `tours_ancien` fois
//     (le bruit propre de l'ancien chemin : pas de température fixée) ;
//   · nouveau = completerAspectsIAGroupe (un seul appel).
// Rend aspects, refus, nombre d'appels et jetons de chaque passage.
// Mode "leviers" (18/10, chantier « zéro friction ») : chaque cas passe par les
// leviers L0 (existant) … L4 de _shared/aspects-leviers.ts — mêmes demandes, mêmes
// contrôles, coût et jetons rendus par levier ; rien n'est écrit, aucun cache.
// Mode "cache" : l'ANCIEN chemin deux fois, cache forcé (table ia_questions_cache,
// service_role) — le 1er passage range la réponse, le 2e la relit : même texte,
// mêmes contrôles, 0 appel. Les lignes rangées par le banc sont effacées à la fin
// du lot (fonction "aspects_ia", ce lot seulement : leurs clés sont rendues).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { completerAspectsIA, completerAspectsIAGroupe, type AspectDemande, type ContexteArticle } from "../_shared/ebay-aspects-ia.ts";
// (18/10, zéro friction) Le banc des leviers IA : mêmes demandes, mêmes contrôles, modèle/photos/liste qui changent.
import { LEVIERS, passerLevier, type Levier } from "../_shared/aspects-leviers.ts";
import { photosPourCouleurIA } from "../_shared/couleur-ia.ts";
import { obtenirJetonApplicatif } from "../_shared/ebay-app-token.ts";
import { hotes } from "../_shared/ebay-oauth.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

type Mesure = { appels: number; entree: number; sortie: number };
// deno-lint-ignore no-explicit-any
async function passer(fn: typeof completerAspectsIA, demandes: AspectDemande[], contexte: ContexteArticle, apiKey: string, admin: any = null) {
  const m: Mesure = { appels: 0, entree: 0, sortie: 0 };
  const onUsage = (data: unknown) => {
    const u = (data as { usage?: { input_tokens?: number; output_tokens?: number } })?.usage ?? {};
    m.appels++; m.entree += Number(u.input_tokens) || 0; m.sortie += Number(u.output_tokens) || 0;
  };
  const debut = Date.now();
  const r = await fn(demandes, contexte, admin ? { apiKey, onUsage, admin, forcerCache: true } : { apiKey, onUsage });
  return { aspects: r.aspects, refuses: r.refuses, seconde_passe: r.seconde_passe, ...m, ms: Date.now() - debut };
}

serve(async (req) => {
  const secret = req.headers.get("x-cron-secret");
  const attendu = Deno.env.get("CRON_SECRET");
  if (!secret || !attendu || secret !== attendu) return json({ error: "Unauthorized" }, 401);
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!apiKey) return json({ error: "Missing API key" }, 500);
  let corps: { cas?: Array<{ id: string; demandes: AspectDemande[]; contexte: ContexteArticle; photos?: string[]; voie?: string }>; tours_ancien?: number; mode?: string; leviers?: string[];
    categories?: string[]; par_categorie?: number };
  try { corps = await req.json(); } catch { return json({ error: "corps illisible" }, 400); }
  // ── Mode « leviers » (18/10, zéro friction) : pour chaque cas, chaque levier
  // demandé (L0 existant … L4 Lens étoffé), rien n'est écrit nulle part. Au plus
  // 6 cas par appel ; les photos sont préparées une fois par cas.
  // ── Mode « ebay_annonces » (18/10, zéro friction) : de VRAIES annonces eBay
  // France d'occasion (API Browse, jeton applicatif, lecture publique) et leurs
  // caractéristiques — choisies par le vendeur, acceptées par eBay : la vérité
  // du banc eBay. Rien n'est écrit.
  // ── Mode « ebay_aspects » (18/10) : ce qu'eBay exige AUJOURD'HUI pour une
  // catégorie (Taxonomy, jeton applicatif, arbre 71 = eBay France), à comparer
  // au cache ebay_item_aspects. Lecture seule : rien n'est écrit.
  if (corps.mode === "ebay_aspects") {
    const env = (Deno.env.get("EBAY_ENV") ?? "production") === "sandbox" ? "sandbox" : "production";
    const jeton = await obtenirJetonApplicatif(env as never);
    const api = hotes(env as never).api;
    const sortie: Record<string, unknown> = {};
    for (const cat of (corps.categories ?? []).slice(0, 10)) {
      try {
        const r = await fetch(`${api}/commerce/taxonomy/v1/category_tree/71/get_item_aspects_for_category?category_id=${encodeURIComponent(cat)}`,
          { headers: { Authorization: `Bearer ${jeton}`, "Accept-Language": "fr-FR" } });
        const j = await r.json().catch(() => ({})) as { aspects?: Array<{ localizedAspectName?: string; aspectConstraint?: { aspectRequired?: boolean; aspectMode?: string; aspectUsage?: string } }> };
        sortie[cat] = { http: r.status, requis: (j.aspects ?? []).filter((a) => a.aspectConstraint?.aspectRequired).map((a) => a.localizedAspectName),
          n: (j.aspects ?? []).length };
      } catch (e) { sortie[cat] = { erreur: (e as Error)?.message ?? String(e) }; }
    }
    return json({ categories: sortie });
  }
  if (corps.mode === "ebay_annonces") {
    const env = (Deno.env.get("EBAY_ENV") ?? "production") === "sandbox" ? "sandbox" : "production";
    const jeton = await obtenirJetonApplicatif(env as never);
    const api = hotes(env as never).api;
    const entetes = { Authorization: `Bearer ${jeton}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_FR", "Accept-Language": "fr-FR" };
    const n = Math.min(Math.max(Number(corps.par_categorie) || 30, 1), 50);
    const sortie: Record<string, unknown[]> = {};
    for (const cat of (corps.categories ?? []).slice(0, 4)) {
      try {
        const r = await fetch(`${api}/buy/browse/v1/item_summary/search?category_ids=${encodeURIComponent(cat)}&limit=${n}&filter=${encodeURIComponent("conditions:{USED},itemLocationCountry:FR")}`, { headers: entetes });
        const j = await r.json().catch(() => ({})) as { itemSummaries?: Array<{ itemId: string }> };
        const items = await Promise.all((j.itemSummaries ?? []).slice(0, n).map(async (s) => {
          try {
            const g = await fetch(`${api}/buy/browse/v1/item/${encodeURIComponent(s.itemId)}`, { headers: entetes });
            const it = await g.json() as Record<string, unknown>;
            const desc = String(it.shortDescription ?? it.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1500);
            return { id: s.itemId, categorie: String(it.categoryId ?? cat), titre: it.title, description: desc,
              aspects: ((it.localizedAspects ?? []) as Array<{ name: string; value: string }>).map((a) => ({ name: a.name, value: a.value })),
              photo: (it.image as { imageUrl?: string } | undefined)?.imageUrl ?? null, etat: it.condition ?? null };
          } catch { return null; }
        }));
        sortie[cat] = items.filter(Boolean);
      } catch (e) { sortie[cat] = [{ erreur: (e as Error)?.message ?? String(e) }]; }
    }
    return json({ categories: sortie });
  }
  if (corps.mode === "leviers") {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const demandes = (Array.isArray(corps.leviers) ? corps.leviers : LEVIERS).filter((l): l is Levier => (LEVIERS as string[]).includes(l));
    const resultats = await Promise.all((corps.cas ?? []).slice(0, 6).map(async (c) => {
      try {
        const prep = await photosPourCouleurIA(c.photos ?? [], supabaseUrl, 2);
        const sorties: Record<string, unknown> = {};
        await Promise.all(demandes.map(async (l) => {
          const r = await passerLevier(l, c.demandes, c.contexte, prep.sources, { apiKey, completer: c.voie === "ebay" });
          sorties[l] = { aspects: r.aspects, refuses: r.refuses, appel_ia: r.appel_ia, mesure: r.mesure, ...(r.lu_photo !== undefined ? { lu_photo: r.lu_photo } : {}) };
        }));
        return { id: c.id, photos: prep.sources.length, photos_ecartees: prep.ecartees, sorties };
      } catch (e) {
        return { id: c.id, erreur: (e as Error)?.message ?? String(e) };
      }
    }));
    return json({ resultats });
  }
  const cas = (corps.cas ?? []).slice(0, 12);
  const tours = Math.min(Math.max(Number(corps.tours_ancien) || 1, 1), 2);
  if (corps.mode === "cache") {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const debut = new Date().toISOString();
    const resultats = await Promise.all(cas.map(async (c) => {
      try {
        const premier = await passer(completerAspectsIA, c.demandes, c.contexte, apiKey, admin);
        const second = await passer(completerAspectsIA, c.demandes, c.contexte, apiKey, admin);
        return { id: c.id, premier, second };
      } catch (e) { return { id: c.id, erreur: (e as Error)?.message ?? String(e) }; }
    }));
    const { data: effacees } = await admin.from("ia_questions_cache").delete().eq("fonction", "aspects_ia").gte("cree_le", debut).select("cle, usages");
    return json({ resultats, cache_efface: (effacees ?? []).length, relectures: (effacees ?? []).reduce((a: number, x: { usages: number }) => a + (Number(x.usages) || 0), 0) });
  }
  const resultats = await Promise.all(cas.map(async (c) => {
    try {
      const anciens = [];
      for (let i = 0; i < tours; i++) anciens.push(await passer(completerAspectsIA, c.demandes, c.contexte, apiKey));
      const nouveau = await passer(completerAspectsIAGroupe as typeof completerAspectsIA, c.demandes, c.contexte, apiKey);
      return { id: c.id, anciens, nouveau };
    } catch (e) {
      return { id: c.id, erreur: (e as Error)?.message ?? String(e) };
    }
  }));
  return json({ resultats });
});
