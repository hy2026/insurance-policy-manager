/**
 * Prisma Client 单例
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  // 日志配置：
  // - 生产环境：只记录错误
  // - 开发环境：记录错误和警告（不记录查询，避免日志过多）
  // - 如需调试查询，可临时改为 ['query', 'error', 'warn']
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

export default prisma;

