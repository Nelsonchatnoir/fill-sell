// ═══════════════════════════════════════════════════════════════════════════
// STATISTIQUES SUR ORDINATEUR (28/10) — maquette validée par Nico le 28/10.
// Plateforme la plus rentable, mois par mois, délai de vente constaté (par
// plateforme, catégorie, marque), marques et catégories, prix encaissé / prix
// affiché, écoulement et stock qui dort, jours où ça vend, analyse IA. Mêmes
// chiffres que le Tableau et l'en-tête : utils/tableauStats.js. Ouvert à tous
// les paliers, comme l'onglet Stats l'était déjà (analyse IA comprise).
// Écarté faute de donnée fiable : les HEURES de vente (cf. nbHeuresReelles).
// ═══════════════════════════════════════════════════════════════════════════
import { useMemo, useState } from 'react';
import './bureau.css';
import { blocPeriode, comparable, etatStock, evolutionMensuelle, nbHeuresReelles, nbSansDate, PERIODES_BUREAU, periode } from '../../utils/tableauStats';
import { Colonnes } from './Graphes';
import { axeMois, axeSimple } from './axe';
import PanneauDetail from './PanneauDetail';
import { Logo, Puce, Tuile, ChoixPeriode, Barres, IcoInfo, IcoEtincelle, BarresAges, Repartition } from './pieces';
import { formats, libellesPeriode, jourCourt, moisAnnee, nomPlateforme, useSuiviSaisie } from './outils';

