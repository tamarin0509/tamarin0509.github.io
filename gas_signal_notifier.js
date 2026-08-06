// ============================================================
//  RSI Breakout Signal Notifier - Google Apps Script
//  毎日 Gmail で 日経平均 / ドル円 のシグナルを通知する
//
//  【設定手順】
//  1. https://script.google.com/ を開く
//  2. 「新しいプロジェクト」→ このファイルの内容を貼り付け
//  3. 「トリガー」→「トリガーを追加」→
//       関数: sendDailySignalEmail
//       イベント: 時間主導型 → 日タイマー → 希望の時刻を選択
//  4. 初回は手動実行して Gmail 送信を確認
// ============================================================

const CONFIG = {
  EMAIL: 'motochan1969@gmail.com',
  SYMBOLS: [
    { symbol: '^N225',    name: '日経平均',  preset: 'stock' },
    { symbol: 'USDJPY=X', name: 'ドル円',    preset: 'forex' }
  ],
  PERIOD: '6mo',
  INTERVAL: '1d',
  SIGNAL_LOOKBACK_DAYS: 5  // 直近何日以内のシグナルを「最新」と見なすか
};

const PRESETS = {
  forex: { rsiPeriod: 14, maPeriod: 50, maMethod: 'EMA', margin: 1.0, minGap: 2, nLines: 3 },
  stock: { rsiPeriod: 9,  maPeriod: 25, maMethod: 'EMA', margin: 1.5, minGap: 3, nLines: 3 }
};

// ============================================================
//  メイン関数 - トリガーで毎日実行される
// ============================================================
function sendDailySignalEmail() {
  const results = [];

  for (const asset of CONFIG.SYMBOLS) {
    const candles = fetchYahooData(asset.symbol, CONFIG.PERIOD, CONFIG.INTERVAL);
    if (!candles || candles.length < 50) {
      results.push({ ...asset, error: 'データ取得失敗' });
      continue;
    }

    const params = PRESETS[asset.preset];
    const rsi    = calculateRSI(candles, params.rsiPeriod);
    const rsiMa  = calculateMA(rsi, params.maPeriod, params.maMethod);
    const { signals } = calculateRsiBreakout(candles, rsi, rsiMa, params);

    const lastIdx  = candles.length - 1;
    const lastRsi  = rsi[lastIdx];
    const cutoff   = new Date();
    cutoff.setDate(cutoff.getDate() - CONFIG.SIGNAL_LOOKBACK_DAYS);

    const recentSignals = signals.filter(s => new Date(s.time) >= cutoff);

    results.push({
      ...asset,
      lastDate  : candles[lastIdx].time,
      lastPrice : candles[lastIdx].close,
      lastRsi   : lastRsi != null ? lastRsi.toFixed(2) : 'N/A',
      recentSignals,
      latestSignal: signals.length > 0 ? signals[signals.length - 1] : null
    });
  }

  const html    = buildEmailHtml(results);
  const today   = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');
  const subject = `📈 RSIシグナルレポート ${today}`;

  GmailApp.sendEmail(CONFIG.EMAIL, subject, '(HTMLメールを表示してください)', { htmlBody: html });
  Logger.log('メール送信完了: ' + subject);
}

// ============================================================
//  Yahoo Finance データ取得
// ============================================================
function fetchYahooData(symbol, range, interval) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
              encodeURIComponent(symbol) +
              '?range=' + range + '&interval=' + interval;
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    const data   = JSON.parse(res.getContentText());
    const result = data.chart && data.chart.result && data.chart.result[0];
    if (!result) return null;

    const ts  = result.timestamp;
    const q   = result.indicators.quote[0];
    const out = [];
    for (let i = 0; i < ts.length; i++) {
      if (!ts[i] || !q.close[i] || !q.open[i] || !q.high[i] || !q.low[i]) continue;
      out.push({
        time : Utilities.formatDate(new Date(ts[i] * 1000), 'UTC', 'yyyy-MM-dd'),
        open : q.open[i],  high : q.high[i],
        low  : q.low[i],   close: q.close[i]
      });
    }
    return out;
  } catch (e) {
    Logger.log('fetchError[' + symbol + ']: ' + e.message);
    return null;
  }
}

