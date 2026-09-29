import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { lienDepuisId } from "../_shared/annonce-lien.ts";
import {
  choisirIdentifiantBeebsExact,
  type ReleveBeebsExact,
} from "../_shared/beebs-lien-exact.ts";

// beebs-lien — rattachement EXACT des dépôts Beebs sans identifiant.
// Appelée par pg_cron (x-cron-secret), verify_jwt=false inchangé.
//
// Règle du 29/09 : ni le titre, ni le prix, ni la proximité temporelle ne
// prouvent qu'une annonce est celle d'un dépôt. Deux exemplaires peuvent avoir
// le même titre et le même prix. La seule entrée acceptée ici est une ligne de
// relevé `annonces_plateforme` qui porte directement le `job_id` du dépôt et
// son identifiant numérique. Une seconde voie existe après le geste explicite
// « c'est le même article » : un seul dépôt sans identité + un seul identifiant
// exact sur la fiche confirmée. L'absence ou l'ambiguïté ne prouve rien : le
// dépôt reste en vérification, sans re-soumission et sans retrait possible.

const JOBS_MAX = 200;

type Job = {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  published_at: string | null;
  inventaire_id: number | null;
  platform_fields: Record<string, unknown> | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (!expectedSecret || cronSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const selection = "id,user_id,status,created_at,published_at,inventaire_id,platform_fields";
    const [historiques, confirmesSansId] = await Promise.all([
      supabase
        .from("cross_post_jobs")
        .select(selection)
        .eq("platform", "beebs")
        .in("action", ["publish", "republish"])
        .eq("status", "published")
        .is("platform_listing_id", null)
        .is("listing_url", null)
        .order("created_at", { ascending: true })
        // Le +1 ne sert pas à traiter davantage de lignes : il prouve si la
        // sélection est exhaustive. Si elle ne l'est pas, la voie manuelle
        // reste fermée (un homonyme pourrait se trouver après la borne).
        .limit(JOBS_MAX + 1),
      supabase
        .from("cross_post_jobs")
        .select(selection)
        .eq("platform", "beebs")
        .in("action", ["publish", "republish"])
        .eq("status", "pending")
        // Un `pending` ordinaire n'a peut-être jamais été soumis. Il ne peut
        // jamais être rattaché à une annonce déjà présente. Seul ce marqueur,
        // posé APRÈS la confirmation du dépôt, l'admet dans le balayage.
        .not("platform_fields->attente_identifiant_beebs", "is", null)
        .is("platform_listing_id", null)
        .is("listing_url", null)
        .order("created_at", { ascending: true })
        .limit(JOBS_MAX + 1),
    ]);
    if (historiques.error) throw new Error(`sélection des dépôts historiques : ${historiques.error.message}`);
    if (confirmesSansId.error) throw new Error(`sélection des dépôts confirmés : ${confirmesSansId.error.message}`);

    const tousLesCandidats = ([...(historiques.data ?? []), ...(confirmesSansId.data ?? [])] as Job[])
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    const selectionExhaustive = (historiques.data?.length ?? 0) <= JOBS_MAX
      && (confirmesSansId.data?.length ?? 0) <= JOBS_MAX
      && tousLesCandidats.length <= JOBS_MAX;
    const jobs = tousLesCandidats.slice(0, JOBS_MAX);
    if (!jobs.length) {
      return new Response(JSON.stringify({ ok: true, depots: 0, rattaches: 0, mis_en_attente: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: relevesDirectsBruts, error: relevesDirectsErr } = await supabase
      .from("annonces_plateforme")
      .select("job_id,user_id,inventaire_id,listing_id,disparu_le,source_rapprochement")
      .eq("platform", "beebs")
      .in("job_id", jobs.map((j) => j.id))
      .is("disparu_le", null)
      .limit(JOBS_MAX * 2);
    if (relevesDirectsErr) throw new Error(`lecture du relevé direct : ${relevesDirectsErr.message}`);

    const inventaires = [...new Set(jobs.map((j) => j.inventaire_id).filter((id): id is number => id != null))];
    const { data: relevesManuelsBruts, error: relevesManuelsErr } = inventaires.length
      ? await supabase
        .from("annonces_plateforme")
        .select("job_id,user_id,inventaire_id,listing_id,disparu_le,source_rapprochement")
        .eq("platform", "beebs")
        .eq("source_rapprochement", "manuel")
        .in("inventaire_id", inventaires)
        .is("disparu_le", null)
        .limit(JOBS_MAX * 2)
      : { data: [], error: null };
    if (relevesManuelsErr) throw new Error(`lecture du relevé confirmé : ${relevesManuelsErr.message}`);

    const relevesParUtilisateur = new Map<string, ReleveBeebsExact[]>();
    const cleReleve = (r: ReleveBeebsExact) => [r.job_id, r.user_id, r.inventaire_id, r.listing_id].join("|");
    const vus = new Set<string>();
    for (const ligne of [...(relevesDirectsBruts ?? []), ...(relevesManuelsBruts ?? [])] as ReleveBeebsExact[]) {
      const cle = cleReleve(ligne);
      if (vus.has(cle)) continue;
      vus.add(cle);
      if (!relevesParUtilisateur.has(ligne.user_id)) relevesParUtilisateur.set(ligne.user_id, []);
      relevesParUtilisateur.get(ligne.user_id)!.push(ligne);
    }
    const depotsParInventaire = new Map<string, number>();
    for (const job of jobs) {
      if (job.inventaire_id == null) continue;
      const cle = `${job.user_id}|${job.inventaire_id}`;
      depotsParInventaire.set(cle, (depotsParInventaire.get(cle) ?? 0) + 1);
    }

    let rattaches = 0;
    let misEnAttente = 0;
    let ambigus = 0;
    let confirmesParUtilisateur = 0;

    for (const job of jobs) {
      const nbSurInventaire = !selectionExhaustive
        ? 2 // fail-closed : un second dépôt peut se trouver hors de la borne
        : job.inventaire_id == null
        ? 0
        : (depotsParInventaire.get(`${job.user_id}|${job.inventaire_id}`) ?? 0);
      const verdict = choisirIdentifiantBeebsExact(
        job,
        relevesParUtilisateur.get(job.user_id) ?? [],
        nbSurInventaire,
      );
      const pf = { ...(job.platform_fields ?? {}) };

      if (verdict.ok) {
        const id = verdict.id;
        const url = lienDepuisId("beebs", id);
        if (!url) continue;
        const attente = (pf["attente_identifiant_beebs"] && typeof pf["attente_identifiant_beebs"] === "object")
          ? pf["attente_identifiant_beebs"] as Record<string, unknown> : null;
        delete pf["attente_identifiant_beebs"];
        delete pf["lien_en_attente"];
        delete pf["listing_url_abandon"];
        pf["lien_par_releve_exact"] = {
          at: new Date().toISOString(),
          listing_id: id,
          job_id: job.id,
          regle: verdict.preuve === "job_id_exact"
            ? "annonces_plateforme.job_id exact"
            : "identifiant du relevé sur fiche confirmée par utilisateur",
        };
        const { data: maj, error: majErr } = await supabase
          .from("cross_post_jobs")
          .update({
            status: "published",
            error: null,
            listing_url: url,
            platform_listing_id: id,
            published_at: job.published_at
              ?? (typeof attente?.["depot_confirme_le"] === "string" ? attente["depot_confirme_le"] : new Date().toISOString()),
            platform_fields: pf,
          })
          .eq("id", job.id)
          .in("status", ["published", "pending"])
          .select("id");
        if (majErr) throw new Error(`rattachement ${job.id}: ${majErr.message}`);
        if ((maj ?? []).length) {
          rattaches++;
          if (verdict.preuve === "inventaire_confirme_par_utilisateur") confirmesParUtilisateur++;
        }
        continue;
      }

      if (verdict.raison === "ambigu" || verdict.raison === "inventaire_ambigu") {
        ambigus++;
        continue;
      }

      // Historique : un ancien build a pu écrire `published` sans id. Il est
      // reclassé par le moteur normal (pas par une réparation SQL) et attend le
      // relevé exact. Aucune conclusion sur la modération n'est tirée.
      if (job.status === "published") {
        pf["attente_identifiant_beebs"] = {
          depuis: new Date().toISOString(),
          depot_confirme_le: job.published_at,
          preuve_attendue: "identifiant exact du relevé Beebs rattaché à ce job",
          pose_par: "beebs-lien (audit historique)",
        };
        delete pf["processing_since"];
        const { data: maj, error: majErr } = await supabase
          .from("cross_post_jobs")
          // `published_at` est l'historique du dépôt confirmé. Le statut cesse
          // d'affirmer « publiée », mais on ne détruit pas cette date : elle
          // redeviendra la date de publication si un relevé exact apporte l'id.
          .update({ status: "pending", error: null, platform_fields: pf })
          .eq("id", job.id)
          .eq("status", "published")
          .is("platform_listing_id", null)
          .is("listing_url", null)
          .select("id");
        if (majErr) throw new Error(`mise en attente ${job.id}: ${majErr.message}`);
        if ((maj ?? []).length) misEnAttente++;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      depots: jobs.length,
      rattaches,
      mis_en_attente: misEnAttente,
      ambigus,
      confirmes_par_utilisateur: confirmesParUtilisateur,
      selection_exhaustive: selectionExhaustive,
      regle: "identifiant de relevé exact ; jamais titre/prix/date/photo",
    }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[beebs-lien]", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
