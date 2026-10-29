// Pièces communes du Tableau et des Statistiques (ordinateur 28/10, téléphone 29/10) :
// tuiles, puces d'écart, logos, icônes, lignes de vente et d'article.
import PlatformLogo from '../../components/platform-logos/PlatformLogo';
import { ecart } from '../../utils/tableauStats';
import { nomPlateforme, jourCourt } from './outils';

// ── Icônes (traits) ─────────────────────────────────────────────────────────
function Trait({ t = 14, w = 2.2, children }) {
  return <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}
export function IcoChevron() { return <Trait><path d="m9 6 6 6-6 6" /></Trait>; }
export function IcoOuvrir() { return <Trait t={13}><path d="M7 17 17 7M9 7h8v8" /></Trait>; }
export function IcoFermer() { return <Trait t={16}><path d="M6 6l12 12M18 6 6 18" /></Trait>; }
export function IcoInfo() { return <Trait t={16} w={2}><><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></></Trait>; }
export function IcoMain() { return <Trait t={14} w={2}><path d="M3 10h4l3-3 4 1 4-2 3 3-6 6-4-1-3 2H3z" /></Trait>; }
export function IcoEtincelle() { return <Trait t={20} w={2}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></Trait>; }

/** Logo d'une plateforme de vente ; « ailleurs » et « sans plateforme » ont le leur. */
export function Logo({ code, taille = 28 }) {
  const r = Math.round(taille * 0.28);
  if (code === 'ailleurs') return <span className="fsb-logo" style={{ width: taille, height: taille, borderRadius: r, color: '#46524D' }}><IcoMain /></span>;
  if (!code || code === 'sans' || code === 'autre') return <span className="fsb-logo fsb-sans" style={{ width: taille, height: taille, borderRadius: r }} aria-hidden="true" />;
  return <PlatformLogo platform={code} size={taille} />;
}

// ── Puces d'écart ───────────────────────────────────────────────────────────
/**
 * Puce « ▲ 12 % », « ▼ 5,6 pts », « ▲ +2 j ». `inverse` : une hausse est une
 * mauvaise nouvelle (délai). Rien quand l'écart n'existe pas.
 */
export function Puce({ cur, prev, kind = 'pct', inverse = false, f }) {
  const e = ecart(cur, prev, kind);
  if (!e) return null;
  if (e.sens === 0) return <span className="fsb-chip fsb-flat">=</span>;
  const bon = inverse ? e.sens < 0 : e.sens > 0;
  const signe = e.sens > 0 ? '+' : '−';
  const nbsp = String.fromCharCode(160);
  const v = Math.abs(e.valeur);
  const txt = kind === 'pts' ? `${signe}${f.num(v, 1)}${nbsp}${f.L(v >= 2 ? 'pts' : 'pt', v >= 2 ? 'pts' : 'pt')}`
    : kind === 'jours' ? `${signe}${f.num(v, 1)}${nbsp}${f.L('j', 'd')}`
    : `${signe}${f.num(v, 0)}${nbsp}%`;
  return <span className={`fsb-chip ${bon ? 'fsb-up' : 'fsb-down'}`}><span aria-hidden="true">{e.sens > 0 ? '▲' : '▼'}</span>{txt}</span>;
}
export function PuceEtat({ children }) { return <span className="fsb-chip fsb-etat">{children}</span>; }

/** Une tuile d'indicateur : un <button> qui ouvre le détail. */
export function Tuile({ i = 0, lab, val, vide = false, puce = null, cmp = null, sub = null, onOuvrir, aria }) {
  return (
    <button type="button" className="fsb-tile fsb-rise" style={{ '--i': i }} onClick={onOuvrir} aria-label={aria}>
      <span className="fsb-lab">{lab}<IcoOuvrir /></span>
      <span className={`fsb-val${vide ? ' fsb-vide' : ''}`}>{val}</span>
      {(puce || cmp) && <span className="fsb-row">{puce}{cmp && <span className="fsb-cmpt">{cmp}</span>}</span>}
      {sub && <span className="fsb-sub">{sub}</span>}
    </button>
  );
}

/** Sélecteur de période — une ligne, au-dessus de tout ce qu'il pilote. */
export function ChoixPeriode({ valeur, onChange, options, f }) {
  return (
    <div className="fsb-seg" role="group" aria-label={f.L('Période', 'Period')}>
      {options.map((o) => <button key={o.cle} type="button" aria-pressed={valeur === o.cle} onClick={() => onChange(o.cle)}>{o.libelle}</button>)}
    </div>
  );
}

/** Rangées de barres horizontales (délais, catégories, ancienneté). */
export function Barres({ lignes }) {
  const max = Math.max(...lignes.map((l) => l.valeur), 1e-9);
  return (
    <div className="fsb-hrows">
      {lignes.map((l, i) => (
        <div key={l.cle} className={`fsb-hr${l.discret ? ' fsb-muted' : ''}`}>
          <span className="fsb-l">{l.icone}<span title={typeof l.libelle === 'string' ? l.libelle : undefined}>{l.libelle}</span></span>
          <span className="fsb-trk"><i className="fsb-barx" style={{ width: `${Math.max(0, (l.valeur / max) * 100).toFixed(1)}%`, '--i': i, ...(l.couleur ? { background: l.couleur } : null) }} /></span>
          <span className="fsb-v">{l.texte}{l.detail != null && <small>{l.detail}</small>}</span>
        </div>
      ))}
    </div>
  );
}

