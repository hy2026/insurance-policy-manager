/**
 * 训练数据管理路由
 */

import { Router } from 'express';
import { trainingDataExporter } from '../services/training/trainingDataExporter';
import { zhipuTrainingManager } from '../services/training/zhipuTrainingManager';

const router = Router();

// 导出训练数据
router.post('/export', async (req, res) => {
  try {
    const { version, exportType, verifiedOnly, minQuality } = req.body;

    if (!version) {
      return res.status(400).json({
        success: false,
        message: '缺少version参数'
      });
    }

    const result = await trainingDataExporter.export({
      version,
      exportType: exportType || 'full',
      verifiedOnly: verifiedOnly !== false,
      minQuality: minQuality || 'medium'
    });

    res.json(result);
  } catch (error: any) {
    console.error('导出训练数据失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '导出失败'
    });
  }
});

// 获取导出记录列表
router.get('/exports', async (req, res) => {
  try {
    const exports = await trainingDataExporter.listExports();
    res.json({
      success: true,
      data: exports
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || '查询失败'
    });
  }
});

// 获取导出记录详情
router.get('/exports/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const exportRecord = await trainingDataExporter.getExport(id);
    
    if (!exportRecord) {
      return res.status(404).json({
        success: false,
        message: '导出记录不存在'
      });
    }

    res.json({
      success: true,
      data: exportRecord
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || '查询失败'
    });
  }
});

// 上传到智谱平台
router.post('/upload', async (req, res) => {
  try {
    const { exportId } = req.body;

    if (!exportId) {
      return res.status(400).json({
        success: false,
        message: '缺少exportId参数'
      });
    }

    const result = await zhipuTrainingManager.uploadFile(exportId);
    res.json(result);
  } catch (error: any) {
    console.error('上传到智谱平台失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '上传失败'
    });
  }
});

// 启动训练任务
router.post('/train', async (req, res) => {
  try {
    const { exportId, modelName } = req.body;

    if (!exportId) {
      return res.status(400).json({
        success: false,
        message: '缺少exportId参数'
      });
    }

    const result = await zhipuTrainingManager.startTraining(exportId, modelName);
    res.json(result);
  } catch (error: any) {
    console.error('启动训练失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '训练失败'
    });
  }
});

// 查询训练状态
router.get('/jobs/:jobId', async (req, res) => {
  try {
    const jobId = req.params.jobId;
    const result = await zhipuTrainingManager.getJobStatus(jobId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || '查询失败'
    });
  }
});

export { router as trainingRouter };



