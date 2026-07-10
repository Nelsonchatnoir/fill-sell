import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { UI } from "../components/ui";

// Page d'accès à l'extension Chrome de cross-post. L'extension n'est PAS encore
// publiée sur le Chrome Web Store, on propose donc le téléchargement direct du
// zip (généré au build depuis chrome-extension/, cf.
// scripts/vite-plugin-zip-extension.mjs, servi statiquement en
// /fillsell-extension.zip) puis l'installation en mode développeur. Le dépôt
// GitHub (privé) n'est jamais exposé.
const EXTENSION_ZIP_URL = "/fillsell-extension.zip";

export default function ExtensionPage() {
  const nav = useNavigate();
  const [lang] = useState(() => localStorage.getItem("fs_lang") || "fr");
  const en = lang === "en";

  const steps = en
    ? [
        ["Download & unzip", "Download the .zip above, then unzip it. You'll get a folder named fillsell-extension/."],
        ["Open the extensions page", "In Chrome, go to chrome://extensions (paste it in the address bar)."],
        ["Enable Developer mode", "Toggle Developer mode on, top-right of the page."],
        ["Load unpacked", "Click « Load unpacked » and select the unzipped fillsell-extension/ folder."],
        ["Sign in", "Click the extension icon → « Sign in » → log in on fillsell.app. The extension picks up your session automatically."],
      ]
    : [
        ["Télécharge & dézippe", "Télécharge le fichier .zip ci-dessus, puis dézippe-le. Tu obtiens un dossier nommé fillsell-extension/."],
        ["Ouvre la page des extensions", "Dans Chrome, va sur chrome://extensions (colle l'adresse dans la barre d'URL)."],
        ["Active le mode développeur", "Active le « Mode développeur » en haut à droite de la page."],
        ["Charge l'extension non empaquetée", "Clique sur « Charger l'extension non empaquetée » et sélectionne le dossier fillsell-extension/ dézippé."],
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
        <div style={{ background: `${UI.amber}18`, border: `1px solid ${UI.amber}66`, borderRadius: 14, padding: "12px 14px", marginBottom: 16, fontSize: 13, lineHeight: 1.5, color: "#8A5A3C" }}>
          ⏳ {en
            ? "Not on the Chrome Web Store yet. For now, download it below and install it in developer mode — it only takes a minute."
            : "Pas encore disponible sur le Chrome Web Store. Pour l'instant, télécharge-la ci-dessous et installe-la en mode développeur — ça prend une minute."}
        </div>

        {/* Téléchargement direct du zip (généré au build, servi statiquement) */}
        <a
          href={EXTENSION_ZIP_URL}
          download
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", boxSizing: "border-box", padding: "15px 0", borderRadius: 999, marginBottom: 22, textDecoration: "none", fontSize: 15, fontWeight: 700, color: "#FFFFFF", background: `linear-gradient(120deg,${UI.teal},${UI.tealDeep})`, boxShadow: "0 10px 24px rgba(47,158,144,0.28)" }}
        >
          <span style={{ fontSize: 18 }}>⬇️</span>
          {en ? "Download the extension (.zip)" : "Télécharger l'extension (.zip)"}
        </a>

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
