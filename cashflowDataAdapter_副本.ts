/**
 * 现金流数据适配服务
 * 
 * 🎯 核心功能：
 * - 从聚合服务获取数据
 * - 转换为精细计算服务所需的标准格式
 * - 统一单位为"元"（保持原始精度，避免反复转换丢失精度）
 * - 补充期初值数据
 * 
 * 📊 单位策略：
 * - 输入：元（聚合服务已统一为元）
 * - 输出：元
 * - 原则：保持原始精度，不再需要单位转换
 * 
 * 🔗 依赖服务：
 * - cashflowAggregationService: 获取聚合后的现金流数据（元）
 */

// 🔧 后端改造：导入后端版本的服务
import { getAllYearlyCashflowIn, getAllYearlyCashflowOut } from './cashflowAggregationService';
import { 
  calculateProvidentFundBalance, 
  type ProvidentFundEntry,
  type ProvidentFundContext
} from '../income/providentFundCalculationService';
import { 
  calculateEnterpriseAnnuityBalance, 
  type EnterpriseAnnuityEntry,
  type EnterpriseAnnuityContext
} from '../income/enterpriseAnnuityCalculationService';
import { getMonthlyContributionLimit } from '../income/providentFundStandardService';
import { calculateFamilyExpenditureTimeRange } from '../shared/familyExpenditureEndTimeService';
import { generateEntityLabel } from '../shared/entityLabelService';
import type { HousingStatusContext } from '../income/housingStatusService';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 🔧 后端改造：performanceLogger 简化实现
const performanceLogger = {
  start: (_name: string, _context?: string) => {},
  end: (_name: string) => {},
  measure: async <T>(_name: string, fn: () => Promise<T> | T, _context?: string): Promise<T> => fn(),
  measureSync: <T>(_name: string, fn: () => T): T => fn()
};

// 🔧 后端改造：getCurrentScenarioInfo 简化实现（后端不需要场景管理）
function getCurrentScenarioInfo(): { scenario: string; isCustom: boolean } {
  return { scenario: 'baseline', isCustom: false };
}

// ==================== Entity 转换辅助函数 ====================

/**
 * 将 entity 从中文标签转换为英文格式（用于计算函数）
 */
function convertEntityToEnglish(entity: string): 'personal' | 'partner' {
  if (entity === '本人' || entity === 'personal') {
    return 'personal';
  } else if (entity === '伴侣' || entity === '现有伴侣' || entity === '未来伴侣' || entity === 'partner') {
    return 'partner';
  }
  return 'personal'; // 默认
}

/**
 * 将 entity 从英文格式转换为中文标签（用于返回结果）
 */
function convertEntityToLabel(entity: 'personal' | 'partner'): string {
  if (entity === 'personal') {
    return generateEntityLabel('本人');
  }
  
  // 伴侣需要根据婚姻场景判断
  try {
    const scenarioInfo = getCurrentScenarioInfo();
    if (scenarioInfo.scenario === 'MARRIED') {
      return generateEntityLabel('现有伴侣');
    } else if (scenarioInfo.scenario === 'FUTURE_MARRIAGE') {
      return generateEntityLabel('未来伴侣');
    }
  } catch (error) {
    console.warn('获取场景信息失败:', error);
  }
  
  return '伴侣'; // 默认
}

// ==================== 数据结构定义 ====================

/**
 * 适配后的标准数据格式（供精细计算服务使用）
 * 所有金额单位：元
 */
export interface AdaptedModuleData {
  income: IncomeData;
  expenditure: ExpenditureData;
  asset: AssetData;
  liability: LiabilityData;
  accountBalance?: AccountBalanceData;  // 🆕 账户余额数据（公积金/企业年金）【可选，仅风险评估使用】
  dataVersion: string;  // 🆕 数据版本号（时间戳），用于缓存失效判断
  // ⏸️ 暂时不使用保单数据，未来会重新启用
  insurance?: {
    policies: Array<{
      entity: string;
      categoryCode: string;
      premiumPaid?: number;
      totalBenefitReceived?: number;
      annualPremium?: number;
    }>;
  };  // 🆕 保单配置数据（可选）
}

interface IncomeData {
  totalAmount: number;  // 总收入（元）
  incomes: Array<{
    year: number;
    code: string;         // 科目编码
    subjectName: string;
    entity: string;
    category: string;
    categoryCode?: string; // 🆕 保险类型代码（仅保单收入）
    insuredPerson?: string; // 🆕 被保险人（仅保单收入）
    amount: number;       // 元
  }>;
}

interface ExpenditureData {
  totalAmount: number;  // 总支出（元，不含债务还款）
  expenditures: Array<{
    year: number;
    code: string;         // 科目编码（不含 L-prcp、L-intst、L-amt 等债务科目）
    subjectName: string;
    entity: string;
    category: string;
    categoryCode?: string; // 保险类型代码
    insuredPerson?: string; // 🆕 被保险人（仅保单支出）
    amount: number;       // 元
  }>;
  // ❌ 已删除 insuranceInitialValues 字段，相关数据现在从 insurance.policies 中获取
}

interface AssetData {
  totalValue: number;  // 所有资产总额（金融+房产+汽车等，单位：元）
  initialValues: {
    'FA-deph': number;   // 金融资产（元）
    'PA-Es': number;     // 房产（元）
    'PA-Veh': number;    // 汽车（元）
    'PA-pl': number;     // 车位（元）
    'PA-qt': number;     // 其他实物（元）
    'PA-gd': number;     // 实物金（元）
    'PA-cl': number;     // 收藏品（元）
    'PA-jew': number;    // 珠宝（元）
  };
  // 🆕 按 entity 拆分的期初值（用于资产负债表明细展示）
  initialValuesByEntity: Array<{
    entity: string;      // 如"现有房产1"、"现有车辆1"、"未来房产1"
    type: 'existing' | 'future';  // 现有 or 未来
    code: 'PA-Es' | 'PA-Veh';  // 只有房产和车辆需要按 entity 拆分
    initialValue: number;     // 该 entity 的期初资产价值（元）
  }>;
}

interface LiabilityData {
  totalValue: number;  // 负债总额（元）
  liabilities: Array<{
    year: number;
    code: string;         // 'L-prcp' | 'L-intst' | 'L-amt' | 'L-prepay' - 债务现金流科目编码
    subjectName: string;
    entity: string;
    category: string;
    categoryCode: string; // 'ML-hl' | 'ML-vl' 等
    amount: number;       // 元
    loanId?: string;      // 🆕 债务ID（所有债务类型）
  }>;
  initialValues: {
    'ML-hl': number;     // 房贷期初余额（元）
    'ML-vl': number;     // 车贷期初余额（元）
    'ML-xf': number;     // 消费贷期初余额（元）
    'ML-jy': number;     // 经营贷期初余额（元）
    'ML-gr': number;     // 民间贷期初余额（元）
    'ML-cc': number;     // 信用卡期初余额（元）
  };
  // 🆕 按 entity 拆分的期初值（用于资产负债表明细展示）
  initialValuesByEntity: Array<{
    entity: string;      // 如"现有房产1"、"现有车辆1"
    code: 'ML-hl' | 'ML-vl' | 'ML-xf' | 'ML-jy' | 'ML-gr' | 'ML-cc';  // 所有债务类型
    initialValue: number;     // 该 entity 的期初负债余额（元）
  }>;
}

/**
 * 账户余额数据（公积金/企业年金）
 * 所有金额单位：元
 */
export interface AccountBalanceData {
  providentFund: Array<{
    year: number;
    entity: string;  // "本人" 或 "现有伴侣"/"未来伴侣"
    openingBalance: number; // 期初余额（元）
    closingBalance: number; // 期末余额（元）
    contribution: number;   // 🆕 当年缴存额（元）
    withdrawal: number;     // 当年提取额（元）
  }>;
  enterpriseAnnuity: Array<{
    year: number;
    entity: string;  // "本人" 或 "现有伴侣"/"未来伴侣"
    openingBalance: number; // 期初余额（元）
    closingBalance: number; // 期末余额（元）
    contribution: number;   // 🆕 当年缴存额（元）
    withdrawal: number;     // 当年提取额（元）
  }>;
}

// ⏸️ ==================== 保单数据接口（暂时不使用） ====================
// 🆕 保单数据接口
// interface InsuranceData {
//   policies: Array<InsurancePolicy>;  // 保单列表
// }

// interface InsurancePolicy {
//   entity: string;              // 保单名称
//   categoryCode: string;        // 保险类型编码（如 insurance-illness）
//   insuredPerson: string;       // 被保险人
//   beneficiary: string;         // 受益人
//   premiumAmount: number;       // 年交保费（元）
//   paymentEndYear: number | null;  // 缴费结束年份（null表示已完成）
//   premiumPaid?: number;        // 🆕 已交保费（元）- 仅年金险
//   totalBenefitReceived?: number;  // 🆕 已领金额汇总（元）- 仅年金险
//   liabilities: Array<InsuranceLiability>;  // 责任列表
// }

// interface InsuranceLiability {
//   type: LiabilityType;         // 责任类型
//   coverageEndYear: number | 'lifetime';  // 保障结束年份
//   coverageStages: Array<CoverageStage>;  // 保额阶段列表
//   stackable?: boolean;         // 是否可叠加（可选）
//   benefitReceived?: number;    // 🆕 已领金额（元）- 仅年金责任
// }

// interface CoverageStage {
//   startYear: number;           // 阶段起始年份
//   endYear: number | 'lifetime';  // 阶段结束年份
//   baseAmount: number;          // 基础保额（元）
// }

// type LiabilityType = 'critical' | 'death' | 'accident' | 'annuity';
// ⏸️ ====================================================================

// ==================== 数据版本服务 ====================

/**
 * 数据版本缓存（短期缓存，避免同一请求内重复查询）
 */
let dataVersionCache: {
  userId: number;
  version: string;
  timestamp: number;
} | null = null;
const DATA_VERSION_CACHE_DURATION = 1000; // 1秒缓存

/**
 * 获取数据源版本号
 * 
 * 🎯 用途：作为缓存失效判断依据
 * 📊 来源：所有影响计算的表的 MAX(updatedAt)
 * 
 * @param userId 用户ID
 * @returns 数据版本号（ISO 时间戳字符串）
 */
