const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clearProducts() {
  try {
    console.log('⚠️  准备清空产品库...\n');
    
    // 先查询当前数量
    const beforeCount = await prisma.insuranceProduct.count();
    console.log(`当前产品库记录数: ${beforeCount} 条\n`);
    
    // 删除所有产品
    const result = await prisma.insuranceProduct.deleteMany({});
    
    console.log(`✅ 成功删除: ${result.count} 条记录\n`);
    
    // 确认删除结果
    const afterCount = await prisma.insuranceProduct.count();
    console.log(`删除后产品库记录数: ${afterCount} 条`);
    
    if (afterCount === 0) {
      console.log('\n🎉 产品库已清空，可以重新导入数据！');
    }
    
  } catch (error) {
    console.error('❌ 清空失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearProducts();
