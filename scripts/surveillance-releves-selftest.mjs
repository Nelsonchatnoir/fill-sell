// ═══════════════════════════════════════════════════════════════════════════
// UNE BOUTIQUE QUI N'EST PLUS SURVEILLÉE SE VOIT — `npm run selftest:surveillance-releves`
// ═══════════════════════════════════════════════════════════════════════════
// 18/10 16:51 (lecture seule) : 8 couples compte × plateforme, 654 annonces, relevé
// mort depuis plus de 24 h parce que la session est fermée, sans un mot de l'app.
// Vérifie, sans réseau :
//   1. la règle de la ligne (utils/alertesCompte.js) sur les lignes de la RPC
//      surveillance_releves telles que PostgREST les rend (cas lesmillesetunepepite) ;
//   2. son intégration aux alertes de compte (en tête, remplace « connexion » de la
//      même plateforme, jamais masquée par plateforme, réglage global respecté) ;
//   3. la phrase, FR et EN, mot pour mot, et le geste unique (« Se reconnecter ») ;
//   4. le câblage (relecture bornée, ligne en tête de « À régler » avec son bouton,
//      tuile, écran des alertes sans adresse en dur) ;
//   5. la migration (fonction sur auth.uid(), droits, veille sans double compte,
//      réécrite depuis la prod), son inverse (corps de prod à l'octet) et l'essai
//      à blanc (corps repris à l'octet, ROLLBACK, se fait passer pour la boutique).
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
let echecs = 0, total = 0;
const ok = (c, l, detail = '') => { total++; if (!c) echecs++; console.log(`${c ? '  ✓' : '  ✗'} ${l}${c || !detail ? '' : `   ← ${String(detail).slice(0, 400)}`}`); };
const A = await import(pathToFileURL(path.join(RACINE, 'src/utils/alertesCompte.js')).href);

// Lignes de la RPC pour lesmillesetunepepite, lues le 18/10 (formes PostgREST).
const MAINTENANT = Date.parse('2026-10-18T16:51:00+02:00');
const LBC = { platform: 'leboncoin', dernier_releve_le: '2026-09-23T07:41:29.041+00:00', dernier_mur_le: '2026-10-17T17:52:23.135+00:00', dernier_mur_marqueur: 'page_de_connexion', annonces_en_ligne: 217, ecartees_autre_compte: 0, non_surveillee: true, jours: 25 };
const VINTED = { platform: 'vinted', dernier_releve_le: '2026-09-22T20:12:31.428+00:00', dernier_mur_le: '2026-10-12T10:14:30.091+00:00', dernier_mur_marqueur: 'pas_connecte', annonces_en_ligne: 234, ecartees_autre_compte: 0, non_surveillee: true, jours: 25 };
const BEEBS = { platform: 'beebs', dernier_releve_le: null, dernier_mur_le: '2026-09-22T20:19:03.914+00:00', dernier_mur_marqueur: 'page_de_connexion', annonces_en_ligne: 0, ecartees_autre_compte: 0, non_surveillee: false, jours: null };
const LIGNES = [BEEBS, LBC, VINTED];

