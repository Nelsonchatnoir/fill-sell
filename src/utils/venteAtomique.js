// Une confirmation perdue garde sa référence jusqu'à une réponse certaine.
// La quantité lue à l'écran protège aussi les confirmations de deux appareils.
import { supabase } from '../lib/supabase';
import { codePlateformeVente } from './venteModale.js';

const attentes = new Map();
export async function enregistrerVenteArticle({ userId, article, prix, frais = 0, quantite = 1, plateforme, cle },
  { client = supabase, stockage, uuid = () => crypto.randomUUID() } = {}) {
  if (stockage === undefined) {
    try { stockage = globalThis.localStorage; } catch { /* stockage désactivé */ }
  }
  const quantiteAttendue = article.quantite ?? 1;
  const emplacement = `fillsell:vente-en-attente:${userId}:${article.id}:${quantiteAttendue}`;
  let reference = cle || attentes.get(emplacement);
  if (!reference) {
    try { reference = stockage?.getItem(emplacement); } catch { /* mémoire de la page */ }
  }
  if (!reference) reference = uuid();
  attentes.set(emplacement, reference);
  try { stockage?.setItem(emplacement, reference); } catch { /* la quantité attendue reste vérifiée en base */ }
  const { data, error } = await client.rpc('enregistrer_vente_atomique', {
    p_user: userId, p_cle: reference, p_inventaire: article.id,
    p_prix: prix, p_frais: frais, p_quantite: quantite,
    // (02/10 soir) Le CODE de la plateforme, jamais son libellé : la base compare
    // ce code aux annonces de la fiche pour garder celle qui est vendue.
    p_quantite_attendue: quantiteAttendue, p_plateforme: codePlateformeVente(plateforme),
  });
  // Une erreur de transport ne prouve pas l'échec du serveur : garder la clé.
  if (error) throw new Error("La confirmation n'est pas arrivée. Réessaie : la vente ne sera pas comptée deux fois.");
  if (!data || typeof data.ok !== 'boolean') throw new Error('La confirmation de vente est indisponible. Réessaie.');
  attentes.delete(emplacement);
  try { stockage?.removeItem(emplacement); } catch { /* reçu conservé côté serveur */ }
  if (!data.ok) throw new Error(data.reason || 'La vente doit être vérifiée avant de continuer.');
  return data;
}
