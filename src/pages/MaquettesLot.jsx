import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import useSeo from "../lib/seo";
import { supabase } from "../lib/supabase";
import { NICO_USER_ID } from "../config/cloudOffer";
import PlatformLogo from "../components/platform-logos/PlatformLogo";
import "./maquettes-lot.css";
import { SCENARIO, IDS_MAQUETTE, MODELES_VINTED, marierScenario } from "./maquettesLotScenario";

// ═══════════════════════════════════════════════════════════════════════════
// MAQUETTES — LA PUBLICATION EN LOT, ÉTAPE 2 (25/10/2026, nuit)
// ═══════════════════════════════════════════════════════════════════════════
// /demo/lot — NON LISTÉE, noindex, liée de nulle part, et réservée au compte
// de Nico (toute autre session repart sur l'accueil). Elle sert à faire
// VALIDER la refonte de l'étape 2 avant d'y toucher : trois propositions, sur
// les VRAIS articles de son stock (titres, prix, photos et textes lus avec sa
// session, rien d'écrit dans ce fichier), avec des états SIMULÉS — rien ici
// ne prépare, n'écrit ni ne publie quoi que ce soit.
// Ce qui ne change pas : la logique du lot (mêmes questions, mêmes réponses
// écrites sur la fiche, « Pas sur [plateforme] », « Le garder pour plus
// tard », « Quitter », envoi des prêts seuls).

const NOMS = { vinted: "Vinted", leboncoin: "Leboncoin", ebay: "eBay", beebs: "Beebs", depop: "Depop" };
const liste = (pfs) => pfs.map((p) => NOMS[p]).join(", ");



const PROPOSITIONS = [
  { cle: "A", nom: "La liste", phrase: "Au lieu d'une grande carte par article, une ligne par question avec ses réponses en puces ; un seul « Tout valider » pour les textes ; les prêts repliés." },
  { cle: "B", nom: "Par question", phrase: "Les questions sont rangées par sujet (toutes les tailles, puis les âges…) : une réponse sert à plusieurs articles quand leurs listes sont les mêmes." },
  { cle: "C", nom: "Une à la fois", phrase: "Une seule question à l'écran, en grand, avec la photo ; la suivante arrive dès la réponse. Rien à faire défiler." },
];

function Vignette({ a, petite = false }) {
  const src = a?.photo ?? null;
  return <span className={`ml-vig${petite ? " ml-vig--p" : ""}`} aria-hidden="true">{src ? <img src={src} alt="" loading="lazy" /> : null}</span>;
}
const Logo = ({ pf, taille = 18 }) => <PlatformLogo platform={pf} size={taille} />;
const Chevron = ({ vers = "droite" }) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d={vers === "gauche" ? "M12.5 4.5 7 10l5.5 5.5" : "M7.5 4.5 13 10l-5.5 5.5"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ── L'état du lot simulé ────────────────────────────────────────────────────
function useLot(articles) {
  const [reponses, setReponses] = useState({});
  const [pasSur, setPasSur] = useState({});
  const [textesOk, setTextesOk] = useState(() => new Set());
  const [gardes, setGardes] = useState(() => new Set());
  const parId = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles]);
  const plateformesDe = (a) => a.pfs.filter((p) => !(pasSur[a.id] ?? []).includes(p));
  const restantes = (a) => a.questions.filter((q) => reponses[a.id]?.[q.cle] == null && q.pfs.some((p) => plateformesDe(a).includes(p)));
  const texteAValider = (a) => a.texteFillSell && !textesOk.has(a.id);
  const etat = (a) => (gardes.has(a.id) ? "garde" : restantes(a).length || texteAValider(a) ? "revoir" : "pret");
  const actifs = articles.filter((a) => !gardes.has(a.id));
  const prets = actifs.filter((a) => etat(a) === "pret");
  const revoir = actifs.filter((a) => etat(a) === "revoir");
  const annonces = prets.reduce((n, a) => n + plateformesDe(a).length, 0);
  const aTexte = actifs.filter((a) => a.texteFillSell);
  return {
    parId, prets, revoir, annonces, aTexte, actifs, etat, restantes, plateformesDe, texteAValider, reponses, pasSur, gardes,
    textesTousValides: aTexte.every((a) => textesOk.has(a.id)),
    repondre: (id, cle, v) => setReponses((r) => ({ ...r, [id]: { ...(r[id] ?? {}), [cle]: v } })),
    effacer: (id, cle) => setReponses((r) => { const n = { ...(r[id] ?? {}) }; delete n[cle]; return { ...r, [id]: n }; }),
    pasSurPf: (id, pf) => setPasSur((s) => ({ ...s, [id]: [...new Set([...(s[id] ?? []), pf])] })),
    remettrePf: (id, pf) => setPasSur((s) => ({ ...s, [id]: (s[id] ?? []).filter((p) => p !== pf) })),
    validerTexte: (id) => setTextesOk((s) => new Set([...s, id])),
    validerTous: () => setTextesOk(new Set(articles.filter((a) => a.texteFillSell).map((a) => a.id))),
    annulerTous: () => setTextesOk(new Set()),
    garder: (id) => setGardes((s) => new Set([...s, id])),
  };
}

