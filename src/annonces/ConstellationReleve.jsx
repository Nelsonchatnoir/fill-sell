// ── LA CONSTELLATION : CE QUI SE PASSE VRAIMENT, PENDANT QUE ÇA SE PASSE ────
// FillSell au centre, les plateformes du compte autour. Chaque satellite porte
// l'état RÉEL de sa plateforme, lu sur son run :
//   · terminée    pleinement colorée, liseré teal, coche ;
//   · en cours    pleinement colorée, liseré teal, halo qui respire ;
//   · en attente  atténuée, liseré neutre, AUCUN badge ;
//   · empêchée    atténuée, liseré ambre, « ! » — jamais une croix rouge :
//                 une plateforme sans session n'est pas un échec.
//
// ⛔ AUCUNE PASTILLE NE S'ALLUME POUR FAIRE JOLI. Les seules animations sont
//    l'orbite, la respiration du centre et le halo de la plateforme en cours —
//    du décor, sur des éléments sans information. Ce qui PORTE l'information
//    (coche, badge, opacité) est branché sur l'état lu en base.
//
// ── LE JEU DE SATELLITES EST STABLE, ET C'EST LE CŒUR DU CORRECTIF ──────────
// On affiche les plateformes DU COMPTE, pas les membres de la vague. Les
// membres, eux, entrent au compte-gouttes : les quatre RPC partent l'une après
// l'autre, et Vinted n'apparaît QUE quand VintedDressingSync remonte son état,
// avec un tour de rendu de retard. Un satellite qui se monte en retard démarre
// son animation en retard — et reste décalé sur l'anneau pour toujours
// (constat Nico, 20/09 : Vinted collée à sa voisine).
// Ici les cinq tuiles se montent ENSEMBLE, à l'apparition de la constellation,
// et ne sont plus jamais recréées (clé = identifiant de plateforme). Ce qui
// change ensuite, c'est leur HABILLAGE, jamais leur présence.
//
// ── ET L'APLOMB NE DÉPEND DE RIEN ───────────────────────────────────────────
// Une seule keyframe pour les cinq (rvTourne, theme.js) : elle orbite et
// redresse dans la même liste de transformations. L'écart entre satellites
// vient d'un animation-delay NÉGATIF, pas d'un angle par tuile.
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { A } from './theme';

// ⚠️ Doit rester égal au translateY de la keyframe rvTourne (theme.js).
const RAYON = 58;
const TOUR_MS = 8000;

export default function ConstellationReleve({ plateformes, faites, enCours, empechees, labels }) {
  const n = Math.max(1, plateformes.length);
  const pas = 360 / n;

  return (
    <div className="rv-anime" aria-hidden="true" style={{ position: 'relative', width: 148, height: 148, flexShrink: 0 }}>
      <span style={{ position: 'absolute', inset: 24, borderRadius: '50%', border: `1px dashed ${A.mentheBord}` }} />
      <span style={{ position: 'absolute', inset: 52, borderRadius: '50%', border: `1.5px solid ${A.teal}`, animation: 'rvPouls 2.2s ease-out infinite' }} />
      <span style={{
        position: 'absolute', inset: 52, borderRadius: '50%',
        background: `linear-gradient(120deg,${A.teal},${A.tealDeep})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 12px 24px -14px rgba(47,158,144,.9)', animation: 'rvRespire 3s ease-in-out infinite',
      }}>
        <img src="/icon-192x192.png" alt="" style={{ width: 26, height: 26, borderRadius: 7, objectFit: 'contain' }} />
      </span>

      {plateformes.map((p, k) => {
        const fait = faites.includes(p);
        const empechee = empechees.includes(p);
        const active = p === enCours;
        const allume = fait || active;
        const bord = empechee ? A.ambreBord : allume ? A.teal : A.border;
        const badge = empechee ? '!' : fait ? '✓' : '';
        const angle = k * pas;
        return (
          <span
            key={p}
            style={{
              position: 'absolute', left: '50%', top: '50%', margin: '-17px 0 0 -17px',
              width: 34, height: 34,
              // Position de repos, déjà redressée : c'est elle qui s'applique
              // quand le système demande moins d'animation (la règle
              // `.rv-anime *` coupe alors l'orbite). Sans ce transform, les
              // cinq satellites s'empileraient au centre.
              transform: `rotate(${angle}deg) translateY(${-RAYON}px) rotate(${-angle}deg)`,
              animation: `rvTourne ${TOUR_MS}ms linear infinite`,
              // ⛔ L'ÉCART EST ICI, ET NULLE PART AILLEURS. Négatif : le
              //    satellite k démarre déjà au k/n de son tour.
              animationDelay: `${-Math.round((k / n) * TOUR_MS)}ms`,
            }}
          >
            <span style={{
              position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, borderRadius: 11, background: '#FFFFFF',
              border: `1px solid ${bord}`, boxShadow: '0 6px 14px -8px rgba(16,32,27,.6)',
            }}>
              {/* Le halo n'existe QUE sur la plateforme réellement en
                  'running' : c'est le seul endroit où du travail a lieu. */}
              {active && !empechee && (
                <span style={{ position: 'absolute', inset: -3, borderRadius: 13, border: `1.5px solid ${A.teal}`, animation: 'rvPouls 1.8s ease-out infinite' }} />
              )}
              <span title={labels[p] ?? p} style={{ display: 'flex', opacity: allume && !empechee ? 1 : 0.4 }}>
                <PlatformLogo platform={p} size={22} desature={!allume || empechee} />
              </span>
              {badge && (
                <span style={{
                  position: 'absolute', right: -5, bottom: -5, width: 16, height: 16, borderRadius: 8,
                  background: empechee ? A.pipWarn : A.teal, border: '2px solid #FFFFFF', color: '#FFFFFF',
                  fontSize: 9, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{badge}</span>
              )}
            </span>
          </span>
        );
      })}
    </div>
  );
}
