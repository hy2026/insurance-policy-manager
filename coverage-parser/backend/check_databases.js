const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDatabases() {
  try {
    console.log('='.repeat(60));
    console.log('📊 数据库状态检查');
    console.log('='.repeat(60));
    
    // 1. 检查责任库
    console.log('\n1️⃣ 责任库 (InsuranceCoverageLibrary):');
    const coverageCount = await prisma.insuranceCoverageLibrary.count();
    console.log(`   ✅ 总记录数: ${coverageCount} 条`);
    
    const coverageTypes = await prisma.insuranceCoverageLibrary.groupBy({
      by: ['coverageType'],
      _count: true
    });
    console.log('   责任类型分布:');
    coverageTypes.forEach(item => {
      console.log(`     - ${item.coverageType}: ${item._count} 条`);
    });
    
    // 2. 检查产品库
    console.log('\n2️⃣ 产品库 (InsuranceProduct):');
    const productCount = await prisma.insuranceProduct.count();
    console.log(`   ✅ 总记录数: ${productCount} 条`);
    
    // 检查字段完整性
    const sampleProduct = await prisma.insuranceProduct.findFirst({
      select: {
        id: true,
        policyId: true,
        insuranceCompany: true,
        productName: true,
        productCategory: true,
        productSubCategory: true,
        diseaseCount: true,
        deathCount: true,
        accidentCount: true,
        annuityCount: true
      }
    });
    
    console.log('   产品字段示例:');
    console.log(`     - policyId: ${sampleProduct?.policyId || '(空)'}`);
    console.log(`     - insuranceCompany: ${sampleProduct?.insuranceCompany}`);
    console.log(`     - productName: ${sampleProduct?.productName}`);
    console.log(`     - productCategory: ${sampleProduct?.productCategory || '(空)'}`);
    console.log(`     - diseaseCount: ${sampleProduct?.diseaseCount ?? '(空)'}`);
    console.log(`     - deathCount: ${sampleProduct?.deathCount ?? '(空)'}`);
    console.log(`     - accidentCount: ${sampleProduct?.accidentCount ?? '(空)'}`);
    console.log(`     - annuityCount: ${sampleProduct?.annuityCount ?? '(空)'}`);
    
    // 3. 检查表结构
    console.log('\n3️⃣ 表结构检查:');
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    console.log('   数据库中的表:');
    tables.forEach(table => {
      console.log(`     - ${table.table_name}`);
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ 数据库检查完成');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ 检查失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabases();
