// =========================
// DOM
// =========================
const cameraScreen = document.getElementById("camera-screen");
const previewScreen = document.getElementById("preview-screen");

const video = document.getElementById("camera-video");
const canvas = document.getElementById("capture-canvas");
const img = document.getElementById("captured-image");

const shutterBtn = document.getElementById("shutter-btn");
const retryBtn = document.getElementById("retry-btn");
const offsetSlider = document.getElementById("offset-slider");
const scaleSlider = document.getElementById("scale-slider");

// =========================
// 背景画像
// =========================
const backgroundImage = new Image();
backgroundImage.src = "images/memory.jpg";

// =========================
// カメラ起動
// =========================
navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => video.srcObject = stream);

// =========================
// MediaPipe
// =========================
const segmentation = new SelfieSegmentation({
  locateFile: f =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
});
segmentation.setOptions({ modelSelection: 1 });

// =========================
// 切り抜き保持
// =========================
const personCanvas = document.createElement("canvas");
const personCtx = personCanvas.getContext("2d");

// =========================
// パラメータ
// =========================
let offsetY = 0;
let scale = 0.8;
let brightnessFactor = 1.0;
let saturateFactor = 1.0;

// =========================
// ユーティリティ
// =========================
function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// =========================
// 合成描画
// =========================
function redrawComposite() {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, w, h);

  // 背景
  ctx.drawImage(backgroundImage, 0, 0, w, h);

  // 人物配置
  const pw = w * scale;
  const ph = h * scale;
  const px = (w - pw) / 2;
  const py = h * 0.45 + (offsetY / 100) * h;

  ctx.save();
  ctx.filter =
    `brightness(${brightnessFactor}) contrast(1.03) saturate(${saturateFactor})`;
  ctx.globalAlpha = 0.97;
  ctx.drawImage(personCanvas, px, py, pw, ph);
  ctx.restore();

  /* =====================
     ✅ オーバーレイ（超薄）
     ===================== */
  ctx.save();
  ctx.fillStyle = "rgba(240, 235, 225, 0.06)"; // 暖色寄り・超薄
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  img.src = canvas.toDataURL("image/png");
}

// =========================
// 切り抜き（1回のみ）
// =========================
segmentation.onResults(results => {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return;

  personCanvas.width = w;
  personCanvas.height = h;
  personCtx.clearRect(0, 0, w, h);
  personCtx.drawImage(video, 0, 0, w, h);
  personCtx.globalCompositeOperation = "destination-in";
  personCtx.drawImage(results.segmentationMask, 0, 0, w, h);
  personCtx.globalCompositeOperation = "source-over";

  canvas.width = w;
  canvas.height = h;

  redrawComposite();

  cameraScreen.classList.remove("active");
  previewScreen.classList.add("active");
});

// =========================
// シャッター
// =========================
shutterBtn.onclick = async () => {
  if (!backgroundImage.complete || video.readyState < 2) return;
  await segmentation.send({ image: video });
};

// =========================
// スライダー
// =========================
offsetSlider.oninput = () => {
  offsetY = +offsetSlider.value;
  redrawComposite();
};

scaleSlider.oninput = () => {
  scale = +scaleSlider.value / 100;
  redrawComposite();
};

// =========================
// 撮り直し
// =========================
retryBtn.onclick = () => {
  previewScreen.classList.remove("active");
  cameraScreen.classList.add("active");
};