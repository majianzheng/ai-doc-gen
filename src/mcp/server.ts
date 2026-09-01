import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { DocumentService } from '../core.js';
import { docxSchema, pdfSchema, xlsxSchema, pptxSchema, listGenerators } from '../docs/index.js';
import type { GeneratedDocument } from '../docs/types.js';

/**
 * Builds and returns the MCP server with one tool per supported document
 * format. Tool descriptions are intentionally verbose: agents rely on them to
 * build valid payloads, so each description documents every field, the
 * supported image forms (SVG / base64 / URL), tables, style templates and a
 * complete JSON example. Every tool returns a public download link.
 */

const COMMON_IMAGE_DOC = [
  'images (array, optional): embed pictures into the document. Each image item must provide EXACTLY ONE source:',
  '  - data (string): base64-encoded image bytes, optionally prefixed with "data:image/png;base64," etc. (preferred, most reliable)',
  '  - url (string): an http(s) link to the image, downloaded by the service at generation time',
  '  - svg (string): raw SVG XML markup (kept vector in DOCX/PPTX; rasterized to PNG in PDF/XLSX)',
  '  optional per image: mimeType (needed only when `data` has no data: URL prefix, e.g. image/png, image/svg+xml),',
  '  width / height (px, omit to auto-size keeping the aspect ratio), align ("left"|"center"|"right"), caption (text under the figure).',
  '  Supported raster formats: PNG, JPEG, GIF, WebP, BMP.',
].join('\n');

const COMMON_PARAGRAPHS_DOC = [
  'paragraphs (array, optional): body content, in order. Each item:',
  '  { text: string (required), level: 1-6 (heading level; omit/0 = body text), bullet: bool, bold: bool, italic: bool,',
  '    align: "left"|"center"|"right"|"justify", fontSize: number (points), color: "#RRGGBB" }',
].join('\n');

const COMMON_TABLES_DOC = [
  'tables (array, optional): data tables. Each table:',
  '  { columns: [{ key: string, header: string }] (optional; omit to auto-derive from the first row keys),',
  '    rows: [{ <columnKey>: string | number | boolean | null }] (required, at least 1) }',
].join('\n');

const PDF_IMAGE_DOC = [
  'images (array, optional): embed pictures after the body content. Each image item provides EXACTLY ONE source:',
  '  - data (string): base64-encoded bytes, optionally a data: URI (preferred)',
  '  - url (string): http(s) link, downloaded at generation time',
  '  - svg (string): raw SVG markup (rasterized to PNG for PDF)',
  '  optional: mimeType, width / height (px), align ("left"|"center"|"right"), caption.',
  '  PDF supports PNG, JPEG and SVG images.',
].join('\n');

const COMMON_RETURN = [
  '',
  'Returns JSON: { "format", "filename", "url", "size", "mimeType", "createdAt" }.',
  'Give the user the final "url" (public download link) directly.',
].join('\n');

// Strong, early instruction so the model reliably passes a human-readable file
// name instead of relying on the (title/random) server-side fallback.
const FILENAME_RULE = [
  '',
  'IMPORTANT — always set "filename":',
  '- It must be the generated file\'s human-readable download name, WITHOUT file extension, e.g. "Q3经营报告", "发票明细", "2025年度总结".',
  '- Derive it from the document subject/title and keep it concise (<=60 chars). Use letters/digits/CJK, spaces, "-" or "_".',
  '- Never omit it and never set a generic value like "文档", "untitled", or "report".',
  '- Examples: subject "2025年第三季度经营分析" → "filename": "2025年Q3经营分析"; subject "员工培训合同" → "filename": "员工培训合同".',
  'Only if the user gave no subject at all may you fall back to the title; the system then derives it automatically.',
].join('\n');

const STYLE_TEMPLATE_DOC = [
  'styleTemplateId (string, optional): uuid of an uploaded file-based style template of the SAME format to inherit its',
  'theme/colors/fonts/layout (e.g. "inherit the company deck design"). When omitted, the caller\'s own per-format default',
  'template is used if set; otherwise the platform/system default template is applied (if any).',
  'username (string, optional): the SSO username of the user who is generating this document. It scopes the generated',
  'file (only that user can see it in the admin UI) and becomes the document author when `author` is not provided.',
  'The platform (Dify / MCP gateway) usually sets this automatically.',
  'filename (string): REQUIRED — see the "IMPORTANT — always set filename" rule above. A safe basename is applied and the',
  'correct extension (.pptx/.docx/.xlsx/.pdf) is added automatically.',
].join('\n');

