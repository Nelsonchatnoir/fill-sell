// VERROU « LE MAIL DE VENTE PORTE UN LIEN « SE DÉSINSCRIRE » QUI MARCHE » (19/11/2026, ordre de Nico, point 2)
// `npm run selftest:mail-vente-lien-desinscription` — sans base, sans réseau : il rend les vrais gabarits et lit le dépôt.
// Ordre : « Oui, ajoute-le. Le lien doit marcher pour de vrai : après le clic, plus aucun mail de vente pour cette
// personne. » Avant : le mail de vente (push-ventes → mailVentes / mailRafale) partait SANS lien visible (seul l'en-tête
// List-Unsubscribe de la porte, invisible pour la personne).
// La chaîne prouvée ici, maillon par maillon :
//   A. le mail de vente (une vente, plusieurs, la rafale) rend « Me désinscrire » vers /desinscription?t=<jeton> ; sans
//      lien, le pied d'avant à l'octet ;
//   B. push-ventes pose ce lien sur les DEUX chemins (mail d'une vente, récapitulatif de rafale), par lienDesinscription()
//      (le jeton de l'adresse, le même que les mails marketing) ; un lien illisible ne fait jamais perdre le mail ;
//   C. le clic : la page /desinscription poste { t, action: "desinscrire" } à email-desinscription, qui retrouve l'adresse
//      du jeton et appelle desinscrire() → email_destinataires.desinscrit = true (+ trace d'audit) ;
//   D. après le clic : la porte (envoyerEmail) consulte estDesinscrit() pour la catégorie « notification » (le mail de
//      vente) et refuse ; ce refus est DÉFINITIF (verdictMailVente : echec « desinscrit », jamais réessayé) ;
//   E. la chaîne rejouée en mémoire (un registre, une porte) : avant le clic le mail part, après le clic plus aucun.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(path.join(RACINE, p), 'utf8').replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d !== undefined ? `\n      ${String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 300)}` : ''}`); } };
const charger = async (p) => { try { return await import(pathToFileURL(path.join(RACINE, p)).href); } catch (e) { ok(false, `${p} chargé`, e.message); return {}; } };

const LIEN = 'https://fillsell.app/desinscription?t=jeton-essai-0123456789abcdef';
const VENTE = { titre: 'Robe en lin', plateforme: 'vinted', prixVente: 15, benefice: null };

console.log('A. Le mail de vente rend « Me désinscrire » vers la page de désinscription');
{
  const M = await charger('supabase/functions/_shared/emails-fillsell.ts');
  if (typeof M.mailVentes === 'function') {
    const un = M.mailVentes({ ventes: [VENTE], retraitsACliquer: 0, retraitsBeebsAuto: 0, lienDesinscription: LIEN }, 'fr').html;
    ok(un.includes(`href="${LIEN}"`) && /Me désinscrire<\/a>/.test(un), 'une vente : le lien visible « Me désinscrire » → /desinscription?t=…');
    const plusieurs = M.mailVentes({ ventes: [VENTE, { ...VENTE, titre: 'Pull', plateforme: 'leboncoin' }], retraitsACliquer: 0, retraitsBeebsAuto: 0, lienDesinscription: LIEN }, 'fr').html;
    ok(plusieurs.includes(`href="${LIEN}"`), 'plusieurs ventes dans un mail : le même lien');
    const en = M.mailVentes({ ventes: [VENTE], retraitsACliquer: 0, retraitsBeebsAuto: 0, lienDesinscription: LIEN }, 'en').html;
    ok(en.includes(`href="${LIEN}"`) && /Unsubscribe<\/a>/.test(en), 'en anglais : « Unsubscribe »');
    const sans = M.mailVentes({ ventes: [VENTE], retraitsACliquer: 0, retraitsBeebsAuto: 0 }, 'fr').html;
    ok(!/desinscription\?t=/.test(sans) && !/Me désinscrire<\/a>/.test(sans), 'sans lien fourni : le pied d\'avant, aucun lien inventé');
  } else ok(false, 'mailVentes exportée');
  if (typeof M.mailRafale === 'function') {
    const r = M.mailRafale({ ventes: [{ ...VENTE, aConfirmer: false }, { ...VENTE, titre: 'Jean', aConfirmer: true }], lienDesinscription: LIEN }, 'fr').html;
    ok(r.includes(`href="${LIEN}"`) && /Me désinscrire<\/a>/.test(r), 'la rafale (récapitulatif) : le même lien');
  } else ok(false, 'mailRafale exportée');
}

