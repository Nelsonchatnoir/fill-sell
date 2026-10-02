// ═══════════════════════════════════════════════════════════════════════════
// LE COMPTE VINTED BLOQUÉ PAR VINTED N'EST PAS « NOTRE ONGLET » (02/10)
// ═══════════════════════════════════════════════════════════════════════════
// recrutementgroupezk704 (Business), retrait Vinted a7dd76cd « Jeans Levi's
// 511 » (vente faite sur Leboncoin) : les cinq essais du 01/10 ont fini sur
// https://www.vinted.fr/main/banned — Vinted a bloqué le compte. Le retrait
// n'a jamais pu être tenté ; le message disait « notre onglet n'était pas
// encore sur la page », puis « relance-le d'un clic » : une relance refrappe
// le même mur, et l'annonce reste achetable (risque de double vente).
// LA RÈGLE : la page d'arrivée /main/banned (lue par la fenêtre de travail,
// work_window_state) est un MUR de Vinted, jamais une page de notre fait :
// needs_user tout de suite, motif vrai (aucune action FillSell n'est possible
// sur ce compte), aucune tentative de plus, et le geste réel nommé — retirer
// l'annonce depuis l'appli Vinted si elle est encore en ligne.
// Pur, sans import réseau (Deno + Node).

export const SOURCE_COMPTE_VINTED_BLOQUE = "compte_vinted_bloque";
const BANNI_RE = /^https?:\/\/(?:www\.)?vinted\.[a-z.]+\/main\/banned(?:[/?#]|$)/i;

/** La fenêtre de travail a-t-elle fini sur la page « compte bloqué » de Vinted ? */
export function pageCompteVintedBloque(pf) {
  const w = pf && typeof pf === "object" ? pf.work_window_state : null;
  if (!w || typeof w !== "object") return false;
  const urls = [w.at_end?.tab_url, w.at_start?.tab_url, ...(Array.isArray(w.fins) ? w.fins.map((f) => f?.tab_url) : [])];
  return urls.some((u) => BANNI_RE.test(String(u ?? "")));
}

export function messageCompteVintedBloque(action, titre) {
  const quoi = titre ? ` « ${String(titre).slice(0, 80)} »` : "";
  if (action === "delete") {
    return `Vinted affiche « compte bloqué » sur ton ordinateur : FillSell ne peut plus rien faire sur ton compte Vinted, ` +
      `donc l'annonce${quoi} n'a PAS été retirée. Si elle est encore en ligne, retire-la toi-même depuis l'appli Vinted ` +
      "pour éviter une double vente, et vérifie ton compte dans l'appli.";
  }
  return "Vinted affiche « compte bloqué » sur ton ordinateur : FillSell ne peut plus rien faire sur ton compte Vinted, " +
    "rien n'a été touché. Vérifie ton compte dans l'appli Vinted ; tes autres plateformes ne sont pas concernées.";
}
