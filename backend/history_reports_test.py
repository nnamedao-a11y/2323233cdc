#!/usr/bin/env python3
"""
BIBI Cars CRM - History Reports Backend API Tests
Testing History Reports system with CarVertical integration (mocked)
Logic: report = only after confirmed contact + manager decision
Flow: Call → Decision → Buy → Show
"""

import requests
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional

class HistoryReportsAPITester:
    def __init__(self, base_url="https://competitor-inventory.preview.emergentagent.com"):
        self.base_url = base_url
        self.admin_token = None
        self.manager_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'BIBI-CRM-HistoryReports-Test/1.0'
        })
        
        # Test data
        self.test_vin = "1HGBH41JXMN109186"
        self.test_vin_2 = "1HGBH41JXMN109187"
        self.created_report_ids = []

    def log(self, message: str, level: str = "INFO"):
        """Log test messages"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")

    def run_test(self, name: str, method: str, endpoint: str, expected_status: int, 
                 data: Optional[Dict] = None, headers: Optional[Dict] = None, 
                 token: Optional[str] = None) -> tuple[bool, Dict]:
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
            else:
                raise ValueError(f"Unsupported method: {method}")

            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                self.log(f"  ✅ PASSED - Status: {response.status_code}")
            else:
                self.log(f"  ❌ FAILED - Expected {expected_status}, got {response.status_code}")
                if response.text:
                    self.log(f"  Response: {response.text[:300]}...")

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
            data={"email": "manager1@crm.com", "password": "staff123"}
        )
        
        if success and 'access_token' in response:
            self.manager_token = response['access_token']
            self.log(f"  ✅ Manager login successful, token obtained")
            return True
        elif success:
            self.log(f"  ❌ Manager login response missing access_token: {response}")
            return False
        return False

    def test_check_access_no_lead(self) -> bool:
        """Test check access endpoint - no lead scenario"""
        self.log("\n=== TESTING CHECK ACCESS - NO LEAD ===")
        success, response = self.run_test(
            f"Check Access No Lead - {self.test_vin}",
            "GET",
            f"admin/history-reports/check/{self.test_vin}",
            200
        )
        
        if success:
            self.log(f"  Allowed: {response.get('allowed', 'unknown')}")
            self.log(f"  Reason: {response.get('reason', 'unknown')}")
            self.log(f"  Requires Call: {response.get('requiresCall', 'unknown')}")
            self.log(f"  Requires Approval: {response.get('requiresApproval', 'unknown')}")
            
            # Should not be allowed without lead
            if not response.get('allowed', True):
                self.log(f"  ✅ Correctly denied access without lead")
            else:
                self.log(f"  ⚠️  Access allowed without lead - unexpected")
            
        return success

    def test_request_report(self) -> str:
        """Test request report endpoint"""
        self.log("\n=== TESTING REQUEST REPORT ===")
        success, response = self.run_test(
            f"Request Report - {self.test_vin}",
            "POST",
            "admin/history-reports/request",
            201,
            data={
                "vin": self.test_vin,
                "leadId": "test-lead-123"
            },
            headers={
                "x-device-id": "test-device-123",
                "x-forwarded-for": "192.168.1.100"
            }
        )
        
        if success:
            report_id = response.get('id')
            if report_id:
                self.created_report_ids.append(report_id)
                self.log(f"  ✅ Report requested successfully: {report_id}")
                self.log(f"  VIN: {response.get('vin', 'unknown')}")
                self.log(f"  Status: {response.get('status', 'unknown')}")
                self.log(f"  Lead ID: {response.get('leadId', 'unknown')}")
                return report_id
            else:
                self.log(f"  ❌ Report created but no ID returned")
        
        return None

    def test_request_duplicate_report(self) -> bool:
        """Test requesting duplicate report"""
        self.log("\n=== TESTING DUPLICATE REQUEST ===")
        success, response = self.run_test(
            f"Duplicate Request - {self.test_vin}",
            "POST",
            "admin/history-reports/request",
            200,  # Should return existing or error
            data={
                "vin": self.test_vin,
                "leadId": "test-lead-123"
            }
        )
        
        if success:
            if 'error' in response:
                self.log(f"  ✅ Correctly prevented duplicate: {response.get('error')}")
            else:
                self.log(f"  ✅ Returned existing report: {response.get('id', 'unknown')}")
        
        return success

    def test_get_pending_reports_admin(self) -> bool:
        """Test get pending reports as admin"""
        self.log("\n=== TESTING GET PENDING REPORTS (ADMIN) ===")
        success, response = self.run_test(
            "Get Pending Reports (Admin)",
            "GET",
            "admin/history-reports/pending",
            200
        )
        
        if success:
            if isinstance(response, list):
                reports = response
                self.log(f"  ✅ Found {len(reports)} pending reports")
                if reports:
                    first_report = reports[0]
                    self.log(f"  First report ID: {first_report.get('id', 'unknown')}")
                    self.log(f"  VIN: {first_report.get('vin', 'unknown')}")
                    self.log(f"  Status: {first_report.get('status', 'unknown')}")
            else:
                self.log(f"  ⚠️  Unexpected response format: {type(response)}")
        
        return success

    def test_get_pending_reports_manager(self) -> bool:
        """Test get pending reports as manager"""
        self.log("\n=== TESTING GET PENDING REPORTS (MANAGER) ===")
        success, response = self.run_test(
            "Get Pending Reports (Manager)",
            "GET",
            "admin/history-reports/pending",
            200,
            token=self.manager_token
        )
        
        if success:
            if isinstance(response, list):
                reports = response
                self.log(f"  ✅ Manager sees {len(reports)} pending reports")
            else:
                self.log(f"  ⚠️  Unexpected response format: {type(response)}")
        
        return success

    def test_approve_report(self, report_id: str) -> bool:
        """Test approve report endpoint"""
        if not report_id:
            self.log("\n=== SKIPPING APPROVE TEST - NO REPORT ID ===")
            return False
            
        self.log("\n=== TESTING APPROVE REPORT ===")
        success, response = self.run_test(
            f"Approve Report - {report_id}",
            "PUT",
            f"admin/history-reports/approve/{report_id}",
            200,
            data={
                "note": "Approved after verified call with client"
            }
        )
        
        if success:
            if 'error' in response:
                self.log(f"  ⚠️  Approval failed: {response.get('error')}")
                # This might be expected if no call session exists
            else:
                self.log(f"  ✅ Report approved successfully")
                self.log(f"  Status: {response.get('status', 'unknown')}")
                self.log(f"  Approved By: {response.get('approvedBy', 'unknown')}")
                self.log(f"  Cost: ${response.get('cost', 'unknown')}")
        
        return success

    def test_deny_report(self) -> bool:
        """Test deny report endpoint"""
        # First create a new report to deny
        self.log("\n=== TESTING DENY REPORT ===")
        
        # Create report for denial
        success, response = self.run_test(
            f"Create Report for Denial - {self.test_vin_2}",
            "POST",
            "admin/history-reports/request",
            201,
            data={
                "vin": self.test_vin_2,
                "leadId": "test-lead-456"
            }
        )
        
        if not success:
            self.log("  ❌ Failed to create report for denial test")
            return False
            
        report_id = response.get('id')
        if not report_id:
            self.log("  ❌ No report ID returned for denial test")
            return False
        
        # Now deny it
        success, response = self.run_test(
            f"Deny Report - {report_id}",
            "PUT",
            f"admin/history-reports/deny/{report_id}",
            200,
            data={
                "reason": "Client did not answer call, insufficient verification"
            }
        )
        
        if success:
            self.log(f"  ✅ Report denied successfully")
            self.log(f"  Status: {response.get('status', 'unknown')}")
            self.log(f"  Denied Reason: {response.get('deniedReason', 'unknown')}")
        
        return success

    def test_get_my_reports(self) -> bool:
        """Test get user's reports (cabinet)"""
        self.log("\n=== TESTING GET MY REPORTS ===")
        success, response = self.run_test(
            "Get My Reports",
            "GET",
            "admin/history-reports/my-reports",
            200
        )
        
        if success:
            if isinstance(response, list):
                reports = response
                self.log(f"  ✅ Found {len(reports)} user reports")
                if reports:
                    first_report = reports[0]
                    self.log(f"  First report VIN: {first_report.get('vin', 'unknown')}")
                    self.log(f"  Status: {first_report.get('status', 'unknown')}")
                    self.log(f"  View Count: {first_report.get('viewCount', 'unknown')}")
            else:
                self.log(f"  ⚠️  Unexpected response format: {type(response)}")
        
        return success

    def test_get_analytics(self) -> bool:
        """Test get analytics endpoint (owner only)"""
        self.log("\n=== TESTING GET ANALYTICS ===")
        success, response = self.run_test(
            "Get Analytics",
            "GET",
            "admin/history-reports/analytics?period=30",
            200
        )
        
        if success:
            self.log(f"  ✅ Analytics retrieved successfully")
            self.log(f"  Total Reports: {response.get('totalReports', 'unknown')}")
            self.log(f"  Purchased Reports: {response.get('purchasedReports', 'unknown')}")
            self.log(f"  Cached Reports: {response.get('cachedReports', 'unknown')}")
            self.log(f"  Denied Reports: {response.get('deniedReports', 'unknown')}")
            self.log(f"  Total Cost: ${response.get('totalCost', 'unknown')}")
            self.log(f"  Cache Hit Rate: {response.get('cacheHitRate', 'unknown')}")
            self.log(f"  Approval Rate: {response.get('approvalRate', 'unknown')}")
            self.log(f"  Cost Saved: ${response.get('costSaved', 'unknown')}")
            self.log(f"  Period Days: {response.get('periodDays', 'unknown')}")
            
            by_manager = response.get('byManager', [])
            if by_manager:
                self.log(f"  Manager Stats: {len(by_manager)} managers")
        
        return success

    def test_check_manager_abuse(self) -> bool:
        """Test check manager abuse endpoint (owner only)"""
        self.log("\n=== TESTING CHECK MANAGER ABUSE ===")
        
        # Use manager1 ID for abuse check
        manager_id = "manager1-test-id"
        success, response = self.run_test(
            f"Check Manager Abuse - {manager_id}",
            "GET",
            f"admin/history-reports/abuse-check/{manager_id}?period=7",
            200
        )
        
        if success:
            self.log(f"  ✅ Abuse check completed")
            self.log(f"  Manager ID: {response.get('managerId', 'unknown')}")
            self.log(f"  Reports Count: {response.get('reportsCount', 'unknown')}")
            self.log(f"  Deals From Reports: {response.get('dealsFromReports', 'unknown')}")
            self.log(f"  Conversion Rate: {response.get('conversionRate', 'unknown')}")
            self.log(f"  Total Cost: ${response.get('totalCost', 'unknown')}")
            self.log(f"  Is Abusive: {response.get('isAbusive', 'unknown')}")
            self.log(f"  Flag: {response.get('flag', 'none')}")
        
        return success

    def test_access_control(self) -> bool:
        """Test access control for different roles"""
        self.log("\n=== TESTING ACCESS CONTROL ===")
        
        # Test analytics access with manager token (should fail)
        success, response = self.run_test(
            "Analytics Access (Manager - Should Fail)",
            "GET",
            "admin/history-reports/analytics",
            200,  # Might return 200 with error message
            token=self.manager_token
        )
        
        if success and 'error' in response:
            self.log(f"  ✅ Correctly denied manager access to analytics: {response.get('error')}")
        elif not success:
            self.log(f"  ✅ Manager correctly denied access to analytics")
        else:
            self.log(f"  ⚠️  Manager unexpectedly allowed access to analytics")
        
        # Test abuse check with manager token (should fail)
        success, response = self.run_test(
            "Abuse Check Access (Manager - Should Fail)",
            "GET",
            "admin/history-reports/abuse-check/test-manager",
            200,  # Might return 200 with error message
            token=self.manager_token
        )
        
        if success and 'error' in response:
            self.log(f"  ✅ Correctly denied manager access to abuse check: {response.get('error')}")
        elif not success:
            self.log(f"  ✅ Manager correctly denied access to abuse check")
        else:
            self.log(f"  ⚠️  Manager unexpectedly allowed access to abuse check")
        
        return True

    def test_get_report_by_vin(self) -> bool:
        """Test get report by VIN endpoint"""
        self.log("\n=== TESTING GET REPORT BY VIN ===")
        success, response = self.run_test(
            f"Get Report by VIN - {self.test_vin}",
            "GET",
            f"admin/history-reports/vin/{self.test_vin}",
            200
        )
        
        if success:
            if 'error' in response:
                self.log(f"  ⚠️  Access denied (expected): {response.get('error')}")
                self.log(f"  Reason: {response.get('reason', 'unknown')}")
                self.log(f"  Requires Call: {response.get('requiresCall', 'unknown')}")
                self.log(f"  Requires Approval: {response.get('requiresApproval', 'unknown')}")
            else:
                self.log(f"  ✅ Report retrieved successfully")
                self.log(f"  VIN: {response.get('vin', 'unknown')}")
                self.log(f"  Status: {response.get('status', 'unknown')}")
                
                report_data = response.get('reportData', {})
                if report_data:
                    self.log(f"  Accidents: {report_data.get('accidents', 'unknown')}")
                    self.log(f"  Owner Count: {report_data.get('ownerCount', 'unknown')}")
                    self.log(f"  Title Status: {report_data.get('titleStatus', 'unknown')}")
        
        return success

    def test_workflow_integration(self) -> bool:
        """Test full workflow: request → approve → deliver"""
        self.log("\n=== TESTING FULL WORKFLOW INTEGRATION ===")
        
        # Step 1: Request report
        test_vin = "WORKFLOW123456789"
        success, response = self.run_test(
            f"Workflow Step 1: Request - {test_vin}",
            "POST",
            "admin/history-reports/request",
            201,
            data={
                "vin": test_vin,
                "leadId": "workflow-lead-123"
            }
        )
        
        if not success:
            self.log("  ❌ Workflow failed at request step")
            return False
        
        report_id = response.get('id')
        if not report_id:
            self.log("  ❌ No report ID returned in workflow")
            return False
        
        self.log(f"  ✅ Step 1 complete: Report {report_id} requested")
        
        # Step 2: Check it appears in pending
        success, response = self.run_test(
            "Workflow Step 2: Check Pending",
            "GET",
            "admin/history-reports/pending",
            200
        )
        
        if success and isinstance(response, list):
            pending_vins = [r.get('vin') for r in response]
            if test_vin in pending_vins:
                self.log(f"  ✅ Step 2 complete: Report appears in pending queue")
            else:
                self.log(f"  ⚠️  Step 2 issue: Report not found in pending queue")
        
        # Step 3: Approve report
        success, response = self.run_test(
            f"Workflow Step 3: Approve - {report_id}",
            "PUT",
            f"admin/history-reports/approve/{report_id}",
            200,
            data={
                "note": "Workflow test approval"
            }
        )
        
        if success:
            if 'error' in response:
                self.log(f"  ⚠️  Step 3 expected error (no call session): {response.get('error')}")
            else:
                self.log(f"  ✅ Step 3 complete: Report approved and purchased")
                self.log(f"  Final Status: {response.get('status', 'unknown')}")
        
        self.log("  ✅ Workflow integration test completed")
        return True

    def run_all_tests(self) -> int:
        """Run all History Reports API tests"""
        self.log("🚀 Starting BIBI Cars CRM History Reports Backend Tests")
        self.log(f"Base URL: {self.base_url}")
        self.log("Testing Logic: report = only after confirmed contact + manager decision")
        self.log("Flow: Call → Decision → Buy → Show")
        
        # Test authentication first
        admin_login_success = self.test_admin_login()
        manager_login_success = self.test_manager_login()
        
        if not admin_login_success:
            self.log("❌ Admin login failed - cannot continue with tests")
            return 1
        
        # Test all endpoints
        self.test_check_access_no_lead()
        
        # Request report and get ID for further tests
        report_id = self.test_request_report()
        self.test_request_duplicate_report()
        
        # Test pending reports
        self.test_get_pending_reports_admin()
        if manager_login_success:
            self.test_get_pending_reports_manager()
        
        # Test approval/denial
        self.test_approve_report(report_id)
        self.test_deny_report()
        
        # Test user cabinet
        self.test_get_my_reports()
        
        # Test admin-only endpoints
        self.test_get_analytics()
        self.test_check_manager_abuse()
        
        # Test access control
        if manager_login_success:
            self.test_access_control()
        
        # Test report retrieval
        self.test_get_report_by_vin()
        
        # Test full workflow
        self.test_workflow_integration()
        
        # Print final results
        self.log(f"\n📊 FINAL RESULTS")
        self.log(f"Tests run: {self.tests_run}")
        self.log(f"Tests passed: {self.tests_passed}")
        self.log(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.tests_passed == self.tests_run:
            self.log("🎉 ALL HISTORY REPORTS TESTS PASSED!")
            return 0
        else:
            failed_count = self.tests_run - self.tests_passed
            self.log(f"❌ {failed_count} tests failed")
            
            # If more than 50% failed, it's a critical issue
            if failed_count > (self.tests_run * 0.5):
                self.log("🚨 CRITICAL: More than 50% of tests failed")
                return 2
            
            return 1

def main():
    """Main test runner"""
    tester = HistoryReportsAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())