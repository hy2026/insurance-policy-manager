const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPolicy() {
  try {
    const policy = await prisma.insurancePolicyParsed.findFirst({
      where: {
        productName: {
          contains: '百年百惠'
        }
      },
      select: {
        id: true,
        productName: true,
        coverageEndYear: true,
        policyInfo: true
      }
    });
    
    if (policy) {
      console.log('保单信息：');
      console.log(`  产品名称: ${policy.productName}`);
      console.log(`  coverageEndYear: ${policy.coverageEndYear} (类型: ${typeof policy.coverageEndYear})`);
      console.log(`  policyInfo:`, policy.policyInfo);
    } else {
      console.log('未找到该保单');
    }
  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPolicy();

