# Overleaf-Workshop

> Only for open-source [overleaf](https://github.com/overleaf/overleaf).

Open Overleaf/ShareLaTex projects in vscode, with full collaboration support.

### Basic Design

- websocket API
  - sync remote text buffer --> `TextDocumentProvider`
  - sync remote project structure --> `FileSystemProvider``
  - fetch remote history changes
  - display multiple cursors
  - send/receive chat message
  - compile: 1) on save, 2) on `ctrl+alt+b`

- virtual workspace
  - display icon on "Activity Bar" when workspace open
  - mount project structure as virtual directory
  - display history changes in sidebar
  - chat message in sidebar

- On status bar, display:
  - build icon (with word count), chat icon

- support local syntax check

- support project-specific setting
  - "Compiler", "Main document"
  - "Spell check", "Dictionary"

- support source-PDF (reverse) jump (via API)

- support local git bridge

### UX Design

- Primary Sidebar: project structure, 

  - extension page: history list

- Secondary Sidebar: chat list

### References

- VSCode API Reference, [index.d.ts](./node_modules/@types/vscode/index.d.ts)

- Overleaf Web Route List, [webapi.md](./docs/webapi.md)

- Overleaf Official Logos, [link](https://www.overleaf.com/for/partners/jlogos)
