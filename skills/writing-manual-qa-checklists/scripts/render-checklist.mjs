#!/usr/bin/env node
// Renders a manual QA checklist page from a JSON spec: node render-checklist.mjs spec.json out.html
// Text fields accept a small markup: [[On-screen label]], {{Key}}, **bold**, @@https://url|link text@@.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const CHIP_LABELS = { new: "New", same: "Unchanged", optional: "Optional", claude: "Claude" };
const REQUIRED_STRINGS = ["title", "eyebrow", "lede", "storageKey", "resultsTitle", "notesPlaceholder"];
const PASTE_ID_PREFIX = "paste-";
const COPY_LABEL_MAX_CHARS = 60;
const USAGE = "Usage: node render-checklist.mjs <spec.json> <out.html>";

class SpecError extends Error {}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// A JSON string that stays inside its <script> element: "</script>" can't close it.
function jsString(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

function link(match, url, text) {
  return /^https?:\/\//i.test(url) ? `<a href="${url}" target="_blank" rel="noopener">${text}</a>` : text;
}

function inline(text) {
  return escapeHtml(text)
    .replace(/@@(\S+?)\|(.+?)@@/g, link)
    .replace(/\[\[(.+?)\]\]/g, '<span class="ui">$1</span>')
    .replace(/\{\{(.+?)\}\}/g, "<kbd>$1</kbd>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}

function copyLabel(text) {
  const [firstLine] = String(text).split("\n");
  return firstLine.length > COPY_LABEL_MAX_CHARS ? `${firstLine.slice(0, COPY_LABEL_MAX_CHARS)}…` : firstLine;
}

function copyButton(attrs, label) {
  return `<button type="button" ${attrs} aria-label="Copy: ${escapeHtml(copyLabel(label))}">Copy</button>`;
}

// The newline after <pre> is swallowed by the HTML parser, so a value's own leading newline survives.
function preBlock(id, value) {
  return `<pre id="${PASTE_ID_PREFIX}${escapeHtml(id)}">\n${escapeHtml(value)}</pre>`;
}

function pasteBlock(paste) {
  if (paste.repeat !== undefined) {
    const attrs = `data-repeat="${escapeHtml(paste.repeat)}" data-times="${paste.times}"`;
    return `<div class="paste"><pre>\n${escapeHtml(paste.preview)}</pre>${copyButton(attrs, paste.preview)}</div>`;
  }
  const attrs = `data-copy="${PASTE_ID_PREFIX}${escapeHtml(paste.id)}"`;
  return `<div class="paste">${preBlock(paste.id, paste.value)}${copyButton(attrs, paste.value)}</div>`;
}

function pastesOf(item) {
  if (typeof item === "string") return [];
  return item.pastes ?? (item.paste ? [item.paste] : []);
}

function action(item) {
  if (typeof item === "string") return `<li>${inline(item)}</li>`;
  return `<li>${inline(item.text)}${pastesOf(item).map(pasteBlock).join("")}</li>`;
}

function chip(kind) {
  if (kind === undefined) return "";
  return ` <span class="chip chip-${kind}">${CHIP_LABELS[kind]}</span>`;
}

function step(item) {
  const expectLabel = item.expectLabel ?? "Expect:";
  return `<li class="step"><div class="step-card">
  <label class="step-check">
    <input type="checkbox" data-step="${escapeHtml(item.id)}" data-title="${escapeHtml(item.title)}">
    <span class="step-no">${escapeHtml(item.id)}</span>
    <span class="step-title">${inline(item.title)}${chip(item.chip)}</span>
  </label>
  <div class="step-body">
    <ol class="acts">${item.actions.map(action).join("")}</ol>
    <p class="expect"><b>${escapeHtml(expectLabel)}</b> ${inline(item.expect)}</p>
  </div>
</div></li>`;
}

function startValue(item) {
  const copy = item.id === undefined ? "" : copyButton(`data-copy="${PASTE_ID_PREFIX}${escapeHtml(item.id)}"`, item.label);
  const pre = item.id === undefined ? `<pre>\n${escapeHtml(item.value)}</pre>` : preBlock(item.id, item.value);
  const note = item.note === undefined ? "" : `<p class="small">${inline(item.note)}</p>`;
  return `<div class="start-value"><div class="start-value-head"><span class="value-label">${inline(item.label)}</span>${copy}</div>${pre}${note}</div>`;
}

function block(item) {
  if (item.p !== undefined) return `<p>${inline(item.p)}</p>`;
  if (item.small !== undefined) return `<p class="small">${inline(item.small)}</p>`;
  if (item.ul !== undefined) return `<ul>${item.ul.map((line) => `<li>${inline(line)}</li>`).join("")}</ul>`;
  if (item.callout !== undefined) return `<div class="callout">${inline(item.callout)}</div>`;
  return startValue(item);
}

function card(item) {
  return `<div class="card"><h3>${inline(item.title)}</h3>${item.blocks.map(block).join("")}</div>`;
}

function section(item) {
  const intro = item.intro === undefined ? "" : `<p class="section-intro">${inline(item.intro)}</p>`;
  return `<h3 class="section-title">${inline(item.title)}</h3>${intro}<ol class="steps">${item.steps.map(step).join("")}</ol>`;
}

function part(item) {
  const intro = item.intro === undefined ? "" : `<p class="part-intro">${inline(item.intro)}</p>`;
  return `<h2>${inline(item.title)}</h2>${intro}${item.sections.map(section).join("")}`;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value !== "";
}

function check(condition, message) {
  if (!condition) throw new SpecError(`Invalid spec: ${message}`);
}

function checkPaste(paste, where) {
  if (paste.repeat !== undefined) {
    check(isNonEmptyString(paste.repeat), `${where} paste: repeat must be a non-empty string`);
    check(Number.isInteger(paste.times) && paste.times > 0, `${where} paste: times must be a positive whole number`);
    check(typeof paste.preview === "string", `${where} paste: preview must be a string`);
    return;
  }
  check(isNonEmptyString(paste.id), `${where} paste: id must be a non-empty string`);
  check(typeof paste.value === "string", `${where} paste ${paste.id}: value must be a string`);
}

function checkStep(item) {
  check(isNonEmptyString(item.id), "every step needs an id that is a non-empty string");
  const where = `step ${item.id}`;
  check(typeof item.title === "string", `${where} title must be a string`);
  check(typeof item.expect === "string", `${where} expect must be a string`);
  check(Array.isArray(item.actions), `${where} actions must be a list`);
  check(item.chip === undefined || item.chip in CHIP_LABELS, `${where} chip "${item.chip}" must be one of ${Object.keys(CHIP_LABELS).join(", ")}`);
  for (const entry of item.actions) {
    check(typeof entry === "string" || typeof entry.text === "string", `${where} actions must be strings or have a text`);
    for (const paste of pastesOf(entry)) checkPaste(paste, where);
  }
}

function checkCard(item) {
  check(typeof item.title === "string" && Array.isArray(item.blocks), "every card needs a title and a list of blocks");
  for (const entry of item.blocks) {
    const isText = ["p", "small", "ul", "callout"].some((key) => entry[key] !== undefined);
    check(isText || (typeof entry.label === "string" && typeof entry.value === "string"), `card "${item.title}": a block needs p, small, ul, callout, or a label and a value`);
    check(entry.id === undefined || isNonEmptyString(entry.id), `card "${item.title}": a value's id must be a non-empty string`);
  }
}

function validateSpec(spec) {
  for (const field of REQUIRED_STRINGS) check(isNonEmptyString(spec[field]), `${field} must be a non-empty string`);
  check(Array.isArray(spec.cards), "cards must be a list");
  check(Array.isArray(spec.parts) && spec.parts.length > 0, "parts must be a non-empty list");
  for (const kind of spec.legend ?? []) {
    check(kind in CHIP_LABELS, `legend kind "${kind}" must be one of ${Object.keys(CHIP_LABELS).join(", ")}`);
    check(typeof spec.legendText?.[kind] === "string", `legendText has no text for "${kind}"`);
  }
  spec.cards.forEach(checkCard);
  for (const partItem of spec.parts) {
    check(typeof partItem.title === "string" && Array.isArray(partItem.sections), "every part needs a title and a list of sections");
    for (const sectionItem of partItem.sections) {
      check(typeof sectionItem.title === "string" && Array.isArray(sectionItem.steps), "every section needs a title and a list of steps");
      sectionItem.steps.forEach(checkStep);
    }
  }
}

function duplicatesOf(ids) {
  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
}

function assertUniqueIds(spec) {
  const steps = spec.parts.flatMap((p) => p.sections.flatMap((s) => s.steps));
  const duplicateSteps = duplicatesOf(steps.map((st) => st.id));
  if (duplicateSteps.length > 0) throw new SpecError(`Duplicate step ids: ${duplicateSteps.join(", ")}`);
  const valueIds = spec.cards.flatMap((c) => c.blocks).map((b) => b.id).filter((id) => id !== undefined);
  const pasteIds = steps.flatMap((st) => st.actions.flatMap(pastesOf)).map((p) => p.id).filter((id) => id !== undefined);
  const duplicatePastes = duplicatesOf([...valueIds, ...pasteIds]);
  if (duplicatePastes.length > 0) throw new SpecError(`Duplicate paste ids: ${duplicatePastes.join(", ")}`);
}

function renderPage(spec, template) {
  const legend = spec.legend
    ? `<div class="legend small">${spec.legend.map((kind) => `<span><span class="chip chip-${kind}">${CHIP_LABELS[kind]}</span> ${escapeHtml(spec.legendText[kind])}</span>`).join("")}</div>`
    : "";
  const slots = {
    TITLE: escapeHtml(spec.title),
    EYEBROW: inline(spec.eyebrow),
    HEADING: inline(spec.title),
    LEDE: inline(spec.lede),
    LEGEND: legend,
    CARDS: spec.cards.map(card).join(""),
    PARTS: spec.parts.map(part).join(""),
    NOTES_PLACEHOLDER: escapeHtml(spec.notesPlaceholder),
    STORAGE_KEY: jsString(spec.storageKey),
    RESULTS_TITLE: jsString(spec.resultsTitle),
  };
  // One pass, so a placeholder inside spec content is never filled in.
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, name) => slots[name] ?? match);
}

function main([specPath, outPath]) {
  if (specPath === undefined || outPath === undefined) {
    console.error(USAGE);
    process.exit(1);
  }
  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  validateSpec(spec);
  assertUniqueIds(spec);
  const template = readFileSync(new URL("./checklist-template.html", import.meta.url), "utf8");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, renderPage(spec, template));
  const stepCount = spec.parts.reduce((sum, p) => sum + p.sections.reduce((n, s) => n + s.steps.length, 0), 0);
  console.log(`Wrote ${outPath}: ${stepCount} steps`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof SpecError)) throw error;
  console.error(error.message);
  process.exit(1);
}
