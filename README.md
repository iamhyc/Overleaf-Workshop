# Overleaf-Workshop

Open Overleaf/ShareLaTex projects in vscode, with full collaboration support.

### Basic Design

- websocket API
  - sync remote text buffer
  - sync remote project structure
  - fetch remote history changes
  - display multiple cursors
  - send/receive chat message

- virtual workspace
  - display icon on sidebar when workspace open
  - mount project struture as virtual directory
  - display history changes in sidebar
  - chat message in sidebar

- support synctex-based (reverse) jump

- support local git bridge
