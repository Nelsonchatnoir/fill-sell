// ═══════════════════════════════════════════════════════════════════════════
// ebay-account-deletion — Marketplace Account Deletion / Closure (06/09/2026)
//
// POURQUOI : depuis le 05/09 23:42, ebay_accounts persiste des données
// d'utilisateurs eBay (jetons, pseudo, état vendeur). L'exemption « I do not
// persist eBay data » du keyset PRD est donc fausse ; eBay exige alors qu'on
// soit ABONNÉ à ses notifications de suppression/clôture de compte et qu'on
// efface les données du vendeur concerné à réception.
//
// URL À RENSEIGNER chez eBay (Application Keys → Notifications → Marketplace
// Account Deletion → Notification Endpoint URL) :
//   https://tojihnuawsoohlolangc.supabase.co/functions/v1/ebay-account-deletion
// Verification token : secret Supabase EBAY_DELETION_VERIFICATION_TOKEN
// (32-80 caractères, alphanumériques, _ et - seulement — doc relue le 05/09).
//
// DEUX VERBES (doc « Marketplace User Account Deletion », relue dans Chrome) :
//   GET  ?challenge_code=… → 200, Content-Type application/json,
//        { "challengeResponse": hex(SHA-256(challengeCode + verificationToken
//        + endpoint)) } — DANS CET ORDRE, sinon la validation échoue. Corps
//        produit par JSON.stringify : jamais de BOM.
//   POST notification { metadata.topic: "MARKETPLACE_ACCOUNT_DELETION",
//        notification.data: { username, userId, eiasToken } } → acquitter
//        200 IMMÉDIATEMENT (200/201/202/204 acceptés), puis vérifier la
//        signature x-ebay-signature et effacer.
//
// GARDE-FOUS (Nico, 06/09) :
//   · la suppression ne touche QUE public.ebay_accounts. Ni profiles, ni
//     inventaire, ni cross_post_jobs, ni annonces : le compte FillSell reste
//     intact, seul le lien eBay disparaît ;
//   · 200 même si la ligne n'existe pas ou a déjà été effacée (eBay renvoie
//     sans fin une notification non acquittée, puis marque l'endpoint down) ;
//     seul un échec BASE rend 500 — pour qu'eBay réessaie et que la donnée
//     finisse par partir ;
//   · rapprochement par eiasToken (immuable, colonne ebay_eias_token — migration
//     20260905220811) PUIS par pseudo (ebay_user_id) : une ligne connectée
//     avant la colonne n'a que le pseudo, elle est couverte ;
//   · signature : verdict trois états (cf. _shared/ebay-notification.ts).
//     « invalide » = on n'efface pas (forgerie) ; « indéterminée » = on efface
//     quand même (fail-open : la conformité prime sur une reconnexion).
//
// verify_jwt = FALSE (config.toml) : c'est eBay qui appelle, sans JWT Supabase.
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { lireEnvEbay, lireIdentifiants } from "../_shared/ebay-oauth.ts";
import { verifierSignatureNotification } from "../_shared/ebay-notification.ts";

const ENDPOINT_DEFAUT = "https://tojihnuawsoohlolangc.supabase.co/functions/v1/ebay-account-deletion";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

async function sha256Hex(texte: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}

interface Notification {
  metadata?: { topic?: string; schemaVersion?: string; deprecated?: boolean };
  notification?: {
    notificationId?: string;
    eventDate?: string;
    publishAttemptCount?: number;
    data?: { username?: string; userId?: string; eiasToken?: string };
  };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ── GET : défi de validation de l'endpoint ────────────────────────────────
  if (req.method === "GET") {
    const challenge = url.searchParams.get("challenge_code");
    if (!challenge) return new Response("ebay-account-deletion : prêt (GET ?challenge_code=… / POST notification)", { status: 200 });
    const token = Deno.env.get("EBAY_DELETION_VERIFICATION_TOKEN")?.trim() ?? "";
    if (!token) {
      console.error("[ebay-account-deletion] EBAY_DELETION_VERIFICATION_TOKEN absent des secrets — défi impossible");
      return json({ error: "verification token non configuré" }, 503);
    }
    const endpoint = Deno.env.get("EBAY_DELETION_ENDPOINT")?.trim() || ENDPOINT_DEFAUT;
    // ORDRE IMPOSÉ par la doc : challengeCode + verificationToken + endpoint.
    const challengeResponse = await sha256Hex(challenge + token + endpoint);
    console.log(`[ebay-account-deletion] défi reçu (${challenge.length} car.) → réponse calculée pour ${endpoint}`);
    return json({ challengeResponse });
  }

