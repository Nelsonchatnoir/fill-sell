// ═══════════════════════════════════════════════════════════════════════════
// LA VIGNETTE D'UNE LIGNE DU LOT (26/10 ; 11/11/2026, décisions de Nico — point T1)
// ═══════════════════════════════════════════════════════════════════════════
// La première photo, et « Sans photo » quand il n'y en a pas de vraie (photoVide.js). La même règle qu'à l'unité et
// que la tâche (utils/photos.js, vraiesPhotos) : une image par défaut CONNUE (reconnue à l'identique,
// lot/imagesParDefaut.js) ne compte pas, quelle que soit sa place — ni sa retouche par la rédaction (`origines` : les
// photos de la fiche dont `photos` est la copie rang par rang). Les photos sont lues en cascade (la première, puis la
// suivante seulement si celle d'avant est une image par défaut reconnue), celles de la fiche aussi quand elles
// diffèrent ; la vignette montre la première photo qui n'en est pas une — comme avant —, et « Sans photo » quand il
// n'en reste aucune. Pas lue, illisible ou seulement douteuse : une vraie photo, montrée. `onVide` (ce que le lot
// retient pour l'article) n'est appelé qu'une fois la lecture CONCLUE — comme avant le 11/11 (jamais un « il y a une
// vraie photo » dit avant d'avoir lu).
// Un module à lui (sorti de LotPublication.jsx) : le selftest le MONTE, effets compris (selftest:une-photo-suffit).
import { useEffect } from "react";
import { urlPhoto, urlsPhotos, vraiesPhotos } from "../../utils/photos";
import { useLectureImagesParDefaut } from "./photoVide";

const AUCUNE = Object.freeze([]);

export default function VignetteLot({ item, photos = null, origines = null, onVide = null, en = false }) {
  const duMoteur = urlsPhotos(photos);
  const urls = duMoteur.length ? duMoteur : urlsPhotos(item?.photos);
  // Les photos de la fiche, seulement quand `photos` en est une copie différente, rang par rang.
  const dOrigine = urlsPhotos(origines);
  const originesAlignees = duMoteur.length && dOrigine.length === urls.length && dOrigine.some((u, i) => u !== urls[i]) ? dOrigine : AUCUNE;
  const lecture = useLectureImagesParDefaut(urls);
  const lectureOrigines = useLectureImagesParDefaut(originesAlignees);
  const reconnues = lectureOrigines.reconnues.length ? [...lecture.reconnues, ...lectureOrigines.reconnues] : lecture.reconnues;
  const url = vraiesPhotos(urls, reconnues, originesAlignees.length ? originesAlignees : null)[0] ?? null;
  const vide = !url;
  const conclue = lecture.conclue && lectureOrigines.conclue;
  useEffect(() => { if (onVide && conclue) onVide(vide); }, [vide, conclue, onVide]);
  return (
    <div className="fsn-thumb fsv-thumb" aria-hidden="true">
      {url ? <img src={urlPhoto(url)} alt="" loading="lazy" /> : "📦"}
      {vide ? <span className="fsv-sans">{en ? "No photo" : "Sans photo"}</span> : null}
    </div>
  );
}
