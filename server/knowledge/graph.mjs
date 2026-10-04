import { resolveLinks } from './links.mjs';

export async function knowledgeGraph(vault) {
  const notes = await vault.list();
  const edges = new Map();
  let unresolved = 0;
  for (const note of notes) {
    let content;
    try { content = (await vault.read(note.path)).content; }
    catch (e) { if (e.code === 'NOT_FOUND') continue; throw e; }
    for (const link of resolveLinks(content, note.path, notes)) {
      if (link.status === 'missing' || link.status === 'ambiguous') unresolved++;
      if (link.path && link.path !== note.path) {
        const key = JSON.stringify([note.path, link.path]);
        edges.set(key, { source: note.path, target: link.path });
      }
    }
  }
  return { vaultId: (await vault.status()).vaultId, nodes: notes.map(({ path, title }) => ({ path, title })), edges: [...edges.values()], unresolved };
}
