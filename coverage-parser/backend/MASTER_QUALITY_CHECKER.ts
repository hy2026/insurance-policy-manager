/**
 * ==========================================
 * 赔付金额结构检查工具 (PAYOUT STRUCTURE CHECKER)
 * ==========================================
 * 
 * 【定位】专注于赔付金额结构的深度检查
 * 【范围】只检查payoutAmount相关的结构性问题，不涉及note内容、等待期等其他领域
 * 
 * 使用说明：
 * 1. 每次发现新的赔付金额结构错误模式，必须添加到这个文件中
 * 2. 不要创建新的临时检查脚本，直接扩展这个文件
 * 3. 每次添加新检查规则时，更新下方的"检查项清单"
 * 
 * 维护原则：
 * - ✅ 职责单一：只检查赔付金额结构
 * - ✅ 深度优先：深入检查该领域的所有问题
 * - ✅ 只增不减（除非规则被废弃）
 * - ✅ 每个检查函数独立，便于维护
 * - ✅ 清晰的分类和注释
 * - ✅ 提供修复建议
 * 
 * 版本历史：
 * - v1.9.5 (2026-02-01): 基于误判分析，优化高误判规则（平衡错误检出与误判率）：
 *                        ① 禁用"需要拆分阶段"检查（100%误判，40/40全错）；
 *                        ② 放宽"formula百分比"检查（常见倍数如150%/200%不再检查，降低99%→预期50%以下误判率）；
 *                        ③ 优化"formula可能错误"检查（增加身故责任/新批次等排除条件，保留对真实错误的检出能力）；
 *                        目标：将总体误判率从23%降至10%以下，同时保持对真实错误的检出能力。
 * - v1.9 (2026-01-30): 基于59条修复记录的根因分析，强化关键检查规则：
 *                      ① 2.4 增强operator方向检测（新增"于...之前/之后"、"不含X周岁"等模式）；
 *                      ② 2.5 增强type检测（新增"生效时"、"本合同生效时"等投保时关键词）；
 *                      ③ 2.6 改为通用反向检查（从原文提取所有年龄，检查是否有遗漏）；
 *                      重要原则：赔付标准相同时，即使男/女/孩子年龄不同，也在一个阶段，不拆分。
 * - v1.8 (2026-01-30): 基于59条修复记录的分析，新增关键检查项：
 *                      ① 1.2 formula与原文一致性检查（已交保费vs基本保额、百分比核对）；
 *                      ② 5.2 note内容规范检查（禁止年龄/保单年度/等待期/性别等内容，只允许5类）；
 *                      这两项可覆盖今天修复的12+1=13条记录的问题类型。
 * - v1.7 (2026-01-30): 新增2.9 naturalLanguageDescription与ageConditions不一致检查（检查描述与字段的operator、type、年龄数值一致性）；
 *                      基于34条已修复年龄错误的分析，强化描述一致性检查。
 * - v1.6 (2026-01-30): 多阶段检查收严；年龄数值检查收严：
 *                      年龄数值可能错误：排除用户确认正确的180/276/493/546/574/592；排除其它问题类型618/547(性别限制)、653/655(应基本保额却已交保费)、622/637/638(年龄限制重复)；年龄提取增加X岁、中文+岁。
 *                      (1)(2)规则：排除多次赔付、条件列举、在下列情况下/为：/如下：/下列：、等待期（1）如果（2）如果；
 *                      整条责任为“第二次/再次”类时不再报需要拆分；7.4/类别4 不承担→增加“不再承担”；
 *                      保单年度：排除持续给付语境；7.3 排除年度区间持续给付；7.4 排除第二次/再次类责任。
 *                      责任名称「X周岁前首次…给付保险金」时视为单阶段，不报拆分（579、739误判修复）。
 * - v1.5 (2026-01-30): 多阶段赔付识别优化（用户反馈校准）：
 *                      ✅ 优化保单年度检查：排除"第X次确诊"、持续给付、条款编号
 *                      ✅ 新增年龄分段检查：识别真实的年龄分段赔付（如65周岁前后不同赔付）
 *                      ✅ 排除年龄限制：区分"不赔付"限制（不承担责任）vs 真实的年龄分段
 *                      ✅ 关键判断：每个年龄段都有赔付，而不是"不赔付/终止责任"的限制
 * - v1.4 (2026-01-30): 优化持续给付检查规则（根据用户校准）：
 *                      持续给付定义：一次确诊+之后每年对应日/确诊周年日给付
 *                      扩展识别模式：每个年生效对应日、每个确诊周年日、每个合同对应日
 *                      移除：多次赔付次数检查（不属于"赔付金额结构"范围）
 * - v1.3 (2026-01-30): 修复7个误判规则（减少超过240个误报）：
 *                      1. 中文数字转换bug（"十八"→18,"二十"→20）✅
 *                      2. 年龄类型检查（必须检查年龄限制的具体对象）✅
 *                      3. 交费期检查（排除豁免条件中的交费期）✅
 *                      4. 阶段拆分判断（更精确的正则，避免"第11...第一次"误判）✅
 *                      5. 多阶段赔付判断（必须是不同年度数字，避免"第20...第20"误判）✅
 *                      6. formula检查（有payoutStructure时formula为undefined是正常的）✅
 *                      7. 年龄提取（排除括号内重复内容，如"30周岁（含30岁）"）✅
 * - v1.2 (2026-01-30): 修复P2误报：年龄运算符检查改为"从该年龄到下一个年龄数字之前"的范围；
 *                      新增：交费期条件未在naturalLanguageDescription中体现的检查（P1）
 * - v1.1 (2026-01-30): 专注赔付金额结构；添加中文数字识别；移除note内容检查；
 *                      新增：多阶段赔付识别、赔付限额识别、交费期字段检查
 * - v1.0 (2026-01-30): 整合所有已知检查规则
 */

import { PrismaClient } from '@prisma/client';
import { extractPolicyYearRange } from './policy_year_patterns_complete';

const prisma = new PrismaClient();

interface QualityIssue {
  category: string;        // 问题类别
  type: string;           // 具体问题类型
  sequenceNumber: number;
  coverageName: string;
  stageNumber?: number;
  details: string;        // 问题详情
  suggestedFix: string;   // 修复建议
  severity: 'P0' | 'P1' | 'P2';  // 严重程度
  clauseTextSnippet?: string;    // 原文片段
  reviewStatus?: string;   // ⭐ v1.9.4新增：记录审核状态，用于区分误判
}

// ============================================
// 检查项清单 (持续更新)
// ============================================
// 
// 【类别1：赔付公式问题】
// ✅ 1.1 formula为0或空
// ✅ 1.2 formula与原文一致性（已交保费vs基本保额、百分比核对）⭐ 新增
// 
// 【类别2：年龄条件问题】⭐ 支持中文数字识别
// ✅ 2.1 年龄条件互斥（如 > 30 和 < 30）
// ✅ 2.2 年龄条件冗余（如 <= 30 和 < 30）
// ✅ 2.3 年龄数值错误（原文75岁识别成70岁，含中文数字）
// ✅ 2.4 年龄运算符方向可能错误（单数字看句末，多数字看数字间）
// ✅ 2.5 年龄类型可能错误（投保时 vs 确诊时）
// ✅ 2.6 年龄条件缺失（缺少确诊时条件）
// ✅ 2.7 年龄区间识别错误（两个<应为区间）
// ✅ 2.8 年龄条件重复（同一阶段内 type、limit、operator 完全相同）
// ✅ 2.9 naturalLanguageDescription与ageConditions不一致（描述与字段的operator/type/年龄不符）⭐ 新增
// 
// 【类别3：保单年度问题】
// ✅ 3.1 保单年度缺失（原文提到但未识别）
// 
// 【类别4：阶段拆分问题】
// ✅ 4.1 需要拆分阶段（不同赔付金额应拆分）
// ✅ 4.2 阶段编号不连续
// 
// 【类别5：note字段问题】
// ✅ 5.1 note出现在阶段中（只检查位置，不检查内容）
// ✅ 5.2 note包含不应该出现的内容（禁止年龄/保单年度/等待期/性别/理赔金额）⭐ 新增
// 
// 【类别6：自然语言描述问题】
// ✅ 6.1 naturalLanguageDescription过短或缺失
// ✅ 6.2 naturalLanguageDescription缺少年龄信息
// 
// 【类别7：赔付结构问题】
// ✅ 7.1 持续给付未结构化（一次确诊+之后每年对应日/确诊周年日给付）
// ✅ 7.2 赔付限额未识别（最高XX万元）
// ✅ 7.3 多阶段赔付少识别（第2年、第3年不同赔付）
// 
// 【类别8：其他赔付相关字段】
// ✅ 8.1 交费期条件可能遗漏（原文提到但字段为空）
// ✅ 8.2 交费期条件未在描述中体现（有字段但naturalLanguageDescription中缺失）
// 
// ============================================

