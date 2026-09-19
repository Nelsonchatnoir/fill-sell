// ═══════════════════════════════════════════════════════════════════════════
// STOCK — LA BARRE, LA FEUILLE DE FILTRES, ET LA SORTIE TOUJOURS VISIBLE
// ═══════════════════════════════════════════════════════════════════════════
// (2026-09-18, refonte du haut de l'onglet Stock — demande Nico sur pièce)
//
// CE QUI N'ALLAIT PAS. Le haut du Stock empilait QUATRE choses avant le
// premier article : la carte « Ajouter un article » dépliée en permanence, la
// ligne Import/Export Excel, la recherche, puis TROIS rangées de filtres de
// natures différentes — les catégories, puis [Toutes][Marques][Trier], puis les
// pastilles d'état. Deux défauts, et le second est le plus grave :
//   · on ne voyait aucun article sans faire défiler ;
//   · on ne savait jamais quel filtre était actif, ni comment en sortir : il
//     fallait retrouver la pastille tapée et la retaper. Sur un compte à 500
//     articles, c'est une galère.
//
// ⛔ LA DISTINCTION QUI COMMANDE TOUT LE FICHIER (arbitrage Nico, 18/09) :
//
//   Un FILTRE restreint ce qu'on VOIT. Il se cumule avec les autres, il porte
//   une pastille de sortie, il vit dans la FEUILLE.
//   Un MODE change ce qu'on peut FAIRE (cartes différentes, sélection
//   multiple, en-tête de sortie dédié). Il ne se cumule pas, il s'arme et se
//   quitte, il vit dans la ligne « À traiter ».
//
// Ils ne se montrent JAMAIS au même endroit : le désordre d'avant venait
// précisément de les avoir mis sur la même rangée. Une feuille de filtres qui
// se refermerait en armant un mode multi-sélection serait incompréhensible.
//
// ⛔ CE FICHIER NE FILTRE RIEN. Il ne sait ni lire un article, ni compter, ni
// trier : il reçoit des options déjà calculées (libellé, compte, actif) et un
// `onTap` par option. Toute la logique de filtrage reste où elle vit déjà —
// App.jsx (type, marque, boutique, recherche) et utils/stockFiltres
// (filtrerStock / trierStock / compteursStock). C'est une refonte de
// PRÉSENTATION : les mêmes données, les mêmes articles rendus.
//
// ⛔ LA RÈGLE DES COUCHES (cf. utils/modale.js, payée cher le 18/09 au matin) :
// toute couche flottante se monte sur `document.body` par createPortal. L'app
// entière vit sous `.app-root`, qui rogne et défile ; WebKit y peint les
// `position:fixed` DANS LA COUCHE DE CE CONTENEUR, z-index ou pas. Les deux
// feuilles d'ici sont donc portalisées dès le premier jour — on ne refait pas
// la journée perdue sur la page Réglages.
//
// ── PEU DE VALEURS → CHIPS ; BEAUCOUP → UNE LIGNE QUI OUVRE UNE LISTE ───────
// Règle posée par Nico, à resservir ailleurs. État, Plateforme, Boutique et
// Catégorie tiennent en quelques valeurs : chips. « Marque » peut en compter
// deux cents sur un compte Pro : une LIGNE (valeur à droite, chevron) qui
// ouvre une liste cherchable. Une rangée de 200 chips est illisible.
//
// ── AUCUNE COULEUR NEUVE ────────────────────────────────────────────────────
// Tout vient de `R` (reglages/theme), lui-même dérivé de `UI` — les jetons
// posés le matin même sur la page Réglages. Zones tactiles ≥ 44 px, textes à
// 4,5:1 sur leur fond réel (d'où `R.texteSecondaire` et jamais `UI.mute` sur
// le papier de la page).
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, SlidersHorizontal, X, ChevronRight, Check } from 'lucide-react';
import { useFondFige, useEchap, useRetourAndroid } from '../utils/modale';
import { R } from '../reglages/theme';

