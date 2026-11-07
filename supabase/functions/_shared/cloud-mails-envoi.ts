// Les mails FillSell Cloud d'un événement de paiement — le branchement Deno (08/11/2026) des règles pures de
// ./cloud-mails.js : le registre public.cloud_mails (une clé par événement, réservée AVANT l'envoi — migration
// 20261108090000), la porte d'envoi unique (envoyerEmail, catégorie 'support', information de facturation) et la mise en
// page (mailCloud). Appelé par stripe-webhook, cancel-subscription, apple-iap-webhook et google-play-webhook APRÈS
// l'écriture du profil. Ne lève jamais : un mail ne bloque ni ne fait rejouer un paiement. Registre absent ou illisible
// (migration pas encore appliquée) = aucun mail, journalisé.
// deno-lint-ignore-file no-explicit-any
import { envoyerEmail } from "./desinscription.ts";
import { langue, mailCloud } from "./emails-fillsell.ts";
import { CATEGORIE_MAILS_CLOUD, envoyerMailsCloud } from "./cloud-mails.js";

export type EvenementCloud = { evenement: string; cle: string; canal?: string | null; faits?: Record<string, unknown> };

export async function mailsCloud(
  admin: any,
  p: {
    userId: string | null | undefined;
    email?: string | null;
    lang?: string | null;
    canal?: string | null;
    evenements: EvenementCloud[];
    /** essai_debut : le prix de la prochaine échéance, lu à la source (null → aucun montant). */
    lirePrix?: (evenement: string) => Promise<{ montant: number; devise: string } | null>;
    journal?: string;
  },
): Promise<Array<{ evenement: string; cle: string; resultat: string }>> {
  const prefixe = p.journal ?? "[cloud-mails]";
  if (!p.userId || !Array.isArray(p.evenements) || p.evenements.length === 0) return [];
  try {
    let email = p.email ?? null;
    let lang = p.lang ?? null;
    if (!email) {
      const { data } = await admin.from("profiles").select("email, lang").eq("id", p.userId).maybeSingle();
      email = (data?.email as string | null) ?? null;
      lang = lang ?? (data?.lang as string | null) ?? null;
    }
    const bilan = await envoyerMailsCloud({
      evenements: p.evenements, userId: p.userId, email, lang: langue(lang), canal: p.canal ?? null,
      deps: {
        reserver: async ({ userId, evenement, cle, canal }: { userId: string; evenement: string; cle: string; canal: string | null }) => {
          const { error } = await admin.from("cloud_mails").insert({ user_id: userId, evenement, cle, canal: canal ?? null });
          if (!error) return "pris";
          if ((error as { code?: string }).code === "23505") return "deja";
          console.error(`${prefixe} registre cloud_mails illisible (${(error as { code?: string }).code ?? "?"}) : ${error.message} — aucun mail`);
          return "erreur";
        },
        liberer: async ({ userId, evenement, cle }: { userId: string; evenement: string; cle: string }) => {
          await admin.from("cloud_mails").delete().eq("user_id", userId).eq("evenement", evenement).eq("cle", cle);
        },
        noter: async ({ userId, evenement, cle, detail }: { userId: string; evenement: string; cle: string; detail: unknown }) => {
          await admin.from("cloud_mails").update({ envoye_le: new Date().toISOString(), detail }).eq("user_id", userId).eq("evenement", evenement).eq("cle", cle);
        },
        lirePrix: p.lirePrix,
        rendre: (t: any) => mailCloud(t),
        envoyer: ({ to, subject, html, userId, type }: { to: string; subject: string; html: string; userId: string; type: string }) =>
          envoyerEmail({ to, subject, html, userId, type, categorie: CATEGORIE_MAILS_CLOUD as "support", dedup: "journal" }),
      },
    });
    console.log(`${prefixe} mails Cloud → user=${p.userId}`, JSON.stringify(bilan));
    return bilan;
  } catch (e) {
    console.error(`${prefixe} mails Cloud impossibles : ${(e as Error)?.message ?? e}`);
    return [];
  }
}
