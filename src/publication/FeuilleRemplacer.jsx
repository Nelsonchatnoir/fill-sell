// ═══════════════════════════════════════════════════════════════════════════
// « REMPLACER TON TEXTE ? » — L'IA N'ÉCRIT JAMAIS SUR UN CHAMP REMPLI SANS ACCORD (29/10, lot B 1.1)
// ═══════════════════════════════════════════════════════════════════════════
// Promesse à XEWER (27/10) : « le titre, la description et le prix ne se remplissent plus d'office […] si un jour tu
// veux un coup de main, un bouton te permet de les faire générer par l'IA, champ par champ. » Garde-fou de Nico :
// « Elle n'écrit jamais dans un champ déjà rempli sans une confirmation explicite. » Le texte de la personne et la
// proposition côte à côte ; « Garder mon texte » est le geste par défaut (maquette validée le 29/10).
// Même feuille pour les deux peaux de l'écran de publication (rendue par ListingPreviewScreen, dans `modales`).
import { createPortal } from "react-dom";

const NOMS = {
  fr: { titre: "ton titre", description: "ta description", prix: "ton prix" },
  en: { titre: "your title", description: "your description", prix: "your price" },
};

/**
 * @param {{ champ: "titre"|"description"|"prix", actuel: string, propose: string, note?: string|null,
 *           lang?: string, onGarder: () => void, onRemplacer: () => void }} props
 */
export default function FeuilleRemplacer({ champ, actuel, propose, note = null, lang = "fr", onGarder, onRemplacer }) {
  const en = lang === "en";
  const nom = (en ? NOMS.en : NOMS.fr)[champ] ?? (en ? "your text" : "ton texte");
  const suffixePrix = (v) => (champ === "prix" ? ` ${String(v ?? "").trim() ? "€" : ""}` : "");
  const carte = (fond, bord) => ({
    background: fond, border: `1px solid ${bord}`, borderRadius: 14, padding: 12,
    display: "flex", flexDirection: "column", gap: 6,
  });
  const etiquette = (couleur) => ({ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: couleur });
  const texte = { fontSize: 13.5, lineHeight: 1.45, color: "#10201B", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 180, overflowY: "auto" };
  return createPortal((
    <div role="presentation" onClick={onGarder}
      style={{ position: "fixed", inset: 0, zIndex: 480, background: "rgba(16,32,27,.45)", display: "flex", flexDirection: "column", justifyContent: "flex-end", colorScheme: "light" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="fs-remplacer-titre" onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 640, margin: "0 auto", boxSizing: "border-box", background: "#F6F5F1", color: "#10201B",
          borderRadius: "22px 22px 0 0", padding: "8px 16px calc(env(safe-area-inset-bottom, 0px) + 20px)", display: "flex", flexDirection: "column", gap: 12,
          fontFamily: "'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", boxShadow: "0 -18px 40px -18px rgba(16,32,27,.45)" }}>
        <span aria-hidden="true" style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 999, background: "#D8D2C4" }} />
        <span id="fs-remplacer-titre" style={{ fontSize: 19, fontWeight: 700 }}>
          {en ? `Replace ${nom}?` : `Remplacer ${nom} ?`}
        </span>
        <span style={{ fontSize: 14, lineHeight: 1.5, color: "#3A4742" }}>
          {en
            ? "You already filled this field. FillSell suggests a version from the analysis, your guidelines and what you dictated."
            : "Tu as déjà rempli ce champ. FillSell propose une version à partir de l'analyse, de tes consignes et de ce que tu as dicté."}
        </span>
        <div style={carte("#FFFFFF", "#E7E3D8")}>
          <span style={etiquette("#5C6560")}>{en ? "Yours" : "Ton texte"}</span>
          <span style={texte}>{actuel}{suffixePrix(actuel)}</span>
        </div>
        <div style={carte("#EFF4F2", "#D6E2DE")}>
          <span style={etiquette("#1B6E62")}>{en ? "Suggested by FillSell" : "Proposé par FillSell"}</span>
          <span style={texte}>{propose}{suffixePrix(propose)}</span>
          {note ? <span style={{ fontSize: 12, color: "#3A4742" }}>{note}</span> : null}
        </div>
        <button type="button" autoFocus onClick={onGarder}
          style={{ minHeight: 52, borderRadius: 999, border: "none", background: "linear-gradient(120deg,#2F9E90,#1B6E62)", color: "#FFFFFF", font: "inherit", fontSize: 15.5, fontWeight: 700, cursor: "pointer" }}>
          {en ? "Keep mine" : "Garder mon texte"}
        </button>
        <button type="button" onClick={onRemplacer}
          style={{ minHeight: 48, borderRadius: 999, border: "1.5px solid #1B6E62", background: "transparent", color: "#1B6E62", font: "inherit", fontSize: 14.5, fontWeight: 600, cursor: "pointer" }}>
          {en ? "Use the suggestion" : "Remplacer par la proposition"}
        </button>
      </div>
    </div>
  ), document.body);
}
