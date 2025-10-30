const modelViewer = document.getElementById('mv');
const arButton = document.getElementById('arLaunch');
const fallbackLine = document.querySelector('.fallback');
const screenshotNotice = document.getElementById('androidShotNotice');

const userAgent = navigator.userAgent || '';
const isiOS = /iP(ad|hone|od)/i.test(userAgent);
const isAndroid = /Android/i.test(userAgent);
const uaDataBrands = navigator.userAgentData?.brands ?? [];
const hasChromiumBrand = uaDataBrands.some(({ brand }) => /Chrom(e|ium)|Google/i.test(brand));
const hasChromeObject = typeof window !== 'undefined' && !!window.chrome &&
  (typeof window.chrome === 'object') &&
  (window.chrome.webstore || window.chrome.runtime);
const isIOSChromeLike = isiOS && (/(CriOS|FxiOS|EdgiOS|OPiOS|GSA)/i.test(userAgent) || hasChromiumBrand || hasChromeObject);
const isSafari = isiOS && !isIOSChromeLike && /Safari/i.test(userAgent);
const isAndroidChrome = isAndroid && /Chrome\/\d+/i.test(userAgent) && !/Edg|OPR|SamsungBrowser/i.test(userAgent);
const QL_URL = '/assets/model.usdz#allowsContentScaling=1';

const openQuickLookInSafari = (url) => {
  // Safari用：rel="ar" アンカーで起動（ユーザー操作内で同期的に実行する必要あり）
  const a = document.createElement('a');
  a.rel = 'ar';
  a.href = url;
  const img = document.createElement('img');
  img.src =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQImWNk+M/wHwAFygJ+Kcb5NwAAAABJRU5ErkJggg==';
  img.alt = '';
  img.width = img.height = 1;
  a.appendChild(img);
  document.body.appendChild(a);
  a.click();
  a.remove();
};

const openQuickLookInWKWebView = (url) => {
  // WKWebView（iOS Chrome / GSA / Edge / Firefox 等）は blob: を開けないため HTTPS 直遷移
  window.location.assign(url);
};

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

const syncSupportState = () => {
  if (!modelViewer || !arButton) return;

  const canActivate = typeof modelViewer.canActivateAR === 'boolean'
    ? modelViewer.canActivateAR
    : null;

  const secureContext = window.isSecureContext;
  const hasWebXR = 'xr' in navigator;
  const canUseQuickLookFallback = isiOS && canActivate === false;
  const supported = canActivate === true;

  arButton.disabled = !(supported || canUseQuickLookFallback);

  if (supported) {
    clearFallback();
    return;
  }

  if (!secureContext) {
    setFallback('ARの起動にはHTTPSが必要です。信頼できる証明書でアクセスしてください。');
    return;
  }

  if (canActivate === null) {
    setFallback('ARの対応状況を確認しています…');
    return;
  }

  if (canUseQuickLookFallback) {
    setFallback('iOS版Chrome等ではQuick Lookを別ウィンドウで開きます。起動しない場合はSafariをご利用ください。');
    return;
  }

  if (isSafari) {
    setFallback('Quick Lookの準備に失敗しました。証明書とファイルURLをご確認ください。');
    return;
  }

  if (isAndroid) {
    if (!hasWebXR) {
      setFallback('このブラウザはWebXRに対応していません。Chrome最新版をご利用ください。');
    } else {
      setFallback('WebXR ARを起動できません。Chromeの設定でAR機能が有効か、ARCoreがインストールされているか確認してください。');
    }
    return;
  }

  if (isiOS) {
    setFallback('この端末はQuick Lookが利用できない設定です。iOS Safariで再度お試しください。');
    return;
  }

  setFallback('この端末・ブラウザはARに対応していません。対応OSはiOSまたはAndroid、対応ブラウザはiOS Safari / ChromeまたはAndroid Chromeです。');
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
  if (screenshotNotice) {
    screenshotNotice.hidden = !isAndroidChrome;
  }
  await ensureModelViewerDefined();
  ensureManualRevealLoaded();
  syncSupportState();

  modelViewer.addEventListener('load', syncSupportState);
  modelViewer.addEventListener('model-ready', syncSupportState);
  modelViewer.addEventListener('model-visibility', syncSupportState, { once: true });
  modelViewer.addEventListener('ar-status', handleARStatus);
};

initialize();

arButton?.addEventListener('click', async () => {
  if (!modelViewer) return;

  if (isiOS && modelViewer.canActivateAR === false) {
    try {
      if (isSafari) {
        openQuickLookInSafari(QL_URL);
      } else {
        openQuickLookInWKWebView(QL_URL);
      }
    } catch (e) {
      console.warn(e);
      setFallback('Quick Lookを開けませんでした。Safariで再度お試しください。');
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
