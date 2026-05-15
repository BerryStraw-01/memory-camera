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
// 人物切り抜き専用 Canvas
// =========================
const personCanvas = document.createElement("canvas");
const personCtx = personCanvas.getContext("2d");

// =========================
// ✅ cover 描画（ctxを引数で渡す）
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
// ✅ MediaPipe → 切り抜き → 合成
// =========================
segmentation.onResults(results => {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;

  /* --- 人物切り抜き --- */
  personCanvas.width = vw;
  personCanvas.height = vh;
  personCtx.clearRect(0, 0, vw, vh);

  drawCover(personCtx, video, vw, vh, vw, vh);

  personCtx.globalCompositeOperation = "destination-in";
  personCtx.drawImage(results.segmentationMask, 0, 0, vw, vh);
  personCtx.globalCompositeOperation = "source-over";

  /* --- 合成 --- */
  canvas.width = vw;
  canvas.height = vh;
  ctx.clearRect(0, 0, vw, vh);

  drawCover(ctx, backgroundImage, backgroundImage.width, backgroundImage.height, vw, vh);

  const pw = vw * scale;
  const ph = vh * scale;
  const px = (vw - pw) / 2;
  const py = vh * 0.45 + (offsetY / 100) * vh;

  ctx.drawImage(personCanvas, px, py, pw, ph);

  img.src = canvas.toDataURL("image/png");

  loadingScreen.classList.remove("active");
  previewScreen.classList.add("active");
});

// =========================
// シャッター
// =========================
shutterBtn.onclick = async () => {
  if (!cameraReady) {
    await startCamera();
    return;
  }

  cameraScreen.classList.remove("active");
  loadingScreen.classList.add("active");

  segmentation.send({ image: video });
};

// =========================
// ✅ シークバー（即再合成）
// =========================
function redrawAfterAdjust() {
  if (!canvas.width) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawCover(ctx, backgroundImage, backgroundImage.width, backgroundImage.height, canvas.width, canvas.height);

  const pw = canvas.width * scale;
  const ph = canvas.height * scale;
  const px = (canvas.width - pw) / 2;
  const py = canvas.height * 0.45 + (offsetY / 100) * canvas.height;

  ctx.drawImage(personCanvas, px, py, pw, ph);
  img.src = canvas.toDataURL("image/png");
}

offsetSlider.oninput = () => {
  offsetY = +offsetSlider.value;
  redrawAfterAdjust();
};

scaleSlider.oninput = () => {
  scale = +scaleSlider.value / 100;
  redrawAfterAdjust();
};

// =========================
// 撮り直し
// =========================
retryBtn.onclick = () => {
  previewScreen.classList.remove("active");
  cameraScreen.classList.add("active");
};