// ── Les briques communes ────────────────────────────────────────────────────
function Bilan({ lot, articles, ouvrir }) {
  return (
    <section className="ml-bilan" aria-label="Où en est le lot">
      <div className="ml-nombres">
        <div className="ml-nombre ml-nombre--ok"><b>{lot.prets.length}</b><small>{lot.prets.length > 1 ? "prêts" : "prêt"}</small></div>
        <div className={`ml-nombre ${lot.revoir.length ? "ml-nombre--revoir" : "ml-nombre--zero"}`}><b>{lot.revoir.length}</b><small>à revoir</small></div>
        <div className="ml-nombre"><b>{lot.annonces}</b><small>{lot.annonces > 1 ? "annonces" : "annonce"}</small></div>
      </div>
      <div className="ml-cases" role="list" aria-label="Une case par article">
        {articles.map((a) => {
          const e = lot.etat(a);
          return <button key={a.id} type="button" role="listitem" className={`ml-case${e === "revoir" ? " ml-case--revoir" : e === "garde" ? " ml-case--hors" : ""}`}
            aria-label={`${a.titre} : ${e === "pret" ? "prêt" : e === "revoir" ? "à revoir" : "gardé pour plus tard"}`} onClick={() => ouvrir(a.id)} />;
        })}
      </div>
    </section>
  );
}

function Textes({ lot }) {
  const n = lot.aTexte.length;
  if (!n) return null;
  if (lot.textesTousValides) {
    return (
      <div className="ml-textes ml-textes--fait">
        <div className="ml-textes-t"><b>✓ {n} textes validés</b><small>Écrits par FillSell. Touche un article pour relire le sien.</small></div>
        <button type="button" className="ml-lien" onClick={lot.annulerTous}>Annuler</button>
      </div>
    );
  }
  return (
    <div className="ml-textes">
      <div className="ml-textes-t"><b>{n} textes écrits par FillSell</b><small>Touche un article pour relire le sien.</small></div>
      <button type="button" className="ml-btn ml-btn--bord" onClick={lot.validerTous}>Tout valider</button>
    </div>
  );
}

function Prets({ lot, ouvrir }) {
  const [ouvert, setOuvert] = useState(false);
  if (!lot.prets.length) return null;
  return (
    <section className="ml-prets">
      <button type="button" className="ml-prets-tete" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        <span className="ml-vigs" aria-hidden="true">{lot.prets.slice(0, 4).map((a) => <Vignette key={a.id} a={a} />)}</span>
        <b><span className="num">{lot.prets.length}</span> {lot.prets.length > 1 ? "prêts" : "prêt"}</b>
        <span>{ouvert ? "Replier" : "Voir"}</span>
      </button>
      {ouvert && lot.prets.map((a) => (
        <button key={a.id} type="button" className="ml-ligne" onClick={() => ouvrir(a.id)}>
          <Vignette a={a} petite />
          <span className="ml-ligne-t"><b>{a.titre}</b><small>{liste(lot.plateformesDe(a))}</small></span>
          <span className="ml-prix">{a.prix != null ? `${a.prix} €` : ""}</span>
        </button>
      ))}
    </section>
  );
}

