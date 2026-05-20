import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Load .env dynamically if it exists
let port = 4000;
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/PORT\s*=\s*(\d+)/);
  if (match && match[1]) {
    port = parseInt(match[1], 10);
  }
}

// Load config.json dynamically
let config = {};
const configPath = path.join(__dirname, 'src', 'config.json');
if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error('Failed to parse src/config.json:', err);
  }
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API: get dynamic application configuration
app.get('/api/info', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    config
  });
});

// API: get modular tenant-specific telemetry data representing its data source abstraction
app.get('/api/data', (req, res) => {
  const dbName = config.dataSource?.database || 'LocalDB';
  const queryLimit = config.dataSource?.limit || 10;
  
  // Generate random data matching the client requirements
  const datapoints = [];
  const start = Date.now();
  for (let i = 0; i < queryLimit; i++) {
    datapoints.push({
      id: i + 1,
      timestamp: new Date(start - i * 60000).toLocaleTimeString(),
      value: Math.floor(Math.random() * 200) + 50,
      load: Math.floor(Math.random() * 100),
      status: Math.random() > 0.1 ? 'ACTIVE' : 'WARNING'
    });
  }

  res.json({
    dataSource: dbName,
    queryDetails: `SELECT * FROM system_metrics LIMIT ${queryLimit};`,
    status: 'SUCCESS',
    recordsReturned: datapoints.length,
    data: datapoints
  });
});

// API: dynamic message service if features.enableChat is enabled
app.get('/api/chat', (req, res) => {
  if (!config.features?.enableChat) {
    return res.status(403).json({ error: 'Chat feature is disabled for this tenant.' });
  }

  const mockUsers = ['Alice', 'Bob', 'Charlie', 'Coordinator', 'Worker_Node'];
  const mockMessages = [
    'System initialization successful.',
    'Workload fully synchronized on custom port ' + port,
    'Retrieving abstract data sources...',
    'Performing real-time micro-service updates.',
    'Distributed scheduler reports healthy heartbeats.'
  ];

  const chatLogs = [];
  for (let i = 0; i < 5; i++) {
    chatLogs.push({
      sender: mockUsers[i % mockUsers.length],
      message: mockMessages[i % mockMessages.length],
      time: new Date(Date.now() - (5 - i) * 120000).toLocaleTimeString()
    });
  }

  res.json({
    room: config.name + '_Cluster',
    logs: chatLogs
  });
});

// Catch-all route to serve the SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`[TENANT APP] '${config.name}' running independently at http://localhost:${port}`);
});
