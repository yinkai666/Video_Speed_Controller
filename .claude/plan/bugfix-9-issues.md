# 📋 实施计划：Video Speed Controller 9个Bug修复

## 任务类型
- [x] 前端 (→ Gemini)
- [x] 后端 (→ Codex)
- [x] 全栈 (→ 并行)

## 技术方案

综合 Codex 后端分析 + Gemini 前端 UX 分析，采用分阶段修复策略：

1. **阶段1 - 交互与可访问性**：修复键盘导航、失焦恢复、长按判定
2. **阶段2 - 视觉反馈与性能**：Toast防抖、DOM扫描优化
3. **阶段3 - 稳定性与状态**：空引用保护、设置同步、初始化锁、内存管理

---

## 实施步骤

### 步骤 1: Bug1 - Enter键破坏键盘导航

**问题**：`isInputFocused` 只检测 `INPUT`/`TEXTAREA`/`contentEditable`，遗漏 `BUTTON`/`A`/`SELECT` 等交互元素

**修复位置**：`video-speed-controller.js:721-722`

**修复方案**：
```javascript
// 原代码
const isInputFocused = path.some(el => el.isContentEditable || ['INPUT', 'TEXTAREA'].includes(el.tagName));

// 修复后
const isInteractiveElement = (el) => {
    if (!el || !el.tagName) return false;
    const interactiveTags = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'];
    return el.isContentEditable ||
           interactiveTags.includes(el.tagName) ||
           el.getAttribute?.('role') === 'button' ||
           el.getAttribute?.('role') === 'textbox' ||
           el.getAttribute?.('role') === 'link';
};
const isInputFocused = path.some(isInteractiveElement);
```

**预期产物**：用户 Tab 到按钮/链接后按 Enter 不再触发全屏

---

### 步骤 2: Bug2 - 长按右键失焦后速度卡住

**问题**：恢复速度逻辑只在 `handleKeyUp`，失焦时 `keyup` 事件丢失

**修复位置**：
- `video-speed-controller.js:336-354` (setupEventListeners)
- 新增 `_resetSpeedOnBlur` 方法

**修复方案**：
```javascript
// 在 setupEventListeners 末尾添加
this.blurListener = this._resetSpeedOnBlur.bind(this);
this.visibilityListener = this._resetSpeedOnBlur.bind(this);
window.addEventListener('blur', this.blurListener);
document.addEventListener('visibilitychange', this.visibilityListener);

// 新增方法
_resetSpeedOnBlur() {
    // 如果正在长按状态，强制恢复速度
    if (this.rightKeyTimer || this.downCount > 0) {
        clearTimeout(this.rightKeyTimer);
        this.rightKeyTimer = null;
        this.downCount = 0;
        if (this.activeVideo && this.originalRate) {
            this.activeVideo.playbackRate = this.originalRate;
            Logger.debug("失焦时恢复播放速度:", this.originalRate);
        }
    }
}

// cleanup 中添加清理
window.removeEventListener('blur', this.blurListener);
document.removeEventListener('visibilitychange', this.visibilityListener);
```

**预期产物**：Alt+Tab 或切换标签页后，视频速度自动恢复正常

---

### 步骤 3: Bug3 - seek() 空引用崩溃

**问题**：`seek()`、`togglePlayPause()`、`resetPlaybackRate()`、`frameStep()` 等方法直接访问 `activeVideo` 无判空

**修复位置**：
- `video-speed-controller.js:1630-1638` (togglePlayPause)
- `video-speed-controller.js:1640-1644` (seek)
- `video-speed-controller.js:1682-1686` (resetPlaybackRate)
- `video-speed-controller.js:1688-1693` (frameStep)
- `video-speed-controller.js:1647-1662` (handleRightArrowPress)

