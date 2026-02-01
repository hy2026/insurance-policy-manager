/**
 * 从“责任库导出-*.xlsx”导入到责任库（完全覆盖模式）
 *
 * 使用方法：
 *   npx ts-node-dev --transpile-only scripts/importCoverageLibraryFromXlsx.ts <xlsx文件路径>
 *
 * 例如（从仓库根目录执行）：
 *   cd coverage-parser/backend
 *   npx ts-node-dev --transpile-only scripts/importCoverageLibraryFromXlsx.ts ../../责任库导出-1769928160911.xlsx
 *
 * 注意：
 * - 该脚本会先清空责任库（不影响产品库）
 * - 需要正确的 DATABASE_URL（本地/或 Railway Postgres）
 */
import ExcelJS from 'exceljs'
import * as fs from 'fs'
import * as path from 'path'
import prisma from '../src/prisma'
import { coverageLibraryStorage } from '../src/services/parser/storage/coverageLibraryStorage'

function normalizeCoverageTypeFromSheetName(sheetName: string): string {
  const raw = (sheetName || '').trim()
  // 支持 “疾病责任 -导入” / “疾病责任_导入” 等
  const cleaned = raw.replace(/\s*[-_].*$/, '').trim()

  const typeMapping: Record<string, string> = {
    疾病类: '疾病责任',
    身故类: '身故责任',
    意外类: '意外责任',
    年金类: '年金责任',
  }

  return typeMapping[cleaned] || cleaned || '疾病责任'
}

function cellToString(value: ExcelJS.CellValue | undefined | null): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value instanceof Date) return value.toISOString()

  // exceljs 复杂类型兜底
  if (typeof value === 'object') {
    const anyVal: any = value
    if (anyVal.text) return String(anyVal.text)
    if (Array.isArray(anyVal.richText)) {
      return anyVal.richText.map((t: any) => t?.text ?? '').join('')
    }
    if (anyVal.result !== undefined) return String(anyVal.result)
    if (anyVal.hyperlink) return String(anyVal.hyperlink)
  }
  return String(value as any)
}

function parseJsonSafe(text: string): any | null {
  const trimmed = (text || '').trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

async function loadCasesFromXlsx(xlsxPath: string): Promise<any[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(xlsxPath)

  const allCases: any[] = []

  for (const worksheet of workbook.worksheets) {
    if (!worksheet || worksheet.rowCount <= 1) continue

    const 责任类型 = normalizeCoverageTypeFromSheetName(worksheet.name)

    const headerRow = worksheet.getRow(1)
    const headerToCol: Record<string, number> = {}
    headerRow.eachCell((cell, colNumber) => {
      const header = cellToString(cell.value).trim()
      if (header) headerToCol[header] = colNumber
    })

    const getByHeader = (row: ExcelJS.Row, header: string): string => {
      const col = headerToCol[header]
      if (!col) return ''
      return cellToString(row.getCell(col).value).trim()
    }

    for (let r = 2; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r)

      const 序号 = getByHeader(row, '序号')
      const 保单ID号 = getByHeader(row, '保单ID号')
      const 责任名称 = getByHeader(row, '责任名称')
      const 是否必选 = getByHeader(row, '可选/必选') || getByHeader(row, '是否必选')
      const 责任原文 = getByHeader(row, '责任原文')

      // 可选字段（用于保留审核/AI信息）
      const reviewStatus = getByHeader(row, '审批结果') || 'pending'
      const reviewNotes = getByHeader(row, '审批备注') || ''
      const aiModifiedText = getByHeader(row, 'AI是否修改')
      const aiModificationNote = getByHeader(row, 'AI修改说明') || ''

      const parsedJsonText = getByHeader(row, '解析结果JSON')
      const parsedJson = parseJsonSafe(parsedJsonText)

      // 以“解析结果JSON”为主（如果存在），否则用表格列构造
      const base = parsedJson && typeof parsedJson === 'object' ? parsedJson : {}
      const caseItem: any = {
        ...base,
        序号: base.序号 ?? (序号 ? Number(序号) : undefined),
        保单ID号: base.保单ID号 ?? 保单ID号,
        责任类型: base.责任类型 ?? 责任类型,
        责任名称: base.责任名称 ?? 责任名称,
        责任原文: base.责任原文 ?? 责任原文,
        是否必选: base.是否必选 ?? 是否必选,
        reviewStatus: base.reviewStatus ?? reviewStatus,
        reviewNotes: base.reviewNotes ?? (reviewNotes || null),
        aiModified:
          base.aiModified ??
          (aiModifiedText === 'true' ? true : aiModifiedText === 'false' ? false : undefined),
        aiModificationNote: base.aiModificationNote ?? aiModificationNote,
      }

      // 跳过空行
      if (!caseItem.责任名称 && !caseItem.责任原文 && !caseItem.保单ID号) continue

      allCases.push(caseItem)
    }
  }

  return allCases
}

async function main() {
  const args = process.argv.slice(2)
  const xlsxArg = args[0]
  if (!xlsxArg) {
    console.error('请提供xlsx文件路径')
    console.error('用法: npx ts-node-dev --transpile-only scripts/importCoverageLibraryFromXlsx.ts <xlsx文件路径>')
    process.exit(1)
  }

  const xlsxPath = path.resolve(xlsxArg)
  if (!fs.existsSync(xlsxPath)) {
    console.error(`文件不存在: ${xlsxPath}`)
    process.exit(1)
  }

  console.log(`\n📄 读取Excel: ${xlsxPath}`)
  const cases = await loadCasesFromXlsx(xlsxPath)
  console.log(`📋 汇总得到 ${cases.length} 条责任记录`)

  if (cases.length === 0) {
    console.error('未解析到任何记录，请检查Excel是否包含表头与数据行')
    process.exit(1)
  }

  console.log('🗑️  第1步：清空责任库（保留产品库）...')
  await coverageLibraryStorage.clearAll()

  console.log('📥 第2步：批量导入责任...')
  const result = await coverageLibraryStorage.importFromJson(cases, {
    source: 'xlsx_import',
    file: path.basename(xlsxPath),
    importTime: new Date().toISOString(),
  })

  const finalCount = await prisma.insuranceCoverageLibrary.count()
  console.log(`\n✅ 导入完成：success=${result.success} failed=${result.failed}（数据库实际：${finalCount}）\n`)

  await prisma.$disconnect()
  process.exit(0)
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('导入失败:', err?.message || err)
    try {
      await prisma.$disconnect()
    } catch {
      // ignore
    }
    process.exit(1)
  })
}

