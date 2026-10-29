// Le CONTENU du détail ouvert depuis une tuile, une pastille ou une ligne (28/10, extrait le
// 29/10 de PanneauDetail) : le même pour le panneau latéral de l'ordinateur et pour la feuille
// qui monte du bas sur téléphone. Rend { icone, titre, sous, corps, pied } ou null.
// `tactile` : graphes lus au doigt (bandeau au-dessus du graphe, jamais sous le pouce).
import { comparable } from '../../utils/tableauStats';
import { Colonnes } from './Graphes';
import { Logo, Puce, PuceEtat, IcoChevron, IcoOuvrir, Barres, MiniTuile, LigneArticle, LigneVente, Repartition, BarresAges } from './pieces';
import { jourMoyen, nomMois, moisAnnee, libellesPeriode, nomPlateforme } from './outils';

export function contenuDetail({ ouvert, bloc, stock, f, lang, onOuvrir, onAller, tactile = false }) {
  if (!ouvert) return null;
  const p = bloc.periode, lp = libellesPeriode(p, lang), ok = comparable(bloc);
  const I = bloc.ind, V = bloc.prev;
  let icone = null, titre = '', sous = ok ? f.L(`${lp.nom} · comparé au ${lp.avant}`, `${lp.nom} · vs ${lp.avant}`) : lp.nom, corps = null, pied = null;
  const vsTxt = (x) => (ok ? `${x} · ${lp.avant}` : null);
  const parJourOuMois = (serie) => {
    const jour = Boolean(serie[0]?.jour);
    return (
      <Colonnes hauteur={tactile ? 130 : 150} bandeau={tactile} labels={serie.map((x, i) => (jour ? (i % 7 === 0 || i === serie.length - 1 ? String(Number(x.jour.slice(8, 10))) : '') : nomMois(x.mois, lang, true)))}
        series={[{ vals: serie.map((x) => x.nb), couleur: 'var(--fsb-teal)' }]} fy={(v) => f.num(v)} epaisseurMax={14}
        aria={f.L('Ventes par jour', 'Sales per day')} indication={f.L('Touche un jour', 'Tap a day')}
        bulle={(i) => ({ titre: jour ? jourMoyen(serie[i].jour, lang) : moisAnnee(serie[i].mois, lang), lignes: [{ couleur: 'var(--fsb-teal)', boite: true, libelle: f.L('ventes', 'sales'), valeur: f.num(serie[i].nb) }], note: `${f.eur(serie[i].ca)} ${f.L('encaissés', 'collected')}` })} />
    );
  };

  if (ouvert.k === 'plateforme') {
    const l = bloc.plateformes.find((x) => x.code === ouvert.code || x.cle === ouvert.code);
    if (!l) return null;
    const okp = ok && l.prev && l.prev.nb > 0;
    const nom = nomPlateforme(l.code, f, l.libelle);
    icone = <Logo code={l.code} taille={tactile ? 40 : 44} />;
    titre = nom;
    corps = (
      <>
        <div className="fsb-dhero">
          <div><div className="fsb-lab">{f.L('Encaissé', 'Collected')}</div><div className="fsb-val">{f.eur(l.encaisse)}</div>
            <div className="fsb-row" style={{ marginTop: 8 }}>{okp && <Puce cur={l.encaisse} prev={l.prev.encaisse} f={f} />}{okp && <span className="fsb-cmpt">{f.eur(l.prev.encaisse)} · {lp.avant}</span>}</div></div>
          <div className="fsb-share"><b>{f.pct(l.part * 100, 0)}</b>{f.L(`de ton encaissé · ${lp.nom}`, `of your takings · ${lp.nom}`)}</div>
        </div>
        <div className="fsb-dk">
          <MiniTuile lab={f.L('Ventes', 'Sales')} val={f.num(l.nb)} puce={okp && <Puce cur={l.nb} prev={l.prev.nb} f={f} />} cmp={okp ? f.num(l.prev.nb) : null} />
          <MiniTuile lab={f.L('Profit', 'Profit')} val={l.profitRetenues ? f.eur(l.profit) : '—'} puce={okp && l.profitRetenues ? <Puce cur={l.profit} prev={l.prev.profit} f={f} /> : null} cmp={okp && l.profitRetenues ? f.eur0(l.prev.profit) : null} sub={l.profitExclus ? f.L(`${l.profitExclus} sans prix d’achat`, `${l.profitExclus} without cost`) : null} />
          <MiniTuile lab={f.L('Marge', 'Margin')} val={f.pct(l.marge)} puce={okp && l.marge != null && l.prev.marge != null ? <Puce cur={l.marge} prev={l.prev.marge} kind="pts" f={f} /> : null} sub={l.marge != null ? f.L(`sur ${l.margeRetenues} ventes`, `on ${l.margeRetenues} sales`) : f.L('prix d’achat manquants', 'purchase prices missing')} />
          <MiniTuile lab={f.L('Panier moyen', 'Avg. basket')} val={f.eur(l.panier)} puce={okp && <Puce cur={l.panier} prev={l.prev.panier} f={f} />} />
          <MiniTuile lab={f.L('Délai constaté', 'Observed time')} val={f.jours(l.delai)} puce={okp && l.delai != null && l.prev.delai != null ? <Puce cur={l.delai} prev={l.prev.delai} kind="jours" inverse f={f} /> : null} sub={l.delaiN ? f.L(`médiane ${f.jours(l.delaiMediane)} · ${l.delaiN} ventes`, `median ${f.jours(l.delaiMediane)} · ${l.delaiN} sales`) : f.L('aucune vente mesurée', 'no sale measured')} />
          <MiniTuile lab={f.L('En ligne', 'Online')} val={stock.lu ? f.num(stock.parPlateforme[l.code] ?? 0) : '…'} puce={<PuceEtat>{f.L('aujourd’hui', 'today')}</PuceEtat>} sub={f.L('annonces actives', 'live listings')} />
        </div>
        <div className="fsb-sec"><h4>{l.serie[0]?.jour ? f.L('Ventes par jour', 'Sales per day') : f.L('Ventes par mois', 'Sales per month')}<span>{lp.nom}</span></h4>{parJourOuMois(l.serie)}</div>
        {l.prixAffiche.n > 0 && (
          <div className="fsb-sec"><h4>{f.L('Prix encaissé / prix affiché', 'Price received / listed')}<span>{f.L(`${l.prixAffiche.n} ventes au prix publié connu`, `${l.prixAffiche.n} sales with a known listed price`)}</span></h4>
            <div className="fsb-big">{f.pct(l.prixAffiche.ratio * 100, 0)} <small>{f.L(`du prix affiché sur ${nom}`, `of the listed price on ${nom}`)}</small></div></div>
        )}
        <div className="fsb-sec"><h4>{f.L('Meilleures marques', 'Top brands')}<span>{f.L('par encaissé', 'by takings')}</span></h4>
          <table className="fsb-tbl"><thead><tr><th>{f.L('Marque', 'Brand')}</th><th>{f.L('Ventes', 'Sales')}</th><th>{f.L('Encaissé', 'Collected')}</th><th>{f.L('Marge', 'Margin')}</th></tr></thead>
            <tbody>{l.marques.map((m) => <tr key={m.cle}><td className={`fsb-nm${m.cle === '∅' ? ' fsb-m' : ''}`} title={f.marque(m.libelle)}>{f.marque(m.libelle)}</td><td>{m.nb}</td><td>{f.eur(m.encaisse)}</td><td>{m.marge != null ? f.pct(m.marge) : <span className="fsb-m">—</span>}</td></tr>)}</tbody></table></div>
        <div className="fsb-sec"><h4>{f.L('Catégories', 'Categories')}<span>{f.L('par encaissé', 'by takings')}</span></h4>
          <Barres lignes={l.categories.map((c) => ({ cle: c.cle, libelle: f.cat(c.libelle), valeur: c.encaisse, texte: f.eur0(c.encaisse), detail: f.L(`${c.nb} v.`, `${c.nb}`), discret: c.cle === '∅' }))} /></div>
        <div className="fsb-sec"><h4>{f.L('Dernières ventes', 'Latest sales')}<span>{nom}</span></h4><div className="fsb-list">{l.dernieres.map((v) => <LigneVente key={v.id} v={v} f={f} lang={lang} />)}</div></div>
      </>
    );
    pied = <button type="button" className="fsb-cta" onClick={() => onAller(3)}>{f.L(`Voir les ventes ${nom}`, `See ${nom} sales`)}<IcoChevron /></button>;
  } else if (ouvert.k === 'enligne') {
    sous = f.L('aujourd’hui', 'today');
    if (ouvert.code) {
      const code = ouvert.code;
      icone = <Logo code={code} taille={tactile ? 40 : 44} />;
      titre = f.L(`En ligne sur ${nomPlateforme(code, f)}`, `Online on ${nomPlateforme(code, f)}`);
      corps = (
        <>
          <div className="fsb-big">{f.num(stock.parPlateforme[code] ?? 0)} <small>{f.L('annonces actives', 'live listings')}{code === 'opla' ? f.L(' · Opla quittée le 10/10', ' · Opla left on 10 Oct') : ''}</small></div>
          <div className="fsb-sec"><h4>{f.L('Les plus anciennes', 'Oldest first')}<span>{f.L('âge dans FillSell', 'age in FillSell')}</span></h4>
            <div className="fsb-list">{stock.enLigneListe(code).map((a) => <LigneArticle key={a.id} a={a} f={f} />)}</div></div>
        </>
      );
    } else {
      icone = <span className="fsb-icobox" style={{ background: 'var(--fsb-teal-wash)', color: 'var(--fsb-teal-deep)' }}>{stock.enLigne}</span>;
      titre = f.L('Articles en ligne', 'Items online');
      corps = (
        <>
          <div><div className="fsb-big">{f.num(stock.enLigne)} <small>{f.L(`sur ${stock.total} articles en stock`, `of ${stock.total} items in stock`)}</small></div>
            <div className="fsb-stack" aria-hidden="true"><i style={{ flex: stock.enLigne, background: 'var(--fsb-teal)' }} /><i style={{ flex: stock.pasEncore, background: 'var(--fsb-sunk)' }} /></div></div>
          <div className="fsb-sec"><h4>{f.L('Par plateforme', 'By platform')}<span>{f.L('un article peut être en ligne à plusieurs endroits', 'an item can be live in several places')}</span></h4>
            <div className="fsb-pills">
              {Object.entries(stock.parPlateforme).sort((a, b) => b[1] - a[1]).map(([c, nb]) => (
                <button key={c} type="button" className="fsb-pill" onClick={() => onOuvrir({ k: 'enligne', code: c })}><Logo code={c} taille={22} /><span>{nomPlateforme(c, f)}</span><b>{nb}</b></button>
              ))}
              <button type="button" className="fsb-pill fsb-wide" onClick={() => onOuvrir({ k: 'pasencore' })}><span className="fsb-dot" aria-hidden="true" /><span>{f.L('Pas encore publiés', 'Not published yet')}</span><b>{stock.pasEncore}</b></button>
            </div></div>
          <div className="fsb-how"><b>{f.L('Comment c’est compté.', 'How it is counted.')}</b> {f.L('Exactement comme les pastilles de l’onglet Stock : une annonce publiée et pas retirée, et pour Vinted l’annonce vue sur ton dressing.', 'Exactly like the badges of the Stock tab: a listing published and not removed, and for Vinted the listing seen on your wardrobe.')}</div>
        </>
      );
    }
  } else if (ouvert.k === 'pasencore') {
    sous = f.L('aujourd’hui', 'today');
    icone = <span className="fsb-icobox" style={{ background: 'var(--fsb-sunk)' }}>{stock.pasEncore}</span>;
    titre = f.L('Pas encore publiés', 'Not published yet');
    corps = stock.pasEncoreListe.length
      ? <div className="fsb-sec"><h4>{f.L('Les plus récents', 'Most recent')}<span>{f.L(`${stock.pasEncore} articles`, `${stock.pasEncore} items`)}</span></h4><div className="fsb-list">{stock.pasEncoreListe.map((a) => <LigneArticle key={a.id} a={a} f={f} neutre />)}</div></div>
      : <div className="fsb-empty"><b>{f.L('Tout est en ligne', 'Everything is online')}</b>{f.L('Chaque article en stock est publié quelque part.', 'Every item in stock is listed somewhere.')}</div>;
    pied = <button type="button" className="fsb-cta" onClick={() => onAller(1)}>{f.L('Publier depuis le Stock', 'Publish from Stock')}<IcoChevron /></button>;
  } else if (ouvert.k === 'dormant' || ouvert.k === 'ecoulement') {
    const dort = stock.ages.slice(1).reduce((a, x) => a + x.nb, 0);
    sous = f.L('30 jours et plus dans FillSell · aujourd’hui', '30+ days in FillSell · today');
    icone = <span className="fsb-icobox" style={{ background: 'var(--fsb-amber-wash)', color: 'var(--fsb-amber-ink)' }}>{dort}</span>;
    titre = ouvert.k === 'ecoulement' ? f.L('Écoulement du stock', 'Sell-through') : f.L('Articles qui dorment', 'Sleeping items');
    corps = (
      <>
        {bloc.ecoulement && bloc.ecoulement.taux != null && (
          <div className="fsb-dhero"><div><div className="fsb-lab">{f.L(`Écoulement · ${lp.nom}`, `Sell-through · ${lp.nom}`)}</div><div className="fsb-val">{f.pct(bloc.ecoulement.taux * 100, 0)}</div></div>
            <div className="fsb-share">{f.L(`${f.num(bloc.ecoulement.vendus)} vendus`, `${f.num(bloc.ecoulement.vendus)} sold`)}<br />{f.L(`${f.num(bloc.ecoulement.stock)} encore en stock`, `${f.num(bloc.ecoulement.stock)} still in stock`)}</div></div>
        )}
        {ouvert.k === 'ecoulement' && <div className="fsb-how"><b>{f.L('Comment c’est calculé.', 'How it is calculated.')}</b> {f.L('Articles vendus sur la période ÷ (vendus + articles encore en stock aujourd’hui).', 'Items sold in the period ÷ (sold + items still in stock today).')}</div>}
        <div className="fsb-sec"><h4>{f.L('Par ancienneté', 'By age')}<span>{f.L('prix d’achat immobilisé', 'cost tied up')}</span></h4><BarresAges stock={stock} f={f} /></div>
        <div className="fsb-sec"><h4>{f.L('Les plus anciens', 'Oldest')}<span>{f.L('âge · plateformes en ligne', 'age · live platforms')}</span></h4><div className="fsb-list">{stock.plusAnciens.map((a) => <LigneArticle key={a.id} a={a} f={f} />)}</div></div>
      </>
    );
    pied = <button type="button" className="fsb-cta" onClick={() => onAller(1)}>{f.L('Ouvrir le Stock', 'Open Stock')}<IcoChevron /></button>;
  } else if (ouvert.k === 'immobilise') {
    sous = f.L('aujourd’hui', 'today');
    icone = <span className="fsb-icobox" style={{ background: 'var(--fsb-sunk)' }}>€</span>;
    titre = f.L('Stock immobilisé', 'Stock tied up');
    corps = (
      <>
        <div className="fsb-big">{f.eur(stock.immobilise)} <small>{f.L(`payés pour ${stock.avecPrix} articles encore en stock`, `paid for ${stock.avecPrix} items still in stock`)}</small></div>
        <div className="fsb-how"><b>{f.L('Comment c’est calculé.', 'How it is calculated.')}</b> {f.L(`Somme des prix d’achat des articles en stock dont le prix d’achat est connu (0 € compris). ${stock.sansPrix} articles n’ont pas de prix d’achat : ils ne sont pas comptés, jamais estimés.`, `Sum of the purchase prices of items in stock whose cost is known (€0 included). ${stock.sansPrix} items have no purchase price: they are not counted, never estimated.`)}</div>
        {stock.plusChers.length > 0 && <div className="fsb-sec"><h4>{f.L('Les plus gros montants', 'Largest amounts')}<span>{f.L('prix d’achat', 'cost')}</span></h4>
          <div className="fsb-list">{stock.plusChers.map((a) => <LigneArticle key={a.id} a={a} f={f} neutre montant={f.eur0(a.prixAchat * (a.quantite || 1))} />)}</div></div>}
      </>
    );
    pied = <button type="button" className="fsb-cta" onClick={() => onAller(1)}>{f.L('Ouvrir le Stock', 'Open Stock')}<IcoChevron /></button>;
  } else {
    const DEF = {
      encaisse: [f.L('Encaissé', 'Collected'), f.eur(I.encaisse), V && <Puce cur={I.encaisse} prev={V.encaisse} f={f} />, V && vsTxt(f.eur(V.encaisse)), f.L('Somme des prix de vente des ventes datées de la période. Toutes les ventes comptent, avec ou sans prix d’achat.', 'Sum of the sale prices of the period’s dated sales. Every sale counts, with or without a purchase price.'), 'ca', (l) => f.eur(l.encaisse)],
      profit: [f.L('Profit', 'Profit'), I.profitRetenues ? f.eur(I.profit) : '—', V && I.profitRetenues ? <Puce cur={I.profit} prev={V.profit} f={f} /> : null, V && vsTxt(f.eur(V.profit)), f.L(`Prix de vente moins prix d’achat, sur les ventes dont le prix d’achat est connu (${I.profitRetenues}). ${I.profitExclus} vente(s) sans prix d’achat ne comptent pas : rien n’est estimé.`, `Sale price minus purchase price, on the sales whose cost is known (${I.profitRetenues}). ${I.profitExclus} sale(s) without a cost do not count: nothing is estimated.`), 'profit', (l) => (l.profitRetenues ? f.eur(l.profit) : '—')],
      ventes: [f.L('Ventes', 'Sales'), f.num(I.nb), V && <Puce cur={I.nb} prev={V.nb} f={f} />, V && vsTxt(f.num(V.nb)), f.L('Nombre de ventes datées de la période.', 'Number of dated sales in the period.'), 'nb', (l) => f.num(l.nb)],
      panier: [f.L('Panier moyen', 'Avg. basket'), f.eur(I.panier), V && <Puce cur={I.panier} prev={V.panier} f={f} />, V && vsTxt(f.eur(V.panier)), f.L('Encaissé ÷ nombre de ventes.', 'Takings ÷ number of sales.'), null, (l) => f.eur(l.panier)],
      marge: [f.L('Marge', 'Margin'), f.pct(I.marge), V && I.marge != null && V.marge != null ? <Puce cur={I.marge} prev={V.marge} kind="pts" f={f} /> : null, V && V.marge != null ? vsTxt(f.pct(V.marge)) : null, f.L(`Profit ÷ prix de vente, sur les ${I.margeRetenues} ventes dont le prix d’achat est supérieur à 0 €. ${I.margeAZero} ventes à 0 € (gratuit) et ${I.margeSansPrix} sans prix d’achat n’entrent pas dans le pourcentage.`, `Profit ÷ sale price, on the ${I.margeRetenues} sales whose cost is above €0. ${I.margeAZero} free items and ${I.margeSansPrix} without a cost are left out of the percentage.`), null, (l) => f.pct(l.marge)],
      delai: [f.L('Délai de vente constaté', 'Observed time to sell'), f.jours(I.delai), V && I.delai != null && V.delai != null ? <Puce cur={I.delai} prev={V.delai} kind="jours" inverse f={f} /> : null, V && V.delai != null ? vsTxt(f.jours(V.delai)) : null, f.L(`Jours entre la première mise en ligne et la vente, mesurés sur ${I.delaiN} ventes d’articles créés dans FillSell (médiane ${f.jours(I.delaiMediane)}). Un constat sur le passé, jamais une prévision. Pour un article importé d’un dressing, la date réelle de mise en ligne n’est pas connue : il n’est pas compté.`, `Days between first listing and sale, measured on ${I.delaiN} sales of items created in FillSell (median ${f.jours(I.delaiMediane)}). An observation of the past, never a forecast. Items imported from a wardrobe have no known listing date: they are not counted.`), null, (l) => (l.delaiN ? `${f.jours(l.delai)} (${l.delaiN})` : '—')],
    }[ouvert.k];
    if (!DEF) return null;
    icone = <span className="fsb-icobox" style={{ background: 'var(--fsb-teal-wash)', color: 'var(--fsb-teal-deep)' }}><IcoOuvrir /></span>;
    titre = DEF[0];
    const serie = bloc.serie;
    corps = (
      <>
        <div className="fsb-dhero"><div><div className="fsb-val">{DEF[1]}</div><div className="fsb-row" style={{ marginTop: 8 }}>{ok && DEF[2]}{ok && DEF[3] && <span className="fsb-cmpt">{DEF[3]}</span>}</div></div></div>
        <div className="fsb-how"><b>{f.L('Comment c’est calculé.', 'How it is calculated.')}</b> {DEF[4]}</div>
        {DEF[5] && serie.pas === 'jour' && (
          <div className="fsb-sec"><h4>{f.L('Jour par jour', 'Day by day')}<span>{lp.nom}</span></h4>
            <Colonnes hauteur={tactile ? 130 : 150} bandeau={tactile} indication={f.L('Touche un jour', 'Tap a day')} labels={serie.points.map((x, i) => (i % 7 === 0 || i === serie.points.length - 1 ? String(Number(x.jour.slice(8, 10))) : ''))}
              series={[{ vals: serie.points.map((x) => x[DEF[5]]), couleur: 'var(--fsb-teal)' }]} fy={DEF[5] === 'nb' ? (v) => f.num(v) : f.eur0} epaisseurMax={14} aria={DEF[0]}
              bulle={(i) => ({ titre: jourMoyen(serie.points[i].jour, lang), lignes: [{ couleur: 'var(--fsb-teal)', boite: true, libelle: DEF[0], valeur: DEF[5] === 'nb' ? f.num(serie.points[i].nb) : f.eur(serie.points[i][DEF[5]]) }], note: DEF[5] !== 'nb' ? f.L(`${serie.points[i].nb} ventes`, `${serie.points[i].nb} sales`) : null })} /></div>
        )}
        {ouvert.k === 'delai' && bloc.delais.n > 0 && (
          <div className="fsb-sec"><h4>{f.L('Répartition', 'Distribution')}<span>{f.L(`${bloc.delais.n} ventes mesurées`, `${bloc.delais.n} sales measured`)}</span></h4><Repartition d={bloc.delais.distribution} f={f} /></div>
        )}
        <div className="fsb-sec"><h4>{f.L('Par plateforme', 'By platform')}<span>{lp.nom}</span></h4>
          <div className="fsb-plat">{bloc.plateformes.map((l) => (
            <button key={l.cle} type="button" className="fsb-prow" style={{ gridTemplateColumns: '28px minmax(0,1fr) auto 14px' }} onClick={() => onOuvrir({ k: 'plateforme', code: l.code === 'autre' ? l.cle : l.code })}>
              <Logo code={l.code} taille={26} /><span className="fsb-nm">{nomPlateforme(l.code, f, l.libelle)}</span><span className="fsb-am">{DEF[6](l)}</span><span className="fsb-chev"><IcoChevron /></span>
            </button>))}</div></div>
      </>
    );
  }
  return { icone, titre, sous, corps, pied };
}
