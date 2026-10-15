// ═══════════════════════════════════════════════════════════════════════════
// LES QUESTIONS QUE FILLSELL TRANCHE SEUL (15/10 soir, mission de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « Quand l'utilisateur lance une publication ou une republication, elle part.
// Une question n'est posée QUE si aucune donnée fiable ne permet de décider. »
// Passage de handler-watch (toutes les 3 min), borné (400 jobs lus, écritures
// conditionnelles sur status = 'needs_user'), jamais une ligne réécrite à
// l'identique. Trois règles :
//   1. « boutique_a_choisir » (11/10) n'existe plus : la boutique se choisit
//      seule (_shared/boutique-publication-vinted.js) — la publication repart ;
//   2. « État » : la valeur de l'annonce capturée, puis de la fiche, puis des
//      autres plateformes de l'article, traduite dans la grille demandée
//      (_shared/etat-correspondance.js) — jamais deux fois la même réponse ;
//   3. sans objet : publication ou republication (pas encore engagée) d'un
//      article dont la VENTE est enregistrée ; republication orpheline (sa
//      fiche n'existe plus) → annulées, rien n'est retiré ni publié.
// deno-lint-ignore-file no-explicit-any
import { estQuestionEtat, etatDepuisSources, etatsDuJob } from "./etat-correspondance.js";

