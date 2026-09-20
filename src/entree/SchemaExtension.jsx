// ── LE SCHÉMA : QUI FAIT QUOI ───────────────────────────────────────────────
// Un dessin, une phrase : le téléphone PILOTE, l'extension EXÉCUTE sur
// l'ordinateur, les cinq plateformes reçoivent. C'est le seul endroit du
// parcours où l'on explique le partage des rôles — et il est au centre de
// l'étape qui décide de tout.
// ⛔ Animations : transform + opacity uniquement, et rien du tout si le
//    système demande moins de mouvement (cf. theme.js).
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { E } from './theme';

const PF = ['vinted', 'leboncoin', 'ebay', 'beebs', 'opla'];

export default function SchemaExtension({ T }) {
  return (
    <div className="en-anime" style={{ background: E.card, border: `1px solid ${E.border}`, borderRadius: 20, padding: '18px 16px 16px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 52, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 30, height: 46, borderRadius: 8, border: `2px solid ${E.ink}`, background: E.paper, position: 'relative' }}>
            <span style={{ position: 'absolute', left: '50%', top: 6, transform: 'translateX(-50%)', width: 10, height: 2, borderRadius: 1, background: E.ink }} />
            <span style={{ position: 'absolute', left: '50%', bottom: 5, transform: 'translateX(-50%)', width: 12, height: 12, borderRadius: 6, background: E.teal, animation: 'enRespire 2.6s ease-in-out infinite' }} />
          </div>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: E.texteSecondaire }}>{T.extTuPilotes}</span>
        </div>

        <div style={{ flex: 1, minWidth: 0, height: 46, position: 'relative', display: 'flex', alignItems: 'center' }}>
          <div style={{ height: 2, width: '100%', background: `repeating-linear-gradient(90deg,${E.mentheBord} 0 6px,transparent 6px 12px)` }} />
          {/* Ce qui voyage n'est pas un point abstrait : c'est la fiche que tu
              viens de photographier. Elle part du téléphone vers l'ordinateur. */}
          {[0, 1.5].map((retard) => (
            <span
              key={retard}
              aria-hidden="true"
              style={{
                position: 'absolute', left: 0, top: '50%', marginTop: -11, width: 26, height: 22, borderRadius: 6,
                background: E.card, border: `1.5px solid ${E.teal}`, boxShadow: '0 4px 10px -5px rgba(16,32,27,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'enFluxCarte 3s ease-in-out infinite', animationDelay: `${retard}s`,
              }}
            >
              <span style={{ width: 14, height: 10, borderRadius: 2, background: 'linear-gradient(120deg,#9FD8CF,#2F9E90)' }} />
            </span>
          ))}
        </div>

        <div style={{ width: 96, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 82, height: 50, borderRadius: 8, border: `2px solid ${E.ink}`, background: E.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            {/* L'icône de l'app, pas une lettre dessinée : c'est FillSell qui
                tourne dans ce navigateur. Fichier PWA existant, public/. */}
            <img src="/icon-192x192.png" alt="FillSell" style={{ width: 28, height: 28, borderRadius: 7, objectFit: 'contain' }} />
            <span style={{ position: 'absolute', right: -4, top: -4, width: 9, height: 9, borderRadius: 5, background: E.teal, animation: 'enPouls 1.8s ease-in-out infinite' }} />
          </div>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: E.texteSecondaire }}>{T.extElleExecute}</span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${E.ligneDouce}` }}>
        {PF.map((p, k) => (
          <span key={p} style={{ display: 'flex', animation: 'enAllume 4s ease-in-out infinite', animationDelay: `${k * 0.55}s` }}>
            <PlatformLogo platform={p} size={30} />
          </span>
        ))}
      </div>
    </div>
  );
}
