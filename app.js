const fontReady = document.fonts.load("600 32px 'Klee One'");

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

const place = "岸和田城";

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
bg.src = "images/memory.jpg";

const bgReady = new Promise(resolve => {
  bg.onload = resolve;
});

// ===== MediaPipe =====
const segmentation = new SelfieSegmentation({
  locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
});
segmentation.setOptions({ modelSelection: 1 });

// ===== 切り抜き =====
const personCanvas = document.createElement("canvas");
const personCtx = personCanvas.getContext("2d");

function drawContain(ctx, src, sw, sh, dw, dh) {
  const scale = Math.min(dw / sw, dh / sh);
  const w = sw * scale;
  const h = sh * scale;
  const x = (dw - w) / 2;
  const y = (dh - h) / 2;
  ctx.drawImage(src, 0, 0, sw, sh, x, y, w, h);
}

// ===== カメラON =====
async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
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
  shutterBtn.textContent = "📸 撮影";
}

// ===== 共通描画（背景＋人物） =====
async function drawBase() {
  await fontReady;
  await bgReady;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  drawContain(ctx, bg, bg.width, bg.height, w, h);

  const srcW = personCanvas.width;
  const srcH = personCanvas.height;
  const aspect = srcW / srcH;

  const baseH = h * scale;
  const baseW = baseH * aspect;

  const px = (w - baseW) / 2;
  const py = h * 0.45 + (offsetY / 100) * h;

  ctx.drawImage(personCanvas, px, py, baseW, baseH);
}

// ===== プレビュー描画（文字なし） =====
async function redraw() {
  await drawBase();

  finalImageURL = canvas.toDataURL("image/png");
  previewImg.src = finalImageURL;
}

// ===== 保存用描画（文字あり） =====
async function redrawFinal() {

  // ✅ これを必ず入れる（超重要）
  await document.fonts.ready;

  await drawBase();

  const w = canvas.width;
  const h = canvas.height;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 86px 'Klee One', cursive";

    if (showKishiko) {
      const x = w / 2;
      const y = h * 0.05; // ✅ 下に移動

      // ✅ 外枠（白）
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 10;
      ctx.lineJoin = "round";
      ctx.strokeText("in 岸高同窓会", x, y);

      // ✅ 中の文字（ピンク）
      ctx.fillStyle = "#ff7aa8";
      ctx.fillText("in 岸高同窓会", x, y);
    }

    if (showPlace) {
      const x = w / 2;
      const y = h * 0.95; // ✅ さらに下に

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 8;
      ctx.lineJoin = "round";
      ctx.strokeText("📍" + place, x, y);

      ctx.fillStyle = "#ff7aa8";
      ctx.fillText("📍" + place, x, y);
    }


  finalImageURL = canvas.toDataURL("image/png");
}

// ===== MediaPipe結果 =====
segmentation.onResults(async res => {
  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;

  personCanvas.width = res.image.width;
  personCanvas.height = res.image.height;

  personCtx.clearRect(0, 0, personCanvas.width, personCanvas.height);
  personCtx.drawImage(res.image, 0, 0);

  personCtx.globalCompositeOperation = "destination-in";
  personCtx.drawImage(res.segmentationMask, 0, 0);
  personCtx.globalCompositeOperation = "source-over";

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

  await segmentation.send({ image: video });
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