// ═══════════════════════════════════════════════════════════════════════════
// UN CHAMP DE TEXTE QUI LAISSE TAPER (19/11/2026, exigence de Nico : « saisie parfaite »)
// ═══════════════════════════════════════════════════════════════════════════
// Nico, lot du 19/11 13:25 : le champ eBay « Matière » d'une veste « bugge dès qu'on tape une lettre ». Cause : la
// valeur était écrite dans le moteur À CHAQUE LETTRE ; la question cessait d'être « manquante » dès la première, sa
// ligne disparaissait sous le doigt (clavier fermé, lettre perdue). Même faute pour toute question à texte libre
// (description Vinted, marque, couleur, matière, aspects eBay et Leboncoin…).
// LA RÈGLE : on tape librement (un brouillon local, rien n'est écrit) ; la valeur part au moteur quand on quitte le
// champ, qu'on valide (Entrée), ou que le champ disparaît (rien n'est perdu). Une valeur changée ailleurs (une puce,
// la dictée) remplace le champ quand on n'est pas en train d'y taper.
import { useEffect, useRef, useState } from "react";

function useBrouillon(value, onChange) {
  const [brouillon, setBrouillon] = useState(null); // null : on ne tape pas
  const ref = useRef({ brouillon: null, value, onChange });
  useEffect(() => { ref.current = { brouillon, value, onChange }; });
  // Le champ démonté en pleine frappe (feuille fermée, ligne remplacée) : la frappe part quand même.
  useEffect(() => () => {
    const { brouillon: b, value: v, onChange: f } = ref.current;
    if (b != null && b !== (v ?? "")) f?.(b);
  }, []);
  const valider = () => {
    if (brouillon == null) return;
    const b = brouillon;
    setBrouillon(null);
    if (b !== (value ?? "")) onChange?.(b);
  };
  return { valeur: brouillon ?? (value ?? ""), taper: (v) => setBrouillon(v), valider };
}

/** Un <input> : la valeur part au moteur à la sortie du champ ou à « Entrée ». */
export default function ChampTexteDiffere({ value, onChange, onKeyDown, onBlur, ...reste }) {
  const { valeur, taper, valider } = useBrouillon(value, onChange);
  return (
    <input type="text" {...reste} value={valeur}
      onChange={(e) => taper(e.target.value)}
      onBlur={(e) => { valider(); onBlur?.(e); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } onKeyDown?.(e); }} />
  );
}

/** Un <textarea> : la valeur part au moteur à la sortie du champ (Entrée garde son retour à la ligne). */
export function ZoneTexteDifferee({ value, onChange, onBlur, ...reste }) {
  const { valeur, taper, valider } = useBrouillon(value, onChange);
  return (
    <textarea {...reste} value={valeur}
      onChange={(e) => taper(e.target.value)}
      onBlur={(e) => { valider(); onBlur?.(e); }} />
  );
}