const fr = (lang) => lang !== 'en';

// Hauteur de zone tactile minimale. Non négociable : c'est la valeur du
// garde-fou d'accessibilité, la même que sur la page Réglages.
const TOUCHE = 44;

// ── Z-INDEX ────────────────────────────────────────────────────────────────
// Au-dessus de la barre du haut (10) et de la nav (50) ; SOUS la modale de
// conversion (9990) et la pop-up « signaler un bug » (10000), qu'un geste
// depuis la feuille « À traiter » peut ouvrir (« Republier » sur un palier
// gratuit → modale d'offre). Une feuille qui passerait devant enterrerait
// exactement la couche qu'elle vient de demander.
const Z_FEUILLE = 600;
const Z_FEUILLE_DESSUS = 620; // la liste cherchable, ouverte PAR la feuille

// (Le retour Android et Échap vivent désormais dans utils/modale.js, avec
//  useFondFige : une couche neuve les importe au lieu de les recopier.)

// ═══════════════════════════════════════════════════════════════════════════
// LA COQUE COMMUNE DES DEUX FEUILLES
// ═══════════════════════════════════════════════════════════════════════════
// Une seule coque, donc un seul endroit où vivent : le portail, le fond
// cliquable, la safe-area basse, le verrou de geste, Échap et le retour
// Android. Deux coques, ce serait deux occasions d'en oublier une.
// `actif` : cette couche est-elle AU PREMIER PLAN ? Une liste ouverte par la
// feuille la passe à false — sans quoi Échap et le retour Android fermeraient
// les DEUX d'un coup (les écouteurs vivent sur `document` et sur le plugin :
// stopPropagation ne retient pas un voisin enregistré sur le même nœud).
function Coque({ lang, titre, gauche, onFermer, z = Z_FEUILLE, actif = true, children, pied }) {
  useFondFige(true);
  useEchap(actif ? onFermer : null);
  useRetourAndroid(actif ? onFermer : null);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titre}
      style={{ position: 'fixed', inset: 0, zIndex: z, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      {/* Le fond : une sortie à part entière, et la plus grande de toutes. */}
      <button
        type="button"
        aria-label={titre}
        onClick={onFermer}
        style={{
          position: 'absolute', inset: 0, border: 'none', padding: 0,
          background: 'rgba(16,32,27,0.45)', cursor: 'pointer',
          animation: 'fsFeuilleFond .16s ease',
        }}
      />
      <div
        style={{
          position: 'relative', width: '100%', maxWidth: 560, maxHeight: '86vh',
          display: 'flex', flexDirection: 'column',
          background: R.page, borderRadius: '20px 20px 0 0',
          boxShadow: '0 -8px 40px rgba(16,32,27,0.22)',
          animation: 'fsFeuilleMonte .22s cubic-bezier(.22,.61,.36,1)',
        }}
      >
        <style>{CSS_FEUILLE}</style>

        {/* La poignée : elle dit « ça vient du bas et ça y retourne ». */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8, flexShrink: 0 }}>
          <span aria-hidden="true" style={{ width: 38, height: 4, borderRadius: 99, background: R.border }} />
        </div>

        {/* En-tête : action à gauche, titre au centre, sortie à droite. Il ne
            défile pas — la croix reste atteignable quel que soit le contenu. */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          padding: '6px 10px 10px', borderBottom: `1px solid ${R.border}`,
        }}>
          <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', justifyContent: 'flex-start' }}>{gauche}</div>
          <h2 style={{
            margin: 0, fontSize: 15, fontWeight: 700, color: R.ink,
            letterSpacing: '-0.01em', whiteSpace: 'nowrap',
          }}>{titre}</h2>
          <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onFermer}
              aria-label={fr(lang) ? 'Fermer' : 'Close'}
              className="fs-focus"
              style={{
                width: TOUCHE, height: TOUCHE, borderRadius: 22, border: 'none', background: 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
              }}
            >
              <X size={20} color={R.ink} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {/* Corps défilant. `flex-shrink:0` sur les enfants : dans une colonne
            flex qui défile, le navigateur écrase les enfants au lieu de laisser
            défiler (défaut vécu sur la page Réglages le 18/09). */}
        <div className="fs-corps" style={{
          flex: 1, minHeight: 0, overflowY: 'auto',
          padding: pied ? '16px 16px 18px' : '10px 10px calc(env(safe-area-inset-bottom,0px) + 14px)',
          display: 'flex', flexDirection: 'column', gap: 18,
        }}>
          {children}
        </div>

        {pied && (
          <div style={{
            flexShrink: 0, padding: '12px 16px calc(env(safe-area-inset-bottom,0px) + 14px)',
            borderTop: `1px solid ${R.border}`, background: R.paper,
          }}>
            {pied}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

const CSS_FEUILLE = `
@keyframes fsFeuilleMonte { from { transform: translateY(26px); opacity: .6 } to { transform: none; opacity: 1 } }
@keyframes fsFeuilleFond { from { opacity: 0 } to { opacity: 1 } }
.fs-corps > * { flex-shrink: 0 }
.fs-focus:focus-visible { outline: 2px solid ${R.teal}; outline-offset: -2px; border-radius: 12px }
.fs-chip:active { transform: scale(.97) }
`;

// ═══════════════════════════════════════════════════════════════════════════
// LES BRIQUES
// ═══════════════════════════════════════════════════════════════════════════

// Un chip de la feuille. Actif = aplat teal, texte blanc PLEIN (un compte en
// blanc translucide tomberait sous 4,5:1 sur le teal — on distingue par la
// graisse, pas par l'opacité).
function Chip({ libelle, compte, actif, onTap, desactive }) {
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={desactive}
      aria-pressed={actif}
      className="fs-chip fs-focus"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        minHeight: TOUCHE, padding: '0 16px', borderRadius: 99,
        fontFamily: 'inherit', fontSize: 13.5, fontWeight: actif ? 700 : 600,
        cursor: desactive ? 'default' : 'pointer', opacity: desactive ? 0.45 : 1,
        whiteSpace: 'nowrap', transition: 'background .14s ease, border-color .14s ease',
        background: actif ? R.tealDeep : R.card,
        border: `1px solid ${actif ? R.tealDeep : R.border}`,
        color: actif ? '#fff' : R.texteSecondaire,
      }}
    >
      {libelle}
      {compte != null && (
        <span style={{ fontWeight: 600, color: actif ? '#fff' : R.texteSecondaire, opacity: actif ? 0.92 : 1 }}>
          {compte}
        </span>
      )}
    </button>
  );
}

