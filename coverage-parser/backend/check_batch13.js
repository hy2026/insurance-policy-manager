const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBatch13() {
  try {
    // 查询序号2601的数据
    const sample = await prisma.insuranceCoverageLibrary.findFirst({
      where: {
        parsedResult: {
          path: ['序号'],
          equals: 2601
        }
      }
    });
    
    if (sample) {
      console.log('序号2601的数据示例:');
      console.log('ID:', sample.id);
      console.log('coverageName:', sample.coverageName);
      console.log('\nparsedResult:');
      console.log(JSON.stringify(sample.parsedResult, null, 2));
    } else {
      console.log('未找到序号2601的数据');
    }
    
  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkBatch13();
