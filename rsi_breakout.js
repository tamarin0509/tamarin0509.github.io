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
    backtestOffset: 0, // バックテストモード: n営業日前にタイムスライド（0=最新）
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
    candles: null,
    lastLoadedSymbol: null,
    lastLoadedPeriod: null,
    indicators: null,
    charts: {
        price: null,
        rsi: null,
        weekly: null,
        weeklyRsi: null,
        series: {
            candles: null,
            rsi: null,
            rsiMa: null,
            rsiDummy: null,
            trendlines: [],
            weeklyCandles: null,
            weeklyRsiLine: null,
            weeklyRsiMa: null
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
    setupBacktestControls();
    setupCharts();
    setupTabs();
    setupHeatmapViewToggle();
    loadScreenerData();
    loadData();
}

// バックテストモード用コントロール（スライダー・1日ステップ・リセット）
function setupBacktestControls() {
    const slider = document.getElementById('param-backtest');
    const valEl = document.getElementById('val-backtest');
    if (!slider || !valEl) return;

    const renderValue = () => {
        valEl.textContent = state.backtestOffset === 0 ? '最新' : `${state.backtestOffset}日前`;
    };

    const applyOffset = (newOffset) => {
        const max = parseInt(slider.max, 10);
        state.backtestOffset = Math.max(0, Math.min(max, newOffset));
        slider.value = state.backtestOffset;
        renderValue();
        // rawDataがキャッシュ済みならAPIを叩かずローカル再計算のみ実行される
        loadData();
    };

    // ドラッグ中はラベルのみ更新し、離した時点で再計算（リプレイ計算が重いため）
    slider.addEventListener('input', (e) => {
        state.backtestOffset = parseInt(e.target.value, 10);
        renderValue();
    });
    slider.addEventListener('change', (e) => {
        applyOffset(parseInt(e.target.value, 10));
    });

    const btnBack = document.getElementById('btn-backtest-back');
    const btnFwd = document.getElementById('btn-backtest-fwd');
    const btnReset = document.getElementById('btn-backtest-reset');
    if (btnBack) btnBack.addEventListener('click', () => applyOffset(state.backtestOffset + 1));
    if (btnFwd) btnFwd.addEventListener('click', () => applyOffset(state.backtestOffset - 1));
    if (btnReset) btnReset.addEventListener('click', () => applyOffset(0));

    renderValue();
}

// バックテストバナーの表示更新（オフセット有効時のみ表示）
function updateBacktestBanner(candles, effectiveOffset) {
    const banner = document.getElementById('backtest-banner');
    if (!banner) return;
    if (effectiveOffset > 0 && candles.length > 0) {
        const asOfDate = candles[candles.length - 1].time;
        banner.innerHTML = `<i data-lucide="rewind" style="width:14px;height:14px;"></i> バックテストモード: <strong>${asOfDate}</strong> 時点（${effectiveOffset}営業日前）のデータで分析中`;
        banner.style.display = 'flex';
        if (window.lucide) window.lucide.createIcons();
    } else {
        banner.style.display = 'none';
    }
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
        
        // Clone node to clear previously bound event listeners
        const newSlider = sliderEl.cloneNode(true);
        // Sync value to the new cloned element to prevent reverting to HTML default value
        newSlider.value = state.params[sliderInfo.key];
        valEl.textContent = state.params[sliderInfo.key];
        
        sliderEl.parentNode.replaceChild(newSlider, sliderEl);

        newSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            state.params[sliderInfo.key] = val;
            valEl.textContent = val;
        });
    });

    const methodSelector = document.getElementById('param-ma-method');
    if (methodSelector) {
        const newMethodSelector = methodSelector.cloneNode(true);
        newMethodSelector.value = state.params.maMethod;
        methodSelector.parentNode.replaceChild(newMethodSelector, methodSelector);
        newMethodSelector.addEventListener('change', (e) => {
            state.params.maMethod = e.target.value;
        });
    }

    const peakSelector = document.getElementById('param-peak-method');
    if (peakSelector) {
        const newPeakSelector = peakSelector.cloneNode(true);
        newPeakSelector.value = state.params.peakMethod || 'kairi';
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
        const newMtfSelector = mtfSelector.cloneNode(true);
        newMtfSelector.value = state.params.mtfFilter || 'none';
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
    const btnCustomApply = document.getElementById('btn-custom-apply');
    const customSymbolInput = document.getElementById('custom-symbol');
    if (btnCustomApply && customSymbolInput) {
        btnCustomApply.addEventListener('click', applyCustomSymbol);
        customSymbolInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') applyCustomSymbol();
        });
    }

    // Manual Refresh
    const btnUpdate = document.getElementById('btn-update');
    if (btnUpdate) {
        btnUpdate.addEventListener('click', () => {
            loadData();
        });
    }

    // Weekly chart toggle
    const btnWeeklyChart = document.getElementById('btn-toggle-weekly-chart');
    if (btnWeeklyChart) {
        btnWeeklyChart.addEventListener('click', () => {
            const section = document.getElementById('weekly-chart-section');
            const isHidden = section.style.display === 'none';
            if (isHidden) {
                if (!state.charts.weekly) setupWeeklyCharts();
                section.style.display = 'block';
                btnWeeklyChart.innerHTML = '<i data-lucide="x" style="width:13px;height:13px;"></i> 週足チャートを非表示';
                if (window.lucide) window.lucide.createIcons();
                if (state.candles) renderWeeklyCharts(state.candles);
            } else {
                section.style.display = 'none';
                btnWeeklyChart.innerHTML = '<i data-lucide="calendar-range" style="width:13px;height:13px;"></i> 週足チャートを表示';
                if (window.lucide) window.lucide.createIcons();
            }
        });
    }

    // Parameter Optimization
    const optimizeBtn = document.getElementById('btn-optimize');
    if (optimizeBtn) {
        optimizeBtn.addEventListener('click', optimizeParameters);
    }

    // Asset title block click to open external chart
    const titleBlock = document.querySelector('.asset-title-block');
    if (titleBlock) {
        titleBlock.addEventListener('click', () => {
            window.open(getExternalChartUrl(state.symbol), '_blank');
        });
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

// 週足チャートの初期化（初回表示時にのみ呼ばれる）
function setupWeeklyCharts() {
    const chartTheme = {
        layout: { background: { type: 'solid', color: '#111622' }, textColor: '#94a3b8', fontSize: 11, fontFamily: 'Outfit, sans-serif' },
        grid: { vertLines: { color: 'rgba(148, 163, 184, 0.05)' }, horzLines: { color: 'rgba(148, 163, 184, 0.05)' } },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: { color: '#6366f1', width: 1, style: 2, labelBackgroundColor: '#6366f1' },
            horzLine: { color: '#6366f1', width: 1, style: 2, labelBackgroundColor: '#6366f1' },
        },
        timeScale: { borderColor: 'rgba(148, 163, 184, 0.1)', timeVisible: false, secondsVisible: false },
    };

    const wPriceContainer = document.getElementById('chart-weekly-price-container');
    state.charts.weekly = LightweightCharts.createChart(wPriceContainer, {
        ...chartTheme,
        rightPriceScale: { borderColor: 'rgba(148, 163, 184, 0.1)', autoScale: true, minimumWidth: 80 }
    });
    state.charts.series.weeklyCandles = state.charts.weekly.addCandlestickSeries({
        upColor: '#10b981', downColor: '#f43f5e', borderVisible: false, wickUpColor: '#10b981', wickDownColor: '#f43f5e',
    });

    const wRsiContainer = document.getElementById('chart-weekly-rsi-container');
    state.charts.weeklyRsi = LightweightCharts.createChart(wRsiContainer, {
        ...chartTheme,
        rightPriceScale: { borderColor: 'rgba(148, 163, 184, 0.1)', autoScale: true, scaleMargins: { top: 0.05, bottom: 0.05 }, minimumWidth: 80 }
    });
    state.charts.series.weeklyRsiLine = state.charts.weeklyRsi.addLineSeries({
        color: '#a855f7', lineWidth: 2, priceLineVisible: false,
        autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
    });
    state.charts.series.weeklyRsiMa = state.charts.weeklyRsi.addLineSeries({
        color: '#eab308', lineWidth: 1.5, lineStyle: 1, priceLineVisible: false,
    });
    [70, 50, 30].forEach((lvl, i) => {
        const colors = ['rgba(244, 63, 94, 0.3)', 'rgba(148, 163, 184, 0.2)', 'rgba(16, 185, 129, 0.3)'];
        state.charts.series.weeklyRsiLine.createPriceLine({ price: lvl, color: colors[i], lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: String(lvl) });
    });

    // 週足内チャート同士のクロスヘアと時間軸を同期
    let isRefW = false, isRefWR = false;
    state.charts.weekly.subscribeCrosshairMove(param => {
        if (isRefWR) return;
        isRefW = true;
        if (param.time) state.charts.weeklyRsi.setCrosshairPosition(param.point, param.time);
        else state.charts.weeklyRsi.clearCrosshairPosition();
        isRefW = false;
    });
    state.charts.weeklyRsi.subscribeCrosshairMove(param => {
        if (isRefW) return;
        isRefWR = true;
        if (param.time) state.charts.weekly.setCrosshairPosition(param.point, param.time);
        else state.charts.weekly.clearCrosshairPosition();
        isRefWR = false;
    });
    state.charts.weekly.timeScale().subscribeVisibleLogicalRangeChange(range => {
        state.charts.weeklyRsi.timeScale().setVisibleLogicalRange(range);
    });
    state.charts.weeklyRsi.timeScale().subscribeVisibleLogicalRangeChange(range => {
        state.charts.weekly.timeScale().setVisibleLogicalRange(range);
    });

    const resizeObserver = new ResizeObserver(entries => {
        if (entries.length === 0) return;
        const width = wPriceContainer.clientWidth;
        state.charts.weekly.resize(width, 280);
        state.charts.weeklyRsi.resize(width, 150);
    });
    resizeObserver.observe(wPriceContainer);
}