export async function getDataSourceVersion(userId: number): Promise<string> {
  const now = Date.now();
  
  // 短期缓存，避免同一请求内重复查询
  if (dataVersionCache && 
      dataVersionCache.userId === userId &&
      (now - dataVersionCache.timestamp) < DATA_VERSION_CACHE_DURATION) {
    return dataVersionCache.version;
  }
  
  try {
    // 查询所有影响计算的表的最新 updatedAt
    const result = await prisma.$queryRaw<{ maxTime: Date | null }[]>`
      SELECT MAX("maxUpdatedAt") as "maxTime" FROM (
        -- 支出相关
        SELECT MAX("updatedAt") as "maxUpdatedAt" FROM "basic_life_plans" WHERE "userId" = ${userId}
        UNION ALL SELECT MAX("updatedAt") FROM "education_plans" WHERE "userId" = ${userId}
        UNION ALL SELECT MAX("updatedAt") FROM "medical_plans" WHERE "userId" = ${userId}
        UNION ALL SELECT MAX("updatedAt") FROM "retirement_plans" WHERE "userId" = ${userId}
        UNION ALL SELECT MAX("updatedAt") FROM "birth_plans" WHERE "userId" = ${userId}
        UNION ALL SELECT MAX("updatedAt") FROM "housing_plans" WHERE "userId" = ${userId}
        UNION ALL SELECT MAX("updatedAt") FROM "car_plans" WHERE "userId" = ${userId}
        UNION ALL SELECT MAX("updatedAt") FROM "travel_plans" WHERE "userId" = ${userId}
        UNION ALL SELECT MAX("updatedAt") FROM "care_plans" WHERE "userId" = ${userId}
        UNION ALL SELECT MAX("updatedAt") FROM "family_support_plans" WHERE "userId" = ${userId}
        UNION ALL SELECT MAX("updatedAt") FROM "rental_plans" WHERE "userId" = ${userId}
        UNION ALL SELECT MAX("updatedAt") FROM "module_cashflows" WHERE "userId" = ${userId}
        -- 收入相关
        UNION ALL SELECT MAX("updatedAt") FROM "career_incomes" WHERE "userId" = ${userId}
        UNION ALL SELECT MAX("updatedAt") FROM "other_incomes" WHERE "userId" = ${userId}
        -- 资产相关
        UNION ALL SELECT MAX("updatedAt") FROM "financial_assets" WHERE "userId" = ${userId}
        UNION ALL SELECT MAX("updatedAt") FROM "properties" WHERE "userId" = ${userId}
        UNION ALL SELECT MAX("updatedAt") FROM "vehicles" WHERE "userId" = ${userId}
        -- 负债相关
        UNION ALL SELECT MAX("updatedAt") FROM "debts" WHERE "userId" = ${userId}
        -- 保单相关
        UNION ALL SELECT MAX("updatedAt") FROM "insurance_policies" WHERE "userId" = ${userId}
        UNION ALL SELECT MAX("updatedAt") FROM "insurance_cashflows" WHERE "userId" = ${userId}
        -- 个人信息
        UNION ALL SELECT MAX("updatedAt") FROM "clients" WHERE "id" = ${userId}
        UNION ALL SELECT MAX("updatedAt") FROM "PersonalInfo" WHERE "userId" = ${userId}
        -- 用户配置（投资收益率等影响计算结果的配置项）
        UNION ALL SELECT MAX("updatedAt") FROM "user_configs" WHERE "userId" = ${userId}
        -- 用户微调（用户对现金流的手动调整）
        UNION ALL SELECT MAX("updatedAt") FROM "cashflow_adjustments" WHERE "userId" = ${userId}
      ) AS combined
    `;
    
    const maxTime = result[0]?.maxTime;
    const inputDataVersion = maxTime ? maxTime.toISOString() : '0';
    
    // 🔥 加入时间维度：跨月后自动失效
    // 格式：inputDataVersion + "_" + currentMonth (YYYY-MM)
    // 这样即使输入数据没变，跨月后 dataVersion 也会变化
    // 原因：现金流、保险等计算依赖当前日期（剩余月份、剩余缴费期等）
    const currentMonth = new Date().toISOString().slice(0, 7); // 例如: "2026-01"
    const version = `${inputDataVersion}_${currentMonth}`;
    
    // 更新缓存
    dataVersionCache = { userId, version, timestamp: now };
    
    return version;
  } catch (error) {
    console.error('❌ [数据版本] 获取数据版本失败:', error);
    // 失败时返回当前时间戳，确保不会错误命中缓存
    return Date.now().toString();
  }
}

/**
 * 清除数据版本缓存
 */
export function clearDataVersionCache(): void {
  dataVersionCache = null;
}

// ==================== 主函数 ====================

// 🚀 性能优化：模块级缓存，避免重复适配（短期缓存，仅用于请求内去重）
let adaptAllModulesDataCache: {
  data: AdaptedModuleData;
  userId: number;
  timestamp: number;
} | null = null;
const ADAPT_CACHE_DURATION = 1000; // 1秒缓存（请求内去重）

/**
 * 获取适配后的完整数据
 * 所有金额单位：元
 * 
 * 🚀 性能优化：短期缓存（1秒），仅用于同一请求内去重
 * 📊 dataVersion：来自 getDataSourceVersion()，基于数据库 updatedAt
 */
export async function adaptAllModulesData(userId: number): Promise<AdaptedModuleData> {
  try {
    const now = Date.now();
    
    // 🚀 短期缓存检查（1秒内有效，仅用于请求内去重）
    if (adaptAllModulesDataCache && 
        adaptAllModulesDataCache.userId === userId &&
        (now - adaptAllModulesDataCache.timestamp) < ADAPT_CACHE_DURATION) {
      console.log('✅ [数据适配缓存] 使用短期缓存（请求内去重）');
      return adaptAllModulesDataCache.data;
    }
    
    // 缓存无效或不存在，执行完整适配
    console.log('🔄 [数据适配] 执行完整数据适配...');
    
    const income = await performanceLogger.measure('adaptIncomeData', () => adaptIncomeData(userId));
    const expenditure = await performanceLogger.measure('adaptExpenditureData', () => adaptExpenditureData(userId));
    const asset = await performanceLogger.measure('adaptAssetData', () => adaptAssetData(userId));
    const liability = await performanceLogger.measure('adaptLiabilityData', () => adaptLiabilityData(userId));
    
    // 🔧 改造：dataVersion 来自数据库 updatedAt，而非时间戳
    const dataVersion = await getDataSourceVersion(userId);
    
    const result: AdaptedModuleData = {
      income,
      expenditure,
      asset,
      liability,
      dataVersion,
    };
    
    // 🚀 更新短期缓存
    adaptAllModulesDataCache = {
      data: result,
      userId: userId,
      timestamp: now
    };
    
    return result;
  } catch (error) {
    console.error('❌ [数据适配] 数据适配失败:', error);
    throw error;
  }
}

/**
 * 🚀 清除数据适配缓存（用于数据更新后强制刷新）
 */
export function clearAdaptAllModulesDataCache(): void {
  adaptAllModulesDataCache = null;
  console.log('🧹 [数据适配缓存] 缓存已清除');
}

// ==================== 子函数 ====================

/**
 * 适配账户余额数据（公积金/企业年金）
 * 输出单位：元
 * 
 * 🎯 架构优化：直接调用原服务，消除重复计算逻辑
 * 🔧 后端改造：从数据库获取数据
 */
async function adaptAccountBalanceData(userId: number): Promise<AccountBalanceData> {
  try {
    // 1. 🔧 后端改造：从 OtherIncome 表获取数据
    const otherIncome = await prisma.otherIncome.findUnique({
      where: { userId }
    });
    
    const otherIncomeData = (otherIncome?.data as any) || {};
    
    if (!otherIncomeData || Object.keys(otherIncomeData).length === 0) {
      return {
        providentFund: [],
        enterpriseAnnuity: []
      };
    }
    
    const categoryData = otherIncomeData.categoryData || otherIncomeData || {};
    
    // 2. 获取公积金数据（需要转换 entity 为中文标签）
    const providentFundEntries: ProvidentFundEntry[] = (categoryData.pension_fund || []).map((entry: any) => ({
      id: entry.id || '',
      entity: convertEntityToLabel(convertEntityToEnglish(entry.entity || '本人') as 'personal' | 'partner'), // 转换为中文标签
      balance: entry.balance || '0',
      contributionRate: entry.contributionRate || '0',
      enableWithdrawal: entry.enableWithdrawal  // 🆕 传递提取开关
    }));
    
    // 3. 获取企业年金数据（需要转换 entity 为英文格式）
    const enterpriseAnnuityEntries: EnterpriseAnnuityEntry[] = (categoryData.enterprise_annuity || []).map((entry: any) => ({
      id: entry.id || '',
      entity: convertEntityToEnglish(entry.entity || '本人'), // 转换为英文格式
      balance: entry.balance || '0',
      contributionRate: entry.contributionRate || '0'
    }));
    
    console.log(`🔍 [数据适配-账户余额] 企业年金录入数据:`, {
      rawData: categoryData.enterprise_annuity,
      entriesCount: enterpriseAnnuityEntries.length,
      entries: enterpriseAnnuityEntries
    });
    
    // 4. 构建公积金计算上下文
    // ✅ Fail-fast：不再用 currentYear + 50 兜底，避免掩盖“为何拿不到本人/时间范围”的根因
    const timeRange = await calculateFamilyExpenditureTimeRange(userId);
    
    // 获取个人信息和收入现金流数据（并行获取）
    const [personalInfo, allIncomes] = await Promise.all([
      prisma.personalInfo.findUnique({
        where: { userId }
      }),
      getAllYearlyCashflowIn(userId, undefined, 'cashflow_calculation')
    ]);
    
    // 从收入现金流中提取工资和养老金数据
    const salaryIncomes = allIncomes.filter((income: any) => 
      (income.code === 'In-sal' || income.subjectCode === 'In-sal') && income.amount
    );
    const pensionIncomes = allIncomes.filter((income: any) => 
      (income.code === 'In-pens' || income.subjectCode === 'In-pens') && income.amount
    );
    
    // 构建收入数据
    const incomeData = {
      incomes: [
        ...salaryIncomes.map((income: any) => ({
          year: income.year,
          entity: income.entity || '本人',
          code: 'In-sal',
          amount: income.amount
        })),
        ...pensionIncomes.map((income: any) => ({
          year: income.year,
          entity: income.entity || '本人',
          code: 'In-pens',
          amount: income.amount
        }))
      ]
    };
    
    // 获取房产和租房信息（构建 housingContext）
    const [properties, rentalPlan, housingPlan] = await Promise.all([
      prisma.property.findMany({ where: { userId } }),
      prisma.rentalPlan.findUnique({ where: { userId } }),
      prisma.housingPlan.findUnique({ where: { userId } })
    ]);
    
    const housingContext: HousingStatusContext = {
      requiredLifeConfig: {
        houseMaintenanceConfigs: properties.map(p => ({
          id: p.id,
          salePlan: p.salePlan as any || undefined,
        })),
        rental: {
          items: (rentalPlan?.items as any[]) || [],
        },
      },
      optionalLifeData: {
        housingMotives: (housingPlan?.motives as string[]) || [],
        housingCustomConfigs: Array.isArray(housingPlan?.customConfigs)
          ? (housingPlan.customConfigs as any[]).reduce((acc: any, cfg: any) => {
              if (cfg.motive) acc[cfg.motive] = cfg;
              return acc;
            }, {})
          : {},
      },
      birthYear: personalInfo?.birthYear || undefined,
    };
    
    // 构建完整的上下文
    const providentFundContext: ProvidentFundContext = {
      startYear: timeRange.startYear,
      endYear: timeRange.endYear,
      personalBirthYear: personalInfo?.birthYear || 1990,
      partnerBirthYear: undefined, // 暂时不支持伴侣
      scenario: 'SINGLE', // 默认场景
      city: personalInfo?.city || 'default',
      incomeData,
      housingContext
    };
    
    // 5. 调用原服务计算公积金余额（传入上下文）
    performanceLogger.start('计算公积金余额', 'adaptAccountBalanceData');
    const providentFundBalances = providentFundEntries.length > 0
      ? calculateProvidentFundBalance(providentFundEntries, providentFundContext)
      : [];
    performanceLogger.end('计算公积金余额');
    
    // 6. 构建企业年金计算上下文
    const enterpriseAnnuityContext: EnterpriseAnnuityContext = {
      startYear: timeRange.startYear,
      endYear: timeRange.endYear,
      scenario: 'SINGLE', // 默认场景
      incomeData: {
        incomes: incomeData.incomes,
        calculationDetails: {
          personal: {
            currentSalaryIncome: salaryIncomes.length > 0 
              ? salaryIncomes.reduce((sum, income: any) => sum + income.amount, 0) / salaryIncomes.length
              : undefined
          }
        }
      }
    };
    
    // 7. 从正常现金流中获取 In-qynj 收入项（税后金额）
    const enterpriseAnnuityIncomes = allIncomes.filter((income: any) => 
      (income.code === 'In-qynj' || income.subjectCode === 'In-qynj') && income.amount
    );
    
    console.log(`🔍 [数据适配-账户余额] 从正常现金流获取的In-qynj收入项:`, {
      totalCount: enterpriseAnnuityIncomes.length,
      sampleData: enterpriseAnnuityIncomes.slice(0, 5),
      totalAmount: enterpriseAnnuityIncomes.reduce((sum: number, income: any) => sum + (income.amount || 0), 0)
    });
    
    // 8. 调用原服务计算企业年金余额（传入上下文和现金流中的In-qynj数据）
    performanceLogger.start('计算企业年金余额', 'adaptAccountBalanceData');
    const enterpriseAnnuityBalances = enterpriseAnnuityEntries.length > 0
      ? calculateEnterpriseAnnuityBalance(enterpriseAnnuityEntries, enterpriseAnnuityContext, enterpriseAnnuityIncomes)
      : [];
    performanceLogger.end('计算企业年金余额');
    
    console.log(`🔍 [数据适配-账户余额] 企业年金余额计算结果:`, {
      entriesCount: enterpriseAnnuityEntries.length,
      balancesCount: enterpriseAnnuityBalances.length,
      balances: enterpriseAnnuityBalances.slice(0, 5) // 只显示前5条
    });
    
    return {
      providentFund: providentFundBalances,
      enterpriseAnnuity: enterpriseAnnuityBalances
    };
    
  } catch (error) {
    console.error('❌ [数据适配-账户余额] 账户余额数据适配失败:', error);
    performanceLogger.end('计算公积金余额');
    performanceLogger.end('计算企业年金余额');
    return {
      providentFund: [],
      enterpriseAnnuity: []
    };
  }
}

