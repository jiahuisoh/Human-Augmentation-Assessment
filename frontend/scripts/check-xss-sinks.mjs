/**
 * Fails the build if a cross-site scripting sink is introduced into src/.
 *
 * React escapes anything rendered through JSX, so user-supplied text reaches
 * the page as characters rather than markup. That protection is lost the
 * moment code hands a string to one of the APIs below, each of which parses
 * its input as HTML or evaluates it as code.
 *
 * This matters more here than in most applications: the session token lives in
 * localStorage, so it is readable by any script that manages to run on the
 * page. Keeping these sinks out is what makes that storage choice defensible,
 * and a guarantee that rests on nobody ever pasting the wrong line is not a
 * guarantee at all. Hence a check rather than a code review convention.
 *
 * If one of these is ever genuinely required, the input must be sanitised
 * first and the exemption argued in review, not silenced by deleting a rule.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const SINKS = [
  { pattern: /dangerouslySetInnerHTML/,            name: "dangerouslySetInnerHTML" },
  { pattern: /\.(inner|outer)HTML\s*=/,            name: "innerHTML / outerHTML assignment" },
  { pattern: /\binsertAdjacentHTML\s*\(/,          name: "insertAdjacentHTML()" },
  { pattern: /\beval\s*\(/,                        name: "eval()" },
  { pattern: /\bnew\s+Function\s*\(/,              name: "new Function()" },
  { pattern: /\bdocument\s*\.\s*write(ln)?\s*\(/,  name: "document.write()" },
];

const SOURCE = /\.(ts|tsx|js|jsx)$/;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (SOURCE.test(entry.name)) yield full;
  }
}

const findings = [];
for await (const file of walk(SRC)) {
  const lines = (await readFile(file, "utf8")).split("\n");
  lines.forEach((line, i) => {
    // Skip line comments so that discussing a sink is not the same as using one.
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    for (const { pattern, name } of SINKS) {
      if (pattern.test(line)) {
        findings.push({ file: relative(SRC, file), line: i + 1, name, text: line.trim() });
      }
    }
  });
}

if (findings.length === 0) {
  console.log(`No XSS sinks in src/ (${SINKS.length} patterns checked).`);
  process.exit(0);
}

console.error(`\nXSS sink introduced. The build is refusing to continue.\n`);
for (const f of findings) {
  console.error(`  src/${f.file}:${f.line}  ${f.name}`);
  console.error(`    ${f.text}\n`);
}
console.error(
  "Render the value through JSX so React escapes it. If raw markup is genuinely\n" +
  "required, sanitise the input first and raise the exemption in review.\n",
);
process.exit(1);
