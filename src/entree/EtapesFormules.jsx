// ═══════════════════════════════════════════════════════════════════════════
// PARCOURS D'ENTRÉE — LES ÉTAPES DES FORMULES AVEC CLOUD (11/11/2026, textes validés par Nico, § 8.2 + 3 corrections)
// ═══════════════════════════════════════════════════════════════════════════
// N'existent que si c.formules.parcours (plan.js) : téléphone, canal ouvert ou témoin, achat fourni par l'hôte.
//   3.  « As-tu un ordinateur ? » (ordinateur) — oui → l'extension (4a) ; non → la présentation du Cloud (4b) ;
//   4b. « FillSell tourne pour toi, même sans ordinateur » (cloud_presentation) ;
//   6.  « Choisis ta formule » (cloud_offres) — LA MÊME source que la fenêtre d'offres (cloud/OffresAvecCloud.jsx),
//       position « Avec Cloud », Pro + Cloud mis en avant ;
//   7.  « Rien à payer avant le … » (cloud, variante formule) — Premium + Cloud ou Pro + Cloud à l'essai ;
//   10. « Ta formule Pro + Cloud » (formule).
// ⛔ Rien ne bloque l'entrée : « Passer » reste partout (la coque). ⛔ Aucun paiement ici : c.formules.lancer →
//    essaiFormule d'App.jsx → cloud/achatFormuleCloud.js (conditions, place, Stripe ou boutique).
import { useState } from 'react';
import { Cloud, Laptop, Smartphone } from 'lucide-react';
import { CLOUD_PLATEFORMES_CONNEXION, canalDeVente } from '../config/cloudOffer';
import { businessOfferVisible } from '../config/businessOffer';
import { E } from './theme';
import { Scene, Kicker, Titre, Texte, Carte, BoutonPrimaire, LienDiscret, Bande } from './EntreeUI';
import { listeNoms, listeJauges } from './regles';
import { FenetreInfo } from './EtapeVoie';
import EtapeCloud, { Frise } from './EtapeCloud';
import OffresAvecCloud from '../cloud/OffresAvecCloud';
import { cartesFormulesCloud } from '../cloud/formulesCloud';
import { textesFormules, NOMS_FORMULES } from '../cloud/textesFormules';
import { CorpsCarteGrille } from '../components/ConversionModal';
import MentionsAbonnement from '../components/MentionsAbonnement';
import { prixOuChargement, prixPret, zeroAffiche, etatEssaiBoutique } from '../lib/prixBoutique';
import { usePrixBoutique } from '../lib/usePrixBoutique';
import { mentionFormuleCloud } from '../utils/mentionsAbonnement';

const nomsPlateformes = (c) => listeNoms(CLOUD_PLATEFORMES_CONNEXION.filter((p) => !(c.plateformesFermees ?? []).includes(p.id)).map((p) => p.nom), c.lang);
const canalMentions = (plateforme) => (plateforme === 'ios' ? 'ios' : plateforme === 'android' ? 'android' : 'web');

function Coche({ children }) {
  return (
    <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '10px 0', borderBottom: `1px solid ${E.ligneDouce}` }}>
      <span aria-hidden="true" style={{
        width: 19, height: 19, marginTop: 1, borderRadius: 10, flexShrink: 0, background: E.menthe, border: `1px solid ${E.mentheBord}`,
        color: E.tealDeep, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
      }}>✓</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.5, color: E.ink }}>{children}</span>
    </div>
  );
}

// Un choix de « As-tu un ordinateur ? » : toute la carte est le bouton (≥ 44 px), un titre et sa ligne.
function Choix({ icone, titre, sous, onClick, cle, plein = false }) {
  return (
    <button type="button" onClick={onClick} data-entree={cle} className="en-cta en-focus" style={{
      width: '100%', boxSizing: 'border-box', minHeight: 72, padding: '14px 15px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit',
      textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
      background: E.card, border: plein ? `1.5px solid ${E.teal}` : `1px solid ${E.border}`,
      boxShadow: plein ? '0 14px 30px -18px rgba(27,110,98,0.6)' : 'none',
    }}>
      <span aria-hidden="true" style={{
        width: 40, height: 40, borderRadius: 13, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: plein ? E.menthe : E.chip, border: `1px solid ${plein ? E.mentheBord : E.border}`, color: plein ? E.tealDeep : E.ink,
      }}>{icone}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 16, fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.01em', color: E.ink }}>{titre}</span>
        <span style={{ display: 'block', marginTop: 3, fontSize: 13, lineHeight: 1.45, color: E.texteSecondaire }}>{sous}</span>
      </span>
    </button>
  );
}

