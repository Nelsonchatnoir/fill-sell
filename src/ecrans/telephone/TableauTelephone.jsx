// ═══════════════════════════════════════════════════════════════════════════
// TABLEAU SUR TÉLÉPHONE (29/10) — maquette « écran 1 » validée par Nico le 29/10.
// Site mobile ET app iOS / Android (tout ce qui n'est pas l'ordinateur, cf.
// hooks/useBureau). Les chiffres : utils/tableauStats.js, comme l'ordinateur et
// l'en-tête. Une période en haut pilote tout ce qui est dessous ; chaque tuile,
// pastille et ligne ouvre une feuille qui monte du bas (FeuilleDetail).
// L'écran de démarrage d'un compte vide et les bandeaux du haut restent dans
// DashboardTab, inchangés.
// ═══════════════════════════════════════════════════════════════════════════
import { useMemo, useState } from 'react';
import '../bureau/bureau.css';
import './telephone.css';
import { blocPeriode, comparable, etatStock, PERIODES_BUREAU, periode } from '../../utils/tableauStats';
import { toucherLeger } from '../../utils/retourHaptique';
import { Courbes, Colonnes, TraceHeros } from '../bureau/Graphes';
import { Logo, Puce, PuceEtat, Tuile, IcoOuvrir, IcoChevron, LigneVente, LigneArticle, BarresAges } from '../bureau/pieces';
import { formats, libellesPeriode, jourLong, jourMoyen, jourCourt, nomMois, moisAnnee, nomPlateforme } from '../bureau/outils';
import FeuilleDetail from './FeuilleDetail';

const CLE_PERIODE = 'fs_tableau_periode';
const lirePeriode = () => { try { const v = localStorage.getItem(CLE_PERIODE); return PERIODES_BUREAU.includes(v) ? v : 'mois'; } catch { return 'mois'; } };
const COURT = { '30j': ['30 jours', '30 days'], '12m': ['12 mois', '12 months'] };

/** Les pastilles de période, que le pouce fait défiler. */
export function PastillesPeriode({ valeur, onChange, auj, lang, f }) {
  return (
    <div className="fst-chips" role="group" aria-label={f.L('Période', 'Period')}>
      {PERIODES_BUREAU.map((k) => {
        const lib = COURT[k] ? COURT[k][lang === 'en' ? 1 : 0] : libellesPeriode(periode(k, auj), lang).bouton;
        return <button key={k} type="button" aria-pressed={valeur === k} onClick={() => onChange(k)}>{lib}</button>;
      })}
    </div>
  );
}

