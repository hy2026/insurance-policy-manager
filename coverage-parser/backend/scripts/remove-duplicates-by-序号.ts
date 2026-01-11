#!/usr/bin/env ts-node
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function removeDuplicatesBy序号() {
  try {
    console.log('开始检查重复记录（基于序号）...');
    
    // 获取所有记录
    const all = await prisma.insuranceCoverageLibrary.findMany({
      select: {
        id: true,
        parsedResult: true
      },
      orderBy: {
        id: 'asc' // 保留较早的记录
      }
    });
    
    console.log('总记录数:', all.length);
    
    // 找出重复记录（基于序号）
    const seen = new Map<number, number>();
    const duplicatesToDelete: number[] = [];
    
    all.forEach((item: any) => {
      const parsedResult = item.parsedResult || {};
      const 序号 = parsedResult.序号;
      
      // 如果序号不存在或无效，跳过
      if (序号 === undefined || 序号 === null || 序号 === '') {
        // 没有序号的记录也标记为删除（可能是无效数据）
        duplicatesToDelete.push(item.id);
        return;
      }
      
      const 序号Num = typeof 序号 === 'number' ? 序号 : parseInt(序号);
      
      if (isNaN(序号Num)) {
        // 序号无效，标记为删除
        duplicatesToDelete.push(item.id);
        return;
      }
      
      if (seen.has(序号Num)) {
        // 这是重复记录，标记为删除（保留第一次出现的记录）
        duplicatesToDelete.push(item.id);
      } else {
        // 第一次出现，保留
        seen.set(序号Num, item.id);
      }
    });
    
    console.log('唯一序号记录数:', seen.size);
    console.log('需要删除的重复记录数:', duplicatesToDelete.length);
    
    if (duplicatesToDelete.length === 0) {
      console.log('没有重复记录，无需删除');
      await prisma.$disconnect();
      return;
    }
    
    // 确认删除
    console.log('\n准备删除以下重复记录（前10个）:');
    const sampleIds = duplicatesToDelete.slice(0, 10);
    const sampleRecords = await prisma.insuranceCoverageLibrary.findMany({
      where: { id: { in: sampleIds } },
      select: {
        id: true,
        parsedResult: true
      }
    });
    sampleRecords.forEach((r: any) => {
      const parsedResult = r.parsedResult || {};
      console.log(`  ID: ${r.id}, 序号: ${parsedResult.序号}`);
    });
    
    // 执行删除
    console.log('\n开始删除重复记录...');
    const deleteResult = await prisma.insuranceCoverageLibrary.deleteMany({
      where: {
        id: { in: duplicatesToDelete }
      }
    });
    
    console.log(`✅ 成功删除 ${deleteResult.count} 条重复记录`);
    console.log(`剩余记录数: ${seen.size}`);
    
    // 验证最终结果
    const finalCount = await prisma.insuranceCoverageLibrary.count();
    console.log(`数据库最终记录数: ${finalCount}`);
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('错误:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

removeDuplicatesBy序号();