// ==================== 账户余额独立服务（带缓存） ====================

/**
 * 账户余额缓存
 */
let accountBalanceCache: {
  data: AccountBalanceData;
  incomeDataVersion: string; // 来自 income_planning_data.calculationTime
} | null = null;

/**
 * 获取收入数据版本号（用于缓存失效判断）
 * @param userId 用户ID
 * @returns 收入数据的 calculatedAt，如果不存在则返回 null
 * 🔧 后端改造：从 IncomeCashflow 表获取
 */
async function getIncomeDataVersion(userId: number): Promise<string | null> {
  try {
    const incomeCashflow = await prisma.incomeCashflow.findFirst({
      where: { userId },
      orderBy: { calculatedAt: 'desc' }
    });
    if (!incomeCashflow) return null;
    return incomeCashflow.calculatedAt?.toISOString() || null;
  } catch (error) {
    console.error('❌ [账户余额缓存] 读取收入数据版本失败:', error);
    return null;
  }
}

/**
 * 获取账户余额数据（公积金 + 企业年金）
 * 
 * 🎯 功能：
 * - 独立于 adaptAllModulesData()，仅在需要时调用
 * - 基于 income_planning_data.calculationTime 的智能缓存
 * - 收入数据变化时自动失效缓存
 * 
 * 🔄 缓存策略：
 * - 缓存键：income_planning_data.calculationTime
 * - 失效条件：calculationTime 变化（被动检查）
 * - 不设置固定时长，完全依赖版本号
 * 
 * @returns AccountBalanceData 账户余额数据
 */
export async function getAccountBalanceData(userId: number): Promise<AccountBalanceData> {
  try {
    performanceLogger.start('获取账户余额数据', 'getAccountBalanceData');
    
    // 1. 获取当前收入数据版本号
    const currentVersion = await getIncomeDataVersion(userId);
    
    // 2. 检查缓存是否有效
    if (accountBalanceCache && 
        currentVersion && 
        accountBalanceCache.incomeDataVersion === currentVersion) {
      console.log('✅ [账户余额缓存] 使用缓存数据（版本匹配）', {
        版本号: currentVersion
      });
      performanceLogger.end('获取账户余额数据');
      return accountBalanceCache.data;
    }
    
    // 3. 缓存失效或不存在，重新计算
    if (accountBalanceCache && currentVersion) {
      console.log('🔄 [账户余额缓存] 版本变化，重新计算', {
        旧版本: accountBalanceCache.incomeDataVersion,
        新版本: currentVersion
      });
    } else if (!currentVersion) {
      console.log('⚠️ [账户余额缓存] 未找到收入数据版本号，重新计算');
    } else {
      console.log('🆕 [账户余额缓存] 首次计算');
    }
    
    // 4. 调用原有计算函数
    const data = await performanceLogger.measure(
      'adaptAccountBalanceData',
      () => adaptAccountBalanceData(userId),
      '获取账户余额数据'
    );
    
    // 5. 更新缓存
    if (currentVersion) {
      accountBalanceCache = {
        data,
        incomeDataVersion: currentVersion
      };
      console.log('💾 [账户余额缓存] 缓存已更新', {
        版本号: currentVersion,
        公积金条数: data.providentFund.length,
        企业年金条数: data.enterpriseAnnuity.length
      });
    }
    
    performanceLogger.end('获取账户余额数据');
    return data;
    
  } catch (error) {
    console.error('❌ [账户余额服务] 获取账户余额数据失败:', error);
    performanceLogger.end('获取账户余额数据');
    // 返回空数据而不是抛出错误
    return {
      providentFund: [],
      enterpriseAnnuity: []
    };
  }
}

/**
 * 清除账户余额缓存
 * 
 * 🎯 使用场景：
 * - 收入数据更新后需要强制刷新（虽然缓存会自动失效，但可以手动清除）
 * - 测试或调试时需要重置缓存
 */
export function clearAccountBalanceCache(): void {
  accountBalanceCache = null;
  console.log('🧹 [账户余额缓存] 缓存已清除');
}

/**
 * 适配收入数据
 * 输出单位：元
 */
async function adaptIncomeData(userId: number): Promise<IncomeData> {
  try {
    // 从聚合服务获取所有收入（返回元）- 现金流计算场景
    const allIncomes = await getAllYearlyCashflowIn(userId, undefined, 'cashflow_calculation');
    
    // ✅ 获取家庭结束年份，过滤掉超过该年份的收入数据
    const familyTimeRange = await calculateFamilyExpenditureTimeRange(userId);
    const familyEndYear = familyTimeRange.endYear;
    
    // 2. 转换为标准格式（已是元），并过滤掉L-amt（贷款流入应该在liability中，不在income中）
    const filteredLAmtCount = allIncomes.filter(income => income.code === 'L-amt' || income.subjectCode === 'L-amt').length;
    const incomes = allIncomes
      .filter(income => income.code !== 'L-amt' && income.subjectCode !== 'L-amt') // 🆕 过滤掉L-amt，避免重复累加
      .filter(income => income.year <= familyEndYear) // ✅ 按 familyEndYear 过滤年份
      .map(income => ({
        year: income.year,
        code: income.code || income.subject || income.sourceCode || 'UNKNOWN',
        subjectName: income.subjectName,
        entity: income.entity || '未知',
        category: income.category || '收入',
        // 🆕 生成 categoryCode：保单数据基于 policyType + policyId（移除ID前缀）
        categoryCode: income.policyType && income.policyId
          ? `${mapPolicyTypeToCategory(income.policyType)}-${income.policyId.replace(/^[^_]+_/, '')}`
          : undefined,
        insuredPerson: income.insuredPerson,  // 🆕 被保险人
        amount: income.amount  // 元
      }));
    
    // 3. 计算总收入（元）
    const totalAmount = incomes.reduce((sum, item) => sum + item.amount, 0);
    
    return {
      totalAmount,
      incomes
    };
    
  } catch (error) {
    console.error('❌ [数据适配] 收入数据适配失败:', error);
    return {
      totalAmount: 0,
      incomes: []
    };
  }
}

/**
 * 标准化支出 category
 * 将细分类别转换为统一的一级类别
 * 
 * 转换规则：
 * - 养房、购房、租房、住房 → 居住
 * - 购车、养车 → 交通
 * - 其他 category 保持不变
 */
function normalizeCategory(category: string): string {
  // 居住相关：养房、购房、租房、住房 → 居住
  if (category === '养房' || category === '购房' || category === '租房' || category === '住房') {
    return '居住';
  }
  
  // 交通相关：购车、养车 → 交通
  if (category === '购车' || category === '养车') {
    return '交通';
  }
  
  // 其他 category 保持不变
  return category;
}

/**
 * 适配支出数据
 * 输出单位：元
 */
async function adaptExpenditureData(userId: number): Promise<ExpenditureData> {
  try {
    // 从聚合服务获取所有支出（items[] 中的 amount 是元）- 现金流计算场景
    // ✅ 启用年份截断，按 familyEndYear 过滤，避免读取数据库中的旧数据导致年份延长
    const allYearsCashflowOut = await getAllYearlyCashflowOut(userId, undefined, 'cashflow_calculation', false); 
    
    // 2. 展开所有年份的支出项
    const expenditures: any[] = [];
    let filteredDebtCount = 0; // 统计被过滤的债务项数量
    
    allYearsCashflowOut.forEach((yearData: any) => {
      yearData.items.forEach((item: any) => {
        // 🔧 过滤债务相关项：债务数据由 adaptLiabilityData() 单独提供
        // 避免在 expenditure 和 liability 中重复传递
        const isDebtItem = 
          item.subjectCode === 'L-prcp' ||   // 还款本金（流出）
          item.subjectCode === 'L-intst' ||  // 还款利息（流出）
          item.subjectCode === 'L-amt' ||    // 贷款现金流入（流入）
          item.subjectCode === 'L-prepay' || // 🆕 提前还款（流出）
          item.source === 'debt';             // 或通过 source 标记判断
        
        if (isDebtItem) {
          filteredDebtCount++;
          return;  // 跳过债务项
        }
        
        expenditures.push({
          year: yearData.year,
          code: item.subjectCode || 'UNKNOWN',
          subjectName: item.subjectName,
          entity: item.entity || '未知',
          category: normalizeCategory(item.category || '支出'),
          // 🆕 生成 categoryCode：保单数据基于 policyType + policyId（移除ID前缀）
          categoryCode: item.policyType && item.policyId
            ? `${mapPolicyTypeToCategory(item.policyType)}-${item.policyId.replace(/^[^_]+_/, '')}`
            : item.categoryCode,
          insuredPerson: item.insuredPerson,  // 🆕 被保险人
          amount: item.amount  // 元，保持原始精度，不转换
        });
      });
    });
    
    // 3. 计算总支出（元，不含债务）
    const totalAmount = expenditures.reduce((sum, item) => sum + item.amount, 0);
    
    return {
      totalAmount,
      expenditures
      // ❌ insuranceInitialValues 已删除，请使用 insurance.policies 中的 premiumPaid 和 benefitReceived
    };
    
  } catch (error) {
    console.error('❌ [数据适配] 支出数据适配失败:', error);
    return {
      totalAmount: 0,
      expenditures: []
    };
  }
}

/**
 * 🔍 调试：对比适配器数据和聚合服务数据
 * 
 * 使用方式：在浏览器控制台执行
 * window.debugCashflowData(2025)
 */