// 週足チャートにデータをセット
function renderWeeklyCharts(candles) {
    if (!state.charts.weekly) return;
    const wc = buildWeeklyOverlayCandles(candles);
    state.charts.series.weeklyCandles.setData(wc);

    const wRsi = calculateRSI(wc, state.params.rsiPeriod);
    const wRsiMa = calculateMA(wRsi, state.params.maPeriod, state.params.maMethod);
    const wRsiData = [], wMaData = [];
    wc.forEach((c, i) => {
        if (wRsi[i] != null) wRsiData.push({ time: c.time, value: wRsi[i] });
        if (wRsiMa[i] != null) wMaData.push({ time: c.time, value: wRsiMa[i] });
    });
    state.charts.series.weeklyRsiLine.setData(wRsiData);
    state.charts.series.weeklyRsiMa.setData(wMaData);
    state.charts.weekly.timeScale().fitContent();
}

// 外部チャートURLを取得 (別窓動作用)
function getExternalChartUrl(symbol) {
    if (symbol.endsWith('.T')) {
        return `https://finance.yahoo.co.jp/quote/${symbol}`;
    }
    return `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`;
}

// 銘柄シンボル→ローカルデータファイル名（scripts/screener.js の sanitizeSymbolForFile と一致させること）
function sanitizeSymbolForFile(symbol) {
    return symbol.replace(/[^A-Za-z0-9._-]/g, '_');
}

