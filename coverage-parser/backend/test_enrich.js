const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 模拟 enrichCoverageData
function enrichCoverageData(item) {
  const parsedResult = item.parsedResult || {};
  
  return {
    ...item,
    序号: parsedResult.序号,
    保单ID号: parsedResult.保单ID号,
    责任类型: parsedResult.责任类型 || item.coverageType,
    责任名称: parsedResult.责任名称 || item.coverageName,
    责任原文: parsedResult.责任原文 || item.clauseText
  };
}

async function testEnrich() {
  try {
    // 查询ID 201-220的数据
    const data = await prisma.insuranceCoverageLibrary.findMany({
      where: {
        id: {
          gte: 211,
          lte: 230
        }
      },
      orderBy: { id: 'asc' }
    });
    
    console.log(`查询到 ${data.length} 条数据\n`);
    
    // 处理数据
    const enriched = data.map(item => enrichCoverageData(item));
    
    // 检查序号
    enriched.forEach(item => {
      console.log(`ID ${item.id}: 序号 = ${item.序号 || '(空)'}, 责任名称 = ${item.责任名称}`);
    });
    
  } catch (error) {
    console.error('测试失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testEnrich();
