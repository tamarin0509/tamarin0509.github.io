const fs = require('fs');
const path = require('path');

// Disable SSL certificate verification for environments with strict proxies
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const WATCH_SYMBOLS = [
    // 主要指数
    { symbol: '^N225', name: '日経平均株価 (Nikkei 225)', type: 'index', sector: '指数' },
    { symbol: '^GSPC', name: 'S&P 500 Index', type: 'index', sector: '指数' },
    { symbol: '^DJI', name: 'NYダウ (Dow Jones)', type: 'index', sector: '指数' },
    { symbol: '^IXIC', name: 'ナスダック総合 (NASDAQ)', type: 'index', sector: '指数' },
    // 主要為替
    { symbol: 'USDJPY=X', name: '米ドル / 円 (USD/JPY)', type: 'forex', sector: '為替' },
    { symbol: 'EURUSD=X', name: 'ユーロ / 米ドル (EUR/USD)', type: 'forex', sector: '為替' },
    { symbol: 'GBPJPY=X', name: '英ポンド / 円 (GBP/JPY)', type: 'forex', sector: '為替' },
    { symbol: 'AUDUSD=X', name: '豪ドル / 米ドル (AUD/USD)', type: 'forex', sector: '為替' },
    // テクノロジー
    { symbol: 'MSFT', name: 'マイクロソフト (MSFT)', type: 'stock', sector: 'テクノロジー' },
    { symbol: 'AAPL', name: 'アップル (AAPL)', type: 'stock', sector: 'テクノロジー' },
    { symbol: 'GOOGL', name: 'アルファベット (GOOGL)', type: 'stock', sector: 'テクノロジー' },
    { symbol: 'AMZN', name: 'アマゾン (AMZN)', type: 'stock', sector: 'テクノロジー' },
    { symbol: 'META', name: 'メタ・プラットフォームズ (META)', type: 'stock', sector: 'テクノロジー' },
    { symbol: '9984.T', name: 'ソフトバンクグループ (9984)', type: 'stock', sector: 'テクノロジー' },
    { symbol: '6758.T', name: 'ソニーグループ (6758)', type: 'stock', sector: 'テクノロジー' },
    // 半導体
    { symbol: 'NVDA', name: 'エヌビディア (NVDA)', type: 'stock', sector: '半導体' },
    { symbol: 'AMD', name: 'アドバンスト・マイクロ・デバイセズ (AMD)', type: 'stock', sector: '半導体' },
    { symbol: 'AVGO', name: 'ブロードコム (AVGO)', type: 'stock', sector: '半導体' },
    { symbol: '8035.T', name: '東京エレクトロン (8035)', type: 'stock', sector: '半導体' },
    { symbol: '6857.T', name: 'アドバンテスト (6857)', type: 'stock', sector: '半導体' },
    { symbol: '6146.T', name: 'ディスコ (6146)', type: 'stock', sector: '半導体' },
    { symbol: '285A.T', name: 'キオクシアホールディングス (285A)', type: 'stock', sector: '半導体' },
    // エネルギー
    { symbol: '1605.T', name: 'INPEX (1605)', type: 'stock', sector: 'エネルギー' },
    { symbol: '5020.T', name: 'ENEOSホールディングス (5020)', type: 'stock', sector: 'エネルギー' },
    { symbol: '5019.T', name: '出光興産 (5019)', type: 'stock', sector: 'エネルギー' },
    { symbol: 'XOM', name: 'エクソンモービル (XOM)', type: 'stock', sector: 'エネルギー' },
    { symbol: 'CVX', name: 'シェブロン (CVX)', type: 'stock', sector: 'エネルギー' },
    // 防衛・重工
    { symbol: '7011.T', name: '三菱重工業 (7011)', type: 'stock', sector: '防衛・重工' },
    { symbol: '7012.T', name: '川崎重工業 (7012)', type: 'stock', sector: '防衛・重工' },
    { symbol: '7013.T', name: 'IHI (7013)', type: 'stock', sector: '防衛・重工' },
    { symbol: 'LMT', name: 'ロッキード・マーティン (LMT)', type: 'stock', sector: '防衛・重工' },
    { symbol: 'RTX', name: 'RTX (旧レイセオン)', type: 'stock', sector: '防衛・重工' },
    // 金融
    { symbol: '8306.T', name: '三菱UFJフィナンシャルG (8306)', type: 'stock', sector: '金融' },
    { symbol: '8316.T', name: '三井住友フィナンシャルG (8316)', type: 'stock', sector: '金融' },
    { symbol: '8411.T', name: 'みずほフィナンシャルG (8411)', type: 'stock', sector: '金融' },
    { symbol: 'JPM', name: 'JPモルガン・チェース (JPM)', type: 'stock', sector: '金融' },
    { symbol: 'GS', name: 'ゴールドマン・サックス (GS)', type: 'stock', sector: '金融' },
    { symbol: '8729.T', name: 'ソニーフィナンシャルグループ (8729)', type: 'stock', sector: '金融' },
    // 自動車
    { symbol: '7203.T', name: 'トヨタ自動車 (7203)', type: 'stock', sector: '自動車' },
    { symbol: '7267.T', name: 'ホンダ (7267)', type: 'stock', sector: '自動車' },
    { symbol: '7269.T', name: 'スズキ (7269)', type: 'stock', sector: '自動車' },
    { symbol: '7201.T', name: '日産自動車 (7201)', type: 'stock', sector: '自動車' },
    { symbol: 'TSLA', name: 'テスラ (TSLA)', type: 'stock', sector: '自動車' },
    // 素材・非鉄
    { symbol: '5401.T', name: '日本製鉄 (5401)', type: 'stock', sector: '素材・非鉄' },
    { symbol: '5803.T', name: 'フジクラ (5803)', type: 'stock', sector: '素材・非鉄' },
    { symbol: '5016.T', name: 'JX金属 (5016)', type: 'stock', sector: '素材・非鉄' },
    // 商社
    { symbol: '8001.T', name: '伊藤忠商事 (8001)', type: 'stock', sector: '商社' },
    { symbol: '8031.T', name: '三井物産 (8031)', type: 'stock', sector: '商社' },
    { symbol: '8058.T', name: '三菱商事 (8058)', type: 'stock', sector: '商社' },
    { symbol: '8053.T', name: '住友商事 (8053)', type: 'stock', sector: '商社' },
    { symbol: '8002.T', name: '丸紅 (8002)', type: 'stock', sector: '商社' },
    // 医薬品
    { symbol: '4502.T', name: '武田薬品工業 (4502)', type: 'stock', sector: '医薬品' },
    { symbol: '4568.T', name: '第一三共 (4568)', type: 'stock', sector: '医薬品' },
    { symbol: 'JNJ', name: 'ジョンソン・エンド・ジョンソン (JNJ)', type: 'stock', sector: '医薬品' },
    { symbol: 'LLY', name: 'イーライリリー (LLY)', type: 'stock', sector: '医薬品' },
    // 通信
    { symbol: '9432.T', name: 'NTT (9432)', type: 'stock', sector: '通信' },
    { symbol: '9433.T', name: 'KDDI (9433)', type: 'stock', sector: '通信' },
    { symbol: '9434.T', name: 'ソフトバンク (9434)', type: 'stock', sector: '通信' },
    { symbol: 'VZ', name: 'ベライゾン (VZ)', type: 'stock', sector: '通信' },
    // 消費・小売
    { symbol: '9983.T', name: 'ファーストリテイリング (9983)', type: 'stock', sector: '消費・小売' },
    { symbol: '7974.T', name: '任天堂 (7974)', type: 'stock', sector: '消費・小売' },
    { symbol: 'WMT', name: 'ウォルマート (WMT)', type: 'stock', sector: '消費・小売' },
    { symbol: 'COST', name: 'コストコ (COST)', type: 'stock', sector: '消費・小売' },
    // 電子部品
    { symbol: '6981.T', name: '村田製作所 (6981)', type: 'stock', sector: '電子部品' },
    // 不動産
    { symbol: '3003.T', name: 'ヒューリック (3003)', type: 'stock', sector: '不動産' },
    // 暗号資産
    { symbol: 'BTC-USD', name: 'ビットコイン (BTC/USD)', type: 'crypto', sector: '暗号資産' },
    { symbol: 'ETH-USD', name: 'イーサリアム (ETH/USD)', type: 'crypto', sector: '暗号資産' },
    { symbol: '3350.T', name: 'メタプラネット (3350)', type: 'stock', sector: '暗号資産' }
];

