import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const MODEL_URL = "/assets/model.glb";
const overlayRoot = document.getElementById("overlay-root");
const statusLine = document.getElementById("status-line");
const retryButton = document.getElementById("retry-button");
const quickLookLink = document.getElementById("quicklook-link");
const canvas = document.getElementById("xr-canvas");

const userAgent = navigator.userAgent || "";
const isiOS = /iPhone|iPad|iPod/i.test(userAgent);
const isAndroid = /Android/i.test(userAgent);
const isIOSChromeLike = isiOS && /(CriOS|FxiOS|EdgiOS|OPiOS)/i.test(userAgent);
const isSafari = isiOS && !isIOSChromeLike && /Safari/i.test(userAgent);

let renderer;
let scene;
let camera;
let modelRoot;
let xrSession;
let xrRefSpace;
let viewerSpace;
let hitTestSource;
let hitTestRequested = false;
let anchor;
let anchorSpace;
let modelPlaced = false;
let immersiveArSupported = false;
let quickLookInstructionHandler;

const ready = () =>
  new Promise((resolve) => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", resolve, { once: true });
    } else {
      resolve();
    }
  });

const setStatus = (message) => {
  if (!statusLine) return;
  statusLine.textContent = message;
};

const setOverlayMode = (mode) => {
  if (!overlayRoot) return;
  overlayRoot.dataset.mode = mode;
};

const showRetry = (show) => {
  if (!retryButton) return;
  retryButton.hidden = !show;
};

await ready();

if (!canvas) {
  throw new Error("Canvas element #xr-canvas が見つかりません");
}

setupExternalARLink();

if (navigator.xr?.isSessionSupported) {
  try {
    immersiveArSupported = await navigator.xr.isSessionSupported("immersive-ar");
  } catch (error) {
    console.warn("Failed to query immersive-ar support", error);
    immersiveArSupported = false;
  }
}

retryButton?.addEventListener("click", () => {
  startSession();
});

if (isIOSChromeLike) {
  setOverlayMode("idle");
  showRetry(false);
  setStatus("この端末・ブラウザはWebXRのARに対応していません。Quick Look は Safari でのみ起動できます。");
} else if (!navigator.xr || !immersiveArSupported) {
  setOverlayMode("idle");
  showRetry(false);
  let message = "この端末・ブラウザはWebXRのARに対応していません。";
  if (isiOS) {
    message += " 「Quick Lookで開く」 > 右上のキューブ状アイコンをタップしてARを起動してください。";
  } else if (isAndroid) {
    message += " 「Scene Viewerで開く」をタップするとGoogle Scene ViewerでAR体験が可能です。";
  } else {
    message += " このブラウザでは本アプリはご利用いただけません。";
  }
  setStatus(message);
} else {
  initializeThree();

  // 初回は自動でセッション開始を試みる
  startSession(true).catch((error) => {
    console.warn("Auto-start failed", error);
  });
}

function initializeThree() {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    canvas,
  });
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local");
  renderer.autoClear = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  resizeRenderer();

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 30);

  const light = new THREE.HemisphereLight(0xffffff, 0x445566, 1.0);
  scene.add(light);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(0.2, 1, 0.1);
  scene.add(dirLight);

  createReticle();
  loadModel();

  window.addEventListener("resize", resizeRenderer);
}

function setupExternalARLink() {
  if (!quickLookLink) return;

  const modelAbsoluteUrl = new URL(MODEL_URL, window.location.origin).href;

  if (isSafari) {
    quickLookLink.hidden = false;
    quickLookLink.textContent = "Quick Lookで開く";
    quickLookLink.setAttribute("rel", "ar");
    quickLookLink.href = "/assets/model.usdz";
    quickLookLink.removeAttribute("aria-disabled");
    if (quickLookInstructionHandler) {
      quickLookLink.removeEventListener("click", quickLookInstructionHandler);
      quickLookInstructionHandler = undefined;
    }
  } else if (isIOSChromeLike) {
    quickLookLink.hidden = false;
    quickLookLink.textContent = "Quick Lookで開く";
    quickLookLink.setAttribute("rel", "nofollow");
    quickLookLink.href = "#";
    quickLookLink.setAttribute("aria-disabled", "true");
    quickLookInstructionHandler = (event) => {
      event.preventDefault();
      setStatus("Quick Look は Safari でのみ起動できます。共有メニューから「Safariで開く」を選択してください。");
    };
    quickLookLink.addEventListener("click", quickLookInstructionHandler);
  } else if (isiOS) {
    quickLookLink.hidden = false;
    quickLookLink.textContent = "Quick Lookで開く";
    quickLookLink.setAttribute("rel", "ar");
    quickLookLink.href = "/assets/model.usdz";
    quickLookLink.removeAttribute("aria-disabled");
    if (quickLookInstructionHandler) {
      quickLookLink.removeEventListener("click", quickLookInstructionHandler);
      quickLookInstructionHandler = undefined;
    }
  } else if (isAndroid) {
    quickLookLink.hidden = false;
    quickLookLink.textContent = "Scene Viewerで開く";
    quickLookLink.setAttribute("rel", "ar");
    const intentUrl = `intent://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(
      modelAbsoluteUrl
    )}&mode=ar_preferred&link=${encodeURIComponent(
      window.location.href
    )}#Intent;scheme=https;package=com.google.ar.core;action=android.intent.action.VIEW;end`;
    quickLookLink.href = intentUrl;
    quickLookLink.removeAttribute("aria-disabled");
  } else {
    quickLookLink.hidden = true;
  }
}

