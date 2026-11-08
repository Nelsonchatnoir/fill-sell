// ═══════════════════════════════════════════════════════════════════════════
// L'INTERRUPTEUR « FILLSELL CLOUD · SANS ORDINATEUR · +24,99 €/MOIS » — FEUILLE DES FORMULES
// ═══════════════════════════════════════════════════════════════════════════
// CONCEPTION (04/10/2026), monté par components/ConversionModal.jsx derrière
// cloudOfferVisible() (drapeau baissé = jamais rendu).
//
// UN interrupteur pour TOUTES les cartes : l'option s'ajoute à la formule
// choisie, elle n'est pas un palier (décision Nico du 04/10). Depuis les
// décisions du 04/10 soir, elle se prend AUSSI seule sur un compte Free : pour
// un lecteur Free, l'interrupteur se pose AU-DESSUS de la carte Free et, coché,
// la carte Free porte sa propre voie « Free + FillSell Cloud » (bouton dédié,
// jamais onUpgrade('free')), les cartes payantes leur « + 24,99 € ».
//
// L'ESSAI, SANS PIÈGE : décoché, la pastille d'essai et la ligne « carte
// demandée, rien n'est prélevé pour l'option avant le [date] » ; coché, une
// frise en trois temps — aujourd'hui (carte demandée, rien prélevé), la DATE
// de bascule (24,99 €/mois), et la sortie (où, comment, prévenu la veille dans
// l'app et par e-mail). Essai déjà pris : ni pastille ni frise, une phrase qui
// dit que l'option est facturée dès aujourd'hui.
// La date vient TOUJOURS de maintenant + 7 jours (finEssaiSiOnCommence) : un
// essai pas encore ouvert n'a pas d'autre date vraie.
//
// ⛔ Ce bloc ne décide de rien : il reçoit `offre` (cloud/regles.js,
//    offreCloudPourModale) et `coche`. L'hôte transmet le choix par
//    onUpgrade(tier, { cloud }) ou, pour Free + FillSell Cloud, onCloudSeul().
import { useEffect, useState } from 'react';
import { Cloud } from 'lucide-react';
import { C, MENTHE, BLANC, DEGRADE_TEAL } from './theme';
import { textesCloud } from './textes';
import { dateLongue, finEssaiSiOnCommence } from './regles';
import { useDisponibiliteCloud, venteFermee, placesRestantes, RELECTURE_PLACES_MS } from './useDisponibiliteCloud';
// (08/11, refus Google) Mobile : un bouton d'achat n'agit qu'une fois le prix de la boutique affiché.
import { prixPret } from '../lib/prixBoutique';
import { usePrixBoutique } from '../lib/usePrixBoutique';

function Glyphe({ taille = 34 }) {
  return (
    <span aria-hidden="true" style={{
      width: taille, height: taille, borderRadius: Math.round(taille / 3), flexShrink: 0,
      background: MENTHE, border: `1px solid rgba(47,158,144,0.28)`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Cloud size={Math.round(taille * 0.52)} color={C.tealDeep} strokeWidth={2.2} />
    </span>
  );
}

// L'interrupteur lui-même : 46 × 28, piste teal quand il est coché. Toute la
// rangée d'en-tête est la zone tactile (≥ 44 px), pas seulement le bouton.
function Bascule({ coche }) {
  return (
    <span aria-hidden="true" style={{
      position: 'relative', width: 46, height: 28, borderRadius: 14, flexShrink: 0,
      background: coche ? C.tealDeep : '#CFC9BA', transition: 'background .18s ease',
    }}>
      <span style={{
        position: 'absolute', top: 3, left: 3, width: 22, height: 22, borderRadius: 11, background: BLANC,
        boxShadow: '0 1px 3px rgba(16,32,27,0.3)',
        transform: `translateX(${coche ? 18 : 0}px)`, transition: 'transform .18s cubic-bezier(.22,.61,.36,1)',
      }} />
    </span>
  );
}

export function PastilleEssai({ T }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', alignSelf: 'flex-start',
      fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      color: C.tealDeep, background: MENTHE, borderRadius: 999, padding: '4px 9px',
    }}>
      {T.essaiPastille}
    </span>
  );
}

