import { Router, Request, Response } from 'express';
import {
  checkPersonInfoConflict,
  getOrCreateInsuredPerson,
  updateInsuredPersonGlobally,
  PersonInfoInput,
} from '../services/insuredPersonService';
import prisma from '../prisma';

const router = Router();

/**
 * 确保用户存在（避免 insured_persons.userId 外键失败）
 */
async function ensureUserExists(userId: number): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user) return userId;

  const anyUser = await prisma.user.findFirst({ orderBy: { id: 'asc' } });
  if (anyUser) {
    console.log(`警告：指定的 userId ${userId} 不存在，使用现有用户 id ${anyUser.id}`);
    return anyUser.id;
  }

  const defaultUser = await prisma.user.create({
    data: {
      email: `user${userId}@default.com`,
      name: '默认用户',
    },
  });
  console.log(`创建了默认用户，id: ${defaultUser.id}`);
  return defaultUser.id;
}

/**
 * GET /api/insured-persons
 * 获取用户的所有家庭成员
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.query.userId as string);
    
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ error: '缺少有效的 userId 参数' });
    }

    const members = await prisma.insuredPerson.findMany({
      where: { userId },
      include: {
        _count: {
          select: { policies: true }
        }
      },
      orderBy: [
        { entity: 'asc' },
        { createdAt: 'asc' }
      ]
    });

    // 转换格式，添加保单数量
    const result = members.map(m => ({
      id: m.id,
      userId: m.userId,
      entity: m.entity,
      birthYear: m.birthYear,
      gender: m.gender,
      name: m.name,
      policyCount: m._count.policies,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt
    }));

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('获取家庭成员列表失败:', error);
    res.status(500).json({ error: '获取家庭成员列表失败', message: error.message });
  }
});

/**
 * POST /api/insured-persons
 * 创建新的家庭成员
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { userId, entity, birthYear, gender, name } = req.body;

    if (!userId || !entity || !birthYear || !gender) {
      return res.status(400).json({ 
        error: '缺少必填字段: userId, entity, birthYear, gender' 
      });
    }

    const validUserId = await ensureUserExists(Number(userId));

    // 检查是否已存在相同的家庭成员
    const existing = await prisma.insuredPerson.findFirst({
      where: { userId: validUserId, entity, birthYear }
    });

    if (existing) {
      return res.status(400).json({ 
        error: '该家庭成员已存在',
        existingId: existing.id 
      });
    }

    const newMember = await prisma.insuredPerson.create({
      data: {
        userId: validUserId,
        entity,
        birthYear,
        gender,
        name
      }
    });

    res.json({ success: true, data: newMember });
  } catch (error: any) {
    console.error('创建家庭成员失败:', error);
    res.status(500).json({ error: '创建家庭成员失败', message: error.message });
  }
});

/**
 * PUT /api/insured-persons/:id
 * 更新家庭成员信息
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { entity, birthYear, gender, name } = req.body;

    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 id' });
    }

    // 先获取当前成员信息，用于后续更新旧保单
    const currentMember = await prisma.insuredPerson.findUnique({
      where: { id }
    });

    if (!currentMember) {
      return res.status(404).json({ error: '家庭成员不存在' });
    }

    const updatedMember = await prisma.insuredPerson.update({
      where: { id },
      data: {
        ...(entity && { entity }),
        ...(birthYear && { birthYear }),
        ...(gender && { gender }),
        ...(name !== undefined && { name }),
        updatedAt: new Date()
      }
    });

    // 同时更新关联保单的 birthYear 和 coverages 中的年龄
    if (birthYear && birthYear !== currentMember.birthYear) {
      const oldBirthYear = currentMember.birthYear;
      const birthYearDiff = birthYear - oldBirthYear;
      
      // 获取所有需要更新的保单
      const policiesToUpdate = await prisma.insurancePolicyParsed.findMany({
        where: {
          OR: [
            { insuredPersonId: id },
            { 
              userId: currentMember.userId,
              insuredPerson: currentMember.entity,
              insuredPersonId: null
            }
          ]
        }
      });
      
      console.log(`找到 ${policiesToUpdate.length} 份需要更新的保单`);
      
      // 逐个更新保单
      for (const policy of policiesToUpdate) {
        let coverages = policy.coverages as any[];
        
        // 获取保单信息用于重新计算
        const policyStartYear = policy.policyStartYear;
        const coverageEndYear = policy.coverageEndYear; // null 表示终身
        const newPolicyStartAge = policyStartYear - birthYear;
        // 终身保障固定100岁，否则根据保障结束年份计算
        const newEndAge = coverageEndYear === null ? 100 : coverageEndYear - birthYear;
        
        // 🔑 更新tiers的辅助函数
        const updateTiers = (tiers: any[]) => {
          return tiers.map((tier: any) => {
            // 🔑 重新计算 startAge：使用新的投保年龄
            if (tier.startAge != null) {
              tier.startAge = newPolicyStartAge;
            }
            // 🔑 重新计算 endAge：终身=100岁，否则根据保障结束年份计算
            if (tier.endAge != null) {
              tier.endAge = newEndAge;
            }
            
            // 重新生成 keyAmounts（根据新的年龄范围）
            if (tier.keyAmounts && Array.isArray(tier.keyAmounts)) {
              const startAge = tier.startAge || newPolicyStartAge;
              const endAge = tier.endAge || newEndAge;
              
              // 保留第一个金额作为模板
              const templateAmount = tier.keyAmounts[0]?.amount || 0;
              
              // 重新生成每年的金额
              const newKeyAmounts = [];
              for (let age = startAge; age <= endAge; age++) {
                newKeyAmounts.push({
                  year: birthYear + age,
                  age: age,
                  amount: templateAmount
                });
              }
              tier.keyAmounts = newKeyAmounts;
            }
            return tier;
          });
        };
        
        if (coverages && Array.isArray(coverages)) {
          // 更新每个 coverage 中的年龄范围和 keyAmounts
          coverages = coverages.map(coverage => {
            // 🔑 同时处理 parseResult 和 result 两种数据结构
            if (coverage.parseResult?.payoutAmount?.details?.tiers) {
              coverage.parseResult.payoutAmount.details.tiers = updateTiers(coverage.parseResult.payoutAmount.details.tiers);
            }
            if (coverage.result?.payoutAmount?.details?.tiers) {
              coverage.result.payoutAmount.details.tiers = updateTiers(coverage.result.payoutAmount.details.tiers);
            }
            return coverage;
          });
        }
        
        // 更新保单
        await prisma.insurancePolicyParsed.update({
          where: { id: policy.id },
          data: {
            birthYear,
            insuredPersonId: id,
            coverages: coverages,
            updatedAt: new Date()
          }
        });
      }
      
      console.log(`成功更新 ${policiesToUpdate.length} 份保单的出生年份和理赔年龄`);
    }

    res.json({ success: true, data: updatedMember });
  } catch (error: any) {
    console.error('更新家庭成员失败:', error);
    res.status(500).json({ error: '更新家庭成员失败', message: error.message });
  }
});

/**
 * DELETE /api/insured-persons/:id
 * 删除家庭成员（仅当没有关联保单时）
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 id' });
    }

    // 检查是否有关联保单
    const policyCount = await prisma.insurancePolicyParsed.count({
      where: { insuredPersonId: id }
    });

    if (policyCount > 0) {
      return res.status(400).json({ 
        error: `无法删除：该成员有 ${policyCount} 份关联保单，请先删除保单` 
      });
    }

    await prisma.insuredPerson.delete({
      where: { id }
    });

    res.json({ success: true, message: '删除成功' });
  } catch (error: any) {
    console.error('删除家庭成员失败:', error);
    res.status(500).json({ error: '删除家庭成员失败', message: error.message });
  }
});

/**
 * POST /api/insured-persons/check-conflict
 * 检测人员信息冲突
 * 
 * Body: {
 *   userId: number;
 *   entity: string;  // 本人/配偶/孩子
 *   birthYear: number;
 *   name?: string;
 *   gender?: string;
 * }
 * 
 * Response: {
 *   hasConflict: boolean;
 *   existingPerson?: {...};
 *   changes?: {...};
 * }
 */
