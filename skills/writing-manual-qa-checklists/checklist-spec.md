# Checklist spec and rendering

The page is rendered from a JSON spec, so every checklist has the same layout: tick boxes, a progress bar, notes, **Copy results**, **Reset ticks**, Copy buttons, both themes and a phone layout. Ticks and notes are kept in the browser's localStorage under `storageKey`.

## Render and serve

Run from the folder where you keep the checklist. `<skill folder>` is the folder that holds this file:

```bash
node <skill folder>/scripts/render-checklist.mjs spec.json qa/index.html
python3 -m http.server 4410 --bind 127.0.0.1 --directory qa
```

Give the tester `http://localhost:4410/index.html?v=1`. Change `?v=` each time you re-render, so the browser can't show an old copy. Ticks survive a change of `?v=`, because localStorage is kept per origin. Opening the file directly (`file://`) also works. Node 18 or later; no dependencies. The renderer creates the output folder if it's missing.

The renderer checks the spec before it writes anything. A problem stops it with one line naming the field, for example `Invalid spec: step 1.2 paste: times must be a positive whole number`. It also refuses duplicate step ids and duplicate paste ids; pastes and starting values share one set of ids. Copy buttons copy exactly the value shown, with no trailing newline. The one exception: a carriage return becomes a plain line break.

## Top-level fields

| Field | Required | What it is |
|---|---|---|
| `title` | yes | Page title and heading, two to four words |
| `eyebrow` | yes | Small line above the title: PR, environment, account type |
| `lede` | yes | One or two sentences: what is checked, the parts and how long they take |
| `storageKey` | yes | Unique per checklist, for example `"pr-1234-staging-qa"` |
| `resultsTitle` | yes | First line of **Copy results** |
| `notesPlaceholder` | yes | Hint in the notes box |
| `cards` | yes, may be empty | Setup cards: before you start, starting values, known behaviours, not covered |
| `parts` | yes, at least one | `[{ "title", "intro", "sections": [{ "title", "intro", "steps": [...] }] }]` |
| `legend`, `legendText` | no | Chips to explain, for example `["optional", "claude"]` and `{"optional": "skip if short on time"}`. Each kind in `legend` needs its text |

## A step

```json
{
  "id": "A3.2",
  "title": "A text answer and Undo",
  "chip": "optional",
  "actions": [
    { "text": "Click [[Edit answers]]. Paste into [[TYPOGRAPHY]]:", "paste": { "id": "a32-typography", "value": "QA 11-13: Inter for body" } },
    "Click [[Undo]] beside the label."
  ],
  "expect": "After the paste: an [[EDITED]] tag and \"**1 answer changed** · not saved yet\". [[Undo]] empties the box."
}
```

- `chip` is optional: `new`, `same` (unchanged wording), `optional` or `claude` (a check the assistant runs).
- `expectLabel` is optional and replaces "Expect:" (for example "Then:").
- An action is either a string, or an object with `text` and either `paste` or `pastes` (a list).
- A step needs `id` (a string, unique on the page), `title`, `actions` and `expect`.
- A paste is either `{ "id", "value" }` or `{ "repeat", "times", "preview" }`. The second copies a generated string, for example 6,000 characters to test a length limit. `times` is a positive whole number, and `preview` is what the page shows.
- Paste `id`s must be unique on the page, starting values' ids included.

## Card blocks

`{ "p": "…" }` for a paragraph, `{ "small": "…" }` for muted small text, `{ "ul": ["…", "…"] }` for a list, `{ "callout": "…" }` for an amber callout. A starting value is `{ "label": "…", "value": "…", "id": "…", "note": "…" }`; with an `id` it gets a Copy button.

## Markup inside any text

| Write | Renders as |
|---|---|
| `[[Save changes]]` | An on-screen label, boxed. Write it exactly as displayed, capitals included |
| `{{Cmd}}` | A key |
| `**Save 2 answers?**` | Bold, for dialog titles |
| `@@https://example.com/page\|link text@@` | A link that opens in a new tab. Only http and https: any other address shows as plain text |

Everything else is escaped, so `<script>` in a paste value shows as text.

See `example-spec.json` for a small complete spec.
