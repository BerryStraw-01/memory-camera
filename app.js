const fontReady = document.fonts.ready;

const PRESETS = {
  "kishiwada-hare": {
    image: "images/kishiwada-hare.png",
    place: "岸和田城（晴れ）",
    layout: {
      mode: "bust",
      personHeightRatio: 0.62,
      faceTargetX: 0.5,
      faceTargetY: 0.58
    }
  },

  "kishiwada-kumori": {
    image: "images/kishiwada-kumori.jpg",
    place: "岸和田城（曇り）",
    layout: {
      mode: "bust",
      personHeightRatio: 0.62,
      faceTargetX: 0.5,
      faceTargetY: 0.58
    }
  },

  "ohori-miti": {
    image: "images/ohori_miti.png",
    place: "お堀の道",
    layout: {
      mode: "full",
      personHeightRatio: 0.3,
      footTargetX: 0.6,
      footTargetY: 0.9
    }
  },

  "siro-sakura": {
    image: "images/siro_sakura.png",
    place: "城と桜",
    layout: {
      mode: "full",
      personHeightRatio: 0.45,
      footTargetX: 0.5,
      footTargetY: 0.9
    }
  },

  "siro": {
    image: "images/siro.jpg",
    place: "岸和田城",
    layout: {
      mode: "full",
      personHeightRatio: 0.6,
      footTargetX: 0.5,
      footTargetY: 1.2
    }
  },

  "undojo": {
    image: "images/undojo.jpg",
    place: "運動場前",
    layout: {
      mode: "full",
      personHeightRatio: 0.5,
      footTargetX: 0.5,
      footTargetY: 0.85
    }
  },

  "wakimiti": {
    image: "images/wakimiti.png",
    place: "脇道",
    layout: {
      mode: "full",
      personHeightRatio: 0.3,
      footTargetX: 0.3,
      footTargetY: 0.9
    }
  },

  "eki": {
    image: "images/eki.JPG",
    place: "蛸地蔵駅",
    layout: {
      mode: "full",
      personHeightRatio: 0.3,
      footTargetX: 0.5,
      footTargetY: 0.95
    }
  },

  "jinja": {
      image: "images/jinja.JPG",
      place: "岸城神社",
      layout: {
        mode: "full",
        personHeightRatio: 0.2,
        footTargetX: 0.6,
        footTargetY: 0.95
      }
  },

  "koen": {
    image: "images/koen.png",
    place: "二の丸広場",
    layout: {
      mode: "full",
      personHeightRatio: 1.0,
      footTargetX: 0.3,
      footTargetY: 1.2
    }
  },

  "koen-mae": {
    image: "images/koen_mae.JPG",
    place: "二の丸広場前",
    layout: {
      mode: "full",
      personHeightRatio: 0.5,
      footTargetX: 0.5,
      footTargetY: 0.9
    }
  },

   "komon": {
      image: "images/komon.png",
      place: "校門前",
      layout: {
        mode: "full",
        personHeightRatio: 0.5,
        footTargetX: 0.6,
        footTargetY: 0.9
      }
   },

   "kosya-yoko": {
     image: "images/kosya_yoko.png",
     place: "校舎横",
     layout: {
       mode: "full",
       personHeightRatio: 0.4,
       footTargetX: 0.5,
       footTargetY: 0.8
     }
  },

  "kosya": {
       image: "images/kosya.JPG",
       place: "校舎",
       layout: {
         mode: "full",
         personHeightRatio: 0.4,
         footTargetX: 0.7,
         footTargetY: 0.8
       }
    }
};

const initialBgKey =
  new URLSearchParams(window.location.search).get("bg") ?? "kishiwada-hare";

let currentBgKey = PRESETS[initialBgKey]
  ? initialBgKey
  : "kishiwada-hare";

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

const kleeFontReady = document.fonts.load(
  "600 100px 'Klee One'"
);

const PLACE_FONT = "600 90px 'Klee One'";


// ===== 状態 =====
let cameraReady = false;
let offsetY = 0;
let scale = 1.2;
let showKishiko = false;
let showPlace = false;
let lastSegmentationResult = null;

let cachedPersonCanvas = null;
let cachedBounds = null;
let bgReady = false;
let needsRender = false;

let finalImageURL = null;

let onnxRunning = false;

const OUTPUT_WIDTH = 1108;
const OUTPUT_HEIGHT = 1477;

let srSession = null;
let srRunning = false;

// SRを使うかどうか
const USE_SR = true;

// SR入力サイズ
const SR_INPUT_SIZE = 512;

// どれくらい拡大されるとSRを使うか
const SR_SCALE_THRESHOLD = 1.25;

// ===== 背景 =====
const bg = new Image();

// ===== MODNet =====
let modnetSession = null;
const MODNET_SIZE = 512;

// ===== WASM設定（モバイル対応） =====
function configureORTForMobile() {
  if (!window.ort) return;

  // スレッド数を1に（モバイルで安定）
  ort.env.wasm.numThreads = 1;

  // iOSの場合SIMDを無効化
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isIOS) {
    ort.env.wasm.simd = false;
    console.log("📱 iOS detected → SIMD disabled");
  }

  console.log("⚙️ ORT WASM config:", {
    numThreads: ort.env.wasm.numThreads,
    simd: ort.env.wasm.simd
  });
}

