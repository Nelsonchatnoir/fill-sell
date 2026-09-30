// ═══════════════════════════════════════════════════════════════════════════
// empreintes-urls — calculer les empreintes d'une liste de photos, RIEN d'autre
// (2026-09-30, incident Beebs : rendre leur numéro aux dépôts par la photo)
// ═══════════════════════════════════════════════════════════════════════════
// APPELANT : la base (pg_net, x-cron-secret), à la main, par lots. Aucun
// autre appelant. → verify_jwt = FALSE (déployer avec --no-verify-jwt), garde
// maison sur le secret : verify_jwt=false n'est JAMAIS « pas
// d'authentification ».
//
// POURQUOI UNE FONCTION DE PLUS. photo-empreinte exige un JWT d'utilisateur
// (c'est l'app qui l'appelle), et doublons-balayage calcule ET décide (fusions,
// questions) — on ne peut pas lui demander l'un sans l'autre. Celle-ci ne fait
// QUE remplir le cache photo_empreintes, avec exactement les mêmes règles
// (_shared/empreinte-telechargement.ts : hôtes en liste fermée, poids et
// pixels bornés) et le même module d'empreinte (_shared/empreinte-image.ts).
// Elle ne lit ni n'écrit rien d'autre : aucun job, aucune fiche, aucune
// annonce, aucune question.
//
// COÛT MAÎTRISÉ : 8 URL par appel au plus (le décodage coûte du CPU, et une
// fonction edge n'en a que 2 s par requête — doublons-balayage s'arrête à 6),
// 40 s de budget ; une URL déjà dans le cache n'est ni téléchargée ni
// recalculée ; une image illisible va dans photo_empreintes_echecs (comme
// doublons-balayage).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { empreinterUrl, hoteAutorise } from "../_shared/empreinte-telechargement.ts";

const MAX_URLS = 8;
const BUDGET_MS = 40_000;

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { "Content-Type": "application/json" } });

serve(async (req) => {
  const secret = req.headers.get("x-cron-secret");
  const attendu = Deno.env.get("CRON_SECRET");
  if (!secret || !attendu || secret !== attendu) return json({ error: "unauthorized" }, 401);

  let body: { urls?: unknown } = {};
  try { body = await req.json(); } catch { /* corps vide */ }
  const urls = [...new Set((Array.isArray(body.urls) ? body.urls : [])
    .map((u) => String(u ?? "").trim()).filter(Boolean))].slice(0, MAX_URLS);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const debut = Date.now();

  const { data: connues } = urls.length
    ? await admin.from("photo_empreintes").select("url").in("url", urls)
    : { data: [] };
  const deja = new Set(((connues ?? []) as Array<{ url: string }>).map((r) => r.url));

  let calculees = 0;
  let restantes = 0;
  const echecs: Array<{ url: string; motif: string }> = [];
  for (const url of urls) {
    if (deja.has(url)) continue;
    if (Date.now() - debut > BUDGET_MS) { restantes++; continue; }
    try {
      if (!hoteAutorise(url, supabaseUrl)) throw new Error("hôte hors liste");
      const e = await empreinterUrl(url, supabaseUrl);
      const { error } = await admin.from("photo_empreintes").upsert({
        url, dhash: e.dhash, phash: e.phash, couleur: e.couleur, largeur: e.largeur, hauteur: e.hauteur,
        source: "empreintes-urls", calculee_le: new Date().toISOString(),
      }, { onConflict: "url" });
      if (error) throw new Error(`écriture : ${error.message}`);
      calculees++;
    } catch (err) {
      const motif = String((err as Error)?.message ?? err).slice(0, 160);
      echecs.push({ url, motif });
      const { data: prec } = await admin.from("photo_empreintes_echecs").select("essais").eq("url", url).maybeSingle();
      await admin.from("photo_empreintes_echecs").upsert({
        url, motif, essais: (Number(prec?.essais) || 0) + 1, echec_le: new Date().toISOString(),
      }, { onConflict: "url" });
    }
  }

  const sortie = {
    demandees: urls.length, deja_connues: deja.size, calculees, echouees: echecs.length, restantes,
    duree_ms: Date.now() - debut,
  };
  console.log("[empreintes-urls]", JSON.stringify(sortie));
  return json({ ...sortie, echecs: echecs.slice(0, 10) });
});
