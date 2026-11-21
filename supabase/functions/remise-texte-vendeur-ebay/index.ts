// ═══════════════════════════════════════════════════════════════════════════
// LE TEXTE DU VENDEUR REMIS SUR UNE ANNONCE eBAY EN LIGNE, SUR PLACE (21/11/2026, ordre de Nico — point 3)
// ═══════════════════════════════════════════════════════════════════════════
// Une annonce eBay publiée par l'API avec une description RÉDIGÉE PAR L'IA parce que le texte du vendeur n'avait pas été
// lu (compte 8fd44622, lot du 19/11 : lecture d'origine échouée, garde du lot) reçoit, UNE FOIS le vrai texte lu sur la
// fiche, ce texte : même numéro, vues et favoris gardés, ni retrait, ni republication, ni quota, ni mail.
// Règles (même modèle que remise-ordre-photos-ebay, 06/11) :
//   · rien tant que la fiche n'a pas un VRAI texte lu APRÈS la copie (marqueur daté, jamais « à relire », jamais une
//     référence « $17b », deux mots au moins) — « texte_pas_encore_lu » ;
//   · l'annonce relue en ligne : elle reprend déjà ce texte → « deja_bon » ; elle n'est plus la copie de notre dépôt
//     (changée par la personne depuis FillSell) → on n'y touche JAMAIS (« different_du_depot ») ;
//   · seule la DESCRIPTION change (article et offre), rien d'autre.
// Appelant : un script de réparation avec la clé de service (jamais l'app, jamais un cron) ; `executer: false` (défaut)
// = simulation, rien n'est écrit. Une annonce par appel.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { lireEnvEbay, obtenirAccessToken } from "../_shared/ebay-oauth.ts";
import { lireAnnonceEbay, modifierAnnonceEbay } from "../_shared/ebay-modifier-annonce.ts";
import { copieReprendLeTexte, texteVendeurLuApres } from "../_shared/contenu-fiche.js";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function roleDuJeton(authHeader: string): string | null {
  try {
    const charge = authHeader.replace(/^Bearer\s+/i, "").split(".")[1] ?? "";
    const texte = atob(charge.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(charge.length / 4) * 4, "="));
    return String(JSON.parse(texte)?.role ?? "") || null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  // La passerelle a vérifié la signature (verify_jwt) ; seul le rôle de service passe.
  if (roleDuJeton(req.headers.get("Authorization") ?? "") !== "service_role") return json({ ok: false, motif: "reserve_au_service" }, 403);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const jobId = String(body.job_id ?? "");
  const executer = body.executer === true;
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return json({ ok: false, motif: "parametres" }, 400);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: j } = await admin.from("cross_post_jobs")
    .select("id, user_id, inventaire_id, platform, voie, status, description, created_at, platform_fields").eq("id", jobId).maybeSingle();
  const pf = { ...((j?.platform_fields as Record<string, unknown> | null) ?? {}) };
  const api = (pf.ebay_api ?? {}) as Record<string, unknown>;
  const ids = { sku: String(api.sku ?? ""), offerId: String(api.offer_id ?? ""), listingId: String(api.listing_id ?? "") };
  if (!j || j.platform !== "ebay" || j.voie !== "api" || j.status !== "published" || !ids.sku || !ids.offerId || j.inventaire_id == null) {
    return json({ ok: false, motif: "pas_une_annonce_api_publiee" });
  }
  const { data: fiche } = await admin.from("inventaire").select("description, attributs").eq("id", j.inventaire_id).eq("user_id", j.user_id).maybeSingle();
  const texte = texteVendeurLuApres(fiche as Record<string, unknown> | null, String(j.created_at)) as string | null;
  if (!texte) return json({ ok: true, verdict: "texte_pas_encore_lu", detail: "le vrai texte du vendeur n'est pas encore lu sur la fiche : rien n'est touché" });

  const jeton = await obtenirAccessToken(admin, String(j.user_id));
  if (!jeton.ok) return json({ ok: false, motif: `jeton_${jeton.motif}` });
  const env = lireEnvEbay();
  const lu = await lireAnnonceEbay(env, jeton.token as string, ids);
  if (!lu.ok) return json({ ok: false, motif: lu.motif, message: lu.message });
  const enLigne = String(lu.annonce.description ?? "");
  const verdict = copieReprendLeTexte(enLigne, texte) ? "deja_bon"
    : copieReprendLeTexte(enLigne, String(j.description ?? "")) ? "texte_a_remettre"
    : "different_du_depot";
  const trace = { le: new Date().toISOString(), verdict, executer };
  console.log(`[remise-texte-vendeur-ebay] job=${jobId.slice(0, 8)} annonce=${ids.listingId} → ${verdict}${executer ? "" : " (simulation)"}`);
  if (verdict !== "texte_a_remettre" || !executer) return json({ ok: true, verdict, simulation: !executer, en_ligne: enLigne.slice(0, 300), texte: texte.slice(0, 300) });

  const r = await modifierAnnonceEbay(env, jeton.token as string, ids, { description: texte });
  console.log(`[remise-texte-vendeur-ebay] job=${jobId.slice(0, 8)} annonce=${ids.listingId} → modifier : ${r.ok ? `ok (${r.changements.join(", ")})` : r.motif}`);
  if (!r.ok) return json(r);
  const modifs = Array.isArray(pf.modifications_ebay) ? (pf.modifications_ebay as unknown[]).slice(-9) : [];
  const { error } = await admin.from("cross_post_jobs").update({
    description: texte,
    platform_fields: { ...pf, texte_vendeur_remis: trace,
      modifications_ebay: [...modifs, { le: trace.le, champs: r.changements, par: "FillSell (texte du vendeur remis, 21/11)" }] },
  }).eq("id", jobId).eq("status", "published");
  if (error) console.warn(`[remise-texte-vendeur-ebay] texte remis chez eBay, tâche non mise à jour — ${error.message}`);
  return json({ ok: true, verdict, changements: r.changements, listing_id: r.listing_id });
});