// Une question, réponse en un geste. `compacte` : une ligne qui défile.
function Question({ lot, a, q, compacte = true, grande = false, ouvrirListe }) {
  const choisie = lot.reponses[a.id]?.[q.cle];
  const [cherche, setCherche] = useState(q.marque ?? "");
  const plusieursPf = lot.plateformesDe(a).length > 1;
  const pfQuestion = q.pfs.filter((p) => lot.plateformesDe(a).includes(p));
  const pasSur = pfQuestion.length === 1 && plusieursPf ? pfQuestion[0] : null;
  if (choisie != null) {
    return (
      <div className="ml-pose"><span aria-hidden="true">✓</span> {q.label} : {choisie}
        <button type="button" onClick={() => lot.effacer(a.id, q.cle)}>Changer</button>
      </div>
    );
  }
  if (q.type === "recherche") {
    const t = cherche.trim().toLowerCase();
    const trouves = MODELES_VINTED.filter(([m, n]) => !t || `${m} ${n}`.toLowerCase().includes(t)).slice(0, grande ? 6 : 4);
    return (
      <>
        <label className="ml-recherche">
          <span aria-hidden="true">⌕</span>
          <input value={cherche} onChange={(e) => setCherche(e.target.value)} placeholder="Marque ou modèle" aria-label={`Chercher le ${q.label.toLowerCase()} dans toute la liste ${NOMS[q.pfs[0]]}`} />
        </label>
        {compacte ? (
          <div className="ml-puces">
            {trouves.map(([m, n]) => <button key={`${m}${n}`} type="button" className="ml-puce" onClick={() => lot.repondre(a.id, q.cle, n)}>{n}</button>)}
            <button type="button" className="ml-puce ml-puce--plus" onClick={() => ouvrirListe(a.id)}>Toute la liste</button>
          </div>
        ) : (
          <div className="ml-resultats">
            {trouves.map(([m, n]) => (
              <button key={`${m}${n}`} type="button" onClick={() => lot.repondre(a.id, q.cle, n)}>{n}<small>{m}</small></button>
            ))}
          </div>
        )}
      </>
    );
  }
  const valeurs = q.valeurs ?? [];
  return (
    <>
      {q.note ? <p className="ml-q-note">{q.note}</p> : null}
      <div className={`ml-puces${compacte ? "" : " ml-puces--wrap"}`}>
        {q.conseilPas && pasSur ? <button type="button" className="ml-puce ml-puce--conseil" onClick={() => lot.pasSurPf(a.id, pasSur)}>Pas sur {NOMS[pasSur]}</button> : null}
        {valeurs.map((v) => <button key={v} type="button" className="ml-puce" onClick={() => lot.repondre(a.id, q.cle, v)}>{v}</button>)}
        {q.tout || q.type === "rayon" ? <button type="button" className="ml-puce ml-puce--plus" onClick={() => ouvrirListe(a.id)}>{q.type === "rayon" ? "Chercher un rayon" : "Toute la liste"}</button> : null}
        {!q.conseilPas && pasSur ? <button type="button" className="ml-puce ml-puce--pas" onClick={() => lot.pasSurPf(a.id, pasSur)}>Pas sur {NOMS[pasSur]}</button> : null}
      </div>
    </>
  );
}

