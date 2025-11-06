# 🧪 测试计划与验证手册

## 📋 测试任务清单

### ✅ 已修复功能测试

#### 任务1：iframe域名递归扫描测试
- [ ] 创建3层嵌套iframe测试页面
- [ ] 启用脚本
- [ ] 验证所有域名被检测
- [ ] 检查控制台日志

#### 任务2：类型安全测试
- [ ] 破坏GM存储（设置null/字符串）
- [ ] 刷新页面
- [ ] 验证脚本正常启动
- [ ] 验证使用默认值

#### 任务3：目标倍速持久化测试
- [ ] 调整目标倍速到3.0
- [ ] 刷新页面
- [ ] 验证仍为3.0

#### 任务4：内存泄漏测试
- [ ] 多次导航触发URL变化
- [ ] 监控内存使用
- [ ] 验证无明显增长

#### 任务5：历史API拦截测试
- [ ] 使用pushState导航
- [ ] 验证触发重新初始化
- [ ] 验证监听器正确清理

---

## 🧪 详细测试步骤

### 测试1：iframe递归扫描

**测试代码**（创建test_nested_iframes.html）：
```html
<!DOCTYPE html>
<html>
<head><title>嵌套iframe测试</title></head>
<body>
    <h1>嵌套iframe测试</h1>

    <!-- 第1层iframe -->
    <iframe id="iframe1" src="about:blank" style="width:100%; height:300px; border:1px solid red;">
        <p>您的浏览器不支持iframe</p>
    </iframe>

    <script>
        // 动态创建嵌套iframe
        const iframe1 = document.getElementById('iframe1');
        iframe1.onload = function() {
            const doc1 = iframe1.contentDocument;
            doc1.write(`
                <!DOCTYPE html>
                <html>
                <head><title>Level 1</title></head>
                <body style="background:#ffeeee;">
                    <h2>第1层iframe</h2>
                    <iframe id="iframe2" src="https://www.youtube.com/embed/aqz-KE-bpKQ"
                            style="width:100%; height:250px; border:1px solid blue;">
                    </iframe>
                </body>
                </html>
            `);
            doc1.close();
        };
    </script>
</body>
</html>
```

**验证步骤**：
1. 打开测试页面
2. 按F12打开控制台
3. 点击Tampermonkey图标 → "在当前网站启用视频倍速控制"
4. 查看通知信息，应显示多个域名被启用
5. 检查控制台日志，应显示扫描到的iframe域名

**预期结果**：
```
已启用以下域名：
- 当前域名
- youtube.com
发现 1 个嵌入视频域名也已一并启用
```

---

### 测试2：类型安全

**测试步骤**：
1. 打开任意支持网站（如youtube.com）
2. 按F12打开控制台
3. 执行以下命令破坏存储：
   ```javascript
   // 破坏设置
   GM_setValue('defaultRate', null);
   GM_setValue('targetRate', 'invalid');
   GM_setValue('quickRateStep', undefined);

   // 破坏域名列表
   GM_setValue('tempEnabledDomains', 'not-an-array');
   ```
4. 刷新页面
5. 检查脚本是否正常加载
6. 播放视频，验证功能正常
7. 查看控制台无错误信息

**预期结果**：
- ✅ 脚本正常启动
- ✅ 使用默认值（defaultRate=1.0, targetRate=2.5等）
- ✅ 临时域名列表为空数组
- ✅ 控制台无错误

---

### 测试3：目标倍速持久化

**测试步骤**：
1. 打开YouTube视频页面
2. 安装修复后的脚本（确保启用）
3. 按`+`键多次，将目标倍速调整为3.0
4. 看到提示"目标倍速设置为: 3.00x"
5. 刷新页面（F5）
6. 再次按`+`键，观察当前显示的倍速
7. 应该是3.0基础上再加步长（如3.5）

**预期结果**：
- ✅ 刷新后目标倍速保持3.0
- ✅ 设置确实被持久化
- ✅ 可以继续调整

**替代验证方法**：
在控制台执行：
```javascript
GM_getValue('targetRate') // 应返回3.0
```

---

### 测试4：内存泄漏检测