let reticle;
const placeMatrix = new THREE.Matrix4();

function createReticle() {
  const geometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: 0x66ccff,
    transparent: true,
    opacity: 0.6,
  });
  reticle = new THREE.Mesh(geometry, material);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);
}

async function loadModel() {
  const loader = new GLTFLoader();
  try {
    const gltf = await loader.loadAsync(MODEL_URL);
    modelRoot = gltf.scene;
    modelRoot.visible = false;
    modelRoot.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });
    scene.add(modelRoot);
  } catch (error) {
    console.error("Failed to load GLB", error);
    setStatus("3Dモデルを読み込めませんでした。");
  }
}

function resizeRenderer() {
  if (!renderer) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  if (camera) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

async function startSession(isAuto = false) {
  if (!navigator.xr) return;

  if (xrSession) {
    await xrSession.end();
  }

  setOverlayMode("starting");
  setStatus("カメラ起動中…");
  showRetry(false);

  try {
    const session = await navigator.xr.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay", "plane-detection", "anchors", "light-estimation"],
      domOverlay: { root: overlayRoot },
    });

    xrSession = session;
    hitTestSource = null;
    hitTestRequested = false;
    modelPlaced = false;
    anchor = null;
    anchorSpace = null;

    session.addEventListener("end", () => {
      setOverlayMode("idle");
      setStatus("ARセッションを終了しました。ARを再開を押すと再接続します。");
      showRetry(true);
      if (reticle) reticle.visible = false;
      hitTestSource?.cancel?.();
      hitTestSource = null;
      hitTestRequested = false;
      anchor = null;
      anchorSpace = null;
      renderer.setAnimationLoop(null);
    });

    renderer.xr.setSession(session);
    xrRefSpace = await session.requestReferenceSpace("local");
    viewerSpace = await session.requestReferenceSpace("viewer");

    setOverlayMode("in-session");
    setStatus("床をスキャンしています…");

    renderer.setAnimationLoop(onXRFrame);
  } catch (error) {
    setOverlayMode("idle");
    showRetry(true);

    if (isAuto && error?.name === "NotAllowedError") {
      setStatus("ブラウザにより自動起動がブロックされました。ARを再開を押してください。");
      return;
    }

    setStatus(`ARを開始できませんでした: ${error?.message || error}`);
    throw error;
  }
}

function onXRFrame(time, frame) {
  const session = renderer.xr.getSession();
  if (!session || !frame) return;

  const referenceSpace = xrRefSpace;
  if (!referenceSpace) return;

  if (!hitTestRequested) {
    session.requestHitTestSource({ space: viewerSpace }).then((source) => {
      hitTestSource = source;
    });
    hitTestRequested = true;
  }

  if (hitTestSource) {
    const hitTestResults = frame.getHitTestResults(hitTestSource);

    if (!modelPlaced && hitTestResults.length > 0) {
      const hit = hitTestResults[0];
      const pose = hit.getPose(referenceSpace);
      if (pose) {
        placeMatrix.fromArray(pose.transform.matrix);
        reticle?.matrix.copy(placeMatrix);
        reticle.visible = true;

        if (hit.createAnchor) {
          hit
            .createAnchor()
            .then((createdAnchor) => {
              anchor = createdAnchor;
              anchorSpace = createdAnchor.anchorSpace;
              modelPlaced = true;
              if (modelRoot) {
                modelRoot.matrixAutoUpdate = false;
                modelRoot.visible = true;
                modelRoot.matrixWorldNeedsUpdate = true;
              }
              if (reticle) reticle.visible = false;
              setStatus("モデルを固定しました。自由に動いてツーショットを撮影してください。");
            })
            .catch((error) => {
              console.warn("Anchor creation failed", error);
              applyTransformOnce();
            });
        } else {
          applyTransformOnce();
        }

        function applyTransformOnce() {
          modelPlaced = true;
          if (!modelRoot) return;
          modelRoot.visible = true;
          modelRoot.matrixAutoUpdate = false;
          modelRoot.matrix.copy(placeMatrix);
          modelRoot.matrix.decompose(modelRoot.position, modelRoot.quaternion, modelRoot.scale);
          modelRoot.matrixWorldNeedsUpdate = true;
          if (reticle) reticle.visible = false;
          setStatus("モデルを固定しました。自由に動いてツーショットを撮影してください。");
        }
      }
    }

    if (!modelPlaced && hitTestResults.length === 0) {
      reticle && (reticle.visible = false);
      setStatus("床を認識中… 端末をゆっくり動かしてください。");
    }
  }

  if (anchorSpace && modelRoot) {
    const anchorPose = frame.getPose(anchorSpace, referenceSpace);
    if (anchorPose) {
      modelRoot.matrix.copy(placeMatrix.fromArray(anchorPose.transform.matrix));
      modelRoot.matrix.decompose(modelRoot.position, modelRoot.quaternion, modelRoot.scale);
      modelRoot.matrixWorldNeedsUpdate = true;
    }
  }

  renderer.render(scene, camera);
}

export {}; // 明示的にモジュール化
