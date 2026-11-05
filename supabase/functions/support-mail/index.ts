// support-mail — archive des mails reçus sur support@fillsell.app (05/11 soir, point 6 d, décision de Nico).
// Appelée par le Worker e-mail Cloudflare « support-fillsell » (cloudflare/email-support/worker.js), SANS clé : le Worker
// ne porte aucun secret (Nico n'entre aucune clé). Déployer avec --no-verify-jwt. Garde maison (aucune session possible
// côté Worker) : POST JSON seulement, corps borné, destinataire en @fillsell.app, au plus 120 mails archivés par heure,
// une note seulement sur un mail « en_cours » archivé il y a moins de 15 min, au plus 5 alertes par heure. Le pire abus
// possible = des lignes d'archive en trop, jamais une lecture : la fonction ne rend que l'identifiant créé.
// Écrit par la clé de service de la fonction (public.support_mails, droits serveur seulement, migration 20261105200000).
// Un transfert ÉCHOUÉ (ou un mail ni archivé ni transféré) déclenche une alerte directe à la boîte de Nico par Resend
// (la clé RESEND_API_KEY des fonctions) — jamais vers support@, qui passerait par le transfert en panne.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";

const ALERTE_DIRECTE = "nicolas.svobodny@gmail.com";
const MAX_CORPS = 120_000;            // octets du corps JSON (l'extrait est borné à 20 000 caractères par le Worker)
const MAX_PAR_HEURE = 120;            // mails archivés par heure, tous expéditeurs
const MAX_ALERTES_PAR_HEURE = 5;
const NOTE_MAX_MS = 15 * 60_000;      // une note (ok / échec) vient dans les minutes qui suivent l'archive

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { "Content-Type": "application/json" } });
const texte = (v: unknown, max: number) => (v == null ? null : String(v).slice(0, max));

async function alerter(sujet: string, corps: string) {
  const cle = Deno.env.get("RESEND_API_KEY");
  if (!cle) return false;
  const depuis = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await admin.from("support_mails").select("id", { count: "exact", head: true })
    .eq("transfert", "echec").gte("transfere_le", depuis);
  if ((count ?? 0) > MAX_ALERTES_PAR_HEURE) return false;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "FillSell <alertes@fillsell.app>", to: [ALERTE_DIRECTE], subject: sujet, text: corps }),
  }).catch(() => null);
  return Boolean(r?.ok);
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST seulement" }, 405);
  const brut = await req.text();
  if (brut.length > MAX_CORPS) return json({ error: "corps trop gros" }, 413);
  // deno-lint-ignore no-explicit-any
  let b: any;
  try { b = JSON.parse(brut); } catch { return json({ error: "JSON attendu" }, 400); }

  if (b?.action === "archiver") {
    const a = texte(b.a, 300) ?? "";
    if (!/@fillsell\.app\b/i.test(a)) return json({ error: "destinataire hors fillsell.app" }, 400);
    const depuis = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await admin.from("support_mails").select("id", { count: "exact", head: true }).gte("recu_le", depuis);
    if ((count ?? 0) >= MAX_PAR_HEURE) return json({ error: "trop de mails cette heure" }, 429);
    const { data, error } = await admin.from("support_mails").insert({
      de: texte(b.de, 500), enveloppe_de: texte(b.enveloppe_de, 500), a, sujet: texte(b.sujet, 500),
      message_id: texte(b.message_id, 500), taille: Number.isFinite(Number(b.taille)) ? Math.trunc(Number(b.taille)) : null,
      extrait: texte(b.extrait, 20_000), transfert: "en_cours",
    }).select("id").single();
    if (error) return json({ error: error.message }, 500);
    return json({ id: data.id });
  }

  if (b?.action === "noter") {
    const ok = b.transfert === "ok";
    if (!ok && b.transfert !== "echec") return json({ error: "transfert ok|echec" }, 400);
    const erreur = texte(b.erreur, 500);
    const id = Number(b.id);
    let note = false;
    if (Number.isInteger(id) && id > 0) {
      const { data } = await admin.from("support_mails")
        .update({ transfert: ok ? "ok" : "echec", transfere_le: new Date().toISOString(), erreur: ok ? null : erreur })
        .eq("id", id).eq("transfert", "en_cours").gte("recu_le", new Date(Date.now() - NOTE_MAX_MS).toISOString())
        .select("id");
      note = Boolean(data?.length);
    }
    let alerte = false;
    if (!ok && (note || !(id > 0))) {
      alerte = await alerter(`🔴 support@ : transfert ÉCHOUÉ — ${String(b.sujet ?? "").slice(0, 60)}`,
        `De : ${String(b.de ?? "?")}\nErreur : ${erreur ?? "?"}\n` +
        (note ? `Le mail est archivé dans support_mails (${id}).` : "Le mail n'a PAS pu être archivé."));
    }
    return json({ note, alerte });
  }

  return json({ error: "action archiver|noter" }, 400);
});
