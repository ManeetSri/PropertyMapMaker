# Property Map Editor

A React + Konva canvas editor for laying out a property map as structured JSON
rather than a flat image.

## Run

```bash
npm install
npm run dev
```

Then open the Vite URL. `npm run build` produces a `dist/` that also works when
opened directly from disk (asset paths are relative).

## Using it

| Action | How |
| --- | --- |
| Move | Drag an object |
| Resize / rotate | Drag the selection handles |
| Rename | Double-click a block or text, or edit the Label field |
| Pan | Drag empty canvas |
| Zoom | Mouse wheel, pinch, or the toolbar buttons (all stay anchored) |
| Fit everything on screen | **Fit** |
| Select several | Shift+drag a marquee, or Ctrl/Cmd+click rows in the Objects list |
| Undo / redo | `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` |
| Duplicate | `Ctrl/Cmd+D` |
| Delete | `Delete` / `Backspace` |
| Nudge | Arrow keys (`Shift` for 10x) |
| Select all | `Ctrl/Cmd+A` |
| Deselect | `Escape` |

New objects are always created at the centre of the current view and cascade so
repeated adds never stack invisibly on top of each other.

**Snap** aligns to other objects' edges and centres with pink guides; **Grid**
adds a 10-unit grid and snaps to it.

The **Objects** panel lists everything topmost-first, so a locked or off-screen
object is always reachable; each row can be hidden or locked. The sheet and the
plot boundary are ordinary locked objects — unlock them to edit or export them.

## Saving

The map autosaves to this browser about half a second after every change.
**Save** flushes immediately, **Export JSON** writes a portable file, and
**Import JSON** validates a file before loading it (a malformed file leaves the
current map untouched). **Reset Map** discards the saved map and restores the
original layout.

Saved data carries a schema version and is migrated on load, so maps saved by
the earlier version still open correctly.

## Layout

```
src/
  main.jsx              entry point (StrictMode + error boundary)
  App.jsx               state, history, autosave, keyboard shortcuts
  model/objects.js      object model, defaults, validation, migration
  model/storage.js      localStorage load/save, import/export
  hooks/useHistory.js   undo/redo
  hooks/useStageSize.js container-based canvas sizing
  components/           Canvas, MapObject, Toolbar, Inspector, ObjectList, …
```