async function loadMODNet() {
  try {
    modnetSession = await ort.InferenceSession.create("modnet.onnx", {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
      enableCpuMemArena: false,     // ★ モバイルのメモリ節約
      enableMemPattern: false       // ★ モバイルのメモリ節約
    });
    console.log("✅ MODNet loaded");
    console.log("MODNet inputNames:", modnetSession.inputNames);
    console.log("MODNet outputNames:", modnetSession.outputNames);
  } catch (e) {
    console.error("❌ MODNet load failed:", e);
    modnetSession = null;
  }
}

/**
 * Canvas → MODNet用テンソル
 * 前処理: RGB, (pixel/255 - 0.5) / 0.5
 */
function canvasToMODNetTensor(canvas) {
  const size = MODNET_SIZE;

  const tmp = document.createElement("canvas");
  tmp.width = size;
  tmp.height = size;

  const tctx = tmp.getContext("2d");
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = "high";
  tctx.drawImage(canvas, 0, 0, size, size);

  const imgData = tctx.getImageData(0, 0, size, size).data;
  const float32 = new Float32Array(3 * size * size);

  for (let i = 0; i < size * size; i++) {
    float32[i]                     = (imgData[i * 4]     / 255.0 - 0.5) / 0.5;
    float32[i + size * size]       = (imgData[i * 4 + 1] / 255.0 - 0.5) / 0.5;
    float32[i + size * size * 2]   = (imgData[i * 4 + 2] / 255.0 - 0.5) / 0.5;
  }

  return new ort.Tensor("float32", float32, [1, 3, size, size]);
}

/**
 * MODNetの出力（アルファマット）をCanvasに描画
 * 出力: [1, 1, H, W]、値は0〜1
 */
function modnetOutputToMaskCanvas(outputTensor, targetW, targetH) {
  const [_, __, h, w] = outputTensor.dims;
  const data = outputTensor.data;

  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;

  const tctx = tmp.getContext("2d");
  const imgData = tctx.createImageData(w, h);

  for (let i = 0; i < w * h; i++) {
    const alpha = Math.min(1, Math.max(0, data[i]));
    const v = Math.round(alpha * 255);

    imgData.data[i * 4]     = v;
    imgData.data[i * 4 + 1] = v;
    imgData.data[i * 4 + 2] = v;
    imgData.data[i * 4 + 3] = v;  // ← ★ 255 → v に変更
  }

  tctx.putImageData(imgData, 0, 0);

  const result = document.createElement("canvas");
  result.width = targetW;
  result.height = targetH;

  const rctx = result.getContext("2d");
  rctx.imageSmoothingEnabled = true;
  rctx.imageSmoothingQuality = "high";
  rctx.drawImage(tmp, 0, 0, targetW, targetH);

  return result;
}

/**
 * MODNetでセグメンテーションを実行
 */
async function runMODNet(imageCanvas) {
  if (!modnetSession) {
    console.error("MODNet not loaded");
    return null;
  }

  const inputTensor = canvasToMODNetTensor(imageCanvas);

  const inputName = modnetSession.inputNames[0];
  const outputName = modnetSession.outputNames[0];

  const result = await modnetSession.run({
    [inputName]: inputTensor
  });

  const outputTensor = result[outputName];

  const alphaMask = modnetOutputToMaskCanvas(
    outputTensor,
    imageCanvas.width,
    imageCanvas.height
  );

  return alphaMask;
}

// ===== 切り抜き =====
const personCanvas = document.createElement("canvas");
const personCtx = personCanvas.getContext("2d");

function getBgParam() {
  const params = new URLSearchParams(window.location.search);
  return params.get("bg");
}

function setBackgroundByKey(key) {
  const preset = PRESETS[key];
  if (!preset) return;

  currentBgKey = key;

  updateCameraGuide();

  bgReady = false;
  bg.src = preset.image;

  bg.onload = async () => {
    bgReady = true;
    await ensureFontsReady();
    renderLight();
  };
}

let fontsReadyResolved = false;

