這是一份為 LLM (Large Language Model) 準備的 LINE Rich Menu (圖文選單) 技術文檔。此文檔將設計規範、API 規則、優先級邏輯及 JSON 結構範例進行了結構化整理，旨在協助 AI 理解並生成相關代碼或解決方案。

***

# LINE Rich Menu (圖文選單) 技術規範與實作指南 (LLM Context)

## 1. 核心定義與結構 (Core Concepts)
Rich Menu 是顯示在 LINE 官方帳號聊天室底部的互動式選單。

*   **組成元件**:
    1.  **Rich Menu Image**: 一張 JPEG 或 PNG 圖片，包含選單的視覺設計。
    2.  **Tappable Areas (點擊區域)**: 定義圖片上可被點擊的區域，每個區域對應一個動作。
    3.  **Chat Bar (聊天列)**: 位於選單下方的橫條，用於開啟或關閉選單，文字可自定義。
*   **平台限制**: 僅顯示於智慧型手機 (iOS/Android) 的 LINE App 中，**不顯示**於電腦版 (macOS/Windows),。

## 2. 開發工具與限制 (Development Tools)
開發者可透過兩種方式建立 Rich Menu，但兩者**不可混用**於同一個選單實例。

| 工具 | 特點 | 限制 |
| :--- | :--- | :--- |
| **LINE Official Account Manager** (後台) | GUI 介面、提供點擊率/曝光數統計、可設定顯示期間。 | 無法使用進階 API 功能 (如 Postback 帶參數、動態切換)。 |
| **Messaging API** (程式開發) | 高度客製化、支援 Postback/Datetime Picker、支援個別用戶綁定 (Per-user)、支援分頁切換。 | **無法**取得點擊率與曝光數統計。 |

## 3. 顯示範圍與優先級 (Scope & Priority)
Rich Menu 的顯示邏輯由「範圍」與「優先級」決定。

### 3.1 顯示範圍 (Scope)
1.  **Default Rich Menu (預設選單)**: 所有未被個別綁定選單的用戶都會看到此選單。
2.  **Per-user Rich Menu (個別用戶選單)**: 針對特定 User ID 綁定的專屬選單。

### 3.2 顯示優先級 (由高至低)
若同時設定了多種選單，系統將依以下順序決定顯示內容：
1.  **Per-user rich menu** (透過 Messaging API 設定)。
2.  **Default rich menu** (透過 Messaging API 設定)。
3.  **Default rich menu** (透過 LINE Official Account Manager 設定)。

### 3.3 設定生效時間
*   **Per-user API**: 立即生效 (Immediately)。
*   **Default API**: 用戶重新進入聊天室時生效 (可能需等待約一分鐘)。
*   **Default Manager**: 用戶重新進入聊天室時生效。

## 4. 動作類型 (Action Objects)
在 `areas` 物件中定義的動作類型 (Action Type)：

*   **Message Action**: 用戶點擊後，以用戶身分發送特定文字訊息。
*   **Postback Action**: 點擊後發送隱藏數據 (`data`) 到 Webhook Server。
    *   可選參數 `displayText`: 在聊天室顯示文字 (不傳送至 Server)。
    *   可選參數 `inputOption`: 可開啟鍵盤 (`openKeyboard`) 或語音輸入 (`openVoice`)。
*   **URI Action**: 開啟網頁連結。
    *   支援外部瀏覽器或 LINE 內部瀏覽器。
*   **Datetime Picker Action**: 彈出日期/時間選擇器，選擇後透過 Postback 回傳數據。
*   **Rich Menu Switch Action**: 用於切換不同的 Rich Menu (需搭配 Rich Menu Alias),。

## 5. API 實作流程 (Implementation Workflow)
使用 Messaging API 建立 Rich Menu 需遵循以下步驟：

### 步驟 1: 準備與驗證 (Preparation)
*   準備圖片 (Image) 與定義點擊區域座標 (Bounds),。

### 步驟 2: 建立選單物件 (Create Rich Menu)
*   **Endpoint**: `POST https://api.line.me/v2/bot/richmenu`
*   **Payload 結構**: 包含 `size` (寬高), `selected` (預設開啟狀態), `name`, `chatBarText`, `areas` (點擊區域陣列)。
*   **Response**: 成功後回傳 `richMenuId`。

### 步驟 3: 上傳圖片 (Upload Image)
*   **Endpoint**: `POST https://api-data.line.me/v2/bot/richmenu/{richMenuId}/content`
*   **Content-Type**: `image/jpeg` 或 `image/png`,。