// Wilder's RSI calculation
function calculateSingleRSI(candles, period, priceField) {
    const rsi = new Array(candles.length).fill(null);
    let avgGain = 0;
    let avgLoss = 0;
    let firstGainSum = 0;
    let firstLossSum = 0;
    
    for (let i = 1; i <= period; i++) {
        const change = candles[i][priceField] - candles[i-1][priceField];
        if (change > 0) firstGainSum += change;
        else firstLossSum += Math.abs(change);
    }
    
    avgGain = firstGainSum / period;
    avgLoss = firstLossSum / period;
    rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));

    for (let i = period + 1; i < candles.length; i++) {
        const change = candles[i][priceField] - candles[i-1][priceField];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? Math.abs(change) : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
    }
    return rsi;
}

function calculateRSI(candles, period) {
    if (candles.length <= period) return new Array(candles.length).fill(null);
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

// Moving Average
function calculateMA(data, period, method) {
    const ma = new Array(data.length).fill(null);
    const firstValidIndex = data.findIndex(val => val !== null);
    if (firstValidIndex === -1 || firstValidIndex + period > data.length) return ma;

    if (method === 'SMA') {
        let sum = 0;
        let count = 0;
        for (let i = firstValidIndex; i < data.length; i++) {
            if (data[i] == null) continue;
            sum += data[i];
            count++;
            if (count > period) {
                sum -= data[i - period];
                ma[i] = sum / period;
            } else if (count === period) {
                ma[i] = sum / period;
            }
        }
    } else if (method === 'EMA') {
        const k = 2 / (period + 1);
        let ema = null;
        let sum = 0;
        let count = 0;
        for (let i = firstValidIndex; i < data.length; i++) {
            if (data[i] == null) continue;
            if (ema == null) {
                sum += data[i];
                count++;
                if (count === period) {
                    ema = sum / period;
                    ma[i] = ema;
                }
            } else {
                ema = data[i] * k + ema * (1 - k);
                ma[i] = ema;
            }
        }
    }
    return ma;
}

function arrayMaximum(arr, count, start) {
    let maxVal = -Infinity;
    let maxIdx = start;
    const end = Math.min(arr.length, start + count);
    for (let i = start; i < end; i++) {
        if (arr[i] > maxVal) {
            maxVal = arr[i];
            maxIdx = i;
        }
    }
    return maxIdx;
}

function arrayMinimum(arr, count, start) {
    let minVal = Infinity;
    let minIdx = start;
    const end = Math.min(arr.length, start + count);
    for (let i = start; i < end; i++) {
        if (arr[i] < minVal) {
            minVal = arr[i];
            minIdx = i;
        }
    }
    return minIdx;
}

// Weekly synthesis
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

function getPrecedingWeeklyRsi(dailyTimeStr, weeklyCandles, weeklyRsi) {
    const getMondayTime = (dateStr) => {
        const d = new Date(dateStr);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        return monday.getTime();
    };
    const dailyMondayTime = getMondayTime(dailyTimeStr);
    
    let bestRsi = null;
    for (let w = 0; w < weeklyCandles.length; w++) {
        const wCandle = weeklyCandles[w];
        const wMondayTime = new Date(wCandle.time).getTime();
        if (wMondayTime < dailyMondayTime) {
            if (weeklyRsi[w] !== null && weeklyRsi[w] !== undefined) {
                bestRsi = weeklyRsi[w];
            }
        } else {
            break;
        }
    }
    return bestRsi;
}

// Calculate Breakout
function calculateRsiBreakout(candles, rsi, rsiMa, params) {
    const N = candles.length;
    const peakMethod = params.peakMethod || 'kairi';

    let weeklyCandles = [];
    let weeklyRsi = [];
    if (params.mtfFilter === 'weekly') {
        weeklyCandles = buildWeeklyCandles(candles);
        weeklyRsi = calculateRSI(weeklyCandles, params.rsiPeriod);
    }

    if (peakMethod === 'swing') {
        const left = Math.floor(params.swingPeriod || 10);
        const right = Math.floor(params.swingPeriod || 10);
        const requireDirection = true;

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

        const lookback = right;
        const signals = [];
        for (let i = 1; i < N; i++) {
            if (rsi[i] == null || rsi[i - 1] == null) continue;

            const resLine = lineFromLastTwo(rsi, confirmedUpTo(highs, i));
            if (resLine && (!requireDirection || resLine.slope <= 0)) {
                const penI = rsi[i] - resLine.valAt(i);
                const penPrev = rsi[i - 1] - resLine.valAt(i - 1);
                let cameFromBelow = false;
                for (let k = Math.max(1, i - lookback); k <= i; k++) {
                    if (rsi[k] != null && rsi[k] - resLine.valAt(k) <= 0) { cameFromBelow = true; break; }
                }
                if (cameFromBelow && penI > params.margin && penPrev <= params.margin) {
                    let passedFilter = true;
                    if (params.mtfFilter === 'weekly') {
                        const wRsi = getPrecedingWeeklyRsi(candles[i].time, weeklyCandles, weeklyRsi);
                        if (wRsi !== null && wRsi < 50) passedFilter = false;
                    }
                    if (passedFilter) {
                        signals.push({
                            time: candles[i].time,
                            index: i,
                            type: 'BUY',
                            price: candles[i].close,
                            rsi: rsi[i],
                            lineValue: parseFloat(resLine.valAt(i).toFixed(2)),
                            description: 'RSIスイング抵抗線ブレイク'
                        });
                    }
                }
            }

            const supLine = lineFromLastTwo(rsi, confirmedUpTo(lows, i));
            if (supLine && (!requireDirection || supLine.slope >= 0)) {
                const penI = supLine.valAt(i) - rsi[i];
                const penPrev = supLine.valAt(i - 1) - rsi[i - 1];
                let cameFromAbove = false;
                for (let k = Math.max(1, i - lookback); k <= i; k++) {
                    if (rsi[k] != null && supLine.valAt(k) - rsi[k] <= 0) { cameFromAbove = true; break; }
                }
                if (cameFromAbove && penI > params.margin && penPrev <= params.margin) {
                    let passedFilter = true;
                    if (params.mtfFilter === 'weekly') {
                        const wRsi = getPrecedingWeeklyRsi(candles[i].time, weeklyCandles, weeklyRsi);
                        if (wRsi !== null && wRsi >= 50) passedFilter = false;
                    }
                    if (passedFilter) {
                        signals.push({
                            time: candles[i].time,
                            index: i,
                            type: 'SELL',
                            price: candles[i].close,
                            rsi: rsi[i],
                            lineValue: parseFloat(supLine.valAt(i).toFixed(2)),
                            description: 'RSIスイング支持線ブレイク'
                        });
                    }
                }
            }
        }

        const pivotLines = (pivots) => {
            const lines = [];
            for (let m = pivots.length - 1; m >= 1 && lines.length < params.nLines; m--) {
                const a = pivots[m - 1], b = pivots[m];
                const va = rsi[a], vb = rsi[b];
                if (va == null || vb == null) continue;
                lines.push({ tStart: a, tEnd: b, slope: (vb - va) / (b - a), rsiStart: va, rsiEnd: vb });
            }
            return lines;
        };
        const peakLines = pivotLines(highs);
        const troughLines = pivotLines(lows);
        const peaks = highs.map(idx => ({ index: idx, rsi: rsi[idx], time: candles[idx].time, price: candles[idx].close }));
        const troughs = lows.map(idx => ({ index: idx, rsi: rsi[idx], time: candles[idx].time, price: candles[idx].close }));

        return { peaks, troughs, peakLines, troughLines, signals };
    }

    // Kairi zero-cross peak method (MT4 style)
    const rsi_mt4 = new Array(N).fill(0);
    const kairi_mt4 = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
        const jsIdx = N - 1 - i;
        rsi_mt4[i] = rsi[jsIdx] !== null ? rsi[jsIdx] : 0;
        const maVal = rsiMa[jsIdx];
        kairi_mt4[i] = (maVal && maVal !== 0 && rsi[jsIdx] !== null) ? (rsi[jsIdx] - maVal) / maVal : 0;
    }

    let j = 0;
    const ii = [];
    for (let i = 1; i < N - 1; i++) {
        if (j >= params.nLines * 2 + 10) break;
        if (kairi_mt4[i] * kairi_mt4[i+1] <= 0) {
            ii[j] = i;
            j++;
            if (j > 2 && ii[j-1] - ii[j-3] < params.minGap) {
                j = j - 2;
            }
        }
    }

    const Hi_stack = [];
    const Lo_stack = [];
    const maxLL = Math.min(params.nLines + 6, Math.floor((j - 2) / 2));

    if (j > 2) {
        if (kairi_mt4[ii[0]] < 0) {
            for (let ll = 0; ll < maxLL; ll++) {
                Hi_stack[ll] = arrayMaximum(rsi_mt4, ii[1+ll*2] - ii[0+ll*2] + 1, ii[0+ll*2] + 1);
                Lo_stack[ll] = arrayMinimum(rsi_mt4, ii[2+ll*2] - ii[1+ll*2] + 1, ii[1+ll*2] + 1);
            }
        } else {
            for (let ll = 0; ll < maxLL; ll++) {
                Hi_stack[ll] = arrayMaximum(rsi_mt4, ii[2+ll*2] - ii[1+ll*2], ii[1+ll*2] + 1);
                Lo_stack[ll] = arrayMinimum(rsi_mt4, ii[1+ll*2] - ii[0+ll*2], ii[0+ll*2] + 1);
            }
        }
    }

    const buf3_mt4 = new Array(N).fill(null);
    const buf4_mt4 = new Array(N).fill(null);
    const peakLines = [];
    const troughLines = [];
    const linesToGenerate = Math.min(params.nLines, maxLL - 1);
    
    for (let ll = 0; ll < linesToGenerate; ll++) {
        const hp1 = rsi_mt4[Hi_stack[ll]];
        const hp2 = rsi_mt4[Hi_stack[ll+1]];
        const hp1n = Hi_stack[ll];
        const hp2n = Hi_stack[ll+1];
        const hp3n = ll > 0 ? Hi_stack[ll-1] : 0;
        let rh = hp2n !== hp1n ? (hp2 - hp1) / (hp2n - hp1n) : 0;

        const lp1 = rsi_mt4[Lo_stack[ll]];
        const lp2 = rsi_mt4[Lo_stack[ll+1]];
        const lp1n = Lo_stack[ll];
        const lp2n = Lo_stack[ll+1];
        const lp3n = ll > 0 ? Lo_stack[ll-1] : 0;
        let rl = lp1n !== lp2n ? (lp1 - lp2) / (lp2n - lp1n) : 0;

        for (let k = 1; k <= hp1n - hp3n; k++) buf3_mt4[hp1n - k] = hp1 - rh * k;
        for (let k = 1; k <= lp1n - lp3n; k++) buf4_mt4[lp1n - k] = lp1 + rl * k;

        if (hp1n !== undefined && hp2n !== undefined) {
            const tStart = N - 1 - hp2n;
            const tEnd = N - 1 - hp1n;
            const rsiStart = rsi_mt4[hp2n];
            const rsiEnd = rsi_mt4[hp1n];
            peakLines.push({ tStart, tEnd, slope: (rsiEnd - rsiStart) / (tEnd - tStart), rsiStart, rsiEnd });
        }
        if (lp1n !== undefined && lp2n !== undefined) {
            const tStart = N - 1 - lp2n;
            const tEnd = N - 1 - lp1n;
            const rsiStart = rsi_mt4[lp2n];
            const rsiEnd = rsi_mt4[lp1n];
            troughLines.push({ tStart, tEnd, slope: (rsiEnd - rsiStart) / (tEnd - tStart), rsiStart, rsiEnd });
        }
    }

    const buf5_mt4 = new Array(N).fill(null);
    const buf6_mt4 = new Array(N).fill(null);

    for (let i = 0; i < N - 1; i++) {
        if (buf3_mt4[i] == null || buf3_mt4[i+1] == null) continue;
        if (rsi_mt4[i] == null || rsi_mt4[i+1] == null) continue;
        if (rsi_mt4[i+1] <= buf3_mt4[i+1] + params.margin && rsi_mt4[i] > buf3_mt4[i] + params.margin) {
            buf5_mt4[i] = rsi_mt4[i];
        }
    }
    for (let i = 0; i < N - 1; i++) {
        if (buf4_mt4[i] == null || buf4_mt4[i+1] == null) continue;
        if (rsi_mt4[i] == null || rsi_mt4[i+1] == null) continue;
        if (rsi_mt4[i+1] >= buf4_mt4[i+1] - params.margin && rsi_mt4[i] < buf4_mt4[i] - params.margin) {
            buf6_mt4[i] = rsi_mt4[i];
        }
    }

    const signals = [];
    for (let i = N - 1; i >= 0; i--) {
        const jsIdx = N - 1 - i;
        if (buf5_mt4[i] !== null) {
            let passedFilter = true;
            if (params.mtfFilter === 'weekly') {
                const wRsi = getPrecedingWeeklyRsi(candles[jsIdx].time, weeklyCandles, weeklyRsi);
                if (wRsi !== null && wRsi < 50) passedFilter = false;
            }
            if (passedFilter) {
                signals.push({
                    time: candles[jsIdx].time,
                    index: jsIdx,
                    type: 'BUY',
                    price: candles[jsIdx].close,
                    rsi: rsi[jsIdx],
                    lineValue: parseFloat(buf3_mt4[i].toFixed(2)),
                    description: `RSI抵抗線ブレイク (MQL4条件)`
                });
            }
        }
        if (buf6_mt4[i] !== null) {
            let passedFilter = true;
            if (params.mtfFilter === 'weekly') {
                const wRsi = getPrecedingWeeklyRsi(candles[jsIdx].time, weeklyCandles, weeklyRsi);
                if (wRsi !== null && wRsi >= 50) passedFilter = false;
            }
            if (passedFilter) {
                signals.push({
                    time: candles[jsIdx].time,
                    index: jsIdx,
                    type: 'SELL',
                    price: candles[jsIdx].close,
                    rsi: rsi[jsIdx],
                    lineValue: parseFloat(buf4_mt4[i].toFixed(2)),
                    description: `RSI支持線ブレイク (MQL4条件)`
                });
            }
        }
    }

    const peaks = Hi_stack.map(idx => ({ index: N - 1 - idx, rsi: rsi_mt4[idx], time: candles[N - 1 - idx].time, price: candles[N - 1 - idx].close })).reverse();
    const troughs = Lo_stack.map(idx => ({ index: N - 1 - idx, rsi: rsi_mt4[idx], time: candles[N - 1 - idx].time, price: candles[N - 1 - idx].close })).reverse();

    return { peaks, troughs, peakLines, troughLines, signals };
}

