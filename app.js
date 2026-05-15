// フォントを必ず待つ
const fontReady = document.fonts.load("600 32px 'Klee One'");

// 画面管理
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

// DOM
const video = document.getElementById("camera-video");
const canvas = document.getElementById("capture-canvas");
const ctx = canvas.getContext("2d");

const previewImg = document.getElementById("captured-image");
const editImg = document.getElementById("edit-image");
const saveImg = document.getElementById("save-image");

const shutterBtn = document.getElementById("shutter-btn");
const retryBtn = document.getElementById("retry-btn");
const toEditBtn = document.getElementById("to-edit-btn");
const doneBtn = document.getElementById("done-btn");
const backToEditBtn = document.getElementById("back-to-edit");

const offsetSlider = document.getElementById("offset-slider");
const scaleSlider = document.getElementById("scale-slider");

const toggleKishikoBtn = document.getElementById("toggle-kishiko");
const togglePlaceBtn = document.getElementById("toggle-place");

// 状態
let cameraReady = false;
let offsetY = 0;
let scale = 0.8;
let showKishiko = false;
let showPlace = false;

// 背景
const bg = new Image();
bg.src = "images/memory.jpg";

// MediaPipe
const segmentation = new SelfieSegmentation({
  locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
});
segmentation.setOptions({ modelSelection: 1 });

// 切り抜き
const personCanvas = document.createElement("canvas");
const personCtx = personCanvas.getContext("2d");

// cover描画
function drawCover(ctx, src, sw, sh, dw, dh) {
  const sa = sw / sh, da = dw / dh;
  let sx, sy, sw2, sh2;
  if (sa > da) {
    sh2 = sh;
    sw2 = sh * da;
    sx = (sw - sw2) / 2;
    sy = 0;
  } else {
    sw2 = sw;
    sh2 = sw / da;
    sx = 0;
    sy = (sh - sh2) / 2;
  }
  ctx.drawImage(src, sx, sy, sw2, sh2, 0, 0, dw, dh);
}

// カメラ起動
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

// 再描画
async function redraw() {
  await fontReady;
  const w = canvas.width, h = canvas.height;
  if (!w || !h) return;

  ctx.clearRect(0, 0, w, h);
  drawCover(ctx, bg, bg.width, bg.height, w, h);

  const pw = w * scale;
  const ph = h * scale;
  const px = (w - pw) / 2;
  const py = h * 0.45 + (offsetY / 100) * h;

  ctx.drawImage(personCanvas, px, py, pw, ph);

  const texts = [];
  if (showKishiko) texts.push("岸高同窓会");
  if (showPlace) texts.push("〇〇に行ったよ");

  if (texts.length) {
    ctx.font = "600 32px 'Klee One', cursive";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "black";
    ctx.fillStyle = "orange";

    ctx.strokeText(texts.join("　"), w / 2, h - 24);
    ctx.fillText(texts.join("　"), w / 2, h - 24);
  }

  const url = canvas.toDataURL("image/png");
  previewImg.src = url;
  editImg.src = url;
  saveImg.src = url;
}

// MediaPipe結果
segmentation.onResults(async res => {
  await fontReady;
  const w = video.videoWidth, h = video.videoHeight;

  personCanvas.width = w;
  personCanvas.height = h;

  drawCover(personCtx, video, w, h, w, h);
  personCtx.globalCompositeOperation = "destination-in";
  personCtx.filter = "blur(6px)";
  personCtx.drawImage(res.segmentationMask, 0, 0, w, h);
  personCtx.filter = "none";
  personCtx.globalCompositeOperation = "source-over";

  canvas.width = w;
  canvas.height = h;

  await redraw();
  showScreen("preview");
});

// イベント
shutterBtn.onclick = async () => {
  if (!cameraReady) {
    await startCamera();
    return;
  }
  showScreen("loading");
  segmentation.send({ image: video });
};

offsetSlider.oninput = () => { offsetY = +offsetSlider.value; redraw(); };
scaleSlider.oninput = () => { scale = +scaleSlider.value / 100; redraw(); };

toggleKishikoBtn.onclick = () => { showKishiko = !showKishiko; redraw(); };
togglePlaceBtn.onclick = () => { showPlace = !showPlace; redraw(); };

retryBtn.onclick = () => showScreen("camera");
toEditBtn.onclick = () => showScreen("edit");
doneBtn.onclick = () => showScreen("save");
backToEditBtn.onclick = () => showScreen("edit");