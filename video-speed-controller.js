// ==UserScript==
// @name         视频倍速播放增强版
// @name:en      Enhanced Video Speed Controller
// @namespace    http://tampermonkey.net/
// @version      1.6.7
// @description  长按右方向键倍速播放，松开恢复原速。按+/-键调整倍速，按]/[键快速调整倍速，按P键恢复默认速度。上/下方向键调节音量，Shift+上/下箭头 音量增强（超过100%），回车键切换全屏。左/右方向键快退/快进5秒。支持YouTube、Bilibili等大多数视频网站。脚本会自动检测页面中的iframe视频并启用相应控制。
// @description:en  Hold right arrow key for speed playback, release to restore. Press +/- to adjust speed, press ]/[ for quick speed adjustment, press P to restore default speed. Up/Down arrows control volume, Shift+Up/Down for volume boost (beyond 100%), Enter toggles fullscreen. Left/Right arrows for 5s rewind/forward. Supports most sites. The script automatically detects iframe videos on the page and enables control.
// @author       ternece
// @license      MIT
// @match        *://*.youtube.com/*
// @match        *://*.bilibili.com/video/*
// @match        *://*/*
// @exclude      *://live.bilibili.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=greasyfork.org
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @downloadURL https://update.greasyfork.org/scripts/525065/%E8%A7%86%E9%A2%91%E5%80%8D%E9%80%9F%E6%92%AD%E6%94%BE%E5%A2%9E%E5%BC%BA%E7%89%88.user.js
// @updateURL https://update.greasyfork.org/scripts/525065/%E8%A7%86%E9%A2%91%E5%80%8D%E9%80%9F%E6%92%AD%E6%94%BE%E5%A2%9E%E5%BC%BA%E7%89%88.meta.js
// ==/UserScript==

