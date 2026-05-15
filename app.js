// =========================
// DOM
// =========================
const cameraScreen = document.getElementById("camera-screen");
const loadingScreen = document.getElementById("loading-screen");
const previewScreen = document.getElementById("preview-screen");

const video = document.getElementById("camera-video");
const canvas = document.getElementById("capture-canvas");
const ctx = canvas.getContext("2d");
const img = document.getElementById("captured-image");

const shutterBtn = document.getElementById("shutter-btn");
const retryBtn = document.getElementById("retry-btn");
const offsetSlider = document.getElementById("offset-slider");
const scaleSlider = document.getElementById("scale-slider");

// =========================
// 状態
// =========================
let cameraReady = false;
let stream = null;
let offsetY = 0;
let scale = 0.8;

// =========================
// 背景画像
// =========================
const backgroundImage = new Image();
backgroundImage.src = "images/memory.jpg";

// =========================
// MediaPipe
// =========================
const segmentation = new SelfieSegmentation({
  locateFile: f =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
});
segmentation.setOptions({ modelSelection: 1 });

// =========================
// 切り抜き保持用 Canvas
// =========================
const personCanvas = document.createElement("canvas");
const personCtx = personCanvas.getContext("2d");

// =========================
// ✅ 合成処理（ここが重要）
// =========================
function redrawComposite() {
  const w = canvas.width;
  const h = canvas.height;
  if (!w || !h) return;

  ctx.clearRect(0, 0, w, h);

  // 背景
  ctx.drawImage(backgroundImage, 0, 0, w, h);

  // 人物配置
  const pw = w * scale;
  const ph = h * scale;
  const px = (w - pw) / 2;
  const py = h * 0.45 + (offsetY / 100) * h;

  ctx.drawImage(personCanvas, px, py, pw, ph);

  img.src = canvas.toDataURL("image/png");
}

// =========================
// カメラ起動（スマホ対応）
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
// ✅ MediaPipe結果 → 切り抜き保存 → 合成
// =========================
segmentation.onResults(results => {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return;

  // 切り抜き保存
  personCanvas.width = w;
  personCanvas.height = h;
  personCtx.clearRect(0, 0, w, h);
  personCtx.drawImage(video, 0, 0, w, h);
  personCtx.globalCompositeOperation = "destination-in";
  personCtx.drawImage(results.segmentationMask, 0, 0, w, h);
  personCtx.globalCompositeOperation = "source-over";

  // メインCanvas初期化
  canvas.width = w;
  canvas.height = h;

  // ✅ 初回合成
  redrawComposite();

  loadingScreen.classList.remove("active");
  previewScreen.classList.add("active");
});

// =========================
// シャッター
// =========================
shutterBtn.onclick = async () => {
  // 初回：カメラ起動
  if (!cameraReady) {
    await startCamera();
    return;
  }

  // 撮影
  cameraScreen.classList.remove("active");
  loadingScreen.classList.add("active");

  segmentation.send({ image: video });
};

// =========================
// ✅ シークバー（再合成）
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