// ── 3. « As-tu un ordinateur ? » ───────────────────────────────────────────────────────────────────────────────────
export function EtapeOrdinateur({ c, T, onAller }) {
  const [info, setInfo] = useState(false);
  const choisir = (oui) => {
    c.journaliser(oui ? 'ordinateur_oui' : 'ordinateur_non');
    const voie = oui ? 'extension' : 'cloud';
    c.formules.noterVoie(voie);
    c.choisirVoie(voie);
    onAller(oui ? 'extension' : 'cloud_presentation');
  };
  return (
    <Scene cle="ordinateur" pied={<Texte centre style={{ margin: 0, fontSize: 12 }}>{T.ordiPied}</Texte>}>
      <Kicker>{T.ordiKicker}</Kicker>
      <Titre>{T.ordiTitre}</Titre>
      <Texte>
        {T.ordiTexte}
        <button type="button" onClick={() => { c.journaliser('ordinateur_info'); setInfo(true); }} aria-label={T.infoTitre} aria-haspopup="dialog" data-entree="info" className="en-focus" style={{
          position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, boxSizing: 'border-box',
          borderRadius: 10, border: `1.5px solid ${E.tealDeep}`, background: E.card, color: E.tealDeep, fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
          lineHeight: 1, verticalAlign: -4, margin: '0 0 0 5px', padding: 0, cursor: 'pointer',
        }}>
          i
          <span aria-hidden="true" style={{ position: 'absolute', inset: -13.5 }} />
        </button>
      </Texte>
      <Choix cle="ordinateur-oui" icone={<Laptop size={20} strokeWidth={2} />} titre={T.ordiOui} sous={T.ordiOuiSous} onClick={() => choisir(true)} />
      <Choix cle="ordinateur-non" plein icone={<Smartphone size={20} strokeWidth={2} />} titre={T.ordiNon} sous={T.ordiNonSous} onClick={() => choisir(false)} />
      {info && <FenetreInfo T={T} onFermer={() => setInfo(false)} />}
    </Scene>
  );
}

// ── 4b. « FillSell tourne pour toi, même sans ordinateur » ─────────────────────────────────────────────────────────
export function EtapeCloudPresentation({ c, T, onAller }) {
  const ordinateur = () => {
    c.journaliser('cloud_presentation_ordinateur');
    c.formules.noterVoie('extension');
    c.choisirVoie('extension');
    onAller('extension');
  };
  return (
    <Scene
      cle="cloud_presentation"
      pied={(
        <>
          <BoutonPrimaire onClick={() => { c.journaliser('cloud_presentation_formules'); onAller('cloud_offres'); }}>{T.presCta}</BoutonPrimaire>
          <LienDiscret onClick={ordinateur} style={{ marginTop: 6 }}>{T.presOrdinateur}</LienDiscret>
        </>
      )}
    >
      <Kicker>{T.presKicker}</Kicker>
      <Titre>{T.presTitre}</Titre>
      <Texte>{T.presTexte(nomsPlateformes(c))}</Texte>
      <Carte style={{ padding: '4px 16px', marginBottom: 12 }}>
        {T.presListe.map((x) => <Coche key={x}>{x}</Coche>)}
      </Carte>
      <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'center', color: E.tealDeep, opacity: 0.8 }}><Cloud size={28} strokeWidth={1.8} /></div>
    </Scene>
  );
}

// ── 6. « Choisis ta formule » — la fenêtre d'offres, position « Avec Cloud » ───────────────────────────────────────
export function EtapeCloudOffres({ c, onSuivant, onAller }) {
  usePrixBoutique();
  const TF = textesFormules(c.lang);
  const k = c.formules;
  const modele = cartesFormulesCloud({
    palier: c.palier === 'free' ? 'gratuit' : (c.palier ?? 'gratuit'), canalApp: canalDeVente(c.plateforme), canalAbonnement: null,
    essaiPermis: k.essaiPermis, essaiBoutique: (f) => etatEssaiBoutique(f), businessVisible: businessOfferVisible(c.user?.id ?? null),
  });
  const choisir = async (carte) => {
    c.journaliser(`formule_${carte.formule}_${carte.cta}`);
    if (carte.cta === 'essai') { k.choisir(carte.formule, true); onAller('cloud'); return; }
    // Sans essai (Business + Cloud, ou essai déjà pris) : l'achat tout de suite, puis la suite du parcours.
    k.choisir(carte.formule, false);
    const etat = await k.lancer(carte.formule, { essaiAffiche: false });
    if (etat) c.journaliser(`formule_achat_${etat}`);
    if (etat === 'actif' || etat === 'change') { if (c.cloud?.ouvert) onAller('cloud_connexion'); else onSuivant(); }
  };
  return (
    <Scene cle="cloud_offres" pied={null}>
      <Titre>{TF.titre}</Titre>
      {modele.essaiAffiche && <Texte>{TF.sousTitreEssai(zeroAffiche('pro_cloud', c.lang))}</Texte>}
      <OffresAvecCloud
        modele={modele} lang={c.lang} vente={k.vente} venteFermee={k.vente.fermee} onChoisir={choisir}
        palierIci={c.palier === 'free' ? 'gratuit' : (c.palier ?? 'gratuit')} canalApp={canalDeVente(c.plateforme)}
        corps={c.grille ? (palier, sombre) => <CorpsCarteGrille fr={c.lang !== 'en'} palier={palier} K={c.K} dark={sombre} margeBas={0} /> : null}
      />
      {k.achat.message && <div style={{ marginTop: 12 }}><Bande ton={k.achat.etat === 'erreur' || k.achat.etat === 'refuse' ? 'alerte' : 'menthe'}>{k.achat.message}</Bande></div>}
      <MentionsAbonnement lang={c.lang === 'en' ? 'en' : 'fr'} essaiAnnonce={modele.essaiAffiche} />
    </Scene>
  );
}

