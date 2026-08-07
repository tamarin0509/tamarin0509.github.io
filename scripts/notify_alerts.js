// =====================================================
// Alert Notifier (scripts/notify_alerts.js)
// weekly_watchlist.json を読込み、HIGH/MEDIUM 優先度のアラートが存在する場合に
// Discord Webhook や LINE Notify / LINE Messaging API へ結果を配信する。
// =====================================================

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const ROOT = path.join(__dirname, '..');
const WATCHLIST_FILE = path.join(ROOT, 'weekly_watchlist.json');

function postRequest(urlStr, headers, bodyData) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(urlStr);
        const req = https.request(parsedUrl, {
            method: 'POST',
            headers: headers
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
        });
        req.on('error', err => reject(err));
        req.write(bodyData);
        req.end();
    });
}

async function sendDiscordNotification(webhookUrl, watchlistData) {
    const alerts = watchlistData.alerts || [];
    const highAlerts = alerts.filter(a => a.priority === 'HIGH');
    const medAlerts = alerts.filter(a => a.priority === 'MEDIUM');

    if (highAlerts.length === 0 && medAlerts.length === 0) {
        console.log('ℹ [Notify] HIGH/MEDIUMのアラートがないためDiscord通知をスキップします。');
        return;
    }

    const embeds = [];

    // HIGH Priority Embed
    if (highAlerts.length > 0) {
        const fields = highAlerts.slice(0, 10).map(a => ({
            name: `${a.action === 'BUY' ? '🟢 BUY' : '🔴 SELL'} ${a.name} (¥${a.close.toLocaleString()})`,
            value: `**トリガー**: ${a.triggerDetails}\n**乖離率**: ${a.weeklyKairi25 > 0 ? '+' : ''}${a.weeklyKairi25.toFixed(1)}% | **週RSI**: ${a.weeklyRsi.toFixed(1)}\n💡 *${a.note}*`,
            inline: false
        }));
        embeds.push({
            title: `⭐ 最優先ウォッチ銘柄 (HIGH Priority: ${highAlerts.length}件)`,
            color: 0x6366f1,
            fields: fields
        });
    }

    // MEDIUM Priority Embed
    if (medAlerts.length > 0 && embeds.length < 10) {
        const fields = medAlerts.slice(0, 8).map(a => ({
            name: `${a.action === 'BUY' ? '🟢 BUY' : '🔴 SELL'} ${a.name}`,
            value: `週RSI: ${a.weeklyRsi.toFixed(1)} | 25週乖離: ${a.weeklyKairi25.toFixed(1)}% | ${a.triggerDetails}`,
            inline: false
        }));
        embeds.push({
            title: `⚠️ 注目銘柄 (MEDIUM Priority: ${medAlerts.length}件)`,
            color: 0x3b82f6,
            fields: fields
        });
    }

    const reportUrl = `https://tamarin0509.github.io/blog/watchlist_${watchlistData.weekEnding || watchlistData.generatedAt.slice(0,10)}.html`;

    const payload = {
        username: '週足テクニカルBot',
        avatar_url: 'https://tamarin0509.github.io/favicon.ico',
        content: `📊 **【週足ウォッチリスト】** [${watchlistData.weekEnding || ''}]\n詳細レポート: ${reportUrl}`,
        embeds: embeds
    };

    try {
        const res = await postRequest(webhookUrl, { 'Content-Type': 'application/json' }, JSON.stringify(payload));
        console.log(`✅ [Notify] Discord Webhook 送信成功 (ステータス: ${res.statusCode})`);
    } catch (e) {
        console.error('❌ [Notify] Discord Webhook 送信失敗:', e.message);
    }
}

