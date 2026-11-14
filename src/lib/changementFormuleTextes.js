// (14/11/2026, bloc F — Nico) Les textes de la fenêtre avant un changement de formule (pur, Node + navigateur) :
// components/FenetreChangementFormule.jsx ; verrou scripts/changement-formule-essai-selftest.mjs.
const NOMS = { standard: "Premium", premium: "Premium", pro: "Pro", business: "Business",
  premium_cloud: "Premium + Cloud", pro_cloud: "Pro + Cloud", business_cloud: "Business + Cloud", cloud: "FillSell Cloud" };
export const nomFormule = (f) => NOMS[f] ?? String(f ?? "");
export function montantDit(centimes, devise = "eur", lang = "fr") {
  if (!Number.isFinite(centimes)) return null;
  return (centimes / 100).toLocaleString(lang === "en" ? "en-GB" : "fr-FR", { style: "currency", currency: String(devise || "eur").toUpperCase() });
}

/** Les textes de la fenêtre (pur, testé : scripts/changement-formule-essai-selftest.mjs). */
export function textesFenetre(devis, lang = "fr") {
  const en = lang === "en";
  const m = montantDit(devis?.montant_centimes, devis?.devise, lang);
  const mAlt = devis?.alternative ? montantDit(devis.alternative.montant_centimes, devis?.devise, lang) : null;
  const nom = nomFormule(devis?.formule);
  const nomAlt = devis?.alternative ? nomFormule(devis.alternative.formule) : null;
  return {
    titre: devis?.essai ? (en ? "Your free trial stops" : "Ton essai gratuit s'arrête") : (en ? "Change of plan" : "Changer de formule"),
    phrase: devis?.essai
      ? (en ? `Your free trial stops: you'll be charged ${m} now.` : `Ton essai gratuit s'arrête : tu seras débité maintenant de ${m}.`)
      : (en ? `You'll be charged ${m} now.` : `Tu seras débité maintenant de ${m}.`),
    choixCloud: nomAlt && mAlt ? (en ? `${nomAlt} — ${mAlt} now` : `${nomAlt} — ${mAlt} maintenant`) : null,
    choixCloudPourquoi: nomAlt ? (en ? "You keep FillSell Cloud: you publish without a computer." : "Tu gardes FillSell Cloud : tu publies sans ordinateur.") : null,
    choixCloudPhrase: nomAlt && mAlt && devis?.essai
      ? (en ? `Your free trial stops: you'll be charged ${mAlt} now.` : `Ton essai gratuit s'arrête : tu seras débité maintenant de ${mAlt}.`) : null,
    choixSeul: devis?.perd_cloud ? (en ? `${nom} only — ${m} now` : `${nom} seul — ${m} maintenant`) : (en ? `Confirm: ${nom} — ${m} now` : `Confirmer : ${nom} — ${m} maintenant`),
    avertissementSansCloud: devis?.perd_cloud ? (en ? "Without Cloud: you won't be able to publish without a computer any more." : "Sans Cloud : tu ne pourras plus publier sans ordinateur.") : null,
    garder: en ? "Keep my current plan" : "Garder ma formule actuelle",
    garderPourquoi: en ? "Nothing changes." : "Rien ne change.",
    pied: en ? "The charge is made as soon as you confirm. If the payment doesn't go through, nothing changes."
      : "Le prélèvement est fait dès que tu confirmes. S'il n'aboutit pas, rien ne change.",
  };
}