// La frise de l'essai. `etapes` = [{ quand, quoi, bascule? }] ; le point de la
// bascule (le jour où l'option devient payante) est ambre, les autres teal.
function Frise({ etapes, zone = 'frise' }) {
  return (
    <ol data-zone={zone} style={{ listStyle: 'none', margin: '12px 0 0', padding: '12px 0 0', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 9 }}>
      {etapes.map((e, i) => (
        <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span aria-hidden="true" style={{
            width: 9, height: 9, borderRadius: 5, marginTop: 4, flexShrink: 0,
            background: e.bascule ? C.amber : C.teal,
          }} />
          <span style={{ fontSize: 12.5, lineHeight: 1.45, color: C.ink, minWidth: 0 }}>
            <strong style={{ fontWeight: 700 }}>{e.quand}</strong>
            <span style={{ color: C.mute2, fontWeight: 600 }}> — {e.quoi}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

// La date de bascule d'un essai qui commencerait maintenant (jamais en dur).
const dateBascule = (lang, maintenant) => dateLongue(finEssaiSiOnCommence(maintenant), lang);

// Les trois temps de l'essai ; le 2e (la bascule) est marqué.
function etapesEssai(T, lang, maintenant) {
  const [aujourdhui, bascule, sortie] = T.frise(dateBascule(lang, maintenant));
  return [aujourdhui, { ...bascule, bascule: true }, sortie];
}

const styleBoutonPlein = {
  width: '100%', minHeight: 48, border: 'none', borderRadius: 14, cursor: 'pointer',
  background: DEGRADE_TEAL, color: BLANC, fontFamily: 'inherit', fontSize: 14.5, fontWeight: 700,
  boxShadow: '0 10px 22px -8px rgba(47,158,144,0.5)',
};

/**
 * (07/11, décision de Nico) « 14 places restantes » — le nombre de la vente (placesRestantes, lu dans
 * cloud_disponibilite_moi, relu seul sur l'écran). Rien tant que le nombre n'est pas sûr ; 0 = le bloc « Complet »
 * s'affiche à la place, jamais « 0 place restante ».
 */
export function CompteurPlacesCloud({ dispo, lang = 'fr' }) {
  const n = placesRestantes(dispo);
  if (n == null || n <= 0) return null;
  const T = textesCloud(lang);
  return (
    <p data-cloud="places" aria-live="polite" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', margin: 0,
      fontSize: 12, fontWeight: 700, lineHeight: 1.3, color: C.tealDeep,
    }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 4, background: C.teal, flexShrink: 0 }} />
      {T.placesRestantes(n)}
    </p>
  );
}

/**
 * (03/11, point 5 de Nico) À LA PLACE DU BOUTON D'ACHAT quand la vente est fermée (aucune place serveur, aucune IP,
 * ou une file d'attente devant) : « Complet pour le moment » et « Être prévenu(e) » (une notification, jamais un
 * mail ; la place est gardée 24 h). dispo = lireDisponibilite (useDisponibiliteCloud).
 */
export function BlocCompletCloud({ dispo, onInscrire, lang = 'fr' }) {
  const T = textesCloud(lang);
  const [envoi, setEnvoi] = useState('repos');
  const inscrit = dispo?.inscrit === true;
  return (
    <div data-cloud="complet" style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, lineHeight: 1.4, color: C.ink }}>{T.completTitre}</p>
      <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.5, fontWeight: 600, color: C.mute2 }}>
        {inscrit ? T.completInscrit(dispo?.rang ?? null) : T.completTexte}
      </p>
      {!inscrit && typeof onInscrire === 'function' && (
        <button
          type="button"
          disabled={envoi === 'envoi'}
          onClick={async () => { setEnvoi('envoi'); const fait = await onInscrire(); setEnvoi(fait ? 'repos' : 'echec'); }}
          style={{ ...styleBoutonPlein, marginTop: 10, opacity: envoi === 'envoi' ? 0.7 : 1 }}
        >
          {T.completCta}
        </button>
      )}
      {envoi === 'echec' && (
        <p role="alert" style={{ margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.45, fontWeight: 700, color: C.ink }}>{T.completEchec}</p>
      )}
    </div>
  );
}

/**
 * offre : { mode: 'interrupteur', essai } (sinon rien n'est rendu ici)
 * coche, onBasculer(bool), lang, maintenant (horloge injectable pour l'aperçu)
 * freeCompris : la carte Free porte la voie « Free + FillSell Cloud »
 */
