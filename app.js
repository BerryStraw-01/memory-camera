const fontReady = document.fonts.ready;

const PRESETS = {
  "kishiwada-hare": {
    image: "images/kishiwada-hare.png",
    place: "岸和田城（晴れ）"
  },
  "kishiwada-kumori": {
    image: "images/kishiwada-kumori.jpg",
    place: "岸和田城（曇り）"
  }
};

let currentBgKey = "kishiwada-hare";

// 顔は画像の上30%くらいと仮定
const faceYRatio = 0.25;

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
const toEditBtn = document.getElementById("to-edit-btn");

const offsetSlider = document.getElementById("offset-slider");
const scaleSlider = document.getElementById("scale-slider");

const toggleKishikoBtn = document.getElementById("toggle-kishiko");
const togglePlaceBtn = document.getElementById("toggle-place");

const btnText = document.querySelector("#camera-btn .btn-text");

// ===== 状態 =====
let cameraReady = false;
let offsetY = 0;
let scale = 1.2;
let showKishiko = false;
let showPlace = false;
let lastSegmentationResult = null;

let cachedPersonCanvas = null;
let cachedBounds = null;
let cachedBackgroundReady = false;
let needsRender = false;

let finalImageURL = null;

let onnxRunning = false;

const OUTPUT_WIDTH = 1108;
const OUTPUT_HEIGHT = 1477;

// ===== 背景 =====
const bg = new Image();

// ===== MediaPipe =====
const segmentation = new SelfieSegmentation({
  locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
});
segmentation.setOptions({
  modelSelection: 1,
  selfieMode: false
});

// ===== 切り抜き =====
const personCanvas = document.createElement("canvas");
const personCtx = personCanvas.getContext("2d");

function getBgParam() {
  const params = new URLSearchParams(window.location.search);
  return params.get("bg"); // 例: kishiwada-hare
}

function setBackgroundByKey(key) {
  const preset = PRESETS[key];
  if (!preset) {
    console.warn("未知の bgKey:", key);
    return;
  }

  currentBgKey = key;
  bg.src = preset.image;

  bg.onload = async () => {
  };
}

function drawCover(ctx, src, sw, sh, dw, dh) {
  const scale = Math.max(dw / sw, dh / sh);

  const w = sw * scale;
  const h = sh * scale;

  const x = (dw - w) / 2;
  const y = (dh - h) / 2;

  ctx.drawImage(src, 0, 0, sw, sh, x, y, w, h);
}

// ===== カメラON =====
async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    },
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
  btnText.textContent = "撮影";
}

// ===== 共通描画（背景＋人物） =====
// ===== 元のCanvas =====
const personWorkCanvas = document.createElement("canvas");

async function drawBase() {
}

function upsampleToOriginal(src256, targetCanvas) {
  const ctx = targetCanvas.getContext("2d");

  const temp = document.createElement("canvas");
  temp.width = 256;
  temp.height = 256;

  temp.getContext("2d").drawImage(src256, 0, 0);

  ctx.drawImage(temp, 0, 0, targetCanvas.width, targetCanvas.height);
}

function applyVibrance(canvas, amount = 0.5) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = img.data;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    const sat = max === 0 ? 0 : (max - min) / max;

    // ✅ 彩度が低いほど強く補正
    const boost = 1 + amount * (1 - sat);

    r = r + (r - max) * (boost - 1);
    g = g + (g - max) * (boost - 1);
    b = b + (b - max) * (boost - 1);

    data[i] = Math.min(255, Math.max(0, r));
    data[i+1] = Math.min(255, Math.max(0, g));
    data[i+2] = Math.min(255, Math.max(0, b));
  }

  ctx.putImageData(img, 0, 0);
}

function setBackground(url) {
  // 背景画像を変更
  bg.src = url;

  // 背景ロード完了後に再描画
  bg.onload = async () => {
    await redraw();
  };
}

// ===== プレビュー描画（文字なし） =====

const workCanvas = document.createElement("canvas");
const workCtx = workCanvas.getContext("2d");
const personWorkCtx = personWorkCanvas.getContext("2d");

const personLightCanvas = document.createElement("canvas");
const personLightCtx = personLightCanvas.getContext("2d");

async function redraw() {
}

