let isPolling = false;
let pollingInterval = null;
let lastLogCount = 0;

document.addEventListener('DOMContentLoaded', async () => {
  // Update header time
  setInterval(updateHeaderTime, 1000);
  
  // Initial hardware capacity audit
  await scanResources();

  // Populate fault injection checkboxes (20 entries)
  renderFaultCheckboxes();

  // Wire buttons
  document.getElementById('btnScanResources').addEventListener('click', scanResources);
  document.getElementById('btnStartPipeline').addEventListener('click', startPipeline);
  document.getElementById('btnTerminate').addEventListener('click', terminatePipeline);

  // Auto-scan queue status to check if anything is already active
  pollQueueStatus();
  startPollingLoop();
});

// Update system time in dashboard header
function updateHeaderTime() {
  const now = new Date();
  document.getElementById('currentTime').innerText = `COORDINATOR LIVE: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
}

// Scans host hardware specifications and animations
async function scanResources() {
  const btn = document.getElementById('btnScanResources');
  btn.innerText = 'Scanning...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/system-capacity');
    const data = await res.json();
    
    // Update progress circular meters (Circumference of r=40 is ~251)
    const cpuVal = data.metrics.cpuUsage;
    const cpuMeter = document.getElementById('cpuMeter');
    const cpuOffset = 251 - (251 * cpuVal) / 100;
    cpuMeter.style.strokeDashoffset = cpuOffset;
    document.getElementById('cpuText').innerText = `${cpuVal}%`;

    // RAM Free circular gauge
    const freeRam = data.metrics.ramFreeGB;
    const totalRam = data.metrics.ramTotalGB;
    const ramPct = ((totalRam - freeRam) / totalRam) * 100;
    const ramMeter = document.getElementById('ramMeter');
    const ramOffset = 251 - (251 * ramPct) / 100;
    ramMeter.style.strokeDashoffset = ramOffset;
    document.getElementById('ramText').innerText = `${freeRam.toFixed(1)} GB`;

    // Populate stats text
    document.getElementById('specCpuCores').innerText = `${data.metrics.cpuCores} Threads`;
    document.getElementById('specRamTotal').innerText = `${totalRam.toFixed(2)} GB`;
    document.getElementById('specRamActive').innerText = `${data.metrics.ramActiveGB.toFixed(2)} GB`;
    document.getElementById('specGpu').innerText = data.metrics.gpu.present ? data.metrics.gpu.devices : 'None detected';

    // Populate calculated decisions
    document.getElementById('decidedAppCount').innerText = data.decision.targetAppCount;
    document.getElementById('decidedConcurrency').innerText = data.decision.concurrency;
    document.getElementById('decisionExplanation').innerText = data.decision.explanation;
    
    // Update decision status badge HSL colors depending on counts
    const statusBadge = document.getElementById('decisionStatus');
    statusBadge.innerText = 'Scan Completed';
    statusBadge.style.color = '#38bdf8';
    statusBadge.style.borderColor = 'rgba(56,189,248,0.3)';

  } catch (err) {
    console.error('Failed to query resources:', err);
    document.getElementById('decisionExplanation').innerText = 'Connection to coordinator API failed. Verify Express server.js is running.';
  } finally {
    btn.innerText = 'Scan Specs';
    btn.disabled = false;
  }
}

// Generate the 20 fault injection checkboxes in the panel
function renderFaultCheckboxes() {
  const container = document.getElementById('faultCheckboxes');
  container.innerHTML = '';
  
  for (let i = 1; i <= 20; i++) {
    const id = `tenant_${String(i).padStart(2, '0')}`;
    const label = document.createElement('label');
    label.className = 'fault-check-label';
    label.style.color = '#cbd5e1';
    
    // Distribute default checked fails (e.g. check tenant_02, tenant_03 for robust fault tolerance showcase)
    const defaultCheck = i === 2 || i === 5;
    
    label.innerHTML = `
      <input type="checkbox" value="${id}" ${defaultCheck ? 'checked' : ''} />
      <span>App ${i}</span>
    `;
    container.appendChild(label);
  }
}

// Starts the pipeline
async function startPipeline() {
  const btn = document.getElementById('btnStartPipeline');
  btn.disabled = true;
  btn.innerText = 'Triggering...';

  // Read manual overrides
  const overrideCountVal = document.getElementById('overrideCount').value;
  const forceAppCount = overrideCountVal ? parseInt(overrideCountVal, 10) : null;

  const overrideConcurVal = document.getElementById('overrideConcurrency').value;
  const overrideConcurrency = overrideConcurVal ? parseInt(overrideConcurVal, 10) : null;

  // Gather checked failure IDs
  const checkedFails = Array.from(document.querySelectorAll('#faultCheckboxes input:checked')).map(el => el.value);

  try {
    const res = await fetch('/api/start-pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        forceAppCount,
        overrideConcurrency,
        simulateFailureIds: checkedFails
      })
    });
    
    const result = await res.json();
    
    if (result.success) {
      document.getElementById('decisionStatus').innerText = 'BUILDING';
      document.getElementById('decisionStatus').style.color = '#eab308';
      document.getElementById('decisionStatus').style.borderColor = 'rgba(234,179,8,0.3)';
      
      // Reset log pointer
      lastLogCount = 0;
      
      // Scan status immediately
      await pollQueueStatus();
    } else {
      alert(`Orchestrator refused command: ${result.error}`);
    }
  } catch (err) {
    alert(`Failed to request pipeline run: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerText = '🚀 Run Generate & Deploy Pipeline';
  }
}

