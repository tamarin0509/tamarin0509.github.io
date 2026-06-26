// Lucide Icons initialization
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    initApp();
});

// App State
const state = {
    symbol: 'USDJPY=X',
    assetName: '米ドル / 円 (USD/JPY)',
    period: '2y',
    params: {
        rsiPeriod: 14,
        maPeriod: 50,
        maMethod: 'EMA',
        offset: 0,
        margin: 1.0,
        minGap: 2,
        nLines: 3,
        peakMethod: 'kairi',
        swingPeriod: 10,
        mtfFilter: 'none' // 'none' or 'weekly'
    },
    rawData: null,
    lastLoadedSymbol: null,
    lastLoadedPeriod: null,
    indicators: null,
    charts: {
        price: null,
        rsi: null,
        series: {
            candles: null,
            rsi: null,
            rsiMa: null,
            rsiDummy: null,
            trendlines: []
        }
    }
};

// Presets Definition
const PRESETS = {
    forex: {
        rsiPeriod: 14,
        maPeriod: 50,
        maMethod: 'EMA',
        offset: 0,
        margin: 1.0,
        nLines: 3
    },
    stock: {
        rsiPeriod: 9,
        maPeriod: 25,
        maMethod: 'EMA',
        offset: 0,
        margin: 1.5,
        nLines: 3
    },
    aggressive: {
        rsiPeriod: 14,
        maPeriod: 30,
        maMethod: 'EMA',
        offset: -2,
        margin: 0.5,
        nLines: 4
    },
    conservative: {
        rsiPeriod: 14,
        maPeriod: 75,
        maMethod: 'SMA',
        offset: 2,
        margin: 2.0,
        nLines: 2
    }
};

// Initialize Application
function initApp() {
    setupSliders();
    setupEventListeners();
    setupCharts();
    loadData();
}

// Sliders Event Handlers
function setupSliders() {
    const sliders = [
        { id: 'param-rsi-period', valId: 'val-rsi-period', key: 'rsiPeriod' },
        { id: 'param-ma-period', valId: 'val-ma-period', key: 'maPeriod' },
        { id: 'param-offset', valId: 'val-offset', key: 'offset' },
        { id: 'param-margin', valId: 'val-margin', key: 'margin' },
        { id: 'param-min-gap', valId: 'val-min-gap', key: 'minGap' },
        { id: 'param-n-lines', valId: 'val-n-lines', key: 'nLines' },
        { id: 'param-swing-period', valId: 'val-swing-period', key: 'swingPeriod' }
    ];

    sliders.forEach(sliderInfo => {
        const sliderEl = document.getElementById(sliderInfo.id);
        const valEl = document.getElementById(sliderInfo.valId);
        if (!sliderEl || !valEl) return;
        
        // Sync initial values
        sliderEl.value = state.params[sliderInfo.key];
        valEl.textContent = state.params[sliderInfo.key];

        // Clone node to clear previously bound event listeners
        const newSlider = sliderEl.cloneNode(true);
        sliderEl.parentNode.replaceChild(newSlider, sliderEl);

        newSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            state.params[sliderInfo.key] = val;
            valEl.textContent = val;
        });
    });

    const methodSelector = document.getElementById('param-ma-method');
    if (methodSelector) {
        methodSelector.value = state.params.maMethod;
        const newMethodSelector = methodSelector.cloneNode(true);
        methodSelector.parentNode.replaceChild(newMethodSelector, methodSelector);
        newMethodSelector.addEventListener('change', (e) => {
            state.params.maMethod = e.target.value;
        });
    }

    const peakSelector = document.getElementById('param-peak-method');
    if (peakSelector) {
        peakSelector.value = state.params.peakMethod || 'kairi';
        const newPeakSelector = peakSelector.cloneNode(true);
        peakSelector.parentNode.replaceChild(newPeakSelector, peakSelector);

        const toggleMethodUI = (method) => {
            const groupSwing = document.getElementById('group-swing-period');
            const groupMinGap = document.getElementById('group-min-gap');
            if (method === 'swing') {
                if (groupSwing) groupSwing.style.display = 'block';
                if (groupMinGap) groupMinGap.style.display = 'none';
            } else {
                if (groupSwing) groupSwing.style.display = 'none';
                if (groupMinGap) groupMinGap.style.display = 'block';
            }
        };

        toggleMethodUI(state.params.peakMethod || 'kairi');

        newPeakSelector.addEventListener('change', (e) => {
            const val = e.target.value;
            state.params.peakMethod = val;
            toggleMethodUI(val);
        });
    }

    const mtfSelector = document.getElementById('param-mtf-filter');
    if (mtfSelector) {
        mtfSelector.value = state.params.mtfFilter || 'none';
        const newMtfSelector = mtfSelector.cloneNode(true);
        mtfSelector.parentNode.replaceChild(newMtfSelector, mtfSelector);
        newMtfSelector.addEventListener('change', (e) => {
            state.params.mtfFilter = e.target.value;
            loadData();
        });
    }
}

