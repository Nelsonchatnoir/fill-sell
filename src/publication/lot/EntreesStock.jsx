// ═══════════════════════════════════════════════════════════════════════════
// LA PUBLICATION EN LOT DANS LE STOCK — les portes, la sélection, le suivi
// ═══════════════════════════════════════════════════════════════════════════
// Rien de neuf à apprendre : mêmes classes que la republication en lot et la
// saisie des prix d'achat (.pa-call, .pa-bar, .apply, .pa-ghost — StockTab),
// même ligne discrète que « À traiter » (une porte, jamais une alarme).
import { ChevronRight } from "lucide-react";
import { R } from "../../reglages/theme";
import { NOM } from "../texte";
import { LOT_MAX_ARTICLES } from "./regles";
import "./lot.css";

const TOUCHE = 44;
const ligneStyle = {
  display: "flex", alignItems: "center", gap: 9, width: "100%", minHeight: TOUCHE,
  padding: "8px 12px", borderRadius: 12, cursor: "pointer", textAlign: "left",
  background: R.paper, border: `1px solid ${R.border}`, fontFamily: "inherit",
};

/** La porte : « Publier plusieurs articles d'un coup ». */
export function LignePublierPlusieurs({ lang, nombre, onOuvrir }) {
  if (!nombre || nombre < 2) return null;
  const fr = lang !== "en";
  return (
    <button type="button" onClick={onOuvrir} className="fs-focus" style={ligneStyle}>
      <span aria-hidden="true" style={{ fontSize: 15, flexShrink: 0 }}>📦</span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: R.ink }}>{fr ? "Publier plusieurs articles d'un coup" : "Publish several items at once"}</span>
        <span style={{ fontSize: 12, color: R.texteSecondaire }}>
          {fr ? `${nombre} article${nombre > 1 ? "s" : ""} pas encore partout` : `${nombre} item${nombre > 1 ? "s" : ""} not everywhere yet`}
        </span>
      </span>
      <ChevronRight size={17} color={R.chevron} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

