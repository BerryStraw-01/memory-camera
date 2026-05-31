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
let scale = 0.8;
let showKishiko = false;
let showPlace = false;

let finalImageURL = null;

const OUTPUT_WIDTH = 1108;
const OUTPUT_HEIGHT = 1477;

// ===== 背景 =====
const bg = new Image();

// ===== MediaPipe =====
const segmentation = new SelfieSegmentation({
  locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
});
segmentation.setOptions({ modelSelection: 1 });

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
    await redraw();
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

function applyNormalize(ctx, canvas, cfg) {
  ctx.save();
  ctx.filter = `
    brightness(${cfg.brightness})
    saturate(${cfg.saturation})
  `;
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();
}

function getCurrentPreset() {
  return PRESETS[currentBgKey];
}

function drawContain(ctx, src, sw, sh, dw, dh) {
  const scale = Math.min(dw / sw, dh / sh);
  const w = sw * scale;
  const h = sh * scale;
  const x = (dw - w) / 2;
  const y = (dh - h) / 2;
  ctx.drawImage(src, 0, 0, sw, sh, x, y, w, h);
}

function rgbToXyz(r, g, b) {
  r /= 255; g /= 255; b /= 255;

  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  return {
    x: r * 0.4124 + g * 0.3576 + b * 0.1805,
    y: r * 0.2126 + g * 0.7152 + b * 0.0722,
    z: r * 0.0193 + g * 0.1192 + b * 0.9505
  };
}

function xyzToLab(x, y, z) {
  const refX = 0.95047;
  const refY = 1.00000;
  const refZ = 1.08883;

  x /= refX;
  y /= refY;
  z /= refZ;

  function f(t) {
    return t > 0.008856
      ? Math.pow(t, 1/3)
      : (7.787 * t) + 16/116;
  }

  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return {
    l: (116 * fy) - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}

function rgbToLab(r, g, b) {
  const xyz = rgbToXyz(r, g, b);
  return xyzToLab(xyz.x, xyz.y, xyz.z);
}

function labToXyz(l, a, b) {
  const fy = (l + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;

  function fInv(t) {
    return Math.pow(t, 3) > 0.008856
      ? Math.pow(t, 3)
      : (t - 16/116) / 7.787;
  }

  const refX = 0.95047;
  const refY = 1.00000;
  const refZ = 1.08883;

  return {
    x: refX * fInv(fx),
    y: refY * fInv(fy),
    z: refZ * fInv(fz)
  };
}

function xyzToRgb(x, y, z) {
  let r = x * 3.2406 + y * -1.5372 + z * -0.4986;
  let g = x * -0.9689 + y * 1.8758 + z * 0.0415;
  let b = x * 0.0557 + y * -0.2040 + z * 1.0570;

  function gamma(t) {
    return t > 0.0031308
      ? 1.055 * Math.pow(t, 1/2.4) - 0.055
      : 12.92 * t;
  }

  r = gamma(r);
  g = gamma(g);
  b = gamma(b);

  return {
    r: Math.min(255, Math.max(0, r * 255)),
    g: Math.min(255, Math.max(0, g * 255)),
    b: Math.min(255, Math.max(0, b * 255))
  };
}

function labToRgb(l, a, b) {
  const xyz = labToXyz(l, a, b);
  return xyzToRgb(xyz.x, xyz.y, xyz.z);
}

function getLabMatch(bgColor, personColor) {
  const bgLab = rgbToLab(bgColor.r, bgColor.g, bgColor.b);
  const pLab  = rgbToLab(personColor.r, personColor.g, personColor.b);

  return {
    dl: bgLab.l - pLab.l,
    da: bgLab.a - pLab.a,
    db: bgLab.b - pLab.b
  };
}

function applyLabCorrection(canvas, match) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = img.data;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 10) continue;

    const lab = rgbToLab(data[i], data[i+1], data[i+2]);

    const corrected = labToRgb(
      lab.l + match.dl,
      lab.a + match.da,
      lab.b + match.db
    );

    data[i]   = corrected.r;
    data[i+1] = corrected.g;
    data[i+2] = corrected.b;
  }

  ctx.putImageData(img, 0, 0);
}

// ===== 共通描画（背景＋人物） =====
// ===== 元のCanvas =====
const personWorkCanvas = document.createElement("canvas");

