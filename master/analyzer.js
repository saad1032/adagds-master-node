import si from 'systeminformation';

/**
 * Dynamically assesses host system resources and calculates optimal app count and concurrency.
 * Ensures a minimum build guarantee of at least 2 applications.
 */
export async function analyzeSystemCapacity() {
  const decisions = [];
  decisions.push('[Analyzer] Initiating real-time hardware capacity evaluation...');

  try {
    // Get CPU Cores, speed, current load
    const cpuInfo = await si.cpu();
    const cpuLoad = await si.currentLoad();
    const memInfo = await si.mem();
    const gpuInfo = await si.graphics();

    const totalRAM_GB = memInfo.total / (1024 * 1024 * 1024);
    const freeRAM_GB = memInfo.free / (1024 * 1024 * 1024);
    const activeRAM_GB = memInfo.active / (1024 * 1024 * 1024);
    const cpuUsage = cpuLoad.currentLoad;
    const cpuCores = cpuInfo.cores;
    
    // Detect GPU presence
    const gpus = gpuInfo.controllers || [];
    const hasGPU = gpus.length > 0;
    const gpuNames = gpus.map(g => g.model || g.vendor).join(', ') || 'N/A';

    decisions.push(`[Analyzer] CPU Cores detected: ${cpuCores} threads. Current CPU Load: ${cpuUsage.toFixed(2)}%`);
    decisions.push(`[Analyzer] RAM: Total ${totalRAM_GB.toFixed(2)} GB | Free ${freeRAM_GB.toFixed(2)} GB | Active ${activeRAM_GB.toFixed(2)} GB`);
    decisions.push(`[Analyzer] Graphics Card (GPU) discovered: ${hasGPU ? gpuNames : 'None detected'}`);

    // Compute Adaptive App Generation Count (Scale: 2 - 20)
    // 20 is the absolute cap.
    // Let's create a capability score:
    // Every GB of free RAM can safely support 1 generation job.
    // Every free CPU thread can support 2 jobs.
    // High CPU load reduces the count.
    
    let targetAppCount = 20;
    let explanation = '';

    // RAM checks
    if (freeRAM_GB < 1.0) {
      targetAppCount = 2; // Critical low RAM
      explanation = 'Critical system memory limits (<1GB free). Scaled to guaranteed minimum of 2.';
    } else if (freeRAM_GB < 2.5) {
      targetAppCount = 4;
      explanation = 'Restricted memory headroom. Downscaled target workload to 4.';
    } else if (freeRAM_GB < 4.0) {
      targetAppCount = 8;
      explanation = 'Moderate memory pressure. Workload capped at 8.';
    } else if (freeRAM_GB < 6.0) {
      targetAppCount = 14;
      explanation = 'Slight memory load. Workload balanced to 14.';
    } else {
      targetAppCount = 20;
      explanation = 'Excellent memory headroom (>6GB free). Selected standard workload cap of 20.';
    }

    // Adjust for high CPU load
    if (cpuUsage > 85 && targetAppCount > 2) {
      const original = targetAppCount;
      targetAppCount = Math.max(2, Math.floor(targetAppCount * 0.3));
      explanation += ` Severe CPU throttle (${cpuUsage.toFixed(1)}% load). Reduced workload from ${original} to ${targetAppCount}.`;
    } else if (cpuUsage > 60 && targetAppCount > 4) {
      const original = targetAppCount;
      targetAppCount = Math.max(4, Math.floor(targetAppCount * 0.6));
      explanation += ` Moderate CPU throttle (${cpuUsage.toFixed(1)}% load). Reduced workload from ${original} to ${targetAppCount}.`;
    }

    // Concurrency Calculation (Number of workers to spin up simultaneously)
    // Avoid thrashing: Concurrency = Math.floor(logicalCores / 2), bounded between 2 and 6.
    // Under low RAM, bound it strictly.
    let concurrency = Math.max(2, Math.min(Math.floor(cpuCores / 2), 6));
    if (freeRAM_GB < 2.0) {
      concurrency = 2; // Strict low-RAM ceiling
    }

    decisions.push(`[Analyzer] Decision Engine Outcome: Capped at ${targetAppCount} apps, parallel execution limit set to ${concurrency}`);
    decisions.push(`[Analyzer] Reason: ${explanation}`);

    return {
      success: true,
      timestamp: new Date().toISOString(),
      metrics: {
        cpuCores,
        cpuUsage: parseFloat(cpuUsage.toFixed(2)),
        ramTotalGB: parseFloat(totalRAM_GB.toFixed(2)),
        ramFreeGB: parseFloat(freeRAM_GB.toFixed(2)),
        ramActiveGB: parseFloat(activeRAM_GB.toFixed(2)),
        gpu: {
          present: hasGPU,
          devices: gpuNames
        }
      },
      decision: {
        targetAppCount,
        concurrency,
        explanation
      },
      logs: decisions
    };

  } catch (error) {
    console.error('[Analyzer Error] Failed during resource audit:', error);
    // Safe fallbacks guaranteeing operation
    return {
      success: false,
      timestamp: new Date().toISOString(),
      metrics: {
        cpuCores: 2,
        cpuUsage: 50,
        ramTotalGB: 4.0,
        ramFreeGB: 1.0,
        ramActiveGB: 3.0,
        gpu: { present: false, devices: 'N/A' }
      },
      decision: {
        targetAppCount: 2,
        concurrency: 2,
        explanation: 'Resource analyzer failed. Standard guarantee fallback initiated (2 apps, concurrency 2).'
      },
      logs: [
        '[Analyzer Error] Exception raised during systeminfo scan. Fallback guarantee activated.',
        `[Analyzer Error] Message: ${error.message}`
      ]
    };
  }
}