async function drawPersonWithSegmentation(res) {
  const w = res.image.width;
  const h = res.image.height;

  personCanvas.width = w;
  personCanvas.height = h;

  personCtx.clearRect(0, 0, w, h);
  personCtx.drawImage(res.image, 0, 0, w, h);

  personCtx.globalCompositeOperation = "destination-in";
  personCtx.drawImage(res.segmentationMask, 0, 0, w, h);
  personCtx.globalCompositeOperation = "source-over";
}


function prepareONNXInput() {
  const img256 = resizeTo256(personCanvas);
  const mask256 = resizeTo256(maskCanvas); // segmentationMask を描いた canvas

  return { img256, mask256 };
}

async function applyONNX() {
  if (!ortSession) return null;
  if (onnxRunning) return null;   // ★ 追加

  onnxRunning = true;
  try {
    const { img256, mask256 } = prepareONNXInput();
    const output = await runONNX(img256, mask256);
    return output;
  } finally {
    onnxRunning = false;
  }
}

function getPersonBoundsFromMask(maskCanvas) {
  const ctx = maskCanvas.getContext("2d");
  const { width, height } = maskCanvas;
  const data = ctx.getImageData(0, 0, width, height).data;

  let top = height, bottom = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] > 10) { // alpha がある = 人物
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  if (bottom <= top) return null;

  return {
    top,
    bottom,
    height: bottom - top
  };
}

function applyONNXResultToPerson(output) {
  if (!output) return;

  const tmpCanvas = document.createElement("canvas");
  tmpCanvas.width = 256;
  tmpCanvas.height = 256;
  tensorToCanvas(output, tmpCanvas);

  // 差分として弱く重ねる（自然合成）
  personCtx.save();
  personCtx.globalAlpha = 0.4;                // 0.3〜0.5で調整
  personCtx.globalCompositeOperation = "overlay";
  personCtx.drawImage(
    tmpCanvas,
    0, 0,
    personCanvas.width,
    personCanvas.height
  );
  personCtx.restore();
}


function isBgReady() {
  return bg.complete && bg.naturalWidth > 0;
}

function drawPin(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);

  // 本体（しずく型）
  ctx.beginPath();
  ctx.moveTo(0, size);

  ctx.bezierCurveTo(
    size, size * 0.4,
    size * 0.8, -size,
    0, -size
  );

  ctx.bezierCurveTo(
    -size * 0.8, -size,
    -size, size * 0.4,
    0, size
  );

  ctx.fillStyle = "#ff7aa8";
  ctx.fill();

  // 中央の丸
  ctx.beginPath();
  ctx.arc(0, -size * 0.2, size * 0.35, 0, Math.PI * 2);

  ctx.fillStyle = "#ffffff";
  ctx.fill();

  ctx.restore();
}

// ===== 保存用描画（文字あり） =====
async function redrawFinal() {

  await fontReady;

  await drawBase();

  const w = canvas.width;
  const h = canvas.height;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 86px 'Klee One', cursive";

  // ===== 上の文字 =====
  if (showKishiko) {
    const x = w / 2;
    const y = h * 0.05;

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 10;
    ctx.lineJoin = "round";
    ctx.strokeText("in 岸高同窓会", x, y);

    ctx.fillStyle = "#ff7aa8";
    ctx.fillText("in 岸高同窓会", x, y);
  }

  // ===== 下の場所 =====
  if (showPlace) {

    const textX = w / 2 + 40;  // 少し右にずらして中央バランス
    const textY = h * 0.95;

    const pinX = textX - 230;  // ピン位置
    const pinY = textY;

    // ✅ ピン描画
    drawPin(ctx, pinX, pinY, 50);

    // ✅ 文字
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 10;
    ctx.lineJoin = "round";
    const preset = getCurrentPreset();
    const placeText = preset.place ?? "";

    ctx.fillStyle = "#ff7aa8";
    ctx.strokeText(placeText, textX, textY);
    ctx.fillText(placeText, textY);
  }

  finalImageURL = canvas.toDataURL("image/png");
}

// ===== ボタン =====
shutterBtn.onclick = async () => {
  if (!cameraReady) {
    await startCamera();
    return;
  }

  showScreen("loading");

  previewImg.src = "";
  editImg.src = "";
  saveImg.src = "";

  const tempCanvas = document.createElement("canvas");
  const tctx = tempCanvas.getContext("2d");

  tempCanvas.width = video.videoWidth;
  tempCanvas.height = video.videoHeight;

  tctx.drawImage(video, 0, 0);

  await segmentation.send({ image: tempCanvas });
};

