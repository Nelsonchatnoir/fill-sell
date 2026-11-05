import { useNavigate } from "react-router-dom";
import useSeo from "../lib/seo";
import { UI } from "../components/ui";
import { languePage } from "./languePage";

// Atterrissage après le consentement eBay (lot 0, 05/09/2026). La fonction
// ebay-oauth-callback a déjà tout fait (échange du code, stockage) et renvoie
// le navigateur ici avec ?etat=ok|refus|erreur[&motif=…]. Aucun jeton, aucun
// code dans l'URL — seulement un état à dire en clair. Page PUBLIQUE : sur
// mobile natif elle s'ouvre dans le navigateur système, sans session FillSell.
const MOTIFS = {
  state_expire: "la demande a expiré (plus de 15 minutes entre le clic et le retour)",
  state_signature: "la demande ne venait pas de FillSell",
  state_illisible: "la demande était illisible",
  config_incomplete: "la connexion eBay n'est pas encore configurée côté FillSell",
  stockage: "l'enregistrement a échoué côté FillSell",
  invalid_grant: "eBay a refusé le code reçu (déjà utilisé ou expiré)",
  parametres_absents: "eBay n'a rien renvoyé",
};
// (05/11 soir, phase 3) Les mêmes motifs en anglais.
const MOTIFS_EN = {
  state_expire: "the request expired (more than 15 minutes between the click and the return)",
  state_signature: "the request did not come from FillSell",
  state_illisible: "the request could not be read",
  config_incomplete: "the eBay connection is not set up on FillSell's side yet",
  stockage: "saving failed on FillSell's side",
  invalid_grant: "eBay refused the code it sent (already used or expired)",
  parametres_absents: "eBay sent nothing back",
};

export default function EbayRetour() {
  const navigate = useNavigate();
  // (05/11 soir, phase 3) La langue de la page : ?lang, puis le réglage de l'app, puis celle du navigateur.
  const en = languePage() === "en";
  useSeo({ path: "/ebay/retour", title: en ? "eBay connection — FillSell" : "Connexion eBay — FillSell", robots: "noindex" });
  const params = new URLSearchParams(window.location.search);
  const etat = params.get("etat") ?? "erreur";
  const motif = params.get("motif") ?? "";

  const contenu = en ? (etat === "ok"
    ? { emoji: "✅", titre: "eBay account connected", texte: "FillSell can now read the status of your seller account. You'll find the connection in Settings, eBay section." }
    : etat === "refus"
      ? { emoji: "↩️", titre: "Connection declined", texte: "You declined access on eBay: nothing was saved. You can start again whenever you like from Settings." }
      : { emoji: "⚠️", titre: "The connection did not go through", texte: `Nothing was saved${MOTIFS_EN[motif] ? `: ${MOTIFS_EN[motif]}` : ""}. Start again from FillSell's Settings.` })
    : etat === "ok"
    ? { emoji: "✅", titre: "Compte eBay connecté", texte: "FillSell peut maintenant lire l'état de ton compte vendeur. Tu retrouves la connexion dans les Paramètres, section eBay." }
    : etat === "refus"
      ? { emoji: "↩️", titre: "Connexion refusée", texte: "Tu as refusé l'accès chez eBay : rien n'a été enregistré. Tu peux recommencer quand tu veux depuis les Paramètres." }
      : { emoji: "⚠️", titre: "La connexion n'a pas abouti", texte: `Rien n'a été enregistré${MOTIFS[motif] ? ` : ${MOTIFS[motif]}` : ""}. Reprends depuis les Paramètres de FillSell.` };

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: UI.canvas, padding: 24, boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: 420, background: UI.card, border: `1px solid ${UI.border}`, borderRadius: 24, padding: 28, textAlign: "center", boxShadow: "0 24px 64px rgba(16,32,27,0.12)" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>{contenu.emoji}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: UI.ink, marginBottom: 10, letterSpacing: "-0.3px" }}>{contenu.titre}</div>
        <div style={{ fontSize: 14, color: UI.mute2, lineHeight: 1.6, marginBottom: 24 }}>{contenu.texte}</div>
        <button
          onClick={() => navigate("/app", { replace: true })}
          style={{ width: "100%", padding: 14, border: "none", borderRadius: 14, background: `linear-gradient(120deg,${UI.teal},${UI.tealDeep})`, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          {en ? "Open FillSell →" : "Ouvrir FillSell →"}
        </button>
        <div style={{ fontSize: 11.5, color: UI.mute, marginTop: 14, lineHeight: 1.5 }}>
          {en ? "On a phone: just close this page and go back to the app." : "Sur téléphone : referme simplement cette page et reviens dans l'app."}
        </div>
      </div>
    </div>
  );
}
