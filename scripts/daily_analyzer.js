// =====================================================
// Daily Watchlist Analyzer (daily_analyzer.js)
// 毎営業日 朝 (JST) 実行想定
// 日足データ (data/candles/*.json) から、日足RSIブレイクアウト・
// 25日移動平均線乖離率・移動平均クロス(5/25EMA)・ボリンジャーバンド(20,2σ)
// を複合分析して daily_watchlist.json を生成する。
// weekly_analyzer.js の日足版で、週締めを待たず毎日更新される点が異なる。
// =====================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CANDLES_DIR = path.join(ROOT, 'data', 'candles');
const RESULTS_FILE = path.join(ROOT, 'screener_results.json');
const WATCHLIST_FILE = path.join(ROOT, 'daily_watchlist.json');

// 判定閾値設定
const CONFIG = {
    rsiPeriod: 14,
    kairiPeriod: 25,
    kairiBuyThreshold: -2.5,    // 25日乖離率 <= -2.5% で押し目買い圏
    kairiSellThreshold: +2.5,   // 25日乖離率 >= +2.5% で過熱・利確圏
    rsiOversold: 30.0,
    rsiOverbought: 70.0,
    maShortPeriod: 5,
    maLongPeriod: 25,
    bollingerPeriod: 20,
    bollingerStdDev: 2,
    freshDailyBars: 3           // 日足シグナルは直近3営業日以内を検出
};

