// ── LE TUTO : QUI PREND LA PHOTO, QUI FAIT LE DÉPÔT ─────────────────────────
// Trois temps dessinés, trois légendes courtes. Il répond à la question que
// personne ne posait à voix haute — « je prends mes photos où ? » — et il dit
// le partage des rôles sans jamais laisser croire que le téléphone publie.
//
// ⛔ AUCUNE ANIMATION SUR UN TEXTE. Seuls l'obturateur, les lignes de la fiche
//    et la coche bougent ; les légendes restent à opacité 1 (contraste).
// ⛔ Pas une page de plus : ce bloc occupe le vide des écrans existants.
import { E, DEGRADE } from './theme';

function Legende({ lignes }) {
  return (
    <span style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.35, color: E.ink, textAlign: 'center' }}>
      {lignes[0]}<br />{lignes[1]}
    </span>
  );
}

const Fleche = () => (
  <span aria-hidden="true" style={{ marginTop: 20, flexShrink: 0, fontSize: 13, fontWeight: 700, color: E.mute }}>→</span>
);

export default function TutoTelephonePC({ T, style }) {
  return (
    <div className="en-anime" style={{ background: E.card, border: `1px solid ${E.border}`, borderRadius: 20, padding: '16px 14px 14px', ...style }}>
      <p style={{ margin: '0 0 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: E.texteSecondaire, textAlign: 'center' }}>
        {T.tutoTitre}
      </p>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        {/* 1. La photo, prise dans l'app, sur le téléphone. */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 34, height: 46, borderRadius: 8, border: `2px solid ${E.ink}`, background: E.paper, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 18, height: 18, borderRadius: 9, border: `2px solid ${E.teal}`, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'enObturateur 3s ease-in-out infinite' }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, background: E.teal }} />
            </span>
          </div>
          <Legende lignes={T.tutoPhoto} />
        </div>

        <Fleche />

        {/* 2. La fiche que FillSell écrit à partir de la photo. */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 38, height: 46, boxSizing: 'border-box', borderRadius: 8, border: `2px solid ${E.ink}`, background: E.paper, padding: '6px 5px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ height: 8, borderRadius: 2, background: 'linear-gradient(120deg,#9FD8CF,#2F9E90)', transformOrigin: 'left', animation: 'enEcrit 3s ease-in-out infinite', animationDelay: '.6s' }} />
            <span style={{ height: 4, borderRadius: 2, background: E.piste, transformOrigin: 'left', animation: 'enEcrit 3s ease-in-out infinite', animationDelay: '.85s' }} />
            <span style={{ height: 4, borderRadius: 2, background: E.piste, transformOrigin: 'left', animation: 'enEcrit 3s ease-in-out infinite', animationDelay: '1.1s' }} />
          </div>
          <Legende lignes={T.tutoFiche} />
        </div>

        <Fleche />

        {/* 3. L'ordinateur ouvert : c'est LUI qui dépose. */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 54, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* ⛔ L'ÉCRAN DU PORTABLE N'EST JAMAIS VIDE. La coche reste à
                opacité 1 — c'est elle qui porte l'information « le dépôt est
                fait ». Seul le halo, décoratif, respire. Une coche qui
                repassait par opacité 0 laissait un rectangle blanc sous la
                légende « Ton PC ouvert la dépose » la moitié du temps. */}
            <span style={{ width: 52, height: 34, borderRadius: 6, border: `2px solid ${E.ink}`, background: E.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <span style={{ position: 'relative', width: 20, height: 20, borderRadius: 10, background: DEGRADE, color: '#FFFFFF', fontSize: 11, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 10, border: `1.5px solid ${E.teal}`, animation: 'enHalo 2.4s ease-in-out infinite' }} />
                ✓
              </span>
              <span aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ width: 12, height: 3, borderRadius: 2, background: E.piste }} />
                <span style={{ width: 9, height: 3, borderRadius: 2, background: E.piste }} />
              </span>
            </span>
          </div>
          <Legende lignes={T.tutoDepot} />
        </div>
      </div>

      <p style={{ margin: '13px 0 0', fontSize: 12.5, lineHeight: 1.5, color: E.texteSecondaire, textAlign: 'center' }}>{T.tutoNote}</p>
    </div>
  );
}