export default function InterrupteurCloud({ offre, coche, onBasculer, lang = 'fr', maintenant, freeCompris = false }) {
  // L'horloge est figée à l'ouverture : la date de bascule affichée ne bouge
  // pas sous les yeux, et le rendu reste pur. `maintenant` = horloge de l'aperçu.
  const [horloge] = useState(() => Date.now());
  // (03/11, point 5) La vente est-elle possible ? Lu seulement quand l'interrupteur se montre (porte du Cloud).
  const vente = useDisponibiliteCloud({ actif: offre?.mode === 'interrupteur', relireToutesLesMs: RELECTURE_PLACES_MS });
  const fermee = venteFermee(vente.dispo);
  // Vente fermée : l'option ne reste jamais cochée (la formule seule part, sans option).
  useEffect(() => { if (fermee && coche) onBasculer?.(false); }, [fermee, coche, onBasculer]);
  if (offre?.mode !== 'interrupteur') return null;
  const T = textesCloud(lang);
  const now = maintenant ?? horloge;
  return (
    <div data-cloud="interrupteur" style={{
      background: C.paper, borderRadius: 18, padding: '12px 14px 14px',
      border: coche ? `1.5px solid ${C.teal}` : `1px solid ${C.border}`,
      boxShadow: coche ? '0 10px 26px -18px rgba(27,110,98,0.55)' : 'none',
      transition: 'border-color .18s ease',
    }}>
      <button
        type="button"
        role="switch"
        aria-checked={coche && !fermee}
        aria-disabled={fermee || undefined}
        onClick={() => { if (!fermee) onBasculer?.(!coche); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 11, width: '100%', minHeight: 48,
          padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <Glyphe />
        <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, lineHeight: 1.3, color: C.ink, letterSpacing: '-0.01em' }}>
          {T.libelleInterrupteur}
        </span>
        <Bascule coche={coche} />
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 6 }}>
        {offre.essai && <PastilleEssai T={T} />}
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, fontWeight: 600, color: C.mute2 }}>
          {T.ceQueCaFait} {T.ebayDeja}
        </p>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, fontWeight: 600, color: C.mute2 }}>
          {freeCompris ? T.sAjouteFree : T.sAjoute}
          {offre.essai && !coche ? <> {T.carteDemandee(dateBascule(lang, now))}</> : null}
        </p>
        {!fermee && <CompteurPlacesCloud dispo={vente.dispo} lang={lang} />}
      </div>

      {fermee && <BlocCompletCloud dispo={vente.dispo} onInscrire={vente.inscrire} lang={lang} />}
      {coche && !fermee && (offre.essai
        ? <Frise etapes={etapesEssai(T, lang, now)} />
        : (
          <p data-zone="sans-essai" style={{ margin: '12px 0 0', padding: '12px 0 0', borderTop: `1px solid ${C.border}`, fontSize: 12.5, lineHeight: 1.5, fontWeight: 600, color: C.ink }}>
            {T.sansEssai}
          </p>
        ))}
    </div>
  );
}

/**
 * La voie « Free + FillSell Cloud », posée DANS la carte Free quand
 * l'interrupteur est coché. Bouton dédié : `onCloudSeul` (jamais
 * onUpgrade('free'), qui partirait en paiement de formule). Sans geste d'hôte,
 * rien n'est rendu.
 * quotaFree : le nombre d'annonces du plan Free, LU dans coin_config
 * (quota_annonces_free) par l'hôte — jamais écrit ici.
 */
export function SectionFreeCloud({ offre, quotaFree, onCloudSeul, lang = 'fr', maintenant }) {
  const [horloge] = useState(() => Date.now());
  const vente = useDisponibiliteCloud({ actif: offre?.mode === 'interrupteur' && typeof onCloudSeul === 'function', relireToutesLesMs: RELECTURE_PLACES_MS });
  if (offre?.mode !== 'interrupteur' || typeof onCloudSeul !== 'function') return null;
  const T = textesCloud(lang);
  const n = Number(quotaFree);
  const quota = Number.isFinite(n) ? n : null;
  const etapes = T.freeCloudFrise(dateBascule(lang, maintenant ?? horloge), quota)
    .map((e, i) => (i === 2 ? { ...e, bascule: true } : e));
  return (
    <div data-cloud="free" style={{ marginTop: 2, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Glyphe taille={28} />
        <span style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>{T.freeCloudTitre}</span>
      </div>
      <p data-zone="quota-free" style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.45, fontWeight: 700, color: C.ink }}>
        {T.freeCloudQuota(quota)}
      </p>
      {offre.essai
        ? <Frise etapes={etapes} zone="frise-free" />
        : <p style={{ margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.5, fontWeight: 600, color: C.mute2 }}>{T.freeCloudSansEssai}</p>}
      {venteFermee(vente.dispo)
        ? <BlocCompletCloud dispo={vente.dispo} onInscrire={vente.inscrire} lang={lang} />
        : (
          <>
            {placesRestantes(vente.dispo) > 0 && <div style={{ display: 'flex', marginTop: 12 }}><CompteurPlacesCloud dispo={vente.dispo} lang={lang} /></div>}
            <button type="button" onClick={onCloudSeul} disabled={!prixPret('cloud')} style={{ ...styleBoutonPlein, marginTop: placesRestantes(vente.dispo) > 0 ? 8 : 12, ...(prixPret('cloud') ? {} : { opacity: 0.55, cursor: 'default' }) }}>
              {offre.essai ? T.freeCloudCtaEssai : T.freeCloudCta}
            </button>
          </>
        )}
    </div>
  );
}

