# Overleaf-Workshop

==**This project is in very early stage, stay tunned!**==

Open Overleaf (ShareLatex) projects in VSCode, with full collaboration support.



### TODO

- Web API reverse engineering (Overleaf Web Route List, [webapi.md](./docs/webapi.md))

  - [ ] Login / Logout Server
  - [ ] Create / Delete Project
  - [ ] Fetch project entities, project change histories
  - [ ] Remote Edit Cursor Position
  - [ ] ...

- Open project as virtual workspace

  - [ ] sync remote project structure via `FileSystemProvider`
  - [ ] sync remote text buffer via `TextDocumentProvider`
  - [ ] support "source <--> PDF" (reverse) jump (via web API)
  - [ ] support local syntax check (via other extension)
  - [ ] compile: 1) on save, 2) on `ctrl+alt+b`
  - [ ] display "build icon" on status bar

- Collaboration

  - [ ] Display online users on each project
  - [ ] Display multiple colored cursors in one file
  - [ ] send/receive chat message

- Miscs

  - [ ] support project-specific settings:

    > "Compiler", "Main document", "Spell check", "Dictionary"

  - [ ] support local git bridge



### References

- Overleaf Official Logos, [link](https://www.overleaf.com/for/partners/jlogos)
