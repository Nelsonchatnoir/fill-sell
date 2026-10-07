// ═══════════════════════════════════════════════════════════════════════════
// rapprochement — LA PASSE QUI RANGE TOUT LE COMPTE (v3, 08/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// « Un article n'entre JAMAIS dans le stock tant qu'il n'a pas été rapproché
// de tout ce que l'utilisateur a déjà. » (Nico, 07/10). Un appui sur
// « Synchroniser » relève toutes les plateformes ; quand le dernier relevé
// finit, cette fonction lit TOUT le compte en un appel, fait calculer les
// empreintes manquantes en parallèle, tranche avec le moteur partagé
// (_shared/rapprochement : jamais la photo seule, jamais le titre seul, jamais
// deux annonces d'une même plateforme, décisions de la personne définitives)
// et écrit son plan en une fois (rapprochement_v3_appliquer : la base garde
// ses gardes). Relance idempotente : une annonce déjà décidée n'est jamais
// rejugée — sauf en mode réparation (décision de Nico), où les décisions
// AUTOMATIQUES d'avant le sont.
//
// APPELANTS (aucun n'a de session) → verify_jwt = FALSE (déployer avec
// --no-verify-jwt), garde maison sur `x-cron-secret` :
//   · la base : rapprocher_releve, trg_rapprochement_fin_run,
//     demander_sync_plateforme (« recent ») → rapprochement_relancer
//     (pg_net, { user_id }) ;
//   · le filet `rapprochement-1min` (pg_cron, {}) : les comptes en file ;
//   · la réparation du parc (scripts/reparations/20261008_reparation_v3.mjs) :
//     { user_id, reparer: true, simuler?: true }.
// Budget : 110 s ; au-delà, elle se relance elle-même (une fois).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { urlsDe, manquantesDe, passe } from "../_shared/rapprochement/passe.js";

const BUDGET_MS = 110_000;
const PHOTOS_PAR_APPEL = 6;         // empreintes-urls : 2 s de CPU par requête
const APPELS_EN_PARALLELE = 10;
const COMPTES_PAR_APPEL = 4;
const DECISIONS_PAR_LOT = 150;
const PASSAGES_PHOTOS_MAX = 6;      // au-delà sans progrès : on classe avec ce qu'on a

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { "Content-Type": "application/json" } });

type Donnees = { fiches: unknown[]; annonces: unknown[]; geste_recent?: boolean };
type Empreinte = { url: string; dhash: string; phash: string; variantes: unknown };

