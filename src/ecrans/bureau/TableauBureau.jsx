// ═══════════════════════════════════════════════════════════════════════════
// TABLEAU SUR ORDINATEUR (28/10) — maquette validée par Nico le 28/10.
// Une période choisie en haut pilote TOUT ce qui est dessous (profit, tuiles,
// courbe, plateformes, dernières ventes) ; le stock est un état d'aujourd'hui.
// Les chiffres viennent de utils/tableauStats.js, comme l'en-tête et les Stats.
// Chaque tuile, pastille et ligne de plateforme ouvre son détail (PanneauDetail).
// L'écran mobile n'est PAS ce fichier : DashboardTab garde son rendu sous 1 024 px.
// ═══════════════════════════════════════════════════════════════════════════
import { useMemo, useState } from 'react';
import './bureau.css';
import { blocPeriode, comparable, etatStock, PERIODES_BUREAU, periode } from '../../utils/tableauStats';
import { Courbes, Colonnes, TraceHeros } from './Graphes';
import { axeJours, axeMois } from './axe';
import PanneauDetail from './PanneauDetail';
import { Logo, Puce, PuceEtat, Tuile, ChoixPeriode, IcoOuvrir, IcoChevron, LigneVente, LigneArticle, BarresAges } from './pieces';
import { formats, libellesPeriode, jourLong, jourMoyen, jourCourt, nomPlateforme, useSuiviSaisie } from './outils';

const CLE_PERIODE = 'fs_tableau_periode';
const lirePeriode = () => { try { const v = localStorage.getItem(CLE_PERIODE); return PERIODES_BUREAU.includes(v) ? v : 'mois'; } catch { return 'mois'; } };

