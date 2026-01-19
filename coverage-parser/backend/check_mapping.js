const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkMapping() {
  try {
    const target = '瑞泰人寿[2021]疾病保险012号';
    
    const data = await prisma.insuranceCoverageLibrary.findMany({
      where: {
        id: { in: [5490, 2083, 1761, 5562] }
      },
      select: {
        id: true,
        coverageName: true,
        coverageType: true,
        parsedResult: true
      }
    });
    
    console.log('检查4条责任的字段映射:\n');
    data.forEach(item => {
      const parsedResult = item.parsedResult;
      console.log(`ID ${item.id}:`);
      console.log(`  责任名称: ${item.coverageName}`);
      console.log(`  coverageType (数据库): ${item.coverageType}`);
      console.log(`  parsedResult.责任类型: ${parsedResult?.责任类型}`);
      console.log(`  parsedResult.险种类型: ${parsedResult?.险种类型}`);
      console.log(`  parsedResult.保单ID号: ${parsedResult?.保单ID号}`);
      console.log(`  parsedResult.产品编码: ${parsedResult?.产品编码}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkMapping();
