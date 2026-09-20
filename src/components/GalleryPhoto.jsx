import { useState } from 'react';
import { urlsPhotos } from '../utils/photos';

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
// Délègue au normaliseur unique (utils/photos.js) depuis le 05/09 — même
// lecture des deux formes partout, plus de copie locale de la règle.
//
// ── L'IMAGE PORTE SA PROPRE TAILLE (2026-09-20) ─────────────────────────────
// CE QUE ÇA A COÛTÉ : sur l'OTA 2.7.10, les vignettes de la file d'activité
// (bandeau « en cours » du Stock, feuille EN COURS/ENSUITE/TERMINÉ, bandeau
// « ce qui attend une action ») montraient un aplat flou au lieu de l'article.
// LA CAUSE : ce composant rendait un <img> NU. Là où il vit dans une grille
// qui a sa feuille de style (`.stock-v2 .gphoto img`, `.ventes-v2 .vphoto img`
// — toutes deux écrivent exactement width:100%/height:100%/object-fit:cover),
// tout allait bien. Mais les vignettes de la file sont posées en style INLINE
// sur un conteneur de 38 ou 48 px : aucune règle ne visait l'enfant, l'image
// s'affichait donc à sa taille NATURELLE (800×1000), centrée par le parent et
// rognée par son overflow — on ne voyait qu'un ou deux pixels étirés.
// Ce n'était ni la source (urlsPhotos lit bien les deux formes, et l'URL garde
// son suffixe ?v=…), ni un filtre, ni un repli : c'était l'absence de taille.
// La taille vit désormais ICI, avec le composant : un appelant n'a plus à
// connaître la règle, et les deux grilles existantes déclaraient déjà
// exactement la même chose — rien n'y change.
export function premierePhoto(photos){
  return urlsPhotos(photos)[0]??null;
}

const STYLE_IMAGE={width:'100%',height:'100%',objectFit:'cover',display:'block'};
// Le repli occupe la case entière et centre son contenu : une vignette neutre
// et assumée (logo de plateforme, tuile d'icône), jamais un carré cassé.
const STYLE_REPLI={width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'};

export default function GalleryPhoto({url,alt,fallback,style}){
  const [err,setErr]=useState(false);
  if(!url||err)return <div className="gph-fallback" style={STYLE_REPLI}>{fallback}</div>;
  return <img src={url} alt={alt||''} loading="lazy" decoding="async"
    style={style?{...STYLE_IMAGE,...style}:STYLE_IMAGE} onError={()=>setErr(true)}/>;
}
