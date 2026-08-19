const fs = require("fs");
const path = require("path");

const Babel = require("../static/vendor/babel.min.js");

const rootDir = path.resolve(__dirname, "..");
const staticDir = path.join(rootDir, "static");
const outputDir = path.join(staticDir, "compiled");
const entries = ["dashboard", "trello", "teilnahmebedingungen", "aufgabenverwaltung"];

fs.mkdirSync(outputDir, { recursive: true });

for (const entry of entries) {
  const sourcePath = path.join(staticDir, `${entry}.jsx`);
  const outputPath = path.join(outputDir, `${entry}.js`);
  const source = fs.readFileSync(sourcePath, "utf8");
  const result = Babel.transform(source, {
    presets: [["react", { runtime: "classic" }]],
    sourceType: "script",
    comments: false,
  });

  fs.writeFileSync(
    outputPath,
    `// Generated from ../${entry}.jsx by scripts/build-jsx.js\n${result.code}\n`,
    "utf8",
  );
  console.log(`Built static/compiled/${entry}.js`);
}
