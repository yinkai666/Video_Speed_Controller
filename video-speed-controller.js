// ==UserScript==
// @name         视频倍速播放增强版
// @name:en      Enhanced Video Speed Controller
// @namespace    http://tampermonkey.net/
// @version      1.2.9
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

    // 获取保存的设置或使用默认值
    let settings = {
        defaultRate: GM_getValue('defaultRate', DEFAULT_SETTINGS.defaultRate),
        targetRate: GM_getValue('targetRate', DEFAULT_SETTINGS.targetRate),
        quickRateStep: GM_getValue('quickRateStep', DEFAULT_SETTINGS.quickRateStep),
        targetRateStep: GM_getValue('targetRateStep', DEFAULT_SETTINGS.targetRateStep)
    };

    // 获取临时启用的域名列表
    let tempEnabledDomains = GM_getValue('tempEnabledDomains', []);

    // 获取当前域名
    const currentDomain = window.location.hostname;

    // 检查当前网站是否应该启用脚本
    function shouldEnableScript() {
        // 检查是否匹配预定义规则（YouTube 和 Bilibili）
        if (currentDomain.includes('youtube.com') ||
            (currentDomain.includes('bilibili.com') && window.location.pathname.includes('/video/'))) {
            return true;
        }

        // 检查是否在临时启用列表中
        return tempEnabledDomains.includes(currentDomain);
    }

    // 如果当前网站不应该启用脚本，则退出
    if (!shouldEnableScript()) {
        // 注册启用当前网站的菜单命令
        GM_registerMenuCommand('在当前网站启用视频倍速控制', () => {
            if (!tempEnabledDomains.includes(currentDomain)) {
                tempEnabledDomains.push(currentDomain);
                GM_setValue('tempEnabledDomains', tempEnabledDomains);
                showNotification(`已在 ${currentDomain} 启用视频倍速控制，请刷新页面`);
            } else {
                showNotification(`${currentDomain} 已经在启用列表中`);
            }
        });
        return; // 退出脚本执行
    }

    // 显示通知
    function showNotification(message) {
        if (typeof GM_notification !== 'undefined') {
            GM_notification({
                text: message,
                title: '视频倍速控制器',
                timeout: 3000
            });
        } else {
            showFloatingMessage(message);
        }
    }

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

    // 添加从临时启用列表中移除当前网站的菜单命令
    if (tempEnabledDomains.includes(currentDomain)) {
        GM_registerMenuCommand('从临时启用列表中移除当前网站', () => {
            const index = tempEnabledDomains.indexOf(currentDomain);
            if (index !== -1) {
                tempEnabledDomains.splice(index, 1);
                GM_setValue('tempEnabledDomains', tempEnabledDomains);
                showNotification(`已从临时启用列表中移除 ${currentDomain}，请刷新页面`);
            }
        });
    }

    // 添加查看所有临时启用网站的菜单命令
    GM_registerMenuCommand('查看所有临时启用的网站', () => {
        if (tempEnabledDomains.length === 0) {
            alert('当前没有临时启用的网站');
        } else {
            alert('临时启用的网站列表：\n\n' + tempEnabledDomains.join('\n'));
        }
    });

    let currentUrl = location.href;
    let videoObserver = null;
    let keydownListener = null;
    let keyupListener = null;
    let urlObserver = null;
    let videoChangeObserver = null;
    let activeObservers = new Set();
    let activeVideo = null; // 当前激活的视频
    let videoControlButtons = new Map(); // 存储视频和对应的控制按钮
    let rightKeyTimer = null; // 用于长按检测的定时器
    const LONG_PRESS_DELAY = 200; // 长按判定时间（毫秒）

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

        // 移除所有视频控制按钮
        videoControlButtons.forEach((button) => {
            if (button && button.parentNode) {
                button.parentNode.removeChild(button);
            }
        });
        videoControlButtons.clear();
        activeVideo = null;
    }

    // 创建视频控制按钮
    function createVideoControlButton(video, index) {
        // 创建控制按钮
        const button = document.createElement('div');
        button.className = 'video-speed-controller-button';
        button.innerHTML = `<span>视频 ${index}</span>`;
        button.style.position = 'absolute';
        button.style.top = '10px';
        button.style.left = '10px';
        button.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
        button.style.color = 'white';
        button.style.padding = '5px 10px';
        button.style.borderRadius = '4px';
        button.style.fontSize = '12px';
        button.style.fontFamily = 'Arial, sans-serif';
        button.style.cursor = 'pointer';
        button.style.zIndex = '9999';
        button.style.transition = 'background-color 0.3s';
        button.style.userSelect = 'none';

        // 如果是第一个视频，默认设为激活状态
        if (!activeVideo) {
            activeVideo = video;
            button.style.backgroundColor = 'rgba(0, 128, 255, 0.8)';
        }

        // 点击事件：激活该视频的控制
        button.addEventListener('click', () => {
            // 取消之前激活的视频按钮样式
            videoControlButtons.forEach((btn) => {
                btn.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
            });

            // 设置当前视频为激活状态
            activeVideo = video;
            button.style.backgroundColor = 'rgba(0, 128, 255, 0.8)';
            showFloatingMessage(`已切换到视频 ${index} 控制`);
        });

        // 将按钮添加到视频容器
        const videoContainer = video.parentElement || document.body;

        // 确保视频容器有相对或绝对定位，以便正确放置按钮
        const containerPosition = window.getComputedStyle(videoContainer).position;
        if (containerPosition !== 'relative' && containerPosition !== 'absolute' && containerPosition !== 'fixed') {
            videoContainer.style.position = 'relative';
        }

        videoContainer.appendChild(button);
        videoControlButtons.set(video, button);

        return button;
    }

    // 检测页面中的所有视频并添加控制按钮
    function detectAndSetupVideos() {
        const videos = document.querySelectorAll('video');
        if (videos.length === 0) return null;

        // 如果只有一个视频,直接设置为激活视频,不创建控制按钮
        if (videos.length === 1) {
            const video = videos[0];
            if (video.readyState >= 1) {
                // 如果这个视频还没有被设置为激活视频
                if (!activeVideo) {
                    activeVideo = video;
                    video.playbackRate = settings.defaultRate;
                }
                return activeVideo;
            }
            return null;
        }

        // 如果有多个视频,才创建控制按钮
        videos.forEach((video, index) => {
            // 跳过已经有控制按钮的视频
            if (videoControlButtons.has(video)) return;

            // 确保视频已经加载
            if (video.readyState >= 1) {
                createVideoControlButton(video, index + 1);

                // 设置默认播放速度
                video.playbackRate = settings.defaultRate;
            }
        });

        // 如果没有激活的视频,选择第一个
        if (!activeVideo && videos.length > 0) {
            activeVideo = videos[0];
        }

        return activeVideo;
    }

    // 等待视频元素加载
    function waitForVideoElement() {
        return new Promise((resolve, reject) => {
            const maxAttempts = 10;
            let attempts = 0;

            const checkVideo = () => {
                // 检测所有视频并设置控制按钮
                const video = detectAndSetupVideos();

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

                        // 如果还没有激活的视频，将YouTube视频设为激活状态
                        if (!activeVideo) {
                            activeVideo = youtubeVideo;
                            // 为YouTube视频创建控制按钮
                            if (!videoControlButtons.has(youtubeVideo)) {
                                createVideoControlButton(youtubeVideo, 1);
                            }
                        }

                        return activeVideo;
                    }
                    console.log('YouTube视频元素未就绪');
                    return null;
                } else {
                    return video; // 返回检测到的视频或null
                }
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

            // 创建一个观察器来监视新的视频元素
            videoObserver = new MutationObserver((mutations) => {
                detectAndSetupVideos();
            });

            videoObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
            activeObservers.add(videoObserver);

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

                // 确保有激活的视频
                if (!activeVideo) {
                    console.log('没有激活的视频');
                    return;
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
                    if (activeVideo.volume < 1) {
                        activeVideo.volume = Math.min(1, activeVideo.volume + 0.1);
                        showFloatingMessage(`音量：${Math.round(activeVideo.volume * 100)}%`);
                    }
                }

                if (e.code === 'ArrowDown') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    if (activeVideo.volume > 0) {
                        activeVideo.volume = Math.max(0, activeVideo.volume - 0.1);
                        showFloatingMessage(`音量：${Math.round(activeVideo.volume * 100)}%`);
                    }
                }

                // 全屏切换：回车键
                if (e.code === 'Enter') {
                    // ... existing code ...
                    // 注意：在全屏代码中，使用activeVideo替代video
                }

                // 快退/快进：左右方向键
                if (e.code === 'ArrowLeft') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    activeVideo.currentTime = Math.max(0, activeVideo.currentTime - 5);
                    showFloatingMessage(`快退 5 秒`);
                }

                // 右方向键：快进或倍速播放
                if (e.code === key) {
                    e.preventDefault();
                    e.stopImmediatePropagation();

                    // 第一次按下时保存原始速度
                    if (downCount === 0) {
                        originalRate = activeVideo.playbackRate;

                        // 设置定时器检测长按
                        rightKeyTimer = setTimeout(() => {
                            // 达到长按时间后，启用倍速播放
                            activeVideo.playbackRate = targetRate;
                            showFloatingMessage(`倍速播放: ${targetRate}x`);
                            downCount = 3; // 设置为长按状态
                        }, LONG_PRESS_DELAY);
                    }

                    downCount++;
                }

                // 增加目标倍速：+ 键
                if (e.code === increaseKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    targetRate = Math.min(16, targetRate + settings.targetRateStep);
                    showFloatingMessage(`目标倍速设置为: ${targetRate.toFixed(1)}x`);
                }

                // 减少目标倍速：- 键
                if (e.code === decreaseKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    targetRate = Math.max(0.1, targetRate - settings.targetRateStep);
                    showFloatingMessage(`目标倍速设置为: ${targetRate.toFixed(1)}x`);
                }

                // 快速增加当前倍速：] 键
                if (e.code === quickIncreaseKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    currentQuickRate = Math.min(16, activeVideo.playbackRate + settings.quickRateStep);
                    activeVideo.playbackRate = currentQuickRate;
                    showFloatingMessage(`播放速度: ${currentQuickRate.toFixed(1)}x`);
                }

                // 快速减少当前倍速：[ 键
                if (e.code === quickDecreaseKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    currentQuickRate = Math.max(0.1, activeVideo.playbackRate - settings.quickRateStep);
                    activeVideo.playbackRate = currentQuickRate;
                    showFloatingMessage(`播放速度: ${currentQuickRate.toFixed(1)}x`);
                }

                // 重置播放速度：P 键
                if (e.code === resetSpeedKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    activeVideo.playbackRate = 1.0;
                    currentQuickRate = 1.0;
                    showFloatingMessage(`播放速度重置为 1.0x`);
                }
            };

            // 按键释放事件
            keyupListener = (e) => {
                if (e.code === key) {
                    // 清除定时器
                    if (rightKeyTimer) {
                        clearTimeout(rightKeyTimer);
                        rightKeyTimer = null;

                        // 如果不是长按状态（downCount < 3），则执行快进
                        if (downCount < 3) {
                            activeVideo.currentTime = Math.min(activeVideo.duration, activeVideo.currentTime + 5);
                            showFloatingMessage(`快进 5 秒`);
                        }
                    }

                    // 如果是长按状态，恢复原始速度
                    if (downCount >= 3 && activeVideo) {
                        activeVideo.playbackRate = originalRate;
                        showFloatingMessage(`恢复播放速度: ${originalRate.toFixed(1)}x`);
                    }

                    downCount = 0;
                }
            };

            // 添加事件监听器
            document.addEventListener("keydown", keydownListener, true);
            document.addEventListener("keyup", keyupListener, true);

            // 监听URL变化（用于SPA网站）
            urlObserver = new MutationObserver(() => {
                if (location.href !== currentUrl) {
                    currentUrl = location.href;
                    console.log("URL变化，重新初始化");
                    cleanup();
                    setTimeout(() => {
                        init().catch(console.error);
                    }, 1000);
                }
            });

            urlObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
            activeObservers.add(urlObserver);

        } catch (error) {
            console.error("初始化失败:", error);
            // 如果是超时或未找到视频，尝试延迟重新初始化
            if (error && (error.type === "timeout" || error.type === "no_video")) {
                setTimeout(() => {
                    init().catch(console.error);
                }, 5000);
            }
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