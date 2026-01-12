#!/bin/bash
# Generador de iconos para NRD Costos
# Uso: ./generate-icon.sh "TEXTO_DEL_ICONO"
# Ejemplo: ./generate-icon.sh "NRD COSTOS"

set -e

if [ -z "$1" ]; then
    echo "✗ Error: Debes proporcionar el texto del icono como parámetro"
    echo "   Uso: ./generate-icon.sh \"TEXTO_DEL_ICONO\""
    echo "   Ejemplo: ./generate-icon.sh \"NRD COSTOS\""
    exit 1
fi

ICON_TEXT="$1"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Generando icono con texto: \"$ICON_TEXT\""
echo "Directorio del proyecto: $PROJECT_ROOT"
echo ""

cd "$PROJECT_ROOT"

VENV_DIR=".venv"
if [ ! -d "$VENV_DIR" ]; then
    echo "Creando entorno virtual..."
    python3 -m venv "$VENV_DIR"
fi

echo "Activando entorno virtual..."
source "$VENV_DIR/bin/activate"

echo "Verificando dependencias..."
if ! python3 -c "import cairosvg" 2>/dev/null; then
    echo "Instalando cairosvg..."
    pip install -q cairosvg
else
    echo "✓ cairosvg ya está instalado"
fi

echo ""
echo "Generando iconos..."
python3 "$SCRIPT_DIR/generate-icon.py" "$ICON_TEXT"

echo ""
echo "✓ Iconos generados exitosamente!"
echo "  - icon-192.png"
echo "  - icon-512.png"
