// ═══════════════════════════════════════════════════════════════════════════
// expirations-secrets (12/11/2026, après la panne « Se connecter avec Apple » du web)
// ═══════════════════════════════════════════════════════════════════════════
// Chaque jour (pg_cron `expirations-secrets-jour`, x-cron-secret ; verify_jwt = false) :
//   1. le secret client « Sign in with Apple » du web : s'il a plus de 30 jours, un neuf de 180 jours le remplace dans la
//      configuration auth (API de gestion Supabase, champ external_apple_secret SEUL) ; la clé .p8 vient du secret
//      serveur APPLE_SIWA_P8, jamais du dépôt ;
//   2. public.expirations_secrets : toute échéance à moins de 30 jours, et tout renouvellement raté → un mail à
//      support@fillsell.app (jamais à un client).
// Corps facultatif { renouveler: true } : force le renouvellement (même garde).
// Règles : _shared/expirations-secrets.js · docs/regles/base-supabase-et-fonctions.md (12/11).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import {
  secretClientApple, doitRenouveler, alertesDuJour, NOM_SECRET_APPLE_WEB, DUREE_SECRET_APPLE_JOURS,
} from "../_shared/expirations-secrets.js";

const FROM = "FillSell <support@fillsell.app>";
const TO = "support@fillsell.app";
const REF = "tojihnuawsoohlolangc";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const paris = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) : "—");

// deno-lint-ignore no-explicit-any
async function renouvelerApple(admin: any, ligne: any, force: boolean): Promise<Record<string, unknown>> {
  if (!force && !doitRenouveler(ligne?.expire_le ?? null)) return { fait: false, motif: "pas encore", expire_le: ligne?.expire_le };
  const p8 = Deno.env.get("APPLE_SIWA_P8"), keyId = Deno.env.get("APPLE_SIWA_KEY_ID"), teamId = Deno.env.get("APPLE_SIWA_TEAM_ID"),
    clientId = Deno.env.get("APPLE_SIWA_CLIENT_ID"), jeton = Deno.env.get("GESTION_SUPABASE_JETON");
  const manque = [!p8 && "APPLE_SIWA_P8", !keyId && "APPLE_SIWA_KEY_ID", !teamId && "APPLE_SIWA_TEAM_ID", !clientId && "APPLE_SIWA_CLIENT_ID",
    !jeton && "GESTION_SUPABASE_JETON"].filter(Boolean);
  const maintenant = new Date().toISOString();
  if (manque.length) {
    const echec = `secrets serveur absents : ${manque.join(", ")}`;
    await admin.from("expirations_secrets").update({ dernier_echec: echec, echec_le: maintenant, mis_a_jour: maintenant }).eq("nom", NOM_SECRET_APPLE_WEB);
    return { fait: false, echec };
  }
  try {
    const { jwt, exp } = await secretClientApple({ p8: p8!, keyId: keyId!, teamId: teamId!, clientId: clientId!, dureeJours: DUREE_SECRET_APPLE_JOURS });
    // La connexion Apple ne doit JAMAIS casser par ce renouvellement : le secret neuf est d'abord présenté à Apple (un jeton
    // de rafraîchissement inexistant : « invalid_grant » = client accepté, « invalid_client » = secret refusé). Refusé →
    // rien n'est posé, l'ancien secret reste, support est alerté.
    const sonde = await fetch("https://appleid.apple.com/auth/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId!, client_secret: jwt, grant_type: "refresh_token", refresh_token: "r00000000000000000000000000000000.0.sonde.fillsell" }),
    });
    const reponseApple = await sonde.text();
    if (!/invalid_grant/.test(reponseApple)) throw new Error(`Apple refuse le secret neuf (HTTP ${sonde.status} ${reponseApple.slice(0, 120)}) : rien n'est posé`);
    const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
      method: "PATCH", headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
      body: JSON.stringify({ external_apple_secret: jwt }),
    });
    if (!r.ok) throw new Error(`API de gestion : HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    const expireLe = new Date(exp * 1000).toISOString();
    await admin.from("expirations_secrets").update({
      expire_le: expireLe, dernier_renouvellement: maintenant, dernier_echec: null, echec_le: null, mis_a_jour: maintenant,
      detail: { kid: keyId, client_id: clientId, duree_jours: DUREE_SECRET_APPLE_JOURS },
    }).eq("nom", NOM_SECRET_APPLE_WEB);
    console.log(`[expirations-secrets] secret Apple du web renouvelé (kid ${keyId}), expire le ${paris(expireLe)}`);
    return { fait: true, expire_le: expireLe };
  } catch (e) {
    const echec = String((e as Error)?.message ?? e).slice(0, 300);
    await admin.from("expirations_secrets").update({ dernier_echec: echec, echec_le: maintenant, mis_a_jour: maintenant }).eq("nom", NOM_SECRET_APPLE_WEB);
    console.error(`[expirations-secrets] renouvellement du secret Apple raté : ${echec}`);
    return { fait: false, echec };
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST seulement" }, 405);
  const attendu = Deno.env.get("CRON_SECRET");
  if (!attendu || req.headers.get("x-cron-secret") !== attendu) return json({ error: "Non autorisé" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let corps: { renouveler?: boolean } = {};
  try { corps = await req.json(); } catch { /* corps vide : la passe du jour */ }

  const { data: lignes0, error } = await admin.from("expirations_secrets").select("*");
  if (error) return json({ error: `lecture : ${error.message}` }, 500);
  const apple = await renouvelerApple(admin, (lignes0 ?? []).find((l: { nom: string }) => l.nom === NOM_SECRET_APPLE_WEB), corps.renouveler === true);

  const { data: lignes } = await admin.from("expirations_secrets").select("*");
  const alertes = alertesDuJour(lignes ?? []);
  let envoi: unknown = null;
  if (alertes.length) {
    const sujet = `🔴 FillSell : ${alertes.length} clé(s) ou certificat(s) à renouveler — ${alertes.map((a) => a.libelle).join(" · ").slice(0, 140)}`;
    const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.5">
<p><b>Des clés ou certificats expirent bientôt, ou un renouvellement automatique a raté.</b></p>
<ul>${alertes.map((a) => `<li><b>${a.libelle}</b> — ${a.motif === "echec" ? `renouvellement automatique RATÉ : ${a.echec}` : `expire le ${paris(a.expire_le)} (J-${a.jours})`}</li>`).join("")}</ul>
<p>Lire : <code>select * from public.expirations_secrets order by expire_le;</code> · règle : docs/regles/base-supabase-et-fonctions.md (12/11).</p>
<p style="color:#888">expirations-secrets — une fois par jour ; une échéance est redite tous les 7 jours, un échec chaque jour.</p></div>`;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    envoi = { erreur: "RESEND_API_KEY absente" };
    if (resendKey) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({ from: FROM, to: [TO], subject: sujet, html }),
      });
      envoi = { status: r.status };
      if (r.ok) {
        const le = new Date().toISOString();
        await admin.from("expirations_secrets").update({ alerte_envoyee_le: le }).in("nom", alertes.filter((a) => a.motif === "echeance").map((a) => a.nom));
      }
    }
  }
  return json({ ok: true, apple, alertes: alertes.map((a) => ({ nom: a.nom, motif: a.motif, jours: a.jours })), envoi });
});
