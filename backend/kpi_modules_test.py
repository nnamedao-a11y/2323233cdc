#!/usr/bin/env python3
"""
BIBI Cars CRM - KPI Modules Backend API Tests
Testing KPI, Coaching, Predictive Lead Scoring, Call Flow Management modules
"""

import requests
import sys
import json
from datetime import datetime
from typing import Dict, Any, Optional

class KPIModulesAPITester:
    def __init__(self, base_url="https://competitor-inventory.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'BIBI-CRM-KPI-Test-Client/1.0'
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

    def test_system_health(self) -> bool:
        """Test system health endpoint"""
        self.log("\n=== TESTING SYSTEM HEALTH ===")
        success, response = self.run_test(
            "System Health Check",
            "GET",
            "system/health",
            200
        )
        
        if success:
            self.log(f"  Health Status: {response.get('status', 'unknown')}")
            self.log(f"  Version: {response.get('version', 'unknown')}")
            
        return success

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
            self.log(f"  User role: {response.get('user', {}).get('role', 'unknown')}")
            return True
        elif success:
            self.log(f"  ❌ Login response missing access_token: {response}")
            return False
        return False

    def test_kpi_dashboard(self) -> bool:
        """Test KPI dashboard for owner"""
        self.log("\n=== TESTING KPI DASHBOARD ===")
        success, response = self.run_test(
            "KPI Dashboard (Owner)",
            "GET",
            "admin/kpi/dashboard",
            200
        )
        
        if success:
            self.log(f"  Dashboard data keys: {list(response.keys())}")
            if 'totals' in response:
                totals = response['totals']
                self.log(f"  Total managers: {totals.get('managers', 'unknown')}")
                self.log(f"  Total leads: {totals.get('leads', 'unknown')}")
                self.log(f"  Critical alerts: {totals.get('criticalAlerts', 'unknown')}")
            
        return success

    def test_kpi_me(self) -> bool:
        """Test KPI for current user"""
        self.log("\n=== TESTING KPI ME ===")
        success, response = self.run_test(
            "KPI for Current User",
            "GET",
            "admin/kpi/me",
            200
        )
        
        if success:
            self.log(f"  KPI data keys: {list(response.keys())}")
            if 'summary' in response:
                summary = response['summary']
                self.log(f"  Total leads: {summary.get('totalLeads', 'unknown')}")
                self.log(f"  Conversion rate: {summary.get('conversionRate', 'unknown')}")
            
        return success

    def test_kpi_leaderboard(self) -> bool:
        """Test KPI leaderboard"""
        self.log("\n=== TESTING KPI LEADERBOARD ===")
        success, response = self.run_test(
            "KPI Leaderboard",
            "GET",
            "admin/kpi/leaderboard",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Leaderboard entries: {len(response)}")
                if response:
                    first_entry = response[0]
                    self.log(f"  Top performer: {first_entry.get('name', 'unknown')} - Score: {first_entry.get('score', 'unknown')}")
            else:
                self.log(f"  Leaderboard data: {response}")
            
        return success

    def test_kpi_alerts(self) -> bool:
        """Test KPI alerts"""
        self.log("\n=== TESTING KPI ALERTS ===")
        success, response = self.run_test(
            "KPI Alerts",
            "GET",
            "admin/kpi/alerts",
            200
        )
        
        if success:
            self.log(f"  Alerts data: {response}")
            if 'alerts' in response:
                alerts = response['alerts']
                self.log(f"  Number of alerts: {len(alerts) if isinstance(alerts, list) else 'unknown'}")
            
        return success

    def test_coaching_me(self) -> bool:
        """Test coaching for current user"""
        self.log("\n=== TESTING COACHING ME ===")
        success, response = self.run_test(
            "Coaching for Current User",
            "GET",
            "admin/coaching/me",
            200
        )
        
        if success:
            self.log(f"  Coaching data: {response}")
            if 'coaching' in response:
                coaching = response['coaching']
                self.log(f"  Coaching items: {len(coaching) if isinstance(coaching, list) else 'unknown'}")
            if 'message' in response:
                self.log(f"  Message: {response['message']}")
            
        return success

    def test_predictive_leads_hot(self) -> bool:
        """Test hot leads list"""
        self.log("\n=== TESTING PREDICTIVE LEADS HOT ===")
        success, response = self.run_test(
            "Hot Leads List",
            "GET",
            "admin/predictive-leads/hot",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Hot leads count: {len(response)}")
                if response:
                    first_lead = response[0]
                    self.log(f"  First lead ID: {first_lead.get('id', 'unknown')} - Score: {first_lead.get('score', 'unknown')}")
            else:
                self.log(f"  Hot leads data: {response}")
            
        return success

    def test_predictive_leads_top(self) -> bool:
        """Test top prioritized leads"""
        self.log("\n=== TESTING PREDICTIVE LEADS TOP ===")
        success, response = self.run_test(
            "Top Prioritized Leads",
            "GET",
            "admin/predictive-leads/top",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Top leads count: {len(response)}")
                if response:
                    first_lead = response[0]
                    self.log(f"  First lead ID: {first_lead.get('id', 'unknown')} - Priority: {first_lead.get('priority', 'unknown')}")
            else:
                self.log(f"  Top leads data: {response}")
            
        return success

    def test_call_flow_session(self, lead_id: str = "test-lead-123") -> bool:
        """Test create call session"""
        self.log("\n=== TESTING CALL FLOW SESSION ===")
        success, response = self.run_test(
            f"Create Call Session - {lead_id}",
            "POST",
            f"admin/call-flow/session/{lead_id}",
            201
        )
        
        if success:
            self.log(f"  Session data: {response}")
            if 'sessionId' in response:
                self.log(f"  Session ID: {response['sessionId']}")
            if 'leadId' in response:
                self.log(f"  Lead ID: {response['leadId']}")
            
        return success

    def test_call_flow_board(self) -> bool:
        """Test call board for manager"""
        self.log("\n=== TESTING CALL FLOW BOARD ===")
        success, response = self.run_test(
            "Call Board for Manager",
            "GET",
            "admin/call-flow/board",
            200
        )
        
        if success:
            self.log(f"  Call board data: {response}")
            if 'pipeline' in response:
                pipeline = response['pipeline']
                self.log(f"  Pipeline stages: {len(pipeline) if isinstance(pipeline, list) else 'unknown'}")
            
        return success

    def run_all_tests(self) -> int:
        """Run all KPI modules API tests"""
        self.log("🚀 Starting BIBI Cars CRM KPI Modules Backend Tests")
        self.log(f"Base URL: {self.base_url}")
        
        # Test system health first
        self.test_system_health()
        
        # Test admin login
        login_success = self.test_admin_login()
        
        if not login_success:
            self.log("❌ Login failed, cannot proceed with authenticated tests")
            return 1
        
        # Test KPI endpoints
        self.test_kpi_dashboard()
        self.test_kpi_me()
        self.test_kpi_leaderboard()
        self.test_kpi_alerts()
        
        # Test Coaching endpoints
        self.test_coaching_me()
        
        # Test Predictive Leads endpoints
        self.test_predictive_leads_hot()
        self.test_predictive_leads_top()
        
        # Test Call Flow endpoints
        self.test_call_flow_session()
        self.test_call_flow_board()
        
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
    tester = KPIModulesAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())