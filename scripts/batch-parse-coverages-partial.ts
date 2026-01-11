#!/usr/bin/env ts-node
/**
 * 批量解析责任条款脚本（分批解析版本）
 * 从MD文件读取指定范围的案例，调用解析API，追加到CSV文件
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

interface CoverageRecord {
  serialNumber: number;
  policyDocumentId: string;
  coverageType: string;
  coverageName: string;
  clauseText: string;
}

/**
 * 解析MD文件中的条款数据
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
 * CSV字段转义（确保格式正确，不会串行）
 */
function escapeCsvField(field: string): string {
  if (!field) return '';
  
  // 如果包含逗号、引号或换行符，需要用双引号包裹
  if (field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('\r')) {
    // 将字段内的双引号转义为两个双引号
    return `"${field.replace(/"/g, '""')}"`;
  }
  
  return field;
}

/**
 * 格式化JSON字段为CSV字符串
 */
function formatJsonForCsv(obj: any): string {
  if (!obj) return '';
  try {
    return escapeCsvField(JSON.stringify(obj));
  } catch (e) {
    return '';
  }
}

/**
 * 调用解析API
 */
async function parseCoverage(clauseText: string, coverageType: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      clauseText,
      coverageType
    });

    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/parse',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 120000
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.success) {
            resolve(response.result);
          } else {
            console.error(`❌ 解析失败: ${response.message || '未知错误'}`);
            resolve(null);
          }
        } catch (e) {
          console.error(`❌ 解析响应失败: ${e}`);
          resolve(null);
        }
      });
    });

    req.on('error', (error) => {
      console.error(`❌ 请求失败: ${error.message}`);
      resolve(null);
    });

    req.on('timeout', () => {
      req.destroy();
      console.error(`❌ 请求超时`);
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * 从解析结果提取CSV行数据
 */
function extractCsvRow(record: CoverageRecord, parseResult: any): string[] {
  const row: string[] = [];

  // 序号
  row.push(record.serialNumber.toString());
  
  // 保单ID号
  row.push(escapeCsvField(record.policyDocumentId));
  
  // 责任类型
  row.push(escapeCsvField(record.coverageType));
  
  // 责任名称
  row.push(escapeCsvField(record.coverageName));
  
  // 责任原文
  row.push(escapeCsvField(record.clauseText));
  
  // 自然语言描述（限制50字）
  let naturalLanguageDescription = parseResult?.naturalLanguageDescription || '';
  if (naturalLanguageDescription.length > 50) {
    naturalLanguageDescription = naturalLanguageDescription.substring(0, 50);
  }
  row.push(escapeCsvField(naturalLanguageDescription));

  // 阶段序号
  const tiers = parseResult?.payoutAmount?.details?.tiers || [];
  if (tiers.length > 0) {
    // 如果有多个阶段，每个阶段一行
    // 这里先处理第一个阶段
    const tier = tiers[0];
    
    // 阶段序号
    row.push('1');
    
    // 阶段描述
    row.push(escapeCsvField(tier.period || ''));
    
    // 等待期状态
    row.push(escapeCsvField(tier.waitingPeriodStatus || ''));
    
    // 交费期状态
    row.push(escapeCsvField(tier.paymentPeriodStatus || ''));
    
    // 交费方式
    row.push(escapeCsvField(tier.paymentMode || ''));
    
    // 年龄条件
    row.push(formatJsonForCsv(tier.ageCondition));
    
    // 保单年度范围
    row.push(formatJsonForCsv(tier.policyYearRange));
    
    // 保障期间条件
    row.push(escapeCsvField(tier.coveragePeriodConditions || ''));
    
    // 赔付公式
    row.push(escapeCsvField(tier.formula || ''));
    
    // 公式变量（只有公式中包含变量时才填写）
    let formulaVariables = '';
    if (tier.formula) {
      // 检查是否包含变量
      if (tier.formula.includes('赔付比例')) {
        formulaVariables = '赔付比例';
      } else if (tier.formula.includes('比例') && !tier.formula.match(/\d+%/)) {
        // 如果包含"比例"但不是固定百分比（如"30%"），则可能是变量
        formulaVariables = '赔付比例';
      }
    }
    row.push(escapeCsvField(formulaVariables));
    
    // 备注
    row.push(escapeCsvField(parseResult?.remarks || ''));
  } else {
    // 没有阶段数据，填充空值
    row.push('', '', '', '', '', '', '', '', '', '', '', '');
  }
  
  // 保险公司名称(待补充)
  row.push('');
  
  // 保单名称(待补充)
  row.push('');
  
  // 保险类型(待补充)
  row.push('');

  return row;
}

/**
 * 主函数
 */
async function main() {
  const startNum = parseInt(process.argv[2] || '11');
  const endNum = parseInt(process.argv[3] || '40');
  
  // 获取脚本所在目录的父目录（项目根目录）
  const projectRoot = process.cwd();
  const mdFilePath = path.join(projectRoot, '原文条款-批次1.md');
  const csvOutputPath = path.join(projectRoot, '责任解析结果-批次1.csv');

  console.log(`📖 读取MD文件...`);
  const mdContent = fs.readFileSync(mdFilePath, 'utf-8');
  const allRecords = parseMdFile(mdContent);
  
  // 筛选指定范围的记录
  const records = allRecords.filter(r => r.serialNumber >= startNum && r.serialNumber <= endNum);
  
  console.log(`✅ 找到 ${records.length} 条记录（序号 ${startNum}-${endNum}）`);

  // 读取现有CSV文件（保留表头）
  const existingLines: string[] = [];
  if (fs.existsSync(csvOutputPath)) {
    const existingContent = fs.readFileSync(csvOutputPath, 'utf-8');
    existingLines.push(...existingContent.split('\n').filter(line => line.trim()));
  }

  // CSV表头
  const headers = [
    '序号',
    '保单ID号',
    '责任类型',
    '责任名称',
    '责任原文',
    '自然语言描述(naturalLanguageDescription)',
    '阶段序号',
    '阶段描述(period)',
    '等待期状态(waitingPeriodStatus)',
    '交费期状态(paymentPeriodStatus)',
    '交费方式(paymentMode)',
    '年龄条件(ageCondition)',
    '保单年度范围(policyYearRange)',
    '保障期间条件(coveragePeriodConditions)',
    '赔付公式(formula)',
    '公式变量(formulaVariables)',
    '备注',
    '保险公司名称(待补充)',
    '保单名称(待补充)',
    '保险类型(待补充)'
  ];

  const csvLines: string[] = [];
  
  // 如果现有文件为空，添加表头
  if (existingLines.length === 0) {
    csvLines.push(headers.join(','));
  } else {
    // 保留现有内容（包括表头）
    csvLines.push(...existingLines);
  }

  // 批量解析
  console.log(`\n🚀 开始批量解析（${startNum}-${endNum}）...\n`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    console.log(`[${i + 1}/${records.length}] 解析案例${record.serialNumber}: ${record.coverageName}`);
    
    const parseResult = await parseCoverage(record.clauseText, record.coverageType);
    
    if (parseResult) {
      const csvRow = extractCsvRow(record, parseResult);
      csvLines.push(csvRow.join(','));
      successCount++;
      console.log(`  ✅ 解析成功`);
    } else {
      failCount++;
      console.log(`  ❌ 解析失败，跳过`);
      // 即使解析失败，也添加一行空数据，保持序号连续
      const emptyRow = [
        record.serialNumber.toString(),
        escapeCsvField(record.policyDocumentId),
        escapeCsvField(record.coverageType),
        escapeCsvField(record.coverageName),
        escapeCsvField(record.clauseText),
        '', // naturalLanguageDescription
        '', '', '', '', '', '', '', '', '', '', '', '', // 其他字段
        '', '', '' // 待补充字段
      ];
      csvLines.push(emptyRow.join(','));
    }
    
    // 每10条保存一次（防止数据丢失）
    if ((i + 1) % 10 === 0) {
      fs.writeFileSync(csvOutputPath, csvLines.join('\n'), 'utf-8');
      console.log(`  💾 已保存前 ${i + 1} 条记录\n`);
    }
    
    // 避免请求过快，稍微延迟
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 最终保存
  fs.writeFileSync(csvOutputPath, csvLines.join('\n'), 'utf-8');
  
  console.log(`\n✅ 批次完成！`);
  console.log(`   成功: ${successCount} 条`);
  console.log(`   失败: ${failCount} 条`);
  console.log(`   总计: ${records.length} 条`);
  console.log(`📄 输出文件: ${csvOutputPath}`);
}

// 运行
main().catch(console.error);

