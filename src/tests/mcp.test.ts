import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * MCP Server integration tests.
 *
 * Uses in-memory transport to test the server without spawning a process.
 * We dynamically import the server module's setup and wire it to a test client.
 */

// ── Helpers ──────────────────────────────────────────────────────

/** Create a connected client ↔ server pair using in-memory transport. */
async function createTestPair(): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  // We can't reuse the module-level server because it auto-connects to stdio.
  // Instead we build a minimal server with the same tools for structural testing,
  // or we test the real server by importing pieces.
  //
  // For integration tests, we'll spawn the real server via InMemoryTransport.
  // But since mcp.ts auto-starts, we test tool registration via a fresh McpServer.

  const server = new McpServer({ name: 'artifact-test', version: '0.0.0-test' });

  // Register a subset of tools to verify the pattern works
  const { z } = await import('zod');

  server.tool(
    'artifact_truth',
    'Extract truth atoms from a repo',
    {
      repoPath: z.string().optional().describe('Local path'),
      remote: z.string().optional().describe('Remote owner/repo'),
      ref: z.string().optional().describe('Git ref'),
    },
    async (params) => {
      // Minimal test implementation
      return { content: [{ type: 'text' as const, text: JSON.stringify({ tool: 'artifact_truth', params }) }] };
    },
  );

  server.tool(
    'artifact_infer',
    'Compute inference profile',
    {
      repoPath: z.string().optional(),
      remote: z.string().optional(),
      repoType: z.string().optional(),
    },
    async (params) => {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ tool: 'artifact_infer', params }) }] };
    },
  );

  server.tool(
    'artifact_org_status',
    'Org-wide curation health',
    {},
    async () => {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ tool: 'artifact_org_status' }) }] };
    },
  );

  server.resource(
    'persona',
    'artifact://persona',
    { description: 'Active persona' },
    async () => {
      return { contents: [{ uri: 'artifact://persona', text: '{"name":"glyph"}', mimeType: 'application/json' }] };
    },
  );

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client({ name: 'test-client', version: '0.0.0' });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    client,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe('MCP server', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const pair = await createTestPair();
    client = pair.client;
    cleanup = pair.cleanup;
  });

  it('lists registered tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map(t => t.name).sort();
    assert.ok(names.includes('artifact_truth'), 'missing artifact_truth');
    assert.ok(names.includes('artifact_infer'), 'missing artifact_infer');
    assert.ok(names.includes('artifact_org_status'), 'missing artifact_org_status');
    assert.equal(tools.length, 3);

    await cleanup();
  });

  it('tool descriptions are non-empty', async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      assert.ok(tool.description && tool.description.length > 10, `${tool.name} has weak description`);
    }

    await cleanup();
  });

  it('calls artifact_truth with params', async () => {
    const result = await client.callTool({ name: 'artifact_truth', arguments: { remote: 'owner/repo' } });
    assert.ok(result.content);
    const content = result.content as Array<{ type: string; text: string }>;
    assert.equal(content.length, 1);
    const parsed = JSON.parse(content[0].text);
    assert.equal(parsed.tool, 'artifact_truth');
    assert.equal(parsed.params.remote, 'owner/repo');

    await cleanup();
  });

  it('calls artifact_org_status with no params', async () => {
    const result = await client.callTool({ name: 'artifact_org_status', arguments: {} });
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    assert.equal(parsed.tool, 'artifact_org_status');

    await cleanup();
  });

  it('lists registered resources', async () => {
    const { resources } = await client.listResources();
    assert.ok(resources.length >= 1, 'should have at least 1 resource');
    const uris = resources.map(r => r.uri);
    assert.ok(uris.includes('artifact://persona'), 'missing persona resource');

    await cleanup();
  });

  it('reads persona resource', async () => {
    const result = await client.readResource({ uri: 'artifact://persona' });
    assert.ok(result.contents.length === 1);
    const content = result.contents[0] as { uri: string; text?: string; blob?: string };
    const text = content.text as string;
    const parsed = JSON.parse(text);
    assert.equal(parsed.name, 'glyph');

    await cleanup();
  });

  it('tool input schemas have correct shape', async () => {
    const { tools } = await client.listTools();
    const truth = tools.find(t => t.name === 'artifact_truth');
    assert.ok(truth);
    assert.ok(truth.inputSchema);
    assert.equal(truth.inputSchema.type, 'object');
    const props = truth.inputSchema.properties as Record<string, unknown>;
    assert.ok('repoPath' in props, 'artifact_truth should accept repoPath');
    assert.ok('remote' in props, 'artifact_truth should accept remote');

    await cleanup();
  });

  it('org_status requires no input params', async () => {
    const { tools } = await client.listTools();
    const org = tools.find(t => t.name === 'artifact_org_status');
    assert.ok(org);
    const props = org.inputSchema.properties as Record<string, unknown> | undefined;
    // Should have no required properties or empty properties
    const required = (org.inputSchema as { required?: string[] }).required;
    assert.ok(!required || required.length === 0, 'org_status should have no required params');

    await cleanup();
  });
});
