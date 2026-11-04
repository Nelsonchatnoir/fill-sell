// photo-heic-jpeg — une photo HEIC (iPhone) reconvertie CÔTÉ SERVEUR avant tout envoi aux plateformes (04/11, point 7).
// Appelée par l'app connectée (verify_jwt true) quand le navigateur ne sait pas décoder un HEIC
// (src/utils/imageDecode.js, versImageDecodable).
//
// Pourquoi ici : le 03/11, romain.guerin85 ajoutait des photos depuis Chrome ; le décodeur embarqué dans l'app
// (heic2any 0.0.4, plus maintenu depuis 2023) a refusé son HEIC (« ERR_LIBHEIF format not supported ») : la photo et
// les suivantes n'ont pas été ajoutées, sans un mot. Aucun décodeur ne tourne dans cette fonction (pas de CPU) : le
// HEIC est posé un instant dans le bucket lens-temp, la transformation d'images de Supabase Storage (qui lit le HEIC
// en entrée) rend un JPEG (ou un PNG / WebP, que tout navigateur décode), puis l'original est effacé. L'app reprend
// ensuite sa compression ordinaire (1024 px, JPEG 0,85) et son téléversement dans listing-photos : jamais un HEIC
// dans les fiches, donc jamais un HEIC vers Vinted, Leboncoin, Beebs, Depop ou eBay.
//
// Garde : le format est lu dans les OCTETS (_shared/format-photo.js), en entrée comme en sortie ; 20 Mo au plus
// (limite du bucket lens-temp) ; rien n'est gardé — l'original part quoi qu'il arrive.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { formatPhoto, FORMATS_UNIVERSELS } from "../_shared/format-photo.js";

const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost", "https://localhost", "http://localhost:5173", "http://localhost:5177"];
const TAILLE_MAX = 20 * 1024 * 1024; // la limite du bucket lens-temp
const BUCKET_TEMPORAIRE = "lens-temp";
// Au-delà de ce que l'app garde (1024 px) : elle réduit elle-même ensuite, comme pour toute photo.
const COTE_MAX = 2048;
const MIME = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as Record<string, string>;

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const CORS = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : "https://fillsell.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, apikey",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ error: "POST seulement" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Non autorisé" }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "Session invalide" }, 401);

  const octets = new Uint8Array(await req.arrayBuffer());
  if (!octets.length || octets.length > TAILLE_MAX) return json({ error: "taille", octets: octets.length }, 413);
  const entree = formatPhoto(octets.subarray(0, 512));
  if (entree !== "heic") return json({ error: "pas_heic", format: entree }, 415);

  const admin = createClient(supabaseUrl, serviceKey);
  const chemin = `heic/${user.id}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.heic`;
  const t0 = Date.now();
  try {
    const { error: upErr } = await admin.storage.from(BUCKET_TEMPORAIRE).upload(chemin, octets, { contentType: "image/heic", upsert: false });
    if (upErr) return json({ error: "depot_temporaire", detail: upErr.message.slice(0, 200) }, 502);
    const rendu = await fetch(
      `${supabaseUrl}/storage/v1/render/image/authenticated/${BUCKET_TEMPORAIRE}/${chemin}` +
        `?width=${COTE_MAX}&height=${COTE_MAX}&resize=contain&quality=90`,
      // Accept JPEG SEUL : avec WebP dans la liste, Storage rend du WebP (mesuré le 04/11 sur un vrai HEIC : JPEG
      // 475 Ko en 0,5 s avec « image/jpeg » ; WebP sinon).
      { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, Accept: "image/jpeg" } },
    );
    const sortie = new Uint8Array(await rendu.arrayBuffer());
    const format = formatPhoto(sortie.subarray(0, 64));
    console.log(`[photo-heic-jpeg] user=${user.id.slice(0, 8)} ${octets.length} o → HTTP ${rendu.status} ${format} ${sortie.length} o en ${Date.now() - t0} ms`);
    if (!rendu.ok || !FORMATS_UNIVERSELS.includes(format)) {
      return json({ error: "conversion_impossible", http: rendu.status, format }, 422);
    }
    // application/octet-stream : supabase-js (functions.invoke) ne rend un Blob que pour ce type ; l'app relit le
    // format dans les octets (x-format-photo n'est qu'une indication pour le journal).
    return new Response(sortie, { status: 200, headers: { ...CORS, "Content-Type": "application/octet-stream", "x-format-photo": MIME[format] } });
  } catch (e) {
    console.error("[photo-heic-jpeg] échec :", (e as Error)?.message ?? e);
    return json({ error: "conversion_impossible" }, 500);
  } finally {
    await admin.storage.from(BUCKET_TEMPORAIRE).remove([chemin]).catch(() => {});
  }
});