// 監視銘柄マスターリスト（screener.js / weekly_analyzer.js と共通）
const WATCH_SYMBOLS = [
    { symbol: '^N225', name: '日経平均株価 (Nikkei 225)', type: 'index', sector: '指数' },
    { symbol: '^GSPC', name: 'S&P 500 Index', type: 'index', sector: '指数' },
    { symbol: '^DJI', name: 'NYダウ (Dow Jones)', type: 'index', sector: '指数' },
    { symbol: '^IXIC', name: 'ナスダック総合 (NASDAQ)', type: 'index', sector: '指数' },
    { symbol: 'USDJPY=X', name: '米ドル / 円 (USD/JPY)', type: 'forex', sector: '為替' },
    { symbol: 'EURUSD=X', name: 'ユーロ / 米ドル (EUR/USD)', type: 'forex', sector: '為替' },
    { symbol: 'GBPJPY=X', name: '英ポンド / 円 (GBP/JPY)', type: 'forex', sector: '為替' },
    { symbol: 'AUDUSD=X', name: '豪ドル / 米ドル (AUD/USD)', type: 'forex', sector: '為替' },
    { symbol: 'MSFT', name: 'マイクロソフト (MSFT)', type: 'stock', sector: 'テクノロジー' },
    { symbol: 'AAPL', name: 'アップル (AAPL)', type: 'stock', sector: 'テクノロジー' },
    { symbol: 'GOOGL', name: 'アルファベット (GOOGL)', type: 'stock', sector: 'テクノロジー' },
    { symbol: 'AMZN', name: 'アマゾン (AMZN)', type: 'stock', sector: 'テクノロジー' },
    { symbol: 'META', name: 'メタ・プラットフォームズ (META)', type: 'stock', sector: 'テクノロジー' },
    { symbol: '9984.T', name: 'ソフトバンクグループ (9984)', type: 'stock', sector: 'テクノロジー' },
    { symbol: '6758.T', name: 'ソニーグループ (6758)', type: 'stock', sector: 'テクノロジー' },
    { symbol: 'NVDA', name: 'エヌビディア (NVDA)', type: 'stock', sector: '半導体' },
    { symbol: 'AMD', name: 'アドバンスト・マイクロ・デバイセズ (AMD)', type: 'stock', sector: '半導体' },
    { symbol: 'AVGO', name: 'ブロードコム (AVGO)', type: 'stock', sector: '半導体' },
    { symbol: '8035.T', name: '東京エレクトロン (8035)', type: 'stock', sector: '半導体' },
    { symbol: '6857.T', name: 'アドバンテスト (6857)', type: 'stock', sector: '半導体' },
    { symbol: '6146.T', name: 'ディスコ (6146)', type: 'stock', sector: '半導体' },
    { symbol: '285A.T', name: 'キオクシアホールディングス (285A)', type: 'stock', sector: '半導体' },
    { symbol: '1605.T', name: 'INPEX (1605)', type: 'stock', sector: 'エネルギー' },
    { symbol: '5020.T', name: 'ENEOSホールディングス (5020)', type: 'stock', sector: 'エネルギー' },
    { symbol: '5019.T', name: '出光興産 (5019)', type: 'stock', sector: 'エネルギー' },
    { symbol: 'XOM', name: 'エクソンモービル (XOM)', type: 'stock', sector: 'エネルギー' },
    { symbol: 'CVX', name: 'シェブロン (CVX)', type: 'stock', sector: 'エネルギー' },
    { symbol: '7011.T', name: '三菱重工業 (7011)', type: 'stock', sector: '防衛・重工' },
    { symbol: '7012.T', name: '川崎重工業 (7012)', type: 'stock', sector: '防衛・重工' },
    { symbol: '7013.T', name: 'IHI (7013)', type: 'stock', sector: '防衛・重工' },
    { symbol: 'LMT', name: 'ロッキード・マーティン (LMT)', type: 'stock', sector: '防衛・重工' },
    { symbol: 'RTX', name: 'RTX (旧レイセオン)', type: 'stock', sector: '防衛・重工' },
    { symbol: '8306.T', name: '三菱UFJフィナンシャルG (8306)', type: 'stock', sector: '金融' },
    { symbol: '8316.T', name: '三井住友フィナンシャルG (8316)', type: 'stock', sector: '金融' },
    { symbol: '8411.T', name: 'みずほフィナンシャルG (8411)', type: 'stock', sector: '金融' },
    { symbol: 'JPM', name: 'JPモルガン・チェース (JPM)', type: 'stock', sector: '金融' },
    { symbol: 'GS', name: 'ゴールドマン・サックス (GS)', type: 'stock', sector: '金融' },
    { symbol: '8729.T', name: 'ソニーフィナンシャルグループ (8729)', type: 'stock', sector: '金融' },
    { symbol: '7203.T', name: 'トヨタ自動車 (7203)', type: 'stock', sector: '自動車' },
    { symbol: '7267.T', name: 'ホンダ (7267)', type: 'stock', sector: '自動車' },
    { symbol: '7269.T', name: 'スズキ (7269)', type: 'stock', sector: '自動車' },
    { symbol: '7201.T', name: '日産自動車 (7201)', type: 'stock', sector: '自動車' },
    { symbol: 'TSLA', name: 'テスラ (TSLA)', type: 'stock', sector: '自動車' },
    { symbol: '5401.T', name: '日本製鉄 (5401)', type: 'stock', sector: '素材・非鉄' },
    { symbol: '5803.T', name: 'フジクラ (5803)', type: 'stock', sector: '素材・非鉄' },
    { symbol: '5016.T', name: 'JX金属 (5016)', type: 'stock', sector: '素材・非鉄' },
    { symbol: '8001.T', name: '伊藤忠商事 (8001)', type: 'stock', sector: '商社' },
    { symbol: '8031.T', name: '三井物産 (8031)', type: 'stock', sector: '商社' },
    { symbol: '8058.T', name: '三菱商事 (8058)', type: 'stock', sector: '商社' },
    { symbol: '8053.T', name: '住友商事 (8053)', type: 'stock', sector: '商社' },
    { symbol: '8002.T', name: '丸紅 (8002)', type: 'stock', sector: '商社' },
    { symbol: '4502.T', name: '武田薬品工業 (4502)', type: 'stock', sector: '医薬品' },
    { symbol: '4568.T', name: '第一三共 (4568)', type: 'stock', sector: '医薬品' },
    { symbol: 'JNJ', name: 'ジョンソン・エンド・ジョンソン (JNJ)', type: 'stock', sector: '医薬品' },
    { symbol: 'LLY', name: 'イーライリリー (LLY)', type: 'stock', sector: '医薬品' },
    { symbol: '9432.T', name: 'NTT (9432)', type: 'stock', sector: '通信' },
    { symbol: '9433.T', name: 'KDDI (9433)', type: 'stock', sector: '通信' },
    { symbol: '9434.T', name: 'ソフトバンク (9434)', type: 'stock', sector: '通信' },
    { symbol: 'VZ', name: 'ベライゾン (VZ)', type: 'stock', sector: '通信' },
    { symbol: '9983.T', name: 'ファーストリテイリング (9983)', type: 'stock', sector: '消費・小売' },
    { symbol: '7974.T', name: '任天堂 (7974)', type: 'stock', sector: '消費・小売' },
    { symbol: 'WMT', name: 'ウォルマート (WMT)', type: 'stock', sector: '消費・小売' },
    { symbol: 'COST', name: 'コストコ (COST)', type: 'stock', sector: '消費・小売' },
    { symbol: '6981.T', name: '村田製作所 (6981)', type: 'stock', sector: '電子部品' },
    { symbol: '3003.T', name: 'ヒューリック (3003)', type: 'stock', sector: '不動産' },
    { symbol: 'BTC-USD', name: 'ビットコイン (BTC/USD)', type: 'crypto', sector: '暗号資産' },
    { symbol: 'ETH-USD', name: 'イーサリアム (ETH/USD)', type: 'crypto', sector: '暗号資産' },
    { symbol: '3350.T', name: 'メタプラネット (3350)', type: 'stock', sector: '暗号資産' },
    { symbol: '1407.T', name: 'ウエストホールディングス (1407)', type: 'stock', sector: '再エネ・太陽光' },
    { symbol: '9519.T', name: 'レノバ (9519)', type: 'stock', sector: '再エネ・太陽光' },
    { symbol: 'ENPH', name: 'エンフェーズ・エナジー (ENPH)', type: 'stock', sector: '再エネ・太陽光' },
    { symbol: 'FSLR', name: 'ファーストソーラー (FSLR)', type: 'stock', sector: '再エネ・太陽光' },
    { symbol: 'NEE', name: 'ネクステラ・エナジー (NEE)', type: 'stock', sector: '再エネ・太陽光' }
];