const EnTeteQuestion = ({ q }) => (
  <div className="ml-q-t">
    {q.pfs.length === 1 ? <Logo pf={q.pfs[0]} taille={16} /> : null}
    <span>{q.label}</span>
    <em>· {q.pfs.length === 1 ? NOMS[q.pfs[0]] : liste(q.pfs)}</em>
  </div>
);

// ── Proposition A : un article, ses questions dessous ───────────────────────
function PropositionA({ lot, ouvrir }) {
  const aQuestions = lot.revoir.filter((a) => a.questions.length && lot.restantes(a).length);
  return (
    <>
      <Textes lot={lot} />
      {aQuestions.length > 0 && (
        <section className="ml-section">
          <div className="ml-section-t"><h2>À compléter</h2><span>{aQuestions.length} {aQuestions.length > 1 ? "articles" : "article"}</span></div>
          {aQuestions.map((a) => (
            <article key={a.id} className="ml-carte">
              <button type="button" className="ml-art" onClick={() => ouvrir(a.id)}>
                <Vignette a={a} />
                <span className="ml-art-t"><b>{a.titre}</b><small>{a.prix != null ? `${a.prix} €` : ""} · {liste(lot.plateformesDe(a))}</small></span>
                <span className="ml-chevron"><Chevron /></span>
              </button>
              {a.questions.filter((q) => q.pfs.some((p) => lot.plateformesDe(a).includes(p))).map((q) => (
                <div key={q.cle} className="ml-q">
                  <EnTeteQuestion q={q} />
                  <Question lot={lot} a={a} q={q} ouvrirListe={ouvrir} />
                </div>
              ))}
            </article>
          ))}
        </section>
      )}
      <Prets lot={lot} ouvrir={ouvrir} />
    </>
  );
}

// ── Proposition B : regroupé par question ───────────────────────────────────
function PropositionB({ lot, ouvrir }) {
  const groupes = [];
  for (const a of lot.revoir) {
    for (const q of lot.restantes(a)) {
      const cle = `${q.label}|${q.pfs.join(",")}`;
      let g = groupes.find((x) => x.cle === cle);
      if (!g) { g = { cle, q, lignes: [] }; groupes.push(g); }
      g.lignes.push({ a, q });
    }
  }
  return (
    <>
      <Textes lot={lot} />
      {groupes.map((g) => {
        const memeListe = g.lignes.length > 1 && g.lignes.every((l) => JSON.stringify(l.q.valeurs) === JSON.stringify(g.q.valeurs)) && g.q.type === "puces";
        return (
          <section key={g.cle} className="ml-groupe">
            <div className="ml-groupe-tete">
              {g.q.pfs.length === 1 ? <Logo pf={g.q.pfs[0]} taille={20} /> : null}
              <h3>{g.q.label} · {g.q.pfs.length === 1 ? NOMS[g.q.pfs[0]] : liste(g.q.pfs)}</h3>
              <span className="num">{g.lignes.length} {g.lignes.length > 1 ? "articles" : "article"}</span>
            </div>
            {memeListe && (
              <div className="ml-groupe-tous">
                <p>La même réponse pour les {g.lignes.length} :</p>
                <div className="ml-puces">
                  {g.q.valeurs.map((v) => <button key={v} type="button" className="ml-puce" onClick={() => g.lignes.forEach((l) => lot.repondre(l.a.id, l.q.cle, v))}>{v}</button>)}
                </div>
              </div>
            )}
            {g.lignes.map(({ a, q }) => (
              <div key={a.id} className="ml-gl">
                <button type="button" className="ml-gl-art" onClick={() => ouvrir(a.id)}>
                  <Vignette a={a} petite /><b>{a.titre}</b><span className="ml-chevron"><Chevron /></span>
                </button>
                <Question lot={lot} a={a} q={q} ouvrirListe={ouvrir} />
              </div>
            ))}
          </section>
        );
      })}
      <Prets lot={lot} ouvrir={ouvrir} />
    </>
  );
}

