// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// BANC DE LA RETOUCHE PHOTO — MÊME RETOUCHE, MODÈLES OPENAI COMPARÉS (14/11/2026, lot de Nico, point 2)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Réservé au service_role (même garde que fetch-ebay-aspects : Bearer = SUPABASE_SERVICE_ROLE_KEY ou SERVICE_ROLE_KEY).
// Corps : { modele, qualite, taille, complexite?, prompt: "legere" | "fond_blanc_vetement" | "mannequin", photos: [url],
//           dossier } — les photos sont celles des comptes de Nico ou d'Ornella SEULEMENT (refus de toute autre URL).
// Chaque photo passe par retoucherPhoto (_shared/retouche-photo.ts, la fonction de l'app), sans repli (chaîne d'un seul
// modèle) ; l'image rendue est rangée sous listing-photos/<Nico>/banc-retouche/<dossier>/ ; chaque appel facturé laisse
// une ligne usage_logs « photo_retouche_banc » avec son coût sous `cout_openai_usd` — JAMAIS `cost_usd` : ia_fournisseur_de()
// range une feature inconnue chez Anthropic, et le 14/11 les 3,25 $ OpenAI du banc ont gonflé le compteur Anthropic du
// filet (corrigé par scripts/reparations/20261114_compteur_ia_banc_retouche.sql).
// Rend, par photo : modèle, HTTP, durée, jetons facturés, coût, URL de l'image rendue.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { retoucherPhoto, coutImageUsd, PROMPT_RETOUCHE_LEGERE, FONDS_RETOUCHE, CLAUSE_FOND_VETEMENT } from "../_shared/retouche-photo.ts";

const NICO = "f44b5917-bccc-4431-ba41-f40571a2ed18";
// Comptes de test autorisés (Nico, Ornella) : le dossier de l'URL de la photo doit en être un.
const COMPTES_TEST = new Set([
  NICO, "5322fa18-c194-458b-a222-7ee4093c4968",
  "36e145e8-ff11-4ba7-81f4-b6beb7937be6", "c9d1a587-3775-43ce-a835-78fffe4e0899", "f8aa02a5-23cb-4325-bba8-127f61a75741",
]);
const PREFIXE = "/storage/v1/object/public/listing-photos/";

// Étude seulement (point 2.5 de Nico) : le vêtement porté sur un mannequin — rien n'est construit dans l'app.
const PROMPT_MANNEQUIN = `Show this exact garment worn by a plain, neutral, faceless white store mannequin (no real person, no face, no skin), standing straight, front view, on a clean seamless light-grey studio background with soft even e-commerce lighting. The garment must remain strictly identical to the original photo: same colors, same material and texture, same cut, length and proportions, every pattern, print, logo, text, button and stitching preserved exactly, every defect or sign of wear kept. Do not redesign, recolor, resize or embellish the garment. Do not add any other clothing item, accessory, prop, text or watermark.`;

const PROMPTS: Record<string, string> = {
  legere: PROMPT_RETOUCHE_LEGERE,
  fond_blanc_vetement: `${CLAUSE_FOND_VETEMENT} ${FONDS_RETOUCHE.white}`,
  mannequin: PROMPT_MANNEQUIN,
};

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

serve(async (req) => {
  const permis = [Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), Deno.env.get("SERVICE_ROLE_KEY")].filter(Boolean).map((k) => `Bearer ${k}`);
  if (!permis.includes(req.headers.get("Authorization") ?? "")) return json({ error: "réservé au service_role" }, 403);
  const corps = await req.json().catch(() => ({}));
  const modele = String(corps.modele ?? "");
  const qualite = String(corps.qualite ?? "low");
  const taille = String(corps.taille ?? "1024x1024");
  const prompt = PROMPTS[String(corps.prompt ?? "legere")];
  const dossier = String(corps.dossier ?? "").replace(/[^a-z0-9_.-]/gi, "").slice(0, 60);
  const photos: string[] = Array.isArray(corps.photos) ? corps.photos.filter((u: unknown) => typeof u === "string").slice(0, 10) : [];
  // Le rang GLOBAL de chaque photo dans l'échantillon (nom du fichier rendu : jamais deux photos sous le même nom).
  const rangs: number[] = Array.isArray(corps.rangs) && corps.rangs.length === photos.length ? corps.rangs.map((r: unknown) => Number(r) | 0) : photos.map((_, i) => i);
  // Entrée « 1024 » : la photo réduite par Storage (côté le plus long à 1024 px, proportions gardées) avant l'envoi.
  const entree = corps.entree === "1024" ? "1024" : "brute";
  if (!/^gpt-image-[0-9a-z.-]+$/.test(modele) || !prompt || !dossier || !photos.length) return json({ error: "corps invalide" }, 400);
  for (const u of photos) {
    const i = u.indexOf(PREFIXE);
    if (i < 0 || !COMPTES_TEST.has(u.slice(i + PREFIXE.length, i + PREFIXE.length + 36))) return json({ error: `photo hors des comptes de test : ${u.slice(0, 120)}` }, 400);
  }
  const complexite = corps.complexite === undefined ? null : (corps.complexite === null ? null : String(corps.complexite));
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cle = Deno.env.get("OPENAI_API_KEY")!;

  const resultats = await Promise.all(photos.map(async (url, idx) => {
    const m = url.match(/\/storage\/v1\/object\/public\/([^?]+)/);
    const source = entree === "1024" && m
      ? `${Deno.env.get("SUPABASE_URL")!.replace(/\/+$/, "")}/storage/v1/render/image/public/${m[1]}?width=1024&height=1024&resize=contain&quality=90&format=origin`
      : url;
    const src = await fetch(source);
    if (!src.ok) return { idx, ok: false, erreur: `photo illisible HTTP ${src.status}` };
    const blob = await src.blob();
    const debut = Date.now();
    const r = await retoucherPhoto({ cle, blob, prompt, qualite, taille, chaine: [modele], complexite });
    const ms = Date.now() - debut;
    if (!r.ok) return { idx, ok: false, ms, essais: r.essais };
    const cout = r.usage ? coutImageUsd(r.modele, r.usage) : null;
    const bin = atob(r.b64);
    const octets = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) octets[k] = bin.charCodeAt(k);
    const chemin = `${NICO}/banc-retouche/${dossier}/${modele}_${qualite}_${complexite ?? "defaut"}_${entree}_r${rangs[idx]}.png`;
    const { error: upErr } = await admin.storage.from("listing-photos").upload(chemin, new Blob([octets], { type: "image/png" }), { contentType: "image/png", upsert: true });
    await admin.from("usage_logs").insert({
      user_id: NICO, feature: "photo_retouche_banc",
      metadata: { modele: r.modele, qualite, taille, complexite, entree, prompt: corps.prompt ?? "legere", dossier, rang: rangs[idx], octets_entree: blob.size, duration_ms: ms,
        openai_text_input_tokens: r.usage?.texte ?? null, openai_image_input_tokens: r.usage?.image ?? null, openai_output_tokens: r.usage?.sortie ?? null,
        ...(cout != null ? { cout_openai_usd: Number(cout.toFixed(5)) } : {}) },
    });
    return { idx, rang: rangs[idx], ok: true, ms, octets_entree: blob.size, modele: r.modele, usage: r.usage, cout_usd: cout, octets: octets.length,
      url: upErr ? null : admin.storage.from("listing-photos").getPublicUrl(chemin).data.publicUrl, erreur_envoi: upErr?.message ?? null };
  }));
  return json({ modele, qualite, taille, complexite, entree, prompt: corps.prompt ?? "legere", resultats });
});
