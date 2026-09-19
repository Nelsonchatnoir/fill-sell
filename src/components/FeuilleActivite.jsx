// ═══════════════════════════════════════════════════════════════════════════
// LES DEUX FEUILLES DU HAUT DU STOCK (2026-09-19)
// ═══════════════════════════════════════════════════════════════════════════
// Le bandeau du Stock tient sur UNE ligne : l'article qui tourne, la
// plateforme, le compteur. Ce qu'une ligne ne peut pas dire vit ici :
//
//   · FeuilleFile    — TOUTE la file, dans l'ordre réel de traitement, avec
//                      l'état de chaque annonce et le bouton d'arrêt au pied ;
//   · FeuilleAttente — ce qui attend un geste : les annonces à compléter ET
//                      celles qui ne sont pas parties, chacune avec SON geste.
//
// ⛔ AFFICHAGE PUR. Aucune écriture : les gestes rappellent les portes qui
//    existent déjà (le mini-éditeur « À compléter », la modale d'échec, l'arrêt
//    de la vague). On ouvre une porte, on n'en perce pas une nouvelle.
//
// ⛔ PORTAIL OBLIGATOIRE — la coque ci-dessous porte createPortal, le verrou de
//    geste, Échap et le retour Android. C'est la règle des couches
//    (utils/modale.js) : une feuille rendue dans .app-root est invisible
//    par-dessus une page portalisée, quel que soit son z-index.
import { createPortal } from 'react-dom';
import { X, Pause, ChevronRight } from 'lucide-react';
import { useFondFige, useEchap, useRetourAndroid } from '../utils/modale';
import PlatformLogo from './platform-logos/PlatformLogo';
import GalleryPhoto, { premierePhoto } from './GalleryPhoto';

const T = {
  ink: '#10201B', mute: '#5C6560', faint: '#8A8578',
  card: '#FFFFFF', paper: '#F7F5EF', page: '#FAF8F4',
  line: '#E7E3D8', lineSoft: '#EFECE3', track: '#F1EEE6',
  teal: '#2F9E90', tealDeep: '#1B6E62', tealWash: '#F0FDFB',
  amberInk: '#8A6100', amberFill: '#FFF6E3', amberLine: '#EED9A6',
  redInk: '#B91C1C', redFill: '#FEF2F2', redLine: '#FECACA',
};

// Au-dessus de la barre du haut (10) et de la nav (50), SOUS la modale de
// conversion (9990) et « signaler un bug » (10000) — mêmes bornes que la
// feuille des filtres, qu'un geste d'ici peut ouvrir.
const Z = 600;
const TOUCHE = 44;

