// ═══════════════════════════════════════════════════════════════════════════
// FRAIS DE PORT DEPOP — LE CHAMP ET LA FEUILLE « ENVOI SUIVI EN FRANCE »
// (09/10/2026 soir, Nico : « zéro friction, limpide, bien designé »)
// ═══════════════════════════════════════════════════════════════════════════
// UN champ, partout où le port se dit (Réglages, stepper, lot, question
// « Compléter » d'une annonce arrêtée) : libellé clair, « € » visible,
// clavier numérique, message simple si vide ou hors limites — et, JUSTE
// SOUS le champ, le lien qui ouvre la feuille des prix d'envoi suivi.
//
// LA FEUILLE monte toujours du bas de l'écran, au même endroit (largeur 560 px
// au plus, centrée), jamais hors de l'écran. Trois sorties évidentes : la
// croix, glisser vers le bas, toucher en dehors (+ Échap et retour Android,
// règle des couches de utils/modale.js) ; le fond est figé tant qu'elle est
// ouverte. Toucher un prix remplit le champ et la referme.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useFondFige, useEchap, useRetourAndroid } from '../utils/modale';
import { lirePortSaisi, formaterPort, messageErreurPort, portValide, enregistrerPortParDefaut } from '../utils/fraisPortDepop';
import { GRILLE_ENVOI_SUIVI, TRANSPORTEURS_SUIVI, prixAffiche } from '../utils/envoiSuiviFrance';
import './PortDepop.css';

const SEUIL_FERMETURE_PX = 90;

