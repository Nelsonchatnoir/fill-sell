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

// priceOverride (2026-07-12) : prix de vente RÉEL, quand on le connaît mieux que
// le prix de publication. Deux sources, jamais devinées :
//   · l'utilisateur, via le champ éditable du bandeau de confirmation (couvre la
//     négociation : remise main propre marchandée, offre acceptée…) ;
//   · la plateforme, quand elle expose le prix réel (LBC : la page
//     mes-transactions affiche le montant encaissé — étape 2).
// Absent → on retombe sur job.price (prix de mise en ligne), qui reste la
// meilleure donnée disponible.
// ⚠️ Vinted : sa page d'annonce vendue n'expose PAS de prix de transaction
// distinct du prix demandé (vérifié : price/originalAskingAmount = prix
// demandé ; totalAmount = ce que paie l'ACHETEUR, frais de protection inclus —
// à ne surtout pas confondre avec la recette du vendeur). Une offre acceptée
// n'est pas exposée publiquement : le prix auto-confirmé peut donc être le prix
// demandé, l'utilisateur le corrige dans l'app si besoin.
export async function orchestrateSale(
  admin: any,
  userId: string,
  jobId: string,
  opts?: { priceOverride?: number },
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

  const override = Number(opts?.priceOverride);
  const prixVente = Number.isFinite(override) && override > 0 ? override : Number(job.price ?? 0);
  const prixAchat = Number(inv?.prix_achat ?? 0);
  const purchaseCosts = Number(inv?.purchase_costs ?? 0);
  const sellingFees = 0; // décision produit : 0, éditable ensuite dans l'app
  const benefice = prixVente - prixAchat - purchaseCosts - sellingFees;
  const marginPct = prixVente > 0 ? (benefice / prixVente) * 100 : 0;

  // ── 2 + 3. GATE ATOMIQUE anti-double-vente (2026-07-17) ───────────────────
  // Un article détecté hors ligne sur PLUSIEURS plateformes affiche un bandeau
  // « Vendue ? » PAR plateforme. Sans garde, deux confirmations concurrentes
  // (double-tap sur deux bandeaux du même article, ou deux appareils) lisaient
  // toutes deux « pas encore vendu » — ventes/inventaire non verrouillés, AUCUNE
  // contrainte d'unicité sur ventes.inventaire_id → DEUX ventes du même article,
  // CA/marge gonflés. Le flip conditionnel de l'inventaire est ATOMIQUE :
  // `UPDATE inventaire SET statut='vendu' WHERE statut<>'vendu'` ne matche qu'UNE
  // fois en concurrence. Seule l'orchestration qui GAGNE ce flip crée la vente et
  // envoie l'email ; les autres retombent proprement (idempotent, 0 double-vente).
  // (La garde published→sold par job ne suffisait pas : eBay et LBC sont des jobs
  //  DIFFÉRENTS, chacun passe sa propre garde.)
  let venteCreated = false;
  let inventaireUpdated = false;
  let wonSaleGate = true; // défaut : pas d'inventaire à verrouiller → best-effort (cas marginal)
  if (job.inventaire_id != null && inv) {
    // Limite assumée : quantite > 1 passe quand même tout l'article en vendu
    // (les annonces cross-post sont des pièces uniques ; la vente partielle
    // reste un flux manuel confirmSell, hors de cette orchestration).
    const { data: won, error: invErr } = await admin
      .from("inventaire")
      .update({
        statut: "vendu",
        prix_vente: prixVente,
        margin: benefice,
        margin_pct: marginPct,
        selling_fees: sellingFees,
      })
      .eq("id", inv.id)
      .neq("statut", "vendu")
      .select("id");
    if (invErr) console.error(`[sale] Update inventaire ${inv.id}:`, invErr.message);
    inventaireUpdated = (won?.length ?? 0) > 0;
    wonSaleGate = inventaireUpdated; // a flippé l'inventaire = a gagné le gate
  }

  // Vente créée UNIQUEMENT par l'orchestration gagnante (ou job sans inventaire lié).
  if (wonSaleGate) {
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
  // ⚠️ SEULEMENT si CETTE orchestration a créé la vente (gagné le gate atomique).
  // Une orchestration concurrente perdante (ou une re-détection d'un article déjà
  // vendu) ne doit pas renvoyer un 2e email « Vendu ! ».
  let emailSent = false;
  if (venteCreated) try {
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
