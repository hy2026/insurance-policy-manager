#!/usr/bin/env ts-node
/**
 * 批量导入所有批次的解析结果
 * 
 * 从解析结果目录导入批次1到批次15的所有数据
 * 
 * 使用方法（在coverage-parser/backend目录运行）:
 *   cd coverage-parser/backend
 *   npx ts-node scripts/import-all-batches.ts [起始批次] [结束批次]
 * 
 * 示例:
 *   npx ts-node scripts/import-all-batches.ts 1 15  # 导入批次1到15（约3000条）
 *   npx ts-node scripts/import-all-batches.ts 1 5   # 只导入批次1到5（约1000条）
 */

import fs from 'fs/promises';
import path from 'path';

// 使用require导入（因为tsconfig只包含src目录）
const { coverageLibraryStorage } = require('../src/services/parser/storage/coverageLibraryStorage');

// 解析结果目录（相对于backend目录）
// backend/scripts -> 项目根目录/解析结果
const 解析结果目录 = path.resolve(__dirname, '../../../解析结果');

/**
 * 导入单个批次文件
 */
async function importBatch(batchNumber: number) {
  const filename = `解析结果-批次${batchNumber}-序号${getBatchRange(batchNumber)}.json`;
  const filePath = path.join(解析结果目录, filename);

  try {
    console.log(`\n📂 处理批次${batchNumber}: ${filename}`);
    
    // 检查文件是否存在
    try {
      await fs.access(filePath);
    } catch {
      console.log(`  ⚠️  文件不存在，跳过`);
      return { success: 0, failed: 0, total: 0 };
    }

    // 读取文件
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(fileContent);

    // 提取cases数组
    const cases = data.cases || data.data || [];
    if (!Array.isArray(cases) || cases.length === 0) {
      console.log(`  ⚠️  文件中没有有效数据，跳过`);
      return { success: 0, failed: 0, total: 0 };
    }

    console.log(`  📊 找到 ${cases.length} 条记录`);

    // 调用导入方法
    const batchInfo = {
      批次: batchNumber,
      序号范围: data.序号范围 || data['序号范围'] || '',
      生成时间: data.生成时间 || data['生成时间'] || ''
    };

    const result = await coverageLibraryStorage.importFromJson(cases, batchInfo);

    console.log(`  ✅ 成功: ${result.success} 条`);
    if (result.failed > 0) {
      console.log(`  ❌ 失败: ${result.failed} 条`);
    }

    return {
      success: result.success,
      failed: result.failed,
      total: cases.length
    };

  } catch (error: any) {
    console.error(`  ❌ 导入批次${batchNumber}失败:`, error.message);
    if (error.stack) {
      console.error(`  错误堆栈:`, error.stack);
    }
    return { success: 0, failed: 0, total: 0, error: error.message };
  }
}

/**
 * 获取批次对应的序号范围（用于文件名匹配）
 */
function getBatchRange(batchNumber: number): string {
  const ranges: { [key: number]: string } = {
    1: '1-200',
    2: '201-400',
    3: '401-600',
    4: '601-800',
    5: '801-1000',
    6: '1001-1200',
    7: '1201-1400',
    8: '1401-1600',
    9: '1601-1800',
    10: '1801-2000',
    11: '2001-2200',
    12: '2201-2400',
    13: '2401-2600',
    14: '2601-2800',
    15: '2801-3000'
  };
  return ranges[batchNumber] || `${(batchNumber - 1) * 200 + 1}-${batchNumber * 200}`;
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  
  // 支持指定批次范围，例如：ts-node scripts/import-all-batches.ts 1 15
  let startBatch = 1;
  let endBatch = 15;

  if (args.length >= 1) {
    startBatch = parseInt(args[0]) || 1;
  }
  if (args.length >= 2) {
    endBatch = parseInt(args[1]) || 15;
  }

  console.log(`🚀 开始导入批次 ${startBatch} 到 ${endBatch}`);
  console.log(`📁 解析结果目录: ${解析结果目录}`);

  const stats = {
    totalBatches: 0,
    totalSuccess: 0,
    totalFailed: 0,
    totalRecords: 0
  };

  // 逐个批次导入
  for (let batch = startBatch; batch <= endBatch; batch++) {
    stats.totalBatches++;
    const result = await importBatch(batch);
    stats.totalSuccess += result.success || 0;
    stats.totalFailed += result.failed || 0;
    stats.totalRecords += result.total || 0;

    // 稍微延迟，避免数据库压力过大
    if (batch < endBatch) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // 显示汇总
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 导入完成汇总:`);
  console.log(`  - 处理批次: ${stats.totalBatches} 个`);
  console.log(`  - 总记录数: ${stats.totalRecords} 条`);
  console.log(`  - 成功导入: ${stats.totalSuccess} 条`);
  console.log(`  - 失败/跳过: ${stats.totalFailed} 条`);
  console.log(`${'='.repeat(50)}\n`);
}

// 执行
main().catch(error => {
  console.error('❌ 执行失败:', error);
  process.exit(1);
});

