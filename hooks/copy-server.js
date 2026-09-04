// 构建前钩子（before_prepare）：
// 将仓库根目录的「短剧播放中心.js」复制为 www/nodejs-project/server.js，
// 保证打进 APK 的始终是根目录最新维护的服务代码。
'use strict';

const fs = require('fs');
const path = require('path');

module.exports = function (context) {
    const projectRoot = context.opts.projectRoot;
    const src = path.join(projectRoot, '短剧播放中心.js');
    const dest = path.join(projectRoot, 'www', 'nodejs-project', 'server.js');

    if (!fs.existsSync(src)) {
        console.error('[copy-server] 未找到根目录「短剧播放中心.js」，跳过复制（后续依赖它的运行会失败）。');
        return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log('[copy-server] 已同步 短剧播放中心.js -> www/nodejs-project/server.js');
};
