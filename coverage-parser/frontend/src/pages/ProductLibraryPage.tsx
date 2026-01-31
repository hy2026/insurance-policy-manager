import { useState, useEffect } from 'react'
import { 
  Table, 
  Card, 
  Input, 
  Button, 
  Tag, 
  Space, 
  message,
  Row,
  Col,
  Modal,
  Upload,
  Tooltip
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
import type { UploadProps } from 'antd'
import { getProducts, exportProducts, importProducts } from '../services/api'

// 产品数据类型
interface ProductItem {
  id: number
  序号?: number
  保险产品ID号: string
  公司名称: string
  保险产品名称: string
  保险大类: string
  保险小类?: string
  保障期限?: string
  交费期限?: string
  销售状态: string
  疾病责任数: number
  身故责任数: number
  意外责任数: number
  年金责任数: number
  reviewStatus?: string // pending/approved/rejected
  reviewNotes?: string
  reviewedBy?: string
  reviewedAt?: string
}

// 模拟数据（使用真实数据示例）
const mockData: ProductItem[] = [
  {
    id: 1,
    序号: 1,
    保险产品ID号: '百年人寿[2020]疾病保险013号',
    公司名称: '百年人寿保险股份有限公司',
    保险产品名称: '百年康惠保（2.0版）重大疾病保险',
    保险大类: '疾病险',
    保险小类: '重疾保险',
    保障期限: '',
    交费期限: '',
    销售状态: '停售',
    疾病责任数: 1,
    身故责任数: 0,
    意外责任数: 0,
    年金责任数: 0
  }
]

export default function ProductLibraryPage() {
  const [data, setData] = useState<ProductItem[]>(mockData)
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(1)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20
  })
  
  // 筛选条件
  const [filters, setFilters] = useState({
    保险产品ID号: '',
    公司名称: '',
    保险产品名称: '',
    保险大类: '',
    保险小类: '',
    保障期限: '',
    交费期限: '',
    销售状态: '',
    reviewStatus: ''
  })
  
  // 详情弹窗
  const [selectedItem, setSelectedItem] = useState<ProductItem | null>(null)
  const [detailVisible, setDetailVisible] = useState(false)
  
  // 排序状态
  const [sortInfo, setSortInfo] = useState<{ field: string; order: 'ascend' | 'descend' | null }>({
    field: '',
    order: null
  })
  
  // 统计数据（总数，不受筛选影响）
  const [stats, setStats] = useState({
    total: 0,
    byCategory: {
      疾病险: 0,
      人寿险: 0,
      意外险: 0,
      年金险: 0
    }
  })
  
  // 筛选后的数量
  const [filteredTotal, setFilteredTotal] = useState(0)
  

  // 加载数据
  const loadData = async () => {
    try {
      setLoading(true)
      
      // 构建请求参数，只包含非空的筛选条件
      const params: any = {
        page: pagination.current,
        pageSize: pagination.pageSize
      }
      
      // 只添加有值的筛选条件
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== '') {
          params[key] = value
        }
      })
      
      // 添加排序参数
      if (sortInfo.field && sortInfo.order) {
        params.sortField = sortInfo.field
        params.sortOrder = sortInfo.order === 'ascend' ? 'asc' : 'desc'
      }
      
      
      const response = await getProducts(params)
      
      
      // 转换数据格式
      const transformedData = response.data.map((item: any, index: number) => ({
        id: item.id,
        序号: (pagination.current - 1) * pagination.pageSize + index + 1,
        保险产品ID号: item.policyId || item.保险产品ID号 || '',
        公司名称: item.insuranceCompany || item.公司名称 || '',
        保险产品名称: item.productName || item.保险产品名称 || '',
        保险大类: item.productCategory || item.保险大类 || '',
        保险小类: item.productSubCategory || item.保险小类 || '',
        保障期限: item.coveragePeriod || item.保障期限 || '',
        交费期限: item.paymentPeriod || item.交费期限 || '',
        销售状态: item.salesStatus || item.销售状态 || '在售',
        疾病责任数: item.diseaseCount || 0,
        身故责任数: item.deathCount || 0,
        意外责任数: item.accidentCount || 0,
        年金责任数: item.annuityCount || 0
      }))
      
      setData(transformedData)
      setTotal(response.total || 0)
      setFilteredTotal(response.total || 0) // 筛选后的数量
      
    } catch (error: any) {
      console.error('❌ 加载数据失败:', error)
      message.error(`加载数据失败: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // 加载总数统计（不受筛选影响）
  const loadStats = async () => {
    try {
      const response = await getProducts({
        page: 1,
        pageSize: 1 // 只需要获取统计数据
      })
      
      if (response) {
        setStats({
          total: response.total || 0,
          byCategory: {
            疾病险: response.byCategory?.疾病险 || 0,
            人寿险: response.byCategory?.人寿险 || 0,
            意外险: response.byCategory?.意外险 || 0,
            年金险: response.byCategory?.年金险 || 0
          }
        })
      }
    } catch (error) {
      console.error('❌ 加载总数统计失败:', error)
    }
  }

  // 首次加载总数统计（只运行一次）
  useEffect(() => {
    loadStats()
  }, [])

  // 数据加载 - 监听分页、筛选、排序变化
  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.current, pagination.pageSize, JSON.stringify(filters), sortInfo.field, sortInfo.order])

  // 表格列定义
  const columns: ColumnsType<ProductItem> = [
    {
      title: '序号',
      dataIndex: '序号',
      key: '序号',
      width: 80,
      sorter: true, // 启用后端排序（按ID排序）
      sortOrder: sortInfo.field === '序号' ? sortInfo.order : null
    },
    {
      title: '保险产品ID号',
      dataIndex: '保险产品ID号',
      key: '保险产品ID号',
      width: 250,
      ellipsis: true,
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: any) => (
        <div style={{ padding: 8 }}>
          <Input
            placeholder="输入产品ID号进行搜索"
            value={selectedKeys[0]}
            onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
            onPressEnter={() => confirm()}
            style={{ width: 220, marginBottom: 8, display: 'block' }}
          />
          <Space>
            <Button
              type="primary"
              onClick={() => confirm()}
              icon={<SearchOutlined />}
              size="small"
              style={{ width: 105 }}
            >
              搜索
            </Button>
            <Button
              onClick={() => {
                clearFilters?.()
                confirm()
              }}
              size="small"
              style={{ width: 105 }}
            >
              重置
            </Button>
          </Space>
        </div>
      ),
      filteredValue: filters.保险产品ID号 ? [filters.保险产品ID号] : null
    },
    {
      title: '公司名称',
      dataIndex: '公司名称',
      key: '公司名称',
      width: 200,
      ellipsis: true,
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: any) => (
        <div style={{ padding: 8 }}>
          <Input
            placeholder="输入公司名称进行搜索"
            value={selectedKeys[0]}
            onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
            onPressEnter={() => confirm()}
            style={{ width: 200, marginBottom: 8, display: 'block' }}
          />
          <Space>
            <Button
              type="primary"
              onClick={() => confirm()}
              icon={<SearchOutlined />}
              size="small"
              style={{ width: 95 }}
            >
              搜索
            </Button>
            <Button
              onClick={() => {
                clearFilters?.()
                confirm()
              }}
              size="small"
              style={{ width: 95 }}
            >
              重置
            </Button>
          </Space>
        </div>
      ),
      filteredValue: filters.公司名称 ? [filters.公司名称] : null
    },
    {
      title: '保险产品名称',
      dataIndex: '保险产品名称',
      key: '保险产品名称',
      width: 250,
      ellipsis: true,
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: any) => (
        <div style={{ padding: 8 }}>
          <Input
            placeholder="搜索产品名称"
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
      filteredValue: filters.保险产品名称 ? [filters.保险产品名称] : null
      // 不使用 onFilter，由后端筛选
    },
    {
      title: '保险大类',
      dataIndex: '保险大类',
      key: '保险大类',
      width: 120,
      filters: [
        { text: '疾病险', value: '疾病险' },
        { text: '人寿险', value: '人寿险' },
        { text: '意外险', value: '意外险' },
        { text: '年金险', value: '年金险' }
      ],
      filteredValue: filters.保险大类 ? [filters.保险大类] : null,
      render: (text) => {
        const colorMap: Record<string, string> = {
          '疾病险': 'red',
          '人寿险': 'blue',
          '意外险': 'orange',
          '年金险': 'green'
        }
        return <Tag color={colorMap[text] || 'default'}>{text}</Tag>
      }
    },
    {
      title: '保险小类',
      dataIndex: '保险小类',
      key: '保险小类',
      width: 150,
      ellipsis: true,
      filters: [
        { text: '重疾保险', value: '重疾保险' },
        { text: '防癌保险', value: '防癌保险' },
        { text: '定期寿险', value: '定期寿险' },
        { text: '终身寿险', value: '终身寿险' },
        { text: '两全保险', value: '两全保险' },
        { text: '特定意外保险', value: '特定意外保险' },
        { text: '综合意外险', value: '综合意外险' },
        { text: '养老年金保险', value: '养老年金保险' },
        { text: '教育金其他年金', value: '教育金其他年金' }
      ],
      filteredValue: filters.保险小类 ? [filters.保险小类] : null,
      render: (text) => text || '-'
    },
    {
      title: '保障期限',
      dataIndex: '保障期限',
      key: '保障期限',
      width: 120,
      ellipsis: true,
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: any) => (
        <div style={{ padding: 8 }}>
          <Input
            placeholder="搜索保障期限"
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
      filteredValue: filters.保障期限 ? [filters.保障期限] : null,
      render: (text) => text || '-'
    },
    {
      title: '交费期限',
      dataIndex: '交费期限',
      key: '交费期限',
      width: 120,
      ellipsis: true,
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: any) => (
        <div style={{ padding: 8 }}>
          <Input
            placeholder="搜索交费期限"
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
      filteredValue: filters.交费期限 ? [filters.交费期限] : null,
      render: (text) => text || '-'
    },
    {
      title: '销售状态',
      dataIndex: '销售状态',
      key: '销售状态',
      width: 100,
      filters: [
        { text: '在售', value: '在售' },
        { text: '停售', value: '停售' },
        { text: '停用', value: '停用' }
      ],
      filteredValue: filters.销售状态 ? [filters.销售状态] : null,
      render: (text) => {
        const colorMap: Record<string, string> = {
          '在售': 'success',
          '停售': 'warning',
          '停用': 'default'
        }
        return <Tag color={colorMap[text] || 'default'}>{text}</Tag>
      }
    },
    {
      title: '疾病责任数',
      dataIndex: '疾病责任数',
      key: '疾病责任数',
      width: 110,
      sorter: true, // 启用后端排序
      sortOrder: sortInfo.field === '疾病责任数' ? sortInfo.order : null,
      render: (num) => <span style={{ color: num > 0 ? '#1890ff' : '#999' }}>{num}项</span>
    },
    {
      title: '身故责任数',
      dataIndex: '身故责任数',
      key: '身故责任数',
      width: 110,
      sorter: true, // 启用后端排序
      sortOrder: sortInfo.field === '身故责任数' ? sortInfo.order : null,
      render: (num) => <span style={{ color: num > 0 ? '#1890ff' : '#999' }}>{num}项</span>
    },
    {
      title: '意外责任数',
      dataIndex: '意外责任数',
      key: '意外责任数',
      width: 110,
      sorter: true, // 启用后端排序
      sortOrder: sortInfo.field === '意外责任数' ? sortInfo.order : null,
      render: (num) => <span style={{ color: num > 0 ? '#1890ff' : '#999' }}>{num}项</span>
    },
    {
      title: '年金责任数',
      dataIndex: '年金责任数',
      key: '年金责任数',
      width: 110,
      sorter: true, // 启用后端排序
      sortOrder: sortInfo.field === '年金责任数' ? sortInfo.order : null,
      render: (num) => <span style={{ color: num > 0 ? '#1890ff' : '#999' }}>{num}项</span>
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

  const handleTableChange = (newPagination: any, tableFilters: any, sorter: any) => {
    // 构建新的筛选条件
    const newFilters: any = {
      保险产品ID号: '',
      公司名称: '',
      保险产品名称: '',
      保险大类: '',
      保险小类: '',
      保障期限: '',
      交费期限: '',
      销售状态: '',
      reviewStatus: ''
    }
    
    // 从 tableFilters 中提取值
    if (tableFilters) {
      Object.keys(tableFilters).forEach(key => {
        const value = tableFilters[key]
        if (value && Array.isArray(value) && value.length > 0) {
          newFilters[key] = value[0]
        }
      })
    }
    
    // 处理排序 - 传给后端
    let sortField = ''
    let sortOrder: 'ascend' | 'descend' | null = null
    if (sorter && sorter.field && sorter.order) {
      sortField = sorter.field
      sortOrder = sorter.order
    }
    
    // 更新状态
    setFilters(newFilters)
    setSortInfo({ field: sortField, order: sortOrder })
    
    // 更新分页
    setPagination({
      current: newPagination.current,
      pageSize: newPagination.pageSize
    })
  }

  const handleExport = async () => {
    try {
      message.loading('正在导出...', 0)
      
      const response = await fetch('/api/products/export')
      
      if (!response.ok) {
        throw new Error('导出失败')
      }
      
      // 获取文件名
      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = `保险产品库导出-${Date.now()}.xlsx`
      if (contentDisposition) {
        const matches = /filename\*=UTF-8''(.+)/.exec(contentDisposition)
        if (matches) {
          filename = decodeURIComponent(matches[1])
        }
      }
      
      // 下载文件
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      
      message.destroy()
      message.success('导出成功')
    } catch (error: any) {
      message.destroy()
      message.error('导出失败：' + error.message)
    }
  }

  // 导入Excel
  const handleImport: UploadProps['customRequest'] = async (options) => {
    const { file, onSuccess, onError } = options
    
    // 显示确认对话框
    Modal.confirm({
      title: '⚠️ 确认导入产品库',
      content: (
        <div>
          <p style={{ marginBottom: '8px', fontWeight: 'bold', color: '#ff4d4f' }}>
            此操作将清空产品库，并重新导入！
          </p>
          <p style={{ marginBottom: '4px' }}>• 产品库所有数据将被清空</p>
          <p style={{ marginBottom: '4px' }}>• 责任库保留，并自动重新统计责任数量</p>
          <p style={{ marginBottom: '4px' }}>• 所有审核状态将丢失</p>
          <p>• 此操作不可撤销</p>
        </div>
      ),
      okText: '确认导入',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        await performProductImport(file as File, onSuccess, onError)
      }
    })
  }

  const performProductImport = async (file: File, onSuccess?: any, onError?: any) => {
    try {
      message.loading('正在导入...', 0)
      
      const formData = new FormData()
      formData.append('file', file)
      
      const response = await fetch('/api/products/import', {
        method: 'POST',
        body: formData
      })
      
      const result = await response.json()
      
      message.destroy()
      
      if (result.success) {
        message.success(`导入成功！共导入 ${result.count} 条产品数据`)
        // 刷新列表
        await loadData()
        onSuccess?.(result, file)
      } else {
        message.error(result.message || '导入失败')
        onError?.(new Error(result.message || '导入失败'))
      }
    } catch (error: any) {
      message.destroy()
      message.error('导入失败：' + error.message)
      onError?.(error)
    }
  }

  const uploadProps: UploadProps = {
    name: 'file',
    accept: '.xlsx,.xls',
    showUploadList: false,
    customRequest: handleImport
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
              保险产品库
            </h1>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              margin: 0,
              fontWeight: 400
            }}>
              管理和查询保险产品信息
            </p>
          </div>
          {/* 导出按钮 */}
          <div style={{
            display: 'flex',
            gap: '8px'
          }}>
            <Space>
              <Upload {...uploadProps}>
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
          styles={{ body: { padding: '20px 24px' } }}
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
            {/* 左侧：合同数量 */}
            <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
              <div>
                <span style={{ color: '#666', fontSize: '14px', marginRight: '8px' }}>合同数量:</span>
                <span style={{ color: '#1890ff', fontSize: '18px', fontWeight: 600 }}>
                  {stats.total}个
                </span>
              </div>
            </div>
          </div>

          {/* 统计信息 - 按产品类型分组 */}
          <Row gutter={24}>
            {/* 疾病险 */}
            <Col span={6}>
              <Card
                style={{
                  borderRadius: '8px',
                  border: 'none',
                  background: '#B3EBEF',
                  cursor: 'default',
                  boxShadow: '0 2px 8px rgba(1, 188, 214, 0.15)'
                }}
                styles={{ body: { padding: '8px 12px' } }}
              >
                <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ color: '#666', fontSize: '14px', fontWeight: 500 }}>疾病险</div>
                  <div style={{ 
                    color: '#1890ff',
                    fontSize: '24px',
                    fontWeight: 600,
                    lineHeight: '1'
                  }}>
                    {stats.byCategory.疾病险}个
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
                    <span style={{ color: '#52c41a', fontSize: '14px', fontWeight: 500 }}>0</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#999', fontSize: '11px' }}>未审核</span>
                    <span style={{ color: '#ff4d4f', fontSize: '14px', fontWeight: 500 }}>
                      {stats.byCategory.疾病险}
                    </span>
                  </div>
                </div>
              </Card>
            </Col>

            {/* 人寿险 */}
            <Col span={6}>
              <Card
                style={{
                  borderRadius: '8px',
                  border: 'none',
                  background: '#ffffff',
                  cursor: 'default'
                }}
                styles={{ body: { padding: '8px 12px' } }}
              >
                <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ color: '#666', fontSize: '14px', fontWeight: 500 }}>人寿险</div>
                  <div style={{ 
                    color: '#1890ff',
                    fontSize: '24px',
                    fontWeight: 600,
                    lineHeight: '1'
                  }}>
                    {stats.byCategory.人寿险}个
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
                    <span style={{ color: '#52c41a', fontSize: '14px', fontWeight: 500 }}>0</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#999', fontSize: '11px' }}>未审核</span>
                    <span style={{ color: '#ff4d4f', fontSize: '14px', fontWeight: 500 }}>
                      {stats.byCategory.人寿险}
                    </span>
                  </div>
                </div>
              </Card>
            </Col>

            {/* 意外险 */}
            <Col span={6}>
              <Card
                style={{
                  borderRadius: '8px',
                  border: 'none',
                  background: '#ffffff',
                  cursor: 'default'
                }}
                styles={{ body: { padding: '8px 12px' } }}
              >
                <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ color: '#666', fontSize: '14px', fontWeight: 500 }}>意外险</div>
                  <div style={{ 
                    color: '#1890ff',
                    fontSize: '24px',
                    fontWeight: 600,
                    lineHeight: '1'
                  }}>
                    {stats.byCategory.意外险}个
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
                    <span style={{ color: '#52c41a', fontSize: '14px', fontWeight: 500 }}>0</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#999', fontSize: '11px' }}>未审核</span>
                    <span style={{ color: '#ff4d4f', fontSize: '14px', fontWeight: 500 }}>
                      {stats.byCategory.意外险}
                    </span>
                  </div>
                </div>
              </Card>
            </Col>

            {/* 年金险 */}
            <Col span={6}>
              <Card
                style={{
                  borderRadius: '8px',
                  border: 'none',
                  background: '#ffffff',
                  cursor: 'default'
                }}
                styles={{ body: { padding: '8px 12px' } }}
              >
                <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ color: '#666', fontSize: '14px', fontWeight: 500 }}>年金险</div>
                  <div style={{ 
                    color: '#1890ff',
                    fontSize: '24px',
                    fontWeight: 600,
                    lineHeight: '1'
                  }}>
                    {stats.byCategory.年金险}个
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
                    <span style={{ color: '#52c41a', fontSize: '14px', fontWeight: 500 }}>0</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#999', fontSize: '11px' }}>未审核</span>
                    <span style={{ color: '#ff4d4f', fontSize: '14px', fontWeight: 500 }}>
                      {stats.byCategory.年金险}
                    </span>
                  </div>
                </div>
              </Card>
            </Col>
          </Row>
        </Card>

        {/* 数据表格 */}
        <Card style={{
          background: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: '12px',
          border: 'none'
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
              color: filteredTotal === 0 ? '#999' : '#01BCD6',
              fontSize: '16px'
            }}>{filteredTotal}</span> 条
            {filteredTotal !== stats.total && (
              <span style={{ marginLeft: '12px', color: '#999', fontSize: '12px' }}>
                （共 {stats.total} 条）
              </span>
            )}
          </div>
          
          <Table
            columns={columns}
            dataSource={data}
            rowKey="id"
            loading={loading}
            pagination={{
              ...pagination,
              total,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 条记录`
            }}
            onChange={handleTableChange}
            scroll={{ x: 2000 }}
            size="middle"
          />
        </Card>
      </div>

      {/* 详情弹窗 */}
      <Modal
        title="产品详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailVisible(false)}>
            关闭
          </Button>
        ]}
        width={800}
      >
        {selectedItem && (
          <div style={{ lineHeight: '2' }}>
            <p><strong>保险产品ID号：</strong>{selectedItem.保险产品ID号}</p>
            <p><strong>公司名称：</strong>{selectedItem.公司名称}</p>
            <p><strong>保险产品名称：</strong>{selectedItem.保险产品名称}</p>
            <p><strong>保险大类：</strong>{selectedItem.保险大类}</p>
            <p><strong>保险小类：</strong>{selectedItem.保险小类 || '-'}</p>
            <p><strong>保障期限：</strong>{selectedItem.保障期限 || '-'}</p>
            <p><strong>交费期限：</strong>{selectedItem.交费期限 || '-'}</p>
            <p><strong>销售状态：</strong>
              <Tag color={selectedItem.销售状态 === '在售' ? 'success' : 'warning'}>
                {selectedItem.销售状态}
              </Tag>
            </p>
            <p><strong>责任统计：</strong></p>
            <div style={{ paddingLeft: '20px' }}>
              <p>• 疾病责任：{selectedItem.疾病责任数}项</p>
              <p>• 身故责任：{selectedItem.身故责任数}项</p>
              <p>• 意外责任：{selectedItem.意外责任数}项</p>
              <p>• 年金责任：{selectedItem.年金责任数}项</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
