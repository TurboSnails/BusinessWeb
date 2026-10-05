import { expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createCloudMcpServer } from '../../../server/knowledge/cloud-mcp'
import { cloudVault } from '../../../server/knowledge/cloud'

it('真实 SDK 工具调用限制转义后的 JSON 响应大小', async () => {
  const vault = cloudVault(async () => [], { revision: 1, generation: '11111111-1111-4111-8111-111111111111', vault_id: 'a'.repeat(64), graph: {}, synced_at: null })
  vault.read = async () => ({ content: '"'.repeat(1_100_000) })
  const server = createCloudMcpServer(vault)
  const client = new Client({ name: 'test', version: '1' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  try {
    await server.connect(a); await client.connect(b)
    const result = await client.callTool({ name: 'read_note', arguments: { path: 'test.md' } })
    expect(result.isError).toBe(true)
    expect(Buffer.byteLength(JSON.stringify({ jsonrpc: '2.0', id: 1, result }))).toBeLessThan(3_100_000)
    const list = await client.listTools()
    expect(list.tools).toHaveLength(5)
    expect(list.tools.every(t => t.annotations?.readOnlyHint)).toBe(true)
  } finally { await client.close(); await server.close() }
})