const PDF_STYLE_TEMPLATE_DOC = [
  'styleTemplateId (string, optional): accepted for interface compatibility; style templates only affect PPTX / DOCX / XLSX files.',
  'filename (string): REQUIRED — see the "IMPORTANT — always set filename" rule above. A safe basename is applied and the',
  'correct extension (.pdf) is added automatically.',
].join('\n');

export function createMcpServer(service: DocumentService): McpServer {
  const server = new McpServer({
    name: 'ai-doc',
    version: '1.0.0',
  });

  server.registerTool(
    'generate_word_docx',
    {
      title: 'Generate Word (.docx)',
      description: [
        'Create a Microsoft Word (.docx) document from structured content and return a public download link. Use this for Word reports, 文档/汇报/合同/简历. ',
        FILENAME_RULE,
        '',
        'Input fields:',
        '- title (string, optional): document title, rendered as a centered large heading.',
        `- ${COMMON_PARAGRAPHS_DOC}`,
        `- ${COMMON_TABLES_DOC}`,
        `- ${COMMON_IMAGE_DOC}`,
        '- footer (string, optional): text repeated at the bottom of every page.',
                `- ${STYLE_TEMPLATE_DOC}`,
        '',
        'Example:',
        '{"filename":"Q3经营报告","title":"Q3 经营报告","paragraphs":[{"text":"摘要","level":1},{"text":"本季度收入增长18%","bullet":true},{"text":"成本下降5%","bullet":true}],"tables":[{"columns":[{"key":"m","header":"月份"},{"key":"rev","header":"收入(万元)"}],"rows":[{"m":"7月","rev":120},{"m":"8月","rev":141}]}],"images":[{"data":"data:image/png;base64,....","width":420,"align":"center","caption":"营收变化曲线"}]}',
        COMMON_RETURN,
      ].join('\n'),
      inputSchema: docxSchema,
    },
    async (args: Record<string, unknown>) => {
      const { styleTemplateId, filename, username, ...rest } = args;
      return toMcpResult(await service.generate('docx', rest as never, { styleTemplateId: styleTemplateId as string | undefined, filename: filename as string | undefined, owner: username as string | undefined }));
    },
  );

  server.registerTool(
    'generate_pdf',
    {
      title: 'Generate PDF',
      description: [
        'Create a PDF document from structured content and return a public download link. Use this for printable/高保真 documents (PDF export of reports, invoices, newsletters).',
        FILENAME_RULE,
        '',
        'Input fields:',
        '- title (string, optional): document title, rendered as a centered heading.',
        '- author (string, optional) / subject (string, optional): PDF metadata.',
        `- ${COMMON_PARAGRAPHS_DOC}`,
        `- ${COMMON_TABLES_DOC}`,
        `- ${PDF_IMAGE_DOC}`,
        '- footer (string, optional): text repeated at the bottom of every page.',
        `- ${PDF_STYLE_TEMPLATE_DOC}`,
        '',
        'Example:',
        '{"filename":"发票明细","title":"发票明细","paragraphs":[{"text":"订单号 #1042","level":2},{"text":"共3件商品","bullet":true}],"tables":[{"columns":[{"key":"item","header":"商品"},{"key":"price","header":"单价"}],"rows":[{"item":"键盘","price":199},{"item":"鼠标","price":89}]}],"footer":"ai-doc 生成","images":[{"svg":"<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"300\\" height=\\"100\\"><rect width=\\"300\\" height=\\"100\\" fill=\\"#2F5496\\"/></svg>","align":"center"}]}',
        COMMON_RETURN,
      ].join('\n'),
      inputSchema: pdfSchema,
    },
    async (args: Record<string, unknown>) => {
      const { styleTemplateId, filename, username, ...rest } = args;
      return toMcpResult(await service.generate('pdf', rest as never, { styleTemplateId: styleTemplateId as string | undefined, filename: filename as string | undefined, owner: username as string | undefined }));
    },
  );

  server.registerTool(
    'generate_excel_xlsx',
    {
      title: 'Generate Excel (.xlsx)',
      description: [
        'Create an Excel (.xlsx) workbook with one or more worksheets of tabular data and return a public download link. Use this for spreadsheets, 数据表格/报表/清单.',
        FILENAME_RULE,
        '',
        'Input fields:',
        '- title (string, optional): workbook metadata.',
        '- sheets (array, required, at least 1): worksheets. Each sheet:',
        '    { name: string (sheet tab name),',
        '      columns: [{ key, header }] (optional, else derived from first row),',
        '      rows: [{ <columnKey>: string | number | boolean | null }] (required),',
        '      images: [image items] (optional, anchored below the table; PNG/JPEG/SVG supported) }',
        '- images item form (exactly one of): data (base64 or data: URI), url (http(s) link), svg (raw SVG markup);',
        '  optional width/height in px. SVG is rasterized to PNG.',
        `- ${STYLE_TEMPLATE_DOC}`,
        '',
        'Example:',
        '{"filename":"2025年销售台账","sheets":[{"name":"销售额","columns":[{"key":"region","header":"区域"},{"key":"sales","header":"销售额"}],"rows":[{"region":"华东","sales":1280.5},{"region":"华南","sales":960.2}],"images":[{"data":"data:image/png;base64,....","width":240}]}]}',
        COMMON_RETURN,
      ].join('\n'),
      inputSchema: xlsxSchema,
    },
    async (args: Record<string, unknown>) => {
      const { styleTemplateId, filename, username, ...rest } = args;
      return toMcpResult(await service.generate('xlsx', rest as never, { styleTemplateId: styleTemplateId as string | undefined, filename: filename as string | undefined, owner: username as string | undefined }));
    },
  );

  server.registerTool(
    'generate_powerpoint_pptx',
    {
      title: 'Generate PowerPoint (.pptx)',
      description: [
        'Create a PowerPoint (.pptx) deck from structured content and return a public download link. A title slide is generated from the top-level title; each slide in `slides` becomes a content slide.',
        FILENAME_RULE,
        '',
        'Input fields:',
        '- title (string, required): presentation title (also the title slide).',
        '- author (string, optional): presentation author.',
        '- slides (array, required, at least 1): each slide:',
        '    { title: string (optional), subtitle: string (optional),',
        '      bullets: [string] (optional, bullet points),',
        '      tables: [ { columns?, rows } ] (optional, rendered below the title/text; one or more tables per slide),',
        '      images: [image items] (optional, rendered in the lower part of the slide),',
        '      layout: "title" | "title_content" (optional, default title_content),',
        '      footer: string (optional, footnote at the bottom) }',
        '- image item form (exactly one of): data (base64 or data: URI), url (http(s) link), svg (raw SVG, rasterized to PNG for broad compatibility);',
        '  optional width/height in px, align ("left"|"center"|"right"), caption. GIF/WebP also accepted.',
        `- ${STYLE_TEMPLATE_DOC}`,
        '',
        'Example:',
        '{"filename":"渠道汇报","title":"渠道汇报","slides":[{"title":"各渠道表现","bullets":["线上销售增长25%","线下持平"],"tables":[{"columns":[{"key":"ch","header":"渠道"},{"key":"growth","header":"增长"}],"rows":[{"ch":"线上","growth":"25%"},{"ch":"线下","growth":"0%"}]}]},{"title":"数据可视化","images":[{"svg":"<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"400\\" height=\\"200\\"><circle cx=\\"100\\" cy=\\"100\\" r=\\"80\\" fill=\\"#E8A33D\\"/></svg>","align":"center"}]}]}',
        COMMON_RETURN,
      ].join('\n'),
      inputSchema: pptxSchema,
    },
    async (args: Record<string, unknown>) => {
      const { styleTemplateId, filename, username, ...rest } = args;
      return toMcpResult(await service.generate('pptx', rest as never, { styleTemplateId: styleTemplateId as string | undefined, filename: filename as string | undefined, owner: username as string | undefined }));
    },
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