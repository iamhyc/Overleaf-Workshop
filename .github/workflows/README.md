# Github Actions Overview

We use Github Actions to automate various tasks in this repository. The following workflows are currently enabled:

- **lock-threads.yml**: Locks closed issues and pull requests after a period of inactivity.

- **vsce-package.yml**: Call `vsce package` to create a temporary VSCode extension package when a Pull Request is created/updated on the `master` branch.

- **vsce-publish.yml**: Call `vsce publish` to publish the VSCode extension to the VSCode Marketplace when version tag is pushed on the `master` branch.
