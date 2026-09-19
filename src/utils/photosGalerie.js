// ── Les OUTILS de la galerie photo (2026-09-19) ─────────────────────────────
// Séparés du composant (components/GaleriePhotos.jsx) pour une seule raison :
// un fichier qui exporte à la fois des composants et des fonctions casse le
// Fast Refresh de Vite. Le composant reste composant, les outils vivent ici.

import { useState, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { Camera as CapCamera } from "@capacitor/camera";

const TEAL = "#2F9E90";

// ── Multi-select photos sur ANDROID uniquement (2026-07-27) ─────────────────
// L'<input type="file" multiple> de la WebView part en ACTION_GET_CONTENT vers
// la galerie du constructeur, dont le multi-select exige un appui long — un tap
// simple retourne UNE photo (bug « un seul fichier retenu », stepper + scan).
// Camera.pickImages force le Photo Picker système (cases à cocher), sans
// permission (l'alias photos est toujours granted sur Android).
// iOS et web NE PASSENT JAMAIS ici : gate Capacitor.getPlatform() === 'android'
// aux points d'appel — l'<input> reste dans le DOM et reste leur seul chemin,
// comportement inchangé y compris en erreur (iOS validé par Nico le 27/07).
export const IS_ANDROID = Capacitor.getPlatform() === "android";

// Convertit les GalleryPhoto (webPath) en File STRICTEMENT équivalents à ceux
// de l'input — MIME réel lu sur le blob (pas un jpeg présumé), extension
// assortie, octets intacts (aucune recompression ici : fetch du webPath tel
// quel) — puis les remet au MÊME point d'entrée que l'input (onFiles = le
// callback que l'onChange de l'input appelle déjà). Cas limites alignés sur
// l'input : annulation ou sélection vide ⇒ no-op silencieux ; échec du
// plugin ⇒ repli sur l'input existant, JAMAIS muet (console.error).
export async function pickPhotosAndroid(remaining, onFiles, fallbackClick) {
  if (remaining <= 0) return; // même garde que le bouton (masqué au plafond)
  let res;
  try {
    res = await CapCamera.pickImages({ quality: 90, limit: remaining });
  } catch (e) {
    const msg = (e?.message || "").toLowerCase();
    if (msg.includes("cancel")) return; // = refermer l'input sans rien choisir
    console.error("[photos] pickImages failed, fallback input", e?.message, e);
    fallbackClick();
    return;
  }
  const picked = (res?.photos ?? []).slice(0, remaining);
  if (!picked.length) return;
  const files = [];
  for (let i = 0; i < picked.length; i++) {
    const ph = picked[i];
    try {
      const blob = await fetch(ph.webPath).then(r => r.blob());
      const mime = blob.type || (ph.format ? `image/${ph.format}` : "image/jpeg");
      const ext = ph.format || mime.split("/")[1] || "jpg";
      files.push(new File([blob], `photo_${Date.now()}_${i}.${ext}`, { type: mime }));
    } catch { /* photo illisible : sautée, les autres passent */ }
  }
  if (files.length) onFiles(files);
}

/** Déplace un élément d'un index à un autre, sans muter le tableau d'entrée. */
export function moveItem(arr, from, to) {
  const next = [...arr];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

// ── Le réordonnancement, en Pointer Events ──────────────────────────────────
// Aucune dépendance : rien dans package.json, et le drag&drop HTML5 ne
// fonctionne pas au tactile — donc inutilisable dans l'app Capacitor. Pointer
// Events couvre souris ET tactile. Le drag part d'une POIGNÉE dédiée
// (touch-action:none sur la poignée seulement) : le scroll de la page et le tap
// sur la photo restent intacts.
export function usePhotoDrag(onReorder) {
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const fromRef = useRef(null);
  const overRef = useRef(null);

  function onPointerDown(e, i) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    fromRef.current = i; overRef.current = i;
    setDragIdx(i); setOverIdx(i);
  }
  // La capture renvoie les events à la poignée : on retrouve la vignette
  // survolée par hit-test (elementFromPoint reste fiable sous capture).
  function onPointerMove(e) {
    if (fromRef.current === null) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-photo-idx]");
    const i = el ? Number(el.dataset.photoIdx) : null;
    if (i !== null && !Number.isNaN(i) && i !== overRef.current) {
      overRef.current = i;
      setOverIdx(i);
    }
  }
  function onPointerUp() {
    const from = fromRef.current, to = overRef.current;
    fromRef.current = null; overRef.current = null;
    setDragIdx(null); setOverIdx(null);
    if (from !== null && to !== null && from !== to) onReorder(from, to);
  }

  const handleProps = i => ({
    onPointerDown: e => onPointerDown(e, i),
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onClick: e => e.stopPropagation(),
    style: {
      position:"absolute", left:6, top:6, width:22, height:22, borderRadius:8,
      background:"rgba(16,32,27,0.55)", border:"none", padding:0, color:"#fff",
      display:"flex", alignItems:"center", justifyContent:"center",
      cursor:"grab", touchAction:"none",
    },
  });

  // Style de la vignette pendant le drag : la source s'efface, la cible s'entoure.
  const tileProps = i => ({
    "data-photo-idx": i,
    style: {
      opacity: dragIdx === i ? 0.35 : 1,
      outline: dragIdx !== null && overIdx === i && dragIdx !== i ? `2px solid ${TEAL}` : "none",
      outlineOffset: -2,
    },
  });

  return { dragging: dragIdx !== null, handleProps, tileProps };
}
