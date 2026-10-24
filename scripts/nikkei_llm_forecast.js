// =====================================================
// Daily Nikkei 225 LLM Bull/Bear Forecast
// =====================================================
// 最新の市場データとGoogle検索をGeminiへ渡し、翌東京市場の
// ブル／ベア予想を生成してLINE Messaging APIへ配信する。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUTPUT_FILE = path.join(ROOT, 'data', 'nikkei_llm_forecast.json');
const DEFAULT_MODEL = 'gemini-3.8-flash';
const LINE_TEXT_LIMIT = 5000;

const MARKET_SYMBOLS = [
    { symbol: '^N225', key: 'nikkei', name: '日経平均' },
    { symbol: 'NKD=F', key: 'nikkeiFutures', name: 'CME日経225先物' },
    { symbol: '^GSPC', key: 'sp500', name: 'S&P 500' },
    { symbol: '^DJI', key: 'dow', name: 'NYダウ' },
    { symbol: '^IXIC', key: 'nasdaq', name: 'NASDAQ総合' },
    { symbol: '^SOX', key: 'sox', name: 'SOX指数' },
    { symbol: '^VIX', key: 'vix', name: 'VIX' },
    { symbol: 'USDJPY=X', key: 'usdjpy', name: 'ドル円' },
    { symbol: '^TNX', key: 'us10y', name: '米10年債利回り' },
    { symbol: 'CL=F', key: 'wti', name: 'WTI原油先物' }
];

