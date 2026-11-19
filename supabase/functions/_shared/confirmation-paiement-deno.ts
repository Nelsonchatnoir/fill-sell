// Le branchement Deno de ./confirmation-paiement.js (19/11/2026, ordre de Nico : un paiement réel = une confirmation) :
// la clé du paiement réservée dans public.cloud_mails (événement « paiement », clé « confirmation:<canal>:<numéro> » —
// insertion unique : une seule confirmation par paiement, quel que soit le nombre d'appels), puis l'alerte « Paiement
// reçu » (email-tunnel payment_alert, qui porte aussi l'événement Meta au montant payé). Ne lève jamais.
// deno-lint-ignore-file no-explicit-any
import { confirmerPaiement, decisionConfirmation } from "./confirmation-paiement.js";
import { type AlertePaiement, notifierPaiement } from "./payment-notify.ts";

export { decisionConfirmation };

export async function confirmerPaiementServeur(
  admin: any,
  p: {
    decision: { confirmer: boolean; voie: string | null; raison: string };
    canal: "apple" | "google" | "stripe";
    /** Le numéro du paiement chez le canal : commande Google (GPA.…), transaction Apple, facture Stripe. */
    paiement: string | null | undefined;
    userId: string;
    alerte: Omit<AlertePaiement, "ok">;
    journal: string;
  },
): Promise<string> {
  try {
    const issue = await confirmerPaiement({
      decision: p.decision, canal: p.canal, paiement: p.paiement ?? null, alerte: p.alerte,
      deps: {
        reserver: async ({ cle }: { cle: string }) => {
          const { error } = await admin.from("cloud_mails").insert({ user_id: p.userId, evenement: "paiement", cle, canal: p.canal });
          if (!error) return "pris";
          if ((error as { code?: string }).code === "23505") return "deja";
          console.error(`${p.journal} registre des confirmations illisible (${(error as { code?: string }).code ?? "?"}) : ${error.message}`);
          return "erreur";
        },
        notifier: (a: Omit<AlertePaiement, "ok">) => notifierPaiement(a),
        journal: (t: string) => console.log(`${p.journal} ${t}`),
      },
    });
    console.log(`${p.journal} confirmation de paiement ${p.canal} ${p.paiement ?? "?"} : ${issue} (${p.decision.raison})`);
    return issue;
  } catch (e) {
    console.error(`${p.journal} confirmation de paiement impossible : ${(e as Error)?.message ?? e}`);
    return "erreur";
  }
}
