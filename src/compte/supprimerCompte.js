// ═══════════════════════════════════════════════════════════════════════════
// SUPPRIMER SON COMPTE — la séquence, et la question « Pourquoi tu pars ? » (06/10)
// ═══════════════════════════════════════════════════════════════════════════
// Marine (05/10) a supprimé son compte 45 min après l'inscription sans qu'on
// puisse savoir pourquoi : l'app ne demandait rien. L'écran de confirmation
// finale pose désormais la question (Réglages › Mon compte, le SEUL point
// d'entrée : web, iOS et Android partagent ce code).
//
// ⛔ LA RÉPONSE NE RETIENT JAMAIS LA SUPPRESSION (Apple 5.1.1(v) : suppression
// simple) :
//   · elle est facultative — rien coché, rien écrit : la ligne part quand même,
//     vide (on sait au moins qu'un départ a eu lieu, et dans quel contexte) ;
//   · son enregistrement attend AU PLUS `DELAI_ENREGISTREMENT_DEPART_MS`, et un
//     échec (réseau, fonction absente, refus) est avalé : la suppression
//     continue, toujours ;
//   · elle part AVANT d'effacer quoi que ce soit, parce que le serveur y lit le
//     contexte (nombre d'articles, extension, plateformes) qui disparaît juste
//     après.
//
// La séquence d'effacement est celle d'App.jsx avant le 06/10, À L'IDENTIQUE :
// stock sans retrait (RPC), profil, puis delete-account (clé service). Rien de
// plus, rien de moins n'est effacé.
export const MOTIFS_DEPART = ['installation', 'pas_marche', 'trop_cher', 'plus_besoin', 'autre_outil', 'autre'];
export const TEXTE_DEPART_MAX = 2000;
export const DELAI_ENREGISTREMENT_DEPART_MS = 2500;

// La réponse telle qu'on l'envoie : un motif connu ou rien, un texte rogné ou rien.
export function reponseDepart(brute) {
  const motif = MOTIFS_DEPART.includes(brute?.motif) ? brute.motif : null;
  const texte = typeof brute?.texte === 'string' ? brute.texte.trim().slice(0, TEXTE_DEPART_MAX) : '';
  return { motif, texte: texte || null };
}

// Ne lève JAMAIS, ne dure JAMAIS plus que `delaiMs`.
export async function enregistrerDepart(supabase, brute, { plateformeApp = null, versionApp = null, delaiMs = DELAI_ENREGISTREMENT_DEPART_MS } = {}) {
  const { motif, texte } = reponseDepart(brute);
  let minuterie;
  try {
    const appel = Promise.resolve().then(() => supabase.rpc('enregistrer_depart', {
      p_motif: motif,
      p_texte: texte,
      p_plateforme_app: plateformeApp,
      p_version_app: versionApp,
    }));
    const delai = new Promise((resoudre) => { minuterie = setTimeout(() => resoudre({ delaiDepasse: true }), delaiMs); });
    const r = await Promise.race([appel, delai]);
    if (r?.delaiDepasse) return { ok: false, raison: 'delai' };
    if (r?.error) return { ok: false, raison: r.error.message || r.error.code || 'erreur' };
    return { ok: true };
  } catch (e) {
    return { ok: false, raison: e?.message || String(e) };
  } finally {
    clearTimeout(minuterie);
  }
}

export async function supprimerMonCompte({
  supabase, fetchImpl = (...a) => fetch(...a), supabaseUrl, supabaseAnonKey, userId,
  depart = null, plateformeApp = null, versionApp = null, messageErreur = 'Erreur suppression compte',
  journal = console,
}) {
  const enregistrement = await enregistrerDepart(supabase, depart, { plateformeApp, versionApp });
  if (!enregistrement.ok) journal?.warn?.('[suppression] réponse de départ non enregistrée (suppression poursuivie) :', enregistrement.raison);

  // Même RPC que la réinitialisation (2026-09-16) : supprimer son compte ne
  // retire rien des plateformes, le filet serveur ne doit pas s'y déclencher.
  // (delete-account refait ce ménage sous la clé service, que le filet
  // ignore aussi.) Ventes puis inventaire, dans l'ordre de la FK.
  await supabase.rpc('supprimer_mon_stock_sans_retrait');
  await supabase.from('profiles').delete().eq('id', userId);
  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token;
  const res = await fetchImpl(`${supabaseUrl}/functions/v1/delete-account`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      apikey: supabaseAnonKey,
    },
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error || messageErreur);
  }
  return { depart: enregistrement };
}
