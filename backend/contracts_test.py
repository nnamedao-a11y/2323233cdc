#!/usr/bin/env python3
"""
BIBI Cars CRM - Contracts API Tests
Testing DocuSign contract signing flow with mediation agreement template
"""

import requests
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional

class ContractsAPITester:
    def __init__(self, base_url="https://competitor-inventory.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'BIBI-CRM-Contracts-Test/1.0'
        })
        self.created_ids = {}

    def log(self, message: str, level: str = "INFO"):
        """Log test messages"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")

    def run_test(self, name: str, method: str, endpoint: str, expected_status: int, 
                 data: Optional[Dict] = None, headers: Optional[Dict] = None) -> tuple[bool, Dict]:
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        test_headers = self.session.headers.copy()
        
        if headers:
            test_headers.update(headers)
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'

        self.tests_run += 1
        self.log(f"Testing {name}...")
        self.log(f"  URL: {url}")
        
        try:
            if method == 'GET':
                response = self.session.get(url, headers=test_headers, timeout=30)
            elif method == 'POST':
                response = self.session.post(url, json=data, headers=test_headers, timeout=30)
            elif method == 'PUT':
                response = self.session.put(url, json=data, headers=test_headers, timeout=30)
            elif method == 'PATCH':
                response = self.session.patch(url, json=data, headers=test_headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")

            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                self.log(f"  ✅ PASSED - Status: {response.status_code}")
            else:
                self.log(f"  ❌ FAILED - Expected {expected_status}, got {response.status_code}")
                if response.text:
                    self.log(f"  Response: {response.text[:200]}...")

            try:
                response_data = response.json() if response.text else {}
            except:
                response_data = {"raw_response": response.text}

            return success, response_data

        except requests.exceptions.Timeout:
            self.log(f"  ❌ FAILED - Request timeout")
            return False, {"error": "timeout"}
        except Exception as e:
            self.log(f"  ❌ FAILED - Error: {str(e)}")
            return False, {"error": str(e)}

    def test_admin_login(self) -> bool:
        """Test admin login and get token"""
        self.log("\n=== TESTING ADMIN LOGIN ===")
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            201,
            data={"email": "admin@crm.com", "password": "admin123"}
        )
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.log(f"  ✅ Login successful, token obtained")
            return True
        elif success and 'token' in response:
            self.token = response['token']
            self.log(f"  ✅ Login successful, token obtained")
            return True
        elif success:
            self.log(f"  ❌ Login response missing access_token: {response}")
            return False
        return False

    def test_system_health(self) -> bool:
        """Test system health check"""
        self.log("\n=== TESTING SYSTEM HEALTH ===")
        success, response = self.run_test(
            "System Health Check",
            "GET",
            "system/health",
            200
        )
        
        if success:
            self.log(f"  Status: {response.get('status', 'unknown')}")
            self.log(f"  Database: {response.get('database', 'unknown')}")
            self.log(f"  Timestamp: {response.get('timestamp', 'unknown')}")
            
        return success

    def test_contracts_template_mediation_agreement(self) -> bool:
        """Test GET /api/contracts/template/mediation_agreement - returns PDF template"""
        self.log("\n=== TESTING MEDIATION AGREEMENT TEMPLATE ===")
        
        # Test without auth first (should work for templates)
        url = f"{self.base_url}/api/contracts/template/mediation_agreement"
        
        try:
            response = self.session.get(url, timeout=30)
            success = response.status_code == 200
            
            if success:
                self.tests_passed += 1
                self.log(f"  ✅ PASSED - Status: {response.status_code}")
                self.log(f"  Content-Type: {response.headers.get('Content-Type', 'unknown')}")
                self.log(f"  Content-Length: {len(response.content)} bytes")
                
                # Check if it's actually a PDF
                if response.content.startswith(b'%PDF'):
                    self.log(f"  ✅ Valid PDF content detected")
                else:
                    self.log(f"  ⚠️  Content doesn't appear to be PDF")
                    
            else:
                self.log(f"  ❌ FAILED - Expected 200, got {response.status_code}")
                if response.text:
                    self.log(f"  Response: {response.text[:200]}...")
                    
            self.tests_run += 1
            return success
            
        except Exception as e:
            self.log(f"  ❌ FAILED - Error: {str(e)}")
            self.tests_run += 1
            return False

    def test_create_contract(self) -> str:
        """Test creating a contract"""
        self.log("\n=== TESTING CREATE CONTRACT ===")
        test_customer_id = f"test_customer_{int(time.time())}"
        success, response = self.run_test(
            "Create Contract",
            "POST",
            "contracts/create",
            201,
            data={
                "customerId": test_customer_id,
                "customerName": "Test Customer",
                "customerEmail": "test@example.com",
                "type": "mediation_agreement",
                "title": "Test Mediation Agreement",
                "vin": "1HGBH41JXMN123456",
                "vehicleTitle": "2023 Honda Accord",
                "price": 25000
            }
        )
        
        if success:
            contract_id = response.get('id')
            self.log(f"  Contract ID: {contract_id}")
            self.log(f"  Title: {response.get('title')}")
            self.log(f"  Status: {response.get('status')}")
            self.log(f"  Price: ${response.get('price')}")
            self.created_ids['contract'] = contract_id
            return contract_id
        
        return None

    def test_get_user_contracts(self) -> bool:
        """Test get user contracts"""
        self.log("\n=== TESTING GET USER CONTRACTS ===")
        success, response = self.run_test(
            "Get User Contracts",
            "GET",
            "contracts/me",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  User Contracts: {len(response)}")
                if response:
                    first_contract = response[0]
                    self.log(f"    First Contract: {first_contract.get('title')} - {first_contract.get('status')}")
            else:
                self.log(f"  Unexpected response format: {type(response)}")
            
        return success

    def test_sign_contract_with_signature(self) -> bool:
        """Test POST /api/contracts/:id/sign-with-signature - sign contract with signature data"""
        self.log("\n=== TESTING SIGN CONTRACT WITH SIGNATURE ===")
        
        # Use contract created in previous test
        contract_id = self.created_ids.get('contract')
        if not contract_id:
            self.log("  No contract ID available - skipping test")
            return False
            
        # Create a simple base64 signature image (1x1 pixel PNG)
        import base64
        signature_data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77mgAAAABJRU5ErkJggg=="
        
        success, response = self.run_test(
            "Sign Contract with Signature",
            "POST",
            f"contracts/{contract_id}/sign-with-signature",
            201,
            data={
                "signatureData": signature_data,
                "signedAt": datetime.now().isoformat()
            }
        )
        
        if success:
            self.log(f"  Contract ID: {response.get('id')}")
            self.log(f"  Status: {response.get('status')}")
            self.log(f"  Signed At: {response.get('signedAt')}")
            
        return success

    def test_admin_contracts_accounting(self) -> bool:
        """Test GET /api/admin/contracts/accounting - returns accounting overview"""
        self.log("\n=== TESTING ADMIN CONTRACTS ACCOUNTING ===")
        success, response = self.run_test(
            "Admin Contracts Accounting",
            "GET",
            "admin/contracts/accounting?period=30",
            200
        )
        
        if success:
            summary = response.get('summary', {})
            self.log(f"  Total Contracts: {summary.get('total', 0)}")
            self.log(f"  Signed: {summary.get('signed', 0)}")
            self.log(f"  Pending: {summary.get('pending', 0)}")
            self.log(f"  Rejected: {summary.get('rejected', 0)}")
            self.log(f"  Conversion Rate: {summary.get('conversionRate', '0%')}")
            
            price_stats = response.get('priceStats', {})
            if price_stats:
                self.log(f"  Total Value: ${price_stats.get('totalValue', 0)}")
                self.log(f"  Avg Price: ${price_stats.get('avgPrice', 0)}")
            
        return success

    def test_admin_contracts_export(self) -> bool:
        """Test GET /api/admin/contracts/export - exports contracts to CSV format"""
        self.log("\n=== TESTING ADMIN CONTRACTS EXPORT ===")
        success, response = self.run_test(
            "Admin Contracts Export",
            "GET",
            "admin/contracts/export?status=signed",
            200
        )
        
        if success:
            self.log(f"  Export Count: {response.get('count', 0)}")
            self.log(f"  Exported At: {response.get('exportedAt')}")
            
            contracts = response.get('contracts', [])
            if contracts:
                first_contract = contracts[0]
                self.log(f"  First Contract: {first_contract.get('customerName')} - {first_contract.get('status')}")
            
        return success

    def run_all_tests(self) -> int:
        """Run all contracts API tests"""
        self.log("🚀 Starting BIBI Cars CRM Contracts API Tests")
        
        # Basic tests
        if not self.test_admin_login():
            self.log("❌ Admin login failed, stopping tests")
            return 1
            
        if not self.test_system_health():
            self.log("⚠️  System health check failed")
        
        # Contract template tests
        self.test_contracts_template_mediation_agreement()
        
        # Contract CRUD tests
        contract_id = self.test_create_contract()
        if contract_id:
            self.test_sign_contract_with_signature()
        
        self.test_get_user_contracts()
        
        # Admin tests
        self.test_admin_contracts_accounting()
        self.test_admin_contracts_export()
        
        # Print results
        self.log(f"\n📊 Tests completed: {self.tests_passed}/{self.tests_run} passed")
        
        if self.tests_passed == self.tests_run:
            self.log("🎉 All tests passed!")
            return 0
        else:
            self.log(f"❌ {self.tests_run - self.tests_passed} tests failed")
            return 1

def main():
    tester = ContractsAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())