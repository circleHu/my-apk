// nodejs-mobile 项目入口：App 每次启动时执行本文件，
// 负责把根目录 短剧播放中心.js 的服务在本机 8999 端口跑起来。
var nodejs = require('nodejs-mobile').startProject();

nodejs.channel.setListener(function (msg) {
    if (msg && typeof msg === 'object' && msg.event === 'stdout') {
        console.log('[Node服务] ' + msg.data);
    }
});
