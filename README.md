# ai-doc — Document Generation MCP Service

将 **文档生成能力** 通过 **MCP (Model Context Protocol)** 开放给任意 AI Agent(Dify、Claude、OpenAI 等),支持生成 **Word (.docx) / PDF / Excel (.xlsx) / PowerPoint (.pptx)**,并把生成结果上传到 **对象存储(S3/MinIO/OSS/COS)** 或本地磁盘,最终以 **可下载链接** 的形式返回给 Agent。

## 特性

- **一服务多入口**
  - **MCP (Streamable HTTP)**:供 Dify、OpenAI、Claude 等支持 MCP 的 Agent 远程调用
  - **MCP (stdio)**:供 Claude Desktop 等直接拉起进程的 Agent 使用
  - **REST API**:供 Dify 插件、脚本或其他 HTTP 客户端调用(底层与 MCP 共用同一套引擎)
- **四种文档格式**,统一的结构化输入模型,引擎彼此隔离、易于扩展
- **对象存储适配**:支持 AWS S3、MinIO、阿里云 OSS、腾讯云 COS(切换端点即可),本地开发自动回退到本地磁盘 + 静态文件服务
- **链接输出**:每次生成返回 `{ url, filename, size, mimeType, ... }`,Agent 直接拿到可下载链接
- **Dify 插件包**:`dify-plugin/` 提供可直接打包导入 Dify 的工具插件

## 架构

```
                    ┌──────────────────────────────────────────┐
                    │              ai-doc (Node/TS)            │
 AI Agent / Dify ──▶│                                         │
 (MCP client)       │  /mcp  MCP Streamable HTTP ──┐          │
                    │  /api/documents/:format  ────┼── MCP 工具│
 Dify Plugin ─────▶ │      (REST, 供插件使用)         │          │
                    │                      DocumentService    │
                    │                       │  │  │            │
                    │   Generator: docx │ pdf │ xlsx │ pptx   │
                    │                       │                  │
                    │                   Storage 抽象           │
                    │          S3(MinIO/OSS/COS) │ Local(dev) │
                    └──────────────────┬───────────┬──────────┘
                        上传 + 返回公开链接       本地磁盘 + /files
```

```
src/
├── index.ts            # 入口:按 DOC_MCP_TRANSPORT 启动 stdio 或 HTTP 服务
├── config.ts           # 环境变量配置(S3/存储/服务)
├── core.ts             # DocumentService:生成 + 上传 + 组装链接结果
├── docs/               # 文档引擎(与存储/传输完全解耦)
│   ├── types.ts        # 输入/输出数据模型
│   ├── schemas.ts      # zod 输入校验
│   ├── generator.ts    # Generator 接口
│   ├── index.ts        # 格式注册表
│   ├── word.ts pdf.ts excel.ts ppt.ts
├── mcp/server.ts       # MCP 工具/资源注册(registerTool)
├── http/server.ts      # MCP Streamable HTTP + REST + 静态文件
└── storage/            # Storage 抽象:s3.ts / local.ts
dify-plugin/            # Dify 插件包(Python dify-plugin SDK)
scripts/                # 冒烟测试脚本
```

## 快速开始

要求:Node.js ≥ 20。

```bash
npm install
npm run build

# 本地开发:HTTP 模式 + 本地磁盘存储(默认)
cp .env.example .env        # 按需修改
npm run start:http          # 或 npm run dev:http
```

启动后:

- MCP 端点:`http://localhost:9000/mcp`
- REST 端点:`POST http://localhost:9000/api/documents/:format`
- 健康检查:`GET /health`
- 本地生成的文件通过 `/files/...` 访问

## 配置

