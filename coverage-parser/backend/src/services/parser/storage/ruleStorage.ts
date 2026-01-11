/**
 * 解析规则数据访问层
 * 
 * 职责：封装解析规则的 CRUD 操作
 */

import prisma from '../../../prisma';

export interface RuleCreateInput {
  ruleType: string;
  pattern: string;
  extraction: any;
  priority?: number;
  enabled?: boolean;
}

export interface RuleUpdateInput {
  ruleType?: string;
  pattern?: string;
  extraction?: any;
  priority?: number;
  enabled?: boolean;
  successRate?: number;
}

export class RuleStorage {
  /**
   * 创建规则
   */
  async create(data: RuleCreateInput) {
    return await prisma.parsingRule.create({
      data
    });
  }

  /**
   * 根据 ID 查询规则
   */
  async findById(id: number) {
    return await prisma.parsingRule.findUnique({
      where: { id }
    });
  }

  /**
   * 查询所有启用的规则
   */
  async findAllEnabled() {
    return await prisma.parsingRule.findMany({
      where: { enabled: true },
      orderBy: { priority: 'desc' }
    });
  }

  /**
   * 根据规则类型查询
   */
  async findByRuleType(ruleType: string, enabledOnly: boolean = true) {
    return await prisma.parsingRule.findMany({
      where: {
        ruleType,
        ...(enabledOnly ? { enabled: true } : {})
      },
      orderBy: { priority: 'desc' }
    });
  }

  /**
   * 更新规则
   */
  async update(id: number, data: RuleUpdateInput) {
    return await prisma.parsingRule.update({
      where: { id },
      data
    });
  }

  /**
   * 增加使用次数
   */
  async incrementUsage(id: number) {
    return await prisma.parsingRule.update({
      where: { id },
      data: {
        usage: { increment: 1 }
      }
    });
  }

  /**
   * 更新成功率
   */
  async updateSuccessRate(id: number, successRate: number) {
    return await prisma.parsingRule.update({
      where: { id },
      data: { successRate }
    });
  }

  /**
   * 启用/停用规则
   */
  async setEnabled(id: number, enabled: boolean) {
    return await prisma.parsingRule.update({
      where: { id },
      data: { enabled }
    });
  }

  /**
   * 删除规则
   */
  async delete(id: number) {
    return await prisma.parsingRule.delete({
      where: { id }
    });
  }

  /**
   * 批量创建规则
   */
  async createMany(rules: RuleCreateInput[]) {
    return await prisma.parsingRule.createMany({
      data: rules
    });
  }
}

// 导出单例
export const ruleStorage = new RuleStorage();

