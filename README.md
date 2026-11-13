# Manual QA checklists

A Claude Code plugin that writes manual QA checklists people can actually follow: a page of click-by-click steps that you tick off in the browser as you test a PR, a feature or a release.

Each checklist:

- uses the labels exactly as the screen shows them, and names every dialog that opens on the way;
- gives everything you need to type as a block with a **Copy** button;
- starts from recorded starting values and ends with clean-up steps that put them back;
- notes behaviours that look wrong but aren't failures, so you don't stop on them;
- saves your ticks and notes in the browser, with **Copy results** for reporting back;
- ends with "QA done", after which Claude checks, read only, that everything is back as it was.

Behind the page, Claude checks what is actually deployed and reads the code behind every step. It looks at each screen without changing anything, creates any test data it needs from throwaway values, and has the checklist reviewed independently before handing it over.

## Install

In Claude Code:

```
/plugin marketplace add lalanametala/manual-qa-checklists
/plugin install manual-qa-checklists@manual-qa-checklists
```

## Use

Ask for a checklist in your own words, for example:

> Write me a manual QA checklist for PR #482 on staging.

> I'm releasing the onboarding feature. Give me a QA script of everything it does, on staging.

Claude asks what it can't work out from the repository: usually the environment URL and which test accounts to use.

## What it needs

- **Node 18 or later**, to render the page (no packages to install).
- **Python 3**, to serve it on `localhost`. You can also open the file directly.
- **Optional:**
  - a browser tool for Claude, such as Claude in Chrome or Playwright, so it can copy labels from the live screen;
  - read-only access to the environment's data, so it can record starting values.

  Without these, Claude marks the expected results it could only read from the code.

## What's inside

```
skills/writing-manual-qa-checklists/
  SKILL.md                  the method Claude follows
  checklist-spec.md         the JSON format a checklist is written in
  example-spec.json         a small complete example
  scripts/render-checklist.mjs
  scripts/checklist-template.html
test/render-checklist.test.mjs
```

To render a spec yourself: `node skills/writing-manual-qa-checklists/scripts/render-checklist.mjs spec.json index.html`.

## Develop

The renderer's tests use Node's built-in test runner, with nothing to install:

```
node --test test/render-checklist.test.mjs
```

## License

MIT
