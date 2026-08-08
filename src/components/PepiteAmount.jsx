import PepiteIcon from "./PepiteIcon";

// Montant compact de Pépites : « <n> [icône] ». À utiliser partout où le prix
// est répété et la place comptée (boutons de carte, badges, récaps, soldes).
// Là où la notion s'EXPLIQUE (modales de vente, messages d'erreur, encarts
// pédagogiques), garder le mot « Pépites » en toutes lettres — l'icône peut
// s'y ajouter À CÔTÉ du mot, jamais à sa place.
// L'icône seule est muette pour un lecteur d'écran : le span porte role="img"
// + aria-label, qui est la seule chose annoncée.
export default function PepiteAmount({ value, size = "1em", style }) {
  return (
    <span
      role="img"
      aria-label={`${value} Pépite${value > 1 ? "s" : ""}`}
      style={{ whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "0.22em", ...style }}
    >
      {value}
      <PepiteIcon size={size} />
    </span>
  );
}
