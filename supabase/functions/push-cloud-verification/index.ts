import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { type Appareil, type ConfigApns, envoyerNote, lireConfigFcm } from "../_shared/push-envoi.ts";
import { aPrevenir, decisionMail, langueNotification, mailVerification, messageVerification, TYPE_MAIL_VERIFICATION } from "./message.js";
import { envoyerEmail } from "../_shared/desinscription.ts";
import { mailCloud } from "../_shared/emails-fillsell.ts";

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// PUSH-CLOUD-VERIFICATION — « UNE PLATEFORME DEMANDE UNE VÉRIFICATION » (21/11/2026, lot de Nico, point 5 — Muriel 0c97dc8b)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Règle de Nico : un captcha est le fonctionnement normal ; la cliente est prévenue — une notification, et un mail s'il n'y
// a aucun appareil ou si le push échoue — puis elle résout depuis l'app (« Résoudre la vérification »), ça repart.
// Muriel (21/11 11:19) : glissière Beebs, Beebs arrêté, aucun appareil push, AUCUN mot reçu.
// APPELANT : l'orchestrateur du Cloud (serveur-cloud/src/verifications.js, une fois par incident — le blocage porte
// cliente_prevenue_le), avec SA clé de service. (21/11/2026 15:46, premier redémarrage commun) Déployée d'abord en
// verify_jwt = true avec une garde « clé identique » : 401 sur l'appel de l'orchestrateur — sa clé de service n'est pas
// forcément le jeton JWT que porte l'environnement de la fonction. Désormais (règle du dépôt : appelant sans session =
// --no-verify-jwt + garde maison) : verify_jwt = false, et la garde accepte la clé de service sous ses deux formes — égale
// à SUPABASE_SERVICE_ROLE_KEY, ou PROUVÉE par un appel réservé au service (auth.admin) ; jamais une session, jamais l'anonyme.
// UNE FOIS PAR INCIDENT, AUSSI À TRAVERS LES REDÉMARRAGES : au redémarrage, l'orchestrateur rebloque les vérifications
// ouvertes et rappelait la fonction pour chacune. Une cliente déjà prévenue pour cette plateforme dans les 12 dernières
// heures (usage_logs cloud_verification_prevenue) ne l'est pas une seconde fois : réponse 200, { deja_prevenue: true }.
// Corps : { user_id, plateforme, etat, depuis?, apercu? }. apercu = true : rien n'est envoyé, la décision est rendue.
// Le mail est derrière l'interrupteur coin_config « cloud_verification_mail » (1 = envoyé ; absent/0 = coupé, la décision
// est journalisée) : AUCUN mail client sans l'ordre de Nico. Catégorie « support », comme les autres mails du Cloud.
// Secrets : ceux de push-ventes (APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY, APNS_TOPIC, FCM_SERVICE_ACCOUNT).
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