export async function debugCashflowData(year: number = 2025, userId: number = 1) {
  try {
    console.log(`🔍 开始对比${year}年数据...`);
    
    // 1. 从聚合服务获取数据（年度明细使用）- 现金流计算场景
    const allYearsCashflowOut = await getAllYearlyCashflowOut(userId, undefined, 'cashflow_calculation');
    const yearData = allYearsCashflowOut.find((y: any) => y.year === year);
    
    if (!yearData) {
      console.warn(`🔍 [对比调试] 聚合服务中没有${year}年数据`);
      return;
    }
    
    // 2. 从适配器获取数据（图表使用）
    const allData = await adaptAllModulesData(userId); // 🔧 添加 await 和 userId
    const adapterExpenditures = allData.expenditure.expenditures.filter(e => e.year === year);
    
    // 3. 分类统计
    const aggregationTotal = yearData.totalAmount; // 元
    const adapterTotal = adapterExpenditures.reduce((sum, e) => sum + e.amount, 0); // 元
    
    // 4. 按来源分类
    const aggregationBySource: any = {};
    yearData.items.forEach((item: any) => {
      const source = item.source || 'base';
      aggregationBySource[source] = (aggregationBySource[source] || 0) + item.amount;
    });
    
    const adapterByCode: any = {};
    adapterExpenditures.forEach((item: any) => {
      const code = item.code;
      adapterByCode[code] = (adapterByCode[code] || 0) + item.amount;
    });
    
    console.warn(`🔍 ========== ${year}年支出数据对比 ==========`);
    console.warn(`🔍 年度明细（聚合服务）: ${(aggregationTotal / 10000).toFixed(2)}万元, ${yearData.items.length}项`);
    console.warn(`🔍 图表数据（适配器）: ${(adapterTotal / 10000).toFixed(2)}万元, ${adapterExpenditures.length}项`);
    console.warn(`🔍 差异: ${((adapterTotal - aggregationTotal) / 10000).toFixed(2)}万元`);
    console.warn(`🔍 聚合服务按来源分类:`, Object.entries(aggregationBySource).map(([k, v]: [string, any]) => 
      `${k}=${(v / 10000).toFixed(2)}万`
    ).join(', '));
    console.warn(`🔍 适配器按科目代码(前5个):`, Object.entries(adapterByCode).slice(0, 5).map(([k, v]: [string, any]) => 
      `${k}=${(v / 10000).toFixed(2)}万`
    ).join(', '));
    
    // 5. 查找保单和债务相关数据
    // ⏸️ 暂时不调试保单数据
    // const policyItems = yearData.items.filter((item: any) => item.source === 'policy');
    const debtItems = yearData.items.filter((item: any) => item.source === 'debt');
    // const policyInAdapter = adapterExpenditures.filter(e => e.code === 'Ins-cxprem' || e.code === 'Ins-bzprem');
    const debtInAdapter = adapterExpenditures.filter(e => 
      e.code === 'L-prcp' || e.code === 'L-intst' || e.code === 'L-amt'
    );
    
    // console.warn(`🔍 保单支出: 聚合服务${policyItems.length}项/${(policyItems.reduce((s: number, i: any) => s + i.amount, 0) / 10000).toFixed(2)}万, 适配器${policyInAdapter.length}项/${(policyInAdapter.reduce((s, i) => s + i.amount, 0) / 10000).toFixed(2)}万`);
    console.warn(`🔍 债务支出: 聚合服务${debtItems.length}项/${(debtItems.reduce((s: number, i: any) => s + i.amount, 0) / 10000).toFixed(2)}万, 适配器${debtInAdapter.length}项/${(debtInAdapter.reduce((s, i) => s + i.amount, 0) / 10000).toFixed(2)}万`);
    console.warn(`🔍 =====================================`);
    
    return {
      聚合服务: { 总额: aggregationTotal / 10000, 项数: yearData.items.length },
      适配器: { 总额: adapterTotal / 10000, 项数: adapterExpenditures.length },
      差异: (adapterTotal - aggregationTotal) / 10000
    };
    
  } catch (error) {
    console.error('❌ [对比调试] 失败:', error);
    return null;
  }
}

/**
 * 🔍 调试：查看未来购房相关数据（仅 L-amt 和 Gzf-gf-fj）
 * 
 * 使用方式：在浏览器控制台执行
 * window.debugFutureHousingData()
 */
export async function debugFutureHousingData(userId: number = 1) {
  try {
    // 1. 获取适配后的数据
    const adaptedData = await adaptAllModulesData(userId); // 🔧 添加 await 和 userId
    
    // 2. 从支出数据中筛选未来购房支出（Gzf-gf-fj）
    const housingExpenditures = adaptedData.expenditure.expenditures.filter(
      item => item.code === 'Gzf-gf-fj'
    );
    
    // 3. 从负债数据中筛选贷款流入（L-amt）
    const loanIncomes = adaptedData.liability.liabilities.filter(
      item => item.code === 'L-amt'
    );
    
    // 4. 📊 购房支出详细调试信息
    if (housingExpenditures.length > 0) {
      const houseExpenseTotal = housingExpenditures.reduce((sum, item) => sum + item.amount, 0);
      console.group('🏠 购房现金流出数据 (Gzf-gf-fj)');
      console.log(`总计: ${housingExpenditures.length}项，${(houseExpenseTotal/10000).toFixed(2)}万元`);
      console.log('');
      
      console.log('%c完整数据栏位:', 'font-weight: bold; color: #2196F3');
      
      // 按主体分组显示
      const byEntity = new Map<string, any[]>();
      housingExpenditures.forEach(item => {
        const key = item.entity;
        if (!byEntity.has(key)) byEntity.set(key, []);
        byEntity.get(key)!.push(item);
      });
      
      byEntity.forEach((items, entity) => {
        const total = items.reduce((sum, item) => sum + item.amount, 0);
        console.log('');
        console.log(`%c━━━ ${entity} ━━━`, 'color: #E91E63; font-weight: bold');
        console.log(`共 ${items.length} 项，总金额 ${(total/10000).toFixed(2)} 万元`);
        console.log('');
        
        const sample = items[0];
        console.table({
          '年份 (year)': sample.year,
          '科目编码 (code)': sample.code,
          '科目名称 (subjectName)': sample.subjectName,
          '主体 (entity)': sample.entity,
          '类别 (category)': sample.category,
          '类型代码 (categoryCode)': sample.categoryCode || '无',
          '金额 (amount)': `${sample.amount.toLocaleString()} 元 = ${(sample.amount/10000).toFixed(2)} 万元`
        });
      });
      
      console.groupEnd();
    }
    
    // 5. 📊 贷款流入详细调试信息
    if (loanIncomes.length > 0) {
      const loanIncomeTotal = loanIncomes.reduce((sum, item) => sum + item.amount, 0);
      console.group('💵 贷款现金流入数据 (L-amt)');
      console.log(`总计: ${loanIncomes.length}项，${(loanIncomeTotal/10000).toFixed(2)}万元`);
      console.log('');
      
      console.log('%c完整数据栏位:', 'font-weight: bold; color: #2196F3');
      
      // 按主体分组显示
      const byEntity = new Map<string, any[]>();
      loanIncomes.forEach(item => {
        const key = item.entity;
        if (!byEntity.has(key)) byEntity.set(key, []);
        byEntity.get(key)!.push(item);
      });
      
      byEntity.forEach((items, entity) => {
        const total = items.reduce((sum, item) => sum + item.amount, 0);
        console.log('');
        console.log(`%c━━━ ${entity} ━━━`, 'color: #00BCD4; font-weight: bold');
        console.log(`共 ${items.length} 项，总金额 ${(total/10000).toFixed(2)} 万元`);
        console.log('');
        
        const sample = items[0];
        console.table({
          '年份 (year)': sample.year,
          '科目编码 (code)': sample.code,
          '科目名称 (subjectName)': sample.subjectName,
          '主体 (entity)': sample.entity,
          '类别 (category)': sample.category,
          '类型代码 (categoryCode)': sample.categoryCode || '无',
          '金额 (amount)': `${sample.amount.toLocaleString()} 元 = ${(sample.amount/10000).toFixed(2)} 万元`
        });
      });
      
      console.groupEnd();
    }
    
  } catch (error) {
    console.error('❌ [调试失败] 未来购房数据调试失败:', error);
  }
}

// ⏸️ ==================== 保单调试函数（暂时不使用） ====================
/**
 * 🔍 调试：检查年金险保单期初值数据（⏸️ 暂时禁用）
 * 
 * 使用方式：在浏览器控制台执行
 * window.debugInsuranceInitialValues()
 */
/*
export function debugInsuranceInitialValues() {
  try {
    console.log('🔍 ========== 年金险保单期初值调试 ==========');
    
    // 1. 检查 localStorage 中的保单数据
    const policyDataStr = localStorage.getItem('insurance_policy_data');
    if (!policyDataStr) {
      console.error('❌ localStorage 中没有 insurance_policy_data');
      return;
    }
    
    const policyData = JSON.parse(policyDataStr);
    let allPolicies: any[] = [];
    
    if (Array.isArray(policyData)) {
      allPolicies = policyData;
    } else if (typeof policyData === 'object' && policyData.policies) {
      allPolicies = policyData.policies;
    }
    
    console.log(`📊 总保单数: ${allPolicies.length}`);
    
    // 2. 筛选年金险
    const annuityPolicies = allPolicies.filter(p => p.policyType === 'annuity');
    console.log(`📊 年金险保单数: ${annuityPolicies.length}`);
    
    if (annuityPolicies.length === 0) {
      console.warn('⚠️ 没有年金险保单');
      return;
    }
    
    // 3. 逐个检查年金险保单
    annuityPolicies.forEach((policy, index) => {
      console.log(`\n📋 保单${index + 1}: ${policy.productName} (ID: ${policy.id})`);
      console.log('  基础信息:', {
        policyStartYear: policy.policyStartYear,
        paymentPeriod: policy.paymentPeriod,
        annualPremium: policy.annualPremium + '元',
        policyType: policy.policyType
      });
      
      // 3.1 检查已缴保费计算
      const currentYear = new Date().getFullYear();
      let premiumPaidYuan = 0;
      
      if (policy.paymentPeriod === 0) {
        premiumPaidYuan = policy.annualPremium || 0;
        console.log('  📊 已缴保费(趸交):', premiumPaidYuan + '元 = ' + (premiumPaidYuan / 10000).toFixed(2) + '万元');
      } else {
        const actualYearsPaid = Math.max(0, currentYear - policy.policyStartYear);
        const effectiveYearsPaid = Math.min(actualYearsPaid, policy.paymentPeriod);
        premiumPaidYuan = effectiveYearsPaid * (policy.annualPremium || 0);
        console.log('  📊 已缴保费(期交):', {
          当前年份: currentYear,
          保单起始年份: policy.policyStartYear,
          实际已过年数: actualYearsPaid,
          缴费期限: policy.paymentPeriod,
          有效缴费年数: effectiveYearsPaid,
          年度保费: (policy.annualPremium || 0) + '元',
          已缴保费: premiumPaidYuan + '元 = ' + (premiumPaidYuan / 10000).toFixed(2) + '万元'
        });
      }
      
      // 3.2 检查已领取金额
      const annuityPlans = policy.customReceivingPlan?.filter(
        (plan: any) => plan.receivingType === 'annuity'
      ) || [];
      
      const totalReceivedYuan = annuityPlans.reduce(
        (sum: number, plan: any) => sum + (plan.totalReceivedAmount || 0),
        0
      );
      
      console.log('  📊 领取计划:', {
        年金类计划数: annuityPlans.length,
        所有计划: policy.customReceivingPlan?.map((p: any) => ({
          类型: p.receivingType,
          已领金额: p.totalReceivedAmount
        }))
      });
      console.log('  📊 已领金额:', totalReceivedYuan + '元 = ' + (totalReceivedYuan / 10000).toFixed(2) + '万元');
      
      // 3.3 计算现金价值
      const cashValueYuan = Math.max(0, premiumPaidYuan - totalReceivedYuan);
      console.log('  💰 保单现金价值:', cashValueYuan + '元 = ' + (cashValueYuan / 10000).toFixed(2) + '万元');
    });
    
    // 4. 检查适配器生成的数据
    console.log('\n🔧 检查适配器生成的数据...');
    const adaptedData = adaptAllModulesData();
    
    // 🆕 检查新的保单数据结构
    if (adaptedData.insurance && adaptedData.insurance.policies) {
      console.log(`✅ insurance.policies 存在，共 ${adaptedData.insurance.policies.length} 份保单`);
      adaptedData.insurance.policies.forEach((policy, index) => {
        console.log(`  ${index + 1}. ${policy.entity}:`);
        console.log('    - categoryCode:', policy.categoryCode);
        console.log('    - premiumAmount:', policy.premiumAmount + '元 = ' + (policy.premiumAmount / 10000).toFixed(2) + '万元');
        if (policy.premiumPaid !== undefined) {
          console.log('    - premiumPaid:', policy.premiumPaid + '元 = ' + (policy.premiumPaid / 10000).toFixed(2) + '万元');
        }
        if (policy.totalBenefitReceived !== undefined) {
          console.log('    - totalBenefitReceived:', policy.totalBenefitReceived + '元 = ' + (policy.totalBenefitReceived / 10000).toFixed(2) + '万元');
          const cashValue = (policy.premiumPaid || 0) - policy.totalBenefitReceived;
          console.log('    - 现金价值:', cashValue + '元 = ' + (cashValue / 10000).toFixed(2) + '万元');
        }
      });
    } else {
      console.error('❌ insurance.policies 不存在！');
    }
    
    console.log('🔍 ==========================================');
    
  } catch (error) {
    console.error('❌ 调试失败:', error);
  }
}
*/
// ⏸️ ====================================================================