async function ensureFontsReady() {
  if (fontsReadyResolved) return;

  await Promise.all([
    document.fonts.load("600 180px 'Klee One'"),
    document.fonts.ready
  ]);

  warmupKleeFont();

  fontsReadyResolved = true;
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
  personCtx.imageSmoothingEnabled = true;
  personCtx.imageSmoothingQuality = "high";
  personCtx.drawImage(res.image, 0, 0, w, h);

  // =====================================================
  // ✅ 高精細マスク生成：supersampling
  // =====================================================
  const SS = 2;

  const hiMaskCanvas = document.createElement("canvas");
  hiMaskCanvas.width = w * SS;
  hiMaskCanvas.height = h * SS;

  const hiMaskCtx = hiMaskCanvas.getContext("2d");
  hiMaskCtx.clearRect(0, 0, hiMaskCanvas.width, hiMaskCanvas.height);

  hiMaskCtx.imageSmoothingEnabled = true;
  hiMaskCtx.imageSmoothingQuality = "high";

  hiMaskCtx.drawImage(
    res.segmentationMask,
    0, 0,
    hiMaskCanvas.width,
    hiMaskCanvas.height
  );

  hiMaskCtx.filter = "blur(0.7px)";
  hiMaskCtx.drawImage(hiMaskCanvas, 0, 0);
  hiMaskCtx.filter = "none";

  maskCanvas.width = w;
  maskCanvas.height = h;
  maskCtx.clearRect(0, 0, w, h);
  maskCtx.imageSmoothingEnabled = true;
  maskCtx.imageSmoothingQuality = "high";

  maskCtx.drawImage(
    hiMaskCanvas,
    0, 0, hiMaskCanvas.width, hiMaskCanvas.height,
    0, 0, w, h
  );

  // =====================================================
  // ✅ 下部ほど閾値を緩くして足を残す
  // =====================================================
  const maskData = maskCtx.getImageData(0, 0, w, h).data;
  const imgData = personCtx.getImageData(0, 0, w, h);

  for (let y = 0; y < h; y++) {
    const yRatio = y / h;
    const lowerZone = Math.max(0, (yRatio - 0.6) / 0.4);

    const cutoffLow  = 0.08 - lowerZone * 0.07;
    const cutoffHigh = 0.92 + lowerZone * 0.07;
    const gammaVal   = 0.9  - lowerZone * 0.35;

    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let alpha = maskData[i] / 255;

      if (alpha < cutoffLow) alpha = 0;
      else if (alpha > cutoffHigh) alpha = 1;
      else alpha = Math.pow(alpha, gammaVal);

      imgData.data[i + 3] = alpha * 255;
    }
  }

  personCtx.putImageData(imgData, 0, 0);
}

function dilateBottom(canvas, ctx, expandPx = 10) {
  const { width, height } = canvas;
  const src = ctx.getImageData(0, 0, width, height);
  const dst = new ImageData(
    new Uint8ClampedArray(src.data), width, height
  );

  const startY = Math.floor(height * 0.55);

  for (let y = startY; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      if (dst.data[i + 3] > 0) continue;

      let maxAlpha = 0;
      let srcR = 0, srcG = 0, srcB = 0;

      for (let dy = -expandPx; dy <= expandPx; dy++) {
        for (let dx = -expandPx; dx <= expandPx; dx++) {
          const nx = x + dx;
          const ny = y + dy;

          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

          const ni = (ny * width + nx) * 4;
          const a = src.data[ni + 3];

          if (a > maxAlpha) {
            maxAlpha = a;
            srcR = src.data[ni];
            srcG = src.data[ni + 1];
            srcB = src.data[ni + 2];
          }
        }
      }

      if (maxAlpha > 20) {
        dst.data[i]     = srcR;
        dst.data[i + 1] = srcG;
        dst.data[i + 2] = srcB;
        dst.data[i + 3] = Math.round(maxAlpha * 0.5);
      }
    }
  }

  ctx.putImageData(dst, 0, 0);
}

function prepareONNXInput() {
  const img256 = resizeTo256(personCanvas);
  const mask256 = resizeTo256(maskCanvas);

  return { img256, mask256 };
}

function defringe(canvas) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = img.data;

  for (let i = 0; i < data.length; i += 4) {
    let alpha = data[i + 3] / 255;

    if (alpha > 0 && alpha < 0.95) {
      const newAlpha = Math.pow(alpha, 0.85);
      data[i + 3] = newAlpha * 255;

      const fringeReduce = 0.92 + 0.08 * newAlpha;

      data[i] = data[i] * fringeReduce;
      data[i + 1] = data[i + 1] * fringeReduce;
      data[i + 2] = data[i + 2] * fringeReduce;
    }
  }

  ctx.putImageData(img, 0, 0);
}

function getAverageColor(image, w, h) {
  const temp = document.createElement("canvas");
  temp.width = 50;
  temp.height = 50;

  const tctx = temp.getContext("2d");
  tctx.drawImage(image, 0, 0, 50, 50);

  const data = tctx.getImageData(0, 0, 50, 50).data;

  let r = 0, g = 0, b = 0;

  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }

  const count = data.length / 4;

  return {
    r: r / count,
    g: g / count,
    b: b / count
  };
}