// ── La coque : portail, fond cliquable, en-tête figé, corps qui défile ──────
function Coque({ titre, sousTitre, onFermer, lang, enTete = null, pied = null, children }) {
  useFondFige(true);
  useEchap(onFermer);
  useRetourAndroid(onFermer);
  const fr = lang !== 'en';
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={titre}
      style={{ position: 'fixed', inset: 0, zIndex: Z, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      {/* Le fond est une sortie à part entière, et la plus grande de toutes. */}
      <button type="button" aria-label={fr ? 'Fermer' : 'Close'} onClick={onFermer}
        style={{ position: 'absolute', inset: 0, border: 'none', padding: 0, background: 'rgba(16,32,27,0.45)', cursor: 'pointer' }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 560, maxHeight: '86vh',
        display: 'flex', flexDirection: 'column', background: T.page,
        borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 40px rgba(16,32,27,0.22)',
        fontFamily: 'inherit',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8, flexShrink: 0 }}>
          <span aria-hidden="true" style={{ width: 38, height: 4, borderRadius: 99, background: T.line }} />
        </div>
        {/* L'en-tête ne défile pas : la croix reste atteignable quel que soit
            le contenu, et le compteur reste sous les yeux pendant qu'on lit. */}
        <div style={{ flexShrink: 0, padding: '6px 12px 10px', borderBottom: `1px solid ${T.lineSoft}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.ink, letterSpacing: '-0.015em' }}>{titre}</h2>
              {sousTitre && (
                <div style={{ fontSize: 11.5, color: T.faint, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{sousTitre}</div>
              )}
            </div>
            <button type="button" onClick={onFermer} aria-label={fr ? 'Fermer' : 'Close'}
              style={{ width: TOUCHE, height: TOUCHE, marginTop: -6, marginRight: -8, borderRadius: 22, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
              <X size={20} color={T.ink} strokeWidth={2.2} />
            </button>
          </div>
          {enTete}
        </div>
        <div style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: 1, minHeight: 0, padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {children}
        </div>
        {pied && (
          <div style={{
            flexShrink: 0, padding: '10px 12px', borderTop: `1px solid ${T.lineSoft}`, background: T.card,
            paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
            display: 'flex', flexDirection: 'column', gap: 7,
          }}>
            {pied}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── Une ligne : miniature, titre, plateforme, état ─────────────────────────
// La miniature se lit sur les photos DÉJÀ en base. Pas de photo, ou URL morte
// (CDN Vinted expiré) : le logo de la plateforme tient la place — jamais une
// image cassée, jamais un carré vide.
function Ligne({ item, job, etat, kind, detail, estompee = false, action = null, live = false }) {
  const photo = item ? premierePhoto(item.photos) : null;
  const titre = item?.title ?? job?.title ?? '';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 14,
      background: live ? T.tealWash : T.card,
      border: `1px solid ${live ? 'rgba(47,158,144,0.45)' : T.lineSoft}`,
      opacity: estompee ? 0.62 : 1,
    }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, overflow: 'hidden', background: T.paper, border: `1px solid ${T.lineSoft}`, display: 'grid', placeItems: 'center' }}>
        {photo
          ? <GalleryPhoto url={photo} alt="" fallback={<PlatformLogo platform={job?.platform} size={18} />} />
          : <PlatformLogo platform={job?.platform} size={18} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {titre}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2, fontSize: 11, color: T.mute, minWidth: 0 }}>
          <PlatformLogo platform={job?.platform} size={13} />
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{kind}</span>
        </div>
        {detail && (
          <div style={{ marginTop: 5, fontSize: 11, fontWeight: 600, color: T.tealDeep, lineHeight: 1.4 }}>
            {detail}
          </div>
        )}
      </div>
      {action}
      {etat && (
        <span style={{
          flexShrink: 0, fontSize: 10.5, fontWeight: 700, padding: '4px 8px', borderRadius: 999,
          whiteSpace: 'nowrap', background: etat.fond, border: `1px solid ${etat.bord}`, color: etat.encre,
        }}>{etat.court}</span>
      )}
    </div>
  );
}

function Groupe({ children }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: T.faint, padding: '8px 2px 0' }}>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FEUILLE 1 — « Ce qui tourne »
// ═══════════════════════════════════════════════════════════════════════════
// Trois groupes, et c'est l'ORDRE RÉEL de traitement qui les sépare : ce qui
// tourne maintenant, ce qui passe ensuite, ce qui est fini. Le compteur du
// bandeau et le nombre du bouton d'arrêt se lisent enfin ensemble : « 0 sur 8 »
// compte les huit lignes, « arrêter les 4 » ne vise que celles qui portent
// encore « En file » — la feuille le MONTRE au lieu de le faire deviner.
export function FeuilleFile({ lang, lignes, total, faites, estimation, annulables, onArreter, fiche, etatDe, onFermer }) {
  const fr = lang !== 'en';
  const pct = total > 0 ? Math.round((100 * faites) / total) : 0;
  const groupes = [
    { cle: 'live', titre: fr ? 'En cours' : 'Running', items: lignes.filter((l) => l.live) },
    { cle: 'suite', titre: fr ? 'Ensuite' : 'Next up', items: lignes.filter((l) => !l.live && !l.fini) },
    { cle: 'fait', titre: fr ? 'Terminé' : 'Done', items: lignes.filter((l) => l.fini) },
  ].filter((g) => g.items.length > 0);

  return (
    <Coque
      lang={lang}
      titre={fr ? 'Ce qui tourne' : 'What is running'}
      sousTitre={fr
        ? `${faites} sur ${total}${estimation ? ` · il reste ${estimation}` : ''}`
        : `${faites} of ${total}${estimation ? ` · ${estimation} left` : ''}`}
      onFermer={onFermer}
      enTete={(
        <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={faites}
          style={{ height: 4, borderRadius: 999, background: T.track, marginTop: 10, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg,${T.teal},${T.tealDeep})`, transition: 'width .6s ease' }} />
        </div>
      )}
      pied={annulables?.length > 0 ? (
        <>
          <button type="button" onClick={onArreter}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', border: `1px solid ${T.line}`, background: 'transparent', color: T.mute, borderRadius: 12, padding: '11px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.45 }}>
            <Pause size={14} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              {fr
                ? (annulables.length > 1
                  ? `Arrêter les ${annulables.length} republications en attente`
                  : 'Arrêter la republication en attente')
                : (annulables.length > 1
                  ? `Stop the ${annulables.length} queued reposts`
                  : 'Stop the queued repost')}
            </span>
          </button>
          <div style={{ fontSize: 11.5, color: T.faint, textAlign: 'center', lineHeight: 1.45 }}>
            {fr ? 'Tes annonces restent en ligne, rien n’est supprimé.' : 'Your listings stay online, nothing is deleted.'}
          </div>
        </>
      ) : null}
    >
      {groupes.map((g) => (
        <div key={g.cle} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Groupe>{g.cle === 'suite' ? `${g.titre} · ${g.items.length}` : g.titre}</Groupe>
          {g.items.map((l) => (
            <Ligne key={l.cle} job={l.job} item={fiche(l.job)} live={l.live}
              estompee={l.fini} etat={etatDe(l.job)} kind={l.kind} detail={l.detail} />
          ))}
        </div>
      ))}
    </Coque>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FEUILLE 2 — « Ce qui attend une action de ta part »