**测试步骤**：
1. 打开Chrome浏览器
2. 按Ctrl+Shift+I → Performance/Memory标签
3. 访问YouTube首页
4. 记录初始内存使用（如50MB）
5. 多次导航到不同视频页面（触发URL变化）
   - 点击推荐视频
   - 手动修改URL
   - 使用浏览器前进/后退
6. 每次导航后记录内存使用
7. 观察10次导航后的内存增长

**预期结果**：
- ✅ 内存增长 < 5MB（可接受范围）
- ✅ 无持续增长趋势
- ✅ 页面关闭后内存释放

**监控代码**（在控制台执行）：
```javascript
let count = 0;
setInterval(() => {
    if (window.performance && performance.memory) {
        console.log(`导航 ${++count} 次 - 内存: ${(performance.memory.usedJSHeapSize/1024/1024).toFixed(2)}MB`);
    }
}, 2000);
```

---

### 测试5：历史API拦截

**测试步骤**：
1. 打开任意网站（如example.com）
2. 按F12打开控制台
3. 安装脚本并启用
4. 执行以下代码测试pushState：
   ```javascript
   history.pushState({page: 1}, "Title", "?page=1");
   console.log('pushState触发');
   setTimeout(() => console.log('2秒后'), 2000);
   ```
5. 检查控制台
6. 观察是否触发"URL发生变化，重新初始化"
7. 多次执行，验证每次都触发

**预期结果**：
- ✅ 每次pushState都触发重新初始化
- ✅ 控制台显示URL变化日志
- ✅ 无错误信息

---

## 🚨 回归测试

### 确保原有功能未受影响

#### 功能1：长按右键倍速
- [ ] 长按→键进入倍速
- [ ] 松开恢复正常速度
- [ ] 短按→键快进5秒

#### 功能2：键盘快捷键
- [ ] `]` / `[` - 快速调速
- [ ] `P` - 重置速度
- [ ] `↑/↓` - 音量控制
- [ ] `Enter` - 全屏切换
- [ ] `←/→` - 快退/快进
- [ ] `Space` - 播放/暂停

#### 功能3：菜单命令
- [ ] 设置菜单可正常修改
- [ ] 重新扫描功能正常
- [ ] 临时启用/禁用正常

#### 功能4：网站支持
- [ ] YouTube正常
- [ ] Bilibili正常
- [ ] 其他网站可临时启用

---

## 📊 测试结果记录模板

```
=== 测试结果记录 ===

测试日期：___________
浏览器版本：___________
Tampermonkey版本：___________
脚本版本：v1.4.1

测试结果：
[✓] 测试1：iframe递归扫描
    结果：___________
    备注：___________

[✓] 测试2：类型安全
    结果：___________
    备注：___________

[✓] 测试3：目标倍速持久化
    结果：___________
    备注：___________

[✓] 测试4：内存泄漏
    结果：___________
    备注：___________

[✓] 测试5：历史API拦截
    结果：___________
    备注：___________

总体评价：
□ 通过所有测试
□ 发现问题（见备注）

签名：___________
```

---

## 🛠️ 故障排除

### 问题1：脚本无法启用

**可能原因**：
- Tampermonkey未安装或未启用
- 脚本被浏览器阻止
- 页面URL不匹配

**解决方案**：
1. 检查Tampermonkey图标是否显示
2. 检查脚本是否在管理面板中启用
3. 尝试手动添加域名到@match

---

### 问题2：快捷键不响应

**可能原因**：
- 输入框获得焦点
- 与网站快捷键冲突
- 脚本初始化失败

**解决方案**：
1. 点击页面空白处取消焦点
2. 检查控制台错误
3. 使用"重新扫描"功能

---

### 问题3：设置无法保存

**可能原因**：
- 浏览器隐私模式
- 存储空间不足
- 权限问题

**解决方案**：
1. 关闭隐私模式
2. 清理浏览器缓存
3. 检查控制台存储权限

---

## 📞 支持与反馈

如测试中发现问题，请提供：
1. 详细复现步骤
2. 浏览器控制台错误日志
3. 操作系统和浏览器版本
4. 测试页面URL（如适用）

---

**测试计划版本**：v1.0
**最后更新**：2025-11-06