async function sendLineNotify(token, watchlistData) {
    const alerts = watchlistData.alerts || [];
    const highAlerts = alerts.filter(a => a.priority === 'HIGH');
    if (highAlerts.length === 0) return;

    const reportUrl = `https://tamarin0509.github.io/blog/watchlist_${watchlistData.weekEnding || watchlistData.generatedAt.slice(0,10)}.html`;

    let msg = `\n📊 週足ウォッチリスト [${watchlistData.weekEnding || ''}]\n`;
    msg += `━━━━━━━━━━━━━━━\n`;

    highAlerts.slice(0, 5).forEach(a => {
        msg += `${a.action === 'BUY' ? '🟢' : '🔴'} ${a.name}\n`;
        msg += `  週RSI:${a.weeklyRsi} | 25週乖離:${a.weeklyKairi25}%\n`;
        msg += `  → ${a.note}\n\n`;
    });

    msg += `📈 詳細: ${reportUrl}`;

    const body = new URLSearchParams({ message: msg }).toString();
    try {
        const res = await postRequest('https://notify-api.line.me/api/notify', {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Bearer ${token}`
        }, body);
        console.log(`✅ [Notify] LINE Notify 送信成功 (ステータス: ${res.statusCode})`);
    } catch (e) {
        console.error('❌ [Notify] LINE Notify 送信失敗:', e.message);
    }
}

async function sendLineMessagingApiNotification(accessToken, userId, watchlistData) {
    const alerts = watchlistData.alerts || [];
    const highAlerts = alerts.filter(a => a.priority === 'HIGH');
    const medAlerts = alerts.filter(a => a.priority === 'MEDIUM');
    if (highAlerts.length === 0 && medAlerts.length === 0) return;

    const reportUrl = `https://tamarin0509.github.io/blog/watchlist_${watchlistData.weekEnding || watchlistData.generatedAt.slice(0,10)}.html`;

    let text = `📊 週足ウォッチリスト [${watchlistData.weekEnding || ''}]\n━━━━━━━━━━━━━━━\n\n`;

    if (highAlerts.length > 0) {
        text += `⭐ 【最優先注目】\n`;
        highAlerts.slice(0, 5).forEach(a => {
            text += `${a.action === 'BUY' ? '🟢' : '🔴'} ${a.name} (¥${a.close.toLocaleString()})\n`;
            text += `  週RSI:${a.weeklyRsi} | 25週乖離:${a.weeklyKairi25 > 0 ? '+' : ''}${a.weeklyKairi25.toFixed(1)}%\n`;
            text += `  💡 ${a.note}\n\n`;
        });
    }

    if (medAlerts.length > 0 && highAlerts.length < 5) {
        text += `⚠️ 【要チェック】\n`;
        medAlerts.slice(0, 3).forEach(a => {
            text += `${a.action === 'BUY' ? '🟢' : '🔴'} ${a.name}\n`;
            text += `  ${a.triggerDetails}\n\n`;
        });
    }

    text += `📈 詳細レポート:\n${reportUrl}`;

    const targetUrl = userId ? 'https://api.line.me/v2/bot/message/push' : 'https://api.line.me/v2/bot/message/broadcast';
    const payload = userId ? { to: userId, messages: [{ type: 'text', text }] } : { messages: [{ type: 'text', text }] };

    try {
        const res = await postRequest(targetUrl, {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        }, JSON.stringify(payload));
        console.log(`✅ [Notify] LINE Messaging API 送信成功 (${userId ? 'Push' : 'Broadcast'}, ステータス: ${res.statusCode})`);
    } catch (e) {
        console.error('❌ [Notify] LINE Messaging API 送信失敗:', e.message);
    }
}

async function main() {
    if (!fs.existsSync(WATCHLIST_FILE)) {
        console.log('ℹ [Notify] weekly_watchlist.json が存在しないため終了します。');
        return;
    }

    let watchlistData;
    try {
        watchlistData = JSON.parse(fs.readFileSync(WATCHLIST_FILE, 'utf8'));
    } catch (e) {
        console.error('❌ [Notify] JSONのパースに失敗:', e.message);
        return;
    }

    const discordUrl = process.env.DISCORD_WEBHOOK_URL;
    const lineToken = process.env.LINE_NOTIFY_TOKEN;
    const lineChannelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const lineUserId = process.env.LINE_USER_ID;

    if (!discordUrl && !lineToken && !lineChannelAccessToken) {
        console.log('ℹ [Notify] DISCORD_WEBHOOK_URL / LINE_NOTIFY_TOKEN / LINE_CHANNEL_ACCESS_TOKEN が未設定のため、通知処理をスキップします。');
        return;
    }

    if (lineChannelAccessToken) {
        await sendLineMessagingApiNotification(lineChannelAccessToken, lineUserId, watchlistData);
    }
    if (discordUrl) {
        await sendDiscordNotification(discordUrl, watchlistData);
    }
    if (lineToken) {
        await sendLineNotify(lineToken, watchlistData);
    }
}

if (require.main === module) {
    main();
}

module.exports = { sendDiscordNotification, sendLineNotify, sendLineMessagingApiNotification };
