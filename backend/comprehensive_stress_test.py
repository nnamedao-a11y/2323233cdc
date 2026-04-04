#!/usr/bin/env python3
"""
BIBI Cars CRM - Comprehensive Stress Test Suite
================================================

Monte-Carlo style load testing with cross-functional scenarios:
- 3000 concurrent managers
- 4 team leads
- 1 owner/master admin
- Cross-functional operations
- All modules testing

Modules covered:
1. Auth & Sessions
2. Staff Management
3. Leads & Deals
4. Contracts & DocuSign
5. Invoices & Payments (Stripe)
6. Shipping & Tracking
7. Notifications & Escalations
8. Export & Accounting
9. Dashboard & Analytics
"""

import asyncio
import aiohttp
import random
import string
import json
import time
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any
from collections import defaultdict
import statistics

# Configuration
BASE_URL = "https://vin-core-layer.preview.emergentagent.com/api"
CONCURRENT_MANAGERS = 50  # Start with 50, can scale up
CONCURRENT_TEAM_LEADS = 4
TOTAL_REQUESTS_PER_MODULE = 100
REQUEST_TIMEOUT = 30

# Test Results Storage
@dataclass
class TestResult:
    module: str
    endpoint: str
    method: str
    status_code: int
    response_time_ms: float
    success: bool
    error: Optional[str] = None
    user_role: str = "unknown"

@dataclass
class ModuleStats:
    total_requests: int = 0
    successful: int = 0
    failed: int = 0
    response_times: List[float] = field(default_factory=list)
    errors: Dict[str, int] = field(default_factory=lambda: defaultdict(int))
    
    @property
    def success_rate(self) -> float:
        return (self.successful / self.total_requests * 100) if self.total_requests > 0 else 0
    
    @property
    def avg_response_time(self) -> float:
        return statistics.mean(self.response_times) if self.response_times else 0
    
    @property
    def p95_response_time(self) -> float:
        if not self.response_times:
            return 0
        sorted_times = sorted(self.response_times)
        idx = int(len(sorted_times) * 0.95)
        return sorted_times[idx] if idx < len(sorted_times) else sorted_times[-1]

