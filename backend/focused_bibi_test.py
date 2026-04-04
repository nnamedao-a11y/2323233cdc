#!/usr/bin/env python3
"""
BIBI Cars CRM - Focused Backend API Tests
Testing specific features mentioned in review request:
1. /api/shipments/stalled - returns stalled shipments (requires auth)
2. /api/alerts/critical - returns critical alerts
3. /api/system/health - backend health check
4. Admin login and dashboard access
5. Integration health checks for CarVertical and Carfax
"""

import requests
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional

class BIBIFocusedTester:
    def __init__(self, base_url="https://vin-core-layer.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'BIBI-CRM-Focused-Test/1.0'
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
        """Test admin login with credentials from review request"""
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
        """Test /api/system/health endpoint"""
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
            self.log(f"  Uptime: {response.get('uptime', 'unknown')}")
            
        return success

    def test_stalled_shipments(self) -> bool:
        """Test /api/shipments/stalled endpoint (requires auth)"""
        self.log("\n=== TESTING STALLED SHIPMENTS ===")
        success, response = self.run_test(
            "Get Stalled Shipments",
            "GET",
            "shipments/stalled",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Stalled Shipments: {len(response)}")
                if response:
                    first_shipment = response[0]
                    self.log(f"    First Stalled: VIN {first_shipment.get('vin')} - {first_shipment.get('status')}")
                    self.log(f"    Last Update: {first_shipment.get('lastUpdateAt')}")
                    self.log(f"    Days Stalled: {first_shipment.get('daysStalled')}")
                else:
                    self.log(f"  No stalled shipments found (this is good)")
            else:
                self.log(f"  Unexpected response format: {type(response)}")
            
        return success

    def test_critical_alerts(self) -> bool:
        """Test /api/alerts/critical endpoint"""
        self.log("\n=== TESTING CRITICAL ALERTS ===")
        success, response = self.run_test(
            "Get Critical Alerts",
            "GET",
            "alerts/critical",
            200
        )
        
        if success:
            alerts = response.get('alerts', [])
            count = response.get('count', 0)
            self.log(f"  Critical Alerts: {count}")
            
            if alerts:
                for i, alert in enumerate(alerts[:3]):  # Show first 3
                    self.log(f"    Alert {i+1}: {alert.get('title')}")
                    self.log(f"      Type: {alert.get('type')}")
                    self.log(f"      Priority: {alert.get('priority')}")
                    self.log(f"      Time: {alert.get('time')}")
                    if alert.get('manager'):
                        self.log(f"      Manager: {alert.get('manager', {}).get('name')}")
            else:
                self.log(f"  No critical alerts found")
            
        return success

    def test_integrations_health(self) -> bool:
        """Test integrations health including CarVertical and Carfax"""
        self.log("\n=== TESTING INTEGRATIONS HEALTH ===")
        success, response = self.run_test(
            "Integrations Health Check",
            "GET",
            "admin/integrations/health",
            200
        )
        
        if success:
            self.log(f"  Health Summary: {len(response)} providers")
            
            # Check for CarVertical and Carfax specifically
            car_vertical = response.get('car_vertical', {})
            carfax = response.get('carfax', {})
            
            if car_vertical:
                self.log(f"  CarVertical: {car_vertical.get('status')} (enabled: {car_vertical.get('isEnabled')})")
                if car_vertical.get('error'):
                    self.log(f"    Error: {car_vertical.get('error')}")
            else:
                self.log(f"  ❌ CarVertical provider not found")
                
            if carfax:
                self.log(f"  Carfax: {carfax.get('status')} (enabled: {carfax.get('isEnabled')})")
                if carfax.get('error'):
                    self.log(f"    Error: {carfax.get('error')}")
            else:
                self.log(f"  ❌ Carfax provider not found")
            
            # Show other providers
            for provider, status in response.items():
                if provider not in ['car_vertical', 'carfax']:
                    self.log(f"  {provider}: {status.get('status')} (enabled: {status.get('isEnabled')})")
            
        return success

    def test_list_integrations(self) -> bool:
        """Test /api/admin/integrations - verify CarVertical and Carfax are present"""
        self.log("\n=== TESTING LIST INTEGRATIONS ===")
        success, response = self.run_test(
            "List All Integrations",
            "GET",
            "admin/integrations",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Total Integrations: {len(response)}")
                found_providers = []
                car_vertical_found = False
                carfax_found = False
                
                for integration in response:
                    provider = integration.get('provider')
                    enabled = integration.get('isEnabled')
                    mode = integration.get('mode')
                    found_providers.append(provider)
                    
                    if provider == 'car_vertical':
                        car_vertical_found = True
                        self.log(f"  ✅ CarVertical: {mode} (enabled: {enabled})")
                    elif provider == 'carfax':
                        carfax_found = True
                        self.log(f"  ✅ Carfax: {mode} (enabled: {enabled})")
                    else:
                        self.log(f"    {provider}: {mode} (enabled: {enabled})")
                
                if not car_vertical_found:
                    self.log(f"  ❌ CarVertical provider not found in integrations list")
                    return False
                    
                if not carfax_found:
                    self.log(f"  ❌ Carfax provider not found in integrations list")
                    return False
                    
                self.log(f"  ✅ Both CarVertical and Carfax providers found")
                
            else:
                self.log(f"  Unexpected response format: {type(response)}")
                return False
            
        return success

    def test_viber_integration(self) -> bool:
        """Test Viber integration (mentioned as implemented)"""
        self.log("\n=== TESTING VIBER INTEGRATION ===")
        success, response = self.run_test(
            "Test Viber Integration",
            "POST",
            "admin/integrations/viber/test",
            201
        )
        
        if success:
            self.log(f"  Success: {response.get('success')}")
            self.log(f"  Message: {response.get('message')}")
            if response.get('latencyMs'):
                self.log(f"  Latency: {response.get('latencyMs')}ms")
            
        return success

    def test_twilio_sms_integration(self) -> bool:
        """Test Twilio SMS integration (mentioned as implemented)"""
        self.log("\n=== TESTING TWILIO SMS INTEGRATION ===")
        success, response = self.run_test(
            "Test Twilio SMS Integration",
            "POST",
            "admin/integrations/twilio/test",
            201
        )
        
        if success:
            self.log(f"  Success: {response.get('success')}")
            self.log(f"  Message: {response.get('message')}")
            if response.get('latencyMs'):
                self.log(f"  Latency: {response.get('latencyMs')}ms")
            
        return success

    def test_owner_dashboard_stats(self) -> bool:
        """Test Owner Dashboard with staff count, session tracking, integration health"""
        self.log("\n=== TESTING OWNER DASHBOARD STATS ===")
        success, response = self.run_test(
            "Owner Dashboard Stats",
            "GET",
            "owner-dashboard/stats",
            200
        )
        
        if success:
            staff = response.get('staff', {})
            sessions = response.get('sessions', {})
            integrations = response.get('integrations', {})
            
            self.log(f"  Staff Count: {staff.get('total', 0)}")
            self.log(f"  Active Staff: {staff.get('active', 0)}")
            self.log(f"  Online Staff: {staff.get('online', 0)}")
            
            self.log(f"  Total Sessions: {sessions.get('total', 0)}")
            self.log(f"  Active Sessions: {sessions.get('active', 0)}")
            self.log(f"  Suspicious Sessions: {sessions.get('suspicious', 0)}")
            
            self.log(f"  Integration Health: {integrations.get('healthy', 0)}/{integrations.get('total', 0)}")
            self.log(f"  Failed Integrations: {integrations.get('failed', 0)}")
            
        return success

    def run_focused_tests(self) -> int:
        """Run focused tests for BIBI Cars CRM review request"""
        self.log("🚀 Starting BIBI Cars CRM Focused Tests")
        self.log(f"Base URL: {self.base_url}")
        
        # Test 1: Admin Login
        if not self.test_admin_login():
            self.log("❌ Admin login failed, stopping tests")
            return 1

        # Test 2: System Health
        self.test_system_health()

        # Test 3: Stalled Shipments (requires auth)
        self.test_stalled_shipments()

        # Test 4: Critical Alerts
        self.test_critical_alerts()

        # Test 5: Integrations Health (CarVertical and Carfax)
        self.test_integrations_health()

        # Test 6: List Integrations (verify CarVertical and Carfax)
        self.test_list_integrations()

        # Test 7: Viber Integration
        self.test_viber_integration()

        # Test 8: Twilio SMS Integration
        self.test_twilio_sms_integration()

        # Test 9: Owner Dashboard Stats
        self.test_owner_dashboard_stats()

        # Print results
        self.log(f"\n📊 FOCUSED TESTS COMPLETE")
        self.log(f"Tests passed: {self.tests_passed}/{self.tests_run}")
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        self.log(f"Success rate: {success_rate:.1f}%")
        
        if success_rate >= 80:
            self.log("✅ BIBI Cars CRM core features working well")
            return 0
        else:
            self.log("❌ Some critical features need attention")
            return 1

if __name__ == "__main__":
    tester = BIBIFocusedTester()
    sys.exit(tester.run_focused_tests())