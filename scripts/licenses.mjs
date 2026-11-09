// Preserve the complete license text for all production packages in the distribution.
import fs from "node:fs";
import path from "node:path";
const seen = new Set();
let output =
  "# Third-party notices\n\nViewForge source: MIT. Dependencies retain their own licenses.\n";
function visit(name, base = process.cwd()) {
  const root = path.join(base, "node_modules", name),
    pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (seen.has(`${pkg.name}@${pkg.version}`)) return;
  seen.add(`${pkg.name}@${pkg.version}`);
  output += `\n\n## ${pkg.name} ${pkg.version} (${pkg.license || "see package"})\n`;
  for (const file of fs
    .readdirSync(root)
    .filter(
      (n) =>
        /^(licen[cs]e|notice|copying)/i.test(n) &&
        fs.statSync(path.join(root, n)).isFile(),
    ))
    output += `\n${file}\n\n${fs.readFileSync(path.join(root, file), "utf8")}\n`;
  for (const dep of Object.keys(pkg.dependencies || {})) {
    if (fs.existsSync(path.join(root, "node_modules", dep, "package.json")))
      visit(dep, root);
    else visit(dep);
  }
}
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
for (const name of Object.keys(pkg.dependencies)) visit(name);
fs.mkdirSync("public/licenses", { recursive: true });
fs.writeFileSync(
  "public/licenses/THIRD-PARTY-NOTICES.txt",
  output
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd() + "\n",
);
console.log(`Saved licenses for ${seen.size} production packages.`);
