const defaultOutput =
  "C:\\Users\\kikuke\\OneDrive\\바탕 화면\\AAA\\판매 페이지\\sample_image";

const saleUrl = document.querySelector("#saleUrl");
const productName = document.querySelector("#productName");
const outputPath = document.querySelector("#outputPath");
const commandBox = document.querySelector("#commandBox");
const copyCommand = document.querySelector("#copyCommand");
const resetForm = document.querySelector("#resetForm");
const copyStatus = document.querySelector("#copyStatus");

function psEscape(value) {
  return String(value).replace(/'/g, "''");
}

function buildCommand() {
  const url = saleUrl.value.trim() || "판매페이지주소";
  const product = productName.value.trim() || "상품명";
  const output = outputPath.value.trim() || defaultOutput;
  return `cd 'C:\\Users\\kikuke\\OneDrive\\바탕 화면\\AAA\\판매 페이지\\sample_image'\n.\\run_sale_page_cutter.ps1\n\n또는 직접 실행:\n& 'C:\\Users\\kikuke\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe' .\\sale-page-cutter.js --url '${psEscape(url)}' --product '${psEscape(product)}' --out '${psEscape(output)}'`;
}

function render() {
  commandBox.textContent = buildCommand();
  copyStatus.textContent = "";
}

async function copyToClipboard() {
  await navigator.clipboard.writeText(commandBox.textContent);
  copyStatus.textContent = "명령을 복사했습니다.";
}

function reset() {
  saleUrl.value = "";
  productName.value = "";
  outputPath.value = defaultOutput;
  render();
}

saleUrl.addEventListener("input", render);
productName.addEventListener("input", render);
outputPath.addEventListener("input", render);
copyCommand.addEventListener("click", copyToClipboard);
resetForm.addEventListener("click", reset);

reset();
