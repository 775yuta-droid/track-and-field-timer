/**
 * Lap Timer — app.js
 * 仕様書 lap-timer-spec-v1.3 完全準拠
 *
 * 状態機械: idle → running → finished → idle
 *          finished → running (Undo時)
 */

'use strict';

// ============================================================
// 種目定義 (§3.1)
// ============================================================
const EVENTS = {
  '800':  [400, 800],
  '1500': [300, 700, 1100, 1500],
  '5000': [200, 600, 1000, 1400, 1800, 2200, 2600, 3000, 3400, 3800, 4200, 4600, 5000],
};

// ============================================================
// アプリ状態 (§7)
// ============================================================
const app = {
  state: 'idle',       // 'idle' | 'running' | 'finished'
  startTime: null,     // Date.now() at START
  laps: [],            // Lap[]
  currentIndex: 0,     // 次に記録するラップのインデックス
  eventType: '1500',   // '800' | '1500' | '5000'
  splits: [...EVENTS['1500']],
};

// ============================================================
// 誤タップ防止 (§8.5)
// ============================================================
let lastTapTime = 0;
const DEBOUNCE_MS = 300;

function isDebounced() {
  const now = Date.now();
  if (now - lastTapTime < DEBOUNCE_MS) return true;
  lastTapTime = now;
  return false;
}

// ============================================================
// 時間フォーマット (§8.2)
// mm:ss.t 形式（例: 4:30.3）
// ============================================================
function formatTime(ms) {
  if (ms < 0) ms = 0;
  const totalTenths = Math.floor(ms / 100);
  const tenths = totalTenths % 10;
  const totalSec = Math.floor(ms / 1000);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  return `${min}:${String(sec).padStart(2, '0')}.${tenths}`;
}

// ============================================================
// DOM キャッシュ
// ============================================================
const dom = {
  timerDisplay:  document.getElementById('timer-display'),
  eventSelect:   document.getElementById('event-select'),
  eventLabel:    document.getElementById('event-label'),
  nextDistance:  document.getElementById('next-distance'),
  splitDisplay:  document.getElementById('split-display'),
  btnMain:       document.getElementById('btn-main'),
  btnUndo:       document.getElementById('btn-undo'),
  btnSave:       document.getElementById('btn-save'),
  lapList:       document.getElementById('lap-list'),
  dialogOverlay: document.getElementById('dialog-overlay'),
  btnCancel:     document.getElementById('btn-cancel'),
  btnConfirm:    document.getElementById('btn-confirm-reset'),
  canvas:        document.getElementById('share-canvas'),
};

// ============================================================
// タイマーループ (§8.1)
// ============================================================
let timerInterval = null;

function startTimerLoop() {
  if (timerInterval) return;
  timerInterval = setInterval(updateTimerDisplay, 50);
}

function stopTimerLoop() {
  clearInterval(timerInterval);
  timerInterval = null;
}

function updateTimerDisplay() {
  if (app.state !== 'running') return;
  const elapsed = Date.now() - app.startTime;
  dom.timerDisplay.textContent = formatTime(elapsed);
}

// ============================================================
// UI 更新
// ============================================================
function renderUI() {
  const { state, currentIndex, splits, eventType, laps } = app;
  const isIdle     = state === 'idle';
  const isRunning  = state === 'running';
  const isFinished = state === 'finished';

  // --- メインボタン ---
  const isLastLap = isRunning && currentIndex === splits.length - 2;
  const isFinalLap = isRunning && currentIndex === splits.length - 1;

  let btnLabel, btnState;
  if (isIdle) {
    btnLabel = 'START';
    btnState = 'idle';
  } else if (isFinished) {
    btnLabel = 'RESET';
    btnState = 'reset';
  } else if (isLastLap) {
    btnLabel = 'LAST LAP';
    btnState = 'lastlap';
  } else {
    btnLabel = 'LAP';
    btnState = 'lap';
  }
  dom.btnMain.textContent = btnLabel;
  dom.btnMain.setAttribute('data-state', btnState);
  dom.btnMain.setAttribute('aria-label', btnLabel);

  // --- 種目セレクター / ラベル ---
  dom.eventSelect.hidden = !isIdle;
  dom.eventLabel.hidden  = isIdle;
  if (!isIdle) {
    dom.eventLabel.textContent = `${eventType}m`;
  }

  // --- 次距離表示 (§9.4) ---
  dom.nextDistance.hidden = isIdle;
  if (isRunning) {
    if (isLastLap || isFinalLap) {
      dom.nextDistance.textContent = '→ FINISH';
    } else {
      dom.nextDistance.textContent = `→ ${splits[currentIndex]}m`;
    }
  } else if (isFinished) {
    dom.nextDistance.textContent = 'FINISH';
  }

  // --- 固定スプリット欄 (§9.2) ---
  if (isIdle) {
    dom.splitDisplay.textContent = '--:--.--';
  } else if (laps.length > 0) {
    dom.splitDisplay.textContent = formatTime(laps[laps.length - 1].split);
  }

  // --- Undo ボタン ---
  dom.btnUndo.disabled = laps.length === 0;

  // --- 保存ボタン ---
  dom.btnSave.disabled = !isFinished;
}

