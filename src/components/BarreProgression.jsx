import { useEffect, useLayoutEffect, useState } from "react";
import { Check, AlertCircle, Pause, Clock, ChevronRight, Image as IconeImage } from "lucide-react";
import "./BarreProgression.css";
import GalleryPhoto from "./GalleryPhoto";
import {
  plagesDe, plageFraction, plageAncree, valeurDansPlage, attenteLongue, lisser,
  etatGlobal, etatNormalise, moyenne, pourcentageEcrit, VITESSE_FIN,
} from "../utils/progression";

// ═══════════════════════════════════════════════════════════════════════════
// LA BARRE DE PROGRESSION — un seul composant pour toute l'app (01/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Publication, republication, retrait, génération d'annonce, Lens, retouche
// photo : la même barre partout (validée par Nico sur /demo/barre-progression).
// Le calcul vit dans utils/progression.js (npm run selftest:progression) ; les
// étapes RÉELLES d'un job se lisent dans utils/barresJobs.js ; ici, rien que
// l'affichage. ⛔ Les relevés et la synchronisation n'en font PAS partie : ils
// ont leur propre chargement, conçu exprès.
//
// Ce que la barre garantit :
//   · elle bouge dans la seconde qui suit son apparition ;
//   · elle glisse en continu dans la plage de l'étape réelle en cours, de plus
//     en plus lentement, sans jamais s'arrêter net ni atteindre 100 % ;
//   · 100 % et « Terminé » seulement sur etat="termine" ; un échec l'arrête là
//     où elle est, avec la phrase qui dit ce qui bloque ;
//   · AFFICHAGE PUR : elle ne lit ni n'écrit aucun job.
//
// Coût : UNE boucle requestAnimationFrame partagée par toutes les barres de
// l'écran, arrêtée dès que plus rien ne bouge. Chaque image écrit deux
// transformations (composées par la carte graphique, sans recalcul de mise en
// page) et le pourcentage seulement quand le chiffre change : aucun rendu
// React par image.
// « Réduire les animations » (réglage du téléphone, ou prop
// animationsReduites) : plus de reflet ni de glissement — la barre se met à
// jour une fois par seconde, sans transition, et reste lisible.
//
// Usage — une opération :
//   <BarreProgression article={{ photo, titre, sousTitre: "12,50 € · Publication sur Vinted" }}
//     etapes={[{ cle: "depot", texte: "Dépôt en cours sur Vinted…", court: "Dépôt…", duree: 60 }, …]}
//     etape="depot" etat="en_cours" depuis={processingSince} phraseFin="En ligne sur Vinted."
//     onOuvrir={ouvrirLaFile} />
// Avancement connu : fraction={12/48} pas={5/48} dureePas={4} phrase="12 sur 48…"
// Plusieurs plateformes : pistes={[{ cle, libelle, icone, etapes, etape, etat, ton, detail, geste, … }]}
//   (barre d'ensemble = moyenne des pistes ; « Terminé » seulement si TOUTES
//   ont réussi, sinon « 3 sur 4 » et la ligne qui bloque).
// États : en_cours | attente (pas encore son tour) | pause (rien ne peut
// bouger, dit pourquoi) | termine | echec. Échec : ton="action" (orange, un
// geste à faire), "erreur" (rouge, notre faute) ou "neutre" (gris : annulée,
// rien à faire) — la règle des couleurs de l'app (src/AGENTS.md § 5).
// `article` (la carte d'identité de l'article : photo, titre coupé proprement,
// sous-titre) s'affiche en tête de la grande barre ; la compacte vit sur une
// carte qui la porte déjà. `onOuvrir` rend la barre touchable : elle ouvre la
// file complète des jobs (FileDesJobs).

