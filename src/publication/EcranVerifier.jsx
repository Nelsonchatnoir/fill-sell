// ═══════════════════════════════════════════════════════════════════════════
// U2 — « CE QUI VA PARTIR » (24/09/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Le texte du vendeur en carte de tête (prix, titre, description, état : le
// bloc général du 21/09, avec la rangée « Reprendre le texte de : … » du
// 23/09), puis une ligne par plateforme, repliée, avec son rayon et ce qui
// diffère — et la QUESTION manquante dite UNE fois, sur sa ligne.
// Le corps des cartes par plateforme (titre, description, état, rayon, champs
// du rayon, livraison Leboncoin / eBay, prix par plateforme) est CELUI de
// l'ancien écran, rendu par le même composant (StepGeneration, variante
// « nouvelle ») : rien n'est réécrit, tout est câblé comme aujourd'hui.
// (26/10, C11 — refonte validée par Nico) Le corps est désormais LA pop-up de l'article du lot (FicheArticle, mode
// page) : le commun, puis une section par plateforme, tout modifiable sur place. Les cartes d'avant (StepGeneration :
// prix par plateforme, versions du texte) restent un geste plus bas, repliées — rien n'est perdu.
import { useState } from "react";
import { StepGeneration } from "../components/ListingPreviewScreen";
import { urlPhoto } from "../utils/photos";
import { formaterRemiseAZero } from "../reglages/quotas";
import { Carte } from "./composants";
import FicheArticle from "./lot/FicheArticle";
import { usePhotoVide } from "./lot/photoVide";

export default function EcranVerifier({ m }) {
  const en = m.lang === "en";
  const enCours = m.generatingPlatforms || (!m.platformListings && !m.platformError);
  const dateRemise = formaterRemiseAZero(m.remiseAZero, m.lang);
  const photos = m.processedPhotos?.length ? m.processedPhotos : (m.photos ?? []);
  const [cartes, setCartes] = useState(false);
  const premiere = photos[0] ? urlPhoto(typeof photos[0] === "string" ? photos[0] : photos[0]?.url) : null;
  const photoLue = usePhotoVide(premiere);
  const photoVide = Boolean(premiere) && photoLue === true; // seule une image LUE comme remplissage le dit
  return (
    <>
      <div>
        <p className="fsn-eyebrow">{en ? "Step 2 of 3" : "Étape 2 sur 3"}</p>
        <h1 className="fsn-h" style={{ marginTop: 4 }}>{en ? "What will go out" : "Ce qui va partir"}</h1>
        {!enCours && m.platformListings && (
          <p className="fsn-lead" style={{ marginTop: 4 }}>
            {m.texteDuVendeur
              ? (en ? "Your text goes out as it is. Below, platform by platform, everything that goes out: tap a line to change it." : "Ton texte part tel quel. Dessous, plateforme par plateforme, tout ce qui part : touche une ligne pour la changer.")
              : (en ? "Check the text. Below, platform by platform, everything that goes out: tap a line to change it." : "Vérifie le texte. Dessous, plateforme par plateforme, tout ce qui part : touche une ligne pour la changer.")}
          </p>
        )}
      </div>


      {/* (01/10) L'encadré « Aucune plateforme cochée » n'existe plus : on
          n'arrive ici qu'avec au moins une plateforme cochée (bouton de
          l'écran 1), et une sélection vidée après coup ramène à « Où publier ? »
          (effet du moteur). */}

      {/* La retouche a été refusée pendant la rédaction (quota du mois) : la
          rédaction est partie « telles quelles ». On le dit, sans ouvrir les
          offres — elles restent à un geste. */}
      {!enCours && m.avisRetouche && (
        <Carte gravite="info" titre={en ? "Photos as they are" : "Photos telles quelles"}>
          <div className="fsn-card-p">
            {en ? "No touch-ups left this month: the listing was written with your photos as they are." : "Plus de retouche ce mois-ci : l'annonce est rédigée avec tes photos telles quelles."}
          </div>
          {dateRemise && <div className="fsn-card-p">{en ? `Your touch-ups come back on ${dateRemise}.` : `Tes retouches reviennent le ${dateRemise}.`}</div>}
          <div>
            <button type="button" className="fsn-lien" onClick={() => m.voirOffres("retouches", m.avisRetouche)}>
              {en ? "More touch-ups: see the plans" : "Plus de retouches : voir les offres"}
            </button>
          </div>
        </Carte>
      )}

      {/* La rédaction n'a pas abouti : UNE carte (rouge = refus), le bouton du
          pied propose de réessayer — pas le bloc et le bouton de l'ancien
          écran en plus. Le message est celui du serveur, en clair. */}
      {!enCours && !m.platformListings && m.platformError ? (
        m.platformErrorCode === "quota_annonces" ? (
          <Carte gravite="geste" titre={en ? "No listings left this month" : "Plus d'annonce ce mois-ci"}>
            <div className="fsn-card-p">{m.platformError}</div>
            <div className="fsn-card-p">
              {dateRemise
                ? (en ? `Your listings come back on ${dateRemise}.` : `Tes annonces reviennent le ${dateRemise}.`)
                : (en ? "They come back at your next renewal." : "Elles reviennent à ton prochain renouvellement.")}
            </div>
          </Carte>
        ) : (
          <Carte gravite="refus" titre={en ? "The listing could not be written" : "La rédaction n'a pas abouti"}>
            <div className="fsn-card-p">{m.platformError}</div>
            <div className="fsn-small" style={{ color: "inherit" }}>
              {en ? "Nothing was counted for a failed attempt. Try again below." : "Une tentative qui échoue n'est pas décomptée. Réessaie ci-dessous."}
            </div>
          </Carte>
        )
      ) : (
        enCours ? (
          /* La rédaction en cours : la barre de l'ancien écran, telle quelle. */
          <StepGeneration {...m.propsStepGeneration} variante="nouvelle" etatsParPlateforme={m.etatsParPlateforme} />
        ) : (
          <>
            <FicheArticle m={m} en={en} photoVide={photoVide}
              actions={{
                poserPoids: (g) => m.poidsLbc?.poser?.(g),
                retirerPlateforme: (p) => m.basculer?.(p),
              }} />
            <div>
              <button type="button" className="fsn-lien" onClick={() => setCartes((c) => !c)} aria-expanded={cartes}>
                {cartes
                  ? (en ? "Hide the per-platform cards" : "Replier les cartes par plateforme")
                  : (en ? "Edit each platform's title and price separately" : "Modifier le titre et le prix plateforme par plateforme")}
              </button>
            </div>
            {cartes && <StepGeneration {...m.propsStepGeneration} variante="nouvelle" etatsParPlateforme={m.etatsParPlateforme} />}
          </>
        )
      )}

      {!enCours && m.nbQuestions > 0 && (
        <Carte gravite="geste">
          <div className="fsn-card-p">
            {en
              ? `${m.nbQuestions} question${m.nbQuestions > 1 ? "s" : ""} before publishing — asked once, at the next step.`
              : `${m.nbQuestions} question${m.nbQuestions > 1 ? "s" : ""} avant de publier — posée${m.nbQuestions > 1 ? "s" : ""} une fois, à l'écran suivant.`}
          </div>
        </Carte>
      )}
    </>
  );
}
