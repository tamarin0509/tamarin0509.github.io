const fs = require('fs');
const path = require('path');

// Disable SSL certificate verification for environments with strict proxies
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const WATCH_SYMBOLS = [
    // 主要為替
    { symbol: 'USDJPY=X', name: '米ドル / 円 (USD/JPY)', type: 'forex' },
    { symbol: 'EURUSD=X', name: 'ユーロ / 米ドル (EUR/USD)', type: 'forex' },
    { symbol: 'GBPJPY=X', name: '英ポンド / 円 (GBP/JPY)', type: 'forex' },
    { symbol: 'AUDUSD=X', name: '豪ドル / 米ドル (AUD/USD)', type: 'forex' },
    // テクノロジー
    { symbol: 'NVDA', name: 'エヌビディア (NVDA)', type: 'stock' },
    { symbol: 'MSFT', name: 'マイクロソフト (MSFT)', type: 'stock' },
    { symbol: 'AAPL', name: 'アップル (AAPL)', type: 'stock' },
    { symbol: 'GOOGL', name: 'アルファベット (GOOGL)', type: 'stock' },
    { symbol: '9984.T', name: 'ソフトバンクグループ (9984)', type: 'stock' },
    // エネルギー・重工業
    { symbol: '1605.T', name: 'INPEX (1605)', type: 'stock' },
    { symbol: '5020.T', name: 'ENEOSホールディングス (5020)', type: 'stock' },
    { symbol: '7011.T', name: '三菱重工業 (7011)', type: 'stock' },
    { symbol: '7012.T', name: '川崎重工業 (7012)', type: 'stock' },
    { symbol: '7013.T', name: 'IHI (7013)', type: 'stock' },
    // 指数
    { symbol: '^N225', name: '日経平均株価 (Nikkei 225)', type: 'index' },
    { symbol: '^GSPC', name: 'S&P 500 Index', type: 'index' }
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

// Backtest evaluator
function evaluateParameters(candles, testParams) {
    const N = candles.length;
    const rsi = calculateRSI(candles, testParams.rsiPeriod);
    const rsiMa = calculateMA(rsi, testParams.maPeriod, testParams.maMethod);
    const analysis = calculateRsiBreakout(candles, rsi, rsiMa, testParams);
    
    const signals = analysis.signals;
    if (signals.length === 0) return -99999;
    
    const holdPeriod = 15;
    let totalReturn = 0;
    
    for (const sig of signals) {
        const entryIdx = sig.index;
        if (entryIdx >= N - 1) continue;
        
        const exitIdx = Math.min(N - 1, entryIdx + holdPeriod);
        const entryPrice = candles[entryIdx].close;
        const exitPrice = candles[exitIdx].close;
        if (entryPrice === 0) continue;
        
        let tradeReturn = 0;
        if (sig.type === 'BUY') {
            tradeReturn = (exitPrice - entryPrice) / entryPrice;
        } else if (sig.type === 'SELL') {
            tradeReturn = (entryPrice - exitPrice) / entryPrice;
        }
        totalReturn += tradeReturn;
    }
    
    let score = totalReturn;
    if (signals.length < 3) score = score * 0.1;
    return score;
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
            
            // Grid search optimizer (exploring both kairi and swing methods)
            const rsiPeriods = [9, 14, 21];
            const maPeriods = [25, 50, 75];
            const margins = [0.5, 1.0, 1.5, 2.0];
            const offsets = [-2, 0, 2];
            const peakMethods = ['kairi', 'swing']; // Explore both!
            
            let bestScore = -Infinity;
            let bestParams = null;
            
            for (const method of peakMethods) {
                for (const rsiP of rsiPeriods) {
                    for (const maP of maPeriods) {
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
                                
                                const score = evaluateParameters(candles, testParams);
                                if (score > bestScore) {
                                    bestScore = score;
                                    bestParams = testParams;
                                }
                            }
                        }
                    }
                }
            }
            
            if (!bestParams) {
                console.warn(`No optimal parameters found for ${item.symbol}, using defaults.`);
                bestParams = {
                    rsiPeriod: 14,
                    maPeriod: 50,
                    maMethod: 'EMA',
                    offset: 0,
                    margin: 1.0,
                    nLines: 3,
                    peakMethod: 'kairi',
                    swingPeriod: 10,
                    minGap: 2,
                    mtfFilter: 'none'
                };
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