### 步驟 4: 設定/綁定 (Link/Set)
*   **設為全體預設**: `POST https://api.line.me/v2/bot/user/all/richmenu/{richMenuId}`。
*   **綁定特定用戶**: `POST https://api.line.me/v2/bot/user/{userId}/richmenu/{richMenuId}`。
*   **建立別名 (Alias)** (若需使用 Switch Action): `POST https://api.line.me/v2/bot/richmenu/alias`。

### 步驟 5: 解除綁定 (Unlink/Delete)
*   解除特定用戶: `DELETE https://api.line.me/v2/bot/user/{userId}/richmenu`。
*   刪除 Rich Menu: 需先解除 Default 設定與 Alias，再呼叫 Delete endpoint。

## 6. 進階應用場景 (Advanced Scenarios)

### 6.1 分頁切換 (Tab Switching)
透過 **Rich Menu Alias** 和 **Rich Menu Switch Action** 實現類似 App 的分頁切換效果。
*   **邏輯**: 建立多個 Rich Menu (如 Menu A 和 Menu B)，並為它們設定 Alias (如 `alias-a`, `alias-b`)。在 Menu A 的按鈕動作設定 `type: richmenuswitch` 並指定目標 `richMenuAliasId: alias-b`,。

### 6.2 多語系適配 (Localization)
根據用戶的手機語言顯示對應語言的 Rich Menu。
*   **邏輯**:
    1. 透過 Webhook (如 Follow Event) 取得 `userId`。
    2. 呼叫 Get Profile API (`/v2/bot/profile/{userId}`) 取得 `language` 屬性,。
    3. 根據語言 (如 `zh-TW`, `en`, `th`) 呼叫 Link Rich Menu API 將特定語言的 Rich Menu 綁定給該用戶。

## 7. JSON 數據結構範例 (JSON Examples)

### 範例 A: 標準 Rich Menu 物件 (Standard Rich Menu Object)
此範例展示一個包含三個點擊區域 (URI 跳轉) 的基本選單。

```json
{
  "size": {
    "width": 2500,
    "height": 1686
  },
  "selected": false,
  "name": "Default Menu Demo",
  "chatBarText": "Tap to open",
  "areas": [
    {
      "bounds": {
        "x": 0,
        "y": 0,
        "width": 1666,
        "height": 1686
      },
      "action": {
        "type": "uri",
        "label": "News",
        "uri": "https://developers.line.biz/en/news/"
      }
    },
    {
      "bounds": {
        "x": 1667,
        "y": 0,
        "width": 834,
        "height": 843
      },
      "action": {
        "type": "uri",
        "label": "Use Case",
        "uri": "https://lineapiusecase.com/"
      }
    },
    {
      "bounds": {
        "x": 1667,
        "y": 844,
        "width": 834,
        "height": 843
      },
      "action": {
        "type": "uri",
        "label": "Tech Blog",
        "uri": "https://techblog.lycorp.co.jp/"
      }
    }
  ]
}
```

### 範例 B: 帶有切換功能的選單 (Switch Action Rich Menu)
此範例展示如何設定切換到另一個選單 (需預先設定 Alias)。

```json
{
  "size": {
    "width": 2500,
    "height": 1686
  },
  "selected": true,
  "name": "Menu A",
  "chatBarText": "Open Menu",
  "areas": [
    {
      "bounds": {
        "x": 1251,
        "y": 0,
        "width": 1250,
        "height": 1686
      },
      "action": {
        "type": "richmenuswitch",
        "richMenuAliasId": "richmenu-alias-b",
        "data": "changed-to-b"
      }
    }
  ]
}
```

### 範例 C: Postback 與 Datetime Picker
展示互動性更高的動作設定,。

```json
{
   "bounds": { "x": 0, "y": 0, "width": 1250, "height": 843 },
   "action": {
      "type": "postback",
      "label": "Survey",
      "data": "action=survey&id=123",
      "displayText": "I want to take the survey"
   }
},
{
   "bounds": { "x": 0, "y": 843, "width": 1250, "height": 843 },
   "action": {
      "type": "datetimepicker",
      "label": "Select Date",
      "data": "storeId=12345",
      "mode": "datetime",
      "initial": "2023-12-25t00:00",
      "max": "2024-01-25t23:59",
      "min": "2023-12-25t00:00"
   }
}
```