// ── Boucle d'animation partagée ─────────────────────────────────────────────
const abonnes = new Set();
let raf = 0;
function boucle(t) {
  raf = 0;
  for (const f of [...abonnes]) f(t);
  if (abonnes.size) raf = requestAnimationFrame(boucle);
}
function abonner(f) {
  abonnes.add(f);
  if (!raf) raf = requestAnimationFrame(boucle);
  return () => {
    abonnes.delete(f);
    if (!abonnes.size && raf) { cancelAnimationFrame(raf); raf = 0; }
  };
}

const REQUETE_REDUITE = "(prefers-reduced-motion: reduce)";
function useAnimationsReduitesSysteme() {
  const [reduit, setReduit] = useState(() => {
    try { return Boolean(window.matchMedia?.(REQUETE_REDUITE).matches); } catch { return false; }
  });
  useEffect(() => {
    let mq;
    try { mq = window.matchMedia?.(REQUETE_REDUITE); } catch { mq = null; }
    if (!mq?.addEventListener) return undefined;
    const f = () => setReduit(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return reduit;
}

const TEXTES = {
  fr: {
    termine: "Terminé", arretee: "Arrêtée", annulee: "Annulée", pause: "En pause", attente: "En file",
    surN: (a, n) => `${a} sur ${n}`,
    longue: "Ça prend plus de temps que d'habitude. On continue, rien à faire de ton côté.",
    ligneAttente: "En attente de son tour",
    voirFile: "Toute la file", ouvrirFile: "Ouvrir la file complète",
  },
  en: {
    termine: "Done", arretee: "Stopped", annulee: "Cancelled", pause: "Paused", attente: "Queued",
    surN: (a, n) => `${a} of ${n}`,
    longue: "This is taking longer than usual. We're still on it — nothing to do on your side.",
    ligneAttente: "Waiting for its turn",
    voirFile: "Whole queue", ouvrirFile: "Open the whole queue",
  },
};
const ESPACE_FINE = " ";
const ecrirePct = (n) => `${n}${ESPACE_FINE}%`;

// Gravité d'un échec, du plus doux au plus grave : la barre d'ensemble prend
// la couleur de la plus grave de ses lignes arrêtées.
const TONS = ["neutre", "action", "erreur"];
const tonNormalise = (t) => (TONS.includes(t) ? t : "action");
const plusGrave = (a, b) => (TONS.indexOf(tonNormalise(a)) >= TONS.indexOf(tonNormalise(b)) ? tonNormalise(a) : tonNormalise(b));

// Une opération seule = une piste ; plusieurs plateformes = plusieurs pistes.
function pistesDe(props) {
  if (Array.isArray(props.pistes) && props.pistes.length) return props.pistes;
  return [{
    cle: "_", etapes: props.etapes, etape: props.etape, fraction: props.fraction,
    pas: props.pas, dureePas: props.dureePas, etat: props.etat, depuis: props.depuis, ton: props.ton,
  }];
}

function plageDe(p) {
  if (p.fraction != null) return plageFraction(p.fraction, p.pas, p.dureePas);
  const plages = plagesDe(p.etapes);
  return plages.find((x) => x.cle === p.etape) ?? null;
}
const etapeDe = (p) => (Array.isArray(p.etapes) ? p.etapes.find((e) => e?.cle === p.etape) : null) ?? null;
const signatureDe = (p) => `${etatNormalise(p.etat)}|${p.fraction ?? p.etape ?? ""}|${p.pas ?? ""}`;

// Anneau d'une ligne de plateforme (piste en cours).
const RAYON = 7;
const TOUR = 2 * Math.PI * RAYON;

// La vignette de l'article : la première photo de la fiche, rognée au carré
// quel que soit son format ; sans photo (ou URL morte), une tuile neutre —
// jamais un cadre vide ni une image cassée.
function Vignette({ photo }) {
  const repli = <span className="fsb-vignette-repli"><IconeImage size={18} strokeWidth={1.8} /></span>;
  return (
    <span className="fsb-vignette" aria-hidden="true">
      {photo ? <GalleryPhoto url={photo} alt="" fallback={repli} /> : repli}
    </span>
  );
}

// ── Le moteur d'une barre (hors React) ──────────────────────────────────────
// Un objet par barre, créé une fois. React lui passe les props à chaque rendu
// (maj) ; lui écrit le DOM image par image et ne prévient React qu'aux deux
// moments qui changent le texte : l'arrivée à 100 % et l'attente longue.
class MoteurBarre {
  constructor(surArrivee, surLongues) {
    this.pistes = new Map();       // cle → { sig, plage, depart, debut, visee, affichee, etat }
    this.cles = [];
    this.global = "en_cours";
    this.reduit = false;
    this.dernier = 0;
    this.pct = -1;
    this.actif = null;
    this.cleLongues = "";
    this.arrivee = false;
    this.surArrivee = surArrivee;
    this.surLongues = surLongues;
    this.el = { racine: null, rempli: null, reflets: null, pct: null };
    this.anneaux = new Map();
    this.ecrite = -1;
    this.elementsNeufs = true;
  }

  // Branchement des éléments du DOM (appelé par les ref de React, au commit).
  attacher(nom, el) {
    if (el && this.el[nom] !== el && (nom === "rempli" || nom === "reflets")) this.elementsNeufs = true;
    this.el[nom] = el;
    // Le pourcentage, réécrit dès que son élément (re)paraît.
    if (nom === "pct" && el) el.textContent = ecrirePct(Math.max(0, this.pct));
  }
  attacherAnneau(cle, el) {
    if (el) this.anneaux.set(cle, el); else this.anneaux.delete(cle);
    const r = this.pistes.get(cle);
    if (el && r) el.style.strokeDashoffset = String(TOUR * (1 - r.affichee / 100));
  }

  // Ancrage à chaque nouvelle (étape, état, fraction) : la piste repart de la
  // valeur qu'elle a atteinte — jamais de recul. Sans nouvelle, ne fait rien.
  maj(pistes, global, reduit) {
    this.cles = pistes.map((p) => p.cle);
    const changementMode = this.reduit !== reduit;
    const changementGlobal = this.global !== global;
    this.reduit = reduit;
    this.global = global;
    if (changementMode) this.arreter();
    const maintenant = performance.now();
    let change = changementMode || changementGlobal;
    for (const p of pistes) {
      let r = this.pistes.get(p.cle);
      const neuve = !r;
      if (!r) {
        r = { sig: null, plage: null, depart: 0, debut: maintenant, visee: 0, affichee: 0, etat: "attente" };
        this.pistes.set(p.cle, r);
      }
      const sig = signatureDe(p);
      if (r.sig === sig) continue;
      change = true;
      if (r.etat === "en_cours" && r.plage) r.visee = Math.max(r.visee, valeurDansPlage(r.plage, r.depart, r.debut, maintenant));
      const etat = etatNormalise(p.etat);
      if (etat === "echec") r.visee = r.affichee;   // s'arrête là où on la voit
      r.depart = r.visee;
      r.plage = plageAncree(plageDe(p), r.depart);
      // Arrêtée sur une étape atteinte (affichée pour la première fois, ou
      // arrivée d'un coup) : la barre montre au moins ce qui était acquis.
      if (etat === "echec" && r.plage) r.visee = Math.max(r.visee, r.plage.debut);
      // Une piste qui attend (pause, en file) montre au moins ce qui est
      // ACQUIS : le début de son étape (« 1 sur 3 » faits, étapes passées) —
      // jamais une barre vide sur un travail commencé.
      if ((etat === "pause" || etat === "attente") && r.plage) r.visee = Math.max(r.visee, r.plage.debut);
      // `depuis` (horodatage, ms) : une étape commencée avant l'affichage de
      // la barre (onglet rouvert, poll) reprend où elle en est.
      const depuis = neuve && Number(p.depuis) > 0 ? Math.max(0, Date.now() - Number(p.depuis)) : 0;
      r.debut = maintenant - depuis;
      r.etat = etat;
      r.sig = sig;
    }
    // Un élément du DOM neuf (remonté par React) doit recevoir la valeur tout
    // de suite, même si rien d'autre n'a changé.
    if (change || this.elementsNeufs) this.reprendre(maintenant);
  }

  // Une image tout de suite (le DOM est juste avant d'être peint), puis la
  // boucle — qui s'arrête d'elle-même quand plus rien ne bouge. Boucle à
  // l'arrêt : le lissage repart de cet instant (pas de bond rattrapant le
  // temps où rien ne tournait).
  reprendre(maintenant = performance.now()) {
    if (!this.actif) this.dernier = maintenant;
    if (this.image(maintenant)) this.demarrer();
  }

  // Une image : calcule, écrit le DOM, dit s'il faut continuer.
  image(maintenant) {
    const dt = this.dernier ? Math.min(100, maintenant - this.dernier) : 16;
    this.dernier = maintenant;
    let actif = false;
    const valeurs = [];
    const longues = [];
    for (const cle of this.cles) {
      const r = this.pistes.get(cle);
      if (!r) continue;
      if (r.etat === "en_cours" && r.plage) {
        r.visee = Math.max(r.visee, valeurDansPlage(r.plage, r.depart, r.debut, maintenant));
        actif = true;
        if (attenteLongue(r.plage, r.debut, maintenant)) longues.push(cle);
      } else if (r.etat === "termine") {
        r.visee = 100;
      }
      r.affichee = this.reduit
        ? Math.max(r.affichee, r.visee)
        : (r.etat === "termine" ? lisser(r.affichee, r.visee, dt, 0.18, VITESSE_FIN) : lisser(r.affichee, r.visee, dt, 0.3));
      if (r.affichee < r.visee) actif = true;
      valeurs.push(r.affichee);
      const anneau = this.anneaux.get(cle);
      if (anneau) anneau.style.strokeDashoffset = String(TOUR * (1 - r.affichee / 100));
    }
    const v = moyenne(valeurs);
    const fini = this.global === "termine" && v >= 100;
    const { rempli, reflets, pct, racine } = this.el;
    // On n'écrit que ce qui se VOIT : sous 0,02 % d'écart (moins d'un dixième
    // de pixel), rien ne change à l'écran — un Stock plein de barres en file
    // qui avancent à peine ne touche pas au DOM à chaque image.
    if (Math.abs(v - this.ecrite) >= 0.02 || (v >= 100 && this.ecrite < 100) || this.elementsNeufs) {
      this.ecrite = v;
      this.elementsNeufs = false;
      if (rempli) rempli.style.transform = `translateX(${(v - 100).toFixed(3)}%)`;
      if (reflets) reflets.style.transform = `scaleX(${(v / 100).toFixed(4)})`;
    }
    const n = pourcentageEcrit(v, fini);
    if (n !== this.pct) {
      this.pct = n;
      if (pct) pct.textContent = ecrirePct(n);
      if (racine) racine.setAttribute("aria-valuenow", String(n));
    }
    const cleLongues = longues.join("|");
    if (cleLongues !== this.cleLongues) { this.cleLongues = cleLongues; this.surLongues(new Set(longues)); }
    if (fini !== this.arrivee) { this.arrivee = fini; this.surArrivee(fini); }
    return actif;
  }

  demarrer() {
    if (this.actif) return;
    if (this.reduit) {
      // Réduire les animations : une mise à jour par seconde, sans lissage.
      const id = setInterval(() => { if (!this.image(performance.now())) this.arreter(); }, 1000);
      this.actif = () => clearInterval(id);
    } else {
      this.actif = abonner((tps) => { if (!this.image(tps)) this.arreter(); });
    }
  }

  arreter() {
    if (this.actif) { this.actif(); this.actif = null; }
  }
}


export default function BarreProgression(props) {
  const {
    titre, article, phrase, phraseFin, phraseEchec, phrasePause, phraseAttente, phrasePartielle,
    ton = "action", action, compact = false, lang = "fr", animationsReduites, className = "",
    onOuvrir, libelleOuvrir, seulePiste = false, ariaLabel, onFini,
  } = props;
  const t = TEXTES[lang === "en" ? "en" : "fr"];
  const reduitSysteme = useAnimationsReduitesSysteme();
  const reduit = animationsReduites ?? reduitSysteme;

  const pistes = pistesDe(props);
  const multi = pistes.length > 1;
  const etats = pistes.map((p) => etatNormalise(p.etat));
  const global = etatGlobal(etats);

  // État React : ne change qu'aux moments qui comptent (arrivée à 100 %,
  // bascule en attente longue) — jamais à chaque image.
  const [arrivee, setArrivee] = useState(false);
  const [longues, setLongues] = useState(() => new Set());
  const [moteur] = useState(() => new MoteurBarre(setArrivee, setLongues));

  // À chaque rendu : le moteur compare les signatures et ne réancre que ce
  // qui a VRAIMENT changé (les pistes arrivent en objets neufs à chaque rendu
  // du parent). Avant la peinture, pour qu'aucune image fausse ne s'affiche.
  useLayoutEffect(() => { moteur.maj(pistes, global, reduit); });
  // Montage (et remontage : React en mode strict démonte puis remonte chaque
  // composant en développement) : la boucle repart ; démontage : elle s'arrête.
  useEffect(() => {
    moteur.reprendre();
    return () => moteur.arreter();
  }, [moteur]);

  // ── Ce qui se lit ─────────────────────────────────────────────────────────
  const fini = global === "termine" && arrivee;
  // onFini : prévenu un court instant APRÈS la coche, pour qu'un écran qui
  // enchaîne (la rédaction terminée) laisse voir la fin.
  useEffect(() => {
    if (!fini || typeof onFini !== "function") return undefined;
    const t = setTimeout(() => onFini(), reduit ? 0 : 650);
    return () => clearTimeout(t);
  }, [fini, onFini, reduit]);
  const active = pistes.find((p) => etatNormalise(p.etat) === "en_cours") ?? null;
  const etapeActive = active ? etapeDe(active) : null;
  const nOk = etats.filter((e) => e === "termine").length;
  const enPanne = pistes.find((p) => etatNormalise(p.etat) === "echec") ?? null;
  const enPause = pistes.find((p) => etatNormalise(p.etat) === "pause") ?? null;
  const enFile = pistes.find((p) => etatNormalise(p.etat) === "attente") ?? null;
  // La couleur d'un arrêt : celle de la piste (ou de la plus grave des pistes
  // arrêtées) — une ligne annulée ne repeint pas en orange tout l'ensemble.
  const tonAffiche = multi
    ? pistes.filter((p) => etatNormalise(p.etat) === "echec").reduce((acc, p) => plusGrave(acc, p.ton), "neutre")
    : tonNormalise(ton);

  let texte;
  let sousTexte = null;
  // Fini : la phrase de fin tout de suite ; le badge « Terminé » attend que la
  // barre ait fini de glisser jusqu'à 100 %.
  if (global === "termine") texte = phraseFin ?? t.termine;
  else if (global === "echec") texte = phraseEchec ?? enPanne?.phraseEchec ?? t.arretee;
  else if (global === "partiel") texte = phrasePartielle ?? phraseEchec ?? enPanne?.phraseEchec ?? t.arretee;
  else if (global === "pause") texte = phrasePause ?? enPause?.phrasePause ?? t.pause;
  else if (global === "attente") texte = phraseAttente ?? enFile?.phraseAttente ?? t.attente;
  else {
    // Compacte (carte du Stock) : la forme courte de l'étape quand elle existe.
    const texteEtape = (compact ? etapeActive?.court : null) ?? etapeActive?.texte;
    texte = multi ? (active?.phrase ?? texteEtape ?? phrase ?? "") : (phrase ?? texteEtape ?? "");
    if (active && longues.has(active.cle)) sousTexte = etapeActive?.texteLong ?? t.longue;
  }

  let badge;
  if (fini) badge = <span key="ok" className="fsb-badge fsb-badge-ok"><span className="fsb-coche"><Check size={compact ? 10 : 12} strokeWidth={3} /></span>{t.termine}</span>;
  else if (global === "echec") badge = <span key="stop" className="fsb-badge fsb-badge-stop"><AlertCircle size={compact ? 12 : 14} strokeWidth={2.4} />{tonAffiche === "neutre" ? t.annulee : t.arretee}</span>;
  else if (global === "partiel") badge = <span key="partiel" className="fsb-badge fsb-badge-stop"><AlertCircle size={compact ? 12 : 14} strokeWidth={2.4} />{t.surN(nOk, pistes.length)}</span>;
  else if (global === "pause") badge = <span key="pause" className="fsb-badge fsb-badge-pause"><Pause size={compact ? 10 : 12} strokeWidth={2.6} />{t.pause}</span>;
  else if (global === "attente") badge = <span key="attente" className="fsb-badge fsb-badge-pause">{t.attente}</span>;
  // Clé distincte : le pourcentage est écrit à la main (textContent) — sans
  // clé, React réutiliserait ce même <span> pour le badge et y laisserait le
  // « 52 % » à côté de « Arrêtée ».
  else badge = <span key="pct" className="fsb-pct" ref={(el) => moteur.attacher("pct", el)} />;

  const ouvrable = typeof onOuvrir === "function";
  const ouvrir = (e) => { e.stopPropagation(); onOuvrir(); };
  const toucheOuvrir = (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    e.stopPropagation();
    onOuvrir();
  };

  const classes = ["fsb", compact ? "fsb-compact" : "", ouvrable ? "fsb-ouvrable" : "", className].filter(Boolean).join(" ");
  const etatAffiche = fini ? "termine" : (global === "termine" ? "en_cours" : global);
  const chevron = ouvrable ? <ChevronRight className="fsb-chevron" size={compact ? 13 : 15} strokeWidth={2.4} aria-hidden="true" /> : null;

  let tete;
  if (compact) {
    // Compacte (carte du Stock, ligne d'une modale) : la phrase sur toute la
    // largeur, puis la barre avec son pourcentage au bout — sur une carte de
    // 160 px, une phrase partagée avec le pourcentage se coupait au 2e mot.
    tete = <p className="fsb-phrase" aria-live="polite">{texte}</p>;
  } else if (article) {
    tete = (
      <div className="fsb-tete fsb-tete-article">
        <Vignette photo={article.photo} />
        <span className="fsb-article-txt">
          <span className="fsb-article-titre">{article.titre}</span>
          {article.sousTitre && <span className="fsb-article-sous">{article.sousTitre}</span>}
        </span>
        <span className="fsb-droite">{badge}</span>
      </div>
    );
  } else if (titre || badge) {
    tete = (
      <div className="fsb-tete">
        {titre ? <span className="fsb-titre">{titre}</span> : <span />}
        <span className="fsb-droite">{badge}</span>
      </div>
    );
  }

  const piste = (
    <div className="fsb-piste">
      <div className="fsb-rempli" ref={(el) => moteur.attacher("rempli", el)} />
      <div className="fsb-reflets" ref={(el) => moteur.attacher("reflets", el)}><span className="fsb-reflet" /></div>
    </div>
  );

  // La piste seule : pour un écran qui dit déjà tout autour d'elle (le
  // bandeau « En cours » du Stock porte la photo, le titre et « 2 sur 5 »).
  if (seulePiste) {
    return (
      <div className={["fsb", "fsb-seule", className].filter(Boolean).join(" ")}
        data-etat={etatAffiche} data-ton={tonAffiche} data-reduit={reduit ? "1" : undefined}
        ref={(el) => moteur.attacher("racine", el)} role="progressbar" aria-valuemin={0} aria-valuemax={100}
        aria-label={ariaLabel ?? (lang === "en" ? "Progress" : "Avancement")}>
        {piste}
      </div>
    );
  }

  const haut = (
    <>
      {tete}
      {compact ? <div className="fsb-rang">{piste}<span className="fsb-droite">{badge}{chevron}</span></div> : piste}
      {!compact && (
        <div className="fsb-bas">
          <p className="fsb-phrase" aria-live="polite">{texte}</p>
          {sousTexte && <p className="fsb-sous"><Clock size={13} strokeWidth={2.2} />{sousTexte}</p>}
          {ouvrable && <span className="fsb-lien-file">{libelleOuvrir ?? t.voirFile}{chevron}</span>}
        </div>
      )}
    </>
  );

  return (
    <div
      className={classes}
      data-etat={etatAffiche}
      data-ton={tonAffiche}
      data-reduit={reduit ? "1" : undefined}
      ref={(el) => moteur.attacher("racine", el)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={article?.titre ?? titre ?? texte}
    >
      {ouvrable ? (
        // Pas un <button> : le contenu est fait de blocs. Touche Entrée et
        // Espace comme un bouton ; le tap ne remonte jamais à la carte.
        <div className="fsb-haut" role="button" tabIndex={0} aria-label={t.ouvrirFile}
          onClick={ouvrir} onKeyDown={toucheOuvrir}>
          {haut}
        </div>
      ) : <div className="fsb-haut">{haut}</div>}
      {!compact && action && (global === "echec" || global === "partiel") && (
        <button type="button" className="fsb-action" onClick={(e) => { e.stopPropagation(); action.onClick?.(); }}>{action.libelle}</button>
      )}
      {multi && !compact && (
        <ul className="fsb-lignes">
          {pistes.map((p) => {
            const e = etatNormalise(p.etat);
            const et = etapeDe(p);
            const tonLigne = tonNormalise(p.ton);
            // phraseLigne : le texte propre à la ligne quand il diffère de
            // la phrase sous la barre (plus court, ou porteur d'un lien).
            const ligne = p.phraseLigne ?? (e === "termine" ? (p.phraseFin ?? t.termine)
              : e === "echec" ? (p.phraseEchec ?? (tonLigne === "neutre" ? t.annulee : t.arretee))
              : e === "pause" ? (p.phrasePause ?? t.pause)
              : e === "attente" ? (p.phraseAttente ?? t.ligneAttente)
              : (p.phrase ?? et?.court ?? et?.texte ?? ""));
            return (
              <li key={p.cle} className="fsb-ligne" data-etat={e} data-ton={tonLigne}>
                {p.icone && <span className="fsb-ligne-icone">{p.icone}</span>}
                <span className="fsb-ligne-txt">
                  <span className="fsb-ligne-nom">{p.libelle}</span>
                  <span className="fsb-ligne-etape">{ligne}</span>
                  {p.detail && <span className="fsb-ligne-detail">{p.detail}</span>}
                  {p.geste && <span className="fsb-ligne-geste">{p.geste}</span>}
                </span>
                <span className="fsb-ligne-etat" aria-hidden="true">
                  {e === "termine" ? <span className="fsb-coche"><Check size={11} strokeWidth={3} /></span>
                    : e === "echec" ? <AlertCircle size={18} strokeWidth={2.2} />
                    : e === "pause" ? <Pause size={14} strokeWidth={2.6} />
                    : (
                      <svg width="20" height="20" viewBox="0 0 20 20" className="fsb-anneau">
                        <circle cx="10" cy="10" r={RAYON} className="fsb-anneau-fond" />
                        <circle cx="10" cy="10" r={RAYON} className="fsb-anneau-plein"
                          strokeDasharray={TOUR} ref={(el) => moteur.attacherAnneau(p.cle, el)} />
                      </svg>
                    )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
