const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixAllTypes() {
  try {
    console.log('=' . repeat(60));
    console.log('🔧 全面统一数据格式');
    console.log('='.repeat(60));
    
    // 定义映射关系
    const typeMapping = {
      '疾病类': '疾病责任',
      '身故类': '身故责任',
      '意外类': '意外责任',
      '年金类': '年金责任'
    };
    
    let totalFixed = 0;
    
    for (const [oldType, newType] of Object.entries(typeMapping)) {
      // 查找需要修复的记录
      const wrongData = await prisma.insuranceCoverageLibrary.findMany({
        where: {
          coverageType: oldType
        },
        select: {
          id: true,
          coverageName: true
        }
      });
      
      if (wrongData.length > 0) {
        console.log(`\n${oldType} → ${newType}:`);
        console.log(`  找到 ${wrongData.length} 条记录`);
        
        // 批量更新
        const result = await prisma.insuranceCoverageLibrary.updateMany({
          where: {
            coverageType: oldType
          },
          data: {
            coverageType: newType
          }
        });
        
        console.log(`  ✅ 成功修复 ${result.count} 条`);
        totalFixed += result.count;
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`✅ 总计修复: ${totalFixed} 条记录`);
    console.log('='.repeat(60));
    
    // 验证结果
    console.log('\n📊 修复后的数据分布:');
    const allData = await prisma.insuranceCoverageLibrary.findMany({
      select: {
        coverageType: true
      }
    });
    
    const typeCount = {};
    allData.forEach(item => {
      typeCount[item.coverageType] = (typeCount[item.coverageType] || 0) + 1;
    });
    
    Object.keys(typeCount).sort().forEach(type => {
      console.log(`  ${type}: ${typeCount[type]} 条`);
    });
    
  } catch (error) {
    console.error('修复失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixAllTypes();
