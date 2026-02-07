# 如何在 OpenClaw 發送 LINE Flex Message (Rich Card)

您的系統 **已經支援** 發送 LINE Flex Message！不需要額外修改 Bridge 代碼。

## 原理說明

OpenClaw Agent 只要在回應的 `channelData` 中包含特定結構的 JSON，`line-webhook-server` 就會自動將其轉換為 LINE Flex Message。

## JSON 結構規範 (Agent Payload)

Agent 回傳的 Payload 必須包含以下結構：

```json
{
  "text": "這是替代文字 (Alt Text，若不支援 flex 時顯示)",
  "channelData": {
    "line": {
      "flexMessage": {
        "altText": "Rich Card 標題",
        "contents": {
          // 這裡放入 Flex Message Simulator 生成的 JSON
          "type": "bubble",
          "body": {
            "type": "box",
            "layout": "vertical",
            "contents": [
              {
                "type": "text",
                "text": "Hello, World!"
              }
            ]
          }
        }
      }
    }
  }
}
```

## 範例：發送一個產品卡片 (Product Bubble)

在您的 OpenClaw Agent 邏輯中，回傳以下物件：

```javascript
return {
  text: "查看我們的最新產品！",
  channelData: {
    "line": {
      "flexMessage": {
        "altText": "最新產品上市",
        "contents": {
          "type": "bubble",
          "hero": {
            "type": "image",
            "url": "https://scdn.line-apps.com/n/channel_devcenter/img/fx/01_1_cafe.png",
            "size": "full",
            "aspectRatio": "20:13",
            "aspectMode": "cover"
          },
          "body": {
            "type": "box",
            "layout": "vertical",
            "contents": [
              {
                "type": "text",
                "text": "Brown Cafe",
                "weight": "bold",
                "size": "xl"
              }
            ]
          },
          "footer": {
            "type": "box",
            "layout": "vertical",
            "spacing": "sm",
            "contents": [
              {
                "type": "button",
                "style": "primary",
                "height": "sm",
                "action": {
                  "type": "uri",
                  "label": "WEBSITE",
                  "uri": "https://linecorp.com"
                }
              }
            ]
          }
        }
      }
    }
  }
}
```

## 工具

1. **Flex Message Simulator**: https://developers.line.biz/flex-simulator/
   - 用於視覺化設計 Rich Card。
   - 設計完成後，將右側 JSON 的內容貼到 `contents` 欄位。

2. **OpenClaw Line Bridge**:
   - Bridge 會自動提取 `channelData` 並回傳給 Webhook Server。
   - Webhook Server 會解析 `flexMessage` 並發送給 LINE。
