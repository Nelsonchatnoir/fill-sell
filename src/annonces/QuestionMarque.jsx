// ── LA QUESTION « MARQUE » QUAND LA PLATEFORME NE CONNAÎT PAS LA MARQUE ─────
// (03/10 nuit, Nico — clôture « marque »)
// vinted.fr ne permet plus de créer une marque (relevé du 03/10) : une marque
// absente de son catalogue arrête la publication AVANT tout dépôt (extension
// 0.6.93+), et la personne choisit. Cette question :
//   · dit POURQUOI, en une phrase ;
//   · propose « Sans marque » en un geste ;
//   · propose une RECHERCHE dans le catalogue de la plateforme : les marques
//     proches relevées par l'extension au moment de l'arrêt (filtrées au fil
//     de la frappe), et — sur l'ordinateur où l'extension 0.6.94+ tourne —
//     le moteur de recherche du menu Marque de Vinted lui-même ;
//   · ne grise jamais un bouton sans dire pourquoi : il y a TOUJOURS une issue
//     (« Sans marque », une marque de la liste, ou le nom tapé, cherché tel
//     quel au prochain passage).
// Jamais une marque posée à la place de la personne.
import { useEffect, useMemo, useState } from 'react';
import { ecouterPresenceExtension, versionAuMoins } from '../utils/vintedSync';
import { SANS_MARQUE_RE, comparable, VERSION_RECHERCHE_MARQUE, marqueDemandee, suggestionsProches } from '../utils/questionMarque';

