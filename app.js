// =========================
// 画面管理
// =========================
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

// =========================
// DOM
// =========================
const video = document.getElementById("camera-video");
const canvas = document.getElementById("capture-canvas");
const ctx = canvas.getContext("2d");

const previewImg = document.getElementById("captured-image");
const editImg = document.getElementById("edit-image");
const saveImg = document.getElementById("save-image");

const shutterBtn = document.getElementById("shutter-btn");
const retryBtn = document.getElementById("retry-btn");
const toEditBtn = document.getElementById("to-edit-btn");
const backToPreviewBtn = document.getElementById("back-to-preview");
const doneBtn = document.getElementById("done-btn");
const backToEditBtn = document.getElementById("back-to-edit");

const offsetSlider = document.getElementById("offset-slider");
const scaleSlider = document.getElementById("scale-slider");

const toggleKishikoBtn = document.getElementById("toggle-kishiko");
const togglePlaceBtn = document.getElementById("toggle-place");

// =========================
// 状態
// =========================
let stream = null;
let cameraReady = false;
let offsetY = 0;
let scale = 0.8;

let showKishiko = false;
let showPlace = false;

// =========================
// 背景
// =========================
const bg = new Image();
bg.src = "images/memory.jpg";

// =========================
// MediaPipe
// =========================
const segmentation = new SelfieSegmentation({
  locateFile: f =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
});
segmentation.setOptions({ modelSelection: 1 });

// =========================
// 人物切り抜きCanvas
// =========================
const personCanvas = document.createElement("canvas");
const personCtx = personCanvas.getContext("2d");

// =========================
// cover描画
// =========================
function drawCover(ctxTarget, src, sw, sh, dw, dh) {
  const srcAspect = sw / sh;
  const dstAspect = dw / dh;

  let sx, sy, sWidth, sHeight;
  if (srcAspect > dstAspect) {
    sHeight = sh;
    sWidth = sh * dstAspect;
    sx = (sw - sWidth) / 2;
    sy = 0;
  } else {
    sWidth = sw;
    sHeight = sw / dstAspect;
    sx = 0;
    sy = (sh - sHeight) / 2;
  }

  ctxTarget.drawImage(
    src,
    sx, sy, sWidth, sHeight,
    0, 0, dw, dh
  );
}

// =========================
// カメラ起動
// =========================
async function startCamera() {
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false
  });
  video.srcObject = stream;
  await video.play();
  cameraReady = true;
  shutterBtn.textContent = "📸 撮影";
}

// =========================
// ✅ 再描画（下中央・1行）
// =========================
function redraw() {
  const w = canvas.width;
  const h = canvas.height;
  if (!w || !h) return;

  ctx.clearRect(0, 0, w, h);

  // 背景
  drawCover(ctx, bg, bg.width, bg.height, w, h);

  // 人物
  const pw = w * scale;
  const ph = h * scale;
  const px = (w - pw) / 2;
  const py = h * 0.45 + (offsetY / 100) * h;
  ctx.drawImage(personCanvas, px, py, pw, ph);

  // ===== テキスト（1行・下中央）=====
  const texts = [];
  if (showKishiko) texts.push("岸高同窓会");
  if (showPlace) texts.push("岸和田城");

  if (texts.length > 0) {
    const text = texts.join("　"); // 全角スペースで結合

    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = "32px sans-serif";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "black";
    ctx.fillStyle = "orange";

    const x = w / 2;
    const y = h - 24;

    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  }

  const url = canvas.toDataURL("image/png");
  previewImg.src = url;
  editImg.src = url;
  saveImg.src = url;
}

// =========================
// MediaPipe結果
// =========================
segmentation.onResults(res => {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return;

  personCanvas.width = w;
  personCanvas.height = h;
  personCtx.clearRect(0, 0, w, h);

  drawCover(personCtx, video, w, h, w, h);

  personCtx.globalCompositeOperation = "destination-in";
  personCtx.drawImage(res.segmentationMask, 0, 0, w, h);
  personCtx.globalCompositeOperation = "source-over";

  canvas.width = w;
  canvas.height = h;

  redraw();
  showScreen("preview");
});

// =========================
// シャッター
// =========================
shutterBtn.onclick = async () => {
  if (!cameraReady) {
    await startCamera();
    return;
  }
  showScreen("loading");
  segmentation.send({ image: video });
};

// =========================
// シークバー
// =========================
offsetSlider.oninput = () => {
  offsetY = +offsetSlider.value;
  redraw();
};

scaleSlider.oninput = () => {
  scale = +scaleSlider.value / 100;
  redraw();
};

// =========================
// 編集トグル
// =========================
toggleKishikoBtn.onclick = () => {
  showKishiko = !showKishiko;
  redraw();
};

togglePlaceBtn.onclick = () => {
  showPlace = !showPlace;
  redraw();
};

// =========================
// 画面遷移
// =========================
retryBtn.onclick = () => showScreen("camera");
toEditBtn.onclick = () => showScreen("edit");
backToPreviewBtn.onclick = () => showScreen("preview");
doneBtn.onclick = () => showScreen("save");
backToEditBtn.onclick = () => showScreen("edit");