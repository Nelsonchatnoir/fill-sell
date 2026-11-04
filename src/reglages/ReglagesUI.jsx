// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES — LES PRIMITIVES DE LA PAGE (2026-09-18)
// ═══════════════════════════════════════════════════════════════════════════
// La trame de la maquette, et rien d'autre : un écran plein (en-tête + corps
// défilant), des groupes coiffés d'un intitulé en petites capitales, des cartes
// blanches à bord fin, des lignes de 56 px avec leur valeur à droite, des
// jauges, une bande d'information, un encadré sensible.
//
// ⛔ CE QUI EST NON NÉGOCIABLE ICI, parce que ça s'est déjà payé :
//   · `useFondFige` sur l'écran — c'est LE seul mécanisme qui retire `.bnav`
//     (elle porte un backdrop-filter, donc sa propre couche de compositing, que
//     WebKit place au-dessus d'un position:fixed quel que soit le z-index :
//     défaut constaté sur la pop-up « Vues et favoris » le 18/09) et qui
//     empêche le geste d'atteindre le fond sans rien figer ;
//   · safe-area en HAUT et en BAS, sur l'en-tête et sur le corps ;
//   · 44 px de zone tactile minimum sur tout ce qui se touche ;
//   · une sortie visible en permanence (le retour est dans l'en-tête, qui ne
//     défile pas) et une sortie au clavier (Échap) ;
//   · aucune couleur écrite ici : tout vient de `R` (theme.js), lui-même
//     dérivé de `UI`.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useFondFige } from '../utils/modale';
import { JAUGES, jaugesDuCompte, palierQuiDebloque, grilleDuPalier, nombre, motJauge } from '../utils/jauges';
import { nomDuPalier } from '../utils/palier';
import { R, CSS_REGLAGES } from './theme';
import { murDeLaJauge } from './refusEtMurs';

// ── Z-INDEX 400, ET C'EST TOUT LE SUJET DES « LIGNES MORTES » ──────────────
// La page est un PORTAIL sur document.body ; les couches que l'app ouvre
// par-dessus (modale des offres 9990, pop-up « signaler un bug » 10000, Toast
// 500) vivent, elles, DANS `.app-root`. À 9985, la page passait DEVANT elles :
// on cliquait, l'app ouvrait bien la couche, et personne ne la voyait —
// « Comparer les formules » et « Signaler un bug » avaient l'air morts, et les
// toasts « ✅ enregistré » ne s'affichaient jamais.
// Le Toast le prouve sans discussion possible : z-index 500, il ne POUVAIT pas
// passer devant 9985. (Sur iOS s'ajoute le piège déjà documenté ailleurs dans
// ce dépôt : `.app-root` porte -webkit-overflow-scrolling:touch, et WKWebView
// peint les position:fixed de ce conteneur DANS SA COUCHE, z-index ou pas.)
// 400 rétablit l'ordre d'avant la refonte — l'ancienne pop-up de réglages
// vivait à 200, sous exactement les mêmes couches — tout en restant au-dessus
// de la barre du haut (10) et de la nav (50).
// ⛔ NE PAS REMONTER cette valeur sans vérifier ce qu'elle enterre.
const STYLE_ECRAN = {
  position: 'fixed', inset: 0, zIndex: 400, background: R.page,
  display: 'flex', flexDirection: 'column', color: R.ink, fontFamily: 'inherit',
};

