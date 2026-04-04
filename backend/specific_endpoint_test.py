#!/usr/bin/env python3
"""
Specific Endpoint Tests for Health-Aware Tier Factory
Testing the exact endpoints mentioned in the review request
"""

import requests
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any

class SpecificEndpointTester:
    def __init__(self, base_url="https://vin-core-layer.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'BIBI-CRM-Specific-Endpoint-Test/1.0'
        })

    def log(self, message: str, level: str = "INFO"):
        """Log test messages"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")

    def run_test(self, name: str, endpoint: str, timeout: int = 30) -> tuple[bool, Dict]:
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
            response = self.session.get(url, headers=test_headers, timeout=timeout)
            duration = (time.time() - start_time) * 1000

            success = response.status_code == 200
            
            if success:
                self.tests_passed += 1
                self.log(f"  ✅ PASSED - Status: {response.status_code} ({duration:.0f}ms)")
            else:
                self.log(f"  ❌ FAILED - Status: {response.status_code}")
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
        self.log("\n=== ADMIN LOGIN ===")
        url = f"{self.base_url}/api/auth/login"
        
        try:
            response = self.session.post(url, json={"email": "admin@crm.com", "password": "admin123"}, timeout=30)
            if response.status_code == 201:
                data = response.json()
                if 'access_token' in data:
                    self.token = data['access_token']
                    self.log(f"  ✅ Login successful")
                    return True
                elif 'token' in data:
                    self.token = data['token']
                    self.log(f"  ✅ Login successful")
                    return True
            self.log(f"  ❌ Login failed - Status: {response.status_code}")
            return False
        except Exception as e:
            self.log(f"  ❌ Login failed - Error: {str(e)}")
            return False

    def test_specific_endpoints(self) -> int:
        """Test the specific endpoints mentioned in the review request"""
        self.log("🚀 Testing Specific Health-Aware Tier Factory Endpoints")
        self.log(f"Base URL: {self.base_url}")
        
        # Login first
        if not self.test_admin_login():
            self.log("❌ Admin login failed - stopping tests")
            return 1
        
        # Test the specific endpoints from the review request
        endpoints = [
            {
                "name": "VIN resolve with health-aware orchestration",
                "endpoint": "vin-unified/resolve?vin=5YJSA1DN2CFP09123&skipCache=true",
                "timeout": 60
            },
            {
                "name": "Dashboard sources",
                "endpoint": "vin-unified/dashboard/sources",
                "timeout": 30
            },
            {
                "name": "Dashboard status", 
                "endpoint": "vin-unified/dashboard/status",
                "timeout": 30
            },
            {
                "name": "Quick resolve",
                "endpoint": "vin-unified/quick?vin=5YJSA1DN2CFP09123",
                "timeout": 30
            },
            {
                "name": "System health",
                "endpoint": "system/health",
                "timeout": 30
            }
        ]
        
        self.log(f"\n📋 Testing {len(endpoints)} specific endpoints:")
        
        for endpoint_config in endpoints:
            self.log(f"\n--- {endpoint_config['name'].upper()} ---")
            success, response = self.run_test(
                endpoint_config['name'],
                endpoint_config['endpoint'],
                endpoint_config['timeout']
            )
            
            if success:
                # Log key response details
                if 'vin-unified/resolve' in endpoint_config['endpoint']:
                    self.log(f"    VIN: {response.get('vin', 'N/A')}")
                    self.log(f"    Status: {response.get('status', 'N/A')}")
                    self.log(f"    Success: {response.get('success', 'N/A')}")
                    self.log(f"    Duration: {response.get('searchDurationMs', 0)}ms")
                    self.log(f"    From Cache: {response.get('fromCache', 'N/A')}")
                    self.log(f"    Sources Used: {response.get('sourcesUsed', 0)}")
                    
                elif 'dashboard/sources' in endpoint_config['endpoint']:
                    if isinstance(response, list):
                        self.log(f"    Sources count: {len(response)}")
                        healthy_count = sum(1 for s in response if not s.get('flags', {}).get('degraded', False))
                        self.log(f"    Healthy sources: {healthy_count}")
                        self.log(f"    Degraded sources: {len(response) - healthy_count}")
                    
                elif 'dashboard/status' in endpoint_config['endpoint']:
                    overview = response.get('overview', {})
                    sources = response.get('sources', {})
                    self.log(f"    Total requests: {overview.get('totalRequests', 0)}")
                    self.log(f"    Success rate: {overview.get('overallSuccessRate', 'N/A')}")
                    self.log(f"    Healthy sources: {len(sources.get('healthy', []))}")
                    self.log(f"    Total sources: {sources.get('total', 0)}")
                    
                elif 'quick' in endpoint_config['endpoint']:
                    self.log(f"    VIN: {response.get('vin', 'N/A')}")
                    self.log(f"    Status: {response.get('status', 'N/A')}")
                    self.log(f"    Duration: {response.get('_test_duration_ms', 0):.0f}ms")
                    
                elif 'system/health' in endpoint_config['endpoint']:
                    self.log(f"    Status: {response.get('status', 'N/A')}")
                    self.log(f"    Version: {response.get('version', 'N/A')}")
                    self.log(f"    Database: {response.get('database', 'N/A')}")
        
        # Print final results
        self.log(f"\n📊 SPECIFIC ENDPOINT TESTS COMPLETE")
        self.log(f"Tests passed: {self.tests_passed}/{self.tests_run}")
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        self.log(f"Success rate: {success_rate:.1f}%")
        
        if self.tests_passed == self.tests_run:
            self.log("🎉 ALL SPECIFIC ENDPOINT TESTS PASSED!")
            return 0
        else:
            self.log("❌ Some specific endpoint tests failed")
            return 1

def main():
    tester = SpecificEndpointTester()
    return tester.test_specific_endpoints()

if __name__ == "__main__":
    sys.exit(main())