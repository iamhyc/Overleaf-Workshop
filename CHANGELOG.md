# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] - 2023-12-29
### Added
- feat: integrate invisible mode
  - Commit: fbaabd724e5ca09895efc84e92516c7f0ff86420

### Changed
- chore: cleanup triggers register
  - Commit: cbc282c8302a98a0bad3450784fbb3ebc55e9869
- chore: disable entry for incomplete feature tether
  - Commit: 301a1a2b4eeda2f95915446814e9aa7bbe1504b9

## [0.6.1] - 2023-12-18
### Fixed
- fix: pdf viewer color theme bug
  - Commit: 3c63a0d777b9dd0002d8dcd9a7f23a5ab194e404

## [0.6.0] - 2023-12-18
### Added
- feat: chat view support up/down key navigating
  - Commit: a1c80b98f2ce219ccc19adfbb8b56095938d0a9b

### Fixed
- fix: pdf viewer color scheme
  - Commit: 717d9179e21fc708226d568e2b7e90c024eaa800

## [0.5.5] - 2023-12-16
### Added
- feat: local replica better overwriting
  - Commit: 056c18f2df6af96abdfd6d5fcd7b7a3d43b2688f
- Add latex doc symbol provider
  - Commit: 4058609de268748428390c7779b8def9baab66d2
- add tex doc formatter
  - Commit: 31f76d7c3df25958fd66cb9494751c642fa03881
- feat: alternative socketio interface
  - Commit: 1b4c94399d4f01ae67fd25c1e213cf9d120caa08
- feat: socketioAlt refresh messages and project settings
  - Commit: 5aa8ed4376a33688fdb967189a4882e7711c0a48
- feat: socketioAlt refresh vfs and users
  - Commit: 91d70959689dca3f87d8b26744ab1e8911c753d7
- add log, add input support, fix symbol string func call bugs
  - Commit: ba4db462e5f7d54a31dffbc8427523ea7436b607

### Changed
- chore(deps-dev): bump vite from 4.4.11 to 4.4.12 in /views/chat-view
  - Commit: 29d51aaedcf4e6da19822e42227eb666fe845bbf

### Fixed
- fix: move/copy files between vfs
  - Commit: 8cafb87fbb7481ab29c551953b028fe7c36032a0
- fix: hierarchy symbol mismatch
  - Commit: e1023c078a3dc2e81454246a606433a2c28f95ff
- fix: resume socketio handlers mem leak
  - Commit: 9c313b3cd5314ea5060a6781aa29cd15bfc10949
  - Commit: 8fd39ce3652426b8099c009ff665e31e9eefd3ec

## [0.5.4] - 2023-12-07
### Changed
- chore: improve accessibility
  - Commit: 7110ff9d55c516a7cf9430b083a6ea2ab9218e82

### Fixed
- fix: bug due to previous refactor
  - Commit: 5c88a255df2e35b819f3480fcacacfb42a812578
- fix: add timeout reject for socketio emit
  - Commit: d3dd2b0985b34d892f69424058a8c99fb81a7406

## [0.5.3] - 2023-12-04
### Added
- feat: allow jump to user via command
  - Commit: 5868168f11f95db7b4c0c47b92765a0e686e2215

### Changed
- chore: normalize command register
  - Commit: 85879c07032f1c2ba8cb0fe0678b350bbfa1a945
- chore: timeoutPromise type inference
  - Commit: d4216d52ad728b0ce8800e3a744feb54dfd0ad10

### Fixed
- fix: normalize command display in command palette
  - Commit: 8d44c255800c731e3b5e2fe0764285b72aaf5146
- fix: add timeout for joinProject
  - Commit: 79d4f728f8bd8ca2180e4afe6db18c547edf7493
- fix:reconnect issue
  - Commit: 4049dd774ceb8f3351001c079ba93745ff79daf5
- fix: focus on chat input box
  - Commit: 031154ad83fda62d2cfc08b8fe919f49c5f40d94

## [0.5.2] - 2023-12-01
### Fixed
- fix: fetch project with multiple tags
  - Commit: da7e331bfb23878096da4ab07bbfac0c399a6442

## [0.5.1] - 2023-11-30
### Added
- feat: allow enable/disable scm
  - Commit: dbf1e048c63e6efeec150ff0d96f7dc91b9294f9

