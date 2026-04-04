#!/usr/bin/env python3
"""
BIBI Cars CRM - Score Engine, Journey Engine & Owner Dashboard Tests
Testing the new Score Engine, Journey Engine, and Owner Dashboard APIs
"""

import requests
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional

class ScoreJourneyAPITester:
    def __init__(self, base_url="https://vin-core-layer.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'BIBI-CRM-Score-Journey-Test/1.0'
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

    # ═══════════════════════════════════════════════════════════
    # SCORE ENGINE TESTS
    # ═══════════════════════════════════════════════════════════

    def test_score_seed_rules(self) -> bool:
        """Test seeding default score rules"""
        self.log("\n=== TESTING SCORE SEED RULES ===")
        success, response = self.run_test(
            "Seed Score Rules",
            "POST",
            "scoring/seed-rules",
            201
        )
        
        if success:
            self.log(f"  ✅ Seed success: {response.get('success')}")
            self.log(f"  ✅ Message: {response.get('message')}")
            
        return success

    def test_score_rules(self) -> bool:
        """Test getting all score rules (should return 27 rules)"""
        self.log("\n=== TESTING SCORE RULES (EXPECTING 27 RULES) ===")
        success, response = self.run_test(
            "Get All Score Rules",
            "GET",
            "scoring/rules",
            200
        )
        
        if success:
            if isinstance(response, list):
                rule_count = len(response)
                self.log(f"  ✅ Total Rules: {rule_count}")
                
                if rule_count == 27:
                    self.log(f"  ✅ CORRECT: Expected 27 rules, got {rule_count}")
                else:
                    self.log(f"  ⚠️  WARNING: Expected 27 rules, got {rule_count}")
                
                # Group by score type
                by_type = {}
                for rule in response:
                    score_type = rule.get('scoreType', 'unknown')
                    if score_type not in by_type:
                        by_type[score_type] = 0
                    by_type[score_type] += 1
                
                self.log(f"  Rules by type:")
                for score_type, count in by_type.items():
                    self.log(f"    - {score_type}: {count} rules")
                
                # Show sample rules
                if response:
                    first_rule = response[0]
                    self.log(f"  Sample rule: {first_rule.get('name')} ({first_rule.get('code')}) - {first_rule.get('points')} points")
                    
            else:
                self.log(f"  ❌ Unexpected response format: {type(response)}")
                return False
            
        return success

    def test_score_by_entity(self) -> bool:
        """Test getting score by entity"""
        self.log("\n=== TESTING SCORE BY ENTITY ===")
        
        # Test with a sample entity
        test_entity_id = f"test_lead_{int(time.time())}"
        success, response = self.run_test(
            "Get Score by Entity (Lead)",
            "GET",
            f"scoring/lead/{test_entity_id}",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  ✅ Score snapshots: {len(response)}")
                if response:
                    first_score = response[0]
                    self.log(f"    Entity Type: {first_score.get('entityType')}")
                    self.log(f"    Score Type: {first_score.get('scoreType')}")
                    self.log(f"    Value: {first_score.get('value')}")
                    self.log(f"    Band: {first_score.get('band')}")
                else:
                    self.log(f"  ✅ No scores found for test entity (expected for new entity)")
            else:
                self.log(f"  ❌ Unexpected response format: {type(response)}")
                return False
            
        return success

    def test_hot_leads(self) -> bool:
        """Test getting hot leads"""
        self.log("\n=== TESTING HOT LEADS ===")
        success, response = self.run_test(
            "Get Hot Leads",
            "GET",
            "scoring/hot-leads",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  ✅ Hot Leads: {len(response)}")
                if response:
                    first_lead = response[0]
                    self.log(f"    First Hot Lead: {first_lead.get('entityId')} - Score: {first_lead.get('value')} ({first_lead.get('band')})")
                    self.log(f"    Score Type: {first_lead.get('scoreType')}")
                    self.log(f"    Last Calculated: {first_lead.get('lastCalculatedAt')}")
                else:
                    self.log(f"  ✅ No hot leads found (expected if no data)")
            else:
                self.log(f"  ❌ Unexpected response format: {type(response)}")
                return False
            
        return success

    def test_low_health_deals(self) -> bool:
        """Test getting low health deals"""
        self.log("\n=== TESTING LOW HEALTH DEALS ===")
        success, response = self.run_test(
            "Get Low Health Deals",
            "GET",
            "scoring/low-health-deals",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  ✅ Low Health Deals: {len(response)}")
                if response:
                    first_deal = response[0]
                    self.log(f"    First Low Health Deal: {first_deal.get('entityId')} - Health: {first_deal.get('value')} ({first_deal.get('band')})")
                    self.log(f"    Score Type: {first_deal.get('scoreType')}")
                else:
                    self.log(f"  ✅ No low health deals found (expected if no data)")
            else:
                self.log(f"  ❌ Unexpected response format: {type(response)}")
                return False
            
        return success

    def test_critical_shipments(self) -> bool:
        """Test getting critical shipments"""
        self.log("\n=== TESTING CRITICAL SHIPMENTS ===")
        success, response = self.run_test(
            "Get Critical Shipments",
            "GET",
            "scoring/critical-shipments",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  ✅ Critical Shipments: {len(response)}")
                if response:
                    first_shipment = response[0]
                    self.log(f"    First Critical Shipment: {first_shipment.get('entityId')} - Risk: {first_shipment.get('value')} ({first_shipment.get('band')})")
                    self.log(f"    Score Type: {first_shipment.get('scoreType')}")
                else:
                    self.log(f"  ✅ No critical shipments found (expected if no data)")
            else:
                self.log(f"  ❌ Unexpected response format: {type(response)}")
                return False
            
        return success

    def test_top_managers(self) -> bool:
        """Test getting top managers"""
        self.log("\n=== TESTING TOP MANAGERS ===")
        success, response = self.run_test(
            "Get Top Managers",
            "GET",
            "scoring/top-managers",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  ✅ Top Managers: {len(response)}")
                if response:
                    first_manager = response[0]
                    self.log(f"    Top Manager: {first_manager.get('entityId')} - Performance: {first_manager.get('value')} ({first_manager.get('band')})")
                    self.log(f"    Score Type: {first_manager.get('scoreType')}")
                else:
                    self.log(f"  ✅ No top managers found (expected if no data)")
            else:
                self.log(f"  ❌ Unexpected response format: {type(response)}")
                return False
            
        return success

    def test_weak_managers(self) -> bool:
        """Test getting weak managers"""
        self.log("\n=== TESTING WEAK MANAGERS ===")
        success, response = self.run_test(
            "Get Weak Managers",
            "GET",
            "scoring/weak-managers",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  ✅ Weak Managers: {len(response)}")
                if response:
                    first_manager = response[0]
                    self.log(f"    Weak Manager: {first_manager.get('entityId')} - Performance: {first_manager.get('value')} ({first_manager.get('band')})")
                    self.log(f"    Score Type: {first_manager.get('scoreType')}")
                else:
                    self.log(f"  ✅ No weak managers found (expected if no data)")
            else:
                self.log(f"  ❌ Unexpected response format: {type(response)}")
                return False
            
        return success

    # ═══════════════════════════════════════════════════════════
    # JOURNEY ENGINE TESTS
    # ═══════════════════════════════════════════════════════════

    def test_journey_funnel(self) -> bool:
        """Test getting journey funnel analytics"""
        self.log("\n=== TESTING JOURNEY FUNNEL ===")
        success, response = self.run_test(
            "Get Journey Funnel",
            "GET",
            "journey/funnel",
            200
        )
        
        if success:
            self.log(f"  ✅ Period: {response.get('period')}")
            self.log(f"  ✅ Total Deals: {response.get('totalDeals', 0)}")
            self.log(f"  ✅ Delivered: {response.get('delivered', 0)}")
            self.log(f"  ✅ Conversion Rate: {response.get('conversionRate', 0)}%")
            
            funnel = response.get('funnel', {})
            if funnel:
                self.log(f"  Funnel stages:")
                for stage, count in funnel.items():
                    self.log(f"    - {stage}: {count}")
            
            drop_off = response.get('dropOff', [])
            if drop_off:
                self.log(f"  Drop-off analysis:")
                for drop in drop_off[:3]:  # Show first 3
                    self.log(f"    - {drop.get('from')} → {drop.get('to')}: {drop.get('rate')}% ({drop.get('count')} dropped)")
            
        return success

    def test_journey_bottlenecks(self) -> bool:
        """Test getting journey bottlenecks"""
        self.log("\n=== TESTING JOURNEY BOTTLENECKS ===")
        success, response = self.run_test(
            "Get Journey Bottlenecks",
            "GET",
            "journey/bottlenecks",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  ✅ Bottlenecks: {len(response)}")
                if response:
                    for i, bottleneck in enumerate(response[:3]):  # Show top 3
                        self.log(f"    #{i+1}: {bottleneck.get('from')} → {bottleneck.get('to')} ({bottleneck.get('rate')}% drop-off)")
                else:
                    self.log(f"  ✅ No bottlenecks found (expected if no data)")
            else:
                self.log(f"  ❌ Unexpected response format: {type(response)}")
                return False
            
        return success

    def test_journey_timeline(self) -> bool:
        """Test getting journey timeline for entity"""
        self.log("\n=== TESTING JOURNEY TIMELINE ===")
        
        # Test with a sample entity
        test_entity_id = f"test_deal_{int(time.time())}"
        success, response = self.run_test(
            "Get Journey Timeline (Deal)",
            "GET",
            f"journey/deal/{test_entity_id}/timeline",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  ✅ Timeline Events: {len(response)}")
                if response:
                    first_event = response[0]
                    self.log(f"    First Event: {first_event.get('eventType')} - {first_event.get('description', 'No description')}")
                    self.log(f"    Stage: {first_event.get('stage')}")
                    self.log(f"    Created: {first_event.get('createdAt')}")
                else:
                    self.log(f"  ✅ No timeline events found for test entity (expected for new entity)")
            else:
                self.log(f"  ❌ Unexpected response format: {type(response)}")
                return False
            
        return success

    # ═══════════════════════════════════════════════════════════
    # OWNER DASHBOARD TESTS
    # ═══════════════════════════════════════════════════════════

    def test_owner_dashboard(self) -> bool:
        """Test getting owner dashboard"""
        self.log("\n=== TESTING OWNER DASHBOARD ===")
        success, response = self.run_test(
            "Get Owner Dashboard",
            "GET",
            "owner-dashboard",
            200
        )
        
        if success:
            # Test funnel data
            funnel = response.get('funnel', {})
            self.log(f"  ✅ Funnel Data:")
            self.log(f"    - Leads Created: {funnel.get('leadsCreated', 0)}")
            self.log(f"    - Contacted: {funnel.get('contacted', 0)}")
            self.log(f"    - Deals Created: {funnel.get('dealsCreated', 0)}")
            self.log(f"    - Contracts Signed: {funnel.get('contractsSigned', 0)}")
            self.log(f"    - Payments Done: {funnel.get('paymentsDone', 0)}")
            self.log(f"    - Shipments Delivered: {funnel.get('shipmentsDelivered', 0)}")
            
            # Test money data
            money = response.get('money', {})
            self.log(f"  ✅ Money Data:")
            self.log(f"    - Total Paid: ${money.get('totalPaid', 0)}")
            self.log(f"    - Total Unpaid: ${money.get('totalUnpaid', 0)}")
            self.log(f"    - Overdue Amount: ${money.get('overdueAmount', 0)}")
            self.log(f"    - Avg Deal Value: ${money.get('avgDealValue', 0)}")
            self.log(f"    - Revenue This Month: ${money.get('revenueThisMonth', 0)}")
            
            # Test operations data
            operations = response.get('operations', {})
            self.log(f"  ✅ Operations Data:")
            self.log(f"    - Active Deals: {operations.get('activeDeals', 0)}")
            self.log(f"    - Stalled Deals: {operations.get('stalledDeals', 0)}")
            self.log(f"    - Active Shipments: {operations.get('activeShipments', 0)}")
            self.log(f"    - Critical Shipment Risk: {operations.get('criticalShipmentRisk', 0)}")
            self.log(f"    - Pending Contracts: {operations.get('pendingContracts', 0)}")
            
            # Test people data
            people = response.get('people', {})
            self.log(f"  ✅ People Data:")
            self.log(f"    - Total Managers: {people.get('totalManagers', 0)}")
            self.log(f"    - Top Performers: {len(people.get('topPerformers', []))}")
            self.log(f"    - Underperformers: {len(people.get('underperformers', []))}")
            self.log(f"    - Overdue Tasks: {people.get('overdueTasks', 0)}")
            
            # Test risk data
            risk = response.get('risk', {})
            self.log(f"  ✅ Risk Data:")
            self.log(f"    - Suspicious Sessions: {risk.get('suspiciousSessions', 0)}")
            self.log(f"    - Critical Invoices: {risk.get('criticalInvoices', 0)}")
            self.log(f"    - Risky Shipments: {risk.get('riskyShipments', 0)}")
            self.log(f"    - Integrations Down: {risk.get('integrationsDown', 0)}")
            
            # Test journey drop-off
            journey_drop_off = response.get('journeyDropOff', [])
            self.log(f"  ✅ Journey Drop-off: {len(journey_drop_off)} bottlenecks")
            
            # Test hot leads and low health deals
            hot_leads = response.get('hotLeads', [])
            low_health_deals = response.get('lowHealthDeals', [])
            self.log(f"  ✅ Hot Leads: {len(hot_leads)}")
            self.log(f"  ✅ Low Health Deals: {len(low_health_deals)}")
            
        return success

    # ═══════════════════════════════════════════════════════════
    # BLUEPRINT & ROUTING TESTS
    # ═══════════════════════════════════════════════════════════

    def test_blueprint_move_stage(self) -> bool:
        """Test blueprint move-stage functionality"""
        self.log("\n=== TESTING BLUEPRINT MOVE-STAGE ===")
        
        # First create a test deal
        test_lead_id = f"test_lead_{int(time.time())}"
        success, response = self.run_test(
            "Create Test Deal for Stage Move",
            "POST",
            "deals",
            201,
            data={
                "title": "Test Deal for Blueprint Stage Move",
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

    def test_blueprint_allowed_transitions(self) -> bool:
        """Test blueprint allowed-transitions functionality"""
        self.log("\n=== TESTING BLUEPRINT ALLOWED-TRANSITIONS ===")
        
        # First create a test deal
        test_lead_id = f"test_lead_{int(time.time())}"
        success, response = self.run_test(
            "Create Test Deal for Transitions",
            "POST",
            "deals",
            201,
            data={
                "title": "Test Deal for Blueprint Transitions",
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

    def test_routing_rules(self) -> bool:
        """Test routing rules functionality"""
        self.log("\n=== TESTING ROUTING RULES ===")
        success, response = self.run_test(
            "Get Routing Rules",
            "GET",
            "routing/rules",
            200
        )
        
        if success:
            if isinstance(response, list):
                self.log(f"  ✅ Routing Rules: {len(response)}")
                if response:
                    first_rule = response[0]
                    self.log(f"    First Rule: {first_rule.get('name')}")
                    self.log(f"    Active: {first_rule.get('isActive')}")
                    self.log(f"    Priority: {first_rule.get('priority')}")
                    self.log(f"    Assign To: {first_rule.get('assignToType')} - {first_rule.get('assignToId')}")
                else:
                    self.log(f"  ✅ No routing rules found (expected if no data)")
            else:
                self.log(f"  ❌ Unexpected response format: {type(response)}")
                return False
        
        return success

    def run_all_tests(self) -> int:
        """Run all Score Engine, Journey Engine & Owner Dashboard tests"""
        self.log("🚀 Starting BIBI Cars CRM - Score Engine, Journey Engine & Owner Dashboard Tests")
        self.log(f"Base URL: {self.base_url}")
        
        # Test admin login
        login_success = self.test_admin_login()
        
        if not login_success:
            self.log("❌ Admin login failed - cannot proceed with authenticated tests")
            return 1
        
        # === SCORE ENGINE TESTS ===
        self.log("\n🟡 TESTING SCORE ENGINE")
        
        # Seed rules first
        self.test_score_seed_rules()
        
        # Test score rules (should return 27)
        self.test_score_rules()
        
        # Test score queries
        self.test_score_by_entity()
        self.test_hot_leads()
        self.test_low_health_deals()
        self.test_critical_shipments()
        self.test_top_managers()
        self.test_weak_managers()
        
        # === JOURNEY ENGINE TESTS ===
        self.log("\n🟡 TESTING JOURNEY ENGINE")
        
        self.test_journey_funnel()
        self.test_journey_bottlenecks()
        self.test_journey_timeline()
        
        # === OWNER DASHBOARD TESTS ===
        self.log("\n🟡 TESTING OWNER DASHBOARD")
        
        self.test_owner_dashboard()
        
        # === BLUEPRINT & ROUTING TESTS ===
        self.log("\n🟡 TESTING BLUEPRINT & ROUTING")
        
        self.test_blueprint_move_stage()
        self.test_blueprint_allowed_transitions()
        self.test_routing_rules()
        
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
    tester = ScoreJourneyAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())