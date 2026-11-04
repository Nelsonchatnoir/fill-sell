// ═══════════════════════════════════════════════════════════════════════════
// « CRÉER MES CONDITIONS eBAY » (04/11, point 4 — décision de Nico, remplace celle du 12/10)
// ═══════════════════════════════════════════════════════════════════════════
// Un vendeur eBay relié sans conditions de vente (livraison, retours, paiement) ne peut pas publier par l'API
// (benjamin.ployer : 277 annonces eBay, 0 condition sur eBay France, ses publications arrêtées « compte pas prêt »).
// UN geste, ici : FillSell lit les réglages de SES annonces eBay (transporteurs et prix, délai, retours, code postal),
// les montre, et ne crée rien sans son clic. Sans annonce lisible : Colissimo, envoi sous 2 jours, retours 30 jours
// à la charge de l'acheteur, et un prix de livraison VIDE à remplir — jamais inventé.
// Serveur : ebay-account, proposer_conditions (lecture seule) puis creer_conditions (au clic). L'adresse d'expédition
// manquante est posée par platform_settings_fusionner (utils/reglagesPlateformes.js), la seule voie.
import { useEffect, useState } from 'react';
import Feuille from './Feuille';
import { S } from './jetons';
import { supabase } from '../lib/supabase';
import { fusionnerReglages } from '../utils/reglagesPlateformes';

const MOTS = {
  fr: {
    titre: 'Créer mes conditions eBay', lecture: 'Lecture de tes annonces eBay…',
    intro: "Ton compte eBay est bien relié, mais il n'a pas encore de conditions de vente (livraison, retours, paiement) : eBay les exige pour publier depuis FillSell. On peut les créer pour toi maintenant, avec les réglages ci-dessous — tu pourras les changer quand tu veux sur eBay. Rien n'a été envoyé à eBay pour l'instant.",
    depuisAnnonces: (n) => `Réglages lus sur ${n} de tes annonces eBay.`,
    defauts: "Aucune annonce eBay lisible : réglages ordinaires proposés — indique le prix de la livraison.",
    livraison: 'Livraison', delai: 'Expédié sous', jours: (n) => `${n} jour${n > 1 ? 's' : ''}`, prix: 'Prix (€)',
    retours: 'Retours', retoursOui: (j) => `Acceptés sous ${j} jours, frais de retour payés par l'acheteur`, retoursNon: 'Non acceptés', // estimation-ok: politique eBay (réglage), pas une attente
    paiement: 'Paiement', paiementTexte: 'Géré par eBay (paiement immédiat)',
    adresse: "Adresse d'expédition", cp: 'Code postal', ville: 'Ville',
    creer: 'Créer mes conditions eBay', enCours: 'Création chez eBay…', annuler: 'Annuler',
    fait: "C'est fait : tes conditions de vente eBay sont créées, tes annonces eBay partent toutes seules.",
    prixManquant: 'Indique le prix de chaque mode de livraison (0 pour la livraison gratuite).',
    adresseManquante: "Indique le code postal (5 chiffres) et la ville d'où tu expédies.",
    reseau: "eBay n'a pas répondu : réessaie dans un instant.", aucunService: "eBay ne propose aucun mode de livraison lisible pour l'instant : réessaie plus tard.",
  },
  en: {
    titre: 'Create my eBay policies', lecture: 'Reading your eBay listings…',
    intro: "Your eBay account is linked, but it has no selling policies yet (shipping, returns, payment): eBay requires them to publish from FillSell. We can create them for you now, with the settings below — you can change them on eBay anytime. Nothing has been sent to eBay yet.",
    depuisAnnonces: (n) => `Settings read from ${n} of your eBay listings.`,
    defauts: 'No readable eBay listing: usual settings suggested — enter the shipping price.',
    livraison: 'Shipping', delai: 'Dispatched within', jours: (n) => `${n} day${n > 1 ? 's' : ''}`, prix: 'Price (€)',
    retours: 'Returns', retoursOui: (j) => `Accepted within ${j} days, return shipping paid by the buyer`, retoursNon: 'Not accepted', // estimation-ok: politique eBay (réglage), pas une attente
    paiement: 'Payment', paiementTexte: 'Managed by eBay (immediate payment)',
    adresse: 'Ship-from address', cp: 'Postcode', ville: 'Town',
    creer: 'Create my eBay policies', enCours: 'Creating on eBay…', annuler: 'Cancel',
    fait: 'Done: your eBay selling policies are created, your eBay listings go out on their own.',
    prixManquant: 'Enter the price of each shipping method (0 for free shipping).',
    adresseManquante: 'Enter the postcode (5 digits) and the town you ship from.',
    reseau: "eBay didn't answer: try again in a moment.", aucunService: 'eBay offers no readable shipping method right now: try again later.',
  },
};

