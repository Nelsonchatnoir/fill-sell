// ═══════════════════════════════════════════════════════════════════════════
// L'ADRESSE DE REMISE, DEMANDÉE DANS LE LOT (10/11/2026, URGENT d0ac0538)
// ═══════════════════════════════════════════════════════════════════════════
// Le défaut : un compte sans adresse de remise (cliente FillSell Cloud, nouvelle inscrite) préparait un lot vers
// Leboncoin et Beebs — les deux la réclament à chaque annonce. Le moteur les retirait (lbcAdresseManquante), chaque
// article restait « À vérifier — Coche la plateforme où publier : eBay, Depop », le bouton « Réponds aux questions »
// restait gris, et RIEN dans le lot ne permettait de saisir l'adresse : un cul-de-sac, quitté sans envoi.
// La règle : le lot demande l'adresse UNE fois, ici, avec la MÊME écriture que Réglages › Expédition
// (SousPageExpedition) — trois champs recomposés en une chaîne, platform_settings_fusionner (champs d'adresse
// seulement), avertissement hors de France AVANT la BAN, vérification BAN au clic (identique → enregistrée ;
// différente → proposée, la saisie reste forçable ; introuvable → « enregistrer quand même » ; service en panne →
// enregistrée). Enregistrée : `onEnregistree()` — le lot fait relire l'adresse à chaque moteur, les articles repartent.
import { useState } from "react";
import { fusionnerReglages } from "../../utils/reglagesPlateformes";
import { adresseLbcHorsFrance } from "../../../supabase/functions/_shared/lbc-adresse-france.js";
import { NOM } from "../texte";

const normBan = (s) => String(s ?? "").toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** La phrase d'en-tête : quelles plateformes attendent l'adresse. Pure (selftest). */
function phraseAdresseDuLot(plateformes = [], n = 0, en = false) {
  const noms = [...new Set(plateformes)].map((p) => NOM(p));
  const liste = noms.length > 1 ? `${noms.slice(0, -1).join(", ")}${en ? " and " : " et "}${noms[noms.length - 1]}` : (noms[0] ?? "Leboncoin");
  return en
    ? `${liste} ask for a pickup address on every listing, and yours isn't filled in yet: ${n > 1 ? `your ${n} items` : "your item"} can't go out there without it. Enter it once here — it's saved in Settings › Shipping for your next listings.`
    : `${liste} ${noms.length > 1 ? "demandent" : "demande"} une adresse de remise à chaque annonce, et la tienne n'est pas encore renseignée : ${n > 1 ? `tes ${n} articles ne peuvent pas y partir` : "ton article ne peut pas y partir"} sans elle. Saisis-la une fois ici — elle est gardée dans Réglages › Expédition pour tes prochaines annonces.`;
}