// ============================================================
// ラップ行の描画 (§9.3)
// ============================================================
function renderLapRow(lap, isNew = false) {
  const { splits } = app;
  const distance = splits[lap.index];

  const li = document.createElement('li');
  li.className = 'lap-row' + (isNew ? ' new' : '');
  li.setAttribute('data-lap-index', lap.index);

  // アニメーション後にクラス削除
  if (isNew) {
    li.addEventListener('animationend', () => li.classList.remove('new'), { once: true });
  }

  li.innerHTML = `
    <span class="lap-number">Lap ${lap.index + 1}</span>
    <span class="lap-distance">${distance}m</span>
    <span class="lap-split">${formatTime(lap.split)}</span>
    <span class="lap-cumulative">${formatTime(lap.cumulative)}</span>
  `;

  return li;
}

function prependLapRow(lap) {
  const li = renderLapRow(lap, true);
  dom.lapList.insertBefore(li, dom.lapList.firstChild);
}

function rebuildLapList() {
  dom.lapList.innerHTML = '';
  // 新しい順（上積み方式）で表示
  for (let i = app.laps.length - 1; i >= 0; i--) {
    const li = renderLapRow(app.laps[i], false);
    dom.lapList.appendChild(li);
  }
}

// ============================================================
// 状態遷移: idle → running (§5.1)
// ============================================================
function handleStart() {
  if (app.state !== 'idle') return;
  if (isDebounced()) return;

  app.state = 'running';
  app.startTime = Date.now();
  app.laps = [];
  app.currentIndex = 0;
  app.splits = [...EVENTS[app.eventType]];

  dom.lapList.innerHTML = '';
  startTimerLoop();
  renderUI();
}

// ============================================================
// 状態遷移: ラップ記録 (§8.3)
// ============================================================
function handleLap() {
  if (app.state !== 'running') return;
  if (isDebounced()) return;

  const now = Date.now();
  const cumulative = now - app.startTime;
  const prevCumulative = app.laps.length > 0
    ? app.laps[app.laps.length - 1].cumulative
    : 0;
  const split = cumulative - prevCumulative;

  const lap = {
    index: app.currentIndex,
    timestamp: now,
    cumulative,
    split,
  };

  app.laps.push(lap);

  // 最終ラップかどうか (§5.1)
  const isFinal = app.currentIndex === app.splits.length - 1;

  app.currentIndex++;

  if (isFinal) {
    app.state = 'finished';
    stopTimerLoop();
    // タイマー表示を最終値で固定
    dom.timerDisplay.textContent = formatTime(cumulative);
  }

  prependLapRow(lap);
  renderUI();
}

// ============================================================
// 状態遷移: Undo (§8.4)
// ============================================================
function handleUndo() {
  if (app.laps.length === 0) return; // 処理無視 (§13)
  if (isDebounced()) return;
  if (app.state !== 'running' && app.state !== 'finished') return;

  const wasFinished = app.state === 'finished';

  app.laps.pop();
  app.currentIndex--;

  if (wasFinished) {
    app.state = 'running';
    // startTime はそのまま保持
    startTimerLoop();
  }

  rebuildLapList();

  // スプリット欄を前のラップに戻す
  // renderUI内で処理される
  renderUI();
}

// ============================================================
// 状態遷移: RESET確認ダイアログ表示 (§6.2)
// ============================================================
function handleResetRequest() {
  if (app.state !== 'finished') return;
  if (isDebounced()) return;
  showDialog();
}

function showDialog() {
  dom.dialogOverlay.hidden = false;
}

function hideDialog() {
  dom.dialogOverlay.hidden = true;
}

function handleConfirmReset() {
  // finished → idle (§5.1)
  app.state = 'idle';
  app.startTime = null;
  app.laps = [];
  app.currentIndex = 0;
  stopTimerLoop();

  dom.timerDisplay.textContent = '0:00.0';
  dom.splitDisplay.textContent = '--:--.--';
  dom.lapList.innerHTML = '';

  hideDialog();
  renderUI();
}

function handleCancelReset() {
  // finished 状態を維持 (§13)
  hideDialog();
}

// ============================================================
// メインボタンのルーティング
// ============================================================
function handleMainButton() {
  switch (app.state) {
    case 'idle':     handleStart(); break;
    case 'running':  handleLap();   break;
    case 'finished': handleResetRequest(); break;
  }
}

