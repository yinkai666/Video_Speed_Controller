// ==UserScript==
// @name         视频倍速播放增强版
// @name:en      Enhanced Video Speed Controller
// @namespace    http://tampermonkey.net/
// @version      1.3.6
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
    // 记录用户最近手动调整播放速度的时间戳
    let lastManualRateChangeTime = 0;
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

    // 调试开关
    const DEBUG = false;

    // 检测页面中的所有视频并添加控制按钮
    function detectAndSetupVideos() {
        // 收集所有视频元素，包括常规DOM、iframe和Shadow DOM中的视频
        const allVideos = [];
        
        // 1. 常规DOM中的视频
        const regularVideos = document.querySelectorAll('video');
        regularVideos.forEach(video => allVideos.push(video));
        
        // 2. 查找所有iframe
        try {
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(iframe => {
                try {
                    // 只尝试访问同源iframe
                    if (iframe.src && !iframe.src.startsWith(window.location.origin)) return;
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (iframeDoc) {
                        const iframeVideos = iframeDoc.querySelectorAll('video');
                        iframeVideos.forEach(video => allVideos.push(video));
                    }
                } catch (e) {
                    // 不再输出任何内容，避免刷屏
                    // console.log('无法访问iframe内容（可能是跨域限制）:', e);
                }
            });
        } catch (e) {
            if (DEBUG) console.log('处理iframe时出错:', e);
        }
        
        // 3. 查找所有Shadow DOM
        try {
            // 获取所有可能包含Shadow DOM的元素
            const allElements = document.querySelectorAll('*');
            allElements.forEach(el => {
                try {
                    // 检查元素是否有Shadow Root
                    if (el.shadowRoot) {
                        const shadowVideos = el.shadowRoot.querySelectorAll('video');
                        shadowVideos.forEach(video => allVideos.push(video));
                    }
                } catch (e) {
                    // 忽略访问Shadow DOM时的错误
                }
            });
        } catch (e) {
            if (DEBUG) console.log('处理Shadow DOM时出错:', e);
        }
        
        if (DEBUG) console.log(`找到视频元素总数: ${allVideos.length}`);
        
        if (allVideos.length === 0) return null;

        // 检查是否为哔哩哔哩或YouTube网站
    const isBilibili = currentDomain.includes('bilibili.com');
    const isYoutube = currentDomain.includes('youtube.com');
    
    // 如果只有一个视频,直接设置为激活视频,不创建控制按钮
    if (allVideos.length === 1) {
        const video = allVideos[0];
        if (video.readyState >= 1) {
            // 如果这个视频还没有被设置为激活视频
            if (!activeVideo) {
                activeVideo = video;
                // 仅当用户最近未手动调整过播放速度时才设置默认速度
                if (Date.now() - lastManualRateChangeTime > 5000) {
                    video.playbackRate = settings.defaultRate;
                }
            }
            return activeVideo;
        }
        return null;
    }
    
    // 如果有多个视频，根据网站类型决定是否创建控制按钮
    if (isBilibili || isYoutube) {
        // 检查当前的 activeVideo 是否仍然有效
        const isActiveVideoValid = activeVideo && 
                                  allVideos.includes(activeVideo) && 
                                  activeVideo.readyState >= 1 &&
                                  !activeVideo.paused !== undefined; // 确保视频元素仍然有效
        
        if (isActiveVideoValid) {
            // 如果当前的 activeVideo 仍然有效，不要改变它
            // console.log('保持当前的 activeVideo');
            return activeVideo;
        }
        
        // 只有在 activeVideo 无效时才重新寻找主视频
        let mainVideo = null;
        
        if (isBilibili) {
            // 在哔哩哔哩中，优先选择正在播放的视频
            mainVideo = allVideos.find(video => !video.paused && video.currentTime > 0) ||
                       allVideos.find(video => {
                           const rect = video.getBoundingClientRect();
                           return rect.width > 400 && rect.height > 200;
                       }) || allVideos[0];
        } else if (isYoutube) {
            mainVideo = allVideos.find(video => 
                video.classList.contains('html5-main-video') ||
                video.classList.contains('video-stream')
            ) || allVideos[0];
        }
        
        if (mainVideo && mainVideo.readyState >= 1) {
            activeVideo = mainVideo;
            // 仅当用户最近未手动调整过播放速度时才设置默认速度
            if (Date.now() - lastManualRateChangeTime > 5000) {
                mainVideo.playbackRate = settings.defaultRate;
            }
            console.log('设置新的主视频为 activeVideo');
        }
    } else {
        // 在其他网站中，创建控制按钮
        allVideos.forEach((video, index) => {
            // 跳过已经有控制按钮的视频
            if (videoControlButtons.has(video)) return;

            // 确保视频已经加载
            if (video.readyState >= 1) {
                createVideoControlButton(video, index + 1);
                // 仅当用户最近未手动调整过播放速度时才设置默认速度
                if (Date.now() - lastManualRateChangeTime > 5000) {
                    video.playbackRate = settings.defaultRate;
                }
                // 如果还没有激活视频，将第一个可用视频设为激活视频
                if (!activeVideo) {
                    activeVideo = video;
                }
            }
        });
    }

    return activeVideo;
    }

    // 等待视频元素加载
    function waitForVideoElement() {
        return new Promise((resolve, reject) => {
            const maxAttempts = 20; // 增加最大尝试次数
            let attempts = 0;

            const checkVideo = () => {
                console.log(`尝试检测视频元素 (${attempts+1}/${maxAttempts})...`);
                
                // 检测所有视频并设置控制按钮
                const video = detectAndSetupVideos();

                // 添加对特定网站的特殊处理
                // YouTube 特殊处理
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
                        }

                        return activeVideo;
                    }
                    console.log('YouTube视频元素未就绪');
                }
                
                return video; // 返回检测到的视频或null
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
                    // 在控制台中显示调试信息
                    console.log("调试信息: 页面上的iframe数量:", document.querySelectorAll('iframe').length);
                    console.log("调试信息: 页面上的video标签数量:", document.querySelectorAll('video').length);
                    
                    // 尝试手动激活脚本
                    // showFloatingMessage("未找到视频元素，请尝试在菜单中手动启用此网站");
                    reject({ type: "no_video" }); // 使用对象替代 Error
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
            });
            activeObservers.add(observer);

            // 设置超时（增加到20秒）
            setTimeout(() => {
                observer.disconnect();
                activeObservers.delete(observer);
                console.warn("等待视频元素超时，脚本已停止运行");
                // 显示超时消息
                // showFloatingMessage("视频检测超时，请尝试在菜单中手动启用此网站");
                reject({ type: "timeout" }); // 使用对象替代 Error
            }, 10000); // 增加到20秒
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

    // 尝试深度查找视频元素，包括处理复杂的嵌入式播放器
    function deepFindVideoElements() {
        console.log('开始深度查找视频元素...');
        const foundVideos = [];
        
        // 递归查找函数
        function findVideosInElement(element, depth = 0) {
            if (depth > 10) return; // 防止无限递归
            
            // 检查当前元素是否为video
            if (element.tagName && element.tagName.toLowerCase() === 'video') {
                console.log('找到视频元素:', element);
                foundVideos.push(element);
                return;
            }
            
            // 检查Shadow DOM
            if (element.shadowRoot) {
                try {
                    const shadowVideos = element.shadowRoot.querySelectorAll('video');
                    shadowVideos.forEach(video => {
                        console.log('在Shadow DOM中找到视频:', video);
                        foundVideos.push(video);
                    });
                    
                    // 继续递归查找Shadow DOM中的其他元素
                    const shadowChildren = element.shadowRoot.querySelectorAll('*');
                    shadowChildren.forEach(child => findVideosInElement(child, depth + 1));
                } catch (e) {
                    console.log('访问Shadow DOM时出错:', e);
                }
            }
            
            // 检查iframe
            if (element.tagName && element.tagName.toLowerCase() === 'iframe') {
                try {
                    const iframeDoc = element.contentDocument || element.contentWindow?.document;
                    if (iframeDoc) {
                        const iframeVideos = iframeDoc.querySelectorAll('video');
                        iframeVideos.forEach(video => {
                            console.log('在iframe中找到视频:', video);
                            foundVideos.push(video);
                        });
                        
                        // 继续递归查找iframe中的元素
                        const iframeChildren = iframeDoc.querySelectorAll('*');
                        iframeChildren.forEach(child => findVideosInElement(child, depth + 1));
                    }
                } catch (e) {
                    console.log('访问iframe内容时出错（可能是跨域限制）:', e);
                }
            }
            
            // 递归查找子元素
            if (element.children && element.children.length > 0) {
                Array.from(element.children).forEach(child => {
                    findVideosInElement(child, depth + 1);
                });
            }
        }
        
        // 从body开始递归查找
        findVideosInElement(document.body);

        
        console.log(`深度查找完成，共找到 ${foundVideos.length} 个视频元素`);
        return foundVideos;
    }
    
    // 初始化脚本
    async function init() {
        cleanup();

        try {
            // 先尝试常规方法查找视频
            let video = await waitForVideoElement();
            
            // 如果常规方法失败，尝试深度查找
            if (!video) {
                console.log('常规方法未找到视频，尝试深度查找...');
                const deepVideos = deepFindVideoElements();
                
                if (deepVideos.length > 0) {
                    // 使用找到的第一个视频
                    video = deepVideos[0];
                    activeVideo = video;
                    // 仅当用户最近未手动调整过播放速度时才设置默认速度
                    if (Date.now() - lastManualRateChangeTime > 5000) {
                        video.playbackRate = settings.defaultRate;
                    }
                    // 如果有多个视频，为它们创建控制按钮
                    if (deepVideos.length > 1) {
                        deepVideos.forEach((v, index) => {
                            if (!videoControlButtons.has(v) && v.readyState >= 1) {
                                createVideoControlButton(v, index + 1);
                            }
                        });
                    }
                    showFloatingMessage(`通过深度查找发现了 ${deepVideos.length} 个视频元素`);
                } else {
                    throw { type: "no_video" };
                }
            }
            
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
                        if (activeVideo.requestFullscreen) {
                            activeVideo.requestFullscreen();
                        } else if (activeVideo.webkitRequestFullscreen) {
                            activeVideo.webkitRequestFullscreen();
                        } else if (activeVideo.msRequestFullscreen) {
                            activeVideo.msRequestFullscreen();
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
                
                // 空格键暂停/播放功能
                if (e.code === 'Space') {
                    // 检查是否在输入框中
                    const isInInputField = (element) => {
                        if (!element || !element.tagName) return false;
                        const tagName = element.tagName.toLowerCase();
                        return tagName === 'input' || tagName === 'textarea' || element.isContentEditable;
                    };
                    
                    if (isInInputField(e.target)) {
                        return; // 如果在输入框中，不拦截空格键
                    }
                    
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    
                    // 直接使用视频元素的原生播放/暂停API
                    if (activeVideo) {
                        if (activeVideo.paused) {
                            activeVideo.play();
                            showFloatingMessage('播放');
                        } else {
                            activeVideo.pause();
                            showFloatingMessage('暂停');
                        }
                    }
                }

                // 快退/快进：左右方向键
                if (e.code === 'ArrowLeft') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    
                    // 检查视频是否暂停，如果是则先播放
                    if (activeVideo.paused) {
                        activeVideo.play();
                    }
                    
                    activeVideo.currentTime = Math.max(0, activeVideo.currentTime - 5);
                    showFloatingMessage(`快退 5 秒`);
                }

                // 右方向键：快进或倍速播放
                if (e.code === key) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    
                    // 检查视频是否暂停，如果是则先播放
                    if (activeVideo.paused) {
                        activeVideo.play();
                    }

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
                    lastManualRateChangeTime = Date.now();
                    showFloatingMessage(`目标倍速设置为: ${targetRate.toFixed(1)}x`);
                }

                // 减少目标倍速：- 键
                if (e.code === decreaseKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    targetRate = Math.max(0.1, targetRate - settings.targetRateStep);
                    lastManualRateChangeTime = Date.now();
                    showFloatingMessage(`目标倍速设置为: ${targetRate.toFixed(1)}x`);
                }

                // 快速增加当前倍速：] 键
                if (e.code === quickIncreaseKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    currentQuickRate = Math.min(16, activeVideo.playbackRate + settings.quickRateStep);
                    activeVideo.playbackRate = currentQuickRate;
                    lastManualRateChangeTime = Date.now();
                    showFloatingMessage(`播放速度: ${currentQuickRate.toFixed(1)}x`);
                }

                // 快速减少当前倍速：[ 键
                if (e.code === quickDecreaseKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    currentQuickRate = Math.max(0.1, activeVideo.playbackRate - settings.quickRateStep);
                    activeVideo.playbackRate = currentQuickRate;
                    lastManualRateChangeTime = Date.now();
                    showFloatingMessage(`播放速度: ${currentQuickRate.toFixed(1)}x`);
                }

                // 重置播放速度：P 键
                if (e.code === resetSpeedKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    activeVideo.playbackRate = 1.0;
                    currentQuickRate = 1.0;
                    lastManualRateChangeTime = Date.now();
                    showFloatingMessage(`播放速度重置为 1.0x`);
                }

                // 逐帧播放：, 和 . 键 (视频暂停时)
                if (activeVideo && activeVideo.paused) {
                    if (e.code === 'Comma') { // Previous frame
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        activeVideo.currentTime = Math.max(0, activeVideo.currentTime - (1 / 30));
                        showFloatingMessage(`上一帧`);
                    }

                    if (e.code === 'Period') { // Next frame
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        activeVideo.currentTime = Math.min(activeVideo.duration, activeVideo.currentTime + (1 / 30));
                        showFloatingMessage(`下一帧`);
                    }
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