console.log('B. push-ventes pose le lien sur les deux chemins, sans jamais perdre le mail');
{
  const pv = lire('supabase/functions/push-ventes/index.ts');
  ok(/import \{ envoyerEmail, lienDesinscription \} from "\.\.\/_shared\/desinscription\.ts";/.test(pv), 'import de lienDesinscription (le jeton de l\'adresse, comme le marketing)');
  ok(/async function lienDuMailDeVente\(adresse: string, userId: string \| null \| undefined\): Promise<string> \{\s*try \{ return await lienDesinscription\(adresse, userId \?\? null\); \} catch \(_e\) \{ return ""; \}\s*\}/.test(pv),
    'lienDuMailDeVente : un lien illisible = chaîne vide (le mail part quand même, la porte filtre quand même)');
  const fVente = pv.slice(pv.indexOf('async function envoyerMailVente('), pv.indexOf('async function envoyerMailRafale('));
  ok(/const lien = await lienDuMailDeVente\(adresse, n\.user_id\);[\s\S]*mailVentes\(\{\s*[\s\S]{0,200}\.\.\.\(lien \? \{ lienDesinscription: lien \} : \{\}\)/.test(fVente), 'mail d\'une vente : lien posé');
  const fRafale = pv.slice(pv.indexOf('async function envoyerMailRafale('), pv.indexOf('function messageDuRecap('));
  ok(/const lien = await lienDuMailDeVente\(adresse, n\.user_id\);/.test(fRafale) && /lienDesinscription: lien/.test(fRafale) && /mailVentes\(\{ ventes, retraitsACliquer: 0, retraitsBeebsAuto: 0, aConfirmer: ventes\[0\]\.aConfirmer, \.\.\.dv \}, lang\)/.test(fRafale) && /mailRafale\(\{ ventes, \.\.\.dv \}, lang\)/.test(fRafale),
    'récapitulatif de rafale (une ou plusieurs ventes) : lien posé');
  ok((pv.match(/categorie: "notification", dedup: "reservation"/g) ?? []).length === 2 && !/categorie: "support"/.test(pv), 'les deux envois restent en « notification » (filtrée par la désinscription)');
}

console.log('C. Le clic : la page poste au point d\'entrée, qui désinscrit l\'adresse du jeton');
{
  const d = lire('supabase/functions/_shared/desinscription.ts');
  ok(/export const URL_DESINSCRIPTION = "https:\/\/fillsell\.app\/desinscription";/.test(d) && /return `\$\{URL_DESINSCRIPTION\}\?t=\$\{encodeURIComponent\(await jetonDe\(email, userId\)\)\}`;/.test(d), 'le lien = /desinscription?t=<jeton de l\'adresse>');
  const page = lire('src/pages/Desinscription.jsx');
  ok(/functions\/v1\/email-desinscription/.test(page) && /body: JSON\.stringify\(\{ t: jeton, action \}\)/.test(page), 'la page poste { t, action } à email-desinscription');
  const fn = lire('supabase/functions/email-desinscription/index.ts');
  ok(/\.from\("email_destinataires"\)\s*\.select\("email, user_id, desinscrit, desinscrit_le, reinscrit_le"\)\s*\.eq\("jeton", jeton\)/.test(fn), 'le point d\'entrée retrouve l\'adresse par le jeton');
  ok(/const veutPartir = action === "desinscrire";\s*const r = await desinscrire\(\{\s*email: ligne\.email as string,/.test(fn), '« desinscrire » → desinscrire() sur l\'adresse du jeton');
  ok(/\{ desinscrit: true, desinscrit_le: new Date\(\)\.toISOString\(\), origine: opts\.origine \}/.test(d), 'desinscrire() pose email_destinataires.desinscrit = true');
}

console.log('D. Après le clic : la porte refuse le mail de vente, définitivement');
{
  const d = lire('supabase/functions/_shared/desinscription.ts');
  ok(/if \(bloqueeParDesinscription\(categorie\)\) \{/.test(d) && /estDesinscrit\(/.test(d), 'la porte consulte la désinscription pour les catégories filtrées');
  const C = await charger('supabase/functions/_shared/mail-categorie.js');
  ok(C.bloqueeParDesinscription?.('notification') === true, '« notification » (le mail de vente) est filtrée');
  const v = C.verdictMailVente?.({ envoye: false, motif: 'desinscrit' });
  ok(v?.statut === 'echec' && v?.motif === 'desinscrit', 'refus « desinscrit » = échec définitif, jamais réessayé', v);
}

console.log('E. La chaîne rejouée en mémoire : avant le clic le mail part, après le clic plus aucun');
{
  const C = await charger('supabase/functions/_shared/mail-categorie.js');
  const registre = new Map([['client@exemple.invalid', { jeton: 'jeton-essai-0123456789abcdef', desinscrit: false }]]);
  const porte = (to, categorie) => (C.bloqueeParDesinscription?.(categorie) && registre.get(to)?.desinscrit ? { envoye: false, motif: 'desinscrit' } : { envoye: true });
  const clic = (url) => { const t = new URL(url).searchParams.get('t'); for (const l of registre.values()) if (l.jeton === t) l.desinscrit = true; };
  ok(C.verdictMailVente?.(porte('client@exemple.invalid', 'notification'))?.statut === 'envoye', 'avant le clic : le mail de vente part');
  clic(LIEN);
  const apres = [1, 2, 3].map(() => C.verdictMailVente?.(porte('client@exemple.invalid', 'notification'))?.statut);
  ok(apres.every((s) => s === 'echec'), 'après le clic : plus aucun mail de vente (trois ventes de suite, trois refus définitifs)', apres);
  ok(C.verdictMailVente?.(porte('client@exemple.invalid', 'support'))?.statut === 'envoye', 'une réponse du support (sa demande) part toujours');
}

console.log(ko ? `\n✗ mail-vente-lien-desinscription : ${ko} échec(s) sur ${n}` : `\n✓ mail-vente-lien-desinscription : ${n}/${n}`);
process.exit(ko ? 1 : 0);