console.log('1. La règle de la ligne');
{
  const r = A.boutiquesNonSurveillees(LIGNES, MAINTENANT);
  ok(r.length === 2 && r.map((a) => a.platform).join(',') === 'leboncoin,vinted', 'lesmillesetunepepite : Leboncoin et Vinted, rien pour Beebs (0 annonce)', JSON.stringify(r));
  ok(r.every((a) => a.kind === 'non_surveillee' && a.motif === 'connexion'), 'kind non_surveillee, geste « connexion »');
  ok(r[0].annonces === 217 && r[1].annonces === 234, 'annonces distinctes rendues telles quelles (217, 234 — jamais 430)');
  ok(r[0].jours === 25 && r[1].jours === 25, 'jours pleins depuis le dernier relevé réussi, recalculés à l\'heure de l\'écran', `${r[0].jours} / ${r[1].jours}`);
  ok(A.boutiquesNonSurveillees([{ ...LBC, non_surveillee: false }], MAINTENANT).length === 0, 'la RPC tranche : non_surveillee false → rien');
  ok(A.boutiquesNonSurveillees([{ ...LBC, annonces_en_ligne: 0 }], MAINTENANT).length === 0, 'aucune annonce à surveiller → rien');
  ok(A.boutiquesNonSurveillees([{ ...LBC, platform: 'opla' }], MAINTENANT).length === 0, 'une plateforme hors liste (Opla quittée) → rien');
  ok(A.boutiquesNonSurveillees(null).length === 0 && A.boutiquesNonSurveillees(undefined).length === 0 && A.boutiquesNonSurveillees([null, 3, 'x']).length === 0, 'pas encore lue, illisible → rien, jamais une erreur');
  const dp = A.boutiquesNonSurveillees([{ ...LBC, platform: 'depop', dernier_mur_marqueur: 'acces_non_accorde' }], MAINTENANT);
  ok(dp.length === 1 && dp[0].motif === 'autoriser_depop', 'Depop sans autorisation : le geste est « Autoriser Depop »', JSON.stringify(dp));
  const jamais = A.boutiquesNonSurveillees([{ ...LBC, dernier_releve_le: null, jours: null }], MAINTENANT);
  ok(jamais.length === 1 && jamais[0].jours === null && jamais[0].depuis === null, 'jamais relevé avec succès : pas de durée inventée');
  const hier = A.boutiquesNonSurveillees([{ ...LBC, dernier_releve_le: new Date(MAINTENANT - 25 * 3600 * 1000).toISOString() }], MAINTENANT);
  ok(hier[0].jours === 1, 'un peu plus de 24 h → « 1 jour »', hier[0].jours);
  const ec = A.ecarteesAutreCompte([{ ...LBC, ecartees_autre_compte: 3 }, VINTED, { platform: 'beebs', ecartees_autre_compte: '0' }]);
  ok(ec.length === 1 && ec[0].platform === 'leboncoin' && ec[0].n === 3, 'écartées « autre compte » : la plateforme et leur nombre, rien à zéro', JSON.stringify(ec));
}

console.log('\n2. Avec les alertes de compte');
{
  const a = A.alertesCompte({ etats: { leboncoin: 'ko', ebay: 'ko' }, jobs: [], reglage: null, maintenant: MAINTENANT, surveillance: LIGNES });
  ok(a.map((x) => `${x.platform}:${x.kind}`).join(',') === 'leboncoin:non_surveillee,vinted:non_surveillee,ebay:connexion', 'en tête ; elle remplace « connexion » de la même plateforme ; eBay garde la sienne', a.map((x) => `${x.platform}:${x.kind}`).join(','));
  const m = A.alertesCompte({ etats: {}, jobs: [], reglage: { masquees: { leboncoin: true, vinted: true } }, maintenant: MAINTENANT, surveillance: LIGNES });
  ok(m.filter((x) => x.kind === 'non_surveillee').length === 2, 'le masque d\'une session perdue ne cache pas un risque de double vente');
  ok(A.alertesCompte({ etats: {}, jobs: [], reglage: { desactivees: true }, maintenant: MAINTENANT, surveillance: LIGNES }).length === 0, 'réglage global « plus aucune alerte » : respecté');
  ok(A.alertesCompte({ etats: { vinted: 'ko' }, jobs: [], reglage: null, maintenant: MAINTENANT }).map((x) => x.kind).join(',') === 'connexion', 'sans lecture de la RPC (migration pas appliquée) : comme avant');
  const l = A.ligneAlertes(a.filter((x) => x.kind !== 'non_surveillee'), 'fr');
  ok(l.titre === 'Connecte-toi à eBay', 'la ligne regroupée « Connexion et compte » ne la recompte pas', l.titre);
  ok(A.PLATEFORMES_ALERTE.includes('depop') && A.PLATEFORMES_SURVEILLANCE.join(',') === 'vinted,leboncoin,beebs,depop,ebay', 'Depop est une plateforme d\'alerte');
}

