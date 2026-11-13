// ═══════════════════════════════════════════════════════════════════════════
// VERROU — LES ALERTES DE L'ORCHESTRATEUR CLOUD PARTENT À SUPPORT@, ET À RIEN D'AUTRE (13/11/2026, agent ALERTE)
//   npm run selftest:alertes-cloud-service-role
// ═══════════════════════════════════════════════════════════════════════════
// Le défaut (journal de l'orchestrateur, 13/11) : serveur-cloud/src/alertes.js appelle envoyer_mail_ponctuel par
// PostgREST avec la clé de service ; la fonction n'est exécutable que par postgres ({postgres=X/postgres}, migration
// 20260923140000 l. 113-117, voulu : aucun code serveur n'écrit à un client) → « permission denied for function
// envoyer_mail_ponctuel » à chaque alerte : 178 alertes dans cloud_pool_alertes depuis le 01/11, 0 mail « cloud_alerte ».
// La règle (migration 20261113224500, feu vert de Nico « la migration de droits ») : la clé de service (claims
// role = service_role, ou session « authenticator » = PostgREST) n'envoie QUE catégorie « support » à support@fillsell.app ;
// postgres (l'opérateur) : rien ne change ; anon / authenticated : aucun droit. L'orchestrateur n'est pas touché.
// A. le code (l'appel de l'orchestrateur, l'adresse — une seule valeur partout), la migration, l'inverse ;
// B. le banc sur un Postgres JETABLE (scripts/essais/20261113224500_banc.mjs) : avant / migration / inverse / rejouée.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = process.env.FILLSELL_RACINE ? path.resolve(process.env.FILLSELL_RACINE) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => { try { return fs.readFileSync(path.join(RACINE, p), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const sansCommentaires = (sql) => sql.replace(/--.*$/gm, '');

let ko = 0, n = 0;
const ok = (c, nom, d) => { n++; if (c) console.log(`  ✓ ${nom}`); else { ko++; console.log(`  ✗ ${nom}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 700)}`}`); } };

const B = await import(pathToFileURL(path.join(RACINE, 'scripts/essais/20261113224500_banc.mjs')).href);

console.log('\nA. LE CODE, LA MIGRATION, L\'INVERSE');
const alertes = lire('serveur-cloud/src/alertes.js');
ok(/base\.rpc\('envoyer_mail_ponctuel',\s*\{\s*p_destinataires:\s*\[\{\s*email:\s*config\.alertesDestinataire,\s*user_id:\s*null/.test(alertes)
  && /p_categorie:\s*'support'/.test(alertes) && /p_type:\s*'cloud_alerte'/.test(alertes),
'l\'orchestrateur (alertes.js, non touché) : envoyer_mail_ponctuel → config.alertesDestinataire, catégorie « support », type cloud_alerte');
const config = lire('serveur-cloud/src/config.js');
const adresseConfig = config.match(/alertesDestinataire:\s*env\.ALERTES_DESTINATAIRE\?\.trim\(\)\s*\|\|\s*'([^']+)'/)?.[1];
const adresseEnv = lire('serveur-cloud/deploiement/env.exemple').match(/^ALERTES_DESTINATAIRE=(.+)$/m)?.[1]?.trim();
const adresseNico = lire('supabase/functions/_shared/cloud-alerte-nico.js').match(/ALERTE_CLOUD_DESTINATAIRE = '([^']+)'/)?.[1];
const mig = lire(B.MIGRATION);
const adresseSql = mig.match(/v_support constant text := '([^']+)';/)?.[1];
ok(adresseConfig === 'support@fillsell.app' && adresseEnv === adresseConfig && adresseNico === adresseConfig && adresseSql === adresseConfig,
  'UNE adresse : ALERTES_DESTINATAIRE (config.js, env.exemple) = ALERTE_CLOUD_DESTINATAIRE (_shared/cloud-alerte-nico.js) = v_support de la migration (aucune source en base)',
  { adresseConfig, adresseEnv, adresseNico, adresseSql });
ok(mig.length > 0, `migration présente : ${B.MIGRATION}`);
const code = sansCommentaires(mig);
ok(code.includes(`'${B.MD5_PROD}'`) && code.includes(`'${B.MD5_MIGREE}'`) && /RAISE EXCEPTION 'envoyer_mail_ponctuel a changé en prod[^']*ON S''ARRÊTE/.test(code),
  'garde : md5 de la prod lue le 13/11 (ou la définition migrée, rejeu) et droits d\'avant, sinon ON S\'ARRÊTE');
ok(/v_role_api := nullif\(current_setting\('request\.jwt\.claims', true\), ''\)::jsonb ->> 'role';/.test(code)
  && /if v_role_api = 'service_role' or session_user = 'authenticator' then/.test(code),
'le signal : role des claims PostgREST = service_role, ou session ouverte par authenticator (la connexion de PostgREST)');
ok(code.includes(`raise exception '${B.REFUS.replace("'", "''")}'`) && /p_categorie is distinct from 'support'/.test(code),
  `refus : « ${B.REFUS} » (catégorie autre que support, ou un destinataire autre que support@)`);
const iGarde = code.indexOf('v_role_api := '), iProd = code.indexOf("if p_categorie is null or p_categorie not in ('marketing', 'support') then");
ok(iGarde > 0 && iProd > iGarde, 'la garde est EN TÊTE du corps, avant les contrôles de la prod');
const grants = [...code.matchAll(/GRANT\s+[^;]+;/gi)].map((m) => m[0].replace(/\s+/g, ' '));
ok(grants.length === 1 && /GRANT EXECUTE ON FUNCTION public\.envoyer_mail_ponctuel\(jsonb, text, text, text, text, boolean\) TO service_role;/.test(grants[0]),
  'un seul GRANT : EXECUTE à service_role (jamais anon, authenticated ni PUBLIC)', grants);
ok(/REVOKE ALL ON FUNCTION public\.envoyer_mail_ponctuel\(jsonb, text, text, text, text, boolean\) FROM PUBLIC, anon, authenticated;/.test(code),
  'anon, authenticated, PUBLIC : REVOKE redit');
const inv = lire(B.INVERSE);
const defInv = inv.slice(inv.indexOf('CREATE OR REPLACE FUNCTION'), inv.indexOf('$function$\n;') + '$function$\n'.length);
ok(createHash('md5').update(defInv).digest('hex') === B.MD5_PROD, `inverse : la définition de la prod à l'octet près (md5 ${B.MD5_PROD})`);
ok(/REVOKE ALL ON FUNCTION public\.envoyer_mail_ponctuel\(jsonb, text, text, text, text, boolean\) FROM PUBLIC, anon, authenticated, service_role;/.test(inv)
  && /GRANT EXECUTE ON FUNCTION public\.envoyer_mail_ponctuel\(jsonb, text, text, text, text, boolean\) TO postgres;/.test(inv)
  && inv.includes(B.COMMENTAIRE_PROD), 'inverse : droits d\'avant ({postgres=X/postgres}) et commentaire de la prod');
ok(/revoke all on function public\.envoyer_mail_ponctuel\(jsonb, text, text, text, text, boolean\) from service_role;/.test(lire('supabase/migrations/20260923140000_envoi_ponctuel_et_index_campagnes.sql')),
  'la migration du 23/09 (historique) n\'est pas réécrite');

console.log('\nB. LE BANC (Postgres jetable)');
await B.executer(ok);

console.log(ko ? `\n${ko} ÉCHEC(S) sur ${n}` : `\nTOUT VERT (${n})`);
process.exit(ko ? 1 : 0);
