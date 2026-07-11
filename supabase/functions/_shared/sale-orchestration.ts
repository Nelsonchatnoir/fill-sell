// Orchestration DB d'une VENTE détectée sur une plateforme (2026-07-11).
// Partagé entre update-job-status (appelé par l'extension quand son poll de
// détection voit l'annonce vendue) et check-listing-status v5 (même contrat,
// point d'entrée alternatif). Une seule implémentation, en une passe :
//   1. job published → sold (garde stricte : rien d'autre ne transitionne)
//   2. vente créée ALIGNÉE sur confirmSell (App.jsx) : mêmes champs, frais de
//      vente à 0 (décision produit 2026-07-11 : pas de barème par plateforme,
//      l'utilisateur peut corriger dans l'app)
//   3. inventaire → statut 'vendu' + prix_vente/margin/margin_pct (l'ancienne
//      version laissait l'article "en stock" avec une vente fantôme)
//   4. TOUS les jobs frères annulés — pending/processing compris (l'ancienne
//      version ne touchait que published : un frère encore en file partait
//      quand même à la publication après la vente) ; les frères déjà LIVE
//      (published + listing_url) reçoivent platform_fields.pending_removal
//      = true → le bandeau semi-auto de l'app propose leur retrait, le clic
//      utilisateur arme les jobs action='delete' (jamais automatique).
//   5. email de notification via email-tunnel (mode relance_emails, wrapper
//      standard) — best-effort, n'échoue jamais l'orchestration.
// Idempotent : un job déjà 'sold' retourne ok sans rien refaire (le poll de
// l'extension peut re-détecter la même vente avant d'avoir vu le nouveau
// statut).
// deno-lint-ignore-file no-explicit-any

export interface SaleOrchestration {
  ok: boolean;
  reason?: string;
  venteCreated: boolean;
  inventaireUpdated: boolean;
  siblingsCancelled: number;
  pendingRemoval: number;
  emailSent: boolean;
}

const PLATFORM_LABELS: Record<string, string> = {
  vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", ebay: "eBay", vestiaire: "Vestiaire",
};

