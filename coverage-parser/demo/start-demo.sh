#!/bin/bash

# 启动本地服务器并打开演示页面

cd "$(dirname "$0")"

echo "🚀 启动本地服务器..."
echo "📄 文件位置: $(pwd)/coverage-parser-demo.html"
echo ""
echo "✅ 服务器启动后，请在浏览器访问："
echo "   http://localhost:8000/coverage-parser-demo.html"
echo ""
echo "按 Ctrl+C 停止服务器"
echo ""

# 启动 Python HTTP 服务器
python3 -m http.server 8000

