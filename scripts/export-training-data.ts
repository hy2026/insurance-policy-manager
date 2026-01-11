#!/usr/bin/env ts-node
/**
 * 导出训练数据脚本
 * 
 * 使用方法:
 *   ts-node scripts/export-training-data.ts v1.0
 */

import { trainingDataExporter } from '../coverage-parser/backend/src/services/training/trainingDataExporter';

async function main() {
  const version = process.argv[2] || `v${Date.now()}`;
  
  console.log(`🚀 开始导出训练数据，版本: ${version}`);

  try {
    const result = await trainingDataExporter.export({
      version,
      exportType: 'full',
      verifiedOnly: true,
      minQuality: 'medium'
    });

    console.log('\n✅ 导出成功!');
    console.log(`📁 文件路径: ${result.filePath}`);
    console.log(`📊 样本数量: ${result.totalSamples}`);
    console.log(`📈 责任分布:`, JSON.stringify(result.breakdown, null, 2));

  } catch (error: any) {
    console.error('❌ 导出失败:', error.message);
    process.exit(1);
  }
}

main();
































