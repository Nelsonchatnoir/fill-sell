// ═══════════════════════════════════════════════════════════════════════════
// BANC LENS AVANT / APRÈS (29/10/2026, lot C partie 3) — fonction TEMPORAIRE, retirée après le banc
// ═══════════════════════════════════════════════════════════════════════════
// Rejoue l'étape d'analyse de lens-analysis (même modèle, même température, même outil de recherche plafonné, mêmes
// photos préparées par images.ts, même message) avec le prompt d'AVANT (_banc_avant.ts = lens-analysis à HEAD 8558ee5)
// ou d'APRÈS (_banc_apres.ts = la version du lot C), puis la passe serveur assainirSortie. Réservée au compte de Nico
// (jeton vérifié) : aucune Pépite, aucun quota, aucune ligne de scan, rien d'écrit en base.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import * as avant from "../lens-analysis/_banc_avant.ts";
import * as apres from "../lens-analysis/_banc_apres.ts";
import { preparerPhotos } from "../lens-analysis/images.ts";

const NICO = "f44b5917-bccc-4431-ba41-f40571a2ed18";
const CORS = { "Access-Control-Allow-Origin": "https://fillsell.app", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", ...CORS } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const auth = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await client.auth.getUser();
  if (user?.id !== NICO) return json({ error: "reserve_au_banc" }, 403);
  const body = await req.json().catch(() => ({}));
  // Les résultats du banc, gardés dans lens-temp/banc/ (purgé à 7 jours) pour être versés au dépôt.
  if (body?.action === "sauver") {
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const nom = `banc/${String(body?.nom ?? "banc").replace(/[^a-z0-9-]/gi, "")}.json`;
    const { error } = await admin.storage.from("lens-temp").upload(nom, new Blob([JSON.stringify(body?.donnees ?? null)], { type: "application/json" }), { upsert: true, contentType: "application/json" });
    return json(error ? { error: error.message } : { ok: true, chemin: `lens-temp/${nom}` });
  }
  const urls: string[] = Array.isArray(body?.urls) ? body.urls.slice(0, 5).map(String) : [];
  const M = body?.version === "avant" ? avant : apres;
  if (!urls.length) return json({ error: "urls" }, 400);
  const photos = await preparerPhotos(urls, url);
  const envoyees = photos.filter((p: any) => p?.source);
  const system = M.buildSystemPrompt("fr", M.getPlatforms("FR", "fr"), "France", envoyees.length, "annonce");
  const userText = "Note de l'utilisateur : (aucune — l'utilisateur n'a pas fourni de note ; ne la réclame pas)";
  const messages: any[] = [{ role: "user", content: [...envoyees.map((p: any) => ({ type: "image", source: p.source })), { type: "text", text: userText }] }];
  // Le modèle comparé (lot C 3 : « si le prompt ne suffit pas, compare les modèles avec leur coût »).
  //   haiku45 : l'appel de lens-analysis à l'identique (temperature 0, web_search_20250305) ;
  //   haiku55 : claude-haiku-5-5 — pas de temperature (400 sur la famille 5.5), réflexion adaptative (effort low ou
  //             medium), web_search_20250305 (la variante 20260209 n'existe pas sur Haiku) ;
  //   sonnet55 : claude-sonnet-5-5 — pas de temperature, effort low, web_search_20260209.
  const modele = String(body?.modele ?? "haiku45");
  const effort = body?.effort === "medium" ? "medium" : "low";
  const payload: any = modele === "haiku55"
    ? { model: "claude-haiku-5-5", max_tokens: 8000, output_config: { effort },
      system: [{ type: "text", text: system }], tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }] }
    : modele === "sonnet55"
      ? { model: "claude-sonnet-5-5", max_tokens: 8000, output_config: { effort },
        system: [{ type: "text", text: system }], tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }] }
      : { model: "claude-haiku-4-5-20251001", max_tokens: 2500, temperature: 0,
        system: [{ type: "text", text: system }], tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }] };
  let contenu: any[] = [];
  let usage: any = null;
  for (let tour = 0; tour < 4; tour++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ ...payload, messages: contenu.length ? [...messages, { role: "assistant", content: contenu }] : messages }),
    });
    const j = await r.json();
    if (!r.ok) return json({ error: "api", status: r.status, detail: j }, 502);
    contenu = [...contenu, ...(j.content ?? [])];
    usage = j.usage;
    if (j.stop_reason !== "pause_turn") break;
  }
  const texte = contenu.filter((b) => b.type === "text").map((b) => b.text).join("");
  const debut = texte.indexOf("{"), fin = texte.lastIndexOf("}");
  let item: any = null;
  try { item = JSON.parse(texte.slice(debut, fin + 1)); } catch { /* rendu brut */ }
  const marqueBrute = item?.marque ?? null;
  const notesBrutes = item?.notes ?? null;
  if (item) { try { M.assainirSortie(item, { photos: envoyees.length, lang: "fr" }); } catch { /* passe best-effort */ } }
  return json({
    version: body?.version === "avant" ? "avant" : "apres", modele: payload.model, effort: payload.output_config?.effort ?? null, photos: envoyees.length, usage,
    recherches: contenu.filter((b) => b.type === "server_tool_use").length,
    sortie: item ? {
      objet: item.objet ?? null, objet_source: item.objet_source ?? null, titre: item.titre ?? null, famille: item.famille ?? null,
      marque: item.marque ?? null, matiere: item.matiere ?? null, couleur: item.couleur ?? null, taille_estimee: item.taille_estimee ?? null,
      etat_estime: item.etat_estime ?? null, description: item.description ?? null, conseils: item.conseils ?? null,
      attributs_visibles: item.attributs_visibles ?? null, marque_brute: marqueBrute, notes: notesBrutes,
    } : null,
    brut: item ? null : texte.slice(0, 2000),
  });
});
