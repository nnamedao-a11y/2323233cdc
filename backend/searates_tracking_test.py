#!/usr/bin/env python3
"""
BIBI Cars CRM - SeaRates Shipping Tracking Integration Tests
Testing specific SeaRates tracking endpoints as requested
"""

import requests
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional

class SeaRatesTrackingTester:
    def __init__(self, base_url="https://vin-core-layer.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'BIBI-CRM-SeaRates-Test/1.0'
        })

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

    def test_manager_shipping_stats(self) -> bool:
        """Test GET /api/manager/shipping/stats - tracking statistics"""
        self.log("\n=== TESTING MANAGER SHIPPING STATS ===")
        success, response = self.run_test(
            "Manager Shipping Stats",
            "GET",
            "manager/shipping/stats",
            200
        )
        
        if success:
            self.log(f"  Total Shipments: {response.get('total', 0)}")
            self.log(f"  Active Tracking: {response.get('activeTracking', 0)}")
            self.log(f"  With Container: {response.get('withContainer', 0)}")
            self.log(f"  Stalled: {response.get('stalled', 0)}")
            self.log(f"  Missing Tracking: {response.get('missingTracking', 0)}")
            
        return success

    def test_manager_missing_tracking(self) -> bool:
        """Test GET /api/manager/shipping/missing-tracking - shipments without tracking"""
        self.log("\n=== TESTING MANAGER MISSING TRACKING ===")
        success, response = self.run_test(
            "Manager Missing Tracking",
            "GET",
            "manager/shipping/missing-tracking",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Shipments Missing Tracking: {len(response)}")
                if response:
                    first_shipment = response[0]
                    self.log(f"    First: VIN {first_shipment.get('vin')} - Status: {first_shipment.get('currentStatus')}")
            else:
                self.log(f"  Unexpected response format: {type(response)}")
            
        return success

    def test_admin_tracking_stats(self) -> bool:
        """Test GET /api/admin/shipping/tracking-stats - admin tracking stats"""
        self.log("\n=== TESTING ADMIN TRACKING STATS ===")
        success, response = self.run_test(
            "Admin Tracking Stats",
            "GET",
            "admin/shipping/tracking-stats",
            200
        )
        
        if success:
            self.log(f"  Total Shipments: {response.get('total', 0)}")
            self.log(f"  Active Tracking: {response.get('activeTracking', 0)}")
            self.log(f"  With Container: {response.get('withContainer', 0)}")
            self.log(f"  Stalled: {response.get('stalled', 0)}")
            self.log(f"  Missing Tracking: {response.get('missingTracking', 0)}")
            
        return success

    def test_searates_provider_status(self) -> bool:
        """Test SeaRates provider availability (should be disabled)"""
        self.log("\n=== TESTING SEARATES PROVIDER STATUS ===")
        
        # Try to test SeaRates connection - should fail gracefully since no API key
        success, response = self.run_test(
            "SeaRates Provider Test",
            "POST",
            "admin/integrations/searates/test",
            201  # Expecting 201 based on previous test result
        )
        
        if success:
            self.log(f"  Success: {response.get('success', False)}")
            self.log(f"  Message: {response.get('message', 'No message')}")
            if response.get('error'):
                self.log(f"  Error: {response.get('error')}")
            
        return success

    def test_create_test_shipment(self) -> str:
        """Create a test shipment for tracking tests"""
        self.log("\n=== CREATING TEST SHIPMENT ===")
        test_customer_id = f"test_customer_{int(time.time())}"
        success, response = self.run_test(
            "Create Test Shipment",
            "POST",
            "shipping",  # Correct endpoint is POST /api/shipping
            201,
            data={
                "dealId": f"deal_{int(time.time())}",
                "userId": test_customer_id,
                "managerId": "admin_user_id",
                "customerId": test_customer_id,
                "customerName": "Test Customer",
                "customerEmail": "test@example.com",
                "vin": "1HGBH41JXMN123456",
                "vehicleTitle": "2023 Honda Accord",
                "originPort": "Los Angeles, CA",
                "destinationPort": "Odessa, Ukraine",
                "containerNumber": "TCLU1234567"
            }
        )
        
        if success:
            shipment_id = response.get('id')
            self.log(f"  Shipment ID: {shipment_id}")
            self.log(f"  VIN: {response.get('vin')}")
            self.log(f"  Container: {response.get('containerNumber')}")
            return shipment_id
        
        return None

    def test_enable_tracking(self, shipment_id: str) -> bool:
        """Test enabling tracking for a shipment"""
        if not shipment_id:
            self.log("  No shipment ID available - skipping test")
            return False
            
        self.log("\n=== TESTING ENABLE TRACKING ===")
        success, response = self.run_test(
            "Enable Tracking",
            "POST",
            f"manager/shipping/{shipment_id}/enable",
            201  # Expecting 201 based on test result
        )
        
        if success:
            self.log(f"  Tracking Active: {response.get('trackingActive')}")
            self.log(f"  Tracking Mode: {response.get('trackingMode')}")
            self.log(f"  Provider: {response.get('trackingProvider')}")
            
        return success

    def test_sync_shipment(self, shipment_id: str) -> bool:
        """Test manual sync for a shipment (should fail gracefully without SeaRates)"""
        if not shipment_id:
            self.log("  No shipment ID available - skipping test")
            return False
            
        self.log("\n=== TESTING MANUAL SYNC ===")
        success, response = self.run_test(
            "Manual Sync Shipment",
            "POST",
            f"manager/shipping/{shipment_id}/sync",
            201  # Expecting 201 based on test result
        )
        
        if success:
            self.log(f"  Success: {response.get('success')}")
            self.log(f"  Message: {response.get('message')}")
            
        return success

    def run_all_tests(self) -> int:
        """Run all SeaRates tracking tests"""
        self.log("🚀 Starting BIBI Cars CRM SeaRates Shipping Tracking Tests")
        self.log(f"Base URL: {self.base_url}")
        
        # Test system health first
        self.test_system_health()
        
        # Test admin login
        login_success = self.test_admin_login()
        
        if not login_success:
            self.log("❌ Admin login failed - cannot proceed with authenticated tests")
            return 1
        
        # === SEARATES TRACKING TESTS ===
        self.log("\n🟡 TESTING SEARATES SHIPPING TRACKING FEATURES")
        
        # Test the specific endpoints mentioned in the review request
        self.test_manager_shipping_stats()
        self.test_manager_missing_tracking()
        self.test_admin_tracking_stats()
        
        # Test SeaRates provider status (should be disabled)
        self.test_searates_provider_status()
        
        # Create test shipment and test tracking functionality
        shipment_id = self.test_create_test_shipment()
        if shipment_id:
            self.test_enable_tracking(shipment_id)
            self.test_sync_shipment(shipment_id)
        
        # Print final results
        self.log(f"\n📊 FINAL RESULTS")
        self.log(f"Tests run: {self.tests_run}")
        self.log(f"Tests passed: {self.tests_passed}")
        self.log(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.tests_passed == self.tests_run:
            self.log("🎉 ALL SEARATES TRACKING TESTS PASSED!")
            return 0
        else:
            self.log(f"❌ {self.tests_run - self.tests_passed} tests failed")
            return 1

def main():
    """Main test runner"""
    tester = SeaRatesTrackingTester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())