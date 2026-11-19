// ═══════════════════════════════════════════════════════════════════════════
// LA POP-UP D'UN ARTICLE — TOUT CE QUI PART, MODIFIABLE SUR PLACE (26/10, refonte C validée par Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Une seule pop-up par article, prêts compris (C3) : d'abord le commun — photos, titre, prix, état, description
// ouverte sur son début —, puis UNE SECTION PAR PLATEFORME : son statut (Prêt / À régler), son rayon et « Changer »,
// son colis ou son port, ses caractéristiques. Tout se modifie ici, sans autre pop-up : le rayon se change dans la
// section, une valeur se choisit sous sa ligne. La même pop-up sert l'écran « Vérifier » de la publication à l'unité
// (C11, mode « page »).
// (19/11/2026, refonte du lot — maquettes lot-1911 validées par Nico) UN ONGLET PAR PLATEFORME : « L'article » (le
// commun), puis Vinted, Leboncoin, Beebs, Depop, eBay — chacun montre TOUT ce qui part sur sa copie (titre,
// description, prix, état, marque, taille, couleur, matière, champs du rayon, colis, photos), et tout s'y corrige.
// Une correction vaut par défaut pour TOUTES les plateformes de l'article et s'écrit sur la fiche ; « Seulement sur X »
// ne touche que X (gardé sur la fiche pour X). Sur un grand écran, « Côte à côte » met les copies en colonnes.
// Leboncoin : le format du colis et les transporteurs sont ceux de la FICHE (choisis pour l'article, sinon déduits du
// poids), jamais une valeur unique pour tout le lot (décision de Nico, point c).
// ⛔ Aucune règle n'est réécrite : chaque geste passe par le moteur du stepper (setPlatformAspect, choisirRayon,
//    poserColisVinted, portDepop.poser, poserPrixGeneral, poserValeurGenerale…), comme depuis ses cartes
//    (./corrections.js pour la portée et la fiche).
// ⛔ Rien n'est caché : aucune valeur coupée par « … » (règle 2 de Nico), un retrait de plateforme est un BOUTON qui
//    se lit comme une action (règle 3), jamais un texte qui ressemble à un statut.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import BlocQuestions from "../BlocQuestions";
import BoutonDictee from "../../components/BoutonDictee";
import CarteRayon from "../../components/CarteRayon";
import { CartePortDepop } from "../../components/PortDepop";
import CarteLivraisonEbay from "../../components/CarteLivraisonEbay";
import { Logo, Puce } from "../composants";
import { NOM } from "../texte";
import { urlPhoto, urlsPhotos } from "../../utils/photos";
import { imageParDefautDe } from "./photoVide";
import { grilleColisVinted } from "../../utils/vintedColis";
import { descriptionFidele, hashtagsServent } from "../moteur/descriptionFidele";
import { lirePoidsSaisi } from "./regles";
// (16/11/2026, point 9 de Nico — Marc) Les photos PAR PLATEFORME dans la fiche d'un article du lot : le même composant que
// la carte d'une plateforme à l'unité (choisir, retirer, réordonner, limite de la plateforme, 1ʳᵉ = couverture) et que la
// republication de plusieurs articles (17839af). Le choix part par le moteur (poserPhotosCopie → edited[p].photos), la
// même place que la publication à l'unité : rien de neuf côté serveur.
import PhotosPlateforme from "../PhotosPlateforme";
// (08/11, U3 de Nico) Client FillSell Cloud : jamais « depuis ton ordinateur ».
import { estClientCloud } from "../../cloud/connexionsCloud";
import {
  cheminRayon, texteRayon, plateformesDeLArticle, statutPlateforme, colisDe, detailsDe, rayonNeufDe,
  poidsAffiche, poidsParDefaut, textePoids, poidsIncoherent,
} from "./ficheLue";
import {
  PORTEE_TOUTES, CHAMPS_PARTAGES, ETATS_ARTICLE, lignesDeLaPlateforme, valeurDeLArticle, valeurDeLaCopie,
  formatColisLbc, pfAvecFormatDeLArticle, attributFormatDeLArticle, plateformeSansTitre,
} from "./corrections";
import { ecrireDetail, attributsDe, ecrireSurLaFiche, journaliserCorrection, corriger, useGrandEcran } from "./correctionsFiche";
import { LBC_FORMATS, LBC_TRANSPORTEURS, transporteursPourPoids } from "../../utils/leboncoinColis";
import { transporteursDeLaFiche, transporteursValides, choixTransporteursPourLaFiche, basculerTransporteur } from "../../utils/transporteursLbcFiche";

const T_PHOTOS = { border: "#E7E3D8", chip: "#F6F5F1", ink: "#10201B", mute2: "#5C6560", tealDeep: "#1B6E62" };
/** Toutes les photos de la fiche d'un article du lot (celles traitées d'abord), en adresses. */
const photosDeLaFicheLot = (m) => urlsPhotos(m?.processedPhotos?.length ? m.processedPhotos : m?.photos);

const ETATS_EN = { "Neuf avec étiquette": "New with tags", "Neuf sans étiquette": "New without tags", "Très bon état": "Very good", "Bon état": "Good", "Satisfaisant": "Satisfactory" };


/** Un champ de texte qui grandit avec son contenu : tout le texte se voit, depuis son DÉBUT (jamais la fin d'abord). */
function TexteQuiGrandit({ valeur, onFini, lignesMin = 2, ...reste }) {
  // La valeur du moteur fait foi à l'ouverture : le parent remonte ce champ (key) quand elle change ailleurs.
  const ref = useRef(null);
  const [v, setV] = useState(valeur ?? "");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [v]);
  return (
    <textarea ref={ref} className="fsn-textarea fsf-grandit" rows={lignesMin} value={v}
      onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== (valeur ?? "")) onFini?.(v); }} {...reste} />
  );
}

/** Une valeur à choisir sous sa ligne : puces (liste courte), recherche (longue liste), ou saisie libre. */
export function ChoixDeValeur({ valeur = "", valeurs = [], onChoisir, en, placeholder = null }) {
  const [motif, setMotif] = useState("");
  const liste = useMemo(() => [...new Set((valeurs ?? []).map(String).filter(Boolean))], [valeurs]);
  if (!liste.length) {
    return (
      <form className="fsf-saisie" onSubmit={(e) => { e.preventDefault(); const t = motif.trim(); if (t) onChoisir(t); }}>
        <input className="fsn-input" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder={placeholder ?? (en ? "Type the value" : "Écris la valeur")} />
        <button type="submit" className="fsn-btn fsn-btn--secondary fsn-btn--sm" disabled={!motif.trim()}>OK</button>
      </form>
    );
  }
  const longue = liste.length > 12;
  const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const mots = norm(motif).split(/\s+/).filter(Boolean);
  const vues = longue
    ? (mots.length ? liste.filter((x) => mots.every((m) => norm(x).includes(m))) : liste).slice(0, 24)
    : liste;
  return (
    <div className="fsf-choix">
      {longue && (
        <input className="fsn-input" type="search" value={motif} onChange={(e) => setMotif(e.target.value)}
          placeholder={en ? `Search among ${liste.length}` : `Chercher parmi ${liste.length}`} aria-label={en ? "Search" : "Chercher"} />
      )}
      <div className="fsn-choices fsq-puces">
        {vues.map((x) => (
          <button key={x} type="button" className={`fsn-choice${x === String(valeur) ? " fsn-choice--on" : ""}`} onClick={() => onChoisir(x)}>
            {x === String(valeur) ? "✓ " : ""}{x}
          </button>
        ))}
      </div>
      {longue && mots.length > 0 && !vues.length && <p className="fsq-note">{en ? "Nothing matches: try other words." : "Rien ne correspond : essaie d'autres mots."}</p>}
      {longue && (mots.length ? vues.length >= 24 : true) && (
        <p className="fsq-note">{en ? `${liste.length} values — type to narrow.` : `${liste.length} valeurs — tape pour trouver la tienne.`}</p>
      )}
    </div>
  );
}

