const axios = require('axios');

async function testLoginApproval() {
  try {
    // First get a token
    console.log('Getting admin token...');
    const loginResponse = await axios.post('https://competitor-inventory.preview.emergentagent.com/api/auth/login', {
      email: 'admin@crm.com',
      password: 'admin123'
    });
    
    const token = loginResponse.data.access_token;
    console.log('Token obtained:', token ? 'Yes' : 'No');
    
    // Test the endpoint with detailed error logging
    console.log('Testing login approval request...');
    try {
      const response = await axios.post('https://competitor-inventory.preview.emergentagent.com/api/login-approval/request', {
        userId: 'test_user_123',
        userName: 'Test User',
        userEmail: 'test@example.com'
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Success:', response.status, response.data);
    } catch (error) {
      console.log('Error details:');
      console.log('Status:', error.response?.status);
      console.log('Data:', error.response?.data);
      console.log('Headers:', error.response?.headers);
      
      // Check if it's a validation error or server error
      if (error.response?.status === 500) {
        console.log('This is a server error - likely an issue with the service implementation');
      }
    }
    
  } catch (error) {
    console.error('Login failed:', error.message);
  }
}

testLoginApproval();