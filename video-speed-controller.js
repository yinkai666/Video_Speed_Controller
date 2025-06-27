// ==UserScript==
// @name         视频倍速播放增强版
// @name:en      Enhanced Video Speed Controller
// @namespace    http://tampermonkey.net/
// @version      1.3.7
// @description  长按右方向键倍速播放，松开恢复原速。按+/-键调整倍速，按]/[键快速调整倍速，按P键恢复1.0倍速。上/下方向键调节音量，回车键切换全屏。左/右方向键快退/快进5秒。支持YouTube、Bilibili等大多数视频网站，可通过点击选择控制多个视频。
// @description:en  Hold right arrow key for speed playback, release to restore. Press +/- to adjust speed, press ]/[ for quick speed adjustment, press P to restore 1.0x speed. Up/Down arrows control volume, Enter toggles fullscreen. Left/Right arrows for 5s rewind/forward. Supports YouTube, Bilibili and most video websites. Click to select which video to control when multiple videos exist.
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

    class VideoController {
        constructor() {
            // 调试开关
            this.DEBUG = false;
            // 长按判定时间（毫秒）
            this.LONG_PRESS_DELAY = 200;

            // 1. 状态 (State)
            this.settings = {
                defaultRate: GM_getValue('defaultRate', DEFAULT_SETTINGS.defaultRate),
                targetRate: GM_getValue('targetRate', DEFAULT_SETTINGS.targetRate),
                quickRateStep: GM_getValue('quickRateStep', DEFAULT_SETTINGS.quickRateStep),
                targetRateStep: GM_getValue('targetRateStep', DEFAULT_SETTINGS.targetRateStep)
            };
            this.tempEnabledDomains = GM_getValue('tempEnabledDomains', []);
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
            this.videoObserver = null;
            this.urlObserver = null;
            this.videoChangeObserver = null;
            this.activeObservers = new Set();
            this._initializeKeyHandlers();
        }

        // 2. 核心启动与检查逻辑
        start() {
            if (!this.shouldEnableScript()) {
                this.registerEnableCommand();
                return;
            }

            this.registerMenuCommands();
            this.startInitializationProcess();
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
                if (!this.tempEnabledDomains.includes(this.currentDomain)) {
                    this.tempEnabledDomains.push(this.currentDomain);
                    GM_setValue('tempEnabledDomains', this.tempEnabledDomains);
                    showNotification(`已在 ${this.currentDomain} 启用视频倍速控制，请刷新页面`);
                } else {
                    showNotification(`${this.currentDomain} 已经在启用列表中`);
                }
            });
        }

        registerMenuCommands() {
            GM_registerMenuCommand('设置默认播放速度', () => this.updateSetting('defaultRate', '请输入默认播放速度 (0.1-16)'));
            GM_registerMenuCommand('设置长按右键倍速', () => this.updateSetting('targetRate', '请输入长按右键时的倍速 (0.1-16)'));
            GM_registerMenuCommand('设置快速调速步长', () => this.updateSetting('quickRateStep', '请输入按 [ 或 ] 键调整速度的步长 (0.1-3)', 3));
            GM_registerMenuCommand('设置目标倍速调整步长', () => this.updateSetting('targetRateStep', '请输入按 +/- 键调整目标倍速的步长 (0.1-16)'));

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
                if (this.tempEnabledDomains.length === 0) {
                    alert('当前没有临时启用的网站');
                } else {
                    alert('临时启用的网站列表：\n\n' + this.tempEnabledDomains.join('\n'));
                }
            });
        }
        
        updateSetting(key, promptMessage, max = 16) {
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
                    alert(`请输入有效的值 (0.1-${max})`);
                }
            }
        }


        // 4. 初始化流程
        async startInitializationProcess() {
            let retryCount = 0;
            const maxRetries = 3;

            const tryInit = async () => {
                try {
                    await this.init();
                    this.watchUrlChange();
                } catch (error) {
                    if (error && (error.type === "no_video" || error.type === "timeout")) {
                        return; // 停止重试
                    }
                    console.warn("启动失败:", error);
                    if (retryCount < maxRetries) {
                        retryCount++;
                        setTimeout(tryInit, 2000);
                    }
                }
            };
            tryInit();
        }

        async init() {
            this.cleanup();

            try {
                let video = await this.waitForVideoElement();
                if (!video) {
                    const deepVideos = this.deepFindVideoElements();
                    if (deepVideos.length > 0) {
                        video = deepVideos[0];
                        this.setupVideos(deepVideos);
                        showFloatingMessage(`通过深度查找发现了 ${deepVideos.length} 个视频`);
                    } else {
                        throw { type: "no_video" };
                    }
                }

                console.log("找到视频元素：", video);
                this.activeVideo = video;
                this.setupObservers();
                this.setupEventListeners();

            } catch (error) {
                console.error("初始化失败:", error);
                if (error && (error.type === "timeout" || error.type === "no_video")) {
                    setTimeout(() => this.init().catch(console.error), 5000);
                }
                throw error;
            }
        }

        // 5. 清理与监听
        cleanup() {
            if (this.keydownListener) {
                document.removeEventListener("keydown", this.keydownListener, true);
                this.keydownListener = null;
            }
            if (this.keyupListener) {
                document.removeEventListener("keyup", this.keyupListener, true);
                this.keyupListener = null;
            }
            this.activeObservers.forEach(observer => observer.disconnect());
            this.activeObservers.clear();
            this.videoControlButtons.forEach(button => button.remove());
            this.videoControlButtons.clear();
            this.activeVideo = null;
        }

        setupObservers() {
            // 观察新视频
            this.videoObserver = new MutationObserver(() => this.detectAndSetupVideos());
            this.videoObserver.observe(document.body, { childList: true, subtree: true });
            this.activeObservers.add(this.videoObserver);

            // 观察视频元素变化
            if (this.activeVideo && this.activeVideo.parentElement) {
                this.videoChangeObserver = new MutationObserver((mutations) => {
                    const hasVideoChanges = mutations.some(m => Array.from(m.removedNodes).some(n => n.tagName === 'VIDEO'));
                    if (hasVideoChanges) {
                        console.log("视频元素变化，重新初始化");
                        this.init().catch(console.error);
                    }
                });
                this.videoChangeObserver.observe(this.activeVideo.parentElement, { childList: true, subtree: true });
                this.activeObservers.add(this.videoChangeObserver);
            }
        }
        
        watchUrlChange() {
            const handleStateChange = () => {
                if (location.href !== this.currentUrl) {
                    this.currentUrl = location.href;
                    console.log("URL变化，重新初始化");
                    setTimeout(() => this.init().catch(console.error), 1000);
                }
            };

            // 使用 History API 监听
            const originalPushState = history.pushState;
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
            
            // 使用 MutationObserver 作为备用
            this.urlObserver = new MutationObserver(handleStateChange);
            this.urlObserver.observe(document.body, { childList: true, subtree: true });
            this.activeObservers.add(this.urlObserver);
        }


        // 6. 事件监听器设置
        setupEventListeners() {
            this.keydownListener = this.handleKeyDown.bind(this);
            this.keyupListener = this.handleKeyUp.bind(this);
            document.addEventListener("keydown", this.keydownListener, true);
            document.addEventListener("keyup", this.keyupListener, true);
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
                }, 10000);
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
                // 对于B站和油管，进行特殊的主视频判断
                const isBilibili = this.currentDomain.includes('bilibili.com');
                const isYoutube = this.currentDomain.includes('youtube.com');

                if (isBilibili || isYoutube) {
                     if (!this.activeVideo || !videos.includes(this.activeVideo)) {
                        let mainVideo;
                        if(isBilibili) mainVideo = videos.find(v => !v.paused) || videos.find(v => v.getBoundingClientRect().width > 400);
                        if(isYoutube) mainVideo = videos.find(v => v.classList.contains('html5-main-video'));
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
            button.innerHTML = `<span>视频 ${index}</span>`;

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
            if (e.code === 'ArrowRight') {
                clearTimeout(this.rightKeyTimer);
                this.rightKeyTimer = null;
                
                if (this.downCount < 3) { //判定为短按
                    this.seek(5);
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
                'ArrowUp': this._handleVolumeUp.bind(this),
                'ArrowDown': this._handleVolumeDown.bind(this),
                'Enter': this._handleToggleFullScreen.bind(this),
                'Space': this._handleTogglePlayPause.bind(this),
                'ArrowLeft': this._handleSeekBackward.bind(this),
                'ArrowRight': this._handleRightArrowPress.bind(this),
                'Equal': this._handleIncreaseTargetRate.bind(this),
                'Minus': this._handleDecreaseTargetRate.bind(this),
                'BracketRight': this._handleIncreasePlaybackRate.bind(this),
                'BracketLeft': this._handleDecreasePlaybackRate.bind(this),
                'KeyP': this._handleResetPlaybackRate.bind(this),
                'Comma': this._handleFrameStepBackward.bind(this),
                'Period': this._handleFrameStepForward.bind(this),
            };
        }

        _handleVolumeUp() { this.adjustVolume(0.1); }
        _handleVolumeDown() { this.adjustVolume(-0.1); }
        _handleToggleFullScreen() { this.toggleFullScreen(); }
        _handleTogglePlayPause() { this.togglePlayPause(); }
        _handleSeekBackward() { this.seek(-5); }
        _handleRightArrowPress() { this.handleRightArrowPress(); }
        _handleIncreaseTargetRate() { this.adjustTargetRate(this.settings.targetRateStep); }
        _handleDecreaseTargetRate() { this.adjustTargetRate(-this.settings.targetRateStep); }
        _handleIncreasePlaybackRate() { this.adjustPlaybackRate(this.settings.quickRateStep); }
        _handleDecreasePlaybackRate() { this.adjustPlaybackRate(-this.settings.quickRateStep); }
        _handleResetPlaybackRate() { this.resetPlaybackRate(); }
        _handleFrameStepBackward() { this.frameStep(-1); }
        _handleFrameStepForward() { this.frameStep(1); }

        adjustVolume(delta) {
            this.activeVideo.volume = Math.max(0, Math.min(1, this.activeVideo.volume + delta));
            showFloatingMessage(`音量：${Math.round(this.activeVideo.volume * 100)}%`);
        }

        toggleFullScreen() {
            let fsButton = null;
            // 针对B站的特殊处理，优先寻找真正的全屏按钮
            if (this.currentDomain.includes('bilibili.com')) {
                // '.bpx-player-ctrl-full' 是新版播放器的浏览器全屏按钮
                // '.bilibili-player-video-btn-fullscreen' 是旧版的
                fsButton = document.querySelector('.bpx-player-ctrl-full') ||
                           document.querySelector('.bilibili-player-video-btn-fullscreen');
            }
            // 针对YouTube
            else if (this.currentDomain.includes('youtube.com')) {
                fsButton = document.querySelector('.ytp-fullscreen-button');
            }

            // 如果特定网站的按钮被找到，则点击
            if (fsButton) {
                fsButton.click();
                return;
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
            showFloatingMessage(`快${delta > 0 ? '进' : '退'} ${Math.abs(delta)} 秒`);
        }
        
        // 此方法逻辑复杂，保留原名，仅在 handler 中调用
        handleRightArrowPress() {
            if (this.activeVideo.paused) this.activeVideo.play();

            if (this.downCount === 0) {
                this.originalRate = this.activeVideo.playbackRate;
                this.rightKeyTimer = setTimeout(() => {
                    this.activeVideo.playbackRate = this.targetRate;
                    showFloatingMessage(`倍速播放: ${this.targetRate}x`);
                    this.downCount = 3; // 设置为长按状态
                }, this.LONG_PRESS_DELAY);
            }
            this.downCount++;
        }

        adjustTargetRate(delta) {
            this.targetRate = Math.max(0.1, Math.min(16, this.targetRate + delta));
            this.lastManualRateChangeTime = Date.now();
            showFloatingMessage(`目标倍速设置为: ${this.targetRate.toFixed(1)}x`);
        }
        
        adjustPlaybackRate(delta) {
            const newRate = Math.max(0.1, Math.min(16, this.activeVideo.playbackRate + delta));
            this.activeVideo.playbackRate = newRate;
            this.lastManualRateChangeTime = Date.now();
            showFloatingMessage(`播放速度: ${newRate.toFixed(1)}x`);
        }
        
        resetPlaybackRate() {
            this.activeVideo.playbackRate = 1.0;
            this.lastManualRateChangeTime = Date.now();
            showFloatingMessage(`播放速度重置为 1.0x`);
        }
        
        frameStep(direction) {
            if (this.activeVideo.paused) {
                 this.activeVideo.currentTime += (direction / 30); // 假设30fps
                 showFloatingMessage(direction > 0 ? `下一帧` : `上一帧`);
            }
        }
    }

    // 启动脚本
    const controller = new VideoController();
    controller.start();

})();