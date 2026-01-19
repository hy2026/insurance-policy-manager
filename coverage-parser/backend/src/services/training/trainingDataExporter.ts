/**
 * 训练数据导出服务
 * 
 * 职责：
 * 1. 从责任库导出训练数据（JSONL格式）
 * 2. 符合智谱平台要求
 * 3. 记录导出版本
 */

import prisma from '../../prisma';
import fs from 'fs/promises';
import path from 'path';

interface TrainingDataItem {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
}

interface ExportOptions {
  version: string;
  exportType?: 'full' | 'incremental';
  outputDir?: string;
  verifiedOnly?: boolean;
  minQuality?: 'high' | 'medium' | 'low';
}

export class TrainingDataExporter {
  /**
   * 导出训练数据
   */
  async export(options: ExportOptions) {
    const {
      version,
      exportType = 'full',
      outputDir = './training_data/exports',
      verifiedOnly = true,
      minQuality = 'medium'
    } = options;

    console.log(`📤 [训练数据导出] 开始导出版本: ${version}`);

    // 1. 查询符合条件的责任数据
    const coverages = await this.fetchCoverages(verifiedOnly, minQuality);
    console.log(`✅ [训练数据导出] 查询到 ${coverages.length} 条责任数据`);

    if (coverages.length === 0) {
      throw new Error('没有符合条件的训练数据');
    }

    // 2. 转换为JSONL格式
    const trainingData = this.convertToJsonl(coverages);

    // 3. 统计分布
    const breakdown = this.calculateBreakdown(coverages);

    // 4. 写入文件
    const fileName = `training_${version}_${exportType}_${Date.now()}.jsonl`;
    const filePath = path.join(outputDir, fileName);
    
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(filePath, trainingData.join('\n'));

    // 5. 获取文件大小
    const stats = await fs.stat(filePath);
    const fileSizeKb = Math.round(stats.size / 1024);

    console.log(`✅ [训练数据导出] 文件已保存: ${filePath}`);
    console.log(`📊 [训练数据导出] 文件大小: ${fileSizeKb} KB`);

    // 6. 记录导出
    const exportRecord = await prisma.trainingExport.create({
      data: {
        exportVersion: version,
        exportType,
        totalSamples: coverages.length,
        verifiedSamples: coverages.filter(c => c.verified).length,
        coverageBreakdown: breakdown,
        filePath,
        fileSizeKb,
        trainingStatus: 'exported',
        exportedAt: new Date()
      }
    });

    console.log(`✅ [训练数据导出] 导出记录已保存，ID: ${exportRecord.id}`);

    return {
      success: true,
      exportId: exportRecord.id,
      filePath,
      totalSamples: coverages.length,
      breakdown
    };
  }

  /**
   * 查询责任数据
   */
  private async fetchCoverages(verifiedOnly: boolean, minQuality?: string) {
    const where: any = {
      isTrainingSample: true
    };

    if (verifiedOnly) {
      where.verified = true;
    }

    if (minQuality) {
      const qualityLevels = ['low', 'medium', 'high'];
      const minIndex = qualityLevels.indexOf(minQuality);
      where.annotationQuality = {
        in: qualityLevels.slice(minIndex)
      };
    }

    return await prisma.insuranceCoverageLibrary.findMany({
      where,
      include: {
        product: {
          select: {
            insuranceCompany: true,
            productName: true,
            policyType: true,
            policyDocumentId: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });
  }

  /**
   * 转换为JSONL格式（符合智谱平台要求）
   */
  private convertToJsonl(coverages: any[]): string[] {
    return coverages.map(coverage => {
      const systemPrompt = this.buildSystemPrompt();
      const userMessage = this.buildUserMessage(coverage);
      const assistantMessage = this.buildAssistantMessage(coverage);

      const item: TrainingDataItem = {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
          { role: 'assistant', content: assistantMessage }
        ]
      };

      return JSON.stringify(item);
    });
  }

  /**
   * 构建System Prompt
   */
  private buildSystemPrompt(): string {
    return `你是一个专业的保险条款解析助手，擅长从复杂的保险合同条款中提取结构化信息。

你的任务是将保险条款原文解析为JSON格式，包含以下字段：
- payoutAmount: 赔付金额（支持复利、单利、Max比较、已交保费等）
- payoutCount: 赔付次数
- intervalPeriod: 间隔期
- waitingPeriod: 等待期
- grouping: 是否分组
- repeatablePayout: 是否可重复赔付
- premiumWaiver: 是否豁免保费
- conditions: 附加条件

请严格按照JSON格式输出，确保数据准确。`;
  }

  /**
   * 构建User Message
   */
  private buildUserMessage(coverage: any): string {
    const { clauseText, coverageType, coverageName, product } = coverage;

    return `请解析以下保险条款：

保险公司：${product.insuranceCompany}
产品名称：${product.productName}
保单文件：${product.policyDocumentId || '未知'}
责任类型：${coverageType}
责任名称：${coverageName}

原文条款：
${clauseText}`;
  }

  /**
   * 构建Assistant Message（标准答案）
   */
  private buildAssistantMessage(coverage: any): string {
    const { parsedResult } = coverage;

    if (!parsedResult) {
      throw new Error(`责任 ${coverage.id} 缺少解析结果`);
    }

    return JSON.stringify(parsedResult, null, 2);
  }

  /**
   * 计算责任类型分布
   */
  private calculateBreakdown(coverages: any[]) {
    const breakdown: Record<string, number> = {};

    coverages.forEach(coverage => {
      const type = coverage.coverageType || 'unknown';
      breakdown[type] = (breakdown[type] || 0) + 1;
    });

    return breakdown;
  }

  /**
   * 获取导出记录列表
   */
  async listExports() {
    return await prisma.trainingExport.findMany({
      orderBy: { exportedAt: 'desc' },
      take: 50
    });
  }

  /**
   * 获取导出记录详情
   */
  async getExport(id: number) {
    return await prisma.trainingExport.findUnique({
      where: { id }
    });
  }
}

// 导出单例
export const trainingDataExporter = new TrainingDataExporter();



































