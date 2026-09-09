# Fiber-Optic Simulation (ITU-T G.652)

A web application for 3D simulation and real-time visualization of ITU-T G.652 standard single-mode optical fiber parameters.

## Overview

- **Interactive 3D Visualization**: Real-time rendering of optical fiber geometry, mode fields, pulse propagation, and bending effects.
- **Physical Parameter Modeling**: Calculates key optical parameters (cutoff wavelength, mode field diameter, chromatic dispersion, attenuation, and macrobending loss).
- **Modern Architecture**: Fast Python calculation engine (FastAPI) paired with a responsive 3D web frontend (React + Three.js).

## Quick Start

### Option 1: Docker (Recommended)

Start both the backend API and frontend in a single command:

```bash
make dev
```

- **Frontend**: [http://localhost:5173](http://localhost:5173)
- **API Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)

To stop the application:

```bash
make down
```

---

### Option 2: Local Development (Without Docker)

#### Prerequisites
- **Python 3.11+** with [`uv`](https://docs.astral.sh/uv/)
- **Node.js 18+** & `npm`

#### 1. Start the Backend API
```bash
uv run uvicorn apps.api.app.main:app --reload --port 8000
```

#### 2. Start the Frontend
```bash
cd apps/web
npm install
npm run dev
```

---

## Useful Commands

```bash
make test    # Run backend and frontend test suites
make lint    # Run code formatting and linting checks
```
