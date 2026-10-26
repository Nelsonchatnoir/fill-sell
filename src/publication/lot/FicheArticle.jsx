// ═══════════════════════════════════════════════════════════════════════════
// LA POP-UP D'UN ARTICLE — TOUT CE QUI PART, MODIFIABLE SUR PLACE (26/10, refonte C validée par Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Une seule pop-up par article, prêts compris (C3) : d'abord le commun — photos, titre, prix, état, description
// ouverte sur son début —, puis UNE SECTION PAR PLATEFORME : son statut (Prêt / À régler), son rayon et « Changer »,
// son colis ou son port, ses caractéristiques. Tout se modifie ici, sans autre pop-up : le rayon se change dans la
// section, une valeur se choisit sous sa ligne. La même pop-up sert l'écran « Vérifier » de la publication à l'unité
// (C11, mode « page »).
// ⛔ Aucune règle n'est réécrite : chaque geste passe par le moteur du stepper (setPlatformAspect, choisirRayon,
//    poserColisVinted, portDepop.poser, poserPrixGeneral, poserValeurGenerale…), comme depuis ses cartes.
// ⛔ Rien n'est caché : aucune valeur coupée par « … » (règle 2 de Nico), un retrait de plateforme est un BOUTON qui
//    se lit comme une action (règle 3), jamais un texte qui ressemble à un statut.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import BlocQuestions from "../BlocQuestions";
import CarteRayon from "../../components/CarteRayon";
import { CartePortDepop } from "../../components/PortDepop";
import CarteLivraisonEbay from "../../components/CarteLivraisonEbay";
import { Logo, Puce } from "../composants";
import { NOM } from "../texte";
import { urlPhoto, urlsPhotos } from "../../utils/photos";
import { grilleColisVinted } from "../../utils/vintedColis";
import { descriptionFidele, hashtagsServent } from "../moteur/descriptionFidele";
import { lirePoidsSaisi } from "./regles";
import {
  cheminRayon, texteRayon, plateformesDeLArticle, statutPlateforme, colisDe, detailsDe, rayonNeufDe,
  poidsAffiche, textePoids, poidsIncoherent,
} from "./ficheLue";

const ETATS_ARTICLE = ["Neuf avec étiquette", "Neuf sans étiquette", "Très bon état", "Bon état", "Satisfaisant"];
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
function Champ({ label, valeur, aRegler = false, action = null, ouvert = false, onToucher = null, children = null }) {
  return (
    <div className={`fsf-champ${aRegler ? " fsf-champ--regler" : ""}`}>
      <button type="button" className="fsf-champ-l" onClick={onToucher ?? undefined} disabled={!onToucher} aria-expanded={onToucher ? ouvert : undefined}>
        <span className="fsf-lb">{label}</span>
        <span className="fsf-val">{valeur}</span>
        {action ? <span className="fsf-act">{action}</span> : null}
      </button>
      {ouvert && children ? <div className="fsf-champ-corps">{children}</div> : null}
    </div>
  );
}

function ecrireDetail(m, d, v) {
  if (d.ebay) { m.noterReponseQuestion?.("ebay", d.ligne, v); m.setEbayAspect?.(d.cle, v); return; }
  m.noterReponseQuestion?.(d.gp, d.ligne, v);
  if (d.dedicatedTarget && m.setPlatformDedicatedField) m.setPlatformDedicatedField(d.gp, d.dedicatedTarget, v);
  else m.setPlatformAspect?.(d.gp, d.cle, v);
}

/** Les clés de questions du moteur qui appartiennent à une plateforme (« beebs:Taille », « ebay:Marque »…). */
function clesDeLaPlateforme(m, p) {
  return (m?.clesQuestions ?? []).filter((c) => c.startsWith(`${p}:`) || (p === "ebay" && c.startsWith("ebay:")));
}
/** Les clés communes (taille, couleur, matière, marque, genre, description, prix d'achat). */
function clesCommunes(m) {
  return (m?.clesQuestions ?? []).filter((c) => !/^(vinted|leboncoin|beebs|depop|ebay|opla):/.test(c) || c.startsWith("genre:"));
}