function configApns(): ConfigApns | null {
  const keyId = Deno.env.get("APNS_KEY_ID");
  const cleP8 = Deno.env.get("APNS_PRIVATE_KEY");
  if (!keyId || !cleP8) return null;
  return { keyId, cleP8, teamId: Deno.env.get("APNS_TEAM_ID") || "BQ379Y93X3", topic: Deno.env.get("APNS_TOPIC") || "app.fillsell.app" };
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEJA_PREVENUE_H = 12;

/** La clé de SERVICE (jamais une session de client, jamais la clé anonyme) : égale à celle de l'environnement, ou prouvée
 *  par un appel que seul le service peut faire. */
async function estCleDeService(jeton: string, service: string): Promise<boolean> {
  if (!jeton) return false;
  if (service && jeton === service) return true;
  try {
    const c = createClient(Deno.env.get("SUPABASE_URL")!, jeton, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await c.auth.admin.listUsers({ page: 1, perPage: 1 });
    return !error;
  } catch (_e) { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  // Seule la clé de service (l'orchestrateur) : jamais une session de client, jamais un appel public.
  const jeton = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!service || !(await estCleDeService(jeton, service))) return json({ error: "Non autorisé" }, 401);
  const corps = await req.json().catch(() => ({})) as Record<string, unknown>;
  const userId = String(corps.user_id ?? "");
  const plateforme = String(corps.plateforme ?? "");
  const etat = String(corps.etat ?? "");
  if (!UUID.test(userId) || !aPrevenir(plateforme, etat)) return json({ error: "Demande invalide", prevenir: false }, 400);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, service, { auth: { persistSession: false, autoRefreshToken: false } });

  const [{ data: appareils }, { data: profil }, { data: inter }] = await Promise.all([
    admin.from("appareils_push").select("id, plateforme, jeton, apns_env").eq("user_id", userId).limit(10),
    admin.from("profiles").select("lang").eq("id", userId).maybeSingle(),
    admin.from("coin_config").select("value").eq("key", "cloud_verification_mail").maybeSingle(),
  ]);
  const lang = langueNotification((profil as { lang?: string | null } | null)?.lang ?? "fr");
  const liste = ((appareils ?? []) as Appareil[]).filter((a) => a?.jeton);
  const interrupteur = (inter as { value?: unknown } | null)?.value ?? null;
  // Une fois par incident, même à travers un redémarrage de l'orchestrateur.
  const { data: deja } = await admin.from("usage_logs").select("created_at").eq("user_id", userId).eq("feature", "cloud_verification_prevenue")
    .eq("metadata->>plateforme", plateforme).gte("created_at", new Date(Date.now() - DEJA_PREVENUE_H * 3_600_000).toISOString()).limit(1);
  if ((deja ?? []).length && corps.apercu !== true) {
    console.log(`[push-cloud-verification] ${userId.slice(0, 8)} ${plateforme} : déjà prévenue le ${String((deja as { created_at: string }[])[0].created_at)} — rien n'est renvoyé`);
    return json({ deja_prevenue: true, user: userId.slice(0, 8), plateforme, etat });
  }
  if (corps.apercu === true) {
    return json({ apercu: true, appareils: liste.length, mail: decisionMail({ pushEnvoye: false, interrupteur }), lang });
  }

  // 1. Le push, à chaque appareil de la personne.
  let pushEnvoye = false;
  let pushMotif: string | null = liste.length ? null : "sans_appareil";
  if (liste.length) {
    try {
      const bilan = await envoyerNote(fetch, configApns(), lireConfigFcm(Deno.env.get("FCM_SERVICE_ACCOUNT")),
        { id: `verif-${userId.slice(0, 8)}-${plateforme}`, appareils: liste } as never, lang, Date.now(), messageVerification(plateforme, etat, lang));
      pushEnvoye = bilan.statut === "envoyee";
      pushMotif = pushEnvoye ? null : (bilan.motif ?? bilan.statut);
    } catch (e) { pushMotif = `exception: ${String((e as Error)?.message ?? e).slice(0, 80)}`; }
  }

  // 2. Le mail : seulement sans push reçu, et seulement si l'interrupteur le permet.
  const d = decisionMail({ pushEnvoye, interrupteur });
  let mail: { envoye: boolean; motif: string | null } = { envoye: false, motif: d.motif };
  if (d.envoyer) {
    try {
      const { data: u } = await admin.auth.admin.getUserById(userId);
      const email = u?.user?.email ?? null;
      if (!email) mail = { envoye: false, motif: "sans_adresse" };
      else {
        const t = mailVerification(plateforme, etat, lang);
        const m = mailCloud({ lang: t.lang as "fr" | "en", sujet: t.sujet, titre: t.titre, preheader: t.preheader, paragraphes: t.paragraphes, bouton: t.bouton, raisonEnvoi: t.raisonEnvoi });
        const r = await envoyerEmail({ to: email, subject: m.sujet, html: m.html, userId, type: TYPE_MAIL_VERIFICATION, categorie: "support", dedup: "journal" });
        mail = { envoye: Boolean(r.envoye), motif: r.envoye ? null : (r.motif ?? "non_envoye") };
      }
    } catch (e) { mail = { envoye: false, motif: `exception: ${String((e as Error)?.message ?? e).slice(0, 80)}` }; }
  }
  const rapport = { user: userId.slice(0, 8), plateforme, etat, appareils: liste.length, push: pushEnvoye, push_motif: pushMotif, mail: mail.envoye, mail_motif: mail.motif };
  // La trace (usage_logs) : ce qui a été dit à la personne, et par où.
  await admin.from("usage_logs").insert({ user_id: userId, feature: "cloud_verification_prevenue", metadata: { ...rapport, depuis: corps.depuis ?? null } }).then(() => {}, () => {});
  console.log(`[push-cloud-verification] ${JSON.stringify(rapport)}`);
  return json(rapport);
});
