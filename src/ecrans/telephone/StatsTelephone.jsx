// ═══════════════════════════════════════════════════════════════════════════
// STATISTIQUES SUR TÉLÉPHONE (29/10) — maquette validée par Nico le 29/10.
// Les blocs de l'ordinateur (StatsBureau) sur une colonne, lus au doigt :
// plateforme la plus rentable (liste à 4 mini-valeurs au lieu d'un tableau),
// mois par mois, délai de vente constaté, marques, catégories, prix encaissé /
// prix affiché, écoulement, jours de vente, « Meilleures ventes » (bloc mobile
// d'avant, gardé), analyse IA (même effet, même cache : StatsTab).
// Mêmes chiffres partout : utils/tableauStats.js. Ouvert à tous les paliers.
// ═══════════════════════════════════════════════════════════════════════════
import { useMemo, useState } from 'react';
import '../bureau/bureau.css';
import './telephone.css';
import { blocPeriode, comparable, etatStock, evolutionMensuelle, meilleuresVentes, nbHeuresReelles, nbSansDate } from '../../utils/tableauStats';
import { toucherLeger } from '../../utils/retourHaptique';
import { Colonnes } from '../bureau/Graphes';
import { axeMois, axeSimple } from '../bureau/axe';
import { Logo, Puce, Tuile, Barres, IcoInfo, IcoEtincelle, IcoChevron, BarresAges, Repartition } from '../bureau/pieces';
import { formats, libellesPeriode, jourCourt, moisAnnee, nomPlateforme, useSuiviSaisie } from '../bureau/outils';
import FeuilleDetail from './FeuilleDetail';
import { PastillesPeriode } from './TableauTelephone';