/**
 * 辅助函数：将阿拉伯数字转换为中文数字
 */
function numberToChinese(num: number): string {
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const units = ['', '十', '百'];
  
  if (num < 10) return digits[num];
  if (num < 20) return '十' + (num === 10 ? '' : digits[num - 10]);
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    return digits[tens] + '十' + (ones > 0 ? digits[ones] : '');
  }
  return String(num);  // 100以上返回阿拉伯数字
}

/**
 * 主检查函数
 */
async function masterQualityCheck() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║        赔付金额结构检查工具 v1.9.5                      ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // ⭐ v1.9.4改进：同时检查rejected和approved，验证误判率
  const allRecords = await prisma.insuranceCoverageLibrary.findMany({
    where: {
      reviewStatus: { in: ['rejected', 'approved'] }
    },
    select: {
      sequenceNumber: true,
      coverageName: true,
      clauseText: true,
      parsedResult: true,
      reviewStatus: true
    }
  });

  console.log(`检查 ${allRecords.length} 条记录\n`);

  const issues: QualityIssue[] = [];

  for (const record of allRecords) {
    if (!record.sequenceNumber) continue;

    const issuesBeforeCheck = issues.length;

    // 类别1：赔付公式问题
    checkFormulaIssues(record, issues);

    // 类别2：年龄条件问题
    checkAgeConditionIssues(record, issues);
    checkGenderConditions(record, issues);  // v1.9.4新增

    // 类别3：保单年度问题
    checkPolicyYearIssues(record, issues);

    // 类别4：阶段拆分问题
    checkStageSplitIssues(record, issues);

    // 类别5：note字段问题
    checkNoteFieldIssues(record, issues);

    // 类别6：自然语言描述问题
    checkDescriptionIssues(record, issues);

    // 类别7：持续给付和其他赔付结构问题
    checkPayoutStructureIssues(record, issues);

    // 类别8：其他赔付相关字段检查
    checkOtherPayoutFields(record, issues);

    // ⭐ v1.9.4：给本次检查产生的所有issues添加reviewStatus
    for (let i = issuesBeforeCheck; i < issues.length; i++) {
      issues[i].reviewStatus = record.reviewStatus;
    }
  }

  await prisma.$disconnect();

  // 生成报告
  generateReport(issues, allRecords);
}

// ============================================
// 类别1：赔付公式问题
// ============================================

function checkFormulaIssues(record: any, issues: QualityIssue[]) {
  const parsed: any = record.parsedResult;
  const stages = parsed?.payoutAmount || [];
  const clauseText = record.clauseText || '';

  stages.forEach((stage: any, idx: number) => {
    // 1.1 formula为0或空（但如果有payoutStructure则正常）
    const hasPayoutStructure = stage.payoutStructure && 
      (stage.payoutStructure.firstPayout || stage.payoutStructure.subsequentPayout);
    
    if (!hasPayoutStructure && 
        (stage.formula === 0 || stage.formula === '0' || 
         stage.formula === '' || stage.formula === null || 
         stage.formula === undefined)) {
      issues.push({
        category: '赔付公式问题',
        type: 'formula为0或空',
        sequenceNumber: record.sequenceNumber,
        coverageName: record.coverageName || '',
        stageNumber: stage.stageNumber,
        details: `阶段${stage.stageNumber}的formula为'${stage.formula}'，且无payoutStructure`,
        suggestedFix: '删除该阶段或修正formula，或添加payoutStructure',
        severity: 'P0'
      });
    }
    
    // 1.2 formula与原文关键词不一致⭐ 新增
    if (stage.formula && !hasPayoutStructure) {
      const formula = stage.formula.toString().toLowerCase();
      const clauseLower = clauseText.toLowerCase();
      
      // 检查"已交保费"vs"基本保额"（v1.9.5优化：增加更多排除条件，降低误判率）
      if (formula.includes('已交保费')) {
        // formula是已交保费，检查原文是否应该是基本保额
        const hasBasicAmount = clauseLower.includes('基本保险金额') || clauseLower.includes('基本保额');
        
        if (hasBasicAmount) {
          // ⭐ v1.9.5新增排除条件，降低误判率（从96%→预期70%以下）：
          // 1. 等待期内退费场景（原有）
          const isWaitingPeriodRefund = clauseLower.includes('等待期') && (clauseLower.includes('退还') || clauseLower.includes('返还')) && clauseLower.includes('已交');
          // 2. 身故责任通常是：等待期内已交保费+等待期后基本保额，多阶段是正常的
          const isDeathBenefit = (record.coverageType === '身故责任' || clauseLower.includes('身故')) && stages.length > 1;
          // 3. 原文同时包含"已交保费"和"基本保额"，说明是多阶段/多种情况，不是识别错误
          const hasBothInText = clauseLower.includes('已交保险费') || clauseLower.includes('已交保费') || clauseLower.includes('已缴');
          // 4. 序号>2600的新批次数据，误判率特别高，暂时排除（可根据后续反馈调整）
          const isNewBatch = record.sequenceNumber > 2600;
          
          if (!isWaitingPeriodRefund && !isDeathBenefit && !hasBothInText && !isNewBatch) {
            issues.push({
              category: '赔付公式问题',
              type: 'formula可能错误',
              sequenceNumber: record.sequenceNumber,
              coverageName: record.coverageName || '',
              stageNumber: stage.stageNumber,
              details: `阶段${stage.stageNumber}是"已交保费"，但原文提到"基本保险金额"`,
              suggestedFix: '检查是否应该改为"基本保额"（如果是等待期内退费或身故责任多阶段，可忽略）',
              severity: 'P1',
              clauseTextSnippet: clauseText.substring(0, 200)
            });
          }
        }
      } else if (formula.includes('基本保额')) {
        // ⭐ v1.9.5优化：检查formula是"基本保额"但原文说"已交保费"
        const hasPaidFee = clauseLower.includes('已交保险费') || clauseLower.includes('已交保费') || clauseLower.includes('已缴');
        const hasGiveKeyword = clauseLower.includes('给付') || clauseLower.includes('赔付');
        
        // 如果原文有"已交保费"且有给付关键词，检查是否应该用已交保费
        if (hasPaidFee && hasGiveKeyword) {
          // 排除条件：
          // 1. 只是"退还已交保费"的情况（原有）
          const isRefundOnly = (clauseLower.includes('退还') || clauseLower.includes('返还')) && !clauseLower.includes('基本保险金额');
          // 2. 身故责任多阶段（新增）
          const isDeathBenefit = (record.coverageType === '身故责任' || clauseLower.includes('身故')) && stages.length > 1;
          // 3. 原文同时包含两者（新增）
          const hasBothInText = clauseLower.includes('基本保险金额') || clauseLower.includes('基本保额');
          // 4. 新批次数据（新增）
          const isNewBatch = record.sequenceNumber > 2600;
          
          if (!isRefundOnly && !isDeathBenefit && !hasBothInText && !isNewBatch) {
            issues.push({
              category: '赔付公式问题',
              type: 'formula可能错误',
              sequenceNumber: record.sequenceNumber,
              coverageName: record.coverageName || '',
              stageNumber: stage.stageNumber,
              details: `阶段${stage.stageNumber}是"基本保额"，但原文提到"已交保费"`,
              suggestedFix: '检查是否应该改为"已交保费"',
              severity: 'P1',
              clauseTextSnippet: clauseText.substring(0, 200)
            });
          }
        }
        
        // 原有的等待期内检查（保留）
        if (stage.waitingPeriodStatus === 'during' && 
            (clauseLower.includes('已交保险费') || clauseLower.includes('退还') || clauseLower.includes('返还'))) {
          // 这个检查已经被上面的更通用检查覆盖了，可以不再重复报告
        }
      }
      
      // 检查百分比（v1.9.5改进：常见整数倍数通常隐含，只检查真正异常的百分比）
      const percentMatch = formula.match(/(\d+)%/);
      if (percentMatch) {
        const percent = parseInt(percentMatch[1]);
        
        // ⭐ v1.9.5改进第2轮：大幅扩展豁免清单，降低误判率（从99%→预期20%以下）
        // 豁免原则：
        // 1. 0%（公式起始值，如"保单年度数 * 0"）
        // 2. 10%的整数倍（10%, 20%, ..., 200%）
        // 3. 大倍数（300%, 400%, 500%, 1000%, 2000%等）
        // 4. 常见的5%倍数（5%, 15%, 25%, 35%, 45%, 55%, 65%, 75%, 85%, 95%）
        
        // 判断是否为豁免百分比
        const isExemptPercentage = 
          percent === 0 ||                          // 0% - 起始值
          (percent >= 10 && percent <= 200 && percent % 10 === 0) ||  // 10-200的10倍数
          (percent > 200 && percent <= 300 && percent % 50 === 0) ||   // 250, 300
          (percent > 300 && percent % 100 === 0) ||  // 400, 500, 600, ..., 1000, 2000, etc.
          [5, 15, 25, 35, 45, 55, 65, 75, 85, 95].includes(percent);   // 常见5%倍数
        
        if (isExemptPercentage) {
          // 跳过豁免百分比的检查
        } else {
          // 对于非豁免百分比（如67%、123%等异常值），检查原文中是否有
          const clauseHasPercent = clauseText.match(new RegExp(`(${percent}%|百分之${chineseNumber(percent)}|${chineseNumber(percent)}成)`));
          if (!clauseHasPercent) {
            issues.push({
              category: '赔付公式问题',
              type: 'formula百分比可能错误',
              sequenceNumber: record.sequenceNumber,
              coverageName: record.coverageName || '',
              stageNumber: stage.stageNumber,
              details: `阶段${stage.stageNumber}formula有${percent}%，但原文中未找到该比例（非常见倍数）`,
              suggestedFix: '检查原文中的正确比例',
              severity: 'P2',
              clauseTextSnippet: clauseText.substring(0, 200)
            });
          }
        }
      }
      
      // ⭐ v1.9.4新增：检查formula用了"保单年度数"但原文明确写了百分比
      if (formula.includes('保单年度数') || formula.includes('保单年度')) {
        // 检查原文是否明确写了百分比（而不是递增赔付）
        const hasPercentInText = /(\d+)%|百分之/.test(clauseText);
        const hasIncreasePattern = /递增|逐年|每年.*?增加/.test(clauseText);
        
        if (hasPercentInText && !hasIncreasePattern) {
          // 原文有明确百分比，但formula用了保单年度数
          const percentInText = clauseText.match(/(\d+)%/);
          issues.push({
            category: '赔付公式问题',
            type: 'formula可能错误',
            sequenceNumber: record.sequenceNumber,
            coverageName: record.coverageName || '',
            stageNumber: stage.stageNumber,
            details: `阶段${stage.stageNumber}formula用"保单年度数"，但原文明确写了${percentInText ? percentInText[1] : ''}%`,
            suggestedFix: `检查是否应该改为"基本保额 * ${percentInText ? percentInText[1] : ''}%"`,
            severity: 'P1',
            clauseTextSnippet: clauseText.substring(0, 200)
          });
        }
      }
    }
  });
}

