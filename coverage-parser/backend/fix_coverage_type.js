const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixCoverageType() {
  try {
    console.log('开始修复 coverageType 字段...\n');
    
    // 查找coverageType为"疾病类"的记录
    const wrongData = await prisma.insuranceCoverageLibrary.findMany({
      where: {
        coverageType: '疾病类'
      },
      select: {
        id: true,
        coverageName: true,
        coverageType: true
      }
    });
    
    console.log(`找到 ${wrongData.length} 条需要修复的记录:`);
    wrongData.forEach(item => {
      console.log(`  ID: ${item.id}, ${item.coverageName}`);
    });
    
    // 批量更新
    const result = await prisma.insuranceCoverageLibrary.updateMany({
      where: {
        coverageType: '疾病类'
      },
      data: {
        coverageType: '疾病责任'
      }
    });
    
    console.log(`\n✅ 成功修复 ${result.count} 条记录`);
    console.log('   疾病类 → 疾病责任');
    
  } catch (error) {
    console.error('修复失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixCoverageType();