| 变量 | 默认 | 说明 |
|---|---|---|
| `DOC_MCP_TRANSPORT` | `http` | `stdio` 或 `http` |
| `VERBOSE` | `false` | 是否输出详细日志 |
| `HOST` / `PORT` | `0.0.0.0` / `9000` | HTTP 监听地址 |
| `MCP_PATH` | `/mcp` | MCP 端点路径 |
| `STORAGE_MODE` | `local` | `local` 或 `s3` |
| `LOCAL_STORAGE_DIR` | `storage` | 本地存储目录 |
| `LOCAL_PUBLIC_BASE_URL` | `http://localhost:9000` | 生成链接的对外访问地址(部署到公网时改成本机公网域名) |
| `S3_ENDPOINT` | 空(AWS) | 兼容 S3 的端点,如 MinIO `http://localhost:9000` |
| `S3_REGION` | `us-east-1` | 地区 |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | 空 | 密钥 |
| `S3_BUCKET` | `ai-doc` | 桶名 |
| `S3_PATH_STYLE` | `true` | MinIO/OSS 用 `true`,AWS 用 `false` |
| `S3_PUBLIC_BASE_URL` | 空 | 公开下载链接前缀,如 `https://cdn.example.com`(空则用端点推导) |

> 部署到公网时务必把 `LOCAL_PUBLIC_BASE_URL` 或 `S3_PUBLIC_BASE_URL` 改为 Agent 可达的公网地址,否则返回的链接无法访问。

## 接入 AI Agent

### 1. Dify(推荐:MCP 工具)

Dify 原生支持 MCP。在 **工具 → MCP → 添加 MCP 服务** 中选择 **SSE / Streamable HTTP**:

- 服务地址:开启服务后填写 `http://<你的服务地址>:9000/mcp`
- 保存后即会出现 4 个工具:`generate_word_docx`、`generate_pdf`、`generate_excel_xlsx`、`generate_powerpoint_pptx`

### 2. Claude Desktop / 其他 stdio Agent

在 Claude 配置中注册:

```json
{
  "mcpServers": {
    "ai-doc": {
      "command": "node",
      "args": ["/path/to/ai-doc/dist/index.js"],
      "env": { "DOC_MCP_TRANSPORT": "stdio", "STORAGE_MODE": "local" }
    }
  }
}
```

### 3. 任意 OpenAI / 自定义 Agent

直接调用 HTTP MCP 端点,或用 REST API:

```bash
curl -X POST http://localhost:9000/api/documents/pdf \
  -H "Content-Type: application/json" \
  -d '{"title": "周报", "paragraphs": [{"text": "本周总结", "level": 1}, {"text": "完成 X 项任务", "bullet": true}]}'
# => { "url": "https://...", "filename": "...", "size": ..., "format": "pdf" }
```

## Dify 插件包

`dify-plugin/` 是基于 `dify-plugin` SDK 的 **Tool 类型插件**,内部通过 REST API 调用 ai-doc 服务,因此服务本身也可独立运行、被多个 Dify 实例共享。

```bash
cd dify-plugin
pip install -r requirements.txt
dify plugin init          # 已有代码,用于生成 .dify/ 与配置
dify plugin package ./    # 打包生成 .difypkg
# 在 Dify 后台「插件 → 本地导入」上传安装
```

插件包含 4 个工具,使用前在每个工具里填写「Service Base URL」(ai-doc 服务地址,如 `http://localhost:9000`)。

## 添加新的文档格式

1. 在 `src/docs/` 新建生成器(实现 `Generator` 接口 + `generate(input): Buffer`)
2. 在 `src/docs/schemas.ts` 添加 zod 校验
3. 在 `src/docs/index.ts` 注册
4. (可选)在 `dify-plugin/tools/` 补对应工具的 yaml + py

引擎与存储、传输解耦,新增格式无需改动 MCP / REST / 存储逻辑。

## 冒烟测试

```bash
npm run build
npm run start:http        # 起服务后
# HTTP 模式的 MCP 全流程
node scripts/mcp-smoke.mjs
# stdio 模式全流程
node scripts/mcp-stdio-smoke.mjs
```

## 说明

- 对象存储采用 S3 协议,配合 `forcePathStyle` 与 `endpoint` 即可对接 MinIO / OSS / COS,无需业务代码改动。
- 生成的文档不落临时文件,直接以 Buffer 上传到存储,节省磁盘并减少 IO。
