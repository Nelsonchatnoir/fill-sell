// ── 2 bis. COMMENT TU VEUX PUBLIER ? — CLOUD OU EXTENSION (04/11/2026, lot 3) ──
// Maquette o-voie (v3), validée par Nico le 03/11. Téléphone seulement, et
// seulement quand le Cloud est ouvert à ce compte avec un essai proposable
// (plan.js : c.cloud.parcours) — fermé, cette étape n'existe pas.
//
// ⛔ RIEN DE PRÉ-COCHÉ : deux cartes, deux boutons. Le Cloud passe devant (la
//    personne est sur son téléphone : 7 inscrits sur 9 décrochaient au mur
//    « installe l'extension »), l'extension garde son bouton à elle et son
//    argument vrai : gratuite, sans carte, pour toujours.
// ⛔ Le prix est sur la carte AVANT tout geste (CLOUD_PRIX_AFFICHE, jamais en dur).
// ⛔ Le point « i » : 20 px dessinés, 44 px de zone tactile (une zone invisible
//    de 12 px tout autour), et sa petite fenêtre se ferme au fond, à « Compris »
//    ou à Échap. Animations : transform/opacity, coupées par prefers-reduced-motion
//    (classe en-anime, cf. theme.js).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Cloud, Laptop } from 'lucide-react';
import { CLOUD_PLATEFORMES_CONNEXION } from '../config/cloudOffer';
import { DEGRADE_TEAL } from '../cloud/theme';
import { E } from './theme';
import { Scene, Kicker, Titre, Texte, BoutonPrimaire } from './EntreeUI';
import { listeNoms } from './regles';

function Glyphe({ neutre = false, children }) {
  return (
    <span aria-hidden="true" style={{
      width: 36, height: 36, borderRadius: 12, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: neutre ? E.chip : E.menthe, border: `1px solid ${neutre ? E.border : E.mentheBord}`,
    }}>
      {children}
    </span>
  );
}

function Tete({ glyphe, k, t }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
      {glyphe}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: E.texteSecondaire }}>{k}</div>
        <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.01em', color: E.ink }}>{t}</div>
      </div>
    </div>
  );
}

const styleP = { margin: 0, fontSize: 13, lineHeight: 1.5, fontWeight: 500, color: E.texteSecondaire };
const styleNote = { margin: 0, fontSize: 11.5, lineHeight: 1.45, fontWeight: 500, color: E.texteSecondaire, textAlign: 'center' };

// La petite fenêtre du point « i » — sur body (au-dessus du parcours), comme les couches du Cloud.
export function FenetreInfo({ T, onFermer }) {
  useEffect(() => {
    const f = (e) => { if (e.key === 'Escape') onFermer(); };
    document.addEventListener('keydown', f);
    return () => document.removeEventListener('keydown', f);
  }, [onFermer]);
  const p = { margin: '0 0 10px', fontSize: 13.5, lineHeight: 1.55, color: E.texteSecondaire };
  const couche = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={T.infoTitre}
      className="en-anime"
      data-entree="info-voie"
      onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(16,32,27,0.45)', display: 'flex', alignItems: 'flex-end',
        justifyContent: 'center', fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      <div style={{
        width: '100%', maxWidth: 540, boxSizing: 'border-box', background: E.page, borderRadius: '22px 22px 0 0',
        padding: '14px 20px calc(env(safe-area-inset-bottom,0px) + 22px)', animation: 'enRemonte .32s cubic-bezier(.22,.61,.36,1)',
      }}>
        <div aria-hidden="true" style={{ width: 38, height: 4, borderRadius: 2, background: E.piste, margin: '0 auto 14px' }} />
        <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.01em', color: E.ink }}>{T.infoTitre}</h2>
        <p style={p}>{T.infoP1}</p>
        <p style={p}>{T.infoP2}</p>
        <p style={{ ...p, fontSize: 12.5, margin: '0 0 16px' }}>{T.infoP3}</p>
        <BoutonPrimaire onClick={onFermer}>{T.infoCompris}</BoutonPrimaire>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? couche : createPortal(couche, document.body);
}

