// ═══════════════════════════════════════════════════════════════════════════
// LES BRIQUES COMMUNES DU NOUVEAU STEPPER (24/09/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Aucune couleur ici : tout passe par les classes de stepper.css et ses
// variables --fs-*. Une carte a UNE gravité (info · geste · refus) et une seule.
import PlatformLogo from "../components/platform-logos/PlatformLogo";
import { urlPhoto } from "../utils/photos";

/** Une carte. `gravite` : null (blanche) | 'flat' | 'info' | 'geste' | 'refus'. */
export function Carte({ gravite = null, titre = null, children, style, className = "", ...rest }) {
  const cls = ["fsn-card", gravite ? `fsn-card--${gravite}` : "", className].filter(Boolean).join(" ");
  return (
    <div className={cls} style={style} {...rest}>
      {titre ? <div className="fsn-card-t">{titre}</div> : null}
      {children}
    </div>
  );
}

/** Une puce d'état. `ton` : 'ok' | 'geste' | 'refus' | 'mute' | null. */
export function Puce({ ton = null, point = false, children }) {
  return (
    <span className={`fsn-chip${ton ? ` fsn-chip--${ton}` : ""}`}>
      {point ? <span className="dot" /> : null}
      {children}
    </span>
  );
}

export function Logo({ platform, size = 24, desature = false }) {
  return <span className="fsn-logo"><PlatformLogo platform={platform} size={size} desature={desature} /></span>;
}

/** Le rappel de l'article : photo, titre, sous-titre, prix. */
export function CarteArticle({ photo = null, titre, sousTitre = null, prix = null, prixVide = null, lang = "fr", enfants = null, onPhoto = null }) {
  const src = photo ? urlPhoto(photo) : null;
  return (
    <div className="fsn-card" style={{ gap: 12 }}>
      <div className="fsn-row">
        <div
          className="fsn-thumb fsn-thumb--lg"
          onClick={src && onPhoto ? () => onPhoto(src) : undefined}
          style={src && onPhoto ? { cursor: "pointer" } : undefined}
          aria-hidden="true"
        >
          {src ? <img src={src} alt="" /> : "📦"}
        </div>
        <div className="fsn-grow">
          <div className="fsn-article-t">{titre || (lang === "en" ? "Untitled item" : "Article sans titre")}</div>
          {sousTitre ? <div className="fsn-article-s">{sousTitre}</div> : null}
        </div>
        {prix != null && prix !== "" && Number.isFinite(Number(prix))
          ? <b className="fsn-price num">{Number(prix)} €</b>
          : (prixVide ? <span className="fsn-price fsn-price--vide">{prixVide}</span> : null)}
      </div>
      {enfants}
    </div>
  );
}

/** Le bouton principal du pied de page. */
export function Bouton({ variante = "primary", petit = false, disabled = false, onClick, children, type = "button", style }) {
  return (
    <button
      type={type}
      className={`fsn-btn fsn-btn--${variante}${petit ? " fsn-btn--sm" : ""}`}
      disabled={disabled}
      onClick={onClick}
      style={style}
    >
      {children}
    </button>
  );
}