**修复方案**：
```javascript
// seek 方法
seek(delta) {
    if (!this.activeVideo) return;
    if (this.activeVideo.paused) this.activeVideo.play();
    this.activeVideo.currentTime = Math.max(0, this.activeVideo.currentTime + delta);
    showFloatingMessage(`快${delta > 0 ? '进' : '退'} ${this.config.SEEK_STEP_SECONDS} 秒`);
}

// togglePlayPause 方法
togglePlayPause() {
    if (!this.activeVideo) return;
    // ... 原有逻辑
}

// resetPlaybackRate 方法
resetPlaybackRate() {
    if (!this.activeVideo) return;
    // ... 原有逻辑
}

// frameStep 方法
frameStep(direction) {
    if (!this.activeVideo) return;
    if (this.activeVideo.paused) {
        // ... 原有逻辑
    }
}

// handleRightArrowPress 方法
handleRightArrowPress() {
    if (!this.activeVideo) return;
    // ... 原有逻辑
}
```

**预期产物**：视频被移除时按快捷键不再报错

---

### 步骤 4: Bug4 - 菜单修改设置后不生效

**问题**：
1. `_initializeKeyHandlers` 使用 `.bind()` 固化步长值
2. `updateSetting` 未同步 `this.targetRate`

**修复位置**：
- `video-speed-controller.js:783-799` (updateSetting)
- `video-speed-controller.js:1572-1589` (_initializeKeyHandlers)

**修复方案**：

方案A - 运行时读取设置（推荐）：
```javascript
// 修改 _initializeKeyHandlers，改为运行时读取
_initializeKeyHandlers() {
    this.keyHandlers = {
        'ArrowUp': this.adjustVolume.bind(this, this.config.VOLUME_STEP),
        'ArrowDown': this.adjustVolume.bind(this, -this.config.VOLUME_STEP),
        'Enter': this.toggleFullScreen.bind(this),
        'Space': this.togglePlayPause.bind(this),
        'ArrowLeft': this.seek.bind(this, -this.config.SEEK_STEP_SECONDS),
        'ArrowRight': this.handleRightArrowPress.bind(this),
        // 以下改为运行时读取 settings
        'Equal': () => this.adjustTargetRate(this.settings.targetRateStep),
        'Minus': () => this.adjustTargetRate(-this.settings.targetRateStep),
        'BracketRight': () => this.adjustPlaybackRate(this.settings.quickRateStep),
        'BracketLeft': () => this.adjustPlaybackRate(-this.settings.quickRateStep),
        'KeyP': this.resetPlaybackRate.bind(this),
        'Comma': this.frameStep.bind(this, -1),
        'Period': this.frameStep.bind(this, 1),
    };
}

// 修改 updateSetting，同步 targetRate
updateSetting(key, promptMessage, max = this.config.MAX_RATE) {
    const newValue = prompt(promptMessage, this.settings[key]);
    if (newValue !== null) {
        const value = parseFloat(newValue);
        if (!isNaN(value) && value >= 0.1 && value <= max) {
            this.settings[key] = value;
            GM_setValue(key, value);
            showFloatingMessage(`设置已更新: ${value}`);

            // 同步 targetRate 实例变量
            if (key === 'targetRate') {
                this.targetRate = value;
            }

            if (key === 'defaultRate' && this.activeVideo) {
                this.activeVideo.playbackRate = value;
            }
        } else {
            showFloatingMessage(`设置失败: 请输入有效的值 (0.1-${max})`);
        }
    }
}
```

**预期产物**：菜单修改倍速/步长后立即生效，无需刷新页面

---

### 步骤 5: Bug5 - 初始化竞态重复监听器

**问题**：`handleUrlChange` 和重试逻辑都用 `setTimeout`，无去重和初始化锁

**修复位置**：
- `video-speed-controller.js:460-498` (constructor，添加状态变量)
- `video-speed-controller.js:803-836` (initialize)
- `video-speed-controller.js:1098-1103` (handleUrlChange)

