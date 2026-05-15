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
// 状態
// =========================
let state = "idle"; // idle | ready
let currentStream = null;

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
// 切り抜き用
// =========================
const personCanvas = document.createElement("canvas");
const personCtx = personCanvas.getContext("2d");

let offsetY = 0;
let scale = 0.8;

// =========================
// カメラ起動（スマホ対応）
// =========================
async function startCamera() {
  state = "starting";
  shutterBtn.textContent = "起動中…";

  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
    currentStream = null;
  }

  try {
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });

    video.srcObject = currentStream;
    await video.play();

    state = "ready";
    shutterBtn.textContent = "📸 撮影";
  } catch (e) {
    state = "idle";
    shutterBtn.textContent = "📸 カメラを起動";
    alert("カメラを起動できません");
    console.error(e);
  }
}

// =========================
// 合成描画
// =========================
function redrawComposite() {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(backgroundImage, 0, 0, w, h);

  const pw = w * scale;
  const ph = h * scale;
  const px = (w - pw) / 2;
  const py = h * 0.45 + (offsetY / 100) * h;

  ctx.drawImage(personCanvas, px, py, pw, ph);
  img.src = canvas.toDataURL("image/png");
}

// =========================
// 切り抜き（撮影時のみ）
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
// シャッターボタン
// =========================
shutterBtn.onclick = () => {
  if (state === "idle") {
    startCamera();
    return;
  }

  if (state === "ready") {
    if (!backgroundImage.complete) return;
    segmentation.send({ image: video });
  }
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