export default function TableauBureau({ ctx, lang, currency, username, setTab }) {
  useSuiviSaisie();
  const f = useMemo(() => formats(lang, currency), [lang, currency]);
  const [cle, setCle] = useState(lirePeriode);
  const [mesure, setMesure] = useState('ca');
  const [ouvert, setOuvert] = useState(null);
  const choisir = (v) => { setCle(v); try { localStorage.setItem(CLE_PERIODE, v); } catch { /* préférence locale seulement */ } };
  const bloc = useMemo(() => blocPeriode(ctx, cle), [ctx, cle]);
  const stock = useMemo(() => etatStock(ctx), [ctx]);
  const lp = libellesPeriode(bloc.periode, lang);
  const ok = comparable(bloc);
  const I = bloc.ind, V = bloc.prev;
  const ouvrir = (o) => setOuvert(o);
  const aller = (t) => { setOuvert(null); setTab(t); try { localStorage.setItem('tab', t); } catch { /* idem */ } };
  const options = PERIODES_BUREAU.map((k) => ({ cle: k, libelle: libellesPeriode(periode(k, ctx.auj), lang).bouton }));
  const ligneComparaison = !bloc.periode.precedente
    ? f.L('Tout l’historique, ventes sans date comprises', 'Full history, undated sales included')
    : ok ? f.L(`Comparé au ${lp.avant}`, `Compared with ${lp.avant}`)
      : V.nb === 0 ? f.L(`Pas de comparaison : aucune vente · ${lp.avant}`, `No comparison: no sale · ${lp.avant}`)
        : f.L(`Pas de comparaison : ${V.nb} vente${V.nb > 1 ? 's' : ''} seulement · ${lp.avant}`, `No comparison: only ${V.nb} sale${V.nb > 1 ? 's' : ''} · ${lp.avant}`);
  const vs = (x) => (ok ? `${x} · ${lp.avant}` : null);
  const enCours = stock.lu ? null : f.L('lecture…', 'loading…');

  // ── Courbe principale ─────────────────────────────────────────────────────
  const M = { ca: ['cumulCa', 'ca', f.eur, f.eur0, f.L('Encaissé', 'Collected')], profit: ['cumulProfit', 'profit', f.eur, f.eur0, f.L('Profit', 'Profit')], nb: ['cumulNb', 'nb', (v) => f.num(v), (v) => f.num(v), f.L('Ventes', 'Sales')] }[mesure];
  const serie = bloc.serie;
  let graphe;
  if (serie.pas === 'jour') {
    const estMois = cle === 'mois';
    const n = estMois ? Number(serie.finMois.slice(8, 10)) : serie.points.length;
    const cur = Array.from({ length: n }, (_, i) => (serie.points[i] ? serie.points[i][M[0]] : null));
    const prev = Array.from({ length: n }, (_, i) => (serie.prev[i] ? serie.prev[i][M[0]] : null));
    const der = serie.points.length - 1;
    const axe = axeJours({ n, lib: (i) => (estMois ? jourCourt(`${bloc.periode.debut.slice(0, 8)}${String(i + 1).padStart(2, '0')}`, lang) : jourCourt(serie.points[i].jour, lang)), grilles: [[0, 7, 14, 21], [0, 14], [0]], aujourdhui: der, libAuj: f.L('auj.', 'today'), fin: true });
    const legCur = estMois ? lp.nom : f.L('30 derniers jours', 'last 30 days');
    graphe = (
      <Courbes n={n} aria={`${M[4]} ${f.L('cumulé', 'cumulative')}, ${lp.nom}`} fy={M[3]} axe={axe}
        vide={I.nb === 0 && (!V || V.nb === 0) ? <span><b>{f.L(`Aucune vente pour l’instant · ${lp.nom}`, `No sale yet · ${lp.nom}`)}</b>{f.L('La courbe se dessine dès la première vente.', 'The curve draws itself from the first sale.')}</span> : null}
        series={[
          { vals: prev, couleur: 'var(--fsb-prev)', fin: prev[der] != null && V?.nb ? M[2](prev[der]) : null },
          { vals: cur, couleur: 'var(--fsb-teal)', voile: true, epaisseur: 2.5, fin: M[2](cur[der] ?? 0) },
        ]}
        bulle={(i) => {
          const a = serie.points[i], b = serie.prev[i];
          if (!a && !b) return null;
          const lignes = [];
          if (a) lignes.push({ couleur: 'var(--fsb-teal)', libelle: f.L(`${legCur}, cumul`, `${legCur}, total`), valeur: M[2](a[M[0]]) });
          if (b) lignes.push({ couleur: 'var(--fsb-prev)', libelle: f.L(`${jourCourt(b.jour, lang)}, cumul`, `${jourCourt(b.jour, lang)}, total`), valeur: M[2](b[M[0]]) });
          return { titre: a ? jourMoyen(a.jour, lang) : f.L('pas encore passé', 'not yet'), lignes, note: a ? f.L(`ce jour : ${M[2](a[M[1]])}${mesure !== 'nb' ? ` · ${a.nb} vente${a.nb > 1 ? 's' : ''}` : ''}`, `that day: ${M[2](a[M[1]])}${mesure !== 'nb' ? ` · ${a.nb} sale${a.nb > 1 ? 's' : ''}` : ''}`) : null };
        }} />
    );
  } else {
    graphe = <ColonnesMois bloc={bloc} mesure={mesure} f={f} lang={lang} />;
  }

  // ── Plateformes ───────────────────────────────────────────────────────────
  const L = bloc.plateformes;
  const maxP = Math.max(...L.map((l) => l.encaisse), 1e-9);
  const presentes = new Set(L.map((l) => l.code));
  const sansVente = stock.lu ? Object.keys(stock.parPlateforme).filter((c) => !presentes.has(c)) : [];
  const ages = stock.ages;

  return (
    <div className="fsb">
      <div className="fsb-head fsb-rise">
        <div>
          <h1>{f.L('Bonjour', 'Hello')}{username ? <> <em>{username}</em></> : null}</h1>
          <p>{jourLong(ctx.auj, lang)} · {f.L('chiffres de la période choisie, stock à l’instant', 'figures for the chosen period, stock as of now')}</p>
        </div>
        <div className="fsb-per"><ChoixPeriode valeur={cle} onChange={choisir} options={options} f={f} /><small>{ligneComparaison}</small></div>
      </div>

      <div className="fsb-grid">
        <button type="button" className="fsb-hero fsb-rise fsb-s4 fsb-xl3" onClick={() => ouvrir({ k: 'profit' })} aria-label={`${f.L('Profit', 'Profit')} · ${lp.nom} : ${I.profitRetenues ? f.eur(I.profit) : '—'}. ${f.L('Ouvrir le détail', 'Open details')}`}>
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

        <div className="fsb-kpis fsb-s8 fsb-xl9">
          <Tuile i={1} lab={f.L('Encaissé', 'Collected')} val={f.eur(I.encaisse)} puce={ok && <Puce cur={I.encaisse} prev={V.encaisse} f={f} />} cmp={vs(f.eur(V?.encaisse))} onOuvrir={() => ouvrir({ k: 'encaisse' })} aria={`${f.L('Encaissé', 'Collected')} : ${f.eur(I.encaisse)}`} />
          <Tuile i={2} lab={f.L('Ventes', 'Sales')} val={f.num(I.nb)} puce={ok && <Puce cur={I.nb} prev={V.nb} f={f} />} cmp={vs(f.num(V?.nb))} onOuvrir={() => ouvrir({ k: 'ventes' })} aria={`${f.L('Ventes', 'Sales')} : ${I.nb}`} />
          <Tuile i={3} lab={f.L('Panier moyen', 'Avg. basket')} val={f.eur(I.panier)} vide={I.panier == null} puce={ok && <Puce cur={I.panier} prev={V.panier} f={f} />} cmp={vs(f.eur(V?.panier))} onOuvrir={() => ouvrir({ k: 'panier' })} aria={`${f.L('Panier moyen', 'Average basket')} : ${f.eur(I.panier)}`} />
          <Tuile i={4} lab={f.L('Marge', 'Margin')} val={f.pct(I.marge)} vide={I.marge == null} puce={ok && I.marge != null && V.marge != null && <Puce cur={I.marge} prev={V.marge} kind="pts" f={f} />} cmp={ok && I.marge != null && V.marge != null ? vs(f.pct(V.marge)) : null}
            sub={I.marge != null ? f.L(`sur ${I.margeRetenues} ventes au prix d’achat connu`, `on ${I.margeRetenues} sales with a known cost`) : I.nb ? f.L('prix d’achat manquants', 'purchase prices missing') : null} onOuvrir={() => ouvrir({ k: 'marge' })} aria={`${f.L('Marge', 'Margin')} : ${f.pct(I.marge)}`} />
          <Tuile i={5} lab={f.L('Délai de vente constaté', 'Observed time to sell')} val={I.delai == null ? '—' : <>{f.jours(I.delai)} <small>{f.L('en moyenne', 'on average')}</small></>} vide={I.delai == null}
            puce={ok && I.delai != null && V.delai != null && <Puce cur={I.delai} prev={V.delai} kind="jours" inverse f={f} />} cmp={ok && I.delai != null && V.delai != null ? vs(f.jours(V.delai)) : null}
            sub={I.delaiN ? f.L(`médiane ${f.jours(I.delaiMediane)} · ${I.delaiN} ventes mesurées`, `median ${f.jours(I.delaiMediane)} · ${I.delaiN} sales measured`) : f.L('mesuré sur les articles créés dans FillSell', 'measured on items created in FillSell')}
            onOuvrir={() => ouvrir({ k: 'delai' })} aria={`${f.L('Délai de vente constaté', 'Observed time to sell')} : ${f.jours(I.delai)}`} />
          <Tuile i={6} lab={f.L('Articles en ligne', 'Items online')} val={stock.lu ? <>{f.num(stock.enLigne)} <small>{f.L(`sur ${f.num(stock.total)}`, `of ${f.num(stock.total)}`)}</small></> : '…'} vide={!stock.lu}
            puce={<PuceEtat>{f.L('aujourd’hui', 'today')}</PuceEtat>} cmp={stock.lu ? f.L(`${stock.pasEncore} pas encore publiés`, `${stock.pasEncore} not published yet`) : enCours} onOuvrir={() => ouvrir({ k: 'enligne' })} aria={`${f.L('Articles en ligne', 'Items online')} : ${stock.enLigne}`} />
          <Tuile i={7} lab={f.L('Stock immobilisé', 'Stock tied up')} val={f.eur(stock.immobilise)} puce={<PuceEtat>{f.L('aujourd’hui', 'today')}</PuceEtat>} cmp={f.L(`prix d’achat de ${stock.avecPrix} articles`, `cost of ${stock.avecPrix} items`)}
            sub={stock.sansPrix ? f.L(`${stock.sansPrix} articles sans prix d’achat non comptés`, `${stock.sansPrix} items without cost not counted`) : null} onOuvrir={() => ouvrir({ k: 'immobilise' })} aria={`${f.L('Stock immobilisé', 'Stock tied up')} : ${f.eur(stock.immobilise)}`} />
          <Tuile i={8} lab={f.L('Écoulement du stock', 'Sell-through')} val={bloc.ecoulement?.taux != null ? f.pct(bloc.ecoulement.taux * 100, 0) : '—'} vide={bloc.ecoulement?.taux == null}
            cmp={bloc.ecoulement ? f.L(`${f.num(bloc.ecoulement.vendus)} vendus · ${f.num(bloc.ecoulement.stock)} en stock`, `${f.num(bloc.ecoulement.vendus)} sold · ${f.num(bloc.ecoulement.stock)} in stock`) : f.L('sans objet depuis le début', 'not meaningful for all time')}
            onOuvrir={() => ouvrir({ k: 'ecoulement' })} aria={f.L('Écoulement du stock', 'Sell-through')} />
        </div>
      </div>

      <div className="fsb-grid">
        <section className="fsb-card fsb-fill fsb-s8 fsb-rise" style={{ '--i': 9 }} aria-labelledby="fsb-h-main">
          <div className="fsb-ch">
            <div><h2 id="fsb-h-main">{M[4]} {serie.pas === 'jour' ? f.L('cumulé, jour par jour', 'running total, day by day') : f.L('mois par mois', 'month by month')}</h2>
              <p>{serie.pas === 'jour' ? (ok || cle === 'mois' ? f.L(`${lp.nom}, comparé au ${lp.avant}`, `${lp.nom}, vs ${lp.avant}`) : lp.nom) : lp.nom}</p></div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {serie.pas === 'jour' && <div className="fsb-legend"><span><i style={{ background: 'var(--fsb-teal)' }} />{cle === 'mois' ? lp.nom : f.L('30 derniers jours', 'last 30 days')}</span><span><i style={{ background: 'var(--fsb-prev)' }} />{lp.avant}</span></div>}
              <div className="fsb-tabsm" role="group" aria-label={f.L('Mesure', 'Measure')}>
                {[['ca', f.L('Encaissé', 'Collected')], ['profit', f.L('Profit', 'Profit')], ['nb', f.L('Ventes', 'Sales')]].map(([k, l]) => <button key={k} type="button" aria-pressed={mesure === k} onClick={() => setMesure(k)}>{l}</button>)}
              </div>
            </div>
          </div>
          {graphe}
        </section>

        <section className="fsb-card fsb-s4 fsb-rise" style={{ '--i': 10 }} aria-labelledby="fsb-h-plat">
          <div className="fsb-ch"><div><h2 id="fsb-h-plat">{f.L('Par plateforme', 'By platform')}</h2><p>{f.L(`encaissé · ${lp.nom}`, `collected · ${lp.nom}`)}</p></div></div>
          {L.length === 0 && sansVente.length === 0
            ? <div className="fsb-empty"><b>{f.L(`Aucune vente · ${lp.nom}`, `No sale · ${lp.nom}`)}</b>{f.L('Chaque plateforme apparaîtra ici avec son encaissé dès sa première vente.', 'Each platform shows up here with its takings from its first sale.')}</div>
            : (
              <div className="fsb-plat">
                {L.map((l, i) => (
                  <button key={l.cle} type="button" className={`fsb-prow${l.code === 'sans' ? ' fsb-muted' : ''}`} onClick={() => ouvrir({ k: 'plateforme', code: l.code === 'autre' ? l.cle : l.code })}
                    aria-label={`${nomPlateforme(l.code, f, l.libelle)} : ${f.eur(l.encaisse)}, ${l.nb} ${f.L('ventes', 'sales')}. ${f.L('Ouvrir le détail', 'Open details')}`}>
                    <Logo code={l.code} taille={30} />
                    <span style={{ minWidth: 0 }}><span className="fsb-nm">{nomPlateforme(l.code, f, l.libelle)}</span><span className="fsb-mt">{f.L(`${l.nb} vente${l.nb > 1 ? 's' : ''}`, `${l.nb} sale${l.nb > 1 ? 's' : ''}`)}{l.marge != null ? f.L(` · marge ${f.pct(l.marge)}`, ` · margin ${f.pct(l.marge)}`) : ''}</span></span>
                    <span className="fsb-am">{f.eur(l.encaisse)}<small>{f.pct(l.part * 100, 0)}</small></span>
                    <span className="fsb-chev"><IcoChevron /></span>
                    <span className="fsb-bar"><i className="fsb-barx" style={{ width: `${((l.encaisse / maxP) * 100).toFixed(1)}%`, '--i': i }} /></span>
                  </button>
                ))}
                {sansVente.map((c) => (
                  <button key={c} type="button" className="fsb-prow fsb-muted" onClick={() => ouvrir({ k: 'enligne', code: c })}>
                    <Logo code={c} taille={30} />
                    <span style={{ minWidth: 0 }}><span className="fsb-nm">{nomPlateforme(c, f)}</span><span className="fsb-mt">{f.L(`aucune vente · ${stock.parPlateforme[c]} en ligne`, `no sale · ${stock.parPlateforme[c]} online`)}{c === 'opla' ? f.L(' (quittée le 10/10)', ' (left on 10 Oct)') : ''}</span></span>
                    <span className="fsb-am">—</span><span className="fsb-chev"><IcoChevron /></span>
                  </button>
                ))}
              </div>
            )}
          {L.length > 0 && <div className="fsb-tot"><span>{f.L(`Total · ${lp.nom}`, `Total · ${lp.nom}`)}</span><span><b>{f.eur(L.reduce((a, l) => a + l.encaisse, 0))}</b> · {f.L(`${I.nb} ventes`, `${I.nb} sales`)}</span></div>}
        </section>
      </div>

      <div className="fsb-grid">
        <section className="fsb-card fsb-s4 fsb-duo fsb-rise" style={{ '--i': 11 }} aria-labelledby="fsb-h-el">
          <div className="fsb-ch"><div><h2 id="fsb-h-el">{f.L('En ligne aujourd’hui', 'Online today')}</h2><p>{f.L('articles en stock, par plateforme', 'items in stock, by platform')}</p></div><button type="button" className="fsb-lnk" onClick={() => ouvrir({ k: 'enligne' })}>{f.L('Détail', 'Details')}</button></div>
          {!stock.lu ? <div style={{ display: 'grid', gap: 10 }}>{[90, 70, 80].map((w, k) => <span key={k} className="fsb-sk" style={{ width: `${w}%` }} />)}</div> : stock.total === 0
            ? <div className="fsb-empty"><b>{f.L('Aucun article en stock', 'No item in stock')}</b>{f.L('Ajoute un article depuis Lens ou le Stock pour le voir ici.', 'Add an item from Lens or Stock to see it here.')}</div>
            : (
              <>
                <div className="fsb-big">{f.num(stock.enLigne)} <small>{f.L(`en ligne sur ${f.num(stock.total)} en stock`, `online of ${f.num(stock.total)} in stock`)}</small></div>
                <div className="fsb-stack" aria-hidden="true"><i style={{ flex: stock.enLigne, background: 'var(--fsb-teal)' }} /><i style={{ flex: stock.pasEncore, background: 'var(--fsb-sunk)' }} /></div>
                <div className="fsb-pills">
                  {Object.entries(stock.parPlateforme).sort((a, b) => b[1] - a[1]).map(([c, nb]) => (
                    <button key={c} type="button" className="fsb-pill" onClick={() => ouvrir({ k: 'enligne', code: c })} aria-label={`${nomPlateforme(c, f)} : ${nb} ${f.L('annonces en ligne', 'live listings')}`}>
                      <Logo code={c} taille={22} /><span>{nomPlateforme(c, f)}{c === 'opla' && <span className="fsb-q">{f.L(' · quittée', ' · left')}</span>}</span><b>{nb}</b></button>
                  ))}
                  <button type="button" className="fsb-pill fsb-wide" onClick={() => ouvrir({ k: 'pasencore' })}><span className="fsb-dot" aria-hidden="true" /><span>{f.L('Pas encore publiés', 'Not published yet')}</span><b>{stock.pasEncore}</b></button>
                </div>
              </>
            )}
        </section>

        <section className="fsb-card fsb-s4 fsb-duo fsb-rise" style={{ '--i': 12 }} aria-labelledby="fsb-h-dort">
          <div className="fsb-ch"><div><h2 id="fsb-h-dort">{f.L('Ça dort en stock', 'Sleeping in stock')}</h2><p>{f.L('depuis l’entrée de l’article dans FillSell', 'since the item entered FillSell')}</p></div><button type="button" className="fsb-lnk" onClick={() => ouvrir({ k: 'dormant' })}>{f.L('Voir les articles', 'See items')}</button></div>
          {stock.total === 0 ? <div className="fsb-empty"><b>{f.L('Rien ne dort', 'Nothing is sleeping')}</b>{f.L('Ton stock est vide.', 'Your stock is empty.')}</div> : (
            <>
              <BarresAges stock={stock} f={f} />
              {stock.plusAnciens.length > 0 && ages.slice(1).some((a) => a.nb > 0) && (
                <div className="fsb-sec" style={{ marginTop: 16 }}><h4>{f.L('Les plus anciens', 'Oldest')}<span>{f.L('jours dans FillSell', 'days in FillSell')}</span></h4>
                  <div className="fsb-list">{stock.plusAnciens.slice(0, 3).map((a) => <LigneArticle key={a.id} a={a} f={f} />)}</div></div>
              )}
              <p className="fsb-note">{f.L('Montant à droite des barres = prix d’achat immobilisé (articles au prix connu).', 'Amount next to the bars = cost tied up (items with a known cost).')}</p>
            </>
          )}
        </section>

        <section className="fsb-card fsb-s4 fsb-duo fsb-rise" style={{ '--i': 13 }} aria-labelledby="fsb-h-dv">
          <div className="fsb-ch"><div><h2 id="fsb-h-dv">{f.L('Dernières ventes', 'Latest sales')}</h2><p>{lp.nom}</p></div><button type="button" className="fsb-lnk" onClick={() => aller(3)}>{f.L('Tout voir', 'See all')}</button></div>
          {bloc.dernieres.length
            ? <div className="fsb-list">{bloc.dernieres.slice(0, 6).map((v) => <LigneVente key={v.id} v={v} f={f} lang={lang} />)}</div>
            : <div className="fsb-empty"><b>{f.L(`Aucune vente · ${lp.nom}`, `No sale · ${lp.nom}`)}</b>{f.L('Tes ventes apparaîtront ici, avec leur plateforme et leur profit.', 'Your sales will show up here, with their platform and profit.')}</div>}
        </section>
      </div>

      <PanneauDetail ouvert={ouvert} bloc={bloc} stock={stock} f={f} lang={lang} onFermer={() => setOuvert(null)} onOuvrir={ouvrir} onAller={aller} />
    </div>
  );
}

