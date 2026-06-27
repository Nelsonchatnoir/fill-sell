const rawFiles = import.meta.glob('./*.md', { query: '?raw', import: 'default', eager: true });

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, content: raw };
  const data = {};
  match[1].split('\n').forEach(line => {
    const colon = line.indexOf(':');
    if (colon === -1) return;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim().replace(/^["']|["']$/g, '');
    if (key) data[key] = val;
  });
  return { data, content: match[2] };
}

export const posts = Object.entries(rawFiles)
  .map(([path, raw]) => {
    const slug = path.replace('./', '').replace('.md', '');
    const { data, content } = parseFrontmatter(raw);
    return { slug, ...data, content };
  })
  .sort((a, b) => new Date(b.date) - new Date(a.date));

export function getPostBySlug(slug) {
  return posts.find(p => p.slug === slug) ?? null;
}