// ---------- ユーティリティ ----------

function sanitizeSymbolForFile(symbol) {
    return symbol.replace(/[^A-Za-z0-9._-]/g, '_');
}

// 乖離率計算（終値の period 日SMAからの乖離率 %）
function calculateKairi(candles, period = 25) {
    if (!candles || candles.length < period) {
        return new Array(candles ? candles.length : 0).fill(null);
    }
    const kairi = new Array(candles.length).fill(null);
    let sum = 0;
    for (let i = 0; i < candles.length; i++) {
        sum += candles[i].close;
        if (i >= period - 1) {
            if (i >= period) sum -= candles[i - period].close;
            const sma = sum / period;
            kairi[i] = ((candles[i].close - sma) / sma) * 100.0;
        }
    }
    return kairi;
}

// Wilder RSI（終値・高値・安値の平均、rsi_breakout.js/screener.jsと同一方式）
function calculateSingleRSI(candles, period, priceField) {
    const rsi = new Array(candles.length).fill(null);
    if (!candles || candles.length <= period) return rsi;

    let firstGainSum = 0;
    let firstLossSum = 0;
    for (let i = 1; i <= period; i++) {
        const change = candles[i][priceField] - candles[i - 1][priceField];
        if (change > 0) firstGainSum += change;
        else firstLossSum += Math.abs(change);
    }

    let avgGain = firstGainSum / period;
    let avgLoss = firstLossSum / period;
    rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));

    for (let i = period + 1; i < candles.length; i++) {
        const change = candles[i][priceField] - candles[i - 1][priceField];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? Math.abs(change) : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
    }
    return rsi;
}

function calculateRSI(candles, period = 14) {
    if (!candles || candles.length <= period) return new Array(candles ? candles.length : 0).fill(null);
    const rsiClose = calculateSingleRSI(candles, period, 'close');
    const rsiHigh = calculateSingleRSI(candles, period, 'high');
    const rsiLow = calculateSingleRSI(candles, period, 'low');

    const rsi = new Array(candles.length).fill(null);
    for (let i = 0; i < candles.length; i++) {
        if (rsiClose[i] !== null && rsiHigh[i] !== null && rsiLow[i] !== null) {
            rsi[i] = (rsiClose[i] + rsiHigh[i] + rsiLow[i]) / 3;
        }
    }
    return rsi;
}

