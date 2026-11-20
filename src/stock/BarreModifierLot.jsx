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
// (20/11/2026 soir, bloc C de Nico — Louis) PLUSIEURS CHAMPS D'UN COUP, et la TAILLE. Chaque onglet garde sa saisie
//    (un point dit qu'il est rempli) ; le récapitulatif dit, AVANT la validation, combien d'articles, quels champs, et
//    pour chacun combien changent / sont déjà à jour ; UN bouton « Appliquer à N articles » écrit tout (planCombine :
//    une écriture par article au plus, par lots de 400). Seuls les champs remplis s'appliquent ; un champ rempli mais
//    illisible bloque la validation (jamais ignoré en silence). La SÉLECTION RESTE après la validation (« Terminer »
//    la vide, comme avant) ; « Supprimer » reste un geste à part, avec sa confirmation. Tactile ≥ 44 px, 390 px de large.
import { useState } from "react";
import {
  OPERATIONS_PRIX, GESTES_PRIX_ACHAT, CHOIX_FORMAT_LBC, FORMAT_DEDUIT,
  lireSaisiesMasse, planCombine, TRANSPORTEURS_COMME_LE_COMPTE,
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
// (20/11/2026 soir, bloc C de Nico — Louis) La TAILLE, avant le poids : poids, format et transporteurs restent côte à côte.
const ONGLETS = [
  ["prix", "Prix de vente", "Selling price"],
  ["quantite", "Quantité", "Quantity"],
  ["taille", "Taille", "Size"],
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
  // (20/11/2026 soir, bloc C de Nico — Louis) La taille de l'article, pour toutes ses plateformes (corrections.js).
  taille: {
    fr: "Tes annonces en ligne ne changent pas : la taille sert à tes prochaines publications de ces articles, sur toutes les plateformes. Une taille gardée à part pour une seule plateforme est remplacée par celle-ci.",
    en: "Live listings do not change: the size is used for your next listings of these items, on every platform. A size kept apart for a single platform is replaced by this one.",
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
// (20/11/2026 soir, bloc C de Nico — Louis) Tout ce qui se touche fait 44 px au moins (iPhone, Android, web).
const TACTILE = { minHeight: 44, boxSizing: "border-box" };
const ONGLET = { ...TACTILE, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", fontSize: 12 };
const OPTION = { ...TACTILE, whiteSpace: "normal", textAlign: "left", borderRadius: 10, padding: "6px 10px" };

// (20/11/2026 soir, bloc C de Nico — Louis) Les saisies de départ : tout vide = rien ne change.
const SAISIES_VIDES = Object.freeze({ prix: "", quantite: "", taille: "", poids: "", prix_achat: "" });

const nombreLu = (n, fr) => {
  const t = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return fr ? t.replace(".", ",") : t;
};
const poidsLu = (g, fr) => (g >= 1000 ? `${fr ? String(g / 1000).replace(".", ",") : String(g / 1000)} kg` : `${g} g`);
const pluriel = (n, un, plusieurs) => (n > 1 ? plusieurs : un);

/** (20/11/2026 soir, bloc C de Nico — Louis) La valeur d'un champ rempli, telle que le récapitulatif la dit. */
function valeurDite(champ, v, fr) {
  if (champ === "prix") {
    const { op, valeur } = v.prix;
    const n = nombreLu(valeur, fr);
    if (op === "fixer") return fr ? `fixer à ${n} €` : `set to €${n}`;
    const signe = op.startsWith("plus") ? "+" : "−";
    return op.endsWith("pct") ? `${signe} ${n} %` : (fr ? `${signe} ${n} €` : `${signe} €${n}`);
  }
  if (champ === "quantite") return String(v.quantite);
  if (champ === "taille") return `« ${v.taille} »`;
  if (champ === "poids") return poidsLu(v.poids, fr);
  if (champ === "format_lbc") return NOMS_FORMAT[fr ? "fr" : "en"][v.format_lbc] ?? String(v.format_lbc);
  if (champ === "transporteurs_lbc") return v.transporteurs_lbc === TRANSPORTEURS_COMME_LE_COMPTE ? (fr ? "comme le compte" : "like the account") : v.transporteurs_lbc.join(", ");
  if (champ === "prix_achat") {
    if (v.prix_achat.geste === "inconnu") return fr ? "je ne sais pas" : "I don't know";
    const n = nombreLu(v.prix_achat.valeur, fr);
    return v.prix_achat.valeur === 0 ? (fr ? "0 € (gratuit)" : "€0 (free)") : (fr ? `${n} €` : `€${n}`);
  }
  return "";
}

/** (20/11/2026 soir, bloc C de Nico — Louis) Ce qu'il faut corriger dans un champ rempli mais illisible. */
function aCorriger(champ, fr) {
  if (champ === "quantite") return fr ? "Une quantité entière, 1 au moins. Un article vendu passe par « Vendre », qui retire ses annonces." : "A whole number, at least 1. A sold item goes through « Sell ».";
  if (champ === "poids") return fr ? "Un poids de 1 g à 150 kg : « 650 g », « 650 » ou « 1,2 kg »." : "A weight from 1 g to 150 kg: “650 g”, “650” or “1.2 kg”.";
  if (champ === "prix_achat") return fr ? "Un montant : « 8 », « 8,50 » ou « 0 » (gratuit)." : "An amount: “8”, “8.50” or “0” (free).";
  return fr ? "Un nombre : « 12,50 » ou « 10 % »." : "A number: “12.50” or “10 %”.";
}

// (16/11/2026, point 8 — Marc) « Supprimer » : le troisième geste de la sélection. La barre ne supprime RIEN : elle
// ouvre la confirmation (onSupprimer → stock/SuppressionLot.jsx), qui dit tout avant le second geste.
export default function BarreModifierLot({ lang = "fr", affiches = [], sel, setSel, onQuitter, supabase, userId, onFait, onSupprimer = null }) {
  const fr = lang !== "en";
  const [champ, setChamp] = useState("prix"); // l'onglet ouvert : prix | quantite | taille | poids | format_lbc | transporteurs_lbc | prix_achat | supprimer
  // (20/11/2026 soir, bloc C de Nico — Louis) Une saisie PAR champ, gardée d'un onglet à l'autre jusqu'à la validation.
  const [saisies, setSaisies] = useState(SAISIES_VIDES);
  const [op, setOp] = useState("fixer"); // prix de vente : OPERATIONS_PRIX
  const [gestePa, setGestePa] = useState("fixer"); // prix d'achat : GESTES_PRIX_ACHAT
  const [formatChoisi, setFormatChoisi] = useState(null); // (19/11) Petit | Moyen | Volumineux | auto
  const [transporteursChoisis, setTransporteursChoisis] = useState(null); // (20/11) null | [noms] | "auto" (comme le compte)
  const [occupe, setOccupe] = useState(false);
  const [bilan, setBilan] = useState(null); // { texte, erreur }
  const choisis = affiches.filter((i) => sel.has(i.id));
  const nSel = choisis.length;
  const tout = nSel > 0 && nSel === affiches.length;
  const partiel = nSel > 0 && !tout;

  // (20/11/2026 soir, bloc C de Nico — Louis) Les champs remplis, lus (vide ≠ 0), et le plan de TOUS (modifierEnLot.js).
  // (19/11, Louis) Le poids se lit comme dans le lot de publication : « 650 g », « 650 », « 1,2 kg » ; 1 g à 150 kg.
  const lecture = lireSaisiesMasse({
    prix: { op, saisie: saisies.prix },
    quantite: saisies.quantite,
    taille: saisies.taille,
    poids: saisies.poids,
    format_lbc: formatChoisi,
    transporteurs_lbc: transporteursChoisis,
    // Prix d'achat : un champ VIDE n'écrit rien (vide ≠ 0) ; « Je ne sais pas » n'a pas de saisie.
    prix_achat: { geste: gestePa, saisie: saisies.prix_achat },
  });
  const combine = planCombine(lecture.valeurs, choisis);
  const { recap } = combine;
  const invalide = (c) => lecture.invalides.some((x) => x.champ === c);
  const rempli = (c) => lecture.valeurs[c] != null;
  const nRemplis = recap.champs.length;

  // Les indications de l'onglet ouvert : celles d'avant, lues dans le plan combiné.
  const plan = combine.plans[champ] ?? null;
  const sansPrix = plan?.ignores?.filter((x) => x.raison === "sans_prix").length ?? 0;
  const sousMin = plan?.ignores?.filter((x) => x.raison === "sous_minimum").length ?? 0;
  const inchanges = plan?.inchanges?.length ?? 0;
  const sansPoids = champ === "format_lbc" ? recap.sansPoids : 0;
  // (20/11) Les articles qu'un transporteur coché ne prend pas (leur poids dépasse sa limite) : dit, jamais caché.
  const tropLourds = champ === "transporteurs_lbc" ? recap.tropLourds : 0;
  const taillesAPart = champ === "taille" ? (plan?.changements ?? []).filter((c) => c.aPart?.length).length : 0;
  const avecSaisie = champ === "prix" || champ === "quantite" || champ === "taille" || champ === "poids" || (champ === "prix_achat" && gestePa === "fixer");
  const peutAppliquer = !occupe && !lecture.invalides.length && recap.aEcrire > 0;

  const libelle = (c) => { const o = ONGLETS.find(([k]) => k === c); return o ? (fr ? o[1] : o[2]) : c; };
  function viderChamp(c) {
    setBilan(null);
    if (c === "prix") { setSaisies((s) => ({ ...s, prix: "" })); setOp("fixer"); }
    else if (c === "prix_achat") { setSaisies((s) => ({ ...s, prix_achat: "" })); setGestePa("fixer"); }
    else if (c === "format_lbc") setFormatChoisi(null);
    else if (c === "transporteurs_lbc") setTransporteursChoisis(null);
    else setSaisies((s) => ({ ...s, [c]: "" }));
  }
  function viderTout() {
    setSaisies(SAISIES_VIDES); setOp("fixer"); setGestePa("fixer"); setFormatChoisi(null); setTransporteursChoisis(null);
  }

  async function appliquer() {
    if (occupe || lecture.invalides.length) return;
    // Le plan au moment du geste (la date des choix rangés sur la fiche est celle de la validation).
    const c = planCombine(lecture.valeurs, choisis, { maintenant: new Date() });
    if (!c.ecritures.length) return;
    setOccupe(true);
    setBilan(null);
    let faits = 0;
    let erreur = null;
    // (11/10) Par lots de 400 (utils/parLots.js) : un .in() de plus de ~800
    // identifiants tombe, et le Stock peut maintenant en montrer 3 000.
    // (19/11, Louis) Les écritures sont celles du plan (modifierEnLot.js) : la colonne du champ seule, ou, pour le
    // format, attributs.format_colis_lbc au poids de chaque fiche (le trigger fusionne clé par clé).
    // (20/11/2026 soir, bloc C de Nico — Louis) Plusieurs champs : UNE écriture par article au plus (planCombine,
    // regroupée par contenu identique), qui ne porte que ce qui change.
    ecritures: for (const g of c.ecritures) {
      for (const lot of parLots(g.ids)) {
        let req = supabase.from("inventaire").update(g.champs).in("id", lot);
        if (userId) req = req.eq("user_id", userId);
        const { error } = await req;
        if (error) { erreur = error.message; break ecritures; }
        faits += lot.length;
      }
    }
    setOccupe(false);
    const r = c.recap;
    const seul = r.champs.length === 1 ? c.plans[r.champs[0].champ] : null;
    // Un seul champ : le bilan d'avant, mot pour mot ; plusieurs : les champs écrits, et ce qui était déjà à jour.
    const laisses = seul ? (seul.ignores?.length ?? 0) : r.laisses;
    const dejaAJour = seul ? (seul.inchanges?.length ?? 0) : r.dejaAJour;
    const champsDits = seul ? "" : ` (${r.champs.filter((x) => x.changent > 0).map((x) => libelle(x.champ)).join(", ")})`;
    setBilan({
      erreur,
      texte: fr
        ? `${faits} fiche${faits > 1 ? "s" : ""} modifiée${faits > 1 ? "s" : ""}${champsDits}${laisses ? ` · ${laisses} laissée${laisses > 1 ? "s" : ""} de côté` : ""}${dejaAJour ? ` · ${dejaAJour} déjà à jour` : ""}. Tes annonces en ligne n'ont pas changé.`
        : `${faits} item${faits > 1 ? "s" : ""} updated${champsDits}${laisses ? ` · ${laisses} left aside` : ""}${dejaAJour ? ` · ${dejaAJour} already up to date` : ""}. Your live listings did not change.`,
    });
    // (20/11/2026 soir, bloc C de Nico — Louis) La SÉLECTION RESTE (avant, elle se vidait ici — Louis devait tout
    // resélectionner entre deux champs) ; les champs se vident quand tout est écrit (en cas d'erreur, ils restent
    // pour réessayer : ce qui est déjà écrit sera « déjà à jour »). « Terminer » vide la sélection, comme avant.
    if (faits && !erreur) viderTout();
    if (faits) onFait?.();
  }

  const onglets = [...ONGLETS.map(([c, lfr, len]) => [c, fr ? lfr : len]), ...(onSupprimer ? [["supprimer", fr ? "Supprimer" : "Delete"]] : [])];

  return (
    <>
      <div className="pa-bar" style={{ flexWrap: "wrap", marginBottom: nSel > 0 ? 6 : undefined }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: "#1B6E62", minHeight: 44 }}>
          <input type="checkbox" className="pa-check" checked={tout} ref={(el) => { if (el) el.indeterminate = partiel; }}
            onChange={() => setSel((prev) => { const n = new Set(prev); if (tout) affiches.forEach((i) => n.delete(i.id)); else affiches.forEach((i) => n.add(i.id)); return n; })}
            aria-checked={partiel ? "mixed" : tout} aria-label={fr ? `Tout sélectionner (${affiches.length})` : `Select all (${affiches.length})`} />
          {fr ? `Tout sélectionner (${affiches.length})` : `Select all (${affiches.length})`}
        </label>
        <button type="button" className="pa-ghost" style={{ marginLeft: "auto", ...TACTILE, padding: "0 14px" }} onClick={onQuitter}>{fr ? "Terminer" : "Done"}</button>
        <span className="pa-hint" style={{ flexBasis: "100%" }}>{fr
          ? "Change le prix, la quantité, la taille, le poids, le format du colis ou les transporteurs Leboncoin, ou le prix d'achat de tes FICHES — un ou plusieurs champs à la fois. Les annonces déjà en ligne ne changent pas, sur aucune plateforme."
          : "Changes the price, quantity, size, weight, Leboncoin parcel size or carriers, or purchase price of your ITEMS — one or several fields at once. Listings already online do not change, on any platform."}</span>
      </div>

      {bilan && (
        <div className="pa-bar" style={{ marginBottom: 6 }}>
          <span className="pa-hint" style={{ color: bilan.erreur ? undefined : "#1B6E62", fontWeight: 600 }}>{bilan.texte}</span>
          {bilan.erreur && <span className="pa-err" style={{ flexBasis: "100%" }}>{bilan.erreur}</span>}
        </div>
      )}

      {nSel > 0 && (
        <div className="pa-bar" style={{ flexWrap: "wrap", gap: 8, minWidth: 0 }}>
          <span className="lbl">{fr ? `${nSel} sélectionné${nSel > 1 ? "s" : ""}` : `${nSel} selected`}</span>
          {/* (19/11, Louis) Six onglets : ils passent à la ligne au lieu de déborder (360 px, iPhone, Android, web).
              (20/11/2026 soir, bloc C de Nico — Louis) Un point sur l'onglet d'un champ rempli (rouge : à corriger). */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
            {onglets.map(([c, l]) => {
              const point = invalide(c) ? "#B0645A" : rempli(c) ? "#1B6E62" : null;
              return (
                <button key={c} type="button" className={`pa-ghost${champ === c ? " on" : ""}`} aria-pressed={champ === c}
                  aria-label={point ? `${l} (${invalide(c) ? (fr ? "à corriger" : "to fix") : (fr ? "rempli" : "filled")})` : undefined}
                  style={{ ...ONGLET, ...(champ === c ? STYLE_ON : null) }}
                  onClick={() => { setChamp(c); setBilan(null); }}>
                  {point && <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: point, flex: "0 0 auto" }} />}
                  {l}
                </button>
              );
            })}
          </div>
          {champ !== "supprimer" && (
            <span className="pa-hint" style={{ flexBasis: "100%" }}>{fr
              ? "Remplis un ou plusieurs champs, puis applique une seule fois. Un champ laissé vide ne change pas."
              : "Fill in one or several fields, then apply once. A field left empty does not change."}</span>
          )}
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
                  style={{ ...TACTILE, padding: "0 12px", ...(op === o ? STYLE_ON : null) }}
                  onClick={() => { setOp(o); setBilan(null); }}>{LIBELLES_OP[fr ? "fr" : "en"][o]}</button>
              ))}
            </div>
          )}
          {/* (19/11, Louis) Prix d'achat : « Fixer à » (0 accepté = gratuit) ou « Je ne sais pas » (NULL + inconnu). */}
          {champ === "prix_achat" && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flexBasis: "100%" }}>
              {GESTES_PRIX_ACHAT.map((o) => (
                <button key={o} type="button" className="pa-ghost" aria-pressed={gestePa === o}
                  style={{ ...TACTILE, padding: "0 12px", ...(gestePa === o ? STYLE_ON : null) }}
                  onClick={() => { setGestePa(o); setBilan(null); }}>{LIBELLES_PA[fr ? "fr" : "en"][o]}</button>
              ))}
            </div>
          )}
          {/* (19/11, Louis) Format du colis Leboncoin : chaque choix dit ce qu'il fait (textes de LBC_FORMATS). */}
          {champ === "format_lbc" && (
            <div role="radiogroup" aria-label={fr ? "Format du colis Leboncoin" : "Leboncoin parcel size"}
              style={{ display: "flex", flexDirection: "column", gap: 4, flexBasis: "100%" }}>
              {CHOIX_FORMAT_LBC.map((f) => (
                <button key={f} type="button" className="pa-ghost" role="radio" aria-checked={formatChoisi === f}
                  style={{ ...OPTION, display: "flex", flexDirection: "column", gap: 1, ...(formatChoisi === f ? STYLE_ON : null) }}
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
                    style={{ ...OPTION, display: "flex", alignItems: "center", gap: 8, ...(on ? STYLE_ON : null) }}
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
                style={{ ...OPTION, display: "flex", flexDirection: "column", gap: 1, ...(transporteursChoisis === TRANSPORTEURS_COMME_LE_COMPTE ? STYLE_ON : null) }}
                onClick={() => { setBilan(null); setTransporteursChoisis((prev) => (prev === TRANSPORTEURS_COMME_LE_COMPTE ? null : TRANSPORTEURS_COMME_LE_COMPTE)); }}>
                <span style={{ fontSize: 11.5, fontWeight: 700 }}>{fr ? "Comme le compte" : "Like the account"}</span>
                <span style={{ fontSize: 10, fontWeight: 500, color: "#8A8578", lineHeight: 1.35 }}>{fr ? "Efface le choix de ces articles : le choix de ton compte vaut (sinon ceux que Leboncoin propose)." : "Clears these items' choice: your account's choice applies (otherwise Leboncoin's own)."}</span>
              </button>
            </div>
          )}
          {champ !== "supprimer" && (<>
          {avecSaisie && (
            <input className="pa-input" inputMode={champ === "poids" || champ === "taille" ? "text" : "decimal"} value={saisies[champ] ?? ""}
              onChange={(e) => { const t = e.target.value; setSaisies((s) => ({ ...s, [champ]: t })); setBilan(null); }}
              onKeyDown={(e) => {
                // (20/11/2026 soir, bloc C de Nico — Louis) « Entrée » applique quand un SEUL champ est rempli (comme
                // avant) ; avec plusieurs champs, la validation passe par le récapitulatif et son bouton.
                if (e.key === "Enter") { e.preventDefault(); if (nRemplis <= 1) appliquer(); else e.currentTarget.blur(); }
              }}
              style={{ ...TACTILE, width: 160, maxWidth: "100%", fontSize: 16 }}
              placeholder={champ === "quantite" ? "1" : champ === "poids" ? "650 g" : champ === "taille" ? (fr ? "M, 38, 10 ans" : "M, 38, 10 years") : champ === "prix_achat" ? (fr ? "8 €" : "€8") : op.endsWith("pct") ? "10 %" : (fr ? "12,50 €" : "€12.50")}
              aria-label={champ === "quantite" ? (fr ? "Nouvelle quantité" : "New quantity")
                : champ === "poids" ? (fr ? "Nouveau poids" : "New weight")
                : champ === "taille" ? (fr ? "Nouvelle taille" : "New size")
                : champ === "prix_achat" ? (fr ? "Prix d'achat" : "Purchase price")
                : (fr ? "Valeur" : "Value")} />
          )}
          <div style={{ flexBasis: "100%", display: "flex", flexDirection: "column", gap: 2 }}>
            {sansPrix > 0 && <span className="pa-hint">{fr ? `${sansPrix} sans prix de vente : laissé${sansPrix > 1 ? "s" : ""} de côté (pas de base pour un calcul).` : `${sansPrix} without a price: left aside.`}</span>}
            {sousMin > 0 && <span className="pa-hint">{fr ? `${sousMin} tomberai${sousMin > 1 ? "ent" : "t"} sous 1 € : laissé${sousMin > 1 ? "s" : ""} de côté (1 € au moins, le minimum de Vinted).` : `${sousMin} would fall under €1: left aside.`}</span>}
            {invalide(champ) && <span className="pa-err">{aCorriger(champ, fr)}</span>}
            {champ === "prix_achat" && gestePa === "fixer" && lecture.valeurs.prix_achat?.valeur === 0 && <span className="pa-hint">{fr ? "0 € = gratuit (don, cadeau) : l'article compte dans tes calculs, sans marge en %." : "€0 = free (gift, giveaway): the item counts in your figures, with no margin %."}</span>}
            {champ === "prix_achat" && gestePa === "inconnu" && <span className="pa-hint">{fr ? "Le prix d'achat est effacé et marqué inconnu : ces articles sortent des calculs de marge jusqu'à ce que tu le donnes." : "The purchase price is cleared and marked unknown: these items stay out of the margin figures until you give it."}</span>}
            {champ === "format_lbc" && recap.formatAuNouveauPoids && <span className="pa-hint">{fr ? `Calculé et posé au NOUVEAU poids (${poidsLu(lecture.valeurs.poids, fr)}), celui de l'onglet Poids.` : `Worked out and set at the NEW weight (${poidsLu(lecture.valeurs.poids, fr)}), the one in the Weight tab.`}</span>}
            {sansPoids > 0 && <span className="pa-hint">{formatChoisi === FORMAT_DEDUIT
              ? (fr ? `${sansPoids} sans poids : Leboncoin estimera ${sansPoids > 1 ? "leur" : "son"} format lui-même.` : `${sansPoids} without a weight: Leboncoin will estimate the size itself.`)
              : (fr ? `${sansPoids} sans poids : ce choix vaut jusqu'à ce que tu ${sansPoids > 1 ? "leur" : "lui"} donnes un poids.` : `${sansPoids} without a weight: this choice holds until you give ${sansPoids > 1 ? "them" : "it"} a weight.`)}</span>}
            {tropLourds > 0 && <span className="pa-hint">{fr ? `${tropLourds} article${tropLourds > 1 ? "s" : ""} trop lourd${tropLourds > 1 ? "s" : ""} pour un transporteur coché : il ne leur sera pas proposé (borné au poids de chaque article).` : `${tropLourds} item${tropLourds > 1 ? "s" : ""} too heavy for a ticked carrier: it won't be offered for them (bounded to each item's weight).`}</span>}
            {taillesAPart > 0 && <span className="pa-hint">{fr ? `${taillesAPart} article${taillesAPart > 1 ? "s" : ""} gardai${taillesAPart > 1 ? "ent" : "t"} une taille à part pour une plateforme : elle est remplacée par celle-ci.` : `${taillesAPart} item${taillesAPart > 1 ? "s" : ""} kept a separate size for a platform: it is replaced by this one.`}</span>}
            {inchanges > 0 && <span className="pa-hint">{fr ? `${inchanges} déjà à jour : pas réécrit${inchanges > 1 ? "s" : ""}.` : `${inchanges} already up to date: not rewritten.`}</span>}
            <span className="pa-hint">{PHRASES[champ]?.[fr ? "fr" : "en"]}</span>
          </div>
          {/* (20/11/2026 soir, bloc C de Nico — Louis) LE RÉCAPITULATIF, avant la validation : combien d'articles, quels
              champs, et pour chacun combien changent / sont déjà à jour / sont laissés de côté. « × » retire un champ. */}
          {(nRemplis > 0 || lecture.invalides.length > 0) && (
            <div role="status" aria-live="polite" data-recap-modifier-lot=""
              style={{ flexBasis: "100%", minWidth: 0, display: "flex", flexDirection: "column", gap: 0, border: "1px solid #E7E3D8", borderRadius: 10, padding: "6px 4px 6px 10px" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#10201B" }}>{fr
                ? `Récapitulatif · ${nSel} article${nSel > 1 ? "s" : ""} sélectionné${nSel > 1 ? "s" : ""}`
                : `Summary · ${nSel} selected item${nSel > 1 ? "s" : ""}`}</span>
              {recap.champs.map((x) => (
                <div key={x.champ} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span style={{ flex: "1 1 auto", minWidth: 0, fontSize: 11.5, color: "#10201B", lineHeight: 1.35, overflowWrap: "anywhere" }}>
                    <b>{libelle(x.champ)}</b> : {valeurDite(x.champ, lecture.valeurs, fr)}
                    <span style={{ color: "#6B7A75" }}>{fr
                      ? ` — ${x.changent} ${pluriel(x.changent, "change", "changent")}${x.dejaAJour ? ` · ${x.dejaAJour} déjà à jour` : ""}${x.ignores ? ` · ${x.ignores} laissé${x.ignores > 1 ? "s" : ""} de côté` : ""}`
                      : ` — ${x.changent} ${pluriel(x.changent, "changes", "change")}${x.dejaAJour ? ` · ${x.dejaAJour} already up to date` : ""}${x.ignores ? ` · ${x.ignores} left aside` : ""}`}</span>
                  </span>
                  <button type="button" className="pa-ghost" onClick={() => viderChamp(x.champ)}
                    aria-label={fr ? `Ne pas changer : ${libelle(x.champ)}` : `Do not change: ${libelle(x.champ)}`}
                    style={{ ...TACTILE, minWidth: 44, padding: 0, flex: "0 0 auto", display: "inline-grid", placeItems: "center", fontSize: 16, lineHeight: 1 }}>×</button>
                </div>
              ))}
              {lecture.invalides.map((x) => (
                <div key={`inv-${x.champ}`} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span className="pa-err" style={{ flex: "1 1 auto", minWidth: 0, overflowWrap: "anywhere" }}>
                    {libelle(x.champ)} : {fr ? "à corriger ou à vider" : "fix it or clear it"} — {aCorriger(x.champ, fr)}
                  </span>
                  <button type="button" className="pa-ghost" onClick={() => viderChamp(x.champ)}
                    aria-label={fr ? `Vider : ${libelle(x.champ)}` : `Clear: ${libelle(x.champ)}`}
                    style={{ ...TACTILE, minWidth: 44, padding: 0, flex: "0 0 auto", display: "inline-grid", placeItems: "center", fontSize: 16, lineHeight: 1 }}>×</button>
                </div>
              ))}
              {nRemplis > 1 && !lecture.invalides.length && (
                <span className="pa-hint" style={{ paddingRight: 6 }}>{fr
                  ? `${recap.aEcrire} à modifier${recap.dejaAJour ? ` · ${recap.dejaAJour} déjà à jour sur tous ces champs` : ""} : une seule écriture par article, les champs vides ne changent pas.`
                  : `${recap.aEcrire} to update${recap.dejaAJour ? ` · ${recap.dejaAJour} already up to date on all these fields` : ""}: one write per item, empty fields do not change.`}</span>
              )}
            </div>
          )}
          <button type="button" className="apply" disabled={!peutAppliquer} onClick={appliquer}
            style={{ ...TACTILE, flex: "1 1 100%", fontSize: 13 }}>
            {occupe ? "…" : peutAppliquer
              ? (fr ? `Appliquer à ${recap.aEcrire} article${recap.aEcrire > 1 ? "s" : ""}` : `Apply to ${recap.aEcrire} item${recap.aEcrire > 1 ? "s" : ""}`)
              : (fr ? "Appliquer" : "Apply")}
          </button>
          </>)}
        </div>
      )}
    </>
  );
}