// 暴露到全局，方便调试
if (typeof window !== 'undefined') {
  (window as any).debugCashflowData = debugCashflowData;
  (window as any).debugFutureHousingData = debugFutureHousingData;  // 🆕 未来购房调试
  // ⏸️ 暂时不暴露保单调试函数
  // (window as any).debugInsuranceInitialValues = debugInsuranceInitialValues;
  (window as any).adaptAllModulesData = adaptAllModulesData;  // 🆕 暴露主函数用于调试
}

/**
 * 适配资产数据
 * 输出单位：元
 * 🔧 后端改造：从数据库获取
 */
async function adaptAssetData(userId: number): Promise<AssetData> {
  try {
    // 🔧 后端改造：从 FinancialAsset 和 Property/Vehicle 表获取
    const [financialAsset, properties, vehicles] = await Promise.all([
      prisma.financialAsset.findUnique({ where: { userId } }),
      prisma.property.findMany({ where: { userId } }),
      prisma.vehicle.findMany({ where: { userId } })
    ]);
    
    if (!financialAsset && properties.length === 0 && vehicles.length === 0) {
      return getDefaultAssetData();
    }
    
    const financialAssets = financialAsset?.totalAmount || 0;  // 万元
    const realEstateValue = properties.reduce((sum, p) => sum + (p.marketValue || 0), 0);  // 万元
    const vehicleValue = vehicles.reduce((sum, v) => sum + (v.purchasePrice || 0), 0);  // 万元
    
    // 3. 构建 initialValues（转换为元）
    const initialValues = {
      'FA-deph': financialAssets * 10000,   // 万元 → 元
      'PA-Es': realEstateValue * 10000,     // 万元 → 元
      'PA-Veh': vehicleValue * 10000,       // 万元 → 元
      'PA-pl': 0,    // 车位（暂无）
      'PA-qt': 0,    // 其他实物资产（暂无）
      'PA-gd': 0,    // 实物金（暂无）
      'PA-cl': 0,    // 收藏品（暂无）
      'PA-jew': 0    // 珠宝首饰（暂无）
    };
    
    const totalValue = (financialAssets + realEstateValue + vehicleValue) * 10000;
    
    // 🆕 生成按 entity 拆分的期初值
    const initialValuesByEntity = await generateAssetInitialValuesByEntity(userId);
    
    return {
      totalValue,
      initialValues,
      initialValuesByEntity
    };
    
  } catch (error) {
    console.error('❌ [数据适配] 资产数据适配失败:', error);
    return getDefaultAssetData();
  }
}

/**
 * 适配负债数据
 * 输出单位：元
 * 
 * 🔧 统一数据源：从 getAllYearlyCashflowOut() 和 getAllYearlyCashflowIn() 提取债务数据
 * 
 * ⚠️ 注意：
 * - 虽然聚合服务的支出数据已包含债务还款，但现金流表生成时需要单独的负债行
 * - 因此这里需要从聚合服务获取债务还款数据，供现金流表使用
 */
async function adaptLiabilityData(userId: number): Promise<LiabilityData> {
  try {
    // 🔧 从统一数据源获取债务相关现金流
    const allYearsCashflowOut = await getAllYearlyCashflowOut(userId, undefined, 'cashflow_calculation');
    const allYearsCashflowIn = await getAllYearlyCashflowIn(userId, undefined, 'cashflow_calculation');
    
    const liabilities: any[] = [];
    
    // 提取债务流出（L-prcp、L-intst、L-prepay）
    allYearsCashflowOut.forEach((yearData: any) => {
      yearData.items.forEach((item: any) => {
        if (item.source === 'debt' || 
            item.subjectCode === 'L-prcp' || 
            item.subjectCode === 'L-intst' || 
            item.subjectCode === 'L-prepay') {
        liabilities.push({
            year: yearData.year,
            code: item.subjectCode,
            subjectName: item.subjectName,
            entity: item.entity,
            category: item.category,
            categoryCode: item.categoryCode,
            amount: item.amount,
            loanId: item.loanId  // 🆕 提取并保存 loanId 字段
          });
        }
      });
    });
    
    // 提取债务流入（L-amt）
    allYearsCashflowIn.forEach(item => {
      if (item.code === 'L-amt' || item.subjectCode === 'L-amt') {
        liabilities.push({
          year: item.year,
          code: 'L-amt',
          subjectName: item.subjectName,
          entity: item.entity,
          category: item.category,
          categoryCode: item.categoryCode,
          amount: item.amount,
          loanId: item.loanId  // 🆕 提取并保存 loanId 字段
        });
      }
      });
    
    // 生成负债期初值（元）
    const initialValues = await generateLiabilityInitialValues(userId);
    
    // 🆕 生成按 entity 拆分的期初值
    const initialValuesByEntity = await generateLiabilityInitialValuesByEntity(userId);
    
    const totalValue = Object.values(initialValues).reduce((sum, val) => sum + val, 0);
    
    return {
      totalValue,
      liabilities,
      initialValues,
      initialValuesByEntity
    };
    
  } catch (error) {
    console.error('❌ [数据适配] 负债数据适配失败:', error);
    return getDefaultLiabilityData();
  }
}

// ==================== 辅助函数 ====================

// ❌ 已删除以下函数，相关功能已合并到新的保单数据适配模块中：
// - generateInsuranceInitialValues(): 保单期初值现在从 insurance.policies 中获取
// - calculatePremiumPaid(): 已移至保单适配部分
// - getBenefitReceived(): 已重构为 calculateBenefitReceived()

/**
 * 生成各类负债的期初值
 * 返回单位：元
 * 
 * 🔧 计算规则：
 * 1. 房贷：期初值 = 贷款剩余本金（万元 → 元）
 * 2. 车贷：
 *    - 分期：期初值 = 每期分期金额 × 剩余期限（元）
 *    - 银行贷款：期初值 = 贷款剩余本金（万元 → 元）
 * 3. 消费贷、经营贷：
 *    - 先息后本：期初值 = 贷款本金（万元 → 元）
 *    - 一次性还本付息：期初值 = 剩余贷款本金（万元 → 元）
 *    - 等额本息/等额本金：期初值 = 剩余贷款本金（万元 → 元）
 * 4. 民间贷：
 *    - 先息后本：期初值 = 贷款本金（万元 → 元）
 *    - 一次性还本付息：期初值 = 剩余贷款本金（万元 → 元）
 * 5. 信用卡：期初值 = 本期待还金额 + 未出账单金额（元）
 */
async function generateLiabilityInitialValues(userId: number): Promise<{
  'ML-hl': number;
  'ML-vl': number;
  'ML-xf': number;
  'ML-jy': number;
  'ML-gr': number;
  'ML-cc': number;
}> {
  const initialValues = {
    'ML-hl': 0,
    'ML-vl': 0,
    'ML-xf': 0,
    'ML-jy': 0,
    'ML-gr': 0,
    'ML-cc': 0
  };
  
  try {
    // 🔧 后端改造：从 Debt 表获取
    const debtRecords = await prisma.debt.findMany({
      where: { userId }
    });
    if (debtRecords.length === 0) {
      return initialValues;
    }
    
    // 转换为前端格式
    const debts = debtRecords.map(d => ({ type: d.type, ...((d.data as any) || {}) }));
    
    debts.forEach(debt => {
      // ========== 1. 房贷 ==========
      if (debt.type === 'mortgage' && debt.loans) {
        // 期初值 = 贷款剩余本金（万元 → 元）
        initialValues['ML-hl'] = debt.loans.reduce((sum: number, loan: any) => {
          let remainingWanYuan = 0;
          
          // 🔧 根据贷款类型获取剩余本金
          if (loan.loanType === 'combination') {
            // 组合贷款：商业 + 公积金
            const commercialRemaining = parseFloat(loan.commercialRemainingPrincipal || loan.commercialLoanAmount || '0');
            const providentRemaining = parseFloat(loan.providentRemainingPrincipal || loan.providentLoanAmount || '0');
            remainingWanYuan = commercialRemaining + providentRemaining;
          } else {
            // 单一类型贷款：使用通用字段
            remainingWanYuan = parseFloat(
              loan.remainingPrincipal ||  // 首选：剩余本金（万元）
              loan.remainingAmount ||     // 备选（兼容旧数据）
              loan.loanAmount ||          // 备选：原始贷款金额
              '0'
            );
          }
          
          return sum + (remainingWanYuan * 10000); // 万元 → 元
        }, 0);
        
      // ========== 2. 车贷 ==========
      } else if (debt.type === 'carLoan' && debt.carLoans) {
        initialValues['ML-vl'] = debt.carLoans.reduce((sum: number, carLoan: any) => {
          const loanType = carLoan.loanType; // 'installment' | 'bankLoan'
          
          if (loanType === 'installment') {
            // 分期：期初值 = 每期分期金额 × 剩余期限（元）
            const installmentAmountYuan = parseFloat(carLoan.installmentAmount || '0'); // 元
            const remainingInstallments = parseFloat(carLoan.remainingInstallments || carLoan.remainingMonths || '0');
            const initialValue = installmentAmountYuan * remainingInstallments; // 元
            return sum + initialValue;
            
          } else if (loanType === 'bankLoan') {
            // 银行贷款：期初值 = 贷款剩余本金（万元 → 元）
            const remainingWanYuan = parseFloat(
              carLoan.remainingPrincipal ||  // 首选：剩余本金
              carLoan.remainingAmount ||     // 备选1
              carLoan.principal ||            // 备选2：贷款本金
              carLoan.loanAmount ||           // 备选3
              '0'
            );
            const initialValue = remainingWanYuan * 10000; // 万元 → 元
            return sum + initialValue;
          }
          
          return sum;
        }, 0);
        
      // ========== 3. 消费贷 ==========
      } else if (debt.type === 'consumerLoan' && debt.consumerLoans) {
        initialValues['ML-xf'] = debt.consumerLoans.reduce((sum: number, loan: any) => {
          const repaymentMethod = loan.repaymentMethod; // 'interestFirst' | 'oneTime' | 'equalPrincipal' | 'equalInstallment'
          
          if (repaymentMethod === 'interestFirst') {
            // 先息后本：期初值 = 贷款本金（万元 → 元）
            const principalWanYuan = parseFloat(loan.loanAmount || '0');
            return sum + (principalWanYuan * 10000); // 万元 → 元
            
          } else {
            // 一次性还本付息 / 等额本息 / 等额本金：期初值 = 剩余贷款本金（万元 → 元）
            const remainingWanYuan = parseFloat(
              loan.remainingPrincipal ||  // 首选：剩余本金（万元）
              loan.loanAmount ||          // 备选：原始贷款金额
              '0'
            );
            return sum + (remainingWanYuan * 10000); // 万元 → 元
          }
        }, 0);
        
      // ========== 4. 经营贷 ==========
      } else if (debt.type === 'businessLoan' && debt.businessLoans) {
        initialValues['ML-jy'] = debt.businessLoans.reduce((sum: number, loan: any) => {
          const repaymentMethod = loan.repaymentMethod;
          
          if (repaymentMethod === 'interestFirst') {
            // 先息后本：期初值 = 贷款本金（万元 → 元）
            const principalWanYuan = parseFloat(loan.loanAmount || '0');
            return sum + (principalWanYuan * 10000); // 万元 → 元
            
          } else {
            // 一次性还本付息 / 等额本息 / 等额本金：期初值 = 剩余贷款本金（万元 → 元）
            const remainingWanYuan = parseFloat(
              loan.remainingPrincipal ||  // 首选：剩余本金（万元）
              loan.loanAmount ||          // 备选：原始贷款金额
              '0'
            );
            return sum + (remainingWanYuan * 10000); // 万元 → 元
          }
        }, 0);
        
      // ========== 5. 民间贷 ==========
      } else if (debt.type === 'privateLoan' && debt.privateLoans) {
        initialValues['ML-gr'] = debt.privateLoans.reduce((sum: number, loan: any) => {
          const repaymentMethod = loan.repaymentMethod;
          
          // 注意：民间贷的 loanAmount 本身就代表剩余贷款本金（万元）
          if (repaymentMethod === 'interestFirst') {
            // 先息后本：期初值 = 贷款本金（万元 → 元）
            const principalWanYuan = parseFloat(loan.loanAmount || '0');
            return sum + (principalWanYuan * 10000); // 万元 → 元
            
          } else {
            // 一次性还本付息 / 等额本息 / 等额本金：期初值 = 剩余贷款本金（万元 → 元）
            // 民间贷只有 loanAmount 字段，它就是剩余本金
            const remainingWanYuan = parseFloat(loan.loanAmount || '0');
            return sum + (remainingWanYuan * 10000); // 万元 → 元
          }
        }, 0);
        
      // ========== 6. 信用卡 ==========
      } else if (debt.type === 'creditCard' && debt.creditCards) {
        // 期初值 = 本期待还金额 + 未出账单金额（元）
        initialValues['ML-cc'] = debt.creditCards.reduce((sum: number, card: any) => {
          const currentYuan = parseFloat(card.currentAmount || '0'); // 元
          const unbilledYuan = parseFloat(card.unbilledAmount || '0'); // 元
          return sum + currentYuan + unbilledYuan; // 元
        }, 0);
      }
    });
    
  } catch (error) {
    console.error('❌ [数据适配] 生成负债期初值失败:', error);
  }
  
  return initialValues;
}

