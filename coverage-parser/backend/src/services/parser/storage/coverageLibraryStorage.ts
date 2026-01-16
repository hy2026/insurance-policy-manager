/**
 * 责任库存储服务
 * 用于保存解析后的责任到数据库，供训练使用
 */

import prisma from '../../../prisma';
import { HardRuleParser } from '../hardRuleParser';

export interface CoverageLibraryData {
  productId: number;
  coverageType: string;
  coverageName: string;
  diseaseCategory?: string;
  clauseText: string;
  parsedResult: any;
  parseMethod?: string;
  confidenceScore?: number;
  verified?: boolean;
  isTrainingSample?: boolean;
  annotationQuality?: string;
}

export class CoverageLibraryStorage {
  /**
   * 保存责任到库
   */
  async create(data: CoverageLibraryData) {
    // 提取字段用于数据库列（提升查询性能）
    const extractedFields = this.extractFieldsForColumns(data);
    
    return await prisma.insuranceCoverageLibrary.create({
      data: {
        productId: data.productId,
        coverageType: data.coverageType,
        coverageName: data.coverageName,
        diseaseCategory: data.diseaseCategory,
        clauseText: data.clauseText,
        parsedResult: data.parsedResult, // 保留完整JSON（包含note，用于训练和核对）
        parseMethod: data.parseMethod || 'llm',
        confidenceScore: data.confidenceScore,
        verified: data.verified || false,
        isTrainingSample: data.isTrainingSample || true, // 默认作为训练样本
        annotationQuality: data.annotationQuality,
        // 新增：快速查询字段
        ...extractedFields
      },
      include: {
        product: true
      }
    });
  }

  /**
   * 从parsedResult或note中提取字段，转换为数据库列格式
   * 使用HardRuleParser的规则，确保与解析时一致
   */
  private extractFieldsForColumns(data: CoverageLibraryData): {
    payoutCount?: string | null;
    isRepeatablePayout?: boolean | null;
    isGrouped?: boolean | null;
    intervalPeriod?: string | null;
    isPremiumWaiver?: boolean;
  } {
    const parsedResult = data.parsedResult || {};
    const note = parsedResult.note || '';
    const clauseText = data.clauseText || '';
    
    // 使用HardRuleParser提取字段（与解析时使用相同的规则）
    const hardRuleFields = HardRuleParser.parseAdditionalFields(note || clauseText);
    
    // 格式化赔付次数
    let payoutCount: string | null = null;
    let isRepeatablePayout: boolean | null = null;
    const payoutCountData = hardRuleFields.payoutCount;
    if (payoutCountData) {
      if (payoutCountData.type === 'single') {
        payoutCount = '1次';
        isRepeatablePayout = null; // null表示"一次赔付不涉及"
      } else if (payoutCountData.maxCount) {
        payoutCount = `最多${payoutCountData.maxCount}次`;
        isRepeatablePayout = payoutCountData.maxCount > 1;
      }
    }
    if (!payoutCount) {
      payoutCount = '1次'; // 默认值
      isRepeatablePayout = null;
    }
    
    // 格式化是否分组
    let isGrouped: boolean | null = null;
    if (payoutCount === '1次') {
      isGrouped = null; // null表示"一次赔付不涉及"
    } else {
      const grouping = hardRuleFields.grouping;
      if (grouping && grouping.isGrouped !== undefined) {
        isGrouped = grouping.isGrouped;
      } else {
        isGrouped = false; // 默认不分组
      }
    }
    
    // 格式化间隔期
    let intervalPeriod: string | null = null;
    if (payoutCount === '1次') {
      intervalPeriod = null; // null表示"一次赔付不涉及"
    } else {
      const intervalPeriodData = hardRuleFields.intervalPeriod;
      if (intervalPeriodData && intervalPeriodData.hasInterval && intervalPeriodData.days) {
        const days = intervalPeriodData.days;
        if (days >= 365) {
          intervalPeriod = `间隔${Math.floor(days / 365)}年`;
        } else {
          intervalPeriod = `间隔${days}天`;
        }
      } else {
        intervalPeriod = ''; // 空字符串表示无间隔期
      }
    }
    
    // 格式化是否可以重复赔付（如果还未设置）
    if (isRepeatablePayout === null && payoutCount !== '1次') {
      const repeatablePayout = hardRuleFields.repeatablePayout;
      if (repeatablePayout && repeatablePayout.isRepeatable !== undefined) {
        isRepeatablePayout = repeatablePayout.isRepeatable;
      } else {
        isRepeatablePayout = false; // 默认不可重复
      }
    }
    
    // 格式化是否豁免
    let isPremiumWaiver = false;
    const premiumWaiver = hardRuleFields.premiumWaiver;
    if (premiumWaiver && premiumWaiver.isWaived !== undefined) {
      isPremiumWaiver = premiumWaiver.isWaived;
    }
    
    return {
      payoutCount,
      isRepeatablePayout,
      isGrouped,
      intervalPeriod,
      isPremiumWaiver
    };
  }

