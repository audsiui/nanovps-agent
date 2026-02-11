#!/bin/sh

# 1. 如果没密钥，生成一下
[ ! -f /etc/ssh/ssh_host_rsa_key ] && ssh-keygen -A

# 2. 如果给了密码变量，改 root 密码 (利用 busybox 自带功能)
[ -n "$ROOT_PASSWORD" ] && echo "root:$ROOT_PASSWORD" | chpasswd

# 3. 启动 OpenRC
exec /sbin/openrc-init