async function drawBase() {
  await fontReady;

  const w = canvas.width;
  const h = canvas.height;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.clearRect(0, 0, w, h);

  // ===== 背景（少し明るく）=====
  ctx.save();
  ctx.filter = "brightness(1.1) blur(0.5px)";
  ctx.drawImage(bg, 0, 0, w, h);
  ctx.restore();

  // ===== 人物サイズ =====
  const aspect = personCanvas.width / personCanvas.height;
  const baseH = h * scale;
  const baseW = baseH * aspect;

  const px = (w - baseW) / 2;

  const faceY = baseH * faceYRatio;
  const targetY = h * 0.6 - (offsetY / 100) * h;
  const py = targetY - faceY;

  // ===== 色取得 =====
  const bgColor = getLocalBgColor(bg, px, py, baseW, baseH);
  const personColor = getAverageColorFromCanvas(personCanvas);
  const match = getLabMatch(bgColor, personColor);

  const bgStats = analyzeBg(bgColor);
  const adjust = getAutoAdjust(bgStats);

  // ===== ワークCanvas =====
  personWorkCanvas.width = personCanvas.width;
  personWorkCanvas.height = personCanvas.height;

  const pctx = personWorkCanvas.getContext("2d", {
    willReadFrequently: true
  });

  pctx.imageSmoothingEnabled = false;

  pctx.clearRect(0, 0, personWorkCanvas.width, personWorkCanvas.height);
  pctx.drawImage(personCanvas, 0, 0);

  // ✅ ✅ ✅ ① 最初に露出上げる（最重要）
  liftExposure(personWorkCanvas, 1.2);

  // ✅ ② なめらか
  applySoftBlur(personWorkCanvas, 0.3);
  softenEdges(personWorkCanvas);

  // ✅ ③ LAB補正
  applyLabCorrection(personWorkCanvas, {
    dl: match.dl * 0.25,
    da: match.da * 0.05,
    db: match.db * -0.08
  });

  // ✅ ④ 自然彩度
  applyNaturalVibrance(personWorkCanvas, 0.5);

  applyToneCurve(personWorkCanvas);

  // ✅ ⑤ 弱シャープ
  sharpenCanvas(personWorkCanvas, 0.25);

  // ✅ ===== 最終描画（軽い調整のみ）=====
  ctx.save();

  ctx.filter = `
    brightness(${adjust.brightness * 0.95})
    contrast(${adjust.contrast * 1.05})
    saturate(${adjust.saturation * 1.3})
  `;

  ctx.drawImage(personWorkCanvas, px, py, baseW, baseH);

  ctx.restore();
}

function boostMidSaturation(canvas, amount = 1.1) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    const brightness = (d[i] + d[i+1] + d[i+2]) / 3 / 255;

    // ✅ 中間だけ強化
    if (brightness > 0.3 && brightness < 0.7) {
      d[i]   *= amount;
      d[i+1] *= amount;
      d[i+2] *= amount;
    }
  }

  ctx.putImageData(img, 0, 0);
}


function compressHighlights(canvas) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];

    const brightness = (r + g + b) / 3 / 255;

    // ✅ ハイライトを「丸める」
    if (brightness > 0.6) {
      const t = (brightness - 0.6) / 0.4;  // 0〜1

      // 非線形圧縮（めちゃ重要）
      const factor = 1 - 0.4 * t * t;

      d[i]   = r * factor + r * (1 - factor) * 0.92;
      d[i+1] = g * factor + g * (1 - factor) * 0.92;
      d[i+2] = b * factor + b * (1 - factor) * 0.92;
    }
  }

  ctx.putImageData(img, 0, 0);
}



function boostColorChannels(canvas, rMul=1.0, gMul=1.05, bMul=1.05) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    d[i] *= rMul;
    d[i+1] *= gMul;
    d[i+2] *= bMul;
  }

  ctx.putImageData(img, 0, 0);
}

function boostHighlights(canvas, amount = 1.1) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    const brightness = (d[i] + d[i+1] + d[i+2]) / 3 / 255;

    // ✅ 明るい部分だけ彩度アップ
    if (brightness > 0.6) {
      const boost = 1 + (amount - 1) * (1 - brightness);

      d[i] *= boost;
      d[i+1] *= boost;
      d[i+2] *= boost;
    }
  }

  ctx.putImageData(img, 0, 0);
}
``

function applyToneCurve(canvas) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;

  function curve(v) {
    const x = v / 255;

    // ✅ 中間だけ持ち上げる
    const y = x + 0.05 * (x - 0.5) * (1 - Math.abs(2 * x - 1));

    return Math.min(255, Math.max(0, y * 255));
  }

  for (let i = 0; i < d.length; i += 4) {
    d[i]     = curve(d[i]);
    d[i + 1] = curve(d[i + 1]);
    d[i + 2] = curve(d[i + 2]);
  }

  ctx.putImageData(img, 0, 0);
}

