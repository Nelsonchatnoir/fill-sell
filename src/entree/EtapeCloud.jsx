// ── 2 ter. FILLSELL CLOUD : « RIEN À PAYER AVANT LE … » (04/11/2026, lot 3) ────
// Maquette o-cloud-essai, validée par Nico le 03/11. N'existe que sur la voie
// Cloud choisie (plan.js).
//
// ⛔ LA DATE DE BASCULE EST LE TITRE : maintenant + 7 jours, calculée comme la
//    feuille des formules (finEssaiSiOnCommence, heure de Paris), jamais en dur.
// ⛔ AUCUN PAIEMENT ICI. « Commencer mes 7 jours offerts » appelle le chemin
//    d'achat EXISTANT (c.cloud.lancerEssai → essaiCloud d'App.jsx →
//    achatCloud.acheter : conditions, place réservée, Stripe ou boutique, on ne
//    croit que le serveur). L'écran ne fait que montrer ce qu'il rend.
// ⛔ TOUTES LES PLACES PRISES : l'écran devient la liste d'attente déjà écrite
//    (cloud/textes.js « Complet pour le moment » / « Être prévenu(e) »,
//    useDisponibiliteCloud.inscrire) — jamais une vente, ni prix ni frise.
// ⛔ La dernière ligne de « Ce que fait le Cloud » dit AVANT de payer que le
//    Cloud ne change pas les quotas (chiffres lus dans coin_config, grille seulement).
import { useState } from 'react';
import { CLOUD_PLATEFORMES_CONNEXION } from '../config/cloudOffer';
import { textesCloud } from '../cloud/textes';
import { textesConnexion } from '../cloud/textesConnexion';
import { grilleDuPalier } from '../utils/jauges';
import { E } from './theme';
import { Scene, Kicker, Titre, Texte, Carte, BoutonPrimaire, LienDiscret, Bande, TitreCarte } from './EntreeUI';
import { listeNoms, listeJauges } from './regles';
// (05/11 soir, décision l de Nico) Les mentions d'abonnement et les liens EULA / conditions / confidentialité.
import MentionsAbonnement from '../components/MentionsAbonnement';
// (08/11, refus Google) Mobile : le bouton n'achète qu'une fois le prix de la boutique affiché.
import { prixPret, zeroAffiche } from '../lib/prixBoutique';
import { usePrixBoutique } from '../lib/usePrixBoutique';

function Coche({ children, k, dernier }) {
  return (
    <div className="en-monte" style={{
      display: 'flex', gap: 11, alignItems: 'flex-start', padding: '11px 0', animationDelay: `${k * 70}ms`,
      borderBottom: dernier ? 'none' : `1px solid ${E.ligneDouce}`,
    }}>
      <span aria-hidden="true" style={{
        width: 19, height: 19, marginTop: 1, borderRadius: 10, flexShrink: 0, background: E.menthe, border: `1px solid ${E.mentheBord}`,
        color: E.tealDeep, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
      }}>✓</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.5, color: E.ink }}>{children}</span>
    </div>
  );
}

// La frise en trois temps : aujourd'hui (point plein), la veille, la bascule.
export function Frise({ etapes }) {
  return (
    <Carte style={{ padding: '16px 16px 14px', marginBottom: 12 }}>
      <ol data-entree="frise" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {etapes.map((e, k) => {
          const dernier = k === etapes.length - 1;
          return (
            <li key={e.quand} className="en-monte" style={{
              position: 'relative', display: 'grid', gridTemplateColumns: '14px 1fr', gap: 10, paddingBottom: dernier ? 0 : 12,
              animationDelay: `${k * 70}ms`,
            }}>
              {!dernier && <span aria-hidden="true" style={{ position: 'absolute', left: 6, top: 17, bottom: -1, width: 2, borderRadius: 1, background: E.mentheBord }} />}
              <span aria-hidden="true" style={{
                width: 14, height: 14, marginTop: 2, boxSizing: 'border-box', borderRadius: 7, border: `2px solid ${E.teal}`,
                background: k === 0 ? E.teal : E.card,
              }} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: E.ink }}>{e.quand}</span>
                <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.45, color: E.texteSecondaire }}>{e.quoi}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </Carte>
  );
}

