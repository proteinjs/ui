# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [4.10.1](https://github.com/proteinjs/ui/compare/@proteinjs/ui@4.10.0...@proteinjs/ui@4.10.1) (2026-08-28)


### Bug Fixes

* record-table headers stick on scroll — TableContainer overflow was capturing the sticky scrollport while never scrolling vertically; make it visible so headers pin to the outer scroll box ([99c1aa2](https://github.com/proteinjs/ui/commit/99c1aa224e4ed5626d4c01c976e618c33ec1412d))





# [4.10.0](https://github.com/proteinjs/ui/compare/@proteinjs/ui@4.9.1...@proteinjs/ui@4.10.0) (2026-08-19)


### Features

* phone presentation for admin surfaces — form-factor hook, Table card face, Form single-column + toast status (task [#53](https://github.com/proteinjs/ui/issues/53)) ([4909c36](https://github.com/proteinjs/ui/commit/4909c36954a8c06adf91b35f6c6e36a6a8b8196e))





## [4.9.1](https://github.com/proteinjs/ui/compare/@proteinjs/ui@4.9.0...@proteinjs/ui@4.9.1) (2026-08-18)


### Bug Fixes

* keep a failed table load's error state across parent re-renders ([f522706](https://github.com/proteinjs/ui/commit/f522706e01febcba18e000d4dcb9f9aa0d0ccddd))





# [4.9.0](https://github.com/proteinjs/ui/compare/@proteinjs/ui@4.8.0...@proteinjs/ui@4.9.0) (2026-08-17)


### Features

* functional hardening for admin record surfaces — double-submit guard, declarative button confirmation, copyable readonly fields, Alert status, checkbox/date field controls ([9a1140f](https://github.com/proteinjs/ui/commit/9a1140fa46a0c09e775559d1312884ada28df0b6))





# [4.8.0](https://github.com/proteinjs/ui/compare/@proteinjs/ui@4.7.0...@proteinjs/ui@4.8.0) (2026-08-15)


### Features

* floating scroll-to-top affordance for infinite-scroll lists ([bfaab99](https://github.com/proteinjs/ui/commit/bfaab9980ac71e8a789161d8c234e790ce8b75e1))
* wire the scroll-to-top affordance into List ([23072ac](https://github.com/proteinjs/ui/commit/23072ac1e7181a8d0b7c7b4f488e9d7d02599fd1))





# [4.7.0](https://github.com/proteinjs/ui/compare/@proteinjs/ui@4.6.1...@proteinjs/ui@4.7.0) (2026-08-14)


### Features

* List — Table's row-stream peer on the CursorLoader seam ([687e5bd](https://github.com/proteinjs/ui/commit/687e5bd247acd8d804338162ebdbd9d03ef747ca))





## [4.6.1](https://github.com/proteinjs/ui/compare/@proteinjs/ui@4.6.0...@proteinjs/ui@4.6.1) (2026-08-13)

**Note:** Version bump only for package @proteinjs/ui





# [4.6.0](https://github.com/proteinjs/ui/compare/@proteinjs/ui@4.5.0...@proteinjs/ui@4.6.0) (2026-08-13)


### Bug Fixes

* render a real 404 page for unmatched routes ([e3de77f](https://github.com/proteinjs/ui/commit/e3de77fdca3b8d6d8a6ee2582e972a3a3d804699))


### Features

* CursorLoader — first-class cursor windows on the shared caching contract ([2319ab6](https://github.com/proteinjs/ui/commit/2319ab6eb12ece71c3f8cafbf73cb4bee5d31fa6))
* export ViewTransitionHistory from the package index ([3f8b880](https://github.com/proteinjs/ui/commit/3f8b880a262f7c6ca0d3d1a6a656de649de2dcb5))
* real not-found surface routed through the app container ([dd39a2c](https://github.com/proteinjs/ui/commit/dd39a2cb75727644b9d025fc51ec0cf9043c302f))
* **ui:** route-transition seam — history-owning router + View Transitions decorator ([120fe60](https://github.com/proteinjs/ui/commit/120fe60ffacf73fb265c8933edad438923395ca0))





## [4.3.11](https://github.com/proteinjs/ui/compare/@proteinjs/ui@4.3.10...@proteinjs/ui@4.3.11) (2026-07-27)


### Bug Fixes

* remove un-themed CssBaseline from Router ([593ed3c](https://github.com/proteinjs/ui/commit/593ed3c03f3aefaf0f779424a00b39be65e89cbd))





## [4.3.10](https://github.com/proteinjs/ui/compare/@proteinjs/ui@4.3.9...@proteinjs/ui@4.3.10) (2026-07-25)


### Bug Fixes

* hoist createUrlParams out of conditional branches (rules of hooks) ([2138b6e](https://github.com/proteinjs/ui/commit/2138b6e08703cf6b9cd80cb8195c4c0fb3cf8bb4))





## [4.3.8](https://github.com/proteinjs/ui/compare/@proteinjs/ui@4.3.7...@proteinjs/ui@4.3.8) (2026-07-02)


### Bug Fixes

* getNextPageParam guards an empty/absent pages cache ([a93dbb1](https://github.com/proteinjs/ui/commit/a93dbb160b223a963b94f4b30c6dc3193fc166af))





## [4.3.6](https://github.com/proteinjs/ui/compare/@proteinjs/ui@4.3.5...@proteinjs/ui@4.3.6) (2026-04-16)


### Bug Fixes

* **table:** pass actual DOM element as InfiniteScroll scrollableTarget ([1f2b3f4](https://github.com/proteinjs/ui/commit/1f2b3f4907ef39afc387758f601f03b763f17216))
* **table:** widen InfiniteScroll scrollableTarget type to accept HTMLElement ([7e76dbb](https://github.com/proteinjs/ui/commit/7e76dbb8ff5356c36ed3652f8d6e59281a068616))





# [4.3.0](https://github.com/proteinjs/ui/compare/@proteinjs/ui@4.2.4...@proteinjs/ui@4.3.0) (2026-01-05)


### Features

* `Table` added `TableProps.scrollContainerSx` so the consumer can style the scrollbar. ([416eec7](https://github.com/proteinjs/ui/commit/416eec7da293302d228d7e69ec10e6d30fa90c03))





# [4.2.0](https://github.com/proteinjs/ui/compare/@proteinjs/ui@4.1.2...@proteinjs/ui@4.2.0) (2025-04-24)


### Features

* Add `page` to `CustomPageContainerProps` so consumers can do custom rendering based on the current page ([49ec692](https://github.com/proteinjs/ui/commit/49ec692bdb65b3d3b521a8f8f78e91013b0e09b1))





# [4.1.0](https://github.com/proteinjs/ui/compare/@proteinjs/ui@4.0.0...@proteinjs/ui@4.1.0) (2025-03-28)


### Features

* `useTableMutation` make `tableLoader` optional ([360454d](https://github.com/proteinjs/ui/commit/360454d5761be0ec4e4b9e29cc169ccb6b7efc63))





# [4.0.0](https://github.com/proteinjs/ui/compare/@proteinjs/ui@3.1.0...@proteinjs/ui@4.0.0) (2024-09-27)


### Features

* table enhancements (rowOnClick, custom skeleton, hideColumnHeaders, setRowCount) ([#7](https://github.com/proteinjs/ui/issues/7)) ([1024069](https://github.com/proteinjs/ui/commit/10240696bce41ba2c3105b882d2b7cbd5182f89d))


### BREAKING CHANGES

* rowOnClickRedirectUrl name has been changed to rowOnClick





# [3.1.0](https://github.com/proteinjs/ui/compare/@proteinjs/ui@3.0.1...@proteinjs/ui@3.1.0) (2024-08-27)


### Features

* add empty table component for tables ([2b368af](https://github.com/proteinjs/ui/commit/2b368afd017418b71b6e0dbbfbca71619a0f4a6e))





# [3.0.0](https://github.com/proteinjs/ui/compare/@proteinjs/ui@2.4.1...@proteinjs/ui@3.0.0) (2024-08-08)


### Features

* add navigate prop to CustomAccountIconButton ([952f21d](https://github.com/proteinjs/ui/commit/952f21d1bc8520e7bdde0a5b7d875150c0e064a8))


### BREAKING CHANGES

* navigate prop is required





# [2.4.0](https://github.com/proteinjs/ui/compare/@proteinjs/ui@2.3.0...@proteinjs/ui@2.4.0) (2024-08-05)


### Features

* add fields for props on form page grid container ([d43a467](https://github.com/proteinjs/ui/commit/d43a467b010b6cfde1d3e17eb2a76926fd95a16d))





# [2.3.0](https://github.com/proteinjs/ui/compare/@proteinjs/ui@2.2.2...@proteinjs/ui@2.3.0) (2024-08-02)


### Features

* added `PageContainerProps.abovePageSlot` ([4a53f2b](https://github.com/proteinjs/ui/commit/4a53f2b1e8d2bac8c04ca0aa9ecc89fb089fd906))





## [2.2.2](https://github.com/proteinjs/ui/compare/@proteinjs/ui@2.2.1...@proteinjs/ui@2.2.2) (2024-08-02)


### Bug Fixes

* add default styles for page container ([98f1a30](https://github.com/proteinjs/ui/commit/98f1a30434354387163ef76fd5dd9ff9d19ef37b))





# [2.2.0](https://github.com/proteinjs/ui/compare/@proteinjs/ui@2.1.3...@proteinjs/ui@2.2.0) (2024-07-09)


### Features

* button alignment and maxwidth on form ([31e7873](https://github.com/proteinjs/ui/commit/31e78738c267c90dc0bc14d7c6a0a91fd0d57364))





## [2.1.3](https://github.com/proteinjs/ui/compare/@proteinjs/ui@2.1.2...@proteinjs/ui@2.1.3) (2024-07-08)


### Bug Fixes

* add all props for infinite scroll component ([b66170a](https://github.com/proteinjs/ui/commit/b66170ac00f473bc09b547818d58a911931186fe))





## [2.1.1](https://github.com/proteinjs/ui/compare/@proteinjs/ui@2.1.0...@proteinjs/ui@2.1.1) (2024-07-07)


### Bug Fixes

* inf scroll should fetch more when rows don't fill container ([fb1526e](https://github.com/proteinjs/ui/commit/fb1526e36b83f0227285114d35d9e7109c896d9b))





# [2.1.0](https://github.com/proteinjs/ui/compare/@proteinjs/ui@2.0.8...@proteinjs/ui@2.1.0) (2024-07-06)


### Features

* add react query and infinite scroll to table ([#6](https://github.com/proteinjs/ui/issues/6)) ([b9cb502](https://github.com/proteinjs/ui/commit/b9cb5028c2544ca9e50dbee7af69da15a80b9c66))





## [2.0.7](https://github.com/proteinjs/ui/compare/@proteinjs/ui@2.0.6...@proteinjs/ui@2.0.7) (2024-05-21)

**Note:** Version bump only for package @proteinjs/ui





## [2.0.6](https://github.com/proteinjs/ui/compare/@proteinjs/ui@2.0.5...@proteinjs/ui@2.0.6) (2024-05-17)


### Bug Fixes

* allow custom account menu in page container ([9fdb291](https://github.com/proteinjs/ui/commit/9fdb291e8595d9ec8a05b395a413e4bc05ead59b))





## [2.0.4](https://github.com/proteinjs/ui/compare/@proteinjs/ui@2.0.3...@proteinjs/ui@2.0.4) (2024-05-10)


### Bug Fixes

* add .md to lint ignore files ([b796982](https://github.com/proteinjs/ui/commit/b7969823d8dbd34e13d22cbd5d3eecb77a2a140b))





## [2.0.3](https://github.com/proteinjs/ui/compare/@proteinjs/ui@2.0.2...@proteinjs/ui@2.0.3) (2024-05-10)


### Bug Fixes

* add linting and lint all files ([333d130](https://github.com/proteinjs/ui/commit/333d130ae81392a250f131fac041aee8d3303757))





## [2.0.1](https://github.com/proteinjs/ui/compare/@proteinjs/ui@2.0.0...@proteinjs/ui@2.0.1) (2024-05-03)

### Bug Fixes

- update key for AccountIconButton to remove console errors ([baa3b47](https://github.com/proteinjs/ui/commit/baa3b47f2fb7def11a8e9d371b4d7330ed862d03))

# [2.0.0](https://github.com/proteinjs/ui/compare/@proteinjs/ui@1.0.8...@proteinjs/ui@2.0.0) (2024-05-01)

- comment (#2) ([fb5b779](https://github.com/proteinjs/ui/commit/fb5b77988ba8fe38c222166b55036a547ec2b722)), closes [#2](https://github.com/proteinjs/ui/issues/2)

### BREAKING CHANGES

- comment added

## [1.0.8](https://github.com/proteinjs/ui/compare/@proteinjs/ui@1.0.7...@proteinjs/ui@1.0.8) (2024-04-30)

**Note:** Version bump only for package @proteinjs/ui

## [1.0.6](https://github.com/proteinjs/ui/compare/@proteinjs/ui@1.0.5...@proteinjs/ui@1.0.6) (2024-04-29)

### Bug Fixes

- use function as prop type for pageContainerSxProps ([7156880](https://github.com/proteinjs/ui/commit/71568808fb39db6c323b275273d9b8e5ba5cb1f5))

## 1.0.1 (2024-04-19)

**Note:** Version bump only for package @proteinjs/ui
