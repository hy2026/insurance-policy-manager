/**
 * 解析服务路由
 */

import { Router } from 'express';
import { ParseService } from '../services/parser/parseService';

const router = Router();
const parseService = new ParseService();

// 健康检查
router.get('/health', async (req, res) => {
  try {
    const health = await parseService.healthCheck();
    res.json({
      success: true,
      ...health
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      status: 'error',
      message: error.message || '健康检查失败'
    });
  }
});

// 清除缓存
router.post('/clear-cache', async (req, res) => {
  try {
    const result = parseService.clearCache();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || '清除缓存失败'
    });
  }
});

// 解析单条条款
router.post('/', async (req, res) => {
  try {
    const { clauseText, coverageType, policyInfo } = req.body;

    if (!clauseText || !coverageType) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数：clauseText, coverageType'
      });
    }

    const result = await parseService.parse({
      clauseText,
      coverageType,
      policyInfo
    });

    console.log('✅ [ParseRouter] 准备返回结果给前端...');
    console.log(`📊 [ParseRouter] 结果大小: ${JSON.stringify(result).length} 字符`);
    
    res.json(result);
    
    console.log('✅ [ParseRouter] 结果已发送');
  } catch (error: any) {
    console.error('❌ [ParseRouter] 解析错误:', error);
    console.error('❌ [ParseRouter] 错误堆栈:', error.stack);
    res.status(500).json({
      success: false,
      message: error.message || '服务器内部错误'
    });
  }
});

// 批量解析
router.post('/batch', async (req, res) => {
  try {
    const { clauses } = req.body;

    if (!Array.isArray(clauses) || clauses.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'clauses 必须是非空数组'
      });
    }

    const results = await Promise.all(
      clauses.map(clause => 
        parseService.parse({
          clauseText: clause.clauseText,
          coverageType: clause.coverageType,
          policyInfo: clause.policyInfo
        })
      )
    );

    res.json({
      success: true,
      results
    });
  } catch (error: any) {
    console.error('批量解析错误:', error);
    res.status(500).json({
      success: false,
      message: error.message || '服务器内部错误'
    });
  }
});

export { router as parseRouter };