// ── 7. « Rien à payer avant le … » — Premium + Cloud ou Pro + Cloud à l'essai ──────────────────────────────────────
function EtapeEssaiFormule({ c, T, onSuivant, onAller }) {
  usePrixBoutique();
  const k = c.formules;
  const f = k.choisie;
  const nom = NOMS_FORMULES[f] ?? '';
  const prix = prixOuChargement(f, c.lang);
  const enCours = k.achat.etat === 'en_cours';
  const apres = () => { if (c.cloud?.ouvert) onAller('cloud_connexion'); else onSuivant(); };
  const commencer = async () => {
    if (k.actif) { apres(); return; }
    c.journaliser('formule_essai_demande');
    const etat = await k.lancer(f, { essaiAffiche: true });
    if (etat) c.journaliser(`formule_essai_${etat}`);
    if (etat === 'actif' || etat === 'change') apres();
  };
  const ordinateur = () => { c.journaliser('cloud_ordinateur'); c.formules.noterVoie('extension'); c.choisirVoie('extension'); onAller('extension'); };
  const tonMessage = k.achat.etat === 'erreur' || k.achat.etat === 'refuse' ? 'alerte' : 'menthe';
  return (
    <Scene
      cle="cloud"
      pied={(
        <>
          <BoutonPrimaire onClick={commencer} disabled={enCours || (!k.actif && !prixPret(f))}>{enCours ? '…' : k.actif ? T.continuer : T.formCta}</BoutonPrimaire>
          <Texte centre style={{ margin: '10px 0 0', fontSize: 12 }}>{T.cloudCanal[c.plateforme] ?? T.cloudCanal.web}</Texte>
          {!k.actif && <LienDiscret onClick={ordinateur} style={{ marginTop: 2 }}>{T.cloudOrdinateur}</LienDiscret>}
        </>
      )}
    >
      <Kicker>{T.formKicker(nom)}</Kicker>
      <Titre>{T.cloudTitre(k.dates.fin)}</Titre>
      <Frise etapes={T.formFrise(k.dates.jourVeille, k.dates.jourFin, nom, prix, zeroAffiche(f, c.lang))} />
      {k.achat.message && <Bande ton={tonMessage}>{k.achat.message}</Bande>}
      {!k.actif && (
        <p data-formule-mention="" style={{ margin: '4px 2px 0', fontSize: 11, lineHeight: 1.5, color: '#6B7280' }}>
          {mentionFormuleCloud({ canal: canalMentions(c.plateforme), lang: c.lang, prix, essai: true })}
        </p>
      )}
      {!k.actif && <MentionsAbonnement lang={c.lang === 'en' ? 'en' : 'fr'} />}
    </Scene>
  );
}

/** L'étape « cloud » : la variante formule sur la voie des formules avec Cloud, sinon l'étape d'avant (Cloud seul). */
export function EtapeCloudOuFormule(props) {
  const { c } = props;
  if (c.formules?.parcours === true && c.voie === 'cloud' && c.formules.choisie) return <EtapeEssaiFormule {...props} />;
  return <EtapeCloud {...props} />;
}

// ── 10. « Ta formule Pro + Cloud » ─────────────────────────────────────────────────────────────────────────────────
export function EtapeFormule({ c, T, onSuivant }) {
  const nom = NOMS_FORMULES[c.formules.choisie] ?? '';
  return (
    <Scene cle="formule" pied={<BoutonPrimaire onClick={() => { c.journaliser('formule_comprise'); onSuivant(); }}>{T.continuer}</BoutonPrimaire>}>
      <Kicker>{T.formuleKicker}</Kicker>
      <Titre>{nom}</Titre>
      <Texte>{T.formuleTexte(listeJauges(c.plan, c.lang))}</Texte>
    </Scene>
  );
}
