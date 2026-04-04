#!/usr/bin/env python3
"""
BIBI Cars CRM - User Engagement Module Backend API Tests
Testing Favorites, Compare, and History Access Layer with anti-abuse features
"""

import requests
import sys
import json
from datetime import datetime
from typing import Dict, Any, Optional

class UserEngagementAPITester:
    def __init__(self, base_url="https://vin-core-layer.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'BIBI-CRM-UserEngagement-Test/1.0'
        })
        
        # Test data
        self.test_vehicles = [
            {
                "vehicleId": "test-vehicle-1",
                "vin": "1HGBH41JXMN109186",
                "metadataSnapshot": {
                    "year": 2023,
                    "make": "Honda",
                    "model": "Civic",
                    "price": 25000
                }
            },
            {
                "vehicleId": "test-vehicle-2", 
                "vin": "1FTFW1ET5DFC12345",
                "metadataSnapshot": {
                    "year": 2022,
                    "make": "Ford",
                    "model": "F-150",
                    "price": 35000
                }
            },
            {
                "vehicleId": "test-vehicle-3",
                "vin": "1G1ZT51826F123456",
                "metadataSnapshot": {
                    "year": 2021,
                    "make": "Chevrolet", 
                    "model": "Malibu",
                    "price": 22000
                }
            },
            {
                "vehicleId": "test-vehicle-4",
                "vin": "JM1BK32F781234567",
                "metadataSnapshot": {
                    "year": 2020,
                    "make": "Mazda",
                    "model": "CX-5", 
                    "price": 28000
                }
            }
        ]

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
            elif method == 'DELETE':
                response = self.session.delete(url, headers=test_headers, timeout=30)
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
        elif success:
            self.log(f"  ❌ Login response missing access_token: {response}")
            return False
        return False

    def test_favorites_endpoints(self) -> bool:
        """Test all favorites endpoints"""
        self.log("\n=== TESTING FAVORITES MODULE ===")
        all_passed = True
        
        # Test 1: Add first vehicle to favorites
        vehicle1 = self.test_vehicles[0]
        success, response = self.run_test(
            "Add Vehicle to Favorites",
            "POST", 
            "favorites",
            201,
            data={
                "vehicleId": vehicle1["vehicleId"],
                "vin": vehicle1["vin"],
                "sourcePage": "search_results",
                "metadataSnapshot": vehicle1["metadataSnapshot"]
            }
        )
        all_passed &= success
        
        if success:
            self.log(f"  Added vehicle {vehicle1['vin']} to favorites")
        
        # Test 2: Add second vehicle to favorites
        vehicle2 = self.test_vehicles[1]
        success, response = self.run_test(
            "Add Second Vehicle to Favorites",
            "POST",
            "favorites", 
            201,
            data={
                "vehicleId": vehicle2["vehicleId"],
                "vin": vehicle2["vin"],
                "sourcePage": "vehicle_details",
                "metadataSnapshot": vehicle2["metadataSnapshot"]
            }
        )
        all_passed &= success
        
        # Test 3: Get my favorites
        success, response = self.run_test(
            "Get My Favorites",
            "GET",
            "favorites/me",
            200
        )
        all_passed &= success
        
        if success:
            favorites = response if isinstance(response, list) else response.get('favorites', [])
            self.log(f"  Found {len(favorites)} favorites")
            for fav in favorites[:3]:  # Show first 3
                self.log(f"    - {fav.get('vin', 'N/A')} ({fav.get('vehicleId', 'N/A')})")
        
        # Test 4: Check if vehicle is favorite
        success, response = self.run_test(
            "Check Vehicle is Favorite",
            "GET",
            f"favorites/check/{vehicle1['vehicleId']}",
            200
        )
        all_passed &= success
        
        # Test 5: Remove vehicle from favorites
        success, response = self.run_test(
            "Remove Vehicle from Favorites",
            "DELETE",
            f"favorites/{vehicle1['vehicleId']}",
            200
        )
        all_passed &= success
        
        if success:
            self.log(f"  Removed vehicle {vehicle1['vehicleId']} from favorites")
        
        return all_passed

    def test_compare_endpoints(self) -> bool:
        """Test all compare endpoints including 3-car limit"""
        self.log("\n=== TESTING COMPARE MODULE ===")
        all_passed = True
        
        # Test 1: Clear compare list first
        success, response = self.run_test(
            "Clear Compare List",
            "DELETE",
            "compare/clear",
            200
        )
        all_passed &= success
        
        # Test 2: Add first vehicle to compare
        vehicle1 = self.test_vehicles[0]
        success, response = self.run_test(
            "Add First Vehicle to Compare",
            "POST",
            "compare/add",
            201,
            data={
                "vehicleId": vehicle1["vehicleId"],
                "vin": vehicle1["vin"],
                "snapshot": vehicle1["metadataSnapshot"]
            }
        )
        all_passed &= success
        
        # Test 3: Add second vehicle to compare
        vehicle2 = self.test_vehicles[1]
        success, response = self.run_test(
            "Add Second Vehicle to Compare",
            "POST",
            "compare/add",
            201,
            data={
                "vehicleId": vehicle2["vehicleId"],
                "vin": vehicle2["vin"],
                "snapshot": vehicle2["metadataSnapshot"]
            }
        )
        all_passed &= success
        
        # Test 4: Add third vehicle to compare
        vehicle3 = self.test_vehicles[2]
        success, response = self.run_test(
            "Add Third Vehicle to Compare",
            "POST",
            "compare/add",
            201,
            data={
                "vehicleId": vehicle3["vehicleId"],
                "vin": vehicle3["vin"],
                "snapshot": vehicle3["metadataSnapshot"]
            }
        )
        all_passed &= success
        
        # Test 5: Try to add fourth vehicle (should fail due to 3-car limit)
        vehicle4 = self.test_vehicles[3]
        success, response = self.run_test(
            "Add Fourth Vehicle to Compare (Should Fail - Limit Test)",
            "POST",
            "compare/add",
            400,  # Should return 400 Bad Request due to limit
            data={
                "vehicleId": vehicle4["vehicleId"],
                "vin": vehicle4["vin"],
                "snapshot": vehicle4["metadataSnapshot"]
            }
        )
        all_passed &= success
        
        if success:
            self.log(f"  ✅ Compare limit working correctly - rejected 4th vehicle")
            if "limit" in str(response).lower():
                self.log(f"  Error message mentions limit: {response}")
        
        # Test 6: Get my compare list
        success, response = self.run_test(
            "Get My Compare List",
            "GET",
            "compare/me",
            200
        )
        all_passed &= success
        
        if success:
            items = response.get('items', []) if isinstance(response, dict) else response
            self.log(f"  Found {len(items)} vehicles in compare list")
            for item in items:
                self.log(f"    - {item.get('vin', 'N/A')} ({item.get('vehicleId', 'N/A')})")
            
            # Verify we have exactly 3 items
            if len(items) == 3:
                self.log(f"  ✅ Compare list has exactly 3 items as expected")
            else:
                self.log(f"  ⚠️  Expected 3 items, found {len(items)}")
        
        # Test 7: Resolve compare (get comparison table)
        success, response = self.run_test(
            "Resolve Compare List",
            "POST",
            "compare/resolve",
            200
        )
        # Note: This might fail if vehicle resolver is not available, but we test the endpoint
        
        # Test 8: Remove one vehicle from compare
        success, response = self.run_test(
            "Remove Vehicle from Compare",
            "DELETE",
            f"compare/remove/{vehicle1['vehicleId']}",
            200
        )
        all_passed &= success
        
        return all_passed

    def test_history_endpoints(self) -> bool:
        """Test history quota and related endpoints"""
        self.log("\n=== TESTING HISTORY MODULE ===")
        all_passed = True
        
        # Test 1: Get my quota
        success, response = self.run_test(
            "Get My History Quota",
            "GET",
            "history/quota/me",
            200
        )
        all_passed &= success
        
        if success:
            self.log(f"  Quota info: {response}")
            quota_data = response
            if isinstance(quota_data, dict):
                self.log(f"    Free reports used: {quota_data.get('freeReportsUsed', 'N/A')}")
                self.log(f"    Free reports limit: {quota_data.get('freeReportsLimit', 'N/A')}")
                self.log(f"    Can use free: {quota_data.get('canUseFree', 'N/A')}")
                self.log(f"    Is restricted: {quota_data.get('isRestricted', 'N/A')}")
        
        # Test 2: Try to request a history report (might be blocked by quota/verification)
        test_vin = self.test_vehicles[0]["vin"]
        success, response = self.run_test(
            "Request History Report",
            "POST",
            "history/request",
            200,  # Might return different status based on quota/verification
            data={
                "vin": test_vin,
                "deviceFingerprint": "test-device-123",
                "reason": "api_test"
            }
        )
        # Don't fail overall test if this fails - it might be expected due to verification requirements
        
        if not success:
            self.log(f"  History request failed (might be expected): {response}")
        
        # Test 3: Try to get report by VIN (might not exist)
        success, response = self.run_test(
            "Get History Report by VIN",
            "GET",
            f"history/report/{test_vin}",
            404  # Expect 404 if no report exists
        )
        # This is expected to fail if no report exists
        
        return all_passed

    def test_admin_analytics(self) -> bool:
        """Test admin analytics endpoints"""
        self.log("\n=== TESTING ADMIN ANALYTICS ===")
        all_passed = True
        
        # Test 1: Favorites analytics
        success, response = self.run_test(
            "Admin Favorites Analytics",
            "GET",
            "admin/favorites/analytics",
            200
        )
        all_passed &= success
        
        if success:
            self.log(f"  Favorites Analytics:")
            stats = response.get('stats', {})
            self.log(f"    Total favorites: {stats.get('totalFavorites', 'N/A')}")
            self.log(f"    Unique users: {stats.get('uniqueUsers', 'N/A')}")
            self.log(f"    Unique VINs: {stats.get('uniqueVins', 'N/A')}")
            self.log(f"    Last 24h: {stats.get('last24h', 'N/A')}")
            
            top_vehicles = response.get('topVehicles', [])
            if top_vehicles:
                self.log(f"    Top vehicle: {top_vehicles[0].get('vin', 'N/A')} ({top_vehicles[0].get('count', 'N/A')} favorites)")
        
        # Test 2: Compare analytics
        success, response = self.run_test(
            "Admin Compare Analytics",
            "GET",
            "admin/compare/analytics",
            200
        )
        all_passed &= success
        
        if success:
            self.log(f"  Compare Analytics:")
            stats = response.get('stats', {})
            self.log(f"    Total lists: {stats.get('totalLists', 'N/A')}")
            self.log(f"    Active lists: {stats.get('activeLists', 'N/A')}")
            self.log(f"    Empty lists: {stats.get('emptyLists', 'N/A')}")
            
            top_vins = response.get('topComparedVins', [])
            if top_vins:
                self.log(f"    Top compared VIN: {top_vins[0].get('vin', 'N/A')} ({top_vins[0].get('count', 'N/A')} compares)")
        
        # Test 3: History analytics
        success, response = self.run_test(
            "Admin History Analytics",
            "GET",
            "admin/history/analytics",
            200
        )
        all_passed &= success
        
        if success:
            self.log(f"  History Analytics:")
            requests_stats = response.get('requests', {})
            self.log(f"    Total requests: {requests_stats.get('total', 'N/A')}")
            self.log(f"    Success requests: {requests_stats.get('success', 'N/A')}")
            self.log(f"    Blocked requests: {requests_stats.get('blocked', 'N/A')}")
            self.log(f"    Cached requests: {requests_stats.get('cached', 'N/A')}")
            self.log(f"    Last 24h: {requests_stats.get('last24h', 'N/A')}")
            
            costs = response.get('costs', {})
            self.log(f"    Total cost: ${costs.get('total', 'N/A')}")
        
        return all_passed

    def test_additional_admin_endpoints(self) -> bool:
        """Test additional admin endpoints"""
        self.log("\n=== TESTING ADDITIONAL ADMIN ENDPOINTS ===")
        all_passed = True
        
        # Test 1: Admin history requests
        success, response = self.run_test(
            "Admin History Requests",
            "GET",
            "admin/history/requests",
            200
        )
        all_passed &= success
        
        if success:
            self.log(f"  History requests: {response.get('total', 'N/A')} total")
        
        # Test 2: Admin history reports
        success, response = self.run_test(
            "Admin History Reports",
            "GET",
            "admin/history/reports",
            200
        )
        all_passed &= success
        
        if success:
            self.log(f"  History reports: {response.get('total', 'N/A')} total")
        
        return all_passed

    def run_all_tests(self) -> int:
        """Run all User Engagement module tests"""
        self.log("🚀 Starting BIBI Cars CRM User Engagement Module Tests")
        self.log(f"Base URL: {self.base_url}")
        
        # Test admin login first
        login_success = self.test_admin_login()
        if not login_success:
            self.log("❌ Admin login failed - cannot continue with authenticated tests")
            return 1
        
        # Test all modules
        favorites_success = self.test_favorites_endpoints()
        compare_success = self.test_compare_endpoints()
        history_success = self.test_history_endpoints()
        admin_analytics_success = self.test_admin_analytics()
        admin_additional_success = self.test_additional_admin_endpoints()
        
        # Print final results
        self.log(f"\n📊 FINAL RESULTS")
        self.log(f"Tests run: {self.tests_run}")
        self.log(f"Tests passed: {self.tests_passed}")
        self.log(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        # Module-specific results
        self.log(f"\n📋 MODULE RESULTS:")
        self.log(f"  Favorites: {'✅ PASSED' if favorites_success else '❌ FAILED'}")
        self.log(f"  Compare: {'✅ PASSED' if compare_success else '❌ FAILED'}")
        self.log(f"  History: {'✅ PASSED' if history_success else '❌ FAILED'}")
        self.log(f"  Admin Analytics: {'✅ PASSED' if admin_analytics_success else '❌ FAILED'}")
        self.log(f"  Admin Additional: {'✅ PASSED' if admin_additional_success else '❌ FAILED'}")
        
        if self.tests_passed == self.tests_run:
            self.log("🎉 ALL TESTS PASSED!")
            return 0
        else:
            self.log(f"❌ {self.tests_run - self.tests_passed} tests failed")
            return 1

def main():
    """Main test runner"""
    tester = UserEngagementAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())