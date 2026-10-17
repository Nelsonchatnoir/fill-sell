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
// Mode "cache" : l'ANCIEN chemin deux fois, cache forcé (table ia_questions_cache,
// service_role) — le 1er passage range la réponse, le 2e la relit : même texte,
// mêmes contrôles, 0 appel. Les lignes rangées par le banc sont effacées à la fin
// du lot (fonction "aspects_ia", ce lot seulement : leurs clés sont rendues).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { completerAspectsIA, completerAspectsIAGroupe, type AspectDemande, type ContexteArticle } from "../_shared/ebay-aspects-ia.ts";

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
  let corps: { cas?: Array<{ id: string; demandes: AspectDemande[]; contexte: ContexteArticle }>; tours_ancien?: number; mode?: string };
  try { corps = await req.json(); } catch { return json({ error: "corps illisible" }, 400); }
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
