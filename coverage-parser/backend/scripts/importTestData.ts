/**
 * 测试导入脚本 - 导入序号1-10的数据
 * 
 * 使用方法：
 * ts-node scripts/importTestData.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { coverageLibraryStorage } from '../src/services/parser/storage/coverageLibraryStorage'

async function importTestData() {
  console.log('\n开始导入测试数据（序号1-10）...\n')

  // 读取JSON文件
  const filePath = path.resolve(__dirname, '../../../解析结果/解析结果-批次1-序号1-200.json')
  const fileContent = fs.readFileSync(filePath, 'utf-8')
  const jsonData = JSON.parse(fileContent)

  // 提取cases数组
  const allCases = jsonData.cases || jsonData
  if (!Array.isArray(allCases)) {
    throw new Error('JSON文件格式错误：找不到cases数组')
  }

  // 提取序号1-10的数据
  const testCases = allCases.filter((item: any) => {
    const 序号 = item.序号 || item['序号']
    return 序号 >= 1 && 序号 <= 10
  })

  console.log(`找到 ${testCases.length} 条测试数据（序号1-10）\n`)

  // 显示将要导入的数据
  console.log('将要导入的数据：')
  testCases.forEach((item: any) => {
    console.log(`  序号${item.序号 || item['序号']}: ${item.责任名称 || item['责任名称']}`)
  })
  console.log()

  // 导入数据
  const batchInfo = {
    批次: '测试批次',
    序号范围: '1-10',
    生成时间: new Date().toISOString()
  }

  const result = await coverageLibraryStorage.importFromJson(testCases, batchInfo)

  console.log('\n导入完成！')
  console.log(`✅ 成功: ${result.success} 条`)
  console.log(`❌ 失败: ${result.failed} 条`)
  console.log(`📊 总计: ${result.count} 条\n`)

  if (result.failed > 0) {
    console.log('⚠️  有数据导入失败，请检查日志')
  }

  return result
}

// 主函数
async function main() {
  try {
    await importTestData()
    console.log('✅ 测试数据导入成功！')
    console.log('💡 现在可以在前端访问 http://localhost:3000/coverage-library 查看数据\n')
    process.exit(0)
  } catch (error: any) {
    console.error('❌ 导入失败:', error.message)
    console.error(error)
    process.exit(1)
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
}

export { importTestData }










