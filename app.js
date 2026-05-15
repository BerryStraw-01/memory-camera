// 画面要素を取得
const cameraScreen = document.getElementById("camera-screen");
const loadingScreen = document.getElementById("loading-screen");
const previewScreen = document.getElementById("preview-screen");

const shutterBtn = document.getElementById("shutter-btn");
const retryBtn = document.getElementById("retry-btn");

// 画面を切り替える関数
function showScreen(screen) {
  cameraScreen.classList.remove("active");
  loadingScreen.classList.remove("active");
  previewScreen.classList.remove("active");

  screen.classList.add("active");
}

// シャッターを押したら
shutterBtn.addEventListener("click", () => {
  showScreen(loadingScreen);

  // 仮の「合成待ち時間」
  setTimeout(() => {
    showScreen(previewScreen);
  }, 1500);
});

// 撮り直す
retryBtn.addEventListener("click", () => {
  showScreen(cameraScreen);
});