async function applyONNX() {
  if (!ortSession) return null;
  if (onnxRunning) return null;

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
      if (data[i + 3] > 10) {
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

  personCtx.save();
  personCtx.globalCompositeOperation = "soft-light";
  personCtx.globalAlpha = 0.3;

  personCtx.drawImage(tmpCanvas, 0, 0,
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

  const BODY_W = size * 1.1;
  const BODY_H = size * 0.95;
  const TIP_H  = size * 0.75;
  const ROUND  = size * 0.95;

  ctx.beginPath();
  ctx.moveTo(0, BODY_H + TIP_H);

  ctx.bezierCurveTo(
    BODY_W, BODY_H * 0.7,
    BODY_W * 0.9, -ROUND,
    0, -ROUND
  );

  ctx.bezierCurveTo(
    -BODY_W * 0.9, -ROUND,
    -BODY_W, BODY_H * 0.7,
    0, BODY_H + TIP_H
  );

  ctx.fillStyle = "#ff7aa8";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, -ROUND * 0.2, size * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  ctx.restore();
}


// ===== 保存用描画（文字あり） =====
async function redrawFinal() {

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  await fontReady;

  await drawBase();

  const w = canvas.width;
  const h = canvas.height;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = PLACE_FONT;

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

  if (showPlace) {
    ctx.save();

    const FONT = "600 90px 'Klee One'";
    const PIN_SIZE = 30;
    const PIN_GAP  = 20;
    const PIN_OFFSET_X = -8;

    ctx.font = PLACE_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.lineWidth = 10;
    ctx.strokeStyle = "#fff";
    ctx.fillStyle = "#ff7aa8";

    const text = PRESETS[currentBgKey]?.place ?? "";

    const baselineY = h - 50;

    const metrics = ctx.measureText(text);

    const totalWidth =
      PIN_SIZE + PIN_GAP + metrics.width;

    const groupLeftX =
      w / 2 - totalWidth / 2;

    const pinX =
      groupLeftX + PIN_SIZE / 2 + PIN_OFFSET_X;

    const textX =
      groupLeftX + PIN_SIZE + PIN_GAP + metrics.width / 2;

    const textCenterY =
      baselineY - metrics.actualBoundingBoxAscent / 2;

    drawPin(ctx, pinX, textCenterY, PIN_SIZE);

    ctx.strokeText(text, textX, baselineY);
    ctx.fillText(text, textX, baselineY);

    ctx.restore();
  }

  finalImageURL = canvas.toDataURL("image/png");
}

const textCanvas = document.createElement("canvas");
const textCtx = textCanvas.getContext("2d");

async function redrawTextLayer() {
  resizeAllCanvases();
  await fontReady;

  textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height);

  textCtx.textAlign = "center";
  textCtx.textBaseline = "middle";
  textCtx.font = "600 90px 'Klee One'";

  const w = textCanvas.width;
  const h = textCanvas.height;

  if (showKishiko) {
    const y = h * 0.05;

    textCtx.lineWidth = 10;
    textCtx.strokeStyle = "#fff";
    textCtx.strokeText("in 岸高同窓会", w / 2, y);

    textCtx.fillStyle = "#ff7aa8";
    textCtx.fillText("in 岸高同窓会", w / 2, y);
  }

  if (showPlace) {
    const preset = PRESETS[currentBgKey];
    const place = preset?.place ?? "";
    const y = h * 0.95;

    textCtx.lineWidth = 10;
    textCtx.strokeStyle = "#fff";
    textCtx.strokeText(place, w / 2, y);

    textCtx.fillStyle = "#ff7aa8";
    textCtx.fillText(place, w / 2, y);
  }
}

function composeFinalPreview() {
  ctx.drawImage(textCanvas, 0, 0);
  previewImg.src = canvas.toDataURL("image/png");
}

function resizeAllCanvases() {
  textCanvas.width = canvas.width;
  textCanvas.height = canvas.height;
}

// ===== ボタン =====
shutterBtn.onclick = async () => {
  if (!cameraReady) {
    await startCamera();
    return;
  }

  showScreen("loading");


  // ✅ ブラウザに1フレーム描画させてからMODNet実行
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));


  previewImg.src = "";
  editImg.src = "";
  saveImg.src = "";

  const tempCanvas = document.createElement("canvas");
  const tctx = tempCanvas.getContext("2d");

  const SEG_LONG_SIDE = 1280;

  const vw = video.videoWidth;
  const vh = video.videoHeight;

  const segScale = SEG_LONG_SIDE / Math.max(vw, vh);

  tempCanvas.width = Math.round(vw * segScale);
  tempCanvas.height = Math.round(vh * segScale);

  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = "high";

  tctx.drawImage(
    video,
    0,
    0,
    tempCanvas.width,
    tempCanvas.height
  );

  // ✅ MODNetでアルファマスクを取得
  const alphaMaskCanvas = await runMODNet(tempCanvas);

  if (!alphaMaskCanvas) {
    console.error("MODNet failed");
    showScreen("camera");
    return;
  }

  // ✅ MediaPipeと同じ形式の結果オブジェクトを作る
  const res = {
    image: tempCanvas,
    segmentationMask: alphaMaskCanvas
  };

  // ✅ 共通の後処理を呼ぶ
  await handleSegmentationResult(res);
};

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}


scaleSlider.oninput = () => {
  scale = +scaleSlider.value / 100;
  renderLightFast();
};

offsetSlider.oninput = () => {
  offsetY = (+offsetSlider.value) / 100;
  renderLightFast();
};

// ===== ボタンイベントの修正 =====

toggleKishikoBtn.onclick = () => {
  showKishiko = !showKishiko;
  toggleKishikoBtn.classList.toggle("active", showKishiko);
  renderLightFast();
};

togglePlaceBtn.onclick = () => {
  showPlace = !showPlace;
  togglePlaceBtn.classList.toggle("active", showPlace);
  renderLightFast();
};

toEditBtn.onclick = () => {
  editImg.src = canvas.toDataURL("image/png");
  showScreen("edit");
};

const saveBtn = document.getElementById("save-btn");

saveBtn.onclick = () => {
  finalImageURL = canvas.toDataURL("image/png");
  saveImg.src = finalImageURL;
  showScreen("save");
};

const saveBackBtn = document.getElementById("save-back-btn");

