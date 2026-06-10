const fs = require("fs");
const { PDFParse } = require("pdf-parse");

const FILE = process.argv[2] || "C:/Users/cesar/OneDrive/Desktop/ERP-HpyK/Ramas/cambi/Cloudflare/Excels_HPK/Quellaveco.pdf";

(async () => {
  const buf = fs.readFileSync(FILE);
  console.log("File size:", buf.length, "bytes");
  const parser = new PDFParse({ data: buf });
  // Probar varias APIs porque la doc del paquete no es clara.
  const info = await parser.getInfo?.();
  if (info) console.log("INFO:", info);
  const text = await parser.getText();
  console.log("\nKeys de result:", Object.keys(text));
  console.log("numpages:", text.numpages);
  console.log("pages array length:", text.pages?.length);
  console.log("text length:", text.text?.length);
  console.log("─".repeat(80));
  if (text.pages && text.pages.length > 0) {
    for (let i = 0; i < text.pages.length; i++) {
      const p = text.pages[i];
      console.log(`\n══ Page ${i + 1} (${typeof p === "string" ? p.length : JSON.stringify(Object.keys(p))}) ══`);
      console.log(typeof p === "string" ? p : (p.text ?? p));
    }
  } else if (text.text) {
    console.log(text.text);
  }
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
