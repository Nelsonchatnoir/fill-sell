// Banc, diagnostic seulement : note quelles props de StockTab changent d'identité à chaque rendu d'App.
export default {
  name: 'diag',
  transform(code, id) {
    if (!id.split('\\').join('/').endsWith('src/tabs/StockTab.jsx')) return null;
    return code.replace('export default StockTab;',
      'const __cmp = (a, b) => { const d = Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]); (window.__stockDiff ||= []).push(d); return d.length === 0; };\nexport default memo(StockTab.type, __cmp);');
  },
};
