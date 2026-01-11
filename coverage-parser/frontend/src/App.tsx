import { Routes, Route } from 'react-router-dom'
import PolicyManagerHomePage from './pages/PolicyManagerHomePage'
import SmartInputPage from './pages/SmartInputPage'
import CoverageParserPage from './pages/CoverageParserPage'
import PolicyListPage from './pages/PolicyListPage'
import ProductLibraryPage from './pages/ProductLibraryPage'
import DataAnnotationPage from './pages/DataAnnotationPage'
import FormulaEditorDemoPage from './pages/FormulaEditorDemoPage'
import CoverageLibraryPage from './pages/CoverageLibraryPage'

function App() {
  return (
    <Routes>
      {/* 新的页面：完全复刻HTML样式 */}
      <Route path="/" element={<PolicyManagerHomePage />} />
      <Route path="/smart-input" element={<SmartInputPage />} />
      
      {/* 旧的页面：保留作为备用 */}
      <Route path="/parser" element={<CoverageParserPage />} />
      <Route path="/policies" element={<PolicyListPage />} />
      <Route path="/products" element={<ProductLibraryPage />} />
      <Route path="/annotation" element={<DataAnnotationPage />} />
      
      {/* 责任库管理 */}
      <Route path="/coverage-library" element={<CoverageLibraryPage />} />
      
      {/* 演示页面 */}
      <Route path="/formula-demo" element={<FormulaEditorDemoPage />} />
    </Routes>
  )
}

export default App