**修复方案**：
```javascript
// constructor 中添加
this._isInitializing = false;
this._initRetryTimer = null;
this._urlChangeTimer = null;

// initialize 方法
async initialize(isRetry = false) {
    // 初始化锁
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

    this._cleanupForReinit();

    try {
        this.activeVideo = await this._findInitialVideo();
        Logger.info("初始化成功, 找到视频:", this.activeVideo);
        this._cleanupFallbackObserver();
        this._setupPersistentObservers();
        this.setupEventListeners();
        this.watchUrlChange();
    } catch (error) {
        Logger.warn("初始化尝试失败:", error.message);
        if (!isRetry) {
            if (error.type === "no_video" || error.type === "timeout") {
                this._initRetryTimer = setTimeout(() => {
                    this._isInitializing = false;
                    this.initialize(true).catch(e => Logger.error("重试初始化失败:", e));
                }, this.config.INIT_RETRY_DELAY);
                return; // 不在这里重置 _isInitializing
            }
        } else {
            Logger.info("重试失败，准备设置后备监听器...");
            try {
                this._setupFallbackVideoObserver();
            } catch (e) {
                Logger.error("设置后备监听器时出错:", e);
            }
        }
    } finally {
        // 只有在不等待重试时才重置
        if (!this._initRetryTimer) {
            this._isInitializing = false;
        }
    }
}

// handleUrlChange 方法
handleUrlChange() {
    this.currentUrl = location.href;
    Logger.info("URL发生变化，重新初始化...");

    // 清理旧的 URL 变化定时器
    if (this._urlChangeTimer) {
        clearTimeout(this._urlChangeTimer);
    }

    this._urlChangeTimer = setTimeout(() => {
        this._urlChangeTimer = null;
        this._isInitializing = false; // 重置锁，允许新初始化
        this.initialize().catch(e => Logger.error("URL变化后初始化失败:", e));
    }, this.config.URL_CHANGE_INIT_DELAY);
}
```

**预期产物**：快速切换视频时不再产生重复监听器

---

### 步骤 6: Bug6 - 长按判定逻辑在高键盘重复率下失效

**问题**：`downCount` 和 `setTimeout` 混合逻辑在高键盘重复率下冲突

**修复位置**：
- `video-speed-controller.js:476-477` (constructor，添加时间戳)
- `video-speed-controller.js:1647-1662` (handleRightArrowPress)
- `video-speed-controller.js:1542-1568` (handleKeyUp 中的 ArrowRight 处理)

**修复方案**：改用纯时间戳判定
```javascript
// constructor 中添加
this._rightKeyDownTime = 0;

// handleRightArrowPress 方法 - 简化为纯时间戳
handleRightArrowPress() {
    if (!this.activeVideo) return;
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
}

// handleKeyUp 中的 ArrowRight 处理
if (e.code === 'ArrowRight') {
    if (e._videoControllerHandled) return;
    e._videoControllerHandled = true;
    if (this._rightKeyUpHandled) return;
    this._rightKeyUpHandled = true;

    clearTimeout(this.rightKeyTimer);
    this.rightKeyTimer = null;

    const pressDuration = Date.now() - this._rightKeyDownTime;
    this._rightKeyDownTime = 0; // 重置

    if (pressDuration < this.LONG_PRESS_DELAY) {
        // 短按 - 快进
        this.seek(this.config.SEEK_STEP_SECONDS);
    } else {
        // 长按 - 恢复速度
        if (this.activeVideo) {
            this.activeVideo.playbackRate = this.originalRate;
            showFloatingMessage(`恢复播放速度: ${this.originalRate.toFixed(1)}x`);
        }
    }
}
```

**预期产物**：无论键盘重复率设置如何，短按/长按判定都准确稳定

---

### 步骤 7: Bug9 - 内存泄漏 videoControlButtons 强引用

**问题**：`Map` 对 key 使用强引用，阻止视频元素被 GC

**修复位置**：
- `video-speed-controller.js:475` (videoControlButtons 定义)
- 相关方法需要适配 WeakMap 特性

