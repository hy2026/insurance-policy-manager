/**
 * 保单数据访问层
 * 
 * 职责：封装保单的 CRUD 操作
 */

import prisma from '../../../prisma';

export interface PolicyCreateInput {
  userId: number;
  policyNumber?: string;
  insuranceCompany: string;
  productName: string;
  policyType: string;
  entity: string;
  insuredPerson: string;
  policyHolder?: string;
  beneficiary?: string;
  policyStartYear: number;
  birthYear?: number;
  basicSumInsured?: number;
  annualPremium?: number;
  paymentType?: string;
  paymentPeriod?: number;
  coverageEndYear?: number;
  coverages?: any;
  source?: string;
  verified?: boolean;
  notes?: string;
}

export interface PolicyUpdateInput {
  policyNumber?: string;
  insuranceCompany?: string;
  productName?: string;
  policyType?: string;
  entity?: string;
  insuredPerson?: string;
  policyHolder?: string;
  beneficiary?: string;
  policyStartYear?: number;
  birthYear?: number;
  basicSumInsured?: number;
  annualPremium?: number;
  paymentType?: string;
  paymentPeriod?: number;
  coverageEndYear?: number;
  coverages?: any;
  source?: string;
  verified?: boolean;
  notes?: string;
}

export class PolicyStorage {
  /**
   * 创建保单
   */
  async create(data: PolicyCreateInput) {
    return await prisma.insurancePolicyParsed.create({
      data
    });
  }

  /**
   * 根据 ID 查询保单
   */
  async findById(id: number) {
    return await prisma.insurancePolicyParsed.findUnique({
      where: { id }
    });
  }

  /**
   * 根据用户 ID 查询所有保单
   */
  async findByUserId(userId: number) {
    return await prisma.insurancePolicyParsed.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * 根据用户 ID 和主体查询保单
   */
  async findByUserIdAndEntity(userId: number, entity: string) {
    return await prisma.insurancePolicyParsed.findMany({
      where: { userId, entity },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * 根据用户 ID 和险种查询保单
   */
  async findByUserIdAndPolicyType(userId: number, policyType: string) {
    return await prisma.insurancePolicyParsed.findMany({
      where: { userId, policyType },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * 根据保单号查询
   */
  async findByPolicyNumber(policyNumber: string) {
    return await prisma.insurancePolicyParsed.findFirst({
      where: { policyNumber }
    });
  }

  /**
   * 更新保单
   */
  async update(id: number, data: PolicyUpdateInput) {
    return await prisma.insurancePolicyParsed.update({
      where: { id },
      data
    });
  }

  /**
   * 删除保单
   */
  async delete(id: number) {
    return await prisma.insurancePolicyParsed.delete({
      where: { id }
    });
  }

  /**
   * 统计用户的保单数量
   */
  async countByUserId(userId: number) {
    return await prisma.insurancePolicyParsed.count({
      where: { userId }
    });
  }
}

// 导出单例
export const policyStorage = new PolicyStorage();

