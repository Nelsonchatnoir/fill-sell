// ═══════════════════════════════════════════════════════════════════════════
// rapprochement — LA PASSE QUI RANGE TOUT LE COMPTE (v3, 08/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// « Un article n'entre JAMAIS dans le stock tant qu'il n'a pas été rapproché
// de tout ce que l'utilisateur a déjà. » (Nico, 07/10). Un appui sur
// « Synchroniser » relève toutes les plateformes ; quand le dernier relevé
// finit, cette fonction lit TOUT le compte en un appel, fait calculer les
// empreintes manquantes PAR LA BASE (rapprochement_v3_empreinter : pg_net,
// 100 appels d'empreintes-urls d'un coup — un fetch edge → edge est limité à
// 60 par minute), tranche avec le moteur partagé
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
const PHOTOS_PAR_PASSE = 600;       // 100 appels pg_net de 6 photos (empreintes-urls : 2 s de CPU par requête)
const RELANCE_PHOTOS_MS = 12_000;   // le temps que les 100 appels aboutissent avant de relire
const RELANCES_MAX = 12;            // 12 × 600 photos par chaîne ; au-delà, le filet rapprochement-1min reprend
const COMPTES_PAR_APPEL = 4;
const DECISIONS_PAR_LOT = 150;
const PASSAGES_PHOTOS_MAX = 6;      // six relectures sans progrès (546, image morte) : on classe avec ce qu'on a

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { "Content-Type": "application/json" } });

type Donnees = { fiches: unknown[]; annonces: unknown[]; geste_recent?: boolean };
type Empreinte = { url: string; dhash: string; phash: string; variantes: unknown };

