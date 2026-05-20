import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to recursively copy directories
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue; // Skip copying node_modules to avoid massive bloat
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function run() {
  const args = process.argv.slice(2);
  const params = {};
  
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];
    params[key] = value;
  }

  const { tenantId, configPath, templatePath, outputPath, simulateFailure } = params;

  if (!tenantId || !configPath || !templatePath || !outputPath) {
    console.error('[Worker Error] Missing required build arguments!');
    process.exit(1);
  }

  try {
    console.log(`[Worker ${tenantId}] Starting codebase generation process...`);
    
    // Parse configuration
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // 1. Create target independent directory
    const targetDir = path.join(outputPath, tenantId);
    if (fs.existsSync(targetDir)) {
      // Clear previous build output if it exists to allow full clean builds
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    fs.mkdirSync(targetDir, { recursive: true });

    // 2. Copy Base Template structure (excluding node_modules)
    copyDirSync(templatePath, targetDir);

    // 3. Inject configuration file
    const targetConfigDir = path.join(targetDir, 'src');
    if (!fs.existsSync(targetConfigDir)) {
      fs.mkdirSync(targetConfigDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(targetConfigDir, 'config.json'),
      JSON.stringify(config, null, 2),
      'utf8'
    );

    // 4. Create local environment variables file (.env)
    const envContent = `PORT=${config.envSettings.PORT}
API_URL=${config.envSettings.API_URL}
LOG_LEVEL=${config.envSettings.LOG_LEVEL}
TENANT_ID=${config.id}
TENANT_NAME=${config.name}
ISOLATION_LEVEL=PROCESS_ISOLATION
`;
    fs.writeFileSync(path.join(targetDir, '.env'), envContent, 'utf8');

    // 5. Heavy compile simulation delay
    // Simulates dynamic workloads (longer queries, bundle operations, minifying)
    const compileTimeMs = 1000 + Math.random() * 1500;
    await new Promise(resolve => setTimeout(resolve, compileTimeMs));

    // 6. Simulated fault-tolerance failures
    if (simulateFailure === 'true') {
      console.log(`[Worker ${tenantId}] [Simulated Fault] Simulating connection loss / memory overflow...`);
      throw new Error(`Simulated database timeout on data source: ${config.dataSource.database}`);
    }

    console.log(`[Worker ${tenantId}] Standalone codebase compilation completed successfully.`);
    console.log(`[Worker ${tenantId}] Path: ${targetDir}`);
    
    // Report success to parent process via IPC if supported, otherwise exit 0
    if (process.send) {
      process.send({ status: 'COMPLETED', tenantId, path: targetDir, duration: compileTimeMs });
    }
    process.exit(0);

  } catch (error) {
    console.error(`[Worker ${tenantId}] Build failed:`, error.message);
    if (process.send) {
      process.send({ status: 'FAILED', tenantId, error: error.message });
    }
    process.exit(1);
  }
}

run();
