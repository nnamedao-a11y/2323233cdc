#!/usr/bin/env python3
"""
BIBI Cars CRM - VIN Unified Module Tests
Testing VIN parsing logic and unified API endpoints
"""

import requests
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional

class VinUnifiedTester:
    def __init__(self, base_url="https://competitor-inventory.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'BIBI-CRM-VIN-Test-Client/1.0'
        })
        
        # Test VINs provided in the requirements
        self.test_vins = {
            'honda': '1HGBH41JXMN109186',
            'tesla': '5YJSA1DN2CFP09123'
        }

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

    def test_vin_unified_resolve(self) -> bool:
        """Test VIN Unified resolve endpoint"""
        self.log("\n=== TESTING VIN UNIFIED RESOLVE ===")
        
        all_success = True
        for car_type, vin in self.test_vins.items():
            self.log(f"\n  Testing {car_type.upper()} VIN: {vin}")
            
            success, response = self.run_test(
                f"VIN Resolve - {car_type}",
                "GET",
                f"vin-unified/resolve?vin={vin}",
                200
            )
            
            if success:
                self.log(f"    ✅ Success: {response.get('success')}")
                self.log(f"    VIN: {response.get('vin')}")
                self.log(f"    Status: {response.get('status')}")
                self.log(f"    Message: {response.get('message')}")
                self.log(f"    Sources Used: {response.get('sourcesUsed', 0)}")
                self.log(f"    Duration: {response.get('searchDurationMs', 0)}ms")
                self.log(f"    From Cache: {response.get('fromCache', False)}")
                
                vehicle = response.get('vehicle')
                if vehicle:
                    self.log(f"    Vehicle Title: {vehicle.get('title')}")
                    self.log(f"    Year: {vehicle.get('year')}")
                    self.log(f"    Make: {vehicle.get('make')}")
                    self.log(f"    Model: {vehicle.get('model')}")
                    self.log(f"    Price: ${vehicle.get('price', 0):,}")
                    confidence = vehicle.get('confidence', 0)
                    if isinstance(confidence, (int, float)):
                        self.log(f"    Confidence: {confidence:.2f}")
                    else:
                        self.log(f"    Confidence: {confidence}")
                    self.log(f"    Images: {len(vehicle.get('images', []))}")
                
                scoring = response.get('scoring')
                if scoring:
                    self.log(f"    Deal Score: {scoring.get('dealScore')}")
                    self.log(f"    Recommendation: {scoring.get('recommendation')}")
            else:
                all_success = False
                
        return all_success

    def test_vin_unified_quick(self) -> bool:
        """Test VIN Unified quick endpoint (Tier 1 only)"""
        self.log("\n=== TESTING VIN UNIFIED QUICK ===")
        
        vin = self.test_vins['honda']  # Use Honda VIN for quick test
        self.log(f"  Testing Quick Resolve with VIN: {vin}")
        
        success, response = self.run_test(
            "VIN Quick Resolve",
            "GET",
            f"vin-unified/quick?vin={vin}",
            200
        )
        
        if success:
            self.log(f"  ✅ Success: {response.get('success')}")
            self.log(f"  VIN: {response.get('vin')}")
            self.log(f"  Status: {response.get('status')}")
            self.log(f"  Sources Used: {response.get('sourcesUsed', 0)}")
            self.log(f"  Duration: {response.get('searchDurationMs', 0)}ms")
            self.log(f"  Message: {response.get('message')}")
            
            # Quick should be faster than full resolve
            duration = response.get('searchDurationMs', 0)
            if duration > 0:
                self.log(f"  Performance: {duration}ms (should be < 3000ms for quick)")
                
        return success

    def test_vin_unified_param_search(self) -> bool:
        """Test VIN Unified parameter search endpoint"""
        self.log("\n=== TESTING VIN UNIFIED PARAM SEARCH ===")
        
        vin = self.test_vins['tesla']  # Use Tesla VIN for param test
        self.log(f"  Testing Param Search with VIN: {vin}")
        
        success, response = self.run_test(
            "VIN Param Search",
            "GET",
            f"vin-unified/{vin}",
            200
        )
        
        if success:
            self.log(f"  ✅ Success: {response.get('success')}")
            self.log(f"  VIN: {response.get('vin')}")
            self.log(f"  Status: {response.get('status')}")
            self.log(f"  Sources Used: {response.get('sourcesUsed', 0)}")
            self.log(f"  Message: {response.get('message')}")
            
        return success

    def test_vin_unified_lead_creation(self) -> bool:
        """Test VIN Unified lead creation"""
        self.log("\n=== TESTING VIN UNIFIED LEAD CREATION ===")
        
        vin = self.test_vins['honda']
        test_timestamp = int(time.time())
        
        success, response = self.run_test(
            "VIN Lead Creation",
            "POST",
            "vin-unified/lead",
            201,
            data={
                "vin": vin,
                "firstName": f"Test Customer {test_timestamp}",
                "lastName": "VIN Lead",
                "email": f"test.vin.{test_timestamp}@example.com",
                "phone": "+380991234567",
                "message": "Interested in this vehicle from VIN search"
            }
        )
        
        if success:
            self.log(f"  ✅ Success: {response.get('success')}")
            self.log(f"  Lead ID: {response.get('leadId')}")
            self.log(f"  Message: {response.get('message')}")
            
        return success

    def test_vin_validation(self) -> bool:
        """Test VIN validation with invalid VINs"""
        self.log("\n=== TESTING VIN VALIDATION ===")
        
        invalid_vins = [
            "123",  # Too short
            "INVALID_VIN_CODE",  # Invalid format
            "1HGBH41JXMN10918",  # 16 chars (should be 17)
            "",  # Empty
        ]
        
        all_success = True
        for invalid_vin in invalid_vins:
            self.log(f"\n  Testing invalid VIN: '{invalid_vin}'")
            
            success, response = self.run_test(
                f"Invalid VIN Test - {invalid_vin[:10]}",
                "GET",
                f"vin-unified/resolve?vin={invalid_vin}",
                400  # Should return 400 for invalid VIN
            )
            
            if success:
                self.log(f"    ✅ Correctly rejected invalid VIN")
                self.log(f"    Message: {response.get('message', 'No message')}")
            else:
                self.log(f"    ❌ Should have rejected invalid VIN")
                all_success = False
                
        return all_success

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

    def test_dashboard_sources(self) -> bool:
        """Test VIN Unified dashboard sources endpoint"""
        self.log("\n=== TESTING DASHBOARD SOURCES ===")
        success, response = self.run_test(
            "Dashboard Sources",
            "GET",
            "vin-unified/dashboard/sources",
            200
        )
        
        if success:
            self.log(f"  ✅ Dashboard sources retrieved successfully")
            if isinstance(response, list):
                self.log(f"  Sources count: {len(response)}")
                for i, source in enumerate(response[:3]):  # Show first 3 sources
                    self.log(f"    Source {i+1}: {source.get('source', 'unknown')}")
                    self.log(f"      Success Rate: {source.get('health', {}).get('successRate', 'N/A')}")
                    self.log(f"      VIN Match Rate: {source.get('health', {}).get('vinMatchRate', 'N/A')}")
                    self.log(f"      Block Rate: {source.get('health', {}).get('blockRate', 'N/A')}")
                    self.log(f"      Avg Latency: {source.get('performance', {}).get('avgLatencyMs', 0)}ms")
                    self.log(f"      Effective Weight: {source.get('weights', {}).get('effective', 0)}")
                    self.log(f"      Degraded: {source.get('flags', {}).get('degraded', False)}")
            else:
                self.log(f"  Unexpected response format: {type(response)}")
                
        return success

    def test_dashboard_status(self) -> bool:
        """Test VIN Unified dashboard status endpoint"""
        self.log("\n=== TESTING DASHBOARD STATUS ===")
        success, response = self.run_test(
            "Dashboard Status",
            "GET",
            "vin-unified/dashboard/status",
            200
        )
        
        if success:
            self.log(f"  ✅ Dashboard status retrieved successfully")
            overview = response.get('overview', {})
            self.log(f"  Total Requests: {overview.get('totalRequests', 0)}")
            self.log(f"  Overall Success Rate: {overview.get('overallSuccessRate', 'N/A')}")
            self.log(f"  Overall Block Rate: {overview.get('overallBlockRate', 'N/A')}")
            
            sources = response.get('sources', {})
            self.log(f"  Healthy Sources: {len(sources.get('healthy', []))}")
            self.log(f"  Degraded Sources: {len(sources.get('degraded', []))}")
            self.log(f"  Total Sources: {sources.get('total', 0)}")
            
            top_sources = response.get('topSources', [])
            self.log(f"  Top Sources:")
            for source in top_sources:
                self.log(f"    {source.get('name', 'unknown')}: {source.get('effectiveWeight', 0)}")
                
        return success

    def test_vin_resolve_with_orchestrator(self) -> bool:
        """Test VIN resolve with Smart Orchestrator (skipCache=true)"""
        self.log("\n=== TESTING VIN RESOLVE WITH ORCHESTRATOR ===")
        
        vin = self.test_vins['tesla']  # Use Tesla VIN for orchestrator test
        self.log(f"  Testing Orchestrator with VIN: {vin} (skipCache=true)")
        
        start_time = time.time()
        success, response = self.run_test(
            "VIN Resolve with Orchestrator",
            "GET",
            f"vin-unified/resolve?vin={vin}&skipCache=true",
            200
        )
        end_time = time.time()
        
        if success:
            duration = (end_time - start_time) * 1000  # Convert to ms
            self.log(f"  ✅ Success: {response.get('success')}")
            self.log(f"  VIN: {response.get('vin')}")
            self.log(f"  Status: {response.get('status')}")
            self.log(f"  Sources Used: {response.get('sourcesUsed', 0)}")
            self.log(f"  Search Duration: {response.get('searchDurationMs', 0)}ms")
            self.log(f"  Actual Duration: {duration:.0f}ms")
            self.log(f"  From Cache: {response.get('fromCache', False)}")
            self.log(f"  Message: {response.get('message')}")
            
            # Check if orchestrator metadata is present
            metadata = response.get('metadata', [])
            if metadata:
                self.log(f"  Orchestrator Metadata: {len(metadata)} sources")
                for meta in metadata[:3]:  # Show first 3
                    self.log(f"    {meta.get('name', 'unknown')}: {meta.get('success', False)} ({meta.get('responseTime', 0)}ms)")
            
            # Check for early return indication
            if response.get('earlyReturn'):
                self.log(f"  🚀 Early return detected from: {response.get('winnerSource', 'unknown')}")
                
        return success

    def run_all_tests(self) -> int:
        """Run all VIN Unified tests"""
        self.log("🚀 Starting BIBI Cars CRM VIN Unified Tests with Smart Orchestrator")
        self.log(f"Base URL: {self.base_url}")
        self.log(f"Test VINs: {self.test_vins}")
        
        # Test 1: System Health
        if not self.test_system_health():
            self.log("❌ System health check failed - stopping tests")
            return 1
            
        # Test 2: Admin Login
        if not self.test_admin_login():
            self.log("❌ Admin login failed - stopping tests")
            return 1
            
        # Test 3: Dashboard Sources (Smart Orchestrator metrics)
        self.test_dashboard_sources()
        
        # Test 4: Dashboard Status (System overview)
        self.test_dashboard_status()
        
        # Test 5: VIN Validation
        self.test_vin_validation()
        
        # Test 6: VIN Resolve with Orchestrator (skipCache=true)
        self.test_vin_resolve_with_orchestrator()
        
        # Test 7: VIN Unified Resolve (normal)
        self.test_vin_unified_resolve()
        
        # Test 8: VIN Unified Quick
        self.test_vin_unified_quick()
        
        # Test 9: VIN Unified Param Search
        self.test_vin_unified_param_search()
        
        # Test 10: VIN Lead Creation
        self.test_vin_unified_lead_creation()
        
        # Print results
        self.log(f"\n📊 VIN UNIFIED TESTS COMPLETE")
        self.log(f"Tests passed: {self.tests_passed}/{self.tests_run}")
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        self.log(f"Success rate: {success_rate:.1f}%")
        
        if self.tests_passed == self.tests_run:
            self.log("🎉 ALL TESTS PASSED!")
            return 0
        else:
            self.log("❌ Some tests failed")
            return 1

def main():
    tester = VinUnifiedTester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())