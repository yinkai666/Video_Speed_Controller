// ==UserScript==
// @name         视频倍速播放增强版
// @name:en      Enhanced Video Speed Controller
// @namespace    http://tampermonkey.net/
// @version      1.5.0
// @description  长按右方向键倍速播放，松开恢复原速。按+/-键调整倍速，按]/[键快速调整倍速，按P键恢复默认速度。上/下方向键调节音量，回车键切换全屏。左/右方向键快退/快进5秒。支持YouTube、Bilibili等大多数视频网站。如遇兼容性问题，可在启用脚本后，通过油猴菜单执行"重新扫描以查找视频"。v1.5.0新增递归iframe扫描、类型安全检查、目标倍速持久化等特性。
// @description:en  Hold right arrow key for speed playback, release to restore. Press +/- to adjust speed, press ]/[ for quick speed adjustment, press P to restore default speed. Up/Down arrows control volume, Enter toggles fullscreen. Left/Right arrows for 5s rewind/forward. Supports most sites. For compatibility issues, use "Rescan for Videos" from the Tampermonkey menu after enabling the script. v1.5.0 adds recursive iframe scanning, type safety checks, and persistent target speed settings.
// @author       ternece
// @license      MIT
// @match        *://*.youtube.com/*
// @match        *://*.bilibili.com/video/*
// @match        *://*/*
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
        targetRateStep: 0.5  // 按 +/- 键调整目标倍速的步长
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
        MAX_QUICK_RATE_STEP: 3          // “快速调速步长”的最大值
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

    // 显示浮动提示 (保留在外部，因为它是一个独立的UI工具函数)
    function showFloatingMessage(message) {
        const messageElement = document.createElement("div");
        messageElement.textContent = message;
        messageElement.style.position = "fixed";
        messageElement.style.top = "10px";
        messageElement.style.left = "50%";
        messageElement.style.transform = "translateX(-50%)";
        messageElement.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
        messageElement.style.color = "white";
        messageElement.style.padding = "8px 16px";
        messageElement.style.borderRadius = "4px";
        messageElement.style.zIndex = "10000";
        messageElement.style.fontFamily = "Arial, sans-serif";
        messageElement.style.fontSize = "14px";
        messageElement.style.transition = "opacity 0.5s ease-out";
        document.body.appendChild(messageElement);
        setTimeout(() => {
            messageElement.style.opacity = "0";
            setTimeout(() => {
                document.body.removeChild(messageElement);
            }, 500);
        }, 2000);
    }

    // 显示临时启用网站列表的浮动窗口
    function showDomainListModal(controller) {
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

        // 创建模态框
        const modal = document.createElement("div");
        modal.style.backgroundColor = "white";
        modal.style.borderRadius = "8px";
        modal.style.padding = "20px";
        modal.style.maxWidth = "600px";
        modal.style.width = "90%";
        modal.style.maxHeight = "80%";
        modal.style.overflow = "auto";
        modal.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";
        modal.style.position = "relative";  // 为关闭按钮提供定位参考

        // 标题
        const title = document.createElement("h2");
        title.textContent = "视频倍速控制器 - 临时启用列表";
        title.style.margin = "0 0 15px 0";
        title.style.fontSize = "18px";
        title.style.color = "#333";
        title.style.borderBottom = "2px solid #4CAF50";
        title.style.paddingBottom = "10px";

        // 关闭按钮
        const closeButton = document.createElement("button");
        closeButton.textContent = "×";
        closeButton.style.position = "absolute";
        closeButton.style.right = "20px";
        closeButton.style.top = "20px";
        closeButton.style.background = "none";
        closeButton.style.border = "none";
        closeButton.style.fontSize = "24px";
        closeButton.style.cursor = "pointer";
        closeButton.style.color = "#999";
        closeButton.style.width = "30px";
        closeButton.style.height = "30px";
        closeButton.style.display = "flex";
        closeButton.style.alignItems = "center";
        closeButton.style.justifyContent = "center";
        closeButton.onmouseover = () => { closeButton.style.color = "#333"; };
        closeButton.onmouseout = () => { closeButton.style.color = "#999"; };

        // 动作按钮区域
        const actionBar = document.createElement("div");
        actionBar.style.marginBottom = "10px";
        actionBar.style.display = "flex";
        actionBar.style.justifyContent = "space-between";
        actionBar.style.alignItems = "center";

        const counter = document.createElement("span");
        counter.style.fontSize = "14px";
        counter.style.color = "#666";

        const clearAllButton = document.createElement("button");
        clearAllButton.textContent = "一键清空";
        clearAllButton.style.backgroundColor = "#f44336";
        clearAllButton.style.color = "white";
        clearAllButton.style.border = "none";
        clearAllButton.style.padding = "8px 16px";
        clearAllButton.style.borderRadius = "4px";
        clearAllButton.style.cursor = "pointer";
        clearAllButton.style.fontSize = "14px";
        clearAllButton.style.fontWeight = "bold";
        clearAllButton.style.transition = "background-color 0.2s";
        clearAllButton.onmouseover = () => {
            clearAllButton.style.backgroundColor = "#d32f2f";
        };
        clearAllButton.onmouseout = () => {
            clearAllButton.style.backgroundColor = "#f44336";
        };
        clearAllButton.onclick = () => {
            if (confirm('确定要删除所有临时启用的网站吗？')) {
                controller.tempEnabledDomains = [];
                GM_setValue('tempEnabledDomains', controller.tempEnabledDomains);
                closeModal();
                showFloatingMessage('已清空所有临时启用的网站，请刷新页面');
            }
        };

        actionBar.appendChild(counter);
        actionBar.appendChild(clearAllButton);

        // 更新计数器和列表的函数
        const updateDisplay = () => {
            // 更新计数器
            counter.textContent = `共 ${controller.tempEnabledDomains.length} 个网站已启用`;

            // 清空并重新生成列表
            listContainer.innerHTML = '';
            if (controller.tempEnabledDomains.length === 0) {
                const emptyMsg = document.createElement("p");
                emptyMsg.textContent = "当前没有临时启用的网站";
                emptyMsg.style.color = "#999";
                emptyMsg.style.textAlign = "center";
                emptyMsg.style.padding = "20px";
                emptyMsg.style.fontSize = "14px";
                listContainer.appendChild(emptyMsg);
            } else {
                controller.tempEnabledDomains.forEach((domain, index) => {
                    const domainItem = document.createElement("div");
                    domainItem.style.padding = "10px";
                    domainItem.style.margin = "5px 0";
                    domainItem.style.backgroundColor = "#f5f5f5";
                    domainItem.style.borderRadius = "4px";
                    domainItem.style.display = "flex";
                    domainItem.style.alignItems = "center";
                    domainItem.style.justifyContent = "space-between";

                    const domainText = document.createElement("span");
                    domainText.textContent = `${index + 1}. ${domain}`;
                    domainText.style.fontFamily = "monospace";
                    domainText.style.fontSize = "14px";
                    domainText.style.color = "#333";

                    const buttonGroup = document.createElement("div");
                    buttonGroup.style.display = "flex";
                    buttonGroup.style.gap = "8px";

                    const statusBadge = document.createElement("span");
                    statusBadge.textContent = "已启用";
                    statusBadge.style.backgroundColor = "#4CAF50";
                    statusBadge.style.color = "white";
                    statusBadge.style.padding = "4px 8px";
                    statusBadge.style.borderRadius = "4px";
                    statusBadge.style.fontSize = "12px";

                    const deleteButton = document.createElement("button");
                    deleteButton.textContent = "删除";
                    deleteButton.style.backgroundColor = "#ff9800";
                    deleteButton.style.color = "white";
                    deleteButton.style.border = "none";
                    deleteButton.style.padding = "4px 12px";
                    deleteButton.style.borderRadius = "4px";
                    deleteButton.style.cursor = "pointer";
                    deleteButton.style.fontSize = "12px";
                    deleteButton.style.transition = "background-color 0.2s";
                    deleteButton.onmouseover = () => {
                        deleteButton.style.backgroundColor = "#f57c00";
                    };
                    deleteButton.onmouseout = () => {
                        deleteButton.style.backgroundColor = "#ff9800";
                    };
                    deleteButton.onclick = () => {
                        const idx = controller.tempEnabledDomains.indexOf(domain);
                        if (idx !== -1) {
                            controller.tempEnabledDomains.splice(idx, 1);
                            GM_setValue('tempEnabledDomains', controller.tempEnabledDomains);
                            updateDisplay();  // 不关闭模态窗口，只更新显示
                            showFloatingMessage(`已移除 ${domain}`);
                        }
                    };

                    buttonGroup.appendChild(statusBadge);
                    buttonGroup.appendChild(deleteButton);

                    domainItem.appendChild(domainText);
                    domainItem.appendChild(buttonGroup);
                    listContainer.appendChild(domainItem);
                });
            }
        };

        // 初始显示
        updateDisplay();

        // 网站列表容器
        const listContainer = document.createElement("div");

        // 提示文本
        const tip = document.createElement("p");
        tip.textContent = "提示：单个删除会立即生效。一键清空后请刷新页面使更改生效。";
        tip.style.fontSize = "12px";
        tip.style.color = "#666";
        tip.style.marginTop = "15px";
        tip.style.paddingTop = "10px";
        tip.style.borderTop = "1px solid #eee";

        // 组装模态框
        modal.appendChild(closeButton);
        modal.appendChild(title);
        modal.appendChild(actionBar);
        modal.appendChild(listContainer);
        modal.appendChild(tip);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // 关闭事件
        const closeModal = () => {
            overlay.style.opacity = "0";
            setTimeout(() => {
                document.body.removeChild(overlay);
            }, 300);
        };

        closeButton.onclick = closeModal;
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                closeModal();
            }
        };

        // ESC键关闭
        const handleEsc = (e) => {
            if (e.key === "Escape") {
                closeModal();
                document.removeEventListener("keydown", handleEsc);
            }
        };
        document.addEventListener("keydown", handleEsc);
    }

    // 扫描iframe中的域名（递归版本）
    function scanIframesForDomains() {
        const domains = new Set();

        const scanElement = (element, depth = 0) => {
            if (depth > 5) return; // 防止无限递归，最大深度5层

            // 查找所有iframe
            const iframes = element.querySelectorAll ? element.querySelectorAll('iframe') : [];

            iframes.forEach(iframe => {
                try {
                    // 尝试获取src
                    const src = iframe.src || iframe.getAttribute('data-src') || iframe.getAttribute('src');
                    if (src) {
                        const url = new URL(src, window.location.href);
                        if (url.hostname) {
                            domains.add(url.hostname);
                        }
                    }
                } catch (e) {
                    // 忽略无法解析的URL
                }
            });

            // 递归扫描shadow DOM
            if (element.shadowRoot) {
                scanElement(element.shadowRoot, depth + 1);
            }

            // 递归扫描iframe的contentDocument（可能因跨域失败）
            iframes.forEach(iframe => {
                try {
                    if (iframe.contentDocument) {
                        scanElement(iframe.contentDocument, depth + 1);
                    }
                } catch (e) {
                    // 跨域访问被拒绝，忽略
                }
            });
        };

        scanElement(document.body);
        return Array.from(domains);
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

            // 1. 状态 (State) - 添加类型检查
            const loadSetting = (key, defaultValue) => {
                const value = GM_getValue(key, defaultValue);
                const num = parseFloat(value);
                return !isNaN(num) && num > 0 ? num : defaultValue;
            };

            this.settings = {
                defaultRate: loadSetting('defaultRate', DEFAULT_SETTINGS.defaultRate),
                targetRate: DEFAULT_SETTINGS.targetRate,  // 不持久化目标倍速
                quickRateStep: loadSetting('quickRateStep', DEFAULT_SETTINGS.quickRateStep),
                targetRateStep: loadSetting('targetRateStep', DEFAULT_SETTINGS.targetRateStep)
            };

            // 类型检查：确保是数组
            const domains = GM_getValue('tempEnabledDomains', []);
            this.tempEnabledDomains = Array.isArray(domains) ? domains : [];

            this.currentDomain = window.location.hostname;
            this.currentUrl = location.href;
            this.lastManualRateChangeTime = 0;
            this.activeVideo = null;
            this.videoControlButtons = new Map();
            this.rightKeyTimer = null;
            this.downCount = 0;
            this.originalRate = 1.0;
            this.targetRate = this.settings.targetRate;
            this.currentQuickRate = 1.0;
            this.keyHandlers = {};

            // 监听器和观察器引用
            this.keydownListener = null;
            this.keyupListener = null;
            this.mainObserver = null; // 合并后的主观察器
            this.videoChangeObserver = null;
            this.activeObservers = new Set();

            // 创建防抖版的视频检测函数
            this.debouncedDetectAndSetupVideos = debounce(this.detectAndSetupVideos.bind(this), 500);

            this._initializeKeyHandlers();
        }

        // 2. 核心启动与检查逻辑
        start() {
            // 核心菜单命令应该总是可用，无论脚本是否已在此网站启用
            this.registerCoreMenuCommands();

            if (!this.shouldEnableScript()) {
                // 如果未启用，则只注册“启用”命令（已在核心中完成），然后返回
                return;
            }
            
            // 如果已启用，则注册其余的动态菜单命令，并开始初始化
            this.registerDynamicMenuCommands();
            this.initialize();
        }

        shouldEnableScript() {
            if (this.currentDomain.includes('youtube.com') ||
                (this.currentDomain.includes('bilibili.com') && window.location.pathname.includes('/video/'))) {
                return true;
            }
            return this.tempEnabledDomains.includes(this.currentDomain);
        }

        // 3. 菜单命令注册
        registerEnableCommand() {
            GM_registerMenuCommand('在当前网站启用视频倍速控制', () => {
                // 扫描页面中的iframe域名
                const iframeDomains = scanIframesForDomains();
                const domainsToEnable = [this.currentDomain, ...iframeDomains];

                // 去重并添加到临时启用列表
                let addedCount = 0;
                domainsToEnable.forEach(domain => {
                    if (!this.tempEnabledDomains.includes(domain)) {
                        this.tempEnabledDomains.push(domain);
                        addedCount++;
                    }
                });

                if (addedCount > 0) {
                    GM_setValue('tempEnabledDomains', this.tempEnabledDomains);

                    let message = `已启用以下域名：${domainsToEnable.join(', ')}`;
                    if (iframeDomains.length > 0) {
                        message += `\n\n发现 ${iframeDomains.length} 个嵌入视频域名也已一并启用`;
                    }
                    message += `\n\n请刷新页面，若视频仍无法控制，请使用菜单中的"重新扫描"功能。`;

                    showNotification(message);
                } else {
                    showNotification(`${this.currentDomain} 已经在启用列表中`);
                }
            });
        }

        // 核心菜单命令，应无条件注册
        registerCoreMenuCommands() {
             // 仅在脚本未启用时，才显示“启用”命令
            if (!this.shouldEnableScript()) {
                this.registerEnableCommand();
            }

            // 如果当前网站在临时启用列表中，显示删除选项
            if (this.tempEnabledDomains.includes(this.currentDomain)) {
                GM_registerMenuCommand('从临时启用列表中移除当前网站', () => {
                    const index = this.tempEnabledDomains.indexOf(this.currentDomain);
                    if (index !== -1) {
                        this.tempEnabledDomains.splice(index, 1);
                        GM_setValue('tempEnabledDomains', this.tempEnabledDomains);
                        showNotification(`已从临时启用列表中移除 ${this.currentDomain}，请刷新页面`);
                    }
                });
            }

            GM_registerMenuCommand('查看所有临时启用的网站', () => {
                showDomainListModal(this);
            });
        }

        // 动态菜单命令，仅在脚本启用后注册
        registerDynamicMenuCommands() {
            GM_registerMenuCommand('重新扫描以查找视频', () => {
                console.log("执行重新扫描...");
                showFloatingMessage('正在重新扫描以查找视频...');
                const videos = this.deepFindVideoElements();
                if (videos.length > 0) {
                    this.setupVideos(videos);
                    showFloatingMessage(`扫描发现 ${videos.length} 个视频！`);
                } else {
                    showFloatingMessage('扫描未发现任何视频。');
                }
            });

            GM_registerMenuCommand('设置默认播放速度', () => this.updateSetting('defaultRate', `请输入默认播放速度 (0.1-${this.config.MAX_RATE})`));
            GM_registerMenuCommand('设置长按右键倍速', () => this.updateSetting('targetRate', `请输入长按右键时的倍速 (0.1-${this.config.MAX_RATE})`));
            GM_registerMenuCommand('设置快速调速步长', () => this.updateSetting('quickRateStep', `请输入按 [ 或 ] 键调整速度的步长 (0.1-${this.config.MAX_QUICK_RATE_STEP})`, this.config.MAX_QUICK_RATE_STEP));
            GM_registerMenuCommand('设置目标倍速调整步长', () => this.updateSetting('targetRateStep', `请输入按 +/- 键调整目标倍速的步长 (0.1-${this.config.MAX_RATE})`));
        }
        
        updateSetting(key, promptMessage, max = this.config.MAX_RATE) {
            const newValue = prompt(promptMessage, this.settings[key]);
            if (newValue !== null) {
                const value = parseFloat(newValue);
                if (!isNaN(value) && value >= 0.1 && value <= max) {
                    this.settings[key] = value;
                    GM_setValue(key, value);
                    showFloatingMessage(`设置已更新: ${value}`);
                    if (key === 'defaultRate' && this.activeVideo) {
                        this.activeVideo.playbackRate = value;
                    }
                } else {
                    // 使用浮动消息替代 alert
                    showFloatingMessage(`设置失败: 请输入有效的值 (0.1-${max})`);
                }
            }
        }


        // 4. 初始化流程
        async initialize(isRetry = false) {
            this.cleanup();
        
            try {
                this.activeVideo = await this._findInitialVideo();
                console.log("初始化成功, 找到视频:", this.activeVideo);
        
                this._setupPersistentObservers();
                this.setupEventListeners();
                this.watchUrlChange();
        
            } catch (error) {
                console.warn("初始化尝试失败:", error.message);
                // 仅在首次尝试时启动重试逻辑
                if (!isRetry) {
                    // 如果是特定错误类型，比如找不到视频，则在一段时间后重试
                    if (error.type === "no_video" || error.type === "timeout") {
                        setTimeout(() => this.initialize(true).catch(console.error), this.config.INIT_RETRY_DELAY);
                    }
                }
                // 如果是重试失败，则不再继续，避免无限循环
            }
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
                console.log("快速查找失败，尝试深度查找...");
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
                             console.log("垃圾回收：清理被移除的视频", video);
                             const button = this.videoControlButtons.get(video);
                             if (button) button.remove();
                             this.videoControlButtons.delete(video);
                             if (this.activeVideo === video) {
                                 this.activeVideo = null;
                             }
                        });
                    });

                    // 检查是否有新视频被添加
                    const hasNewVideos = Array.from(mutation.addedNodes).some(n => n.tagName === 'VIDEO' || (n.querySelector && n.querySelector('video')));
                    if (hasNewVideos) {
                         console.log("侦测到新视频相关的DOM变动，调用防抖版检测...");
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
                        console.log("侦测到当前活动视频节点被移除，将重新初始化...");
                        this.initialize().catch(console.error);
                    }
                });
                this.videoChangeObserver.observe(this.activeVideo.parentElement, { childList: true });
                this.activeObservers.add(this.videoChangeObserver);
            }
        }

        // 5. 清理与监听
        cleanup() {
            // 清理键盘事件监听器
            if (this.keydownListener) {
                window.removeEventListener("keydown", this.keydownListener, true);
                this.keydownListener = null;
            }
            if (this.keyupListener) {
                window.removeEventListener("keyup", this.keyupListener, true);
                this.keyupListener = null;
            }

            // 清理URL变化监听器
            if (this._handleStateChange) {
                window.removeEventListener('popstate', this._handleStateChange);
                this._handleStateChange = null;
            }

            // 清理观察者
            this.activeObservers.forEach(observer => observer.disconnect());
            this.activeObservers.clear();

            // 清理控制按钮
            this.videoControlButtons.forEach(button => button.remove());
            this.videoControlButtons.clear();

            this.activeVideo = null;
        }

        handleUrlChange() {
            this.currentUrl = location.href;
            console.log("URL发生变化，重新初始化...");
            // 使用 setTimeout 延迟执行，确保新页面的 DOM 元素已加载
            setTimeout(() => this.initialize().catch(console.error), this.config.URL_CHANGE_INIT_DELAY);
        }

        watchUrlChange() {
            // MutationObserver 的部分已合并到 mainObserver 中
            // 这里只处理 History API 的监听

            // 保存监听器引用以便清理
            this._handleStateChange = this.handleUrlChange.bind(this);

            // 使用 History API 监听
            const originalPushState = history.pushState;
            history.pushState = function() {
                originalPushState.apply(this, arguments);
                this._handleStateChange();
            }.bind(this);

            const originalReplaceState = history.replaceState;
            history.replaceState = function() {
                originalReplaceState.apply(this, arguments);
                this._handleStateChange();
            }.bind(this);

            window.addEventListener('popstate', this._handleStateChange);
        }


        // 6. 事件监听器设置
        setupEventListeners() {
            this.keydownListener = this.handleKeyDown.bind(this);
            this.keyupListener = this.handleKeyUp.bind(this);
            window.addEventListener("keydown", this.keydownListener, true);
            window.addEventListener("keyup", this.keyupListener, true);
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
            console.log('开始深度查找视频元素...');
            const foundVideos = new Set();
            const find = (element, depth = 0) => {
                if (depth > 10) return;
                if (element.tagName === 'VIDEO') foundVideos.add(element);
                if (element.shadowRoot) find(element.shadowRoot, depth + 1);
                if (element.contentDocument) find(element.contentDocument, depth + 1);
                Array.from(element.children || []).forEach(child => find(child, depth + 1));
            };
            find(document.body);
            console.log(`深度查找完成，共找到 ${foundVideos.size} 个视频元素`);
            return Array.from(foundVideos);
        }
        
        detectAndSetupVideos() {
            const videos = this.findAllVideos();
            if (videos.length === 0) return null;
            this.setupVideos(videos);
            return this.activeVideo || videos[0];
        }

        findAllVideos() {
            const allVideos = new Set(document.querySelectorAll('video'));
            const findIn = (root) => {
                try {
                    root.querySelectorAll('video').forEach(v => allVideos.add(v));
                    root.querySelectorAll('iframe').forEach(f => {
                         try {
                            if (f.contentDocument) findIn(f.contentDocument);
                         } catch(e) {/* cross-origin */}
                    });
                    root.querySelectorAll('*').forEach(el => {
                        if (el.shadowRoot) findIn(el.shadowRoot);
                    });
                } catch(e) {/* ignore */}
            };
            findIn(document);
            return Array.from(allVideos);
        }

        setupVideos(videos) {
            if (videos.length === 1) {
                const video = videos[0];
                if (video.readyState >= 1 && !this.activeVideo) {
                    this.activeVideo = video;
                    this.setDefaultRate(video);
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
                        if (!this.videoControlButtons.has(video) && video.readyState >= 1) {
                            this.createVideoControlButton(video, index + 1);
                            this.setDefaultRate(video);
                            if (!this.activeVideo) this.activeVideo = video;
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
            const button = document.createElement('div');
            Object.assign(button.style, {
                position: 'absolute', top: '10px', left: '10px',
                backgroundColor: 'rgba(0, 0, 0, 0.6)', color: 'white',
                padding: '5px 10px', borderRadius: '4px', fontSize: '12px',
                fontFamily: 'Arial, sans-serif', cursor: 'pointer', zIndex: '9999',
                transition: 'background-color 0.3s', userSelect: 'none'
            });
            
            // 安全加固：使用 textContent 替代 innerHTML
            const textSpan = document.createElement('span');
            textSpan.textContent = `视频 ${index}`;
            button.appendChild(textSpan);

            if (!this.activeVideo) {
                this.activeVideo = video;
                button.style.backgroundColor = 'rgba(0, 128, 255, 0.8)';
            }

            button.addEventListener('click', () => {
                this.videoControlButtons.forEach(btn => btn.style.backgroundColor = 'rgba(0, 0, 0, 0.6)');
                this.activeVideo = video;
                button.style.backgroundColor = 'rgba(0, 128, 255, 0.8)';
                showFloatingMessage(`已切换到视频 ${index} 控制`);
            });

            const container = video.parentElement || document.body;
            const style = window.getComputedStyle(container);
            if (style.position === 'static') container.style.position = 'relative';
            container.appendChild(button);
            this.videoControlButtons.set(video, button);
        }

        // 8. 按键事件处理
        handleKeyDown(e) {
            // 忽略因长按而重复触发的 keydown 事件 (除了右箭头，它有自己的长按逻辑)
            if (e.repeat && e.code !== 'ArrowRight') {
                return;
            }
            
            const path = e.composedPath();
            const isInputFocused = path.some(el => el.isContentEditable || ['INPUT', 'TEXTAREA'].includes(el.tagName));
            if (isInputFocused || !this.activeVideo) {
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
                clearTimeout(this.rightKeyTimer);
                this.rightKeyTimer = null;
                
                if (this.downCount < this.config.SHORT_PRESS_MAX_COUNT) { //判定为短按
                    this.seek(this.config.SEEK_STEP_SECONDS);
                } else { //判定为长按
                     if(this.activeVideo) {
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
                'Equal': this.adjustTargetRate.bind(this, this.settings.targetRateStep),
                'Minus': this.adjustTargetRate.bind(this, -this.settings.targetRateStep),
                'BracketRight': this.adjustPlaybackRate.bind(this, this.settings.quickRateStep),
                'BracketLeft': this.adjustPlaybackRate.bind(this, -this.settings.quickRateStep),
                'KeyP': this.resetPlaybackRate.bind(this),
                'Comma': this.frameStep.bind(this, -1),
                'Period': this.frameStep.bind(this, 1),
            };
        }

        // 移除了 _handle... 系列的中间函数，因为它们已被 .bind 替代

        adjustVolume(delta) {
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
            console.log('未找到特定网站的全屏按钮，使用原生API。');
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
            if (this.activeVideo.paused) {
                this.activeVideo.play();
                showFloatingMessage('播放');
            } else {
                this.activeVideo.pause();
                showFloatingMessage('暂停');
            }
        }
        
        seek(delta) {
            if (this.activeVideo.paused) this.activeVideo.play();
            this.activeVideo.currentTime = Math.max(0, this.activeVideo.currentTime + delta);
            showFloatingMessage(`快${delta > 0 ? '进' : '退'} ${this.config.SEEK_STEP_SECONDS} 秒`);
        }
        
        // 此方法逻辑复杂，保留原名，仅在 handler 中调用
        handleRightArrowPress() {
            if (this.activeVideo.paused) this.activeVideo.play();

            if (this.downCount === 0) {
                this.originalRate = this.activeVideo.playbackRate;
                this.rightKeyTimer = setTimeout(() => {
                    this.activeVideo.playbackRate = this.targetRate;
                    showFloatingMessage(`倍速播放: ${this.targetRate.toFixed(2)}x`);
                    this.downCount = this.config.SHORT_PRESS_MAX_COUNT; // 设置为长按状态
                }, this.LONG_PRESS_DELAY);
            }
            this.downCount++;
        }

        adjustTargetRate(delta) {
            this.targetRate = Math.max(0.1, Math.min(this.config.MAX_RATE, this.targetRate + delta));
            this.lastManualRateChangeTime = Date.now();
            showFloatingMessage(`目标倍速设置为: ${this.targetRate.toFixed(2)}x`);
        }
        
        adjustPlaybackRate(delta) {
            const newRate = Math.max(0.1, Math.min(this.config.MAX_RATE, this.activeVideo.playbackRate + delta));
            this.activeVideo.playbackRate = newRate;
            this.lastManualRateChangeTime = Date.now();
            showFloatingMessage(`播放速度: ${newRate.toFixed(2)}x`);
        }
        
        resetPlaybackRate() {
            this.activeVideo.playbackRate = this.settings.defaultRate;
            this.lastManualRateChangeTime = Date.now();
            showFloatingMessage(`播放速度重置为: ${this.settings.defaultRate.toFixed(2)}x`);
        }
        
        frameStep(direction) {
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
