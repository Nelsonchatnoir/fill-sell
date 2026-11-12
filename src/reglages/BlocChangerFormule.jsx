// C4 — « Voir les autres formules » et descendre à la fin de la période (09/11/2026 nuit, point C4 de Nico).
// ⛔ FERMÉ tant que coin_config.descente_formule_ouverte ≠ 1, web seulement (règles : reglages/formuleDescente.js).
// Lit l'état chez changer-formule (Stripe = source de vérité) ; programme ou annule la descente. Les droits ne bougent
// jamais d'ici : ils suivent ce que Stripe facture, à la fin de la période (stripe-webhook).
import { useEffect, useState } from 'react';
import { Layers, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { interrupteurOuvert } from '../config/interrupteurs';
import { R } from './theme';
import { Groupe, Carte, Ligne, Bouton, Note } from './ReglagesUI';
import { NOMS_FORMULE, blocDescenteVisible, dateChangement, messageErreur, ordreProposees, prixFormule, textesDescente } from './formuleDescente';

async function appeler(action, vers = null) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${supabaseUrl}/functions/v1/changer-formule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`, apikey: supabaseAnonKey },
    body: JSON.stringify(vers ? { action, vers } : { action }),
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, json };
}

export default function BlocChangerFormule({ c, clientStripe, enEssai = false }) {
  const visible = blocDescenteVisible({
    ouvert: interrupteurOuvert('descente_formule_ouverte'), natif: c.natif, isPremium: c.isPremium,
    clientStripe, resilie: c.resiliation?.resilie, enEssai,   // (12/11, 4d) jamais pendant un essai
  });
  const lang = c.lang === 'en' ? 'en' : 'fr';
  const T = textesDescente(lang);
  const [etat, setEtat] = useState({ lu: false, echec: false, d: null });
  const [deplie, setDeplie] = useState(false);
  const [choix, setChoix] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    if (!visible) return undefined;
    let mort = false;
    appeler('lire')
      .then(({ ok, json }) => { if (!mort) setEtat({ lu: true, echec: !ok || !json, d: ok ? json : null }); })
      .catch(() => { if (!mort) setEtat({ lu: true, echec: true, d: null }); });
    return () => { mort = true; };
  }, [visible]);

  if (!visible || !etat.lu) return null;
  if (etat.echec) return <Note>{T.lectureEchec}</Note>;
  const d = etat.d;
  // Rien à proposer : boutique, Premium (rien plus bas), arrêt déjà prévu (la résiliation prime).
  if (!d?.disponible || d.arret_prevu || (!d.prevue && !(d.possibles ?? []).length)) return null;
  const actuelle = NOMS_FORMULE[d.actuelle] ?? '';
  const date = dateChangement(d.prevue?.le ?? d.fin_periode, lang);

  const agir = async (action, vers = null) => {
    setEnCours(true);
    setErreur(null);
    try {
      const { ok, json } = await appeler(action, vers);
      if (!ok || !json || json.error) { setErreur(messageErreur(json?.error, lang)); return; }
      setEtat({ lu: true, echec: false, d: json });
      setChoix(null);
      setDeplie(false);
    } catch {
      setErreur(messageErreur(null, lang));
    } finally {
      setEnCours(false);
    }
  };

  if (d.prevue) {
    const nom = NOMS_FORMULE[d.prevue.formule] ?? '';
    return (
      <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div data-formule-prevue={d.prevue.formule}>
          <div style={{ fontSize: 15, fontWeight: 700, color: R.ink, lineHeight: 1.4 }}>{T.prevueTitre(nom, date)}</div>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, lineHeight: 1.5, color: R.texteSecondaire }}>{T.prevueTexte(actuelle, date)}</p>
        </div>
        <Bouton ton="creux" onClick={() => agir('annuler')} enCours={enCours} style={{ alignSelf: 'flex-start', minHeight: 46 }}>{T.garder(actuelle)}</Bouton>
        {erreur && <p role="alert" style={{ margin: 0, fontSize: 13, color: R.negatifTexte, lineHeight: 1.45 }}>{erreur}</p>}
      </Carte>
    );
  }

  return (
    <Groupe>
      <Carte>
        {/* Un pli, pas une page : flèche vers le bas / le haut, jamais « › ». */}
        <Ligne icone={Layers} libelle={deplie ? T.masquer : T.voirAutres} chevron={false}
          apres={deplie ? <ChevronUp size={18} color={R.chevron} strokeWidth={2} style={{ flexShrink: 0 }} aria-hidden="true" /> : <ChevronDown size={18} color={R.chevron} strokeWidth={2} style={{ flexShrink: 0 }} aria-hidden="true" />}
          onClick={() => { setDeplie((v) => !v); setChoix(null); setErreur(null); }} />
        {deplie && (
          <div data-autres-formules="1" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 16px 16px' }}>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: R.texteSecondaire }}>{T.intro(actuelle, date)}</p>
            {ordreProposees(d.possibles).map((f) => {
              const nom = NOMS_FORMULE[f] ?? f;
              const prix = prixFormule(f, lang);
              if (choix === f) {
                return (
                  <div key={f} data-confirmer-formule={f} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 14, border: `1px solid ${R.border}`, background: R.menthe }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: R.ink }}>{T.confirmerTitre(nom, date)}</div>
                    <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: R.ink }}>{T.confirmerTexte(actuelle, nom, prix, date)}</p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Bouton ton="plein" onClick={() => agir('programmer', f)} enCours={enCours}>{enCours ? '…' : T.confirmer}</Bouton>
                      <Bouton ton="creux" onClick={() => setChoix(null)} disabled={enCours}>{T.annuler}</Bouton>
                    </div>
                  </div>
                );
              }
              return (
                <div key={f} data-autre-formule={f} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px', borderRadius: 14, border: `1px solid ${R.border}` }}>
                  <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: R.ink }}>{nom}</div>
                    <div style={{ fontSize: 13, color: R.texteSecondaire, whiteSpace: 'nowrap' }}>{T.prixMois(prix)}</div>
                  </div>
                  <Bouton ton="creux" onClick={() => { setChoix(f); setErreur(null); }} style={{ flex: '0 1 auto' }}>{T.passerA(nom, date)}</Bouton>
                </div>
              );
            })}
            {erreur && <p role="alert" style={{ margin: 0, fontSize: 13, color: R.negatifTexte, lineHeight: 1.45 }}>{erreur}</p>}
          </div>
        )}
      </Carte>
    </Groupe>
  );
}
