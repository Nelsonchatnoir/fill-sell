// ═══════════════════════════════════════════════════════════════════════════
// LE LOT — CE QUE DEPOP REFUSE, DIT AVANT L'ENVOI (09/10/2026 soir, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Les articles d'une catégorie que Depop interdit (supabase/functions/_shared/
// depop-interdits.js : électrique, électronique, puériculture) ne partent pas
// vers Depop — leur case est grisée par leur moteur. Cette carte dit COMBIEN,
// et POURQUOI (la phrase de la règle, ce que la catégorie contient). Le reste
// du lot part normalement : jamais un lot bloqué pour ça.
import { Carte } from "../composants";

/**
 * @param {{ en: boolean, exclus: Array<{ id: string, message: string, quoi: string }> }} props
 */
export default function ExclusDepop({ en, exclus }) {
  if (!exclus?.length) return null;
  const parMotif = new Map();
  for (const x of exclus) {
    const e = parMotif.get(x.message) ?? { quoi: [], n: 0 };
    e.n += 1;
    if (!e.quoi.includes(x.quoi)) e.quoi.push(x.quoi);
    parMotif.set(x.message, e);
  }
  const n = exclus.length;
  return (
    <Carte gravite="info" titre={en
      ? `${n} item${n > 1 ? "s" : ""} won't go on Depop`
      : `${n} article${n > 1 ? "s" : ""} ne ${n > 1 ? "partiront" : "partira"} pas sur Depop`}>
      {[...parMotif.entries()].map(([message, e]) => (
        <div key={message} className="fsn-card-p">
          <b>{message}</b>{" "}
          {en ? `In this batch: ${e.quoi.slice(0, 3).join(", ")} (${e.n}).` : `Dans ce lot : ${e.quoi.slice(0, 3).join(", ")} (${e.n}).`}
        </div>
      ))}
      <div className="fsn-card-p">{en
        ? "For them, only your other ticked platforms get the listing. The rest of the batch is not affected."
        : "Pour eux, seules tes autres plateformes cochées reçoivent l'annonce. Le reste du lot n'est pas touché."}</div>
    </Carte>
  );
}
