# luci-app-line-webhook

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-line-webhook
PKG_VERSION:=5.1.0
PKG_RELEASE:=1
PKG_MAINTAINER:=MattLin <mattmail@mattjun.work>
PKG_LICENSE:=MIT

LUCI_TITLE:=LuCI support for LINE Webhook Bot
LUCI_DEPENDS:=+luci-base +python3 +python3-requests

include $(TOPDIR)/feeds/luci/luci.mk

# Post-install script: ensure init script has execute permission and enable service
define Package/luci-app-line-webhook/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	chmod 755 /etc/init.d/line_webhook
	/etc/init.d/line_webhook enable
}
exit 0
endef

# Pre-remove script: stop and disable service before removal
define Package/luci-app-line-webhook/prerm
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	/etc/init.d/line_webhook stop 2>/dev/null
	/etc/init.d/line_webhook disable 2>/dev/null
fi
exit 0
endef

# Post-remove script: clean up all runtime and config files
define Package/luci-app-line-webhook/postrm
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	# Remove PID file
	rm -f /var/run/line_webhook.pid
	# Remove config file (user confirmed full removal)
	rm -f /etc/config/line_webhook
	# Remove any temp or log files
	rm -rf /tmp/line_webhook* 2>/dev/null
	rm -rf /var/log/line_webhook* 2>/dev/null
fi
exit 0
endef

# call BuildPackage - OpenWrt buildroot signature
$(eval $(call BuildPackage,luci-app-line-webhook))
