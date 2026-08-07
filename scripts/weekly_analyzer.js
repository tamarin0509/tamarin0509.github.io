// =====================================================
// Weekly Watchlist Analyzer (weekly_analyzer.js)
// 毎週土曜 朝 (JST) 実行想定
// 日足データ (data/candles/*.json) から週足ローソク足を合成し、
// 週足RSIブレイクアウト、25週移動平均線乖離率、日足確定シグナルを複合分析して
// weekly_watchlist.json を生成する。
// =====================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CANDLES_DIR = path.join(ROOT, 'data', 'candles');
const RESULTS_FILE = path.join(ROOT, 'screener_results.json');
const WATCHLIST_FILE = path.join(ROOT, 'weekly_watchlist.json');

// 判定閾値設定
const CONFIG = {
    rsiPeriod: 14,
    kairiPeriod: 25,
    kairiBuyThreshold: -5.0,    // 25週乖離率 <= -5.0% で逆張り買い圏
    kairiSellThreshold: +5.0,   // 25週乖離率 >= +5.0% で過熱・逆張り売り圏
    rsiOversold: 25.0,
    rsiOverbought: 75.0,
    freshWeeklyBars: 2,         // 週足シグナルは直近2週以内を検出
    freshDailyBars: 5           // 日足シグナルは直近5営業日以内
};

// 71銘柄のマスターリスト定義（screener.jsと共通）
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

// 日足 -> 週足合成 (月曜〜金曜)
function buildWeeklyCandles(dailyCandles) {
    if (!dailyCandles || dailyCandles.length === 0) return [];
    const weekly = [];
    const getMondayDateStr = (dateStr) => {
        const d = new Date(dateStr);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        return monday.toISOString().split('T')[0];
    };

    let currentWeekKey = null;
    let currentWeekCandle = null;

    for (let i = 0; i < dailyCandles.length; i++) {
        const d = dailyCandles[i];
        const weekKey = getMondayDateStr(d.time);

        if (currentWeekKey !== weekKey) {
            if (currentWeekCandle) weekly.push(currentWeekCandle);
            currentWeekKey = weekKey;
            currentWeekCandle = {
                time: weekKey,
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close,
                rawDates: [d.time]
            };
        } else {
            currentWeekCandle.high = Math.max(currentWeekCandle.high, d.high);
            currentWeekCandle.low = Math.min(currentWeekCandle.low, d.low);
            currentWeekCandle.close = d.close;
            currentWeekCandle.rawDates.push(d.time);
        }
    }
    if (currentWeekCandle) weekly.push(currentWeekCandle);
    return weekly;
}

// 乖離率計算
function calculateKairi(candles, period = 25) {
    if (!candles || candles.length < period) {
        return new Array(candles ? candles.length : 0).fill(null);
    }
    const kairi = new Array(candles.length).fill(null);
    let sum = 0;
    for (let i = 0; i < candles.length; i++) {
        sum += candles[i].close;
        if (i >= period - 1) {
            if (i >= period) {
                sum -= candles[i - period].close;
            }
            const sma = sum / period;
            kairi[i] = ((candles[i].close - sma) / sma) * 100.0;
        }
    }
    return kairi;
}

// Wilder RSI
function calculateSingleRSI(candles, period, priceField) {
    const rsi = new Array(candles.length).fill(null);
    if (!candles || candles.length <= period) return rsi;

    let avgGain = 0;
    let avgLoss = 0;
    let firstGainSum = 0;
    let firstLossSum = 0;

    for (let i = 1; i <= period; i++) {
        const change = candles[i][priceField] - candles[i - 1][priceField];
        if (change > 0) firstGainSum += change;
        else firstLossSum += Math.abs(change);
    }

    avgGain = firstGainSum / period;
    avgLoss = firstLossSum / period;
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

// 週足 Swing RSI Breakout シグナル検出
function detectWeeklyRsiBreakout(candles, rsi, swingPeriod = 5) {
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
                signals.push({
                    barIndex: i,
                    barsAgo: N - 1 - i,
                    date: candles[i].time,
                    type: 'BUY',
                    rsi: rsi[i],
                    price: candles[i].close,
                    description: '週足RSI抵抗線上抜けブレイクアウト'
                });
            }
        }

        const supLine = lineFromLastTwo(rsi, confirmedUpTo(lows, i));
        if (supLine && supLine.slope >= 0) {
            const penI = supLine.valAt(i) - rsi[i];
            const penPrev = supLine.valAt(i - 1) - rsi[i - 1];
            if (penI > 0 && penPrev <= 0) {
                signals.push({
                    barIndex: i,
                    barsAgo: N - 1 - i,
                    date: candles[i].time,
                    type: 'SELL',
                    rsi: rsi[i],
                    price: candles[i].close,
                    description: '週足RSI支持線下抜けブレイクアウト'
                });
            }
        }
    }
    return signals;
}

