import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { UI } from "../components/ui";

// Page d'accès à l'extension Chrome de cross-post. L'extension n'est PAS encore
// publiée sur le Chrome Web Store : on documente donc uniquement l'installation
// en mode développeur (charger le dossier `chrome-extension/` non empaqueté).
export default function ExtensionPage() {
  const nav = useNavigate();
  const [lang] = useState(() => localStorage.getItem("fs_lang") || "fr");
  const en = lang === "en";

  const steps = en
    ? [
        ["Get the extension folder", "Download or clone the FillSell repository, then locate the chrome-extension/ folder inside it."],
        ["Open the extensions page", "In Chrome, go to chrome://extensions (paste it in the address bar)."],
        ["Enable Developer mode", "Toggle Developer mode on, top-right of the page."],
        ["Load unpacked", "Click « Load unpacked » and select the chrome-extension/ folder."],
        ["Sign in", "Click the extension icon → « Sign in » → log in on fillsell.app. The extension picks up your session automatically."],
      ]
    : [
        ["Récupère le dossier de l'extension", "Télécharge ou clone le dépôt FillSell, puis repère le dossier chrome-extension/ à l'intérieur."],
        ["Ouvre la page des extensions", "Dans Chrome, va sur chrome://extensions (colle l'adresse dans la barre d'URL)."],
        ["Active le mode développeur", "Active le « Mode développeur » en haut à droite de la page."],
        ["Charge l'extension non empaquetée", "Clique sur « Charger l'extension non empaquetée » et sélectionne le dossier chrome-extension/."],
        ["Connecte-toi", "Clique sur l'icône de l'extension → « Se connecter » → connecte-toi sur fillsell.app. L'extension récupère ta session automatiquement."],
      ];

  return (
    <div style={{ minHeight: "100vh", background: UI.canvas, fontFamily: "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", color: UI.ink }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 18px 48px" }}>

        {/* Header */}
        <button
          onClick={() => nav("/app")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: UI.mute2, fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "6px 0", marginBottom: 12, fontFamily: "inherit" }}
        >
          ← {en ? "Back to app" : "Retour à l'app"}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 30 }}>🧩</span>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>
            {en ? "Chrome extension" : "Extension Chrome"}
          </h1>
        </div>
        <p style={{ margin: "0 0 20px", fontSize: 14, lineHeight: 1.5, color: UI.mute2 }}>
          {en
            ? "The FillSell extension auto-fills your generated listings on Vinted, Leboncoin, Beebs and eBay, straight from your browser."
            : "L'extension FillSell publie automatiquement tes annonces générées sur Vinted, Leboncoin, Beebs et eBay, directement depuis ton navigateur."}
        </p>

        {/* Bandeau : pas encore sur le Web Store */}
        <div style={{ background: `${UI.amber}18`, border: `1px solid ${UI.amber}66`, borderRadius: 14, padding: "12px 14px", marginBottom: 20, fontSize: 13, lineHeight: 1.5, color: "#8A5A3C" }}>
          ⏳ {en
            ? "Not on the Chrome Web Store yet. For now, install it manually in developer mode — it only takes a minute."
            : "Pas encore disponible sur le Chrome Web Store. Pour l'instant, installe-la manuellement en mode développeur — ça prend une minute."}
        </div>

        {/* Étapes */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {steps.map(([title, body], i) => (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", background: UI.card, border: `1px solid ${UI.border}`, borderRadius: 16, padding: "14px 16px", boxShadow: "0 1px 4px rgba(16,32,27,0.05)" }}>
              <span style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: "50%", background: `linear-gradient(155deg,${UI.teal},${UI.tealDeep})`, color: "#FFFFFF", fontSize: 14, fontWeight: 700 }}>
                {i + 1}
              </span>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 3 }}>{title}</div>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: UI.mute2 }}>{body}</div>
              </div>
            </div>
          ))}
        </div>

        <p style={{ margin: "22px 4px 0", fontSize: 12, lineHeight: 1.55, color: UI.mute }}>
          {en
            ? "Once loaded, use the FillSell app as usual: every listing you publish is queued and the extension fills the platform forms for you. A Web Store version will replace this manual step soon."
            : "Une fois chargée, utilise l'app FillSell normalement : chaque annonce publiée est mise en file et l'extension remplit les formulaires des plateformes pour toi. Une version Web Store remplacera bientôt cette étape manuelle."}
        </p>

      </div>
    </div>
  );
}
