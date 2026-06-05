const chromium = require("@sparticuz/chromium");
const { chromium: playwrightChromium } = require("playwright-core");
const JSZip = require("jszip");
const sharp = require("sharp");

const CATEGORIES = [
  "01_대표컷",
  "02_제품_확인컷",
  "03_핵심_장점컷",
  "04_디테일컷",
  "05_사용_상황컷",
  "06_신뢰_구매_설득컷",
  "99_미분류",
  "_전체캡처",
];

const KEYWORDS = [
  { dir: "02_제품_확인컷", words: ["구성", "구성품", "옵션", "색상", "컬러", "사이즈", "용량", "스펙", "제품 정보", "제품정보"] },
  { dir: "03_핵심_장점컷", words: ["장점", "특징", "효과", "포인트", "핵심", "추천", "좋은 이유", "기능", "특허"] },
  { dir: "04_디테일컷", words: ["디테일", "상세", "소재", "원단", "마감", "확대", "성분", "텍스처", "질감"] },
  { dir: "05_사용_상황컷", words: ["사용", "사용법", "착용", "활용", "상황", "라이프", "연출", "before", "after", "비포", "애프터"] },
  { dir: "06_신뢰_구매_설득컷", words: ["후기", "리뷰", "인증", "시험", "검사", "배송", "교환", "반품", "보증", "faq", "문의", "구매", "안심"] },
];

module.exports.config = {
  maxDuration: 60,
};

function safeName(value) {
  return String(value || "상품")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "상품";
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
    if ((r > 238 && g > 238 && b > 238) || a < 10) blank += 1;
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
    blankRun = rowIsMostlyBlank(data, width, y) ? blankRun + 1 : 0;
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

  if (height - start >= 120) segments.push({ top: start, height: height - start });
  return segments.slice(0, 80);
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
    if (item.words.some((word) => text.includes(word.toLowerCase()))) return item.dir;
  }
  const ratio = total <= 1 ? 0 : index / (total - 1);
  if (ratio < 0.25) return "03_핵심_장점컷";
  if (ratio < 0.6) return "04_디테일컷";
  if (ratio < 0.82) return "05_사용_상황컷";
  return "06_신뢰_구매_설득컷";
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let last = -1;
      let stable = 0;
      const timer = setInterval(() => {
        window.scrollBy(0, Math.max(520, window.innerHeight * 0.8));
        const now = window.scrollY;
        stable = now === last ? stable + 1 : 0;
        last = now;
        if (stable >= 4) {
          clearInterval(timer);
          resolve();
        }
      }, 420);
    });
    window.scrollTo(0, 0);
  });
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
      blocks.push({ text, y: rect.top + window.scrollY, height: rect.height });
    }
    return blocks;
  });
}

async function launchBrowser() {
  const executablePath = await chromium.executablePath();
  return playwrightChromium.launch({
    args: chromium.args,
    executablePath,
    headless: chromium.headless,
  });
}

async function handleCut(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "POST only" });
    return;
  }

  const { url, product } = req.body || {};
  if (!url || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: "올바른 http/https 판매 페이지 주소를 입력하세요." });
    return;
  }

  const productName = safeName(product);
  let browser;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 1400 },
      deviceScaleFactor: 1,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36",
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2200);
    await autoScroll(page);
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

    const textBlocks = await extractTextBlocks(page);
    const fullPng = await page.screenshot({ fullPage: true, type: "png" });
    await browser.close();
    browser = null;

    const baseImage = sharp(fullPng);
    const metadata = await baseImage.metadata();
    const raw = await sharp(fullPng).ensureAlpha().raw().toBuffer();
    const segments = findSegments(raw, metadata.width, metadata.height);
    const zip = new JSZip();
    const productFolder = zip.folder(productName);

    for (const category of CATEGORIES) productFolder.folder(category);
    productFolder.folder("_전체캡처").file("full_page.png", fullPng);

    const report = [];
    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      const text = textForSegment(textBlocks, segment);
      const category = classifySegment(text, i, segments.length);
      const filename = `${String(i + 1).padStart(3, "0")}_${category}.png`;
      const cut = await sharp(fullPng)
        .extract({ left: 0, top: segment.top, width: metadata.width, height: segment.height })
        .png()
        .toBuffer();
      productFolder.folder(category).file(filename, cut);
      report.push({ file: `${productName}/${category}/${filename}`, category, top: segment.top, height: segment.height });
    }

    productFolder.file("분류_결과.json", JSON.stringify({ url, productName, count: segments.length, segments: report }, null, 2));

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const zipName = encodeURIComponent(`${productName}.zip`);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${zipName}`);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(zipBuffer);
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    res.status(500).json({
      error: "페이지 캡처에 실패했습니다. 로그인 필요, 차단, 너무 긴 페이지, 또는 Vercel 제한일 수 있습니다.",
      detail: error.message,
    });
  }
}

module.exports = handleCut;