// アクションコメント生成
function generateActionNote(action, triggers, weeklyKairi, weeklyRsi) {
    if (action === 'BUY') {
        if (triggers.includes('T1') && triggers.includes('T3')) {
            return `25週乖離率(${weeklyKairi.toFixed(1)}%)押し目圏 ＋ 週足RSIブレイクアウト。絶好の打診買いポイント。`;
        }
        if (triggers.includes('T1')) {
            return `週足RSI抵抗線を上方ブレイク。上昇トレンド転換の初動、分割エントリー検討。`;
        }
        if (triggers.includes('T3')) {
            return `25週乖離率(${weeklyKairi.toFixed(1)}%)下限到達。売られ過ぎからの自律反発狙い。`;
        }
        if (triggers.includes('T5')) {
            return `日足確定シグナル点灯中。直近高値超えで追随買いを狙う。`;
        }
        return `週足RSI(${weeklyRsi.toFixed(1)})低下。反転の兆候をウォッチ。`;
    } else if (action === 'SELL') {
        if (triggers.includes('T2') && triggers.includes('T4')) {
            return `25週乖離率(+${weeklyKairi.toFixed(1)}%)過熱圏 ＋ 週足RSI下抜け。利確・リスク回避を最優先。`;
        }
        if (triggers.includes('T2')) {
            return `週足RSI支持線を下方ブレイク。下落トレンド入りの警戒、ストップ安値設定。`;
        }
        if (triggers.includes('T4')) {
            return `25週乖離率(+${weeklyKairi.toFixed(1)}%)上限到達。短期的過熱感、利益確定・手仕舞い推奨。`;
        }
        return `週足過熱水準。無理な追随買いは避け静観。`;
    }
    return `レンジ推移。シグナルの明確化まで待機。`;
}

// ---------- メイン実行フロー ----------

