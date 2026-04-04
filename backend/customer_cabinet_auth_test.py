#!/usr/bin/env python3
"""
BIBI Cars CRM - Customer Cabinet Authorization Tests
Testing customer cabinet authorization fix for profile editing, avatar upload, and all cabinet pages
"""

import requests
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional

class CustomerCabinetAuthTester:
    def __init__(self, base_url="https://vin-core-layer.preview.emergentagent.com"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'BIBI-Customer-Cabinet-Test/1.0'
        })
        
        # Test credentials from review request
        self.test_jwt_credentials = {
            "email": "testuser@example.com",
            "password": "newpassword123"
        }
        self.test_google_session = {
            "customerId": "cust_63b1f2d6-af1",
            "sessionToken": "0R91Qid8MspA062-tPHgTD0hSuLH7s76X7EwycioTZs"
        }
        
        self.jwt_token = None
        self.customer_id = None

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

    def test_customer_jwt_login(self) -> bool:
        """Test customer login with JWT credentials"""
        self.log("\n=== TESTING CUSTOMER JWT LOGIN ===")
        success, response = self.run_test(
            "Customer JWT Login",
            "POST",
            "customer-auth/login",
            201,  # Fixed: API returns 201 for successful login
            data=self.test_jwt_credentials
        )
        
        if success:
            if 'accessToken' in response:
                self.jwt_token = response['accessToken']
                self.customer_id = response.get('customerId')
                self.log(f"  ✅ JWT Login successful, token obtained")
                self.log(f"  Customer ID: {self.customer_id}")
                return True
            else:
                self.log(f"  ❌ JWT Login response missing accessToken: {response}")
        return False

    def test_customer_google_session(self) -> bool:
        """Test customer Google OAuth session validation"""
        self.log("\n=== TESTING GOOGLE OAUTH SESSION ===")
        
        # Test with session token in Authorization header (CORS workaround)
        headers = {
            'Authorization': f'Bearer {self.test_google_session["sessionToken"]}'
        }
        
        success, response = self.run_test(
            "Google OAuth Session Validation",
            "GET",
            "customer-auth/google/me",
            200,
            headers=headers
        )
        
        if success:
            self.log(f"  ✅ Google session valid")
            self.log(f"  Customer ID: {response.get('customerId')}")
            self.log(f"  Email: {response.get('email')}")
            self.log(f"  Name: {response.get('name')}")
            return True
        else:
            self.log(f"  ❌ Google session validation failed")
        return False

    def test_profile_access_jwt(self) -> bool:
        """Test profile access with JWT token"""
        if not self.jwt_token or not self.customer_id:
            self.log("  ❌ No JWT token available - skipping test")
            return False
            
        self.log("\n=== TESTING PROFILE ACCESS (JWT) ===")
        headers = {
            'Authorization': f'Bearer {self.jwt_token}'
        }
        
        success, response = self.run_test(
            "Get Profile with JWT",
            "GET",
            f"customer-cabinet/{self.customer_id}/profile",
            200,
            headers=headers
        )
        
        if success:
            customer = response.get('customer', {})
            self.log(f"  ✅ Profile access successful")
            self.log(f"  Customer Name: {customer.get('firstName')} {customer.get('lastName')}")
            self.log(f"  Email: {customer.get('email')}")
            return True
        return False

    def test_profile_access_google_session(self) -> bool:
        """Test profile access with Google session token"""
        self.log("\n=== TESTING PROFILE ACCESS (GOOGLE SESSION) ===")
        headers = {
            'Authorization': f'Bearer {self.test_google_session["sessionToken"]}'
        }
        
        success, response = self.run_test(
            "Get Profile with Google Session",
            "GET",
            f"customer-cabinet/{self.test_google_session['customerId']}/profile",
            200,
            headers=headers
        )
        
        if success:
            customer = response.get('customer', {})
            self.log(f"  ✅ Profile access successful")
            self.log(f"  Customer Name: {customer.get('firstName')} {customer.get('lastName')}")
            self.log(f"  Email: {customer.get('email')}")
            return True
        return False

    def test_profile_update_jwt(self) -> bool:
        """Test profile update with JWT token"""
        if not self.jwt_token:
            self.log("  ❌ No JWT token available - skipping test")
            return False
            
        self.log("\n=== TESTING PROFILE UPDATE (JWT) ===")
        headers = {
            'Authorization': f'Bearer {self.jwt_token}'
        }
        
        test_data = {
            "firstName": "Updated",
            "lastName": "TestUser",
            "city": "Test City",
            "phone": "+380123456789"
        }
        
        success, response = self.run_test(
            "Update Profile with JWT",
            "PATCH",
            "customer-auth/me/profile",
            200,
            data=test_data,
            headers=headers
        )
        
        if success:
            self.log(f"  ✅ Profile update successful")
            self.log(f"  Updated fields: {list(test_data.keys())}")
            return True
        return False

    def test_profile_update_google_session(self) -> bool:
        """Test profile update with Google session token"""
        self.log("\n=== TESTING PROFILE UPDATE (GOOGLE SESSION) ===")
        headers = {
            'Authorization': f'Bearer {self.test_google_session["sessionToken"]}'
        }
        
        test_data = {
            "firstName": "GoogleUpdated",
            "lastName": "TestUser",
            "city": "Google Test City",
            "phone": "+380987654321"
        }
        
        success, response = self.run_test(
            "Update Profile with Google Session",
            "PATCH",
            "customer-auth/me/profile",
            200,
            data=test_data,
            headers=headers
        )
        
        if success:
            self.log(f"  ✅ Profile update successful")
            self.log(f"  Updated fields: {list(test_data.keys())}")
            return True
        return False

    def test_password_change_jwt(self) -> bool:
        """Test password change with JWT token"""
        if not self.jwt_token:
            self.log("  ❌ No JWT token available - skipping test")
            return False
            
        self.log("\n=== TESTING PASSWORD CHANGE (JWT) ===")
        headers = {
            'Authorization': f'Bearer {self.jwt_token}'
        }
        
        test_data = {
            "currentPassword": self.test_jwt_credentials["password"],
            "newPassword": "newpassword456"
        }
        
        success, response = self.run_test(
            "Change Password with JWT",
            "PATCH",
            "customer-auth/me/password",
            200,
            data=test_data,
            headers=headers
        )
        
        if success:
            self.log(f"  ✅ Password change successful")
            # Update password for future tests
            self.test_jwt_credentials["password"] = test_data["newPassword"]
            return True
        return False

    def test_avatar_update_google_session(self) -> bool:
        """Test avatar update with Google session token"""
        self.log("\n=== TESTING AVATAR UPDATE (GOOGLE SESSION) ===")
        headers = {
            'Authorization': f'Bearer {self.test_google_session["sessionToken"]}'
        }
        
        # Test with avatar URL
        test_data = {
            "avatarUrl": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wA=="
        }
        
        success, response = self.run_test(
            "Update Avatar with Google Session",
            "PATCH",
            "customer-auth/me/avatar",
            200,
            data=test_data,
            headers=headers
        )
        
        if success:
            self.log(f"  ✅ Avatar update successful")
            self.log(f"  Picture URL length: {len(response.get('picture', ''))}")
            return True
        return False

    def test_cabinet_pages_access(self) -> bool:
        """Test access to all cabinet pages"""
        self.log("\n=== TESTING CABINET PAGES ACCESS ===")
        
        customer_id = self.test_google_session['customerId']
        headers = {
            'Authorization': f'Bearer {self.test_google_session["sessionToken"]}'
        }
        
        cabinet_endpoints = [
            ("Dashboard", f"customer-cabinet/{customer_id}/dashboard"),
            ("Orders", f"customer-cabinet/{customer_id}/orders"),
            ("Invoices", f"customer-cabinet/{customer_id}/invoices"),
            ("Contracts", f"customer-cabinet/{customer_id}/contracts"),
            ("Shipping", f"customer-cabinet/{customer_id}/shipping"),
            ("Carfax", f"customer-cabinet/{customer_id}/carfax"),
            ("Notifications", f"customer-cabinet/{customer_id}/notifications"),
            ("Profile", f"customer-cabinet/{customer_id}/profile")
        ]
        
        all_success = True
        for page_name, endpoint in cabinet_endpoints:
            success, response = self.run_test(
                f"Access {page_name} Page",
                "GET",
                endpoint,
                200,
                headers=headers
            )
            
            if success:
                self.log(f"  ✅ {page_name} page accessible")
            else:
                self.log(f"  ❌ {page_name} page access failed")
                all_success = False
        
        return all_success

    def test_unauthorized_access(self) -> bool:
        """Test that unauthorized requests are properly rejected"""
        self.log("\n=== TESTING UNAUTHORIZED ACCESS ===")
        
        customer_id = self.test_google_session['customerId']
        
        # Test without any authorization header
        success, response = self.run_test(
            "Profile Access Without Auth",
            "GET",
            f"customer-cabinet/{customer_id}/profile",
            401  # Should be unauthorized
        )
        
        if success:
            self.log(f"  ✅ Unauthorized access properly rejected")
            return True
        else:
            self.log(f"  ❌ Unauthorized access not properly rejected")
            return False

    def test_invalid_token_access(self) -> bool:
        """Test that invalid tokens are properly rejected"""
        self.log("\n=== TESTING INVALID TOKEN ACCESS ===")
        
        customer_id = self.test_google_session['customerId']
        headers = {
            'Authorization': 'Bearer invalid_token_12345'
        }
        
        success, response = self.run_test(
            "Profile Access With Invalid Token",
            "GET",
            f"customer-cabinet/{customer_id}/profile",
            401  # Should be unauthorized
        )
        
        if success:
            self.log(f"  ✅ Invalid token properly rejected")
            return True
        else:
            self.log(f"  ❌ Invalid token not properly rejected")
            return False

    def run_all_tests(self) -> int:
        """Run all customer cabinet authorization tests"""
        self.log("🚀 Starting BIBI Cars Customer Cabinet Authorization Tests")
        self.log(f"Testing against: {self.base_url}")
        
        test_results = []
        
        # Test JWT authentication flow
        test_results.append(("Customer JWT Login", self.test_customer_jwt_login()))
        test_results.append(("Profile Access (JWT)", self.test_profile_access_jwt()))
        test_results.append(("Profile Update (JWT)", self.test_profile_update_jwt()))
        test_results.append(("Password Change (JWT)", self.test_password_change_jwt()))
        
        # Test Google OAuth session flow
        test_results.append(("Google OAuth Session", self.test_customer_google_session()))
        test_results.append(("Profile Access (Google)", self.test_profile_access_google_session()))
        test_results.append(("Profile Update (Google)", self.test_profile_update_google_session()))
        test_results.append(("Avatar Update (Google)", self.test_avatar_update_google_session()))
        
        # Test cabinet pages access
        test_results.append(("Cabinet Pages Access", self.test_cabinet_pages_access()))
        
        # Test security
        test_results.append(("Unauthorized Access", self.test_unauthorized_access()))
        test_results.append(("Invalid Token Access", self.test_invalid_token_access()))
        
        # Print summary
        self.log("\n" + "="*60)
        self.log("📊 TEST SUMMARY")
        self.log("="*60)
        
        for test_name, result in test_results:
            status = "✅ PASS" if result else "❌ FAIL"
            self.log(f"{status} {test_name}")
        
        self.log(f"\nTests passed: {self.tests_passed}/{self.tests_run}")
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        self.log(f"Success rate: {success_rate:.1f}%")
        
        if self.tests_passed == self.tests_run:
            self.log("🎉 ALL TESTS PASSED!")
            return 0
        else:
            self.log("❌ SOME TESTS FAILED!")
            return 1

def main():
    tester = CustomerCabinetAuthTester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())