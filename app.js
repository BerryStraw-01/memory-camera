const cameraScreen = document.getElementById("camera-screen");
const loadingScreen = document.getElementById("loading-screen");
const previewScreen = document.getElementById("preview-screen");
const editScreen = document.getElementById("edit-screen");
const saveScreen = document.getElementById("save-screen");

const shutterBtn = document.getElementById("shutter-btn");
const retryBtn = document.getElementById("retry-btn");
const toEditBtn = document.getElementById("to-edit-btn");
const backToPreviewBtn = document.getElementById("back-to-preview-btn");
const doneBtn = document.getElementById("done-btn");

function showScreen(screen) {
  cameraScreen.classList.remove("active");
  loadingScreen.classList.remove("active");
  previewScreen.classList.remove("active");
  editScreen.classList.remove("active");
  saveScreen.classList.remove("active");

  screen.classList.add("active");
}

shutterBtn.addEventListener("click", () => {
  showScreen(loadingScreen);
  setTimeout(() => showScreen(previewScreen), 1500);
});

retryBtn.addEventListener("click", () => {
  showScreen(cameraScreen);
});

toEditBtn.addEventListener("click", () => {
  showScreen(editScreen);
});

backToPreviewBtn.addEventListener("click", () => {
  showScreen(previewScreen);
});

doneBtn.addEventListener("click", () => {
  showScreen(saveScreen);
});
