// Le journal de l'orchestrateur : une ligne JSON par évènement, sur la sortie
// standard (docker logs). ⛔ Jamais un secret : les jetons, cookies, URL de proxy
// et clés sont masqués AVANT l'écriture, quelle que soit la forme du message.

const MOTIFS = [
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,      // JWT
  /(https?:\/\/)[^:@/\s]+:[^@/\s]+@/g,                                  // identifiants dans une URL
  /("?(?:access_token|refresh_token|token|cookie|value|chiffre|password|secret|apikey|authorization)"?\s*[:=]\s*)"[^"]*"/gi,
  /(Bearer\s+)[A-Za-z0-9._-]{12,}/g,
];

export function masquer(texte) {
  let s = String(texte ?? '');
  s = s.replace(MOTIFS[0], '[jwt]');
  s = s.replace(MOTIFS[1], '$1***:***@');
  s = s.replace(MOTIFS[2], '$1"***"');
  s = s.replace(MOTIFS[3], '$1***');
  return s;
}

const court = (u) => (typeof u === 'string' ? u.slice(0, 8) : u);

export function journal(niveau, evenement, details = {}) {
  const ligne = { le: new Date().toISOString(), niveau, evenement };
  for (const [k, v] of Object.entries(details ?? {})) {
    ligne[k] = k === 'user' || k === 'compte' ? court(v) : v;
  }
  const brut = masquer(JSON.stringify(ligne));
  (niveau === 'erreur' ? process.stderr : process.stdout).write(brut + '\n');
}

export const info = (e, d) => journal('info', e, d);
export const alerte = (e, d) => journal('alerte', e, d);
export const erreur = (e, d) => journal('erreur', e, d);
