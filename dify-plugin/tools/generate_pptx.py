from collections.abc import Generator
from typing import Any

from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage

from _internal.client import AiDocClientError, generate_document


class GeneratePptxTool(Tool):
    def _invoke(self, tool_parameters: dict[str, Any]) -> Generator[ToolInvokeMessage, None, None]:
        base_url = tool_parameters.pop("base_url", "")
        payload = {k: v for k, v in tool_parameters.items() if v is not None}
        try:
            result = generate_document(base_url, "pptx", payload)
        except AiDocClientError as exc:
            yield self.create_text_message({"error": str(exc)})
            return
        yield self.create_text_message(result)
        yield self.create_link_message("Download document", result["url"])
