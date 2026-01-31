/**
 * ==========================================
 * 主力修复工具 (MASTER FIX TOOL)
 * ==========================================
 * 
 * 【定位】配合 MASTER_QUALITY_CHECKER 的问题修复工具
 * 【原则】分层修复：自动修复 → 自动建议 → 标记人工
 * 
 * 使用方式：
 * npx ts-node MASTER_FIX_TOOL.ts --auto  # 自动修复 Level 1
 * npx ts-node MASTER_FIX_TOOL.ts --suggest  # 自动提取建议（Level 2）
 * npx ts-node MASTER_FIX_TOOL.ts --all  # 全部
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface FixLog {
  seq: number;
  category: string;
  action: string;
  success: boolean;
  details: string;
}

const logs: FixLog[] = [];

// ============================================
// 核心函数：自动生成自然语言描述
// ============================================
function regenerateDescription(stage: any): string {
  const parts: string[] = [];

  // 1. 赔付金额
  if (stage.payoutStructure) {
    const ps = stage.payoutStructure;
    if (ps.firstPayout) {
      parts.push(`首次给付${ps.firstPayout}`);
    }
    if (ps.subsequentPayout) {
      parts.push(`之后每次给付${ps.subsequentPayout}`);
    }
    if (ps.cumulativeLimit) {
      parts.push(`累计给付限额${formatLimit(ps.cumulativeLimit)}`);
    }
  } else if (stage.formula) {
    parts.push(`赔付${stage.formula}`);
  }

  // 2. 年龄条件
  if (stage.ageConditions && stage.ageConditions.length > 0) {
    const ageDesc = stage.ageConditions.map((ac: any) => {
      const op = ac.operator === '>=' ? '满' : ac.operator === '<' ? '未满' : ac.operator;
      return `${ac.type}${op}${ac.limit}周岁`;
    }).join('且');
    parts.push(ageDesc);
  }

  // 3. 保单年度
  if (stage.policyYearRange) {
    const pr = stage.policyYearRange;
    const start = pr.startInclusive ? `第${pr.start}年起` : `第${pr.start}年后`;
    const end = pr.endInclusive ? `至第${pr.end}年` : `至第${pr.end}年前`;
    if (pr.start === pr.end) {
      parts.push(`第${pr.start}保单年度`);
    } else {
      parts.push(`${start}${end}`);
    }
  }

  // 4. 交费期
  if (stage.paymentPeriodStatus) {
    parts.push(stage.paymentPeriodStatus === 'during' ? '交费期间内' : '交费期后');
  }

  // 5. 等待期
  if (stage.waitingPeriod) {
    const wp = stage.waitingPeriod;
    parts.push(wp.applies ? `等待期内` : `等待期后`);
  }

  return parts.join('，');
}

function formatLimit(limit: any): string {
  if (typeof limit === 'string') return limit;
  if (limit.amount && limit.unit) {
    return `${limit.amount}${limit.unit}`;
  }
  return JSON.stringify(limit);
}

// ============================================
// Level 1：完全自动修复
// ============================================

async function autoFix() {
  console.log('\n【Level 1：完全自动修复】\n');

  // 1. 年龄条件重复（622, 637, 638）
  await fixAgeDuplicates([622, 637, 638]);

  // 2. 交费期描述缺失（104）
  await fixPaymentPeriodDesc(104);

  // 3. 653/655：基本保额写成已交保费
  await fix653And655();

  // 4. 年龄数值错误：已明确的修正（根据原文）
  await fixKnownAgeErrors();

  // 5. 持续给付改结构
  await fixContinuousPayoutStructure();
}

async function fixContinuousPayoutStructure() {
  const configs: { [key: number]: any } = {
    106: {
      firstPayout: '基本保额 * 5%',
      subsequentPayout: '基本保额 * 5%',
      payoutTiming: '每个年生效对应日',
      maxPayouts: 5,
      cumulativeLimit: { formula: '基本保额 * 25%', unit: '基本保额', type: 'total' }
    },
    268: {
      firstPayout: '保险金额 * 20%',
      subsequentPayout: '保险金额 * 20%',
      payoutTiming: '每年确诊对应日',
      maxPayouts: null,
      cumulativeLimit: null
    },
    280: {
      firstPayout: '基本保额 * 20%',
      subsequentPayout: '基本保额 * 20%',
      payoutTiming: '每个合同生效日对应日',
      maxPayouts: 5,
      cumulativeLimit: { formula: '基本保额 * 100%', unit: '基本保额', type: 'total' }
    },
    337: {
      firstPayout: '基本保额 * 25%',
      subsequentPayout: '基本保额 * 25%',
      payoutTiming: '每一保单生效对应日',
      maxPayouts: 4,
      cumulativeLimit: { formula: '基本保额 * 100%', unit: '基本保额', type: 'total' }
    },
    403: {
      firstPayout: '基本保额 * 4%',
      subsequentPayout: '基本保额 * 4%',
      payoutTiming: '每个恶性肿瘤确诊周年日',
      maxPayouts: 5,
      cumulativeLimit: { formula: '基本保额 * 20%', unit: '基本保额', type: 'total' }
    },
    404: {
      firstPayout: '基本保额 * 20%',
      subsequentPayout: '基本保额 * 20%',
      payoutTiming: '每个恶性肿瘤确诊周年日',
      maxPayouts: 3,
      cumulativeLimit: { formula: '基本保额 * 60%', unit: '基本保额', type: 'total' }
    },
    405: {
      firstPayout: '基本保额 * 30%',
      subsequentPayout: '基本保额 * 30%',
      payoutTiming: '每个恶性肿瘤——重度确诊周年日',
      maxPayouts: 3,
      cumulativeLimit: { formula: '基本保额 * 90%', unit: '基本保额', type: 'total' }
    }
  };

  for (const [seqStr, config] of Object.entries(configs)) {
    const seq = parseInt(seqStr);
    try {
      const record = await prisma.insuranceCoverageLibrary.findFirst({
        where: { sequenceNumber: seq, reviewStatus: { in: ['pending', 'rejected'] } }
      });

      if (!record) {
        logs.push({ seq, category: '持续给付', action: '跳过', success: false, details: '记录不存在或已通过' });
        continue;
      }

      const parsed: any = record.parsedResult;
      const stage = parsed.payoutAmount?.[0];
      if (!stage) {
        logs.push({ seq, category: '持续给付', action: '跳过', success: false, details: '无阶段' });
        continue;
      }

      // 删除formula，添加payoutStructure
      delete stage.formula;
      stage.payoutStructure = {
        firstPayout: config.firstPayout,
        subsequentPayout: config.subsequentPayout,
        payoutTiming: config.payoutTiming,
        maxPayouts: config.maxPayouts,
        cumulativeLimit: config.cumulativeLimit
      };

      // 重新生成描述
      const parts = [];
      parts.push(`${config.payoutTiming}给付${config.subsequentPayout}`);
      if (config.maxPayouts) {
        parts.push(`最多${config.maxPayouts}次`);
      }
      if (config.cumulativeLimit) {
        parts.push(`累计${config.cumulativeLimit.formula}`);
      }
      if (stage.ageConditions && stage.ageConditions.length > 0) {
        const ageDesc = stage.ageConditions.map((ac: any) => 
          `${ac.type}${ac.operator === '>=' ? '满' : ac.operator === '<' ? '未满' : ac.operator}${ac.limit}周岁`
        ).join('且');
        parts.push(ageDesc);
      }
      stage.naturalLanguageDescription = parts.join('，');

      await prisma.insuranceCoverageLibrary.update({
        where: { id: record.id },
        data: { parsedResult: parsed }
      });

      console.log(`  ✅ 序号${seq}: 已改用payoutStructure结构`);
      logs.push({ seq, category: '持续给付', action: '已修复', success: true, details: '已改用payoutStructure' });
    } catch (error: any) {
      console.log(`  ❌ 序号${seq}: ${error.message}`);
      logs.push({ seq, category: '持续给付', action: '失败', success: false, details: error.message });
    }
  }
}

async function fixAgeDuplicates(seqs: number[]) {
  for (const seq of seqs) {
    try {
      const record = await prisma.insuranceCoverageLibrary.findFirst({
        where: { sequenceNumber: seq, reviewStatus: { in: ['pending', 'rejected'] } }
      });
      if (!record) {
        logs.push({ seq, category: '年龄重复', action: '跳过', success: false, details: '记录不存在或已通过' });
        continue;
      }

      const parsed: any = record.parsedResult;
      let modified = false;

      for (const stage of parsed.payoutAmount || []) {
        if (!stage.ageConditions || stage.ageConditions.length < 2) continue;

        const seen = new Set<string>();
        const newAgeConditions = [];
        for (const ac of stage.ageConditions) {
          const key = `${ac.type}-${ac.limit}-${ac.operator}`;
          if (!seen.has(key)) {
            seen.add(key);
            newAgeConditions.push(ac);
          } else {
            modified = true;
          }
        }
        stage.ageConditions = newAgeConditions;

        if (modified) {
          stage.naturalLanguageDescription = regenerateDescription(stage);
        }
      }

      if (modified) {
        await prisma.insuranceCoverageLibrary.update({
          where: { id: record.id },
          data: { parsedResult: parsed }
        });
        logs.push({ seq, category: '年龄重复', action: '已修复', success: true, details: '已删除重复年龄条件并更新描述' });
      } else {
        logs.push({ seq, category: '年龄重复', action: '无需修改', success: true, details: '未发现重复' });
      }
    } catch (error: any) {
      logs.push({ seq, category: '年龄重复', action: '失败', success: false, details: error.message });
    }
  }
}

async function fixPaymentPeriodDesc(seq: number) {
  try {
    const record = await prisma.insuranceCoverageLibrary.findFirst({
      where: { sequenceNumber: seq, reviewStatus: { in: ['pending', 'rejected'] } }
    });
    if (!record) {
      logs.push({ seq, category: '交费期描述', action: '跳过', success: false, details: '记录不存在或已通过' });
      return;
    }

    const parsed: any = record.parsedResult;
    const stage = parsed.payoutAmount?.[0];
    if (!stage || !stage.paymentPeriodStatus) {
      logs.push({ seq, category: '交费期描述', action: '跳过', success: false, details: '无paymentPeriodStatus' });
      return;
    }

    const desc = stage.naturalLanguageDescription || '';
    if (desc.includes('交费期') || desc.includes('缴费期')) {
      logs.push({ seq, category: '交费期描述', action: '无需修改', success: true, details: '描述中已包含交费期' });
      return;
    }

    const periodText = stage.paymentPeriodStatus === 'during' ? '交费期间内' : '交费期后';
    stage.naturalLanguageDescription = `${periodText}，${desc}`;

    await prisma.insuranceCoverageLibrary.update({
      where: { id: record.id },
      data: { parsedResult: parsed }
    });
    logs.push({ seq, category: '交费期描述', action: '已修复', success: true, details: `已添加"${periodText}"` });
  } catch (error: any) {
    logs.push({ seq, category: '交费期描述', action: '失败', success: false, details: error.message });
  }
}

async function fix653And655() {
  for (const seq of [653, 655]) {
    try {
      const record = await prisma.insuranceCoverageLibrary.findFirst({
        where: { sequenceNumber: seq, reviewStatus: { in: ['pending', 'rejected'] } }
      });
      if (!record) {
        logs.push({ seq, category: '赔付类型', action: '跳过', success: false, details: '记录不存在或已通过' });
        continue;
      }

      const parsed: any = record.parsedResult;
      const stages = parsed.payoutAmount || [];
      
      // 653/655：阶段1应该是基本保额，阶段2是已交保费（等待期内）
      // 从原文看：阶段1是"等待期后...基本保险金额"，阶段2是"等待期内...已交保险费"
      // 需要交换两个阶段
      if (stages.length === 2) {
        // 交换阶段1和阶段2
        [stages[0], stages[1]] = [stages[1], stages[0]];
        stages[0].stageNumber = 1;
        stages[1].stageNumber = 2;

        // 更新描述
        stages.forEach((stage: any) => {
          stage.naturalLanguageDescription = regenerateDescription(stage);
        });

        await prisma.insuranceCoverageLibrary.update({
          where: { id: record.id },
          data: { parsedResult: parsed }
        });
        logs.push({ seq, category: '赔付类型', action: '已修复', success: true, details: '已交换阶段顺序（阶段1改为基本保额）并更新描述' });
      } else {
        logs.push({ seq, category: '赔付类型', action: '跳过', success: false, details: `阶段数不为2（当前${stages.length}）` });
      }
    } catch (error: any) {
      logs.push({ seq, category: '赔付类型', action: '失败', success: false, details: error.message });
    }
  }
}

// ============================================
// Level 2：自动提取建议
// ============================================

async function autoSuggest() {
  console.log('\n【Level 2：自动提取建议】\n');

  // 1. 赔付限额：279, 488, 747
  await suggestCumulativeLimit([279, 488, 747]);

  // 2. 年龄数值错误：139, 386, 394, 398, 401
  await suggestAgeCorrection([139, 386, 394, 398, 401]);

  // 3. 保单年度缺失：105
  await suggestPolicyYear(105);

  // 4. 性别限制缺失：547
  await suggestGenderCondition(547);
}

async function suggestCumulativeLimit(seqs: number[]) {
  for (const seq of seqs) {
    try {
      const record = await prisma.insuranceCoverageLibrary.findFirst({
        where: { sequenceNumber: seq, reviewStatus: { in: ['pending', 'rejected'] } }
      });
      if (!record) {
        logs.push({ seq, category: '赔付限额', action: '跳过', success: false, details: '记录不存在或已通过' });
        continue;
      }

      const text = record.clauseText || '';
      const parsed: any = record.parsedResult;
      
      // 提取限额（支持多种表述）
      const limitPatterns = [
        /(?:最多|最高)?不?超过(?:人民币)?(\d+(?:,\d+)?)万元/,
        /以(?:人民币)?(\d+(?:,\d+)?)万元为限/,
        /(?:每次|单次)给付金额以(?:人民币)?(\d+(?:,\d+)?)(?:万)?元为限/,
        /不超过(?:人民币)?(\d+(?:,\d+)?)元/
      ];

      let limitAmount = null;
      let limitUnit = '元';
      
      for (const pattern of limitPatterns) {
        const match = text.match(pattern);
        if (match) {
          let amount = parseInt(match[1].replace(/,/g, ''));
          if (pattern.source.includes('万元')) {
            amount = amount * 10000;
          }
          limitAmount = amount;
          break;
        }
      }

      if (limitAmount) {
        // 自动添加到所有阶段
        let modified = false;
        for (const stage of parsed.payoutAmount || []) {
          if (!stage.cumulativeLimit) {
            stage.cumulativeLimit = {
              amount: limitAmount,
              unit: limitUnit,
              type: 'single'
            };
            stage.naturalLanguageDescription = regenerateDescription(stage);
            modified = true;
          }
        }

        if (modified) {
          await prisma.insuranceCoverageLibrary.update({
            where: { id: record.id },
            data: { parsedResult: parsed }
          });
          console.log(`  ✅ 序号${seq}: 已添加 cumulativeLimit: ${limitAmount}${limitUnit}`);
          logs.push({ seq, category: '赔付限额', action: '已修复', success: true, details: `已添加 ${limitAmount}${limitUnit}` });
        } else {
          console.log(`  💡 序号${seq}: 已有cumulativeLimit`);
          logs.push({ seq, category: '赔付限额', action: '无需修改', success: true, details: '已有限额' });
        }
      } else {
        console.log(`  ⚠️ 序号${seq}: 未找到限额模式，需人工查看`);
        logs.push({ seq, category: '赔付限额', action: '建议', success: false, details: '未找到限额' });
      }
    } catch (error: any) {
      logs.push({ seq, category: '赔付限额', action: '失败', success: false, details: error.message });
    }
  }
}

async function suggestAgeCorrection(seqs: number[]) {
  for (const seq of seqs) {
    try {
      const record = await prisma.insuranceCoverageLibrary.findFirst({
        where: { sequenceNumber: seq, reviewStatus: { in: ['pending', 'rejected'] } }
      });
      if (!record) {
        logs.push({ seq, category: '年龄数值', action: '跳过', success: false, details: '记录不存在或已通过' });
        continue;
      }

      const text = record.clauseText || '';
      const parsed: any = record.parsedResult || {};
      const stage = parsed.payoutAmount?.[0];
      if (!stage || !stage.ageConditions || stage.ageConditions.length === 0) continue;

      const currentAge = stage.ageConditions[0].limit;
      
      // 全面提取年龄
      const foundAges = extractAllAges(text);
      
      // 智能判断：如果原文中只有一个年龄数字且与当前不同
      if (foundAges.size === 1 && !foundAges.has(currentAge)) {
        const correctAge = Array.from(foundAges)[0];
        stage.ageConditions[0].limit = correctAge;
        stage.naturalLanguageDescription = regenerateDescription(stage);
        
        await prisma.insuranceCoverageLibrary.update({
          where: { id: record.id },
          data: { parsedResult: parsed }
        });
        
        console.log(`  ✅ 序号${seq}: 已将年龄 ${currentAge} 修正为 ${correctAge}`);
        logs.push({ seq, category: '年龄数值', action: '已修复', success: true, details: `${currentAge} → ${correctAge}` });
      } else {
        console.log(`  💡 序号${seq}: 当前${currentAge}，原文中找到 ${Array.from(foundAges).join(', ')} - 需人工确认`);
        logs.push({ seq, category: '年龄数值', action: '建议', success: true, details: `原文: ${Array.from(foundAges).join(', ')}` });
      }
    } catch (error: any) {
      logs.push({ seq, category: '年龄数值', action: '失败', success: false, details: error.message });
    }
  }
}

function extractAllAges(text: string): Set<number> {
  const ages = new Set<number>();
  const textClean = text.replace(/[（(][^）)]*[）)]/g, '');
  
  // 中文数字映射
  const chineseNum: any = {
    '十八': 18, '十九': 19, '二十': 20, '三十': 30, '四十': 40, '五十': 50,
    '六十': 60, '六十五': 65, '七十': 70, '七十五': 75, '八十': 80, '八十五': 85, '九十': 90
  };
  
  // 提取阿拉伯数字年龄
  const arabicMatches = textClean.matchAll(/(\d+)\s*(?:周岁|岁)/g);
  for (const match of arabicMatches) {
    const age = parseInt(match[1]);
    if (age >= 1 && age <= 120) ages.add(age);
  }
  
  // 提取中文数字年龄
  for (const [cn, num] of Object.entries(chineseNum)) {
    if (textClean.includes(cn)) {
      ages.add(num as number);
    }
  }
  
  return ages;
}

async function suggestPolicyYear(seq: number) {
  const record = await prisma.insuranceCoverageLibrary.findFirst({
    where: { sequenceNumber: seq }
  });
  if (!record) return;

  const text = record.clauseText || '';
  const yearMatch = text.match(/第([一二三0-9]+)保单年度|保单年度第([一二三0-9]+)/);
  
  if (yearMatch) {
    console.log(`  序号${seq}: 建议添加 policyYearRange，需查看原文确认具体范围`);
    logs.push({ seq, category: '保单年度', action: '建议', success: true, details: '需人工确认年度范围' });
  }
}

async function suggestGenderCondition(seq: number) {
  try {
    const record = await prisma.insuranceCoverageLibrary.findFirst({
      where: { sequenceNumber: seq, reviewStatus: { in: ['pending', 'rejected'] } }
    });
    if (!record) {
      logs.push({ seq, category: '性别限制', action: '跳过', success: false, details: '记录不存在或已通过' });
      return;
    }

    const text = record.clauseText || '';
    const genderMatch = text.match(/男[性：]*(\d+)周岁.*女[性：]*(\d+)周岁|女[性：]*(\d+)周岁.*男[性：]*(\d+)周岁/);
    
    if (genderMatch) {
      const maleAge = parseInt(genderMatch[1] || genderMatch[4] || '0');
      const femaleAge = parseInt(genderMatch[2] || genderMatch[3] || '0');
      
      const parsed: any = record.parsedResult;
      const stage = parsed.payoutAmount?.[0];
      if (!stage) {
        logs.push({ seq, category: '性别限制', action: '跳过', success: false, details: '无阶段' });
        return;
      }

      // 添加性别条件（如果还没有）
      if (!stage.genderCondition) {
        stage.note = `需要性别条件：男性年满${maleAge}周岁，女性年满${femaleAge}周岁`;
        stage.naturalLanguageDescription = regenerateDescription(stage);

        await prisma.insuranceCoverageLibrary.update({
          where: { id: record.id },
          data: { parsedResult: parsed }
        });
        console.log(`  ✅ 序号${seq}: 已在note中添加性别限制建议`);
        logs.push({ seq, category: '性别限制', action: '已修复', success: true, details: `男${maleAge}岁, 女${femaleAge}岁` });
      } else {
        console.log(`  💡 序号${seq}: 已有性别条件`);
        logs.push({ seq, category: '性别限制', action: '无需修改', success: true, details: '已有性别条件' });
      }
    } else {
      console.log(`  ⚠️ 序号${seq}: 未找到性别模式`);
      logs.push({ seq, category: '性别限制', action: '建议', success: false, details: '未找到性别' });
    }
  } catch (error: any) {
    logs.push({ seq, category: '性别限制', action: '失败', success: false, details: error.message });
  }
}

async function fixKnownAgeErrors() {
  // 139: 原文无年龄限制，应删除年龄条件
  try {
    const r139 = await prisma.insuranceCoverageLibrary.findFirst({
      where: { sequenceNumber: 139, reviewStatus: { in: ['pending', 'rejected'] } }
    });
    if (r139) {
      const parsed: any = r139.parsedResult;
      const stage = parsed.payoutAmount?.[0];
      if (stage?.ageConditions) {
        stage.ageConditions = [];  // 删除年龄条件
        stage.naturalLanguageDescription = regenerateDescription(stage);
        await prisma.insuranceCoverageLibrary.update({
          where: { id: r139.id },
          data: { parsedResult: parsed }
        });
        console.log(`  ✅ 序号139: 已删除错误的年龄条件（原文无年龄限制）`);
        logs.push({ seq: 139, category: '年龄数值', action: '已修复', success: true, details: '已删除年龄条件' });
      }
    }
  } catch (error: any) {
    logs.push({ seq: 139, category: '年龄数值', action: '失败', success: false, details: error.message });
  }

  const fixes = [
    { seq: 386, oldAge: 18, newAge: 22, reason: '原文：年满二十二岁' },
    { seq: 398, oldAge: 70, newAge: 75, reason: '原文：年满七十五岁' },
    { seq: 401, oldAge: 70, newAge: 65, reason: '原文：年满六十五岁' }
  ];

  for (const fix of fixes) {
    try {
      const record = await prisma.insuranceCoverageLibrary.findFirst({
        where: { sequenceNumber: fix.seq, reviewStatus: { in: ['pending', 'rejected'] } }
      });
      if (!record) {
        logs.push({ seq: fix.seq, category: '年龄数值', action: '跳过', success: false, details: '记录不存在或已通过' });
        continue;
      }

      const parsed: any = record.parsedResult;
      const stage = parsed.payoutAmount?.[0];
      if (!stage?.ageConditions?.[0]) {
        logs.push({ seq: fix.seq, category: '年龄数值', action: '跳过', success: false, details: '无年龄条件' });
        continue;
      }

      if (stage.ageConditions[0].limit === fix.oldAge) {
        stage.ageConditions[0].limit = fix.newAge;
        stage.naturalLanguageDescription = regenerateDescription(stage);

        await prisma.insuranceCoverageLibrary.update({
          where: { id: record.id },
          data: { parsedResult: parsed }
        });
        console.log(`  ✅ 序号${fix.seq}: ${fix.oldAge} → ${fix.newAge} (${fix.reason})`);
        logs.push({ seq: fix.seq, category: '年龄数值', action: '已修复', success: true, details: `${fix.oldAge} → ${fix.newAge}` });
      } else {
        logs.push({ seq: fix.seq, category: '年龄数值', action: '无需修改', success: true, details: '年龄已正确' });
      }
    } catch (error: any) {
      logs.push({ seq: fix.seq, category: '年龄数值', action: '失败', success: false, details: error.message });
    }
  }
}

// ============================================
// 主函数
// ============================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║              主力修复工具 v1.0                          ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  const args = process.argv.slice(2);
  const mode = args[0] || '--all';

  if (mode === '--auto' || mode === '--all') {
    await autoFix();
  }

  if (mode === '--suggest' || mode === '--all') {
    await autoSuggest();
  }

  await prisma.$disconnect();

  // 输出日志
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║                    修复结果                             ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const successCount = logs.filter(l => l.success && l.action === '已修复').length;
  const suggestionCount = logs.filter(l => l.action === '建议').length;

  console.log(`✅ 已自动修复: ${successCount} 个`);
  console.log(`💡 已生成建议: ${suggestionCount} 个\n`);

  logs.forEach(log => {
    const icon = log.success ? (log.action === '已修复' ? '✅' : '💡') : '⚠️';
    console.log(`${icon} [${log.category}] 序号${log.seq}: ${log.details}`);
  });
}

main().catch(console.error);