export async function orchestrateSale(
  admin: any,
  userId: string,
  jobId: string,
): Promise<SaleOrchestration> {
  const none: SaleOrchestration = {
    ok: false, venteCreated: false, inventaireUpdated: false,
    siblingsCancelled: 0, pendingRemoval: 0, emailSent: false,
  };

  const { data: job, error: jobErr } = await admin
    .from("cross_post_jobs")
    .select("id, user_id, status, action, platform, inventaire_id, title, price, listing_url")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr) return { ...none, reason: jobErr.message };
  if (!job || job.user_id !== userId) return { ...none, reason: "Job introuvable" };
  if (job.action !== "publish") return { ...none, reason: "Un job delete ne peut pas être vendu" };
  if (job.status === "sold") return { ...none, ok: true, reason: "already_sold" };
  if (job.status !== "published") {
    return { ...none, reason: `Transition ${job.status} → sold refusée (seul published → sold est valide)` };
  }

  // ── 1. Job → sold ─────────────────────────────────────────────────────────
  const nowIso = new Date().toISOString();
  const { error: soldErr } = await admin
    .from("cross_post_jobs")
    .update({ status: "sold", sold_at: nowIso, last_checked_at: nowIso })
    .eq("id", job.id)
    .eq("status", "published"); // garde de course : un seul appelant gagne
  if (soldErr) return { ...none, reason: soldErr.message };

  // ── 2 + 3. Vente + inventaire (mêmes formules que confirmSell, App.jsx) ───
  let inv: any = null;
  if (job.inventaire_id != null) {
    const { data } = await admin
      .from("inventaire")
      .select("id, titre, prix_achat, purchase_costs, marque, type, description, emplacement, statut, quantite")
      .eq("id", job.inventaire_id)
      .maybeSingle();
    inv = data ?? null;
  }

  const prixVente = Number(job.price ?? 0);
  const prixAchat = Number(inv?.prix_achat ?? 0);
  const purchaseCosts = Number(inv?.purchase_costs ?? 0);
  const sellingFees = 0; // décision produit : 0, éditable ensuite dans l'app
  const benefice = prixVente - prixAchat - purchaseCosts - sellingFees;
  const marginPct = prixVente > 0 ? (benefice / prixVente) * 100 : 0;

  let venteCreated = false;
  // Dédup : la garde published→sold rend déjà l'orchestration unique par job,
  // ceci couvre le cas d'une vente déjà saisie À LA MAIN dans l'app.
  let alreadySold = false;
  if (job.inventaire_id != null) {
    const { data: existing } = await admin
      .from("ventes")
      .select("id")
      .eq("user_id", userId)
      .eq("inventaire_id", job.inventaire_id)
      .maybeSingle();
    alreadySold = !!existing || inv?.statut === "vendu";
  }
  if (!alreadySold) {
    const { error: venteErr } = await admin.from("ventes").insert({
      user_id: userId,
      inventaire_id: job.inventaire_id ?? null,
      titre: job.title ?? inv?.titre ?? null,
      prix_achat: prixAchat,
      prix_vente: prixVente,
      benefice,
      marque: inv?.marque ?? null,
      type: inv?.type ?? null,
      description: inv?.description ?? null,
      emplacement: inv?.emplacement ?? null,
      date: nowIso.slice(0, 10),
      plateforme: job.platform,
      quantite: 1,
      statut: "vendu",
    });
    if (venteErr) console.error(`[sale] Insert vente (job ${job.id}):`, venteErr.message);
    else venteCreated = true;
  }

  let inventaireUpdated = false;
  if (inv && inv.statut !== "vendu") {
    // Limite assumée : quantite > 1 passe quand même tout l'article en vendu
    // (les annonces cross-post sont des pièces uniques ; la vente partielle
    // reste un flux manuel confirmSell).
    const { error: invErr } = await admin
      .from("inventaire")
      .update({
        statut: "vendu",
        prix_vente: prixVente,
        margin: benefice,
        margin_pct: marginPct,
        selling_fees: sellingFees,
      })
      .eq("id", inv.id);
    if (invErr) console.error(`[sale] Update inventaire ${inv.id}:`, invErr.message);
    else inventaireUpdated = true;
  }

  // ── 4. Frères : annulation TOTALE + marquage des annonces encore live ─────
  let siblingsCancelled = 0;
  let pendingRemoval = 0;
  if (job.inventaire_id != null) {
    const { data: siblings } = await admin
      .from("cross_post_jobs")
      .select("id, status, listing_url, platform_fields")
      .eq("user_id", userId)
      .eq("inventaire_id", job.inventaire_id)
      .eq("action", "publish")
      .neq("id", job.id)
      .in("status", ["pending", "processing", "published"]);

    for (const sib of siblings ?? []) {
      const wasLive = sib.status === "published" && sib.listing_url;
      const patch: Record<string, unknown> = { status: "cancelled" };
      if (wasLive) {
        patch.platform_fields = { ...(sib.platform_fields ?? {}), pending_removal: true };
      }
      const { error: sibErr } = await admin.from("cross_post_jobs").update(patch).eq("id", sib.id);
      if (sibErr) { console.error(`[sale] Cancel sibling ${sib.id}:`, sibErr.message); continue; }
      siblingsCancelled++;
      if (wasLive) pendingRemoval++;
    }
  }

  // ── 5. Email (email-tunnel, mode relance_emails) — best-effort ────────────
  let emailSent = false;
  try {
    const cronSecret = Deno.env.get("CRON_SECRET");
    const { data: userData } = await admin.auth.admin.getUserById(userId);
    const email = userData?.user?.email;
    if (cronSecret && email) {
      const label = PLATFORM_LABELS[job.platform] ?? job.platform;
      const sign = benefice >= 0 ? "+" : "";
      const titre = job.title ?? inv?.titre ?? "Ton article";
      const removalLine = pendingRemoval > 0
        ? `\n\n${pendingRemoval} annonce${pendingRemoval > 1 ? "s" : ""} du même article ${pendingRemoval > 1 ? "sont" : "est"} encore en ligne sur d'autres plateformes — ouvre FillSell pour ${pendingRemoval > 1 ? "les" : "la"} retirer en un clic.`
        : "";
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/email-tunnel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": cronSecret },
        body: JSON.stringify({
          relance_emails: [{
            to: email,
            subject: `Vendu sur ${label} 🎉`,
            body_text: `« ${titre} » vient de se vendre sur ${label} : ${sign}${benefice.toFixed(0)}€ de bénéfice.${removalLine}`,
          }],
        }),
      });
      emailSent = res.ok;
      if (!res.ok) console.error("[sale] email-tunnel:", res.status, await res.text().catch(() => ""));
    }
  } catch (e) {
    console.error("[sale] email:", e instanceof Error ? e.message : String(e));
  }

  console.log(
    `[sale] job=${job.id} ${job.platform} → sold | vente=${venteCreated} inventaire=${inventaireUpdated} ` +
    `frères annulés=${siblingsCancelled} à retirer=${pendingRemoval} email=${emailSent}`
  );
  return { ok: true, venteCreated, inventaireUpdated, siblingsCancelled, pendingRemoval, emailSent };
}
