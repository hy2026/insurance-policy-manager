/**
 * 智谱训练管理服务
 * 
 * 职责：
 * 1. 上传训练数据到智谱平台
 * 2. 启动微调任务
 * 3. 查询训练状态
 * 4. 管理模型版本
 */

import prisma from '../../prisma';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

export class ZhipuTrainingManager {
  private apiKey: string;
  private baseUrl = 'https://open.bigmodel.cn/api/paas/v4';

  constructor() {
    const apiKey = process.env.ZHIPU_API_KEY;
    if (!apiKey) {
      throw new Error('ZHIPU_API_KEY 环境变量未设置');
    }
    this.apiKey = apiKey;
  }

  /**
   * 上传训练文件到智谱平台
   */
  async uploadFile(exportId: number) {
    console.log(`📤 [智谱训练] 上传文件，exportId: ${exportId}`);

    // 1. 获取导出记录
    const exportRecord = await prisma.trainingExport.findUnique({
      where: { id: exportId }
    });

    if (!exportRecord) {
      throw new Error(`导出记录不存在: ${exportId}`);
    }

    if (!exportRecord.filePath) {
      throw new Error('文件路径为空');
    }

    // 2. 准备FormData
    const formData = new FormData();
    formData.append('file', fs.createReadStream(exportRecord.filePath));
    formData.append('purpose', 'fine-tune');

    // 3. 上传到智谱
    try {
      const response = await axios.post(
        `${this.baseUrl}/files`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            ...formData.getHeaders()
          },
          timeout: 60000
        }
      );

      const fileId = response.data.id;
      console.log(`✅ [智谱训练] 文件上传成功，fileId: ${fileId}`);

      // 4. 更新导出记录
      await prisma.trainingExport.update({
        where: { id: exportId },
        data: {
          trainingStatus: 'uploaded',
          zhipuJobId: fileId // 暂时存储fileId，启动训练后会更新为jobId
        }
      });

      return {
        success: true,
        fileId,
        message: '文件上传成功'
      };

    } catch (error: any) {
      console.error('❌ [智谱训练] 上传失败:', error.response?.data || error.message);
      throw new Error(`上传失败: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * 启动微调任务
   */
  async startTraining(exportId: number, modelName?: string) {
    console.log(`🚀 [智谱训练] 启动训练任务，exportId: ${exportId}`);

    // 1. 获取导出记录
    const exportRecord = await prisma.trainingExport.findUnique({
      where: { id: exportId }
    });

    if (!exportRecord) {
      throw new Error(`导出记录不存在: ${exportId}`);
    }

    if (exportRecord.trainingStatus !== 'uploaded') {
      throw new Error('请先上传文件');
    }

    const fileId = exportRecord.zhipuJobId;
    if (!fileId) {
      throw new Error('文件ID为空，请重新上传');
    }

    // 2. 启动微调任务
    try {
      const response = await axios.post(
        `${this.baseUrl}/fine_tuning/jobs`,
        {
          model: 'glm-4', // 基础模型
          training_file: fileId,
          suffix: modelName || `v${exportRecord.exportVersion}`,
          hyperparameters: {
            n_epochs: 3, // 训练轮次
            batch_size: 8,
            learning_rate_multiplier: 1.0
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const jobId = response.data.id;
      const fineTunedModel = response.data.fine_tuned_model;

      console.log(`✅ [智谱训练] 训练任务已启动，jobId: ${jobId}`);

      // 3. 更新导出记录
      await prisma.trainingExport.update({
        where: { id: exportId },
        data: {
          trainingStatus: 'training',
          zhipuJobId: jobId,
          zhipuModelId: fineTunedModel || null
        }
      });

      return {
        success: true,
        jobId,
        fineTunedModel,
        message: '训练任务已启动'
      };

    } catch (error: any) {
      console.error('❌ [智谱训练] 启动失败:', error.response?.data || error.message);
      throw new Error(`启动失败: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * 查询训练任务状态
   */
  async getJobStatus(jobId: string) {
    console.log(`🔍 [智谱训练] 查询任务状态，jobId: ${jobId}`);

    try {
      const response = await axios.get(
        `${this.baseUrl}/fine_tuning/jobs/${jobId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          },
          timeout: 30000
        }
      );

      const status = response.data.status;
      const fineTunedModel = response.data.fine_tuned_model;

      console.log(`📊 [智谱训练] 任务状态: ${status}`);

      // 更新数据库状态
      const exportRecord = await prisma.trainingExport.findFirst({
        where: { zhipuJobId: jobId }
      });

      if (exportRecord) {
        let trainingStatus = 'training';
        if (status === 'succeeded') trainingStatus = 'completed';
        else if (status === 'failed' || status === 'cancelled') trainingStatus = 'failed';

        await prisma.trainingExport.update({
          where: { id: exportRecord.id },
          data: {
            trainingStatus,
            zhipuModelId: fineTunedModel || exportRecord.zhipuModelId
          }
        });
      }

      return {
        success: true,
        jobId,
        status,
        fineTunedModel,
        details: response.data
      };

    } catch (error: any) {
      console.error('❌ [智谱训练] 查询失败:', error.response?.data || error.message);
      throw new Error(`查询失败: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * 列出所有训练任务
   */
  async listJobs(limit: number = 20) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/fine_tuning/jobs`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          },
          params: { limit },
          timeout: 30000
        }
      );

      return {
        success: true,
        jobs: response.data.data
      };

    } catch (error: any) {
      console.error('❌ [智谱训练] 查询列表失败:', error.response?.data || error.message);
      throw new Error(`查询失败: ${error.response?.data?.error?.message || error.message}`);
    }
  }
}

// 导出单例
export const zhipuTrainingManager = new ZhipuTrainingManager();
































