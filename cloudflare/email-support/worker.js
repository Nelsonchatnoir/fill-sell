// ═══════════════════════════════════════════════════════════════════════════
// WORKER E-MAIL DE support@fillsell.app (05/11, point 6 — Nico) — Worker Cloudflare « support-fillsell »
// ═══════════════════════════════════════════════════════════════════════════
// Cause prouvée le 05/11 (journal Email Routing + en-têtes Gmail) : les 4 mails de Louis (01/11 13:58 et 16:42, 02/11 09:22,
// 03/11 09:25, adresse relais outlook_…@outlook.com) ont été TRANSFÉRÉS par Cloudflare, SPF, DKIM, DMARC et ARC tous « pass »,
// puis classés en SPAM par Gmail (« semblable à des messages identifiés comme spam par le passé ») : personne ne les a vus.
// Parade Gmail posée le 05/11 : filtre « À : support@fillsell.app → ne jamais envoyer dans le spam ».
// RÈGLE : aucun mail de support ne se perd sans qu'on le sache. Chaque mail reçu est d'abord ARCHIVÉ (public.support_mails,
// par la fonction serveur support-mail), puis transféré à la boîte de Nico ; un transfert qui échoue est noté et la fonction
// alerte Nico (Resend, clé du serveur). AUCUN SECRET ICI (décision de Nico du 05/11 : il n'entre aucune clé) ; variables :
// SUPPORT_MAIL_URL (la fonction support-mail, --no-verify-jwt, garde maison), DESTINATION (la boîte de Nico).
// Si la fonction ne répond pas, le mail est transféré quand même (le transfert ne dépend jamais de l'archive).
// Routage : règle Email Routing support@fillsell.app → « Send to a Worker » support-fillsell (accord de Nico du 05/11).

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
  const tout = new Uint8Array(morceaux.reduce((n, m) => n + m.length, 0));
  let i = 0;
  for (const m of morceaux) { tout.set(m, i); i += m.length; }
  return { extrait: new TextDecoder().decode(tout).slice(0, MAX_EXTRAIT), taille };
}

async function appeler(env, corps) {
  const r = await fetch(env.SUPPORT_MAIL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  if (!r.ok) throw new Error(`support-mail HTTP ${r.status}`);
  return r.json();
}

export default {
  async email(message, env) {
    const sujet = message.headers.get("subject") ?? "";
    const de = message.headers.get("from") ?? message.from;
    let id = null;
    try {
      const { extrait, taille } = await texteBrut(message);
      id = (await appeler(env, {
        action: "archiver", de, enveloppe_de: message.from, a: message.to, sujet,
        message_id: message.headers.get("message-id"), taille, extrait,
      }))?.id ?? null;
    } catch (e) {
      console.error("support@ : archive impossible —", String(e?.message ?? e));
    }
    try {
      await message.forward(env.DESTINATION);
      if (id) await appeler(env, { action: "noter", id, transfert: "ok" }).catch(() => {});
    } catch (e) {
      await appeler(env, { action: "noter", id, transfert: "echec", erreur: String(e?.message ?? e).slice(0, 500), de, sujet })
        .catch(() => {});
    }
  },
};
