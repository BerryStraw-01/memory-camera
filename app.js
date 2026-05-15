// =========================
// フォント読み込み待ち
// =========================
let fontsReady = false;

document.fonts.ready.then(() => {
  fontsReady = true;
  console.log("Fonts ready");
});

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
// 背景画像
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
segmentation.setOptions({
  modelSelection: 1,
  smoothSegmentation: true
});

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
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false
  });
  video.srcObject = stream;
  await video.play();

  cameraReady = true;
  shutterBtn.textContent = "📸 撮影";
}

// =========================
// 再描画（フォント待ちガード付き）
// =========================
function redraw() {
  if (!fontsReady) return;

  const w = canvas.width;
  const h = canvas.height;
  if (!w || !h) return;

  ctx.clearRect(0, 0, w, h);

  // 背景
  drawCover(ctx, bg, bg.width, bg.height, w, h);

  // 人物（色なじみ）
  const pw = w * scale;
  const ph = h * scale;
  const px = (w - pw) / 2;
  const py = h * 0.45 + (offsetY / 100) * h;

  ctx.save();
  ctx.filter = "brightness(0.97) saturate(0.95) contrast(1.03)";
  ctx.drawImage(personCanvas, px, py, pw, ph);
  ctx.restore();

  // テキスト（下中央・1行）
  const texts = [];
  if (showKishiko) texts.push("岸高同窓会");
  if (showPlace) texts.push("〇〇に行ったよ");

  if (texts.length) {
    const text = texts.join("　");

    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = "600 32px 'Klee One', cursive";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "black";
    ctx.fillStyle = "orange";

    ctx.strokeText(text, w / 2, h - 24);
    ctx.fillText(text, w / 2, h - 24);
  }

  const url = canvas.toDataURL("image/png");
  previewImg.src = url;
  editImg.src = url;
  saveImg.src = url;
}

// =========================
// MediaPipe結果
// =========================
segmentation.onResults(results => {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return;

  personCanvas.width = w;
  personCanvas.height = h;
  personCtx.clearRect(0, 0, w, h);

  drawCover(personCtx, video, w, h, w, h);

  personCtx.globalCompositeOperation = "destination-in";
  personCtx.filter = "blur(6px)";
  personCtx.drawImage(results.segmentationMask, 0, 0, w, h);
  personCtx.filter = "none";
  personCtx.globalCompositeOperation = "source-over";

  canvas.width = w;
  canvas.height = h;

  document.fonts.ready.then(() => {
    redraw();
    showScreen("preview");
  });
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
// UI
// =========================
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