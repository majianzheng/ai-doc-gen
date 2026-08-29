import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/index.js'],
  env: { ...process.env, DOC_MCP_TRANSPORT: 'stdio', STORAGE_MODE: 'local' },
});
const client = new Client({ name: 'stdio-test', version: '1.0.0' });
await client.connect(transport);

const tools = await client.listTools();
console.log('STDIO TOOLS:', tools.tools.length);

const res = await client.callTool({ name: 'generate_excel_xlsx', arguments: { sheets: [{ name: 'Sheet1', rows: [{ a: 1, b: 'x' }] }] } });
console.log('XLSX via stdio:', JSON.parse(res.content[0].text).url);

const res2 = await client.callTool({ name: 'generate_powerpoint_pptx', arguments: { title: 'Deck', slides: [{ title: 'S1', bullets: ['a', 'b'] }] } });
console.log('PPTX via stdio:', JSON.parse(res2.content[0].text).url);

const res3 = await client.readResource({ uri: 'documents://formats' });
console.log('RESOURCE:', res3.contents[0].text.slice(0, 120));

await client.close();
console.log('STDIO DONE');
