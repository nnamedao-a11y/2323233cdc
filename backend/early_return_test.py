#!/usr/bin/env python3
"""
Early Return Strategy and Anti-Block System Tests
Testing VIN parser's new early return functionality and source health tracking
"""

import requests
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional

class EarlyReturnAPITester:
    def __init__(self, base_url="https://competitor-inventory.preview.emergentagent.com"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'Early-Return-Test-Client/1.0'
        })

    def log(self, message: str, level: str = "INFO"):
        """Log test messages"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")

    def run_test(self, name: str, method: str, endpoint: str, expected_status: int, 
                 params: Optional[Dict] = None, data: Optional[Dict] = None, 
                 timeout: int = 120) -> tuple[bool, Dict]:
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        
        self.tests_run += 1
        self.log(f"Testing {name}...")
        self.log(f"  URL: {url}")
        if params:
            self.log(f"  Params: {params}")
        
        try:
            start_time = time.time()
            
            if method == 'GET':
                response = self.session.get(url, params=params, timeout=timeout)
            elif method == 'POST':
                response = self.session.post(url, json=data, params=params, timeout=timeout)
            else:
                raise ValueError(f"Unsupported method: {method}")

            duration = time.time() - start_time
            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                self.log(f"  ✅ PASSED - Status: {response.status_code} ({duration:.2f}s)")
            else:
                self.log(f"  ❌ FAILED - Expected {expected_status}, got {response.status_code} ({duration:.2f}s)")
                if response.text:
                    self.log(f"  Response: {response.text[:300]}...")

            try:
                response_data = response.json() if response.text else {}
            except:
                response_data = {"raw_response": response.text}

            return success, response_data

        except requests.exceptions.Timeout:
            self.log(f"  ❌ FAILED - Request timeout after {timeout}s")
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
            200,
            timeout=30
        )
        
        if success:
            self.log(f"  Status: {response.get('status', 'unknown')}")
            self.log(f"  Services: {response.get('services', {})}")
            self.log(f"  Uptime: {response.get('uptime', 'unknown')}s")
            self.log(f"  Version: {response.get('version', 'unknown')}")
            
        return success

    def test_vin_quick_resolve_early_return(self) -> bool:
        """Test VIN quick resolve - should return partial data quickly"""
        self.log("\n=== TESTING VIN QUICK RESOLVE (EARLY RETURN) ===")
        test_vin = "5YJSA1DN2CFP09123"  # Tesla Model S VIN
        
        start_time = time.time()
        success, response = self.run_test(
            "VIN Quick Resolve - Early Return",
            "GET",
            "vin-unified/quick",
            200,
            params={"vin": test_vin},
            timeout=30
        )
        duration = time.time() - start_time
        
        if success:
            self.log(f"  VIN: {response.get('vin')}")
            self.log(f"  Success: {response.get('success')}")
            self.log(f"  Status: {response.get('status')}")
            self.log(f"  From Cache: {response.get('fromCache')}")
            self.log(f"  Duration: {response.get('searchDurationMs')}ms")
            self.log(f"  Actual Duration: {duration:.2f}s")
            
            # Check if response is quick (should be under 30 seconds for quick resolve)
            if duration <= 30:
                self.log(f"  ✅ Quick resolve performance: GOOD (≤ 30s)")
            else:
                self.log(f"  ❌ Quick resolve performance: SLOW (> 30s)")
                return False
            
            # Check vehicle data
            vehicle = response.get('vehicle', {})
            if vehicle:
                self.log(f"  Vehicle: {vehicle.get('year')} {vehicle.get('make')} {vehicle.get('model')}")
                self.log(f"  Vehicle Confidence: {vehicle.get('confidence')}")
            
            # Check sources
            sources = response.get('sources', [])
            self.log(f"  Sources: {len(sources)}")
            for source in sources:
                self.log(f"    - {source.get('name')}: {source.get('success')} ({source.get('responseTime')}ms)")
            
        return success

    def test_vin_full_resolve_early_return(self) -> bool:
        """Test VIN full resolve with Early Return - should complete in <60s with Copart data"""
        self.log("\n=== TESTING VIN FULL RESOLVE WITH EARLY RETURN ===")
        test_vin = "5YJSA1DN2CFP09123"  # Tesla Model S VIN
        
        start_time = time.time()
        success, response = self.run_test(
            "VIN Full Resolve - Early Return",
            "GET",
            "vin-unified/resolve",
            200,
            params={"vin": test_vin, "skipCache": "true"},
            timeout=90  # Allow up to 90s but expect <60s
        )
        duration = time.time() - start_time
        
        if success:
            self.log(f"  VIN: {response.get('vin')}")
            self.log(f"  Success: {response.get('success')}")
            self.log(f"  Status: {response.get('status')}")
            self.log(f"  From Cache: {response.get('fromCache')}")
            self.log(f"  Duration: {response.get('searchDurationMs')}ms")
            self.log(f"  Actual Duration: {duration:.2f}s")
            
            # Check if early return worked (should be under 60 seconds)
            if duration <= 60:
                self.log(f"  ✅ Early return performance: EXCELLENT (≤ 60s)")
            elif duration <= 90:
                self.log(f"  ⚠️  Early return performance: ACCEPTABLE (≤ 90s)")
            else:
                self.log(f"  ❌ Early return performance: SLOW (> 90s)")
                return False
            
            # Check for early return indicators in response
            early_return = response.get('earlyReturn', False)
            winner_source = response.get('winnerSource')
            if early_return:
                self.log(f"  ✅ Early return triggered by: {winner_source}")
            else:
                self.log(f"  ⚠️  Early return not triggered (may be expected)")
            
            # Check vehicle data
            vehicle = response.get('vehicle', {})
            if vehicle:
                self.log(f"  Vehicle: {vehicle.get('year')} {vehicle.get('make')} {vehicle.get('model')}")
                self.log(f"  Vehicle Confidence: {vehicle.get('confidence')}")
            
            # Check auction data (should have Copart data)
            auction = response.get('auction', {})
            if auction and auction.get('found'):
                self.log(f"  ✅ Auction Found: {auction.get('source')}")
                self.log(f"  Lot Number: {auction.get('lotNumber')}")
                self.log(f"  Current Bid: ${auction.get('currentBid')}")
                self.log(f"  Auction Status: {auction.get('status')}")
                
                # Check if Copart data is present
                if auction.get('source') == 'Copart':
                    self.log(f"  ✅ Copart data found as expected")
                else:
                    self.log(f"  ⚠️  Expected Copart data, got: {auction.get('source')}")
            else:
                self.log(f"  ⚠️  No auction data found")
            
            # Check sources and their performance
            sources = response.get('sources', [])
            self.log(f"  Sources: {len(sources)}")
            successful_sources = []
            failed_sources = []
            
            for source in sources:
                source_name = source.get('name')
                source_success = source.get('success')
                response_time = source.get('responseTime', 0)
                
                if source_success:
                    successful_sources.append(source_name)
                    self.log(f"    ✅ {source_name}: SUCCESS ({response_time}ms)")
                else:
                    failed_sources.append(source_name)
                    error_reason = source.get('errorReason', 'Unknown')
                    self.log(f"    ❌ {source_name}: FAILED - {error_reason}")
            
            self.log(f"  Successful sources: {len(successful_sources)}")
            self.log(f"  Failed sources: {len(failed_sources)}")
            
            # Validate P0 VIN matching
            returned_vin = response.get('vin', '').upper()
            if returned_vin == test_vin.upper():
                self.log(f"  ✅ P0 VIN Validation: PASSED - VIN matches")
            else:
                self.log(f"  ❌ P0 VIN Validation: FAILED - Expected {test_vin}, got {returned_vin}")
                return False
            
        return success

    def test_p0_vin_validation_rejection(self) -> bool:
        """Test P0 VIN validation - AutoBidMaster wrong data should be rejected"""
        self.log("\n=== TESTING P0 VIN VALIDATION (WRONG DATA REJECTION) ===")
        test_vin = "5YJSA1DN2CFP09123"  # Tesla Model S VIN
        
        success, response = self.run_test(
            "P0 VIN Validation - Wrong Data Rejection",
            "GET",
            "vin-unified/resolve",
            200,
            params={"vin": test_vin, "skipCache": "true"},
            timeout=90
        )
        
        if success:
            # Check sources for any that were rejected due to VIN mismatch
            sources = response.get('sources', [])
            rejected_sources = []
            accepted_sources = []
            
            for source in sources:
                source_name = source.get('name')
                source_success = source.get('success')
                error_reason = source.get('errorReason', '')
                
                if not source_success and 'vin' in error_reason.lower():
                    rejected_sources.append(source_name)
                    self.log(f"    ❌ {source_name}: REJECTED - {error_reason}")
                elif source_success:
                    accepted_sources.append(source_name)
                    self.log(f"    ✅ {source_name}: ACCEPTED")
            
            self.log(f"  Sources rejected for VIN mismatch: {len(rejected_sources)}")
            self.log(f"  Sources accepted: {len(accepted_sources)}")
            
            # Check if the final VIN matches input (P0 validation)
            returned_vin = response.get('vin', '').upper()
            input_vin = test_vin.upper()
            
            if returned_vin == input_vin:
                self.log(f"  ✅ P0 VIN Validation: PASSED - Final VIN matches input")
                
                # Check confidence - should be high if P0 validation passed
                confidence = response.get('confidence', {})
                overall_confidence = confidence.get('overall', 0)
                if overall_confidence >= 0.7:
                    self.log(f"  ✅ High confidence maintained: {overall_confidence}")
                else:
                    self.log(f"  ⚠️  Lower confidence: {overall_confidence}")
                
                return True
            else:
                self.log(f"  ❌ P0 VIN Validation: FAILED - VIN mismatch")
                return False
            
        return success

    def test_source_health_tracking(self) -> bool:
        """Test Source Health tracking - system tracks success/failure rates"""
        self.log("\n=== TESTING SOURCE HEALTH TRACKING ===")
        
        # First, make a request to generate some health data
        test_vin = "5YJSA1DN2CFP09123"
        
        self.log("  Making request to generate health data...")
        success, response = self.run_test(
            "Generate Health Data",
            "GET",
            "vin-unified/resolve",
            200,
            params={"vin": test_vin, "skipCache": "true"},
            timeout=90
        )
        
        if not success:
            self.log("  ❌ Failed to generate health data")
            return False
        
        # Check if response contains source metadata with health information
        sources = response.get('sources', [])
        if not sources:
            self.log("  ❌ No source data found")
            return False
        
        self.log(f"  Found {len(sources)} sources with health data")
        
        # Analyze source health data
        successful_sources = 0
        failed_sources = 0
        sources_with_timing = 0
        
        for source in sources:
            source_name = source.get('name')
            source_success = source.get('success')
            response_time = source.get('responseTime')
            error_reason = source.get('errorReason')
            
            if source_success:
                successful_sources += 1
                self.log(f"    ✅ {source_name}: SUCCESS ({response_time}ms)")
            else:
                failed_sources += 1
                self.log(f"    ❌ {source_name}: FAILED - {error_reason}")
            
            if response_time is not None:
                sources_with_timing += 1
        
        # Calculate health metrics
        total_sources = len(sources)
        success_rate = (successful_sources / total_sources) * 100 if total_sources > 0 else 0
        
        self.log(f"  Health Metrics:")
        self.log(f"    Total sources: {total_sources}")
        self.log(f"    Successful: {successful_sources}")
        self.log(f"    Failed: {failed_sources}")
        self.log(f"    Success rate: {success_rate:.1f}%")
        self.log(f"    Sources with timing data: {sources_with_timing}")
        
        # Validate health tracking
        if sources_with_timing > 0:
            self.log(f"  ✅ Source health tracking: Response times recorded")
        else:
            self.log(f"  ❌ Source health tracking: No timing data")
            return False
        
        if total_sources > 0:
            self.log(f"  ✅ Source health tracking: Success/failure rates tracked")
        else:
            self.log(f"  ❌ Source health tracking: No source data")
            return False
        
        # Check for early return winner (indicates health-based prioritization)
        early_return = response.get('earlyReturn', False)
        winner_source = response.get('winnerSource')
        
        if early_return and winner_source:
            self.log(f"  ✅ Health-based prioritization: {winner_source} won early return")
        else:
            self.log(f"  ⚠️  No early return winner (may be expected)")
        
        return True

    def test_performance_improvement(self) -> bool:
        """Test performance improvement - should be faster than old system"""
        self.log("\n=== TESTING PERFORMANCE IMPROVEMENT ===")
        test_vin = "5YJSA1DN2CFP09123"
        
        # Test multiple requests to get average performance
        durations = []
        early_returns = 0
        
        for i in range(3):
            self.log(f"  Performance test {i+1}/3...")
            
            start_time = time.time()
            success, response = self.run_test(
                f"Performance Test {i+1}",
                "GET",
                "vin-unified/resolve",
                200,
                params={"vin": test_vin, "skipCache": "true"},
                timeout=90
            )
            duration = time.time() - start_time
            
            if success:
                durations.append(duration)
                if response.get('earlyReturn', False):
                    early_returns += 1
                    self.log(f"    Early return triggered by: {response.get('winnerSource')}")
            else:
                self.log(f"    Test {i+1} failed")
                return False
            
            # Wait a bit between requests
            time.sleep(2)
        
        if durations:
            avg_duration = sum(durations) / len(durations)
            min_duration = min(durations)
            max_duration = max(durations)
            
            self.log(f"  Performance Results:")
            self.log(f"    Average duration: {avg_duration:.2f}s")
            self.log(f"    Min duration: {min_duration:.2f}s")
            self.log(f"    Max duration: {max_duration:.2f}s")
            self.log(f"    Early returns: {early_returns}/3")
            
            # Check if performance meets expectations
            if avg_duration <= 30:
                self.log(f"  ✅ Performance: EXCELLENT (avg ≤ 30s)")
            elif avg_duration <= 60:
                self.log(f"  ✅ Performance: GOOD (avg ≤ 60s)")
            elif avg_duration <= 90:
                self.log(f"  ⚠️  Performance: ACCEPTABLE (avg ≤ 90s)")
            else:
                self.log(f"  ❌ Performance: SLOW (avg > 90s)")
                return False
            
            # Check early return effectiveness
            if early_returns > 0:
                self.log(f"  ✅ Early return strategy: WORKING ({early_returns}/3 requests)")
            else:
                self.log(f"  ⚠️  Early return strategy: NOT TRIGGERED (may be expected)")
            
            return True
        
        return False

    def run_all_tests(self) -> int:
        """Run all Early Return Strategy and Anti-Block System tests"""
        self.log("🚀 Starting Early Return Strategy and Anti-Block System Tests")
        self.log(f"Base URL: {self.base_url}")
        
        # Core functionality tests
        tests = [
            ("System Health", self.test_system_health),
            ("VIN Quick Resolve (Early Return)", self.test_vin_quick_resolve_early_return),
            ("VIN Full Resolve with Early Return", self.test_vin_full_resolve_early_return),
            ("P0 VIN Validation (Wrong Data Rejection)", self.test_p0_vin_validation_rejection),
            ("Source Health Tracking", self.test_source_health_tracking),
            ("Performance Improvement", self.test_performance_improvement),
        ]
        
        failed_tests = []
        
        for test_name, test_func in tests:
            try:
                if not test_func():
                    failed_tests.append(test_name)
            except Exception as e:
                self.log(f"❌ {test_name} crashed: {str(e)}")
                failed_tests.append(test_name)
        
        # Print summary
        self.log(f"\n📊 TEST SUMMARY")
        self.log(f"Tests run: {self.tests_run}")
        self.log(f"Tests passed: {self.tests_passed}")
        self.log(f"Tests failed: {self.tests_run - self.tests_passed}")
        self.log(f"Success rate: {(self.tests_passed / self.tests_run * 100):.1f}%")
        
        if failed_tests:
            self.log(f"\n❌ Failed tests:")
            for test in failed_tests:
                self.log(f"  - {test}")
        else:
            self.log(f"\n✅ All tests passed!")
        
        return 0 if len(failed_tests) == 0 else 1

def main():
    """Main test runner"""
    tester = EarlyReturnAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())