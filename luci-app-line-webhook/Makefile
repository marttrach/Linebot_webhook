# luci-app-line-webhook

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-line-webhook
PKG_VERSION:=1.0.0
PKG_RELEASE:=1
PKG_MAINTAINER:=MattLin <mattmail@mattjun.work>
PKG_LICENSE:=MIT

LUCI_TITLE:=LuCI support for LINE Webhook Bot
LUCI_DEPENDS:=+luci-base +python3 +python3-flask +python3-requests

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
$(eval $(call BuildPackage,luci-app-line-webhook))