/** Colonnes mois par mois (12 derniers mois, depuis le début). */
function ColonnesMois({ bloc, mesure, f, lang }) {
  const pts = bloc.serie.points;
  const key = { ca: 'encaisse', profit: 'profit', nb: 'nb' }[mesure];
  const fy = mesure === 'nb' ? (v) => f.num(v) : f.eur0;
  const fv = mesure === 'nb' ? (v) => f.num(v) : f.eur;
  const lib = { ca: f.L('encaissé', 'collected'), profit: f.L('profit', 'profit'), nb: f.L('ventes', 'sales') }[mesure];
  const nomP = libellesPeriode(bloc.periode, lang).nom;
  const vide = <span><b>{bloc.ind.nb === 0 ? f.L(`Aucune vente · ${nomP}`, `No sale · ${nomP}`) : mesure === 'profit' && !bloc.ind.profitRetenues ? f.L('Profit non calculé : prix d’achat manquants', 'No profit: purchase prices missing') : f.L(`Rien à afficher · ${nomP}`, `Nothing to show · ${nomP}`)}</b></span>;
  const nomM = (k, court) => new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', { timeZone: 'UTC', month: court ? 'short' : 'long', ...(court ? {} : { year: 'numeric' }) }).format(new Date(`${k}-15T12:00:00Z`));
  return (
    <ColonnesPleine axe={axeMois(pts.map((m) => m.mois), lang, { gras: (i) => i === pts.length - 1 })} fy={fy} vide={vide} aria={`${lib}, ${f.L('mois par mois', 'month by month')}`}
      series={[{ vals: pts.map((m) => (mesure === 'profit' && !m.profitRetenues ? null : m[key])), couleur: (i) => (i === pts.length - 1 ? 'var(--fsb-teal-soft)' : 'var(--fsb-teal)') }]}
      bulle={(i) => ({ titre: `${nomM(pts[i].mois, false)}${i === pts.length - 1 ? f.L(' (en cours)', ' (so far)') : ''}`, lignes: [{ couleur: 'var(--fsb-teal)', boite: true, libelle: lib, valeur: mesure === 'profit' && !pts[i].profitRetenues ? '—' : fv(pts[i][key]) }], note: f.L(`${pts[i].nb} ventes${pts[i].marge != null ? ` · marge ${f.pct(pts[i].marge)}` : ''}`, `${pts[i].nb} sales${pts[i].marge != null ? ` · margin ${f.pct(pts[i].marge)}` : ''}`) })} />
  );
}
const ColonnesPleine = (props) => <Colonnes {...props} hauteurMin={290} epaisseurMax={28} graduationsY={4} />;
