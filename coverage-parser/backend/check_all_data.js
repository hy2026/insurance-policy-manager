const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAllData() {
  try {
    console.log('=' . repeat(60));
    console.log('📊 责任库数据全面检查');
    console.log('='.repeat(60));
    
    // 1. 总记录数
    const total = await prisma.insuranceCoverageLibrary.count();
    console.log(`\n1️⃣ 总记录数: ${total} 条`);
    
    // 2. 获取所有数据
    const allData = await prisma.insuranceCoverageLibrary.findMany({
      select: {
        id: true,
        coverageType: true,
        parsedResult: true
      }
    });
    
    // 3. 检查保单ID号字段（两种格式）
    console.log('\n2️⃣ 保单ID号字段检查:');
    let has保单ID号 = 0;
    let has产品编码 = 0;
    let hasBoth = 0;
    let hasNeither = 0;
    
    allData.forEach(item => {
      const p = item.parsedResult;
      const id1 = p?.保单ID号;
      const id2 = p?.产品编码;
      
      if (id1 && id2) hasBoth++;
      else if (id1) has保单ID号++;
      else if (id2) has产品编码++;
      else hasNeither++;
    });
    
    console.log(`   - 只有"保单ID号": ${has保单ID号} 条`);
    console.log(`   - 只有"产品编码": ${has产品编码} 条`);
    console.log(`   - 两者都有: ${hasBoth} 条`);
    console.log(`   - 都没有: ${hasNeither} 条`);
    
    // 4. 检查责任类型字段
    console.log('\n3️⃣ 责任类型字段检查:');
    
    const coverageTypeMap = {};
    const parsedTypeMap = {};
    
    allData.forEach(item => {
      const dbType = item.coverageType;
      const parsedType = item.parsedResult?.责任类型 || item.parsedResult?.险种类型;
      
      coverageTypeMap[dbType] = (coverageTypeMap[dbType] || 0) + 1;
      if (parsedType) {
        parsedTypeMap[parsedType] = (parsedTypeMap[parsedType] || 0) + 1;
      }
    });
    
    console.log('\n   数据库字段 coverageType 分布:');
    Object.keys(coverageTypeMap).sort().forEach(type => {
      console.log(`     - ${type}: ${coverageTypeMap[type]} 条`);
    });
    
    console.log('\n   parsedResult.责任类型 分布:');
    Object.keys(parsedTypeMap).sort().forEach(type => {
      console.log(`     - ${type}: ${parsedTypeMap[type]} 条`);
    });
    
    // 5. 检查是否有格式不一致的情况
    console.log('\n4️⃣ 格式一致性检查:');
    let mismatch = 0;
    allData.forEach(item => {
      const dbType = item.coverageType;
      const parsedType = item.parsedResult?.责任类型 || item.parsedResult?.险种类型;
      
      // 检查是否匹配
      const mapping = {
        '疾病责任': ['疾病责任', '疾病类'],
        '身故责任': ['身故责任', '身故类'],
        '意外责任': ['意外责任', '意外类'],
        '年金责任': ['年金责任', '年金类']
      };
      
      const expected = mapping[dbType] || [dbType];
      if (parsedType && !expected.includes(parsedType)) {
        mismatch++;
      }
    });
    
    console.log(`   - 格式不匹配的记录: ${mismatch} 条`);
    
    // 6. 抽样检查
    console.log('\n5️⃣ 数据抽样 (前3条):');
    allData.slice(0, 3).forEach(item => {
      const p = item.parsedResult;
      console.log(`\n   ID: ${item.id}`);
      console.log(`     coverageType: ${item.coverageType}`);
      console.log(`     保单ID号: ${p?.保单ID号 || '(无)'}`);
      console.log(`     产品编码: ${p?.产品编码 || '(无)'}`);
      console.log(`     责任类型: ${p?.责任类型 || '(无)'}`);
      console.log(`     险种类型: ${p?.险种类型 || '(无)'}`);
    });
    
    console.log('\n' + '='.repeat(60));
    
  } catch (error) {
    console.error('检查失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAllData();
