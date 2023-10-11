# Overleaf Workshop

[![GitHub Repo stars](https://img.shields.io/github/stars/iamhyc/Overleaf-Workshop)](https://github.com/iamhyc/Overleaf-Workshop)
[![version](https://img.shields.io/visual-studio-marketplace/v/iamhyc.overleaf-workshop)](https://marketplace.visualstudio.com/items?itemName=iamhyc.overleaf-workshop)
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/iamhyc.overleaf-workshop)](https://marketplace.visualstudio.com/items?itemName=iamhyc.overleaf-workshop)
[![updated](https://img.shields.io/visual-studio-marketplace/last-updated/iamhyc.overleaf-workshop)](https://marketplace.visualstudio.com/items?itemName=iamhyc.overleaf-workshop)
[![release](https://img.shields.io/visual-studio-marketplace/release-date/iamhyc.overleaf-workshop)](https://vsmarketplacebadge.apphb.com/downloads-short/iamhyc.overleaf-workshop.svg)

Open Overleaf (ShareLatex) projects in VSCode, with full collaboration support.

### Features

- Login Server, Open Projects and Edit Files
  > [!NOTE]
  > For SSO login or captcha enabled servers like `https://www.overleaf.com`, please use "**Login with Cookies**" method.
  > 
  > For more details, please refer to [How to Login with Cookies](#how-to-login-with-cookies), and related discussions in [this issue on Github](https://github.com/iamhyc/Overleaf-Workshop/issues/18).

    <img src="https://raw.githubusercontent.com/iamhyc/Overleaf-Workshop/master/docs/assets/demo01-login.gif" height=300px/>

- On-the-fly Compiling and Previewing

    <img src="https://raw.githubusercontent.com/iamhyc/Overleaf-Workshop/master/docs/assets/demo02-compile.gif" height=300px/>

- Jump between Tex and PDF

    <img src="https://raw.githubusercontent.com/iamhyc/Overleaf-Workshop/master/docs/assets/demo03-synctex.gif" heigh=300px/>

- View PDF in Bright/Dark Mode

    <img src="https://raw.githubusercontent.com/iamhyc/Overleaf-Workshop/master/docs/assets/demo04-dark-mode.gif" heigh=300px/>

- Spell Check, Auto Completion and Compile Messages

    <img src="https://raw.githubusercontent.com/iamhyc/Overleaf-Workshop/master/docs/assets/demo05-intellisense.png" heigh=300px/>

### How to Login with Cookies

<img src="https://raw.githubusercontent.com/iamhyc/Overleaf-Workshop/master/docs/assets/login_with_cookie.png" heigh=300px/>

In an already logged-in browser (Firefox for example):

1. Open "Developer Tools" (usually by pressing <kbd>F12</kbd>) and switch to the "Network" tab;

   Then, navigate to the Overleaf main page (e.g., `https://www.overleaf.com`) in the address bar.

2. Filter the listed items with `/project` and select the exact match.

3. Check the "Cookie" under "Request Headers" of the selected item and copy its value to login.
    > The format of the Cookie value would be like: `overleaf_session2=...` or `sharelatex.sid=...`

### Compatibility

The following overleaf (sharelatex) versions provided on [Docker Hub](https://hub.docker.com/r/sharelatex/sharelatex) have been tested:

- [ ] sharelatex/sharelatex:4 (active)

- [x] [sharelatex/sharelatex:3.5](https://hub.docker.com/layers/sharelatex/sharelatex/3.5.11/images/sha256-05bf7235fa80fc86dc6ff999c1cd3e43f9ad088560270fadc696f16a4e508304?context=explore) (active) (verified by [@iamhyc](https://github.com/iamhyc))
- [ ] [sharelatex/sharelatex:3.4](https://hub.docker.com/layers/sharelatex/sharelatex/3.4/images/sha256-2a72e9b6343ed66f37ded4e6da8df81ed66e8af77e553b91bd19307f98badc7a?context=explore) (archived)
- [ ] [sharelatex/sharelatex:3.3](https://hub.docker.com/layers/sharelatex/sharelatex/3.3/images/sha256-e1ec01563d259bbf290de4eb90dce201147c0aae5a07738c8c2e538f6d39d3a8?context=explore) (archived)
- [ ] [sharelatex/sharelatex:3.2](https://hub.docker.com/layers/sharelatex/sharelatex/3.2/images/sha256-5db71af296f7c16910f8e8939e3841dad8c9ac48ea0a807ad47ca690087f44bf?context=explore) (archived)
- [ ] [sharelatex/sharelatex:3.1](https://hub.docker.com/layers/sharelatex/sharelatex/3.1/images/sha256-5b9de1e65257cea4682c1654af06408af7f9c0e2122952d6791cdda45705e84e?context=explore) (archived)
- [ ] [sharelatex/sharelatex:3.0](https://hub.docker.com/layers/sharelatex/sharelatex/3.0/images/sha256-a36e54c66ef62fdee736ce2229289aa261b44f083a9fd553cf8264500612db27?context=explore) (archived)


### References

- [Overleaf Official Logos](https://www.overleaf.com/for/partners/logos)
- [Overleaf Web Route List](./docs/webapi.md)
- [James-Yu/LaTeX-Workshop](https://github.com/James-Yu/LaTeX-Workshop)
- [jlelong/vscode-latex-basics](https://github.com/jlelong/vscode-latex-basics/tags)
