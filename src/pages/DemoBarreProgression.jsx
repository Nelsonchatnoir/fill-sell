import { useCallback, useEffect, useRef, useState } from "react";
import useSeo from "../lib/seo";
import BarreProgression from "../components/BarreProgression";
import PlatformLogo from "../components/platform-logos/PlatformLogo";
import "./demo-barre-progression.css";

// ═══════════════════════════════════════════════════════════════════════════
// DÉMONSTRATION DE LA BARRE DE PROGRESSION — page NON LISTÉE (01/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// /demo/barre-progression — publique (aucune session, aucune donnée lue),
// noindex, liée de nulle part. Elle sert à faire VALIDER le composant par Nico
// avant de remplacer les barres de l'app. Chaque cas rejoue un déroulé écrit
// à la main : les « nouvelles » (étapes) arrivent à des instants fixés, la
// barre fait le reste. Durées accélérées.
// Rien ici n'écrit ni ne lit un job : c'est une maquette vivante.

const ico = (pf) => <PlatformLogo platform={pf} size={26} />;

// Étapes d'une publication par l'extension, pour une plateforme donnée.
const etapesPublication = (nom, d = 1) => [
  { cle: "prep", texte: "Préparation de ton annonce…", court: "Préparation…", duree: 1.5 * d },
  { cle: "ouverture", texte: `Ouverture de ${nom} dans ton Chrome…`, court: `Ouverture de ${nom}…`, duree: 2.5 * d },
  { cle: "photos", texte: `Envoi des 6 photos sur ${nom}…`, court: "Envoi des photos…", duree: 5 * d },
  { cle: "fiche", texte: `Remplissage de la fiche sur ${nom} : titre, taille, état, prix…`, court: "Remplissage de la fiche…", duree: 4 * d },
  { cle: "depot", texte: `Mise en ligne sur ${nom}…`, court: "Mise en ligne…", duree: 2.5 * d },
  { cle: "verif", texte: `Vérification que l'annonce est bien en ligne sur ${nom}…`, court: "Vérification…", duree: 2 * d },
];
const ETAPES_EBAY_API = [
  { cle: "envoi", texte: "Envoi à eBay depuis nos serveurs…", court: "Envoi depuis nos serveurs…", duree: 3 },
  { cle: "verif", texte: "Vérification que l'annonce est en ligne sur eBay…", court: "Vérification…", duree: 1.5 },
];

// Un déroulé de publication : [instant, étape] puis la fin.
const deroule = (piste, debut, instants, fin, etatFin = "termine", extra = {}) => [
  ...instants.map(([t, etape]) => ({ t: debut + t, piste, set: { etat: "en_cours", etape } })),
  { t: debut + fin, piste, set: { etat: etatFin, ...extra } },
];

const PISTES_4 = () => ({
  vinted: { cle: "vinted", libelle: "Vinted", icone: ico("vinted"), etapes: etapesPublication("Vinted", 0.6), etape: "prep", etat: "en_cours", phraseFin: "En ligne" },
  ebay: { cle: "ebay", libelle: "eBay", icone: ico("ebay"), etapes: ETAPES_EBAY_API, etape: "envoi", etat: "en_cours", phraseFin: "En ligne" },
  leboncoin: { cle: "leboncoin", libelle: "Leboncoin", icone: ico("leboncoin"), etapes: etapesPublication("Leboncoin", 0.6), etat: "attente", phraseAttente: "Passe après Vinted", phraseFin: "En ligne" },
  beebs: { cle: "beebs", libelle: "Beebs", icone: ico("beebs"), etapes: etapesPublication("Beebs", 0.6), etat: "attente", phraseAttente: "Passe après Leboncoin", phraseFin: "En ligne" },
});
const SCRIPT_4 = (beebsEchoue) => [
  ...deroule("vinted", 0, [[0.8, "ouverture"], [2.3, "photos"], [5.6, "fiche"], [8.0, "depot"], [9.4, "verif"]], 10.4),
  ...deroule("ebay", 0, [[3.4, "verif"]], 5.0),
  ...deroule("leboncoin", 10.4, [[0, "prep"], [0.6, "ouverture"], [2.0, "photos"], [5.2, "fiche"], [7.4, "depot"], [8.8, "verif"]], 9.8),
  ...(beebsEchoue
    ? deroule("beebs", 20.2, [[0, "prep"], [0.6, "ouverture"], [2.0, "photos"], [5.0, "fiche"]], 7.6, "echec")
    : deroule("beebs", 20.2, [[0, "prep"], [0.6, "ouverture"], [2.0, "photos"], [5.0, "fiche"], [7.2, "depot"], [8.6, "verif"]], 9.6)),
];