/** Une ligne « libellé : valeur » ; toucher la ligne ouvre son choix juste dessous. Jamais de valeur coupée. */
function Champ({ label, valeur, aRegler = false, action = null, ouvert = false, onToucher = null, children = null, marque = null }) {
  return (
    <div className={`fsf-champ${aRegler ? " fsf-champ--regler" : ""}`}>
      <button type="button" className="fsf-champ-l" onClick={onToucher ?? undefined} disabled={!onToucher} aria-expanded={onToucher ? ouvert : undefined}>
        <span className="fsf-lb">{label}</span>
        <span className="fsf-val">{valeur}{marque ? <span className="fsf-marque">{marque}</span> : null}</span>
        {action ? <span className="fsf-act">{action}</span> : null}
      </button>
      {ouvert && children ? <div className="fsf-champ-corps">{children}</div> : null}
    </div>
  );
}


/** Les clés de questions du moteur qui appartiennent à une plateforme (« beebs:Taille », « ebay:Marque »…). */
function clesDeLaPlateforme(m, p) {
  return (m?.clesQuestions ?? []).filter((c) => c.startsWith(`${p}:`) || (p === "ebay" && c.startsWith("ebay:")));
}
/** Les clés communes (taille, couleur, matière, marque, genre, description, prix d'achat). */
function clesCommunes(m) {
  return (m?.clesQuestions ?? []).filter((c) => !/^(vinted|leboncoin|beebs|depop|ebay|opla):/.test(c) || c.startsWith("genre:"));
}

// (19/11) Le champ du RAYON qui porte un champ partagé (« Taille » de la grille Beebs, « Marque » eBay…) : une seule
// ligne pour les deux — la valeur de l'article pour toutes, ou celle de la grille de CETTE plateforme.
const RE_PARTAGE = { marque: /marque|brand/i, taille: /taille|pointure|size/i, couleur: /couleur|colou?r/i, matiere: /mati[eè]re|material/i };
function detailDuPartage(details, cle) {
  return details.find((d) => !d.lectureSeule && (d.ligne?.sharedKey === cle || RE_PARTAGE[cle]?.test(`${d.cle} ${d.label}`))) ?? null;
}

const enMots = (v, en) => (v === "" || v == null ? (en ? "To add" : "À ajouter") : String(v));
const prixEnMots = (v, en) => {
  if (v === "" || v == null) return en ? "To set" : "À fixer";
  const n = Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return String(v);
  return en ? `€${n % 1 ? n.toFixed(2) : n}` : `${(n % 1 ? n.toFixed(2) : String(n)).replace(".", ",")} €`;
};

/**
 * (19/11) Le choix d'une correction, sous sa ligne : la PORTÉE d'abord (toutes ses plateformes, par défaut, ou
 * seulement celle-ci), puis la valeur. Une valeur d'une liste s'applique au toucher ; un texte, à « Garder ».
 */
/** Un texte long, contrôlé, qui grandit avec son contenu (jamais coupé). */
function TexteAuto({ value, onChange, ...reste }) {
  const ref = useRef(null);
  useLayoutEffect(() => { const el = ref.current; if (!el) return; el.style.height = "auto"; el.style.height = `${el.scrollHeight + 2}px`; }, [value]);
  return <textarea ref={ref} className="fsn-textarea fsf-grandit" rows={4} value={value} onChange={(e) => onChange(e.target.value)} {...reste} />;
}

function EditeurCorrection({ m, p = null, ligne, plateformes, en, detail = null, onFini, respecterAPart = false }) {
  const multi = ligne.commun && plateformes.length > 1;
  const [portee, setPortee] = useState(multi || !p ? PORTEE_TOUTES : p);
  const [v, setV] = useState(ligne.valeur ?? "");
  const toutes = portee === PORTEE_TOUTES;
  const options = ligne.cle === "etat"
    ? (toutes ? ETATS_ARTICLE : (ligne.options?.length ? ligne.options : ETATS_ARTICLE))
    : (!toutes && detail?.allowedValues?.length ? detail.allowedValues : ligne.options ?? []);
  const garder = (val) => {
    const x = val ?? v;
    if (ligne.cle !== "description" && !String(x ?? "").trim()) return;
    if (corriger(m, { cle: ligne.cle, valeur: x, portee: toutes ? PORTEE_TOUTES : portee, plateformes, detail: toutes ? null : detail, respecterAPart: respecterAPart && toutes })) onFini?.();
  };
  const article = valeurDeLArticle(m, ligne.cle);
  return (
    <div className="fsf-edit">
      {p && multi ? (
        <div className="fsf-portee" role="radiogroup" aria-label={en ? "Applies to" : "S'applique à"}>
          <button type="button" role="radio" aria-checked={toutes} className={`fsf-portee-c${toutes ? " fsf-portee-c--on" : ""}`} onClick={() => setPortee(PORTEE_TOUTES)}>
            <span className="fsf-portee-r" aria-hidden="true" />
            <span className="fsf-portee-tx"><b>{en ? "All its platforms" : "Toutes ses plateformes"}</b>
              <small><span className="fsf-portee-logos">{plateformes.map((x) => <Logo key={x} platform={x} size={16} />)}</span>{en ? "kept on the item" : "gardé sur la fiche"}</small></span>
          </button>
          <button type="button" role="radio" aria-checked={!toutes} className={`fsf-portee-c${!toutes ? " fsf-portee-c--on" : ""}`} onClick={() => setPortee(p)}>
            <span className="fsf-portee-r" aria-hidden="true" />
            <span className="fsf-portee-tx"><b>{en ? `Only on ${NOM(p)}` : `Seulement sur ${NOM(p)}`}</b>
              <small>{article && ligne.cle !== "description" && ligne.cle !== "titre" ? (en ? `the others keep “${ligne.cle === "prix" ? prixEnMots(article, en) : article}”` : `les autres gardent « ${ligne.cle === "prix" ? prixEnMots(article, en) : article} »`) : (en ? "the others keep theirs" : "les autres gardent le leur")}</small></span>
          </button>
        </div>
      ) : p && !ligne.commun ? (
        <p className="fsq-note">{en ? `This field only exists on ${NOM(p)}: the correction is for ${NOM(p)} and stays on the item.` : `Ce champ n'existe que sur ${NOM(p)} : la correction vaut pour ${NOM(p)} et reste sur la fiche.`}</p>
      ) : null}
      {toutes && ligne.cle === "taille" && plateformes.length > 1 ? (
        <p className="fsq-note">{en ? "Each platform gets it in its own size chart when listing." : "Chaque plateforme la reçoit convertie dans sa propre grille, au dépôt."}</p>
      ) : null}
      {ligne.type === "liste" || (options?.length && ligne.type !== "long" && ligne.type !== "court" && ligne.type !== "prix") ? (
        <ChoixDeValeur en={en} valeur={ligne.cle === "etat" && toutes ? valeurDeLArticle(m, "etat") : ligne.valeur} valeurs={options}
          onChoisir={(x) => garder(x)} />
      ) : ligne.type === "long" ? (
        <>
          <TexteAuto value={v} onChange={setV} aria-label={ligne.label} />
          <div className="fsn-choices fsq-puces"><button type="button" className="fsn-choice fsn-choice--on" onClick={() => garder(v)}>{en ? "Save" : "Garder"}</button></div>
        </>
      ) : (
        <form className="fsf-saisie" onSubmit={(e) => { e.preventDefault(); garder(); }}>
          <input className="fsn-input" value={v} onChange={(e) => setV(e.target.value)} aria-label={ligne.label}
            type={ligne.type === "prix" ? "number" : "text"} inputMode={ligne.type === "prix" ? "decimal" : undefined} min={ligne.type === "prix" ? "1" : undefined} step={ligne.type === "prix" ? "0.5" : undefined} />
          <button type="submit" className="fsn-btn fsn-btn--secondary fsn-btn--sm" disabled={!String(v ?? "").trim()}>{en ? "Save" : "Garder"}</button>
        </form>
      )}
      {p && ligne.aPart && article ? (
        <button type="button" className="fsn-lien fsf-revenir" onClick={() => { if (corriger(m, { cle: ligne.cle, valeur: article, portee: p, plateformes })) onFini?.(); }}>
          {en ? `Back to the item's value (${ligne.cle === "prix" ? prixEnMots(article, en) : article})` : `Revenir à la valeur de l'article (${ligne.cle === "prix" ? prixEnMots(article, en) : article})`}
        </button>
      ) : null}
    </div>
  );
}

