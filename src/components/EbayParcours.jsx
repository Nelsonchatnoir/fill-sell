// ═══════════════════════════════════════════════════════════════════════════
// eBAY — LE PARCOURS GUIDÉ, UNE ÉTAPE À LA FOIS (2026-09-22, dossier Romain)
// ═══════════════════════════════════════════════════════════════════════════
// Avant : six lignes de checklist ouvertes en même temps, chacune avec son
// sous-écran, ses liens et ses boutons. Romain a passé plusieurs jours dedans
// sans savoir « ce qu'il y avait à faire ».
//
// Maintenant : UNE étape à la fois, dans l'ordre qu'eBay impose. Chaque étape
// dit ce que c'est, pourquoi eBay le demande, et porte UN seul geste. Ce qui
// est déjà fait se replie. Quand il ne reste rien : « eBay est prêt ».
//
// ⛔ CE COMPOSANT NE PARLE À PERSONNE. Il ne fait aucun appel, ne tient aucun
//    état de compte : il reçoit les verdicts (utils/ebayParcours) et rend le
//    CORPS de l'étape courante par render-prop. Toute la mécanique (politiques,
//    transporteurs, lieu d'expédition) reste où elle était, dans
//    EbayCompteSection — on ne duplique pas un seul appel.
// ═══════════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { UI } from './ui';
import { etapesEbay, etapeCouranteEbay, progressionEbay, motsEbay } from '../utils/ebayParcours';