// Replay to match verified signals
function calculateWalkForwardReplay(candles, params) {
    const replaySignals = [];
    const N = candles.length;
    const startIdx = Math.max(50, params.rsiPeriod + params.maPeriod + 10);
    
    for (let t = startIdx; t < N; t++) {
        const slice = candles.slice(0, t + 1);
        const rsi = calculateRSI(slice, params.rsiPeriod);
        const rsiMa = calculateMA(rsi, params.maPeriod, params.maMethod);
        const res = calculateRsiBreakout(slice, rsi, rsiMa, params);
        
        const lastSignal = res.signals.find(sig => sig.index === t);
        if (lastSignal) {
            replaySignals.push({
                time: lastSignal.time,
                index: t,
                type: lastSignal.type,
                price: lastSignal.price,
                rsi: lastSignal.rsi,
                lineValue: lastSignal.lineValue,
                description: lastSignal.description
            });
        }
    }
    return replaySignals;
}

// Compare Batch and Replay
function compareSignals(batchSignals, replaySignals) {
    const replayMap = new Map();
    replaySignals.forEach(s => replayMap.set(s.index + '_' + s.type, s));
    const batchMap = new Map();
    batchSignals.forEach(s => batchMap.set(s.index + '_' + s.type, s));

    const confirmed = [];
    const phantom = [];
    const replayOnly = [];

    batchSignals.forEach(bs => {
        const key = bs.index + '_' + bs.type;
        if (replayMap.has(key)) confirmed.push(bs);
        else phantom.push(bs);
    });
    replaySignals.forEach(rs => {
        const key = rs.index + '_' + rs.type;
        if (!batchMap.has(key)) replayOnly.push(rs);
    });

    return { confirmed, phantom, replayOnly };
}

