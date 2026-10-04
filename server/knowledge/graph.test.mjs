import { test } from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeGraph } from './graph.mjs';
import { resolveLinks } from './links.mjs';

test('graph keeps isolated notes, deduplicates real links and never invents missing edges', async () => {
  const notes = [{ path: 'AI/A.md', title: 'A' }, { path: 'AI/B.md', title: 'B' }, { path: 'Life/C.md', title: 'C' }];
  const graph = await knowledgeGraph({ list: async () => notes, status: async () => ({ vaultId: 'test' }), read: async path => ({ content: path === 'AI/A.md' ? '[[B]] [[B|alias]] [[Missing]] [[A]] `[[C]]`' : '' }) });
  assert.equal(graph.nodes.length, 3);
  assert.deepEqual(graph.edges, [{ source: 'AI/A.md', target: 'AI/B.md' }]);
  assert.equal(graph.unresolved, 1);
});

test('Notion relative Markdown links resolve encoded names while external, image and code links do not become edges', () => {
  const links = resolveLinks('[Child](../AI/%E6%A8%A1%E5%9E%8B.md) [Other](https://notion.so/p) ![Image](x.png) `[Fake](fake.md)` [PDF](book.pdf)', 'Notion/Home/Root.md', [{ path: 'Notion/AI/模型.md' }]);
  assert.equal(links.length, 2);
  assert.equal(links[0].path, 'Notion/AI/模型.md');
  assert.equal(links[1].status, 'attachment');
});
