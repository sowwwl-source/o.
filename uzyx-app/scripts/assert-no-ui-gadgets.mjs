import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

const FILE_EXTS = new Set([".ts", ".tsx", ".css", ".html"]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function posToLineCol(text, index) {
  const idx = clamp(index, 0, text.length);
  let line = 1;
  let col = 1;
  for (let i = 0; i < idx; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}

function isZeroToken(tok) {
  const t = tok.trim().toLowerCase();
  if (!t) return true;
  // 0, 0px, 0.0rem, 0%
  return /^0+(\.0+)?([a-z%]+)?$/i.test(t);
}

function isZeroRadius(value) {
  const cleaned = String(value)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/!important\b/gi, " ")
    .trim();
  if (!cleaned) return true;
  const parts = cleaned.split(/[\/\s]+/g).filter(Boolean);
  if (parts.length === 0) return true;
  return parts.every(isZeroToken);
}

function withGlobal(re) {
  const flags = re.flags.includes("g") ? re.flags : re.flags + "g";
  return new RegExp(re.source, flags);
}

const SIMPLE_RULES = [
  { id: "img", re: /<\s*img\b/gi, msg: "<img> interdit (images=false)" },
  { id: "button", re: /<\s*button\b/gi, msg: "<button> interdit (buttons=false)" },
  { id: "role-button", re: /role\s*=\s*["']button["']/gi, msg: 'role="button" interdit (buttons=false)' },
  { id: "borderRadius", re: /\bborderRadius\b/gi, msg: "borderRadius interdit (radius=false)" },
  {
    id: "url-image",
    re: /url\(\s*["']?[^"')]+?\.(png|jpe?g|gif|webp|svg)\b[^"')]*\)/gi,
    msg: "url(image.*) interdit (images=false)",
  },
];

const RADIUS_DECL_RE = /border-radius\s*:\s*([^;]+);?/gi;

async function walkFiles(dir, out) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await walkFiles(full, out);
    } else if (ent.isFile()) {
      const ext = path.extname(ent.name).toLowerCase();
      if (!FILE_EXTS.has(ext)) continue;
      out.push(full);
    }
  }
}

async function main() {
  const files = [];
  await walkFiles(path.join(ROOT, "src"), files);
  files.push(path.join(ROOT, "index.html"));

  const violations = [];

  for (const file of files) {
    let text = "";
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const rel = path.relative(ROOT, file);

    for (const rule of SIMPLE_RULES) {
      const re = withGlobal(rule.re);
      for (const m of text.matchAll(re)) {
        const at = posToLineCol(text, m.index ?? 0);
        violations.push({ file: rel, line: at.line, col: at.col, msg: rule.msg });
        if (violations.length > 80) break;
      }
      if (violations.length > 80) break;
    }

    for (const m of text.matchAll(withGlobal(RADIUS_DECL_RE))) {
      const raw = m[1] ?? "";
      if (isZeroRadius(raw)) continue;
      const at = posToLineCol(text, m.index ?? 0);
      violations.push({ file: rel, line: at.line, col: at.col, msg: `border-radius non-zero interdit (radius=false): ${raw.trim()}` });
      if (violations.length > 80) break;
    }

    if (violations.length > 80) break;
  }

  if (violations.length) {
    // eslint-disable-next-line no-console
    console.error("\nASSERT_NO_UI_GADGETS = true → violations:\n");
    for (const v of violations) {
      // eslint-disable-next-line no-console
      console.error(`- ${v.file}:${v.line}:${v.col} ${v.msg}`);
    }
    // eslint-disable-next-line no-console
    console.error("\nFix: typographie + points/degrés + diagonales + mouvement + déformation. Aucun gadget UI.\n");
    process.exit(1);
  }
}

main();

