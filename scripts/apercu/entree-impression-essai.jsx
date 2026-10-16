// Essai de découpage du build (jamais livré) : une entrée qui importe le module
// d'impression de façon STATIQUE, comme l'app l'intégrera — le moteur, pdf.js et
// pdf-lib doivent rester dans des chunks à part, chargés à l'ouverture seulement.
import { createRoot } from 'react-dom/client';
import { ApercuBordereau, BoutonToutImprimer } from '../../src/messagerie/impression/index.js';
createRoot(document.getElementById('r')).render(<div><BoutonToutImprimer copies={[]} /><ApercuBordereau ouvert={false} /></div>);
