// ═══════════════════════════════════════════════════════════════════════════
// LE NOUVEAU STEPPER — LA COQUE (24/09/2026)
// ═══════════════════════════════════════════════════════════════════════════
// « Un moteur, deux peaux. » Tout l'état, les effets et les gestes vivent dans
// components/ListingPreviewScreen.jsx (le moteur). Quand l'hôte passe
// `variante="nouvelle"`, ce moteur rend CETTE coque au lieu des anciens
// écrans, en lui tendant un objet `m` (le contrat est construit là-bas, bloc
// « LE MOTEUR TENDU AU NOUVEAU STEPPER »). Rien n'est recalculé ici : les
// écrans lisent et remontent, comme les anciens.
//
// Trois écrans (au lieu de quatre étapes) + un suivi :
//   U1 « Où publier ? »       = étapes 0 et 1 du moteur (photos + plateformes)
//   U2 « Ce qui va partir »    = étape 2 (rédaction, texte, cartes plateforme)
//   U3 « Confirmer »           = étape 3 (questions, états, exclusions, geste)
//   U4 « C'est parti »         = `done` (états réels lus dans la file)
// La barre de progression compte 3 ; l'étape 0 et l'étape 1 sont le même écran.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./stepper.css";
import EcranOuPublier from "./EcranOuPublier";
import EcranVerifier from "./EcranVerifier";
import EcranConfirmer from "./EcranConfirmer";
import EcranSuivi from "./EcranSuivi";
import { Bouton, Carte } from "./composants";
import { NOM } from "./texte";

