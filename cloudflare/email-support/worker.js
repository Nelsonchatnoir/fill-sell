// ═══════════════════════════════════════════════════════════════════════════
// WORKER E-MAIL DE support@fillsell.app (05/11, point 4 — Nico) — PRÉPARÉ, NON DÉPLOYÉ
// ═══════════════════════════════════════════════════════════════════════════
// Cause prouvée le 05/11 (journal Email Routing + Gmail) : les mails de Louis du 01/11 16:42, 02/11 09:22 et 03/11 09:25
// (envoyés depuis Outlook sous son adresse relais outlook_…@outlook.com) ont été TRANSFÉRÉS par Cloudflare
// (delivered/forward, SPF/DKIM pass) puis classés en SPAM par Gmail : personne ne les a vus.
// RÈGLE : aucun mail de support ne se perd sans qu'on le sache. Chaque mail reçu est d'abord ARCHIVÉ (table
// public.support_mails, migration 20261105200000), puis transféré à la boîte de Nico ; un transfert qui échoue est noté et
// déclenche une alerte (Resend) ; ops-digest liste chaque jour les mails reçus — un mail rangé en spam par Gmail reste visible.
// Secrets du Worker (jamais écrits ici) : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY ; variables : DESTINATION
// (la boîte de Nico), ALERTE (adresse d'alerte, autre que la destination).
// Déploiement : sur accord de Nico seulement (règle Email Routing support@ → « Send to a Worker »).

const MAX_EXTRAIT = 20_000;   // caractères du texte brut gardés en base (le mail entier reste chez Gmail)

async function texteBrut(message) {
  const lecteur = message.raw.getReader();
  const morceaux = [];
  let taille = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    taille += value.length;
    if (taille <= MAX_EXTRAIT * 4) morceaux.push(value);
  }
  const brut = new TextDecoder().decode(morceaux.length === 1 ? morceaux[0] : new Uint8Array(morceaux.flatMap((m) => [...m])));
  return { extrait: brut.slice(0, MAX_EXTRAIT), taille };
}

async function archiver(env, ligne) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/support_mails`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json", Prefer: "return=representation",
    },
    body: JSON.stringify(ligne),
  });
  if (!r.ok) throw new Error(`archive HTTP ${r.status}`);
  return (await r.json())?.[0]?.id ?? null;
}

async function noter(env, id, champs) {
  if (!id) return;
  await fetch(`${env.SUPABASE_URL}/rest/v1/support_mails?id=eq.${id}`, {
    method: "PATCH",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(champs),
  }).catch(() => {});
}

async function alerter(env, sujet, texte) {
  if (!env.RESEND_API_KEY || !env.ALERTE) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "FillSell <alertes@fillsell.app>", to: [env.ALERTE], subject: sujet, text: texte }),
  }).catch(() => {});
}

export default {
  async email(message, env) {
    const sujet = message.headers.get("subject") ?? "";
    const de = message.headers.get("from") ?? message.from;
    let id = null;
    try {
      const { extrait, taille } = await texteBrut(message);
      id = await archiver(env, {
        de, enveloppe_de: message.from, a: message.to, sujet,
        message_id: message.headers.get("message-id"), taille, extrait, transfert: "en_cours",
      });
    } catch (e) {
      // L'archive a échoué : on transfère quand même, et on le dit.
      await alerter(env, `⚠️ support@ : mail non archivé (${sujet.slice(0, 60)})`, `De : ${de}\nErreur : ${String(e?.message ?? e)}`);
    }
    try {
      await message.forward(env.DESTINATION);
      await noter(env, id, { transfert: "ok", transfere_le: new Date().toISOString() });
    } catch (e) {
      await noter(env, id, { transfert: "echec", erreur: String(e?.message ?? e).slice(0, 500) });
      await alerter(env, `🔴 support@ : transfert ÉCHOUÉ — ${sujet.slice(0, 60)}`,
        `De : ${de}\nÀ : ${message.to}\nErreur : ${String(e?.message ?? e)}\nLe mail est archivé dans support_mails${id ? ` (${id})` : ""}.`);
    }
  },
};
