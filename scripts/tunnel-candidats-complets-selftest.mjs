// VERROU (15/11/2026, point 2 du lot (2) de Nico) — LE TUNNEL DE MAILS LIT SES CANDIDATS EN ENTIER.
//
// Constat : « Comment ça marche » (J+1) : 12 envois en 12 jours pour 243 inscrits. email-tunnel lisait
// email_tunnel_candidates() par un rpc NU — 3 777 lignes sans ordre, PostgREST coupe à 1 000 sans erreur : les inscrits
// de la veille tombaient presque tous hors de la tranche lue. Décision de Nico : on corrige, SANS rattrapage en masse,
// avec le plafond de 2 mails de notre initiative par personne et par 24 h, et les désinscriptions respectées.
// Ce verrou casse si : la liste peut être tronquée (plus de 1 000 lignes), une page en erreur passe pour la fin de la
// liste, un appel nu à email_tunnel_candidates revient dans email-tunnel, les mails J+1 lisent autre chose que la
// fenêtre de leur règle (rattrapage), ou partent sans le plafond de 2 / 24 h.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => { try { return readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };

// Une base qui se conduit comme PostgREST : sans .range(), 1 000 lignes au plus, sans erreur ; filtres et ordre appliqués.
function baseSimulee(lignes, { erreurPage = null } = {}) {
  const appels = [];
  return {
    appels,
    rpc(nom) {
      const etat = { nom, filtres: [], ordre: [], range: null };
      appels.push(etat);
      const q = {
        gte(c, v) { etat.filtres.push((l) => l[c] >= v); return q; },
        lt(c, v) { etat.filtres.push((l) => l[c] < v); return q; },
        order(c) { etat.ordre.push(c); return q; },
        range(a, b) { etat.range = [a, b]; return q; },
        then(res, rej) {
          const page = etat.range ? etat.range[0] / 1000 + 1 : 1;
          if (erreurPage === page) return Promise.resolve({ data: null, error: { message: 'délai dépassé' } }).then(res, rej);
          let r = lignes.filter((l) => etat.filtres.every((f) => f(l)));
          if (etat.ordre.length) r = [...r].sort((x, y) => (x.created_at < y.created_at ? -1 : x.created_at > y.created_at ? 1 : x.user_id < y.user_id ? -1 : 1));
          r = etat.range ? r.slice(etat.range[0], etat.range[1] + 1) : r.slice(0, 1000);
          return Promise.resolve({ data: r, error: null }).then(res, rej);
        },
      };
      return q;
    },
  };
}
// 3 777 comptes (le compte du 15/11), dans l'ordre PHYSIQUE (les anciens d'abord) ; les 16 inscrits de la « veille » à la fin.
const LIGNES = Array.from({ length: 3777 }, (_, i) => {
  const veille = i >= 3777 - 16;
  const d = veille ? new Date(Date.UTC(2026, 10, 14, 1 + (i % 16), 0, 0)) : new Date(Date.UTC(2026, 3, 1) + i * 3_600_000);
  return { user_id: `u-${String(i).padStart(5, '0')}`, user_email: `x${i}@ex.fr`, lang: 'fr', is_premium: false, created_at: d.toISOString() };
});

