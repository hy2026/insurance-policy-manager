const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkExport() {
  try {
    // 模拟导出逻辑，查询前250条数据
    const allData = await prisma.insuranceCoverageLibrary.findMany({
      where: {},
      include: {
        product: {
          select: {
            id: true,
            productName: true,
            insuranceCompany: true,
            policyType: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 250
    });
    
    console.log(`查询到 ${allData.length} 条数据\n`);
    
    // 检查每条数据的序号
    const noSequence = [];
    allData.forEach((item, index) => {
      const parsed = item.parsedResult;
      const 序号 = parsed && parsed.序号;
      
      if (!序号) {
        noSequence.push({
          index: index,
          id: item.id,
          coverageName: item.coverageName
        });
      }
    });
    
    console.log(`缺少序号的数据: ${noSequence.length} 条`);
    if (noSequence.length > 0) {
      console.log('\n前20条:');
      noSequence.slice(0, 20).forEach(item => {
        console.log(`  索引 ${item.index}, ID ${item.id}: ${item.coverageName}`);
      });
    }
    
  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkExport();
