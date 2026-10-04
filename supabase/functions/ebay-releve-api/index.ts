import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { hotes, lireEnvEbay, obtenirAccessToken, type EbayEnv } from "../_shared/ebay-oauth.ts";
import { lireArticleTrading, lireAnnoncesActives } from "../_shared/ebay-trading-releve.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ebay-releve-api — LE RELEVÉ eBAY D'UN COMPTE RELIÉ, PAR L'API (04/10, Louis)
// ═══════════════════════════════════════════════════════════════════════════
// Louis (Business) a relié son compte pro « lamiral » par la connexion
// officielle eBay ; son Chrome est connecté à son compte perso. Le relevé eBay
// lisait le Hub vendeur DANS CHROME, la garde du 26/09 bloquait tout : 0
// annonce, bandeau « on n'a pas encore pu vérifier… ». Règle de Nico : pour un
// compte relié officiellement, le relevé passe par l'API, sur le compte relié,
// sans dépendre de Chrome.
//
// CE QUE FAIT UN PASSAGE (cron */5, garde x-cron-secret, verify_jwt = false) :
//   1. pose le relevé QUOTIDIEN des comptes reliés (aucun relevé fini depuis
//      20 h, aucun en file) — l'extension ne les fait plus ;
//   2. prend jusqu'à 3 demandes en file (app, serveur, quotidien) ;
//   3. lit les annonces EN LIGNE du compte relié (Trading GetMyeBaySelling,
//      liste active, 200 par page) et les écrit comme le ferait un relevé ;
//   4. lit le détail de celles qui ne l'ont jamais été (Trading GetItem :
//      description, marque, caractéristiques, catégorie, état, photos, poids)
//      → annonces_plateforme.donnees_index, que la base reporte sur les seuls
//      champs vides des fiches (fiche_completer_depuis_annonce) ;
//   5. laisse le moteur rattacher et importer (rapprocher_releve, le même que
//      pour l'extension) — un relevé COMPLET constate aussi les retraits ;
//   6. relève les ventes du compte (ebay-ventes-sync, même porte d'écriture) ;
//   7. clôt le relevé avec son bilan, dans le format que lit l'app.
// ⛔ Lecture seule chez eBay : aucun appel n'écrit quoi que ce soit.
// ⛔ Aucune donnée d'acheteur n'est lue.
// ⛔ Un relevé incomplet (page refusée, budget épuisé) ne conclut rien :
//    « [incomplet] », aucune disparition.

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

// ── BORNÉ (04/10, incident CPU 99 % — cron 27 mis en pause) ───────────────
// Le relevé QUOTIDIEN ne se pose plus que pour les comptes ACTIFS
// (comptes_actifs(7) : extension ou app vues dans les 7 jours — 41 comptes
// reliés sur 66 au 04/10) : un compte que personne n'ouvre n'a pas besoin
// d'un relevé complet chaque jour. Un relevé DEMANDÉ (app) passe toujours.
// 3 quotidiens posés et 2 relevés traités par passage (10 et 3 avant).
const RUNS_PAR_PASSAGE = 2;
const QUOTIDIENS_PAR_PASSAGE = 3;
const QUOTIDIEN_H = 20;
const DETAILS_PAR_RUN = 60;
const DETAIL_FRAICHEUR_J = 7;
const BUDGET_MS = 95_000;
const BUILD = "serveur:ebay-api · ebay-releve-api";