// Un groupe de la feuille : intitulé en petites capitales + ses chips.
// ⛔ Un groupe sans option ne s'affiche pas : un intitulé seul est une porte
// qui ne mène nulle part.
function Groupe({ intitule, children }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <h3 style={{
        margin: '0 2px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.12em', color: R.texteSecondaire,
      }}>{intitule}</h3>
      {children}
    </section>
  );
}

// La LIGNE d'un groupe à beaucoup de valeurs : nom à gauche, valeur à droite,
// chevron. Le tap ouvre la liste cherchable.
function LigneGroupe({ intitule, valeur, onOuvrir, lang }) {
  return (
    <button
      type="button"
      onClick={onOuvrir}
      className="fs-focus"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 52,
        padding: '10px 14px', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
        background: R.card, border: `1px solid ${R.border}`, fontFamily: 'inherit',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: R.ink }}>{intitule}</span>
      <span style={{
        fontSize: 13.5, fontWeight: 600, color: R.texteSecondaire,
        maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{valeur}</span>
      <ChevronRight size={18} color={R.chevron} strokeWidth={2} aria-hidden="true" />
      <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {fr(lang) ? 'Choisir' : 'Choose'}
      </span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LA BARRE — recherche + « Filtrer »
// ═══════════════════════════════════════════════════════════════════════════
// Au repos, c'est TOUT ce qui sépare le bloc « Ajouter » des articles, avec la
// ligne de compte. Le bouton devient plein et porte un compteur dès qu'un
// filtre est posé : on doit voir, sans rien ouvrir, qu'il se passe quelque
// chose.
export function BarreFiltres({ lang, search, setSearch, nbFiltres = 0, onOuvrir }) {
  const f = fr(lang);
  const actif = nbFiltres > 0;
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
      <div style={{
        flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 9,
        background: R.card, border: `1px solid ${R.border}`, borderRadius: 14, padding: '0 14px', minHeight: TOUCHE,
      }}>
        <Search size={17} color={R.chevron} strokeWidth={2} aria-hidden="true" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={f ? 'Rechercher' : 'Search'}
          aria-label={f ? 'Rechercher un article' : 'Search an item'}
          style={{
            flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 15, fontFamily: 'inherit', color: R.ink, padding: '11px 0',
          }}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label={f ? 'Effacer la recherche' : 'Clear search'}
            className="fs-focus"
            style={{
              width: 30, height: 30, marginRight: -6, borderRadius: 99, border: 'none', background: 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, flexShrink: 0,
            }}
          >
            <X size={16} color={R.texteSecondaire} strokeWidth={2.4} />
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onOuvrir}
        className="fs-focus"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0,
          minHeight: TOUCHE, padding: '0 16px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 14, fontWeight: 700,
          background: actif ? R.tealDeep : R.card,
          border: `1px solid ${actif ? R.tealDeep : R.border}`,
          color: actif ? '#fff' : R.ink,
        }}
      >
        <SlidersHorizontal size={16} strokeWidth={2.2} aria-hidden="true" />
        {f ? 'Filtrer' : 'Filter'}
        {actif && (
          <span style={{
            minWidth: 20, height: 20, borderRadius: 99, background: 'rgba(255,255,255,0.22)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, padding: '0 6px',
          }}>{nbFiltres}</span>
        )}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LES FILTRES POSÉS — LE CŒUR DE LA DEMANDE
