// (30/10, lot D) L'ÉTAT DU COFFRE ET LA ROTATION DE SA CLÉ — sans jamais afficher une valeur.
// Dans le conteneur orchestrateur :
//   docker compose exec -T orchestrateur node outils/coffre-etat.mjs              → par ligne : compte (8 car.),
//        plateforme, version de clé, lisible ou non avec le trousseau (COFFRE_CLE + COFFRE_CLES_ANCIENNES)
//   docker compose exec -T orchestrateur node outils/coffre-etat.mjs --rechiffrer → chaque ligne LISIBLE écrite avec
//        une ANCIENNE clé est rechiffrée avec la clé COURANTE (même contenu, même drapeau « connecté »)
// La rotation : COFFRE_CLES_ANCIENNES="<version>:<ancienne clé>", COFFRE_CLE=<nouvelle>, COFFRE_CLE_VERSION=<version+1>
// dans /srv/fillsell-cloud/.env, redémarrage, puis --rechiffrer ; l'ancienne clé ne quitte le trousseau qu'une fois
// plus aucune ligne à sa version.
import { createClient } from '@supabase/supabase-js';
import { lireConfig } from '../src/config.js';
import { creerCoffre } from '../src/coffre.js';

const config = lireConfig();
const base = createClient(config.supabaseUrl, config.cleService, { auth: { persistSession: false } });
const coffre = creerCoffre({ base, cle: config.cleCoffre, cleVersion: config.cleCoffreVersion, anciennes: config.clesCoffreAnciennes });
const rechiffrer = process.argv.includes('--rechiffrer');

const { data: lignes, error } = await base.from('cloud_coffre').select('user_id, plateforme, cle_version, connecte');
if (error) { console.error(`coffre illisible : ${error.message}`); process.exit(1); }
const users = [...new Set((lignes ?? []).map((l) => l.user_id))];
const bilan = { cle_courante: config.cleCoffreVersion, anciennes: Object.keys(config.clesCoffreAnciennes).map(Number), lignes: [], rechiffrees: 0 };
for (const u of users) {
  const lu = await coffre.lire(u);
  for (const [plateforme, v] of Object.entries(lu)) {
    const ligne = (lignes ?? []).find((l) => l.user_id === u && l.plateforme === plateforme);
    const r = { compte: u.slice(0, 8), plateforme, version: ligne?.cle_version ?? null, lisible: !v.illisible, connecte: ligne?.connecte === true };
    if (rechiffrer && !v.illisible && Number(ligne?.cle_version) !== Number(config.cleCoffreVersion)) {
      const { connecte: _c, maj_le: _m, cle_ancienne: _a, ...contenu } = v;
      await coffre.ecrire(u, plateforme, contenu, ligne?.connecte === true);
      r.rechiffree_en = config.cleCoffreVersion;
      bilan.rechiffrees++;
    }
    bilan.lignes.push(r);
  }
}
console.log(JSON.stringify(bilan, null, 2));