**修复方案**：
```javascript
// constructor 中
this.videoControlButtons = new WeakMap();
this._videoControlButtonsList = new Set(); // 用于遍历按钮（WeakMap 不可遍历）

// createVideoControlButton 中
this.videoControlButtons.set(video, button);
this._videoControlButtonsList.add(button);

// cleanup 和 _cleanupForReinit 中
this._videoControlButtonsList.forEach(button => button.remove());
this._videoControlButtonsList.clear();
// 注意：WeakMap 不需要 clear()

// switchActiveVideo 中
this._videoControlButtonsList.forEach((btn) => {
    this.resetButtonStyle(btn);
});

// 垃圾回收逻辑中（mainObserver）
// WeakMap 会自动清理，但按钮仍需手动移除
if (this.videoControlButtons.has(video)) {
    const button = this.videoControlButtons.get(video);
    if (button) {
        button.remove();
        this._videoControlButtonsList.delete(button);
    }
    // WeakMap 条目会自动消失
}
```

**预期产物**：长时间使用后内存不再持续增长

---

### 步骤 8: Bug10 - 全量 DOM 扫描性能抖动

**问题**：`findAllVideos` 每次全量遍历 document + shadowRoot + iframe

**修复位置**：
- `video-speed-controller.js:1003-1036` (mainObserver 回调)
- `video-speed-controller.js:1214-1242` (findAllVideos)

**修复方案**：增量扫描
```javascript
// mainObserver 回调中，只扫描新增节点
mutations.forEach(mutation => {
    // ... 垃圾回收逻辑保持不变 ...

    // 检查是否有新视频被添加 - 改为增量检测
    mutation.addedNodes.forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        // 直接检查新增节点
        if (node.tagName === 'VIDEO') {
            this._handleNewVideo(node);
        }

        // 检查新增节点的子节点中的视频（限制深度）
        if (node.querySelectorAll) {
            const videos = node.querySelectorAll('video');
            videos.forEach(v => this._handleNewVideo(v));
        }
    });
});

// 新增辅助方法
_handleNewVideo(video) {
    if (this._isValidVideo(video) && !this.videoControlButtons.has(video)) {
        Logger.debug("增量检测到新视频:", video);
        this.debouncedDetectAndSetupVideos();
    }
}

// findAllVideos 优化 - 限制 shadowRoot 遍历深度
findAllVideos() {
    const allVideos = new Set(document.querySelectorAll('video'));
    const MAX_DEPTH = 3; // 限制深度

    const findIn = (root, depth = 0) => {
        if (depth > MAX_DEPTH) return;
        try {
            root.querySelectorAll('video').forEach(v => allVideos.add(v));
            root.querySelectorAll('iframe').forEach(f => {
                try {
                    if (f.contentDocument) findIn(f.contentDocument, depth + 1);
                } catch(e) {/* cross-origin */}
            });
            // 只在浅层检查 shadowRoot
            if (depth < 2) {
                root.querySelectorAll('*').forEach(el => {
                    if (el.shadowRoot) findIn(el.shadowRoot, depth + 1);
                });
            }
        } catch(e) {/* ignore */}
    };
    findIn(document);

    // 过滤无效视频
    return Array.from(allVideos).filter(this._isValidVideo.bind(this));
}
```

**预期产物**：复杂页面上快捷键响应更流畅

---

### 步骤 9: Bug11 - Toast 消息视觉干扰

**问题**：`showFloatingMessage` 每次都创建新 DOM 元素，高频调用导致闪烁

**修复位置**：
- `video-speed-controller.js:117-139` (showFloatingMessage)