// ============================================================
//  RSI 計算 (Wilder's / Close+High+Low 平均)
// ============================================================
function calculateSingleRSI(candles, period, field) {
  const rsi = new Array(candles.length).fill(null);
  let sumG = 0, sumL = 0;
  for (let i = 1; i <= period; i++) {
    const ch = candles[i][field] - candles[i-1][field];
    if (ch > 0) sumG += ch; else sumL += Math.abs(ch);
  }
  let avgG = sumG / period, avgL = sumL / period;
  rsi[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < candles.length; i++) {
    const ch = candles[i][field] - candles[i-1][field];
    const g  = ch > 0 ? ch : 0;
    const l  = ch < 0 ? Math.abs(ch) : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
    rsi[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return rsi;
}

function calculateRSI(candles, period) {
  if (candles.length <= period) return new Array(candles.length).fill(null);
  const rc = calculateSingleRSI(candles, period, 'close');
  const rh = calculateSingleRSI(candles, period, 'high');
  const rl = calculateSingleRSI(candles, period, 'low');
  return candles.map((_, i) =>
    (rc[i] != null && rh[i] != null && rl[i] != null) ? (rc[i] + rh[i] + rl[i]) / 3 : null
  );
}

// ============================================================
//  移動平均 (SMA / EMA)
// ============================================================
function calculateMA(data, period, method) {
  const ma    = new Array(data.length).fill(null);
  const first = data.findIndex(v => v !== null);
  if (first === -1) return ma;

  if (method === 'SMA') {
    let sum = 0, cnt = 0;
    for (let i = first; i < data.length; i++) {
      if (data[i] == null) continue;
      sum += data[i]; cnt++;
      if (cnt > period) sum -= data[i - period];
      if (cnt >= period) ma[i] = sum / period;
    }
  } else {
    const k = 2 / (period + 1);
    let ema = null, sum = 0, cnt = 0;
    for (let i = first; i < data.length; i++) {
      if (data[i] == null) continue;
      if (ema == null) {
        sum += data[i]; cnt++;
        if (cnt === period) { ema = sum / period; ma[i] = ema; }
      } else {
        ema = data[i] * k + ema * (1 - k);
        ma[i] = ema;
      }
    }
  }
  return ma;
}

// ============================================================
//  RSI ブレイクアウト計算 (MQL4 アルゴリズム移植)
// ============================================================
function arrayMax(arr, count, start) {
  let mv = -Infinity, mi = start;
  const end = Math.min(arr.length, start + count);
  for (let i = start; i < end; i++) if (arr[i] > mv) { mv = arr[i]; mi = i; }
  return mi;
}
function arrayMin(arr, count, start) {
  let mv = Infinity, mi = start;
  const end = Math.min(arr.length, start + count);
  for (let i = start; i < end; i++) if (arr[i] < mv) { mv = arr[i]; mi = i; }
  return mi;
}

function calculateRsiBreakout(candles, rsi, rsiMa, params) {
  const N       = candles.length;
  const rsiMt4  = new Array(N).fill(0);
  const kairiMt4= new Array(N).fill(0);

  for (let i = 0; i < N; i++) {
    const ji     = N - 1 - i;
    rsiMt4[i]   = rsi[ji] != null ? rsi[ji] : 0;
    const mv     = rsiMa[ji];
    kairiMt4[i] = (mv && mv !== 0 && rsi[ji] != null) ? (rsi[ji] - mv) / mv : 0;
  }

  let j = 0;
  const ii = [];
  for (let i = 1; i < N - 1; i++) {
    if (j >= params.nLines * 2 + 10) break;
    if (kairiMt4[i] * kairiMt4[i+1] <= 0) {
      ii[j] = i; j++;
      if (j > 2 && ii[j-1] - ii[j-3] < params.minGap) j -= 2;
    }
  }

  const Hi = [], Lo = [];
  const maxLL = Math.min(params.nLines + 6, Math.floor((j - 2) / 2));
  if (j > 2) {
    if (kairiMt4[ii[0]] < 0) {
      for (let ll = 0; ll < maxLL; ll++) {
        Hi[ll] = arrayMax(rsiMt4, ii[1+ll*2] - ii[0+ll*2] + 1, ii[0+ll*2] + 1);
        Lo[ll] = arrayMin(rsiMt4, ii[2+ll*2] - ii[1+ll*2] + 1, ii[1+ll*2] + 1);
      }
    } else {
      for (let ll = 0; ll < maxLL; ll++) {
        Hi[ll] = arrayMax(rsiMt4, ii[2+ll*2] - ii[1+ll*2], ii[1+ll*2] + 1);
        Lo[ll] = arrayMin(rsiMt4, ii[1+ll*2] - ii[0+ll*2], ii[0+ll*2] + 1);
      }
    }
  }

  const buf3 = new Array(N).fill(null);
  const buf4 = new Array(N).fill(null);
  const nGen = Math.min(params.nLines, maxLL - 1);
  for (let ll = 0; ll < nGen; ll++) {
    const hp1=rsiMt4[Hi[ll]], hp2=rsiMt4[Hi[ll+1]], hp1n=Hi[ll], hp3n=ll>0?Hi[ll-1]:0;
    const rh = hp1n !== Hi[ll+1] ? (hp2 - hp1) / (Hi[ll+1] - hp1n) : 0;
    const lp1=rsiMt4[Lo[ll]], lp2=rsiMt4[Lo[ll+1]], lp1n=Lo[ll], lp3n=ll>0?Lo[ll-1]:0;
    const rl = lp1n !== Lo[ll+1] ? (lp1 - lp2) / (Lo[ll+1] - lp1n) : 0;
    for (let k = 1; k <= hp1n - hp3n; k++) buf3[hp1n - k] = hp1 - rh * k;
    for (let k = 1; k <= lp1n - lp3n; k++) buf4[lp1n - k] = lp1 + rl * k;
  }

  const signals = [];
  for (let i = N - 2; i >= 0; i--) {
    const ji = N - 1 - i;
    if (buf3[i] != null && buf3[i+1] != null) {
      if (rsiMt4[i+1] <= buf3[i+1] + params.margin && rsiMt4[i] > buf3[i] + params.margin) {
        signals.push({ time: candles[ji].time, type: 'BUY',  price: candles[ji].close, rsi: rsi[ji], lineValue: buf3[i] });
      }
    }
    if (buf4[i] != null && buf4[i+1] != null) {
      if (rsiMt4[i+1] >= buf4[i+1] - params.margin && rsiMt4[i] < buf4[i] - params.margin) {
        signals.push({ time: candles[ji].time, type: 'SELL', price: candles[ji].close, rsi: rsi[ji], lineValue: buf4[i] });
      }
    }
  }
  signals.sort((a, b) => a.time.localeCompare(b.time));
  return { signals };
}

// ============================================================
//  HTML メール本文生成
// ============================================================
function buildEmailHtml(results) {
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy年MM月dd日 (E)');

  let rows = '';
  for (const r of results) {
    if (r.error) {
      rows += `<tr><td colspan="5" style="padding:12px;color:#e74c3c;">⚠ ${r.name} (${r.symbol}) - ${r.error}</td></tr>`;
      continue;
    }

    const rsiVal  = parseFloat(r.lastRsi);
    const rsiColor = rsiVal >= 70 ? '#e74c3c' : rsiVal <= 30 ? '#27ae60' : '#2c3e50';

    let sigHtml = '<span style="color:#999;">シグナルなし</span>';
    if (r.recentSignals.length > 0) {
      sigHtml = r.recentSignals.map(s => {
        const c = s.type === 'BUY' ? '#27ae60' : '#e74c3c';
        const a = s.type === 'BUY' ? '▲ BUY'  : '▼ SELL';
        const rsiStr = s.rsi != null ? s.rsi.toFixed(1) : '—';
        return `<strong style="color:${c};">${a}</strong>&nbsp;${s.time}&nbsp;RSI:${rsiStr}`;
      }).join('<br>');
    }

    const priceStr = typeof r.lastPrice === 'number'
      ? r.lastPrice < 10 ? r.lastPrice.toFixed(3) : r.lastPrice.toFixed(2)
      : r.lastPrice;

    rows += `
      <tr>
        <td style="padding:12px 10px;border-bottom:1px solid #eee;">
          <strong>${r.name}</strong><br>
          <small style="color:#999;">${r.symbol}</small>
        </td>
        <td style="padding:12px 10px;border-bottom:1px solid #eee;">${r.lastDate}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #eee;font-family:monospace;">${priceStr}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #eee;color:${rsiColor};font-weight:bold;font-size:16px;">${r.lastRsi}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #eee;font-size:13px;">${sigHtml}</td>
      </tr>`;
  }

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#f4f6f8;font-family:'Helvetica Neue',Arial,'Hiragino Sans',sans-serif;">
  <div style="max-width:680px;margin:0 auto;">

    <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);
                padding:22px 24px;border-radius:10px 10px 0 0;color:#fff;">
      <div style="font-size:20px;font-weight:bold;">📈 RSIブレイクアウト シグナルレポート</div>
      <div style="margin-top:4px;opacity:0.85;font-size:13px;">${today}</div>
    </div>

    <table style="width:100%;border-collapse:collapse;background:#fff;">
      <thead>
        <tr style="background:#f8f9fa;font-size:12px;color:#666;">
          <th style="padding:10px;text-align:left;border-bottom:2px solid #dee2e6;">銘柄</th>
          <th style="padding:10px;text-align:left;border-bottom:2px solid #dee2e6;">日付</th>
          <th style="padding:10px;text-align:left;border-bottom:2px solid #dee2e6;">終値</th>
          <th style="padding:10px;text-align:left;border-bottom:2px solid #dee2e6;">RSI</th>
          <th style="padding:10px;text-align:left;border-bottom:2px solid #dee2e6;">直近5日シグナル</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="background:#fff;border-top:1px solid #eee;padding:14px 16px;border-radius:0 0 10px 10px;font-size:11px;color:#888;">
      ▲ BUY = RSI抵抗線ブレイクアウト &nbsp;|&nbsp; ▼ SELL = RSI支持線ブレイクアウト<br>
      RSI&gt;70 赤（買われすぎ）&nbsp;/&nbsp; RSI&lt;30 緑（売られすぎ）&nbsp;/&nbsp;
      パラメータ: 日経→株式標準(RSI9/EMA25)&nbsp;&nbsp;ドル円→FOREX標準(RSI14/EMA50)
    </div>
  </div>
</body></html>`;
}