// ============================================================
// 種目切替 (§6.3 — idle のみ有効)
// ============================================================
function handleEventChange(e) {
  if (app.state !== 'idle') {
    // idle 以外は無効 (§13)
    e.target.value = app.eventType;
    return;
  }
  app.eventType = e.target.value;
  app.splits = [...EVENTS[app.eventType]];
}

// ============================================================
// 画像生成・共有 (§10)
// ============================================================
function handleSave() {
  if (app.state !== 'finished') return;

  const canvas = dom.canvas;
  const ctx = canvas.getContext('2d');
  const W = 1080;
  const H = 1920;

  // 背景
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);

  // 定数
  const PADDING_X = 80;
  const FONT_SANS = "-apple-system, 'Helvetica Neue', Arial, sans-serif";
  const FONT_MONO = "'Courier New', Courier, monospace";

  let y = 160;

  // 種目
  ctx.font = `600 52px ${FONT_SANS}`;
  ctx.fillStyle = '#666666';
  ctx.textAlign = 'left';
  ctx.fillText(`${app.eventType}m`, PADDING_X, y);
  y += 80;

  // 合計タイム
  if (app.laps.length > 0) {
    const totalTime = app.laps[app.laps.length - 1].cumulative;
    ctx.font = `bold 80px ${FONT_MONO}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(`Total: ${formatTime(totalTime)}`, PADDING_X, y);
    y += 100;
  }

  // 区切り線
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PADDING_X, y);
  ctx.lineTo(W - PADDING_X, y);
  ctx.stroke();
  y += 60;

  // ヘッダー行
  ctx.font = `500 36px ${FONT_SANS}`;
  ctx.fillStyle = '#666666';
  ctx.textAlign = 'left';
  ctx.fillText('Lap', PADDING_X, y);
  ctx.fillText('距離', PADDING_X + 160, y);
  ctx.textAlign = 'right';
  ctx.fillText('区間', W - PADDING_X - 220, y);
  ctx.fillText('累計', W - PADDING_X, y);
  y += 20;

  // 区切り線（細め）
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING_X, y);
  ctx.lineTo(W - PADDING_X, y);
  ctx.stroke();
  y += 16;

  // ラップ行（時系列順: 古い→新しい / §10.3）
  const ROW_H = 100;
  app.laps.forEach((lap, i) => {
    const isOdd = (i % 2 === 0); // 0始まりので i=0 が Lap1（奇数行）
    const rowBg = isOdd ? '#1A1A1A' : '#000000';

    // 行背景
    ctx.fillStyle = rowBg;
    ctx.fillRect(0, y - 68, W, ROW_H);

    const distance = app.splits[lap.index];
    const rowY = y + 10;

    // Lap N
    ctx.font = `500 36px ${FONT_SANS}`;
    ctx.fillStyle = '#666666';
    ctx.textAlign = 'left';
    ctx.fillText(`Lap ${lap.index + 1}`, PADDING_X, rowY);

    // 距離
    ctx.fillText(`${distance}m`, PADDING_X + 160, rowY);

    // 区間タイム（白・主役）
    ctx.font = `bold 48px ${FONT_MONO}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'right';
    ctx.fillText(formatTime(lap.split), W - PADDING_X - 240, rowY);

    // 累計タイム（グレー・副役）
    ctx.fillStyle = '#AAAAAA';
    ctx.fillText(formatTime(lap.cumulative), W - PADDING_X, rowY);

    y += ROW_H;
  });

  // フッター
  y += 40;
  ctx.font = `400 36px ${FONT_SANS}`;
  ctx.fillStyle = '#333333';
  ctx.textAlign = 'center';
  ctx.fillText('Lap Timer', W / 2, y);

  // PNG ダウンロード
  const link = document.createElement('a');
  link.download = `lap-${app.eventType}m-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ============================================================
// イベントリスナー登録
// ============================================================
dom.btnMain.addEventListener('pointerdown', handleMainButton);
dom.btnUndo.addEventListener('pointerdown', handleUndo);
dom.btnSave.addEventListener('pointerdown', handleSave);
dom.eventSelect.addEventListener('change', handleEventChange);
dom.btnCancel.addEventListener('pointerdown', handleCancelReset);
dom.btnConfirm.addEventListener('pointerdown', handleConfirmReset);

// ダイアログ外タップでキャンセル
dom.dialogOverlay.addEventListener('pointerdown', (e) => {
  if (e.target === dom.dialogOverlay) handleCancelReset();
});

// ============================================================
// PWA: Service Worker 登録
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}

// ============================================================
// 画面縦固定補完 (§12.2 / §15)
// ============================================================
if (screen.orientation && screen.orientation.lock) {
  screen.orientation.lock('portrait').catch(() => {});
}

// ============================================================
// 初期 UI 描画
// ============================================================
renderUI();
