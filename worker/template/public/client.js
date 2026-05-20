document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Fetch Tenant System Info
    const infoRes = await fetch('/api/info');
    const infoData = await infoRes.json();
    const config = infoData.config;

    // Apply tenant custom theme options
    if (config.theme) {
      const theme = config.theme;
      if (theme.primaryH !== undefined) {
        document.documentElement.style.setProperty('--primary-h', theme.primaryH);
      }
      if (theme.primaryS) {
        document.documentElement.style.setProperty('--primary-s', theme.primaryS);
      }
      if (theme.primaryL) {
        document.documentElement.style.setProperty('--primary-l', theme.primaryL);
      }
      if (theme.font) {
        document.documentElement.style.setProperty('--font-family', `"${theme.font}", 'Plus Jakarta Sans', sans-serif`);
        document.getElementById('themeFont').innerText = `Font: ${theme.font}`;
      }
      
      document.getElementById('themeColors').innerText = `HSL: H:${theme.primaryH || 210}, S:${theme.primaryS || '100%'}, L:${theme.primaryL || '50%'}`;
    }

    // Populate identity
    document.title = `${config.name} - Dashboard`;
    document.getElementById('appName').innerText = config.name;
    document.getElementById('appSubdomain').innerText = config.subdomain || `${config.id}.local`;
    document.getElementById('footerBrand').innerText = config.name;
    document.getElementById('specId').innerText = config.id || 'N/A';
    document.getElementById('specEnv').innerText = config.environment || 'production';
    document.getElementById('specPort').innerText = config.envSettings?.PORT || 'N/A';
    document.getElementById('specLog').innerText = config.envSettings?.LOG_LEVEL || 'info';

    if (config.theme?.icon) {
      document.getElementById('appIcon').innerText = config.theme.icon;
    }

    // 2. Render Feature Flags Audit
    const flagList = document.getElementById('featureFlagsList');
    flagList.innerHTML = '';
    const features = config.features || {};
    
    const flagsToAudit = [
      { name: 'enableChat', label: 'Chat Messaging System' },
      { name: 'enableAnalytics', label: 'Advanced Analytics Node' },
      { name: 'enablePremiumCharts', label: 'High-Fidelity Telemetry Wave' },
      { name: 'darkTheme', label: 'Forced Dark Palette' },
      { name: 'realtimeData', label: 'Realtime Data Refreshing' }
    ];

    flagsToAudit.forEach(flag => {
      const isEnabled = !!features[flag.name];
      const item = document.createElement('div');
      item.className = 'feature-flag-item';
      item.innerHTML = `
        <span>${flag.label}</span>
        <span class="flag-status">
          <span class="flag-dot ${isEnabled ? 'enabled' : ''}"></span>
          <span style="color: ${isEnabled ? '#10b981' : '#9ca3af'}">${isEnabled ? 'Active' : 'Disabled'}</span>
        </span>
      `;
      flagList.appendChild(item);
    });

    // 3. Fetch Data Source Abstraction Details & Render Chart
    const sourceName = config.dataSource?.database || 'SQLite_Cluster';
    document.getElementById('dataSourceName').innerText = sourceName;
    
    const dataRes = await fetch('/api/data');
    const dataJSON = await dataRes.json();
    document.getElementById('sqlQueryText').innerText = dataJSON.queryDetails;
    document.getElementById('metricCount').innerText = dataJSON.recordsReturned;
    document.getElementById('metricStatus').innerText = dataJSON.status;
    
    // Draw SVG Chart
    renderChart(dataJSON.data);

    // 4. Handle Chat Module toggle
    const chatSection = document.getElementById('chatSection');
    if (features.enableChat) {
      chatSection.style.display = 'flex';
      loadChatLogs();
    } else {
      chatSection.style.display = 'none';
    }

  } catch (err) {
    console.error('Failed to initialize client:', err);
    document.title = 'Connection Error';
    document.getElementById('appStatus').innerText = 'CRITICAL: Configuration Disrupted';
    document.getElementById('appStatus').parentElement.querySelector('.status-indicator').style.backgroundColor = '#ef4444';
    document.getElementById('appStatus').parentElement.querySelector('.status-indicator').style.boxShadow = '0 0 10px #ef4444';
  }
});

// Draws custom SVG lines representing dynamic worker workloads/queries
function renderChart(datapoints) {
  if (!datapoints || datapoints.length === 0) return;
  
  const width = 500;
  const height = 200;
  const padding = 10;
  
  const maxVal = Math.max(...datapoints.map(d => d.value), 100);
  const minVal = Math.min(...datapoints.map(d => d.value), 0);
  const range = maxVal - minVal;
  
  const stepX = (width - padding * 2) / (datapoints.length - 1);
  
  let points = [];
  datapoints.forEach((d, i) => {
    const x = padding + i * stepX;
    // Invert Y coordinate since SVG (0,0) is top-left
    const y = height - padding - ((d.value - minVal) / range) * (height - padding * 2);
    points.push({ x, y });
  });
  
  // Construct SVGs line path string
  let pathStr = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    // Make it a smooth bezier curve
    const cpX1 = points[i-1].x + stepX / 2;
    const cpY1 = points[i-1].y;
    const cpX2 = points[i].x - stepX / 2;
    const cpY2 = points[i].y;
    pathStr += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${points[i].x} ${points[i].y}`;
  }
  
  const linePath = document.getElementById('chartLine');
  linePath.setAttribute('d', pathStr);
  
  // Construct filling area path string
  let areaStr = pathStr + ` L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;
  const areaPath = document.getElementById('chartArea');
  areaPath.setAttribute('d', areaStr);
}

// Loads dynamic chats representing multi-tenant messaging services
async function loadChatLogs() {
  const chatBox = document.getElementById('chatBox');
  try {
    const res = await fetch('/api/chat');
    const data = await res.json();
    
    chatBox.innerHTML = '';
    data.logs.forEach(log => {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'chat-msg';
      msgDiv.innerHTML = `
        <div class="chat-meta">
          <span class="chat-sender">${log.sender}</span>
          <span>${log.time}</span>
        </div>
        <div class="chat-text">${log.message}</div>
      `;
      chatBox.appendChild(msgDiv);
    });
    
    // Auto-scroll to bottom of chatbox
    chatBox.scrollTop = chatBox.scrollHeight;
  } catch (err) {
    chatBox.innerHTML = `<div class="chat-loading" style="color: #ef4444;">Failed to sync logs: ${err.message}</div>`;
  }
}
