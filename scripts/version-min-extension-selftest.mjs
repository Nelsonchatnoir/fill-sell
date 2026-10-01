import assert from 'node:assert/strict';
import { EXTENSION_MIN_BUILD,posteExtensionCompatible } from '../supabase/functions/_shared/version-min-extension.js';
assert.equal(posteExtensionCompatible('v0.6.47 · 2026-09-19T18:50:24Z+ancien'),false);
assert.equal(posteExtensionCompatible('2026-09-25T21:40:31Z+9ea22dd · v0.6.69'),false);
assert.equal(posteExtensionCompatible('2026-09-24T14:34:45Z+ancien'),false);
assert.equal(posteExtensionCompatible(EXTENSION_MIN_BUILD+'+abc1234'),true);
// (02/10) Le minimum est la 0.6.81 : 0.6.75, 0.6.79 et 0.6.80 sont sous le seuil,
// 0.6.81, 0.6.82 et la 0.6.83 du poste de Nico au-dessus.
assert.equal(posteExtensionCompatible('0.6.75 · 2026-09-27T20:16:30Z+66a8887'),false);
assert.equal(posteExtensionCompatible('2026-09-28T21:44:46Z+52b214b · v0.6.79'),false);
assert.equal(posteExtensionCompatible('2026-09-30T13:21:09Z+4f5662a · v0.6.80'),false);
assert.equal(posteExtensionCompatible('2026-09-30T20:16:41Z+73c4929 · v0.6.81'),true);
assert.equal(posteExtensionCompatible('2026-10-01T10:50:14Z+3f3ff91 · v0.6.82'),true);
assert.equal(posteExtensionCompatible('2026-10-01T17:33:08Z+9411980'),true);
assert.equal(posteExtensionCompatible(''),false);
assert.equal(posteExtensionCompatible('0.6.99'),false);
assert.equal(posteExtensionCompatible('2026-99-99T99:99:99Z'),false);
console.log('Version du poste appelant, borne exacte et build inconnu : OK');
