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
// (19/11, Louis) Trois gestes de plus : le POIDS (Leboncoin, Beebs), le FORMAT
//    DU COLIS LEBONCOIN (au poids de chaque fiche) et le PRIX D'ACHAT (vide ≠ 0,
//    « Je ne sais pas »). Les écritures sont celles du plan (ecrituresDuPlan) ;
//    un article déjà à la valeur n'est jamais réécrit.
import { useState } from "react";
import {
  OPERATIONS_PRIX, GESTES_PRIX_ACHAT, CHOIX_FORMAT_LBC, FORMAT_DEDUIT,
  lireNombre, lirePoids, planPrix, planQuantite, planPoids, planFormatLbc, planPrixAchat, ecrituresDuPlan,
  planTransporteursLbc, TRANSPORTEURS_COMME_LE_COMPTE,
} from "./modifierEnLot";
import { parLots } from "../utils/parLots.js";
import { LBC_FORMATS } from "../utils/leboncoinColis";
// (20/11/2026, Louis) Les transporteurs de Leboncoin, avec leur limite de poids (relevé du 04/10).
import { LBC_TRANSPORTEURS } from "../utils/leboncoinColis";
import { PETIT_MAX_G, MOYEN_MAX_G } from "../../supabase/functions/_shared/colis-de-la-fiche.js";

const LIBELLES_OP = {
  fr: { fixer: "Fixer à", plus_euros: "+ €", moins_euros: "− €", plus_pct: "+ %", moins_pct: "− %" },
  en: { fixer: "Set to", plus_euros: "+ €", moins_euros: "− €", plus_pct: "+ %", moins_pct: "− %" },
};

// (19/11, Louis) Les onglets, dans l'ordre ; « Supprimer » s'ajoute en dernier quand le Stock le permet.
const ONGLETS = [
  ["prix", "Prix de vente", "Selling price"],
  ["quantite", "Quantité", "Quantity"],
  ["poids", "Poids", "Weight"],
  ["format_lbc", "Format Leboncoin", "Leboncoin size"],
  ["transporteurs_lbc", "Transporteurs Leboncoin", "Leboncoin carriers"],
  ["prix_achat", "Prix d'achat", "Purchase price"],
];

// (19/11, Louis) Le prix d'achat : « Fixer à » ou « Je ne sais pas » — aucun ± (une marge se calcule sur un prix vrai).
const LIBELLES_PA = {
  fr: { fixer: "Fixer à", inconnu: "Je ne sais pas" },
  en: { fixer: "Set to", inconnu: "I don't know" },
};

// (19/11, Louis) Les formats : les mots de Leboncoin, et ce que chacun fait (LBC_FORMATS, relevé du 20/09).
const NOMS_FORMAT = {
  fr: { Petit: "Petit", Moyen: "Moyen", Volumineux: "Volumineux", [FORMAT_DEDUIT]: "Déduit du poids" },
  en: { Petit: "Small", Moyen: "Medium", Volumineux: "Bulky", [FORMAT_DEDUIT]: "From the weight" },
};
const enKg = (g) => `${g / 1000} kg`;
function aideFormat(f, fr) {
  if (f === FORMAT_DEDUIT) {
    return fr
      ? `Calculé du poids de chaque fiche : jusqu'à ${enKg(PETIT_MAX_G)} Petit, jusqu'à ${enKg(MOYEN_MAX_G)} Moyen, au-delà Volumineux. Se recalcule quand le poids change.`
      : `Worked out from each item's weight: up to ${enKg(PETIT_MAX_G)} Small, up to ${enKg(MOYEN_MAX_G)} Medium, above that Bulky. Recalculated when the weight changes.`;
  }
  const x = LBC_FORMATS.find((y) => y.valeur === f);
  return x ? (fr ? x.aide : x.aideEn) : "";
}