// Backtest evaluator (Fast version with slicing and expectancy score)
function evaluateParameters(candles, rsi, rsiMa, testParams, startIdx, endIdx) {
    // Slice arrays to simulate optimization at a specific point in time (prevent future leak)
    const slicedCandles = candles.slice(0, endIdx + 1);
    const slicedRsi = rsi.slice(0, endIdx + 1);
    const slicedRsiMa = rsiMa.slice(0, endIdx + 1);

    const analysis = calculateRsiBreakout(slicedCandles, slicedRsi, slicedRsiMa, testParams);
    
    // Filter signals within the evaluation window [startIdx, endIdx]
    const signals = analysis.signals.filter(sig => sig.index >= startIdx && sig.index <= endIdx);
    if (signals.length === 0) return -99999;
    
    const holdPeriod = 15;
    const N = slicedCandles.length;
    let totalReturn = 0;
    let wins = 0;
    let losses = 0;
    let totalGain = 0;
    let totalLoss = 0;
    
    for (const sig of signals) {
        const entryIdx = sig.index;
        if (entryIdx >= N - 1) continue;
        
        const exitIdx = Math.min(N - 1, entryIdx + holdPeriod);
        const entryPrice = slicedCandles[entryIdx].close;
        const exitPrice = slicedCandles[exitIdx].close;
        if (entryPrice === 0) continue;
        
        let tradeReturn = 0;
        if (sig.type === 'BUY') {
            tradeReturn = (exitPrice - entryPrice) / entryPrice;
        } else if (sig.type === 'SELL') {
            tradeReturn = (entryPrice - exitPrice) / entryPrice;
        }
        
        totalReturn += tradeReturn;
        if (tradeReturn > 0) {
            wins++;
            totalGain += tradeReturn;
        } else {
            losses++;
            totalLoss += Math.abs(tradeReturn);
        }
    }
    
    const totalTrades = wins + losses;
    if (totalTrades === 0) return -99999;
    
    const winRate = wins / totalTrades;
    const avgGain = wins > 0 ? totalGain / wins : 0;
    const avgLoss = losses > 0 ? totalLoss / losses : 0;
    
    // Expectancy
    const expectancy = (winRate * avgGain) - ((1 - winRate) * avgLoss);
    
    // Trade count penalty (optimal range: 5 to 25 trades in evaluation window)
    let penalty = 1.0;
    if (totalTrades < 3) {
        penalty = 0.1;
    } else if (totalTrades < 5) {
        penalty = 0.5;
    } else if (totalTrades > 25) {
        penalty = 0.3;
    } else if (totalTrades > 20) {
        penalty = 0.7;
    }
    
    let score = expectancy * penalty;
    if (expectancy < 0) {
        score = expectancy * (2.0 - penalty);
    }
    
    return score;
}

