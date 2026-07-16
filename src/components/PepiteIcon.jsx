import { useId } from "react";

// Icône Pépite — cristal facetté en dégradé ambre→teal. Remplace l'emoji 🪙
// partout où la monnaie virtuelle est affichée.
// L'id du gradient est dérivé de useId() (nettoyé des ":" invalides dans un
// url(#…) SVG) : chaque instance a ses propres <defs>, plusieurs Pépites sur
// un même écran ne se volent pas leur dégradé.
export default function PepiteIcon({ size = 16, style }) {
  const gradId = `pepite-grad-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      style={{ display: "inline-block", verticalAlign: "-0.12em", flexShrink: 0, ...style }}
    >
      <defs>
        <linearGradient id={gradId} x1="10" y1="6" x2="54" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F0B860" />
          <stop offset="45%" stopColor="#E8956D" />
          <stop offset="100%" stopColor="#2F9E90" />
        </linearGradient>
      </defs>
      <path d="M32 4 L48 16 L54 30 L44 56 L32 60 L20 56 L10 30 L16 16 Z" fill={`url(#${gradId})`} />
      <path d="M32 4 L48 16 L32 24 L16 16 Z" fill="#fff" opacity="0.35" />
      <path d="M16 16 L32 24 L20 56 L10 30 Z" fill="#000" opacity="0.1" />
    </svg>
  );
}
