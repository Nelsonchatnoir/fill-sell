import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { lienDepuisId } from "../_shared/annonce-lien.ts";
import {
  BEEBS_PREUVE_STRICTE_DEPUIS,
  choisirIdentifiantBeebsExact,
  depotALienParTitre,
  mettreLienBeebsRecupereEnAttenteConfirmation,
  restaurerPublicationBeebsConfirmee,
  type ReleveBeebsExact,
} from "../_shared/beebs-lien-exact.ts";
import { rattacherParPhotos, urlsAnnonce, candidatesDesDepots } from "../_shared/depot-sans-numero.js";
import { urlsPhotos } from "../_shared/recreation-deja-partie.js";

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
const LIENS_A_CONFIRMER_MAX = 10;

type Job = {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  published_at: string | null;
  inventaire_id: number | null;
  listing_url: string | null;
  platform_listing_id: string | null;
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
    const selection = "id,user_id,status,created_at,published_at,inventaire_id,listing_url,platform_listing_id,platform_fields";
    const [historiques, confirmesSansId, liensRecuperesSansPreuve] = await Promise.all([
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
      supabase
        .from("cross_post_jobs")
        .select(selection)
        .eq("platform", "beebs")
        .in("action", ["publish", "republish"])
        .eq("status", "published")
        .gte("created_at", BEEBS_PREUVE_STRICTE_DEPUIS)
        .is("platform_listing_id", null)
        .not("listing_url", "is", null)
        .not("platform_fields->listing_url_recovery", "is", null)
        .not("platform_fields->lien_en_attente", "is", null)
        .order("created_at", { ascending: true })
        .limit(LIENS_A_CONFIRMER_MAX + 1),
    ]);
    if (historiques.error) throw new Error(`sélection des dépôts historiques : ${historiques.error.message}`);
    if (confirmesSansId.error) throw new Error(`sélection des dépôts confirmés : ${confirmesSansId.error.message}`);
    if (liensRecuperesSansPreuve.error) throw new Error(`sélection des liens Beebs non prouvés : ${liensRecuperesSansPreuve.error.message}`);

    // Les anciennes extensions récupèrent ces liens par titre unique. On les
    // garde comme candidats, mais jamais comme preuve : le relevé proposera
    // « Est-ce cette annonce ? », et seul le oui posera l'identifiant exact.
    const quarantaines = (await Promise.all(
      ((liensRecuperesSansPreuve.data ?? []) as Job[]).slice(0, LIENS_A_CONFIRMER_MAX).map(async (job) => {
        const attente = mettreLienBeebsRecupereEnAttenteConfirmation(job);
        if (!attente) return null;
        const { data: maj, error: majErr } = await supabase
          .from("cross_post_jobs")
          .update({ listing_url: null, platform_fields: attente.platformFields })
          .eq("id", job.id)
          .is("platform_listing_id", null)
          .eq("listing_url", attente.urlCandidate)
          .select(selection);
        if (majErr) throw new Error(`mise en attente de confirmation ${job.id}: ${majErr.message}`);
        return (maj ?? []).length === 1 ? (maj as Job[])[0] : null;
      }),
    )).filter((job): job is Job => job != null);
    const liensAConfirmer = quarantaines.length;

    const tousLesCandidats = ([...(historiques.data ?? []), ...(confirmesSansId.data ?? []), ...quarantaines] as Job[])
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const selectionExhaustive = (historiques.data?.length ?? 0) <= JOBS_MAX
      && (confirmesSansId.data?.length ?? 0) <= JOBS_MAX
      && (liensRecuperesSansPreuve.data?.length ?? 0) <= LIENS_A_CONFIRMER_MAX
      && tousLesCandidats.length <= JOBS_MAX;
    const jobs = tousLesCandidats.slice(0, JOBS_MAX);
    if (!jobs.length) {
      return new Response(JSON.stringify({ ok: true, depots: 0, rattaches: 0 }), {
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
    let ambigus = 0;
    let confirmesParUtilisateur = 0;
    let publicationsRestaurees = 0;

    for (const job of jobs) {
      const nbSurInventaire = !selectionExhaustive
        ? 2 // fail-closed : un second dépôt peut se trouver hors de la borne
        : job.inventaire_id == null
        ? 0
        : (depotsParInventaire.get(`${job.user_id}|${job.inventaire_id}`) ?? 0);
      // Un dépôt qui a porté un lien retrouvé par le titre n'est jamais
      // numéroté par un rattachement automatique du relevé (cf.
      // choisirIdentifiantBeebsExact) : seul le geste de la personne compte.
      const verdict = choisirIdentifiantBeebsExact(
        { ...job, lien_par_titre: depotALienParTitre(job.platform_fields) },
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
      }

      // Retour arrière d'urgence : ces pending portent la preuve que Beebs a
      // déjà confirmé le dépôt. Ils ne doivent ni rester « en cours » à vie,
      // ni être redistribués (ce qui créerait un doublon). On restaure donc le
      // statut terminal d'avant 20:22, sans inventer d'identifiant. Les retraits
      // restent fermés tant qu'un relevé ou un geste utilisateur n'apporte pas
      // la preuve exacte traitée au-dessus.
      if (job.status === "pending") {
        const restauration = restaurerPublicationBeebsConfirmee(pf);
        if (!restauration) continue;
        const { data: maj, error: majErr } = await supabase
          .from("cross_post_jobs")
          .update({
            status: "published",
            error: null,
            published_at: restauration.publishedAt,
            platform_fields: restauration.platformFields,
          })
          .eq("id", job.id)
          .eq("status", "pending")
          .is("platform_listing_id", null)
          .is("listing_url", null)
          .select("id");
        if (majErr) throw new Error(`restauration ${job.id}: ${majErr.message}`);
        if ((maj ?? []).length) publicationsRestaurees++;
      }
    }

    // ── LES PHOTOS DE NOTRE COPIE (15/10 soir, cascade de Nico) ──────────────
    // (_shared/depot-sans-numero.js) Un dépôt toujours sans numéro après les
    // voies exactes ci-dessus : une annonce du relevé reliée à RIEN, apparue
    // après lui, non numérotée avant lui, aux photos de notre copie, unique et
    // mutuelle → son numéro. Le doute ne rattache rien. Comptes bornés à 10 par
    // passage, lectures par pages de 1 000 (PostgREST).
    let rattachesParPhotos = 0;
    const restants = jobs.filter((j) => j.status === "published" || j.status === "pending");
    const { data: encoreSansNumero } = restants.length
      ? await supabase.from("cross_post_jobs").select("id, user_id, status, photos, published_at, created_at, inventaire_id, platform_fields, platform_listing_id")
        .in("id", restants.map((j) => j.id)).is("platform_listing_id", null)
      : { data: [] };
    const parCompte = new Map<string, Array<Record<string, unknown>>>();
    for (const j of (encoreSansNumero ?? []) as Array<Record<string, unknown>>) {
      const u = String(j.user_id);
      if (!parCompte.has(u)) parCompte.set(u, []);
      parCompte.get(u)!.push(j);
    }
    for (const [userId, depots] of [...parCompte].slice(0, 10)) {
      const lignes: Array<Record<string, unknown>> = [];
      for (let page = 0; page < 6; page++) {
        const { data: lot, error: lErr } = await supabase.from("annonces_plateforme")
          .select("id, listing_id, url, statut_plateforme, photo_url, capture, created_at, job_id, inventaire_id, disparu_le, retiree_le")
          .eq("user_id", userId).eq("platform", "beebs").order("listing_id", { ascending: true }).range(page * 1000, page * 1000 + 999);
        if (lErr) throw new Error(`relevé du compte ${userId} : ${lErr.message}`);
        lignes.push(...((lot ?? []) as Array<Record<string, unknown>>));
        if ((lot ?? []).length < 1000) break;
      }
      const urls = new Set<string>();
      for (const d of depots) for (const u of urlsPhotos(d.photos)) urls.add(u);
      for (const a of candidatesDesDepots(depots, lignes)) for (const u of urlsAnnonce(a)) urls.add(u);
      if (!urls.size) continue;
      const toutes = [...urls];
      const empreintes = new Map<string, unknown>();
      for (let i = 0; i < toutes.length; i += 200) {
        const { data: emp } = await supabase.from("photo_empreintes").select("url, dhash, phash, variantes").in("url", toutes.slice(i, i + 200));
        for (const e of (emp ?? []) as Array<Record<string, unknown>>) empreintes.set(String(e.url), e);
      }
      const choix = rattacherParPhotos({ depots, lignes, empreinte: (u: string) => empreintes.get(u) });
      for (const [jobId, c] of choix) {
        const d = depots.find((x) => String(x.id) === jobId)!;
        const pf = { ...((d.platform_fields ?? {}) as Record<string, unknown>) };
        const attente = (pf["attente_identifiant_beebs"] && typeof pf["attente_identifiant_beebs"] === "object")
          ? pf["attente_identifiant_beebs"] as Record<string, unknown> : null;
        delete pf["attente_identifiant_beebs"]; delete pf["lien_en_attente"]; delete pf["listing_url_abandon"];
        pf["lien_par_photos"] = { at: new Date().toISOString(), listing_id: c.listing_id, preuve: c.preuve, photos: c.photos, statut: c.statut };
        // Une URL Beebs en base veut dire « en ligne » : posée seulement si le
        // relevé l'a vue en ligne ; en vérification, le numéro suffit.
        const url = c.statut === "en_ligne" ? lienDepuisId("beebs", c.listing_id) : null;
        const { data: maj, error: majErr } = await supabase.from("cross_post_jobs")
          .update({
            status: "published", error: null, platform_listing_id: c.listing_id,
            ...(url ? { listing_url: url } : {}),
            published_at: (d.published_at as string | null)
              ?? (typeof attente?.["depot_confirme_le"] === "string" ? attente["depot_confirme_le"] as string : new Date().toISOString()),
            platform_fields: pf,
          })
          .eq("id", jobId).in("status", ["published", "pending"]).is("platform_listing_id", null).select("id");
        if (majErr) throw new Error(`rattachement par photos ${jobId}: ${majErr.message}`);
        if (!(maj ?? []).length) continue;
        const ligne = lignes.find((a) => String(a.listing_id) === c.listing_id);
        if (ligne) {
          const { data: majA } = await supabase.from("annonces_plateforme")
            .update({ job_id: jobId, inventaire_id: d.inventaire_id ?? null, source_rapprochement: "job", updated_at: new Date().toISOString() })
            .eq("id", String(ligne.id)).is("job_id", null).is("inventaire_id", null).select("id");
          if ((majA ?? []).length && d.inventaire_id != null) {
            await supabase.from("rapprochements").insert({
              user_id: userId, annonce_id: String(ligne.id), inventaire_id: d.inventaire_id, decision: "attache", par: "job", score: 1,
              detail: { job_id: jobId, motif: "photos_de_la_copie", photos: c.photos, source: "beebs-lien" },
            });
          }
        }
        rattachesParPhotos++;
        console.log(`[beebs-lien] dépôt ${jobId.slice(0, 8)} : annonce ${c.listing_id} (${c.statut}) — ${c.preuve}`);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      depots: jobs.length,
      rattaches,
      rattaches_par_photos: rattachesParPhotos,
      ambigus,
      confirmes_par_utilisateur: confirmesParUtilisateur,
      publications_restaurees: publicationsRestaurees,
      liens_a_confirmer: liensAConfirmer,
      selection_exhaustive: selectionExhaustive,
      regle: "identifiant de relevé exact, puis photos de notre copie (15/10) ; jamais titre/prix/date",
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
