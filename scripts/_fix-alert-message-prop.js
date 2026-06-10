// Sweep: <Alert ... message=...> → <Alert ... title=...>
// Renombra el prop `message` por `title` SOLO dentro de tags <Alert ...>.
//
// Estrategia: regex no-greedy que captura desde `<Alert` hasta el siguiente
// `message=` que no esté después de un `>`. Como JSX attribute values pueden
// tener `{...}` con `}` pero no `>`, podemos usar `[^>]*?` para detener antes
// de cerrar el tag.
const fs = require("fs");
const path = require("path");

const SRC_DIR = path.resolve("src");
const exts = new Set([".tsx", ".ts", ".jsx", ".js"]);

function listFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(full));
    else if (exts.has(path.extname(e.name))) out.push(full);
  }
  return out;
}

let totalReplaced = 0;
const filesChanged = [];

for (const file of listFiles(SRC_DIR)) {
  let src = fs.readFileSync(file, "utf8");
  if (!src.includes("<Alert")) continue;

  // Aplicamos el reemplazo iterativamente hasta que no haya más matches.
  // Cada iteración reemplaza UN `message=` por tag <Alert>.
  let replacedInFile = 0;
  let iters = 0;
  while (iters++ < 50) {
    // Match: `<Alert` + cualquier cosa que no contenga `>` + ` message=`
    // (Suficiente porque `>` solo aparece al cerrar el tag).
    const re = /(<Alert\b[^>]*?)\smessage=/;
    const m = re.exec(src);
    if (!m) break;
    src = src.slice(0, m.index) + m[1] + " title=" + src.slice(m.index + m[0].length);
    replacedInFile++;
  }

  if (replacedInFile > 0) {
    fs.writeFileSync(file, src, "utf8");
    totalReplaced += replacedInFile;
    filesChanged.push({ file: path.relative(process.cwd(), file), count: replacedInFile });
  }
}

console.log(`\n══ SWEEP COMPLETO ══`);
console.log(`Archivos modificados: ${filesChanged.length}`);
console.log(`Total replacements:   ${totalReplaced}\n`);
for (const f of filesChanged) console.log(`  ${String(f.count).padStart(2)} × ${f.file}`);
