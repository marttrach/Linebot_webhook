# Python package build failures (Jinja2 / Werkzeug)

When the SDK fails on `python-jinja2` or `python-werkzeug`, it is usually because the PEP 517 backend `flit_core` and the host build helpers (`build`, `installer`, `wheel`) are not present. The source tarballs and hashes are correct:

- Jinja2 3.1.6: `sha256 0137fb05990d35f1275a587e9aee6d56da821fc83491a0fb838183be43f66d6d`
- Jinja2 3.1.4: `sha256 4a3aee7acbbe7303aede8e9648d13b8bf88a429282aa6122a993f0ac800cb369`
- Werkzeug 2.3.8: `sha256 554b257c74bbeb7a0d254160a4f8ffe185243f52a52035060b761ca62d977f03`

## Minimal patch to the OpenWrt packages feed

Apply inside the SDK after `feeds update -a`:

```
sed -i '/^HOST_BUILD_DEPENDS/ s/$/ python-build\/host python-installer\/host python-wheel\/host python-flit-core\/host/' feeds/packages/lang/python/python-jinja2/Makefile
sed -i '/^HOST_BUILD_DEPENDS/ s/$/ python-build\/host python-installer\/host python-wheel\/host python-flit-core\/host/' feeds/packages/lang/python/python-werkzeug/Makefile
```

Optional version bump for Jinja2 (still compatible with Flask 2.3.x):
```
sed -i 's/^PKG_VERSION:=.*/PKG_VERSION:=3.1.6/' feeds/packages/lang/python/python-jinja2/Makefile
sed -i 's/^PKG_HASH:=.*/PKG_HASH:=0137fb05990d35f1275a587e9aee6d56da821fc83491a0fb838183be43f66d6d/' feeds/packages/lang/python/python-jinja2/Makefile
```

## Recomputing hashes

```
wget https://files.pythonhosted.org/packages/source/j/jinja2/jinja2-${PKG_VERSION}.tar.gz
sha256sum jinja2-${PKG_VERSION}.tar.gz
```

Use the analogous URL for `werkzeug-${PKG_VERSION}.tar.gz`.

## Verbose build

Run the SDK with `V=sc` and `MAKEFLAGS=-j1` to capture full logs (already set in the GitHub workflow). This makes it easier to see missing host modules like `flit_core`, `build`, or `installer`.

## Flask wheel missing (FileNotFoundError)

Symptom: `FileNotFoundError ... /openwrt-build/Flask-*.whl`.

Fix in this repo: local override at `lang/python/Flask/Makefile` (Flask 2.3.3) adds host build deps (`python-build/host`, `python-installer/host`, `python-wheel/host`, `python-flit-core/host`). Ensure your feed priority picks up this override (the GitHub Action uses `FEEDNAME=linebot`, which includes the repo tree).
