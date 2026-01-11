#!/bin/bash

echo "================================================"
echo "🔧 清理并重启后端服务"
echo "================================================"

# 1. 杀掉所有相关进程
echo "1️⃣ 清理旧进程..."
pkill -9 -f "ts-node-dev.*backend"
pkill -9 -f "npm.*backend"
lsof -ti:3001 | xargs kill -9 2>/dev/null
sleep 2

# 2. 清理日志文件
echo "2️⃣ 清理日志..."
cd /Users/hanyang/Desktop/保险解析助手/coverage-parser/backend
rm -f backend.log
touch backend.log

# 3. 检查端口是否释放
echo "3️⃣ 检查端口..."
if lsof -ti:3001 > /dev/null 2>&1; then
    echo "❌ 端口3001仍被占用，请手动清理"
    exit 1
else
    echo "✅ 端口3001已释放"
fi

# 4. 清理node缓存（解决请求队列卡住问题）
echo "4️⃣ 清理node缓存..."
rm -rf node_modules/.cache 2>/dev/null || true

# 5. 启动后端
echo "5️⃣ 启动后端服务..."
npm run dev > backend.log 2>&1 &
BACKEND_PID=$!
echo "   后端进程 PID: $BACKEND_PID"

# 6. 等待启动
echo "6️⃣ 等待服务启动..."
sleep 5

# 7. 检查服务状态
echo "7️⃣ 检查服务状态..."
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ 后端服务启动成功！"
    echo ""
    echo "📊 服务信息："
    echo "   - 地址: http://localhost:3001"
    echo "   - 日志: tail -f backend.log"
    echo "   - 健康检查: curl http://localhost:3001/health"
    echo ""
    echo "================================================"
else
    echo "❌ 后端服务启动失败，请查看日志："
    echo "   tail -50 backend.log"
    exit 1
fi

