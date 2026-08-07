// =====================================================
// Trade Instruction Generator (scripts/trade_instruction_generator.js)
// 仕様設計書に準拠し、証券アプリに入力可能な具体的売買発注指示（注文種別・指値・損切り・利確・RR比・保有上限）を自動計算する。
// =====================================================

function fmtP(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return '---';
    return v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(3);
}

function generateTradeInstruction(symbolInfo, dailyCandles, action, kairi25 = 0, rsiValue = 50, params = {}) {
    if (!dailyCandles || dailyCandles.length < 10 || !action || action === 'NEUTRAL' || action === 'CANCEL') {
        return null;
    }

    const lastCandle = dailyCandles[dailyCandles.length - 1];
    const close = lastCandle.close;

    const recentBars = dailyCandles.slice(-20);
    const recentLows = recentBars.map(c => c.low);
    const recentHighs = recentBars.map(c => c.high);
    const minLow = Math.min(...recentLows);
    const maxHigh = Math.max(...recentHighs);

    const slPctDefault = params.stopLossPct || 4.0;
    const tpPctDefault = params.takeProfitPct || 14.0;
    const maxHoldBars = params.maxHoldBars || 15;

    let orderType = 'MARKET_OPEN';
    let orderTypeJp = '翌日寄り付き成行買い (MARKET BUY)';
    let entryPrice = close;
    let entryRangeStr = `¥${fmtP(close)} 近辺 (寄り成行)`;

    if (action === 'BUY') {
        if (kairi25 > 3.0) {
            orderType = 'LIMIT';
            orderTypeJp = '押し目指値買い (LIMIT BUY)';
            entryPrice = Math.round(close * 0.97 * 10) / 10;
            entryRangeStr = `¥${fmtP(entryPrice)} (25日線サポート目安)`;
        } else if (kairi25 <= -5.0) {
            orderType = 'LIMIT';
            orderTypeJp = '逆張り指値買い (LIMIT BUY)';
            entryPrice = Math.round(close * 0.985 * 10) / 10;
            entryRangeStr = `¥${fmtP(entryPrice)} (押し目買い)`;
        } else {
            orderType = 'MARKET_OPEN';
            orderTypeJp = '翌日寄り付き成行買い (MARKET BUY)';
            entryPrice = close;
            entryRangeStr = `¥${fmtP(close)} 近辺 (寄り成行)`;
        }

        let stopLoss = Math.min(minLow * 0.985, entryPrice * (1 - slPctDefault / 100));
        if (stopLoss >= entryPrice) stopLoss = entryPrice * 0.95;
        const slPctActual = Math.abs(((stopLoss - entryPrice) / entryPrice) * 100.0);

        let takeProfit = Math.max(maxHigh * 1.01, entryPrice * (1 + tpPctDefault / 100));
        const tpPctActual = ((takeProfit - entryPrice) / entryPrice) * 100.0;

        const rrRatio = (tpPctActual / slPctActual).toFixed(1);
        const nameStr = symbolInfo.name || symbolInfo.symbol;

        const executionGuide = `【スマホ操作】証券アプリで「${nameStr} ${orderType === 'LIMIT' ? '指値 ' + fmtP(entryPrice) + '円' : '成行'} / 逆指値 ${fmtP(stopLoss)}円 / 利確 ${fmtP(takeProfit)}円」をセット！`;

        return {
            action: 'BUY',
            symbol: symbolInfo.symbol,
            name: nameStr,
            orderType,
            orderTypeJp,
            entryPrice: parseFloat(entryPrice.toFixed(2)),
            entryRangeStr,
            stopLoss: parseFloat(stopLoss.toFixed(2)),
            stopLossPct: parseFloat((-slPctActual).toFixed(2)),
            takeProfit: parseFloat(takeProfit.toFixed(2)),
            takeProfitPct: parseFloat(tpPctActual.toFixed(2)),
            riskRewardRatio: parseFloat(rrRatio),
            maxHoldBars,
            executionGuide
        };
    } else if (action === 'SELL') {
        if (kairi25 < -3.0) {
            orderType = 'LIMIT';
            orderTypeJp = '戻り売り指値 (LIMIT SELL)';
            entryPrice = Math.round(close * 1.03 * 10) / 10;
            entryRangeStr = `¥${fmtP(entryPrice)} (戻り売り目安)`;
        } else {
            orderType = 'MARKET_OPEN';
            orderTypeJp = '翌日寄り付き成行売り (MARKET SELL)';
            entryPrice = close;
            entryRangeStr = `¥${fmtP(close)} 近辺 (寄り成行)`;
        }

        let stopLoss = Math.max(maxHigh * 1.015, entryPrice * (1 + slPctDefault / 100));
        if (stopLoss <= entryPrice) stopLoss = entryPrice * 1.05;
        const slPctActual = ((stopLoss - entryPrice) / entryPrice) * 100.0;

        let takeProfit = Math.min(minLow * 0.99, entryPrice * (1 - tpPctDefault / 100));
        const tpPctActual = Math.abs(((takeProfit - entryPrice) / entryPrice) * 100.0);

        const rrRatio = (tpPctActual / slPctActual).toFixed(1);
        const nameStr = symbolInfo.name || symbolInfo.symbol;

        const executionGuide = `【スマホ操作】証券アプリで「${nameStr} 成行売り / 逆指値 ${fmtP(stopLoss)}円 / 返済利確 ${fmtP(takeProfit)}円」をセット！`;

        return {
            action: 'SELL',
            symbol: symbolInfo.symbol,
            name: nameStr,
            orderType,
            orderTypeJp,
            entryPrice: parseFloat(entryPrice.toFixed(2)),
            entryRangeStr,
            stopLoss: parseFloat(stopLoss.toFixed(2)),
            stopLossPct: parseFloat(slPctActual.toFixed(2)),
            takeProfit: parseFloat(takeProfit.toFixed(2)),
            takeProfitPct: parseFloat((-tpPctActual).toFixed(2)),
            riskRewardRatio: parseFloat(rrRatio),
            maxHoldBars,
            executionGuide
        };
    }
    return null;
}

module.exports = { generateTradeInstruction, fmtP };
