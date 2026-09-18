# Thai .docx MCP server

An MCP server that writes Thai legal Word documents. Point Claude (or any MCP
client) at it and ask for a document; it writes a real `.docx` to a folder and
hands back the path.

It is the python-docx prototype turned into a server, and it is deliberately
separate from `../mcp-server` (Node + JSZip, share transfer instruments and
plain documents): that one injects values into fixed firm templates, this one
builds a body paragraph by paragraph with python-docx, which is what makes it
worth keeping a second engine.

## What it gets right

Anyone can produce a `.docx` with Thai text in it. These are the parts Word
cares about and most generators miss:

- **`w:jc="thaiDistribute"`** — Thai justification. Thai has no word gaps, so
  Word fills the line by spreading characters. Ordinary `justify` leaves ragged
  Thai lines.
- **`w:cs` and `w:szCs` on every Thai run** — Word treats Thai as complex
  script and reads its font and size from the complex-script properties. Set
  only `w:sz` and Thai comes out at the wrong size, in the wrong face.
- **Arabic numerals split into runs of their own** — `700`, `1,000.50`,
  `2569/2026` are written without `w:cs`, which is what Word itself writes when
  a Thai paragraph carries digits.
- **The paragraph mark carries the font and size too**, so a 16pt paragraph
  does not get its line spacing from an 11pt paragraph mark.
- **A4 portrait, one-inch margins**, and Cordia New 16pt throughout.

## Install

```sh
cd thai-docx-mcp
python3 -m venv .venv
.venv/bin/pip install -e .
```

## Run it

```sh
.venv/bin/thai-docx-mcp          # or: .venv/bin/python -m thai_docx_mcp
```

It speaks stdio, so a client launches it rather than connecting to it. For
Claude Desktop, in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "thai-docx": {
      "command": "/absolute/path/to/thai-docx-mcp/.venv/bin/thai-docx-mcp",
      "env": {
        "JURATOOLS_OUT_DIR": "/Users/you/Documents/JuraTools",
        "JURATOOLS_DOCX_TEMPLATE": "/Users/you/Documents/templates/ABC.docx"
      }
    }
  }
}
```

For Claude Code:

```sh
claude mcp add thai-docx -- /absolute/path/to/thai-docx-mcp/.venv/bin/thai-docx-mcp
```

| Variable | Meaning |
|---|---|
| `JURATOOLS_OUT_DIR` | Where documents are written. Defaults to `thai-docx-mcp/out`, which is gitignored. |
| `JURATOOLS_DOCX_TEMPLATE` | The `.docx` to build on. Optional — see below. |

## The template

Loading the firm's own `.docx` and clearing only its body is what preserves its
styles, settings, theme, font table and **embedded fonts** — the last one is
why a document opens correctly on a machine with no Cordia New installed.

With no template configured the server still works: every run carries the font
by name, the layout is the same, and the result says in so many words that no
template was used. What is missing is the embedded fonts and any house styles.

A template named but not found is an error, not a silent fallback — a document
quietly missing the firm's fonts is worse than one that was not written.

> No template ships with this repository yet. Set `JURATOOLS_DOCX_TEMPLATE` to
> your own `ABC.docx`, or drop one in and point the variable at it.

## Tools

### `create_thai_document`

| Argument | |
|---|---|
| `paragraphs` | The body, in order — one block per paragraph. Required. |
| `title` | Optional heading, written centered and bold above the body. |
| `file_name` | File name without extension. Defaults to the title. |
| `font_name`, `font_size` | Default to Cordia New, 16pt. |
| `template` | A `.docx` to build on, overriding the environment for this call. |

Each block is `{ text, bold, align, size_pt, first_line_indent_cm,
space_after_pt, page_break_before }`, where `align` is one of `thaiDistribute`
(the default), `justify`, `left`, `center`, `right`.

Clause numbering — `2.1.`, `2.2.` — goes inside the text, the way a Thai lawyer
types it. Returns the path written, the size, the template used and any warning.

### `check_document_setup`

Reports which template and output folder the server is using, and the font
defaults. Worth calling first when a document came out in the wrong font.

## Tests

```sh
.venv/bin/python -m unittest discover -s tests
```

They assert on the generated XML — `w:cs`, `thaiDistribute`, the half-point
sizes, the order of the `w:rPr` children — rather than on a file merely being
produced, because a `.docx` that opens is not the same as a `.docx` a Thai
lawyer can use.
