// ═══════════════════════════════════════════════════════════════════════════
// rapprochement-ia — L'IA SUR LES DOUTES DU MOTEUR DE FUSION (15/10, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Règles, garde-fous et coût : _shared/rapprochement/ia.js.
// APPELANT : la base (pg_cron, x-cron-secret) ou à la main (mesure). Aucune
// session utilisateur → verify_jwt = false, garde x-cron-secret obligatoire.
// Corps : { user_id, mode: 'mesure' | 'appliquer', limite?, ids?: uuid[],
//           historique?: bool (paires déjà tranchées par la personne, mesure seule) }
// 'mesure' : appelle Haiku, garde le verdict, n'applique RIEN.
// 'appliquer' : en plus, répond à la question par inventaire_doublon_decider_ia.
// Bornes : 60 questions par appel au plus, 100 s, plafond 1 € par compte et
// par passage (au-delà : arrêt, « plafond_atteint »).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import {
  MODELE_IA_FUSION, COTE_MINIATURE, MINIATURES_PAR_FICHE, PLAFOND_EUR_PAR_COMPTE_ET_PASSAGE, USD_EN_EUR,
  CONSIGNE, SCHEMA_REPONSE, NIVEAUX_PHOTO_FORTE,
  questionEligible, clePaire, photosDe, messageTexte, lireReponse, coutUsd, appliquerGardeFous,
} from "../_shared/rapprochement/ia.js";

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { "Content-Type": "application/json" } });
const DUREE_MAX_MS = 100_000;
const DELAI_IA_MS = 20_000;
const CHAMPS_FICHE = "id, user_id, titre, description, marque, attributs, prix_vente, photos, statut, fusionne_dans";

type Source = { type: "url"; url: string } | { type: "base64"; media_type: string; data: string };


// La miniature d'une photo : jamais la photo en grand.
//  · notre Storage : réduite par le service (render/image) ;
//  · eBay (s-lNNN) et Leboncoin (rule=) : la variante miniature de la plateforme ;
//  · sinon (Vinted, Beebs…) : la photo est copiée UN instant dans notre Storage
//    (ia-miniatures/), réduite par le service, puis effacée après l'appel —
//    aucun décodage dans la fonction (15/10 : 12 décodages = WORKER_RESOURCE_LIMIT).
const BUDGET_EPUISE = "budget" as const;
const BUCKET = "listing-photos";
// deno-lint-ignore no-explicit-any
type Contexte = { supabaseUrl: string; admin: any; copies: string[]; budget: { copies: number } };
const renduStorage = (supabaseUrl: string, reste: string) =>
  `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/render/image/public/${reste}?width=${COTE_MINIATURE}&height=${COTE_MINIATURE}&resize=contain&quality=70`;
async function miniature(url: string, cx: Contexte): Promise<Source | null | typeof BUDGET_EPUISE> {
  const prefixe = `${cx.supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/`;
  if (url.startsWith(prefixe)) return { type: "url", url: renduStorage(cx.supabaseUrl, url.slice(prefixe.length).split("?")[0]) };
  if (/^https:\/\/i\.ebayimg\.com\//.test(url)) return { type: "url", url: url.replace(/s-l\d+\./, "s-l225.") };
  if (/^https:\/\/img\.leboncoin\.fr\//.test(url)) return { type: "url", url: url.replace(/([?&])rule=[^&]*/, "$1rule=ad-thumb").replace(/^([^?]+)$/, "$1?rule=ad-thumb") };
  if (cx.budget.copies <= 0) return BUDGET_EPUISE;
  cx.budget.copies--;
  const ctl = new AbortController();
  const minuteur = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) { await r.body?.cancel().catch(() => {}); return null; }
    const type = String(r.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) { await r.body?.cancel().catch(() => {}); return null; }
    const octets = new Uint8Array(await r.arrayBuffer());
    if (octets.length > 8_000_000) return null;
    const chemin = `ia-miniatures/${crypto.randomUUID()}.${type.split("/")[1]}`;
    const { error } = await cx.admin.storage.from(BUCKET).upload(chemin, octets, { contentType: type, upsert: true });
    if (error) return null;
    cx.copies.push(chemin);
    return { type: "url", url: renduStorage(cx.supabaseUrl, `${BUCKET}/${chemin}`) };
  } catch { return null; } finally { clearTimeout(minuteur); }
}

async function appelHaiku(apiKey: string, contenu: unknown[]): Promise<{ texte: string; usage: Record<string, number>; stop: string }> {
  const ctl = new AbortController();
  const minuteur = setTimeout(() => ctl.abort(), DELAI_IA_MS);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODELE_IA_FUSION,
        max_tokens: 200,
        thinking: { type: "disabled" },
        output_config: { format: { type: "json_schema", schema: SCHEMA_REPONSE } },
        system: CONSIGNE,
        messages: [{ role: "user", content: contenu }],
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`anthropic ${res.status} ${JSON.stringify(j).slice(0, 200)}`);
    const bloc = (j.content ?? []).find((b: { type: string }) => b.type === "text");
    return { texte: bloc?.text ?? "", usage: j.usage ?? {}, stop: String(j.stop_reason ?? "") };
  } finally { clearTimeout(minuteur); }
}

