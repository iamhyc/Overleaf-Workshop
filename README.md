# Overleaf-Workshop

**This project is in very early stage, stay tuned!**

Open Overleaf (ShareLatex) projects in VSCode, with full collaboration support.

[demo.webm](https://github.com/iamhyc/Overleaf-Workshop/assets/9068301/eb298b9b-0d08-4200-a61a-9df96692bc02)

### Compatibility

The following overleaf (sharelatex) versions provided on [Docker Hub](https://hub.docker.com/r/sharelatex/sharelatex) have been tested:

- [ ] sharelatex/sharelatex:4 (active)

- [x] [sharelatex/sharelatex:3.5](https://hub.docker.com/layers/sharelatex/sharelatex/3.5.11/images/sha256-05bf7235fa80fc86dc6ff999c1cd3e43f9ad088560270fadc696f16a4e508304?context=explore) (active) (verified by [@iamhyc](https://github.com/iamhyc))
- [ ] [sharelatex/sharelatex:3.4](https://hub.docker.com/layers/sharelatex/sharelatex/3.4/images/sha256-2a72e9b6343ed66f37ded4e6da8df81ed66e8af77e553b91bd19307f98badc7a?context=explore) (archived)
- [ ] [sharelatex/sharelatex:3.3](https://hub.docker.com/layers/sharelatex/sharelatex/3.3/images/sha256-e1ec01563d259bbf290de4eb90dce201147c0aae5a07738c8c2e538f6d39d3a8?context=explore) (archived)
- [ ] [sharelatex/sharelatex:3.2](https://hub.docker.com/layers/sharelatex/sharelatex/3.2/images/sha256-5db71af296f7c16910f8e8939e3841dad8c9ac48ea0a807ad47ca690087f44bf?context=explore) (archived)
- [ ] [sharelatex/sharelatex:3.1](https://hub.docker.com/layers/sharelatex/sharelatex/3.1/images/sha256-5b9de1e65257cea4682c1654af06408af7f9c0e2122952d6791cdda45705e84e?context=explore) (archived)
- [ ] [sharelatex/sharelatex:3.0](https://hub.docker.com/layers/sharelatex/sharelatex/3.0/images/sha256-a36e54c66ef62fdee736ce2229289aa261b44f083a9fd553cf8264500612db27?context=explore) (archived)


### TODO

- REST API (Overleaf Web Route List, [webapi.md](./docs/webapi.md))
  - [x] Login / Logout server
  - [x] List projects
  - [ ] Compile project
  - [ ] Get project build output (PDF)
  - [ ] Jump between "code" and "pdf"
  - [ ] Get file history updates and diff
  - [x] Download original files
- WebSocket API
  - [x] Init websocket connection
  - [x] Request: `joinProject`, `joinDoc`, `leaveDoc`
  - [ ] Request: `applyOtUpdate`
  - [ ] Request: `clientTracking.getConnectedUsers`
  - [ ] Request: `clientTracking.updatePosition`
  - [ ] Event: `otUpdateApplied`
  - [x] Event: `reciveNewDoc`, `reciveNewFile`, `reciveNewFolder`
  - [x] Event: `reciveEntityRename`, `removeEntity`, `reciveEntityMove`
  - [ ] Event: `clientTracking.clientUpdated`, `clientTracking.clientDisconnected`
  - [ ] Event: `compilerUpdated`
  - [ ] Event: `projectNameUpdated`
- Open project as virtual workspace
  - [ ] sync remote project via `FileSystemProvider`
  - [ ] support local syntax check (via other extension)
  - [ ] compile project: 1) on save, 2) on `ctrl+alt+b`
  - [ ] display "build icon" on status bar
- Collaboration
  - [ ] Display online users on side bar
  - [ ] Display multiple colored selections (via `setDecorations`)
  - [ ] send/receive chat message
- Miscs
  - [ ] support project-specific settings:
    > "Compiler", "Main document", "Spell check", "Dictionary"
  - [ ] support local git bridge


### References

- Overleaf Official Logos, [link](https://www.overleaf.com/for/partners/jlogos)
