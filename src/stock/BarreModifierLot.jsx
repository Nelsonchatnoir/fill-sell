// ═══════════════════════════════════════════════════════════════════════════
// LA BARRE « MODIFIER EN LOT » DU STOCK — PRIX OU QUANTITÉ (04/10/2026, Louis)
// ═══════════════════════════════════════════════════════════════════════════
// Même patron que la saisie des prix d'achat en lot (pa-bar) : un en-tête
// (tout sélectionner, sortir), puis, dès qu'un article est coché, la barre
// d'action. Le calcul vit dans ./modifierEnLot.js (pur, testé) ; ici, l'écran
// et les écritures — une par VALEUR, jamais une par article quand c'est
// évitable (parValeur).
// ⛔ L'écran ne laisse JAMAIS croire que les annonces suivent : la phrase
//    « tes annonces en ligne ne changent pas » est sous le bouton, toujours.
import { useState } from "react";
import { OPERATIONS_PRIX, lireNombre, planPrix, planQuantite, parValeur } from "./modifierEnLot";

const LIBELLES_OP = {
  fr: { fixer: "Fixer à", plus_euros: "+ €", moins_euros: "− €", plus_pct: "+ %", moins_pct: "− %" },
  en: { fixer: "Set to", plus_euros: "+ €", moins_euros: "− €", plus_pct: "+ %", moins_pct: "− %" },
};

