# Discord's text formatting (for Text Anywhere notes)

Read 2026-11-08 from Discord's own help page, "Markdown Text 101 (Chat Formatting: Bold, Italic, Underline)",
https://support.discord.com/hc/en-us/articles/210298617-Markdown-Text-101-Chat-Formatting-Bold-Italic-Underline

| Look | Syntax |
| --- | --- |
| Italics | `*italics*` or `_italics_` |
| Bold | `**bold**` |
| Bold italics | `***bold italics***` |
| Underline | `__underline__` |
| Underline italics | `__*underline italics*__` |
| Underline bold | `__**underline bold**__` |
| Underline bold italics | `__***underline bold italics***__` |
| Strikethrough | `~~strikethrough~~` |
| Inline code | `` `code` `` |
| Code block | a block wrapped in ```` ``` ```` |
| Headers | `# `, `## `, `### ` at the start of a line (space required) |
| Subtext | `-# ` at the start of a line |
| Lists | `- ` or `* ` at the start of a line; indent 2 spaces to nest |
| Block quote | `> ` for one line, `>>> ` for the rest of the message |
| Spoiler | `\|\|spoiler\|\|` (not inside a code block) |
| Masked link | `[text](url)` |

The page does not document checklists (`- [ ]`); those come from GitHub-flavored Markdown.

## Standard Markdown (CommonMark) differs on `__`

CommonMark Spec 0.31.2 (John MacFarlane, 2024-01-28), § 6.2 "Emphasis and strong emphasis",
https://spec.commonmark.org/0.31.2/#emphasis-and-strong-emphasis, quoting Gruber's original Markdown description:
"Text wrapped with one `*` or `_` will be wrapped with an HTML `<em>` tag; double `*`'s or `_`'s will be wrapped with an
HTML `<strong>` tag." So in standard Markdown `__a__` is **bold**, like `**a**`, and there is no underline syntax at all.
Strikethrough (`~~`) is not in CommonMark either; it is a GitHub-flavored Markdown extension.
Discord reuses `__` for underline, which is its own extension.