export default function QuestionMarque({ job, f, lang = 'fr', saving = false, onChoisir }) {
  const fr = lang !== 'en';
  const plateforme = job?.platform === 'vinted' ? 'Vinted' : (job?.platform ?? '');
  const demandee = marqueDemandee(job, f);
  const relevees = useMemo(() => [...new Set((f?.allowed_values ?? []).map(String)
    .filter((v) => v.trim() && !SANS_MARQUE_RE.test(v)))], [f]);
  const [q, setQ] = useState('');
  const [versionExt, setVersionExt] = useState(null);
  const [recherche, setRecherche] = useState({ etat: 'repos', q: '', marques: [] });
  useEffect(() => ecouterPresenceExtension((v) => setVersionExt(v)), []);
  const rechercheEnDirect = job?.platform === 'vinted' && versionAuMoins(versionExt, VERSION_RECHERCHE_MARQUE);

  useEffect(() => {
    const onMessage = (e) => {
      if (e.source !== window || !e.data?.__fillsellMarques) return;
      const r = e.data.__fillsellMarques;
      setRecherche((cur) => (cur.q !== r.q ? cur : r.success
        ? { etat: 'fait', q: r.q, marques: (r.marques ?? []).map((m) => m.titre).filter(Boolean) }
        : { etat: 'echec', q: r.q, marques: [] }));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const terme = q.trim();
  // (04/10, Louis) Sans saisie, seules les marques qui RESSEMBLENT à la
  // marque demandée sont proposées (« U Collection », « Z Kids » n'avaient
  // rien à voir) ; la saisie de la personne garde sa recherche libre.
  const proches = useMemo(() => suggestionsProches(demandee, relevees), [demandee, relevees]);
  const filtrees = terme ? relevees.filter((v) => comparable(v).includes(comparable(terme))) : proches;
  const enDirect = recherche.etat === 'fait' && recherche.q === terme ? recherche.marques : [];
  const liste = [...new Set([...enDirect, ...filtrees])].slice(0, 30);
  const exacte = terme && liste.some((v) => comparable(v) === comparable(terme));

  const chercher = () => {
    if (!terme || terme.length < 2) return;
    setRecherche({ etat: 'cours', q: terme, marques: [] });
    try { window.postMessage({ __fillsellCmd: 'CHERCHER_MARQUE', q: terme }, window.location.origin); }
    catch { setRecherche({ etat: 'echec', q: terme, marques: [] }); }
  };

  const ligne = (v, principal = false) => (
    <button key={v} type="button" disabled={saving} onClick={() => onChoisir(v)}
      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 12px', marginBottom: 6,
        borderRadius: 12, border: `1px solid ${principal ? '#1B6E62' : '#DCE3E0'}`,
        background: principal ? '#1B6E62' : '#fff', color: principal ? '#fff' : '#1F2D2A',
        fontSize: 14, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
      {v}
    </button>
  );

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#1F2D2A', marginBottom: 4 }}>
        {fr ? 'Marque' : 'Brand'}
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: '#6B7A75', marginBottom: 12 }}>
        {fr
          ? `${plateforme} ne connaît pas la marque${demandee ? ` « ${demandee} »` : ''} et ne permet plus d'en créer une. Cherche-la dans la liste de ${plateforme} (elle y est peut-être sous un autre nom), ou publie en « Sans marque ». Rien n'a été envoyé à ${plateforme}.`
          : `${plateforme} doesn't know the brand${demandee ? ` “${demandee}”` : ''} and no longer lets you create one. Look for it in ${plateforme}'s list (it may have another name), or publish as “No brand”. Nothing was sent to ${plateforme}.`}
      </div>
      {ligne('Sans marque', true)}
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8A9893', margin: '12px 0 6px' }}>
        {fr ? `Chercher dans la liste de ${plateforme}` : `Search ${plateforme}'s list`}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} disabled={saving}
          onKeyDown={(e) => { if (e.key === 'Enter' && rechercheEnDirect) chercher(); }}
          placeholder={fr ? 'Nom de la marque' : 'Brand name'}
          style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 12, border: '1px solid #DCE3E0', fontSize: 15, fontFamily: 'inherit' }} />
        {rechercheEnDirect && (
          <button type="button" onClick={chercher} disabled={saving || terme.length < 2 || recherche.etat === 'cours'}
            title={terme.length < 2 ? (fr ? 'Tape au moins 2 lettres' : 'Type at least 2 letters') : ''}
            style={{ padding: '0 12px', borderRadius: 12, border: '1px solid #1B6E62', background: '#fff', color: '#1B6E62', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            {recherche.etat === 'cours' ? '…' : (fr ? 'Chercher' : 'Search')}
          </button>
        )}
      </div>
      {rechercheEnDirect && terme.length > 0 && terme.length < 2 && (
        <div style={{ fontSize: 12, color: '#8A9893', marginBottom: 6 }}>{fr ? 'Tape au moins 2 lettres pour chercher.' : 'Type at least 2 letters to search.'}</div>
      )}
      {recherche.etat === 'echec' && recherche.q === terme && (
        <div style={{ fontSize: 12, color: '#8A6100', marginBottom: 6 }}>
          {fr ? `${plateforme} n'a pas répondu à la recherche. Choisis dans la liste ci-dessous, ou « Sans marque ».` : `${plateforme} didn't answer. Pick from the list below, or “No brand”.`}
        </div>
      )}
      {!terme && demandee && !proches.length && (
        <div style={{ fontSize: 12, color: '#6B7A75', marginBottom: 6 }}>
          {fr ? `Aucune marque proche de « ${demandee} » dans ce que ${plateforme} a proposé : cherche-la par son nom, ou choisis « Sans marque ».` : `No brand close to “${demandee}” in what ${plateforme} offered: search it by name, or pick “No brand”.`}
        </div>
      )}
      <div style={{ maxHeight: 240, overflowY: 'auto' }}>
        {liste.map((v) => ligne(v))}
      </div>
      {recherche.etat === 'fait' && recherche.q === terme && !enDirect.length && (
        <div style={{ fontSize: 12, color: '#6B7A75', marginBottom: 6 }}>
          {fr ? `Aucune marque « ${terme} » chez ${plateforme} : choisis « Sans marque » ou un autre nom.` : `No “${terme}” brand on ${plateforme}: pick “No brand” or another name.`}
        </div>
      )}
      {terme.length >= 2 && !exacte && (
        <button type="button" disabled={saving} onClick={() => onChoisir(terme)}
          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', marginTop: 4, borderRadius: 12, border: '1px dashed #B9C4C0', background: '#F7F9F8', color: '#1F2D2A', fontSize: 13, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
          {fr
            ? `Essayer « ${terme} » tel quel — on le cherche dans la liste de ${plateforme} au prochain passage ; s'il n'y est pas, cette question revient.`
            : `Try “${terme}” as is — we look it up in ${plateforme}'s list on the next attempt; if it isn't there, this question comes back.`}
        </button>
      )}
    </div>
  );
}
