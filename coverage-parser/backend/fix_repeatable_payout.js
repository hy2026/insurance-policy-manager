const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixRepeatablePayout() {
  console.log('开始修复数据库中"是否可以重复赔付"字段的错误数据...\n');
  
  const coverages = await prisma.insuranceCoverageLibrary.findMany();
  console.log(`共有 ${coverages.length} 条记录\n`);
  
  let fixedCount = 0;
  
  // 不可重复赔付的匹配模式
  const notRepeatablePatterns = [
    /每种.{0,10}限赔\s*[一1]\s*次/i,              // "每种轻症限赔1次"
    /每种.{0,10}限给付\s*[一1]\s*次/i,            // "每种轻症限给付一次"
    /每种.{0,10}只给付\s*[一1]\s*次/i,            // "每种轻症只给付一次"
    /每种.{0,10}仅给付\s*[一1]\s*次/i,            // "每种轻症仅给付一次"
    /每种.*?仅限.*?[给付赔付].*?[一1]\s*次/i,    // "每种轻症疾病仅限给付一次"
    /每[种个].*?[病种疾病].*?仅限.*?[一1]\s*次/i, // "每种疾病仅限一次"
  ];
  
  for (const coverage of coverages) {
    const note = coverage.parsedResult?.note || '';
    const clauseText = coverage.clauseText || '';
    const textToCheck = note + ' ' + clauseText;
    
    // 当前是否标记为可重复赔付
    const currentIsRepeatable = coverage.isRepeatablePayout;
    
    // 检查是否包含不可重复赔付的关键词
    const shouldBeNotRepeatable = notRepeatablePatterns.some(pattern => pattern.test(textToCheck));
    
    // 如果当前是 true 但应该是 false，需要修复
    if (currentIsRepeatable === true && shouldBeNotRepeatable) {
      await prisma.insuranceCoverageLibrary.update({
        where: { id: coverage.id },
        data: { isRepeatablePayout: false }
      });
      
      fixedCount++;
      if (fixedCount <= 10) {
        console.log(`修复: 序号${coverage.sequenceNumber} - ${coverage.coverageName}`);
        console.log(`  note: ${note.substring(0, 50)}...`);
        console.log(`  isRepeatablePayout: true -> false\n`);
      }
    }
  }
  
  console.log(`\n修复完成! 共更新 ${fixedCount} 条记录`);
  
  // 验证
  const verify = await prisma.insuranceCoverageLibrary.findFirst({
    where: {
      policyIdNumber: { contains: '人保寿险[2021]疾病保险088号' },
      coverageName: '轻症疾病保险金'
    }
  });
  if (verify) {
    console.log(`\n验证 - 人保寿险[2021]疾病保险088号 轻症疾病保险金:`);
    console.log(`  isRepeatablePayout: ${verify.isRepeatablePayout}`);
  }
  
  await prisma.$disconnect();
}

fixRepeatablePayout().catch(console.error);