serve(async (req) => {
  const secret = req.headers.get("x-cron-secret");
  const attendu = Deno.env.get("CRON_SECRET");
  if (!secret || !attendu || secret !== attendu) return json({ error: "unauthorized" }, 401);

  let body: { user_id?: unknown; relance?: unknown; reparer?: unknown; simuler?: unknown } = {};
  try { body = await req.json(); } catch { /* corps vide : le filet */ }
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const debut = Date.now();
  const reste = () => BUDGET_MS - (Date.now() - debut);
  const reparer = body.reparer === true;
  const simuler = body.simuler === true;

  await admin.rpc("synchro_vitesses_relire").then(() => {}, () => {});

  let comptes: string[] = [];
  if (typeof body.user_id === "string" && body.user_id) {
    comptes = [body.user_id];
  } else {
    const { data } = await admin.from("rapprochement_comptes").select("user_id")
      .neq("etat", "termine").order("maj_le", { ascending: true }).limit(COMPTES_PAR_APPEL);
    comptes = ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
  }

  const etat = async (user: string, champs: Record<string, unknown>) => {
    if (simuler) return;
    await admin.from("rapprochement_comptes").update({ ...champs, maj_le: new Date().toISOString() }).eq("user_id", user).then(() => {}, () => {});
  };

  const empreinter = async (urls: string[]) => {
    const lots: string[][] = [];
    for (let i = 0; i < urls.length; i += PHOTOS_PAR_APPEL) lots.push(urls.slice(i, i + PHOTOS_PAR_APPEL));
    let calculees = 0;
    for (let i = 0; i < lots.length && reste() > 20_000; i += APPELS_EN_PARALLELE) {
      const vague = lots.slice(i, i + APPELS_EN_PARALLELE);
      const res = await Promise.all(vague.map((l) =>
        fetch(`${supabaseUrl}/functions/v1/empreintes-urls`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-cron-secret": attendu },
          body: JSON.stringify({ urls: l }),
        }).then((r) => r.json()).catch(() => null)));
      for (const r of res) calculees += Number(r?.calculees) || 0;
    }
    return calculees;
  };

  const lireEmpreintes = async (urls: string[]) => {
    const map = new Map<string, Empreinte>();
    const illisibles = new Set<string>();
    for (let i = 0; i < urls.length; i += 400) {
      const { data, error } = await admin.rpc("rapprochement_v3_empreintes", { p_urls: urls.slice(i, i + 400) });
      if (error) throw new Error(`empreintes : ${error.message}`);
      const d = (data ?? {}) as { empreintes?: Empreinte[]; illisibles?: string[] };
      for (const e of d.empreintes ?? []) map.set(e.url, e);
      for (const u of d.illisibles ?? []) illisibles.add(u);
    }
    return { map, illisibles };
  };

  const bilan: Record<string, unknown>[] = [];
  let inacheve = false;
  for (const user of comptes) {
    const parCompte: Record<string, unknown> = { user, photos: 0 };
    try {
      if (reste() < 15_000) { inacheve = true; break; }
      // La base qui peine passe avant tout (règle du 04/10).
      const { data: cpu } = await admin.from("veille_cpu").select("pct").not("pct", "is", null).order("le", { ascending: false }).limit(1).maybeSingle();
      if (Number((cpu as { pct?: number } | null)?.pct) > 70) { parCompte.etat = "cpu"; bilan.push(parCompte); continue; }
      // ── A. Les relevés d'abord : rien ne se tranche tant qu'un relevé tourne ──
      const { data: enCours } = await admin.rpc("rapprochement_v3_releves_en_cours", { p_user: user });
      if (enCours === true && !reparer) {
        await etat(user, { etat: "attente_releves", debut_le: new Date().toISOString() });
        parCompte.etat = "attente_releves"; bilan.push(parCompte); continue;
      }
      await etat(user, { etat: "decision", debut_le: new Date().toISOString() });
      // ── B. Tout le compte, en un appel ──
      const { data: lu, error: eLu } = await admin.rpc("rapprochement_v3_lire", { p_user: user });
      if (eLu) throw new Error(`lecture : ${eLu.message}`);
      const donnees = lu as Donnees;
      // ── C. Les empreintes manquantes, en parallèle, jusqu'à PASSAGES_PHOTOS_MAX sans progrès ──
      const urls = urlsDe(donnees);
      let { map, illisibles } = await lireEmpreintes(urls);
      let manquantes = manquantesDe(urls, map, illisibles);
      let passages = 0; let precedent = Infinity;
      while (manquantes.length && passages < PASSAGES_PHOTOS_MAX && reste() > 25_000) {
        await etat(user, { etat: "empreintes", photos_manquantes: manquantes.length, passages_photos: passages });
        parCompte.photos = Number(parCompte.photos) + await empreinter(manquantes.slice(0, 240));
        ({ map, illisibles } = await lireEmpreintes(urls));
        manquantes = manquantesDe(urls, map, illisibles);
        if (manquantes.length >= precedent) passages++; else passages = 0;
        precedent = manquantes.length;
      }
      if (manquantes.length && reste() <= 25_000) {
        // Plus le temps : on rend la main, la relance (ou le filet) reprendra
        // avec les photos déjà calculées — jamais un classement sans elles.
        await etat(user, { etat: "empreintes", photos_manquantes: manquantes.length });
        parCompte.etat = "empreintes"; parCompte.manquantes = manquantes.length; inacheve = true; bilan.push(parCompte); continue;
      }
      // ── D. La passe ──
      await etat(user, { etat: "decision", photos_manquantes: 0 });
      const mode = reparer ? "reparation" : "normal";
      const t0 = Date.now();
      const { decisions, bilan: b } = passe(donnees, map, { mode });
      parCompte.passe = b; parCompte.decisions = decisions.length; parCompte.photos_sans_empreinte = manquantes.length;
      if (simuler) { parCompte.etat = "simule"; parCompte.plan = decisions.slice(0, 2000); bilan.push(parCompte); continue; }
      // ── E. L'écriture, par lots ──
      const geste = donnees.geste_recent === true || reparer
        || String(((await admin.from("rapprochement_comptes").select("bilan").eq("user_id", user).maybeSingle()).data as { bilan?: { motif?: string } } | null)?.bilan?.motif ?? "").startsWith("recent:");
      await etat(user, { etat: "creation", creation_le: new Date().toISOString(), a_traiter: decisions.length, traitees: 0 });
      const faits: Record<string, number> = {}; const sautes: Record<string, number> = {}; let erreurs: unknown[] = [];
      for (let i = 0; i < decisions.length; i += DECISIONS_PAR_LOT) {
        if (reste() < 12_000) { inacheve = true; parCompte.ecriture_interrompue = i; break; }
        const { data: r, error: eA } = await admin.rpc("rapprochement_v3_appliquer", {
          p_user: user, p_decisions: decisions.slice(i, i + DECISIONS_PAR_LOT), p_mode: mode, p_geste: geste,
        });
        if (eA) { erreurs.push({ lot: i, erreur: eA.message }); continue; }
        const x = (r ?? {}) as { faits?: Record<string, number>; sautes?: Record<string, number>; erreurs?: unknown[]; reason?: string };
        if (x.reason === "occupe") { erreurs.push({ lot: i, erreur: "occupe" }); break; }
        for (const [k, v] of Object.entries(x.faits ?? {})) faits[k] = (faits[k] ?? 0) + v;
        for (const [k, v] of Object.entries(x.sautes ?? {})) sautes[k] = (sautes[k] ?? 0) + v;
        erreurs = erreurs.concat(x.erreurs ?? []);
        await etat(user, { traitees: Math.min(decisions.length, i + DECISIONS_PAR_LOT), ms_decision: Date.now() - t0 });
      }
      const fini = !parCompte.ecriture_interrompue && !erreurs.some((e) => (e as { erreur?: string }).erreur === "occupe");
      await etat(user, {
        etat: fini ? "termine" : "creation", fin_le: fini ? new Date().toISOString() : null, a_traiter: 0, photos_manquantes: 0,
        ms_decision: Date.now() - t0,
        bilan: { version: 3, mode, geste, faits, sautes, erreurs: erreurs.slice(0, 20), passe: b, photos: parCompte.photos, le: new Date().toISOString() },
      });
      parCompte.etat = fini ? "termine" : "creation"; parCompte.faits = faits; parCompte.sautes = sautes; parCompte.erreurs = erreurs.length;
    } catch (e) {
      parCompte.erreur = String((e as Error)?.message ?? e).slice(0, 300);
      await etat(user, { bilan: { version: 3, erreur: parCompte.erreur, le: new Date().toISOString() } });
    }
    bilan.push(parCompte);
  }

  if (inacheve && body.relance !== true && !simuler) {
    const suite = fetch(`${supabaseUrl}/functions/v1/rapprochement`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": attendu },
      body: JSON.stringify({ ...(typeof body.user_id === "string" ? { user_id: body.user_id } : {}), ...(reparer ? { reparer: true } : {}), relance: true }),
    }).catch(() => {});
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(suite);
  }

  const sortie = { comptes: bilan.map((b) => ({ ...b, plan: undefined })), duree_ms: Date.now() - debut, inacheve };
  console.log("[rapprochement]", JSON.stringify(sortie).slice(0, 4000));
  return json({ comptes: bilan, duree_ms: Date.now() - debut, inacheve });
});
