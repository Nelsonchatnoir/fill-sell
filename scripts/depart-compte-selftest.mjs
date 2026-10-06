// Autotest — « Pourquoi tu pars ? » à la suppression du compte (06/10/2026).
//
//     node --import ./scripts/loader-ext.mjs scripts/depart-compte-selftest.mjs
//
// Ce qu'il verrouille :
//   1. LA SÉQUENCE (src/compte/supprimerCompte.js, avec un faux client) :
//      avec une réponse, sans réponse, avec un clic nu (ancien appel), quand
//      l'enregistrement échoue, lève ou ne répond pas → la suppression part
//      TOUJOURS, dans le même ordre qu'avant le 06/10 (stock sans retrait,
//      profil, delete-account), et rien d'autre n'est effacé ;
//   2. l'attente de l'enregistrement est bornée (2,5 s) ;
//   3. l'ÉCRAN (SousPageCompte rendu, FR et EN) : la question est dans l'étape
//      de confirmation finale, facultative, le bouton final n'en dépend jamais,
//      aucune étape de plus, aucune offre de rétention ;
//   4. LA BASE (migration 20261006090000) : aucune colonne qui désigne la
//      personne, aucune lecture client, une seule porte (la fonction) ;
//   5. les trois index de la suppression d'un gros stock.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let ko = 0;
const ok = (c, m, detail) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${detail ? `\n      ${String(detail).slice(0, 400)}` : ''}`); } };

const S = await import(pathToFileURL(join(ROOT, 'src/compte/supprimerCompte.js')).href);

// ── Faux client Supabase : journal de chaque geste ──────────────────────────
function fauxClient({ depart = 'ok' } = {}) {
  const gestes = [];
  const client = {
    rpc(nom, args) {
      gestes.push(['rpc', nom, args]);
      if (nom === 'enregistrer_depart') {
        if (depart === 'leve') throw new Error('réseau coupé');
        if (depart === 'rejette') return Promise.reject(new Error('fetch failed'));
        if (depart === 'erreur') return Promise.resolve({ data: null, error: { message: 'Could not find the function public.enregistrer_depart' } });
        if (depart === 'pend') return new Promise(() => {});
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    from(table) {
      return { delete() { return { eq(col, val) { gestes.push(['delete', table, col, val]); return Promise.resolve({ error: null }); } }; } };
    },
    auth: { getSession: async () => ({ data: { session: { access_token: 'jwt-test' } } }) },
  };
  const fetchImpl = async (url, opts) => { gestes.push(['fetch', url, opts?.headers?.Authorization]); return { ok: true, json: async () => ({ success: true }) }; };
  return { client, fetchImpl, gestes };
}
const silencieux = { warn() {} };
const base = { supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon', userId: 'u-1', plateformeApp: 'android', versionApp: '2.9.59+abc1234', journal: silencieux };
const effacement = (g) => g.filter((x) => !(x[0] === 'rpc' && x[1] === 'enregistrer_depart'));
const SEQUENCE_AVANT = [
  ['rpc', 'supprimer_mon_stock_sans_retrait', undefined],
  ['delete', 'profiles', 'id', 'u-1'],
  ['fetch', 'https://x.supabase.co/functions/v1/delete-account', 'Bearer jwt-test'],
];
const memeSequence = (g) => JSON.stringify(effacement(g)) === JSON.stringify(SEQUENCE_AVANT);

console.log('1. La séquence de suppression');
{
  const { client, fetchImpl, gestes } = fauxClient();
  const r = await S.supprimerMonCompte({ ...base, supabase: client, fetchImpl, depart: { motif: 'trop_cher', texte: '  Trop cher pour moi.  ' } });
  ok(gestes[0][1] === 'enregistrer_depart', 'avec réponse : la réponse part AVANT tout effacement');
  ok(JSON.stringify(gestes[0][2]) === JSON.stringify({ p_motif: 'trop_cher', p_texte: 'Trop cher pour moi.', p_plateforme_app: 'android', p_version_app: '2.9.59+abc1234' }), 'avec réponse : motif, texte rogné, plateforme et version de l’app', JSON.stringify(gestes[0][2]));
  ok(memeSequence(gestes), 'avec réponse : effacement identique à avant (stock sans retrait, profil, delete-account)', JSON.stringify(gestes));
  ok(r.depart.ok === true, 'avec réponse : enregistrement rendu « ok »');
}
for (const [quoi, depart] of [['sans réponse (null)', null], ['rien coché, rien écrit', { motif: null, texte: '   ' }], ['clic nu (ancien appel : un événement)', { type: 'click', target: {} }]]) {
  const { client, fetchImpl, gestes } = fauxClient();
  await S.supprimerMonCompte({ ...base, supabase: client, fetchImpl, depart });
  ok(gestes[0][1] === 'enregistrer_depart' && gestes[0][2].p_motif === null && gestes[0][2].p_texte === null, `${quoi} : une ligne vide part quand même (motif et texte nuls)`, JSON.stringify(gestes[0]));
  ok(memeSequence(gestes), `${quoi} : la suppression part, à l’identique`);
}
for (const mode of ['erreur', 'leve', 'rejette']) {
  const { client, fetchImpl, gestes } = fauxClient({ depart: mode });
  let leve = null;
  const r = await S.supprimerMonCompte({ ...base, supabase: client, fetchImpl, depart: { motif: 'autre', texte: 'x' } }).catch((e) => { leve = e; });
  ok(!leve && memeSequence(gestes) && r.depart.ok === false, `enregistrement en échec (${mode}) : la suppression continue quand même`, leve?.message || JSON.stringify(gestes));
}
{
  const { client, fetchImpl, gestes } = fauxClient({ depart: 'pend' });
  const t0 = Date.now();
  const r = await S.supprimerMonCompte({ ...base, supabase: client, fetchImpl, depart: { motif: 'pas_marche' } });
  const duree = Date.now() - t0;
  ok(memeSequence(gestes) && r.depart.raison === 'delai' && duree >= 2400 && duree < 3500, `enregistrement sans réponse du serveur : on n’attend que ${S.DELAI_ENREGISTREMENT_DEPART_MS} ms, puis la suppression part (${duree} ms)`);
}
{
  const r = await S.enregistrerDepart({ rpc: () => new Promise(() => {}) }, {}, { delaiMs: 30 });
  ok(r.ok === false && r.raison === 'delai', 'enregistrerDepart : attente bornée par son délai');
  const r2 = await S.enregistrerDepart(null, { motif: 'autre' });
  ok(r2.ok === false, 'enregistrerDepart : client absent → échec rendu, jamais levé');
}
{
  const { client, gestes } = fauxClient();
  let msg = null;
  await S.supprimerMonCompte({ ...base, supabase: client, depart: null, messageErreur: 'Erreur suppression compte',
    fetchImpl: async () => ({ ok: false, json: async () => ({ error: 'Token invalide ou expiré' }) }) }).catch((e) => { msg = e.message; });
  ok(msg === 'Token invalide ou expiré' && gestes.length === 3, 'delete-account en échec : l’erreur remonte comme avant (message du serveur)');
  let msg2 = null;
  await S.supprimerMonCompte({ ...base, supabase: fauxClient().client, depart: null, messageErreur: 'Erreur suppression compte',
    fetchImpl: async () => ({ ok: false, json: async () => { throw new SyntaxError('pas du JSON'); } }) }).catch((e) => { msg2 = e.message; });
  ok(msg2 === 'Erreur suppression compte', 'delete-account sans corps lisible : message par défaut');
}
{
  const R = S.reponseDepart;
  ok(R({ motif: 'pirate' }).motif === null, 'motif inconnu → rien');
  ok(S.MOTIFS_DEPART.join() === 'installation,pas_marche,trop_cher,plus_besoin,autre_outil,autre', 'six motifs, dans l’ordre de l’écran');
  ok(R({ texte: 'é'.repeat(2500) }).texte.length === 2000, 'texte coupé à 2 000 caractères');
  ok(R({ texte: 42 }).texte === null, 'texte non textuel → rien');
}

console.log('2. Le câblage dans l’app');
{
  const app = lire('src/App.jsx');
  const f = app.slice(app.indexOf('async function handleDeleteAccount('), app.indexOf('const TABS_MOBILE=['));
  ok(/await supprimerMonCompte\(\{/.test(f) && /depart, plateformeApp:platform, versionApp:VERSION_APP/.test(f), 'handleDeleteAccount passe par supprimerMonCompte, avec la plateforme et la version');
  ok(!/supprimer_mon_stock_sans_retrait|functions\/v1\/delete-account/.test(f), 'plus de seconde copie de la séquence dans App.jsx');
  ok(/signOut\(\{ scope: 'local' \}\)/.test(f), 'déconnexion locale inchangée après la suppression');
  ok(/lancer:handleDeleteAccount/.test(app), 'la sous-page appelle toujours handleDeleteAccount');
  ok(/__FILLSELL_APP_VERSION__/.test(lire('vite.config.js')) && /__FILLSELL_APP_VERSION__: 'readonly'/.test(lire('eslint.config.js')), 'version de l’app injectée par Vite et déclarée à ESLint');
  const sp = lire('src/reglages/SousPageCompte.jsx');
  ok(/onClick=\{\(\) => suppression\.lancer\(\{ motif, texte \}\)\}/.test(sp), 'le bouton final transmet la réponse');
  ok(!/disabled=\{[^}]*(motif|texte)/.test(sp), 'le bouton final ne dépend JAMAIS de la réponse');
  ok(!/setStep\(3\)/.test(sp), 'aucune étape de plus (0 → 1 → 2, comme avant)');
}

console.log('3. L’écran, rendu (FR et EN)');
globalThis.document ??= { body: {} };
const { createServer } = await import('vite');
const vite = await createServer({
  root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  ssr: { noExternal: [] },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const h = React.createElement;
  const { default: SousPageCompte } = await vite.ssrLoadModule('/src/reglages/SousPageCompte.jsx');
  const { txt } = await vite.ssrLoadModule('/src/reglages/textes.js');
  const rendu = (lang, step, enCours = false) => renderToStaticMarkup(h(SousPageCompte, {
    T: txt(lang),
    c: { deconnexion() {}, reset: { step: 0, lancer() {}, annuler() {} }, suppression: { step, setStep() {}, enCours, lancer() {} } },
  }));
  const texte = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ');
  for (const lang of ['fr', 'en']) {
    const T = txt(lang);
    const html2 = rendu(lang, 2);
    const t2 = texte(html2);
    ok(html2.includes('data-question-depart') && (html2.match(/role="radio"/g) ?? []).length === 6, `${lang} : étape finale — la question et ses six choix`);
    ok(S.MOTIFS_DEPART.every((m) => t2.includes(T.departMotifs[m])), `${lang} : chaque motif a son texte`);
    ok((html2.match(/aria-checked="true"/g) ?? []).length === 0, `${lang} : rien n’est coché d’avance`);
    ok(/<textarea[^>]*maxLength="2000"/i.test(html2) && t2.includes(T.departPlus), `${lang} : champ libre toujours visible (pas seulement sous « Autre »)`);
    ok(t2.includes(T.departFacultatif) && t2.includes(T.departTexte), `${lang} : dit « facultatif » et « pas reliée à ton compte »`);
    ok(html2.indexOf('data-question-depart') < html2.indexOf(T.supprFinale) && html2.indexOf(T.supprFinale) < html2.indexOf(T.supprDefinitif), `${lang} : la question est AVANT la confirmation finale, dans la même étape`);
    const boutonFinal = html2.slice(html2.lastIndexOf('<button', html2.indexOf(T.supprDefinitif)), html2.indexOf(T.supprDefinitif));
    ok(!/disabled=""/.test(boutonFinal), `${lang} : bouton « ${T.supprDefinitif} » actif sans aucune réponse`, boutonFinal);
    const t0 = texte(rendu(lang, 0)); const t1 = texte(rendu(lang, 1));
    ok(!t0.includes(T.departTitre) && !t1.includes(T.departTitre), `${lang} : rien de neuf aux étapes 0 et 1`);
    const interdits = lang === 'fr' ? /tu es sûr|réduction|offert|reste avec nous|dommage/i : /are you sure you want|discount|free month|stay with us|too bad/i;
    ok(!interdits.test(texte(html2).replace(T.supprEtes, '')), `${lang} : aucune culpabilisation ni offre de rétention`);
  }
  ok(!/ordinateur|marché|cher|vendre/.test(texte(rendu('en', 2))), 'en : aucun mot français dans l’étape finale');
} finally {
  await vite.close();
}

console.log('4. La base');
{
  const m = lire('supabase/migrations/20261006090000_departs_compte.sql');
  const table = m.slice(m.indexOf('CREATE TABLE IF NOT EXISTS public.departs_compte ('), m.indexOf(');', m.indexOf('CREATE TABLE IF NOT EXISTS public.departs_compte (')));
  ok(!/user_id|email|e_mail|compte_id/i.test(table), 'departs_compte : ni e-mail ni identifiant de compte');
  for (const col of ['le ', 'motif', 'texte', 'palier', 'anciennete_minutes', 'extension_installee', 'extension_version', 'plateformes_connectees', 'nb_articles', 'plateforme_app', 'version_app'])
    ok(table.includes(`  ${col}`), `departs_compte : colonne ${col.trim()}`);
  ok(/ALTER TABLE public\.departs_compte ENABLE ROW LEVEL SECURITY;\s*REVOKE ALL ON public\.departs_compte FROM PUBLIC, anon, authenticated;/.test(m), 'RLS active, aucun droit client (ni lecture ni écriture directe)');
  ok(!/CREATE POLICY/i.test(m), 'aucune politique : la fonction est la seule porte');
  ok(/user_id uuid PRIMARY KEY REFERENCES auth\.users \(id\) ON DELETE CASCADE/.test(m), 'la garde « une réponse par compte » part avec le compte (cascade)');
  ok(/SECURITY DEFINER/.test(m) && /v_uid\s+uuid := auth\.uid\(\)/.test(m) && /IF v_uid IS NULL THEN\s+RAISE EXCEPTION/.test(m), 'fonction : appelant authentifié obligatoire');
  ok(/REVOKE ALL ON FUNCTION public\.enregistrer_depart\(text, text, text, text\) FROM PUBLIC, anon;\s*GRANT EXECUTE ON FUNCTION public\.enregistrer_depart\(text, text, text, text\) TO authenticated;/.test(m), 'fonction : authenticated seulement');
  ok(/palier_de\(v_uid\)/.test(m) && /auth\.users u WHERE u\.id = v_uid/.test(m) && /extension_sessions/.test(m) && /ebay_accounts/.test(m) && /fusionne_dans IS NULL/.test(m), 'contexte lu côté serveur (palier, ancienneté, extension, plateformes, articles)');
  ok(/left\(nullif\(btrim\(coalesce\(p_texte, ''\)\), ''\), 2000\)/.test(m) && /THEN p_motif END/.test(m), 'jamais d’erreur pour un motif inconnu ou un texte trop long');
  ok(!/DELETE FROM|UPDATE (public\.)?(inventaire|ventes|profiles)/i.test(m), 'aucune donnée existante touchée');
}

console.log('5. Les index de la suppression d’un gros stock');
for (const t of ['vinted_listing_snapshots', 'rapprochements', 'vinted_republish_captures']) {
  const f = fs.readdirSync(join(ROOT, 'supabase/migrations')).find((x) => x.startsWith('20261006') && x.includes(`index_${t}_inventaire`));
  const m = f ? lire(`supabase/migrations/${f}`) : '';
  const instructions = m.split('\n').filter((l) => l.trim() && !l.startsWith('--')).join(' ');
  ok(new RegExp(`^CREATE INDEX CONCURRENTLY IF NOT EXISTS ${t}_inventaire_idx\\s+ON public\\.${t} \\(inventaire_id\\);$`).test(instructions.trim()), `${t} : index sur inventaire_id, CONCURRENTLY, seul dans son fichier`, instructions);
}

console.log(ko ? `\n${ko} échec(s)` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