function renderLoop() {
  if (needsRender && lastSegmentationResult) {
    renderLight();          // ← 軽量描画のみ
    needsRender = false;
  }
  requestAnimationFrame(renderLoop);
}

// 起動時に1回呼ぶ
renderLoop();

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}


scaleSlider.oninput = () => {
  scale = +scaleSlider.value / 100;
  needsRender = true;
};


offsetSlider.oninput = () => {
  offsetY = (+offsetSlider.value) / 100;
  needsRender = true;
};

// ===== ボタンイベントの修正 =====

// 「岸高同窓会」ボタンを押したとき
toggleKishikoBtn.onclick = async () => {
  showKishiko = !showKishiko;

  toggleKishikoBtn.classList.toggle("active", showKishiko);

  await redrawFinal();
  editImg.src = finalImageURL;
};

togglePlaceBtn.onclick = async () => {
  showPlace = !showPlace;

  togglePlaceBtn.classList.toggle("active", showPlace);

  await redrawFinal();
  editImg.src = finalImageURL;
};

// ✅ プレビュー画面から「編集画面（toEdit）」に移る瞬間の処理も最適化
toEditBtn.onclick = async () => {
  // 編集画面へ移る際、現在のボタンの状態（文字ON/OFF）を反映した画像を生成
  await redrawFinal();
  if (finalImageURL) editImg.src = finalImageURL;
  showScreen("edit");
};

const saveBtn = document.getElementById("save-btn");

saveBtn.onclick = async () => {
  await redrawFinal();

  saveImg.src = finalImageURL;

  showScreen("save"); // ✅ 保存画面へ
};

const saveBackBtn = document.getElementById("save-back-btn");

if (saveBackBtn) {
  saveBackBtn.onclick = () => {
    showScreen("edit"); // ✅ 編集画面に戻る
  };
}

const retryBtn = document.getElementById("retry-btn");
const editBackBtn = document.getElementById("edit-back-btn");

retryBtn.onclick = () => showScreen("camera");

editBackBtn.onclick = () => {
showScreen("preview");
};

let ortSession;

async function loadONNX() {
  try {
    ortSession = await ort.InferenceSession.create("harmonization_fixed.onnx");
    console.log("✅ ONNX loaded");
  } catch (e) {
    console.error("❌ ONNX load failed:", e);
  }
}

function canvasToTensor(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const imgData = ctx.getImageData(0, 0, width, height).data;

  const data = new Float32Array(width * height * 3);

  for (let i = 0; i < width * height; i++) {
    data[i] = imgData[i * 4] / 255;
    data[i + width * height] = imgData[i * 4 + 1] / 255;
    data[i + width * height * 2] = imgData[i * 4 + 2] / 255;
  }

  return new ort.Tensor("float32", data, [1, 3, height, width]);
}

function maskToTensor(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const imgData = ctx.getImageData(0, 0, width, height).data;

  const data = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    data[i] = imgData[i * 4] / 255;
  }

  return new ort.Tensor("float32", data, [1, 1, height, width]);
}

async function runONNX(imageCanvas, maskCanvas) {
  const image = canvasToTensor(imageCanvas); // [1,3,H,W]
  const mask = maskToTensor(maskCanvas);     // [1,1,H,W]

  const H = image.dims[2];
  const W = image.dims[3];

  const inputData = new Float32Array(4 * H * W);

  // ✅ RGBコピー
  inputData.set(image.data, 0);

  // ✅ maskを4ch目に追加
  inputData.set(mask.data, 3 * H * W);

  const inputTensor = new ort.Tensor("float32", inputData, [1, 4, H, W]);

  const result = await ortSession.run({
    input: inputTensor   // ← 名前も一致させる
  });

  return result.output;
}

function resizeTo256(srcCanvas) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  c.getContext("2d").drawImage(srcCanvas, 0, 0, 256, 256);
  return c;
}