// Preset and UI event listeners
function setupEventListeners() {
    // Preset buttons
    const presetBtns = document.querySelectorAll('.btn-preset');
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            presetBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const presetName = btn.dataset.preset;
            if (PRESETS[presetName]) {
                // Keep peak parameters intact
                const peakParams = {
                    peakMethod: state.params.peakMethod || 'kairi',
                    swingPeriod: state.params.swingPeriod || 10,
                    minGap: state.params.minGap || 2
                };
                state.params = { 
                    ...state.params,
                    ...PRESETS[presetName],
                    ...peakParams
                };
                setupSliders(); // re-sync sliders visual
                loadData();
            }
        });
    });

    // Asset selection
    const assetSelector = document.getElementById('asset-selector');
    assetSelector.addEventListener('change', (e) => {
        state.symbol = e.target.value;
        state.assetName = e.target.options[e.target.selectedIndex].text;
        document.getElementById('custom-symbol').value = ''; // Clear custom input
        loadData();
    });

    // Period selection
    const periodSelector = document.getElementById('period-selector');
    periodSelector.value = state.period;
    periodSelector.addEventListener('change', (e) => {
        state.period = e.target.value;
        loadData();
    });

    // Custom Symbol Apply
    document.getElementById('btn-custom-apply').addEventListener('click', applyCustomSymbol);
    document.getElementById('custom-symbol').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') applyCustomSymbol();
    });

    // Manual Refresh
    document.getElementById('btn-update').addEventListener('click', () => {
        loadData();
    });

    // Parameter Optimization
    const optimizeBtn = document.getElementById('btn-optimize');
    if (optimizeBtn) {
        optimizeBtn.addEventListener('click', optimizeParameters);
    }
}

function applyCustomSymbol() {
    const inputVal = document.getElementById('custom-symbol').value.trim().toUpperCase();
    if (!inputVal) return;
    
    state.symbol = inputVal;
    state.assetName = `カスタム銘柄: ${inputVal}`;
    document.getElementById('current-asset-name').textContent = state.assetName;
    document.getElementById('current-asset-symbol').textContent = inputVal;
    
    loadData();
}

// Setup TradingView charts
function setupCharts() {
    const chartTheme = {
        layout: {
            background: { type: 'solid', color: '#111622' },
            textColor: '#94a3b8',
            fontSize: 11,
            fontFamily: 'Outfit, sans-serif',
        },
        grid: {
            vertLines: { color: 'rgba(148, 163, 184, 0.05)' },
            horzLines: { color: 'rgba(148, 163, 184, 0.05)' },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: {
                color: '#6366f1',
                width: 1,
                style: 2, // Dashed
                labelBackgroundColor: '#6366f1',
            },
            horzLine: {
                color: '#6366f1',
                width: 1,
                style: 2,
                labelBackgroundColor: '#6366f1',
            },
        },
        timeScale: {
            borderColor: 'rgba(148, 163, 184, 0.1)',
            timeVisible: false,
            secondsVisible: false,
        },
    };

    // 1. Price Chart
    const priceContainer = document.getElementById('chart-price-container');
    state.charts.price = LightweightCharts.createChart(priceContainer, {
        ...chartTheme,
        rightPriceScale: {
            borderColor: 'rgba(148, 163, 184, 0.1)',
            autoScale: true,
            minimumWidth: 80,
        }
    });

    state.charts.series.candles = state.charts.price.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#f43f5e',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#f43f5e',
    });

    // 2. RSI Chart
    const rsiContainer = document.getElementById('chart-rsi-container');
    state.charts.rsi = LightweightCharts.createChart(rsiContainer, {
        ...chartTheme,
        rightPriceScale: {
            borderColor: 'rgba(148, 163, 184, 0.1)',
            autoScale: true,
            scaleMargins: {
                top: 0.05,
                bottom: 0.05,
            },
            minimumWidth: 80,
        }
    });

    // Add RSI limits gridlines manually using line series or price lines
    state.charts.series.rsi = state.charts.rsi.addLineSeries({
        color: '#a855f7', // Purple
        lineWidth: 2,
        priceLineVisible: false,
        autoscaleInfoProvider: () => ({
            priceRange: {
                minValue: 0,
                maxValue: 100,
            },
        }),
    });

    state.charts.series.rsiMa = state.charts.rsi.addLineSeries({
        color: '#eab308', // Yellow
        lineWidth: 1.5,
        lineStyle: 1, // Dotted
        priceLineVisible: false,
    });

    state.charts.series.rsiDummy = state.charts.rsi.addLineSeries({
        visible: false,
        priceLineVisible: false,
        lastValueVisible: false,
    });

    // Add static horizontal bounds (30, 70)
    const rsiPriceScale = state.charts.rsi.priceScale('right');
    state.charts.series.rsi.createPriceLine({
        price: 70,
        color: 'rgba(244, 63, 94, 0.3)',
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: '70',
    });
    state.charts.series.rsi.createPriceLine({
        price: 50,
        color: 'rgba(148, 163, 184, 0.2)',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: '50',
    });
    state.charts.series.rsi.createPriceLine({
        price: 30,
        color: 'rgba(16, 185, 129, 0.3)',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: '30',
    });

    // Synchronization logic for crosshairs
    let isRefPrice = false;
    let isRefRsi = false;

    state.charts.price.subscribeCrosshairMove(param => {
        if (isRefRsi) return;
        isRefPrice = true;
        if (param.time) {
            state.charts.rsi.setCrosshairPosition(param.point, param.time);
        } else {
            state.charts.rsi.clearCrosshairPosition();
        }
        isRefPrice = false;
    });

    state.charts.rsi.subscribeCrosshairMove(param => {
        if (isRefPrice) return;
        isRefRsi = true;
        if (param.time) {
            state.charts.price.setCrosshairPosition(param.point, param.time);
        } else {
            state.charts.price.clearCrosshairPosition();
        }
        isRefRsi = false;
    });

    // Synchronization logic for Visible Range
    state.charts.price.timeScale().subscribeVisibleLogicalRangeChange(range => {
        state.charts.rsi.timeScale().setVisibleLogicalRange(range);
    });
    state.charts.rsi.timeScale().subscribeVisibleLogicalRangeChange(range => {
        state.charts.price.timeScale().setVisibleLogicalRange(range);
    });

    // Responsive charts resizing
    const resizeObserver = new ResizeObserver(entries => {
        if (entries.length === 0) return;
        const width = priceContainer.clientWidth;
        state.charts.price.resize(width, 380);
        state.charts.rsi.resize(width, 200);
    });
    resizeObserver.observe(priceContainer);
}

