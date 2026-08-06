// =====================================================
// Weekly Report Generator
// 毎週、スクリーナーの予測（シグナル）をスナップショット保存し、
// 前週のスナップショットを現在価格と突き合わせて答え合わせを行い、
// 結果をブログページ (blog/*.html) として出力する。
//
// 実行想定: GitHub Actions で毎週土曜 朝(JST)、screener.js 実行直後
//   node scripts/weekly_report.js
// =====================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WEEKLY_DIR = path.join(ROOT, 'data', 'weekly');
const BLOG_DIR = path.join(ROOT, 'blog');
const CANDLES_DIR = path.join(ROOT, 'data', 'candles');
const RESULTS_FILE = path.join(ROOT, 'screener_results.json');

// barsAgo がこの値以下のシグナルを「新規シグナル」として扱う
const FRESH_BARS = 5;
// スナップショットが答え合わせ対象になるまでの最低経過日数
const MIN_EVAL_DAYS = 6;

// ---------- ユーティリティ ----------

function jstDateString(date = new Date()) {
    return new Date(date.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function sanitizeSymbolForFile(symbol) {
    return symbol.replace(/[^A-Za-z0-9._-]/g, '_');
}

function daysBetween(dateStrA, dateStrB) {
    return Math.round((new Date(dateStrB) - new Date(dateStrA)) / 86400000);
}

function fmtPercent(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return '---';
    const sign = v > 0 ? '+' : '';
    return `${sign}${v.toFixed(2)}%`;
}

function fmtPrice(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return '---';
    return v >= 100 ? v.toLocaleString('en-US', { maximumFractionDigits: 1 }) : v.toFixed(3);
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
}

// ---------- データ読み込み ----------

function loadScreenerResults() {
    return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
}

// 最新終値を取得（screener_results が最優先、無ければローソク足ファイル）
function getLatestClose(symbol, resultsMap) {
    const r = resultsMap.get(symbol);
    if (r && typeof r.close === 'number') return { close: r.close, time: null };
    const file = path.join(CANDLES_DIR, sanitizeSymbolForFile(symbol) + '.json');
    if (fs.existsSync(file)) {
        try {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            const last = data.candles && data.candles[data.candles.length - 1];
            if (last) return { close: last.close, time: last.time };
        } catch (e) { /* ignore */ }
    }
    return null;
}

// ---------- スナップショット（今週の予測を保存） ----------

function createSnapshot(screener, today) {
    const entries = screener.results
        .filter(r => r.latestSignal)
        .map(r => ({
            symbol: r.symbol,
            name: r.name,
            type: r.type,
            sector: r.sector,
            close: r.close,
            rsi: r.rsi,
            signal: {
                time: r.latestSignal.time,
                type: r.latestSignal.type,
                price: r.latestSignal.price,
                status: r.latestSignal.status,
                barsAgo: r.latestSignal.barsAgo
            }
        }));

    const snapshot = {
        date: today,
        screenerUpdatedAt: screener.updatedAt,
        totalSymbols: screener.results.length,
        signalCount: entries.length,
        entries
    };

    const file = path.join(WEEKLY_DIR, `snapshot-${today}.json`);
    fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));
    console.log(`Snapshot saved: ${file} (${entries.length} signals)`);
    return snapshot;
}

// ---------- 答え合わせ（前週スナップショットの評価） ----------

function listFiles(prefix) {
    if (!fs.existsSync(WEEKLY_DIR)) return [];
    return fs.readdirSync(WEEKLY_DIR)
        .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
        .sort();
}

function findSnapshotToEvaluate(today) {
    const snapshots = listFiles('snapshot-').map(f => f.slice('snapshot-'.length, -'.json'.length));
    const evaluated = new Set(
        listFiles('report-').map(f => {
            try {
                return JSON.parse(fs.readFileSync(path.join(WEEKLY_DIR, f), 'utf8')).snapshotDate;
            } catch (e) { return null; }
        }).filter(Boolean)
    );
    // 未評価かつ MIN_EVAL_DAYS 日以上経過したものの中で最も古いもの
    const candidates = snapshots.filter(d => !evaluated.has(d) && daysBetween(d, today) >= MIN_EVAL_DAYS);
    return candidates.length > 0 ? candidates[0] : null;
}

