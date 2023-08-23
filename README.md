# Overleaf-Workshop

==**This project is in very early stage, stay tuned!**==

Open Overleaf (ShareLatex) projects in VSCode, with full collaboration support.



### TODO

- REST API (Overleaf Web Route List, [webapi.md](./docs/webapi.md))
  - [x] Login / Logout server
  - [x] List projects
  - [ ] Compile project
  - [ ] Get project build output (PDF)
  - [ ] Jump between code and pdf
  - [ ] Get file history updates and diff
  - [ ] Download original files
- WebSocket API
  - [x] Init websocket connection
  - [x] Request: `joinProject`, `joinDoc`, `leaveDoc`
  - [x] Request: `clientTracking.getConnectedUsers`
  - [ ] Request: `clientTracking.updatePosition`
  - [ ] Request: `applyOtUpdate`
- Open project as virtual workspace
  - [ ] sync remote project via `FileSystemProvider`
  - [ ] sync between "code" and "pdf" (REST API)
  - [ ] support local syntax check (via other extension)
  - [ ] compile: 1) on save, 2) on `ctrl+alt+b`
  - [ ] display "build icon" on status bar
- Collaboration
  - [ ] Display online users on each project
  - [ ] Display multiple colored cursors in joined doc
  - [ ] send/receive chat message
- Miscs
  - [ ] support project-specific settings:
    > "Compiler", "Main document", "Spell check", "Dictionary"
  - [ ] support local git bridge


### References

- Overleaf Official Logos, [link](https://www.overleaf.com/for/partners/jlogos)