function tensorToCanvas(tensor, canvas) {
  const ctx = canvas.getContext("2d");
  const [_, __, h, w] = tensor.dims;
  const data = tensor.data;

  const img = ctx.createImageData(w, h);

  for (let i = 0; i < w * h; i++) {
    img.data[i * 4] = data[i] * 255;
    img.data[i * 4 + 1] = data[i + w * h] * 255;
    img.data[i * 4 + 2] = data[i + w * h * 2] * 255;
    img.data[i * 4 + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
}

async function renderWithCurrentParams(res) {
  // 表示キャンバス確定
  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;

  const frameW = canvas.width;
  const frameH = canvas.height;

  // 人物切り抜き
  await drawPersonWithSegmentation(res);

  // ONNX（色）
  const output = await applyONNX();
  applyONNXResultToPerson(output);

  // alpha 復元
  personCtx.globalCompositeOperation = "destination-in";
  personCtx.drawImage(res.segmentationMask, 0, 0);
  personCtx.globalCompositeOperation = "source-over";

  // mask → 人物実寸
  maskCanvas.width = personCanvas.width;
  maskCanvas.height = personCanvas.height;
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  maskCtx.drawImage(res.segmentationMask, 0, 0);

  const bounds = getPersonBoundsFromMask(maskCanvas);
  if (!bounds) return;

  // 自動スケール
  const TARGET_PERSON_RATIO = 0.6;
  const desiredPersonH = frameH * TARGET_PERSON_RATIO;
  const scaleFromPerson = desiredPersonH / bounds.height;
  const finalScale = scaleFromPerson * clamp(scale, 0.8, 1.2);

  const baseW = personCanvas.width * finalScale;
  const baseH = personCanvas.height * finalScale;

  const px = (frameW - baseW) / 2;

  const faceY =
    (bounds.top + bounds.height * faceYRatio) * finalScale;

  const targetY =
    frameH * 0.6 - offsetY * frameH;

  const py = targetY - faceY;

  // 描画
  ctx.clearRect(0, 0, frameW, frameH);
  drawCover(ctx, bg, bg.width, bg.height, frameW, frameH);
  ctx.drawImage(personCanvas, px, py, baseW, baseH);

  previewImg.src = canvas.toDataURL();
}

const maskCanvas = document.createElement("canvas");
const maskCtx = maskCanvas.getContext("2d");

function renderLight() {
  if (!cachedPersonCanvas || !cachedBounds) return;

  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;

  const frameW = canvas.width;
  const frameH = canvas.height;

  const TARGET_PERSON_RATIO = 0.6;
  const desiredPersonH = frameH * TARGET_PERSON_RATIO;

  const scaleFromPerson = desiredPersonH / cachedBounds.height;
  const finalScale = scaleFromPerson * clamp(scale, 0.8, 1.2);

  const baseW = cachedPersonCanvas.width * finalScale;
  const baseH = cachedPersonCanvas.height * finalScale;

  const px = (frameW - baseW) / 2;

  const faceY =
    (cachedBounds.top + cachedBounds.height * faceYRatio) * finalScale;

  const targetY =
    frameH * 0.6 - offsetY * frameH;

  const py = targetY - faceY;

  ctx.clearRect(0, 0, frameW, frameH);
  drawCover(ctx, bg, bg.width, bg.height, frameW, frameH);
  ctx.drawImage(cachedPersonCanvas, px, py, baseW, baseH);

  previewImg.src = canvas.toDataURL();
}

segmentation.onResults(async res => {
  lastSegmentationResult = res;

  // 人物切り抜き（重い）
  await drawPersonWithSegmentation(res);

  // ONNX（重い・1回）
  const output = await applyONNX();
  applyONNXResultToPerson(output);

  // alpha 復元
  personCtx.globalCompositeOperation = "destination-in";
  personCtx.drawImage(res.segmentationMask, 0, 0);
  personCtx.globalCompositeOperation = "source-over";

  // mask → bounds（重い・1回）
  maskCanvas.width = personCanvas.width;
  maskCanvas.height = personCanvas.height;
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  maskCtx.drawImage(res.segmentationMask, 0, 0);

  cachedBounds = getPersonBoundsFromMask(maskCanvas);

  // ✅ 人物結果をキャッシュ
  cachedPersonCanvas = document.createElement("canvas");
  cachedPersonCanvas.width = personCanvas.width;
  cachedPersonCanvas.height = personCanvas.height;
  cachedPersonCanvas.getContext("2d").drawImage(personCanvas, 0, 0);

  // 初回描画
  renderLight();
  showScreen("preview");
});

window.addEventListener("DOMContentLoaded", async () => {

  await loadONNX();  // ←これを先に

  const bgKey = getBgParam() ?? "kishiwada-hare";
  setBackgroundByKey(bgKey);

});