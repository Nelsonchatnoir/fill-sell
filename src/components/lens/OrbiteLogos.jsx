import PlatformLogo from '../platform-logos/PlatformLogo';
import { PLATFORM_LABELS } from '../ListingPreviewScreen';

// ═══════════════════════════════════════════════════════════════════════════
// L'ORBITE DES PLATEFORMES AUTOUR DU DÉCLENCHEUR (29/10, lot B 1.5)
// ═══════════════════════════════════════════════════════════════════════════
// Demande de Nico sur la maquette du viseur : « avant de prendre les photos,
// une petite animation avec les logos d'app qui bougent, qui tournent… quelque
// chose qui fait vraiment appli premium, limite officielle ». Elle remplace le
// bandeau défilant (PlatformMarquee) : même liste, même promesse — « voilà où
// FillSell publie » — donc la MÊME règle : les plateformes publiables pour CE
// compte, jamais une plateforme fermée (plateformesFermees, calculé par
// LensTab comme pour le bandeau d'avant).
//
// Le mouvement (le détail des règles CSS est dans lens.css) :
//   · une ellipse couchée autour du bouton, un tour en PERIODE secondes ;
//   · chaque logo = deux sinusoïdes (x puis y, décalées d'un quart de tour),
//     une profondeur (taille, opacité) et un plan (devant / derrière le bouton) ;
//   · les logos se répartissent par un DÉLAI NÉGATIF : ils partent tous en
//     même temps, déjà placés — et « Réduire les animations » les fige là.
// Le rayon horizontal suit la largeur de l'écran au montage (320 px compris),
// il est écrit EN CLAIR dans les keyframes (jamais une variable CSS : voir
// lens.css).
// ⛔ Aucun minuteur, aucune lecture : c'est du CSS. Démonté dès qu'une photo
//    est prise ou qu'une analyse tourne (LensScanHome).

const PERIODE = 26;        // secondes par tour : lent, une respiration, pas un manège
const RAYON_Y = 38;        // demi-hauteur de l'ellipse (le bouton fait 96 px)
const SINUS = 'cubic-bezier(0.37, 0, 0.63, 1)';   // ≈ sinusoïde aller-retour

function rayonHorizontal() {
  try {
    const largeur = Math.min(window.innerWidth || 390, 520);
    // gouttières (16 × 2) + rembourrage de la carte (16 × 2) + bordures, la
    // moitié de ce qui reste, moins la demi-tuile et une marge.
    return Math.max(84, Math.min(112, Math.round((largeur - 68) / 2 - 24)));
  } catch { return 104; }
}

export default function OrbiteLogos({ plateformes = [] }) {
  const liste = [...new Set(plateformes)].filter((p) => PLATFORM_LABELS[p]);
  if (!liste.length) return null;
  const rx = rayonHorizontal();
  const n = liste.length;
  const demi = PERIODE / 2;
  // Les deux sinusoïdes, rayon en clair. Nom propre au rayon : deux orbites
  // de largeurs différentes ne se marchent pas dessus.
  const kx = `lnsOrbX${rx}`;
  const ky = `lnsOrbY${RAYON_Y}`;
  return (
    <div className="lns-orbite" aria-hidden="true">
      <style>{`
        @keyframes ${kx} { from { transform: translateX(-${rx}px); } to { transform: translateX(${rx}px); } }
        @keyframes ${ky} { from { transform: translateY(-${RAYON_Y}px); } to { transform: translateY(${RAYON_Y}px); } }
      `}</style>
      <span className="lns-orbite-anneau" style={{ width: rx * 2, height: RAYON_Y * 2, left: -rx, top: -RAYON_Y }} />
      {liste.map((p, k) => {
        const phase = ((k + 0.5) / n) * PERIODE; // demi-pas : figés (réduire les animations), aucun logo ne tombe devant ni derrière le bouton
        return (
          <span
            key={p}
            className="lns-orb"
            style={{
              animation: `${kx} ${demi}s ${SINUS} ${-phase}s infinite alternate, lnsOrbPlan ${PERIODE}s step-end ${-phase}s infinite`,
            }}
          >
            <span
              className="lns-orb-y"
              style={{ display: 'block', animation: `${ky} ${demi}s ${SINUS} ${-(phase + PERIODE / 4)}s infinite alternate` }}
            >
              <span
                className="lns-orb-p"
                style={{ animation: `lnsOrbProfondeur ${PERIODE}s linear ${-phase}s infinite` }}
              >
                <PlatformLogo platform={p} size={24} />
              </span>
            </span>
          </span>
        );
      })}
    </div>
  );
}