export function FeuilleConditionsEbay({ lang = 'fr', onFermer, onFait }) {
  const M = MOTS[lang === 'en' ? 'en' : 'fr'];
  const [prop, setProp] = useState(null);
  const [lieuOk, setLieuOk] = useState(true);
  const [services, setServices] = useState([]);
  const [delai, setDelai] = useState(2);
  const [retours, setRetours] = useState({ acceptes: true, jours: 30 });
  const [adresse, setAdresse] = useState({ code_postal: '', ville: '' });
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState(null);
  const [fini, setFini] = useState(false);

  useEffect(() => {
    let vivant = true;
    supabase.functions.invoke('ebay-account', { body: { action: 'proposer_conditions' } }).then(({ data }) => {
      if (!vivant) return;
      if (!data?.proposition) { setMessage({ ok: false, texte: data?.error || M.reseau }); return; }
      const p = data.proposition;
      setProp(p);
      setServices((p.livraison?.services ?? []).map((s) => ({ ...s, frais: s.frais == null ? '' : String(s.frais).replace('.', lang === 'en' ? '.' : ',') })));
      setDelai(p.livraison?.delai_jours ?? 2);
      setRetours(p.retours ?? { acceptes: true, jours: 30 });
      setAdresse(p.adresse ?? { code_postal: '', ville: '' });
      const lieu = (data.checklist?.lignes ?? []).find((l) => l.cle === 'lieu_expedition');
      setLieuOk(lieu ? lieu.etat === 'ok' : true);
    }, () => { if (vivant) setMessage({ ok: false, texte: M.reseau }); });
    return () => { vivant = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const creer = async () => {
    if (!services.length) { setMessage({ ok: false, texte: M.aucunService }); return; }
    if (services.some((s) => String(s.frais).trim() === '' || !Number.isFinite(Number(String(s.frais).replace(',', '.'))))) {
      setMessage({ ok: false, texte: M.prixManquant }); return;
    }
    if (!lieuOk && (!/^\d{5}$/.test(String(adresse.code_postal).trim()) || !String(adresse.ville).trim())) {
      setMessage({ ok: false, texte: M.adresseManquante }); return;
    }
    setEnCours(true); setMessage(null);
    try {
      if (!lieuOk) {
        const { error } = await fusionnerReglages(['ebay', 'adresse_expedition'], { code_postal: String(adresse.code_postal).trim(), ville: String(adresse.ville).trim() });
        if (error) { setMessage({ ok: false, texte: M.reseau }); return; }
      }
      const { data, error } = await supabase.functions.invoke('ebay-account', { body: {
        action: 'creer_conditions',
        livraison: { delai_jours: delai, services: services.map((s) => ({ code: s.code, frais_eur: String(s.frais).replace(',', '.') })) },
        retours,
      } });
      if (error && !data) { setMessage({ ok: false, texte: M.reseau }); return; }
      if (!data?.ok) { setMessage({ ok: false, texte: data?.error || M.reseau }); return; }
      setFini(true);
      setMessage({ ok: true, texte: M.fait });
      onFait?.();
    } catch {
      setMessage({ ok: false, texte: M.reseau });
    } finally {
      setEnCours(false);
    }
  };

  const champ = { boxSizing: 'border-box', padding: '10px 12px', borderRadius: 12, border: `1px solid ${S.border}`, background: '#FFFFFF', fontSize: 16, fontFamily: 'inherit', color: S.ink, outline: 'none' };
  const titreSection = { fontSize: 14, fontWeight: 700, color: S.ink, marginTop: 4 };
  const texte = { fontSize: 13.5, color: S.ink2, lineHeight: 1.45 };
  const pied = (
    <>
      <button type="button" className="sk-btn sk-presse" onClick={onFermer} disabled={enCours}
        style={{ flex: 1, height: 48, borderRadius: 14, border: `1px solid ${S.border}`, background: '#FFFFFF', fontSize: 15, fontWeight: 700, color: S.ink, fontFamily: 'inherit' }}>
        {M.annuler}
      </button>
      {!fini ? (
        <button type="button" className="sk-btn sk-presse" onClick={creer} disabled={enCours || !prop}
          style={{ flex: 2, height: 48, borderRadius: 14, border: 'none', background: S.tealDeep, fontSize: 15, fontWeight: 700, color: '#FFFFFF', fontFamily: 'inherit', opacity: enCours || !prop ? 0.7 : 1 }}>
          {enCours ? M.enCours : M.creer}
        </button>
      ) : null}
    </>
  );

  return (
    <Feuille lang={lang} titre={M.titre} onFermer={onFermer} pied={pied}>
      <div style={texte}>{M.intro}</div>
      {!prop && !message ? <div style={texte}>{M.lecture}</div> : null}
      {prop ? (
        <>
          <div style={{ ...texte, fontSize: 12.5 }}>{prop.source === 'annonces' ? M.depuisAnnonces(prop.annonces_lues) : M.defauts}</div>
          <div style={titreSection}>{M.livraison}</div>
          {services.map((s, i) => (
            <label key={s.code} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1, fontSize: 14, color: S.ink }}>{s.libelle}</span>
              <input aria-label={`${M.prix} ${s.libelle}`} value={s.frais} inputMode="decimal" placeholder={M.prix}
                onChange={(e) => { const v = e.target.value.replace(/[^\d.,]/g, '').slice(0, 7); setServices((l) => l.map((x, k) => (k === i ? { ...x, frais: v } : x))); }}
                style={{ ...champ, width: 110 }} />
            </label>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1, fontSize: 14, color: S.ink }}>{M.delai}</span>
            <select value={delai} onChange={(e) => setDelai(Number(e.target.value))} style={{ ...champ, width: 110 }}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{M.jours(n)}</option>)}
            </select>
          </label>
          <div style={titreSection}>{M.retours}</div>
          <div style={texte}>{retours.acceptes ? M.retoursOui(retours.jours ?? 30) : M.retoursNon}</div>
          <div style={titreSection}>{M.paiement}</div>
          <div style={texte}>{M.paiementTexte}</div>
          {!lieuOk ? (
            <>
              <div style={titreSection}>{M.adresse}</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <input aria-label={M.cp} placeholder={M.cp} value={adresse.code_postal} inputMode="numeric" maxLength={5}
                  onChange={(e) => setAdresse((a) => ({ ...a, code_postal: e.target.value.replace(/\D/g, '').slice(0, 5) }))} style={{ ...champ, width: 110 }} />
                <input aria-label={M.ville} placeholder={M.ville} value={adresse.ville}
                  onChange={(e) => setAdresse((a) => ({ ...a, ville: e.target.value.slice(0, 60) }))} style={{ ...champ, flex: 1, minWidth: 0 }} />
              </div>
            </>
          ) : null}
        </>
      ) : null}
      {message ? (
        <div role={message.ok ? 'status' : 'alert'} style={{ padding: '10px 12px', borderRadius: 12, fontSize: 13.5, fontWeight: 600, lineHeight: 1.45,
          background: message.ok ? S.menthe : S.rougeFond, border: `1px solid ${message.ok ? S.mentheBord : S.rougeBord}`, color: message.ok ? S.tealDeep : S.rouge }}>
          {message.texte}
        </div>
      ) : null}
    </Feuille>
  );
}

/** Le bouton d'une publication eBay arrêtée sur « conditions de vente à créer », et sa feuille. */
export default function BoutonConditionsEbay({ lang = 'fr', libelle, aide, style }) {
  const [ouverte, setOuverte] = useState(false);
  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" onClick={() => setOuverte(true)} style={style}>{libelle}</button>
      {aide ? <div style={{ fontSize: 11, lineHeight: 1.35, color: S.ink2, marginTop: 4, textAlign: 'center' }}>{aide}</div> : null}
      {ouverte ? <FeuilleConditionsEbay lang={lang} onFermer={() => setOuverte(false)} /> : null}
    </div>
  );
}
