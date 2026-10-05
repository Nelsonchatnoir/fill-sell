// Les règles du pool sont UNE source : supabase/functions/_shared/cloud-pool.js
// (testée par npm run selftest:cloud-pool, miroir de la migration du socle).
// Dans l'image Docker, le fichier est copié dans lib/ au déploiement ; dans le
// dépôt (tests), il est lu à sa place.
export async function chargerRegles() {
  try {
    return await import('../lib/cloud-pool.js');
  } catch {
    return import('../../supabase/functions/_shared/cloud-pool.js');
  }
}
