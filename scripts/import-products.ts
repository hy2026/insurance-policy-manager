#!/usr/bin/env ts-node
/**
 * 产品库批量导入脚本
 * 
 * 支持从MD文件批量导入产品和责任
 * 格式参考：原文条款-批次1.md
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();

interface CoverageRecord {
  serialNumber: number;
  policyDocumentId: string;
  coverageType: string;
  coverageName: string;
  clauseText: string;
}

/**
 * 解析MD文件中的条款数据
 * 格式：序号|||保单ID号|||责任类型|||责任名称|||原文片段
 */
function parseMdFile(content: string): CoverageRecord[] {
  const lines = content.split('\n');
  const records: CoverageRecord[] = [];

  for (const line of lines) {
    // 跳过空行和注释
    if (!line.trim() || line.trim().startsWith('#') || line.trim().startsWith('```')) {
      continue;
    }

    // 检查是否是数据行（包含|||分隔符）
    if (!line.includes('|||')) {
      continue;
    }

    // 分割字段
    const parts = line.split('|||').map(p => p.trim());
    
    if (parts.length < 5) {
      console.warn(`⚠️ 跳过无效行: ${line.substring(0, 50)}...`);
      continue;
    }

    const [serialNumber, policyDocumentId, coverageType, coverageName, clauseText] = parts;

    // 验证序号
    const num = parseInt(serialNumber);
    if (isNaN(num)) {
      continue;
    }

    records.push({
      serialNumber: num,
      policyDocumentId,
      coverageType,
      coverageName,
      clauseText
    });
  }

  return records;
}

/**
 * 从保单ID提取保险公司和产品名称
 * 例如："东吴人寿[2018]疾病保险092号" → {company: "东吴人寿", product: "疾病保险"}
 */
function extractProductInfo(policyDocumentId: string) {
  // 匹配：公司名[年份]类型XXX号
  const match = policyDocumentId.match(/^(.+?)\[(\d{4})\](.+?)(\d+)号$/);
  
  if (match) {
    const [, company, year, type] = match;
    return {
      insuranceCompany: company.trim(),
      productName: `${type.trim()}`,
      approvalYear: parseInt(year)
    };
  }

  // 如果无法解析，返回默认值
  return {
    insuranceCompany: '未知',
    productName: policyDocumentId,
    approvalYear: new Date().getFullYear()
  };
}

/**
 * 从责任类型推断保单类型
 */
function inferPolicyType(coverageType: string): string {
  if (coverageType.includes('疾病')) return '重疾险';
  if (coverageType.includes('身故')) return '人寿险';
  if (coverageType.includes('意外')) return '意外险';
  if (coverageType.includes('年金')) return '年金险';
  return '重疾险'; // 默认
}

/**
 * 批量导入
 */
async function importProducts(records: CoverageRecord[]) {
  console.log(`📦 开始导入 ${records.length} 条责任数据`);

  let createdProducts = 0;
  let createdCoverages = 0;
  let skipped = 0;

  // 按保单ID分组
  const groupedByPolicy: Record<string, CoverageRecord[]> = {};
  records.forEach(record => {
    if (!groupedByPolicy[record.policyDocumentId]) {
      groupedByPolicy[record.policyDocumentId] = [];
    }
    groupedByPolicy[record.policyDocumentId].push(record);
  });

  console.log(`📋 共 ${Object.keys(groupedByPolicy).length} 个不同的产品`);

  // 逐个产品导入
  for (const [policyDocumentId, coverages] of Object.entries(groupedByPolicy)) {
    try {
      const { insuranceCompany, productName, approvalYear } = extractProductInfo(policyDocumentId);
      const policyType = inferPolicyType(coverages[0].coverageType);

      console.log(`\n处理产品: ${insuranceCompany} - ${productName}`);

      // 1. 创建或获取产品
      let product = await prisma.insuranceProduct.findFirst({
        where: {
          insuranceCompany,
          productName,
          policyDocumentId
        }
      });

      if (!product) {
        product = await prisma.insuranceProduct.create({
          data: {
            insuranceCompany,
            productName,
            policyType,
            policyDocumentId,
            approvalDate: new Date(approvalYear, 0, 1),
            isActive: true,
            verified: false,
            trainingStatus: 'pending'
          }
        });
        createdProducts++;
        console.log(`  ✅ 创建产品: ${product.id}`);
      } else {
        console.log(`  ⏭️  产品已存在: ${product.id}`);
      }

      // 2. 导入责任
      for (const coverage of coverages) {
        // 检查是否已存在
        const existing = await prisma.insuranceCoverageLibrary.findFirst({
          where: {
            productId: product.id,
            coverageName: coverage.coverageName,
            clauseText: coverage.clauseText
          }
        });

        if (existing) {
          console.log(`    ⏭️  责任已存在: ${coverage.coverageName}`);
          skipped++;
          continue;
        }

        // 创建责任
        await prisma.insuranceCoverageLibrary.create({
          data: {
            productId: product.id,
            coverageType: coverage.coverageType,
            coverageName: coverage.coverageName,
            clauseText: coverage.clauseText,
            parseMethod: 'manual',
            verified: false,
            isTrainingSample: true,
            annotationQuality: 'medium'
          }
        });

        createdCoverages++;
        console.log(`    ✅ 创建责任: ${coverage.coverageName}`);
      }

    } catch (error) {
      console.error(`❌ 导入失败: ${policyDocumentId}`, error);
    }
  }

  console.log(`\n📊 导入完成:`);
  console.log(`  - 创建产品: ${createdProducts}`);
  console.log(`  - 创建责任: ${createdCoverages}`);
  console.log(`  - 跳过重复: ${skipped}`);
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
使用方法:
  ts-node scripts/import-products.ts <文件路径>

示例:
  ts-node scripts/import-products.ts ../原文条款-批次1.md
    `);
    process.exit(1);
  }

  const filePath = args[0];
  console.log(`📂 读取文件: ${filePath}`);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const records = parseMdFile(content);

    if (records.length === 0) {
      console.error('❌ 未找到有效的数据行');
      process.exit(1);
    }

    console.log(`✅ 解析到 ${records.length} 条记录`);

    // 确认导入
    console.log('\n即将导入数据，按 Ctrl+C 取消...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    await importProducts(records);

  } catch (error) {
    console.error('❌ 执行失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 执行
main();



