console.log('1. La lecture des candidats (_shared/candidats-tunnel.js)');
const mod = await import('../supabase/functions/_shared/candidats-tunnel.js').catch((e) => ({ erreur: e }));
ok(!mod.erreur && typeof mod.lireCandidatsTunnel === 'function', '_shared/candidats-tunnel.js : lireCandidatsTunnel existe');
if (!mod.erreur) {
  const b = baseSimulee(LIGNES);
  const tous = await mod.lireCandidatsTunnel(b);
  ok(tous.length === 3777, `liste entière lue : ${tous.length} sur 3 777 (jamais tronquée à 1 000)`);
  ok(new Set(tous.map((l) => l.user_id)).size === 3777, 'aucun doublon entre deux pages (ordre stable : inscription puis id)');
  ok(b.appels.every((a) => a.range && a.ordre.includes('created_at') && a.ordre.includes('user_id')), 'chaque page : ordre stable et tranche explicite');
  const b2 = baseSimulee(LIGNES);
  const veille = await mod.lireCandidatsTunnel(b2, { depuis: new Date(Date.UTC(2026, 10, 14)), avant: new Date(Date.UTC(2026, 10, 15)) });
  ok(veille.length === 16 && b2.appels.length === 1, `fenêtre de la règle J+1 filtrée par la base : ${veille.length} inscrits de la veille, 1 page`);
  let leve = null;
  try { await mod.lireCandidatsTunnel(baseSimulee(LIGNES, { erreurPage: 3 })); } catch (e) { leve = e; }
  ok(leve && /page 3/.test(leve.message), 'une page illisible arrête tout (jamais une liste partielle prise pour la liste entière)');

  console.log('2. Le plafond de 2 mails / 24 h (plafondTunnel)');
  const t = Date.parse('2026-11-15T09:00:00Z');
  const h = (x) => new Date(t - x * 3_600_000).toISOString();
  const p = mod.plafondTunnel([
    { user_id: 'a', email_type: 'welcome', sent_at: h(20) },
    { user_id: 'b', email_type: 'welcome', sent_at: h(20) }, { user_id: 'b', email_type: 'job_pending_relaunch', sent_at: h(3) },
    { user_id: 'c', email_type: 'vente:5444', sent_at: h(2) }, { user_id: 'c', email_type: 'vente:5552', sent_at: h(1) },
    { user_id: 'd', email_type: 'welcome', sent_at: h(30) }, { user_id: 'd', email_type: 'maintenance', sent_at: h(25) },
    // (cas le plus fréquent, 122 inscrits sur 364 du 01 au 14/11) welcome + le lien d'installation qu'elle a DEMANDÉ.
    { user_id: 'e', email_type: 'welcome', sent_at: h(22) }, { user_id: 'e', email_type: 'extension_link', sent_at: h(21) },
  ], t);
  ok(p.peut('e') && p.compte('e') === 1, 'welcome + lien d\'installation DEMANDÉ : « comment ça marche » part (un mail demandé n\'est pas de notre initiative)');
  ok(p.peut('a') && p.compte('a') === 1, 'un welcome reçu hier : « comment ça marche » peut partir (2e mail)');
  ok(!p.peut('b'), 'deux mails de notre initiative en 24 h : plus rien');
  ok(p.peut('c') && p.compte('c') === 0, 'les mails de VENTE ne comptent pas (même liste que la porte ponctuelle)');
  ok(p.peut('d') && p.compte('d') === 0, 'au-delà de 24 h : ne compte plus');
  p.noter('a', 'how_it_works');
  ok(!p.peut('a'), 'un mail parti dans CE passage compte aussitôt');
}

console.log('3. email-tunnel s\'en sert, partout');
const et = lire('supabase/functions/email-tunnel/index.ts');
ok(/import \{[^}]*lireCandidatsTunnel[^}]*\} from "\.\.\/_shared\/candidats-tunnel\.js"/.test(et), 'email-tunnel importe lireCandidatsTunnel');
ok(!/rpc\(\s*["']email_tunnel_candidates["']/.test(et), 'plus AUCUN rpc nu à email_tunnel_candidates (le blast manuel compris)');
ok(/lireCandidatsTunnel\(supabase, \{ depuis: dayMinus1, avant: todayUTC \}\)/.test(et), 'J+1 : seulement la fenêtre de la règle (inscrits de la veille) — aucun rattrapage');
ok(/\.select\("user_id, email_type, sent_at"\)/.test(et), 'les email_logs des cibles portent sent_at (le plafond se compte sur 24 h)');
const j1 = et.slice(et.indexOf('// ── Trigger 1: J+1 welcome'), et.indexOf('return new Response(JSON.stringify({ success: true'));
ok((j1.match(/if \(!plafond\.peut\(user\.user_id\)\)/g) ?? []).length === 2, 'welcome J+1 et « comment ça marche » : le plafond est vérifié avant chacun');
ok((j1.match(/plafond\.noter\(user\.user_id, "(welcome|how_it_works)"\)/g) ?? []).length === 2, 'chaque mail parti est compté aussitôt');
ok((j1.match(/alreadySent\(user\.user_id, "marketing_optout"\)/g) ?? []).length === 2 && /categorie: "marketing"/.test(j1), 'désinscriptions respectées (registre + porte marketing)');

console.log(`\n${ko ? '✗' : '✓'} ${n - ko} vert(s), ${ko} rouge(s) sur ${n}`);
process.exit(ko ? 1 : 0);
