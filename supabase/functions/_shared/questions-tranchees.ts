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
//   5. (17/10) « Marque (Depop) » d'une publication : hors de la liste de
//      Depop → « Sans marque » (« Other »), jamais une autre marque
//      (_shared/marque-depop.js) ; une question « ambiguë » reste au
//      correctif d'extension.
//   6. (18/10, « zéro friction ») Leboncoin : un champ demandé que FillSell CONNAÎT
//      (valeur déjà sur le job, « Type d'article neuf » déjà répondu par le compte,
//      poids répondu « pour le lot ») est posé ; « Type d'article neuf » né d'un état
//      neuf DÉDUIT alors que l'état choisi ne l'est pas tombe. Une passe par job.
//   7. (18/10, décision de Nico — job 5d993767) Vinted « Le titre contient trop de
//      symboles d'affilée » : la question « Titre » est tranchée par le titre sans
//      ses symboles en trop (mots et marque gardés, _shared/titre-symboles-vinted.js),
//      rangé comme une réponse (titre_saisi) — la publication repart. Une passe par job.
// deno-lint-ignore-file no-explicit-any
import { estQuestionEtat, etatDepuisSources, etatsDuJob } from "./etat-correspondance.js";
import { reponseMarqueDepop, champsApresMarqueDepop, QUESTION_MARQUE_DEPOP } from "./marque-depop.js";
import { archiverErreur } from "./erreurs-archivees.js";
import { titreSymbolesATrancher } from "./titre-symboles-vinted.js";

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
    // (18/10) `title` : la règle 7 (titre Vinted, symboles en trop) part du titre du job.
    .select("id, user_id, platform, action, status, inventaire_id, created_at, error, title, platform_fields")
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
  // ── 5. (17/10, Nico) « Marque (Depop) » : jamais une question ─────────────
  // Les extensions ≤ 0.6.122 demandent la marque quand elle n'est pas dans la
  // liste de Depop (« Jules », « Bonobo », « Autres », « Short »…). La règle :
  // hors de la liste → « Sans marque » (« Other » chez Depop), jamais une autre
  // marque, jamais la fiche (_shared/marque-depop.js). Publications seulement ;
  // une question « Plusieurs marques Depop s'écrivent… » n'est jamais tranchée
  // ici. Une fois par job (marque_depop_tranchee), compare-and-swap sur needs_user.
  const { data: marquesDepop } = await supabase.from("cross_post_jobs")
    .select("id, platform, action, status, error, platform_fields")
    .eq("status", "needs_user").eq("platform", "depop").eq("action", "publish")
    .eq("platform_fields->needsUserField->>field_key", QUESTION_MARQUE_DEPOP)
    .order("created_at", { ascending: true }).limit(200);
  for (const j of (marquesDepop ?? []) as any[]) {
    const rep = reponseMarqueDepop(j);
    if (!rep) continue;
    const pf = champsApresMarqueDepop(j.platform_fields ?? {}, rep, maintenant, "handler-watch") as Record<string, any>;
    pf.erreurs_archivees = archiverErreur(pf.erreurs_archivees, j.error ?? null, "needs_user", "handler-watch (marque Depop hors de la liste : « Sans marque »)");
    const { data } = await supabase.from("cross_post_jobs").update({ status: "pending", error: null, platform_fields: pf })
      .eq("id", j.id).eq("status", "needs_user").select("id");
    if (data?.length) (n as Record<string, number>).marque_depop = ((n as Record<string, number>).marque_depop ?? 0) + 1;
  }
  // ── 6. (18/10, « zéro friction ») Leboncoin : les champs demandés que FillSell CONNAÎT ──
  // Cas du 18/10 (lecture : docs/enquetes/zero-friction-1810/RAPPORT.md § 5) :
  //   · « Type d'article neuf » déjà répondu par CE compte (lot 0ab1facf : les
  //     frères portent « Création / Artisanat ») — la mémoire du compte n'était
  //     posée que sur les jobs servis, jamais sur un job déjà arrêté ;
  //   · « Poids du colis » répondu « pour le lot » (poids_lbc_du_lot d'un frère
  //     du même lot) — un job à deux questions était écarté de ce geste ;
  //   · « Type d'article neuf » demandé parce que FillSell avait DÉDUIT un état
  //     neuf (lbc_deduit.etat) alors que l'état CHOISI ne l'est pas (b67c3bfb,
  //     « Très bon état ») : la question est sans objet, l'état déduit tombe et
  //     get-pending-jobs le recalcule depuis l'état choisi ;
  //   · la valeur est DÉJÀ sur le job (233e165d) : une seule reprise.
  // Jamais une valeur inventée : la liste de la question fait foi, un poids sans
  // source reste la question. Une fois par jeu de valeurs (champs_lbc_tranches),
  // compare-and-swap sur needs_user ; un champ qui reste = la question, réduite.
  const { data: lbcChamps } = await supabase.from("cross_post_jobs")
    .select("id, user_id, platform, action, status, error, inventaire_id, platform_fields")
    .eq("status", "needs_user").eq("platform", "leboncoin")
    .eq("platform_fields->>needs_user_source", "champ_a_choisir")
    // Une seule passe par job : un job déjà tranché n'est plus relu (CPU borné, toutes les 3 min).
    .is("platform_fields->champs_lbc_tranches", null)
    .order("created_at", { ascending: true }).limit(100);
  const candidats = ((lbcChamps ?? []) as any[]).filter((j) => champsDemandesLbc(j.platform_fields).length);
  if (candidats.length) {
    const comptes = [...new Set(candidats.map((j) => String(j.user_id)))];
    const memoireType = new Map<string, string>();
    const lots = [...new Set(candidats.map((j) => j.platform_fields?.lot_publication?.id).filter(Boolean).map(String))];
    const poidsDuLot = new Map<string, string>();
    for (const u of comptes) {
      const { data: passes } = await supabase.from("cross_post_jobs").select("platform_fields")
        .eq("user_id", u).eq("platform", "leboncoin").order("created_at", { ascending: false }).limit(200);
      for (const p of (passes ?? []) as any[]) {
        const t = String(p.platform_fields?.needsUserResolved?.["lbcAspects.new_item_type"] ?? "").trim();
        if (t) { memoireType.set(u, t); break; }
      }
    }
    for (const l of lots) {
      const { data: freres } = await supabase.from("cross_post_jobs").select("platform_fields")
        .eq("platform", "leboncoin").eq("platform_fields->lot_publication->>id", l).limit(300);
      for (const f of (freres ?? []) as any[]) {
        const pfF = f.platform_fields ?? {};
        if (!pfF.poids_lbc_du_lot) continue; // seule une réponse « pour le lot » vaut pour les autres
        const v = String(pfF.lbcAspects?.estimated_parcel_weight ?? pfF.needsUserResolved?.["lbcAspects.estimated_parcel_weight"] ?? "").trim();
        if (v) { poidsDuLot.set(l, v); break; }
      }
    }
    for (const j of candidats) {
      const pf = { ...(j.platform_fields ?? {}) } as Record<string, any>;
      const r = champsLbcConnus(pf, { typeDuCompte: memoireType.get(String(j.user_id)) ?? null,
        poidsDuLot: poidsDuLot.get(String(pf.lot_publication?.id ?? "")) ?? null });
      if (!r.connus.length && !r.sansObjet.length) continue;
      const empreinte = JSON.stringify({ connus: r.connus.map((c) => [c.key, c.valeur]), sansObjet: r.sansObjet });
      const np = { ...pf } as Record<string, any>;
      const aspects = { ...(pf.lbcAspects ?? {}) };
      const resolus = { ...(pf.needsUserResolved ?? {}) };
      for (const c of r.connus) { aspects[c.key] = c.valeur; resolus[`lbcAspects.${c.key}`] = c.valeur; }
      if (r.sansObjet.includes("new_item_type")) {
        delete aspects.condition; delete aspects.new_item_type;
        if (np.lbc_deduit && typeof np.lbc_deduit === "object") { np.lbc_deduit = { ...np.lbc_deduit }; delete np.lbc_deduit.etat; delete np.lbc_deduit.etat_precis; }
      }
      np.lbcAspects = aspects;
      np.needsUserResolved = resolus;
      np.champs_lbc_tranches = { le: maintenant, empreinte, connus: r.connus, sans_objet: r.sansObjet, par: "handler-watch" };
      np.erreurs_archivees = archiverErreur(np.erreurs_archivees, j.error ?? null, "needs_user", "handler-watch (champs Leboncoin que FillSell connaît)");
      let maj: Record<string, unknown>;
      if (!r.restants.length) {
        for (const k of ["needs_user_source", "needsUserField", "needsUserFields", ...TICKS]) delete np[k];
        np.needsUserAttempts = 0;
        maj = { status: "pending", error: null, platform_fields: np };
      } else {
        np.needsUserFields = r.restants;
        np.needsUserField = r.restants[0];
        maj = { platform_fields: np, error: messageChampsLbc(r.restants) };
      }
      const { data } = await supabase.from("cross_post_jobs").update(maj).eq("id", j.id).eq("status", "needs_user").select("id");
      if (data?.length) (n as Record<string, number>).champs_lbc = ((n as Record<string, number>).champs_lbc ?? 0) + 1;
    }
  }
  // ── 7. (18/10, décision de Nico) Vinted « trop de symboles » : FillSell corrige seul ──
  // Job 5d993767 : needs_user depuis le 15/10 sur « Le titre contient trop de
  // symboles d'affilée ». Le titre strict (symboles en trop retirés, mots et
  // marque gardés, emoji retirés comme l'extension le fait déjà) est rangé en
  // titre_saisi — titre_refuse GARDÉ : get-pending-jobs l'écrit sur le job au
  // service, comme une réponse de la personne. Jamais quand ce titre ne dit rien
  // de plus que ce que Vinted a reçu ; une seule passe (titre_symboles_assagi) :
  // un nouveau refus repose la question. Compare-and-swap sur needs_user.
  for (const j of liste) {
    const r = titreSymbolesATrancher(j, maintenant);
    if (!r) continue;
    const { data } = await supabase.from("cross_post_jobs").update({ status: "pending", error: null, platform_fields: r.platform_fields })
      .eq("id", j.id).eq("status", "needs_user").select("id");
    if (data?.length) (n as Record<string, number>).titre_symboles = ((n as Record<string, number>).titre_symboles ?? 0) + 1;
  }
  return n;
}