function evaluateSnapshot(snapshotDate, today, resultsMap) {
    const snapshot = JSON.parse(fs.readFileSync(path.join(WEEKLY_DIR, `snapshot-${snapshotDate}.json`), 'utf8'));

    const evaluations = [];
    for (const e of snapshot.entries) {
        const latest = getLatestClose(e.symbol, resultsMap);
        if (!latest || !e.close) {
            evaluations.push({ ...baseEval(e), evalClose: null, changePercent: null, correct: null });
            continue;
        }
        const changePercent = ((latest.close - e.close) / e.close) * 100;
        const correct = e.signal.type === 'BUY' ? changePercent > 0 : changePercent < 0;
        evaluations.push({ ...baseEval(e), evalClose: latest.close, changePercent, correct });
    }

    function baseEval(e) {
        return {
            symbol: e.symbol,
            name: e.name,
            sector: e.sector,
            signalType: e.signal.type,
            signalTime: e.signal.time,
            signalPrice: e.signal.price,
            snapClose: e.close,
            fresh: typeof e.signal.barsAgo === 'number' && e.signal.barsAgo <= FRESH_BARS
        };
    }

    const judged = evaluations.filter(e => e.correct !== null);
    const wins = judged.filter(e => e.correct).length;
    const freshJudged = judged.filter(e => e.fresh);
    const freshWins = freshJudged.filter(e => e.correct).length;

    const report = {
        reportDate: today,
        snapshotDate,
        elapsedDays: daysBetween(snapshotDate, today),
        summary: {
            total: judged.length,
            wins,
            losses: judged.length - wins,
            winRate: judged.length > 0 ? +(wins / judged.length * 100).toFixed(1) : null,
            freshTotal: freshJudged.length,
            freshWins,
            freshWinRate: freshJudged.length > 0 ? +(freshWins / freshJudged.length * 100).toFixed(1) : null
        },
        evaluations
    };

    const file = path.join(WEEKLY_DIR, `report-${today}.json`);
    fs.writeFileSync(file, JSON.stringify(report, null, 2));
    console.log(`Report saved: ${file} (win rate: ${report.summary.winRate}%)`);
    return report;
}

// ---------- ブログHTML生成 ----------

const PAGE_STYLE = `
    :root {
        --bg-primary: #0a0e17; --bg-card: rgba(22, 30, 49, 0.65);
        --border-color: rgba(255, 255, 255, 0.08);
        --text-main: #f1f5f9; --text-muted: #94a3b8; --text-dim: #64748b;
        --accent: #6366f1;
        --color-buy: #10b981; --color-sell: #f43f5e;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
        background: var(--bg-primary); color: var(--text-main);
        font-family: 'Noto Sans JP', 'Outfit', sans-serif;
        line-height: 1.7; padding: 2rem 1rem;
    }
    .container { max-width: 960px; margin: 0 auto; }
    h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.2rem; margin: 2rem 0 0.75rem; border-left: 4px solid var(--accent); padding-left: 0.6rem; }
    .meta { color: var(--text-dim); font-size: 0.85rem; margin-bottom: 1.5rem; }
    .summary-cards { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 1rem 0; }
    .summary-card {
        background: var(--bg-card); border: 1px solid var(--border-color);
        border-radius: 10px; padding: 0.75rem 1.25rem; min-width: 140px;
    }
    .summary-card .label { font-size: 0.75rem; color: var(--text-muted); }
    .summary-card .value { font-size: 1.4rem; font-weight: 700; }
    .table-wrap { overflow-x: auto; border: 1px solid var(--border-color); border-radius: 10px; }
    table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
    th, td { padding: 0.5rem 0.75rem; text-align: right; white-space: nowrap; border-bottom: 1px solid var(--border-color); }
    th { background: rgba(99, 102, 241, 0.12); color: var(--text-muted); font-weight: 600; }
    td:first-child, th:first-child, td.name, th.name { text-align: left; }
    tr:last-child td { border-bottom: none; }
    .buy { color: var(--color-buy); font-weight: 700; }
    .sell { color: var(--color-sell); font-weight: 700; }
    .pos { color: var(--color-buy); }
    .neg { color: var(--color-sell); }
    .hit { color: var(--color-buy); font-weight: 700; }
    .miss { color: var(--color-sell); font-weight: 700; }
    .badge-fresh {
        display: inline-block; font-size: 0.7rem; background: rgba(99,102,241,0.25);
        color: #a5b4fc; border-radius: 999px; padding: 0 0.5rem; margin-left: 0.4rem;
    }
    a { color: #a5b4fc; }
    .entry-list { list-style: none; }
    .entry-list li {
        background: var(--bg-card); border: 1px solid var(--border-color);
        border-radius: 10px; padding: 1rem 1.25rem; margin-bottom: 0.75rem;
    }
    .entry-list .date { font-size: 1.05rem; font-weight: 700; }
    .entry-list .desc { color: var(--text-muted); font-size: 0.85rem; }
    .note { color: var(--text-dim); font-size: 0.8rem; margin-top: 0.75rem; }
    .back-link { display: inline-block; margin-bottom: 1rem; font-size: 0.85rem; }
`;

