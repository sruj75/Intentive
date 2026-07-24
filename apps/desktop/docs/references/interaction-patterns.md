# Interaction Patterns Reference

## Table of Contents
1. Keyboard Shortcuts
2. Visual Feedback & Micro-Animations
3. Search Patterns
4. Drag and Drop
5. Optimistic UI
6. Onboarding
7. Floating Action Bars

---

## 1. Keyboard Shortcuts

macOS is filled with keyboard shortcuts. They are a first-class interaction pattern, not an afterthought.

**Rules:**
- Every primary action MUST have a keyboard shortcut
- Show shortcut hints next to actions (e.g., button label + "⌘S" in lighter text)
- Use standard macOS conventions where applicable:
  - `⌘N` — New
  - `⌘F` — Find/Search
  - `⌘W` — Close window/tab
  - `⌘,` — Preferences/Settings
  - `⌘⇧S` — Save As / Quick Save
  - `⌘Space` — Spotlight-style search
  - `⌘Tab` — Switch (adapt to your context)
  - `Esc` — Dismiss/Close/Cancel
  - `Enter/Return` — Confirm/Submit

**Shortcut hint rendering:**
```
⌘  →  Command (looped square icon)
⇧  →  Shift
⌥  →  Option
⌃  →  Control
```

Display these in small rounded `<kbd>` style boxes.

**Shortcut cheat sheet**: Provide a settings/preferences panel or a dedicated shortcut overlay (like Google Docs' `⌘/`). Ironically triggered by another keyboard shortcut.

**Critical**: Keyboard shortcuts are powerful but easy to forget. Educate users through:
- Onboarding that teaches by doing (not reading)
- Persistent hints next to buttons
- A discoverable cheat sheet

---

## 2. Visual Feedback & Micro-Animations

**Core principle**: If you don't see a change, you assume something went wrong. Every interaction needs immediate visual feedback.

**State changes that need animation:**
- Panel sliding in/out (quicksave, preview, sidebar)
- Search bar expanding/collapsing
- Items appearing in a grid (stagger in)
- Toast notifications entering and exiting
- Hover states on cards and buttons
- Active/selected state changes
- Drag start/drag over/drop states

**Animation guidelines:**
```css
--ease-out: cubic-bezier(0.25, 0.46, 0.45, 0.94);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);    /* slight overshoot */
--ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);

--duration-fast: 150ms;
--duration-normal: 250ms;
--duration-slow: 400ms;
```

**Slide-in panel:**
```css
.panel {
  transform: translateX(100%);
  transition: transform var(--duration-normal) var(--ease-out);
}
.panel.open {
  transform: translateX(0);
}
```

**Toast notification:**
```css
.toast {
  transform: translateY(20px);
  opacity: 0;
  transition: all var(--duration-fast) var(--ease-spring);
}
.toast.visible {
  transform: translateY(0);
  opacity: 1;
}
```

**Collapsible search bar:**
```css
.search-bar {
  width: 32px;
  transition: width var(--duration-normal) var(--ease-out);
  overflow: hidden;
}
.search-bar:focus-within,
.search-bar.expanded {
  width: 240px;
}
```

---

## 3. Search Patterns

Three options depending on your app:

**Option A: Floating Search Bar** (recommended for single-screen apps)
- Lives at bottom or top of content area
- Collapses to a pill shape when not in use
- Expands on `⌘F` or click
- Floats above content with backdrop blur

**Option B: Command Palette** (best for complex multi-screen apps)
- Triggered by `⌘K` or `⌘Space`
- Centered floating modal, full-screen overlay
- Keyboard-navigable results list
- Supports actions, not just search results

**Option C: Inline Top Bar Search** (Apple's standard pattern)
- Persistent field in the top bar
- Used in Finder, Music, Photos
- Always visible and accessible

**AI-powered search** (differentiating feature):
- Natural language queries ("photos from Paris last summer")
- Semantic similarity, not just keyword matching
- Show AI-generated suggestions as user types

---

## 4. Drag and Drop

Non-negotiable for native macOS feel.

**Drop zone behavior:**
```css
.drop-zone-active {
  border: 2px dashed var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  border-radius: 8px;
}
```

**Dragging item:**
```css
.dragging-item {
  opacity: 0.5;
  transform: scale(0.95);
  cursor: grabbing;
}
```

**React event handlers:**
```jsx
onDragStart={(e) => {
  e.dataTransfer.setData('text/plain', item.id);
  setDragging(item.id);
}}
onDragOver={(e) => {
  e.preventDefault();
  setDropTarget(zone.id);
}}
onDrop={(e) => {
  e.preventDefault();
  handleDrop(e.dataTransfer.getData('text/plain'), zone.id);
  setDropTarget(null);
}}
onDragEnd={() => setDragging(null)}
```

**Key rules:**
- Accept drops from Finder, other apps, desktop (not just internal items)
- Dragging creates a ghost/preview following the cursor
- Drop zone highlights clearly on dragover
- Provide visual feedback on successful drop

---

## 5. Optimistic UI

Process actions in the background. Assume success. Revert on failure.

**Pattern:**
1. User triggers action (save, delete, share)
2. Immediately update local state / UI
3. Show success feedback (toast, animation)
4. Process actual operation async (API call, file write)
5. On failure: revert state + show error toast with retry option

```jsx
const handleSave = async (item) => {
  // Step 2: Optimistic update
  setItems(prev => [...prev, { ...item, status: 'saving' }]);
  showToast('Saved!');
  
  try {
    // Step 4: Actual operation
    await saveToStorage(item);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'saved' } : i));
  } catch (err) {
    // Step 5: Revert
    setItems(prev => prev.filter(i => i.id !== item.id));
    showToast('Failed to save. Tap to retry.', { action: () => handleSave(item) });
  }
};
```

---

## 6. Onboarding

Keep it brief. Teach by doing.

**Rules:**
- Single modal, 1-3 steps maximum
- The way to dismiss IS the shortcut being taught
- Use micro-animations to demonstrate the interaction
- Never use a carousel of static screenshots

**Example:**
```
┌─────────────────────────────────┐
│                                 │
│   Press ⌘S to save anything    │
│                                 │
│   [Try it now →]                │
└─────────────────────────────────┘
```

The button does nothing — the user must actually press ⌘S to advance.

**Shortcut cheat sheet in settings:**
- Triggered by `⌘?` or `⌘/`
- Full list of shortcuts, grouped by category
- Searchable

---

## 7. Floating Action Bars

For preview panels and detail views — a pill-shaped bar floating at the bottom.

```css
.floating-action-bar {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: rgba(30, 30, 30, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 20px;
  border: 0.5px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

@media (prefers-color-scheme: light) {
  .floating-action-bar {
    background: rgba(255, 255, 255, 0.85);
    border-color: rgba(0, 0, 0, 0.1);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  }
}
```

**Design rules:**
- Icons only (with tooltip on hover) or icon + short label
- Common actions: Copy, Share, Find Similar, Delete
- Appears on hover or when panel opens
- Disappears when not needed (progressive disclosure)