// リポジトリ内に日次バッチが保存したローソク足データを取得し、Yahoo chart API形式に変換する
// (監視銘柄はCORSプロキシ無しで描画できる。データは約2年分・毎朝更新)
async function fetchLocalCandles(symbol) {
    const res = await fetch(`data/candles/${sanitizeSymbolForFile(symbol)}.json`);
    if (!res.ok) throw new Error(`No local candle data (HTTP ${res.status})`);
    const data = await res.json();
    if (!data.candles || data.candles.length === 0) throw new Error('Empty local candle data');

    // 表示期間に応じて末尾からスライス（保存データは約2年分）
    const periodDays = { '6mo': 183, '1y': 366 };
    let candles = data.candles;
    const days = periodDays[state.period];
    if (days) {
        const cutoff = new Date(candles[candles.length - 1].time + 'T00:00:00Z');
        cutoff.setUTCDate(cutoff.getUTCDate() - days);
        const cutoffStr = cutoff.toISOString().split('T')[0];
        candles = candles.filter(c => c.time >= cutoffStr);
    }

    return {
        timestamp: candles.map(c => Math.floor(new Date(c.time + 'T00:00:00Z').getTime() / 1000)),
        indicators: {
            quote: [{
                open: candles.map(c => c.open),
                high: candles.map(c => c.high),
                low: candles.map(c => c.low),
                close: candles.map(c => c.close)
            }]
        }
    };
}

// CORSプロキシ経由でYahoo Financeから取得（カスタムシンボルや5年表示のフォールバック用）
async function fetchViaProxies(targetUrl) {
    const proxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(targetUrl)}` // localhost開発時のみ有効
    ];

    let lastError = null;
    for (const proxyUrl of proxies) {
        try {
            console.log(`Fetching from proxy: ${proxyUrl}`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const res = await fetch(proxyUrl, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            const data = await res.json();
            const chartResult = data.chart?.result?.[0];
            if (!chartResult) throw new Error('No historical data in response');
            return chartResult;
        } catch (err) {
            console.warn(`Proxy failed: ${proxyUrl}`, err);
            lastError = err;
        }
    }
    throw lastError || new Error('All proxies failed');
}

// Fetch Market Data (ローカルデータ優先 → CORSプロキシfallback)
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

    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${state.symbol}?range=${state.period}&interval=1d`;
    const wantsLongRange = state.period === '5y'; // ローカルデータは2年分しか無い

    // 1. 監視銘柄はローカルデータを最優先（5年表示を除く）
    if (!wantsLongRange) {
        try {
            const localResult = await fetchLocalCandles(state.symbol);
            parseAndProcessData(localResult);
            showLoading(false);
            return;
        } catch (err) {
            console.warn(`Local candle data unavailable for ${state.symbol}, falling back to proxies.`, err);
        }
    }

    // 2. CORSプロキシ経由のライブ取得
    try {
        const chartResult = await fetchViaProxies(targetUrl);
        parseAndProcessData(chartResult);
        showLoading(false);
        return;
    } catch (err) {
        console.error('All proxies failed.', err);
    }

    // 3. 5年表示でプロキシ全滅の場合、最後の手段としてローカル2年分にフォールバック
    if (wantsLongRange) {
        try {
            const localResult = await fetchLocalCandles(state.symbol);
            alert('外部データ取得に失敗したため、リポジトリ内の約2年分のデータで表示します。');
            parseAndProcessData(localResult);
            showLoading(false);
            return;
        } catch (err2) {
            console.warn('Local fallback also failed.', err2);
        }
    }

    alert(`データ取得エラー: ${state.symbol} を取得できませんでした。\n監視リスト内の銘柄は毎朝の自動更新データで表示できますが、カスタムシンボルは外部プロキシの状況に依存します。時間をおいて再試行してください。`);
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

    // バックテストモード: 末尾 n 営業日を切り落とし、「当時の最新データ」として以降の全分析を行う
    // （分析に最低50本を残すため、オフセットはデータ長に応じてクランプされる）
    let effectiveCandles = candles;
    let effectiveOffset = 0;
    if (state.backtestOffset > 0) {
        effectiveOffset = Math.min(state.backtestOffset, candles.length - 50);
        if (effectiveOffset > 0) {
            effectiveCandles = candles.slice(0, candles.length - effectiveOffset);
        }
    }
    updateBacktestBanner(effectiveCandles, effectiveOffset);

    state.candles = effectiveCandles;

    // 1. Calculate RSI
    const rsiValues = calculateRSI(effectiveCandles, state.params.rsiPeriod);
    // 2. Calculate RSI Moving Average
    const rsiMaValues = calculateMA(rsiValues, state.params.maPeriod, state.params.maMethod);

    // 3. Perform peak/trough analysis, fit lines, and check breakouts
    const analysisResults = calculateRsiBreakout(effectiveCandles, rsiValues, rsiMaValues, state.params);

    // Run Walk-Forward Replay to find which signals were real in real-time
    const replaySignals = calculateWalkForwardReplay(effectiveCandles, state.params);
    analysisResults.comparedSignals = compareSignals(analysisResults.signals, replaySignals);

    // 4. Update UI & Charts
    renderAnalysis(effectiveCandles, rsiValues, rsiMaValues, analysisResults);
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

// 日足チャートへの週足オーバーレイ用（各週の最初の取引日を時刻キーに使用）
function buildWeeklyOverlayCandles(dailyCandles) {
    if (!dailyCandles || dailyCandles.length === 0) return [];
    const weekly = [];

    const getWeekKey = (dateStr) => {
        const d = new Date(dateStr + 'T00:00:00Z');
        const day = d.getUTCDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setUTCDate(d.getUTCDate() + diff);
        return d.toISOString().split('T')[0];
    };

    let currentWeekKey = null;
    let currentWeekCandle = null;

    for (const d of dailyCandles) {
        const weekKey = getWeekKey(d.time);
        if (currentWeekKey !== weekKey) {
            if (currentWeekCandle) weekly.push(currentWeekCandle);
            currentWeekKey = weekKey;
            currentWeekCandle = { time: d.time, open: d.open, high: d.high, low: d.low, close: d.close };
        } else {
            currentWeekCandle.high = Math.max(currentWeekCandle.high, d.high);
            currentWeekCandle.low = Math.min(currentWeekCandle.low, d.low);
            currentWeekCandle.close = d.close;
        }
    }
    if (currentWeekCandle) weekly.push(currentWeekCandle);
    return weekly;
}

