#!/bin/bash
# 验证 Podman 安装（无根模式）

set -e

echo "正在验证 Podman 无根模式..."
echo ""

# 确保服务已就绪
echo "等待 Podman 服务就绪..."
sleep 2

# 运行 hello-world 容器并捕获输出
OUTPUT=$(podman run --rm hello-world 2>&1)
EXIT_CODE=$?

# 检查命令是否成功执行
if [ $EXIT_CODE -ne 0 ]; then
    echo "✗ 验证失败！Podman 运行出错"
    echo "错误信息:"
    echo "$OUTPUT"
    exit 1
fi

# 检查输出中是否包含欢迎信息
if echo "$OUTPUT" | grep -q "Hello"; then
    echo "$OUTPUT"
    echo ""
    echo "✓ 验证成功！Podman 安装成功且无根模式工作正常"
else
    echo "✗ 验证失败！未检测到预期的欢迎信息"
    echo "输出内容:"
    echo "$OUTPUT"
    exit 1
fi