if (saveBackBtn) {
  saveBackBtn.onclick = () => {
    showScreen("edit");
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

async function loadSRONNX() {
  try {
    srSession = await ort.InferenceSession.create("sr_x2_fixed.onnx");
    console.log("✅ SR ONNX loaded");
    console.log("SR inputNames:", srSession.inputNames);
    console.log("SR outputNames:", srSession.outputNames);
  } catch (e) {
    console.error("❌ SR ONNX load failed:", e);
    srSession = null;
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

function canvasToSRTensor(canvas) {
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

function srTensorToCanvas(tensor, targetCanvas, alphaSourceCanvas = null) {
  const ctx = targetCanvas.getContext("2d");

  const [_, __, h, w] = tensor.dims;
  const data = tensor.data;

  targetCanvas.width = w;
  targetCanvas.height = h;

  const img = ctx.createImageData(w, h);

  let alphaData = null;

  if (alphaSourceCanvas) {
    const alphaCanvas = document.createElement("canvas");
    alphaCanvas.width = w;
    alphaCanvas.height = h;

    const actx = alphaCanvas.getContext("2d");
    actx.clearRect(0, 0, w, h);
    actx.imageSmoothingEnabled = true;
    actx.imageSmoothingQuality = "high";
    actx.drawImage(alphaSourceCanvas, 0, 0, w, h);

    alphaData = actx.getImageData(0, 0, w, h).data;
  }

  for (let i = 0; i < w * h; i++) {
    img.data[i * 4] = Math.min(255, Math.max(0, data[i] * 255));
    img.data[i * 4 + 1] = Math.min(255, Math.max(0, data[i + w * h] * 255));
    img.data[i * 4 + 2] = Math.min(255, Math.max(0, data[i + w * h * 2] * 255));

    img.data[i * 4 + 3] = alphaData ? alphaData[i * 4 + 3] : 255;
  }

  ctx.putImageData(img, 0, 0);
}

function shouldUseSRForPerson(bounds) {
  if (!USE_SR) return false;
  if (!srSession) return false;
  if (!bounds) return false;
  if (!bgReady || bg.naturalWidth === 0) return false;

  const frameH = OUTPUT_HEIGHT;

  const desiredPersonH = frameH * 0.6;
  const scaleFromPerson = desiredPersonH / bounds.height;
  const finalScale = scaleFromPerson * clamp(scale, 0.8, 1.2);

  const willUpscalePerson = finalScale >= SR_SCALE_THRESHOLD;

  const cropLongSide = Math.max(bounds.width, bounds.height);
  const canUseSRWithoutDownscale = cropLongSide <= SR_INPUT_SIZE;

  console.log("SR判定:", {
    finalScale,
    willUpscalePerson,
    cropLongSide,
    SR_INPUT_SIZE,
    canUseSRWithoutDownscale
  });

  return willUpscalePerson && canUseSRWithoutDownscale;
}

function getAlphaBounds(canvas, threshold = 10) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;

  let left = width;
  let right = 0;
  let top = height;
  let bottom = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];

      if (a > threshold) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  if (right <= left || bottom <= top) {
    return null;
  }

  return {
    left,
    top,
    right,
    bottom,
    width: right - left + 1,
    height: bottom - top + 1
  };
}

function cropCanvasByBounds(srcCanvas, bounds, paddingRatio = 0.08) {
  const padX = Math.round(bounds.width * paddingRatio);
  const padY = Math.round(bounds.height * paddingRatio);

  const x = Math.max(0, bounds.left - padX);
  const y = Math.max(0, bounds.top - padY);

  const right = Math.min(srcCanvas.width, bounds.right + padX);
  const bottom = Math.min(srcCanvas.height, bounds.bottom + padY);

  const w = right - x;
  const h = bottom - y;

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = w;
  cropCanvas.height = h;

  const cctx = cropCanvas.getContext("2d");
  cctx.clearRect(0, 0, w, h);
  cctx.drawImage(
    srcCanvas,
    x,
    y,
    w,
    h,
    0,
    0,
    w,
    h
  );

  return {
    canvas: cropCanvas,
    x,
    y,
    w,
    h
  };
}

function drawContainWithInfo(srcCanvas, dstCanvas, size) {
  dstCanvas.width = size;
  dstCanvas.height = size;

  const dctx = dstCanvas.getContext("2d");
  dctx.clearRect(0, 0, size, size);

  dctx.fillStyle = "black";
  dctx.fillRect(0, 0, size, size);

  const sw = srcCanvas.width;
  const sh = srcCanvas.height;

  const fitScale = Math.min(size / sw, size / sh);

  const dw = Math.round(sw * fitScale);
  const dh = Math.round(sh * fitScale);

  const dx = Math.round((size - dw) / 2);
  const dy = Math.round((size - dh) / 2);

  dctx.imageSmoothingEnabled = true;
  dctx.imageSmoothingQuality = "high";

  dctx.drawImage(srcCanvas, dx, dy, dw, dh);

  return {
    dx,
    dy,
    dw,
    dh,
    fitScale
  };
}

async function applySRToPerson() {
  if (!srSession) return false;
  if (srRunning) return false;

  srRunning = true;

  try {
    console.log("🔍 SR start");

    const originalW = personCanvas.width;
    const originalH = personCanvas.height;

    const bounds = getAlphaBounds(personCanvas);
    if (!bounds) {
      console.warn("⚠️ SR skipped: alpha bounds not found");
      return false;
    }

    const crop = cropCanvasByBounds(personCanvas, bounds, 0.08);
    const cropLongSide = Math.max(crop.w, crop.h);

    if (cropLongSide > SR_INPUT_SIZE) {
      console.warn("⚠️ SR skipped: crop is larger than SR input", {
        crop: `${crop.w}x${crop.h}`,
        SR_INPUT_SIZE
      });
      return false;
    }

    const inputCanvas = document.createElement("canvas");
    const fit = drawContainWithInfo(crop.canvas, inputCanvas, SR_INPUT_SIZE);

    const inputTensor = canvasToSRTensor(inputCanvas);

    const inputName = srSession.inputNames[0];
    const outputName = srSession.outputNames[0];

    const result = await srSession.run({
      [inputName]: inputTensor
    });

    const outputTensor = result[outputName];

    const srFullCanvas = document.createElement("canvas");
    srTensorToCanvas(outputTensor, srFullCanvas, null);

    const srScale = 2;

    const srcX = fit.dx * srScale;
    const srcY = fit.dy * srScale;
    const srcW = fit.dw * srScale;
    const srcH = fit.dh * srScale;

    const srCropCanvas = document.createElement("canvas");
    srCropCanvas.width = crop.w * srScale;
    srCropCanvas.height = crop.h * srScale;

    const srCropCtx = srCropCanvas.getContext("2d");
    srCropCtx.imageSmoothingEnabled = true;
    srCropCtx.imageSmoothingQuality = "high";

    srCropCtx.drawImage(
      srFullCanvas,
      srcX,
      srcY,
      srcW,
      srcH,
      0,
      0,
      srCropCanvas.width,
      srCropCanvas.height
    );

    const alphaCanvas = document.createElement("canvas");
    alphaCanvas.width = srCropCanvas.width;
    alphaCanvas.height = srCropCanvas.height;

    const alphaCtx = alphaCanvas.getContext("2d");
    alphaCtx.clearRect(0, 0, alphaCanvas.width, alphaCanvas.height);
    alphaCtx.imageSmoothingEnabled = true;
    alphaCtx.imageSmoothingQuality = "high";

    alphaCtx.drawImage(
      crop.canvas,
      0,
      0,
      crop.w,
      crop.h,
      0,
      0,
      alphaCanvas.width,
      alphaCanvas.height
    );

    const rgbData = srCropCtx.getImageData(
      0,
      0,
      srCropCanvas.width,
      srCropCanvas.height
    );

    const alphaData = alphaCtx.getImageData(
      0,
      0,
      alphaCanvas.width,
      alphaCanvas.height
    );

    for (let i = 0; i < rgbData.data.length; i += 4) {
      rgbData.data[i + 3] = alphaData.data[i + 3];
    }

    srCropCtx.putImageData(rgbData, 0, 0);

    const newCanvas = document.createElement("canvas");
    newCanvas.width = originalW * srScale;
    newCanvas.height = originalH * srScale;

    const nctx = newCanvas.getContext("2d");
    nctx.clearRect(0, 0, newCanvas.width, newCanvas.height);

    nctx.drawImage(
      srCropCanvas,
      crop.x * srScale,
      crop.y * srScale
    );

    personCanvas.width = newCanvas.width;
    personCanvas.height = newCanvas.height;

    personCtx.clearRect(0, 0, personCanvas.width, personCanvas.height);
    personCtx.drawImage(newCanvas, 0, 0);

    console.log("✅ SR applied:", {
      original: `${originalW}x${originalH}`,
      crop: `${crop.w}x${crop.h}`,
      after: `${personCanvas.width}x${personCanvas.height}`
    });

    return true;

  } catch (e) {
    console.error("❌ SR failed:", e);
    return false;

  } finally {
    srRunning = false;
  }
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

function detectLightingType(image) {
  const temp = document.createElement("canvas");
  temp.width = 50;
  temp.height = 50;

  const ctx = temp.getContext("2d");
  ctx.drawImage(image, 0, 0, 50, 50);

  const data = ctx.getImageData(0, 0, 50, 50).data;

  let top = 0;
  let bottom = 0;

  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const i = (y * 50 + x) * 4;

      const brightness =
        (data[i] + data[i + 1] + data[i + 2]) / 3;

      if (y < 25) {
        top += brightness;
      } else {
        bottom += brightness;
      }
    }
  }

  if (top > bottom * 1.1) return "front";
  if (bottom > top * 1.1) return "back";
  return "neutral";
}

async function runONNX(imageCanvas, maskCanvas) {
  const image = canvasToTensor(imageCanvas);
  const mask = maskToTensor(maskCanvas);

  const H = image.dims[2];
  const W = image.dims[3];

  const inputData = new Float32Array(4 * H * W);

  inputData.set(image.data, 0);

  inputData.set(mask.data, 3 * H * W);

  const inputTensor = new ort.Tensor("float32", inputData, [1, 4, H, W]);

  const result = await ortSession.run({
    input: inputTensor
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
  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;

  const frameW = canvas.width;
  const frameH = canvas.height;

  await drawPersonWithSegmentation(res);

  const output = await applyONNX();
  applyONNXResultToPerson(output);

  personCtx.globalCompositeOperation = "destination-in";
  personCtx.drawImage(res.segmentationMask, 0, 0);
  personCtx.globalCompositeOperation = "source-over";

  maskCanvas.width = personCanvas.width;
  maskCanvas.height = personCanvas.height;
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  maskCtx.drawImage(res.segmentationMask, 0, 0);

  const bounds = getPersonBoundsFromMask(maskCanvas);
  if (!bounds) return;

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

  ctx.clearRect(0, 0, frameW, frameH);
  drawCover(
    ctx,
    bg,
    bg.naturalWidth,
    bg.naturalHeight,
    frameW,
    frameH
  );
  ctx.drawImage(personCanvas, px, py, baseW, baseH);

  previewImg.src = canvas.toDataURL();
}

const maskCanvas = document.createElement("canvas");
const maskCtx = maskCanvas.getContext("2d");


function computePersonPlacement(frameW, frameH) {
  const layout = getCurrentLayout();

  const personW = cachedPersonCanvas.width;
  const personH = cachedPersonCanvas.height;

  const bounds = cachedBounds;

  const personHeightRatio = layout.personHeightRatio ?? 0.6;

  const desiredPersonH = frameH * personHeightRatio;
  const scaleFromPerson = desiredPersonH / bounds.height;

  const finalScale =
    scaleFromPerson * clamp(scale, 0.8, 1.2);

  const baseW = personW * finalScale;
  const baseH = personH * finalScale;

  let px;
  let py;

  if (layout.mode === "full") {
    const footTargetX = layout.footTargetX ?? 0.5;
    const footTargetY = layout.footTargetY ?? 0.93;

    const footXInPerson = personW / 2;
    const footYInPerson = bounds.bottom;

    const targetX = frameW * footTargetX;
    const targetY = frameH * footTargetY - offsetY * frameH;

    px = targetX - footXInPerson * finalScale;
    py = targetY - footYInPerson * finalScale;

  } else {
    const faceTargetX = layout.faceTargetX ?? 0.5;
    const faceTargetY = layout.faceTargetY ?? 0.6;

    const faceXInPerson = personW / 2;

    const faceYInPerson =
      bounds.top + bounds.height * faceYRatio;

    const targetX = frameW * faceTargetX;
    const targetY = frameH * faceTargetY - offsetY * frameH;

    px = targetX - faceXInPerson * finalScale;
    py = targetY - faceYInPerson * finalScale;
  }

  return {
    px,
    py,
    baseW,
    baseH,
    finalScale,
    layout
  };
}

function getCameraGuideType() {
  const layout = getCurrentLayout();
  return layout.guide ?? layout.mode ?? "bust";
}

function updateCameraGuide() {
  const guideText = document.getElementById("camera-guide-text");
  const guideBust = document.getElementById("guide-bust");
  const guideFull = document.getElementById("guide-full");

  if (!guideText || !guideBust || !guideFull) return;

  const guideType = getCameraGuideType();

  if (guideType === "full") {
    guideText.textContent = "全身が入るように撮ってね";
    guideBust.classList.remove("active");
    guideFull.classList.add("active");
  } else {
    guideText.textContent = "顔と肩が入るように撮ってね";
    guideBust.classList.add("active");
    guideFull.classList.remove("active");
  }
}


function getCurrentLayout() {
  const preset = PRESETS[currentBgKey];

  return preset?.layout ?? {
    mode: "bust",
    personHeightRatio: 0.6,
    faceTargetX: 0.5,
    faceTargetY: 0.6
  };
}

// ✅ スライダー操作中の軽量描画（toDataURLを省略）
let rafId = null;

function renderLightFast() {
  if (rafId) return; // 既にスケジュール済みならスキップ

  rafId = requestAnimationFrame(() => {
    rafId = null;

    if (!bgReady) return;
    if (!cachedPersonCanvas || !cachedBounds) return;
    if (bg.naturalWidth === 0) return;

    const dpr = window.devicePixelRatio || 1;

    canvas.style.width  = OUTPUT_WIDTH + "px";
    canvas.style.height = OUTPUT_HEIGHT + "px";

    canvas.width  = OUTPUT_WIDTH * dpr;
    canvas.height = OUTPUT_HEIGHT * dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const frameW = OUTPUT_WIDTH;
    const frameH = OUTPUT_HEIGHT;

    const placement = computePersonPlacement(frameW, frameH);

    // ===== 背景 =====
    ctx.clearRect(0, 0, frameW, frameH);
    drawCover(ctx, bg, bg.naturalWidth, bg.naturalHeight, frameW, frameH);

    // ===== 人物 =====
    ctx.drawImage(cachedPersonCanvas, placement.px, placement.py, placement.baseW, placement.baseH);

    // ===== 文字（フォントは既にロード済み前提） =====
    if (showKishiko || showPlace) {
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1.0;
      ctx.textAlign = "center";
      ctx.font = PLACE_FONT;

      if (showKishiko) {
        ctx.lineWidth = 10;
        ctx.strokeStyle = "#fff";
        ctx.fillStyle = "#ff7aa8";
        ctx.strokeText("in 岸高同窓会", frameW / 2, 50);
        ctx.fillText("in 岸高同窓会", frameW / 2, 50);
      }

      if (showPlace) {
        ctx.textBaseline = "bottom";
        ctx.lineWidth = 10;
        ctx.strokeStyle = "#fff";
        ctx.fillStyle = "#ff7aa8";

        const text = PRESETS[currentBgKey]?.place ?? "";
        ctx.strokeText(text, frameW / 2, frameH - 50);
        ctx.fillText(text, frameW / 2, frameH - 50);
      }

      ctx.restore();
    }

    // ★ toDataURL は呼ばない（これが一番重い）
  });
}

// ✅ 完全版（toDataURL含む、指を離した時だけ）
async function renderLightFull() {
  await renderLight(); // 既存のrenderLight
}


async function renderLight() {
  if (!bgReady) return;
  if (!cachedPersonCanvas || !cachedBounds) return;
  if (bg.naturalWidth === 0) return;

  await ensureFontsReady();

  const dpr = window.devicePixelRatio || 1;

  canvas.style.width  = OUTPUT_WIDTH + "px";
  canvas.style.height = OUTPUT_HEIGHT + "px";

  canvas.width  = OUTPUT_WIDTH * dpr;
  canvas.height = OUTPUT_HEIGHT * dpr;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const frameW = OUTPUT_WIDTH;
  const frameH = OUTPUT_HEIGHT;

  const placement = computePersonPlacement(frameW, frameH);

  const px = placement.px;
  const py = placement.py;
  const baseW = placement.baseW;
  const baseH = placement.baseH;

  ctx.clearRect(0, 0, frameW, frameH);
  drawCover(ctx, bg, bg.naturalWidth, bg.naturalHeight, frameW, frameH);

  ctx.drawImage(cachedPersonCanvas, px, py, baseW, baseH);

  await fontReady;

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1.0;
  ctx.textAlign = "center";
  ctx.font = PLACE_FONT;

  if (showKishiko) {
    ctx.lineWidth = 10;
    ctx.strokeStyle = "#fff";
    ctx.fillStyle = "#ff7aa8";
    ctx.strokeText("in 岸高同窓会", frameW / 2, 50);
    ctx.fillText("in 岸高同窓会", frameW / 2, 50);
  }

  if (showPlace) {
    ctx.textBaseline = "bottom";
    ctx.lineWidth = 10;
    ctx.strokeStyle = "#fff";
    ctx.fillStyle = "#ff7aa8";

    const text = PRESETS[currentBgKey]?.place ?? "";
    const y = frameH - 50;

    ctx.strokeText(text, frameW / 2, y);
    ctx.fillText(text, frameW / 2, y);
  }

  ctx.restore();

  const url = canvas.toDataURL("image/png");
  previewImg.src = url;

  if (screens.edit.classList.contains("active")) {
    editImg.src = url;
  }
}

function warmupKleeFont() {
  const span = document.createElement("span");
  span.style.position = "absolute";
  span.style.opacity = "0";
  span.style.font = "600 90px 'Klee One'";
  document.body.appendChild(span);

  requestAnimationFrame(() => {
    document.body.removeChild(span);
  });
}

// ===== MODNet / MediaPipe 共通の後処理 =====
async function handleSegmentationResult(res) {
  await ensureFontsReady();
  lastSegmentationResult = res;

  // 人物切り抜き
  await drawPersonWithSegmentation(res);

  // 足元のマスクを膨張させる
  dilateBottom(personCanvas, personCtx, 8);

  // ONNX harmonization
  const output = await applyONNX();
  applyONNXResultToPerson(output);

  // alpha 復元
  personCtx.globalCompositeOperation = "destination-in";
  personCtx.drawImage(res.segmentationMask, 0, 0);
  personCtx.globalCompositeOperation = "source-over";

  defringe(personCanvas);

  // SR判定用にbounds取得
  maskCanvas.width = personCanvas.width;
  maskCanvas.height = personCanvas.height;
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

  maskCtx.drawImage(personCanvas, 0, 0);

  let boundsBeforeSR = getPersonBoundsFromMask(maskCanvas);

  // 必要ならSRで人物を高画質化
  if (shouldUseSRForPerson(boundsBeforeSR)) {
    await applySRToPerson();
  }

  // SR後にboundsを取り直す
  maskCanvas.width = personCanvas.width;
  maskCanvas.height = personCanvas.height;
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  maskCtx.drawImage(personCanvas, 0, 0);

  cachedBounds = getPersonBoundsFromMask(maskCanvas);

  // 人物結果をキャッシュ
  cachedPersonCanvas = document.createElement("canvas");
  cachedPersonCanvas.width = personCanvas.width;
  cachedPersonCanvas.height = personCanvas.height;
  cachedPersonCanvas.getContext("2d").drawImage(personCanvas, 0, 0);

  // 初回描画
  renderLight();
  showScreen("preview");
}

window.addEventListener("DOMContentLoaded", async () => {
  const bgKey = getBgParam() ?? currentBgKey;

  if (PRESETS[bgKey]) {
    currentBgKey = bgKey;
  }

  updateCameraGuide();
  setBackgroundByKey(currentBgKey);

  // ✅ モバイル対応のWASM設定を最初に適用
  configureORTForMobile();

  // ✅ MODNetを読み込む（失敗してもMediaPipeで動く）
  await loadMODNet();

  await loadONNX();
  await loadSRONNX();
});