// L'API de conversions Meta — le branchement Deno (17/11/2026, ordre de Nico) de ./meta-capi-envoi.js : les secrets
// META_CAPI_TOKEN_<pixel> (jamais écrits ailleurs), usage_logs (traces, accord, « déjà envoyé »), le mail d'alerte à
// support@ et l'envoi en arrière-plan (EdgeRuntime.waitUntil) : un webhook de paiement ne l'attend jamais. Ne lève jamais.
// La porte d'envoi des mails (envoyerEmail de ./desinscription.ts, catégorie 'support') est PASSÉE par l'appelant, jamais
// importée ici : les bancs qui remplacent la porte d'envoi d'un module (alerte-essai-cloud) la remplacent aussi pour Meta.
// deno-lint-ignore-file no-explicit-any
import { conversionsMeta } from "./meta-capi-envoi.js";
import { ADRESSE_ALERTE, FEATURE_EVENEMENT, FEATURE_INSCRIPTION, FEATURES_SUIVIES } from "./meta-capi.js";

/** La porte d'envoi des mails (envoyerEmail de ./desinscription.ts). */
export type PorteEnvoi = (e: { to: string; subject: string; html: string; userId: null; type: string; categorie: "support"; dedup: "journal" }) => Promise<unknown>;

export function depsMeta(admin: any, envoyerEmail: PorteEnvoi) {
  return {
    lireJeton: (nom: string) => Deno.env.get(nom) ?? null,
    fetch: (url: string, init: RequestInit) => fetch(url, init),
    ecrireTrace: async ({ feature, userId, metadata }: { feature: string; userId: string | null; metadata: unknown }) => {
      const { error } = await admin.from("usage_logs").insert({ user_id: userId, feature, metadata });
      if (error) throw new Error(error.message);
    },
    lireTracesRecentes: async (n: number) => {
      const { data, error } = await admin.from("usage_logs").select("metadata").in("feature", FEATURES_SUIVIES as unknown as string[])
        .order("created_at", { ascending: false }).limit(n);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r: any) => r.metadata ?? {});
    },
    envoyerAlerte: async ({ sujet, html }: { sujet: string; html: string }) => {
      await envoyerEmail({ to: ADRESSE_ALERTE, subject: sujet, html, userId: null, type: "meta_capi_alerte", categorie: "support", dedup: "journal" });
    },
    lireCompte: async (userId: string) => {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error || !data?.user) return null;
      return { id: data.user.id as string, email: (data.user.email as string | null) ?? null };
    },
    lireAccord: async (userId: string) => {
      const { data } = await admin.from("usage_logs").select("metadata").eq("user_id", userId).eq("feature", FEATURE_INSCRIPTION)
        .order("created_at", { ascending: true }).limit(1);
      return data?.[0]?.metadata ?? null;
    },
    lireDejaEnvoyes: async (userId: string) => {
      const { data } = await admin.from("usage_logs").select("metadata").eq("user_id", userId).eq("feature", FEATURE_EVENEMENT).limit(50);
      return (data ?? []).map((r: any) => r.metadata?.nom).filter(Boolean);
    },
    journal: console,
    maintenant: () => Date.now(),
  };
}

/** Lance un travail sans le faire attendre (EdgeRuntime.waitUntil) ; sans runtime Supabase, il est attendu. */
export async function enArrierePlan(travail: Promise<unknown>): Promise<void> {
  const sur = travail.catch((e) => console.error("[meta-capi] erreur :", (e as Error)?.message ?? e));
  // @ts-ignore EdgeRuntime : fourni par le runtime Supabase.
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) { EdgeRuntime.waitUntil(sur); return; }
  await sur;
}

/** L'essai et le premier paiement chez Meta, en arrière-plan (jamais attendu par un paiement). */
export function conversionsMetaEnArrierePlan(
  admin: any,
  envoyerEmail: PorteEnvoi,
  p: { userId: string | null | undefined; canal: string | null | undefined; test?: boolean; demandes: Array<{ nom: string; montant: unknown }> },
): Promise<void> {
  if (!p.userId || !p.demandes?.length) return Promise.resolve();
  return enArrierePlan(conversionsMeta({ deps: depsMeta(admin, envoyerEmail), userId: p.userId, canal: p.canal ?? null, test: p.test === true, demandes: p.demandes }));
}
