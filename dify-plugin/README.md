# AI-Doc Document Generator

Generate Office & PDF documents (Word `.docx` / PDF / Excel `.xlsx` / PowerPoint `.pptx`) via the **ai-doc** MCP service and return a public download link.

## Tools

- `generate_word_docx` — Word document from structured content (title, headings, paragraphs, tables)
- `generate_pdf` — PDF document from structured content
- `generate_excel_xlsx` — Excel workbook from sheets/rows
- `generate_powerpoint_pptx` — PowerPoint deck from slides

## Setup

Each tool has a `Service Base URL` parameter pointing at a running **ai-doc** instance, e.g. `http://10.88.8.201:9100`.

The ai-doc service generates the document and returns a JSON object containing a public download `url`.