export default function EtapeVoie({ c, T, onAller }) {
  const [info, setInfo] = useState(false);
  const noms = listeNoms(CLOUD_PLATEFORMES_CONNEXION.filter((p) => !(c.plateformesFermees ?? []).includes(p.id)).map((p) => p.nom), c.lang);

  const choisir = (v) => {
    c.journaliser(v === 'cloud' ? 'voie_cloud' : 'voie_extension');
    c.choisirVoie(v);
    onAller(v === 'cloud' ? 'cloud' : 'extension');
  };
  const ouvrirInfo = () => { c.journaliser('voie_info'); setInfo(true); };

  return (
    <Scene cle="voie" pied={<Texte centre style={{ margin: 0, fontSize: 12 }}>{T.voiePied}</Texte>}>
      <Kicker>{T.voieKicker}</Kicker>
      <Titre>{T.voieTitre}</Titre>
      <Texte>
        {T.voieTexteAvant}
        <button
          type="button"
          onClick={ouvrirInfo}
          aria-label={T.infoTitre}
          aria-haspopup="dialog"
          data-entree="info"
          className="en-focus"
          style={{
            position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20,
            boxSizing: 'border-box', borderRadius: 10, border: `1.5px solid ${E.tealDeep}`, background: E.card, color: E.tealDeep,
            fontFamily: 'inherit', fontSize: 12, fontWeight: 700, lineHeight: 1, verticalAlign: -4, margin: '0 0 0 5px', padding: 0, cursor: 'pointer',
          }}
        >
          i
          {/* La zone tactile : 12 px de plus de chaque côté, soit 44 × 44. */}
          <span aria-hidden="true" style={{ position: 'absolute', inset: -12 }} />
        </button>
        {' '}{T.voieTexteApres}
      </Texte>

      {/* LA CARTE CLOUD, devant. */}
      <div data-entree="voie-cloud" style={{
        position: 'relative', marginTop: 4, marginBottom: 12, padding: '15px 15px 13px', borderRadius: 20, background: E.card,
        border: `1.5px solid ${E.teal}`, boxShadow: '0 14px 30px -18px rgba(27,110,98,0.6)', display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <span style={{
          position: 'absolute', top: -10, right: 14, padding: '4px 10px', borderRadius: 999, background: DEGRADE_TEAL, color: '#FFFFFF',
          fontSize: 11, fontWeight: 700, boxShadow: '0 6px 14px -6px rgba(27,110,98,0.7)',
        }}>{T.voiePastille}</span>
        <Tete glyphe={<Glyphe><Cloud size={19} color={E.tealDeep} strokeWidth={2.2} /></Glyphe>} k={T.voieCloudK} t={T.voieCloudT} />
        <p style={styleP}>{T.voieCloudP(noms)}</p>
        <ul style={{ display: 'flex', flexWrap: 'wrap', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
          {T.voieCloudPlus.map((x) => (
            <li key={x} style={{ fontSize: 11.5, fontWeight: 700, color: E.tealDeep, background: E.mentheVive, border: `1px solid ${E.mentheBord}`, borderRadius: 999, padding: '4px 9px' }}>{x}</li>
          ))}
        </ul>
        <BoutonPrimaire onClick={() => choisir('cloud')}>{T.voieCloudCta}</BoutonPrimaire>
        <p style={styleNote}>{T.voieCloudNote}</p>
      </div>

      {/* L'EXTENSION, en alternative claire : son bouton à elle. */}
      <div data-entree="voie-extension" style={{
        padding: '15px 15px 13px', borderRadius: 20, background: E.paper, border: `1px solid ${E.border}`,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <Tete glyphe={<Glyphe neutre><Laptop size={19} color={E.ink} strokeWidth={2} /></Glyphe>} k={T.voieExtK} t={T.voieExtT} />
        <p style={styleP}>{T.voieExtP}</p>
        <button
          type="button"
          onClick={() => choisir('extension')}
          className="en-cta en-focus"
          style={{
            width: '100%', boxSizing: 'border-box', minHeight: 48, borderRadius: 999, border: `1.5px solid ${E.tealDeep}`,
            background: E.card, color: E.tealDeep, fontFamily: 'inherit', fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
          }}
        >
          {T.voieExtCta}
        </button>
        <p style={styleNote}>{T.voieExtNote}</p>
      </div>

      {info && <FenetreInfo T={T} onFermer={() => setInfo(false)} />}
    </Scene>
  );
}
