// ── LA CONSTELLATION : CE QUI SE PASSE VRAIMENT, PENDANT QUE ÇA SE PASSE ────
// FillSell au centre, les plateformes de la vague autour. Chaque satellite
// porte l'état RÉEL de sa plateforme, lu sur son run :
//   · terminée    pleinement colorée, liseré teal, coche ;
//   · en cours    pleinement colorée, liseré teal, halo qui respire ;
//   · en attente  atténuée, liseré neutre, AUCUN badge ;
//   · empêchée    atténuée, liseré ambre, « ! » — jamais une croix rouge :
//                 une plateforme sans session n'est pas un échec.
//
// ⛔ AUCUNE PASTILLE NE S'ALLUME POUR FAIRE JOLI. Les seules animations sont
//    la rotation de l'anneau, la respiration du centre et le halo de la
//    plateforme en cours — du décor, sur des éléments sans information. Ce qui
//    PORTE l'information (coche, badge, opacité) est branché sur `vague`.
// ⛔ La tuile reste DROITE : l'anneau tourne, le satellite contre-tourne
//    (animation) et annule en plus son angle de placement.
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { A } from './theme';

const RAYON = 58;

export default function ConstellationReleve({ membres, faites, enCours, empechees, labels }) {
  const n = Math.max(1, membres.length);
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

      <div style={{ position: 'absolute', inset: 0, animation: 'rvOrbite 8s linear infinite' }}>
        {membres.map((p, k) => {
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
                position: 'absolute', left: '50%', top: '50%', margin: `-17px 0 0 -17px`,
                width: 34, height: 34, transform: `rotate(${angle}deg) translateY(${-RAYON}px)`,
              }}
            >
              <span style={{ display: 'block', width: 34, height: 34, animation: 'rvOrbiteInv 8s linear infinite' }}>
                <span style={{
                  position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 34, height: 34, borderRadius: 11, background: '#FFFFFF',
                  border: `1px solid ${bord}`, boxShadow: '0 6px 14px -8px rgba(16,32,27,.6)',
                  transform: `rotate(${-angle}deg)`,
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
            </span>
          );
        })}
      </div>
    </div>
  );
}
