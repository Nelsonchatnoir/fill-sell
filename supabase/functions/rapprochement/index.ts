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
//
// ⛔ UNE PASSE QUI N'ABOUTIT PAS NE REPART PAS SANS FIN (v12, 08/10 matin).
// Le 07/10, le moteur d'avant (v2 → rapprochement_avancer) a écrit 8 954 fois
// la même décision pour UNE annonce de Nadège (21:26 → 22:32 UTC) : il
// rebouclait tant qu'il « restait » une annonce, sans contrôle de progrès, et
// le filet rapprochement-1min le relançait chaque minute. La v3 ne reboucle
// plus dans une invocation, mais une passe qui meurt toujours au même endroit
// (2 s de CPU dépassées, erreur de lecture) laissait le compte hors de
// « termine » : le filet l'aurait repris chaque minute, sans fin. Désormais
// `rapprochement_comptes.passages` compte, EN NÉGATIF (-n), les passes
// consécutives entrées dans la décision sans rien écrire (les valeurs ≥ 0
// sont celles du moteur v2, mort : elles valent 0). Au bout de
// PASSES_INACHEVEES_MAX, le compte est arrêté (« termine », bilan.arret) et
// l'ops-digest le montre en rouge ; un geste de la personne (« Synchroniser »,
// < 30 min) rouvre jusqu'à PASSES_INACHEVEES_MAX_GESTE essais, puis plus rien
// avant notre correctif (remettre passages à 0).
//
// ⛔ AUCUNE FICHE NE NAÎT D'UN RELEVÉ SANS DÉCISION v3 (v13, 08/10 après-midi).
// Leboncoin, Beebs, eBay, Opla : la base refuse toute fiche « releve_* » qui ne
// sort pas de rapprocher_importer (déclencheur inventaire_releve_par_decision),
// appelé par cette passe ou par la personne. Vinted : le dressing écrit ses
// fiches lui-même (extension) ; celles nées depuis la dernière passe
// (rapprochement_v3_lire.vinted_a_juger) sont jugées ici contre les imports
// déjà au stock, puis datées (rapprochement_comptes.vinted_juge_le).
//
// ⛔ FICHE CRÉÉE À LA MAIN FACE À UNE FICHE VINTED (v14, 08/10 soir, Nico).
// Même règle que les imports (_shared/rapprochement/fiches-main.js, sous-graphe
// des seules fiches : les décisions des annonces ne bougent pas) : photo ET
// titre sans concurrent → la fiche Vinted se fond dans celle de la personne ;
// un doute → la question, la fiche Vinted hors du stock. Les fiches à la main
// nées depuis la dernière passe (fiches_main_a_juger) sont datées
// (fiches_main_juge_le) comme les fiches Vinted. Inerte tant que la lecture ne
// rend pas `fiches_main_actif` (migration 20261008150000).
//
// ⛔ LA REMISE EN LIGNE VINTED (v15, 08/10 soir, cas Bebertdeals).
// Une annonce Vinted SUPPRIMÉE puis republiée par la personne sous un nouvel
// identifiant faisait une fiche neuve ; la fiche d'origine (copies, prix
// d'achat) restait en stock sur une annonce morte (1 025 fiches pour 403
// articles chez Bebertdeals ; des copies Leboncoin d'articles déjà vendus).
// _shared/rapprochement/remises-en-ligne.js : deux fiches Vinted de la même
// boutique jamais en ligne ensemble, mêmes photos (≥ 2 à ≤ 4) et titre en
// accord fort, aucun rival → la nouvelle se fond dans la plus ancienne
// (l'identité Vinted vivante la suit) ; un doute → la question. Inerte tant
// que la lecture ne rend pas `remise_en_ligne_actif` (migration 20261008160000
// + coin_config rapprochement_remise_en_ligne = 1). { remises: "toutes" } :
// le rattrapage du stock existant (décision de Nico).
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
const PASSES_INACHEVEES_MAX = 3;    // passes de suite sans rien écrire : le compte s'arrête (ops-digest en rouge)
const PASSES_INACHEVEES_MAX_GESTE = 6; // … un geste de la personne en rouvre trois de plus, pas davantage
const GESTE_RECENT_MS = 30 * 60_000;
const DECLENCHEURS_GESTE = ["bouton", "bouton_distant", "app", "bouton:redemande", "bouton_distant:redemande", "app:redemande"];

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { "Content-Type": "application/json" } });

