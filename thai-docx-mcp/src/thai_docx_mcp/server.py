"""The MCP server: local use, one lawyer, on their own machine.

The engine in ``document.py`` knows nothing about MCP; this file is only the
tool surface over it, plus where the finished document goes. Documents are
written to a folder rather than handed back inline because a .docx carries
client names and figures, and a path is what the lawyer opens in Word.
"""

from __future__ import annotations

import os
from pathlib import Path

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import BaseModel, Field

from .document import (
    FONT_NAME,
    FONT_SIZE,
    TEMPLATE_ENV,
    Block,
    build_document,
    file_name_of,
    resolve_template,
    save_document,
)

OUT_DIR_ENV = "JURATOOLS_OUT_DIR"
DEFAULT_OUT_DIR = Path(__file__).resolve().parents[2] / "out"

NO_TEMPLATE_WARNING = (
    "No template is configured, so the document was built on python-docx's blank default. "
    f"Every run still carries the font by name, but the firm's styles and any embedded fonts "
    f"are not in the file — set {TEMPLATE_ENV} to the firm's .docx to keep them."
)


def out_dir() -> Path:
    return Path(os.environ.get(OUT_DIR_ENV) or DEFAULT_OUT_DIR).expanduser()


class DocumentResult(BaseModel):
    location: str = Field(description="Where the document was written")
    file_size_kb: int
    paragraph_count: int
    template_used: str | None = Field(description="The template the document was built on, or null if none was configured")
    warnings: list[str] = Field(default_factory=list)


class SetupResult(BaseModel):
    template_configured: bool
    template_path: str | None
    output_directory: str
    default_font: str
    default_size_pt: float


server = MCPServer(
    name="juratools-thai-docx",
    version="0.1.0",
    instructions=(
        "Creates Thai legal Word documents. Write each paragraph as its own block, in order, "
        "with the numbering (2.1., 2.2., ...) inside the text as a Thai lawyer would type it. "
        "Never invent a name, date or figure that was not given — leave it out."
    ),
)


@server.tool(
    title="Create a Thai legal Word document (.docx)",
    description=(
        "Generate a .docx laid out the way a Thai legal document is: Cordia New 16pt, Thai "
        "justification (thaiDistribute), A4 portrait with one-inch margins, and Thai text "
        "tagged as complex script so Word renders and sizes it correctly. Arabic numerals "
        "inside Thai text are handled automatically. Give it an ordered list of paragraphs; "
        "each one can be bold, aligned, indented, sized or forced onto a new page. "
        "The result is a draft for a lawyer to check — say so when reporting it."
    ),
)
def create_thai_document(
    paragraphs: list[Block],
    title: str | None = None,
    file_name: str | None = None,
    font_name: str = FONT_NAME,
    font_size: float = FONT_SIZE,
    template: str | None = None,
) -> DocumentResult:
    """Build the document and write it to the output folder.

    Args:
        paragraphs: The body, in order. One block per paragraph.
        title: Optional heading, written centered and bold above the body.
        file_name: File name without extension. Defaults to the title.
        font_name: Font for every run. Cordia New unless the firm says otherwise.
        font_size: Size in points for every run that does not set its own.
        template: A .docx to build on, overriding JURATOOLS_DOCX_TEMPLATE for this call.
    """
    blocks = list(paragraphs)
    if title:
        blocks.insert(0, Block(text=title, bold=True, align="center", space_after_pt=12))

    try:
        document, template_path = build_document(
            blocks, template=template, font_name=font_name, font_size=font_size
        )
    except FileNotFoundError as missing:
        # Anticipated: the model reads this and can ask where the template went,
        # instead of being handed an opaque crash.
        raise ToolError(str(missing)) from missing
    path = save_document(document, out_dir(), file_name_of(title, file_name))
    size_kb = round(path.stat().st_size / 1024)

    return DocumentResult(
        location=str(path),
        file_size_kb=size_kb,
        paragraph_count=len(blocks),
        template_used=str(template_path) if template_path else None,
        warnings=[] if template_path else [NO_TEMPLATE_WARNING],
    )


@server.tool(
    title="Check the document setup",
    description=(
        "Report which template and output folder this server is using, before generating "
        "anything. Use it when a document came out in the wrong font or landed somewhere "
        "unexpected."
    ),
)
def check_document_setup() -> SetupResult:
    """Report the configured template, output folder and font defaults."""
    try:
        template_path = resolve_template()
    except FileNotFoundError as missing:
        raise ToolError(f"{TEMPLATE_ENV} points at a file that is not there: {missing}") from missing

    return SetupResult(
        template_configured=template_path is not None,
        template_path=str(template_path) if template_path else None,
        output_directory=str(out_dir()),
        default_font=FONT_NAME,
        default_size_pt=FONT_SIZE,
    )


def main() -> None:
    server.run(transport="stdio")


if __name__ == "__main__":
    main()
