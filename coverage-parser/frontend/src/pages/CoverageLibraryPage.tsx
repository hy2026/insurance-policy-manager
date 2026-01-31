import { useState, useEffect } from 'react'
import { 
  Table, 
  Card, 
  Input, 
  Select, 
  Button, 
  Tag, 
  Space, 
  message,
  Row,
  Col,
  Tooltip,
  Upload,
  Modal
} from 'antd'
import {
  SearchOutlined,
  ExportOutlined,
  ImportOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import CoverageDetailModal from '../components/CoverageDetailModal'
import { getCoverageLibrary, exportCoverageLibrary, getCoverageLibraryStats, getContractStats } from '../services/api'
import * as ExcelJS from 'exceljs'

const { Option } = Select

// 责任数据类型
interface CoverageItem {
  id: number
  序号?: number
  保单ID号?: string
  责任类型: string
  责任名称: string
  责任小类?: string // 重疾责任/中症责任/轻症责任/前症责任/其他疾病责任
  责任层级?: string // 主责任/副责任
  isRequired?: string // 可选/必选
  责任原文: string
  naturalLanguageDesc?: any[]
  payoutAmount?: any[]
  note?: string
  赔付次数?: string
  是否可以重复赔付?: boolean
  是否分组?: boolean
  间隔期?: string
  是否豁免?: boolean
  verified?: boolean
  reviewStatus?: string // pending/approved/rejected
  reviewNotes?: string
  reviewedBy?: string
  reviewedAt?: string
  aiModified?: boolean // AI是否修改过
  aiModifiedAt?: string
  aiModificationNote?: string
  parsedResult?: any
  createdAt: string
}

export default function CoverageLibraryPage() {
  const [data, setData] = useState<CoverageItem[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20
  })
  
  // 筛选条件
  const [filters, setFilters] = useState({
    保单ID号: '',
    责任类型: '',
    责任名称: '',
    isRequired: '',
    赔付次数: '',
    是否可以重复赔付: '',
    是否分组: '',
    是否豁免: '',
    是否已审核: '',
    reviewStatus: '',
    aiModified: '',
    sortBy: '',
    sortOrder: 'asc' as 'asc' | 'desc'
  })
  
  // 详情弹窗
  const [selectedItem, setSelectedItem] = useState<CoverageItem | null>(null)
  const [detailVisible, setDetailVisible] = useState(false)
  
  
  // 当前选中的责任类型标签页（默认疾病责任）
  const [activeTab, setActiveTab] = useState<string>('疾病责任')
  
  // 统计数据 - 按责任类型分组
  const [stats, setStats] = useState({
    total: 0,
    verified: 0,
    unverified: 0,
    byType: {
      疾病责任: { total: 0, verified: 0, unverified: 0 },
      身故责任: { total: 0, verified: 0, unverified: 0 },
      意外责任: { total: 0, verified: 0, unverified: 0 },
      年金责任: { total: 0, verified: 0, unverified: 0 }
    }
  })

  // 合同统计信息
  const [contractStats, setContractStats] = useState({
    contractCount: 0,
    totalCoverageCount: 0,
    policyIds: [] as string[]
  })

  // 选中的合同ID（用于筛选）
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | undefined>(undefined)

  // 初始化时加载合同统计
  useEffect(() => {
    loadContractStats()
  }, [])

  // 当筛选条件变化时，重新加载数据和统计
  useEffect(() => {
    loadStats()
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.current, pagination.pageSize, JSON.stringify(filters), activeTab, selectedPolicyId])

  // 加载合同统计信息
  const loadContractStats = async () => {
    try {
      const contractStatsData = await getContractStats()
      setContractStats(contractStatsData)
    } catch (error) {
      console.error('加载合同统计失败:', error)
    }
  }

  // 加载统计数据
  const loadStats = async () => {
    try {
      const statsData = await getCoverageLibraryStats(selectedPolicyId)
      setStats(statsData)
    } catch (error) {
      console.error('加载统计数据失败:', error)
    }
  }

  const loadData = async () => {
    try {
      setLoading(true)
      
      // 清理空字符串的筛选条件
      const cleanFilters: any = {}
      Object.keys(filters).forEach(key => {
        const value = filters[key as keyof typeof filters]
        if (value !== '' && value !== undefined && value !== null) {
          cleanFilters[key] = value
        }
      })
      
      // 根据当前选中的标签页，自动添加责任类型筛选
      const finalFilters = {
        ...cleanFilters,
        责任类型: activeTab,
        保单ID号: selectedPolicyId || cleanFilters.保单ID号,
        sortBy: cleanFilters.sortBy || '序号',
        sortOrder: cleanFilters.sortOrder || 'asc'
      }
      
      const response = await getCoverageLibrary({
        page: pagination.current,
        pageSize: pagination.pageSize,
        ...finalFilters
      })
      
      // 确保data是数组
      const dataArray = Array.isArray(response.data) ? response.data : []
      
      setData(dataArray)
      setTotal(response.total || 0)
    } catch (error: any) {
      console.error('加载数据失败:', error)
      message.error(`加载数据失败: ${error.message || '未知错误'}`)
    } finally {
      setLoading(false)
    }
  }


  const handleExport = async () => {
    try {
      message.loading('正在导出...', 0)
      await exportCoverageLibrary(filters)
      message.destroy()
      message.success('导出成功')
    } catch (error) {
      message.destroy()
      message.error('导出失败')
    }
  }

  // 导入Excel
  const handleImport = async (file: File) => {
    // 显示确认对话框
    Modal.confirm({
      title: '⚠️ 确认导入责任库',
      content: (
        <div>
          <p style={{ marginBottom: '8px', fontWeight: 'bold', color: '#ff4d4f' }}>
            此操作将清空责任库，并重新导入！
          </p>
          <p style={{ marginBottom: '4px' }}>• 责任库所有数据将被清空</p>
          <p style={{ marginBottom: '4px' }}>• 产品库不受影响（完全独立）</p>
          <p style={{ marginBottom: '4px' }}>• 所有审核状态将丢失</p>
          <p>• 此操作不可撤销</p>
        </div>
      ),
      okText: '确认导入',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        await performImport(file)
      }
    })
  }

  const performImport = async (file: File) => {
    try {
      message.loading('正在导入...', 0)
      
      const workbook = new ExcelJS.Workbook()
      
      // 读取Excel文件
      const buffer = await file.arrayBuffer()
      await workbook.xlsx.load(buffer)
      
      // 收集所有cases
      const allCases: any[] = []
      
      // 遍历所有工作表（跳过非责任类型的sheet）
      for (const worksheet of workbook.worksheets) {
        if (worksheet.rowCount <= 1) {
          continue
        }
        
        // 提取责任类型（支持 "疾病责任 -导入" 这样的格式）
        let 责任类型 = worksheet.name.trim()
        
        // 移除可能的后缀（如 "-导入", " -导入" 等）
        责任类型 = 责任类型.replace(/\s*[-_].*$/, '').trim()
        
        // 标准化责任类型名称
        const typeMapping: { [key: string]: string } = {
          '疾病类': '疾病责任',
          '身故类': '身故责任',
          '意外类': '意外责任',
          '年金类': '年金责任'
        }
        责任类型 = typeMapping[责任类型] || 责任类型
        
        // 只处理有效的责任类型
        const validTypes = ['疾病责任', '身故责任', '意外责任', '年金责任']
        if (!validTypes.includes(责任类型)) {
          console.log(`跳过sheet: ${worksheet.name}（提取的责任类型"${责任类型}"不在有效列表中）`)
          continue
        }
        
        console.log(`处理sheet: ${worksheet.name} -> 责任类型: ${责任类型}`)
        
        // 获取表头
        const headerRow = worksheet.getRow(1)
        const headers: string[] = []
        headerRow.eachCell((cell: any, colNum: number) => {
          headers.push(String(cell.value || ''))
        })
        
        // 遍历数据行
        for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
          const row = worksheet.getRow(rowNum)
          
          if (!row.hasValues) continue
          
          try {
            // 读取单元格数据
            const rowData: any = {}
            headers.forEach((header, index) => {
              const cell = row.getCell(index + 1)
              rowData[header] = cell.value
            })
            
            const 序号 = rowData['序号'] || rowData['排序']
            const 保单ID号 = rowData['保单ID号']
            const 责任名称 = rowData['责任名称']
            const 责任小类 = rowData['责任小类'] || '' // 责任小类
            const 责任层级 = rowData['责任层级'] || '' // 责任层级：主责任/副责任
            let 责任原文Raw = rowData['责任原文']
            const 是否必选 = rowData['是否必选'] || rowData['可选/必选'] || '可选'
            
            // 直接读取审批结果和审批备注列
            const 审批结果Raw = rowData['审批结果'] || ''
            const 审批备注Raw = rowData['审批备注'] || ''
            
            // 特殊处理：如果责任原文是对象(ExcelJS富文本对象)，提取文本
            let 责任原文 = 责任原文Raw
            if (责任原文Raw && typeof 责任原文Raw === 'object' && 责任原文Raw.richText) {
              // 富文本对象，提取所有文本
              责任原文 = 责任原文Raw.richText.map((rt: any) => rt.text).join('')
            } else if (责任原文Raw && typeof 责任原文Raw === 'object') {
              // 如果是普通对象但没有richText，尝试从JSON中读取
              责任原文 = null
            } else {
              责任原文 = 责任原文Raw ? String(责任原文Raw) : null
            }
            
            // 如果责任原文为空，尝试从JSON中读取
            if (!责任原文 || 责任原文.trim() === '') {
              const jsonStr = rowData['解析结果JSON']
              if (jsonStr) {
                try {
                  const jsonData = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr
                  责任原文 = jsonData.责任原文 || null
                } catch (e) {
                  // JSON解析失败，继续
                }
              }
            }
            
            if (!保单ID号 || !责任名称 || !责任原文) {
              console.warn(`跳过第${序号}行: 缺少必填字段`, { 保单ID号, 责任名称, 责任原文长度: 责任原文 ? 责任原文.length : 0 })
              continue
            }
            
            // 处理审批结果和审批备注（只从Excel独立列读取，不从JSON读取）
            let reviewStatus = 'pending'
            let reviewNotes: string | null = null
            
            // 处理审批结果
            if (审批结果Raw && String(审批结果Raw).trim()) {
              const statusStr = String(审批结果Raw).trim()
              // 规范化审批结果
              if (statusStr === '通过' || statusStr === '已通过' || statusStr === 'approved') {
                reviewStatus = 'approved'
              } else if (statusStr === '未通过' || statusStr === 'rejected') {
                reviewStatus = 'rejected'
              } else if (statusStr === '待审核' || statusStr === 'pending') {
                reviewStatus = 'pending'
              } else {
                // 其他未知值，保持pending
                console.warn(`未知的审批结果值: "${statusStr}" (序号: ${序号})`)
                reviewStatus = 'pending'
              }
            }
            
            // 处理审批备注（如果为空则为null）
            if (审批备注Raw && String(审批备注Raw).trim()) {
              reviewNotes = String(审批备注Raw).trim()
            }
            
            // 解析JSON（如果有）
            let parsedResult: any = {
              序号: 序号 ? parseInt(String(序号)) : null,
              保单ID号,
              责任类型,
              责任名称,
              责任小类,
              责任层级,
              责任原文,
              是否必选
            }
            
            try {
              const jsonStr = rowData['解析结果JSON']
              if (jsonStr) {
                const jsonData = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr
                
                // 先删除JSON中的审批字段（不使用JSON中的审批信息）
                delete jsonData.reviewStatus
                delete jsonData.reviewNotes
                
                parsedResult = {
                  ...jsonData,
                  // 关键字段必须使用Excel独立列的值（不被JSON覆盖）
                  序号: 序号 ? parseInt(String(序号)) : jsonData.序号,
                  保单ID号: 保单ID号,  // 必须来自Excel列
                  责任类型: 责任类型,  // 必须来自sheet名称
                  责任名称: 责任名称,  // 必须来自Excel列
                  责任原文: 责任原文,  // 必须来自Excel列
                  责任小类: 责任小类 || jsonData.责任小类,
                  责任层级: 责任层级 || jsonData.责任层级,
                  是否必选: 是否必选 || jsonData.是否必选
                }
              }
            } catch (e) {
              // JSON解析失败，使用基本字段
            }
            
            // 最后强制设置审批信息（确保来自Excel列）
            parsedResult.reviewStatus = reviewStatus
            parsedResult.reviewNotes = reviewNotes
            
            // 最后确保"是否必选"字段存在
            if (!parsedResult.是否必选) {
              parsedResult.是否必选 = 是否必选
            }
            // 最后确保序号字段存在
            if (!parsedResult.序号 && 序号) {
              parsedResult.序号 = parseInt(String(序号))
            }
            // 最后确保"责任小类"字段存在
            if (!parsedResult.责任小类 && 责任小类) {
              parsedResult.责任小类 = 责任小类
            }
            // 最后确保"责任层级"字段存在
            if (!parsedResult.责任层级 && 责任层级) {
              parsedResult.责任层级 = 责任层级
            }
            
            allCases.push(parsedResult)
          } catch (error: any) {
            console.error(`第${rowNum}行处理失败:`, error.message)
          }
        }
      }
      
      // 调用后端导入API（增加超时时间）
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 600000) // 10分钟超时
      
      const response = await fetch('/api/coverage-library/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cases: allCases,
          batchInfo: {
            source: 'excel_import',
            importTime: new Date().toISOString()
          }
        }),
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      const result = await response.json()
      
      message.destroy()
      
      if (result.success) {
        message.success(`导入成功！共导入 ${result.data?.count || 0} 条数据`)
        loadData() // 重新加载数据
      } else {
        message.error(`导入失败: ${result.message}`)
      }
    } catch (error: any) {
      message.destroy()
      if (error.name === 'AbortError') {
        message.error('导入超时（超过10分钟），建议联系管理员分批导入')
      } else {
        message.error(`导入失败: ${error.message}`)
      }
    }
  }

  const handleViewDetail = (record: CoverageItem) => {
    setSelectedItem(record)
    setDetailVisible(true)
  }

  // 打开审核弹窗
  // 从parsedResult和note中提取字段的辅助函数
  const extractFieldFromNote = (note: string, fieldName: string): string | undefined => {
    if (!note) return undefined
    // 这里可以根据实际note的格式来解析
    // 例如：note可能是 "赔付限额:100万;最高限额互斥:是"
    const regex = new RegExp(`${fieldName}[：:]([^;，,]+)`)
    const match = note.match(regex)
    return match ? match[1].trim() : undefined
  }

  // 根据责任类型动态生成表头
  const getColumnsByType = (type: string): ColumnsType<CoverageItem> => {
    const baseColumns: ColumnsType<CoverageItem> = [
      {
        title: '序号',
        dataIndex: '序号',
        key: '序号',
        sorter: true
      },
      {
        title: '保单ID号',
        dataIndex: '保单ID号',
        key: '保单ID号',
        ellipsis: {
          showTitle: false,
        },
        filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: any) => (
          <div style={{ padding: 8 }}>
            <Input
              placeholder="搜索保单ID号"
              value={selectedKeys[0]}
              onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
              onPressEnter={() => confirm()}
              style={{ width: 188, marginBottom: 8, display: 'block' }}
            />
            <Space>
              <Button
                type="primary"
                onClick={() => confirm()}
                icon={<SearchOutlined />}
                size="small"
                style={{ width: 90 }}
              >
                搜索
              </Button>
              <Button
                onClick={() => {
                  clearFilters?.()
                  confirm()
                }}
                size="small"
                style={{ width: 90 }}
              >
                重置
              </Button>
            </Space>
          </div>
        ),
        onFilter: (value: any, record: CoverageItem) => {
          const 保单ID号 = record.保单ID号 || ''
          return 保单ID号.toString().toLowerCase().includes(value.toLowerCase())
        },
        filteredValue: filters.保单ID号 ? [filters.保单ID号] : null,
        render: (text) => (
          <Tooltip placement="topLeft" title={text}>
            {text || '-'}
          </Tooltip>
        )
      },
    {
      title: '责任名称',
      dataIndex: '责任名称',
      key: '责任名称',
      ellipsis: true,
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: any) => (
        <div style={{ padding: 8 }}>
          <Input
            placeholder="搜索责任名称"
            value={selectedKeys[0]}
            onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
            onPressEnter={() => confirm()}
            style={{ width: 188, marginBottom: 8, display: 'block' }}
          />
          <Space>
            <Button
              type="primary"
              onClick={() => confirm()}
              icon={<SearchOutlined />}
              size="small"
              style={{ width: 90 }}
            >
              搜索
            </Button>
            <Button
              onClick={() => {
                clearFilters?.()
                confirm()
              }}
              size="small"
              style={{ width: 90 }}
            >
              重置
            </Button>
          </Space>
        </div>
      ),
      onFilter: (value: any, record: CoverageItem) => {
        const 责任名称 = record.责任名称 || ''
        return 责任名称.toString().toLowerCase().includes(value.toLowerCase())
      },
      filteredValue: filters.责任名称 ? [filters.责任名称] : null
    },
    {
      title: '责任小类',
      dataIndex: '责任小类',
      key: '责任小类',
      width: 120,
      filters: [
        { text: '重疾责任', value: '重疾责任' },
        { text: '中症责任', value: '中症责任' },
        { text: '轻症责任', value: '轻症责任' },
        { text: '前症责任', value: '前症责任' },
        { text: '特定疾病责任', value: '特定疾病责任' },
        { text: '其他疾病责任', value: '其他疾病责任' }
      ],
      onFilter: (value: any, record: CoverageItem) => {
        return (record.责任小类 || '') === value
      },
      render: (text: string) => {
        if (!text) return <span style={{ color: '#999' }}>-</span>
        const colorMap: { [key: string]: string } = {
          '重疾责任': '#FF7A5C',
          '中症责任': '#01BCD6',
          '轻症责任': '#52c41a',
          '前症责任': '#A5D6A7',
          '特定疾病责任': '#5B8C85',
          '其他疾病责任': '#7BADB5'
        }
        return (
          <Tag color={colorMap[text] || 'default'} style={{ 
            color: '#fff'
          }}>
            {text}
          </Tag>
        )
      }
    },
    {
      title: '责任层级',
      dataIndex: '责任层级',
      key: '责任层级',
      width: 100,
      filters: [
        { text: '主责任', value: '主责任' },
        { text: '副责任', value: '副责任' }
      ],
      onFilter: (value: any, record: CoverageItem) => {
        return (record.责任层级 || '') === value
      },
      render: (text: string) => {
        if (!text) return <span style={{ color: '#999' }}>-</span>
        return (
          <Tag color={text === '主责任' ? 'blue' : 'default'}>
            {text}
          </Tag>
        )
      }
    },
    {
      title: '可选/必选',
      dataIndex: 'isRequired',
      key: 'isRequired',
      width: 100,
      filters: [
        { text: '必选', value: '必选' },
        { text: '可选', value: '可选' }
      ],
      filteredValue: filters.isRequired ? [filters.isRequired] : null,
      onFilter: (value: any, record: CoverageItem) => {
        const isRequired = record.isRequired || '可选'
        return isRequired === value
      },
      render: (text: string) => {
        const isRequired = text || '可选'
        return (
          <Tag color={isRequired === '必选' ? 'red' : 'default'}>
            {isRequired}
          </Tag>
        )
      }
    }
    ]

    // 根据责任类型添加特定列
    let specificColumns: ColumnsType<CoverageItem> = []

    if (type === '疾病责任') {
      specificColumns = [
        {
          title: '自然语言描述',
          key: '自然语言描述',
          width: 300,
          render: (_, record) => {
            const naturalLanguageDesc = record.naturalLanguageDesc || []
            const payoutAmount = record.payoutAmount || record.parsedResult?.payoutAmount || []
            
            // 汇总所有阶段的自然语言描述
            let descriptions: string[] = []
            if (naturalLanguageDesc.length > 0) {
              descriptions = naturalLanguageDesc
            } else if (payoutAmount.length > 0) {
              descriptions = payoutAmount
                .map((p: any) => p.naturalLanguageDescription)
                .filter((desc: string) => desc)
            }
            
            const summary = descriptions.join('；')
            return (
              <div style={{ 
                whiteSpace: 'normal', 
                wordBreak: 'break-word',
                lineHeight: '1.5'
              }}>
                {summary || '-'}
              </div>
            )
          }
        },
        {
          title: '赔付金额',
          key: '赔付金额',
          render: (_, record) => {
            const payoutAmount = record.payoutAmount || record.parsedResult?.payoutAmount
            if (!payoutAmount || !Array.isArray(payoutAmount)) return '-'
            return payoutAmount.map((p: any, idx: number) => (
              <div key={idx} style={{ marginBottom: '4px' }}>
                {p.formula || p.naturalLanguageDescription || '-'}
              </div>
            ))
          }
        },
        {
          title: '赔付次数',
          dataIndex: '赔付次数',
          key: '赔付次数',
          filters: [
            { text: '1次', value: '1次' },
            { text: '最多2次', value: '最多2次' },
            { text: '最多3次', value: '最多3次' },
            { text: '最多4次', value: '最多4次' },
            { text: '最多5次', value: '最多5次' },
            { text: '最多6次', value: '最多6次' }
          ],
          filteredValue: filters.赔付次数 ? [filters.赔付次数] : null,
          onFilter: (value, record) => {
            const payoutCount = record.赔付次数 || '1次'
            return payoutCount === value
          },
          render: (text) => text || '1次' // 确保有默认值
        },
        {
          title: '重复赔付',
          dataIndex: '是否可以重复赔付',
          key: '是否可以重复赔付',
          filters: [
            { text: '可重复', value: true },
            { text: '不可重复', value: false },
            { text: '一次赔付不涉及', value: 'not_applicable' }
          ],
          filteredValue: filters.是否可以重复赔付 !== '' ? (filters.是否可以重复赔付 === 'true' ? [true] : filters.是否可以重复赔付 === 'false' ? [false] : ['not_applicable']) : null,
          onFilter: (value, record) => {
            if (value === 'not_applicable') {
              return record.赔付次数 === '1次' && (record.是否可以重复赔付 === undefined || record.是否可以重复赔付 === null);
            }
            return record.是否可以重复赔付 === value;
          },
          render: (value, record) => {
            // 如果赔付次数是1次，显示"一次赔付不涉及"
            if (record.赔付次数 === '1次' && (value === undefined || value === null)) {
              return <Tag color="default">一次赔付不涉及</Tag>;
            }
            // 确保有值
            if (value === undefined || value === null) {
              return <Tag color="default">不可重复</Tag>;
            }
            return value ? (
              <Tag color="green">可重复</Tag>
            ) : (
              <Tag color="default">不可重复</Tag>
            );
          }
        },
        {
          title: '是否分组',
          dataIndex: '是否分组',
          key: '是否分组',
          filters: [
            { text: '是', value: true },
            { text: '否', value: false },
            { text: '一次赔付不涉及', value: 'not_applicable' }
          ],
          filteredValue: filters.是否分组 !== '' ? (filters.是否分组 === 'true' ? [true] : filters.是否分组 === 'false' ? [false] : ['not_applicable']) : null,
          onFilter: (value, record) => {
            if (value === 'not_applicable') {
              return record.赔付次数 === '1次' && (record.是否分组 === undefined || record.是否分组 === null);
            }
            return record.是否分组 === value;
          },
          render: (value, record) => {
            // 如果赔付次数是1次，显示"一次赔付不涉及"
            if (record.赔付次数 === '1次' && (value === undefined || value === null)) {
              return <Tag color="default">一次赔付不涉及</Tag>;
            }
            // 确保有值
            if (value === undefined || value === null) {
              return <Tag>否</Tag>;
            }
            return value ? (
              <Tag color="blue">是</Tag>
            ) : (
              <Tag>否</Tag>
            );
          }
        },
        {
          title: '间隔期',
          dataIndex: '间隔期',
          key: '间隔期',
          render: (text, record) => {
            // 如果赔付次数是1次，显示"一次赔付不涉及"
            if (record.赔付次数 === '1次' && (!text || text === undefined || text === null)) {
              return <Tag color="default">一次赔付不涉及</Tag>;
            }
            // 如果赔付次数是1次，显示"一次赔付不涉及"
            if (record.赔付次数 === '1次' && (!text || text === undefined || text === null || text === '')) {
              return <Tag color="default">一次赔付不涉及</Tag>;
            }
            // 确保有值（非单次赔付时，如果没有间隔期，显示"无间隔期"）
            if (!text || text === undefined || text === null || text === '') {
              return '无间隔期';
            }
            return text;
          }
        },
        {
          title: '是否豁免',
          dataIndex: '是否豁免',
          key: '是否豁免',
          filters: [
            { text: '是', value: true },
            { text: '否', value: false }
          ],
          filteredValue: filters.是否豁免 !== '' ? (filters.是否豁免 === 'true' ? [true] : [false]) : null,
          onFilter: (value, record) => (record.是否豁免 || false) === value,
          render: (value) => {
            const isExempt = value === true;
            return isExempt ? (
              <Tag color="orange">是</Tag>
            ) : (
              <Tag>否</Tag>
            );
          }
        }
      ]
    } else if (type === '身故责任') {
      specificColumns = [
        {
          title: '自然语言描述',
          key: '自然语言描述',
          width: 300,
          render: (_, record) => {
            const naturalLanguageDesc = record.naturalLanguageDesc || []
            const payoutAmount = record.payoutAmount || record.parsedResult?.payoutAmount || []
            
            // 汇总所有阶段的自然语言描述
            let descriptions: string[] = []
            if (naturalLanguageDesc.length > 0) {
              descriptions = naturalLanguageDesc
            } else if (payoutAmount.length > 0) {
              descriptions = payoutAmount
                .map((p: any) => p.naturalLanguageDescription)
                .filter((desc: string) => desc)
            }
            
            const summary = descriptions.join('；')
            return (
              <div style={{ 
                whiteSpace: 'normal', 
                wordBreak: 'break-word',
                lineHeight: '1.5'
              }}>
                {summary || '-'}
              </div>
            )
          }
        },
        {
          title: '赔付金额',
          key: '赔付金额',
          render: (_, record) => {
            const payoutAmount = record.payoutAmount || record.parsedResult?.payoutAmount
            if (!payoutAmount || !Array.isArray(payoutAmount)) return '-'
            return payoutAmount.map((p: any, idx: number) => (
              <div key={idx} style={{ marginBottom: '4px' }}>
                {p.formula || p.naturalLanguageDescription || '-'}
              </div>
            ))
          }
        },
        {
          title: '赔付限额',
          key: '赔付限额',
          render: (_, record) => {
            const note = record.note || record.parsedResult?.note || ''
            return extractFieldFromNote(note, '赔付限额') || '-'
          }
        },
        {
          title: '最高限额互斥',
          key: '最高限额互斥',
          render: (_, record) => {
            const note = record.note || record.parsedResult?.note || ''
            const value = extractFieldFromNote(note, '最高限额互斥')
            if (!value) return '-'
            return value.includes('是') || value.includes('互斥') ? (
              <Tag color="red">是</Tag>
            ) : (
              <Tag>否</Tag>
            )
          }
        },
        {
          title: '有效保额递增率',
          key: '有效保额递增率',
          render: (_, record) => {
            const note = record.note || record.parsedResult?.note || ''
            return extractFieldFromNote(note, '有效保额递增率') || '-'
          }
        },
        {
          title: '投保人豁免',
          key: '投保人豁免',
          render: (_, record) => {
            const note = record.note || record.parsedResult?.note || ''
            const value = extractFieldFromNote(note, '投保人豁免')
            if (!value) return '-'
            return value.includes('是') || value.includes('豁免') ? (
              <Tag color="orange">是</Tag>
            ) : (
              <Tag>否</Tag>
            )
          }
        }
      ]
    } else if (type === '意外责任') {
      specificColumns = [
        {
          title: '自然语言描述',
          key: '自然语言描述',
          width: 300,
          render: (_, record) => {
            const naturalLanguageDesc = record.naturalLanguageDesc || []
            const payoutAmount = record.payoutAmount || record.parsedResult?.payoutAmount || []
            
            // 汇总所有阶段的自然语言描述
            let descriptions: string[] = []
            if (naturalLanguageDesc.length > 0) {
              descriptions = naturalLanguageDesc
            } else if (payoutAmount.length > 0) {
              descriptions = payoutAmount
                .map((p: any) => p.naturalLanguageDescription)
                .filter((desc: string) => desc)
            }
            
            const summary = descriptions.join('；')
            return (
              <div style={{ 
                whiteSpace: 'normal', 
                wordBreak: 'break-word',
                lineHeight: '1.5'
              }}>
                {summary || '-'}
              </div>
            )
          }
        },
        {
          title: '赔付金额',
          key: '赔付金额',
          render: (_, record) => {
            const payoutAmount = record.payoutAmount || record.parsedResult?.payoutAmount
            if (!payoutAmount || !Array.isArray(payoutAmount)) return '-'
            return payoutAmount.map((p: any, idx: number) => (
              <div key={idx} style={{ marginBottom: '4px' }}>
                {p.formula || p.naturalLanguageDescription || '-'}
              </div>
            ))
          }
        },
        {
          title: '意外场景覆盖率',
          key: '意外场景覆盖率',
          render: (_, record) => {
            const note = record.note || record.parsedResult?.note || ''
            const value = extractFieldFromNote(note, '意外场景覆盖率')
            return value || '-'
          }
        },
        {
          title: '意外责任类型',
          key: '意外责任类型',
          render: (_, record) => {
            const note = record.note || record.parsedResult?.note || ''
            const value = extractFieldFromNote(note, '意外责任类型')
            if (!value) return '-'
            if (value.includes('既管意外失能又管意外死亡')) {
              return <Tag color="blue">既管失能又管死亡</Tag>
            } else if (value.includes('仅管意外死亡')) {
              return <Tag color="red">仅管意外死亡</Tag>
            } else if (value.includes('仅管意外失能')) {
              return <Tag color="orange">仅管意外失能</Tag>
            }
            return value
          }
        },
        {
          title: '赔付限额',
          key: '赔付限额',
          render: (_, record) => {
            const note = record.note || record.parsedResult?.note || ''
            return extractFieldFromNote(note, '赔付限额') || '-'
          }
        }
      ]
    } else if (type === '年金责任') {
      specificColumns = [
        {
          title: '自然语言描述',
          key: '自然语言描述',
          width: 300,
          render: (_, record) => {
            const naturalLanguageDesc = record.naturalLanguageDesc || []
            const payoutAmount = record.payoutAmount || record.parsedResult?.payoutAmount || []
            
            // 汇总所有阶段的自然语言描述
            let descriptions: string[] = []
            if (naturalLanguageDesc.length > 0) {
              descriptions = naturalLanguageDesc
            } else if (payoutAmount.length > 0) {
              descriptions = payoutAmount
                .map((p: any) => p.naturalLanguageDescription)
                .filter((desc: string) => desc)
            }
            
            const summary = descriptions.join('；')
            return (
              <div style={{ 
                whiteSpace: 'normal', 
                wordBreak: 'break-word',
                lineHeight: '1.5'
              }}>
                {summary || '-'}
              </div>
            )
          }
        },
        {
          title: '领取方式',
          key: '领取方式',
          render: (_, record) => {
            const note = record.note || record.parsedResult?.note || ''
            return extractFieldFromNote(note, '领取方式') || '-'
          }
        },
        {
          title: '开始领取时间',
          key: '开始领取时间',
          render: (_, record) => {
            const note = record.note || record.parsedResult?.note || ''
            return extractFieldFromNote(note, '开始领取时间') || '-'
          }
        },
        {
          title: '领取期限',
          key: '领取期限',
          render: (_, record) => {
            const note = record.note || record.parsedResult?.note || ''
            return extractFieldFromNote(note, '领取期限') || '-'
          }
        },
        {
          title: '是否保证领取',
          key: '是否保证领取',
          render: (_, record) => {
            const note = record.note || record.parsedResult?.note || ''
            const value = extractFieldFromNote(note, '是否保证领取')
            if (!value) return '-'
            return value.includes('是') || value.includes('保证') ? (
              <Tag color="green">是</Tag>
            ) : (
              <Tag>否</Tag>
            )
          }
        },
        {
          title: '特别权益',
          key: '特别权益',
          render: (_, record) => {
            const note = record.note || record.parsedResult?.note || ''
            return extractFieldFromNote(note, '特别权益') || '-'
          }
        }
      ]
    }

    // 添加最后3个列：解析结果JSON、审批结果、审批备注
    const actionColumns: ColumnsType<CoverageItem> = [
      {
        title: '操作',
        key: 'action',
        width: 120,
        align: 'center',
        fixed: 'right',
        render: (_, record) => (
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record)}
          >
            详情
          </Button>
        )
      },
      {
        title: '审批结果',
        dataIndex: 'reviewStatus',
        key: 'reviewStatus',
        width: 100,
        filters: [
          { text: '待审核', value: 'pending' },
          { text: '已通过', value: 'approved' },
          { text: '未通过', value: 'rejected' }
        ],
        filteredValue: filters.reviewStatus ? [filters.reviewStatus] : null,
        render: (reviewStatus) => {
          const status = reviewStatus || 'pending'
          if (status === 'approved') {
            return <Tag icon={<CheckCircleOutlined />} color="success">已通过</Tag>
          } else if (status === 'rejected') {
            return <Tag icon={<CloseCircleOutlined />} color="error">未通过</Tag>
          } else {
            return <Tag color="default">待审核</Tag>
          }
        }
      },
      {
        title: 'AI是否修改',
        dataIndex: 'aiModified',
        key: 'aiModified',
        width: 100,
        filters: [
          { text: '已修改', value: true },
          { text: '未修改', value: false }
        ],
        filteredValue: filters.aiModified ? [filters.aiModified === 'true'] : null,
        render: (aiModified, record) => {
          if (aiModified) {
            return (
              <Tooltip title={record.aiModificationNote || 'AI已自动修复此记录'}>
                <Tag color="blue">已修改</Tag>
              </Tooltip>
            )
          }
          return <Tag color="default">未修改</Tag>
        }
      },
      {
        title: '审批备注',
        dataIndex: 'reviewNotes',
        key: 'reviewNotes',
        width: 200,
        ellipsis: true,
        render: (reviewNotes) => {
          if (!reviewNotes) return '-'
          return (
            <Tooltip title={reviewNotes}>
              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {reviewNotes}
              </div>
            </Tooltip>
          )
        }
      }
    ]

    return [...baseColumns, ...specificColumns, ...actionColumns]
  }

  const columns: ColumnsType<CoverageItem> = getColumnsByType(activeTab)

  // 处理表格筛选变化
  const handleTableChange = (pagination: any, tableFilters: any, sorter: any) => {
    // 更新分页
    const newPagination = {
      current: pagination.current,
      pageSize: pagination.pageSize
    }
    setPagination(newPagination)
    
    // 处理排序
    if (sorter && sorter.field) {
      const newSortBy = sorter.field
      const newSortOrder = sorter.order === 'ascend' ? 'asc' : sorter.order === 'descend' ? 'desc' : 'asc'
      
      // 更新filters中的排序字段
      setFilters({
        ...filters,
        sortBy: newSortBy,
        sortOrder: newSortOrder
      })
      
      return // 排序时直接返回，让useEffect自动重新加载数据
    }
    
    // 更新筛选条件（从表格列头筛选）
    // ⚠️ 关键修复：只更新tableFilters中实际有值的字段，保留其他筛选条件
    const newFilters: any = { ...filters }
    
    // 只处理tableFilters中明确设置的字段
    Object.keys(tableFilters).forEach(key => {
      const value = tableFilters[key]
      
      // 只有当值不是null且不是undefined时才更新
      if (value !== null && value !== undefined) {
        if (Array.isArray(value) && value.length > 0) {
          // 处理不同类型的筛选器
          if (key === 'reviewStatus') {
            newFilters.reviewStatus = value[0]
          } else if (key === 'aiModified') {
            newFilters.aiModified = value[0] ? 'true' : 'false'
          } else if (key === 'verified') {
            newFilters.是否已审核 = value[0] ? 'true' : 'false'
          } else if (key === '是否可以重复赔付' || key === '是否分组' || key === '是否豁免') {
            newFilters[key] = value[0] ? 'true' : 'false'
          } else {
            newFilters[key] = value[0]
          }
        } else if (Array.isArray(value) && value.length === 0) {
          // 用户清空了这个筛选器
          if (key === 'reviewStatus') {
            newFilters.reviewStatus = ''
          } else if (key === 'aiModified') {
            newFilters.aiModified = ''
          } else if (key === 'verified') {
            newFilters.是否已审核 = ''
          } else {
            newFilters[key] = ''
          }
        }
      }
    })
    
    setFilters(newFilters)
    // useEffect会自动监听filters变化并加载数据
  }

  return (
    <div style={{ minHeight: '100vh', padding: '24px' }}>
      {/* 顶部标题区域 */}
        <div style={{ 
        maxWidth: '1400px',
        margin: '0 auto',
        marginBottom: '32px'
        }}>
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '16px',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
          <h1 style={{ 
              fontSize: '30px',
              fontWeight: 700,
              color: '#1f2937',
              margin: 0
          }}>
            责任库管理系统
          </h1>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              margin: 0,
              fontWeight: 400
            }}>
              统一管理和查询所有保险责任
            </p>
          </div>
          {/* 导入、导出按钮 */}
          <div style={{
            display: 'flex',
            gap: '8px'
          }}>
            <Space>
              <Upload
                accept=".xlsx,.xls"
                showUploadList={false}
                beforeUpload={(file) => {
                  handleImport(file)
                  return false // 阻止自动上传
                }}
              >
                <Button icon={<ImportOutlined />}>导入</Button>
              </Upload>
              <Button icon={<ExportOutlined />} onClick={handleExport}>导出</Button>
            </Space>
          </div>
        </div>

      </div>

      {/* 主内容区域 */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto'
      }}>
        {/* 合并的统计框 - 包含顶部统计栏和四个卡片 */}
        <Card
          style={{
            marginBottom: 24,
            borderRadius: '12px',
            border: 'none',
            background: 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)'
          }}
          bodyStyle={{ padding: '20px 24px' }}
        >
          {/* 顶部统计栏 */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '20px',
            paddingBottom: '16px',
            borderBottom: '1px solid #d9f7f7'
          }}>
            {/* 左侧：合同数量、责任总数 */}
            <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
              <div>
                <span style={{ color: '#666', fontSize: '14px', marginRight: '8px' }}>合同数量:</span>
                <span style={{ color: '#1890ff', fontSize: '18px', fontWeight: 600 }}>
                  {contractStats.contractCount}个
                </span>
              </div>
              <div>
                <span style={{ color: '#666', fontSize: '14px', marginRight: '8px' }}>责任总数:</span>
                <span style={{ color: '#1890ff', fontSize: '18px', fontWeight: 600 }}>
                  {contractStats.totalCoverageCount}条
                </span>
              </div>
            </div>
            
            {/* 右侧：合同ID筛选框 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#666', fontSize: '14px' }}>合同ID筛选:</span>
              <Select
                style={{ width: 300 }}
                placeholder="请选择合同ID"
                allowClear
                showSearch
                value={selectedPolicyId}
                onChange={(value) => {
                  setSelectedPolicyId(value)
                  setPagination({ ...pagination, current: 1 }) // 重置到第一页
                }}
                filterOption={(input, option) =>
                  (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
                }
              >
                {contractStats.policyIds.map((policyId: string) => (
                  <Option key={policyId} value={policyId}>
                    {policyId}
                  </Option>
                ))}
              </Select>
            </div>
          </div>

          {/* 统计信息 - 按责任类型分组（可点击切换标签页） */}
          <Row gutter={24}>
          {/* 疾病责任 */}
          <Col span={6}>
            <Card
              style={{
                borderRadius: '8px',
                border: 'none',
                background: activeTab === '疾病责任' ? '#B3EBEF' : '#ffffff',
                cursor: 'pointer',
                transition: 'all 0.3s',
                boxShadow: activeTab === '疾病责任' ? '0 2px 8px rgba(1, 188, 214, 0.15)' : 'none'
              }}
              bodyStyle={{ padding: '8px 12px' }}
              onClick={() => setActiveTab('疾病责任')}
            >
              <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ color: '#666', fontSize: '14px', fontWeight: 500 }}>疾病责任</div>
                <div style={{ 
                  color: '#1890ff',
                  fontSize: '24px',
                  fontWeight: 600,
                  lineHeight: '1'
                }}>
                  {stats.byType.疾病责任.total}条
                </div>
              </div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '8px',
                borderTop: '1px solid #d9f7f7'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#999', fontSize: '11px' }}>已审核</span>
                  <span style={{ color: '#52c41a', fontSize: '14px', fontWeight: 500 }}>
                    {stats.byType.疾病责任.verified}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#999', fontSize: '11px' }}>未审核</span>
                  <span style={{ color: '#ff4d4f', fontSize: '14px', fontWeight: 500 }}>
                    {stats.byType.疾病责任.unverified}
                  </span>
                </div>
              </div>
            </Card>
          </Col>
          
          {/* 身故责任 */}
          <Col span={6}>
            <Card
              style={{
                borderRadius: '8px',
                border: 'none',
                background: activeTab === '身故责任' ? '#B3EBEF' : '#ffffff',
                cursor: 'pointer',
                transition: 'all 0.3s',
                boxShadow: activeTab === '身故责任' ? '0 2px 8px rgba(1, 188, 214, 0.15)' : 'none'
              }}
              bodyStyle={{ padding: '8px 12px' }}
              onClick={() => setActiveTab('身故责任')}
            >
              <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ color: '#666', fontSize: '14px', fontWeight: 500 }}>身故责任</div>
                <div style={{ 
                  color: '#1890ff',
                  fontSize: '24px',
                  fontWeight: 600,
                  lineHeight: '1'
                }}>
                  {stats.byType.身故责任.total}条
                </div>
              </div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '8px',
                borderTop: '1px solid #d9f7f7'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#999', fontSize: '11px' }}>已审核</span>
                  <span style={{ color: '#52c41a', fontSize: '14px', fontWeight: 500 }}>
                    {stats.byType.身故责任.verified}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#999', fontSize: '11px' }}>未审核</span>
                  <span style={{ color: '#ff4d4f', fontSize: '14px', fontWeight: 500 }}>
                    {stats.byType.身故责任.unverified}
                  </span>
                </div>
              </div>
            </Card>
          </Col>
          
          {/* 意外责任 */}
          <Col span={6}>
            <Card
              style={{
                borderRadius: '8px',
                border: 'none',
                background: activeTab === '意外责任' ? '#B3EBEF' : '#ffffff',
                cursor: 'pointer',
                transition: 'all 0.3s',
                boxShadow: activeTab === '意外责任' ? '0 2px 8px rgba(1, 188, 214, 0.15)' : 'none'
              }}
              bodyStyle={{ padding: '8px 12px' }}
              onClick={() => setActiveTab('意外责任')}
            >
              <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ color: '#666', fontSize: '14px', fontWeight: 500 }}>意外责任</div>
                <div style={{ 
                  color: '#1890ff',
                  fontSize: '24px',
                  fontWeight: 600,
                  lineHeight: '1'
                }}>
                  {stats.byType.意外责任.total}条
                </div>
              </div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '8px',
                borderTop: '1px solid #d9f7f7'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#999', fontSize: '11px' }}>已审核</span>
                  <span style={{ color: '#52c41a', fontSize: '14px', fontWeight: 500 }}>
                    {stats.byType.意外责任.verified}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#999', fontSize: '11px' }}>未审核</span>
                  <span style={{ color: '#ff4d4f', fontSize: '14px', fontWeight: 500 }}>
                    {stats.byType.意外责任.unverified}
                  </span>
                </div>
              </div>
            </Card>
          </Col>
          
          {/* 年金责任 */}
          <Col span={6}>
            <Card
              style={{
                borderRadius: '8px',
                border: 'none',
                background: activeTab === '年金责任' ? '#B3EBEF' : '#ffffff',
                cursor: 'pointer',
                transition: 'all 0.3s',
                boxShadow: activeTab === '年金责任' ? '0 2px 8px rgba(1, 188, 214, 0.15)' : 'none'
              }}
              bodyStyle={{ padding: '8px 12px' }}
              onClick={() => setActiveTab('年金责任')}
            >
              <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ color: '#666', fontSize: '14px', fontWeight: 500 }}>年金责任</div>
                <div style={{ 
                  color: '#1890ff',
                  fontSize: '24px',
                  fontWeight: 600,
                  lineHeight: '1'
                }}>
                  {stats.byType.年金责任.total}条
                </div>
              </div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '8px',
                borderTop: '1px solid #d9f7f7'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#999', fontSize: '11px' }}>已审核</span>
                  <span style={{ color: '#52c41a', fontSize: '14px', fontWeight: 500 }}>
                    {stats.byType.年金责任.verified}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#999', fontSize: '11px' }}>未审核</span>
                  <span style={{ color: '#ff4d4f', fontSize: '14px', fontWeight: 500 }}>
                    {stats.byType.年金责任.unverified}
                  </span>
                </div>
              </div>
            </Card>
          </Col>
        </Row>
        </Card>

        {/* 数据表格 */}
        <Card style={{
          borderRadius: '12px',
          border: 'none',
          background: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          minHeight: '400px'  // 确保卡片有最小高度
        }}>
        {/* 筛选结果数量显示 */}
        <div style={{ 
          padding: '12px 16px',
          marginBottom: '12px',
          borderBottom: '1px solid #f0f0f0',
          color: '#666',
          fontSize: '14px'
        }}>
          筛选结果：<span style={{ 
            fontWeight: 600, 
            color: total === 0 ? '#999' : '#01BCD6',
            fontSize: '16px'
          }}>{total}</span> 条
        </div>
        
        <Table
          columns={columns}
          dataSource={data}
          loading={loading}
          rowKey="id"
          scroll={{ x: 'max-content', y: 600 }}
          onChange={handleTableChange}
          locale={{
            emptyText: '暂无数据'
          }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => {
              setPagination({ current: page, pageSize })
            }
          }}
        />
      </Card>

      {/* 详情弹窗 */}
      <CoverageDetailModal
        visible={detailVisible}
        item={selectedItem}
        onClose={() => setDetailVisible(false)}
        onUpdate={() => {
          setDetailVisible(false)
          loadData()  // 刷新列表
        }}
      />
      </div>
    </div>
  )
}

