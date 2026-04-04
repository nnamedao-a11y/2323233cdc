#!/usr/bin/env python3
"""
Health-Aware Tier Factory Test
Testing the new health-aware orchestration system that auto-calculates tier delays
based on live source performance metrics.
"""

import requests
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional

class HealthAwareTierTester:
    def __init__(self, base_url="https://vin-core-layer.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'BIBI-CRM-Health-Aware-Test/1.0'
        })
        
        # Test VIN from requirements
        self.test_vin = '5YJSA1DN2CFP09123'

    def log(self, message: str, level: str = "INFO"):
        """Log test messages"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")

    def run_test(self, name: str, method: str, endpoint: str, expected_status: int, 
                 data: Optional[Dict] = None, timeout: int = 30) -> tuple[bool, Dict]:
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        test_headers = self.session.headers.copy()
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'

        self.tests_run += 1
        self.log(f"Testing {name}...")
        self.log(f"  URL: {url}")
        
        try:
            start_time = time.time()
            if method == 'GET':
                response = self.session.get(url, headers=test_headers, timeout=timeout)
            elif method == 'POST':
                response = self.session.post(url, json=data, headers=test_headers, timeout=timeout)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            duration = (time.time() - start_time) * 1000  # Convert to ms

            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                self.log(f"  ✅ PASSED - Status: {response.status_code} ({duration:.0f}ms)")
            else:
                self.log(f"  ❌ FAILED - Expected {expected_status}, got {response.status_code}")
                if response.text:
                    self.log(f"  Response: {response.text[:500]}...")

            try:
                response_data = response.json() if response.text else {}
                response_data['_test_duration_ms'] = duration
            except:
                response_data = {"raw_response": response.text, "_test_duration_ms": duration}

            return success, response_data

        except requests.exceptions.Timeout:
            self.log(f"  ❌ FAILED - Request timeout after {timeout}s")
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
            self.log(f"  Version: {response.get('version', 'unknown')}")
            
        return success

    def test_dashboard_sources_health_metrics(self) -> bool:
        """Test dashboard sources with focus on health-aware metrics"""
        self.log("\n=== TESTING DASHBOARD SOURCES (Health-Aware Metrics) ===")
        success, response = self.run_test(
            "Dashboard Sources - Health Metrics",
            "GET",
            "vin-unified/dashboard/sources",
            200
        )
        
        if success:
            self.log(f"  ✅ Dashboard sources retrieved successfully")
            if isinstance(response, list):
                self.log(f"  Total sources: {len(response)}")
                
                # Focus on health-aware metrics
                copart_source = None
                iaai_source = None
                degraded_sources = []
                
                for source in response:
                    source_name = source.get('source', 'unknown')
                    health = source.get('health', {})
                    performance = source.get('performance', {})
                    flags = source.get('flags', {})
                    
                    if source_name == 'Copart':
                        copart_source = source
                    elif source_name == 'IAAI':
                        iaai_source = source
                    
                    if flags.get('degraded', False):
                        degraded_sources.append(source_name)
                    
                    self.log(f"    {source_name}:")
                    self.log(f"      Success Rate: {health.get('successRate', 'N/A')}")
                    self.log(f"      VIN Match Rate: {health.get('vinMatchRate', 'N/A')}")
                    self.log(f"      Block Rate: {health.get('blockRate', 'N/A')}")
                    self.log(f"      Avg Latency: {performance.get('avgLatencyMs', 0)}ms")
                    self.log(f"      Degraded: {flags.get('degraded', False)}")
                
                # Analyze health-aware tier factory inputs
                if copart_source:
                    copart_health = copart_source.get('health', {})
                    copart_perf = copart_source.get('performance', {})
                    self.log(f"\n  🎯 COPART ANALYSIS (Primary Source):")
                    self.log(f"    Success Rate: {copart_health.get('successRate', 0)}")
                    self.log(f"    Avg Duration: {copart_perf.get('avgLatencyMs', 0)}ms")
                    self.log(f"    Degraded: {copart_source.get('flags', {}).get('degraded', False)}")
                    
                    # Calculate expected secondary delay based on health-aware logic
                    avg_ms = copart_perf.get('avgLatencyMs', 15000)
                    success_rate = copart_health.get('successRate', 0.5)
                    
                    if success_rate > 0.9 and avg_ms < 12000:
                        expected_delay = int(avg_ms * 0.8)
                        strategy = "Excellent Copart → delay secondary"
                    elif success_rate < 0.5 or copart_source.get('flags', {}).get('degraded', False):
                        expected_delay = 0
                        strategy = "Poor Copart → start secondary immediately"
                    else:
                        expected_delay = max(3000, min(10000, int(avg_ms * 0.6)))
                        strategy = "Normal case"
                    
                    self.log(f"    Expected Secondary Delay: {expected_delay}ms ({strategy})")
                
                if degraded_sources:
                    self.log(f"\n  ⚠️  DEGRADED SOURCES: {', '.join(degraded_sources)}")
                else:
                    self.log(f"\n  ✅ No degraded sources detected")
                    
        return success

    def test_dashboard_status_system_overview(self) -> bool:
        """Test dashboard status with focus on system health overview"""
        self.log("\n=== TESTING DASHBOARD STATUS (System Overview) ===")
        success, response = self.run_test(
            "Dashboard Status - System Overview",
            "GET",
            "vin-unified/dashboard/status",
            200
        )
        
        if success:
            self.log(f"  ✅ Dashboard status retrieved successfully")
            
            overview = response.get('overview', {})
            sources = response.get('sources', {})
            
            self.log(f"  📊 SYSTEM OVERVIEW:")
            self.log(f"    Total Requests: {overview.get('totalRequests', 0)}")
            self.log(f"    Overall Success Rate: {overview.get('overallSuccessRate', 'N/A')}")
            self.log(f"    Overall Block Rate: {overview.get('overallBlockRate', 'N/A')}")
            
            self.log(f"  🏥 SOURCE HEALTH:")
            self.log(f"    Healthy Sources: {len(sources.get('healthy', []))}")
            self.log(f"    Degraded Sources: {len(sources.get('degraded', []))}")
            self.log(f"    Total Sources: {sources.get('total', 0)}")
            
            # Check for health-aware recommendations
            if 'systemStatus' in response:
                system_status = response['systemStatus']
                self.log(f"  🎯 HEALTH-AWARE STATUS:")
                self.log(f"    Primary Healthy: {system_status.get('primaryHealthy', 'unknown')}")
                self.log(f"    Secondary Available: {system_status.get('secondaryAvailable', 'unknown')}")
                self.log(f"    Recommended Strategy: {system_status.get('recommendedStrategy', 'unknown')}")
                
        return success

    def test_health_aware_vin_resolve(self) -> bool:
        """Test VIN resolve with health-aware orchestration (skipCache=true)"""
        self.log("\n=== TESTING HEALTH-AWARE VIN RESOLVE ===")
        self.log(f"  Testing with VIN: {self.test_vin} (skipCache=true)")
        self.log(f"  Expected duration: ~18s (as mentioned by agent)")
        
        start_time = time.time()
        success, response = self.run_test(
            "Health-Aware VIN Resolve",
            "GET",
            f"vin-unified/resolve?vin={self.test_vin}&skipCache=true",
            200,
            timeout=60  # Allow up to 60s for health-aware orchestration
        )
        end_time = time.time()
        
        if success:
            actual_duration = (end_time - start_time) * 1000
            reported_duration = response.get('searchDurationMs', 0)
            
            self.log(f"  ✅ Success: {response.get('success')}")
            self.log(f"  VIN: {response.get('vin')}")
            self.log(f"  Status: {response.get('status')}")
            self.log(f"  Sources Used: {response.get('sourcesUsed', 0)}")
            self.log(f"  Reported Duration: {reported_duration}ms")
            self.log(f"  Actual Duration: {actual_duration:.0f}ms")
            self.log(f"  From Cache: {response.get('fromCache', False)}")
            
            # Check for health-aware orchestration indicators
            metadata = response.get('metadata', [])
            if metadata:
                self.log(f"  🎯 HEALTH-AWARE ORCHESTRATION:")
                self.log(f"    Total Sources Attempted: {len(metadata)}")
                
                # Analyze tier execution
                tier_sources = {}
                for meta in metadata:
                    tier = meta.get('tier', 'unknown')
                    if tier not in tier_sources:
                        tier_sources[tier] = []
                    tier_sources[tier].append({
                        'name': meta.get('name', 'unknown'),
                        'success': meta.get('success', False),
                        'responseTime': meta.get('responseTime', 0),
                        'errorReason': meta.get('errorReason', '')
                    })
                
                for tier, sources in tier_sources.items():
                    self.log(f"    {tier.upper()}:")
                    for source in sources:
                        status = "✅" if source['success'] else "❌"
                        error = f" ({source['errorReason']})" if source['errorReason'] else ""
                        self.log(f"      {status} {source['name']}: {source['responseTime']}ms{error}")
            
            # Check for early return
            if response.get('earlyReturn'):
                self.log(f"  🚀 Early return from: {response.get('winnerSource', 'unknown')}")
            
            # Check if duration is reasonable for health-aware system
            if 15000 <= actual_duration <= 25000:  # ~18s ± 7s tolerance
                self.log(f"  ✅ Duration within expected range for health-aware orchestration")
            else:
                self.log(f"  ⚠️  Duration outside expected ~18s range")
                
        return success

    def test_quick_resolve_performance(self) -> bool:
        """Test quick resolve performance"""
        self.log("\n=== TESTING QUICK RESOLVE PERFORMANCE ===")
        
        success, response = self.run_test(
            "Quick Resolve Performance",
            "GET",
            f"vin-unified/quick?vin={self.test_vin}",
            200
        )
        
        if success:
            duration = response.get('_test_duration_ms', 0)
            self.log(f"  ✅ Success: {response.get('success')}")
            self.log(f"  VIN: {response.get('vin')}")
            self.log(f"  Sources Used: {response.get('sourcesUsed', 0)}")
            self.log(f"  Duration: {duration:.0f}ms")
            
            # Quick resolve should be fast (< 5s)
            if duration < 5000:
                self.log(f"  ✅ Quick resolve performance acceptable")
            else:
                self.log(f"  ⚠️  Quick resolve slower than expected")
                
        return success

    def run_health_aware_tests(self) -> int:
        """Run all health-aware tier factory tests"""
        self.log("🚀 Starting Health-Aware Tier Factory Tests")
        self.log(f"Base URL: {self.base_url}")
        self.log(f"Test VIN: {self.test_vin}")
        
        # Test 1: System Health
        if not self.test_system_health():
            self.log("❌ System health check failed - stopping tests")
            return 1
            
        # Test 2: Admin Login
        if not self.test_admin_login():
            self.log("❌ Admin login failed - stopping tests")
            return 1
        
        # Test 3: Dashboard Sources (Health Metrics)
        self.test_dashboard_sources_health_metrics()
        
        # Test 4: Dashboard Status (System Overview)
        self.test_dashboard_status_system_overview()
        
        # Test 5: Quick Resolve Performance
        self.test_quick_resolve_performance()
        
        # Test 6: Health-Aware VIN Resolve (Main Test)
        self.test_health_aware_vin_resolve()
        
        # Print results
        self.log(f"\n📊 HEALTH-AWARE TIER FACTORY TESTS COMPLETE")
        self.log(f"Tests passed: {self.tests_passed}/{self.tests_run}")
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        self.log(f"Success rate: {success_rate:.1f}%")
        
        if self.tests_passed == self.tests_run:
            self.log("🎉 ALL HEALTH-AWARE TESTS PASSED!")
            return 0
        else:
            self.log("❌ Some health-aware tests failed")
            return 1

def main():
    tester = HealthAwareTierTester()
    return tester.run_health_aware_tests()

if __name__ == "__main__":
    sys.exit(main())