// シグナルの根拠テキストを生成（日足RSI水準・MA方向・週足RSI整合）
function getSignalRationale(sig, rsi, rsiMa, weeklyCandles, weeklyRsiValues) {
    const i = sig.index;
    const rsiVal = sig.rsi;
    const maVal = rsiMa ? rsiMa[i] : null;
    const reasons = [];

    // 日足RSIの水準判定
    if (sig.type === 'BUY') {
        if (rsiVal < 35) reasons.push(`売られすぎ(${rsiVal.toFixed(1)})回復`);
        else if (rsiVal < 50) reasons.push(`中立圏下(${rsiVal.toFixed(1)})上抜け`);
        else reasons.push(`強気圏(${rsiVal.toFixed(1)})抵抗突破`);
    } else {
        if (rsiVal > 65) reasons.push(`買われすぎ(${rsiVal.toFixed(1)})反落`);
        else if (rsiVal > 50) reasons.push(`中立圏上(${rsiVal.toFixed(1)})下抜け`);
        else reasons.push(`弱気圏(${rsiVal.toFixed(1)})支持割れ`);
    }

    // RSI MA方向（5本前との比較）
    if (maVal != null && i >= 5 && rsiMa[i - 5] != null) {
        const slope = maVal - rsiMa[i - 5];
        const aligned = (sig.type === 'BUY' && slope > 0.3) || (sig.type === 'SELL' && slope < -0.3);
        const counter = (sig.type === 'BUY' && slope < -0.3) || (sig.type === 'SELL' && slope > 0.3);
        if (aligned) reasons.push('MA順張');
        else if (counter) reasons.push('MA逆張⚠');
    }

    // RSIとMAの位置関係
    if (maVal != null) {
        const diff = rsiVal - maVal;
        if (sig.type === 'BUY' && diff > 1.5) reasons.push('RSI>MA✓');
        else if (sig.type === 'SELL' && diff < -1.5) reasons.push('RSI<MA✓');
    }

    // 週足RSIの整合確認
    if (weeklyCandles && weeklyRsiValues) {
        const wRsi = getPrecedingWeeklyRsi(sig.time, weeklyCandles, weeklyRsiValues);
        if (wRsi != null) {
            const wAligned = (sig.type === 'BUY' && wRsi >= 50) || (sig.type === 'SELL' && wRsi < 50);
            const wCounter = (sig.type === 'BUY' && wRsi < 50) || (sig.type === 'SELL' && wRsi >= 50);
            if (wAligned) reasons.push(`週足RSI${wRsi.toFixed(0)}同調✓`);
            else if (wCounter) reasons.push(`週足RSI${wRsi.toFixed(0)}逆行⚠`);
        }
    }

    return reasons.join(' / ');
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

    // 週足データを事前計算（根拠表示用）
    const weeklyCandles = buildWeeklyCandles(candles);
    const weeklyRsiValues = calculateRSI(weeklyCandles, state.params.rsiPeriod);

    // 週足チャートが表示中であれば更新
    const weeklySectionEl = document.getElementById('weekly-chart-section');
    if (weeklySectionEl && weeklySectionEl.style.display !== 'none') {
        renderWeeklyCharts(candles);
    }

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
        tableBody.innerHTML = `<tr><td colspan="8" class="no-data">このパラメータ条件ではブレイクアウトが検出されませんでした。</td></tr>`;
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

            const rationale = getSignalRationale(sig, rsi, rsiMa, weeklyCandles, weeklyRsiValues);
            const rationaleColor = sig.type === 'BUY' ? 'rgba(16,185,129,0.85)' : 'rgba(244,63,94,0.85)';

            return `
                <tr ${rowStyle}>
                    <td>${sig.time}</td>
                    <td><span class="sig-badge ${sigBadgeClass}">${sig.type}</span></td>
                    <td>${statusText}</td>
                    <td style="font-weight:600;">${sig.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                    <td style="font-family:monospace; color:#a855f7;">${sig.rsi.toFixed(2)}</td>
                    <td style="font-family:monospace; color:var(--text-muted);">${sig.lineValue ? sig.lineValue.toFixed(2) : '--'}</td>
                    <td style="font-size:0.75rem; color:${rationaleColor};">${rationale || '--'}</td>
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

// パラメータ評価関数（高速バックテスト・期待値＆回数ペナルティ版）
function evaluateParameters(candles, rsi, rsiMa, testParams, startIdx, endIdx) {
    // 将来リークを防ぐため、指定したendIdxまでのスライスで計算をシミュレート
    const slicedCandles = candles.slice(0, endIdx + 1);
    const slicedRsi = rsi.slice(0, endIdx + 1);
    const slicedRsiMa = rsiMa.slice(0, endIdx + 1);

    const analysis = calculateRsiBreakout(slicedCandles, slicedRsi, slicedRsiMa, testParams);
    
    // 評価期間 [startIdx, endIdx] の範囲内にあるシグナルのみを抽出
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
    
    // 期待値 (Expectancy)
    const expectancy = (winRate * avgGain) - ((1 - winRate) * avgLoss);
    
    // 取引回数ペナルティの精緻化 (評価期間内の目標取引回数: 5〜25回)
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
        
        let candles = [];
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

        // バックテストモード時は当時のデータのみで最適化する（未来データのリーク防止）
        if (state.backtestOffset > 0) {
            const cut = Math.min(state.backtestOffset, candles.length - 50);
            if (cut > 0) candles = candles.slice(0, candles.length - cut);
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
        const rsiPeriods = [7, 9, 11, 14, 18, 21, 25];
        const maPeriods = [20, 30, 45, 60, 75, 90];
        const margins = [0.2, 0.5, 0.8, 1.0, 1.3, 1.6, 2.0];
        const offsets = [-3, -1.5, 0, 1.5, 3];
        
        // 極値アルゴリズムの設定、MTFフィルターの設定、表示ライン数は現在の設定を維持
        const currentPeakMethod = state.params.peakMethod || 'kairi';
        const currentSwingPeriod = state.params.swingPeriod || 10;
        const currentMinGap = state.params.minGap || 2;
        const currentMtfFilter = state.params.mtfFilter || 'none';
        const currentNLines = state.params.nLines || 3;
        const currentMaMethod = state.params.maMethod || 'EMA';
        
        const N = candles.length;
        const isEnd = Math.floor(N * 0.75); // IS ends at 75% of data (approx 1.5 years)
        
        const candidates = [];
        
        // 1. インサンプル期間でグリッドサーチ実行（RSI / MA キャッシュ最適化）
        for (const rsiP of rsiPeriods) {
            const rsi = calculateRSI(candles, rsiP);
            for (const maP of maPeriods) {
                const rsiMa = calculateMA(rsi, maP, currentMaMethod);
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
                        
                        const isScore = evaluateParameters(candles, rsi, rsiMa, testParams, 0, isEnd);
                        if (isScore > -90000) {
                            candidates.push({ params: testParams, isScore });
                        }
                    }
                }
            }
        }
        
        // インサンプル成績上位5候補を抽出
        candidates.sort((a, b) => b.isScore - a.isScore);
        const topCandidates = candidates.slice(0, 5);
        
        // 2. アウトサンプル期間（検証期間）で再評価
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
        
        // フォールバック: アウトサンプル評価がすべて無効/極端に低スコアならインサンプル最良を採択
        if (!bestParams || bestOsScore <= -90000) {
            bestParams = topCandidates[0]?.params || null;
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

// タブ切り替え制御の初期化
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;
            
            // 全てのタブボタンとコンテンツのアクティブ状態をクリア
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            // クリックされたタブをアクティブにする
            btn.classList.add('active');
            const targetContent = document.getElementById(targetTab);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });

    // URLハッシュで直接タブを開く (例: index.html#tab-heatmap)
    if (location.hash) {
        const hashBtn = document.querySelector(`.tab-btn[data-tab="${location.hash.slice(1)}"]`);
        if (hashBtn) hashBtn.click();
    }
}

// スクリーナー/ヒートマップから個別チャート分析タブへジャンプ（最適パラメータを同期）
function jumpToAnalysis(itemData) {
    // 個別分析タブに切り替える
    const analysisTabBtn = document.querySelector('.tab-btn[data-tab="tab-analysis"]');
    if (analysisTabBtn) analysisTabBtn.click();

    // シンボルとパラメータを更新
    state.symbol = itemData.symbol;
    state.assetName = itemData.name;

    // 最適パラメータをstateに代入
    state.params = {
        ...state.params,
        ...itemData.bestParams
    };

    // 銘柄選択セレクトボックスの表示も同期
    const assetSelector = document.getElementById('asset-selector');
    if (assetSelector) {
        assetSelector.value = itemData.symbol;
    }

    // スライダー表示を同期
    setupSliders();

    // チャートデータのロード
    loadData();
}

// RSI値 → ヒートマップタイル色（発散スケール: 青=売られすぎ ↔ 中立グレー ↔ 赤=買われすぎ）
// 中立点はRSI 50、両極はRSI 20 / 80 で飽和
function rsiToHeatColor(rsi) {
    const neutral = [54, 58, 70];    // #363A46
    const oversold = [31, 95, 181];  // #1F5FB5 (RSI <= 20)
    const overbought = [194, 59, 59]; // #C23B3B (RSI >= 80)

    const t = Math.max(-1, Math.min(1, (rsi - 50) / 30));
    const pole = t < 0 ? oversold : overbought;
    const k = Math.abs(t);
    const c = neutral.map((v, i) => Math.round(v + (pole[i] - v) * k));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ティッカーからタイル表示用の短縮シンボルを生成 (例: "7011.T"→"7011", "USDJPY=X"→"USDJPY", "^N225"→"N225")
function shortSymbol(symbol) {
    return symbol.replace(/\.T$/, '').replace(/=X$/, '').replace(/^\^/, '');
}

// ===== Market Galaxy（軌道マップ）=====
// 極座標マッピング: 中心からの距離 = RSI (0-100)、扇形の星域 = セクター、
// 星の大きさ = 前日比変動率、星の色 = RSI発散スケール、シグナル発生中の星は明滅
function renderOrbitMap(data) {
    const container = document.getElementById('heatmap-orbit');
    if (!container) return;

    if (!data.results || data.results.length === 0) {
        container.innerHTML = `<div class="no-data" style="padding: 2rem;">スクリーニング結果が見つかりませんでした。</div>`;
        return;
    }

    const fallbackSector = (item) => {
        if (item.type === 'forex') return '為替';
        if (item.type === 'index') return '指数';
        if (item.type === 'crypto') return '暗号資産';
        return 'その他';
    };
    const groups = new Map();
    data.results.forEach(item => {
        const sector = item.sector || fallbackSector(item);
        if (!groups.has(sector)) groups.set(sector, []);
        groups.get(sector).push(item);
    });
    groups.forEach(items => items.sort((a, b) => a.rsi - b.rsi));

    // ジオメトリ定義
    const VB = 1100;             // viewBox 一辺
    const cx = VB / 2, cy = VB / 2;
    const rHub = 78;             // 中心コア半径 (= RSI 0 の位置)
    const rMax = 425;            // RSI 100 の軌道半径
    const rsiToRadius = (rsi) => rHub + (Math.max(0, Math.min(100, rsi)) / 100) * (rMax - rHub);
    const polar = (angleRad, r) => [cx + r * Math.cos(angleRad), cy + r * Math.sin(angleRad)];

    const total = data.results.length;
    const marketAvgRsi = data.results.reduce((s, it) => s + it.rsi, 0) / total;

    // 背景の星屑（データとは無関係の演出レイヤー）
    let stars = '';
    for (let i = 0; i < 130; i++) {
        const sx = Math.random() * VB;
        const sy = Math.random() * VB;
        const sr = (0.5 + Math.random() * 1.1).toFixed(2);
        const delay = (Math.random() * 6).toFixed(2);
        const dur = (2.5 + Math.random() * 4).toFixed(2);
        stars += `<circle class="galaxy-star" cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${sr}" style="animation-delay:${delay}s; animation-duration:${dur}s;"/>`;
    }

    // RSI軌道リング (30 / 50 / 70)
    const rings = [
        { rsi: 30, label: '30 売られすぎ', cls: 'ring-oversold' },
        { rsi: 50, label: '50 中立', cls: 'ring-neutral' },
        { rsi: 70, label: '70 買われすぎ', cls: 'ring-overbought' }
    ].map(ring => {
        const r = rsiToRadius(ring.rsi);
        return `
            <circle class="orbit-ring ${ring.cls}" cx="${cx}" cy="${cy}" r="${r}"/>
            <text class="orbit-ring-label" x="${cx}" y="${(cy - r - 6).toFixed(1)}">${ring.label}</text>
        `;
    }).join('');

    // セクター星域（扇形）と惑星の配置
    let sectorArcs = '';
    let sectorLabels = '';
    let planets = '';
    let angleCursor = -Math.PI / 2; // 12時方向から時計回り

    groups.forEach((items, sector) => {
        const span = (items.length / total) * Math.PI * 2;
        const midAngle = angleCursor + span / 2;
        const avgRsi = items.reduce((s, it) => s + it.rsi, 0) / items.length;

        // 星域の境界線
        const [dx1, dy1] = polar(angleCursor, rHub + 4);
        const [dx2, dy2] = polar(angleCursor, rMax + 18);
        sectorArcs += `<line class="sector-divider" x1="${dx1.toFixed(1)}" y1="${dy1.toFixed(1)}" x2="${dx2.toFixed(1)}" y2="${dy2.toFixed(1)}"/>`;

        // 星域ラベル（外周） - セクター名と平均RSI
        const [lx, ly] = polar(midAngle, rMax + 44);
        sectorLabels += `
            <text class="sector-label" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}">${sector}</text>
            <text class="sector-label-rsi" x="${lx.toFixed(1)}" y="${(ly + 17).toFixed(1)}" fill="${rsiToHeatColor(avgRsi)}" style="filter: brightness(1.7);">Ø ${avgRsi.toFixed(0)}</text>
        `;

        // 惑星たち
        items.forEach((item, i) => {
            const angle = angleCursor + span * ((i + 0.5) / items.length);
            const r = rsiToRadius(item.rsi);
            const [px, py] = polar(angle, r);
            const magnitude = Math.min(Math.abs(item.changePercent), 8);
            const pr = 8 + magnitude * 1.1; // 星の半径: 8 - 16.8
            const color = rsiToHeatColor(item.rsi);

            let pulse = '';
            let sigMark = '';
            if (item.latestSignal) {
                const sigCls = item.latestSignal.type === 'BUY' ? 'buy' : 'sell';
                const arrow = item.latestSignal.type === 'BUY' ? '▲' : '▼';
                pulse = `<circle class="planet-pulse ${sigCls}" r="${(pr + 5).toFixed(1)}"/>`;
                sigMark = `<text class="planet-sig ${sigCls}" y="${(-pr - 9).toFixed(1)}">${arrow}</text>`;
            }

            // ラベルの重なり軽減: シグナル矢印が無い星は交互に上側へラベルを逃がす
            const labelAbove = !item.latestSignal && i % 2 === 1;
            const labelY = labelAbove ? -(pr + 7) : pr + 15;

            planets += `
                <g class="orbit-planet" data-symbol="${item.symbol}" transform="translate(${px.toFixed(1)},${py.toFixed(1)})">
                    <circle class="planet-glow" r="${(pr * 1.9).toFixed(1)}" fill="${color}"/>
                    ${pulse}
                    <circle class="planet-body" r="${pr.toFixed(1)}" fill="${color}"/>
                    <a href="${getExternalChartUrl(item.symbol)}" target="_blank" class="planet-label-link" onclick="event.stopPropagation();">
                        <text class="planet-label" y="${labelY.toFixed(1)}">${shortSymbol(item.symbol)} ↗</text>
                    </a>
                    ${sigMark}
                </g>
            `;
        });

        angleCursor += span;
    });

    // 中心コア（市場平均RSI）
    const core = `
        <circle class="galaxy-core-glow" cx="${cx}" cy="${cy}" r="${rHub * 1.7}"/>
        <circle class="galaxy-core" cx="${cx}" cy="${cy}" r="${rHub - 8}"/>
        <text class="core-caption" x="${cx}" y="${cy - 22}">市場平均RSI</text>
        <text class="core-value" x="${cx}" y="${cy + 14}" fill="${rsiToHeatColor(marketAvgRsi)}" style="filter: brightness(1.8);">${marketAvgRsi.toFixed(1)}</text>
        <text class="core-caption" x="${cx}" y="${cy + 38}">${total}銘柄</text>
    `;

    container.innerHTML = `
        <svg class="galaxy-svg" viewBox="0 0 ${VB} ${VB}" role="img" aria-label="セクター別RSI軌道マップ">
            <defs>
                <radialGradient id="galaxy-bg" cx="50%" cy="50%" r="65%">
                    <stop offset="0%" stop-color="#141b2e"/>
                    <stop offset="55%" stop-color="#0c1220"/>
                    <stop offset="100%" stop-color="#080c15"/>
                </radialGradient>
            </defs>
            <rect x="0" y="0" width="${VB}" height="${VB}" fill="url(#galaxy-bg)" rx="12"/>
            <g class="galaxy-starfield">${stars}</g>
            ${rings}
            ${sectorArcs}
            ${sectorLabels}
            ${core}
            <g class="galaxy-planets">${planets}</g>
        </svg>
        <div id="orbit-tooltip" class="orbit-tooltip" hidden></div>
    `;

    // インタラクション: ツールチップ & クリックでチャートへ
    const tooltip = container.querySelector('#orbit-tooltip');
    container.querySelectorAll('.orbit-planet').forEach(node => {
        const itemData = data.results.find(r => r.symbol === node.dataset.symbol);
        if (!itemData) return;

        node.addEventListener('click', () => jumpToAnalysis(itemData));

        node.addEventListener('mouseenter', () => {
            // 最前面に持ち上げる（SVGは後勝ち描画のため）
            node.parentNode.appendChild(node);

            let sigLine = '';
            if (itemData.latestSignal) {
                const sig = itemData.latestSignal;
                const cls = sig.type === 'BUY' ? 'buy' : 'sell';
                sigLine = `<div class="tt-row"><span class="heat-sig ${cls}">${sig.type === 'BUY' ? '▲' : '▼'} ${sig.type}</span> <span>${sig.barsAgo}日前 (${sig.time})</span></div>`;
            }
            const chgSign = itemData.changePercent > 0 ? '+' : '';
            tooltip.innerHTML = `
                <div class="tt-name">${itemData.name}</div>
                <div class="tt-row"><span>RSI</span><strong style="color:${rsiToHeatColor(itemData.rsi)}; filter: brightness(1.7);">${itemData.rsi.toFixed(1)}</strong></div>
                <div class="tt-row"><span>終値</span><strong>${itemData.close.toLocaleString(undefined, { maximumFractionDigits: 4 })}</strong></div>
                <div class="tt-row"><span>前日比</span><strong class="${itemData.changePercent >= 0 ? 'tt-up' : 'tt-down'}">${chgSign}${itemData.changePercent}%</strong></div>
                ${sigLine}
                <div class="tt-hint">クリック：アプリ内分析 / シンボル名クリック：別窓表示</div>
            `;
            tooltip.hidden = false;
        });

        node.addEventListener('mousemove', (e) => {
            const rect = container.getBoundingClientRect();
            let x = e.clientX - rect.left + 16;
            let y = e.clientY - rect.top + 16;
            // 右端・下端でのはみ出しを防ぐ
            if (x + 240 > rect.width) x -= 260;
            if (y + 160 > rect.height) y -= 170;
            tooltip.style.left = `${x}px`;
            tooltip.style.top = `${y}px`;
        });

        node.addEventListener('mouseleave', () => {
            tooltip.hidden = true;
        });
    });
}