### Fixed
- fix: restore pdf viewer scroll position
  - Commit: 265fe3b2304d89b346b7aae5f7a4325ae5685942
- fix: socketio connection procedure
  - Commit: 760875896bba6245f9bc39e145a5bd91b2e97a8f

## [0.5.0] - 2023-11-28
### Changed
- chore: promote local replica
  - Commit: ce95c3e370662c0943b04a693a1ecd753ae95c9f

### Fixed
- fix: pdf viewer init theme button
  - Commit: ffbf91c1c60f7566d488f21d1c7e82b006ee85b3

## [0.4.4] - 2023-11-20
### Changed
- chore: adjust UX
  - Commit: 75876e9a70ca177e1241d5096702dd6fd390438d

## [0.4.3] - 2023-11-20
### Added
- add reload
  - Commit: b1c7078199a2ae42f53252525ba3a327eb661e22

### Changed
- chore: adjust pdf viewer dark theme
  - Commit: 191ab2aa930564d7283c48c4c36e5fc7b598149b

### Fixed
- fix: local replica path parse failure
  - Commit: 57ec738cad06c215d67f01c0bff0429c1432de77
- fix: pdf viewer state resume
  - Commit: 2ef8a5d4654ea29ad5b9b48da3bc88ca5a060753

## [0.4.2] - 2023-11-18
### Added
- feat: support project upload
  - Commit: 53d85fd4734a026e97551da1bf6383eaf382523b
- feat: support project download
  - Commit: 3e5ebb238205b72790975d90b7168100a66a0079
- feat: allow to show all key versions
  - Commit: cda67d1f87d9f2116317a4f7914e4400605cd953
- feat: feat: more diff actions
  - Commit: 79fb4945e407c1458cc825e4291e96cbfb75c0c8
- feat: init scm api design
  - Commit: e60dbd6bcc05ac16a22a6205efa860608a53b393
- feat: support local replica scm
  - Commit: fdfb2decbfbfd98c523a7b43ca6c30b6a447b977
- feat: support scm status bar item
  - Commit: bacd53ab58de77335efbe3f5a01a6971ce102b65
- feat: open locally with vfs support
  - Commit: 0cbf07aca4a92d9104cc0ccba272a46ab540db27

### Fixed
- fix: command completion
  - Commit: ca47750215ad5e1fac7977ad62c7face3921bf0b
- fix: compile script order
  - Commit: b8b711a107030a0122079c66e3400599136a8eb1
- fix: npm script run under windows
  - Commit: 2981adf8739d5931c9d839d4321b115ca0b2a93a
- fix: use Uri.path for cross-platform consistency
  - Commit: b2516e18faeca8c7e25af3253e3fea6070d35c13

## [0.4.1] - 2023-10-30
### Added
- feat: support project settings
  - Commit: 8d2ace909e71bd5bdde97d14f48d71043696dff5
- feat: unlearn words
  - Commit: bc39e015f1713e459578ece0c8052bdd29faf128

### Changed
- chore: show email in project list
  - Commit: bf7aad1c9c1939d272dfab604e5ecc31b95a3ae2
- refactor: decouple the design
  - Commit: 1c2afeb6332ac99597c7fa9f28ab6d72d5b51b59

### Fixed
- fix: load online cmaps for pdfjs
  - Commit: c03146b0e9f52b192f0ac38d4fb40af114969404

## [0.4.0] - 2023-10-25
### Added
- feat: support line reference
  - Commit: 011603c97babd51ba1019ccaa62213a1384902b6
- feat: support cite user
  - Commit: 045858aa91dd1f17e7bb2b55f2a2898b4eb8e1cf
- feat: notify new message and scroll into view
  - Commit: 9bc376451256e0ccec223b0e7e5ff3af4c2ea060
- feat: notify new message on status bar
  - Commit: cbaee4e8d749477e32daa200fa188bc2e64ff6d6

### Fixed
- fix: spell check word split
  - Commit: 13a7134b26ec9e5ef8cecfd9f1dca240f5287498

## [0.3.3] - 2023-10-23
### Fixed
- fix: response to spell check language change
  - Commit: 0f8575cb5e4cd1a36d0b07c19f58f28be3cd2cae

## [0.3.2] - 2023-10-23
### Added
- feat: init chat view
  - Commit: 9a9ee85c284c721e875bb751b536312845dffff9
