// Bun 的 fetch Unix socket 扩展类型声明
declare global {
  interface RequestInit {
    /** Unix socket 路径 (Bun 特有) */
    unix?: string;
  }
}

export {};