const JOURS = { fr: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'], en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] };
const JOURS_C = { fr: ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'], en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] };
const TRANCHES = [['auDessus', 'var(--fsb-teal-deep)'], ['auPrix', 'var(--fsb-teal)'], ['moins10', 'var(--fsb-teal-soft)'], ['moins25', 'var(--fsb-amber-soft)'], ['plus25', 'var(--fsb-amber)']];
const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export default function StatsBureau({ ctx, lang, currency, cle, setCle, ia, setTab }) {
  useSuiviSaisie();
  const f = useMemo(() => formats(lang, currency), [lang, currency]);
  const [onglet, setOnglet] = useState('plateforme');
  const [ouvert, setOuvert] = useState(null);
  const bloc = useMemo(() => blocPeriode(ctx, cle), [ctx, cle]);
  const stock = useMemo(() => etatStock(ctx), [ctx]);
  const evolution = useMemo(() => evolutionMensuelle(ctx), [ctx]);
  const sansDate = useMemo(() => nbSansDate(ctx.ventes), [ctx]);
  const heures = useMemo(() => nbHeuresReelles(ctx.ventes), [ctx]);
  const lp = libellesPeriode(bloc.periode, lang);
  const ok = comparable(bloc);
  const I = bloc.ind, V = bloc.prev;
  const ouvrir = (o) => setOuvert(o);
  const aller = (t) => { setOuvert(null); setTab(t); try { localStorage.setItem('tab', t); } catch { /* préférence locale */ } };
  const options = PERIODES_BUREAU.map((k) => ({ cle: k, libelle: libellesPeriode(periode(k, ctx.auj), lang).bouton }));
  const p = bloc.periode;
  const bornes = p.debut
    ? f.L(`du ${jourCourt(p.debut, lang)}${p.debut.slice(0, 4) !== p.fin.slice(0, 4) ? ` ${p.debut.slice(0, 4)}` : ''} au ${jourCourt(p.fin, lang)} ${p.fin.slice(0, 4)}`, `${jourCourt(p.debut, lang)}${p.debut.slice(0, 4) !== p.fin.slice(0, 4) ? ` ${p.debut.slice(0, 4)}` : ''} – ${jourCourt(p.fin, lang)} ${p.fin.slice(0, 4)}`)
    : f.L('tout l’historique', 'full history');

  // Plateformes : les titres ne se disputent qu'entre vraies plateformes, et
  // jamais sur une poignée de ventes (règle « peu de ventes », comme l'écart).
  const reelles = bloc.plateformes.filter((l) => !['sans', 'ailleurs', 'autre'].includes(l.code));
  const plusProfit = reelles.filter((l) => l.profitRetenues > 0).reduce((a, b) => (!a || b.profit > a.profit ? b : a), null);
  const plusMarge = reelles.filter((l) => l.margeRetenues >= 5 && l.marge != null).reduce((a, b) => (!a || b.marge > a.marge ? b : a), null);
  const plusVite = reelles.filter((l) => l.delaiN >= 5).reduce((a, b) => (!a || b.delai < a.delai ? b : a), null);
  const margesPeuSures = reelles.filter((l) => l.marge != null && l.margeRetenues < 5);
  const maxCa = Math.max(...bloc.plateformes.map((l) => l.encaisse), 1e-9);

  const dl = bloc.delais;
  const lignesDelai = (onglet === 'plateforme' ? dl.plateforme : onglet === 'categorie' ? dl.categorie.filter((x) => x.n >= 3) : dl.marque).slice(0, 7);
  const nonClasse = bloc.categories.find((c) => c.cle === '∅');
  const classees = bloc.categories.filter((c) => c.cle !== '∅');
  const pa = bloc.prixAffiche;
  const js = bloc.joursSemaine;
  const jmax = Math.max(...js.jours.map((j) => j.nb), 0);
  const top2 = [...js.jours].sort((a, b) => b.nb - a.nb).slice(0, 2).filter((j) => j.nb > 0);
  const lj = lang === 'en' ? 'en' : 'fr';

  return (
    <div className="fsb">
      <div className="fsb-head fsb-rise">
        <div><h1>{f.L('Statistiques', 'Statistics')}</h1><p>{lp.bouton} · {bornes}</p></div>
        <div className="fsb-per"><ChoixPeriode valeur={cle} onChange={setCle} options={options} f={f} />
          <small>{!p.precedente ? f.L('Tout l’historique, ventes sans date comprises', 'Full history, undated sales included') : ok ? f.L(`Comparé au ${lp.avant}`, `Compared with ${lp.avant}`) : f.L('Sans comparaison (voir ci-dessous)', 'No comparison (see below)')}</small></div>
      </div>

      {p.precedente && !ok && (
        <div className="fsb-banner fsb-rise"><IcoInfo /><span>{(V.nb === 0 ? f.L(`Les écarts ne s’affichent pas : aucune vente datée · ${lp.avant}.`, `Changes are hidden: no dated sale · ${lp.avant}.`) : f.L(`Les écarts ne s’affichent pas : ${V.nb} vente${V.nb > 1 ? 's' : ''} datée${V.nb > 1 ? 's' : ''} seulement · ${lp.avant}, trop peu pour comparer.`, `Changes are hidden: only ${V.nb} dated sale${V.nb > 1 ? 's' : ''} · ${lp.avant}, too few to compare.`))}</span></div>
      )}

      <div className="fsb-kpis fsb-kpis6">
        <Tuile i={1} lab={f.L('Encaissé', 'Collected')} val={f.eur(I.encaisse)} puce={ok && <Puce cur={I.encaisse} prev={V.encaisse} f={f} />} cmp={ok ? lp.avant : null} onOuvrir={() => ouvrir({ k: 'encaisse' })} aria={`${f.L('Encaissé', 'Collected')} : ${f.eur(I.encaisse)}`} />
        <Tuile i={2} lab={f.L('Profit', 'Profit')} val={I.profitRetenues ? f.eur(I.profit) : '—'} vide={!I.profitRetenues} puce={ok && I.profitRetenues ? <Puce cur={I.profit} prev={V.profit} f={f} /> : null} cmp={I.profitExclus ? f.L(`${I.profitExclus} sans prix d’achat écartées`, `${I.profitExclus} without cost left out`) : null} onOuvrir={() => ouvrir({ k: 'profit' })} aria={`${f.L('Profit', 'Profit')} : ${f.eur(I.profit)}`} />
        <Tuile i={3} lab={f.L('Marge', 'Margin')} val={f.pct(I.marge)} vide={I.marge == null} puce={ok && I.marge != null && V.marge != null && <Puce cur={I.marge} prev={V.marge} kind="pts" f={f} />} cmp={I.marge != null ? f.L(`sur ${I.margeRetenues} ventes`, `on ${I.margeRetenues} sales`) : f.L('prix d’achat manquants', 'purchase prices missing')} onOuvrir={() => ouvrir({ k: 'marge' })} aria={`${f.L('Marge', 'Margin')} : ${f.pct(I.marge)}`} />
        <Tuile i={4} lab={f.L('Ventes', 'Sales')} val={f.num(I.nb)} puce={ok && <Puce cur={I.nb} prev={V.nb} f={f} />} cmp={cle === 'tout' ? f.L(`dont ${sansDate} sans date`, `${sansDate} undated`) : f.L('datées', 'dated')} onOuvrir={() => ouvrir({ k: 'ventes' })} aria={`${f.L('Ventes', 'Sales')} : ${I.nb}`} />
        <Tuile i={5} lab={f.L('Panier moyen', 'Avg. basket')} val={f.eur(I.panier)} vide={I.panier == null} puce={ok && <Puce cur={I.panier} prev={V.panier} f={f} />} cmp={f.L('par vente', 'per sale')} onOuvrir={() => ouvrir({ k: 'panier' })} aria={`${f.L('Panier moyen', 'Average basket')} : ${f.eur(I.panier)}`} />
        <Tuile i={6} lab={f.L('Délai constaté', 'Observed time')} val={f.jours(I.delai)} vide={I.delai == null} puce={ok && I.delai != null && V.delai != null && <Puce cur={I.delai} prev={V.delai} kind="jours" inverse f={f} />} cmp={I.delaiN ? f.L(`médiane ${f.jours(I.delaiMediane)} · ${I.delaiN} ventes`, `median ${f.jours(I.delaiMediane)} · ${I.delaiN} sales`) : f.L('aucune vente mesurée', 'no sale measured')} onOuvrir={() => ouvrir({ k: 'delai' })} aria={`${f.L('Délai constaté', 'Observed time')} : ${f.jours(I.delai)}`} />
      </div>

      <div className="fsb-grid">
        <section className="fsb-card fsb-s7 fsb-rise" style={{ '--i': 7 }} aria-labelledby="fsb-h-pr">
          <div className="fsb-ch"><div><h2 id="fsb-h-pr">{f.L('Quelle plateforme rapporte le plus', 'Which platform earns the most')}</h2><p>{f.L(`${lp.nom} · clique une ligne pour le détail`, `${lp.nom} · click a row for details`)}</p></div></div>
          {bloc.plateformes.length === 0 ? <div className="fsb-empty"><b>{f.L(`Aucune vente · ${lp.nom}`, `No sale · ${lp.nom}`)}</b>{f.L('Choisis une période plus longue.', 'Pick a longer period.')}</div> : (
            <>
              {(plusProfit || plusMarge || plusVite) && (
                <div className="fsb-badges">
                  {plusProfit && <div className="fsb-badge"><Logo code={plusProfit.code} taille={26} /><span><span className="fsb-k">{f.L('Plus de profit', 'Most profit')}</span><span className="fsb-vv">{nomPlateforme(plusProfit.code, f, plusProfit.libelle)} · {f.eur0(plusProfit.profit)}</span></span></div>}
                  {plusMarge && <div className="fsb-badge"><Logo code={plusMarge.code} taille={26} /><span><span className="fsb-k">{f.L('Meilleure marge', 'Best margin')}</span><span className="fsb-vv">{nomPlateforme(plusMarge.code, f, plusMarge.libelle)} · {f.pct(plusMarge.marge)}</span></span></div>}
                  {plusVite && <div className="fsb-badge"><Logo code={plusVite.code} taille={26} /><span><span className="fsb-k">{f.L('Vend le plus vite', 'Sells fastest')}</span><span className="fsb-vv">{nomPlateforme(plusVite.code, f, plusVite.libelle)} · {f.L(`${f.jours(plusVite.delai)} en moyenne`, `${f.jours(plusVite.delai)} on average`)}</span></span></div>}
                </div>
              )}
              <div className="fsb-tbl-box"><table className="fsb-tbl">
                <thead><tr><th>{f.L('Plateforme', 'Platform')}</th><th>{f.L('Ventes', 'Sales')}</th><th style={{ minWidth: 150 }}>{f.L('Encaissé', 'Collected')}</th><th>{f.L('Profit', 'Profit')}</th><th>{f.L('Marge', 'Margin')}</th><th>{f.L('Panier', 'Basket')}</th><th>{f.L('Délai', 'Time')}</th></tr></thead>
                <tbody>{bloc.plateformes.map((l) => (
                  <tr key={l.cle} className="fsb-click" onClick={() => ouvrir({ k: 'plateforme', code: l.code === 'autre' ? l.cle : l.code })}>
                    <td><button type="button" className="fsb-rowbtn" onClick={(e) => { e.stopPropagation(); ouvrir({ k: 'plateforme', code: l.code === 'autre' ? l.cle : l.code }); }}><Logo code={l.code} taille={24} />{nomPlateforme(l.code, f, l.libelle)}</button></td>
                    <td>{l.nb}</td>
                    <td><span className="fsb-inb"><i style={{ width: Math.max(2, (l.encaisse / maxCa) * 90) }} />{f.eur(l.encaisse)}</span></td>
                    <td>{l.profitRetenues ? f.eur(l.profit) : <span className="fsb-m">—</span>}</td>
                    <td>{l.marge != null ? <>{f.pct(l.marge)}{l.margeRetenues < 5 && <span className="fsb-m"> *</span>}</> : <span className="fsb-m">—</span>}</td>
                    <td>{f.eur(l.panier)}</td>
                    <td>{l.delaiN ? f.jours(l.delai) : <span className="fsb-m">—</span>}</td>
                  </tr>
                ))}</tbody>
              </table></div>
              {margesPeuSures.length > 0 && <p className="fsb-note">{f.L(`* moins de 5 ventes au prix d’achat connu : ${margesPeuSures.map((l) => `${nomPlateforme(l.code, f, l.libelle)} (${l.margeRetenues})`).join(', ')}. Ces marges ne concourent pas au titre de meilleure marge.`, `* fewer than 5 sales with a known cost: ${margesPeuSures.map((l) => `${nomPlateforme(l.code, f, l.libelle)} (${l.margeRetenues})`).join(', ')}. These margins do not compete for best margin.`)}</p>}
            </>
          )}
        </section>

        <section className="fsb-card fsb-s5 fsb-rise" style={{ '--i': 8 }} aria-labelledby="fsb-h-ev">
          <div className="fsb-ch"><div><h2 id="fsb-h-ev">{f.L('Mois par mois', 'Month by month')}</h2><p>{evolution.length ? f.L(`depuis ${moisAnnee(evolution[0].mois, lang)}, 12 derniers mois au plus`, `since ${moisAnnee(evolution[0].mois, lang)}, last 12 months at most`) : f.L('12 derniers mois', 'last 12 months')}</p></div>
            {evolution.length > 0 && <div className="fsb-legend"><span><i className="fsb-box" style={{ background: 'var(--fsb-teal-soft)' }} />{f.L('Encaissé', 'Collected')}</span><span><i className="fsb-box" style={{ background: 'var(--fsb-teal-deep)' }} />{f.L('Profit', 'Profit')}</span></div>}</div>
          {evolution.length === 0 ? <div className="fsb-empty"><b>{f.L('Aucune vente datée sur 12 mois', 'No dated sale in 12 months')}</b>{f.L('Les mois se rempliront avec tes ventes.', 'Months will fill up with your sales.')}</div> : (
            <>
              <Colonnes hauteur={200} axe={axeMois(evolution.map((m) => m.mois), lang, { gras: (i) => i === evolution.length - 1 })} fy={f.eur0} epaisseurMax={22} aria={f.L('Encaissé et profit par mois', 'Takings and profit per month')}
                series={[{ vals: evolution.map((m) => m.encaisse), couleur: 'var(--fsb-teal-soft)' }, { vals: evolution.map((m) => (m.profitRetenues ? m.profit : null)), couleur: 'var(--fsb-teal-deep)' }]}
                bulle={(i) => ({ titre: `${capital(moisAnnee(evolution[i].mois, lang))}${i === evolution.length - 1 ? f.L(' (en cours)', ' (so far)') : ''}`, lignes: [{ couleur: 'var(--fsb-teal-soft)', boite: true, libelle: f.L('encaissé', 'collected'), valeur: f.eur(evolution[i].encaisse) }, { couleur: 'var(--fsb-teal-deep)', boite: true, libelle: 'profit', valeur: evolution[i].profitRetenues ? f.eur(evolution[i].profit) : '—' }], note: f.L(`${evolution[i].nb} ventes`, `${evolution[i].nb} sales`) })} />
              <div className="fsb-tbl-box" style={{ marginTop: 10 }}><table className="fsb-tbl">
                <thead><tr><th>{f.L('Mois', 'Month')}</th><th>{f.L('Ventes', 'Sales')}</th><th>{f.L('Encaissé', 'Collected')}</th><th>{f.L('Marge', 'Margin')}</th><th>{f.L('vs mois d’avant', 'vs prior month')}</th></tr></thead>
                <tbody>{evolution.map((m, i) => {
                  const enCours = i === evolution.length - 1, avant = evolution[i - 1];
                  return (
                    <tr key={m.mois}><td className="fsb-nm">{capital(moisAnnee(m.mois, lang))}{enCours && <span className="fsb-m">{f.L(' (en cours)', ' (so far)')}</span>}</td><td>{m.nb}</td><td>{f.eur(m.encaisse)}</td><td>{m.marge != null ? f.pct(m.marge) : <span className="fsb-m">—</span>}</td>
                      <td>{enCours ? <span className="fsb-m">{f.L('mois en cours', 'in progress')}</span> : avant && avant.nb >= 5 ? <Puce cur={m.encaisse} prev={avant.encaisse} f={f} /> : <span className="fsb-m">—</span>}</td></tr>
                  );
                })}</tbody>
              </table></div>
            </>
          )}
        </section>
      </div>

      <div className="fsb-grid">
        <section className="fsb-card fsb-s4 fsb-duo fsb-rise" style={{ '--i': 9 }} aria-labelledby="fsb-h-dl">
          <div className="fsb-ch fsb-col"><div><h2 id="fsb-h-dl">{f.L('Délai de vente constaté', 'Observed time to sell')}</h2><p>{f.L('de la mise en ligne à la vente', 'from listing to sale')}</p></div>
            <div className="fsb-tabsm" role="group" aria-label={f.L('Ventiler par', 'Break down by')} style={{ alignSelf: 'flex-start' }}>
              {[['plateforme', f.L('Plateforme', 'Platform')], ['categorie', f.L('Catégorie', 'Category')], ['marque', f.L('Marque', 'Brand')]].map(([k, l]) => <button key={k} type="button" aria-pressed={onglet === k} onClick={() => setOnglet(k)}>{l}</button>)}
            </div></div>
          {dl.n === 0 ? <div className="fsb-empty"><b>{f.L('Aucune vente mesurée', 'No sale measured')}</b>{f.L('Le délai se mesure sur les articles créés dans FillSell, de leur mise en ligne à leur vente.', 'Time to sell is measured on items created in FillSell, from listing to sale.')}</div> : (
            <>
              <p className="fsb-insight">{f.L('La moitié de tes ventes mesurées part en ', 'Half of your measured sales go in ')}<b>{f.jours(dl.mediane)}</b>{f.L(' ou moins.', ' or less.')}</p>
              <Repartition d={dl.distribution} f={f} />
              <div style={{ marginTop: 16 }}>
                {lignesDelai.length ? <Barres lignes={lignesDelai.map((x) => ({ cle: x.cle, icone: onglet === 'plateforme' ? <Logo code={x.cle.startsWith('autre:') ? 'autre' : x.cle} taille={18} /> : null, libelle: onglet === 'plateforme' ? nomPlateforme(x.cle.startsWith('autre:') ? 'autre' : x.cle, f, x.libelle) : onglet === 'categorie' ? f.cat(x.libelle) : f.marque(x.libelle), valeur: x.moyenne, texte: f.jours(x.moyenne), detail: f.L(`${x.n} v.`, `${x.n}`), discret: x.cle === '∅' || x.cle === 'sans' }))} />
                  : <div className="fsb-empty">{f.L('Pas assez de ventes mesurées (3 au moins par ligne).', 'Not enough measured sales (at least 3 per row).')}</div>}
              </div>
              <p className="fsb-note">{f.L(`Moyenne par ligne, ventes mesurées à droite. Mesuré sur ${dl.n} ventes d’articles créés dans FillSell : pour un article importé d’un dressing, la date réelle de mise en ligne n’est pas connue.`, `Average per row, measured sales on the right. Based on ${dl.n} sales of items created in FillSell: items imported from a wardrobe have no known listing date.`)}</p>
            </>
          )}
        </section>

        <section className="fsb-card fsb-s4 fsb-duo fsb-rise" style={{ '--i': 10 }} aria-labelledby="fsb-h-mq">
          <div className="fsb-ch"><div><h2 id="fsb-h-mq">{f.L('Marques qui vendent le mieux', 'Best-selling brands')}</h2><p>{f.L('classées par encaissé', 'ranked by takings')}</p></div></div>
          {bloc.marques.length === 0 ? <div className="fsb-empty"><b>{f.L(`Aucune vente · ${lp.nom}`, `No sale · ${lp.nom}`)}</b></div> : (
            <>
              <div className="fsb-tbl-box"><table className="fsb-tbl"><thead><tr><th>{f.L('Marque', 'Brand')}</th><th>{f.L('Ventes', 'Sales')}</th><th>{f.L('Encaissé', 'Collected')}</th><th>{f.L('Marge', 'Margin')}</th></tr></thead>
                <tbody>{bloc.marques.slice(0, 8).map((m) => <tr key={m.cle}><td className={`fsb-nm${m.cle === '∅' ? ' fsb-m' : ''}`} title={f.marque(m.libelle)}>{f.marque(m.libelle)}</td><td>{m.nb}</td><td>{f.eur(m.encaisse)}</td><td>{m.marge != null ? f.pct(m.marge) : <span className="fsb-m">—</span>}</td></tr>)}</tbody></table></div>
              <p className="fsb-note">{f.L('« — » : aucune vente de la marque n’a un prix d’achat supérieur à 0 €.', '“—”: no sale of the brand has a purchase price above €0.')}</p>
            </>
          )}
        </section>

        <section className="fsb-card fsb-s4 fsb-duo fsb-rise" style={{ '--i': 11 }} aria-labelledby="fsb-h-ct">
          <div className="fsb-ch"><div><h2 id="fsb-h-ct">{f.L('Catégories', 'Categories')}</h2><p>{f.L('encaissé des ventes classées', 'takings of categorised sales')}</p></div></div>
          {classees.length > 0 && <Barres lignes={classees.slice(0, 6).map((c) => ({ cle: c.cle, libelle: f.cat(c.libelle), valeur: c.encaisse, texte: f.eur0(c.encaisse), detail: f.L(`${c.nb} v.`, `${c.nb}`) }))} />}
          {nonClasse && (
            <div className="fsb-empty" style={{ marginTop: classees.length ? 16 : 0 }}><b>{f.L(`${nonClasse.nb} ventes sur ${I.nb} sans catégorie`, `${nonClasse.nb} of ${I.nb} sales without a category`)}</b>{f.L(`${f.eur0(nonClasse.encaisse)} encaissés ne sont rangés dans aucune catégorie : classe tes articles pour affiner ce bloc.`, `${f.eur0(nonClasse.encaisse)} of takings sit in no category: categorise your items to refine this block.`)}</div>
          )}
          {!nonClasse && classees.length === 0 && <div className="fsb-empty"><b>{f.L(`Aucune vente · ${lp.nom}`, `No sale · ${lp.nom}`)}</b></div>}
        </section>
      </div>

      <div className="fsb-grid">
        <section className="fsb-card fsb-s4 fsb-duo fsb-rise" style={{ '--i': 12 }} aria-labelledby="fsb-h-pa">
          <div className="fsb-ch"><div><h2 id="fsb-h-pa">{f.L('Prix encaissé / prix affiché', 'Price received / listed')}</h2><p>{f.L('sur la plateforme de la vente', 'on the platform of the sale')}</p></div></div>
          {!stock.lu ? <div style={{ display: 'grid', gap: 10 }}>{[80, 60, 70].map((w, k) => <span key={k} className="fsb-sk" style={{ width: `${w}%` }} />)}</div> : pa.n === 0
            ? <div className="fsb-empty"><b>{f.L('Pas encore de prix affiché connu', 'No known listed price yet')}</b>{f.L('Ce bloc se remplit avec les ventes d’articles publiés par FillSell.', 'This block fills up with sales of items published by FillSell.')}</div>
            : (
              <>
                <div className="fsb-big">{f.pct(pa.ratio * 100, 0)} <small>{f.L('du prix affiché, en moyenne', 'of the listed price, on average')}</small></div>
                <div className="fsb-dist" style={{ marginTop: 14 }} aria-hidden="true">{TRANCHES.map(([k, c]) => <i key={k} style={{ flex: pa.tranches[k] || 0.0001, background: c }} />)}</div>
                <div className="fsb-lg">{TRANCHES.map(([k, c]) => <div key={k}><i style={{ background: c }} />{{ auDessus: f.L('au-dessus du prix', 'above the price'), auPrix: f.L('au prix affiché', 'at the listed price'), moins10: f.L('jusqu’à −10 %', 'up to −10%'), moins25: f.L('−10 à −25 %', '−10 to −25%'), plus25: f.L('plus de −25 %', 'over −25%') }[k]}<b>{pa.tranches[k]}</b></div>)}</div>
                <p className="fsb-note">{f.L('Calculé sur ', 'Based on ')}<b>{f.L(`${pa.n} ventes sur ${pa.ventes}`, `${pa.n} of ${pa.ventes} sales`)}</b>{f.L(` : celles dont FillSell connaît le prix publié sur la plateforme de la vente. Écart total : ${f.eur(pa.ecart)}.`, `: those whose listed price on the platform of the sale is known to FillSell. Total gap: ${f.eur(pa.ecart)}.`)}</p>
              </>
            )}
        </section>

        <section className="fsb-card fsb-s4 fsb-duo fsb-rise" style={{ '--i': 13 }} aria-labelledby="fsb-h-ec">
          <div className="fsb-ch"><div><h2 id="fsb-h-ec">{f.L('Écoulement du stock', 'Sell-through')}</h2><p>{lp.nom}</p></div><button type="button" className="fsb-lnk" onClick={() => ouvrir({ k: 'dormant' })}>{f.L('Articles qui dorment', 'Sleeping items')}</button></div>
          {bloc.ecoulement?.taux != null
            ? <><div className="fsb-big">{f.pct(bloc.ecoulement.taux * 100, 0)} <small>{f.L('du stock disponible vendu', 'of available stock sold')}</small></div>
              <p className="fsb-note" style={{ marginTop: 6 }}>{f.L(`${f.num(bloc.ecoulement.vendus)} vendus ÷ (${f.num(bloc.ecoulement.vendus)} vendus + ${f.num(bloc.ecoulement.stock)} encore en stock)`, `${f.num(bloc.ecoulement.vendus)} sold ÷ (${f.num(bloc.ecoulement.vendus)} sold + ${f.num(bloc.ecoulement.stock)} still in stock)`)}</p></>
            : <div className="fsb-empty"><b>{f.L('Sans objet depuis le début', 'Not meaningful for all time')}</b>{f.L('Choisis une période pour mesurer l’écoulement.', 'Pick a period to measure sell-through.')}</div>}
          {stock.total > 0 && <div style={{ marginTop: 16 }}><BarresAges stock={stock} f={f} /></div>}
          <p className="fsb-note">{f.L('Âge = jours depuis l’entrée de l’article dans FillSell, aujourd’hui.', 'Age = days since the item entered FillSell, today.')}</p>
        </section>

        <section className="fsb-card fsb-s4 fsb-duo fsb-rise" style={{ '--i': 14 }} aria-labelledby="fsb-h-js">
          <div className="fsb-ch"><div><h2 id="fsb-h-js">{f.L('Jours où ça vend', 'Best days to sell')}</h2><p>{f.L(`${js.n} ventes datées · ${lp.nom}`, `${js.n} dated sales · ${lp.nom}`)}</p></div></div>
          {js.n === 0 ? <div className="fsb-empty"><b>{f.L('Aucune vente datée', 'No dated sale')}</b>{f.L('Choisis une période plus longue.', 'Pick a longer period.')}</div> : (
            <>
              {top2.length === 2 && <p className="fsb-insight"><b>{capital(JOURS[lj][top2[0].jour])}</b>{f.L(' et ', ' and ')}<b>{f.L(JOURS[lj][top2[1].jour], JOURS[lj][top2[1].jour])}</b>{f.L(' sont tes meilleurs jours.', ' are your best days.')}</p>}
              <Colonnes hauteur={150} axe={axeSimple(js.jours.map((j) => JOURS_C[lj][j.jour]))} vlab={(v) => f.num(v)} epaisseurMax={26} aria={f.L('Ventes par jour de la semaine', 'Sales per weekday')}
                series={[{ vals: js.jours.map((j) => j.nb), couleur: (i) => (js.jours[i].nb === jmax ? 'var(--fsb-teal-deep)' : 'var(--fsb-teal-soft)') }]}
                bulle={(i) => ({ titre: capital(JOURS[lj][i]), lignes: [{ couleur: 'var(--fsb-teal)', boite: true, libelle: f.L('ventes', 'sales'), valeur: f.num(js.jours[i].nb) }], note: `${f.eur(js.jours[i].ca)} ${f.L('encaissés', 'collected')}` })} />
            </>
          )}
          <p className="fsb-note">{f.L(`Les heures ne sont pas affichées : l’heure réelle n’est connue que pour ${heures} vente${heures > 1 ? 's' : ''} sur ${ctx.ventes.length}.`, `Hours are not shown: the real time is known for only ${heures} of ${ctx.ventes.length} sales.`)}</p>
        </section>
      </div>

      <section className="fsb-card fsb-rise" style={{ '--i': 15 }} aria-labelledby="fsb-h-ia">
        <div className="fsb-ia">
          <span className="fsb-ic"><IcoEtincelle /></span>
          <div style={{ flex: 1, minWidth: 0 }}><h2 id="fsb-h-ia" style={{ margin: 0, fontSize: 15.5, fontWeight: 700 }}>{f.L('Analyse IA', 'AI analysis')}</h2><p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--fsb-mute)' }}>{f.L(`Tendances, prix et conseils sur tes ventes · ${lp.nom}`, `Trends, prices and advice on your sales · ${lp.nom}`)}</p></div>
          {ia.chargement ? null : ia.texte ? (ia.perime && <button type="button" className="fsb-ghost" onClick={ia.lancer}>{f.L('Actualiser', 'Refresh')}</button>)
            : I.nb > 0 && <button type="button" className="fsb-cta" onClick={ia.lancer}>{f.L('Lancer mon analyse', 'Run my analysis')}</button>}
        </div>
        {ia.chargement && <div style={{ display: 'grid', gap: 8, marginTop: 14 }} aria-label={f.L('Analyse en cours', 'Analysis running')}>{[100, 82, 64].map((w, k) => <span key={k} className="fsb-sk" style={{ width: `${w}%` }} />)}</div>}
        {!ia.chargement && ia.texte && <div className="fsb-ia-txt" dangerouslySetInnerHTML={ia.html} />}
        {!ia.chargement && !ia.texte && I.nb === 0 && <p className="fsb-note">{f.L('Aucune vente sur cette période : choisis une période plus longue.', 'No sale in this period: pick a longer one.')}</p>}
      </section>

      <PanneauDetail ouvert={ouvert} bloc={bloc} stock={stock} f={f} lang={lang} onFermer={() => setOuvert(null)} onOuvrir={ouvrir} onAller={aller} />
    </div>
  );
}
