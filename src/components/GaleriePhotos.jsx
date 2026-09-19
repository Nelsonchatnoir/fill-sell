// ── LA GALERIE DE PHOTOS — une seule, pour le stepper ET l'ajout manuel ────
// (2026-09-19, extraite de ListingPreviewScreen sans rien redessiner)
//
// Ajouter, retirer, RÉORDONNER : ces trois gestes existaient déjà, mais
// enfermés dans le stepper. L'ajout manuel d'un article en avait besoin à
// l'identique — on extrait, on ne réécrit pas. Le rendu est celui de
// StepUpload, au pixel près.
//
// ⛔ L'ORDRE COMPTE, à deux titres, et c'est pour ça que la poignée existe :
//    la photo 0 est la COUVERTURE de l'annonce sur les cinq plateformes
//    (l'extension téléverse dans l'ordre du tableau, et generate-listing
//    étiquette l'index 0 « original »), et seules les MAX_RETOUCHED premières
//    passent en retouche IA. Réordonner = choisir sa couverture et ce qui est
//    retouché.

import { useRef } from "react";
import { Plus, X, GripVertical } from "lucide-react";
import { MIN_PHOTOS, MAX_PHOTOS } from "../utils/photos";
// Les outils (multi-select Android, moveItem, usePhotoDrag) vivent dans un
// fichier .js à part : un module qui exporte à la fois des composants et des
// fonctions casse le Fast Refresh de Vite.
import { IS_ANDROID, pickPhotosAndroid, usePhotoDrag } from "../utils/photosGalerie";

const T = {
  paper:  "#F6F5F1",
  ink:    "#10201B",
  teal:   "#2F9E90",
  mute:   "#8A8578",
  border: "#E7E3D8",
  card:   "#FFFFFF",
  amber:  "#B45309",
};

export function DragHandle({ bind }) {
  return (
    <button aria-label="Réordonner" {...bind}>
      <GripVertical size={13} />
    </button>
  );
}

export function CoverBadge({ lang }) {
  return (
    <span style={{
      position:"absolute", right:5, bottom:5, background:T.teal, color:"#fff",
      borderRadius:99, padding:"2px 6px", fontSize:8.5, fontWeight:700, whiteSpace:"nowrap",
    }}>
      {lang === "en" ? "Cover" : "Couverture"}
    </span>
  );
}

/**
 * La grille : vignettes carrées, poignée de réordonnancement, badge
 * « Couverture » sur la première, croix de retrait, tuile « + » tant que le
 * plafond n'est pas atteint, et le rappel du minimum.
 *
 * @param {string[]} previews      les URLs à afficher, dans l'ordre
 * @param {(files: File[]) => void} onAdd
 * @param {(i: number) => void}     onRemove
 * @param {(from: number, to: number) => void} onReorder
 * @param {boolean} [removable]     la croix de retrait est-elle offerte
 * @param {boolean} [rappelMinimum] afficher « ajoute au moins 3 photos »
 * @param {number}  [max]           plafond, MAX_PHOTOS par défaut
 */
export default function GaleriePhotos({
  previews,
  onAdd,
  onRemove,
  onReorder,
  removable = true,
  rappelMinimum = true,
  max = MAX_PHOTOS,
  lang,
}) {
  const fileRef = useRef();
  const drag = usePhotoDrag(onReorder);
  const count = previews.length;

  return (
    <div>
      {/* Pas de capture="environment" (2026-07-21) : il FORÇAIT la caméra sur
          iOS/Android et masquait la photothèque (et cassait `multiple`). Sans
          lui, la feuille native propose Photothèque + Prendre une photo. Desktop
          inchangé (capture y est ignoré). */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display:"none" }}
        onChange={e => {
          const files = Array.from(e.target.files || []);
          if (files.length) { onAdd(files); e.target.value = ""; }
        }}
      />

      {count > 1 && (
        <p style={{ margin:"0 0 8px", fontSize:11.5, color:T.mute, lineHeight:1.4 }}>
          {lang === "en"
            ? "Drag the handle to reorder — the first photo is the listing cover."
            : "Glisse la poignée pour réordonner — la 1ʳᵉ photo est la couverture de l'annonce."}
        </p>
      )}

      {/* auto-fill minmax et non repeat(3,1fr) : le stepper est plein écran sans
          maxWidth, 3 colonnes donnaient des tuiles énormes sur desktop. Les
          vignettes restent carrées et compactes (~80 px) quelle que soit la
          largeur ; le drag-to-reorder est inchangé (data-photo-idx + poignée). */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(76px, 1fr))", gap:8, marginBottom:20 }}>
        {previews.map((url, i) => {
          const tile = drag.tileProps(i);
          return (
            <div
              key={i}
              data-photo-idx={i}
              style={{ aspectRatio:"1", borderRadius:12, overflow:"hidden", position:"relative", background:T.card, border:`1px solid ${T.border}`, ...tile.style }}
            >
              <img src={url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", pointerEvents:"none" }} />
              {count > 1 && <DragHandle bind={drag.handleProps(i)} />}
              {i === 0 && count > 1 && <CoverBadge lang={lang} />}
              {removable && (
                <button
                  onClick={() => onRemove(i)}
                  style={{
                    position:"absolute", top:6, right:6, width:20, height:20, borderRadius:"50%",
                    background:T.paper, border:`1px solid ${T.border}`, cursor:"pointer",
                    display:"flex", alignItems:"center", justifyContent:"center", padding:0,
                  }}
                >
                  <X size={11} color={T.ink} />
                </button>
              )}
            </div>
          );
        })}
        {count < max && (
          <button
            onClick={() => IS_ANDROID
              ? pickPhotosAndroid(max - count, onAdd, () => fileRef.current?.click())
              : fileRef.current?.click()}
            style={{ aspectRatio:"1", borderRadius:12, border:"1px dashed #D8D2C4", background:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}
          >
            <Plus size={20} color={T.mute} />
          </button>
        )}
      </div>

      {/* Minimum 3 photos : exigence Vinted (marques premium), rappelée ici
          plutôt que subie à la publication. */}
      {rappelMinimum && count > 0 && count < MIN_PHOTOS && (
        <div style={{ marginTop:-8, marginBottom:16, fontSize:12.5, fontWeight:600, color:T.amber }}>
          {lang === "en"
            ? `Add at least ${MIN_PHOTOS} photos to continue (${count}/${MIN_PHOTOS}).`
            : `Ajoute au moins ${MIN_PHOTOS} photos pour continuer (${count}/${MIN_PHOTOS}).`}
        </div>
      )}
    </div>
  );
}
