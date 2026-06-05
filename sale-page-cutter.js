const fs = require("fs");
const path = require("path");

function requirePackage(name) {
  try {
    return require(name);
  } catch (error) {
    const modulesRoot =
      process.env.CODEX_NODE_MODULES ||
      "C:\\Users\\kikuke\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules";
    const pnpmRoot = path.join(modulesRoot, ".pnpm");
    if (!fs.existsSync(pnpmRoot)) throw error;
    const candidates = fs
      .readdirSync(pnpmRoot)
      .filter((entry) => entry === name || entry.startsWith(`${name}@`))
      .map((entry) => path.join(pnpmRoot, entry, "node_modules", name))
      .filter((entry) => fs.existsSync(entry));
    if (!candidates.length) throw error;
    return require(candidates[0]);
  }
}

const { chromium } = requirePackage("playwright");
const sharp = requirePackage("sharp");

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadLocalEnv();

const DEFAULT_OUTPUT = process.env.DOWNLOAD_DIR || path.join(__dirname, "image");

const CATEGORIES = [
  { dir: "01_대표컷", label: "대표컷" },
  { dir: "02_제품_확인컷", label: "제품 확인 컷" },
  { dir: "03_핵심_장점컷", label: "핵심 장점 컷" },
  { dir: "04_디테일컷", label: "디테일 컷" },
  { dir: "05_사용_상황컷", label: "사용/상황 컷" },
  { dir: "06_신뢰_구매_설득컷", label: "신뢰/구매 설득 컷" },
  { dir: "99_미분류", label: "미분류" },
  { dir: "_전체캡처", label: "전체 캡처" },
];

const KEYWORDS = [
  {
    dir: "02_제품_확인컷",
    words: ["구성", "구성품", "옵션", "색상", "컬러", "사이즈", "용량", "스펙", "제품 정보", "제품정보"],
  },
  {
    dir: "03_핵심_장점컷",
    words: ["장점", "특징", "효과", "포인트", "핵심", "추천", "좋은 이유", "왜", "기능", "특허"],
  },
  {
    dir: "04_디테일컷",
    words: ["디테일", "상세", "소재", "원단", "마감", "확대", "성분", "텍스처", "질감"],
  },
  {
    dir: "05_사용_상황컷",
    words: ["사용", "사용법", "착용", "활용", "상황", "라이프", "연출", "before", "after", "비포", "애프터"],
  },
  {
    dir: "06_신뢰_구매_설득컷",
    words: ["후기", "리뷰", "인증", "시험", "검사", "배송", "교환", "반품", "보증", "faq", "문의", "구매", "안심"],
  },
];

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    args[key] = value;
  }
  return args;
}

function safeName(value) {
  return String(value || "상품")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "상품";
}

function ensureDirs(productRoot) {
  fs.mkdirSync(productRoot, { recursive: true });
  for (const category of CATEGORIES) {
    fs.mkdirSync(path.join(productRoot, category.dir), { recursive: true });
  }
}

function rowIsMostlyBlank(data, width, y) {
  const step = Math.max(1, Math.floor(width / 90));
  let blank = 0;
  let total = 0;
  for (let x = 0; x < width; x += step) {
    const idx = (y * width + x) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];
    const bright = r > 238 && g > 238 && b > 238;
    const transparent = a < 10;
    if (bright || transparent) blank += 1;
    total += 1;
  }
  return blank / total > 0.96;
}

function findSegments(data, width, height) {
  const segments = [];
  const minHeight = 280;
  const maxHeight = 1800;
  const blankRunNeeded = 34;
  let start = 0;
  let blankRun = 0;

  for (let y = 0; y < height; y += 1) {
    if (rowIsMostlyBlank(data, width, y)) blankRun += 1;
    else blankRun = 0;

    const canSplit = y - start >= minHeight && blankRun >= blankRunNeeded;
    const mustSplit = y - start >= maxHeight;
    if (canSplit || mustSplit) {
      const end = canSplit ? y - blankRun : y;
      if (end - start >= minHeight) {
        segments.push({ top: start, height: end - start });
        start = Math.max(0, y - Math.floor(blankRun / 2));
      }
      blankRun = 0;
    }
  }

  if (height - start >= 120) {
    segments.push({ top: start, height: height - start });
  }

  return segments;
}

