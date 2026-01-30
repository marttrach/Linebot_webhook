# Line Webhook Install & Build Guide

This guide explains how to build and install the `luci-app-line-webhook` package for OpenWrt, following the same structure used in the main README but with deeper, step-by-step commands.

## 1. Quick Start

### Compilation Method (full OpenWrt tree)

```bash
# Add the feed for this package
echo "src-git linebot https://github.com/marttrach/Linebot_webhook.git;main" >> feeds.conf.default

# Update and install the feed packages
./scripts/feeds update linebot
./scripts/feeds install -a -p linebot

# (Optional) force reinstall if you already had a local copy
./scripts/feeds install -a -f -p linebot

# Configure your image
make menuconfig
```

In `make menuconfig`, go to `LuCI -> Applications` and enable `luci-app-line-webhook`.

Finally, build your image or packages:

```bash
make -j$(nproc)
```

### Software Packages

* **`luci-app-line-webhook` (Core)**: LuCI UI and backend service for the LINE Webhook bot, depends on `luci-base`, `python3`, `python3-flask`, and `python3-requests`.

## 2. Installation from Release (IPK)

When using pre-built `.ipk` files, ensure the kernel/target matches your router (e.g., `x86_64-24.10.x`). A mismatch will cause `opkg` to reject the package unless forced.

```bash
opkg update
opkg install luci-app-line-webhook_*.ipk

# If you must override dependency or kernel checks (use with caution)
opkg install luci-app-line-webhook_*.ipk --force-depends
```

## 3. Fast Build with the OpenWrt SDK

For quicker package-only builds without a full firmware image, use the matching OpenWrt SDK for your target:

```bash
# Inside the SDK root
echo "src-git linebot https://github.com/marttrach/Linebot_webhook.git;main" >> feeds.conf.default
./scripts/feeds update linebot
./scripts/feeds install luci-app-line-webhook

# Build just this package
make package/luci-app-line-webhook/compile V=s
```

The resulting IPK will be in `bin/packages/<arch>/linebot/`.

## 4. Troubleshooting

* **Feed not found**: Re-run `./scripts/feeds update linebot` and confirm the feed line is present in `feeds.conf.default`.
* **Kernel or libc mismatch**: Rebuild against your exact target (same branch, target, and SDK version) instead of forcing the install.
* **Missing runtime deps**: Install `python3`, `python3-flask`, `python3-requests`, and `luci-base` with `opkg`.
* **LuCI app not visible**: Ensure `luci-app-line-webhook` is selected in `menuconfig`; after install, restart UI services: `/etc/init.d/uhttpd restart` and `/etc/init.d/rpcd restart`.
* **Service fails to start**: Check logs with `logread | grep line_webhook` and verify port conflicts or bad tokens.