// ── Les règles pures du § 6 (testées : scripts/zero-friction-oranges-selftest.ts) ──
const normLbc = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
const ETAT_NEUF_RE = /^(neuf|etat neuf)/;
/** Les champs que la question demande (needsUserFields, sinon needsUserField). */
export function champsDemandesLbc(pf: any): Array<Record<string, any>> {
  const l = Array.isArray(pf?.needsUserFields) && pf.needsUserFields.length ? pf.needsUserFields : (pf?.needsUserField ? [pf.needsUserField] : []);
  return l.filter((f: any) => f && typeof f.field_key === "string" && f.field_key);
}
/** L'entrée exacte de la liste de la question pour une valeur connue, ou null. */
function dansLaListe(v: unknown, f: Record<string, any>): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const liste = Array.isArray(f.allowed_values) ? f.allowed_values.map(String) : [];
  if (!liste.length) return null; // sans liste, rien ne prouve que la valeur sera acceptée : la question
  return liste.find((x: string) => normLbc(x) === normLbc(s)) ?? null;
}
export function champsLbcConnus(pf: any, { typeDuCompte = null, poidsDuLot = null }: { typeDuCompte?: string | null; poidsDuLot?: string | null } = {}) {
  const connus: Array<{ key: string; valeur: string; source: string }> = [];
  const sansObjet: string[] = [];
  const restants: Array<Record<string, any>> = [];
  const aspects = pf?.lbcAspects ?? {};
  for (const f of champsDemandesLbc(pf)) {
    const key = f.field_key;
    if (key === "new_item_type") {
      const etatChoisi = normLbc(pf?.etat);
      const deduit = Boolean(pf?.lbc_deduit?.etat) && !pf?.needsUserResolved?.["lbcAspects.condition"];
      if (deduit && etatChoisi && !ETAT_NEUF_RE.test(etatChoisi)) { sansObjet.push(key); continue; }
    }
    let valeur = dansLaListe(aspects[key], f);
    let source = "job";
    if (!valeur && key === "new_item_type" && typeDuCompte) { valeur = dansLaListe(typeDuCompte, f); source = "reponse_du_compte"; }
    if (!valeur && key === "estimated_parcel_weight" && poidsDuLot) { valeur = dansLaListe(poidsDuLot, f); source = "poids_du_lot"; }
    if (valeur) connus.push({ key, valeur, source });
    else restants.push(f);
  }
  return { connus, sansObjet, restants };
}
/** Le message de la question réduite (même forme que l'extension, leboncoin.js). */
export function messageChampsLbc(restants: Array<Record<string, any>>): string {
  return restants.length > 1
    ? `Leboncoin demande ${restants.map((f) => `« ${f.field_label ?? f.field_key} »`).join(", ")} pour ton compte : choisis ces valeurs dans le Stock (un seul geste) et la publication repart.`
    : `Leboncoin demande « ${restants[0].field_label ?? restants[0].field_key} » pour ton compte, et FillSell ne le connaît pas. Choisis une valeur dans le Stock et la publication repart.`;
}
