// ══ LA RESTRICTION D’UN COMPTE VINTED ET SA PHRASE (sorties de pas-de-rouge.js le 20/11, point 1 de Nico) ══════
// Code DÉPLACÉ tel quel depuis pas-de-rouge.js, qui l’importe et le ré-exporte (mêmes noms pour tous ses appelants).
// Pourquoi : get-pending-jobs n’utilise que restrictionVinted et messageRestrictionVinted ; importer pas-de-rouge.js
// tirait ~145 Ko de sources dans une fonction au plafond de 5 Mo de Supabase (deux 413 la nuit du 20/11).
// ⛔ Ce module n’importe jamais pas-de-rouge.js (import circulaire).
import { indiceEtatRetrait } from "./retrait-deja-absent.js";

/** « la publication » / « la republication » / « le retrait ». */
export function acte(action) {
  if (action === "republish") return "la republication";
  if (action === "delete") return "le retrait";
  return "la publication";
}

// ── (15/10, lot C — Kossiwa, Hassan Said) CE QUI N'A PAS ÉTÉ TOUCHÉ, DIT
//    SELON L'ACTION ─────────────────────────────────────────────────────────
// « Ton annonce est intacte » s'affichait sur une PUBLICATION (il n'y a pas
// encore d'annonce), et sur une republication dont l'annonce était déjà
// retirée. Une seule phrase par situation, jamais une phrase figée.
export function rienTouche(action, pf = {}) {
  // (25/10, boncoin59300) « toujours en ligne » seulement sur preuve (lecture de la page < 24 h) : une page 404
  // n'est pas « en ligne », et on ne le sait pas toujours.
  if (action === "delete") {
    return indiceEtatRetrait(pf) === "en_ligne"
      ? "Rien n'a été retiré : l'annonce est toujours en ligne."
      : "Rien n'a été retiré par FillSell.";
  }
  if (action === "republish") {
    return pf && pf.republish_step === "deleted"
      ? "Ton annonce, déjà retirée, sera remise en ligne dès que possible."
      : "Rien n'a été touché, ton annonce est intacte.";
  }
  return "Rien n'a été publié.";
}

/** Le message d'un compte Vinted restreint jusqu'à une date (r = restrictionVinted(pf)). */
export function messageRestrictionVinted(r, action, pf = {}) {
  const Acte = acte(action).replace(/^la /, "La ").replace(/^le /, "Le ");
  return `Vinted a restreint ton compte jusqu'au ${r.jusquau} (« ${r.libelle} ») : d'ici là, il n'accepte ni nouvelle annonce ni ` +
    `modification — de toi comme de FillSell. ${rienTouche(action, pf)} ${Acte} repart toute seule dès la fin de la restriction, ` +
    "sans rien faire de ton côté.";
}

// ── VINTED A RESTREINT LE COMPTE, AVEC UNE DATE (27/09, nadegemarcelin78) ────
// Cinq republications arrêtées « état de l'annonce non vérifié » : le vrai
// motif dormait dans platform_fields.last_diagnostic — la page
// vinted.fr/listing-restriction, « Compte restreint jusqu'au 26/09/2026 : tu
// ne peux plus ajouter de nouveaux articles ni modifier tes annonces ». Rien à
// faire de son côté, rien à faire du nôtre avant cette date : on le dit, on
// attend la fin de la restriction, et on repart seuls le lendemain.
const RESTRICTION_RE = /Compte restreint jusqu'au (\d{2})\/(\d{2})\/(\d{4})/i;
/**
 * La restriction Vinted lue dans le diagnostic du job, ou null.
 * @returns {{ jusquau: string, fin: number, libelle: string }|null}
 *   `fin` = fin de la journée indiquée (Paris, heure d'été ou d'hiver), en ms.
 */
export function restrictionVinted(pf) {
  const d = pf && typeof pf === "object" && pf.last_diagnostic && typeof pf.last_diagnostic === "object"
    ? pf.last_diagnostic : null;
  if (!d) return null;
  const texte = `${String(d.titre ?? "")}\n${String(d.corps ?? "")}`;
  const m = RESTRICTION_RE.exec(texte);
  if (!m && String(d.signal ?? "") !== "listing_restriction") return null;
  if (!m) return { jusquau: null, fin: null, libelle: String(d.titre ?? "Compte restreint") };
  const [, jj, mm, aaaa] = m;
  // Décalage Paris : +02:00 de fin mars à fin octobre, +01:00 sinon (approché
  // au mois : une heure d'écart sur une reprise à minuit ne change rien).
  const mois = Number(mm);
  const decalage = mois >= 4 && mois <= 10 ? "+02:00" : "+01:00";
  const fin = Date.parse(`${aaaa}-${mm}-${jj}T23:59:59${decalage}`);
  return { jusquau: `${jj}/${mm}`, fin: Number.isFinite(fin) ? fin : null, libelle: m[0] };
}
