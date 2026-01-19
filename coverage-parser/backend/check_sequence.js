const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSequence() {
  try {
    const allData = await prisma.insuranceCoverageLibrary.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        parsedResult: true
      }
    });
    
    console.log(`总记录数: ${allData.length}`);
    
    const withoutSequence = allData.filter(item => {
      const parsed = item.parsedResult;
      return !parsed || !parsed.序号;
    });
    
    console.log(`\n缺少序号的记录数: ${withoutSequence.length}`);
    
    if (withoutSequence.length > 0) {
      console.log('\n前10条缺少序号的记录ID:');
      withoutSequence.slice(0, 10).forEach(item => {
        console.log(`  ID: ${item.id}`);
      });
    }
    
    // 检查序号201附近的数据
    const around201 = allData.slice(195, 210);
    console.log('\n\nID 196-210 的序号情况:');
    around201.forEach(item => {
      const parsed = item.parsedResult;
      console.log(`  ID ${item.id}: 序号 = ${parsed && parsed.序号 ? parsed.序号 : '(空)'}`);
    });
    
  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSequence();
