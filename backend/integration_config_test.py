#!/usr/bin/env python3
"""
BIBI Cars CRM - Integration Config Module Tests
Testing production hardening features:
- IntegrationConfig module for managing all API keys from admin panel
- SystemError module for centralized error handling
- Admin Integrations UI endpoints
"""

import requests
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional

class IntegrationConfigTester:
    def __init__(self, base_url="https://competitor-inventory.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'BIBI-CRM-Integration-Test/1.0'
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

    def test_system_health(self) -> bool:
        """Test public system health endpoint"""
        self.log("\n=== TESTING SYSTEM HEALTH ===")
        success, response = self.run_test(
            "System Health Check",
            "GET",
            "system/health",
            200
        )
        
        if success:
            self.log(f"  Status: {response.get('status', 'unknown')}")
            self.log(f"  Version: {response.get('version', 'unknown')}")
            self.log(f"  Timestamp: {response.get('timestamp', 'unknown')}")
            
            # Check integrations status
            integrations = response.get('integrations', {})
            if integrations:
                self.log(f"  Integrations found: {len(integrations)}")
                for provider, status in integrations.items():
                    self.log(f"    - {provider}: {status}")
            
        return success

    def test_get_all_integrations(self) -> bool:
        """Test GET /api/admin/integrations - returns all integration configs"""
        self.log("\n=== TESTING GET ALL INTEGRATIONS ===")
        success, response = self.run_test(
            "Get All Integration Configs",
            "GET",
            "admin/integrations",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Integration configs found: {len(response)}")
                for config in response:
                    provider = config.get('provider', 'unknown')
                    enabled = config.get('isEnabled', False)
                    mode = config.get('mode', 'unknown')
                    self.log(f"    - {provider}: enabled={enabled}, mode={mode}")
            else:
                self.log(f"  Unexpected response format: {type(response)}")
            
        return success

    def test_get_integrations_health(self) -> bool:
        """Test GET /api/admin/integrations/health - returns health status for all integrations"""
        self.log("\n=== TESTING GET INTEGRATIONS HEALTH ===")
        success, response = self.run_test(
            "Get Integrations Health Status",
            "GET",
            "admin/integrations/health",
            200
        )
        
        if success:
            if isinstance(response, dict):
                self.log(f"  Health status for {len(response)} integrations:")
                for provider, health_data in response.items():
                    status = health_data.get('status', 'unknown')
                    enabled = health_data.get('isEnabled', False)
                    last_check = health_data.get('lastCheck', 'never')
                    self.log(f"    - {provider}: status={status}, enabled={enabled}, last_check={last_check}")
                    
                    if health_data.get('error'):
                        self.log(f"      Error: {health_data['error']}")
            else:
                self.log(f"  Unexpected response format: {type(response)}")
            
        return success

    def test_connection_stripe(self) -> bool:
        """Test POST /api/admin/integrations/stripe/test - test Stripe connection"""
        self.log("\n=== TESTING STRIPE CONNECTION TEST ===")
        success, response = self.run_test(
            "Test Stripe Connection",
            "POST",
            "admin/integrations/stripe/test",
            201
        )
        
        if success:
            test_success = response.get('success', False)
            message = response.get('message', 'No message')
            latency = response.get('latencyMs', 0)
            
            self.log(f"  Test Success: {test_success}")
            self.log(f"  Message: {message}")
            self.log(f"  Latency: {latency}ms")
            
            if response.get('details'):
                self.log(f"  Details: {response['details']}")
            
        return success

    def test_connection_telegram(self) -> bool:
        """Test POST /api/admin/integrations/telegram/test - test Telegram connection"""
        self.log("\n=== TESTING TELEGRAM CONNECTION TEST ===")
        success, response = self.run_test(
            "Test Telegram Connection",
            "POST",
            "admin/integrations/telegram/test",
            201
        )
        
        if success:
            test_success = response.get('success', False)
            message = response.get('message', 'No message')
            latency = response.get('latencyMs', 0)
            
            self.log(f"  Test Success: {test_success}")
            self.log(f"  Message: {message}")
            self.log(f"  Latency: {latency}ms")
            
        return success

    def test_update_integration_config(self) -> bool:
        """Test PATCH /api/admin/integrations/:provider - update config"""
        self.log("\n=== TESTING UPDATE INTEGRATION CONFIG ===")
        
        # Test updating Telegram config
        success, response = self.run_test(
            "Update Telegram Config",
            "PATCH",
            "admin/integrations/telegram",
            200,
            data={
                "settings": {
                    "testSetting": "test_value_" + str(int(time.time()))
                },
                "mode": "sandbox"
            }
        )
        
        if success:
            provider = response.get('provider', 'unknown')
            mode = response.get('mode', 'unknown')
            updated_by = response.get('updatedBy', 'unknown')
            
            self.log(f"  Provider: {provider}")
            self.log(f"  Mode: {mode}")
            self.log(f"  Updated By: {updated_by}")
            
            if response.get('settings'):
                self.log(f"  Settings updated: {response['settings']}")
            
        return success

    def test_toggle_integration(self) -> bool:
        """Test POST /api/admin/integrations/:provider/toggle - enable/disable"""
        self.log("\n=== TESTING TOGGLE INTEGRATION ===")
        
        # Test toggling Viber integration
        success, response = self.run_test(
            "Toggle Viber Integration",
            "POST",
            "admin/integrations/viber/toggle",
            201,
            data={
                "isEnabled": True
            }
        )
        
        if success:
            provider = response.get('provider', 'unknown')
            enabled = response.get('isEnabled', False)
            updated_by = response.get('updatedBy', 'unknown')
            
            self.log(f"  Provider: {provider}")
            self.log(f"  Enabled: {enabled}")
            self.log(f"  Updated By: {updated_by}")
            
        return success

    def test_shipping_integration(self) -> bool:
        """Test shipping tracker integration"""
        self.log("\n=== TESTING SHIPPING INTEGRATION ===")
        success, response = self.run_test(
            "Test Shipping Connection",
            "POST",
            "admin/integrations/shipping/test",
            201
        )
        
        if success:
            test_success = response.get('success', False)
            message = response.get('message', 'No message')
            
            self.log(f"  Test Success: {test_success}")
            self.log(f"  Message: {message}")
            
        return success

    def test_openai_integration(self) -> bool:
        """Test OpenAI integration"""
        self.log("\n=== TESTING OPENAI INTEGRATION ===")
        success, response = self.run_test(
            "Test OpenAI Connection",
            "POST",
            "admin/integrations/openai/test",
            201
        )
        
        if success:
            test_success = response.get('success', False)
            message = response.get('message', 'No message')
            
            self.log(f"  Test Success: {test_success}")
            self.log(f"  Message: {message}")
            
        return success

    def run_all_tests(self) -> int:
        """Run all integration config tests"""
        self.log("🚀 Starting BIBI Cars CRM Integration Config Tests")
        self.log(f"Base URL: {self.base_url}")
        
        # Test public system health first
        self.test_system_health()
        
        # Test admin login
        login_success = self.test_admin_login()
        
        if not login_success:
            self.log("❌ Admin login failed - cannot proceed with authenticated tests")
            return 1
        
        # Test integration config endpoints
        self.test_get_all_integrations()
        self.test_get_integrations_health()
        
        # Test connection testing for various providers
        self.test_connection_stripe()
        self.test_connection_telegram()
        self.test_shipping_integration()
        self.test_openai_integration()
        
        # Test config management
        self.test_update_integration_config()
        self.test_toggle_integration()
        
        # Print final results
        self.log(f"\n📊 FINAL RESULTS")
        self.log(f"Tests run: {self.tests_run}")
        self.log(f"Tests passed: {self.tests_passed}")
        self.log(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.tests_passed == self.tests_run:
            self.log("🎉 ALL TESTS PASSED!")
            return 0
        else:
            self.log(f"❌ {self.tests_run - self.tests_passed} tests failed")
            return 1

def main():
    """Main test runner"""
    tester = IntegrationConfigTester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())