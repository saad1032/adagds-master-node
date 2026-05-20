import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetDir = path.join(__dirname, 'dynamic_configs');

// Ensure directory exists
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const names = [
  'AeroDashboard', 'ApexAnalytics', 'NovaHealth', 'RetailFlow', 'QuantumSaaS',
  'CyberShield', 'BioSynthetics', 'OptimaTrade', 'HexaChain', 'ZenithCloud',
  'GridVector', 'InfiniSafe', 'SolariPower', 'VeloDelivery', 'LuminaDesign',
  'CoreDynamics', 'AuraSocial', 'StellarMaps', 'KryptonVault', 'OceanTide'
];

const subdomains = names.map(n => `${n.toLowerCase()}.adagds.local`);

const icons = [
  '⚡', '📈', '🏥', '🛒', '⚛️', 
  '🛡️', '🧬', '📊', '🔗', '☁️', 
  '📐', '🔒', '☀️', '🚴', '🎨', 
  '⚙️', '💬', '🗺️', '🔑', '🌊'
];

const databases = [
  'SQLite_Isolated', 'PostgreSQL_Node1', 'Cassandra_Dist', 'Redis_Shared_Cache', 'MongoDB_Replica',
  'MariaDB_Main', 'DynamoDB_Global', 'Elasticsearch_Index', 'ClickHouse_Analytics', 'Neo4j_Graph',
  'TimescaleDB_Metrics', 'CockroachDB_Local', 'Redshift_Warehouse', 'Snowflake_Stage', 'Oracle_Enterprise',
  'Firestore_Client', 'BigQuery_Storage', 'ScyllaDB_Node', 'InfluxDB_Timeseries', 'Memcached_Volatile'
];

const fonts = [
  'Plus Jakarta Sans', 'Inter', 'Outfit', 'Roboto', 'Montserrat', 
  'Outfit', 'Inter', 'Plus Jakarta Sans', 'Outfit', 'Montserrat'
];

const logLevels = ['info', 'debug', 'warn', 'error'];

console.log('Generating 20 distinct tenant JSON configurations...');

for (let i = 0; i < 20; i++) {
  const tenantId = `tenant_${String(i + 1).padStart(2, '0')}`;
  
  // Distribute feature flags
  const features = {
    enableChat: i % 2 === 0, // Even apps get chat
    enableAnalytics: i % 3 !== 0,
    enablePremiumCharts: i % 4 !== 0,
    darkTheme: true,
    realtimeData: i % 5 === 0
  };

  // Generate nice HSL colors evenly distributed around the 360 color wheel
  const primaryH = Math.floor((360 / 20) * i);
  const primaryS = '85%';
  const primaryL = '52%';

  const config = {
    id: tenantId,
    name: names[i],
    subdomain: subdomains[i],
    environment: i < 5 ? 'staging' : i > 17 ? 'development' : 'production',
    features: features,
    envSettings: {
      PORT: 4000 + (i + 1),
      API_URL: `http://api.adagds.local/${tenantId}`,
      LOG_LEVEL: logLevels[i % logLevels.length]
    },
    dataSource: {
      database: databases[i],
      queryType: i % 2 === 0 ? 'READ_OPTIMIZED' : 'WRITE_INTENSIVE',
      limit: 8 + (i % 5) * 3, // dynamic dataset sizes (8, 11, 14, 17, 20)
      timeoutMs: 1500 + (i % 3) * 500
    },
    theme: {
      primaryH: primaryH,
      primaryS: primaryS,
      primaryL: primaryL,
      font: fonts[i % fonts.length],
      icon: icons[i],
      borderRadius: i % 2 === 0 ? '16px' : '24px'
    }
  };

  const filePath = path.join(targetDir, `${tenantId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
}

console.log('Successfully generated 20 configurations under master/dynamic_configs/');
