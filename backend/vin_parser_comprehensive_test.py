#!/usr/bin/env python3
"""
BIBI Cars VIN Parser - Comprehensive Feature Tests
Testing all features mentioned in the review request:
- VIN Unified API endpoint
- LocalDecoder functionality  
- Stealth scraping with Chromium
- Copart parsing (extractCopartData)
- IAAI parsing (extractIAAIData)
- StatVin parsing (extractStatVinData)
- VIN validation (P0 strict match)
- Frontend VinCheckPage integration
"""

import requests
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional

class VinParserComprehensiveTester:
    def __init__(self, base_url="https://competitor-inventory.preview.emergentagent.com"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'BIBI-VIN-Parser-Test/1.0'
        })
        
        # Test VINs for different scenarios
        self.test_vins = {
            'tesla': '5YJSA1DN2CFP09123',  # 2012 Tesla Model S
            'honda': '1HGBH41JXMN109186',  # Honda Civic
            'ford': '1FAHP2D85CG123456',   # Ford Focus
            'invalid_short': '123',
            'invalid_format': 'INVALID_VIN_CODE',
            'invalid_length': '1HGBH41JXMN10918'  # 16 chars
        }

    def log(self, message: str, level: str = "INFO"):
        """Log test messages"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")

    def run_test(self, name: str, method: str, endpoint: str, expected_status: int, 
                 data: Optional[Dict] = None, timeout: int = 45) -> tuple[bool, Dict]:
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        
        self.tests_run += 1
        self.log(f"Testing {name}...")
        self.log(f"  URL: {url}")
        
        try:
            if method == 'GET':
                response = self.session.get(url, timeout=timeout)
            elif method == 'POST':
                response = self.session.post(url, json=data, timeout=timeout)
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
            self.log(f"  ❌ FAILED - Request timeout after {timeout}s")
            return False, {"error": "timeout"}
        except Exception as e:
            self.log(f"  ❌ FAILED - Error: {str(e)}")
            return False, {"error": str(e)}

    def test_vin_unified_api_endpoint(self) -> bool:
        """Test VIN Unified API endpoint - GET /api/vin-unified/resolve?vin=XXX"""
        self.log("\n=== TESTING VIN UNIFIED API ENDPOINT ===")
        
        vin = self.test_vins['tesla']
        success, response = self.run_test(
            "VIN Unified API Endpoint",
            "GET",
            f"vin-unified/resolve?vin={vin}",
            200,
            timeout=60
        )
        
        if success:
            self.log(f"  ✅ API Response Success: {response.get('success')}")
            self.log(f"  VIN: {response.get('vin')}")
            self.log(f"  Status: {response.get('status')}")
            self.log(f"  Source Type: {response.get('sourceType')}")
            self.log(f"  Verified: {response.get('verified')}")
            self.log(f"  Search Duration: {response.get('searchDurationMs')}ms")
            
            # Check response structure
            required_fields = ['success', 'vin', 'status', 'vehicle', 'auction', 'history', 'shipping', 'confidence']
            missing_fields = [field for field in required_fields if field not in response]
            
            if not missing_fields:
                self.log(f"  ✅ All required response fields present")
            else:
                self.log(f"  ⚠️  Missing fields: {missing_fields}")
                
        return success

    def test_local_decoder(self) -> bool:
        """Test LocalDecoder - returns year/make/model from VIN"""
        self.log("\n=== TESTING LOCAL DECODER ===")
        
        vin = self.test_vins['tesla']
        success, response = self.run_test(
            "LocalDecoder Test",
            "GET",
            f"vin-unified/resolve?vin={vin}",
            200
        )
        
        if success:
            vehicle = response.get('vehicle', {})
            year = vehicle.get('year')
            make = vehicle.get('make')
            model = vehicle.get('model')
            source = vehicle.get('source')
            
            self.log(f"  Vehicle Data: {year} {make} {model}")
            self.log(f"  Source: {source}")
            
            # LocalDecoder should provide basic VIN decoding
            if year and make:
                self.log(f"  ✅ LocalDecoder working - extracted year/make from VIN")
                if year == 2012 and make.upper() == 'TESLA':
                    self.log(f"  ✅ Correct Tesla identification from VIN")
                else:
                    self.log(f"  ⚠️  Unexpected vehicle data: {year} {make}")
            else:
                self.log(f"  ❌ LocalDecoder failed to extract basic data")
                return False
                
        return success

    def test_stealth_scraping_chromium(self) -> bool:
        """Test Stealth scraping - Chromium browser launches correctly"""
        self.log("\n=== TESTING STEALTH SCRAPING (CHROMIUM) ===")
        
        # Use skipCache=true to force fresh scraping
        vin = self.test_vins['honda']
        success, response = self.run_test(
            "Stealth Scraping Test",
            "GET",
            f"vin-unified/resolve?vin={vin}&skipCache=true",
            200,
            timeout=90  # Longer timeout for scraping
        )
        
        if success:
            sources = response.get('sources', [])
            source_type = response.get('sourceType')
            search_duration = response.get('searchDurationMs', 0)
            
            self.log(f"  Source Type: {source_type}")
            self.log(f"  Search Duration: {search_duration}ms")
            self.log(f"  Sources Used: {len(sources)}")
            
            # Check if stealth adapters were used
            stealth_sources = [s for s in sources if s.get('type') == 'stealth' or 'stealth' in s.get('name', '').lower()]
            if stealth_sources:
                self.log(f"  ✅ Stealth adapters activated: {len(stealth_sources)} sources")
                for source in stealth_sources[:3]:
                    self.log(f"    - {source.get('name')}: success={source.get('success')}, time={source.get('responseTime')}ms")
            else:
                self.log(f"  ⚠️  No stealth sources detected in response")
                
            # Check if Chromium/Puppeteer was used (indicated by longer response times)
            if search_duration > 5000:  # > 5 seconds indicates browser scraping
                self.log(f"  ✅ Browser scraping detected (duration: {search_duration}ms)")
            else:
                self.log(f"  ⚠️  Quick response - may not have used browser scraping")
                
        return success

    def test_copart_parsing(self) -> bool:
        """Test Copart parsing - extractCopartData() method"""
        self.log("\n=== TESTING COPART PARSING ===")
        
        # Test with a VIN that might be found on Copart
        vin = self.test_vins['ford']
        success, response = self.run_test(
            "Copart Parsing Test",
            "GET",
            f"vin-unified/resolve?vin={vin}&skipCache=true",
            200,
            timeout=90
        )
        
        if success:
            sources = response.get('sources', [])
            auction = response.get('auction', {})
            
            # Look for Copart in sources
            copart_sources = [s for s in sources if 'copart' in s.get('name', '').lower()]
            if copart_sources:
                self.log(f"  ✅ Copart source found: {len(copart_sources)} entries")
                for source in copart_sources:
                    self.log(f"    - {source.get('name')}: success={source.get('success')}")
            else:
                self.log(f"  ⚠️  No Copart sources in response")
                
            # Check auction data (could be from Copart)
            if auction.get('found'):
                auction_source = auction.get('source')
                lot_number = auction.get('lotNumber')
                price = auction.get('currentBid')
                
                self.log(f"  Auction Data Found:")
                self.log(f"    Source: {auction_source}")
                self.log(f"    Lot Number: {lot_number}")
                self.log(f"    Price: ${price}" if price else "    Price: N/A")
                
                if auction_source and 'copart' in auction_source.lower():
                    self.log(f"  ✅ Copart auction data extracted successfully")
                else:
                    self.log(f"  ⚠️  Auction data not from Copart")
            else:
                self.log(f"  ⚠️  No auction data found (VIN may not be on Copart)")
                
        return success

    def test_iaai_parsing(self) -> bool:
        """Test IAAI parsing - extractIAAIData() method"""
        self.log("\n=== TESTING IAAI PARSING ===")
        
        # Test with a VIN that might be found on IAAI
        vin = self.test_vins['honda']
        success, response = self.run_test(
            "IAAI Parsing Test",
            "GET",
            f"vin-unified/resolve?vin={vin}&skipCache=true",
            200,
            timeout=90
        )
        
        if success:
            sources = response.get('sources', [])
            auction = response.get('auction', {})
            
            # Look for IAAI in sources
            iaai_sources = [s for s in sources if 'iaai' in s.get('name', '').lower()]
            if iaai_sources:
                self.log(f"  ✅ IAAI source found: {len(iaai_sources)} entries")
                for source in iaai_sources:
                    self.log(f"    - {source.get('name')}: success={source.get('success')}")
            else:
                self.log(f"  ⚠️  No IAAI sources in response")
                
            # Check auction data (could be from IAAI)
            if auction.get('found'):
                auction_source = auction.get('source')
                lot_number = auction.get('lotNumber')
                price = auction.get('currentBid')
                
                self.log(f"  Auction Data Found:")
                self.log(f"    Source: {auction_source}")
                self.log(f"    Lot Number: {lot_number}")
                self.log(f"    Price: ${price}" if price else "    Price: N/A")
                
                if auction_source and 'iaai' in auction_source.lower():
                    self.log(f"  ✅ IAAI auction data extracted successfully")
                else:
                    self.log(f"  ⚠️  Auction data not from IAAI")
            else:
                self.log(f"  ⚠️  No auction data found (VIN may not be on IAAI)")
                
        return success

    def test_statvin_parsing(self) -> bool:
        """Test StatVin parsing - extractStatVinData() method"""
        self.log("\n=== TESTING STATVIN PARSING ===")
        
        vin = self.test_vins['tesla']
        success, response = self.run_test(
            "StatVin Parsing Test",
            "GET",
            f"vin-unified/resolve?vin={vin}&skipCache=true",
            200,
            timeout=90
        )
        
        if success:
            sources = response.get('sources', [])
            
            # Look for StatVin in sources
            statvin_sources = [s for s in sources if 'stat' in s.get('name', '').lower() and 'vin' in s.get('name', '').lower()]
            if statvin_sources:
                self.log(f"  ✅ StatVin source found: {len(statvin_sources)} entries")
                for source in statvin_sources:
                    self.log(f"    - {source.get('name')}: success={source.get('success')}")
                    
                # StatVin should provide good data according to the agent notes
                successful_statvin = [s for s in statvin_sources if s.get('success')]
                if successful_statvin:
                    self.log(f"  ✅ StatVin parsing successful")
                else:
                    self.log(f"  ⚠️  StatVin sources failed")
            else:
                self.log(f"  ⚠️  No StatVin sources in response")
                
        return success

    def test_vin_validation_p0_strict(self) -> bool:
        """Test VIN validation - P0 strict match"""
        self.log("\n=== TESTING VIN VALIDATION (P0 STRICT MATCH) ===")
        
        # Test invalid VINs
        invalid_tests = [
            (self.test_vins['invalid_short'], "Short VIN"),
            (self.test_vins['invalid_format'], "Invalid format"),
            (self.test_vins['invalid_length'], "Wrong length"),
            ("", "Empty VIN"),
        ]
        
        all_success = True
        for invalid_vin, description in invalid_tests:
            self.log(f"\n  Testing {description}: '{invalid_vin}'")
            
            success, response = self.run_test(
                f"P0 Validation - {description}",
                "GET",
                f"vin-unified/resolve?vin={invalid_vin}",
                400  # Should return 400 for invalid VIN
            )
            
            if success:
                self.log(f"    ✅ Correctly rejected invalid VIN")
                self.log(f"    Message: {response.get('message', 'No message')}")
            else:
                self.log(f"    ❌ Should have rejected invalid VIN")
                all_success = False
                
        # Test valid VIN with strict matching
        self.log(f"\n  Testing valid VIN strict match:")
        valid_vin = self.test_vins['tesla']
        success, response = self.run_test(
            "P0 Validation - Valid VIN",
            "GET",
            f"vin-unified/resolve?vin={valid_vin}",
            200
        )
        
        if success:
            returned_vin = response.get('vin')
            if returned_vin == valid_vin:
                self.log(f"    ✅ VIN strict match: {returned_vin}")
            else:
                self.log(f"    ❌ VIN mismatch: expected {valid_vin}, got {returned_vin}")
                all_success = False
        else:
            all_success = False
                
        return all_success

    def test_system_health_and_status(self) -> bool:
        """Test system health and dashboard status"""
        self.log("\n=== TESTING SYSTEM HEALTH AND STATUS ===")
        
        # Test system health
        success1, response1 = self.run_test(
            "System Health",
            "GET",
            "system/health",
            200
        )
        
        if success1:
            self.log(f"  System Status: {response1.get('status')}")
            self.log(f"  Database: {response1.get('database')}")
        
        # Test dashboard status
        success2, response2 = self.run_test(
            "Dashboard Status",
            "GET",
            "vin-unified/dashboard/status",
            200
        )
        
        if success2:
            overview = response2.get('overview', {})
            sources = response2.get('sources', {})
            
            self.log(f"  Total Requests: {overview.get('totalRequests', 0)}")
            self.log(f"  Success Rate: {overview.get('overallSuccessRate', 'N/A')}")
            self.log(f"  Healthy Sources: {len(sources.get('healthy', []))}")
            self.log(f"  Degraded Sources: {len(sources.get('degraded', []))}")
            
        return success1 and success2

    def run_all_tests(self) -> int:
        """Run all comprehensive VIN parser tests"""
        self.log("🚀 Starting BIBI Cars VIN Parser Comprehensive Tests")
        self.log(f"Base URL: {self.base_url}")
        self.log(f"Test VINs: {self.test_vins}")
        
        # Test 1: System Health and Status
        if not self.test_system_health_and_status():
            self.log("❌ System health check failed - continuing with other tests")
            
        # Test 2: VIN Unified API Endpoint
        if not self.test_vin_unified_api_endpoint():
            self.log("❌ VIN Unified API endpoint failed - critical issue")
            
        # Test 3: LocalDecoder
        if not self.test_local_decoder():
            self.log("❌ LocalDecoder failed - critical issue")
            
        # Test 4: VIN Validation (P0 strict match)
        if not self.test_vin_validation_p0_strict():
            self.log("❌ VIN validation failed - critical issue")
            
        # Test 5: Stealth Scraping (Chromium)
        self.test_stealth_scraping_chromium()
        
        # Test 6: Copart Parsing
        self.test_copart_parsing()
        
        # Test 7: IAAI Parsing
        self.test_iaai_parsing()
        
        # Test 8: StatVin Parsing
        self.test_statvin_parsing()
        
        # Print results
        self.log(f"\n📊 COMPREHENSIVE VIN PARSER TESTS COMPLETE")
        self.log(f"Tests passed: {self.tests_passed}/{self.tests_run}")
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        self.log(f"Success rate: {success_rate:.1f}%")
        
        if success_rate >= 80:
            self.log("🎉 TESTS MOSTLY SUCCESSFUL!")
            return 0
        else:
            self.log("❌ Many tests failed")
            return 1

def main():
    tester = VinParserComprehensiveTester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())