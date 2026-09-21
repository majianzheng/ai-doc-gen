import { z } from 'zod';

/**
 * Zod schemas for document generation inputs.
 *
 * Two flavours are exported:
 *
 *  1. Public / API-facing schemas — `docxSchema`, `pdfSchema`, `xlsxSchema`,
 *     `pptxSchema`. Used by the MCP tools and the public REST endpoint
 *     (`POST /api/documents/:format`). They enforce the mandatory fields that
 *     any AI agent must send: `username` (so the file is scoped to a real user,
 *     never 【系统】), `filename`, `title` and actual content. When an agent
 *     omits or empties one of them, the validation error carries an explicit
 *     message telling the agent exactly which field and why.
 *
 *  2. Internal / admin schemas — `*AdminSchema`. Used by the admin UI flows
 *     where the caller identity is taken from the logged-in session and the
 *     file name is supplied separately, so `username` / `filename` / `title`
 *     stay optional (original behaviour, no regression).
 */

/** Required non-blank string with a clear AI-facing reason per failure mode. */
function requiredText(field: string, why: string, max = 500): z.ZodString {
  return z.string({
    required_error: `${field} 是必填项 / REQUIRED —— ${why}`,
    invalid_type_error: `${field} 必须传入字符串 / must be a string —— ${why}`,
  })
    .trim()
    .min(1, { message: `${field} 不能为空 / must not be empty —— ${why}` })
    .max(max, `${field} 过长 / too long, keep it under ${max} chars`);
}

const alignEnum = z.enum(['left', 'center', 'right', 'justify']).optional();