function liftFaceLight(canvas) {
  const ctx = canvas.getContext("2d");

  ctx.save();

  // 人物中央にラディアル光
  const grad = ctx.createRadialGradient(
    canvas.width * 0.5,
    canvas.height * 0.4,
    canvas.width * 0.1,
    canvas.width * 0.5,
    canvas.height * 0.4,
    canvas.width * 0.5
  );

  grad.addColorStop(0, "rgba(255,255,255,0.03)");
  grad.addColorStop(1, "rgba(255,255,255,0)");

  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.restore();
}

function applyNaturalVibrance(canvas, amount = 0.6) {
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
    const brightness = (r + g + b) / 3 / 255;

    let boost = 1 + amount * (1 - sat);

    // ✅ 暗部抑制
    boost *= 0.7 + brightness * 0.6;

    // ✅ 肌保護
    if (r > g && g > b && (r - b) > 20) {
      boost *= 0.6;
    }

    r = r + (r - max) * (boost - 1);
    g = g + (g - max) * (boost - 1);
    b = b + (b - max) * (boost - 1);

    data[i]   = Math.min(255, Math.max(0, r));
    data[i+1] = Math.min(255, Math.max(0, g));
    data[i+2] = Math.min(255, Math.max(0, b));
  }

  ctx.putImageData(img, 0, 0);
}

function liftExposure(canvas, amount = 1.2) {
  const ctx = canvas.getContext("2d");

  ctx.save();
  ctx.filter = `brightness(${amount})`;
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();
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

function analyzeBg(color) {
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);

  const brightness = (color.r + color.g + color.b) / 3 / 255;
  const saturation = max === 0 ? 0 : (max - min) / max;

  return { brightness, saturation };
}

function getAutoAdjust(bgStats) {
  // 明るさ補正
  const brightnessBoost =
    Math.max(1.2, 1.1 + (1 - bgStats.brightness) * 0.5);

  // 彩度補正（ここが今回の本題）
  const saturationBoost = 0.85 + bgStats.saturation * 0.6;

  // コントラスト
  const contrastBoost = 1.03 + bgStats.brightness * 0.05;

  return {
    brightness: brightnessBoost,
    saturation: saturationBoost,
    contrast: contrastBoost
  };
}

function erodeAlpha(canvas) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) {
      d[i + 3] *= 0.8; // 少し強めに削る
    }
  }

  ctx.putImageData(img, 0, 0);
}

function applyEdgeBlur(canvas) {
  const temp = document.createElement("canvas");
  temp.width = canvas.width;
  temp.height = canvas.height;

  const tctx = temp.getContext("2d");

  // 少しだけぼかす
  tctx.filter = "blur(0.3px)";
  tctx.drawImage(canvas, 0, 0);

  // 上書き
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(temp, 0, 0);
}

function applySoftBlur(canvas, amount = 0.5) {
  const ctx = canvas.getContext("2d");

  ctx.save();
  ctx.filter = `blur(${amount}px)`;
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();
}

function softenEdges(canvas) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 180) {
      d[i + 3] *= 0.9;  // ←優しく調整
    }
  }

  ctx.putImageData(img, 0, 0);
}


function sharpenCanvas(canvas, strength = 0.25) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    const contrast = Math.abs(d[i] - d[i + 1]) + Math.abs(d[i] - d[i + 2]);

    // ✅ エッジだけ強化
    if (contrast > 20) {
      d[i]   *= (1 + strength * 0.15);
      d[i+1] *= (1 + strength * 0.15);
      d[i+2] *= (1 + strength * 0.15);
    }
  }

  ctx.putImageData(img, 0, 0);
}

function removeColorFringe(canvas) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    const alpha = d[i + 3];

    if (alpha < 200) {
      // 少し内側の色に寄せる（白にじみ防止）
      d[i] *= 0.9;
      d[i + 1] *= 0.9;
      d[i + 2] *= 0.9;
    }
  }

  ctx.putImageData(img, 0, 0);
}


function getLocalBgColor(bg, px, py, w, h) {
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = 50;
  tempCanvas.height = 50;

  const tctx = tempCanvas.getContext("2d");

  // 人物の周囲だけをサンプリング
  tctx.drawImage(
    bg,
    px - w * 0.1, py - h * 0.1, w * 1.2, h * 1.2,
    0, 0, 50, 50
  );

  return getAverageColor(tempCanvas);
}

function setBackground(url) {
  // 背景画像を変更
  bg.src = url;

  // 背景ロード完了後に再描画
  bg.onload = async () => {
    await redraw();
  };
}

function drawPersonWithColor(ctx, x, y, w, h) {
  ctx.drawImage(personCanvas, x, y, w, h);
}

function getAverageColorFromCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  let r = 0, g = 0, b = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 10) continue; // 背景除外

    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count++;
  }

  return {
    r: r / count,
    g: g / count,
    b: b / count
  };
}

function getMatchParams(bg, person) {
  // 明度比
  const bgL = (bg.r + bg.g + bg.b) / 3;
  const pL  = (person.r + person.g + person.b) / 3;

  const brightness = bgL / pL;

  // 彩度（簡易）
  const bgSat = Math.max(bg.r, bg.g, bg.b) - Math.min(bg.r, bg.g, bg.b);
  const pSat  = Math.max(person.r, person.g, person.b) - Math.min(person.r, person.g, person.b);

  const saturation = pSat === 0 ? 1 : bgSat / pSat;

  // 色温度（RGBバランス）
  const rShift = bg.r / person.r;
  const gShift = bg.g / person.g;
  const bShift = bg.b / person.b;

  return {
    brightness: clamp(brightness, 0.8, 1.3),
    saturation: clamp(saturation, 0.8, 1.3),
    colorScale: [rShift, gShift, bShift]
  };
}

function drawPersonMatched(ctx, personCanvas, x, y, w, h, params) {
  ctx.save();

  // ✅ ① 明度・彩度

  ctx.filter = `
    brightness(${adjust.brightness * 0.95})
    contrast(${adjust.contrast * 1.05})
    saturate(${adjust.saturation * 1.1})
  `;


  ctx.drawImage(personCanvas, x, y, w, h);

  // ✅ ② 色温度補正（RGB）
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.5;

  ctx.fillStyle = `rgb(${params.colorScale.map(v => 255 * v).join(",")})`;
  ctx.fillRect(x, y, w, h);

  ctx.restore();
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function getAverageColor(image) {
  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d");

  const size = 50; // 軽量化
  tempCanvas.width = size;
  tempCanvas.height = size;

  tempCtx.drawImage(image, 0, 0, size, size);

  const data = tempCtx.getImageData(0, 0, size, size).data;

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

function getNormalizeParams(bgColor) {
  // 明度（ざっくり）
  const brightness =
    (bgColor.r + bgColor.g + bgColor.b) / 3 / 255;

  // 彩度っぽい指標（簡易）
  const max = Math.max(bgColor.r, bgColor.g, bgColor.b);
  const min = Math.min(bgColor.r, bgColor.g, bgColor.b);
  const saturation = max === 0 ? 0 : (max - min) / max;

  return {
    brightness: 0.9 + brightness * 0.4, // 0.9〜1.3くらい
    saturation: 0.8 + saturation * 0.6  // 0.8〜1.4くらい
  };
}

function drawPersonNormalized(ctx, personCanvas, x, y, w, h, params) {
  ctx.save();

  ctx.filter = `
    brightness(${params.brightness})
    saturate(${params.saturation})
  `;

  ctx.drawImage(personCanvas, x, y, w, h);

  ctx.restore();
}

// ===== プレビュー描画（文字なし） =====

const workCanvas = document.createElement("canvas");
const workCtx = workCanvas.getContext("2d");
const personWorkCtx = personWorkCanvas.getContext("2d");

const personLightCanvas = document.createElement("canvas");
const personLightCtx = personLightCanvas.getContext("2d");

async function redraw() {
  await fontReady;
  if (!isBgReady()) return;
  await drawBase();

  // ✅ ここでは何も加工しない
  // ✅ すでに人物は加工済み

  finalImageURL = canvas.toDataURL("image/png");
  previewImg.src = finalImageURL;
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


// ===== MediaPipe結果 =====
segmentation.onResults(async res => {

  canvas.width = bg.width;
  canvas.height = bg.height;

  personCanvas.width = res.image.width;
  personCanvas.height = res.image.height;

  personCtx.clearRect(0, 0, personCanvas.width, personCanvas.height);

  personCtx.drawImage(res.image, 0, 0);

  personCtx.globalCompositeOperation = "destination-in";
  personCtx.drawImage(res.segmentationMask, 0, 0);
  personCtx.globalCompositeOperation = "source-over";

  // ✅ エッジ処理
  erodeAlpha(personCanvas);
  applyEdgeBlur(personCanvas);
  removeColorFringe(personCanvas);

  await redraw();

  showScreen("preview");
});

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

offsetSlider.oninput = () => {
  offsetY = +offsetSlider.value;
  redraw();
};

scaleSlider.oninput = () => {
  scale = +scaleSlider.value / 100;
  redraw();
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

window.addEventListener("DOMContentLoaded", () => {
  const bgKey = getBgParam() ?? "kishiwada-hare";
  setBackgroundByKey(bgKey);
});