function SectionPlateforme({ m, p, en, poids, poserPoids, retirer, ecartee = null, remettre = null }) {
  const [ouvert, setOuvert] = useState(null); // « rayon » | « colis » | id d'un détail
  const basculer = (k) => setOuvert((o) => (o === k ? null : k));
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
  const details = detailsDe(m, p);
  // La ligne « neuf seulement » a son encadré (ses deux sorties) : jamais redite par le bloc de questions.
  const cles = clesDeLaPlateforme(m, p).filter((c) => !(neuf && c === `${p}:${neuf.ligne?.key}`));
  const carteRayon = (
    <CarteRayon platform={p} lang={m.lang} rayon={question ? null : rayon} question={question}
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
              }}>{en ? `Set the condition to “${v}”` : `Passer l'état en « ${v} »`}</button>
            ))}
            <button type="button" className="fsn-choice" onClick={() => setOuvert("rayon")}>{en ? "Change category" : "Changer de rayon"}</button>
          </div>
        </div>
      )}

      <Champ label={p === "depop" ? (en ? "Shipping" : "Port") : p === "ebay" ? (en ? "Delivery" : "Livraison") : (en ? "Parcel" : "Colis")}
        valeur={colis.libelle} aRegler={Boolean(colis.manquant)} action={en ? "Edit" : "Modifier"} ouvert={ouvert === "colis"}
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

      {cles.length > 0 && (
        <div className="fsf-questions">
          <BlocQuestions m={m} seulement={cles} puces />
        </div>
      )}

      {details.filter((d) => !cles.includes(d.id)).map((d) => (
        <Champ key={d.id} label={d.label} valeur={d.valeur || (en ? "To choose" : "À choisir")} aRegler={d.aRegler}
          action={null} ouvert={ouvert === d.id} onToucher={() => basculer(d.id)}>
          <ChoixDeValeur en={en} valeur={d.valeur} valeurs={d.allowedValues} onChoisir={(v) => { ecrireDetail(m, d, v); setOuvert(null); }} />
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
 * @param {boolean} [props.photoVide] la seule « photo » est une image de remplissage
 * @param {object} props.actions     { poserPoids(g), retirerPlateforme(p), remettrePlateforme(p), validerTexte() }
 */
export default function FicheArticle({ m, item = null, decision = {}, ecartees = [], photoVide = false, actions = {}, en = false, lecture = null }) {
  const fichier = useRef(null);
  const [ajout, setAjout] = useState(false);
  if (!m) return null;
  const general = m.generales ?? {};
  const pfs = plateformesDeLArticle(m);
  const premiere = pfs[0];
  const titre = String(general.titre || m.edited?.[premiere]?.title || item?.title || item?.titre || "");
  const description = String(general.description || m.edited?.[premiere]?.description || "");
  const etat = String(general.etat || m.etatArticle || "");
  const prix = m.price ?? item?.sell ?? "";
  const photos = (m.processedPhotos?.length ? m.processedPhotos : m.photos) ?? urlsPhotos(item?.photos);
  const poids = poidsAffiche(m, decision, item);
  const incoherent = poids ? poidsIncoherent(`${titre} ${m.edited?.[premiere]?.platform_fields?.categorie_objet_ia ?? ""}`, poids, en ? "en" : "fr") : null;
  const ecritParFillSell = !String(m.texteVendeur?.description ?? "").trim();
  // La MÊME fiche que celle du texte qui part (construireJobs) : ce qu'on montre est ce qui partira sur Vinted.
  const ficheTexte = { titre: m.initialListing?.titre ?? titre, marque: m.initialListing?.marque ?? "", ...(m.ficheDuTexte?.() ?? {}), etat };
  const montre = ecritParFillSell ? descriptionFidele(description, "vinted", { fiche: ficheTexte }) : description;
  const avecHashtags = /(^|\s)#[\p{L}\p{N}]/u.test(montre);
  const sansHashtags = pfs.filter((p) => !hashtagsServent(p));
  const lang = en ? "en" : "fr";
  const communes = clesCommunes(m);
  const ajouterPhotos = async (files) => {
    if (!files?.length || !m.handleAddMorePhotos) return;
    setAjout(true);
    try { await m.handleAddMorePhotos([...files]); } catch { /* le moteur garde son erreur */ }
    setAjout(false);
  };

  return (
    <div className="fsf">
      {photoVide && (
        <div className="fsf-alerte fsf-alerte--refus">
          <p><b>{en ? "No real photo." : "Aucune vraie photo."}</b> {en ? "The picture is the placeholder Beebs shows when a listing has none." : "L'image est celle que Beebs affiche quand l'annonce n'en a pas."}</p>
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
        <input ref={fichier} type="file" accept="image/*" multiple hidden onChange={(e) => { ajouterPhotos(e.target.files); e.target.value = ""; }} />
      </div>

      <div className="fsf-bloc">
        <div className="fsf-bloc-t"><span>{en ? "Title" : "Titre"}</span></div>
        <TexteQuiGrandit key={`titre-${titre}`} valeur={titre} lignesMin={1} aria-label={en ? "Title" : "Titre"}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
          onFini={(v) => m.poserValeurGenerale?.("titre", v.replace(/\s*\n+\s*/g, " "))} />
      </div>

      <div className="fsf-deux">
        <label className="fsf-mini">
          <small>{en ? "Price" : "Prix"}</small>
          <input className="fsn-input" type="number" inputMode="decimal" min="1" step="0.5" defaultValue={prix}
            key={`prix-${prix}`} aria-label={en ? "Selling price" : "Prix de vente"}
            onBlur={(e) => { if (String(e.target.value) !== String(prix)) m.poserPrixGeneral?.(e.target.value); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
        </label>
        <label className="fsf-mini">
          <small>{en ? "Condition" : "État"}</small>
          <select className="fsn-select" value={ETATS_ARTICLE.includes(etat) ? etat : ""} onChange={(e) => m.poserValeurGenerale?.("etat", e.target.value)}
            aria-label={en ? "Condition" : "État"}>
            {!ETATS_ARTICLE.includes(etat) ? <option value="">{etat || (en ? "To choose" : "À choisir")}</option> : null}
            {ETATS_ARTICLE.map((x) => <option key={x} value={x}>{en ? ETATS_EN[x] : x}</option>)}
          </select>
        </label>
      </div>

      <div className="fsf-bloc">
        <div className="fsf-bloc-t">
          <span>{en ? "Description" : "Description"}</span>
          {ecritParFillSell
            ? <span className="fsf-tag">{decision?.texteValide ? (en ? "Written by FillSell · approved" : "Écrite par FillSell · validée") : (en ? "Written by FillSell, check it" : "Écrite par FillSell, relis-la")}</span>
            : <span className="fsf-tag fsf-tag--toi">{en ? "Your text" : "Ton texte"}</span>}
        </div>
        <TexteQuiGrandit key={`desc-${montre.length}-${montre.slice(0, 40)}`} valeur={montre} lignesMin={4} aria-label={en ? "Description" : "Description"}
          onFini={(v) => m.poserValeurGenerale?.("description", v)} />
        {lecture?.note ? <p className="fsq-note">{phraseLecture(lecture.note, en)}</p> : null}
        {avecHashtags && sansHashtags.length > 0
          ? <p className="fsq-note">{en ? `Hashtags only go out on Vinted and Depop (5 at most there): ${sansHashtags.map(NOM).join(", ")} get the text without them.` : `Les hashtags ne partent que sur Vinted et Depop (5 au plus) : ${sansHashtags.map(NOM).join(", ")} reçoi${sansHashtags.length > 1 ? "vent" : "t"} le texte sans eux.`}</p>
          : null}
        {ecritParFillSell && !decision?.texteValide && actions.validerTexte ? (
          <div className="fsn-choices fsq-puces"><button type="button" className="fsn-choice" onClick={actions.validerTexte}>{en ? "The text is right" : "Le texte est bon"}</button></div>
        ) : null}
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

      {pfs.map((p) => (
        <SectionPlateforme key={p} m={m} p={p} en={en} poids={poids} poserPoids={actions.poserPoids}
          retirer={pfs.length > 1 ? actions.retirerPlateforme : null} />
      ))}
      {(ecartees ?? []).filter((e) => !pfs.includes(e.p)).map((e) => (
        <SectionPlateforme key={`ec-${e.p}`} m={m} p={e.p} en={en} ecartee={e} remettre={actions.remettrePlateforme} />
      ))}
    </div>
  );
}

function phraseLecture(note, en) {
  if (note === "redigee_sans_lecteur") return en ? "You chose to have FillSell write it from your photos and title." : "Tu as choisi de la faire rédiger par FillSell, d'après tes photos et ton titre.";
  if (note === "vinted_sans_extension") return en ? "Your Vinted description is read from your computer: this one was written from your photos." : "Ta description Vinted se lit depuis ton ordinateur : celle-ci a été écrite d'après tes photos.";
  if (note === "sans_description") return en ? "Your Vinted listing has no description: this one was written from your photos." : "Ton annonce Vinted n'a pas de description : celle-ci a été écrite d'après tes photos.";
  if (note === "vinted_echec" || note === "pont_mort") return en ? "Your Vinted description couldn't be read this time: this one was written from your photos." : "Ta description Vinted n'a pas pu être lue cette fois : celle-ci a été écrite d'après tes photos.";
  return "";
}
