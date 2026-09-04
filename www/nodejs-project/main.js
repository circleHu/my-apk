// nodejs-mobile Node 线程入口（该文件运行在 App 内置的 Node 运行时中）。
// 直接加载根目录复制过来的 server.js —— 它在顶层即调用 server.listen(8999)，
// 因此本文件被 UI 端 startProject() 启动后，服务即在手机本地 127.0.0.1:8999 开始监听。
'use strict';

try {
    require('./server.js');
    console.log('[Node] server.js 已加载，服务应已在 8999 端口监听。');
} catch (err) {
    console.error('[Node] 服务启动失败: ' + ((err && err.stack) || err));
    if (typeof nodejs !== 'undefined' && nodejs.channel) {
        nodejs.channel.postMessage({ event: 'error', data: String((err && err.stack) || err) });
    }
}
