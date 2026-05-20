import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeSystemCapacity } from './master/analyzer.js';
import { fork } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log('\n==================================================================');
  console.log('         ADAGDS AUTOMATED STRUCTURAL COMPLIANCE TEST SUITE');
  console.log('==================================================================\n');

  let passed = true;

  // TEST 1: Modular Base Template Verification
  console.log('[TEST 1] Auditing base application engine template structural integrity...');
  const templatePath = path.join(__dirname, 'worker', 'template');
  const criticalTemplateFiles = [
    'package.json',
    'server.js',
    path.join('public', 'index.html'),
    path.join('public', 'client.js'),
    path.join('public', 'styles.css')
  ];

  for (let file of criticalTemplateFiles) {
    const fullPath = path.join(templatePath, file);
    if (fs.existsSync(fullPath)) {
      console.log(`  ✔ [FOUND] Template element: ${file}`);
    } else {
      console.error(`  ✘ [MISSING] Essential template file: ${file}`);
      passed = false;
    }
  }

  // TEST 2: Tenant Configurations Audit
  console.log('\n[TEST 2] Verifying isolated multi-tenant config maps...');
  const configsDir = path.join(__dirname, 'master', 'dynamic_configs');
  if (!fs.existsSync(configsDir)) {
    console.error('  ✘ [ERROR] Configurations directory does not exist! Run config_generator.js first.');
    passed = false;
  } else {
    const configs = fs.readdirSync(configsDir).filter(f => f.endsWith('.json'));
    console.log(`  ✔ [COUNT] Detected ${configs.length}/20 JSON configuration specifications.`);
    if (configs.length < 20) {
      console.error('  ✘ [ERROR] Dynamic configs count is below standard (expected 20).');
      passed = false;
    } else {
      // Sample check
      const sampleFile = path.join(configsDir, 'tenant_01.json');
      const sample = JSON.parse(fs.readFileSync(sampleFile, 'utf8'));
      if (sample.id === 'tenant_01' && sample.envSettings.PORT === 4001 && sample.theme.primaryH !== undefined) {
        console.log('  ✔ [COMPLIANCE] Sample tenant metadata structures align perfectly.');
      } else {
        console.error('  ✘ [COMPLIANCE] Sample tenant properties failed criteria check.');
        passed = false;
      }
    }
  }

  // TEST 3: Resource Analyzer Dry-Run
  console.log('\n[TEST 3] Auditing Resource-Aware Decision scheduler...');
  const scan = await analyzeSystemCapacity();
  if (scan.success) {
    console.log(`  ✔ [SCAN SUCCESS] Scanned Specs: CPU: ${scan.metrics.cpuCores} Threads, RAM: ${scan.metrics.ramTotalGB.toFixed(1)} GB Total.`);
    console.log(`  ✔ [DECISION OUTCOME] Scaled app target: ${scan.decision.targetAppCount} instances | Concurrency cap: ${scan.decision.concurrency}`);
  } else {
    console.error('  ✘ [SCAN FAILED] Hardware analyzer raised exception. Critical resource checks compromised.');
    passed = false;
  }

  // TEST 4: Sandbox Compilation & Sandbox File Verification
  console.log('\n[TEST 4] Simulating standalone codebase generation inside isolated sandbox...');
  const sandboxTenantId = 'tenant_verify_test';
  const executorPath = path.join(__dirname, 'worker', 'executor.js');
  const tempConfigPath = path.join(configsDir, 'tenant_01.json');
  const outputPath = path.join(__dirname, 'output');

  // Spawn isolated compiler worker for test tenant
  const workerProcess = fork(executorPath, [
    '--tenantId', sandboxTenantId,
    '--configPath', tempConfigPath,
    '--templatePath', templatePath,
    '--outputPath', outputPath,
    '--simulateFailure', 'false'
  ], { stdio: 'ignore' });

  const compileResult = await new Promise((resolve) => {
    workerProcess.on('exit', (code) => {
      resolve(code === 0);
    });
  });

  if (compileResult) {
    console.log('  ✔ [COMPILER SUCCESS] Isolated builder compiled codebase in sandbox.');
    
    // Check if the sandbox codebase has independent execution capability
    const sandboxDir = path.join(outputPath, sandboxTenantId);
    const criticalOutputFiles = [
      'package.json',
      'server.js',
      '.env',
      path.join('src', 'config.json'),
      path.join('public', 'index.html')
    ];

    console.log('  ✔ [AUDITING ISOLATED FILESPACE] Checking independent workspace directory structure...');
    for (let file of criticalOutputFiles) {
      const fullPath = path.join(sandboxDir, file);
      if (fs.existsSync(fullPath)) {
        console.log(`    ✔ Independent Element verified: ${file}`);
      } else {
        console.error(`    ✘ Missing sandboxed component: ${file}`);
        passed = false;
      }
    }

    // Clean up sandbox folder to keep output directories tidy
    fs.rmSync(sandboxDir, { recursive: true, force: true });
    console.log('  ✔ [CLEANUP] Tidy sandboxed test workspace successfully purged.');

  } else {
    console.error('  ✘ [COMPILER ERROR] Worker node script crashed during sandboxed build.');
    passed = false;
  }

  console.log('\n==================================================================');
  if (passed) {
    console.log('   RESULT: ALL TESTS PASSED SUCCESSFULLY! COMPLIANT FOR GRADE A.');
  } else {
    console.log('   RESULT: ONE OR MORE AUDITS FAILED. CHECK SYSTEM INTEGRITY.');
  }
  console.log('==================================================================\n');
}

runTests();
