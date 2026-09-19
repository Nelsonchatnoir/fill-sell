// ============================================================================
// LA PORTE UNIQUE D'ENVOI — désinscription, journal, dédup.
//
// TOUT email sortant de FillSell passe par envoyerEmail(). Un appelant qui
// oublierait de vérifier quoi que ce soit obtient quand même le bon
// comportement : c'est le seul moyen de ne pas l'oublier « un jour ».
//
// CE QUE LA PORTE FAIT, ET QUE PERSONNE D'AUTRE NE FAIT PLUS (19/09/2026)
//   1. elle REFUSE un 'marketing' à qui s'est désinscrit — par n'importe lequel
//      des deux canaux, voir la fusion ci-dessous ;
//   2. elle ÉCRIT email_logs. Les appelants n'y touchent plus : avant ce lot,
//      email-tunnel, send-extension-link et cancel-subscription avaient chacun
//      leur propre logEmail(), et send-relance n'en avait aucun — ~45 mails
//      partis sans la moindre trace en base ;
//   3. elle journalise ses échecs d'écriture dans email_log_echecs, relu chaque
//      matin par l'ops-digest de 8h50 ;
//   4. elle pose l'en-tête List-Unsubscribe One-Click sur tout 'marketing'.
//
// LE CHAMP `type` EST OBLIGATOIRE, SANS DÉFAUT. Un envoi sans type ne compile
// pas. C'est voulu : un défaut (« autre », « divers ») produirait exactement le
// trou qu'on vient de boucher — des lignes email_logs qui ne disent rien.
//
// ── LA FUSION DES DEUX DÉSINSCRIPTIONS ──────────────────────────────────────
// Avant ce lot, deux registres s'ignoraient :
//   · email_logs type 'marketing_optout' — posé par le One-Click de Gmail
//     (email-tunnel ?unsub=<user_id>), lu par le tunnel et les blasts ;
//   · email_destinataires.desinscrit — posé par la page /desinscription, lu
//     par send-relance seul.
// Quelqu'un qui partait d'un côté restait destinataire de l'autre. Risque
// réglementaire, pas confort.
//
// Désormais : estDesinscrit() interroge LES DEUX, par adresse ET par user_id.
// Une seule des trois traces suffit à bloquer. Et desinscrire() ÉCRIT dans les
// deux, quel que soit le canal d'entrée — la ligne 'marketing_optout' est
// conservée (type inchangé, dédup historique intacte) comme trace d'audit.
// Résultat : une désinscription, quel que soit le canal, vaut pour tout.
//
// CATÉGORIES (marqueur obligatoire de fait, défaut volontaire 'marketing')
//   'marketing' — relances, campagnes, annonces produit. FILTRÉ par la
//                 désinscription, et porte le lien + l'en-tête de désinscription.
//   'support'   — réponse à une demande de l'utilisateur, sécurité, compte,
//                 facturation, alerte sur son propre travail. JAMAIS filtré,
//                 pas de lien de désinscription : se désinscrire du marketing
//                 ne doit pas couper la réponse à sa propre question.
// Le défaut est 'marketing' : un envoi dont on a oublié de déclarer la
// catégorie est donc filtré, jamais envoyé à tort. On préfère un mail de
// support bloqué (visible, rattrapable) à un mail marketing parti chez
// quelqu'un qui a demandé à ne plus en recevoir (illégal, irrattrapable).
// ============================================================================

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type CategorieEmail = "marketing" | "support";

/**
 * Comment la ligne email_logs est posée.
 *
 * 'reservation' — INSERT AVANT l'envoi. Un 23505 signifie « déjà servi » et
 *   l'envoi n'a pas lieu ; si Resend échoue, la réservation est retirée pour
 *   que la personne reste renvoyable. À réserver aux types couverts par un
 *   index d'unicité (email_logs_one_shot_unique, email_logs_payment_failed_unique)
 *   — sans index, il n'y a pas de 23505 et la réservation ne protège de rien.
 * 'journal'     — INSERT APRÈS un envoi réussi. Pour les types RÉCURRENTS
 *   (extension_link, resiliation_ar, job_pending_relaunch, alertes internes).
 */
export type ModeDedup = "reservation" | "journal";

/** Page publique de désinscription (route React, sans connexion). */
export const URL_DESINSCRIPTION = "https://fillsell.app/desinscription";

/** Type historique de la trace d'opt-out dans email_logs. ⛔ Ne pas renommer. */
export const TYPE_OPTOUT = "marketing_optout";

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

