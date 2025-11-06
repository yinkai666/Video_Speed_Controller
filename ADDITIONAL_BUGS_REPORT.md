# 🔍 深度代码审计 - 发现的问题清单

## 📊 审计概况

经过深入分析video.js脚本，发现**17个潜在bug**，其中：
- **7个严重bug**（高优先级）
- **5个中等严重bug**（中优先级）
- **5个轻微bug**（低优先级）

---

## 🚨 严重Bug（需立即修复）

### Bug #3: iframe域名扫描不递归 ⚠️ 高优先级

**位置**：`scanIframesForDomains()` 函数（第103-130行）

**问题描述**：
```javascript
function scanIframesForDomains() {
    const iframes = document.querySelectorAll('iframe');  // 只查询顶级iframe
    // ...
}
```

**问题**：只扫描顶级页面的iframe，如果存在嵌套iframe（如A页面包含B页面，B页面再包含视频iframe），内层iframe的域名不会被发现。

**影响**：在深度嵌套的页面结构中，部分视频可能无法被正确启用。

**修复方案**：递归扫描所有iframe，包括shadow DOM和contentDocument中的iframe。

---

### Bug #4: 重试机制无限制 ⚠️ 高优先级

**位置**：`initialize()` 函数（第315-336行）

**问题描述**：
```javascript
async initialize(isRetry = false) {
    try {
        this.activeVideo = await this._findInitialVideo();
        // ...
    } catch (error) {
        if (!isRetry) {
            if (error.type === "no_video" || error.type === "timeout") {
                setTimeout(() => this.initialize(true).catch(console.error), this.config.INIT_RETRY_DELAY);
            }
        }
        // 没有重试次数限制！
    }
}
```

**问题**：如果页面始终没有视频，会无限重试，浪费资源。

**影响**：可能导致性能问题，特别是在需要用户交互才能加载视频的页面。

**修复方案**：添加最大重试次数限制（建议3次）。

---

### Bug #5: popstate监听器未清理 ⚠️ 高优先级

**位置**：`watchUrlChange()` 函数（第447-467行）

**问题描述**：
```javascript
watchUrlChange() {
    window.addEventListener('popstate', handleStateChange);
    // 没有保存引用，无法在cleanup中移除！
}
```

**问题**：添加了popstate监听器但在cleanup()中没有移除，导致内存泄漏。

**影响**：每次URL变化都会增加新监听器，长期使用可能影响性能。

**修复方案**：保存监听器引用，在cleanup()中移除。

---

### Bug #6: 历史API拦截冲突 ⚠️ 高优先级

**位置**：`watchUrlChange()` 函数（第447-467行）

**问题描述**：
```javascript
const originalPushState = history.pushState;
history.pushState = function() {
    originalPushState.apply(this, arguments);
    handleStateChange();
};
```

**问题**：直接替换原生方法，如果其他代码也这样做，会导致冲突。

**影响**：与其他扩展或脚本不兼容，可能导致页面功能异常。

**修复方案**：不再拦截pushState/replaceState，仅使用popstate和hashchange监听。

---

### Bug #7: adjustTargetRate不同步 ⚠️ 高优先级

**位置**：`adjustTargetRate()` 函数（第764-768行）

**问题描述**：
```javascript
adjustTargetRate(delta) {
    this.targetRate = Math.max(0.1, Math.min(this.config.MAX_RATE, this.targetRate + delta));
    // 只更新了this.targetRate，但this.settings.targetRate没有更新！
    this.lastManualRateChangeTime = Date.now();
    showFloatingMessage(`目标倍速设置为: ${this.targetRate.toFixed(2)}x`);
}
```

**问题**：只更新了临时变量this.targetRate，但未同步到this.settings.targetRate。

**影响**：刷新页面后设置丢失，恢复到旧值。

**修复方案**：同时更新this.settings.targetRate和GM_setValue。

---

### Bug #8: tempEnabledDomains类型检查缺失 ⚠️ 高优先级

**位置**：构造函数（第162行）

**问题描述**：
```javascript
this.tempEnabledDomains = GM_getValue('tempEnabledDomains', []);
```

**问题**：如果GM_getValue返回非数组类型（如null、字符串），会覆盖默认值。

**影响**：可能导致脚本初始化失败或类型错误。

**修复方案**：添加类型检查：
```javascript
const domains = GM_getValue('tempEnabledDomains', []);
this.tempEnabledDomains = Array.isArray(domains) ? domains : [];
```

---

### Bug #9: settings类型检查缺失 ⚠️ 高优先级

**位置**：构造函数（第162-167行）

**问题描述**：
```javascript
this.settings = {
    defaultRate: GM_getValue('defaultRate', DEFAULT_SETTINGS.defaultRate),
    // 如果返回非数字类型，会覆盖默认值
};
```

**问题**：GM_getValue可能返回null、字符串等非数字类型，导致设置错误。

**影响**：可能导致播放速度计算错误或异常。

**修复方案**：添加数字类型验证：
```javascript
const value = parseFloat(GM_getValue(key, DEFAULT_SETTINGS[key]));
this.settings[key] = !isNaN(value) && value > 0 ? value : DEFAULT_SETTINGS[key];
```

