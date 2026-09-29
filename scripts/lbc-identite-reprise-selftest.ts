import { estJobIdentiteLbc, preuveIdentiteLbcApresBlocage } from '../supabase/functions/_shared/lbc-identite.ts';

const maintenant = Date.parse('2026-09-29T12:00:00Z');
const job = {
  platform: 'leboncoin', action: 'publish', status: 'needs_user',
  platform_fields: {
    needs_user_source: 'lbc_escrow_identite',
    identite_lbc_bloquee_le: '2026-09-29T10:00:00Z',
    last_diagnostic: { quoi: 'lbc_escrow_identite', at: '2026-09-29T10:00:00Z' },
  },
};
let erreurs = 0;
const verifier = (nom: string, condition: boolean) => {
  console.log(`  ${condition ? '✓' : '✗'} ${nom}`);
  if (!condition) erreurs++;
};

console.log('\n1. Le motif officiel et le diagnostic exact historique sont reconnus');
verifier('motif officiel', estJobIdentiteLbc(job));
verifier('ancien source=relancer, diagnostic exact', estJobIdentiteLbc({ ...job, platform_fields: { needs_user_source: 'relancer', last_diagnostic: job.platform_fields.last_diagnostic } }));
verifier('un autre besoin utilisateur est ignoré', !estJobIdentiteLbc({ ...job, platform_fields: { needs_user_source: 'champ_a_choisir' } }));
verifier('un retrait est ignoré', !estJobIdentiteLbc({ ...job, action: 'delete' }));

console.log('\n2. Seule la preuve dédiée, fraîche et postérieure au mur réarme');
const preuve = (sessions: Record<string, unknown>) => preuveIdentiteLbcApresBlocage(job, sessions, maintenant);
verifier('session Leboncoin générale insuffisante', preuve({ leboncoin: true, checked_at_par_plateforme: { leboncoin: '2026-09-29T11:00:00Z' } }) === null);
verifier('identité absente', preuve({ leboncoin_identite: false, checked_at_par_plateforme: { leboncoin_identite: '2026-09-29T11:00:00Z' } }) === null);
verifier('preuve antérieure au mur', preuve({ leboncoin_identite: true, checked_at_par_plateforme: { leboncoin_identite: '2026-09-29T09:59:59Z' } }) === null);
verifier('preuve dédiée positive', preuve({ leboncoin_identite: true, checked_at_par_plateforme: { leboncoin_identite: '2026-09-29T11:00:00Z' } }) === Date.parse('2026-09-29T11:00:00Z'));

if (erreurs) {
  console.error(`\n❌ reprise identité Leboncoin : ${erreurs} défaut(s)`);
  Deno.exit(1);
}
console.log('\n✅ reprise identité Leboncoin : aucun réveil sans preuve exacte');