**修复方案**：单例 Toast + 防抖
```javascript
// 替换整个 showFloatingMessage 函数
const Toast = (function() {
    let element = null;
    let hideTimer = null;
    let fadeTimer = null;

    function create() {
        element = document.createElement("div");
        Object.assign(element.style, {
            position: "fixed",
            top: "10px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            color: "white",
            padding: "8px 16px",
            borderRadius: "4px",
            zIndex: "10000",
            fontFamily: "Arial, sans-serif",
            fontSize: "14px",
            transition: "opacity 0.3s ease-out",
            opacity: "0",
            pointerEvents: "none"
        });
        document.body.appendChild(element);
    }

    return {
        show(message) {
            if (!element) create();

            // 清除旧定时器
            clearTimeout(hideTimer);
            clearTimeout(fadeTimer);

            // 更新内容并显示
            element.textContent = message;
            element.style.opacity = "1";

            // 2秒后开始淡出
            hideTimer = setTimeout(() => {
                element.style.opacity = "0";
                // 淡出动画结束后可选择移除或保留
                fadeTimer = setTimeout(() => {
                    // 保留元素，下次复用
                }, 300);
            }, 2000);
        }
    };
})();

function showFloatingMessage(message) {
    Toast.show(message);
}
```

**预期产物**：连续调节音量/速度时不再出现屏幕闪烁

---

## 关键文件

| 文件 | 操作 | 说明 |
|------|------|------|
| video-speed-controller.js:117-139 | 重写 | Toast 单例化 |
| video-speed-controller.js:460-498 | 修改 | 添加状态变量 |
| video-speed-controller.js:721-722 | 修改 | isInputFocused 增强 |
| video-speed-controller.js:336-354 | 修改 | 添加 blur/visibility 监听 |
| video-speed-controller.js:783-799 | 修改 | updateSetting 同步 targetRate |
| video-speed-controller.js:803-836 | 修改 | 添加初始化锁 |
| video-speed-controller.js:1098-1103 | 修改 | handleUrlChange 防重复 |
| video-speed-controller.js:1542-1568 | 修改 | ArrowRight keyup 时间戳判定 |
| video-speed-controller.js:1572-1589 | 修改 | keyHandlers 运行时读取 |
| video-speed-controller.js:1630-1693 | 修改 | 添加 activeVideo 判空 |
| video-speed-controller.js:1647-1662 | 修改 | handleRightArrowPress 时间戳 |
| video-speed-controller.js:475 | 修改 | WeakMap + Set |
| video-speed-controller.js:1003-1036 | 修改 | 增量 DOM 扫描 |
| video-speed-controller.js:1214-1242 | 修改 | findAllVideos 深度限制 |

---

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| WeakMap 不可遍历 | 使用辅助 Set 存储按钮引用 |
| 初始化锁可能导致死锁 | finally 块确保锁释放，URL 变化时重置锁 |
| 时间戳判定在系统休眠后不准 | 休眠会触发 visibilitychange，会重置状态 |
| Toast 单例可能被外部代码移除 | 每次 show 时检查元素是否存在 |
| 增量扫描可能遗漏嵌套视频 | 保留定时轮询作为兜底 |

---

## 测试策略

### 单元测试场景
1. **Bug1**: 模拟 Tab 到 button 后按 Enter，验证不触发全屏
2. **Bug2**: 模拟长按右键后触发 blur 事件，验证速度恢复
3. **Bug3**: 设置 activeVideo = null 后调用 seek()，验证不报错
4. **Bug4**: 调用 updateSetting('targetRate', ...)，验证 this.targetRate 同步
5. **Bug5**: 连续调用 initialize() 5次，验证只执行1次
6. **Bug6**: 模拟 50ms 内 10 次 keydown，验证仍判定为短按
7. **Bug9**: 移除视频元素，验证 WeakMap 条目被清理
8. **Bug10**: 添加 100 个 DOM 节点（无视频），验证不触发全量扫描
9. **Bug11**: 连续调用 showFloatingMessage 10次，验证只有1个 Toast 元素

### 集成测试场景
1. YouTube 上 Tab 导航 + Enter 点击订阅按钮
2. Bilibili 上长按倍速后 Alt+Tab 切换窗口
3. SPA 页面快速切换 5 个视频
4. 高键盘重复率设置下短按右键

---

## SESSION_ID（供 /ccg:execute 使用）

- CODEX_SESSION: (调用失败，无 SESSION_ID)
- GEMINI_SESSION: 8dcd15a6-cb93-495e-be57-638b4efd39cf