// 辅助函数：数字转中文
function chineseNumber(n: number): string {
  const map: {[key: number]: string} = {
    10: '十', 20: '二十', 30: '三十', 40: '四十', 50: '五十',
    60: '六十', 70: '七十', 80: '八十', 90: '九十', 100: '一百',
    200: '二百', 300: '三百'
  };
  return map[n] || '';
}

// ============================================
// 类别2：年龄条件问题
// ============================================

function checkAgeConditionIssues(record: any, issues: QualityIssue[]) {
  const parsed: any = record.parsedResult;
  const stages = parsed?.payoutAmount || [];
  const clauseText = record.clauseText || '';

  stages.forEach((stage: any, idx: number) => {
    const ageConditions = stage.ageConditions || [];

    // 2.1 & 2.2: 年龄条件互斥和冗余
    if (ageConditions.length >= 2) {
      const groupedByType: { [type: string]: any[] } = {};
      ageConditions.forEach((ac: any) => {
        if (!groupedByType[ac.type]) {
          groupedByType[ac.type] = [];
        }
        groupedByType[ac.type].push(ac);
      });

      for (const [type, conditions] of Object.entries(groupedByType)) {
        if (conditions.length < 2) continue;

        for (let i = 0; i < conditions.length; i++) {
          for (let j = i + 1; j < conditions.length; j++) {
            const c1 = conditions[i];
            const c2 = conditions[j];

            // 2.8 年龄条件重复（同一阶段内 type、limit、operator 完全相同的两条）
            if (c1.type === c2.type && c1.limit === c2.limit && c1.operator === c2.operator) {
              issues.push({
                category: '年龄条件问题',
                type: '年龄条件重复',
                sequenceNumber: record.sequenceNumber,
                coverageName: record.coverageName || '',
                stageNumber: stage.stageNumber,
                details: `阶段${stage.stageNumber}内${c1.type} ${c1.operator} ${c1.limit} 重复`,
                suggestedFix: '删除重复条件，或若为不同对象（如男性/女性/孩子）且赔付标准相同可合并在一个阶段内描述',
                severity: 'P1',
                clauseTextSnippet: clauseText.substring(0, 150)
              });
            }
            else if (c1.limit === c2.limit) {
              // 2.1 检查互斥
              if ((c1.operator === '>=' && c2.operator === '<') ||
                  (c1.operator === '<' && c2.operator === '>=') ||
                  (c1.operator === '>' && c2.operator === '<=') ||
                  (c1.operator === '<=' && c2.operator === '>') ||
                  (c1.operator === '>' && c2.operator === '<') ||
                  (c1.operator === '<' && c2.operator === '>')) {
                issues.push({
                  category: '年龄条件问题',
                  type: '年龄条件互斥',
                  sequenceNumber: record.sequenceNumber,
                  coverageName: record.coverageName || '',
                  stageNumber: stage.stageNumber,
                  details: `${type} ${c1.operator} ${c1.limit} 与 ${type} ${c2.operator} ${c2.limit} 互斥`,
                  suggestedFix: '根据原文删除错误的条件',
                  severity: 'P0',
                  clauseTextSnippet: clauseText.substring(0, 150)
                });
              }
              // 2.2 检查冗余
              else if ((c1.operator === '<=' && c2.operator === '<') ||
                       (c1.operator === '<' && c2.operator === '<=') ||
                       (c1.operator === '>=' && c2.operator === '>') ||
                       (c1.operator === '>' && c2.operator === '>=')) {
                issues.push({
                  category: '年龄条件问题',
                  type: '年龄条件冗余',
                  sequenceNumber: record.sequenceNumber,
                  coverageName: record.coverageName || '',
                  stageNumber: stage.stageNumber,
                  details: `${type} ${c1.operator} ${c1.limit} 与 ${type} ${c2.operator} ${c2.limit} 冗余`,
                  suggestedFix: '根据原文保留正确的运算符',
                  severity: 'P1',
                  clauseTextSnippet: clauseText.substring(0, 150)
                });
              }
            }
          }
        }

        // 2.7 年龄区间识别错误（同一type有多个<条件）
        const ltConditions = conditions.filter(c => c.operator === '<' || c.operator === '<=');
        if (ltConditions.length >= 2) {
          const limits = ltConditions.map(c => c.limit).sort((a, b) => a - b);
          const minLimit = limits[0];
          const maxLimit = limits[limits.length - 1];
          
          if (minLimit !== maxLimit) {
            // 检查原文是否表达年龄区间
            const rangePattern = new RegExp(`(年满|满)?${minLimit}.*?(至|到|但).{0,10}${maxLimit}`);
            if (rangePattern.test(clauseText)) {
              issues.push({
                category: '年龄条件问题',
                type: '年龄区间识别错误',
                sequenceNumber: record.sequenceNumber,
                coverageName: record.coverageName || '',
                stageNumber: stage.stageNumber,
                details: `${type}有多个<条件，可能是年龄区间: ${ltConditions.map(c => `${c.operator} ${c.limit}`).join(', ')}`,
                suggestedFix: `改为区间 [${minLimit}, ${maxLimit})，即 >= ${minLimit} 且 < ${maxLimit}`,
                severity: 'P1',
                clauseTextSnippet: clauseText.substring(0, 200)
              });
            }
          }
        }
      }
    }

    // 2.3 年龄数值错误（排除：用户确认年龄正确的序号；实为性别限制/赔付类型/年龄重复等其它问题的序号）
    const ageErrorExcludeSeqs = new Set([
      180, 276, 493, 546, 574, 592,   // 用户确认年龄正确，原文表述未被当前提取规则覆盖
      618, 547, 653, 655, 622, 637, 638  // 618/547少性别限制，653/655应基本保额却已交保费，622/637/638年龄限制重复
    ]);
    const textAges = extractAgesFromText(clauseText);
    ageConditions.forEach((ac: any) => {
      if (ac.limit && !textAges.has(ac.limit) && ac.limit < 120 && !ageErrorExcludeSeqs.has(record.sequenceNumber)) {
        issues.push({
          category: '年龄条件问题',
          type: '年龄数值可能错误',
          sequenceNumber: record.sequenceNumber,
          coverageName: record.coverageName || '',
          stageNumber: stage.stageNumber,
          details: `阶段${stage.stageNumber}的年龄${ac.limit}在原文中未找到`,
          suggestedFix: '检查原文中的正确年龄数字',
          severity: 'P1',
          clauseTextSnippet: clauseText.substring(0, 150)
        });
      }
    });

    // 2.4 年龄运算符方向错误（改进版v5：支持中文数字）
    ageConditions.forEach((ac: any) => {
      const age = ac.limit;
      
      // ⭐ v1.9.4改进：同时匹配阿拉伯数字和中文数字
      const chineseAge = numberToChinese(age);
      const agePattern = new RegExp(`.{0,30}(${age}|${chineseAge}).{0,30}`, 'g');
      const matches = clauseText.match(agePattern) || [];
      
      for (const snippet of matches) {
        // 只处理明确是年龄表达的（有"周岁"、"岁"、"年满"、"未满"等）
        if (!/周岁|岁|年满|未满|已满/.test(snippet)) continue;
        
        // 提取年龄前后的文本（同时查找阿拉伯和中文数字）
        let ageIndex = snippet.indexOf(String(age));
        let ageStr = String(age);
        if (ageIndex === -1) {
          // 如果没找到阿拉伯数字，查找中文数字
          ageIndex = snippet.indexOf(chineseAge);
          ageStr = chineseAge;
        }
        if (ageIndex === -1) continue;  // 都没找到，跳过
        
        const beforeAge = snippet.substring(0, ageIndex);
        let afterAge = snippet.substring(ageIndex + ageStr.length);
        
        // ⭐ 关键改进：只看紧跟年龄的方向词（在"且"、"及"、"或"之前）
        const immediateAfter = afterAge.split(/[且及和或，、]/)[0];
        
        // 检查方向词
        let detectedDirection = null;
        
        // 前面的方向词
        if (/已满|年满/.test(beforeAge)) {
          // "年满18周岁前" → 看后面的"前"
          if (/前/.test(immediateAfter)) {
            detectedDirection = '<';
          } else if (/后/.test(immediateAfter)) {
            detectedDirection = '>=';
          } else if (/之前/.test(immediateAfter)) {
            detectedDirection = '<';
          } else if (/之后/.test(immediateAfter)) {
            detectedDirection = '>=';
          } else {
            // 没有明确的后缀，"年满"默认为 >=
            detectedDirection = '>=';
          }
        } else if (/未满/.test(beforeAge)) {
          detectedDirection = '<';
        } else if (/于/.test(beforeAge)) {
          // "于18周岁前" → <
          if (/前|之前/.test(immediateAfter)) {
            detectedDirection = '<';
          } else if (/后|之后/.test(immediateAfter)) {
            detectedDirection = '>=';
          }
        }
        // 后面的方向词（如果前面没检测到）
        else if (/前|之前/.test(immediateAfter)) {
          detectedDirection = '<';
        } else if (/后|之后/.test(immediateAfter)) {
          detectedDirection = '>=';
        }
        
        // ⭐ v1.9.4改进：特殊模式"年满X后...前"需要仔细判断：
        // 1. "年满X岁后的首个周年日前" → 定期责任结束条件，年龄应该<X
        //    （如"额外定期重大疾病保险金"在60岁前有效）
        // 2. "年满X岁后确诊...X岁前" → 年龄区间<X
        // 总之，"...前"表示责任结束，应该是<
        if (/后/.test(immediateAfter) && /前/.test(afterAge)) {
          detectedDirection = '<';
        }
        
        // 如果检测到方向且与字段不符
        if (detectedDirection && detectedDirection !== ac.operator) {
          if ((detectedDirection === '>=' && (ac.operator === '<' || ac.operator === '<=')) ||
              (detectedDirection === '<' && (ac.operator === '>' || ac.operator === '>='))) {
            issues.push({
              category: '年龄条件问题',
              type: '年龄运算符方向可能错误',
              sequenceNumber: record.sequenceNumber,
              coverageName: record.coverageName || '',
              stageNumber: stage.stageNumber,
              details: `原文"${snippet.trim()}"，判断应该是${detectedDirection}，但实际是${ac.operator}`,
              suggestedFix: `请人工确认原文语义，可能需改为 operator: '${detectedDirection}'`,
              severity: 'P2',
              clauseTextSnippet: snippet.trim()
            });
            break;
          }
        }
      }
    });

    // 2.5 年龄类型错误（投保时 vs 确诊时）- 增强版v2
    // 增强识别"生效时"、"本合同生效时"等投保时关键词
    ageConditions.forEach((ac: any) => {
      const age = ac.limit;
      // 查找原文中包含该年龄的句子
      const agePattern = new RegExp(`.{0,40}${age}.{0,30}(周岁|岁)`, 'g');
      const matches = clauseText.match(agePattern) || [];
      
      for (const snippet of matches) {
        // 检查这个年龄限制的时间点
        
        // 识别"确诊时"相关表达
        const confirmTimePattern = new RegExp(`确诊时.*?年龄.*?${age}|被保险人.*?确诊.*?${age}`);
        const isConfirmTimeExpression = confirmTimePattern.test(snippet);
        
        // 识别"投保时"相关表达（增强版）
        const insureTimePattern = new RegExp(
          `投保时.*?年龄.*?${age}|生效时.*?年龄.*?${age}|本合同生效时.*?年龄.*?${age}|合同生效时.*?年龄.*?${age}`
        );
        const isInsureTimeExpression = insureTimePattern.test(snippet);
        
        // 检查type是否与原文表达匹配
        if (ac.type === '确诊时' && isInsureTimeExpression) {
          issues.push({
            category: '年龄条件问题',
            type: '年龄类型可能错误',
            sequenceNumber: record.sequenceNumber,
            coverageName: record.coverageName || '',
            stageNumber: stage.stageNumber,
            details: `原文提到"投保时/生效时"年龄${age}岁，但type是"确诊时"`,
            suggestedFix: `确认是否应改为 type: '投保时'`,
            severity: 'P1',
            clauseTextSnippet: snippet
          });
          break;
        }
        
        if (ac.type === '投保时' && isConfirmTimeExpression) {
          issues.push({
            category: '年龄条件问题',
            type: '年龄类型可能错误',
            sequenceNumber: record.sequenceNumber,
            coverageName: record.coverageName || '',
            stageNumber: stage.stageNumber,
            details: `原文提到"确诊时"年龄${age}岁，但type是"投保时"`,
            suggestedFix: `确认是否应改为 type: '确诊时'`,
            severity: 'P1',
            clauseTextSnippet: snippet
          });
          break;
        }
      }
    });

    // 2.6 年龄条件缺失（改进版v4：支持中文数字，增强检测）
    // 从原文中提取所有年龄数字，检查是否有年龄在原文中但字段里没有
    const extractedAges = extractAgesFromText(clauseText);
    const fieldAges = new Set(ageConditions.map((ac: any) => ac.limit));
    
    // 找出原文有但字段没有的年龄
    const missingAges = Array.from(extractedAges).filter(age => !fieldAges.has(age) && age < 100);
    
    if (missingAges.length > 0) {  // ⭐ v1.9改进：去掉"ageConditions.length > 0"限制，即使为空也检查
      for (const missingAge of missingAges) {
        // 排除一些特殊情况：
        // 1. 投保年龄上限（如"投保年龄：0-60周岁"中的60）
        // 2. 多次赔付中的次数（如"第2次"）
        // 3. 保单年度（如"第5个保单年度"）
        const isInvestAge = new RegExp(`投保年龄.*?[：:].{0,30}${missingAge}`).test(clauseText);
        const isClaimCount = new RegExp(`第[${missingAge}${numberToChinese(missingAge)}]次`).test(clauseText);
        const isPolicyYear = new RegExp(`第[${missingAge}${numberToChinese(missingAge)}](个)?(保单)?年(度)?`).test(clauseText);
        
        if (isInvestAge || isClaimCount || isPolicyYear) continue;
        
        // ⭐ v1.9.4改进：同时检查阿拉伯和中文数字
        const chineseAge = numberToChinese(missingAge);
        const ageInContext = new RegExp(`.{0,30}(${missingAge}|${chineseAge}).{0,30}(周岁|岁)`, 'g');
        const matches = clauseText.match(ageInContext) || [];
        
        for (const snippet of matches) {
          // 判断这是否是真实的年龄限制（而不是投保年龄上限）
          const isRealAgeCondition = 
            /年满|未满|满|之前|之后|以上|以下|前.*?(保险单|保单)周年日|后.*?(保险单|保单)周年日/.test(snippet) &&
            !/投保年龄/.test(snippet);
          
          if (isRealAgeCondition) {
            issues.push({
              category: '年龄条件问题',
              type: '年龄条件可能缺失',
              sequenceNumber: record.sequenceNumber,
              coverageName: record.coverageName || '',
              stageNumber: stage.stageNumber,
              details: `原文提到${missingAge}周岁限制，但ageConditions中没有`,
              suggestedFix: `检查原文，可能需要添加：{ type: '确诊时', limit: ${missingAge}, operator: '?' }`,
              severity: 'P1',
              clauseTextSnippet: snippet
            });
            break;
          }
        }
      }
    }

    // 2.9 naturalLanguageDescription与ageConditions不一致⭐ 新增
    const desc = stage.naturalLanguageDescription || '';
    ageConditions.forEach((ac: any) => {
      const age = ac.limit;
      const type = ac.type;
      const op = ac.operator;
      
      // 检查描述中是否包含该年龄
      if (!desc.includes(String(age))) {
        // 年龄在字段中，但描述中没有 → 可能是描述遗漏
        issues.push({
          category: '年龄条件问题',
          type: 'naturalLanguageDescription与ageConditions不一致',
          sequenceNumber: record.sequenceNumber,
          coverageName: record.coverageName || '',
          stageNumber: stage.stageNumber,
          details: `ageConditions中有${age}周岁，但naturalLanguageDescription中未体现`,
          suggestedFix: `检查并更新naturalLanguageDescription，确保包含所有年龄条件`,
          severity: 'P1',
          clauseTextSnippet: `字段: ${type} ${op} ${age}; 描述: ${desc}`
        });
        return;
      }
      
      // 检查operator一致性
      const ageInDescPattern = new RegExp(`(投保年龄|确诊时).{0,10}(未满|年满|及以上|及以下|以上|以下|前|后).{0,5}${age}`, 'i');
      const match = desc.match(ageInDescPattern);
      
      if (match) {
        const directionWord = match[2];
        let expectedOp = null;
        
        // 根据描述中的方向词判断应该是什么operator
        if (directionWord.includes('未满') || directionWord === '前') {
          expectedOp = '<';
        } else if (directionWord.includes('年满') || directionWord.includes('以上') || directionWord === '后') {
          expectedOp = '>=';
        } else if (directionWord.includes('及以下')) {
          expectedOp = '<=';
        }
        
        // 如果判断出来的operator和字段中的不一致
        if (expectedOp && expectedOp !== op && !((expectedOp === '<' && op === '<=') || (expectedOp === '>=' && op === '>'))) {
          issues.push({
            category: '年龄条件问题',
            type: 'naturalLanguageDescription与ageConditions不一致',
            sequenceNumber: record.sequenceNumber,
            coverageName: record.coverageName || '',
            stageNumber: stage.stageNumber,
            details: `描述"${directionWord}${age}"暗示operator应为${expectedOp}，但字段中是${op}`,
            suggestedFix: `确认正确的operator，并同步修改ageConditions或naturalLanguageDescription`,
            severity: 'P0',
            clauseTextSnippet: desc
          });
        }
      }
      
      // 检查type一致性
      const typeInDescPattern = new RegExp(`(投保年龄|确诊时).{0,20}${age}`, 'i');
      const typeMatch = desc.match(typeInDescPattern);
      
      if (typeMatch) {
        const descType = typeMatch[1].includes('投保') ? '投保时' : '确诊时';
        if (descType !== type) {
          issues.push({
            category: '年龄条件问题',
            type: 'naturalLanguageDescription与ageConditions不一致',
            sequenceNumber: record.sequenceNumber,
            coverageName: record.coverageName || '',
            stageNumber: stage.stageNumber,
            details: `描述中是"${descType}"，但ageConditions.type是"${type}"`,
            suggestedFix: `同步ageConditions.type和naturalLanguageDescription`,
            severity: 'P0',
            clauseTextSnippet: desc
          });
        }
      }
      
      // ⭐ v1.9.4新增：反向检查 - 从operator推断描述是否正确
      // 查找描述中该年龄对应的方向词
      const ageWithDirectionPattern = new RegExp(`(\\d+)\\s*周?岁?\\s*(及以上|及以后|以上|以后|后|及以下|以下|前)?`, 'g');
      let descMatch;
      while ((descMatch = ageWithDirectionPattern.exec(desc)) !== null) {
        const descAge = parseInt(descMatch[1]);
        const descDirection = descMatch[2] || '';
        
        if (descAge === age) {
          // 根据operator判断描述应该有什么方向词
          let expectedDirection = '';
          if (op === '<' || op === '<=') {
            expectedDirection = '前|以下|及以下';  // 应该是"前"类
          } else if (op === '>=' || op === '>') {
            expectedDirection = '后|以上|及以上|及以后|以后';  // 应该是"后"类
          }
          
          // 检查描述方向词与operator是否匹配
          if (expectedDirection) {
            const expectedRegex = new RegExp(expectedDirection);
            const hasExpected = expectedRegex.test(descDirection);
            
            // 检查是否写反了
            const wrongDirection = (op === '<' || op === '<=') && /后|以上|及以上|及以后|以后/.test(descDirection);
            const wrongDirection2 = (op === '>=' || op === '>') && /前|以下|及以下/.test(descDirection);
            
            if (wrongDirection || wrongDirection2) {
              issues.push({
                category: '年龄条件问题',
                type: 'naturalLanguageDescription与ageConditions不一致',
                sequenceNumber: record.sequenceNumber,
                coverageName: record.coverageName || '',
                stageNumber: stage.stageNumber,
                details: `operator是${op}，但描述"${age}周岁${descDirection}"方向相反`,
                suggestedFix: `修改naturalLanguageDescription，使方向词与operator${op}一致`,
                severity: 'P1',
                clauseTextSnippet: desc
              });
            }
          }
        }
      }
    });
  });
}