console.log('\n3. La phrase et le geste');
{
  const [l1] = A.boutiquesNonSurveillees([LBC], MAINTENANT);
  const fr = A.ligneNonSurveillee(l1, 'fr');
  ok(`${fr.titre} ${fr.detail}` === "Ta boutique Leboncoin n'est plus surveillée depuis 25 jours : ta session est fermée. Une vente là-bas ne retirera pas tes autres annonces (risque de double vente).", 'FR, mot pour mot', `${fr.titre} ${fr.detail}`);
  const en = A.ligneNonSurveillee(l1, 'en');
  ok(`${en.titre} ${en.detail}` === "Your Leboncoin shop hasn't been watched for 25 days: your session is closed. A sale there won't remove your other listings (risk of selling twice).", 'EN, mot pour mot', `${en.titre} ${en.detail}`);
  const un = A.ligneNonSurveillee({ platform: 'vinted', jours: 1, motif: 'connexion' }, 'fr');
  ok(un.titre === "Ta boutique Vinted n'est plus surveillée depuis 1 jour : ta session est fermée.", 'singulier', un.titre);
  const sans = A.ligneNonSurveillee({ platform: 'beebs', jours: null, motif: 'connexion' }, 'fr');
  ok(sans.titre === "Ta boutique Beebs n'est plus surveillée : ta session est fermée.", 'sans date connue : sans durée', sans.titre);
  const dp = A.ligneNonSurveillee({ platform: 'depop', jours: 3, motif: 'autoriser_depop' }, 'fr');
  ok(dp.titre === "Ta boutique Depop n'est plus surveillée depuis 3 jours : FillSell n'a plus l'autorisation d'ouvrir Depop.", 'Depop sans autorisation : la vraie cause', dp.titre);
  ok(A.libelleReconnexion(l1, 'fr') === 'Se reconnecter' && A.libelleReconnexion(l1, 'en') === 'Sign in again' && A.libelleReconnexion({ motif: 'autoriser_depop' }, 'fr') === null, 'UN geste : « Se reconnecter » (« Autoriser Depop » garde son libellé)');
  const textes = [fr.titre, fr.detail, en.titre, en.detail, dp.titre];
  ok(textes.every((t) => !/\p{Extended_Pictographic}/u.test(t) && !/surveillance_releves|run|extension_sessions|session_absente|\[/.test(t)), 'ni émoji, ni mot technique, ni marqueur');
  const CP = lire('src/utils/connexionPlateformes.js');
  ok(/CONNEXION: 'connexion'/.test(CP) && /AUTORISER_DEPOP: 'autoriser_depop'/.test(CP) && A.MOTIF_CONNEXION === 'connexion' && A.MOTIF_AUTORISER_DEPOP === 'autoriser_depop', 'motifs : miroir exact de MOTIFS (connexionPlateformes)');
}

console.log('\n4. Le câblage');
{
  const ST = lire('src/tabs/StockTab.jsx');
  const bloc = ST.slice(ST.indexOf('ALERTES DE COMPTE : SESSION PERDUE'), ST.indexOf('const attenteBoutique = useMemo'));
  ok(/supabase\.rpc\('surveillance_releves'\)/.test(bloc) && /const relecture = demarrerRelecture\(lire, \{ intervalleMs: 10 \* 60_000 \}\);/.test(bloc) && !/setInterval/.test(bloc),
    'la RPC est lue dans la relecture BORNÉE existante (10 min, onglet visible), jamais un setInterval');
  ok(/error\.code === 'PGRST202'/.test(bloc) && /if \(rpcAbsente\) return undefined;/.test(bloc), 'RPC absente (migration pas appliquée) : plus redemandée, rien ne casse');
  ok(/surveillance: surveillanceReleves \}\)/.test(bloc) && /a\.kind === 'non_surveillee'\)/.test(bloc) && /a\.kind !== 'non_surveillee'\)/.test(bloc), 'une seule règle (alertesCompte), séparée en lignes propres et ligne regroupée');
  ok(/const lignesNonSurveillees = nonSurveillees\.map\(\(a\) => \(\{\n\s+cle: `non_surveillee:\$\{a\.platform\}`, groupe: 'non_surveillee', n: 1, ton: 'echec',/.test(ST), 'une ligne PAR plateforme, rouge');
  ok(/<BoutonMeConnecter userId=\{user\?\.id\} platform=\{a\.platform\} motif=\{a\.motif\} lang=\{lang\}\n\s+variante="bouton" libelleImpose=\{libelleReconnexion\(a, lang\)\} \/>/.test(ST), 'UN geste dedans : BoutonMeConnecter, motif de la ligne, « Se reconnecter »');
  ok(/<EcranARegler lang=\{lang\} lignes=\{\[\.\.\.lignesNonSurveillees, \.\.\.lignesARegler\]\}/.test(ST), 'EN TÊTE de « À régler », avant les articles vendus encore en ligne');
  ok(/const nbAReglerTout = nbNonSurveillees \+ nbARegler;/.test(ST) && /const gesteARegler = \{ n: nbAReglerTout,/.test(ST) && /'boutique non surveillée'/.test(ST), 'la tuile la compte et la nomme');
  ok(!/bandeau|Bandeau/.test(ST.slice(ST.indexOf('const lignesNonSurveillees'), ST.indexOf('const lignesARegler = ['))), 'aucun bandeau (règle du 12/10)');
  const EA = lire('src/stock/EcranARegler.jsx');
  ok(/non_surveillee: Unplug/.test(EA) && /if \(l\.action\) \{/.test(EA) && /<div key=\{l\.cle\} role="group"/.test(EA) && /\{l\.action\}/.test(EA), 'EcranARegler : une ligne qui porte son geste est un bloc (jamais un bouton dans un bouton)');
  ok(/une boutique qui n’est plus surveillée/.test(EA) && /a shop that is no longer watched/.test(EA), 'EcranARegler : la phrase d\'en-tête le dit, FR et EN');
  const EC = lire('src/stock/EcranAlertesCompte.jsx');
  ok(!/ADRESSE_CONNEXION/.test(EC) && /<BoutonMeConnecter userId=\{userId\} platform=\{a\.platform\}/.test(EC) && /libelleImpose=\{libelleReconnexion\(a, lang\)\}/.test(EC), 'écran des alertes : le même geste, plus d\'adresse d\'accueil ouverte à la main');
  ok(/\{!nonSurveillee && \(/.test(EC), 'écran des alertes : pas de « Masquer » sur un risque');
  ok(/<EcranAlertesCompte lang=\{lang\} alertes=\{alertesDuCompte\} userId=\{user\?\.id\}/.test(ST), 'écran des alertes : reçoit le compte (demande à l\'ordinateur sur mobile)');
  const BM = lire('src/components/BoutonMeConnecter.jsx');
  ok(/compact = false, libelleImpose = null,/.test(BM) && (BM.match(/libelleImpose \|\| libelle\(t, platform, motif\)/g) ?? []).length === 2, 'BoutonMeConnecter : le libellé imposé, sur le lien (web) comme sur le bouton (mobile) ; le geste ne change pas');
}

console.log('\n5. Migration, inverse, essai');
{
  const MIG = lire('supabase/migrations/20261018190000_surveillance_releves.sql');
  const INV = lire('supabase/rollbacks/20261018190000_surveillance_releves_INVERSE.sql');
  const ESS = lire('scripts/essais/20261018190000_essai.sql');
  const PROD = lire('supabase/migrations/20261018010000_releves_morts_veille.sql');
  const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');
  const defVeille = (c) => { const i = c.indexOf('CREATE OR REPLACE FUNCTION public.releves_morts_veille'); const j = c.indexOf('$function$;', i); return i < 0 || j < 0 ? '' : `${c.slice(i, j)}$function$\n`; };
  const corps = (c) => { const a = c.indexOf('-- ⟦corps:début⟧'); const b = c.indexOf('-- ⟦corps:fin⟧'); return a < 0 || b < 0 ? null : c.slice(a, b + '-- ⟦corps:fin⟧'.length); };
  const fn = MIG.slice(MIG.indexOf('CREATE OR REPLACE FUNCTION public.surveillance_releves()'), MIG.indexOf('-- ── 3.'));
  ok(/\bSTABLE SECURITY DEFINER\b/.test(fn) && /SET search_path TO 'public', 'pg_temp'/.test(fn) && /WHERE p\.id = auth\.uid\(\)/.test(fn) && /surveillance_releves\(\)\n RETURNS TABLE/.test(fn),
    'surveillance_releves() : SECURITY DEFINER sur auth.uid(), sans paramètre (jamais un autre compte)');
  ok(/REVOKE ALL ON FUNCTION public\.surveillance_releves\(\) FROM PUBLIC, anon;/.test(MIG) && /GRANT EXECUTE ON FUNCTION public\.surveillance_releves\(\) TO authenticated, service_role;/.test(MIG), 'droits : authenticated et service_role, ni anon ni PUBLIC');
  ok(/'boutique_a_confirmer'/.test(fn) && /x\.marqueur <> 'boutique_a_confirmer'/.test(fn) && /NOT \(v\.pf = 'ebay' AND moi\.ebay_api\)/.test(fn) && /NOT \(moi\.ecartees \? v\.pf\)/.test(fn),
    'boutique à confirmer n\'est pas un mur ; eBay relié par l\'API et plateformes écartées : exclus');
  ok(/\[pas_connecte\]/.test(fn) && /session_absente/.test(fn) && /page de connexion/.test(fn) && /r\.status = 'absente'/.test(fn) && /WHEN r\.status = 'done' THEN NULL/.test(fn), 'mur de session : marqueurs des runs non réussis, et status absente');
  ok(/count\(DISTINCT y\.cle\)/.test(fn) && /'job:' \|\| j\.id::text/.test(fn), 'annonces DISTINCTES (dépôt sans numéro : compte pour un)');
  ok(/< now\(\) - interval '24 hours'/.test(fn) && /m\.fin > coalesce\(p\.fin, '-infinity'::timestamptz\)/.test(fn) && /coalesce\(n\.n, 0\) > 0\)/.test(fn) && /x\.status IN \('done', 'incomplete'\)/.test(fn),
    'non_surveillee = > 24 h ET mur postérieur à la dernière preuve de session ET annonces > 0');
  ok(/r\.user_id = \(SELECT m\.id FROM moi m\)/.test(fn) && /r\.started_at > now\(\) - interval '180 days'/.test(fn) && /CREATE INDEX IF NOT EXISTS sync_import_ecartes_user_date/.test(MIG), 'lecture bornée (index par compte, 180 jours ; index des écartées posé)');
  ok(/IS DISTINCT FROM '6db6781d3d214a04e7649b4560b402fb'/.test(MIG), 'garde : la veille de prod n\'a pas bougé depuis sa lecture (md5)');
  const vProd = defVeille(PROD); const vNeuf = defVeille(MIG); const vInv = defVeille(INV);
  ok(md5(vProd) === '6db6781d3d214a04e7649b4560b402fb' && md5(vInv) === '6db6781d3d214a04e7649b4560b402fb', 'inverse = corps de prod d\'avant, à l\'octet (md5 6db6781d…)', `${md5(vProd)} / ${md5(vInv)}`);
  const a = vProd.split('\n'), b = vNeuf.split('\n');
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  let ja = a.length - 1, jb = b.length - 1; while (ja > i && jb > i && a[ja] === b[jb]) { ja--; jb--; }
  const avant = a.slice(i, ja + 1).join('\n'); const apres = b.slice(i, jb + 1).join('\n');
  ok(/sum\(n\) AS n/.test(avant) && /count\(DISTINCT cle\) AS n/.test(apres) && !/lignes AS|figes AS|cause_probable/.test(apres) && a.slice(0, i).some((x) => /a_surveiller AS \(/.test(x)),
    'veille réécrite depuis la prod : SEUL le CTE a_surveiller change (plus de double compte)', apres);
  ok(/DROP FUNCTION IF EXISTS public\.surveillance_releves\(\);/.test(INV) && /DROP INDEX IF EXISTS public\.sync_import_ecartes_user_date;/.test(INV), 'inverse : fonction et index retirés');
  ok(corps(MIG) && ESS.includes(corps(MIG)) && corps(INV) && ESS.includes(corps(INV)), 'essai : corps de la migration et de l\'inverse repris à l\'octet');
  ok((ESS.match(/^BEGIN;$/gm) ?? []).length === 1 && /\nROLLBACK;\n?$/.test(ESS) && !/^COMMIT;$/m.test(ESS), 'essai : une transaction, ROLLBACK final, aucun COMMIT');
  ok(/set_config\('request\.jwt\.claims', json_build_object\('sub', '4cd4d9ae-7165-4750-860f-6ecf747b1be0', 'role', 'authenticated'\)::text, true\)/.test(ESS) && /EXECUTE 'SET LOCAL ROLE authenticated';/.test(ESS) && /EXECUTE 'RESET ROLE';/.test(ESS) && /SELECT ordre, cas, attendu, obtenu, ok FROM _r ORDER BY ordre;/.test(ESS),
    'essai : se fait passer pour lesmillesetunepepite (claims + rôle authenticated), résultat dans _r');
}

console.log(`\n${total - echecs}/${total} contrôles verts`);
process.exit(echecs ? 1 : 0);