// ── Proposition C : une question à la fois ──────────────────────────────────
function PropositionC({ lot, ouvrir }) {
  const [passees, setPassees] = useState([]);
  const file = [];
  for (const a of lot.revoir) for (const q of lot.restantes(a)) file.push({ a, q, cle: `${a.id}:${q.cle}` });
  const ordre = [...file.filter((x) => !passees.includes(x.cle)), ...file.filter((x) => passees.includes(x.cle))];
  const total = SCENARIO.reduce((n, s) => n + s.questions.length, 0);
  const faites = total - file.length;
  const courante = ordre[0] ?? null;
  return (
    <>
      {courante ? (
        <section className="ml-focus" aria-live="polite">
          <button type="button" className="ml-focus-photo" onClick={() => ouvrir(courante.a.id)} aria-label={`Ouvrir ${courante.a.titre}`}>
            {courante.a.photo ? <img src={courante.a.photo} alt="" /> : null}
          </button>
          <div className="ml-focus-corps">
            <button type="button" className="ml-focus-art" onClick={() => ouvrir(courante.a.id)}>
              <b>{courante.a.titre}</b>
              <small>{courante.a.prix != null ? `${courante.a.prix} €` : ""} · {liste(lot.plateformesDe(courante.a))}</small>
            </button>
            <h2 className="ml-focus-q">
              {courante.q.pfs.length === 1 ? <Logo pf={courante.q.pfs[0]} taille={22} /> : null}
              {courante.q.type === "rayon" ? `Quel rayon sur ${NOMS[courante.q.pfs[0]]} ?` : `${courante.q.label} sur ${courante.q.pfs.length === 1 ? NOMS[courante.q.pfs[0]] : liste(courante.q.pfs)} ?`}
            </h2>
            <Question key={courante.cle} lot={lot} a={courante.a} q={courante.q} compacte={false} grande ouvrirListe={ouvrir} />
          </div>
          <div className="ml-focus-pied">
            <span className="ml-compte num">Question {Math.min(faites + 1, total)} sur {total}</span>
            <button type="button" className="ml-lien" onClick={() => setPassees((p) => [...p.filter((x) => x !== courante.cle), courante.cle])}>Passer</button>
          </div>
        </section>
      ) : (
        <section className="ml-focus">
          <div className="ml-fini">
            <span className="ml-fini-rond" aria-hidden="true">✓</span>
            <b>Plus aucune question</b>
            <small className="ml-note-maquette">Tout ce qui reste est prêt à partir.</small>
          </div>
        </section>
      )}
      <div className="ml-points" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => <span key={i} className={`ml-point${i < faites ? " ml-point--fait" : i === faites ? " ml-point--on" : ""}`} />)}
      </div>
      <Textes lot={lot} />
      <Prets lot={lot} ouvrir={ouvrir} />
    </>
  );
}

