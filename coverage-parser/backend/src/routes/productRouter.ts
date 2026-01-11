/**
 * 产品库路由
 */

import { Router } from 'express';
import { ProductLibraryStorage } from '../services/parser/storage/productLibraryStorage';

const router = Router();
const productStorage = new ProductLibraryStorage();

// 获取产品列表
router.get('/', async (req, res) => {
  try {
    const { policyType, insuranceCompany } = req.query;

    const filters: any = {};
    if (policyType) filters.policyType = String(policyType);
    if (insuranceCompany) filters.insuranceCompany = String(insuranceCompany);

    const products = await productStorage.findAll(filters);

    res.json({
      success: true,
      data: products
    });
  } catch (error: any) {
    console.error('获取产品列表错误:', error);
    res.status(500).json({
      success: false,
      message: error.message
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

export { router as productRouter };

