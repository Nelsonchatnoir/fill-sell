// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES › EXPÉDITION › FRAIS DE PORT DEPOP (09/10/2026 soir, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Un prix saisi UNE fois, appliqué à toutes les annonces Depop : il
// pré-remplit le stepper et le lot, et get-pending-jobs le pose sur toute
// annonce Depop qui part sans port (republication, annonces importées) —
// jamais par-dessus un port déjà dit. Écriture par platform_settings_fusionner
// SEULEMENT (utils/fraisPortDepop.js) : les autres réglages ne bougent pas.
import { useEffect, useState } from 'react';
import { usePortDepopParDefaut, lirePortSaisi, formaterPort } from '../utils/fraisPortDepop';
import { ChampPortDepop } from '../components/PortDepop';
import { Groupe, Carte, Bouton, Note } from './ReglagesUI';

export default function SousPagePortDepop({ c, T }) {
  const en = c.lang === 'en';
  const port = usePortDepopParDefaut(c.user?.id);
  const [saisie, setSaisie] = useState(null); // null = la valeur gardée
  const [enCours, setEnCours] = useState(false);
  useEffect(() => { setSaisie(null); }, [port.valeur]);
  const affiche = saisie ?? (port.valeur != null ? formaterPort(port.valeur, c.lang) : '');
  const lu = lirePortSaisi(affiche);
  const change = saisie != null && (lu.valeur == null ? port.valeur != null || saisie.trim() !== '' : port.valeur == null || Math.abs(lu.valeur - port.valeur) >= 0.005);

  const enregistrer = async (v) => {
    setEnCours(true);
    const r = await port.enregistrer(v);
    setEnCours(false);
    c.toast(r.ok ? (v == null ? T.portDepopRetire : T.portDepopEnregistre) : T.erreurSauvegarde);
  };
  // (21/11/2026, lot du 21/11, point 8 — demande de Sébastien64310) L'envoi à l'INTERNATIONAL, facultatif : vide = France
  // seule (comme avant). Posé sur chaque annonce Depop qui part (get-pending-jobs), jamais une question.
  const [saisieInt, setSaisieInt] = useState(null);
  const [enCoursInt, setEnCoursInt] = useState(false);
  const afficheInt = saisieInt ?? (port.international != null ? formaterPort(port.international, c.lang) : '');
  const luInt = lirePortSaisi(afficheInt);
  const changeInt = saisieInt != null && (luInt.valeur == null ? port.international != null || saisieInt.trim() !== '' : port.international == null || Math.abs(luInt.valeur - port.international) >= 0.005);
  const enregistrerInt = async (v) => {
    setEnCoursInt(true);
    const r = await port.enregistrerInternational(v);
    setEnCoursInt(false);
    if (r.ok) setSaisieInt(null);
    c.toast(r.ok ? (v == null ? (en ? 'International shipping removed' : 'Envoi à l’international retiré') : (en ? '✅ International shipping price saved!' : '✅ Frais de port à l’international enregistrés !')) : T.erreurSauvegarde);
  };

  return (
    <Groupe intitule="Depop">
      <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ChampPortDepop lang={c.lang} id="port-depop-reglages" valeur={affiche}
          titre={en ? 'Default Depop shipping price' : 'Frais de port Depop par défaut'}
          aide={en
            ? 'Paid by the buyer, for a tracked parcel in France. Applied to all your Depop listings — you can still change it item by item.'
            : 'Payés par l’acheteur, pour un envoi suivi en France. Appliqué à toutes tes annonces Depop — tu peux toujours le changer article par article.'}
          montrerVide={port.lue && port.valeur == null && saisie == null}
          zFeuille={1100}
          onChange={(v) => setSaisie(v)} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Bouton onClick={() => enregistrer(lu.valeur)} enCours={enCours} disabled={lu.valeur == null || !change}>
            {en ? 'Save' : 'Enregistrer'}
          </Bouton>
          {port.valeur != null && (
            <Bouton ton="creux" onClick={() => enregistrer(null)} enCours={enCours}>
              {en ? 'Remove the default price' : 'Retirer le prix par défaut'}
            </Bouton>
          )}
        </div>
      </Carte>
      <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ChampPortDepop lang={c.lang} id="port-depop-international" valeur={afficheInt} facultatif
          titre={en ? 'International shipping (optional)' : 'Envoi à l’international (facultatif)'}
          aide={en
            ? 'Paid by a buyer outside France. Leave empty to ship in France only. Applied to all your Depop listings.'
            : 'Payés par un acheteur hors de France. Laisse vide pour n’envoyer qu’en France. Appliqué à toutes tes annonces Depop.'}
          zFeuille={1100}
          onChange={(v) => setSaisieInt(v)} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Bouton onClick={() => enregistrerInt(luInt.valeur)} enCours={enCoursInt} disabled={luInt.valeur == null || !changeInt}>
            {en ? 'Save' : 'Enregistrer'}
          </Bouton>
          {port.international != null && (
            <Bouton ton="creux" onClick={() => enregistrerInt(null)} enCours={enCoursInt}>
              {en ? 'Ship in France only' : 'N’envoyer qu’en France'}
            </Bouton>
          )}
        </div>
      </Carte>
      <Note>
        {en
          ? 'Depop gives no shipping label in France: you ship with a tracked service and add the tracking number on Depop. Without a default price, it is asked before each listing goes out.'
          : 'Depop ne fournit pas d’étiquette en France : tu expédies en envoi suivi et tu ajoutes le numéro de suivi sur Depop. Sans prix par défaut, il est demandé avant chaque envoi.'}
      </Note>
    </Groupe>
  );
}