// 単純移動平均（汎用: 任意の数値配列に対して）
function calculateSMAArray(values, period) {
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
        sum += values[i];
        if (i >= period) sum -= values[i - period];
        if (i >= period - 1) out[i] = sum / period;
    }
    return out;
}

// 指数移動平均（汎用）
function calculateEMAArray(values, period) {
    const out = new Array(values.length).fill(null);
    const k = 2 / (period + 1);
    let seedSum = 0;
    let prevEma = null;
    for (let i = 0; i < values.length; i++) {
        if (i < period - 1) { seedSum += values[i]; continue; }
        if (i === period - 1) {
            seedSum += values[i];
            prevEma = seedSum / period;
            out[i] = prevEma;
            continue;
        }
        prevEma = values[i] * k + prevEma * (1 - k);
        out[i] = prevEma;
    }
    return out;
}

// ボリンジャーバンド（終値ベース、period日SMA ± stdDev倍の標準偏差）
function calculateBollingerBands(candles, period = 20, mult = 2) {
    const closes = candles.map(c => c.close);
    const mid = calculateSMAArray(closes, period);
    const upper = new Array(closes.length).fill(null);
    const lower = new Array(closes.length).fill(null);
    const percentB = new Array(closes.length).fill(null);

    for (let i = period - 1; i < closes.length; i++) {
        let sumSq = 0;
        for (let k = i - period + 1; k <= i; k++) {
            sumSq += Math.pow(closes[k] - mid[i], 2);
        }
        const stdDev = Math.sqrt(sumSq / period);
        upper[i] = mid[i] + mult * stdDev;
        lower[i] = mid[i] - mult * stdDev;
        const range = upper[i] - lower[i];
        percentB[i] = range > 0 ? (closes[i] - lower[i]) / range : 0.5;
    }
    return { mid, upper, lower, percentB };
}

// 短期/長期EMAクロス検出（直近1本での発生のみを「フレッシュ」として検出）
function detectMaCross(candles, shortPeriod, longPeriod) {
    const closes = candles.map(c => c.close);
    const shortMa = calculateEMAArray(closes, shortPeriod);
    const longMa = calculateEMAArray(closes, longPeriod);
    const n = closes.length;
    if (n < 2) return { cross: null, shortMa: null, longMa: null };

    const sCur = shortMa[n - 1], sPrev = shortMa[n - 2];
    const lCur = longMa[n - 1], lPrev = longMa[n - 2];
    let cross = null;
    if (sCur != null && sPrev != null && lCur != null && lPrev != null) {
        if (sPrev <= lPrev && sCur > lCur) cross = 'golden';
        else if (sPrev >= lPrev && sCur < lCur) cross = 'dead';
    }
    return { cross, shortMa: sCur, longMa: lCur };
}

// 日足RSI Swing Breakout シグナル検出（weekly_analyzer.jsのdetectWeeklyRsiBreakoutと同一アルゴリズム）
function detectRsiBreakout(candles, rsi, swingPeriod = 5) {
    const N = candles.length;
    if (N < swingPeriod * 2 + 5) return [];

    const left = swingPeriod;
    const right = swingPeriod;
    const highs = [];
    const lows = [];

    for (let i = left; i < N - right; i++) {
        const v = rsi[i];
        if (v == null) continue;
        let isHigh = true, isLow = true;
        for (let k = i - left; k <= i + right; k++) {
            if (k === i) continue;
            const w = rsi[k];
            if (w == null) { isHigh = false; isLow = false; break; }
            if (w >= v) isHigh = false;
            if (w <= v) isLow = false;
        }
        if (isHigh) highs.push(i);
        if (isLow) lows.push(i);
    }

    const confirmedUpTo = (pivots, i) => {
        const out = [];
        for (const p of pivots) {
            if (p + right <= i) out.push(p); else break;
        }
        return out;
    };

    const lineFromLastTwo = (values, pivots) => {
        if (pivots.length < 2) return null;
        const b = pivots[pivots.length - 1];
        const a = pivots[pivots.length - 2];
        const va = values[a], vb = values[b];
        if (va == null || vb == null) return null;
        const slope = (vb - va) / (b - a);
        return { a, b, slope, valAt: (x) => vb + slope * (x - b) };
    };

    const signals = [];
    for (let i = 1; i < N; i++) {
        if (rsi[i] == null || rsi[i - 1] == null) continue;

        const resLine = lineFromLastTwo(rsi, confirmedUpTo(highs, i));
        if (resLine && resLine.slope <= 0) {
            const penI = rsi[i] - resLine.valAt(i);
            const penPrev = rsi[i - 1] - resLine.valAt(i - 1);
            if (penI > 0 && penPrev <= 0) {
                signals.push({ barIndex: i, barsAgo: N - 1 - i, date: candles[i].time, type: 'BUY', rsi: rsi[i], price: candles[i].close });
            }
        }

        const supLine = lineFromLastTwo(rsi, confirmedUpTo(lows, i));
        if (supLine && supLine.slope >= 0) {
            const penI = supLine.valAt(i) - rsi[i];
            const penPrev = supLine.valAt(i - 1) - rsi[i - 1];
            if (penI > 0 && penPrev <= 0) {
                signals.push({ barIndex: i, barsAgo: N - 1 - i, date: candles[i].time, type: 'SELL', rsi: rsi[i], price: candles[i].close });
            }
        }
    }
    return signals;
}

