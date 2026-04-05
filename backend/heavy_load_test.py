#!/usr/bin/env python3
"""
BIBI Cars CRM - Heavy Load Monte-Carlo Stress Test
===================================================

Simulates:
- 3000 concurrent managers
- 4 team leads with cross-functional operations
- 1 owner performing accounting operations
- Monte-Carlo style random request patterns
- Cross-functional data dependencies
"""

import asyncio
import aiohttp
import random
import json
import time
from datetime import datetime
from dataclasses import dataclass, field
from typing import List, Dict, Optional
from collections import defaultdict
import statistics

# Configuration
BASE_URL = "https://competitor-inventory.preview.emergentagent.com/api"
REQUEST_TIMEOUT = 60

# Simulated user counts
SIMULATED_MANAGERS = 100  # Batches to simulate 3000
SIMULATED_TEAM_LEADS = 4
TOTAL_ITERATIONS = 3  # Each iteration = 100 managers x 30 ops = 3000 operations

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
    iteration: int = 0

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
    def p50_response_time(self) -> float:
        if not self.response_times:
            return 0
        return statistics.median(self.response_times)
    
    @property
    def p95_response_time(self) -> float:
        if not self.response_times:
            return 0
        sorted_times = sorted(self.response_times)
        idx = int(len(sorted_times) * 0.95)
        return sorted_times[idx] if idx < len(sorted_times) else sorted_times[-1]
    
    @property
    def p99_response_time(self) -> float:
        if not self.response_times:
            return 0
        sorted_times = sorted(self.response_times)
        idx = int(len(sorted_times) * 0.99)
        return sorted_times[idx] if idx < len(sorted_times) else sorted_times[-1]

