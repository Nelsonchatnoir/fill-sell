// Icône Depop (09/10/2026) — le mot-symbole « depop » en blanc sur le rouge de
// la marque (#FF2300), tuile carrée pleine comme les icônes d'app de Beebs et
// Leboncoin. Dessinée ici (SVG en ligne, aucun fichier chargé au runtime).
// Elle ne s'affiche que là où Depop existe pour le compte (stockFiltres :
// Depop « à venir », ouverte par App.jsx) — la règle des maquettes (logo de
// la plateforme seulement quand l'intégration est active).
export default function DepopIcon({ size = 24, radius }) {
  const r = radius ?? Math.round(size * 0.28);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Depop"
      style={{ display: "block", borderRadius: r, flexShrink: 0 }}>
      <rect width="64" height="64" rx={Math.round((r / size) * 64)} fill="#FF2300" />
      <text x="32" y="39" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif"
        fontSize="17" fontWeight="700" fill="#FFFFFF" letterSpacing="-0.5">depop</text>
    </svg>
  );
}