// Fetch Market Data via CORS Proxy with Fallback
async function loadData() {
    showLoading(true);
    
    // Skip request if the requested symbol and period are already loaded in rawData cache
    if (state.rawData && state.lastLoadedSymbol === state.symbol && state.lastLoadedPeriod === state.period) {
        console.log('Skipping API request: current state is identical to cached state.');
        parseAndProcessData(state.rawData);
        return;
    }
    
    // Update Title in UI
    document.getElementById('current-asset-name').textContent = state.assetName;
    document.getElementById('current-asset-symbol').textContent = state.symbol;

    const range = state.period;
    const interval = '1d';
    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${state.symbol}?range=${range}&interval=${interval}`;
    
    // Proxy list
    const proxies = [
        `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
        `https://thingproxy.freeboard.io/fetch/${targetUrl}`
    ];

    let lastError = null;
    for (const proxyUrl of proxies) {
        try {
            console.log(`Fetching from proxy: ${proxyUrl}`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            
            const res = await fetch(proxyUrl, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            const data = await res.json();
            const chartResult = data.chart?.result?.[0];
            if (!chartResult) throw new Error('No historical data in response');
            
            parseAndProcessData(chartResult);
            showLoading(false);
            return; // Success!
        } catch (err) {
            console.warn(`Proxy failed: ${proxyUrl}`, err);
            lastError = err;
        }
    }

    console.error('All proxies failed.', lastError);
    alert(`データ取得エラー: ${state.symbol} の取得にすべてのプロキシで失敗しました。ネットワーク状況やティッカー名をご確認ください。`);
    showLoading(false);
}

function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (show) {
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

// Parse Raw Data & Run technical analysis
function parseAndProcessData(result) {
    state.rawData = result;
    const timestamps = result.timestamp;
    const quotes = result.indicators.quote[0];
    const closes = quotes.close;
    const opens = quotes.open;
    const highs = quotes.high;
    const lows = quotes.low;

    // Convert into neat candles format
    const candles = [];
    for (let i = 0; i < timestamps.length; i++) {
        // Skip incomplete candles
        if (timestamps[i] == null || closes[i] == null || opens[i] == null || highs[i] == null || lows[i] == null) {
            continue;
        }
        
        // TradingView Lightweight Charts uses dates in 'YYYY-MM-DD' format or integer timestamps.
        // Daily charts work best with YYYY-MM-DD strings.
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
        alert('十分なデータ量がありません。分析には最低50営業日の価格履歴が必要です。');
        showLoading(false);
        return;
    }

    state.lastLoadedSymbol = state.symbol;
    state.lastLoadedPeriod = state.period;

    // 1. Calculate RSI
    const rsiValues = calculateRSI(candles, state.params.rsiPeriod);
    // 2. Calculate RSI Moving Average
    const rsiMaValues = calculateMA(rsiValues, state.params.maPeriod, state.params.maMethod);

    // 3. Perform peak/trough analysis, fit lines, and check breakouts
    const analysisResults = calculateRsiBreakout(candles, rsiValues, rsiMaValues, state.params);

    // Run Walk-Forward Replay to find which signals were real in real-time
    const replaySignals = calculateWalkForwardReplay(candles, state.params);
    analysisResults.comparedSignals = compareSignals(analysisResults.signals, replaySignals);

    // 4. Update UI & Charts
    renderAnalysis(candles, rsiValues, rsiMaValues, analysisResults);
    showLoading(false);
}

/* Indicators Math Logic */

// Wilder's RSI calculation on a single price field
function calculateSingleRSI(candles, period, priceField) {
    const rsi = new Array(candles.length).fill(null);
    let avgGain = 0;
    let avgLoss = 0;

    let firstGainSum = 0;
    let firstLossSum = 0;
    
    for (let i = 1; i <= period; i++) {
        const change = candles[i][priceField] - candles[i-1][priceField];
        if (change > 0) {
            firstGainSum += change;
        } else {
            firstLossSum += Math.abs(change);
        }
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

// Averaged Wilder's RSI calculation (Close + High + Low) / 3
function calculateRSI(candles, period) {
    if (candles.length <= period) {
        return new Array(candles.length).fill(null);
    }
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

// Moving Average (SMA / EMA)
function calculateMA(data, period, method) {
    const ma = new Array(data.length).fill(null);

    const firstValidIndex = data.findIndex(val => val !== null);
    if (firstValidIndex === -1 || firstValidIndex + period > data.length) {
        return ma;
    }

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

// Helpers to find MT4-style index maximums/minimums on array
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

// 日足データから週足データを合成する
function buildWeeklyCandles(dailyCandles) {
    if (!dailyCandles || dailyCandles.length === 0) return [];
    const weekly = [];
    
    // 週の特定キー：その週の月曜日の日付を返す
    const getMondayDateStr = (dateStr) => {
        const d = new Date(dateStr);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 月曜日
        const monday = new Date(d.setDate(diff));
        return monday.toISOString().split('T')[0];
    };
    
    let currentWeekKey = null;
    let currentWeekCandle = null;
    
    for (let i = 0; i < dailyCandles.length; i++) {
        const d = dailyCandles[i];
        const weekKey = getMondayDateStr(d.time);
        
        if (currentWeekKey !== weekKey) {
            if (currentWeekCandle) {
                weekly.push(currentWeekCandle);
            }
            currentWeekKey = weekKey;
            currentWeekCandle = {
                time: weekKey, // 週を代表する日付として月曜日の日付を使用
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close,
                rawDates: [d.time]
            };
        } else {
            currentWeekCandle.high = Math.max(currentWeekCandle.high, d.high);
            currentWeekCandle.low = Math.min(currentWeekCandle.low, d.low);
            currentWeekCandle.close = d.close; // 週の最後の営業日の終値
            currentWeekCandle.rawDates.push(d.time);
        }
    }
    
    if (currentWeekCandle) {
        weekly.push(currentWeekCandle);
    }
    
    return weekly;
}

// 指定日に対応する前週の確定週足RSIを取得する
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
        
        // 週足キャンドルの月曜日が、日足キャンドルの週の月曜日よりも過去なら確定済み
        if (wMondayTime < dailyMondayTime) {
            if (weeklyRsi[w] !== null && weeklyRsi[w] !== undefined) {
                bestRsi = weeklyRsi[w];
            }
        } else {
            break; // これ以降は未来の週
        }
    }
    
    return bestRsi;
}

// Calculate RSI Trendlines and Breakout Signals exactly using the MQL4 algorithm
function calculateRsiBreakout(candles, rsi, rsiMa, params) {
    const N = candles.length;
    const peakMethod = params.peakMethod || 'kairi';

    // --- 週足合成とRSI計算 ---
    let weeklyCandles = [];
    let weeklyRsi = [];
    if (params.mtfFilter === 'weekly') {
        weeklyCandles = buildWeeklyCandles(candles);
        weeklyRsi = calculateRSI(weeklyCandles, params.rsiPeriod);
    }

    if (peakMethod === 'swing') {
        const left = Math.floor(params.swingPeriod || 10);
        const right = Math.floor(params.swingPeriod || 10);
        const requireDirection = true; // 抵抗=下降/平ら, 支持=上昇/平ら （ダマシ抑制）

        // --- スイングピボット検出（確定済みのみ。後ろRIGHT本を見て初めて確定）---
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

        // ピボットがバー i 時点で確定済みか: p + right <= i
        const confirmedUpTo = (pivots, i) => {
            const out = [];
            for (const p of pivots) {
                if (p + right <= i) out.push(p); else break; // 昇順前提
            }
            return out;
        };

        // 直近2ピボットから線を作る
        const lineFromLastTwo = (values, pivots) => {
            if (pivots.length < 2) return null;
            const b = pivots[pivots.length - 1];
            const a = pivots[pivots.length - 2];
            const va = values[a], vb = values[b];
            if (va == null || vb == null) return null;
            const slope = (vb - va) / (b - a);
            return { a, b, slope, valAt: (x) => vb + slope * (x - b) };
        };

        // --- シグナル: as-of（確定ピボットだけ → 過去シグナルは後から動かない）---
        // 発火条件: 「直近 lookback 本のどこかで線の下(BUY)/上(SELL)にいた」かつ
        //          「いま線を margin 以上で突破した最初の足」。緩い抜けも拾える。
        const lookback = right; // 確認ウィンドウ
        const signals = [];
        for (let i = 1; i < N; i++) {
            if (rsi[i] == null || rsi[i - 1] == null) continue;

            // BUY: 抵抗線（直近2スイング高値）を上抜け
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

            // SELL: 支持線（直近2スイング安値）を下抜け
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

        // --- 表示用ライン: 最新スナップショットの連続ピボット対 nLines本 ---
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

    // Map JS arrays to MT4-style backwards arrays (index 0 is newest, N-1 is oldest)
    const rsi_mt4 = new Array(N).fill(0);
    const kairi_mt4 = new Array(N).fill(0);

    for (let i = 0; i < N; i++) {
        const jsIdx = N - 1 - i;
        rsi_mt4[i] = rsi[jsIdx] !== null ? rsi[jsIdx] : 0;
        const maVal = rsiMa[jsIdx];
        // Kairi_buffer[i] = (RSI[i]-mov_rsi[i])/mov_rsi[i]
        kairi_mt4[i] = (maVal && maVal !== 0 && rsi[jsIdx] !== null) ? (rsi[jsIdx] - maVal) / maVal : 0;
    }

    // Identify waves based on Kairi buffer crossing zero
    let j = 0;
    const ii = [];
    
    // In MQL4: for(i=1; j<nLine*2+6; i++)
    // We scan backwards up to N - 2 to prevent i+1 out of bounds
    for (let i = 1; i < N - 1; i++) {
        if (j >= params.nLines * 2 + 10) break;
        
        if (kairi_mt4[i] * kairi_mt4[i+1] <= 0) {
            ii[j] = i;
            j++;
            if (j > 2) {
                if (ii[j-1] - ii[j-3] < params.minGap) {
                    j = j - 2;
                }
            }
        }
    }

    const Hi_stack = [];
    const Lo_stack = [];
    const maxLL = Math.min(params.nLines + 6, Math.floor((j - 2) / 2));

    if (j > 2) {
        if (kairi_mt4[ii[0]] < 0) {
            for (let ll = 0; ll < maxLL; ll++) {
                const hiCount = ii[1+ll*2] - ii[0+ll*2] + 1;
                const hiStart = ii[0+ll*2] + 1;
                Hi_stack[ll] = arrayMaximum(rsi_mt4, hiCount, hiStart);

                const loCount = ii[2+ll*2] - ii[1+ll*2] + 1;
                const loStart = ii[1+ll*2] + 1;
                Lo_stack[ll] = arrayMinimum(rsi_mt4, loCount, loStart);
            }
        } else {
            for (let ll = 0; ll < maxLL; ll++) {
                const hiCount = ii[2+ll*2] - ii[1+ll*2];
                const hiStart = ii[1+ll*2] + 1;
                Hi_stack[ll] = arrayMaximum(rsi_mt4, hiCount, hiStart);

                const loCount = ii[1+ll*2] - ii[0+ll*2];
                const loStart = ii[0+ll*2] + 1;
                Lo_stack[ll] = arrayMinimum(rsi_mt4, loCount, loStart);
            }
        }
    }

    // Allocate buffers matching MT4 index space
    const buf1_mt4 = new Array(N).fill(null);
    const buf2_mt4 = new Array(N).fill(null);
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

        let rh = 0;
        if (hp2n !== hp1n) {
            rh = (hp2 - hp1) / (hp2n - hp1n);
        }

        const lp1 = rsi_mt4[Lo_stack[ll]];
        const lp2 = rsi_mt4[Lo_stack[ll+1]];
        const lp1n = Lo_stack[ll];
        const lp2n = Lo_stack[ll+1];
        const lp3n = ll > 0 ? Lo_stack[ll-1] : 0;

        let rl = 0;
        if (lp1n !== lp2n) {
            rl = (lp1 - lp2) / (lp2n - lp1n);
        }

        for (let k = 0; k < hp2n - hp1n; k++) {
            buf1_mt4[hp1n + k] = hp1 + rh * k;
        }
        for (let k = 0; k < lp2n - lp1n; k++) {
            buf2_mt4[lp1n + k] = lp1 - rl * k;
        }
        for (let k = 1; k <= hp1n - hp3n; k++) {
            buf3_mt4[hp1n - k] = hp1 - rh * k;
        }
        for (let k = 1; k <= lp1n - lp3n; k++) {
            buf4_mt4[lp1n - k] = lp1 + rl * k;
        }

        // Add to return structures for rendering in JS (mapping back to JS indexes)
        if (hp1n !== undefined && hp2n !== undefined) {
            const tStart = N - 1 - hp2n;
            const tEnd = N - 1 - hp1n;
            const rsiStart = rsi_mt4[hp2n];
            const rsiEnd = rsi_mt4[hp1n];
            const slope = (rsiEnd - rsiStart) / (tEnd - tStart);
            peakLines.push({ tStart, tEnd, slope, rsiStart, rsiEnd });
        }

        if (lp1n !== undefined && lp2n !== undefined) {
            const tStart = N - 1 - lp2n;
            const tEnd = N - 1 - lp1n;
            const rsiStart = rsi_mt4[lp2n];
            const rsiEnd = rsi_mt4[lp1n];
            const slope = (rsiEnd - rsiStart) / (tEnd - tStart);
            troughLines.push({ tStart, tEnd, slope, rsiStart, rsiEnd });
        }
    }

    // Scan for breakout signals (using MT4 index space)
    const buf5_mt4 = new Array(N).fill(null); // BUY
    const buf6_mt4 = new Array(N).fill(null); // SELL

    // BUY: RSI crosses ABOVE resistance line (buf3)
    for (let i = 0; i < N - 1; i++) {
        if (buf3_mt4[i] == null || buf3_mt4[i+1] == null) continue;
        if (rsi_mt4[i] == null || rsi_mt4[i+1] == null) continue;

        // Crossing check: RSI was at or below line, now above by at least margin
        const prevBelow = rsi_mt4[i+1] <= buf3_mt4[i+1] + params.margin;
        const nowAbove = rsi_mt4[i] > buf3_mt4[i] + params.margin;

        if (prevBelow && nowAbove) {
            buf5_mt4[i] = rsi_mt4[i];
        }
    }

    // SELL: RSI crosses BELOW support line (buf4)
    for (let i = 0; i < N - 1; i++) {
        if (buf4_mt4[i] == null || buf4_mt4[i+1] == null) continue;
        if (rsi_mt4[i] == null || rsi_mt4[i+1] == null) continue;

        // Crossing check: RSI was at or above line, now below by at least margin
        const prevAbove = rsi_mt4[i+1] >= buf4_mt4[i+1] - params.margin;
        const nowBelow = rsi_mt4[i] < buf4_mt4[i] - params.margin;

        if (prevAbove && nowBelow) {
            buf6_mt4[i] = rsi_mt4[i];
        }
    }

    // Build signals list in chronological order
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

    // Format peaks and troughs for return structure
    const peaks = Hi_stack.map(idx => ({
        index: N - 1 - idx,
        rsi: rsi_mt4[idx],
        time: candles[N - 1 - idx].time,
        price: candles[N - 1 - idx].close
    })).reverse(); // oldest to newest

    const troughs = Lo_stack.map(idx => ({
        index: N - 1 - idx,
        rsi: rsi_mt4[idx],
        time: candles[N - 1 - idx].time,
        price: candles[N - 1 - idx].close
    })).reverse(); // oldest to newest

    return {
        peaks,
        troughs,
        peakLines,
        troughLines,
        signals
    };
}

// Run walk-forward replay step-by-step
function calculateWalkForwardReplay(candles, params) {
    const replaySignals = [];
    const N = candles.length;
    
    // Starting index to have enough bars for indicator calculations
    const startIdx = Math.max(50, params.rsiPeriod + params.maPeriod + 10);
    
    for (let t = startIdx; t < N; t++) {
        // Slice data as-of index t (only historical data up to day t)
        const slice = candles.slice(0, t + 1);
        
        // Recalculate indicators for this slice
        const rsi = calculateRSI(slice, params.rsiPeriod);
        const rsiMa = calculateMA(rsi, params.maPeriod, params.maMethod);
        const res = calculateRsiBreakout(slice, rsi, rsiMa, params);
        
        // We look for a signal that triggered on the VERY LAST bar of this slice (index t)
        // Note that index t in the slice corresponds to index t in the original candles array.
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

// Compare batch (with repaint) and replay (without repaint) signals
function compareSignals(batchSignals, replaySignals) {
    const replayMap = new Map();
    replaySignals.forEach(s => {
        replayMap.set(s.index + '_' + s.type, s);
    });

    const batchMap = new Map();
    batchSignals.forEach(s => {
        batchMap.set(s.index + '_' + s.type, s);
    });

    const confirmed = [];
    const phantom = [];
    const replayOnly = [];

    batchSignals.forEach(bs => {
        const key = bs.index + '_' + bs.type;
        if (replayMap.has(key)) {
            confirmed.push(bs);
        } else {
            phantom.push(bs);
        }
    });

    replaySignals.forEach(rs => {
        const key = rs.index + '_' + rs.type;
        if (!batchMap.has(key)) {
            replayOnly.push(rs);
        }
    });

    return {
        confirmed,
        phantom,
        replayOnly
    };
}

// Render data and drawings to charts and tables
function renderAnalysis(candles, rsi, rsiMa, analysis) {
    // 1. Clear previous trendline series
    state.charts.series.trendlines.forEach(series => {
        try {
            state.charts.rsi.removeSeries(series);
        } catch (e) {}
    });
    state.charts.series.trendlines = [];

    // 2. Set base series data
    state.charts.series.candles.setData(candles);
    state.charts.series.rsiDummy.setData(candles.map(c => ({ time: c.time, value: 50 })));

    const rsiData = [];
    const rsiMaData = [];

    for (let i = 0; i < candles.length; i++) {
        if (rsi[i] != null) {
            rsiData.push({ time: candles[i].time, value: rsi[i] });
        }
        if (rsiMa[i] != null) {
            rsiMaData.push({ time: candles[i].time, value: rsiMa[i] });
        }
    }

    state.charts.series.rsi.setData(rsiData);
    state.charts.series.rsiMa.setData(rsiMaData);

    // 3. Draw Trendlines on RSI Chart
    // Combine peaks and troughs trendlines
    const renderLine = (line, colorHex) => {
        // Realized solid segment
        const pastSeries = state.charts.rsi.addLineSeries({
            color: colorHex,
            lineWidth: 1.5,
            lineStyle: 0, // Solid
            priceLineVisible: false,
            lastValueVisible: false,
        });
        
        const pastData = [];
        for (let i = line.tStart; i <= line.tEnd; i++) {
            const val = line.rsiStart + line.slope * (i - line.tStart);
            pastData.push({ time: candles[i].time, value: val });
        }
        pastSeries.setData(pastData);
        state.charts.series.trendlines.push(pastSeries);

        // Extended forecast ray
        const futureSeries = state.charts.rsi.addLineSeries({
            color: colorHex,
            lineWidth: 1.5,
            lineStyle: 2, // Dashed
            priceLineVisible: false,
            lastValueVisible: false,
        });

        const futureData = [];
        // Project all the way to the end of the data array, but stop if out of bounds [0, 100]
        for (let i = line.tEnd; i < candles.length; i++) {
            const val = line.rsiEnd + line.slope * (i - line.tEnd);
            if (val < 0 || val > 100) {
                break;
            }
            futureData.push({ time: candles[i].time, value: val });
        }
        futureSeries.setData(futureData);
        state.charts.series.trendlines.push(futureSeries);
    };

    // Draw last nLine Peak lines (Resistance - glowing purple/red)
    analysis.peakLines.forEach(line => renderLine(line, 'rgba(236, 72, 153, 0.75)')); // Hot Pink
    // Draw last nLine Trough lines (Support - glowing blue/cyan)
    analysis.troughLines.forEach(line => renderLine(line, 'rgba(6, 182, 212, 0.75)')); // Cyan

    // 4. Apply Markers to Price & RSI Charts based on Walk-Forward verification
    const priceMarkers = [];
    const compared = analysis.comparedSignals || { confirmed: [], phantom: [], replayOnly: [] };

    // A. Confirmed signals (both batch and replay)
    compared.confirmed.forEach(sig => {
        priceMarkers.push({
            time: sig.time,
            position: sig.type === 'BUY' ? 'belowBar' : 'aboveBar',
            color: sig.type === 'BUY' ? '#10b981' : '#f43f5e', // Solid green/red
            shape: sig.type === 'BUY' ? 'arrowUp' : 'arrowDown',
            text: sig.type === 'BUY' ? 'BUY(確)' : 'SELL(確)',
        });
    });

    // B. Phantom signals (batch only - disappeared in real life!)
    compared.phantom.forEach(sig => {
        priceMarkers.push({
            time: sig.time,
            position: sig.type === 'BUY' ? 'belowBar' : 'aboveBar',
            color: '#64748b', // Slate gray
            shape: sig.type === 'BUY' ? 'arrowUp' : 'arrowDown',
            text: sig.type === 'BUY' ? 'BUY(消)' : 'SELL(消)',
        });
    });

    // C. Replay-only signals (not present in final batch)
    compared.replayOnly.forEach(sig => {
        priceMarkers.push({
            time: sig.time,
            position: sig.type === 'BUY' ? 'belowBar' : 'aboveBar',
            color: '#f59e0b', // Amber orange
            shape: sig.type === 'BUY' ? 'arrowUp' : 'arrowDown',
            text: sig.type === 'BUY' ? 'BUY(実)' : 'SELL(実)',
        });
    });

    // Sort markers chronologically to ensure Lightweight Charts renders them correctly
    priceMarkers.sort((a, b) => new Date(a.time) - new Date(b.time));
    state.charts.series.candles.setMarkers(priceMarkers);

    // Fit visible scale to last 150 bars so candlesticks are clearly visible
    const totalBars = candles.length;
    state.charts.price.timeScale().setVisibleLogicalRange({
        from: totalBars - 150,
        to: totalBars + 3
    });
    const initialRange = state.charts.price.timeScale().getVisibleLogicalRange();
    if (initialRange) {
        state.charts.rsi.timeScale().setVisibleLogicalRange(initialRange);
    }

    // 5. Update Stats Cards
    const latestCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];
    const latestRsi = rsi[rsi.length - 1];
    
    // Price
    const priceEl = document.getElementById('stat-price');
    const changeEl = document.getElementById('stat-change');
    if (latestCandle) {
        priceEl.textContent = latestCandle.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
        if (prevCandle) {
            const changePercent = ((latestCandle.close - prevCandle.close) / prevCandle.close) * 100;
            const sign = changePercent >= 0 ? '+' : '';
            changeEl.textContent = `${sign}${changePercent.toFixed(2)}%`;
            changeEl.className = 'stat-change ' + (changePercent >= 0 ? 'up' : 'down');
        }
    }

    // RSI
    const rsiEl = document.getElementById('stat-rsi');
    rsiEl.textContent = latestRsi ? latestRsi.toFixed(1) : '--.-';

    // Last Signal details (use verified signals first if available)
    const lastSigEl = document.getElementById('stat-signal');
    const signalCountEl = document.getElementById('stat-signal-count');
    const replayCountEl = document.getElementById('stat-replay-count');
    const phantomCountEl = document.getElementById('stat-phantom-count');

    const totalBatchCount = analysis.signals.length;
    const confirmedCount = compared.confirmed.length;
    const replayOnlyCount = compared.replayOnly.length;
    const totalReplayCount = confirmedCount + replayOnlyCount;
    const phantomCount = compared.phantom.length;
    const phantomRate = totalBatchCount > 0 ? ((phantomCount / totalBatchCount) * 100).toFixed(0) : 0;

    signalCountEl.textContent = totalBatchCount;
    if (replayCountEl) replayCountEl.textContent = totalReplayCount;
    if (phantomCountEl) phantomCountEl.textContent = `${phantomCount} (${phantomRate}%)`;

    // Get the chronologically newest signal (either batch or replay)
    const allSignalsChronological = [];
    compared.confirmed.forEach(s => allSignalsChronological.push({ ...s, status: 'confirmed' }));
    compared.phantom.forEach(s => allSignalsChronological.push({ ...s, status: 'phantom' }));
    compared.replayOnly.forEach(s => allSignalsChronological.push({ ...s, status: 'replayOnly' }));
    allSignalsChronological.sort((a, b) => new Date(a.time) - new Date(b.time));

    if (allSignalsChronological.length > 0) {
        const lastSig = allSignalsChronological[allSignalsChronological.length - 1];
        let statusBadge = '';
        if (lastSig.status === 'confirmed') statusBadge = '<span style="color:#10b981; font-weight:bold;">[確]</span>';
        else if (lastSig.status === 'phantom') statusBadge = '<span style="color:#64748b; text-decoration:line-through;">[消]</span>';
        else if (lastSig.status === 'replayOnly') statusBadge = '<span style="color:#f59e0b; font-weight:bold;">[実]</span>';

        lastSigEl.innerHTML = `<span class="sig-badge ${lastSig.type.toLowerCase()}">${lastSig.type}</span> ${statusBadge} <span style="font-size:0.75rem; font-weight:normal; color:var(--text-muted);">${lastSig.time}</span>`;
    } else {
        lastSigEl.textContent = 'なし';
    }

    // 6. Populate Signals Log Table (combining all signals)
    const tableBody = document.getElementById('signals-table').querySelector('tbody');
    
    if (allSignalsChronological.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="no-data">このパラメータ条件ではブレイクアウトが検出されませんでした。</td></tr>`;
    } else {
        // Reverse array to show newest first in the log table
        const reversedSignals = [...allSignalsChronological].reverse();
        
        tableBody.innerHTML = reversedSignals.map(sig => {
            let statusText = '';
            let rowStyle = '';
            let sigBadgeClass = sig.type.toLowerCase();
            
            if (sig.status === 'confirmed') {
                statusText = '<span style="color:#10b981; font-weight:600;"><i data-lucide="check-circle" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i>確定 (実戦+後知恵)</span>';
            } else if (sig.status === 'phantom') {
                statusText = '<span style="color:#64748b; text-decoration:line-through;"><i data-lucide="alert-triangle" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i>消滅 (後知恵のみダマシ)</span>';
                rowStyle = 'style="opacity: 0.65; background-color: rgba(244, 63, 94, 0.02);"';
            } else if (sig.status === 'replayOnly') {
                statusText = '<span style="color:#f59e0b; font-weight:600;"><i data-lucide="info" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i>実戦のみ (遅延確定)</span>';
            }

            return `
                <tr ${rowStyle}>
                    <td>${sig.time}</td>
                    <td><span class="sig-badge ${sigBadgeClass}">${sig.type}</span></td>
                    <td>${statusText}</td>
                    <td style="font-weight:600;">${sig.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                    <td style="font-family:monospace; color:#a855f7;">${sig.rsi.toFixed(2)}</td>
                    <td style="font-family:monospace; color:var(--text-muted);">${sig.lineValue ? sig.lineValue.toFixed(2) : '--'}</td>
                    <td><button class="btn-chart-jump" data-time="${sig.time}">移動</button></td>
                </tr>
            `;
        }).join('');

        // Wire jump buttons
        tableBody.querySelectorAll('.btn-chart-jump').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetTime = e.target.dataset.time;
                // Find index
                const idx = candles.findIndex(c => c.time === targetTime);
                if (idx !== -1) {
                    // Jump view scale to center targetTime
                    state.charts.price.timeScale().setVisibleLogicalRange({
                        from: idx - 20,
                        to: idx + 20
                    });
                }
            });
        });

        // Re-run lucide icons to render status column icons if any
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }
}

// パラメータ評価関数（高速バックテスト）
function evaluateParameters(candles, testParams) {
    const N = candles.length;
    // 指標計算
    const rsi = calculateRSI(candles, testParams.rsiPeriod);
    const rsiMa = calculateMA(rsi, testParams.maPeriod, testParams.maMethod);
    const analysis = calculateRsiBreakout(candles, rsi, rsiMa, testParams);
    
    const signals = analysis.signals;
    if (signals.length === 0) {
        return -99999;
    }
    
    // 評価期間
    const holdPeriod = 15;
    let totalReturn = 0;
    
    for (const sig of signals) {
        const entryIdx = sig.index;
        if (entryIdx >= N - 1) continue;
        
        // 保持期間後の終値（データ長を超える場合は末尾の終値）
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
    
    // シグナル数が少なすぎる場合のペナルティ
    if (signals.length < 3) {
        score = score * 0.1;
    }
    
    return score;
}

// パラメータ最適化実行メイン処理
function optimizeParameters() {
    const optimizeBtn = document.getElementById('btn-optimize');
    if (optimizeBtn) {
        optimizeBtn.disabled = true;
        optimizeBtn.innerHTML = '<i data-lucide="refresh-cw" class="spin"></i> 最適化中...';
        if (window.lucide) window.lucide.createIcons();
    }
    
    // UIをブロックしないように setTimeout で非同期に処理を実行
    setTimeout(() => {
        if (!state.rawData || !state.rawData.timestamp) {
            alert('最適化するのに十分なデータがありません。先にチャートデータを読み込んでください。');
            if (optimizeBtn) {
                optimizeBtn.disabled = false;
                optimizeBtn.innerHTML = '<i data-lucide="zap"></i> パラメータ最適化';
                if (window.lucide) window.lucide.createIcons();
            }
            return;
        }
        
        const rawResult = state.rawData;
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
            alert('最適化するのに十分なデータ量がありません。');
            if (optimizeBtn) {
                optimizeBtn.disabled = false;
                optimizeBtn.innerHTML = '<i data-lucide="zap"></i> パラメータ最適化';
                if (window.lucide) window.lucide.createIcons();
            }
            return;
        }
        
        // 探索空間の定義
        const rsiPeriods = [9, 14, 21];
        const maPeriods = [25, 50, 75];
        const margins = [0.5, 1.0, 1.5, 2.0];
        const offsets = [-2, 0, 2];
        
        let bestScore = -Infinity;
        let bestParams = null;
        
        // 極値アルゴリズムの設定、MTFフィルターの設定、表示ライン数は現在の設定を維持
        const currentPeakMethod = state.params.peakMethod || 'kairi';
        const currentSwingPeriod = state.params.swingPeriod || 10;
        const currentMinGap = state.params.minGap || 2;
        const currentMtfFilter = state.params.mtfFilter || 'none';
        const currentNLines = state.params.nLines || 3;
        const currentMaMethod = state.params.maMethod || 'EMA';
        
        for (const rsiP of rsiPeriods) {
            for (const maP of maPeriods) {
                for (const marg of margins) {
                    for (const offs of offsets) {
                        const testParams = {
                            rsiPeriod: rsiP,
                            maPeriod: maP,
                            maMethod: currentMaMethod,
                            offset: offs,
                            margin: marg,
                            nLines: currentNLines,
                            peakMethod: currentPeakMethod,
                            swingPeriod: currentSwingPeriod,
                            minGap: currentMinGap,
                            mtfFilter: currentMtfFilter
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
        
        if (bestParams) {
            // パラメータを更新
            state.params.rsiPeriod = bestParams.rsiPeriod;
            state.params.maPeriod = bestParams.maPeriod;
            state.params.offset = bestParams.offset;
            state.params.margin = bestParams.margin;
            
            // スライダーなどのUIを再同期
            setupSliders();
            
            // チャート・分析のリロード
            parseAndProcessData(state.rawData);
            
            alert(`最適化完了！\nRSI基準値: ${state.params.rsiPeriod}\nRSI移動平均期間: ${state.params.maPeriod}\nMAオフセット: ${state.params.offset}\n判定マージン: ${state.params.margin}`);
        } else {
            alert('最適なパラメータの探索に失敗しました。');
        }
        
        if (optimizeBtn) {
            optimizeBtn.disabled = false;
            optimizeBtn.innerHTML = '<i data-lucide="zap"></i> パラメータ最適化';
            if (window.lucide) window.lucide.createIcons();
        }
    }, 50);
}