export default function StepperNouveau({ m }) {
  const en = m.lang === "en";
  const ecran = m.done ? 4 : (m.step <= 1 ? 1 : m.step);
  const [quotas, setQuotas] = useState(null);
  useEffect(() => {
    if (!m.supabase) return undefined;
    let vivant = true;
    m.supabase.rpc("quotas_etat").then(({ data }) => { if (vivant && data && !data.error) setQuotas(data); }).catch(() => {});
    return () => { vivant = false; };
  }, [m.supabase]);
  const mq = { ...m, quotas };

  // ── Le pied de page : le bouton, et ce qui l'explique ─────────────────────
  let cta = null; let disabled = false; let sous = null; let secondaire = null; let avant = null;
  if (ecran === 1) {
    const n = m.selected.size;
    const enTeleversement = m.uploading;
    const photosManquent = m.photoCount < m.MIN_PHOTOS && !m.platformListings;
    disabled = enTeleversement || photosManquent || n === 0;
    cta = enTeleversement ? (en ? "Uploading photos…" : "Envoi des photos…")
      : photosManquent ? (en ? `Add at least ${m.MIN_PHOTOS} photos` : `Ajoute au moins ${m.MIN_PHOTOS} photos`)
      : n === 0 ? (en ? "Pick at least one platform" : "Choisis au moins une plateforme")
      : (m.platformListings
          ? (en ? `Continue · ${n} platform${n > 1 ? "s" : ""}` : `Continuer · ${n} plateforme${n > 1 ? "s" : ""}`)
          : (en ? `Write the listing · ${n} platform${n > 1 ? "s" : ""}` : `Rédiger l'annonce · ${n} plateforme${n > 1 ? "s" : ""}`));
    sous = m.platformListings
      ? (en ? "Nothing goes out yet. You check at the next screen." : "Rien ne part encore. Tu vérifies à l'écran suivant.")
      : (en ? "Nothing goes out yet: the text is written, then you check it." : "Rien ne part encore : le texte est rédigé, puis tu le vérifies.");
  } else if (ecran === 2) {
    if (m.generatingPlatforms || (!m.platformListings && !m.platformError)) { cta = en ? "Writing…" : "Rédaction en cours…"; disabled = true; }
    else if (!m.platformListings && m.platformError) { cta = en ? "Try writing again" : "Réessayer la rédaction"; }
    else {
      const q = m.nbQuestions;
      cta = q > 0 ? (en ? `Continue · ${q} question${q > 1 ? "s" : ""}` : `Continuer · ${q} question${q > 1 ? "s" : ""}`) : (en ? "Continue" : "Continuer");
    }
  } else if (ecran === 3) {
    cta = m.ctaLabel;
    disabled = m.ctaDisabled;
    // Le bouton est gris à cause des QUESTIONS : elles sont posées juste
    // au-dessus, on n'en refait pas la liste (la redondance de l'ancien
    // écran). Les autres motifs (rien de coché, relecture en cours, filet)
    // gardent leur carte.
    if (m.motifsCtaGris.length > 0 && m.requiredBlocking && m.nbQuestions > 0) {
      avant = (
        <Carte gravite="geste">
          <div className="fsn-card-p">
            {m.nbQuestions === 1
              ? (en ? "Answer the question above to publish." : "Réponds à la question ci-dessus pour publier.")
              : (en ? `Answer the ${m.nbQuestions} questions above to publish.` : `Réponds aux ${m.nbQuestions} questions ci-dessus pour publier.`)}
          </div>
        </Carte>
      );
    } else if (m.motifsCtaGris.length > 0) {
      avant = (
        <Carte gravite="geste">
          <div className="fsn-card-p"><b>{en ? "One last thing before publishing:" : "Avant de publier, il reste :"}</b></div>
          <ul>{m.motifsCtaGris.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </Carte>
      );
    } else if (m.retoucheNonLivree && !m.retoucheAvisLu) {
      avant = (
        <Carte gravite="info" style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <div className="fsn-card-p fsn-grow">{en ? "Photo retouching didn't come through — you won't be charged for it. Your original photos will be posted as they are." : "La retouche photos n'a pas abouti — elle ne te sera pas facturée. Tes photos d'origine partent telles quelles."}</div>
          <button type="button" className="fsn-lien" onClick={() => m.setRetoucheAvisLu(true)}>{en ? "OK" : "OK"}</button>
        </Carte>
      );
    }
    // Ce qui n'est bloqué que par UNE plateforme se contourne d'un geste :
    // « Continuer sans eBay » décoche, les autres partent.
    const retirables = m.plateformesRetirables ?? [];
    if (retirables.length && m.selected.size > 1) {
      secondaire = retirables.map(p => (
        <button key={p} type="button" className="fsn-btn fsn-btn--ghost" onClick={() => m.setSelected(prev => { const s = new Set(prev); s.delete(p); return s; })}>
          {en ? `Continue without ${NOM(p)}` : `Continuer sans ${NOM(p)}`}
        </button>
      ));
    }
    if (!disabled && !m.publishing && !m.inventoryFull && !m.extensionBlocked && !m.voiesDuLot.toutServeur) {
      const ext = m.extFraicheurPublier;
      if (ext?.etat === "session_expiree") avant = <Carte gravite="geste"><div className="fsn-card-p">{en ? "The extension lost its connection to your account: on your computer, open fillsell.app in Chrome, sign in, then reload (F5). Your listings will wait for it." : "L'extension a perdu sa connexion à ton compte : sur ton ordinateur, ouvre fillsell.app dans Chrome, connecte-toi, puis recharge (F5). Tes annonces l'attendront."}</div></Carte>;
      else if (ext?.etat === "eteinte" || ext?.etat === "inactive") avant = <Carte gravite="geste"><div className="fsn-card-p">{en ? "Your computer is off — publishing starts next time Chrome opens." : "Ton ordinateur est éteint — la publication démarrera à la prochaine ouverture de Chrome."}</div></Carte>;
    }
  } else if (ecran === 4) {
    cta = en ? "Back to stock" : "Retour au stock";
    sous = en ? "You'll find the progress at the top of your Stock." : "Tu retrouves l'avancement en haut du Stock.";
  }

  const onCta = () => {
    if (ecran === 4) { m.onClose(true); return; }
    if (ecran === 2 && !m.platformListings && m.platformError) { m.handleGeneratePlatforms(); return; }
    m.suivant();
  };
  const titreBarre = ecran === 1 ? (en ? "Publish" : "Publier") : ecran === 2 ? (en ? "Check" : "Vérifier") : ecran === 3 ? (en ? "Confirm" : "Confirmer") : (en ? "Publication" : "Publication");

  return createPortal((
    <div className="fsn" data-ecran={ecran}>
      {ecran !== 4 && (
        <>
          <div className="fsn-top">
            <div className="fsn-col">
              <button type="button" className="fsn-back" onClick={m.retour} disabled={m.isLocked} aria-label={ecran === 1 ? (en ? "Back to stock" : "Retour au stock") : (en ? "Previous step" : "Étape précédente")}>‹</button>
              <div className="fsn-top-title">{titreBarre}</div>
              <div className="fsn-top-step num">{ecran} / 3</div>
              <button type="button" className={`fsn-quit${m.quitterArme ? " fsn-quit--arme" : ""}`} onClick={m.quitter} disabled={m.isLocked}>
                {m.quitterArme ? (en ? "Leave without keeping these photos?" : "Quitter sans garder ces photos ?") : (en ? "Leave" : "Quitter")}
              </button>
            </div>
          </div>
          <div className="fsn-progress"><div className="fsn-col">
            {[1, 2, 3].map(i => <span key={i} className={i <= ecran ? "done" : ""} />)}
          </div></div>
        </>
      )}

      <div className="fsn-scroll">
        <div className="fsn-col">
          {ecran === 1 && <EcranOuPublier m={mq} />}
          {ecran === 2 && <EcranVerifier m={mq} />}
          {ecran === 3 && <EcranConfirmer m={mq} />}
          {ecran === 4 && <EcranSuivi m={mq} />}
        </div>
      </div>

      <div className="fsn-foot">
        <div className="fsn-col">
          {avant}
          <Bouton disabled={disabled} onClick={onCta}>{cta}</Bouton>
          {secondaire}
          {sous ? <p className="fsn-hint">{sous}</p> : null}
        </div>
      </div>

      {m.modales}
    </div>
  ), document.body);
}
