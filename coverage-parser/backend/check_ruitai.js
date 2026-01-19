const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkRuitai() {
  try {
    const allData = await prisma.insuranceCoverageLibrary.findMany({
      select: {
        id: true,
        coverageName: true,
        parsedResult: true
      }
    });
    
    console.log(`总记录数: ${allData.length}\n`);
    
    // 查找包含"瑞泰人寿"的数据
    const ruitaiData = allData.filter(item => {
      const parsedResult = item.parsedResult;
      const policyId = parsedResult?.保单ID号 || parsedResult?.产品编码;
      return policyId && policyId.includes('瑞泰人寿');
    });
    
    console.log(`包含"瑞泰人寿"的记录: ${ruitaiData.length}条\n`);
    
    if (ruitaiData.length > 0) {
      console.log('瑞泰人寿的保单ID列表:');
      const uniqueIds = new Set();
      ruitaiData.forEach(item => {
        const parsedResult = item.parsedResult;
        const policyId = parsedResult?.保单ID号 || parsedResult?.产品编码;
        uniqueIds.add(policyId);
      });
      
      Array.from(uniqueIds).sort().forEach(id => {
        const count = ruitaiData.filter(item => {
          const parsedResult = item.parsedResult;
          const policyId = parsedResult?.保单ID号 || parsedResult?.产品编码;
          return policyId === id;
        }).length;
        console.log(`  - ${id}: ${count}条责任`);
      });
    }
    
    // 查找精确匹配
    const target = '瑞泰人寿[2021]疾病保险012号';
    const exactMatch = allData.filter(item => {
      const parsedResult = item.parsedResult;
      const policyId = parsedResult?.保单ID号 || parsedResult?.产品编码;
      return policyId === target;
    });
    
    console.log(`\n精确匹配"${target}": ${exactMatch.length}条`);
    if (exactMatch.length > 0) {
      exactMatch.forEach(item => {
        const parsedResult = item.parsedResult;
        console.log(`  ID: ${item.id}, 责任: ${item.coverageName}, 类型: ${parsedResult?.责任类型 || parsedResult?.险种类型}`);
      });
    }
    
  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkRuitai();