- feat: update input box view
  - Commit: b36e62f807fe15422639027ebee27e0bdbf3da3f
- feat: complete basic function
  - Commit: 884a80a6235597ef644f14f72ed4d5b41d08100d
- feat: support reply in thread
  - Commit: 7a5c0feb70317f4cd51da8b6aa131797975f595f
- feat: add overleaf official as default server
  - Commit: 06126d0eb693f18e14c9aa0b35925575f45cdbfc

### Changed
- chore: login prompt
  - Commit: 2c96fb95e596b8ab26ec883f3fb16c435e14305c

### Fixed
- fix: clientAgent multiple register
  - Commit: d822c96a7df5ae2e405f056ad35d9ebccefcda13

## [0.3.1] - 2023-10-17
### Added
- feat: add chat messages api
  - Commit: 80afcfd09f0cf488ceeddc4286c614bb20eb6ab7
- init chat webview
  - Commit: 37fb201d783f0d2007bd8f0dd119cf3a3d727b71
- enable socketio reconnect
  - Commit: 359270cdb793d9fc70cf6d3268b3286ab9cf8e3e

### Changed
- refactor: make views/pdf-viewer standalone
  - Commit: f1cade53eb8cc3633cd9e20327231535fad101ce
- chore: update vue build
  - Commit: 2267d599cd05879dd1095d6348d552dcd59c3b68

## [0.3.0] - 2023-10-04
### Fixed
- fix: handling socketio ascii content
  - Commit: a615cb6f318329f370733d4bd15cd862ca6b0d30

## [0.2.6] - 2023-09-30
### Added
- robust cookie login
  - Commit: 746dc3980b71477a40516922136c74c279c8896c

## [0.2.5] - 2023-09-30
### Added
- feat: use active user color on status bar
  - Commit: 48d6371410c3978d5e98f787c411655ce063d2de

### Changed
- chore: adjust ui
  - Commit: e20ff09e066b035e7da6b552f2e48d6050319aef
- refactor: base api
  - Commit: a754efbbece697b9affdc3550b1ea05634de4926
- chore: add empty file as doc type
  - Commit: 9d33023969127c9300dbce59b753170920f53d1e

### Removed
- remove Diff
  - Commit: b94af16c8bb0d09594a85c00dd4ce33d1f42481e

### Fixed
- fix: decoration local expand behavior
  - Commit: 461c709448c0e04f644bd79d005eff6f01bef2c0
- fix: spreadMode not stored
  - Commit: efbfccb29f2dfca951084cdd56dedb9e8f43d266
- fix: update patch
  - Commit: 716df46f5eb6cfdde10b2cf80c4cff0c2eaf50c9

## [0.2.4] - 2023-09-24
### Added
- handle out-of-sync
  - Commit: 1bcc0e062936eb0b32cc1b0ad4ea0f5c90e54bf6

## [0.2.3] - 2023-09-24
### Added
- feat: add history related api
  - Commit: dfe869eaeb368b4c433e0669d7d5ca281a9d8c82
- feat: add fileWillOpen event
  - Commit: cf2397dd68cee42ac881412d9b01b8c291c3a828
- feat: init history view support
  - Commit: 1e1e6a687b35301df62f230d7355228696cfa11d
- feat: history label management
  - Commit: 8589de0c31c98c3b8c8d16892de4bca781ff207f

### Changed
- chore: cleanup compileManager triggers
  - Commit: 2d0a2b6852f5c5f6d2cb2abfa5e8da5650c94b39

## [0.2.2] - 2023-09-22
### Added
- feat: project tag management
  - Commit: 7ce700d8e9284b49144450b6b2e09adca30c2dd0

### Changed
- chore: improve statue bar experience
  - Commit: 02a383a3854e335898670ace8b831f7e498e553d

## [0.2.1] - 2023-09-21
### Added
- feat: display users on status bar
  - Commit: a5a97e5486c7c321e172d9af8086c2ef8f27cfde
- feat: render colorful online user cursors
  - Commit: 9416ac82c082e04fb09adf0511bffcf09bb06693

### Changed
- refactor: compile-related code to separate folder
  - Commit: 28ec309a1325cbccffb005bc4c898c70a5c49318

