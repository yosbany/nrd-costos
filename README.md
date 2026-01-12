# NRD Costos

Sistema de gestión de costos - PWA

## Características

- Gestión de costos
- Funciona offline (PWA)

## Tecnologías

- HTML, CSS, JavaScript (Vanilla)
- Firebase Realtime Database
- Firebase Authentication
- Service Worker (PWA)
- NRD Data Access Library

## Interfaz

### Sistema de Colores en Formularios

Los formularios y vistas de detalle utilizan un sistema de colores coordinado para indicar la acción actual:

#### Cabezales de Formularios

- **Verde** (`bg-green-600`): Formularios de **Nuevo** registro
- **Azul** (`bg-blue-600`): Formularios de **Edición** de registros existentes
- **Gris** (`bg-gray-600`): Vistas de **Detalle** (solo lectura)

#### Botones Principales

Los botones principales (Guardar/Finalizar) tienen el mismo color que el cabezal del formulario para mantener consistencia visual:

- **Verde** (`bg-green-600`): Botón "Guardar" en formularios de **Nuevo** registro
- **Azul** (`bg-blue-600`): Botón "Guardar" en formularios de **Edición**
- **Gris** (`bg-gray-600`): Botón "Cerrar" en vistas de **Detalle**

Este sistema proporciona retroalimentación visual inmediata y consistente sobre el contexto de la acción que el usuario está realizando.

## Despliegue

Desplegado en GitHub Pages: https://yosbany.github.io/nrd-costos/
