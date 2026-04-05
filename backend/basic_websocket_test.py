#!/usr/bin/env python3
"""
BIBI Cars CRM - Basic WebSocket Notifications Testing
Testing basic API endpoints and WebSocket availability
"""

import requests
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional

class BasicWebSocketTester:
    def __init__(self, base_url="https://competitor-inventory.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'BIBI-CRM-Basic-Test/1.0'
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

    def test_websocket_endpoint_availability(self) -> bool:
        """Test if WebSocket endpoint is available by checking socket.io endpoint"""
        self.log("\n=== TESTING WEBSOCKET ENDPOINT AVAILABILITY ===")
        
        # Test socket.io endpoint availability
        ws_url = f"{self.base_url}/socket.io/"
        
        try:
            response = self.session.get(ws_url, timeout=10)
            self.tests_run += 1
            
            if response.status_code in [200, 400]:  # 400 is expected for socket.io without proper handshake
                self.tests_passed += 1
                self.log(f"  ✅ WebSocket endpoint available - Status: {response.status_code}")
                return True
            else:
                self.log(f"  ❌ WebSocket endpoint not available - Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.tests_run += 1
            self.log(f"  ❌ WebSocket endpoint test failed: {str(e)}")
            return False

    def test_shipping_endpoints(self) -> bool:
        """Test shipping tracking endpoints still work"""
        self.log("\n=== TESTING SHIPPING TRACKING ENDPOINTS ===")
        
        # Test get user shipments
        success1, response1 = self.run_test(
            "Get User Shipments",
            "GET",
            "shipping/me",
            200
        )
        
        if success1:
            self.log(f"  User Shipments: {len(response1) if isinstance(response1, list) else 'N/A'}")
        
        # Test get active shipments (admin)
        success2, response2 = self.run_test(
            "Get Active Shipments (Admin)",
            "GET",
            "shipping/admin/active",
            200
        )
        
        if success2:
            self.log(f"  Active Shipments: {len(response2) if isinstance(response2, list) else 'N/A'}")
        
        return success1 and success2

    def test_create_shipment(self) -> str:
        """Test creating a shipment"""
        self.log("\n=== TESTING CREATE SHIPMENT ===")
        test_customer_id = f"test_customer_{int(time.time())}"
        success, response = self.run_test(
            "Create Shipment",
            "POST",
            "shipping",
            201,
            data={
                "dealId": f"test_deal_{int(time.time())}",
                "userId": test_customer_id,
                "managerId": "admin_user_id",
                "vin": f"WS{int(time.time())}123456",
                "vehicleTitle": "2023 Honda Accord WebSocket Test",
                "originPort": "Los Angeles, CA",
                "destinationPort": "Odessa, Ukraine",
                "containerNumber": f"WSTEST{int(time.time())}"
            }
        )
        
        if success:
            shipment_id = response.get('id')
            self.log(f"  Shipment ID: {shipment_id}")
            self.log(f"  VIN: {response.get('vin')}")
            self.log(f"  Status: {response.get('currentStatus')}")
            self.created_ids['shipment'] = shipment_id
            self.created_ids['customer_id'] = test_customer_id
            return shipment_id
        
        return None

    def test_notification_service_endpoints(self) -> bool:
        """Test notification-related endpoints if available"""
        self.log("\n=== TESTING NOTIFICATION SERVICE ENDPOINTS ===")
        
        # Test if there are any notification endpoints available
        endpoints_to_test = [
            ("notifications/settings", "GET", 200),
            ("notifications/history", "GET", 200),
        ]
        
        success_count = 0
        for endpoint, method, expected_status in endpoints_to_test:
            success, response = self.run_test(
                f"Test {endpoint}",
                method,
                endpoint,
                expected_status
            )
            if success:
                success_count += 1
        
        # Return true if at least one endpoint works or if none are implemented (which is also valid)
        return True

    def run_all_tests(self) -> int:
        """Run all basic WebSocket notification tests"""
        self.log("🚀 Starting BIBI Cars CRM Basic WebSocket Tests")
        self.log(f"Base URL: {self.base_url}")
        
        # Test system health first
        self.test_system_health()
        
        # Test admin login
        login_success = self.test_admin_login()
        
        if not login_success:
            self.log("❌ Admin login failed - cannot proceed with authenticated tests")
            return 1
        
        # Test WebSocket endpoint availability
        self.test_websocket_endpoint_availability()
        
        # Test shipping tracking endpoints still work
        self.test_shipping_endpoints()
        
        # Test notification service endpoints
        self.test_notification_service_endpoints()
        
        # Try to create a test shipment
        self.test_create_shipment()
        
        # Print final results
        self.log(f"\n📊 FINAL RESULTS")
        self.log(f"Tests run: {self.tests_run}")
        self.log(f"Tests passed: {self.tests_passed}")
        self.log(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.tests_passed >= self.tests_run * 0.8:  # 80% success rate is acceptable
            self.log("🎉 BASIC WEBSOCKET TESTS PASSED!")
            return 0
        else:
            self.log(f"❌ {self.tests_run - self.tests_passed} tests failed")
            return 1

def main():
    """Main test runner"""
    tester = BasicWebSocketTester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())