## [0.2.0] - 2023-09-19
### Added
- feat: support cookies-based login
  - Commit: 46b804c293e46327f525a57fcc7e02d35b2b4453
- feat: support get projects fallback
  - Commit: dd94de192f6500a733b45e1c657d57ae29ee60ec
- add compile error display
  - Commit: a0bc9faf94193cc7143c8bf259689aa08213314d

### Changed
- chore: adjust pdf viewer theme
  - Commit: 45c9d852c1f47edcc47350bfdafdb1e23ce5f261
- chore: prompt text
  - Commit: 5424dd38284f396b24cf16a9cb993b101a0f91d3

### Fixed
- fix: snippet completion range
  - Commit: 782eb0458ac7cb0d2a12f367c23679e25b6b6972
- fix: pdfjs font color always mono
  - Commit: c2a7473995d0fcee38cf8dd2a8600be7e4261afc

## [0.1.5] - 2023-09-17
### Added
- feat: support command intellisense
  - Commit: 924e2c0cda281895424458a09c18195369486fd7

### Changed
- chore: default output folder name
  - Commit: d917bf75cbb70e794a618ded93577505a86d9c47

### Fixed
- fix: init user dictionary
  - Commit: 62dea4598e2ea95573d371fe3fb6657c0ef2fa89
- fix: completion trigger and filter
  - Commit: 7734dd7fc9f3ea7d5a93f9e3a8674c12a4005b79
- fix: spell check range
  - Commit: 3c4c48f4539b76e0d9bb8d13c54b54910e0252b0

## [0.1.4] - 2023-09-15
### Added
- feat: support path intellisense
  - Commit: eb06b5e762c092e0691c86ea9eb961a30228e0f8
- feat: support constant data completion
  - Commit: 0268586ca8fc3a325d28bba224f166d1fa9b1ad4
- feat: support reference completion
  - Commit: d1007acca783522b09cde86f2bed8654ec7b26d9

## [0.1.3] - 2023-09-14
### Added
- add completion data
  - Commit: 2855210497e50a91067d78a98f893ef6615d78e4
- feat: online spell check
  - Commit: 5684e5a9c104037a7060b4f2ba62985f296dd603

## [0.1.2] - 2023-09-12
### Added
- add language definition
  - Commit: a9e8f8a62efa7c635cadee8aa8574b022cd3e305
- update project related api
  - Commit: 659656f2fba5e91d2d045954a0c0eb7f6a955556
- support project CRUD
  - Commit: b45962732c1cd85eed4b16a78d4e5ea636531162

## [0.1.1] - 2023-09-10
### Added
- patch pdfjs to support themes
  - Commit: c5467ee9360d62926e54d5661739bb0fbec633dc
- support pdf viewer dark mode
  - Commit: 9c5b0cee0c6f268f073ea1c423879a78f1ea7162

## [0.1.0] - 2023-09-09
### Added
- update reverse sync
  - Commit: 4e7f3a5ee5085656630a51b38147dcb1b22c004b
- add explicit syncPdf/syncCode function
  - Commit: 8c08af0d68341fc80ffed3cd795d4fe4e12f87d6

### Changed
- keep pdf viewer state when reload
  - Commit: 4649900b7e74551c9334adf2771a25a0581cda06

### Removed
- disable pdfjs useless services
  - Commit: 781ad5b78c24320615710192fa7afe141f6bf420
- remove implicit root_name usage
  - Commit: 9d7f1840156911001c343f7d0c2b62c18038e877

### Fixed
- fix file open column issue
  - Commit: da93c0721ae558d1f1e04a9b20c7b5d0cf1951ea
- fix bib file reverse synctex
  - Commit: 777ff15048a172f158f51157e3995c45517ec5a0

## [0.0.6] - 2023-09-06
### Added
- init editor-side syncCode/syncPdf
  - Commit: d7b994fd4927e9378b92e9be588a3bd907ceb4be

### Fixed
- fix output pdf view priority
  - Commit: e581bdcc013b02fa572d1a6398dfd400bef6026e
- use pdf.js in correct way
  - Commit: 45189687caa43da659d3e070785c70b4dae90700
- fix pdf refresh uncaught exception
  - Commit: c9f02bc5eba9304dd62e2ffbd762d3fd9605be5f
- fix refresh issue
  - Commit: 359a5b17c91d8d7707b2fbbfa2806bc8bb42d267