/** (19/11) Les lignes de la copie d'une plateforme : tout ce qui part, corrigeable. */
function LignesDeLaCopie({ m, p, en, plateformes, ouvert, basculer, details }) {
  const [ajout, setAjout] = useState(false);
  const { lignes, aAjouter } = lignesDeLaPlateforme(m, p, { libelles: en ? { titre: "Title", description: "Description", prix: "Price" } : {} });
  const detailDe = (cle) => (CHAMPS_PARTAGES.includes(cle) ? detailDuPartage(details, cle) : null);
  const rendre = (l) => {
    const d = detailDe(l.cle);
    const valeur = l.cle === "prix" ? prixEnMots(l.valeur, en) : enMots(l.valeur || d?.valeur, en);
    return (
      <Champ key={`l:${l.cle}`} label={l.label} valeur={<span className={l.cle === "description" ? "fsf-val-long" : undefined}>{valeur}</span>}
        aRegler={Boolean(d?.aRegler)} action={en ? "Edit" : "Modifier"} ouvert={ouvert === `l:${l.cle}`} onToucher={() => basculer(`l:${l.cle}`)}
        marque={l.aPart ? (en ? `only on ${NOM(p)}` : `pour ${NOM(p)} seulement`) : null}>
        <EditeurCorrection m={m} p={p} ligne={{ ...l, valeur: l.valeur || d?.valeur || "" }} plateformes={plateformes} en={en} detail={d} onFini={() => basculer(null)} />
      </Champ>
    );
  };
  return (
    <div className="fsf-copie" data-copie={p}>
      {lignes.map(rendre)}
      {ajout ? aAjouter.map(rendre) : null}
      {aAjouter.length > 0 && !ajout ? (
        <div className="fsf-ajouter">
          <button type="button" className="fsn-lien" onClick={() => setAjout(true)}>
            {en ? `+ Add: ${aAjouter.map((l) => l.label).join(", ")}` : `+ Ajouter : ${aAjouter.map((l) => l.label).join(", ")}`}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** (19/11, décision de Nico, points b et c) Le format du colis et les transporteurs Leboncoin : ceux de la FICHE. */
function LivraisonLbcDeLArticle({ m, en, poids, ouvert, basculer, transporteursLot = null, poserTransporteursArticle = null }) {
  const lang = en ? "en" : "fr";
  const pf = m.edited?.leboncoin?.platform_fields ?? {};
  const fiche = m.propsStepGeneration?.colisFiche ?? null;
  // Les attributs de la fiche lus par le moteur, et ce que CETTE session y a écrit par-dessus.
  const f = formatColisLbc({ pf, fiche: fiche ? { ...fiche, attributs: { ...(fiche.attributs ?? {}), ...(attributsDe(m) ?? {}) } } : null, poids_g: poids });
  const libFormat = f.valeur
    ? `${f.valeur} · ${f.origine === "article" ? (en ? "chosen for this item" : "choisi pour cet article")
      : f.origine === "choisi" ? (en ? "chosen on the item" : "choisi sur la fiche")
      : (en ? `from the weight (${textePoids(f.poids_g, lang)})` : `déduit du poids (${textePoids(f.poids_g)})`)}`
    : (en ? "Estimated by Leboncoin" : "Estimé par Leboncoin");
  const poserFormat = (v) => {
    const setEdited = m.propsStepGeneration?.setEdited;
    setEdited?.((prev) => (prev.leboncoin ? { ...prev, leboncoin: { ...prev.leboncoin, platform_fields: pfAvecFormatDeLArticle(prev.leboncoin.platform_fields ?? {}, v) } } : prev));
    ecrireSurLaFiche(m, { attributs: attributFormatDeLArticle(v, { poids_g: poids }) });
    journaliserCorrection(m, { champ: "format_colis_lbc", portee: "plateforme", plateforme: "leboncoin", plateformes: 1, avait_valeur: Boolean(f.valeur) });
    basculer(null);
  };
  const ficheT = transporteursDeLaFiche(attributsDe(m));
  const actuels = transporteursValides(pf.lbcTransporteurs);
  const montres = actuels ?? ficheT ?? transporteursValides(transporteursLot);
  const libT = montres ? montres.join(", ") : (en ? "Those Leboncoin offers" : "Ceux que Leboncoin propose");
  const sourceT = ficheT ? (en ? "chosen on the item" : "choisis sur la fiche") : transporteursLot ? (en ? "those of the batch" : "ceux du lot") : null;
  const basculerT = (nom) => {
    const suite = basculerTransporteur(ficheT ?? actuels ?? transporteursLot, nom);
    if (!suite.length) return; // au moins un transporteur
    const permis = transporteursPourPoids(poids);
    const noms = suite.filter((n) => permis.includes(n));
    m.poserLivraisonLbc?.({ lbcTransporteurs: noms.length ? noms : null });
    const a = choixTransporteursPourLaFiche(suite);
    if (a) ecrireSurLaFiche(m, { attributs: a });
    poserTransporteursArticle?.(suite);
    journaliserCorrection(m, { champ: "transporteurs_lbc", portee: "plateforme", plateforme: "leboncoin", plateformes: 1, avait_valeur: Boolean(ficheT) });
  };
  const coches = ficheT ?? actuels ?? transporteursLot ?? LBC_TRANSPORTEURS.map((t) => t.nom);
  return (
    <>
      <Champ label={en ? "Parcel size" : "Format"} valeur={libFormat} action={en ? "Edit" : "Modifier"}
        ouvert={ouvert === "lbc:format"} onToucher={() => basculer("lbc:format")}>
        <p className="fsq-note">{en
          ? "The item's own size: chosen for it, otherwise from its weight. Never one size for the whole batch."
          : "Celui de l'article : choisi pour lui, sinon déduit de son poids. Jamais un format unique pour tout le lot."}</p>
        <div className="fsn-choices fsq-puces">
          {LBC_FORMATS.map((x) => (
            <button key={x.valeur} type="button" title={en ? (x.aideEn ?? x.aide) : x.aide} className={`fsn-choice${f.valeur === x.valeur && (f.origine === "article" || f.origine === "choisi") ? " fsn-choice--on" : ""}`}
              onClick={() => poserFormat(x.valeur)}>{x.valeur}</button>
          ))}
          <button type="button" className={`fsn-choice${f.origine === "poids" || f.origine === "estime" ? " fsn-choice--on" : ""}`} onClick={() => poserFormat("")}>
            {poids ? (en ? "From the weight" : "Déduit du poids") : (en ? "Estimated by Leboncoin" : "Estimé par Leboncoin")}
          </button>
        </div>
        <p className="fsq-note">{en ? "Kept on the item for its next listings." : "Gardé sur la fiche pour ses prochaines annonces."}</p>
      </Champ>
      <Champ label={en ? "Carriers" : "Transporteurs"} valeur={libT} marque={sourceT} action={en ? "Edit" : "Modifier"}
        ouvert={ouvert === "lbc:transporteurs"} onToucher={() => basculer("lbc:transporteurs")}>
        {LBC_TRANSPORTEURS.map((t) => {
          const on = coches.includes(t.nom);
          const tropLourd = poids != null && !transporteursPourPoids(poids).includes(t.nom);
          return (
            <button key={t.cle} type="button" className="fsn-pf fsf-transp" onClick={() => basculerT(t.nom)} aria-pressed={on} disabled={tropLourd && !on}>
              <span className={`fsn-check${on && !tropLourd ? " fsn-check--on" : ""}`} aria-hidden="true">{on && !tropLourd ? "✓" : ""}</span>
              <span className="fsn-grow">
                <b>{t.nom}</b>
                <small>{en ? `Up to ${t.kgMax} kg · ${t.remiseEn ?? t.remise}` : `Jusqu'à ${t.kgMax} kg · ${t.remise}`}{tropLourd ? (en ? " · too heavy for this item" : " · trop lourd pour cet article") : ""}</small>
              </span>
            </button>
          );
        })}
        <p className="fsq-note">{en ? "Kept on the item: it goes before the batch's choice, for its next Leboncoin listings too." : "Gardé sur la fiche : il passe devant le choix du lot, pour ses prochaines annonces Leboncoin aussi."}</p>
      </Champ>
    </>
  );
}

function SectionPlateforme({ m, p, en, poids, deDefaut = false, poserPoids, retirer, ecartee = null, remettre = null, plateformes = [], ouvertDemande = null, transporteursLot = null, poserTransporteursArticle = null }) {
  // « rayon » | « colis » | id d'un détail | « l:<champ> » ; `ouvertDemande` (côte à côte) : la ligne ouverte en arrivant —
  // le parent remonte la section (key) quand elle change.
  const [ouvert, setOuvert] = useState(ouvertDemande);
  const basculer = (k) => setOuvert((o) => (k == null ? null : o === k ? null : k));
  const lang = en ? "en" : "fr";
  if (ecartee) {
    return (
      <section className="fsf-pf fsf-pf--ecartee" aria-label={NOM(p)}>
        <div className="fsf-pf-t">
          <Logo platform={p} size={24} desature />
          <b>{NOM(p)}</b>
          <Puce ton="mute">{en ? "Not published" : "Ne part pas"}</Puce>
        </div>
        <div className="fsf-pf-ecart">
          <span>{ecartee.motif === "aucun_rayon"
            ? (en ? `No ${NOM(p)} category for this item.` : `Aucun rayon ${NOM(p)} pour cet article.`)
            : (en ? `${NOM(p)} doesn't accept this item.` : `${NOM(p)} n'accepte pas cet article.`)}</span>
          {remettre ? <button type="button" className="fsn-btn fsn-btn--ghost fsn-btn--sm" onClick={() => remettre(p)}>{en ? "Publish anyway" : "Le publier quand même"}</button> : null}
        </div>
      </section>
    );
  }
  const statut = statutPlateforme(m, p);
  const chemin = cheminRayon(m, p);
  const rayon = m.rayonsParPf?.[p] ?? (chemin ? { chemin } : null);
  const question = m.rayonsAChoisir?.[p] ?? null;
  const neuf = rayonNeufDe(m, p);
  const grille = p === "vinted" ? grilleColisVinted(chemin) : null;
  const colis = colisDe(m, p, { poids, grilleVinted: grille, lang });
  // (26/10, D2) Le poids des Réglages se dit comme tel : la personne voit d'où il vient, et le change ici.
  if (deDefaut && (p === "leboncoin" || p === "beebs") && !colis.manquant) colis.libelle = `${colis.libelle} · ${en ? "default" : "par défaut"}`;
  const tous = detailsDe(m, p);
  // (19/11) Un champ du rayon qui porte la marque, la taille, la couleur ou la matière est rendu par la ligne de la copie
  // (portée + grille de la plateforme) ; la taille montrée en lecture seule (règle 6) y devient corrigeable.
  const copie = lignesDeLaPlateforme(m, p);
  const clesCopie = new Set([...copie.lignes, ...copie.aAjouter].map((l) => l.cle));
  const fusionnes = new Set(CHAMPS_PARTAGES.filter((c) => clesCopie.has(c)).map((c) => detailDuPartage(tous, c)?.id).filter(Boolean));
  const details = tous.filter((d) => !fusionnes.has(d.id) && !(d.lectureSeule && clesCopie.has(d.cle)));
  // La ligne « neuf seulement » a son encadré (ses deux sorties) : jamais redite par le bloc de questions.
  const cles = clesDeLaPlateforme(m, p).filter((c) => !(neuf && c === `${p}:${neuf.ligne?.key}`));
  const carteRayon = (
    <CarteRayon key={ouvert === "rayon" ? "recherche" : "carte"} platform={p} lang={m.lang} rayon={question ? null : rayon} question={question}
      seulementLeRayon rechercheOuverte={ouvert === "rayon"}
      suggestions={m.suggestionsParPf?.[p] ?? []} champs={m.edited?.[p]?.platform_fields ?? {}} configLocale={[]} supabase={m.supabase}
      onChoisirRayon={(choix) => { m.choisirRayon?.(p, choix); setOuvert(null); }} regle="nouvelle" />
  );
  return (
    <section className={`fsf-pf${statut === "a_regler" ? " fsf-pf--regler" : ""}`} aria-label={NOM(p)}>
      <div className="fsf-pf-t">
        <Logo platform={p} size={24} />
        <b>{NOM(p)}</b>
        <Puce ton={statut === "a_regler" ? "geste" : "ok"}>{statut === "a_regler" ? (en ? "To settle" : "À régler") : (en ? "Ready" : "Prêt")}</Puce>
      </div>

      <Champ label={en ? "Category" : "Rayon"} valeur={chemin ? texteRayon(chemin) : (en ? "To choose" : "À choisir")}
        aRegler={Boolean(question) && !chemin} action={en ? "Change" : "Changer"} ouvert={ouvert === "rayon" || (Boolean(question) && !neuf)}
        onToucher={() => basculer("rayon")}>
        {carteRayon}
      </Champ>

      {neuf && (
        <div className="fsf-alerte fsf-alerte--regler">
          <p>{neuf.message}</p>
          <div className="fsn-choices fsq-puces">
            {(neuf.valeursNeuves.length ? neuf.valeursNeuves : ["Neuf sans étiquette"]).map((v) => (
              <button key={v} type="button" className="fsn-choice" onClick={() => {
                // C8 : le choix de la PERSONNE — l'état de l'article passe en neuf, et la copie de ce rayon aussi.
                m.poserValeurGenerale?.("etat", v);
                m.noterReponseQuestion?.(p, neuf.ligne, v);
                if (neuf.ligne?.dedicatedTarget && m.setPlatformDedicatedField) m.setPlatformDedicatedField(p, neuf.ligne.dedicatedTarget, v);
                else m.setPlatformAspect?.(p, neuf.ligne?.key, v);
              }}>{en ? `Set the condition to “${ETATS_EN[v] ?? v}”` : `Passer l'état en « ${v} »`}</button>
            ))}
            <button type="button" className="fsn-choice" onClick={() => setOuvert("rayon")}>{en ? "Change category" : "Changer de rayon"}</button>
          </div>
        </div>
      )}

      <LignesDeLaCopie m={m} p={p} en={en} plateformes={plateformes} ouvert={ouvert} basculer={basculer} details={tous} />

      <Champ label={p === "depop" ? (en ? "Shipping" : "Port") : p === "ebay" ? (en ? "Delivery" : "Livraison") : p === "leboncoin" || p === "beebs" ? (en ? "Weight" : "Poids") : (en ? "Parcel" : "Colis")}
        valeur={colis.libelle} aRegler={Boolean(colis.manquant)} action={en ? "Edit" : "Modifier"} ouvert={ouvert === "colis"}
        marque={(p === "leboncoin" || p === "beebs") && poids && !deDefaut ? (en ? "from the item" : "de la fiche") : null}
        onToucher={() => basculer("colis")}>
        {p === "vinted" ? (
          <div className="fsn-choices fsq-puces">
            <button type="button" className={`fsn-choice${!(Number(m.edited?.vinted?.platform_fields?.packageSizeId) > 0) ? " fsn-choice--on" : ""}`}
              onClick={() => m.poserColisVinted?.(0)}>{en ? "Recommended by Vinted" : "Recommandé par Vinted"}</button>
            {(grille ?? []).map((g) => (
              <button key={g.id} type="button" className={`fsn-choice${Number(m.edited?.vinted?.platform_fields?.packageSizeId) === g.id ? " fsn-choice--on" : ""}`}
                onClick={() => m.poserColisVinted?.(g.id)}>{g.libelle}</button>
            ))}
          </div>
        ) : p === "leboncoin" || p === "beebs" ? (
          <PoidsDeLArticle en={en} poids={poids} poserPoids={poserPoids} />
        ) : p === "depop" ? (
          <CartePortDepop m={m} id={`port-depop-fiche-${m.invId ?? "x"}`} />
        ) : p === "ebay" ? (
          m.ebayVoieApiReelle
            ? <CarteLivraisonEbay lang={m.lang} champs={m.edited?.ebay?.platform_fields ?? {}} onChange={(cle, valeur) => m.poserChampCopie?.("ebay", cle, valeur)} />
            : <p className="fsq-note">{en ? "eBay applies your account's delivery policy." : "eBay applique la règle de livraison de ton compte."}</p>
        ) : null}
      </Champ>

      {p === "leboncoin" && m.edited?.leboncoin ? (
        <LivraisonLbcDeLArticle m={m} en={en} poids={poids} ouvert={ouvert} basculer={basculer}
          transporteursLot={transporteursLot} poserTransporteursArticle={poserTransporteursArticle} />
      ) : null}

      {typeof m.poserPhotosCopie === "function" && (
        <div className="fsf-photos-pf" data-photos-plateforme-lot="">
          <PhotosPlateforme platform={p} toutes={photosDeLaFicheLot(m)} choix={m.edited?.[p]?.photos ?? null}
            onChange={(urls) => m.poserPhotosCopie(p, urls)} T={T_PHOTOS} lang={lang} />
        </div>
      )}

      {cles.length > 0 && (
        <div className="fsf-questions">
          <BlocQuestions m={m} seulement={cles} puces />
        </div>
      )}

      {details.filter((d) => !cles.includes(d.id)).map((d) => (
        <Champ key={d.id} label={d.label} aRegler={d.aRegler}
          valeur={d.valeur || (d.rempli === "plateforme" ? (en ? `Filled in by ${NOM(p)}` : `Rempli par ${NOM(p)}`)
            : d.rempli ? (en ? "Filled in when listing" : "Rempli au dépôt") : (en ? "To choose" : "À choisir"))}
          action={null} ouvert={ouvert === d.id} onToucher={d.lectureSeule ? null : () => basculer(d.id)}>
          <ChoixDeValeur en={en} valeur={d.valeur} valeurs={d.allowedValues} onChoisir={(v) => {
            ecrireDetail(m, d, v);
            journaliserCorrection(m, { champ: d.cle, portee: "plateforme", plateforme: p, plateformes: plateformes.length, avait_valeur: Boolean(d.valeur), rayon: true });
            setOuvert(null);
          }} />
        </Champ>
      ))}

      {retirer ? (
        <div className="fsf-pf-pied">
          <button type="button" className="fsf-retirer-pf" onClick={() => retirer(p)}>
            <span aria-hidden="true">✕</span> {en ? `Don't publish on ${NOM(p)}` : `Ne pas publier sur ${NOM(p)}`}
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** Le poids de l'article, modifiable : celui de la fiche ou du choix de la personne (jamais une estimation). */
export function PoidsDeLArticle({ en, poids, poserPoids }) {
  const [v, setV] = useState("");
  const [faux, setFaux] = useState(false);
  const appliquer = () => { const g = lirePoidsSaisi(v); if (!g) { setFaux(true); return; } setFaux(false); poserPoids?.(g); setV(""); };
  return (
    <div className="fsf-poids">
      <p className="fsq-note">{poids
        ? (en ? `Weight kept on the item: ${textePoids(poids, "en")}.` : `Poids gardé sur la fiche : ${textePoids(poids)}.`)
        : (en ? "No weight on this item yet." : "Pas encore de poids sur cette fiche.")}</p>
      <div className="fsq-poids-tous">
        <input className="fsn-input" type="text" inputMode="decimal" value={v} placeholder={en ? "e.g. 650 g or 1.2 kg" : "ex. 650 g ou 1,2 kg"}
          aria-label={en ? "Parcel weight" : "Poids du colis"} aria-invalid={faux || undefined}
          onChange={(e) => { setV(e.target.value); setFaux(false); }} onKeyDown={(e) => { if (e.key === "Enter") appliquer(); }} />
        <button type="button" className="fsn-btn fsn-btn--secondary fsn-btn--sm fsq-btn" onClick={appliquer}>{en ? "Save" : "Garder"}</button>
      </div>
      {faux ? <p className="fsq-faux" role="alert">{en ? "Write a weight, e.g. 650 g or 1.2 kg." : "Écris un poids, par exemple 650 g ou 1,2 kg."}</p> : null}
      <p className="fsq-note">{en ? "One weight for the item: Leboncoin and Beebs use it." : "Un seul poids pour l'article : Leboncoin et Beebs s'en servent."}</p>
    </div>
  );
}


/** (19/11, réponse 7 de Nico) Côte à côte, sur ordinateur : une colonne par plateforme, une ligne par champ. */
function CoteACote({ m, pfs, en, poids, ouvrir }) {
  const lang = en ? "en" : "fr";
  const champs = [
    ["titre", en ? "Title" : "Titre"], ["prix", en ? "Price" : "Prix"], ["etat", en ? "Condition" : "État"],
    ["marque", en ? "Brand" : "Marque"], ["taille", en ? "Size" : "Taille"], ["couleur", en ? "Colour" : "Couleur"], ["matiere", en ? "Material" : "Matière"],
  ];
  return (
    <div className="fsf-cote" role="region" aria-label={en ? "Side by side" : "Côte à côte"}>
      <table className="fsf-cote-t">
        <thead><tr><th />{pfs.map((p) => <th key={p}><span className="fsf-cote-pf"><Logo platform={p} size={20} />{NOM(p)}</span></th>)}</tr></thead>
        <tbody>
          {champs.map(([cle, label]) => (
            <tr key={cle}><th scope="row">{label}</th>
              {pfs.map((p) => {
                const existe = cle === "titre" ? !plateformeSansTitre(p) : cle === "prix" ? true : (m.platformFieldsConfig?.[p] ?? []).some((f) => f.key === cle);
                const v = existe ? valeurDeLaCopie(m, p, cle) : "";
                return (
                  <td key={p}>{existe
                    ? <button type="button" className="fsf-cote-c" onClick={() => ouvrir(p, `l:${cle}`)}>{cle === "prix" ? prixEnMots(v, en) : enMots(v, en)}</button>
                    : <span className="fsf-cote-x">—</span>}</td>
                );
              })}
            </tr>
          ))}
          <tr><th scope="row">{en ? "Category" : "Rayon"}</th>
            {pfs.map((p) => { const c = cheminRayon(m, p); return <td key={p}><button type="button" className="fsf-cote-c" onClick={() => ouvrir(p, "rayon")}>{c ? texteRayon(c) : (en ? "To choose" : "À choisir")}</button></td>; })}
          </tr>
          <tr><th scope="row">{en ? "Parcel" : "Colis"}</th>
            {pfs.map((p) => <td key={p}><button type="button" className="fsf-cote-c" onClick={() => ouvrir(p, "colis")}>{colisDe(m, p, { poids, grilleVinted: p === "vinted" ? grilleColisVinted(cheminRayon(m, p)) : null, lang }).libelle}</button></td>)}
          </tr>
          <tr><th scope="row">Photos</th>
            {pfs.map((p) => <td key={p}><span className="fsf-cote-x">{(m.edited?.[p]?.photos ?? photosDeLaFicheLot(m)).length}</span></td>)}
          </tr>
        </tbody>
      </table>
      <p className="fsq-note">{en ? "Tap a value to correct it on its platform." : "Touche une valeur pour la corriger sur sa plateforme."}</p>
    </div>
  );
}

/**
 * La fiche entière d'un article.
 * @param {object} props
 * @param {object} props.m           le moteur de l'article (pilote du stepper)
 * @param {object} props.item        l'article du Stock
 * @param {object} [props.decision]  decisions[id] du lot ({ poids, texteValide, ecarteesRemises… })
 * @param {Array}  [props.ecartees]  plateformes écartées d'office ([{ p, motif }])
 * @param {boolean} [props.photoVide] aucune vraie photo (les seules sont des images par défaut connues, photoVide.js)
 * @param {object} props.actions     { poserPoids(g), retirerPlateforme(p), remettrePlateforme(p), validerTexte(), poserTransporteursArticle(liste) }
 * @param {string[]|null} [props.transporteursLot]  (19/11) les transporteurs Leboncoin du lot (ou retenus du compte)
 */
export default function FicheArticle({ m, item = null, decision = {}, ecartees = [], photoVide = false, actions = {}, en = false, lecture = null, poidsDefaut = null, transporteursLot = null }) {
  const fichier = useRef(null);
  const [ajout, setAjout] = useState(false);
  const [rien, setRien] = useState(null);
  const [ouvertCar, setOuvertCar] = useState(null);
  const grand = useGrandEcran();
  const pfsInit = m ? plateformesDeLArticle(m) : [];
  // L'onglet d'arrivée : la première plateforme à régler, sinon « L'article ».
  const [onglet, setOnglet] = useState(() => (m ? pfsInit.find((p) => statutPlateforme(m, p) === "a_regler") : null) ?? "article");
  const [demande, setDemande] = useState(null); // { p, ligne } : la ligne à ouvrir en arrivant sur l'onglet (côte à côte)
  if (!m) return null;
  const general = m.generales ?? {};
  const pfs = plateformesDeLArticle(m);
  const premiere = pfs[0];
  const titre = String(general.titre || m.edited?.[premiere]?.title || item?.title || item?.titre || "");
  const description = String(general.description || m.edited?.[premiere]?.description || "");
  const etat = String(general.etat || m.etatArticle || "");
  const prix = m.price ?? item?.sell ?? "";
  const photos = (m.processedPhotos?.length ? m.processedPhotos : m.photos) ?? urlsPhotos(item?.photos);
  const defautG = poidsDefaut ?? m.colisDefautLbc?.poids_g ?? null;
  const poids = poidsAffiche(m, decision, item, defautG);
  const deDefaut = poidsParDefaut(m, decision, item, defautG);
  const incoherent = poids ? poidsIncoherent(`${titre} ${m.edited?.[premiere]?.platform_fields?.categorie_objet_ia ?? ""}`, poids, en ? "en" : "fr") : null;
  const ecritParFillSell = !String(m.texteVendeur?.description ?? "").trim();
  // La MÊME fiche que celle du texte qui part (construireJobs) : ce qu'on montre est ce qui partira sur Vinted.
  const ficheTexte = { titre: m.initialListing?.titre ?? titre, marque: m.initialListing?.marque ?? "", ...(m.ficheDuTexte?.() ?? {}), etat };
  const montre = ecritParFillSell ? descriptionFidele(description, "vinted", { fiche: ficheTexte }) : description;
  const avecHashtags = /(^|\s)#[\p{L}\p{N}]/u.test(montre);
  const sansHashtags = pfs.filter((p) => !hashtagsServent(p));
  const lang = en ? "en" : "fr";
  const communes = clesCommunes(m);
  const ecarteesSeules = (ecartees ?? []).filter((e) => !pfs.includes(e.p));
  const ongletVu = onglet === "cote" && !grand ? "article" : (onglet !== "article" && onglet !== "cote" && !pfs.includes(onglet) && !ecarteesSeules.some((e) => e.p === onglet)) ? "article" : onglet;
  // (26/10, D3) Titre, description et prix « à la demande » (réglage) : ce que FillSell propose, champ par champ.
  // (29/10, lot B 1.1 — promesse XEWER) Un bouton par champ, dans les DEUX modes (« FillSell écrit tout » : il propose
  // une autre version) ; sur un champ rempli, la feuille « Remplacer ? » demande l'accord. Le prix suit la stratégie.
  const generer = (champ) => (m.genererChamp ? (
    <button type="button" className="fsn-lien fsf-generer" disabled={Boolean(m.genereEnCours)}
      onClick={(e) => { e.preventDefault(); setRien(null); Promise.resolve(m.genererChamp(champ)).then((ok) => { if (!ok) setRien(champ); }); }}>
      {m.genereEnCours === champ ? (en ? "Writing…" : "Rédaction…")
        : rien === champ ? (en ? "Nothing to suggest yet" : "Rien à proposer pour l'instant")
        : champ === "prix" ? (en ? "Estimate with AI" : "Estimer avec l'IA") : (en ? "Generate with AI" : "Générer avec l'IA")}
    </button>
  ) : null);
  const ajouterPhotos = async (files) => {
    if (!files?.length || !m.handleAddMorePhotos) return;
    setAjout(true);
    try { await m.handleAddMorePhotos([...files]); } catch { /* le moteur garde son erreur */ }
    setAjout(false);
  };
  // (19/11) La correction du prix et de l'état faite ici vaut pour toutes les plateformes ET s'écrit sur la fiche.
  // Comme avant (poserPrixGeneral, poserValeurGenerale : une copie à part garde la sienne), et la fiche suit.
  const corrigerCommun = (cle, valeur) => corriger(m, { cle, valeur, portee: PORTEE_TOUTES, plateformes: pfs, respecterAPart: true });
  const aReglerArticle = photoVide || communes.length > 0;
  const ouvrirDepuisCote = (p, ligne) => { setDemande({ p, ligne }); setOnglet(p); };
  const onglets = [
    { id: "article", label: en ? "The item" : "L'article", regler: aReglerArticle },
    ...pfs.map((p) => ({ id: p, p, label: NOM(p), regler: statutPlateforme(m, p) === "a_regler" })),
    ...ecarteesSeules.map((e) => ({ id: e.p, p: e.p, label: NOM(e.p), ecartee: true })),
    ...(grand && pfs.length > 1 ? [{ id: "cote", label: en ? "Side by side" : "Côte à côte" }] : []),
  ];

  return (
    <div className="fsf">
      <div className="fsf-onglets" role="tablist" aria-label={en ? "The item and its platforms" : "L'article et ses plateformes"}>
        {onglets.map((o) => (
          <button key={o.id} type="button" role="tab" aria-selected={ongletVu === o.id} className={`fsf-onglet${ongletVu === o.id ? " fsf-onglet--on" : ""}${o.ecartee ? " fsf-onglet--ecartee" : ""}`}
            onClick={() => { setDemande(null); setOnglet(o.id); }}>
            {o.p ? <Logo platform={o.p} size={18} desature={Boolean(o.ecartee)} /> : null}
            <span>{o.label}</span>
            {o.regler ? <span className="fsf-onglet-dot" aria-label={en ? "to settle" : "à régler"} /> : null}
          </button>
        ))}
      </div>

      {ongletVu === "article" && (<>
      {photoVide && (
        <div className="fsf-alerte fsf-alerte--refus">
          {/* (11/11, point T1) La phrase sur Beebs : seulement pour l'image par défaut de Beebs reconnue à l'identique. */}
          <p><b>{en ? "No real photo." : "Aucune vraie photo."}</b>{imageParDefautDe("beebs", [...urlsPhotos(photos), ...urlsPhotos(m.photos)])
            ? <> {en ? "The picture is the placeholder Beebs shows when a listing has none." : "L'image est celle que Beebs affiche quand l'annonce n'en a pas."}</> : null}</p>
          <div className="fsn-choices fsq-puces">
            <button type="button" className="fsn-choice fsn-choice--on" onClick={() => fichier.current?.click()} disabled={ajout}>
              {ajout ? (en ? "Adding…" : "Ajout…") : (en ? "Add photos" : "Ajouter des photos")}
            </button>
          </div>
        </div>
      )}

      <div className="fsf-photos" role="list" aria-label={en ? "Photos" : "Photos"}>
        {photos.map((ph, i) => (
          <div key={`${i}-${typeof ph === "string" ? ph : ph?.url}`} className="fsf-ph" role="listitem">
            <img src={urlPhoto(typeof ph === "string" ? ph : ph?.url)} alt="" loading="lazy" />
            {m.handleRemovePhoto && photos.length > 1 ? (
              <button type="button" className="fsf-ph-x" onClick={() => m.handleRemovePhoto(i)} aria-label={en ? "Remove this photo" : "Retirer cette photo"}>✕</button>
            ) : null}
          </div>
        ))}
        {m.handleAddMorePhotos ? (
          <button type="button" className="fsf-ph fsf-ph--plus" onClick={() => fichier.current?.click()} disabled={ajout}>
            {ajout ? (en ? "Adding…" : "Ajout…") : (en ? "+ Photos" : "+ Photos")}
          </button>
        ) : null}
      </div>
      <p className="fsq-note fsf-note-photos">{en ? "Photos per platform (order, cover, limit): in each platform's tab." : "Les photos de chaque plateforme (ordre, couverture, limite) : dans son onglet."}</p>

      <div className="fsf-bloc">
        <div className="fsf-bloc-t"><span>{en ? "Title" : "Titre"}</span>{generer("titre")}</div>
        <TexteQuiGrandit key={`titre-${titre}`} valeur={titre} lignesMin={1} aria-label={en ? "Title" : "Titre"}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
          onFini={(v) => m.poserValeurGenerale?.("titre", v.replace(/\s*\n+\s*/g, " "))} />
        {/* (29/10, lot B 1.3) La dictée sur le titre : elle s'ajoute, jamais à la place. */}
        <BoutonDictee lang={lang} onChange={(v) => m.poserValeurGenerale?.("titre", String(v ?? "").replace(/\s*\n+\s*/g, " "))} />
      </div>

      <div className="fsf-deux">
        <label className="fsf-mini">
          <small className="fsf-mini-t"><span>{en ? "Price" : "Prix"}</span>{generer("prix")}</small>
          <input className="fsn-input" type="number" inputMode="decimal" min="1" step="0.5" defaultValue={prix}
            key={`prix-${prix}`} aria-label={en ? "Selling price" : "Prix de vente"}
            onBlur={(e) => { if (String(e.target.value) !== String(prix)) corrigerCommun("prix", e.target.value); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
        </label>
        <label className="fsf-mini">
          <small>{en ? "Condition" : "État"}</small>
          <select className="fsn-select" value={ETATS_ARTICLE.includes(etat) ? etat : ""} onChange={(e) => corrigerCommun("etat", e.target.value)}
            aria-label={en ? "Condition" : "État"}>
            {!ETATS_ARTICLE.includes(etat) ? <option value="">{etat || (en ? "To choose" : "À choisir")}</option> : null}
            {ETATS_ARTICLE.map((x) => <option key={x} value={x}>{en ? ETATS_EN[x] : x}</option>)}
          </select>
        </label>
      </div>

      <div className="fsf-bloc">
        <div className="fsf-bloc-t">
          <span>{en ? "Description" : "Description"}</span>
          {generer("description")}
          {ecritParFillSell
            ? <span className="fsf-tag">{decision?.texteValide ? (en ? "Written by FillSell · approved" : "Écrite par FillSell · validée") : (en ? "Written by FillSell, check it" : "Écrite par FillSell, relis-la")}</span>
            : <span className="fsf-tag fsf-tag--toi">{en ? "Your text" : "Ton texte"}</span>}
        </div>
        <TexteQuiGrandit key={`desc-${montre.length}-${montre.slice(0, 40)}`} valeur={montre} lignesMin={4} aria-label={en ? "Description" : "Description"}
          onFini={(v) => m.poserValeurGenerale?.("description", v)} />
        {/* (29/10, lot B 1.3) La dictée sur la description : elle s'ajoute à la ligne, jamais à la place. */}
        <BoutonDictee lang={lang} separateur={"\n"} onChange={(v) => m.poserValeurGenerale?.("description", v)} />
        {lecture?.note ? <p className="fsq-note">{phraseLecture(lecture.note, en)}</p> : null}
        {/* (30/10, lot E, essai B5) Le texte de la personne part tel quel PARTOUT, hashtags compris (construireJobs,
            texteDuVendeur) : la note ne vaut que pour un texte écrit par FillSell. */}
        {ecritParFillSell && avecHashtags && sansHashtags.length > 0
          ? <p className="fsq-note">{en ? `Hashtags only go out on Vinted and Depop (5 at most there): ${sansHashtags.map(NOM).join(", ")} get the text without them.` : `Les hashtags ne partent que sur Vinted et Depop (5 au plus) : ${sansHashtags.map(NOM).join(", ")} reçoi${sansHashtags.length > 1 ? "vent" : "t"} le texte sans eux.`}</p>
          : null}
        {ecritParFillSell && !decision?.texteValide && actions.validerTexte ? (
          <div className="fsn-choices fsq-puces"><button type="button" className="fsn-choice" onClick={actions.validerTexte}>{en ? "The text is right" : "Le texte est bon"}</button></div>
        ) : null}
      </div>

      {/* (19/11) Les caractéristiques de l'article : la valeur qui part partout (convertie pour chaque plateforme au
          dépôt) ; la corriger ici la corrige sur toutes ses plateformes et sur la fiche. */}
      <div className="fsf-pf fsf-pf--commun">
        <div className="fsf-pf-t"><b>{en ? "Characteristics" : "Caractéristiques"}</b><span className="fsf-pf-t-s">{en ? "for all its platforms" : "pour toutes ses plateformes"}</span></div>
        {CHAMPS_PARTAGES.filter((cle) => pfs.some((p) => (m.platformFieldsConfig?.[p] ?? []).some((f) => f.key === cle))).map((cle) => {
          const cfg = pfs.map((p) => (m.platformFieldsConfig?.[p] ?? []).find((f) => f.key === cle)).find(Boolean);
          const v = valeurDeLArticle(m, cle) || pfs.map((p) => valeurDeLaCopie(m, p, cle)).find(Boolean) || "";
          const ligne = { cle, label: cfg?.label ?? cle, valeur: v, commun: true, type: cfg?.type === "select" ? "liste" : "texte", options: (cfg?.options ?? []).map((o) => String(o.value ?? o)) };
          return (
            <Champ key={cle} label={ligne.label} valeur={enMots(v, en)} action={en ? "Edit" : "Modifier"} ouvert={ouvertCar === cle} onToucher={() => setOuvertCar((o) => (o === cle ? null : cle))}>
              <EditeurCorrection m={m} ligne={ligne} plateformes={pfs} en={en} respecterAPart onFini={() => setOuvertCar(null)} />
            </Champ>
          );
        })}
      </div>

      {incoherent && (
        <div className="fsf-alerte fsf-alerte--regler">
          <p><b>{en ? `${textePoids(poids, lang)} for ${incoherent.nom}?` : `${textePoids(poids)} pour ${incoherent.nom} ?`}</b></p>
          <div className="fsn-choices fsq-puces">
            {incoherent.propositions.map((g) => <button key={g} type="button" className="fsn-choice" onClick={() => actions.poserPoids?.(g)}>{textePoids(g, lang)}</button>)}
            <button type="button" className="fsn-choice" onClick={() => actions.poserPoids?.(poids)}>{en ? `Keep ${textePoids(poids, lang)}` : `Garder ${textePoids(poids)}`}</button>
          </div>
        </div>
      )}

      {communes.length > 0 && (
        <div className="fsf-questions fsf-questions--commun">
          <BlocQuestions m={m} seulement={communes} puces />
        </div>
      )}

      {pfs.length > 0 && (
        <div className="fsf-resume" aria-label={en ? "Its platforms" : "Ses plateformes"}>
          {pfs.map((p) => (
            <button key={p} type="button" className="fsf-resume-l" onClick={() => setOnglet(p)}>
              <Logo platform={p} size={20} /><b>{NOM(p)}</b>
              <Puce ton={statutPlateforme(m, p) === "a_regler" ? "geste" : "ok"}>{statutPlateforme(m, p) === "a_regler" ? (en ? "To settle" : "À régler") : (en ? "Ready" : "Prêt")}</Puce>
              <span className="fsq-chevron" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      )}
      </>)}
      <input ref={fichier} type="file" accept="image/*" multiple hidden onChange={(e) => { ajouterPhotos(e.target.files); e.target.value = ""; }} />

      {pfs.filter((p) => p === ongletVu).map((p) => (
        <SectionPlateforme key={`${p}:${demande?.p === p ? demande.ligne : ""}`} m={m} p={p} en={en} poids={poids} deDefaut={deDefaut} poserPoids={actions.poserPoids}
          retirer={pfs.length > 1 ? actions.retirerPlateforme : null} plateformes={pfs}
          ouvertDemande={demande?.p === p ? demande.ligne : null}
          transporteursLot={transporteursLot} poserTransporteursArticle={actions.poserTransporteursArticle ?? null} />
      ))}
      {ecarteesSeules.filter((e) => e.p === ongletVu).map((e) => (
        <SectionPlateforme key={`ec-${e.p}`} m={m} p={e.p} en={en} ecartee={e} remettre={actions.remettrePlateforme} />
      ))}
      {ongletVu === "cote" && <CoteACote m={m} pfs={pfs} en={en} poids={poids} ouvrir={ouvrirDepuisCote} />}
    </div>
  );
}

function phraseLecture(note, en) {
  if (note === "redigee_sans_lecteur") return en ? "You chose to have FillSell write it from your photos and title." : "Tu as choisi de la faire rédiger par FillSell, d'après tes photos et ton titre.";
  if (note === "vinted_sans_extension" && estClientCloud()) return en ? "FillSell Cloud hasn't read your Vinted description yet: this one was written from your photos." : "FillSell Cloud n'a pas encore lu ta description Vinted : celle-ci a été écrite d'après tes photos.";
  if (note === "vinted_sans_extension") return en ? "Your Vinted description is read from your computer: this one was written from your photos." : "Ta description Vinted se lit depuis ton ordinateur : celle-ci a été écrite d'après tes photos.";
  if (note === "sans_description") return en ? "Your Vinted listing has no description: this one was written from your photos." : "Ton annonce Vinted n'a pas de description : celle-ci a été écrite d'après tes photos.";
  if (note === "vinted_echec" || note === "pont_mort") return en ? "Your Vinted description couldn't be read this time: this one was written from your photos." : "Ta description Vinted n'a pas pu être lue cette fois : celle-ci a été écrite d'après tes photos.";
  return "";
}
