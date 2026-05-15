// 画面要素取得
const cameraScreen = document.getElementById("camera-screen");
const loadingScreen = document.getElementById("loading-screen");
const previewScreen = document.getElementById("preview-screen");
const editScreen = document.getElementById("edit-screen");
const saveScreen = document.getElementById("save-screen");

// ボタン取得
const shutterBtn = document.getElementById("shutter-btn");
const retryBtn = document.getElementById("retry-btn");
const toEditBtn = document.getElementById("to-edit-btn");
const backToPreviewBtn = document.getElementById("back-to-preview-btn");
const doneBtn = document.getElementById("done-btn");

// 画面切り替え関数
function showScreen(screen) {
  cameraScreen.classList.remove("active");
  loadingScreen.classList.remove("active");
  previewScreen.classList.remove("active");
  editScreen.classList.remove("active");
  saveScreen.classList.remove("active");

  screen.classList.add("active");
}

// シャッターボタン
shutterBtn.addEventListener("click", () => {
  showScreen(loadingScreen);

  // 仮の合成待ち
  setTimeout(() => {
    showScreen(previewScreen);
  }, 1500);
});

// 撮り直す
retryBtn.addEventListener("click", () => {
  showScreen(cameraScreen);
});

// 編集に進む
toEditBtn.addEventListener("click", () => {
  showScreen(editScreen);
});

// 編集画面から戻る
backToPreviewBtn.addEventListener("click", () => {
  showScreen(previewScreen);
});

// 編集完了 → 保存画面（仮）
doneBtn.addEventListener("click", () => {
  showScreen(saveScreen);
});