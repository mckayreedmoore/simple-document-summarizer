# Simple Document Summarizer

A full-stack web application for uploading, processing, and summarizing documents of various formats. The app provides a chat-like interface for interacting with document content, supporting incremental streaming of responses and file management.

## Project Structure

```
root/
│   package.json           # Root-level scripts and dependencies
│   README.md              # Project documentation
│   summarizer.db          # SQLite database 
│
├── client/                # Frontend (React + Vite + Tailwind CSS)
│   ├── src/               # React source code
│   │   ├── components/    # UI components (chat, file list, drag & drop, etc.)
│   │   ├── hooks/         # Custom React hooks
│   │   ├── types/         # TypeScript types
│   │   └── assets/        # Static assets
│   ├── public/            # Static files
│   ├── package.json       # Frontend dependencies and scripts
│   └── ...                # Config files (Vite, Tailwind, etc.)
│
├── server/                # Backend (Node.js + Express + TypeScript)
│   ├── src/               # Server source code
│   │   ├── controllers/   # Express route controllers
│   │   ├── middlewares/   # Express middlewares
│   │   ├── models/        # Data models
│   │   ├── services/      # Business logic (file/message processing)
│   │   ├── types/         # TypeScript types
│   │   └── utilities/     # Utility functions (DB, logger, etc.)
│   ├── package.json       # Backend dependencies and scripts
│   └── ...                # Config files
│
├── exampleFiles/          # Example documents for testing
│
```

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm (v9+ recommended)

### 1. Clone the repository
```bash
git clone <repo-url>
cd simple-document-summarizer
```

### 2. Install dependencies
#### Install server dependencies:
```bash
cd server
npm install
```
#### Install client dependencies:
```bash
cd ../client
npm install
```

### 3. Configure environment variables
- Copy `.env.example` to `.env` in the `server/` directory and adjust as needed (e.g., file size limits, database path, etc.).

### 4. Run the application
#### Start both backend and frontend together (recommended):
```bash
npm run dev
```
- Run this command from the root directory to start both the server and client concurrently.

#### Start backend or frontend individually from the root directory:
```bash
npm run server:dev   # Start only the backend server
npm run client:dev   # Start only the frontend client
```

#### Alternatively, you can run the original commands in their respective directories:
```bash
cd server && npm run dev    # Start backend only
cd ../client && npm run dev # Start frontend only
```
- The client will typically be available at `http://localhost:5173` (or as shown in the terminal).
- The server will run on the port specified in your `.env` (default: 3001).

## Example Files
- The `exampleFiles/` directory contains sample documents (PDF, DOCX, CSV, TXT, etc.) for testing uploads and summarization.

## Useful npm Scripts

### Root (`package.json`)
- `npm run dev` — Start both the server and client concurrently (recommended for development)
- `npm run build` — Build both the client and server for production
- `npm run format` — Format all code with Prettier
- `npm run typecheck` — Type-check both client and server

### Server (`server/package.json`)
- `npm run dev` — Start the server in development mode with auto-reload (nodemon)
- `npm run build` — Type-check and compile TypeScript to JavaScript

### Client (`client/package.json`)
- `npm run dev` — Start the Vite development server
- `npm run build` — Type-check and build the React app for production
- `npm run preview` — Preview the production build locally
- `npm run lint` — Lint client code

## Features
- Upload and process multiple document types (TXT, PDF, DOCX, CSV, Markdown, JSON, etc.)
- Chat interface for summarizing and querying document content
- Real-time streaming of responses (SSE)
- File management and conversation clearing
- Example files for easy testing

## License
MIT