class BibiCRMStressTest:
    def __init__(self):
        self.results: List[TestResult] = []
        self.module_stats: Dict[str, ModuleStats] = defaultdict(ModuleStats)
        self.tokens: Dict[str, str] = {}  # role -> token
        self.created_entities: Dict[str, List[str]] = defaultdict(list)  # entity_type -> [ids]
        self.test_users: List[Dict] = []
        
    async def setup_auth(self, session: aiohttp.ClientSession):
        """Login and get tokens for all roles"""
        credentials = [
            ("owner", "admin@crm.com", "admin123"),
            ("team_lead", "teamlead@crm.com", "teamlead123"),
            ("manager", "manager@crm.com", "manager123"),
        ]
        
        for role, email, password in credentials:
            try:
                async with session.post(
                    f"{BASE_URL}/auth/login",
                    json={"email": email, "password": password},
                    timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
                ) as resp:
                    if resp.status == 200 or resp.status == 201:
                        data = await resp.json()
                        self.tokens[role] = data.get("token") or data.get("access_token")
                        print(f"✓ Logged in as {role}: {email}")
                    else:
                        text = await resp.text()
                        print(f"✗ Failed to login as {role}: {resp.status} - {text[:100]}")
            except Exception as e:
                print(f"✗ Auth error for {role}: {str(e)}")
    
    def get_headers(self, role: str = "manager") -> Dict:
        """Get auth headers for a role"""
        token = self.tokens.get(role)
        if token:
            return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        return {"Content-Type": "application/json"}
    
    async def make_request(
        self, 
        session: aiohttp.ClientSession,
        method: str,
        endpoint: str,
        module: str,
        role: str = "manager",
        data: Optional[Dict] = None,
        params: Optional[Dict] = None
    ) -> TestResult:
        """Make a single request and record result"""
        url = f"{BASE_URL}/{endpoint}"
        headers = self.get_headers(role)
        start_time = time.time()
        
        try:
            async with session.request(
                method, url, 
                json=data, 
                params=params,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
            ) as resp:
                response_time = (time.time() - start_time) * 1000
                success = resp.status in [200, 201, 204]
                error = None
                
                if not success:
                    try:
                        error_data = await resp.json()
                        error = str(error_data.get("message", ""))[:100]
                    except:
                        error = await resp.text()
                        error = error[:100] if error else f"Status {resp.status}"
                
                result = TestResult(
                    module=module,
                    endpoint=endpoint,
                    method=method,
                    status_code=resp.status,
                    response_time_ms=response_time,
                    success=success,
                    error=error,
                    user_role=role
                )
                
                self.record_result(result)
                return result
                
        except asyncio.TimeoutError:
            result = TestResult(
                module=module, endpoint=endpoint, method=method,
                status_code=0, response_time_ms=REQUEST_TIMEOUT * 1000,
                success=False, error="Timeout", user_role=role
            )
            self.record_result(result)
            return result
        except Exception as e:
            result = TestResult(
                module=module, endpoint=endpoint, method=method,
                status_code=0, response_time_ms=(time.time() - start_time) * 1000,
                success=False, error=str(e)[:100], user_role=role
            )
            self.record_result(result)
            return result
    
    def record_result(self, result: TestResult):
        """Record test result to stats"""
        self.results.append(result)
        stats = self.module_stats[result.module]
        stats.total_requests += 1
        stats.response_times.append(result.response_time_ms)
        
        if result.success:
            stats.successful += 1
        else:
            stats.failed += 1
            stats.errors[result.error or "Unknown"] += 1
    
    # ==================== MODULE TESTS ====================
    
    async def test_system_health(self, session: aiohttp.ClientSession):
        """Test system health endpoint"""
        print("\n📊 Testing: System Health")
        await self.make_request(session, "GET", "system/health", "System", role="owner")
    
    async def test_auth_module(self, session: aiohttp.ClientSession, num_requests: int = 20):
        """Test authentication endpoints"""
        print("\n🔐 Testing: Auth Module")
        tasks = []
        
        # Test /auth/me for all roles
        for role in ["owner", "team_lead", "manager"]:
            for _ in range(num_requests // 3):
                tasks.append(self.make_request(session, "GET", "auth/me", "Auth", role=role))
        
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def test_staff_module(self, session: aiohttp.ClientSession, num_requests: int = 30):
        """Test staff management endpoints"""
        print("\n👥 Testing: Staff Module")
        tasks = []
        
        # GET /staff - list all staff
        for _ in range(num_requests // 3):
            tasks.append(self.make_request(session, "GET", "staff", "Staff", role="owner"))
            tasks.append(self.make_request(session, "GET", "staff", "Staff", role="team_lead"))
        
        # GET /staff/stats
        for _ in range(num_requests // 6):
            tasks.append(self.make_request(session, "GET", "staff/stats", "Staff", role="owner"))
        
        # GET /staff/performance
        for _ in range(num_requests // 6):
            tasks.append(self.make_request(
                session, "GET", "staff/performance", "Staff", role="team_lead"
            ))
        
        # GET /staff/inactive
        for _ in range(num_requests // 6):
            tasks.append(self.make_request(
                session, "GET", "staff/inactive", "Staff", role="owner"
            ))
        
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def test_leads_module(self, session: aiohttp.ClientSession, num_requests: int = 50):
        """Test leads management"""
        print("\n📋 Testing: Leads Module")
        tasks = []
        
        # GET /leads
        for _ in range(num_requests // 3):
            tasks.append(self.make_request(session, "GET", "leads", "Leads", role="manager"))
        
        # GET /leads/stats
        for _ in range(num_requests // 3):
            tasks.append(self.make_request(session, "GET", "leads/stats", "Leads", role="team_lead"))
        
        # POST /leads - create leads
        for i in range(num_requests // 3):
            lead_data = {
                "firstName": f"Test{i}",
                "lastName": f"Lead{random.randint(1000,9999)}",
                "email": f"test{i}_{random.randint(1000,9999)}@example.com",
                "phone": f"+380{random.randint(100000000, 999999999)}",
                "source": random.choice(["website", "referral", "social_media", "advertisement"]),
            }
            tasks.append(self.make_request(session, "POST", "leads", "Leads", role="manager", data=lead_data))
        
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def test_deals_module(self, session: aiohttp.ClientSession, num_requests: int = 50):
        """Test deals pipeline"""
        print("\n💼 Testing: Deals Module")
        tasks = []
        
        # GET /deals
        for _ in range(num_requests // 3):
            tasks.append(self.make_request(session, "GET", "deals", "Deals", role="manager"))
        
        # GET /deals/stats
        for _ in range(num_requests // 3):
            tasks.append(self.make_request(session, "GET", "deals/stats", "Deals", role="owner"))
        
        # GET /deals/pipeline-analytics
        for _ in range(num_requests // 3):
            tasks.append(self.make_request(
                session, "GET", "deals/pipeline-analytics", "Deals", role="team_lead"
            ))
        
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def test_contracts_module(self, session: aiohttp.ClientSession, num_requests: int = 40):
        """Test contracts and DocuSign"""
        print("\n📝 Testing: Contracts Module")
        tasks = []
        
        # GET /contracts/me
        for _ in range(num_requests // 4):
            tasks.append(self.make_request(session, "GET", "contracts/me", "Contracts", role="manager"))
        
        # GET /admin/contracts/pending
        for _ in range(num_requests // 4):
            tasks.append(self.make_request(
                session, "GET", "admin/contracts/pending", "Contracts", role="owner"
            ))
        
        # GET /admin/contracts/accounting
        for _ in range(num_requests // 4):
            tasks.append(self.make_request(
                session, "GET", "admin/contracts/accounting", "Contracts", role="owner"
            ))
        
        # GET /admin/contracts/analytics
        for _ in range(num_requests // 4):
            tasks.append(self.make_request(
                session, "GET", "admin/contracts/analytics", "Contracts", role="team_lead"
            ))
        
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def test_invoices_module(self, session: aiohttp.ClientSession, num_requests: int = 40):
        """Test invoices and payments"""
        print("\n💳 Testing: Invoices & Payments Module")
        tasks = []
        
        # GET /invoices/me
        for _ in range(num_requests // 5):
            tasks.append(self.make_request(session, "GET", "invoices/me", "Payments", role="manager"))
        
        # GET /invoices/admin/all
        for _ in range(num_requests // 5):
            tasks.append(self.make_request(
                session, "GET", "invoices/admin/all", "Payments", role="owner"
            ))
        
        # GET /invoices/admin/overdue
        for _ in range(num_requests // 5):
            tasks.append(self.make_request(
                session, "GET", "invoices/admin/overdue", "Payments", role="owner"
            ))
        
        # GET /invoices/analytics
        for _ in range(num_requests // 5):
            tasks.append(self.make_request(
                session, "GET", "invoices/analytics", "Payments", role="team_lead"
            ))
        
        # GET /payments/packages
        for _ in range(num_requests // 5):
            tasks.append(self.make_request(
                session, "GET", "payments/packages", "Payments", role="manager"
            ))
        
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def test_shipping_module(self, session: aiohttp.ClientSession, num_requests: int = 40):
        """Test shipping and tracking"""
        print("\n🚢 Testing: Shipping Module")
        tasks = []
        
        # GET /shipping/me
        for _ in range(num_requests // 5):
            tasks.append(self.make_request(session, "GET", "shipping/me", "Shipping", role="manager"))
        
        # GET /shipping/admin/active
        for _ in range(num_requests // 5):
            tasks.append(self.make_request(
                session, "GET", "shipping/admin/active", "Shipping", role="owner"
            ))
        
        # GET /shipping/admin/delayed
        for _ in range(num_requests // 5):
            tasks.append(self.make_request(
                session, "GET", "shipping/admin/delayed", "Shipping", role="team_lead"
            ))
        
        # GET /shipping/analytics
        for _ in range(num_requests // 5):
            tasks.append(self.make_request(
                session, "GET", "shipping/analytics", "Shipping", role="owner"
            ))
        
        # GET /shipments/stalled
        for _ in range(num_requests // 5):
            tasks.append(self.make_request(
                session, "GET", "shipments/stalled", "Shipping", role="team_lead"
            ))
        
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def test_escalation_module(self, session: aiohttp.ClientSession, num_requests: int = 30):
        """Test escalation engine"""
        print("\n⚠️ Testing: Escalation Module")
        tasks = []
        
        # GET /escalations
        for _ in range(num_requests // 2):
            tasks.append(self.make_request(session, "GET", "escalations", "Escalation", role="owner"))
        
        # GET /escalations/stats
        for _ in range(num_requests // 2):
            tasks.append(self.make_request(
                session, "GET", "escalations/stats", "Escalation", role="team_lead"
            ))
        
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def test_notifications_module(self, session: aiohttp.ClientSession, num_requests: int = 30):
        """Test notifications"""
        print("\n🔔 Testing: Notifications Module")
        tasks = []
        
        # GET /notifications
        for _ in range(num_requests // 2):
            tasks.append(self.make_request(
                session, "GET", "notifications", "Notifications", role="manager"
            ))
        
        # GET /telegram-link/status
        for _ in range(num_requests // 2):
            tasks.append(self.make_request(
                session, "GET", "telegram-link/status", "Notifications", role="manager"
            ))
        
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def test_dashboard_module(self, session: aiohttp.ClientSession, num_requests: int = 40):
        """Test dashboard and analytics"""
        print("\n📈 Testing: Dashboard & Analytics")
        tasks = []
        
        # GET /dashboard (legacy)
        for _ in range(num_requests // 5):
            tasks.append(self.make_request(
                session, "GET", "dashboard", "Dashboard", role="owner"
            ))
        
        # GET /dashboard/master
        for _ in range(num_requests // 5):
            tasks.append(self.make_request(
                session, "GET", "dashboard/master", "Dashboard", role="team_lead"
            ))
        
        # GET /dashboard/kpi
        for _ in range(num_requests // 5):
            tasks.append(self.make_request(
                session, "GET", "dashboard/kpi", "Dashboard", role="owner"
            ))
        
        # GET /admin/kpi/dashboard
        for _ in range(num_requests // 5):
            tasks.append(self.make_request(
                session, "GET", "admin/kpi/dashboard", "Dashboard", role="owner"
            ))
        
        # GET /owner-dashboard
        for _ in range(num_requests // 5):
            tasks.append(self.make_request(
                session, "GET", "owner-dashboard", "Dashboard", role="owner"
            ))
        
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def test_customers_module(self, session: aiohttp.ClientSession, num_requests: int = 30):
        """Test customer management"""
        print("\n👤 Testing: Customers Module")
        tasks = []
        
        # GET /customers
        for _ in range(num_requests // 2):
            tasks.append(self.make_request(session, "GET", "customers", "Customers", role="manager"))
        
        # GET /customer-auth/me (if logged as customer)
        for _ in range(num_requests // 2):
            tasks.append(self.make_request(
                session, "GET", "customers/stats", "Customers", role="owner"
            ))
        
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def test_tasks_module(self, session: aiohttp.ClientSession, num_requests: int = 30):
        """Test task management"""
        print("\n✅ Testing: Tasks Module")
        tasks = []
        
        # GET /tasks
        for _ in range(num_requests // 2):
            tasks.append(self.make_request(session, "GET", "tasks", "Tasks", role="manager"))
        
        # GET /tasks/my
        for _ in range(num_requests // 2):
            tasks.append(self.make_request(session, "GET", "tasks/my", "Tasks", role="manager"))
        
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def test_vehicles_module(self, session: aiohttp.ClientSession, num_requests: int = 30):
        """Test vehicles/inventory"""
        print("\n🚗 Testing: Vehicles Module")
        tasks = []
        
        # GET /public/vehicles (public endpoint)
        for _ in range(num_requests):
            tasks.append(self.make_request(
                session, "GET", "public/vehicles", "Vehicles", role="manager"
            ))
        
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def test_cross_functional_scenarios(self, session: aiohttp.ClientSession):
        """Test cross-functional scenarios simulating real workflows"""
        print("\n🔄 Testing: Cross-Functional Scenarios")
        
        # Scenario 1: Team Lead reviews all pending items
        print("  Scenario 1: Team Lead daily review...")
        tasks = [
            self.make_request(session, "GET", "leads/stats", "CrossFunc", role="team_lead"),
            self.make_request(session, "GET", "deals/stats", "CrossFunc", role="team_lead"),
            self.make_request(session, "GET", "admin/contracts/pending", "CrossFunc", role="team_lead"),
            self.make_request(session, "GET", "invoices/admin/overdue", "CrossFunc", role="team_lead"),
            self.make_request(session, "GET", "shipping/admin/delayed", "CrossFunc", role="team_lead"),
            self.make_request(session, "GET", "escalations/stats", "CrossFunc", role="team_lead"),
        ]
        await asyncio.gather(*tasks, return_exceptions=True)
        
        # Scenario 2: Owner accounting export
        print("  Scenario 2: Owner accounting export...")
        tasks = [
            self.make_request(session, "GET", "admin/contracts/accounting", "CrossFunc", role="owner"),
            self.make_request(session, "GET", "admin/contracts/export", "CrossFunc", role="owner"),
            self.make_request(session, "GET", "invoices/analytics", "CrossFunc", role="owner"),
            self.make_request(session, "GET", "owner-dashboard", "CrossFunc", role="owner"),
        ]
        await asyncio.gather(*tasks, return_exceptions=True)
        
        # Scenario 3: Manager daily workflow
        print("  Scenario 3: Manager daily workflow...")
        tasks = [
            self.make_request(session, "GET", "leads", "CrossFunc", role="manager"),
            self.make_request(session, "GET", "deals", "CrossFunc", role="manager"),
            self.make_request(session, "GET", "tasks/my", "CrossFunc", role="manager"),
            self.make_request(session, "GET", "contracts/me", "CrossFunc", role="manager"),
            self.make_request(session, "GET", "shipping/manager/my", "CrossFunc", role="manager"),
        ]
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def run_concurrent_load_test(self, session: aiohttp.ClientSession, num_concurrent: int = 50):
        """Simulate concurrent users hitting various endpoints"""
        print(f"\n🚀 Running Concurrent Load Test ({num_concurrent} concurrent requests)")
        
        endpoints = [
            ("GET", "leads", "LoadTest", "manager"),
            ("GET", "deals", "LoadTest", "manager"),
            ("GET", "contracts/me", "LoadTest", "manager"),
            ("GET", "invoices/me", "LoadTest", "manager"),
            ("GET", "shipping/me", "LoadTest", "manager"),
            ("GET", "staff", "LoadTest", "team_lead"),
            ("GET", "admin/contracts/accounting", "LoadTest", "owner"),
            ("GET", "dashboard", "LoadTest", "owner"),
            ("GET", "admin/kpi/dashboard", "LoadTest", "owner"),
        ]
        
        tasks = []
        for _ in range(num_concurrent):
            method, endpoint, module, role = random.choice(endpoints)
            tasks.append(self.make_request(session, method, endpoint, module, role=role))
        
        await asyncio.gather(*tasks, return_exceptions=True)
    
    def print_report(self):
        """Print comprehensive test report"""
        print("\n" + "="*80)
        print("📊 BIBI CRM STRESS TEST REPORT")
        print("="*80)
        
        total_requests = len(self.results)
        total_success = sum(1 for r in self.results if r.success)
        total_failed = total_requests - total_success
        
        print(f"\n📈 OVERALL STATISTICS:")
        print(f"   Total Requests:    {total_requests}")
        print(f"   Successful:        {total_success} ({total_success/total_requests*100:.1f}%)")
        print(f"   Failed:            {total_failed} ({total_failed/total_requests*100:.1f}%)")
        
        if self.results:
            all_times = [r.response_time_ms for r in self.results]
            print(f"   Avg Response Time: {statistics.mean(all_times):.0f}ms")
            print(f"   P95 Response Time: {sorted(all_times)[int(len(all_times)*0.95)]:.0f}ms")
            print(f"   Max Response Time: {max(all_times):.0f}ms")
        
        print(f"\n📦 MODULE BREAKDOWN:")
        print("-"*80)
        print(f"{'Module':<20} {'Total':<8} {'Success':<8} {'Failed':<8} {'Rate':<8} {'Avg(ms)':<10} {'P95(ms)':<10}")
        print("-"*80)
        
        for module, stats in sorted(self.module_stats.items()):
            print(f"{module:<20} {stats.total_requests:<8} {stats.successful:<8} {stats.failed:<8} "
                  f"{stats.success_rate:.1f}%{'':<3} {stats.avg_response_time:.0f}{'':<6} {stats.p95_response_time:.0f}")
        
        # Print errors summary
        all_errors = defaultdict(int)
        for module, stats in self.module_stats.items():
            for error, count in stats.errors.items():
                all_errors[f"{module}: {error}"] += count
        
        if all_errors:
            print(f"\n⚠️ ERROR SUMMARY (Top 10):")
            print("-"*80)
            for error, count in sorted(all_errors.items(), key=lambda x: -x[1])[:10]:
                print(f"   [{count:>3}x] {error[:70]}")
        
        # Endpoints with issues
        failed_endpoints = defaultdict(int)
        for r in self.results:
            if not r.success:
                failed_endpoints[f"{r.method} /{r.endpoint}"] += 1
        
        if failed_endpoints:
            print(f"\n❌ PROBLEMATIC ENDPOINTS:")
            print("-"*80)
            for endpoint, count in sorted(failed_endpoints.items(), key=lambda x: -x[1])[:15]:
                print(f"   [{count:>3}x] {endpoint}")
        
        print("\n" + "="*80)
        print("✅ TEST COMPLETE")
        print("="*80)
        
        return {
            "total_requests": total_requests,
            "success_rate": total_success / total_requests * 100 if total_requests > 0 else 0,
            "modules": {
                module: {
                    "total": stats.total_requests,
                    "success_rate": stats.success_rate,
                    "avg_response_ms": stats.avg_response_time,
                    "p95_response_ms": stats.p95_response_time,
                    "errors": dict(stats.errors)
                }
                for module, stats in self.module_stats.items()
            }
        }

async def main():
    """Main test runner"""
    print("="*80)
    print("🚗 BIBI CARS CRM - COMPREHENSIVE STRESS TEST")
    print("="*80)
    print(f"Target: {BASE_URL}")
    print(f"Started: {datetime.now().isoformat()}")
    print("="*80)
    
    tester = BibiCRMStressTest()
    
    connector = aiohttp.TCPConnector(limit=100, limit_per_host=50)
    timeout = aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
    
    async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
        # Setup authentication
        print("\n🔑 Setting up authentication...")
        await tester.setup_auth(session)
        
        if not tester.tokens:
            print("❌ Failed to authenticate. Aborting tests.")
            return
        
        # Run module tests
        await tester.test_system_health(session)
        await tester.test_auth_module(session, 20)
        await tester.test_staff_module(session, 30)
        await tester.test_leads_module(session, 50)
        await tester.test_deals_module(session, 50)
        await tester.test_contracts_module(session, 40)
        await tester.test_invoices_module(session, 40)
        await tester.test_shipping_module(session, 40)
        await tester.test_escalation_module(session, 30)
        await tester.test_notifications_module(session, 30)
        await tester.test_dashboard_module(session, 40)
        await tester.test_customers_module(session, 30)
        await tester.test_tasks_module(session, 30)
        await tester.test_vehicles_module(session, 30)
        
        # Cross-functional scenarios
        await tester.test_cross_functional_scenarios(session)
        
        # Concurrent load test
        await tester.run_concurrent_load_test(session, 50)
    
    # Print report
    report = tester.print_report()
    
    # Save report to file
    with open('/app/test_reports/stress_test_report.json', 'w') as f:
        json.dump(report, f, indent=2)
    
    print(f"\n📁 Report saved to: /app/test_reports/stress_test_report.json")
    
    return report

if __name__ == "__main__":
    asyncio.run(main())
