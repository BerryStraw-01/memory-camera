// =========================
// DOM取得
// =========================
const cameraScreen = document.getElementById("camera-screen");
const previewScreen = document.getElementById("preview-screen");

const video = document.getElementById("camera-video");
const canvas = document.getElementById("capture-canvas");
const capturedImage = document.getElementById("captured-image");

const shutterBtn = document.getElementById("shutter-btn");
const retryBtn = document.getElementById("retry-btn");

// =========================
// ✅ 背景画像（唯一の定義）
// =========================
const backgroundImage = new Image();
backgroundImage.src = "images/memory.jpg";

// =========================
// カメラ起動
// =========================
navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => {
    video.srcObject = stream;
  });

// =========================
// MediaPipe 初期化
// =========================
const segmentation = new SelfieSegmentation({
  locateFile: file =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
});

segmentation.setOptions({
  modelSelection: 1
});

// =========================
// ✅ 人物切り抜き + 合成（正解の順序）
// =========================
segmentation.onResults(results => {
  const w = video.videoWidth;
  const h = video.videoHeight;

  if (w === 0 || h === 0) return;

  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);

  // ① 人物を先に描画
  ctx.drawImage(video, 0, 0, w, h);

  // ② マスクで人物だけ残す
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(results.segmentationMask, 0, 0, w, h);

  // ③ 背景を後ろに描画
  ctx.globalCompositeOperation = "destination-over";
  ctx.drawImage(backgroundImage, 0, 0, w, h);

  // 描画モードを戻す
  ctx.globalCompositeOperation = "source-over";

  capturedImage.src = canvas.toDataURL("image/png");

  cameraScreen.classList.remove("active");
  previewScreen.classList.add("active");
});

// =========================
// シャッター
// =========================
shutterBtn.onclick = async () => {
  if (!backgroundImage.complete || video.readyState < 2) {
    alert("準備中です。少し待ってください。");
    return;
  }

  await segmentation.send({ image: video });
};

// =========================
// 撮り直し
// =========================
retryBtn.onclick = () => {
  previewScreen.classList.remove("active");
  cameraScreen.classList.add("active");
};