// ═══════════════════════════════════════════════════════════════════════════
// UN seul endroit pour les deux causes qui demandent un geste : l'annonce à
// COMPLÉTER (il manque une information) et celle qui N'EST PAS PARTIE. Avant,
// la première avait son bandeau et la seconde n'était nulle part ; et le tap
// ne faisait que filtrer la liste — il fallait ensuite ouvrir chaque carte pour
// savoir ce qui manquait. Ici, la cause est écrite et le geste est sur la ligne.
export function FeuilleAttente({ lang, lignes, onCompleter, onVoirEchec, fiche, onFiltrerListe, onFermer }) {
  const fr = lang !== 'en';
  const echecs = lignes.filter((l) => l.cause === 'echec').length;
  const aCompleter = lignes.length - echecs;
  const sous = [
    echecs > 0 ? (fr ? `${echecs} n’${echecs > 1 ? 'ont' : 'a'} pas été publiée${echecs > 1 ? 's' : ''}` : `${echecs} didn’t go out`) : null,
    aCompleter > 0 ? (fr ? `${aCompleter} à compléter` : `${aCompleter} to complete`) : null,
  ].filter(Boolean).join(' · ');

  return (
    <Coque
      lang={lang}
      titre={fr ? 'Ce qui attend une action de ta part' : 'Waiting on you'}
      sousTitre={sous}
      onFermer={onFermer}
      pied={onFiltrerListe ? (
        <button type="button" onClick={onFiltrerListe}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', border: `1px solid ${T.line}`, background: 'transparent', color: T.mute, borderRadius: 12, padding: '11px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            {fr ? 'Voir ces articles dans mon stock' : 'Show these items in my stock'}
          </span>
          <ChevronRight size={15} style={{ flexShrink: 0 }} />
        </button>
      ) : null}
    >
      {lignes.map((l) => {
        const rouge = l.cause === 'echec';
        return (
          <Ligne
            key={l.cle}
            job={l.job}
            item={fiche(l.job)}
            kind={l.cause_texte}
            etat={rouge
              ? { court: fr ? 'Pas partie' : 'Not sent', fond: T.redFill, bord: T.redLine, encre: T.redInk }
              : { court: fr ? 'À compléter' : 'To complete', fond: T.amberFill, bord: T.amberLine, encre: T.amberInk }}
            action={(
              <button type="button"
                onClick={() => (l.completable ? onCompleter(l.job) : onVoirEchec(l.job))}
                style={{
                  flexShrink: 0, border: 'none', borderRadius: 999, padding: '7px 12px', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, color: '#fff',
                  background: `linear-gradient(120deg,${T.teal},${T.tealDeep})`,
                }}>
                {l.completable ? (fr ? 'Compléter' : 'Complete') : (fr ? 'Voir' : 'See')}
              </button>
            )}
          />
        );
      })}
    </Coque>
  );
}