export default function TableauTelephone({ ctx, lang, currency, username, setTab }) {
  const f = useMemo(() => formats(lang, currency), [lang, currency]);
  const [cle, setCle] = useState(lirePeriode);
  const [mesure, setMesure] = useState('ca');
  const [pile, setPile] = useState([]);
  const choisir = (v) => { setCle(v); try { localStorage.setItem(CLE_PERIODE, v); } catch { /* préférence locale seulement */ } };
  const bloc = useMemo(() => blocPeriode(ctx, cle), [ctx, cle]);
  const stock = useMemo(() => etatStock(ctx), [ctx]);
  const lp = libellesPeriode(bloc.periode, lang);
  const ok = comparable(bloc);
  const I = bloc.ind, V = bloc.prev;
  const ouvrir = (o) => { toucherLeger(); setPile([o]); };
  const aller = (t) => { setPile([]); setTab(t); try { localStorage.setItem('tab', t); } catch { /* idem */ } };
  const ligneComparaison = !bloc.periode.precedente
    ? f.L('Tout l’historique, ventes sans date comprises', 'Full history, undated sales included')
    : ok ? f.L(`Comparé au ${lp.avant}`, `Compared with ${lp.avant}`)
      : V.nb === 0 ? f.L(`Pas de comparaison : aucune vente · ${lp.avant}`, `No comparison: no sale · ${lp.avant}`)
        : f.L(`Pas de comparaison : ${V.nb} vente${V.nb > 1 ? 's' : ''} seulement · ${lp.avant}`, `No comparison: only ${V.nb} sale${V.nb > 1 ? 's' : ''} · ${lp.avant}`);
  const vs = (x) => (ok ? `${x} · ${lp.avant}` : null);

  // ── Courbe principale, lue au doigt ───────────────────────────────────────
  const M = { ca: ['cumulCa', 'ca', f.eur, f.eur0, f.L('Encaissé', 'Collected'), 'encaisse'], profit: ['cumulProfit', 'profit', f.eur, f.eur0, f.L('Profit', 'Profit'), 'profit'], nb: ['cumulNb', 'nb', (v) => f.num(v), (v) => f.num(v), f.L('Ventes', 'Sales'), 'nb'] }[mesure];
  const serie = bloc.serie;
  let graphe;
  if (serie.pas === 'jour') {
    const estMois = cle === 'mois';
    const n = estMois ? Number(serie.finMois.slice(8, 10)) : serie.points.length;
    const cur = Array.from({ length: n }, (_, i) => (serie.points[i] ? serie.points[i][M[0]] : null));
    const prev = Array.from({ length: n }, (_, i) => (serie.prev[i] ? serie.prev[i][M[0]] : null));
    const der = serie.points.length - 1;
    const milieu = Math.round((n - 1) / 2);
    const xTicks = [{ i: 0, l: estMois ? jourCourt(bloc.periode.debut, lang) : jourCourt(serie.points[0].jour, lang) }];
    if (Math.abs(milieu - der) > 4) xTicks.push({ i: milieu, l: estMois ? String(milieu + 1) : jourCourt(serie.points[milieu].jour, lang) });
    xTicks.push({ i: der, l: f.L('auj.', 'today'), fort: true });
    if (estMois && der < n - 5) xTicks.push({ i: n - 1, l: String(n) });
    graphe = (
      <Courbes n={n} bandeau hauteurMin={200} padGauche={46} padDroite={14} aria={`${M[4]} ${f.L('cumulé', 'cumulative')}, ${lp.nom}`} fy={M[3]} xTicks={xTicks}
        vide={I.nb === 0 && (!V || V.nb === 0) ? <span><b>{f.L(`Aucune vente pour l’instant · ${lp.nom}`, `No sale yet · ${lp.nom}`)}</b>{f.L('La courbe se dessine dès la première vente.', 'The curve draws itself from the first sale.')}</span> : null}
        series={[{ vals: prev, couleur: 'var(--fsb-prev)' }, { vals: cur, couleur: 'var(--fsb-teal)', voile: true, epaisseur: 2.5 }]}
        bulle={(i) => {
          const a = serie.points[i], b = serie.prev[i];
          if (!a && !b) return null;
          const lignes = [];
          if (a) lignes.push({ couleur: 'var(--fsb-teal)', valeur: M[2](a[M[0]]) });
          if (b) lignes.push({ couleur: 'var(--fsb-prev)', valeur: M[2](b[M[0]]) });
          return { titre: a ? `${jourMoyen(a.jour, lang)}${i === der ? f.L(' · aujourd’hui', ' · today') : ''}` : f.L('à venir', 'not yet'), lignes };
        }} />
    );
  } else {
    const pts = serie.points;
    graphe = (
      <Colonnes bandeau hauteur={200} indication={f.L('Touche un mois', 'Tap a month')} labels={pts.map((m, i) => (pts.length > 8 && i % 2 ? '' : nomMois(m.mois, lang, true)))} fy={M[3]} epaisseurMax={22}
        aria={`${M[4]}, ${f.L('mois par mois', 'month by month')}`} fort={(i) => i === pts.length - 1}
        series={[{ vals: pts.map((m) => (mesure === 'profit' && !m.profitRetenues ? null : m[M[5]])), couleur: (i) => (i === pts.length - 1 ? 'var(--fsb-teal-soft)' : 'var(--fsb-teal)') }]}
        bulle={(i) => ({ titre: `${moisAnnee(pts[i].mois, lang)}${i === pts.length - 1 ? f.L(' (en cours)', ' (so far)') : ''}`, lignes: [{ couleur: 'var(--fsb-teal)', boite: true, valeur: mesure === 'profit' && !pts[i].profitRetenues ? '—' : M[2](pts[i][M[5]]) }], note: f.L(`${pts[i].nb} ventes`, `${pts[i].nb} sales`) })} />
    );
  }

  const L = bloc.plateformes;
  const maxP = Math.max(...L.map((l) => l.encaisse), 1e-9);
  const presentes = new Set(L.map((l) => l.code));
  const sansVente = stock.lu ? Object.keys(stock.parPlateforme).filter((c) => !presentes.has(c)) : [];

  return (
    <div className="fsb fst">
      <div className="fst-hello fsb-rise"><h1>{f.L('Bonjour', 'Hello')}{username ? <> <em>{username}</em></> : null}</h1><p>{jourLong(ctx.auj, lang)}</p></div>
      <PastillesPeriode valeur={cle} onChange={choisir} auj={ctx.auj} lang={lang} f={f} />
      <div className="fst-cmp">{ligneComparaison}</div>

      <button type="button" className="fsb-hero fsb-rise" style={{ '--i': 1 }} onClick={() => ouvrir({ k: 'profit' })} aria-label={`${f.L('Profit', 'Profit')} · ${lp.nom} : ${I.profitRetenues ? f.eur(I.profit) : '—'}. ${f.L('Voir le détail', 'See details')}`}>
        <span className="fsb-hero-txt">
          <span className="fsb-lab"><span>{f.L('Profit', 'Profit')} · {lp.nom}</span><IcoOuvrir /></span>
          <span className="fsb-val">{I.profitRetenues ? f.eur(I.profit) : '—'}</span>
          <span className="fsb-cmp">{ok && I.profitRetenues ? <Puce cur={I.profit} prev={V.profit} f={f} /> : null}<span>{ok && I.profitRetenues ? `${f.eur(V.profit)} · ${lp.avant}` : !I.profitRetenues && I.nb ? f.L('Ajoute les prix d’achat de tes ventes pour voir ton profit', 'Add your purchase prices to see your profit') : ligneComparaison}</span></span>
        </span>
        {serie.pas === 'jour'
          ? <TraceHeros n={cle === 'mois' ? Number(serie.finMois.slice(8, 10)) : serie.points.length} cur={serie.points.map((x) => x.cumulProfit)} prev={V?.nb ? serie.prev.map((x) => x.cumulProfit) : []} />
          : <TraceHeros colonnes={serie.points.slice(-12).map((x) => x.profit)} />}
        <span className="fsb-foot">{f.L(`${I.profitRetenues} ventes comptées`, `${I.profitRetenues} sales counted`)}{I.profitExclus ? f.L(` · ${I.profitExclus} sans prix d’achat écartées`, ` · ${I.profitExclus} without cost left out`) : ''}</span>
      </button>

      <div className="fsb-kpis">
        <Tuile i={2} lab={f.L('Encaissé', 'Collected')} val={f.eur(I.encaisse)} puce={ok && <Puce cur={I.encaisse} prev={V.encaisse} f={f} />} cmp={vs(f.eur0(V?.encaisse))} onOuvrir={() => ouvrir({ k: 'encaisse' })} aria={`${f.L('Encaissé', 'Collected')} : ${f.eur(I.encaisse)}`} />
        <Tuile i={3} lab={f.L('Ventes', 'Sales')} val={f.num(I.nb)} puce={ok && <Puce cur={I.nb} prev={V.nb} f={f} />} cmp={vs(f.num(V?.nb))} onOuvrir={() => ouvrir({ k: 'ventes' })} aria={`${f.L('Ventes', 'Sales')} : ${I.nb}`} />
        <Tuile i={4} lab={f.L('Panier moyen', 'Avg. basket')} val={f.eur(I.panier)} vide={I.panier == null} puce={ok && <Puce cur={I.panier} prev={V.panier} f={f} />} cmp={vs(f.eur(V?.panier))} onOuvrir={() => ouvrir({ k: 'panier' })} aria={`${f.L('Panier moyen', 'Average basket')} : ${f.eur(I.panier)}`} />
        <Tuile i={5} lab={f.L('Marge', 'Margin')} val={f.pct(I.marge)} vide={I.marge == null} puce={ok && I.marge != null && V.marge != null && <Puce cur={I.marge} prev={V.marge} kind="pts" f={f} />}
          cmp={I.marge != null ? f.L(`sur ${I.margeRetenues} ventes`, `on ${I.margeRetenues} sales`) : I.nb ? f.L('prix d’achat manquants', 'purchase prices missing') : null} onOuvrir={() => ouvrir({ k: 'marge' })} aria={`${f.L('Marge', 'Margin')} : ${f.pct(I.marge)}`} />
        <Tuile i={6} lab={f.L('Délai de vente constaté', 'Observed time to sell')} val={I.delai == null ? '—' : <>{f.jours(I.delai)} <small>{f.L('moy.', 'avg')}</small></>} vide={I.delai == null}
          puce={ok && I.delai != null && V.delai != null && <Puce cur={I.delai} prev={V.delai} kind="jours" inverse f={f} />}
          cmp={I.delaiN ? f.L(`médiane ${f.jours(I.delaiMediane)} · ${I.delaiN} v.`, `median ${f.jours(I.delaiMediane)} · ${I.delaiN}`) : f.L('articles créés dans FillSell', 'items created in FillSell')}
          onOuvrir={() => ouvrir({ k: 'delai' })} aria={`${f.L('Délai de vente constaté', 'Observed time to sell')} : ${f.jours(I.delai)}`} />
        <Tuile i={7} lab={f.L('Articles en ligne', 'Items online')} val={stock.lu ? <>{f.num(stock.enLigne)} <small>/ {f.num(stock.total)}</small></> : '…'} vide={!stock.lu}
          puce={<PuceEtat>{f.L('aujourd’hui', 'today')}</PuceEtat>} cmp={stock.lu ? f.L(`${stock.pasEncore} pas publiés`, `${stock.pasEncore} not listed`) : null} onOuvrir={() => ouvrir({ k: 'enligne' })} aria={`${f.L('Articles en ligne', 'Items online')} : ${stock.enLigne}`} />
        <Tuile i={8} lab={f.L('Stock immobilisé', 'Stock tied up')} val={f.eur(stock.immobilise)} puce={<PuceEtat>{f.L('aujourd’hui', 'today')}</PuceEtat>}
          cmp={stock.sansPrix ? f.L(`${stock.sansPrix} sans prix d’achat`, `${stock.sansPrix} without cost`) : null} onOuvrir={() => ouvrir({ k: 'immobilise' })} aria={`${f.L('Stock immobilisé', 'Stock tied up')} : ${f.eur(stock.immobilise)}`} />
        <Tuile i={9} lab={f.L('Écoulement du stock', 'Sell-through')} val={bloc.ecoulement?.taux != null ? f.pct(bloc.ecoulement.taux * 100, 0) : '—'} vide={bloc.ecoulement?.taux == null}
          cmp={bloc.ecoulement ? f.L(`${f.num(bloc.ecoulement.vendus)} vendus · ${f.num(bloc.ecoulement.stock)} en stock`, `${f.num(bloc.ecoulement.vendus)} sold · ${f.num(bloc.ecoulement.stock)} in stock`) : f.L('sans objet', 'n/a')}
          onOuvrir={() => ouvrir({ k: 'ecoulement' })} aria={f.L('Écoulement du stock', 'Sell-through')} />
      </div>

      <section className="fsb-card fsb-rise" style={{ '--i': 10 }} aria-labelledby="fst-h-main">
        <div className="fsb-ch"><div><h2 id="fst-h-main">{M[4]} {serie.pas === 'jour' ? f.L('cumulé', 'running total') : f.L('mois par mois', 'month by month')}</h2>
          <p>{serie.pas === 'jour' && V?.nb ? f.L(`${lp.nom}, comparé au ${lp.avant}`, `${lp.nom}, vs ${lp.avant}`) : lp.nom}</p></div></div>
        <div className="fst-seg" role="group" aria-label={f.L('Mesure', 'Measure')}>
          {[['ca', f.L('Encaissé', 'Collected')], ['profit', f.L('Profit', 'Profit')], ['nb', f.L('Ventes', 'Sales')]].map(([k, l]) => <button key={k} type="button" aria-pressed={mesure === k} onClick={() => setMesure(k)}>{l}</button>)}
        </div>
        {serie.pas === 'jour' && <div className="fsb-legend"><span><i style={{ background: 'var(--fsb-teal)' }} />{cle === 'mois' ? lp.nom : f.L('30 derniers jours', 'last 30 days')}</span><span><i style={{ background: 'var(--fsb-prev)' }} />{lp.avant}</span></div>}
        {graphe}
      </section>

      <section className="fsb-card fsb-rise" style={{ '--i': 11 }} aria-labelledby="fst-h-plat">
        <div className="fsb-ch"><div><h2 id="fst-h-plat">{f.L('Par plateforme', 'By platform')}</h2><p>{f.L(`encaissé · ${lp.nom}`, `collected · ${lp.nom}`)}</p></div></div>
        {L.length === 0 && sansVente.length === 0
          ? <div className="fsb-empty"><b>{f.L(`Aucune vente · ${lp.nom}`, `No sale · ${lp.nom}`)}</b>{f.L('Chaque plateforme apparaîtra ici avec son encaissé dès sa première vente.', 'Each platform shows up here with its takings from its first sale.')}</div>
          : (
            <div className="fsb-plat">
              {L.map((l) => (
                <button key={l.cle} type="button" className={`fsb-prow${l.code === 'sans' ? ' fsb-muted' : ''}`} onClick={() => ouvrir({ k: 'plateforme', code: l.code === 'autre' ? l.cle : l.code })}
                  aria-label={`${nomPlateforme(l.code, f, l.libelle)} : ${f.eur(l.encaisse)}, ${l.nb} ${f.L('ventes', 'sales')}`}>
                  <Logo code={l.code} taille={32} />
                  <span style={{ minWidth: 0 }}><span className="fsb-nm">{nomPlateforme(l.code, f, l.libelle)}</span><span className="fsb-mt">{f.L(`${l.nb} vente${l.nb > 1 ? 's' : ''}`, `${l.nb} sale${l.nb > 1 ? 's' : ''}`)}{l.marge != null ? f.L(` · marge ${f.pct(l.marge)}`, ` · margin ${f.pct(l.marge)}`) : ''}</span></span>
                  <span className="fsb-am">{f.eur(l.encaisse)}<small>{f.pct(l.part * 100, 0)}</small></span>
                  <span className="fsb-chev"><IcoChevron /></span>
                  <span className="fsb-bar"><i className="fsb-barx" style={{ width: `${((l.encaisse / maxP) * 100).toFixed(1)}%` }} /></span>
                </button>
              ))}
              {sansVente.map((c) => (
                <button key={c} type="button" className="fsb-prow fsb-muted" onClick={() => ouvrir({ k: 'enligne', code: c })}>
                  <Logo code={c} taille={32} />
                  <span style={{ minWidth: 0 }}><span className="fsb-nm">{nomPlateforme(c, f)}</span><span className="fsb-mt">{f.L(`aucune vente · ${stock.parPlateforme[c]} en ligne`, `no sale · ${stock.parPlateforme[c]} online`)}{c === 'opla' ? f.L(' (quittée)', ' (left)') : ''}</span></span>
                  <span className="fsb-am">—</span><span className="fsb-chev"><IcoChevron /></span>
                </button>
              ))}
            </div>
          )}
        {L.length > 0 && <div className="fsb-tot"><span>{f.L(`Total · ${lp.nom}`, `Total · ${lp.nom}`)}</span><span><b>{f.eur(L.reduce((a, l) => a + l.encaisse, 0))}</b> · {f.L(`${I.nb} ventes`, `${I.nb} sales`)}</span></div>}
      </section>

      <section className="fsb-card fsb-rise" style={{ '--i': 12 }} aria-labelledby="fst-h-el">
        <div className="fsb-ch"><div><h2 id="fst-h-el">{f.L('En ligne aujourd’hui', 'Online today')}</h2><p>{f.L('articles en stock, par plateforme', 'items in stock, by platform')}</p></div></div>
        {!stock.lu ? <div style={{ display: 'grid', gap: 10 }}>{[90, 70, 80].map((w, k) => <span key={k} className="fsb-sk" style={{ width: `${w}%` }} />)}</div> : stock.total === 0
          ? <div className="fsb-empty"><b>{f.L('Aucun article en stock', 'No item in stock')}</b>{f.L('Ajoute un article depuis Lens ou le Stock pour le voir ici.', 'Add an item from Lens or Stock to see it here.')}</div>
          : (
            <>
              <div className="fsb-big">{f.num(stock.enLigne)} <small>{f.L(`en ligne sur ${f.num(stock.total)}`, `online of ${f.num(stock.total)}`)}</small></div>
              <div className="fsb-stack" aria-hidden="true"><i style={{ flex: stock.enLigne, background: 'var(--fsb-teal)' }} /><i style={{ flex: stock.pasEncore, background: 'var(--fsb-sunk)' }} /></div>
              <div className="fsb-pills">
                {Object.entries(stock.parPlateforme).sort((a, b) => b[1] - a[1]).map(([c, nb]) => (
                  <button key={c} type="button" className="fsb-pill" onClick={() => ouvrir({ k: 'enligne', code: c })} aria-label={`${nomPlateforme(c, f)} : ${nb} ${f.L('annonces en ligne', 'live listings')}`}>
                    <Logo code={c} taille={24} /><span>{nomPlateforme(c, f)}</span><b>{nb}</b></button>
                ))}
                <button type="button" className="fsb-pill fsb-wide" onClick={() => ouvrir({ k: 'pasencore' })}><span className="fsb-dot" aria-hidden="true" /><span>{f.L('Pas encore publiés', 'Not published yet')}</span><b>{stock.pasEncore}</b></button>
              </div>
            </>
          )}
      </section>

      <section className="fsb-card fsb-rise" style={{ '--i': 13 }} aria-labelledby="fst-h-dort">
        <div className="fsb-ch"><div><h2 id="fst-h-dort">{f.L('Ça dort en stock', 'Sleeping in stock')}</h2><p>{f.L('depuis l’entrée dans FillSell', 'since entering FillSell')}</p></div></div>
        {stock.total === 0 ? <div className="fsb-empty"><b>{f.L('Rien ne dort', 'Nothing is sleeping')}</b>{f.L('Ton stock est vide.', 'Your stock is empty.')}</div> : (
          <>
            <BarresAges stock={stock} f={f} />
            {stock.ages.slice(1).some((a) => a.nb > 0) && <div className="fsb-list" style={{ marginTop: 10 }}>{stock.plusAnciens.slice(0, 3).map((a) => <LigneArticle key={a.id} a={a} f={f} />)}</div>}
            <button type="button" className="fst-btn" onClick={() => ouvrir({ k: 'dormant' })}>{f.L('Voir les articles qui dorment', 'See sleeping items')}<IcoChevron /></button>
          </>
        )}
      </section>

      <section className="fsb-card fsb-rise" style={{ '--i': 14 }} aria-labelledby="fst-h-dv">
        <div className="fsb-ch"><div><h2 id="fst-h-dv">{f.L('Dernières ventes', 'Latest sales')}</h2><p>{lp.nom}</p></div></div>
        {bloc.dernieres.length
          ? <div className="fsb-list">{bloc.dernieres.slice(0, 5).map((v) => <LigneVente key={v.id} v={v} f={f} lang={lang} />)}</div>
          : <div className="fsb-empty"><b>{f.L(`Aucune vente · ${lp.nom}`, `No sale · ${lp.nom}`)}</b>{f.L('Tes ventes apparaîtront ici, avec leur plateforme et leur profit.', 'Your sales will show up here, with their platform and profit.')}</div>}
        <button type="button" className="fst-btn" onClick={() => aller(3)}>{f.L('Toutes les ventes', 'All sales')}<IcoChevron /></button>
      </section>

      {pile.length > 0 && <FeuilleDetail pile={pile} onPile={setPile} bloc={bloc} stock={stock} f={f} lang={lang} onAller={aller} />}
    </div>
  );
}