function signalCell(type) {
    return `<span class="${type === 'BUY' ? 'buy' : 'sell'}">${type}</span>`;
}

function changeCell(v) {
    if (v === null || v === undefined) return '<td>---</td>';
    return `<td class="${v >= 0 ? 'pos' : 'neg'}">${fmtPercent(v)}</td>`;
}

function renderEvaluationSection(report) {
    if (!report) {
        return `<h2>前週予測の答え合わせ</h2>
<p class="note">評価対象の前週スナップショットがまだありません。答え合わせは次週のレポートから始まります。</p>`;
    }
    const s = report.summary;
    const rows = report.evaluations.map(e => {
        const judge = e.correct === null ? '<td>---</td>'
            : `<td class="${e.correct ? 'hit' : 'miss'}">${e.correct ? '的中' : '外れ'}</td>`;
        return `<tr>
<td class="name">${escapeHtml(e.name)}${e.fresh ? '<span class="badge-fresh">新規</span>' : ''}</td>
<td>${escapeHtml(e.symbol)}</td>
<td>${signalCell(e.signalType)}</td>
<td>${escapeHtml(e.signalTime)}</td>
<td>${fmtPrice(e.snapClose)}</td>
<td>${fmtPrice(e.evalClose)}</td>
${changeCell(e.changePercent)}
${judge}
</tr>`;
    }).join('\n');

    return `<h2>前週予測の答え合わせ（${escapeHtml(report.snapshotDate)} 時点 → ${escapeHtml(report.reportDate)}、${report.elapsedDays}日後）</h2>
<div class="summary-cards">
    <div class="summary-card"><div class="label">評価シグナル数</div><div class="value">${s.total}</div></div>
    <div class="summary-card"><div class="label">的中 / 外れ</div><div class="value">${s.wins} / ${s.losses}</div></div>
    <div class="summary-card"><div class="label">的中率</div><div class="value">${s.winRate === null ? '---' : s.winRate + '%'}</div></div>
    <div class="summary-card"><div class="label">新規シグナル的中率</div><div class="value">${s.freshWinRate === null ? '---' : s.freshWinRate + '%'}</div></div>
</div>
<div class="table-wrap">
<table>
<thead><tr><th class="name">銘柄</th><th>シンボル</th><th>予測</th><th>シグナル日</th><th>記録時終値</th><th>1週間後終値</th><th>変化率</th><th>判定</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>
<p class="note">判定基準: BUYシグナルは記録時終値より上昇していれば的中、SELLシグナルは下落していれば的中。「新規」はスナップショット時点でシグナル発生から${FRESH_BARS}本以内のもの。</p>`;
}

function renderSnapshotSection(snapshot) {
    const rows = snapshot.entries.map(e => `<tr>
<td class="name">${escapeHtml(e.name)}${e.signal.barsAgo <= FRESH_BARS ? '<span class="badge-fresh">新規</span>' : ''}</td>
<td>${escapeHtml(e.symbol)}</td>
<td>${escapeHtml(e.sector || '')}</td>
<td>${signalCell(e.signal.type)}</td>
<td>${escapeHtml(e.signal.time)}</td>
<td>${fmtPrice(e.close)}</td>
<td>${e.rsi != null ? e.rsi.toFixed(1) : '---'}</td>
</tr>`).join('\n');

    return `<h2>今週の予測（${escapeHtml(snapshot.date)} 時点のシグナル一覧）</h2>
<div class="summary-cards">
    <div class="summary-card"><div class="label">スクリーニング対象</div><div class="value">${snapshot.totalSymbols}</div></div>
    <div class="summary-card"><div class="label">シグナルあり</div><div class="value">${snapshot.signalCount}</div></div>
    <div class="summary-card"><div class="label">BUY / SELL</div><div class="value">${snapshot.entries.filter(e => e.signal.type === 'BUY').length} / ${snapshot.entries.filter(e => e.signal.type === 'SELL').length}</div></div>
</div>
<div class="table-wrap">
<table>
<thead><tr><th class="name">銘柄</th><th>シンボル</th><th>セクター</th><th>予測</th><th>シグナル日</th><th>終値</th><th>RSI</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>
<p class="note">この一覧が来週の答え合わせの対象になります。</p>`;
}

