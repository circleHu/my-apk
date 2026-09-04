# 🎬 短剧中心 · Android App（GitHub Actions 云端打包）

本目录是一个 **Cordova + nodejs-mobile** 安卓工程。核心思路：

- App 内嵌一个 Node.js 运行时（`nodejs-mobile` 插件），安装后**在手机本地**启动根目录的 [`短剧播放中心.js`](短剧播放中心.js) 所定义的 Node 服务（监听 `127.0.0.1:8999`）。
- WebView 首屏为 [`www/index.html`](www/index.html) 引导页，轮询 `http://127.0.0.1:8999/api/ping`，服务就绪后自动跳转到完整界面。
- 完整界面即该服务自带的网页，已做移动端适配，并用 `?app=1` 标记隐藏"下载到桌面"等电脑端功能。

> 你**无需**在本机安装 Android Studio / SDK。所有编译都在 GitHub Actions 云端完成，你只需要把本仓库推送到 GitHub。

---

## 一、目录结构

```
.
├── 短剧播放中心.js            # 服务端源码（唯一需要维护的核心文件）
├── config.xml                 # Cordova 工程配置（含明文 http 白名单）
├── package.json
├── scripts/
│   └── patch-nodejs-mobile-hooks.js   # 修补 nodejs-mobile-cordova 插件 hooks（兼容 cordova-android 10 / cordova 11）
├── www/
│   ├── index.html             # 启动引导页（检测本地服务就绪后跳转）
│   └── nodejs-project/
│       ├── main.js            # nodejs-mobile 入口：启动本地 Node 服务
│       └── server.js          # ← 根目录「短剧播放中心.js」的静态副本（必须随仓库提交）
└── .github/workflows/
    └── build-apk.yml          # 云端构建 APK 的工作流（含插件 hooks 修补步骤）
```

> **重要**：`www/nodejs-project/server.js` 是根目录「短剧播放中心.js」的静态副本。修改服务代码后，
> 请同步更新该副本（例如 `copy 短剧播放中心.js www\nodejs-project\server.js`），再提交推送。
> 它与工程一起提交（未加入 gitignore），APK 会直接打包它。

---

## 二、使用步骤（全程无需本地安卓环境）

### 1. 推送代码到 GitHub
电脑上装好 Git，然后在命令行（本目录内）执行：

```bash
git init
git add .
git commit -m "短剧中心 Android App"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

> 若从未建过仓库，可先在 GitHub 网页新建一个空仓库（不要勾选自动生成 README），复制其地址替换上面 URL。

### 2. 触发云端构建
打开 GitHub 仓库 → **Actions** 页面 → 左侧 `Build Android APK` → 右侧 **Run workflow** → 绿色按钮确认。
（push 到 main 也会自动触发一次。）

### 3. 下载 APK
构建成功后（约 10–25 分钟），进入该次运行记录底部 **Artifacts**，下载 `short-drama-apk` 压缩包，解压得到 `android-debug.apk`。

### 4. 安装到手机
把 APK 传到手机（网盘/数据线均可）→ 点击安装 → 系统提示"未知来源"时允许。首次运行约需 1–5 秒等待服务启动，之后进入播放界面。

---

## 三、日常维护（重要）

| 情况 | 做法 |
|---|---|
| 修改了服务代码 | 改根目录 `短剧播放中心.js` → **同步** `copy 短剧播放中心.js www\nodejs-project\server.js` → `git add . && git commit && git push` → Actions 重新构建下载新 APK |
| 接口 TOKEN 过期（报 401/解密失败） | 打开 `短剧播放中心.js` 顶部更新 `TOKEN`/密钥 → 同步副本 → 重新推送构建 |
| 想要正式安装包 | 后续可在 workflow 中增加 `assembleRelease` + 签名配置 |

---

## 四、已知限制

- App 在手机本地跑 Node 服务，但**播放源与封面来自外网接口，手机仍需联网（4G/5G/WiFi）**。
- "下载到桌面"功能在安卓上无意义，App 内已隐藏（`?app=1`）。
- APK 约 30–60MB（内嵌 Node 运行时），Debug 包首次安装提示未知来源属正常。
- 首次构建 Actions 会下载 Cordova / nodejs-mobile 依赖，耗时较长，属正常现象。
