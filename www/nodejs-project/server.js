const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 8999;
const API_BASE = 'https://dvk42e1v7g8kc.cloudfront.net';
const CDN_URL = 'https://sjljsla.lkkwip.cn';
const IMG_CDN = 'https://zzzznnn.lkkwip.cn/';
const TOKEN =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aW1lc3RhbXAiOjE3ODg0NDkyMzk0NjEyMTQyMDAsInR5cGUiOjAsInVpZCI6MzE5ODI0fQ.itIem6kK1_VnuU87YkHpdz--yf2ZNfvF8tWKj4ouE8Y';
const AES_KEY_HEX = 'c7719993cb5b81ceb148f4a205d48f05';
const INTERFACE_KEY = Buffer.from('65dc07d1b7915c6b2937432b091837a7', 'utf-8');
const IMG_KEY = Buffer.from('2019ysapp7527', 'utf-8');
const PARAM_KEY = Buffer.from('BxJand%xf5h3sycH', 'utf-8');
const PARAM_IV = Buffer.from('BxJand%xf5h3sycH', 'utf-8');

function encryptParam(obj) {
	const jsonStr = JSON.stringify(obj);
	const cipher = crypto.createCipheriv('aes-128-cbc', PARAM_KEY, PARAM_IV);
	return Buffer.concat([cipher.update(jsonStr, 'utf-8'), cipher.final()]).toString('base64');
}

function ge(...arrays) {
	return Buffer.concat(arrays.map(a => Buffer.from(a)));
}
function sha256(buf) {
	return crypto.createHash('sha256').update(buf).digest();
}

function decryptResponse(dataStr) {
	const o = Buffer.from(dataStr.trim(), 'base64');
	const i = o.slice(0, 12);
	const r = ge(INTERFACE_KEY, i);
	const l = r.length >> 1;
	const s = sha256(r).slice(8, 24);
	const c = ge(s, r.slice(0, l));
	const A = ge(r.slice(l), s);
	const d = sha256(c);
	const f = sha256(A);
	const m = ge(d.slice(0, 8), f.slice(8, 24), d.slice(24));
	const p = ge(f.slice(0, 4), d.slice(12, 20), f.slice(28));
	const g = o.slice(12);

	const decipher = crypto.createDecipheriv('aes-256-cbc', m, p);
	let decrypted = Buffer.concat([decipher.update(g), decipher.final()]);
	return JSON.parse(decrypted.toString('utf-8'));
}

function fetchApi(apiPath, params = null) {
	return new Promise((resolve, reject) => {
		let fullPath = apiPath;
		if (params) {
			const enc = encryptParam(params);
			fullPath += (fullPath.includes('?') ? '&' : '?') + 'data=' + encodeURIComponent(enc);
		}
		const url = `${API_BASE}${fullPath}`;
		https
			.get(
				url,
				{
					headers: {
						Host: 'dvk42e1v7g8kc.cloudfront.net',
						Authorization: TOKEN,
						temp: 'test',
						'X-User-Agent':
							'BuildID=com.abc.Butterfly;SysType=ios;DevID=00000000000000000000000000000;Ver=1.0.0;DevType=iPhone;DeviceBrand=APPLE;DeviceModel=iPhone;SystemName=iOS;SystemVersion=18.7;Terminal=1;IsH5=1;Sid=00000000000000000000000000000000',
						Origin: 'https://d2pypzndaqisk.cloudfront.net',
						Referer: 'https://d2pypzndaqisk.cloudfront.net/',
						'User-Agent':
							'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1',
					},
					rejectUnauthorized: false,
				},
				res => {
					let data = '';
					res.on('data', chunk => (data += chunk));
					res.on('end', () => {
						try {
							const json = JSON.parse(data);
							if (json.hash && typeof json.data === 'string') {
								resolve(decryptResponse(json.data));
							} else {
								resolve(json.data || json);
							}
						} catch (e) {
							reject(e);
						}
					});
				},
			)
			.on('error', reject);
	});
}

function fetchRaw(url) {
	return new Promise((resolve, reject) => {
		https
			.get(
				url,
				{
					headers: {
						Referer: 'https://d2pypzndaqisk.cloudfront.net/',
						Origin: 'https://d2pypzndaqisk.cloudfront.net',
					},
					rejectUnauthorized: false,
				},
				res => {
					let data = '';
					res.on('data', c => (data += c));
					res.on('end', () => resolve(data));
				},
			)
			.on('error', reject);
	});
}

