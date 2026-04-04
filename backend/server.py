"""
FastAPI proxy server that starts NestJS backend and proxies all requests.
Version 2.0 - Improved cold start handling
"""
import subprocess
import os
import sys
import time
import httpx
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import asyncio
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("BibiProxy")

NESTJS_PORT = 8002  # Internal NestJS port
STARTUP_TIMEOUT = 60  # seconds
HEALTH_CHECK_INTERVAL = 2  # seconds
nestjs_process = None

async def wait_for_nestjs(max_attempts: int = 30) -> bool:
    """Wait for NestJS to be ready with health checks"""
    logger.info(f"Waiting for NestJS on port {NESTJS_PORT}...")
    
    for attempt in range(max_attempts):
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f'http://localhost:{NESTJS_PORT}/api/system/health',
                    timeout=2
                )
                if response.status_code == 200:
                    data = response.json()
                    if data.get('status') in ['healthy', 'degraded']:
                        logger.info(f"✓ NestJS ready after {(attempt + 1) * HEALTH_CHECK_INTERVAL}s")
                        return True
        except Exception as e:
            logger.debug(f"Health check attempt {attempt + 1}: {e}")
        
        await asyncio.sleep(HEALTH_CHECK_INTERVAL)
    
    logger.error(f"NestJS failed to start after {max_attempts * HEALTH_CHECK_INTERVAL}s")
    return False

@asynccontextmanager
async def lifespan(app: FastAPI):
    global nestjs_process
    
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Environment for NestJS
    env = {
        **os.environ,
        'NODE_ENV': 'development',
        'PORT': str(NESTJS_PORT),
    }
    
    # Path to ts-node
    ts_node_path = os.path.join(backend_dir, 'node_modules', '.bin', 'ts-node')
    
    if not os.path.exists(ts_node_path):
        logger.error(f"ts-node not found at {ts_node_path}")
        raise RuntimeError("ts-node not installed")
    
    logger.info("Starting NestJS backend...")
    
    # Start NestJS process
    nestjs_process = subprocess.Popen(
        [ts_node_path, '-r', 'tsconfig-paths/register', 'src/main.ts'],
        cwd=backend_dir,
        env=env,
        stdout=sys.stdout,
        stderr=sys.stderr
    )
    
    # Wait for NestJS to be ready
    is_ready = await wait_for_nestjs()
    
    if not is_ready:
        logger.warning("NestJS may not be fully ready, continuing anyway...")
    
    yield
    
    # Cleanup
    if nestjs_process:
        logger.info("Shutting down NestJS...")
        nestjs_process.terminate()
        try:
            nestjs_process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            nestjs_process.kill()
            nestjs_process.wait()

app = FastAPI(lifespan=lifespan, title="BIBI CRM Proxy")

@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def proxy(request: Request, path: str):
    url = f"http://localhost:{NESTJS_PORT}/{path}"
    
    headers = dict(request.headers)
    headers.pop("host", None)
    
    body = await request.body()
    
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.request(
                method=request.method,
                url=url,
                headers=headers,
                content=body,
                params=dict(request.query_params)
            )
            
            return Response(
                content=response.content,
                status_code=response.status_code,
                headers=dict(response.headers)
            )
    except httpx.ConnectError:
        return JSONResponse(
            status_code=503,
            content={"error": "Service starting", "message": "Backend is initializing, please retry"}
        )
    except httpx.TimeoutException:
        return JSONResponse(
            status_code=504,
            content={"error": "Timeout", "message": "Backend request timed out"}
        )
    except Exception as e:
        return JSONResponse(
            status_code=502,
            content={"error": str(e), "message": "Backend unavailable"}
        )
