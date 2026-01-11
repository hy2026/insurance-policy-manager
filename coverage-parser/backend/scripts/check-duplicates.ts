#!/usr/bin/env ts-node
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDuplicates() {
  try {
    const total = await prisma.insuranceCoverageLibrary.count();
    console.log('数据库总记录数:', total);
    
    // 按保单ID号和责任名称分组，检查重复
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
      }
    });
    
    console.log('实际查询到的记录数:', all.length);
    
    // 检查重复（基于保单ID号、责任名称和原文）
    const seen = new Map<string, number>();
    const duplicates: Array<{id: number, 保单ID号: string, 责任名称: string, duplicateOf: number}> = [];
    
    all.forEach((item: any) => {
      const parsedResult = item.parsedResult || {};
      const 保单ID号 = parsedResult.保单ID号 || item.product?.productName || '';
      const 责任名称 = parsedResult.责任名称 || item.coverageName || '';
      const 责任原文 = parsedResult.责任原文 || item.clauseText || '';
      
      const key = `${保单ID号}|||${责任名称}|||${责任原文.substring(0, 100)}`;
      
      if (seen.has(key)) {
        duplicates.push({
          id: item.id,
          保单ID号,
          责任名称,
          duplicateOf: seen.get(key)!
        });
      } else {
        seen.set(key, item.id);
      }
    });
    
    console.log('唯一记录数:', seen.size);
    console.log('重复记录数:', duplicates.length);
    
    if (duplicates.length > 0) {
      console.log('\n前20个重复示例:');
      duplicates.slice(0, 20).forEach((d: any) => {
        console.log(`  ID: ${d.id}, 保单ID号: ${d.保单ID号}, 责任名称: ${d.责任名称}, 重复于: ${d.duplicateOf}`);
      });
    }
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('错误:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

checkDuplicates();