type Donnees = { fiches: unknown[]; annonces: unknown[]; geste_recent?: boolean; vinted_a_juger?: unknown[]; vinted_juge_jusqu_a?: string | null; vinted_reste?: boolean;
  fiches_main_a_juger?: unknown[]; fiches_main_juge_jusqu_a?: string | null; fiches_main_reste?: boolean };
type Empreinte = { url: string; dhash: string; phash: string; variantes: unknown };

serve(async (req) => {
  const secret = req.headers.get("x-cron-secret");
  const attendu = Deno.env.get("CRON_SECRET");
  if (!secret || !attendu || secret !== attendu) return json({ error: "unauthorized" }, 401);

  let body: { user_id?: unknown; relance?: unknown; reparer?: unknown; simuler?: unknown; precedent?: unknown; passages?: unknown; fiches_main?: unknown; remises?: unknown } = {};
  try { body = await req.json(); } catch { /* corps vide : le filet */ }
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const debut = Date.now();
  const reste = () => BUDGET_MS - (Date.now() - debut);
  const reparer = body.reparer === true;
  const simuler = body.simuler === true;
  // (08/10 soir) « fiche à la main face à une fiche Vinted » : la passe normale
  // juge les nouvelles ; { fiches_main: "toutes" } (rattrapage, Nico) tout le stock.
  const porteeMain = body.fiches_main === "toutes" ? "toutes" : "nouvelles";
  // (08/10 soir) la remise en ligne Vinted : la passe normale juge les nouvelles
  // fiches du dressing ; { remises: "toutes" } (rattrapage, Nico) tout le stock.
  const porteeRemises = body.remises === "toutes" ? "toutes" : "nouvelles";
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
        .select("photos_manquantes, passages_photos, passages, bilan").eq("user_id", user).maybeSingle()
        .then((r) => r.data, () => null)) as { photos_manquantes?: number; passages_photos?: number; passages?: number; bilan?: { motif?: string } } | null;
      // ── A. Les relevés d'abord : rien ne se tranche tant qu'un relevé tourne ──
      const { data: enCours } = await admin.rpc("rapprochement_v3_releves_en_cours", { p_user: user });
      if (enCours === true && !reparer) {
        await etat(user, { etat: "attente_releves", debut_le: new Date().toISOString() });
        parCompte.etat = "attente_releves"; bilan.push(parCompte); continue;
      }
      // ── A bis. Une passe qui n'aboutit jamais ne repart pas sans fin (v12) ──
      const inachevees = Number(compte?.passages) < 0 ? -Number(compte?.passages) : 0;
      parCompte.passes_inachevees = inachevees;
      if (!reparer && !simuler && inachevees >= PASSES_INACHEVEES_MAX) {
        const depuis = new Date(Date.now() - GESTE_RECENT_MS).toISOString();
        const { data: gestes } = await admin.from("vinted_sync_runs").select("id").eq("user_id", user)
          .in("declencheur", DECLENCHEURS_GESTE).or(`started_at.gte.${depuis},queued_at.gte.${depuis}`).limit(1)
          .then((r) => r, () => ({ data: null }));
        const geste = Array.isArray(gestes) && gestes.length > 0;
        if (!geste || inachevees >= PASSES_INACHEVEES_MAX_GESTE) {
          const le = new Date().toISOString();
          await etat(user, { etat: "termine", fin_le: le, a_traiter: 0,
            bilan: { ...((compte?.bilan ?? {}) as Record<string, unknown>), version: 3, arret: { motif: "passes_inachevees", passes: inachevees, geste, le } } });
          parCompte.etat = "arret_passes_inachevees"; bilan.push(parCompte); continue;
        }
      }
      // Compté AVANT la lecture et la passe : une invocation tuée en route
      // (2 s de CPU, WORKER_RESOURCE_LIMIT) reste comptée.
      await etat(user, { etat: "decision", debut_le: new Date().toISOString(), passages: -(inachevees + 1) });
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
          // Les photos partent : ce n'est pas une passe (le compteur reprend sa valeur).
          await etat(user, { etat: "empreintes", photos_manquantes: manquantes.length, passages_photos: passages, passages: -inachevees });
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
      const { decisions, bilan: b } = passe(donnees, map, { mode, fichesMain: porteeMain, remises: porteeRemises });
      parCompte.passe = b; parCompte.decisions = decisions.length; parCompte.photos_sans_empreinte = manquantes.length;
      if (simuler) { parCompte.etat = "simule"; parCompte.plan = decisions.slice(0, 2000); bilan.push(parCompte); continue; }
      // ── E. L'écriture, par lots ──
      const geste = donnees.geste_recent === true || reparer || String(compte?.bilan?.motif ?? "").startsWith("recent:");
      await etat(user, { etat: "creation", creation_le: new Date().toISOString(), a_traiter: decisions.length, traitees: 0 });
      const faits: Record<string, number> = {}; const sautes: Record<string, number> = {}; let erreurs: unknown[] = [];
      let lotsEcrits = 0;
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
        lotsEcrits += 1;
        await etat(user, { traitees: Math.min(decisions.length, i + DECISIONS_PAR_LOT), ms_decision: Date.now() - t0 });
      }
      const fini = !parCompte.ecriture_interrompue && !erreurs.some((e) => (e as { erreur?: string }).erreur === "occupe");
      // (v12) Une passe qui a écrit (ou n'avait rien à écrire) remet le compteur à zéro.
      const progres = decisions.length === 0 || lotsEcrits > 0;
      parCompte.passes_inachevees = progres ? 0 : inachevees + 1;
      // (08/10, complément) Les fiches du dressing Vinted lues par cette passe
      // sont jugées : seulement une passe allée au bout, sans aucune erreur
      // (sinon elles restent à juger et la passe suivante les reprend).
      const vintedJuge = fini && erreurs.length === 0 && donnees.vinted_juge_jusqu_a ? { vinted_juge_le: donnees.vinted_juge_jusqu_a } : {};
      parCompte.vinted_a_juger = (donnees.vinted_a_juger ?? []).length;
      // 200 fiches Vinted par passe : s'il en reste, le compte reste « à faire »
      // et le filet (rapprochement-1min) reprend la suite dans la minute.
      // (08/10 soir) Les fiches à la main lues par cette passe : même règle.
      const mainJuge = fini && erreurs.length === 0 && donnees.fiches_main_juge_jusqu_a ? { fiches_main_juge_le: donnees.fiches_main_juge_jusqu_a } : {};
      parCompte.fiches_main_a_juger = (donnees.fiches_main_a_juger ?? []).length;
      const vintedReste = fini && erreurs.length === 0 && (donnees.vinted_reste === true || donnees.fiches_main_reste === true);
      if (vintedReste) { inacheve = true; parCompte.vinted_reste = true; }
      await etat(user, {
        ...vintedJuge,
        ...mainJuge,
        passages: progres ? 0 : -(inachevees + 1),
        etat: vintedReste ? "a_faire" : fini ? "termine" : "creation", fin_le: fini && !vintedReste ? new Date().toISOString() : null, a_traiter: 0, photos_manquantes: 0,
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
      body: JSON.stringify({ ...(typeof body.user_id === "string" ? { user_id: body.user_id } : {}), ...(reparer ? { reparer: true } : {}),
        ...(porteeMain === "toutes" ? { fiches_main: "toutes" } : {}), ...(porteeRemises === "toutes" ? { remises: "toutes" } : {}), relance: rang + 1 }),
    })).catch(() => {});
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(suite);
  }

  const sortie = { comptes: bilan.map((b) => ({ ...b, plan: undefined })), duree_ms: Date.now() - debut, inacheve };
  console.log("[rapprochement]", JSON.stringify(sortie).slice(0, 4000));
  return json({ comptes: bilan, duree_ms: Date.now() - debut, inacheve });
});
