// ═══════════════════════════════════════════════════════════════════════════
// « ORDINATEUR COUPÉ » SEULEMENT QUAND L'EXTENSION SE TAIT (02/10 soir, point 5)
// ═══════════════════════════════════════════════════════════════════════════
// Cas : nivake03 (Glowik), ceinture Beebs 8d487ebb. Retrait fait le 02/10 à
// 03:19 (Paris), recréation prise à 03:22, puis plus rien ; handler-watch a écrit
// à 03:51 « l'ordinateur a été coupé juste après le retrait » — sans regarder
// l'extension. Ici c'était vrai (aucun signe depuis 03:22, 16 h de silence),
// mais la même phrase tombait aussi sur des postes BIEN VIVANTS dont l'onglet
// ou le script avait lâché (Les Petites Fioles, 25/09).
// Deux situations, deux messages, deux traitements :
//   · EXTENSION MUETTE (extension_last_seen_at n'a pas bougé depuis la prise du
//     job, ou pas depuis 10 min) : l'ordinateur ou Chrome s'est arrêté. Le job
//     attend le retour du poste, en tête de file ;
//   · EXTENSION VIVANTE (vue après la prise du job, il y a moins de 10 min) :
//     c'est l'onglet ou le script qui a lâché, pas l'ordinateur. Le job repart
//     tout de suite, en tête de file.
// Pur (Deno + Node).

export const POSTE_VIVANT_MS = 10 * 60_000;
const NOM = { vinted: "Vinted", leboncoin: "Leboncoin", ebay: "eBay", beebs: "Beebs", opla: "Opla" };

const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };

/**
 * L'extension a-t-elle donné signe de vie APRÈS avoir pris le job, et récemment ?
 * @param {{ vuLe?: string|null, priseLe?: string|null, maintenant?: number }} arg
 */
export function posteVivant({ vuLe = null, priseLe = null, maintenant = Date.now() } = {}) {
  const vu = ms(vuLe);
  if (!Number.isFinite(vu) || maintenant - vu > POSTE_VIVANT_MS) return false;
  const prise = ms(priseLe);
  return !Number.isFinite(prise) || vu > prise + 60_000;
}

const heureFr = (v) => {
  const t = ms(v);
  if (!Number.isFinite(t)) return null;
  try { return new Date(t).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }); }
  catch { return null; }
};

/**
 * @param {{ etape: 'deleted'|'captured', vivant: boolean, platform?: string, vuLe?: string|null }} arg
 */
export function messageInterruption({ etape, vivant, platform = "", vuLe = null }) {
  const nom = NOM[platform] ?? platform ?? "";
  if (etape === "deleted") {
    if (vivant) {
      return "Reprise après interruption : la remise en ligne de ton annonce s'est arrêtée dans l'onglet de travail " +
        "(Chrome, lui, tourne toujours). Elle repart tout de suite, en tête de file — rien à faire de ton côté.";
    }
    const h = heureFr(vuLe);
    return "Reprise après interruption : ton ordinateur ou Chrome s'est arrêté juste après le retrait de l'annonce" +
      (h ? ` (aucun signe de l'extension depuis ${h})` : "") +
      ". Sa remise en ligne repartira toute seule, en tête de file, dès que Chrome sera rouvert — rien à faire de ton côté.";
  }
  if (vivant) {
    return `Reprise après interruption : la republication s'est arrêtée dans l'onglet de travail, avant tout retrait. ` +
      `Ton annonce est toujours en ligne${nom ? ` sur ${nom}` : ""}, rien n'a été supprimé ; elle repart toute seule — rien à faire de ton côté.`;
  }
  const h = heureFr(vuLe);
  return "Reprise après interruption : ton ordinateur ou Chrome s'est arrêté après la capture de l'annonce, avant tout retrait" +
    (h ? ` (aucun signe de l'extension depuis ${h})` : "") +
    `. Ton annonce est toujours en ligne${nom ? ` sur ${nom}` : ""}, rien n'a été supprimé ; elle repartira toute seule dès que Chrome sera rouvert.`;
}