const TICKS = ["needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur"];
const NOMS: Record<string, string> = { vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", ebay: "eBay", opla: "Opla", depop: "Depop" };
const val = (x: any) => (x && typeof x === "object" && "v" in x ? x.v : x);
const dateParis = (iso: string | null | undefined) => {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" }) : null;
};

export async function trancherQuestions(supabase: any): Promise<Record<string, number>> {
  const n = { boutique: 0, etat: 0, vendu: 0, orphelin: 0 };
  const maintenant = new Date().toISOString();
  const { data: jobs, error } = await supabase.from("cross_post_jobs")
    .select("id, user_id, platform, action, status, inventaire_id, created_at, error, platform_fields")
    .eq("status", "needs_user")
    .in("platform_fields->>needs_user_source", ["boutique_a_choisir", "champ_a_choisir", "article_vendu"])
    .order("created_at", { ascending: true })
    .limit(400);
  if (error) throw new Error(error.message);
  const liste = (jobs ?? []) as any[];
  if (!liste.length) return n;

  const sansQuestion = (pf: Record<string, unknown>) => {
    const p = { ...pf };
    for (const k of ["needs_user_source", "needsUserField", "needsUserFields", ...TICKS]) delete p[k];
    return p;
  };

  // ── 1. boutique_a_choisir → la publication repart ──────────────────────────
  for (const j of liste.filter((x) => x.platform_fields?.needs_user_source === "boutique_a_choisir")) {
    const pf = sansQuestion(j.platform_fields ?? {});
    pf.boutique_a_choisir_levee = { le: maintenant, par: "handler-watch",
      motif: "la boutique se choisit seule : celle de l'article, sinon celle par défaut, sinon celle ouverte dans le navigateur" };
    const { data } = await supabase.from("cross_post_jobs").update({ status: "pending", error: null, platform_fields: pf })
      .eq("id", j.id).eq("status", "needs_user").select("id");
    if (data?.length) n.boutique++;
  }

  // ── 2. « État » : les sources fiables, dans la grille demandée ─────────────
  const etats = liste.filter((x) => x.platform_fields?.needs_user_source === "champ_a_choisir"
    && estQuestionEtat(x.platform_fields?.needsUserField) && Array.isArray(x.platform_fields?.needsUserField?.allowed_values)
    && x.platform_fields.needsUserField.allowed_values.length);
  if (etats.length) {
    const ids = [...new Set(etats.map((j) => j.inventaire_id).filter((x) => x != null))];
    const fiches = new Map<string, any>();
    const autres = new Map<string, any[]>();
    for (let i = 0; i < ids.length; i += 200) {
      const lot = ids.slice(i, i + 200);
      const { data: fs } = await supabase.from("inventaire").select("id, attributs").in("id", lot);
      for (const f of (fs ?? []) as any[]) fiches.set(String(f.id), f);
      const { data: js } = await supabase.from("cross_post_jobs").select("id, inventaire_id, platform, status, platform_fields")
        .in("inventaire_id", lot).in("status", ["published", "sold", "cancelled", "pending", "processing"]).limit(2000);
      for (const o of (js ?? []) as any[]) {
        const k = String(o.inventaire_id);
        if (!autres.has(k)) autres.set(k, []);
        autres.get(k)!.push(o);
      }
    }
    for (const j of etats) {
      const pf = { ...(j.platform_fields ?? {}) } as Record<string, any>;
      const nuf = pf.needsUserField as Record<string, any>;
      const sources: Array<{ source: string; valeur: unknown; plateforme?: string }> = [];
      sources.push({ source: "annonce", valeur: pf?.champs_lus_sur_l_annonce?.lus?.etat });
      sources.push({ source: "annonce", valeur: pf?.champs_repris_de_l_annonce?.repris?.etat });
      sources.push({ source: "fiche", valeur: val(fiches.get(String(j.inventaire_id))?.attributs?.etat) });
      for (const o of autres.get(String(j.inventaire_id)) ?? []) {
        if (o.id === j.id || o.platform === j.platform) continue;
        for (const v of etatsDuJob(o.platform_fields)) sources.push({ source: "autre_plateforme", valeur: v, plateforme: o.platform });
      }
      // La valeur du job lui-même, quand elle est une autre forme du même niveau.
      sources.push({ source: "job", valeur: pf.etat });
      const r = etatDepuisSources(sources, nuf.allowed_values);
      if (!r) continue;
      if (pf.etat_tranche_par_fillsell?.valeur === r.valeur) continue; // déjà répondu : la question est vraie
      const target = nuf.target && nuf.target.key ? nuf.target : { root: null, key: nuf.field_key };
      const np = sansQuestion(pf);
      np.needsUserAttempts = 0;
      if (target.root) np[target.root] = { ...(pf[target.root] ?? {}), [target.key]: r.valeur };
      else np[target.key] = r.valeur;
      // Le critère du formulaire suit (Leboncoin : lbcAspects.<field_key>).
      if (nuf.field_key && pf.lbcAspects && typeof pf.lbcAspects === "object") np.lbcAspects = { ...pf.lbcAspects, [nuf.field_key]: r.valeur };
      const cle = target.root ? `${target.root}.${target.key}` : String(target.key);
      np.needsUserResolved = { ...(pf.needsUserResolved ?? {}), [cle]: r.valeur };
      np.etat_tranche_par_fillsell = { le: maintenant, valeur: r.valeur, source: r.source, plateforme: r.plateforme, brut: r.brut, grille: nuf.allowed_values };
      const { data } = await supabase.from("cross_post_jobs").update({ status: "pending", error: null, platform_fields: np })
        .eq("id", j.id).eq("status", "needs_user").select("id");
      if (data?.length) n.etat++;
    }
  }

  // ── 3. Sans objet : l'article est VENDU (vente enregistrée) ────────────────
  const vendus = liste.filter((x) => x.platform_fields?.needs_user_source === "article_vendu" && x.inventaire_id != null
    && (x.action === "publish" || (x.action === "republish" && !x.platform_fields?.deleted_at
      && ["", "a_capturer", "captured"].includes(String(x.platform_fields?.republish_step ?? "")))));
  if (vendus.length) {
    const ids = [...new Set(vendus.map((j) => j.inventaire_id))];
    const { data: fs } = await supabase.from("inventaire").select("id, statut").in("id", ids);
    const statut = new Map(((fs ?? []) as any[]).map((f) => [String(f.id), f.statut]));
    const { data: vs } = await supabase.from("ventes").select("inventaire_id, vendu_le, date, created_at").in("inventaire_id", ids).limit(1000);
    const vente = new Map<string, any>();
    for (const v of (vs ?? []) as any[]) vente.set(String(v.inventaire_id), v);
    for (const j of vendus) {
      const v = vente.get(String(j.inventaire_id));
      if (statut.get(String(j.inventaire_id)) !== "vendu" || !v) continue; // une vente seulement « signalée » reste la question « Vendue ? »
      const quand = dateParis(v.vendu_le ?? v.date ?? v.created_at);
      const quoi = j.action === "republish" ? "cette republication" : "cette publication";
      const pf = sansQuestion(j.platform_fields ?? {});
      pf.sans_objet = { le: maintenant, motif: "article_vendu_vente_enregistree", par: "handler-watch" };
      const { data } = await supabase.from("cross_post_jobs").update({ status: "cancelled",
        error: `Article vendu${quand ? ` le ${quand}` : ""} : ${quoi} sur ${NOMS[j.platform] ?? j.platform} n'a plus d'objet. Rien n'a été retiré ni publié.`,
        platform_fields: pf }).eq("id", j.id).eq("status", "needs_user").select("id");
      if (data?.length) n.vendu++;
    }
  }

  // ── 3 bis. Republication orpheline (sa fiche n'existe plus) en question ────
  const { data: orphelins } = await supabase.from("cross_post_jobs").select("id, platform, platform_fields")
    .eq("status", "needs_user").eq("action", "republish").is("inventaire_id", null).limit(100);
  for (const j of (orphelins ?? []) as any[]) {
    if (j.platform_fields?.deleted_at || String(j.platform_fields?.republish_step ?? "") === "deleted") continue;
    const pf = sansQuestion(j.platform_fields ?? {});
    pf.sans_objet = { le: maintenant, motif: "republication_orpheline", par: "handler-watch" };
    const { data } = await supabase.from("cross_post_jobs").update({ status: "cancelled",
      error: "Cette republication ne correspond plus à aucun article de ton stock : elle est annulée. Rien n'a été retiré, ton annonce est intacte.",
      platform_fields: pf }).eq("id", j.id).eq("status", "needs_user").select("id");
    if (data?.length) n.orphelin++;
  }
  // ── 4. (15/10 soir, PAUGUES) Leboncoin EXIGE le poids pour ce compte ───────
  // Preuve : le formulaire a demandé « Poids du colis* » (obligatoire, aucune
  // estimation — formulaire PRO). Le compte est noté une fois
  // (platform_settings.leboncoin.poids_exige) : l'app demande alors le poids
  // AVANT l'envoi (lot et unité), get-pending-jobs ne sert plus une
  // publication sans poids. Jamais un poids inventé.
  const { data: preuvesPoids } = await supabase.from("cross_post_jobs")
    .select("id, user_id, error, platform_fields")
    .eq("platform", "leboncoin").eq("status", "needs_user")
    .in("platform_fields->needsUserField->>field_key", ["estimated_parcel_weight"])
    .order("created_at", { ascending: false }).limit(200);
  const comptesPoids = new Map<string, string>();
  for (const j of (preuvesPoids ?? []) as any[]) {
    if (/Poids du colis\*/.test(String(j.error ?? "")) || /\*$/.test(String(j.platform_fields?.needsUserField?.field_label ?? ""))) {
      if (!comptesPoids.has(String(j.user_id))) comptesPoids.set(String(j.user_id), String(j.id));
    }
  }
  if (comptesPoids.size) {
    const { data: profs } = await supabase.from("profiles").select("id, platform_settings").in("id", [...comptesPoids.keys()]);
    for (const p of (profs ?? []) as any[]) {
      if (p.platform_settings?.leboncoin?.poids_exige) continue;
      const { error: e } = await supabase.rpc("platform_settings_fusionner", {
        p_chemin: ["leboncoin"], p_patch: { poids_exige: { depuis: maintenant, preuve_job: comptesPoids.get(String(p.id)), pose_par: "handler-watch" } },
        p_supprimer: [], p_user: p.id,
      });
      if (!e) (n as Record<string, number>).poids_exige = ((n as Record<string, number>).poids_exige ?? 0) + 1;
    }
  }
  return n;
}