function renderEntryPage(today, snapshot, report) {
    const machineData = { date: today, snapshot, report };
    return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>週次レポート ${today} | RSI Breakout Screener</title>
<style>${PAGE_STYLE}</style>
<div class="container">
    <a class="back-link" href="./index.html">&larr; レポート一覧に戻る</a>
    <h1>週次スクリーニングレポート ${today}</h1>
    <p class="meta">RSI Breakout 自動スクリーナー（kairi法）による週次予測と答え合わせの記録</p>
    ${renderEvaluationSection(report)}
    ${renderSnapshotSection(snapshot)}
    <p class="note">&copy; 2026 tamarin0509-art — このページは自動生成されています。</p>
</div>
<script type="application/json" id="weekly-report-data">
${JSON.stringify(machineData, null, 1)}
</script>
`;
}

function rebuildIndexPage() {
    const snapshots = listFiles('snapshot-');
    const reports = listFiles('report-').map(f =>
        JSON.parse(fs.readFileSync(path.join(WEEKLY_DIR, f), 'utf8'))
    );
    const reportByDate = new Map(reports.map(r => [r.reportDate, r]));

    // ブログエントリ = スナップショット日付（新しい順）
    const dates = snapshots.map(f => f.slice('snapshot-'.length, -'.json'.length)).sort().reverse();

    const items = dates.map(d => {
        const snap = JSON.parse(fs.readFileSync(path.join(WEEKLY_DIR, `snapshot-${d}.json`), 'utf8'));
        const rep = reportByDate.get(d);
        let desc = `シグナル ${snap.signalCount}件（BUY ${snap.entries.filter(e => e.signal.type === 'BUY').length} / SELL ${snap.entries.filter(e => e.signal.type === 'SELL').length}）`;
        if (rep) {
            desc += ` ／ 前週答え合わせ: 的中率 ${rep.summary.winRate === null ? '---' : rep.summary.winRate + '%'}（${rep.summary.wins}/${rep.summary.total}）`;
        }
        return `<li><a href="./${d}.html"><span class="date">${d}</span></a><div class="desc">${desc}</div></li>`;
    }).join('\n');

    const html = `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>週次レポート一覧 | RSI Breakout Screener</title>
<style>${PAGE_STYLE}</style>
<div class="container">
    <a class="back-link" href="../index.html">&larr; スクリーナーに戻る</a>
    <h1>週次スクリーニングレポート</h1>
    <p class="meta">毎週の予測シグナルと、その1週間後の答え合わせ結果のアーカイブ</p>
    <ul class="entry-list">
${items}
    </ul>
    <p class="note">&copy; 2026 tamarin0509-art — このページは自動生成されています。</p>
</div>
`;
    fs.writeFileSync(path.join(BLOG_DIR, 'index.html'), html);
    console.log('Blog index rebuilt.');
}

// ---------- メイン ----------

function main() {
    fs.mkdirSync(WEEKLY_DIR, { recursive: true });
    fs.mkdirSync(BLOG_DIR, { recursive: true });

    const today = jstDateString();
    const screener = loadScreenerResults();
    const resultsMap = new Map(screener.results.map(r => [r.symbol, r]));

    // 1. 前週スナップショットの答え合わせ
    const targetDate = findSnapshotToEvaluate(today);
    let report = null;
    if (targetDate) {
        console.log(`Evaluating snapshot from ${targetDate}...`);
        report = evaluateSnapshot(targetDate, today, resultsMap);
    } else {
        console.log('No snapshot eligible for evaluation yet.');
    }

    // 2. 今週の予測をスナップショット保存
    const snapshot = createSnapshot(screener, today);

    // 3. ブログエントリ生成 + 一覧再構築
    const entryFile = path.join(BLOG_DIR, `${today}.html`);
    fs.writeFileSync(entryFile, renderEntryPage(today, snapshot, report));
    console.log(`Blog entry written: ${entryFile}`);
    rebuildIndexPage();
}

main();
