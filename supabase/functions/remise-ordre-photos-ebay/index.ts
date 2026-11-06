// ═══════════════════════════════════════════════════════════════════════════
// REMISE EN ORDRE DES PHOTOS D'UNE ANNONCE eBAY EN LIGNE, SUR PLACE (06/11 soir, feu vert de Nico — ordre des photos)
// ═══════════════════════════════════════════════════════════════════════════
// Une annonce eBay publiée par l'API dont les photos ne sont plus dans l'ordre de l'article (article réordonné APRÈS la
// publication) est remise dans l'ordre de l'article PAR FILLSELL, sur place : même numéro, vues et favoris gardés,
// aucune republication, aucun quota, aucun mail. Règle de Nico pour toute remise en ordre automatique :
//   · lire d'abord l'ordre RÉELLEMENT en ligne (eBay : l'article d'inventaire, lireAnnonceEbay) ;
//   · en ligne = ordre de l'article → rien (« deja_bon ») ;
//   · en ligne = ordre de NOTRE dépôt (le job) ≠ article → remise en ordre (« remise_en_ordre ») ;
//   · en ligne ≠ dépôt et ≠ article → changé chez eBay par la personne, ou photos ré-hébergées : on n'y touche JAMAIS (« different_du_depot ») ;
//   · le moindre doute (photos illisibles, autre jeu de photos, choix fait pour eBay) → rien.
// Seule l'ORDRE change : mêmes photos, ni ajout ni retrait (_shared/ordre-photos.js).
// Appelant : un script de réparation avec la clé de service (jamais l'app, jamais un cron) ; `executer: false` (défaut)
// = simulation, rien n'est écrit. Une annonce par appel.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { lireEnvEbay, obtenirAccessToken } from "../_shared/ebay-oauth.ts";
import { lireAnnonceEbay, modifierAnnonceEbay } from "../_shared/ebay-modifier-annonce.ts";
import { clePhoto, photosDansLOrdreDeLArticle } from "../_shared/ordre-photos.js";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function roleDuJeton(authHeader: string): string | null {
  try {
    const charge = authHeader.replace(/^Bearer\s+/i, "").split(".")[1] ?? "";
    const texte = atob(charge.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(charge.length / 4) * 4, "="));
    return String(JSON.parse(texte)?.role ?? "") || null;
  } catch { return null; }
}

const cles = (liste: unknown[]) => liste.map((p) => clePhoto(p));
const memeOrdre = (a: (string | null)[], b: (string | null)[]) => a.length === b.length && a.every((c, i) => c != null && c === b[i]);

Deno.serve(async (req) => {
  // La passerelle a vérifié la signature (verify_jwt) ; seul le rôle de service passe.
  if (roleDuJeton(req.headers.get("Authorization") ?? "") !== "service_role") return json({ ok: false, motif: "reserve_au_service" }, 403);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const jobId = String(body.job_id ?? "");
  const executer = body.executer === true;
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return json({ ok: false, motif: "parametres" }, 400);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: j } = await admin.from("cross_post_jobs")
    .select("id, user_id, inventaire_id, platform, voie, status, photos, platform_fields").eq("id", jobId).maybeSingle();
  const pf = { ...((j?.platform_fields as Record<string, unknown> | null) ?? {}) };
  const api = (pf.ebay_api ?? {}) as Record<string, unknown>;
  const ids = { sku: String(api.sku ?? ""), offerId: String(api.offer_id ?? ""), listingId: String(api.listing_id ?? "") };
  if (!j || j.platform !== "ebay" || j.voie !== "api" || j.status !== "published" || !ids.sku || !ids.offerId || j.inventaire_id == null) {
    return json({ ok: false, motif: "pas_une_annonce_api_publiee" });
  }
  const { data: fiche } = await admin.from("inventaire").select("photos").eq("id", j.inventaire_id).eq("user_id", j.user_id).maybeSingle();
  const depot = Array.isArray(j.photos) ? j.photos as unknown[] : [];
  const cible = photosDansLOrdreDeLArticle(depot, (fiche?.photos ?? null) as unknown[] | null, pf) as unknown[];
  if (cible === depot) return json({ ok: true, verdict: "rien_a_faire", detail: "le dépôt est déjà dans l'ordre de l'article (ou choix fait pour eBay, ou doute)" });

  const jeton = await obtenirAccessToken(admin, String(j.user_id));
  if (!jeton.ok) return json({ ok: false, motif: `jeton_${jeton.motif}` });
  const env = lireEnvEbay();
  const lu = await lireAnnonceEbay(env, jeton.token as string, ids);
  if (!lu.ok) return json({ ok: false, motif: lu.motif, message: lu.message });

  const enLigne = cles(lu.annonce.photos);
  const verdict = memeOrdre(enLigne, cles(cible)) ? "deja_bon"
    : memeOrdre(enLigne, cles(depot)) ? "remise_en_ordre"
    : "different_du_depot";
  const trace = { le: new Date().toISOString(), verdict, en_ligne: lu.annonce.photos.length, executer };
  console.log(`[remise-ordre-photos-ebay] job=${jobId.slice(0, 8)} annonce=${ids.listingId} → ${verdict}${executer ? "" : " (simulation)"}`);
  if (verdict !== "remise_en_ordre" || !executer) return json({ ok: true, verdict, simulation: !executer, en_ligne: lu.annonce.photos, cible: cible.map((p) => (typeof p === "string" ? p : (p as { url?: string })?.url)) });

  const urlsCible = cible.map((p) => String(typeof p === "string" ? p : (p as { url?: string })?.url ?? "")).filter(Boolean);
  const r = await modifierAnnonceEbay(env, jeton.token as string, ids, { photos: urlsCible });
  console.log(`[remise-ordre-photos-ebay] job=${jobId.slice(0, 8)} annonce=${ids.listingId} → modifier : ${r.ok ? `ok (${r.changements.join(", ")})` : r.motif}`);
  if (!r.ok) return json(r);
  const modifs = Array.isArray(pf.modifications_ebay) ? (pf.modifications_ebay as unknown[]).slice(-9) : [];
  const { error } = await admin.from("cross_post_jobs").update({
    photos: cible,
    platform_fields: { ...pf, remise_ordre_photos: trace,
      modifications_ebay: [...modifs, { le: trace.le, champs: r.changements, par: "FillSell (remise dans l'ordre de l'article, 06/11)" }] },
  }).eq("id", jobId).eq("status", "published");
  if (error) console.warn(`[remise-ordre-photos-ebay] annonce remise en ordre chez eBay, tâche non mise à jour — ${error.message}`);
  return json({ ok: true, verdict, changements: r.changements, listing_id: r.listing_id });
});