serve(async (req) => {
  const secret = req.headers.get("x-cron-secret");
  const attendu = Deno.env.get("CRON_SECRET");
  if (!secret || !attendu || secret !== attendu) return json({ error: "unauthorized" }, 401);

  let body: { user_id?: unknown; relance?: unknown; reparer?: unknown; simuler?: unknown; precedent?: unknown; passages?: unknown } = {};
  try { body = await req.json(); } catch { /* corps vide : le filet */ }
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const debut = Date.now();
  const reste = () => BUDGET_MS - (Date.now() - debut);
  const reparer = body.reparer === true;
  const simuler = body.simuler === true;
  // Le rang de cette invocation dans sa chaîne de relances (true = 1, compat).
  const rang = body.relance === true ? 1 : Math.max(0, Number(body.relance) || 0);

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
    // (08/10 nuit) Un compte jamais demandé (réparation, premier relevé) n'a pas
    // de ligne : l'UPDATE ne touchait rien et l'état (progrès des photos,
    // « déjà réparé », barre de l'app) n'était jamais écrit. On crée la ligne.
    const maj = { ...champs, maj_le: new Date().toISOString() };
    const { data } = await admin.from("rapprochement_comptes").update(maj).eq("user_id", user).select("user_id")
      .then((r) => r, () => ({ data: null }));
    if (!data || (data as unknown[]).length === 0) {
      await admin.from("rapprochement_comptes").insert({ user_id: user, etat: "decision", demande_le: new Date().toISOString(), ...maj })
        .then(() => {}, () => {});
    }
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

  // (08/10) PAR LA BASE, jamais par un fetch d'ici, et JAMAIS ATTENDUES ICI.
  // · Un fetch edge → edge est limité par le runtime : « Rate limit exceeded
  //   for function. Retry after 17873ms » après 60 appels (360 photos) par
  //   minute — Corinne restait à 1 191 photos sans empreinte (01:02).
  // · pg_net n'est pas limité (100 appels d'un coup : 100 × 200, 01:04) — mais
  //   son worker traite ses requêtes par itération complète : tant que la
  //   requête qui a appelé CETTE fonction (cron, trigger, script) n'a pas
  //   reçu sa réponse, rien de ce qu'on met en file ne part (prouvé 01:09 :
  //   39 appels mis en file à 23:07:41 UTC, exécutés à 23:09:12, à la seconde
  //   où la réponse est partie). Donc : on met en file, on répond, et on se
  //   relance RELANCE_PHOTOS_MS plus tard pour relire (le filet d'une minute
  //   reprend si la chaîne casse). Une invocation reste courte : elle ne
  //   bloque jamais le worker pour les autres (mails, relevés, crons).
  const echecsEmpreintes: string[] = []; // les premiers refus, lisibles dans la réponse
  const empreinter = async (urls: string[]) => {
    const { data, error } = await admin.rpc("rapprochement_v3_empreinter", { p_urls: urls });
    if (error) { if (echecsEmpreintes.length < 5) echecsEmpreintes.push(error.message.slice(0, 200)); return 0; }
    return Number((data as { photos?: number } | null)?.photos) || 0;
  };

  const bilan: Record<string, unknown>[] = [];
  let inacheve = false;
  let relanceApres = 0; // ms avant la relance (le temps que les photos demandées arrivent)
  for (const user of comptes) {
    const parCompte: Record<string, unknown> = { user, photos: 0 };
    try {
      if (reste() < 15_000) { inacheve = true; break; }
      // La base qui peine passe avant tout (règle du 04/10).
      const { data: cpu } = await admin.from("veille_cpu").select("pct").not("pct", "is", null).order("le", { ascending: false }).limit(1).maybeSingle();
      if (Number((cpu as { pct?: number } | null)?.pct) > 70) { parCompte.etat = "cpu"; bilan.push(parCompte); continue; }
      const compte = (await admin.from("rapprochement_comptes")
        .select("photos_manquantes, passages_photos, bilan").eq("user_id", user).maybeSingle()
        .then((r) => r.data, () => null)) as { photos_manquantes?: number; passages_photos?: number; bilan?: { motif?: string } } | null;
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
      // ── C. Les empreintes manquantes : demandées par la base, relues à la relance ──
      const urls = urlsDe(donnees);
      const { map, illisibles } = await lireEmpreintes(urls);
      const manquantes = manquantesDe(urls, map, illisibles);
      parCompte.photos_manquantes = manquantes.length;
      if (manquantes.length) {
        // Progrès depuis l'invocation d'avant (état du compte ; en simulation, le script le passe).
        const precedent = simuler ? Number(body.precedent) : Number(compte?.photos_manquantes);
        const passagesAvant = simuler ? (Number(body.passages) || 0) : (Number(compte?.passages_photos) || 0);
        const passages = Number.isFinite(precedent) && precedent > 0 && manquantes.length >= precedent ? passagesAvant + 1 : 0;
        if (passages < PASSAGES_PHOTOS_MAX) {
          const envoyees = await empreinter(manquantes.slice(0, PHOTOS_PAR_PASSE));
          parCompte.photos = envoyees; parCompte.passages_photos = passages; parCompte.echecs_empreintes = echecsEmpreintes.slice();
          await etat(user, { etat: "empreintes", photos_manquantes: manquantes.length, passages_photos: passages });
          parCompte.etat = "empreintes"; parCompte.manquantes = manquantes.length;
          if (envoyees > 0) { inacheve = true; relanceApres = Math.max(relanceApres, RELANCE_PHOTOS_MS); }
          bilan.push(parCompte); continue;
        }
        parCompte.classe_sans_photos = manquantes.length; // six relectures sans progrès : on classe avec ce qu'on a
      }
      // ── D. La passe ──
      await etat(user, { etat: "decision", photos_manquantes: manquantes.length });
      const mode = reparer ? "reparation" : "normal";
      const t0 = Date.now();
      const { decisions, bilan: b } = passe(donnees, map, { mode });
      parCompte.passe = b; parCompte.decisions = decisions.length; parCompte.photos_sans_empreinte = manquantes.length;
      if (simuler) { parCompte.etat = "simule"; parCompte.plan = decisions.slice(0, 2000); bilan.push(parCompte); continue; }
      // ── E. L'écriture, par lots ──
      const geste = donnees.geste_recent === true || reparer || String(compte?.bilan?.motif ?? "").startsWith("recent:");
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

  if (inacheve && rang < RELANCES_MAX && !simuler) {
    // Un seul appel edge → edge par invocation (la limite du runtime est à 60
    // par minute) ; après RELANCE_PHOTOS_MS quand des photos sont en route.
    const suite = new Promise((r) => setTimeout(r, relanceApres)).then(() => fetch(`${supabaseUrl}/functions/v1/rapprochement`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": attendu },
      body: JSON.stringify({ ...(typeof body.user_id === "string" ? { user_id: body.user_id } : {}), ...(reparer ? { reparer: true } : {}), relance: rang + 1 }),
    })).catch(() => {});
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(suite);
  }

  const sortie = { comptes: bilan.map((b) => ({ ...b, plan: undefined })), duree_ms: Date.now() - debut, inacheve };
  console.log("[rapprochement]", JSON.stringify(sortie).slice(0, 4000));
  return json({ comptes: bilan, duree_ms: Date.now() - debut, inacheve });
});
