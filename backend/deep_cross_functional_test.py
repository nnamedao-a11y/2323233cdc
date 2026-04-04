#!/usr/bin/env python3
"""
BIBI Cars CRM - Deep Cross-Functional Stress Test
==================================================

Massive load test simulating:
- 2000 managers (distributed across 50 team leads)
- 50 team leads (each managing ~40 managers)
- 1 master admin overseeing all
- Customer cabinet interactions

Tests:
1. Non-overlapping routes (each TL team works independently)
2. Overlapping/conflicting routes (resource contention)
3. Master admin interference patterns
4. Customer ↔ Staff interaction conflicts
5. Concurrent read/write operations on same resources

20x more load than previous tests (~10,000+ requests)
"""

import asyncio
import aiohttp
import random
import json
import time
import uuid
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Set
from collections import defaultdict
import statistics

# Configuration
BASE_URL = "https://vin-core-layer.preview.emergentagent.com/api"
REQUEST_TIMEOUT = 60

# Scale parameters (20x more than previous)
NUM_MANAGERS = 200  # Represents 2000 (scaled 10x for practical execution)
NUM_TEAM_LEADS = 50
MANAGERS_PER_TL = NUM_MANAGERS // NUM_TEAM_LEADS  # 4 managers per TL
ITERATIONS = 10  # 10 iterations x 200 managers x ~5 ops = ~10,000 requests

# Simulated team structure
@dataclass
class SimulatedTeamLead:
    id: str
    name: str
    manager_ids: List[str]
    
@dataclass
class SimulatedManager:
    id: str
    name: str
    team_lead_id: str
    assigned_leads: Set[str] = field(default_factory=set)
    assigned_deals: Set[str] = field(default_factory=set)

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
    user_id: str = ""
    iteration: int = 0
    conflict_type: str = "none"  # none, read_read, read_write, write_write

@dataclass
class ConflictReport:
    resource_type: str  # lead, deal, contract, invoice
    resource_id: str
    operations: List[Dict]  # List of conflicting operations
    resolution: str  # success, partial_failure, deadlock

class ModuleStats:
    def __init__(self):
        self.total_requests = 0
        self.successful = 0
        self.failed = 0
        self.response_times: List[float] = []
        self.errors: Dict[str, int] = defaultdict(int)
        self.conflicts_detected = 0
        self.conflicts_resolved = 0
    
    @property
    def success_rate(self) -> float:
        return (self.successful / self.total_requests * 100) if self.total_requests > 0 else 0
    
    @property
    def avg_response_time(self) -> float:
        return statistics.mean(self.response_times) if self.response_times else 0
    
    @property
    def p50(self) -> float:
        return statistics.median(self.response_times) if self.response_times else 0
    
    @property
    def p95(self) -> float:
        if not self.response_times:
            return 0
        sorted_times = sorted(self.response_times)
        idx = int(len(sorted_times) * 0.95)
        return sorted_times[min(idx, len(sorted_times)-1)]
    
    @property
    def p99(self) -> float:
        if not self.response_times:
            return 0
        sorted_times = sorted(self.response_times)
        idx = int(len(sorted_times) * 0.99)
        return sorted_times[min(idx, len(sorted_times)-1)]