/** Sous un filtre « Pas encore sur X » / « Nulle part » : la suite naturelle. */
export function AppelFiltrePublier({ lang, nombre, plateforme, onPublier }) {
  if (!nombre) return null;
  const fr = lang !== "en";
  const n = Math.min(nombre, LOT_MAX_ARTICLES);
  const sur = plateforme ? (fr ? ` sur ${NOM(plateforme)}` : ` on ${NOM(plateforme)}`) : "";
  return (
    <button type="button" onClick={onPublier} className="pa-call fs-focus">
      <span aria-hidden="true" style={{ fontSize: 17, flexShrink: 0 }}>🚀</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="n">{fr
          ? `Publier ${nombre > 1 ? (nombre > n ? `les ${n} premiers` : `ces ${n} articles`) : "cet article"}${sur}`
          : `Publish ${nombre > 1 ? (nombre > n ? `the first ${n}` : `these ${n} items`) : "this item"}${sur}`}</span>
        <span className="sub">{fr
          ? (nombre > n ? `Un lot, c'est ${LOT_MAX_ARTICLES} articles au plus : les suivants partiront dans le lot d'après.` : "Tu choisis les plateformes, on prépare, tu vérifies. Rien ne part sans toi.")
          : (nombre > n ? `A batch holds ${LOT_MAX_ARTICLES} items at most: the next ones go in the following batch.` : "You pick the platforms, we prepare, you check. Nothing goes out without you.")}</span>
      </span>
      <ChevronRight size={17} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

/** L'en-tête du mode : ce qu'on fait, et la sortie. */
export function EnteteModeLot({ lang, onQuitter }) {
  const fr = lang !== "en";
  return (
    <button type="button" className="pa-call on fs-focus" onClick={onQuitter}>
      <span aria-hidden="true" style={{ fontSize: 17, flexShrink: 0 }}>↩</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="n">{fr ? "Quitter la publication en lot" : "Exit batch publishing"}</span>
        <span className="sub">{fr
          ? `Touche les articles à publier (${LOT_MAX_ARTICLES} au plus), puis Continuer. Les filtres restent utilisables.`
          : `Tap the items to publish (${LOT_MAX_ARTICLES} at most), then Continue. Filters still work.`}</span>
      </span>
    </button>
  );
}

/** La barre collante : le compte, tout cocher, vider, continuer. */
export function BarreSelectionLot({ lang, n, nVue, onTout, onVider, onContinuer, plein }) {
  const fr = lang !== "en";
  const toutPris = nVue > 0 && n >= Math.min(nVue, LOT_MAX_ARTICLES);
  return (
    <div className="pa-bar" role="region" aria-label={fr ? "Sélection du lot" : "Batch selection"}>
      <span className="lbl" aria-live="polite">
        {n ? (fr ? `${n} sélectionné${n > 1 ? "s" : ""}` : `${n} selected`) : (fr ? "Touche des articles" : "Tap some items")}
        {plein ? <span style={{ fontWeight: 600, color: "#8A6100" }}>{fr ? ` · ${LOT_MAX_ARTICLES} au plus par lot` : ` · ${LOT_MAX_ARTICLES} per batch at most`}</span> : null}
      </span>
      <button type="button" className="apply" disabled={!n} onClick={onContinuer}>{fr ? "Continuer" : "Continue"}</button>
      {nVue > 0 && (
        <button type="button" className="pa-ghost" onClick={toutPris ? onVider : onTout}>
          {toutPris ? (fr ? "Aucun" : "None") : (fr ? `Tout (${Math.min(nVue, LOT_MAX_ARTICLES)})` : `All (${Math.min(nVue, LOT_MAX_ARTICLES)})`)}
        </button>
      )}
      {n > 0 && <button type="button" className="pa-ghost" onClick={onVider} aria-label={fr ? "Vider la sélection" : "Clear selection"}>✕</button>}
    </div>
  );
}

/** Le lot en cours, en haut du Stock : une ligne, le compte, le suivi au tap. */
export function LigneLotEnCours({ lang, suivi, le, onOuvrir }) {
  if (!suivi || !suivi.articles) return null;
  const fr = lang !== "en";
  const d = new Date(le ?? "");
  const quand = Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(fr ? "fr-FR" : "en-GB", { day: "numeric", month: "short" }) + ", " + d.toLocaleTimeString(fr ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  const geste = suivi.compte.geste;
  return (
    <button type="button" onClick={onOuvrir} className="fs-focus"
      style={{ ...ligneStyle, background: geste ? "#FFF8E8" : "#fff", border: `1px solid ${geste ? "#EBD9A8" : R.border}` }}>
      <span aria-hidden="true" style={{ fontSize: 15, flexShrink: 0 }}>{suivi.fini ? "✅" : "📦"}</span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: R.ink }}>
          {fr ? `Ton lot${quand ? ` du ${quand}` : ""}` : `Your batch${quand ? ` of ${quand}` : ""}`}
        </span>
        <span style={{ fontSize: 12, color: geste ? "#8A6100" : R.texteSecondaire }}>
          {fr
            ? `${suivi.annoncesEnLigne} annonce${suivi.annoncesEnLigne > 1 ? "s" : ""} en ligne sur ${suivi.annonces}${geste ? ` · ${geste} article${geste > 1 ? "s" : ""} attend${geste > 1 ? "ent" : ""} un geste` : suivi.fini ? "" : " · ça avance"}`
            : `${suivi.annoncesEnLigne} of ${suivi.annonces} listing${suivi.annonces > 1 ? "s" : ""} live${geste ? ` · ${geste} need${geste > 1 ? "" : "s"} you` : suivi.fini ? "" : " · under way"}`}
        </span>
      </span>
      <ChevronRight size={17} color={R.chevron} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