// (19/11, Louis) Sous le bouton, pour CHAQUE champ : les annonces en ligne ne changent pas, et à quoi sert la valeur.
const PHRASES = {
  prix: {
    fr: "Tes annonces en ligne gardent leur prix (une republication aussi) : le nouveau prix sert à tes prochaines publications de ces articles.",
    en: "Live listings keep their price (republishing too): the new price is used for your next listings of these items.",
  },
  quantite: {
    fr: "Tes annonces en ligne ne changent pas : la quantité reste celle de la fiche FillSell.",
    en: "Live listings do not change: the quantity stays on the FillSell item.",
  },
  poids: {
    fr: "Tes annonces en ligne ne changent pas : le poids sert à tes prochaines publications sur Leboncoin et Beebs, et à tes republications Leboncoin (sur Beebs, une republication garde le format de son annonce). Un format Leboncoin choisi à la main reste le tien : il ne se recalcule pas depuis ce poids.",
    en: "Live listings do not change: the weight is used for your next listings on Leboncoin and Beebs, and for your Leboncoin relistings (on Beebs, a relisting keeps its listing's size). A Leboncoin size picked by hand stays yours: it is not worked out again from this weight.",
  },
  format_lbc: {
    fr: "Tes annonces en ligne ne changent pas : ce format sert à tes prochaines publications et republications sur Leboncoin. Ton choix reste le tien : il ne se recalcule jamais depuis le poids (« Déduit du poids » le rend au calcul).",
    en: "Live listings do not change: this size is used for your next listings and relistings on Leboncoin. Your choice stays yours: it is never worked out again from the weight (“From the weight” hands it back to the calculation).",
  },
  transporteurs_lbc: {
    fr: "Tes annonces en ligne ne changent pas : ces transporteurs servent à tes prochaines publications sur Leboncoin, avant le choix de ton compte. Chaque article ne garde que ceux qui prennent son poids.",
    en: "Live listings do not change: these carriers are used for your next listings on Leboncoin, before your account's choice. Each item only keeps those that take its weight.",
  },
  prix_achat: {
    fr: "Tes annonces en ligne ne changent pas : le prix d'achat sert à tes calculs de marge et de bénéfice. Vide n'est pas zéro : 0 € veut dire gratuit, « Je ne sais pas » sort l'article des calculs.",
    en: "Live listings do not change: the purchase price is used for your margin and profit figures. Empty is not zero: €0 means free, “I don't know” leaves the item out of the figures.",
  },
};

const STYLE_ON = { fontWeight: 700, borderColor: "#1B6E62", color: "#1B6E62" };

