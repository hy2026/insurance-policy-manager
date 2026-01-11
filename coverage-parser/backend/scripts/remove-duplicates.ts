#!/usr/bin/env ts-node
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function removeDuplicates() {
  try {
    console.log('开始检查重复记录...');
    
    // 获取所有记录
    const all = await prisma.insuranceCoverageLibrary.findMany({
      select: {
        id: true,
        coverageName: true,
        clauseText: true,
        parsedResult: true,
        product: {
          select: {
            productName: true
          }
        }
      },
      orderBy: {
        id: 'asc' // 保留较早的记录
      }
    });
    
    console.log('总记录数:', all.length);
    
    // 找出重复记录
    const seen = new Map<string, number>();
    const duplicatesToDelete: number[] = [];
    
    all.forEach((item: any) => {
      const parsedResult = item.parsedResult || {};
      const 保单ID号 = parsedResult.保单ID号 || item.product?.productName || '';
      const 责任名称 = parsedResult.责任名称 || item.coverageName || '';
      const 责任原文 = parsedResult.责任原文 || item.clauseText || '';
      
      const key = `${保单ID号}|||${责任名称}|||${责任原文.substring(0, 200)}`;
      
      if (seen.has(key)) {
        // 这是重复记录，标记为删除
        duplicatesToDelete.push(item.id);
      } else {
        // 第一次出现，保留
        seen.set(key, item.id);
      }
    });
    
    console.log('唯一记录数:', seen.size);
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
        coverageName: true,
        parsedResult: true
      }
    });
    sampleRecords.forEach((r: any) => {
      const parsedResult = r.parsedResult || {};
      console.log(`  ID: ${r.id}, 保单ID号: ${parsedResult.保单ID号}, 责任名称: ${r.coverageName}`);
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
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('错误:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

removeDuplicates();

