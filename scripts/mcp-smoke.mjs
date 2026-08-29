import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3111/mcp'));
const client = new Client({ name: 'test-client', version: '1.0.0' });
await client.connect(transport);

const tools = await client.listTools();
console.log('TOOLS:', tools.tools.map((t) => `${t.name} (${Object.keys(t.inputSchema?.properties ?? {}).join(',')})`).join('\n'));

const res = await client.callTool({
  name: 'generate_word_docx',
  arguments: { title: 'MCP Test', paragraphs: [{ text: 'Hello from MCP client', level: 1 }, { text: 'bullet', bullet: true }] },
});
console.log('CALL RESULT:', JSON.parse(res.content[0].text));

const res2 = await client.callTool({
  name: 'generate_pdf',
  arguments: { title: 'MCP PDF', paragraphs: [{ text: 'pdf body' }] },
});
console.log('PDF RESULT url:', JSON.parse(res2.content[0].text).url);

await client.close();
console.log('DONE');
