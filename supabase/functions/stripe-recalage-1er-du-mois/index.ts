import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { alerterPaiementNonCredite } from "../_shared/payment-notify.ts";

// ── stripe-recalage-1er-du-mois (2026-09-26) ─────────────────────────────────
// UNE action, UN client, UNE fois. XEWER (Pro) demande une facturation et un
// quota calés sur le 1er du mois. Décision Nico : au prorata, SANS calendrier
// d'abonnement Stripe, déclenché côté serveur le 01/10/2026 à 00:00 UTC avec
// la clé déjà présente dans les secrets.
//
// Appelée par pg_cron (« recalage-xewer-1er-oct », toutes les 5 min de 00:00 à
// 03:55 UTC le 01/10) via public.recalage_xewer_tick() — header x-cron-secret.
// La tâche se désinscrit elle-même dès que le journal dit « fait » (migration
// 20260926192110). ⛔ verify_jwt = false (config.toml), garde maison ci-dessous.
//
// CE QU'ELLE FAIT, dans cet ordre :
//  1. relit l'abonnement et S'ARRÊTE au moindre écart avec l'état relevé le
//     26/09 : client, prix Pro 29,99 €, quantité 1, période 18/09 → 18/10,
//     ni résiliation, ni calendrier, ni mise à jour en attente, ni réduction ;
//  2. vérifie sur l'aperçu Stripe que le montant qui partira est bien celui
//     simulé le 26/09 (12,40 €) — sinon, rien n'est facturé ;
//  3. recale le portefeuille AVANT Stripe : next_grant_at = 01/10 00:00 UTC,
//     grant_anchor_day = 1. C'est ce qui fait que l'invoice.paid qui suit
//     déclenche LA recharge du 01/10 (upgrade_monthly_grant : échéance
//     atteinte). Posé après, il arriverait trop tard : le webhook jugerait la
//     recharge « déjà faite » jusqu'au 18/10 ;
//  4. billing_cycle_anchor = now + create_prorations : Stripe facture tout de
//     suite 29,99 € moins les jours payés du 01/10 au 18/10 et ouvre la
//     période 01/10 → 01/11 ;
//  5. journalise la facture (montant, statut) dans recalage_abonnement_journal.
//
// EXACTEMENT UNE RECHARGE :
//  · invoice.paid (stripe-webhook v54) : échéance 01/10 atteinte → recharge ;
//    prochaine échéance = fin de période la PLUS TARDIVE de la facture = 01/11
//    (la ligne 0 est le crédit, qui s'arrête au 18/10 : d'où la v54) ;
//  · paiement en retard : le balayage de 04:15 recharge (filet, retard < 3 j),
//    prochaine échéance grant_next_due(ancre 1) = 01/11, et l'invoice.paid
//    tardif ne recrédite pas (échéance > maintenant + 2 jours) ;
//  · plus rien le 18/10 ; ensuite chaque 1er, par invoice.paid.
//
// ÉCHEC STRIPE : le portefeuille est remis tel qu'il était (18/10, ancre 18),
// sauf si la relecture prouve que l'ancrage a bien été remis. Hors fenêtre
// (avant le 01/10 00:00 ou dès 03:00 UTC) : aucune écriture, jamais.
// Clé d'idempotence fixe sur la mise à jour Stripe : deux déclenchements ne
// font jamais deux factures.
//
// Mode `simulation` ({"mode":"simulation"}) : mêmes gardes, l'aperçu Stripe,
// et AUCUNE écriture ailleurs que dans le journal.
//
// ⛔ À SUPPRIMER après le 01/10 (supabase functions delete) : une fois le
//    journal à « fait », elle ne fait plus rien.