// 軌道ビュー / タイルビューの切り替え
function setupHeatmapViewToggle() {
    const buttons = document.querySelectorAll('.heatmap-view-toggle .view-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const orbitEl = document.getElementById('heatmap-orbit');
            const tilesEl = document.getElementById('heatmap-container');
            const showOrbit = btn.dataset.view === 'orbit';
            if (orbitEl) orbitEl.style.display = showOrbit ? '' : 'none';
            if (tilesEl) tilesEl.style.display = showOrbit ? 'none' : '';
        });
    });
}

// セクター別RSIヒートマップの描画
function renderSectorHeatmap(data) {
    const container = document.getElementById('heatmap-container');
    if (!container) return;

    const updatedEl = document.getElementById('heatmap-updated-at');
    if (updatedEl && data.updatedAt) {
        updatedEl.textContent = `更新日時: ${new Date(data.updatedAt).toLocaleString()}`;
    }

    if (!data.results || data.results.length === 0) {
        container.innerHTML = `<div class="no-data card-glass" style="padding: 2rem; border-radius: 12px;">スクリーニング結果が見つかりませんでした。</div>`;
        return;
    }

    // セクターごとにグルーピング（旧フォーマットのJSONにはsectorが無いためtypeから補完）
    const fallbackSector = (item) => {
        if (item.type === 'forex') return '為替';
        if (item.type === 'index') return '指数';
        if (item.type === 'crypto') return '暗号資産';
        return 'その他';
    };
    const groups = new Map();
    data.results.forEach(item => {
        const sector = item.sector || fallbackSector(item);
        if (!groups.has(sector)) groups.set(sector, []);
        groups.get(sector).push(item);
    });

    // セクター内はRSI昇順（売られすぎ→買われすぎ）で並べる
    groups.forEach(items => items.sort((a, b) => a.rsi - b.rsi));

    container.innerHTML = Array.from(groups.entries()).map(([sector, items]) => {
        const avgRsi = items.reduce((s, it) => s + it.rsi, 0) / items.length;

        const tiles = items.map(item => {
            let sigBadge = '';
            if (item.latestSignal) {
                const sig = item.latestSignal;
                const cls = sig.type === 'BUY' ? 'buy' : 'sell';
                const arrow = sig.type === 'BUY' ? '▲' : '▼';
                sigBadge = `<span class="heat-sig ${cls}">${arrow} ${sig.type} <small>${sig.barsAgo}日前</small></span>`;
            }

            let changeClass = '';
            let changeSign = '';
            if (item.changePercent > 0) { changeClass = 'up'; changeSign = '+'; }
            else if (item.changePercent < 0) { changeClass = 'down'; }

            return `
                <div class="heat-tile" data-symbol="${item.symbol}" title="${item.name}" style="background:${rsiToHeatColor(item.rsi)};">
                    <div class="heat-tile-head">
                        <a href="${getExternalChartUrl(item.symbol)}" target="_blank" class="heat-external-link" onclick="event.stopPropagation();" title="Yahoo Financeで外部チャートを開く (別窓)">
                            <span class="heat-symbol">${shortSymbol(item.symbol)}</span>
                            <i data-lucide="external-link" style="width:12px;height:12px;margin-left:2px;"></i>
                        </a>
                        ${sigBadge}
                    </div>
                    <div class="heat-rsi">${item.rsi.toFixed(1)}</div>
                    <div class="heat-change ${changeClass}">${changeSign}${item.changePercent}%</div>
                </div>
            `;
        }).join('');

        return `
            <section class="heat-sector card-glass">
                <div class="heat-sector-header">
                    <h3>${sector}</h3>
                    <span class="heat-sector-meta">平均RSI <strong style="color:${rsiToHeatColor(avgRsi)}; filter: brightness(1.6);">${avgRsi.toFixed(1)}</strong> ・ ${items.length}銘柄</span>
                </div>
                <div class="heat-grid">${tiles}</div>
            </section>
        `;
    }).join('');

    // タイルクリックで個別チャートへ（最適パラメータ適用）
    container.querySelectorAll('.heat-tile').forEach(tile => {
        const itemData = data.results.find(r => r.symbol === tile.dataset.symbol);
        if (!itemData) return;
        tile.addEventListener('click', () => jumpToAnalysis(itemData));
    });
}

