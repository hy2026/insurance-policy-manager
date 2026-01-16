#!/usr/bin/env ts-node
/**
 * 强制更新所有记录的间隔期字段
 * 使用修复后的HardRuleParser重新提取间隔期
 */

const { PrismaClient } = require('@prisma/client');
const { HardRuleParser } = require('../src/services/parser/hardRuleParser');

const prisma = new PrismaClient();

/**
 * 提取间隔期并格式化
 */
function extractIntervalPeriod(parsedResult: any, clauseText: string, payoutCount: string | null) {
  const note = parsedResult?.note || '';
  
  // 如果是一次赔付，间隔期应该为null
  if (payoutCount === '1次') {
    return null;
  }
  
  // 使用HardRuleParser提取间隔期
  const hardRuleFields = HardRuleParser.parseAdditionalFields(note || clauseText);
  const intervalPeriodData = hardRuleFields.intervalPeriod;
  
  if (intervalPeriodData && intervalPeriodData.hasInterval && intervalPeriodData.days) {
    const days = intervalPeriodData.days;
    if (days >= 365) {
      return `间隔${Math.floor(days / 365)}年`;
    } else {
      return `间隔${days}天`;
    }
  } else {
    return ''; // 无间隔期
  }
}

async function updateAllIntervalPeriods() {
  try {
    console.log('🚀 开始更新所有记录的间隔期字段...');
    
    // 查找所有记录
    const all = await prisma.insuranceCoverageLibrary.findMany({
      select: {
        id: true,
        parsedResult: true,
        clauseText: true,
        payoutCount: true,
        intervalPeriod: true
      }
    });
    
    console.log(`📊 找到 ${all.length} 条记录需要检查`);
    
    let successCount = 0;
    let updatedCount = 0;
    let failCount = 0;
    
    // 批量更新（每100条一批）
    const batchSize = 100;
    for (let i = 0; i < all.length; i += batchSize) {
      const batch = all.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (item: any) => {
          try {
            const newIntervalPeriod = extractIntervalPeriod(
              item.parsedResult, 
              item.clauseText, 
              item.payoutCount
            );
            
            // 只有当值发生变化时才更新
            if (newIntervalPeriod !== item.intervalPeriod) {
              await prisma.insuranceCoverageLibrary.update({
                where: { id: item.id },
                data: {
                  intervalPeriod: newIntervalPeriod
                }
              });
              updatedCount++;
            }
            
            successCount++;
          } catch (error: any) {
            console.error(`❌ 更新记录失败 (ID: ${item.id}):`, error.message);
            failCount++;
          }
        })
      );
      
      if ((i + batchSize) % 500 === 0 || i + batchSize >= all.length) {
        console.log(`✅ 已处理 ${Math.min(i + batchSize, all.length)} / ${all.length} 条记录 (更新了 ${updatedCount} 条)`);
      }
    }
    
    console.log(`\n${'='.repeat(50)}`);
    console.log(`📊 更新完成:`);
    console.log(`  - 总记录数: ${all.length} 条`);
    console.log(`  - 成功处理: ${successCount} 条`);
    console.log(`  - 实际更新: ${updatedCount} 条`);
    console.log(`  - 失败: ${failCount} 条`);
    console.log(`${'='.repeat(50)}\n`);
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ 更新失败:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

updateAllIntervalPeriods();


