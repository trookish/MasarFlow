# MasarFlow

MasarFlow is an AI-native development workflow platform tailored for seamless collaboration between software engineers, technical designers, and autonomous agents. It acts as the "Command Center" for the development lifecycle, bringing project management, documentation, version control, and real-time development monitoring under one unified interface.

## 🚀 Features

- **Project Health Dashboard**: View live status, task progress, and recent development logs.
- **Context Engine**: MasarFlow actively builds high-quality, weighted "context" (comprised of memories, standards, and active specifications) to ground your AI queries in real-world constraints.
- **Unity Live Integration**: Real-time asset watching using Server-Sent Events (SSE) ensures that modifications in Unity are immediately reflected in your workflow.
- **GitHub Commit Sync**: Securely proxy and fetch commits from GitHub repositories to trace code lineage back to active technical specifications.
- **Agent Integration**: Run the platform interactively with autonomous agents powered by the Vercel AI SDK. Agents can stream responses and auto-execute database actions (like writing dev logs or marking tasks as done).
- **Offline First**: All state is managed locally via IndexedDB using Dexie.js for lightning-fast responsiveness and full offline support.

## 🛠 Tech Stack

- **Framework**: Next.js 15 (App Router, Turbopack)
- **Language**: React 19, TypeScript (Strict Mode)
- **Styling**: Tailwind CSS v4, shadcn/ui new-york v4
- **State**: Zustand v5, Dexie.js (IndexedDB)
- **Testing**: Vitest, Playwright
- **Others**: framer-motion, lucide-react, sonner, cmdk

## 📦 Getting Started

### Prerequisites
- Node.js 20+
- npm 10+

### Installation
```bash
# Clone the repository
git clone <your-repo>
cd MasarFlow

# Install dependencies
npm install
```

### Running the App
```bash
# Start the development server with Turbopack
npm run dev

# The app will be available at http://localhost:3000
```

## 🧪 Testing

The platform includes comprehensive unit testing via Vitest and End-to-End (E2E) testing via Playwright.

```bash
# Run unit tests
npm run test

# Run End-to-End UI tests
npm run e2e
```

## 🛡️ Security
The application is hardened with comprehensive Content Security Policies (CSP) configured at the framework level (`next.config.ts`) and enforces strict React Accessibility (`eslint-plugin-jsx-a11y`).

## 📜 Architecture Guidelines (AGENTS.md)
Please see `AGENTS.md` for our locked technical decisions, styling philosophy, and autonomous execution rules.