function runAnalyzer() {
    console.log('🚀 [Weekly Analyzer] 週足ウォッチリスト自動分析を開始...');

    // 1. 日足スクリーナー結果読み込み
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
    const sectorPerformanceMap = new Map(); // セクターごとの週変化率集計用

    let latestWeekDate = '';

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

        if (dailyCandles.length < 30) continue;

        // 週足合成
        const weeklyCandles = buildWeeklyCandles(dailyCandles);
        if (weeklyCandles.length < 26) continue;

        const lastW = weeklyCandles[weeklyCandles.length - 1];
        const prevW = weeklyCandles[weeklyCandles.length - 2];
        latestWeekDate = lastW.time;

        // 週変化率
        const weekChangePct = prevW ? ((lastW.close - prevW.close) / prevW.close) * 100.0 : 0;

        // セクター集計
        if (!sectorPerformanceMap.has(info.sector)) {
            sectorPerformanceMap.set(info.sector, { sum: 0, count: 0 });
        }
        const secStat = sectorPerformanceMap.get(info.sector);
        secStat.sum += weekChangePct;
        secStat.count += 1;

        // 指標算出
        const wRsi = calculateRSI(weeklyCandles, CONFIG.rsiPeriod);
        const wKairi = calculateKairi(weeklyCandles, CONFIG.kairiPeriod);

        const currentWRsi = wRsi[wRsi.length - 1];
        const currentWKairi = wKairi[wKairi.length - 1];

        if (currentWRsi == null || currentWKairi == null) continue;

        // シグナル検出
        const wSignals = detectWeeklyRsiBreakout(weeklyCandles, wRsi, 5);
        const freshWSignals = wSignals.filter(s => s.barsAgo <= CONFIG.freshWeeklyBars);

        // 日足データ・シグナル情報の照合
        const dScreener = screenerMap.get(info.symbol) || {};
        const dSignal = dScreener.latestSignal;
        const dRsi = dScreener.rsi != null ? dScreener.rsi : null;
        const dKairi = dScreener.kairi25 != null ? dScreener.kairi25 : null;

        const triggers = [];
        let action = 'NEUTRAL';

        // トリガー判定
        // T1: 週足RSI BUY Breakout
        const buyWSignal = freshWSignals.find(s => s.type === 'BUY');
        if (buyWSignal) triggers.push('T1');

        // T2: 週足RSI SELL Breakout
        const sellWSignal = freshWSignals.find(s => s.type === 'SELL');
        if (sellWSignal) triggers.push('T2');

        // T3: 25週乖離率 <= -5.0%
        if (currentWKairi <= CONFIG.kairiBuyThreshold) triggers.push('T3');

        // T4: 25週乖離率 >= +5.0%
        if (currentWKairi >= CONFIG.kairiSellThreshold) triggers.push('T4');

        // T5: 日足確定シグナル (直近5営業日以内)
        if (dSignal && dSignal.status === 'confirmed' && dSignal.barsAgo <= CONFIG.freshDailyBars) {
            triggers.push('T5');
        }

        // T6: 極端値
        if (currentWRsi <= CONFIG.rsiOversold || currentWRsi >= CONFIG.rsiOverbought) {
            triggers.push('T6');
        }

        // アクション & 優先度決定
        let priority = 'NONE';
        const isBuyCandidate = triggers.includes('T1') || triggers.includes('T3') || (triggers.includes('T5') && dSignal.type === 'BUY');
        const isSellCandidate = triggers.includes('T2') || triggers.includes('T4') || (triggers.includes('T5') && dSignal.type === 'SELL');

        if (isBuyCandidate && !isSellCandidate) {
            action = 'BUY';
            if (triggers.length >= 2 || triggers.includes('T1')) priority = 'HIGH';
            else priority = 'MEDIUM';
        } else if (isSellCandidate && !isBuyCandidate) {
            action = 'SELL';
            if (triggers.length >= 2 || triggers.includes('T2')) priority = 'HIGH';
            else priority = 'MEDIUM';
        } else if (isBuyCandidate && isSellCandidate) {
            action = 'NEUTRAL';
            priority = 'MEDIUM';
        } else if (triggers.includes('T6')) {
            action = currentWRsi <= CONFIG.rsiOversold ? 'BUY' : 'SELL';
            priority = 'LOW';
        }

        if (priority !== 'NONE') {
            const triggerDetailsParts = [];
            if (triggers.includes('T1')) triggerDetailsParts.push('週足RSIブレイク(BUY)');
            if (triggers.includes('T2')) triggerDetailsParts.push('週足RSI下抜け(SELL)');
            if (triggers.includes('T3')) triggerDetailsParts.push(`25週乖離率 ${currentWKairi.toFixed(1)}% (買圏)`);
            if (triggers.includes('T4')) triggerDetailsParts.push(`25週乖離率 +${currentWKairi.toFixed(1)}% (売圏)`);
            if (triggers.includes('T5')) triggerDetailsParts.push(`日足${dSignal.type}確定(${dSignal.barsAgo}日前)`);
            if (triggers.includes('T6')) triggerDetailsParts.push(`週足RSI極端値(${currentWRsi.toFixed(1)})`);

            const note = generateActionNote(action, triggers, currentWKairi, currentWRsi);

            alerts.push({
                symbol: info.symbol,
                name: info.name,
                sector: info.sector,
                type: info.type,
                triggers,
                triggerDetails: triggerDetailsParts.join(' ＋ '),
                weeklyRsi: parseFloat(currentWRsi.toFixed(2)),
                weeklyKairi25: parseFloat(currentWKairi.toFixed(2)),
                dailyRsi: dRsi != null ? parseFloat(dRsi.toFixed(2)) : null,
                dailyKairi25: dKairi != null ? parseFloat(dKairi.toFixed(2)) : null,
                close: lastW.close,
                weekChange: parseFloat(weekChangePct.toFixed(2)),
                action,
                priority,
                note
            });
        }
    }

    // ソート: HIGH > MEDIUM > LOW, 同ランク内はトリガー数順
    alerts.sort((a, b) => {
        const pOrder = { HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };
        if (pOrder[b.priority] !== pOrder[a.priority]) {
            return pOrder[b.priority] - pOrder[a.priority];
        }
        return b.triggers.length - a.triggers.length;
    });

    // 市場サマリー
    const getMarketInfo = (sym) => {
        const item = alerts.find(a => a.symbol === sym);
        if (item) return { weeklyRsi: item.weeklyRsi, change: item.weekChange, close: item.close };
        // alerts に入っていない場合はローソク足から直接取得
        const filePath = path.join(CANDLES_DIR, sanitizeSymbolForFile(sym) + '.json');
        if (fs.existsSync(filePath)) {
            try {
                const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const w = buildWeeklyCandles(parsed.candles || []);
                if (w.length >= 15) {
                    const rsi = calculateRSI(w, 14);
                    const lastW = w[w.length - 1];
                    const prevW = w[w.length - 2];
                    const change = prevW ? ((lastW.close - prevW.close) / prevW.close) * 100 : 0;
                    return { weeklyRsi: parseFloat((rsi[rsi.length - 1] || 50).toFixed(1)), change: parseFloat(change.toFixed(2)), close: lastW.close };
                }
            } catch (e) {}
        }
        return { weeklyRsi: 50.0, change: 0, close: 0 };
    };

    const nikkeiInfo = getMarketInfo('^N225');
    const sp500Info = getMarketInfo('^GSPC');
    const usdjpyInfo = getMarketInfo('USDJPY=X');

    const getTrendText = (rsi, change) => {
        if (rsi >= 60) return '上昇トレンド強';
        if (rsi <= 40) return '下落傾向・要警戒';
        return '揉み合い・中立';
    };

    const marketSummary = {
        nikkei: { name: '日経平均', weeklyRsi: nikkeiInfo.weeklyRsi, weekChange: nikkeiInfo.change, close: nikkeiInfo.close, trend: getTrendText(nikkeiInfo.weeklyRsi, nikkeiInfo.change) },
        sp500: { name: 'S&P 500', weeklyRsi: sp500Info.weeklyRsi, weekChange: sp500Info.change, close: sp500Info.close, trend: getTrendText(sp500Info.weeklyRsi, sp500Info.change) },
        usdjpy: { name: 'ドル円', weeklyRsi: usdjpyInfo.weeklyRsi, weekChange: usdjpyInfo.change, close: usdjpyInfo.close, trend: usdjpyInfo.change > 0.5 ? '円安推移' : usdjpyInfo.change < -0.5 ? '円高推移' : '保ち合い' }
    };

    // セクターヒートマップ
    const sectorHeatmap = {};
    for (const [sec, stat] of sectorPerformanceMap.entries()) {
        if (sec === '指数' || sec === '為替') continue;
        const avgPct = stat.count > 0 ? stat.sum / stat.count : 0;
        const sign = avgPct > 0 ? '+' : '';
        sectorHeatmap[sec] = `${sign}${avgPct.toFixed(2)}%`;
    }

    const nowJst = new Date(Date.now() + 9 * 3600 * 1000).toISOString();

    const resultOutput = {
        generatedAt: nowJst,
        weekEnding: latestWeekDate || nowJst.slice(0, 10),
        totalAlerts: alerts.length,
        alerts,
        marketSummary,
        sectorHeatmap
    };

    fs.writeFileSync(WATCHLIST_FILE, JSON.stringify(resultOutput, null, 2), 'utf8');
    console.log(`✅ [Weekly Analyzer] 出力完了: ${WATCHLIST_FILE} (アラート件数: ${alerts.length}件)`);

    return resultOutput;
}

if (require.main === module) {
    runAnalyzer();
}

module.exports = { runAnalyzer, buildWeeklyCandles, calculateRSI, calculateKairi };