// (16/11/2026, point 8 — Marc) « Supprimer » : le troisième geste de la sélection. La barre ne supprime RIEN : elle
// ouvre la confirmation (onSupprimer → stock/SuppressionLot.jsx), qui dit tout avant le second geste.
export default function BarreModifierLot({ lang = "fr", affiches = [], sel, setSel, onQuitter, supabase, userId, onFait, onSupprimer = null }) {
  const fr = lang !== "en";
  const [champ, setChamp] = useState("prix"); // prix | quantite | poids | format_lbc | prix_achat | supprimer
  const [op, setOp] = useState("fixer"); // prix : OPERATIONS_PRIX ; prix d'achat : GESTES_PRIX_ACHAT
  const [saisie, setSaisie] = useState("");
  const [formatChoisi, setFormatChoisi] = useState(null); // (19/11) Petit | Moyen | Volumineux | auto
  const [transporteursChoisis, setTransporteursChoisis] = useState(null); // (20/11) null | [noms] | "auto" (comme le compte)
  const [occupe, setOccupe] = useState(false);
  const [bilan, setBilan] = useState(null); // { texte, erreur }
  const choisis = affiches.filter((i) => sel.has(i.id));
  const nSel = choisis.length;
  const tout = nSel > 0 && nSel === affiches.length;
  const partiel = nSel > 0 && !tout;
  const valeur = lireNombre(saisie);
  // (19/11, Louis) Le poids se lit comme dans le lot de publication : « 650 g », « 650 », « 1,2 kg » ; 1 g à 150 kg.
  const poids = champ === "poids" ? lirePoids(saisie) : null;
  const poidsRefuse = champ === "poids" && saisie.trim() !== "" && poids == null;
  const plan = (() => {
    if (champ === "prix") return valeur == null ? null : planPrix(choisis, op, valeur);
    if (champ === "quantite") return valeur == null ? null : planQuantite(choisis, valeur);
    if (champ === "poids") return poids == null ? null : planPoids(choisis, poids);
    if (champ === "format_lbc") return formatChoisi == null ? null : planFormatLbc(choisis, formatChoisi);
    if (champ === "transporteurs_lbc") return transporteursChoisis == null ? null : planTransporteursLbc(choisis, transporteursChoisis);
    // Prix d'achat : un champ VIDE n'écrit rien (vide ≠ 0) ; « Je ne sais pas » n'a pas de saisie.
    if (champ === "prix_achat") return op === "inconnu" ? planPrixAchat(choisis, "inconnu") : valeur == null ? null : planPrixAchat(choisis, "fixer", valeur);
    return null;
  })();
  const sansPrix = plan?.ignores?.filter((x) => x.raison === "sans_prix").length ?? 0;
  const sousMin = plan?.ignores?.filter((x) => x.raison === "sous_minimum").length ?? 0;
  const inchanges = plan?.inchanges?.length ?? 0;
  const quantiteInvalide = champ === "quantite" && valeur != null && !(Number.isInteger(valeur) && valeur >= 1);
  const sansPoids = champ === "format_lbc" && formatChoisi ? choisis.filter((i) => !(Number(i.poids_g) > 0)).length : 0;
  // (20/11) Les articles qu'un transporteur coché ne prend pas (leur poids dépasse sa limite) : dit, jamais caché.
  const kgMinCoche = Array.isArray(transporteursChoisis) && champ === "transporteurs_lbc"
    ? Math.min(...LBC_TRANSPORTEURS.filter((t) => transporteursChoisis.includes(t.nom)).map((t) => t.kgMax)) : Infinity;
  const tropLourds = Number.isFinite(kgMinCoche) ? choisis.filter((i) => Number(i.poids_g) > kgMinCoche * 1000).length : 0;
  const avecSaisie = champ === "prix" || champ === "quantite" || champ === "poids" || (champ === "prix_achat" && op === "fixer");

  async function appliquer() {
    if (!plan || !plan.changements.length || occupe) return;
    setOccupe(true);
    setBilan(null);
    let faits = 0;
    let erreur = null;
    // (11/10) Par lots de 400 (utils/parLots.js) : un .in() de plus de ~800
    // identifiants tombe, et le Stock peut maintenant en montrer 3 000.
    // (19/11, Louis) Les écritures sont celles du plan (modifierEnLot.js) : la colonne du champ seule, ou, pour le
    // format, attributs.format_colis_lbc au poids de chaque fiche (le trigger fusionne clé par clé).
    ecritures: for (const g of ecrituresDuPlan(champ, plan)) {
      for (const lot of parLots(g.ids)) {
        let req = supabase.from("inventaire").update(g.champs).in("id", lot);
        if (userId) req = req.eq("user_id", userId);
        const { error } = await req;
        if (error) { erreur = error.message; break ecritures; }
        faits += lot.length;
      }
    }
    setOccupe(false);
    const laisses = (plan.ignores?.length ?? 0);
    setBilan({
      erreur,
      texte: fr
        ? `${faits} fiche${faits > 1 ? "s" : ""} modifiée${faits > 1 ? "s" : ""}${laisses ? ` · ${laisses} laissée${laisses > 1 ? "s" : ""} de côté` : ""}${inchanges ? ` · ${inchanges} déjà à jour` : ""}. Tes annonces en ligne n'ont pas changé.`
        : `${faits} item${faits > 1 ? "s" : ""} updated${laisses ? ` · ${laisses} left aside` : ""}${inchanges ? ` · ${inchanges} already up to date` : ""}. Your live listings did not change.`,
    });
    if (faits) { setSel(new Set()); setSaisie(""); setFormatChoisi(null); setTransporteursChoisis(null); onFait?.(); }
  }

  const onglets = [...ONGLETS.map(([c, lfr, len]) => [c, fr ? lfr : len]), ...(onSupprimer ? [["supprimer", fr ? "Supprimer" : "Delete"]] : [])];

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
          ? "Change le prix, la quantité, le poids, le format du colis ou les transporteurs Leboncoin, ou le prix d'achat de tes FICHES. Les annonces déjà en ligne ne changent pas, sur aucune plateforme."
          : "Changes the price, quantity, weight, Leboncoin parcel size or carriers, or purchase price of your ITEMS. Listings already online do not change, on any platform."}</span>
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
          {/* (19/11, Louis) Six onglets : ils passent à la ligne au lieu de déborder (360 px, iPhone, Android, web). */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
            {onglets.map(([c, l]) => (
              <button key={c} type="button" className={`pa-ghost${champ === c ? " on" : ""}`} aria-pressed={champ === c}
                style={champ === c ? STYLE_ON : undefined}
                onClick={() => { if (c !== champ) { setSaisie(""); setFormatChoisi(null); setTransporteursChoisis(null); } setChamp(c); setOp("fixer"); setBilan(null); }}>{l}</button>
            ))}
          </div>
          {champ === "supprimer" && onSupprimer && (
            <div style={{ flexBasis: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
              <button type="button" className="apply" data-supprimer-selection="" onClick={() => onSupprimer(choisis.map((i) => i.id))}
                style={{ background: "#B42318", minHeight: 44 }}>
                {fr ? `Supprimer ${nSel} article${nSel > 1 ? "s" : ""}…` : `Delete ${nSel} item${nSel > 1 ? "s" : ""}…`}
              </button>
              <span className="pa-hint">{fr ? "Rien n'est supprimé à ce clic : l'écran suivant dit ce qui se passera (annonces en ligne, ventes) et te laisse choisir ou annuler." : "Nothing is deleted on this tap: the next screen tells you what will happen (live listings, sales) and lets you choose or cancel."}</span>
            </div>
          )}
          {champ === "prix" && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flexBasis: "100%" }}>
              {OPERATIONS_PRIX.map((o) => (
                <button key={o} type="button" className="pa-ghost" aria-pressed={op === o}
                  style={op === o ? STYLE_ON : undefined}
                  onClick={() => setOp(o)}>{LIBELLES_OP[fr ? "fr" : "en"][o]}</button>
              ))}
            </div>
          )}
          {/* (19/11, Louis) Prix d'achat : « Fixer à » (0 accepté = gratuit) ou « Je ne sais pas » (NULL + inconnu). */}
          {champ === "prix_achat" && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flexBasis: "100%" }}>
              {GESTES_PRIX_ACHAT.map((o) => (
                <button key={o} type="button" className="pa-ghost" aria-pressed={op === o}
                  style={op === o ? STYLE_ON : undefined}
                  onClick={() => { setOp(o); setBilan(null); }}>{LIBELLES_PA[fr ? "fr" : "en"][o]}</button>
              ))}
            </div>
          )}
          {/* (19/11, Louis) Format du colis Leboncoin : chaque choix dit ce qu'il fait (textes de LBC_FORMATS). */}
          {champ === "format_lbc" && (
            <div role="radiogroup" aria-label={fr ? "Format du colis Leboncoin" : "Leboncoin parcel size"}
              style={{ display: "flex", flexDirection: "column", gap: 4, flexBasis: "100%" }}>
              {CHOIX_FORMAT_LBC.map((f) => (
                <button key={f} type="button" className="pa-ghost" role="radio" aria-checked={formatChoisi === f}
                  style={{ whiteSpace: "normal", textAlign: "left", borderRadius: 10, padding: "6px 10px", display: "flex", flexDirection: "column", gap: 1, ...(formatChoisi === f ? STYLE_ON : null) }}
                  onClick={() => { setFormatChoisi(f); setBilan(null); }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700 }}>{NOMS_FORMAT[fr ? "fr" : "en"][f]}</span>
                  <span style={{ fontSize: 10, fontWeight: 500, color: "#8A8578", lineHeight: 1.35 }}>{aideFormat(f, fr)}</span>
                </button>
              ))}
            </div>
          )}
          {/* (20/11/2026, Louis) Les transporteurs Leboncoin de chaque article : cochés ici, posés sur chaque fiche (le
              même choix que la fiche article), bornés au poids de chaque article à la publication ; « Comme le compte »
              efface le choix de l'article. */}
          {champ === "transporteurs_lbc" && (
            <div role="group" aria-label={fr ? "Transporteurs Leboncoin" : "Leboncoin carriers"}
              style={{ display: "flex", flexDirection: "column", gap: 4, flexBasis: "100%" }}>
              {LBC_TRANSPORTEURS.map((t) => {
                const on = Array.isArray(transporteursChoisis) && transporteursChoisis.includes(t.nom);
                return (
                  <button key={t.cle} type="button" className="pa-ghost" role="checkbox" aria-checked={on}
                    style={{ whiteSpace: "normal", textAlign: "left", borderRadius: 10, padding: "6px 10px", display: "flex", alignItems: "center", gap: 8, ...(on ? STYLE_ON : null) }}
                    onClick={() => {
                      setBilan(null);
                      setTransporteursChoisis((prev) => {
                        const base = Array.isArray(prev) ? prev : [];
                        const suite = base.includes(t.nom) ? base.filter((x) => x !== t.nom) : [...base, t.nom];
                        return suite.length ? LBC_TRANSPORTEURS.map((x) => x.nom).filter((x) => suite.includes(x)) : null;
                      });
                    }}>
                    <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: 4, flex: "0 0 auto", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800, color: "#fff", background: on ? "#1B6E62" : "#fff", border: `1.5px solid ${on ? "#1B6E62" : "#C9C4B6"}` }}>{on ? "✓" : ""}</span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700 }}>{t.nom}</span>
                      <span style={{ fontSize: 10, fontWeight: 500, color: "#8A8578", lineHeight: 1.35 }}>{fr ? `Jusqu'à ${t.kgMax} kg · ${t.remise}` : `Up to ${t.kgMax} kg · ${t.remiseEn ?? t.remise}`}</span>
                    </span>
                  </button>
                );
              })}
              <button type="button" className="pa-ghost" role="checkbox" aria-checked={transporteursChoisis === TRANSPORTEURS_COMME_LE_COMPTE}
                style={{ whiteSpace: "normal", textAlign: "left", borderRadius: 10, padding: "6px 10px", display: "flex", flexDirection: "column", gap: 1, ...(transporteursChoisis === TRANSPORTEURS_COMME_LE_COMPTE ? STYLE_ON : null) }}
                onClick={() => { setBilan(null); setTransporteursChoisis((prev) => (prev === TRANSPORTEURS_COMME_LE_COMPTE ? null : TRANSPORTEURS_COMME_LE_COMPTE)); }}>
                <span style={{ fontSize: 11.5, fontWeight: 700 }}>{fr ? "Comme le compte" : "Like the account"}</span>
                <span style={{ fontSize: 10, fontWeight: 500, color: "#8A8578", lineHeight: 1.35 }}>{fr ? "Efface le choix de ces articles : le choix de ton compte vaut (sinon ceux que Leboncoin propose)." : "Clears these items' choice: your account's choice applies (otherwise Leboncoin's own)."}</span>
              </button>
            </div>
          )}
          {champ !== "supprimer" && (<>
          {avecSaisie && (
            <input className="pa-input" inputMode={champ === "poids" ? "text" : "decimal"} value={saisie} onChange={(e) => { setSaisie(e.target.value); setBilan(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); appliquer(); } }}
              placeholder={champ === "quantite" ? "1" : champ === "poids" ? "650 g" : champ === "prix_achat" ? (fr ? "8 €" : "€8") : op.endsWith("pct") ? "10 %" : (fr ? "12,50 €" : "€12.50")}
              aria-label={champ === "quantite" ? (fr ? "Nouvelle quantité" : "New quantity")
                : champ === "poids" ? (fr ? "Nouveau poids" : "New weight")
                : champ === "prix_achat" ? (fr ? "Prix d'achat" : "Purchase price")
                : (fr ? "Valeur" : "Value")} />
          )}
          <button type="button" className="apply" disabled={occupe || !plan || !plan.changements.length} onClick={appliquer}>
            {occupe ? "…" : plan && plan.changements.length
              ? (fr ? `Appliquer à ${plan.changements.length}` : `Apply to ${plan.changements.length}`)
              : (fr ? "Appliquer" : "Apply")}
          </button>
          <div style={{ flexBasis: "100%", display: "flex", flexDirection: "column", gap: 2 }}>
            {sansPrix > 0 && <span className="pa-hint">{fr ? `${sansPrix} sans prix de vente : laissé${sansPrix > 1 ? "s" : ""} de côté (pas de base pour un calcul).` : `${sansPrix} without a price: left aside.`}</span>}
            {sousMin > 0 && <span className="pa-hint">{fr ? `${sousMin} tomberai${sousMin > 1 ? "ent" : "t"} sous 1 € : laissé${sousMin > 1 ? "s" : ""} de côté (1 € au moins, le minimum de Vinted).` : `${sousMin} would fall under €1: left aside.`}</span>}
            {quantiteInvalide && <span className="pa-err">{fr ? "Une quantité entière, 1 au moins. Un article vendu passe par « Vendre », qui retire ses annonces." : "A whole number, at least 1. A sold item goes through « Sell »."}</span>}
            {poidsRefuse && <span className="pa-err">{fr ? "Un poids de 1 g à 150 kg : « 650 g », « 650 » ou « 1,2 kg »." : "A weight from 1 g to 150 kg: “650 g”, “650” or “1.2 kg”."}</span>}
            {champ === "prix_achat" && op === "fixer" && valeur === 0 && <span className="pa-hint">{fr ? "0 € = gratuit (don, cadeau) : l'article compte dans tes calculs, sans marge en %." : "€0 = free (gift, giveaway): the item counts in your figures, with no margin %."}</span>}
            {champ === "prix_achat" && op === "inconnu" && <span className="pa-hint">{fr ? "Le prix d'achat est effacé et marqué inconnu : ces articles sortent des calculs de marge jusqu'à ce que tu le donnes." : "The purchase price is cleared and marked unknown: these items stay out of the margin figures until you give it."}</span>}
            {sansPoids > 0 && <span className="pa-hint">{formatChoisi === FORMAT_DEDUIT
              ? (fr ? `${sansPoids} sans poids : Leboncoin estimera ${sansPoids > 1 ? "leur" : "son"} format lui-même.` : `${sansPoids} without a weight: Leboncoin will estimate the size itself.`)
              : (fr ? `${sansPoids} sans poids : ce choix vaut jusqu'à ce que tu ${sansPoids > 1 ? "leur" : "lui"} donnes un poids.` : `${sansPoids} without a weight: this choice holds until you give ${sansPoids > 1 ? "them" : "it"} a weight.`)}</span>}
            {tropLourds > 0 && <span className="pa-hint">{fr ? `${tropLourds} article${tropLourds > 1 ? "s" : ""} trop lourd${tropLourds > 1 ? "s" : ""} pour un transporteur coché : il ne leur sera pas proposé (borné au poids de chaque article).` : `${tropLourds} item${tropLourds > 1 ? "s" : ""} too heavy for a ticked carrier: it won't be offered for them (bounded to each item's weight).`}</span>}
            {inchanges > 0 && <span className="pa-hint">{fr ? `${inchanges} déjà à jour : pas réécrit${inchanges > 1 ? "s" : ""}.` : `${inchanges} already up to date: not rewritten.`}</span>}
            <span className="pa-hint">{PHRASES[champ]?.[fr ? "fr" : "en"]}</span>
          </div>
          </>)}
        </div>
      )}
    </>
  );
}
