// ═══════════════════════════════════════════════════════════════════════════
// « SANS PHOTO » DIT TOUT DE SUITE (26/10, Medik8 de Nico) — la photo de remplissage, lue dans la page
// ═══════════════════════════════════════════════════════════════════════════
// La « photo » du Medik8 était l'image par défaut de Beebs (une casquette violette, 200 × 200), rapatriée comme
// photo de la fiche. Le lot le disait… à la fin. Ici, dès la ligne : la première photo est lue une fois (vignette
// 48 × 48 dessinée dans un canevas, couleurs quantifiées sur 4 bits) et jugée par estPhotoDeRemplissage
// (ficheLue.js). Une image illisible (canevas refusé, réseau) n'est JAMAIS déclarée vide : on ne dit que ce qu'on
// a lu. Un résultat par adresse, gardé pour la session.
import { useEffect, useState } from "react";
import { estPhotoDeRemplissage } from "./ficheLue";

const resultats = new Map(); // url → true | false (lu) ; absent = pas encore lu
const enCours = new Map();   // url → Promise

function lireImage(url) {
  if (resultats.has(url)) return Promise.resolve(resultats.get(url));
  if (enCours.has(url)) return enCours.get(url);
  const p = new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = 48; c.height = 48;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, 48, 48);
          const d = ctx.getImageData(0, 0, 48, 48).data;
          const vues = new Set();
          for (let i = 0; i < d.length; i += 4) vues.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
          const vide = estPhotoDeRemplissage({ largeur: img.naturalWidth, hauteur: img.naturalHeight, couleurs: vues.size });
          resultats.set(url, vide);
          resolve(vide);
        } catch { resolve(null); } // canevas refusé : rien n'est conclu
      };
      img.onerror = () => resolve(null);
      img.src = url;
    } catch { resolve(null); }
  }).finally(() => enCours.delete(url));
  enCours.set(url, p);
  return p;
}

/** true quand la photo est une image de remplissage ; false quand c'est une vraie photo ; null tant qu'on ne sait pas. */
export function usePhotoVide(url) {
  const [lu, setLu] = useState(() => (url && resultats.has(url) ? { url, vide: resultats.get(url) } : null));
  useEffect(() => {
    if (!url) return undefined;
    let vivant = true;
    lireImage(url).then((v) => { if (vivant) setLu({ url, vide: v }); });
    return () => { vivant = false; };
  }, [url]);
  if (!url) return null;
  return lu && lu.url === url ? lu.vide : (resultats.has(url) ? resultats.get(url) : null);
}