// ── La feuille de l'article ─────────────────────────────────────────────────
function Feuille({ lot, a, fermer }) {
  const [toutLire, setToutLire] = useState(false);
  const [listeOuverte, setListeOuverte] = useState(null);
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") fermer(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [fermer]);
  if (!a) return null;
  const texteRevoir = lot.texteAValider(a);
  const retires = lot.pasSur[a.id] ?? [];
  return (
    <>
      <div className="ml-voile" onClick={fermer} />
      <div className="ml-feuille" role="dialog" aria-modal="true" aria-label={a.titre}>
        <span className="ml-feuille-poignee" aria-hidden="true" />
        <div className="ml-feuille-tete">
          <Vignette a={a} />
          <div style={{ flex: 1, minWidth: 0 }}><b>{a.titre}</b><small>{a.prix != null ? `${a.prix} €` : "Sans prix"}</small></div>
          <button type="button" className="ml-fermer" onClick={fermer} aria-label="Fermer">✕</button>
        </div>
        <div className="ml-feuille-corps">
          <section className="ml-bloc">
            <div className="ml-bloc-t">
              <h3>Le texte qui part</h3>
              {a.texteFillSell ? <span className={`ml-etiquette ${texteRevoir ? "ml-etiquette--revoir" : "ml-etiquette--ok"}`}>{texteRevoir ? "Écrit par FillSell" : "Validé"}</span> : <span className="ml-etiquette">Ton texte</span>}
            </div>
            <div className="ml-texte">
              <b>{a.titre}</b>
              {a.description ? <p className={toutLire ? "" : "court"}>{a.description}</p> : null}
            </div>
            <div className="ml-texte-gestes">
              {a.description && a.description.length > 180 ? <button type="button" className="ml-btn ml-btn--doux" onClick={() => setToutLire((v) => !v)}>{toutLire ? "Réduire" : "Tout lire"}</button> : null}
              <button type="button" className="ml-btn ml-btn--doux">Modifier</button>
              {texteRevoir ? <button type="button" className="ml-btn ml-btn--bord" onClick={() => lot.validerTexte(a.id)}>Valider ce texte</button> : null}
            </div>
          </section>
          <section className="ml-bloc">
            <div className="ml-bloc-t"><h3>Ses plateformes</h3></div>
            {a.pfs.map((pf) => {
              const retire = retires.includes(pf);
              const qs = a.questions.filter((q) => q.pfs.includes(pf));
              const ouvertes = retire ? [] : qs.filter((q) => lot.reponses[a.id]?.[q.cle] == null);
              const poses = (a.poses ?? []).filter((p) => p.pf === pf);
              const dits = retire ? [] : qs.filter((q) => lot.reponses[a.id]?.[q.cle] != null);
              return (
                <div key={pf} className="ml-pf">
                  <div className="ml-pf-l">
                    <Logo pf={pf} taille={26} />
                    <b>{NOMS[pf]}</b>
                    <span className={`ml-etiquette ${retire ? "" : ouvertes.length ? "ml-etiquette--revoir" : "ml-etiquette--ok"}`}>
                      {retire ? "Pas sur cette plateforme" : ouvertes.length ? `${ouvertes[0].label} à choisir` : "Prête"}
                    </span>
                  </div>
                  {poses.map((p) => <p key={p.label} className="ml-pf-pose">{p.label} : <strong>{p.valeur}</strong> — {p.pourquoi}.</p>)}
                  {dits.map((q) => <p key={q.cle} className="ml-pf-pose">{q.label} : <strong>{lot.reponses[a.id][q.cle]}</strong> — ta réponse, gardée sur la fiche.</p>)}
                  {ouvertes.map((q) => (
                    <div key={q.cle} className="ml-pf-q">
                      <p className="ml-pf-q-t">{q.label}</p>
                      <Question lot={lot} a={a} q={listeOuverte === q.cle && q.tout ? { ...q, valeurs: q.tout } : q} compacte={false} ouvrirListe={() => setListeOuverte(q.cle)} />
                    </div>
                  ))}
                  {retire
                    ? <div className="ml-pf-pas"><button type="button" className="ml-lien" onClick={() => lot.remettrePf(a.id, pf)}>Remettre {NOMS[pf]}</button></div>
                    : ouvertes.length && lot.plateformesDe(a).length > 1 ? <div className="ml-pf-pas"><button type="button" className="ml-lien" onClick={() => lot.pasSurPf(a.id, pf)}>Pas sur {NOMS[pf]}</button></div> : null}
                </div>
              );
            })}
          </section>
        </div>
        <div className="ml-feuille-pied">
          <button type="button" className="ml-btn ml-btn--doux" onClick={() => { lot.garder(a.id); fermer(); }}>Le garder pour plus tard</button>
          <button type="button" className="ml-btn ml-btn--bord" onClick={fermer}>Fermer</button>
        </div>
      </div>
    </>
  );
}

