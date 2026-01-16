import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Table, 
  Card, 
  Input, 
  Select, 
  Button, 
  Tag, 
  Space, 
  Modal, 
  message,
  Statistic,
  Row,
  Col,
  Tooltip,
  Tabs
} from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  ExportOutlined,
  ImportOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ArrowLeftOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import CoverageDetailModal from '../components/CoverageDetailModal'
import { getCoverageLibrary, exportCoverageLibrary, getCoverageLibraryStats, getContractStats } from '../services/api'

const { Option } = Select

// 责任数据类型
interface CoverageItem {
  id: number
  序号?: number
  保单ID号?: string
  责任类型: string
  责任名称: string
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
  parsedResult?: any
  createdAt: string
}

export default function CoverageLibraryPage() {
  const navigate = useNavigate()
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
    是否可以重复赔付: '',
    是否分组: '',
    是否豁免: '',
    是否已审核: ''
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
      
      console.log('发送请求，参数:', {
        page: pagination.current,
        pageSize: pagination.pageSize,
        ...cleanFilters
      })
      
      // 根据当前选中的标签页，自动添加责任类型筛选
      const finalFilters = {
        ...cleanFilters,
        责任类型: activeTab, // 根据标签页自动筛选
        保单ID号: selectedPolicyId || cleanFilters.保单ID号 // 如果选择了合同ID，添加到筛选条件
      }
      
      const response = await getCoverageLibrary({
        page: pagination.current,
        pageSize: pagination.pageSize,
        ...finalFilters
      })
      
      console.log('API返回数据:', response) // 调试用
      console.log('response.data类型:', typeof response.data, '是否为数组:', Array.isArray(response.data))
      console.log('response.data长度:', Array.isArray(response.data) ? response.data.length : '不是数组')
      console.log('response.total:', response.total)
      
      // 确保data是数组
      const dataArray = Array.isArray(response.data) ? response.data : []
      
      if (dataArray.length === 0 && response.total > 0) {
        console.warn('⚠️ 数据数组为空，但total > 0，可能是分页问题')
      }
      
      setData(dataArray)
      setTotal(response.total || 0)
      // 统计数据由loadStats单独加载，这里不更新stats
      
      console.log('✅ 设置完成 - 数据:', dataArray.length, '条, 总数:', response.total)
    } catch (error: any) {
      console.error('❌ 加载数据失败:', error)
      console.error('错误详情:', error.response || error.message)
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

  const handleViewDetail = (record: CoverageItem) => {
    setSelectedItem(record)
    setDetailVisible(true)
  }

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

    // 添加审核状态和操作列
    const actionColumns: ColumnsType<CoverageItem> = [
      {
        title: '审核状态',
        dataIndex: 'verified',
        key: 'verified',
        filters: [
          { text: '已审核', value: true },
          { text: '未审核', value: false }
        ],
        filteredValue: filters.是否已审核 !== '' ? (filters.是否已审核 === 'true' ? [true] : [false]) : null,
        onFilter: (value, record) => record.verified === value,
        render: (verified) => verified ? (
          <Tag icon={<CheckCircleOutlined />} color="success">已审核</Tag>
        ) : (
          <Tag icon={<CloseCircleOutlined />} color="default">未审核</Tag>
        )
      },
      {
        title: '操作',
        key: 'action',
        fixed: 'right',
        render: (_, record) => (
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record)}
          >
            查看
          </Button>
        )
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
    
    // 更新筛选条件（从表格列头筛选）
    const newFilters: any = { ...filters }
    
    // 保单ID号筛选（从表头筛选器）
    if (tableFilters['保单ID号'] && tableFilters['保单ID号'].length > 0) {
      newFilters.保单ID号 = tableFilters['保单ID号'][0]
    } else {
      newFilters.保单ID号 = ''
    }
    
    // 责任名称筛选（从表头筛选器）
    if (tableFilters['责任名称'] && tableFilters['责任名称'].length > 0) {
      newFilters.责任名称 = tableFilters['责任名称'][0]
    } else {
      newFilters.责任名称 = ''
    }
    
    // 责任类型筛选
    if (tableFilters['责任类型'] && tableFilters['责任类型'].length > 0) {
      newFilters.责任类型 = tableFilters['责任类型'][0]
    } else {
      newFilters.责任类型 = ''
    }
    
    // 重复赔付筛选
    if (tableFilters['是否可以重复赔付'] && tableFilters['是否可以重复赔付'].length > 0) {
      newFilters.是否可以重复赔付 = tableFilters['是否可以重复赔付'][0] ? 'true' : 'false'
    } else {
      newFilters.是否可以重复赔付 = ''
    }
    
    // 分组筛选
    if (tableFilters['是否分组'] && tableFilters['是否分组'].length > 0) {
      newFilters.是否分组 = tableFilters['是否分组'][0] ? 'true' : 'false'
    } else {
      newFilters.是否分组 = ''
    }
    
    // 豁免筛选
    if (tableFilters['是否豁免'] && tableFilters['是否豁免'].length > 0) {
      newFilters.是否豁免 = tableFilters['是否豁免'][0] ? 'true' : 'false'
    } else {
      newFilters.是否豁免 = ''
    }
    
    // 审核状态筛选
    if (tableFilters['verified'] && tableFilters['verified'].length > 0) {
      newFilters.是否已审核 = tableFilters['verified'][0] ? 'true' : 'false'
    } else {
      newFilters.是否已审核 = ''
    }
    
    setFilters(newFilters)
    // useEffect会自动监听filters变化并加载数据
  }

  return (
    <div style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
      <Card>
        {/* 页面标题 - 与智能录入页面样式一致 */}
        <div style={{ 
          background: 'white',
          color: '#333',
          padding: '30px 30px 20px 30px',
          textAlign: 'center',
          position: 'relative',
          marginBottom: 24
        }}>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              navigate('/')
            }}
            style={{
              position: 'absolute',
              left: '30px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: '#f5f5f5',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: '14px',
              color: '#333',
              display: 'inline-block',
              textDecoration: 'none',
              transition: 'all 0.3s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#e8e8e8'
              e.currentTarget.style.borderColor = '#01BCD6'
              e.currentTarget.style.color = '#01BCD6'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#f5f5f5'
              e.currentTarget.style.borderColor = '#e0e0e0'
              e.currentTarget.style.color = '#333'
            }}
          >
            ← 返回
          </a>
          <h1 style={{ 
            fontSize: '28px',
            marginBottom: 0,
            color: '#333'
          }}>
            责任库管理系统
          </h1>
          {/* 导入、导出按钮放在右上角 */}
          <div style={{
            position: 'absolute',
            right: '30px',
            top: '50%',
            transform: 'translateY(-50%)'
          }}>
            <Space>
              <Button icon={<ImportOutlined />}>导入</Button>
              <Button icon={<ExportOutlined />} onClick={handleExport}>导出</Button>
            </Space>
          </div>
        </div>

        {/* 合并的统计框 - 包含顶部统计栏和四个卡片 */}
        <Card
          style={{
            marginBottom: 24,
            borderRadius: '8px',
            border: '1px solid #d9f7f7',
            background: '#f0f8fc'
          }}
          bodyStyle={{ padding: '20px 24px', background: '#f0f8fc' }}
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
        <Table
          columns={columns}
          dataSource={data}
          loading={loading}
          rowKey="id"
          scroll={{ x: 'max-content' }}
          onChange={handleTableChange}
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
      />
    </div>
  )
}

