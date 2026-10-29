// ═══════════════════════════════════════════════════════════════════════════
// LA LIGNE « BORDEREAUX » DE L'ONGLET VENTES (29/10/2026, lot C partie 2)
// ═══════════════════════════════════════════════════════════════════════════
// Nico : « Dans les ventes, les bordereaux s'intègrent discrètement et ne s'empilent plus. » Avant, l'onglet Ventes
// montait la section « À expédier » entière (une carte par commande : 32 chez recrutementgroupezk704, 17 chez Ornella
// le 29/10). Désormais UNE ligne compacte et cliquable — « 3 bordereaux à imprimer », puis « 2 commandes à expédier ·
// 4 colis en route » — qui ouvre la page « À expédier » (EspaceMessagerie, onglet expedier : les mêmes cartes, le même
// design, rien n'y change). Rien d'affiché quand il n'y a rien.
// Ce qui fait foi : la base (plateforme_commandes, écrite par l'extension d'après Vinted) — une commande ne quitte
// « à expédier » que sur preuve lue chez la plateforme (vue.js, commandesEnRoute / resumeBordereaux). Le réglage
// « Bordereau automatique » coupé : jamais « en préparation ». Lecture : UNE à l'ouverture (jamais de setInterval) ;
// les lectures sont bornées (60 + 60 + 60 + 20 lignes, comme la section).
import { useEffect, useState } from 'react';
import { Package, ChevronRight } from 'lucide-react';
import { UI } from '../components/ui';
import { commandesAExpedier, commandesEnRoute, resumeBordereaux } from './vue';
import { useFormatBordereau } from '../utils/formatBordereau';

const COLS = 'id,platform,etat,bordereau,vendue_le,maj_le';

export default function LigneBordereaux({ supabase, lang = 'fr', userId = null, onOuvrir }) {
  const fr = lang !== 'en';
  const [resume, setResume] = useState(null);
  const { auto } = useFormatBordereau(userId) ?? {};

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const maintenant = new Date().toISOString();
        const [c, d, k, r] = await Promise.all([
          supabase.from('plateforme_commandes').select(COLS).in('etat', ['a_confirmer', 'a_expedier', 'inconnu']).order('vendue_le', { ascending: true }).limit(60),
          supabase.from('bordereaux_demandes').select('id,commande_id,action,statut,essais_fichier,cree_le').order('cree_le', { ascending: false }).limit(60),
          supabase.from('bordereaux_copies').select('id,commande_id,expire_le').is('efface_le', null).gt('expire_le', maintenant).order('cree_le', { ascending: false }).limit(60),
          supabase.from('plateforme_commandes').select(COLS).in('etat', ['expediee', 'livree']).order('maj_le', { ascending: false }).limit(20),
        ]);
        if (!vivant || c.error) return;
        const dm = {};
        for (const x of (d.error ? [] : d.data ?? [])) {
          const deja = dm[x.commande_id];
          if (!deja || (x.action === 'generer' && deja.action !== 'generer')) dm[x.commande_id] = x;
        }
        const cp = {};
        for (const x of (k.error ? [] : k.data ?? [])) if (!cp[x.commande_id]) cp[x.commande_id] = x;
        setResume({ commandes: commandesAExpedier(c.data ?? []), demandes: dm, copies: cp, enRoute: r.error ? [] : commandesEnRoute(r.data ?? []) });
      } catch { /* la ligne est une entrée : sa panne n'affiche rien, la page « À expédier » reste ouverte par la barre */ }
    })();
    return () => { vivant = false; };
  }, [supabase]);

  if (!resume) return null;
  const r = resumeBordereaux({ ...resume, auto }, lang);
  if (!r.titre) return null;
  const urgent = r.aImprimer > 0 || r.aExpedier > 0;
  return (
    <button type="button" onClick={onOuvrir} data-ligne-bordereaux
      aria-label={[r.titre, ...r.details].join(', ')}
      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 56, padding: '10px 14px', background: '#fff', border: `1px solid ${UI.border}`, borderRadius: 18, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
      <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 12, background: urgent ? '#E6F1EE' : '#F2F0E9', color: urgent ? '#1B6E62' : '#5C6560', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <Package size={18} />
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 14.5, fontWeight: 700, color: UI.ink }}>{r.titre}</span>
        {r.details.length > 0 && <span style={{ fontSize: 12.5, color: '#5C6560', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.details.join(' · ')}</span>}
      </span>
      <ChevronRight size={18} aria-hidden="true" style={{ color: '#9AA19D', flex: 'none' }} />
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{fr ? 'Ouvrir la page À expédier' : 'Open the To ship page'}</span>
    </button>
  );
}
