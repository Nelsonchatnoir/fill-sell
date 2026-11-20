// ═══════════════════════════════════════════════════════════════════════════
// UNE PLATEFORME QUI REFUSE LE COMPTE SE DIT AVANT L'ENVOI (20/11/2026 soir, bloc B4 de Nico — linda.yoann35)
// ═══════════════════════════════════════════════════════════════════════════
// Le 20/11, Beebs ne connaissait pas le compte de linda (essai Cloud : seule Vinted choisie à l'inscription, aucune
// annonce Beebs relevée ni publiée) ; ses lots ont pourtant mis 194 publications Beebs en file, aucune n'est jamais
// passée. LA RÈGLE, à l'unité comme dans le lot : une plateforme qui a refusé le compte (tâches `refus_compte` de moins de
// 24 h, posées par update-job-status) est grisée AVANT l'envoi, avec sa raison — « pas encore de compte » ou « pas le
// compte de ta boutique » (la cause posée par get-pending-jobs, _shared/pause-plateforme.js) — exactement comme une
// plateforme en pause : rien n'est mis en file, rien n'est décompté. Elle redevient cochable dès qu'un dépôt y réussit
// (la retenue du serveur tombe et l'attente de ses tâches n'est plus marquée « refus_compte ») ou 24 h après le dernier
// refus. Une lecture par compte et par minute au plus, partagée par tous les moteurs d'un lot (jamais une par article).

const NOMS = { vinted: "Vinted", leboncoin: "Leboncoin", ebay: "eBay", beebs: "Beebs", depop: "Depop", opla: "Opla" };
export const REFUS_COMPTE_VALIDE_MS = 24 * 3600_000;
const CACHE_MS = 60_000;

/**
 * Les plateformes dont le compte est refusé (pur). `lignes` : [{ platform, rc: { le }, att: { cause, refus } }] (tâches
 * ouvertes portant refus_compte ou une attente « refus_compte »). Rend { [plateforme]: { cause, le } }.
 */
export function refusActifs(lignes, maintenant = Date.now()) {
  const out = {};
  for (const l of Array.isArray(lignes) ? lignes : []) {
    const pf = String(l?.platform ?? "");
    if (!NOMS[pf]) continue;
    const t = Date.parse(String(l?.rc?.le ?? l?.att?.derniere ?? ""));
    const estRefus = Boolean(l?.rc) || l?.att?.cause === "refus_compte";
    if (!estRefus || !Number.isFinite(t) || maintenant - t > REFUS_COMPTE_VALIDE_MS) continue;
    const cause = l?.att?.cause === "refus_compte" && (l.att.refus === "sans_boutique" || l.att.refus === "autre_compte") ? l.att.refus : null;
    const prec = out[pf];
    out[pf] = { le: Math.max(prec?.le ?? 0, t), cause: cause ?? prec?.cause ?? null };
  }
  return out;
}

/** La raison dite sur la plateforme grisée (pur). */
export function messageCompteRefuse(pf, cause, lang = "fr") {
  const en = lang === "en";
  const nom = NOMS[pf] ?? pf;
  if (cause === "sans_boutique") {
    return en ? `You don't have a ${nom} account yet: create it on ${nom}, then reconnect it in Settings › My platforms. Nothing is queued for ${nom} while this account isn't recognised.`
      : `Tu n'as pas encore de compte ${nom} : crée-le sur ${nom}, puis reconnecte-le dans Réglages › Mes plateformes. Rien n'est envoyé à ${nom} tant que ce compte n'est pas reconnu.`;
  }
  if (cause === "autre_compte") {
    return en ? `The connected ${nom} account isn't your shop's: reconnect ${nom} with your shop's account in Settings › My platforms. Nothing is queued for ${nom} while this account isn't recognised.`
      : `Le compte ${nom} connecté n'est pas celui de ta boutique : reconnecte ${nom} avec le compte de ta boutique dans Réglages › Mes plateformes. Rien n'est envoyé à ${nom} tant que ce compte n'est pas reconnu.`;
  }
  return en ? `${nom} refuses your account right now: reconnect ${nom} in Settings › My platforms. Nothing is queued for ${nom} while this account isn't recognised.`
    : `${nom} refuse ton compte en ce moment : reconnecte ${nom} dans Réglages › Mes plateformes. Rien n'est envoyé à ${nom} tant que ce compte n'est pas reconnu.`;
}

const cache = new Map();   // userId → { le, valeur, promesse }
/**
 * { [plateforme]: message } des comptes refusés de cet utilisateur — lu au plus une fois par minute (partagé par tous
 * les moteurs d'un lot). Illisible : {} (rien n'est grisé sur une panne).
 */
export async function lireComptesRefuses(supabase, userId, { lang = "fr", maintenant = Date.now() } = {}) {
  if (!supabase || !userId) return {};
  const c = cache.get(userId);
  let valeur;
  if (c && maintenant - c.le < CACHE_MS) valeur = c.promesse ? await c.promesse : c.valeur;
  else {
    const promesse = (async () => {
      try {
        const champs = "platform, rc:platform_fields->refus_compte, att:platform_fields->attente_session";
        const [a, b] = await Promise.all([
          supabase.from("cross_post_jobs").select(champs).eq("user_id", userId).in("status", ["pending", "needs_user"])
            .not("platform_fields->refus_compte", "is", null).limit(50),
          supabase.from("cross_post_jobs").select(champs).eq("user_id", userId).in("status", ["pending", "needs_user"])
            .eq("platform_fields->attente_session->>cause", "refus_compte").limit(50),
        ]);
        if (a.error || b.error) return {};
        return refusActifs([...(a.data ?? []), ...(b.data ?? [])], Date.now());
      } catch { return {}; }
    })();
    cache.set(userId, { le: maintenant, promesse });
    valeur = await promesse;
    cache.set(userId, { le: maintenant, valeur });
  }
  return Object.fromEntries(Object.entries(valeur ?? {}).map(([pf, r]) => [pf, messageCompteRefuse(pf, r.cause, lang)]));
}