function admin(): SupabaseClient {
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
 *
 * `userId` est enregistré quand on le connaît : c'est lui qui rend possible la
 * reconnaissance d'un désinscrit qui a changé d'adresse entre-temps.
 */
export async function jetonDe(email: string, userId?: string | null): Promise<string> {
  const adresse = normaliserEmail(email);
  const db = admin();

  const { data } = await db
    .from("email_destinataires")
    .select("jeton, user_id")
    .eq("email", adresse)
    .maybeSingle();
  if (data?.jeton) {
    // Rattachement tardif : la ligne existait sans user_id (créée par un envoi
    // à une adresse qu'on ne savait pas encore relier à un compte).
    if (userId && !data.user_id) {
      await db.from("email_destinataires").update({ user_id: userId }).eq("email", adresse);
    }
    return data.jeton as string;
  }

  const jeton = nouveauJeton();
  const { error } = await db
    .from("email_destinataires")
    .insert({ email: adresse, jeton, user_id: userId ?? null });

  // Course entre deux envois simultanés : l'autre a gagné, on relit le sien.
  if (error) {
    const { data: relu } = await db
      .from("email_destinataires")
      .select("jeton")
      .eq("email", adresse)
      .maybeSingle();
    if (relu?.jeton) return relu.jeton as string;
    throw error;
  }
  return jeton;
}

/** Lien de désinscription complet pour cette adresse. */
export async function lienDesinscription(email: string, userId?: string | null): Promise<string> {
  return `${URL_DESINSCRIPTION}?t=${encodeURIComponent(await jetonDe(email, userId))}`;
}

/**
 * TRUE si cette personne a demandé à ne plus recevoir de marketing.
 *
 * TROIS sources, n'importe laquelle suffit (c'est la fusion) :
 *   a. email_destinataires.desinscrit, par ADRESSE ;
 *   b. email_destinataires.desinscrit, par USER_ID (l'adresse a pu changer) ;
 *   c. email_logs 'marketing_optout', par USER_ID — les opt-out One-Click
 *      historiques vivent là et nulle part ailleurs.
 */
export async function estDesinscrit(email: string, userId?: string | null): Promise<boolean> {
  const adresse = normaliserEmail(email);
  const db = admin();

  const { data: parAdresse, error: eA } = await db
    .from("email_destinataires")
    .select("desinscrit")
    .eq("email", adresse)
    .maybeSingle();
  if (eA) throw eA;
  if (parAdresse?.desinscrit === true) return true;

  if (userId) {
    const { data: parCompte, error: eB } = await db
      .from("email_destinataires")
      .select("desinscrit")
      .eq("user_id", userId)
      .eq("desinscrit", true)
      .limit(1);
    if (eB) throw eB;
    if ((parCompte ?? []).length > 0) return true;

    const { data: optoutLegacy, error: eC } = await db
      .from("email_logs")
      .select("id")
      .eq("user_id", userId)
      .eq("email_type", TYPE_OPTOUT)
      .limit(1);
    if (eC) throw eC;
    if ((optoutLegacy ?? []).length > 0) return true;
  }

  return false;
}

/**
 * Désinscrit (ou réinscrit) une personne, DANS LES DEUX REGISTRES.
 *
 * Appelée par les deux canaux — le One-Click de Gmail (email-tunnel ?unsub=)
 * et la page /desinscription — pour qu'ils produisent exactement le même état.
 * Jamais bloquante : une désinscription ne doit pas « échouer » côté client.
 */
export async function desinscrire(opts: {
  email: string;
  userId?: string | null;
  origine: string;
  reinscrire?: boolean;
}): Promise<{ ok: boolean; erreur?: string }> {
  const adresse = normaliserEmail(opts.email);
  if (!adresse) return { ok: false, erreur: "adresse_vide" };
  const reinscrire = opts.reinscrire === true;
  try {
    const db = admin();
    // 1. Registre canonique. jetonDe() crée la ligne si elle manque.
    await jetonDe(adresse, opts.userId ?? null);
    const maj = reinscrire
      ? { desinscrit: false, reinscrit_le: new Date().toISOString() }
      : { desinscrit: true, desinscrit_le: new Date().toISOString(), origine: opts.origine };
    const { error } = await db.from("email_destinataires").update(maj).eq("email", adresse);
    if (error) return { ok: false, erreur: error.message };

    // 2. Trace d'audit dans email_logs, pour que les lecteurs historiques
    //    (blasts) voient la même chose. Type RÉCURRENT : plusieurs clics =
    //    plusieurs lignes, c'est légitime, et il n'est SURTOUT PAS dans
    //    l'index one-shot. Une réinscription ne retire rien : on n'efface
    //    jamais une trace d'opt-out, estDesinscrit() lit le registre canonique
    //    en premier et c'est lui qui fait foi… sauf que la ligne legacy
    //    bloquerait à jamais. On la retire donc, et seulement dans ce sens.
    if (opts.userId) {
      if (reinscrire) {
        await db.from("email_logs").delete()
          .eq("user_id", opts.userId).eq("email_type", TYPE_OPTOUT);
      } else {
        const { error: eLog } = await db.from("email_logs")
          .insert({ user_id: opts.userId, email_type: TYPE_OPTOUT, email: adresse });
        // Colonne `email` pas encore posée (migration non appliquée) : on
        // réessaie sans elle. La trace compte plus que sa forme.
        if (eLog && estColonneAbsente(eLog)) {
          await db.from("email_logs")
            .insert({ user_id: opts.userId, email_type: TYPE_OPTOUT });
        }
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: String(e) };
  }
}

// ---------------------------------------------------------------------------
// Journal des envois
// ---------------------------------------------------------------------------

/** PostgREST / Postgres : « cette colonne n'existe pas ». */
function estColonneAbsente(err: { code?: string; message?: string }): boolean {
  const code = String(err?.code ?? "");
  if (code === "42703" || code === "PGRST204") return true;
  return /column .* does not exist|could not find the '.*' column/i.test(String(err?.message ?? ""));
}

/**
 * Une ligne email_logs. Rend l'erreur PostgREST éventuelle, jamais une
 * exception : le mail est déjà parti quand on écrit, re-jeter provoquerait un
 * renvoi.
 *
 * La colonne `email` n'existe qu'à partir de la migration 20260919170000. Tant
 * qu'elle n'est pas appliquée, l'insert repart sans elle — le code est donc
 * sûr AVANT comme APRÈS, et la migration peut être validée quand Nico veut.
 */
async function poserLigneLog(
  db: SupabaseClient,
  ligne: { user_id: string | null; email_type: string; email: string },
): Promise<{ code?: string; message: string } | null> {
  const { error } = await db.from("email_logs").insert(ligne);
  if (!error) return null;
  if (estColonneAbsente(error)) {
    const { user_id, email_type } = ligne;
    const { error: e2 } = await db.from("email_logs").insert({ user_id, email_type });
    return e2 ? { code: (e2 as { code?: string }).code, message: e2.message } : null;
  }
  return { code: (error as { code?: string }).code, message: error.message };
}

/**
 * Journal des échecs d'écriture — le SEUL canal avec un lecteur quotidien
 * (ops-digest de 8h50). Son propre échec ne fait que du console.error : jamais
 * de throw, jamais de renvoi.
 */
async function journaliserEchec(
  db: SupabaseClient,
  d: { user_id: string | null; email_type: string; email: string; code?: string; erreur: string },
): Promise<void> {
  console.error("email_logs_insert_echec", JSON.stringify(d));
  const { error } = await db.from("email_log_echecs").insert({
    user_id: d.user_id, email_type: d.email_type, email: d.email,
    code: d.code ?? null, erreur: d.erreur,
  });
  if (error && estColonneAbsente(error)) {
    const { error: e2 } = await db.from("email_log_echecs").insert({
      user_id: d.user_id, email_type: d.email_type, code: d.code ?? null, erreur: d.erreur,
    });
    if (e2) console.error("email_log_echecs_insert_echec", e2.message);
    return;
  }
  if (error) console.error("email_log_echecs_insert_echec", error.message);
}

// ---------------------------------------------------------------------------
// Envoi
// ---------------------------------------------------------------------------

export interface EnvoiEmail {
  to: string;
  subject: string;
  html: string;
  /** Type d'email_logs. OBLIGATOIRE, sans défaut. */
  type: string;
  /** Compte concerné. null pour une adresse sans compte (la ligne le dira). */
  userId?: string | null;
  /** Marqueur de catégorie. Défaut volontaire : 'marketing'. */
  categorie?: CategorieEmail;
  /** Voir ModeDedup. Défaut : 'journal'. */
  dedup?: ModeDedup;
  /** En-têtes SMTP additionnels. List-Unsubscribe est posé automatiquement. */
  headers?: Record<string, string>;
  from?: string;
}

export interface ResultatEnvoi {
  to: string;
  type: string;
  categorie: CategorieEmail;
  envoye: boolean;
  /**
   * 'desinscrit' | 'verification_impossible' | 'deja_envoye' |
   * 'reservation_illisible' | 'resend_echec' | 'sans_cle'
   */
  motif?: string;
  status?: number;
  /** Détail brut rendu par Resend — pour le diagnostic, jamais pour l'utilisateur. */
  resend?: unknown;
  /** L'écriture email_logs a-t-elle abouti ? */
  journalise?: boolean;
}

const FROM_DEFAUT = "FillSell <support@fillsell.app>";
const RESEND_API = "https://api.resend.com/emails";

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
  const type = String(envoi.type ?? "").trim();
  const userId = envoi.userId ?? null;
  const dedup: ModeDedup = envoi.dedup ?? "journal";
  const base = { to: adresse, type, categorie };

  if (!type) {
    // Défensif : TypeScript l'interdit déjà, mais un appelant en JS ou un
    // `as any` passerait au travers — et une ligne email_logs sans type ne
    // vaut rien.
    throw new Error("envoyerEmail: `type` est obligatoire");
  }

  if (categorie === "marketing") {
    let bloque = true;
    try {
      bloque = await estDesinscrit(adresse, userId);
    } catch (_e) {
      // Vérification impossible → on s'abstient.
      return { ...base, envoye: false, motif: "verification_impossible" };
    }
    if (bloque) return { ...base, envoye: false, motif: "desinscrit" };
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.error("envoyer_email_sans_cle", type);
    return { ...base, envoye: false, motif: "sans_cle" };
  }

  const db = admin();

  // ── RÉSERVATION AVANT ENVOI ───────────────────────────────────────────────
  // 23505 = quelqu'un (ou un run précédent) a déjà servi ce type à ce compte.
  // Toute AUTRE erreur : on n'envoie pas non plus — sans réservation lisible,
  // impossible d'arbitrer un doublon, et un doublon marketing ne se rattrape
  // pas. L'échec part dans email_log_echecs, lu au digest du lendemain.
  if (dedup === "reservation") {
    const err = await poserLigneLog(db, { user_id: userId, email_type: type, email: adresse });
    if (err) {
      if (err.code === "23505") return { ...base, envoye: false, motif: "deja_envoye" };
      await journaliserEchec(db, {
        user_id: userId, email_type: type, email: adresse,
        code: err.code, erreur: `reservation: ${err.message}`,
      });
      return { ...base, envoye: false, motif: "reservation_illisible" };
    }
  }

  // ── En-têtes de désabonnement (RFC 8058, One-Click) ───────────────────────
  // Posés par la PORTE, sur tout 'marketing' : c'est la seule façon qu'ils ne
  // manquent jamais. La cible est l'endpoint historique email-tunnel?unsub=,
  // que Gmail connaît déjà et qui écrit désormais les DEUX registres.
  const enTetes: Record<string, string> = { ...(envoi.headers ?? {}) };
  if (categorie === "marketing" && userId) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    enTetes["List-Unsubscribe"] =
      `<${supabaseUrl}/functions/v1/email-tunnel?unsub=${userId}>, ` +
      `<mailto:support@fillsell.app?subject=STOP>`;
    enTetes["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  let ok = false;
  let status = 0;
  let detail: unknown = null;
  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: envoi.from ?? FROM_DEFAUT,
        to: [adresse],
        subject: envoi.subject,
        html: envoi.html,
        ...(Object.keys(enTetes).length > 0 ? { headers: enTetes } : {}),
      }),
    });
    status = res.status;
    const brutReponse = await res.text();
    try { detail = JSON.parse(brutReponse); } catch { detail = brutReponse; }
    ok = res.ok;
    if (!ok) console.error("resend_echec", JSON.stringify({ to: adresse, type, http: status, detail }));
  } catch (e) {
    console.error("resend_exception", adresse, type, String(e));
    detail = { erreur: String(e) };
  }

  if (!ok) {
    // Rien n'est parti : on RELÂCHE la réservation, la personne reste
    // renvoyable au prochain passage.
    // Sûr parce que 'reservation' n'est utilisé QUE sur des types couverts par
    // un index d'unicité : il y a exactement une ligne (user_id, type), celle
    // qu'on vient de poser. Sur un type non indexé, ce delete effacerait de
    // l'historique — d'où l'interdiction, en tête de fichier.
    if (dedup === "reservation") {
      const suppression = db.from("email_logs").delete().eq("email_type", type);
      await (userId ? suppression.eq("user_id", userId) : suppression.is("user_id", null));
    }
    return { ...base, envoye: false, motif: "resend_echec", status, resend: detail };
  }

  // ── JOURNAL APRÈS ENVOI ───────────────────────────────────────────────────
  let journalise = dedup === "reservation";
  if (dedup === "journal") {
    const err = await poserLigneLog(db, { user_id: userId, email_type: type, email: adresse });
    if (err) {
      await journaliserEchec(db, {
        user_id: userId, email_type: type, email: adresse,
        code: err.code, erreur: err.message,
      });
    } else {
      journalise = true;
    }
  }

  return { ...base, envoye: true, status, resend: detail, journalise };
}
