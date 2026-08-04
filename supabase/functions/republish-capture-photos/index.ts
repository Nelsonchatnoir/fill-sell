import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── republish-capture-photos (É1 republication, 2026-08-05) ──────────────────
// Re-héberge les photos CDN d'une annonce Vinted EN LIGNE dans notre bucket
// listing-photos, AVANT toute suppression : les URLs CDN d'une annonce
// supprimée ne sont pas garanties de survivre — le handler publish (qui
// fetche des URLs, peu importe lesquelles) repartira des nôtres.
//
// Pourquoi une edge function et pas l'extension : le CDN (*.vinted.net) n'est
// PAS dans les host_permissions du manifest, son CORS n'est pas relevé, et
// ajouter un host = surface de review CWS. Côté serveur, pas de CORS.
//
// Cadre (validé par Nico) :
//   · verify_jwt = true (config.toml) — appelée par l'app avec le JWT
//     utilisateur, comme generate-listing ;
//   · ≤ 20 photos par appel ;
//   · gardes par photo : hôtes Vinted UNIQUEMENT (jamais un proxy ouvert),
//     taille plafonnée, timeout — une URL qui répond 2 Go ou ne répond
//     jamais NE FAIT PAS TOMBER la capture : elle sort en `echecs`, nommée,
//     et le verdict de la capture restera 'incomplet' (la garde anti-perte
//     fait le reste : pas de capture valide, pas de suppression).
//   · coût : ~1,5 Mo par annonce (5 × ~300 Ko) — chiffré et accepté.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const MAX_PHOTOS = 20;
const MAX_OCTETS_PAR_PHOTO = 10 * 1024 * 1024; // 10 Mo — les photos Vinted font ~100-500 Ko
const TIMEOUT_MS = 15_000;
const BUCKET = "listing-photos";

// Hôtes autorisés — le CDN Vinted et les domaines de plateforme. Liste
// FERMÉE : sans elle, un utilisateur authentifié ferait de cette fonction un
// proxy de téléchargement arbitraire vers notre storage.
function hoteAutorise(u: URL): boolean {
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  return h === "vinted.net" || h.endsWith(".vinted.net")
    || h === "vinted.fr" || h.endsWith(".vinted.fr")
    || h === "vinted.com" || h.endsWith(".vinted.com");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    const vintedItemId = String(body?.vinted_item_id ?? "").trim();
    const urls = Array.isArray(body?.urls) ? body.urls : null;
    if (!/^\d+$/.test(vintedItemId) || !urls?.length) {
      return json({ error: "vinted_item_id (numérique) et urls (non vide) requis" }, 400);
    }
    if (urls.length > MAX_PHOTOS) {
      return json({ error: `au plus ${MAX_PHOTOS} photos par capture` }, 400);
    }

    const ts = Date.now();
    const photos: string[] = [];
    const echecs: Array<{ url: string; raison: string }> = [];

    // Séquentiel, volontairement : ≤ 20 fetchs vers le CDN, pas de rafale.
    for (let i = 0; i < urls.length; i++) {
      const brut = String(urls[i] ?? "");
      let cible: URL;
      try {
        cible = new URL(brut);
      } catch {
        echecs.push({ url: brut, raison: "URL illisible" });
        continue;
      }
      if (!hoteAutorise(cible)) {
        echecs.push({ url: brut, raison: `hôte non autorisé (${cible.hostname})` });
        continue;
      }

      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      try {
        const resp = await fetch(cible.href, { signal: ctl.signal });
        if (!resp.ok) {
          echecs.push({ url: brut, raison: `HTTP ${resp.status}` });
          continue;
        }
        // Garde de taille AVANT lecture quand le CDN l'annonce…
        const annonce = Number(resp.headers.get("content-length") ?? NaN);
        if (Number.isFinite(annonce) && annonce > MAX_OCTETS_PAR_PHOTO) {
          echecs.push({ url: brut, raison: `trop lourde (${annonce} octets annoncés)` });
          continue;
        }
        const bytes = new Uint8Array(await resp.arrayBuffer());
        // …et APRÈS lecture quand il ne l'annonce pas (chunked).
        if (bytes.byteLength > MAX_OCTETS_PAR_PHOTO) {
          echecs.push({ url: brut, raison: `trop lourde (${bytes.byteLength} octets)` });
          continue;
        }
        if (bytes.byteLength === 0) {
          echecs.push({ url: brut, raison: "réponse vide" });
          continue;
        }
        const contentType = resp.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
        if (!contentType.startsWith("image/")) {
          echecs.push({ url: brut, raison: `pas une image (${contentType})` });
          continue;
        }
        const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
        // ts dans le chemin : deux captures du même article ne s'écrasent pas.
        const path = `${user.id}/republish/${vintedItemId}/${ts}_${i}.${ext}`;
        const { error: upErr } = await adminClient.storage
          .from(BUCKET)
          .upload(path, bytes, { contentType, upsert: true });
        if (upErr) {
          echecs.push({ url: brut, raison: `upload : ${upErr.message}` });
          continue;
        }
        photos.push(adminClient.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
      } catch (e) {
        echecs.push({
          url: brut,
          raison: (e as Error)?.name === "AbortError" ? `timeout (${TIMEOUT_MS / 1000} s)` : String((e as Error)?.message ?? e),
        });
      } finally {
        clearTimeout(timer);
      }
    }

    console.log(`[republish-capture-photos] user=${user.id} item=${vintedItemId} ok=${photos.length} echecs=${echecs.length}`);
    return json({ photos, echecs });
  } catch (e) {
    console.error("[republish-capture-photos] unhandled:", e);
    return json({ error: "Internal server error" }, 500);
  }
});
