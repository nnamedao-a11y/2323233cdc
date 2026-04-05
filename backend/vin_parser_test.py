#!/usr/bin/env python3
"""
BIBI Cars VIN Parser - Backend API Tests
Testing VIN parsing system with fallback adapters (BidFax, Poctra, Google)
"""

import requests
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional

class VINParserAPITester:
    def __init__(self, base_url="https://competitor-inventory.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'VIN-Parser-Test-Client/1.0'
        })

    def log(self, message: str, level: str = "INFO"):
        """Log test messages"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")

    def run_test(self, name: str, method: str, endpoint: str, expected_status: int, 
                 data: Optional[Dict] = None, headers: Optional[Dict] = None, timeout: int = 30) -> tuple[bool, Dict]:
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
                response = self.session.get(url, headers=test_headers, timeout=timeout)
            elif method == 'POST':
                response = self.session.post(url, json=data, headers=test_headers, timeout=timeout)
            elif method == 'PUT':
                response = self.session.put(url, json=data, headers=test_headers, timeout=timeout)
            elif method == 'PATCH':
                response = self.session.patch(url, json=data, headers=test_headers, timeout=timeout)
            else:
                raise ValueError(f"Unsupported method: {method}")

            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                self.log(f"  ✅ PASSED - Status: {response.status_code}")
            else:
                self.log(f"  ❌ FAILED - Expected {expected_status}, got {response.status_code}")
                if response.text:
                    self.log(f"  Response: {response.text[:500]}...")

            try:
                response_data = response.json() if response.text else {}
            except:
                response_data = {"raw_response": response.text}

            return success, response_data

        except requests.exceptions.Timeout:
            self.log(f"  ❌ FAILED - Request timeout ({timeout}s)")
            return False, {"error": "timeout"}
        except Exception as e:
            self.log(f"  ❌ FAILED - Error: {str(e)}")
            return False, {"error": str(e)}

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
            self.log(f"  Version: {response.get('version', 'unknown')}")
            self.log(f"  Timestamp: {response.get('timestamp', 'unknown')}")
            
        return success

    def test_vin_quick_resolve(self) -> bool:
        """Test VIN quick resolve API"""
        self.log("\n=== TESTING VIN QUICK RESOLVE ===")
        test_vin = "5YJSA1DN2CFP09123"
        
        success, response = self.run_test(
            "VIN Quick Resolve",
            "GET",
            f"vin-unified/quick?vin={test_vin}",
            200,
            timeout=60  # VIN resolution can take time
        )
        
        if success:
            self.log(f"  VIN: {response.get('vin', 'unknown')}")
            self.log(f"  Success: {response.get('success', False)}")
            self.log(f"  Status: {response.get('status', 'unknown')}")
            self.log(f"  Source Type: {response.get('sourceType', 'unknown')}")
            self.log(f"  Verified: {response.get('verified', False)}")
            self.log(f"  Duration: {response.get('searchDurationMs', 0)}ms")
            
            # Check vehicle data
            vehicle = response.get('vehicle', {})
            if vehicle:
                self.log(f"  Vehicle: {vehicle.get('year')} {vehicle.get('make')} {vehicle.get('model')}")
                self.log(f"  Vehicle Confidence: {vehicle.get('confidence')}")
            
            # Check auction data
            auction = response.get('auction', {})
            if auction and auction.get('found'):
                self.log(f"  Auction: {auction.get('source')} - Lot #{auction.get('lotNumber')}")
                self.log(f"  Current Bid: ${auction.get('currentBid')}")
                self.log(f"  Auction Status: {auction.get('status')}")
            
            # Check fallback strategy
            fallback = response.get('fallbackStrategy', {})
            if fallback:
                self.log(f"  Fallback Mode: {fallback.get('mode')}")
                self.log(f"  Fallback Triggered: {fallback.get('triggered')}")
            
        return success

    def test_vin_dashboard_status(self) -> bool:
        """Test VIN dashboard status API"""
        self.log("\n=== TESTING VIN DASHBOARD STATUS ===")
        success, response = self.run_test(
            "VIN Dashboard Status",
            "GET",
            "vin-unified/dashboard/status",
            200
        )
        
        if success:
            self.log(f"  System Status: {response.get('systemStatus', 'unknown')}")
            self.log(f"  Active Sources: {response.get('activeSources', 0)}")
            self.log(f"  Total Requests: {response.get('totalRequests', 0)}")
            self.log(f"  Success Rate: {response.get('successRate', 0)}%")
            
            # Check source health
            sources = response.get('sources', [])
            if sources and isinstance(sources, list):
                self.log(f"  Sources Health:")
                for source in sources[:5]:  # Show first 5 sources
                    name = source.get('name', 'unknown')
                    status = source.get('status', 'unknown')
                    health = source.get('health', 0)
                    self.log(f"    - {name}: {status} (health: {health}%)")
            elif sources:
                self.log(f"  Sources data: {sources}")
            
        return success

    def test_vin_validation(self) -> bool:
        """Test VIN validation with invalid VINs"""
        self.log("\n=== TESTING VIN VALIDATION ===")
        
        invalid_vins = [
            "INVALID123",  # Too short
            "1234567890123456789",  # Too long
            "1HGBH41JXMN12345I",  # Contains invalid character 'I'
            "",  # Empty
            "1HGBH41JXMN12345O"  # Contains invalid character 'O'
        ]
        
        all_passed = True
        
        for invalid_vin in invalid_vins:
            success, response = self.run_test(
                f"VIN Validation - Invalid VIN: '{invalid_vin}'",
                "GET",
                f"vin-unified/quick?vin={invalid_vin}",
                400  # Should return 400 for invalid VINs
            )
            
            if success:
                self.log(f"  ✅ Correctly rejected invalid VIN: {invalid_vin}")
                self.log(f"  Message: {response.get('message', 'No message')}")
            else:
                self.log(f"  ❌ Unexpected response for invalid VIN: {invalid_vin}")
                all_passed = False
        
        return all_passed

    def run_all_tests(self) -> int:
        """Run all VIN parser API tests"""
        self.log("🚀 Starting BIBI Cars VIN Parser API Tests")
        self.log(f"Base URL: {self.base_url}")
        
        # Core system tests
        if not self.test_system_health():
            self.log("❌ System health check failed - stopping tests")
            return 1
        
        # VIN parsing tests
        self.test_vin_quick_resolve()
        self.test_vin_dashboard_status()
        self.test_vin_validation()
        
        # Print final results
        self.log(f"\n📊 Test Results:")
        self.log(f"  Tests Run: {self.tests_run}")
        self.log(f"  Tests Passed: {self.tests_passed}")
        self.log(f"  Tests Failed: {self.tests_run - self.tests_passed}")
        self.log(f"  Success Rate: {(self.tests_passed / self.tests_run * 100):.1f}%")
        
        if self.tests_passed == self.tests_run:
            self.log("🎉 All tests passed!")
            return 0
        else:
            self.log("❌ Some tests failed")
            return 1

def main():
    tester = VINParserAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())