/**
 * 生成负债按 entity 拆分的期初值
 * 返回单位：元
 * 🆕 支持所有债务类型：房贷、车贷、消费贷、经营贷、民间贷、信用卡
 */
async function generateLiabilityInitialValuesByEntity(userId: number): Promise<Array<{
  entity: string;
  code: 'ML-hl' | 'ML-vl' | 'ML-xf' | 'ML-jy' | 'ML-gr' | 'ML-cc';
  initialValue: number;
}>> {
  const result: Array<{
    entity: string;
    code: 'ML-hl' | 'ML-vl' | 'ML-xf' | 'ML-jy' | 'ML-gr' | 'ML-cc';
    initialValue: number;
  }> = [];

  try {
    // 🔧 后端改造：从 Debt 表获取
    const debtRecords = await prisma.debt.findMany({
      where: { userId }
    });
    const confirmedDebts = debtRecords.map(d => ({ type: d.type, ...((d.data as any) || {}) }));
    
    confirmedDebts.forEach((debt: any) => {
      // 1. 房贷
      if (debt.type === 'mortgage' && debt.loans) {
        debt.loans.forEach((loan: any) => {
          if (!loan.entity) return;
          
          let remainingPrincipal = 0;
          
          // 根据贷款类型获取剩余本金
          if (loan.loanType === 'combination') {
            // 组合贷款：商业 + 公积金
            const commercialRemaining = parseFloat(loan.commercialRemainingPrincipal || loan.commercialLoanAmount || '0');
            const providentRemaining = parseFloat(loan.providentRemainingPrincipal || loan.providentLoanAmount || '0');
            remainingPrincipal = (commercialRemaining + providentRemaining) * 10000; // 万元 → 元
          } else {
            // 纯商业或纯公积金
            const remaining = parseFloat(loan.remainingPrincipal || loan.loanAmount || '0');
            remainingPrincipal = remaining * 10000; // 万元 → 元
          }
          
          result.push({
            entity: loan.entity,
            code: 'ML-hl',
            initialValue: remainingPrincipal
          });
        });
      }
      
      // 2. 车贷
      else if (debt.type === 'carLoan' && debt.carLoans) {
        debt.carLoans.forEach((loan: any) => {
          if (!loan.entity) return;
          
          let remainingAmount = 0;
          
          if (loan.loanType === 'installment') {
            // 分期：每期金额 × 剩余期数
            const installmentAmountYuan = parseFloat(loan.installmentAmount || '0'); // 元
            const remainingInstallments = parseFloat(loan.remainingInstallments || loan.remainingMonths || '0');
            remainingAmount = installmentAmountYuan * remainingInstallments; // 元
          } else {
            // 银行贷款：剩余本金
            const remaining = parseFloat(loan.remainingPrincipal || loan.loanAmount || '0');
            remainingAmount = remaining * 10000; // 万元 → 元
          }
          
          result.push({
            entity: loan.entity,
            code: 'ML-vl',
            initialValue: remainingAmount
          });
        });
      }
      
      // 🆕 3. 消费贷
      else if (debt.type === 'consumerLoan' && debt.consumerLoans) {
        debt.consumerLoans.forEach((loan: any) => {
          if (!loan.entity) return;
          
          let remainingAmount = 0;
          
          // 对于等额本息/等额本金，优先使用 remainingPrincipal
          // 对于先息后本/一次性还本付息，使用 loanAmount
          const isEqualPayment = loan.repaymentMethod === 'equal-payment' || loan.repaymentMethod === 'equal-principal';
          const principalWan = parseFloat(isEqualPayment ? (loan.remainingPrincipal || loan.loanAmount || '0') : (loan.loanAmount || '0'));
          remainingAmount = principalWan * 10000; // 万元 → 元
          
          result.push({
            entity: loan.entity,
            code: 'ML-xf',
            initialValue: remainingAmount
          });
        });
      }
      
      // 🆕 4. 经营贷
      else if (debt.type === 'businessLoan' && debt.businessLoans) {
        debt.businessLoans.forEach((loan: any) => {
          if (!loan.entity) return;
          
          let remainingAmount = 0;
          
          // 对于等额本息/等额本金，优先使用 remainingPrincipal
          // 对于先息后本/一次性还本付息，使用 loanAmount
          const isEqualPayment = loan.repaymentMethod === 'equal-payment' || loan.repaymentMethod === 'equal-principal';
          const principalWan = parseFloat(isEqualPayment ? (loan.remainingPrincipal || loan.loanAmount || '0') : (loan.loanAmount || '0'));
          remainingAmount = principalWan * 10000; // 万元 → 元
          
          result.push({
            entity: loan.entity,
            code: 'ML-jy',
            initialValue: remainingAmount
          });
        });
      }
      
      // 🆕 5. 民间贷
      else if (debt.type === 'privateLoan' && debt.privateLoans) {
        debt.privateLoans.forEach((loan: any) => {
          if (!loan.entity) return;
          
          // 民间贷的 loanAmount 本身就是"剩余贷款本金"
          const principalWan = parseFloat(loan.loanAmount || '0');
          const remainingAmount = principalWan * 10000; // 万元 → 元
          
          result.push({
            entity: loan.entity,
            code: 'ML-gr',
            initialValue: remainingAmount
          });
        });
      }
      
      // 🆕 6. 信用卡
      else if (debt.type === 'creditCard' && debt.creditCards) {
        debt.creditCards.forEach((card: any) => {
          if (!card.entity) return;
          
          // 期初值 = 本期待还金额 + 未出账单金额（元）
          const currentYuan = parseFloat(card.currentAmount || '0'); // 元
          const unbilledYuan = parseFloat(card.unbilledAmount || '0'); // 元
          const remainingAmount = currentYuan + unbilledYuan; // 元
          
          result.push({
            entity: card.entity,
            code: 'ML-cc',
            initialValue: remainingAmount
          });
        });
      }
    });
    
  } catch (error) {
    console.error('❌ [数据适配] 生成负债 entity 期初值失败:', error);
  }
  
  return result;
}

/**
 * 生成资产按 entity 拆分的期初值
 * 返回单位：元
 * 🔧 后端改造：从数据库获取
 */
async function generateAssetInitialValuesByEntity(userId: number): Promise<Array<{
  entity: string;
  type: 'existing' | 'future';
  code: 'PA-Es' | 'PA-Veh';
  initialValue: number;
}>> {
  const result: Array<{
    entity: string;
    type: 'existing' | 'future';
    code: 'PA-Es' | 'PA-Veh';
    initialValue: number;
  }> = [];

  try {
    // 🔧 后端改造：从 Property 和 Vehicle 表获取
    const [properties, vehicles, housingPlan] = await Promise.all([
      prisma.property.findMany({ where: { userId } }),
      prisma.vehicle.findMany({ where: { userId } }),
      prisma.housingPlan.findUnique({ where: { userId } })
    ]);
    
    // 构建 houseConfigs 和 realEstateItems（严格要求：必须有持久化 entity）
    const houseConfigs = properties.map((p) => {
      if (!p.entity) {
        throw new Error(`现有房产(id=${p.id}, name=${p.name}) 缺少 entity，无法生成资产期初值`);
      }
      return {
      id: p.id,
        entity: p.entity,
      marketValue: p.marketValue
      };
    });
    const realEstateItems = properties.map(p => ({
      id: p.id,
      value: p.marketValue
    }));
    
    houseConfigs.forEach((house: any) => {
      const entity = house.entity;
      
      // 优先从 house.marketValue 获取，其次从 asset_data.items 匹配
      let initialValue = 0;
      if (house.marketValue) {
        initialValue = Number(house.marketValue) * 10000;  // 万元 → 元
      } else if (house.id && realEstateItems.length > 0) {
        const matchedItem = realEstateItems.find((item: any) => item.id === house.id);
        if (matchedItem && matchedItem.value) {
          initialValue = Number(matchedItem.value) * 10000;  // 万元 → 元
        }
      }
      
      result.push({
        entity,
        type: 'existing',
        code: 'PA-Es',
        initialValue
      });
    });
    
    // 2. 现有车辆（从数据库获取的 vehicles）
    vehicles.forEach((vehicle) => {
      if (!vehicle.entity) {
        throw new Error(`现有车辆(id=${vehicle.id}, name=${vehicle.name}) 缺少 entity，无法生成资产期初值`);
      }
      const entity = vehicle.entity;
      const initialValue = (vehicle.purchasePrice || 0) * 10000;  // 万元 → 元
      
      result.push({
        entity,
        type: 'existing',
        code: 'PA-Veh',
        initialValue
      });
    });
    
    // 3. 未来房产（从 HousingPlan.customConfigs 获取）
    const futureHousingConfigs = (housingPlan?.customConfigs as any[]) || [];
    futureHousingConfigs.forEach((config, index) => {
      const entity = config.entity;
      if (!entity) {
        throw new Error(`未来房产配置(index=${index}) 缺少 entity，无法生成资产期初值`);
      }
      result.push({
        entity,
        type: 'future',
        code: 'PA-Es',
        initialValue: 0  // 未来房产期初值为 0
      });
    });
    
    // 4. 未来车辆（从 CarPlan 获取）
    const carPlan = await prisma.carPlan.findUnique({ where: { userId } });
    const carConfigs = (carPlan?.carConfigs as any[]) || [];
    carConfigs.forEach((config, index) => {
      const entity = config.entity;
      if (!entity) {
        throw new Error(`未来车辆配置(index=${index}) 缺少 entity，无法生成资产期初值`);
      }
      // 只有未来购买的车辆才需要添加（避免与现有车辆 entity 重复）
      if (!vehicles.find(v => v.entity === entity)) {
        result.push({
          entity,
          type: 'future',
          code: 'PA-Veh',
          initialValue: 0  // 未来车辆期初值为 0
        });
      }
    });
    
  } catch (error) {
    console.error('❌ [数据适配] 生成资产 entity 期初值失败:', error);
  }
  
  return result;
}

/**
 * 映射债务类型代码
 */
function mapDebtTypeCode(debtType: string): string {
  const mapping: Record<string, string> = {
    'mortgage': 'ML-hl',
    'carLoan': 'ML-vl',
    'consumerLoan': 'ML-xf',
    'businessLoan': 'ML-jy',
    'privateLoan': 'ML-gr',
    'creditCard': 'ML-cc'
  };
  
  return mapping[debtType] || 'ML-qt';
}

/**
 * 获取默认资产数据
 */
function getDefaultAssetData(): AssetData {
  return {
    totalValue: 0,
    initialValues: {
      'FA-deph': 0, 'PA-Es': 0, 'PA-Veh': 0, 'PA-pl': 0,
      'PA-qt': 0, 'PA-gd': 0, 'PA-cl': 0, 'PA-jew': 0
    },
    initialValuesByEntity: []
  };
}