(function () {
    "use strict";

    // 默认设置
    const DEFAULT_SETTINGS = {
        defaultRate: 1.0,    // 默认播放速度
        targetRate: 2.5,     // 长按右键时的倍速
        quickRateStep: 0.5,  // 按[]键调整速度的步长
        targetRateStep: 0.5, // 按 +/- 键调整目标倍速的步长
        logLevel: 2,         // 默认日志级别 (WARN)
        volumeBoostMax: 4.0, // 音量增强倍率上限
        volumeBoostStep: 0.1 // 音量增强调整步长
    };

    // 通用配置
    const CONFIG = {
        SEEK_STEP_SECONDS: 5,           // 快进/快退的秒数
        VOLUME_STEP: 0.1,               // 音量调整步长
        DEFAULT_FPS: 30,                // 默认视频帧率 (用于逐帧操作)
        SHORT_PRESS_MAX_COUNT: 3,       // 短按判断的按键计数阈值

        // 超时与延迟
        INIT_RETRY_DELAY: 5000,         // 初始化重试延迟
        URL_CHANGE_INIT_DELAY: 1000,    // URL 变化后初始化延迟
        WAIT_FOR_VIDEO_TIMEOUT: 10000,  // 等待视频元素超时时间

        // 数值限制
        MAX_RATE: 16,                   // 最大允许的播放速度
        MAX_QUICK_RATE_STEP: 3,         // "快速调速步长"的最大值
        VOLUME_BOOST_MIN: 1.0           // 音量增强最小值（即原始音量）
    };

    // 特定网站的配置
    const SITE_SPECIFIC_CONFIG = {
        'youtube.com': {
            mainVideoSelector: '.html5-main-video',
            fullscreenButtonSelector: '.ytp-fullscreen-button'
        },
        'bilibili.com': {
            // 宽度大于400px通常是主播放器
            mainVideoPredicate: video => video.getBoundingClientRect().width > 400,
            // 新版 '.bpx-player-ctrl-full', 旧版 '.bilibili-player-video-btn-fullscreen'
            fullscreenButtonSelector: '.bpx-player-ctrl-full, .bilibili-player-video-btn-fullscreen'
        }
    };

    // 日志级别定义
    const LOG_LEVELS = Object.freeze({
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        NONE: 4
    });

    const LOG_LEVEL_NAMES = Object.freeze({
        0: 'DEBUG (全部)',
        1: 'INFO (信息)',
        2: 'WARN (警告)',
        3: 'ERROR (错误)',
        4: 'NONE (关闭)'
    });

    // 日志模块
    const Logger = (function() {
        let currentLevel = GM_getValue('logLevel', DEFAULT_SETTINGS.logLevel);
        const PREFIX = '[视频倍速控制器]';

        return {
            setLevel(level) {
                if (level >= 0 && level <= 4) {
                    currentLevel = level;
                    GM_setValue('logLevel', level);
                }
            },
            getLevel() { return currentLevel; },
            debug(...args) { if (currentLevel <= LOG_LEVELS.DEBUG) console.log(PREFIX, ...args); },
            info(...args) { if (currentLevel <= LOG_LEVELS.INFO) console.log(PREFIX, ...args); },
            warn(...args) { if (currentLevel <= LOG_LEVELS.WARN) console.warn(PREFIX, ...args); },
            error(...args) { if (currentLevel <= LOG_LEVELS.ERROR) console.error(PREFIX, ...args); }
        };
    })();

    // 显示通知 (保留在外部，因为它依赖 GM_notification)
    function showNotification(message) {
        if (typeof GM_notification !== 'undefined') {
            GM_notification({
                text: message,
                title: '视频倍速控制器',
                timeout: 3000
            });
        } else {
            // 如果 GM_notification 不可用，则使用浮动消息作为备用
            showFloatingMessage(message);
        }
    }

    // 显示浮动提示 - 单例模式，避免高频调用时闪烁
    const showFloatingMessage = (function() {
        let el = null;
        let timer = null;
        return function(msg) {
            if (!el) {
                el = document.createElement("div");
                Object.assign(el.style, {
                    position: "fixed", top: "10px", left: "50%", transform: "translateX(-50%)",
                    backgroundColor: "rgba(0, 0, 0, 0.8)", color: "white", padding: "8px 16px",
                    borderRadius: "4px", zIndex: "10000", fontFamily: "Arial, sans-serif",
                    fontSize: "14px", transition: "opacity 0.2s ease-out", opacity: "0", pointerEvents: "none"
                });
                document.body.appendChild(el);
            }
            el.textContent = msg;
            el.style.opacity = "1";
            clearTimeout(timer);
            timer = setTimeout(() => { el.style.opacity = "0"; }, 2000);
        };
    })();

    // 显示域名管理弹窗（分层级）
    function showDomainManager(groups, controller) {
        // 如果在iframe中运行，不显示弹窗（避免与主页面重复）
        if (window.self !== window.top) {
            showFloatingMessage('此功能仅在主页面可用');
            return;
        }

        // 创建遮罩层
        const overlay = document.createElement("div");
        overlay.style.position = "fixed";
        overlay.style.top = "0";
        overlay.style.left = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
        overlay.style.zIndex = "10001";
        overlay.style.display = "flex";
        overlay.style.justifyContent = "center";
        overlay.style.alignItems = "center";

        // 创建弹窗容器
        const modal = document.createElement("div");
        modal.style.backgroundColor = "white";
        modal.style.borderRadius = "8px";
        modal.style.padding = "0";
        modal.style.maxWidth = "700px";
        modal.style.width = "90%";
        modal.style.maxHeight = "80vh";
        modal.style.boxShadow = "0 4px 20px rgba(0, 0, 0, 0.3)";
        modal.style.display = "flex";
        modal.style.flexDirection = "column";

        // 创建弹窗头部
        const header = document.createElement("div");
        header.style.padding = "20px";
        header.style.borderBottom = "1px solid #eee";
        header.style.display = "flex";
        header.style.justifyContent = "space-between";
        header.style.alignItems = "center";
        header.style.backgroundColor = "#f8f9fa";
        header.style.borderTopLeftRadius = "8px";
        header.style.borderTopRightRadius = "8px";

        const title = document.createElement("h2");
        title.textContent = `已启用的网站 (${groups.length})`;
        title.style.margin = "0";
        title.style.fontSize = "18px";
        title.style.fontWeight = "600";
        title.style.color = "#333";

        const buttonContainer = document.createElement("div");
        buttonContainer.style.display = "flex";
        buttonContainer.style.gap = "10px";

        // 一键清空按钮
        const clearAllBtn = document.createElement("button");
        clearAllBtn.textContent = "清空所有";
        clearAllBtn.style.padding = "8px 16px";
        clearAllBtn.style.backgroundColor = "#dc3545";
        clearAllBtn.style.color = "white";
        clearAllBtn.style.border = "none";
        clearAllBtn.style.borderRadius = "4px";
        clearAllBtn.style.cursor = "pointer";
        clearAllBtn.style.fontSize = "14px";
        clearAllBtn.style.fontWeight = "500";
        clearAllBtn.onmouseover = () => {
            clearAllBtn.style.backgroundColor = "#c82333";
        };
        clearAllBtn.onmouseout = () => {
            clearAllBtn.style.backgroundColor = "#dc3545";
        };
        clearAllBtn.onclick = () => {
            if (confirm("确定要清空所有临时启用的网站吗？\n\n注意：YouTube 和 Bilibili 不会受影响")) {
                controller.tempEnabledDomainGroups = [];
                GM_setValue('tempEnabledDomainGroups', controller.tempEnabledDomainGroups);
                // 🔧 同时清空旧格式数据（如果存在）
                GM_setValue('tempEnabledDomains', []);
                document.body.removeChild(overlay);
                showNotification("✅ 已清空临时启用列表\n请刷新页面");
            }
        };

        // 关闭按钮
        const closeBtn = document.createElement("button");
        closeBtn.textContent = "×";
        closeBtn.style.padding = "8px 12px";
        closeBtn.style.backgroundColor = "transparent";
        closeBtn.style.color = "#666";
        closeBtn.style.border = "none";
        closeBtn.style.borderRadius = "4px";
        closeBtn.style.cursor = "pointer";
        closeBtn.style.fontSize = "24px";
        closeBtn.style.fontWeight = "300";
        closeBtn.style.lineHeight = "1";
        closeBtn.onmouseover = () => {
            closeBtn.style.backgroundColor = "#e9ecef";
        };
        closeBtn.onmouseout = () => {
            closeBtn.style.backgroundColor = "transparent";
        };
        closeBtn.onclick = () => {
            document.body.removeChild(overlay);
        };

        buttonContainer.appendChild(clearAllBtn);
        buttonContainer.appendChild(closeBtn);
        header.appendChild(title);
        header.appendChild(buttonContainer);

        // 创建内容区域
        const content = document.createElement("div");
        content.style.padding = "20px";
        content.style.overflowY = "auto";
        content.style.flex = "1";

        if (groups.length === 0) {
            const emptyMsg = document.createElement("div");
            emptyMsg.textContent = "当前没有临时启用的网站";
            emptyMsg.style.textAlign = "center";
            emptyMsg.style.color = "#999";
            emptyMsg.style.padding = "40px 0";
            emptyMsg.style.fontSize = "16px";
            content.appendChild(emptyMsg);
        } else {
            const groupsList = document.createElement("div");
            groupsList.style.display = "flex";
            groupsList.style.flexDirection = "column";
            groupsList.style.gap = "15px";

            groups.forEach((group, groupIndex) => {
                // 创建主分组容器
                const groupContainer = document.createElement("div");
                groupContainer.style.border = "2px solid #dee2e6";
                groupContainer.style.borderRadius = "8px";
                groupContainer.style.overflow = "hidden";

                // 主域名行
                const mainDomainRow = document.createElement("div");
                mainDomainRow.style.display = "flex";
                mainDomainRow.style.justifyContent = "space-between";
                mainDomainRow.style.alignItems = "center";
                mainDomainRow.style.padding = "15px";
                mainDomainRow.style.backgroundColor = "#e7f3ff";
                mainDomainRow.style.borderBottom = group.iframes.length > 0 ? "1px solid #dee2e6" : "none";

                // 展开/折叠按钮
                const expandBtn = document.createElement("button");
                expandBtn.textContent = group.iframes.length > 0 ? (group.expanded ? '▼' : '▶') : '•';
                expandBtn.style.padding = "4px 8px";
                expandBtn.style.backgroundColor = "transparent";
                expandBtn.style.color = "#0066cc";
                expandBtn.style.border = "none";
                expandBtn.style.borderRadius = "4px";
                expandBtn.style.cursor = group.iframes.length > 0 ? "pointer" : "default";
                expandBtn.style.fontSize = "14px";
                expandBtn.style.fontWeight = "bold";
                expandBtn.disabled = group.iframes.length === 0;
                expandBtn.onclick = () => {
                    group.expanded = !group.expanded;
                    document.body.removeChild(overlay);
                    showDomainManager(groups, controller);
                };

                // 主域名
                const mainDomainSpan = document.createElement("span");
                mainDomainSpan.textContent = `${groupIndex + 1}. ${group.mainDomain}`;
                mainDomainSpan.style.fontFamily = "Monaco, Consolas, monospace";
                mainDomainSpan.style.fontSize = "15px";
                mainDomainSpan.style.fontWeight = "600";
                mainDomainSpan.style.color = "#0066cc";
                mainDomainSpan.style.flex = "1";
                mainDomainSpan.style.marginLeft = "10px";

                // 删除分组按钮
                const deleteGroupBtn = document.createElement("button");
                deleteGroupBtn.textContent = "删除整个分组";
                deleteGroupBtn.style.padding = "6px 12px";
                deleteGroupBtn.style.backgroundColor = "#dc3545";
                deleteGroupBtn.style.color = "white";
                deleteGroupBtn.style.border = "none";
                deleteGroupBtn.style.borderRadius = "4px";
                deleteGroupBtn.style.cursor = "pointer";
                deleteGroupBtn.style.fontSize = "13px";
                deleteGroupBtn.onmouseover = () => {
                    deleteGroupBtn.style.backgroundColor = "#c82333";
                };
                deleteGroupBtn.onmouseout = () => {
                    deleteGroupBtn.style.backgroundColor = "#dc3545";
                };
                deleteGroupBtn.onclick = () => {
                    if (confirm(`确定要删除分组 "${group.mainDomain}" 及其所有iframe域名吗？`)) {
                        controller.deleteDomainGroup(group.mainDomain);
                        document.body.removeChild(overlay);
                        showNotification(`已删除分组：${group.mainDomain}，请刷新页面`);
                    }
                };

                mainDomainRow.appendChild(expandBtn);
                mainDomainRow.appendChild(mainDomainSpan);
                mainDomainRow.appendChild(deleteGroupBtn);

                groupContainer.appendChild(mainDomainRow);

                // iframe域名列表
                if (group.expanded && group.iframes.length > 0) {
                    const iframesContainer = document.createElement("div");
                    iframesContainer.style.backgroundColor = "#f8f9fa";
                    iframesContainer.style.padding = "10px 20px";

                    const iframesList = document.createElement("div");
                    iframesList.style.display = "flex";
                    iframesList.style.flexDirection = "column";
                    iframesList.style.gap = "8px";

                    group.iframes.forEach((iframeDomain, iframeIndex) => {
                        const iframeRow = document.createElement("div");
                        iframeRow.style.display = "flex";
                        iframeRow.style.justifyContent = "space-between";
                        iframeRow.style.alignItems = "center";
                        iframeRow.style.padding = "8px 12px";
                        iframeRow.style.backgroundColor = "white";
                        iframeRow.style.borderRadius = "4px";
                        iframeRow.style.border = "1px solid #dee2e6";

                        const indent = document.createElement("span");
                        indent.textContent = "  └─ ";
                        indent.style.color = "#666";
                        indent.style.fontSize = "14px";

                        const iframeDomainSpan = document.createElement("span");
                        iframeDomainSpan.textContent = iframeDomain;
                        iframeDomainSpan.style.fontFamily = "Monaco, Consolas, monospace";
                        iframeDomainSpan.style.fontSize = "14px";
                        iframeDomainSpan.style.color = "#333";
                        iframeDomainSpan.style.flex = "1";

                        const deleteIframeBtn = document.createElement("button");
                        deleteIframeBtn.textContent = "删除";
                        deleteIframeBtn.style.padding = "4px 10px";
                        deleteIframeBtn.style.backgroundColor = "#ff6b6b";
                        deleteIframeBtn.style.color = "white";
                        deleteIframeBtn.style.border = "none";
                        deleteIframeBtn.style.borderRadius = "4px";
                        deleteIframeBtn.style.cursor = "pointer";
                        deleteIframeBtn.style.fontSize = "12px";
                        deleteIframeBtn.onmouseover = () => {
                            deleteIframeBtn.style.backgroundColor = "#ee5a5a";
                        };
                        deleteIframeBtn.onmouseout = () => {
                            deleteIframeBtn.style.backgroundColor = "#ff6b6b";
                        };
                        deleteIframeBtn.onclick = () => {
                            controller.removeIframeFromGroup(group.mainDomain, iframeDomain);
                            document.body.removeChild(overlay);
                            showNotification(`已从分组中删除：${iframeDomain}，请刷新页面`);
                        };

                        iframeRow.appendChild(indent);
                        iframeRow.appendChild(iframeDomainSpan);
                        iframeRow.appendChild(deleteIframeBtn);
                        iframesList.appendChild(iframeRow);
                    });

                    iframesContainer.appendChild(iframesList);
                    groupContainer.appendChild(iframesContainer);
                }

                groupsList.appendChild(groupContainer);
            });

            content.appendChild(groupsList);
        }

        modal.appendChild(header);
        modal.appendChild(content);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // 点击遮罩层关闭
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        });
    }

    // 通用防抖函数
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func.apply(this, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    class VideoController {
        constructor() {
            // 调试开关
            this.DEBUG = false;
            // 长按判定时间（毫秒）
            this.LONG_PRESS_DELAY = 200; // 长按判定时间（毫秒）

            // 从全局加载配置
            this.config = CONFIG;
            
            // 获取当前网站的特定配置
            this.siteConfig = {};
            for (const domain in SITE_SPECIFIC_CONFIG) {
                if (window.location.hostname.includes(domain)) {
                    this.siteConfig = SITE_SPECIFIC_CONFIG[domain];
                    break;
                }
            }

            // 1. 状态 (State)
            this.settings = {
                defaultRate: GM_getValue('defaultRate', DEFAULT_SETTINGS.defaultRate),
                targetRate: GM_getValue('targetRate', DEFAULT_SETTINGS.targetRate),
                quickRateStep: GM_getValue('quickRateStep', DEFAULT_SETTINGS.quickRateStep),
                targetRateStep: GM_getValue('targetRateStep', DEFAULT_SETTINGS.targetRateStep),
                volumeBoostMax: GM_getValue('volumeBoostMax', DEFAULT_SETTINGS.volumeBoostMax),
                volumeBoostStep: GM_getValue('volumeBoostStep', DEFAULT_SETTINGS.volumeBoostStep)
            };
            // 使用分组数据结构：主域名 -> 包含的iframe域名
            this.tempEnabledDomainGroups = GM_getValue('tempEnabledDomainGroups', []);
            // 🔧 迁移旧数据：将 tempEnabledDomains 迁移到 tempEnabledDomainGroups
            this._migrateOldDomainData();
            this.currentDomain = window.location.hostname;
            this.currentUrl = location.href;
            this.lastManualRateChangeTime = 0;
            this.activeVideo = null;
            this.videoControlButtons = new WeakMap();
            this._videoControlButtonsList = new Set(); // 辅助 Set 用于遍历按钮（WeakMap 不可遍历）
            this.rightKeyTimer = null;
            this.downCount = 0;
            this._keyupCallCount = 0; // 调试：KeyUp调用次数
            this._rightKeyUpHandled = false; // 防止重复处理
            this.originalRate = 1.0;
            this.targetRate = this.settings.targetRate;
            this.currentQuickRate = 1.0;
            this.keyHandlers = {};

            // 监听器和观察器引用
            this.keydownListener = null;
            this.keyupListener = null;
            this.blurListener = null; // Bug2 修复：blur 监听器
            this.visibilityListener = null; // Bug2 修复：visibilitychange 监听器
            this.mainObserver = null; // 合并后的主观察器
            this.videoChangeObserver = null;
            this.fallbackVideoObserver = null; // 后备视频监听器
            this.fallbackPollingTimer = null; // 后备轮询定时器
            this.activeObservers = new Set();

            // Bug5 修复：初始化状态管理
            this._isInitializing = false;
            this._initRetryTimer = null;
            this._urlChangeTimer = null;

            // Bug6 修复：长按判定时间戳
            this._rightKeyDownTime = 0;

            // 音量增强 (Web Audio API)
            this._audioContext = null;
            this._audioNodes = new WeakMap();
            this._currentBoostLevel = 1.0;
            this._boostWarningShown = false;

            // 创建防抖版的视频检测函数
            this.debouncedDetectAndSetupVideos = debounce(this.detectAndSetupVideos.bind(this), 500);

            this._initializeKeyHandlers();
        }

        /**
         * 🔧 迁移旧版本的域名数据到新的分组结构
         * 将 tempEnabledDomains 中的域名迁移到 tempEnabledDomainGroups
         */
        _migrateOldDomainData() {
            const oldDomains = GM_getValue('tempEnabledDomains', []);
            if (oldDomains.length === 0) return;

            // 获取已存在的主域名
            const existingMainDomains = new Set(this.tempEnabledDomainGroups.map(g => g.mainDomain));

            // 将旧数据中未迁移的域名添加为新的分组
            let migrated = false;
            oldDomains.forEach(domain => {
                if (!existingMainDomains.has(domain)) {
                    this.tempEnabledDomainGroups.push({
                        mainDomain: domain,
                        iframes: [],
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        migratedFrom: 'tempEnabledDomains'
                    });
                    migrated = true;
                }
            });

            if (migrated) {
                GM_setValue('tempEnabledDomainGroups', this.tempEnabledDomainGroups);
                // 清空旧数据
                GM_setValue('tempEnabledDomains', []);
                Logger.info('已将旧版域名数据迁移到新的分组结构');
            }
        }

        /**
         * 检测并返回所有跨域 iframe 的域名（包括嵌套 iframe）
         * @returns {Array<string>} 域名数组
         */
        detectCrossOriginIframeDomains() {
            const crossDomainIframes = new Set();

            const allIframes = document.querySelectorAll('iframe');

            const findIframes = (root, depth = 0) => {
                if (depth > 5) return;

                const iframes = root.querySelectorAll('iframe');
                iframes.forEach((iframe, i) => {
                    try {
                        const src = iframe.src;

                        if (src && src.startsWith('http')) {
                            const url = new URL(src);
                            const domain = url.hostname;
                            if (domain && domain !== this.currentDomain) {
                                crossDomainIframes.add(domain);
                            }
                        }

                        // 尝试递归检测嵌套 iframe（仅限同源）
                        if (iframe.contentDocument) {
                            findIframes(iframe.contentDocument, depth + 1);
                        }
                    } catch (e) {
                        // 跨域访问错误，忽略
                    }
                });
            };

            findIframes(document);
            return Array.from(crossDomainIframes);
        }

        /**
         * 创建或更新域名分组
         * @param {string} mainDomain 主域名
         * @param {Array<string>} iframeDomains iframe域名数组
         */
        saveDomainGroup(mainDomain, iframeDomains) {
            // 查找是否已存在该主域名的分组
            const existingIndex = this.tempEnabledDomainGroups.findIndex(g => g.mainDomain === mainDomain);

            if (existingIndex >= 0) {
                // 更新现有分组
                const existingGroup = this.tempEnabledDomainGroups[existingIndex];
                // 合并iframe域名（去重）
                const combinedIframes = [...new Set([...existingGroup.iframes, ...iframeDomains])];
                // 只有当有新的iframe域名时才更新
                if (combinedIframes.length > existingGroup.iframes.length) {
                    this.tempEnabledDomainGroups[existingIndex] = {
                        mainDomain,
                        iframes: combinedIframes,
                        createdAt: existingGroup.createdAt,
                        updatedAt: Date.now()
                    };
                    GM_setValue('tempEnabledDomainGroups', this.tempEnabledDomainGroups);
                }
            } else {
                // 创建新分组
                this.tempEnabledDomainGroups.push({
                    mainDomain,
                    iframes: iframeDomains,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                });
                GM_setValue('tempEnabledDomainGroups', this.tempEnabledDomainGroups);
            }
        }

        /**
         * 删除整个域名分组
         * @param {string} mainDomain 主域名
         */
        deleteDomainGroup(mainDomain) {
            this.tempEnabledDomainGroups = this.tempEnabledDomainGroups.filter(g => g.mainDomain !== mainDomain);
            GM_setValue('tempEnabledDomainGroups', this.tempEnabledDomainGroups);
        }

        /**
         * 从分组中删除单个iframe域名
         * @param {string} mainDomain 主域名
         * @param {string} iframeDomain 要删除的iframe域名
         */
        removeIframeFromGroup(mainDomain, iframeDomain) {
            const group = this.tempEnabledDomainGroups.find(g => g.mainDomain === mainDomain);
            if (group) {
                group.iframes = group.iframes.filter(d => d !== iframeDomain);
                group.updatedAt = Date.now();
                GM_setValue('tempEnabledDomainGroups', this.tempEnabledDomainGroups);
            }
        }

        /**
         * 获取所有启用的域名列表（展平）
         * @returns {Array<string>}
         */
        getAllEnabledDomains() {
            const allDomains = new Set();
            this.tempEnabledDomainGroups.forEach(group => {
                allDomains.add(group.mainDomain);
                group.iframes.forEach(d => allDomains.add(d));
            });
            return Array.from(allDomains);
        }

        // 2. 核心启动与检查逻辑
        start() {
            // 🔧 修复: 只有主页面才注册菜单命令，iframe 中不注册
            const isMainPage = window.self === window.top;

            if (isMainPage) {
                // 核心菜单命令应该总是可用，无论脚本是否已在此网站启用
                this.registerCoreMenuCommands();
            }

            if (!this.shouldEnableScript()) {
                // 如果未启用，则只注册"启用"命令（已在核心中完成），然后返回
                return;
            }

            // 如果已启用，则注册其余的动态菜单命令，并开始初始化
            if (isMainPage) {
                this.registerDynamicMenuCommands();
            }
            this.initialize();
        }

        shouldEnableScript() {
            // 如果在 iframe 中，检查是否有视频或在启用列表中
            if (window.self !== window.top) {
                const hasVideo = document.querySelector('video') !== null;
                if (hasVideo) {
                    return true;
                }
                // 检查当前域名是否在启用列表中
                const allDomains = this.getAllEnabledDomains();
                if (allDomains.includes(this.currentDomain)) {
                    return true;
                }
                return false;
            }

            if (this.currentDomain.includes('youtube.com') ||
                this.currentDomain.includes('bilibili.com')) {
                return true;
            }

            // 检查是否在已启用的分组中
            const allDomains = this.getAllEnabledDomains();
            return allDomains.includes(this.currentDomain);
        }

        // 3. 菜单命令注册
        registerEnableCommand() {
            GM_registerMenuCommand('在当前网站启用视频倍速控制', () => {
                // 🔍 检测所有跨域 iframe 域名
                const crossOriginDomains = this.detectCrossOriginIframeDomains();

                // 💾 保存分组数据
                this.saveDomainGroup(this.currentDomain, crossOriginDomains);

                // 💬 生成提示信息
                if (crossOriginDomains.length > 0) {
                    showNotification(
                        `✅ 已启用：\n` +
                        `主域名: ${this.currentDomain}\n` +
                        `iframe: ${crossOriginDomains.join(', ')}\n\n` +
                        `请刷新页面以生效。`
                    );

                    // 打印详细信息到控制台
                    Logger.debug('域名启用详情:', {
                        主域名: this.currentDomain,
                        跨域iframe域名: crossOriginDomains,
                        已保存的分组: this.tempEnabledDomainGroups
                    });

                } else {
                    showNotification(
                        `✅ 已在 ${this.currentDomain} 启用\n` +
                        `请刷新页面`
                    );
                }
            });
        }

        // 核心菜单命令，应无条件注册
        registerCoreMenuCommands() {
             // 仅在脚本未启用时，才显示"启用"命令
            if (!this.shouldEnableScript()) {
                this.registerEnableCommand();
            }


            GM_registerMenuCommand('查看所有临时启用的网站', () => {
                if (this.tempEnabledDomainGroups.length === 0) {
                    showFloatingMessage('当前没有临时启用的网站');
                } else {
                    // 使用弹窗显示分组列表
                    showDomainManager(this.tempEnabledDomainGroups, this);
                }
            });

            GM_registerMenuCommand('设置日志级别', () => {
                const currentLevel = Logger.getLevel();
                const options = Object.entries(LOG_LEVEL_NAMES)
                    .map(([level, name]) => `${level}: ${name}`)
                    .join('\n');

                const input = prompt(
                    `请选择日志级别 (输入数字 0-4):\n\n${options}\n\n默认: WARN (警告)\n当前: ${LOG_LEVEL_NAMES[currentLevel]}`,
                    currentLevel
                );

                if (input !== null) {
                    const newLevel = parseInt(input, 10);
                    if (!isNaN(newLevel) && newLevel >= 0 && newLevel <= 4) {
                        Logger.setLevel(newLevel);
                        showFloatingMessage(`日志级别已设置为: ${LOG_LEVEL_NAMES[newLevel]}`);
                    } else {
                        showFloatingMessage('无效的日志级别，请输入 0-4 之间的数字');
                    }
                }
            });
        }

        // 动态菜单命令，仅在脚本启用后注册
        registerDynamicMenuCommands() {
            GM_registerMenuCommand('设置默认播放速度', () => this.updateSetting('defaultRate', `请输入默认播放速度 (0.1-${this.config.MAX_RATE})`));
            GM_registerMenuCommand('设置长按右键倍速', () => this.updateSetting('targetRate', `请输入长按右键时的倍速 (0.1-${this.config.MAX_RATE})`));
            GM_registerMenuCommand('设置快速调速步长', () => this.updateSetting('quickRateStep', `请输入按 [ 或 ] 键调整速度的步长 (0.1-${this.config.MAX_QUICK_RATE_STEP})`, this.config.MAX_QUICK_RATE_STEP));
            GM_registerMenuCommand('设置目标倍速调整步长', () => this.updateSetting('targetRateStep', `请输入按 +/- 键调整目标倍速的步长 (0.1-${this.config.MAX_RATE})`));
            GM_registerMenuCommand('设置音量增强上限', () => this.updateSetting('volumeBoostMax', '请输入音量增强倍率上限 (1.0-4.0)', 4.0, 1.0));
            GM_registerMenuCommand('设置音量增强步长', () => this.updateSetting('volumeBoostStep', '请输入音量增强步长 (0.05-0.5)', 0.5, 0.05));

            // 如果当前网站是临时启用的，则提供"移除"选项
            const currentGroup = this.tempEnabledDomainGroups.find(g => g.mainDomain === this.currentDomain);
            if (currentGroup) {
                GM_registerMenuCommand('从临时启用列表中移除当前网站', () => {
                    this.deleteDomainGroup(this.currentDomain);
                    showNotification(`已从临时启用列表中移除 ${this.currentDomain}，请刷新页面`);
                });
            }
        }
        
        updateSetting(key, promptMessage, max = this.config.MAX_RATE, min = 0.1) {
            const newValue = prompt(promptMessage, this.settings[key]);
            if (newValue !== null) {
                const value = parseFloat(newValue);
                if (!isNaN(value) && value >= min && value <= max) {
                    this.settings[key] = value;
                    GM_setValue(key, value);
                    showFloatingMessage(`设置已更新: ${value}`);

                    // Bug4 修复：同步 targetRate 实例变量
                    if (key === 'targetRate') {
                        this.targetRate = value;
                    }

                    if (key === 'defaultRate' && this.activeVideo) {
                        this.activeVideo.playbackRate = value;
                    }
                } else {
                    // 使用浮动消息替代 alert
                    showFloatingMessage(`设置失败: 请输入有效的值 (${min}-${max})`);
                }
            }
        }


        // 4. 初始化流程
        async initialize(isRetry = false) {
            // Bug5 修复：初始化锁，防止并发调用
            if (this._isInitializing) {
                Logger.debug("初始化正在进行中，跳过重复调用");
                return;
            }
            this._isInitializing = true;

            // 清理旧的重试定时器
            if (this._initRetryTimer) {
                clearTimeout(this._initRetryTimer);
                this._initRetryTimer = null;
            }

            // 🔧 修复: 使用专门的重初始化清理，不清除后备监听器
            this._cleanupForReinit();

            try {
                this.activeVideo = await this._findInitialVideo();
                Logger.info("初始化成功, 找到视频:", this.activeVideo);

                // 🔧 修复: 成功初始化后才清除后备监听器
                this._cleanupFallbackObserver();

                this._setupPersistentObservers();
                this.setupEventListeners();
                this.watchUrlChange();

            } catch (error) {
                Logger.warn("初始化尝试失败:", error.message);

                // 仅在首次尝试时启动重试逻辑
                if (!isRetry) {
                    if (error.type === "no_video" || error.type === "timeout") {
                        this._initRetryTimer = setTimeout(() => {
                            this._isInitializing = false; // 重置锁，允许重试
                            this.initialize(true).catch(e => Logger.error("重试初始化失败:", e));
                        }, this.config.INIT_RETRY_DELAY);
                        return; // 不在这里重置 _isInitializing，等待重试
                    }
                } else {
                    // 重试也失败了，设置持续监听器以捕获延迟加载的视频
                    Logger.info("重试失败，准备设置后备监听器...");
                    try {
                        this._setupFallbackVideoObserver();
                    } catch (e) {
                        Logger.error("设置后备监听器时出错:", e);
                    }
                }
            } finally {
                // 只有在不等待重试时才重置锁
                if (!this._initRetryTimer) {
                    this._isInitializing = false;
                }
            }
        }

        /**
         * 专门用于重新初始化的清理方法
         * 不清除后备监听器，保留其继续监听
         */
        _cleanupForReinit() {
            if (this.keydownListener) {
                window.removeEventListener("keydown", this.keydownListener, true);
                if (this.activeVideo) {
                    try {
                        const iframeWindow = this.activeVideo.ownerDocument.defaultView;
                        if (iframeWindow && iframeWindow !== window) {
                            iframeWindow.removeEventListener("keydown", this.keydownListener, true);
                        }
                    } catch(e) {}
                }
                this.keydownListener = null;
            }
            if (this.keyupListener) {
                window.removeEventListener("keyup", this.keyupListener, true);
                if (this.activeVideo) {
                    try {
                        const iframeWindow = this.activeVideo.ownerDocument.defaultView;
                        if (iframeWindow && iframeWindow !== window) {
                            iframeWindow.removeEventListener("keyup", this.keyupListener, true);
                        }
                    } catch(e) {}
                }
                this.keyupListener = null;
            }
            // Bug2 修复：清理 blur/visibilitychange 监听器
            if (this.blurListener) {
                window.removeEventListener('blur', this.blurListener);
                this.blurListener = null;
            }
            if (this.visibilityListener) {
                document.removeEventListener('visibilitychange', this.visibilityListener);
                this.visibilityListener = null;
            }
            this.activeObservers.forEach(observer => observer.disconnect());
            this.activeObservers.clear();
            // 🔧 注意: 不清除后备监听器，让它继续工作直到成功初始化
            this._videoControlButtonsList.forEach(button => button.remove());
            this._videoControlButtonsList.clear();
            this.videoControlButtons = new WeakMap();
            this._cleanupAllAudioNodes();
            this.activeVideo = null;
        }

        async _findInitialVideo() {
            try {
                // 尝试用快速方法找到视频
                const video = await this.waitForVideoElement();
                if (video) {
                    this.detectAndSetupVideos(); // 确保视频设置完成
                    return this.activeVideo || video;
                }
            } catch (error) {
                 // 如果快速方法超时或找不到，则尝试深度查找
                Logger.debug("快速查找失败，尝试深度查找...");
                const deepVideos = this.deepFindVideoElements();
                if (deepVideos.length > 0) {
                    this.setupVideos(deepVideos);
                    showFloatingMessage(`通过深度查找发现了 ${deepVideos.length} 个视频`);
                    return deepVideos[0];
                }
            }

            // 如果所有方法都找不到视频，则抛出错误
            throw { type: "no_video", message: "在页面上找不到任何视频元素。" };
        }

        /**
         * 设置后备视频监听器
         * 在初始化失败后持续监听 DOM，等待延迟加载的视频出现
         */
        _setupFallbackVideoObserver() {
            // 如果已经有后备监听器在运行，不重复创建
            if (this.fallbackVideoObserver) {
                return;
            }

            Logger.info("设置后备视频监听器，等待延迟加载的视频...");

            // 🔧 修复：检测有效视频的函数（不是任意视频）
            const isValidVideo = (video) => {
                const hasSrc = video.src || video.currentSrc;
                const hasSize = video.offsetWidth > 0 || video.offsetHeight > 0;
                const isLoaded = video.readyState >= 1;
                return hasSrc || isLoaded || hasSize;
            };

            // 检测视频并初始化的函数
            const checkAndInit = () => {
                // 🔧 修复：查找有效的视频，而不是任意视频
                const videos = document.querySelectorAll('video');
                const validVideo = Array.from(videos).find(isValidVideo);

                if (validVideo) {
                    Logger.info("后备监听器检测到有效视频:", validVideo.className || validVideo.id,
                        `(src:${!!(validVideo.src || validVideo.currentSrc)}, size:${validVideo.offsetWidth}x${validVideo.offsetHeight}, readyState:${validVideo.readyState})`);
                    this._cleanupFallbackObserver();
                    this.initialize().catch(e => Logger.error("后备初始化失败:", e));
                    return true;
                }
                return false;
            };

            // 方法1：MutationObserver 监听 DOM 变化
            this.fallbackVideoObserver = new MutationObserver((mutations) => {
                // 检查是否有新的 video 元素
                let foundVideo = false;

                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (node.tagName === 'VIDEO') {
                            foundVideo = true;
                            break;
                        }
                        if (node.querySelector && node.querySelector('video')) {
                            foundVideo = true;
                            break;
                        }
                    }
                    if (foundVideo) break;
                }

                if (foundVideo) {
                    checkAndInit();
                }
            });

            this.fallbackVideoObserver.observe(document.body, {
                childList: true,
                subtree: true
            });

            // 方法2：定时轮询作为兜底（某些网站的视频加载方式可能无法被 MutationObserver 捕获）
            this.fallbackPollingTimer = setInterval(() => {
                if (checkAndInit()) {
                    // 成功找到视频，清理定时器
                    clearInterval(this.fallbackPollingTimer);
                    this.fallbackPollingTimer = null;
                }
            }, 1000); // 每秒检查一次

            // 立即检查一次当前页面是否有视频
            if (checkAndInit()) {
                return;
            }
        }

        /**
         * 清理后备监听器
         */
        _cleanupFallbackObserver() {
            if (this.fallbackVideoObserver) {
                this.fallbackVideoObserver.disconnect();
                this.fallbackVideoObserver = null;
            }
            if (this.fallbackPollingTimer) {
                clearInterval(this.fallbackPollingTimer);
                this.fallbackPollingTimer = null;
            }
        }

        _setupPersistentObservers() {
            // 1. 合并 videoObserver 和 urlObserver, 并优化回调
            this.mainObserver = new MutationObserver((mutations) => {
                // 优先检查 URL 变化，因为它更轻量
                if (location.href !== this.currentUrl) {
                    this.handleUrlChange();
                    // URL 变化通常意味着页面重载或切换，此时可以先返回，等待 initialize
                    return;
                }

                // 检查 DOM 变动
                mutations.forEach(mutation => {
                    // 垃圾回收：检查是否有被管理的视频被移除了
                    mutation.removedNodes.forEach(removedNode => {
                        // 检查被移除的节点本身或者其子节点是否是我们正在管理的视频
                        const videosToRemove = [];
                        if (this.videoControlButtons.has(removedNode)) {
                            videosToRemove.push(removedNode);
                        } else if (removedNode.querySelectorAll) {
                            removedNode.querySelectorAll('video').forEach(video => {
                                if (this.videoControlButtons.has(video)) {
                                    videosToRemove.push(video);
                                }
                            });
                        }

                        videosToRemove.forEach(video => {
                             Logger.debug("垃圾回收：清理被移除的视频", video);
                             const button = this.videoControlButtons.get(video);
                             if (button) {
                                 button.remove();
                                 this._videoControlButtonsList.delete(button);
                             }
                             // WeakMap 条目会随视频 GC 自动清理，但主动删除更及时
                             this._disconnectAudioNodes(video);
                             if (this.activeVideo === video) {
                                 this.activeVideo = null;
                             }
                        });
                    });

                    // Bug10 修复：增量扫描新增节点，而非全量扫描
                    const newVideos = [];
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType !== Node.ELEMENT_NODE) return;
                        if (node.tagName === 'VIDEO') {
                            newVideos.push(node);
                        } else if (node.querySelectorAll) {
                            node.querySelectorAll('video').forEach(v => newVideos.push(v));
                        }
                    });
                    if (newVideos.length > 0) {
                         Logger.debug("增量检测到新视频:", newVideos.length);
                         this.debouncedDetectAndSetupVideos();
                    }
                });
            });
            this.mainObserver.observe(document.body, { childList: true, subtree: true });
            this.activeObservers.add(this.mainObserver);

            // 2. 观察当前视频的父节点，以便在视频被替换时重新初始化 (保留)
            if (this.activeVideo && this.activeVideo.parentElement) {
                this.videoChangeObserver = new MutationObserver((mutations) => {
                    const videoWasRemoved = mutations.some(m => Array.from(m.removedNodes).some(n => n === this.activeVideo));
                    if (videoWasRemoved) {
                        Logger.debug("侦测到当前活动视频节点被移除，将重新初始化...");
                        this.initialize().catch(e => Logger.error("视频移除后重新初始化失败:", e));
                    }
                });
                this.videoChangeObserver.observe(this.activeVideo.parentElement, { childList: true });
                this.activeObservers.add(this.videoChangeObserver);
            }
        }

        // 5. 清理与监听
        cleanup() {
            if (this.keydownListener) {
                window.removeEventListener("keydown", this.keydownListener, true);

                // 清理 iframe 内的监听器
                if (this.activeVideo) {
                    try {
                        const iframeWindow = this.activeVideo.ownerDocument.defaultView;
                        if (iframeWindow && iframeWindow !== window) {
                            iframeWindow.removeEventListener("keydown", this.keydownListener, true);
                        }
                    } catch(e) {
                        // iframe 可能已被销毁，忽略错误
                    }
                }

                this.keydownListener = null;
            }
            if (this.keyupListener) {
                window.removeEventListener("keyup", this.keyupListener, true);

                // 清理 iframe 内的监听器
                if (this.activeVideo) {
                    try {
                        const iframeWindow = this.activeVideo.ownerDocument.defaultView;
                        if (iframeWindow && iframeWindow !== window) {
                            iframeWindow.removeEventListener("keyup", this.keyupListener, true);
                        }
                    } catch(e) {
                        // iframe 可能已被销毁，忽略错误
                    }
                }

                this.keyupListener = null;
            }
            // Bug2 修复：清理 blur/visibilitychange 监听器
            if (this.blurListener) {
                window.removeEventListener('blur', this.blurListener);
                this.blurListener = null;
            }
            if (this.visibilityListener) {
                document.removeEventListener('visibilitychange', this.visibilityListener);
                this.visibilityListener = null;
            }
            this.activeObservers.forEach(observer => observer.disconnect());
            this.activeObservers.clear();
            this._cleanupFallbackObserver();
            this._videoControlButtonsList.forEach(button => button.remove());
            this._videoControlButtonsList.clear();
            this.videoControlButtons = new WeakMap();
            this._cleanupAllAudioNodes();
            this.activeVideo = null;
        }

        handleUrlChange() {
            this.currentUrl = location.href;
            Logger.info("URL发生变化，重新初始化...");

            // Bug5 修复：防抖处理，清理旧的 URL 变化定时器
            if (this._urlChangeTimer) {
                clearTimeout(this._urlChangeTimer);
            }

            this._urlChangeTimer = setTimeout(() => {
                this._urlChangeTimer = null;
                this._isInitializing = false; // 重置锁，允许新初始化
                this.initialize().catch(e => Logger.error("URL变化后初始化失败:", e));
            }, this.config.URL_CHANGE_INIT_DELAY);
        }

        watchUrlChange() {
            // 防止重复注册
            if (this._urlWatcherRegistered) {
                return;
            }
            this._urlWatcherRegistered = true;

            // MutationObserver 的部分已合并到 mainObserver 中
            // 这里只处理 History API 的监听

            const handleStateChange = this.handleUrlChange.bind(this);

            // 使用 History API 监听
            const originalPushState = history.pushState;
            const self = this;
            history.pushState = function() {
                originalPushState.apply(this, arguments);
                handleStateChange();
            };

            const originalReplaceState = history.replaceState;
            history.replaceState = function() {
                originalReplaceState.apply(this, arguments);
                handleStateChange();
            };

            window.addEventListener('popstate', handleStateChange);
        }


        // 6. 事件监听器设置
        setupEventListeners() {
            this.keydownListener = this.handleKeyDown.bind(this);
            this.keyupListener = this.handleKeyUp.bind(this);
            window.addEventListener("keydown", this.keydownListener, true);
            window.addEventListener("keyup", this.keyupListener, true);

            // Bug2 修复：添加 blur/visibilitychange 监听器，失焦时恢复速度
            this.blurListener = this._resetSpeedOnBlur.bind(this);
            this.visibilityListener = this._resetSpeedOnBlur.bind(this);
            window.addEventListener('blur', this.blurListener);
            document.addEventListener('visibilitychange', this.visibilityListener);

            // 如果视频在 iframe 中，也在 iframe 内设置监听
            if (this.activeVideo) {
                try {
                    const iframeWindow = this.activeVideo.ownerDocument.defaultView;
                    if (iframeWindow && iframeWindow !== window) {
                        iframeWindow.addEventListener("keydown", this.keydownListener, true);
                        iframeWindow.addEventListener("keyup", this.keyupListener, true);
                    }
                } catch(e) {
                    // 忽略跨域错误
                }
            }
        }

        /**
         * Bug2 修复：失焦或页面不可见时强制恢复播放速度
         */
        _resetSpeedOnBlur() {
            // 如果正在长按状态，强制恢复速度
            if (this.rightKeyTimer || this.downCount > 0 || this._rightKeyDownTime > 0) {
                clearTimeout(this.rightKeyTimer);
                this.rightKeyTimer = null;
                this.downCount = 0;
                this._rightKeyDownTime = 0;
                if (this.activeVideo && this.originalRate) {
                    this.activeVideo.playbackRate = this.originalRate;
                    Logger.debug("失焦时恢复播放速度:", this.originalRate);
                }
            }
        }

        // 7. 视频查找与设置
        waitForVideoElement() {
            return new Promise((resolve, reject) => {
                const maxAttempts = 20;
                let attempts = 0;
                const check = () => {
                    const video = this.detectAndSetupVideos();
                    if (video) {
                        observer.disconnect();
                        resolve(video);
                    } else if (++attempts >= maxAttempts) {
                        observer.disconnect();
                        reject({ type: "no_video" });
                    }
                };
                const observer = new MutationObserver(check);
                observer.observe(document.body, { childList: true, subtree: true });
                this.activeObservers.add(observer);
                check(); // 立即检查
                setTimeout(() => {
                    observer.disconnect();
                    reject({ type: "timeout" });
                }, this.config.WAIT_FOR_VIDEO_TIMEOUT);
            });
        }
        
        deepFindVideoElements() {
            const foundVideos = new Set();
            const find = (element, depth = 0) => {
                if (depth > 10) return;
                if (element.tagName === 'VIDEO') {
                    foundVideos.add(element);
                }
                if (element.shadowRoot) find(element.shadowRoot, depth + 1);
                if (element.contentDocument) find(element.contentDocument, depth + 1);
                Array.from(element.children || []).forEach(child => find(child, depth + 1));
            };
            find(document.body);

            // 过滤掉无效的视频元素
            const validVideos = Array.from(foundVideos).filter(video => {
                const hasSrc = video.src || video.currentSrc;
                const hasSize = video.offsetWidth > 0 || video.offsetHeight > 0;
                const isLoaded = video.readyState >= 1;
                return hasSrc || isLoaded || hasSize;
            });

            Logger.debug(`深度查找完成，共找到 ${validVideos.length} 个有效视频元素（原始 ${foundVideos.size} 个）`);
            return validVideos.length > 0 ? validVideos : Array.from(foundVideos);
        }
        
        detectAndSetupVideos() {
            const videos = this.findAllVideos();
            if (videos.length === 0) return null;
            this.setupVideos(videos);
            return this.activeVideo || videos[0];
        }

        findAllVideos() {
            const allVideos = new Set(document.querySelectorAll('video'));
            const MAX_DEPTH = 3; // Bug10 修复：限制遍历深度，避免性能抖动

            const findIn = (root, depth = 0) => {
                if (depth > MAX_DEPTH) return;
                try {
                    root.querySelectorAll('video').forEach(v => allVideos.add(v));
                    root.querySelectorAll('iframe').forEach(f => {
                         try {
                            if (f.contentDocument) findIn(f.contentDocument, depth + 1);
                         } catch(e) {/* cross-origin */}
                    });
                    // 只在浅层检查 shadowRoot（深层嵌套的 shadowRoot 场景较少）
                    if (depth < 2) {
                        root.querySelectorAll('*').forEach(el => {
                            if (el.shadowRoot) findIn(el.shadowRoot, depth + 1);
                        });
                    }
                } catch(e) {/* ignore */}
            };
            findIn(document);

            // 过滤掉无效的视频元素（无 src、尺寸为 0、未加载）
            const validVideos = Array.from(allVideos).filter(video => {
                const hasSrc = video.src || video.currentSrc;
                const hasSize = video.offsetWidth > 0 || video.offsetHeight > 0;
                const isLoaded = video.readyState >= 1;
                return hasSrc || isLoaded || hasSize;
            });

            // 如果过滤后没有有效视频，返回原始列表（兜底）
            return validVideos.length > 0 ? validVideos : Array.from(allVideos);
        }

        /**
         * 检查视频元素是否有效（可控制）
         */
        _isValidVideo(video) {
            if (!video) return false;
            const hasSrc = video.src || video.currentSrc;
            const hasSize = video.offsetWidth > 0 || video.offsetHeight > 0;
            const isLoaded = video.readyState >= 1;
            return hasSrc || hasSize || isLoaded;
        }

        setupVideos(videos) {
            // 检查当前 activeVideo 是否有效，如果无效则允许替换
            const currentActiveValid = this._isValidVideo(this.activeVideo);

            if (videos.length === 1) {
                const video = videos[0];
                const videoIsValid = this._isValidVideo(video);

                // 如果新视频有效，且（没有activeVideo 或 当前activeVideo无效），则替换
                if (videoIsValid && (!this.activeVideo || !currentActiveValid)) {
                    this.activeVideo = video;
                    this.setDefaultRate(video);
                } else if (!videoIsValid && (video.src || video.currentSrc)) {
                    // 视频有 src 但还没加载好，监听 loadedmetadata
                    const onLoaded = () => {
                        video.removeEventListener('loadedmetadata', onLoaded);
                        if (!this._isValidVideo(this.activeVideo)) {
                            this.activeVideo = video;
                            this.setDefaultRate(video);
                        }
                    };
                    video.addEventListener('loadedmetadata', onLoaded);
                }
            } else if (videos.length > 1) {
                // 对于配置了特定规则的网站，进行主视频判断
                if (this.siteConfig.mainVideoSelector || this.siteConfig.mainVideoPredicate) {
                     if (!this.activeVideo || !videos.includes(this.activeVideo)) {
                        let mainVideo;
                        // 优先使用 predicate 函数判断
                        if (this.siteConfig.mainVideoPredicate) {
                             mainVideo = videos.find(this.siteConfig.mainVideoPredicate);
                        }
                        // 如果没有找到，再使用选择器判断
                        if (!mainVideo && this.siteConfig.mainVideoSelector) {
                            mainVideo = videos.find(v => v.matches(this.siteConfig.mainVideoSelector));
                        }
                         // 如果还是没有，则找一个未暂停的作为补充
                        if (!mainVideo) {
                             mainVideo = videos.find(v => !v.paused);
                        }

                        this.activeVideo = mainVideo || videos[0];
                        this.setDefaultRate(this.activeVideo);
                    }
                } else {
                    // 其他网站，创建控制按钮
                    videos.forEach((video, index) => {
                        const videoIsValid = this._isValidVideo(video);
                        if (!this.videoControlButtons.has(video) && videoIsValid) {
                            this.createVideoControlButton(video, index + 1);
                            this.setDefaultRate(video);
                            // 如果没有 activeVideo 或当前 activeVideo 无效，则设置
                            if (!this.activeVideo || !this._isValidVideo(this.activeVideo)) {
                                this.activeVideo = video;
                            }
                        }
                    });
                }
            }
        }
        
        setDefaultRate(video) {
            if (Date.now() - this.lastManualRateChangeTime > 5000) {
                video.playbackRate = this.settings.defaultRate;
            }
        }

        createVideoControlButton(video, index) {
            // 检查是否已存在按钮，避免重复创建
            if (this.videoControlButtons.has(video)) {
                return;
            }

            // 创建圆形标签（24px，纯圆形无文字设计）
            const button = document.createElement('div');
            Object.assign(button.style, {
                position: 'absolute',
                top: '10px',
                left: '10px',
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                userSelect: 'none',
                zIndex: '9999'
            });

            // 悬停效果
            button.addEventListener('mouseenter', (e) => {
                // 如果已激活，不显示提示
                if (button.classList.contains('active')) {
                    return;
                }

                // 悬停时放大
                button.style.transform = 'scale(1.3)';
                button.style.background = 'rgba(255, 255, 255, 0.25)';
                button.style.borderColor = 'rgba(255, 255, 255, 0.5)';

                // 显示 tooltip
                this.showTooltip(button, '选择视频');
            });

            button.addEventListener('mouseleave', () => {
                if (!button.classList.contains('active')) {
                    button.style.transform = 'scale(1)';
                    button.style.background = 'rgba(255, 255, 255, 0.15)';
                    button.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                }
            });

            // 点击切换事件
            button.addEventListener('click', (e) => {
                e.stopPropagation(); // 防止触发视频播放
                this.switchActiveVideo(video, button);
            });

            // 如果是当前活动视频，设为激活状态
            if (!this.activeVideo) {
                this.activeVideo = video;
                this.setActiveButton(button);
            } else if (video === this.activeVideo) {
                this.setActiveButton(button);
            }

            // 获取父容器
            const container = video.parentElement || document.body;
            const computedStyle = window.getComputedStyle(container);
            if (computedStyle.position === 'static') {
                container.style.position = 'relative';
            }

            // 添加到DOM
            container.appendChild(button);
            this.videoControlButtons.set(video, button);
            this._videoControlButtonsList.add(button);
        }

        /**
         * 显示 tooltip 提示
         * @param {HTMLElement} target 目标元素
         * @param {string} text 提示文字
         */
        showTooltip(target, text) {
            const tooltip = document.createElement('div');
            Object.assign(tooltip.style, {
                position: 'fixed',
                background: 'rgba(0, 0, 0, 0.9)',
                color: 'white',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                zIndex: '10000',
                opacity: '0',
                transition: 'opacity 0.2s ease',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif'
            });
            tooltip.textContent = text;

            // 定位 tooltip
            document.body.appendChild(tooltip);
            const rect = target.getBoundingClientRect();

            // 计算位置
            let tooltipLeft = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2);
            let tooltipTop = rect.top - tooltip.offsetHeight - 8;

            // 边界检测
            if (tooltipLeft < 10) {
                tooltipLeft = 10;
            }
            if (tooltipLeft + tooltip.offsetWidth > window.innerWidth - 10) {
                tooltipLeft = window.innerWidth - tooltip.offsetWidth - 10;
            }
            if (tooltipTop < 10) {
                tooltipTop = rect.bottom + 8;
            }

            tooltip.style.left = tooltipLeft + 'px';
            tooltip.style.top = tooltipTop + 'px';

            // 显示
            setTimeout(() => tooltip.style.opacity = '1', 10);

            // 3秒后自动消失
            setTimeout(() => {
                tooltip.style.opacity = '0';
                setTimeout(() => tooltip.remove(), 200);
            }, 3000);
        }

        /**
         * 切换活动视频
         * @param {HTMLVideoElement} video 目标视频元素
         * @param {HTMLElement} button 按钮元素
         */
        switchActiveVideo(video, button) {
            // 重置所有按钮样式（使用辅助 Set 遍历）
            this._videoControlButtonsList.forEach((btn) => {
                this.resetButtonStyle(btn);
            });

            // 激活当前按钮
            this.setActiveButton(button);

            // 切换活动视频
            this.activeVideo = video;

            // 应用当前音量增强倍率到新视频
            this._applyBoostToActiveVideo();

            // 显示提示消息
            showFloatingMessage('已切换到该视频控制');
        }

        /**
         * 设置按钮为激活状态
         * @param {HTMLElement} button 按钮元素
         */
        setActiveButton(button) {
            button.classList.add('active');
            button.style.background = 'rgba(0, 128, 255, 0.3)';
            button.style.borderColor = 'rgba(0, 128, 255, 0.3)';
            button.style.boxShadow = '0 0 8px rgba(0, 128, 255, 0.3)';
            button.style.transform = 'scale(1)';

            // 添加中心小点指示器
            const dot = document.createElement('div');
            Object.assign(dot.style, {
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '4px',
                height: '4px',
                background: 'rgba(255, 255, 255, 0.5)',
                borderRadius: '50%',
                pointerEvents: 'none'
            });
            button.appendChild(dot);
        }

        /**
         * 重置按钮为默认状态
         * @param {HTMLElement} button 按钮元素
         */
        resetButtonStyle(button) {
            button.classList.remove('active');
            button.style.background = 'rgba(255, 255, 255, 0.15)';
            button.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            button.style.boxShadow = 'none';
            button.style.transform = 'scale(1)';
            // 移除中心小点
            const dot = button.querySelector('div');
            if (dot) dot.remove();
        }

        // 8. 按键事件处理
        handleKeyDown(e) {
            // 允许响应长按重复的按键：音量调节(上/下箭头)、右箭头(有自己的长按逻辑)
            const allowRepeatKeys = ['ArrowUp', 'ArrowDown', 'ArrowRight'];
            if (e.repeat && !allowRepeatKeys.includes(e.code)) {
                // 对于脚本管理的按键，长按时仍需拦截，防止穿透到网站原生快捷键（如B站 [ ] 上/下P）
                if (this.activeVideo && this.keyHandlers[e.code]) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                }
                return;
            }

            const path = e.composedPath();
            // Bug1 修复：增强交互元素检测，避免破坏原生键盘导航
            const isInteractiveElement = (el) => {
                if (!el || !el.tagName) return false;
                const textInputTags = ['INPUT', 'TEXTAREA', 'SELECT'];
                return el.isContentEditable ||
                       textInputTags.includes(el.tagName) ||
                       el.getAttribute?.('role') === 'textbox';
            };
            const isInputFocused = path.some(isInteractiveElement);
            if (isInputFocused || !this.activeVideo) {
                return;
            }

            // Shift 组合键：音量增强（Shift + 上/下箭头）
            if (e.shiftKey && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
                e.preventDefault();
                e.stopImmediatePropagation();
                const step = this.settings.volumeBoostStep;
                this.adjustVolumeBoost(e.code === 'ArrowUp' ? step : -step);
                return;
            }

            const handler = this.keyHandlers[e.code];
            if (handler) {
                e.preventDefault();
                e.stopImmediatePropagation();
                handler();
            }
        }

        handleKeyUp(e) {
            // 拦截空格键的 keyup 事件，防止冲突
            if (e.code === 'Space' && this.currentDomain.includes('youtube.com')) {
                 e.preventDefault();
                 e.stopImmediatePropagation();
            }

            if (e.code === 'ArrowRight') {
                // 防止重复处理 - 双重保险
                // 1. 事件对象标记
                if (e._videoControllerHandled) {
                    return;
                }
                e._videoControllerHandled = true;

                // 2. 全局标记
                if (this._rightKeyUpHandled) {
                    return;
                }
                this._rightKeyUpHandled = true;

                clearTimeout(this.rightKeyTimer);
                this.rightKeyTimer = null;

                // Bug6 修复：使用时间戳判定长按/短按
                const pressDuration = Date.now() - this._rightKeyDownTime;
                this._rightKeyDownTime = 0; // 重置时间戳

                if (pressDuration < this.LONG_PRESS_DELAY) {
                    // 短按 - 快进
                    this.seek(this.config.SEEK_STEP_SECONDS);
                } else {
                    // 长按 - 恢复速度
                    if (this.activeVideo && this.originalRate) {
                        this.activeVideo.playbackRate = this.originalRate;
                        showFloatingMessage(`恢复播放速度: ${this.originalRate.toFixed(1)}x`);
                    }
                }
                this.downCount = 0;
            }
        }
        
        // 9. 按键处理器和具体功能实现
        _initializeKeyHandlers() {
            this.keyHandlers = {
                // 直接使用 .bind 将函数与参数关联，代码更紧凑
                'ArrowUp': this.adjustVolume.bind(this, this.config.VOLUME_STEP),
                'ArrowDown': this.adjustVolume.bind(this, -this.config.VOLUME_STEP),
                'Enter': this.toggleFullScreen.bind(this),
                'Space': this.togglePlayPause.bind(this),
                'ArrowLeft': this.seek.bind(this, -this.config.SEEK_STEP_SECONDS),
                'ArrowRight': this.handleRightArrowPress.bind(this), // 此函数逻辑复杂，保留原样
                // Bug4 修复：使用箭头函数运行时读取 settings，避免 bind 固化值
                'Equal': () => this.adjustTargetRate(this.settings.targetRateStep),
                'Minus': () => this.adjustTargetRate(-this.settings.targetRateStep),
                'BracketRight': () => this.adjustPlaybackRate(this.settings.quickRateStep),
                'BracketLeft': () => this.adjustPlaybackRate(-this.settings.quickRateStep),
                'KeyP': this.resetPlaybackRate.bind(this),
                'Comma': this.frameStep.bind(this, -1),
                'Period': this.frameStep.bind(this, 1),
            };
        }

        // 移除了 _handle... 系列的中间函数，因为它们已被 .bind 替代

        // ===== 音量增强 (Web Audio API) =====

        async _getOrCreateAudioNodes(video) {
            if (this._audioNodes.has(video)) {
                return this._audioNodes.get(video);
            }

            // 跨域检测：如果视频跨域且未设置 crossOrigin，createMediaElementSource 会导致静音
            try {
                const videoUrl = new URL(video.currentSrc || video.src, document.baseURI);
                if (videoUrl.origin !== window.location.origin && !video.crossOrigin) {
                    Logger.warn("跨域视频未设置 crossOrigin 属性，音量增强不可用");
                    return null;
                }
            } catch (e) {
                // URL 解析失败，保守处理：禁止创建节点以避免静音
                Logger.warn("无法解析视频 URL，跳过音量增强");
                return null;
            }

            if (!this._audioContext) {
                try {
                    this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
                } catch (e) {
                    Logger.error("创建 AudioContext 失败:", e);
                    return null;
                }
            }

            // 确保 AudioContext 处于运行状态
            if (this._audioContext.state === 'suspended') {
                try {
                    await this._audioContext.resume();
                } catch (e) {
                    Logger.warn("无法恢复 AudioContext:", e);
                }
            }

            try {
                const source = this._audioContext.createMediaElementSource(video);
                const gain = this._audioContext.createGain();
                gain.gain.value = this._currentBoostLevel;
                source.connect(gain);
                gain.connect(this._audioContext.destination);

                const nodes = { source, gain };
                this._audioNodes.set(video, nodes);
                Logger.debug("已为视频创建音频增强节点");
                return nodes;
            } catch (e) {
                if (e.name === 'InvalidStateError') {
                    Logger.warn("无法为视频创建音频源节点（已被占用）:", e.message);
                } else {
                    Logger.error("创建音频增强节点失败:", e);
                }
                return null;
            }
        }

        _disconnectAudioNodes(video) {
            if (this._audioNodes.has(video)) {
                const nodes = this._audioNodes.get(video);
                try {
                    nodes.gain.disconnect();
                    nodes.source.disconnect();
                } catch (e) {
                    Logger.debug("断开音频节点时出错（可忽略）:", e);
                }
                this._audioNodes.delete(video);
                Logger.debug("已清理视频的音频增强节点");
            }
        }

        _cleanupAllAudioNodes() {
            if (this._audioContext) {
                try {
                    this._audioContext.close();
                } catch (e) {
                    Logger.debug("关闭 AudioContext 时出错:", e);
                }
                this._audioContext = null;
            }
            this._audioNodes = new WeakMap();
            this._currentBoostLevel = this.config.VOLUME_BOOST_MIN;
        }

        async _applyBoostToActiveVideo() {
            if (!this.activeVideo || this._currentBoostLevel <= this.config.VOLUME_BOOST_MIN) {
                return;
            }
            // 如果新视频音量不满，重置增强而非强制应用
            if (this.activeVideo.volume < 0.999) {
                this._currentBoostLevel = this.config.VOLUME_BOOST_MIN;
                Logger.debug("新视频音量未满，已重置音量增强");
                return;
            }
            const nodes = await this._getOrCreateAudioNodes(this.activeVideo);
            if (nodes) {
                nodes.gain.gain.value = this._currentBoostLevel;
            }
        }

        async adjustVolumeBoost(delta) {
            if (!this.activeVideo) return;

            // 增大时要求音量已满（用 epsilon 避免浮点精度问题）
            if (delta > 0 && this.activeVideo.volume < 0.999) {
                showFloatingMessage('请先将音量调至100%（按↑键）');
                return;
            }

            // 已在最小值时不再减小
            if (delta < 0 && this._currentBoostLevel <= this.config.VOLUME_BOOST_MIN) {
                return;
            }

            const nodes = await this._getOrCreateAudioNodes(this.activeVideo);
            if (!nodes) {
                showFloatingMessage('音量增强不可用（跨域限制或音频节点创建失败）');
                return;
            }

            // 首次激活时显示安全提示（在确认节点可用后再提示）
            if (delta > 0 && this._currentBoostLevel <= this.config.VOLUME_BOOST_MIN && !this._boostWarningShown) {
                this._boostWarningShown = true;
                showFloatingMessage('音量增强已开启，注意保护听力！Shift + ↓ 可降低，降至100%即关闭');
            }

            const newLevel = Math.max(
                this.config.VOLUME_BOOST_MIN,
                Math.min(this.settings.volumeBoostMax, this._currentBoostLevel + delta)
            );

            // 使用 toFixed 避免浮点累积误差
            const roundedLevel = Math.round(newLevel * 100) / 100;

            if (roundedLevel !== this._currentBoostLevel) {
                this._currentBoostLevel = roundedLevel;
                nodes.gain.gain.value = this._currentBoostLevel;
            }

            if (this._currentBoostLevel <= this.config.VOLUME_BOOST_MIN) {
                showFloatingMessage('音量增强：已关闭');
            } else {
                showFloatingMessage(`音量增强：${Math.round(this._currentBoostLevel * 100)}%`);
            }
        }

        adjustVolume(delta) {
            if (!this.activeVideo) return; // Bug3 扩展修复：空引用保护
            this.activeVideo.volume = Math.max(0, Math.min(1, this.activeVideo.volume + delta));
            showFloatingMessage(`音量：${Math.round(this.activeVideo.volume * 100)}%`);
        }

        toggleFullScreen() {
            // 优先使用网站特定选择器
            if (this.siteConfig.fullscreenButtonSelector) {
                const fsButton = document.querySelector(this.siteConfig.fullscreenButtonSelector);
                if (fsButton) {
                    fsButton.click();
                    return;
                }
            }

            // 通用备用方案：使用原生API
            if (!document.fullscreenElement) {
                if (this.activeVideo.requestFullscreen) {
                    this.activeVideo.requestFullscreen();
                } else if (this.activeVideo.webkitRequestFullscreen) {
                    this.activeVideo.webkitRequestFullscreen();
                } else if (this.activeVideo.msRequestFullscreen) {
                    this.activeVideo.msRequestFullscreen();
                }
                showFloatingMessage('进入全屏');
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
                showFloatingMessage('退出全屏');
            }
        }

        togglePlayPause() {
            if (!this.activeVideo) return; // Bug3 修复：空引用保护
            if (this.activeVideo.paused) {
                this.activeVideo.play();
                showFloatingMessage('播放');
            } else {
                this.activeVideo.pause();
                showFloatingMessage('暂停');
            }
        }

        seek(delta) {
            if (!this.activeVideo) return; // Bug3 修复：空引用保护
            if (this.activeVideo.paused) this.activeVideo.play();
            this.activeVideo.currentTime = Math.max(0, this.activeVideo.currentTime + delta);
            showFloatingMessage(`快${delta > 0 ? '进' : '退'} ${this.config.SEEK_STEP_SECONDS} 秒`);
        }

        // 此方法逻辑复杂，保留原名，仅在 handler 中调用
        // Bug6 修复：改用纯时间戳判定，避免高键盘重复率下的冲突
        handleRightArrowPress() {
            if (!this.activeVideo) return; // Bug3 修复：空引用保护
            if (this.activeVideo.paused) this.activeVideo.play();

            // 重置标记，允许新的KeyUp处理
            this._rightKeyUpHandled = false;

            // 首次按下时记录时间和原始速率
            if (this._rightKeyDownTime === 0) {
                this._rightKeyDownTime = Date.now();
                this.originalRate = this.activeVideo.playbackRate;

                // 延迟后进入长按模式
                this.rightKeyTimer = setTimeout(() => {
                    if (this._rightKeyDownTime > 0) { // 仍在按住
                        this.activeVideo.playbackRate = this.targetRate;
                        showFloatingMessage(`倍速播放: ${this.targetRate.toFixed(2)}x`);
                    }
                }, this.LONG_PRESS_DELAY);
            }
            // 移除 downCount++，完全依赖时间戳
            this.downCount++;
        }

        adjustTargetRate(delta) {
            this.targetRate = Math.max(0.1, Math.min(this.config.MAX_RATE, this.targetRate + delta));
            this.lastManualRateChangeTime = Date.now();
            showFloatingMessage(`目标倍速设置为: ${this.targetRate.toFixed(2)}x`);
        }
        
        adjustPlaybackRate(delta) {
            if (!this.activeVideo) {
                showFloatingMessage('错误：未找到视频元素');
                return;
            }

            const newRate = Math.max(0.1, Math.min(this.config.MAX_RATE, this.activeVideo.playbackRate + delta));
            this.activeVideo.playbackRate = newRate;
            this.lastManualRateChangeTime = Date.now();
            showFloatingMessage(`播放速度: ${newRate.toFixed(2)}x`);
        }
        
        resetPlaybackRate() {
            if (!this.activeVideo) return; // Bug3 修复：空引用保护
            this.activeVideo.playbackRate = this.settings.defaultRate;
            this.lastManualRateChangeTime = Date.now();
            showFloatingMessage(`播放速度重置为: ${this.settings.defaultRate.toFixed(2)}x`);
        }

        frameStep(direction) {
            if (!this.activeVideo) return; // Bug3 修复：空引用保护
            if (this.activeVideo.paused) {
                 this.activeVideo.currentTime += (direction / this.config.DEFAULT_FPS);
                 showFloatingMessage(direction > 0 ? `下一帧` : `上一帧`);
            }
        }
    }

    // 启动脚本
    const controller = new VideoController();
    controller.start();

})();
