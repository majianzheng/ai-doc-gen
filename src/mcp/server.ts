import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { DocumentService } from '../core.js';
import { docxSchema, pdfSchema, xlsxSchema, pptxSchema, listGenerators } from '../docs/index.js';
import type { GeneratedDocument } from '../docs/types.js';

/**
 * Builds and returns the MCP server with one tool per supported document
 * format. Tool inputs are described with zod schemas so AI agents can reliably
 * produce valid payloads; every tool returns a public download link.
 */
export function createMcpServer(service: DocumentService): McpServer {
  const server = new McpServer({
    name: 'ai-doc',
    version: '1.0.0',
  });

  server.registerTool(
    'generate_word_docx',
    {
      title: 'Generate Word (.docx)',
      description:
        'Create a Microsoft Word document from structured content (title, paragraphs with headings/bullets/alignment, tables, footer). Returns a public download link.',
      inputSchema: docxSchema,
    },
    async (args) => toMcpResult(await service.generate('docx', args)),
  );

  server.registerTool(
    'generate_pdf',
    {
      title: 'Generate PDF',
      description:
        'Create a PDF document from structured content (title, paragraphs with headings/bullets, tables, footer). Returns a public download link.',
      inputSchema: pdfSchema,
    },
    async (args) => toMcpResult(await service.generate('pdf', args)),
  );

  server.registerTool(
    'generate_excel_xlsx',
    {
      title: 'Generate Excel (.xlsx)',
      description:
        'Create an Excel workbook with one or more sheets of tabular data. Returns a public download link.',
      inputSchema: xlsxSchema,
    },
    async (args) => toMcpResult(await service.generate('xlsx', args)),
  );

  server.registerTool(
    'generate_powerpoint_pptx',
    {
      title: 'Generate PowerPoint (.pptx)',
      description:
        'Create a PowerPoint presentation with a title slide and content slides (title/subtitle/bullets). Returns a public download link.',
      inputSchema: pptxSchema,
    },
    async (args) => toMcpResult(await service.generate('pptx', args)),
  );

  server.registerResource(
    'documents://formats',
    'documents://formats',
    {
      title: 'Supported document formats',
      description: 'Metadata about all document formats the ai-doc service can generate.',
      mimeType: 'application/json',
    },
    () => ({
      contents: [{
        uri: 'documents://formats',
        mimeType: 'application/json',
        text: JSON.stringify(listGenerators().map((g) => ({
          format: g.format,
          mimeType: g.mimeType,
          extension: g.extension,
        })), null, 2),
      }],
    }),
  );

  return server;
}

function toMcpResult(doc: GeneratedDocument) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            format: doc.format,
            filename: doc.filename,
            url: doc.url,
            size: doc.size,
            mimeType: doc.mimeType,
            createdAt: doc.createdAt,
          },
          null,
          2,
        ),
      },
    ],
  };
}

export async function runMcpStdio(service: DocumentService): Promise<void> {
  const server = createMcpServer(service);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
