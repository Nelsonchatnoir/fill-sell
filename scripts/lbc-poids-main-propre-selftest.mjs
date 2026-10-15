// selftest:lbc-poids-main-propre — (15/10) une republication Leboncoin ne
// reprend jamais le « poids » d'une annonce en main propre (40 000 g gardés par
// Leboncoin) : 7 republications parties en « De 30 kg à 40 kg ».
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { poidsColisDeLAnnonceLbc as p } from '../supabase/functions/_shared/lbc-poids-annonce.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const A = (o) => Object.entries(o).map(([key, v]) => (Array.isArray(v) ? { key, values: v, value: v.join(',') } : { key, value: String(v) }));

// Les captures réelles du 15/10 (Louis, linda) : main propre, 40000.
ok(p(A({ estimated_parcel_weight: 40000, shipping_type: 'face_to_face', shippable: 'false' })).grammes === null, 'main propre 40000 → ignoré');
ok(p(A({ estimated_parcel_weight: 40000, shipping_type: 'face_to_face', shippable: 'false' })).raison === 'main_propre', 'raison main_propre');
ok(p(A({ estimated_parcel_weight: 100000, shipping_type: ['face_to_face'] })).grammes === null, '100000 face_to_face → ignoré');
ok(p(A({ estimated_parcel_weight: 2000, shippable: 'false' })).grammes === null, 'shippable false → ignoré');
// Livrable : le poids de l'annonce reste repris (comportement d'avant, inchangé).
ok(p(A({ estimated_parcel_weight: 500, shipping_type: ['colissimo', 'mondial_relay'], shippable: 'true' })).grammes === 500, 'livrable 500 g → repris');
ok(p(A({ estimated_parcel_weight: 1200, shipping_type: ['face_to_face', 'colissimo'] })).grammes === 1200, 'main propre ET livraison → repris');
ok(p(A({ estimated_parcel_weight: 750 })).grammes === 750, 'sans info de livraison → repris (comme avant)');
// Absent / illisible.
ok(p(A({ shipping_type: 'colissimo' })).grammes === null, 'absent → null');
ok(p(A({ estimated_parcel_weight: 'abc' })).grammes === null, 'illisible → null');
ok(p(null).grammes === null, 'capture absente → null');

// Câblage : get-pending-jobs ne lit plus le poids brut de l'annonce.
const gpj = readFileSync(new URL('../supabase/functions/get-pending-jobs/index.ts', import.meta.url), 'utf8');
ok(/import \{ poidsColisDeLAnnonceLbc \} from "\.\.\/_shared\/lbc-poids-annonce\.js";/.test(gpj), 'gpj importe la règle');
ok(!/attrLbc\("estimated_parcel_weight"\)/.test(gpj), 'gpj ne lit plus estimated_parcel_weight en brut');
ok((gpj.match(/poidsAnnonce\.grammes/g) ?? []).length >= 2, 'les deux lectures passent par la règle');

console.log(`✓ selftest:lbc-poids-main-propre — ${n} assertions`);
