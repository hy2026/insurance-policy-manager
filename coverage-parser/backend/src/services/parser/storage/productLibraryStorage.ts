/**
 * 产品库存储服务
 */

import prisma from '../../../prisma';

export interface ProductLibraryData {
  insuranceCompany: string;
  productName: string;
  policyType?: string;
  productIDNumber?: string;
  productCategory?: string;
  productSubCategory?: string;
  coveragePeriod?: string;
  paymentPeriod?: string;
  salesStatus?: string;
  diseaseCount?: number;
  deathCount?: number;
  accidentCount?: number;
  annuityCount?: number;
  policyDocumentId?: string;
  approvalDate?: Date;
  productInfo?: any;
  coverages?: any;
  verified?: boolean;
  trainingStatus?: string;
  source?: string; // 'imported' | 'auto_generated'
}

export class ProductLibraryStorage {
  /**
   * 创建产品
   */
  async create(data: ProductLibraryData) {
    return await prisma.insuranceProduct.create({
      data: {
        insuranceCompany: data.insuranceCompany,
        productName: data.productName,
        policyType: data.policyType || data.productCategory || 'unknown',
        policyId: data.productIDNumber || '',  // 映射到policyId
        productCategory: data.productCategory || '',
        productSubCategory: data.productSubCategory,
        coveragePeriod: data.coveragePeriod,
        paymentPeriod: data.paymentPeriod,
        salesStatus: data.salesStatus || '在售',
        diseaseCount: data.diseaseCount,
        deathCount: data.deathCount,
        accidentCount: data.accidentCount,
        annuityCount: data.annuityCount,
        policyDocumentId: data.policyDocumentId,
        approvalDate: data.approvalDate,
        productInfo: data.productInfo,
        coverages: data.coverages,
        verified: data.verified || false,
        trainingStatus: data.trainingStatus || 'pending',
        source: data.source || 'imported' // 默认为imported
      }
    });
  }

  /**
   * 查找或创建产品（使用upsert避免并发冲突）
   */
  async findOrCreate(data: ProductLibraryData) {
    // 如果有productIDNumber，使用upsert（原子操作）
    if (data.productIDNumber) {
      try {
        return await prisma.insuranceProduct.upsert({
          where: {
            policyId: data.productIDNumber
          },
          update: {
            // 如果存在，可以选择更新或不更新
            // 这里选择不更新，只返回已存在的记录
          },
          create: {
            policyId: data.productIDNumber,
            insuranceCompany: data.insuranceCompany,
            productName: data.productName,
            policyType: data.policyType || '未知',
            productCategory: data.productCategory,
            productSubCategory: data.productSubCategory,
            coveragePeriod: data.coveragePeriod,
            paymentPeriod: data.paymentPeriod,
            salesStatus: data.salesStatus || '在售',
            diseaseCount: data.diseaseCount || 0,
            deathCount: data.deathCount || 0,
            accidentCount: data.accidentCount || 0,
            annuityCount: data.annuityCount || 0,
            reviewStatus: 'pending',
            source: data.source || 'auto_generated' // 默认为auto_generated（从责任库生成）
          }
        });
      } catch (error: any) {
        console.error('upsert产品失败:', error.message, 'policyId:', data.productIDNumber);
        throw error;
      }
    }
    
    // 如果没有productIDNumber，按旧逻辑处理
    const existing = await prisma.insuranceProduct.findFirst({
      where: {
        insuranceCompany: data.insuranceCompany,
        productName: data.productName
      }
    });

    if (existing) {
      return existing;
    }

    return await this.create(data);
  }

  /**
   * 获取所有产品
   */
  async findAll(filters?: {
    policyType?: string;
    insuranceCompany?: string;
    verified?: boolean;
  }) {
    return await prisma.insuranceProduct.findMany({
      where: filters,
      include: {
        coverageDetails: {
          select: {
            id: true,
            coverageName: true,
            coverageType: true,
            verified: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  /**
   * 根据产品ID号查找产品
   */
  async findByProductIDNumber(productIDNumber: string) {
    return await prisma.insuranceProduct.findUnique({
      where: { 
        policyId: productIDNumber  // 使用policyId字段
      }
    });
  }

  /**
   * 根据ID获取产品
   */
  async findById(id: number) {
    return await prisma.insuranceProduct.findUnique({
      where: { id },
      include: {
        coverageDetails: true
      }
    });
  }

  /**
   * 更新产品
   */
  async update(id: number, data: Partial<ProductLibraryData>) {
    const updateData: any = { ...data };
    
    // 映射productIDNumber到policyId
    if (data.productIDNumber) {
      updateData.policyId = data.productIDNumber;
      delete updateData.productIDNumber;
    }
    
    // 确保policyType有默认值
    if (data.productCategory && !updateData.policyType) {
      updateData.policyType = data.productCategory;
    }
    
    updateData.updatedAt = new Date();
    
    return await prisma.insuranceProduct.update({
      where: { id },
      data: updateData
    });
  }

  /**
   * 更新审核状态
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
    return await prisma.insuranceProduct.update({
      where: { id },
      data: {
        reviewStatus: reviewData.reviewStatus,
        reviewNotes: reviewData.reviewNotes,
        reviewedBy: reviewData.reviewedBy,
        reviewedAt: reviewData.reviewedAt,
        // 同时更新旧字段以保持兼容
        verified: reviewData.reviewStatus === 'approved'
      }
    });
  }

  /**
   * 删除产品（会级联删除相关责任）
   */
  async delete(id: number) {
    return await prisma.insuranceProduct.delete({
      where: { id }
    });
  }

  /**
   * 统计信息
   */
  async getStats() {
    const total = await prisma.insuranceProduct.count();
    const verified = await prisma.insuranceProduct.count({
      where: { verified: true }
    });

    const byType = await prisma.insuranceProduct.groupBy({
      by: ['policyType'],
      _count: true
    });

    const byCompany = await prisma.insuranceProduct.groupBy({
      by: ['insuranceCompany'],
      _count: true
    });

    return {
      total,
      verified,
      unverified: total - verified,
      byType,
      byCompany: byCompany.slice(0, 10) // 前10家公司
    };
  }
}

export const productLibraryStorage = new ProductLibraryStorage();