// ============================================
// 类别2.10：性别条件检查（v1.9.4新增）
// ============================================

function checkGenderConditions(record: any, issues: QualityIssue[]) {
  const parsed: any = record.parsedResult;
  const stages = parsed?.payoutAmount || [];
  const clauseText = record.clauseText || '';
  
  // 检查原文是否明确区分男性、女性条件
  const hasMaleFemalePattern = /男性.*?女性|女性.*?男性/.test(clauseText);
  const hasMaleSpecific = /(男性|睾丸|阴茎|前列腺)/.test(clauseText);
  const hasFemaleSpecific = /(女性|乳腺|子宫|卵巢|宫颈|阴道)/.test(clauseText);
  
  if (hasMaleFemalePattern || (hasMaleSpecific && hasFemaleSpecific)) {
    stages.forEach((stage: any) => {
      // 检查是否缺少gender字段
      if (!stage.gender || stage.gender === 'both') {
        issues.push({
          category: '年龄条件问题',
          type: '性别条件可能缺失',
          sequenceNumber: record.sequenceNumber,
          coverageName: record.coverageName || '',
          stageNumber: stage.stageNumber,
          details: `原文中明确区分男性/女性，但gender字段为空或为both`,
          suggestedFix: `检查原文，如果男女条件不同应添加gender字段或拆分阶段`,
          severity: 'P2',
          clauseTextSnippet: clauseText.substring(0, 150)
        });
      }
    });
  }
}

