// ==UserScript==
// @name         视频倍速播放增强版
// @name:en      Enhanced Video Speed Controller
// @namespace    http://tampermonkey.net/
// @version      1.2.6
// @description  长按右方向键倍速播放，松开恢复原速。按+/-键调整倍速，按]/[键快速调整倍速，按P键恢复1.0倍速。上/下方向键调节音量，回车键切换全屏。左/右方向键快退/快进5秒。支持YouTube、Bilibili等大多数视频网站（可通过修改脚本的 @match 规则扩展支持的网站）。
// @description:en  Hold right arrow key for speed playback, release to restore. Press +/- to adjust speed, press ]/[ for quick speed adjustment, press P to restore 1.0x speed. Up/Down arrows control volume, Enter toggles fullscreen. Left/Right arrows for 5s rewind/forward. Supports YouTube, Bilibili and most video websites (extendable by modifying the @match rule).
// @author       ternece
// @license      MIT
// @match        *://*.youtube.com/*
// @match        *://*.bilibili.com/video/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=greasyfork.org
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
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

    // 获取保存的设置或使用默认值
    let settings = {
        defaultRate: GM_getValue('defaultRate', DEFAULT_SETTINGS.defaultRate),
        targetRate: GM_getValue('targetRate', DEFAULT_SETTINGS.targetRate),
        quickRateStep: GM_getValue('quickRateStep', DEFAULT_SETTINGS.quickRateStep),
        targetRateStep: GM_getValue('targetRateStep', DEFAULT_SETTINGS.targetRateStep)
    };

    // 注册菜单命令
    GM_registerMenuCommand('设置默认播放速度', () => {
        const newRate = prompt('请输入默认播放速度 (0.1-16)，视频加载时将使用此速度:', settings.defaultRate);
        if (newRate !== null) {
            const rate = parseFloat(newRate);
            if (!isNaN(rate) && rate >= 0.1 && rate <= 16) {
                settings.defaultRate = rate;
                GM_setValue('defaultRate', rate);
                showFloatingMessage(`默认播放速度已设置为 ${rate}x`);
                // 立即应用新的默认速度
                const video = document.querySelector('video');
                if (video) {
                    video.playbackRate = rate;
                }
            } else {
                alert('请输入有效的速度值（0.1-16）');
            }
        }
    });

    GM_registerMenuCommand('设置长按右键倍速', () => {
        const newRate = prompt('请输入长按右键时的倍速 (0.1-16):', settings.targetRate);
        if (newRate !== null) {
            const rate = parseFloat(newRate);
            if (!isNaN(rate) && rate >= 0.1 && rate <= 16) {
                settings.targetRate = rate;
                GM_setValue('targetRate', rate);
                showFloatingMessage(`长按右键倍速已设置为 ${rate}x`);
            } else {
                alert('请输入有效的速度值（0.1-16）');
            }
        }
    });

    GM_registerMenuCommand('设置快速调速步长', () => {
        const newStep = prompt('请输入按 [ 或 ] 键调整速度的步长 (0.1-3):', settings.quickRateStep);
        if (newStep !== null) {
            const step = parseFloat(newStep);
            if (!isNaN(step) && step >= 0.1 && step <= 3) {
                settings.quickRateStep = step;
                GM_setValue('quickRateStep', step);
                showFloatingMessage(`快速调速步长已设置为 ${step}`);
            } else {
                alert('请输入有效的步长值（0.1-3）');
            }
        }
    });

    GM_registerMenuCommand('设置目标倍速调整步长', () => {
        const newStep = prompt('请输入按 +/- 键调整目标倍速的步长 (0.1-16):', settings.targetRateStep);
        if (newStep !== null) {
            const step = parseFloat(newStep);
            if (!isNaN(step) && step >= 0.1 && step <= 16) {
                settings.targetRateStep = step;
                GM_setValue('targetRateStep', step);
                showFloatingMessage(`目标倍速调整步长已设置为 ${step}`);
            } else {
                alert('请输入有效的步长值（0.1-16）');
            }
        }
    });

    let currentUrl = location.href;
    let videoObserver = null;
    let keydownListener = null;
    let keyupListener = null;
    let urlObserver = null;
    let videoChangeObserver = null;
    let activeObservers = new Set();

    // 完整的清理函数
    function cleanup() {
        // 清理所有事件监听器
        if (keydownListener) {
            document.removeEventListener("keydown", keydownListener, true);
            keydownListener = null;
        }
        if (keyupListener) {
            document.removeEventListener("keyup", keyupListener, true);
            keyupListener = null;
        }

        // 清理所有观察器
        activeObservers.forEach(observer => {
            if (observer && observer.disconnect) {
                observer.disconnect();
            }
        });
        activeObservers.clear();

        videoObserver = null;
        urlObserver = null;
        videoChangeObserver = null;
    }

    // 等待视频元素加载
    function waitForVideoElement() {
        return new Promise((resolve, reject) => {
            const maxAttempts = 10;
            let attempts = 0;

            const checkVideo = () => {
                // 添加对 YouTube 播放器的特殊处理
                if (location.hostname.includes('youtube.com')) {
                    // 尝试多个可能的选择器
                    const youtubeVideo = document.querySelector('.html5-main-video') || 
                                      document.querySelector('video.video-stream') ||
                                      document.querySelector('.html5-video-player video');
                    if (youtubeVideo && youtubeVideo.readyState >= 1) {
                        console.log('找到YouTube视频元素:', youtubeVideo);
                        // 设置默认播放速度
                        youtubeVideo.playbackRate = settings.defaultRate;
                        return youtubeVideo;
                    }
                    console.log('YouTube视频元素未就绪');
                    return null;
                } else {
                    const video = document.querySelector("video");
                    if (video && video.readyState >= 1) {
                        // 设置默认播放速度
                        video.playbackRate = settings.defaultRate;
                        return video;
                    }
                }
                return null;
            };

            // 立即检查
            const video = checkVideo();
            if (video) {
                resolve(video);
                return;
            }

            // 创建观察器
            const observer = new MutationObserver(() => {
                attempts++;
                const video = checkVideo();
                if (video) {
                    observer.disconnect();
                    resolve(video);
                } else if (attempts >= maxAttempts) {
                    observer.disconnect();
                    console.warn("未找到视频元素，脚本已停止运行");
                    reject({ type: "no_video" }); // 使用对象替代 Error
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
            });
            activeObservers.add(observer);

            // 设置超时
            setTimeout(() => {
                observer.disconnect();
                activeObservers.delete(observer);
                console.warn("等待视频元素超时，脚本已停止运行");
                reject({ type: "timeout" }); // 使用对象替代 Error
            }, 10000);
        });
    }

    // 显示浮动提示
    function showFloatingMessage(message) {
        // 创建提示元素
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

        // 添加到页面
        document.body.appendChild(messageElement);

        // 几秒后消失
        setTimeout(() => {
            messageElement.style.opacity = "0";
            setTimeout(() => {
                document.body.removeChild(messageElement);
            }, 500); // 等待透明度过渡完成
        }, 2000); // 2秒后消失
    }

    // 初始化脚本
    async function init() {
        cleanup();

        try {
            const video = await waitForVideoElement();
            console.log("找到视频元素：", video);

            const key = "ArrowRight"; // 监听的按键
            const increaseKey = "Equal"; // + 键
            const decreaseKey = "Minus"; // - 键
            const quickIncreaseKey = "BracketRight"; // 】键
            const quickDecreaseKey = "BracketLeft"; // 【键
            const resetSpeedKey = "KeyP"; // P键
            let targetRate = settings.targetRate; // 目标倍速
            let currentQuickRate = 1.0; // 当前快速倍速
            let downCount = 0; // 按键按下计数器
            let originalRate = video.playbackRate; // 保存原始播放速度

            // 监听视频元素变化
            if (video.parentElement) {
                videoChangeObserver = new MutationObserver((mutations) => {
                    const hasVideoChanges = mutations.some(mutation =>
                        Array.from(mutation.removedNodes).some(node => node.tagName === 'VIDEO') ||
                        Array.from(mutation.addedNodes).some(node => node.tagName === 'VIDEO')
                    );

                    if (hasVideoChanges) {
                        console.log("视频元素变化，重新初始化");
                        cleanup();
                        init().catch(console.error);
                    }
                });

                videoChangeObserver.observe(video.parentElement, {
                    childList: true,
                    subtree: true
                });
                activeObservers.add(videoChangeObserver);
            }

            // 创建新的事件监听器
            keydownListener = (e) => {
                // 只处理我们关心的按键
                const validKeys = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter', 'Equal', 'Minus', 'BracketRight', 'BracketLeft', 'KeyP', 'Comma', 'Period'];
                if (!validKeys.includes(e.code)) {
                    return;
                }

                // 检查事件是否起源于输入框、文本区域或特定元素（包括 Shadow DOM）
                const path = e.composedPath();
                const isInputFocused = path.some(element => {
                    if (!element.tagName) return false;
                    const tagName = element.tagName.toLowerCase();
                    // 检查常规输入元素
                    if (tagName === 'input' || tagName === 'textarea' || element.isContentEditable) {
                        return true;
                    }
                    // 检查 Bilibili 评论区 (Shadow DOM)
                    if (tagName === 'bili-comment-rich-textarea') {
                        return true;
                    }
                    // 检查是否在 Bilibili 评论区的 Shadow Root 内部
                    if (element.shadowRoot && element.shadowRoot.contains(path[0])) {
                        // 进一步检查 Shadow Root 内的元素，例如 contenteditable div
                        const innerEditable = element.shadowRoot.querySelector('[contenteditable="true"]');
                        if (innerEditable && path.includes(innerEditable)) {
                            return true;
                        }
                    }
                    return false;
                });

                if (isInputFocused) {
                    return; // 如果焦点在输入区域，则不执行快捷键
                }

                // YouTube 特殊处理
                if (location.hostname.includes('youtube.com')) {
                    const videoPlayer = document.querySelector('.html5-video-player') || 
                                      document.querySelector('#movie_player');
                    if (!videoPlayer) {
                        console.log('未找到YouTube播放器元素');
                        return;
                    }

                    // 检查事件是否发生在视频播放器区域内
                    const isInVideoPlayer = videoPlayer.contains(e.target) || e.target === videoPlayer;
                    
                    // 如果不在视频播放器区域内，不处理事件
                    if (!isInVideoPlayer) {
                        return;
                    }
                }

                // 音量控制：上下方向键
                if (e.code === 'ArrowUp') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    if (video.volume < 1) {
                        video.volume = Math.min(1, video.volume + 0.1);
                        showFloatingMessage(`音量：${Math.round(video.volume * 100)}%`);
                    }
                }

                if (e.code === 'ArrowDown') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    if (video.volume > 0) {
                        video.volume = Math.max(0, video.volume - 0.1);
                        showFloatingMessage(`音量：${Math.round(video.volume * 100)}%`);
                    }
                }

                // 全屏切换：回车键
                if (e.code === 'Enter') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    
                    // 针对B站的特殊处理
                    if (location.hostname.includes('bilibili.com')) {
                        // 使用准确的选择器查找B站的全屏按钮
                        const fullscreenBtn = document.querySelector('.bpx-player-ctrl-full') || 
                                             document.querySelector('[aria-label="全屏"]') ||
                                             document.querySelector('.bilibili-player-video-btn-fullscreen') ||
                                             document.querySelector('.ytp-fullscreen-button');
                        
                        if (fullscreenBtn) {
                            // 模拟点击全屏按钮
                            fullscreenBtn.click();
                            return; // 成功处理，直接返回
                        } else {
                            console.log('未找到B站全屏按钮，使用默认全屏API');
                            // 如果找不到按钮，继续使用默认API
                        }
                    }
                    // 针对YouTube的特殊处理
                    else if (location.hostname.includes('youtube.com')) {
                        // 使用准确的选择器查找YouTube的全屏按钮
                        const ytFullscreenBtn = document.querySelector('.ytp-fullscreen-button') || 
                                              document.querySelector('[data-title-no-tooltip="全屏"]') ||
                                              document.querySelector('[aria-keyshortcuts="f"]') ||
                                              document.querySelector('[data-title-no-tooltip="全屏 (f)"]');
                        
                        if (ytFullscreenBtn) {
                            // 模拟点击全屏按钮
                            ytFullscreenBtn.click();
                            return; // 成功处理，直接返回
                        } else {
                            console.log('未找到YouTube全屏按钮，使用默认全屏API');
                            // 如果找不到按钮，继续使用默认API
                        }
                    }
                    
                    // 默认全屏API（用于其他网站或找不到特定网站按钮时）
                    if (!document.fullscreenElement) {
                        if (video.requestFullscreen) {
                            video.requestFullscreen();
                        } else if (video.webkitRequestFullscreen) {
                            video.webkitRequestFullscreen();
                        } else if (video.msRequestFullscreen) {
                            video.msRequestFullscreen();
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

                // 长按 ArrowRight 键：以 targetRate 倍速播放
                if (e.code === key) {
                    e.preventDefault(); // 阻止默认行为
                    e.stopImmediatePropagation(); // 阻止其他事件监听器
                    downCount++;

                    // 当按键按下次数为2时（长按），设置为 targetRate 倍速
                    if (downCount === 2) {
                        originalRate = video.playbackRate;
                        video.playbackRate = targetRate;
                        showFloatingMessage(`开始 ${targetRate} 倍速播放`);
                    }
                }

                // 按】键增加当前播放倍速
                if (e.code === quickIncreaseKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    // 增加速度，最高 16
                    currentQuickRate = Math.min(16, currentQuickRate + settings.quickRateStep);
                    video.playbackRate = currentQuickRate;
                    showFloatingMessage(`当前播放速度：${currentQuickRate.toFixed(2)}x`); // 使用 toFixed 避免过多小数
                }

                // 按【键减少当前播放倍速
                if (e.code === quickDecreaseKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    // 减少速度，最低 0.1
                    const nextRate = currentQuickRate - settings.quickRateStep;
                    if (nextRate >= 0.1) {
                        currentQuickRate = nextRate;
                        video.playbackRate = currentQuickRate;
                        showFloatingMessage(`当前播放速度：${currentQuickRate.toFixed(2)}x`); // 使用 toFixed
                    } else {
                        showFloatingMessage("播放速度已达到最低值 0.1x");
                    }
                }

                // 按P键恢复1.0倍速
                if (e.code === resetSpeedKey || e.key.toLowerCase() === 'p') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    currentQuickRate = 1.0;
                    video.playbackRate = 1.0;
                    showFloatingMessage('恢复正常播放速度');
                }

                // 按 + 键：增加 targetRate 的值
                if (e.code === increaseKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    // 增加下次长按倍速，最高 16
                    targetRate = Math.min(16, targetRate + settings.targetRateStep);
                    showFloatingMessage(`下次倍速：${targetRate.toFixed(2)}`);
                }

                // 按 - 键：减少 targetRate 的值
                if (e.code === decreaseKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    // 减少下次长按倍速，最低 0.1
                    const nextTargetRate = targetRate - settings.targetRateStep;
                    if (nextTargetRate >= 0.1) {
                        targetRate = nextTargetRate;
                        showFloatingMessage(`下次倍速：${targetRate.toFixed(2)}`);
                    } else {
                        showFloatingMessage("下次倍速已达到最小值 0.1");
                    }
                }

                // 逐帧播放：仅在视频暂停时生效
                if (video.paused && (e.code === 'Comma' || e.code === 'Period')) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    const frameStep = 1 / 30; // 假设 30 FPS
                    if (e.code === 'Period') {
                        video.currentTime = Math.min(video.duration, video.currentTime + frameStep);
                        // showFloatingMessage('下一帧'); // 频繁操作，提示可能过多，暂时注释掉
                    } else if (e.code === 'Comma') {
                        video.currentTime = Math.max(0, video.currentTime - frameStep);
                        // showFloatingMessage('上一帧'); // 频繁操作，提示可能过多，暂时注释掉
                    }
                    return; // 处理完逐帧后直接返回
                }
            };

            keyupListener = (e) => {
                if (e.code !== key) {
                    return; // 如果不是目标按键，直接返回
                }

                e.preventDefault();
                e.stopImmediatePropagation();

                // 单击 ArrowRight 键：跳转5秒
                if (downCount === 1) {
                    video.currentTime += 5;
                }

                // 长按 ArrowRight 键：恢复原速
                if (downCount >= 2) {
                    video.playbackRate = originalRate;
                    showFloatingMessage(`恢复 ${originalRate} 倍速播放`);
                }

                downCount = 0; // 重置按下计数
            };

            // 绑定事件监听器
            document.addEventListener("keydown", keydownListener, true);
            document.addEventListener("keyup", keyupListener, true);

            return true;
        } catch (error) {
            console.error("初始化失败:", error);
            return false;
        }
    }

    // 监听 URL 变化
    function watchUrlChange() {
        urlObserver = new MutationObserver(() => {
            if (location.href !== currentUrl) {
                currentUrl = location.href;
                console.log("URL变化，重新初始化");
                cleanup();
                setTimeout(() => init().catch(console.error), 1000);
            }
        });

        urlObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
        activeObservers.add(urlObserver);

        // 增强的 History API 监听
        const handleStateChange = () => {
            if (location.href !== currentUrl) {
                currentUrl = location.href;
                cleanup();
                setTimeout(() => init().catch(console.error), 1000);
            }
        };

        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function() {
            originalPushState.apply(this, arguments);
            handleStateChange();
        };

        history.replaceState = function() {
            originalReplaceState.apply(this, arguments);
            handleStateChange();
        };

        window.addEventListener('popstate', handleStateChange);
    }

    // 启动脚本
    const startScript = async () => {
        let retryCount = 0;
        const maxRetries = 3;

        const tryInit = async () => {
            try {
                const success = await init();
                if (success) {
                    watchUrlChange();
                } else if (retryCount < maxRetries) {
                    retryCount++;
                    console.warn(`初始化重试 (${retryCount}/${maxRetries})`); // 改为警告
                    setTimeout(tryInit, 2000);
                }
            } catch (error) {
                // 检查错误类型
                if (error && (error.type === "no_video" || error.type === "timeout")) {
                    return; // 直接返回，不做额外处理
                }
                console.warn("启动失败:", error);
                if (retryCount < maxRetries) {
                    retryCount++;
                    setTimeout(tryInit, 2000);
                }
            }
        };

        tryInit();
    };

    startScript();
})();