type Run = { id: string; user_id: string; declencheur: string | null; erreur: string | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  const attendu = Deno.env.get("CRON_SECRET");
  if (!attendu || req.headers.get("x-cron-secret") !== attendu) return json({ error: "Non autorisé" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const env = lireEnvEbay();
  const debut = Date.now();
  const corps = await req.json().catch(() => ({})) as Record<string, unknown>;
  const bilan: Record<string, unknown> = { quotidiens: 0, runs: [] as unknown[] };

  try {
    const { data: comptes, error: errComptes } = await admin
      .from("ebay_accounts").select("user_id, ebay_user_id").is("revoked_at", null).limit(500);
    if (errComptes) throw new Error(`comptes reliés : ${errComptes.message}`);
    const relies = new Map<string, string>();
    for (const c of (comptes ?? []) as Array<{ user_id: string; ebay_user_id: string | null }>) {
      if (c.user_id) relies.set(c.user_id, String(c.ebay_user_id ?? "").trim());
    }

    // ── 1. Le relevé quotidien des comptes reliés ────────────────────────
    if (corps?.quotidien !== false) {
      const { data: actifs, error: errActifs } = await admin.rpc("comptes_actifs", { p_jours: 7 });
      // Illisible : on ne pose AUCUN quotidien (jamais « tout le monde » par défaut).
      const actifsSet = new Set(errActifs ? [] : ((actifs ?? []) as Array<{ user_id: string }>).map((a) => a.user_id));
      bilan.quotidiens = await poserQuotidiens(admin, [...relies.keys()].filter((u) => actifsSet.has(u)));
      bilan.comptes_actifs = actifsSet.size;
    }

    // ── 2. Les demandes en file ──────────────────────────────────────────
    const ttl = new Date(Date.now() - 6 * 3600_000).toISOString();
    const { data: file, error: errFile } = await admin.from("vinted_sync_runs")
      .select("id, user_id, declencheur, erreur")
      .eq("kind", "annonces").eq("platform", "ebay").eq("status", "queued")
      .gte("queued_at", ttl)
      .order("queued_at", { ascending: true })
      .limit(50);
    if (errFile) throw new Error(`file des relevés : ${errFile.message}`);
    // Une DEMANDE (bouton de l'app, geste de Nico) passe avant les relevés
    // quotidiens : au premier passage, 40 comptes reliés reçoivent leur
    // quotidien d'un coup, et une demande attendait derrière eux (04/10, Louis).
    const quotidien = (r: Run) => String(r.declencheur ?? "").startsWith("serveur:quotidien");
    const aTraiter = ((file ?? []) as Run[]).filter((r) => relies.has(r.user_id))
      .sort((a, b) => Number(quotidien(a)) - Number(quotidien(b)))
      .slice(0, RUNS_PAR_PASSAGE);

    for (const r of aTraiter) {
      if (Date.now() - debut > BUDGET_MS - 20_000) break;
      const res = await releverUnCompte(admin, env, r, relies.get(r.user_id) ?? "", debut);
      (bilan.runs as unknown[]).push(res);
    }
    return json({ ok: true, ...bilan, ms: Date.now() - debut });
  } catch (e) {
    console.error("[ebay-releve-api]", String((e as Error)?.message ?? e));
    return json({ ok: false, erreur: String((e as Error)?.message ?? e).slice(0, 300), ...bilan }, 500);
  }
});

// Un relevé par jour et par compte relié, comme l'alarme quotidienne de
// l'extension le faisait. Les gardes d'insertion de la base restent juges
// (plateforme écartée…) : un refus = rien de posé.
async function poserQuotidiens(admin: SupabaseClient, users: string[]): Promise<number> {
  if (!users.length) return 0;
  const depuis = new Date(Date.now() - QUOTIDIEN_H * 3600_000).toISOString();
  const { data: recents } = await admin.from("vinted_sync_runs")
    .select("user_id, status, finished_at, queued_at")
    .eq("kind", "annonces").eq("platform", "ebay")
    .in("user_id", users)
    .or(`status.in.(queued,running),finished_at.gte.${depuis}`)
    .limit(2000);
  const occupes = new Set(((recents ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
  let poses = 0;
  for (const u of users) {
    if (poses >= QUOTIDIENS_PAR_PASSAGE) break;
    if (occupes.has(u)) continue;
    const { error } = await admin.from("vinted_sync_runs").insert({
      user_id: u, kind: "annonces", platform: "ebay", status: "queued",
      declencheur: "serveur:quotidien_api", queued_at: new Date().toISOString(),
    });
    if (error) {
      console.log(`[ebay-releve-api] relevé quotidien ${u.slice(0, 8)} non posé : ${error.message}`);
      continue;
    }
    poses++;
  }
  return poses;
}

async function majRun(admin: SupabaseClient, id: string, champs: Record<string, unknown>) {
  const { error } = await admin.from("vinted_sync_runs").update({ ...champs, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) console.warn(`[ebay-releve-api] run ${id.slice(0, 8)} : ${error.message}`);
}

async function releverUnCompte(admin: SupabaseClient, env: EbayEnv, r: Run, compte: string, debut: number): Promise<Record<string, unknown>> {
  const maintenant = () => new Date().toISOString();
  // Prise de la demande : seulement si elle est TOUJOURS en file.
  const { data: pris } = await admin.from("vinted_sync_runs")
    .update({ status: "running", claimed_at: maintenant(), started_at: maintenant(), updated_at: maintenant(), extension_build: BUILD })
    .eq("id", r.id).eq("status", "queued").select("id");
  if (!(pris ?? []).length) return { run: r.id, pris: false };

  const jeton = await obtenirAccessToken(admin, r.user_id);
  if (!jeton.ok) {
    const msg = jeton.motif === "revoque"
      ? `[incomplet] [api] la connexion officielle eBay du compte « ${compte} » est à refaire (Réglages → eBay → Relier) : rien n'est relevé, rien n'est conclu.`
      : `[incomplet] [api] eBay n'a pas rendu de jeton pour le compte « ${compte} » (${jeton.motif}) : rien n'est conclu, nouvel essai au prochain relevé.`;
    await majRun(admin, r.id, { status: "failed", finished_at: maintenant(), erreur: msg });
    return { run: r.id, jeton: jeton.motif };
  }
  const token = jeton.token;

  // ── 3. Les annonces en ligne ────────────────────────────────────────────
  const lecture = await lireAnnoncesActives(env, token, async (lues, total, page) => {
    await majRun(admin, r.id, { items_vus: lues, total_entries: total, page_suivante: page + 1 });
  });
  const lignes = lecture.annonces.map((a) => ({
    user_id: r.user_id, platform: "ebay", listing_id: a.listing_id, url: a.url, titre: a.titre,
    prix: a.prix, photo_url: a.photo_url, favoris: a.favoris, statut_plateforme: "en_ligne",
    run_id: r.id, vu_le: maintenant(), disparu_le: null, updated_at: maintenant(),
  }));
  for (let i = 0; i < lignes.length; i += 100) {
    const { error } = await admin.from("annonces_plateforme")
      .upsert(lignes.slice(i, i + 100), { onConflict: "user_id,platform,listing_id" });
    if (error) {
      await majRun(admin, r.id, { status: "failed", finished_at: maintenant(),
        erreur: `[incomplet] [api] écriture des annonces lues refusée (${error.message.slice(0, 160)}) : rien n'est conclu.` });
      return { run: r.id, ecriture: error.message };
    }
  }
  // Le vendeur de ces annonces EST le compte relié (lu par son propre jeton).
  if (compte && lignes.length) {
    const vendeurs = lecture.annonces.map((a) => ({ listing_id: a.listing_id, vendeur: compte, source: "api_releve", vu_le: maintenant() }));
    for (let i = 0; i < vendeurs.length; i += 200) {
      await admin.from("ebay_vendeurs_annonces").upsert(vendeurs.slice(i, i + 200), { onConflict: "listing_id", ignoreDuplicates: true });
    }
  }

  // ── 4. Le détail de ce qui n'a jamais été lu (ou il y a plus de 7 jours) ─
  let details = 0, detailsEchecs = 0;
  let premierEchec: string | null = null;
  if (lignes.length) {
    const { data: connues } = await admin.from("annonces_plateforme")
      .select("listing_id, donnees_index_le")
      .eq("user_id", r.user_id).eq("platform", "ebay")
      .in("listing_id", lignes.map((l) => l.listing_id).slice(0, 1000));
    const vieux = Date.now() - DETAIL_FRAICHEUR_J * 86400_000;
    const aLire = ((connues ?? []) as Array<{ listing_id: string; donnees_index_le: string | null }>)
      .filter((c) => !c.donnees_index_le || Date.parse(c.donnees_index_le) < vieux)
      .sort((a, b) => (a.donnees_index_le ? 1 : 0) - (b.donnees_index_le ? 1 : 0) || Number(b.listing_id) - Number(a.listing_id))
      .slice(0, DETAILS_PAR_RUN);
    for (const c of aLire) {
      if (Date.now() - debut > BUDGET_MS - 25_000) break;
      const d = await lireArticleTrading(env, token, c.listing_id);
      if (!d.ok) { detailsEchecs++; premierEchec ??= `${c.listing_id} : ${d.motif}`; continue; }
      if (compte && d.vendeur && d.vendeur.toLowerCase() !== compte.toLowerCase()) { detailsEchecs++; premierEchec ??= `${c.listing_id} : vendeur « ${d.vendeur} », pas « ${compte} »`; continue; }
      const { error } = await admin.from("annonces_plateforme")
        .update({ donnees_index: d.donnees, donnees_index_le: maintenant() })
        .eq("user_id", r.user_id).eq("platform", "ebay").eq("listing_id", c.listing_id);
      if (error) detailsEchecs++; else details++;
    }
  }

  // ── 5. Le moteur rattache et importe (le même que pour l'extension) ─────
  const totaux = { par_job: 0, auto: 0, proposees: 0, sans_candidat: 0, importees: 0, disparues: 0 };
  let complet = false;
  if (lecture.complet) {
    // Le relevé est d'abord CLOS (status done, items_vus = total) : c'est ce
    // qui fait de lui une preuve d'absence pour constater les retraits.
    await majRun(admin, r.id, { items_vus: lignes.length, total_entries: lecture.total ?? lignes.length });
  }
  for (let tour = 0; tour < 12; tour++) {
    if (Date.now() - debut > BUDGET_MS) break;
    const { data: rr, error } = await admin.rpc("rapprocher_releve", { p_run_id: r.id });
    if (error) { console.warn(`[ebay-releve-api] rapprocher_releve ${r.id.slice(0, 8)} : ${error.message}`); break; }
    const res = (rr ?? {}) as Record<string, unknown>;
    for (const k of Object.keys(totaux) as Array<keyof typeof totaux>) totaux[k] += Number(res[k] ?? 0);
    complet = Boolean(res.complet);
    if (!res.budget_epuise) break;
  }

  // ── 6. Les ventes du compte (même porte d'écriture que le cron du matin) ─
  let ventes: unknown = null;
  try {
    const rv = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ebay-ventes-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "" },
      body: JSON.stringify({ mode: "sync", user_id: r.user_id, trigger: "ebay_releve_api" }),
    });
    ventes = await rv.json().catch(() => ({ http: rv.status }));
  } catch (e) {
    ventes = { erreur: String((e as Error)?.message ?? e).slice(0, 120) };
  }

  // ── 7. Clôture, dans le format que lit l'app ───────────────────────────
  const tete = lecture.complet
    ? `[api] compte relié « ${compte} » : ${lignes.length} annonce(s) en ligne lues par l'API eBay sur ${lecture.total ?? lignes.length} annoncée(s)`
    : `[incomplet] [api] compte relié « ${compte} » : ${lignes.length} annonce(s) lue(s) sur ${lecture.total ?? "?"} — ${lecture.motif ?? "lecture interrompue"} ; rien n'est conclu sur les autres`;
  const texte = `${tete} · [détail] ${details} annonce(s) lue(s) en détail${detailsEchecs ? `, ${detailsEchecs} illisible(s)${premierEchec ? ` (${premierEchec.slice(0, 160)})` : ""}` : ""} · ` +
    `[rattachement] par identifiant ${totaux.par_job}, automatiques ${totaux.auto}, proposées ${totaux.proposees}, ` +
    `sans candidat ${totaux.sans_candidat}, importées ${totaux.importees}, disparues ${totaux.disparues}`;
  await majRun(admin, r.id, {
    status: "done", finished_at: maintenant(), items_vus: lignes.length,
    total_entries: lecture.total ?? lignes.length, items_crees: totaux.importees,
    items_maj: totaux.par_job + totaux.auto, erreur: texte.slice(0, 1900),
  });
  // Clos COMPLET : le moteur peut maintenant constater les retraits (une
  // annonce absente de deux relevés complets) — même appel que l'extension.
  if (lecture.complet) {
    const { data: rr2 } = await admin.rpc("rapprocher_releve", { p_run_id: r.id });
    totaux.disparues += Number((rr2 as Record<string, unknown> | null)?.disparues ?? 0);
    complet = Boolean((rr2 as Record<string, unknown> | null)?.complet ?? complet);
  }
  console.log(`[ebay-releve-api] ${r.user_id.slice(0, 8)} « ${compte} » : ${lignes.length} en ligne, ${details} détail(s), ${JSON.stringify(totaux)}`);
  return { run: r.id, compte, lues: lignes.length, total: lecture.total, complet, details, detailsEchecs, ...totaux, ventes };
}
