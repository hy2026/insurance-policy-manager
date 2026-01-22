const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// 中文数字转换
function convertChineseNum(cn) {
  const cnNum = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10};
  return cnNum[cn] || cn;
}

async function fixCumulativeLimit() {
  console.log('开始修复数据库中缺失的累计赔付次数...\n');
  
  // 获取所有责任记录 - 使用正确的模型名
  const coverages = await prisma.insuranceCoverageLibrary.findMany();
  console.log(`共有 ${coverages.length} 条记录\n`);
  
  let fixedCount = 0;
  
  for (const coverage of coverages) {
    // 从 parsedResult 或 clauseText 获取原文
    const 原文 = coverage.clauseText || coverage.parsedResult?.责任原文 || '';
    const currentNote = coverage.parsedResult?.note || '';
    
    // 查找累计次数
    const match = 原文.match(/累计给付以([一二三四五六七八九十\d]+)次为限/);
    if (!match) continue;
    
    let 累计次数 = convertChineseNum(match[1]);
    if (typeof 累计次数 === 'string' && /^\d+$/.test(累计次数)) {
      累计次数 = parseInt(累计次数);
    }
    
    // 检查是否已有累计信息
    if (currentNote && (currentNote.includes('累计') || currentNote.includes('最多'))) {
      continue;
    }
    
    // 构建新的note
    const 新增 = `累计最多赔${累计次数}次`;
    let newNote;
    if (currentNote) {
      if (currentNote.includes('每种')) {
        const parts = currentNote.split('；');
        newNote = `${parts[0]}；${新增}${parts.length > 1 ? '；' + parts.slice(1).join('；') : ''}`;
      } else {
        newNote = `${新增}；${currentNote}`;
      }
    } else {
      newNote = 新增;
    }
    
    // 更新 parsedResult 中的 note
    const newParsedResult = {
      ...coverage.parsedResult,
      note: newNote
    };
    
    // 更新数据库
    await prisma.insuranceCoverageLibrary.update({
      where: { id: coverage.id },
      data: { parsedResult: newParsedResult }
    });
    
    fixedCount++;
    
    if (fixedCount <= 10) {
      console.log(`修复: 序号${coverage.sequenceNumber} - ${coverage.coverageName}`);
      console.log(`  原note: ${currentNote || '(空)'}`);
      console.log(`  新note: ${newNote}\n`);
    }
  }
  
  console.log(`\n修复完成! 共更新 ${fixedCount} 条记录`);
  
  // 验证人保寿险相关记录
  const verify = await prisma.insuranceCoverageLibrary.findFirst({
    where: {
      policyIdNumber: { contains: '人保寿险[2021]疾病保险088号' },
      coverageName: '轻症疾病保险金'
    }
  });
  if (verify) {
    console.log(`\n验证 - 人保寿险[2021]疾病保险088号 轻症疾病保险金:`);
    console.log(`  note: ${verify.parsedResult?.note}`);
  }
  
  await prisma.$disconnect();
}

fixCumulativeLimit().catch(console.error);
