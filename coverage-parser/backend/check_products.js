const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkProducts() {
  try {
    const count = await prisma.insuranceProduct.count();
    console.log(`\n数据库中产品总数: ${count}`);
    
    // 查询最近添加的5条产品
    const recent = await prisma.insuranceProduct.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        policyId: true,
        insuranceCompany: true,
        productName: true,
        productCategory: true,
        createdAt: true
      }
    });
    
    console.log('\n最近添加的5条产品:');
    recent.forEach(p => {
      console.log(`  ID: ${p.id}, 产品ID号: ${p.policyId || '(空)'}, 公司: ${p.insuranceCompany}, 产品: ${p.productName}`);
    });
    
  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkProducts();
