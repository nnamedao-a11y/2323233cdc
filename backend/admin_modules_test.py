#!/usr/bin/env python3
"""
BIBI Cars CRM - New Admin Modules Backend API Tests
Testing KPI Dashboard, History Reports Admin, Staff Sessions Board, Security Settings, Call Board, Predictive Leads
"""

import requests
import sys
import json
from datetime import datetime
from typing import Dict, Any, Optional

class AdminModulesAPITester:
    def __init__(self, base_url="https://competitor-inventory.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'BIBI-CRM-Admin-Test-Client/1.0'
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
            self.token = response['access_token']
            self.log(f"  ✅ Login successful, token obtained")
            return True
        elif success:
            self.log(f"  ❌ Login response missing access_token: {response}")
            return False
        return False

    def test_kpi_dashboard(self) -> bool:
        """Test KPI Dashboard API"""
        self.log("\n=== TESTING KPI DASHBOARD ===")
        success, response = self.run_test(
            "KPI Dashboard",
            "GET",
            "admin/kpi/dashboard",
            200
        )
        
        if success:
            self.log(f"  Conversion Rate: {response.get('conversionRate', 'unknown')}")
            self.log(f"  Calls Today: {response.get('callsToday', 'unknown')}")
            self.log(f"  HOT Leads: {response.get('hotLeads', 'unknown')}")
            self.log(f"  Revenue: ${response.get('revenue', 'unknown')}")
            
        return success

    def test_kpi_leaderboard(self) -> bool:
        """Test KPI Leaderboard API"""
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
                    self.log(f"  Top manager: {first_entry.get('managerId', 'unknown')}")
                    self.log(f"  Score: {first_entry.get('score', 'unknown')}")
            
        return success

    def test_kpi_alerts(self) -> bool:
        """Test KPI Alerts API"""
        self.log("\n=== TESTING KPI ALERTS ===")
        success, response = self.run_test(
            "KPI Alerts",
            "GET",
            "admin/kpi/alerts",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Active alerts: {len(response)}")
                if response:
                    first_alert = response[0]
                    self.log(f"  Alert type: {first_alert.get('type', 'unknown')}")
                    self.log(f"  Severity: {first_alert.get('severity', 'unknown')}")
            
        return success

    def test_history_reports_analytics(self) -> bool:
        """Test History Reports Analytics API"""
        self.log("\n=== TESTING HISTORY REPORTS ANALYTICS ===")
        success, response = self.run_test(
            "History Reports Analytics",
            "GET",
            "admin/history-reports/analytics",
            200
        )
        
        if success:
            self.log(f"  Total Reports: {response.get('totalReports', 'unknown')}")
            self.log(f"  Cached Reports: {response.get('cachedReports', 'unknown')}")
            self.log(f"  Total Cost: ${response.get('totalCost', 'unknown')}")
            self.log(f"  Approval Rate: {response.get('approvalRate', 'unknown')}")
            
        return success

    def test_staff_sessions_active(self) -> bool:
        """Test Staff Sessions Active API"""
        self.log("\n=== TESTING STAFF SESSIONS ACTIVE ===")
        success, response = self.run_test(
            "Staff Sessions Active",
            "GET",
            "admin/staff-sessions/active",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Active sessions: {len(response)}")
                if response:
                    first_session = response[0]
                    self.log(f"  User: {first_session.get('email', 'unknown')}")
                    self.log(f"  Status: {first_session.get('status', 'unknown')}")
            
        return success

    def test_staff_sessions_suspicious(self) -> bool:
        """Test Staff Sessions Suspicious API"""
        self.log("\n=== TESTING STAFF SESSIONS SUSPICIOUS ===")
        success, response = self.run_test(
            "Staff Sessions Suspicious",
            "GET",
            "admin/staff-sessions/suspicious",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Suspicious sessions: {len(response)}")
                if response:
                    first_session = response[0]
                    self.log(f"  User: {first_session.get('email', 'unknown')}")
                    self.log(f"  Reason: {first_session.get('suspiciousReason', 'unknown')}")
            
        return success

    def test_security_2fa_status(self) -> bool:
        """Test Security 2FA Status API"""
        self.log("\n=== TESTING SECURITY 2FA STATUS ===")
        success, response = self.run_test(
            "Security 2FA Status",
            "GET",
            "admin/security/2fa/status",
            200
        )
        
        if success:
            self.log(f"  2FA Enabled: {response.get('enabled', 'unknown')}")
            
        return success

    def test_call_board(self) -> bool:
        """Test Call Board API"""
        self.log("\n=== TESTING CALL BOARD ===")
        success, response = self.run_test(
            "Call Board",
            "GET",
            "admin/call-flow/board",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Call sessions: {len(response)}")
                if response:
                    first_session = response[0]
                    self.log(f"  Customer: {first_session.get('customerName', 'unknown')}")
                    self.log(f"  Status: {first_session.get('status', 'unknown')}")
            
        return success

    def test_call_flow_stats(self) -> bool:
        """Test Call Flow Stats API"""
        self.log("\n=== TESTING CALL FLOW STATS ===")
        success, response = self.run_test(
            "Call Flow Stats",
            "GET",
            "admin/call-flow/stats",
            200
        )
        
        if success:
            self.log(f"  Active Sessions: {response.get('activeSessions', 'unknown')}")
            self.log(f"  Pending Calls: {response.get('pendingCalls', 'unknown')}")
            self.log(f"  HOT Leads: {response.get('hotLeads', 'unknown')}")
            self.log(f"  Deals Today: {response.get('dealsToday', 'unknown')}")
            
        return success

    def test_predictive_leads_hot(self) -> bool:
        """Test Predictive Leads HOT Bucket API"""
        self.log("\n=== TESTING PREDICTIVE LEADS HOT ===")
        success, response = self.run_test(
            "Predictive Leads HOT",
            "GET",
            "admin/predictive-leads/bucket/hot",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  HOT leads: {len(response)}")
                if response:
                    first_lead = response[0]
                    self.log(f"  Lead ID: {first_lead.get('id', 'unknown')}")
                    self.log(f"  Total Score: {first_lead.get('totalScore', 'unknown')}")
            
        return success

    def test_predictive_leads_warm(self) -> bool:
        """Test Predictive Leads WARM Bucket API"""
        self.log("\n=== TESTING PREDICTIVE LEADS WARM ===")
        success, response = self.run_test(
            "Predictive Leads WARM",
            "GET",
            "admin/predictive-leads/bucket/warm",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  WARM leads: {len(response)}")
            
        return success

    def test_predictive_leads_cold(self) -> bool:
        """Test Predictive Leads COLD Bucket API"""
        self.log("\n=== TESTING PREDICTIVE LEADS COLD ===")
        success, response = self.run_test(
            "Predictive Leads COLD",
            "GET",
            "admin/predictive-leads/bucket/cold",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  COLD leads: {len(response)}")
            
        return success

    def run_all_tests(self) -> int:
        """Run all admin modules API tests"""
        self.log("🚀 Starting BIBI Cars CRM Admin Modules Backend Tests")
        self.log(f"Base URL: {self.base_url}")
        
        # Test admin login first
        login_success = self.test_admin_login()
        
        if not login_success:
            self.log("❌ Admin login failed, cannot proceed with authenticated tests")
            return 1
        
        # Test all admin modules
        self.test_kpi_dashboard()
        self.test_kpi_leaderboard()
        self.test_kpi_alerts()
        self.test_history_reports_analytics()
        self.test_staff_sessions_active()
        self.test_staff_sessions_suspicious()
        self.test_security_2fa_status()
        self.test_call_board()
        self.test_call_flow_stats()
        self.test_predictive_leads_hot()
        self.test_predictive_leads_warm()
        self.test_predictive_leads_cold()
        
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
    tester = AdminModulesAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())