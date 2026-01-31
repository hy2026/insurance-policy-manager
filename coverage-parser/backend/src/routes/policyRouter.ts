/**
 * 保单管理路由
 */

import { Router } from 'express';
import { policyStorage } from '../services/parser/storage/policyStorage';
import prisma from '../prisma';

const router = Router();

/**
 * 🔑 重新计算责任阶段的金额
 * 当投保信息改变时调用，重新计算 startAge、endAge 和 keyAmounts
 */
function recalculateTier(
  tier: any,
  birthYear: number,
  policyStartAge: number,
  endAge: number,
  basicSumInsuredWan: number,
  annualPremium: number,
  paymentPeriod: number | null
): any {
  // 更新年龄范围
  if (tier.startAge != null) {
    tier.startAge = policyStartAge;
  }
  if (tier.endAge != null) {
    tier.endAge = endAge;
  }

  // 重新计算 keyAmounts
  if (tier.keyAmounts && Array.isArray(tier.keyAmounts) && tier.formula) {
    const startAge = tier.startAge || policyStartAge;
    const tierEndAge = tier.endAge || endAge;
    const formula = tier.formula || '';
    const formulaType = tier.formulaType || 'fixed';

    const newKeyAmounts: any[] = [];

    for (let age = startAge; age <= tierEndAge; age++) {
      const year = birthYear + age;
      const policyYear = age - policyStartAge + 1; // 保单年度
      let amount = 0;

      // 根据公式类型计算金额
      if (formulaType === 'fixed' || formulaType === 'percentage') {
        // 尝试解析公式
        try {
          // 替换公式中的变量
          let evalFormula = formula
            .replace(/基本保额/g, String(basicSumInsuredWan))
            .replace(/年缴保费/g, String(annualPremium / 10000))
            .replace(/已交保费/g, String((annualPremium / 10000) * Math.min(policyYear, paymentPeriod || policyYear)))
            .replace(/保单年度/g, String(policyYear));

          // 处理百分比
          const percentMatch = evalFormula.match(/(\d+(?:\.\d+)?)\s*[%％]/);
          if (percentMatch) {
            const percent = parseFloat(percentMatch[1]) / 100;
            evalFormula = evalFormula.replace(/(\d+(?:\.\d+)?)\s*[%％]/, String(percent));
          }

          // 处理乘法
          if (evalFormula.includes('*') || evalFormula.includes('×')) {
            evalFormula = evalFormula.replace(/×/g, '*');
            const parts = evalFormula.split('*').map((p: string) => parseFloat(p.trim()));
            if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              amount = parts[0] * parts[1];
            }
          } else {
            // 尝试直接解析数字
            const numMatch = evalFormula.match(/[\d.]+/);
            if (numMatch) {
              amount = parseFloat(numMatch[0]);
            }
          }
        } catch (e) {
          // 公式解析失败，使用原来的金额
          const originalAmount = tier.keyAmounts.find((ka: any) => ka.age === age)?.amount;
          amount = originalAmount || tier.keyAmounts[0]?.amount || 0;
        }
      } else {
        // 无法解析的公式类型，保留原金额
        const originalAmount = tier.keyAmounts.find((ka: any) => ka.age === age)?.amount;
        amount = originalAmount || tier.keyAmounts[0]?.amount || 0;
      }

      newKeyAmounts.push({
        year,
        age,
        amount: Math.round(amount * 10000) / 10000 // 保留4位小数
      });
    }

    tier.keyAmounts = newKeyAmounts;
  } else if (tier.keyAmounts && Array.isArray(tier.keyAmounts)) {
    // 没有公式，使用模板金额
    const startAge = tier.startAge || policyStartAge;
    const tierEndAge = tier.endAge || endAge;
    const templateAmount = tier.keyAmounts[0]?.amount || 0;

    const newKeyAmounts = [];
    for (let age = startAge; age <= tierEndAge; age++) {
      newKeyAmounts.push({
        year: birthYear + age,
        age,
        amount: templateAmount
      });
    }
    tier.keyAmounts = newKeyAmounts;
  }

  return tier;
}

/**
 * 确保用户存在，如果不存在则创建默认用户
 * 如果指定的 userId 不存在，会创建一个新用户
 */