export default function AdresseRemiseDuLot({ en = false, plateformes = [], nArticles = 0, onEnregistree }) {
  const [rue, setRue] = useState("");
  const [cp, setCp] = useState("");
  const [ville, setVille] = useState("");
  const [ban, setBan] = useState(null); // null | { kind: 'hors_france' | 'introuvable' | 'proposition', … }
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [faite, setFaite] = useState(false);
  const cpValide = /^\d{5}$/.test(cp.trim());
  const pret = rue.trim().length > 2 && cpValide && ville.trim().length > 1;

  const enregistrer = async (r, p, v) => {
    const adresse = [r, p, v].filter(Boolean).join(" ");
    const { data: ps, error } = await fusionnerReglages(["leboncoin"], { rue: r, code_postal: p, ville: v, adresse });
    if (error || !ps) { setErreur(en ? "Not saved — check your connection and try again." : "Pas enregistrée — vérifie ta connexion et réessaie."); return; }
    setErreur(null); setBan(null); setFaite(true);
    try { await onEnregistree?.(); } catch { /* les moteurs relisent à leur rythme */ }
  };

  const verifierPuisEnregistrer = async (force = false) => {
    setEnCours(true); setErreur(null);
    const r = rue.trim(); const p = cp.trim(); const v = ville.trim();
    try {
      if (!force && adresseLbcHorsFrance({ rue: r, code_postal: p, ville: v }).horsFrance) { setBan({ kind: "hors_france" }); return; }
      if (force) { await enregistrer(r, p, v); return; }
      const saisie = [r, p, v].filter(Boolean).join(" ");
      let feature = null; let banIndisponible = false;
      try {
        const rep = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(saisie)}&limit=1&autocomplete=0`);
        if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
        feature = (await rep.json())?.features?.[0] ?? null;
      } catch { banIndisponible = true; }
      if (banIndisponible) { await enregistrer(r, p, v); return; }
      if (!feature || Number(feature.properties?.score ?? 0) < 0.4) { setBan({ kind: "introuvable" }); return; }
      const pr = feature.properties ?? {};
      const banRue = String(pr.name ?? "").trim();
      const banCp = String(pr.postcode ?? p).trim();
      const banVille = String(pr.city ?? v).trim();
      const banAdresse = [banRue, banCp, banVille].filter(Boolean).join(" ");
      if (normBan(banAdresse) === normBan(saisie)) await enregistrer(r, p, v);
      else setBan({ kind: "proposition", rue: banRue, cp: banCp, ville: banVille, label: String(pr.label ?? banAdresse) });
    } finally { setEnCours(false); }
  };

  if (faite) {
    return (
      <div className="fsn-card" data-bloc="adresse-remise">
        <p className="fsn-small"><b>{en ? "✓ Pickup address saved." : "✓ Adresse de remise enregistrée."}</b> {en ? "Your items are being checked again." : "Tes articles sont revérifiés."}</p>
      </div>
    );
  }
  return (
    <div className="fsn-card" data-bloc="adresse-remise" style={{ gap: 10 }}>
      <div className="fsn-card-t">{en ? "Your pickup address" : "Ton adresse de remise"}</div>
      <p className="fsn-small">{phraseAdresseDuLot(plateformes, nArticles, en)}</p>
      <input className="fsn-input" value={rue} onChange={(e) => { setRue(e.target.value.slice(0, 120)); setBan(null); }}
        placeholder={en ? "Street and number" : "Numéro et rue"} aria-label={en ? "Street" : "Rue"} autoComplete="street-address" />
      <div style={{ display: "flex", gap: 8 }}>
        <input className="fsn-input" value={cp} onChange={(e) => { setCp(e.target.value.replace(/\D/g, "").slice(0, 5)); setBan(null); }}
          placeholder={en ? "Postcode" : "Code postal"} aria-label={en ? "Postcode" : "Code postal"} inputMode="numeric" autoComplete="postal-code" style={{ width: 130, flex: "none" }} />
        <input className="fsn-input" value={ville} onChange={(e) => { setVille(e.target.value.slice(0, 80)); setBan(null); }}
          placeholder={en ? "City" : "Ville"} aria-label={en ? "City" : "Ville"} autoComplete="address-level2" style={{ flex: 1, minWidth: 0 }} />
      </div>
      {ban?.kind === "hors_france" && (
        <p className="fsq-note">{en ? "This postcode isn't in France: Leboncoin only takes French addresses, so FillSell won't publish there with it. You can save it anyway (Beebs isn't affected)." : "Ce code postal n'est pas en France : Leboncoin n'accepte que les adresses françaises, FillSell n'y publiera pas avec elle. Tu peux l'enregistrer quand même (Beebs n'est pas concernée)."}</p>
      )}
      {ban?.kind === "introuvable" && (
        <p className="fsq-note">{en ? "We couldn't find this address in the official French address base. Check it, or save it as typed." : "On ne trouve pas cette adresse dans la base officielle des adresses. Vérifie-la, ou enregistre-la telle quelle."}</p>
      )}
      {ban?.kind === "proposition" && (
        <div className="fsn-choices fsq-puces">
          <span className="fsq-note">{en ? "Did you mean: " : "Tu voulais dire : "}<b>{ban.label}</b> ?</span>
          <button type="button" className="fsn-choice" disabled={enCours}
            onClick={() => { setRue(ban.rue); setCp(ban.cp); setVille(ban.ville); setEnCours(true); enregistrer(ban.rue, ban.cp, ban.ville).finally(() => setEnCours(false)); }}>
            {en ? "Yes, use it" : "Oui, celle-ci"}</button>
          <button type="button" className="fsn-choice" disabled={enCours} onClick={() => verifierPuisEnregistrer(true)}>{en ? "Keep mine" : "Garder la mienne"}</button>
        </div>
      )}
      {erreur ? <p className="fsq-faux" role="alert">{erreur}</p> : null}
      {ban?.kind === "hors_france" || ban?.kind === "introuvable" ? (
        <button type="button" className="fsn-btn fsn-btn--secondary" disabled={enCours} onClick={() => verifierPuisEnregistrer(true)}>{en ? "Save anyway" : "Enregistrer quand même"}</button>
      ) : ban?.kind === "proposition" ? null : (
        <button type="button" className="fsn-btn fsn-btn--primary" disabled={!pret || enCours} onClick={() => verifierPuisEnregistrer(false)}>
          {enCours ? (en ? "Checking…" : "Vérification…") : (en ? "Save my address" : "Enregistrer mon adresse")}</button>
      )}
    </div>
  );
}