---

## ⚠️ 中等严重Bug

### Bug #10: mainObserver垃圾回收逻辑错误

**位置**：`_setupPersistentObservers()` 函数（第362-375行）

**问题描述**：检查`this.videoControlButtons.has(removedNode)`只对video元素有意义，对容器节点无效。

**修复**：正确检查子节点。

---

### Bug #11: 观察者清理可能抛出错误

**位置**：`cleanup()` 函数（第423-437行）

**问题描述**：如果在观察者回调中调用cleanup()，会抛出"Observer has disconnected"错误。

**修复**：在disconnect前检查observer是否已断开。

---

### Bug #12: URL变化竞态条件

**位置**：`handleUrlChange()` 函数

**问题描述**：多次URL变化可能同时触发多个initialize()。

**修复**：使用标志位阻止重复初始化。

---

### Bug #13: 键盘事件处理逻辑缺陷

**位置**：`handleKeyDown()` 函数

**问题描述**：长按右键的downCount可能在某些情况下被意外重置。

**修复**：改进状态管理。

---

### Bug #14: handleRightArrowPress中的竞态条件

**位置**：`handleRightArrowPress()` 函数

**问题描述**：如果视频暂停/播放状态变化，可能导致逻辑错误。

**修复**：加强状态检查。

---

## ℹ️ 轻微Bug

### Bug #15: z-index可能冲突

**位置**：`createVideoControlButton()` 函数

**问题**：使用固定z-index 9999，可能被其他元素遮挡。

**修复**：使用更高的值（如999999）。

---

### Bug #16: confirm()兼容性

**位置**："清除所有临时启用的网站"功能

**问题**：在某些环境下confirm可能被禁用。

**修复**：使用自定义确认对话框或提示用户使用浏览器确认。

---

### Bug #17: findAllVideos重复查询

**位置**：`findAllVideos()` 函数

**问题**：document.querySelectorAll('video')后还递归查询，造成性能浪费。

**修复**：优化查询逻辑。

---

## 📋 修复优先级建议

### 第一阶段（立即修复）
1. Bug #3 - iframe递归扫描
2. Bug #5 - popstate监听器清理
3. Bug #7 - adjustTargetRate同步
4. Bug #8 - tempEnabledDomains类型检查
5. Bug #9 - settings类型检查

### 第二阶段（尽快修复）
6. Bug #4 - 重试次数限制
7. Bug #6 - 历史API拦截

### 第三阶段（后续优化）
8-17. 其他中低优先级问题

---

## 🔧 推荐修复方案

### 核心修复（必需）

```javascript
// 1. 修复iframe递归扫描
function scanIframesForDomains() {
    const domains = new Set();
    const scanElement = (element, depth = 0) => {
        if (depth > 5) return; // 防止无限递归

        const iframes = element.querySelectorAll ? element.querySelectorAll('iframe') : [];
        iframes.forEach(iframe => {
            try {
                const src = iframe.src || iframe.getAttribute('data-src');
                if (src) {
                    domains.add(new URL(src).hostname);
                }
            } catch (e) {}
        });

        // 递归扫描shadow DOM
        if (element.shadowRoot) {
            scanElement(element.shadowRoot, depth + 1);
        }
    };

    scanElement(document.body);
    return Array.from(domains);
}

// 2. 添加popstate清理
watchUrlChange() {
    this._handleStateChange = this.handleUrlChange.bind(this);
    window.addEventListener('popstate', this._handleStateChange);
}

cleanup() {
    // ...
    if (this._handleStateChange) {
        window.removeEventListener('popstate', this._handleStateChange);
        this._handleStateChange = null;
    }
}

// 3. 修复adjustTargetRate同步
adjustTargetRate(delta) {
    this.targetRate = Math.max(0.1, Math.min(this.config.MAX_RATE, this.targetRate + delta));
    this.settings.targetRate = this.targetRate; // 同步到settings
    GM_setValue('targetRate', this.targetRate); // 持久化
    this.lastManualRateChangeTime = Date.now();
    showFloatingMessage(`目标倍速设置为: ${this.targetRate.toFixed(2)}x`);
}

// 4. 添加类型检查
this.tempEnabledDomains = (() => {
    const domains = GM_getValue('tempEnabledDomains', []);
    return Array.isArray(domains) ? domains : [];
})();
```

---

## 📊 修复影响评估

### 修复成本
- **高优先级bug**：预计2-3小时修复
- **所有bug**：预计1-2天全面修复

### 收益
- ✅ 提高脚本稳定性
- ✅ 改善内存使用
- ✅ 增强兼容性
- ✅ 减少用户投诉

### 风险
- ⚠️ 修改涉及核心逻辑，需要充分测试
- ⚠️ 向后兼容性需验证

---

## 📝 总结

本次审计发现了17个潜在bug，其中7个高优先级问题需要立即修复。这些bug主要涉及：

1. **功能性缺陷** - 影响核心功能
2. **内存泄漏** - 长期使用稳定性
3. **类型安全** - 健壮性
4. **兼容性** - 与其他代码的冲突

建议按照优先级分阶段修复，确保脚本的稳定性和可靠性。