/** Une ligne à la place de l'interrupteur : option déjà active, ou en pause. */
export function LigneCloudModale({ offre, lang = 'fr' }) {
  if (offre?.mode !== 'deja_actif' && offre?.mode !== 'suspendu') return null;
  const T = textesCloud(lang);
  return (
    <div data-cloud="ligne" style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 16, padding: '10px 12px' }}>
      <Glyphe taille={30} />
      <span style={{ fontSize: 12.5, lineHeight: 1.45, fontWeight: 600, color: C.ink }}>
        {offre.mode === 'deja_actif' ? T.dejaActif : T.suspenduModale}
      </span>
    </div>
  );
}

/**
 * Le prix d'une carte quand l'option est cochée : « 12,99 € + 24,99 € ».
 * `cloud` = { essai } ; `sombre` = cartes Pro / Business (fond encre).
 * Hors option, la carte garde SON balisage d'origine (ConversionModal) —
 * ce composant n'est jamais rendu.
 */
export function PrixAvecCloud({ prix, cloud, sombre = false, taille = 22, lang = 'fr', encreClaire = C.ink }) {
  usePrixBoutique({ charger: false });
  const T = textesCloud(lang);
  const encre = sombre ? C.paper : encreClaire;
  const sous = sombre ? 'rgba(246,245,241,0.78)' : C.mute2;
  return (
    <div data-cloud="prix" style={{ textAlign: 'right', minWidth: 0 }}>
      <div style={{ lineHeight: 1, whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: taille, fontWeight: 700, letterSpacing: '-0.02em', color: encre }}>{prix}</span>
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: sombre ? '#9BE8DC' : C.tealDeep }}> {T.prixOption}</span>
      </div>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: sous, marginTop: 3 }}>
        {cloud?.essai ? T.prixOptionSousEssai : T.prixOptionSous}
      </div>
    </div>
  );
}

/**
 * Ajouter l'option à la formule DÉJÀ payée (Premium, Pro, Business), sans
 * changer de palier. ⛔ Jamais par onUpgrade(palier actuel) : les hôtes
 * actuels lanceraient un SECOND abonnement. Rendu seulement si l'hôte fournit
 * `onAjouter` (aucun ne le fait tant que le paiement de l'option n'existe pas).
 */
export function CarteAjoutCloud({ offre, nomPalier, onAjouter, lang = 'fr', maintenant }) {
  const [horloge] = useState(() => Date.now());
  const vente = useDisponibiliteCloud({ actif: offre?.mode === 'interrupteur' && typeof onAjouter === 'function', relireToutesLesMs: RELECTURE_PLACES_MS });
  if (offre?.mode !== 'interrupteur' || typeof onAjouter !== 'function') return null;
  const T = textesCloud(lang);
  return (
    <div data-cloud="ajout" style={{ background: C.paper, border: `1.5px solid ${C.teal}`, borderRadius: 18, padding: '12px 14px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, minHeight: 44 }}>
        <Glyphe />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.3, color: C.ink }}>{T.libelleInterrupteur}</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.mute2, marginTop: 2 }}>{T.ajoutTitre(nomPalier)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 6 }}>
        {offre.essai && <PastilleEssai T={T} />}
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, fontWeight: 600, color: C.mute2 }}>{T.ceQueCaFait}</p>
      </div>
      {offre.essai ? <Frise etapes={etapesEssai(T, lang, maintenant ?? horloge)} /> : (
        <p style={{ margin: '10px 0 0', fontSize: 12.5, lineHeight: 1.5, fontWeight: 600, color: C.ink }}>{T.aucunNote}</p>
      )}
      {venteFermee(vente.dispo)
        ? <BlocCompletCloud dispo={vente.dispo} onInscrire={vente.inscrire} lang={lang} />
        : (
          <>
            {placesRestantes(vente.dispo) > 0 && <div style={{ display: 'flex', marginTop: 12 }}><CompteurPlacesCloud dispo={vente.dispo} lang={lang} /></div>}
            <button type="button" onClick={onAjouter} disabled={!prixPret('cloud')} style={{ ...styleBoutonPlein, marginTop: placesRestantes(vente.dispo) > 0 ? 8 : 12, ...(prixPret('cloud') ? {} : { opacity: 0.55, cursor: 'default' }) }}>
              {offre.essai ? T.ajoutCtaEssai : T.ajoutCta}
            </button>
          </>
        )}
    </div>
  );
}
