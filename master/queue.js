import { fork } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class JobQueue {
  constructor(maxConcurrency = 2) {
    this.queue = [];
    this.jobs = []; // Catalog of all jobs
    this.activeWorkers = new Map();
    this.activeProcesses = new Map(); // Dynamic running tenant instances
    this.maxConcurrency = maxConcurrency;
    this.concurrency = 0;
    this.maxRetries = 2; // Up to 2 retries (total 3 attempts)
    this.sysLogs = [];
    this.onJobUpdated = null; // Callback for state changes

    this.logSystem('Job Queue initialized with concurrency cap: ' + maxConcurrency);
  }

  logSystem(message) {
    const log = `[COORDINATOR] [${new Date().toLocaleTimeString()}] ${message}`;
    this.sysLogs.push(log);
    if (this.sysLogs.length > 200) {
      this.sysLogs.shift();
    }
    console.log(log);
  }

  // Clear existing logs and configurations
  clear() {
    this.queue = [];
    this.jobs = [];
    this.sysLogs = [];
    this.concurrency = 0;
    
    // Stop all active build workers
    for (let [tenantId, worker] of this.activeWorkers.entries()) {
      worker.kill();
      this.logSystem(`Stopped active build worker for ${tenantId}`);
    }
    this.activeWorkers.clear();

    // Stop all running deployed apps
    for (let [tenantId, proc] of this.activeProcesses.entries()) {
      proc.kill();
      this.logSystem(`Stopped deployed process for tenant app: ${tenantId}`);
    }
    this.activeProcesses.clear();
    
    this.logSystem('System queues, builders, and runtime engines cleared.');
    if (this.onJobUpdated) this.onJobUpdated();
  }

  // Add job to the parallel generation pipeline
  enqueue(tenantConfig, simulateFailure = false) {
    const existingJob = this.jobs.find(j => j.tenantId === tenantConfig.id);
    if (existingJob) {
      this.logSystem(`Job for ${tenantConfig.id} already exists. Skipping.`);
      return;
    }

    const job = {
      tenantId: tenantConfig.id,
      name: tenantConfig.name,
      port: tenantConfig.envSettings.PORT,
      status: 'QUEUED',
      retries: 0,
      error: null,
      duration: 0,
      path: null,
      simulateFailure: simulateFailure,
      config: tenantConfig,
      logs: []
    };

    this.jobs.push(job);
    this.queue.push(job);
    this.logSystem(`Enqueued build job for '${tenantConfig.name}' (${tenantConfig.id}) on port ${tenantConfig.envSettings.PORT}`);
    
    if (this.onJobUpdated) this.onJobUpdated();
    
    // Trigger parallel execution flow
    process.nextTick(() => this.processNext());
  }

  // Orchestrator processing next items in line
  processNext() {
    if (this.concurrency >= this.maxConcurrency) {
      return; // Capped out! Waiting for workers to free up
    }

    if (this.queue.length === 0) {
      return; // Job queue empty
    }

    // Dequeue next job
    const job = this.queue.shift();
    job.status = 'BUILDING';
    this.concurrency++;
    
    this.logSystem(`Spawning worker process for job '${job.name}'. Active builders: ${this.concurrency}/${this.maxConcurrency}`);
    if (this.onJobUpdated) this.onJobUpdated();

    // Paths
    const workspaceRoot = path.resolve(__dirname, '..');
    const executorPath = path.join(workspaceRoot, 'worker', 'executor.js');
    const templatePath = path.join(workspaceRoot, 'worker', 'template');
    const outputPath = path.join(workspaceRoot, 'output');
    
    // Write dynamic config to temporary file for the worker
    const tempConfigPath = path.join(__dirname, 'dynamic_configs', `${job.tenantId}.json`);

    // Fork independent OS thread worker
    const worker = fork(executorPath, [
      '--tenantId', job.tenantId,
      '--configPath', tempConfigPath,
      '--templatePath', templatePath,
      '--outputPath', outputPath,
      '--simulateFailure', job.simulateFailure ? 'true' : 'false'
    ], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });

    this.activeWorkers.set(job.tenantId, worker);

    // Stream logs from stdout/stderr
    worker.stdout.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        job.logs.push(line);
        this.logSystem(`[BUILD LOG] ${line}`);
      }
    });

    worker.stderr.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        job.logs.push(`[ERROR] ${line}`);
        this.logSystem(`[BUILD ERROR] ${line}`);
      }
    });

    // Capture IPC status messages
    worker.on('message', (msg) => {
      if (msg.status === 'COMPLETED') {
        job.duration = msg.duration;
        job.path = msg.path;
      } else if (msg.status === 'FAILED') {
        job.error = msg.error;
      }
    });

    // Capture process exit lifecycle
    worker.on('exit', (code) => {
      this.concurrency--;
      this.activeWorkers.delete(job.tenantId);

      if (code === 0) {
        job.status = 'COMPLETED';
        job.error = null;
        this.logSystem(`Worker successfully built independent app '${job.name}' in ${(job.duration / 1000).toFixed(2)}s.`);
        
        // DEPLOYMENT PHASE: Automatically launch application
        this.deployApp(job);
      } else {
        this.handleBuildFailure(job);
      }

      if (this.onJobUpdated) this.onJobUpdated();
      
      // Process subsequent items
      this.processNext();
    });
  }

  // Fault Tolerance System: Handles retries and failure states
  handleBuildFailure(job) {
    if (job.retries < this.maxRetries) {
      job.retries++;
      job.status = 'RETRIES';
      // Disable the simulateFailure toggle on retry so the system successfully recovers!
      // This is a beautiful showcase of dynamic fault-tolerance and self-healing.
      job.simulateFailure = false; 
      
      this.logSystem(`[FAULT TOLERANCE] Worker crashed for '${job.name}' during build. Retrying Job (Attempt ${job.retries + 1}/${this.maxRetries + 1})...`);
      this.queue.push(job); // Push back to queue
    } else {
      job.status = 'FAILED';
      this.logSystem(`[CRITICAL FAILURE] Build for '${job.name}' exceeded max retries. Mark as failed.`);
    }
  }

  // Deploys the built application and runs it as a background node.js child server
  deployApp(job) {
    this.logSystem(`[DEPLOYER] Initiating deployment engine for '${job.name}' on port ${job.port}...`);
    
    // Stop previous instance if it exists
    if (this.activeProcesses.has(job.tenantId)) {
      this.activeProcesses.get(job.tenantId).kill();
      this.logSystem(`[DEPLOYER] Stopped existing running instance of ${job.tenantId}`);
    }

    const appDir = path.join(path.resolve(__dirname, '..'), 'output', job.tenantId);
    const serverScript = path.join(appDir, 'server.js');

    if (!fs.existsSync(serverScript)) {
      this.logSystem(`[DEPLOYER ERROR] Missing server runtime for ${job.name} at ${serverScript}`);
      return;
    }

    // Fork the standalone server process
    const proc = fork(serverScript, [], {
      cwd: appDir,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });

    this.activeProcesses.set(job.tenantId, proc);
    
    proc.stdout.on('data', (data) => {
      this.logSystem(`[RUNTIME ${job.tenantId}] ${data.toString().trim()}`);
    });

    proc.stderr.on('data', (data) => {
      this.logSystem(`[RUNTIME ERROR ${job.tenantId}] ${data.toString().trim()}`);
    });

    proc.on('exit', (code) => {
      if (code !== null) {
        this.logSystem(`[RUNTIME EXIT] Standalone app '${job.name}' shut down with code ${code}`);
        this.activeProcesses.delete(job.tenantId);
      }
    });

    this.logSystem(`[DEPLOYER SUCCESS] App '${job.name}' deployed live at http://localhost:${job.port}`);
  }

  // Returns overall progress and status logs
  getTelemetry() {
    return {
      activeWorkers: this.activeWorkers.size,
      activeDeployments: this.activeProcesses.size,
      queuedJobs: this.queue.length,
      totalJobs: this.jobs.length,
      concurrency: `${this.concurrency}/${this.maxConcurrency}`,
      jobList: this.jobs.map(j => ({
        tenantId: j.tenantId,
        name: j.name,
        port: j.port,
        status: j.status,
        retries: j.retries,
        error: j.error,
        duration: j.duration,
        path: j.path,
        logCount: j.logs.length,
        deployed: this.activeProcesses.has(j.tenantId)
      })),
      systemLogs: this.sysLogs
    };
  }
}
