/**
 * 产品库路由
 */

import { Router } from 'express';
import multer from 'multer';
import { ProductLibraryStorage } from '../services/parser/storage/productLibraryStorage';

const router = Router();
const productStorage = new ProductLibraryStorage();

/**
 * 规范化保险产品ID号：只保留中文+数字，删除所有其他字符
 * 用于模糊匹配，支持不同类型的括号和符号
 * 例如：百年人寿【2025】疾病险 → 百年人寿2025疾病险
 */
function normalizePolicyId(policyId: string): string {
  if (!policyId) return '';
  return policyId.replace(/[^\u4e00-\u9fa5\d]/g, '');
}

// 配置multer用于文件上传
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB限制
});

// 获取产品列表
router.get('/', async (req, res) => {
  try {
    const { 
      page = '1', 
      pageSize = '20',
      policyType, 
      insuranceCompany,
      保险产品ID号,
      公司名称,
      保险产品名称,
      保险大类,
      保险小类,
      保障期限,
      交费期限,
      销售状态,
      reviewStatus
    } = req.query;

    const filters: any = {
      source: 'imported' // 只查询Excel导入的产品
    };
    if (policyType) filters.policyType = String(policyType);
    if (insuranceCompany) filters.insuranceCompany = String(insuranceCompany);
    // 保险产品ID号 - 不在这里过滤，稍后在内存中规范化匹配
    const normalizedSearchId = 保险产品ID号 ? normalizePolicyId(String(保险产品ID号)) : null;
    if (公司名称) filters.insuranceCompany = { contains: String(公司名称) };
    if (保险产品名称) filters.productName = { contains: String(保险产品名称) };
    if (保险大类) filters.productCategory = String(保险大类);
    if (保险小类) filters.productSubCategory = String(保险小类);
    if (保障期限) filters.coveragePeriod = { contains: String(保障期限) };
    if (交费期限) filters.paymentPeriod = { contains: String(交费期限) };
    if (销售状态) filters.salesStatus = String(销售状态);
    if (reviewStatus) filters.reviewStatus = String(reviewStatus);

    console.log('🔍 GET /api/products - filters:', JSON.stringify(filters));
    if (normalizedSearchId) {
      console.log('🔍 规范化后的保险产品ID号:', normalizedSearchId);
    }

    const pageNum = parseInt(String(page), 10);
    const size = parseInt(String(pageSize), 10);
    
    // 如果有保险产品ID号搜索，需要获取所有数据后在内存中过滤
    let allProducts = [];
    if (normalizedSearchId) {
      allProducts = await require('../prisma').default.insuranceProduct.findMany({
        where: filters,
        orderBy: { id: 'desc' }
      });
      
      // 在内存中进行规范化匹配
      allProducts = allProducts.filter((product: any) => {
        const normalizedPolicyId = normalizePolicyId(product.policyId || '');
        return normalizedPolicyId.includes(normalizedSearchId);
      });
      
      const total = allProducts.length;
      const products = allProducts.slice((pageNum - 1) * size, pageNum * size);
      
      console.log('📊 规范化匹配结果 total:', total);
      
      // 统计各类别数量（不受筛选影响，只统计全部数据）
      const baseFilter = { source: 'imported' };
      const byCategory = {
        疾病险: await require('../prisma').default.insuranceProduct.count({ where: { ...baseFilter, productCategory: '疾病险' } }),
        人寿险: await require('../prisma').default.insuranceProduct.count({ where: { ...baseFilter, productCategory: '人寿险' } }),
        意外险: await require('../prisma').default.insuranceProduct.count({ where: { ...baseFilter, productCategory: '意外险' } }),
        年金险: await require('../prisma').default.insuranceProduct.count({ where: { ...baseFilter, productCategory: '年金险' } })
      };

      return res.json({
        success: true,
        data: products,
        total,
        byCategory
      });
    }
    
    // 普通查询（没有保险产品ID号搜索）
    const total = await require('../prisma').default.insuranceProduct.count({ where: filters });
    console.log('📊 查询结果 total:', total);
    
    const products = await require('../prisma').default.insuranceProduct.findMany({
      where: filters,
      skip: (pageNum - 1) * size,
      take: size,
      orderBy: { id: 'desc' }
    });
    
    // 统计各类别数量（不受筛选影响，只统计全部数据）
    const baseFilter = { source: 'imported' }; // 只查询Excel导入的产品
    const byCategory = {
      疾病险: await require('../prisma').default.insuranceProduct.count({ where: { ...baseFilter, productCategory: '疾病险' } }),
      人寿险: await require('../prisma').default.insuranceProduct.count({ where: { ...baseFilter, productCategory: '人寿险' } }),
      意外险: await require('../prisma').default.insuranceProduct.count({ where: { ...baseFilter, productCategory: '意外险' } }),
      年金险: await require('../prisma').default.insuranceProduct.count({ where: { ...baseFilter, productCategory: '年金险' } })
    };

    res.json({
      success: true,
      data: products,
      total,
      byCategory
    });
  } catch (error: any) {
    console.error('获取产品列表错误:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 导出Excel产品数据 - 必须在 /:id 之前定义
router.get('/export', async (req, res) => {
  try {
    console.log('开始导出产品数据...');
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    
    // 直接从Prisma查询所有产品，不包含关联数据
    const prisma = require('../prisma').default;
    const products = await prisma.insuranceProduct.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });
    console.log(`查询到 ${products.length} 条产品数据`);
    
    // 创建工作表
    const worksheet = workbook.addWorksheet('保险产品库');
    
    // 设置表头
    const headers = [
      '保险产品ID号', '公司名称', '保险产品名称', '保险大类', '保险小类',
      '保障期限', '交费期限', '销售状态',
      '疾病责任数', '身故责任数', '意外责任数', '年金责任数'
    ];
    
    worksheet.columns = headers.map(header => ({
      header,
      key: header,
      width: 20
    }));
    
    // 添加数据
    products.forEach((product: any) => {
      worksheet.addRow({
        '保险产品ID号': product.policyId || '',
        '公司名称': product.insuranceCompany || '',
        '保险产品名称': product.productName || '',
        '保险大类': product.productCategory || '',
        '保险小类': product.productSubCategory || '',
        '保障期限': product.coveragePeriod || '',
        '交费期限': product.paymentPeriod || '',
        '销售状态': product.salesStatus || '在售',
        '疾病责任数': product.diseaseCount || 0,
        '身故责任数': product.deathCount || 0,
        '意外责任数': product.accidentCount || 0,
        '年金责任数': product.annuityCount || 0
      });
    });
    
    // 设置表头样式
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6F3FF' }
    };
    
    // 设置响应头
    const filename = `保险产品库导出-${Date.now()}.xlsx`;
    const encodedFilename = encodeURIComponent(filename);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
    
    // 写入响应
    await workbook.xlsx.write(res);
    console.log('Excel文件导出完成');
    res.end();
  } catch (error: any) {
    console.error('导出失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '导出失败'
    });
  }
});