serve(async (req) => {
  const secret = req.headers.get("x-cron-secret");
  const attendu = Deno.env.get("CRON_SECRET");
  if (!secret || !attendu || secret !== attendu) return json({ error: "unauthorized" }, 401);
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY absente" }, 500);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* vide */ }
  const userId = String(body.user_id ?? "");
  if (!/^[0-9a-f-]{36}$/.test(userId)) return json({ error: "user_id requis" }, 400);
  const mode = body.mode === "appliquer" ? "appliquer" : "mesure";
  const historique = body.historique === true && mode === "mesure";
  const limite = Math.max(1, Math.min(60, Number(body.limite) || 20));
  const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 60) : null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const debut = Date.now();

  let q = admin.from("inventaire_doublons").select("id, user_id, garde, absorbe, statut, motif, preuves, decide_par").eq("user_id", userId);
  if (ids?.length) q = q.in("id", ids);
  else q = q.eq("statut", "proposee").order("created_at", { ascending: true });
  const { data: questions, error: qErr } = await q.limit(400);
  if (qErr) return json({ error: qErr.message }, 500);

  const { count: nonsPersonne } = await admin.from("inventaire_doublons").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("statut", "refusee").eq("decide_par", "utilisateur");
  const compteDitNon = (nonsPersonne ?? 0) > 0;
  const { data: dejaJuges } = await admin.from("rapprochement_ia_verdicts").select("id, paire, verdict, mode, applique, raison").eq("user_id", userId).limit(5000);
  const juges = new Set(((dejaJuges ?? []) as Array<{ paire: string }>).map((x) => x.paire));
  // Un verdict de MESURE pas encore appliqué : en mode « appliquer », il sert tel
  // quel (jamais un second appel pour la même paire).
  const mesures = new Map(((dejaJuges ?? []) as Array<Record<string, unknown>>)
    .filter((x) => x.mode === "mesure" && x.applique == null && (x.verdict === "meme" || x.verdict === "different"))
    .map((x) => [String(x.paire), x]));

  // Copies temporaires par appel (réseau, pas de CPU) ; au-delà, la paire attend
  // l'appel suivant — jamais un verdict « texte » faute de miniatures.
  const cx: Contexte = { supabaseUrl, admin, copies: [], budget: { copies: 60 } };
  let coutEur = 0; let traites = 0;
  const resultats: Array<Record<string, unknown>> = [];
  let arret: string | null = null;

  // deno-lint-ignore no-explicit-any
  for (const d of (questions ?? []) as any[]) {
    if (traites >= limite) break;
    if (Date.now() - debut > DUREE_MAX_MS) { arret = "duree"; break; }
    if (coutEur >= PLAFOND_EUR_PAR_COMPTE_ET_PASSAGE) { arret = "plafond_atteint"; break; }
    const elig = historique ? (questionEligible({ ...d, statut: "proposee" })) : questionEligible(d);
    if (!elig.ok) continue;
    const paire = clePaire(d);
    const mesure = mode === "appliquer" && d.statut === "proposee" ? mesures.get(paire) : null;
    if (mesure) {
      const dec = mesure.verdict === "meme" ? "oui" : "non";
      const { data: res, error: eDec } = await admin.rpc("inventaire_doublon_decider_ia", { p_id: d.id, p_decision: dec, p_raison: mesure.raison ?? null });
      const applique = eDec ? `erreur:${eDec.message.slice(0, 80)}` : (res?.ok ? dec : `refus:${res?.reason ?? "?"}`);
      await admin.from("rapprochement_ia_verdicts").update({ mode: "appliquer", applique }).eq("id", String(mesure.id));
      resultats.push({ id: d.id, motif: d.motif, decision: dec, reprise_de_la_mesure: true, applique, usd: 0 });
      continue;
    }
    if (juges.has(paire)) continue; // jamais deux appels pour la même paire
    const { data: fiches } = await admin.from("inventaire").select(CHAMPS_FICHE).in("id", [d.garde, d.absorbe]);
    // deno-lint-ignore no-explicit-any
    const garde = ((fiches ?? []) as any[]).find((f) => String(f.id) === String(d.garde));
    // deno-lint-ignore no-explicit-any
    const absorbe = ((fiches ?? []) as any[]).find((f) => String(f.id) === String(d.absorbe));
    if (!garde || !absorbe) continue;
    traites++;
    let phase: "texte" | "images" = "texte";
    let usd = 0; let jetE = 0; let jetS = 0;
    let rep = { verdict: "incertain", raison: null as string | null, besoin_images: false };
    try {
      const r1 = await appelHaiku(apiKey, [{ type: "text", text: messageTexte({ garde, absorbe, motif: d.motif, preuves: d.preuves }) }]);
      usd += coutUsd(r1.usage); jetE += Number(r1.usage.input_tokens) || 0; jetS += Number(r1.usage.output_tokens) || 0;
      rep = r1.stop === "refusal" ? { verdict: "incertain", raison: "refus du modèle", besoin_images: false } : lireReponse(r1.texte);
      const photoForte = NIVEAUX_PHOTO_FORTE.has(String(d.preuves?.photo_niveau ?? ""));
      // (mesure du 15/10 : 20 paires, 20 « incertain » sans images) les miniatures dès que le texte ne tranche pas.
      const voirImages = rep.verdict === "incertain" || (rep.verdict === "meme" && !photoForte);
      const pa = photosDe(garde).slice(0, MINIATURES_PAR_FICHE); const pb = photosDe(absorbe).slice(0, MINIATURES_PAR_FICHE);
      if (voirImages && pa.length && pb.length) {
        // Une à une (15/10 : 12 décodages en parallèle = WORKER_RESOURCE_LIMIT).
        const ra: Array<Source | null | typeof BUDGET_EPUISE> = [];
        for (const u of pa) ra.push(await miniature(u, cx));
        const rb: Array<Source | null | typeof BUDGET_EPUISE> = [];
        for (const u of pb) rb.push(await miniature(u, cx));
        if ([...ra, ...rb].includes(BUDGET_EPUISE)) { traites--; coutEur += usd * USD_EN_EUR; arret = "budget_images"; break; }
        const ma = ra.filter((x) => x && x !== BUDGET_EPUISE) as Source[];
        const mb = rb.filter((x) => x && x !== BUDGET_EPUISE) as Source[];
        if (ma.length && mb.length) {
          phase = "images";
          const r2 = await appelHaiku(apiKey, [
            { type: "text", text: messageTexte({ garde, absorbe, motif: d.motif, preuves: d.preuves, avecImages: true }) },
            { type: "text", text: "Photos de la FICHE A :" }, ...ma.map((source) => ({ type: "image", source })),
            { type: "text", text: "Photos de la FICHE B :" }, ...mb.map((source) => ({ type: "image", source })),
            { type: "text", text: "Avec ces miniatures : même pièce, deux pièces, ou incertain ?" },
          ]);
          usd += coutUsd(r2.usage); jetE += Number(r2.usage.input_tokens) || 0; jetS += Number(r2.usage.output_tokens) || 0;
          rep = r2.stop === "refusal" ? { verdict: "incertain", raison: "refus du modèle", besoin_images: false } : lireReponse(r2.texte);
        } else if (rep.verdict === "meme") {
          rep = { verdict: "incertain", raison: `${rep.raison ?? ""} (photos introuvables : pas de preuve photo)`.trim(), besoin_images: false };
        }
      } else if (rep.verdict === "meme" && !photoForte) {
        rep = { verdict: "incertain", raison: `${rep.raison ?? ""} (aucune photo à comparer : jamais sur le texte seul)`.trim(), besoin_images: false };
      }
    } catch (e) {
      resultats.push({ id: d.id, erreur: String((e as Error)?.message ?? e).slice(0, 160) });
      traites--; // un appel raté n'est pas un verdict : la paire sera rejugée
      continue;
    }
    coutEur += usd * USD_EN_EUR;
    const g = appliquerGardeFous({ verdict: rep.verdict, phase, d, garde, absorbe, compteDitNon });
    let applique: string | null = g.garde_fou ? `garde_fou:${g.garde_fou}` : null;
    if (mode === "appliquer" && (g.decision === "oui" || g.decision === "non")) {
      const { data: res, error: eDec } = await admin.rpc("inventaire_doublon_decider_ia", { p_id: d.id, p_decision: g.decision, p_raison: rep.raison });
      applique = eDec ? `erreur:${eDec.message.slice(0, 80)}` : (res?.ok ? g.decision : `refus:${res?.reason ?? "?"}`);
    }
    await admin.from("rapprochement_ia_verdicts").upsert({
      user_id: userId, doublon_id: d.id, paire, motif: d.motif,
      verdict: g.decision === "oui" ? "meme" : g.decision === "non" ? "different" : "incertain",
      verdict_brut: rep.verdict, raison: rep.raison, phase, modele: MODELE_IA_FUSION,
      jetons_entree: jetE, jetons_sortie: jetS, cout_usd: Number(usd.toFixed(6)), mode, applique,
    }, { onConflict: "user_id,paire", ignoreDuplicates: true });
    juges.add(paire);
    resultats.push({ id: d.id, motif: d.motif, statut_avant: d.statut, decide_par: d.decide_par ?? null, brut: rep.verdict, decision: g.decision, garde_fou: g.garde_fou, phase, raison: rep.raison, usd: Number(usd.toFixed(6)), applique });
  }
  // Les copies temporaires partent dès la fin des appels (Anthropic les a lues).
  if (cx.copies.length) await admin.storage.from(BUCKET).remove(cx.copies).catch(() => {});
  const n = resultats.filter((r) => !r.erreur).length;
  return json({
    ok: true, mode, user_id: userId, traites: n, arret,
    cout_eur: Number(coutEur.toFixed(4)), cout_moyen_eur: n ? Number((coutEur / n).toFixed(6)) : null,
    compte_dit_non: compteDitNon, duree_ms: Date.now() - debut, resultats,
  });
});
