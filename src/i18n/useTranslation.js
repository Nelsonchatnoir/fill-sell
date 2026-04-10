import { translations } from './translations';

export function useTranslation(lang) {
  const dict = translations[lang] || translations['fr'];
  return {
    t: (key) => dict[key] ?? key,
    tpl: (key, vars) => {
      let str = dict[key] ?? key;
      Object.entries(vars).forEach(([k, v]) => {
        str = str.replace(`{${k}}`, v);
      });
      // handle {s} plural helper: replace {s} with 's' if last {n} > 1, else ''
      if (str.includes('{s}')) {
        const nMatch = str.match(/(\d+)/);
        const n = nMatch ? parseInt(nMatch[1]) : 0;
        str = str.replace(/\{s\}/g, n > 1 ? 's' : '');
      }
      return str;
    },
  };
}
