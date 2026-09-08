# Property Map Editor

A React + Konva editor for a **property document**: a map that is to scale, with
owners and real areas, irregular sections, and exports the family can open on a
phone or print.

## Run

```bash
npm install
npm run dev
```

Editor: the Vite URL. Read-only viewer: `/viewer.html` (same saved map).

```bash
npm run build        # dist/index.html (editor) + dist/viewer.html (single file)
npm run test:model   # migration, geometry, and scale checks
```

`dist/index.html` and `dist/viewer.html` both open from disk (`file://`).

## Using it

| Action | How |
| --- | --- |
| Move | Drag an object |
| Resize / rotate | Handles. Shift = keep ratio, Alt = from centre, rotation snaps to 15° |
| Polygon section | **Section** tool: click corners, Enter or click the first point to close |
| Freehand | **Freehand** tool: drag, then it simplifies to a polygon |
| Measure | **Measure** tool: drag a dimension; the label follows the scale |
| Rename | Double-click a block or text, or edit the Label field |
| Pan | Drag empty canvas |
| Zoom | Mouse wheel, pinch, or the toolbar buttons (all stay anchored) |
| Fit everything on screen | **Fit** |
| Select several | Shift+drag a marquee, or Ctrl/Cmd+click rows in the Objects list |
| Undo / redo | `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` |
| Duplicate | `Ctrl/Cmd+D` |

The **Scale** tab calibrates units-per-foot from a dimension, previews the
vertical un-squash (with a JSON backup), and lists remaining size errors.
**Layers** show/hide/lock groups. **Owners** colour the map as a partition and
total areas. **By owner** toggles that colouring without changing fills.

**Family page** downloads a self-contained HTML file. **View** opens the
read-only viewer (pan, zoom, tap a section for owner and area, print).

Saved maps are schema v3 and migrate automatically from v1 (bare array) and v2.

## Layout

```
src/
  main.jsx              editor entry
  viewer/               read-only family page
  App.jsx               state, history, autosave, shortcuts
  model/                document, objects, geometry, scale transforms
  export/               PNG, PDF, family HTML
  components/           Canvas, MapObject, panels, …
```
