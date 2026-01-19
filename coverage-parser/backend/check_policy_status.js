const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPolicyStatus() {
  try {
    const policy = await prisma.insurancePolicyParsed.findFirst({
      orderBy: { id: 'desc' },
      select: {
        id: true,
        productName: true,
        coverageEndYear: true,
        birthYear: true,
        policyStartYear: true,
        createdAt: true
      }
    });
    
    if (policy) {
      console.log('最近一条保单：');
      console.log(`  ID: ${policy.id}`);
      console.log(`  产品名称: ${policy.productName}`);
      console.log(`  保障结束年份: ${policy.coverageEndYear}`);
      console.log(`  保障结束年份类型: ${typeof policy.coverageEndYear}`);
      console.log(`  出生年份: ${policy.birthYear}`);
      console.log(`  投保年份: ${policy.policyStartYear}`);
      console.log(`  创建时间: ${policy.createdAt}`);
      console.log('');
      console.log('判断逻辑：');
      const currentYear = new Date().getFullYear();
      console.log(`  当前年份: ${currentYear}`);
      console.log(`  coverageEndYear === '终身': ${policy.coverageEndYear === '终身'}`);
      console.log(`  coverageEndYear === 'lifetime': ${policy.coverageEndYear === 'lifetime'}`);
      console.log(`  parseInt(coverageEndYear) >= currentYear: ${parseInt(String(policy.coverageEndYear)) >= currentYear}`);
    } else {
      console.log('没有找到保单数据');
    }
  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPolicyStatus();

