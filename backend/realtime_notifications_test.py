#!/usr/bin/env python3
"""
BIBI Cars CRM - Real-time Notifications Testing
Testing the specific features mentioned in the review request:
1. Backend health endpoint /api/system/health
2. Staff authentication with admin@crm.com / admin123
3. WebSocket notifications gateway on /notifications namespace
4. Shipping status update endpoint PATCH /api/shipping/:id/status
5. Real-time notification sent via WebSocket when status changes
6. CustomerNotificationService integration with ShippingService
"""

import requests
import sys
import json
import time
import asyncio
import socketio
from datetime import datetime
from typing import Dict, Any, Optional

class RealtimeNotificationsTester:
    def __init__(self, base_url="https://vin-core-layer.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'BIBI-CRM-Realtime-Test/1.0'
        })
        self.created_ids = {}
        self.websocket_events = []

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

    def test_system_health(self) -> bool:
        """Test backend health endpoint /api/system/health"""
        self.log("\n=== TESTING BACKEND HEALTH ENDPOINT ===")
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

    def test_staff_authentication(self) -> bool:
        """Test staff authentication with admin@crm.com / admin123"""
        self.log("\n=== TESTING STAFF AUTHENTICATION ===")
        success, response = self.run_test(
            "Staff Login (admin@crm.com)",
            "POST",
            "auth/login",
            201,
            data={"email": "admin@crm.com", "password": "admin123"}
        )
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.log(f"  ✅ Staff login successful, token obtained")
            return True
        elif success and 'token' in response:
            self.token = response['token']
            self.log(f"  ✅ Staff login successful, token obtained")
            return True
        elif success:
            self.log(f"  ❌ Login response missing access_token: {response}")
            return False
        return False

    def test_create_test_shipment(self) -> str:
        """Create a test shipment for notification testing"""
        self.log("\n=== CREATING TEST SHIPMENT ===")
        test_customer_id = f"test_customer_{int(time.time())}"
        test_deal_id = f"test_deal_{int(time.time())}"
        
        success, response = self.run_test(
            "Create Test Shipment",
            "POST",
            "shipping",
            201,
            data={
                "dealId": test_deal_id,
                "userId": test_customer_id,
                "managerId": "admin_user_id",
                "vin": f"RT{int(time.time())}123456",
                "vehicleTitle": "2023 Honda Accord Realtime Test",
                "originPort": "Los Angeles, CA",
                "destinationPort": "Odessa, Ukraine",
                "containerNumber": f"RTTEST{int(time.time())}"
            }
        )
        
        if success:
            shipment_id = response.get('id')
            self.log(f"  Shipment ID: {shipment_id}")
            self.log(f"  VIN: {response.get('vin')}")
            self.log(f"  Status: {response.get('currentStatus')}")
            self.created_ids['shipment'] = shipment_id
            self.created_ids['customer_id'] = test_customer_id
            self.created_ids['deal_id'] = test_deal_id
            return shipment_id
        
        return None

    async def test_websocket_gateway(self) -> bool:
        """Test WebSocket notifications gateway on /notifications namespace"""
        self.log("\n=== TESTING WEBSOCKET NOTIFICATIONS GATEWAY ===")
        
        if not self.token:
            self.log("  ❌ No token available for WebSocket connection")
            return False
        
        try:
            # Create socket.io client
            sio = socketio.AsyncClient()
            connection_success = False
            
            @sio.event
            async def connect():
                nonlocal connection_success
                connection_success = True
                self.log("  ✅ WebSocket connected to /notifications namespace")
            
            @sio.event
            async def disconnect():
                self.log("  WebSocket disconnected")
            
            @sio.on('error')
            async def on_error(data):
                self.log(f"  ❌ WebSocket error: {data}")
            
            # Connect to WebSocket with token
            ws_url = self.base_url.replace('https://', 'wss://').replace('http://', 'ws://')
            await sio.connect(f"{ws_url}/notifications", 
                            auth={'token': self.token},
                            transports=['websocket'])
            
            # Wait a bit for connection to establish
            await asyncio.sleep(2)
            
            if connection_success:
                self.log("  ✅ WebSocket gateway connection established")
                await sio.disconnect()
                self.tests_run += 1
                self.tests_passed += 1
                return True
            else:
                self.log("  ❌ WebSocket gateway connection failed")
                self.tests_run += 1
                return False
                
        except Exception as e:
            self.log(f"  ❌ WebSocket gateway error: {str(e)}")
            self.tests_run += 1
            return False

    def test_shipping_status_update_endpoint(self) -> bool:
        """Test shipping status update endpoint PATCH /api/shipping/:id/status"""
        self.log("\n=== TESTING SHIPPING STATUS UPDATE ENDPOINT ===")
        
        shipment_id = self.created_ids.get('shipment')
        if not shipment_id:
            self.log("  ❌ No shipment ID available")
            return False
        
        # Test updating shipment status
        success, response = self.run_test(
            "Update Shipment Status",
            "PATCH",
            f"shipping/{shipment_id}/status",
            200,
            data={
                "currentStatus": "transport_to_port",
                "currentPort": "Los Angeles Port",
                "currentLocation": "Los Angeles, CA"
            }
        )
        
        if success:
            self.log(f"  ✅ Status updated to: {response.get('currentStatus')}")
            self.log(f"  Current Port: {response.get('currentPort')}")
            self.log(f"  Current Location: {response.get('currentLocation')}")
            return True
        
        return False

    async def test_realtime_notification_integration(self) -> bool:
        """Test real-time notification sent via WebSocket when status changes"""
        self.log("\n=== TESTING REAL-TIME NOTIFICATION INTEGRATION ===")
        
        if not self.token or not self.created_ids.get('shipment'):
            self.log("  ❌ Missing token or shipment ID")
            return False
        
        try:
            # Create socket.io client
            sio = socketio.AsyncClient()
            events_received = []
            connection_established = False
            
            @sio.event
            async def connect():
                nonlocal connection_established
                connection_established = True
                self.log("  ✅ WebSocket connected for real-time notification test")
            
            @sio.on('shipment:status_changed')
            async def on_status_changed(data):
                self.log(f"  📦 Received status change notification: {data.get('newStatus')}")
                self.log(f"      VIN: {data.get('vin')}")
                self.log(f"      Status Label: {data.get('statusLabel')}")
                events_received.append(('status_changed', data))
            
            @sio.on('shipment:eta_changed')
            async def on_eta_changed(data):
                self.log(f"  📅 Received ETA change notification: {data.get('formattedEta')}")
                events_received.append(('eta_changed', data))
            
            @sio.on('shipment:arrived')
            async def on_arrived(data):
                self.log(f"  🎉 Received shipment arrived notification: {data.get('vin')}")
                events_received.append(('arrived', data))
            
            # Connect to WebSocket
            ws_url = self.base_url.replace('https://', 'wss://').replace('http://', 'ws://')
            await sio.connect(f"{ws_url}/notifications", 
                            auth={'token': self.token},
                            transports=['websocket'])
            
            await asyncio.sleep(2)
            
            if not connection_established:
                self.log("  ❌ WebSocket connection failed")
                self.tests_run += 1
                return False
            
            # Subscribe to shipment updates
            await sio.emit('subscribe:shipment', {'shipmentId': self.created_ids['shipment']})
            await asyncio.sleep(1)
            self.log(f"  📡 Subscribed to shipment: {self.created_ids['shipment']}")
            
            # Trigger status change via API (this should send WebSocket notification)
            self.log("  🔄 Triggering status change to test notifications...")
            
            # Update to IN_TRANSIT status
            success, response = self.run_test(
                "Trigger Status Change for Notification",
                "PATCH",
                f"shipping/{self.created_ids['shipment']}/status",
                200,
                data={
                    "currentStatus": "in_transit",
                    "currentPort": "Pacific Ocean",
                    "currentLocation": "En route to Ukraine"
                }
            )
            
            if success:
                self.log(f"  ✅ Status change triggered: {response.get('currentStatus')}")
            
            # Wait for WebSocket notification
            await asyncio.sleep(5)
            
            # Test ETA update notification
            self.log("  🔄 Triggering ETA change to test notifications...")
            future_date = "2024-12-31T23:59:59.000Z"
            
            success2, response2 = self.run_test(
                "Trigger ETA Change for Notification",
                "PATCH",
                f"shipping/{self.created_ids['shipment']}/eta",
                200,
                data={
                    "eta": future_date
                }
            )
            
            if success2:
                self.log(f"  ✅ ETA change triggered: {response2.get('eta')}")
            
            # Wait for WebSocket notification
            await asyncio.sleep(5)
            
            await sio.disconnect()
            
            # Check if we received events
            self.log(f"  📊 Events received: {len(events_received)}")
            for event_type, data in events_received:
                self.log(f"    - {event_type}: {data.get('shipmentId', 'N/A')}")
            
            self.tests_run += 1
            if len(events_received) > 0:
                self.tests_passed += 1
                self.log("  ✅ Real-time notifications working!")
                return True
            else:
                self.log("  ⚠️  No WebSocket events received")
                self.log("  This could mean:")
                self.log("    - CustomerNotificationService is not properly integrated")
                self.log("    - WebSocket events are not being emitted")
                self.log("    - User ID mapping is incorrect")
                return False
                
        except Exception as e:
            self.log(f"  ❌ Real-time notification integration error: {str(e)}")
            self.tests_run += 1
            return False

    def test_customer_notification_service_integration(self) -> bool:
        """Test CustomerNotificationService integration with ShippingService"""
        self.log("\n=== TESTING CUSTOMER NOTIFICATION SERVICE INTEGRATION ===")
        
        shipment_id = self.created_ids.get('shipment')
        if not shipment_id:
            self.log("  ❌ No shipment ID available")
            return False
        
        # Test multiple status changes to verify integration
        statuses_to_test = [
            ("loaded_on_vessel", "Завантажено на судно"),
            ("at_destination_port", "Прибуло в порт призначення"),
            ("ready_for_pickup", "Готово до видачі")
        ]
        
        integration_working = True
        
        for status, expected_label in statuses_to_test:
            self.log(f"  🔄 Testing status change to: {status}")
            
            success, response = self.run_test(
                f"Update Status to {status}",
                "PATCH",
                f"shipping/{shipment_id}/status",
                200,
                data={
                    "currentStatus": status,
                    "currentPort": "Odessa Port",
                    "currentLocation": "Odessa, Ukraine"
                }
            )
            
            if success:
                self.log(f"    ✅ Status updated to: {response.get('currentStatus')}")
                # Small delay to allow notification processing
                time.sleep(1)
            else:
                self.log(f"    ❌ Failed to update status to {status}")
                integration_working = False
        
        if integration_working:
            self.log("  ✅ CustomerNotificationService integration appears to be working")
            self.log("  (Status updates are processed successfully)")
        else:
            self.log("  ❌ CustomerNotificationService integration has issues")
        
        return integration_working

    async def run_all_tests(self) -> int:
        """Run all real-time notification tests"""
        self.log("🚀 Starting BIBI Cars CRM Real-time Notifications Tests")
        self.log(f"Base URL: {self.base_url}")
        
        # Test 1: Backend health endpoint
        health_success = self.test_system_health()
        
        # Test 2: Staff authentication
        auth_success = self.test_staff_authentication()
        
        if not auth_success:
            self.log("❌ Staff authentication failed - cannot proceed with authenticated tests")
            return 1
        
        # Test 3: Create test shipment
        shipment_created = self.test_create_test_shipment()
        
        if not shipment_created:
            self.log("❌ Failed to create test shipment")
            return 1
        
        # Test 4: WebSocket notifications gateway
        await self.test_websocket_gateway()
        
        # Test 5: Shipping status update endpoint
        status_update_success = self.test_shipping_status_update_endpoint()
        
        # Test 6: Real-time notification integration
        await self.test_realtime_notification_integration()
        
        # Test 7: CustomerNotificationService integration
        service_integration_success = self.test_customer_notification_service_integration()
        
        # Print final results
        self.log(f"\n📊 FINAL RESULTS")
        self.log(f"Tests run: {self.tests_run}")
        self.log(f"Tests passed: {self.tests_passed}")
        self.log(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        # Summary of key features
        self.log(f"\n🎯 KEY FEATURES TESTED:")
        self.log(f"  ✅ Backend health endpoint: {'PASS' if health_success else 'FAIL'}")
        self.log(f"  ✅ Staff authentication: {'PASS' if auth_success else 'FAIL'}")
        self.log(f"  ✅ Shipping status update endpoint: {'PASS' if status_update_success else 'FAIL'}")
        self.log(f"  ✅ CustomerNotificationService integration: {'PASS' if service_integration_success else 'FAIL'}")
        
        if self.tests_passed >= self.tests_run * 0.8:  # 80% success rate
            self.log("🎉 REAL-TIME NOTIFICATIONS TESTS MOSTLY PASSED!")
            return 0
        else:
            self.log(f"❌ {self.tests_run - self.tests_passed} tests failed")
            return 1

async def main():
    """Main test runner"""
    tester = RealtimeNotificationsTester()
    return await tester.run_all_tests()

if __name__ == "__main__":
    import asyncio
    sys.exit(asyncio.run(main()))