export default function EtapeCloud({ c, T, onSuivant, onAller }) {
  usePrixBoutique();
  const k = c.cloud;
  const TC = textesCloud(c.lang);
  const TX = textesConnexion(c.lang);
  const [inscription, setInscription] = useState('repos');   // repos | envoi | echec
  const noms = listeNoms(CLOUD_PLATEFORMES_CONNEXION.filter((p) => !(c.plateformesFermees ?? []).includes(p.id)).map((p) => p.nom), c.lang);
  // « en Free, 5 annonces, 50 publications et 30 remontées » — avec la grille seulement, lus dans coin_config.
  const quotasFree = c.grille ? listeJauges(grilleDuPalier(c.K, 'free'), c.lang, { dernierEt: true }) : null;
  const fait = T.cloudFaitListe(noms, quotasFree);
  const enCours = k.achat.etat === 'en_cours';
  const fermee = k.vente.fermee && !k.actif;
  const inscrit = k.vente.dispo?.inscrit === true;

  const ordinateur = () => {
    c.journaliser('cloud_ordinateur');
    c.choisirVoie('extension');
    onAller('extension');
  };

  const commencer = async () => {
    // L'option tourne déjà (achat fait, ou relu) : on avance vers les connexions.
    if (k.actif) { onAller('cloud_connexion'); return; }
    if (k.achat.etat === 'attente') { onSuivant(); return; }
    c.journaliser('cloud_essai_demande');
    const etat = await k.lancerEssai();
    if (etat) c.journaliser(`cloud_essai_${etat}`);
    if (etat === 'actif' || etat === 'deja') onAller('cloud_connexion');
  };

  const inscrire = async () => {
    setInscription('envoi');
    c.journaliser('cloud_attente_inscription');
    const ok = await k.vente.inscrire();
    setInscription(ok ? 'repos' : 'echec');
  };

  const message = k.achat.message;
  const tonMessage = k.achat.etat === 'erreur' || k.achat.etat === 'refuse' ? 'alerte' : 'menthe';

  // ── TOUTES LES PLACES PRISES : la liste d'attente, jamais une vente ───────
  if (fermee) {
    return (
      <Scene
        cle="cloud"
        pied={(
          <>
            {inscrit
              ? <BoutonPrimaire onClick={onSuivant}>{T.continuer}</BoutonPrimaire>
              : <BoutonPrimaire onClick={inscrire} disabled={inscription === 'envoi'}>{TC.completCta}</BoutonPrimaire>}
            <LienDiscret onClick={ordinateur} style={{ marginTop: 6 }}>{T.cloudOrdinateur}</LienDiscret>
          </>
        )}
      >
        <Kicker>{T.cloudCompletKicker}</Kicker>
        <Titre>{TC.completTitre}</Titre>
        <Texte>{inscrit ? TC.completInscrit(k.vente.dispo?.rang ?? null) : TC.completTexte}</Texte>
        <Carte style={{ padding: '14px 16px 4px', marginBottom: 12 }}>
          <TitreCarte>{T.cloudFait}</TitreCarte>
          {fait.map((x, i) => <Coche key={x} k={i} dernier={i === fait.length - 1}>{x}</Coche>)}
        </Carte>
        {inscription === 'echec' && <Bande ton="alerte">{TC.completEchec}</Bande>}
      </Scene>
    );
  }

  const libelle = enCours ? TX.preparation
    : k.actif || k.achat.etat === 'attente' ? T.continuer
      : T.cloudCta;

  return (
    <Scene
      cle="cloud"
      pied={(
        <>
          {/* (07/11, décision de Nico) Les places restantes, lues dans la vente et relues seules ; 0 = la liste d'attente plus haut. */}
          {!k.actif && k.vente.places > 0 && (
            <Texte centre style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 700, color: E.tealDeep }}><span data-entree="places" aria-live="polite">{TC.placesRestantes(k.vente.places)}</span></Texte>
          )}
          <BoutonPrimaire onClick={commencer} disabled={enCours || (!k.actif && k.achat.etat !== 'attente' && !prixPret('cloud'))}>{libelle}</BoutonPrimaire>
          <Texte centre style={{ margin: '10px 0 0', fontSize: 12 }}>{T.cloudCanal[c.plateforme] ?? T.cloudCanal.web}</Texte>
          {!k.actif && <LienDiscret onClick={ordinateur} style={{ marginTop: 2 }}>{T.cloudOrdinateur}</LienDiscret>}
        </>
      )}
    >
      <Kicker>{T.cloudKicker}</Kicker>
      <Titre>{T.cloudTitre(k.dates.fin)}</Titre>
      <Texte>{T.cloudTexte}</Texte>

      <Frise etapes={T.cloudFrise(k.dates.jourVeille, k.dates.jourFin, zeroAffiche('cloud', c.lang))} />

      <Carte style={{ padding: '14px 16px 4px', marginBottom: 12 }}>
        <TitreCarte>{T.cloudFait}</TitreCarte>
        {fait.map((x, i) => <Coche key={x} k={i} dernier={i === fait.length - 1}>{x}</Coche>)}
      </Carte>

      {message && <Bande ton={tonMessage}>{message}</Bande>}
      {!k.actif && <MentionsAbonnement lang={c.lang === 'en' ? 'en' : 'fr'} cloud />}
    </Scene>
  );
}
