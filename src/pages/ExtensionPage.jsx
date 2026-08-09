import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { UI } from "../components/ui";
import useSeo from "../lib/seo";

// Page d'accès à l'extension Chrome de cross-post. Depuis le 2026-07-25,
// l'extension est PUBLIÉE sur le Chrome Web Store (« FillSell — Cross-post »,
// id ooeagobimgoabciggfamljdfpkginhnm) : l'installation en un clic avec
// mise à jour automatique remplace l'ancien parcours zip + mode développeur.
// Le zip reste généré à chaque build (vite-plugin-zip-extension) et servi en
// /fillsell-extension.zip — conservé en repli discret pour les navigateurs
// Chromium sans accès au Web Store ; le guide illustré du parcours manuel
// (public/extension-guide/) n'est plus affiché mais les captures restent en
// place si besoin de le ressusciter.
const WEBSTORE_URL = "https://chromewebstore.google.com/detail/ooeagobimgoabciggfamljdfpkginhnm";
const EXTENSION_ZIP_URL = "/fillsell-extension.zip";
const GUIDE = "/extension-guide";

export default function ExtensionPage() {
  const nav = useNavigate();
  const [lang] = useState(() => localStorage.getItem("fs_lang") || "fr");
  const en = lang === "en";

  // Page à potentiel SEO (« extension revente vinted », « publier vinted
  // leboncoin automatiquement ») : on lui donne ses propres meta plutôt que de
  // la masquer en noindex. ⚠️ Elle reste derrière RequireAuth dans le routeur :
  // un visiteur (ou un crawler) déconnecté est redirigé vers / AVANT ce rendu,
  // donc ces meta ne s'appliquent aujourd'hui qu'aux utilisateurs connectés.
  // Pour que la page puisse réellement ranker, il faudra la servir sans garde
  // d'auth (décision produit non prise) — c'est aussi pour ça qu'elle n'est pas
  // encore au sitemap.
  useSeo({
    path: "/extension",
    title: "Extension Chrome FillSell — publier sur Vinted, Leboncoin, eBay",
    description: "Installez l'extension Chrome FillSell : une annonce publiée en une fois sur Vinted, Leboncoin, eBay et Beebs, et retirée des autres plateformes en un tap après la vente.",
    ogTitle: "Extension Chrome FillSell — une annonce, 4 plateformes",
    ogType: "website",
  });

  // [titre, instruction, image?, alt?]
  const steps = en
    ? [
        ["Install from the Chrome Web Store",
          "Click the button above, then « Add to Chrome » on the store page. That's it — the extension updates itself automatically from now on.",
          null, null],
        ["Pin the icon",
          "Click the puzzle piece right of the address bar, then the pin next to « FillSell — Cross-post ». The icon stays visible in the toolbar.",
          `${GUIDE}/extension-install-step-6-toolbar-icon.png`,
          "FillSell icon pinned in the Chrome toolbar, next to the puzzle piece"],
        ["Sign in",
          "Click the FillSell icon → « Sign in » → log in on fillsell.app. The extension picks up your session automatically. Then log in to your Vinted, Leboncoin, Beebs and eBay accounts in your browser as usual — the extension uses these active sessions to list on your behalf.",
          null, null],
      ]
    : [
        ["Installe depuis le Chrome Web Store",
          "Clique le bouton ci-dessus, puis « Ajouter à Chrome » sur la fiche du store. C'est tout — l'extension se met désormais à jour toute seule.",
          null, null],
        ["Épingle l'icône",
          "Clique la pièce de puzzle à droite de la barre d'adresse, puis l'épingle à côté de « FillSell — Cross-post ». L'icône reste visible dans la barre d'outils.",
          `${GUIDE}/extension-install-step-6-toolbar-icon.png`,
          "Icône FillSell épinglée dans la barre d'outils Chrome, à côté de la pièce de puzzle"],
        ["Connecte-toi",
          "Clique sur l'icône FillSell → « Se connecter » → connecte-toi sur fillsell.app. L'extension récupère ta session automatiquement. Connecte-toi ensuite à tes comptes Vinted, Leboncoin, Beebs et eBay dans ton navigateur, comme d'habitude — l'extension utilise ces sessions actives pour publier à ta place.",
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

        {/* Disponible sur le Web Store (2026-07-25) */}
        <div style={{ background: "#E7F3F0", border: `1px solid ${UI.teal}66`, borderRadius: 14, padding: "12px 14px", marginBottom: 16, fontSize: 13, lineHeight: 1.5, color: UI.tealDeep, fontWeight: 600 }}>
          ✅ {en
            ? "Now on the Chrome Web Store — one-click install, automatic updates."
            : "Disponible sur le Chrome Web Store — installation en un clic, mises à jour automatiques."}
        </div>

        {/* CTA principal : fiche Chrome Web Store */}
        <a
          href={WEBSTORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", boxSizing: "border-box", padding: "15px 0", borderRadius: 999, marginBottom: 22, textDecoration: "none", fontSize: 15, fontWeight: 700, color: "#FFFFFF", background: `linear-gradient(120deg,${UI.teal},${UI.tealDeep})`, boxShadow: "0 10px 24px rgba(47,158,144,0.28)" }}
        >
          <span style={{ fontSize: 18 }}>🧩</span>
          {en ? "Install from the Chrome Web Store" : "Installer depuis le Chrome Web Store"}
        </a>

        {/* Étapes */}
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

        {/* Migration depuis l'ancienne installation zip / mode développeur :
            DEUX copies actives pollent les mêmes jobs et publieraient en
            double — l'ancienne doit être retirée. */}
        <div style={{ background: `${UI.amber}18`, border: `1px solid ${UI.amber}66`, borderRadius: 14, padding: "12px 14px", marginTop: 16, fontSize: 13, lineHeight: 1.55, color: "#8A5A3C" }}>
          ⚠️ {en
            ? "Had the previous .zip version (developer mode)? Remove it in chrome://extensions once the Web Store version is installed — two active copies would publish your listings twice."
            : "Tu avais l'ancienne version .zip (mode développeur) ? Supprime-la dans chrome://extensions une fois la version Web Store installée — deux copies actives publieraient tes annonces en double."}
        </div>

        <p style={{ margin: "22px 4px 0", fontSize: 12, lineHeight: 1.55, color: UI.mute }}>
          {en
            ? "Once installed, use the FillSell app as usual: every listing you publish is queued and the extension fills the platform forms for you."
            : "Une fois installée, utilise l'app FillSell normalement : chaque annonce publiée est mise en file et l'extension remplit les formulaires des plateformes pour toi."}
        </p>

        {/* Repli : navigateurs Chromium sans accès au Web Store */}
        <p style={{ margin: "14px 4px 0", fontSize: 12, lineHeight: 1.55, color: UI.mute }}>
          {en ? "Browser without Web Store access? " : "Navigateur sans accès au Web Store ? "}
          <a href={EXTENSION_ZIP_URL} download style={{ color: UI.teal, fontWeight: 600, textDecoration: "none" }}>
            {en ? "Manual install (.zip)" : "Installation manuelle (.zip)"}
          </a>
          {en ? " — unzip, then « Load unpacked » in chrome://extensions (developer mode)." : " — dézippe, puis « Charger l'extension non empaquetée » dans chrome://extensions (mode développeur)."}
        </p>

        <p style={{ margin: "14px 4px 0", fontSize: 12, lineHeight: 1.55, color: UI.mute }}>
          {en ? "Trouble installing? " : "Un souci avec l'installation ? "}
          <a href="mailto:support@fillsell.app" style={{ color: UI.teal, fontWeight: 600, textDecoration: "none" }}>support@fillsell.app</a>
        </p>

      </div>
    </div>
  );
}
