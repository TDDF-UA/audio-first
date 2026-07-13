// Audio First layout — no camera preview, one big word, one button.
// Best for users with no or very low usable vision. Detection/speech
// logic below is carried over unchanged in behavior from big-screen.

// Points at the model.json/weights.bin/metadata.json committed in
// this repo's /model folder.
const MODEL_URL = "./model/";

const CONFIDENCE_THRESHOLD = 0.75;   // don't announce low-confidence guesses (never shown on screen)
const STABLE_FRAMES_NEEDED = 5;      // require a few consistent frames before speaking
const REPEAT_COOLDOWN_MS = 2500;     // don't re-announce the same class too often

const mainBtn = document.getElementById("main-btn");
const startError = document.getElementById("start-error");
const guessEl = document.getElementById("guess");
const statusText = document.getElementById("status-text");
const dot = document.getElementById("dot");
const webcam = document.getElementById("webcam");
const srAnnounce = document.getElementById("sr-announce");

let model, running = false, currentStream = null;
let candidateClass = null, candidateStreak = 0;
let lastSpokenClass = null, lastSpokenAt = 0;

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1;
  window.speechSynthesis.speak(utter);
  srAnnounce.textContent = text;
}

function describeError(err) {
  if (err && err.name === "NotAllowedError") {
    return "Camera access was blocked. Allow camera access in your browser settings, then try again.";
  }
  if (err && err.name === "NotFoundError") {
    return "No camera was found on this device.";
  }
  if (err && err.name === "NotReadableError") {
    return "The camera is being used by another app. Close it, then try again.";
  }
  return "Something went wrong starting the camera. Try again.";
}

function stopCamera() {
  running = false;
  if (currentStream) {
    currentStream.getTracks().forEach((t) => t.stop());
    currentStream = null;
  }
}

async function init() {
  mainBtn.disabled = true;
  mainBtn.textContent = "Starting…";
  startError.textContent = "";
  statusText.textContent = "Loading model…";

  try {
    if (!model) {
      model = await tmImage.load(MODEL_URL + "model.json", MODEL_URL + "metadata.json");
    }

    // "ideal" (not "exact") so this still works on a laptop with only
    // one camera — it just falls back gracefully there.
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } }
    });
    webcam.srcObject = currentStream;
    await webcam.play();

    try {
      if ("wakeLock" in navigator) await navigator.wakeLock.request("screen");
    } catch (e) { /* not critical if unsupported — screen may just dim on long use */ }

    running = true;
    dot.classList.add("live");
    statusText.textContent = "Listening…";
    guessEl.textContent = "Listening…";
    mainBtn.disabled = false;
    mainBtn.textContent = "Tap to hear it again";

    requestAnimationFrame(loop);
  } catch (err) {
    running = false;
    dot.classList.remove("live");
    statusText.textContent = "Point your camera at an object";
    mainBtn.disabled = false;
    mainBtn.textContent = "Start listening";
    startError.textContent = describeError(err);
  }
}

async function loop() {
  if (!running) return;
  const predictions = await model.predict(webcam);
  predictions.sort((a, b) => b.probability - a.probability);
  const top = predictions[0];

  // Confidence is used internally for the threshold/stability logic
  // only — this layout never displays a percentage.
  if (top.probability >= CONFIDENCE_THRESHOLD) {
    guessEl.textContent = top.className;

    if (top.className === candidateClass) {
      candidateStreak++;
    } else {
      candidateClass = top.className;
      candidateStreak = 1;
    }

    const now = Date.now();
    const stableEnough = candidateStreak >= STABLE_FRAMES_NEEDED;
    const changedOrCooldownPassed =
      candidateClass !== lastSpokenClass || now - lastSpokenAt > REPEAT_COOLDOWN_MS * 4;

    if (stableEnough && changedOrCooldownPassed) {
      speak(candidateClass);
      lastSpokenClass = candidateClass;
      lastSpokenAt = now;
      candidateStreak = 0;
    }
  } else {
    guessEl.textContent = "Listening…";
    candidateClass = null;
    candidateStreak = 0;
  }

  requestAnimationFrame(loop);
}

// One button does double duty: before running it starts the camera;
// once running, tapping it repeats the last confident, stable guess.
mainBtn.addEventListener("click", () => {
  if (!running) {
    init();
    return;
  }
  if (lastSpokenClass) {
    speak(lastSpokenClass);
  } else if (guessEl.textContent && guessEl.textContent !== "Listening…" && guessEl.textContent !== "Ready") {
    speak(guessEl.textContent);
  }
});

window.addEventListener("DOMContentLoaded", () => mainBtn.focus());

window.addEventListener("beforeunload", stopCamera);
