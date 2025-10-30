const modelViewer = document.getElementById('mv');
const arButton = document.getElementById('arLaunch');
const fallbackLine = document.querySelector('.fallback');

const userAgent = navigator.userAgent || '';
const isiOS = /iP(ad|hone|od)/i.test(userAgent);
const isAndroid = /Android/i.test(userAgent);
const isIOSChromeLike = isiOS && /(CriOS|FxiOS|EdgiOS|OPiOS)/i.test(userAgent);
const isSafari = isiOS && !isIOSChromeLike && /Safari/i.test(userAgent);

const setFallback = (message) => {
  if (!fallbackLine) return;
  fallbackLine.textContent = message;
};

const clearFallback = () => setFallback('');

const ensureModelViewerDefined = async () => {
  if (!customElements.get('model-viewer')) {
    try {
      await customElements.whenDefined('model-viewer');
    } catch (error) {
      console.warn('model-viewer custom element が初期化されませんでした', error);
    }
  }
};

const ensureManualRevealLoaded = () => {
  if (!modelViewer) return;

  if (modelViewer.reveal === 'manual' && typeof modelViewer.dismissPoster === 'function') {
    try {
      modelViewer.dismissPoster();
    } catch (error) {
      console.debug('dismissPoster でエラーが発生しましたが無視します', error);
    }
  }
};

const buildAbsoluteUrl = (relativeOrAbsolute) => {
  try {
    return new URL(relativeOrAbsolute, window.location.href).toString();
  } catch (error) {
    console.warn('URLの解決に失敗しました', relativeOrAbsolute, error);
    return null;
  }
};

const syncSupportState = () => {
  if (!modelViewer || !arButton) return;

  const canActivate = typeof modelViewer.canActivateAR === 'boolean'
    ? modelViewer.canActivateAR
    : null;

  arButton.disabled = false;

  if (canActivate) {
    clearFallback();
    return;
  }

  if (isiOS && !isSafari) {
    setFallback('iOS版Chrome等ではQuick Lookを別ウィンドウで開きます。起動しない場合はSafariをご利用ください。');
    return;
  }

  if (isSafari) {
    if (canActivate === null) {
      setFallback('ARの対応状況を確認しています…');
    } else {
      setFallback('Quick Lookの準備に失敗しました。HTTPS証明書が信頼済みか確認してください。');
    }
    return;
  }

  if (isAndroid) {
    setFallback('Scene Viewerは公開HTTPSのGLBとARCore対応端末が必要です。証明書と公開URLを確認してください。');
    return;
  }

  if (canActivate === null) {
    setFallback('ARの対応状況を確認しています…');
    return;
  }

  if (isiOS) {
    setFallback('この端末はQuick Lookが利用できない設定です。iOS Safariで再度お試しください。');
  } else if (isAndroid) {
    setFallback('この端末はScene Viewerに対応していません。ARCore対応端末か最新版Chromeをご利用ください。');
  } else {
    setFallback('この端末・ブラウザはARに対応していません。');
  }
};

const handleARStatus = (event) => {
  const { status, reason } = event.detail || {};
  if (status === 'failed') {
    setFallback('ARの起動に失敗しました。別のブラウザや端末をお試しください。');
    if (reason) {
      console.warn('AR failed', reason);
    }
  }

  if (status === 'not-presenting') {
    syncSupportState();
  }
};

const initialize = async () => {
  if (!modelViewer || !arButton) return;

  setFallback('ARの起動準備中です…');
  await ensureModelViewerDefined();
  ensureManualRevealLoaded();
  syncSupportState();

  modelViewer.addEventListener('load', syncSupportState);
  modelViewer.addEventListener('model-ready', syncSupportState);
  modelViewer.addEventListener('model-visibility', syncSupportState, { once: true });
  modelViewer.addEventListener('ar-status', handleARStatus);
};

initialize();

const launchIOSQuickLookFallback = () => {
  const iosSrc = modelViewer?.getAttribute('ios-src');
  if (!iosSrc) {
    setFallback('Quick Look用のモデルが見つかりません。');
    return false;
  }

  const absolute = buildAbsoluteUrl(iosSrc);
  if (!absolute) {
    setFallback('Quick Look用URLを解決できませんでした。');
    return false;
  }

  const anchor = document.createElement('a');
  anchor.setAttribute('rel', 'ar');
  anchor.setAttribute('href', absolute);
  anchor.style.position = 'absolute';
  anchor.style.width = '1px';
  anchor.style.height = '1px';
  anchor.style.overflow = 'hidden';
  anchor.style.clipPath = 'inset(50%)';

  const img = document.createElement('img');
  img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQImWNk+M/wHwAFygJ+Kcb5NwAAAABJRU5ErkJggg==';
  img.alt = '';
  img.width = 1;
  img.height = 1;
  anchor.appendChild(img);

  document.body.appendChild(anchor);

  try {
    anchor.click();
    return true;
  } catch (error) {
    console.warn('Quick Look fallback click failed', error);
    return false;
  } finally {
    document.body.removeChild(anchor);
  }
};

const launchAndroidSceneViewerIntent = () => {
  const src = modelViewer?.getAttribute('src');
  if (!src) {
    setFallback('Scene Viewer用のモデルが見つかりません。');
    return false;
  }

  const absolute = buildAbsoluteUrl(src);
  if (!absolute) {
    setFallback('Scene Viewer用URLを解決できませんでした。');
    return false;
  }

  if (!absolute.startsWith('https://')) {
    setFallback('Scene ViewerはHTTPSで公開されたURLが必要です。');
    alert('Scene ViewerはHTTPSで公開されたURLが必要です。');
    return false;
  }

  const sceneViewerHref = `intent://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(absolute)}&mode=ar_only#Intent;scheme=https;package=com.google.ar.core;S.browser_fallback_url=${encodeURIComponent(window.location.href)};end;`;

  const anchor = document.createElement('a');
  anchor.setAttribute('href', sceneViewerHref);
  document.body.appendChild(anchor);

  try {
    anchor.click();
    return true;
  } catch (error) {
    console.warn('Scene Viewer intent の起動に失敗しました', error);
    return false;
  } finally {
    document.body.removeChild(anchor);
  }
};

arButton?.addEventListener('click', () => {
  if (!modelViewer) return;

  if (isiOS && !isSafari) {
    const launched = launchIOSQuickLookFallback();
    if (!launched) {
      setFallback('Quick Lookが開けませんでした。Safariで再度お試しください。');
      alert('Quick Lookが開けませんでした。Safariで再度お試しください。');
    }
    return;
  }

  if (isAndroid) {
    const launched = launchAndroidSceneViewerIntent();
    if (!launched) {
      setFallback('Scene Viewerが起動できませんでした。公開HTTPS環境に配置されているか確認してください。');
    }
    return;
  }

  if (modelViewer.canActivateAR) {
    try {
      modelViewer.activateAR();
    } catch (error) {
      console.warn('activateAR failed', error);
      setFallback('ARの起動に失敗しました。もう一度お試しください。');
    }
    return;
  }

  setFallback('この端末・ブラウザはARに対応していません。');
  alert('この端末・ブラウザはARに対応していません。');
});