const TABS = [
	{ id: 'all', name: '全部频道' },
	{ id: '6a928dfedb2cc815f75d7213', name: '黄果原创' },
	{ id: '6a928de7db2cc815f75d720f', name: '成人短剧' },
	{ id: '6a928dccdb2cc815f75d720b', name: '成人漫剧' },
	{ id: '6a928d54db2cc815f75d7201', name: 'AI魔改' },
];

const server = http.createServer(async (req, res) => {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', '*');

	if (req.method === 'OPTIONS') {
		res.writeHead(200);
		res.end();
		return;
	}

	const reqUrl = new URL(req.url, `http://${req.headers.host}`);
	const pathname = reqUrl.pathname;

	// 1. 获取特定频道和二级排序 (最热/最新/最多喜欢) 的短剧列表
	if (pathname === '/api/dramas') {
		const tabId = reqUrl.searchParams.get('tabId') || 'all';
		const sortType = reqUrl.searchParams.get('sortType') || '0'; // 0:最热, 1:最新, 6:最多喜欢
		const page = reqUrl.searchParams.get('page') || '1';

		try {
			let resultList = [];
			const targetTabs = tabId === 'all' ? TABS.filter(t => t.id !== 'all') : TABS.filter(t => t.id === tabId);

			const promises = targetTabs.map(tab => {
				return fetchApi(`/api/app/playlet/home/tab/${tab.id}`, {
					pageNumber: String(page),
					pageSize: tabId === 'all' ? '18' : '36',
					tabSortType: String(sortType),
				})
					.then(res => {
						const list = res.list || [];
						list.forEach(d => {
							if (d && d.id) {
								d.channelName = tab.name;
								if (d.cover) {
									const rawCoverPath = d.cover.replace(/^\/+/, '').replace(/^https?:\/\/[^/]+\//, '');
									d.cover = `/api/img?url=${encodeURIComponent(rawCoverPath)}`;
								}
							}
						});
						return list;
					})
					.catch(() => []);
			});

			const lists = await Promise.all(promises);
			const seen = new Set();
			lists.flat().forEach(d => {
				if (d && d.id && !seen.has(d.id)) {
					seen.add(d.id);
					resultList.push(d);
				}
			});

			res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
			res.end(JSON.stringify({ code: 0, data: resultList, total: resultList.length }));
		} catch (e) {
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: e.message }));
		}
		return;
	}

	// 2. 封面图片解密代理接口
	if (pathname === '/api/img') {
		let imgPath = reqUrl.searchParams.get('url');
		if (!imgPath) {
			res.writeHead(400);
			res.end('Missing url');
			return;
		}

		const fullImgUrl = imgPath.startsWith('http') ? imgPath : `${IMG_CDN}${imgPath.replace(/^\/+/, '')}`;
		https
			.get(fullImgUrl, { rejectUnauthorized: false }, remoteRes => {
				const chunks = [];
				remoteRes.on('data', c => chunks.push(c));
				remoteRes.on('end', () => {
					const buf = Buffer.concat(chunks);
					const limit = Math.min(100, buf.length);
					for (let i = 0; i < limit; i++) {
						buf[i] ^= IMG_KEY[i % IMG_KEY.length];
					}

					let contentType = 'image/jpeg';
					if (buf[0] === 0x89 && buf[1] === 0x50) contentType = 'image/png';
					if (buf[0] === 0x47 && buf[1] === 0x49) contentType = 'image/gif';

					res.writeHead(200, {
						'Content-Type': contentType,
						'Cache-Control': 'public, max-age=86400',
					});
					res.end(buf);
				});
			})
			.on('error', e => {
				res.writeHead(500);
				res.end(e.message);
			});
		return;
	}

	// 3. 获取某部剧的所有集数
	if (pathname.startsWith('/api/chapters/')) {
		const seriesId = pathname.replace('/api/chapters/', '');
		try {
			const detail = await fetchApi(`/api/app/playlet/detail/${seriesId}`);
			let chapters = detail.chapters || [];

			if (!chapters.length) {
				chapters = await fetchApi(`/api/app/playlet-chapter/list/${seriesId}`);
			}

			res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
			res.end(JSON.stringify({ code: 0, data: chapters, title: detail.title }));
		} catch (e) {
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: e.message }));
		}
		return;
	}

	// 4.1 App 内置模式心跳检测（安卓 App 内 WebView 轮询判断服务是否就绪）
	if (pathname === '/api/ping') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ code: 0 }));
		return;
	}

	// 4. 密钥接口
	if (pathname === '/api/key') {
		res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
		res.end(Buffer.from(AES_KEY_HEX, 'hex'));
		return;
	}

	// 5. TS 切片防盗链代理
	if (pathname === '/api/ts') {
		const tsUrl = reqUrl.searchParams.get('url');
		if (!tsUrl) {
			res.writeHead(400);
			res.end('Missing url');
			return;
		}

		const client = tsUrl.startsWith('https:') ? https : http;
		client
			.get(
				tsUrl,
				{
					headers: {
						Referer: 'https://d2pypzndaqisk.cloudfront.net/',
						Origin: 'https://d2pypzndaqisk.cloudfront.net',
						'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)',
					},
					rejectUnauthorized: false,
				},
				remoteRes => {
					res.writeHead(remoteRes.statusCode, {
						'Content-Type': 'video/mp2t',
						'Access-Control-Allow-Origin': '*',
					});
					remoteRes.pipe(res);
				},
			)
			.on('error', err => {
				res.writeHead(500);
				res.end(err.message);
			});
		return;
	}

	// 6. m3u8 代理
	if (pathname === '/api/m3u8') {
		let videoUrl = reqUrl.searchParams.get('videoUrl');
		if (!videoUrl) {
			res.writeHead(400);
			res.end('Missing videoUrl');
			return;
		}

		videoUrl = videoUrl.replace(/^\/+/, '');
		const upstreamM3u8Url = `${API_BASE}/api/app/vid/h5/m3u8/${videoUrl}?token=${encodeURIComponent(TOKEN)}&c=${CDN_URL}`;
		try {
			const rawM3u8 = await fetchRaw(upstreamM3u8Url);

			// 使用请求方 Host 动态拼接播放地址，保证手机通过局域网 IP 访问时同样可用
			const baseHost = req.headers.host || `127.0.0.1:${PORT}`;
			const baseUrl = `http://${baseHost}`;

			let proxiedM3u8 = rawM3u8.replace('URI="/api/app/vid/sec"', `URI="${baseUrl}/api/key"`);

			proxiedM3u8 = proxiedM3u8.replace(/(https:\/\/[^\r\n]+\.ts[^\r\n]*)/g, match => {
				return `${baseUrl}/api/ts?url=${encodeURIComponent(match)}`;
			});

			res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
			res.end(proxiedM3u8);
		} catch (e) {
			res.writeHead(500);
			res.end(e.message);
		}
		return;
	}

	// 7. 后台触发下载到桌面
	if (pathname === '/api/download') {
		const title = reqUrl.searchParams.get('title') || '短剧';
		let videoUrl = reqUrl.searchParams.get('videoUrl');
		if (!videoUrl) {
			res.writeHead(400);
			res.end('Missing videoUrl');
			return;
		}

		videoUrl = videoUrl.replace(/^\/+/, '');
		const safeTitle = title.replace(/[/\\?%*:|"<>]/g, '_');
		const outPath = path.join(process.env.HOME, 'Desktop', `${safeTitle}.mp4`);
		const upstreamM3u8Url = `${API_BASE}/api/app/vid/h5/m3u8/${videoUrl}?token=${encodeURIComponent(TOKEN)}&c=${CDN_URL}`;

		try {
			const rawM3u8 = await fetchRaw(upstreamM3u8Url);
			const keyFile = `/tmp/key_${Date.now()}_${Math.random().toString(36).slice(2)}.bin`;
			const m3u8File = `/tmp/m3u8_${Date.now()}_${Math.random().toString(36).slice(2)}.m3u8`;

			fs.writeFileSync(keyFile, Buffer.from(AES_KEY_HEX, 'hex'));
			fs.writeFileSync(m3u8File, rawM3u8.replace('URI="/api/app/vid/sec"', `URI="file://${keyFile}"`));

			console.log(`[下载启动] -> ${outPath}`);
			const cmd = `ffmpeg -headers "Referer: https://d2pypzndaqisk.cloudfront.net/\r\n" -allowed_extensions ALL -protocol_whitelist file,http,https,tcp,tls,crypto -i "${m3u8File}" -c copy "${outPath}" -y`;
			exec(cmd, err => {
				try {
					fs.unlinkSync(keyFile);
					fs.unlinkSync(m3u8File);
				} catch (e) {}
				if (!err) {
					console.log(`[下载完成] ${outPath}`);
				} else {
					console.error(`[下载失败]`, err);
				}
			});

			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ code: 0, msg: '已加入下载队列，请稍候查看桌面！', outPath }));
		} catch (e) {
			res.writeHead(500);
			res.end(e.message);
		}
		return;
	}

	// 8. 前端页面
	if (pathname === '/' || pathname === '/index.html') {
		res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
		res.end(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="theme-color" content="#0b0d13">
    <title>短剧聚合播放与下载面板</title>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0b0d13; color: #e5e9f0; display: flex; height: 100vh; overflow: hidden; }

        #sidebar { width: 380px; background: #131620; border-right: 1px solid #232838; display: flex; flex-direction: column; flex-shrink: 0; }
        #sidebar-header { padding: 14px; border-bottom: 1px solid #232838; background: #0f1118; display: flex; flex-direction: column; gap: 10px; }
        .header-top { display: flex; justify-content: space-between; align-items: center; }
        .header-title { font-size: 15px; font-weight: 700; color: #fff; }
        .refresh-btn { background: none; border: none; color: #3b82f6; cursor: pointer; font-size: 12px; font-weight: 600; }
        #search-input { width: 100%; background: #1a1e2b; border: 1px solid #2a3145; padding: 7px 10px; border-radius: 6px; color: #fff; font-size: 12px; outline: none; }
        #search-input:focus { border-color: #3b82f6; }

        /* 一级主频道选项卡 */
        #channel-bar { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
        #channel-bar::-webkit-scrollbar { display: none; }
        .channel-item { flex-shrink: 0; padding: 5px 12px; border-radius: 14px; background: #1f2536; font-size: 12px; color: #94a3b8; cursor: pointer; transition: all 0.2s; font-weight: 500; }
        .channel-item:hover { color: #fff; background: #283045; }
        .channel-item.active { background: #2563eb; color: #fff; font-weight: 600; }

        /* 二级排序分类 (最热、最新、最多喜欢) */
        #sort-bar { display: flex; gap: 8px; align-items: center; padding: 4px 2px; }
        .sort-item { padding: 3px 10px; border-radius: 6px; background: #181b26; border: 1px solid #252c3d; font-size: 11px; color: #94a3b8; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 4px; }
        .sort-item:hover { background: #22293a; color: #fff; }
        .sort-item.active { background: #3730a3; border-color: #4f46e5; color: #fff; font-weight: 600; }

        #drama-list { flex: 1; overflow-y: auto; padding: 8px; }
        .drama-card { display: flex; gap: 10px; padding: 8px; border-radius: 8px; cursor: pointer; transition: all 0.2s; margin-bottom: 6px; background: #1a1e2b; }
        .drama-card:hover, .drama-card.active { background: #262d40; border-left: 4px solid #3b82f6; }
        .drama-card img { width: 62px; height: 82px; border-radius: 6px; object-fit: cover; background: #232838; flex-shrink: 0; }
        .drama-info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; }
        .drama-title { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #fff; }
        .drama-desc { font-size: 11px; color: #94a3b8; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.3; }
        .drama-meta { font-size: 11px; color: #60a5fa; display: flex; justify-content: space-between; align-items: center; }

        /* 主播放区 */
        #main-view { flex: 1; display: flex; flex-direction: column; min-width: 0; height: 100vh; }
        #player-box { flex: 1; min-height: 0; background: #000; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; }
        video { width: 100%; height: 100%; max-height: 100%; object-fit: contain; background: #000; outline: none; }

        /* 底部固定集数栏 */
        #chapter-panel { height: 210px; background: #131620; border-top: 1px solid #232838; display: flex; flex-direction: column; padding: 12px 20px; flex-shrink: 0; z-index: 10; }
        #chapter-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-shrink: 0; }
        #current-drama-title { font-size: 15px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 8px; }
        .badge { background: #2563eb; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 12px; font-weight: normal; }

        .header-actions { display: flex; align-items: center; gap: 14px; }
        .auto-play-label { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #94a3b8; cursor: pointer; user-select: none; }
        .auto-play-label input { cursor: pointer; accent-color: #2563eb; width: 14px; height: 14px; }
        .batch-dl-btn { background: #2563eb; color: #fff; border: none; border-radius: 6px; padding: 6px 14px; font-size: 12px; cursor: pointer; font-weight: 600; transition: background 0.2s; }
        .batch-dl-btn:hover { background: #1d4ed8; }

        #chapter-grid { flex: 1; display: flex; gap: 10px; overflow-x: auto; padding-bottom: 6px; align-items: stretch; scroll-behavior: smooth; }
        #chapter-grid::-webkit-scrollbar { height: 6px; }
        #chapter-grid::-webkit-scrollbar-thumb { background: #2a3149; border-radius: 3px; }
        .chapter-btn { width: 140px; flex-shrink: 0; padding: 10px; border-radius: 8px; background: #1c202d; border: 1px solid #282f42; color: #cbd5e1; cursor: pointer; display: flex; flex-direction: column; justify-content: space-between; transition: all 0.2s; }
        .chapter-btn:hover { background: #283045; border-color: #3b82f6; }
        .chapter-btn.active { background: #1d4ed8; color: #fff; border-color: #60a5fa; box-shadow: 0 0 10px rgba(59,130,246,0.3); }
        .chapter-title { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .chapter-time { font-size: 11px; color: #94a3b8; margin-top: 2px; }
        .chapter-btn.active .chapter-time { color: #e2e8f0; }
        .dl-btn { margin-top: 6px; padding: 4px 0; font-size: 11px; background: #059669; border: none; border-radius: 4px; color: #fff; cursor: pointer; width: 100%; text-align: center; }
        .dl-btn:hover { background: #10b981; }

        /* App 内置模式：隐藏桌面下载相关入口 */
        body.app-mode .dl-btn,
        body.app-mode #batch-dl,
        body.app-mode .batch-dl-btn { display: none !important; }

        /* ==================== 移动端适配 ==================== */
        /* 播放页全屏返回按钮（默认隐藏，仅移动端显示） */
        .back-btn {
            display: none;
            position: absolute;
            top: calc(10px + env(safe-area-inset-top, 0px));
            left: 10px;
            z-index: 60;
            width: 40px;
            height: 40px;
            border: none;
            border-radius: 50%;
            background: rgba(15, 17, 24, 0.72);
            color: #fff;
            font-size: 30px;
            line-height: 1;
            cursor: pointer;
            align-items: center;
            justify-content: center;
            padding-bottom: 4px;
            -webkit-backdrop-filter: blur(6px);
            backdrop-filter: blur(6px);
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
        }

        /* 窄屏（手机/小平板）：列表页与播放页整屏切换 */
        @media (max-width: 820px) {
            body {
                height: 100vh;
                height: 100dvh;
                overflow: hidden;
            }

            /* 列表页占满整屏 */
            #sidebar {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                width: 100%;
                height: 100vh;
                height: 100dvh;
                z-index: 20;
                border-right: none;
            }

            /* 播放页默认隐藏，选中剧集后整屏显示 */
            #main-view {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                width: 100%;
                height: 100vh;
                height: 100dvh;
                z-index: 30;
                display: none;
                flex-direction: column;
                background: #000;
            }
            body.playing #sidebar { display: none; }
            body.playing #main-view { display: flex; }
            .back-btn { display: flex; }

            #player-box { flex: 1; min-height: 0; height: auto; }

            /* 集数栏自适应 */
            #chapter-panel {
                height: auto;
                flex: 0 0 auto;
                padding: 10px 10px calc(10px + env(safe-area-inset-bottom, 0px));
            }
            #chapter-header { flex-wrap: wrap; gap: 6px 10px; }
            #current-drama-title { flex: 1; min-width: 0; }
            #current-drama-title > span:first-child {
                display: inline-block;
                max-width: 100%;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                vertical-align: middle;
            }
            .header-actions { flex-shrink: 0; gap: 8px; }
            .auto-play-label span { font-size: 11px; }
            .batch-dl-btn { padding: 6px 10px; font-size: 11px; }
            #chapter-grid { gap: 8px; }
            .chapter-btn { width: 126px; }

            /* 列表区域触控优化 */
            #drama-list { padding-bottom: env(safe-area-inset-bottom, 0px); }
            .drama-card { padding: 10px; }
            .drama-card img { width: 80px; height: 106px; }
            .drama-title { font-size: 14px; }
            .drama-desc { font-size: 12px; }
            #search-input { font-size: 14px; padding: 9px 12px; }
            .channel-item { font-size: 13px; padding: 6px 13px; }
            .sort-item { font-size: 12px; padding: 5px 10px; }
        }

        /* 手机横屏：压缩集数栏，给视频更大空间 */
        @media (max-width: 900px) and (orientation: landscape) {
            #chapter-panel { padding: 8px 10px calc(8px + env(safe-area-inset-bottom, 0px)); }
            #chapter-header { margin-bottom: 6px; }
            .chapter-btn { width: 108px; padding: 7px; }
        }
    </style>
</head>
<body>
    <div id="sidebar">
        <div id="sidebar-header">
            <div class="header-top">
                <span class="header-title" id="header-title">🎬 短剧库</span>
                <button class="refresh-btn" onclick="fetchDramas()">刷新</button>
            </div>
            <!-- 一级频道分类 -->
            <div id="channel-bar">
                <div class="channel-item active" onclick="switchChannel('all', this)">全部频道</div>
                <div class="channel-item" onclick="switchChannel('6a928dfedb2cc815f75d7213', this)">黄果原创</div>
                <div class="channel-item" onclick="switchChannel('6a928de7db2cc815f75d720f', this)">成人短剧</div>
                <div class="channel-item" onclick="switchChannel('6a928dccdb2cc815f75d720b', this)">成人漫剧</div>
                <div class="channel-item" onclick="switchChannel('6a928d54db2cc815f75d7201', this)">AI魔改</div>
            </div>
            <!-- 二级排序分类 -->
            <div id="sort-bar">
                <div class="sort-item active" onclick="switchSort('0', this)">🔥 最热</div>
                <div class="sort-item" onclick="switchSort('1', this)">✨ 最新</div>
                <div class="sort-item" onclick="switchSort('6', this)">❤️ 最多喜欢</div>
            </div>
            <input type="text" id="search-input" placeholder="搜索剧名 / 简介..." oninput="handleSearch(this.value)">
        </div>
        <div id="drama-list">加载中...</div>
    </div>

    <div id="main-view">
        <button id="back-btn" class="back-btn" onclick="goBackToList()" aria-label="返回列表">‹</button>
        <div id="player-box">
            <video id="video" controls autoplay playsinline></video>
        </div>
        <div id="chapter-panel">
            <div id="chapter-header">
                <div id="current-drama-title">
                    <span>🎬 请选择一部短剧开始播放</span>
                </div>
                <div class="header-actions">
                    <label class="auto-play-label">
                        <input type="checkbox" id="auto-next-toggle" checked>
                        <span>自动连播下一集</span>
                    </label>
                    <button id="batch-dl" class="batch-dl-btn" style="display:none;" onclick="downloadAll()">⬇️ 一键下载整部剧到桌面</button>
                </div>
            </div>
            <div id="chapter-grid"></div>
        </div>
    </div>

    <script>
        const video = document.getElementById('video');

        // ===== App 内置模式（?app=1）：隐藏仅限电脑端使用的"下载到桌面"功能 =====
        if (/[?&]app=1/.test(location.search)) {
            document.body.classList.add('app-mode');
        }

        let hls = null;
        let currentChannel = 'all';
        let currentSort = '0'; // 0:最热, 1:最新, 6:最多喜欢
        let currentKeyword = '';
        let currentList = [];
        let currentChapters = [];
        let currentDrama = null;
        let currentEpisodeIndex = 0;

        // ===== 移动端适配：列表页与播放页整屏切换 =====
        function isMobileLayout() {
            return window.matchMedia('(max-width: 820px)').matches;
        }

        // 进入播放模式（移动端切换到整屏播放页）
        function enterPlayMode() {
            if (isMobileLayout()) {
                document.body.classList.add('playing');
                window.scrollTo(0, 0);
            }
        }

        // 返回列表（移动端）
        function goBackToList() {
            document.body.classList.remove('playing');
            video.pause();
        }

        video.addEventListener('ended', () => {
            const autoNext = document.getElementById('auto-next-toggle').checked;
            if (!autoNext) return;

            if (currentChapters && currentEpisodeIndex + 1 < currentChapters.length) {
                const nextIdx = currentEpisodeIndex + 1;
                const grid = document.getElementById('chapter-grid');
                const nextBtn = grid.children[nextIdx];
                if (nextBtn) {
                    playChapter(currentChapters[nextIdx], nextBtn, nextIdx);
                    nextBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }
            } else if (currentChapters && currentChapters.length > 0) {
                console.log('本剧已播放完毕！');
            }
        });

        async function fetchDramas() {
            const listEl = document.getElementById('drama-list');
            listEl.innerHTML = '<div style="padding:15px;color:#94a3b8;">正在加载列表...</div>';
            try {
                const res = await fetch(\`/api/dramas?tabId=\${currentChannel}&sortType=\${currentSort}\`);
                const json = await res.json();
                currentList = json.data || [];
                renderFilteredList();

                if (currentList.length > 0 && !currentDrama && !isMobileLayout()) {
                    // 桌面端自动预载第一部；移动端保持列表浏览，由用户点击进入播放
                    selectDrama(currentList[0], listEl.children[0]);
                }
            } catch(e) {
                listEl.innerHTML = '<div style="color:#ef4444;padding:15px;">加载失败: ' + e.message + '</div>';
            }
        }

        function switchChannel(channelId, el) {
            document.querySelectorAll('.channel-item').forEach(t => t.classList.remove('active'));
            if (el) el.classList.add('active');
            currentChannel = channelId;
            fetchDramas();
        }

        function switchSort(sortType, el) {
            document.querySelectorAll('.sort-item').forEach(t => t.classList.remove('active'));
            if (el) el.classList.add('active');
            currentSort = sortType;
            fetchDramas();
        }

        function handleSearch(kw) {
            currentKeyword = (kw || '').trim().toLowerCase();
            renderFilteredList();
        }

        function renderFilteredList() {
            let filtered = currentList;
            if (currentKeyword) {
                filtered = filtered.filter(d =>
                    ((d.title || d.name || '') + (d.summary || '')).toLowerCase().includes(currentKeyword)
                );
            }
            document.getElementById('header-title').innerText = '🎬 短剧库 (' + filtered.length + '部)';

            const listEl = document.getElementById('drama-list');
            listEl.innerHTML = '';
            if (!filtered.length) {
                listEl.innerHTML = '<div style="padding:20px;color:#64748b;text-align:center;">该分类下暂无短剧</div>';
                return;
            }
            filtered.forEach(drama => {
                const el = document.createElement('div');
                el.className = 'drama-card' + (currentDrama && currentDrama.id === drama.id ? ' active' : '');
                el.onclick = () => selectDrama(drama, el);

                const cover = drama.cover || '';
                el.innerHTML = \`
                    <img src="\${cover}" alt="cover" loading="lazy" onerror="this.style.opacity=0.3">
                    <div class="drama-info">
                        <div class="drama-title">\${drama.title || drama.name}</div>
                        <div class="drama-desc">\${drama.summary || '暂无简介'}</div>
                        <div class="drama-meta">
                            <span>\${drama.channelName || ''}</span>
                            <span>\${drama.totalEpisode ? '全 ' + drama.totalEpisode + ' 集' : ''}</span>
                        </div>
                    </div>
                \`;
                listEl.appendChild(el);
            });
        }

        async function selectDrama(drama, cardEl) {
            document.querySelectorAll('.drama-card').forEach(c => c.classList.remove('active'));
            if (cardEl) cardEl.classList.add('active');

            currentDrama = drama;
            enterPlayMode();
            const countStr = drama.totalEpisode ? '全 ' + drama.totalEpisode + ' 集' : '';
            document.getElementById('current-drama-title').innerHTML = \`
                <span>\${drama.title || drama.name}</span>
                \${countStr ? '<span class="badge">' + countStr + '</span>' : ''}
            \`;
            const grid = document.getElementById('chapter-grid');
            grid.innerHTML = '<div style="color:#94a3b8;padding:12px;">加载所有集数中...</div>';

            try {
                const res = await fetch('/api/chapters/' + (drama.id || drama.playletId));
                const json = await res.json();
                currentChapters = json.data || [];

                grid.innerHTML = '';
                document.getElementById('batch-dl').style.display = currentChapters.length ? 'block' : 'none';

                currentChapters.forEach((ch, idx) => {
                    const btn = document.createElement('div');
                    btn.className = 'chapter-btn' + (idx === 0 ? ' active' : '');
                    const epNum = ch.currentEpisode || (idx + 1);
                    const title = ch.title || ('第 ' + epNum + ' 集');
                    const mins = Math.floor((ch.mediaTime || 0) / 60);
                    const secs = (ch.mediaTime || 0) % 60;

                    btn.innerHTML = \`
                        <div>
                            <div class="chapter-title">\${title}</div>
                            <div class="chapter-time">⏱️ \${mins}分\${secs}秒</div>
                        </div>
                        <button class="dl-btn" onclick="event.stopPropagation(); downloadSingle('\${(currentDrama.title || '') + '_' + title}', '\${ch.videoUrl}')">⬇️ 下载此集</button>
                    \`;
                    btn.onclick = () => playChapter(ch, btn, idx);
                    grid.appendChild(btn);
                });

                if (currentChapters.length > 0) {
                    playChapter(currentChapters[0], grid.children[0], 0);
                }
            } catch(e) {
                grid.innerHTML = '<div style="color:#ef4444;padding:12px;">加载集数失败: ' + e.message + '</div>';
            }
        }

        function playChapter(chapter, btnEl, index = 0) {
            currentEpisodeIndex = index;
            document.querySelectorAll('.chapter-btn').forEach(b => b.classList.remove('active'));
            if (btnEl) btnEl.classList.add('active');

            const m3u8Url = '/api/m3u8?videoUrl=' + encodeURIComponent(chapter.videoUrl);

            if (Hls.isSupported()) {
                if (hls) hls.destroy();
                hls = new Hls({
                    debug: false,
                    enableWorker: true
                });
                hls.loadSource(m3u8Url);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(e => console.log('Autoplay blocked:', e)));
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = m3u8Url;
                video.addEventListener('loadedmetadata', () => video.play());
            }
        }

        async function downloadSingle(title, videoUrl) {
            alert('已加入后台下载队列！下载完成后自动保存在你的 Mac 桌面。');
            fetch('/api/download?title=' + encodeURIComponent(title) + '&videoUrl=' + encodeURIComponent(videoUrl));
        }

        async function downloadAll() {
            if (!confirm('确定将本剧所有 ' + currentChapters.length + ' 集全部下载到 Mac 桌面吗？')) return;
            alert('全剧已开始在后台下载，文件将自动存放在你的桌面！');
            for (const ch of currentChapters) {
                const epNum = ch.currentEpisode || '';
                const title = (currentDrama.title || '') + '_' + (ch.title || ('第' + epNum + '集'));
                fetch('/api/download?title=' + encodeURIComponent(title) + '&videoUrl=' + encodeURIComponent(ch.videoUrl));
            }
        }

        fetchDramas();
    </script>
</body>
</html>`);
		return;
	}

	res.writeHead(404);
	res.end('Not Found');
});

function getLANIPs() {
	const nets = require('os').networkInterfaces();
	const ips = [];
	for (const name of Object.keys(nets)) {
		for (const net of nets[name] || []) {
			if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
		}
	}
	return ips;
}

// 监听 0.0.0.0，方便手机通过局域网 IP 访问（同时兼容本机 127.0.0.1）
server.listen(PORT, '0.0.0.0', () => {
	console.log('🎉 短剧中心 Web 控制台已启动');
	console.log(`   ➜ 本机访问: http://127.0.0.1:${PORT}`);
	getLANIPs().forEach(ip => {
		console.log(`   ➜ 手机访问: http://${ip}:${PORT}  （需与电脑连接同一 WiFi）`);
	});
});
