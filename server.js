import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeSystemCapacity } from './master/analyzer.js';
import { JobQueue } from './master/queue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// PDC requirement: master dashboard must run on port 5000 (ignore process.env.PORT)
const port = 5000;

app.use(cors());
app.use(express.json());

// Serve static Dashboard UI files
app.use(express.static(path.join(__dirname, 'ui')));

// Global Job Queue Instance (will be dynamically re-configured upon pipeline startup)
let globalQueue = new JobQueue(2);

// REST API: Trigger capacity scan and resource calculation
app.get('/api/system-capacity', async (req, res) => {
  const assessment = await analyzeSystemCapacity();
  res.json(assessment);
});

// REST API: Get current queue and worker execution logs
app.get('/api/queue-status', (req, res) => {
  res.json(globalQueue.getTelemetry());
});

// REST API: Launch parallel compilation pipeline
app.post('/api/start-pipeline', async (req, res) => {
  try {
    const { forceAppCount, simulateFailureIds, overrideConcurrency } = req.body;
    
    // 1. Scan resources
    const assessment = await analyzeSystemCapacity();
    
    // Determine bounds
    let targetCount = assessment.decision.targetAppCount;
    if (forceAppCount && forceAppCount >= 1 && forceAppCount <= 20) {
      targetCount = forceAppCount;
      globalQueue.logSystem(`[MANUAL OVERRIDE] Enforcing target app generation limit: ${targetCount}`);
    }

    let concurrency = assessment.decision.concurrency;
    if (overrideConcurrency && overrideConcurrency >= 1 && overrideConcurrency <= 8) {
      concurrency = overrideConcurrency;
      globalQueue.logSystem(`[MANUAL OVERRIDE] Enforcing custom worker concurrency cap: ${concurrency}`);
    }

    // 2. Refresh queue configuration
    globalQueue.clear();
    globalQueue.maxConcurrency = concurrency;

    // 3. Load Dynamic configs
    const configsDir = path.join(__dirname, 'master', 'dynamic_configs');
    if (!fs.existsSync(configsDir)) {
      return res.status(500).json({ error: 'Tenant configurations folder is missing! Run master/config_generator.js first.' });
    }

    const files = fs.readdirSync(configsDir).filter(f => f.endsWith('.json')).sort();
    
    // Slice to the decided/forced app generation target
    const targetFiles = files.slice(0, targetCount);
    globalQueue.logSystem(`Preparing build pipeline for ${targetFiles.length} independent application codebases...`);

    const failedIdsList = simulateFailureIds || [];

    // 4. Queue up apps for workers to execute
    targetFiles.forEach((file) => {
      const configPath = path.join(configsDir, file);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      const shouldSimulateFailure = failedIdsList.includes(config.id);
      globalQueue.enqueue(config, shouldSimulateFailure);
    });

    res.json({
      success: true,
      scheduledApps: targetFiles.length,
      concurrency: concurrency,
      message: `Successfully launched build pipeline for ${targetFiles.length} isolated tenants.`
    });

  } catch (error) {
    console.error('Failed to launch pipeline:', error);
    res.status(500).json({ error: 'Orchestrator failed to initialize parallel builds: ' + error.message });
  }
});

// REST API: Kill all running worker builders and running tenant servers
app.post('/api/terminate-all', (req, res) => {
  globalQueue.clear();
  res.json({ success: true, message: 'All compiler threads and microservices terminated.' });
});

// Start Master Web Service (default host so localhost works on IPv4 and IPv6)
app.listen(port, () => {
  console.log(`\n==================================================================`);
  console.log(`[MASTER COORDINATOR] System launched live at http://localhost:${port}`);
  console.log(`[MASTER COORDINATOR] Open http://localhost:${port} in a browser to monitor.`);
  console.log(`==================================================================\n`);
});