// ── Lignes et blocs partagés par le panneau (ordinateur) et la feuille (téléphone) ──
/** Petite tuile non cliquable du détail. */
export function MiniTuile({ lab, val, puce, cmp, sub }) {
  return (
    <div className="fsb-tile fsb-fixe">
      <span className="fsb-lab">{lab}</span>
      <span className="fsb-val">{val}</span>
      {(puce || cmp) && <span className="fsb-row">{puce}{cmp && <span className="fsb-cmpt">{cmp}</span>}</span>}
      {sub && <span className="fsb-sub">{sub}</span>}
    </div>
  );
}

/** Une ligne d'article (stock) : âge, titre, plateformes, prix. */
export function LigneArticle({ a, f, neutre = false, montant = null }) {
  return (
    <div className="fsb-li">
      <span className={`fsb-age${neutre ? ' fsb-neutre' : ''}`}>{montant ?? (a.age != null ? f.jours(a.age) : '—')}</span>
      <span style={{ minWidth: 0 }}>
        <span className="fsb-t" title={a.titre}>{a.titre}</span>
        <span className="fsb-m">{a.plateformes.length ? a.plateformes.map((p) => nomPlateforme(p, f)).join(' · ') : f.L('en ligne nulle part', 'not online anywhere')}{a.importe ? f.L(' · importé', ' · imported') : ''}</span>
      </span>
      <span className="fsb-v">{a.prixAffiche ? f.eur(a.prixAffiche) : '—'}<small className="fsb-z">{a.prixAchat == null ? f.L('achat ?', 'cost ?') : a.prixAchat === 0 ? f.L('acheté 0 €', 'free') : `${f.L('acheté', 'cost')} ${f.eur(a.prixAchat)}`}</small></span>
    </div>
  );
}

/** Une ligne de vente : plateforme, titre, date, délai, prix, profit. */
export function LigneVente({ v, f, lang }) {
  return (
    <div className="fsb-li">
      <Logo code={v.plateforme ?? 'sans'} taille={28} />
      <span style={{ minWidth: 0 }}>
        <span className="fsb-t" title={v.titre}>{v.titre}</span>
        <span className="fsb-m">{v.jour ? jourCourt(v.jour, lang) : f.L('date inconnue', 'unknown date')}{v.delai != null ? f.L(` · vendu en ${f.jours(v.delai)}`, ` · sold in ${f.jours(v.delai)}`) : ''}</span>
      </span>
      <span className="fsb-v">{f.eur(v.prix)}{v.benefice != null
        ? <small className={v.gratuit ? 'fsb-z' : ''}>{v.gratuit ? f.L('acheté 0 €', 'free item') : `${v.benefice >= 0 ? '+' : ''}${f.eur(v.benefice)}`}</small>
        : <small className="fsb-z">{f.L('prix d’achat ?', 'cost ?')}</small>}</span>
    </div>
  );
}

const COUL_DIST = ['var(--fsb-teal-deep)', 'var(--fsb-teal)', 'var(--fsb-teal-soft)', 'var(--fsb-amber-soft)', 'var(--fsb-amber)'];
/** Répartition des délais : barre empilée + légende chiffrée (jamais la couleur seule). */
export function Repartition({ d, f }) {
  const lib = [f.L('le jour même', 'same day'), f.L('1 à 2 j', '1–2 d'), f.L('3 à 7 j', '3–7 d'), f.L('8 à 30 j', '8–30 d'), f.L('plus de 30 j', '30+ d')];
  return (
    <>
      <div className="fsb-dist" aria-hidden="true">{d.map((x, i) => <i key={i} style={{ flex: x.n || 0.0001, background: COUL_DIST[i] }} />)}</div>
      <div className="fsb-lg">{d.map((x, i) => <div key={i}><i style={{ background: COUL_DIST[i] }} />{lib[i]}<b>{x.n}</b></div>)}</div>
    </>
  );
}

/** Ancienneté du stock (barres) — tranches 0–29, 30–59, 60–89, 90+ jours. */
export function BarresAges({ stock, f }) {
  const lib = (a) => (a.a === Infinity || a.a == null ? f.L(`${a.de} j et plus`, `${a.de}+ d`) : a.de === 0 ? f.L('moins de 30 j', 'under 30 d') : f.L(`${a.de} à ${a.a} j`, `${a.de}–${a.a} d`));
  return <Barres lignes={stock.ages.map((a, i) => ({ cle: a.de, libelle: lib(a), valeur: a.nb, texte: f.num(a.nb), detail: a.investi ? f.eur0(a.investi) : '—', discret: i === 0, couleur: i >= 2 ? 'var(--fsb-amber)' : i === 1 ? 'var(--fsb-teal)' : null }))} />;
}