async function ensureUserExists(userId: number): Promise<number> {
  // 先检查指定的用户是否存在
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });
  
  if (user) {
    return userId;
  }
  
  // 如果指定的用户不存在，检查数据库中是否有任何用户
  const anyUser = await prisma.user.findFirst({
    orderBy: { id: 'asc' }
  });
  
  if (anyUser) {
    // 如果数据库中有用户，使用第一个用户的 id
    console.log(`警告：指定的 userId ${userId} 不存在，使用现有用户 id ${anyUser.id}`);
    return anyUser.id;
  }
  
  // 如果数据库中没有任何用户，创建第一个默认用户
  // 由于 id 是自增的，第一个用户的 id 会是 1
  const defaultUser = await prisma.user.create({
    data: {
      email: `user${userId}@default.com`,
      name: `默认用户`
    }
  });
  
  console.log(`创建了默认用户，id: ${defaultUser.id}`);
  return defaultUser.id;
}

// 获取保单列表
router.get('/', async (req, res) => {
  try {
    const { userId, entity, policyType } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '缺少 userId 参数'
      });
    }

    let policies;
    if (entity) {
      policies = await policyStorage.findByUserIdAndEntity(Number(userId), String(entity));
    } else if (policyType) {
      policies = await policyStorage.findByUserIdAndPolicyType(Number(userId), String(policyType));
    } else {
      policies = await policyStorage.findByUserId(Number(userId));
    }

    // 获取所有相关的产品信息（用于获取保险小类）
    const policyIdNumbers = policies
      .map((p: any) => p.policyIdNumber)
      .filter((id: string | null) => id);
    
    const productInfoMap: { [key: string]: string } = {};
    // 责任小类和责任大类映射: { policyIdNumber: { coverageName: { diseaseCategory, coverageType } } }
    const coverageCategoryMap: { [key: string]: { [key: string]: { diseaseCategory?: string; coverageType?: string } } } = {};
    
    if (policyIdNumbers.length > 0) {
      const products = await prisma.insuranceProduct.findMany({
        where: {
          policyId: { in: policyIdNumbers }
        },
        select: {
          policyId: true,
          productSubCategory: true
        }
      });
      
      products.forEach((p: any) => {
        if (p.policyId && p.productSubCategory) {
          productInfoMap[p.policyId] = p.productSubCategory;
        }
      });
      
      // 从责任库获取责任小类和责任大类
      const coverageLibraryItems = await prisma.insuranceCoverageLibrary.findMany({
        where: {
          policyIdNumber: { in: policyIdNumbers }
        },
        select: {
          policyIdNumber: true,
          coverageName: true,
          diseaseCategory: true,
          coverageType: true
        }
      });
      
      coverageLibraryItems.forEach((item: any) => {
        if (item.policyIdNumber && item.coverageName) {
          if (!coverageCategoryMap[item.policyIdNumber]) {
            coverageCategoryMap[item.policyIdNumber] = {};
          }
          coverageCategoryMap[item.policyIdNumber][item.coverageName] = {
            diseaseCategory: item.diseaseCategory,
            coverageType: item.coverageType
          };
        }
      });
    }

    // 转换数据格式以匹配前端期望的 Policy 类型
    const transformedPolicies = policies.map((policy: any) => {
      // 为每个coverage添加责任小类和责任大类
      const coveragesArray = Array.isArray(policy.coverages) ? policy.coverages : [];
      const coveragesWithCategory = coveragesArray.map((c: any) => {
        const policyId = policy.policyIdNumber;
        const coverageName = c.name;
        const categoryMap = policyId ? coverageCategoryMap[policyId] : null;
        const categoryInfo = categoryMap ? categoryMap[coverageName] : null;
        
        return {
          ...c,
          责任小类: categoryInfo?.diseaseCategory || null,
          责任大类: categoryInfo?.coverageType || null
        };
      });
      
      return {
        id: policy.id.toString(),
        insuranceCompany: policy.insuranceCompany,
        productName: policy.productName,
        policyType: policy.policyType,
        productSubCategory: policy.policyIdNumber ? productInfoMap[policy.policyIdNumber] : null,
        insuredPerson: policy.insuredPerson,
        birthYear: policy.birthYear,
        policyStartYear: policy.policyStartYear,
        coverageEndYear: policy.coverageEndYear === null ? 'lifetime' : policy.coverageEndYear,
        paymentPeriod: policy.paymentPeriod,
        totalPaymentPeriod: policy.paymentPeriod ? `${policy.paymentPeriod}年` : undefined,
        annualPremium: policy.annualPremium,
        basicSumInsured: policy.basicSumInsured,
        policyIdNumber: policy.policyIdNumber,
        coverages: coveragesWithCategory,
        createdAt: policy.createdAt,
        updatedAt: policy.updatedAt,
        policyInfo: {
          birthYear: policy.birthYear,
          policyStartYear: policy.policyStartYear,
          coverageEndYear: policy.coverageEndYear === null ? 'lifetime' : policy.coverageEndYear,
          basicSumInsured: policy.basicSumInsured,
          annualPremium: policy.annualPremium,
          totalPaymentPeriod: policy.paymentPeriod ? `${policy.paymentPeriod}年` : undefined,
        }
      };
    });

    res.json({
      success: true,
      data: transformedPolicies
    });
  } catch (error: any) {
    console.error('获取保单列表错误:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 获取单个保单
router.get('/:id', async (req, res) => {
  try {
    const policy = await policyStorage.findById(Number(req.params.id));
    
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: '保单不存在'
      });
    }

    // 获取产品小类
    let productSubCategory = null;
    if (policy.policyIdNumber) {
      const product = await prisma.insuranceProduct.findFirst({
        where: { policyId: policy.policyIdNumber },
        select: { productSubCategory: true }
      });
      productSubCategory = product?.productSubCategory || null;
    }

    // 从责任库获取责任小类和责任大类
    const coverageCategoryMap: { [key: string]: { diseaseCategory?: string; coverageType?: string } } = {};
    if (policy.policyIdNumber) {
      const coverageLibraryItems = await prisma.insuranceCoverageLibrary.findMany({
        where: { policyIdNumber: policy.policyIdNumber },
        select: {
          coverageName: true,
          diseaseCategory: true,
          coverageType: true
        }
      });
      
      coverageLibraryItems.forEach((item: any) => {
        if (item.coverageName) {
          coverageCategoryMap[item.coverageName] = {
            diseaseCategory: item.diseaseCategory,
            coverageType: item.coverageType
          };
        }
      });
    }

    // 为每个coverage添加责任小类和责任大类
    const coveragesArray = Array.isArray(policy.coverages) ? policy.coverages : [];
    const coveragesWithCategory = coveragesArray.map((c: any) => {
      const categoryInfo = coverageCategoryMap[c.name];
      return {
        ...c,
        责任小类: categoryInfo?.diseaseCategory || null,
        责任大类: categoryInfo?.coverageType || null
      };
    });

    // 转换数据格式以匹配前端期望的 Policy 类型
    const transformedPolicy = {
      id: policy.id.toString(),
      insuranceCompany: policy.insuranceCompany,
      productName: policy.productName,
      policyType: policy.policyType,
      productSubCategory: productSubCategory,
      insuredPerson: policy.insuredPerson,
      birthYear: policy.birthYear,
      policyStartYear: policy.policyStartYear,
      coverageEndYear: policy.coverageEndYear === null ? 'lifetime' : policy.coverageEndYear,
      paymentPeriod: policy.paymentPeriod,
      totalPaymentPeriod: policy.paymentPeriod ? `${policy.paymentPeriod}年` : undefined,
      annualPremium: policy.annualPremium,
      basicSumInsured: policy.basicSumInsured,
      policyIdNumber: policy.policyIdNumber,
      coverages: coveragesWithCategory,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
      // 同时保留 policyInfo 结构以兼容前端
      policyInfo: {
        birthYear: policy.birthYear,
        policyStartYear: policy.policyStartYear,
        coverageEndYear: policy.coverageEndYear === null ? 'lifetime' : policy.coverageEndYear,
        basicSumInsured: policy.basicSumInsured,
        annualPremium: policy.annualPremium,
        totalPaymentPeriod: policy.paymentPeriod ? `${policy.paymentPeriod}年` : undefined,
      }
    };

    res.json({
      success: true,
      data: transformedPolicy
    });
  } catch (error: any) {
    console.error('获取保单错误:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 创建保单
router.post('/', async (req, res) => {
  try {
    const rawData = req.body;
    
    // 数据转换：将前端数据格式转换为后端所需格式
    const policyData: any = {
      userId: rawData.userId || 1, // 默认 userId 为 1
      policyNumber: rawData.policyNumber,
      policyIdNumber: rawData.policyIdNumber, // 保单ID号（如：百年人寿[2020]疾病保险009号）
      insuranceCompany: rawData.insuranceCompany,
      productName: rawData.productName,
      policyType: rawData.policyType,
      // 如果前端没有传 entity，则使用 insuredPerson 作为 entity
      entity: rawData.entity || rawData.insuredPerson || '本人',
      insuredPerson: rawData.insuredPerson,
      policyHolder: rawData.policyHolder,
      beneficiary: rawData.beneficiary,
      policyStartYear: rawData.policyStartYear,
      birthYear: rawData.birthYear,
      basicSumInsured: rawData.basicSumInsured,
      annualPremium: rawData.annualPremium,
      paymentType: rawData.paymentType,
      // 处理 paymentPeriod：如果前端传的是 totalPaymentPeriod，需要转换
      // 如果传的是字符串如 "10年"，提取数字；如果是数字，直接使用；如果是 'lifetime'，设为 null
      paymentPeriod: (() => {
        const period = rawData.paymentPeriod || rawData.totalPaymentPeriod;
        if (!period || period === 'lifetime') return null;
        if (typeof period === 'number') return period;
        if (typeof period === 'string') {
          // 提取数字，如 "10年" -> 10
          const match = period.match(/\d+/);
          return match ? parseInt(match[0]) : null;
        }
        return null;
      })(),
      // 处理 coverageEndYear：如果是 'lifetime' 字符串，转换为 null
      coverageEndYear: rawData.coverageEndYear === 'lifetime' || rawData.coverageEndYear === null || rawData.coverageEndYear === undefined 
        ? null 
        : typeof rawData.coverageEndYear === 'string' 
          ? parseInt(rawData.coverageEndYear) 
          : rawData.coverageEndYear,
      coverages: rawData.coverages,
      source: rawData.source || 'manual',
      verified: rawData.verified || false,
      notes: rawData.notes,
    };

    // 验证必需字段
    if (!policyData.insuranceCompany) {
      return res.status(400).json({
        success: false,
        message: '缺少必需字段：insuranceCompany'
      });
    }
    if (!policyData.productName) {
      return res.status(400).json({
        success: false,
        message: '缺少必需字段：productName'
      });
    }
    if (!policyData.policyType) {
      return res.status(400).json({
        success: false,
        message: '缺少必需字段：policyType'
      });
    }
    if (!policyData.entity) {
      return res.status(400).json({
        success: false,
        message: '缺少必需字段：entity（或 insuredPerson）'
      });
    }
    if (!policyData.insuredPerson) {
      return res.status(400).json({
        success: false,
        message: '缺少必需字段：insuredPerson'
      });
    }
    if (!policyData.policyStartYear) {
      return res.status(400).json({
        success: false,
        message: '缺少必需字段：policyStartYear'
      });
    }

    // 确保用户存在（如果不存在则创建）
    const validUserId = await ensureUserExists(policyData.userId);
    policyData.userId = validUserId;

    const policy = await policyStorage.create(policyData);

    // 转换数据格式以匹配前端期望的 Policy 类型
    const transformedPolicy = {
      id: policy.id.toString(),
      insuranceCompany: policy.insuranceCompany,
      productName: policy.productName,
      policyType: policy.policyType,
      insuredPerson: policy.insuredPerson,
      birthYear: policy.birthYear,
      policyStartYear: policy.policyStartYear,
      coverageEndYear: policy.coverageEndYear === null ? 'lifetime' : policy.coverageEndYear,
      paymentPeriod: policy.paymentPeriod,
      totalPaymentPeriod: policy.paymentPeriod ? `${policy.paymentPeriod}年` : undefined,
      annualPremium: policy.annualPremium,
      basicSumInsured: policy.basicSumInsured,
      policyIdNumber: policy.policyIdNumber,
      coverages: policy.coverages || [],
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
      // 同时保留 policyInfo 结构以兼容前端
      policyInfo: {
        birthYear: policy.birthYear,
        policyStartYear: policy.policyStartYear,
        coverageEndYear: policy.coverageEndYear === null ? 'lifetime' : policy.coverageEndYear,
        basicSumInsured: policy.basicSumInsured,
        annualPremium: policy.annualPremium,
        totalPaymentPeriod: policy.paymentPeriod ? `${policy.paymentPeriod}年` : undefined,
      }
    };

    res.json({
      success: true,
      data: transformedPolicy
    });
  } catch (error: any) {
    console.error('创建保单错误:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 更新保单
router.put('/:id', async (req, res) => {
  try {
    const rawData = req.body;
    const id = Number(req.params.id);
    
    // 先获取当前保单信息，用于判断是否需要重新计算
    const currentPolicy = await policyStorage.findById(id);
    if (!currentPolicy) {
      return res.status(404).json({ success: false, message: '保单不存在' });
    }
    
    // 数据转换：将前端数据格式转换为后端所需格式
    const updateData: any = {};
    
    if (rawData.policyNumber !== undefined) updateData.policyNumber = rawData.policyNumber;
    if (rawData.policyIdNumber !== undefined) updateData.policyIdNumber = rawData.policyIdNumber;
    if (rawData.insuranceCompany !== undefined) updateData.insuranceCompany = rawData.insuranceCompany;
    if (rawData.productName !== undefined) updateData.productName = rawData.productName;
    if (rawData.policyType !== undefined) updateData.policyType = rawData.policyType;
    // 如果前端没有传 entity，但传了 insuredPerson，则使用 insuredPerson 作为 entity
    if (rawData.entity !== undefined) {
      updateData.entity = rawData.entity;
    } else if (rawData.insuredPerson !== undefined) {
      updateData.entity = rawData.insuredPerson;
    }
    if (rawData.insuredPerson !== undefined) updateData.insuredPerson = rawData.insuredPerson;
    if (rawData.policyHolder !== undefined) updateData.policyHolder = rawData.policyHolder;
    if (rawData.beneficiary !== undefined) updateData.beneficiary = rawData.beneficiary;
    if (rawData.policyStartYear !== undefined) updateData.policyStartYear = rawData.policyStartYear;
    if (rawData.birthYear !== undefined) updateData.birthYear = rawData.birthYear;
    if (rawData.basicSumInsured !== undefined) updateData.basicSumInsured = rawData.basicSumInsured;
    if (rawData.annualPremium !== undefined) updateData.annualPremium = rawData.annualPremium;
    if (rawData.paymentType !== undefined) updateData.paymentType = rawData.paymentType;
    // 处理 paymentPeriod：如果前端传的是 totalPaymentPeriod，需要转换
    if (rawData.paymentPeriod !== undefined || rawData.totalPaymentPeriod !== undefined) {
      const period = rawData.paymentPeriod || rawData.totalPaymentPeriod;
      if (period === 'lifetime' || period === null || period === undefined) {
        updateData.paymentPeriod = null;
      } else if (typeof period === 'number') {
        updateData.paymentPeriod = period;
      } else if (typeof period === 'string') {
        // 提取数字，如 "10年" -> 10
        const match = period.match(/\d+/);
        updateData.paymentPeriod = match ? parseInt(match[0]) : null;
      }
    }
    // 处理 coverageEndYear：如果是 'lifetime' 字符串，转换为 null
    if (rawData.coverageEndYear !== undefined) {
      updateData.coverageEndYear = rawData.coverageEndYear === 'lifetime' || rawData.coverageEndYear === null
        ? null 
        : typeof rawData.coverageEndYear === 'string' 
          ? parseInt(rawData.coverageEndYear) 
          : rawData.coverageEndYear;
    }
    if (rawData.coverages !== undefined) updateData.coverages = rawData.coverages;
    if (rawData.source !== undefined) updateData.source = rawData.source;
    if (rawData.verified !== undefined) updateData.verified = rawData.verified;
    if (rawData.notes !== undefined) updateData.notes = rawData.notes;

    // 🔑 检查投保信息是否改变，需要重新计算责任
    const needsRecalculation = 
      (updateData.birthYear !== undefined && updateData.birthYear !== currentPolicy.birthYear) ||
      (updateData.policyStartYear !== undefined && updateData.policyStartYear !== currentPolicy.policyStartYear) ||
      (updateData.coverageEndYear !== undefined && updateData.coverageEndYear !== currentPolicy.coverageEndYear) ||
      (updateData.basicSumInsured !== undefined && updateData.basicSumInsured !== currentPolicy.basicSumInsured) ||
      (updateData.annualPremium !== undefined && updateData.annualPremium !== currentPolicy.annualPremium) ||
      (updateData.paymentPeriod !== undefined && updateData.paymentPeriod !== currentPolicy.paymentPeriod);

    // 🔑 如果投保信息改变且有责任数据，重新计算责任的赔付阶段
    if (needsRecalculation && (updateData.coverages || currentPolicy.coverages)) {
      const newBirthYear = updateData.birthYear ?? currentPolicy.birthYear;
      const newPolicyStartYear = updateData.policyStartYear ?? currentPolicy.policyStartYear;
      const newCoverageEndYear = updateData.coverageEndYear ?? currentPolicy.coverageEndYear;
      const newBasicSumInsured = updateData.basicSumInsured ?? currentPolicy.basicSumInsured;
      const newAnnualPremium = updateData.annualPremium ?? currentPolicy.annualPremium;
      const newPaymentPeriod = updateData.paymentPeriod ?? currentPolicy.paymentPeriod;

      // 计算新的年龄范围
      const newPolicyStartAge = newPolicyStartYear - newBirthYear;
      const newEndAge = newCoverageEndYear === null ? 100 : newCoverageEndYear - newBirthYear;
      const basicSumInsuredWan = newBasicSumInsured / 10000;

      let coverages = (updateData.coverages || currentPolicy.coverages) as any[];
      
      if (coverages && Array.isArray(coverages)) {
        coverages = coverages.map(coverage => {
          // 🔑 更新 parseResult 中的 tiers
          if (coverage.parseResult?.payoutAmount?.details?.tiers) {
            coverage.parseResult.payoutAmount.details.tiers = coverage.parseResult.payoutAmount.details.tiers.map((tier: any) => {
              return recalculateTier(tier, newBirthYear, newPolicyStartAge, newEndAge, basicSumInsuredWan, newAnnualPremium, newPaymentPeriod);
            });
          }
          // 🔑 更新 result 中的 tiers
          if (coverage.result?.payoutAmount?.details?.tiers) {
            coverage.result.payoutAmount.details.tiers = coverage.result.payoutAmount.details.tiers.map((tier: any) => {
              return recalculateTier(tier, newBirthYear, newPolicyStartAge, newEndAge, basicSumInsuredWan, newAnnualPremium, newPaymentPeriod);
            });
          }
          return coverage;
        });
        
        updateData.coverages = coverages;
      }
    }

    const policy = await policyStorage.update(id, updateData);

    // 转换数据格式以匹配前端期望的 Policy 类型
    const transformedPolicy = {
      id: policy.id.toString(),
      insuranceCompany: policy.insuranceCompany,
      productName: policy.productName,
      policyType: policy.policyType,
      insuredPerson: policy.insuredPerson,
      birthYear: policy.birthYear,
      policyStartYear: policy.policyStartYear,
      coverageEndYear: policy.coverageEndYear === null ? 'lifetime' : policy.coverageEndYear,
      paymentPeriod: policy.paymentPeriod,
      totalPaymentPeriod: policy.paymentPeriod ? `${policy.paymentPeriod}年` : undefined,
      annualPremium: policy.annualPremium,
      basicSumInsured: policy.basicSumInsured,
      policyIdNumber: policy.policyIdNumber,
      coverages: policy.coverages || [],
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
      // 同时保留 policyInfo 结构以兼容前端
      policyInfo: {
        birthYear: policy.birthYear,
        policyStartYear: policy.policyStartYear,
        coverageEndYear: policy.coverageEndYear === null ? 'lifetime' : policy.coverageEndYear,
        basicSumInsured: policy.basicSumInsured,
        annualPremium: policy.annualPremium,
        totalPaymentPeriod: policy.paymentPeriod ? `${policy.paymentPeriod}年` : undefined,
      }
    };

    res.json({
      success: true,
      data: transformedPolicy
    });
  } catch (error: any) {
    console.error('更新保单错误:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 删除保单
router.delete('/:id', async (req, res) => {
  try {
    await policyStorage.delete(Number(req.params.id));

    res.json({
      success: true,
      message: '删除成功'
    });
  } catch (error: any) {
    console.error('删除保单错误:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export { router as policyRouter };

