const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('🔍 功能完整性检查');
console.log('='.repeat(60));

// 检查后端路由
console.log('\n📋 1. 后端API路由检查:\n');

// 读取责任库路由
const coverageRouter = fs.readFileSync('./src/routes/coverageLibraryRouter.ts', 'utf8');
console.log('责任库 (coverageLibraryRouter.ts):');
console.log('  ✅ GET  / (查询列表):', coverageRouter.includes("router.get('/',"));
console.log('  ✅ GET  /stats (统计):', coverageRouter.includes("router.get('/stats'"));
console.log('  ✅ GET  /export (导出):', coverageRouter.includes("router.get('/export'"));
console.log('  ✅ POST /import (导入):', coverageRouter.includes("router.post('/import'"));

// 读取产品库路由
const productRouter = fs.readFileSync('./src/routes/productRouter.ts', 'utf8');
console.log('\n产品库 (productRouter.ts):');
console.log('  ✅ GET  / (查询列表):', productRouter.includes("router.get('/',"));
console.log('  ✅ POST / (创建):', productRouter.includes("router.post('/',"));
console.log('  ✅ POST /import (导入):', productRouter.includes("router.post('/import'"));
console.log('  ⚠️  GET  /export (导出):', productRouter.includes("router.get('/export'") || productRouter.includes("'/export'"));

// 检查前端页面
console.log('\n📋 2. 前端页面检查:\n');

// 读取责任库页面
const coverageLibraryPage = fs.readFileSync('../frontend/src/pages/CoverageLibraryPage.tsx', 'utf8');
console.log('责任库页面 (CoverageLibraryPage.tsx):');
console.log('  ✅ 导入按钮:', coverageLibraryPage.includes('ImportOutlined') || coverageLibraryPage.includes('导入'));
console.log('  ✅ 导出按钮:', coverageLibraryPage.includes('ExportOutlined') && coverageLibraryPage.includes('导出'));

// 读取产品库页面
const productLibraryPage = fs.readFileSync('../frontend/src/pages/ProductLibraryPage.tsx', 'utf8');
console.log('\n产品库页面 (ProductLibraryPage.tsx):');
console.log('  ✅ 导入按钮:', productLibraryPage.includes('ImportOutlined') && productLibraryPage.includes('导入'));
console.log('  ✅ 导出按钮:', productLibraryPage.includes('ExportOutlined') && productLibraryPage.includes('导出'));

// 检查multer（文件上传）
console.log('\n📋 3. 依赖包检查:\n');
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
console.log('  ✅ multer (文件上传):', !!packageJson.dependencies?.multer);
console.log('  ✅ exceljs (Excel处理):', coverageRouter.includes('ExcelJS') && productRouter.includes('ExcelJS'));

console.log('\n' + '='.repeat(60));
console.log('✅ 功能检查完成');
console.log('='.repeat(60));