function round(value, digits = 2) {
    if (!Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function pctChange(values, bars = 1) {
    if (!Array.isArray(values) || values.length <= bars) return null;
    const current = values[values.length - 1];
    const previous = values[values.length - 1 - bars];
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
    return ((current - previous) / previous) * 100;
}

function simpleMovingAverage(values, period) {
    if (!Array.isArray(values) || values.length < period) return null;
    const window = values.slice(-period);
    return window.reduce((sum, value) => sum + value, 0) / period;
}

function calculateRsi(values, period = 14) {
    if (!Array.isArray(values) || values.length <= period) return null;
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i++) {
        const change = values[i] - values[i - 1];
        if (change >= 0) gains += change;
        else losses -= change;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    for (let i = period + 1; i < values.length; i++) {
        const change = values[i] - values[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;
        avgGain = ((avgGain * (period - 1)) + gain) / period;
        avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    }
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function realizedVolatility(values, period = 20) {
    if (!Array.isArray(values) || values.length <= period) return null;
    const returns = [];
    for (let i = values.length - period; i < values.length; i++) {
        const previous = values[i - 1];
        if (previous > 0) returns.push(Math.log(values[i] / previous));
    }
    if (returns.length < 2) return null;
    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance = returns.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (returns.length - 1);
    return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

function jstDate(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
}

async function fetchYahooSeries(symbol, range = '1y') {
    const encoded = encodeURIComponent(symbol);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=${range}&interval=1d`;
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; NikkeiForecastBot/1.0)'
        }
    });
    if (!response.ok) throw new Error(`Yahoo Finance ${symbol}: HTTP ${response.status}`);
    const body = await response.json();
    const result = body.chart?.result?.[0];
    if (!result) throw new Error(`Yahoo Finance ${symbol}: chart data not found`);

    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const rows = [];
    for (let i = 0; i < timestamps.length; i++) {
        const close = quote.close?.[i];
        if (!Number.isFinite(close)) continue;
        rows.push({
            date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
            open: Number.isFinite(quote.open?.[i]) ? quote.open[i] : close,
            high: Number.isFinite(quote.high?.[i]) ? quote.high[i] : close,
            low: Number.isFinite(quote.low?.[i]) ? quote.low[i] : close,
            close
        });
    }
    if (rows.length < 25) throw new Error(`Yahoo Finance ${symbol}: insufficient rows (${rows.length})`);
    return rows;
}

function summarizeSeries(definition, rows) {
    const closes = rows.map(row => row.close);
    const latest = rows[rows.length - 1];
    const last20 = rows.slice(-20);
    return {
        symbol: definition.symbol,
        name: definition.name,
        date: latest.date,
        close: round(latest.close, definition.key === 'usdjpy' ? 3 : 2),
        change1dPct: round(pctChange(closes, 1)),
        change5dPct: round(pctChange(closes, 5)),
        change20dPct: round(pctChange(closes, 20)),
        sma5: round(simpleMovingAverage(closes, 5), 2),
        sma25: round(simpleMovingAverage(closes, 25), 2),
        sma75: round(simpleMovingAverage(closes, 75), 2),
        sma200: round(simpleMovingAverage(closes, 200), 2),
        rsi14: round(calculateRsi(closes, 14), 1),
        annualizedVolatility20dPct: round(realizedVolatility(closes, 20), 1),
        low20d: round(Math.min(...last20.map(row => row.low)), 2),
        high20d: round(Math.max(...last20.map(row => row.high)), 2)
    };
}

async function collectMarketSnapshot() {
    const snapshot = {};
    for (const definition of MARKET_SYMBOLS) {
        try {
            const rows = await fetchYahooSeries(definition.symbol);
            snapshot[definition.key] = summarizeSeries(definition, rows);
        } catch (error) {
            if (definition.key === 'nikkei') throw error;
            console.warn(`Warning: ${definition.name}を取得できませんでした: ${error.message}`);
        }
    }
    return snapshot;
}

const FORECAST_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        targetSession: {
            type: 'string',
            description: '予想対象となる次回の東京株式市場の日付または簡潔な表現'
        },
        stance: {
            type: 'string',
            enum: ['BULL', 'BEAR', 'NEUTRAL'],
            description: '次回取引日の終値方向に関する総合判定'
        },
        bullProbability: {
            type: 'integer',
            minimum: 0,
            maximum: 100,
            description: '前営業日終値より上昇して引ける確率'
        },
        bearProbability: {
            type: 'integer',
            minimum: 0,
            maximum: 100,
            description: '前営業日終値より下落して引ける確率。bullProbabilityとの合計は100'
        },
        confidence: {
            type: 'string',
            enum: ['HIGH', 'MEDIUM', 'LOW']
        },
        expectedLow: {
            type: 'number',
            description: '次回取引日の日経平均予想安値'
        },
        expectedHigh: {
            type: 'number',
            description: '次回取引日の日経平均予想高値'
        },
        summary: {
            type: 'string',
            description: '結論を日本語で120文字以内に要約'
        },
        bullFactors: {
            type: 'array',
            maxItems: 3,
            items: { type: 'string' }
        },
        bearFactors: {
            type: 'array',
            maxItems: 3,
            items: { type: 'string' }
        },
        supportLevels: {
            type: 'array',
            maxItems: 3,
            items: { type: 'number' }
        },
        resistanceLevels: {
            type: 'array',
            maxItems: 3,
            items: { type: 'number' }
        },
        invalidation: {
            type: 'string',
            description: 'この予想を見直すべき価格条件を日本語で簡潔に記載'
        },
        riskEvents: {
            type: 'array',
            maxItems: 3,
            items: { type: 'string' }
        }
    },
    required: [
        'targetSession', 'stance', 'bullProbability', 'bearProbability', 'confidence',
        'expectedLow', 'expectedHigh', 'summary', 'bullFactors', 'bearFactors',
        'supportLevels', 'resistanceLevels', 'invalidation', 'riskEvents'
    ]
};

function buildPrompt(snapshot, runDate) {
    return `あなたは日本株の短期ストラテジストです。次回の東京市場における日経平均のブル／ベア予想を作成してください。

実行日（日本時間）: ${runDate}

以下はYahoo Financeから取得して機械計算した最新データです。数値を最優先してください。
${JSON.stringify(snapshot, null, 2)}

Google検索を使い、直近の米国市場、日経平均先物、ドル円、半導体、金利、原油、当日の重要イベントを確認してください。

判定ルール:
- 予想対象は次に開く東京市場の1取引日です。
- bullProbabilityは前営業日終値より上昇して引ける確率、bearProbabilityは下落して引ける確率です。
- 2つの確率は必ず合計100にしてください。
- 55%以上ならBULL、45%以下ならBEAR、それ以外はNEUTRALを基本としてください。
- expectedLow < expectedHighとし、現在値から現実的な日中レンジを設定してください。
- ニュースや数値を推測で作らないでください。確認できない材料は使わないでください。
- 強い断定や売買勧誘を避け、判断根拠と予想が崩れる条件を明示してください。
- 出力は指定されたJSONスキーマだけにしてください。`;
}

function extractResponseText(body) {
    const parts = body.candidates?.[0]?.content?.parts || [];
    const text = parts.map(part => part.text || '').join('').trim();
    if (!text) {
        const reason = body.promptFeedback?.blockReason || body.candidates?.[0]?.finishReason || 'empty response';
        throw new Error(`Gemini response has no text: ${reason}`);
    }
    return text;
}

function extractSources(body) {
    const chunks = body.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const seen = new Set();
    const sources = [];
    for (const chunk of chunks) {
        const web = chunk.web;
        if (!web?.uri || seen.has(web.uri)) continue;
        seen.add(web.uri);
        sources.push({ title: web.title || '参照情報', url: web.uri });
        if (sources.length >= 3) break;
    }
    return sources;
}

async function generateForecast(snapshot, apiKey, model = DEFAULT_MODEL, runDate = jstDate()) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const payload = {
        contents: [{ parts: [{ text: buildPrompt(snapshot, runDate) }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
            temperature: 0.2,
            responseFormat: {
                text: {
                    mimeType: 'APPLICATION_JSON',
                    schema: FORECAST_SCHEMA
                }
            }
        }
    };
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
        },
        body: JSON.stringify(payload)
    });
    const bodyText = await response.text();
    let body;
    try {
        body = JSON.parse(bodyText);
    } catch (_) {
        throw new Error(`Gemini API returned invalid JSON (HTTP ${response.status})`);
    }
    if (!response.ok) {
        throw new Error(`Gemini API HTTP ${response.status}: ${body.error?.message || 'unknown error'}`);
    }
    const forecast = JSON.parse(extractResponseText(body));
    return { forecast, sources: extractSources(body) };
}

function normalizeForecast(raw, nikkeiClose) {
    if (!raw || typeof raw !== 'object') throw new Error('Forecast is not an object');
    let bull = clamp(Math.round(Number(raw.bullProbability) || 0), 0, 100);
    let bear = clamp(Math.round(Number(raw.bearProbability) || 0), 0, 100);
    const total = bull + bear;
    if (total <= 0) {
        bull = 50;
        bear = 50;
    } else {
        bull = clamp(Math.round((bull / total) * 100), 0, 100);
        bear = 100 - bull;
    }

    const stance = bull >= 55 ? 'BULL' : bull <= 45 ? 'BEAR' : 'NEUTRAL';
    let expectedLow = Number(raw.expectedLow);
    let expectedHigh = Number(raw.expectedHigh);
    if (!Number.isFinite(expectedLow) || !Number.isFinite(expectedHigh) || expectedLow >= expectedHigh) {
        expectedLow = nikkeiClose * 0.985;
        expectedHigh = nikkeiClose * 1.015;
    }
    const cleanArray = (value, mapper = item => String(item)) =>
        (Array.isArray(value) ? value : []).slice(0, 3).map(mapper).filter(item => item !== null && item !== '');
    const cleanLevel = value => Number.isFinite(Number(value)) ? Math.round(Number(value)) : null;

    return {
        targetSession: String(raw.targetSession || '次回東京市場').slice(0, 40),
        stance,
        bullProbability: bull,
        bearProbability: bear,
        confidence: ['HIGH', 'MEDIUM', 'LOW'].includes(raw.confidence) ? raw.confidence : 'LOW',
        expectedLow: Math.round(expectedLow),
        expectedHigh: Math.round(expectedHigh),
        summary: String(raw.summary || '').slice(0, 180),
        bullFactors: cleanArray(raw.bullFactors, item => String(item).slice(0, 100)),
        bearFactors: cleanArray(raw.bearFactors, item => String(item).slice(0, 100)),
        supportLevels: cleanArray(raw.supportLevels, cleanLevel),
        resistanceLevels: cleanArray(raw.resistanceLevels, cleanLevel),
        invalidation: String(raw.invalidation || '').slice(0, 140),
        riskEvents: cleanArray(raw.riskEvents, item => String(item).slice(0, 100))
    };
}

function yen(value) {
    return `¥${Math.round(value).toLocaleString('ja-JP')}`;
}

function formatLineMessage(record) {
    const { forecast, snapshot, forecastDate, marketDate, model, sources } = record;
    const icon = forecast.stance === 'BULL' ? '🐂' : forecast.stance === 'BEAR' ? '🐻' : '⚖️';
    const stanceJp = forecast.stance === 'BULL' ? 'ブル' : forecast.stance === 'BEAR' ? 'ベア' : '中立';
    const nikkei = snapshot.nikkei;
    const lines = [
        `📊 日経平均 LLMブル・ベア予想 [${forecastDate}]`,
        '━━━━━━━━━━━━━━━━━━',
        `${icon}【判定】${stanceJp}（${forecast.stance}）`,
        `【確率】ブル ${forecast.bullProbability}% ／ ベア ${forecast.bearProbability}%`,
        `【確信度】${forecast.confidence}`,
        `【対象】${forecast.targetSession}`,
        '------------------------------------------',
        `【直近終値】${yen(nikkei.close)} (${marketDate})`,
        `【予想レンジ】${yen(forecast.expectedLow)} ～ ${yen(forecast.expectedHigh)}`,
        `【支持線】${forecast.supportLevels.length ? forecast.supportLevels.map(yen).join(' / ') : '―'}`,
        `【抵抗線】${forecast.resistanceLevels.length ? forecast.resistanceLevels.map(yen).join(' / ') : '―'}`,
        '------------------------------------------',
        `【要約】${forecast.summary}`
    ];

    if (forecast.bullFactors.length) {
        lines.push('', '🟢 ブル材料', ...forecast.bullFactors.map(item => `・${item}`));
    }
    if (forecast.bearFactors.length) {
        lines.push('', '🔴 ベア材料', ...forecast.bearFactors.map(item => `・${item}`));
    }
    if (forecast.riskEvents.length) {
        lines.push('', '⚠️ 注目イベント', ...forecast.riskEvents.map(item => `・${item}`));
    }
    lines.push('', `【予想見直し条件】${forecast.invalidation}`);
    if (sources.length) {
        lines.push('', '🔎 参照情報', ...sources.map(source => `・${source.title}: ${source.url}`));
    }
    lines.push('', `🤖 ${model} + Google検索`, '※LLMによる確率予想であり、売買を保証・推奨するものではありません。');
    return lines.join('\n').slice(0, LINE_TEXT_LIMIT);
}

async function sendLineMessage(accessToken, userId, text) {
    const url = userId
        ? 'https://api.line.me/v2/bot/message/push'
        : 'https://api.line.me/v2/bot/message/broadcast';
    const payload = userId
        ? { to: userId, messages: [{ type: 'text', text }] }
        : { messages: [{ type: 'text', text }] };
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
    });
    const responseText = await response.text();
    if (!response.ok) {
        throw new Error(`LINE Messaging API HTTP ${response.status}: ${responseText}`);
    }
}

function readPreviousRecord() {
    if (!fs.existsSync(OUTPUT_FILE)) return null;
    try {
        return JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    } catch (error) {
        console.warn(`Warning: 前回予想を読み込めませんでした: ${error.message}`);
        return null;
    }
}

async function main() {
    const apiKey = process.env.GEMINI_API_KEY;
    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const lineUserId = process.env.LINE_USER_ID || '';
    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const force = /^(1|true|yes)$/i.test(process.env.FORCE_FORECAST || '');
    const dryRun = /^(1|true|yes)$/i.test(process.env.DRY_RUN || '');

    if (!apiKey) throw new Error('GEMINI_API_KEY is required');
    if (!lineToken && !dryRun) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is required');

    console.log('Collecting market data...');
    const snapshot = await collectMarketSnapshot();
    const marketDate = snapshot.nikkei.date;
    const previous = readPreviousRecord();
    if (!force && previous?.marketDate === marketDate) {
        console.log(`No new Nikkei session (${marketDate}); notification skipped.`);
        return;
    }

    const forecastDate = jstDate();
    console.log(`Generating ${model} forecast for market data ${marketDate}...`);
    const generated = await generateForecast(snapshot, apiKey, model, forecastDate);
    const forecast = normalizeForecast(generated.forecast, snapshot.nikkei.close);
    const record = {
        generatedAt: new Date().toISOString(),
        forecastDate,
        marketDate,
        model,
        forecast,
        snapshot,
        sources: generated.sources
    };
    const message = formatLineMessage(record);

    if (dryRun) {
        console.log('\n--- DRY RUN: LINE message ---\n');
        console.log(message);
        return;
    }

    await sendLineMessage(lineToken, lineUserId, message);
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    console.log(`LINE notification sent. Forecast saved to ${OUTPUT_FILE}`);
}

if (require.main === module) {
    main().catch(error => {
        console.error(`Nikkei LLM forecast failed: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = {
    calculateRsi,
    collectMarketSnapshot,
    formatLineMessage,
    generateForecast,
    normalizeForecast,
    pctChange,
    realizedVolatility,
    simpleMovingAverage,
    summarizeSeries
};