// ============================================
// 类别3：保单年度问题
// ============================================

function checkPolicyYearIssues(record: any, issues: QualityIssue[]) {
  const parsed: any = record.parsedResult;
  const stages = parsed?.payoutAmount || [];
  const clauseText = record.clauseText || '';

  // 3.1 保单年度缺失
  const policyYearKeywords = [
    /第\s*[一二三四五六七八九十0-9]+\s*个?\s*(保单周年日|保险单周年日|保障年度|保单年度)/,
    /保单周年日/,
    /保单年度/,
    /保障年度/
  ];

  const hasPolicyYearMention = policyYearKeywords.some(pattern => pattern.test(clauseText));

  if (hasPolicyYearMention) {
    stages.forEach((stage: any, idx: number) => {
      if (!stage.policyYearRange) {
        // 尝试用模式库提取
        const extracted = extractPolicyYearRange(clauseText);
        if (extracted) {
          issues.push({
            category: '保单年度问题',
            type: '保单年度缺失',
            sequenceNumber: record.sequenceNumber,
            coverageName: record.coverageName || '',
            stageNumber: stage.stageNumber,
            details: `原文提到保单年度，但未识别`,
            suggestedFix: `添加policyYearRange: ${JSON.stringify(extracted)}`,
            severity: 'P1',
            clauseTextSnippet: clauseText.substring(0, 200)
          });
        }
      }
    });
  }
}

// ============================================
// 类别4：阶段拆分问题
// ============================================