// ── ÉCRAN PLEIN ────────────────────────────────────────────────────────────
// `actif` : l'écran est-il au PREMIER PLAN ? Un écran tiers ouvert par-dessus
// (les réglages de republication, par exemple) le passe à false — sans quoi
// Échap fermerait les deux couches d'un coup.
export function EcranReglages({ titre, onRetour, actif = true, pile = false, cle = 'hub', children }) {
  useFondFige(true);
  const retourRef = useRef(null);

  useEffect(() => {
    if (!actif) return undefined;
    const surTouche = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onRetour?.(); }
    };
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [actif, onRetour]);

  // Le clavier entre dans la page par sa sortie : la première tabulation
  // atteint le retour, jamais un champ perdu au milieu du défilement.
  useEffect(() => { retourRef.current?.focus({ preventScroll: true }); }, [titre]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titre}
      className="rg-ecran"
      style={STYLE_ECRAN}
    >
      <style>{CSS_REGLAGES}</style>

      {/* En-tête fixe : la sortie ne défile jamais hors de l'écran. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        padding: 'calc(env(safe-area-inset-top,0px) + 14px) 16px 14px',
        borderBottom: `1px solid ${R.border}`, background: R.paper,
      }}>
        <button
          ref={retourRef}
          type="button"
          onClick={onRetour}
          aria-label={titre ? `${titre} — retour` : 'Retour'}
          className="rg-retour rg-focus"
          style={{
            width: 44, height: 44, borderRadius: 22, flexShrink: 0, border: 'none',
            background: R.chip, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'transform .12s ease', padding: 0,
          }}
        >
          <ChevronLeft size={21} color={R.ink} strokeWidth={2} />
        </button>
        <h1 style={{ margin: 0, fontSize: 23, fontWeight: 700, letterSpacing: '-0.03em', color: R.ink }}>{titre}</h1>
      </div>

      {/* Corps défilant. La réserve basse embarque la safe-area : rien ne se
          coince derrière l'encoche ni derrière la barre de gestes. */}
      {/* `key` : changer d'écran REMONTE le conteneur — le défilement repart
          en haut (sinon on arrive au milieu d'une sous-page) et l'animation
          d'entrée rejoue. */}
      <div
        key={cle}
        className={pile ? 'rg-corps rg-pile' : 'rg-corps'}
        style={{
          flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          padding: '20px 16px calc(env(safe-area-inset-bottom,0px) + 36px)',
          display: 'flex', flexDirection: 'column', gap: 26,
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ── GROUPE ─────────────────────────────────────────────────────────────────
// Intitulé en petites capitales + contenu. `appoint` = la précision alignée à
// droite de l'intitulé (« remise à zéro le 01/10 »).
export function Groupe({ intitule, appoint, ton, children }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {intitule && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '0 4px' }}>
          <h2 style={{
            margin: 0, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.12em', color: ton === 'danger' ? R.negatifTexte : R.texteSecondaire,
          }}>{intitule}</h2>
          {appoint && <span style={{ fontSize: 12, color: R.texteSecondaire, fontWeight: 500 }}>{appoint}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

// ── CARTE ──────────────────────────────────────────────────────────────────
export function Carte({ children, pad = false, style }) {
  return (
    <div style={{
      background: R.card, border: `1px solid ${R.border}`, borderRadius: 16,
      overflow: 'hidden', ...(pad ? { padding: '16px' } : null), ...style,
    }}>
      {children}
    </div>
  );
}

// ── LIGNE ──────────────────────────────────────────────────────────────────
// Le seul objet du hub. Trois formes, une seule silhouette :
//   · bouton  (onClick)          → ouvre une sous-page ou déclenche une action
//   · lien    (href)             → sort de l'app (mailto, /legal, plateforme)
//   · inerte  (ni l'un ni l'autre) → porte un état, pas un geste
// `valeur` s'affiche à droite ; `alerte` la passe en négatif (« à renseigner »).
export function Ligne({ icone: Icone, libelle, valeur, alerte = false, onClick, href, cible, chevron, apres }) {
  const cliquable = Boolean(onClick || href);
  const montreChevron = chevron ?? cliquable;
  const contenu = (
    <>
      {Icone && <Icone size={20} color={R.ink} strokeWidth={1.7} style={{ flexShrink: 0 }} />}
      <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, color: R.ink }}>{libelle}</span>
      {valeur != null && valeur !== '' && (
        <span style={{
          fontSize: 13, fontWeight: 500, color: alerte ? R.negatifTexte : R.texteSecondaire,
          flexShrink: 0, maxWidth: '48%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{valeur}</span>
      )}
      {apres}
      {montreChevron && <ChevronRight size={18} color={R.chevron} strokeWidth={2} style={{ flexShrink: 0 }} />}
    </>
  );
  if (href) {
    return (
      <a className="rg-ligne" data-cliquable="1" href={href} target={cible} rel={cible === '_blank' ? 'noopener noreferrer' : undefined}>
        {contenu}
      </a>
    );
  }
  if (onClick) {
    return <button type="button" className="rg-ligne" data-cliquable="1" onClick={onClick}>{contenu}</button>;
  }
  return <div className="rg-ligne">{contenu}</div>;
}

// ── JAUGE ──────────────────────────────────────────────────────────────────
// Le consommé À GAUCHE du plafond, la barre, puis LE RESTE en clair dessous —
// c'est le reste qui intéresse, pas le consommé (décision du 18/09).
export function Jauge({ libelle, consomme, plafond, reste, sous }) {
  const total = Number(plafond);
  const fait = Number(consomme);
  const part = Number.isFinite(total) && total > 0 && Number.isFinite(fait)
    ? Math.min(100, Math.max(0, (fait / total) * 100))
    : null;
  const epuise = Number.isFinite(reste) && reste === 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 14.5, fontWeight: 500, color: R.ink }}>{libelle}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: R.ink, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {Number.isFinite(fait) ? fait.toLocaleString('fr-FR') : '—'}
          {Number.isFinite(total) && total > 0 && (
            <span style={{ color: R.texteSecondaire, fontWeight: 500 }}> / {total.toLocaleString('fr-FR')}</span>
          )}
        </span>
      </div>
      {part != null && (
        <div style={{ height: 7, borderRadius: 4, background: R.border, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${part}%`, borderRadius: 4,
            background: epuise ? R.amber : `linear-gradient(120deg,${R.teal},${R.tealDeep})`,
            transition: 'width .3s ease',
          }} />
        </div>
      )}
      {sous && <span style={{ fontSize: 12, color: R.texteSecondaire }}>{sous}</span>}
    </div>
  );
}

// La republication a DEUX modes (illimité / mensuel — le gratuit est mensuel
// depuis le 05/10, 50 par mois) : une jauge n'a de sens que pour le second, et
// « illimitées » n'est pas un chiffre.
// Rendue à l'identique dans le hub et dans la sous-page Abonnement.
export function JaugeRepublication({ repub, T }) {
  if (!repub) return null;
  if (repub.mode === 'illimite') {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 14.5, fontWeight: 500, color: R.ink }}>{T.republications}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: R.tealDeep }}>{T.illimitees}</span>
      </div>
    );
  }
  if (repub.plafond == null) return null;
  return (
    <Jauge
      libelle={T.republications}
      consomme={repub.faites}
      plafond={repub.plafond}
      reste={repub.restantes}
      sous={repub.restantes == null ? null : T.restantes(repub.restantes, T.motRepublications)}
    />
  );
}

// ══ LA GRILLE À 3 JAUGES (04/11/2026, maquettes 3.1 et 3.2 validées par Nico le 03/11) ═══════════════════════
// Rendue SEULEMENT quand quotas_etat porte « grille » (jaugesDuCompte non nul) : interrupteur à 0, le hub et la
// sous-page Abonnement gardent leurs compteurs d'avant, à l'identique.
//   · Annonces · Publications · Remontées, toujours dans cet ordre ;
//   · « illimitées » se dit avec le mot, en vert — jamais une jauge pleine ni un faux chiffre ;
//   · une jauge vide passe en ambre (Jauge) et dit en une ligne quand elle revient — la remise à zéro LUE par la
//     page (c.remiseAZero), jamais une date inventée — et le palier qui la débloque, par un lien qui ouvre les
//     offres sur le mur de cette jauge ;
//   · les retouches IA restent À PART, sous les jauges (rien en Free : plafond 0) ;
//   · Business : « Tout illimité, sauf Lens (600 par mois) et retouches IA (50 par mois). », puis Lens.
// Le hub (variante 'hub', plus court) et la sous-page ('page') lisent la MÊME source : ils disent la même chose.
// c.configJauges : les clés jauge_* de coin_config, lues par la page — undefined tant qu'elle n'a pas répondu (le
// lien du palier attend : aucun chiffre en dur), null si illisible (repli GRILLE_REPLI, comme la feuille des offres).

export function JaugeIllimitee({ libelle, T, children }) {
  return (
    <div data-jauge-illimitee="1" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 14.5, fontWeight: 500, color: R.ink }}>{libelle}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: R.tealDeep }}>{T.illimitees}</span>
      </div>
      {children}
    </div>
  );
}

// Le lien d'une jauge vide : 44 px de zone tactile (marges négatives : la ligne de texte ne grandit pas).
function LienMur({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rg-focus"
      data-lien-mur="1"
      style={{
        background: 'none', border: 'none', padding: '13px 0', margin: '-13px 0', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: R.tealDeep,
        textDecoration: 'underline', textUnderlineOffset: 2,
      }}
    >
      {children}
    </button>
  );
}

export function ConsommationGrille({ c, T, variante = 'page' }) {
  const q = c.quotas;
  const jauges = jaugesDuCompte(q);
  if (!jauges) return null;
  const lang = c.lang === 'en' ? 'en' : 'fr';
  const hub = variante === 'hub';
  const d = c.remiseAZero ?? null;
  const LIBELLE = { annonces: T.jaugeAnnonces, publications: T.jaugePublications, remontees: T.jaugeRemontees };
  const toutIllimite = JAUGES.every((cle) => jauges[cle].illimite);
  const lens = jauges.lens;
  const ret = q.retouches?.plafond != null && Number(q.retouches.plafond) > 0 ? q.retouches : null;

  // Le palier qui débloque une jauge vide (le plus proche, pas le plus cher), et le mur qu'ouvre son lien.
  const lienDuPalier = (cle) => {
    if (c.configJauges === undefined || typeof c.ouvrirOffres !== 'function') return null;
    const reco = palierQuiDebloque(cle, q.palier, c.configJauges);
    const mur = reco ? murDeLaJauge(cle, q, { remise: c.remiseIso ?? null }) : null;
    if (!mur) return null;
    const v = grilleDuPalier(c.configJauges, reco)[cle];
    return (
      <LienMur onClick={() => c.ouvrirOffres('reglages_jauge', mur)}>
        {T.debloquePar(v === Infinity ? null : nombre(v, lang), nomDuPalier(reco))}
      </LienMur>
    );
  };
  const sousDe = (cle, j) => {
    if (j.restantes > 0) return T.resteJauge(nombre(j.restantes, lang), motJauge(cle, j.restantes, lang), j.restantes);
    const phrase = hub ? T.jaugeVideCourt(cle, d) : T.jaugeVide(nombre(j.plafond, lang), motJauge(cle, j.plafond, lang), cle, d);
    const lien = lienDuPalier(cle);
    return <>{phrase}{lien ? <> {lien}</> : null}</>;
  };
  const jaugeFinie = (cle, j) => (
    <Jauge key={cle} libelle={LIBELLE[cle]} consomme={j.consommes} plafond={j.plafond} reste={j.restantes} sous={sousDe(cle, j)} />
  );
  // Lens du Business : « dont Lens » sous les annonces (page), « Lens » seul dans l'accueil.
  const jaugeLens = () => {
    if (!lens) return null;
    const sous = lens.restantes > 0
      ? (hub ? T.scansRestants : T.scansLensRestants)(nombre(lens.restantes, lang), lens.restantes)
      : (hub ? T.lensVideCourt(d) : T.lensVide(nombre(lens.plafond, lang), d));
    return <Jauge libelle={hub ? T.jaugeLens : T.dontLens} consomme={lens.consommes} plafond={lens.plafond} reste={lens.restantes} sous={sous} />;
  };
  const phraseBusiness = toutIllimite ? (
    <p data-tout-illimite="1" style={{ margin: 0, fontSize: 13, fontWeight: 600, color: R.tealDeep, lineHeight: 1.45 }}>
      {T.toutIllimite(lens ? nombre(lens.plafond, lang) : null, ret ? nombre(ret.plafond, lang) : null)}
    </p>
  ) : null;

  if (hub) {
    const r = ret ? (Number.isFinite(Number(ret.restantes)) ? Number(ret.restantes) : Math.max(0, Number(ret.plafond) - (Number(ret.consommes) || 0))) : null;
    return (
      <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {toutIllimite
          ? <>{phraseBusiness}{jaugeLens()}</>
          : JAUGES.map((cle) => (jauges[cle].illimite
            ? <JaugeIllimitee key={cle} libelle={LIBELLE[cle]} T={T} />
            : jaugeFinie(cle, jauges[cle])))}
        {ret && (
          // Les retouches IA : une ligne À PART, sous un filet, hors des 3 jauges.
          <div data-retouches-a-part="1" style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10,
            borderTop: `1px solid ${R.ligneDouce}`, paddingTop: 12,
          }}>
            <span style={{ fontSize: 13.5, fontWeight: 500, color: R.ink }}>{T.retouchesIA}</span>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: R.ink, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
              {T.retouchesSur(nombre(r, lang), nombre(Number(ret.plafond), lang))}
            </span>
          </div>
        )}
      </Carte>
    );
  }

  return (
    <>
      <Groupe intitule={T.consommation} appoint={d ? T.remiseAZeroLe(d) : null}>
        <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {phraseBusiness}
          {JAUGES.map((cle) => {
            const j = jauges[cle];
            if (!j.illimite) return jaugeFinie(cle, j);
            return (
              <JaugeIllimitee key={cle} libelle={LIBELLE[cle]} T={T}>
                {cle === 'annonces' && lens ? (
                  <div style={{ marginLeft: 12, paddingLeft: 10, borderLeft: `2px solid ${R.ligneDouce}` }}>{jaugeLens()}</div>
                ) : null}
              </JaugeIllimitee>
            );
          })}
        </Carte>
      </Groupe>
      {ret && (
        // Les retouches IA : leur propre groupe, sous les jauges, inchangé (Premium 5, Pro 20, Business 50).
        <Groupe intitule={T.retouchesIA} appoint={d ? T.remiseAZeroLe(d) : null}>
          <Carte pad>
            <Jauge
              libelle={T.retouchesIA}
              consomme={ret.consommes}
              plafond={ret.plafond}
              reste={ret.restantes}
              sous={ret.restantes != null ? T.restantes(ret.restantes, T.motRetouches) : null}
            />
          </Carte>
        </Groupe>
      )}
    </>
  );
}

// ── BANDE D'INFORMATION ────────────────────────────────────────────────────
// Le renvoi assumé (Apple, Google) : une phrase, un lien, en bas de page.
export function BandeInfo({ children, lien, libelleLien }) {
  return (
    <div style={{
      display: 'flex', gap: 12, padding: 16, borderRadius: 14,
      background: R.menthe, border: `1px solid ${R.mentheBord}`,
    }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={R.tealDeep} strokeWidth="1.7"
        strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: R.ink }}>{children}</p>
        {lien && (
          <a href={lien} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 13.5, fontWeight: 700, color: R.tealDeep, textDecoration: 'none', minHeight: 24 }}>
            {libelleLien}
          </a>
        )}
      </div>
    </div>
  );
}

// ── CARTE D'IDENTITÉ ───────────────────────────────────────────────────────
// ⛔ CE QUI DÉBORDE SE TRONQUE À L'HORIZONTALE, JAMAIS À LA VERTICALE.
// Le cas COURANT, pas l'exception : un e-mail long (« nicolas.svobodny@
// gmail.com ») et un pseudo long. Les trois règles qui le garantissent :
//   · la carte n'a AUCUNE hauteur imposée — elle suit son contenu (le corps
//     de l'écran ne comprime plus ses enfants, cf. .rg-corps dans theme.js) ;
//   · la colonne de texte porte minWidth:0 — sans lui, un enfant flex refuse
//     de descendre sous la largeur de son contenu et l'ellipse ne s'applique
//     jamais ;
//   · pseudo ET e-mail portent chacun leur ellipse. Le pseudo aussi : sans
//     elle, un pseudo long pousse le badge de palier hors du cadre.
export function CarteIdentite({ nom, email, badge }) {
  // Première lettre RÉELLE : un pseudo vide ou fait d'espaces retombe sur
  // l'e-mail, et un compte sans les deux garde un repère plutôt qu'un vide.
  const source = String(nom ?? '').trim() || String(email ?? '').trim();
  const initiale = source ? source.charAt(0).toUpperCase() : '?';
  return (
    <Carte style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
      <div aria-hidden="true" style={{
        width: 52, height: 52, borderRadius: 26, flexShrink: 0, flexGrow: 0,
        background: `linear-gradient(135deg,${R.teal},${R.tealDeep})`, color: '#fff',
        fontSize: 22, fontWeight: 700, lineHeight: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{initiale}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 auto', minWidth: 0 }}>
        {nom && (
          <strong style={{
            fontSize: 17, fontWeight: 700, color: R.ink, letterSpacing: '-0.02em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{nom}</strong>
        )}
        <span style={{
          fontSize: 13, color: R.texteSecondaire, lineHeight: 1.35,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{email}</span>
      </div>
      {badge && <span style={{ flexShrink: 0, display: 'inline-flex' }}>{badge}</span>}
    </Carte>
  );
}

// ── PASTILLE D'ÉTAT ────────────────────────────────────────────────────────
// `ton` : 'ok' (point teal), 'ko' (point négatif), 'inconnu' (point pâle).
export function Pastille({ ton, children }) {
  const couleur = ton === 'ok' ? R.teal : ton === 'ko' ? R.negative : R.chevron;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: couleur, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: R.texteSecondaire, fontWeight: 500 }}>{children}</span>
    </span>
  );
}

// ── CHAMP DE SAISIE ────────────────────────────────────────────────────────
export function Champ({ label, erreur, style, ...reste }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, ...style }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: R.texteSecondaire }}>{label}</span>
      <input
        {...reste}
        style={{
          minHeight: 46, padding: '0 14px', borderRadius: 12, width: '100%', boxSizing: 'border-box',
          border: `1px solid ${erreur ? R.negative : R.border}`, background: R.paper,
          fontFamily: 'inherit', fontSize: 15, color: R.ink, outline: 'none',
        }}
      />
    </label>
  );
}

// ── BOUTONS ────────────────────────────────────────────────────────────────
// `ton` : 'plein' (action principale), 'creux' (secondaire), 'danger-creux',
// 'danger-plein'. Toujours ≥ 44 px de haut.
export function Bouton({ ton = 'plein', enCours = false, disabled, children, style, ...reste }) {
  const base = {
    minHeight: 46, padding: '0 20px', borderRadius: 23, fontFamily: 'inherit',
    fontSize: 14.5, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    opacity: (disabled || enCours) ? 0.55 : 1, transition: 'opacity .15s ease, background .15s ease',
  };
  const tons = {
    plein: { border: 'none', background: `linear-gradient(120deg,${R.teal},${R.tealDeep})`, color: '#fff' },
    creux: { border: `1px solid ${R.border}`, background: R.card, color: R.ink },
    'danger-creux': { border: `1px solid ${R.negative}`, background: R.card, color: R.negatifTexte },
    'danger-plein': { border: 'none', background: R.negatifTexte, color: '#fff' },
  };
  return (
    <button type="button" disabled={disabled || enCours} className="rg-focus" style={{ ...base, ...tons[ton], ...style }} {...reste}>
      {children}
    </button>
  );
}

// ── ENCADRÉ SENSIBLE ───────────────────────────────────────────────────────
// Chaque bloc DIT CE QU'IL FAIT avant qu'on le touche : titre, une phrase,
// puis le bouton. Jamais un bouton nu.
export function CadreSensible({ children }) {
  return (
    <div style={{ background: R.card, border: `1px solid ${R.dangerBord}`, borderRadius: 16, overflow: 'hidden' }}>
      {children}
    </div>
  );
}

export function BlocSensible({ titre, texte, children, dernier = false }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10, padding: 16,
      borderBottom: dernier ? 'none' : `1px solid ${R.dangerDoux}`,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <strong style={{ fontSize: 15, fontWeight: 700, color: R.ink }}>{titre}</strong>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: R.texteSecondaire }}>{texte}</p>
      </div>
      {children}
    </div>
  );
}

// ── NOTE SOUS UNE CARTE ────────────────────────────────────────────────────
export function Note({ children }) {
  return <p style={{ margin: 0, padding: '0 4px', fontSize: 12, lineHeight: 1.5, color: R.texteSecondaire }}>{children}</p>;
}

// ── PIED DE PAGE ───────────────────────────────────────────────────────────
export function PiedPage({ children }) {
  return <div style={{ textAlign: 'center', fontSize: 12, color: R.texteSecondaire, paddingTop: 4 }}>{children}</div>;
}
