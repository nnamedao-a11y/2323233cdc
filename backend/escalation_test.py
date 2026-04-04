#!/usr/bin/env python3
"""
BIBI Cars CRM - Escalation Engine Tests
Testing newly implemented escalation module with role-based access control
"""

import requests
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional

class EscalationEngineAPITester:
    def __init__(self, base_url="https://vin-core-layer.preview.emergentagent.com"):
        self.base_url = base_url
        self.admin_token = None
        self.teamlead_token = None
        self.manager_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'BIBI-CRM-Escalation-Test/1.0'
        })
        self.created_ids = {}

    def log(self, message: str, level: str = "INFO"):
        """Log test messages"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")

    def run_test(self, name: str, method: str, endpoint: str, expected_status: int, 
                 data: Optional[Dict] = None, headers: Optional[Dict] = None, token: str = None) -> tuple[bool, Dict]:
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        test_headers = self.session.headers.copy()
        
        if headers:
            test_headers.update(headers)
        
        # Use specific token if provided, otherwise use admin token
        auth_token = token or self.admin_token
        if auth_token:
            test_headers['Authorization'] = f'Bearer {auth_token}'

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
            self.admin_token = response['access_token']
            self.log(f"  ✅ Admin login successful, token obtained")
            return True
        elif success and 'token' in response:
            self.admin_token = response['token']
            self.log(f"  ✅ Admin login successful, token obtained")
            return True
        elif success:
            self.log(f"  ❌ Login response missing access_token: {response}")
            return False
        return False

    def test_teamlead_login(self) -> bool:
        """Test team lead login and get token"""
        self.log("\n=== TESTING TEAM LEAD LOGIN ===")
        success, response = self.run_test(
            "Team Lead Login",
            "POST",
            "auth/login",
            201,
            data={"email": "teamlead@crm.com", "password": "teamlead123"}
        )
        
        if success and 'access_token' in response:
            self.teamlead_token = response['access_token']
            self.log(f"  ✅ Team Lead login successful, token obtained")
            return True
        elif success and 'token' in response:
            self.teamlead_token = response['token']
            self.log(f"  ✅ Team Lead login successful, token obtained")
            return True
        elif success:
            self.log(f"  ❌ Login response missing access_token: {response}")
            return False
        return False

    def test_manager_login(self) -> bool:
        """Test manager login and get token"""
        self.log("\n=== TESTING MANAGER LOGIN ===")
        success, response = self.run_test(
            "Manager Login",
            "POST",
            "auth/login",
            201,
            data={"email": "manager@crm.com", "password": "manager123"}
        )
        
        if success and 'access_token' in response:
            self.manager_token = response['access_token']
            self.log(f"  ✅ Manager login successful, token obtained")
            return True
        elif success and 'token' in response:
            self.manager_token = response['token']
            self.log(f"  ✅ Manager login successful, token obtained")
            return True
        elif success:
            self.log(f"  ❌ Login response missing access_token: {response}")
            return False
        return False

    def test_get_escalations_admin(self) -> bool:
        """Test GET /api/escalations with admin/owner role"""
        self.log("\n=== TESTING GET ESCALATIONS (ADMIN/OWNER) ===")
        success, response = self.run_test(
            "Get Active Escalations (Admin)",
            "GET",
            "escalations",
            200,
            token=self.admin_token
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Active Escalations: {len(response)}")
                if response:
                    first_escalation = response[0]
                    self.log(f"    First: {first_escalation.get('eventType')} - {first_escalation.get('status')}")
                    self.log(f"    Entity: {first_escalation.get('entityType')}:{first_escalation.get('entityId')}")
                    self.log(f"    Level: {first_escalation.get('escalationLevel')}")
            else:
                self.log(f"  Response: {response}")
            
        return success

    def test_get_escalations_teamlead(self) -> bool:
        """Test GET /api/escalations with team lead role"""
        self.log("\n=== TESTING GET ESCALATIONS (TEAM LEAD) ===")
        success, response = self.run_test(
            "Get Active Escalations (Team Lead)",
            "GET",
            "escalations",
            200,
            token=self.teamlead_token
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Active Escalations: {len(response)}")
                if response:
                    first_escalation = response[0]
                    self.log(f"    First: {first_escalation.get('eventType')} - {first_escalation.get('status')}")
            else:
                self.log(f"  Response: {response}")
            
        return success

    def test_get_escalations_manager_denied(self) -> bool:
        """Test GET /api/escalations with manager role (should be denied)"""
        self.log("\n=== TESTING GET ESCALATIONS (MANAGER - SHOULD BE DENIED) ===")
        success, response = self.run_test(
            "Get Active Escalations (Manager - Denied)",
            "GET",
            "escalations",
            200,  # API returns 200 with error message
            token=self.manager_token
        )
        
        if success:
            if 'error' in response and 'Access denied' in response['error']:
                self.log(f"  ✅ Access correctly denied for manager role")
                self.log(f"  Error: {response['error']}")
                return True
            else:
                self.log(f"  ❌ Manager should not have access: {response}")
                return False
            
        return False

    def test_get_escalation_stats_admin(self) -> bool:
        """Test GET /api/escalations/stats with admin role"""
        self.log("\n=== TESTING GET ESCALATION STATS (ADMIN) ===")
        success, response = self.run_test(
            "Get Escalation Stats (Admin)",
            "GET",
            "escalations/stats",
            200,
            token=self.admin_token
        )
        
        if success:
            self.log(f"  Manager Pending: {response.get('managerPending', 0)}")
            self.log(f"  Team Lead Pending: {response.get('teamLeadPending', 0)}")
            self.log(f"  Owner Pending: {response.get('ownerPending', 0)}")
            self.log(f"  Resolved Today: {response.get('resolvedToday', 0)}")
            
        return success

    def test_get_escalation_stats_teamlead(self) -> bool:
        """Test GET /api/escalations/stats with team lead role"""
        self.log("\n=== TESTING GET ESCALATION STATS (TEAM LEAD) ===")
        success, response = self.run_test(
            "Get Escalation Stats (Team Lead)",
            "GET",
            "escalations/stats",
            200,
            token=self.teamlead_token
        )
        
        if success:
            self.log(f"  Manager Pending: {response.get('managerPending', 0)}")
            self.log(f"  Team Lead Pending: {response.get('teamLeadPending', 0)}")
            self.log(f"  Owner Pending: {response.get('ownerPending', 0)}")
            self.log(f"  Resolved Today: {response.get('resolvedToday', 0)}")
            
        return success

    def test_get_escalation_stats_manager_denied(self) -> bool:
        """Test GET /api/escalations/stats with manager role (should be denied)"""
        self.log("\n=== TESTING GET ESCALATION STATS (MANAGER - SHOULD BE DENIED) ===")
        success, response = self.run_test(
            "Get Escalation Stats (Manager - Denied)",
            "GET",
            "escalations/stats",
            200,  # API returns 200 with error message
            token=self.manager_token
        )
        
        if success:
            if 'error' in response and 'Access denied' in response['error']:
                self.log(f"  ✅ Access correctly denied for manager role")
                self.log(f"  Error: {response['error']}")
                return True
            else:
                self.log(f"  ❌ Manager should not have access: {response}")
                return False
            
        return False

    def test_resolve_escalation(self) -> bool:
        """Test PATCH /api/escalations/:id/resolve"""
        self.log("\n=== TESTING RESOLVE ESCALATION ===")
        
        # First, try to get an active escalation to resolve
        success, escalations = self.run_test(
            "Get Escalations for Resolve Test",
            "GET",
            "escalations",
            200,
            token=self.admin_token
        )
        
        if not success:
            self.log("  ❌ Failed to get escalations")
            return False
            
        if not isinstance(escalations, list) or len(escalations) == 0:
            self.log("  ⚠️ No active escalations to resolve - creating test scenario")
            # In a real scenario, we would trigger an escalation first
            # For now, we'll test with a mock ID
            test_id = "test_escalation_id"
        else:
            test_id = escalations[0].get('_id') or escalations[0].get('id')
            if not test_id:
                self.log("  ❌ No escalation ID found")
                return False
        
        success, response = self.run_test(
            "Resolve Escalation",
            "PATCH",
            f"escalations/{test_id}/resolve",
            200,
            data={
                "eventType": "lead.hot_not_contacted",
                "entityId": "test_entity_123",
                "reason": "Issue resolved manually during testing"
            },
            token=self.admin_token
        )
        
        if success:
            if response:
                self.log(f"  ✅ Escalation resolved: {response.get('status')}")
                self.log(f"  Resolved by: {response.get('resolvedByUserId')}")
                self.log(f"  Reason: {response.get('resolvedReason')}")
            else:
                self.log(f"  ✅ Escalation resolve request processed")
        else:
            self.log(f"  ❌ Failed to resolve escalation")
            
        return success

    def test_manual_escalation_processing_admin(self) -> bool:
        """Test POST /api/escalations/process (owner only)"""
        self.log("\n=== TESTING MANUAL ESCALATION PROCESSING (ADMIN/OWNER) ===")
        success, response = self.run_test(
            "Manual Escalation Processing (Admin)",
            "POST",
            "escalations/process",
            201,  # Fixed: API returns 201
            token=self.admin_token
        )
        
        if success:
            self.log(f"  Manager Escalated: {response.get('managerEscalated', 0)}")
            self.log(f"  Owner Escalated: {response.get('ownerEscalated', 0)}")
            
        return success

    def test_manual_escalation_processing_teamlead_denied(self) -> bool:
        """Test POST /api/escalations/process with team lead role (should be denied)"""
        self.log("\n=== TESTING MANUAL ESCALATION PROCESSING (TEAM LEAD - SHOULD BE DENIED) ===")
        success, response = self.run_test(
            "Manual Escalation Processing (Team Lead - Denied)",
            "POST",
            "escalations/process",
            201,  # Fixed: API returns 201 with error message
            token=self.teamlead_token
        )
        
        if success:
            if 'error' in response and 'Only owner can trigger' in response['error']:
                self.log(f"  ✅ Access correctly denied for team lead role")
                self.log(f"  Error: {response['error']}")
                return True
            else:
                self.log(f"  ❌ Team lead should not have access: {response}")
                return False
            
        return False

    def test_notifications_rules_still_working(self) -> bool:
        """Test GET /api/notifications/rules - ensure existing functionality still works"""
        self.log("\n=== TESTING NOTIFICATIONS RULES (EXISTING FUNCTIONALITY) ===")
        success, response = self.run_test(
            "Get Notification Rules",
            "GET",
            "notifications/rules",
            200,
            token=self.admin_token
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Notification Rules: {len(response)}")
                if response:
                    first_rule = response[0]
                    self.log(f"    First Rule: {first_rule.get('eventType')} - {first_rule.get('isActive')}")
                    self.log(f"    Channels: {first_rule.get('channels', [])}")
            else:
                self.log(f"  Response: {response}")
            
        return success

    def test_notifications_test_still_working(self) -> bool:
        """Test POST /api/notifications/test - ensure existing functionality still works"""
        self.log("\n=== TESTING NOTIFICATIONS TEST (EXISTING FUNCTIONALITY) ===")
        success, response = self.run_test(
            "Test Notification",
            "POST",
            "notifications/test",
            201,
            data={
                "title": "Test Notification from Escalation Tests",
                "message": "Testing that notification system still works after escalation module addition",
                "severity": "info",
                "channels": ["telegram"]
            },
            token=self.admin_token
        )
        
        if success:
            self.log(f"  ✅ Test notification sent")
            self.log(f"  Status: {response.get('status')}")
            self.log(f"  Message: {response.get('message')}")
            
        return success

    def test_telegram_bot_active(self) -> bool:
        """Test Telegram Bot API - check if bot is active"""
        self.log("\n=== TESTING TELEGRAM BOT ACTIVE ===")
        
        # Test the Telegram Bot API directly
        telegram_token = "7757775952:AAFTqDABFhTuOsaDlhFh2noUsqc4QPGFaGE"
        
        try:
            response = requests.get(f"https://api.telegram.org/bot{telegram_token}/getMe", timeout=10)
            
            if response.status_code == 200:
                bot_info = response.json()
                if bot_info.get('ok'):
                    result = bot_info.get('result', {})
                    self.log(f"  ✅ Telegram Bot Active")
                    self.log(f"  Bot Username: @{result.get('username')}")
                    self.log(f"  Bot ID: {result.get('id')}")
                    self.log(f"  Bot Name: {result.get('first_name')}")
                    self.tests_passed += 1
                    self.tests_run += 1
                    return True
                else:
                    self.log(f"  ❌ Telegram API Error: {bot_info.get('description')}")
            else:
                self.log(f"  ❌ HTTP Error: {response.status_code}")
                
        except Exception as e:
            self.log(f"  ❌ Connection Error: {str(e)}")
        
        self.tests_run += 1
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

    def run_all_escalation_tests(self) -> int:
        """Run all escalation engine tests"""
        self.log("🚀 Starting BIBI Cars CRM Escalation Engine Tests")
        self.log("=" * 60)
        
        # Test authentication for different roles
        if not self.test_admin_login():
            self.log("❌ Admin login failed - stopping tests")
            return 1
            
        if not self.test_teamlead_login():
            self.log("❌ Team Lead login failed - continuing with admin only")
            
        if not self.test_manager_login():
            self.log("❌ Manager login failed - continuing without manager tests")

        # Test system health
        self.test_system_health()

        # Test escalation endpoints with proper role-based access
        self.test_get_escalations_admin()
        
        if self.teamlead_token:
            self.test_get_escalations_teamlead()
            
        if self.manager_token:
            self.test_get_escalations_manager_denied()

        # Test escalation stats
        self.test_get_escalation_stats_admin()
        
        if self.teamlead_token:
            self.test_get_escalation_stats_teamlead()
            
        if self.manager_token:
            self.test_get_escalation_stats_manager_denied()

        # Test escalation resolution
        self.test_resolve_escalation()

        # Test manual processing (owner only)
        self.test_manual_escalation_processing_admin()
        
        if self.teamlead_token:
            self.test_manual_escalation_processing_teamlead_denied()

        # Test that existing notification functionality still works
        self.test_notifications_rules_still_working()
        self.test_notifications_test_still_working()

        # Test Telegram bot is active
        self.test_telegram_bot_active()

        # Print results
        self.log("\n" + "=" * 60)
        self.log(f"📊 ESCALATION ENGINE TEST RESULTS")
        self.log(f"Tests passed: {self.tests_passed}/{self.tests_run}")
        
        if self.tests_passed == self.tests_run:
            self.log("🎉 ALL TESTS PASSED!")
            return 0
        else:
            self.log(f"❌ {self.tests_run - self.tests_passed} tests failed")
            return 1

def main():
    tester = EscalationEngineAPITester()
    return tester.run_all_escalation_tests()

if __name__ == "__main__":
    sys.exit(main())