import { useState } from 'react';

// ── Photo d'article (galerie Stock IA + vignettes Ventes, 2026-08-27) ────────
// Deux formats coexistent dans inventaire.photos : objets {type,url} (flux
// photos retouchées) et STRINGS nues (URLs CDN Vinted écrites par la sync du
// dressing) — même normalisation que initialPhotos du stepper
// (ListingPreviewScreen). 1 705 articles sur 36 903 n'ont AUCUNE photo : le
// `fallback` (tuile d'icône de catégorie) reprend sa place, et une image qui
// casse au chargement (CDN Vinted expiré) retombe dessus aussi — jamais une
// carte vide ni une image cassée.
// loading="lazy" : le navigateur ne charge que les photos proches du viewport,
// les gros comptes (3 000+ articles) ne téléchargent pas tout d'un coup.
export function premierePhoto(photos){
  if(!Array.isArray(photos))return null;
  for(const p of photos){
    const u=typeof p==='string'?p:(p?.url||p?.original||p?.enhanced||p?.bg_removed);
    if(u)return u;
  }
  return null;
}

export default function GalleryPhoto({url,alt,fallback}){
  const [err,setErr]=useState(false);
  if(!url||err)return <div className="gph-fallback">{fallback}</div>;
  return <img src={url} alt={alt||''} loading="lazy" decoding="async" onError={()=>setErr(true)}/>;
}