function textForSegment(textBlocks, segment) {
  const bottom = segment.top + segment.height;
  return textBlocks
    .filter((block) => block.y < bottom && block.y + block.height > segment.top)
    .map((block) => block.text)
    .join(" ")
    .toLowerCase();
}

function classifySegment(text, index, total) {
  if (index === 0) return "01_대표컷";

  for (const item of KEYWORDS) {
    if (item.words.some((word) => text.includes(word.toLowerCase()))) {
      return item.dir;
    }
  }

  const ratio = total <= 1 ? 0 : index / (total - 1);
  if (ratio < 0.25) return "03_핵심_장점컷";
  if (ratio < 0.6) return "04_디테일컷";
  if (ratio < 0.82) return "05_사용_상황컷";
  return "06_신뢰_구매_설득컷";
}

async function extractTextBlocks(page) {
  return page.evaluate(() => {
    const blocks = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.nodeValue.replace(/\s+/g, " ").trim();
      if (!text || text.length < 2) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;
      blocks.push({
        text,
        y: rect.top + window.scrollY,
        height: rect.height,
      });
    }
    return blocks;
  });
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let last = -1;
      let stable = 0;
      const timer = setInterval(() => {
        window.scrollBy(0, Math.max(480, window.innerHeight * 0.8));
        const now = window.scrollY;
        if (now === last) stable += 1;
        else stable = 0;
        last = now;
        if (stable >= 4) {
          clearInterval(timer);
          resolve();
        }
      }, 450);
    });
    window.scrollTo(0, 0);
  });
}

async function launchBrowser() {
  const executableCandidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];

  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    for (const executablePath of executableCandidates) {
      if (!fs.existsSync(executablePath)) continue;
      return chromium.launch({
        executablePath,
        headless: true,
        args: ["--disable-gpu", "--no-sandbox"],
      });
    }
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const url = args.url;
  if (!url) {
    console.error("사용법: node sale-page-cutter.js --url 판매페이지주소 --product 상품명 [--out 저장폴더]");
    process.exit(1);
  }

  const outputRoot = args.out || DEFAULT_OUTPUT;
  const productName = safeName(args.product || new URL(url).hostname);
  const productRoot = path.join(outputRoot, productName);
  ensureDirs(productRoot);

  const browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: { width: Number(args.width || 1280), height: 1400 },
    deviceScaleFactor: 1,
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  await autoScroll(page);
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const textBlocks = await extractTextBlocks(page);

  const fullPath = path.join(productRoot, "_전체캡처", "full_page.png");
  await page.screenshot({ path: fullPath, fullPage: true });
  await browser.close();

  const image = sharp(fullPath);
  const metadata = await image.metadata();
  const raw = await image.ensureAlpha().raw().toBuffer();
  const segments = findSegments(raw, metadata.width, metadata.height);
  const report = [];

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    const text = textForSegment(textBlocks, segment);
    const category = classifySegment(text, i, segments.length);
    const filename = `${String(i + 1).padStart(3, "0")}_${category}.png`;
    const target = path.join(productRoot, category, filename);
    await sharp(fullPath)
      .extract({ left: 0, top: segment.top, width: metadata.width, height: segment.height })
      .png()
      .toFile(target);
    report.push({
      file: target,
      category,
      top: segment.top,
      height: segment.height,
      textSample: text.slice(0, 120),
    });
  }

  fs.writeFileSync(
    path.join(productRoot, "분류_결과.json"),
    JSON.stringify({ url, productName, fullPath, segments: report }, null, 2),
    "utf8"
  );

  console.log(`완료: ${productRoot}`);
  console.log(`전체 캡처: ${fullPath}`);
  console.log(`자른 컷: ${segments.length}개`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
