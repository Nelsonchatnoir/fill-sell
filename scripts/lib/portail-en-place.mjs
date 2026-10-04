// Pour les autotests rendus côté serveur (scripts/palier-selftest.mjs) : le
// SEUL import de src/ depuis 'react-dom' est createPortal. Côté serveur, le
// portail n'existe pas (react-dom/server) : on rend son contenu EN PLACE —
// c'est le contenu qu'on vérifie, pas l'endroit où il se monte.
export function createPortal(enfants) { return enfants; }
export default { createPortal };