  if (req.method !== "POST") return new Response("Méthode non autorisée", { status: 405 });

  // ── POST : notification ───────────────────────────────────────────────────
  const corpsBrut = new Uint8Array(await req.arrayBuffer());
  let notif: Notification = {};
  try { notif = JSON.parse(new TextDecoder().decode(corpsBrut)); } catch { notif = {}; }

  const topic = notif.metadata?.topic ?? "";
  const data = notif.notification?.data ?? {};
  const username = String(data.username ?? "").trim();
  const eias = String(data.eiasToken ?? "").trim();
  const userId = String(data.userId ?? "").trim();
  const notifId = String(notif.notification?.notificationId ?? "").slice(0, 60);

  if (topic !== "MARKETPLACE_ACCOUNT_DELETION") {
    console.warn(`[ebay-account-deletion] topic ignoré : "${topic}" (notif ${notifId || "?"})`);
    return json({ ok: true, ignore: true });
  }
  if (!username && !eias) {
    console.warn(`[ebay-account-deletion] notification sans username ni eiasToken (notif ${notifId || "?"}, userId ${userId ? "présent" : "absent"})`);
    return json({ ok: true, ignore: true });
  }

  // Signature — trois états, décidés AVANT d'effacer.
  const env = lireEnvEbay();
  const ids = lireIdentifiants();
  const verdict = await verifierSignatureNotification(corpsBrut, req.headers.get("x-ebay-signature"), env, ids.clientId, ids.clientSecret);
  if (verdict.verdict === "invalide") {
    console.error(`[ebay-account-deletion] SIGNATURE INVALIDE — rien effacé (notif ${notifId || "?"}, kid ${verdict.kid ?? "?"}, ${verdict.detail})`);
    return json({ ok: true, ignore: true });
  }
  if (verdict.verdict === "indeterminee") {
    console.warn(`[ebay-account-deletion] signature indéterminée (${verdict.detail}) — on efface quand même (fail-open)`);
  }

  // Suppression — UNIQUEMENT ebay_accounts. Rapprochement eiasToken puis pseudo.
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let effacees = 0;
  if (eias) {
    const { data: rows, error } = await admin.from("ebay_accounts").delete().eq("ebay_eias_token", eias).select("user_id");
    if (error) {
      // Colonne pas encore posée (migration 20260905220811) : on passe au pseudo.
      if (/ebay_eias_token/i.test(error.message)) console.warn("[ebay-account-deletion] colonne ebay_eias_token absente — rapprochement par pseudo seul");
      else { console.error(`[ebay-account-deletion] base (eias) : ${error.message}`); return json({ error: "base" }, 500); }
    } else {
      effacees += rows?.length ?? 0;
    }
  }
  if (username) {
    const { data: rows, error } = await admin.from("ebay_accounts").delete().eq("ebay_user_id", username).select("user_id");
    if (error) { console.error(`[ebay-account-deletion] base (pseudo) : ${error.message}`); return json({ error: "base" }, 500); }
    effacees += rows?.length ?? 0;
  }
  console.log(`[ebay-account-deletion] notif ${notifId || "?"} · signature ${verdict.verdict} · ${effacees} ligne(s) ebay_accounts effacée(s)`);
  return json({ ok: true, effacees });
});
