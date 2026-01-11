/**
 * 保单管理路由
 */

import { Router } from 'express';
import { policyStorage } from '../services/parser/storage/policyStorage';
import prisma from '../prisma';

const router = Router();

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

    // 转换数据格式以匹配前端期望的 Policy 类型
    const transformedPolicies = policies.map((policy: any) => ({
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
    }));

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
    
    // 数据转换：将前端数据格式转换为后端所需格式
    const updateData: any = {};
    
    if (rawData.policyNumber !== undefined) updateData.policyNumber = rawData.policyNumber;
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