const USER_ID = "de63ca45-63d9-4a3c-b65a-d1345acd8b2e"; // XEWER
const SUB = "sub_1UH2YCQZRA77vrWJiy855svF";
const CUS = "cus_VHblFLLBMQDKYu";
const PRIX_PRO = "price_1Tqfi8QZRA77vrWJa2D0mMLd"; // FillSell Pro Mensuel, 29,99 €
const DEBUT_PERIODE = 1789740844;  // 18/09/2026 14:14:04 UTC
const FIN_PERIODE = 1792332844;    // 18/10/2026 14:14:04 UTC
const ANCRE_CIBLE = 1790812800;    // 01/10/2026 00:00:00 UTC
const FIN_FENETRE = 1790823600;    // 01/10/2026 03:00:00 UTC — avant le balayage de 04:15
const ECHEANCE_AVANT = "2026-10-18T14:14:04Z";   // portefeuille relevé le 26/09
const ECHEANCE_1ER_OCT = "2026-10-01T00:00:00Z";
// Simulé le 26/09 : 29,99 € − 17,59 € de jours payés = 12,40 € à 00:00.
// Chaque heure de retard retire ~0,04 € au crédit : 12,52 € à 03:00.
const MONTANT_MIN = 1200;
const MONTANT_MAX = 1300;
const CLE_IDEMPOTENCE = "fillsell-recalage-xewer-1er-oct-2026";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const rep = (corps: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
function ecartsAbonnement(s: any): string[] {
  const e: string[] = [];
  const it = s?.items?.data ?? [];
  if (s?.id !== SUB) e.push(`id ${s?.id}`);
  if (s?.customer !== CUS) e.push(`client ${s?.customer}`);
  if (s?.status !== "active") e.push(`statut ${s?.status}`);
  if (s?.cancel_at_period_end || s?.cancel_at) e.push("résiliation programmée");
  if (s?.pending_update) e.push("mise à jour en attente");
  if (s?.schedule) e.push("calendrier attaché");
  if (s?.discount || (s?.discounts?.length ?? 0) > 0) e.push("réduction");
  if (it.length !== 1) e.push(`${it.length} lignes d'abonnement`);
  else {
    if (it[0]?.price?.id !== PRIX_PRO) e.push(`prix ${it[0]?.price?.id}`);
    if (it[0]?.quantity !== 1) e.push(`quantité ${it[0]?.quantity}`);
  }
  if (s?.current_period_start !== DEBUT_PERIODE) e.push(`début de période ${s?.current_period_start}`);
  if (s?.current_period_end !== FIN_PERIODE) e.push(`fin de période ${s?.current_period_end}`);
  return e;
}

// L'ancrage a-t-il déjà été remis (tentative précédente, réponse perdue) ?
// deno-lint-ignore no-explicit-any
const dejaRecale = (s: any) =>
  (s?.billing_cycle_anchor ?? 0) >= ANCRE_CIBLE && (s?.current_period_start ?? 0) >= ANCRE_CIBLE;

// deno-lint-ignore no-explicit-any
function resumeFacture(inv: any) {
  return {
    montant_facture: inv?.amount_due ?? null,
    montant_paye: inv?.amount_paid ?? null,
    facture_id: inv?.id ?? null,
    facture_statut: inv?.status ?? null,
    // deno-lint-ignore no-explicit-any
    lignes: (inv?.lines?.data ?? []).map((l: any) => ({
      montant: l?.amount, proration: l?.proration ?? null,
      debut: l?.period?.start, fin: l?.period?.end, description: l?.description,
    })),
  };
}

const euros = (c: number | null | undefined) => (c == null ? null : `${(c / 100).toFixed(2)} EUR`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (!expectedSecret || cronSecret !== expectedSecret) return rep({ error: "Unauthorized" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const corps = await req.json().catch(() => ({}));
  const mode: "simulation" | "execution" = corps?.mode === "execution" ? "execution" : "simulation";

  const journal = async (ligne: Record<string, unknown>) => {
    const { error } = await supabase.from("recalage_abonnement_journal")
      .insert({ user_id: USER_ID, subscription_id: SUB, mode, ...ligne });
    if (error) console.error(`[recalage] journal non écrit : ${error.message} —`, JSON.stringify(ligne));
  };
  const alerter = (erreur: string, montant: string | null = null, ref: string | null = null) =>
    alerterPaiementNonCredite({
      canal: "stripe", type: "abonnement", user_id: USER_ID, email: null,
      produit: "Recalage au 1er du mois — XEWER (sub_1UH2YCQZRA77vrWJiy855svF)",
      montant, ref, rpc: null, erreur,
    });

  try {
    // ── Fenêtre et « déjà traité » : AVANT toute lecture Stripe ───────────────
    if (mode === "execution") {
      const { data: fini } = await supabase.from("recalage_abonnement_journal")
        .select("id, statut").eq("mode", "execution").in("statut", ["fait", "deja_fait", "abandon"]).limit(1);
      if (fini?.length) return rep({ statut: "deja_traite", ligne: fini[0] });
      const maintenant = Math.floor(Date.now() / 1000);
      if (maintenant < ANCRE_CIBLE || maintenant >= FIN_FENETRE) {
        await journal({ statut: "hors_fenetre", detail: { maintenant } });
        return rep({ statut: "hors_fenetre", maintenant });
      }
    }

    // ── 1. L'abonnement tel qu'il est ─────────────────────────────────────────
    const s = await stripe.subscriptions.retrieve(SUB, { expand: ["latest_invoice"] });
    if (dejaRecale(s)) {
      const f = resumeFacture(s.latest_invoice);
      await journal({ statut: "deja_fait", ...f, detail: { billing_cycle_anchor: s.billing_cycle_anchor, lignes: f.lignes } });
      return rep({ statut: "deja_fait", ...f });
    }
    const ecarts = ecartsAbonnement(s);

    const { data: w } = await supabase.from("coin_wallets")
      .select("next_grant_at, grant_anchor_day").eq("user_id", USER_ID).maybeSingle();
    const echeance = Date.parse(w?.next_grant_at ?? "");
    const portefeuilleAvant = echeance === Date.parse(ECHEANCE_AVANT) && w?.grant_anchor_day === 18;
    // Tentative précédente interrompue entre le portefeuille et Stripe.
    const portefeuilleCale = echeance === Date.parse(ECHEANCE_1ER_OCT) && w?.grant_anchor_day === 1;
    if (!portefeuilleAvant && !portefeuilleCale) {
      ecarts.push(`portefeuille next_grant_at=${w?.next_grant_at} ancre=${w?.grant_anchor_day}`);
    }

    // ── 2. Le montant qui partira ─────────────────────────────────────────────
    const apercu = await stripe.invoices.retrieveUpcoming({
      customer: CUS,
      subscription: SUB,
      subscription_billing_cycle_anchor: "now",
      subscription_proration_behavior: "create_prorations",
      ...(mode === "simulation" ? { subscription_proration_date: ANCRE_CIBLE } : {}),
    });
    const montantPrevu = apercu.amount_due;
    if (montantPrevu < MONTANT_MIN || montantPrevu > MONTANT_MAX) {
      ecarts.push(`montant prévu ${montantPrevu} hors de [${MONTANT_MIN}, ${MONTANT_MAX}]`);
    }

    if (mode === "simulation") {
      const f = resumeFacture(apercu);
      await journal({ statut: ecarts.length ? "ecart" : "simule", montant_facture: montantPrevu,
        detail: { ecarts, portefeuille: w, lignes: f.lignes } });
      return rep({ statut: ecarts.length ? "ecart" : "simule", montant_prevu: montantPrevu, ecarts, portefeuille: w, lignes: f.lignes });
    }

    if (ecarts.length) {
      await journal({ statut: "abandon", montant_facture: montantPrevu, detail: { ecarts } });
      await alerter(`Recalage NON FAIT, rien n'a été facturé : ${ecarts.join(" · ")}`, euros(montantPrevu));
      return rep({ statut: "abandon", ecarts });
    }

    // ── 3. Le portefeuille, AVANT Stripe ──────────────────────────────────────
    if (portefeuilleAvant) {
      const { data: cale, error: caleErr } = await supabase.from("coin_wallets")
        .update({ next_grant_at: ECHEANCE_1ER_OCT, grant_anchor_day: 1, updated_at: new Date().toISOString() })
        .eq("user_id", USER_ID).eq("next_grant_at", ECHEANCE_AVANT)
        .select("next_grant_at, grant_anchor_day");
      if (caleErr || !cale?.length) {
        await journal({ statut: "erreur", detail: { etape: "portefeuille", message: caleErr?.message ?? "0 ligne" } });
        return rep({ statut: "erreur", etape: "portefeuille" }, 500);
      }
    }

    // ── 4. Stripe : ancrage remis maintenant, jours payés crédités ────────────
    // deno-lint-ignore no-explicit-any
    let apres: any;
    try {
      apres = await stripe.subscriptions.update(SUB, {
        billing_cycle_anchor: "now",
        proration_behavior: "create_prorations",
        expand: ["latest_invoice"],
      }, { idempotencyKey: CLE_IDEMPOTENCE });
    } catch (e) {
      const se = e as { code?: string; message?: string };
      // La mise à jour a-t-elle eu lieu malgré l'erreur (réponse perdue) ?
      // deno-lint-ignore no-explicit-any
      let relu: any = null;
      try { relu = await stripe.subscriptions.retrieve(SUB, { expand: ["latest_invoice"] }); } catch { /* relu reste null */ }
      if (relu && dejaRecale(relu)) {
        apres = relu;
      } else {
        // Rien n'a bougé chez Stripe : le portefeuille revient à son état du 26/09.
        const { error: remiseErr } = await supabase.from("coin_wallets")
          .update({ next_grant_at: ECHEANCE_AVANT, grant_anchor_day: 18, updated_at: new Date().toISOString() })
          .eq("user_id", USER_ID).eq("next_grant_at", ECHEANCE_1ER_OCT);
        await journal({ statut: "erreur", detail: { etape: "stripe", code: se?.code ?? null, message: se?.message ?? String(e),
          portefeuille_remis: !remiseErr, remise_erreur: remiseErr?.message ?? null } });
        await alerter(`Recalage : Stripe a refusé la mise à jour (${se?.code ?? "?"} — ${se?.message ?? e}). Rien n'a été facturé ; portefeuille remis au 18/10${remiseErr ? " — ÉCHEC DE LA REMISE : " + remiseErr.message : ""}. Nouvel essai au prochain passage (5 min), 6 au plus.`);
        return rep({ statut: "erreur", etape: "stripe", message: se?.message ?? String(e) }, 502);
      }
    }

    // ── 5. Journal ────────────────────────────────────────────────────────────
    const f = resumeFacture(apres.latest_invoice);
    await journal({
      statut: "fait", montant_facture: f.montant_facture, montant_paye: f.montant_paye,
      facture_id: f.facture_id, facture_statut: f.facture_statut,
      detail: { billing_cycle_anchor: apres.billing_cycle_anchor,
        periode: [apres.current_period_start, apres.current_period_end], lignes: f.lignes },
    });
    console.log(`[recalage] FAIT — facture ${f.facture_id} ${f.montant_facture} (payé ${f.montant_paye}, ${f.facture_statut}), période ${apres.current_period_start} → ${apres.current_period_end}`);
    // Une facture de changement d'abonnement non payée ne déclenche AUCUNE
    // alerte côté stripe-webhook (il la prend pour une montée de palier en
    // attente) : c'est ici qu'on prévient.
    if (f.facture_statut !== "paid") {
      await alerter(`Recalage fait, mais la facture ${f.facture_id} est « ${f.facture_statut} » (payé ${euros(f.montant_paye)}). Stripe relancera ; la recharge du 01/10 viendra du balayage de 04:15.`,
        euros(f.montant_facture), f.facture_id);
    }
    return rep({ statut: "fait", ...f });
  } catch (e) {
    const message = (e as Error)?.message ?? String(e);
    console.error(`[recalage] ${mode} : ${message}`);
    await journal({ statut: "erreur", detail: { etape: "inattendue", message } });
    return rep({ statut: "erreur", message }, 500);
  }
});