const JOURS = { fr: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'], en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] };
const JOURS_C = { fr: ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'], en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] };
const TRANCHES = [['auDessus', 'var(--fsb-teal-deep)'], ['auPrix', 'var(--fsb-teal)'], ['moins10', 'var(--fsb-teal-soft)'], ['moins25', 'var(--fsb-amber-soft)'], ['plus25', 'var(--fsb-amber)']];
const MEDAILLES = [['#F2D38A', '#C9A24A', '#4A3A10'], ['#E6E8EA', '#AEB4B8', '#2F3639'], ['#F0C7A6', '#B9733F', '#4A250B']];
const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export default function StatsTelephone({ ctx, lang, currency, cle, setCle, ia, setTab }) {
  useSuiviSaisie();
  const f = useMemo(() => formats(lang, currency), [lang, currency]);
  const [onglet, setOnglet] = useState('plateforme');
  const [pile, setPile] = useState([]);
  const bloc = useMemo(() => blocPeriode(ctx, cle), [ctx, cle]);
  const stock = useMemo(() => etatStock(ctx), [ctx]);
  const evolution = useMemo(() => evolutionMensuelle(ctx), [ctx]);
  const meilleures = useMemo(() => meilleuresVentes(ctx, cle, 3), [ctx, cle]);
  const sansDate = useMemo(() => nbSansDate(ctx.ventes), [ctx]);
  const heures = useMemo(() => nbHeuresReelles(ctx.ventes), [ctx]);
  const lp = libellesPeriode(bloc.periode, lang);
  const ok = comparable(bloc);
  const I = bloc.ind, V = bloc.prev;
  const ouvrir = (o) => { toucherLeger(); setPile([o]); };
  const aller = (t) => { setPile([]); setTab(t); try { localStorage.setItem('tab', t); } catch { /* préférence locale */ } };
  const p = bloc.periode;
  const bornes = p.debut ? f.L(`du ${jourCourt(p.debut, lang)} ${p.debut.slice(0, 4)} au ${jourCourt(p.fin, lang)}`, `${jourCourt(p.debut, lang)} ${p.debut.slice(0, 4)} – ${jourCourt(p.fin, lang)}`) : f.L('tout l’historique', 'full history');

  const reelles = bloc.plateformes.filter((l) => !['sans', 'ailleurs', 'autre'].includes(l.code));
  const plusProfit = reelles.filter((l) => l.profitRetenues > 0).reduce((a, b) => (!a || b.profit > a.profit ? b : a), null);
  const plusMarge = reelles.filter((l) => l.margeRetenues >= 5 && l.marge != null).reduce((a, b) => (!a || b.marge > a.marge ? b : a), null);
  const plusVite = reelles.filter((l) => l.delaiN >= 5).reduce((a, b) => (!a || b.delai < a.delai ? b : a), null);
  const dl = bloc.delais;
  const lignesDelai = (onglet === 'plateforme' ? dl.plateforme : onglet === 'categorie' ? dl.categorie.filter((x) => x.n >= 3) : dl.marque).slice(0, 6);
  const nonClasse = bloc.categories.find((c) => c.cle === '∅');
  const classees = bloc.categories.filter((c) => c.cle !== '∅');
  const pa = bloc.prixAffiche;
  const js = bloc.joursSemaine;
  const jmax = Math.max(...js.jours.map((j) => j.nb), 0);
  const top2 = [...js.jours].sort((a, b) => b.nb - a.nb).slice(0, 2).filter((j) => j.nb > 0);
  const lj = lang === 'en' ? 'en' : 'fr';
  const evRecent = [...evolution].reverse();

  return (
    <div className="fsb fst">
      <div className="fst-hello fsb-rise"><h1>{f.L('Statistiques', 'Statistics')}</h1><p>{lp.bouton} · {bornes}</p></div>
      <PastillesPeriode valeur={cle} onChange={setCle} auj={ctx.auj} lang={lang} f={f} />
      {p.precedente && !ok
        ? <div className="fsb-banner"><IcoInfo /><span>{V.nb === 0 ? f.L(`Pas d’écart affiché : aucune vente datée · ${lp.avant}.`, `No change shown: no dated sale · ${lp.avant}.`) : f.L(`Pas d’écart affiché : ${V.nb} vente${V.nb > 1 ? 's' : ''} datée${V.nb > 1 ? 's' : ''} seulement · ${lp.avant}, trop peu pour comparer.`, `No change shown: only ${V.nb} dated sale${V.nb > 1 ? 's' : ''} · ${lp.avant}, too few to compare.`)}</span></div>
        : <div className="fst-cmp">{!p.precedente ? f.L('Tout l’historique, ventes sans date comprises', 'Full history, undated sales included') : f.L(`Comparé au ${lp.avant}`, `Compared with ${lp.avant}`)}</div>}

      <div className="fsb-kpis">
        <Tuile i={1} lab={f.L('Encaissé', 'Collected')} val={f.eur(I.encaisse)} puce={ok && <Puce cur={I.encaisse} prev={V.encaisse} f={f} />} cmp={ok ? lp.avant : null} onOuvrir={() => ouvrir({ k: 'encaisse' })} aria={`${f.L('Encaissé', 'Collected')} : ${f.eur(I.encaisse)}`} />
        <Tuile i={2} lab={f.L('Profit', 'Profit')} val={I.profitRetenues ? f.eur(I.profit) : '—'} vide={!I.profitRetenues} puce={ok && I.profitRetenues ? <Puce cur={I.profit} prev={V.profit} f={f} /> : null} cmp={I.profitExclus ? f.L(`${I.profitExclus} sans prix d’achat`, `${I.profitExclus} without cost`) : null} onOuvrir={() => ouvrir({ k: 'profit' })} aria={`${f.L('Profit', 'Profit')} : ${f.eur(I.profit)}`} />
        <Tuile i={3} lab={f.L('Marge', 'Margin')} val={f.pct(I.marge)} vide={I.marge == null} puce={ok && I.marge != null && V.marge != null && <Puce cur={I.marge} prev={V.marge} kind="pts" f={f} />} cmp={I.marge != null ? f.L(`sur ${I.margeRetenues} ventes`, `on ${I.margeRetenues} sales`) : f.L('prix d’achat manquants', 'purchase prices missing')} onOuvrir={() => ouvrir({ k: 'marge' })} aria={`${f.L('Marge', 'Margin')} : ${f.pct(I.marge)}`} />
        <Tuile i={4} lab={f.L('Ventes', 'Sales')} val={f.num(I.nb)} puce={ok && <Puce cur={I.nb} prev={V.nb} f={f} />} cmp={cle === 'tout' ? f.L(`dont ${sansDate} sans date`, `${sansDate} undated`) : f.L('datées', 'dated')} onOuvrir={() => ouvrir({ k: 'ventes' })} aria={`${f.L('Ventes', 'Sales')} : ${I.nb}`} />
        <Tuile i={5} lab={f.L('Panier moyen', 'Avg. basket')} val={f.eur(I.panier)} vide={I.panier == null} puce={ok && <Puce cur={I.panier} prev={V.panier} f={f} />} cmp={f.L('par vente', 'per sale')} onOuvrir={() => ouvrir({ k: 'panier' })} aria={`${f.L('Panier moyen', 'Average basket')} : ${f.eur(I.panier)}`} />
        <Tuile i={6} lab={f.L('Délai constaté', 'Observed time')} val={f.jours(I.delai)} vide={I.delai == null} puce={ok && I.delai != null && V.delai != null && <Puce cur={I.delai} prev={V.delai} kind="jours" inverse f={f} />} cmp={I.delaiN ? f.L(`médiane ${f.jours(I.delaiMediane)} · ${I.delaiN} v.`, `median ${f.jours(I.delaiMediane)} · ${I.delaiN}`) : f.L('aucune vente mesurée', 'no sale measured')} onOuvrir={() => ouvrir({ k: 'delai' })} aria={`${f.L('Délai constaté', 'Observed time')} : ${f.jours(I.delai)}`} />
      </div>

      <section className="fsb-card" aria-labelledby="fst-h-pr">
        <div className="fsb-ch"><div><h2 id="fst-h-pr">{f.L('Quelle plateforme rapporte le plus', 'Which platform earns the most')}</h2><p>{f.L(`${lp.nom} · touche une ligne pour le détail`, `${lp.nom} · tap a row for details`)}</p></div></div>
        {bloc.plateformes.length === 0 ? <div className="fsb-empty"><b>{f.L(`Aucune vente · ${lp.nom}`, `No sale · ${lp.nom}`)}</b>{f.L('Choisis une période plus longue.', 'Pick a longer period.')}</div> : (
          <>
            {(plusProfit || plusMarge || plusVite) && (
              <div className="fsb-badges">
                {plusProfit && <div className="fsb-badge"><Logo code={plusProfit.code} taille={26} /><span><span className="fsb-k">{f.L('Plus de profit', 'Most profit')}</span><span className="fsb-vv">{nomPlateforme(plusProfit.code, f, plusProfit.libelle)} · {f.eur0(plusProfit.profit)}</span></span></div>}
                {plusMarge && <div className="fsb-badge"><Logo code={plusMarge.code} taille={26} /><span><span className="fsb-k">{f.L('Meilleure marge', 'Best margin')}</span><span className="fsb-vv">{nomPlateforme(plusMarge.code, f, plusMarge.libelle)} · {f.pct(plusMarge.marge)}</span></span></div>}
                {plusVite && <div className="fsb-badge"><Logo code={plusVite.code} taille={26} /><span><span className="fsb-k">{f.L('Vend le plus vite', 'Sells fastest')}</span><span className="fsb-vv">{nomPlateforme(plusVite.code, f, plusVite.libelle)} · {f.jours(plusVite.delai)}</span></span></div>}
              </div>
            )}
            <div className="fsb-plat">
              {bloc.plateformes.map((l) => (
                <button key={l.cle} type="button" className={`fsb-prow${l.code === 'sans' ? ' fsb-muted' : ''}`} onClick={() => ouvrir({ k: 'plateforme', code: l.code === 'autre' ? l.cle : l.code })}>
                  <Logo code={l.code} taille={32} />
                  <span style={{ minWidth: 0 }}><span className="fsb-nm">{nomPlateforme(l.code, f, l.libelle)}</span><span className="fsb-mt">{f.L(`${l.nb} vente${l.nb > 1 ? 's' : ''}`, `${l.nb} sale${l.nb > 1 ? 's' : ''}`)}</span></span>
                  <span className="fsb-am">{f.eur(l.encaisse)}<small>{f.pct(l.part * 100, 0)}</small></span>
                  <span className="fsb-chev"><IcoChevron /></span>
                  <span className="fst-minis">
                    <span>{f.L('Profit', 'Profit')}<b>{l.profitRetenues ? f.eur0(l.profit) : '—'}</b></span>
                    <span>{f.L('Marge', 'Margin')}<b>{l.marge != null ? `${f.pct(l.marge, 0)}${l.margeRetenues < 5 ? '*' : ''}` : '—'}</b></span>
                    <span>{f.L('Panier', 'Basket')}<b>{f.eur(l.panier)}</b></span>
                    <span>{f.L('Délai', 'Time')}<b>{l.delaiN ? f.jours(l.delai) : '—'}</b></span>
                  </span>
                </button>
              ))}
            </div>
            {reelles.some((l) => l.marge != null && l.margeRetenues < 5) && <p className="fsb-note">{f.L('* moins de 5 ventes au prix d’achat connu : marge indicative, hors classement.', '* fewer than 5 sales with a known cost: indicative margin, not ranked.')}</p>}
          </>
        )}
      </section>

      <section className="fsb-card" aria-labelledby="fst-h-ev">
        <div className="fsb-ch"><div><h2 id="fst-h-ev">{f.L('Mois par mois', 'Month by month')}</h2><p>{evolution.length ? f.L(`depuis ${moisAnnee(evolution[0].mois, lang)}`, `since ${moisAnnee(evolution[0].mois, lang)}`) : f.L('12 derniers mois', 'last 12 months')}</p></div></div>
        {evolution.length === 0 ? <div className="fsb-empty"><b>{f.L('Aucune vente datée sur 12 mois', 'No dated sale in 12 months')}</b>{f.L('Les mois se rempliront avec tes ventes.', 'Months will fill up with your sales.')}</div> : (
          <>
            <div className="fsb-legend"><span><i className="fsb-box" style={{ background: 'var(--fsb-teal-soft)' }} />{f.L('Encaissé', 'Collected')}</span><span><i className="fsb-box" style={{ background: 'var(--fsb-teal-deep)' }} />{f.L('Profit', 'Profit')}</span></div>
            <Colonnes bandeau hauteur={170} indication={f.L('Touche un mois', 'Tap a month')} axe={axeMois(evolution.map((m) => m.mois), lang, { gras: (i) => i === evolution.length - 1 })} fy={f.eur0} epaisseurMax={18} aria={f.L('Encaissé et profit par mois', 'Takings and profit per month')}
              series={[{ vals: evolution.map((m) => m.encaisse), couleur: 'var(--fsb-teal-soft)' }, { vals: evolution.map((m) => (m.profitRetenues ? m.profit : null)), couleur: 'var(--fsb-teal-deep)' }]}
              bulle={(i) => ({ titre: capital(moisAnnee(evolution[i].mois, lang)), lignes: [{ couleur: 'var(--fsb-teal-soft)', boite: true, valeur: f.eur(evolution[i].encaisse) }, { couleur: 'var(--fsb-teal-deep)', boite: true, valeur: evolution[i].profitRetenues ? f.eur(evolution[i].profit) : '—' }], note: f.L(`${evolution[i].nb} ventes`, `${evolution[i].nb} sales`) })} />
            <div className="fsb-list" style={{ marginTop: 6 }}>
              {evRecent.map((m, i) => {
                const avant = evRecent[i + 1];
                return (
                  <div key={m.mois} className="fsb-li" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                    <span style={{ minWidth: 0 }}><span className="fsb-t">{capital(moisAnnee(m.mois, lang))}</span><span className="fsb-m">{f.L(`${m.nb} vente${m.nb > 1 ? 's' : ''}`, `${m.nb} sale${m.nb > 1 ? 's' : ''}`)}{m.marge != null ? f.L(` · marge ${f.pct(m.marge)}`, ` · margin ${f.pct(m.marge)}`) : ''}</span></span>
                    <span className="fsb-v">{f.eur(m.encaisse)}<small className="fsb-z" style={{ marginTop: 3 }}>{i === 0 ? <span className="fsb-chip fsb-etat">{f.L('en cours', 'so far')}</span> : avant && avant.nb >= 5 ? <Puce cur={m.encaisse} prev={avant.encaisse} f={f} /> : null}</small></span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="fsb-card" aria-labelledby="fst-h-dl">
        <div className="fsb-ch"><div><h2 id="fst-h-dl">{f.L('Délai de vente constaté', 'Observed time to sell')}</h2><p>{f.L('de la mise en ligne à la vente', 'from listing to sale')}</p></div></div>
        {dl.n === 0 ? <div className="fsb-empty"><b>{f.L('Aucune vente mesurée', 'No sale measured')}</b>{f.L('Le délai se mesure sur les articles créés dans FillSell, de leur mise en ligne à leur vente.', 'Time to sell is measured on items created in FillSell, from listing to sale.')}</div> : (
          <>
            <p className="fsb-insight">{f.L('La moitié de tes ventes mesurées part en ', 'Half of your measured sales go in ')}<b>{f.jours(dl.mediane)}</b>{f.L(' ou moins.', ' or less.')}</p>
            <Repartition d={dl.distribution} f={f} />
            <div className="fst-seg" style={{ marginTop: 14 }} role="group" aria-label={f.L('Ventiler par', 'Break down by')}>
              {[['plateforme', f.L('Plateforme', 'Platform')], ['categorie', f.L('Catégorie', 'Category')], ['marque', f.L('Marque', 'Brand')]].map(([k, l]) => <button key={k} type="button" aria-pressed={onglet === k} onClick={() => setOnglet(k)}>{l}</button>)}
            </div>
            {lignesDelai.length ? <Barres lignes={lignesDelai.map((x) => ({ cle: x.cle, icone: onglet === 'plateforme' ? <Logo code={x.cle.startsWith('autre:') ? 'autre' : x.cle} taille={18} /> : null, libelle: onglet === 'plateforme' ? nomPlateforme(x.cle.startsWith('autre:') ? 'autre' : x.cle, f, x.libelle) : onglet === 'categorie' ? f.cat(x.libelle) : f.marque(x.libelle), valeur: x.moyenne, texte: f.jours(x.moyenne), detail: f.L(`${x.n} v.`, `${x.n}`), discret: x.cle === '∅' || x.cle === 'sans' }))} />
              : <div className="fsb-empty">{f.L('Pas assez de ventes mesurées (3 au moins par ligne).', 'Not enough measured sales (at least 3 per row).')}</div>}
            <p className="fsb-note">{f.L(`Mesuré sur ${dl.n} ventes d’articles créés dans FillSell. Pour un article importé d’un dressing, la vraie date de mise en ligne n’est pas connue.`, `Based on ${dl.n} sales of items created in FillSell. Items imported from a wardrobe have no known listing date.`)}</p>
          </>
        )}
      </section>

      <section className="fsb-card" aria-labelledby="fst-h-mq">
        <div className="fsb-ch"><div><h2 id="fst-h-mq">{f.L('Marques qui vendent le mieux', 'Best-selling brands')}</h2><p>{f.L('classées par encaissé', 'ranked by takings')}</p></div></div>
        {bloc.marques.length === 0 ? <div className="fsb-empty"><b>{f.L(`Aucune vente · ${lp.nom}`, `No sale · ${lp.nom}`)}</b></div> : (
          <div className="fsb-list">{bloc.marques.slice(0, 6).map((m, i) => (
            <div key={m.cle} className="fsb-li"><span className="fst-rang">{i + 1}</span>
              <span style={{ minWidth: 0 }}><span className="fsb-t" style={m.cle === '∅' ? { color: 'var(--fsb-mute)' } : undefined}>{f.marque(m.libelle)}</span><span className="fsb-m">{f.L(`${m.nb} vente${m.nb > 1 ? 's' : ''}`, `${m.nb} sale${m.nb > 1 ? 's' : ''}`)} · {f.L('marge', 'margin')} {m.marge != null ? f.pct(m.marge) : '—'}</span></span>
              <span className="fsb-v">{f.eur(m.encaisse)}</span></div>
          ))}</div>
        )}
      </section>

      <section className="fsb-card" aria-labelledby="fst-h-ct">
        <div className="fsb-ch"><div><h2 id="fst-h-ct">{f.L('Catégories', 'Categories')}</h2><p>{f.L('encaissé des ventes classées', 'takings of categorised sales')}</p></div></div>
        {classees.length > 0 && <Barres lignes={classees.slice(0, 5).map((c) => ({ cle: c.cle, libelle: f.cat(c.libelle), valeur: c.encaisse, texte: f.eur0(c.encaisse), detail: f.L(`${c.nb} v.`, `${c.nb}`) }))} />}
        {nonClasse && <div className="fsb-empty" style={{ marginTop: classees.length ? 12 : 0 }}><b>{f.L(`${nonClasse.nb} ventes sur ${I.nb} sans catégorie`, `${nonClasse.nb} of ${I.nb} sales without a category`)}</b>{f.L(`${f.eur0(nonClasse.encaisse)} encaissés ne sont rangés nulle part : classe tes articles pour affiner.`, `${f.eur0(nonClasse.encaisse)} of takings sit in no category: categorise your items to refine.`)}</div>}
        {!nonClasse && classees.length === 0 && <div className="fsb-empty"><b>{f.L(`Aucune vente · ${lp.nom}`, `No sale · ${lp.nom}`)}</b></div>}
      </section>

      <section className="fsb-card" aria-labelledby="fst-h-pa">
        <div className="fsb-ch"><div><h2 id="fst-h-pa">{f.L('Prix encaissé / prix affiché', 'Price received / listed')}</h2><p>{f.L('sur la plateforme de la vente', 'on the platform of the sale')}</p></div></div>
        {!stock.lu ? <div style={{ display: 'grid', gap: 10 }}>{[80, 60, 70].map((w, k) => <span key={k} className="fsb-sk" style={{ width: `${w}%` }} />)}</div> : pa.n === 0
          ? <div className="fsb-empty"><b>{f.L('Pas encore de prix affiché connu', 'No known listed price yet')}</b>{f.L('Ce bloc se remplit avec les ventes d’articles publiés par FillSell.', 'This block fills up with sales of items published by FillSell.')}</div>
          : (
            <>
              <div className="fsb-big">{f.pct(pa.ratio * 100, 0)} <small>{f.L('du prix affiché, en moyenne', 'of the listed price, on average')}</small></div>
              <div className="fsb-dist" style={{ marginTop: 12 }} aria-hidden="true">{TRANCHES.map(([k, c]) => <i key={k} style={{ flex: pa.tranches[k] || 0.0001, background: c }} />)}</div>
              <div className="fsb-lg">{TRANCHES.map(([k, c]) => <div key={k}><i style={{ background: c }} />{{ auDessus: f.L('au-dessus du prix', 'above the price'), auPrix: f.L('au prix affiché', 'at the listed price'), moins10: f.L('jusqu’à −10 %', 'up to −10%'), moins25: f.L('−10 à −25 %', '−10 to −25%'), plus25: f.L('plus de −25 %', 'over −25%') }[k]}<b>{pa.tranches[k]}</b></div>)}</div>
              <p className="fsb-note">{f.L('Sur ', 'On ')}<b>{f.L(`${pa.n} ventes sur ${pa.ventes}`, `${pa.n} of ${pa.ventes} sales`)}</b>{f.L(', celles dont FillSell connaît le prix publié.', ', those whose listed price FillSell knows.')}</p>
            </>
          )}
      </section>

      <section className="fsb-card" aria-labelledby="fst-h-ec">
        <div className="fsb-ch"><div><h2 id="fst-h-ec">{f.L('Écoulement du stock', 'Sell-through')}</h2><p>{lp.nom}</p></div></div>
        {bloc.ecoulement?.taux != null
          ? <><div className="fsb-big">{f.pct(bloc.ecoulement.taux * 100, 0)} <small>{f.L('du stock disponible vendu', 'of available stock sold')}</small></div>
            <p className="fsb-note" style={{ margin: '4px 0 14px' }}>{f.L(`${f.num(bloc.ecoulement.vendus)} vendus ÷ (${f.num(bloc.ecoulement.vendus)} + ${f.num(bloc.ecoulement.stock)} encore en stock)`, `${f.num(bloc.ecoulement.vendus)} sold ÷ (${f.num(bloc.ecoulement.vendus)} + ${f.num(bloc.ecoulement.stock)} still in stock)`)}</p></>
          : <div className="fsb-empty" style={{ marginBottom: 14 }}><b>{f.L('Sans objet depuis le début', 'Not meaningful for all time')}</b>{f.L('Choisis une période pour mesurer l’écoulement.', 'Pick a period to measure sell-through.')}</div>}
        {stock.total > 0 && <BarresAges stock={stock} f={f} />}
        <button type="button" className="fst-btn" onClick={() => ouvrir({ k: 'dormant' })}>{f.L('Voir les articles qui dorment', 'See sleeping items')}<IcoChevron /></button>
      </section>

      <section className="fsb-card" aria-labelledby="fst-h-js">
        <div className="fsb-ch"><div><h2 id="fst-h-js">{f.L('Jours où ça vend', 'Best days to sell')}</h2><p>{f.L(`${js.n} ventes datées · ${lp.nom}`, `${js.n} dated sales · ${lp.nom}`)}</p></div></div>
        {js.n === 0 ? <div className="fsb-empty"><b>{f.L('Aucune vente datée', 'No dated sale')}</b>{f.L('Choisis une période plus longue.', 'Pick a longer period.')}</div> : (
          <>
            {top2.length === 2 && <p className="fsb-insight"><b>{capital(JOURS[lj][top2[0].jour])}</b>{f.L(' et ', ' and ')}<b>{JOURS[lj][top2[1].jour]}</b>{f.L(' sont tes meilleurs jours.', ' are your best days.')}</p>}
            <Colonnes bandeau hauteur={140} indication={f.L('Touche un jour', 'Tap a day')} axe={axeSimple(js.jours.map((j) => JOURS_C[lj][j.jour]))} vlab={(v) => f.num(v)} epaisseurMax={26} aria={f.L('Ventes par jour de la semaine', 'Sales per weekday')}
              series={[{ vals: js.jours.map((j) => j.nb), couleur: (i) => (js.jours[i].nb === jmax ? 'var(--fsb-teal-deep)' : 'var(--fsb-teal-soft)') }]}
              bulle={(i) => ({ titre: capital(JOURS[lj][i]), lignes: [{ couleur: 'var(--fsb-teal)', boite: true, valeur: f.L(`${js.jours[i].nb} ventes`, `${js.jours[i].nb} sales`) }], note: `${f.eur(js.jours[i].ca)} ${f.L('encaissés', 'collected')}` })} />
          </>
        )}
        <p className="fsb-note">{f.L(`Pas d’heures : l’heure réelle n’est connue que pour ${heures} vente${heures > 1 ? 's' : ''} sur ${ctx.ventes.length}.`, `No hours: the real time is known for only ${heures} of ${ctx.ventes.length} sales.`)}</p>
      </section>

      {meilleures.length > 0 && (
        <section className="fsb-card" aria-labelledby="fst-h-mv">
          <div className="fsb-ch"><div><h2 id="fst-h-mv">{f.L('Meilleures ventes', 'Best sales')}</h2><p>{f.L(`bénéfice en euros · ${lp.nom}`, `profit in euros · ${lp.nom}`)}</p></div></div>
          <div className="fsb-list">{meilleures.map((s, i) => (
            <div key={s.id ?? i} className="fsb-li">
              <span className="fst-medal" style={{ background: `linear-gradient(135deg,${MEDAILLES[i][0]},${MEDAILLES[i][1]})`, color: MEDAILLES[i][2] }}>{i + 1}</span>
              <span style={{ minWidth: 0 }}><span className="fsb-t">{s.titre}</span><span className="fsb-m">{s.marque ? `${s.marque} · ` : ''}{s.gratuit ? f.L('prix d’achat à 0 €', 'purchase price €0') : `${f.eur0(s.achat)} → ${f.eur0(s.prix)}`}</span></span>
              <span className="fsb-v">{s.gratuit ? f.eur(s.prix) : `${s.benefice >= 0 ? '+' : ''}${f.eur(s.benefice)}`}<small className="fsb-z">{s.gratuit ? f.L('vendu', 'sold') : f.pct(s.pct)}</small></span>
            </div>
          ))}</div>
        </section>
      )}

      <section className="fsb-card" aria-labelledby="fst-h-ia">
        <div className="fsb-ia">
          <span className="fsb-ic"><IcoEtincelle /></span>
          <div style={{ flex: 1, minWidth: 0 }}><h2 id="fst-h-ia" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{f.L('Analyse IA', 'AI analysis')}</h2><p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--fsb-mute)' }}>{f.L(`Tendances, prix et conseils · ${lp.nom}`, `Trends, prices and advice · ${lp.nom}`)}</p></div>
        </div>
        {ia.chargement && <div style={{ display: 'grid', gap: 8, marginTop: 14 }} aria-label={f.L('Analyse en cours', 'Analysis running')}>{[100, 82, 64].map((w, k) => <span key={k} className="fsb-sk" style={{ width: `${w}%` }} />)}</div>}
        {!ia.chargement && ia.texte && <div className="fsb-ia-txt" dangerouslySetInnerHTML={ia.html} />}
        {!ia.chargement && ia.texte && ia.perime && <button type="button" className="fst-btn" onClick={ia.lancer}>{f.L('Actualiser', 'Refresh')}</button>}
        {!ia.chargement && !ia.texte && I.nb > 0 && <button type="button" className="fst-cta" onClick={ia.lancer}><IcoEtincelle />{f.L('Lancer mon analyse', 'Run my analysis')}</button>}
        {!ia.chargement && !ia.texte && I.nb === 0 && <p className="fsb-note">{f.L('Aucune vente sur cette période : choisis une période plus longue.', 'No sale in this period: pick a longer one.')}</p>}
      </section>

      {pile.length > 0 && <FeuilleDetail pile={pile} onPile={setPile} bloc={bloc} stock={stock} f={f} lang={lang} onAller={aller} />}
    </div>
  );
}
