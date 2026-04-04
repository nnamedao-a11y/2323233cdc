#!/usr/bin/env python3
"""
BIBI Cars CRM - Backend API Tests
Testing P1 modules: Payments (Stripe), Contracts (e-signature), Shipping (tracking), Tasks (1 active rule), Ringostat (calls)
Testing P2 modules: Telegram Alerts, Advanced Analytics, Risk/Abuse Control
Testing P3 modules: DocuSign Integration (mock mode), Team Lead Login Approval
"""

import requests
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional

class BIBICRMAPITester:
    def __init__(self, base_url="https://vin-core-layer.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'BIBI-CRM-Test-Client/1.0'
        })
        self.created_ids = {}

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

    def test_payments_packages(self) -> bool:
        """Test get payment packages"""
        self.log("\n=== TESTING PAYMENT PACKAGES ===")
        success, response = self.run_test(
            "Get Payment Packages",
            "GET",
            "payments/packages",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Available Packages: {len(response)}")
                for pkg in response:
                    self.log(f"    - {pkg.get('id')}: {pkg.get('description')} - ${pkg.get('amount')}")
            else:
                self.log(f"  Unexpected response format: {type(response)}")
            
        return success

    def test_create_invoice(self) -> str:
        """Test creating an invoice"""
        self.log("\n=== TESTING CREATE INVOICE ===")
        test_customer_id = f"test_customer_{int(time.time())}"
        success, response = self.run_test(
            "Create Invoice",
            "POST",
            "invoices/create",
            201,
            data={
                "customerId": test_customer_id,
                "customerEmail": "test@example.com",
                "type": "deposit",
                "amount": 500,
                "description": "Test deposit invoice"
            }
        )
        
        if success:
            invoice_id = response.get('id')
            self.log(f"  Invoice ID: {invoice_id}")
            self.log(f"  Amount: ${response.get('amount')}")
            self.log(f"  Status: {response.get('status')}")
            self.log(f"  Type: {response.get('type')}")
            self.created_ids['invoice'] = invoice_id
            return invoice_id
        
        return None

    def test_create_invoice_from_package(self) -> str:
        """Test creating invoice from package"""
        self.log("\n=== TESTING CREATE INVOICE FROM PACKAGE ===")
        test_customer_id = f"test_customer_{int(time.time())}"
        success, response = self.run_test(
            "Create Invoice from Package",
            "POST",
            "invoices/create-from-package",
            201,
            data={
                "packageId": "deposit_500",
                "customerId": test_customer_id,
                "customerEmail": "test@example.com"
            }
        )
        
        if success:
            invoice_id = response.get('id')
            self.log(f"  Invoice ID: {invoice_id}")
            self.log(f"  Amount: ${response.get('amount')}")
            self.log(f"  Package: {response.get('metadata', {}).get('packageId')}")
            return invoice_id
        
        return None

    def test_get_user_invoices(self) -> bool:
        """Test get user invoices"""
        self.log("\n=== TESTING GET USER INVOICES ===")
        success, response = self.run_test(
            "Get User Invoices",
            "GET",
            "invoices/me",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  User Invoices: {len(response)}")
                if response:
                    first_invoice = response[0]
                    self.log(f"    First Invoice: {first_invoice.get('id')} - ${first_invoice.get('amount')}")
            else:
                self.log(f"  Unexpected response format: {type(response)}")
            
        return success

    def test_create_contract(self) -> str:
        """Test creating a contract"""
        self.log("\n=== TESTING CREATE CONTRACT ===")
        test_customer_id = f"test_customer_{int(time.time())}"
        success, response = self.run_test(
            "Create Contract",
            "POST",
            "contracts/create",
            201,
            data={
                "customerId": test_customer_id,
                "customerEmail": "test@example.com",
                "type": "purchase_agreement",
                "title": "Test Vehicle Purchase Agreement",
                "vin": "1HGBH41JXMN123456",
                "vehicleTitle": "2023 Honda Accord",
                "price": 25000
            }
        )
        
        if success:
            contract_id = response.get('id')
            self.log(f"  Contract ID: {contract_id}")
            self.log(f"  Title: {response.get('title')}")
            self.log(f"  Status: {response.get('status')}")
            self.log(f"  Price: ${response.get('price')}")
            self.created_ids['contract'] = contract_id
            return contract_id
        
        return None

    def test_get_user_contracts(self) -> bool:
        """Test get user contracts"""
        self.log("\n=== TESTING GET USER CONTRACTS ===")
        success, response = self.run_test(
            "Get User Contracts",
            "GET",
            "contracts/me",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  User Contracts: {len(response)}")
                if response:
                    first_contract = response[0]
                    self.log(f"    First Contract: {first_contract.get('title')} - {first_contract.get('status')}")
            else:
                self.log(f"  Unexpected response format: {type(response)}")
            
        return success

    def test_create_shipment(self) -> str:
        """Test creating a shipment"""
        self.log("\n=== TESTING CREATE SHIPMENT ===")
        test_customer_id = f"test_customer_{int(time.time())}"
        success, response = self.run_test(
            "Create Shipment",
            "POST",
            "shipping/create",
            201,
            data={
                "customerId": test_customer_id,
                "customerEmail": "test@example.com",
                "vin": "1HGBH41JXMN123456",
                "vehicleTitle": "2023 Honda Accord",
                "originPort": "Los Angeles, CA",
                "destinationPort": "Odessa, Ukraine",
                "containerNumber": "TCLU1234567"
            }
        )
        
        if success:
            shipment_id = response.get('id')
            self.log(f"  Shipment ID: {shipment_id}")
            self.log(f"  VIN: {response.get('vin')}")
            self.log(f"  Status: {response.get('status')}")
            self.log(f"  Container: {response.get('containerNumber')}")
            self.created_ids['shipment'] = shipment_id
            return shipment_id
        
        return None

    def test_get_user_shipments(self) -> bool:
        """Test get user shipments"""
        self.log("\n=== TESTING GET USER SHIPMENTS ===")
        success, response = self.run_test(
            "Get User Shipments",
            "GET",
            "shipping/me",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  User Shipments: {len(response)}")
                if response:
                    first_shipment = response[0]
                    self.log(f"    First Shipment: {first_shipment.get('vin')} - {first_shipment.get('status')}")
            else:
                self.log(f"  Unexpected response format: {type(response)}")
            
        return success

    def test_get_active_shipments(self) -> bool:
        """Test get active shipments (admin)"""
        self.log("\n=== TESTING GET ACTIVE SHIPMENTS (ADMIN) ===")
        success, response = self.run_test(
            "Get Active Shipments",
            "GET",
            "admin/shipping/active",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Active Shipments: {len(response)}")
                if response:
                    first_shipment = response[0]
                    self.log(f"    First Active: {first_shipment.get('vin')} - {first_shipment.get('status')}")
            else:
                self.log(f"  Unexpected response format: {type(response)}")
            
        return success

    def test_ringostat_webhook(self) -> bool:
        """Test Ringostat webhook"""
        self.log("\n=== TESTING RINGOSTAT WEBHOOK ===")
        success, response = self.run_test(
            "Ringostat Webhook",
            "POST",
            "ringostat/webhook",
            201,  # Changed from 200 to 201
            data={
                "event": "call_started",
                "call_id": f"test_call_{int(time.time())}",
                "direction": "inbound",
                "caller_phone": "+380123456789",
                "receiver_phone": "+380987654321",
                "started_at": datetime.now().isoformat()
            }
        )
        
        if success:
            self.log(f"  Webhook Status: {response.get('status')}")
            self.log(f"  Call ID: {response.get('callId')}")
            
        return success

    def test_get_call_board(self) -> bool:
        """Test get call board"""
        self.log("\n=== TESTING GET CALL BOARD ===")
        success, response = self.run_test(
            "Get Call Board",
            "GET",
            "calls/board",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Call Board Items: {len(response)}")
                if response:
                    first_call = response[0]
                    self.log(f"    First Call: {first_call.get('callerPhone')} - {first_call.get('status')}")
            else:
                self.log(f"  Unexpected response format: {type(response)}")
            
        return success

    def test_get_task_queue(self) -> bool:
        """Test get task queue"""
        self.log("\n=== TESTING GET TASK QUEUE ===")
        success, response = self.run_test(
            "Get Task Queue",
            "GET",
            "tasks/queue",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Task Queue Items: {len(response)}")
                if response:
                    first_task = response[0]
                    self.log(f"    First Task: {first_task.get('title')} - {first_task.get('status')}")
                    self.log(f"    Is Locked: {first_task.get('isLocked')}")
                    self.log(f"    Is Active: {first_task.get('isActive')}")
            else:
                self.log(f"  Unexpected response format: {type(response)}")
            
        return success

    def test_start_task(self) -> bool:
        """Test start task (1 active rule)"""
        self.log("\n=== TESTING START TASK (1 ACTIVE RULE) ===")
        
        # First create a test task
        success, response = self.run_test(
            "Create Test Task",
            "POST",
            "tasks",
            201,
            data={
                "title": "Test Task for Start",
                "description": "Testing 1 active task rule",
                "priority": "medium",
                "assignedTo": "admin_user_id",
                "dueDate": "2024-12-31T23:59:59Z"
            }
        )
        
        if not success:
            self.log("  Failed to create test task")
            return False
            
        task_id = response.get('id')
        if not task_id:
            self.log("  No task ID returned")
            return False
            
        # Now try to start the task
        success, response = self.run_test(
            "Start Task",
            "POST",
            f"tasks/{task_id}/start",
            201  # Changed from 200 to 201
        )
        
        if success:
            self.log(f"  Task Started: {response.get('title')}")
            self.log(f"  Status: {response.get('status')}")
            
        return success

    # === P2 FEATURES: ANALYTICS ===

    def test_analytics_daily(self) -> bool:
        """Test daily analytics summary"""
        self.log("\n=== TESTING ANALYTICS DAILY SUMMARY ===")
        success, response = self.run_test(
            "Daily Analytics Summary",
            "GET",
            "analytics/daily",
            200
        )
        
        if success:
            self.log(f"  Date: {response.get('date')}")
            self.log(f"  New Leads: {response.get('newLeads', 0)}")
            self.log(f"  Hot Leads: {response.get('hotLeads', 0)}")
            self.log(f"  Calls: {response.get('calls', 0)}")
            self.log(f"  Call Answer Rate: {response.get('callAnswerRate', 0)}%")
            self.log(f"  Revenue: ${response.get('revenue', 0)}")
            
        return success

    def test_analytics_owner(self) -> bool:
        """Test owner analytics"""
        self.log("\n=== TESTING OWNER ANALYTICS ===")
        success, response = self.run_test(
            "Owner Analytics",
            "GET",
            "analytics/owner?period=7",
            200
        )
        
        if success:
            self.log(f"  Period: {response.get('periodDays')} days")
            funnel = response.get('funnel', {})
            self.log(f"  Leads: {funnel.get('leads', 0)}")
            self.log(f"  Contacted: {funnel.get('contacted', 0)}")
            self.log(f"  Qualified: {funnel.get('qualified', 0)}")
            self.log(f"  Lead to Contact Rate: {funnel.get('leadToContactRate', 0)}%")
            
            revenue = response.get('revenue', {})
            self.log(f"  Total Revenue: ${revenue.get('total', 0)}")
            self.log(f"  Avg Deal Size: ${revenue.get('avgDealSize', 0)}")
            
        return success

    def test_analytics_funnel(self) -> bool:
        """Test conversion funnel analytics"""
        self.log("\n=== TESTING CONVERSION FUNNEL ===")
        success, response = self.run_test(
            "Conversion Funnel",
            "GET",
            "analytics/funnel?period=30",
            200
        )
        
        if success:
            self.log(f"  Leads: {response.get('leads', 0)}")
            self.log(f"  Contacted: {response.get('contacted', 0)}")
            self.log(f"  Carfax Requested: {response.get('carfaxRequested', 0)}")
            self.log(f"  Contracts Signed: {response.get('contractsSigned', 0)}")
            self.log(f"  Invoices Paid: {response.get('invoicesPaid', 0)}")
            self.log(f"  Delivered: {response.get('delivered', 0)}")
            
        return success

    # === P2 FEATURES: ALERTS ===

    def test_alerts_stats(self) -> bool:
        """Test alert statistics"""
        self.log("\n=== TESTING ALERT STATISTICS ===")
        success, response = self.run_test(
            "Alert Statistics",
            "GET",
            "admin/alerts/stats?period=7",
            200
        )
        
        if success:
            self.log(f"  Total Alerts: {response.get('total', 0)}")
            self.log(f"  Sent: {response.get('sent', 0)}")
            self.log(f"  Failed: {response.get('failed', 0)}")
            self.log(f"  Period: {response.get('periodDays', 0)} days")
            
            by_type = response.get('byType', {})
            if by_type:
                self.log(f"  Top Alert Types:")
                for alert_type, count in list(by_type.items())[:3]:
                    self.log(f"    - {alert_type}: {count}")
            
        return success

    def test_alerts_logs(self) -> bool:
        """Test alert logs"""
        self.log("\n=== TESTING ALERT LOGS ===")
        success, response = self.run_test(
            "Alert Logs",
            "GET",
            "admin/alerts/logs?limit=10",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Alert Logs: {len(response)}")
                if response:
                    first_log = response[0]
                    self.log(f"    Latest: {first_log.get('eventType')} - {first_log.get('title')}")
                    self.log(f"    Sent: {first_log.get('sent')}")
            else:
                self.log(f"  Unexpected response format: {type(response)}")
            
        return success

    def test_alerts_settings_update(self) -> bool:
        """Test updating alert settings"""
        self.log("\n=== TESTING ALERT SETTINGS UPDATE ===")
        success, response = self.run_test(
            "Update Alert Settings",
            "PATCH",
            "alerts/settings",
            200,
            data={
                "telegramEnabled": True,
                "receiveCritical": True,
                "receiveHigh": True,
                "receiveMedium": False,
                "receiveLow": False
            }
        )
        
        if success:
            self.log(f"  Telegram Enabled: {response.get('telegramEnabled')}")
            self.log(f"  Receive Critical: {response.get('receiveCritical')}")
            self.log(f"  Receive High: {response.get('receiveHigh')}")
            
        return success

    def test_alerts_link_telegram(self) -> bool:
        """Test linking Telegram account"""
        self.log("\n=== TESTING TELEGRAM LINK ===")
        test_chat_id = f"test_chat_{int(time.time())}"
        success, response = self.run_test(
            "Link Telegram Account",
            "POST",
            "alerts/link-telegram",
            201,  # Changed from 200 to 201
            data={
                "telegramChatId": test_chat_id
            }
        )
        
        if success:
            self.log(f"  Telegram Chat ID: {response.get('telegramChatId')}")
            self.log(f"  Telegram Enabled: {response.get('telegramEnabled')}")
            
        return success

    # === P2 FEATURES: RISK CONTROL ===

    def test_risk_user_assessment(self) -> bool:
        """Test user risk assessment"""
        self.log("\n=== TESTING USER RISK ASSESSMENT ===")
        test_user_id = f"test_user_{int(time.time())}"
        success, response = self.run_test(
            "User Risk Assessment",
            "GET",
            f"risk/user/{test_user_id}",
            200
        )
        
        if success:
            self.log(f"  Entity ID: {response.get('entityId')}")
            self.log(f"  Risk Score: {response.get('riskScore', 0)}")
            self.log(f"  Risk Level: {response.get('riskLevel')}")
            
            factors = response.get('factors', [])
            if factors:
                self.log(f"  Risk Factors: {len(factors)}")
                for factor in factors[:3]:
                    self.log(f"    - {factor.get('name')}: {factor.get('weight')} ({factor.get('description')})")
            
            recommendations = response.get('recommendations', [])
            if recommendations:
                self.log(f"  Recommendations: {len(recommendations)}")
                for rec in recommendations[:2]:
                    self.log(f"    - {rec}")
            
        return success

    def test_risk_manager_assessment(self) -> bool:
        """Test manager risk assessment"""
        self.log("\n=== TESTING MANAGER RISK ASSESSMENT ===")
        test_manager_id = f"test_manager_{int(time.time())}"
        success, response = self.run_test(
            "Manager Risk Assessment",
            "GET",
            f"risk/manager/{test_manager_id}",
            200
        )
        
        if success:
            self.log(f"  Entity ID: {response.get('entityId')}")
            self.log(f"  Risk Score: {response.get('riskScore', 0)}")
            self.log(f"  Risk Level: {response.get('riskLevel')}")
            
            factors = response.get('factors', [])
            if factors:
                self.log(f"  Risk Factors: {len(factors)}")
                for factor in factors[:3]:
                    self.log(f"    - {factor.get('name')}: {factor.get('weight')} ({factor.get('description')})")
            
        return success

    def test_risk_daily_check(self) -> bool:
        """Test daily risk assessment"""
        self.log("\n=== TESTING DAILY RISK CHECK ===")
        success, response = self.run_test(
            "Daily Risk Check",
            "POST",
            "risk/daily-check",
            201  # Changed from 200 to 201
        )
        
        if success:
            self.log(f"  Managers Assessed: {response.get('managersAssessed', 0)}")
            self.log(f"  High Risk Managers: {response.get('highRiskManagers', 0)}")
            self.log(f"  Customers Assessed: {response.get('customersAssessed', 0)}")
            self.log(f"  High Risk Customers: {response.get('highRiskCustomers', 0)}")
            
        return success

    # === P2 FEATURES: TELEGRAM BOT ===

    # === P3 FEATURES: DOCUSIGN INTEGRATION ===

    def test_docusign_oauth_consent(self) -> bool:
        """Test DocuSign OAuth consent URL endpoint"""
        self.log("\n=== TESTING DOCUSIGN OAUTH CONSENT URL ===")
        success, response = self.run_test(
            "DocuSign OAuth Consent URL",
            "GET",
            "docusign/oauth/consent",
            200
        )
        
        if success:
            consent_url = response.get('consentUrl')
            if consent_url and 'docusign' in consent_url.lower():
                self.log(f"  ✅ Valid consent URL: {consent_url[:50]}...")
                self.log(f"  Message: {response.get('message')}")
                instructions = response.get('instructions', [])
                self.log(f"  Instructions provided: {len(instructions)}")
                return True
            else:
                self.log(f"  ❌ Invalid consent URL: {consent_url}")
                return False
            
        return False

    def test_docusign_config(self) -> bool:
        """Test DocuSign configuration status"""
        self.log("\n=== TESTING DOCUSIGN CONFIG ===")
        success, response = self.run_test(
            "DocuSign Config Status",
            "GET",
            "docusign/config",
            200
        )
        
        if success:
            self.log(f"  Configured: {response.get('configured')}")
            self.log(f"  Mode: {response.get('mode')}")
            self.log(f"  Base URL: {response.get('baseUrl')}")
            self.log(f"  Account ID: {response.get('accountId')}")
            consent_url = response.get('consentUrl')
            if consent_url:
                self.log(f"  Consent URL available: {consent_url[:50]}...")
            
        return success

    def test_docusign_create_envelope(self) -> str:
        """Test creating DocuSign envelope (mock mode)"""
        self.log("\n=== TESTING DOCUSIGN CREATE ENVELOPE ===")
        test_customer_id = f"test_customer_{int(time.time())}"
        
        # Create a simple base64 PDF for testing
        import base64
        test_pdf_content = b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n/Contents 4 0 R\n>>\nendobj\n4 0 obj\n<<\n/Length 44\n>>\nstream\nBT\n/F1 12 Tf\n100 700 Td\n(Test Contract) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000206 00000 n \ntrailer\n<<\n/Size 5\n/Root 1 0 R\n>>\nstartxref\n299\n%%EOF"
        test_pdf_base64 = base64.b64encode(test_pdf_content).decode('utf-8')
        
        success, response = self.run_test(
            "Create DocuSign Envelope",
            "POST",
            "docusign/envelopes/create",
            201,
            data={
                "contractId": f"contract_{int(time.time())}",
                "userId": test_customer_id,
                "email": "test@example.com",
                "fullName": "Test Customer",
                "pdfBase64": test_pdf_base64,
                "fileName": "test_contract.pdf",
                "emailSubject": "Test Contract Signing"
            }
        )
        
        if success:
            envelope_id = response.get('envelopeId')
            self.log(f"  Envelope ID: {envelope_id}")
            self.log(f"  Status: {response.get('status')}")
            self.log(f"  Email: {response.get('email')}")
            self.created_ids['envelope'] = envelope_id
            return envelope_id
        
        return None

    def test_docusign_signing_url(self) -> bool:
        """Test generating DocuSign signing URL"""
        self.log("\n=== TESTING DOCUSIGN SIGNING URL ===")
        
        # Use envelope created in previous test
        envelope_id = self.created_ids.get('envelope')
        if not envelope_id:
            self.log("  No envelope ID available - skipping test")
            return False
            
        success, response = self.run_test(
            "Generate Signing URL",
            "POST",
            f"docusign/envelopes/{envelope_id}/sign",
            201,  # Fixed: endpoint returns 201, not 200
            data={
                "email": "test@example.com",
                "fullName": "Test Customer",
                "clientUserId": f"client_{int(time.time())}",
                "returnUrl": "https://example.com/return"
            }
        )
        
        if success:
            self.log(f"  Signing URL: {response.get('signingUrl')[:50]}...")
            
        return success

    def test_docusign_envelope_status(self) -> bool:
        """Test getting DocuSign envelope status"""
        self.log("\n=== TESTING DOCUSIGN ENVELOPE STATUS ===")
        
        # Use envelope created in previous test
        envelope_id = self.created_ids.get('envelope')
        if not envelope_id:
            self.log("  No envelope ID available - skipping test")
            return False
            
        success, response = self.run_test(
            "Get Envelope Status",
            "GET",
            f"docusign/envelopes/{envelope_id}/status",
            200
        )
        
        if success:
            self.log(f"  Envelope ID: {response.get('envelopeId')}")
            self.log(f"  Status: {response.get('status')}")
            self.log(f"  Completed At: {response.get('completedAt')}")
            
        return success

    # === P3 FEATURES: LOGIN APPROVAL ===

    def test_login_approval_request(self) -> str:
        """Test creating login approval request"""
        self.log("\n=== TESTING LOGIN APPROVAL REQUEST ===")
        test_user_id = f"teamlead_{int(time.time())}"
        
        success, response = self.run_test(
            "Create Login Approval Request",
            "POST",
            "login-approval/request",
            201,
            data={
                "userId": test_user_id,
                "userName": "Test Team Lead",
                "userEmail": "teamlead@example.com"
            }
        )
        
        if success:
            request_id = response.get('id')
            self.log(f"  Request ID: {request_id}")
            self.log(f"  User Name: {response.get('userName')}")
            self.log(f"  Status: {response.get('status')}")
            self.log(f"  Expires At: {response.get('expiresAt')}")
            self.created_ids['login_request'] = request_id
            return request_id
        
        return None

    def test_login_approval_status(self) -> bool:
        """Test getting login approval request status"""
        self.log("\n=== TESTING LOGIN APPROVAL STATUS ===")
        
        # Use request created in previous test
        request_id = self.created_ids.get('login_request')
        if not request_id:
            self.log("  No request ID available - skipping test")
            return False
            
        success, response = self.run_test(
            "Get Request Status",
            "GET",
            f"login-approval/{request_id}/status",
            200
        )
        
        if success:
            self.log(f"  Request ID: {response.get('id')}")
            self.log(f"  Status: {response.get('status')}")
            self.log(f"  User Name: {response.get('userName')}")
            self.log(f"  Created At: {response.get('createdAt')}")
            
        return success

    def test_login_approval_pending(self) -> bool:
        """Test getting all pending login approval requests"""
        self.log("\n=== TESTING PENDING LOGIN APPROVALS ===")
        
        success, response = self.run_test(
            "Get Pending Requests",
            "GET",
            "login-approval/pending",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Pending Requests: {len(response)}")
                if response:
                    first_request = response[0]
                    self.log(f"    First Request: {first_request.get('userName')} - {first_request.get('status')}")
            else:
                self.log(f"  Unexpected response format: {type(response)}")
            
        return success

    def test_login_approval_approve(self) -> bool:
        """Test approving login request"""
        self.log("\n=== TESTING LOGIN APPROVAL APPROVE ===")
        
        # Use request created in previous test
        request_id = self.created_ids.get('login_request')
        if not request_id:
            self.log("  No request ID available - skipping test")
            return False
            
        success, response = self.run_test(
            "Approve Login Request",
            "POST",
            f"login-approval/{request_id}/approve",
            200,
            data={
                "approverId": "admin_user_id",
                "approverName": "Test Admin"
            }
        )
        
        if success:
            self.log(f"  Request ID: {response.get('id')}")
            self.log(f"  Status: {response.get('status')}")
            self.log(f"  Approved By: {response.get('approverName')}")
            self.log(f"  Approved At: {response.get('approvedAt')}")
            
        return success

    def test_login_approval_deny(self) -> bool:
        """Test denying login request (create new one first)"""
        self.log("\n=== TESTING LOGIN APPROVAL DENY ===")
        
        # Create a new request to deny
        test_user_id = f"teamlead_deny_{int(time.time())}"
        success, response = self.run_test(
            "Create Request to Deny",
            "POST",
            "login-approval/request",
            201,
            data={
                "userId": test_user_id,
                "userName": "Test Team Lead Deny",
                "userEmail": "teamlead_deny@example.com"
            }
        )
        
        if not success:
            self.log("  Failed to create request for deny test")
            return False
            
        request_id = response.get('id')
        if not request_id:
            self.log("  No request ID returned")
            return False
            
        # Now deny the request
        success, response = self.run_test(
            "Deny Login Request",
            "POST",
            f"login-approval/{request_id}/deny",
            200,
            data={
                "denierId": "admin_user_id",
                "reason": "Test denial"
            }
        )
        
        if success:
            self.log(f"  Request ID: {response.get('id')}")
            self.log(f"  Status: {response.get('status')}")
            self.log(f"  Denied At: {response.get('deniedAt')}")
            self.log(f"  Deny Reason: {response.get('denyReason')}")
            
        return success

    def test_telegram_bot_connection(self) -> bool:
        self.log("\n=== TESTING TELEGRAM BOT CONNECTION ===")
        
        # Test the Telegram Bot API directly
        import requests as req
        telegram_token = "7757775952:AAFTqDABFhTuOsaDlhFh2noUsqc4QPGFaGE"
        
        try:
            response = req.get(f"https://api.telegram.org/bot{telegram_token}/getMe", timeout=10)
            
            if response.status_code == 200:
                bot_info = response.json()
                if bot_info.get('ok'):
                    result = bot_info.get('result', {})
                    self.log(f"  ✅ Telegram Bot Connected")
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

    # === P3 STABILITY LAYER TESTS ===
    
    def test_integrations_health(self) -> bool:
        """Test /api/admin/integrations/health - returns all provider statuses"""
        self.log("\n=== TESTING INTEGRATIONS HEALTH ===")
        success, response = self.run_test(
            "Integrations Health Check",
            "GET",
            "admin/integrations/health",
            200
        )
        
        if success:
            self.log(f"  Health Summary: {len(response)} providers")
            for provider, status in response.items():
                self.log(f"    {provider}: {status.get('status')} (enabled: {status.get('isEnabled')})")
                if status.get('error'):
                    self.log(f"      Error: {status.get('error')}")
            
        return success

    def test_list_integrations(self) -> bool:
        """Test /api/admin/integrations - list all integrations including new providers"""
        self.log("\n=== TESTING LIST INTEGRATIONS ===")
        success, response = self.run_test(
            "List All Integrations",
            "GET",
            "admin/integrations",
            200
        )
        
        # Expected providers including new ones
        expected_providers = [
            'stripe', 'docusign', 'ringostat', 'telegram', 'viber', 'twilio',
            'email', 'shipping', 'openai', 'whatsapp', 'searates', 'shipsgo',
            'meta_ads', 'facebook_capi', 'one_c', 'pna', 'contract_template'
        ]
        
        if success:
            if isinstance(response, list):
                self.log(f"  Total Integrations: {len(response)}")
                found_providers = []
                for integration in response:
                    provider = integration.get('provider')
                    enabled = integration.get('isEnabled')
                    mode = integration.get('mode')
                    found_providers.append(provider)
                    self.log(f"    {provider}: {mode} (enabled: {enabled})")
                
                # Check if all expected providers are present
                missing_providers = set(expected_providers) - set(found_providers)
                if missing_providers:
                    self.log(f"  ❌ Missing providers: {missing_providers}")
                    return False
                else:
                    self.log(f"  ✅ All {len(expected_providers)} expected providers found")
                    
                # Check for new providers specifically
                new_providers = ['meta_ads', 'facebook_capi', 'one_c', 'pna', 'contract_template']
                found_new = [p for p in found_providers if p in new_providers]
                self.log(f"  New providers found: {found_new}")
                
            else:
                self.log(f"  Unexpected response format: {type(response)}")
                return False
            
        return success

    def test_stripe_connection(self) -> bool:
        """Test /api/admin/integrations/stripe/test - test Stripe connection"""
        self.log("\n=== TESTING STRIPE CONNECTION ===")
        success, response = self.run_test(
            "Test Stripe Connection",
            "POST",
            "admin/integrations/stripe/test",
            201
        )
        
        if success:
            self.log(f"  Success: {response.get('success')}")
            self.log(f"  Message: {response.get('message')}")
            if response.get('latencyMs'):
                self.log(f"  Latency: {response.get('latencyMs')}ms")
            
        return success

    def test_telegram_connection(self) -> bool:
        """Test /api/admin/integrations/telegram/test - test Telegram connection"""
        self.log("\n=== TESTING TELEGRAM CONNECTION ===")
        success, response = self.run_test(
            "Test Telegram Connection",
            "POST",
            "admin/integrations/telegram/test",
            201
        )
        
        if success:
            self.log(f"  Success: {response.get('success')}")
            self.log(f"  Message: {response.get('message')}")
            if response.get('latencyMs'):
                self.log(f"  Latency: {response.get('latencyMs')}ms")
            
        return success

    def test_new_integration_providers(self) -> bool:
        """Test new integration providers (meta_ads, facebook_capi, one_c, pna, contract_template)"""
        self.log("\n=== TESTING NEW INTEGRATION PROVIDERS ===")
        
        new_providers = ['meta_ads', 'facebook_capi', 'one_c', 'pna', 'contract_template']
        all_success = True
        
        for provider in new_providers:
            self.log(f"\n  Testing {provider} connection...")
            success, response = self.run_test(
                f"Test {provider} Connection",
                "POST",
                f"admin/integrations/{provider}/test",
                201
            )
            
            if success:
                self.log(f"    ✅ {provider}: {response.get('message')}")
                self.log(f"    Success: {response.get('success')}")
                if response.get('latencyMs'):
                    self.log(f"    Latency: {response.get('latencyMs')}ms")
            else:
                self.log(f"    ❌ {provider} test failed")
                all_success = False
        
        return all_success
        """Test PATCH /api/admin/integrations/telegram - update config"""
        self.log("\n=== TESTING UPDATE TELEGRAM CONFIG ===")
        success, response = self.run_test(
            "Update Telegram Config",
            "PATCH",
            "admin/integrations/telegram",
            200,
            data={
                "credentials": {
                    "botToken": "test_token_123",
                    "ownerChatId": "123456789"
                },
                "mode": "sandbox",
                "isEnabled": True
            }
        )
        
        if success:
            self.log(f"  Provider: {response.get('provider')}")
            self.log(f"  Mode: {response.get('mode')}")
            self.log(f"  Enabled: {response.get('isEnabled')}")
            self.log(f"  Updated By: {response.get('updatedBy')}")
            
        return success

    def test_session_management(self) -> bool:
        """Test /api/admin/sessions - session management endpoints"""
        self.log("\n=== TESTING SESSION MANAGEMENT ===")
        success, response = self.run_test(
            "Get All Sessions",
            "GET",
            "admin/sessions",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Total Sessions: {len(response)}")
                if response:
                    first_session = response[0]
                    self.log(f"    First Session: {first_session.get('email')} - {first_session.get('isActive')}")
                    self.log(f"    IP: {first_session.get('ip')}")
                    self.log(f"    Browser: {first_session.get('browser')}")
            else:
                self.log(f"  Unexpected response format: {type(response)}")
            
        return success

    def test_session_stats(self) -> bool:
        """Test /api/admin/sessions/stats - session statistics"""
        self.log("\n=== TESTING SESSION STATISTICS ===")
        success, response = self.run_test(
            "Get Session Stats",
            "GET",
            "admin/sessions/stats",
            200
        )
        
        if success:
            self.log(f"  Total Active: {response.get('totalActive', 0)}")
            self.log(f"  Suspicious: {response.get('suspicious', 0)}")
            by_role = response.get('byRole', {})
            if by_role:
                self.log(f"  By Role:")
                for role, count in by_role.items():
                    self.log(f"    {role}: {count}")
            
        return success

    def test_openai_service_health(self) -> bool:
        """Test OpenAI service health status"""
        self.log("\n=== TESTING OPENAI SERVICE HEALTH ===")
        success, response = self.run_test(
            "OpenAI Health Status",
            "GET",
            "admin/integrations/openai/health",
            200
        )
        
        if success:
            self.log(f"  Available: {response.get('isAvailable')}")
            self.log(f"  Enabled: {response.get('isEnabled')}")
            self.log(f"  Last Init: {response.get('lastInitAt')}")
            if response.get('error'):
                self.log(f"  Error: {response.get('error')}")
            
        return success

    def test_ringostat_service_health(self) -> bool:
        """Test Ringostat service health status"""
        self.log("\n=== TESTING RINGOSTAT SERVICE HEALTH ===")
        success, response = self.run_test(
            "Ringostat Health Status",
            "GET",
            "admin/integrations/ringostat/health",
            200
        )
        
        if success:
            self.log(f"  Available: {response.get('isAvailable')}")
            self.log(f"  Enabled: {response.get('isEnabled')}")
            if response.get('error'):
                self.log(f"  Error: {response.get('error')}")
            
        return success

    def test_stripe_webhook_verification(self) -> bool:
        """Test Stripe webhook with proper verification"""
        self.log("\n=== TESTING STRIPE WEBHOOK VERIFICATION ===")
        
        # Test webhook without signature (should fail)
        success, response = self.run_test(
            "Stripe Webhook (No Signature)",
            "POST",
            "payments/webhook",
            400,  # Should fail without signature
            data={
                "type": "checkout.session.completed",
                "data": {
                    "object": {
                        "id": "cs_test_123",
                        "metadata": {
                            "invoiceId": "test_invoice_123"
                        }
                    }
                }
            }
        )
        
        if success:
            self.log(f"  ✅ Webhook properly rejected without signature")
        else:
            self.log(f"  ❌ Webhook should have been rejected")
            
        return success

    def test_stripe_payment_flow(self) -> bool:
        """Test complete Stripe payment flow"""
        self.log("\n=== TESTING STRIPE PAYMENT FLOW ===")
        
        # Step 1: Test payment packages
        self.log("\n  Step 1: Testing payment packages...")
        packages_success = self.test_payments_packages()
        if not packages_success:
            self.log("  ❌ Payment packages test failed")
            return False
        
        # Step 2: Create invoice
        self.log("\n  Step 2: Creating test invoice...")
        test_deal_id = f"deal_{int(time.time())}"
        test_user_id = f"user_{int(time.time())}"
        success, response = self.run_test(
            "Create Invoice for Payment Flow",
            "POST",
            "invoices/create",
            201,
            data={
                "dealId": test_deal_id,
                "userId": test_user_id,
                "managerId": "manager_test",
                "type": "deposit",
                "title": "Test Deposit Payment",
                "description": "Testing Stripe payment flow",
                "amount": 500,
                "currency": "USD",
                "customerName": "Test Customer",
                "customerEmail": "test@example.com"
            }
        )
        
        if not success:
            self.log("  ❌ Invoice creation failed")
            return False
            
        invoice_id = response.get('id')
        if not invoice_id:
            self.log("  ❌ No invoice ID returned")
            return False
            
        self.log(f"  ✅ Invoice created: {invoice_id}")
        
        # Step 3: Create checkout session
        self.log("\n  Step 3: Creating Stripe checkout session...")
        success, response = self.run_test(
            "Create Stripe Checkout Session",
            "POST",
            "invoices/checkout",
            201,
            data={
                "invoiceId": invoice_id,
                "originUrl": "https://vin-core-layer.preview.emergentagent.com"
            }
        )
        
        if not success:
            self.log("  ❌ Checkout session creation failed")
            return False
            
        session_id = response.get('sessionId')
        checkout_url = response.get('url')
        
        if not session_id or not checkout_url:
            self.log("  ❌ Missing session ID or checkout URL")
            return False
            
        self.log(f"  ✅ Checkout session created: {session_id}")
        self.log(f"  ✅ Checkout URL: {checkout_url[:50]}...")
        
        # Step 4: Check checkout status
        self.log("\n  Step 4: Checking checkout session status...")
        success, response = self.run_test(
            "Get Checkout Session Status",
            "GET",
            f"invoices/checkout/{session_id}/status",
            200
        )
        
        if not success:
            self.log("  ❌ Checkout status check failed")
            return False
            
        self.log(f"  ✅ Checkout status: {response.get('status')}")
        self.log(f"  ✅ Payment status: {response.get('paymentStatus')}")
        
        # Step 5: Test Stripe integration
        self.log("\n  Step 5: Testing Stripe integration...")
        success, response = self.run_test(
            "Test Stripe Integration",
            "POST",
            "admin/integrations/stripe/test",
            201
        )
        
        if success:
            self.log(f"  ✅ Stripe integration test: {response.get('message')}")
        else:
            self.log("  ❌ Stripe integration test failed")
            return False
        
        self.log("\n  🎉 STRIPE PAYMENT FLOW COMPLETE")
        return True

    def test_manager_invoices_api(self) -> bool:
        """Test manager invoices API endpoints"""
        self.log("\n=== TESTING MANAGER INVOICES API ===")
        
        # Test get manager invoices
        success, response = self.run_test(
            "Get Manager Invoices",
            "GET",
            "invoices/manager/my",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Manager Invoices: {len(response)}")
                if response:
                    first_invoice = response[0]
                    self.log(f"    First Invoice: {first_invoice.get('title')} - {first_invoice.get('status')}")
            else:
                self.log(f"  Unexpected response format: {type(response)}")
        
        return success

    def test_invoice_operations(self) -> bool:
        """Test invoice send, cancel, mark paid operations"""
        self.log("\n=== TESTING INVOICE OPERATIONS ===")
        
        # Create a test invoice first
        test_deal_id = f"deal_{int(time.time())}"
        test_user_id = f"user_{int(time.time())}"
        success, response = self.run_test(
            "Create Invoice for Operations Test",
            "POST",
            "invoices/create",
            201,
            data={
                "dealId": test_deal_id,
                "userId": test_user_id,
                "managerId": "manager_test",
                "type": "deposit",
                "title": "Test Invoice Operations",
                "description": "Testing send/cancel/mark paid",
                "amount": 300,
                "currency": "USD",
                "customerName": "Test Customer",
                "customerEmail": "test@example.com"
            }
        )
        
        if not success:
            self.log("  ❌ Failed to create test invoice")
            return False
            
        invoice_id = response.get('id')
        
        # Test send invoice
        success, response = self.run_test(
            "Send Invoice",
            "PATCH",
            f"invoices/{invoice_id}/send",
            200
        )
        
        if success:
            self.log(f"  ✅ Invoice sent: {response.get('status')}")
        else:
            self.log("  ❌ Send invoice failed")
            return False
        
        # Test mark as paid
        success, response = self.run_test(
            "Mark Invoice as Paid",
            "PATCH",
            f"invoices/{invoice_id}/mark-paid",
            200
        )
        
        if success:
            self.log(f"  ✅ Invoice marked as paid: {response.get('status')}")
        else:
            self.log("  ❌ Mark as paid failed")
            return False
        
        return True

    def test_blueprint_api(self) -> bool:
        """Test Blueprint API - get all stages and transitions"""
        self.log("\n=== TESTING BLUEPRINT API ===")
        success, response = self.run_test(
            "Get Blueprint Stages and Transitions",
            "GET",
            "blueprint",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Blueprint Transitions: {len(response)}")
                if response:
                    first_transition = response[0]
                    self.log(f"    First Transition: {first_transition.get('fromLabel')} → {first_transition.get('toLabel')}")
                    self.log(f"    Required Fields: {first_transition.get('requiredFields', [])}")
                    self.log(f"    Required Actions: {first_transition.get('requiredActions', [])}")
            elif isinstance(response, dict):
                # Handle dict response format
                self.log(f"  Blueprint Response Keys: {list(response.keys())}")
                if 'transitions' in response:
                    transitions = response['transitions']
                    self.log(f"  Blueprint Transitions: {len(transitions)}")
                    if transitions:
                        first_transition = transitions[0]
                        self.log(f"    First Transition: {first_transition.get('fromLabel')} → {first_transition.get('toLabel')}")
                elif 'stages' in response:
                    stages = response['stages']
                    self.log(f"  Blueprint Stages: {len(stages)}")
                else:
                    self.log(f"  Blueprint data: {response}")
            else:
                self.log(f"  Unexpected response format: {type(response)}")
        
        return success

    def test_deals_move_stage_api(self) -> bool:
        """Test Deals move-stage API"""
        self.log("\n=== TESTING DEALS MOVE-STAGE API ===")
        
        # First create a test deal
        test_lead_id = f"test_lead_{int(time.time())}"
        success, response = self.run_test(
            "Create Test Deal",
            "POST",
            "deals",
            201,
            data={
                "title": "Test Deal for Stage Move",
                "customerId": f"customer_{int(time.time())}",
                "leadId": test_lead_id,
                "vin": "1HGBH41JXMN123456",
                "managerId": "test_manager",
                "value": 25000
            }
        )
        
        if not success:
            self.log("  ❌ Failed to create test deal")
            return False
            
        deal_id = response.get('id')
        if not deal_id:
            self.log("  ❌ No deal ID returned")
            return False
            
        self.log(f"  ✅ Test deal created: {deal_id}")
        
        # Now test moving stage
        success, response = self.run_test(
            "Move Deal Stage",
            "PATCH",
            f"deals/{deal_id}/move-stage",
            200,
            data={
                "to": "CONTACT_ATTEMPT"
            }
        )
        
        if success:
            self.log(f"  ✅ Stage moved to: {response.get('newStage')}")
            self.log(f"  ✅ Stage label: {response.get('newStageLabel')}")
            self.log(f"  ✅ Validation: {response.get('validation', {}).get('ok')}")
        
        return success

    def test_deals_allowed_transitions_api(self) -> bool:
        """Test Deals allowed-transitions API"""
        self.log("\n=== TESTING DEALS ALLOWED-TRANSITIONS API ===")
        
        # First create a test deal
        test_lead_id = f"test_lead_{int(time.time())}"
        success, response = self.run_test(
            "Create Test Deal for Transitions",
            "POST",
            "deals",
            201,
            data={
                "title": "Test Deal for Transitions",
                "customerId": f"customer_{int(time.time())}",
                "leadId": test_lead_id,
                "vin": "1HGBH41JXMN123456",
                "managerId": "test_manager",
                "value": 25000
            }
        )
        
        if not success:
            self.log("  ❌ Failed to create test deal")
            return False
            
        deal_id = response.get('id')
        if not deal_id:
            self.log("  ❌ No deal ID returned")
            return False
            
        # Now test getting allowed transitions
        success, response = self.run_test(
            "Get Allowed Transitions",
            "GET",
            f"deals/{deal_id}/allowed-transitions",
            200
        )
        
        if success:
            current = response.get('current', {})
            transitions = response.get('transitions', [])
            self.log(f"  ✅ Current stage: {current.get('label')} ({current.get('stage')})")
            self.log(f"  ✅ Available transitions: {len(transitions)}")
            
            for transition in transitions[:3]:  # Show first 3
                self.log(f"    - {transition.get('label')}: Can move = {transition.get('canMove')}")
                if transition.get('blockers'):
                    self.log(f"      Blockers: {transition.get('blockers')}")
        
        return success

    def test_routing_rules_api(self) -> bool:
        """Test Routing rules API"""
        self.log("\n=== TESTING ROUTING RULES API ===")
        success, response = self.run_test(
            "Get Routing Rules",
            "GET",
            "routing/rules",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Routing Rules: {len(response)}")
                if response:
                    first_rule = response[0]
                    self.log(f"    First Rule: {first_rule.get('name')}")
                    self.log(f"    Active: {first_rule.get('isActive')}")
                    self.log(f"    Priority: {first_rule.get('priority')}")
                    self.log(f"    Assign To: {first_rule.get('assignToType')} - {first_rule.get('assignToId')}")
            else:
                self.log(f"  Unexpected response format: {type(response)}")
        
        return success

    def test_cadence_definitions_api(self) -> bool:
        """Test Cadence definitions API"""
        self.log("\n=== TESTING CADENCE DEFINITIONS API ===")
        success, response = self.run_test(
            "Get Cadence Definitions",
            "GET",
            "cadence/definitions",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Cadence Definitions: {len(response)}")
                if response:
                    first_cadence = response[0]
                    self.log(f"    First Cadence: {first_cadence.get('name')}")
                    self.log(f"    Code: {first_cadence.get('code')}")
                    self.log(f"    Trigger: {first_cadence.get('triggerEvent')}")
                    self.log(f"    Steps: {len(first_cadence.get('steps', []))}")
                    self.log(f"    Active: {first_cadence.get('isActive')}")
            else:
                self.log(f"  Unexpected response format: {type(response)}")
        
        return success

    def test_scoring_rules_api(self) -> bool:
        """Test Scoring rules API"""
        self.log("\n=== TESTING SCORING RULES API ===")
        success, response = self.run_test(
            "Get Scoring Rules",
            "GET",
            "scoring/rules",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Scoring Rules: {len(response)}")
                if response:
                    first_rule = response[0]
                    self.log(f"    First Rule: {first_rule.get('name')}")
                    self.log(f"    Code: {first_rule.get('code')}")
                    self.log(f"    Score Type: {first_rule.get('scoreType')}")
                    self.log(f"    Points: {first_rule.get('points')}")
                    self.log(f"    Active: {first_rule.get('isActive')}")
                    
                # Count by score type
                score_types = {}
                for rule in response:
                    score_type = rule.get('scoreType', 'unknown')
                    score_types[score_type] = score_types.get(score_type, 0) + 1
                
                self.log(f"  Rules by Score Type:")
                for score_type, count in score_types.items():
                    self.log(f"    - {score_type}: {count}")
            else:
                self.log(f"  Unexpected response format: {type(response)}")
        
        return success

    def test_cadence_runs_api(self) -> bool:
        """Test Cadence runs API"""
        self.log("\n=== TESTING CADENCE RUNS API ===")
        success, response = self.run_test(
            "Get Cadence Runs",
            "GET",
            "cadence/runs",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  Cadence Runs: {len(response)}")
                if response:
                    first_run = response[0]
                    self.log(f"    First Run: {first_run.get('cadenceCode')}")
                    self.log(f"    Status: {first_run.get('status')}")
                    self.log(f"    Entity: {first_run.get('entityType')}:{first_run.get('entityId')}")
                    self.log(f"    Last Step: {first_run.get('lastExecutedStep')}")
            else:
                self.log(f"  Unexpected response format: {type(response)}")
        
        return success

    def run_all_tests(self) -> int:
        """Run all backend API tests focusing on BIBI Cars CRM core features"""
        self.log("🚀 Starting BIBI Cars CRM Core Features Tests")
        self.log(f"Base URL: {self.base_url}")
        
        # Test system health first
        self.test_system_health()
        
        # Test admin login
        login_success = self.test_admin_login()
        
        if not login_success:
            self.log("❌ Admin login failed - cannot proceed with authenticated tests")
            return 1
        
        # === ADMIN CONTROL LAYER TESTS ===
        self.log("\n🟡 TESTING ADMIN CONTROL LAYER")
        
        # Test Routing Rules API
        self.test_routing_rules_api()
        
        # Test Cadence Definitions API
        self.test_cadence_definitions_api()
        
        # Test Scoring Rules API
        self.test_scoring_rules_api()
        
        # Test Cadence runs API
        self.test_cadence_runs_api()
        
        # === CORE BIBI CRM FEATURES ===
        self.log("\n🟡 TESTING BIBI CRM CORE FEATURES")
        
        # Test Blueprint API
        self.test_blueprint_api()
        
        # Test Deals move-stage API
        self.test_deals_move_stage_api()
        
        # Test Deals allowed-transitions API
        self.test_deals_allowed_transitions_api()
        
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
    tester = BIBICRMAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())