'use strict';
/*
 * 修补 nodejs-mobile-cordova@0.4.3 的 cordova hooks，使其兼容 cordova-android 10.x / cordova 11。
 *
 * 背景（真实报错）：
 *   cordova platform add android 时崩溃：
 *   TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be of type string. Received undefined
 *     at new Api (node_modules/cordova-android/lib/Api.js:65:30)
 *     at patchTargetPlatform (plugins/nodejs-mobile-cordova/install/hooks/both/after-prepare-patch-npm-packages.js:57)
 *
 * 原因：
 *   cordova-android 10.x 的 Api 构造函数签名变为 (platform, platformRootDir, events)，
 *   而这个 2019 年的旧插件 hooks 仍用无参 new platformAPI()，导致 this.root=undefined。
 *   另有 after-prepare-build-node-assets-lists.js 使用了 cordova 11 中已移除的
 *   cordovaLib.cordova_platforms.getPlatformApi('android')。
 *
 * 本脚本在 cordova plugin add 之后、cordova platform add 之前执行：
 *   直接修改 plugins/nodejs-mobile-cordova/install/hooks/ 下已落盘的 hook 文件。
 *   （platform add 时 cordova 发现插件已存在于 plugins/，会直接复用，不再重新下载覆盖。）
 *
 * 用法：node scripts/patch-nodejs-mobile-hooks.js [项目根目录]
 *   不传参数时默认取脚本所在目录的上一级（即仓库根目录）。
 *   也可显式传入项目根目录（例如测试时指向临时工程）。
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const hooksDir = path.join(root, 'plugins', 'nodejs-mobile-cordova', 'install', 'hooks');

const fixes = [
  {
    file: path.join(hooksDir, 'both', 'after-prepare-patch-npm-packages.js'),
    search: 'var platformAPIInstance = new platformAPI();',
    replace: 'var platformAPIInstance = new platformAPI(platform, platformPath);',
    note: 'patchTargetPlatform 内 platformPath 变量已存在'
  },
  {
    file: path.join(hooksDir, 'both', 'after-prepare-native-modules-preference.js'),
    search: 'var platformAPIInstance = new platformAPI();',
    replace: 'var platformAPIInstance = new platformAPI(platform, platformPath);',
    note: 'getPlatformWWWPath 内 platformPath 变量已存在'
  },
  {
    file: path.join(hooksDir, 'android', 'after-prepare-create-macOS-builder-helper.js'),
    search: 'var platformAPIInstance = new platformAPI();',
    replace: 'var platformAPIInstance = new platformAPI(platform, platformPath);',
    note: 'getPlatformWWWPath 内 platformPath 变量已存在'
  },
  {
    file: path.join(hooksDir, 'android', 'after-prepare-build-node-assets-lists.js'),
    search:
      "    var cordovaLib = context.requireCordovaModule('cordova-lib');\n" +
      "    var platformAPI = cordovaLib.cordova_platforms.getPlatformApi('android');",
    replace:
      "    var platformPath = path.join(context.opts.projectRoot, 'platforms', 'android');\n" +
      "    var PlatformApi = require(path.join(platformPath, 'cordova', 'Api'));\n" +
      "    var platformAPI = new PlatformApi('android', platformPath);",
    note: '改用与新 API 签名兼容的构造方式（文件头部已 require path）'
  }
];

let failed = false;
for (const f of fixes) {
  if (!fs.existsSync(f.file)) {
    console.log('[SKIP] 文件不存在: ' + path.relative(root, f.file));
    continue;
  }
  let s = fs.readFileSync(f.file, 'utf8');
  if (!s.includes(f.search)) {
    console.log('[WARN] 未找到待替换文本，可能已修补过: ' + path.relative(root, f.file));
    failed = true;
    continue;
  }
  s = s.replace(f.search, f.replace);
  fs.writeFileSync(f.file, s, 'utf8');
  console.log('[PATCHED] ' + path.relative(root, f.file) + '（' + f.note + '）');
}

if (failed) {
  console.error('存在未匹配项，请检查插件 hooks 文件内容。');
  process.exit(1);
}
console.log('ALL_HOOKS_PATCHED_OK');
