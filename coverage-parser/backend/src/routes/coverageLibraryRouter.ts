/**
 * 责任库管理路由
 */

import { Router } from 'express';
import { coverageLibraryStorage } from '../services/parser/storage/coverageLibraryStorage';
import { productLibraryStorage } from '../services/parser/storage/productLibraryStorage';

const router = Router();

/**
 * 保存解析后的责任到库
 * POST /api/coverage-library/save
 */
router.post('/save', async (req, res) => {
  try {
    const {
      insuranceCompany,
      productName,
      policyType,
      coverages // 责任数组
    } = req.body;

    if (!insuranceCompany || !productName || !coverages || !Array.isArray(coverages)) {
      return res.status(400).json({
        success: false,
        message: '缺少必需参数：insuranceCompany, productName, coverages'
      });
    }

    // 1. 查找或创建产品
    const product = await productLibraryStorage.findOrCreate({
      insuranceCompany,
      productName,
      policyType: policyType || 'critical_illness'
    });

    console.log(`✅ 产品ID: ${product.id} - ${product.productName}`);

    // 2. 批量保存责任
    const savedCoverages = [];
    for (const coverage of coverages) {
      const savedCoverage = await coverageLibraryStorage.create({
        productId: product.id,
        coverageType: coverage.type || 'disease',
        coverageName: coverage.name,
        diseaseCategory: coverage.diseaseCategory,
        clauseText: coverage.clause,
        parsedResult: coverage.result,
        parseMethod: coverage.result?.parseMethod || 'llm',
        confidenceScore: coverage.result?.overallConfidence,
        isTrainingSample: true, // 默认作为训练样本
        annotationQuality: coverage.result?.overallConfidence >= 0.8 ? 'high' : 'medium'
      });

      savedCoverages.push(savedCoverage);
    }

    console.log(`✅ 已保存 ${savedCoverages.length} 条责任到库`);

    res.json({
      success: true,
      message: `成功保存${savedCoverages.length}条责任`,
      data: {
        productId: product.id,
        coverageIds: savedCoverages.map(c => c.id),
        count: savedCoverages.length
      }
    });
  } catch (error: any) {
    console.error('保存责任到库失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * 获取所有责任（支持分页、筛选、排序）
 * GET /api/coverage-library
 */
router.get('/', async (req, res) => {
  try {
    const {
      page = '1',
      pageSize = '20',
      保单ID号,
      责任类型,
      责任名称,
      是否可以重复赔付,
      是否分组,
      是否豁免,
      是否已审核,
      sortBy = '序号',
      sortOrder = 'asc'
    } = req.query;

    console.log('收到请求:', { page, pageSize, 保单ID号, 责任类型, 责任名称 });

    // 清理空字符串，转换为undefined
    const cleanFilters: any = {};
    if (保单ID号 && 保单ID号 !== '') cleanFilters.保单ID号 = 保单ID号 as string;
    if (责任类型 && 责任类型 !== '') cleanFilters.责任类型 = 责任类型 as string;
    if (责任名称 && 责任名称 !== '') cleanFilters.责任名称 = 责任名称 as string;
    if (是否可以重复赔付 === 'true') cleanFilters.是否可以重复赔付 = true;
    else if (是否可以重复赔付 === 'false') cleanFilters.是否可以重复赔付 = false;
    if (是否分组 === 'true') cleanFilters.是否分组 = true;
    else if (是否分组 === 'false') cleanFilters.是否分组 = false;
    if (是否豁免 === 'true') cleanFilters.是否豁免 = true;
    else if (是否豁免 === 'false') cleanFilters.是否豁免 = false;
    if (是否已审核 === 'true') cleanFilters.是否已审核 = true;
    else if (是否已审核 === 'false') cleanFilters.是否已审核 = false;

    const result = await coverageLibraryStorage.findWithPagination({
      page: Number(page),
      pageSize: Number(pageSize),
      filters: cleanFilters,
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc'
    });

    console.log('查询成功，返回数据条数:', result.data.length);

    res.json({
      success: true,
      data: result.data,
      total: result.total,
      verified: result.verified,
      unverified: result.unverified
    });
  } catch (error: any) {
    console.error('获取责任列表失败:', error);
    console.error('错误堆栈:', error.stack);
    res.status(500).json({
      success: false,
      message: error.message || '服务器内部错误',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * 获取统计数据（按责任类型分组）
 * GET /api/coverage-library/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const { policyId } = req.query;
    
    // 如果提供了合同ID，返回该合同下的统计
    if (policyId) {
      const stats = await coverageLibraryStorage.getStatsByPolicyId(policyId as string);
      res.json({
        success: true,
        data: stats
      });
    } else {
      // 否则返回全部统计
      const stats = await coverageLibraryStorage.getStatsByType();
      res.json({
        success: true,
        data: stats
      });
    }
  } catch (error: any) {
    console.error('获取统计数据失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * 获取合同统计信息（合同数量、责任总数、合同ID列表）
 * GET /api/coverage-library/contract-stats
 */
router.get('/contract-stats', async (req, res) => {
  try {
    const stats = await coverageLibraryStorage.getContractStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    console.error('获取合同统计失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * 导出责任库数据（Excel格式，4个sheet）
 * GET /api/coverage-library/export
 * 注意：必须在 /:id 路由之前定义，避免 "export" 被当作 id
 */
router.get('/export', async (req, res) => {
  try {
    console.log('开始导出数据...');
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    
    // 获取所有数据（不应用筛选条件，导出全量数据）
    console.log('正在获取数据...');
    const allData = await coverageLibraryStorage.exportData({});
    console.log(`获取到 ${allData.length} 条数据`);
    
    if (!Array.isArray(allData)) {
      throw new Error(`exportData返回的数据格式不正确，期望数组，实际: ${typeof allData}`);
    }
    
    // 按责任类型分组
    const typeMapping: { [key: string]: string[] } = {
      '疾病责任': ['疾病责任', '疾病类'],
      '身故责任': ['身故责任', '身故类'],
      '意外责任': ['意外责任', '意外类'],
      '年金责任': ['年金责任', '年金类']
    };
    
    const types = ['疾病责任', '身故责任', '意外责任', '年金责任'];
    
    // 为每个责任类型创建一个sheet
    for (const type of types) {
      const typesToQuery = typeMapping[type] || [type];
      const typeData = allData.filter((item: any) => {
        if (!item) return false;
        const coverageType = item.责任类型 || item.coverageType;
        return coverageType && typesToQuery.includes(coverageType);
      });
      
      console.log(`${type}: ${typeData.length} 条数据`);
      
      const worksheet = workbook.addWorksheet(type);
      
      // 设置表头
      const headers = [
        '序号', '保单ID号', '责任名称', '责任原文', '自然语言描述', 
        '赔付金额', '赔付次数', '是否可以重复赔付', '是否分组', 
        '间隔期', '是否豁免', '审核状态', '解析结果JSON'
      ];
      
      worksheet.columns = headers.map(header => {
        // JSON列需要更宽的宽度
        if (header === '解析结果JSON') {
          return { header, key: header, width: 50 };
        }
        return { header, key: header, width: 20 };
      });
      
      // 添加数据
      if (typeData.length > 0) {
        typeData.forEach((item: any) => {
          try {
            // 提取自然语言描述
            let naturalLanguageDesc = '';
            if (Array.isArray(item.naturalLanguageDesc) && item.naturalLanguageDesc.length > 0) {
              naturalLanguageDesc = item.naturalLanguageDesc.filter((desc: any) => desc).join('；');
            } else if (item.parsedResult?.payoutAmount && Array.isArray(item.parsedResult.payoutAmount)) {
              const descs = item.parsedResult.payoutAmount
                .map((p: any) => p?.naturalLanguageDescription)
                .filter((desc: any) => desc);
              naturalLanguageDesc = descs.join('；');
            }
            
            // 提取赔付金额
            let payoutAmount = '';
            if (Array.isArray(item.payoutAmount) && item.payoutAmount.length > 0) {
              const amounts = item.payoutAmount.map((p: any) => {
                if (p?.formula) return p.formula;
                if (p?.naturalLanguageDescription) return p.naturalLanguageDescription;
                return '';
              }).filter((amt: string) => amt);
              payoutAmount = amounts.join('\n');
            } else if (item.parsedResult?.payoutAmount && Array.isArray(item.parsedResult.payoutAmount)) {
              const amounts = item.parsedResult.payoutAmount.map((p: any) => {
                if (p?.formula) return p.formula;
                if (p?.naturalLanguageDescription) return p.naturalLanguageDescription;
                return '';
              }).filter((amt: string) => amt);
              payoutAmount = amounts.join('\n');
            }
            
            // 提取JSON数据
            let jsonData = '';
            try {
              // 优先使用parsedResult，如果没有则使用整个item的parsedResult字段
              const parsedResult = item.parsedResult;
              if (parsedResult) {
                jsonData = JSON.stringify(parsedResult, null, 2);
              }
            } catch (jsonError: any) {
              console.error('JSON序列化失败:', jsonError);
              jsonData = '';
            }
            
            const row: any = {
              '序号': item.序号 || '',
              '保单ID号': item.保单ID号 || '',
              '责任名称': item.责任名称 || item.coverageName || '',
              '责任原文': item.责任原文 || item.clauseText || '',
              '自然语言描述': naturalLanguageDesc,
              '赔付金额': payoutAmount,
              '赔付次数': item.赔付次数 || '1次',
              '是否可以重复赔付': item.赔付次数 === '1次' && (item.是否可以重复赔付 === undefined || item.是否可以重复赔付 === null)
                ? '一次赔付不涉及'
                : (item.是否可以重复赔付 ? '可重复' : '不可重复'),
              '是否分组': item.赔付次数 === '1次' && (item.是否分组 === undefined || item.是否分组 === null)
                ? '一次赔付不涉及'
                : (item.是否分组 ? '是' : '否'),
              '间隔期': item.赔付次数 === '1次' && (!item.间隔期 || item.间隔期 === '')
                ? '一次赔付不涉及'
                : (item.间隔期 || '无间隔期'),
              '是否豁免': item.是否豁免 ? '是' : '否',
              '审核状态': item.verified ? '已审核' : '未审核',
              '解析结果JSON': jsonData
            };
            const addedRow = worksheet.addRow(row);
            
            // 设置JSON列为文本格式，并启用自动换行
            const jsonColumnIndex = headers.indexOf('解析结果JSON') + 1;
            if (jsonColumnIndex > 0 && addedRow.getCell(jsonColumnIndex)) {
              addedRow.getCell(jsonColumnIndex).alignment = { 
                wrapText: true, 
                vertical: 'top' 
              };
            }
          } catch (rowError: any) {
            console.error(`添加行数据失败 (${type}):`, rowError, item);
            // 继续处理下一条数据，不中断整个导出
          }
        });
      }
      
      // 设置表头样式
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6F3FF' }
      };
    }
    
    console.log('开始写入Excel文件...');
    
    // 设置响应头（文件名需要URL编码以支持中文）
    const filename = `责任库导出-${Date.now()}.xlsx`;
    const encodedFilename = encodeURIComponent(filename);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
    
    // 写入响应
    await workbook.xlsx.write(res);
    console.log('Excel文件写入完成');
    res.end();
  } catch (error: any) {
    console.error('导出失败:', error);
    console.error('错误堆栈:', error.stack);
    res.status(500).json({
      success: false,
      message: error.message || '导出失败',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * 获取责任详情
 * GET /api/coverage-library/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const coverage = await coverageLibraryStorage.findById(Number(req.params.id));
    
    if (!coverage) {
      return res.status(404).json({
        success: false,
        message: '责任不存在'
      });
    }

    res.json({
      success: true,
      data: coverage
    });
  } catch (error: any) {
    console.error('获取责任详情失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * 标记为已验证
 * POST /api/coverage-library/:id/verify
 */
router.post('/:id/verify', async (req, res) => {
  try {
    const { verifiedBy } = req.body;

    if (!verifiedBy) {
      return res.status(400).json({
        success: false,
        message: '缺少verifiedBy参数'
      });
    }

    const coverage = await coverageLibraryStorage.markAsVerified(
      Number(req.params.id),
      verifiedBy
    );

    res.json({
      success: true,
      data: coverage
    });
  } catch (error: any) {
    console.error('标记验证失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * 更新责任
 * PUT /api/coverage-library/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const updates = req.body;
    const coverage = await coverageLibraryStorage.update(Number(req.params.id), updates);

    res.json({
      success: true,
      data: coverage
    });
  } catch (error: any) {
    console.error('更新责任失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * 删除责任
 * DELETE /api/coverage-library/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    await coverageLibraryStorage.delete(Number(req.params.id));

    res.json({
      success: true,
      message: '删除成功'
    });
  } catch (error: any) {
    console.error('删除责任失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * 获取统计信息
 * GET /api/coverage-library/stats/summary
 */
router.get('/stats/summary', async (req, res) => {
  try {
    const stats = await coverageLibraryStorage.getStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    console.error('获取统计信息失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * 导入解析结果JSON
 * POST /api/coverage-library/import
 */
router.post('/import', async (req, res) => {
  try {
    const { cases, batchInfo } = req.body; // cases是解析结果数组

    if (!cases || !Array.isArray(cases)) {
      return res.status(400).json({
        success: false,
        message: '缺少cases数组'
      });
    }

    const result = await coverageLibraryStorage.importFromJson(cases, batchInfo);

    res.json({
      success: true,
      message: `成功导入${result.count}条责任`,
      data: result
    });
  } catch (error: any) {
    console.error('导入失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


export { router as coverageLibraryRouter };


























