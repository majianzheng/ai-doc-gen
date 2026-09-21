import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { DocumentService } from '../core.js';
import { docxSchema, pdfSchema, xlsxSchema, pptxSchema, textSchema, listGenerators } from '../docs/index.js';
import type { GeneratedDocument } from '../docs/types.js';

/**
 * Builds and returns the MCP server with one tool per supported document
 * format.
 *
 * Every tool enforces the same mandatory fields inside its input schema so a
 * missing/empty required field fails with a clear reason the agent can read:
 *  - username  (REQUIRED) — the caller identity; without it the file would be
 *    owned by 【系统】 instead of the real user;
 *  - filename  (REQUIRED) — the human-readable download name;
 *  - title     (REQUIRED) — the document title;
 *  - content   (REQUIRED) — paragraphs / sheets / slides, at least 1 item.
 *
 * Tool descriptions are kept concise but highlighted: REQUIRED fields first,
 * one-line optionals, a complete JSON calling example and an interaction
 * contract so the agent always reports progress and the final link to the user
 * (never leaving the conversation looking stuck).
 */

/** Interaction contract embedded in every tool description: the agent must
 *  announce that generation started before calling, then present the result
 *  (or the failure reason) immediately after the call returns. */
/** 调用前提，嵌入每个工具描述：仅当用户明确要求生成文件时才调用，否则直接在
 *  对话里查看/回答，避免动不动就生成文件打扰用户。 */
const USAGE_GATE = [
  '',
  '调用前提（务必遵守，避免打扰用户）:',
  '仅当用户【明确要求】生成文件（如“保存/下载/导出为文件/发我文件”）时才调用本工具；',
  '若用户只是询问内容、想看效果或了解信息，直接在对话中展示内容/回答，【不要】调用本工具；',
  '不确定时，先询问用户是否需要保存为文件，而不是直接生成。',
].join('\n');

const INTERACTION_DOC = [
  '',
  '交互契约（务必遵守，避免用户误以为“卡住”）:',
  '1. 调用本工具【之前】，先用一句话向用户播报进度，例如：“好的，正在为您生成《<title>》…，请稍候（通常需数秒至几十秒）”。',
  '2. 工具返回后，立即向用户展示结果：【生成成功】文件名、文件大小、下载链接(url)。',
  '3. 若工具返回错误，把【失败原因】用通俗语言转述给用户（通常是某个必填字段缺失或为空），并指出如何修正后重试。',
  '4. 全程保持交互与反馈，切勿让调用看起来没有反应。',
].join('\n');

const COMMON_RETURN = [
  '',
  '成功返回 JSON: { "format", "filename", "url", "size", "mimeType", "createdAt" }。',
  '请把 "url"（公开下载链接）连同文件名、大小一起展示给用户，并说明文档已生成完成。',
].join('\n');

/** 统一返回结构说明（outputSchema，Zod schema），供 MCP 客户端展示返回字段。 */
const COMMON_OUTPUT_SCHEMA = z.object({
  format: z.string().describe('文档格式，如 docx/pdf/xlsx/pptx'),
  filename: z.string().describe('文件名（不含扩展名）'),
  url: z.string().describe('公开下载链接（展示给用户）'),
  size: z.number().describe('文件大小（字节）'),
  mimeType: z.string().describe('MIME 类型'),
  createdAt: z.string().describe('创建时间（ISO 字符串）'),
});

/** Common required fields shown at the top of every tool description. */
const REQUIRED_DOC_HEADER = [
  '',
  '必填字段（REQUIRED，缺失或为空将被拒绝并返回原因）:',
  '- username (string): 当前发起生成的用户（SSO 用户名）。文档将归属到该用户而不是【系统】；请使用真实用户标识，不要编造。',
  '- filename (string): 下载文件名（不含扩展名），简洁可读，如 "Q3经营报告"、"2025年度总结"。',
  '- title (string): 文档标题。',
].join('\n');

/** Common optional fields shared by docx / pdf (concise one-liners). */
const OPT_TEXT_DOC = [
  '- author (string): 作者（缺省取 username）。',
  '- tables (array): 数据表格，每项 { columns:[{key,header}](可选), rows:[{<key>:value}](至少1行) }。',
  '- images (array): 图片，每张三选一 data(base64)/url/svg，可带 width/height/align/caption，追加在正文后。',
  '- footer (string): 每页底部页脚文字。',
  '- styleTemplateId (string): 已上传的同格式样式模板 uuid（可选，继承主题/字体）。',
].join('\n');

