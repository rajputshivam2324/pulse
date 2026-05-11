<div align="center">
  <h1>🌊 Pulse</h1>
  <p><b>Intelligent Product Analytics for Solana Protocols</b></p>
</div>

---

## 📌 What is Pulse?

Pulse is a next-generation product analytics platform built exclusively for Solana programs. While standard block explorers tell you *what* happened, Pulse tells you *why* it happened and *what to do next*. 

It translates raw on-chain transaction data into actionable product metrics—like D7/D30 retention rates, funnel drop-offs, and behavioral anomalies—and overlays it with an advanced **Agentic Layer** to autonomously diagnose protocol health and uncover hidden growth opportunities.

## 🚀 Key Capabilities

### 1. Autonomous Agentic Pipeline
Pulse replaces the traditional dashboard-staring workflow with a proactive, 7-node Agentic Layer. When metrics are analyzed, the system autonomously:
- **Scans for Anomalies**: Flags statistical deviations in retention or funnel drop-offs.
- **Ranks Severity**: Prioritizes critical issues (e.g., a 60%+ drop-off at a specific transaction step).
- **Diagnoses Root Causes**: Cross-references retention cohorts with user behavior to isolate *why* users are leaving.
- **Extracts Quick Wins**: Generates 3 immediate, actionable product recommendations to stop churn and improve retention.
- **Scores Health**: Assigns a definitive 0-100 Product Health Score based on aggregated protocol metrics.

### 2. Interactive Analyst Chat
Founders and product managers can interrogate their on-chain data directly. By integrating the Agentic Layer with conversational memory, users can ask follow-up questions like *"Why is the SWAP action causing so much churn?"* or *"Compare the retention of users who bridge vs. users who mint"*. The system grounds its answers strictly in the indexed metrics to provide hard, data-backed guidance with rich Markdown and Math support.

### 3. Real-Time On-Chain Ingestion
Through optimized Helius webhook integrations, Pulse ingests transaction streams instantly. It decodes complex program instructions and groups them into logical "actions," allowing protocols to build complete user journey funnels from their first transaction to their eventual churn or power-user status.

### 4. Premium Data Visualization
Metrics deserve to look beautiful. Pulse is wrapped in a highly polished, interactive dashboard featuring a bespoke **3D Neumorphic** design system (Light Rose Gold and Blond aesthetic). Data is presented via Recharts and dynamic components to provide a premium, state-of-the-art analytical experience.

---

## 🧠 System Architecture

Pulse operates on a modern, decoupled monorepo architecture:

### ⚡ Frontend (`apps/web`)
- **Framework**: Next.js 16 with React 19 for maximum performance and server-side rendering capabilities.
- **Styling**: TailwindCSS v4 with custom 3D Neumorphic utilities for a premium, responsive UI.
- **State & Data**: Zustand for robust client-side state management.
- **Visualization**: Recharts for dynamic cohort matrices, funnel charts, and retention graphs.
- **Web3 Integration**: Native Solana Wallet Adapter support for seamless, secure user authentication.

### ⚙️ Backend API (`apps/api`)
- **Framework**: FastAPI providing high-throughput, async REST endpoints.
- **Analytics Engine**: Real-time aggregation of wallet behaviors, retention curves, and funnel conversions.
- **Agentic Layer**: A sophisticated, multi-stage pipeline utilizing advanced inference models to generate insight cards, anomaly alerts, and handle continuous chat context streaming via Server-Sent Events (SSE).
- **Data Persistence**: Powered by Supabase (PostgreSQL) for robust relational data mapping (users, linked wallets, cached insights) and Redis for high-speed caching and rate-limiting.
- **Ingestion**: Scalable Helius webhook receivers capable of parsing massive on-chain transaction loads.

### 🛡️ Authentication & Security
- Cryptographic signature verification for Solana wallet authentication.
- Secure JWT sessions tied to user accounts.
- Plan-gated feature access (Team & Protocol tiers) for advanced Agentic Layer capabilities.

---

## 🎯 Who is this for?

Pulse is built for **Solana Founders, Protocol Developers, and Web3 Product Managers** who need to move past Vanity Metrics (TVL, Total Volume) and optimize for true product-market fit (User Retention, Funnel Conversion, Cohort Quality).
