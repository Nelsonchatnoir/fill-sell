// ============================================================================
// Désinscription des emails marketing — socle partagé.
//
// LE FILTRE VIT ICI, PAS CHEZ L'APPELANT.
// Toute fonction qui envoie un email passe par envoyerEmail() ci-dessous.
// Un appelant qui oublierait de vérifier quoi que ce soit obtient quand même
// le bon comportement : c'est le seul moyen de ne pas l'oublier « un jour ».
//
// CATÉGORIES (marqueur obligatoire sur chaque envoi)
//   'marketing' — relances, campagnes, annonces produit. FILTRÉ par la
//                 désinscription, et porte le lien de désinscription.
//   'support'   — réponse à une demande de l'utilisateur, sécurité, compte,
//                 facturation. JAMAIS filtré, pas de lien de désinscription :
//                 se désinscrire du marketing ne doit pas couper la réponse à
//                 sa propre question.
//
// Le défaut est 'marketing' : un envoi dont on a oublié de déclarer la
// catégorie est donc filtré, jamais envoyé à tort. On préfère un mail de
// support bloqué (visible, rattrapable) à un mail marketing parti chez
// quelqu'un qui a demandé à ne plus en recevoir (illégal, irrattrapable).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type CategorieEmail = "marketing" | "support";

/** Page publique de désinscription (route React, sans connexion). */
export const URL_DESINSCRIPTION = "https://fillsell.app/desinscription";

/**
 * Adresse sous sa forme canonique : minuscules, sans espaces.
 * Une adresse désinscrite l'est quelle que soit la casse utilisée à l'envoi.
 *
 * On NE retire PAS l'alias « +suffixe » : chez la plupart des fournisseurs
 * c'est une adresse distincte, et la retirer désinscrirait la boîte entière
 * sur le geste d'un seul alias.
 */
export function normaliserEmail(email: string): string {
  return String(email ?? "").trim().toLowerCase();
}

function admin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Jeton opaque de 32 octets, base64url. Ni l'adresse, ni un id devinable. */
function nouveauJeton(): string {
  const octets = new Uint8Array(32);
  crypto.getRandomValues(octets);
  return btoa(String.fromCharCode(...octets))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Jeton de cette adresse, créé à la volée s'il n'existe pas encore.
 * Poser la ligne ne désinscrit personne : `desinscrit` vaut false par défaut.
 */
export async function jetonDe(email: string): Promise<string> {
  const adresse = normaliserEmail(email);
  const db = admin();

  const { data } = await db
    .from("email_destinataires")
    .select("jeton")
    .eq("email", adresse)
    .maybeSingle();
  if (data?.jeton) return data.jeton;

  const jeton = nouveauJeton();
  const { error } = await db
    .from("email_destinataires")
    .insert({ email: adresse, jeton });

  // Course entre deux envois simultanés : l'autre a gagné, on relit le sien.
  if (error) {
    const { data: relu } = await db
      .from("email_destinataires")
      .select("jeton")
      .eq("email", adresse)
      .maybeSingle();
    if (relu?.jeton) return relu.jeton;
    throw error;
  }
  return jeton;
}

/** Lien de désinscription complet pour cette adresse. */
export async function lienDesinscription(email: string): Promise<string> {
  return `${URL_DESINSCRIPTION}?t=${encodeURIComponent(await jetonDe(email))}`;
}

/** TRUE si cette adresse a demandé à ne plus recevoir de marketing. */
export async function estDesinscrit(email: string): Promise<boolean> {
  const { data } = await admin()
    .from("email_destinataires")
    .select("desinscrit")
    .eq("email", normaliserEmail(email))
    .maybeSingle();
  return data?.desinscrit === true;
}

export interface EnvoiEmail {
  to: string;
  subject: string;
  html: string;
  /** Marqueur de catégorie. Défaut volontaire : 'marketing'. */
  categorie?: CategorieEmail;
  from?: string;
}

export interface ResultatEnvoi {
  to: string;
  categorie: CategorieEmail;
  envoye: boolean;
  /** 'desinscrit' quand l'envoi a été refusé par le garde-fou. */
  motif?: string;
  status?: number;
}

const FROM_DEFAUT = "FillSell <support@fillsell.app>";

/**
 * Envoi unique, garde-fou compris.
 *
 * Refuse d'envoyer un email 'marketing' à une adresse désinscrite — ce refus
 * n'est pas contournable par l'appelant, il n'y a pas d'option pour le lever.
 * Un email 'support' passe toujours.
 *
 * Si la vérification elle-même échoue (base injoignable), on NE POSTE PAS un
 * email marketing : en cas de doute, ne pas envoyer. Un 'support' part quand
 * même, il ne dépend pas de cette vérification.
 */
export async function envoyerEmail(envoi: EnvoiEmail): Promise<ResultatEnvoi> {
  const categorie: CategorieEmail = envoi.categorie ?? "marketing";
  const adresse = normaliserEmail(envoi.to);

  if (categorie === "marketing") {
    let bloque = true;
    try {
      bloque = await estDesinscrit(adresse);
    } catch (_e) {
      // Vérification impossible → on s'abstient.
      return {
        to: adresse,
        categorie,
        envoye: false,
        motif: "verification_impossible",
      };
    }
    if (bloque) {
      return { to: adresse, categorie, envoye: false, motif: "desinscrit" };
    }
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("Missing RESEND_API_KEY");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: envoi.from ?? FROM_DEFAUT,
      to: [adresse],
      subject: envoi.subject,
      html: envoi.html,
    }),
  });

  return {
    to: adresse,
    categorie,
    envoye: res.ok,
    status: res.status,
  };
}