- fix compile condition
  - Commit: 51631835ebfa80a5d9650e07c14e8924b72be08a

## [0.0.5] - 2023-09-05
### Added
- add view pdf keybinding
  - Commit: 8b10a5310a2cef27ac496afe49e74bf3dda2b11f
- init pdf view support
  - Commit: 482dc3922216548a883d540ab9ca058ce6dc099a

## [0.0.4] - 2023-09-04
### Added
- add compile manager
  - Commit: 10503b7f163d5e2177681bd8cb0648e8c0777fec

### Fixed
- fix: getFileFromClsi
  - Commit: 5d57fb4a6ef8b9b90fd629111b37d9028a54ad3f
- fix doc dirty check
  - Commit: cc3379bb408df7b0f8bfc15e8389b14ce390aa17
- fix file update notify
  - Commit: ab7a86202881c9618ad8e1eda7d7a80386d44af5

## [0.0.3] - 2023-09-03
### Added
- add compile results in folder
  - Commit: 2f9039bcf2a050c55b13176d71fbb5e5f8dc140e

### Removed
- remove docs from package
  - Commit: 404e3b333bde46bcfeddd36f3fe9fccc6a40eec4

### Fixed
- fix doc update change
  - Commit: 90b35a8ba206a152269d7af2c6e6609eae5b345d
- fix open project behavior
  - Commit: 1278aebc42e27ff9721aad58d7537352451bcce6
- fix get file encoding error
  - Commit: 7e2c72ed65e4cf1df966f3b4b29a69209599b0c1

## [0.0.2] - 2023-09-02
### Added
- Create LICENSE
  - Commit: 52a2587806aa8bd0f53395bd4f41c590dc48e37f

### Changed
- update vscode publisher name
  - Commit: 4672c84ad25448009732e471d3ea1e1b21fc3eec

### Fixed
- fix publish issue
  - Commit: e6a7ac99586840dbdd2f19d5496b49db23506037
- fix package compile issue
  - Commit: 98a36687bcc8206eb00d624eb5dba885497caf6a

## [0.0.1] - 2023-09-01
### Added
- init project structure
  - Commit: 1bc8537a0e2f74f361e9f5d5fa9482bdd058edd3
- update project structure
  - Commit: c1af594e158f92050d9284c308727c9d3a3c515e
- refactor BaseAPI
  - Commit: a7c1e056948edbed878081a79262458f90306752
- add refresh function
  - Commit: ba16d601e135dbae2c33a5c38ee4b8e051857e32
- update userId api
  - Commit: 6cc82e04a169bd079876950631d70c2276bfb8a2
- use correct socket.io with patch
  - Commit: 5f50b93e11c2e5e571cf52c27c0a9c86465b019f
- add socketio api
  - Commit: a1d25bbe1810ae06be6bb13931f201fa9d541c0b
- init integrate with vfs
  - Commit: 92608ce2c825584f525c63f71f99821c1b29da1f
- complete vfs read
  - Commit: 636517a7b2d321d5f8368a7454bdd82f80a05e5c
- add file download api
  - Commit: 3f6b81f3e57239d7e31d2711cd394e1f3e35abe8
- add addFolder api
  - Commit: 017815da5d158747acf48708df3013528ed98ced
  - 595235e0a50169e8af7126b36ed92ef2097e4b72
- add deleteFile api
  - Commit: 5d3de0f20ccd32d322ba13629f082934ec4a5cb3
- add rename api
  - Commit: 42e54e82af3b3513fed035f606a891780dafb933
- add file upload method
  - Commit: ee0efcb989c5c27ad5ca37dafe96ca3e2a4e4cbf
- add otUpdateApplied event
  - Commit: 0b4e56ad251c7879676a7560ed1bf92728c7dc81

### Fixed
- fix csrf check
  - Commit: 8067427769c577c50ac711e5c42eda658264de7c
- fix: moveEntity
  - Commit: 7a17be1fe77578764a48895c75ad7e17b59f0aac
- fix create file
  - Commit: 21bede9fbc6e26f811721894547683a9e07940d0
- fix: writeFile
  - Commit: 14987ba52c8bca29e09be5815d18eff23e354718
- fix doc version starts with 0
  - Commit: fed6a79f3cc5549d0435838aa6f2e569e25c55a4
