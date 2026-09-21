import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { apparier, dressing, FENETRE_MS, uidVendeur } from "../_shared/beebs-index.ts";
import { idDepuisLien, lienDepuisId } from "../_shared/annonce-lien.ts";

// ═══════════════════════════════════════════════════════════════════════════
// beebs-lien — LE FILET QUI VA CHERCHER LE LIEN D'UN DÉPÔT BEEBS (2026-09-21)
// ═══════════════════════════════════════════════════════════════════════════
// Appelée par pg_cron toutes les 5 min (header x-cron-secret).
// Déployer avec --no-verify-jwt.
//
// CE QU'ELLE RÉPARE. Un dépôt Beebs part en MODÉRATION HUMAINE : Beebs ne rend
// AUCUN lien à cet instant et c'est normal (« il sera mis en ligne dès qu'il
// aura été vérifié par notre équipe »). Le lien arrive plus tard — et jusqu'ici
// il n'arrivait QUE si la personne rouvrait Beebs avec l'extension : la
// re-capture différée (recoverMissingListingUrls) navigue dans « Mes annonces »
// depuis son navigateur. Deux conséquences mesurées le 21/09 :
//   · 21 dépôts du parc sont 'published' sans listing_url ;
//   · 2 d'entre eux portent un article VENDU dont le retrait attend ce lien
//     (règle du 11/09 : sans lien, on ne retire JAMAIS par le titre) — dont le
//     pantalon Sandro de meminiandmove, vendu le 20/09 à 22:42.
// Et « Mes annonces » ne rend que sa PREMIÈRE page : chez une vendeuse à 197
// annonces, la page en montrait 60 (relevé du 19/09) — les dépôts anciens n'y
// étaient jamais revus, quel que soit le nombre de passages.
//
// CE QU'ELLE FAIT. Elle lit l'index public de Beebs (le même que leur propre
// recherche, clé de recherche publique) et apparie CHAQUE dépôt sans lien à son
// annonce par la DATE DE CRÉATION à la seconde — trois verrous obligatoires
// (candidat unique, appariement mutuel, prix identique), détaillés dans
// _shared/beebs-index.ts. Aucun appariement par titre, jamais.
//
// ⛔ CE QU'ELLE NE FAIT PAS, ET NE DOIT JAMAIS FAIRE : conclure une absence.
// Un dépôt introuvable dans l'index n'est PAS un dépôt raté — il peut être en
// modération (le cas du Sandro : dépôt confirmé, vu trois fois dans « En cours
// de vérification », absent de l'index 13 h après). Elle n'écrit que des liens ;
// la requalification des dépôts jamais mis en ligne reste au cron de 7 jours
// (fail_publish_without_listing_url), qui lui est fait pour ça.

const JOBS_MAX = 200;      // dépôts examinés par passage
const COMPTES_MAX = 15;    // comptes interrogés par passage (2 appels index chacun)