const paragraphItem = z.object({
  text: z.string({ invalid_type_error: 'paragraphs[].text 必须为字符串' }).describe('段落/行文本内容'),
  level: z.number().int().min(0).max(6).optional().describe('标题级别 1-6；省略或填 0 表示正文段落'),
  bold: z.boolean().optional().describe('是否加粗'),
  italic: z.boolean().optional().describe('是否斜体'),
  bullet: z.boolean().optional().describe('是否渲染为项目符号（要点）'),
  align: alignEnum.describe('水平对齐：left / center / right / justify'),
  fontSize: z.number().min(6).max(80).optional().describe('字号（磅）'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('文字颜色 #RRGGBB'),
});

const tableColumn = z.object({
  key: z.string().describe('列标识（key），必须与每行对象中的字段名一致'),
  header: z.string().describe('列标题（表头显示文本）'),
});

const rowData = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

const tableData = z.object({
  columns: z.array(tableColumn).optional().describe('列顺序 + 表头；省略时自动取第一行的键'),
  rows: z.array(rowData).min(1, { message: 'tables[].rows 至少需要 1 行数据' }).describe('按列键组织的行数据数组'),
});

/**
 * 一张要插入文档的图片。必须提供且只能提供一种来源：
 *  - `data`: base64 图片字节（可带 data: URI 前缀）
 *  - `url`:  http(s) 图片链接（生成时下载）
 *  - `svg`:  原始 SVG XML 标记
 * 支持 PNG/JPEG/GIF/WebP 位图与 SVG；SVG 在 DOCX/PPTX 中保持矢量，在 PDF/XLSX 中栅格化为 PNG。
 */
const imageItem = z.object({
  data: z.string().optional().describe('base64 图片字节（可带 data:image/...;base64, 前缀，推荐）'),
  mimeType: z.string().optional().describe('当 data 无 data: URI 前缀时指定 MIME，如 image/png、image/svg+xml；默认 image/png'),
  url: z.string().url().optional().describe('图片的 http(s) 链接，生成时由服务下载'),
  svg: z.string().optional().describe('原始 SVG(XML) 标记'),
  width: z.number().positive().max(5000).optional().describe('渲染宽度(px)；省略按原始宽高比自适应'),
  height: z.number().positive().max(5000).optional().describe('渲染高度(px)；省略按原始宽高比自适应'),
  align: z.enum(['left', 'center', 'right']).optional().describe('图片水平位置(自动布局时)'),
  caption: z.string().optional().describe('图片下方说明文字（题注）'),
  cell: z.object({
    col: z.number().int().min(0),
    row: z.number().int().min(0),
  }).optional().describe(
    '（仅 Excel）把图片左上角锚定到某个单元格（col/row 从 0 开始），随该单元格移动；未提供 position 时生效。',
  ),
  position: z.object({
    x: z.number().min(0).describe('左上角横坐标(px，96px=1in)'),
    y: z.number().min(0).describe('左上角纵坐标(px)'),
    w: z.number().positive().optional().describe('图片宽度(px)；省略按尺寸/比例推导'),
    h: z.number().positive().optional().describe('图片高度(px)；省略按尺寸/比例推导'),
  }).optional().describe(
    '在页面/工作表任意位置绝对定位(px)。Excel 为浮动图片，PPT 指定该页图的左上角 x/y 与大小 w/h；提供时优先于 cell 与自动布局。',
  ),
}).refine((v) => [v.data, v.url, v.svg].filter((x) => x !== undefined).length <= 1, {
  message: '每张图片只能提供一种来源：data | url | svg',
}).refine((v) => [v.data, v.url, v.svg].some((x) => x !== undefined), {
  message: '每张图片必须提供一种来源：data（base64）| url | svg',
});

const usernameReq = requiredText(
  'username',
  '调用者身份必须被识别，否则生成的文档将归属到【系统】而不是对应用户',
  200,
).describe(
  '必填 REQUIRED：当前发起生成的用户（SSO 用户名）。用于把生成的文档归属到该用户（仅该用户在管理端可见），'
  + '未提供 author 时也作为默认作者。请使用真实用户标识，不要凭空编造；缺失或为空将被拒绝并说明原因。',
);

const filenameReq = requiredText(
  'filename',
  '生成文件的下载名称（不含扩展名），请用简洁、可读、能表达内容的名字，如“Q3经营报告”、“2025年度总结”',
  100,
).describe(
  '必填 REQUIRED：下载文件的名称（不含扩展名，正确扩展名由系统自动追加）。'
  + '请从文档主题中提炼，保持简洁（≤60 字符），使用中文/字母/数字、空格、- 或 _；'
  + '不要使用 “文档”、“untitled”、“report” 等无意义通用名。',
);

const sheetData = z.object({
  name: z.string().describe('工作表名称（sheet 标签）'),
  columns: z.array(tableColumn).optional().describe('列顺序 + 表头；省略时自动取第一行的键'),
  rows: z.array(rowData).min(1, { message: 'sheets[].rows 至少需要 1 行数据' }).describe('按列键组织的行数据数组'),
  images: z.array(imageItem).optional().describe('（可选）锚定在表格下方的图片（PNG/JPEG/SVG）'),
});

const slideData = z.object({
  title: z.string().optional().describe('（可选）幻灯片标题'),
  subtitle: z.string().optional().describe('（可选）幻灯片副标题（标题下方）'),
  bullets: z.array(z.string()).optional().describe('（可选）内容页的要点列表'),
  tables: z.array(tableData).optional().describe('（可选）标题/文字下方渲染的表格'),
  images: z.array(imageItem).optional().describe('（可选）渲染在幻灯片下部的图片（svg / base64 / url）'),
  layout: z.enum(['title', 'title_content']).optional().describe('仅标题页 或 标题+内容页（缺省 title_content）'),
  author: z.string().optional().describe('（可选）演示文稿作者'),
  footer: z.string().optional().describe('（可选）幻灯片底部脚注'),
});

// ============================================================================
// Public / API-facing strict schemas (MCP tools + public REST endpoint)
// ============================================================================

/**
 * 正文（Markdown）必填定义 —— 用一段 Markdown 表达文档内容，避免复杂嵌套参数。
 */
const contentReq = requiredText('content', '文档正文（Markdown），必须提供', 2_000_000).describe(
  '必填 REQUIRED：文档正文，Markdown 格式。支持：# 标题(#一级/##二级/...)、- 列表要点、**加粗**、*斜体*、| 表头 | 单元格 | 表格、![说明](图片url或data:)。直接给一段标准 Markdown 即可。'
);

export const docxSchema = z.object({
  username: usernameReq,
  filename: filenameReq,
  title: z.string().optional().describe('（可选）文档标题；缺省时取 content 首个 # 标题'),
  content: contentReq,
  author: z.string().optional().describe('文档作者/创建者元数据（缺省时取 username）'),
  footer: z.string().optional().describe('（可选）每页底部页脚文字'),
  styleTemplateId: z.string().optional().describe('（可选）已上传 .docx 样式模板的 uuid，用于继承字体/颜色/标题样式'),
});

export const pdfSchema = z.object({
  username: usernameReq,
  filename: filenameReq,
  title: z.string().optional().describe('（可选）文档标题；缺省时取 content 首个 # 标题'),
  content: contentReq,
  author: z.string().optional().describe('文档作者元数据（缺省时取 username）'),
  subject: z.string().optional().describe('（可选）文档主题元数据'),
  footer: z.string().optional().describe('（可选）每页底部页脚文字'),
  styleTemplateId: z.string().optional().describe('（可选）仅为接口兼容保留；样式模板仅作用于 pptx/docx/xlsx'),
});

export const xlsxSchema = z.object({
  username: usernameReq,
  filename: filenameReq,
  title: z.string().optional().describe('（可选）工作簿标题'),
  content: contentReq.describe('必填 REQUIRED：Markdown 内容。每个 `## 表名` 表示一个工作表，其下的 `| 表头 | 单元格 |` 表格即为该表数据；无行记录则以列名生成空表。'),
  styleTemplateId: z.string().optional().describe('（可选）已上传 .xlsx 样式模板的 uuid，用于继承主题/配色/字体'),
});

export const pptxSchema = z.object({
  username: usernameReq,
  filename: filenameReq,
  title: z.string().optional().describe('（可选）演示文稿标题（也是首页标题页标题）；缺省时取 content 首个 # 标题'),
  content: contentReq.describe('必填 REQUIRED：Markdown 内容。每个 `## 标题` 表示一页幻灯片，其下的 `- 要点` 为内容列表、`| 表格 |` 为表格页。'),
  author: z.string().optional().describe('演示文稿作者（缺省时取 username）'),
  styleTemplateId: z.string().optional().describe('（可选）已上传 .pptx 样式模板的 uuid，用于继承主题/版式'),
});

// ============================================================================
// Plain-text documents (txt / html / xml / json / source code etc.)
// ============================================================================

const encodingEnum = z.enum([
  'utf-8', 'utf8', 'utf-8-bom', 'utf8-bom', 'ascii', 'latin1', 'ucs2', 'utf-16le', 'utf16le', 'base64', 'hex',
]).describe('文本编码（默认 utf-8，无 BOM）。utf-8 / utf8 为不带 BOM 的 UTF-8；utf-8-bom / utf8-bom 为带 BOM（EF BB BF 头）的 UTF-8；另支持 ascii / latin1 / utf-16le / utf16le / ucs2 / base64 / hex');

const lineEndingEnum = z.enum(['lf', 'crlf']).describe('行尾序列（默认 lf）：lf = \\n，crlf = \\r\\n');

export const textSchema = z.object({
  username: usernameReq,
  filename: requiredText(
    'filename',
    '下载文件的完整名称，必须带扩展名（扩展名决定类型与下载文件名），例如 test.cpp、readme.md、index.html、note.txt',
    200,
  ).describe(
    '必填 REQUIRED：下载文件的完整名称，**必须包含扩展名**（如 test.cpp / readme.md / index.html / data.json / note.txt）。'
    + '扩展名决定 Content-Type 与浏览器展示方式；txt/html/xml/json/js/css/各种源码均可。',
  ),
  content: requiredText('content', '纯文本内容（原样保存，不做任何格式转换）', 5_000_000).describe(
    '必填 REQUIRED：纯文本内容（原样保存）。适合：txt 笔记、HTML 页面、XML/JSON 数据、C/Java/TS/Python 等源码、Markdown 文件、配置等。'
    + '注意：此内容不经过 Markdown 解析，给定什么就存什么。',
  ),
  encoding: encodingEnum.optional(),
  lineEnding: lineEndingEnum.optional(),
});

// ============================================================================
// Internal / admin schemas (caller identity & filename come from the session /
// a separate field, so username / filename / title remain optional here).
// ============================================================================

export const docxAdminSchema = z.object({
  title: z.string().optional().describe('文档标题（居中大标题）'),
  author: z.string().optional().describe('文档作者/创建者元数据（缺省时取当前登录用户）'),
  username: usernameReq.optional().describe('（可选）用户名；缺省时使用当前登录用户'),
  paragraphs: z.array(paragraphItem).optional().describe('正文内容：标题段落/要点/正文'),
  tables: z.array(tableData).optional().describe('（可选）正文中的数据表格'),
  images: z.array(imageItem).optional().describe('（可选）插入的图片（base64 / url / svg），追加在正文之后'),
  footer: z.string().optional().describe('（可选）每页底部页脚文字'),
  styleTemplateId: z.string().optional().describe('（可选）已上传 .docx 样式模板的 uuid'),
  filename: filenameReq.optional().describe('（可选）下载文件名（不含扩展名）；缺省时由系统根据标题自动推导'),
});

export const pdfAdminSchema = z.object({
  title: z.string().optional().describe('文档标题（居中标题）'),
  author: z.string().optional().describe('文档作者元数据（缺省时取当前登录用户）'),
  username: usernameReq.optional().describe('（可选）用户名；缺省时使用当前登录用户'),
  subject: z.string().optional().describe('（可选）文档主题元数据'),
  paragraphs: z.array(paragraphItem).optional().describe('正文内容：标题段落/要点/正文'),
  tables: z.array(tableData).optional().describe('（可选）正文中的数据表格'),
  images: z.array(imageItem).optional().describe('（可选）插入的图片（base64 / url / svg），追加在正文之后'),
  footer: z.string().optional().describe('（可选）每页底部页脚文字'),
  styleTemplateId: z.string().optional().describe('（可选）仅为接口兼容保留；样式模板仅作用于 pptx/docx/xlsx'),
  filename: filenameReq.optional().describe('（可选）下载文件名（不含扩展名）；缺省时由系统根据标题自动推导'),
});

export const xlsxAdminSchema = z.object({
  title: z.string().optional().describe('工作簿标题'),
  username: usernameReq.optional().describe('（可选）用户名；缺省时使用当前登录用户'),
  sheets: z.array(sheetData).min(1, { message: '至少需要 1 个工作表' }).describe('一个或多个工作表（表格数据）'),
  styleTemplateId: z.string().optional().describe('（可选）已上传 .xlsx 样式模板的 uuid'),
  filename: filenameReq.optional().describe('（可选）下载文件名（不含扩展名）；缺省时由系统根据标题自动推导'),
});

export const pptxAdminSchema = z.object({
  title: z.string().describe('演示文稿标题（也是首页标题页）'),
  author: z.string().optional().describe('演示文稿作者（缺省时取当前登录用户）'),
  username: usernameReq.optional().describe('（可选）用户名；缺省时使用当前登录用户'),
  slides: z.array(slideData).min(1, { message: '至少需要 1 页内容' }).describe('首页之后的内容页'),
  styleTemplateId: z.string().optional().describe('（可选）已上传 .pptx 样式模板的 uuid'),
  filename: filenameReq.optional().describe('（可选）下载文件名（不含扩展名）；缺省时由系统根据标题自动推导'),
});

export const textAdminSchema = z.object({
  username: usernameReq.optional().describe('（可选）用户名；缺省时使用当前登录用户'),
  filename: z.string().optional().describe('（可选）下载文件名（含扩展名，如 test.cpp / note.txt）；缺省 note.txt'),
  content: z.string({ required_error: 'content 是必填项 —— 纯文本内容' }).describe('必填：纯文本内容（原样保存）'),
  encoding: encodingEnum.optional(),
  lineEnding: lineEndingEnum.optional(),
});