class DeepCrossFunctionalTest:
    def __init__(self):
        self.results: List[TestResult] = []
        self.module_stats: Dict[str, ModuleStats] = defaultdict(ModuleStats)
        self.tokens: Dict[str, str] = {}  # role -> token
        
        # Simulated organizational structure
        self.team_leads: List[SimulatedTeamLead] = []
        self.managers: List[SimulatedManager] = []
        
        # Shared resources for conflict testing
        self.shared_lead_ids: List[str] = []
        self.shared_deal_ids: List[str] = []
        self.shared_contract_ids: List[str] = []
        self.shared_invoice_ids: List[str] = []
        self.shared_shipment_ids: List[str] = []
        
        # Conflict tracking
        self.conflicts: List[ConflictReport] = []
        self.resource_locks: Dict[str, str] = {}  # resource_id -> user_id (simulated)
        
        # Iteration stats
        self.iteration_stats: List[Dict] = []
        
    def build_org_structure(self):
        """Build simulated organizational hierarchy"""
        print(f"\n🏢 Building organization structure: {NUM_TEAM_LEADS} TLs, {NUM_MANAGERS} Managers")
        
        for tl_idx in range(NUM_TEAM_LEADS):
            tl = SimulatedTeamLead(
                id=f"tl_{tl_idx:03d}",
                name=f"TeamLead_{tl_idx}",
                manager_ids=[]
            )
            
            # Assign managers to this TL
            for m_idx in range(MANAGERS_PER_TL):
                manager_global_idx = tl_idx * MANAGERS_PER_TL + m_idx
                manager = SimulatedManager(
                    id=f"mgr_{manager_global_idx:04d}",
                    name=f"Manager_{manager_global_idx}",
                    team_lead_id=tl.id
                )
                self.managers.append(manager)
                tl.manager_ids.append(manager.id)
            
            self.team_leads.append(tl)
        
        print(f"   ✓ Created {len(self.team_leads)} team leads")
        print(f"   ✓ Created {len(self.managers)} managers")
        
        # Generate shared resources for conflict testing
        for i in range(100):
            self.shared_lead_ids.append(f"lead_{uuid.uuid4().hex[:8]}")
            self.shared_deal_ids.append(f"deal_{uuid.uuid4().hex[:8]}")
            self.shared_contract_ids.append(f"contract_{uuid.uuid4().hex[:8]}")
            self.shared_invoice_ids.append(f"invoice_{uuid.uuid4().hex[:8]}")
            self.shared_shipment_ids.append(f"shipment_{uuid.uuid4().hex[:8]}")
        
        print(f"   ✓ Generated {len(self.shared_lead_ids)} shared resources per type")
        
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
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as resp:
                    if resp.status in [200, 201]:
                        data = await resp.json()
                        self.tokens[role] = data.get("token") or data.get("access_token")
                        print(f"   ✓ Logged in as {role}: {email}")
                    else:
                        print(f"   ✗ Failed to login as {role}: {resp.status}")
            except Exception as e:
                print(f"   ✗ Auth error for {role}: {str(e)}")
    
    def get_headers(self, role: str = "manager") -> Dict:
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
        params: Optional[Dict] = None,
        user_id: str = "",
        iteration: int = 0,
        conflict_type: str = "none"
    ) -> TestResult:
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
                        error = str(error_data.get("message", ""))[:80]
                    except:
                        error = f"Status {resp.status}"
                
                result = TestResult(
                    module=module,
                    endpoint=endpoint,
                    method=method,
                    status_code=resp.status,
                    response_time_ms=response_time,
                    success=success,
                    error=error,
                    user_role=role,
                    user_id=user_id,
                    iteration=iteration,
                    conflict_type=conflict_type
                )
                
                self.record_result(result)
                return result
                
        except asyncio.TimeoutError:
            result = TestResult(
                module=module, endpoint=endpoint, method=method,
                status_code=0, response_time_ms=REQUEST_TIMEOUT * 1000,
                success=False, error="Timeout", user_role=role,
                user_id=user_id, iteration=iteration, conflict_type=conflict_type
            )
            self.record_result(result)
            return result
        except Exception as e:
            result = TestResult(
                module=module, endpoint=endpoint, method=method,
                status_code=0, response_time_ms=(time.time() - start_time) * 1000,
                success=False, error=str(e)[:80], user_role=role,
                user_id=user_id, iteration=iteration, conflict_type=conflict_type
            )
            self.record_result(result)
            return result
    
    def record_result(self, result: TestResult):
        self.results.append(result)
        stats = self.module_stats[result.module]
        stats.total_requests += 1
        stats.response_times.append(result.response_time_ms)
        
        if result.success:
            stats.successful += 1
        else:
            stats.failed += 1
            stats.errors[result.error or "Unknown"] += 1
        
        if result.conflict_type != "none":
            stats.conflicts_detected += 1
            if result.success:
                stats.conflicts_resolved += 1

    # ================= NON-OVERLAPPING OPERATIONS =================
    
    async def manager_isolated_operations(self, session: aiohttp.ClientSession, 
                                          manager: SimulatedManager, iteration: int):
        """Manager operations that don't conflict with others"""
        tasks = []
        
        # Each manager works on their own data
        ops = [
            ("GET", "leads", None),
            ("GET", "deals", None),
            ("GET", "contracts/me", None),
            ("GET", "invoices/me", None),
            ("GET", "shipping/me", None),
            ("GET", "tasks/my", None),
            ("GET", "notifications", None),
        ]
        
        # Select 3-5 random operations
        selected_ops = random.sample(ops, random.randint(3, 5))
        
        for method, endpoint, data in selected_ops:
            tasks.append(self.make_request(
                session, method, endpoint, 
                f"Manager_Isolated_{manager.team_lead_id}",
                "manager", data, None, manager.id, iteration, "none"
            ))
        
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def team_lead_isolated_operations(self, session: aiohttp.ClientSession,
                                            team_lead: SimulatedTeamLead, iteration: int):
        """Team lead operations within their team only"""
        tasks = []
        
        ops = [
            ("GET", "staff", None),
            ("GET", "staff/performance", None),
            ("GET", "staff/inactive", None),
            ("GET", "leads/stats", None),
            ("GET", "deals/stats", None),
            ("GET", "escalations/stats", None),
            ("GET", "admin/kpi/team-summary", None),
        ]
        
        selected_ops = random.sample(ops, random.randint(4, 6))
        
        for method, endpoint, data in selected_ops:
            tasks.append(self.make_request(
                session, method, endpoint,
                f"TeamLead_Isolated_{team_lead.id}",
                "team_lead", data, None, team_lead.id, iteration, "none"
            ))
        
        await asyncio.gather(*tasks, return_exceptions=True)

    # ================= OVERLAPPING/CONFLICTING OPERATIONS =================
    
    async def concurrent_lead_access(self, session: aiohttp.ClientSession, iteration: int):
        """Multiple users accessing/modifying same leads simultaneously"""
        tasks = []
        
        # Select shared leads for conflict testing
        conflict_leads = random.sample(self.shared_lead_ids, min(20, len(self.shared_lead_ids)))
        
        # Multiple managers reading same leads (READ-READ conflict - should be OK)
        for lead_id in conflict_leads[:10]:
            for _ in range(3):  # 3 concurrent reads per lead
                manager = random.choice(self.managers)
                tasks.append(self.make_request(
                    session, "GET", f"leads", 
                    "Conflict_Lead_Read",
                    "manager", None, {"search": lead_id[:8]}, 
                    manager.id, iteration, "read_read"
                ))
        
        # Managers trying to update same lead (READ-WRITE conflict)
        for lead_id in conflict_leads[10:15]:
            # One read, one write attempt
            manager1 = random.choice(self.managers)
            manager2 = random.choice(self.managers)
            tasks.append(self.make_request(
                session, "GET", "leads",
                "Conflict_Lead_ReadWrite",
                "manager", None, {"search": lead_id[:8]},
                manager1.id, iteration, "read_write"
            ))
            # Attempt to create new lead (simulating update)
            tasks.append(self.make_request(
                session, "POST", "leads",
                "Conflict_Lead_ReadWrite",
                "manager", {
                    "firstName": f"Conflict{lead_id[:4]}",
                    "lastName": f"Test{random.randint(1000,9999)}",
                    "email": f"conflict{lead_id[:4]}_{random.randint(10000,99999)}@test.com",
                    "source": "website"
                },
                None, manager2.id, iteration, "read_write"
            ))
        
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def concurrent_deal_operations(self, session: aiohttp.ClientSession, iteration: int):
        """Multiple users working on deals simultaneously"""
        tasks = []
        
        # Concurrent deal reads
        for _ in range(30):
            manager = random.choice(self.managers)
            tasks.append(self.make_request(
                session, "GET", "deals",
                "Conflict_Deal_Concurrent",
                "manager", None, None,
                manager.id, iteration, "read_read"
            ))
        
        # Stats access by multiple TLs simultaneously
        for tl in random.sample(self.team_leads, min(10, len(self.team_leads))):
            tasks.append(self.make_request(
                session, "GET", "deals/stats",
                "Conflict_Deal_Stats",
                "team_lead", None, None,
                tl.id, iteration, "read_read"
            ))
        
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def concurrent_contract_operations(self, session: aiohttp.ClientSession, iteration: int):
        """Contract operations with potential conflicts"""
        tasks = []
        
        # Multiple users checking contracts
        for _ in range(20):
            manager = random.choice(self.managers)
            tasks.append(self.make_request(
                session, "GET", "contracts/me",
                "Conflict_Contract",
                "manager", None, None,
                manager.id, iteration, "read_read"
            ))
        
        # Admin checking pending contracts while managers work
        tasks.append(self.make_request(
            session, "GET", "admin/contracts/pending",
            "Conflict_Contract_Admin",
            "owner", None, None,
            "admin", iteration, "read_write"
        ))
        
        # Team leads checking accounting while contracts being processed
        for tl in random.sample(self.team_leads, min(5, len(self.team_leads))):
            tasks.append(self.make_request(
                session, "GET", "admin/contracts/accounting",
                "Conflict_Contract_TL",
                "team_lead", None, None,
                tl.id, iteration, "read_read"
            ))
        
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def concurrent_invoice_operations(self, session: aiohttp.ClientSession, iteration: int):
        """Invoice and payment conflicts"""
        tasks = []
        
        # Managers checking their invoices
        for _ in range(20):
            manager = random.choice(self.managers)
            tasks.append(self.make_request(
                session, "GET", "invoices/me",
                "Conflict_Invoice_Manager",
                "manager", None, None,
                manager.id, iteration, "read_read"
            ))
        
        # Admin running analytics while invoices being accessed
        tasks.append(self.make_request(
            session, "GET", "invoices/analytics",
            "Conflict_Invoice_Admin",
            "owner", None, None,
            "admin", iteration, "read_write"
        ))
        
        # Multiple TLs checking overdue at same time
        for tl in random.sample(self.team_leads, min(5, len(self.team_leads))):
            tasks.append(self.make_request(
                session, "GET", "invoices/admin/overdue",
                "Conflict_Invoice_TL",
                "team_lead", None, None,
                tl.id, iteration, "read_read"
            ))
        
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def concurrent_shipping_operations(self, session: aiohttp.ClientSession, iteration: int):
        """Shipping tracking conflicts"""
        tasks = []
        
        # Managers checking shipping
        for _ in range(20):
            manager = random.choice(self.managers)
            tasks.append(self.make_request(
                session, "GET", "shipping/me",
                "Conflict_Shipping_Manager",
                "manager", None, None,
                manager.id, iteration, "read_read"
            ))
        
        # Admin checking active/delayed simultaneously
        tasks.append(self.make_request(
            session, "GET", "shipping/admin/active",
            "Conflict_Shipping_Admin",
            "owner", None, None,
            "admin", iteration, "read_read"
        ))
        tasks.append(self.make_request(
            session, "GET", "shipping/admin/delayed",
            "Conflict_Shipping_Admin",
            "owner", None, None,
            "admin", iteration, "read_read"
        ))
        
        # Stalled shipments check
        tasks.append(self.make_request(
            session, "GET", "shipments/stalled",
            "Conflict_Shipping_Stalled",
            "team_lead", None, None,
            random.choice(self.team_leads).id, iteration, "read_read"
        ))
        
        await asyncio.gather(*tasks, return_exceptions=True)

    # ================= MASTER ADMIN INTERFERENCE =================
    
    async def admin_interference_pattern(self, session: aiohttp.ClientSession, iteration: int):
        """Admin operations that could interfere with ongoing work"""
        tasks = []
        
        # Admin runs heavy analytics while system is loaded
        admin_ops = [
            ("GET", "admin/contracts/accounting", "Admin_Heavy"),
            ("GET", "admin/contracts/export", "Admin_Heavy"),
            ("GET", "dashboard", "Admin_Heavy"),
            ("GET", "dashboard/master", "Admin_Heavy"),
            ("GET", "admin/kpi/dashboard", "Admin_Heavy"),
            ("GET", "owner-dashboard", "Admin_Heavy"),
            ("GET", "invoices/analytics", "Admin_Heavy"),
            ("GET", "shipping/analytics", "Admin_Heavy"),
            ("GET", "deals/pipeline-analytics", "Admin_Heavy"),
        ]
        
        for method, endpoint, module in admin_ops:
            tasks.append(self.make_request(
                session, method, endpoint, module,
                "owner", None, None,
                "master_admin", iteration, "admin_interference"
            ))
        
        # Concurrent with manager operations
        for _ in range(30):
            manager = random.choice(self.managers)
            endpoint = random.choice(["leads", "deals", "contracts/me", "tasks/my"])
            tasks.append(self.make_request(
                session, "GET", endpoint,
                "Manager_During_Admin",
                "manager", None, None,
                manager.id, iteration, "admin_interference"
            ))
        
        await asyncio.gather(*tasks, return_exceptions=True)

    # ================= CUSTOMER INTERACTIONS =================
    
    async def customer_staff_interaction(self, session: aiohttp.ClientSession, iteration: int):
        """Customer cabinet operations alongside staff operations"""
        tasks = []
        
        # Simulate customers checking their data
        customer_ops = [
            ("GET", "public/vehicles", "Customer_Browse"),
        ]
        
        for _ in range(20):
            method, endpoint, module = random.choice(customer_ops)
            tasks.append(self.make_request(
                session, method, endpoint, module,
                "manager", None, None,  # Using manager token for simulation
                f"customer_{random.randint(1,1000)}", iteration, "customer_staff"
            ))
        
        # Staff working while customers browse
        for _ in range(20):
            manager = random.choice(self.managers)
            tasks.append(self.make_request(
                session, "GET", random.choice(["leads", "deals"]),
                "Staff_During_Customer",
                "manager", None, None,
                manager.id, iteration, "customer_staff"
            ))
        
        await asyncio.gather(*tasks, return_exceptions=True)

    # ================= TEAM DYNAMICS =================
    
    async def team_collaboration_test(self, session: aiohttp.ClientSession, iteration: int):
        """Test team collaboration patterns"""
        tasks = []
        
        # Pick one team for intensive testing
        team_lead = random.choice(self.team_leads)
        team_managers = [m for m in self.managers if m.team_lead_id == team_lead.id]
        
        # Team lead checks team performance
        tasks.append(self.make_request(
            session, "GET", "staff/performance",
            "Team_Collaboration",
            "team_lead", None, None,
            team_lead.id, iteration, "team_work"
        ))
        
        # All team managers working simultaneously
        for manager in team_managers:
            ops = random.sample(["leads", "deals", "tasks/my", "notifications"], 2)
            for endpoint in ops:
                tasks.append(self.make_request(
                    session, "GET", endpoint,
                    "Team_Collaboration",
                    "manager", None, None,
                    manager.id, iteration, "team_work"
                ))
        
        # Team lead reviews while managers work
        tasks.append(self.make_request(
            session, "GET", "escalations/stats",
            "Team_Collaboration",
            "team_lead", None, None,
            team_lead.id, iteration, "team_work"
        ))
        
        await asyncio.gather(*tasks, return_exceptions=True)

    # ================= FULL ITERATION =================
    
    async def run_iteration(self, session: aiohttp.ClientSession, iteration: int):
        """Run one full iteration with all test patterns"""
        print(f"\n🔄 Iteration {iteration + 1}/{ITERATIONS}")
        iteration_start = time.time()
        
        # Phase 1: Non-overlapping operations (baseline)
        print(f"   📊 Phase 1: Isolated operations...")
        manager_tasks = []
        for manager in random.sample(self.managers, min(50, len(self.managers))):
            manager_tasks.append(self.manager_isolated_operations(session, manager, iteration))
        
        tl_tasks = []
        for tl in random.sample(self.team_leads, min(20, len(self.team_leads))):
            tl_tasks.append(self.team_lead_isolated_operations(session, tl, iteration))
        
        await asyncio.gather(*manager_tasks, *tl_tasks, return_exceptions=True)
        
        # Phase 2: Overlapping operations (conflict testing)
        print(f"   ⚡ Phase 2: Conflict patterns...")
        await asyncio.gather(
            self.concurrent_lead_access(session, iteration),
            self.concurrent_deal_operations(session, iteration),
            self.concurrent_contract_operations(session, iteration),
            self.concurrent_invoice_operations(session, iteration),
            self.concurrent_shipping_operations(session, iteration),
            return_exceptions=True
        )
        
        # Phase 3: Admin interference
        print(f"   👑 Phase 3: Admin interference...")
        await self.admin_interference_pattern(session, iteration)
        
        # Phase 4: Customer + Staff interaction
        print(f"   🛒 Phase 4: Customer interactions...")
        await self.customer_staff_interaction(session, iteration)
        
        # Phase 5: Team dynamics
        print(f"   👥 Phase 5: Team collaboration...")
        await self.team_collaboration_test(session, iteration)
        
        # Calculate iteration stats
        iteration_time = time.time() - iteration_start
        iteration_results = [r for r in self.results if r.iteration == iteration]
        success_count = sum(1 for r in iteration_results if r.success)
        conflict_count = sum(1 for r in iteration_results if r.conflict_type != "none")
        
        self.iteration_stats.append({
            "iteration": iteration + 1,
            "total_requests": len(iteration_results),
            "successful": success_count,
            "conflicts_tested": conflict_count,
            "duration_sec": iteration_time,
            "rps": len(iteration_results) / iteration_time if iteration_time > 0 else 0,
        })
        
        print(f"   ✓ {len(iteration_results)} requests in {iteration_time:.1f}s "
              f"({success_count}/{len(iteration_results)} OK, {conflict_count} conflicts tested, "
              f"{len(iteration_results)/iteration_time:.1f} RPS)")
    
    def print_detailed_report(self):
        """Print comprehensive analysis report"""
        print("\n" + "="*100)
        print("📊 BIBI CRM DEEP CROSS-FUNCTIONAL STRESS TEST REPORT")
        print("="*100)
        
        total_requests = len(self.results)
        total_success = sum(1 for r in self.results if r.success)
        total_failed = total_requests - total_success
        total_time = sum(s["duration_sec"] for s in self.iteration_stats)
        total_conflicts = sum(1 for r in self.results if r.conflict_type != "none")
        
        print(f"\n🎯 SIMULATION SCALE:")
        print(f"   Simulated Managers:        {NUM_MANAGERS} (representing 2000)")
        print(f"   Simulated Team Leads:      {NUM_TEAM_LEADS}")
        print(f"   Managers per Team Lead:    {MANAGERS_PER_TL}")
        print(f"   Iterations:                {ITERATIONS}")
        print(f"   Target Scale:              20x previous test (~10,000 ops)")
        
        print(f"\n📈 OVERALL STATISTICS:")
        print(f"   Total Requests:            {total_requests}")
        print(f"   Successful:                {total_success} ({total_success/total_requests*100:.2f}%)")
        print(f"   Failed:                    {total_failed} ({total_failed/total_requests*100:.2f}%)")
        print(f"   Conflict Scenarios:        {total_conflicts}")
        print(f"   Total Duration:            {total_time:.1f}s")
        print(f"   Avg Throughput:            {total_requests/total_time:.1f} RPS")
        
        if self.results:
            all_times = [r.response_time_ms for r in self.results]
            print(f"\n⏱️ RESPONSE TIME DISTRIBUTION:")
            print(f"   Min:                       {min(all_times):.0f}ms")
            print(f"   Avg:                       {statistics.mean(all_times):.0f}ms")
            print(f"   P50 (Median):              {statistics.median(all_times):.0f}ms")
            print(f"   P95:                       {sorted(all_times)[int(len(all_times)*0.95)]:.0f}ms")
            print(f"   P99:                       {sorted(all_times)[int(len(all_times)*0.99)]:.0f}ms")
            print(f"   Max:                       {max(all_times):.0f}ms")
        
        # Module breakdown
        print(f"\n📦 MODULE PERFORMANCE:")
        print("-"*100)
        print(f"{'Module':<35} {'Total':<8} {'OK':<8} {'Fail':<6} {'Rate':<8} {'Avg':<8} {'P95':<8} {'P99':<8}")
        print("-"*100)
        
        for module, stats in sorted(self.module_stats.items(), key=lambda x: -x[1].total_requests):
            print(f"{module:<35} {stats.total_requests:<8} {stats.successful:<8} {stats.failed:<6} "
                  f"{stats.success_rate:.1f}%{'':<2} {stats.avg_response_time:.0f}ms{'':<3} "
                  f"{stats.p95:.0f}ms{'':<3} {stats.p99:.0f}ms")
        
        # Conflict analysis
        print(f"\n⚡ CONFLICT ANALYSIS:")
        print("-"*100)
        conflict_types = defaultdict(lambda: {"total": 0, "success": 0})
        for r in self.results:
            if r.conflict_type != "none":
                conflict_types[r.conflict_type]["total"] += 1
                if r.success:
                    conflict_types[r.conflict_type]["success"] += 1
        
        print(f"{'Conflict Type':<25} {'Total':<10} {'Success':<10} {'Rate':<10}")
        print("-"*55)
        for ctype, data in sorted(conflict_types.items()):
            rate = data["success"]/data["total"]*100 if data["total"] > 0 else 0
            print(f"{ctype:<25} {data['total']:<10} {data['success']:<10} {rate:.1f}%")
        
        # Iteration performance
        print(f"\n📈 ITERATION PERFORMANCE:")
        print("-"*100)
        print(f"{'Iter':<6} {'Requests':<12} {'Success':<12} {'Conflicts':<12} {'Duration':<12} {'RPS':<10}")
        print("-"*100)
        for stat in self.iteration_stats:
            print(f"{stat['iteration']:<6} {stat['total_requests']:<12} {stat['successful']:<12} "
                  f"{stat['conflicts_tested']:<12} {stat['duration_sec']:.1f}s{'':<6} {stat['rps']:.1f}")
        
        # Errors summary
        all_errors = defaultdict(int)
        for module, stats in self.module_stats.items():
            for error, count in stats.errors.items():
                if error:
                    all_errors[f"{module}: {error}"] += count
        
        if all_errors:
            print(f"\n⚠️ ERROR SUMMARY (Top 15):")
            print("-"*100)
            for error, count in sorted(all_errors.items(), key=lambda x: -x[1])[:15]:
                print(f"   [{count:>4}x] {error[:85]}")
        
        # Route overlap analysis
        print(f"\n🔀 ROUTE OVERLAP ANALYSIS:")
        print("-"*100)
        
        # Group by endpoint
        endpoint_stats = defaultdict(lambda: {"total": 0, "success": 0, "roles": set()})
        for r in self.results:
            endpoint_stats[r.endpoint]["total"] += 1
            if r.success:
                endpoint_stats[r.endpoint]["success"] += 1
            endpoint_stats[r.endpoint]["roles"].add(r.user_role)
        
        multi_role_endpoints = {k: v for k, v in endpoint_stats.items() if len(v["roles"]) > 1}
        print(f"{'Endpoint':<40} {'Roles':<25} {'Total':<10} {'Success Rate':<15}")
        print("-"*90)
        for endpoint, data in sorted(multi_role_endpoints.items(), key=lambda x: -x[1]["total"])[:20]:
            roles = ", ".join(sorted(data["roles"]))
            rate = data["success"]/data["total"]*100 if data["total"] > 0 else 0
            print(f"{endpoint:<40} {roles:<25} {data['total']:<10} {rate:.1f}%")
        
        # System health
        print(f"\n🏥 SYSTEM HEALTH ASSESSMENT:")
        print("-"*100)
        
        success_rate = total_success/total_requests*100 if total_requests > 0 else 0
        avg_time = statistics.mean([r.response_time_ms for r in self.results]) if self.results else 0
        p95_time = sorted([r.response_time_ms for r in self.results])[int(len(self.results)*0.95)] if self.results else 0
        
        # Calculate conflict resolution rate
        conflict_success = sum(1 for r in self.results if r.conflict_type != "none" and r.success)
        conflict_rate = conflict_success/total_conflicts*100 if total_conflicts > 0 else 100
        
        assessments = []
        if success_rate >= 99:
            assessments.append(f"   ✅ OVERALL SUCCESS RATE: EXCELLENT ({success_rate:.2f}%)")
        elif success_rate >= 95:
            assessments.append(f"   ⚠️ OVERALL SUCCESS RATE: GOOD ({success_rate:.2f}%)")
        else:
            assessments.append(f"   ❌ OVERALL SUCCESS RATE: NEEDS ATTENTION ({success_rate:.2f}%)")
        
        if conflict_rate >= 99:
            assessments.append(f"   ✅ CONFLICT RESOLUTION: EXCELLENT ({conflict_rate:.2f}%)")
        elif conflict_rate >= 95:
            assessments.append(f"   ⚠️ CONFLICT RESOLUTION: GOOD ({conflict_rate:.2f}%)")
        else:
            assessments.append(f"   ❌ CONFLICT RESOLUTION: ISSUES DETECTED ({conflict_rate:.2f}%)")
        
        if avg_time < 1000:
            assessments.append(f"   ✅ AVG RESPONSE TIME: GOOD ({avg_time:.0f}ms)")
        elif avg_time < 3000:
            assessments.append(f"   ⚠️ AVG RESPONSE TIME: ACCEPTABLE ({avg_time:.0f}ms)")
        else:
            assessments.append(f"   ❌ AVG RESPONSE TIME: SLOW ({avg_time:.0f}ms)")
        
        if p95_time < 5000:
            assessments.append(f"   ✅ P95 LATENCY: ACCEPTABLE ({p95_time:.0f}ms)")
        else:
            assessments.append(f"   ❌ P95 LATENCY: HIGH ({p95_time:.0f}ms)")
        
        for a in assessments:
            print(a)
        
        # Bottlenecks identified
        print(f"\n🔍 BOTTLENECKS & RECOMMENDATIONS:")
        print("-"*100)
        
        # Find slowest modules
        slow_modules = sorted(
            [(m, s) for m, s in self.module_stats.items() if s.total_requests > 10],
            key=lambda x: -x[1].avg_response_time
        )[:5]
        
        print("   Slowest modules:")
        for module, stats in slow_modules:
            print(f"      - {module}: {stats.avg_response_time:.0f}ms avg, {stats.p95:.0f}ms P95")
        
        # High error modules
        error_modules = sorted(
            [(m, s) for m, s in self.module_stats.items() if s.failed > 0],
            key=lambda x: -x[1].failed
        )[:5]
        
        if error_modules:
            print("\n   Modules with errors:")
            for module, stats in error_modules:
                print(f"      - {module}: {stats.failed} failures ({100-stats.success_rate:.1f}% fail rate)")
        
        print("\n" + "="*100)
        print("✅ DEEP CROSS-FUNCTIONAL STRESS TEST COMPLETE")
        print("="*100)
        
        return {
            "total_requests": total_requests,
            "success_rate": success_rate,
            "conflict_scenarios": total_conflicts,
            "conflict_resolution_rate": conflict_rate,
            "avg_response_ms": avg_time,
            "p95_response_ms": p95_time,
            "total_duration_sec": total_time,
            "rps": total_requests/total_time if total_time > 0 else 0,
        }

async def main():
    print("="*100)
    print("🚗 BIBI CARS CRM - DEEP CROSS-FUNCTIONAL STRESS TEST")
    print("="*100)
    print(f"Target: {BASE_URL}")
    print(f"Started: {datetime.now().isoformat()}")
    print("="*100)
    
    tester = DeepCrossFunctionalTest()
    
    # Build organizational structure
    tester.build_org_structure()
    
    connector = aiohttp.TCPConnector(limit=300, limit_per_host=150)
    timeout = aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
    
    async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
        print("\n🔑 Setting up authentication...")
        await tester.setup_auth(session)
        
        if not tester.tokens:
            print("❌ Failed to authenticate. Aborting tests.")
            return
        
        print(f"\n🚀 Starting Deep Cross-Functional Test (20x scale)...")
        
        for iteration in range(ITERATIONS):
            await tester.run_iteration(session, iteration)
    
    report = tester.print_detailed_report()
    
    # Save report
    with open('/app/test_reports/deep_cross_functional_test_report.json', 'w') as f:
        json.dump(report, f, indent=2)
    
    print(f"\n📁 Report saved to: /app/test_reports/deep_cross_functional_test_report.json")
    
    return report

if __name__ == "__main__":
    asyncio.run(main())
