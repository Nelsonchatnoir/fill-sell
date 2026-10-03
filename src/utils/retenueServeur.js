// ═══════════════════════════════════════════════════════════════════════════
// UNE REPUBLICATION RETENUE PAR LE SERVEUR SE VOIT (2026-10-01, carhoa)
// ═══════════════════════════════════════════════════════════════════════════
// Du 27/09 au 01/10, six livres de Carole sont restés « Relevée, en attente
// de republication » : get-pending-jobs ne les servait plus (ISBN capturé non
// standard, preuve attendue), écrivait un marqueur que rien ne lisait, et la
// carte promettait « cette annonce attend son tour ». Elle nous a écrit
// qu'elle ne comprenait pas pourquoi c'était bloqué.
//
// LE CONTRAT, UNIQUE (serveur et app lisent ce fichier) :
//   · le serveur qui RETIENT une republication encore en ligne (pending, hors
//     étape 'deleted') pose `platform_fields.retenue_serveur` =
//     { motif, depuis, ... } — daté une fois ;
//   · il la LÈVE (`retenue_levee`) dès qu'il la sert à nouveau ;
//   · l'app dit « En attente — ton annonce est intacte sur Vinted » ;
//   · l'ops-digest de 8h50 compte les jobs, les comptes et l'ancienneté.
// L'ancien marqueur de la garde ISBN (`retenue_isbn_capture`, 27/09) est lu
// comme une retenue du même motif et converti à la première écriture.
// ES module sans import (Deno + Vite).

export const CLE_RETENUE = "retenue_serveur";
export const RETENUE_ISBN_CAPTURE = "isbn_capture_non_standard";
// La boutique Vinted d'origine de l'article n'est connue nulle part (fiche,
// job, historique) : aucune opération ne part tant qu'elle n'est pas prouvée.
export const RETENUE_BOUTIQUE_INCONNUE = "boutique_origine_inconnue";
// (03/10, point 11) Le poste n'a pas encore la version qui fait ce geste sans
// deviner (Beebs : avant la 0.6.83, le pré-vol demandait la taille à l'IA —
// ceinture « L » de nivake03 retirée, puis bloquée à la recréation).
export const RETENUE_EXTENSION_A_JOUR = "extension_a_mettre_a_jour";
const ANCIENNES_CLES = { retenue_isbn_capture: RETENUE_ISBN_CAPTURE };

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

/** { motif, depuis } de la retenue portée par ces platform_fields, ou null. */
export function retenueServeurDe(pf) {
  const p = objet(pf) ?? {};
  const r = objet(p[CLE_RETENUE]);
  if (r && r.motif) return { motif: String(r.motif), depuis: r.depuis ? String(r.depuis) : null };
  for (const [cle, motif] of Object.entries(ANCIENNES_CLES)) {
    const a = objet(p[cle]);
    if (a) return { motif, depuis: a.depuis ? String(a.depuis) : null };
  }
  return null;
}

/** La retenue d'un job tant qu'elle a un sens : republication en attente, annonce encore en ligne. */
export function retenueServeurDuJob(job) {
  if (!job || job.action !== "republish" || job.status !== "pending") return null;
  const pf = objet(job.platform_fields) ?? {};
  if (String(pf.republish_step ?? "") === "deleted") return null;
  return retenueServeurDe(pf);
}

/**
 * Les platform_fields à écrire pour poser la retenue, ou null s'il n'y a rien
 * à écrire (déjà posée pour ce motif : datée une fois).
 */
export function poserRetenueServeur(pf, motif, maintenant, detail = {}) {
  const p = { ...(objet(pf) ?? {}) };
  const actuelle = objet(p[CLE_RETENUE]);
  const ancienne = Object.keys(ANCIENNES_CLES).some((c) => c in p);
  if (actuelle && actuelle.motif === motif && !ancienne) return null;
  const depuis = retenueServeurDe(p)?.motif === motif ? (retenueServeurDe(p).depuis ?? maintenant) : maintenant;
  for (const c of Object.keys(ANCIENNES_CLES)) delete p[c];
  p[CLE_RETENUE] = { ...detail, motif, depuis };
  return p;
}

/**
 * Les platform_fields à écrire pour lever la retenue (trace `retenue_levee`),
 * ou null s'il n'y avait pas de retenue.
 */
export function leverRetenueServeur(pf, maintenant, par) {
  const p = { ...(objet(pf) ?? {}) };
  const r = retenueServeurDe(p);
  if (!r) return null;
  delete p[CLE_RETENUE];
  for (const c of Object.keys(ANCIENNES_CLES)) delete p[c];
  p.retenue_levee = { motif: r.motif, depuis: r.depuis, le: maintenant, par: String(par ?? "") };
  return p;
}

/** Ce que la carte dit. Jamais de diagnostic : l'attente, et que rien n'est touché. */
export function phraseRetenueServeur(fr = true, { plateforme = "Vinted", motif = null } = {}) {
  // (03/10) La plateforme est nommée (la phrase disait « sur Vinted » pour toutes).
  if (motif === RETENUE_EXTENSION_A_JOUR) {
    return fr
      ? {
        court: "En attente",
        titre: "En attente de la mise à jour de l'extension — ton annonce est intacte",
        detail: `Cette republication attend la nouvelle version de l'extension FillSell sur ton ordinateur : ton annonce est intacte sur ${plateforme}, rien n'a été retiré. La mise à jour s'installe toute seule ; si rien ne bouge, ferme Chrome complètement puis rouvre-le.`,
      }
      : {
        court: "On hold",
        titre: "Waiting for the extension update — your listing is untouched",
        detail: `This repost is waiting for the new FillSell extension on your computer: your listing is untouched on ${plateforme}, nothing was removed. The update installs on its own; if nothing moves, fully close Chrome and open it again.`,
      };
  }
  return fr
    ? {
      court: "En attente",
      titre: "En attente — ton annonce est intacte",
      detail: `Cette republication attend chez nous avant de toucher à quoi que ce soit : ton annonce est intacte sur ${plateforme}, rien n'a été retiré. Elle repartira toute seule, tu n'as rien à faire.`,
    }
    : {
      court: "On hold",
      titre: "On hold — your listing is untouched",
      detail: `This repost is waiting on our side before touching anything: your listing is untouched on ${plateforme}, nothing was removed. It will resume on its own, nothing to do.`,
    };
}