router.post('/check-conflict', async (req: Request, res: Response) => {
  try {
    const personInfo: PersonInfoInput = req.body;

    // 验证必填字段
    if (!personInfo.userId || !personInfo.entity || !personInfo.birthYear) {
      return res.status(400).json({
        error: '缺少必填字段: userId, entity, birthYear',
      });
    }

    const result = await checkPersonInfoConflict(personInfo);
    res.json(result);
  } catch (error: any) {
    console.error('检测人员信息冲突失败:', error);
    res.status(500).json({
      error: '检测人员信息冲突失败',
      message: error.message,
    });
  }
});

/**
 * POST /api/insured-persons/get-or-create
 * 获取或创建被保险人记录
 * 
 * Body: {
 *   userId: number;
 *   entity: string;
 *   birthYear: number;
 *   name?: string;
 *   gender?: string;
 * }
 * 
 * Response: {
 *   id: number;
 *   isNew: boolean;
 * }
 */
router.post('/get-or-create', async (req: Request, res: Response) => {
  try {
    const personInfo: PersonInfoInput = req.body;

    if (!personInfo.userId || !personInfo.entity || !personInfo.birthYear) {
      return res.status(400).json({
        error: '缺少必填字段: userId, entity, birthYear',
      });
    }

    // 确保用户存在，避免外键失败
    personInfo.userId = await ensureUserExists(personInfo.userId);

    const result = await getOrCreateInsuredPerson(personInfo);
    res.json(result);
  } catch (error: any) {
    console.error('获取或创建被保险人记录失败:', error);
    res.status(500).json({
      error: '获取或创建被保险人记录失败',
      message: error.message,
    });
  }
});

/**
 * PUT /api/insured-persons/:id/update-globally
 * 更新被保险人信息（影响所有关联保单）
 * 
 * Body: {
 *   birthYear?: number;
 *   name?: string;
 *   gender?: string;
 * }
 * 
 * Response: {
 *   updatedPerson: {...};
 *   affectedPolicies: number;
 * }
 */
router.put('/:id/update-globally', async (req: Request, res: Response) => {
  try {
    const personId = parseInt(req.params.id);
    const updates = req.body;

    if (isNaN(personId)) {
      return res.status(400).json({ error: '无效的personId' });
    }

    const result = await updateInsuredPersonGlobally(personId, updates);
    res.json(result);
  } catch (error: any) {
    console.error('更新被保险人信息失败:', error);
    res.status(500).json({
      error: '更新被保险人信息失败',
      message: error.message,
    });
  }
});

export default router;