// ═══════════════════════════════════════════════════════════════════════════
// « On ne sait jamais quel filtre est actif, ni comment en sortir. » Chaque
// filtre posé est ici, avec sa croix, sans rouvrir quoi que ce soit. Plus un
// « Tout effacer ».
// ⛔ ZÉRO FILTRE → RIEN. Pas de rangée vide, pas de « 0 filtre », pas de bloc
// qui réserve sa place : c'est la règle 1, et c'est ce qui rend l'écran au
// premier article.
export function PastillesFiltres({ lang, pastilles = [], onToutEffacer }) {
  if (!pastilles.length) return null;
  const f = fr(lang);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap',
    }}>
      {pastilles.map((p) => (
        <button
          key={p.cle}
          type="button"
          onClick={p.onRetirer}
          aria-label={f ? `Retirer le filtre ${p.libelle}` : `Remove filter ${p.libelle}`}
          className="fs-chip fs-focus"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            minHeight: TOUCHE, padding: '0 12px 0 14px', borderRadius: 99, cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 700, maxWidth: '100%',
            background: R.tealDeep, border: `1px solid ${R.tealDeep}`, color: '#fff',
          }}
        >
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.libelle}</span>
          <X size={15} strokeWidth={2.6} aria-hidden="true" style={{ flexShrink: 0, opacity: 0.9 }} />
        </button>
      ))}
      {pastilles.length > 1 && (
        <button
          type="button"
          onClick={onToutEffacer}
          className="fs-focus"
          style={{
            minHeight: TOUCHE, padding: '0 8px', background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: R.negatifTexte, textDecoration: 'underline',
          }}
        >
          {f ? 'Tout effacer' : 'Clear all'}
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// « À TRAITER · N › » — LA PORTE DES MODES, ET SEULEMENT SI ELLE MÈNE QUELQUE PART
// ═══════════════════════════════════════════════════════════════════════════
// Les brouillons à finir, les prix d'achat manquants, les annonces à republier
// ne sont PAS des filtres : chacun arme un mode avec ses propres cartes, sa
// sélection multiple et son en-tête de sortie. Ils avaient leur rangée de
// pastilles au repos ; ils ont maintenant UNE ligne, discrète.
// ⛔ Rien à traiter → la ligne n'existe pas.
// ⛔ Pas de rouge, pas de ⚠️ : ce n'est pas une alarme, c'est une porte.
export function LigneATraiter({ lang, total, onOuvrir }) {
  if (!total) return null;
  const f = fr(lang);
  return (
    <button
      type="button"
      onClick={onOuvrir}
      className="fs-focus"
      style={{
        display: 'flex', alignItems: 'center', gap: 9, width: '100%', minHeight: TOUCHE,
        padding: '8px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
        background: R.paper, border: `1px solid ${R.border}`, fontFamily: 'inherit',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: R.texteSecondaire }}>
        {f ? 'À traiter' : 'To handle'}
        <span style={{ color: R.ink, fontWeight: 700 }}> · {total}</span>
      </span>
      <ChevronRight size={17} color={R.chevron} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LA LIGNE DE COMPTE — « 15 articles · 45,00 € », le tri à droite
// ═══════════════════════════════════════════════════════════════════════════
// Sous filtre, elle dit « 8 articles sur 15 » : le dénominateur est la seule
// façon de comprendre, d'un coup d'œil, qu'on ne regarde pas tout.
// Le tri vit ICI et nulle part ailleurs (un tri ne restreint rien : il n'a ni
// pastille de sortie ni place dans la feuille — c'est aussi la maquette de
// Nico, et c'est un intitulé de moins dans la feuille).
// Le tap à gauche replie la section, comme avant — la préférence est gardée par
// l'appelant, ce composant ne décide de rien.
export function LigneCompte({ lang, texte, libelleTri, onOuvrirTri, ouvert, onToggle }) {
  const f = fr(lang);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: TOUCHE }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={ouvert}
        className="fs-focus"
        style={{
          display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, minHeight: TOUCHE,
          padding: '0 2px', background: 'transparent', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <span aria-hidden="true" style={{
          fontSize: 13, color: R.chevron, width: 11, flexShrink: 0,
          transform: ouvert ? 'rotate(90deg)' : 'none', transition: 'transform .15s',
        }}>›</span>
        <span style={{
          fontSize: 13, fontWeight: 700, color: R.ink, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{texte}</span>
        <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {ouvert ? (f ? 'Replier' : 'Collapse') : (f ? 'Déplier' : 'Expand')}
        </span>
      </button>
      {/* Rien à trier ⇒ pas de bouton : sur un compte vide, c'était une porte
          qui ne menait nulle part, juste au-dessus de l'écran d'accueil. */}
      {libelleTri && (
        <button
          type="button"
          onClick={onOuvrirTri}
          aria-label={f ? `Trier — ${libelleTri}` : `Sort — ${libelleTri}`}
          className="fs-focus"
          style={{
            flexShrink: 0, minHeight: TOUCHE, padding: '0 6px', background: 'transparent', border: 'none',
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: R.tealDeep,
            whiteSpace: 'nowrap',
          }}
        >
          {libelleTri}
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LA FEUILLE DE FILTRES
// ═══════════════════════════════════════════════════════════════════════════
// `groupes` : [{ cle, intitule, type:'chips', options:[{cle,libelle,compte,actif,onTap}] }]
//          ou [{ cle, intitule, type:'ligne', valeur, onOuvrir }]
// Un groupe sans option n'est pas rendu — pas d'intitulé orphelin.
//
// Un groupe de chips peut porter, au lieu d'`options`, des `sections`
// [{ titre, options }] : UN intitulé, deux rangées nommées. C'est le cas de
// « Plateforme », où « En ligne sur Vinted » et « Pas encore sur Vinted » sont
// deux questions différentes — les mettre à plat donnerait onze chips à
// libellés longs, et deux intitulés en donnerait un de trop.
//
// ⛔ FERMER NE PERD RIEN. Chaque choix s'applique à l'instant où on le touche :
// il n'y a pas d'état « en attente de validation » dans cette feuille, donc rien
// à annuler et rien à perdre. Le bouton du bas n'est pas un « Valider » : il
// ANNONCE le résultat, recalculé en direct, et referme.
const optionsDuGroupe = (g) => (g.sections ? g.sections.flatMap((s) => s.options ?? []) : (g.options ?? []));

export function FeuilleFiltres({ lang, groupes = [], nbResultat, onReinitialiser, onFermer, reinitialisable, actif = true }) {
  const f = fr(lang);
  const rendus = groupes.filter((g) => (g.type === 'ligne' ? true : optionsDuGroupe(g).length > 0));
  return (
    <Coque
      lang={lang}
      actif={actif}
      titre={f ? 'Filtrer' : 'Filter'}
      onFermer={onFermer}
      gauche={reinitialisable ? (
        <button
          type="button"
          onClick={onReinitialiser}
          className="fs-focus"
          style={{
            minHeight: TOUCHE, padding: '0 10px', background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: R.texteSecondaire,
          }}
        >
          {f ? 'Réinitialiser' : 'Reset'}
        </button>
      ) : null}
      pied={(
        <button
          type="button"
          onClick={onFermer}
          className="fs-focus"
          style={{
            width: '100%', minHeight: 52, borderRadius: 14, border: 'none', cursor: 'pointer',
            background: R.tealDeep, color: '#fff', fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
          }}
        >
          {nbResultat === 0
            ? (f ? 'Aucun article' : 'No items')
            : f
              ? `Voir ${nbResultat === 1 ? "l'article" : `les ${nbResultat} articles`}`
              : `Show ${nbResultat === 1 ? 'the item' : `the ${nbResultat} items`}`}
        </button>
      )}
    >
      {rendus.map((g) => (
        <Groupe key={g.cle} intitule={g.intitule}>
          {g.type === 'ligne' ? (
            <LigneGroupe intitule={g.libelleLigne ?? g.intitule} valeur={g.valeur} onOuvrir={g.onOuvrir} lang={lang} />
          ) : g.sections ? (
            g.sections.filter((s) => (s.options ?? []).length).map((s) => (
              <div key={s.cle ?? s.titre} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={{ margin: '0 2px', fontSize: 12, fontWeight: 600, color: R.texteSecondaire }}>{s.titre}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {s.options.map((o) => (
                    <Chip key={o.cle} libelle={o.libelle} compte={o.compte} actif={o.actif} onTap={o.onTap} desactive={o.desactive} />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {g.options.map((o) => (
                <Chip key={o.cle} libelle={o.libelle} compte={o.compte} actif={o.actif} onTap={o.onTap} desactive={o.desactive} />
              ))}
            </div>
          )}
        </Groupe>
      ))}
    </Coque>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LA PETITE FEUILLE — une liste de choix, cherchable si elle est longue
// ═══════════════════════════════════════════════════════════════════════════
// Sert trois fois, avec le même dessin : « À traiter », « Trier », et la liste
// des marques. Trois feuilles distinctes auraient été trois grammaires à tenir.
// `recherche` : true pose un champ en haut. Il ne filtre que l'AFFICHAGE de
// cette liste — aucun rapport avec la recherche du stock.
// `multiple` : on coche plusieurs lignes d'affilée et la feuille NE SE FERME
// PAS au choix — c'est le pied qui referme, en annonçant le résultat. Une liste
// qui se referme à chaque coche rend la sélection multiple inutilisable, et
// c'est exactement ce qu'on veut éviter pour les marques (« Nike ET Adidas »
// est le cas normal d'un vendeur, pas l'exception).
export function FeuilleListe({ lang, titre, options = [], onFermer, recherche = false, multiple = false, nbResultat = null, z = Z_FEUILLE }) {
  const f = fr(lang);
  const [q, setQ] = useState('');
  const champRef = useRef(null);
  useEffect(() => { if (recherche) champRef.current?.focus({ preventScroll: true }); }, [recherche]);

  const vues = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return options;
    return options.filter((o) => String(o.libelle ?? '').toLowerCase().includes(t) || o.epingle);
  }, [options, q]);

  return (
    <Coque
      lang={lang}
      titre={titre}
      onFermer={onFermer}
      z={z}
      pied={multiple && nbResultat != null ? (
        <button
          type="button"
          onClick={onFermer}
          className="fs-focus"
          style={{
            width: '100%', minHeight: 52, borderRadius: 14, border: 'none', cursor: 'pointer',
            background: R.tealDeep, color: '#fff', fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
          }}
        >
          {nbResultat === 0
            ? (f ? 'Aucun article' : 'No items')
            : f
              ? `Voir ${nbResultat === 1 ? "l'article" : `les ${nbResultat} articles`}`
              : `Show ${nbResultat === 1 ? 'the item' : `the ${nbResultat} items`}`}
        </button>
      ) : null}
    >
      {recherche && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, background: R.card,
          border: `1px solid ${R.border}`, borderRadius: 14, padding: '0 14px', minHeight: TOUCHE,
        }}>
          <Search size={17} color={R.chevron} strokeWidth={2} aria-hidden="true" />
          <input
            ref={champRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={f ? 'Chercher' : 'Search'}
            aria-label={titre}
            style={{
              flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 15, fontFamily: 'inherit', color: R.ink, padding: '11px 0',
            }}
          />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {vues.map((o) => (
          <button
            key={o.cle}
            type="button"
            onClick={o.desactive ? undefined : o.onTap}
            disabled={!!o.desactive}
            className="fs-focus"
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: TOUCHE + 8,
              padding: '9px 12px', borderRadius: 12, cursor: o.desactive ? 'default' : 'pointer',
              opacity: o.desactive ? 0.45 : 1, textAlign: 'left', fontFamily: 'inherit',
              background: o.actif ? R.menthe : 'transparent', border: 'none',
            }}
          >
            {o.emoji && <span aria-hidden="true" style={{ fontSize: 17, flexShrink: 0 }}>{o.emoji}</span>}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{
                display: 'block', fontSize: 14.5, fontWeight: o.actif ? 700 : 600,
                color: o.actif ? R.tealDeep : R.ink,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{o.libelle}</span>
              {o.detail && (
                <span style={{ display: 'block', fontSize: 12, color: R.texteSecondaire, marginTop: 2, lineHeight: 1.4 }}>
                  {o.detail}
                </span>
              )}
            </span>
            {o.compte != null && (
              <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: R.texteSecondaire }}>{o.compte}</span>
            )}
            {o.actif && <Check size={18} color={R.tealDeep} strokeWidth={2.4} aria-hidden="true" style={{ flexShrink: 0 }} />}
          </button>
        ))}
        {!vues.length && (
          <div style={{ padding: '18px 12px', fontSize: 13.5, color: R.texteSecondaire, textAlign: 'center' }}>
            {f ? 'Aucun résultat' : 'No match'}
          </div>
        )}
      </div>
    </Coque>
  );
}

export { Z_FEUILLE, Z_FEUILLE_DESSUS };