// トレードエントリー指示計算（weekly_analyzer.jsのcalculateTradePlanと同一方式）
function calculateTradePlan(dailyCandles, action, close) {
    if (!dailyCandles || dailyCandles.length < 10 || action === 'NEUTRAL') return null;

    const recentBars = dailyCandles.slice(-20);
    const minLow = Math.min(...recentBars.map(c => c.low));
    const maxHigh = Math.max(...recentBars.map(c => c.high));
    const fmtP = (v) => v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(3);

    if (action === 'BUY') {
        let stopLoss = Math.min(minLow * 0.985, close * 0.955);
        if (stopLoss >= close) stopLoss = close * 0.95;
        const risk = close - stopLoss;
        const takeProfit = Math.max(maxHigh, close + risk * 1.8);
        const slPct = ((stopLoss - close) / close) * 100.0;
        const tpPct = ((takeProfit - close) / close) * 100.0;
        const rr = Math.abs(tpPct / slPct);
        const executionNote = `【買付指示】エントリー: ${fmtP(close)}以下 | 損切り(SL): ${fmtP(stopLoss)} (${slPct.toFixed(1)}%) | 利確(TP): ${fmtP(takeProfit)} (+${tpPct.toFixed(1)}%) | RR: 1:${rr.toFixed(1)}`;
        return {
            entryType: '成行 / 押し目買付', entryTarget: close,
            entryRange: `${fmtP(stopLoss * 1.01)} 〜 ${fmtP(close)}`,
            stopLoss: parseFloat(stopLoss.toFixed(2)), stopLossPct: parseFloat(slPct.toFixed(2)),
            takeProfit: parseFloat(takeProfit.toFixed(2)), takeProfitPct: parseFloat(tpPct.toFixed(2)),
            riskRewardRatio: parseFloat(rr.toFixed(2)), executionNote
        };
    } else if (action === 'SELL') {
        let stopLoss = Math.max(maxHigh * 1.015, close * 1.045);
        if (stopLoss <= close) stopLoss = close * 1.05;
        const risk = stopLoss - close;
        const takeProfit = Math.min(minLow, close - risk * 1.8);
        const slPct = ((stopLoss - close) / close) * 100.0;
        const tpPct = ((takeProfit - close) / close) * 100.0;
        const rr = Math.abs(tpPct / slPct);
        const executionNote = `【空売り指示】エントリー: ${fmtP(close)}以上 | 損切り(SL): ${fmtP(stopLoss)} (+${slPct.toFixed(1)}%) | 利確(TP): ${fmtP(takeProfit)} (${tpPct.toFixed(1)}%) | RR: 1:${rr.toFixed(1)}`;
        return {
            entryType: '成行 / 戻り売り', entryTarget: close,
            entryRange: `${fmtP(close)} 〜 ${fmtP(stopLoss * 0.99)}`,
            stopLoss: parseFloat(stopLoss.toFixed(2)), stopLossPct: parseFloat(slPct.toFixed(2)),
            takeProfit: parseFloat(takeProfit.toFixed(2)), takeProfitPct: parseFloat(tpPct.toFixed(2)),
            riskRewardRatio: parseFloat(rr.toFixed(2)), executionNote
        };
    }
    return null;
}