// ── L'écran ─────────────────────────────────────────────────────────────────
export function EcranMaquette({ articles, proposition }) {
  const lot = useLot(articles);
  const [ouvert, setOuvert] = useState(null);
  const P = proposition === "B" ? PropositionB : proposition === "C" ? PropositionC : PropositionA;
  const n = lot.prets.length;
  return (
    <div className="ml-ecran">
      <div className="ml-top">
        <button type="button" className="ml-back" aria-label="Retour"><Chevron vers="gauche" /></button>
        <div className="ml-top-t">Publier {articles.length} articles</div>
        <span className="ml-top-n num">2 / 3</span>
        <button type="button" className="ml-quit">Quitter</button>
      </div>
      <div className="ml-prog" aria-hidden="true"><span className="on" /><span className="on" /><span /></div>
      <main className="ml-corps">
        <Bilan lot={lot} articles={articles} ouvrir={setOuvert} />
        <P lot={lot} ouvrir={setOuvert} />
        <p className="ml-note-maquette">Maquette : les vrais articles de ton stock, des états simulés. Rien ne part.</p>
      </main>
      <div className="ml-pied">
        <button type="button" className="ml-btn ml-btn--plein ml-btn--large" disabled={!n}>
          {n ? `Envoyer ${n > 1 ? `les ${n} prêts` : "le prêt"} · ${lot.annonces} annonces` : "Aucun article prêt"}
        </button>
        {lot.revoir.length ? <p>{lot.revoir.length > 1 ? `Les ${lot.revoir.length} autres restent dans ton stock.` : "L'autre reste dans ton stock."}</p> : null}
      </div>
      {ouvert ? <Feuille key={ouvert} lot={lot} a={lot.parId.get(ouvert)} fermer={() => setOuvert(null)} /> : null}
    </div>
  );
}

export function Maquettes({ articles }) {
  const [p, setP] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("p")?.toUpperCase() || "A"; } catch { return "A"; }
  });
  const choisir = (cle) => {
    setP(cle);
    try { const u = new URL(window.location.href); u.searchParams.set("p", cle); window.history.replaceState(null, "", u); } catch { /* rien */ }
    window.scrollTo({ top: 0 });
  };
  const courante = PROPOSITIONS.find((x) => x.cle === p) ?? PROPOSITIONS[0];
  return (
    <div className="ml">
      <div className="ml-switch">
        <div className="ml-switch-in">
          <div className="ml-seg" role="tablist" aria-label="Propositions">
            {PROPOSITIONS.map((x) => (
              <button key={x.cle} type="button" role="tab" aria-selected={x.cle === courante.cle} onClick={() => choisir(x.cle)}>{x.cle} · {x.nom}</button>
            ))}
          </div>
          <p className="ml-switch-p"><b>{courante.cle} · {courante.nom}.</b> {courante.phrase}</p>
        </div>
      </div>
      <EcranMaquette key={courante.cle} articles={articles} proposition={courante.cle} />
    </div>
  );
}

export default function MaquettesLot() {
  useSeo({ path: "/demo/lot", title: "Publier en lot — maquettes", robots: "noindex, nofollow" });
  const [etat, setEtat] = useState({ phase: "lecture", articles: [] });
  useEffect(() => {
    let vivant = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!vivant) return;
      if (session?.user?.id !== NICO_USER_ID) { setEtat({ phase: "refuse", articles: [] }); return; }
      const { data, error } = await supabase.from("inventaire").select("id, titre, prix_vente, description, photos").in("id", IDS_MAQUETTE);
      if (!vivant) return;
      if (error) { setEtat({ phase: "erreur", articles: [] }); return; }
      setEtat({ phase: "pret", articles: marierScenario(data) });
    })();
    return () => { vivant = false; };
  }, []);
  if (etat.phase === "refuse") return <Navigate to="/" replace />;
  if (etat.phase !== "pret") {
    return <div className="ml"><div className="ml-attente">{etat.phase === "erreur" ? "Tes articles n'ont pas pu être lus. Recharge la page." : "Lecture de tes articles…"}</div></div>;
  }
  return <Maquettes articles={etat.articles} />;
}
