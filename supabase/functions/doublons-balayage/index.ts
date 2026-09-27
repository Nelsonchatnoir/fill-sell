// ═══════════════════════════════════════════════════════════════════════════
// doublons-balayage — les photos, puis les décisions du rattachement
// (2026-09-25, chantier « zéro doublon »)
// ═══════════════════════════════════════════════════════════════════════════
// APPELANT : pg_cron toutes les 2 minutes (migration 20260925152000), header
// x-cron-secret. Aucun autre appelant. → verify_jwt = FALSE (déployer avec
// --no-verify-jwt), garde maison sur le secret : verify_jwt=false n'est
// JAMAIS « pas d'authentification ».
//
// CE QU'ELLE FAIT, à chaque passage :
//   1. demande à la base les photos qui manquent pour trancher
//      (rapprochement_urls_a_empreinter : annonces PROPOSÉES et leurs
//      candidates, puis fiches IMPORTÉES récentes et leurs jumelles de
//      titre), en calcule quelques-unes (dHash/pHash/couleur, même module
//      que photo-empreinte), les écrit dans le cache photo_empreintes — ou
//      dans photo_empreintes_echecs quand l'image est illisible ;
//   2. laisse la base décider (rapprochement_photos_decider) : une annonce
//      proposée que la photo PROUVE est rattachée ; une fiche importée
//      certaine est fusionnée (journalisée, réversible) ; une probable devient
//      une question dans l'app. Rien n'est jamais envoyé à une plateforme.
// COÛT MAÎTRISÉ : 6 photos par passage au plus (le décodage coûte du CPU :
// 2 s par requête au plus), 40 s de budget, hôtes en liste fermée.
//
// (2026-09-27, migration 20260927190000) CHAQUE APPEL À LA BASE TIENT SOUS
// LES 8 s de l'appelant (statement_timeout du rôle authenticator). Avant, un
// seul appel décidait 60 annonces + 20 fiches avec des budgets de 20 et 40 s :
// il était annulé à chaque passage, rien n'était jamais enregistré, et tout
// repartait de zéro deux minutes plus tard (26/09 20:00 → 27/09 18:35).
// Désormais :
//   2. rapprochement_photos_decider ne décide plus que les ANNONCES proposées
//      (budget 4 s dans la base) ;
//   3. les FICHES sont réservées (doublons_reserver_fiches), puis examinées
//      UNE PAR APPEL (doublons_examiner_fiche) : chaque examen est enregistré
//      dès qu'il finit ; un examen annulé ne coûte que sa fiche (reprise après
//      30 min, abandon au 3e essai) ; ce que le budget du passage ne permet pas
//      d'examiner est rendu (doublons_liberer_fiches).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { empreinterUrl, hoteAutorise } from "../_shared/empreinte-telechargement.ts";

const MAX_URLS = 6;
const BUDGET_MS = 40_000;
const FICHES_PAR_PASSAGE = 10;
// On ne lance plus d'examen quand il reste moins que ça : un examen dure < 1 s
// (mesuré le 27/09 : 0,4 à 0,8 s), la marge couvre le pire.
const MARGE_EXAMEN_MS = 5_000;

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { "Content-Type": "application/json" } });

serve(async (req) => {
  const secret = req.headers.get("x-cron-secret");
  const attendu = Deno.env.get("CRON_SECRET");
  if (!secret || !attendu || secret !== attendu) return json({ error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const debut = Date.now();
  let calculees = 0;
  const echecs: Array<{ url: string; motif: string }> = [];

  // 1. Les photos qui manquent pour trancher.
  const { data: urls, error: eUrls } = await admin.rpc("rapprochement_urls_a_empreinter", { p_limite: MAX_URLS });
  if (eUrls) console.warn("[doublons-balayage] urls :", eUrls.message);
  for (const url of (Array.isArray(urls) ? urls : []) as string[]) {
    if (Date.now() - debut > BUDGET_MS) break;
    try {
      if (!hoteAutorise(url, supabaseUrl)) throw new Error("hôte hors liste");
      const e = await empreinterUrl(url, supabaseUrl);
      const { error } = await admin.from("photo_empreintes").upsert({
        url, dhash: e.dhash, phash: e.phash, couleur: e.couleur, largeur: e.largeur, hauteur: e.hauteur,
        source: "doublons-balayage", calculee_le: new Date().toISOString(),
      }, { onConflict: "url" });
      if (error) throw new Error(`écriture : ${error.message}`);
      calculees++;
    } catch (err) {
      const motif = String((err as Error)?.message ?? err).slice(0, 160);
      echecs.push({ url, motif });
      // Une image illisible n'est retentée que 3 fois, jamais plus d'une fois toutes les 6 h.
      const { data: deja } = await admin.from("photo_empreintes_echecs").select("essais").eq("url", url).maybeSingle();
      await admin.from("photo_empreintes_echecs").upsert({
        url, motif, essais: (Number(deja?.essais) || 0) + 1, echec_le: new Date().toISOString(),
      }, { onConflict: "url" });
    }
  }

  // 2. Les décisions sur les ANNONCES proposées, dans la base (budget 4 s).
  const { data: bilan, error: eDec } = await admin.rpc("rapprochement_photos_decider", { p_limite: 20 });
  if (eDec) console.warn("[doublons-balayage] décisions :", eDec.message);

  // 3. Les FICHES importées : réservées, puis examinées une par appel.
  const fiches = { reservees: 0, examinees: 0, attente_photos: 0, sans_objet: 0, fusions: 0, propositions: 0, echecs: 0, liberees: 0 };
  const { data: ids, error: eRes } = await admin.rpc("doublons_reserver_fiches", { p_limite: FICHES_PAR_PASSAGE });
  if (eRes) console.warn("[doublons-balayage] réservation :", eRes.message);
  const aExaminer = (Array.isArray(ids) ? ids : []) as number[];
  fiches.reservees = aExaminer.length;
  let k = 0;
  for (; k < aExaminer.length; k++) {
    if (Date.now() - debut > BUDGET_MS - MARGE_EXAMEN_MS) break;
    const { data: r, error: eEx } = await admin.rpc("doublons_examiner_fiche", { p_fiche: aExaminer[k] });
    if (eEx) {
      // La réservation reste posée : la fiche est reprise dans 30 min, abandonnée au 3e essai.
      fiches.echecs++;
      console.warn("[doublons-balayage] examen", aExaminer[k], ":", eEx.message);
      continue;
    }
    const issue = (r as { issue?: string } | null)?.issue;
    if (issue === "examinee") {
      fiches.examinees++;
      fiches.fusions += Number((r as { fusions?: number }).fusions) || 0;
      fiches.propositions += Number((r as { propositions?: number }).propositions) || 0;
    } else if (issue === "attente_photos") fiches.attente_photos++;
    else if (issue === "sans_objet") fiches.sans_objet++;
  }
  const restantes = aExaminer.slice(k);
  if (restantes.length) {
    const { data: n, error: eLib } = await admin.rpc("doublons_liberer_fiches", { p_ids: restantes });
    if (eLib) console.warn("[doublons-balayage] libération :", eLib.message);
    fiches.liberees = Number(n) || 0;
  }

  const sortie = {
    photos_calculees: calculees, photos_echouees: echecs.length, bilan: { annonces: bilan ?? null, fiches },
    erreur: eDec?.message ?? eRes?.message ?? eUrls?.message ?? null, duree_ms: Date.now() - debut,
  };
  console.log("[doublons-balayage]", JSON.stringify(sortie));
  return json({ ...sortie, echecs: echecs.slice(0, 10) });
});