// アクションコメント生成
function generateActionNote(action, triggers, kairi, rsi, percentB) {
    if (action === 'BUY') {
        if (triggers.includes('D1') && triggers.includes('D3')) {
            return `25日乖離率(${kairi.toFixed(1)}%)押し目圏 ＋ 日足RSIブレイクアウト。短期の押し目買いポイント。`;
        }
        if (triggers.includes('D5')) {
            return `ボリンジャーバンド-2σ接触(%B ${(percentB * 100).toFixed(0)}%)。売られ過ぎからの自律反発狙い。`;
        }
        if (triggers.includes('D7')) {
            return `短期(5日)線が長期(25日)線を上抜け(ゴールデンクロス)。短期トレンド転換の初動。`;
        }
        if (triggers.includes('D1')) {
            return `日足RSI抵抗線を上方ブレイク。短期上昇の初動、分割エントリー検討。`;
        }
        if (triggers.includes('D3')) {
            return `25日乖離率(${kairi.toFixed(1)}%)下限到達。売られ過ぎからの自律反発狙い。`;
        }
        if (triggers.includes('D9')) {
            return `スクリーナー最適化シグナル(BUY)点灯中。直近の追随買いを狙う。`;
        }
        return `日足RSI(${rsi.toFixed(1)})低下。反転の兆候をウォッチ。`;
    } else if (action === 'SELL') {
        if (triggers.includes('D2') && triggers.includes('D4')) {
            return `25日乖離率(+${kairi.toFixed(1)}%)過熱圏 ＋ 日足RSI下抜け。短期の利確・警戒ポイント。`;
        }
        if (triggers.includes('D6')) {
            return `ボリンジャーバンド+2σ接触(%B ${(percentB * 100).toFixed(0)}%)。短期的な過熱、利確検討。`;
        }
        if (triggers.includes('D8')) {
            return `短期(5日)線が長期(25日)線を下抜け(デッドクロス)。短期トレンド転換の初動。`;
        }
        if (triggers.includes('D2')) {
            return `日足RSI支持線を下方ブレイク。短期下落の警戒、ストップ設定。`;
        }
        if (triggers.includes('D4')) {
            return `25日乖離率(+${kairi.toFixed(1)}%)上限到達。短期的過熱感、利益確定・手仕舞い推奨。`;
        }
        if (triggers.includes('D9')) {
            return `スクリーナー最適化シグナル(SELL)点灯中。直近の追随売りを狙う。`;
        }
        return `日足過熱水準。無理な追随買いは避け静観。`;
    }
    return `レンジ推移。シグナルの明確化まで待機。`;
}

// ---------- メイン実行フロー ----------

