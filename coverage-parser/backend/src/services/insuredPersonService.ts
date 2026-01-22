/**
 * 被保险人服务
 * 处理被保险人信息的创建、查询、冲突检测等
 */

import prisma from '../prisma';

export interface PersonInfoInput {
  userId: number;
  entity: string;  // 本人/配偶/孩子
  birthYear: number;
  name?: string;
  gender?: string;
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  existingPerson?: {
    id: number;
    entity: string;
    birthYear: number;
    name?: string | null;
    gender?: string | null;
  };
  changes?: {
    birthYear?: { old: number; new: number };
    name?: { old: string | null; new: string };
    gender?: { old: string | null; new: string };
  };
  policyCount?: number;
}

/**
 * 检测人员信息是否与已有记录冲突
 * 优先以保单中的 birthYear 为准
 */
export async function checkPersonInfoConflict(
  personInfo: PersonInfoInput
): Promise<ConflictCheckResult> {
  const { userId, entity, birthYear, name, gender } = personInfo;

  // 先查找已有的被保险人记录
  const existingPerson = await prisma.insuredPerson.findFirst({
    where: { userId, entity },
  });

  // 查找该用户该 entity 下所有保单中的 birthYear（以保单为准）
  const policiesWithBirthYear = await prisma.insurancePolicyParsed.findMany({
    where: {
      userId,
      insuredPerson: entity,
      birthYear: { not: null },
    },
    select: { birthYear: true, id: true },
    orderBy: { createdAt: 'desc' }, // 最新的保单优先
  });

  // 统计关联保单数量
  const policyCount = policiesWithBirthYear.length;

  // 如果有保单记录，以最新保单的 birthYear 为准
  const policyBirthYear = policiesWithBirthYear.length > 0 
    ? policiesWithBirthYear[0].birthYear 
    : null;

  // 判断冲突：如果保单中有 birthYear，且与输入不同，则有冲突
  if (policyBirthYear !== null && policyBirthYear !== birthYear) {
    return {
      hasConflict: true,
      existingPerson: existingPerson ? {
        id: existingPerson.id,
        entity: existingPerson.entity,
        birthYear: policyBirthYear, // 使用保单中的 birthYear
        name: existingPerson.name,
        gender: existingPerson.gender,
      } : undefined,
      changes: {
        birthYear: { old: policyBirthYear, new: birthYear },
      },
      policyCount,
    };
  }

  // 如果没有保单记录但有被保险人记录，检查是否冲突
  if (existingPerson && existingPerson.birthYear !== birthYear) {
    return {
      hasConflict: true,
      existingPerson: {
        id: existingPerson.id,
        entity: existingPerson.entity,
        birthYear: existingPerson.birthYear,
        name: existingPerson.name,
        gender: existingPerson.gender,
      },
      changes: {
        birthYear: { old: existingPerson.birthYear, new: birthYear },
      },
      policyCount,
    };
  }

  // 无冲突
  return {
    hasConflict: false,
    existingPerson: existingPerson ? {
      id: existingPerson.id,
      entity: existingPerson.entity,
      birthYear: existingPerson.birthYear,
      name: existingPerson.name,
      gender: existingPerson.gender,
    } : undefined,
    policyCount,
  };
}

/**
 * 获取或创建被保险人记录
 */
export async function getOrCreateInsuredPerson(
  personInfo: PersonInfoInput
): Promise<{ id: number; isNew: boolean }> {
  const { userId, entity, birthYear, name, gender } = personInfo;

  // 查找已有记录
  const existing = await prisma.insuredPerson.findFirst({
    where: { userId, entity },
  });

  if (existing) {
    // 如果已存在，更新信息
    await prisma.insuredPerson.update({
      where: { id: existing.id },
      data: {
        birthYear,
        ...(name && { name }),
        ...(gender && { gender }),
        updatedAt: new Date(),
      },
    });
    return { id: existing.id, isNew: false };
  }

  // 创建新记录
  const newPerson = await prisma.insuredPerson.create({
    data: {
      userId,
      entity,
      birthYear,
      name,
      gender,
    },
  });

  return { id: newPerson.id, isNew: true };
}

/**
 * 更新被保险人信息并同步到所有关联保单
 */
export async function updateInsuredPersonGlobally(
  personId: number,
  updates: { birthYear?: number; name?: string; gender?: string }
): Promise<{ updatedPerson: any; affectedPolicies: number }> {
  // 获取当前被保险人信息
  const person = await prisma.insuredPerson.findUnique({
    where: { id: personId },
  });

  if (!person) {
    throw new Error('被保险人不存在');
  }

  // 更新被保险人记录
  const updatedPerson = await prisma.insuredPerson.update({
    where: { id: personId },
    data: {
      ...updates,
      updatedAt: new Date(),
    },
  });

  // 如果更新了 birthYear，同步到所有关联保单
  let affectedPolicies = 0;
  if (updates.birthYear && updates.birthYear !== person.birthYear) {
    const result = await prisma.insurancePolicyParsed.updateMany({
      where: { insuredPersonId: personId },
      data: { birthYear: updates.birthYear },
    });
    affectedPolicies = result.count;
  }

  return { updatedPerson, affectedPolicies };
}
