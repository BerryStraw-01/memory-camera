const fontReady = document.fonts.load("600 32px 'Klee One'");

// ===== 画面管理 =====
const screens = {
  camera: document.getElementById("screen-camera"),
  loading: document.getElementById("screen-loading"),
  preview: document.getElementById("screen-preview"),
  edit: document.getElementById("screen-edit"),
  save: document.getElementById("screen-save"),
};
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove("active"));
  screens[name].classList.add("active");
}

// ===== DOM =====
const video = document.getElementById("camera-video");
const canvas = document.getElementById("capture-canvas");
const ctx = canvas.getContext("2d");

const previewImg = document.getElementById("captured-image");
const editImg = document.getElementById("edit-image");
const saveImg = document.getElementById("save-image");

const shutterBtn = document.getElementById("camera-btn");
const retryBtn = document.getElementById("retry-btn");
const toEditBtn = document.getElementById("to-edit-btn");
const doneBtn = document.getElementById("done-btn");
const backToEditBtn = document.getElementById("back-to-edit");
const backToPreviewBtn = document.getElementById("back-to-preview");

const offsetSlider = document.getElementById("offset-slider");
const scaleSlider = document.getElementById("scale-slider");

const toggleKishikoBtn = document.getElementById("toggle-kishiko");
const togglePlaceBtn = document.getElementById("toggle-place");

// ===== 状態 =====
let cameraReady = false;
let offsetY = 0;
let scale = 0.8;
let showKishiko = false;
let showPlace = false;

// ✅ プレビューの出力サイズ（3:4）
const OUTPUT_WIDTH = 1108;
const OUTPUT_HEIGHT = 1477;

// ===== 背景 =====
const bg = new Image();
bg.src = "images/memory.jpg";

const bgReady = new Promise(resolve => {
  bg.onload = resolve;
});

// ===== MediaPipe =====
const segmentation = new SelfieSegmentation({
  locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
});
segmentation.setOptions({ modelSelection: 1 });

// ===== 切り抜き =====
const personCanvas = document.createElement("canvas");
const personCtx = personCanvas.getContext("2d");

function drawContain(ctx, src, sw, sh, dw, dh) {
  const scale = Math.min(dw / sw, dh / sh);
  const w = sw * scale;
  const h = sh * scale;
  const x = (dw - w) / 2;
  const y = (dh - h) / 2;

  ctx.drawImage(src, 0, 0, sw, sh, x, y, w, h);
}


// ===== カメラON =====
async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false
  });
  video.srcObject = stream;

  await new Promise(resolve => {
    video.onloadedmetadata = () => {
      video.play();
      resolve();
    };
  });

  cameraReady = true;
  shutterBtn.textContent = "📸 撮影";
}

// ===== 再描画 =====
async function redraw() {
  await fontReady;
  await bgReady;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // ✅ 背景（切れない）
  drawContain(ctx, bg, bg.width, bg.height, w, h);

  // ✅ 被写体
  // 被写体の元サイズ
  const srcW = personCanvas.width;
  const srcH = personCanvas.height;

  // 元の縦横比を保持
  const personAspect = srcW / srcH;

  // 基準サイズ（高さ基準が自然）
  const baseH = h * scale;
  const baseW = baseH * personAspect;

  // 描画位置
  const px = (w - baseW) / 2;
  const py = h * 0.45 + (offsetY / 100) * h;

  // 描画
  ctx.drawImage(personCanvas, px, py, baseW, baseH);

  const url = canvas.toDataURL("image/png");
  previewImg.src = url;
  editImg.src = url;
  saveImg.src = url;
}

// ===== MediaPipe結果 =====
segmentation.onResults(async res => {
  await fontReady;
  await bgReady;

  // ✅ 出力サイズを固定
  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;

  personCanvas.width = res.image.width;
  personCanvas.height = res.image.height;

  // ===== 被写体マスク作成 =====
  personCtx.clearRect(0, 0, personCanvas.width, personCanvas.height);
  personCtx.drawImage(res.image, 0, 0);

  personCtx.globalCompositeOperation = "destination-in";
  personCtx.drawImage(res.segmentationMask, 0, 0);
  personCtx.globalCompositeOperation = "source-over";

  // ===== 最終描画 =====
  await redraw();

  showScreen("preview");
});


// ===== ボタン =====
shutterBtn.onclick = async () => {
  if (!cameraReady) {
    await startCamera();
    return;
  }
  showScreen("loading");

  // ✅ 画像を一旦クリア（超重要）
  previewImg.src = "";
  editImg.src = "";
  saveImg.src = "";

  try {
    await segmentation.send({ image: video });
  } catch (e) {
    console.error(e);
    alert("画像の処理に失敗しました。もう一度撮影してください。");
    showScreen("camera");
  }
};

offsetSlider.oninput = () => {
  offsetY = +offsetSlider.value;
  redraw();
};

scaleSlider.oninput = () => {
  scale = +scaleSlider.value / 100;
  redraw();
};

toggleKishikoBtn.onclick = () => {
  showKishiko = !showKishiko;
  toggleKishikoBtn.classList.toggle("active", showKishiko);
  redraw();
};

togglePlaceBtn.onclick = () => {
  showPlace = !showPlace;
  togglePlaceBtn.classList.toggle("active", showPlace);
  redraw();
};

retryBtn.onclick = () => showScreen("camera");
toEditBtn.onclick = () => showScreen("edit");
doneBtn.onclick = () => showScreen("save");
backToEditBtn.onclick = () => showScreen("edit");
backToPreviewBtn.onclick = () => showScreen("preview");