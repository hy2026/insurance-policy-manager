/**
 * 责任库存储服务
 * 用于保存解析后的责任到数据库，供训练使用
 */

import prisma from '../../../prisma';
import { HardRuleParser } from '../hardRuleParser';

/**
 * 规范化保险产品ID号：只保留中文+数字，删除所有其他字符
 * 用于模糊匹配，支持不同类型的括号和符号
 * 例如：百年人寿【2025】疾病险 → 百年人寿2025疾病险
 */
function normalizePolicyId(policyId: string): string {
  if (!policyId) return '';
  return policyId.replace(/[^\u4e00-\u9fa5\d]/g, '');
}

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
  reviewStatus?: string;
  reviewNotes?: string | null;
  updatedAt?: Date;
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
    policyIdNumber?: string | null;
    sequenceNumber?: number | null;
    payoutCount?: string | null;
    isRepeatablePayout?: boolean | null;
    isGrouped?: boolean | null;
    intervalPeriod?: string | null;
    isPremiumWaiver?: boolean;
  } {
    const parsedResult = data.parsedResult || {};
    const note = parsedResult.note || '';
    const clauseText = data.clauseText || '';
    
    // 提取保单ID号和序号（优化后的新字段）
    const policyIdNumber = parsedResult.保单ID号 || parsedResult.产品编码 || null;
    const sequenceNumber = parsedResult.序号 ? parseInt(parsedResult.序号) : null;
    
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
      policyIdNumber,
      sequenceNumber,
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
   * 优化版：全部使用数据库层面的筛选、排序、分页
   */
  async findWithPagination(options: {
    page: number;
    pageSize: number;
    filters?: {
      保单ID号?: string;
      责任类型?: string;
      责任名称?: string;
      isRequired?: string;
      赔付次数?: string;
      是否可以重复赔付?: boolean;
      是否分组?: boolean;
      是否豁免?: boolean;
      是否已审核?: boolean;
      reviewStatus?: string;
      aiModified?: boolean;
    };
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const { page, pageSize, filters = {}, sortBy = '序号', sortOrder = 'asc' } = options;

    // 构建where条件（全部使用数据库列）
    const where: any = {};

    // 责任类型筛选
    if (filters.责任类型) {
      const typeMapping: { [key: string]: string[] } = {
        '疾病责任': ['疾病责任', '疾病类'],
        '身故责任': ['身故责任', '身故类'],
        '意外责任': ['意外责任', '意外类'],
        '年金责任': ['年金责任', '年金类']
      };
      const typesToQuery = typeMapping[filters.责任类型] || [filters.责任类型];
      where.coverageType = { in: typesToQuery };
    }

    // 责任名称筛选
    if (filters.责任名称) {
      where.coverageName = { contains: filters.责任名称 };
    }

    // 是否必选筛选
    if (filters.isRequired) {
      where.isRequired = filters.isRequired;
    }

    // 保单ID号筛选 - 规范化匹配（不在数据库层过滤，在内存中过滤）
    const normalizedSearchId = filters.保单ID号 ? normalizePolicyId(filters.保单ID号) : null;
    if (normalizedSearchId) {
      console.log('🔍 规范化后的保单ID号:', normalizedSearchId);
    }

    // 赔付次数筛选
    if (filters.赔付次数) {
      where.payoutCount = filters.赔付次数;
    }

    // 是否可以重复赔付筛选
    if (filters.是否可以重复赔付 !== undefined) {
      where.isRepeatablePayout = filters.是否可以重复赔付;
    }

    // 是否分组筛选
    if (filters.是否分组 !== undefined) {
      where.isGrouped = filters.是否分组;
    }

    // 是否豁免筛选
    if (filters.是否豁免 !== undefined) {
      where.isPremiumWaiver = filters.是否豁免;
    }

    // 是否已审核筛选
    if (filters.是否已审核 !== undefined) {
      where.verified = filters.是否已审核;
    }

    // 审批结果筛选
    if (filters.reviewStatus) {
      where.reviewStatus = filters.reviewStatus;
    }

    // AI是否修改筛选
    if (filters.aiModified !== undefined) {
      where.aiModified = filters.aiModified;
    }

    // 构建排序条件（现在使用数据库列）
    let orderBy: any = {};
    if (sortBy === '序号') {
      orderBy = { sequenceNumber: sortOrder };
    } else if (sortBy === '责任名称') {
      orderBy = { coverageName: sortOrder };
    } else {
      orderBy = { createdAt: 'desc' };
    }

    // 如果有保单ID号搜索，需要获取所有数据后在内存中过滤
    if (normalizedSearchId) {
      const allData = await prisma.insuranceCoverageLibrary.findMany({
        where,
        include: {
          product: true
        },
        orderBy
      });

      // 在内存中进行规范化匹配
      const filteredData = allData.filter((item: any) => {
        const normalizedPolicyId = normalizePolicyId(item.policyIdNumber || '');
        return normalizedPolicyId.includes(normalizedSearchId);
      });

      const total = filteredData.length;
      console.log(`📊 规范化匹配后总数: ${total} 条`);

      // 手动分页
      const paginatedData = filteredData.slice((page - 1) * pageSize, page * pageSize);
      console.log(`📄 返回第${page}页，共${paginatedData.length}条`);

      // 提取关键字段
      const enrichedData = paginatedData.map(item => this.enrichCoverageData(item));

      // 获取已审核数量
      const verified = filteredData.filter((item: any) => item.verified === true).length;

      return {
        data: enrichedData,
        total,
        verified,
        unverified: total - verified
      };
    }

    // 普通查询（没有保单ID号搜索）
    const total = await prisma.insuranceCoverageLibrary.count({ where });
    console.log(`📊 数据库筛选后总数: ${total} 条`);

    // 数据库层面分页查询
    const data = await prisma.insuranceCoverageLibrary.findMany({
      where,
      include: {
        product: true
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize
    });

    console.log(`📄 返回第${page}页，共${data.length}条`);

    // 提取关键字段（现在优先使用数据库列）
    const enrichedData = data.map(item => this.enrichCoverageData(item));

    // 获取已审核数量
    const verified = await prisma.insuranceCoverageLibrary.count({
      where: { ...where, verified: true }
    });

    return {
      data: enrichedData,
      total,
      verified,
      unverified: total - verified
    };
  }

  /**
   * 构建排序条件
   */
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
      
      // 如果列是null，从parsedResult提取（不再异步更新，提升查询性能）
      if (!赔付次数 || 是否可以重复赔付 === null || 是否分组 === null) {
        // 直接从 parsedResult 中获取，不触发数据库更新
        赔付次数 = 赔付次数 || parsedResult?.赔付次数 || '1次';
        是否可以重复赔付 = 是否可以重复赔付 ?? parsedResult?.是否可以重复赔付 ?? false;
        是否分组 = 是否分组 ?? parsedResult?.是否分组 ?? false;
        间隔期 = 间隔期 || parsedResult?.间隔期 || '';
        是否豁免 = 是否豁免 ?? parsedResult?.是否豁免 ?? false;
      }
      
      // 判断是否为单次赔付
      const isSinglePayout = 赔付次数 === '1次';

      return {
        ...item,
        序号: item.sequenceNumber !== null ? item.sequenceNumber : parsedResult?.序号, // 优先使用数据库列
        保单ID号: item.policyIdNumber || parsedResult?.保单ID号 || parsedResult?.产品编码, // 优先使用数据库列
        责任类型: parsedResult?.责任类型 || parsedResult?.险种类型 || item.coverageType,
        责任名称: parsedResult?.责任名称 || item.coverageName,
        责任小类: item.diseaseCategory || parsedResult?.责任小类 || '', // 责任小类
        责任层级: item.responsibilityLevel || parsedResult?.责任层级 || '', // 责任层级（主责任/副责任）
        isRequired: item.isRequired || '可选', // 是否必选
        责任原文: parsedResult?.责任原文 || item.clauseText,
        naturalLanguageDesc: parsedResult?.payoutAmount?.map((p: any) => p.naturalLanguageDescription) || [],
        payoutAmount: parsedResult?.payoutAmount || [],
        note: parsedResult?.note,
        赔付次数: 赔付次数 || '1次',
        是否可以重复赔付: 是否可以重复赔付 !== null ? 是否可以重复赔付 : (isSinglePayout ? undefined : false),
        是否分组: 是否分组 !== null ? 是否分组 : (isSinglePayout ? undefined : false),
        间隔期: 间隔期 !== null && 间隔期 !== '' ? 间隔期 : (isSinglePayout ? undefined : ''),
        是否豁免: 是否豁免 || false,
        // 审核信息
        reviewStatus: item.reviewStatus || 'pending',
        reviewNotes: item.reviewNotes || null,
        reviewedBy: item.reviewedBy || null,
        reviewedAt: item.reviewedAt || null,
        _isSinglePayout: isSinglePayout
      };
    } catch (error: any) {
      console.error('enrichCoverageData处理失败:', error, 'item:', item?.id);
      // 返回基础数据，避免整个查询失败
      const parsedResult = (item?.parsedResult || {}) as any;
      return {
        ...item,
        序号: item.sequenceNumber !== null ? item.sequenceNumber : parsedResult?.序号,
        保单ID号: item.policyIdNumber || parsedResult?.保单ID号 || parsedResult?.产品编码,
        责任类型: parsedResult?.责任类型 || parsedResult?.险种类型 || item?.coverageType,
        责任名称: parsedResult?.责任名称 || item?.coverageName,
        责任小类: item.diseaseCategory || parsedResult?.责任小类 || '', // 责任小类
        责任层级: item.responsibilityLevel || parsedResult?.责任层级 || '', // 责任层级（主责任/副责任）
        isRequired: item.isRequired || '可选',
        责任原文: parsedResult?.责任原文 || item?.clauseText,
        赔付次数: item.payoutCount || '1次',
        是否可以重复赔付: item.isRepeatablePayout !== null ? item.isRepeatablePayout : false,
        是否分组: item.isGrouped !== null ? item.isGrouped : false,
        间隔期: item.intervalPeriod || '',
        是否豁免: item.isPremiumWaiver || false,
        // 审核信息
        reviewStatus: item.reviewStatus || 'pending',
        reviewNotes: item.reviewNotes || null,
        reviewedBy: item.reviewedBy || null,
        reviewedAt: item.reviewedAt || null
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
   * 清空责任库（完全覆盖模式）
   */
  async clearAll() {
    // 只清空责任库（产品库保留）
    // 说明：
    // - deleteMany 不会重置自增ID，Railway UI 里看起来像“还是以前的序号”
    // - TRUNCATE ... RESTART IDENTITY 会清空并重置自增序列，更符合“完全覆盖导入”的直觉
    try {
      await prisma.$executeRawUnsafe(
        'TRUNCATE TABLE "insurance_coverage_library" RESTART IDENTITY;'
      );
      console.log(`  ✅ 已TRUNCATE并重置ID序列`);
    } catch (e: any) {
      console.warn(`  ⚠️ TRUNCATE失败，回退到deleteMany: ${e?.message || e}`);
      const deleteResult = await prisma.insuranceCoverageLibrary.deleteMany({});
      console.log(`  ✅ 已删除 ${deleteResult.count} 条责任记录`);
    }
    
    // 验证是否真的清空了
    const remainingCount = await prisma.insuranceCoverageLibrary.count();
    console.log(`  🔍 验证：剩余责任数 = ${remainingCount}`);
    
    if (remainingCount > 0) {
      console.error(`  ❌ 警告：删除后还有 ${remainingCount} 条责任未清空！`);
      // 强制再删一次
      await prisma.insuranceCoverageLibrary.deleteMany({});
      const finalCount = await prisma.insuranceCoverageLibrary.count();
      console.log(`  🔍 二次删除后：剩余责任数 = ${finalCount}`);
    }
  }

  /**
   * 从JSON导入数据（完全覆盖模式 - 批量优化版）
   */
  async importFromJson(cases: any[], batchInfo?: any) {
    let successCount = 0;
    let failCount = 0;
    const validRecords = [];
    const skippedRecords = [];

    console.log(`\n📦 开始处理 ${cases.length} 条数据...`);

    // 第一步：验证并准备数据
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
        const 责任小类 = caseItem.责任小类 || caseItem['责任小类'] || null;
        const 责任层级 = caseItem.责任层级 || caseItem['责任层级'] || null;
        const 责任原文 = caseItem.责任原文 || caseItem['责任原文'];
        const 序号 = caseItem.序号 || caseItem['序号'] || null;
        const isRequired = caseItem.是否必选 || caseItem['是否必选'] || caseItem.isRequired || '可选';

        if (!责任名称 || !责任原文) {
          skippedRecords.push({ 序号, reason: '缺少责任名称或责任原文' });
          failCount++;
          continue;
        }

        // 提取审核信息
        const reviewStatus = caseItem.reviewStatus || 'pending';
        const reviewNotes = caseItem.reviewNotes || null;
        
        validRecords.push({
          coverageType: 责任类型,
          coverageName: 责任名称,
          diseaseCategory: 责任小类,
          responsibilityLevel: 责任层级,
          isRequired: isRequired,
          clauseText: 责任原文,
          parsedResult: caseItem,
          parseMethod: 'imported',
          verified: false,
          policyIdNumber: 保单ID号,
          sequenceNumber: 序号 ? parseInt(序号.toString()) : null,
          reviewStatus: reviewStatus,
          reviewNotes: reviewNotes
        });
      } catch (error: any) {
        console.error('处理数据失败:', error.message);
        failCount++;
      }
    }

    console.log(`✓ 验证完成: ${validRecords.length} 条有效, ${failCount} 条无效`);

    if (skippedRecords.length > 0) {
      console.log(`⚠️  跳过的记录:`, skippedRecords.slice(0, 5));
    }

    // 第二步：批量插入（每次100条，更小批次以提高成功率）
    const BATCH_SIZE = 100;
    const totalBatches = Math.ceil(validRecords.length / BATCH_SIZE);
    const failedBatches: number[] = [];

    for (let i = 0; i < totalBatches; i++) {
      const start = i * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, validRecords.length);
      const batch = validRecords.slice(start, end);

      try {
        const result = await prisma.insuranceCoverageLibrary.createMany({
          data: batch,
          skipDuplicates: false
        });
        successCount += result.count;
        console.log(`  ✓ 批次 ${i + 1}/${totalBatches}: 插入 ${result.count} 条（序号 ${batch[0].sequenceNumber}-${batch[batch.length-1].sequenceNumber}）`);
      } catch (error: any) {
        console.error(`  ✗ 批次 ${i + 1}/${totalBatches} 失败:`, error.message);
        console.error(`     序号范围: ${batch[0].sequenceNumber}-${batch[batch.length-1].sequenceNumber}`);
        failedBatches.push(i + 1);
        
        // 批次失败时，尝试逐条插入以找出问题记录
        console.log(`     尝试逐条插入该批次...`);
        for (const record of batch) {
          try {
            await prisma.insuranceCoverageLibrary.create({ data: record });
            successCount++;
          } catch (singleError: any) {
            console.error(`       ✗ 序号 ${record.sequenceNumber} 插入失败: ${singleError.message}`);
            failCount++;
          }
        }
      }
    }

    if (failedBatches.length > 0) {
      console.log(`\n⚠️  失败的批次: ${failedBatches.join(', ')}`);
    }

    console.log(`\n✅ 导入完成: 成功 ${successCount} 条, 失败 ${failCount} 条\n`);

    return {
      count: successCount,
      success: successCount,
      failed: failCount,
      results: []  // 批量插入不返回具体记录
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

    // 构建where条件（全部使用数据库列，与findWithPagination一致）
    const where: any = {};

    // 责任类型筛选
    if (cleanFilters.责任类型) {
      const typeMapping: { [key: string]: string[] } = {
        '疾病责任': ['疾病责任', '疾病类'],
        '身故责任': ['身故责任', '身故类'],
        '意外责任': ['意外责任', '意外类'],
        '年金责任': ['年金责任', '年金类']
      };
      const typesToQuery = typeMapping[cleanFilters.责任类型] || [cleanFilters.责任类型];
      where.coverageType = { in: typesToQuery };
    }

    // 责任名称筛选
    if (cleanFilters.责任名称) {
      where.coverageName = { contains: cleanFilters.责任名称 };
    }

    // 保单ID号筛选 - 规范化匹配（不在数据库层过滤，在内存中过滤）
    const normalizedSearchId = cleanFilters.保单ID号 ? normalizePolicyId(cleanFilters.保单ID号) : null;

    // 是否可以重复赔付筛选
    if (cleanFilters.是否可以重复赔付 !== undefined) {
      where.isRepeatablePayout = cleanFilters.是否可以重复赔付;
    }

    // 是否分组筛选
    if (cleanFilters.是否分组 !== undefined) {
      where.isGrouped = cleanFilters.是否分组;
    }

    // 是否豁免筛选
    if (cleanFilters.是否豁免 !== undefined) {
      where.isPremiumWaiver = cleanFilters.是否豁免;
    }

    // 是否已审核筛选
    if (cleanFilters.是否已审核 !== undefined) {
      where.verified = cleanFilters.是否已审核;
    }

    // 数据库层面查询（已筛选）
    console.log('导出数据，where条件:', JSON.stringify(where));
    if (normalizedSearchId) {
      console.log('🔍 规范化后的保单ID号:', normalizedSearchId);
    }
    
    let allData = await prisma.insuranceCoverageLibrary.findMany({
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
        sequenceNumber: 'asc' // 按序号排序
      }
    });
    console.log(`导出数据查询成功，共 ${allData.length} 条记录`);

    // 如果有保单ID号搜索，在内存中进行规范化匹配
    if (normalizedSearchId) {
      allData = allData.filter((item: any) => {
        const normalizedPolicyId = normalizePolicyId(item.policyIdNumber || '');
        return normalizedPolicyId.includes(normalizedSearchId);
      });
      console.log(`规范化匹配后，共 ${allData.length} 条记录`);
    }

    // 提取关键字段
    const enrichedData = allData.map(item => this.enrichCoverageData(item));

    return enrichedData;
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
   * 更新审核状态（新审核流程）
   */
  async updateReviewStatus(
    id: number,
    reviewData: {
      reviewStatus: string;
      reviewNotes: string | null;
      reviewedBy: string;
      reviewedAt: Date;
    }
  ) {
    return await prisma.insuranceCoverageLibrary.update({
      where: { id },
      data: {
        reviewStatus: reviewData.reviewStatus,
        reviewNotes: reviewData.reviewNotes,
        reviewedBy: reviewData.reviewedBy,
        reviewedAt: reviewData.reviewedAt,
        // 同时更新旧字段以保持兼容
        verified: reviewData.reviewStatus === 'approved',
        verifiedBy: reviewData.reviewedBy,
        verifiedAt: reviewData.reviewedAt
      },
      include: {
        product: true
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
   * 优化版：使用数据库列
   */
  async getContractStats() {
    // 使用数据库列直接获取唯一的保单ID号（优化后）
    const allData = await prisma.insuranceCoverageLibrary.findMany({
      where: {
        policyIdNumber: { not: null }
      },
      select: {
        policyIdNumber: true
      }
    });

    // 提取所有唯一的保单ID号
    const policyIds = new Set<string>();
    allData.forEach(item => {
      if (item.policyIdNumber) {
        policyIds.add(item.policyIdNumber);
      }
    });

    const contractCount = policyIds.size;
    const totalCoverageCount = await prisma.insuranceCoverageLibrary.count();

    return {
      contractCount,
      totalCoverageCount,
      policyIds: Array.from(policyIds).sort()
    };
  }

  /**
   * 按合同ID获取责任分布统计（优化版：使用数据库列）
   */
  async getStatsByPolicyId(policyId: string) {
    // 使用数据库列直接筛选（优化后）
    const filteredData = await prisma.insuranceCoverageLibrary.findMany({
      where: {
        policyIdNumber: policyId
      },
      select: {
        coverageType: true,
        verified: true
      }
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
        return typesToQuery.includes(item.coverageType);
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

