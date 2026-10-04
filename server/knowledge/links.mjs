import { posix } from 'node:path';

export function extractLinks(content) {
  const text = content.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '').replace(/`[^`\n]*`/g, '');
  const links = [];
  for (const match of text.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
    const [reference, alias] = match[1].split('|');
    const [target, ...heading] = reference.trim().split('#');
    links.push({ target: target.trim(), label: alias?.trim() || target.trim() || reference, heading: heading.join('#') });
  }
  for (const match of text.matchAll(/(?<!!)\[([^\]\n]+)\]\(([^\s)]+)\)/g)) {
    const url = match[2];
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i.test(url)) continue;
    const [path, ...heading] = url.split('#');
    let target;
    try { target = decodeURIComponent(path); } catch { continue; }
    links.push({ target, label: match[1], heading: heading.join('#'), markdown: true });
  }
  return links;
}

export function resolveLinks(content, source, notes) {
  const paths = new Set(notes.map(n => n.path));
  return extractLinks(content).map(link => {
    if (link.markdown) {
      const resolved = link.target ? posix.normalize(posix.join(posix.dirname(source), link.target)) : source;
      const candidates = paths.has(resolved) ? [resolved] : [];
      const attachment = !!link.target && !/\.md$/i.test(link.target);
      return { ...link, status: candidates.length ? 'resolved' : attachment ? 'attachment' : 'missing', path: candidates[0] || null, candidates };
    }
    const target = link.target.replace(/\.md$/i, '');
    const sibling = target ? posix.normalize(posix.join(posix.dirname(source), target + '.md')) : source;
    const exact = target + '.md';
    let candidates;
    if (paths.has(sibling)) candidates = [sibling];
    else if (paths.has(exact)) candidates = [exact];
    else candidates = notes.filter(n => posix.basename(n.path, '.md') === target).map(n => n.path);
    if (!candidates.length && !/\.md$/i.test(link.target) && /\.[a-z\d]+$/i.test(target)) return { ...link, status: 'attachment', path: null, candidates: [] };
    const status = candidates.length === 1 ? 'resolved' : candidates.length > 1 ? 'ambiguous' : 'missing';
    return { ...link, status, path: status === 'resolved' ? candidates[0] : null, candidates };
  });
}