export default function BarreModifierLot({ lang = "fr", affiches = [], sel, setSel, onQuitter, supabase, userId, onFait }) {
  const fr = lang !== "en";
  const [champ, setChamp] = useState("prix"); // prix | quantite
  const [op, setOp] = useState("fixer");
  const [saisie, setSaisie] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [bilan, setBilan] = useState(null); // { texte, erreur }
  const choisis = affiches.filter((i) => sel.has(i.id));
  const nSel = choisis.length;
  const tout = nSel > 0 && nSel === affiches.length;
  const partiel = nSel > 0 && !tout;
  const valeur = lireNombre(saisie);
  const plan = valeur == null ? null : champ === "prix" ? planPrix(choisis, op, valeur) : planQuantite(choisis, valeur);
  const sansPrix = plan?.ignores?.filter((x) => x.raison === "sans_prix").length ?? 0;
  const sousMin = plan?.ignores?.filter((x) => x.raison === "sous_minimum").length ?? 0;
  const quantiteInvalide = champ === "quantite" && valeur != null && !(Number.isInteger(valeur) && valeur >= 1);

  async function appliquer() {
    if (!plan || !plan.changements.length || occupe) return;
    setOccupe(true);
    setBilan(null);
    let faits = 0;
    let erreur = null;
    for (const g of parValeur(plan.changements)) {
      let req = supabase.from("inventaire").update(champ === "prix" ? { prix_vente: g.valeur } : { quantite: g.valeur }).in("id", g.ids);
      if (userId) req = req.eq("user_id", userId);
      const { error } = await req;
      if (error) { erreur = error.message; break; }
      faits += g.ids.length;
    }
    setOccupe(false);
    const laisses = (plan.ignores?.length ?? 0);
    setBilan({
      erreur,
      texte: fr
        ? `${faits} fiche${faits > 1 ? "s" : ""} modifiée${faits > 1 ? "s" : ""}${laisses ? ` · ${laisses} laissée${laisses > 1 ? "s" : ""} de côté` : ""}. Tes annonces en ligne n'ont pas changé.`
        : `${faits} item${faits > 1 ? "s" : ""} updated${laisses ? ` · ${laisses} left aside` : ""}. Your live listings did not change.`,
    });
    if (faits) { setSel(new Set()); setSaisie(""); onFait?.(); }
  }

  return (
    <>
      <div className="pa-bar" style={{ flexWrap: "wrap", marginBottom: nSel > 0 ? 6 : undefined }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: "#1B6E62" }}>
          <input type="checkbox" className="pa-check" checked={tout} ref={(el) => { if (el) el.indeterminate = partiel; }}
            onChange={() => setSel((prev) => { const n = new Set(prev); if (tout) affiches.forEach((i) => n.delete(i.id)); else affiches.forEach((i) => n.add(i.id)); return n; })}
            aria-checked={partiel ? "mixed" : tout} aria-label={fr ? `Tout sélectionner (${affiches.length})` : `Select all (${affiches.length})`} />
          {fr ? `Tout sélectionner (${affiches.length})` : `Select all (${affiches.length})`}
        </label>
        <button type="button" className="pa-ghost" style={{ marginLeft: "auto" }} onClick={onQuitter}>{fr ? "Terminer" : "Done"}</button>
        <span className="pa-hint" style={{ flexBasis: "100%" }}>{fr
          ? "Change le prix ou la quantité de tes FICHES. Les annonces déjà en ligne ne changent pas, sur aucune plateforme."
          : "Changes the price or quantity of your ITEMS. Listings already online do not change, on any platform."}</span>
      </div>

      {bilan && (
        <div className="pa-bar" style={{ marginBottom: 6 }}>
          <span className="pa-hint" style={{ color: bilan.erreur ? undefined : "#1B6E62", fontWeight: 600 }}>{bilan.texte}</span>
          {bilan.erreur && <span className="pa-err" style={{ flexBasis: "100%" }}>{bilan.erreur}</span>}
        </div>
      )}

      {nSel > 0 && (
        <div className="pa-bar" style={{ flexWrap: "wrap", gap: 8 }}>
          <span className="lbl">{fr ? `${nSel} sélectionné${nSel > 1 ? "s" : ""}` : `${nSel} selected`}</span>
          <div style={{ display: "flex", gap: 6 }}>
            {[["prix", fr ? "Prix de vente" : "Selling price"], ["quantite", fr ? "Quantité" : "Quantity"]].map(([c, l]) => (
              <button key={c} type="button" className={`pa-ghost${champ === c ? " on" : ""}`} aria-pressed={champ === c}
                style={champ === c ? { fontWeight: 700, borderColor: "#1B6E62", color: "#1B6E62" } : undefined}
                onClick={() => { setChamp(c); setOp("fixer"); setBilan(null); }}>{l}</button>
            ))}
          </div>
          {champ === "prix" && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flexBasis: "100%" }}>
              {OPERATIONS_PRIX.map((o) => (
                <button key={o} type="button" className="pa-ghost" aria-pressed={op === o}
                  style={op === o ? { fontWeight: 700, borderColor: "#1B6E62", color: "#1B6E62" } : undefined}
                  onClick={() => setOp(o)}>{LIBELLES_OP[fr ? "fr" : "en"][o]}</button>
              ))}
            </div>
          )}
          <input className="pa-input" inputMode="decimal" value={saisie} onChange={(e) => { setSaisie(e.target.value); setBilan(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); appliquer(); } }}
            placeholder={champ === "quantite" ? "1" : op.endsWith("pct") ? "10 %" : "12,50 €"}
            aria-label={champ === "quantite" ? (fr ? "Nouvelle quantité" : "New quantity") : (fr ? "Valeur" : "Value")} />
          <button type="button" className="apply" disabled={occupe || !plan || !plan.changements.length} onClick={appliquer}>
            {occupe ? "…" : plan && plan.changements.length
              ? (fr ? `Appliquer à ${plan.changements.length}` : `Apply to ${plan.changements.length}`)
              : (fr ? "Appliquer" : "Apply")}
          </button>
          <div style={{ flexBasis: "100%", display: "flex", flexDirection: "column", gap: 2 }}>
            {sansPrix > 0 && <span className="pa-hint">{fr ? `${sansPrix} sans prix de vente : laissé${sansPrix > 1 ? "s" : ""} de côté (pas de base pour un calcul).` : `${sansPrix} without a price: left aside.`}</span>}
            {sousMin > 0 && <span className="pa-hint">{fr ? `${sousMin} tomberai${sousMin > 1 ? "ent" : "t"} sous 1 € : laissé${sousMin > 1 ? "s" : ""} de côté (1 € au moins, le minimum de Vinted).` : `${sousMin} would fall under €1: left aside.`}</span>}
            {quantiteInvalide && <span className="pa-err">{fr ? "Une quantité entière, 1 au moins. Un article vendu passe par « Vendre », qui retire ses annonces." : "A whole number, at least 1. A sold item goes through « Sell »."}</span>}
            <span className="pa-hint">{champ === "prix"
              ? (fr ? "Tes annonces en ligne gardent leur prix (une republication aussi) : le nouveau prix sert à tes prochaines publications de ces articles." : "Live listings keep their price (republishing too): the new price is used for your next listings of these items.")
              : (fr ? "Tes annonces en ligne ne changent pas : la quantité reste celle de la fiche FillSell." : "Live listings do not change: the quantity stays on the FillSell item.")}</span>
          </div>
        </div>
      )}
    </>
  );
}
