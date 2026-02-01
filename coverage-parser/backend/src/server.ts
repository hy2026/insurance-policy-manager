/**
 * Coverage Parser Backend Server
 * 
 * 独立的保险条款解析服务
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { parseRouter } from './routes/parseRouter';
import { policyRouter } from './routes/policyRouter';
import { productRouter } from './routes/productRouter';
import { trainingRouter } from './routes/trainingRouter';
import { coverageLibraryRouter } from './routes/coverageLibraryRouter';
import insuredPersonRoutes from './routes/insuredPersonRoutes';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors({
  origin: process.env.CORS_ORIGIN || [
    'http://localhost:5173',
    'https://insurance-policy-manager-hy2026.vercel.app'
  ],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'coverage-parser-backend',
    timestamp: new Date().toISOString()
  });
});

// API 路由
app.use('/api/parse', parseRouter);
app.use('/api/policies', policyRouter);
app.use('/api/products', productRouter);
app.use('/api/training', trainingRouter);
app.use('/api/coverage-library', coverageLibraryRouter);
app.use('/api/insured-persons', insuredPersonRoutes);

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path
  });
});

// 错误处理
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 Coverage Parser Backend running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🤖 LLM Provider: ${process.env.LLM_PROVIDER || 'zhipu'}`);
});

export default app;

