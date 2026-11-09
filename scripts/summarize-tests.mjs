import fs from "node:fs";
const path = "test-results/results.json";
if (!fs.existsSync(path)) {
  console.log(
    "### Browser results\n\nThe runner did not produce a JSON report. See the failed command.",
  );
  process.exit(0);
}
const report = JSON.parse(fs.readFileSync(path, "utf8"));
console.log(
  `### Browser results\n\nPassed: ${report.stats.expected}; failed: ${report.stats.unexpected}; flaky: ${report.stats.flaky}; skipped: ${report.stats.skipped}.\n`,
);
function walk(suite) {
  for (const child of suite.suites || []) walk(child);
  for (const spec of suite.specs || [])
    for (const test of spec.tests || [])
      for (const result of test.results || [])
        if (result.status !== "passed") {
          console.log(
            `#### ${test.projectName}: ${spec.title}\n\n\`\`\`text\n${(
              result.errors || [result.error]
            )
              .filter(Boolean)
              .map((e) => e.message || JSON.stringify(e))
              .join("\n")
              .replace(/\u001b\[[0-9;]*m/g, "")
              .slice(0, 5000)}\n\`\`\`\n`,
          );
          for (const a of result.attachments || [])
            if (a.path?.endsWith(".md") && fs.existsSync(a.path))
              console.log(
                `\n<details><summary>Page state</summary>\n\n${fs.readFileSync(a.path, "utf8").slice(0, 9000)}\n\n</details>\n`,
              );
        }
}
for (const suite of report.suites || []) walk(suite);
