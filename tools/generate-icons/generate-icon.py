#!/usr/bin/env python3
"""
Generador de iconos SVG y PNG para NRD Costos
Genera iconos personalizados con el texto proporcionado
"""

import sys
import os
from pathlib import Path

def escape_xml(text):
    """Escapa caracteres especiales para XML"""
    return (text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&apos;"))

def calculate_font_size(text, max_width, base_size):
    """
    Calcula el tamaño de fuente óptimo para que el texto quepa en el ancho máximo
    """
    char_width_factor = 0.65 if any(c.isupper() for c in text) else 0.55
    estimated_width = len(text) * base_size * char_width_factor
    
    if estimated_width > max_width:
        calculated_size = base_size * (max_width / estimated_width) * 0.95
        return max(int(calculated_size), base_size // 2)
    if estimated_width < max_width * 0.7:
        return int(base_size * 1.1)
    return base_size

def generate_svg(text, size):
    """
    Genera el código SVG para un icono con el texto proporcionado
    """
    # Dividir el texto en líneas de manera inteligente
    words = text.split()
    
    if len(words) >= 2:
        mid = len(words) // 2
        line1 = " ".join(words[:mid])
        line2 = " ".join(words[mid:])
    else:
        if len(text) > 10:
            mid = len(text) // 2
            for i in range(mid - 2, mid + 3):
                if i < len(text) and text[i].lower() in 'aeiou':
                    mid = i + 1
                    break
            line1 = text[:mid]
            line2 = text[mid:]
        else:
            line1 = text
            line2 = ""
    
    # Calcular tamaños y posiciones según el tamaño del icono
    if size == 192:
        text_area_width = size * 0.90
        base_font_size = 50
        base_sub_font_size = 38
        
        main_font_size = calculate_font_size(line1, text_area_width, base_font_size)
        if line2:
            sub_font_size = calculate_font_size(line2, text_area_width, base_sub_font_size)
        else:
            sub_font_size = 0
        
        if line2:
            y_main = 88
            y_sub = 128
        else:
            y_main = 108
            y_sub = 0
        
        icon_size = 28
        icon_y = 20
        icon_spacing = 56
    else:  # 512
        text_area_width = size * 0.90
        base_font_size = 130
        base_sub_font_size = 100
        
        main_font_size = calculate_font_size(line1, text_area_width, base_font_size)
        if line2:
            sub_font_size = calculate_font_size(line2, text_area_width, base_sub_font_size)
        else:
            sub_font_size = 0
        
        if line2:
            y_main = 225
            y_sub = 315
        else:
            y_main = 275
            y_sub = 0
        
        icon_size = 75
        icon_y = 50
        icon_spacing = 150
    
    # Generar SVG con diseño mejorado
    corner_radius = size // 8
    stroke_width = max(1, size // 192)
    
    svg = f'''<svg width="{size}" height="{size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#dc2626;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#ef4444;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#b91c1c;stop-opacity:1" />
    </linearGradient>
    <filter id="shadow">
      <feDropShadow dx="0" dy="{size // 64}" stdDeviation="{size // 128}" flood-opacity="0.3"/>
    </filter>
  </defs>
  
  <!-- Background with rounded corners -->
  <rect width="{size}" height="{size}" fill="url(#bgGradient)" rx="{corner_radius}" ry="{corner_radius}"/>
  
  <!-- Portal icon (grid/network representation) - más sutil -->
  <g opacity="0.25">
    <rect x="{icon_y}" y="{icon_y}" width="{icon_size}" height="{icon_size}" fill="#ffffff" rx="{size // 48}" stroke="#ffffff" stroke-width="{stroke_width}" stroke-opacity="0.5"/>
    <rect x="{icon_y + icon_spacing}" y="{icon_y}" width="{icon_size}" height="{icon_size}" fill="#ffffff" rx="{size // 48}" stroke="#ffffff" stroke-width="{stroke_width}" stroke-opacity="0.5"/>
    <rect x="{icon_y}" y="{icon_y + icon_spacing}" width="{icon_size}" height="{icon_size}" fill="#ffffff" rx="{size // 48}" stroke="#ffffff" stroke-width="{stroke_width}" stroke-opacity="0.5"/>
    <rect x="{icon_y + icon_spacing}" y="{icon_y + icon_spacing}" width="{icon_size}" height="{icon_size}" fill="#ffffff" rx="{size // 48}" stroke="#ffffff" stroke-width="{stroke_width}" stroke-opacity="0.5"/>
    
    <!-- Conexiones más elegantes -->
    <line x1="{icon_y + icon_size // 2}" y1="{icon_y + icon_size // 4}" x2="{icon_y + icon_spacing}" y2="{icon_y + icon_size // 4}" stroke="#ffffff" stroke-width="{size // 96}" stroke-linecap="round"/>
    <line x1="{icon_y + icon_size // 2}" y1="{icon_y + icon_size // 2}" x2="{icon_y + icon_spacing}" y2="{icon_y + icon_size // 2}" stroke="#ffffff" stroke-width="{size // 96}" stroke-linecap="round"/>
    <line x1="{icon_y + icon_size // 4}" y1="{icon_y + icon_size // 2}" x2="{icon_y + icon_size // 4}" y2="{icon_y + icon_spacing}" stroke="#ffffff" stroke-width="{size // 96}" stroke-linecap="round"/>
    <line x1="{icon_y + icon_size // 2}" y1="{icon_y + icon_size // 2}" x2="{icon_y + icon_size // 2}" y2="{icon_y + icon_spacing}" stroke="#ffffff" stroke-width="{size // 96}" stroke-linecap="round"/>
    <line x1="{icon_y + icon_spacing}" y1="{icon_y + icon_size // 2}" x2="{icon_y + icon_spacing}" y2="{icon_y + icon_spacing}" stroke="#ffffff" stroke-width="{size // 96}" stroke-linecap="round"/>
    <line x1="{icon_y + icon_spacing + icon_size // 4}" y1="{icon_y + icon_size // 2}" x2="{icon_y + icon_spacing + icon_size // 4}" y2="{icon_y + icon_spacing}" stroke="#ffffff" stroke-width="{size // 96}" stroke-linecap="round"/>
  </g>
  
  <!-- Text with better styling -->
  <text x="{size // 2}" y="{y_main}" font-family="Arial, sans-serif" font-size="{main_font_size}" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="middle" filter="url(#shadow)" letter-spacing="{size // 384}">{escape_xml(line1)}</text>'''
    
    if line2 and sub_font_size > 0:
        svg += f'''
  <text x="{size // 2}" y="{y_sub}" font-family="Arial, sans-serif" font-size="{int(sub_font_size * 1.05)}" font-weight="bold" fill="#fef08a" text-anchor="middle" dominant-baseline="middle" filter="url(#shadow)" letter-spacing="{size // 384}">{escape_xml(line2)}</text>'''
    
    svg += "\n</svg>"
    
    return svg

def convert_svg_to_png_from_file(svg_path, png_path, size):
    """Convierte un archivo SVG a PNG"""
    try:
        import cairosvg
        
        cairosvg.svg2png(
            url=str(svg_path),
            write_to=str(png_path),
            output_width=size,
            output_height=size
        )
        print(f"✓ Generado {png_path.name} ({size}x{size})")
        return True
    except ImportError:
        print("✗ Error: cairosvg no está instalado")
        return False
    except Exception as e:
        print(f"✗ Error al convertir a PNG: {e}")
        return False

def main():
    if len(sys.argv) < 2:
        print("✗ Error: Debes proporcionar el texto del icono")
        print("   Uso: python3 generate-icon.py \"TEXTO_DEL_ICONO\"")
        return 1
    
    icon_text = sys.argv[1]
    
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent
    
    print(f"Generando iconos con texto: \"{icon_text}\"")
    print(f"Directorio: {project_root}")
    print()
    
    import tempfile
    temp_dir = Path(tempfile.mkdtemp())
    
    try:
        svg_192_content = generate_svg(icon_text, 192)
        svg_192_path = temp_dir / "icon-192.svg"
        with open(svg_192_path, 'w') as f:
            f.write(svg_192_content)
        
        svg_512_content = generate_svg(icon_text, 512)
        svg_512_path = temp_dir / "icon-512.svg"
        with open(svg_512_path, 'w') as f:
            f.write(svg_512_content)
        
        png_192_path = project_root / "icon-192.png"
        if not convert_svg_to_png_from_file(svg_192_path, png_192_path, 192):
            return 1
        
        png_512_path = project_root / "icon-512.png"
        if not convert_svg_to_png_from_file(svg_512_path, png_512_path, 512):
            return 1
        
    finally:
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