const CAS = [
  {
    id: "pub-1",
    nom: "Publication sur 1 plateforme",
    montre: "Une étape réelle = une plage de la barre. Entre deux nouvelles, la barre glisse dans la plage de l'étape en cours.",
    barre: { titre: "Publication sur Vinted", etapes: etapesPublication("Vinted"), phraseFin: "En ligne sur Vinted. Tu la retrouves dans ton Stock." },
    initial: { etape: "prep", etat: "en_cours" },
    script: [
      { t: 1.2, set: { etape: "ouverture" } }, { t: 4.4, set: { etape: "photos" } }, { t: 10.1, set: { etape: "fiche" } },
      { t: 13.5, set: { etape: "depot" } }, { t: 16.8, set: { etape: "verif" } }, { t: 18.6, set: { etat: "termine" } },
    ],
  },
  {
    id: "pub-4",
    nom: "Publication sur 4 plateformes",
    montre: "Une barre d'ensemble et une ligne par plateforme. eBay part de nos serveurs en même temps ; les autres passent l'une après l'autre dans Chrome.",
    multi: true,
    barre: { titre: "Publication sur 4 plateformes", phraseFin: "Publié sur Vinted, eBay, Leboncoin et Beebs." },
    initialPistes: PISTES_4,
    script: SCRIPT_4(false),
  },
  {
    id: "repub",
    nom: "Republication",
    montre: "Les vraies étapes de la republication. Chaque phrase dit ce qui est en sécurité. En dessous : la même barre, en version compacte, telle qu'elle apparaîtra sur une carte du Stock.",
    barre: {
      titre: "Republication sur Vinted",
      etapes: [
        { cle: "capture", texte: "Copie complète de ton annonce : photos, texte, prix…", court: "Copie de l'annonce…", duree: 4 },
        { cle: "retrait", texte: "Retrait de l'ancienne annonce — sa copie est en sécurité…", court: "Retrait de l'ancienne…", duree: 3 },
        { cle: "photos", texte: "Envoi des photos de la nouvelle annonce…", court: "Envoi des photos…", duree: 5 },
        { cle: "depot", texte: "Dépôt de la nouvelle annonce…", court: "Dépôt de la nouvelle…", duree: 3 },
        { cle: "verif", texte: "Vérification que la nouvelle annonce est en ligne…", court: "Vérification…", duree: 2 },
      ],
      phraseFin: "Ton annonce est de retour en tête sur Vinted.",
    },
    compacte: true,
    initial: { etape: "capture", etat: "en_cours" },
    script: [
      { t: 3.6, set: { etape: "retrait" } }, { t: 6.9, set: { etape: "photos" } }, { t: 12.4, set: { etape: "depot" } },
      { t: 15.1, set: { etape: "verif" } }, { t: 16.9, set: { etat: "termine" } },
    ],
  },
  {
    id: "retrait",
    nom: "Retrait",
    montre: "L'article est vendu sur Vinted : on le retire de Leboncoin, étape par étape.",
    barre: {
      titre: "Retrait de Leboncoin",
      etapes: [
        { cle: "ouverture", texte: "Ouverture de Leboncoin dans ton Chrome…", duree: 2 },
        { cle: "recherche", texte: "Recherche de l'annonce n° 2734519862 dans ton compte…", duree: 3 },
        { cle: "suppression", texte: "Suppression de l'annonce…", duree: 2 },
        { cle: "verif", texte: "Vérification qu'elle n'est plus visible…", duree: 2 },
      ],
      phraseFin: "Retirée de Leboncoin : l'article vendu sur Vinted n'y est plus proposé.",
    },
    initial: { etape: "ouverture", etat: "en_cours" },
    script: [
      { t: 1.7, set: { etape: "recherche" } }, { t: 5.1, set: { etape: "suppression" } },
      { t: 7.0, set: { etape: "verif" } }, { t: 9.2, set: { etat: "termine" } },
    ],
  },
  {
    id: "releve",
    nom: "Relevé (synchronisation)",
    montre: "Quand on connaît le vrai compte (« 19 sur 48 »), la barre se pose dessus et glisse vers le compte suivant, sans jamais le dépasser.",
    barre: { titre: "Relevé de ta boutique Vinted", phraseFin: "48 annonces relevées : 2 nouvelles ajoutées à ton Stock, 1 vente repérée." },
    initial: { fraction: 0, pas: 0.05, dureePas: 1.8, phrase: "Ouverture de ta boutique Vinted…", etat: "en_cours" },
    script: [
      ...[0, 6, 13, 19, 26, 31, 38, 44, 48].map((n, i) => ({
        t: 1.8 + i * 1.4,
        set: { fraction: 0.9 * n / 48, pas: 0.9 * 7 / 48, dureePas: 1.4, phrase: `Lecture de tes annonces : ${n} sur 48…` },
      })),
      { t: 1.8 + 9 * 1.4, set: { fraction: 0.9, pas: 0.1, dureePas: 2, phrase: "Comparaison avec ton Stock…" } },
      { t: 1.8 + 9 * 1.4 + 2.2, set: { etat: "termine" } },
    ],
  },
  {
    id: "generation",
    nom: "Génération d'annonce",
    montre: "La rédaction par l'IA : la barre avance pendant qu'elle travaille, 100 % seulement quand l'annonce est là.",
    barre: {
      titre: "Génération de ton annonce",
      etapes: [
        { cle: "envoi", texte: "Envoi de tes 4 photos…", duree: 1.5 },
        { cle: "lecture", texte: "Lecture des photos : marque, matière, état…", duree: 3 },
        { cle: "redaction", texte: "Rédaction du titre et de la description…", duree: 4 },
        { cle: "prix", texte: "Choix de la catégorie et du prix conseillé…", duree: 2.5 },
      ],
      phraseFin: "Annonce prête : relis-la avant de publier.",
    },
    initial: { etape: "envoi", etat: "en_cours" },
    script: [
      { t: 1.3, set: { etape: "lecture" } }, { t: 4.8, set: { etape: "redaction" } },
      { t: 9.1, set: { etape: "prix" } }, { t: 11.2, set: { etat: "termine" } },
    ],
  },
  {
    id: "lens",
    nom: "Scan Lens",
    montre: "Une photo, une recherche, une comparaison de prix — et le résultat.",
    barre: {
      titre: "Scan Lens",
      etapes: [
        { cle: "envoi", texte: "Envoi de la photo…", duree: 1 },
        { cle: "recherche", texte: "Recherche de l'article sur le web…", duree: 4 },
        { cle: "marche", texte: "Comparaison avec les prix de revente…", duree: 3 },
      ],
      phraseFin: "Article reconnu : Nike Air Max 90 — revendu entre 45 et 60 €.",
    },
    initial: { etape: "envoi", etat: "en_cours" },
    script: [{ t: 0.9, set: { etape: "recherche" } }, { t: 5.6, set: { etape: "marche" } }, { t: 8.4, set: { etat: "termine" } }],
  },
  {
    id: "fin",
    nom: "Fin réussie",
    montre: "La fin : la barre glisse en douceur jusqu'à 100 %, puis « Terminé » et la coche. Jamais avant.",
    barre: {
      titre: "Retouche photo",
      etapes: [
        { cle: "p1", texte: "Retouche de la photo 1 sur 3…", duree: 2.5 },
        { cle: "p2", texte: "Retouche de la photo 2 sur 3…", duree: 2.5 },
        { cle: "p3", texte: "Retouche de la photo 3 sur 3…", duree: 2.5 },
      ],
      phraseFin: "3 photos retouchées. Les originales sont gardées.",
    },
    initial: { etape: "p1", etat: "en_cours" },
    script: [{ t: 2.3, set: { etape: "p2" } }, { t: 4.9, set: { etape: "p3" } }, { t: 7.2, set: { etat: "termine" } }],
  },
  {
    id: "echec",
    nom: "Échec",
    montre: "La barre s'arrête net là où elle est, change de couleur, et une phrase dit ce qui bloque et quoi faire. Orange = un geste à faire ; rouge = notre faute.",
    variantes: [
      { cle: "action", libelle: "Un geste à faire", ton: "action", phraseEchec: "Leboncoin ne reconnaît pas la commune « Saint-Julien ». Choisis la bonne commune, puis relance la publication.", action: "Choisir la commune" },
      { cle: "erreur", libelle: "Erreur de notre côté", ton: "erreur", phraseEchec: "La publication s'est arrêtée de notre côté. Rien n'a été mis en ligne sur Leboncoin.", action: "Relancer" },
    ],
    barre: {
      titre: "Publication sur Leboncoin",
      etapes: [
        { cle: "ouverture", texte: "Ouverture de Leboncoin dans ton Chrome…", duree: 1.5 },
        { cle: "photos", texte: "Envoi des 6 photos sur Leboncoin…", duree: 3 },
        { cle: "adresse", texte: "Saisie de l'adresse sur Leboncoin…", duree: 2.5 },
        { cle: "fiche", texte: "Remplissage de la fiche…", duree: 3 },
        { cle: "depot", texte: "Mise en ligne sur Leboncoin…", duree: 2 },
      ],
    },
    initial: { etape: "ouverture", etat: "en_cours" },
    script: [{ t: 1.4, set: { etape: "photos" } }, { t: 4.6, set: { etape: "adresse" } }, { t: 8.2, set: { etat: "echec" } }],
  },
  {
    id: "partiel",
    nom: "Échec sur 1 plateforme sur 4",
    montre: "Trois plateformes réussissent, Beebs bloque : la barre ne dit jamais « Terminé ». Elle dit « 3 sur 4 » et la ligne qui bloque dit pourquoi.",
    multi: true,
    barre: {
      titre: "Publication sur 4 plateformes",
      phrasePartielle: "En ligne sur 3 plateformes sur 4. Beebs attend ta réponse.",
      action: "Choisir la taille",
    },
    initialPistes: () => {
      const p = PISTES_4();
      p.beebs = { ...p.beebs, phraseEchec: "Beebs ne propose pas la taille « 8XL » : choisis-la dans la liste." };
      return p;
    },
    script: SCRIPT_4(true),
  },
  {
    id: "longue",
    nom: "Attente longue",
    montre: "L'envoi des photos traîne (40 s au lieu de 5) : la barre continue d'avancer, de plus en plus lentement, et une phrase rassure. Elle ne s'arrête jamais net.",
    barre: {
      titre: "Publication sur Beebs",
      etapes: etapesPublication("Beebs").map((e) => e.cle === "photos"
        ? { ...e, texteLong: "Beebs met plus de temps que d'habitude à recevoir les photos. On continue, rien à faire de ton côté." }
        : e),
      phraseFin: "En ligne sur Beebs.",
    },
    initial: { etape: "prep", etat: "en_cours" },
    script: [
      { t: 1.2, set: { etape: "ouverture" } }, { t: 3.6, set: { etape: "photos" } }, { t: 43.6, set: { etape: "fiche" } },
      { t: 47.1, set: { etape: "depot" } }, { t: 49.4, set: { etape: "verif" } }, { t: 51.0, set: { etat: "termine" } },
    ],
  },
  {
    id: "pause",
    nom: "En pause, puis reprise",
    montre: "Chrome se ferme en pleine publication : la barre s'immobilise et dit pourquoi — jamais figée sans explication. À la réouverture, elle repart d'où elle était.",
    barre: {
      titre: "Publication sur Vinted",
      etapes: etapesPublication("Vinted"),
      phrasePause: "En pause : Chrome est fermé sur ton ordinateur. La publication reprend toute seule dès qu'il se rouvre.",
      phraseFin: "En ligne sur Vinted.",
    },
    initial: { etape: "prep", etat: "en_cours" },
    script: [
      { t: 1.2, set: { etape: "ouverture" } }, { t: 3.8, set: { etape: "photos" } }, { t: 6.5, set: { etat: "pause" } },
      { t: 12.0, set: { etat: "en_cours" } }, { t: 14.6, set: { etape: "fiche" } }, { t: 17.6, set: { etape: "depot" } },
      { t: 19.6, set: { etape: "verif" } }, { t: 21.0, set: { etat: "termine" } },
    ],
  },
];