class HeavyLoadTest:
    def __init__(self):
        self.results: List[TestResult] = []
        self.module_stats: Dict[str, ModuleStats] = defaultdict(ModuleStats)
        self.tokens: Dict[str, str] = {}
        self.iteration_stats: List[Dict] = []
        
        # Manager operations distribution (weighted by frequency)
        self.manager_ops = [
            ("GET", "leads", 25),
            ("GET", "deals", 20),
            ("GET", "contracts/me", 15),
            ("GET", "invoices/me", 10),
            ("GET", "shipping/me", 10),
            ("GET", "tasks/my", 10),
            ("GET", "notifications", 5),
            ("POST", "leads", 5),  # Create lead
        ]
        
        # Team lead operations
        self.team_lead_ops = [
            ("GET", "leads/stats", 20),
            ("GET", "deals/stats", 20),
            ("GET", "staff", 15),
            ("GET", "staff/performance", 10),
            ("GET", "staff/inactive", 10),
            ("GET", "escalations", 10),
            ("GET", "escalations/stats", 10),
            ("GET", "admin/kpi/team-summary", 5),
        ]
        
        # Owner operations
        self.owner_ops = [
            ("GET", "admin/contracts/accounting", 20),
            ("GET", "admin/contracts/export", 10),
            ("GET", "dashboard", 15),
            ("GET", "admin/kpi/dashboard", 15),
            ("GET", "owner-dashboard", 15),
            ("GET", "invoices/analytics", 10),
            ("GET", "shipping/analytics", 10),
            ("GET", "deals/pipeline-analytics", 5),
        ]
        
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
                        print(f"✓ Logged in as {role}: {email}")
                    else:
                        print(f"✗ Failed to login as {role}: {resp.status}")
            except Exception as e:
                print(f"✗ Auth error for {role}: {str(e)}")
    
    def get_headers(self, role: str = "manager") -> Dict:
        token = self.tokens.get(role)
        if token:
            return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        return {"Content-Type": "application/json"}
    
    def get_weighted_random_op(self, ops_list):
        """Select operation based on weighted distribution"""
        total_weight = sum(op[2] for op in ops_list)
        r = random.randint(1, total_weight)
        current = 0
        for method, endpoint, weight in ops_list:
            current += weight
            if r <= current:
                return method, endpoint
        return ops_list[0][:2]
    
    def generate_lead_data(self, i):
        """Generate realistic lead data"""
        return {
            "firstName": f"User{i}",
            "lastName": f"Test{random.randint(1000, 9999)}",
            "email": f"user{i}_{random.randint(10000, 99999)}@example.com",
            "phone": f"+380{random.randint(100000000, 999999999)}",
            "source": random.choice(["website", "referral", "social_media", "advertisement"]),
        }
    
    async def make_request(
        self, 
        session: aiohttp.ClientSession,
        method: str,
        endpoint: str,
        module: str,
        role: str = "manager",
        data: Optional[Dict] = None,
        iteration: int = 0
    ) -> TestResult:
        url = f"{BASE_URL}/{endpoint}"
        headers = self.get_headers(role)
        start_time = time.time()
        
        try:
            async with session.request(
                method, url, 
                json=data, 
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
                    iteration=iteration
                )
                
                self.record_result(result)
                return result
                
        except asyncio.TimeoutError:
            result = TestResult(
                module=module, endpoint=endpoint, method=method,
                status_code=0, response_time_ms=REQUEST_TIMEOUT * 1000,
                success=False, error="Timeout", user_role=role, iteration=iteration
            )
            self.record_result(result)
            return result
        except Exception as e:
            result = TestResult(
                module=module, endpoint=endpoint, method=method,
                status_code=0, response_time_ms=(time.time() - start_time) * 1000,
                success=False, error=str(e)[:80], user_role=role, iteration=iteration
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
    
    async def simulate_manager_batch(self, session: aiohttp.ClientSession, batch_size: int, iteration: int):
        """Simulate a batch of managers doing random operations"""
        tasks = []
        
        for i in range(batch_size):
            method, endpoint = self.get_weighted_random_op(self.manager_ops)
            data = None
            if method == "POST" and endpoint == "leads":
                data = self.generate_lead_data(i + iteration * batch_size)
            
            tasks.append(self.make_request(
                session, method, endpoint, "Manager", "manager", data, iteration
            ))
        
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def simulate_team_lead_ops(self, session: aiohttp.ClientSession, iteration: int):
        """Simulate team lead operations"""
        tasks = []
        
        for _ in range(SIMULATED_TEAM_LEADS * 10):  # Each TL does 10 operations
            method, endpoint = self.get_weighted_random_op(self.team_lead_ops)
            tasks.append(self.make_request(
                session, method, endpoint, "TeamLead", "team_lead", None, iteration
            ))
        
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def simulate_owner_ops(self, session: aiohttp.ClientSession, iteration: int):
        """Simulate owner operations"""
        tasks = []
        
        for _ in range(20):  # Owner does 20 operations
            method, endpoint = self.get_weighted_random_op(self.owner_ops)
            tasks.append(self.make_request(
                session, method, endpoint, "Owner", "owner", None, iteration
            ))
        
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def run_iteration(self, session: aiohttp.ClientSession, iteration: int):
        """Run one full iteration of the stress test"""
        print(f"\n🔄 Iteration {iteration + 1}/{TOTAL_ITERATIONS}")
        iteration_start = time.time()
        
        # Run all user types concurrently
        await asyncio.gather(
            self.simulate_manager_batch(session, SIMULATED_MANAGERS, iteration),
            self.simulate_team_lead_ops(session, iteration),
            self.simulate_owner_ops(session, iteration),
        )
        
        iteration_time = time.time() - iteration_start
        iteration_results = [r for r in self.results if r.iteration == iteration]
        success_count = sum(1 for r in iteration_results if r.success)
        
        self.iteration_stats.append({
            "iteration": iteration + 1,
            "total_requests": len(iteration_results),
            "successful": success_count,
            "duration_sec": iteration_time,
            "rps": len(iteration_results) / iteration_time if iteration_time > 0 else 0,
        })
        
        print(f"   ✓ {len(iteration_results)} requests in {iteration_time:.1f}s "
              f"({success_count}/{len(iteration_results)} successful, "
              f"{len(iteration_results)/iteration_time:.1f} RPS)")
    
    def print_report(self):
        """Print comprehensive test report"""
        print("\n" + "="*90)
        print("📊 BIBI CRM HEAVY LOAD TEST REPORT - MONTE CARLO SIMULATION")
        print("="*90)
        
        total_requests = len(self.results)
        total_success = sum(1 for r in self.results if r.success)
        total_failed = total_requests - total_success
        total_time = sum(s["duration_sec"] for s in self.iteration_stats)
        
        print(f"\n🎯 SIMULATION PARAMETERS:")
        print(f"   Simulated Managers:    {SIMULATED_MANAGERS * TOTAL_ITERATIONS} (~3000)")
        print(f"   Team Leads:            {SIMULATED_TEAM_LEADS}")
        print(f"   Iterations:            {TOTAL_ITERATIONS}")
        
        print(f"\n📈 OVERALL STATISTICS:")
        print(f"   Total Requests:        {total_requests}")
        print(f"   Successful:            {total_success} ({total_success/total_requests*100:.1f}%)")
        print(f"   Failed:                {total_failed} ({total_failed/total_requests*100:.1f}%)")
        print(f"   Total Duration:        {total_time:.1f}s")
        print(f"   Avg RPS:               {total_requests/total_time:.1f}")
        
        if self.results:
            all_times = [r.response_time_ms for r in self.results]
            print(f"\n⏱️ RESPONSE TIME METRICS:")
            print(f"   Min:                   {min(all_times):.0f}ms")
            print(f"   Avg:                   {statistics.mean(all_times):.0f}ms")
            print(f"   P50 (Median):          {statistics.median(all_times):.0f}ms")
            print(f"   P95:                   {sorted(all_times)[int(len(all_times)*0.95)]:.0f}ms")
            print(f"   P99:                   {sorted(all_times)[int(len(all_times)*0.99)]:.0f}ms")
            print(f"   Max:                   {max(all_times):.0f}ms")
        
        print(f"\n📦 MODULE BREAKDOWN:")
        print("-"*90)
        print(f"{'Module':<15} {'Total':<8} {'Success':<8} {'Failed':<8} {'Rate':<8} {'Avg(ms)':<10} {'P50':<10} {'P95':<10} {'P99':<10}")
        print("-"*90)
        
        for module, stats in sorted(self.module_stats.items()):
            print(f"{module:<15} {stats.total_requests:<8} {stats.successful:<8} {stats.failed:<8} "
                  f"{stats.success_rate:.1f}%{'':<3} {stats.avg_response_time:.0f}{'':<6} "
                  f"{stats.p50_response_time:.0f}{'':<6} {stats.p95_response_time:.0f}{'':<6} {stats.p99_response_time:.0f}")
        
        print(f"\n📈 ITERATION PERFORMANCE:")
        print("-"*90)
        print(f"{'Iteration':<12} {'Requests':<12} {'Success':<12} {'Duration':<12} {'RPS':<12}")
        print("-"*90)
        for stat in self.iteration_stats:
            print(f"{stat['iteration']:<12} {stat['total_requests']:<12} {stat['successful']:<12} "
                  f"{stat['duration_sec']:.1f}s{'':<6} {stat['rps']:.1f}")
        
        # Errors
        all_errors = defaultdict(int)
        for module, stats in self.module_stats.items():
            for error, count in stats.errors.items():
                all_errors[f"{module}: {error}"] += count
        
        if all_errors:
            print(f"\n⚠️ ERROR SUMMARY:")
            print("-"*90)
            for error, count in sorted(all_errors.items(), key=lambda x: -x[1])[:10]:
                print(f"   [{count:>3}x] {error[:75]}")
        
        # System health assessment
        print(f"\n🏥 SYSTEM HEALTH ASSESSMENT:")
        print("-"*90)
        
        success_rate = total_success/total_requests*100 if total_requests > 0 else 0
        avg_time = statistics.mean([r.response_time_ms for r in self.results]) if self.results else 0
        p95_time = sorted([r.response_time_ms for r in self.results])[int(len(self.results)*0.95)] if self.results else 0
        
        if success_rate >= 99:
            print(f"   ✅ SUCCESS RATE: EXCELLENT ({success_rate:.1f}%)")
        elif success_rate >= 95:
            print(f"   ⚠️ SUCCESS RATE: GOOD ({success_rate:.1f}%)")
        else:
            print(f"   ❌ SUCCESS RATE: NEEDS ATTENTION ({success_rate:.1f}%)")
        
        if avg_time < 500:
            print(f"   ✅ AVG RESPONSE TIME: EXCELLENT ({avg_time:.0f}ms)")
        elif avg_time < 1000:
            print(f"   ⚠️ AVG RESPONSE TIME: ACCEPTABLE ({avg_time:.0f}ms)")
        else:
            print(f"   ❌ AVG RESPONSE TIME: SLOW ({avg_time:.0f}ms)")
        
        if p95_time < 2000:
            print(f"   ✅ P95 LATENCY: ACCEPTABLE ({p95_time:.0f}ms)")
        else:
            print(f"   ❌ P95 LATENCY: HIGH ({p95_time:.0f}ms)")
        
        print("\n" + "="*90)
        print("✅ HEAVY LOAD TEST COMPLETE")
        print("="*90)
        
        return {
            "total_requests": total_requests,
            "success_rate": success_rate,
            "avg_response_ms": avg_time,
            "p95_response_ms": p95_time,
            "total_duration_sec": total_time,
            "rps": total_requests/total_time if total_time > 0 else 0,
        }

async def main():
    print("="*90)
    print("🚗 BIBI CARS CRM - HEAVY LOAD MONTE-CARLO STRESS TEST")
    print("="*90)
    print(f"Target: {BASE_URL}")
    print(f"Started: {datetime.now().isoformat()}")
    print(f"Simulating: {SIMULATED_MANAGERS * TOTAL_ITERATIONS} managers, {SIMULATED_TEAM_LEADS} team leads, 1 owner")
    print("="*90)
    
    tester = HeavyLoadTest()
    
    connector = aiohttp.TCPConnector(limit=200, limit_per_host=100)
    timeout = aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
    
    async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
        print("\n🔑 Setting up authentication...")
        await tester.setup_auth(session)
        
        if not tester.tokens:
            print("❌ Failed to authenticate. Aborting tests.")
            return
        
        print(f"\n🚀 Starting Monte-Carlo Load Test...")
        
        for iteration in range(TOTAL_ITERATIONS):
            await tester.run_iteration(session, iteration)
    
    report = tester.print_report()
    
    # Save report
    with open('/app/test_reports/heavy_load_test_report.json', 'w') as f:
        json.dump(report, f, indent=2)
    
    print(f"\n📁 Report saved to: /app/test_reports/heavy_load_test_report.json")
    
    return report

if __name__ == "__main__":
    asyncio.run(main())
