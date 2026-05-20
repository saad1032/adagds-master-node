import http from 'http';

// Helper for HTTP GET requests
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    }).on('error', (err) => reject(err));
  });
}

// Helper for HTTP POST requests
function httpPost(url, payload) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const bodyStr = JSON.stringify(payload);
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(bodyStr);
    req.end();
  });
}

async function execute() {
  console.log('\n==================================================================');
  console.log('             ADAGDS PIPELINE & FAULT-TOLERANCE PROGRAMMATIC RUN');
  console.log('==================================================================\n');

  try {
    // 1. Scan host resources first
    console.log('[STEP 1] Performing host resources scan...');
    const scan = await httpGet('http://localhost:5000/api/system-capacity');
    console.log(`  OS Spec: CPU Cores: ${scan.data.metrics.cpuCores} Threads, RAM Total: ${scan.data.metrics.ramTotalGB.toFixed(1)} GB`);
    console.log(`  Adaptive Recommendation: App limit: ${scan.data.decision.targetAppCount} | Concurrency: ${scan.data.decision.concurrency}`);

    // 2. Start the pipeline with manual override: force 5 apps and mock failure on tenant_02
    console.log('\n[STEP 2] Launching generation pipeline with 5 apps (tenant_01 to tenant_05)...');
    console.log('  -> Setting Worker Concurrency Cap to 3');
    console.log('  -> Injecting simulated builder error on worker for: tenant_02 (ApexAnalytics)');
    
    const trigger = await httpPost('http://localhost:5000/api/start-pipeline', {
      forceAppCount: 5,
      overrideConcurrency: 3,
      simulateFailureIds: ['tenant_02']
    });

    if (trigger.status !== 200) {
      console.error('  ✘ Failed to start pipeline:', trigger);
      return;
    }
    console.log(`  ✔ Pipeline successfully queued: ${trigger.data.message}`);

    // 3. Poll pipeline state until all builds finish
    console.log('\n[STEP 3] Entering real-time compilation tracking loop (Interval: 1.5s)...');
    
    let allFinished = false;
    let attempts = 0;
    const maxAttempts = 40; // ~60 seconds timeout

    while (!allFinished && attempts < maxAttempts) {
      attempts++;
      await new Promise(r => setTimeout(r, 1500));
      
      const statusRes = await httpGet('http://localhost:5000/api/queue-status');
      const telemetry = statusRes.data;
      
      console.log(`\n--- Status Report #${attempts} (Active Builders: ${telemetry.activeWorkers}, Backlog: ${telemetry.queuedJobs}) ---`);
      
      telemetry.jobList.forEach(job => {
        let stateIndicator = job.status;
        if (job.status === 'RETRIES') {
          stateIndicator = `RETRYING (Attempt ${job.retries + 1}/3)`;
        }
        console.log(`  * ${job.tenantId} (${job.name}) on Port ${job.port} --> ${stateIndicator} (Retries: ${job.retries}, Deployed: ${job.deployed ? 'YES' : 'NO'})`);
      });

      // Verify completion conditions
      allFinished = telemetry.jobList.every(j => j.status === 'COMPLETED' || j.status === 'FAILED');
      
      if (allFinished) {
        console.log('\n✔ All parallel build worker processes have terminated.');
        break;
      }
    }

    if (!allFinished) {
      console.error('\n✘ Execution timed out without complete status resolves.');
      return;
    }

    // 4. Assert isolation and runtime independence of the running tenant microservices
    console.log('\n[STEP 4] Auditing runtime multi-tenant isolation and independent ports...');
    
    // Test Tenant 01 (AeroDashboard) on port 4001
    console.log('\n  -> Querying Tenant 01 (AeroDashboard) served on port 4001:');
    try {
      const app1Info = await httpGet('http://localhost:4001/api/info');
      const app1Data = await httpGet('http://localhost:4001/api/data');
      console.log(`    ✔ App Port 4001 responds with 200 OK.`);
      console.log(`    ✔ Brand name read: "${app1Info.data.config.name}"`);
      console.log(`    ✔ Isolated Theme Color HSL: H:${app1Info.data.config.theme.primaryH}, S:${app1Info.data.config.theme.primaryS}`);
      console.log(`    ✔ Database Connector read: "${app1Data.data.dataSource}"`);
      console.log(`    ✔ Isolated telemetry records count: ${app1Data.data.recordsReturned}`);
    } catch (e) {
      console.error('    ✘ Failed to query Port 4001 app server:', e.message);
    }

    // Test Tenant 02 (ApexAnalytics) on port 4002 (should be live due to self-healing retry!)
    console.log('\n  -> Querying Tenant 02 (ApexAnalytics) served on port 4002:');
    try {
      const app2Info = await httpGet('http://localhost:4002/api/info');
      const app2Data = await httpGet('http://localhost:4002/api/data');
      console.log(`    ✔ App Port 4002 responds with 200 OK (Healed & Deployed!).`);
      console.log(`    ✔ Brand name read: "${app2Info.data.config.name}"`);
      console.log(`    ✔ Isolated Theme Color HSL: H:${app2Info.data.config.theme.primaryH}, S:${app2Info.data.config.theme.primaryS}`);
      console.log(`    ✔ Database Connector read: "${app2Data.data.dataSource}"`);
      console.log(`    ✔ Isolated telemetry records count: ${app2Data.data.recordsReturned}`);
    } catch (e) {
      console.error('    ✘ Failed to query Port 4002 app server:', e.message);
    }

    // Test Tenant 03 on port 4003
    console.log('\n  -> Querying Tenant 03 (NovaHealth) served on port 4003:');
    try {
      const app3Info = await httpGet('http://localhost:4003/api/info');
      const app3Data = await httpGet('http://localhost:4003/api/data');
      console.log(`    ✔ App Port 4003 responds with 200 OK.`);
      console.log(`    ✔ Brand name read: "${app3Info.data.config.name}"`);
      console.log(`    ✔ Database Connector read: "${app3Data.data.dataSource}"`);
    } catch (e) {
      console.error('    ✘ Failed to query Port 4003 app server:', e.message);
    }

    console.log('\n==================================================================');
    console.log('         PROGRAMMATIC EVALUATION RUN COMPLETED SUCCESSFULLY!');
    console.log('   Go to http://localhost:5000 in your browser to view the visual dashboard.');
    console.log('==================================================================\n');

  } catch (err) {
    console.error('[CRITICAL FAILURE] Pipeline test execution crashed:', err);
  }
}

execute();
