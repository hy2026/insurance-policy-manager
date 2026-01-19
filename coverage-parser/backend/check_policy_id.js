const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPolicyId() {
  try {
    // 查询所有数据
    const allData = await prisma.insuranceCoverageLibrary.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        parsedResult: true,
        product: {
          select: {
            productName: true
          }
        }
      }
    });
    
    console.log(`总记录数: ${allData.length}\n`);
    
    // 检查保单ID号
    const noPolicyId = [];
    allData.forEach((item, index) => {
      const parsed = item.parsedResult;
      const 保单ID号 = parsed && parsed.保单ID号;
      const 序号 = parsed && parsed.序号;
      
      if (!保单ID号) {
        noPolicyId.push({
          index: index,
          id: item.id,
          序号: 序号,
          productName: item.product?.productName || '(无)'
        });
      }
    });
    
    console.log(`缺少保单ID号的数据: ${noPolicyId.length} 条\n`);
    
    if (noPolicyId.length > 0) {
      console.log('按序号分组统计:');
      const groups = {
        '1-200': 0,
        '201-500': 0,
        '501-1000': 0,
        '1001+': 0,
        '无序号': 0
      };
      
      noPolicyId.forEach(item => {
        if (!item.序号) {
          groups['无序号']++;
        } else if (item.序号 <= 200) {
          groups['1-200']++;
        } else if (item.序号 <= 500) {
          groups['201-500']++;
        } else if (item.序号 <= 1000) {
          groups['501-1000']++;
        } else {
          groups['1001+']++;
        }
      });
      
      console.log(groups);
      
      console.log('\n前20条缺少保单ID号的数据:');
      noPolicyId.slice(0, 20).forEach(item => {
        console.log(`  序号 ${item.序号 || '(空)'}, ID ${item.id}: ${item.productName}`);
      });
      
      // 检查序号201附近
      console.log('\n序号195-210的保单ID号情况:');
      allData.slice(195, 210).forEach(item => {
        const parsed = item.parsedResult;
        console.log(`  序号 ${parsed?.序号 || '(空)'}, 保单ID号 = ${parsed?.保单ID号 || '(空)'}`);
      });
    }
    
  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPolicyId();
