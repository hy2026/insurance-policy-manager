# Railway部署修复指南

## 问题诊断

别人无法访问你的应用 `https://insurance-policy-manager-hy2026.vercel.app/my-policies`，错误信息：
- `ERR_CONNECTION_TIMED_OUT` - 连接超时
- 原因：Railway后端的CORS配置没有允许Vercel域名访问

## 已完成的修复

### 1. 前端优化
✅ 增加API超时时间：从3分钟改为5分钟（应对Railway冷启动）
✅ 添加自动重试机制：失败时提示用户重试
✅ 优化加载提示：告知用户首次访问需要等待30-60秒

### 2. 后端CORS修复
✅ 修改了 `backend/src/server.ts` 的CORS配置，允许Vercel域名访问

## 需要手动操作的步骤

### Railway后端部署

1. **推送代码到Git仓库**
   ```bash
   cd /Users/hanyang/Desktop/保险解析助手
   git add .
   git commit -m "修复CORS配置以支持Vercel前端访问"
   git push
   ```

2. **等待Railway自动部署**
   - Railway会自动检测到代码更新并重新部署
   - 部署时间：约2-3分钟
   - 访问 [Railway Dashboard](https://railway.app/) 查看部署状态

3. **（可选）在Railway设置环境变量**
   如果希望更灵活地配置CORS，可以在Railway设置：
   ```
   CORS_ORIGIN=https://insurance-policy-manager-hy2026.vercel.app
   ```

### Vercel前端部署

1. **推送前端代码**
   前端代码已经修复，推送后Vercel会自动部署：
   ```bash
   git add coverage-parser/frontend/
   git commit -m "优化加载体验，添加重试机制"
   git push
   ```

2. **等待Vercel自动部署**
   - Vercel会自动检测到代码更新并重新部署
   - 部署时间：约1-2分钟

## 验证步骤

部署完成后，按以下步骤验证：

1. **清除浏览器缓存**（重要！）
   - Chrome: `Ctrl+Shift+Delete` (Windows) 或 `Cmd+Shift+Delete` (Mac)
   - 选择"缓存的图片和文件"
   - 或者使用隐私/无痕模式测试

2. **访问应用**
   ```
   https://insurance-policy-manager-hy2026.vercel.app/my-policies
   ```

3. **预期行为**
   - 首次访问：看到"正在连接服务器..."提示，等待30-60秒
   - 后续访问：快速加载（Railway服务已热启动）
   - 如果超时：会弹出"连接超时"对话框，点击"重试"按钮

## 为什么会超时？

### Railway免费计划的特性
- **冷启动**：服务在无活动时会休眠
- **启动时间**：从休眠状态恢复需要30-60秒
- **解决方案**：
  1. 使用付费计划（保持服务常驻）
  2. 定期发送请求保持服务活跃（如每10分钟ping一次）
  3. 使用更耐心的超时设置（已实现）

## 长期解决方案建议

### 选项1：保持服务活跃（免费）
创建一个定时任务，每10分钟ping一次后端：
```javascript
// 可以在Vercel上部署一个简单的cron job
// vercel.json 添加：
{
  "crons": [{
    "path": "/api/ping-backend",
    "schedule": "*/10 * * * *"
  }]
}
```

### 选项2：升级Railway付费计划
- 月费约$5
- 服务常驻，无冷启动
- 更适合生产环境

### 选项3：使用其他云服务
- Render (有免费计划，但也有冷启动)
- Fly.io (有免费计划)
- Vercel Serverless Functions (适合小型API)

## 故障排查

如果部署后仍然无法访问：

1. **检查Railway部署状态**
   - 登录 [Railway Dashboard](https://railway.app/)
   - 查看部署日志是否有错误

2. **检查浏览器控制台**
   - 按 F12 打开开发者工具
   - 查看 Network 标签
   - 查看具体的错误信息

3. **测试后端直接访问**
   ```bash
   curl "https://insurance-policy-manager-production.up.railway.app/api/health"
   ```
   应该返回：`{"status":"ok",...}`

4. **检查CORS头**
   ```bash
   curl -I "https://insurance-policy-manager-production.up.railway.app/api/policies?userId=1" \
     -H "Origin: https://insurance-policy-manager-hy2026.vercel.app"
   ```
   应该看到：`access-control-allow-origin: https://insurance-policy-manager-hy2026.vercel.app`

## 联系支持

如果问题仍然存在，提供以下信息寻求帮助：
- Railway部署日志
- 浏览器控制台错误截图
- Network请求详细信息
