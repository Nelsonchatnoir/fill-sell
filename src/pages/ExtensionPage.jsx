import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { UI } from "../components/ui";

// Page d'accès à l'extension Chrome de cross-post. L'extension n'est PAS encore
// publiée sur le Chrome Web Store, on propose donc le téléchargement direct du
// zip (généré au build depuis chrome-extension/, cf.
// scripts/vite-plugin-zip-extension.mjs, servi statiquement en
// /fillsell-extension.zip) puis l'installation en mode développeur. Le dépôt
// GitHub (privé) n'est jamais exposé.
//
// Les captures de public/extension-guide/ ont été prises le 2026-07-12 sur un
// profil Chrome vierge (150.x, UI française) en déroulant le vrai parcours :
// à refaire si l'UI de chrome://extensions change de façon visible.
const EXTENSION_ZIP_URL = "/fillsell-extension.zip";
const GUIDE = "/extension-guide";

export default function ExtensionPage() {
  const nav = useNavigate();
  const [lang] = useState(() => localStorage.getItem("fs_lang") || "fr");
  const en = lang === "en";

  // [titre, instruction, image?, alt?]
  const steps = en
    ? [
        ["Download & unzip",
          "Download the .zip above, then unzip it (right-click → Extract All). You get a folder named fillsell-extension/ in your Downloads.",
          null, null],
        ["Open the extensions page",
          "In Chrome, paste chrome://extensions in the address bar. The « Developer mode » toggle sits top-right, still off.",
          `${GUIDE}/extension-install-step-1-devmode-off.png`,
          "chrome://extensions page with the Developer mode toggle off, top-right"],
        ["Turn on Developer mode",
          "Click the toggle, top-right. A new row of buttons appears under the search bar.",
          `${GUIDE}/extension-install-step-2-devmode-on.png`,
          "Developer mode toggle on: a row of developer buttons is now visible"],
        ["Click « Load unpacked »",
          "It's the first button of the new row, top-left.",
          `${GUIDE}/extension-install-step-3-load-unpacked.png`,
          "The Load unpacked button in the developer toolbar"],
        ["Select the fillsell-extension folder",
          "In the window that opens, go to Downloads, pick the unzipped fillsell-extension folder, then click « Select folder ».",
          `${GUIDE}/extension-install-step-4-select-folder.png`,
          "Folder picker on Downloads with the fillsell-extension folder selected"],
        ["The extension is installed",
          "« FillSell — Cross-post » now shows in your extensions list, with its icon.",
          `${GUIDE}/extension-install-step-5-loaded.png`,
          "FillSell — Cross-post card visible in the chrome://extensions list"],
        ["Pin the icon",
          "Click the puzzle piece right of the address bar, then the pin next to « FillSell — Cross-post ». The icon stays visible in the toolbar.",
          `${GUIDE}/extension-install-step-6-toolbar-icon.png`,
          "FillSell icon pinned in the Chrome toolbar, next to the puzzle piece"],
        ["Sign in",
          "Click the FillSell icon → « Sign in » → log in on fillsell.app. The extension picks up your session automatically.",
          null, null],
      ]
    : [
        ["Télécharge & dézippe",
          "Télécharge le fichier .zip ci-dessus, puis dézippe-le (clic droit → Extraire tout). Tu obtiens un dossier fillsell-extension/ dans Téléchargements.",
          null, null],
        ["Ouvre la page des extensions",
          "Dans Chrome, colle chrome://extensions dans la barre d'adresse. Le bouton « Mode développeur » est en haut à droite, encore désactivé.",
          `${GUIDE}/extension-install-step-1-devmode-off.png`,
          "Page chrome://extensions avec le bouton Mode développeur désactivé, en haut à droite"],
        ["Active le Mode développeur",
          "Clique le bouton en haut à droite. Une nouvelle rangée de boutons apparaît sous la barre de recherche.",
          `${GUIDE}/extension-install-step-2-devmode-on.png`,
          "Mode développeur activé : une rangée de boutons développeur est apparue"],
        ["Clique « Charger l'extension non empaquetée »",
          "C'est le premier bouton de la nouvelle rangée, en haut à gauche.",
          `${GUIDE}/extension-install-step-3-load-unpacked.png`,
          "Le bouton Charger l'extension non empaquetée dans la barre développeur"],
        ["Sélectionne le dossier fillsell-extension",
          "Dans la fenêtre qui s'ouvre, va dans Téléchargements, choisis le dossier fillsell-extension dézippé, puis clique « Sélectionner un dossier ».",
          `${GUIDE}/extension-install-step-4-select-folder.png`,
          "Fenêtre de sélection sur Téléchargements avec le dossier fillsell-extension"],
        ["L'extension est installée",
          "« FillSell — Cross-post » apparaît dans ta liste d'extensions, avec son icône.",
          `${GUIDE}/extension-install-step-5-loaded.png`,
          "Carte FillSell — Cross-post visible dans la liste chrome://extensions"],
        ["Épingle l'icône",
          "Clique la pièce de puzzle à droite de la barre d'adresse, puis l'épingle à côté de « FillSell — Cross-post ». L'icône reste visible dans la barre d'outils.",
          `${GUIDE}/extension-install-step-6-toolbar-icon.png`,
          "Icône FillSell épinglée dans la barre d'outils Chrome, à côté de la pièce de puzzle"],
        ["Connecte-toi",
          "Clique sur l'icône FillSell → « Se connecter » → connecte-toi sur fillsell.app. L'extension récupère ta session automatiquement.",
          null, null],
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

        {/* Étapes illustrées */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {steps.map(([title, body, img, alt], i) => (
            <div key={i} style={{ background: UI.card, border: `1px solid ${UI.border}`, borderRadius: 16, padding: "14px 16px", boxShadow: "0 1px 4px rgba(16,32,27,0.05)" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: "50%", background: `linear-gradient(155deg,${UI.teal},${UI.tealDeep})`, color: "#FFFFFF", fontSize: 14, fontWeight: 700 }}>
                  {i + 1}
                </span>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 3 }}>{title}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.5, color: UI.mute2 }}>{body}</div>
                </div>
              </div>
              {img && (
                <img
                  src={img}
                  alt={alt}
                  loading="lazy"
                  style={{ display: "block", width: "100%", marginTop: 12, borderRadius: 10, border: `1px solid ${UI.border}`, boxShadow: "0 1px 3px rgba(16,32,27,0.06)" }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Rappel : l'avertissement Mode développeur de Chrome est normal */}
        <div style={{ background: `${UI.amber}18`, border: `1px solid ${UI.amber}66`, borderRadius: 14, padding: "12px 14px", marginTop: 16, fontSize: 13, lineHeight: 1.55, color: "#8A5A3C" }}>
          💡 {en
            ? "At startup, Chrome may show a « Developer mode extensions » warning: that's expected for any extension installed outside the Web Store. Dismiss it with ✕ — but don't turn Developer mode off, or the extension will be disabled."
            : "Au démarrage, Chrome peut afficher un avertissement « Mode développeur activé » : c'est normal pour toute extension installée hors Web Store. Ferme-le avec ✕ — mais ne désactive pas le Mode développeur, sinon l'extension sera coupée."}
        </div>

        <p style={{ margin: "22px 4px 0", fontSize: 12, lineHeight: 1.55, color: UI.mute }}>
          {en
            ? "Once loaded, use the FillSell app as usual: every listing you publish is queued and the extension fills the platform forms for you. A Web Store version will replace this manual step soon."
            : "Une fois chargée, utilise l'app FillSell normalement : chaque annonce publiée est mise en file et l'extension remplit les formulaires des plateformes pour toi. Une version Web Store remplacera bientôt cette étape manuelle."}
        </p>

        <p style={{ margin: "14px 4px 0", fontSize: 12, lineHeight: 1.55, color: UI.mute }}>
          {en ? "Trouble installing? " : "Un souci avec l'installation ? "}
          <a href="mailto:support@fillsell.app" style={{ color: UI.teal, fontWeight: 600, textDecoration: "none" }}>support@fillsell.app</a>
        </p>

      </div>
    </div>
  );
}
