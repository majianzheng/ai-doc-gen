from typing import Any

from dify_plugin import ToolProvider
from dify_plugin.errors.tool import ToolProviderCredentialValidationError

# The provider has no credentials of its own; the remote ai-doc endpoint is
# configured per-tool so that the same plugin can target multiple instances.
class DocumentGeneratorProvider(ToolProvider):
    def _validate_credentials(self, credentials: dict[str, Any]) -> None:
        return None

    @property
    def _is_tool_credential_required(self) -> bool:
        return False
