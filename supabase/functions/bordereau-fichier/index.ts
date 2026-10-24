import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as enBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { hoteFichierAutorise, genreDuFichier, FICHIER_MAX_OCTETS } from "../_shared/bordereau-fichier.js";

// ═══════════════════════════════════════════════════════════
// bordereau-fichier — LE FICHIER D'UNE ÉTIQUETTE QUE LE NAVIGATEUR NE PEUT PAS LIRE (bêta, 24/10/2026 soir)
// ═══════════════════════════════════════════════════════════
// Test réel du 24/10 (short Quiksilver de Nico, commande 23532974658) : l'étiquette Vinted est rendue par
// …/shipment/digital_label sous la forme d'un LIEN S3 PRÉSIGNÉ (digital_label.image_url, hôte
// svc-shipping-labels.s3.eu-central-1.amazonaws.com) ; pdf_label ne rend que {code:0}. S3 n'autorise pas l'origine
// vinted.fr (CORS) : ni la page, ni l'extension (sans permission pour cet hôte) ne peuvent lire ce fichier.
// Le poste du vendeur passe ICI le lien, avec SA session ; la fonction lit le fichier et rend ses octets ; l'extension
// dépose la copie comme d'habitude (bucket `bordereaux`, bordereau_copie_noter).
// ⛔ Un hôte seulement (liste fermée, _shared/bordereau-fichier.js), https, aucune redirection suivie, 5 Mo au plus,
//    PDF / PNG / JPEG reconnus à leurs octets. Rien n'est gardé ici ; le lien n'est JAMAIS écrit ni journalisé
//    (il donne accès au bordereau, qui porte le nom de l'acheteur).
// ⛔ Comptes de la bêta des bordereaux seulement (messagerie_beta), comme le reste du chemin.
// Déploiement : verify_jwt = true (défaut) — appelée par l'extension avec la session du vendeur ; la clé anon seule
// est refusée (auth.getUser).
// ═══════════════════════════════════════════════════════════

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const rendre = (corps: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...CORS, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return rendre({ ok: false, motif: "methode" }, 405);

  const jeton = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jeton) return rendre({ ok: false, motif: "session_absente" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: qui, error: errQui } = await admin.auth.getUser(jeton);
  const user = qui?.user ?? null;
  if (errQui || !user?.id) return rendre({ ok: false, motif: "session_refusee" }, 401);
  const { data: beta, error: errBeta } = await admin.rpc("messagerie_beta", { p_user: user.id });
  if (errBeta || beta !== true) return rendre({ ok: false, motif: "hors_beta" }, 403);

  let lien = "";
  try { lien = String((await req.json())?.lien ?? ""); } catch { return rendre({ ok: false, motif: "corps_illisible" }, 400); }
  let cible: URL;
  try { cible = new URL(lien); } catch { return rendre({ ok: false, motif: "lien_illisible" }, 400); }
  if (!hoteFichierAutorise(cible)) return rendre({ ok: false, motif: "hote_refuse" }, 400);

  let r: Response;
  try {
    r = await fetch(cible.toString(), { redirect: "manual", signal: AbortSignal.timeout(15_000) });
  } catch {
    return rendre({ ok: false, motif: "reseau" });
  }
  if (r.status !== 200) { await r.body?.cancel().catch(() => {}); return rendre({ ok: false, motif: `http_${r.status}` }); }
  const annonce = Number(r.headers.get("content-length") ?? "0");
  if (annonce > FICHIER_MAX_OCTETS) { await r.body?.cancel().catch(() => {}); return rendre({ ok: false, motif: "trop_gros" }); }
  const octets = new Uint8Array(await r.arrayBuffer());
  if (octets.length > FICHIER_MAX_OCTETS) return rendre({ ok: false, motif: "trop_gros" });
  const genre = genreDuFichier(octets);
  if (!genre) return rendre({ ok: false, motif: "fichier_inconnu", octets: octets.length });
  console.log(`[bordereau-fichier] ${genre.type} ${octets.length} o lus pour un compte bêta`);
  return rendre({ ok: true, base64: enBase64(octets.buffer), type: genre.type, octets: octets.length });
});