type Job = {
  id: string;
  user_id: string;
  title: string | null;
  price: number | null;
  published_at: string | null;
  created_at: string | null;
  platform_fields: Record<string, unknown> | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (!expectedSecret || cronSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const journal: Array<Record<string, unknown>> = [];
  let poses = 0;

  try {
    // Les PLUS ANCIENS d'abord : ce sont eux que l'échéance des 7 jours menace
    // (même ordre que recoverMissingListingUrls depuis la famine du 09/09).
    const { data: jobsBruts, error: selErr } = await supabase
      .from("cross_post_jobs")
      .select("id, user_id, title, price, published_at, created_at, platform_fields")
      .eq("platform", "beebs")
      .in("action", ["publish", "republish"])
      .eq("status", "published")
      .is("listing_url", null)
      .order("published_at", { ascending: true, nullsFirst: false })
      .limit(JOBS_MAX);
    if (selErr) throw new Error(`sélection : ${selErr.message}`);

    const jobs = (jobsBruts ?? []) as Job[];
    if (!jobs.length) {
      return new Response(JSON.stringify({ ok: true, depots: 0, liens_poses: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const parCompte = new Map<string, Job[]>();
    for (const j of jobs) {
      if (!parCompte.has(j.user_id)) parCompte.set(j.user_id, []);
      parCompte.get(j.user_id)!.push(j);
    }

    for (const [userId, depots] of [...parCompte.entries()].slice(0, COMPTES_MAX)) {
      const note = (etat: string, extra: Record<string, unknown> = {}) =>
        journal.push({ compte: userId.slice(0, 8), depots: depots.length, etat, ...extra });

      // ── 1. QUI EST CE VENDEUR CHEZ BEEBS ? ─────────────────────────────────
      // Jamais deviné. On part d'annonces dont on est SÛR qu'elles sont à lui :
      // son relevé Beebs (annonces_plateforme) puis, à défaut, les identifiants
      // déjà posés sur ses propres jobs. Sans graine → on s'arrête, point.
      const { data: profil } = await supabase
        .from("profiles").select("extension_sessions").eq("id", userId).maybeSingle();
      const sessions = ((profil?.extension_sessions ?? {}) as Record<string, unknown>);
      const identite = (sessions["beebs_identite"] ?? {}) as Record<string, unknown>;
      let uid = String(identite["user_id"] ?? "").trim() || null;

      if (!uid) {
        const graines: string[] = [];
        const { data: releve } = await supabase
          .from("annonces_plateforme")
          .select("listing_id")
          .eq("user_id", userId).eq("platform", "beebs")
          .not("listing_id", "is", null)
          .order("created_at", { ascending: false }).limit(5);
        for (const r of (releve ?? []) as Array<{ listing_id: string | null }>) {
          const v = String(r.listing_id ?? "").trim();
          if (/^\d+$/.test(v)) graines.push(v);
        }
        if (graines.length < 3) {
          const { data: autres } = await supabase
            .from("cross_post_jobs")
            .select("listing_url, platform_listing_id")
            .eq("user_id", userId).eq("platform", "beebs")
            .not("listing_url", "is", null)
            .order("published_at", { ascending: false }).limit(5);
          for (const a of (autres ?? []) as Array<{ listing_url: string | null; platform_listing_id: string | null }>) {
            const v = idDepuisLien("beebs", a.listing_url) ?? String(a.platform_listing_id ?? "").trim();
            if (/^\d+$/.test(v)) graines.push(v);
          }
        }
        if (!graines.length) { note("sans_graine"); continue; }
        uid = await uidVendeur(graines);
        if (!uid) { note("vendeur_introuvable"); continue; }
        // Mémorisé : le prochain passage n'aura plus qu'un appel à faire.
        await supabase.from("profiles").update({
          extension_sessions: {
            ...sessions,
            beebs_identite: { user_id: uid, cle: "index_public", at: new Date().toISOString() },
          },
        }).eq("id", userId);
      }

      // ── 2. SON DRESSING EN LIGNE, AVEC LES DATES DE CRÉATION ───────────────
      const annonces = await dressing(uid);
      if (annonces == null) { note("index_muet"); continue; }
      if (!annonces.length) { note("dressing_vide_ou_tout_en_moderation"); continue; }

      // ── 3. GARDE ANTI-CROISEMENT ──────────────────────────────────────────
      // Une annonce déjà portée par un autre job de ce compte ne peut pas être
      // la nôtre : c'est l'écho d'une annonce existante (même principe
      // qu'ebayIdAlreadyKnown côté extension).
      const { data: deja } = await supabase
        .from("cross_post_jobs")
        .select("listing_url, platform_listing_id")
        .eq("user_id", userId).eq("platform", "beebs")
        .not("listing_url", "is", null);
      const idsPris = new Set<string>();
      for (const d of (deja ?? []) as Array<{ listing_url: string | null; platform_listing_id: string | null }>) {
        const a = idDepuisLien("beebs", d.listing_url);
        if (a) idsPris.add(a);
        const b = String(d.platform_listing_id ?? "").trim();
        if (b) idsPris.add(b);
      }

      // ── 4. APPARIEMENT ────────────────────────────────────────────────────
      const aCaler = depots.map((d) => ({
        id: d.id,
        repere_ms: Date.parse(d.published_at ?? d.created_at ?? ""),
        prix: d.price == null ? null : Number(d.price),
      }));
      const paires = apparier(aCaler, annonces, idsPris);
      if (!paires.size) { note("aucun_appariement", { annonces_en_ligne: annonces.length }); continue; }

      for (const d of depots) {
        const trouve = paires.get(d.id);
        if (!trouve) continue;
        const url = lienDepuisId("beebs", trouve.annonce.listing_id);
        if (!url) continue;
        const pf = (d.platform_fields ?? {}) as Record<string, unknown>;
        const { error: upErr } = await supabase
          .from("cross_post_jobs")
          .update({
            listing_url: url,
            platform_listing_id: trouve.annonce.listing_id,
            platform_fields: {
              ...pf,
              lien_par_index: {
                at: new Date().toISOString(),
                listing_id: trouve.annonce.listing_id,
                ecart_s: Math.round(trouve.ecart_ms / 1000),
                fenetre_s: FENETRE_MS / 1000,
                titre_index: trouve.annonce.titre,
                prix_index: trouve.annonce.prix,
                regle: "creation_date ↔ published_at, candidat unique + appariement mutuel + prix",
              },
            },
          })
          // La condition de course qui compte : la re-capture de l'extension a
          // pu poser le lien entre notre lecture et notre écriture. Elle gagne.
          .eq("id", d.id).is("listing_url", null);
        if (upErr) { note("ecriture_refusee", { job: d.id.slice(0, 8), raison: upErr.message }); continue; }
        poses++;
        console.log(
          `[beebs-lien] job ${d.id.slice(0, 8)} → ${url} (écart ${Math.round(trouve.ecart_ms / 1000)} s, ` +
          `« ${trouve.annonce.titre ?? "?"} »)`,
        );
      }
      note("ok", { apparies: paires.size, annonces_en_ligne: annonces.length });
    }

    return new Response(JSON.stringify({
      ok: true,
      depots: jobs.length,
      comptes: Math.min(parCompte.size, COMPTES_MAX),
      liens_poses: poses,
      journal,
    }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[beebs-lien]", e instanceof Error ? e.message : String(e));
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
