const axios = require('axios');

async function testAPI() {
  try {
    const policyId = '瑞泰人寿[2021]疾病保险012号';
    
    console.log('🧪 测试API查询');
    console.log(`   保单ID: ${policyId}`);
    console.log('');
    
    const response = await axios.get('http://localhost:3001/api/coverage-library', {
      params: {
        page: 1,
        pageSize: 20,
        责任类型: '疾病责任',
        保单ID号: policyId
      }
    });
    
    console.log('📦 API返回结果:');
    console.log(`   success: ${response.data.success}`);
    console.log(`   total: ${response.data.total}`);
    console.log(`   data.length: ${response.data.data?.length || 0}`);
    
    if (response.data.data && response.data.data.length > 0) {
      console.log('\n✅ 查询成功！数据:');
      response.data.data.forEach((item, index) => {
        console.log(`   ${index + 1}. ${item.责任名称}`);
      });
    } else {
      console.log('\n❌ 未查询到数据');
    }
    
  } catch (error) {
    console.error('❌ API调用失败:', error.message);
    if (error.response) {
      console.error('   响应:', error.response.data);
    }
  }
}

testAPI();
