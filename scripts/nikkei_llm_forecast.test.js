const test = require('node:test');
const assert = require('node:assert/strict');

const {
    calculateRsi,
    formatLineMessage,
    normalizeForecast,
    pctChange,
    simpleMovingAverage,
    summarizeSeries
} = require('./nikkei_llm_forecast');

test('indicator helpers calculate expected values', () => {
    const values = Array.from({ length: 30 }, (_, index) => 100 + index);
    assert.equal(simpleMovingAverage(values, 5), 127);
    assert.equal(Math.round(pctChange(values, 1) * 100) / 100, 0.78);
    assert.equal(calculateRsi(values, 14), 100);
});

test('series summary includes technical context', () => {
    const rows = Array.from({ length: 220 }, (_, index) => ({
        date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
        open: 60000 + index,
        high: 60100 + index,
        low: 59900 + index,
        close: 60000 + index
    }));
    const summary = summarizeSeries({ symbol: '^N225', key: 'nikkei', name: '日経平均' }, rows);
    assert.equal(summary.close, 60219);
    assert.equal(summary.sma200, 60119.5);
    assert.equal(summary.rsi14, 100);
});

test('forecast normalization enforces probability and range invariants', () => {
    const normalized = normalizeForecast({
        targetSession: '次回',
        bullProbability: 70,
        bearProbability: 50,
        confidence: 'HIGH',
        expectedLow: 65000,
        expectedHigh: 64000,
        summary: '上昇優勢',
        bullFactors: ['a'],
        bearFactors: ['b'],
        supportLevels: [61000],
        resistanceLevels: [64000],
        invalidation: '61000円割れ',
        riskEvents: []
    }, 62500);
    assert.equal(normalized.bullProbability + normalized.bearProbability, 100);
    assert.equal(normalized.stance, 'BULL');
    assert.ok(normalized.expectedLow < normalized.expectedHigh);
});

test('LINE message is labeled as an LLM forecast', () => {
    const forecast = normalizeForecast({
        targetSession: '2026-10-26',
        bullProbability: 42,
        bearProbability: 58,
        confidence: 'MEDIUM',
        expectedLow: 61000,
        expectedHigh: 63500,
        summary: '戻り売り優勢。',
        bullFactors: ['売られ過ぎ'],
        bearFactors: ['米株安'],
        supportLevels: [61000],
        resistanceLevels: [64000],
        invalidation: '64000円回復',
        riskEvents: ['米国指標']
    }, 62693);
    const text = formatLineMessage({
        forecast,
        snapshot: { nikkei: { close: 62693 } },
        forecastDate: '2026-10-26',
        marketDate: '2026-10-23',
        model: 'gemini-test',
        sources: []
    });
    assert.match(text, /LLMブル・ベア予想/);
    assert.match(text, /ブル 42% ／ ベア 58%/);
    assert.match(text, /ベア（BEAR）/);
    assert.ok(text.length <= 5000);
});
