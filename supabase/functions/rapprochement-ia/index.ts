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
import {
  candidatsDe, trancherParIdentifiant, trancherParPhotos, designe,
  CONSIGNE_ANNONCE, messageAnnonce, schemaAnnonce, lireReponseAnnonce, decisionIA, LETTRES,
} from "../_shared/annonce-partagee.js";

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
  return await appelHaikuAvec(apiKey, CONSIGNE, SCHEMA_REPONSE, contenu);
}
async function appelHaikuAvec(apiKey: string, system: string, schema: unknown, contenu: unknown[]): Promise<{ texte: string; usage: Record<string, number>; stop: string }> {
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
        output_config: { format: { type: "json_schema", schema } },
        system,
        messages: [{ role: "user", content: contenu }],
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`anthropic ${res.status} ${JSON.stringify(j).slice(0, 200)}`);
    const bloc = (j.content ?? []).find((b: { type: string }) => b.type === "text");
    return { texte: bloc?.text ?? "", usage: j.usage ?? {}, stop: String(j.stop_reason ?? "") };
  } finally { clearTimeout(minuteur); }
}

// ═══ UNE ANNONCE, DEUX FICHES : LA CASCADE (15/10 soir, Louis) ═══════════════
// Règles : _shared/annonce-partagee.js. Travail : les jobs RETENUS par une
// annonce partagée (needs_user « annonce_partagee » pas encore jugée, ou
// pending « a_trancher » posé par get-pending-jobs). La décision s'applique
// par annonce_partagee_attribuer (base) ; l'incertain est daté sur les jobs
// (cascade.etat = 'incertain') — get-pending-jobs pose alors la question.
const COLS_JOB = "id, platform, status, action, inventaire_id, title, listing_url, platform_listing_id, platform_fields, handler_build, created_at";
// deno-lint-ignore no-explicit-any
async function annoncesPartagees({ admin, supabaseUrl, apiKey, userId, mesure, annoncesExplicites = null }: { admin: any; supabaseUrl: string; apiKey: string; userId: string; mesure: boolean; annoncesExplicites?: Array<{ platform: string; L: string }> | null }) {
  const debut = Date.now();
  const { data: brut, error } = await admin.from("cross_post_jobs").select(COLS_JOB)
    .eq("user_id", userId).in("status", ["needs_user", "pending"]).limit(2000);
  if (error) return { ok: false, error: error.message };
  // deno-lint-ignore no-explicit-any
  const pfDe = (j: any) => (j?.platform_fields && typeof j.platform_fields === "object" ? j.platform_fields : {});
  // deno-lint-ignore no-explicit-any
  const retenus = ((brut ?? []) as any[]).filter((j) => {
    const pf = pfDe(j);
    const etat = String(pf?.annonce_partagee?.cascade?.etat ?? "");
    return (j.status === "needs_user" && pf.needs_user_source === "annonce_partagee" && etat !== "incertain")
      || (j.status === "pending" && etat === "a_trancher");
  });
  // deno-lint-ignore no-explicit-any
  const groupes = new Map<string, { platform: string; L: string; jobs: any[] }>();
  for (const j of retenus) {
    const pf = pfDe(j);
    const L = String(pf?.annonce_partagee?.annonce ?? j.platform_listing_id ?? "").trim();
    if (!L) continue;
    const cle = `${j.platform}:${L}`;
    if (!groupes.has(cle)) groupes.set(cle, { platform: j.platform, L, jobs: [] });
    groupes.get(cle)!.jobs.push(j);
  }
  // Le balayage du parc (annonces portées par plusieurs fiches SANS geste en
  // attente) : mêmes étapes, mêmes gardes ; sans job retenu, un « incertain »
  // ne pose aucune question (rien ne doit être retiré).
  for (const a of annoncesExplicites ?? []) {
    const cle = `${a.platform}:${a.L}`;
    if (!groupes.has(cle)) groupes.set(cle, { platform: a.platform, L: a.L, jobs: [] });
  }
  const { data: cfg } = await admin.from("coin_config").select("value").eq("key", "rapprochement_ia_actif").maybeSingle();
  const iaActif = String(cfg?.value ?? "0") === "1" && !!apiKey;
  const cx: Contexte = { supabaseUrl, admin, copies: [], budget: { copies: 30 } };
  const resultats: Array<Record<string, unknown>> = [];
  let coutEur = 0;

  // deno-lint-ignore no-explicit-any
  const incertain = async (g: { platform: string; L: string; jobs: any[] }, motif: string, trace: Record<string, unknown> = {}) => {
    resultats.push({ annonce: `${g.platform}:${g.L}`, issue: "incertain", motif, ...trace });
    if (mesure) return;
    for (const j of g.jobs) {
      const pf = pfDe(j);
      const ap = { ...(pf.annonce_partagee ?? {}), annonce: g.L, cascade: { etat: "incertain", le: new Date().toISOString(), motif, ...trace } };
      await admin.from("cross_post_jobs").update({ platform_fields: { ...pf, annonce_partagee: ap } })
        .eq("id", j.id).in("status", ["pending", "needs_user"]);
    }
  };
  const attribuer = async (g: { platform: string; L: string }, fiche: string, par: string, raison: string) => {
    if (mesure) { resultats.push({ annonce: `${g.platform}:${g.L}`, issue: "attribuee", fiche, par, raison, mesure: true }); return; }
    const { data, error: e } = await admin.rpc("annonce_partagee_attribuer", {
      p_user: userId, p_platform: g.platform, p_listing_id: g.L, p_inventaire_garde: Number(fiche), p_par: par, p_raison: raison.slice(0, 300),
    });
    resultats.push({ annonce: `${g.platform}:${g.L}`, issue: e ? "erreur" : "attribuee", fiche, par, raison, resultat: e ? e.message : data });
  };

  for (const g of groupes.values()) {
    if (Date.now() - debut > DUREE_MAX_MS) break;
    // Tous les jobs du compte sur la plateforme qui désignent l'annonce (preuves comprises).
    const { data: jobsBruts } = await admin.from("cross_post_jobs").select(COLS_JOB)
      .eq("user_id", userId).eq("platform", g.platform).not("inventaire_id", "is", null)
      .or(`platform_listing_id.eq.${g.L},listing_url.ilike.%${g.L}%`).limit(300);
    // deno-lint-ignore no-explicit-any
    const jobs = ((jobsBruts ?? []) as any[]).filter((j) => designe(j, g.L));
    const ids = [...new Set(jobs.map((j) => String(j.inventaire_id)))];
    // deno-lint-ignore no-explicit-any
    const fiches = new Map<string, any>();
    for (let tour = 0; tour < 3 && ids.length; tour++) {
      const manquants = ids.filter((x) => !fiches.has(x));
      if (!manquants.length) break;
      const { data: fs } = await admin.from("inventaire").select(CHAMPS_FICHE).in("id", manquants);
      // deno-lint-ignore no-explicit-any
      for (const f of (fs ?? []) as any[]) {
        fiches.set(String(f.id), f);
        if (f.fusionne_dans && !fiches.has(String(f.fusionne_dans))) ids.push(String(f.fusionne_dans));
      }
    }
    const parFiche = candidatsDe(jobs, fiches, g.L);
    // Une seule fiche la porte encore (lien remis d'accord) mais l'annonce du
    // relevé peut rester rattachée à l'AUTRE fiche (Louis, 3275975415 : le
    // relevé du 25/09 avait suivi le lien croisé) : la preuve d'identifiant
    // de la fiche restante la lui rend (annonce_partagee_attribuer).
    if (parFiche.size === 1) {
      const seule = trancherParIdentifiant(parFiche, g.L);
      if (seule && "fiche" in seule && seule.fiche) {
        const { data: annR } = await admin.from("annonces_plateforme").select("inventaire_id")
          .eq("user_id", userId).eq("platform", g.platform).eq("listing_id", g.L).maybeSingle();
        if (annR?.inventaire_id != null && String(annR.inventaire_id) !== String(seule.fiche)) {
          await attribuer(g, String(seule.fiche), "identifiant", `identifiant de l'annonce (${seule.preuve}, job ${String(seule.job ?? "").slice(0, 8)}) — annonce du relevé rendue à sa fiche`);
          continue;
        }
      }
    }
    if (parFiche.size <= 1) {
      // Plus partagée (lien remis d'accord, fiche fusionnée…) : les jobs repartent.
      for (const j of g.jobs) {
        if (mesure) { resultats.push({ annonce: `${g.platform}:${g.L}`, issue: "plus_partagee", job: j.id, mesure: true }); continue; }
        const { data, error: e } = await admin.rpc("annonce_partagee_reprendre", { p_job: j.id, p_par: "plus_partagee", p_raison: null });
        resultats.push({ annonce: `${g.platform}:${g.L}`, issue: "plus_partagee", job: j.id, resultat: e ? e.message : data });
      }
      continue;
    }
    // 1. Identifiants.
    const idt = trancherParIdentifiant(parFiche, g.L);
    if (idt && "fiche" in idt && idt.fiche) {
      await attribuer(g, String(idt.fiche), "identifiant", `identifiant de l'annonce (${idt.preuve}, job ${String(idt.job ?? "").slice(0, 8)})`);
      continue;
    }
    // 2. Photos en taille réelle (capture de l'annonce) contre les photos des fiches.
    const { data: ann } = await admin.from("annonces_plateforme").select("titre, prix, photo_url, capture, platform")
      .eq("user_id", userId).eq("platform", g.platform).eq("listing_id", g.L).maybeSingle();
    const urlsDe = (v: unknown) => (Array.isArray(v) ? v : []).map((x) => (typeof x === "string" ? x : (x as { url?: string })?.url)).filter((u): u is string => typeof u === "string" && /^https:\/\//.test(u));
    const urlsAnnonce = [...new Set([...urlsDe(ann?.capture?.photos).slice(0, 4), ...(ann?.photo_url ? [ann.photo_url] : [])])];
    const urlsParFiche = new Map<string, string[]>([...parFiche.keys()].map((f) => [f, photosDe(fiches.get(f)).slice(0, 4)]));
    const toutes = [...new Set([...urlsAnnonce, ...[...urlsParFiche.values()].flat()])];
    const { data: emp } = toutes.length
      ? await admin.from("photo_empreintes").select("url, dhash, phash, variantes").in("url", toutes)
      : { data: [] };
    // deno-lint-ignore no-explicit-any
    const parUrl = new Map(((emp ?? []) as any[]).map((e) => [e.url, e]));
    const ph = trancherParPhotos(urlsAnnonce.map((u) => parUrl.get(u)).filter(Boolean),
      new Map([...urlsParFiche].map(([f, us]) => [f, us.map((u) => parUrl.get(u)).filter(Boolean)])));
    // Une fiche VENDUE parmi les candidates : au-delà de l'identifiant (un fait),
    // la personne décide — une attribution déplace la question « Déjà vendu ? ».
    const cands = [...parFiche.keys()].slice(0, LETTRES.length).map((f) => fiches.get(f)).filter(Boolean);
    if (cands.some((f) => f.statut === "vendu")) { await incertain(g, "fiche_vendue", { photos: ph.niveaux, photo_designe: ph.fiche ?? null }); continue; }
    if (ph.fiche) { await attribuer(g, String(ph.fiche), "photo", `photos identiques (${JSON.stringify(ph.niveaux)})`); continue; }
    // 3. L'IA.
    if (!iaActif) { await incertain(g, "ia_inactive", { photos: ph.niveaux }); continue; }
    const paire = `annonce:${g.platform}:${g.L}:${cands.map((f) => String(f.id)).sort().join("|")}`;
    const { data: deja } = await admin.from("rapprochement_ia_verdicts").select("verdict, raison, applique").eq("user_id", userId).eq("paire", paire).maybeSingle();
    if (deja) { await incertain(g, "ia_deja_jugee", { raison_ia: deja.raison }); continue; } // jamais deux appels pour la même annonce
    const annonce = { platform: g.platform, titre: ann?.titre ?? jobs.find((j) => j.status === "published")?.title ?? null, description: ann?.capture?.description ?? null, prix: ann?.prix ?? null };
    let phase: "texte" | "images" = "texte";
    let usd = 0; let jetE = 0; let jetS = 0;
    let rep = { verdicts: cands.map(() => "incertain"), raison: null as string | null, besoin_images: false };
    try {
      const schema = schemaAnnonce(cands.length);
      const r1 = await appelHaikuAvec(apiKey, CONSIGNE_ANNONCE, schema, [{ type: "text", text: messageAnnonce({ annonce, fiches: cands }) }]);
      usd += coutUsd(r1.usage); jetE += Number(r1.usage.input_tokens) || 0; jetS += Number(r1.usage.output_tokens) || 0;
      rep = r1.stop === "refusal" ? rep : lireReponseAnnonce(r1.texte, cands.length);
      let dec = decisionIA(rep.verdicts, "texte");
      if (dec.index == null && urlsAnnonce.length) {
        const ma: Source[] = [];
        for (const u of urlsAnnonce.slice(0, 2)) { const m = await miniature(u, cx); if (m && m !== BUDGET_EPUISE) ma.push(m); }
        const parts: unknown[] = [{ type: "text", text: messageAnnonce({ annonce, fiches: cands, avecImages: true }) }, { type: "text", text: "Photos de L'ANNONCE :" }, ...ma.map((source) => ({ type: "image", source }))];
        let avecPhotos = 0;
        for (let i = 0; i < cands.length; i++) {
          const mf: Source[] = [];
          for (const u of photosDe(cands[i]).slice(0, MINIATURES_PAR_FICHE)) { const m = await miniature(u, cx); if (m && m !== BUDGET_EPUISE) mf.push(m); }
          if (mf.length) avecPhotos++;
          parts.push({ type: "text", text: `Photos de la FICHE ${LETTRES[i]} :` }, ...mf.map((source) => ({ type: "image", source })));
        }
        if (ma.length && avecPhotos === cands.length) {
          phase = "images";
          const r2 = await appelHaikuAvec(apiKey, CONSIGNE_ANNONCE, schema, parts);
          usd += coutUsd(r2.usage); jetE += Number(r2.usage.input_tokens) || 0; jetS += Number(r2.usage.output_tokens) || 0;
          rep = r2.stop === "refusal" ? { ...rep, raison: "refus du modèle" } : lireReponseAnnonce(r2.texte, cands.length);
          dec = decisionIA(rep.verdicts, "images");
        }
      }
      coutEur += usd * USD_EN_EUR;
      const fiche = dec.index != null ? String(cands[dec.index].id) : null;
      if (!mesure) {
        await admin.from("rapprochement_ia_verdicts").upsert({
          user_id: userId, doublon_id: null, paire, motif: "annonce_partagee",
          verdict: fiche ? "meme" : "incertain", verdict_brut: JSON.stringify(rep.verdicts), raison: rep.raison, phase, modele: MODELE_IA_FUSION,
          jetons_entree: jetE, jetons_sortie: jetS, cout_usd: Number(usd.toFixed(6)), mode: "appliquer",
          applique: fiche ? `fiche:${fiche}:${dec.motif}` : `question:${dec.motif}`,
        }, { onConflict: "user_id,paire", ignoreDuplicates: true });
      }
      if (fiche) await attribuer(g, fiche, "ia", `${rep.raison ?? ""} (${dec.motif}, ${phase})`.trim());
      else await incertain(g, `ia_${dec.motif}`, { raison_ia: rep.raison, verdicts: rep.verdicts, phase });
    } catch (e) {
      resultats.push({ annonce: `${g.platform}:${g.L}`, erreur: String((e as Error)?.message ?? e).slice(0, 160) });
    }
  }
  if (cx.copies.length) await admin.storage.from(BUCKET).remove(cx.copies).catch(() => {});
  return { ok: true, mode: "annonces_partagees", user_id: userId, groupes: groupes.size, resultats, cout_eur: Number(coutEur.toFixed(4)), duree_ms: Date.now() - debut };
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
  // (15/10 soir, Louis) Une annonce portée par deux fiches : la cascade
  // identifiants → photos → IA, la question seulement si l'IA n'est pas sûre.
  if (body.mode === "annonces_partagees") {
    const supabaseUrlAp = Deno.env.get("SUPABASE_URL") ?? "";
    const adminAp = createClient(supabaseUrlAp, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const explicites = Array.isArray(body.annonces)
      ? (body.annonces as Array<Record<string, unknown>>).map((a) => ({ platform: String(a.platform ?? ""), L: String(a.listing_id ?? "").trim() }))
          .filter((a) => ["vinted", "leboncoin", "beebs", "ebay", "opla", "depop"].includes(a.platform) && /^[A-Za-z0-9_-]{4,80}$/.test(a.L)).slice(0, 20)
      : null;
    return json(await annoncesPartagees({ admin: adminAp, supabaseUrl: supabaseUrlAp, apiKey, userId, mesure: body.mesure === true, annoncesExplicites: explicites }));
  }
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
