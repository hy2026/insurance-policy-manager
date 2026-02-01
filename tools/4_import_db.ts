#!/usr/bin/env ts-node
/**
 * 统一数据库导入工具
 * 版本：v3.0
 * 
 * 功能：
 *   - 导入解析结果到数据库
 *   - 支持批量导入
 *   - 支持覆盖/追加模式
 * 
 * 使用方法：
 *   ts-node 4_import_db.ts --file ../解析结果/解析结果-批次16.json
 *   ts-node 4_import_db.ts --file ../解析结果/解析结果-批次16.json --mode append
 *   ts-node 4_import_db.ts --batch 16  # 自动查找批次16的文件
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface ImportOptions {
  file?: string;
  batch?: number;
  mode: 'replace' | 'append';  // replace: 清空后导入, append: 追加
}

async function loadJsonFile(filePath: string): Promise<any> {
  const fullPath = path.resolve(filePath);
  
  if (!fs.existsSync(fullPath)) {
    throw new Error(`文件不存在: ${fullPath}`);
  }
  
  const content = fs.readFileSync(fullPath, 'utf-8');
  return JSON.parse(content);
}

async function findBatchFile(batchNum: number): Promise<string> {
  // 尝试在解析结果目录查找
  const resultsDir = path.join(__dirname, '..', '解析结果');
  const files = fs.readdirSync(resultsDir);
  
  const batchFile = files.find(f => 
    f.includes(`批次${batchNum}`) && f.endsWith('.json')
  );
  
  if (!batchFile) {
    throw new Error(`未找到批次${batchNum}的解析结果文件`);
  }
  
  return path.join(resultsDir, batchFile);
}

async function clearLibrary() {
  console.log('清空责任库...');
  
  try {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "insurance_coverage_library" RESTART IDENTITY;'
    );
    console.log('✅ 已清空并重置ID序列');
  } catch (e: any) {
    console.warn(`⚠️ TRUNCATE失败，回退到deleteMany: ${e?.message || e}`);
    const deleteResult = await prisma.insuranceCoverageLibrary.deleteMany({});
    console.log(`✅ 已删除 ${deleteResult.count} 条记录`);
  }
}

async function importCases(cases: any[], mode: 'replace' | 'append') {
  console.log(`导入模式: ${mode === 'replace' ? '覆盖' : '追加'}`);
  console.log(`共 ${cases.length} 个案例`);
  
  let successCount = 0;
  let failCount = 0;
  const batchSize = 100;
  
  // 分批导入
  for (let i = 0; i < cases.length; i += batchSize) {
    const batch = cases.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(cases.length / batchSize);
    
    console.log(`批次 ${batchNum}/${totalBatches}: 导入 ${batch.length} 条（序号 ${batch[0].序号}-${batch[batch.length - 1].序号}）...`);
    
    for (const case_ of batch) {
      try {
        // 查找或创建产品
        let product = await prisma.product.findFirst({
          where: { productName: case_.保单ID号 }
        });
        
        if (!product) {
          product = await prisma.product.create({
            data: {
              productName: case_.保单ID号,
              productType: case_.责任类型 || '其他'
            }
          });
        }
        
        // 插入责任记录
        await prisma.insuranceCoverageLibrary.create({
          data: {
            coverageName: case_.责任名称,
            clauseText: case_.责任原文 || '',
            parsedResult: case_,
            productId: product.id
          }
        });
        
        successCount++;
      } catch (error: any) {
        console.error(`  ❌ 导入失败 - 序号${case_.序号}: ${error.message}`);
        failCount++;
      }
    }
    
    console.log(`  ✓ 批次 ${batchNum}/${totalBatches}: 插入 ${batch.length - failCount} 条（序号 ${batch[0].序号}-${batch[batch.length - 1].序号}）`);
  }
  
  return { successCount, failCount };
}

async function importData(options: ImportOptions) {
  try {
    console.log('='*80);
    console.log('统一数据库导入工具');
    console.log('='*80);
    console.log();
    
    // 1. 确定文件路径
    let filePath: string;
    
    if (options.file) {
      filePath = options.file;
    } else if (options.batch) {
      filePath = await findBatchFile(options.batch);
      console.log(`✅ 找到批次${options.batch}文件: ${filePath}`);
    } else {
      throw new Error('请指定 --file 或 --batch');
    }
    
    // 2. 加载数据
    console.log(`加载文件: ${filePath}`);
    const data = await loadJsonFile(filePath);
    const cases = data.cases || [];
    
    if (cases.length === 0) {
      console.log('❌ 文件中没有案例数据');
      return;
    }
    
    console.log(`✅ 已加载 ${cases.length} 个案例`);
    console.log();
    
    // 3. 清空数据库（如果是replace模式）
    if (options.mode === 'replace') {
      await clearLibrary();
      console.log();
    }
    
    // 4. 导入数据
    const { successCount, failCount } = await importCases(cases, options.mode);
    
    // 5. 验证
    console.log();
    console.log('验证导入结果...');
    const totalCount = await prisma.insuranceCoverageLibrary.count();
    console.log(`数据库中共有 ${totalCount} 条记录`);
    
    console.log();
    console.log('='*80);
    console.log('✅ 导入完成！');
    console.log('='*80);
    console.log(`成功: ${successCount} 条`);
    console.log(`失败: ${failCount} 条`);
    console.log(`总计: ${totalCount} 条（数据库实际）`);
    
  } catch (error: any) {
    console.error('❌ 导入失败:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// CLI
function parseArgs(): ImportOptions {
  const args = process.argv.slice(2);
  const options: ImportOptions = {
    mode: 'append'  // 默认追加模式
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--file' && i + 1 < args.length) {
      options.file = args[i + 1];
      i++;
    } else if (arg === '--batch' && i + 1 < args.length) {
      options.batch = parseInt(args[i + 1]);
      i++;
    } else if (arg === '--mode' && i + 1 < args.length) {
      const mode = args[i + 1];
      if (mode === 'replace' || mode === 'append') {
        options.mode = mode;
      }
      i++;
    } else if (arg === '--replace') {
      options.mode = 'replace';
    }
  }
  
  return options;
}

// 主函数
const options = parseArgs();
importData(options);