// スクリーナーデータのロードと描画
async function loadScreenerData() {
    try {
        const res = await fetch('screener_results.json');
        if (!res.ok) throw new Error('Screener data file not found');
        const data = await res.json();

        // 更新時刻の表示
        const updatedTime = new Date(data.updatedAt);
        document.getElementById('screener-updated-at').textContent = `更新日時: ${updatedTime.toLocaleString()}`;

        // セクターマップ（軌道ビュー & タイルビュー）の描画
        renderOrbitMap(data);
        renderSectorHeatmap(data);
        
        // サインのカウント
        let buyCount = 0;
        let sellCount = 0;
        
        const tableBody = document.getElementById('screener-table').querySelector('tbody');
        if (data.results && data.results.length > 0) {
            tableBody.innerHTML = data.results.map(item => {
                let changeClass = 'stat-change';
                let changeSign = '';
                if (item.changePercent > 0) {
                    changeClass += ' up';
                    changeSign = '+';
                } else if (item.changePercent < 0) {
                    changeClass += ' down';
                }
                
                let signalText = 'なし';
                if (item.latestSignal) {
                    const sigType = item.latestSignal.type;
                    const bars = item.latestSignal.barsAgo;
                    if (sigType === 'BUY') {
                        buyCount++;
                        signalText = `<span class="sig-badge buy">BUY</span> <span style="font-size:0.8rem; color:var(--text-muted); font-weight:normal;">(${bars}日前)</span>`;
                    } else if (sigType === 'SELL') {
                        sellCount++;
                        signalText = `<span class="sig-badge sell">SELL</span> <span style="font-size:0.8rem; color:var(--text-muted); font-weight:normal;">(${bars}日前)</span>`;
                    }
                }
                
                const bp = item.bestParams;
                const paramStr = `RSI:${bp.rsiPeriod} / MA:${bp.maPeriod} / 偏:${bp.offset} / 差:${bp.margin}`;
                
                return `
                    <tr data-symbol="${item.symbol}">
                        <td style="font-weight:600; color:#f1f5f9;">${item.name}</td>
                        <td style="font-family:monospace;">
                            <a href="${getExternalChartUrl(item.symbol)}" target="_blank" class="screener-ticker-link" onclick="event.stopPropagation();" title="Yahoo Financeで外部チャートを開く (別窓)">
                                ${item.symbol}
                                <i data-lucide="external-link" style="width:12px;height:12px;"></i>
                            </a>
                        </td>
                        <td style="font-weight:600;">${item.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                        <td class="${changeClass}">${changeSign}${item.changePercent}%</td>
                        <td style="font-family:monospace; color:#a855f7;">${item.rsi.toFixed(2)}</td>
                        <td><span class="badge-method">${bp.peakMethod}</span></td>
                        <td><span class="badge-param">${paramStr}</span></td>
                        <td>${signalText}</td>
                        <td><button class="btn-screener-view" data-symbol="${item.symbol}">表示</button></td>
                    </tr>
                `;
            }).join('');
            
            // カウントカードに値を反映
            document.getElementById('screener-buy-count').textContent = buyCount;
            document.getElementById('screener-sell-count').textContent = sellCount;
            
            // 行および表示ボタンのクリックイベントを設定
            tableBody.querySelectorAll('tr').forEach(row => {
                const symbol = row.dataset.symbol;
                const itemData = data.results.find(r => r.symbol === symbol);
                if (!itemData) return;
                
                // ボタンのクリック
                row.querySelector('.btn-screener-view').addEventListener('click', (e) => {
                    e.stopPropagation(); // 行全体のクリックイベント発火を防ぐ
                    jumpToAnalysis(itemData);
                });

                // 行全体のクリック
                row.addEventListener('click', () => jumpToAnalysis(itemData));
            });
            
            if (window.lucide) window.lucide.createIcons();
        } else {
            tableBody.innerHTML = `<tr><td colspan="9" class="no-data">スクリーニング結果が見つかりませんでした。</td></tr>`;
        }
    } catch (err) {
        console.error('Error loading screener data:', err);
        const tableBody = document.getElementById('screener-table')?.querySelector('tbody');
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="9" class="no-data" style="color:var(--color-sell);">スクリーニングデータの読み込みに失敗しました。まだ Actions が実行されていないか、JSONファイルがありません。</td></tr>`;
        }
        const heatmapContainer = document.getElementById('heatmap-container');
        if (heatmapContainer) {
            heatmapContainer.innerHTML = `<div class="no-data card-glass" style="padding: 2rem; border-radius: 12px; color:var(--color-sell);">スクリーニングデータの読み込みに失敗しました。</div>`;
        }
    }
}