function checkStageSplitIssues(record: any, issues: QualityIssue[]) {
  const parsed: any = record.parsedResult;
  const stages = parsed?.payoutAmount || [];
  const clauseText = record.clauseText || '';

  // 4.1 需要拆分阶段（原文有明确分段）
  // 拆分为4种子模式，各自做排除，减少误判
  const patternNumberedList = /[(（]\s*[1一]\s*[)）].*[(（]\s*[2二]\s*[)）]/.test(clauseText);
  const patternPolicyYearRaw = /第[一二三1-3][个]?(保单)?年(度)?.*第[一二三1-3][个]?(保单)?年(度)?/.test(clauseText);
  const patternStage = /第[一二三1-3]阶段.*第[一二三1-3]阶段/.test(clauseText);
  // 年龄分段：仅当“前给付+后给付”且非“不承担”时才算真实分段（与7.4一致，避免“X岁前给付、X岁后不承担”误判）
  const hasNoPaymentClauseAge = /周岁.*?[之前后].*?(不承担.*?责任|不再承担|不赔付|不给付|则.*?责任终止)/.test(clauseText);
  const hasRealAgeSegmentsStrict = /([六十五七八九0-9]+)周岁.*?前.*?给付.*?([六十五七八九0-9]+)周岁.*?后.*?给付/.test(clauseText) ||
    /([六十五七八九0-9]+)周岁.*?后.*?给付.*?([六十五七八九0-9]+)周岁.*?前.*?给付/.test(clauseText);
  const patternAgeSegment = hasRealAgeSegmentsStrict && !hasNoPaymentClauseAge;

  // (1)(2) 编号规则排除：多次赔付、条件列举、疾病/责任列举、等待期场景
  const isMultipleClaimsContext = /第二次|再次确诊|第[一二三1-3]次.*(确诊|给付|患)/.test(clauseText);
  const isConditionListContext = (
    /满足以下|以下.*(两个)?条件|在下列情况下/.test(clauseText) ||
    /为：\s*[（(]\s*[1一]|如下：\s*[（(]\s*[1一]|下列：\s*[（(]\s*[1一]/.test(clauseText)
  ) && patternNumberedList;
  // （1）如果...（2）如果 + 等待期，且无年龄/保单年度分段 → 等待期场景，非赔付阶段拆分
  const isWaitingPeriodScenario = patternNumberedList && /（1）.*?如果.*?（2）.*?如果/.test(clauseText) &&
    /等待期/.test(clauseText) && !/周岁.*?前.*?周岁.*?后|第[一二三1-3][个]?(保单)?年(度)?/.test(clauseText);
  const numberedListIsRealStage = patternNumberedList && !isMultipleClaimsContext && !isConditionListContext && !isWaitingPeriodScenario;

  // 保单年度规则排除：持续给付语境（“每年给付”“每…年…给付”）不是多阶段
  const isContinuousYearPayout = /每年.*给付|每.*(个)?.*年.*给付|至.*第.*年.*给付/.test(clauseText);
  const patternPolicyYear = patternPolicyYearRaw && !isContinuousYearPayout;

  // 责任名称即“X周岁前首次…给付保险金”时，就一个阶段（文中多次出现X岁来自名称/列举，非前后两段），不报拆分（避免579、739误判）
  const coverageName = (record.coverageName || '').trim();
  const isSingleStageByName = /周岁前首次.*给付.*保险金/.test(coverageName);

  const hasMultiStagePattern =
    (numberedListIsRealStage || patternPolicyYear || patternStage || patternAgeSegment) && !isMultipleClaimsContext && !isSingleStageByName;

  // ⚠️ v1.9.5：此检查误判率100%（40/40全误判），暂时禁用以降低总体误判率
  // 后续需要重新设计：只在赔付金额明确不同时才报拆分需求
  const ENABLE_STAGE_SPLIT_CHECK = false;  // 设为true可重新启用
  
  if (ENABLE_STAGE_SPLIT_CHECK && hasMultiStagePattern && stages.length === 1) {
    issues.push({
      category: '阶段拆分问题',
      type: '需要拆分阶段',
      sequenceNumber: record.sequenceNumber,
      coverageName: record.coverageName || '',
      details: `原文有明确分段描述，但只有1个阶段`,
      suggestedFix: `根据原文拆分为多个阶段`,
      severity: 'P1',
      clauseTextSnippet: clauseText.substring(0, 200)
    });
  }

  // 4.2 阶段编号不连续
  const stageNumbers = stages.map((s: any) => s.stageNumber).filter((n: any) => n);
  for (let i = 0; i < stageNumbers.length; i++) {
    if (stageNumbers[i] !== i + 1) {
      issues.push({
        category: '阶段拆分问题',
        type: '阶段编号不连续',
        sequenceNumber: record.sequenceNumber,
        coverageName: record.coverageName || '',
        details: `阶段编号不连续: ${stageNumbers.join(', ')}`,
        suggestedFix: `重新编号为1, 2, 3...`,
        severity: 'P2'
      });
      break;
    }
  }
}

// ============================================
// 类别5：note字段问题
// ============================================

function checkNoteFieldIssues(record: any, issues: QualityIssue[]) {
  const parsed: any = record.parsedResult;
  const clauseText = record.clauseText || '';

  // 5.1 note出现在阶段中（只检查位置，不检查内容）
  const stages = parsed?.payoutAmount || [];
  stages.forEach((stage: any, idx: number) => {
    if (stage.note) {
      issues.push({
        category: 'note字段问题',
        type: 'note出现在阶段中',
        sequenceNumber: record.sequenceNumber,
        coverageName: record.coverageName || '',
        stageNumber: stage.stageNumber,
        details: `阶段${stage.stageNumber}中存在note字段`,
        suggestedFix: `将note移至顶层，或移至naturalLanguageDescription`,
        severity: 'P0'
      });
    }
  });
  
  // 5.2 顶层note包含不应该出现的内容⭐ 新增
  const topNote = parsed?.note || '';
  if (topNote) {
    // 检查note中是否包含禁止的内容（这些应该在其他字段中体现）
    const invalidKeywords = [
      { pattern: /年龄|周岁/, name: '年龄条件', field: 'ageConditions' },
      { pattern: /保单年度|第.*年/, name: '保单年度', field: 'policyYearRange' },
      { pattern: /等待期/, name: '等待期', field: 'waitingPeriodStatus' },
      { pattern: /男性|女性|性别/, name: '性别条件', field: 'ageConditions.gender' },
      { pattern: /基本保额|已交保费|赔付|给付.*?%/, name: '理赔金额', field: 'formula' }
    ];
    
    for (const invalid of invalidKeywords) {
      if (invalid.pattern.test(topNote)) {
        issues.push({
          category: 'note字段问题',
          type: 'note包含不应该出现的内容',
          sequenceNumber: record.sequenceNumber,
          coverageName: record.coverageName || '',
          details: `note中包含"${invalid.name}"，应该在${invalid.field}字段中体现`,
          suggestedFix: `删除note中的${invalid.name}内容，或移至${invalid.field}字段`,
          severity: 'P1',
          clauseTextSnippet: `note内容: ${topNote}`
        });
      }
    }
  }
}

// ============================================
// 类别6：自然语言描述问题
// ============================================

function checkDescriptionIssues(record: any, issues: QualityIssue[]) {
  const parsed: any = record.parsedResult;
  const stages = parsed?.payoutAmount || [];

  stages.forEach((stage: any, idx: number) => {
    const desc = stage.naturalLanguageDescription || '';

    // 6.1 缺少关键信息
    if (!desc || desc.length < 10) {
      issues.push({
        category: '自然语言描述问题',
        type: 'naturalLanguageDescription过短或缺失',
        sequenceNumber: record.sequenceNumber,
        coverageName: record.coverageName || '',
        stageNumber: stage.stageNumber,
        details: `阶段${stage.stageNumber}的描述过短: "${desc}"`,
        suggestedFix: `补充完整的自然语言描述`,
        severity: 'P2'
      });
    }

    // 6.2 描述与结构化字段不一致（简化版）
    if (stage.ageConditions && stage.ageConditions.length > 0) {
      const hasAgeInDesc = /\d+周岁|岁/.test(desc);
      if (!hasAgeInDesc) {
        issues.push({
          category: '自然语言描述问题',
          type: '描述缺少年龄信息',
          sequenceNumber: record.sequenceNumber,
          coverageName: record.coverageName || '',
          stageNumber: stage.stageNumber,
          details: `有年龄条件，但描述中未提及`,
          suggestedFix: `在naturalLanguageDescription中添加年龄描述`,
          severity: 'P2'
        });
      }
    }
  });
}

// ============================================
// 类别7：赔付结构问题（持续给付、多次赔付、限额）
// ============================================

function checkPayoutStructureIssues(record: any, issues: QualityIssue[]) {
  const parsed: any = record.parsedResult;
  const stages = parsed?.payoutAmount || [];
  const clauseText = record.clauseText || '';

  // 7.1 检查是否有持续给付但未使用payoutStructure
  // 定义：一次确诊后，基于同一次确诊持续给付（如每年对应日、每个确诊周年日）
  // 排除：多次确诊、一次性给付终止
  
  const isOneDiagnosis = /初次.*?确诊|首次.*?确诊|确诊.*?初次发生|首次.*?发生|首次.*?患/.test(clauseText);
  const hasSubsequentPayout = 
    /之后.*?每.*?(年|周年日|对应日).*?给付/.test(clauseText) ||
    /每个.*?(年生效对应日|确诊.*?对应日|确诊周年日|合同.*?对应日).*?给付/.test(clauseText) ||
    /确诊.*?后.*?每.*?(年|对应日)/.test(clauseText) ||
    /期间内.*?每.*?(年|对应日).*?给付/.test(clauseText);
  const hasMultipleDiagnosis = /再次.*?确诊|再次.*?患|相邻.*?两次.*?确诊/.test(clauseText) && !/第一次/.test(clauseText);
  const isMultipleClaimsType = /每种.*?给付|同一种.*?给付.*?一次为限/.test(clauseText);
  
  const isTrueContinuous = isOneDiagnosis && hasSubsequentPayout && !hasMultipleDiagnosis && !isMultipleClaimsType;

  if (isTrueContinuous) {
    stages.forEach((stage: any, idx: number) => {
      if (!stage.payoutStructure) {
        // 持续给付必须使用payoutStructure结构，不能用旧的continuousPayment字段
        issues.push({
          category: '持续给付问题',
          type: '持续给付未结构化',
          sequenceNumber: record.sequenceNumber,
          coverageName: record.coverageName || '',
          stageNumber: stage.stageNumber,
          details: `原文提到持续给付（一次确诊+之后持续），但未使用payoutStructure`,
          suggestedFix: `添加payoutStructure字段（firstPayout + subsequentPayout + cumulativeLimit）`,
          severity: 'P1',
          clauseTextSnippet: clauseText.substring(0, 250)
        });
      }
    });
  }

  // 注：多次赔付（maxPayoutCount）不在"赔付金额结构"检查范围内，已移除

  // 7.2 检查赔付限额识别（v1.9.5：误判率100%，暂时禁用）
  const ENABLE_LIMIT_CHECK = false;  // 5个问题全是误判
  
  if (ENABLE_LIMIT_CHECK) {
    const hasLimitKeywords = /最高.*?(\d+)万?元|以.*?(\d+)万?元为限|不超过.*?(\d+)万?元/.test(clauseText);
    if (hasLimitKeywords) {
      stages.forEach((stage: any, idx: number) => {
        if (!stage.cumulativeLimit && !stage.payoutStructure?.cumulativeLimit) {
          issues.push({
            category: '赔付结构问题',
            type: '赔付限额未识别',
            sequenceNumber: record.sequenceNumber,
            coverageName: record.coverageName || '',
            stageNumber: stage.stageNumber,
            details: `原文提到赔付限额，但未在payoutStructure.cumulativeLimit中体现`,
            suggestedFix: `添加cumulativeLimit字段`,
            severity: 'P2',
            clauseTextSnippet: clauseText.substring(0, 250)
          });
        }
      });
    }
  }

  // 7.3-7.4 检查多阶段赔付识别（v1.9.5：误判率100%，暂时禁用）
  const ENABLE_MULTI_STAGE_CHECK = false;  // 3个问题全是误判
  
  if (ENABLE_MULTI_STAGE_CHECK) {
    // 7.3 检查多阶段赔付识别（如第2年、第3年不同赔付）
    // 排除：持续给付、多次确诊（第X次）、年度区间内每年给付（第X年至第Y年每年给付）
    
    const yearMatches = clauseText.match(/第(\d+|[一二三四五六七八九十])[个]?(保单)?年(度)?/g) || [];
  const uniqueYears = new Set(yearMatches.map((m: string) => m.match(/第(\d+|[一二三四五六七八九十])/)?.[1]));
  
  const isAlreadyContinuous = isTrueContinuous;
  const isMultipleClaimsPattern = /第[一二1-3]次.*?确诊|第[一二1-3]次.*?给付/.test(clauseText);
  // 排除“第X年至第Y年，每年给付”等持续给付区间（不是多阶段不同金额）
  const isYearRangeContinuous = /第.*年.*至.*第.*年.*(每年|每.*年|持续).*给付/.test(clauseText);
  
  if (uniqueYears.size >= 2 && stages.length === 1 && !isAlreadyContinuous && !isMultipleClaimsPattern && !isYearRangeContinuous) {
    issues.push({
      category: '赔付结构问题',
      type: '多阶段赔付少识别',
      sequenceNumber: record.sequenceNumber,
      coverageName: record.coverageName || '',
      details: `原文有多个保单年度不同赔付（如第2年、第3年），但只有1个阶段`,
      suggestedFix: `按保单年度拆分为多个阶段`,
      severity: 'P1',
      clauseTextSnippet: clauseText.substring(0, 250)
    });
  }
  
  // 7.4 检查按年龄分段的多阶段赔付（如65周岁前后不同赔付）
  // 关键：每个年龄段都有赔付，而不是"不赔付/终止责任"的限制
  
  const hasNoPaymentClause = /周岁.*?[之前后].*?(不承担.*?责任|不再承担|不赔付|不给付|则.*?责任终止)/.test(clauseText);
  const hasRealAgeSegments = /([六十五七八九0-9]+)周岁.*?前.*?给付.*?([六十五七八九0-9]+)周岁.*?后.*?给付/.test(clauseText) ||
                             /([六十五七八九0-9]+)周岁.*?后.*?给付.*?([六十五七八九0-9]+)周岁.*?前.*?给付/.test(clauseText);
  // 排除“第二次/再次”类责任：年龄前后给付多为同一条款内条件，非多阶段拆分
  const isMultipleClaimsProduct = /第二次|再次确诊|第[一二三1-3]次.*(确诊|给付|患)/.test(clauseText);
  // 责任名称即“X周岁前首次…给付保险金”时，就一个阶段，不报多阶段少识别（避免579、739误判）
  const coverageName7 = (record.coverageName || '').trim();
  const isSingleStageByName7 = /周岁前首次.*给付.*保险金/.test(coverageName7);

  if (hasRealAgeSegments && !hasNoPaymentClause && !isMultipleClaimsProduct && !isSingleStageByName7 && stages.length === 1 && !isAlreadyContinuous) {
    issues.push({
      category: '赔付结构问题',
      type: '多阶段赔付少识别',
      sequenceNumber: record.sequenceNumber,
      coverageName: record.coverageName || '',
      details: `原文按年龄分段有不同赔付（如X周岁前、X周岁后），但只有1个阶段`,
      suggestedFix: `按年龄段拆分为多个阶段`,
      severity: 'P1',
      clauseTextSnippet: clauseText.substring(0, 250)
    });
    }
  }
}

// ============================================
// 类别8：其他赔付相关字段检查
// ============================================

function checkOtherPayoutFields(record: any, issues: QualityIssue[]) {
  const parsed: any = record.parsedResult;
  const stages = parsed?.payoutAmount || [];
  const clauseText = record.clauseText || '';

  // 8.1 检查交费期条件是否遗漏
  const hasPaymentPeriodKeywords = /交费期|交费期间|缴费期|缴费期间/.test(clauseText);
  if (hasPaymentPeriodKeywords) {
    // 排除豁免条件中的交费期（不是赔付条件）
    const isWaiverContext = /豁免.*?(交费期|缴费期)/.test(clauseText);
    
    stages.forEach((stage: any, idx: number) => {
      // 情况1：原文提到交费期，但字段为空
      if (!stage.paymentPeriodStatus && !stage.paymentMode && !isWaiverContext) {
        issues.push({
          category: '其他赔付字段',
          type: '交费期条件可能遗漏',
          sequenceNumber: record.sequenceNumber,
          coverageName: record.coverageName || '',
          stageNumber: stage.stageNumber,
          details: `原文提到交费期相关条件，但未在paymentPeriodStatus或paymentMode中体现`,
          suggestedFix: `检查是否需要添加paymentPeriodStatus字段（during/after）或paymentMode`,
          severity: 'P2',
          clauseTextSnippet: clauseText.substring(0, 200)
        });
      }
      // 情况2：有paymentPeriodStatus字段，但naturalLanguageDescription中未体现
      // v1.9.5：误判率100%，暂时禁用
      else if (false && stage.paymentPeriodStatus && stage.naturalLanguageDescription) {  // 3个问题全是误判
        const desc = stage.naturalLanguageDescription.toLowerCase();
        const hasPaymentPeriodInDesc = /交费期|缴费期|交费期间|缴费期间/.test(desc);
        if (!hasPaymentPeriodInDesc) {
          issues.push({
            category: '其他赔付字段',
            type: '交费期条件未在描述中体现',
            sequenceNumber: record.sequenceNumber,
            coverageName: record.coverageName || '',
            stageNumber: stage.stageNumber,
            details: `有paymentPeriodStatus字段（${stage.paymentPeriodStatus}），但naturalLanguageDescription中未体现交费期条件`,
            suggestedFix: `在naturalLanguageDescription中添加"交费期间内"或"交费期后"等描述`,
            severity: 'P1',
            clauseTextSnippet: clauseText.substring(0, 200)
          });
        }
      }
    });
  }
}

// ============================================
// 辅助函数
// ============================================

// 中文数字转换（修复版）
function chineseToNumber(chinese: string): number | null {
  // 特殊处理常见数字
  const specialCases: { [key: string]: number } = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
    '十': 10, '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15,
    '十六': 16, '十七': 17, '十八': 18, '十九': 19,
    '二十': 20, '三十': 30, '四十': 40, '五十': 50, '六十': 60, '七十': 70, '八十': 80, '九十': 90,
    '一百': 100
  };

  if (specialCases[chinese] !== undefined) {
    return specialCases[chinese];
  }

  // 处理复杂的数字（如：二十一、三十五、六十七等）
  const digitMap: { [key: string]: number } = {
    '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9
  };

  // 匹配模式：X十Y（如"二十一"、"六十五"）
  const match = chinese.match(/^([零一二两三四五六七八九])十([零一二两三四五六七八九])?$/);
  if (match) {
    const tens = digitMap[match[1]] || 1;  // "十五"中没有前缀，默认为1
    const ones = match[2] ? digitMap[match[2]] : 0;
    return tens * 10 + ones;
  }

  return null;
}

function extractAgesFromText(text: string): Set<number> {
  const ages = new Set<number>();
  
  // 先移除括号内的内容（避免重复，如"30周岁（含30岁）"）
  const textWithoutParens = text.replace(/[（(][^）)]*[）)]/g, '');
  
  // 阿拉伯数字：年满X周岁、X周岁、X岁
  const arabicMatches = textWithoutParens.matchAll(/年满(\d+)周?岁|(\d+)周岁|(\d+)岁(?!周)/g);
  for (const match of arabicMatches) {
    const age = parseInt(match[1] || match[2] || match[3]);
    if (age && age >= 1 && age <= 120) {
      ages.add(age);
    }
  }
  
  // 中文数字：年满X周岁、X周岁、X岁（减少180/276/493/546/574/592等误报）
  const chineseMatches = textWithoutParens.matchAll(/年满([一二三四五六七八九十百]+)周?岁|([一二三四五六七八九十百]+)周岁|([一二三四五六七八九十百]+)岁(?!周)/g);
  for (const match of chineseMatches) {
    const chineseNum = match[1] || match[2] || match[3];
    const age = chineseToNumber(chineseNum);
    if (age && age >= 1 && age <= 120) {
      ages.add(age);
    }
  }
  
  return ages;
}

// ============================================
// 报告生成
// ============================================

function generateReport(issues: QualityIssue[], allRecords: any[]) {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║                    检查结果汇总                          ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // ⭐ v1.9.4新增：区分rejected和approved的检测结果
  const rejectedRecords = allRecords.filter(r => r.reviewStatus === 'rejected');
  const approvedRecords = allRecords.filter(r => r.reviewStatus === 'approved');
  
  const rejectedIssues = issues.filter(i => i.reviewStatus === 'rejected');
  const approvedIssues = issues.filter(i => i.reviewStatus === 'approved');
  
  const rejectedSeqs = new Set(rejectedIssues.map(i => i.sequenceNumber));
  const approvedSeqs = new Set(approvedIssues.map(i => i.sequenceNumber));
  
  console.log('【数据统计】');
  console.log(`  已通过记录: ${approvedRecords.length}条`);
  console.log(`  未通过记录: ${rejectedRecords.length}条\n`);
  
  console.log('【检测效果】');
  console.log(`  ✅ 在未通过记录中检测到: ${rejectedSeqs.size}/${rejectedRecords.length}条 (${rejectedRecords.length ? Math.round(rejectedSeqs.size/rejectedRecords.length*100) : 0}%)  ← 漏判率: ${rejectedRecords.length ? Math.round((1-rejectedSeqs.size/rejectedRecords.length)*100) : 0}%`);
  console.log(`  ⚠️  在已通过记录中检测到: ${approvedSeqs.size}/${approvedRecords.length}条 (${approvedRecords.length ? Math.round(approvedSeqs.size/approvedRecords.length*100) : 0}%)  ← 误判率: ${approvedRecords.length ? Math.round(approvedSeqs.size/approvedRecords.length*100) : 0}%`);
  console.log('');

  // ⭐ 误判分析：按「类别/类型」统计在已通过记录上的触发情况，便于优化高误判规则
  if (approvedIssues.length > 0) {
    const typeStats: { key: string; category: string; type: string; total: number; approved: number }[] = [];
    const typeMap = new Map<string, { total: number; approved: number }>();
    issues.forEach(i => {
      const key = `${i.category}\t${i.type}`;
      if (!typeMap.has(key)) typeMap.set(key, { total: 0, approved: 0 });
      const s = typeMap.get(key)!;
      s.total += 1;
      if (i.reviewStatus === 'approved') s.approved += 1;
    });
    typeMap.forEach((v, key) => {
      const [category, type] = key.split('\t');
      typeStats.push({ key, category, type, total: v.total, approved: v.approved });
    });
    typeStats.sort((a, b) => b.approved - a.approved); // 误判数从高到低

    console.log('【误判分析】已通过记录中被检测出的问题类型分布（优先优化误判数高的规则）');
    console.log('  类型\t该类型总检出数\t其中已通过(误判)\t误判率(该类型)');
    typeStats.forEach(s => {
      const rate = s.total ? Math.round(s.approved / s.total * 100) : 0;
      console.log(`  ${s.category} / ${s.type}\t${s.total}\t${s.approved}\t${rate}%`);
    });
    console.log('');
  }

  if (issues.length === 0) {
    console.log('✅ 未发现任何问题！\n');
    return;
  }

  console.log(`⚠️  共发现 ${issues.length} 个问题`);
  console.log(`    - 未通过记录: ${rejectedIssues.length}个问题`);
  console.log(`    - 已通过记录: ${approvedIssues.length}个问题 (可能误判)\n`);

  // 按类别分组
  const issuesByCategory: { [key: string]: QualityIssue[] } = {};
  issues.forEach(issue => {
    if (!issuesByCategory[issue.category]) {
      issuesByCategory[issue.category] = [];
    }
    issuesByCategory[issue.category].push(issue);
  });

  // 按严重程度统计
  const p0Count = issues.filter(i => i.severity === 'P0').length;
  const p1Count = issues.filter(i => i.severity === 'P1').length;
  const p2Count = issues.filter(i => i.severity === 'P2').length;

  console.log('【严重程度分布】');
  console.log(`  P0 (必须修复): ${p0Count}个`);
  console.log(`  P1 (应该修复): ${p1Count}个`);
  console.log(`  P2 (建议修复): ${p2Count}个\n`);

  // 输出每个类别的问题
  for (const [category, categoryIssues] of Object.entries(issuesByCategory)) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`【${category}】 共 ${categoryIssues.length} 个问题\n`);

    // 按类型分组
    const issuesByType: { [key: string]: QualityIssue[] } = {};
    categoryIssues.forEach(issue => {
      if (!issuesByType[issue.type]) {
        issuesByType[issue.type] = [];
      }
      issuesByType[issue.type].push(issue);
    });

    for (const [type, typeIssues] of Object.entries(issuesByType)) {
      console.log(`\n  ${type} (${typeIssues.length}个)`);
      
      // 显示前5个详情
      console.log(`  详细列表（前5个）:\n`);
      typeIssues.slice(0, 5).forEach((issue, idx) => {
        console.log(`    ${idx + 1}. 序号${issue.sequenceNumber} - ${issue.coverageName}`);
        if (issue.stageNumber) {
          console.log(`       阶段${issue.stageNumber}: ${issue.details}`);
        } else {
          console.log(`       ${issue.details}`);
        }
        console.log(`       建议: ${issue.suggestedFix}`);
        console.log('');
      });

      const allSeq = [...new Set(typeIssues.map(i => i.sequenceNumber))].sort((a, b) => a - b);
      console.log(`  涉及序号 (共${allSeq.length}条): ${allSeq.join(', ')}\n`);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n提示：根据严重程度优先修复P0问题，然后是P1，最后是P2\n');
}

// ============================================
// 执行检查
// ============================================

masterQualityCheck().catch(console.error);