// Symbol to safe filename (must match sanitizeSymbolForFile in rsi_breakout.js)
function sanitizeSymbolForFile(symbol) {
    return symbol.replace(/[^A-Za-z0-9._-]/g, '_');
}

// Fetch helper with User-Agent to satisfy Yahoo Finance
async function fetchHistoricalData(symbol, period = '2y') {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${period}&interval=1d`;
    console.log(`Fetching ${symbol} data...`);
    
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP error ${res.status} for ${symbol}`);
    
    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) throw new Error(`No chart data in response for ${symbol}`);
    
    return result;
}

// Main screener runner
async function runScreener() {
    const results = [];
    const timestamp = new Date().toISOString();

    // フロントエンドがプロキシ無しでチャートを描画できるよう、銘柄ごとのローソク足データを書き出す
    const candlesDir = path.join(__dirname, '..', 'data', 'candles');
    fs.mkdirSync(candlesDir, { recursive: true });

    for (const item of WATCH_SYMBOLS) {
        try {
            const rawResult = await fetchHistoricalData(item.symbol);
            const timestamps = rawResult.timestamp;
            const quotes = rawResult.indicators.quote[0];
            const closes = quotes.close;
            const opens = quotes.open;
            const highs = quotes.high;
            const lows = quotes.low;
            
            const candles = [];
            for (let i = 0; i < timestamps.length; i++) {
                if (timestamps[i] == null || closes[i] == null || opens[i] == null || highs[i] == null || lows[i] == null) {
                    continue;
                }
                const date = new Date(timestamps[i] * 1000);
                const dateStr = date.toISOString().split('T')[0];
                candles.push({
                    time: dateStr,
                    open: parseFloat(opens[i].toFixed(4)),
                    high: parseFloat(highs[i].toFixed(4)),
                    low: parseFloat(lows[i].toFixed(4)),
                    close: parseFloat(closes[i].toFixed(4))
                });
            }
            
            if (candles.length < 50) {
                console.warn(`Skipping ${item.symbol}: insufficient data length (${candles.length})`);
                continue;
            }

            // ローソク足データをフロントエンド用に保存
            const candleFile = path.join(candlesDir, `${sanitizeSymbolForFile(item.symbol)}.json`);
            fs.writeFileSync(candleFile, JSON.stringify({
                symbol: item.symbol,
                name: item.name,
                updatedAt: timestamp,
                candles: candles
            }));
            
            // Grid search optimizer (kairi method only as requested by user)
            const rsiPeriods = [7, 9, 11, 14, 18, 21, 25];
            const maPeriods = [20, 30, 45, 60, 75, 90];
            const margins = [0.2, 0.5, 0.8, 1.0, 1.3, 1.6, 2.0];
            const offsets = [-3, -1.5, 0, 1.5, 3];
            const peakMethods = ['kairi']; // Enforce kairi peak method (kairi交差ゼロ) only
            
            const N = candles.length;
            const isEnd = Math.floor(N * 0.75); // IS ends at 75% of data (approx 1.5 years)
            
            const candidates = [];
            
            // 1. Grid search on In-Sample data (0 to isEnd) with Cache Optimization
            for (const rsiP of rsiPeriods) {
                const rsi = calculateRSI(candles, rsiP);
                for (const maP of maPeriods) {
                    const rsiMa = calculateMA(rsi, maP, 'EMA');
                    for (const method of peakMethods) {
                        for (const marg of margins) {
                            for (const offs of offsets) {
                                const testParams = {
                                    rsiPeriod: rsiP,
                                    maPeriod: maP,
                                    maMethod: 'EMA',
                                    offset: offs,
                                    margin: marg,
                                    nLines: 3,
                                    peakMethod: method,
                                    swingPeriod: 10,
                                    minGap: 2,
                                    mtfFilter: 'none' // evaluate base signal
                                };
                                
                                const isScore = evaluateParameters(candles, rsi, rsiMa, testParams, 0, isEnd);
                                if (isScore > -90000) {
                                    candidates.push({ params: testParams, isScore });
                                }
                            }
                        }
                    }
                }
            }
            
            // Sort by In-Sample score and take top 5 candidates
            candidates.sort((a, b) => b.isScore - a.isScore);
            const topCandidates = candidates.slice(0, 5);
            
            // 2. Evaluate top candidates on Out-of-Sample data (isEnd + 1 to N - 1)
            let bestParams = null;
            let bestOsScore = -Infinity;
            
            for (const cand of topCandidates) {
                const rsi = calculateRSI(candles, cand.params.rsiPeriod);
                const rsiMa = calculateMA(rsi, cand.params.maPeriod, cand.params.maMethod);
                const osScore = evaluateParameters(candles, rsi, rsiMa, cand.params, isEnd + 1, N - 1);
                
                if (osScore > bestOsScore) {
                    bestOsScore = osScore;
                    bestParams = cand.params;
                }
            }
            
            // Fallback: If Out-of-Sample evaluation yielded no active trades or poor scores for all candidates,
            // default to the best In-Sample performer.
            if (!bestParams || bestOsScore <= -90000) {
                bestParams = topCandidates[0]?.params || null;
            }
            
            // Apply best params to find latest signal with MTF (weekly filter enabled for actual screening)
            const optParams = {
                ...bestParams,
                mtfFilter: 'weekly' // Enforce weekly MTF filter for high probability screening!
            };
            
            const rsi = calculateRSI(candles, optParams.rsiPeriod);
            const rsiMa = calculateMA(rsi, optParams.maPeriod, optParams.maMethod);
            const analysis = calculateRsiBreakout(candles, rsi, rsiMa, optParams);
            const replaySignals = calculateWalkForwardReplay(candles, optParams);
            const compared = compareSignals(analysis.signals, replaySignals);
            
            // Build chronological list of verified signals
            const allSignals = [];
            compared.confirmed.forEach(s => allSignals.push({ ...s, status: 'confirmed' }));
            compared.phantom.forEach(s => allSignals.push({ ...s, status: 'phantom' }));
            compared.replayOnly.forEach(s => allSignals.push({ ...s, status: 'replayOnly' }));
            allSignals.sort((a, b) => new Date(a.time) - new Date(b.time));
            
            // Find the active/latest signal
            // An active signal is defined as a confirmed [確] or replay-only [実] signal that occurred in the last 15 bars
            let latestSig = null;
            if (allSignals.length > 0) {
                const last = allSignals[allSignals.length - 1];
                const lastIdx = candles.findIndex(c => c.time === last.time);
                const barsAgo = candles.length - 1 - lastIdx;
                
                // We show signals from last 15 days as "recent"
                if (barsAgo <= 15) {
                    latestSig = {
                        time: last.time,
                        type: last.type,
                        price: last.price,
                        rsi: last.rsi,
                        status: last.status,
                        barsAgo: barsAgo
                    };
                }
            }
            
            const latestCandle = candles[candles.length - 1];
            const prevCandle = candles[candles.length - 2];
            const changePercent = prevCandle ? ((latestCandle.close - prevCandle.close) / prevCandle.close) * 100 : 0;
            
            results.push({
                symbol: item.symbol,
                name: item.name,
                type: item.type,
                sector: item.sector,
                close: latestCandle.close,
                changePercent: parseFloat(changePercent.toFixed(2)),
                rsi: parseFloat(rsi[rsi.length - 1].toFixed(2)),
                bestParams: optParams,
                latestSignal: latestSig
            });
            
            console.log(`Successfully processed ${item.symbol}. Latest signal: ${latestSig ? `${latestSig.type} (${latestSig.barsAgo} days ago)` : 'None'}`);
        } catch (err) {
            console.error(`Error processing ${item.symbol}:`, err);
        }
    }
    
    // Write out results
    const outputDir = path.join(__dirname, '..');
    const outputPath = path.join(outputDir, 'screener_results.json');
    const outputData = {
        updatedAt: timestamp,
        results: results
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    console.log(`Screener run finished. Saved results to ${outputPath}`);
}

runScreener();