// 获取单个产品
router.get('/:id', async (req, res) => {
  try {
    const product = await productStorage.findById(Number(req.params.id));
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: '产品不存在'
      });
    }

    res.json({
      success: true,
      data: product
    });
  } catch (error: any) {
    console.error('获取产品错误:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 创建产品
router.post('/', async (req, res) => {
  try {
    const productData = req.body;
    const product = await productStorage.create(productData);

    res.json({
      success: true,
      data: product
    });
  } catch (error: any) {
    console.error('创建产品错误:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * 审核产品（通过/不通过）
 * POST /api/products/:id/review
 */
router.post('/:id/review', async (req, res) => {
  try {
    const { reviewStatus, reviewNotes, reviewedBy } = req.body;

    // 验证必填参数
    if (!reviewStatus || !reviewedBy) {
      return res.status(400).json({
        success: false,
        message: '缺少必填参数：reviewStatus 和 reviewedBy'
      });
    }

    // 验证审核状态
    if (!['approved', 'rejected'].includes(reviewStatus)) {
      return res.status(400).json({
        success: false,
        message: 'reviewStatus 必须是 approved 或 rejected'
      });
    }

    // 如果是不通过，必须填写备注
    if (reviewStatus === 'rejected' && !reviewNotes) {
      return res.status(400).json({
        success: false,
        message: '审核不通过时必须填写备注说明原因'
      });
    }

    // 更新审核状态
    const product = await productStorage.updateReviewStatus(
      Number(req.params.id),
      {
        reviewStatus,
        reviewNotes: reviewNotes || null,
        reviewedBy,
        reviewedAt: new Date()
      }
    );

    res.json({
      success: true,
      data: product,
      message: reviewStatus === 'approved' ? '审核通过' : '标记为不通过'
    });
  } catch (error: any) {
    console.error('审核失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 删除产品
router.delete('/:id', async (req, res) => {
  try {
    await productStorage.delete(Number(req.params.id));

    res.json({
      success: true,
      message: '删除成功'
    });
  } catch (error: any) {
    console.error('删除产品错误:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 导入Excel产品数据（完全覆盖模式）
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '请上传Excel文件'
      });
    }

    const prisma = require('../prisma').default;
    
    console.log('🔄 开始导入（完全覆盖模式）...');
    
    // ⚠️ 先收集所有Excel中的policyId，用于后续清理不在Excel中的产品
    console.log('📥 第1步：解析Excel文件...');
    
    console.log('📥 开始导入产品数据...');
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    
    // 从buffer读取Excel
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.worksheets[0];
    
    if (!worksheet) {
      return res.status(400).json({
        success: false,
        message: 'Excel文件格式错误：找不到工作表'
      });
    }

    // 读取表头（第一行）
    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell: any, colNumber: number) => {
      headers[colNumber - 1] = String(cell.value || '').trim();
    });

    console.log('表头:', headers);

    // 检查必需列
    const requiredColumns = ['保险产品ID号', '公司名称', '保险产品名称', '保险大类'];
    const missingColumns = requiredColumns.filter(col => !headers.includes(col));
    
    if (missingColumns.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Excel文件缺少必需列: ${missingColumns.join(', ')}`
      });
    }

    // 第1步：先收集所有Excel中的产品数据
    const excelProducts: any[] = [];
    const excelPolicyIds: string[] = [];

    for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
      const row = worksheet.getRow(rowNum);
      if (!row.hasValues) continue;

      const rowData: any = {};
      headers.forEach((header, index) => {
        const cell = row.getCell(index + 1);
        rowData[header] = cell.value ? String(cell.value).trim() : '';
      });

      const productData = {
        productIDNumber: rowData['保险产品ID号'] || null,
        insuranceCompany: rowData['公司名称'] || '',
        productName: rowData['保险产品名称'] || '',
        productCategory: rowData['保险大类'] || '',
        productSubCategory: rowData['保险小类'] || null,
        coveragePeriod: rowData['保障期限'] || null,
        paymentPeriod: rowData['交费期限'] || null,
        salesStatus: rowData['销售状态'] || '在售',
        diseaseCount: rowData['疾病责任数'] ? parseInt(rowData['疾病责任数']) : undefined,
        deathCount: rowData['身故责任数'] ? parseInt(rowData['身故责任数']) : undefined,
        accidentCount: rowData['意外责任数'] ? parseInt(rowData['意外责任数']) : undefined,
        annuityCount: rowData['年金责任数'] ? parseInt(rowData['年金责任数']) : undefined
      };

      if (productData.insuranceCompany && productData.productName && productData.productCategory) {
        excelProducts.push(productData);
        if (productData.productIDNumber) {
          excelPolicyIds.push(productData.productIDNumber);
        }
      }
    }

    console.log(`📋 Excel中共有 ${excelProducts.length} 条有效产品`);

    // 第2步：删除所有产品（先清空再导入，简单粗暴）
    console.log('🗑️  第2步：清空现有产品...');
    const deleteResult = await prisma.insuranceProduct.deleteMany({});
    console.log(`  ✅ 已删除 ${deleteResult.count} 个产品`);

    // 第3步：批量插入新产品
    console.log('📥 第3步：批量插入产品...');
    let successCount = 0;
    let failCount = 0;

    for (const productData of excelProducts) {
      try {
        await productStorage.create({
          ...productData,
          source: 'imported'
        });
        successCount++;
      } catch (error: any) {
        console.error(`插入失败: ${productData.productIDNumber || productData.productName}`, error.message);
        failCount++;
      }
    }

    console.log(`✅ 导入完成：成功 ${successCount} 条，失败 ${failCount} 条`);

    // 🔄 从责任库重新统计责任数量
    console.log('🔄 开始从责任库重新统计责任数量...');
    await recalculateResponsibilityCounts(prisma);
    console.log('✅ 责任数量统计完成');

    res.json({
      success: true,
      message: `导入完成`,
      count: successCount,
      failed: failCount,
      total: successCount + failCount
    });
  } catch (error: any) {
    console.error('导入产品数据失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '导入失败'
    });
  }
});

/**
 * 从责任库重新统计责任数量并更新到产品库
 */
async function recalculateResponsibilityCounts(prisma: any) {
  try {
    // 获取所有责任库记录
    const allCoverages = await prisma.insuranceCoverageLibrary.findMany({
      select: {
        policyIdNumber: true,
        coverageType: true
      }
    });

    console.log(`  📊 共找到 ${allCoverages.length} 条责任记录`);

    // 按保单ID号分组统计
    const countsByPolicyId: { [key: string]: { diseaseCount: number, deathCount: number, accidentCount: number, annuityCount: number } } = {};

    for (const coverage of allCoverages) {
      const policyId = coverage.policyIdNumber;
      if (!policyId) continue;

      if (!countsByPolicyId[policyId]) {
        countsByPolicyId[policyId] = {
          diseaseCount: 0,
          deathCount: 0,
          accidentCount: 0,
          annuityCount: 0
        };
      }

      // 根据责任类型累加
      if (coverage.coverageType === '疾病责任') {
        countsByPolicyId[policyId].diseaseCount++;
      } else if (coverage.coverageType === '身故责任') {
        countsByPolicyId[policyId].deathCount++;
      } else if (coverage.coverageType === '意外责任') {
        countsByPolicyId[policyId].accidentCount++;
      } else if (coverage.coverageType === '年金责任') {
        countsByPolicyId[policyId].annuityCount++;
      }
    }

    console.log(`  📊 找到 ${Object.keys(countsByPolicyId).length} 个产品需要更新责任数量`);

    // 更新产品库
    let updatedCount = 0;
    for (const [policyId, counts] of Object.entries(countsByPolicyId)) {
      const product = await prisma.insuranceProduct.findFirst({
        where: { policyId }
      });

      if (product) {
        await prisma.insuranceProduct.update({
          where: { id: product.id },
          data: {
            diseaseCount: counts.diseaseCount,
            deathCount: counts.deathCount,
            accidentCount: counts.accidentCount,
            annuityCount: counts.annuityCount
          }
        });
        updatedCount++;
        console.log(`    ✓ 更新产品 ${policyId}: 疾病${counts.diseaseCount}|身故${counts.deathCount}|意外${counts.accidentCount}|年金${counts.annuityCount}`);
      } else {
        console.log(`    ⚠️  找不到产品 ${policyId}，跳过`);
      }
    }

    console.log(`  ✅ 成功更新 ${updatedCount} 个产品的责任数量`);
  } catch (error: any) {
    console.error('  ❌ 重新统计责任数量失败:', error.message);
    throw error;
  }
}

export { router as productRouter };