const TERMINAUX = ["termine", "echec"];
function estFini(sc, vals) {
  if (!sc.multi) return TERMINAUX.includes(vals.etat);
  const etats = Object.values(vals.pistes).map((p) => p.etat);
  return etats.every((e) => TERMINAUX.includes(e));
}
const initialDe = (sc) => (sc.multi ? { pistes: sc.initialPistes() } : { ...sc.initial });
function appliquer(vals, ev) {
  if (!ev.piste) return { ...vals, ...ev.set };
  return { ...vals, pistes: { ...vals.pistes, [ev.piste]: { ...vals.pistes[ev.piste], ...ev.set } } };
}
const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function Cas({ sc, numero, reduit }) {
  const [vals, setVals] = useState(() => initialDe(sc));
  const [tour, setTour] = useState(0);            // 0 = pas encore joué
  const [debut, setDebut] = useState(0);
  const [derniere, setDerniere] = useState(0);
  const [nouvelles, setNouvelles] = useState(0);
  const [maintenant, setMaintenant] = useState(0);
  const [variante, setVariante] = useState(sc.variantes?.[0]?.cle ?? null);
  const minuteurs = useRef([]);
  const racine = useRef(null);

  const jouer = useCallback(() => {
    minuteurs.current.forEach(clearTimeout);
    minuteurs.current = [];
    const t0 = Date.now();
    setVals(initialDe(sc));
    setTour((n) => n + 1);
    setDebut(t0); setDerniere(t0); setMaintenant(t0); setNouvelles(0);
    for (const ev of sc.script) {
      minuteurs.current.push(setTimeout(() => {
        setVals((v) => appliquer(v, ev));
        setDerniere(Date.now());
        setNouvelles((n) => n + 1);
      }, ev.t * 1000));
    }
  }, [sc]);

  // Démarre la première fois que la carte est à l'écran.
  useEffect(() => {
    const el = racine.current;
    if (!el || typeof IntersectionObserver === "undefined") { const id = setTimeout(jouer, 0); return () => clearTimeout(id); }
    let fait = false;
    const io = new IntersectionObserver((entrees) => {
      if (!fait && entrees.some((e) => e.isIntersecting)) { fait = true; io.disconnect(); jouer(); }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [jouer]);
  useEffect(() => { const liste = minuteurs; return () => liste.current.forEach(clearTimeout); }, []);

  const fini = tour > 0 && estFini(sc, vals);
  useEffect(() => {
    if (!tour || fini) return undefined;
    const id = setInterval(() => setMaintenant(Date.now()), 250);
    return () => clearInterval(id);
  }, [tour, fini]);

  const v = sc.variantes?.find((x) => x.cle === variante) ?? null;
  const commun = {
    ...sc.barre,
    ...(v ? { ton: v.ton, phraseEchec: v.phraseEchec } : {}),
    action: (v?.action ?? sc.barre.action) ? { libelle: v?.action ?? sc.barre.action, onClick: () => {} } : undefined,
    animationsReduites: reduit ? true : undefined,
  };
  const props = sc.multi
    ? { ...commun, pistes: Object.values(vals.pistes) }
    : { ...commun, ...vals };

  return (
    <section className="dbp-cas" ref={racine}>
      <header className="dbp-cas-tete">
        <span className="dbp-num">{numero}</span>
        <div>
          <h2>{sc.nom}</h2>
          <p>{sc.montre}</p>
        </div>
      </header>
      {sc.variantes && (
        <div className="dbp-variantes" role="group" aria-label="Variante">
          {sc.variantes.map((x) => (
            <button key={x.cle} type="button" className={x.cle === variante ? "on" : ""} aria-pressed={x.cle === variante}
              onClick={() => { setVariante(x.cle); jouer(); }}>{x.libelle}</button>
          ))}
        </div>
      )}
      <div className="dbp-ecran">
        {tour > 0 ? <BarreProgression key={tour} {...props} /> : <div className="dbp-attente">La démonstration démarre quand la carte est à l'écran.</div>}
        {sc.compacte && tour > 0 && (
          <div className="dbp-carte-stock">
            <div className="dbp-carte-photo" aria-hidden="true" />
            <div className="dbp-carte-corps">
              <div className="dbp-carte-titre">Robe Sézane Gaby, taille 38</div>
              <div className="dbp-carte-prix">42 €</div>
              <BarreProgression key={`c${tour}`} {...props} titre={undefined} compact />
            </div>
          </div>
        )}
      </div>
      <footer className="dbp-cas-pied">
        <span className="dbp-chrono">
          {tour > 0 ? (
            <>
              <b>{mmss(maintenant - debut)}</b>
              {fini
                ? <> · {nouvelles} nouvelle{nouvelles > 1 ? "s" : ""} reçue{nouvelles > 1 ? "s" : ""}</>
                : <> · dernière nouvelle il y a {Math.max(0, Math.floor((maintenant - derniere) / 1000))} s</>}
            </>
          ) : "—"}
        </span>
        <button type="button" className="dbp-rejouer" onClick={jouer}>Rejouer</button>
      </footer>
    </section>
  );
}

export default function DemoBarreProgression() {
  useSeo({ path: "/demo/barre-progression", title: "Barre de progression — démonstration", robots: "noindex, nofollow" });
  const [tout, setTout] = useState(0);
  const [reduit, setReduit] = useState(false);
  return (
    <main className="dbp">
      <div className="dbp-col">
        <p className="dbp-sur">FillSell · démonstration non listée</p>
        <h1>La nouvelle barre de progression</h1>
        <p className="dbp-intro">
          Une seule barre pour toute l'app — publication, republication, retrait, relevé, génération d'annonce, Lens, retouche photo.
          Elle bouge dès la première seconde, glisse en continu dans l'étape en cours, ralentit sans jamais s'arrêter quand une
          étape traîne, et n'atteint 100&nbsp;% qu'à la vraie fin.
        </p>
        <ul className="dbp-regles">
          <li><b>Tout de suite :</b> un premier mouvement visible dans la seconde.</li>
          <li><b>Les vraies étapes :</b> chacune occupe une plage ; la barre glisse dedans en attendant la suivante.</li>
          <li><b>Sans nouvelle :</b> elle avance de plus en plus doucement, sans s'arrêter net, sans jamais toucher 100&nbsp;%.</li>
          <li><b>La fin :</b> 100&nbsp;% et « Terminé » seulement quand c'est vraiment fini. Un échec l'arrête et dit pourquoi.</li>
          <li><b>Légère :</b> une seule boucle d'animation pour toutes les barres, coupée dès que rien ne bouge.</li>
        </ul>
        <div className="dbp-commandes">
          <button type="button" className="dbp-tout" onClick={() => setTout((n) => n + 1)}>Tout rejouer</button>
          <label className="dbp-interrupteur">
            <input type="checkbox" checked={reduit} onChange={(e) => setReduit(e.target.checked)} />
            <span>Réglage « réduire les animations »</span>
          </label>
        </div>
        <p className="dbp-note">Durées accélérées pour la démonstration : une vraie publication prend une à trois minutes. Les étapes arrivent à des instants fixés ; la barre fait le reste.</p>
      </div>
      <div className="dbp-grille">
        {CAS.map((sc, i) => <Cas key={`${sc.id}-${tout}`} sc={sc} numero={i + 1} reduit={reduit} />)}
      </div>
    </main>
  );
}
