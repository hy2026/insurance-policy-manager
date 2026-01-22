import { Routes, Route } from 'react-router-dom'
import MainLayout from './components/MainLayout'
import HomePage from './pages/HomePage'
import PolicyManagerHomePage from './pages/PolicyManagerHomePage'
import FamilyEditPage from './pages/FamilyEditPage'
import SmartInputPage from './pages/SmartInputPage'
import CoverageParserPage from './pages/CoverageParserPage'
import PolicyListPage from './pages/PolicyListPage'
import ProductLibraryPage from './pages/ProductLibraryPage'
import DiagnosisPage from './pages/DiagnosisPage'
import RecommendationPage from './pages/RecommendationPage'
import DataAnnotationPage from './pages/DataAnnotationPage'
import FormulaEditorDemoPage from './pages/FormulaEditorDemoPage'
import CoverageLibraryPage from './pages/CoverageLibraryPage'

function App() {
  return (
    <MainLayout>
    <Routes>
        {/* 主要页面 */}
        <Route path="/" element={<HomePage />} />
        <Route path="/my-policies" element={<PolicyManagerHomePage />} />
        <Route path="/family-edit" element={<FamilyEditPage />} />
      <Route path="/smart-input" element={<SmartInputPage />} />
        <Route path="/diagnosis" element={<DiagnosisPage />} />
        <Route path="/recommendation" element={<RecommendationPage />} />
        <Route path="/products" element={<ProductLibraryPage />} />
        <Route path="/coverage-library" element={<CoverageLibraryPage />} />
      
        {/* 旧页面：保留作为备用 */}
      <Route path="/parser" element={<CoverageParserPage />} />
      <Route path="/policies" element={<PolicyListPage />} />
      <Route path="/annotation" element={<DataAnnotationPage />} />
      
      {/* 演示页面 */}
      <Route path="/formula-demo" element={<FormulaEditorDemoPage />} />
    </Routes>
    </MainLayout>
  )
}

export default App

