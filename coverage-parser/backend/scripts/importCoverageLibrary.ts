/**
 * 从解析结果JSON文件导入数据到责任库
 * 
 * 使用方法：
 * ts-node scripts/importCoverageLibrary.ts <json文件路径>
 * 
 * 例如：
 * ts-node scripts/importCoverageLibrary.ts ../../解析结果/解析结果-批次1-序号1-200.json
 */

import * as fs from 'fs'
import * as path from 'path'
import { coverageLibraryStorage } from '../src/services/parser/storage/coverageLibraryStorage'

async function importFromFile(filePath: string) {
  console.log(`\n开始导入: ${filePath}\n`)

  // 读取JSON文件
  const fileContent = fs.readFileSync(filePath, 'utf-8')
  const jsonData = JSON.parse(fileContent)

  // 提取cases数组
  const cases = jsonData.cases || jsonData
  if (!Array.isArray(cases)) {
    throw new Error('JSON文件格式错误：找不到cases数组')
  }

  console.log(`找到 ${cases.length} 条数据\n`)

  // 提取批次信息
  const batchInfo = {
    批次: jsonData.批次,
    序号范围: jsonData.序号范围,
    生成时间: jsonData.生成时间
  }

  // 导入数据
  const result = await coverageLibraryStorage.importFromJson(cases, batchInfo)

  console.log('\n导入完成！')
  console.log(`成功: ${result.success} 条`)
  console.log(`失败: ${result.failed} 条`)
  console.log(`总计: ${result.count} 条\n`)

  return result
}

// 主函数
async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.error('请提供JSON文件路径')
    console.error('使用方法: ts-node scripts/importCoverageLibrary.ts <json文件路径>')
    process.exit(1)
  }

  const filePath = path.resolve(args[0])

  if (!fs.existsSync(filePath)) {
    console.error(`文件不存在: ${filePath}`)
    process.exit(1)
  }

  try {
    await importFromFile(filePath)
    process.exit(0)
  } catch (error: any) {
    console.error('导入失败:', error.message)
    console.error(error)
    process.exit(1)
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
}

export { importFromFile }








