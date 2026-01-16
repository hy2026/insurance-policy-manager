#!/usr/bin/env ts-node
/**
 * 数据迁移脚本：为现有记录填充快速查询字段
 * 从parsedResult.note中提取字段，填充到数据库列中
 */

const { PrismaClient } = require('@prisma/client');
const { HardRuleParser } = require('../src/services/parser/hardRuleParser');

const prisma = new PrismaClient();

/**
 * 提取字段并格式化（与create方法中的逻辑一致）
 */
function extractFieldsForColumns(parsedResult: any, clauseText: string) {
  const note = parsedResult?.note || '';
  
  // 使用HardRuleParser提取字段
  const hardRuleFields = HardRuleParser.parseAdditionalFields(note || clauseText);
  
  // 格式化赔付次数
  let payoutCount: string | null = null;
  let isRepeatablePayout: boolean | null = null;
  const payoutCountData = hardRuleFields.payoutCount;
  if (payoutCountData) {
    if (payoutCountData.type === 'single') {
      payoutCount = '1次';
      isRepeatablePayout = null;
    } else if (payoutCountData.maxCount) {
      payoutCount = `最多${payoutCountData.maxCount}次`;
      isRepeatablePayout = payoutCountData.maxCount > 1;
    }
  }
  if (!payoutCount) {
    payoutCount = '1次';
    isRepeatablePayout = null;
  }
  
  // 格式化是否分组
  let isGrouped: boolean | null = null;
  if (payoutCount === '1次') {
    isGrouped = null;
  } else {
    const grouping = hardRuleFields.grouping;
    if (grouping && grouping.isGrouped !== undefined) {
      isGrouped = grouping.isGrouped;
    } else {
      isGrouped = false;
    }
  }
  
  // 格式化间隔期
  let intervalPeriod: string | null = null;
  if (payoutCount === '1次') {
    intervalPeriod = null;
  } else {
    const intervalPeriodData = hardRuleFields.intervalPeriod;
    if (intervalPeriodData && intervalPeriodData.hasInterval && intervalPeriodData.days) {
      const days = intervalPeriodData.days;
      if (days >= 365) {
        intervalPeriod = `间隔${Math.floor(days / 365)}年`;
      } else {
        intervalPeriod = `间隔${days}天`;
      }
    } else {
      intervalPeriod = '';
    }
  }
  
  // 格式化是否可以重复赔付
  if (isRepeatablePayout === null && payoutCount !== '1次') {
    const repeatablePayout = hardRuleFields.repeatablePayout;
    if (repeatablePayout && repeatablePayout.isRepeatable !== undefined) {
      isRepeatablePayout = repeatablePayout.isRepeatable;
    } else {
      isRepeatablePayout = false;
    }
  }
  
  // 格式化是否豁免
  let isPremiumWaiver = false;
  const premiumWaiver = hardRuleFields.premiumWaiver;
  if (premiumWaiver && premiumWaiver.isWaived !== undefined) {
    isPremiumWaiver = premiumWaiver.isWaived;
  }
  
  return {
    payoutCount,
    isRepeatablePayout,
    isGrouped,
    intervalPeriod,
    isPremiumWaiver
  };
}

async function migrateExistingData() {
  try {
    console.log('🚀 开始数据迁移...');
    
    // 查找所有需要迁移的记录（payoutCount为null的记录）
    const all = await prisma.insuranceCoverageLibrary.findMany({
      where: {
        payoutCount: null
      },
      select: {
        id: true,
        parsedResult: true,
        clauseText: true
      }
    });
    
    console.log(`📊 找到 ${all.length} 条需要迁移的记录`);
    
    if (all.length === 0) {
      console.log('✅ 没有需要迁移的记录');
      await prisma.$disconnect();
      return;
    }
    
    let successCount = 0;
    let failCount = 0;
    
    // 批量更新（每100条一批）
    const batchSize = 100;
    for (let i = 0; i < all.length; i += batchSize) {
      const batch = all.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (item: any) => {
          try {
            const fields = extractFieldsForColumns(item.parsedResult, item.clauseText);
            
            await prisma.insuranceCoverageLibrary.update({
              where: { id: item.id },
              data: fields
            });
            
            successCount++;
          } catch (error: any) {
            console.error(`❌ 更新记录失败 (ID: ${item.id}):`, error.message);
            failCount++;
          }
        })
      );
      
      console.log(`✅ 已处理 ${Math.min(i + batchSize, all.length)} / ${all.length} 条记录`);
    }
    
    console.log(`\n${'='.repeat(50)}`);
    console.log(`📊 迁移完成:`);
    console.log(`  - 成功: ${successCount} 条`);
    console.log(`  - 失败: ${failCount} 条`);
    console.log(`${'='.repeat(50)}\n`);
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ 迁移失败:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

migrateExistingData();

