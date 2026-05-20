# ADAGDS Master Node

Adaptive Distributed Application Generation & Deployment System.

## Run

```bash
npm install
npm start
```

Open **http://localhost:5000** in your browser for the coordinator dashboard.

> The master node always listens on port **5000**. Generated tenant apps use separate ports (4001–4020) so they do not conflict with the dashboard.
