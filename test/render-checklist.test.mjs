import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "skills", "writing-manual-qa-checklists");
const RENDERER = join(SKILL_DIR, "scripts", "render-checklist.mjs");
const EXAMPLE_SPEC = join(SKILL_DIR, "example-spec.json");

function baseSpec() {
  return {
    title: "Test checklist",
    eyebrow: "Test",
    lede: "A test.",
    storageKey: "test-key",
    resultsTitle: "Test results",
    notesPlaceholder: "Notes",
    cards: [],
    parts: [{ title: "Part", sections: [{ title: "Section", steps: [step("1.1")] }] }],
  };
}

function step(id, actions = ["Do it."]) {
  return { id, title: `Step ${id}`, actions, expect: "It works." };
}

function withActions(actions) {
  const spec = baseSpec();
  spec.parts[0].sections[0].steps = [step("1.1", actions)];
  return spec;
}

function pasteAction(paste) {
  return { text: "Paste:", paste };
}

function render(spec, { outName = "out.html", args } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "qa-render-"));
  const specPath = join(dir, "spec.json");
  writeFileSync(specPath, JSON.stringify(spec));
  const outPath = join(dir, outName);
  const result = spawnSync(process.execPath, [RENDERER, ...(args ?? [specPath, outPath])], { encoding: "utf8" });
  const html = existsSync(outPath) ? readFileSync(outPath, "utf8") : "";
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, html, outPath };
}

function count(text, fragment) {
  return text.split(fragment).length - 1;
}

function assertRefused({ status, stderr }, message) {
  assert.equal(status, 1);
  assert.match(stderr, message);
  assert.doesNotMatch(stderr, /TypeError|at file:/);
}

test("renders the example spec", () => {
  const example = JSON.parse(readFileSync(EXAMPLE_SPEC, "utf8"));
  const result = render(example);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /5 steps/);
});

test("keeps </script> in resultsTitle and storageKey inside the script's strings", () => {
  const spec = baseSpec();
  spec.resultsTitle = "</script><script>document.title='pwned'</script>";
  spec.storageKey = "</script><b>key</b>";
  const { status, stderr, html } = render(spec);
  assert.equal(status, 0, stderr);
  assert.equal(count(html, "</script>"), 1);
  assert.equal(count(html, "<script>"), 1);
});

test("refuses two pastes with the same id", () => {
  const spec = withActions([pasteAction({ id: "same", value: "one" }), pasteAction({ id: "same", value: "two" })]);
  assertRefused(render(spec), /Duplicate paste ids: same/);
});

test("refuses a paste id that repeats a starting value's id", () => {
  const spec = withActions([pasteAction({ id: "name", value: "ROUND-1" })]);
  spec.cards = [{ title: "Starting values", blocks: [{ label: "Name", value: "ORIGINAL", id: "name" }] }];
  assertRefused(render(spec), /Duplicate paste ids: name/);
});

test("keeps paste ids apart from the page's own element ids", () => {
  const spec = withActions([pasteAction({ id: "notes", value: "pasted" })]);
  const { status, stderr, html } = render(spec);
  assert.equal(status, 0, stderr);
  assert.equal(count(html, 'id="notes"'), 1);
  assert.match(html, /data-copy="paste-notes"/);
});

test("renders only http and https links", () => {
  const spec = withActions(["Open @@javascript:alert(1)|bad@@ and @@https://example.com/page|good@@."]);
  const { status, stderr, html } = render(spec);
  assert.equal(status, 0, stderr);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /<a href="https:\/\/example\.com\/page" target="_blank" rel="noopener">good<\/a>/);
});

test("leaves a placeholder-like paste value as text", () => {
  const spec = withActions([pasteAction({ id: "literal", value: "{{STORAGE_KEY}}" })]);
  const { status, stderr, html } = render(spec);
  assert.equal(status, 0, stderr);
  assert.match(html, /const STORAGE_KEY = "test-key";/);
  assert.match(html, /\{\{STORAGE_KEY\}\}<\/pre>/);
});

test("refuses an unknown chip", () => {
  const spec = baseSpec();
  spec.parts[0].sections[0].steps[0].chip = "bogus";
  assertRefused(render(spec), /Invalid spec: step 1\.1 chip "bogus"/);
});

test("refuses a legend kind with no legendText", () => {
  const spec = baseSpec();
  spec.legend = ["optional"];
  assertRefused(render(spec), /Invalid spec: legendText has no text for "optional"/);
});

test("refuses a repeat paste without a positive whole times", () => {
  const spec = withActions([pasteAction({ repeat: "x", preview: "xxx" })]);
  assertRefused(render(spec), /Invalid spec: step 1\.1 paste: times must be a positive whole number/);
});

test("refuses a spec without a storageKey", () => {
  const spec = baseSpec();
  delete spec.storageKey;
  assertRefused(render(spec), /Invalid spec: storageKey must be a non-empty string/);
});

test("prints usage when run without arguments", () => {
  const { status, stderr } = render(baseSpec(), { args: [] });
  assert.equal(status, 1);
  assert.match(stderr, /Usage: node render-checklist\.mjs <spec\.json> <out\.html>/);
});

test("creates the output folder when it doesn't exist", () => {
  const { status, stderr, outPath } = render(baseSpec(), { outName: join("qa", "nested", "index.html") });
  assert.equal(status, 0, stderr);
  assert.ok(existsSync(outPath));
});

test("keeps a paste value's leading newline", () => {
  const spec = withActions([pasteAction({ id: "lead", value: "\nsecond line" })]);
  const { status, stderr, html } = render(spec);
  assert.equal(status, 0, stderr);
  assert.match(html, /<pre id="paste-lead">\n\nsecond line<\/pre>/);
});

test("names each Copy button after what it copies, and announces the result", () => {
  const spec = withActions([pasteAction({ id: "named", value: "QA value one" })]);
  const { status, stderr, html } = render(spec);
  assert.equal(status, 0, stderr);
  assert.match(html, /aria-label="Copy: QA value one"/);
  assert.match(html, /id="copy-status"[^>]*aria-live="polite"/);
});
