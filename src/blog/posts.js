import { parseFrontmatter, slugFromPath, sortPosts } from './frontmatter';

const rawFiles = import.meta.glob('./*.md', { query: '?raw', import: 'default', eager: true });

export const posts = sortPosts(
  Object.entries(rawFiles).map(([path, raw]) => {
    const { data, content } = parseFrontmatter(raw);
    return { slug: slugFromPath(path), ...data, content };
  }),
);

export function getPostBySlug(slug) {
  return posts.find(p => p.slug === slug) ?? null;
}
