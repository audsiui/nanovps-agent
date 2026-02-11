#!/bin/bash

# 1. 处理密码环境变量
if [ -n "$ROOT_PASSWORD" ]; then
    echo "root:$ROOT_PASSWORD" | chpasswd
fi

# 2. 确保 SSH Host Keys 存在 (防止构建时被清理)
# Debian 的 sshd 通常会自动处理，但为了双重保险：
if [ ! -f /etc/ssh/ssh_host_rsa_key ]; then
    ssh-keygen -A
fi

# 3. 移交控制权给 Systemd
# 注意：必须用 exec，且必须指向 /sbin/init (它是 systemd 的链接)
exec /sbin/init