function runAnalyzer() {
    console.log('🚀 [Daily Analyzer] 日足ウォッチリスト自動分析を開始...');

    let screenerResults = { results: [] };
    if (fs.existsSync(RESULTS_FILE)) {
        try {
            screenerResults = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
        } catch (e) {
            console.error('⚠ screener_results.json の読込に失敗:', e.message);
        }
    }
    const screenerMap = new Map();
    (screenerResults.results || []).forEach(r => screenerMap.set(r.symbol, r));

    const alerts = [];
    let latestTradingDay = '';

    for (const info of WATCH_SYMBOLS) {
        const filePath = path.join(CANDLES_DIR, sanitizeSymbolForFile(info.symbol) + '.json');
        if (!fs.existsSync(filePath)) continue;

        let dailyCandles = [];
        try {
            const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            dailyCandles = parsed.candles || [];
        } catch (e) {
            continue;
        }
        if (dailyCandles.length < CONFIG.bollingerPeriod + 5) continue;

        const lastD = dailyCandles[dailyCandles.length - 1];
        const prevD = dailyCandles[dailyCandles.length - 2];
        latestTradingDay = lastD.time;
        const changePct = prevD ? ((lastD.close - prevD.close) / prevD.close) * 100.0 : 0;

        const rsi = calculateRSI(dailyCandles, CONFIG.rsiPeriod);
        const kairi = calculateKairi(dailyCandles, CONFIG.kairiPeriod);
        const currentRsi = rsi[rsi.length - 1];
        const currentKairi = kairi[kairi.length - 1];
        if (currentRsi == null || currentKairi == null) continue;

        const bb = calculateBollingerBands(dailyCandles, CONFIG.bollingerPeriod, CONFIG.bollingerStdDev);
        const currentPercentB = bb.percentB[bb.percentB.length - 1];
        const maInfo = detectMaCross(dailyCandles, CONFIG.maShortPeriod, CONFIG.maLongPeriod);

        const dSignals = detectRsiBreakout(dailyCandles, rsi, 5);
        const freshDSignals = dSignals.filter(s => s.barsAgo <= CONFIG.freshDailyBars);

        const screenerEntry = screenerMap.get(info.symbol) || {};
        const optSignal = screenerEntry.latestSignal;

        const triggers = [];

        const buySignal = freshDSignals.find(s => s.type === 'BUY');
        if (buySignal) triggers.push('D1');
        const sellSignal = freshDSignals.find(s => s.type === 'SELL');
        if (sellSignal) triggers.push('D2');

        if (currentKairi <= CONFIG.kairiBuyThreshold) triggers.push('D3');
        if (currentKairi >= CONFIG.kairiSellThreshold) triggers.push('D4');

        if (currentPercentB != null) {
            if (currentPercentB <= 0) triggers.push('D5');
            if (currentPercentB >= 1) triggers.push('D6');
        }

        if (maInfo.cross === 'golden') triggers.push('D7');
        if (maInfo.cross === 'dead') triggers.push('D8');

        if (optSignal && optSignal.status === 'confirmed' && optSignal.barsAgo <= CONFIG.freshDailyBars) {
            triggers.push('D9');
        }

        if (currentRsi <= CONFIG.rsiOversold || currentRsi >= CONFIG.rsiOverbought) triggers.push('D10');

        let action = 'NEUTRAL';
        let priority = 'NONE';
        const isBuyCandidate = triggers.includes('D1') || triggers.includes('D3') || triggers.includes('D5') || triggers.includes('D7') || (triggers.includes('D9') && optSignal.type === 'BUY');
        const isSellCandidate = triggers.includes('D2') || triggers.includes('D4') || triggers.includes('D6') || triggers.includes('D8') || (triggers.includes('D9') && optSignal.type === 'SELL');

        if (isBuyCandidate && !isSellCandidate) {
            action = 'BUY';
            priority = (triggers.length >= 2 || triggers.includes('D1') || triggers.includes('D7')) ? 'HIGH' : 'MEDIUM';
        } else if (isSellCandidate && !isBuyCandidate) {
            action = 'SELL';
            priority = (triggers.length >= 2 || triggers.includes('D2') || triggers.includes('D8')) ? 'HIGH' : 'MEDIUM';
        } else if (isBuyCandidate && isSellCandidate) {
            action = 'NEUTRAL';
            priority = 'MEDIUM';
        } else if (triggers.includes('D10')) {
            action = currentRsi <= CONFIG.rsiOversold ? 'BUY' : 'SELL';
            priority = 'LOW';
        }

        if (priority !== 'NONE') {
            const parts = [];
            if (triggers.includes('D1')) parts.push('日足RSIブレイク(BUY)');
            if (triggers.includes('D2')) parts.push('日足RSI下抜け(SELL)');
            if (triggers.includes('D3')) parts.push(`25日乖離率 ${currentKairi.toFixed(1)}% (買圏)`);
            if (triggers.includes('D4')) parts.push(`25日乖離率 +${currentKairi.toFixed(1)}% (売圏)`);
            if (triggers.includes('D5')) parts.push(`BB-2σ接触(%B${(currentPercentB * 100).toFixed(0)}%)`);
            if (triggers.includes('D6')) parts.push(`BB+2σ接触(%B${(currentPercentB * 100).toFixed(0)}%)`);
            if (triggers.includes('D7')) parts.push('MAゴールデンクロス(5/25)');
            if (triggers.includes('D8')) parts.push('MAデッドクロス(5/25)');
            if (triggers.includes('D9')) parts.push(`最適化シグナル${optSignal.type}確定(${optSignal.barsAgo}日前)`);
            if (triggers.includes('D10')) parts.push(`RSI極端値(${currentRsi.toFixed(1)})`);

            const note = generateActionNote(action, triggers, currentKairi, currentRsi, currentPercentB);
            const tradePlan = calculateTradePlan(dailyCandles, action, lastD.close);

            alerts.push({
                symbol: info.symbol,
                name: info.name,
                sector: info.sector,
                type: info.type,
                triggers,
                triggerDetails: parts.join(' ＋ '),
                dailyRsi: parseFloat(currentRsi.toFixed(2)),
                dailyKairi25: parseFloat(currentKairi.toFixed(2)),
                bollinger: {
                    upper: parseFloat(bb.upper[bb.upper.length - 1].toFixed(4)),
                    mid: parseFloat(bb.mid[bb.mid.length - 1].toFixed(4)),
                    lower: parseFloat(bb.lower[bb.lower.length - 1].toFixed(4)),
                    percentB: currentPercentB != null ? parseFloat(currentPercentB.toFixed(3)) : null
                },
                maCross: maInfo.cross,
                close: lastD.close,
                changePercent: parseFloat(changePct.toFixed(2)),
                action,
                priority,
                note,
                tradePlan
            });
        }
    }

    alerts.sort((a, b) => {
        const pOrder = { HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };
        if (pOrder[b.priority] !== pOrder[a.priority]) return pOrder[b.priority] - pOrder[a.priority];
        return b.triggers.length - a.triggers.length;
    });

    // 市場サマリー（日経・S&P500・ドル円、日足ベース）
    const getMarketInfo = (sym) => {
        const item = alerts.find(a => a.symbol === sym);
        if (item) return { rsi: item.dailyRsi, change: item.changePercent, close: item.close };
        const filePath = path.join(CANDLES_DIR, sanitizeSymbolForFile(sym) + '.json');
        if (fs.existsSync(filePath)) {
            try {
                const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const c = parsed.candles || [];
                if (c.length >= CONFIG.rsiPeriod + 5) {
                    const rsi = calculateRSI(c, CONFIG.rsiPeriod);
                    const last = c[c.length - 1];
                    const prev = c[c.length - 2];
                    const change = prev ? ((last.close - prev.close) / prev.close) * 100 : 0;
                    return { rsi: parseFloat((rsi[rsi.length - 1] || 50).toFixed(1)), change: parseFloat(change.toFixed(2)), close: last.close };
                }
            } catch (e) { /* ignore */ }
        }
        return { rsi: 50.0, change: 0, close: 0 };
    };

    const nikkeiInfo = getMarketInfo('^N225');
    const sp500Info = getMarketInfo('^GSPC');
    const usdjpyInfo = getMarketInfo('USDJPY=X');
    const getTrendText = (rsi) => rsi >= 60 ? '上昇トレンド強' : rsi <= 40 ? '下落傾向・要警戒' : '揉み合い・中立';

    const marketSummary = {
        nikkei: { name: '日経平均', dailyRsi: nikkeiInfo.rsi, changePercent: nikkeiInfo.change, close: nikkeiInfo.close, trend: getTrendText(nikkeiInfo.rsi) },
        sp500: { name: 'S&P 500', dailyRsi: sp500Info.rsi, changePercent: sp500Info.change, close: sp500Info.close, trend: getTrendText(sp500Info.rsi) },
        usdjpy: { name: 'ドル円', dailyRsi: usdjpyInfo.rsi, changePercent: usdjpyInfo.change, close: usdjpyInfo.close, trend: usdjpyInfo.change > 0.3 ? '円安推移' : usdjpyInfo.change < -0.3 ? '円高推移' : '保ち合い' }
    };

    const nowJst = new Date(Date.now() + 9 * 3600 * 1000).toISOString();
    const resultOutput = {
        generatedAt: nowJst,
        tradingDay: latestTradingDay || nowJst.slice(0, 10),
        totalAlerts: alerts.length,
        alerts,
        marketSummary
    };

    fs.writeFileSync(WATCHLIST_FILE, JSON.stringify(resultOutput, null, 2), 'utf8');
    console.log(`✅ [Daily Analyzer] 出力完了: ${WATCHLIST_FILE} (アラート件数: ${alerts.length}件)`);
    return resultOutput;
}

if (require.main === module) {
    runAnalyzer();
}

module.exports = { runAnalyzer, calculateRSI, calculateKairi, calculateBollingerBands, detectMaCross };