/** Optional fields specific to the Excel tool. */
const OPT_SHEETS_DOC = [
  '- 每个工作表: { name(工作表名), columns:[{key,header}](可选), rows:[{<key>:value}](至少1行), images(可选,固定在表格下方) }。',
  '- styleTemplateId (string): 已上传的 .xlsx 样式模板 uuid（可选，继承主题/配色）。',
].join('\n');

/** Optional fields specific to the PowerPoint tool. */
const OPT_SLIDES_DOC = [
  '- 每页内容(slides[]): { title, subtitle, bullets:[string], tables:[{columns?,rows}], images:[...], layout("title"|"title_content"), footer }。',
  '- author (string): 演示文稿作者（缺省取 username）。',
  '- styleTemplateId (string): 已上传的 .pptx 样式模板 uuid（可选，继承主题/版式）。',
].join('\n');

/** Run generation and convert any failure into a readable error result the
 *  agent can relay to the user. Validation of mandatory fields happens earlier
 *  (the SDK rejects them with the schema's own messages). */
async function generateSafe(fn: () => Promise<GeneratedDocument>) {
  try {
    return toMcpResult(await fn());
  } catch (err) {
    const reason = (err as Error).message;
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: `文档生成失败 / generation failed — 原因: ${reason}。请向用户说明失败原因，并按要求修正后重试。`,
        },
      ],
      structuredContent: { ok: false, error: reason },
    };
  }
}

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
        '生成 Word (.docx) 文档并返回公开下载链接。直接提供一段 Markdown 作为 content 即可，无需构造复杂参数。',
        '',
        '必填：username、filename、content(Markdown)。可选：title(缺省取 content 首个 # 标题)、author、footer、styleTemplateId。',
        '',
        'content 支持：',
        '- # 一级标题 / ## 二级标题 / ### 三级标题 …',
        '- - 列表要点',
        '- **加粗** / *斜体*',
        '- | 表头1 | 表头2 | 表格（每行一个 | 单元格 |）',
        '- ![图片说明](图片url 或 data:base64)',
        '',
        '示例（content）:',
        '# Q3 经营报告',
        '## 摘要',
        '- 本季度收入增长 18%',
        '| 月份 | 收入（万元） |',
        '| 7月 | 120 |',
        '| 8月 | 141 |',
        USAGE_GATE,
        INTERACTION_DOC,
        COMMON_RETURN,
      ].join('\n'),
      inputSchema: docxSchema,
      outputSchema: COMMON_OUTPUT_SCHEMA as any,
    },
    async (args: Record<string, unknown>) => {
      const { styleTemplateId, filename, username, ...rest } = args;
      return generateSafe(() => service.generate('docx', rest as never, { styleTemplateId: styleTemplateId as string | undefined, filename: filename as string | undefined, owner: username as string | undefined }));
    },
  );

  server.registerTool(
    'generate_pdf',
    {
      title: 'Generate PDF',
      description: [
        '生成 PDF 文档并返回公开下载链接。直接提供一段 Markdown 作为 content 即可。',
        '',
        '必填：username、filename、content(Markdown)。可选：title(缺省取 content 首个 # 标题)、author、subject、footer、styleTemplateId。',
        '',
        'content 支持：# 标题、- 列表、**加粗**、*斜体*、| 表头 | 表格 |、![图片说明](图片url或data:)。',
        '',
        '示例（content）:',
        '# 发票明细',
        '## 汇总',
        '- 共 3 件商品',
        '| 商品 | 单价 |',
        '| 键盘 | 199 |',
        '| 鼠标 | 89 |',
        USAGE_GATE,
        INTERACTION_DOC,
        COMMON_RETURN,
      ].join('\n'),
      inputSchema: pdfSchema,
      outputSchema: COMMON_OUTPUT_SCHEMA as any,
    },
    async (args: Record<string, unknown>) => {
      const { styleTemplateId, filename, username, ...rest } = args;
      return generateSafe(() => service.generate('pdf', rest as never, { styleTemplateId: styleTemplateId as string | undefined, filename: filename as string | undefined, owner: username as string | undefined }));
    },
  );

  server.registerTool(
    'generate_excel_xlsx',
    {
      title: 'Generate Excel (.xlsx)',
      description: [
        '生成 Excel (.xlsx) 工作簿并返回公开下载链接。直接提供一段 Markdown 作为 content。',
        '',
        '必填：username、filename、content(Markdown)。可选：title、styleTemplateId。',
        '',
        '映射规则：每个 `## 表名` 作为一个工作表，其下的 `| 表头 | 单元格 |` 表格即该表数据；无 `##` 时每个表格 = 一个工作表（SheetN）。',
        '',
        '示例（content）:',
        '## 2025 销售台账',
        '| 区域 | 销售额（万元） |',
        '| 华东 | 1280.5 |',
        '| 华南 | 960.2 |',
        '## 二季度',
        '| 月份 | 收入 |',
        '| 4月 | 92 |',
        '| 5月 | 105 |',
        USAGE_GATE,
        INTERACTION_DOC,
        COMMON_RETURN,
      ].join('\n'),
      inputSchema: xlsxSchema,
      outputSchema: COMMON_OUTPUT_SCHEMA as any,
    },
    async (args: Record<string, unknown>) => {
      const { styleTemplateId, filename, username, ...rest } = args;
      return generateSafe(() => service.generate('xlsx', rest as never, { styleTemplateId: styleTemplateId as string | undefined, filename: filename as string | undefined, owner: username as string | undefined }));
    },
  );

  server.registerTool(
    'generate_powerpoint_pptx',
    {
      title: 'Generate PowerPoint (.pptx)',
      description: [
        '生成 PowerPoint (.pptx) 演示文稿并返回公开下载链接。直接提供一段 Markdown 作为 content。',
        '',
        '必填：username、filename、content(Markdown)。可选：title(缺省取 content 首个 # 标题)、author、styleTemplateId。',
        '',
        '映射规则：每个 `## 页标题` 表示一页幻灯片，其下的 `- 要点` 为内容列表、`| 表格 |` 为表格页。',
        '',
        '示例（content）:',
        '# 渠道汇报',
        '## 各渠道表现',
        '- 线上销售增长 25%',
        '- 线下持平',
        '| 渠道 | 增幅 |',
        '| 线上 | +25% |',
        '| 线下 | 0% |',
        USAGE_GATE,
        INTERACTION_DOC,
        COMMON_RETURN,
      ].join('\n'),
      inputSchema: pptxSchema,
      outputSchema: COMMON_OUTPUT_SCHEMA as any,
    },
    async (args: Record<string, unknown>) => {
      const { styleTemplateId, filename, username, ...rest } = args;
      return generateSafe(() => service.generate('pptx', rest as never, { styleTemplateId: styleTemplateId as string | undefined, filename: filename as string | undefined, owner: username as string | undefined }));
    },
  );

  server.registerTool(
    'generate_text_file',
    {
      title: 'Generate Text File',
      description: [
        '生成纯文本文件（txt / html / xml / json / 各种源码等）并返回下载链接。无格式、无样式模板，给定什么内容就存什么。',
        '',
        '必填：username、filename（**必须包含扩展名**，如 test.cpp、readme.md、index.html、data.json、note.txt）、content（纯文本）。',
        '可选：encoding（编码，默认 utf-8，支持 utf-8/ascii/latin1/utf-16le/base64/hex 等）、lineEnding（行尾，lf 或 crlf，默认 lf）。',
        '',
        '示例:',
        '{ "username": "zhangsan", "filename": "main.cpp", "content": "#include <iostream>\\nint main() { return 0; }", "lineEnding": "lf" }',
        '',
        '注意：content 是纯文本，**不经过 Markdown 解析**；filename 的扩展名决定 Content-Type 与下载文件名。',
        USAGE_GATE,
        INTERACTION_DOC,
        COMMON_RETURN,
      ].join('\n'),
      inputSchema: textSchema,
      outputSchema: COMMON_OUTPUT_SCHEMA as any,
    },
    async (args: Record<string, unknown>) => {
      const { filename, username, ...rest } = args;
      return generateSafe(() => service.generate('text', rest as never, { filename: filename as string | undefined, owner: username as string | undefined }));
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
  const structured = {
    format: doc.format,
    filename: doc.filename,
    url: doc.url,
    size: doc.size,
    mimeType: doc.mimeType,
    createdAt: doc.createdAt,
  };
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(structured, null, 2),
      },
    ],
    // MCP SDK 校验 outputSchema 时要求结果带 structuredContent，否则抛
    // "has an output schema but no structured content was provided" (-32602)。
    structuredContent: structured,
  };
}

export async function runMcpStdio(service: DocumentService): Promise<void> {
  const server = createMcpServer(service);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}