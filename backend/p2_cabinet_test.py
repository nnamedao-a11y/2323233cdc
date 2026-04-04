#!/usr/bin/env python3
"""
BIBI Cars CRM - P2 Cabinet & Invoice Reminders Backend API Tests
Testing P2 features: 
1) /api/cabinet/invoices and /api/cabinet/shipping endpoints
2) /api/invoice-reminders/escalation-summary and /api/invoice-reminders/process endpoints
3) Notification dispatcher integration (SMS/Viber - mocked)
"""

import requests
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional

class P2CabinetAPITester:
    def __init__(self, base_url="https://vin-core-layer.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'BIBI-CRM-P2-Test-Client/1.0'
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

    # === P2 CABINET ENDPOINTS ===

    def test_cabinet_invoices(self) -> bool:
        """Test /api/cabinet/invoices endpoint"""
        self.log("\n=== TESTING CABINET INVOICES ===")
        success, response = self.run_test(
            "Get Cabinet Invoices",
            "GET",
            "cabinet/invoices",
            200
        )
        
        if success:
            self.log(f"  Response structure: {list(response.keys()) if isinstance(response, dict) else type(response)}")
            if isinstance(response, dict):
                data = response.get('data', response.get('invoices', []))
                summary = response.get('summary', {})
                self.log(f"  Invoices count: {len(data) if isinstance(data, list) else 'N/A'}")
                if summary:
                    self.log(f"  Summary - Total: {summary.get('total', 0)}, Paid: {summary.get('paid', 0)}, Pending: {summary.get('pending', 0)}")
            
        return success

    def test_cabinet_invoices_by_customer_id(self) -> bool:
        """Test /api/cabinet/invoices/:customerId endpoint"""
        self.log("\n=== TESTING CABINET INVOICES BY CUSTOMER ID ===")
        test_customer_id = "ad428bea-06fc-4311-8809-351bb2913bed"  # Real customer ID
        success, response = self.run_test(
            "Get Cabinet Invoices by Customer ID",
            "GET",
            f"cabinet/invoices/{test_customer_id}",
            200
        )
        
        if success:
            self.log(f"  Response structure: {list(response.keys()) if isinstance(response, dict) else type(response)}")
            if isinstance(response, dict):
                data = response.get('data', response.get('invoices', []))
                self.log(f"  Invoices for customer {test_customer_id}: {len(data) if isinstance(data, list) else 'N/A'}")
            
        return success

    def test_cabinet_shipping(self) -> bool:
        """Test /api/cabinet/shipping endpoint"""
        self.log("\n=== TESTING CABINET SHIPPING ===")
        success, response = self.run_test(
            "Get Cabinet Shipping",
            "GET",
            "cabinet/shipping",
            200
        )
        
        if success:
            self.log(f"  Response structure: {list(response.keys()) if isinstance(response, dict) else type(response)}")
            if isinstance(response, dict):
                data = response.get('data', [])
                self.log(f"  Shipping records count: {len(data) if isinstance(data, list) else 'N/A'}")
            
        return success

    def test_cabinet_shipping_by_customer_id(self) -> bool:
        """Test /api/cabinet/shipping/:customerId endpoint"""
        self.log("\n=== TESTING CABINET SHIPPING BY CUSTOMER ID ===")
        test_customer_id = "ad428bea-06fc-4311-8809-351bb2913bed"  # Real customer ID
        success, response = self.run_test(
            "Get Cabinet Shipping by Customer ID",
            "GET",
            f"cabinet/shipping/{test_customer_id}",
            200
        )
        
        if success:
            self.log(f"  Response structure: {list(response.keys()) if isinstance(response, dict) else type(response)}")
            if isinstance(response, dict):
                data = response.get('data', [])
                self.log(f"  Shipping records for customer {test_customer_id}: {len(data) if isinstance(data, list) else 'N/A'}")
            
        return success

    # === P2 INVOICE REMINDERS ENDPOINTS ===

    def test_invoice_reminders_critical(self) -> bool:
        """Test /api/invoice-reminders/critical endpoint"""
        self.log("\n=== TESTING INVOICE REMINDERS CRITICAL ===")
        success, response = self.run_test(
            "Get Critical Overdue Invoices",
            "GET",
            "invoice-reminders/critical",
            200
        )
        
        if success:
            self.log(f"  Response structure: {list(response.keys()) if isinstance(response, dict) else type(response)}")
            if isinstance(response, list):
                self.log(f"  Critical invoices count: {len(response)}")
            
        return success

    def test_invoice_reminders_escalation_summary(self) -> bool:
        """Test /api/invoice-reminders/escalation-summary endpoint"""
        self.log("\n=== TESTING INVOICE REMINDERS ESCALATION SUMMARY ===")
        success, response = self.run_test(
            "Get Invoice Reminders Escalation Summary",
            "GET",
            "invoice-reminders/escalation-summary",
            200
        )
        
        if success:
            self.log(f"  Response structure: {list(response.keys()) if isinstance(response, dict) else type(response)}")
            if isinstance(response, dict):
                self.log(f"  Level 1 Count: {response.get('level1Count', 0)}")
                self.log(f"  Level 2 Count: {response.get('level2Count', 0)}")
                self.log(f"  Level 3 Count: {response.get('level3Count', 0)}")
                self.log(f"  Critical Count: {response.get('criticalCount', 0)}")
            
        return success

    def test_invoice_reminders_process(self) -> bool:
        """Test /api/invoice-reminders/process endpoint"""
        self.log("\n=== TESTING INVOICE REMINDERS PROCESS ===")
        success, response = self.run_test(
            "Force Process Invoice Reminders",
            "POST",
            "invoice-reminders/process",
            201  # Fixed: endpoint returns 201, not 200
        )
        
        if success:
            self.log(f"  Response structure: {list(response.keys()) if isinstance(response, dict) else type(response)}")
            if isinstance(response, dict):
                self.log(f"  Processed: {response.get('processed', 0)}")
                self.log(f"  Reminders sent: {response.get('reminders', 0)}")
            
        return success

    # === CABINET WITH CUSTOMER ID HEADER ===

    def test_cabinet_with_customer_header(self) -> bool:
        """Test cabinet endpoints with x-customer-id header"""
        self.log("\n=== TESTING CABINET WITH CUSTOMER ID HEADER ===")
        test_customer_id = "46dc6328-3d73-45b6-ae6e-3c5ace353519"  # Real customer ID
        
        # Test invoices with header
        success1, response1 = self.run_test(
            "Get Cabinet Invoices with Customer Header",
            "GET",
            "cabinet/invoices",
            200,
            headers={"x-customer-id": test_customer_id}
        )
        
        if success1:
            self.log(f"  Invoices with header - Response: {list(response1.keys()) if isinstance(response1, dict) else type(response1)}")
        
        # Test shipping with header
        success2, response2 = self.run_test(
            "Get Cabinet Shipping with Customer Header",
            "GET",
            "cabinet/shipping",
            200,
            headers={"x-customer-id": test_customer_id}
        )
        
        if success2:
            self.log(f"  Shipping with header - Response: {list(response2.keys()) if isinstance(response2, dict) else type(response2)}")
        
        return success1 and success2

    def run_all_tests(self) -> int:
        """Run all P2 Cabinet & Invoice Reminders tests"""
        self.log("🚀 Starting BIBI Cars CRM P2 Cabinet & Invoice Reminders Tests")
        self.log(f"Base URL: {self.base_url}")
        
        # Test admin login
        login_success = self.test_admin_login()
        
        if not login_success:
            self.log("❌ Admin login failed - cannot proceed with authenticated tests")
            return 1
        
        # === P2 CABINET ENDPOINTS ===
        self.log("\n🔵 TESTING P2 CABINET ENDPOINTS")
        
        self.test_cabinet_invoices()
        self.test_cabinet_invoices_by_customer_id()
        self.test_cabinet_shipping()
        self.test_cabinet_shipping_by_customer_id()
        self.test_cabinet_with_customer_header()
        
        # === P2 INVOICE REMINDERS ENDPOINTS ===
        self.log("\n🟢 TESTING P2 INVOICE REMINDERS ENDPOINTS")
        
        self.test_invoice_reminders_critical()
        self.test_invoice_reminders_escalation_summary()
        self.test_invoice_reminders_process()
        
        # Print final results
        self.log(f"\n📊 FINAL RESULTS")
        self.log(f"Tests run: {self.tests_run}")
        self.log(f"Tests passed: {self.tests_passed}")
        self.log(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.tests_passed == self.tests_run:
            self.log("🎉 ALL P2 TESTS PASSED!")
            return 0
        else:
            self.log(f"❌ {self.tests_run - self.tests_passed} tests failed")
            return 1

def main():
    """Main test runner"""
    tester = P2CabinetAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())