export function FeuilleEnvoiSuivi({ lang = 'fr', onFermer, onChoisir, valeur = null, z = 1100, theme = null }) {
  const en = lang === 'en';
  const L = en ? 'en' : 'fr';
  useFondFige(true);
  useEchap(onFermer);
  useRetourAndroid(onFermer);

  // ── Glisser vers le bas pour fermer ────────────────────────────────────
  // Depuis la poignée et l'en-tête (toujours), et depuis le corps quand il est
  // tout en haut de son défilement. Au-delà de 90 px (ou d'un geste vif), la
  // feuille se ferme ; en deçà, elle revient en place.
  const feuilleRef = useRef(null);
  const corpsRef = useRef(null);
  const geste = useRef(null);
  const [decalage, setDecalage] = useState(0);
  const [revient, setRevient] = useState(false);

  useEffect(() => {
    const el = feuilleRef.current;
    if (!el) return undefined;
    const debut = (ev) => {
      const t = ev.touches?.[0];
      if (!t) return;
      const dansCorps = corpsRef.current?.contains(ev.target);
      if (dansCorps && (corpsRef.current.scrollTop ?? 0) > 0) { geste.current = null; return; }
      geste.current = { y0: t.clientY, t0: Date.now(), dy: 0, actif: !dansCorps };
    };
    const bouge = (ev) => {
      const g = geste.current; const t = ev.touches?.[0];
      if (!g || !t) return;
      const dy = t.clientY - g.y0;
      if (!g.actif) {
        // Le corps défile normalement vers le haut ; vers le bas, tout en haut,
        // c'est la feuille qui suit le doigt.
        if (dy <= 4 || (corpsRef.current?.scrollTop ?? 0) > 0) return;
        g.actif = true;
      }
      if (ev.cancelable) ev.preventDefault();
      g.dy = Math.max(0, dy);
      setRevient(false);
      setDecalage(g.dy);
    };
    const fin = () => {
      const g = geste.current; geste.current = null;
      if (!g || !g.actif) return;
      const vitesse = g.dy / Math.max(1, Date.now() - g.t0);
      if (g.dy > SEUIL_FERMETURE_PX || (g.dy > 30 && vitesse > 0.6)) { onFermer?.(); return; }
      setRevient(true);
      setDecalage(0);
    };
    el.addEventListener('touchstart', debut, { passive: true });
    el.addEventListener('touchmove', bouge, { passive: false });
    el.addEventListener('touchend', fin, { passive: true });
    el.addEventListener('touchcancel', fin, { passive: true });
    return () => {
      el.removeEventListener('touchstart', debut);
      el.removeEventListener('touchmove', bouge);
      el.removeEventListener('touchend', fin);
      el.removeEventListener('touchcancel', fin);
    };
  }, [onFermer]);

  // La souris (ordinateur) : la poignée se tire aussi.
  const sourisBas = (ev) => {
    if (ev.pointerType !== 'mouse') return;
    const y0 = ev.clientY;
    let dy = 0;
    const mv = (e) => { dy = Math.max(0, e.clientY - y0); setRevient(false); setDecalage(dy); };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      if (dy > SEUIL_FERMETURE_PX) onFermer?.(); else { setRevient(true); setDecalage(0); }
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };

  const choisie = portValide(valeur);
  const titre = en ? 'Tracked shipping in France' : 'Envoi suivi en France';
  const [colissimo, mondial] = TRANSPORTEURS_SUIVI;

  return createPortal(
    <div className="fpd-racine" data-theme={theme ?? undefined} role="dialog" aria-modal="true" aria-label={titre} style={{ zIndex: z }}>
      <button type="button" className="fpd-voile" aria-label={en ? 'Close' : 'Fermer'} onClick={onFermer}
        style={decalage ? { opacity: Math.max(0.2, 1 - decalage / 400) } : undefined} />
      <section ref={feuilleRef} className={`fpd-feuille${revient ? ' fpd-feuille--revient' : ''}`}
        style={decalage ? { transform: `translateY(${decalage}px)` } : undefined}
        onTransitionEnd={() => setRevient(false)}>
        <div className="fpd-poignee-zone" onPointerDown={sourisBas} aria-hidden="true"><span className="fpd-poignee" /></div>
        <div className="fpd-tete" onPointerDown={sourisBas}>
          <span className="fpd-tete-vide" aria-hidden="true" />
          <h2 className="fpd-titre">{titre}</h2>
          <button type="button" className="fpd-croix" onClick={onFermer} aria-label={en ? 'Close' : 'Fermer'}>
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <div ref={corpsRef} className="fpd-corps">
          <p className="fpd-phrase">
            {en
              ? <>Depop gives <b>no shipping label</b> in France: you set your shipping price, send with a <b>tracked</b> service, then add the tracking number on Depop.</>
              : <>Depop ne fournit <b>pas d&rsquo;étiquette</b> en France : tu fixes ton prix de livraison, tu expédies en <b>envoi suivi</b>, puis tu ajoutes le numéro de suivi sur Depop.</>}
          </p>
          <p className="fpd-consigne">{en ? 'Tap a price to use it.' : 'Touche un prix pour l’utiliser.'}</p>
          <div className="fpd-grille" role="table" aria-label={titre}>
            <div className="fpd-ligne fpd-ligne--tete" role="row">
              <span className="fpd-col-t fpd-col-t--gauche" role="columnheader">{en ? 'Parcel' : 'Colis'}</span>
              <span className="fpd-col-t" role="columnheader">{colissimo.nom}<small>{colissimo.mode[L]}</small></span>
              <span className="fpd-col-t" role="columnheader">{mondial.nom}<small>{mondial.mode[L]}</small></span>
            </div>
            {GRILLE_ENVOI_SUIVI.map((r) => (
              <div key={r.cle} className="fpd-ligne" role="row">
                <span role="cell">
                  <span className="fpd-taille">{r.taille[L]}</span>
                  <span className="fpd-poids">{r.poids[L]}</span>
                </span>
                {TRANSPORTEURS_SUIVI.map((tr) => {
                  const p = r.prix[tr.cle];
                  const estChoisi = choisie != null && Math.abs(choisie - p) < 0.005;
                  return (
                    <span key={tr.cle} role="cell">
                      <button type="button" className={`fpd-prix${estChoisi ? ' fpd-prix--choisi' : ''}`}
                        aria-label={en ? `${tr.nom}, ${r.taille.en} ${r.poids.en}: ${prixAffiche(p, 'en')}` : `${tr.nom}, ${r.taille.fr} ${r.poids.fr} : ${prixAffiche(p, 'fr')}`}
                        onClick={() => onChoisir?.(p, { transporteur: tr.cle, taille: r.cle })}>
                        {prixAffiche(p, L)}
                      </button>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="fpd-sources">
            {en
              ? 'Indicative prices, tracking included, mainland France. Sources: '
              : 'Prix indicatifs, suivi inclus, France métropolitaine. Sources : '}
            <a href={colissimo.source.url} target="_blank" rel="noopener noreferrer">{colissimo.nom}</a>
            {` (${colissimo.source.validite[L]}) · `}
            <a href={mondial.source.url} target="_blank" rel="noopener noreferrer">{mondial.nom}</a>
            {` (${mondial.source.validite[L]})`}
            {en ? ', read on 9 Oct 2026.' : ', relevés le 09/10/2026.'}
          </p>
        </div>
      </section>
    </div>,
    document.body,
  );
}

/**
 * Le champ du stepper (« Confirmer ») et d'un article du lot : branché sur le
 * moteur (`m.portDepop` : saisie, manquant, defaut, poser). Sans prix par
 * défaut, une fois un prix valide saisi, un geste le garde pour la suite.
 */
export function CartePortDepop({ m, id = 'port-depop-stepper', zFeuille = 1100 }) {
  const pd = m?.portDepop;
  const userId = m?.userId ?? null;
  const [gardeLe, setGardeLe] = useState(null); // null | 'en_cours' | 'ok' | 'rate'
  if (!pd?.visee) return null;
  const en = m.lang === 'en';
  const lu = portValide(pd.saisie);
  const estLeDefaut = pd.defaut != null && lu != null && Math.abs(lu - pd.defaut) < 0.005;
  const note = estLeDefaut
    ? (en ? 'Your default price (Settings) — you can change it for this item.' : 'Ton prix par défaut (Réglages) — tu peux le changer pour cet article.')
    : null;
  const proposerDefaut = pd.defaut == null && lu != null && userId && gardeLe !== 'ok';
  const garder = async () => {
    setGardeLe('en_cours');
    const r = await enregistrerPortParDefaut(userId, lu);
    setGardeLe(r.ok ? 'ok' : 'rate');
  };
  return (
    <div className={`fsn-card${pd.manquant ? ' fsn-card--geste' : ''}`} style={{ gap: 10 }}>
      <ChampPortDepop lang={m.lang} id={id} valeur={pd.saisie} onChange={pd.poser} montrerVide={pd.manquant}
        note={note} zFeuille={zFeuille} />
      {proposerDefaut && (
        <button type="button" className="fpd-lien fpd" style={{ padding: 0 }} disabled={gardeLe === 'en_cours'} onClick={garder}>
          {gardeLe === 'rate'
            ? (en ? 'Not saved — try again' : 'Pas enregistré — réessaie')
            : (en ? `Keep ${formaterPort(lu, 'en')} € for my next Depop listings` : `Garder ${formaterPort(lu, 'fr')} € pour mes prochaines annonces Depop`)}
        </button>
      )}
      {gardeLe === 'ok' && (
        <p className="fsn-small" style={{ margin: 0 }}>{en ? 'Saved as your default price. You can change it in Settings › Shipping.' : 'Gardé comme prix par défaut. Tu peux le changer dans Réglages › Expédition.'}</p>
      )}
    </div>
  );
}

/**
 * Le champ « Frais de port Depop ».
 *   valeur        : la saisie (chaîne ou nombre), contrôlée par le parent ;
 *   onChange(s)   : la saisie brute, à chaque frappe ;
 *   onValide(n)   : le port lu (nombre) quand la saisie est valide — au départ
 *                   du champ et au choix d'un prix dans la feuille ;
 *   montrerVide   : dire « à remplir » même avant qu'on ait touché le champ ;
 *   note          : une ligne grise sous le champ (ex. « Ton prix par défaut »).
 */
export function ChampPortDepop({
  lang = 'fr', valeur, onChange, onValide = null, montrerVide = false, note = null,
  titre = null, aide = null, id = 'port-depop', zFeuille = 1100, autoFocus = false, desactive = false,
}) {
  const en = lang === 'en';
  const [touche, setTouche] = useState(false);
  const [feuille, setFeuille] = useState(false);
  const brut = valeur == null ? '' : String(valeur);
  const lu = lirePortSaisi(brut);
  const erreurAffichee = lu.erreur && (lu.erreur !== 'vide' || touche || montrerVide) ? lu.erreur : null;
  const message = messageErreurPort(erreurAffichee, lang);
  const classe = ['fpd', erreurAffichee === 'vide' ? 'fpd--a-remplir' : erreurAffichee ? 'fpd--erreur' : ''].filter(Boolean).join(' ');

  const quitter = () => {
    setTouche(true);
    if (lu.valeur != null) {
      const propre = formaterPort(lu.valeur, lang);
      if (propre !== brut) onChange?.(propre);
      onValide?.(lu.valeur);
    }
  };

  return (
    <div className={classe}>
      <label className="fpd-libelle" htmlFor={id}>{titre ?? (en ? 'Depop shipping price' : 'Frais de port Depop')}</label>
      {(aide ?? true) && (
        <p className="fpd-aide">{aide ?? (en ? 'Paid by the buyer, for a tracked parcel in France.' : 'Payés par l’acheteur, pour un envoi suivi en France.')}</p>
      )}
      <div className="fpd-boite">
        <input id={id} className="fpd-input" type="text" inputMode="decimal" autoComplete="off" enterKeyHint="done"
          placeholder={en ? 'e.g. 4.90' : 'ex. 4,90'} value={brut} disabled={desactive} autoFocus={autoFocus}
          aria-invalid={erreurAffichee ? 'true' : 'false'} aria-describedby={message ? `${id}-msg` : undefined}
          onChange={(ev) => onChange?.(ev.target.value)} onBlur={quitter}
          onKeyDown={(ev) => { if (ev.key === 'Enter') ev.currentTarget.blur(); }} />
        <span className="fpd-euro" aria-hidden="true">€</span>
      </div>
      {message && (
        <p id={`${id}-msg`} className={`fpd-message ${erreurAffichee === 'vide' ? 'fpd-message--geste' : 'fpd-message--erreur'}`} role="status">{message}</p>
      )}
      {!message && note && <p className="fpd-note">{note}</p>}
      <button type="button" className="fpd-lien" onClick={() => setFeuille(true)} disabled={desactive}>
        {en ? 'See tracked shipping prices in France' : 'Voir les prix d’envoi suivi en France'}
      </button>
      {feuille && (
        <FeuilleEnvoiSuivi lang={lang} valeur={lu.valeur} z={zFeuille}
          onFermer={() => setFeuille(false)}
          onChoisir={(p) => {
            const s = formaterPort(p, lang);
            setTouche(true);
            onChange?.(s);
            onValide?.(portValide(p));
            setFeuille(false);
          }} />
      )}
    </div>
  );
}
