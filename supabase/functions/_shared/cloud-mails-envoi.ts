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
import { ALERTE_CLOUD_DESTINATAIRE, envoyerAlertesCloud, texteAlerteCloud } from "./cloud-alerte-nico.js";

/**
 * (08/11, jour J) L'ENVOI DE TEST de l'alerte à Nico : le même texte, la même porte d'envoi, la même adresse que
 * l'alerte réelle — sans client, sans paiement, sans registre (rien écrit hors email_logs). Appelé par email-tunnel
 * { alerte_cloud_test: true } (x-cron-secret). Rend l'adresse et l'issue de l'envoi.
 */
export async function envoyerAlerteCloudTest(): Promise<{ to: string; envoye: boolean; motif?: string; sujet: string }> {
  const maintenant = Date.now();
  const t = texteAlerteCloud({
    evenement: "paiement", canal: "stripe", test: true, maintenant, userId: null, profil: null, cle: "test",
    faits: { contexte: "renouvellement", montant: { montant: 24.99, devise: "EUR" }, prochaineIso: new Date(maintenant + 30 * 86_400_000).toISOString() },
  })!;
  const r = await envoyerEmail({ to: ALERTE_CLOUD_DESTINATAIRE, subject: t.sujet, html: t.html, userId: null, type: "cloud_alerte_test", categorie: "support", dedup: "journal" });
  return { to: ALERTE_CLOUD_DESTINATAIRE, envoye: r.envoye === true, motif: (r as { motif?: string }).motif, sujet: t.sujet };
}

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
    /**
     * (12/11, lot « zéro problème », point 4a) La notification vient d'un ACHAT DE TEST (bac à sable Apple, testeur
     * Google, mode test Stripe — notificationDeTest de ./environnement-store.js). Aucun mail CLIENT, rien réservé pour
     * lui ; l'alerte à support@ part quand même, marquée « [TEST] ». Les droits ne dépendent pas de ce module.
     */
    test?: boolean;
  },
): Promise<Array<{ evenement: string; cle: string; resultat: string }>> {
  const prefixe = p.journal ?? "[cloud-mails]";
  if (!p.userId || !Array.isArray(p.evenements) || p.evenements.length === 0) return [];
  if (p.test === true) {
    // Le mail client n'est ni réservé ni envoyé ; l'alerte garde son registre (une seule par événement).
    const retenus = p.evenements.map((e) => ({ evenement: e.evenement, cle: e.cle, resultat: "retenu_achat_de_test" }));
    console.log(`${prefixe} mails Cloud RETENUS (achat de test) → user=${p.userId}`, JSON.stringify(retenus));
    await alertesNico(admin, p, prefixe);
    return retenus;
  }
  // (08/11, jour J) Le prix lu à la source UNE fois par événement : le mail client et l'alerte à Nico disent le même.
  const prixLus = new Map<string, Promise<{ montant: number; devise: string } | null>>();
  const lirePrixUneFois = p.lirePrix
    ? (evenement: string) => {
      if (!prixLus.has(evenement)) prixLus.set(evenement, Promise.resolve().then(() => p.lirePrix!(evenement)).catch(() => null));
      return prixLus.get(evenement)!;
    }
    : undefined;
  const bilanClient = await mailsClient(admin, { ...p, lirePrix: lirePrixUneFois }, prefixe);
  await alertesNico(admin, { ...p, lirePrix: lirePrixUneFois }, prefixe);
  return bilanClient;
}

// (08/11/2026, jour J, ajout de Nico) L'alerte à Nico (support@fillsell.app, l'adresse de l'alerte des IP en pause) à
// chaque événement d'argent du Cloud — même registre (clé « alerte: »), un mail par événement, jamais bloquante.
// Règles pures : ./cloud-alerte-nico.js. Les mails clients (mailsClient, ci-dessous) ne changent pas.
async function alertesNico(admin: any, p: Parameters<typeof mailsCloud>[1], prefixe: string): Promise<void> {
  try {
    const bilan = await envoyerAlertesCloud({
      evenements: p.evenements, userId: p.userId as string, canal: p.canal ?? null, test: p.test === true,
      deps: {
        lireProfil: async () => {
          const { data } = await admin.from("profiles").select("email, is_premium, is_pro, is_business, is_comped").eq("id", p.userId).maybeSingle();
          return data ? { ...data, email: (data.email as string | null) ?? p.email ?? null } : (p.email ? { email: p.email } : null);
        },
        reserver: async ({ userId, evenement, cle, canal }: { userId: string; evenement: string; cle: string; canal: string | null }) => {
          const { error } = await admin.from("cloud_mails").insert({ user_id: userId, evenement, cle, canal: canal ?? null });
          if (!error) return "pris";
          if ((error as { code?: string }).code === "23505") return "deja";
          console.error(`${prefixe} registre cloud_mails illisible pour l'alerte (${(error as { code?: string }).code ?? "?"}) : ${error.message} — aucune alerte`);
          return "erreur";
        },
        liberer: async ({ userId, evenement, cle }: { userId: string; evenement: string; cle: string }) => {
          await admin.from("cloud_mails").delete().eq("user_id", userId).eq("evenement", evenement).eq("cle", cle);
        },
        noter: async ({ userId, evenement, cle, detail }: { userId: string; evenement: string; cle: string; detail: unknown }) => {
          await admin.from("cloud_mails").update({ envoye_le: new Date().toISOString(), detail }).eq("user_id", userId).eq("evenement", evenement).eq("cle", cle);
        },
        lirePrix: p.lirePrix,
        // Adresse = la boîte de FillSell : user_id null (comme ops_paiement), c'est la colonne email qui dit à qui.
        envoyer: ({ to, subject, html, type }: { to: string; subject: string; html: string; type: string }) =>
          envoyerEmail({ to, subject, html, userId: null, type, categorie: "support", dedup: "journal" }),
      },
    });
    if (bilan.length) console.log(`${prefixe} alerte Cloud à Nico → user=${p.userId}`, JSON.stringify(bilan));
  } catch (e) {
    console.error(`${prefixe} alerte Cloud à Nico impossible : ${(e as Error)?.message ?? e}`);
  }
}

async function mailsClient(admin: any, p: Parameters<typeof mailsCloud>[1], prefixe: string): Promise<Array<{ evenement: string; cle: string; resultat: string }>> {
  try {
    let email = p.email ?? null;
    let lang = p.lang ?? null;
    if (!email) {
      const { data } = await admin.from("profiles").select("email, lang").eq("id", p.userId).maybeSingle();
      email = (data?.email as string | null) ?? null;
      lang = lang ?? (data?.lang as string | null) ?? null;
    }
    const bilan = await envoyerMailsCloud({
      evenements: p.evenements, userId: p.userId as string, email, lang: langue(lang), canal: p.canal ?? null,
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
