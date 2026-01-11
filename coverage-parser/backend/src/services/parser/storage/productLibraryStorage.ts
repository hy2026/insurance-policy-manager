/**
 * 产品库存储服务
 */

import prisma from '../../../prisma';

export interface ProductLibraryData {
  insuranceCompany: string;
  productName: string;
  policyType: string;
  policyDocumentId?: string;
  approvalDate?: Date;
  productInfo?: any;
  coverages?: any;
  verified?: boolean;
  trainingStatus?: string;
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
        policyType: data.policyType,
        policyDocumentId: data.policyDocumentId,
        approvalDate: data.approvalDate,
        productInfo: data.productInfo,
        coverages: data.coverages,
        verified: data.verified || false,
        trainingStatus: data.trainingStatus || 'pending'
      }
    });
  }

  /**
   * 查找或创建产品
   */
  async findOrCreate(data: ProductLibraryData) {
    const existing = await prisma.insuranceProduct.findUnique({
      where: {
        insuranceCompany_productName: {
          insuranceCompany: data.insuranceCompany,
          productName: data.productName
        }
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
    return await prisma.insuranceProduct.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date()
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
