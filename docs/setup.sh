#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# FraudLens3D — Data Setup Script
# Downloads all 12 NYC Open Data datasets into data/ and links them into
# src/public/data/ so the React dev server can serve them.
#
# Usage:
#   bash docs/setup.sh
#
# Requirements:
#   Python 3.9+  (pip packages: requests, pandas)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_ROOT/data"
PUBLIC_DATA_DIR="$PROJECT_ROOT/src/public/data"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║           FraudLens3D — Dataset Setup                ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── 1. Check Python ───────────────────────────────────────────────────────────
echo "▸ Checking Python..."

if command -v python3 &>/dev/null; then
    PYTHON=python3
elif command -v python &>/dev/null; then
    PYTHON=python
else
    echo "  ERROR: Python 3 not found. Install from https://python.org"
    exit 1
fi

PY_VER=$($PYTHON --version 2>&1 | awk '{print $2}')
echo "  Using $($PYTHON --version 2>&1) at $(command -v $PYTHON)"

# ── 2. Create / activate virtual environment ──────────────────────────────────
VENV_DIR="$PROJECT_ROOT/.venv"

if [ ! -d "$VENV_DIR" ]; then
    echo ""
    echo "▸ Creating Python virtual environment..."
    $PYTHON -m venv "$VENV_DIR"
fi

# Activate
if [ -f "$VENV_DIR/bin/activate" ]; then
    source "$VENV_DIR/bin/activate"
else
    # Windows Git Bash path
    source "$VENV_DIR/Scripts/activate"
fi

echo "  Virtual environment ready."

# ── 3. Install Python dependencies ────────────────────────────────────────────
echo ""
echo "▸ Installing Python packages (requests, pandas)..."
pip install --quiet --upgrade requests pandas

# ── 4. Create data directories ────────────────────────────────────────────────
mkdir -p "$DATA_DIR"
mkdir -p "$PUBLIC_DATA_DIR"

echo ""
echo "▸ Downloading datasets from NYC Open Data..."
echo "  (This downloads ~12 CSV files. Please wait 1–3 minutes.)"
echo ""

# ── 5. Run download script ────────────────────────────────────────────────────
$PYTHON "$SCRIPT_DIR/download_data.py"

# ── 6. Copy CSVs into src/public/data/ ───────────────────────────────────────
echo ""
echo "▸ Copying datasets into src/public/data/ ..."

CSV_COUNT=0
for csv in "$DATA_DIR"/*.csv; do
    [ -f "$csv" ] || continue
    filename="$(basename "$csv")"
    cp "$csv" "$PUBLIC_DATA_DIR/$filename"
    echo "  ✓ $filename"
    CSV_COUNT=$((CSV_COUNT + 1))
done

# ── 7. Summary ────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Setup complete!  $CSV_COUNT datasets ready.                "
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  cd src"
echo "  npm install"
echo "  npm start"
echo ""
echo "Then open http://localhost:3000"
echo ""