// Stops all running builders and servers
async function terminatePipeline() {
  if (!confirm('This will immediately halt all parallel workers and stop deployed applications. Continue?')) {
    return;
  }

  try {
    const res = await fetch('/api/terminate-all', { method: 'POST' });
    const data = await res.json();
    alert(data.message);
    
    document.getElementById('decisionStatus').innerText = 'TERMINATED';
    document.getElementById('decisionStatus').style.color = '#ef4444';
    document.getElementById('decisionStatus').style.borderColor = 'rgba(239,68,68,0.3)';
    
    await pollQueueStatus();
  } catch (err) {
    alert(`Failed to send kill command: ${err.message}`);
  }
}

// Periodic status polling loop (1000ms interval)
function startPollingLoop() {
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(pollQueueStatus, 1000);
}

// Polls active statuses, logs, table mappings, and link cards
async function pollQueueStatus() {
  if (isPolling) return;
  isPolling = true;

  try {
    const res = await fetch('/api/queue-status');
    const data = await res.json();

    // 1. Update Telemetry Chips
    document.getElementById('teleActiveWorkers').innerText = data.activeWorkers;
    document.getElementById('teleQueuedJobs').innerText = data.queuedJobs;
    document.getElementById('teleConcurrency').innerText = data.concurrency;

    // 2. Render Job Table Matrix
    const tableBody = document.getElementById('jobMatrixBody');
    if (!data.jobList || data.jobList.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" class="empty-table">Pipeline not started. Click "Run Generate & Deploy Pipeline" to begin.</td></tr>`;
    } else {
      let rowsHtml = '';
      data.jobList.forEach(job => {
        const dur = job.duration ? `${(job.duration / 1000).toFixed(2)}s` : '--';
        const pathVal = job.path ? job.path : '--';
        const statusClass = job.status.toLowerCase();
        
        let statusDisplay = job.status;
        if (job.status === 'RETRIES') {
          statusDisplay = `RETRYING (Attempt ${job.retries + 1})`;
        }

        rowsHtml += `
          <tr>
            <td style="color: var(--accent); font-weight: 700;">${job.tenantId}</td>
            <td style="color: #fff; font-weight: 500;">${job.name}</td>
            <td style="color: #38bdf8;">${job.port}</td>
            <td><span class="status-badge ${statusClass}">${statusDisplay}</span></td>
            <td style="text-align: center; color: ${job.retries > 0 ? 'var(--color-retries)' : 'var(--text-muted)'}">${job.retries}</td>
            <td style="color: #a7f3d0;">${dur}</td>
            <td style="font-size: 11px; color: var(--text-muted); text-overflow: ellipsis; white-space: nowrap; overflow: hidden; max-width: 260px;" title="${pathVal}">${pathVal}</td>
          </tr>
        `;
      });
      tableBody.innerHTML = rowsHtml;
    }

    // 3. Render Deployed launchpad list
    const launchpad = document.getElementById('launchpadList');
    const deployedJobs = data.jobList ? data.jobList.filter(j => j.deployed) : [];

    if (deployedJobs.length === 0) {
      launchpad.innerHTML = `<div class="empty-launchpad">No active deployments. Start build pipeline.</div>`;
    } else {
      let launchHtml = '';
      deployedJobs.forEach(job => {
        launchHtml += `
          <div class="launch-card">
            <div class="launch-meta">
              <span class="launch-dot"></span>
              <div class="launch-info">
                <span class="launch-title">${job.name}</span>
                <span class="launch-sub">Port: ${job.port} &bull; Isolated Process</span>
              </div>
            </div>
            <a href="http://localhost:${job.port}" target="_blank" class="btn btn-secondary btn-small" style="text-decoration: none; padding: 4px 10px;">Launch App</a>
          </div>
        `;
      });
      launchpad.innerHTML = launchHtml;
    }

    // 4. Update Streaming Logs
    const consoleLogs = document.getElementById('consoleLogs');
    if (data.systemLogs && data.systemLogs.length > lastLogCount) {
      // Append only new logs
      const newLogs = data.systemLogs.slice(lastLogCount);
      newLogs.forEach(log => {
        const line = document.createElement('div');
        line.className = 'console-line';
        
        // Formatting styles per trace type
        if (log.includes('[ERROR]') || log.includes('[CRITICAL]') || log.includes('FAILED')) {
          line.classList.add('error');
        } else if (log.includes('[BUILD LOG]')) {
          line.classList.add('build');
        } else if (log.includes('[RUNTIME')) {
          line.classList.add('runtime');
        } else {
          line.classList.add('system');
        }
        
        line.innerText = log;
        consoleLogs.appendChild(line);
      });
      
      lastLogCount = data.systemLogs.length;
      consoleLogs.scrollTop = consoleLogs.scrollHeight; // Auto-scroll
    }

    // If all queued jobs have finished, update pipeline global status badge
    if (data.jobList.length > 0 && data.queuedJobs === 0 && data.activeWorkers === 0) {
      const activeStatus = document.getElementById('decisionStatus');
      const allFinished = data.jobList.every(j => j.status === 'COMPLETED' || j.status === 'FAILED');
      
      if (allFinished) {
        const hasFailures = data.jobList.some(j => j.status === 'FAILED');
        if (hasFailures) {
          activeStatus.innerText = 'Completed with Failures';
          activeStatus.style.color = 'var(--color-retries)';
          activeStatus.style.borderColor = 'rgba(249,115,22,0.3)';
        } else {
          activeStatus.innerText = 'All Generated & Live';
          activeStatus.style.color = 'var(--color-completed)';
          activeStatus.style.borderColor = 'rgba(16,185,129,0.3)';
        }
      }
    }

  } catch (err) {
    console.error('Error polling status:', err);
  } finally {
    isPolling = false;
  }
}