const carte = {
  background: UI.card,
  border: `1px solid ${UI.border}`,
  borderRadius: 14,
  padding: '14px 15px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

function Puce({ fait }) {
  return (
    <span
      aria-hidden
      style={{
        width: 20, height: 20, borderRadius: 999, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 800,
        background: fait ? `${UI.teal}1A` : `${UI.amber}22`,
        color: fait ? UI.tealDeep : '#9A5A3A',
        border: `1px solid ${fait ? UI.teal : UI.amber}55`,
      }}
    >
      {fait ? '✓' : '○'}
    </span>
  );
}

// Barre d'avancement — informative, jamais un score. Elle existe pour que la
// personne sache qu'il y a une fin, et à quelle distance elle est.
function Barre({ faites, total }) {
  const part = total > 0 ? Math.round((faites / total) * 100) : 0;
  return (
    <div style={{ height: 5, borderRadius: 999, background: `${UI.border}`, overflow: 'hidden' }}>
      <div style={{ width: `${part}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg,${UI.tealDeep},${UI.teal})`, transition: 'width .3s ease' }} />
    </div>
  );
}

/**
 * @param {object}   props
 * @param {'fr'|'en'} props.lang
 * @param {object}   props.etats        { [cle]: 'ok' | 'manque' | 'inconnu' }
 * @param {function} props.rendreCorps  (cle) => ReactNode — les contrôles de l'étape
 * @param {function} props.rendrePret   () => ReactNode — ce que voit l'acheteur, tout vert
 * @param {boolean}  props.chargement   relevé en cours (on n'affiche pas un verdict périmé)
 */
export default function EbayParcours({ lang = 'fr', etats, rendreCorps, rendrePret, chargement = false }) {
  const m = motsEbay(lang);
  const [faitesOuvertes, setFaitesOuvertes] = useState(false);
  // Une étape déjà faite qu'on rouvre pour la CHANGER (ses transporteurs, son
  // lieu d'expédition). Elle ne redevient pas « à faire » : on la déplie, et
  // le corps est exactement celui de l'étape courante.
  const [etapeRouverte, setEtapeRouverte] = useState(null);

  const liste = etapesEbay(etats, lang);
  const prog = progressionEbay(etats);
  const cleCourante = etapeCouranteEbay(etats);
  const courante = liste.find((e) => e.cle === cleCourante) ?? null;
  const faites = liste.filter((e) => e.fait);
  // Rang affiché : la position de l'étape courante parmi les étapes LUES.
  const rang = courante ? liste.findIndex((e) => e.cle === courante.cle) + 1 : liste.length;

  if (!liste.length) {
    return chargement ? null : null;
  }

  // ── TOUT EST VERT ────────────────────────────────────────────────────────
  // L'écran ne dit plus « 6 coches » : il dit la seule chose qui compte, puis
  // montre ce que voit l'acheteur et laisse le changer.
  if (prog.pret) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{
          ...carte,
          background: `${UI.teal}12`,
          border: `1px solid ${UI.teal}55`,
          gap: 4,
        }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: UI.tealDeep }}>{m.pret}</div>
          <div style={{ fontSize: 12.5, color: UI.mute2, lineHeight: 1.5 }}>{m.pretSous}</div>
        </div>
        {rendrePret ? rendrePret() : null}
        <BlocFaites
          liste={faites}
          m={m}
          ouvert={faitesOuvertes}
          setOuvert={setFaitesOuvertes}
          etapeRouverte={etapeRouverte}
          setEtapeRouverte={setEtapeRouverte}
          rendreCorps={rendreCorps}
        />
      </div>
    );
  }

  // ── IL RESTE DES ÉTAPES ──────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: UI.mute2, letterSpacing: '.04em' }}>
            {m.compteur(rang, liste.length)}
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: UI.mute }}>{m.restantes(prog.restantes)}</span>
        </div>
        <Barre faites={prog.faites} total={liste.length} />
      </div>

      {courante && (
        <div style={carte}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Puce fait={false} />
            <div style={{ fontSize: 15, fontWeight: 800, color: UI.ink, lineHeight: 1.3, flex: 1, minWidth: 0 }}>
              {courante.titre}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <Ligne k={m.cestQuoi} v={courante.cestQuoi} />
            <Ligne k={m.pourquoi} v={courante.pourquoi} />
          </div>

          {/* UN SEUL GESTE par étape : le corps est fourni par les Réglages,
              qui tiennent déjà les handlers. On ne recrée aucun bouton ici. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rendreCorps ? rendreCorps(courante.cle) : null}
          </div>

          {courante.apres && (
            <div style={{ fontSize: 11.5, color: UI.mute, lineHeight: 1.45 }}>{courante.apres}</div>
          )}
        </div>
      )}

      <BlocFaites
        liste={faites}
        m={m}
        ouvert={faitesOuvertes}
        setOuvert={setFaitesOuvertes}
        etapeRouverte={etapeRouverte}
        setEtapeRouverte={setEtapeRouverte}
        rendreCorps={rendreCorps}
      />
    </div>
  );
}

function Ligne({ k, v }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: UI.mute, letterSpacing: '.06em', textTransform: 'uppercase' }}>{k}</div>
      <div style={{ fontSize: 13, color: UI.ink, lineHeight: 1.5, marginTop: 2 }}>{v}</div>
    </div>
  );
}

// Ce qui est fait ne s'affiche pas en grand : une ligne repliée, qu'on peut
// rouvrir pour changer un réglage (ses transporteurs, son lieu d'expédition).
function BlocFaites({ liste, m, ouvert, setOuvert, etapeRouverte, setEtapeRouverte, rendreCorps }) {
  if (!liste.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button
        type="button"
        onClick={() => setOuvert(!ouvert)}
        className="rg-focus"
        style={{
          alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0,
          fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: UI.mute2,
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        <span aria-hidden style={{ color: UI.tealDeep }}>✓</span>
        {m.faites(liste.length)} · {ouvert ? m.masquerFaites : m.voirFaites}
      </button>
      {ouvert && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {liste.map((e) => {
            const rouverte = etapeRouverte === e.cle;
            return (
              <div key={e.cle} style={{ ...carte, padding: '11px 13px', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Puce fait />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: UI.ink }}>{e.titre}</span>
                  {/* On ne propose de rouvrir que ce qui se règle ICI : renvoyer
                      quelqu'un sur eBay pour une étape déjà faite n'a aucun sens. */}
                  {e.ici && (
                    <button
                      type="button"
                      onClick={() => setEtapeRouverte(rouverte ? null : e.cle)}
                      className="rg-focus"
                      style={{
                        background: 'none', border: 'none', padding: 0, fontFamily: 'inherit',
                        fontSize: 12, fontWeight: 700, color: UI.tealDeep, cursor: 'pointer', flexShrink: 0,
                      }}
                    >
                      {rouverte ? m.masquerFaites : m.modifier}
                    </button>
                  )}
                </div>
                {rouverte && rendreCorps ? rendreCorps(e.cle) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
