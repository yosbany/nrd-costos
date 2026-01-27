#!/usr/bin/env python3
"""
Actualiza los parámetros de versión en index.html para cache busting
"""

import re
import os
from pathlib import Path
from datetime import datetime

def update_version():
    # Generate timestamp version
    version = int(datetime.now().timestamp() * 1000)
    
    # Get the project root (parent of tools directory)
    script_dir = Path(__file__).parent.parent.parent
    html_path = script_dir / 'index.html'
    
    if not html_path.exists():
        print(f"❌ Error: {html_path} no encontrado")
        return
    
    # Read index.html
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    # Remove existing version parameters
    html = re.sub(r'\?v=\d+', '', html)
    
    # Add version parameter to CSS
    html = re.sub(
        r'(<link[^>]*href=["\'])(assets/styles/styles\.css)(["\'][^>]*>)',
        rf'\1\2?v={version}\3',
        html
    )
    
    # Add version parameter to JS files (app.js and service-worker.js)
    html = re.sub(
        r'(<script[^>]*src=["\'])(app\.js|service-worker\.js)(["\'][^>]*>)',
        rf'\1\2?v={version}\3',
        html
    )
    
    # Add version parameter to nrd-data-access and nrd-common (local development)
    html = re.sub(
        r'(<script[^>]*src=["\'])(/nrd-data-access/dist/nrd-data-access\.js|/nrd-common/dist/nrd-common\.js)(["\'][^>]*>)',
        rf'\1\2?v={version}\3',
        html
    )
    
    # Add version parameter to service worker registration
    html = re.sub(
        r'(serviceWorker\.register\(["\'])(service-worker\.js)(["\'])',
        rf'\1\2?v={version}\3',
        html
    )
    
    # Write back
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html)
    
    print(f"✅ Version updated to: {version}")
    print(f"📝 Updated index.html with cache busting parameters")

if __name__ == "__main__":
    update_version()