/**
 * 获取默认负债数据
 */
function getDefaultLiabilityData(): LiabilityData {
  return {
    totalValue: 0,
    liabilities: [],
    initialValues: {
      'ML-hl': 0, 'ML-vl': 0, 'ML-xf': 0,
      'ML-jy': 0, 'ML-gr': 0, 'ML-cc': 0
    },
    initialValuesByEntity: []
  };
}

// ⏸️ ==================== 保单数据适配（暂时不使用） ====================
// ==================== 🆕 保单数据适配（新增功能） ====================

/**
 * 🆕 适配保单数据（⏸️ 暂时禁用）
 * 输出单位：元
 */
/*
function adaptInsuranceData(): InsuranceData {
  try {
    console.log('📊 [数据适配-保单] 开始适配保单数据...');
    
    // 1. 读取保单数据
    const policyDataStr = localStorage.getItem('insurance_policy_data');
    if (!policyDataStr) {
      console.log('📊 [数据适配-保单] 未找到保单数据');
      return { policies: [] };
    }
    
    const policyData = JSON.parse(policyDataStr);
    
    // 2. 统一数据结构（兼容两种格式）
    let allPolicies: any[] = [];
    if (Array.isArray(policyData)) {
      allPolicies = policyData;
    } else if (typeof policyData === 'object' && policyData.policies) {
      allPolicies = policyData.policies;
    }
    
    // 3. 转换为标准格式
    const policies = allPolicies.map(policy => adaptSinglePolicy(policy));
    
    console.log(`✅ [数据适配-保单] 保单数据适配完成: ${policies.length}份保单`);
    
    // 📋 详细输出每份保单的完整结构
    policies.forEach((policy, index) => {
      const policyInfo: any = {
        '保单名称': policy.entity,
        '险种类型': policy.categoryCode,
        '被保险人': policy.insuredPerson,
        '受益人': policy.beneficiary,
        '年交保费': (policy.premiumAmount / 10000).toFixed(2) + '万元',
        '缴费结束年份': policy.paymentEndYear || '已完成缴费'
      };
      
      // 🆕 年金险显示已交保费
      if (policy.premiumPaid !== undefined) {
        policyInfo['🆕 已交保费'] = (policy.premiumPaid / 10000).toFixed(2) + '万元';
      }
      // 🆕 年金险显示已领金额汇总
      if (policy.totalBenefitReceived !== undefined) {
        policyInfo['🆕 已领金额汇总'] = (policy.totalBenefitReceived / 10000).toFixed(2) + '万元';
      }
      
      policyInfo['责任数量'] = policy.liabilities.length;
      
      console.log(`\n📄 [保单${index}] ${policy.entity}`, policyInfo);
      
      // 输出每个责任的详细信息
      policy.liabilities.forEach((liability, liabilityIndex) => {
        const liabilityInfo: any = {
          '责任类型': liability.type,
          '保障结束年份': liability.coverageEndYear,
          '是否可叠加': liability.stackable !== undefined ? liability.stackable : '未设置'
        };
        
        // 🆕 年金责任显示已领金额
        if (liability.benefitReceived !== undefined) {
          liabilityInfo['🆕 已领金额'] = (liability.benefitReceived / 10000).toFixed(2) + '万元';
        }
        
        liabilityInfo['保额阶段数'] = liability.coverageStages.length;
        
        console.log(`  ├─ [责任${liabilityIndex}] ${liability.type}`, liabilityInfo);
        
        // 输出每个保额阶段
        liability.coverageStages.forEach((stage, stageIndex) => {
          console.log(`    └─ [阶段${stageIndex}]`, {
            '起始年份': stage.startYear,
            '结束年份': stage.endYear,
            '基础保额': (stage.baseAmount / 10000).toFixed(2) + '万元'
          });
        });
      });
    });
    
    console.log('\n🎯 [数据适配-保单] 完整数据对象（可展开查看）:', policies);
    
    return { policies };
    
  } catch (error) {
    console.error('❌ [数据适配-保单] 保单数据适配失败:', error);
    return { policies: [] };
  }
}
*/

/**
 * 🆕 适配单个保单（⏸️ 暂时禁用）
 */
/*
function adaptSinglePolicy(policy: any): InsurancePolicy {
  try {
    // 1. 基础字段映射
    const entity = policy.productName || '未知保单';
    const categoryCode = mapPolicyTypeToCategory(policy.policyType);
    const insuredPerson = policy.insuredPerson || null;
    const beneficiary = policy.beneficiary || null;
    
    // 2. 计算年交保费
    const premiumAmount = calculatePremiumAmount(policy);
    
    // 3. 计算缴费结束年份
    const paymentEndYear = calculatePaymentEndYear(policy);
    
    // 4. 🆕 计算已交保费（仅年金险，单位：元）
    const premiumPaid = policy.policyType === 'annuity' 
      ? calculatePremiumPaid(policy)  // 元
      : undefined;
    
    // 5. 适配责任列表
    const liabilities = adaptLiabilities(policy);
    
    // 6. 🆕 计算已领金额汇总（仅年金险，单位：元）
    const totalBenefitReceived = policy.policyType === 'annuity'
      ? liabilities.reduce((sum, l) => sum + (l.benefitReceived || 0), 0)
      : undefined;
    
    const result: InsurancePolicy = {
      entity,
      categoryCode,
      insuredPerson,
      beneficiary,
      premiumAmount,
      paymentEndYear,
      liabilities
    };
    
    // 仅年金险添加专属字段
    if (premiumPaid !== undefined) {
      result.premiumPaid = premiumPaid;  // 元
    }
    if (totalBenefitReceived !== undefined) {
      result.totalBenefitReceived = totalBenefitReceived;  // 元
    }
    
    return result;
  } catch (error) {
    console.error(`❌ [数据适配-保单] 适配保单失败 (${policy.productName}):`, error);
    throw error;
  }
}
*/

/**
 * 🆕 映射保单类型到 category
 */
function mapPolicyTypeToCategory(policyType: string): string {
  const mapping: Record<string, string> = {
    'annuity': 'insurance-annuity',
    'life': 'insurance-life',
    'critical_illness': 'insurance-illness',
    'accident': 'insurance-accident'
  };
  
  return mapping[policyType] || `insurance-${policyType}`;
}

/**
 * 🆕 计算年交保费（⏸️ 暂时禁用）
 */
/*
function calculatePremiumAmount(policy: any): number {
  const policyType = policy.policyType;
  
  // 年金险
  if (policyType === 'annuity') {
    const currentYear = new Date().getFullYear();
    const isCompleted = (currentYear >= policy.policyStartYear + policy.paymentPeriod);
    
    if (isCompleted) {
      return 0;
    } else {
      return policy.annualPremium || 0;  // 元
    }
  }
  
  // 重疾险/意外险/人寿险
  if (policy.paymentCompleted === true) {
    return 0;
  } else {
    return policy.annualPremiumForOther || 0;  // 元
  }
}
*/

/**
 * 🆕 计算缴费结束年份（⏸️ 暂时禁用）
 */
/*
function calculatePaymentEndYear(policy: any): number | null {
  const policyType = policy.policyType;
  
  // 年金险
  if (policyType === 'annuity') {
    const currentYear = new Date().getFullYear();
    const isCompleted = (currentYear >= policy.policyStartYear + policy.paymentPeriod);
    
    if (isCompleted) {
      return null;  // 已完成
    } else {
      return policy.policyStartYear + policy.paymentPeriod;
    }
  }
  
  // 重疾险/意外险/人寿险
  if (policy.paymentCompleted === true) {
    return null;  // 已完成
  } else {
    const currentYear = new Date().getFullYear();
    return currentYear + (policy.remainingPaymentPeriod || 0);
  }
}
*/

/**
 * 🆕 计算已交保费（仅年金险）- 用于保单适配（⏸️ 暂时禁用）
 * 返回单位：元
 */
/*
function calculatePremiumPaid(policy: any): number {
  const currentYear = new Date().getFullYear();
  const startYear = policy.policyStartYear;
  const annualPremiumYuan = policy.annualPremium || 0;  // 元
  const paymentPeriod = policy.paymentPeriod || 0;  // 缴费期限（年）
  
  if (!startYear || !annualPremiumYuan) {
    return 0;
  }
  
  let premiumPaidYuan = 0;
  
  if (paymentPeriod === 0) {
    // 趸交：已缴保费 = 年度保费（实际是一次性总保费）
    premiumPaidYuan = annualPremiumYuan;
  } else {
    // 期交：已缴保费 = min(实际已过年数, 缴费期限) × 年度保费
    const actualYearsPaid = Math.max(0, currentYear - startYear);
    const effectiveYearsPaid = Math.min(actualYearsPaid, paymentPeriod);
    premiumPaidYuan = effectiveYearsPaid * annualPremiumYuan;
  }
  
  return premiumPaidYuan;  // 返回元
}
*/


/**
 * 🆕 计算已领金额（仅年金责任）（⏸️ 暂时禁用）
 * 返回单位：元
 */
/*
function calculateBenefitReceived(receivingPlan: any): number {
  // 判断是否已开始领取
  if (receivingPlan.hasStartedReceiving === true) {
    const totalReceivedAmount = receivingPlan.totalReceivedAmount || 0;  // 元
    return totalReceivedAmount;  // 返回元
  } else {
    return 0;
  }
}
*/

/**
 * 🆕 适配责任列表（⏸️ 暂时禁用）
 */
/*
function adaptLiabilities(policy: any): InsuranceLiability[] {
  try {
    const customReceivingPlan = policy.customReceivingPlan || [];
    
    if (customReceivingPlan.length === 0) {
      return [];
    }
    
    return customReceivingPlan.map((receivingPlan: any) => {
      // 1. 责任类型映射
      const type = mapReceivingType(receivingPlan.receivingType);
      
      // 2. 保障结束年份
      const coverageEndYear = getCoverageEndYear(policy, receivingPlan);
      
      // 3. 保额阶段列表
      const coverageStages = adaptCoverageStages(receivingPlan.coveragePeriods || []);
      
      // 4. 是否可叠加（stackable）
      const stackable = generateStackable(policy, type);
      
      // 5. 🆕 已领金额（仅年金责任）
      const benefitReceived = type === 'annuity' 
        ? calculateBenefitReceived(receivingPlan) 
        : undefined;
      
      const liability: InsuranceLiability = {
        type,
        coverageEndYear,
        coverageStages
      };
      
      // 只有在 stackable 有值时才添加此字段
      if (stackable !== undefined) {
        liability.stackable = stackable;
      }
      
      // 🆕 只有在 benefitReceived 有值时才添加此字段
      if (benefitReceived !== undefined) {
        liability.benefitReceived = benefitReceived;
      }
      
      return liability;
    });
    
  } catch (error) {
    console.error(`❌ [数据适配-保单] 适配责任列表失败:`, error);
    return [];
  }
}
*/

/**
 * 🆕 映射责任类型（⏸️ 暂时禁用）
 */
/*
function mapReceivingType(receivingType: string): LiabilityType {
  const mapping: Record<string, LiabilityType> = {
    'critical_illness': 'critical',
    'death': 'death',
    'accident': 'accident',
    'annuity': 'annuity'
  };
  
  return mapping[receivingType] || 'death';
}
*/

/**
 * 🆕 获取保障结束年份（⏸️ 暂时禁用）
 */
/*
function getCoverageEndYear(policy: any, receivingPlan: any): number | 'lifetime' {
  const policyType = policy.policyType;
  
  // 年金险：从 receivingPlan 的 endAge 获取
  if (policyType === 'annuity') {
    return receivingPlan.endAge || 'lifetime';
  }
  
  // 重疾险/意外险/人寿险：取所有 coveragePeriods 中 endAge 最大的
  const coveragePeriods = receivingPlan.coveragePeriods || [];
  if (coveragePeriods.length === 0) {
    return 'lifetime';
  }
  
  // 检查是否有 'lifetime'
  const hasLifetime = coveragePeriods.some((p: any) => p.endAge === 'lifetime');
  if (hasLifetime) {
    return 'lifetime';
  }
  
  // 取最大的数值年份
  const numericAges = coveragePeriods
    .map((p: any) => p.endAge)
    .filter((age: any) => typeof age === 'number');
  
  if (numericAges.length === 0) {
    return 'lifetime';
  }
  
  return Math.max(...numericAges);
}
*/