  /**
   * 批量保存责任
   */
  async createMany(dataList: CoverageLibraryData[]) {
    const results = [];
    for (const data of dataList) {
      const coverage = await this.create(data);
      results.push(coverage);
    }
    return results;
  }

  /**
   * 获取所有责任
   */
  async findAll(filters?: {
    productId?: number;
    coverageType?: string;
    verified?: boolean;
    isTrainingSample?: boolean;
  }) {
    return await prisma.insuranceCoverageLibrary.findMany({
      where: filters,
      include: {
        product: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  /**
   * 分页查询责任（支持筛选、排序）
   */
  async findWithPagination(options: {
    page: number;
    pageSize: number;
    filters?: {
      保单ID号?: string;
      责任类型?: string;
      责任名称?: string;
      是否可以重复赔付?: boolean;
      是否分组?: boolean;
      是否豁免?: boolean;
      是否已审核?: boolean;
    };
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const { page, pageSize, filters = {}, sortBy = '序号', sortOrder = 'asc' } = options;

    // 构建where条件（只用于数据库查询的字段）
    const where: any = {};

    // 注意：保单ID号在parsedResult中，需要先查询所有数据，然后在内存中筛选
    // 但为了性能，我们先用其他可用的字段筛选

    if (filters.责任类型) {
      // 支持新旧两种格式：疾病责任 <-> 疾病类
      const typeMapping: { [key: string]: string[] } = {
        '疾病责任': ['疾病责任', '疾病类'],
        '身故责任': ['身故责任', '身故类'],
        '意外责任': ['意外责任', '意外类'],
        '年金责任': ['年金责任', '年金类']
      };
      
      const typesToQuery = typeMapping[filters.责任类型] || [filters.责任类型];
      where.coverageType = {
        in: typesToQuery
      };
    }

    if (filters.责任名称) {
      where.coverageName = {
        contains: filters.责任名称
      };
    }

    if (filters.是否已审核 !== undefined) {
      where.verified = filters.是否已审核;
    }

    // 使用数据库列进行筛选（提升性能）
    if (filters.是否可以重复赔付 !== undefined) {
      where.isRepeatablePayout = filters.是否可以重复赔付;
    }

    if (filters.是否分组 !== undefined) {
      where.isGrouped = filters.是否分组;
    }

    if (filters.是否豁免 !== undefined) {
      where.isPremiumWaiver = filters.是否豁免;
    }

    // 先查询总数（用于分页）
    const total = await prisma.insuranceCoverageLibrary.count({
      where: {
        ...where,
        // 保单ID号筛选需要在内存中进行（因为存储在parsedResult中）
        // 所以先不在这里筛选，后面在内存中筛选
      }
    });

    // 查询数据（使用数据库列筛选，提升性能）
    const allData = await prisma.insuranceCoverageLibrary.findMany({
      where,
      include: {
        product: true
      },
      orderBy: this.buildOrderBy(sortBy, sortOrder),
      skip: (page - 1) * pageSize,
      take: pageSize
    });

    // 提取关键字段（优先使用数据库列）
    const enrichedData = allData.map(item => {
      try {
        return this.enrichCoverageData(item);
      } catch (error: any) {
        console.error('enrichCoverageData失败:', error, item);
        // 返回基础数据，避免整个查询失败
        const parsedResult = item.parsedResult as any || {};
        return {
          ...item,
          序号: parsedResult.序号,
          保单ID号: parsedResult.保单ID号,
          责任类型: parsedResult.责任类型 || item.coverageType,
          责任名称: parsedResult.责任名称 || item.coverageName,
          责任原文: parsedResult.责任原文 || item.clauseText,
          赔付次数: item.payoutCount || '1次',
          是否可以重复赔付: item.isRepeatablePayout !== null ? item.isRepeatablePayout : false,
          是否分组: item.isGrouped !== null ? item.isGrouped : false,
          间隔期: item.intervalPeriod || '',
          是否豁免: item.isPremiumWaiver || false
        };
      }
    });

    // 应用内存中的筛选（仅对parsedResult中的字段，如保单ID号）
    let filteredData = enrichedData.filter(item => {
      // 保单ID号筛选（存储在parsedResult中，需要在内存中筛选）
      if (filters.保单ID号 && item.保单ID号 && !item.保单ID号.includes(filters.保单ID号)) {
        return false;
      }
      
      return true;
    });

    // 获取已审核数量（筛选后）
    const verified = filteredData.filter(item => item.verified).length;

    // 注意：由于保单ID号在内存中筛选，总数可能不准确
    // 如果需要精确总数，需要先查询所有数据再筛选（性能较差）
    // 这里使用近似值，实际总数可能略大于显示的总数

    return {
      data: filteredData,
      total: filteredData.length, // 使用筛选后的实际数量
      verified,
      unverified: filteredData.length - verified
    };
  }

  /**
   * 构建排序条件
   */
  private buildOrderBy(sortBy: string, sortOrder: 'asc' | 'desc') {
    const order: any = {};
    
    // 支持从parsedResult中排序的字段
    if (sortBy === '序号') {
      // 需要从parsedResult中提取，暂时用createdAt
      return { createdAt: sortOrder };
    }
    
    // 其他字段
    const fieldMap: Record<string, string> = {
      '创建时间': 'createdAt',
      '保单ID号': 'createdAt', // 暂时用createdAt
      '责任名称': 'coverageName'
    };

    const dbField = fieldMap[sortBy] || 'createdAt';
    order[dbField] = sortOrder;
    return order;
  }

  /**
   * 丰富责任数据（优先使用数据库列，如果列是null则从parsedResult提取并更新）
   */
  private enrichCoverageData(item: any): any {
    try {
      const parsedResult = (item.parsedResult || {}) as any;
      
      // 优先使用数据库列（提升性能）
      let 赔付次数 = item.payoutCount;
      let 是否可以重复赔付 = item.isRepeatablePayout;
      let 是否分组 = item.isGrouped;
      let 间隔期 = item.intervalPeriod;
      let 是否豁免 = item.isPremiumWaiver;
      
      // 如果列是null，从parsedResult提取并异步更新（懒加载兜底）
      const needsExtraction = !赔付次数 || 是否可以重复赔付 === null || 是否分组 === null || 间隔期 === null;
      
      if (needsExtraction) {
        const note = parsedResult?.note || '';
        const hardRuleFields = HardRuleParser.parseAdditionalFields(note || item.clauseText);
        
        // 提取并格式化字段
        const extracted = this.extractFieldsForColumns({
          parsedResult: item.parsedResult,
          clauseText: item.clauseText
        } as any);
        
        // 使用提取的值
        赔付次数 = extracted.payoutCount || 赔付次数 || '1次';
        是否可以重复赔付 = extracted.isRepeatablePayout !== null ? extracted.isRepeatablePayout : 是否可以重复赔付;
        是否分组 = extracted.isGrouped !== null ? extracted.isGrouped : 是否分组;
        间隔期 = extracted.intervalPeriod !== null ? extracted.intervalPeriod : 间隔期;
        是否豁免 = extracted.isPremiumWaiver !== undefined ? extracted.isPremiumWaiver : (是否豁免 || false);
        
        // 异步更新数据库（不阻塞查询）
        this.updateFieldsAsync(item.id, extracted).catch(err => {
          console.error(`异步更新字段失败 (ID: ${item.id}):`, err);
        });
      }
      
      // 判断是否为单次赔付
      const isSinglePayout = 赔付次数 === '1次';
      
      return {
        ...item,
        序号: parsedResult?.序号,
        保单ID号: parsedResult?.保单ID号,
        责任类型: parsedResult?.责任类型 || item.coverageType,
        责任名称: parsedResult?.责任名称 || item.coverageName,
        责任原文: parsedResult?.责任原文 || item.clauseText,
        naturalLanguageDesc: parsedResult?.payoutAmount?.map((p: any) => p.naturalLanguageDescription) || [],
        payoutAmount: parsedResult?.payoutAmount || [],
        note: parsedResult?.note,
        赔付次数: 赔付次数 || '1次',
        是否可以重复赔付: 是否可以重复赔付 !== null ? 是否可以重复赔付 : (isSinglePayout ? undefined : false),
        是否分组: 是否分组 !== null ? 是否分组 : (isSinglePayout ? undefined : false),
        间隔期: 间隔期 !== null && 间隔期 !== '' ? 间隔期 : (isSinglePayout ? undefined : ''),
        是否豁免: 是否豁免 || false,
        _isSinglePayout: isSinglePayout
      };
    } catch (error: any) {
      console.error('enrichCoverageData处理失败:', error, 'item:', item?.id);
      // 返回基础数据，避免整个查询失败
      const parsedResult = (item?.parsedResult || {}) as any;
      return {
        ...item,
        序号: parsedResult?.序号,
        保单ID号: parsedResult?.保单ID号,
        责任类型: parsedResult?.责任类型 || item?.coverageType,
        责任名称: parsedResult?.责任名称 || item?.coverageName,
        责任原文: parsedResult?.责任原文 || item?.clauseText,
        赔付次数: item.payoutCount || '1次',
        是否可以重复赔付: item.isRepeatablePayout !== null ? item.isRepeatablePayout : false,
        是否分组: item.isGrouped !== null ? item.isGrouped : false,
        间隔期: item.intervalPeriod || '',
        是否豁免: item.isPremiumWaiver || false
      };
    }
  }

  /**
   * 异步更新字段（懒加载兜底）
   */
  private async updateFieldsAsync(id: number, fields: {
    payoutCount?: string | null;
    isRepeatablePayout?: boolean | null;
    isGrouped?: boolean | null;
    intervalPeriod?: string | null;
    isPremiumWaiver?: boolean;
  }): Promise<void> {
    try {
      await prisma.insuranceCoverageLibrary.update({
        where: { id },
        data: fields
      });
    } catch (error: any) {
      // 静默失败，不影响查询
      console.error(`更新字段失败 (ID: ${id}):`, error);
    }
  }

  /**
   * 从JSON导入数据
   */
  async importFromJson(cases: any[], batchInfo?: any) {
    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const caseItem of cases) {
      try {
        // 提取信息（支持多种字段名）
        const 保单ID号 = caseItem.保单ID号 || caseItem['保单ID号'] || caseItem.产品编码 || caseItem['产品编码'];
        let 责任类型 = caseItem.责任类型 || caseItem['责任类型'] || caseItem.险种类型 || caseItem['险种类型'] || '疾病类';
        
        // 将旧的责任类型格式转换为新格式
        const typeMapping: { [key: string]: string } = {
          '疾病类': '疾病责任',
          '身故类': '身故责任',
          '意外类': '意外责任',
          '年金类': '年金责任'
        };
        责任类型 = typeMapping[责任类型] || 责任类型;
        
        const 责任名称 = caseItem.责任名称 || caseItem['责任名称'];
        const 责任原文 = caseItem.责任原文 || caseItem['责任原文'];
        const payoutAmount = caseItem.payoutAmount || [];
        const note = caseItem.note;

        if (!责任名称 || !责任原文) {
          console.warn('跳过无效数据:', caseItem);
          failCount++;
          continue;
        }

        // 查找或创建产品
        const productStorage = require('./productLibraryStorage').productLibraryStorage;
        const insuranceCompany = 保单ID号?.match(/^(.+?)\[/)?.[1] || '未知公司';
        const productName = 保单ID号 || '未知产品';

        const product = await productStorage.findOrCreate({
          insuranceCompany,
          productName,
          policyType: 'critical_illness'
        });

        // 检查是否已存在相同的责任记录（基于产品ID、责任名称和原文）
        const existing = await prisma.insuranceCoverageLibrary.findFirst({
          where: {
            productId: product.id,
            coverageName: 责任名称,
            clauseText: 责任原文
          }
        });

        if (existing) {
          // 如果已存在，跳过导入
          console.log(`跳过重复记录: 保单ID号=${保单ID号}, 责任名称=${责任名称}`);
          continue;
        }

        // 创建责任记录
        const coverage = await this.create({
          productId: product.id,
          coverageType: 责任类型,
          coverageName: 责任名称,
          clauseText: 责任原文,
          parsedResult: caseItem, // 保存完整JSON
          parseMethod: 'imported',
          verified: false
        });

        results.push(coverage);
        successCount++;
      } catch (error: any) {
        console.error('导入单条数据失败:', error, caseItem);
        failCount++;
      }
    }

    return {
      count: successCount,
      success: successCount,
      failed: failCount,
      results
    };
  }

  /**
   * 导出数据
   */
  async exportData(filters?: any) {
    // 清理空字符串的筛选条件，并转换字符串布尔值为布尔值
    const cleanFilters: any = {};
    if (filters) {
      // 责任类型
      if (filters.责任类型 && filters.责任类型 !== '') {
        cleanFilters.责任类型 = filters.责任类型;
      }
      // 责任名称
      if (filters.责任名称 && filters.责任名称 !== '') {
        cleanFilters.责任名称 = filters.责任名称;
      }
      // 是否已审核（转换字符串布尔值）
      if (filters.是否已审核 !== undefined && filters.是否已审核 !== '') {
        cleanFilters.是否已审核 = filters.是否已审核 === 'true' || filters.是否已审核 === true;
      }
      // 保单ID号
      if (filters.保单ID号 && filters.保单ID号 !== '') {
        cleanFilters.保单ID号 = filters.保单ID号;
      }
      // 是否可以重复赔付（转换字符串布尔值）
      if (filters.是否可以重复赔付 !== undefined && filters.是否可以重复赔付 !== '') {
        cleanFilters.是否可以重复赔付 = filters.是否可以重复赔付 === 'true' || filters.是否可以重复赔付 === true;
      }
      // 是否分组（转换字符串布尔值）
      if (filters.是否分组 !== undefined && filters.是否分组 !== '') {
        cleanFilters.是否分组 = filters.是否分组 === 'true' || filters.是否分组 === true;
      }
      // 是否豁免（转换字符串布尔值）
      if (filters.是否豁免 !== undefined && filters.是否豁免 !== '') {
        cleanFilters.是否豁免 = filters.是否豁免 === 'true' || filters.是否豁免 === true;
      }
    }

    // 构建where条件（只用于数据库查询的字段）
    const where: any = {};

    // 责任类型筛选（支持新旧两种格式映射）
    if (cleanFilters.责任类型) {
      const typeMapping: { [key: string]: string[] } = {
        '疾病责任': ['疾病责任', '疾病类'],
        '身故责任': ['身故责任', '身故类'],
        '意外责任': ['意外责任', '意外类'],
        '年金责任': ['年金责任', '年金类']
      };
      
      const typesToQuery = typeMapping[cleanFilters.责任类型] || [cleanFilters.责任类型];
      where.coverageType = {
        in: typesToQuery
      };
    }

    // 责任名称筛选
    if (cleanFilters.责任名称) {
      where.coverageName = {
        contains: cleanFilters.责任名称
      };
    }

    // 是否已审核筛选
    if (cleanFilters.是否已审核 !== undefined) {
      where.verified = cleanFilters.是否已审核;
    }

    // 查询所有数据（先不分页，因为需要在内存中筛选parsedResult字段）
    let allData;
    try {
      console.log('开始查询数据库，where条件:', JSON.stringify(where));
      allData = await prisma.insuranceCoverageLibrary.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              productName: true,
              insuranceCompany: true,
              policyType: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      console.log(`数据库查询成功，获取到 ${allData.length} 条记录`);
    } catch (dbError: any) {
      console.error('数据库查询失败:', dbError);
      console.error('错误堆栈:', dbError.stack);
      throw new Error(`数据库查询失败: ${dbError.message}`);
    }

    // 提取关键字段（从parsedResult中）
    const enrichedData = allData.map(item => {
      try {
        return this.enrichCoverageData(item);
      } catch (error: any) {
        console.error('enrichCoverageData失败:', error, item);
        // 返回基础数据，避免整个查询失败
        const parsedResult = item.parsedResult as any || {};
        return {
          ...item,
          序号: parsedResult.序号,
          保单ID号: parsedResult.保单ID号,
          责任类型: parsedResult.责任类型 || item.coverageType,
          责任名称: parsedResult.责任名称 || item.coverageName,
          责任原文: parsedResult.责任原文 || item.clauseText,
          赔付次数: '1次',
          是否可以重复赔付: false,
          是否分组: false,
          间隔期: undefined,
          是否豁免: false
        };
      }
    });

    // 应用内存中的筛选（对于从parsedResult提取的字段）
    const filteredData = enrichedData.filter(item => {
      // 保单ID号筛选
      if (cleanFilters.保单ID号 && item.保单ID号 && !item.保单ID号.includes(cleanFilters.保单ID号)) {
        return false;
      }
      
      // 是否可以重复赔付筛选
      if (cleanFilters.是否可以重复赔付 !== undefined && item.是否可以重复赔付 !== cleanFilters.是否可以重复赔付) {
        return false;
      }
      
      // 是否分组筛选
      if (cleanFilters.是否分组 !== undefined && item.是否分组 !== cleanFilters.是否分组) {
        return false;
      }
      
      // 是否豁免筛选
      if (cleanFilters.是否豁免 !== undefined && item.是否豁免 !== cleanFilters.是否豁免) {
        return false;
      }
      
      return true;
    });

    return filteredData;
  }

  /**
   * 根据ID获取责任
   */
  async findById(id: number) {
    if (!id || typeof id !== 'number') {
      throw new Error(`findById方法需要有效的id参数，实际收到: ${id}`);
    }
    return await prisma.insuranceCoverageLibrary.findUnique({
      where: { id },
      include: {
        product: {
          select: {
            id: true,
            productName: true,
            insuranceCompany: true,
            policyType: true
          }
        }
      }
    });
  }

  /**
   * 更新责任
   */
  async update(id: number, data: Partial<CoverageLibraryData>) {
    return await prisma.insuranceCoverageLibrary.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date()
      }
    });
  }

  /**
   * 标记为已验证
   */
  async markAsVerified(id: number, verifiedBy: string) {
    return await prisma.insuranceCoverageLibrary.update({
      where: { id },
      data: {
        verified: true,
        verifiedBy,
        verifiedAt: new Date()
      }
    });
  }

  /**
   * 批量标记为训练样本
   */
  async markAsTrainingSamples(ids: number[], quality: string = 'high') {
    return await prisma.insuranceCoverageLibrary.updateMany({
      where: {
        id: { in: ids }
      },
      data: {
        isTrainingSample: true,
        annotationQuality: quality
      }
    });
  }

  /**
   * 删除责任
   */
  async delete(id: number) {
    return await prisma.insuranceCoverageLibrary.delete({
      where: { id }
    });
  }

  /**
   * 统计信息
   */
  async getStats() {
    const total = await prisma.insuranceCoverageLibrary.count();
    const verified = await prisma.insuranceCoverageLibrary.count({
      where: { verified: true }
    });
    const trainingSamples = await prisma.insuranceCoverageLibrary.count({
      where: { isTrainingSample: true }
    });

    const byType = await prisma.insuranceCoverageLibrary.groupBy({
      by: ['coverageType'],
      _count: true
    });

    return {
      total,
      verified,
      trainingSamples,
      unverified: total - verified,
      byType
    };
  }

  /**
   * 获取按责任类型分组的统计数据
   */
  async getStatsByType() {
    const types = ['疾病责任', '身故责任', '意外责任', '年金责任'];
    const typeMapping: { [key: string]: string[] } = {
      '疾病责任': ['疾病责任', '疾病类'],
      '身故责任': ['身故责任', '身故类'],
      '意外责任': ['意外责任', '意外类'],
      '年金责任': ['年金责任', '年金类']
    };
    
    const stats: any = {
      total: 0,
      verified: 0,
      unverified: 0,
      byType: {}
    };

    for (const type of types) {
      const typesToQuery = typeMapping[type] || [type];
      const total = await prisma.insuranceCoverageLibrary.count({
        where: { 
          coverageType: {
            in: typesToQuery
          }
        }
      });
      const verified = await prisma.insuranceCoverageLibrary.count({
        where: { 
          coverageType: {
            in: typesToQuery
          },
          verified: true
        }
      });
      const unverified = total - verified;

      stats.byType[type] = { total, verified, unverified };
      stats.total += total;
      stats.verified += verified;
      stats.unverified += unverified;
    }

    return stats;
  }

  /**
   * 获取合同统计信息（合同数量、责任总数、合同ID列表）
   */
  async getContractStats() {
    // 获取所有数据以提取保单ID号
    const allData = await prisma.insuranceCoverageLibrary.findMany({
      select: {
        parsedResult: true
      }
    });

    // 提取所有唯一的保单ID号
    const policyIds = new Set<string>();
    allData.forEach(item => {
      const parsedResult = item.parsedResult as any;
      if (parsedResult?.保单ID号) {
        policyIds.add(parsedResult.保单ID号);
      }
    });

    const contractCount = policyIds.size;
    const totalCoverageCount = allData.length;

    return {
      contractCount,
      totalCoverageCount,
      policyIds: Array.from(policyIds).sort()
    };
  }

  /**
   * 按合同ID获取责任分布统计
   */
  async getStatsByPolicyId(policyId: string) {
    // 查询该合同ID下的所有责任
    const allData = await prisma.insuranceCoverageLibrary.findMany({
      where: {},
      select: {
        parsedResult: true,
        coverageType: true,
        verified: true
      }
    });

    // 筛选出该合同ID的责任
    const filteredData = allData.filter(item => {
      const parsedResult = item.parsedResult as any;
      return parsedResult?.保单ID号 === policyId;
    });

    const types = ['疾病责任', '身故责任', '意外责任', '年金责任'];
    const typeMapping: { [key: string]: string[] } = {
      '疾病责任': ['疾病责任', '疾病类'],
      '身故责任': ['身故责任', '身故类'],
      '意外责任': ['意外责任', '意外类'],
      '年金责任': ['年金责任', '年金类']
    };

    const stats: any = {
      total: filteredData.length,
      verified: 0,
      unverified: 0,
      byType: {}
    };

    // 按类型统计
    for (const type of types) {
      const typesToQuery = typeMapping[type] || [type];
      const typeData = filteredData.filter(item => {
        const parsedResult = item.parsedResult as any;
        const coverageType = parsedResult?.责任类型 || item.coverageType;
        return typesToQuery.includes(coverageType);
      });

      const total = typeData.length;
      const verified = typeData.filter(item => item.verified).length;
      const unverified = total - verified;

      stats.byType[type] = { total, verified, unverified };
      stats.verified += verified;
      stats.unverified += unverified;
    }

    return stats;
  }
}

export const coverageLibraryStorage = new CoverageLibraryStorage();

