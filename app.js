const saleUrl = document.querySelector("#saleUrl");
const productName = document.querySelector("#productName");
const resultBox = document.querySelector("#resultBox");
const startCut = document.querySelector("#startCut");
const resetForm = document.querySelector("#resetForm");
const jobStatus = document.querySelector("#jobStatus");
const appVersion = "2026-06-05.3";

function safeFileName(value) {
  return String(value || "상품")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim() || "상품";
}

function setBusy(isBusy) {
  startCut.disabled = isBusy;
  resetForm.disabled = isBusy;
  startCut.textContent = isBusy ? "분리 중..." : "컷 분리 시작";
}

function setMessage(message) {
  jobStatus.textContent = message;
  resultBox.textContent = `[버전 ${appVersion}]\n${message}`;
}

async function startJob() {
  const url = saleUrl.value.trim();
  const product = productName.value.trim();

  if (!/^https?:\/\//i.test(url)) {
    setMessage("http 또는 https로 시작하는 판매 페이지 주소를 입력하세요.");
    saleUrl.focus();
    return;
  }

  setBusy(true);
  setMessage("페이지를 열고 이미지를 불러오는 중입니다. 긴 상세페이지는 시간이 걸릴 수 있습니다.");

  try {
    const response = await fetch("/api/cut", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, product }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || error.error || "작업에 실패했습니다.");
    }

    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = `${safeFileName(product)}.zip`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(downloadUrl);
    setMessage("완료했습니다. ZIP 파일 다운로드가 시작됐습니다.");
  } catch (error) {
    setMessage(`실패했습니다: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

function reset() {
  saleUrl.value = "";
  productName.value = "";
  setMessage("대기 중입니다. 판매 페이지 주소와 상품명을 입력한 뒤 컷 분리를 시작하세요.");
}

startCut.addEventListener("click", startJob);
resetForm.addEventListener("click", reset);

reset();
