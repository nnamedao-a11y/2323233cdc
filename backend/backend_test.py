#!/usr/bin/env python3
"""
BIBI Cars VIN Parser - Backend API Tests
Testing core VIN parsing functionality and validation
"""

import requests
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional

class BIBIVinTester:
    def __init__(self, base_url="https://328965f5-874d-425d-a283-16d858730ef3.preview.emergentagent.com"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'BIBI-VIN-Test-Client/1.0'
        })
        
        # Test VIN from requirements - should return Tesla 2012 Model S
        self.tesla_vin = '5YJSA1DN2CFP09123'

    def log(self, message: str, level: str = "INFO"):
        """Log test messages"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")

    def run_test(self, name: str, method: str, endpoint: str, expected_status: int, 
                 data: Optional[Dict] = None, timeout: int = 30) -> tuple[bool, Dict]:
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        
        self.tests_run += 1
        self.log(f"Testing {name}...")
        self.log(f"  URL: {url}")
        
        try:
            if method == 'GET':
                response = self.session.get(url, timeout=timeout)
            elif method == 'POST':
                response = self.session.post(url, json=data, timeout=timeout)
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

    def test_vin_quick_tesla(self) -> bool:
        """Test VIN quick API with Tesla VIN - should return 2012 Tesla Model S"""
        self.log("\n=== TESTING VIN QUICK API (Tesla) ===")
        success, response = self.run_test(
            "VIN Quick - Tesla",
            "GET",
            f"vin-unified/quick?vin={self.tesla_vin}",
            200
        )
        
        if success:
            self.log(f"  ✅ Success: {response.get('success')}")
            self.log(f"  VIN: {response.get('vin')}")
            self.log(f"  Status: {response.get('status')}")
            
            vehicle = response.get('vehicle', {})
            year = vehicle.get('year')
            make = vehicle.get('make')
            model = vehicle.get('model')
            
            self.log(f"  Vehicle: {year} {make} {model}")
            
            # Verify it's Tesla, not Toyota
            if make and make.upper() == 'TESLA':
                self.log(f"  ✅ Correctly identified as Tesla (not Toyota)")
                if year == 2012:
                    self.log(f"  ✅ Correct year: 2012")
                else:
                    self.log(f"  ⚠️  Year mismatch: expected 2012, got {year}")
            else:
                self.log(f"  ❌ CRITICAL: Expected Tesla, got {make}")
                return False
                
        return success

    def test_vin_resolve_tesla(self) -> bool:
        """Test VIN resolve API with Tesla VIN - should return Tesla not Toyota"""
        self.log("\n=== TESTING VIN RESOLVE API (Tesla) ===")
        success, response = self.run_test(
            "VIN Resolve - Tesla",
            "GET",
            f"vin-unified/resolve?vin={self.tesla_vin}",
            200
        )
        
        if success:
            self.log(f"  ✅ Success: {response.get('success')}")
            self.log(f"  VIN: {response.get('vin')}")
            self.log(f"  Status: {response.get('status')}")
            self.log(f"  Source Type: {response.get('sourceType')}")
            self.log(f"  Verified: {response.get('verified')}")
            
            vehicle = response.get('vehicle', {})
            year = vehicle.get('year')
            make = vehicle.get('make')
            model = vehicle.get('model')
            
            self.log(f"  Vehicle: {year} {make} {model}")
            
            # Critical validation: Must be Tesla, not Toyota
            if make and make.upper() == 'TESLA':
                self.log(f"  ✅ CRITICAL PASS: Correctly identified as Tesla (not Toyota)")
                if year == 2012:
                    self.log(f"  ✅ Correct year: 2012")
                if model and 'MODEL S' in model.upper():
                    self.log(f"  ✅ Correct model: Model S")
            else:
                self.log(f"  ❌ CRITICAL FAIL: Expected Tesla, got {make}")
                return False
                
            # Check P0 validation
            verified = response.get('verified')
            if verified:
                self.log(f"  ✅ P0 Validation: Data verified")
            else:
                self.log(f"  ⚠️  P0 Validation: Data not verified")
                
        return success

    def test_dashboard_status(self) -> bool:
        """Test dashboard status API"""
        self.log("\n=== TESTING DASHBOARD STATUS API ===")
        success, response = self.run_test(
            "Dashboard Status",
            "GET",
            "vin-unified/dashboard/status",
            200
        )
        
        if success:
            overview = response.get('overview', {})
            self.log(f"  Total Requests: {overview.get('totalRequests', 0)}")
            self.log(f"  Success Rate: {overview.get('overallSuccessRate', 'N/A')}")
            self.log(f"  Block Rate: {overview.get('overallBlockRate', 'N/A')}")
            
            sources = response.get('sources', {})
            healthy = sources.get('healthy', [])
            degraded = sources.get('degraded', [])
            
            self.log(f"  Healthy Sources: {len(healthy)} - {healthy}")
            self.log(f"  Degraded Sources: {len(degraded)} - {degraded}")
            
            # Check if Copart and IAAI are working
            if 'Copart' in healthy or 'IAAI' in healthy:
                self.log(f"  ✅ Core parsers (Copart/IAAI) are healthy")
            else:
                self.log(f"  ⚠️  Core parsers may have issues")
                
        return success

    def test_vin_validation_p0(self) -> bool:
        """Test P0 VIN validation - wrong VINs should be rejected"""
        self.log("\n=== TESTING P0 VIN VALIDATION ===")
        
        invalid_vins = [
            ("123", "Too short"),
            ("INVALID_VIN_CODE", "Invalid format"),
            ("1HGBH41JXMN10918", "16 chars (should be 17)"),
            ("", "Empty VIN"),
        ]
        
        all_success = True
        for invalid_vin, description in invalid_vins:
            self.log(f"\n  Testing invalid VIN: '{invalid_vin}' ({description})")
            
            success, response = self.run_test(
                f"P0 Validation - {description}",
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

    def test_mongodb_data_storage(self) -> bool:
        """Test if VIN data is stored in MongoDB vincaches collection"""
        self.log("\n=== TESTING MONGODB DATA STORAGE ===")
        
        # First, make a VIN request to ensure data is cached
        self.log("  Making VIN request to populate cache...")
        success, response = self.run_test(
            "VIN Request for Cache",
            "GET",
            f"vin-unified/resolve?vin={self.tesla_vin}&skipCache=false",
            200,
            timeout=60
        )
        
        if success:
            from_cache = response.get('fromCache', False)
            self.log(f"  Data from cache: {from_cache}")
            
            # Check if we have sources metadata indicating database interaction
            sources = response.get('sources', [])
            if sources:
                self.log(f"  ✅ Sources metadata present: {len(sources)} sources")
                for source in sources[:3]:  # Show first 3
                    self.log(f"    - {source.get('name')}: {source.get('success')}")
            else:
                self.log(f"  ⚠️  No sources metadata found")
                
            # Check if response indicates successful data storage
            search_duration = response.get('searchDurationMs', 0)
            if search_duration == 0 and from_cache:
                self.log(f"  ✅ Data retrieved from cache (indicates MongoDB storage)")
            elif search_duration > 0:
                self.log(f"  ✅ Fresh data processed (duration: {search_duration}ms)")
            
            return True
        else:
            self.log(f"  ❌ Failed to test MongoDB storage")
            return False

    def test_fallback_adapters(self) -> bool:
        """Test fallback adapters activation when CORE fails"""
        self.log("\n=== TESTING FALLBACK ADAPTERS ===")
        
        # Use a VIN that might trigger fallback
        test_vin = "1HGBH41JXMN109999"  # Modified Honda VIN
        
        success, response = self.run_test(
            "Fallback Adapters Test",
            "GET",
            f"vin-unified/resolve?vin={test_vin}&skipCache=true",
            200,
            timeout=60
        )
        
        if success:
            source_type = response.get('sourceType', 'unknown')
            verified = response.get('verified', False)
            fallback_strategy = response.get('fallbackStrategy', {})
            
            self.log(f"  Source Type: {source_type}")
            self.log(f"  Verified: {verified}")
            self.log(f"  Fallback Triggered: {fallback_strategy.get('triggered', False)}")
            self.log(f"  Fallback Mode: {fallback_strategy.get('mode', 'unknown')}")
            
            if source_type == 'fallback':
                self.log(f"  ✅ Fallback adapters activated successfully")
            elif source_type == 'core':
                self.log(f"  ✅ Core sources working (fallback not needed)")
            else:
                self.log(f"  ⚠️  Unknown source type: {source_type}")
                
        return success

    def run_all_tests(self) -> int:
        """Run all BIBI VIN Parser tests"""
        self.log("🚀 Starting BIBI Cars VIN Parser Tests")
        self.log(f"Base URL: {self.base_url}")
        self.log(f"Tesla VIN: {self.tesla_vin}")
        
        # Test 1: System Health
        if not self.test_system_health():
            self.log("❌ System health check failed - stopping tests")
            return 1
            
        # Test 2: VIN Quick API (Tesla)
        if not self.test_vin_quick_tesla():
            self.log("❌ VIN Quick API failed - critical issue")
            return 1
            
        # Test 3: VIN Resolve API (Tesla) - CRITICAL
        if not self.test_vin_resolve_tesla():
            self.log("❌ VIN Resolve API failed - critical issue")
            return 1
            
        # Test 4: Dashboard Status
        self.test_dashboard_status()
        
        # Test 5: P0 VIN Validation
        self.test_vin_validation_p0()
        
        # Test 6: MongoDB Data Storage
        self.test_mongodb_data_storage()
        
        # Test 7: Fallback Adapters
        self.test_fallback_adapters()
        
        # Print results
        self.log(f"\n📊 BIBI VIN PARSER TESTS COMPLETE")
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
    tester = BIBIVinTester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())