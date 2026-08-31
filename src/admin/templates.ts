import { randomUUID } from 'node:crypto';
import { join, normalize } from 'node:path';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import type { DocFormat, DocInputs } from '../docs/types.js';

/**
 * A saved document template. `input` is the structured JSON input accepted by
 * the matching generator (see `src/docs/schemas.ts`), so templates are reusable
 * blueprints the admin web UI can edit and generate from.
 */
export interface DocTemplate<F extends DocFormat = DocFormat> {
  id: string;
  name: string;
  format: F;
  description?: string;
  input: DocInputs[F];
  /** Optional id of the style template (uploaded docx/pptx/xlsx file) this
   *  content template applies when generating. */
  styleTemplateId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateInput {
  name: string;
  format: DocFormat;
  description?: string;
  input: DocInputs[DocFormat];
  styleTemplateId?: string;
}

const SEED_MARKER = '.seeded';

const SEED_TEMPLATES: Omit<DocTemplate, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: '工作周报',
    format: 'docx',
    description: '标准工作周报模板(docx),包含完成事项与下周计划',
    input: {
      title: '工作周报',
      author: '示例用户',
      paragraphs: [
        { text: '本周完成事项', level: 1 },
        { text: '完成 AI 文档生成平台的部署与联调', bullet: true },
        { text: '修复导出 PDF 的排版问题', bullet: true },
        { text: '下周计划', level: 1 },
        { text: '接入 Dify 工作流,并完善模板库', bullet: true },
      ],
      footer: '由 AI-Doc 生成',
    },
  },
  {
    name: '项目汇报',
    format: 'pdf',
    description: '项目汇报 PDF,含概述与指标表格',
    input: {
      title: '项目汇报',
      author: '示例用户',
      subject: 'AI-Doc 平台一期交付',
      paragraphs: [
        { text: '项目概述', level: 1 },
        { text: '本项目通过 MCP 协议为 AI Agent 提供文档生成能力。' },
        { text: '交付指标', level: 1 },
      ],
      tables: [
        {
          columns: [
            { key: 'item', header: '指标' },
            { key: 'value', header: '目标' },
          ],
          rows: [
            { item: '文档格式', value: 'docx / pdf / xlsx / pptx' },
            { item: '上线日期', value: '2026-09-01' },
          ],
        },
      ],
      footer: '第 1 页 / 共 1 页',
    },
  },
  {
    name: '月度销售数据',
    format: 'xlsx',
    description: '月度销售数据表格模板(xlsx)',
    input: {
      title: '月度销售数据',
      sheets: [
        {
          name: '销售明细',
          columns: [
            { key: 'month', header: '月份' },
            { key: 'revenue', header: '收入(元)' },
            { key: 'goal', header: '目标(元)' },
          ],
          rows: [
            { month: '1月', revenue: 120000, goal: 100000 },
            { month: '2月', revenue: 156000, goal: 110000 },
            { month: '3月', revenue: 142000, goal: 120000 },
          ],
        },
      ],
    },
  },
  {
    name: '项目启动会',
    format: 'pptx',
    description: '项目启动会演示模板(pptx)',
    input: {
      title: '项目启动会',
      author: '示例用户',
      slides: [
        { title: '项目启动会', subtitle: 'AI-Doc 文档生成平台', layout: 'title' },
        { title: '项目背景', bullets: ['统一文档生成能力', '向 AI Agent 开放能力'], layout: 'title_content' },
        { title: '后续计划', bullets: ['MCP 接入', '模块定制 / 模板库建设'], layout: 'title_content' },
      ],
    },
  },
];

/**
 * File-backed JSON template store used by the admin web UI. Templates are
 * persisted as `"{id}.json"` inside the configured template directory, so they
 * survive restarts and are independent of the document storage backend.
 */
export class TemplateStore {
  private readonly dir: string;

  constructor(templateDir: string) {
    this.dir = normalize(templateDir);
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const hasMarker = join(this.dir, SEED_MARKER);
    const existing = await this.list();
    if (existing.length > 0) return;
    try {
      await readFile(hasMarker);
      return;
    } catch {
      /* no marker yet */
    }
    for (const tpl of SEED_TEMPLATES) {
      const now = new Date().toISOString();
      await this.write({
        ...tpl,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      });
    }
    await writeFile(hasMarker, new Date().toISOString(), 'utf8');
  }

  async list(): Promise<DocTemplate[]> {
    const files = await readdir(this.dir, { withFileTypes: true });
    const results: DocTemplate[] = [];
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(this.dir, f.name), 'utf8');
        results.push(JSON.parse(raw) as DocTemplate);
      } catch {
        /* skip unreadable template files */
      }
    }
    return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<DocTemplate | null> {
    if (!this.isSafeId(id)) return null;
    try {
      const raw = await readFile(join(this.dir, `${id}.json`), 'utf8');
      return JSON.parse(raw) as DocTemplate;
    } catch {
      return null;
    }
  }

  async create(input: TemplateInput): Promise<DocTemplate> {
    const now = new Date().toISOString();
    const tpl: DocTemplate = {
      ...input,
      input: input.input as DocInputs[DocFormat],
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    await this.write(tpl);
    return tpl;
  }

  async update(id: string, input: Partial<TemplateInput>): Promise<DocTemplate | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const updated: DocTemplate = {
      ...existing,
      ...input,
      id,
      input: (input.input ?? existing.input) as DocInputs[DocFormat],
      updatedAt: new Date().toISOString(),
    };
    await this.write(updated);
    return updated;
  }

  async remove(id: string): Promise<boolean> {
    if (!this.isSafeId(id)) return false;
    try {
      await unlink(join(this.dir, `${id}.json`));
      return true;
    } catch {
      return false;
    }
  }

  private isSafeId(id: string): boolean {
    return /^[0-9a-fA-F-]{36}$/.test(id);
  }

  private async write(tpl: DocTemplate): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${tpl.id}.json`), JSON.stringify(tpl, null, 2), 'utf8');
  }
}