/**
 * 🆕 适配保额阶段列表（⏸️ 暂时禁用）
 */
/*
function adaptCoverageStages(coveragePeriods: any[]): CoverageStage[] {
  return coveragePeriods.map(period => ({
    startYear: period.startAge || 0,
    endYear: period.endAge || 'lifetime',
    baseAmount: period.amount || 0  // 元
  }));
}
*/

/**
 * 🆕 生成 stackable 字段（⏸️ 暂时禁用）
 * 只在多责任且为重疾/意外时返回值
 */
/*
function generateStackable(policy: any, currentType: LiabilityType): boolean | undefined {
  // 1. 获取保单中的所有责任类型
  const customReceivingPlan = policy.customReceivingPlan || [];
  const liabilityTypes = customReceivingPlan.map((p: any) => mapReceivingType(p.receivingType));
  
  // 2. 判断是否存在多责任
  const hasCritical = liabilityTypes.includes('critical');
  const hasDeath = liabilityTypes.includes('death');
  const hasAccident = liabilityTypes.includes('accident');
  
  const hasMultiLiabilities = 
    (hasCritical && hasDeath) ||  // 重疾+身故
    (hasAccident && hasDeath) ||  // 意外+身故
    (hasCritical && hasAccident && hasDeath); // 三者都有
  
  // 3. 如果不存在多责任，不传此字段
  if (!hasMultiLiabilities) {
    return undefined;
  }
  
  // 4. 对于重疾责任
  if (currentType === 'critical') {
    const rule = policy.receivingStackingRules?.deathAndCriticalIllness;
    if (rule === true) return true;
    if (rule === false) return false;
    return undefined;
  }
  
  // 5. 对于意外责任
  if (currentType === 'accident') {
    const rule = policy.receivingStackingRules?.deathAndAccident;
    if (rule === true) return true;
    if (rule === false) return false;
    return undefined;
  }
  
  // 6. 对于身故责任和年金责任，不传 stackable
  return undefined;
}

// ❌ 已删除重复的 calculateBenefitReceived 函数（在第1148行有正确版本）
// ⏸️ ====================================================================
*/


/**
 * 🆕 获取保障结束年份（⏸️ 暂时禁用）
 */
/*
function getCoverageEndYear(policy: any, receivingPlan: any): number | 'lifetime' {
  const policyType = policy.policyType;
  
  // 年金险：从 receivingPlan 的 endAge 获取
  if (policyType === 'annuity') {
    return receivingPlan.endAge || 'lifetime';
  }
  
  // 重疾险/意外险/人寿险：取所有 coveragePeriods 中 endAge 最大的
  const coveragePeriods = receivingPlan.coveragePeriods || [];
  if (coveragePeriods.length === 0) {
    return 'lifetime';
  }
  
  // 检查是否有 'lifetime'
  const hasLifetime = coveragePeriods.some((p: any) => p.endAge === 'lifetime');
  if (hasLifetime) {
    return 'lifetime';
  }
  
  // 取最大的数值年份
  const numericAges = coveragePeriods
    .map((p: any) => p.endAge)
    .filter((age: any) => typeof age === 'number');
  
  if (numericAges.length === 0) {
    return 'lifetime';
  }
  
  return Math.max(...numericAges);
}
*/

/**
 * 🆕 适配保额阶段列表（⏸️ 暂时禁用）
 */
/*
function adaptCoverageStages(coveragePeriods: any[]): CoverageStage[] {
  return coveragePeriods.map(period => ({
    startYear: period.startAge || 0,
    endYear: period.endAge || 'lifetime',
    baseAmount: period.amount || 0  // 元
  }));
}
*/

/**
 * 🆕 生成 stackable 字段（⏸️ 暂时禁用）
 * 只在多责任且为重疾/意外时返回值
 */
/*
function generateStackable(policy: any, currentType: LiabilityType): boolean | undefined {
  // 1. 获取保单中的所有责任类型
  const customReceivingPlan = policy.customReceivingPlan || [];
  const liabilityTypes = customReceivingPlan.map((p: any) => mapReceivingType(p.receivingType));
  
  // 2. 判断是否存在多责任
  const hasCritical = liabilityTypes.includes('critical');
  const hasDeath = liabilityTypes.includes('death');
  const hasAccident = liabilityTypes.includes('accident');
  
  const hasMultiLiabilities = 
    (hasCritical && hasDeath) ||  // 重疾+身故
    (hasAccident && hasDeath) ||  // 意外+身故
    (hasCritical && hasAccident && hasDeath); // 三者都有
  
  // 3. 如果不存在多责任，不传此字段
  if (!hasMultiLiabilities) {
    return undefined;
  }
  
  // 4. 对于重疾责任
  if (currentType === 'critical') {
    const rule = policy.receivingStackingRules?.deathAndCriticalIllness;
    if (rule === true) return true;
    if (rule === false) return false;
    return undefined;
  }
  
  // 5. 对于意外责任
  if (currentType === 'accident') {
    const rule = policy.receivingStackingRules?.deathAndAccident;
    if (rule === true) return true;
    if (rule === false) return false;
    return undefined;
  }
  
  // 6. 对于身故责任和年金责任，不传 stackable
  return undefined;
}

// ❌ 已删除重复的 calculateBenefitReceived 函数（在第1148行有正确版本）
// ⏸️ ====================================================================
*/


/**
 * 🆕 获取保障结束年份（⏸️ 暂时禁用）
 */
/*
function getCoverageEndYear(policy: any, receivingPlan: any): number | 'lifetime' {
  const policyType = policy.policyType;
  
  // 年金险：从 receivingPlan 的 endAge 获取
  if (policyType === 'annuity') {
    return receivingPlan.endAge || 'lifetime';
  }
  
  // 重疾险/意外险/人寿险：取所有 coveragePeriods 中 endAge 最大的
  const coveragePeriods = receivingPlan.coveragePeriods || [];
  if (coveragePeriods.length === 0) {
    return 'lifetime';
  }
  
  // 检查是否有 'lifetime'
  const hasLifetime = coveragePeriods.some((p: any) => p.endAge === 'lifetime');
  if (hasLifetime) {
    return 'lifetime';
  }
  
  // 取最大的数值年份
  const numericAges = coveragePeriods
    .map((p: any) => p.endAge)
    .filter((age: any) => typeof age === 'number');
  
  if (numericAges.length === 0) {
    return 'lifetime';
  }
  
  return Math.max(...numericAges);
}
*/

/**
 * 🆕 适配保额阶段列表（⏸️ 暂时禁用）
 */
/*
function adaptCoverageStages(coveragePeriods: any[]): CoverageStage[] {
  return coveragePeriods.map(period => ({
    startYear: period.startAge || 0,
    endYear: period.endAge || 'lifetime',
    baseAmount: period.amount || 0  // 元
  }));
}
*/

/**
 * 🆕 生成 stackable 字段（⏸️ 暂时禁用）
 * 只在多责任且为重疾/意外时返回值
 */
/*
function generateStackable(policy: any, currentType: LiabilityType): boolean | undefined {
  // 1. 获取保单中的所有责任类型
  const customReceivingPlan = policy.customReceivingPlan || [];
  const liabilityTypes = customReceivingPlan.map((p: any) => mapReceivingType(p.receivingType));
  
  // 2. 判断是否存在多责任
  const hasCritical = liabilityTypes.includes('critical');
  const hasDeath = liabilityTypes.includes('death');
  const hasAccident = liabilityTypes.includes('accident');
  
  const hasMultiLiabilities = 
    (hasCritical && hasDeath) ||  // 重疾+身故
    (hasAccident && hasDeath) ||  // 意外+身故
    (hasCritical && hasAccident && hasDeath); // 三者都有
  
  // 3. 如果不存在多责任，不传此字段
  if (!hasMultiLiabilities) {
    return undefined;
  }
  
  // 4. 对于重疾责任
  if (currentType === 'critical') {
    const rule = policy.receivingStackingRules?.deathAndCriticalIllness;
    if (rule === true) return true;
    if (rule === false) return false;
    return undefined;
  }
  
  // 5. 对于意外责任
  if (currentType === 'accident') {
    const rule = policy.receivingStackingRules?.deathAndAccident;
    if (rule === true) return true;
    if (rule === false) return false;
    return undefined;
  }
  
  // 6. 对于身故责任和年金责任，不传 stackable
  return undefined;
}

// ❌ 已删除重复的 calculateBenefitReceived 函数（在第1148行有正确版本）
// ⏸️ ====================================================================
*/

/**
 * 🆕 获取保障结束年份（⏸️ 暂时禁用）
 */
/*
function getCoverageEndYear(policy: any, receivingPlan: any): number | 'lifetime' {
  const policyType = policy.policyType;
  
  // 年金险：从 receivingPlan 的 endAge 获取
  if (policyType === 'annuity') {
    return receivingPlan.endAge || 'lifetime';
  }
  
  // 重疾险/意外险/人寿险：取所有 coveragePeriods 中 endAge 最大的
  const coveragePeriods = receivingPlan.coveragePeriods || [];
  if (coveragePeriods.length === 0) {
    return 'lifetime';
  }
  
  // 检查是否有 'lifetime'
  const hasLifetime = coveragePeriods.some((p: any) => p.endAge === 'lifetime');
  if (hasLifetime) {
    return 'lifetime';
  }
  
  // 取最大的数值年份
  const numericAges = coveragePeriods
    .map((p: any) => p.endAge)
    .filter((age: any) => typeof age === 'number');
  
  if (numericAges.length === 0) {
    return 'lifetime';
  }
  
  return Math.max(...numericAges);
}
*/

/**
 * 🆕 适配保额阶段列表（⏸️ 暂时禁用）
 */
/*
function adaptCoverageStages(coveragePeriods: any[]): CoverageStage[] {
  return coveragePeriods.map(period => ({
    startYear: period.startAge || 0,
    endYear: period.endAge || 'lifetime',
    baseAmount: period.amount || 0  // 元
  }));
}
*/

/**
 * 🆕 生成 stackable 字段（⏸️ 暂时禁用）
 * 只在多责任且为重疾/意外时返回值
 */
/*
function generateStackable(policy: any, currentType: LiabilityType): boolean | undefined {
  // 1. 获取保单中的所有责任类型
  const customReceivingPlan = policy.customReceivingPlan || [];
  const liabilityTypes = customReceivingPlan.map((p: any) => mapReceivingType(p.receivingType));
  
  // 2. 判断是否存在多责任
  const hasCritical = liabilityTypes.includes('critical');
  const hasDeath = liabilityTypes.includes('death');
  const hasAccident = liabilityTypes.includes('accident');
  
  const hasMultiLiabilities = 
    (hasCritical && hasDeath) ||  // 重疾+身故
    (hasAccident && hasDeath) ||  // 意外+身故
    (hasCritical && hasAccident && hasDeath); // 三者都有
  
  // 3. 如果不存在多责任，不传此字段
  if (!hasMultiLiabilities) {
    return undefined;
  }
  
  // 4. 对于重疾责任
  if (currentType === 'critical') {
    const rule = policy.receivingStackingRules?.deathAndCriticalIllness;
    if (rule === true) return true;
    if (rule === false) return false;
    return undefined;
  }
  
  // 5. 对于意外责任
  if (currentType === 'accident') {
    const rule = policy.receivingStackingRules?.deathAndAccident;
    if (rule === true) return true;
    if (rule === false) return false;
    return undefined;
  }
  
  // 6. 对于身故责任和年金责任，不传 stackable
  return undefined;
}

// ❌ 已删除重复的 calculateBenefitReceived 函数（在第1148行有正确版本）
// ⏸️ ====================================================================
*/


